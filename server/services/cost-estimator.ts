/**
 * Cost Estimator Service
 * Pre-generation cost estimation with budget enforcement
 *
 * Prevents overspending by:
 * - Estimating costs before generation starts
 * - Enforcing budget limits per job
 * - Providing detailed cost breakdowns
 * - Tracking estimate accuracy for improvements
 *
 * Created: December 2025
 */

import { API_COSTS } from './api-cost-tracker';
import { storage } from '../storage';
import type { Job } from '@shared/schema';

/**
 * Cost breakdown by category
 */
export interface CostBreakdown {
  music: number;
  videoGeneration: number;
  bestOfN: number;
  qualityValidation: number;
  promptGeneration: number;
  audioAnalysis: number;
  other: number;
  subtotal: number;
  buffer: number; // 10% safety buffer
  total: number;
}

/**
 * Detailed cost estimate for a job
 */
export interface CostEstimate {
  jobId?: string;
  mode: string;
  breakdown: CostBreakdown;
  clipCount: number;
  musicIncluded: boolean;
  bestOfNEnabled: boolean;
  highVarianceClips: number;
  qualityValidationEnabled: boolean;
  timestamp: Date;
  estimatedDuration: number; // in seconds
  metadata?: Record<string, any>;
}

/**
 * Budget enforcement result
 */
export interface BudgetCheckResult {
  allowed: boolean;
  estimate: CostEstimate;
  budgetLimit?: number;
  budgetRemaining?: number;
  reason?: string;
}

/**
 * Configuration for cost estimation
 */
export interface EstimationConfig {
  clipCount: number;
  mode: 'kling' | 'consistent' | 'unity_kling';
  includeMusic?: boolean;
  includeBestOfN?: boolean;
  highVarianceClipCount?: number; // Clips requiring best-of-N
  includeQualityValidation?: boolean;
  estimatedDuration?: number; // Audio duration in seconds
  customPromptGeneration?: boolean; // If using advanced prompt generation
}

/**
 * Cost estimation constants (based on api-cost-tracker.ts)
 */
const COST_CONSTANTS = {
  // Fixed costs
  MUSIC_GENERATION: 0.1, // Suno per song
  KLING_PER_CLIP: 0.1, // Per 5-second clip

  // Best-of-N (generates 3 candidates, picks best)
  BEST_OF_N_MULTIPLIER: 2, // Additional cost for best-of-N (2x extra clips)
  BEST_OF_N_VALIDATION_PER_CLIP: 0.003, // GPT-4o Vision validation per candidate

  // Quality validation
  QUALITY_VALIDATION_PER_CLIP: 0.01, // GPT-4o Vision per clip
  FRAMES_PER_VALIDATION: 3, // Sample 3 frames per clip

  // AI services (estimated token usage)
  PROMPT_GENERATION: {
    GPT4O_PER_CLIP: 0.002, // ~1000 input + 500 output tokens
    CLAUDE_NARRATIVE: 0.005, // ~1500 input + 500 output tokens
  },

  AUDIO_ANALYSIS: 0.001, // Python Librosa (minimal cost)

  // Safety buffer
  BUFFER_PERCENTAGE: 0.1, // 10% buffer for unexpected costs
};

/**
 * Cost Estimator Service
 */
export class CostEstimator {
  /**
   * Estimate cost for a video generation job before it starts
   */
  async estimateCost(config: EstimationConfig): Promise<CostEstimate> {
    const breakdown: CostBreakdown = {
      music: 0,
      videoGeneration: 0,
      bestOfN: 0,
      qualityValidation: 0,
      promptGeneration: 0,
      audioAnalysis: 0,
      other: 0,
      subtotal: 0,
      buffer: 0,
      total: 0,
    };

    // 1. Music generation cost (if needed)
    if (config.includeMusic !== false && config.mode === 'unity_kling') {
      breakdown.music = COST_CONSTANTS.MUSIC_GENERATION;
    }

    // 2. Video generation cost (base)
    breakdown.videoGeneration = config.clipCount * COST_CONSTANTS.KLING_PER_CLIP;

    // 3. Best-of-N cost (if enabled)
    if (config.includeBestOfN && config.highVarianceClipCount && config.highVarianceClipCount > 0) {
      const highVarianceClips = config.highVarianceClipCount;

      // Additional clips generated (2 extra per high-variance clip)
      const extraClipCost = highVarianceClips * COST_CONSTANTS.BEST_OF_N_MULTIPLIER * COST_CONSTANTS.KLING_PER_CLIP;

      // Validation cost for each candidate (3 candidates × validation cost)
      const validationCost = highVarianceClips * 3 * COST_CONSTANTS.BEST_OF_N_VALIDATION_PER_CLIP;

      breakdown.bestOfN = extraClipCost + validationCost;
    }

    // 4. Quality validation cost (if enabled)
    if (config.includeQualityValidation !== false) {
      breakdown.qualityValidation = config.clipCount * COST_CONSTANTS.QUALITY_VALIDATION_PER_CLIP;
    }

    // 5. Prompt generation cost
    if (config.customPromptGeneration !== false) {
      // GPT-4o for cinematic direction
      breakdown.promptGeneration += config.clipCount * COST_CONSTANTS.PROMPT_GENERATION.GPT4O_PER_CLIP;

      // Claude for narrative structure (unity_kling mode)
      if (config.mode === 'unity_kling') {
        breakdown.promptGeneration += COST_CONSTANTS.PROMPT_GENERATION.CLAUDE_NARRATIVE;
      }
    }

    // 6. Audio analysis cost (if music is included)
    if (config.includeMusic !== false && config.mode === 'unity_kling') {
      breakdown.audioAnalysis = COST_CONSTANTS.AUDIO_ANALYSIS;
    }

    // Calculate subtotal
    breakdown.subtotal =
      breakdown.music +
      breakdown.videoGeneration +
      breakdown.bestOfN +
      breakdown.qualityValidation +
      breakdown.promptGeneration +
      breakdown.audioAnalysis +
      breakdown.other;

    // Add 10% safety buffer
    breakdown.buffer = breakdown.subtotal * COST_CONSTANTS.BUFFER_PERCENTAGE;
    breakdown.total = breakdown.subtotal + breakdown.buffer;

    const estimate: CostEstimate = {
      mode: config.mode,
      breakdown,
      clipCount: config.clipCount,
      musicIncluded: config.includeMusic !== false && config.mode === 'unity_kling',
      bestOfNEnabled: Boolean(config.includeBestOfN && config.highVarianceClipCount),
      highVarianceClips: config.highVarianceClipCount || 0,
      qualityValidationEnabled: config.includeQualityValidation !== false,
      timestamp: new Date(),
      estimatedDuration: config.estimatedDuration || config.clipCount * 5, // 5 seconds per clip default
    };

    return estimate;
  }

  /**
   * Estimate cost for an existing job from database
   */
  async estimateJobCost(jobId: string): Promise<CostEstimate | null> {
    try {
      const job = await storage.getJob(jobId);
      if (!job) {
        return null;
      }

      return this.estimateFromJob(job);
    } catch (err) {
      console.error('[Cost Estimator] Failed to estimate job cost:', err);
      return null;
    }
  }

  /**
   * Estimate cost from a Job object
   */
  estimateFromJob(job: Job): CostEstimate {
    const config: EstimationConfig = {
      clipCount: job.clipCount || this.estimateClipCount(job),
      mode: (job.mode || 'kling') as 'kling' | 'consistent' | 'unity_kling',
      includeMusic: job.mode === 'unity_kling' && !job.musicUrl, // Need music if not provided
      includeBestOfN: false, // TODO: Add bestOfN flag to job metadata
      highVarianceClipCount: 0, // TODO: Estimate high-variance clips
      includeQualityValidation: true, // Assume enabled by default
      estimatedDuration: job.audioDuration ? parseFloat(job.audioDuration) : undefined,
      customPromptGeneration: true,
    };

    const estimate = this.estimateCost(config);
    return {
      ...estimate,
      jobId: job.id,
    } as any;
  }

  /**
   * Check if job is within budget limits
   */
  async checkBudget(jobId: string, budgetLimit?: number): Promise<BudgetCheckResult> {
    const estimate = await this.estimateJobCost(jobId);

    if (!estimate) {
      return {
        allowed: false,
        estimate: null as any,
        reason: 'Failed to estimate job cost',
      };
    }

    // If no budget limit specified, allow by default
    if (!budgetLimit) {
      return {
        allowed: true,
        estimate,
      };
    }

    const allowed = estimate.breakdown.total <= budgetLimit;
    const budgetRemaining = budgetLimit - estimate.breakdown.total;

    return {
      allowed,
      estimate,
      budgetLimit,
      budgetRemaining,
      reason: allowed
        ? undefined
        : `Estimated cost $${estimate.breakdown.total.toFixed(2)} exceeds budget limit $${budgetLimit.toFixed(2)}`,
    };
  }

  /**
   * Estimate clip count from job if not specified
   */
  private estimateClipCount(job: Job): number {
    // If clip count is specified, use it
    if (job.clipCount) {
      return job.clipCount;
    }

    // If audio duration is known, estimate from that (5 seconds per clip)
    if (job.audioDuration) {
      return Math.ceil(parseFloat(job.audioDuration) / 5);
    }

    // If Unity package metadata includes prompt count, use that
    if (job.unityMetadata?.promptCount) {
      return job.unityMetadata.promptCount;
    }

    // Default estimate for typical short video (30 seconds = 6 clips)
    return 6;
  }

  /**
   * Compare actual cost vs estimate for learning
   */
  async trackEstimateAccuracy(jobId: string, actualCost: number): Promise<void> {
    try {
      const job = await storage.getJob(jobId);
      if (!job) {
        return;
      }

      const estimate = this.estimateFromJob(job);
      const estimatedCost = estimate.breakdown.total;
      const accuracy = (1 - Math.abs(estimatedCost - actualCost) / actualCost) * 100;

      console.log(
        `📊 [Cost Estimator] Job ${jobId}: Estimated $${estimatedCost.toFixed(2)}, Actual $${actualCost.toFixed(2)}, Accuracy: ${accuracy.toFixed(1)}%`,
      );

      // TODO: Store estimate accuracy in database for future improvements
      // This could feed into an ML model for better estimation over time
    } catch (err) {
      console.error('[Cost Estimator] Failed to track estimate accuracy:', err);
    }
  }

  /**
   * Get a human-readable cost breakdown summary
   */
  formatBreakdown(estimate: CostEstimate): string {
    const lines: string[] = [];
    const { breakdown } = estimate;

    lines.push(`Cost Estimate for ${(estimate.mode || 'UNKNOWN').toUpperCase()} Mode:`);
    lines.push(`  Clip Count: ${estimate.clipCount} clips`);

    if (breakdown.music > 0) {
      lines.push(`  Music Generation: $${breakdown.music.toFixed(2)}`);
    }

    lines.push(
      `  Video Generation: $${breakdown.videoGeneration.toFixed(2)} (${estimate.clipCount} × $${COST_CONSTANTS.KLING_PER_CLIP})`,
    );

    if (breakdown.bestOfN > 0) {
      lines.push(`  Best-of-N (${estimate.highVarianceClips} clips): $${breakdown.bestOfN.toFixed(2)}`);
    }

    if (breakdown.qualityValidation > 0) {
      lines.push(`  Quality Validation: $${breakdown.qualityValidation.toFixed(2)}`);
    }

    if (breakdown.promptGeneration > 0) {
      lines.push(`  Prompt Generation: $${breakdown.promptGeneration.toFixed(2)}`);
    }

    if (breakdown.audioAnalysis > 0) {
      lines.push(`  Audio Analysis: $${breakdown.audioAnalysis.toFixed(2)}`);
    }

    if (breakdown.other > 0) {
      lines.push(`  Other: $${breakdown.other.toFixed(2)}`);
    }

    lines.push(`  Subtotal: $${breakdown.subtotal.toFixed(2)}`);
    lines.push(`  Buffer (10%): $${breakdown.buffer.toFixed(2)}`);
    lines.push(`  TOTAL ESTIMATE: $${breakdown.total.toFixed(2)}`);

    return lines.join('\n');
  }
}

// Singleton instance
export const costEstimator = new CostEstimator();
