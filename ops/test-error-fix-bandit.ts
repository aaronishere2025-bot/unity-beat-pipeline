/**
 * TEST ERROR FIX BANDIT
 *
 * Tests the Error Fix Bandit system with Thompson Sampling
 * Simulates various error scenarios and tracks learning
 */

import { errorFixBandit } from './server/services/error-fix-bandit';

async function testErrorFixBandit() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎰 ERROR FIX BANDIT TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  // ============================================================================
  // TEST 1: Initial State
  // ============================================================================
  console.log('TEST 1: Initial State');
  console.log('─────────────────────────────────────────────────────────\n');

  const initialStats = errorFixBandit.getStatistics();
  console.log(`Total arms: ${initialStats.armStats.length}`);
  console.log(`Total pulls: ${initialStats.totalPulls}`);
  console.log(`Total successes: ${initialStats.totalSuccesses}\n`);

  console.log('Available arms:');
  initialStats.armStats.forEach((arm) => {
    console.log(`  - ${arm.name} (${arm.id})`);
    console.log(`    Pulls: ${arm.pulls}, Success rate: ${(arm.successRate * 100).toFixed(1)}%`);
  });
  console.log('');

  // ============================================================================
  // TEST 2: Select strategies for different error categories
  // ============================================================================
  console.log('TEST 2: Strategy Selection');
  console.log('─────────────────────────────────────────────────────────\n');

  const errorCategories = [
    'API_ERROR',
    'TIMEOUT_ERROR',
    'FILE_ERROR',
    'DATABASE_ERROR',
    'KLING_ERROR',
    'SUNO_ERROR',
    'MEMORY_ERROR',
    'VALIDATION_ERROR',
  ];

  console.log('Selecting strategies for each error category:\n');
  for (const category of errorCategories) {
    try {
      const selected = errorFixBandit.selectFixStrategy(category);
      console.log(`${category}:`);
      console.log(`  → Selected: ${selected.strategyName}`);
      console.log(`  → Confidence: ${(selected.confidence * 100).toFixed(1)}%`);
      console.log(`  → ${selected.isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'}`);
      console.log(`  → Strategy: ${JSON.stringify(selected.fixStrategy)}`);
      console.log('');
    } catch (err: any) {
      console.log(`${category}: ❌ ${err.message}\n`);
    }
  }

  // ============================================================================
  // TEST 3: Simulate successes and failures
  // ============================================================================
  console.log('TEST 3: Simulating Outcomes');
  console.log('─────────────────────────────────────────────────────────\n');

  // Simulate 5 API timeout errors with different outcomes
  console.log('Scenario: API Timeout Errors (5 attempts)\n');
  for (let i = 1; i <= 5; i++) {
    const selected = errorFixBandit.selectFixStrategy('TIMEOUT_ERROR');
    const jobSucceeded = Math.random() > 0.3; // 70% success rate
    const fixTime = 20 + Math.random() * 40; // 20-60 seconds

    console.log(`Attempt ${i}:`);
    console.log(`  Strategy: ${selected.strategyName}`);
    console.log(`  Job succeeded: ${jobSucceeded ? '✅' : '❌'}`);
    console.log(`  Fix time: ${fixTime.toFixed(1)}s`);

    errorFixBandit.updateReward(selected.strategyId, {
      jobSucceeded,
      fixTime,
      errorResolved: jobSucceeded,
    });
    console.log('');
  }

  // Simulate 3 file errors (should always succeed with create_missing_dir)
  console.log('Scenario: File Errors (3 attempts)\n');
  for (let i = 1; i <= 3; i++) {
    const selected = errorFixBandit.selectFixStrategy('FILE_ERROR');
    const fixTime = 5 + Math.random() * 10; // 5-15 seconds

    console.log(`Attempt ${i}:`);
    console.log(`  Strategy: ${selected.strategyName}`);
    console.log(`  Job succeeded: ✅ (file created)`);
    console.log(`  Fix time: ${fixTime.toFixed(1)}s`);

    errorFixBandit.updateReward(selected.strategyId, {
      jobSucceeded: true,
      fixTime,
      errorResolved: true,
    });
    console.log('');
  }

  // Simulate 4 Kling errors with varying success
  console.log('Scenario: Kling Errors (4 attempts)\n');
  for (let i = 1; i <= 4; i++) {
    const selected = errorFixBandit.selectFixStrategy('KLING_ERROR');
    const jobSucceeded = Math.random() > 0.5; // 50% success rate
    const fixTime = 30 + Math.random() * 90; // 30-120 seconds

    console.log(`Attempt ${i}:`);
    console.log(`  Strategy: ${selected.strategyName}`);
    console.log(`  Job succeeded: ${jobSucceeded ? '✅' : '❌'}`);
    console.log(`  Fix time: ${fixTime.toFixed(1)}s`);

    errorFixBandit.updateReward(selected.strategyId, {
      jobSucceeded,
      fixTime,
      errorResolved: jobSucceeded,
    });
    console.log('');
  }

  // ============================================================================
  // TEST 4: Check learning - arms should have updated alpha/beta
  // ============================================================================
  console.log('TEST 4: Learning Verification');
  console.log('─────────────────────────────────────────────────────────\n');

  const finalStats = errorFixBandit.getStatistics();
  console.log(`Total pulls: ${finalStats.totalPulls}`);
  console.log(`Total successful fixes: ${finalStats.totalSuccesses}\n`);

  console.log('Updated arm statistics:\n');
  const sortedArms = finalStats.armStats
    .filter((arm) => arm.pulls > 0)
    .sort((a, b) => b.totalJobsFixed - a.totalJobsFixed);

  sortedArms.forEach((arm, index) => {
    console.log(`${index + 1}. ${arm.name} (${arm.id})`);
    console.log(`   Pulls: ${arm.pulls}`);
    console.log(`   Success rate: ${(arm.successRate * 100).toFixed(1)}%`);
    console.log(`   Jobs fixed: ${arm.totalJobsFixed}`);
    console.log(`   Avg fix time: ${arm.avgFixTime.toFixed(1)}s`);
    console.log('');
  });

  // ============================================================================
  // TEST 5: Best strategies per category
  // ============================================================================
  console.log('TEST 5: Best Strategies (Exploitation Only)');
  console.log('─────────────────────────────────────────────────────────\n');

  for (const category of errorCategories) {
    try {
      const best = errorFixBandit.getBestStrategy(category);
      if (best) {
        console.log(`${category}:`);
        console.log(`  → ${best.name}`);
        console.log(`  → Success rate: ${((best.alpha / (best.alpha + best.beta)) * 100).toFixed(1)}%`);
        console.log(`  → Pulls: ${best.pulls}, Jobs fixed: ${best.totalJobsFixed}`);
        console.log('');
      }
    } catch (err: any) {
      console.log(`${category}: ❌ ${err.message}\n`);
    }
  }

  // ============================================================================
  // TEST 6: Exploration vs Exploitation balance
  // ============================================================================
  console.log('TEST 6: Exploration vs Exploitation Balance');
  console.log('─────────────────────────────────────────────────────────\n');

  console.log('Running 20 selections for TIMEOUT_ERROR to measure balance:\n');
  let explorationCount = 0;
  let exploitationCount = 0;

  for (let i = 0; i < 20; i++) {
    const selected = errorFixBandit.selectFixStrategy('TIMEOUT_ERROR');
    if (selected.isExploration) {
      explorationCount++;
    } else {
      exploitationCount++;
    }
  }

  console.log(`Exploration: ${explorationCount}/20 (${((explorationCount / 20) * 100).toFixed(1)}%)`);
  console.log(`Exploitation: ${exploitationCount}/20 (${((exploitationCount / 20) * 100).toFixed(1)}%)`);
  console.log('');

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ ERROR FIX BANDIT TEST COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Key Findings:');
  console.log(`  - Total pulls across all arms: ${finalStats.totalPulls}`);
  console.log(`  - Total successful job recoveries: ${finalStats.totalSuccesses}`);
  console.log(`  - Overall success rate: ${((finalStats.totalSuccesses / finalStats.totalPulls) * 100).toFixed(1)}%`);
  console.log(`  - Active strategies (pulled at least once): ${sortedArms.length}`);
  console.log('');

  if (sortedArms.length > 0) {
    const topStrategy = sortedArms[0];
    console.log('Top performing strategy:');
    console.log(`  ${topStrategy.name}`);
    console.log(`  ${topStrategy.totalJobsFixed} jobs fixed out of ${topStrategy.pulls} attempts`);
    console.log(`  ${(topStrategy.successRate * 100).toFixed(1)}% success rate`);
    console.log(`  ${topStrategy.avgFixTime.toFixed(1)}s average fix time`);
    console.log('');
  }

  console.log('Expected behavior:');
  console.log('  ✓ Strategies with high success rate should have high alpha');
  console.log('  ✓ Failed strategies should have high beta');
  console.log('  ✓ System should explore ~10-30% of the time initially');
  console.log('  ✓ Best strategies should dominate after 20+ pulls');
  console.log('');

  console.log('State file: data/error_fix_bandit.json');
  console.log('  View this file to see full Thompson Sampling state');
  console.log('');
}

// Run the test
testErrorFixBandit()
  .then(() => {
    console.log('Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Test failed:', error);
    process.exit(1);
  });
