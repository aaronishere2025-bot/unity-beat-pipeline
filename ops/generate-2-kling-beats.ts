#!/usr/bin/env tsx
/**
 * Generate 2 beats with varied Kling AI centerpiece visuals
 * Using simplified music mode generator
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';

const BEATS = [
  {
    title: 'Phonk Beat - Neon City',
    bpm: 155,
    genre: 'phonk',
    styleDescription:
      'phonk, 155 BPM, distorted 808, cowbell, Memphis samples, heavy bass, dark gritty aggressive vibes',
    targetDuration: 120,
  },
  {
    title: 'Ambient Beat - Crystal Dreams',
    bpm: 70,
    genre: 'ambient',
    styleDescription:
      'ambient, 70 BPM, ethereal pads, soft synths, reverb textures, subtle bass, dreamy atmospheric meditative',
    targetDuration: 120,
  },
];

async function generate2KlingBeats() {
  console.log('🎨 GENERATING 2 BEATS WITH KLING AI CENTERPIECES\n');

  for (let i = 0; i < BEATS.length; i++) {
    const beat = BEATS[i];
    console.log(`\n${'='.repeat(70)}`);
    console.log(`BEAT ${i + 1}/2: ${beat.title} (${beat.bpm} BPM)`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Genre: ${beat.genre}`);
    console.log(`Style: ${beat.styleDescription}\n`);

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
        console.error(`   ❌ Suno failed, skipping\n`);
        continue;
      }

      const track = tracks[0];
      console.log(`   ✅ Audio ready: ${track.duration.toFixed(1)}s`);

      // Step 2: Download audio
      console.log(`\n💾 [2/3] Downloading audio...`);
      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `kling_beat_${i + 1}_${Date.now()}.mp3`);
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

      // Step 4: Generate video with Kling AI backgrounds
      console.log(`\n🎬 [3/3] Generating video with Kling AI backgrounds...`);
      console.log(`   This will:`);
      console.log(`   - Analyze beats with librosa`);
      console.log(`   - Select ${beat.genre}-themed visual`);
      console.log(`   - Generate 5s Kling background`);
      console.log(`   - Loop to match audio`);
      console.log(`   - Apply beat effects`);
      console.log(`   ⏳ ~3-7 minutes...\n`);

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

      console.log(`\n✅ BEAT ${i + 1} COMPLETE!`);
      console.log(`   Video: ${result.videoPath}`);
      console.log(`   Thumbnail: ${result.thumbnailPath}`);
      console.log(`   Theme: ${result.theme}`);
      console.log(`   Duration: ${track.duration.toFixed(1)}s`);
      console.log(`   Processing time: ${elapsedMinutes}min`);
      console.log(`   Cost: $0.20 (Suno $0.10 + Kling $0.10)`);

      // Update job
      await storage.updateJob(job.id, {
        status: 'completed',
        videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
        thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
        cost: '0.20',
        duration: Math.floor(track.duration),
        progress: 100,
        completedAt: new Date(),
        musicAnalysis: {
          bpm: result.beatAnalysis.bpm,
          key: result.beatAnalysis.key,
          beatTimestamps: result.beatAnalysis.beats,
        } as any,
      });
    } catch (error: any) {
      console.error(`\n❌ Error on beat ${i + 1}: ${error.message}`);
      console.error(error.stack);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('🎉 2 BEATS WITH KLING CENTERPIECES GENERATED!');
  console.log('📺 View at: http://localhost:5000');
  console.log('');
  console.log('Expected Themes:');
  console.log('  1. Phonk - Neon city streets/graffiti OR dark aggressive visual');
  console.log('  2. Ambient - Giant crystals/cosmic tree OR ethereal dreamscape');
  console.log(`${'='.repeat(70)}\n`);
}

generate2KlingBeats().catch(console.error);
