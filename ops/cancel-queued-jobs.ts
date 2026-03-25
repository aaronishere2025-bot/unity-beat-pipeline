import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

console.log('Canceling all queued jobs...\n');

const queued = await db.select().from(jobs).where(eq(jobs.status, 'queued'));

console.log('Found', queued.length, 'jobs to cancel\n');

for (const job of queued) {
  await db
    .update(jobs)
    .set({
      status: 'failed',
      error: 'Canceled by user',
      progress: 0,
    })
    .where(eq(jobs.id, job.id));
}

console.log('✅ All queued jobs canceled');
console.log('Active jobs count should now be 0');
