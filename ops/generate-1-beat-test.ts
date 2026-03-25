#!/usr/bin/env tsx
/**
 * Generate 1 beat for testing
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';

async function generate1Beat() {
  console.log('🎵 GENERATING 1 TEST BEAT\n');

  const beat = {
    title: 'Lofi Chill Beat - Night Study',
    bpm: 85,
    genre: 'lofi',
    styleDescription:
      'lofi hip-hop, chill study beats, 85 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, dreamy atmospheric peaceful',
    targetDuration: 60,
  };

  try {
    // Step 1: Generate Suno beat
    console.log(`🎵 [1/3] Generating Suno beat...`);
    const sunoResult = await sunoApi.generateSong({
      lyrics: '',
      style: beat.styleDescription,
      title: beat.title,
      instrumental: true,
      model: 'V5',
      targetDuration: beat.targetDuration,
    });

    console.log(`   Task: ${sunoResult.taskId}`);
    console.log(`   ⏳ Waiting for Suno...`);
    const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 300000);

    if (!tracks || tracks.length === 0) {
      console.error(`   ❌ Suno failed\n`);
      return;
    }

    const track = tracks[0];
    console.log(`   ✅ Audio ready: ${track.duration.toFixed(1)}s`);

    // Step 2: Download audio
    console.log(`\n💾 [2/3] Downloading audio...`);
    const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `test_beat_${Date.now()}.mp3`);
    const axios = (await import('axios')).default;
    const fs = await import('fs');
    const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, response.data);
    console.log(`   ✅ Downloaded: ${audioPath}`);

    // Step 3: Create job
    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '9:16',
      scriptName: beat.title,
      scriptContent: '',
      musicUrl: `/audio/${track.id}.mp3`,
      audioDuration: Math.floor(track.duration).toString(),
    });
    console.log(`   ✅ Job created: ${job.id}`);

    // Step 4: Generate video
    console.log(`\n🎬 [3/3] Generating video with Kling AI...`);
    const startTime = Date.now();
    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: audioPath,
        audioDuration: track.duration,
        instrumental: true,
      },
      '9:16',
      (percent, message) => {
        if (percent % 10 === 0) {
          console.log(`   [${percent}%] ${message}`);
        }
      },
    );

    const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log(`\n✅ BEAT COMPLETE!`);
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Thumbnail: ${result.thumbnailPath}`);
    console.log(`   Theme: ${result.theme}`);
    console.log(`   Duration: ${track.duration.toFixed(1)}s`);
    console.log(`   Processing time: ${elapsedMinutes}min`);

    // Update job
    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
      cost: '0.10',
      duration: Math.floor(track.duration),
      progress: 100,
      completedAt: new Date(),
    });

    console.log(`\n🎉 Beat generation complete!`);
    console.log(`📺 View at: http://localhost:5000\n`);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
  }
}

generate1Beat().catch(console.error);
