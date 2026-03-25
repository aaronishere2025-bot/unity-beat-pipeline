import { subscriptionService, TIER_LIMITS } from './server/services/subscription-service.js';
import { db } from './server/db.js';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function testSubscriptionSystem() {
  console.log('\n🧪 Testing Subscription System...\n');

  try {
    // Test 1: Get first user (or create test user)
    console.log('Test 1: Getting test user...');
    const [user] = await db.select().from(users).limit(1);

    if (!user) {
      console.log('❌ No users found. Please create a user first via Google OAuth.');
      console.log('   Visit: http://localhost:8080/api/auth/google/url');
      return;
    }

    console.log(`✅ Test user: ${user.email} (ID: ${user.id})`);
    console.log(`   Current tier: ${user.subscriptionTier}`);
    console.log(`   Free credits: ${user.freeBeatCreditsRemaining}`);

    // Test 2: Check feature limits for current tier
    console.log('\nTest 2: Checking feature limits...');
    const tier = user.subscriptionTier as 'free' | 'distribution' | 'pro';
    const limits = TIER_LIMITS[tier];

    console.log(`✅ Limits for "${tier}" tier:`);
    console.log(
      `   Beat Credits/Month: ${limits.beatCreditsPerMonth === Infinity ? 'Unlimited' : limits.beatCreditsPerMonth}`,
    );
    console.log(`   Cross-posting: ${limits.canUseCrossPost ? 'Yes' : 'No'}`);
    console.log(`   Scheduling: ${limits.canSchedule ? 'Yes' : 'No'}`);
    console.log(`   API Access: ${limits.canUseAPI ? 'Yes' : 'No'}`);
    console.log(`   Priority Queue: ${limits.priorityQueue ? 'Yes' : 'No'}`);
    console.log(`   Support Level: ${limits.supportLevel}`);

    // Test 3: Check feature access
    console.log('\nTest 3: Testing feature access checks...');
    const canCrossPost = await subscriptionService.hasFeatureAccess(user.id, 'canUseCrossPost');
    const canUseAPI = await subscriptionService.hasFeatureAccess(user.id, 'canUseAPI');

    console.log(`   Cross-posting access: ${canCrossPost ? '✅ Yes' : '❌ No'}`);
    console.log(`   API access: ${canUseAPI ? '✅ Yes' : '❌ No'}`);

    // Test 4: Get subscription details
    console.log('\nTest 4: Getting subscription details...');
    const subscription = await subscriptionService.getUserSubscription(user.id);

    console.log(`✅ Subscription details:`);
    console.log(`   Tier: ${subscription.tier}`);
    console.log(`   Status: ${subscription.status || 'N/A'}`);
    console.log(`   Period End: ${subscription.currentPeriodEnd || 'N/A'}`);
    console.log(`   Cancel at period end: ${subscription.cancelAtPeriodEnd ? 'Yes' : 'No'}`);

    // Test 5: Create checkout session (test only, won't actually charge)
    console.log('\nTest 5: Creating checkout session (Distribution tier)...');
    try {
      const checkoutSession = await subscriptionService.createCheckoutSession({
        userId: user.id,
        tier: 'distribution',
      });

      console.log(`✅ Checkout session created!`);
      console.log(`   Session ID: ${checkoutSession.sessionId}`);
      console.log(`   Checkout URL: ${checkoutSession.url}`);
      console.log('\n   ⚠️  Note: This is a test mode checkout. No real charges will occur.');
      console.log('   To test the flow, open this URL in your browser:');
      console.log(`   ${checkoutSession.url}\n`);
      console.log('   Use test card: 4242 4242 4242 4242, any future expiry, any CVC\n');
    } catch (error: any) {
      console.error(`❌ Failed to create checkout session: ${error.message}`);
    }

    // Test 6: Create portal session
    if (user.stripeCustomerId) {
      console.log('Test 6: Creating customer portal session...');
      try {
        const portalSession = await subscriptionService.createPortalSession(user.id);
        console.log(`✅ Portal session created!`);
        console.log(`   Portal URL: ${portalSession.url}`);
        console.log('   Users can manage their subscription, payment methods, and invoices here.\n');
      } catch (error: any) {
        console.error(`❌ Failed to create portal session: ${error.message}`);
      }
    } else {
      console.log('\nTest 6: Skipped (user has no Stripe customer ID yet)');
    }

    console.log('\n✨ All tests completed!\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('Next Steps:');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('1. Set up webhook endpoint with a public URL:');
    console.log('   - Use ngrok: ngrok http 8080');
    console.log('   - Use Cloudflare Tunnel: cloudflare tunnel');
    console.log('   - Or deploy to production');
    console.log('');
    console.log('2. Add webhook in Stripe Dashboard:');
    console.log('   https://dashboard.stripe.com/test/webhooks');
    console.log('   Endpoint URL: https://your-domain.com/api/stripe/webhook');
    console.log('');
    console.log('3. Add STRIPE_WEBHOOK_SECRET to .env');
    console.log('');
    console.log('4. Test subscription flow:');
    console.log('   - Create checkout session (see URL above)');
    console.log('   - Complete checkout with test card');
    console.log('   - Verify webhook receives events');
    console.log('   - Check user tier updated in database');
    console.log('');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testSubscriptionSystem();
