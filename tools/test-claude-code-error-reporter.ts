/**
 * TEST CLAUDE CODE ERROR REPORTER
 *
 * Demonstrates the Claude Code error reporting feature that generates
 * AI-powered fix recommendations in a format Claude Code can directly process.
 */

import { errorMonitor } from './server/services/error-monitor';
import { claudeCodeErrorReporter } from './server/services/claude-code-error-reporter';
import { readFileSync } from 'fs';

async function testClaudeCodeErrorReporter() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        CLAUDE CODE ERROR REPORTER TEST                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Test 1: Simulate a high-severity API timeout error
    console.log('[Test 1] Simulating API timeout error (high severity)...');
    console.log('This should trigger Claude Code report generation.\n');

    const timeoutError = new Error('Request timeout: Kling API call took too long (ETIMEDOUT after 30000ms)');
    timeoutError.stack = `Error: Request timeout: Kling API call took too long (ETIMEDOUT after 30000ms)
    at KlingVideoGenerator.generateVideo (/home/aaronishere2025/server/services/kling-video-generator.ts:145:15)
    at async JobWorker.processKlingGeneration (/home/aaronishere2025/server/services/job-worker.ts:412:22)
    at async JobWorker.processJob (/home/aaronishere2025/server/services/job-worker.ts:89:10)`;

    const report1 = await errorMonitor.captureError(timeoutError, {
      service: 'kling-video-generator',
      operation: 'generateVideo',
      jobId: 'test-job-timeout',
      metadata: {
        timeout: 30000,
        apiEndpoint: 'https://api.klingai.com/v1/videos/generations',
        retryAttempt: 0,
      },
    });

    console.log('✅ Error captured:', report1.id);
    console.log('   Category:', report1.errorType);
    console.log('   Severity:', report1.severity);
    console.log('');

    // Wait for Claude Code report generation
    console.log('⏳ Generating Claude Code error report with AI analysis...');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test 2: Simulate a critical database error
    console.log('\n[Test 2] Simulating database connection error (critical severity)...');

    const dbError = new Error('Connection terminated unexpectedly: postgres ECONNREFUSED');
    dbError.stack = `Error: Connection terminated unexpectedly
    at Connection.parseE (/home/aaronishere2025/node_modules/pg/lib/connection.js:659:13)
    at Connection.parseMessage (/home/aaronishere2025/node_modules/pg/lib/connection.js:456:19)
    at Socket.<anonymous> (/home/aaronishere2025/node_modules/pg/lib/connection.js:127:22)`;

    const report2 = await errorMonitor.captureError(dbError, {
      service: 'database',
      operation: 'query',
      metadata: {
        query: 'SELECT * FROM jobs WHERE id = $1',
        host: 'localhost',
        port: 5432,
      },
    });

    console.log('✅ Error captured:', report2.id);
    console.log('   Category:', report2.errorType);
    console.log('   Severity:', report2.severity);
    console.log('');

    // Wait for report generation
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Test 3: Check generated reports
    console.log('\n[Test 3] Checking generated Claude Code reports...');

    const reports = claudeCodeErrorReporter.getReports();
    console.log(`✅ Found ${reports.length} Claude Code error reports\n`);

    if (reports.length > 0) {
      // Display the most recent report
      const latestReport = reports[reports.length - 1];
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('LATEST CLAUDE CODE ERROR REPORT');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('Report Path:', latestReport);
      console.log('');

      // Read and display the report
      const reportContent = readFileSync(latestReport, 'utf-8');
      console.log(reportContent);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ CLAUDE CODE ERROR REPORTER TEST COMPLETE                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('🎯 How This Works:');
    console.log('  1. High/critical error occurs in your system');
    console.log('  2. Error Monitor captures it automatically');
    console.log('  3. Claude Code Error Reporter generates detailed report');
    console.log('  4. GPT-4o analyzes error and suggests exact code fixes');
    console.log('  5. Report saved to /tmp/claude-code-error-reports/');
    console.log('  6. You (Claude Code) read the report and apply fixes');
    console.log('');

    console.log("📊 What's In Each Report:");
    console.log('  ✓ Root cause analysis (what actually went wrong)');
    console.log('  ✓ Affected files with line numbers');
    console.log('  ✓ Related code snippets for context');
    console.log('  ✓ Exact code changes (old → new)');
    console.log('  ✓ Test plan to verify the fix');
    console.log('  ✓ Confidence score and auto-applyable flag');
    console.log('');

    console.log('🔄 Integration with Auto-Fix System:');
    console.log('  • Error Monitor detects error');
    console.log('  • Auto-Fix Agent tries known patterns first');
    console.log('  • Claude Code Reporter generates detailed report');
    console.log('  • If auto-fix fails, report guides manual fix');
    console.log('  • Reports formatted specifically for Claude Code');
    console.log('');

    console.log('💡 Usage Instructions:');
    console.log('  1. When you see: "Claude Code report generated: /tmp/..."');
    console.log('  2. Run: Read({ file_path: "/tmp/claude-code-error-reports/err_*.md" })');
    console.log('  3. Follow the "Instructions for Claude Code" section');
    console.log('  4. Apply fixes using Edit tool with exact snippets provided');
    console.log('  5. Run test plan to verify');
    console.log('');

    console.log('🚀 Benefits:');
    console.log('  ✓ No more guessing what went wrong');
    console.log('  ✓ Exact file paths and line numbers');
    console.log('  ✓ AI-powered root cause analysis');
    console.log('  ✓ Ready-to-apply code changes');
    console.log('  ✓ Test plans included');
    console.log('  ✓ System learns from successful fixes');
    console.log('');

    console.log('⚡ Example Workflow:');
    console.log('  Error occurs → Report generated → You read report → Apply fix → Test');
    console.log('  Total time: ~5 minutes (vs hours of debugging)');
    console.log('');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Run test
console.log('Starting Claude Code error reporter test...\n');
testClaudeCodeErrorReporter();
