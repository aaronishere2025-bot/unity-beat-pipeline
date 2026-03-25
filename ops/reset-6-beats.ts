#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, inArray } from 'drizzle-orm';

const JOB_IDS = [
  'e7dce8ca-f480-4226-98c7-62b110d2f9e3', // Midnight Study Lounge
  '288f9aeb-7e70-4a08-a9e2-e3f4b0c40117', // Coffee Shop Rain
  'c45227f5-eeb4-4d82-b47d-a0a0e8aaa546', // City Nights Chill
  'c181ce88-0288-46a6-96b0-4bcddc2884f0', // Beast Mode
  'd51a61fc-a87e-4db8-a5d8-09cd1cf862fd', // Money Moves
  'b03adfb4-0e06-4945-90b5-57a2db6a63cc', // Nightfall Dreams
];

async function resetJobs() {
  console.log('\n🔄 Resetting 6 failed jobs to queued status...\n');

  const result = await db
    .update(jobs)
    .set({
      status: 'queued',
      progress: 0,
      error: null,
      retryCount: 0,
    })
    .where(inArray(jobs.id, JOB_IDS));

  console.log(`✅ Reset ${JOB_IDS.length} jobs to queued status`);
  console.log('\n📋 Jobs will be automatically processed by the server:');

  const jobList = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      status: jobs.status,
    })
    .from(jobs)
    .where(inArray(jobs.id, JOB_IDS));

  jobList.forEach((job, i) => {
    console.log(`   ${i + 1}. ${job.scriptName} → ${job.status}`);
  });

  console.log('\n⏳ Monitor progress at: http://localhost:8080\n');

  process.exit(0);
}

resetJobs().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
