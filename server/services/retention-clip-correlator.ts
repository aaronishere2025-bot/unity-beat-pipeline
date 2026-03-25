/**
 * Retention-Clip Correlator Service
 *
 * Cross-references YouTube retention data with:
 * 1. Which Kling clip was playing at each second
 * 2. What lyrics/audio was playing at that moment
 * 3. What visual content was in frame
 *
 * This creates a feedback loop to understand WHY viewers dropped off
 * and feed that back into the prompt optimizer.
 */

import { db } from '../db';
import { jobs as videoGenerationJobs, clipAccuracyReports, toxicCombos, ToxicCombo } from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';
import { audioVideoSyncService, ForcedAlignmentResult, LyricSpan } from './audio-video-sync-service';
import { kling25PromptOptimizer } from './kling25-prompt-optimizer';
import { styleBanditService } from './style-bandit-service';

// ============================================================================
// TYPES
// ============================================================================

export interface RetentionDataPoint {
  second: number;
  retention: number; // % of viewers still watching (0-100)
}

export interface DropOffEvent {
  second: number;
  dropPercentage: number; // How much retention dropped
  severity: 'critical' | 'major' | 'minor';
}

export interface ClipAtSecond {
  clipIndex: number;
  clipStartTime: number;
  clipEndTime: number;
  positionInClip: number; // How far into the clip (0-1)
  isClipTransition: boolean; // True if within 0.5s of a cut
}

export interface AudioAtSecond {
  lyricText: string;
  wordBeingSpoken?: string;
  isVocalMoment: boolean;
  isBeatDrop: boolean;
  energyLevel: 'low' | 'medium' | 'high' | 'peak';
}

export interface DropOffAnalysis {
  second: number;
  dropPercentage: number;
  severity: 'critical' | 'major' | 'minor';

  // What was happening at this moment
  clip: ClipAtSecond;
  audio: AudioAtSecond;

  // Context from previous clip (often the cause)
  previousClip?: {
    clipIndex: number;
    lastWords: string;
    wasTransition: boolean;
  };

  // Likely causes
  likelyCauses: string[];

  // Actionable fixes for prompt optimizer
  suggestedFixes: {
    category: string;
    fix: string;
    confidence: number;
  }[];
}

export interface RetentionCorrelationReport {
  videoId: string;
  packageId: string;
  totalDuration: number;
  averageRetention: number;

  // Key metrics
  first3SecondRetention: number;
  first60SecondRetention: number;

  // All drop-off events with full analysis
  dropOffs: DropOffAnalysis[];

  // Aggregated insights
  insights: {
    worstClip: { clipIndex: number; avgRetentionDrop: number } | null;
    bestClip: { clipIndex: number; avgRetentionDrop: number } | null;
    transitionDropOffs: number; // Count of drops near clip transitions
    vocalMomentDropOffs: number; // Count of drops during vocal moments
    lowEnergyDropOffs: number; // Count of drops during low energy
  };

  // Feed back to optimizer
  promptOptimizationSuggestions: {
    clipIndex: number;
    currentPromptStyle: string;
    suggestedEnhancements: string[];
    priority: 'high' | 'medium' | 'low';
  }[];

  // Thompson Sampling updates
  styleBanditUpdates: {
    styleName: string;
    alphaChange: number;
    betaChange: number;
    reason: string;
  }[];

  analyzedAt: Date;

  // Toxic combos detected
  toxicCombos: ToxicComboRecord[];
}

// Video metadata for full correlation analysis
export interface VideoMetadata {
  clips: {
    startTime: number;
    endTime: number;
    promptUsed: string;
    styleCategory: string; // e.g., "Viking-Realism"
    audioStyle: string; // e.g., "Phonk-Drift"
  }[];
}

// Toxic combo record
export interface ToxicComboRecord {
  styleCategory: string;
  audioStyle: string;
  dropPercentage: number;
  dropSecond: number;
  culpritSecond: number; // After reaction lag adjustment
  reason: string;
}

// Safety check result
export interface SafetyCheckResult {
  safe: boolean;
  toxicCombos: ToxicCombo[];
  reason?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CORRELATION_CONFIG = {
  CLIP_DURATION: 5, // Default Kling clip duration
  REACTION_LAG_SECONDS: 0.2, // Mental delay - viewers react ~0.2s after stimulus
  CRITICAL_DROP_THRESHOLD: 10, // >10% drop in single second = critical
  MAJOR_DROP_THRESHOLD: 5, // >5% drop = major
  TRANSITION_WINDOW: 0.5, // Seconds around a cut to consider "transition"
  MIN_DROP_TO_ANALYZE: 3, // Only analyze drops > 3%
};

// ============================================================================
// DROP-OFF CAUSE DETECTION
// ============================================================================

const DROP_OFF_CAUSES = {
  clip_transition_jarring: {
    pattern: (analysis: DropOffAnalysis) => analysis.clip.isClipTransition,
    message: 'Jarring clip transition - viewer lost',
    fix: 'Add motion blur transition, smoother camera handoff',
    category: 'transition',
  },
  low_energy_moment: {
    pattern: (analysis: DropOffAnalysis) => analysis.audio.energyLevel === 'low' && !analysis.audio.isVocalMoment,
    message: 'Low energy during non-vocal moment',
    fix: 'Add dynamic camera movement, inject visual interest',
    category: 'energy',
  },
  first_3_seconds: {
    pattern: (analysis: DropOffAnalysis) => analysis.second <= 3,
    message: 'Early hook failure - not grabbing attention',
    fix: 'Stronger visual nugget, in-media-res opening, pattern break',
    category: 'hook',
  },
  mid_video_lull: {
    pattern: (analysis: DropOffAnalysis) =>
      analysis.second >= 30 && analysis.second <= 90 && analysis.audio.energyLevel !== 'peak',
    message: 'Mid-video retention valley',
    fix: 'Add mid-video hook, camera change, new visual element',
    category: 'mid_hook',
  },
  vocal_visual_mismatch: {
    pattern: (analysis: DropOffAnalysis) => analysis.audio.isVocalMoment && analysis.clip.positionInClip > 0.8,
    message: 'Vocal moment near end of clip - potential lip sync issue',
    fix: 'Ensure vocal climax aligns with visual climax, not transition',
    category: 'sync',
  },
  static_shot_fatigue: {
    pattern: (analysis: DropOffAnalysis) =>
      analysis.clip.positionInClip > 0.7 && analysis.audio.energyLevel === 'medium',
    message: 'Static shot fatigue - been on same shot too long',
    fix: 'Shorter clip duration, more dynamic camera, add B-roll cut',
    category: 'pacing',
  },
};

// ============================================================================
// SERVICE
// ============================================================================

class RetentionClipCorrelator {
  /**
   * Correlate retention data with clip/audio information
   */
  async correlateRetention(
    videoId: string,
    packageId: string,
    retentionData: RetentionDataPoint[],
    options: {
      audioPath?: string;
      clipDuration?: number;
      forcedAlignment?: ForcedAlignmentResult;
      clipPrompts?: string[];
      metadata?: VideoMetadata; // For reaction lag analysis
    } = {},
  ): Promise<RetentionCorrelationReport> {
    console.log(`\n📊 [RetentionCorrelator] Analyzing retention for video ${videoId}`);
    console.log(`   📁 Package: ${packageId}`);
    console.log(`   📈 Retention data points: ${retentionData.length}`);

    const clipDuration = options.clipDuration || CORRELATION_CONFIG.CLIP_DURATION;
    const totalDuration = retentionData.length > 0 ? retentionData[retentionData.length - 1].second : 0;

    // Get forced alignment if audio path provided
    let alignment = options.forcedAlignment;
    let lyricSpans: LyricSpan[] = [];

    if (options.audioPath && !alignment) {
      try {
        alignment = await audioVideoSyncService.getForcedAlignment(options.audioPath);
      } catch (error) {
        console.warn(`   ⚠️ Could not get forced alignment: ${error}`);
      }
    }

    if (alignment) {
      lyricSpans = audioVideoSyncService.buildLyricSpans(alignment, clipDuration);
    }

    // Step 1: Detect drop-off events
    const dropOffs = this.detectDropOffs(retentionData);
    console.log(`   📉 Detected ${dropOffs.length} drop-off events`);

    // Step 2: Analyze each drop-off
    const analyzedDropOffs: DropOffAnalysis[] = [];

    for (const dropOff of dropOffs) {
      const analysis = this.analyzeDropOff(dropOff, clipDuration, lyricSpans, alignment);
      analyzedDropOffs.push(analysis);
    }

    // Step 3: Calculate aggregated insights
    const insights = this.calculateInsights(analyzedDropOffs, clipDuration, totalDuration);

    // Step 4: Generate prompt optimization suggestions
    const promptSuggestions = this.generatePromptSuggestions(analyzedDropOffs, options.clipPrompts);

    // Step 5: Calculate style bandit updates
    const styleBanditUpdates = this.calculateStyleBanditUpdates(analyzedDropOffs);

    // Step 6: Calculate key metrics
    const first3Second = retentionData.filter((d) => d.second <= 3);
    const first60Second = retentionData.filter((d) => d.second <= 60);
    const avgRetention = retentionData.reduce((sum, d) => sum + d.retention, 0) / retentionData.length;

    // Step 7: If metadata provided, run reaction lag analysis for toxic combos
    let detectedToxicCombos: ToxicComboRecord[] = [];
    if (options.metadata && options.metadata.clips.length > 0) {
      try {
        detectedToxicCombos = await this.analyzeDropOffsWithReactionLag(videoId, retentionData, options.metadata);
      } catch (error) {
        console.warn(`   ⚠️ Reaction lag analysis failed: ${error}`);
      }
    }

    const report: RetentionCorrelationReport = {
      videoId,
      packageId,
      totalDuration,
      averageRetention: Math.round(avgRetention * 10) / 10,
      first3SecondRetention: first3Second.length > 0 ? first3Second[first3Second.length - 1].retention : 100,
      first60SecondRetention: first60Second.length > 0 ? first60Second[first60Second.length - 1].retention : 100,
      dropOffs: analyzedDropOffs,
      insights,
      promptOptimizationSuggestions: promptSuggestions,
      styleBanditUpdates,
      toxicCombos: detectedToxicCombos,
      analyzedAt: new Date(),
    };

    // Log summary
    console.log(`\n📊 [RetentionCorrelator] Analysis Summary:`);
    console.log(`   📈 Average Retention: ${report.averageRetention}%`);
    console.log(`   🎯 First 3s Retention: ${report.first3SecondRetention}%`);
    console.log(`   📉 Drop-offs analyzed: ${analyzedDropOffs.length}`);
    console.log(`   💡 Prompt suggestions: ${promptSuggestions.length}`);
    console.log(`   🎰 Style bandit updates: ${styleBanditUpdates.length}`);

    if (insights.worstClip) {
      console.log(
        `   ⚠️ Worst clip: #${insights.worstClip.clipIndex} (avg ${insights.worstClip.avgRetentionDrop.toFixed(1)}% drop)`,
      );
    }

    return report;
  }

  /**
   * Detect drop-off events from retention curve
   */
  private detectDropOffs(retentionData: RetentionDataPoint[]): DropOffEvent[] {
    const dropOffs: DropOffEvent[] = [];

    for (let i = 1; i < retentionData.length; i++) {
      const prev = retentionData[i - 1];
      const curr = retentionData[i];
      const drop = prev.retention - curr.retention;

      if (drop >= CORRELATION_CONFIG.MIN_DROP_TO_ANALYZE) {
        let severity: 'critical' | 'major' | 'minor' = 'minor';
        if (drop >= CORRELATION_CONFIG.CRITICAL_DROP_THRESHOLD) {
          severity = 'critical';
        } else if (drop >= CORRELATION_CONFIG.MAJOR_DROP_THRESHOLD) {
          severity = 'major';
        }

        dropOffs.push({
          second: curr.second,
          dropPercentage: Math.round(drop * 10) / 10,
          severity,
        });
      }
    }

    return dropOffs;
  }

  /**
   * Get clip information at a specific second
   */
  private getClipAtSecond(second: number, clipDuration: number): ClipAtSecond {
    const clipIndex = Math.floor(second / clipDuration);
    const clipStartTime = clipIndex * clipDuration;
    const clipEndTime = (clipIndex + 1) * clipDuration;
    const positionInClip = (second - clipStartTime) / clipDuration;

    // Check if near a transition
    const distanceToStart = second - clipStartTime;
    const distanceToEnd = clipEndTime - second;
    const isClipTransition =
      distanceToStart < CORRELATION_CONFIG.TRANSITION_WINDOW || distanceToEnd < CORRELATION_CONFIG.TRANSITION_WINDOW;

    return {
      clipIndex,
      clipStartTime,
      clipEndTime,
      positionInClip,
      isClipTransition,
    };
  }

  /**
   * Get audio information at a specific second
   */
  private getAudioAtSecond(second: number, lyricSpans: LyricSpan[], alignment?: ForcedAlignmentResult): AudioAtSecond {
    // Find the lyric span for this second
    const span = lyricSpans.find((s) => second >= s.startTime && second < s.endTime);

    // Find the specific word being spoken
    let wordBeingSpoken: string | undefined;
    if (alignment) {
      const word = alignment.words.find((w) => second >= w.start && second < w.end);
      wordBeingSpoken = word?.word;
    }

    const hasWords = span ? span.words.length > 0 : false;

    // Estimate energy level (would be better from actual audio analysis)
    let energyLevel: 'low' | 'medium' | 'high' | 'peak' = 'medium';
    if (span && span.words.length > 5) {
      energyLevel = 'high';
    } else if (!span || span.words.length === 0) {
      energyLevel = 'low';
    }

    return {
      lyricText: span?.lyricText || '',
      wordBeingSpoken,
      isVocalMoment: hasWords,
      isBeatDrop: false, // Would need beat analysis
      energyLevel,
    };
  }

  /**
   * Analyze a single drop-off event
   */
  private analyzeDropOff(
    dropOff: DropOffEvent,
    clipDuration: number,
    lyricSpans: LyricSpan[],
    alignment?: ForcedAlignmentResult,
  ): DropOffAnalysis {
    const clip = this.getClipAtSecond(dropOff.second, clipDuration);
    const audio = this.getAudioAtSecond(dropOff.second, lyricSpans, alignment);

    // Get previous clip context
    let previousClip: DropOffAnalysis['previousClip'];
    if (clip.clipIndex > 0 && clip.positionInClip < 0.2) {
      const prevSpan = lyricSpans[clip.clipIndex - 1];
      previousClip = {
        clipIndex: clip.clipIndex - 1,
        lastWords: prevSpan?.lyricText.split(' ').slice(-5).join(' ') || '',
        wasTransition: true,
      };
    }

    // Detect likely causes
    const analysis: DropOffAnalysis = {
      second: dropOff.second,
      dropPercentage: dropOff.dropPercentage,
      severity: dropOff.severity,
      clip,
      audio,
      previousClip,
      likelyCauses: [],
      suggestedFixes: [],
    };

    // Check each cause pattern
    for (const [causeKey, cause] of Object.entries(DROP_OFF_CAUSES)) {
      if (cause.pattern(analysis)) {
        analysis.likelyCauses.push(cause.message);
        analysis.suggestedFixes.push({
          category: cause.category,
          fix: cause.fix,
          confidence: dropOff.severity === 'critical' ? 0.9 : dropOff.severity === 'major' ? 0.7 : 0.5,
        });
      }
    }

    // If no specific cause found, add generic
    if (analysis.likelyCauses.length === 0) {
      analysis.likelyCauses.push('Unknown cause - requires manual review');
      analysis.suggestedFixes.push({
        category: 'general',
        fix: 'Review clip content and pacing',
        confidence: 0.3,
      });
    }

    return analysis;
  }

  /**
   * Calculate aggregated insights from all drop-offs
   */
  private calculateInsights(
    dropOffs: DropOffAnalysis[],
    clipDuration: number,
    totalDuration: number,
  ): RetentionCorrelationReport['insights'] {
    // Group drops by clip
    const clipDrops = new Map<number, number[]>();
    for (const drop of dropOffs) {
      const existing = clipDrops.get(drop.clip.clipIndex) || [];
      existing.push(drop.dropPercentage);
      clipDrops.set(drop.clip.clipIndex, existing);
    }

    // Find worst and best clips
    let worstClip: { clipIndex: number; avgRetentionDrop: number } | null = null;
    let bestClip: { clipIndex: number; avgRetentionDrop: number } | null = null;
    let worstAvg = 0;
    let bestAvg = Infinity;

    for (const [clipIndex, drops] of clipDrops.entries()) {
      const avg = drops.reduce((sum, d) => sum + d, 0) / drops.length;
      if (avg > worstAvg) {
        worstAvg = avg;
        worstClip = { clipIndex, avgRetentionDrop: avg };
      }
      if (avg < bestAvg) {
        bestAvg = avg;
        bestClip = { clipIndex, avgRetentionDrop: avg };
      }
    }

    // Count by cause type
    const transitionDropOffs = dropOffs.filter((d) => d.clip.isClipTransition).length;
    const vocalMomentDropOffs = dropOffs.filter((d) => d.audio.isVocalMoment).length;
    const lowEnergyDropOffs = dropOffs.filter((d) => d.audio.energyLevel === 'low').length;

    return {
      worstClip,
      bestClip,
      transitionDropOffs,
      vocalMomentDropOffs,
      lowEnergyDropOffs,
    };
  }

  /**
   * Generate prompt optimization suggestions
   */
  private generatePromptSuggestions(
    dropOffs: DropOffAnalysis[],
    clipPrompts?: string[],
  ): RetentionCorrelationReport['promptOptimizationSuggestions'] {
    const suggestions: RetentionCorrelationReport['promptOptimizationSuggestions'] = [];

    // Group by clip
    const clipIssues = new Map<number, DropOffAnalysis[]>();
    for (const drop of dropOffs) {
      const existing = clipIssues.get(drop.clip.clipIndex) || [];
      existing.push(drop);
      clipIssues.set(drop.clip.clipIndex, existing);
    }

    for (const [clipIndex, issues] of clipIssues.entries()) {
      const hasCritical = issues.some((i) => i.severity === 'critical');
      const hasMajor = issues.some((i) => i.severity === 'major');

      // Collect all suggested fixes for this clip
      const enhancements: string[] = [];
      for (const issue of issues) {
        for (const fix of issue.suggestedFixes) {
          if (!enhancements.includes(fix.fix)) {
            enhancements.push(fix.fix);
          }
        }
      }

      suggestions.push({
        clipIndex,
        currentPromptStyle: clipPrompts?.[clipIndex] || 'unknown',
        suggestedEnhancements: enhancements.slice(0, 5),
        priority: hasCritical ? 'high' : hasMajor ? 'medium' : 'low',
      });
    }

    return suggestions.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Calculate Thompson Sampling / StyleBandit updates
   */
  private calculateStyleBanditUpdates(dropOffs: DropOffAnalysis[]): RetentionCorrelationReport['styleBanditUpdates'] {
    const updates: RetentionCorrelationReport['styleBanditUpdates'] = [];

    // Check for hook-related issues (first 3 seconds)
    const hookIssues = dropOffs.filter((d) => d.second <= 3);
    if (hookIssues.length > 0) {
      const totalDrop = hookIssues.reduce((sum, d) => sum + d.dropPercentage, 0);
      updates.push({
        styleName: 'hook',
        alphaChange: 0,
        betaChange: Math.min(3, totalDrop / 5), // Penalize based on drop severity
        reason: `Hook failed: ${totalDrop.toFixed(1)}% total drop in first 3 seconds`,
      });
    }

    // Check for transition issues
    const transitionIssues = dropOffs.filter((d) => d.clip.isClipTransition);
    if (transitionIssues.length > 2) {
      updates.push({
        styleName: 'transitions',
        alphaChange: 0,
        betaChange: 2.0,
        reason: `${transitionIssues.length} drops at clip transitions`,
      });
    }

    // Check for pacing issues (multiple drops in same clip)
    const clipDropCounts = new Map<number, number>();
    for (const drop of dropOffs) {
      clipDropCounts.set(drop.clip.clipIndex, (clipDropCounts.get(drop.clip.clipIndex) || 0) + 1);
    }

    for (const [clipIndex, count] of clipDropCounts.entries()) {
      if (count >= 2) {
        updates.push({
          styleName: 'pacing',
          alphaChange: 0,
          betaChange: 1.5,
          reason: `Clip ${clipIndex} had ${count} drop-off events`,
        });
      }
    }

    return updates;
  }

  /**
   * Apply style bandit updates from retention analysis
   */
  async applyStyleBanditUpdates(updates: RetentionCorrelationReport['styleBanditUpdates']): Promise<void> {
    for (const update of updates) {
      try {
        await styleBanditService.recordRetentionFeedback(
          update.styleName,
          update.alphaChange,
          update.betaChange,
          update.reason,
        );
        console.log(`   🎰 StyleBandit: ${update.styleName} β+${update.betaChange} (${update.reason})`);
      } catch (error) {
        console.warn(`   ⚠️ Could not update style bandit: ${error}`);
      }
    }
  }

  /**
   * Feed learnings back into the prompt optimizer
   */
  feedbackToPromptOptimizer(clipIndex: number, suggestions: string[], category: string): void {
    // Extract winning keywords from suggestions to lock as anti-patterns
    const antiPatterns = suggestions
      .map((s) => {
        // Convert fix suggestions into negative prompt additions
        if (s.includes('motion blur')) return 'avoid_abrupt_cuts';
        if (s.includes('dynamic camera')) return 'static_shot_penalty';
        if (s.includes('visual nugget')) return 'weak_hook_penalty';
        return null;
      })
      .filter(Boolean);

    if (antiPatterns.length > 0) {
      console.log(`   📋 [PromptOptimizer] Clip ${clipIndex}: Learning anti-patterns: ${antiPatterns.join(', ')}`);
    }
  }

  // ============================================================================
  // REACTION LAG THEORY: Post-Mortem Analysis
  // Viewers don't leave exactly when bored - they react ~0.2 seconds later
  // ============================================================================

  /**
   * Analyze drop-offs with reaction lag and punish guilty clips
   * Returns toxic combos for Pre-Crime Validator
   */
  async analyzeDropOffsWithReactionLag(
    videoId: string,
    retentionData: RetentionDataPoint[],
    metadata: VideoMetadata,
  ): Promise<ToxicComboRecord[]> {
    console.log(
      `\n🎯 [ReactionLag] Analyzing ${videoId} with ${CORRELATION_CONFIG.REACTION_LAG_SECONDS}s lag adjustment`,
    );

    const drops = this.detectSignificantDropsV2(retentionData);
    const toxicCombos: ToxicComboRecord[] = [];

    for (const drop of drops) {
      // 1. Rewind time to find the actual 'Stimulus'
      const culpritTime = Math.max(0, drop.second - CORRELATION_CONFIG.REACTION_LAG_SECONDS);

      // 2. Identify the specific clip playing at that moment
      const badClip = metadata.clips.find((c) => culpritTime >= c.startTime && culpritTime < c.endTime);

      if (badClip) {
        console.log(`   📉 Drop at ${drop.second}s caused by clip at ${culpritTime}s (${badClip.styleCategory})`);

        // 3. PUNISH the Style Bandit immediately
        await styleBanditService.recordRetentionFeedback(
          badClip.styleCategory,
          0,
          2.0, // +2.0 Beta penalty
          `Drop at ${drop.second}s (${drop.dropPercentage.toFixed(1)}% loss)`,
        );

        // 4. Record 'Toxic Knowledge' for future pre-checks
        const toxicRecord: ToxicComboRecord = {
          styleCategory: badClip.styleCategory,
          audioStyle: badClip.audioStyle,
          dropPercentage: drop.dropPercentage,
          dropSecond: drop.second,
          culpritSecond: culpritTime,
          reason: `Caused ${drop.dropPercentage.toFixed(1)}% retention drop`,
        };

        toxicCombos.push(toxicRecord);

        // 5. Save to database
        await this.saveToxicCombo(videoId, toxicRecord);
      }
    }

    console.log(`   🧪 Detected ${toxicCombos.length} toxic combos`);
    return toxicCombos;
  }

  /**
   * Detect significant drops with 2-second sliding window (>5% drop)
   */
  private detectSignificantDropsV2(data: RetentionDataPoint[]): DropOffEvent[] {
    const drops: DropOffEvent[] = [];

    for (let i = 2; i < data.length; i++) {
      const prev = data[i - 2].retention;
      const curr = data[i].retention;
      const drop = prev - curr;

      // If we lost more than 5% of the audience in 2 seconds
      if (drop > 5) {
        let severity: 'critical' | 'major' | 'minor' = 'minor';
        if (drop >= CORRELATION_CONFIG.CRITICAL_DROP_THRESHOLD) {
          severity = 'critical';
        } else if (drop >= CORRELATION_CONFIG.MAJOR_DROP_THRESHOLD) {
          severity = 'major';
        }

        drops.push({
          second: data[i].second,
          dropPercentage: drop,
          severity,
        });
      }
    }

    return drops;
  }

  // ============================================================================
  // PRE-CRIME VALIDATOR: Toxic Knowledge Database
  // Block style+audio combos that historically caused viewer drop-offs
  // ============================================================================

  /**
   * Save toxic combo to database
   */
  private async saveToxicCombo(videoId: string, record: ToxicComboRecord): Promise<void> {
    try {
      // Check if this combo already exists
      const existing = await db
        .select()
        .from(toxicCombos)
        .where(and(eq(toxicCombos.styleCategory, record.styleCategory), eq(toxicCombos.audioStyle, record.audioStyle)))
        .limit(1);

      if (existing.length > 0) {
        // Update existing record
        const current = existing[0];
        const newDropCount = (current.dropCount || 0) + 1;
        const newTotalDrop = (current.totalDropPercentage || 0) + record.dropPercentage;

        await db
          .update(toxicCombos)
          .set({
            dropCount: newDropCount,
            totalDropPercentage: newTotalDrop,
            avgDropPercentage: newTotalDrop / newDropCount,
            sourceVideoIds: [...(current.sourceVideoIds || []), videoId],
            dropSecondsSamples: [...(current.dropSecondsSamples || []), Math.round(record.dropSecond)],
            severity: newDropCount >= 3 ? 'critical' : newDropCount >= 2 ? 'major' : 'minor',
            isBanned: newDropCount >= 3, // Auto-ban after 3 incidents
            banReason: newDropCount >= 3 ? `Auto-banned after ${newDropCount} drop-off incidents` : null,
            lastDetectedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(toxicCombos.id, current.id));

        console.log(
          `   🧪 Updated toxic combo: ${record.styleCategory}+${record.audioStyle} (${newDropCount} incidents)`,
        );
      } else {
        // Create new record
        await db.insert(toxicCombos).values({
          styleCategory: record.styleCategory,
          audioStyle: record.audioStyle,
          dropCount: 1,
          totalDropPercentage: record.dropPercentage,
          avgDropPercentage: record.dropPercentage,
          sourceVideoIds: [videoId],
          dropSecondsSamples: [Math.round(record.dropSecond)],
          severity: 'minor',
          isBanned: false,
        });

        console.log(`   🧪 New toxic combo: ${record.styleCategory}+${record.audioStyle}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed to save toxic combo:`, error);
    }
  }

  /**
   * PRE-CRIME CHECK: Is this style+audio combo safe to use?
   * Call this BEFORE generating a new video
   */
  async checkSafety(styleCategory: string, audioStyle: string): Promise<SafetyCheckResult> {
    try {
      // Check if this exact combo is banned
      const exactMatch = await db
        .select()
        .from(toxicCombos)
        .where(and(eq(toxicCombos.styleCategory, styleCategory), eq(toxicCombos.audioStyle, audioStyle)))
        .limit(1);

      if (exactMatch.length > 0 && exactMatch[0].isBanned) {
        return {
          safe: false,
          toxicCombos: exactMatch,
          reason: `BLOCKED: "${styleCategory}" + "${audioStyle}" combo caused ${exactMatch[0].dropCount} historical drop-offs (avg ${exactMatch[0].avgDropPercentage?.toFixed(1)}% loss)`,
        };
      }

      // Check if the style alone has too many issues
      const styleIssues = await db
        .select()
        .from(toxicCombos)
        .where(and(eq(toxicCombos.styleCategory, styleCategory), eq(toxicCombos.isBanned, true)));

      if (styleIssues.length >= 2) {
        return {
          safe: false,
          toxicCombos: styleIssues,
          reason: `WARNING: "${styleCategory}" style has ${styleIssues.length} banned audio combinations - consider a different style`,
        };
      }

      // Check if audio alone has too many issues
      const audioIssues = await db
        .select()
        .from(toxicCombos)
        .where(and(eq(toxicCombos.audioStyle, audioStyle), eq(toxicCombos.isBanned, true)));

      if (audioIssues.length >= 2) {
        return {
          safe: false,
          toxicCombos: audioIssues,
          reason: `WARNING: "${audioStyle}" audio has ${audioIssues.length} banned style combinations - consider a different audio style`,
        };
      }

      // All clear
      return { safe: true, toxicCombos: [] };
    } catch (error) {
      console.error(`Safety check error:`, error);
      // Default to safe if check fails
      return { safe: true, toxicCombos: [] };
    }
  }

  /**
   * Get all currently banned combos
   */
  async getBannedCombos(): Promise<ToxicCombo[]> {
    return await db.select().from(toxicCombos).where(eq(toxicCombos.isBanned, true));
  }

  /**
   * Get toxic combo statistics
   */
  async getToxicStats(): Promise<{
    totalCombos: number;
    bannedCombos: number;
    topOffenders: ToxicCombo[];
  }> {
    const all = await db.select().from(toxicCombos);
    const banned = all.filter((c) => c.isBanned);
    const topOffenders = [...all].sort((a, b) => (b.avgDropPercentage || 0) - (a.avgDropPercentage || 0)).slice(0, 10);

    return {
      totalCombos: all.length,
      bannedCombos: banned.length,
      topOffenders,
    };
  }

  /**
   * Decay toxic combos over time (call weekly)
   * Allows recovery if video quality improves
   */
  async applyToxicDecay(decayFactor: number = 0.9): Promise<number> {
    const all = await db.select().from(toxicCombos);
    let updated = 0;

    for (const combo of all) {
      const newDecay = (combo.decayFactor || 1.0) * decayFactor;
      const effectiveDrops = Math.floor((combo.dropCount || 1) * newDecay);

      // If effective drops fall below threshold, unban
      if (effectiveDrops < 3 && combo.isBanned) {
        await db
          .update(toxicCombos)
          .set({
            decayFactor: newDecay,
            isBanned: false,
            banReason: null,
            updatedAt: new Date(),
          })
          .where(eq(toxicCombos.id, combo.id));

        console.log(`   ♻️ Unbanned ${combo.styleCategory}+${combo.audioStyle} due to decay`);
        updated++;
      } else {
        await db
          .update(toxicCombos)
          .set({ decayFactor: newDecay, updatedAt: new Date() })
          .where(eq(toxicCombos.id, combo.id));
      }
    }

    return updated;
  }
}

export const retentionClipCorrelator = new RetentionClipCorrelator();
