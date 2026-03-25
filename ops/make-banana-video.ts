#!/usr/bin/env tsx
/**
 * Create neon banana video using the existing Kling clip
 */

import { storage } from './server/storage';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

async function makeBananaVideo() {
  console.log('🍌 CREATING NEON BANANA VIDEO FROM EXISTING CLIP\n');

  const bananaClip = 'data/videos/clips/kling_1768194883780_gdl6pa.mp4';
  const audioFile = join(process.cwd(), 'data', 'temp', 'processing', 'nano_banana_2_1768194842763.mp3'); // Trap beat we already have
  const tempDir = join(process.cwd(), 'data', 'temp', 'processing');

  try {
    console.log('📹 Using existing Kling clip:');
    console.log(`   ${bananaClip}`);
    console.log('   Theme: Bioluminescent banana peel explosion\n');

    // Get audio duration
    const { stdout: durationStr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioFile}"`,
    );
    const audioDuration = parseFloat(durationStr.trim());
    console.log(`🎵 Audio duration: ${audioDuration.toFixed(1)}s`);

    // Get clip duration
    const { stdout: clipDurationStr } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${bananaClip}"`,
    );
    const clipDuration = parseFloat(clipDurationStr.trim());
    console.log(`🎬 Clip duration: ${clipDuration.toFixed(1)}s`);

    // Calculate loops needed
    const loopCount = Math.ceil(audioDuration / clipDuration);
    console.log(`🔄 Will loop ${loopCount} times\n`);

    // Step 1: Loop the banana clip
    console.log('🔄 [1/3] Looping neon banana clip...');
    const loopedPath = join(tempDir, `banana_looped_${Date.now()}.mp4`);
    await execAsync(
      `ffmpeg -stream_loop ${loopCount - 1} -i "${bananaClip}" ` +
        `-t ${audioDuration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
        `"${loopedPath}" -y`,
      { timeout: 120000 },
    );
    console.log(`   ✅ Looped to ${audioDuration.toFixed(1)}s`);

    // Step 2: Combine with audio
    console.log('\n🎵 [2/3] Combining with trap beat audio...');

    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '9:16',
      scriptName: 'Neon Banana Explosion - Trap Beat',
      scriptContent: '',
      audioDuration: Math.floor(audioDuration).toString(),
    });

    const finalPath = join(process.cwd(), 'data/videos/renders', `music_${job.id}_${Date.now()}.mp4`);

    await execAsync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

    await execAsync(
      `ffmpeg -i "${loopedPath}" -i "${audioFile}" ` +
        `-map 0:v:0 -map 1:a:0 ` +
        `-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p ` +
        `-c:a aac -b:a 192k ` +
        `-t ${audioDuration} -shortest ` +
        `"${finalPath}" -y`,
      { timeout: 300000 },
    );

    console.log(`   ✅ Video created: ${finalPath.split('/').pop()}`);

    // Step 3: Generate thumbnail
    console.log('\n🖼️  [3/3] Generating thumbnail...');
    const thumbnailPath = join(process.cwd(), 'data/thumbnails', `${job.id}_thumbnail.jpg`);

    await execAsync(`mkdir -p ${join(process.cwd(), 'data/thumbnails')}`);
    await execAsync(
      `ffmpeg -i "${finalPath}" -ss 00:00:02 -vframes 1 ` +
        `-vf "scale=1920:1080:force_original_aspect_ratio=decrease" ` +
        `"${thumbnailPath}" -y`,
      { timeout: 30000 },
    );

    console.log(`   ✅ Thumbnail: ${thumbnailPath.split('/').pop()}`);

    // Update job
    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${finalPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${thumbnailPath.split('/').pop()}`,
      cost: '0.20',
      duration: Math.floor(audioDuration),
      progress: 100,
      completedAt: new Date(),
    });

    console.log('\n🍌✅ NEON BANANA VIDEO COMPLETE!');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Video: ${finalPath}`);
    console.log(`   Duration: ${audioDuration.toFixed(1)}s`);
    console.log(`   Visual: Bioluminescent banana peel explosion with electric energy`);
    console.log(`   Audio: Trap beat (145 BPM, heavy 808 bass)`);
    console.log(`\n📺 View at: http://localhost:5000\n`);
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

makeBananaVideo().catch(console.error);
