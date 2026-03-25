import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, eq } from 'drizzle-orm';

const failedJobs = await db
  .select()
  .from(jobs)
  .where(eq(jobs.status, 'failed'))
  .orderBy(desc(jobs.createdAt))
  .limit(10);

console.log('Failed Jobs:', failedJobs.length);
failedJobs.forEach((job) => {
  console.log('  -', job.scriptName || 'Untitled', '(' + job.progress + '%)');
});

const queuedJobs = await db.select().from(jobs).where(eq(jobs.status, 'queued')).orderBy(desc(jobs.createdAt));

console.log('\nQueued:', queuedJobs.length);

const completedJobs = await db
  .select()
  .from(jobs)
  .where(eq(jobs.status, 'completed'))
  .orderBy(desc(jobs.completedAt))
  .limit(5);

console.log('\nCompleted (last 5):');
completedJobs.forEach((job) => {
  console.log('  -', job.scriptName || 'Untitled');
});
