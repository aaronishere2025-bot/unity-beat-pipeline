/**
 * YouTube Channel Bandit Service - Thompson Sampling for channel selection
 *
 * Implements Thompson Sampling for YouTube channels with:
 * 1. Multi-objective reward: R = w_views × (views/1000) + w_ctr × CTR + w_retention × Retention
 * 2. Gamma decay (γ = 0.95) for trend adaptation
 * 3. Content-type specific tracking (lofi, trap, history)
 * 4. Automatic channel registration from youtube-oauth-simple
 */

import { db } from '../db';
import { youtubeChannelBanditArms, YoutubeChannelBanditArm } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

// ============================================================================
// MULTI-OBJECTIVE REWARD WEIGHTS
// ============================================================================
const REWARD_WEIGHTS = {
  w_views: 0.01, // 1000 views = 10 points
  w_ctr: 5.0, // High CTR is valuable (multiply by CTR % / 100)
  w_retention: 3.0, // Retention is critical (multiply by retention % / 100)
  w_likes: 0.1, // Likes are bonus (multiply by like count)
};

// Default gamma decay factor for trend adaptation
const DEFAULT_GAMMA = 0.95;

export interface ChannelRewardMetrics {
  views: number;
  ctr?: number; // Click-through rate (0-100)
  retention?: number; // Average retention % (0-100)
  likes?: number;
  contentType?: 'lofi' | 'trap' | 'history' | 'other';
}

export interface SelectedChannel {
  channelId: string; // Internal ID
  channelName: string;
  youtubeChannelId: string;
  sampledValue: number;
}

const MAX_CONSECUTIVE_USES = 3; // Switch channels after 3 uploads to avoid pattern detection

class YoutubeChannelBanditService {
  private initialized = false;
  private gamma: number = DEFAULT_GAMMA;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const existing = await db.select().from(youtubeChannelBanditArms);
    console.log(`📺 YouTube Channel Bandit: Loaded ${existing.length} channels (γ=${this.gamma})`);

    this.initialized = true;
  }

  /**
   * Register a new channel (called when user connects via OAuth)
   */
  async registerChannel(channelId: string, channelName: string, youtubeChannelId: string): Promise<void> {
    const existing = await db
      .select()
      .from(youtubeChannelBanditArms)
      .where(eq(youtubeChannelBanditArms.channelId, channelId))
      .limit(1);

    if (existing.length > 0) {
      console.log(`📺 Channel Bandit: Channel ${channelName} already registered`);
      return;
    }

    await db.insert(youtubeChannelBanditArms).values({
      channelId,
      channelName,
      youtubeChannelId,
    });

    console.log(`✅ Channel Bandit: Registered ${channelName} (${channelId})`);
  }

  /**
   * Apply gamma decay to all arms for trend adaptation
   */
  private async applyGammaDecay(): Promise<void> {
    const arms = await db.select().from(youtubeChannelBanditArms);

    for (const arm of arms) {
      const newAlpha = Math.max(1, (arm.alpha || 1) * this.gamma);
      const newBeta = Math.max(1, (arm.beta || 1) * this.gamma);

      await db
        .update(youtubeChannelBanditArms)
        .set({
          alpha: newAlpha,
          beta: newBeta,
          updatedAt: new Date(),
        })
        .where(eq(youtubeChannelBanditArms.channelId, arm.channelId));
    }

    console.log(`🎰 [Channel Bandit] Applied γ=${this.gamma} decay to all channels`);
  }

  /**
   * Calculate multi-objective reward
   */
  private calculateReward(metrics: ChannelRewardMetrics): number {
    const viewsComponent = REWARD_WEIGHTS.w_views * metrics.views;
    const ctrComponent = REWARD_WEIGHTS.w_ctr * ((metrics.ctr || 0) / 100);
    const retentionComponent = REWARD_WEIGHTS.w_retention * ((metrics.retention || 0) / 100);
    const likesComponent = REWARD_WEIGHTS.w_likes * (metrics.likes || 0);

    return viewsComponent + ctrComponent + retentionComponent + likesComponent;
  }

  /**
   * Sample from Beta distribution (simple approximation)
   */
  private sampleBeta(alpha: number, beta: number): number {
    // Use Gamma distribution approximation
    const gammaAlpha = this.gammaRandom(alpha, 1);
    const gammaBeta = this.gammaRandom(beta, 1);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  /**
   * Simple gamma distribution random sampling
   */
  private gammaRandom(shape: number, scale: number): number {
    if (shape < 1) {
      return this.gammaRandom(shape + 1, scale) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number, v: number;
      do {
        x = this.normalRandom();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();
      const x2 = x * x;

      if (u < 1 - 0.0331 * x2 * x2) {
        return d * v * scale;
      }

      if (Math.log(u) < 0.5 * x2 + d * (1 - v + Math.log(v))) {
        return d * v * scale;
      }
    }
  }

  /**
   * Box-Muller transform for normal distribution
   */
  private normalRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Thompson Sampling channel selection with anti-pattern bias
   */
  async selectChannel(contentType?: 'lofi' | 'trap' | 'history'): Promise<SelectedChannel | null> {
    await this.initialize();

    const arms = await db.select().from(youtubeChannelBanditArms);

    if (arms.length === 0) {
      console.log('⚠️ No channels registered in bandit');
      return null;
    }

    // Filter out channels used too many times consecutively
    const recentArm = arms.find((a) => a.consecutiveUses >= MAX_CONSECUTIVE_USES);
    let availableArms = arms;

    if (recentArm) {
      console.log(
        `📺 Channel Bandit: Forcing exploration (${recentArm.channelName} used ${recentArm.consecutiveUses} times)`,
      );
      availableArms = arms.filter((a) => a.channelId !== recentArm.channelId);

      if (availableArms.length === 0) {
        availableArms = arms;
      }
    }

    let bestArm: YoutubeChannelBanditArm | null = null;
    let bestSample = -1;

    for (const arm of availableArms) {
      // If content type is specified, boost alpha/beta based on past success for that type
      let adjustedAlpha = arm.alpha || 1;
      const adjustedBeta = arm.beta || 1;

      if (contentType === 'lofi' && arm.lofiSuccessRate) {
        adjustedAlpha += arm.lofiSuccessRate * 5;
      } else if (contentType === 'trap' && arm.trapSuccessRate) {
        adjustedAlpha += arm.trapSuccessRate * 5;
      } else if (contentType === 'history' && arm.historySuccessRate) {
        adjustedAlpha += arm.historySuccessRate * 5;
      }

      const sample = this.sampleBeta(adjustedAlpha, adjustedBeta);
      if (sample > bestSample) {
        bestSample = sample;
        bestArm = arm;
      }
    }

    if (!bestArm) {
      bestArm = availableArms[0];
      bestSample = 0.5;
    }

    // Increment usage counters
    await db
      .update(youtubeChannelBanditArms)
      .set({
        consecutiveUses: sql`${youtubeChannelBanditArms.consecutiveUses} + 1`,
        lastUsedAt: new Date(),
        trials: sql`${youtubeChannelBanditArms.trials} + 1`,
        totalUploads: sql`${youtubeChannelBanditArms.totalUploads} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(youtubeChannelBanditArms.channelId, bestArm.channelId));

    // Reset consecutive uses for other channels
    for (const arm of arms) {
      if (arm.channelId !== bestArm.channelId && arm.consecutiveUses > 0) {
        await db
          .update(youtubeChannelBanditArms)
          .set({ consecutiveUses: 0 })
          .where(eq(youtubeChannelBanditArms.channelId, arm.channelId));
      }
    }

    console.log(
      `📺 Channel Bandit: Selected "${bestArm.channelName}" (sampled: ${bestSample.toFixed(3)}${contentType ? `, type: ${contentType}` : ''})`,
    );

    return {
      channelId: bestArm.channelId,
      channelName: bestArm.channelName,
      youtubeChannelId: bestArm.youtubeChannelId,
      sampledValue: bestSample,
    };
  }

  /**
   * Update reward after video performance is known
   */
  async updateReward(channelId: string, metrics: ChannelRewardMetrics): Promise<void> {
    const arm = await db
      .select()
      .from(youtubeChannelBanditArms)
      .where(eq(youtubeChannelBanditArms.channelId, channelId))
      .limit(1);

    if (!arm.length) {
      console.log(`⚠️ Channel Bandit: Unknown channel "${channelId}"`);
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
      // Positive reward - increment alpha
      updates.alpha = (current.alpha || 1) + reward;
      updates.successes = (current.successes || 0) + 1;

      console.log(
        `✅ Channel Bandit: "${current.channelName}" REWARD +${reward.toFixed(2)} (views: ${metrics.views}, CTR: ${metrics.ctr?.toFixed(1)}%, retention: ${metrics.retention?.toFixed(1)}%)`,
      );
    } else {
      // No reward - increment beta
      updates.beta = (current.beta || 1) + 1.0;
      console.log(`❌ Channel Bandit: "${current.channelName}" NO REWARD`);
    }

    // Update rolling averages
    const trials = current.trials || 1;
    const currentAvgViews = current.avgViews || 0;
    const currentAvgCtr = current.avgCtr || 0;
    const currentAvgRetention = current.avgRetention || 0;
    const currentAvgLikes = current.avgLikes || 0;

    updates.avgViews = (currentAvgViews * (trials - 1) + metrics.views) / trials;
    updates.avgCtr = (currentAvgCtr * (trials - 1) + (metrics.ctr || 0)) / trials;
    updates.avgRetention = (currentAvgRetention * (trials - 1) + (metrics.retention || 0)) / trials;
    updates.avgLikes = (currentAvgLikes * (trials - 1) + (metrics.likes || 0)) / trials;

    // Update content-type specific success rates
    if (metrics.contentType) {
      const success = reward > 0 ? 1 : 0;

      if (metrics.contentType === 'lofi') {
        const currentRate = current.lofiSuccessRate || 0;
        updates.lofiSuccessRate = (currentRate * (trials - 1) + success) / trials;
      } else if (metrics.contentType === 'trap') {
        const currentRate = current.trapSuccessRate || 0;
        updates.trapSuccessRate = (currentRate * (trials - 1) + success) / trials;
      } else if (metrics.contentType === 'history') {
        const currentRate = current.historySuccessRate || 0;
        updates.historySuccessRate = (currentRate * (trials - 1) + success) / trials;
      }
    }

    await db.update(youtubeChannelBanditArms).set(updates).where(eq(youtubeChannelBanditArms.channelId, channelId));
  }

  /**
   * Get all registered channels
   */
  async getAllChannels(): Promise<YoutubeChannelBanditArm[]> {
    return await db.select().from(youtubeChannelBanditArms);
  }

  /**
   * Get statistics for a channel
   */
  async getChannelStats(channelId: string): Promise<YoutubeChannelBanditArm | null> {
    const result = await db
      .select()
      .from(youtubeChannelBanditArms)
      .where(eq(youtubeChannelBanditArms.channelId, channelId))
      .limit(1);

    return result[0] || null;
  }
}

export const youtubeChannelBandit = new YoutubeChannelBanditService();
