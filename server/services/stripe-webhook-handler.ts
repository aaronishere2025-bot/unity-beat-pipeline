/**
 * Stripe Webhook Handler
 * Processes Stripe webhook events for payment success, failures, and refunds
 */

import Stripe from 'stripe';
import { db } from '../db.js';
import { jobs, beatStorePurchases, beatStoreListings, users } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { userCostTracker } from './user-cost-tracker.js';

interface WebhookResult {
  processed: boolean;
  message: string;
  error?: string;
}

class StripeWebhookHandler {
  private static instance: StripeWebhookHandler;
  private stripe: Stripe;

  private constructor() {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2025-12-15.clover' as any,
    });
  }

  static getInstance(): StripeWebhookHandler {
    if (!StripeWebhookHandler.instance) {
      StripeWebhookHandler.instance = new StripeWebhookHandler();
    }
    return StripeWebhookHandler.instance;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET not configured');
    }

    return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  }

  /**
   * Handle webhook event
   */
  async handleEvent(event: Stripe.Event): Promise<WebhookResult> {
    try {
      console.log(`📨 Stripe webhook received: ${event.type}`);

      switch (event.type) {
        case 'checkout.session.completed':
          return await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);

        case 'payment_intent.succeeded':
          return await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);

        case 'payment_intent.payment_failed':
          return await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);

        case 'charge.refunded':
          return await this.handleChargeRefunded(event.data.object as Stripe.Charge);

        case 'customer.created':
          return await this.handleCustomerCreated(event.data.object as Stripe.Customer);

        default:
          console.log(`⏭️  Unhandled event type: ${event.type}`);
          return {
            processed: false,
            message: `Unhandled event type: ${event.type}`,
          };
      }
    } catch (error) {
      console.error(`❌ Webhook handler error:`, error);
      return {
        processed: false,
        message: 'Webhook processing failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle checkout session completed (beat purchase)
   */
  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<WebhookResult> {
    try {
      const listingId = session.metadata?.listingId;
      if (!listingId) {
        return { processed: false, message: 'No listing ID in metadata' };
      }

      // Get listing details
      const listing = await db.select().from(beatStoreListings).where(eq(beatStoreListings.id, listingId)).limit(1);

      if (listing.length === 0) {
        return { processed: false, message: `Listing ${listingId} not found` };
      }

      const amountUSD = (session.amount_total || 0) / 100; // Convert from cents

      // Record purchase
      await userCostTracker.recordBeatSale(
        listingId,
        session.id,
        session.customer_email || 'unknown@example.com',
        amountUSD,
      );

      console.log(`✅ Beat sale recorded: $${amountUSD} for listing ${listingId}`);

      return {
        processed: true,
        message: `Beat purchase completed: $${amountUSD}`,
      };
    } catch (error) {
      console.error('Checkout session handler error:', error);
      return {
        processed: false,
        message: 'Failed to process checkout session',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle payment intent succeeded
   */
  private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<WebhookResult> {
    try {
      const jobId = paymentIntent.metadata?.jobId;
      if (!jobId) {
        return { processed: false, message: 'No job ID in metadata' };
      }

      // Update job with successful charge
      await db
        .update(jobs)
        .set({
          chargedAt: new Date(),
          stripeChargeId: paymentIntent.latest_charge as string,
        })
        .where(eq(jobs.id, jobId));

      console.log(`✅ Payment succeeded for job ${jobId}: $${(paymentIntent.amount / 100).toFixed(2)}`);

      return {
        processed: true,
        message: `Payment succeeded for job ${jobId}`,
      };
    } catch (error) {
      console.error('Payment intent success handler error:', error);
      return {
        processed: false,
        message: 'Failed to process payment success',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle payment intent failed
   */
  private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<WebhookResult> {
    try {
      const jobId = paymentIntent.metadata?.jobId;
      if (!jobId) {
        return { processed: false, message: 'No job ID in metadata' };
      }

      // Mark job as failed due to payment issue
      await db
        .update(jobs)
        .set({
          status: 'failed',
          errorMessage: `Payment failed: ${paymentIntent.last_payment_error?.message || 'Unknown error'}`,
        } as any)
        .where(eq(jobs.id, jobId));

      console.log(`❌ Payment failed for job ${jobId}`);

      return {
        processed: true,
        message: `Payment failed for job ${jobId}`,
      };
    } catch (error) {
      console.error('Payment intent failed handler error:', error);
      return {
        processed: false,
        message: 'Failed to process payment failure',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle charge refunded
   */
  private async handleChargeRefunded(charge: Stripe.Charge): Promise<WebhookResult> {
    try {
      // Find job by charge ID
      const job = await db.select().from(jobs).where(eq(jobs.stripeChargeId, charge.id)).limit(1);

      if (job.length === 0) {
        return { processed: false, message: 'No job found for charge' };
      }

      // Clear charge info
      await db
        .update(jobs)
        .set({
          chargedAt: null,
          stripeChargeId: null,
        })
        .where(eq(jobs.id, job[0].id));

      console.log(`💸 Refund processed for job ${job[0].id}: $${(charge.amount_refunded / 100).toFixed(2)}`);

      return {
        processed: true,
        message: `Refund processed for job ${job[0].id}`,
      };
    } catch (error) {
      console.error('Charge refunded handler error:', error);
      return {
        processed: false,
        message: 'Failed to process refund',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle customer created
   */
  private async handleCustomerCreated(customer: Stripe.Customer): Promise<WebhookResult> {
    try {
      const userId = customer.metadata?.userId;
      if (!userId) {
        return { processed: false, message: 'No user ID in metadata' };
      }

      // Update user with Stripe customer ID
      await db
        .update(users)
        .set({
          stripeCustomerId: customer.id,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

      console.log(`✅ Stripe customer ${customer.id} linked to user ${userId}`);

      return {
        processed: true,
        message: `Customer created for user ${userId}`,
      };
    } catch (error) {
      console.error('Customer created handler error:', error);
      return {
        processed: false,
        message: 'Failed to process customer creation',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const stripeWebhookHandler = StripeWebhookHandler.getInstance();
