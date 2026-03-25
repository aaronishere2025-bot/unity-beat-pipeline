#!/usr/bin/env tsx
/**
 * Fix the Trap beat job that has video but status=failed
 */

import { storage } from './server/storage';

async function fixJob() {
  const jobId = '4137ba52-b083-49f6-9537-f0ada2103f10';
  const videoUrl = '/api/videos/music_4137ba52-b083-49f6-9537-f0ada2103f10_1768184921642.mp4';

  console.log(`🔧 Fixing job ${jobId}...`);

  try {
    await storage.updateJob(jobId, {
      status: 'completed',
      videoUrl: videoUrl,
      thumbnailUrl: `/api/thumbnails/${jobId}_thumbnail.jpg`,
      progress: 100,
      completedAt: new Date(),
    });

    console.log(`✅ Job updated successfully!`);
    console.log(`   Status: completed`);
    console.log(`   Video URL: ${videoUrl}`);
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
  }

  process.exit(0);
}

fixJob();
