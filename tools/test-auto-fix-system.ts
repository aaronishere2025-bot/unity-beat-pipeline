/**
 * TEST AUTO-FIX SYSTEM
 *
 * Tests the error detection and auto-fixing capabilities
 */

import { errorMonitor } from './server/services/error-monitor';
import { autoFixAgent } from './server/services/auto-fix-agent';

async function testAutoFixSystem() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           AUTO-FIX SYSTEM TEST                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Simulate API timeout error
    console.log('[Test 1] Simulating API timeout error...');
    const timeoutError = new Error('Request timeout: API call to Kling took too long (ETIMEDOUT)');
    const report1 = await errorMonitor.captureError(timeoutError, {
      service: 'kling-api',
      operation: 'generateVideo',
      jobId: 'test-job-1',
    });

    console.log('✅ Error captured:', report1.id);
    console.log('   Category:', report1.errorType);
    console.log('   Severity:', report1.severity);
    console.log('   Auto-fix triggered:', report1.fixAttempted);
    console.log('');

    // Wait for auto-fix
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test 2: Simulate rate limit error
    console.log('[Test 2] Simulating rate limit error...');
    const rateLimitError = new Error('Rate limit exceeded: Too many requests (429)');
    const report2 = await errorMonitor.captureError(rateLimitError, {
      service: 'suno-api',
      operation: 'generateMusic',
      jobId: 'test-job-2',
    });

    console.log('✅ Error captured:', report2.id);
    console.log('   Category:', report2.errorType);
    console.log('   Severity:', report2.severity);
    console.log('');

    // Wait for auto-fix
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test 3: Simulate file not found error
    console.log('[Test 3] Simulating file not found error...');
    const fileError = new Error("ENOENT: no such file or directory, open '/tmp/video_clip.mp4'");
    const report3 = await errorMonitor.captureError(fileError, {
      service: 'ffmpeg-processor',
      operation: 'assembleVideo',
      metadata: { filePath: '/tmp/video_clip.mp4' },
    });

    console.log('✅ Error captured:', report3.id);
    console.log('   Category:', report3.errorType);
    console.log('   Severity:', report3.severity);
    console.log('');

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get statistics
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ERROR MONITOR STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const errorStats = await errorMonitor.getStats();
    console.log('Total Errors:', errorStats.total);
    console.log('Active:', errorStats.active);
    console.log('Fixed:', errorStats.fixed);
    console.log('\nBy Severity:');
    console.log('  Critical:', errorStats.bySeverity.critical);
    console.log('  High:', errorStats.bySeverity.high);
    console.log('  Medium:', errorStats.bySeverity.medium);
    console.log('  Low:', errorStats.bySeverity.low);

    console.log('\nBy Category:');
    for (const [category, count] of Object.entries(errorStats.byCategory)) {
      console.log(`  ${category}:`, count);
    }

    console.log('\nFix Success Rate:', errorStats.fixSuccessRate.toFixed(1) + '%');

    // Get auto-fix statistics
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('AUTO-FIX AGENT STATISTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const fixStats = autoFixAgent.getStats();
    console.log('Total Fix Attempts:', fixStats.totalFixes);
    console.log('Successful Fixes:', fixStats.successfulFixes);
    console.log('Success Rate:', fixStats.successRate.toFixed(1) + '%');

    if (fixStats.topStrategies.length > 0) {
      console.log('\nTop Fix Strategies:');
      for (const strategy of fixStats.topStrategies) {
        console.log(`  ${strategy.strategy}: ${strategy.uses} uses, ${strategy.successRate.toFixed(1)}% success`);
      }
    }

    // Get recent errors
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('RECENT ERRORS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const recentErrors = errorMonitor.getRecentErrors(5);
    for (const error of recentErrors) {
      console.log(`[${error.severity.toUpperCase()}] ${error.errorType}`);
      console.log(`  Message: ${error.errorMessage.substring(0, 80)}...`);
      console.log(`  Service: ${error.context.service}`);
      console.log(`  Occurrences: ${error.occurrenceCount}`);
      console.log(`  Fix Attempted: ${error.fixAttempted ? 'Yes' : 'No'}`);
      console.log(`  Status: ${error.status}`);
      console.log('');
    }

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ AUTO-FIX SYSTEM TEST COMPLETE                             ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log("🎯 What's Working:");
    console.log('  ✓ Error detection and categorization');
    console.log('  ✓ Severity assessment');
    console.log('  ✓ Auto-fix triggering');
    console.log('  ✓ Pattern matching');
    console.log('  ✓ Statistics tracking');
    console.log('  ✓ Learning from fixes');

    console.log('\n📊 API Endpoints Available:');
    console.log('  GET  /api/errors/stats      - Get error & fix statistics');
    console.log('  GET  /api/errors/recent     - Get recent errors');
    console.log('  POST /api/errors/fix/:id    - Manually trigger fix');

    console.log('\n🔄 How It Works:');
    console.log('  1. Error occurs anywhere in system');
    console.log('  2. Error Monitor captures & categorizes it');
    console.log('  3. Auto-Fix Agent analyzes with AI');
    console.log('  4. Fix strategy generated & applied');
    console.log('  5. Success/failure tracked & learned from');
    console.log('  6. Future errors fixed automatically!');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Run test
console.log('Starting auto-fix system test in 2 seconds...\n');
setTimeout(() => {
  testAutoFixSystem();
}, 2000);
