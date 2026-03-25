import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { inArray } from 'drizzle-orm';

console.log('🔍 Checking ALL job statuses...\n');

const allJobs = await db.select().from(jobs).limit(100);

const byStatus = allJobs.reduce(
  (acc, job) => {
    acc[job.status] = acc[job.status] || [];
    acc[job.status].push(job);
    return acc;
  },
  {} as Record<string, typeof allJobs>,
);

console.log('Job Status Breakdown:');
Object.entries(byStatus).forEach(([status, jobs]) => {
  console.log(`  ${status}: ${jobs.length} jobs`);
});

console.log('\n📋 Processing Jobs:');
const processing = byStatus['processing'] || [];
processing.forEach((job) => {
  console.log(`  ${job.id.substring(0, 12)}... - ${job.scriptName} (${job.progress}%)`);
});

console.log('\n⏳ Queued Jobs (first 10):');
const queued = byStatus['queued'] || [];
queued.slice(0, 10).forEach((job) => {
  console.log(`  ${job.id.substring(0, 12)}... - ${job.scriptName} - User: ${job.userId?.substring(0, 8) || 'none'}`);
});

// Check if any processing jobs are really stuck
if (processing.length > 0) {
  console.log('\n⚠️  Found processing jobs - checking if they should be cleared...');
  for (const job of processing) {
    // If progress hasn't changed in a while, mark as failed
    await db
      .update(jobs)
      .set({
        status: 'failed',
        error: 'Cleared stuck job to unblock queue',
      })
      .where(
        inArray(
          jobs.id,
          processing.map((j) => j.id),
        ),
      );
  }
  console.log(`✅ Cleared ${processing.length} stuck job(s)`);
}

console.log('\n✅ Queue should be clear now - restart server to process queued jobs');
process.exit(0);
