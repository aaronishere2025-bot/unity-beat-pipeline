#!/usr/bin/env tsx
/**
 * Generate 3 random beats with variation
 */

import { sunoApi } from './server/services/suno-api';
import { randomBeatGenerator } from './server/services/random-beat-generator';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';
import { writeFileSync } from 'fs';

async function generateRandomBeats() {
  console.log('🎵 RANDOM BEAT GENERATOR - 3 Varied Beats\n');

  const beats = randomBeatGenerator.generateMultipleBeats(3);

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BEAT ${i + 1}/${beats.length}: ${beat.title}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Genre: ${beat.genre}`);
    console.log(`BPM: ${beat.bpm}`);
    console.log(`Style: ${beat.styleDescription}`);
    console.log(`Target Duration: ${beat.targetDuration}s\n`);

    try {
      // Generate with Suno
      console.log('🎵 Generating beat...');
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
        console.error(`   ❌ Failed\n`);
        continue;
      }

      const track = tracks[0];
      console.log(`   ✅ Ready: ${track.duration}s`);

      // Download
      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `beat_${i + 1}_${Date.now()}.mp3`);
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
        audioDuration: Math.floor(track.duration).toString(), // INT for DB
      });

      console.log(`   Job: ${job.id}`);

      // Generate video
      console.log('   🎬 Generating video...');
      const result = await musicModeGenerator.generateVideo(
        {
          packageId: job.id,
          audioFilePath: audioPath,
          audioDuration: track.duration,
          instrumental: true,
        },
        '9:16',
        (percent, message) => {
          if (percent % 20 === 0) console.log(`      [${percent}%] ${message}`);
        },
      );

      console.log(`   ✅ Complete: ${result.videoPath}`);
      console.log(`   Theme: ${result.theme}`);
      console.log(`   Time: ${(result.metadata.processingTimeMs / 1000).toFixed(1)}s\n`);

      // Update job
      await storage.updateJob(job.id, {
        status: 'completed',
        videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
        thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
        cost: '0.10',
        duration: Math.floor(track.duration), // INT for DB
        progress: 100,
        completedAt: new Date(),
      });
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}\n`);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('🎉 All beats generated! Check dashboard at http://localhost:5000');
  console.log(`${'='.repeat(60)}\n`);
}

generateRandomBeats().catch(console.error);
