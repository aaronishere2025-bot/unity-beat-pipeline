import { db } from './server/db';
import { jobs } from '@shared/schema';

async function checkStatus() {
  console.log('📊 Checking job statuses...\n');

  const allJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      mode: jobs.mode,
      progress: jobs.progress,
      error: jobs.errorMessage,
      packageId: jobs.packageId,
    })
    .from(jobs)
    .limit(10);

  console.log(`Found ${allJobs.length} recent jobs:\n`);

  for (const job of allJobs) {
    console.log(`${job.id.substring(0, 8)}... | ${job.status.padEnd(12)} | ${job.mode} | Progress: ${job.progress}%`);
    if (job.error) {
      console.log(`   Error: ${job.error.substring(0, 100)}`);
    }
  }

  const queuedCount = allJobs.filter((j) => j.status === 'queued').length;
  const processingCount = allJobs.filter((j) => j.status === 'processing').length;
  const completedCount = allJobs.filter((j) => j.status === 'completed').length;
  const failedCount = allJobs.filter((j) => j.status === 'failed').length;

  console.log(
    `\n📈 Summary: ${queuedCount} queued, ${processingCount} processing, ${completedCount} completed, ${failedCount} failed`,
  );

  process.exit(0);
}

checkStatus().catch(console.error);
