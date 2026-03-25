#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc } from 'drizzle-orm';

async function checkStatus() {
  console.log('\n📊 Checking status of 6 most recent jobs...\n');

  const recentJobs = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      status: jobs.status,
      progress: jobs.progress,
      mode: jobs.mode,
      error: jobs.error,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(6);

  recentJobs.forEach((job, i) => {
    const emoji =
      job.status === 'completed' ? '✅' : job.status === 'processing' ? '⏳' : job.status === 'failed' ? '❌' : '📋';

    console.log(`${emoji} ${i + 1}. ${job.scriptName}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Progress: ${job.progress}%`);
    console.log(`   Mode: ${job.mode}`);
    if (job.error) {
      console.log(`   Error: ${job.error.substring(0, 100)}...`);
    }
    console.log('');
  });

  const statusCounts = recentJobs.reduce(
    (acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('📈 Status Summary:');
  Object.entries(statusCounts).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });

  process.exit(0);
}

checkStatus().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
