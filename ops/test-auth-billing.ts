/**
 * Comprehensive Auth & Billing Test Suite
 * Tests: Database, OAuth, JWT, Cost Tracking, Commission System
 */

import { db } from './server/db.js';
import { users, jobs, apiUsage, beatStoreListings } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { googleOAuthService } from './server/services/google-oauth-service.js';
import { generateToken } from './server/middleware/auth.js';
import { userCostTracker } from './server/services/user-cost-tracker.js';
import jwt from 'jsonwebtoken';

// Test results tracking
let passed = 0;
let failed = 0;

function pass(testName: string) {
  console.log(`✅ ${testName}`);
  passed++;
}

function fail(testName: string, error: any) {
  console.log(`❌ ${testName}`);
  console.log(`   Error: ${error.message || error}`);
  failed++;
}

async function runTests() {
  console.log('🧪 Starting Auth & Billing Test Suite\n');
  console.log('='.repeat(60));

  // =============================================================================
  // TEST 1: Database Schema
  // =============================================================================
  console.log('\n📦 TEST 1: Database Schema');
  console.log('-'.repeat(60));

  try {
    // Check users table exists
    const testUsers = await db.select().from(users).limit(1);
    pass('Users table exists');
  } catch (error) {
    fail('Users table exists', error);
  }

  try {
    // Check beat_store_listings has commission columns
    const testListings = await db.select().from(beatStoreListings).limit(1);
    if (testListings.length > 0) {
      const listing = testListings[0];
      if ('isGenerated' in listing && 'source' in listing) {
        pass('Beat store has commission columns');
      } else {
        fail('Beat store has commission columns', 'Missing isGenerated or source columns');
      }
    } else {
      pass('Beat store table exists (empty)');
    }
  } catch (error) {
    fail('Beat store commission columns', error);
  }

  // =============================================================================
  // TEST 2: User Creation & Free Credits
  // =============================================================================
  console.log('\n👤 TEST 2: User Creation & Free Credits');
  console.log('-'.repeat(60));

  const testEmail = `test-${Date.now()}@example.com`;
  let testUserId: string | null = null;

  try {
    const mockProfile = {
      googleId: `google-${Date.now()}`,
      email: testEmail,
      displayName: 'Test User',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    const user = await googleOAuthService.getOrCreateUser(mockProfile);
    testUserId = user.id;

    if (user.freeBeatCreditsRemaining === 5) {
      pass('New user gets 5 free beat credits');
    } else {
      fail('New user gets 5 free beat credits', `Got ${user.freeBeatCreditsRemaining} credits instead of 5`);
    }

    if (user.email === testEmail) {
      pass('User email stored correctly');
    } else {
      fail('User email stored correctly', 'Email mismatch');
    }
  } catch (error) {
    fail('User creation', error);
  }

  // =============================================================================
  // TEST 3: JWT Token Generation & Verification
  // =============================================================================
  console.log('\n🔑 TEST 3: JWT Token Generation');
  console.log('-'.repeat(60));

  let testToken: string | null = null;

  try {
    if (!testUserId) {
      throw new Error('No test user ID available');
    }

    testToken = generateToken(testUserId, testEmail);

    if (testToken && testToken.length > 0) {
      pass('JWT token generated');
    } else {
      fail('JWT token generated', 'Empty token');
    }
  } catch (error) {
    fail('JWT token generation', error);
  }

  try {
    if (!testToken) {
      throw new Error('No test token available');
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(testToken, jwtSecret) as any;

    if (decoded.userId === testUserId) {
      pass('JWT token verification');
    } else {
      fail('JWT token verification', 'User ID mismatch');
    }
  } catch (error) {
    fail('JWT token verification', error);
  }

  // =============================================================================
  // TEST 4: Cost Calculation - Beat Generation
  // =============================================================================
  console.log('\n💰 TEST 4: Cost Calculation - Beat Generation');
  console.log('-'.repeat(60));

  let testJobId: string | null = null;

  try {
    // Create test job
    const [job] = await db
      .insert(jobs)
      .values({
        mode: 'music',
        status: 'completed',
        clipCount: 0,
        userId: testUserId,
      })
      .returning();

    testJobId = job.id;

    // Simulate Suno API call cost
    await db.insert(apiUsage).values({
      service: 'suno',
      operation: 'generate_music',
      cost: '0.10',
      success: true,
      jobId: testJobId,
      userId: testUserId,
    });

    const costBreakdown = await userCostTracker.calculateJobCost(testJobId);

    if (costBreakdown.totalCostUSD === 0.1) {
      pass('Beat cost calculation (actual cost: $0.10)');
    } else {
      fail('Beat cost calculation', `Expected $0.10, got $${costBreakdown.totalCostUSD}`);
    }

    if (costBreakdown.userChargeUSD === 2.5) {
      pass('Beat user charge ($2.50 flat rate)');
    } else {
      fail('Beat user charge', `Expected $2.50, got $${costBreakdown.userChargeUSD}`);
    }

    const profit = costBreakdown.userChargeUSD - costBreakdown.totalCostUSD;
    if (profit === 2.4) {
      pass('Beat profit margin ($2.40 per beat)');
    } else {
      fail('Beat profit margin', `Expected $2.40, got $${profit.toFixed(2)}`);
    }
  } catch (error) {
    fail('Beat cost calculation', error);
  }

  // =============================================================================
  // TEST 5: Cost Calculation - Video Generation
  // =============================================================================
  console.log('\n🎬 TEST 5: Cost Calculation - Video Generation');
  console.log('-'.repeat(60));

  try {
    // Create test video job
    const [videoJob] = await db
      .insert(jobs)
      .values({
        mode: 'kling',
        status: 'completed',
        clipCount: 12,
        userId: testUserId,
      })
      .returning();

    // Simulate 12 Kling API calls (12 clips × $0.10)
    for (let i = 0; i < 12; i++) {
      await db.insert(apiUsage).values({
        service: 'kling',
        operation: 'generate_video',
        cost: '0.10',
        success: true,
        jobId: videoJob.id,
        userId: testUserId,
        metadata: { clipIndex: i },
      });
    }

    const costBreakdown = await userCostTracker.calculateJobCost(videoJob.id);

    if (costBreakdown.totalCostUSD === 1.2) {
      pass('Video cost calculation (12 clips × $0.10 = $1.20)');
    } else {
      fail('Video cost calculation', `Expected $1.20, got $${costBreakdown.totalCostUSD}`);
    }

    // Use toFixed for floating point comparison
    if (Math.abs(costBreakdown.userChargeUSD - 3.6) < 0.01) {
      pass('Video user charge (12 clips × $0.30 = $3.60)');
    } else {
      fail('Video user charge', `Expected $3.60, got $${costBreakdown.userChargeUSD}`);
    }

    const profit = costBreakdown.userChargeUSD - costBreakdown.totalCostUSD;
    if (Math.abs(profit - 2.4) < 0.01) {
      pass('Video profit margin ($2.40 per video)');
    } else {
      fail('Video profit margin', `Expected $2.40, got $${profit.toFixed(2)}`);
    }

    // Cleanup
    await db.delete(apiUsage).where(eq(apiUsage.jobId, videoJob.id));
    await db.delete(jobs).where(eq(jobs.id, videoJob.id));
  } catch (error) {
    fail('Video cost calculation', error);
  }

  // =============================================================================
  // TEST 6: Free Credit System
  // =============================================================================
  console.log('\n🎁 TEST 6: Free Credit System');
  console.log('-'.repeat(60));

  try {
    if (!testUserId) {
      throw new Error('No test user ID available');
    }

    const hasCredits = await userCostTracker.checkFreeCredits(testUserId, 'music');

    if (hasCredits) {
      pass('User has free credits available');
    } else {
      fail('User has free credits available', 'No credits found');
    }

    // Use a free credit
    await userCostTracker.useFreeCredit(testUserId);

    const user = await db.select().from(users).where(eq(users.id, testUserId)).limit(1);
    if (user[0].freeBeatCreditsRemaining === 4) {
      pass('Free credit deducted (5 → 4)');
    } else {
      fail('Free credit deducted', `Expected 4, got ${user[0].freeBeatCreditsRemaining}`);
    }
  } catch (error) {
    fail('Free credit system', error);
  }

  // =============================================================================
  // TEST 7: Commission System (0% vs 10%)
  // =============================================================================
  console.log('\n💸 TEST 7: Commission System (0% Generated vs 10% External)');
  console.log('-'.repeat(60));

  try {
    // Test generated beat (0% commission)
    const [generatedListing] = await db
      .insert(beatStoreListings)
      .values({
        userId: testUserId!,
        jobId: testJobId,
        isGenerated: true,
        source: 'generated',
        beatName: 'Test Generated Beat',
        priceUSD: '5.00',
        stripeProductId: 'prod_test_generated',
        stripePriceId: 'price_test_generated',
        stripePaymentLinkUrl: 'https://buy.stripe.com/test_generated',
        r2Key: 'beats/test_generated.wav',
      })
      .returning();

    const generatedCommission = await userCostTracker.calculateBeatSaleCommission(generatedListing.id, 5.0);

    if (generatedCommission.platformFeePercent === 0) {
      pass('Generated beat: 0% commission');
    } else {
      fail('Generated beat: 0% commission', `Expected 0%, got ${generatedCommission.platformFeePercent}%`);
    }

    if (generatedCommission.platformFeeUSD === 0) {
      pass('Generated beat: $0 fee on $5 sale');
    } else {
      fail('Generated beat: $0 fee', `Expected $0, got $${generatedCommission.platformFeeUSD}`);
    }

    // Test external beat (10% commission)
    const [externalListing] = await db
      .insert(beatStoreListings)
      .values({
        userId: testUserId!,
        isGenerated: false,
        source: 'external',
        beatName: 'Test External Beat',
        priceUSD: '5.00',
        stripeProductId: 'prod_test_external',
        stripePriceId: 'price_test_external',
        stripePaymentLinkUrl: 'https://buy.stripe.com/test_external',
        r2Key: 'beats/test_external.wav',
      })
      .returning();

    const externalCommission = await userCostTracker.calculateBeatSaleCommission(externalListing.id, 5.0);

    if (externalCommission.platformFeePercent === 10) {
      pass('External beat: 10% commission');
    } else {
      fail('External beat: 10% commission', `Expected 10%, got ${externalCommission.platformFeePercent}%`);
    }

    if (externalCommission.platformFeeUSD === 0.5) {
      pass('External beat: $0.50 fee on $5 sale');
    } else {
      fail('External beat: $0.50 fee', `Expected $0.50, got $${externalCommission.platformFeeUSD}`);
    }

    // Cleanup
    await db.delete(beatStoreListings).where(eq(beatStoreListings.id, generatedListing.id));
    await db.delete(beatStoreListings).where(eq(beatStoreListings.id, externalListing.id));
  } catch (error) {
    fail('Commission system', error);
  }

  // =============================================================================
  // TEST 8: Competitive Analysis
  // =============================================================================
  console.log('\n🏆 TEST 8: Competitive Advantage');
  console.log('-'.repeat(60));

  try {
    const salePrice = 5.0;
    const stripeFee = 0.45; // 2.9% + $0.30

    // BeatStars free tier (30% commission)
    const beatstarsCommission = salePrice * 0.3;
    const beatstarsNet = salePrice - stripeFee - beatstarsCommission;

    // Your platform (external, 10% commission)
    const yourExternalCommission = salePrice * 0.1;
    const yourExternalNet = salePrice - stripeFee - yourExternalCommission;

    // Your platform (generated, 0% commission)
    const yourGeneratedNet = salePrice - stripeFee;

    console.log(`\n   $5 Beat Sale Comparison:`);
    console.log(`   BeatStars (30%):     User gets $${beatstarsNet.toFixed(2)}`);
    console.log(
      `   You (external 10%):  User gets $${yourExternalNet.toFixed(2)} (+$${(yourExternalNet - beatstarsNet).toFixed(2)})`,
    );
    console.log(
      `   You (generated 0%):  User gets $${yourGeneratedNet.toFixed(2)} (+$${(yourGeneratedNet - beatstarsNet).toFixed(2)})`,
    );

    if (yourExternalNet > beatstarsNet) {
      pass('External upload beats BeatStars free tier');
    } else {
      fail('External upload beats BeatStars', 'Not competitive');
    }

    if (yourGeneratedNet > yourExternalNet) {
      pass('Generated beats more profitable than external');
    } else {
      fail('Generated beats more profitable', 'Incentive misaligned');
    }
  } catch (error) {
    fail('Competitive analysis', error);
  }

  // =============================================================================
  // Cleanup Test Data
  // =============================================================================
  console.log('\n🧹 Cleaning up test data...');
  try {
    if (testJobId) {
      await db.delete(apiUsage).where(eq(apiUsage.jobId, testJobId));
      await db.delete(jobs).where(eq(jobs.id, testJobId));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
    console.log('✅ Test data cleaned up');
  } catch (error) {
    console.log('⚠️  Warning: Some test data may not have been cleaned up');
  }

  // =============================================================================
  // Summary
  // =============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Auth & billing systems are working correctly.\n');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Please review the errors above.\n`);
  }

  process.exit(failed === 0 ? 0 : 1);
}

runTests().catch((error) => {
  console.error('Fatal test error:', error);
  process.exit(1);
});
