#!/usr/bin/env tsx
/**
 * Test Music Mode with vibrant Kling backgrounds
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';

async function testVibrantMusic() {
  console.log('🎵 Testing Music Mode with Kling AI backgrounds\n');

  // Generate a lofi beat for testing
  const beat = {
    title: 'Vibrant Lofi Test',
    bpm: 85,
    genre: 'lofi',
    styleDescription: 'lofi, 85 BPM, jazzy chords, vinyl crackle, chill vibes',
    targetDuration: 90, // Short for testing
  };

  console.log(`🎵 Generating: ${beat.title} (${beat.bpm} BPM)`);
  console.log(`   Style: ${beat.styleDescription}\n`);

  try {
    // Generate with Suno
    const sunoResult = await sunoApi.generateSong({
      lyrics: '',
      style: beat.styleDescription,
      title: beat.title,
      instrumental: true,
      model: 'V5',
      targetDuration: beat.targetDuration,
    });

    console.log(`   Task: ${sunoResult.taskId}`);
    const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 300000);

    if (!tracks || tracks.length === 0) {
      console.error(`   ❌ Suno generation failed\n`);
      process.exit(1);
    }

    const track = tracks[0];
    console.log(`   ✅ Audio ready: ${track.duration}s\n`);

    // Download audio
    const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `vibrant_test_${Date.now()}.mp3`);
    const axios = (await import('axios')).default;
    const fs = await import('fs');
    const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, response.data);

    // Create job
    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '9:16',
      scriptName: beat.title,
      scriptContent: '',
      musicUrl: `/audio/${track.id}.mp3`,
      audioDuration: Math.floor(track.duration).toString(),
    });

    console.log(`   Job: ${job.id}\n`);

    // Generate video with Kling backgrounds
    console.log('🎬 Generating video with vibrant Kling AI backgrounds...\n');
    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: audioPath,
        audioDuration: track.duration,
        instrumental: true,
      },
      '9:16',
      (percent, message) => {
        console.log(`   [${percent}%] ${message}`);
      },
    );

    console.log(`\n✅ Complete!`);
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Theme: ${result.theme}`);
    console.log(`   Time: ${(result.metadata.processingTimeMs / 1000).toFixed(1)}s`);
    console.log(`   Cost: $0.20 (Suno $0.10 + Kling $0.10)\n`);

    // Update job
    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
      cost: '0.20',
      duration: Math.floor(track.duration),
      progress: 100,
      completedAt: new Date(),
    });

    console.log(`🌐 View at: http://localhost:8080/view-videos.html\n`);
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}\n`);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

testVibrantMusic();
