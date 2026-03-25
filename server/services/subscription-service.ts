import Stripe from 'stripe';
import { db } from '../db.js';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_DISTRIBUTION_PRICE_ID = process.env.STRIPE_DISTRIBUTION_PRICE_ID || '';
const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || '';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Subscription tier types
export type SubscriptionTier = 'free' | 'distribution' | 'pro';

// Feature limits per tier
export const TIER_LIMITS = {
  free: {
    beatCreditsPerMonth: 5, // 5 free beats on signup, no monthly refresh
    canUseCrossPost: false,
    canSchedule: false,
    canUseAPI: false,
    priorityQueue: false,
    supportLevel: 'community' as const,
  },
  distribution: {
    beatCreditsPerMonth: Infinity, // Unlimited
    canUseCrossPost: true,
    canSchedule: true,
    canUseAPI: false,
    priorityQueue: false,
    supportLevel: 'priority' as const,
  },
  pro: {
    beatCreditsPerMonth: Infinity, // Unlimited
    canUseCrossPost: true,
    canSchedule: true,
    canUseAPI: true,
    priorityQueue: true,
    supportLevel: 'white-glove' as const,
  },
} as const;

class SubscriptionService {
  private static instance: SubscriptionService;
  private stripe: Stripe;

  private constructor() {
    this.stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover' as any,
    });
  }

  static getInstance(): SubscriptionService {
    if (!SubscriptionService.instance) {
      SubscriptionService.instance = new SubscriptionService();
    }
    return SubscriptionService.instance;
  }

  /**
   * Create a Stripe checkout session for subscription
   */
  async createCheckoutSession(params: {
    userId: string;
    tier: 'distribution' | 'pro';
    successUrl?: string;
    cancelUrl?: string;
  }): Promise<{ sessionId: string; url: string }> {
    const { userId, tier, successUrl, cancelUrl } = params;

    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw new Error('User not found');
    }

    // Get price ID
    const priceId = tier === 'distribution' ? STRIPE_DISTRIBUTION_PRICE_ID : STRIPE_PRO_PRICE_ID;

    if (!priceId) {
      throw new Error(`Price ID not configured for tier: ${tier}`);
    }

    // Create or get Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: user.displayName || undefined,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;

      // Update user with Stripe customer ID
      await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
    }

    // Create checkout session
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl || `${FRONTEND_URL}/dashboard?subscription=success`,
      cancel_url: cancelUrl || `${FRONTEND_URL}/pricing?subscription=canceled`,
      metadata: {
        userId: user.id,
        tier,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          tier,
        },
      },
    });

    return {
      sessionId: session.id,
      url: session.url!,
    };
  }

  /**
   * Handle successful subscription checkout
   */
  async handleCheckoutSuccess(sessionId: string): Promise<void> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    if (!session.metadata?.userId) {
      throw new Error('User ID not found in session metadata');
    }

    const userId = session.metadata.userId;
    const tier = session.metadata.tier as SubscriptionTier;
    const subscription = session.subscription as Stripe.Subscription;

    // Update user subscription
    await db
      .update(users)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
        subscriptionCurrentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Handle subscription updates from webhooks
   */
  async handleSubscriptionUpdate(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata.userId;
    if (!userId) {
      console.error('User ID not found in subscription metadata');
      return;
    }

    const tier = subscription.metadata.tier as SubscriptionTier;

    // Update user subscription status
    await db
      .update(users)
      .set({
        subscriptionTier: tier,
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
        subscriptionCurrentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      })
      .where(eq(users.id, userId));
  }

  /**
   * Handle subscription cancellation
   */
  async handleSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata.userId;
    if (!userId) {
      console.error('User ID not found in subscription metadata');
      return;
    }

    // Downgrade to free tier
    await db
      .update(users)
      .set({
        subscriptionTier: 'free',
        subscriptionStatus: 'canceled',
        subscriptionCurrentPeriodEnd: null,
      })
      .where(eq(users.id, userId));
  }

  /**
   * Cancel a user's subscription
   */
  async cancelSubscription(userId: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user?.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    // Cancel at period end (don't cancel immediately)
    await this.stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    // Update status
    await db
      .update(users)
      .set({
        subscriptionStatus: 'canceling', // Custom status to show it will cancel
      })
      .where(eq(users.id, userId));
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(userId: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user?.stripeSubscriptionId) {
      throw new Error('No subscription found');
    }

    // Remove cancel_at_period_end
    const subscription = await this.stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    // Update status
    await db
      .update(users)
      .set({
        subscriptionStatus: subscription.status,
      })
      .where(eq(users.id, userId));
  }

  /**
   * Check if user has access to a feature
   */
  async hasFeatureAccess(userId: string, feature: keyof (typeof TIER_LIMITS)['free']): Promise<boolean> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      return false;
    }

    const tier = user.subscriptionTier as SubscriptionTier;
    const limits = TIER_LIMITS[tier];

    return Boolean(limits[feature]);
  }

  /**
   * Get user subscription details
   */
  async getUserSubscription(userId: string) {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
      throw new Error('User not found');
    }

    const tier = user.subscriptionTier as SubscriptionTier;
    const limits = TIER_LIMITS[tier];

    let stripeSubscription: Stripe.Subscription | null = null;
    if (user.stripeSubscriptionId) {
      try {
        stripeSubscription = await this.stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      } catch (error) {
        console.error('Failed to retrieve Stripe subscription:', error);
      }
    }

    return {
      tier,
      status: user.subscriptionStatus,
      currentPeriodEnd: user.subscriptionCurrentPeriodEnd,
      limits,
      cancelAtPeriodEnd: stripeSubscription?.cancel_at_period_end || false,
    };
  }

  /**
   * Create a customer portal session for managing subscription
   */
  async createPortalSession(userId: string, returnUrl?: string): Promise<{ url: string }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user?.stripeCustomerId) {
      throw new Error('No Stripe customer found');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl || `${FRONTEND_URL}/dashboard`,
    });

    return {
      url: session.url,
    };
  }
}

export const subscriptionService = SubscriptionService.getInstance();
