#!/usr/bin/env tsx
/**
 * Test multi-clip visual variety for long lofi videos
 *
 * Generate a 15-minute lofi to verify:
 * 1. Multiple different Kling clips are generated (not just 1)
 * 2. Each clip has a different visual prompt
 * 3. All clips are concatenated properly
 */

import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function testMultiClipVariety() {
  console.log('🧪 TESTING MULTI-CLIP VISUAL VARIETY\n');
  console.log('Creating 15-minute lofi test job...\n');

  // Create test job
  const [job] = await db
    .insert(jobs)
    .values({
      mode: 'music',
      scriptName: '15-Min Lofi Multi-Clip Test',
      scriptContent: 'Testing visual variety for long videos',
      prompts: ['lofi aesthetic'],
      status: 'queued',
      progress: 0,
      aspectRatio: '16:9',
      clipDuration: 5,
      autoUpload: false,
      instrumental: true,
      targetDuration: 900, // 15 minutes
      beatStyle: 'lofi, 75 BPM, chill vibes, study music',
      songCount: 6, // ~2.5 minutes per song
    })
    .returning();

  console.log(`✅ Job created: ${job.id}`);
  console.log(`   Duration: 15 minutes`);
  console.log(`   Expected clips: ${Math.ceil(900 / 270)} different Kling videos\n`);

  console.log('📊 MONITOR THE JOB:');
  console.log(`   curl http://localhost:8080/api/jobs/${job.id}\n`);

  console.log('🔍 WHAT TO VERIFY:');
  console.log('   1. Console should show "MULTI-CLIP GENERATION FOR LONG VIDEO"');
  console.log('   2. Should generate 4 different clips (not just 1)');
  console.log('   3. Each clip should have a different visual theme');
  console.log('   4. Total loops: ~180 (4 clips × 45 loops each)');
  console.log('   5. Final video should be exactly 15 minutes\n');

  // Monitor job
  let lastStatus = '';
  let lastProgress = 0;

  console.log('⏳ Monitoring job progress...\n');

  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 10000)); // Check every 10 seconds

    const [updated] = await db.select().from(jobs).where(eq(jobs.id, job.id));

    if (updated.status !== lastStatus || updated.progress !== lastProgress) {
      console.log(
        `[${new Date().toLocaleTimeString()}] Status: ${updated.status.padEnd(12)} | Progress: ${updated.progress}%`,
      );
      lastStatus = updated.status;
      lastProgress = updated.progress;
    }

    if (updated.status === 'completed') {
      console.log('\n✅ JOB COMPLETED SUCCESSFULLY!\n');
      console.log('📊 RESULTS:');
      console.log(`   Video Path: ${updated.videoPath || '❌ NOT SET'}`);
      console.log(`   Duration: ${updated.duration}s`);
      console.log(`   Cost: $${updated.cost}`);

      if (updated.videoPath) {
        console.log('\n🎬 CHECK THE VIDEO:');
        console.log(`   ls -lh "${updated.videoPath}"`);
        console.log(`   ffprobe -v error -show_entries format=duration "${updated.videoPath}"`);
      }

      break;
    }

    if (updated.status === 'failed') {
      console.log('\n❌ JOB FAILED\n');
      console.log(`   Error: ${updated.error || 'Unknown error'}`);
      break;
    }
  }
}

testMultiClipVariety().catch(console.error);
