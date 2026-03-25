#!/usr/bin/env tsx
/**
 * Test 45-minute lofi with multi-clip visual variety
 */

import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function test45MinMultiClip() {
  console.log('🧪 TESTING 45-MINUTE LOFI WITH MULTI-CLIP VARIETY\n');

  // Create job with proper scriptContent format for 45 minutes
  const [job] = await db
    .insert(jobs)
    .values({
      mode: 'music',
      scriptName: '45-Min Lofi Multi-Clip Test',
      scriptContent: 'lofi, 75 BPM, chill vibes, study music, target 45:00 length',
      prompts: ['lofi aesthetic'],
      status: 'queued',
      progress: 0,
      aspectRatio: '16:9',
      clipDuration: 5,
      autoUpload: false,
    })
    .returning();

  console.log(`✅ Job created: ${job.id}`);
  console.log(`   Duration: 45 minutes`);
  console.log(`   Expected: 15 songs (~3 min each)`);
  console.log(`   Expected clips: ${Math.ceil(2700 / 270)} different Kling videos\n`);

  console.log('📊 MONITOR:');
  console.log(`   curl http://localhost:8080/api/jobs/${job.id}\n`);

  console.log('🔍 VERIFY:');
  console.log('   1. Should generate 15 songs');
  console.log('   2. Total audio: ~45 minutes');
  console.log('   3. Should see "MULTI-CLIP GENERATION FOR LONG VIDEO"');
  console.log('   4. Should generate 10 different Kling clips');
  console.log('   5. Progress should never exceed 100%\n');

  // Monitor
  let lastStatus = '';
  let lastProgress = 0;

  console.log('⏳ Monitoring...\n');

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 30000)); // Check every 30s

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));

    if (updated.status !== lastStatus || updated.progress !== lastProgress) {
      console.log(`[${new Date().toLocaleTimeString()}] ${updated.status.padEnd(12)} | ${updated.progress}%`);
      lastStatus = updated.status;
      lastProgress = updated.progress;
    }

    if (updated.status === 'completed') {
      console.log('\n✅ COMPLETED!\n');
      console.log(`   Video: ${updated.videoPath || '❌'}`);
      console.log(`   Duration: ${updated.duration}s (${(updated.duration / 60).toFixed(1)} min)`);
      console.log(`   Cost: $${updated.cost}\n`);

      if (updated.videoPath) {
        console.log('📹 Verify multi-clip:');
        console.log(`   grep "MULTI-CLIP\\|different clips" /tmp/server-with-variety.log | grep ${job.id} -A 10`);
      }
      break;
    }

    if (updated.status === 'failed') {
      console.log(`\n❌ FAILED: ${updated.error || 'Unknown'}\n`);
      break;
    }
  }
}

test45MinMultiClip().catch(console.error);
