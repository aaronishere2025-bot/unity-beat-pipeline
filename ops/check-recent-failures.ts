import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, desc } from 'drizzle-orm';

const failedJobs = await db.select().from(jobs).where(eq(jobs.status, 'failed')).orderBy(desc(jobs.createdAt)).limit(5);

console.log('Recent Failed Jobs:\n');
failedJobs.forEach((job) => {
  console.log('==========');
  console.log('ID:', job.id);
  console.log('Name:', job.scriptName);
  console.log('Status:', job.status);
  console.log('Mode:', job.mode);
  console.log('Progress:', job.progress);
  console.log('Cost: $' + (job.cost || 0).toFixed(2));
  console.log('Error:', job.error || 'No error message');
  console.log('Created:', job.createdAt);
  console.log('');
});
