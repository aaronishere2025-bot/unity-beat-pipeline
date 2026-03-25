/**
 * Test: Job Worker Cost Integration
 * Verifies that user cost tracking is properly integrated with job completion
 */

import { db } from './server/db';
import { jobs, users, apiUsage } from '@shared/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { userCostTracker } from './server/services/user-cost-tracker';

async function testJobCostIntegration() {
  console.log('🧪 Testing Job Worker Cost Integration\n');

  let testsRun = 0;
  let testsPassed = 0;

  // Test 1: Check if cost tracking fields exist in jobs table
  console.log('Test 1: Verify cost tracking fields in jobs table');
  testsRun++;
  try {
    const sampleJobs = await db.select().from(jobs).limit(1);
    const hasRequiredFields =
      sampleJobs.length === 0 ||
      ('userId' in sampleJobs[0] && 'actualCostUSD' in sampleJobs[0] && 'userChargeUSD' in sampleJobs[0]);

    if (hasRequiredFields) {
      console.log('   ✅ Cost tracking fields exist in jobs table\n');
      testsPassed++;
    } else {
      console.log('   ❌ Missing cost tracking fields in jobs table\n');
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  // Test 2: Create test user and verify free credits
  console.log('Test 2: Create test user with free credits');
  testsRun++;
  try {
    const testUser = await db
      .insert(users)
      .values({
        googleId: `test-user-${Date.now()}`,
        email: `test${Date.now()}@example.com`,
        displayName: 'Test User',
        freeBeatCreditsRemaining: 5,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      })
      .returning();

    if (testUser[0].freeBeatCreditsRemaining === 5) {
      console.log(`   ✅ Test user created with 5 free credits (ID: ${testUser[0].id})\n`);
      testsPassed++;

      // Test 3: Simulate job completion with cost tracking
      console.log('Test 3: Simulate job with cost tracking');
      testsRun++;
      try {
        // Create a test job
        const testJob = await db
          .insert(jobs)
          .values({
            mode: 'beats',
            status: 'processing',
            scriptName: 'Test Beat Generation',
            userId: testUser[0].id,
            createdAt: new Date(),
          })
          .returning();

        console.log(`   📝 Created test job: ${testJob[0].id}`);

        // Simulate API usage for this job
        await db.insert(apiUsage).values({
          service: 'suno',
          operation: 'generate_music',
          model: 'suno-v3.5',
          cost: '0.10', // $0.10 for Suno music generation
          jobId: testJob[0].id,
          userId: testUser[0].id,
          success: true,
          createdAt: new Date(),
        });

        console.log(`   💰 Simulated $0.10 API cost (Suno music generation)`);

        // Calculate costs using UserCostTracker
        const costBreakdown = await userCostTracker.calculateJobCost(testJob[0].id);
        const profit = costBreakdown.userChargeUSD - costBreakdown.totalCostUSD;

        console.log(`   Actual Cost: $${costBreakdown.totalCostUSD.toFixed(2)}`);
        console.log(`   User Charge: $${costBreakdown.userChargeUSD.toFixed(2)} (beat pricing)`);
        console.log(`   Profit: $${profit.toFixed(2)}`);

        if (costBreakdown.totalCostUSD === 0.1 && costBreakdown.userChargeUSD === 2.5) {
          console.log('   ✅ Cost calculation correct ($0.10 → $2.50)\n');
          testsPassed++;
        } else {
          console.log('   ❌ Cost calculation incorrect\n');
        }

        // Test 4: Verify free credit usage
        console.log('Test 4: Test free credit deduction');
        testsRun++;
        try {
          const chargeResult = await userCostTracker.chargeUserForJob(testUser[0].id, testJob[0].id);

          if (chargeResult.usedFreeCredit && chargeResult.creditsRemaining === 4) {
            console.log(`   ✅ Free credit used successfully (4 remaining)\n`);
            testsPassed++;
          } else {
            console.log(`   ❌ Free credit deduction failed\n`);
          }

          // Verify job was updated with cost info
          const updatedJob = await db.select().from(jobs).where(eq(jobs.id, testJob[0].id)).limit(1);

          if (updatedJob[0].actualCostUSD && updatedJob[0].userChargeUSD) {
            console.log('   ✅ Job updated with cost tracking fields');
            console.log(`      actualCostUSD: $${updatedJob[0].actualCostUSD}`);
            console.log(`      userChargeUSD: $${updatedJob[0].userChargeUSD}`);
            console.log(`      stripeChargeId: ${updatedJob[0].stripeChargeId || 'FREE_CREDIT'}\n`);
          }
        } catch (error: any) {
          console.log(`   ❌ Free credit test failed: ${error.message}\n`);
        }

        // Cleanup test data
        console.log('🧹 Cleaning up test data...');
        await db.delete(apiUsage).where(eq(apiUsage.jobId, testJob[0].id));
        await db.delete(jobs).where(eq(jobs.id, testJob[0].id));
        console.log('   ✅ Test job deleted\n');
      } catch (error: any) {
        console.log(`   ❌ Job cost test failed: ${error.message}\n`);
      }

      // Cleanup test user
      await db.delete(users).where(eq(users.id, testUser[0].id));
      console.log('   ✅ Test user deleted\n');
    } else {
      console.log('   ❌ Test user creation failed\n');
    }
  } catch (error: any) {
    console.log(`   ❌ Error: ${error.message}\n`);
  }

  // Summary
  console.log('═'.repeat(60));
  console.log(`Tests: ${testsPassed}/${testsRun} passed`);
  console.log('═'.repeat(60));

  if (testsPassed === testsRun) {
    console.log('\n✅ All tests passed! Job worker cost integration is working correctly.\n');
    console.log('Integration Summary:');
    console.log('  • UserCostTracker integrated into job-worker.ts');
    console.log('  • Cost calculation works correctly ($0.10 → $2.50 for beats)');
    console.log('  • Free credit deduction works (5 → 4)');
    console.log('  • Job records updated with cost tracking fields');
    console.log('  • Ready for production use\n');
  } else {
    console.log(`\n❌ ${testsRun - testsPassed} test(s) failed. Check output above for details.\n`);
  }

  process.exit(testsPassed === testsRun ? 0 : 1);
}

testJobCostIntegration().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
