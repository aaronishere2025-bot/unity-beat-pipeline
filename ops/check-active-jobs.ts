import { db } from './server/db';
import { jobs } from './shared/schema';
import { desc, eq, or } from 'drizzle-orm';

async function checkJobs() {
  const activeJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      scriptName: jobs.scriptName,
      mode: jobs.mode,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(or(eq(jobs.status, 'queued'), eq(jobs.status, 'processing')))
    .orderBy(desc(jobs.createdAt));

  console.log(`\n🔄 Active Jobs (queued/processing): ${activeJobs.length}\n`);
  if (activeJobs.length > 0) {
    for (const job of activeJobs) {
      console.log(`  ${job.id.substring(0, 8)} | ${job.status?.padEnd(12)} | ${job.scriptName || 'Untitled'}`);
    }
  } else {
    console.log('  No active jobs found');
  }

  const recentJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      scriptName: jobs.scriptName,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(15);

  console.log('\n📋 Recent Jobs (last 15):\n');
  for (const job of recentJobs) {
    const time = new Date(job.createdAt).toLocaleTimeString();
    const icon = job.status === 'completed' ? '✅' : job.status === 'failed' ? '❌' : '⏳';
    console.log(
      `  ${icon} ${job.id.substring(0, 8)} | ${job.status?.padEnd(12)} | ${time} | ${job.scriptName?.substring(0, 40) || 'Untitled'}`,
    );
  }
}

checkJobs().catch(console.error);
