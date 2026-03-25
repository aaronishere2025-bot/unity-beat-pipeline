/**
 * Test script to verify error monitoring and auto-fix system
 */

import { errorMonitor } from './server/services/error-monitor.js';
import { autoFixAgent } from './server/services/auto-fix-agent.js';
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, eq, sql } from 'drizzle-orm';

async function testErrorCapture() {
  console.log('\n🧪 Testing Error Monitoring & Auto-Fix System\n');

  // Get the most recent failed job
  const failedJobs = await db
    .select()
    .from(jobs)
    .where(sql`status = 'failed'`)
    .orderBy(desc(jobs.createdAt))
    .limit(3);

  if (failedJobs.length === 0) {
    console.log('❌ No failed jobs found to test with');
    process.exit(1);
  }

  console.log(`Found ${failedJobs.length} failed jobs\n`);

  for (const job of failedJobs) {
    console.log(`\n📋 Testing with Job: ${job.id}`);
    console.log(`   Error: ${job.errorMessage}`);
    console.log(`   Mode: ${job.mode}`);

    // Simulate the error capture that should happen in job-worker
    const testError = new Error(job.errorMessage || 'Unknown error');

    try {
      const errorReport = await errorMonitor.captureError(testError, {
        service: 'job-worker',
        operation: 'processUnityVeoJob',
        jobId: job.id,
        metadata: {
          mode: job.mode,
          topic: job.topic,
          progress: job.progress || 0,
        },
      });

      console.log(`\n✅ Error captured: ${errorReport.id}`);
      console.log(`   Type: ${errorReport.errorType}`);
      console.log(`   Severity: ${errorReport.severity}`);
      console.log(`   Fix Attempted: ${errorReport.fixAttempted}`);
      console.log(`   Status: ${errorReport.status}`);

      // Wait a moment for auto-fix to process
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error(`❌ Failed to capture error:`, error.message);
    }
  }

  // Get error statistics
  console.log('\n📊 Error Monitor Statistics:');
  const stats = await errorMonitor.getStats();
  console.log(JSON.stringify(stats, null, 2));

  // Get auto-fix statistics
  console.log('\n🤖 Auto-Fix Agent Statistics:');
  const fixStats = autoFixAgent.getStats();
  console.log(JSON.stringify(fixStats, null, 2));

  process.exit(0);
}

testErrorCapture().catch(console.error);
