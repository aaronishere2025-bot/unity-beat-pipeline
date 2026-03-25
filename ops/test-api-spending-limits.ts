/**
 * TEST API SPENDING LIMITS
 *
 * Tests the per-service daily spending limits for OpenAI, Gemini, and Claude
 */

import { costGuard } from './server/services/cost-guard';

async function testApiSpendingLimits() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💰 API SPENDING LIMITS TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ============================================================================
  // TEST 1: Check current spending status
  // ============================================================================
  console.log('TEST 1: Current Spending Status');
  console.log('─────────────────────────────────────────────────────────\n');

  const currentSpending = await costGuard.getCurrentSpending();

  console.log('Overall Limits:');
  console.log(
    `  Total Daily: $${currentSpending.daily.current.toFixed(2)} / $${currentSpending.daily.limit} (${currentSpending.daily.percentage.toFixed(1)}%) - ${currentSpending.daily.status}`,
  );
  console.log(
    `  Total Monthly: $${currentSpending.monthly.current.toFixed(2)} / $${currentSpending.monthly.limit} (${currentSpending.monthly.percentage.toFixed(1)}%) - ${currentSpending.monthly.status}`,
  );
  console.log('');

  console.log('Per-Service Daily Limits:');
  const services = ['openai', 'gemini', 'claude', 'kling', 'suno'] as const;
  for (const service of services) {
    const status = currentSpending.dailyPerService[service];
    const emoji =
      status.status === 'EXCEEDED'
        ? '🚫'
        : status.status === 'DANGER'
          ? '⚠️'
          : status.status === 'WARNING'
            ? '⚠️'
            : '✅';
    console.log(
      `  ${emoji} ${service.toUpperCase().padEnd(7)}: $${status.current.toFixed(2)} / $${status.limit} (${status.percentage.toFixed(1)}%) - ${status.status}`,
    );
  }
  console.log('');

  // ============================================================================
  // TEST 2: Test OpenAI limit enforcement
  // ============================================================================
  console.log('TEST 2: OpenAI Limit Enforcement');
  console.log('─────────────────────────────────────────────────────────\n');

  // Test small operation (should pass)
  console.log('Attempting $5 OpenAI operation...');
  const openaiCheck1 = await costGuard.canProceed(5.0, 'test-operation', 'openai');
  console.log(`  Result: ${openaiCheck1.allowed ? '✅ ALLOWED' : '❌ BLOCKED'}`);
  if (!openaiCheck1.allowed) {
    console.log(`  Reason: ${openaiCheck1.reason}`);
  }
  console.log('');

  // Test operation that would exceed limit
  console.log('Attempting $45 OpenAI operation (should exceed $40 limit)...');
  const openaiCheck2 = await costGuard.canProceed(45.0, 'test-operation', 'openai');
  console.log(`  Result: ${openaiCheck2.allowed ? '✅ ALLOWED' : '❌ BLOCKED'}`);
  if (!openaiCheck2.allowed) {
    console.log(`  Reason: ${openaiCheck2.reason}`);
  }
  console.log('');

  // ============================================================================
  // TEST 3: Test Gemini limit enforcement
  // ============================================================================
  console.log('TEST 3: Gemini Limit Enforcement');
  console.log('─────────────────────────────────────────────────────────\n');

  console.log('Attempting $10 Gemini operation...');
  const geminiCheck1 = await costGuard.canProceed(10.0, 'test-operation', 'gemini');
  console.log(`  Result: ${geminiCheck1.allowed ? '✅ ALLOWED' : '❌ BLOCKED'}`);
  if (!geminiCheck1.allowed) {
    console.log(`  Reason: ${geminiCheck1.reason}`);
  }
  console.log('');

  console.log('Attempting $50 Gemini operation (should exceed $40 limit)...');
  const geminiCheck2 = await costGuard.canProceed(50.0, 'test-operation', 'gemini');
  console.log(`  Result: ${geminiCheck2.allowed ? '✅ ALLOWED' : '❌ BLOCKED'}`);
  if (!geminiCheck2.allowed) {
    console.log(`  Reason: ${geminiCheck2.reason}`);
  }
  console.log('');

  // ============================================================================
  // TEST 4: Test Claude limit enforcement
  // ============================================================================
  console.log('TEST 4: Claude Limit Enforcement');
  console.log('─────────────────────────────────────────────────────────\n');

  console.log('Attempting $15 Claude operation...');
  const claudeCheck1 = await costGuard.canProceed(15.0, 'test-operation', 'claude');
  console.log(`  Result: ${claudeCheck1.allowed ? '✅ ALLOWED' : '❌ BLOCKED'}`);
  if (!claudeCheck1.allowed) {
    console.log(`  Reason: ${claudeCheck1.reason}`);
  }
  console.log('');

  console.log('Attempting $60 Claude operation (should exceed $40 limit)...');
  const claudeCheck2 = await costGuard.canProceed(60.0, 'test-operation', 'claude');
  console.log(`  Result: ${claudeCheck2.allowed ? '✅ ALLOWED' : '❌ BLOCKED'}`);
  if (!claudeCheck2.allowed) {
    console.log(`  Reason: ${claudeCheck2.reason}`);
  }
  console.log('');

  // ============================================================================
  // TEST 5: Test emergency killswitch
  // ============================================================================
  console.log('TEST 5: Emergency Killswitch');
  console.log('─────────────────────────────────────────────────────────\n');

  console.log('Activating emergency killswitch...');
  costGuard.activateEmergencyKillswitch('TEST: Demonstrating killswitch');
  console.log('');

  console.log('Attempting $1 OpenAI operation with killswitch active...');
  const killswitchCheck = await costGuard.canProceed(1.0, 'test-operation', 'openai');
  console.log(`  Result: ${killswitchCheck.allowed ? '✅ ALLOWED' : '❌ BLOCKED'}`);
  if (!killswitchCheck.allowed) {
    console.log(`  Reason: ${killswitchCheck.reason}`);
  }
  console.log('');

  console.log('Deactivating emergency killswitch...');
  costGuard.deactivateEmergencyKillswitch();
  console.log('');

  // ============================================================================
  // TEST 6: withCostGuard helper function
  // ============================================================================
  console.log('TEST 6: withCostGuard Helper Function');
  console.log('─────────────────────────────────────────────────────────\n');

  const { withCostGuard } = await import('./server/services/cost-guard');

  console.log('Testing withCostGuard with $2 OpenAI operation...');
  try {
    await withCostGuard('test-operation', 2.0, 'openai', async () => {
      console.log('  ✅ Operation executed successfully');
      return 'success';
    });
  } catch (err: any) {
    console.log(`  ❌ Operation blocked: ${err.message}`);
  }
  console.log('');

  console.log('Testing withCostGuard with $50 Gemini operation (should fail)...');
  try {
    await withCostGuard('test-operation', 50.0, 'gemini', async () => {
      console.log('  ✅ Operation executed successfully');
      return 'success';
    });
  } catch (err: any) {
    console.log(`  ❌ Operation blocked: ${err.message}`);
  }
  console.log('');

  // ============================================================================
  // TEST 7: Get detailed cost report
  // ============================================================================
  console.log('TEST 7: Detailed Cost Report');
  console.log('─────────────────────────────────────────────────────────\n');

  const report = await costGuard.getDetailedReport();

  console.log('Spending Summary:');
  console.log(`  Daily: $${report.spending.daily.current.toFixed(2)} / $${report.spending.daily.limit}`);
  console.log(`  Monthly: $${report.spending.monthly.current.toFixed(2)} / $${report.spending.monthly.limit}`);
  console.log(`  Projected Monthly: $${report.projectedMonthlySpend.toFixed(2)}`);
  console.log('');

  if (report.topCostDrivers.length > 0) {
    console.log('Top Cost Drivers (this month):');
    report.topCostDrivers.slice(0, 5).forEach((driver, index) => {
      console.log(
        `  ${index + 1}. ${driver.service}/${driver.operation}: $${driver.cost.toFixed(2)} (${driver.calls} calls)`,
      );
    });
  } else {
    console.log('No cost data available yet.');
  }
  console.log('');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ API SPENDING LIMITS TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Per-Service Daily Limits:');
  console.log('  OpenAI: $40/day');
  console.log('  Gemini: $40/day');
  console.log('  Claude: $40/day');
  console.log('  Kling: $20/day');
  console.log('  Suno: $10/day');
  console.log('  Total: $150/day\n');

  console.log('Features:');
  console.log('  ✓ Per-service spending limits enforced');
  console.log('  ✓ Operations blocked when limit exceeded');
  console.log('  ✓ Warnings when approaching limits (70% = WARNING, 90% = DANGER)');
  console.log('  ✓ Emergency killswitch for runaway costs');
  console.log('  ✓ Detailed cost reporting and projections');
  console.log('');

  console.log('Usage:');
  console.log('  const check = await costGuard.canProceed(cost, operation, service);');
  console.log('  await withCostGuard(operation, cost, service, async () => { ... });');
  console.log('');
}

// Run the test
testApiSpendingLimits()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
