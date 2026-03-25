import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, or } from 'drizzle-orm';

console.log('Permanently canceling all active jobs...\n');

const active = await db
  .select()
  .from(jobs)
  .where(or(eq(jobs.status, 'queued'), eq(jobs.status, 'processing')));

console.log('Found', active.length, 'jobs to permanently cancel\n');

for (const job of active) {
  await db
    .update(jobs)
    .set({
      status: 'failed',
      error: 'Canceled by user',
      retryCount: 999, // Prevent auto-retry
      maxRetries: 3,
      progress: 0,
    })
    .where(eq(jobs.id, job.id));
}

console.log('✅ All jobs permanently canceled (no auto-retry)');
