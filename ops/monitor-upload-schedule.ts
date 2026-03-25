/**
 * MONITOR UPLOAD SCHEDULE
 *
 * Displays upcoming scheduled uploads and prevents conflicts.
 */

import { db } from './server/db';
import { jobs } from './shared/schema';
import { inArray } from 'drizzle-orm';

async function monitorUploadSchedule() {
  console.log('📅 UPLOAD SCHEDULE MONITOR\n');
  console.log('='.repeat(60));

  // Get all jobs with scheduled upload times
  const allJobs = await db
    .select()
    .from(jobs)
    .where(inArray(jobs.status, ['queued', 'processing', 'completed']));

  const scheduledJobs = allJobs
    .filter((j) => j.unityMetadata?.scheduledUploadTime)
    .map((j) => ({
      id: j.id,
      name: j.scriptName,
      status: j.status,
      scheduledTime: new Date(j.unityMetadata.scheduledUploadTime),
      progress: j.progress,
    }))
    .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());

  console.log(`\n📊 Found ${scheduledJobs.length} jobs with scheduled uploads\n`);

  if (scheduledJobs.length === 0) {
    console.log('✅ No scheduled uploads');
    return;
  }

  const now = new Date();

  console.log('='.repeat(60));
  console.log('🗓️  UPCOMING UPLOADS\n');

  for (const job of scheduledJobs) {
    const minutesUntil = Math.round((job.scheduledTime.getTime() - now.getTime()) / (60 * 1000));
    const timeStr = job.scheduledTime.toLocaleTimeString();
    const statusEmoji = job.status === 'completed' ? '✅' : job.status === 'processing' ? '⏳' : '📋';

    let timeInfo = '';
    if (minutesUntil < 0) {
      timeInfo = `(${Math.abs(minutesUntil)} min ago)`;
    } else if (minutesUntil === 0) {
      timeInfo = '(NOW!)';
    } else if (minutesUntil < 60) {
      timeInfo = `(in ${minutesUntil} min)`;
    } else {
      const hours = Math.floor(minutesUntil / 60);
      timeInfo = `(in ${hours}h ${minutesUntil % 60}m)`;
    }

    console.log(`   ${statusEmoji} ${timeStr} ${timeInfo}`);
    console.log(`      ${job.name} - ${job.status} (${job.progress}%)\n`);
  }

  // Check for conflicts (uploads within 5 minutes of each other)
  console.log('='.repeat(60));
  console.log('🔍 CONFLICT CHECK\n');

  let conflicts = 0;
  for (let i = 0; i < scheduledJobs.length - 1; i++) {
    const job1 = scheduledJobs[i];
    const job2 = scheduledJobs[i + 1];
    const timeDiff = (job2.scheduledTime.getTime() - job1.scheduledTime.getTime()) / (60 * 1000);

    if (timeDiff < 5) {
      console.log(`   ⚠️  Conflict: ${job1.name} and ${job2.name}`);
      console.log(`      Only ${timeDiff.toFixed(1)} minutes apart!\n`);
      conflicts++;
    }
  }

  if (conflicts === 0) {
    console.log('   ✅ No conflicts detected - all uploads properly spaced\n');
  }

  // Statistics
  console.log('='.repeat(60));
  console.log('📊 STATISTICS\n');

  const queued = scheduledJobs.filter((j) => j.status === 'queued').length;
  const processing = scheduledJobs.filter((j) => j.status === 'processing').length;
  const completed = scheduledJobs.filter((j) => j.status === 'completed').length;

  console.log(`   📋 Queued: ${queued}`);
  console.log(`   ⏳ Processing: ${processing}`);
  console.log(`   ✅ Completed: ${completed}`);

  const nextUpload = scheduledJobs.find((j) => j.scheduledTime > now && j.status !== 'completed');
  if (nextUpload) {
    const minutesUntil = Math.round((nextUpload.scheduledTime.getTime() - now.getTime()) / (60 * 1000));
    console.log(`\n   🎯 Next upload: ${nextUpload.name}`);
    console.log(`      Scheduled: ${nextUpload.scheduledTime.toLocaleTimeString()}`);
    console.log(`      Time until upload: ${minutesUntil} minutes\n`);
  }

  console.log('='.repeat(60));
}

// Run
monitorUploadSchedule()
  .then(() => {
    console.log('✅ Done!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  });
