/**
 * User Cost Tracker Service
 * Handles cost calculation, billing, and commission for multi-tenant platform
 */

import Stripe from 'stripe';
import { db } from '../db.js';
import { jobs, apiUsage, users, beatStoreListings, beatStorePurchases } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { USER_PRICING, calculateUserCharge } from '../config/pricing.js';

// Legacy constant names for backwards compatibility
const PRICING = {
  BEAT_PRICE: USER_PRICING.BEAT_FLAT,
  BEAT_COST: USER_PRICING.BEAT_ACTUAL_COST,
  VIDEO_CLIP_PRICE: USER_PRICING.VIDEO_CLIP,
  VIDEO_CLIP_COST: USER_PRICING.VIDEO_CLIP_ACTUAL_COST,
  COMMISSION_GENERATED: USER_PRICING.COMMISSION_GENERATED,
  COMMISSION_EXTERNAL: USER_PRICING.COMMISSION_EXTERNAL,
};

interface CostBreakdown {
  totalCostUSD: number;
  userChargeUSD: number;
  breakdown: {
    suno: number;
    kling: number;
    openai: number;
    gemini: number;
    claude: number;
    other: number;
  };
}

interface ChargeResult {
  charged: boolean;
  usedFreeCredit: boolean;
  creditsRemaining?: number;
  stripeChargeId?: string;
  error?: string;
}

class UserCostTracker {
  private static instance: UserCostTracker;
  private stripe: Stripe;

  private constructor() {
    const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-12-15.clover' as any,
    });
  }

  static getInstance(): UserCostTracker {
    if (!UserCostTracker.instance) {
      UserCostTracker.instance = new UserCostTracker();
    }
    return UserCostTracker.instance;
  }

  /**
   * Calculate total cost for a job from API usage logs
   */
  async calculateJobCost(jobId: string): Promise<CostBreakdown> {
    const costs = await db.select().from(apiUsage).where(eq(apiUsage.jobId, jobId));

    const breakdown = {
      suno: 0,
      kling: 0,
      openai: 0,
      gemini: 0,
      claude: 0,
      other: 0,
    };

    let totalCostUSD = 0;

    for (const cost of costs) {
      const costValue = parseFloat(cost.cost as any) || 0;
      totalCostUSD += costValue;

      const service = cost.service.toLowerCase();
      if (service === 'suno') {
        breakdown.suno += costValue;
      } else if (service === 'kling') {
        breakdown.kling += costValue;
      } else if (service === 'openai') {
        breakdown.openai += costValue;
      } else if (service === 'gemini') {
        breakdown.gemini += costValue;
      } else if (service === 'claude' || service === 'anthropic') {
        breakdown.claude += costValue;
      } else {
        breakdown.other += costValue;
      }
    }

    // Calculate user charge based on job mode
    const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    const mode = job[0]?.mode;

    let userChargeUSD = 0;
    if (mode === 'music' || mode === 'beats') {
      // Beat generation: $2.50 flat
      userChargeUSD = PRICING.BEAT_PRICE;
    } else if (mode === 'kling' || mode === 'unity_kling') {
      // Video generation: $0.30 per clip
      const clipCount = job[0]?.clipCount || 0;
      userChargeUSD = clipCount * PRICING.VIDEO_CLIP_PRICE;
    } else {
      // Fallback: 300% markup on actual cost
      userChargeUSD = totalCostUSD * 3.0;
    }

    return {
      totalCostUSD,
      userChargeUSD,
      breakdown,
    };
  }

  /**
   * Update job with cost information
   */
  async updateJobCost(jobId: string): Promise<CostBreakdown> {
    const costBreakdown = await this.calculateJobCost(jobId);

    await db
      .update(jobs)
      .set({
        actualCostUSD: costBreakdown.totalCostUSD.toFixed(2),
        userChargeUSD: costBreakdown.userChargeUSD.toFixed(2),
      })
      .where(eq(jobs.id, jobId));

    return costBreakdown;
  }

  /**
   * Check if user has free credits remaining
   */
  async checkFreeCredits(userId: string, jobMode: string): Promise<boolean> {
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (user.length === 0) return false;

    // Free credits only apply to beats
    if (jobMode !== 'music' && jobMode !== 'beats') {
      return false;
    }

    return user[0].freeBeatCreditsRemaining > 0;
  }

  /**
   * Deduct free credit
   */
  async useFreeCredit(userId: string): Promise<void> {
    await db.execute(sql`
      UPDATE users
      SET free_beat_credits_remaining = free_beat_credits_remaining - 1
      WHERE id = ${userId}
      AND free_beat_credits_remaining > 0
    `);
  }

  /**
   * Charge user for a completed job
   * Handles free credits, Stripe charging, and refunds
   */
  async chargeUserForJob(userId: string, jobId: string): Promise<ChargeResult> {
    try {
      // Get job details
      const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (job.length === 0) {
        throw new Error(`Job ${jobId} not found`);
      }

      const jobData = job[0];
      const mode = jobData.mode;

      // Get user details
      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) {
        throw new Error(`User ${userId} not found`);
      }

      const userData = user[0];

      // Skip charging for admin tier accounts
      if (userData.subscriptionTier === 'admin') {
        await db
          .update(jobs)
          .set({
            chargedAt: new Date(),
            stripeChargeId: 'ADMIN_FREE',
          })
          .where(eq(jobs.id, jobId));

        console.log(`✨ Admin tier - No charge for user ${userData.email} (job ${jobId})`);

        return {
          charged: false,
          usedFreeCredit: false,
          adminFree: true,
        } as any;
      }

      // Update cost breakdown
      const costBreakdown = await this.updateJobCost(jobId);

      // Get current balance
      const currentBalance = parseFloat(userData.balance || '0');

      // Check if user has sufficient balance
      if (currentBalance < costBreakdown.userChargeUSD) {
        throw new Error(
          `Insufficient balance. Required: $${costBreakdown.userChargeUSD.toFixed(2)}, Available: $${currentBalance.toFixed(2)}`,
        );
      }

      // Deduct from balance
      await db.execute(sql`
        UPDATE users
        SET
          balance = balance - ${costBreakdown.userChargeUSD},
          total_spent = total_spent + ${costBreakdown.userChargeUSD}
        WHERE id = ${userId}
      `);

      // Record transaction
      await db.execute(sql`
        INSERT INTO user_credits (user_id, transaction_type, amount, description, created_at)
        VALUES (
          ${userId},
          'usage',
          ${-costBreakdown.userChargeUSD},
          ${`${mode === 'music' || mode === 'beats' ? 'Beat' : 'Video'} generation - Job ${jobId}`},
          NOW()
        )
      `);

      // Mark job as charged
      await db
        .update(jobs)
        .set({
          chargedAt: new Date(),
          stripeChargeId: 'BALANCE_DEDUCTED',
        })
        .where(eq(jobs.id, jobId));

      const newBalance = currentBalance - costBreakdown.userChargeUSD;
      console.log(
        `💰 Deducted $${costBreakdown.userChargeUSD.toFixed(2)} from ${userData.email} balance (${currentBalance.toFixed(2)} → ${newBalance.toFixed(2)})`,
      );

      return {
        charged: true,
        usedFreeCredit: false,
        stripeChargeId: 'BALANCE_DEDUCTED',
      };
    } catch (error) {
      console.error(`❌ Failed to charge user for job ${jobId}:`, error);
      return {
        charged: false,
        usedFreeCredit: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Refund a job charge (for failed jobs)
   */
  async refundJob(jobId: string): Promise<boolean> {
    try {
      const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (job.length === 0) return false;

      const stripeChargeId = job[0].stripeChargeId;
      const userId = job[0].userId;
      const userChargeUSD = parseFloat(job[0].userChargeUSD || '0');

      if (!stripeChargeId || stripeChargeId === 'FREE_CREDIT' || stripeChargeId === 'ADMIN_FREE') {
        // No charge to refund, or was free/admin
        return true;
      }

      // Add funds back to user balance
      if (stripeChargeId === 'BALANCE_DEDUCTED' && userId && userChargeUSD > 0) {
        await db.execute(sql`
          UPDATE users
          SET
            balance = balance + ${userChargeUSD},
            total_spent = total_spent - ${userChargeUSD}
          WHERE id = ${userId}
        `);

        // Record refund transaction
        await db.execute(sql`
          INSERT INTO user_credits (user_id, transaction_type, amount, description, created_at)
          VALUES (
            ${userId},
            'refund',
            ${userChargeUSD},
            ${'Refund for failed job ' + jobId},
            NOW()
          )
        `);

        console.log(`💸 Refunded $${userChargeUSD.toFixed(2)} to user ${userId} for job ${jobId}`);
      }

      // Clear charge info
      await db
        .update(jobs)
        .set({
          chargedAt: null,
          stripeChargeId: null,
        })
        .where(eq(jobs.id, jobId));

      return true;
    } catch (error) {
      console.error(`❌ Failed to refund job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * Calculate commission for a beat sale
   * Returns { platformFeeUSD, platformFeePercent }
   */
  async calculateBeatSaleCommission(
    listingId: string,
    saleAmount: number,
  ): Promise<{
    platformFeeUSD: number;
    platformFeePercent: number;
  }> {
    const listing = await db.select().from(beatStoreListings).where(eq(beatStoreListings.id, listingId)).limit(1);

    if (listing.length === 0) {
      throw new Error(`Listing ${listingId} not found`);
    }

    const isGenerated = listing[0].isGenerated;

    if (isGenerated) {
      // 0% commission on platform-generated beats
      return {
        platformFeeUSD: 0,
        platformFeePercent: 0,
      };
    } else {
      // 10% commission on external uploads
      const feePercent = PRICING.COMMISSION_EXTERNAL;
      const feeUSD = saleAmount * feePercent;
      return {
        platformFeeUSD: feeUSD,
        platformFeePercent: feePercent * 100, // Convert to percentage (10)
      };
    }
  }

  /**
   * Record a beat sale
   */
  async recordBeatSale(
    listingId: string,
    stripeSessionId: string,
    customerEmail: string,
    amountUSD: number,
  ): Promise<void> {
    const commission = await this.calculateBeatSaleCommission(listingId, amountUSD);

    await db.insert(beatStorePurchases).values({
      listingId,
      stripeSessionId,
      customerEmail,
      amountUSD: amountUSD.toFixed(2),
      platformFeeUSD: commission.platformFeeUSD.toFixed(2),
      platformFeePercent: commission.platformFeePercent.toFixed(2),
      deliveredAt: new Date(),
      createdAt: new Date(),
    });

    // Update listing stats
    await db.execute(sql`
      UPDATE beat_store_listings
      SET
        purchases = purchases + 1,
        total_revenue_usd = total_revenue_usd + ${amountUSD}
      WHERE id = ${listingId}
    `);

    console.log(
      `📦 Beat sale recorded: $${amountUSD.toFixed(2)} (${commission.platformFeePercent}% commission = $${commission.platformFeeUSD.toFixed(2)})`,
    );
  }
}

// Export singleton instance
export const userCostTracker = UserCostTracker.getInstance();
