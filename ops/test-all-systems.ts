/**
 * Comprehensive System Test
 * Tests all new features: Cost Tracking + Health Monitoring
 *
 * Run: npx tsx test-all-systems.ts
 */

import { systemHealthMonitor } from './server/services/system-health-monitor';
import { costTrackingValidator } from './server/services/cost-tracking-validator';
import { healthCheckScheduler } from './server/services/health-check-scheduler';
import {
  calculateOpenAICost,
  calculateClaudeCost,
  calculateGeminiCost,
  calculateKlingCost,
  calculateSunoCost,
  calculateVisionCost,
} from './server/config/pricing';
import { db } from './server/db';
import { systemHealthSnapshots } from './shared/schema';
import { desc } from 'drizzle-orm';

// Test results
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function test(name: string, testFn: () => boolean | Promise<boolean>): void {
  console.log(`\n🧪 ${name}`);
  try {
    const result = testFn();
    if (result instanceof Promise) {
      result
        .then((passed) => {
          if (passed) {
            passedTests++;
            console.log(`  ✅ PASSED`);
          } else {
            failedTests++;
            failures.push(name);
            console.log(`  ❌ FAILED`);
          }
        })
        .catch((err) => {
          failedTests++;
          failures.push(`${name}: ${err.message}`);
          console.log(`  ❌ ERROR: ${err.message}`);
        });
    } else {
      if (result) {
        passedTests++;
        console.log(`  ✅ PASSED`);
      } else {
        failedTests++;
        failures.push(name);
        console.log(`  ❌ FAILED`);
      }
    }
  } catch (err: any) {
    failedTests++;
    failures.push(`${name}: ${err.message}`);
    console.log(`  ❌ ERROR: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('🚀 COMPREHENSIVE SYSTEM TEST');
  console.log('═'.repeat(60));
  console.log(`Date: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  // ============================================================================
  // SECTION 1: Pricing Calculations
  // ============================================================================
  console.log('\n📊 SECTION 1: PRICING CALCULATIONS');
  console.log('─'.repeat(60));

  test('OpenAI GPT-4o pricing', () => {
    const cost = calculateOpenAICost('gpt-4o', 1_000_000, 1_000_000);
    return Math.abs(cost - 12.5) < 0.01; // 2.50 + 10.00
  });

  test('Claude Sonnet 4 pricing', () => {
    const cost = calculateClaudeCost('claude-sonnet-4-20250514', 1_000_000, 1_000_000);
    return Math.abs(cost - 18.0) < 0.01; // 3.00 + 15.00
  });

  test('Gemini 2.0 Flash pricing', () => {
    const cost = calculateGeminiCost('gemini-2.0-flash-exp', 1_000_000, 1_000_000);
    return Math.abs(cost - 0.375) < 0.01; // 0.075 + 0.30
  });

  test('Kling 5s clip pricing', () => {
    const cost = calculateKlingCost(1, 5);
    return Math.abs(cost - 0.1) < 0.01; // $0.10 per 5s clip
  });

  test('Suno standard generation pricing', () => {
    const cost = calculateSunoCost(1); // 1 song, default v5
    return Math.abs(cost - 0.1) < 0.01; // $0.10 per song
  });

  test('Vision scoring cost calculation', () => {
    const cost = calculateVisionCost('gpt-4o', 1000, 500);
    return cost > 0 && cost < 1; // Should be small but non-zero
  });

  // ============================================================================
  // SECTION 2: Health Monitoring
  // ============================================================================
  console.log('\n🏥 SECTION 2: HEALTH MONITORING');
  console.log('─'.repeat(60));

  test('Health monitor - Heartbeat recording', () => {
    systemHealthMonitor.recordHeartbeat('test-loop');
    return true;
  });

  test('Health monitor - API success recording', () => {
    systemHealthMonitor.recordAPISuccess('openai');
    return true;
  });

  test('Health monitor - API error recording', () => {
    systemHealthMonitor.recordAPIError('openai', 'Test error');
    return true;
  });

  test('Health monitor - Check core APIs', async () => {
    const apis = await systemHealthMonitor.checkCoreAPIs();
    return Array.isArray(apis) && apis.length === 5; // 5 core APIs
  });

  test('Health monitor - Check background loops', async () => {
    const loops = await systemHealthMonitor.checkBackgroundLoops();
    return Array.isArray(loops) && loops.length === 6; // 6 expected loops
  });

  test('Health monitor - Check system resources', async () => {
    const resources = await systemHealthMonitor.checkSystemResources();
    return (
      typeof resources === 'object' &&
      resources !== null &&
      'disk' in resources &&
      'memory' in resources &&
      'cpu' in resources
    );
  });

  test('Health monitor - Check database', async () => {
    const db = await systemHealthMonitor.checkDatabaseHealth();
    return typeof db.connectionOk === 'boolean';
  });

  test('Health monitor - Check job queue', async () => {
    const queue = await systemHealthMonitor.checkJobQueueHealth();
    return typeof queue.queuedJobs === 'number' && typeof queue.processingJobs === 'number';
  });

  test('Health monitor - Check error monitoring', async () => {
    const errors = await systemHealthMonitor.checkErrorMonitoring();
    return typeof errors.activeErrors === 'number';
  });

  test('Health monitor - Comprehensive health report', async () => {
    const health = await systemHealthMonitor.getComprehensiveHealth();
    return (
      health.timestamp instanceof Date &&
      Array.isArray(health.coreAPIs) &&
      Array.isArray(health.backgroundLoops) &&
      typeof health.systemResources === 'object' &&
      health.systemResources !== null &&
      typeof health.database === 'object' &&
      typeof health.jobQueue === 'object' &&
      typeof health.errorMonitoring === 'object'
    );
  });

  test('Health monitor - Performance < 500ms', async () => {
    const start = Date.now();
    await systemHealthMonitor.getComprehensiveHealth();
    const duration = Date.now() - start;
    console.log(`  Duration: ${duration}ms`);
    return duration < 500;
  });

  test('Health monitor - Quick summary', async () => {
    const summary = await systemHealthMonitor.getQuickSummary();
    return typeof summary.status === 'string' && typeof summary.criticalCount === 'number';
  });

  // ============================================================================
  // SECTION 3: Health Check Scheduler
  // ============================================================================
  console.log('\n⏰ SECTION 3: HEALTH CHECK SCHEDULER');
  console.log('─'.repeat(60));

  test('Scheduler - Get status', () => {
    const status = healthCheckScheduler.getStatus();
    return typeof status.isRunning === 'boolean';
  });

  // ============================================================================
  // SECTION 4: Cost Tracking Validator
  // ============================================================================
  console.log('\n💰 SECTION 4: COST TRACKING VALIDATOR');
  console.log('─'.repeat(60));

  test('Cost validator - Centralized pricing verification', () => {
    const result = costTrackingValidator.verifyCentralizedPricing();
    if (!result.valid) {
      console.log(`  Issues: ${result.issues.join(', ')}`);
    }
    return result.valid;
  });

  test('Cost validator - Validate recent jobs', async () => {
    try {
      const validation = await costTrackingValidator.validateRecentJobs(24);
      console.log(`  Jobs checked: ${validation.summary.totalJobsChecked}`);
      console.log(`  Coverage: ${validation.summary.coveragePercent.toFixed(1)}%`);
      return validation.summary.totalJobsChecked >= 0; // Just check it runs
    } catch (error: any) {
      // If there are no recent jobs, that's okay
      if (error.message.includes('no jobs') || error.message.includes('not found')) {
        console.log('  No recent jobs to validate (expected in test environment)');
        return true;
      }
      throw error;
    }
  });

  // ============================================================================
  // SECTION 5: Database Integration
  // ============================================================================
  console.log('\n🗄️ SECTION 5: DATABASE INTEGRATION');
  console.log('─'.repeat(60));

  test('Database - Health snapshots table exists', async () => {
    try {
      const snapshots = await db
        .select()
        .from(systemHealthSnapshots)
        .orderBy(desc(systemHealthSnapshots.timestamp))
        .limit(1);
      return true; // If query succeeds, table exists
    } catch (error) {
      console.log(`  Error: ${error}`);
      return false;
    }
  });

  test('Database - Can insert health snapshot', async () => {
    try {
      const health = await systemHealthMonitor.getComprehensiveHealth();
      await db.insert(systemHealthSnapshots).values({
        timestamp: new Date(),
        overallStatus: health.overallStatus,
        coreApisStatus: health.coreAPIs as any,
        backgroundLoopsStatus: health.backgroundLoops as any,
        systemResourcesStatus: health.systemResources as any,
        databaseStatus: health.database as any,
        jobQueueStatus: health.jobQueue as any,
        errorStatus: health.errorMonitoring as any,
        criticalIssues: health.criticalIssues,
      });
      console.log('  ✅ Successfully inserted snapshot');
      return true;
    } catch (error: any) {
      console.log(`  Error: ${error.message}`);
      return false;
    }
  });

  test('Database - Can query health snapshots', async () => {
    try {
      const snapshots = await db
        .select()
        .from(systemHealthSnapshots)
        .orderBy(desc(systemHealthSnapshots.timestamp))
        .limit(5);
      console.log(`  Found ${snapshots.length} snapshots`);
      return snapshots.length > 0;
    } catch (error: any) {
      console.log(`  Error: ${error.message}`);
      return false;
    }
  });

  // ============================================================================
  // SECTION 6: Integration Tests
  // ============================================================================
  console.log('\n🔗 SECTION 6: INTEGRATION TESTS');
  console.log('─'.repeat(60));

  test('Integration - Full health check cycle', async () => {
    try {
      // Record some heartbeats
      systemHealthMonitor.recordHeartbeat('analytics-polling');
      systemHealthMonitor.recordHeartbeat('agent-scheduler');
      systemHealthMonitor.recordHeartbeat('video-scheduler');

      // Run comprehensive check
      const health = await systemHealthMonitor.getComprehensiveHealth();

      // Store snapshot
      await db.insert(systemHealthSnapshots).values({
        timestamp: health.timestamp,
        overallStatus: health.overallStatus,
        coreApisStatus: health.coreAPIs as any,
        backgroundLoopsStatus: health.backgroundLoops as any,
        systemResourcesStatus: health.systemResources as any,
        databaseStatus: health.database as any,
        jobQueueStatus: health.jobQueue as any,
        errorStatus: health.errorMonitoring as any,
        criticalIssues: health.criticalIssues,
      });

      return true;
    } catch (error: any) {
      console.log(`  Error: ${error.message}`);
      return false;
    }
  });

  // Wait for async tests to complete
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // ============================================================================
  // FINAL RESULTS
  // ============================================================================
  console.log('\n' + '═'.repeat(60));
  console.log('📊 FINAL RESULTS');
  console.log('═'.repeat(60));
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📈 Success Rate: ${((passedTests / (passedTests + failedTests)) * 100).toFixed(1)}%`);

  if (failures.length > 0) {
    console.log('\n❌ Failed Tests:');
    failures.forEach((failure) => console.log(`  • ${failure}`));
  }

  console.log('═'.repeat(60));
  console.log('\n🎉 Test suite complete!');
  console.log('\n💡 Next steps:');
  console.log('  1. Check health endpoints: curl http://localhost:8080/api/health/comprehensive');
  console.log('  2. Check cost validation: curl http://localhost:8080/api/costs/stats');
  console.log('  3. Monitor console logs for health summaries (every 15 min)');
  console.log('  4. Check database: SELECT * FROM system_health_snapshots ORDER BY timestamp DESC LIMIT 5;');
  console.log('═'.repeat(60) + '\n');

  process.exit(failedTests > 0 ? 1 : 0);
}

// Run the tests
runTests().catch((error) => {
  console.error('\n❌ Test suite crashed:', error);
  process.exit(1);
});
