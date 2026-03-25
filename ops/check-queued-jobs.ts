import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, desc } from 'drizzle-orm';

const queued = await db.select().from(jobs).where(eq(jobs.status, 'queued')).orderBy(desc(jobs.createdAt)).limit(10);

console.log('Sample of queued jobs (showing 10 of 95):\n');

queued.forEach((job) => {
  console.log('-', job.scriptName || 'Untitled');
  console.log('  Mode:', job.mode);
  console.log('  Retries:', job.retryCount || 0, '/', job.maxRetries || 3);
  console.log('  Created:', new Date(job.createdAt || Date.now()).toLocaleString());
  console.log('');
});

console.log('These 95 jobs are waiting for the job worker to process them.');
console.log('Do you want to:');
console.log('  1. Let them process (will take hours with Suno/Kling)');
console.log('  2. Cancel them all (mark as failed)');
