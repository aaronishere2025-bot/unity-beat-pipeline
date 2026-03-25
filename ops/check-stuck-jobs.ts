import { db } from './server/db';
import { jobs } from './shared/schema';
import { or, sql } from 'drizzle-orm';

async function checkStuckJobs() {
  const jobIds = ['13f8da7f', '772612e0', '1efa0a2b'];

  // Find jobs that start with these IDs
  const foundJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      mode: jobs.mode,
      error: jobs.error,
      scriptName: jobs.scriptName,
      progress: jobs.progress,
      totalCost: jobs.totalCost,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(
      or(
        sql`${jobs.id}::text LIKE '13f8da7f%'`,
        sql`${jobs.id}::text LIKE '772612e0%'`,
        sql`${jobs.id}::text LIKE '1efa0a2b%'`,
      ),
    )
    .orderBy(jobs.createdAt);

  console.log('\n📋 Found', foundJobs.length, 'jobs:\n');
  for (const job of foundJobs) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ID:', job.id);
    console.log('Script:', job.scriptName);
    console.log('Status:', job.status);
    console.log('Progress:', job.progress + '%');
    console.log('Cost:', '$' + (job.totalCost || 0));
    console.log('Mode:', job.mode);
    console.log('Created:', new Date(job.createdAt).toLocaleString());
    if (job.error) {
      console.log('Error:', job.error.substring(0, 300) + (job.error.length > 300 ? '...' : ''));
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

checkStuckJobs();
