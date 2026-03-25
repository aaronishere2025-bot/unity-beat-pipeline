import { db } from '../db';
import { nuggetExperiments, type NuggetExperiment, type InsertNuggetExperiment } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { kling25PromptOptimizer } from './kling25-prompt-optimizer';

type NuggetType = 'in_media_res' | 'abstract_mystery' | 'reaction_reveal';

interface VariantStats {
  videoCount: number;
  impressions: number;
  swipeRate: number;
  retention3s: number;
  ctr: number;
  avgWatchTime: number;
  totalReward: number;
}

interface VideoAssignment {
  videoId: string;
  packageId?: string;
  variant: string;
  publishedAt: string;
  metrics?: {
    swipeRate: number;
    retention3s: number;
    ctr: number;
    impressions: number;
  };
}

const COMPOSITE_WEIGHTS = {
  swipeRate: 0.6, // 60% - most important (lower is better, inverted in calculation)
  retention3s: 0.25, // 25% - 3-second retention
  ctr: 0.15, // 15% - click-through rate
};

class NuggetExperimentService {
  async createExperiment(
    sprintId: string,
    variantA: NuggetType = 'in_media_res',
    variantB: NuggetType = 'abstract_mystery',
  ): Promise<NuggetExperiment> {
    const experiment: InsertNuggetExperiment = {
      sprintId,
      status: 'active',
      variantA,
      variantB,
      variantAStats: {
        videoCount: 0,
        impressions: 0,
        swipeRate: 0,
        retention3s: 0,
        ctr: 0,
        avgWatchTime: 0,
        totalReward: 0,
      },
      variantBStats: {
        videoCount: 0,
        impressions: 0,
        swipeRate: 0,
        retention3s: 0,
        ctr: 0,
        avgWatchTime: 0,
        totalReward: 0,
      },
      minVideosPerVariant: 3,
      minTotalImpressions: 1000,
      maxTestWindow: 24,
      videoAssignments: [],
      decisionLog: [
        {
          action: 'experiment_created',
          timestamp: new Date().toISOString(),
          details: `Testing ${variantA} vs ${variantB} for sprint ${sprintId}`,
        },
      ],
    };

    const [created] = await db.insert(nuggetExperiments).values(experiment).returning();
    console.log(`🧪 Nugget A/B Experiment created: ${variantA} vs ${variantB} for sprint ${sprintId}`);
    return created;
  }

  async getActiveExperiment(sprintId?: string): Promise<NuggetExperiment | null> {
    let query;
    if (sprintId) {
      query = db
        .select()
        .from(nuggetExperiments)
        .where(and(eq(nuggetExperiments.status, 'active'), eq(nuggetExperiments.sprintId, sprintId)))
        .orderBy(desc(nuggetExperiments.createdAt))
        .limit(1);
    } else {
      query = db
        .select()
        .from(nuggetExperiments)
        .where(eq(nuggetExperiments.status, 'active'))
        .orderBy(desc(nuggetExperiments.createdAt))
        .limit(1);
    }

    const [experiment] = await query;
    return experiment || null;
  }

  async getExperimentById(id: string): Promise<NuggetExperiment | null> {
    const [experiment] = await db.select().from(nuggetExperiments).where(eq(nuggetExperiments.id, id)).limit(1);
    return experiment || null;
  }

  async selectVariantForVideo(experimentId: string): Promise<{
    variant: NuggetType;
    isTestTraffic: boolean;
    assignmentReason: string;
  }> {
    const experiment = await this.getExperimentById(experimentId);
    if (!experiment) {
      return {
        variant: 'in_media_res',
        isTestTraffic: false,
        assignmentReason: 'Experiment not found, using default',
      };
    }

    const statsA = experiment.variantAStats as VariantStats;
    const statsB = experiment.variantBStats as VariantStats;

    if (statsA.videoCount < experiment.minVideosPerVariant || statsB.videoCount < experiment.minVideosPerVariant) {
      const variant =
        statsA.videoCount <= statsB.videoCount
          ? (experiment.variantA as NuggetType)
          : (experiment.variantB as NuggetType);

      return {
        variant,
        isTestTraffic: true,
        assignmentReason: `Balancing test traffic: A=${statsA.videoCount}, B=${statsB.videoCount}`,
      };
    }

    const random = Math.random();
    if (random < 0.2) {
      const variant = random < 0.1 ? (experiment.variantA as NuggetType) : (experiment.variantB as NuggetType);
      return {
        variant,
        isTestTraffic: true,
        assignmentReason: '20% exploration traffic',
      };
    }

    if (experiment.winner) {
      return {
        variant: experiment.winner as NuggetType,
        isTestTraffic: false,
        assignmentReason: 'Using declared winner',
      };
    }

    const winningVariant =
      statsA.totalReward >= statsB.totalReward
        ? (experiment.variantA as NuggetType)
        : (experiment.variantB as NuggetType);

    return {
      variant: winningVariant,
      isTestTraffic: false,
      assignmentReason: `Exploitation: ${winningVariant} leading with score ${Math.max(statsA.totalReward, statsB.totalReward).toFixed(2)}`,
    };
  }

  async recordVideoAssignment(
    experimentId: string,
    videoId: string,
    variant: NuggetType,
    packageId?: string,
  ): Promise<void> {
    const experiment = await this.getExperimentById(experimentId);
    if (!experiment) return;

    // Deep clone to prevent mutation of cached references
    const assignments = JSON.parse(JSON.stringify(experiment.videoAssignments || [])) as VideoAssignment[];
    assignments.push({
      videoId,
      packageId,
      variant,
      publishedAt: new Date().toISOString(),
    });

    // Deep clone stats to prevent mutation issues
    const statsA: VariantStats = JSON.parse(
      JSON.stringify(
        experiment.variantAStats || {
          videoCount: 0,
          impressions: 0,
          swipeRate: 0,
          retention3s: 0,
          ctr: 0,
          avgWatchTime: 0,
          totalReward: 0,
        },
      ),
    );
    const statsB: VariantStats = JSON.parse(
      JSON.stringify(
        experiment.variantBStats || {
          videoCount: 0,
          impressions: 0,
          swipeRate: 0,
          retention3s: 0,
          ctr: 0,
          avgWatchTime: 0,
          totalReward: 0,
        },
      ),
    );

    if (variant === experiment.variantA) {
      statsA.videoCount++;
    } else {
      statsB.videoCount++;
    }

    const decisionLog = JSON.parse(JSON.stringify(experiment.decisionLog || []));
    decisionLog.push({
      action: 'video_assigned',
      timestamp: new Date().toISOString(),
      details: `Video ${videoId} assigned to ${variant}`,
    });

    await db
      .update(nuggetExperiments)
      .set({
        videoAssignments: assignments,
        variantAStats: statsA,
        variantBStats: statsB,
        decisionLog,
      })
      .where(eq(nuggetExperiments.id, experimentId));

    console.log(`📊 Recorded video ${videoId} for variant ${variant}`);
  }

  async updateVideoMetrics(
    experimentId: string,
    videoId: string,
    metrics: {
      swipeRate: number;
      retention3s: number;
      ctr: number;
      impressions: number;
    },
  ): Promise<{ shouldDeclareWinner: boolean }> {
    const experiment = await this.getExperimentById(experimentId);
    if (!experiment) return { shouldDeclareWinner: false };

    // Deep clone to prevent mutation of cached references
    const assignments = JSON.parse(JSON.stringify(experiment.videoAssignments || [])) as VideoAssignment[];
    const assignmentIndex = assignments.findIndex((a) => a.videoId === videoId);

    if (assignmentIndex === -1) return { shouldDeclareWinner: false };

    assignments[assignmentIndex].metrics = metrics;

    const statsA = this.recalculateVariantStats(assignments, experiment.variantA);
    const statsB = this.recalculateVariantStats(assignments, experiment.variantB);

    await db
      .update(nuggetExperiments)
      .set({
        videoAssignments: assignments,
        variantAStats: statsA,
        variantBStats: statsB,
      })
      .where(eq(nuggetExperiments.id, experimentId));

    const shouldDeclareWinner = this.checkWinnerCriteria(experiment, statsA, statsB);

    return { shouldDeclareWinner };
  }

  private recalculateVariantStats(assignments: VideoAssignment[], variant: string): VariantStats {
    const variantAssignments = assignments.filter((a) => a.variant === variant && a.metrics);
    const totalVideoCount = assignments.filter((a) => a.variant === variant).length;

    if (variantAssignments.length === 0) {
      return {
        videoCount: totalVideoCount,
        impressions: 0,
        swipeRate: 0,
        retention3s: 0,
        ctr: 0,
        avgWatchTime: 0,
        totalReward: 0,
      };
    }

    const totalImpressions = variantAssignments.reduce((sum, a) => sum + (a.metrics?.impressions || 0), 0);

    // Use impression-weighted averages for accurate traffic-split evaluation
    // Higher impression videos have more impact on the average
    let weightedSwipeRate = 0;
    let weightedRetention3s = 0;
    let weightedCtr = 0;

    if (totalImpressions > 0) {
      for (const a of variantAssignments) {
        const weight = (a.metrics?.impressions || 0) / totalImpressions;
        weightedSwipeRate += (a.metrics?.swipeRate || 0) * weight;
        weightedRetention3s += (a.metrics?.retention3s || 0) * weight;
        weightedCtr += (a.metrics?.ctr || 0) * weight;
      }
    } else {
      // Fallback to simple average if no impressions data
      weightedSwipeRate =
        variantAssignments.reduce((sum, a) => sum + (a.metrics?.swipeRate || 0), 0) / variantAssignments.length;
      weightedRetention3s =
        variantAssignments.reduce((sum, a) => sum + (a.metrics?.retention3s || 0), 0) / variantAssignments.length;
      weightedCtr = variantAssignments.reduce((sum, a) => sum + (a.metrics?.ctr || 0), 0) / variantAssignments.length;
    }

    const totalReward = this.calculateCompositeScore(weightedSwipeRate, weightedRetention3s, weightedCtr);

    return {
      videoCount: totalVideoCount,
      impressions: totalImpressions,
      swipeRate: weightedSwipeRate,
      retention3s: weightedRetention3s,
      ctr: weightedCtr,
      avgWatchTime: 0,
      totalReward,
    };
  }

  private calculateCompositeScore(swipeRate: number, retention3s: number, ctr: number): number {
    const swipeScore = (1 - swipeRate) * 100 * COMPOSITE_WEIGHTS.swipeRate;
    const retentionScore = retention3s * 100 * COMPOSITE_WEIGHTS.retention3s;
    const ctrScore = ctr * 100 * COMPOSITE_WEIGHTS.ctr;

    return swipeScore + retentionScore + ctrScore;
  }

  private checkWinnerCriteria(experiment: NuggetExperiment, statsA: VariantStats, statsB: VariantStats): boolean {
    if (statsA.videoCount < experiment.minVideosPerVariant || statsB.videoCount < experiment.minVideosPerVariant) {
      return false;
    }

    const totalImpressions = statsA.impressions + statsB.impressions;
    if (totalImpressions < experiment.minTotalImpressions) {
      return false;
    }

    const scoreDifference = Math.abs(statsA.totalReward - statsB.totalReward);
    if (scoreDifference >= 10) {
      return true;
    }

    const hoursElapsed = (Date.now() - new Date(experiment.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursElapsed >= experiment.maxTestWindow) {
      return true;
    }

    return false;
  }

  async declareWinner(experimentId: string): Promise<{
    winner: NuggetType;
    confidence: number;
    margin: number;
  }> {
    const experiment = await this.getExperimentById(experimentId);
    if (!experiment) throw new Error('Experiment not found');

    const statsA = experiment.variantAStats as VariantStats;
    const statsB = experiment.variantBStats as VariantStats;

    const winner =
      statsA.totalReward >= statsB.totalReward
        ? (experiment.variantA as NuggetType)
        : (experiment.variantB as NuggetType);

    const margin = Math.abs(statsA.totalReward - statsB.totalReward);
    const confidence = Math.min(0.95, 0.5 + margin / 40);

    const decisionLog = (experiment.decisionLog as any[]) || [];
    decisionLog.push({
      action: 'winner_declared',
      timestamp: new Date().toISOString(),
      details: `Winner: ${winner} with margin ${margin.toFixed(2)} and confidence ${(confidence * 100).toFixed(1)}%`,
    });

    await db
      .update(nuggetExperiments)
      .set({
        status: 'completed',
        winner,
        winnerConfidence: confidence,
        winnerMargin: margin,
        completedAt: new Date(),
        decisionLog,
      })
      .where(eq(nuggetExperiments.id, experimentId));

    const nuggetReward = kling25PromptOptimizer.calculateNuggetReward(
      winner === experiment.variantA ? statsA.swipeRate : statsB.swipeRate,
    );

    console.log(
      `🏆 Nugget A/B Winner: ${winner} (confidence: ${(confidence * 100).toFixed(1)}%, margin: ${margin.toFixed(2)})`,
    );
    console.log(`   Thompson Sampling reward: +${nuggetReward.alphaChange}α (${nuggetReward.rewardType})`);

    return { winner, confidence, margin };
  }

  async getAllExperiments(limit: number = 10): Promise<NuggetExperiment[]> {
    return db.select().from(nuggetExperiments).orderBy(desc(nuggetExperiments.createdAt)).limit(limit);
  }

  async cancelExperiment(experimentId: string, reason: string): Promise<void> {
    const experiment = await this.getExperimentById(experimentId);
    if (!experiment) return;

    const decisionLog = (experiment.decisionLog as any[]) || [];
    decisionLog.push({
      action: 'experiment_cancelled',
      timestamp: new Date().toISOString(),
      details: reason,
    });

    await db
      .update(nuggetExperiments)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        decisionLog,
      })
      .where(eq(nuggetExperiments.id, experimentId));

    console.log(`❌ Nugget experiment ${experimentId} cancelled: ${reason}`);
  }

  getAvailableNuggetTypes(): NuggetType[] {
    return ['in_media_res', 'abstract_mystery', 'reaction_reveal'];
  }

  async injectNuggetForExperiment(
    experimentId: string,
    basePrompt: string,
    clipIndex: number,
  ): Promise<{
    optimizedPrompt: string;
    nuggetApplied: boolean;
    variant: NuggetType;
    experimentId: string;
  }> {
    if (clipIndex !== 0) {
      return {
        optimizedPrompt: basePrompt,
        nuggetApplied: false,
        variant: 'in_media_res',
        experimentId,
      };
    }

    const { variant, assignmentReason } = await this.selectVariantForVideo(experimentId);
    console.log(`🎯 Nugget variant selected: ${variant} (${assignmentReason})`);

    const result = kling25PromptOptimizer.injectNugget(basePrompt, clipIndex, variant);

    return {
      optimizedPrompt: result.optimizedPrompt,
      nuggetApplied: result.nuggetApplied,
      variant,
      experimentId,
    };
  }
}

export const nuggetExperimentService = new NuggetExperimentService();
