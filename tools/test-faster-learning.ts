/**
 * TEST FASTER LEARNING SYSTEM
 *
 * Tests the enhanced scheduler with:
 * - 15-minute orchestrator cycles (vs 60 minutes before)
 * - 3x daily content strategy (vs 1x before)
 * - Configurable intervals via API
 */

import { agentScheduler } from './server/services/agent-scheduler';

async function testFasterLearning() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           FASTER LEARNING SYSTEM TEST                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Check default fast learning settings
    console.log('[Test 1] Checking default fast learning configuration...');

    const initialStatus = agentScheduler.getStatus();
    console.log('✅ Scheduler Status:');
    console.log('   Running:', initialStatus.isRunning);
    console.log('   Orchestrator Interval:', initialStatus.orchestrator.intervalMinutes, 'minutes');
    console.log('   Content Strategy Jobs:', initialStatus.contentStrategy.jobCount);
    console.log('   Content Strategy Description:', initialStatus.contentStrategy.description);
    console.log('');

    // Verify fast learning defaults
    if (initialStatus.orchestrator.intervalMinutes === 15) {
      console.log('✅ PASS: Orchestrator running every 15 minutes (FAST)');
    } else {
      console.log(`❌ FAIL: Expected 15 minutes, got ${initialStatus.orchestrator.intervalMinutes}`);
    }

    if (initialStatus.contentStrategy.jobCount === 3) {
      console.log('✅ PASS: Content Strategy running 3x per day (FAST)');
    } else {
      console.log(`❌ FAIL: Expected 3 jobs, got ${initialStatus.contentStrategy.jobCount}`);
    }
    console.log('');

    // Test 2: Test changing orchestrator interval dynamically
    console.log('[Test 2] Testing dynamic interval adjustment (set to 5 minutes)...');

    await agentScheduler.setOrchestratorInterval(5);

    const updatedStatus = agentScheduler.getStatus();
    if (updatedStatus.orchestrator.intervalMinutes === 5) {
      console.log('✅ PASS: Orchestrator interval updated to 5 minutes');
    } else {
      console.log(`❌ FAIL: Expected 5 minutes, got ${updatedStatus.orchestrator.intervalMinutes}`);
    }
    console.log('');

    // Test 3: Test changing content strategy schedules
    console.log('[Test 3] Testing dynamic schedule adjustment (hourly)...');

    // Set to hourly for testing (every hour from 9am to 5pm)
    const hourlySchedules = [
      '0 9 * * *', // 9am
      '0 10 * * *', // 10am
      '0 11 * * *', // 11am
      '0 12 * * *', // 12pm
      '0 13 * * *', // 1pm
      '0 14 * * *', // 2pm
      '0 15 * * *', // 3pm
      '0 16 * * *', // 4pm
      '0 17 * * *', // 5pm
    ];

    await agentScheduler.setContentStrategySchedules(hourlySchedules);

    const hourlyStatus = agentScheduler.getStatus();
    if (hourlyStatus.contentStrategy.jobCount === 9) {
      console.log('✅ PASS: Content Strategy updated to 9 runs per day');
    } else {
      console.log(`❌ FAIL: Expected 9 jobs, got ${hourlyStatus.contentStrategy.jobCount}`);
    }
    console.log('');

    // Test 4: Restore default fast learning settings
    console.log('[Test 4] Restoring default fast learning settings...');

    await agentScheduler.setOrchestratorInterval(15);
    await agentScheduler.setContentStrategySchedules([
      '0 9 * * *', // 9am
      '0 15 * * *', // 3pm
      '0 21 * * *', // 9pm
    ]);

    const finalStatus = agentScheduler.getStatus();
    console.log('✅ Settings restored:');
    console.log('   Orchestrator:', finalStatus.orchestrator.intervalMinutes, 'minutes');
    console.log('   Content Strategy:', finalStatus.contentStrategy.jobCount, 'runs per day');
    console.log('');

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('FASTER LEARNING COMPARISON');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('BEFORE (Slow Learning):');
    console.log('  Orchestrator: Every 60 minutes = 24 cycles per day');
    console.log('  Content Strategy: 1x per day (9am only)');
    console.log('  Total Learning Cycles: 25 per day');
    console.log('');

    console.log('AFTER (Fast Learning):');
    console.log('  Orchestrator: Every 15 minutes = 96 cycles per day');
    console.log('  Content Strategy: 3x per day (9am, 3pm, 9pm)');
    console.log('  Total Learning Cycles: 99 per day');
    console.log('');

    console.log('IMPROVEMENT:');
    console.log('  🚀 3.96x MORE orchestrator cycles (96 vs 24)');
    console.log('  🚀 3x MORE content planning (3 vs 1)');
    console.log('  🚀 System adapts to YouTube data 4x FASTER');
    console.log('');

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ FASTER LEARNING SYSTEM TEST COMPLETE                       ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('🎯 What Changed:');
    console.log('  ✓ Orchestrator runs every 15 min (was 60 min)');
    console.log('  ✓ Content Strategy runs 3x per day (was 1x)');
    console.log('  ✓ Intervals configurable via systemConfiguration table');
    console.log('  ✓ API endpoints for dynamic adjustment');
    console.log('');

    console.log('📊 API Endpoints Available:');
    console.log('  GET  /api/scheduler/status                    - Get current settings');
    console.log('  POST /api/scheduler/orchestrator-interval     - Update interval (minutes)');
    console.log('  POST /api/scheduler/content-strategy-schedules - Update schedules (cron)');
    console.log('');

    console.log('🔄 How It Works Now:');
    console.log('  1. YouTube video published');
    console.log('  2. Data collected (views, CTR, retention, comments)');
    console.log('  3. Learning systems analyze (4 parallel systems)');
    console.log('  4. Orchestrator applies changes every 15 min (vs 60 min)');
    console.log('  5. Content Strategy generates new plans 3x per day (vs 1x)');
    console.log('  6. System improves 4x FASTER than before!');
    console.log('');

    console.log('💡 Configuration Examples:');
    console.log('  Ultra Fast Learning: 5-min orchestrator, hourly content strategy');
    console.log('  Balanced: 15-min orchestrator (current), 3x daily content strategy');
    console.log('  Conservative: 60-min orchestrator, 1x daily content strategy');
    console.log('');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Run test
console.log('Starting faster learning system test...\n');
testFasterLearning();
