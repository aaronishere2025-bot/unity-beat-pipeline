import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc } from 'drizzle-orm';

const latestJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(3);

for (const job of latestJobs) {
  console.log('\n─'.repeat(40));
  console.log(`Job: ${job.scriptName}`);
  console.log(`ID: ${job.id}`);
  console.log(`Status: ${job.status}`);
  console.log(`Progress: ${job.progress}%`);
  console.log(`Error: ${job.error || 'none'}`);
  console.log(`Created: ${job.createdAt}`);
  console.log(`Updated: ${job.updatedAt}`);
  console.log(`Retry: ${job.retryCount}/${job.maxRetries}`);
}
