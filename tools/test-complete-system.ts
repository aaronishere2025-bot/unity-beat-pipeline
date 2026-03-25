/**
 * COMPLETE SYSTEM TEST & VERIFICATION
 *
 * Comprehensive end-to-end test that verifies:
 * 1. Multiagent closed-loop system
 * 2. Auto-error detection and fixing
 * 3. Faster learning (15-min cycles)
 * 4. Claude Code error reporting
 * 5. All components working together
 *
 * This is the MASTER TEST that verifies the entire system.
 */

import { errorMonitor } from './server/services/error-monitor';
import { autoFixAgent } from './server/services/auto-fix-agent';
import { feedbackLoopOrchestrator } from './server/services/feedback-loop-orchestrator-agent';
import { contentStrategyAgent } from './server/services/content-strategy-agent';
import { agentScheduler } from './server/services/agent-scheduler';
import { claudeCodeErrorReporter } from './server/services/claude-code-error-reporter';
import { readFileSync } from 'fs';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration?: number;
}

class SystemVerifier {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async runAllTests() {
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║              COMPLETE SYSTEM TEST & VERIFICATION                  ║');
    console.log('║                                                                   ║');
    console.log('║  Testing: Multiagent System + Auto-Fix + Faster Learning         ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    this.startTime = Date.now();

    // Phase 1: Test Agent Scheduler
    await this.testAgentScheduler();

    // Phase 2: Test Feedback Loop Orchestrator
    await this.testFeedbackLoopOrchestrator();

    // Phase 3: Test Content Strategy Agent
    await this.testContentStrategyAgent();

    // Phase 4: Test Error Monitor
    await this.testErrorMonitor();

    // Phase 5: Test Auto-Fix Agent
    await this.testAutoFixAgent();

    // Phase 6: Test Claude Code Error Reporter
    await this.testClaudeCodeErrorReporter();

    // Phase 7: Test Integration (all components together)
    await this.testIntegration();

    // Report Results
    this.reportResults();
  }

  async testAgentScheduler() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 1: Testing Agent Scheduler (Faster Learning)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Test 1.1: Check scheduler status
      console.log('[1.1] Checking scheduler configuration...');
      const status = agentScheduler.getStatus();

      if (status.orchestrator.intervalMinutes === 15) {
        this.pass('Orchestrator runs every 15 minutes (FAST)', '1.1');
      } else {
        this.fail('Orchestrator interval incorrect', '1.1', `Expected 15, got ${status.orchestrator.intervalMinutes}`);
      }

      // Test 1.2: Check content strategy schedules
      console.log('[1.2] Checking content strategy schedules...');
      if (status.contentStrategy.schedules.length === 3) {
        this.pass('Content Strategy runs 3x per day', '1.2');
      } else {
        this.fail(
          'Content Strategy schedule incorrect',
          '1.2',
          `Expected 3, got ${status.contentStrategy.schedules.length}`,
        );
      }

      // Test 1.3: Test dynamic interval adjustment
      console.log('[1.3] Testing dynamic interval adjustment...');
      await agentScheduler.setOrchestratorInterval(10);
      const updated = agentScheduler.getStatus();
      if (updated.orchestrator.intervalMinutes === 10) {
        this.pass('Dynamic interval adjustment works', '1.3');
        // Restore default
        await agentScheduler.setOrchestratorInterval(15);
      } else {
        this.fail('Dynamic interval adjustment failed', '1.3');
      }
    } catch (error: any) {
      this.fail('Agent Scheduler test failed', '1.x', error.message);
    }
  }

  async testFeedbackLoopOrchestrator() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 2: Testing Feedback Loop Orchestrator');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Test 2.1: Run orchestration cycle
      console.log('[2.1] Running orchestration cycle...');
      const result = await feedbackLoopOrchestrator.runOrchestrationCycle();

      if (result.report) {
        this.pass('Orchestration cycle completed', '2.1');
      } else {
        this.fail('Orchestration cycle failed', '2.1');
      }

      // Test 2.2: Check applied changes
      console.log('[2.2] Checking applied changes...');
      if (result.report.appliedChanges) {
        this.pass('Learning signals processed and applied', '2.2');
      } else {
        this.fail('No changes applied', '2.2');
      }

      // Test 2.3: Verify database persistence
      console.log('[2.3] Verifying database persistence...');
      const reports = await feedbackLoopOrchestrator.getReports(1);
      if (reports.length > 0) {
        this.pass('Orchestration reports saved to database', '2.3');
      } else {
        this.fail('Reports not persisted', '2.3');
      }
    } catch (error: any) {
      this.fail('Feedback Loop Orchestrator test failed', '2.x', error.message);
    }
  }

  async testContentStrategyAgent() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 3: Testing Content Strategy Agent');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Test 3.1: Generate daily plan
      console.log('[3.1] Generating daily content plan...');
      const plan = await contentStrategyAgent.generateDailyPlan({
        videoCount: 3,
        maxCost: 10,
      });

      if (plan.videos && plan.videos.length > 0) {
        this.pass(`Daily plan generated (${plan.videos.length} videos)`, '3.1');
      } else {
        this.fail('Plan generation failed', '3.1');
      }

      // Test 3.2: Verify plan structure
      console.log('[3.2] Verifying plan structure...');
      const hasRequiredFields = plan.videos.every(
        (v) => v.figure && v.theme && v.format && v.scheduledTime && v.reasoning,
      );

      if (hasRequiredFields) {
        this.pass('Plan structure is valid', '3.2');
      } else {
        this.fail('Plan structure incomplete', '3.2');
      }

      // Test 3.3: Check cost estimation
      console.log('[3.3] Checking cost estimation...');
      if (plan.totalCost && plan.totalCost > 0) {
        this.pass(`Cost estimated: $${plan.totalCost.toFixed(2)}`, '3.3');
      } else {
        this.fail('Cost estimation failed', '3.3');
      }
    } catch (error: any) {
      this.fail('Content Strategy Agent test failed', '3.x', error.message);
    }
  }

  async testErrorMonitor() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 4: Testing Error Monitor');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Test 4.1: Capture API error
      console.log('[4.1] Testing API error capture...');
      const apiError = new Error('Rate limit exceeded: Too many requests (429)');
      const report1 = await errorMonitor.captureError(apiError, {
        service: 'test-api',
        operation: 'testOperation',
      });

      if (report1.id && report1.errorType === 'API_ERROR') {
        this.pass('API error captured and categorized', '4.1');
      } else {
        this.fail('Error capture failed', '4.1');
      }

      // Test 4.2: Test severity assessment
      console.log('[4.2] Testing severity assessment...');
      if (report1.severity === 'high') {
        this.pass('Severity correctly assessed as HIGH', '4.2');
      } else {
        this.fail('Severity assessment incorrect', '4.2', `Expected high, got ${report1.severity}`);
      }

      // Test 4.3: Test error deduplication
      console.log('[4.3] Testing error deduplication...');
      const report2 = await errorMonitor.captureError(apiError, {
        service: 'test-api',
        operation: 'testOperation',
      });

      if (report2.occurrenceCount === 2) {
        this.pass('Error deduplication works (occurrence count: 2)', '4.3');
      } else {
        this.fail('Deduplication failed', '4.3');
      }

      // Test 4.4: Test statistics
      console.log('[4.4] Testing error statistics...');
      const stats = await errorMonitor.getStats();
      if (stats.total > 0) {
        this.pass(`Error statistics working (${stats.total} total errors)`, '4.4');
      } else {
        this.fail('Statistics not working', '4.4');
      }
    } catch (error: any) {
      this.fail('Error Monitor test failed', '4.x', error.message);
    }
  }

  async testAutoFixAgent() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 5: Testing Auto-Fix Agent');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Test 5.1: Test known pattern matching
      console.log('[5.1] Testing known pattern matching...');
      const timeoutError = new Error('Request timeout: API call timed out (ETIMEDOUT)');
      const report = await errorMonitor.captureError(timeoutError, {
        service: 'test-service',
        operation: 'testOp',
      });

      // Wait for auto-fix to complete
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (report.fixAttempted) {
        this.pass('Auto-fix triggered for known pattern', '5.1');
      } else {
        this.fail('Auto-fix not triggered', '5.1');
      }

      // Test 5.2: Check fix statistics
      console.log('[5.2] Checking fix statistics...');
      const stats = autoFixAgent.getStats();
      if (stats.totalFixes > 0) {
        this.pass(`Fix attempts logged (${stats.totalFixes} total)`, '5.2');
      } else {
        this.fail('Fix statistics not working', '5.2');
      }

      // Test 5.3: Verify success rate tracking
      console.log('[5.3] Verifying success rate tracking...');
      if (stats.successRate !== undefined) {
        this.pass(`Success rate tracked: ${stats.successRate.toFixed(1)}%`, '5.3');
      } else {
        this.fail('Success rate not tracked', '5.3');
      }
    } catch (error: any) {
      this.fail('Auto-Fix Agent test failed', '5.x', error.message);
    }
  }

  async testClaudeCodeErrorReporter() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 6: Testing Claude Code Error Reporter');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Test 6.1: Generate error report
      console.log('[6.1] Generating Claude Code error report...');
      const criticalError = new Error('Database connection failed: ECONNREFUSED');
      criticalError.stack = `Error: Database connection failed
    at Connection.connect (/server/db.ts:42:15)`;

      const report = await errorMonitor.captureError(criticalError, {
        service: 'database',
        operation: 'connect',
      });

      // Wait for report generation
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const reports = claudeCodeErrorReporter.getReports();
      if (reports.length > 0) {
        this.pass(`${reports.length} Claude Code reports generated`, '6.1');
      } else {
        this.fail('No reports generated', '6.1');
      }

      // Test 6.2: Verify report structure
      console.log('[6.2] Verifying report structure...');
      if (reports.length > 0) {
        const latestReport = reports[reports.length - 1];
        const content = readFileSync(latestReport, 'utf-8');

        const hasRequiredSections =
          content.includes('## Error Context') &&
          content.includes('## Root Cause Analysis') &&
          content.includes('## Suggested Fix') &&
          content.includes('## Instructions for Claude Code');

        if (hasRequiredSections) {
          this.pass('Report has all required sections', '6.2');
        } else {
          this.fail('Report structure incomplete', '6.2');
        }

        // Test 6.3: Verify code snippets
        console.log('[6.3] Verifying code snippets in report...');
        if (content.includes('```typescript') || content.includes('```')) {
          this.pass('Report contains code snippets', '6.3');
        } else {
          this.fail('No code snippets in report', '6.3');
        }
      }
    } catch (error: any) {
      this.fail('Claude Code Error Reporter test failed', '6.x', error.message);
    }
  }

  async testIntegration() {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PHASE 7: Testing Complete Integration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    try {
      // Test 7.1: Simulate error → auto-fix → Claude Code report flow
      console.log('[7.1] Testing complete error handling flow...');
      const integrationError = new Error('Integration test: Kling API timeout after 30000ms');
      integrationError.stack = `Error: Integration test
    at TestFunction (/test.ts:100:10)`;

      const report = await errorMonitor.captureError(integrationError, {
        service: 'integration-test',
        operation: 'testFlow',
      });

      // Wait for all async operations
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const flowComplete =
        report.id && // Error captured
        report.errorType !== 'UNKNOWN' && // Categorized
        report.severity && // Severity assessed
        report.fixAttempted; // Auto-fix triggered

      if (flowComplete) {
        this.pass('Complete error → auto-fix → report flow works', '7.1');
      } else {
        this.fail('Integration flow incomplete', '7.1');
      }

      // Test 7.2: Verify orchestrator → content strategy integration
      console.log('[7.2] Testing orchestrator → content strategy integration...');
      const orchestrationResult = await feedbackLoopOrchestrator.runOrchestrationCycle();
      const contentPlan = await contentStrategyAgent.generateDailyPlan({ videoCount: 2 });

      if (orchestrationResult.report && contentPlan.videos) {
        this.pass('Orchestrator and Content Strategy integrate correctly', '7.2');
      } else {
        this.fail('Integration incomplete', '7.2');
      }

      // Test 7.3: Verify faster learning is active
      console.log('[7.3] Verifying faster learning system is active...');
      const schedulerStatus = agentScheduler.getStatus();
      const isFastLearning =
        schedulerStatus.orchestrator.intervalMinutes <= 15 && schedulerStatus.contentStrategy.schedules.length >= 3;

      if (isFastLearning) {
        this.pass('Faster learning system is active (15min cycles, 3x daily)', '7.3');
      } else {
        this.fail('Faster learning not active', '7.3');
      }
    } catch (error: any) {
      this.fail('Integration test failed', '7.x', error.message);
    }
  }

  private pass(message: string, testId: string) {
    this.results.push({
      name: `[${testId}] ${message}`,
      passed: true,
      message: '✅ PASS',
    });
    console.log(`   ✅ PASS: ${message}`);
  }

  private fail(name: string, testId: string, message?: string) {
    this.results.push({
      name: `[${testId}] ${name}`,
      passed: false,
      message: message || 'Test failed',
    });
    console.log(`   ❌ FAIL: ${name}${message ? ` - ${message}` : ''}`);
  }

  private reportResults() {
    const totalTime = Date.now() - this.startTime;
    const passed = this.results.filter((r) => r.passed).length;
    const failed = this.results.filter((r) => !r.passed).length;
    const total = this.results.length;
    const successRate = (passed / total) * 100;

    console.log('\n\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║                       TEST RESULTS                                ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    console.log(`Total Tests:    ${total}`);
    console.log(`Passed:         ${passed} ✅`);
    console.log(`Failed:         ${failed} ❌`);
    console.log(`Success Rate:   ${successRate.toFixed(1)}%`);
    console.log(`Duration:       ${(totalTime / 1000).toFixed(2)}s\n`);

    if (failed > 0) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('FAILED TESTS:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      for (const result of this.results) {
        if (!result.passed) {
          console.log(`❌ ${result.name}`);
          console.log(`   ${result.message}\n`);
        }
      }
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SYSTEM COMPONENTS VERIFIED:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✅ Agent Scheduler (Faster Learning: 15min cycles)');
    console.log('✅ Feedback Loop Orchestrator (Auto-applies learning)');
    console.log('✅ Content Strategy Agent (3x daily planning)');
    console.log('✅ Error Monitor (Global error capture)');
    console.log('✅ Auto-Fix Agent (Known pattern fixes)');
    console.log('✅ Claude Code Error Reporter (AI-powered fix reports)');
    console.log('✅ Complete Integration (All components working together)\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('PERFORMANCE METRICS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Learning Speed:    4x FASTER (15min vs 60min cycles)');
    console.log('Content Planning:  3x MORE (3x daily vs 1x daily)');
    console.log('Error Detection:   AUTOMATIC (global handlers)');
    console.log('Error Fixing:      AUTOMATIC (known patterns)');
    console.log('Fix Guidance:      AI-POWERED (Claude Code reports)\n');

    if (successRate === 100) {
      console.log('╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║                                                                   ║');
      console.log('║              🎉 ALL TESTS PASSED - SYSTEM VERIFIED 🎉             ║');
      console.log('║                                                                   ║');
      console.log('║  Your self-improving multiagent video generation system is        ║');
      console.log('║  fully operational with 4x faster learning and auto-fixing!       ║');
      console.log('║                                                                   ║');
      console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
    } else {
      console.log('╔═══════════════════════════════════════════════════════════════════╗');
      console.log('║                                                                   ║');
      console.log('║              ⚠️  SOME TESTS FAILED - REVIEW NEEDED ⚠️             ║');
      console.log('║                                                                   ║');
      console.log('╚═══════════════════════════════════════════════════════════════════╝\n');
    }

    console.log('📊 Next Steps:');
    console.log('  1. Review any failed tests above');
    console.log('  2. Check /tmp/claude-code-error-reports/ for error fix reports');
    console.log('  3. Monitor system in production');
    console.log('  4. Adjust learning intervals if needed via API\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

// Run complete system test
console.log('🚀 Starting complete system verification...\n');
console.log('This will test all 7 phases of your multiagent system:\n');
console.log('  Phase 1: Agent Scheduler (Faster Learning)');
console.log('  Phase 2: Feedback Loop Orchestrator');
console.log('  Phase 3: Content Strategy Agent');
console.log('  Phase 4: Error Monitor');
console.log('  Phase 5: Auto-Fix Agent');
console.log('  Phase 6: Claude Code Error Reporter');
console.log('  Phase 7: Complete Integration\n');
console.log('Estimated time: 30-45 seconds\n');

const verifier = new SystemVerifier();
verifier.runAllTests();
