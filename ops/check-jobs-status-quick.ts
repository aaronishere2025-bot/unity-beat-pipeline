import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, eq } from 'drizzle-orm';

const recentJobs = await db
  .select({
    id: jobs.id,
    scriptName: jobs.scriptName,
    status: jobs.status,
    mode: jobs.mode,
    createdAt: jobs.createdAt,
    updatedAt: jobs.updatedAt,
    error: jobs.error,
  })
  .from(jobs)
  .orderBy(desc(jobs.createdAt))
  .limit(10);

console.log('=== RECENT JOBS ===\n');
recentJobs.forEach((job) => {
  console.log(`ID: ${job.id.substring(0, 8)}...`);
  console.log(`Name: ${job.scriptName}`);
  console.log(`Status: ${job.status}`);
  console.log(`Mode: ${job.mode}`);
  console.log(`Created: ${job.createdAt}`);
  console.log(`Updated: ${job.updatedAt}`);
  if (job.error) console.log(`Error: ${job.error.substring(0, 200)}`);
  console.log('---\n');
});

// Check for stuck processing jobs
const processingJobs = await db.select().from(jobs).where(eq(jobs.status, 'processing')).orderBy(desc(jobs.updatedAt));

console.log(`\n=== PROCESSING JOBS (${processingJobs.length}) ===\n`);
processingJobs.forEach((job) => {
  const timeSinceUpdate = Date.now() - new Date(job.updatedAt).getTime();
  const minutesSinceUpdate = Math.floor(timeSinceUpdate / 1000 / 60);
  console.log(`${job.id.substring(0, 8)} - ${job.scriptName}`);
  console.log(`  Last updated: ${minutesSinceUpdate} minutes ago`);
  console.log(`  Mode: ${job.mode}`);
});
