/**
 * Engagement & Payment Routes
 *
 * Subscriptions, Stripe webhooks, Stripe payment setup, user API,
 * beat store, beat marketplace, engagement engine, comment sentiment, feedback.
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { db } from '../db';
import { ENGAGEMENT_CHECKLIST, ENGAGEMENT_PRESETS, VIRAL_STRUCTURES, engagementEngine } from '../services/engagement-engine';
import { userBeatStoreService } from '../services/user-beat-store-service.js';
import { subscriptionService } from '../services/subscription-service.js';
import { jobs, users } from '@shared/schema';
import { eq, desc, sql, and } from 'drizzle-orm';
import Stripe from 'stripe';


const router = Router();




  // =============================================================================
  // SUBSCRIPTION ROUTES - Stripe subscription management
  // =============================================================================

  // Create checkout session for subscription
  router.post('/subscriptions/checkout', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { tier } = req.body;

      if (!tier || !['distribution', 'pro'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be "distribution" or "pro"' });
      }

      const session = await subscriptionService.createCheckoutSession({
        userId: req.user!.id,
        tier,
      });

      res.json(session);
    } catch (error: any) {
      console.error('Failed to create checkout session:', error);
      res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
  });


  // Get user subscription details
  router.get('/subscriptions/me', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const subscription = await subscriptionService.getUserSubscription(req.user!.id);
      res.json(subscription);
    } catch (error: any) {
      console.error('Failed to get subscription:', error);
      res.status(500).json({ error: error.message || 'Failed to get subscription' });
    }
  });


  // Cancel subscription
  router.post('/subscriptions/cancel', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      await subscriptionService.cancelSubscription(req.user!.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to cancel subscription:', error);
      res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
    }
  });


  // Reactivate subscription
  router.post('/subscriptions/reactivate', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      await subscriptionService.reactivateSubscription(req.user!.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to reactivate subscription:', error);
      res.status(500).json({ error: error.message || 'Failed to reactivate subscription' });
    }
  });


  // Create customer portal session (for managing payment methods, invoices, etc.)
  router.post('/subscriptions/portal', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const portalSession = await subscriptionService.createPortalSession(req.user!.id);
      res.json(portalSession);
    } catch (error: any) {
      console.error('Failed to create portal session:', error);
      res.status(500).json({ error: error.message || 'Failed to create portal session' });
    }
  });


  // =============================================================================
  // END SUBSCRIPTION ROUTES
  // =============================================================================

  // =============================================================================
  // STRIPE WEBHOOKS - Handle subscription events
  // =============================================================================

  router.post('/stripe/webhook', async (req, res) => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2025-12-15.clover',
    });

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig) {
      return res.status(400).json({ error: 'No signature provided' });
    }

    if (!webhookSecret) {
      console.warn('STRIPE_WEBHOOK_SECRET not configured. Skipping signature verification (development only).');
      // In production, this should return an error
      // For now, proceed without verification
    }

    let event: Stripe.Event;

    try {
      if (webhookSecret) {
        // Verify webhook signature - use rawBody for signature verification
        const rawBody = (req as any).rawBody || req.body;
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } else {
        // Development mode: parse without verification
        event = req.body;
      }
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    try {
      // Handle the event
      switch (event.type) {
        case 'checkout.session.completed':
          const session = event.data.object as Stripe.Checkout.Session;

          // Check if this is an add_funds checkout
          if (session.metadata?.type === 'add_funds') {
            const userId = session.metadata.userId;
            const totalCredit = parseFloat(session.metadata.totalCredit || '0');
            const baseAmount = parseFloat(session.metadata.baseAmount || '0');
            const bonusAmount = parseFloat(session.metadata.bonusAmount || '0');

            console.log(
              `💰 Add funds checkout completed for user ${userId}: $${totalCredit} ($${baseAmount} + $${bonusAmount} bonus)`,
            );

            // Add funds to user balance
            await db.execute(sql`
              UPDATE users
              SET balance = balance + ${totalCredit}
              WHERE id = ${userId}
            `);

            // Record transaction in user_credits table
            await db.execute(sql`
              INSERT INTO user_credits (user_id, transaction_type, amount, description, created_at)
              VALUES (
                ${userId},
                'deposit',
                ${totalCredit},
                ${
                  bonusAmount > 0
                    ? `Deposit: $${baseAmount.toFixed(2)} + $${bonusAmount.toFixed(2)} bonus`
                    : `Deposit: $${baseAmount.toFixed(2)}`
                },
                NOW()
              )
            `);

            console.log(`✅ Added $${totalCredit} to user ${userId} balance`);
          } else {
            // Handle subscription checkout
            await subscriptionService.handleCheckoutSuccess(session.id);
            console.log('✅ Subscription checkout session completed:', session.id);
          }
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          const subscription = event.data.object as Stripe.Subscription;
          await subscriptionService.handleSubscriptionUpdate(subscription);
          console.log('✅ Subscription updated:', subscription.id);
          break;

        case 'customer.subscription.deleted':
          const canceledSubscription = event.data.object as Stripe.Subscription;
          await subscriptionService.handleSubscriptionCanceled(canceledSubscription);
          console.log('✅ Subscription canceled:', canceledSubscription.id);
          break;

        case 'invoice.payment_succeeded':
          console.log('✅ Invoice payment succeeded');
          // Could add invoice tracking here
          break;

        case 'invoice.payment_failed':
          console.log('⚠️  Invoice payment failed');
          // Could send notification to user
          break;

        default:
          console.log(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error('Webhook handler error:', error);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
  });


  // =============================================================================
  // END STRIPE WEBHOOKS
  // =============================================================================

  // =============================================================================
  // STRIPE PAYMENT SETUP - Customer creation and payment method collection
  // =============================================================================

  // Create or get Stripe customer for user
  router.post('/stripe/create-customer', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2025-12-15.clover',
      });

      // Check if user already has a Stripe customer
      if (req.user.stripeCustomerId) {
        return res.json({
          customerId: req.user.stripeCustomerId,
          message: 'Customer already exists',
        });
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.displayName || undefined,
        metadata: {
          userId: req.user.id,
        },
      });

      // Update user with Stripe customer ID
      await db
        .update(users)
        .set({
          stripeCustomerId: customer.id,
          updatedAt: new Date(),
        })
        .where(eq(users.id, req.user.id));

      console.log(`✅ Created Stripe customer ${customer.id} for user ${req.user.email}`);

      res.json({
        customerId: customer.id,
        message: 'Customer created successfully',
      });
    } catch (error: any) {
      console.error('Create customer error:', error);
      res.status(500).json({ error: error.message || 'Failed to create customer' });
    }
  });


  // Create setup intent for collecting payment method
  router.post('/stripe/create-setup-intent', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2025-12-15.clover',
      });

      // Ensure user has a Stripe customer ID
      let customerId = req.user.stripeCustomerId;
      if (!customerId) {
        // Create customer if they don't have one
        const customer = await stripe.customers.create({
          email: req.user.email,
          name: req.user.displayName || undefined,
          metadata: {
            userId: req.user.id,
          },
        });

        customerId = customer.id;

        // Update user with Stripe customer ID
        await db
          .update(users)
          .set({
            stripeCustomerId: customer.id,
            updatedAt: new Date(),
          })
          .where(eq(users.id, req.user.id));

        console.log(`✅ Created Stripe customer ${customer.id} for user ${req.user.email}`);
      }

      // Create setup intent for collecting payment method
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        metadata: {
          userId: req.user.id,
        },
      });

      res.json({
        clientSecret: setupIntent.client_secret,
        customerId: customerId,
      });
    } catch (error: any) {
      console.error('Create setup intent error:', error);
      res.status(500).json({ error: error.message || 'Failed to create setup intent' });
    }
  });


  // Confirm payment method setup (called after user completes Stripe Elements)
  router.post('/stripe/confirm-payment-method', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { paymentMethodId } = req.body;
      if (!paymentMethodId) {
        return res.status(400).json({ error: 'Payment method ID required' });
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2025-12-15.clover',
      });

      // Verify the payment method belongs to this customer
      const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

      if (paymentMethod.customer !== req.user.stripeCustomerId) {
        return res.status(403).json({ error: 'Payment method does not belong to this customer' });
      }

      // Set as default payment method
      await stripe.customers.update(req.user.stripeCustomerId!, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      console.log(`✅ Payment method ${paymentMethodId} set as default for user ${req.user.email}`);

      res.json({
        success: true,
        message: 'Payment method saved successfully',
      });
    } catch (error: any) {
      console.error('Confirm payment method error:', error);
      res.status(500).json({ error: error.message || 'Failed to confirm payment method' });
    }
  });


  // Get user's payment methods
  router.get('/stripe/payment-methods', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!req.user.stripeCustomerId) {
        return res.json({ paymentMethods: [] });
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2025-12-15.clover',
      });

      const paymentMethods = await stripe.paymentMethods.list({
        customer: req.user.stripeCustomerId,
        type: 'card',
      });

      res.json({
        paymentMethods: paymentMethods.data.map((pm) => ({
          id: pm.id,
          brand: pm.card?.brand,
          last4: pm.card?.last4,
          expMonth: pm.card?.exp_month,
          expYear: pm.card?.exp_year,
        })),
      });
    } catch (error: any) {
      console.error('Get payment methods error:', error);
      res.status(500).json({ error: error.message || 'Failed to get payment methods' });
    }
  });


  // Create Stripe Checkout Session for adding funds
  router.post('/stripe/create-add-funds-session', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { amount } = req.body;
      if (!amount || amount < 5) {
        return res.status(400).json({ error: 'Minimum deposit is $5' });
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
        apiVersion: '2025-12-15.clover',
      });

      // Calculate bonus based on amount
      let bonusPercentage = 0;
      if (amount >= 500)
        bonusPercentage = 0.15; // 15% bonus
      else if (amount >= 250)
        bonusPercentage = 0.1; // 10% bonus
      else if (amount >= 100) bonusPercentage = 0.05; // 5% bonus

      const bonus = Math.floor(amount * bonusPercentage * 100) / 100;
      const totalCredit = amount + bonus;

      // Ensure user has Stripe customer ID
      let customerId = req.user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          metadata: {
            userId: req.user.id,
          },
        });
        customerId = customer.id;

        // Update user with customer ID
        await db.execute(sql`
          UPDATE users
          SET stripe_customer_id = ${customerId}
          WHERE id = ${req.user.id}
        `);
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'Account Credit',
                description:
                  bonus > 0
                    ? `$${amount.toFixed(2)} + $${bonus.toFixed(2)} bonus (${Math.round(bonusPercentage * 100)}% off)`
                    : `$${amount.toFixed(2)} account credit`,
              },
              unit_amount: Math.round(amount * 100), // Amount in cents
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId: req.user.id,
          type: 'add_funds',
          baseAmount: amount.toString(),
          bonusAmount: bonus.toString(),
          totalCredit: totalCredit.toString(),
        },
        success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/pricing?success=true&amount=${totalCredit}`,
        cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/pricing?canceled=true`,
      });

      console.log(`✅ Created add funds checkout session for ${req.user.email}: $${amount} + $${bonus} bonus`);

      res.json({
        success: true,
        sessionId: session.id,
        sessionUrl: session.url,
        baseAmount: amount,
        bonusAmount: bonus,
        totalCredit,
      });
    } catch (error: any) {
      console.error('Create add funds session error:', error);
      res.status(500).json({ error: error.message || 'Failed to create checkout session' });
    }
  });


  // =============================================================================
  // END STRIPE PAYMENT SETUP
  // =============================================================================

  // =============================================================================
  // USER API ROUTES - Account management, jobs, credits
  // =============================================================================

  // Get user's jobs
  router.get('/user/jobs', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;

      const userJobs = await db
        .select()
        .from(jobs)
        .where(eq(jobs.userId, req.user!.id))
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .offset(offset);

      res.json(userJobs);
    } catch (error) {
      console.error('Failed to fetch user jobs:', error);
      res.status(500).json({ error: 'Failed to fetch jobs' });
    }
  });


  // Get user's credit balance
  router.get('/user/credits', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Get total spent from jobs
      const paidJobs = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.userId, req.user!.id),
            sql`${jobs.stripeChargeId} IS NOT NULL AND ${jobs.stripeChargeId} != 'FREE_CREDIT'`,
          ),
        );

      const totalSpent = paidJobs.reduce((sum, job) => {
        return sum + (parseFloat(job.userChargeUSD as any) || 0);
      }, 0);

      // Count total generations
      const allJobs = await db.select().from(jobs).where(eq(jobs.userId, req.user!.id));

      res.json({
        freeBeatCredits: req.user.freeBeatCreditsRemaining,
        totalGenerated: allJobs.length,
        totalSpent: totalSpent.toFixed(2),
      });
    } catch (error) {
      console.error('Failed to fetch user credits:', error);
      res.status(500).json({ error: 'Failed to fetch credits' });
    }
  });


  // Get user dashboard statistics
  router.get('/user/stats', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const userId = req.user!.id;

      // Get all user's jobs
      const allJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));

      // Get completed jobs
      const completedJobs = allJobs.filter((job) => job.status === 'completed');

      // Calculate total spent (only charged jobs, not free credits)
      const paidJobs = allJobs.filter((job) => job.stripeChargeId && job.stripeChargeId !== 'FREE_CREDIT');
      const totalSpent = paidJobs.reduce((sum, job) => {
        return sum + (parseFloat(job.userChargeUSD as any) || 0);
      }, 0);

      // Calculate this month's spending
      const now = new Date();
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonthJobs = paidJobs.filter((job) => {
        return job.chargedAt && new Date(job.chargedAt) >= firstDayOfMonth;
      });
      const thisMonthSpent = thisMonthJobs.reduce((sum, job) => {
        return sum + (parseFloat(job.userChargeUSD as any) || 0);
      }, 0);

      res.json({
        totalJobs: allJobs.length,
        completedJobs: completedJobs.length,
        totalSpent: totalSpent.toFixed(2),
        thisMonthSpent: thisMonthSpent.toFixed(2),
      });
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });


  // =============================================================================
  // BEAT STORE API ROUTES
  // =============================================================================

  // List a beat for sale
  router.post('/beat-store/list', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { jobId, beatName, description, priceUSD, isGenerated } = req.body;

      if (!jobId || !beatName || !priceUSD) {
        return res.status(400).json({ error: 'Missing required fields: jobId, beatName, priceUSD' });
      }

      const listing = await userBeatStoreService.listBeatForSale({
        userId: req.user!.id,
        jobId,
        beatName,
        description,
        priceUSD: parseFloat(priceUSD),
        isGenerated: isGenerated === true, // Platform-generated beats get 0% commission
      });

      res.json(listing);
    } catch (error: any) {
      console.error('Failed to list beat:', error);
      res.status(500).json({ error: error.message || 'Failed to list beat' });
    }
  });


  // Get user's beat listings
  router.get('/beat-store/listings', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const listings = await userBeatStoreService.getUserListings(req.user!.id);
      res.json(listings);
    } catch (error: any) {
      console.error('Failed to fetch listings:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch listings' });
    }
  });


  // Get a specific listing
  router.get('/beat-store/listings/:id', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const listing = await userBeatStoreService.getListing(req.params.id, req.user!.id);

      if (!listing) {
        return res.status(404).json({ error: 'Listing not found' });
      }

      res.json(listing);
    } catch (error: any) {
      console.error('Failed to fetch listing:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch listing' });
    }
  });


  // Update a listing
  router.put('/beat-store/listings/:id', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { beatName, description, priceUSD, active } = req.body;

      const listing = await userBeatStoreService.updateListing(req.params.id, req.user!.id, {
        beatName,
        description,
        priceUSD: priceUSD ? parseFloat(priceUSD) : undefined,
        active,
      });

      res.json(listing);
    } catch (error: any) {
      console.error('Failed to update listing:', error);
      res.status(500).json({ error: error.message || 'Failed to update listing' });
    }
  });


  // Delete/deactivate a listing
  router.delete('/beat-store/listings/:id', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      await userBeatStoreService.deleteListing(req.params.id, req.user!.id);
      res.json({ success: true, message: 'Listing deactivated' });
    } catch (error: any) {
      console.error('Failed to delete listing:', error);
      res.status(500).json({ error: error.message || 'Failed to delete listing' });
    }
  });


  // Get beat store analytics for user
  router.get('/beat-store/analytics', authMiddleware, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const analytics = await userBeatStoreService.getUserAnalytics(req.user!.id);
      res.json(analytics);
    } catch (error: any) {
      console.error('Failed to fetch analytics:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
    }
  });


  // =============================================================================
  // BEAT MARKETPLACE ROUTES - Public beat browsing and purchasing
  // =============================================================================

  // Browse all beats (public, no auth required)
  router.get('/beat-marketplace/browse', async (req, res) => {
    try {
      const { beatStoreListings } = await import('@shared/schema');

      // Get all active listings
      const listings = await db
        .select()
        .from(beatStoreListings)
        .where(eq(beatStoreListings.active, true))
        .orderBy(desc(beatStoreListings.createdAt));

      // Transform to marketplace format
      const beats = listings.map((listing) => ({
        id: listing.id,
        beatName: listing.beatName,
        description: listing.description,
        priceUSD: listing.priceUSD,
        stripePaymentLinkUrl: listing.stripePaymentLinkUrl,
        views: listing.views,
        purchases: listing.purchases,
        isGenerated: listing.isGenerated,
        createdAt: listing.createdAt,
        // TODO: Add audioUrl, bpm, key, duration from jobs table if available
      }));

      res.json({ beats });
    } catch (error: any) {
      console.error('Failed to browse beats:', error);
      res.status(500).json({ error: 'Failed to load beats' });
    }
  });


  // Track beat view
  router.post('/beat-marketplace/track-view/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { beatStoreListings } = await import('@shared/schema');

      await db
        .update(beatStoreListings)
        .set({
          views: sql`${beatStoreListings.views} + 1`,
        })
        .where(eq(beatStoreListings.id, id));

      res.json({ success: true });
    } catch (error: any) {
      console.error('Failed to track view:', error);
      res.status(500).json({ error: 'Failed to track view' });
    }
  });


  // ============ ENGAGEMENT ENGINE ============

  // Get all engagement triggers grouped by type
  router.get('/engagement/triggers', async (req, res) => {
    try {
      const triggersByType = engagementEngine.getTriggersByType();
      const presets = engagementEngine.getPresets();

      // Return combined data for the frontend
      res.json({
        success: true,
        data: {
          triggers: triggersByType,
          presets: presets,
          structures: VIRAL_STRUCTURES,
        },
      });
    } catch (error: any) {
      console.error('Error getting engagement triggers:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all engagement presets
  router.get('/engagement/presets', async (req, res) => {
    try {
      const presets = engagementEngine.getPresets();
      res.json({ success: true, data: presets });
    } catch (error: any) {
      console.error('Error getting engagement presets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get viral structures
  router.get('/engagement/structures', async (req, res) => {
    try {
      res.json({ success: true, data: VIRAL_STRUCTURES });
    } catch (error: any) {
      console.error('Error getting viral structures:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get engagement checklist
  router.get('/engagement/checklist', async (req, res) => {
    try {
      res.json({ success: true, data: ENGAGEMENT_CHECKLIST });
    } catch (error: any) {
      console.error('Error getting engagement checklist:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all engagement data in one call
  router.get('/engagement', async (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          triggers: engagementEngine.getTriggersByType(),
          presets: ENGAGEMENT_PRESETS,
          structures: VIRAL_STRUCTURES,
          checklist: ENGAGEMENT_CHECKLIST,
        },
      });
    } catch (error: any) {
      console.error('Error getting engagement data:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Enhance prompts with engagement engineering
  router.post('/engagement/enhance', async (req, res) => {
    try {
      const {
        prompt,
        type = 'lyric', // 'lyric', 'video', 'music'
        triggers = [],
        structure = 'hook_hold_payoff',
        presetId,
      } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, error: 'Prompt is required' });
      }

      // If preset is specified, use its triggers
      let effectiveTriggers = triggers;
      if (presetId && ENGAGEMENT_PRESETS[presetId]) {
        const preset = ENGAGEMENT_PRESETS[presetId];
        effectiveTriggers = type === 'video' ? preset.videoTriggers : preset.lyricTriggers;
      }

      let enhancedPrompt: string;
      switch (type) {
        case 'video':
          enhancedPrompt = engagementEngine.enhanceVideoPrompt(prompt, effectiveTriggers, structure);
          break;
        case 'music':
          enhancedPrompt = engagementEngine.enhanceMusicPrompt(prompt, effectiveTriggers);
          break;
        default:
          enhancedPrompt = engagementEngine.enhanceLyricPrompt(prompt, effectiveTriggers, structure);
      }

      res.json({
        success: true,
        data: {
          original: prompt,
          enhanced: enhancedPrompt,
          type,
          triggers: effectiveTriggers,
          structure,
        },
      });
    } catch (error: any) {
      console.error('Error enhancing prompt:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate hook options for a topic
  router.post('/engagement/hooks', async (req, res) => {
    try {
      const { topic, count = 5 } = req.body;

      if (!topic) {
        return res.status(400).json({ success: false, error: 'Topic is required' });
      }

      const hooks = engagementEngine.generateHookOptions(topic, count);
      res.json({ success: true, data: hooks });
    } catch (error: any) {
      console.error('Error generating hooks:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // FEEDBACK INGEST ENDPOINTS (with Reaction Lag Theory)
  // Post-mortem correlator maps YouTube drop-offs to guilty clips
  // Pre-crime validator blocks future toxic combinations
  // ============================================================================

  // INGEST: Feed YouTube retention with full clip metadata for reaction lag analysis
  router.post('/feedback/retention', async (req, res) => {
    try {
      const { retentionClipCorrelator } = await import('../services/retention-clip-correlator');
      const { videoId, retentionCurve, metadata } = req.body;

      if (!videoId || !retentionCurve || !metadata) {
        return res.status(400).json({
          success: false,
          error: 'videoId, retentionCurve, and metadata required',
        });
      }

      // Validate and normalize retention curve format
      // Accept both {second, retention} and {second, percentage} formats
      const normalizedCurve = retentionCurve.map((point: any, index: number) => {
        const second = point.second ?? index;
        const retention = point.retention ?? point.percentage ?? point.retentionPct ?? 100;
        // Normalize to 0-100 scale
        const normalizedRetention = retention > 1 ? retention : retention * 100;
        return { second, retention: normalizedRetention };
      });

      // Validate metadata structure
      if (!metadata.clips || !Array.isArray(metadata.clips)) {
        return res.status(400).json({
          success: false,
          error: 'metadata.clips must be an array of clip objects with startTime, endTime, styleCategory, audioStyle',
        });
      }

      // Validate each clip has required fields
      for (let i = 0; i < metadata.clips.length; i++) {
        const clip = metadata.clips[i];
        if (clip.startTime === undefined || clip.endTime === undefined) {
          return res.status(400).json({
            success: false,
            error: `metadata.clips[${i}] must have startTime and endTime`,
          });
        }
        // Default styleCategory and audioStyle if not provided
        clip.styleCategory = clip.styleCategory || 'unknown';
        clip.audioStyle = clip.audioStyle || 'unknown';
      }

      // Analyze with reaction lag (3-second delay between boring content and viewer leaving)
      const toxicCombos = await retentionClipCorrelator.analyzeDropOffsWithReactionLag(
        videoId,
        normalizedCurve,
        metadata,
      );

      res.json({
        success: true,
        message: `Retention data analyzed. Found ${toxicCombos.length} toxic combos.`,
        data: { toxicCombos },
      });
    } catch (error: any) {
      console.error('Feedback retention error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // PRE-CRIME CHECK: Is this style+audio combo safe to use?
  router.post('/feedback/check-safety', async (req, res) => {
    try {
      const { retentionClipCorrelator } = await import('../services/retention-clip-correlator');
      const { styleCategory, audioStyle } = req.body;

      if (!styleCategory || !audioStyle) {
        return res.status(400).json({
          success: false,
          error: 'styleCategory and audioStyle required',
        });
      }

      const result = await retentionClipCorrelator.checkSafety(styleCategory, audioStyle);

      res.json(result);
    } catch (error: any) {
      console.error('Safety check error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all banned toxic combos
  router.get('/feedback/banned-combos', async (req, res) => {
    try {
      const { retentionClipCorrelator } = await import('../services/retention-clip-correlator');
      const bannedCombos = await retentionClipCorrelator.getBannedCombos();

      res.json({
        success: true,
        data: bannedCombos,
      });
    } catch (error: any) {
      console.error('Banned combos error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get toxic combo statistics
  router.get('/feedback/toxic-stats', async (req, res) => {
    try {
      const { retentionClipCorrelator } = await import('../services/retention-clip-correlator');
      const stats = await retentionClipCorrelator.getToxicStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error: any) {
      console.error('Toxic stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Apply decay to toxic combos (for weekly maintenance)
  router.post('/feedback/apply-decay', async (req, res) => {
    try {
      const { retentionClipCorrelator } = await import('../services/retention-clip-correlator');
      const { decayFactor } = req.body;

      const updated = await retentionClipCorrelator.applyToxicDecay(decayFactor || 0.9);

      res.json({
        success: true,
        data: { unbannedCombos: updated },
      });
    } catch (error: any) {
      console.error('Apply decay error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
