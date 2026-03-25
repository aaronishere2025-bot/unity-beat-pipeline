import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

console.log('Stopping processing jobs...\n');

const processing = await db.select().from(jobs).where(eq(jobs.status, 'processing'));

console.log('Found', processing.length, 'jobs to stop\n');

for (const job of processing) {
  console.log('Stopping:', job.scriptName || job.id);
  await db
    .update(jobs)
    .set({
      status: 'failed',
      error: 'Stopped by user',
    })
    .where(eq(jobs.id, job.id));
}

console.log('\n✅ All processing jobs stopped');
