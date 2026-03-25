/**
 * Style Bandit Service - Visual Style Thompson Sampling
 *
 * Implements Thompson Sampling for visual styles with:
 * 1. Multi-objective reward: R = w_ctr × CTR + w_vtr × VTR + w_sub × Subscribed
 * 2. Gamma decay (γ = 0.95) for trend adaptation
 * 3. Prevent YouTube's "Inauthentic Content" flags by varying styles every 5 videos
 * 4. Track which visual styles drive higher retention and CTR
 */

import { db } from '../db';
import { styleBanditArms, StyleBanditArm } from '@shared/schema';
import { eq, ne, asc, desc, sql } from 'drizzle-orm';

// ============================================================================
// MULTI-OBJECTIVE REWARD WEIGHTS
// ============================================================================
const REWARD_WEIGHTS = {
  w_ctr: 1.0, // Click is worth 1 point
  w_vtr: 2.0, // High retention is worth more (multiply by retention rate 0-1)
  w_sub: 10.0, // Subscriber is the ultimate prize (10 points)
};

// Default gamma decay factor for trend adaptation
const DEFAULT_GAMMA = 0.95;

export interface StyleParams {
  colorMultiplier: number;
  contrast: number;
  fontFamily: string;
  overlayTexture: string | null;
}

export interface SelectedStyle {
  styleName: string;
  params: StyleParams;
  sampledValue: number;
}

export interface RewardMetrics {
  clicked: boolean; // Did user click? (CTR component)
  vtr: number; // View-through rate 0-1 (retention)
  subscribed: boolean; // Did they subscribe?
}

const DEFAULT_STYLES: Array<{
  styleName: string;
  colorMultiplier: number;
  contrast: number;
  fontFamily: string;
  overlayTexture: string | null;
}> = [
  {
    styleName: 'gritty_warrior',
    colorMultiplier: 0.8,
    contrast: 30,
    fontFamily: 'Cinzel-Bold',
    overlayTexture: null,
  },
  {
    styleName: 'golden_empire',
    colorMultiplier: 1.2,
    contrast: 15,
    fontFamily: 'Cinzel-Regular',
    overlayTexture: null,
  },
  {
    styleName: 'parchment_history',
    colorMultiplier: 0.9,
    contrast: 10,
    fontFamily: 'OldEnglish',
    overlayTexture: 'parchment_texture.png',
  },
  {
    styleName: 'modern_dark',
    colorMultiplier: 0.7,
    contrast: 50,
    fontFamily: 'Roboto-Black',
    overlayTexture: null,
  },
];

const MAX_CONSECUTIVE_USES = 5;

class StyleBanditService {
  private initialized = false;
  private gamma: number = DEFAULT_GAMMA;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const existing = await db.select().from(styleBanditArms);

    if (existing.length === 0) {
      console.log('🎨 Style Bandit: Seeding default styles...');
      for (const style of DEFAULT_STYLES) {
        await db.insert(styleBanditArms).values({
          styleName: style.styleName,
          colorMultiplier: style.colorMultiplier,
          contrast: style.contrast,
          fontFamily: style.fontFamily,
          overlayTexture: style.overlayTexture,
        });
      }
      console.log(`✅ Style Bandit: Seeded ${DEFAULT_STYLES.length} visual styles (γ=${this.gamma})`);
    } else {
      console.log(`🎨 Style Bandit: Loaded ${existing.length} visual styles (γ=${this.gamma})`);
    }

    this.initialized = true;
  }

  /**
   * Apply gamma decay to all arms for trend adaptation
   * This ensures old trends "fade out" and new arms get a fair chance
   */
  private async applyGammaDecay(): Promise<void> {
    const arms = await db.select().from(styleBanditArms);

    for (const arm of arms) {
      const newAlpha = Math.max(1, (arm.alpha || 1) * this.gamma);
      const newBeta = Math.max(1, (arm.beta || 1) * this.gamma);

      await db
        .update(styleBanditArms)
        .set({
          alpha: newAlpha,
          beta: newBeta,
          updatedAt: new Date(),
        })
        .where(eq(styleBanditArms.styleName, arm.styleName));
    }

    console.log(`🎰 [Bandit] Applied γ=${this.gamma} decay to all arms`);
  }

  /**
   * Calculate multi-objective reward
   * R = w_ctr × CTR + w_vtr × VTR + w_sub × Subscribed
   */
  private calculateReward(metrics: RewardMetrics): number {
    const ctrComponent = REWARD_WEIGHTS.w_ctr * (metrics.clicked ? 1 : 0);
    const vtrComponent = REWARD_WEIGHTS.w_vtr * metrics.vtr;
    const subComponent = REWARD_WEIGHTS.w_sub * (metrics.subscribed ? 1 : 0);

    return ctrComponent + vtrComponent + subComponent;
  }

  /**
   * Thompson Sampling with anti-bot recency bias
   * Prevents more than 5 consecutive uses of the same style
   */
  async selectStyle(): Promise<SelectedStyle> {
    await this.initialize();

    const arms = await db.select().from(styleBanditArms);

    if (arms.length === 0) {
      throw new Error('No style arms available');
    }

    const recentArm = arms.find((a) => a.consecutiveUses >= MAX_CONSECUTIVE_USES);
    let availableArms = arms;

    if (recentArm) {
      console.log(
        `🎨 Style Bandit: Forcing exploration (${recentArm.styleName} used ${recentArm.consecutiveUses} times)`,
      );
      availableArms = arms.filter((a) => a.styleName !== recentArm.styleName);

      if (availableArms.length === 0) {
        availableArms = arms;
      }
    }

    let bestArm: StyleBanditArm | null = null;
    let bestSample = -1;

    for (const arm of availableArms) {
      const sample = this.sampleBeta(arm.alpha, arm.beta);
      if (sample > bestSample) {
        bestSample = sample;
        bestArm = arm;
      }
    }

    if (!bestArm) {
      bestArm = availableArms[0];
      bestSample = 0.5;
    }

    await db
      .update(styleBanditArms)
      .set({
        consecutiveUses: sql`${styleBanditArms.consecutiveUses} + 1`,
        lastUsedAt: new Date(),
        trials: sql`${styleBanditArms.trials} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(styleBanditArms.styleName, bestArm.styleName));

    for (const arm of arms) {
      if (arm.styleName !== bestArm.styleName && arm.consecutiveUses > 0) {
        await db
          .update(styleBanditArms)
          .set({ consecutiveUses: 0 })
          .where(eq(styleBanditArms.styleName, arm.styleName));
      }
    }

    console.log(`🎨 Style Bandit: Selected "${bestArm.styleName}" (sampled: ${bestSample.toFixed(3)})`);

    return {
      styleName: bestArm.styleName,
      params: {
        colorMultiplier: bestArm.colorMultiplier || 1.0,
        contrast: bestArm.contrast || 20,
        fontFamily: bestArm.fontFamily || 'Cinzel-Bold',
        overlayTexture: bestArm.overlayTexture,
      },
      sampledValue: bestSample,
    };
  }

  /**
   * Sanitize metric values to prevent NaN from breaking Thompson Sampling
   */
  private sanitizeMetric(val: number | null | undefined): number {
    if (val === null || val === undefined) return 0;
    return isNaN(val) ? 0 : val;
  }

  /**
   * Update reward using multi-objective function
   * R = w_ctr × CTR + w_vtr × VTR + w_sub × Subscribed
   *
   * Also applies gamma decay to all arms for trend adaptation
   */
  async updateReward(styleName: string, metrics: RewardMetrics): Promise<void> {
    const arm = await db.select().from(styleBanditArms).where(eq(styleBanditArms.styleName, styleName)).limit(1);

    if (!arm.length) {
      console.log(`⚠️ Style Bandit: Unknown style "${styleName}"`);
      return;
    }

    // Apply gamma decay to all arms first
    await this.applyGammaDecay();

    const current = arm[0];

    // Calculate multi-objective reward
    const reward = this.calculateReward(metrics);

    const updates: any = {
      updatedAt: new Date(),
    };

    if (reward > 0) {
      // Positive reward - increment alpha by reward amount
      updates.alpha = (current.alpha || 1) + reward;
      updates.successes = (current.successes || 0) + 1;
      console.log(
        `✅ Style Bandit: "${styleName}" REWARD +${reward.toFixed(2)} (click: ${metrics.clicked}, VTR: ${(metrics.vtr * 100).toFixed(1)}%, sub: ${metrics.subscribed})`,
      );
    } else {
      // Zero reward - increment failure
      updates.beta = (current.beta || 1) + 1.0;
      console.log(
        `❌ Style Bandit: "${styleName}" NO REWARD (click: ${metrics.clicked}, VTR: ${(metrics.vtr * 100).toFixed(1)}%, sub: ${metrics.subscribed})`,
      );
    }

    // Update rolling averages
    const trials = current.trials || 1;
    const sanitizedCtr = metrics.clicked ? 100 : 0;
    const sanitizedRetention = metrics.vtr * 100;

    const currentAvgCtr = this.sanitizeMetric(current.avgCtr);
    updates.avgCtr = (currentAvgCtr * (trials - 1) + sanitizedCtr) / trials;

    const currentAvgRetention = this.sanitizeMetric(current.avgRetention);
    updates.avgRetention = (currentAvgRetention * (trials - 1) + sanitizedRetention) / trials;

    await db.update(styleBanditArms).set(updates).where(eq(styleBanditArms.styleName, styleName));
  }

  /**
   * Record retention feedback from post-upload analysis
   * Used by RetentionClipCorrelator to feed learnings back
   */
  async recordRetentionFeedback(
    styleName: string,
    alphaChange: number,
    betaChange: number,
    reason: string,
  ): Promise<void> {
    const arm = await db.select().from(styleBanditArms).where(eq(styleBanditArms.styleName, styleName)).limit(1);

    if (!arm.length) {
      // Create new arm for this category if it doesn't exist
      console.log(`🎰 Style Bandit: Creating new arm for "${styleName}"`);
      await db.insert(styleBanditArms).values({
        styleName,
        colorMultiplier: 1.0,
        contrast: 20,
        fontFamily: 'Cinzel-Bold',
        overlayTexture: null,
        alpha: 1 + alphaChange,
        beta: 1 + betaChange,
      });
      return;
    }

    const current = arm[0];
    const updates: any = {
      updatedAt: new Date(),
    };

    if (alphaChange > 0) {
      updates.alpha = (current.alpha || 1) + alphaChange;
      updates.successes = (current.successes || 0) + 1;
    }
    if (betaChange > 0) {
      updates.beta = (current.beta || 1) + betaChange;
    }

    await db.update(styleBanditArms).set(updates).where(eq(styleBanditArms.styleName, styleName));

    console.log(`🎰 Style Bandit: "${styleName}" α+${alphaChange} β+${betaChange} (${reason})`);
  }

  /**
   * Record success or failure for a style based on video performance (legacy - backward compatible)
   * Now uses multi-objective reward internally
   */
  async recordOutcome(
    styleName: string,
    success: boolean,
    metrics?: {
      ctr?: number;
      retention?: number;
      views?: number;
      subscribed?: boolean;
    },
  ): Promise<void> {
    const arm = await db.select().from(styleBanditArms).where(eq(styleBanditArms.styleName, styleName)).limit(1);

    if (!arm.length) {
      console.log(`⚠️ Style Bandit: Unknown style "${styleName}"`);
      return;
    }

    // Apply gamma decay to all arms
    await this.applyGammaDecay();

    const current = arm[0];
    const updates: any = {
      updatedAt: new Date(),
    };

    // Convert legacy metrics to multi-objective format
    if (metrics) {
      const clicked = (metrics.ctr || 0) > 5; // CTR > 5% counts as clicked
      const vtr = Math.min(1, (metrics.retention || 0) / 100); // Convert to 0-1
      const subscribed = metrics.subscribed || false;

      // Calculate multi-objective reward
      const reward = this.calculateReward({ clicked, vtr, subscribed });

      if (reward > 0) {
        updates.alpha = (current.alpha || 1) + reward;
        updates.successes = (current.successes || 0) + 1;
        console.log(
          `✅ Style Bandit: "${styleName}" REWARD +${reward.toFixed(2)} (CTR: ${metrics.ctr}%, VTR: ${metrics.retention}%)`,
        );
      } else {
        updates.beta = (current.beta || 1) + 1.0;
        console.log(`❌ Style Bandit: "${styleName}" NO REWARD`);
      }
    } else {
      // Fallback to simple success/failure if no metrics
      if (success) {
        updates.alpha = (current.alpha || 1) + 1;
        updates.successes = (current.successes || 0) + 1;
      } else {
        updates.beta = (current.beta || 1) + 1;
      }
      console.log(`📊 Style Bandit: Recorded ${success ? 'success' : 'failure'} for "${styleName}"`);
    }

    if (metrics) {
      const trials = current.trials || 1;
      const sanitizedCtr = this.sanitizeMetric(metrics.ctr);
      const sanitizedRetention = this.sanitizeMetric(metrics.retention);
      const sanitizedViews = this.sanitizeMetric(metrics.views);

      if (sanitizedCtr > 0) {
        const currentAvg = this.sanitizeMetric(current.avgCtr);
        updates.avgCtr = (currentAvg * (trials - 1) + sanitizedCtr) / trials;
      }
      if (sanitizedRetention > 0) {
        const currentAvg = this.sanitizeMetric(current.avgRetention);
        updates.avgRetention = (currentAvg * (trials - 1) + sanitizedRetention) / trials;
      }
      if (sanitizedViews > 0) {
        const currentAvg = this.sanitizeMetric(current.avgViews);
        updates.avgViews = (currentAvg * (trials - 1) + sanitizedViews) / trials;
      }
    }

    await db.update(styleBanditArms).set(updates).where(eq(styleBanditArms.styleName, styleName));
  }

  /**
   * Get current arm scores with detailed metrics
   */
  async getArmScores(): Promise<
    Array<{
      armId: string;
      name: string;
      expectedReward: number;
      pulls: number;
      avgVTR: number;
      avgCTR: number;
      alpha: number;
      beta: number;
    }>
  > {
    await this.initialize();
    const arms = await db.select().from(styleBanditArms);

    return arms
      .map((arm) => ({
        armId: arm.styleName,
        name: arm.styleName,
        expectedReward: (arm.alpha || 1) / ((arm.alpha || 1) + (arm.beta || 1)),
        pulls: arm.trials || 0,
        avgVTR: this.sanitizeMetric(arm.avgRetention),
        avgCTR: this.sanitizeMetric(arm.avgCtr),
        alpha: arm.alpha || 1,
        beta: arm.beta || 1,
      }))
      .sort((a, b) => b.expectedReward - a.expectedReward);
  }

  /**
   * Get all style arms with their stats
   */
  async getStyleStats(): Promise<StyleBanditArm[]> {
    await this.initialize();
    return db.select().from(styleBanditArms).orderBy(desc(styleBanditArms.trials));
  }

  /**
   * Set gamma decay factor
   */
  setGamma(gamma: number): void {
    if (gamma <= 0 || gamma > 1) {
      console.warn('⚠️ Gamma must be between 0 and 1');
      return;
    }
    this.gamma = gamma;
    console.log(`🎨 Style Bandit: Set gamma decay factor to ${gamma}`);
  }

  /**
   * Get current gamma value
   */
  getGamma(): number {
    return this.gamma;
  }

  /**
   * Add a new style arm for experimentation
   * Cold start: alpha=1, beta=1 for high uncertainty
   */
  async addStyleArm(style: {
    styleName: string;
    colorMultiplier: number;
    contrast: number;
    fontFamily: string;
    overlayTexture?: string | null;
  }): Promise<void> {
    await this.initialize();

    const existing = await db
      .select()
      .from(styleBanditArms)
      .where(eq(styleBanditArms.styleName, style.styleName))
      .limit(1);

    if (existing.length > 0) {
      console.warn(`⚠️ Style arm "${style.styleName}" already exists`);
      return;
    }

    await db.insert(styleBanditArms).values({
      styleName: style.styleName,
      colorMultiplier: style.colorMultiplier,
      contrast: style.contrast,
      fontFamily: style.fontFamily,
      overlayTexture: style.overlayTexture || null,
      alpha: 1, // Cold start
      beta: 1,
    });

    console.log(`🎨 Style Bandit: Added new style arm "${style.styleName}" (cold start: α=1, β=1)`);
  }

  /**
   * Sample from Beta distribution using Gamma variates
   * Beta(a,b) = Gamma(a,1) / (Gamma(a,1) + Gamma(b,1))
   */
  private sampleBeta(alpha: number, beta: number): number {
    const a = alpha || 1;
    const b = beta || 1;

    const gammaA = this.sampleGamma(a);
    const gammaB = this.sampleGamma(b);

    return gammaA / (gammaA + gammaB);
  }

  /**
   * Sample from Gamma distribution using Marsaglia and Tsang's method
   */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number;
      let v: number;

      do {
        x = this.sampleNormal();
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
   * Sample from standard normal distribution using Box-Muller transform
   */
  private sampleNormal(): number {
    let u1 = 0,
      u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  // ===========================================================================
  // VISUAL QUALITY REWARD SYSTEM
  // Connect clip validation scores to style bandit for quality-driven learning
  // ===========================================================================

  /**
   * Visual quality score thresholds for reward/penalty
   */
  private readonly VISUAL_QUALITY_CONFIG = {
    highQualityThreshold: 80, // Score > 80 = reward
    lowQualityThreshold: 60, // Score < 60 = penalty
    highQualityReward: 1.5, // Alpha boost for high quality
    lowQualityPenalty: 1.5, // Beta increment for low quality
    criticalPenalty: 2.0, // Extra beta for critical failures (anachronisms, etc.)
    dimensionWeights: {
      eraAccuracy: 0.3,
      characterConsistency: 0.25,
      anachronismScore: 0.25,
      continuityScore: 0.2,
    },
  };

  /**
   * Record visual quality feedback from clip validation
   * Maps validation scores to alpha/beta updates for style learning
   *
   * @param styleName - The visual style used for this clip
   * @param scores - Individual dimension scores from historical accuracy validator
   * @param overallScore - Combined overall score (0-100)
   * @param passed - Whether the clip passed quality gate
   */
  async recordVisualQuality(
    styleName: string,
    scores: {
      eraAccuracy: number;
      characterConsistency: number;
      anachronismScore: number;
      continuityScore: number;
    },
    overallScore: number,
    passed: boolean,
  ): Promise<{
    alphaChange: number;
    betaChange: number;
    newSuccessRate: number;
  }> {
    await this.initialize();

    const arm = await db.select().from(styleBanditArms).where(eq(styleBanditArms.styleName, styleName)).limit(1);

    if (!arm.length) {
      console.warn(`⚠️ VISUAL QUALITY: Unknown style "${styleName}"`);
      return { alphaChange: 0, betaChange: 0, newSuccessRate: 0 };
    }

    const current = arm[0];

    // Apply gamma decay first
    await this.applyGammaDecay();

    let alphaChange = 0;
    let betaChange = 0;

    // Determine reward/penalty based on overall score
    if (overallScore >= this.VISUAL_QUALITY_CONFIG.highQualityThreshold) {
      // High quality - reward the style
      alphaChange = this.VISUAL_QUALITY_CONFIG.highQualityReward;

      // Bonus for perfect scores in specific dimensions
      if (scores.anachronismScore >= 90) alphaChange += 0.5; // No anachronisms
      if (scores.characterConsistency >= 90) alphaChange += 0.3; // Consistent character

      console.log(`✅ VISUAL QUALITY: "${styleName}" REWARD +${alphaChange.toFixed(2)}α`);
      console.log(`   Overall: ${overallScore}, Era: ${scores.eraAccuracy}, Char: ${scores.characterConsistency}`);
    } else if (overallScore < this.VISUAL_QUALITY_CONFIG.lowQualityThreshold) {
      // Low quality - penalize the style
      betaChange = this.VISUAL_QUALITY_CONFIG.lowQualityPenalty;

      // Extra penalty for critical failures
      if (scores.anachronismScore < 30) {
        betaChange += this.VISUAL_QUALITY_CONFIG.criticalPenalty;
        console.log(`   ⚠️ Critical anachronism failure detected`);
      }
      if (scores.characterConsistency < 30) {
        betaChange += 0.5;
        console.log(`   ⚠️ Character inconsistency detected`);
      }

      console.log(`❌ VISUAL QUALITY: "${styleName}" PENALTY +${betaChange.toFixed(2)}β`);
      console.log(`   Overall: ${overallScore}, Era: ${scores.eraAccuracy}, Anachronism: ${scores.anachronismScore}`);
    } else {
      // Medium quality - neutral (just apply decay, no reward/penalty)
      console.log(`📊 VISUAL QUALITY: "${styleName}" NEUTRAL (score: ${overallScore})`);
    }

    // Update the arm
    const newAlpha = (current.alpha || 1) + alphaChange;
    const newBeta = (current.beta || 1) + betaChange;
    const newSuccessRate = newAlpha / (newAlpha + newBeta);

    await db
      .update(styleBanditArms)
      .set({
        alpha: newAlpha,
        beta: newBeta,
        successes: passed ? (current.successes || 0) + 1 : current.successes,
        updatedAt: new Date(),
      })
      .where(eq(styleBanditArms.styleName, styleName));

    console.log(
      `   New α: ${newAlpha.toFixed(2)}, β: ${newBeta.toFixed(2)}, Rate: ${(newSuccessRate * 100).toFixed(1)}%`,
    );

    return { alphaChange, betaChange, newSuccessRate };
  }

  /**
   * Process batch of clip quality results for a job
   * Aggregates scores and applies weighted update
   */
  async recordJobVisualQuality(
    styleName: string,
    clipResults: Array<{
      eraAccuracy: number;
      characterConsistency: number;
      anachronismScore: number;
      continuityScore: number;
      overallScore: number;
      passed: boolean;
    }>,
  ): Promise<{
    totalAlphaChange: number;
    totalBetaChange: number;
    avgOverallScore: number;
    passRate: number;
  }> {
    if (clipResults.length === 0) {
      return { totalAlphaChange: 0, totalBetaChange: 0, avgOverallScore: 0, passRate: 0 };
    }

    let totalAlphaChange = 0;
    let totalBetaChange = 0;

    // Process each clip
    for (const clip of clipResults) {
      const result = await this.recordVisualQuality(
        styleName,
        {
          eraAccuracy: clip.eraAccuracy,
          characterConsistency: clip.characterConsistency,
          anachronismScore: clip.anachronismScore,
          continuityScore: clip.continuityScore,
        },
        clip.overallScore,
        clip.passed,
      );
      totalAlphaChange += result.alphaChange;
      totalBetaChange += result.betaChange;
    }

    const avgOverallScore = clipResults.reduce((sum, c) => sum + c.overallScore, 0) / clipResults.length;
    const passRate = clipResults.filter((c) => c.passed).length / clipResults.length;

    console.log(`📊 JOB VISUAL QUALITY: "${styleName}"`);
    console.log(
      `   ${clipResults.length} clips, Avg: ${avgOverallScore.toFixed(1)}, Pass: ${(passRate * 100).toFixed(0)}%`,
    );
    console.log(`   Total Δα: ${totalAlphaChange.toFixed(2)}, Δβ: ${totalBetaChange.toFixed(2)}`);

    return { totalAlphaChange, totalBetaChange, avgOverallScore, passRate };
  }
}

export const styleBanditService = new StyleBanditService();
