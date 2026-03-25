/**
 * ERROR FIX BANDIT SERVICE
 *
 * Thompson Sampling for error fix strategy experimentation.
 * Automatically learns which fix strategies work best for different error types.
 *
 * Features:
 * - Multi-objective reward: R = 10×JobSuccess + 5×ErrorResolved + FastFix bonus
 * - Gamma decay (γ = 0.95) for trend adaptation
 * - Cold start exploration for new arms
 *
 * Tracks:
 * - Fix strategies (timeout increase, rate limit backoff, file creation, etc.)
 * - Success rates per error category
 * - Fix application time
 * - Job recovery rate
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// MULTI-OBJECTIVE REWARD WEIGHTS
// ============================================================================
const REWARD_WEIGHTS = {
  w_job_success: 10.0, // Job succeeding is the ultimate goal
  w_error_resolved: 5.0, // Error going away is valuable
  w_fast_fix_30s: 5.0, // Bonus for very fast fixes (< 30s)
  w_fast_fix_60s: 2.0, // Bonus for fast fixes (< 60s)
};

// Default gamma decay factor for trend adaptation
const DEFAULT_GAMMA = 0.95;

// ============================================================================
// ERROR FIX ARMS - Different fix strategies to test
// ============================================================================

export interface ErrorFixArm {
  id: string;
  name: string;
  description: string;

  // Applicable error categories
  errorCategories: string[];

  // Fix strategy configuration
  fixStrategy: {
    type: 'config_update' | 'retry' | 'code_change' | 'restart';
    target: string;
    changes: Record<string, any>;
  };

  // Thompson Sampling state
  alpha: number; // Successes + 1
  beta: number; // Failures + 1
  pulls: number; // Times selected

  // Performance tracking
  avgFixTime: number; // Average time to apply fix (seconds)
  avgJobSuccessRate: number; // % of jobs that succeed after fix
  totalJobsFixed: number; // Total jobs successfully fixed
  errorIds: string[]; // Error IDs this strategy fixed

  lastUsed: string | null;
  createdAt: string;
}

// Multi-objective reward metrics interface
export interface RewardMetrics {
  jobSucceeded: boolean; // Did job succeed after fix?
  fixTime: number; // How long did fix take (seconds)?
  errorResolved: boolean; // Did error go away?
}

// Default fix strategy arms to start experimenting with
const DEFAULT_FIX_ARMS: Omit<
  ErrorFixArm,
  | 'alpha'
  | 'beta'
  | 'pulls'
  | 'avgFixTime'
  | 'avgJobSuccessRate'
  | 'totalJobsFixed'
  | 'errorIds'
  | 'lastUsed'
  | 'createdAt'
>[] = [
  {
    id: 'timeout_increase_50',
    name: 'Timeout Increase 50%',
    description: 'Increase API timeout by 50% with exponential backoff',
    errorCategories: ['API_ERROR', 'TIMEOUT_ERROR'],
    fixStrategy: {
      type: 'config_update',
      target: 'api-timeout',
      changes: { timeoutMultiplier: 1.5, backoff: 'exponential' },
    },
  },
  {
    id: 'rate_limit_backoff',
    name: 'Rate Limit Backoff',
    description: 'Wait 60s with jitter, then retry',
    errorCategories: ['API_ERROR', 'KLING_ERROR', 'SUNO_ERROR'],
    fixStrategy: {
      type: 'retry',
      target: 'api-call',
      changes: { waitTime: 60, jitter: 0.2 },
    },
  },
  {
    id: 'create_missing_dir',
    name: 'Create Missing Directory',
    description: 'Create parent directory and retry with absolute path',
    errorCategories: ['FILE_ERROR'],
    fixStrategy: {
      type: 'config_update',
      target: 'file-system',
      changes: { createDir: true, useAbsolutePath: true },
    },
  },
  {
    id: 'db_reconnect',
    name: 'Database Reconnect',
    description: 'Close and reconnect to database with retry',
    errorCategories: ['DATABASE_ERROR'],
    fixStrategy: {
      type: 'restart',
      target: 'database-connection',
      changes: { maxRetries: 3, retryDelay: 5000 },
    },
  },
  {
    id: 'reduce_batch_size',
    name: 'Reduce Batch Size',
    description: 'Halve batch size to reduce memory pressure',
    errorCategories: ['MEMORY_ERROR'],
    fixStrategy: {
      type: 'config_update',
      target: 'batch-processing',
      changes: { batchSizeMultiplier: 0.5 },
    },
  },
  {
    id: 'kling_retry_different_prompt',
    name: 'Kling Prompt Variation',
    description: 'Retry with simplified prompt (remove complex motions)',
    errorCategories: ['KLING_ERROR', 'VALIDATION_ERROR'],
    fixStrategy: {
      type: 'config_update',
      target: 'kling-prompt',
      changes: { simplifyMotion: true, removeCameraMove: true },
    },
  },
  {
    id: 'timeout_increase_100',
    name: 'Timeout Increase 100%',
    description: 'Double the API timeout for very slow endpoints',
    errorCategories: ['API_ERROR', 'TIMEOUT_ERROR', 'KLING_ERROR'],
    fixStrategy: {
      type: 'config_update',
      target: 'api-timeout',
      changes: { timeoutMultiplier: 2.0, backoff: 'exponential' },
    },
  },
  {
    id: 'retry_with_delay',
    name: 'Retry with Delay',
    description: 'Wait 30s and retry without changes',
    errorCategories: ['API_ERROR', 'SUNO_ERROR', 'KLING_ERROR'],
    fixStrategy: {
      type: 'retry',
      target: 'api-call',
      changes: { waitTime: 30, jitter: 0.1 },
    },
  },
];

interface ErrorFixBanditState {
  arms: Record<string, ErrorFixArm>;
  gamma: number; // Decay factor for trend adaptation
  errorCategoryMapping: Record<string, string[]>; // errorCategory -> applicable armIds
  lastUpdated: string;
  lastDecayApplied: string | null;
}

class ErrorFixBanditService {
  private dataPath: string;
  private state: ErrorFixBanditState;

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'error_fix_bandit.json');
    this.state = this.loadState();
  }

  private loadState(): ErrorFixBanditState {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });

      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        // Ensure gamma exists for backward compatibility
        if (!data.gamma) {
          data.gamma = DEFAULT_GAMMA;
        }
        // Ensure all new fields exist for backward compatibility
        for (const arm of Object.values(data.arms) as ErrorFixArm[]) {
          if (!arm.errorIds) {
            arm.errorIds = [];
          }
          if (arm.totalJobsFixed === undefined) {
            arm.totalJobsFixed = 0;
          }
        }
        console.log(
          `🎰 Error Fix Bandit: Loaded ${Object.keys(data.arms || {}).length} fix strategy arms (γ=${data.gamma})`,
        );
        return data;
      }
    } catch (error) {
      console.warn('⚠️ Could not load Error Fix Bandit state');
    }

    // Initialize with default arms
    return this.initializeDefaultState();
  }

  private initializeDefaultState(): ErrorFixBanditState {
    const arms: Record<string, ErrorFixArm> = {};
    const errorCategoryMapping: Record<string, string[]> = {};

    for (const arm of DEFAULT_FIX_ARMS) {
      arms[arm.id] = {
        ...arm,
        alpha: 1, // Cold start: alpha=1, beta=1 for high uncertainty
        beta: 1,
        pulls: 0,
        avgFixTime: 0,
        avgJobSuccessRate: 0,
        totalJobsFixed: 0,
        errorIds: [],
        lastUsed: null,
        createdAt: new Date().toISOString(),
      };

      // Build error category mapping
      for (const category of arm.errorCategories) {
        if (!errorCategoryMapping[category]) {
          errorCategoryMapping[category] = [];
        }
        errorCategoryMapping[category].push(arm.id);
      }
    }

    const state: ErrorFixBanditState = {
      arms,
      gamma: DEFAULT_GAMMA,
      errorCategoryMapping,
      lastUpdated: new Date().toISOString(),
      lastDecayApplied: null,
    };

    this.saveState(state);
    console.log(
      `🎰 Error Fix Bandit: Initialized with ${DEFAULT_FIX_ARMS.length} fix strategy arms (γ=${DEFAULT_GAMMA})`,
    );

    return state;
  }

  private saveState(state: ErrorFixBanditState = this.state): void {
    try {
      writeFileSync(this.dataPath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('❌ Error Fix Bandit: Failed to save state', error);
    }
  }

  /**
   * Sample from Beta distribution using Gamma distribution
   * Beta(α, β) = Gamma(α, 1) / (Gamma(α, 1) + Gamma(β, 1))
   */
  private sampleBeta(alpha: number, beta: number): number {
    const x = this.sampleGamma(alpha);
    const y = this.sampleGamma(beta);
    return x / (x + y);
  }

  /**
   * Sample from Gamma distribution using Marsaglia and Tsang method
   */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number, v: number;
      do {
        const u1 = Math.random();
        const u2 = Math.random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  /**
   * Select a fix strategy using Thompson Sampling
   * Returns the strategy with highest sampled probability of success
   */
  selectFixStrategy(errorCategory: string): {
    strategyId: string;
    strategyName: string;
    fixStrategy: any;
    confidence: number;
    isExploration: boolean;
  } {
    // Get applicable arms for this error category
    const applicableArmIds = this.state.errorCategoryMapping[errorCategory] || [];

    if (applicableArmIds.length === 0) {
      throw new Error(`No fix strategies available for error category: ${errorCategory}`);
    }

    const samples: Array<{
      id: string;
      sample: number;
      mean: number;
      arm: ErrorFixArm;
    }> = [];

    // Sample from each applicable arm's Beta distribution
    for (const armId of applicableArmIds) {
      const arm = this.state.arms[armId];
      if (!arm) continue;

      const sample = this.sampleBeta(arm.alpha, arm.beta);
      const mean = arm.alpha / (arm.alpha + arm.beta);
      samples.push({ id: armId, sample, mean, arm });
    }

    // Select arm with highest sample
    samples.sort((a, b) => b.sample - a.sample);
    const selected = samples[0];

    // Update pull count
    selected.arm.pulls++;
    selected.arm.lastUsed = new Date().toISOString();
    this.state.lastUpdated = new Date().toISOString();
    this.saveState();

    // Calculate confidence (more pulls = higher confidence)
    const confidence = Math.min(0.95, selected.arm.pulls / (selected.arm.pulls + 10));

    // Check if this is exploration (not the current best arm)
    const bestMeanArm = samples.sort((a, b) => b.mean - a.mean)[0];
    const isExploration = selected.id !== bestMeanArm.id;

    console.log(`🎰 ERROR FIX BANDIT: Selected "${selected.arm.name}" for ${errorCategory}`);
    console.log(`   Sample: ${selected.sample.toFixed(3)}, Mean: ${selected.mean.toFixed(3)}`);
    console.log(`   Pulls: ${selected.arm.pulls}, ${isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'}`);

    return {
      strategyId: selected.id,
      strategyName: selected.arm.name,
      fixStrategy: selected.arm.fixStrategy,
      confidence,
      isExploration,
    };
  }

  /**
   * Update reward using multi-objective function
   * R = 10×JobSuccess + 5×ErrorResolved + FastFix bonus
   *
   * Also applies gamma decay to all arms for trend adaptation
   */
  updateReward(strategyId: string, metrics: RewardMetrics): void {
    const arm = this.state.arms[strategyId];
    if (!arm) {
      console.warn(`⚠️ Unknown strategy ID: ${strategyId}`);
      return;
    }

    // Apply gamma decay to all arms first
    this.applyGammaDecay();

    // Calculate multi-objective reward
    const reward = this.calculateReward(metrics);

    // Update the chosen arm based on reward
    if (reward > 0) {
      // Positive reward - increment alpha by reward amount
      arm.alpha += reward;
      console.log(
        `✅ ERROR FIX BANDIT: "${arm.name}" REWARD +${reward.toFixed(2)} (job success: ${metrics.jobSucceeded}, error resolved: ${metrics.errorResolved}, fix time: ${metrics.fixTime.toFixed(1)}s)`,
      );

      // Track successful job fix
      if (metrics.jobSucceeded) {
        arm.totalJobsFixed++;
      }
    } else {
      // Zero reward (fix didn't help) - increment failure
      arm.beta += 1.0;
      console.log(
        `❌ ERROR FIX BANDIT: "${arm.name}" NO REWARD (job success: ${metrics.jobSucceeded}, error resolved: ${metrics.errorResolved})`,
      );
    }

    // Update rolling averages
    const n = Math.max(1, arm.pulls);
    arm.avgFixTime = (arm.avgFixTime * (n - 1) + metrics.fixTime) / n;
    arm.avgJobSuccessRate = (arm.avgJobSuccessRate * (n - 1) + (metrics.jobSucceeded ? 100 : 0)) / n;

    this.saveState();
  }

  /**
   * Calculate multi-objective reward
   */
  private calculateReward(metrics: RewardMetrics): number {
    let reward = 0;

    if (metrics.jobSucceeded) {
      reward += REWARD_WEIGHTS.w_job_success;
    }

    if (metrics.errorResolved) {
      reward += REWARD_WEIGHTS.w_error_resolved;
    }

    // Bonus for fast fixes
    if (metrics.fixTime < 30) {
      reward += REWARD_WEIGHTS.w_fast_fix_30s;
    } else if (metrics.fixTime < 60) {
      reward += REWARD_WEIGHTS.w_fast_fix_60s;
    }

    return reward;
  }

  /**
   * Apply gamma decay to all arms for trend adaptation
   * α' = 1 + γ(α - 1)
   * β' = 1 + γ(β - 1)
   */
  private applyGammaDecay(): void {
    const now = new Date();
    const lastDecay = this.state.lastDecayApplied ? new Date(this.state.lastDecayApplied) : null;

    // Only apply decay once per day
    if (lastDecay && now.getTime() - lastDecay.getTime() < 24 * 60 * 60 * 1000) {
      return;
    }

    const gamma = this.state.gamma;

    for (const arm of Object.values(this.state.arms)) {
      arm.alpha = 1 + gamma * (arm.alpha - 1);
      arm.beta = 1 + gamma * (arm.beta - 1);
    }

    this.state.lastDecayApplied = now.toISOString();
    console.log(`📉 ERROR FIX BANDIT: Applied gamma decay (γ=${gamma}) to all arms`);
  }

  /**
   * Get best strategy for error category (exploitation only, no exploration)
   */
  getBestStrategy(errorCategory: string): ErrorFixArm | null {
    const applicableArmIds = this.state.errorCategoryMapping[errorCategory] || [];

    if (applicableArmIds.length === 0) {
      return null;
    }

    let bestArm: ErrorFixArm | null = null;
    let bestMean = -1;

    for (const armId of applicableArmIds) {
      const arm = this.state.arms[armId];
      if (!arm) continue;

      const mean = arm.alpha / (arm.alpha + arm.beta);
      if (mean > bestMean) {
        bestMean = mean;
        bestArm = arm;
      }
    }

    return bestArm;
  }

  /**
   * Add a new fix strategy dynamically
   */
  addFixStrategy(
    arm: Omit<
      ErrorFixArm,
      | 'alpha'
      | 'beta'
      | 'pulls'
      | 'avgFixTime'
      | 'avgJobSuccessRate'
      | 'totalJobsFixed'
      | 'errorIds'
      | 'lastUsed'
      | 'createdAt'
    >,
  ): void {
    if (this.state.arms[arm.id]) {
      console.warn(`⚠️ Strategy ${arm.id} already exists, skipping`);
      return;
    }

    this.state.arms[arm.id] = {
      ...arm,
      alpha: 1,
      beta: 1,
      pulls: 0,
      avgFixTime: 0,
      avgJobSuccessRate: 0,
      totalJobsFixed: 0,
      errorIds: [],
      lastUsed: null,
      createdAt: new Date().toISOString(),
    };

    // Update error category mapping
    for (const category of arm.errorCategories) {
      if (!this.state.errorCategoryMapping[category]) {
        this.state.errorCategoryMapping[category] = [];
      }
      this.state.errorCategoryMapping[category].push(arm.id);
    }

    this.saveState();
    console.log(`➕ ERROR FIX BANDIT: Added new strategy "${arm.name}"`);
  }

  /**
   * Get statistics for all arms
   */
  getStatistics(): {
    totalPulls: number;
    totalSuccesses: number;
    armStats: Array<{
      id: string;
      name: string;
      pulls: number;
      successRate: number;
      avgFixTime: number;
      totalJobsFixed: number;
    }>;
  } {
    const arms = Object.values(this.state.arms);
    const totalPulls = arms.reduce((sum, arm) => sum + arm.pulls, 0);
    const totalSuccesses = arms.reduce((sum, arm) => sum + arm.totalJobsFixed, 0);

    const armStats = arms.map((arm) => ({
      id: arm.id,
      name: arm.name,
      pulls: arm.pulls,
      successRate: arm.alpha / (arm.alpha + arm.beta),
      avgFixTime: arm.avgFixTime,
      totalJobsFixed: arm.totalJobsFixed,
    }));

    return {
      totalPulls,
      totalSuccesses,
      armStats,
    };
  }
}

// Export singleton instance
export const errorFixBandit = new ErrorFixBanditService();
