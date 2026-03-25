import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const queued = await db.select().from(jobs).where(eq(jobs.status, 'queued'));
console.log('Deleting', queued.length, 'queued jobs...');

for (const job of queued) {
  await db.delete(jobs).where(eq(jobs.id, job.id));
}

console.log('✅ All queued jobs deleted');
