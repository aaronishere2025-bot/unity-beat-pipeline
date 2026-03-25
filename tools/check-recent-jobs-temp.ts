import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc } from 'drizzle-orm';

async function main() {
  const recentJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      mode: jobs.mode,
      error: jobs.error,
      createdAt: jobs.createdAt,
      completedClips: jobs.completedClips,
      topic: jobs.topic,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(3);

  for (const job of recentJobs) {
    console.log(`\nJob ID: ${job.id}`);
    console.log(`Status: ${job.status}`);
    console.log(`Mode: ${job.mode}`);
    console.log(`Topic: ${job.topic || 'N/A'}`);
    console.log(`Created: ${job.createdAt}`);
    console.log(`Completed Clips: ${job.completedClips?.length || 0}`);
    console.log(`Error: ${job.error || 'None'}`);
  }

  process.exit(0);
}

main().catch(console.error);
