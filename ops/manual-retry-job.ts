#!/usr/bin/env tsx
/**
 * Manually Retry Failed Job
 * Tests the new retry logic that allows retry at any progress level
 */

const JOB_ID = '77da3ada-3014-4e8b-8007-eb46c19c8458';

async function retryJob() {
  console.log('🔄 Manually Retrying Failed Job\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Job ID:', JOB_ID);
  console.log('  Testing: New retry logic (no progress limit)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { db } = await import('./server/db');
  const { jobs } = await import('@shared/schema');
  const { eq } = await import('drizzle-orm');

  try {
    // Get current job state
    const job = await db.select().from(jobs).where(eq(jobs.id, JOB_ID)).limit(1);

    if (job.length === 0) {
      console.error('❌ Job not found');
      process.exit(1);
    }

    const currentJob = job[0];
    console.log('Current State:');
    console.log('  Status:', currentJob.status);
    console.log('  Progress:', currentJob.progress + '%');
    console.log('  Retry Count:', currentJob.retryCount || 0);
    console.log('  Max Retries:', currentJob.maxRetries || 3);
    console.log('\n');

    const currentRetries = currentJob.retryCount || 0;
    const maxRetries = currentJob.maxRetries || 3;

    if (currentRetries >= maxRetries) {
      console.error(`❌ Cannot retry: Already at max retries (${currentRetries}/${maxRetries})`);
      process.exit(1);
    }

    const nextRetry = currentRetries + 1;

    // Requeue the job
    console.log(`🔄 Requeueing job (attempt ${nextRetry}/${maxRetries})...`);

    await db
      .update(jobs)
      .set({
        status: 'queued',
        retryCount: nextRetry,
        errorMessage: `Manual retry ${nextRetry}/${maxRetries} at ${currentJob.progress}%: Testing new retry logic (no progress limit)`,
        error: null,
      })
      .where(eq(jobs.id, JOB_ID));

    console.log('✅ Job requeued successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📺 MONITOR AT:');
    console.log('  Dashboard: http://localhost:8080/jobs');
    console.log('  Direct:    http://localhost:8080/jobs/' + JOB_ID);
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('The job worker will pick it up automatically.');
    console.log('It will resume from existing completed work.\n');
  } catch (error: any) {
    console.error('\n❌ Failed to retry job:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
retryJob().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
