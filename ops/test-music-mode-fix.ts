/**
 * Test Music Mode fix - Reset failed job and verify it can generate music from scriptContent
 */

import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  console.log('\n🧪 Testing Music Mode Fix\n');
  console.log('━'.repeat(80));

  // Find a recent failed music job
  const failedJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, 'failed'))
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  if (failedJobs.length === 0) {
    console.log('❌ No failed jobs found to test with');
    process.exit(1);
  }

  const job = failedJobs[0];
  console.log(`\n📋 Found failed job: ${job.scriptName}`);
  console.log(`   ID: ${job.id}`);
  console.log(`   Script Content: ${job.scriptContent?.substring(0, 80)}...`);
  console.log(`   Mode: ${job.mode}`);

  // Reset to queued
  await db
    .update(jobs)
    .set({
      status: 'queued',
      progress: 0,
      retryCount: 0,
      error: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));

  console.log('\n✅ Reset job to "queued" status');
  console.log('   The job worker should pick it up automatically');
  console.log('\n📊 Monitor progress:');
  console.log(`   curl -s http://localhost:8080/api/jobs/${job.id} | jq '.status, .progress, .error'`);
  console.log('\n━'.repeat(80));

  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
