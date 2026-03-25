/**
 * RETRY FAILED JOBS WITH STAGGERED UPLOAD SCHEDULING
 *
 * Resets failed jobs from today and schedules uploads to prevent conflicts.
 * Uploads will be staggered 30 minutes apart.
 */

import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

async function retryFailedJobsWithScheduling() {
  console.log('🔄 RETRYING FAILED JOBS WITH STAGGERED SCHEDULING\n');
  console.log('='.repeat(60));

  // Get all failed jobs from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const failedJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.status, 'failed'), gte(jobs.createdAt, today)));

  console.log(`\n📊 Found ${failedJobs.length} failed jobs from today\n`);

  if (failedJobs.length === 0) {
    console.log('✅ No failed jobs to retry!');
    return;
  }

  // Group by failure type
  const timeoutFailures = failedJobs.filter(
    (j) => j.errorMessage?.includes('Looping video') || j.errorMessage?.includes('timeout'),
  );
  const sunoFailures = failedJobs.filter((j) => j.errorMessage?.includes('Suno'));
  const otherFailures = failedJobs.filter(
    (j) =>
      !j.errorMessage?.includes('Looping video') &&
      !j.errorMessage?.includes('timeout') &&
      !j.errorMessage?.includes('Suno'),
  );

  console.log(`   FFmpeg timeout failures: ${timeoutFailures.length}`);
  console.log(`   Suno API failures: ${sunoFailures.length}`);
  console.log(`   Other failures: ${otherFailures.length}\n`);

  // Calculate staggered upload times
  // Start 1 hour from now, upload every 30 minutes
  const now = new Date();
  const firstUploadTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
  const uploadInterval = 30 * 60 * 1000; // 30 minutes

  console.log('='.repeat(60));
  console.log('🗓️  UPLOAD SCHEDULE\n');
  console.log(`   First upload: ${firstUploadTime.toLocaleTimeString()}`);
  console.log(`   Interval: 30 minutes between uploads`);
  console.log(
    `   Last upload: ${new Date(firstUploadTime.getTime() + (failedJobs.length - 1) * uploadInterval).toLocaleTimeString()}\n`,
  );

  // Reset jobs to queued with scheduled upload times
  let successCount = 0;
  let skipCount = 0;

  for (let i = 0; i < failedJobs.length; i++) {
    const job = failedJobs[i];
    const scheduledUploadTime = new Date(firstUploadTime.getTime() + i * uploadInterval);

    // Skip Suno failures for now (need to check API)
    if (job.errorMessage?.includes('Suno')) {
      console.log(`   ⏭️  Skipping ${job.scriptName} (Suno API issue, needs investigation)`);
      skipCount++;
      continue;
    }

    try {
      await db
        .update(jobs)
        .set({
          status: 'queued',
          errorMessage: null,
          retryCount: 0,
          progress: 0,
          updatedAt: new Date(),
          // Store scheduled upload time in metadata
          unityMetadata: {
            ...job.unityMetadata,
            scheduledUploadTime: scheduledUploadTime.toISOString(),
            retryReason: 'FFmpeg timeout fixed, retrying with new settings',
          } as any,
        })
        .where(eq(jobs.id, job.id));

      console.log(`   ✅ ${job.scriptName}`);
      console.log(`      Upload scheduled: ${scheduledUploadTime.toLocaleTimeString()}`);
      successCount++;
    } catch (error: any) {
      console.error(`   ❌ Failed to reset ${job.scriptName}: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');
  console.log(`   ✅ Reset to queued: ${successCount}`);
  console.log(`   ⏭️  Skipped: ${skipCount}`);
  console.log(`   ❌ Failed to reset: ${failedJobs.length - successCount - skipCount}\n`);

  console.log('='.repeat(60));
  console.log('🚀 NEXT STEPS\n');
  console.log('1. Jobs will be processed by job-worker.ts');
  console.log('2. Videos will be generated with new timeout settings');
  console.log('3. Uploads will be staggered 30 minutes apart');
  console.log('4. Check /api/jobs to monitor progress\n');

  console.log('💡 TIP: Watch the server logs to see job progress:');
  console.log('   tail -f /tmp/server-clean-restart.log | grep "Processing job"\n');

  console.log('='.repeat(60));
}

// Run
retryFailedJobsWithScheduling()
  .then(() => {
    console.log('✅ Done!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
