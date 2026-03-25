import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, eq } from 'drizzle-orm';

async function checkRecentJobs() {
  // Get all recent jobs
  const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(5);

  console.log('=== RECENT JOBS ===\n');
  recentJobs.forEach((job) => {
    console.log(`ID: ${job.id.substring(0, 8)}...`);
    console.log(`Name: ${job.scriptName}`);
    console.log(`Status: ${job.status}`);
    console.log(`Mode: ${job.mode}`);
    console.log(`Progress: ${job.progress}%`);
    if (job.error) {
      console.log(`Error: ${job.error.substring(0, 300)}...`);
    }
    console.log('---\n');
  });

  // Focus on failed jobs
  const failedJobs = recentJobs.filter((j) => j.status === 'failed');
  if (failedJobs.length > 0) {
    console.log('\n=== FAILED JOB DETAILS ===\n');
    failedJobs.forEach((job) => {
      console.log(`Job: ${job.scriptName} (${job.id})`);
      console.log(`Progress at failure: ${job.progress}%`);
      console.log(`Full Error:\n${job.error}\n`);
    });
  }
}

checkRecentJobs().catch(console.error);
