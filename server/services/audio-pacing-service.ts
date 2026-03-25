/**
 * AUDIO PACING INTELLIGENCE SERVICE
 *
 * Analyzes audio features (BPM, beat drops, energy curves) using librosa
 * and correlates them with YouTube retention data to learn which audio
 * patterns drive highest engagement.
 *
 * Uses Thompson Sampling to:
 * - Track which BPM ranges perform best
 * - Learn optimal timing for first beat drop
 * - Identify energy patterns that correlate with retention
 * - Generate prompt guidance for music generation
 *
 * Key insight: Early audio engagement (beat drop before 4s) is critical
 * for YouTube Shorts retention.
 */

import { db } from '../db';
import { audioRetentionCorrelations, audioPatternStats, detailedVideoMetrics } from '@shared/schema';
import { eq, and, desc, sql, gte, lte } from 'drizzle-orm';
import { audioAnalysisService, AudioAnalysis } from './audio-analysis-service';

// ============================================================================
// INTERFACES
// ============================================================================

export interface AudioPacingAnalysis {
  bpm: number;
  duration: number;

  // Beat drop analysis
  beatDropTimestamps: number[]; // Significant tempo/energy changes
  firstBeatDropSecond: number | null; // Critical for hook retention

  // Energy analysis
  energyPeakTimestamps: number[]; // High energy moments
  firstEnergyPeakSecond: number | null;
  averageEnergy: number; // 0-1 scale
  energyVariance: number; // How dynamic the track is
  introEnergy: number; // Energy in first 3 seconds
  energyRampTime: number | null; // Seconds until 80% max energy
  dynamicRange: number; // Max - min energy

  // Beat density
  beatDensityFirst5s: number; // Beats per second in first 5s

  // Pattern classification
  patternCategory: 'fast_drop' | 'slow_build' | 'steady_high' | 'steady_low' | 'dynamic';
}

export interface RetentionCorrelation {
  retentionAt3s: number;
  retentionAt8s: number;
  retentionAt15s: number;
  retentionAt30s: number;
  avgRetention: number;

  // Insights
  dropOffPoints: number[]; // Timestamps where retention drops significantly
  correlatedAudioEvents: Array<{
    timestamp: number;
    audioEvent: string; // 'beat_drop', 'energy_peak', 'energy_dip'
    retentionChange: number; // +/- percentage change
  }>;
}

export interface AudioPatternGuidance {
  recommendations: string[];
  bpmRange: { min: number; max: number; explanation: string };
  firstDropTiming: { target: number; explanation: string };
  introEnergy: { target: string; explanation: string };
  promptInjection: string; // Direct guidance for Suno prompts
}

// ============================================================================
// PATTERN DEFINITIONS FOR THOMPSON SAMPLING
// ============================================================================

const PATTERN_DEFINITIONS = {
  bpm_range: [
    { id: 'slow', min: 0, max: 89, label: 'Slow (<90 BPM)' },
    { id: 'moderate', min: 90, max: 119, label: 'Moderate (90-120 BPM)' },
    { id: 'upbeat', min: 120, max: 139, label: 'Upbeat (120-140 BPM)' },
    { id: 'fast', min: 140, max: 999, label: 'Fast (>140 BPM)' },
  ],
  first_drop_timing: [
    { id: 'instant', min: 0, max: 2, label: 'Instant (0-2s)' },
    { id: 'early', min: 2, max: 4, label: 'Early (2-4s)' },
    { id: 'normal', min: 4, max: 8, label: 'Normal (4-8s)' },
    { id: 'late', min: 8, max: 999, label: 'Late (>8s)' },
  ],
  intro_energy: [
    { id: 'low', min: 0, max: 0.3, label: 'Low Energy Intro' },
    { id: 'medium', min: 0.3, max: 0.6, label: 'Medium Energy Intro' },
    { id: 'high', min: 0.6, max: 0.8, label: 'High Energy Intro' },
    { id: 'explosive', min: 0.8, max: 1, label: 'Explosive Intro' },
  ],
  energy_variance: [
    { id: 'steady', min: 0, max: 0.1, label: 'Steady/Consistent' },
    { id: 'moderate_dynamic', min: 0.1, max: 0.2, label: 'Moderately Dynamic' },
    { id: 'dynamic', min: 0.2, max: 0.3, label: 'Dynamic' },
    { id: 'highly_dynamic', min: 0.3, max: 1, label: 'Highly Dynamic' },
  ],
};

// ============================================================================
// AUDIO PACING SERVICE CLASS
// ============================================================================

class AudioPacingService {
  /**
   * Analyze audio file for pacing characteristics
   * Uses existing audio-analysis-service for librosa analysis
   */
  async analyzeAudioPacing(audioPath: string): Promise<AudioPacingAnalysis> {
    console.log('🎵 AUDIO PACING: Analyzing audio for retention optimization...');
    console.log(`   File: ${audioPath}`);

    const result = await audioAnalysisService.analyzeAudio(audioPath);

    if (!result.success || !result.analysis) {
      throw new Error(`Audio analysis failed: ${result.error || 'Unknown error'}`);
    }

    const analysis = result.analysis;

    const beatDropTimestamps = this.detectBeatDrops(analysis);
    const energyPeakTimestamps = this.extractEnergyPeaks(analysis);
    const introEnergy = this.calculateIntroEnergy(analysis);
    const energyRampTime = this.calculateEnergyRampTime(analysis);
    const beatDensityFirst5s = this.calculateBeatDensityFirst5s(analysis);
    const dynamicRange = analysis.energyRange ? analysis.energyRange.max - analysis.energyRange.min : 0;

    const energyVariance = this.calculateEnergyVariance(analysis);
    const patternCategory = this.classifyPattern(
      analysis.bpm,
      beatDropTimestamps[0] || null,
      introEnergy,
      energyVariance,
    );

    const pacingAnalysis: AudioPacingAnalysis = {
      bpm: analysis.bpm,
      duration: analysis.duration,

      beatDropTimestamps,
      firstBeatDropSecond: beatDropTimestamps[0] || null,

      energyPeakTimestamps,
      firstEnergyPeakSecond: energyPeakTimestamps[0] || null,
      averageEnergy: analysis.averageEnergy || 0.5,
      energyVariance,
      introEnergy,
      energyRampTime,
      dynamicRange,

      beatDensityFirst5s,
      patternCategory,
    };

    console.log('✅ AUDIO PACING: Analysis complete');
    console.log(`   BPM: ${pacingAnalysis.bpm}`);
    console.log(`   First beat drop: ${pacingAnalysis.firstBeatDropSecond?.toFixed(2) || 'N/A'}s`);
    console.log(`   Intro energy: ${(pacingAnalysis.introEnergy * 100).toFixed(0)}%`);
    console.log(`   Pattern: ${pacingAnalysis.patternCategory}`);
    console.log(`   Beat drops: ${beatDropTimestamps.length}, Energy peaks: ${energyPeakTimestamps.length}`);

    return pacingAnalysis;
  }

  /**
   * Detect beat drops (significant tempo or energy changes)
   * Beat drops are moments where energy suddenly increases
   */
  private detectBeatDrops(analysis: AudioAnalysis): number[] {
    const drops: number[] = [];

    if (!analysis.energySamples || analysis.energySamples.length < 2) {
      return drops;
    }

    const samples = analysis.energySamples;
    const threshold = 0.15;

    for (let i = 1; i < samples.length; i++) {
      const energyJump = samples[i].energy - samples[i - 1].energy;

      if (energyJump > threshold) {
        drops.push(samples[i].time);
      }
    }

    if (analysis.sections) {
      for (const section of analysis.sections) {
        if (section.type === 'chorus' || section.type === 'drop') {
          if (!drops.some((d) => Math.abs(d - section.startTime) < 1)) {
            drops.push(section.startTime);
          }
        }
      }
    }

    return drops.sort((a, b) => a - b);
  }

  /**
   * Extract energy peak timestamps from analysis
   */
  private extractEnergyPeaks(analysis: AudioAnalysis): number[] {
    if (analysis.peaks && analysis.peaks.length > 0) {
      return analysis.peaks.map((p) => p.time).sort((a, b) => a - b);
    }

    if (!analysis.energySamples || analysis.energySamples.length < 3) {
      return [];
    }

    const peaks: number[] = [];
    const samples = analysis.energySamples;
    const avgEnergy = analysis.averageEnergy || 0.5;

    for (let i = 1; i < samples.length - 1; i++) {
      const prev = samples[i - 1].energy;
      const curr = samples[i].energy;
      const next = samples[i + 1].energy;

      if (curr > prev && curr > next && curr > avgEnergy + 0.1) {
        peaks.push(samples[i].time);
      }
    }

    return peaks;
  }

  /**
   * Calculate average energy in first 3 seconds (hook energy)
   */
  private calculateIntroEnergy(analysis: AudioAnalysis): number {
    if (!analysis.energySamples) {
      return analysis.averageEnergy || 0.5;
    }

    const introSamples = analysis.energySamples.filter((s) => s.time <= 3);
    if (introSamples.length === 0) return analysis.averageEnergy || 0.5;

    const sum = introSamples.reduce((acc, s) => acc + s.energy, 0);
    return sum / introSamples.length;
  }

  /**
   * Calculate time until energy reaches 80% of maximum
   */
  private calculateEnergyRampTime(analysis: AudioAnalysis): number | null {
    if (!analysis.energySamples || !analysis.energyRange) {
      return null;
    }

    const threshold = analysis.energyRange.max * 0.8;

    for (const sample of analysis.energySamples) {
      if (sample.energy >= threshold) {
        return sample.time;
      }
    }

    return null;
  }

  /**
   * Calculate beat density in first 5 seconds
   */
  private calculateBeatDensityFirst5s(analysis: AudioAnalysis): number {
    if (!analysis.beats || analysis.beats.length === 0) {
      return analysis.bpm / 60;
    }

    const beatsIn5s = analysis.beats.filter((b) => b <= 5);
    return beatsIn5s.length / 5;
  }

  /**
   * Calculate energy variance (how dynamic the track is)
   */
  private calculateEnergyVariance(analysis: AudioAnalysis): number {
    if (!analysis.energySamples || analysis.energySamples.length < 2) {
      return 0.1;
    }

    const energies = analysis.energySamples.map((s) => s.energy);
    const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
    const squaredDiffs = energies.map((e) => Math.pow(e - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / energies.length;

    return Math.sqrt(variance);
  }

  /**
   * Classify audio pattern for Thompson Sampling
   */
  private classifyPattern(
    bpm: number,
    firstDrop: number | null,
    introEnergy: number,
    energyVariance: number,
  ): AudioPacingAnalysis['patternCategory'] {
    if (introEnergy > 0.7 && (firstDrop === null || firstDrop < 3)) {
      return 'fast_drop';
    }

    if (introEnergy < 0.3 && firstDrop !== null && firstDrop > 6) {
      return 'slow_build';
    }

    if (energyVariance < 0.1 && introEnergy > 0.5) {
      return 'steady_high';
    }

    if (energyVariance < 0.1 && introEnergy <= 0.5) {
      return 'steady_low';
    }

    return 'dynamic';
  }

  /**
   * Store audio analysis in database for correlation learning
   */
  async storeAudioAnalysis(videoId: string | null, packageId: string, analysis: AudioPacingAnalysis): Promise<string> {
    console.log(`📊 AUDIO PACING: Storing analysis for package ${packageId}`);

    const [result] = await db
      .insert(audioRetentionCorrelations)
      .values({
        videoId,
        packageId,
        bpm: analysis.bpm,
        beatDropTimestamps: JSON.stringify(analysis.beatDropTimestamps),
        energyPeakTimestamps: JSON.stringify(analysis.energyPeakTimestamps),
        firstBeatDropSecond: analysis.firstBeatDropSecond,
        averageEnergy: analysis.averageEnergy,
        energyVariance: analysis.energyVariance,
        firstEnergyPeakSecond: analysis.firstEnergyPeakSecond,
        introEnergy: analysis.introEnergy,
        energyRampTime: analysis.energyRampTime,
        beatDensityFirst5s: analysis.beatDensityFirst5s,
        dynamicRange: analysis.dynamicRange,
        patternCategory: analysis.patternCategory,
      })
      .returning({ id: audioRetentionCorrelations.id });

    console.log(`   Stored with ID: ${result.id}`);
    return result.id;
  }

  /**
   * Correlate audio events with retention curve
   * Called after metrics harvesting provides retention data
   */
  async correlateWithRetention(
    videoId: string,
    retentionData: {
      retentionAt3s?: number;
      retentionAt8s?: number;
      retentionAt15s?: number;
      retentionAt30s?: number;
      avgRetention?: number;
      retentionCurve?: number[];
      views?: number;
      ctr?: number;
      avgViewDuration?: number;
    },
  ): Promise<void> {
    console.log(`🔗 AUDIO PACING: Correlating retention data for video ${videoId}`);

    const existing = await db
      .select()
      .from(audioRetentionCorrelations)
      .where(eq(audioRetentionCorrelations.videoId, videoId))
      .limit(1);

    if (existing.length === 0) {
      console.log(`   ⚠️ No audio analysis found for video ${videoId}`);
      return;
    }

    const record = existing[0];

    const performanceScore = this.calculatePerformanceScore(
      retentionData.ctr || 0,
      retentionData.avgViewDuration || 0,
      retentionData.views || 0,
    );

    const isSuccess =
      (retentionData.views || 0) >= 500 && ((retentionData.ctr || 0) > 8 || (retentionData.avgRetention || 0) > 40);

    await db
      .update(audioRetentionCorrelations)
      .set({
        retentionAt3s: retentionData.retentionAt3s,
        retentionAt8s: retentionData.retentionAt8s,
        retentionAt15s: retentionData.retentionAt15s,
        retentionAt30s: retentionData.retentionAt30s,
        avgRetention: retentionData.avgRetention,
        retentionCurve: retentionData.retentionCurve ? JSON.stringify(retentionData.retentionCurve) : null,
        views: retentionData.views,
        ctr: retentionData.ctr,
        avgViewDuration: retentionData.avgViewDuration,
        performanceScore,
        alpha: isSuccess ? (record.alpha || 1) + 1 : record.alpha || 1,
        beta: isSuccess ? record.beta || 1 : (record.beta || 1) + 1,
        updatedAt: new Date(),
      })
      .where(eq(audioRetentionCorrelations.id, record.id));

    await this.updatePatternStats(record, retentionData, isSuccess);

    console.log(`   ✅ Correlation updated. Performance score: ${performanceScore.toFixed(2)}`);
    console.log(`   Success: ${isSuccess}`);
  }

  /**
   * Calculate weighted performance score
   */
  private calculatePerformanceScore(ctr: number, avgViewDuration: number, views: number): number {
    const normalizedCtr = Math.min(ctr / 20, 1);
    const normalizedRetention = Math.min(avgViewDuration / 100, 1);
    const viewsBonus = Math.min(Math.log10(views + 1) / 4, 1);

    return (normalizedCtr * 0.4 + normalizedRetention * 0.4 + viewsBonus * 0.2) * 100;
  }

  /**
   * Update Thompson Sampling pattern stats
   */
  private async updatePatternStats(
    record: typeof audioRetentionCorrelations.$inferSelect,
    retentionData: any,
    isSuccess: boolean,
  ): Promise<void> {
    const patternsToUpdate: Array<{ type: string; value: string }> = [];

    if (record.bpm !== null) {
      for (const range of PATTERN_DEFINITIONS.bpm_range) {
        if (record.bpm >= range.min && record.bpm < range.max) {
          patternsToUpdate.push({ type: 'bpm_range', value: range.id });
          break;
        }
      }
    }

    if (record.firstBeatDropSecond !== null) {
      for (const range of PATTERN_DEFINITIONS.first_drop_timing) {
        if (record.firstBeatDropSecond >= range.min && record.firstBeatDropSecond < range.max) {
          patternsToUpdate.push({ type: 'first_drop_timing', value: range.id });
          break;
        }
      }
    }

    if (record.introEnergy !== null) {
      for (const range of PATTERN_DEFINITIONS.intro_energy) {
        if (record.introEnergy >= range.min && record.introEnergy < range.max) {
          patternsToUpdate.push({ type: 'intro_energy', value: range.id });
          break;
        }
      }
    }

    if (record.energyVariance !== null) {
      for (const range of PATTERN_DEFINITIONS.energy_variance) {
        if (record.energyVariance >= range.min && record.energyVariance < range.max) {
          patternsToUpdate.push({ type: 'energy_variance', value: range.id });
          break;
        }
      }
    }

    if (record.patternCategory) {
      patternsToUpdate.push({ type: 'pattern_category', value: record.patternCategory });
    }

    for (const pattern of patternsToUpdate) {
      await this.updateSinglePatternStat(pattern.type, pattern.value, retentionData, isSuccess);
    }
  }

  /**
   * Update a single pattern stat with Thompson Sampling
   */
  private async updateSinglePatternStat(
    patternType: string,
    patternValue: string,
    retentionData: any,
    isSuccess: boolean,
  ): Promise<void> {
    const existing = await db
      .select()
      .from(audioPatternStats)
      .where(and(eq(audioPatternStats.patternType, patternType), eq(audioPatternStats.patternValue, patternValue)))
      .limit(1);

    if (existing.length > 0) {
      const stat = existing[0];
      const newAlpha = (stat.alpha || 1) + (isSuccess ? 1 : 0);
      const newBeta = (stat.beta || 1) + (isSuccess ? 0 : 1);
      const newPulls = stat.pulls + 1;

      const newAvgViews = ((stat.avgViews || 0) * stat.pulls + (retentionData.views || 0)) / newPulls;
      const newAvgRetention = ((stat.avgRetention || 0) * stat.pulls + (retentionData.avgRetention || 0)) / newPulls;
      const newAvgCtr = ((stat.avgCtr || 0) * stat.pulls + (retentionData.ctr || 0)) / newPulls;
      const newSuccessRate = ((newAlpha - 1) / (newPulls || 1)) * 100;

      let verdict: 'proven' | 'neutral' | 'avoid' = 'neutral';
      if (newPulls >= 5) {
        if (newSuccessRate >= 50) verdict = 'proven';
        else if (newSuccessRate <= 20) verdict = 'avoid';
      }

      await db
        .update(audioPatternStats)
        .set({
          alpha: newAlpha,
          beta: newBeta,
          pulls: newPulls,
          avgViews: newAvgViews,
          avgRetention: newAvgRetention,
          avgCtr: newAvgCtr,
          successRate: newSuccessRate,
          verdict,
          lastUpdated: new Date(),
        })
        .where(eq(audioPatternStats.id, stat.id));
    } else {
      await db.insert(audioPatternStats).values({
        patternType,
        patternValue,
        alpha: isSuccess ? 2 : 1,
        beta: isSuccess ? 1 : 2,
        pulls: 1,
        avgViews: retentionData.views || 0,
        avgRetention: retentionData.avgRetention || 0,
        avgCtr: retentionData.ctr || 0,
        successRate: isSuccess ? 100 : 0,
        verdict: 'neutral',
        sampleVideoIds: [],
      });
    }
  }

  /**
   * Get winning audio patterns based on Thompson Sampling
   */
  async getWinningPatterns(): Promise<{
    patterns: Array<{
      type: string;
      value: string;
      label: string;
      successRate: number;
      pulls: number;
      verdict: string;
      thompsonScore: number;
    }>;
    summary: string;
  }> {
    console.log('🏆 AUDIO PACING: Analyzing winning patterns...');

    const stats = await db
      .select()
      .from(audioPatternStats)
      .where(gte(audioPatternStats.pulls, 3))
      .orderBy(desc(audioPatternStats.successRate));

    const patterns = stats.map((stat) => {
      const thompsonScore = this.sampleBeta(stat.alpha || 1, stat.beta || 1);

      let label = stat.patternValue;
      const patternDef = PATTERN_DEFINITIONS[stat.patternType as keyof typeof PATTERN_DEFINITIONS];
      if (patternDef) {
        const def = patternDef.find((d) => d.id === stat.patternValue);
        if (def) label = def.label;
      }

      return {
        type: stat.patternType,
        value: stat.patternValue,
        label,
        successRate: stat.successRate || 0,
        pulls: stat.pulls,
        verdict: stat.verdict || 'neutral',
        thompsonScore,
      };
    });

    patterns.sort((a, b) => b.thompsonScore - a.thompsonScore);

    const proven = patterns.filter((p) => p.verdict === 'proven');
    const avoided = patterns.filter((p) => p.verdict === 'avoid');

    let summary = '📊 Audio Pattern Analysis:\n';

    if (proven.length > 0) {
      summary += '\n✅ PROVEN PATTERNS:\n';
      for (const p of proven.slice(0, 3)) {
        summary += `   - ${p.label} (${p.type}): ${p.successRate.toFixed(0)}% success rate\n`;
      }
    }

    if (avoided.length > 0) {
      summary += '\n❌ PATTERNS TO AVOID:\n';
      for (const p of avoided.slice(0, 3)) {
        summary += `   - ${p.label} (${p.type}): ${p.successRate.toFixed(0)}% success rate\n`;
      }
    }

    if (patterns.length === 0) {
      summary = '📊 Not enough data yet. Need more videos with retention data to identify patterns.';
    }

    console.log(summary);

    return { patterns, summary };
  }

  /**
   * Sample from Beta distribution for Thompson Sampling
   */
  private sampleBeta(alpha: number, beta: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const x = Math.pow(u1, 1 / alpha);
    const y = Math.pow(u2, 1 / beta);
    return x / (x + y);
  }

  /**
   * Generate prompt guidance for music generation based on learned patterns
   */
  async generatePromptGuidance(): Promise<AudioPatternGuidance> {
    console.log('🎯 AUDIO PACING: Generating prompt guidance from learned patterns...');

    const { patterns } = await this.getWinningPatterns();

    const recommendations: string[] = [];
    const bpmPattern = patterns.find((p) => p.type === 'bpm_range' && p.verdict === 'proven');
    const dropPattern = patterns.find((p) => p.type === 'first_drop_timing' && p.verdict === 'proven');
    const energyPattern = patterns.find((p) => p.type === 'intro_energy' && p.verdict === 'proven');

    let bpmRange = { min: 120, max: 150, explanation: 'Default range for engagement' };
    if (bpmPattern) {
      const def = PATTERN_DEFINITIONS.bpm_range.find((d) => d.id === bpmPattern.value);
      if (def) {
        bpmRange = {
          min: def.min,
          max: def.max,
          explanation: `Proven pattern: ${bpmPattern.successRate.toFixed(0)}% success rate`,
        };
        recommendations.push(`Use ${def.label} - proven ${bpmPattern.successRate.toFixed(0)}% success rate`);
      }
    }

    let firstDropTiming = { target: 3, explanation: 'Hook viewers early' };
    if (dropPattern) {
      const def = PATTERN_DEFINITIONS.first_drop_timing.find((d) => d.id === dropPattern.value);
      if (def) {
        firstDropTiming = {
          target: (def.min + def.max) / 2,
          explanation: `Proven pattern: ${dropPattern.successRate.toFixed(0)}% success rate`,
        };
        recommendations.push(
          `First beat drop ${def.label} - proven ${dropPattern.successRate.toFixed(0)}% success rate`,
        );
      }
    } else {
      recommendations.push('Ensure beat drop before 4 seconds for maximum hook retention');
    }

    let introEnergy = { target: 'high', explanation: 'Capture attention immediately' };
    if (energyPattern) {
      introEnergy = {
        target: energyPattern.value,
        explanation: `Proven pattern: ${energyPattern.successRate.toFixed(0)}% success rate`,
      };
      recommendations.push(
        `${energyPattern.label} works best - proven ${energyPattern.successRate.toFixed(0)}% success rate`,
      );
    }

    const avoidPatterns = patterns.filter((p) => p.verdict === 'avoid');
    for (const avoid of avoidPatterns.slice(0, 2)) {
      recommendations.push(`AVOID: ${avoid.label} (${avoid.type}) - only ${avoid.successRate.toFixed(0)}% success`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Ensure beat drop before 4 seconds');
      recommendations.push('Start with high energy intro');
      recommendations.push('Target 130-145 BPM for maximum engagement');
      recommendations.push('Keep energy dynamic with clear peaks and valleys');
    }

    let promptInjection = 'hook-first structure with beat drop in first 3 seconds, ';
    promptInjection += bpmRange.max < 999 ? `${bpmRange.min}-${bpmRange.max} BPM, ` : 'upbeat tempo, ';
    promptInjection += 'explosive intro energy, dynamic intensity throughout';

    const guidance: AudioPatternGuidance = {
      recommendations,
      bpmRange,
      firstDropTiming,
      introEnergy,
      promptInjection,
    };

    console.log('🎯 AUDIO PACING: Guidance generated');
    console.log(`   Prompt injection: ${promptInjection}`);

    return guidance;
  }

  /**
   * Link audio analysis to video after YouTube upload
   */
  async linkToVideo(packageId: string, videoId: string): Promise<void> {
    await db
      .update(audioRetentionCorrelations)
      .set({ videoId, updatedAt: new Date() })
      .where(eq(audioRetentionCorrelations.packageId, packageId));

    console.log(`🔗 AUDIO PACING: Linked package ${packageId} to video ${videoId}`);
  }

  /**
   * Get audio analysis for a specific video or package
   */
  async getAnalysis(identifier: {
    videoId?: string;
    packageId?: string;
  }): Promise<typeof audioRetentionCorrelations.$inferSelect | null> {
    let result;

    if (identifier.videoId) {
      result = await db
        .select()
        .from(audioRetentionCorrelations)
        .where(eq(audioRetentionCorrelations.videoId, identifier.videoId))
        .limit(1);
    } else if (identifier.packageId) {
      result = await db
        .select()
        .from(audioRetentionCorrelations)
        .where(eq(audioRetentionCorrelations.packageId, identifier.packageId))
        .limit(1);
    }

    return result && result.length > 0 ? result[0] : null;
  }

  /**
   * Generate correlation insights using AI (optional enhancement)
   */
  async generateCorrelationInsights(recordId: string): Promise<string> {
    const record = await db
      .select()
      .from(audioRetentionCorrelations)
      .where(eq(audioRetentionCorrelations.id, recordId))
      .limit(1);

    if (record.length === 0) {
      return '{}';
    }

    const r = record[0];

    const insights: Record<string, any> = {
      hookEffectiveness: 'unknown',
      recommendations: [],
    };

    if (r.retentionAt3s !== null && r.introEnergy !== null) {
      if (r.retentionAt3s > 80 && r.introEnergy > 0.6) {
        insights.hookEffectiveness = 'strong';
        insights.recommendations.push('High energy intro + high retention confirmed');
      } else if (r.retentionAt3s < 60) {
        insights.hookEffectiveness = 'weak';
        if (r.introEnergy && r.introEnergy < 0.4) {
          insights.recommendations.push('Consider higher energy intro');
        }
        if (r.firstBeatDropSecond && r.firstBeatDropSecond > 4) {
          insights.recommendations.push('Move beat drop earlier (before 4s)');
        }
      }
    }

    if (r.retentionAt15s !== null && r.retentionAt3s !== null) {
      const dropOff = ((r.retentionAt3s - r.retentionAt15s) / r.retentionAt3s) * 100;
      if (dropOff > 50) {
        insights.recommendations.push('High mid-video drop-off - add more energy peaks');
      }
    }

    const insightsJson = JSON.stringify(insights);

    await db
      .update(audioRetentionCorrelations)
      .set({ correlationInsights: insightsJson, updatedAt: new Date() })
      .where(eq(audioRetentionCorrelations.id, recordId));

    return insightsJson;
  }

  /**
   * Convert Librosa analysis data from package to AudioPacingAnalysis format
   * Used for backfilling from existing package data
   */
  convertLibrosaToAnalysis(librosaData: {
    bpm: number;
    duration: number;
    beats?: number[];
    energySamples?: Array<{ time: number; energy: number }>;
    averageEnergy?: number;
    energyRange?: { min: number; max: number };
  }): AudioPacingAnalysis {
    const bpm = librosaData.bpm || 120;
    const duration = librosaData.duration || 180;
    const beats = librosaData.beats || [];
    const energySamples = librosaData.energySamples || [];
    const averageEnergy = librosaData.averageEnergy || 0.5;
    const energyRange = librosaData.energyRange || { min: 0.2, max: 0.8 };

    const beatDrops: number[] = [];
    if (energySamples.length >= 2) {
      for (let i = 1; i < energySamples.length; i++) {
        const jump = energySamples[i].energy - energySamples[i - 1].energy;
        if (jump > 0.15) {
          beatDrops.push(energySamples[i].time);
        }
      }
    }

    const peaks: number[] = [];
    if (energySamples.length >= 3) {
      for (let i = 1; i < energySamples.length - 1; i++) {
        const curr = energySamples[i].energy;
        const prev = energySamples[i - 1].energy;
        const next = energySamples[i + 1].energy;
        if (curr > prev && curr > next && curr > averageEnergy + 0.1) {
          peaks.push(energySamples[i].time);
        }
      }
    }

    const introSamples = energySamples.filter((s) => s.time <= 3);
    const introEnergy =
      introSamples.length > 0 ? introSamples.reduce((a, s) => a + s.energy, 0) / introSamples.length : averageEnergy;

    const energies = energySamples.map((s) => s.energy);
    let energyVariance = 0.1;
    if (energies.length >= 2) {
      const mean = energies.reduce((a, b) => a + b, 0) / energies.length;
      const squaredDiffs = energies.map((e) => Math.pow(e - mean, 2));
      energyVariance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / energies.length);
    }

    let energyRampTime: number | null = null;
    const threshold80 = energyRange.max * 0.8;
    for (const sample of energySamples) {
      if (sample.energy >= threshold80) {
        energyRampTime = sample.time;
        break;
      }
    }

    const beatsIn5s = beats.filter((b) => b <= 5);
    const beatDensityFirst5s = beatsIn5s.length > 0 ? beatsIn5s.length / 5 : bpm / 60;

    const dynamicRange = energyRange.max - energyRange.min;

    const firstBeatDropSecond = beatDrops.length > 0 ? beatDrops[0] : null;
    const firstEnergyPeakSecond = peaks.length > 0 ? peaks[0] : null;

    let patternCategory: AudioPacingAnalysis['patternCategory'] = 'dynamic';
    if (introEnergy > 0.7 && (firstBeatDropSecond === null || firstBeatDropSecond < 3)) {
      patternCategory = 'fast_drop';
    } else if (introEnergy < 0.3 && firstBeatDropSecond !== null && firstBeatDropSecond > 6) {
      patternCategory = 'slow_build';
    } else if (energyVariance < 0.1 && introEnergy > 0.5) {
      patternCategory = 'steady_high';
    } else if (energyVariance < 0.1 && introEnergy <= 0.5) {
      patternCategory = 'steady_low';
    }

    return {
      bpm,
      duration,
      beatDropTimestamps: beatDrops,
      firstBeatDropSecond,
      energyPeakTimestamps: peaks,
      firstEnergyPeakSecond,
      averageEnergy,
      energyVariance,
      introEnergy,
      energyRampTime,
      beatDensityFirst5s,
      dynamicRange,
      patternCategory,
    };
  }

  /**
   * Directly update pattern stats for backfilling
   * Allows calling updatePatternStats without a full correlation record
   */
  async updatePatternStatsDirectly(
    analysis: AudioPacingAnalysis,
    retentionData: { views?: number; avgRetention?: number; ctr?: number },
    isSuccess: boolean,
  ): Promise<void> {
    const mockRecord = {
      bpm: analysis.bpm,
      firstBeatDropSecond: analysis.firstBeatDropSecond,
      introEnergy: analysis.introEnergy,
      energyVariance: analysis.energyVariance,
      patternCategory: analysis.patternCategory,
    };

    await this.updatePatternStats(mockRecord as any, retentionData, isSuccess);
  }
}

export const audioPacingService = new AudioPacingService();
