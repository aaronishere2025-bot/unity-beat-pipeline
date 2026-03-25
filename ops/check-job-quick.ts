import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const jobId = '01dcc81d-0555-49d6-b4b6-f2ac288cd5b2';
const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

if (job.length > 0) {
  const j = job[0];
  console.log('Job Status:', j.status);
  console.log('Progress:', j.progress);
  console.log('Error:', j.error);
  console.log('Retry Count:', j.retryCount);
  console.log('Created:', j.createdAt);
  console.log('Updated:', j.updatedAt);
  console.log('Script Content:', j.scriptContent?.substring(0, 100) + '...');
} else {
  console.log('Job not found');
}
