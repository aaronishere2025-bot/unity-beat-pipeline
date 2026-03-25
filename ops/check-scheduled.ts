import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { isNotNull } from 'drizzle-orm';

async function checkScheduled() {
  const scheduledJobs = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      scheduledTime: jobs.scheduledTime,
      status: jobs.status,
      youtubeVideoId: jobs.youtubeVideoId,
    })
    .from(jobs)
    .where(isNotNull(jobs.scheduledTime))
    .limit(10);

  console.log(`\nFound ${scheduledJobs.length} jobs with scheduledTime set:\n`);

  for (const job of scheduledJobs) {
    console.log(`- ${job.scriptName}`);
    console.log(`  ID: ${job.id.slice(0, 8)}...`);
    console.log(`  Scheduled: ${job.scheduledTime}`);
    console.log(`  Status: ${job.status}`);
    console.log(`  YouTube ID: ${job.youtubeVideoId || 'not uploaded'}`);
    console.log('');
  }

  // Also check total completed jobs without scheduled time
  const { eq, isNull, and } = await import('drizzle-orm');
  const unscheduledCompleted = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      status: jobs.status,
    })
    .from(jobs)
    .where(and(eq(jobs.status, 'completed'), isNull(jobs.scheduledTime), isNull(jobs.youtubeVideoId)))
    .limit(5);

  console.log(`\nSample of unscheduled completed jobs (${unscheduledCompleted.length}):`);
  for (const job of unscheduledCompleted) {
    console.log(`- ${job.scriptName} (${job.id.slice(0, 8)}...)`);
  }

  process.exit(0);
}

checkScheduled().catch(console.error);
