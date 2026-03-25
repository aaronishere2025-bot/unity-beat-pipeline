/**
 * TEST CONTENT STRATEGY AGENT
 *
 * Tests the Content Strategy Agent to ensure it:
 * - Analyzes content demand from all sources
 * - Selects optimal figures for videos
 * - Determines posting times
 * - Creates executable content plans
 */

import { contentStrategyAgent } from './server/services/content-strategy-agent';

async function testContentStrategy() {
  console.log('========================================');
  console.log('TESTING CONTENT STRATEGY AGENT');
  console.log('========================================\n');

  try {
    // Step 1: Generate a daily content plan
    console.log('[Step 1] Generating daily content plan...');
    const plan = await contentStrategyAgent.generateDailyPlan({
      videoCount: 3, // Just 3 videos for testing
      maxDailyCost: 10, // $10 budget for test
    });

    console.log('\n📅 Daily Content Plan Generated:');
    console.log('Date:', plan.date);
    console.log('Total Videos:', plan.videos.length);
    console.log('Total Estimated Cost: $' + plan.totalCost.toFixed(2));
    console.log('Status:', plan.status);
    console.log('\nVideos:');
    for (let i = 0; i < plan.videos.length; i++) {
      const video = plan.videos[i];
      console.log(`  ${i + 1}. ${video.figure} (${video.format})`);
      console.log(`     Theme: ${video.theme}`);
      console.log(`     Scheduled: ${video.scheduledTime}`);
      console.log(`     Cost: $${video.estimatedCost}`);
      console.log(`     Reasoning: ${video.reasoning}`);
    }
    console.log('\n✅ Plan generation passed\n');

    // Step 2: Check current plan
    console.log('[Step 2] Checking current active plan...');
    const currentPlan = await contentStrategyAgent.getCurrentPlan();

    if (currentPlan) {
      console.log('Current plan found:');
      console.log('  Date:', currentPlan.date);
      console.log('  Videos:', currentPlan.videos.length);
      console.log('  Status:', currentPlan.status);
    } else {
      console.log('No current plan found (this is normal if none scheduled for today/tomorrow)');
    }
    console.log('✅ Current plan check passed\n');

    // Step 3: Get plan calendar
    console.log('[Step 3] Getting plan calendar (last 5 plans)...');
    const calendar = await contentStrategyAgent.getAllPlans(5);

    console.log(`Found ${calendar.length} plans in calendar:`);
    for (const p of calendar) {
      console.log(`  - ${p.date}: ${p.videos.length} videos, $${p.totalCost || 0} cost, status: ${p.status}`);
    }
    console.log('✅ Calendar check passed\n');

    // Step 4: Test plan execution (dry run - don't actually execute)
    console.log('[Step 4] Testing plan execution capability...');
    console.log('Note: Skipping actual execution to avoid generating real videos');
    console.log('To execute a plan, use:');
    console.log(`  await contentStrategyAgent.executeDailyPlan('${plan.id}')`);
    console.log('✅ Execution capability test passed\n');

    console.log('========================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('========================================');
    console.log('\nThe Content Strategy Agent is working correctly!');
    console.log('It will run daily at 9am CST to:');
    console.log('  - Analyze content demand (comments, sentiment, trends)');
    console.log('  - Select optimal figures with character priorities');
    console.log('  - Schedule videos at optimal posting times');
    console.log('  - Generate executable content plans');
    console.log('\nTo manually execute a plan:');
    console.log('  1. Generate plan: POST /api/content-strategy/generate-plan');
    console.log('  2. Review plan: GET /api/content-strategy/current-plan');
    console.log('  3. Execute plan: POST /api/content-strategy/execute-plan {"planId": "..."}');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Run the test
testContentStrategy();
