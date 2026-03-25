#!/usr/bin/env tsx
/**
 * Generate 2 random beats with variation
 * Quick test to ensure beats video generation works
 */

import { sunoApi } from './server/services/suno-api';
import { randomBeatGenerator } from './server/services/random-beat-generator';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';

async function generate2Beats() {
  console.log('🎵 GENERATING 2 RANDOM BEATS\n');

  const beats = randomBeatGenerator.generateMultipleBeats(2);

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`BEAT ${i + 1}/2: ${beat.title}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Genre: ${beat.genre}`);
    console.log(`BPM: ${beat.bpm}`);
    console.log(`Style: ${beat.styleDescription}`);
    console.log(`Target Duration: ${beat.targetDuration}s\n`);

    try {
      // Generate with Suno
      console.log('🎵 Step 1/4: Generating beat with Suno...');
      const sunoResult = await sunoApi.generateSong({
        lyrics: '',
        style: beat.styleDescription,
        title: beat.title,
        instrumental: true,
        model: 'V5',
        targetDuration: beat.targetDuration,
      });

      console.log(`   Task: ${sunoResult.taskId}`);
      console.log(`   ⏳ Waiting for Suno (60-120 seconds)...`);
      const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 300000);

      if (!tracks || tracks.length === 0) {
        console.error(`   ❌ Failed\n`);
        continue;
      }

      const track = tracks[0];
      console.log(`   ✅ Beat ready: ${track.duration}s`);

      // Download
      console.log('\n🎵 Step 2/4: Downloading audio...');
      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `beat_${i + 1}_${Date.now()}.mp3`);
      const axios = (await import('axios')).default;
      const fs = await import('fs');
      const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(audioPath, response.data);
      console.log(`   ✅ Downloaded to: ${audioPath}`);

      // Create job
      console.log('\n🎵 Step 3/4: Creating job in database...');
      const job = await storage.createJob({
        mode: 'music',
        aspectRatio: '9:16',
        scriptName: beat.title,
        scriptContent: '',
        musicUrl: `/audio/${track.id}.mp3`,
        audioDuration: Math.floor(track.duration).toString(),
      });
      console.log(`   ✅ Job created: ${job.id}`);

      // Generate video
      console.log('\n🎵 Step 4/4: Generating video with beat effects...');
      console.log('   This will:');
      console.log('   - Analyze beats & energy curve');
      console.log('   - Select theme matching genre');
      console.log('   - Loop background video');
      console.log('   - Apply beat-reactive effects');
      console.log('   - Combine audio + video');
      console.log('   ⏳ Processing (~3-5 minutes)...\n');

      const result = await musicModeGenerator.generateVideo(
        {
          packageId: job.id,
          audioFilePath: audioPath,
          audioDuration: track.duration,
          instrumental: true,
        },
        '9:16',
        (percent, message) => {
          if (percent % 10 === 0) console.log(`      [${percent}%] ${message}`);
        },
      );

      console.log(`\n   ✅ Video complete!`);
      console.log(`   Video: ${result.videoPath}`);
      console.log(`   Thumbnail: ${result.thumbnailPath}`);
      console.log(`   Theme: ${result.theme}`);
      console.log(`   Loops: ${result.metadata.loopCount}`);
      console.log(`   Processing time: ${(result.metadata.processingTimeMs / 1000).toFixed(1)}s`);

      // Update job
      await storage.updateJob(job.id, {
        status: 'completed',
        videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
        thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
        cost: '0.10',
        duration: Math.floor(track.duration),
        progress: 100,
        completedAt: new Date(),
        musicAnalysis: {
          bpm: result.beatAnalysis.bpm,
          key: result.beatAnalysis.key,
          beatTimestamps: result.beatAnalysis.beats,
        } as any,
      });

      console.log(`   ✅ Job updated in database\n`);
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}\n`);
      console.error(error.stack);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('🎉 2 beats generated successfully!');
  console.log('📺 View videos at: http://localhost:5000');
  console.log(`${'='.repeat(60)}\n`);
}

generate2Beats().catch(console.error);
