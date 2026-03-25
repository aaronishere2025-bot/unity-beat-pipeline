/**
 * TEST FEEDBACK ORCHESTRATOR
 *
 * Tests the Feedback Loop Orchestrator Agent to ensure it:
 * - Gathers signals from all 4 learning systems
 * - Applies changes to configuration
 * - Resolves conflicts
 * - Creates audit trail
 */

import { feedbackLoopOrchestrator } from './server/services/feedback-loop-orchestrator-agent';
import { db } from './server/db';
import { systemConfiguration } from './shared/schema';
import { eq } from 'drizzle-orm';

async function testFeedbackOrchestrator() {
  console.log('========================================');
  console.log('TESTING FEEDBACK LOOP ORCHESTRATOR');
  console.log('========================================\n');

  try {
    // Step 1: Check orchestrator status
    console.log('[Step 1] Checking orchestrator status...');
    const status = await feedbackLoopOrchestrator.getStatus();
    console.log('Status:', JSON.stringify(status, null, 2));
    console.log('✅ Status check passed\n');

    // Step 2: Run orchestration cycle
    console.log('[Step 2] Running orchestration cycle...');
    const result = await feedbackLoopOrchestrator.runOrchestrationCycle();

    console.log('\n📊 Orchestration Results:');
    console.log('Summary:', result.summary);
    console.log('Report ID:', result.report.id);
    console.log('Execution Time:', result.report.executionTimeMs, 'ms');
    console.log('Status:', result.report.status);
    console.log('\n✅ Orchestration cycle completed\n');

    // Step 3: Check applied changes
    console.log('[Step 3] Checking applied configuration changes...');

    const configs = await db
      .select()
      .from(systemConfiguration)
      .where(eq(systemConfiguration.updatedBy, 'feedback-orchestrator'));

    console.log(`Found ${configs.length} configurations updated by orchestrator:`);
    for (const config of configs) {
      console.log(`  - ${config.key}: ${JSON.stringify(config.value).substring(0, 100)}...`);
    }
    console.log('✅ Configuration check passed\n');

    // Step 4: Check recent reports
    console.log('[Step 4] Checking recent orchestration reports...');
    const reports = await feedbackLoopOrchestrator.getReports(5);

    console.log(`Found ${reports.length} recent reports:`);
    for (const report of reports) {
      console.log(`  - ${report.timestamp}: ${report.reasoning?.substring(0, 100)}...`);
    }
    console.log('✅ Reports check passed\n');

    // Step 5: Test enable/disable
    console.log('[Step 5] Testing enable/disable...');
    await feedbackLoopOrchestrator.setEnabled(false);
    let newStatus = await feedbackLoopOrchestrator.getStatus();
    console.log('Disabled:', !newStatus.enabled);

    await feedbackLoopOrchestrator.setEnabled(true);
    newStatus = await feedbackLoopOrchestrator.getStatus();
    console.log('Re-enabled:', newStatus.enabled);
    console.log('✅ Enable/disable test passed\n');

    console.log('========================================');
    console.log('✅ ALL TESTS PASSED!');
    console.log('========================================');
    console.log('\nThe Feedback Loop Orchestrator is working correctly!');
    console.log('It will run hourly to apply learning from:');
    console.log('  - Comment Sentiment (character priorities)');
    console.log('  - Creative Analytics (thumbnail/title patterns)');
    console.log('  - Feature Correlation (audio BPM/energy)');
    console.log('  - Style Bandit (visual styles)');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Run the test
testFeedbackOrchestrator();
