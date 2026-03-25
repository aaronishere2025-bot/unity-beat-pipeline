#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const jobId = 'ce7c5da5-7bd5-41d3-9f8f-41e96e377f9a';

const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

if (job) {
  console.log('\n📊 Job Status Report:');
  console.log('='.repeat(60));
  console.log(`ID: ${job.id}`);
  console.log(`Name: ${job.scriptName}`);
  console.log(`Status: ${job.status}`);
  console.log(`Progress: ${job.progress}%`);
  console.log(`Audio Duration: ${job.audioDuration}s`);
  console.log(`Error: ${job.errorMessage || 'None'}`);
  console.log('='.repeat(60));

  if (job.status === 'completed' && job.audioDuration) {
    const targetDuration = 180; // 3 minutes
    const actualDuration = job.audioDuration;
    const diff = Math.abs(actualDuration - targetDuration);
    const percentOff = ((diff / targetDuration) * 100).toFixed(1);

    console.log('\n🎯 Duration Analysis:');
    console.log(`  Target: ${targetDuration}s (3:00)`);
    console.log(
      `  Actual: ${actualDuration}s (${Math.floor(actualDuration / 60)}:${String(Math.floor(actualDuration % 60)).padStart(2, '0')})`,
    );
    console.log(`  Difference: ${diff.toFixed(1)}s (${percentOff}% off)`);

    if (diff < 10) {
      console.log(`  ✅ EXCELLENT - Within 10 seconds!`);
    } else if (diff < 30) {
      console.log(`  ✅ GOOD - Within 30 seconds`);
    } else if (diff < 60) {
      console.log(`  ⚠️  ACCEPTABLE - Within 1 minute`);
    } else {
      console.log(`  ❌ POOR - More than 1 minute off`);
      console.log(`  ⚠️  May need to adjust duration hint strategy`);
    }
  }
} else {
  console.log('Job not found');
}
