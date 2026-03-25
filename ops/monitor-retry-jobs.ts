import { db } from './server/db';
import { jobs } from './shared/schema';
import { inArray } from 'drizzle-orm';

const jobIds = [
  '33cc2ccb-9d58-4f3c-92be-7c7bd13cddaa',
  'db6278a5-bdb1-43e2-8577-6c14d9f49767',
  'd38db9ec-be93-492a-ada6-f3169e38da1b',
  '56878b63-9324-4333-82ac-7e4ca3320934',
  'e0fe0748-b792-4d6d-b7bd-6c3f3554176a',
];

async function monitorJobs() {
  const jobList = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      status: jobs.status,
      progress: jobs.progress,
      autoUpload: jobs.autoUpload,
      errorMessage: jobs.errorMessage,
      videoPath: jobs.videoPath,
    })
    .from(jobs)
    .where(inArray(jobs.id, jobIds));

  console.clear();
  console.log('🎬 JOB MONITOR - Watching 5 Retried Jobs');
  console.log('='.repeat(80));
  console.log(new Date().toLocaleTimeString() + '\n');

  const statusEmoji: Record<string, string> = {
    queued: '⏳',
    processing: '🔄',
    completed: '✅',
    failed: '❌',
  };

  for (const job of jobList) {
    const emoji = statusEmoji[job.status] || '❓';
    const shortId = job.id.slice(0, 8);
    const name = (job.scriptName || 'Unknown').slice(0, 40);

    console.log(`${emoji} ${shortId}... ${name}`);
    console.log(`   Status: ${job.status.toUpperCase()} | Progress: ${job.progress}%`);

    if (job.autoUpload) {
      console.log(`   🎥 Auto-upload: ENABLED`);
    }

    if (job.status === 'completed' && job.videoPath) {
      console.log(`   📹 Video: ${job.videoPath.split('/').pop()}`);
    }

    if (job.status === 'failed' && job.errorMessage) {
      console.log(`   ⚠️  Error: ${job.errorMessage.slice(0, 60)}...`);
    }

    console.log('');
  }

  // Summary
  const summary = {
    queued: jobList.filter((j) => j.status === 'queued').length,
    processing: jobList.filter((j) => j.status === 'processing').length,
    completed: jobList.filter((j) => j.status === 'completed').length,
    failed: jobList.filter((j) => j.status === 'failed').length,
  };

  console.log('─'.repeat(80));
  console.log(
    `📊 Summary: ${summary.queued} queued | ${summary.processing} processing | ${summary.completed} completed | ${summary.failed} failed`,
  );
  console.log('─'.repeat(80));

  // Check if all done
  if (summary.completed === 5) {
    console.log('\n🎉 ALL JOBS COMPLETED! Monitoring stopped.');
    process.exit(0);
  }

  if (summary.failed > 0 && summary.processing === 0 && summary.queued === 0) {
    console.log('\n⚠️  Some jobs failed and no jobs are processing. Check logs.');
  }
}

// Monitor every 5 seconds
async function startMonitoring() {
  console.log('Starting job monitor...\n');
  await monitorJobs();

  setInterval(async () => {
    try {
      await monitorJobs();
    } catch (error) {
      console.error('Monitor error:', error);
    }
  }, 5000);
}

startMonitoring().catch(console.error);
