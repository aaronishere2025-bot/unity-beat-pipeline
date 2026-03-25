#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { inArray, sql } from 'drizzle-orm';

async function main() {
  const jobIdsArg = process.argv[2];

  if (!jobIdsArg) {
    console.log('Usage: npx tsx check-test-completion.ts "job1,job2,job3"');
    process.exit(1);
  }

  const jobIds = jobIdsArg.split(',');

  console.log('⏱️  Checking Speed Test Progress\n');
  console.log('═'.repeat(70));

  const jobRecords = await db.select().from(jobs).where(inArray(jobs.id, jobIds));

  if (jobRecords.length === 0) {
    console.log('❌ No jobs found with those IDs');
    return;
  }

  const completed = jobRecords.filter((j) => j.status === 'completed');
  const processing = jobRecords.filter((j) => j.status === 'processing');
  const queued = jobRecords.filter((j) => j.status === 'queued');
  const failed = jobRecords.filter((j) => j.status === 'failed');

  console.log(`📊 Status: ${completed.length}/${jobRecords.length} completed\n`);

  // Calculate timing stats for completed jobs
  if (completed.length > 0) {
    const timings = completed.map((j) => {
      const start = j.createdAt ? new Date(j.createdAt).getTime() : 0;
      const end = j.completedAt ? new Date(j.completedAt).getTime() : Date.now();
      const duration = (end - start) / 1000;
      return {
        name: j.scriptName,
        duration: duration.toFixed(1),
        status: j.status,
      };
    });

    console.log('✅ Completed Jobs:');
    console.table(timings);

    const avgTime = timings.reduce((sum, t) => sum + parseFloat(t.duration), 0) / timings.length;
    const minTime = Math.min(...timings.map((t) => parseFloat(t.duration)));
    const maxTime = Math.max(...timings.map((t) => parseFloat(t.duration)));

    console.log(`\n📈 Timing Stats:`);
    console.log(`   Average: ${avgTime.toFixed(1)}s per job`);
    console.log(`   Fastest: ${minTime.toFixed(1)}s`);
    console.log(`   Slowest: ${maxTime.toFixed(1)}s`);
  }

  if (processing.length > 0) {
    console.log(`\n🔄 Processing (${processing.length}):`);
    processing.forEach((j) => {
      console.log(`   • ${j.scriptName}: ${j.progress}%`);
    });
  }

  if (queued.length > 0) {
    console.log(`\n⏳ Queued (${queued.length}):`);
    queued.forEach((j) => {
      console.log(`   • ${j.scriptName}`);
    });
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed (${failed.length}):`);
    failed.forEach((j) => {
      console.log(`   • ${j.scriptName}: ${j.error?.substring(0, 100)}`);
    });
  }

  // Overall test timing
  if (completed.length === jobRecords.length) {
    const allStartTimes = jobRecords.map((j) => (j.createdAt ? new Date(j.createdAt).getTime() : 0));
    const allEndTimes = completed.map((j) => (j.completedAt ? new Date(j.completedAt).getTime() : Date.now()));

    const testStart = Math.min(...allStartTimes);
    const testEnd = Math.max(...allEndTimes);
    const totalTime = ((testEnd - testStart) / 1000 / 60).toFixed(2);

    console.log('\n' + '═'.repeat(70));
    console.log(`🎉 ALL JOBS COMPLETE!`);
    console.log(`   Total test time: ${totalTime} minutes`);
    console.log(`   Jobs completed: ${completed.length}`);
    console.log(
      `   Parallel efficiency: ${(((completed.length * parseFloat(timings[0].duration)) / (parseFloat(totalTime) * 60)) * 100).toFixed(0)}%`,
    );
    console.log('═'.repeat(70));
  } else {
    console.log(`\n⏳ Still running... ${completed.length}/${jobRecords.length} done`);
    console.log('   Run this command again to check progress');
  }
}

main().catch(console.error);
