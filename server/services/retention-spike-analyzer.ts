/**
 * RETENTION SPIKE & DROP ANALYZER
 *
 * Analyzes both retention drops (what's NOT working) and spikes (what IS working)
 * to provide actionable insights for improving video performance.
 *
 * Features:
 * - Detects retention drops (people leaving)
 * - Detects retention spikes (people rewatching/engaging)
 * - Correlates with video features (beats, visuals, transitions)
 * - Learns which combinations work and which don't
 * - Provides specific recommendations for future videos
 */

import { db } from '../db';
import { jobs, detailedVideoMetrics as youtubeAnalytics } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export interface RetentionPoint {
  second: number;
  retention: number; // Percentage (0-100)
}

export interface RetentionSpike {
  second: number;
  spikePercentage: number; // How much retention increased
  beforeRetention: number;
  afterRetention: number;
  severity: 'minor' | 'major' | 'exceptional'; // How significant
  reason?: string; // What caused it
}

export interface RetentionDrop {
  second: number;
  dropPercentage: number;
  beforeRetention: number;
  afterRetention: number;
  severity: 'minor' | 'major' | 'critical';
  reason?: string; // What caused it
}

export interface VideoFeature {
  timestamp: number;
  type: 'beat_drop' | 'visual_transition' | 'audio_peak' | 'hook' | 'text_overlay';
  intensity: number; // 0-1
  description: string;
}

export interface SuccessPattern {
  feature: string; // e.g., "beat_drop_at_140bpm"
  avgSpikePercentage: number;
  occurrences: number;
  confidence: number; // 0-1
  examples: string[]; // Video IDs where this worked
}

export interface FailurePattern {
  feature: string; // e.g., "slow_visual_with_fast_audio"
  avgDropPercentage: number;
  occurrences: number;
  confidence: number;
  examples: string[]; // Video IDs where this failed
}

export interface RetentionInsights {
  videoId: string;
  overallRetention: number;

  // What's working
  spikes: RetentionSpike[];
  successPatterns: SuccessPattern[];
  doMoreOf: string[]; // Actionable advice

  // What's not working
  drops: RetentionDrop[];
  failurePatterns: FailurePattern[];
  doLessOf: string[]; // Actionable advice

  // Specific recommendations
  recommendations: {
    immediate: string[]; // Fix these now
    strategic: string[]; // Consider for future videos
    experiment: string[]; // Worth testing
  };

  score: {
    overall: number; // 0-100
    hook: number; // First 3 seconds
    retention: number; // Overall engagement
    rewatch: number; // Spike indicator
  };
}

export class RetentionSpikeAnalyzer {
  private successDatabase = new Map<string, SuccessPattern>();
  private failureDatabase = new Map<string, FailurePattern>();

  // Configuration
  private readonly SPIKE_THRESHOLDS = {
    minor: 2, // 2% increase
    major: 5, // 5% increase
    exceptional: 10, // 10% increase (rare, very good)
  };

  private readonly DROP_THRESHOLDS = {
    minor: 5, // 5% drop
    major: 10, // 10% drop
    critical: 15, // 15% drop (severe problem)
  };

  private readonly REACTION_LAG = 2; // Seconds between cause and effect

  /**
   * Analyze retention curve and identify what's working/not working
   */
  async analyzeVideo(
    videoId: string,
    retentionCurve: RetentionPoint[],
    videoFeatures: VideoFeature[] = [],
  ): Promise<RetentionInsights> {
    console.log(`\n📊 RETENTION ANALYSIS: ${videoId}`);
    console.log(`   Data points: ${retentionCurve.length}`);
    console.log(`   Features: ${videoFeatures.length}\n`);

    // Detect spikes (what's working)
    const spikes = this.detectSpikes(retentionCurve);
    console.log(`   ✅ Found ${spikes.length} retention spikes`);

    // Detect drops (what's not working)
    const drops = this.detectDrops(retentionCurve);
    console.log(`   ❌ Found ${drops.length} retention drops`);

    // Correlate with video features
    const successPatterns = this.correlateSpikesWithFeatures(spikes, videoFeatures);
    const failurePatterns = this.correlateDropsWithFeatures(drops, videoFeatures);

    // Generate actionable insights
    const doMoreOf = this.generatePositiveInsights(spikes, successPatterns);
    const doLessOf = this.generateNegativeInsights(drops, failurePatterns);

    // Create recommendations
    const recommendations = this.generateRecommendations(
      spikes,
      drops,
      successPatterns,
      failurePatterns,
      retentionCurve,
    );

    // Calculate scores
    const score = this.calculateScores(retentionCurve, spikes, drops);

    // Store learnings for future use
    this.storeLearnings(successPatterns, failurePatterns, videoId);

    // Save to database
    await this.saveInsightsToDb(videoId, {
      spikes,
      drops,
      successPatterns,
      failurePatterns,
      score,
    });

    return {
      videoId,
      overallRetention: score.overall,
      spikes,
      successPatterns,
      doMoreOf,
      drops,
      failurePatterns,
      doLessOf,
      recommendations,
      score,
    };
  }

  /**
   * Detect retention spikes (engagement increases)
   */
  private detectSpikes(curve: RetentionPoint[]): RetentionSpike[] {
    const spikes: RetentionSpike[] = [];

    for (let i = 2; i < curve.length; i++) {
      const before = curve[i - 2];
      const after = curve[i];
      const increase = after.retention - before.retention;

      if (increase >= this.SPIKE_THRESHOLDS.minor) {
        let severity: RetentionSpike['severity'] = 'minor';

        if (increase >= this.SPIKE_THRESHOLDS.exceptional) {
          severity = 'exceptional';
        } else if (increase >= this.SPIKE_THRESHOLDS.major) {
          severity = 'major';
        }

        spikes.push({
          second: after.second,
          spikePercentage: increase,
          beforeRetention: before.retention,
          afterRetention: after.retention,
          severity,
        });
      }
    }

    return spikes;
  }

  /**
   * Detect retention drops (people leaving)
   */
  private detectDrops(curve: RetentionPoint[]): RetentionDrop[] {
    const drops: RetentionDrop[] = [];

    for (let i = 2; i < curve.length; i++) {
      const before = curve[i - 2];
      const after = curve[i];
      const decrease = before.retention - after.retention;

      if (decrease >= this.DROP_THRESHOLDS.minor) {
        let severity: RetentionDrop['severity'] = 'minor';

        if (decrease >= this.DROP_THRESHOLDS.critical) {
          severity = 'critical';
        } else if (decrease >= this.DROP_THRESHOLDS.major) {
          severity = 'major';
        }

        drops.push({
          second: after.second,
          dropPercentage: decrease,
          beforeRetention: before.retention,
          afterRetention: after.retention,
          severity,
        });
      }
    }

    return drops;
  }

  /**
   * Correlate spikes with video features to identify success patterns
   */
  private correlateSpikesWithFeatures(spikes: RetentionSpike[], features: VideoFeature[]): SuccessPattern[] {
    const patterns: Map<string, SuccessPattern> = new Map();

    for (const spike of spikes) {
      // Find features that occurred just before the spike (accounting for reaction lag)
      const causeTime = Math.max(0, spike.second - this.REACTION_LAG);

      const relatedFeatures = features.filter((f) => Math.abs(f.timestamp - causeTime) < this.REACTION_LAG);

      for (const feature of relatedFeatures) {
        const key = `${feature.type}_${feature.description}`;
        const existing = patterns.get(key);

        if (existing) {
          existing.avgSpikePercentage =
            (existing.avgSpikePercentage * existing.occurrences + spike.spikePercentage) / (existing.occurrences + 1);
          existing.occurrences++;
        } else {
          patterns.set(key, {
            feature: `${feature.type}: ${feature.description}`,
            avgSpikePercentage: spike.spikePercentage,
            occurrences: 1,
            confidence: 0.5,
            examples: [],
          });
        }

        spike.reason = `${feature.type}: ${feature.description}`;
      }
    }

    return Array.from(patterns.values()).sort((a, b) => b.avgSpikePercentage - a.avgSpikePercentage);
  }

  /**
   * Correlate drops with features to identify failure patterns
   */
  private correlateDropsWithFeatures(drops: RetentionDrop[], features: VideoFeature[]): FailurePattern[] {
    const patterns: Map<string, FailurePattern> = new Map();

    for (const drop of drops) {
      const causeTime = Math.max(0, drop.second - this.REACTION_LAG);

      const relatedFeatures = features.filter((f) => Math.abs(f.timestamp - causeTime) < this.REACTION_LAG);

      for (const feature of relatedFeatures) {
        const key = `${feature.type}_${feature.description}`;
        const existing = patterns.get(key);

        if (existing) {
          existing.avgDropPercentage =
            (existing.avgDropPercentage * existing.occurrences + drop.dropPercentage) / (existing.occurrences + 1);
          existing.occurrences++;
        } else {
          patterns.set(key, {
            feature: `${feature.type}: ${feature.description}`,
            avgDropPercentage: drop.dropPercentage,
            occurrences: 1,
            confidence: 0.5,
            examples: [],
          });
        }

        drop.reason = `${feature.type}: ${feature.description}`;
      }
    }

    return Array.from(patterns.values()).sort((a, b) => b.avgDropPercentage - a.avgDropPercentage);
  }

  /**
   * Generate positive insights (what to do MORE of)
   */
  private generatePositiveInsights(spikes: RetentionSpike[], patterns: SuccessPattern[]): string[] {
    const insights: string[] = [];

    // Exceptional spikes
    const exceptional = spikes.filter((s) => s.severity === 'exceptional');
    if (exceptional.length > 0) {
      insights.push(`🌟 ${exceptional.length} exceptional engagement spike(s)! Viewers LOVED these moments.`);
      exceptional.forEach((s) => {
        if (s.reason) {
          insights.push(`   → ${s.reason} at ${s.second}s (+${s.spikePercentage.toFixed(1)}%)`);
        }
      });
    }

    // Most effective patterns
    if (patterns.length > 0) {
      insights.push(`\n✅ Most Effective Techniques:`);
      patterns.slice(0, 3).forEach((p, i) => {
        insights.push(`   ${i + 1}. ${p.feature} (+${p.avgSpikePercentage.toFixed(1)}% avg, ${p.occurrences}x)`);
      });
    }

    // General positive feedback
    if (spikes.length > 3) {
      insights.push(`\n💪 Strong engagement throughout - ${spikes.length} retention spikes detected`);
    }

    return insights;
  }

  /**
   * Generate negative insights (what to do LESS of)
   */
  private generateNegativeInsights(drops: RetentionDrop[], patterns: FailurePattern[]): string[] {
    const insights: string[] = [];

    // Critical drops
    const critical = drops.filter((d) => d.severity === 'critical');
    if (critical.length > 0) {
      insights.push(`🚨 ${critical.length} critical drop(s) detected - viewers left rapidly!`);
      critical.forEach((d) => {
        if (d.reason) {
          insights.push(`   → ${d.reason} at ${d.second}s (-${d.dropPercentage.toFixed(1)}%)`);
        }
      });
    }

    // Most toxic patterns
    if (patterns.length > 0) {
      insights.push(`\n❌ Patterns to Avoid:`);
      patterns.slice(0, 3).forEach((p, i) => {
        insights.push(`   ${i + 1}. ${p.feature} (-${p.avgDropPercentage.toFixed(1)}% avg, ${p.occurrences}x)`);
      });
    }

    return insights;
  }

  /**
   * Generate specific recommendations
   */
  private generateRecommendations(
    spikes: RetentionSpike[],
    drops: RetentionDrop[],
    successPatterns: SuccessPattern[],
    failurePatterns: FailurePattern[],
    curve: RetentionPoint[],
  ) {
    const immediate: string[] = [];
    const strategic: string[] = [];
    const experiment: string[] = [];

    // Immediate fixes for critical drops
    const criticalDrops = drops.filter((d) => d.severity === 'critical');
    if (criticalDrops.length > 0) {
      immediate.push(`Fix critical drops at: ${criticalDrops.map((d) => `${d.second}s`).join(', ')}`);
    }

    // Hook issues (first 3 seconds)
    const hookRetention = curve.find((p) => p.second === 3)?.retention || 100;
    if (hookRetention < 70) {
      immediate.push(`Hook needs work - only ${hookRetention.toFixed(0)}% stayed past 3s`);
      immediate.push(`Try: Stronger visual hook, faster pacing, immediate payoff`);
    }

    // Strategic patterns
    if (successPatterns.length > 0) {
      strategic.push(`Double down on: ${successPatterns[0].feature}`);
    }
    if (failurePatterns.length > 0) {
      strategic.push(`Avoid: ${failurePatterns[0].feature}`);
    }

    // Experiments based on spikes
    if (spikes.length > 2) {
      experiment.push(`Try more frequent engagement peaks (you hit ${spikes.length} spikes)`);
    }

    return { immediate, strategic, experiment };
  }

  /**
   * Calculate performance scores
   */
  private calculateScores(curve: RetentionPoint[], spikes: RetentionSpike[], drops: RetentionDrop[]) {
    const hookRetention = curve.find((p) => p.second === 3)?.retention || 100;
    const endRetention = curve[curve.length - 1]?.retention || 0;
    const avgRetention = curve.reduce((sum, p) => sum + p.retention, 0) / curve.length;

    // Rewatch score (more spikes = better)
    const rewatchScore = Math.min(100, (spikes.length / curve.length) * 1000);

    // Penalty for drops
    const dropPenalty = drops.reduce((sum, d) => sum + d.dropPercentage, 0);

    return {
      overall: Math.max(0, avgRetention - dropPenalty * 0.5),
      hook: hookRetention,
      retention: endRetention,
      rewatch: rewatchScore,
    };
  }

  /**
   * Store learnings for future use
   */
  private storeLearnings(successPatterns: SuccessPattern[], failurePatterns: FailurePattern[], videoId: string) {
    // Update success database
    successPatterns.forEach((pattern) => {
      const existing = this.successDatabase.get(pattern.feature);
      if (existing) {
        existing.avgSpikePercentage = (existing.avgSpikePercentage + pattern.avgSpikePercentage) / 2;
        existing.occurrences += pattern.occurrences;
        existing.confidence = Math.min(1, existing.confidence + 0.1);
        existing.examples.push(videoId);
      } else {
        pattern.examples = [videoId];
        this.successDatabase.set(pattern.feature, pattern);
      }
    });

    // Update failure database
    failurePatterns.forEach((pattern) => {
      const existing = this.failureDatabase.get(pattern.feature);
      if (existing) {
        existing.avgDropPercentage = (existing.avgDropPercentage + pattern.avgDropPercentage) / 2;
        existing.occurrences += pattern.occurrences;
        existing.confidence = Math.min(1, existing.confidence + 0.1);
        existing.examples.push(videoId);
      } else {
        pattern.examples = [videoId];
        this.failureDatabase.set(pattern.feature, pattern);
      }
    });
  }

  /**
   * Save insights to database for long-term learning
   */
  private async saveInsightsToDb(videoId: string, insights: any) {
    try {
      // This would integrate with your existing analytics tables
      console.log(`   💾 Saving retention insights for ${videoId}`);
      // TODO: Implement database storage
    } catch (error) {
      console.error(`   ❌ Failed to save insights: ${error}`);
    }
  }

  /**
   * Get known success patterns (what's been working)
   */
  getSuccessPatterns(): SuccessPattern[] {
    return Array.from(this.successDatabase.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get known failure patterns (what's been failing)
   */
  getFailurePatterns(): FailurePattern[] {
    return Array.from(this.failureDatabase.values()).sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check if a feature is known to work well
   */
  isSuccessful(
    featureType: string,
    description: string,
  ): {
    isSuccessful: boolean;
    confidence: number;
    avgSpike?: number;
  } {
    const key = `${featureType}_${description}`;
    const pattern = this.successDatabase.get(key);

    if (!pattern) {
      return { isSuccessful: false, confidence: 0 };
    }

    return {
      isSuccessful: pattern.confidence > 0.6,
      confidence: pattern.confidence,
      avgSpike: pattern.avgSpikePercentage,
    };
  }

  /**
   * Check if a feature is known to cause drops
   */
  isProblematic(
    featureType: string,
    description: string,
  ): {
    isProblematic: boolean;
    confidence: number;
    avgDrop?: number;
  } {
    const key = `${featureType}_${description}`;
    const pattern = this.failureDatabase.get(key);

    if (!pattern) {
      return { isProblematic: false, confidence: 0 };
    }

    return {
      isProblematic: pattern.confidence > 0.6,
      confidence: pattern.confidence,
      avgDrop: pattern.avgDropPercentage,
    };
  }
}

// Singleton export
export const retentionSpikeAnalyzer = new RetentionSpikeAnalyzer();
