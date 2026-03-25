import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

console.log('Checking for stuck processing jobs...\n');

const stuck = await db.select().from(jobs).where(eq(jobs.status, 'processing'));

if (stuck.length === 0) {
  console.log('No stuck jobs found!');
  process.exit(0);
}

console.log(`Found ${stuck.length} stuck job(s):`);
for (const job of stuck) {
  console.log(`  ${job.id.substring(0, 8)}... - ${job.scriptName} (${job.progress}%)`);

  // Mark as failed
  await db
    .update(jobs)
    .set({
      status: 'failed',
      error: `Manually failed: stuck at ${job.progress}% - Beat analysis error`,
    })
    .where(eq(jobs.id, job.id));

  console.log(`  ✅ Marked as failed`);
}

console.log('\n✅ Queue unblocked! New jobs should process now.');
process.exit(0);
