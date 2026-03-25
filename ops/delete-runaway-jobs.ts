import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { gt, eq } from 'drizzle-orm';

console.log('🔍 Finding jobs with excessive retries...\n');

// Find all jobs with retryCount > 3
const runawayJobs = await db.select().from(jobs).where(gt(jobs.retryCount, 3));

console.log(`Found ${runawayJobs.length} jobs with excessive retries:\n`);

for (const job of runawayJobs) {
  console.log(`  ❌ ${job.scriptName} (${job.id})`);
  console.log(`     Retry count: ${job.retryCount}`);
  console.log(`     Status: ${job.status}`);

  // Delete the job
  await db.delete(jobs).where(eq(jobs.id, job.id));
}

console.log(`\n✅ Deleted ${runawayJobs.length} runaway jobs`);
