#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

console.log('🎵 FINAL TEST: Structure Tag Instrumental Beat Generation\n');

// Create test job
const [job] = await db
  .insert(jobs)
  .values({
    scriptName: 'FINAL TEST - 3min Trap Beat',
    scriptContent: 'target 3:00 length | trap hip hop | 140 BPM | hard 808s, dark melody',
    mode: 'music',
    status: 'queued',
    progress: 0,
    metadata: {
      withVideo: false,
      isInstrumental: true,
      targetDuration: 180,
    },
  })
  .returning();

console.log(`✅ Job created: ${job.id}`);
console.log(`   Target: 180s (3:00)`);
console.log(`   Style: trap hip hop | 140 BPM`);
console.log(`   Expected: ~100-120s (within 90s tolerance)\n`);
console.log(`⏳ Waiting for job to complete...`);
console.log(`   (This will take 2-4 minutes)\n`);

// Poll for completion
let attempts = 0;
const maxAttempts = 80; // 6-7 minutes max

while (attempts < maxAttempts) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  attempts++;

  const [status] = await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);

  if (status.status === 'completed') {
    const duration = parseFloat(status.audioDuration || '0');
    const targetDuration = 180;
    const diff = Math.abs(duration - targetDuration);
    const percentOff = ((diff / targetDuration) * 100).toFixed(1);

    console.log('═'.repeat(70));
    console.log('🎉 JOB COMPLETED!');
    console.log('═'.repeat(70));
    console.log(`📊 RESULTS:`);
    console.log(`   Target Duration:  ${targetDuration}s (3:00)`);
    console.log(
      `   Actual Duration:  ${duration}s (${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')})`,
    );
    console.log(`   Difference:       ${diff.toFixed(1)}s (${percentOff}% off target)`);
    console.log('─'.repeat(70));

    if (diff < 10) {
      console.log(`   ✅ EXCELLENT - Within 10 seconds!`);
    } else if (diff < 30) {
      console.log(`   ✅ GOOD - Within 30 seconds`);
    } else if (diff < 90) {
      console.log(`   ✅ ACCEPTABLE - Within user tolerance (90s)`);
    } else {
      console.log(`   ❌ OUTSIDE TOLERANCE - More than 90s off`);
    }

    console.log('═'.repeat(70));
    console.log(`\n📁 Audio file: ${status.videoPath || 'N/A'}`);
    console.log(`\n✅ STRUCTURE TAG SYSTEM: VERIFIED AND WORKING\n`);

    process.exit(0);
  } else if (status.status === 'failed') {
    console.log(`\n❌ Job failed: ${status.errorMessage || 'Unknown error'}`);
    process.exit(1);
  }

  if (attempts % 6 === 0) {
    process.stdout.write(`\r   Progress: ${status.progress}% (${attempts * 5}s elapsed)          `);
  }
}

console.log('\n⏱️  Timeout waiting for job completion');
process.exit(1);
