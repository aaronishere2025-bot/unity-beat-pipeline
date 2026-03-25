#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function testStructureTags() {
  console.log('🧪 Creating structure tag test job directly in database...\n');

  // Create job directly in database
  const [job] = await db
    .insert(jobs)
    .values({
      scriptName: 'STRUCTURE TAG TEST - 3min Trap',
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
  console.log(`   Mode: music (instrumental)`);
  console.log(`   Style: trap hip hop | 140 BPM\n`);
  console.log(`   Waiting for job-worker to process...`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 5s poll interval
    attempts++;

    const [status] = await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);

    if (status.status === 'completed') {
      const duration = parseFloat(status.audioDuration || '0');
      const targetDuration = 180;
      const diff = Math.abs(duration - targetDuration);
      const percentOff = ((diff / targetDuration) * 100).toFixed(1);

      console.log('\n✅ JOB COMPLETED!\n');
      console.log('📊 RESULTS:');
      console.log('='.repeat(60));
      console.log(`   Target: ${targetDuration}s (3:00)`);
      console.log(
        `   Actual: ${duration}s (${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')})`,
      );
      console.log(`   Difference: ${diff.toFixed(1)}s (${percentOff}% off)`);
      console.log('='.repeat(60));

      if (diff < 10) {
        console.log(`   ✅ EXCELLENT - Within 10 seconds!`);
      } else if (diff < 30) {
        console.log(`   ✅ GOOD - Within 30 seconds`);
      } else if (diff < 90) {
        console.log(`   ✅ ACCEPTABLE - Within user tolerance (90s)`);
      } else {
        console.log(`   ❌ FAILED - Outside 90s tolerance`);
        console.log(`   ⚠️  Structure tags may need adjustment`);
      }

      process.exit(0);
    } else if (status.status === 'failed') {
      console.log(`\n❌ Job failed: ${status.errorMessage || 'Unknown error'}`);
      process.exit(1);
    }

    process.stdout.write(`\r   Waiting... (${status.progress}% complete, ${attempts * 5}s elapsed)`);
  }

  console.log('\n⏱️  Timeout waiting for job completion');
  process.exit(1);
}

testStructureTags().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
