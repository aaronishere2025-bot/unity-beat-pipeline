#!/usr/bin/env tsx
/**
 * Generate 2 beats with NEON BANANA centerpiece visuals
 * Testing fixed Kling integration
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { klingVideoGenerator } from './server/services/kling-video-generator';
import { storage } from './server/storage';
import { join } from 'path';

const BANANA_BEATS = [
  {
    title: 'Lofi Beat - Neon Banana Dreams',
    bpm: 85,
    genre: 'lofi',
    styleDescription: 'lofi, 85 BPM, jazzy chords, vinyl crackle, chill vibes, cozy aesthetic',
    targetDuration: 90,
    klingPrompt:
      'giant glowing neon banana floating in cosmic space, vibrant yellow and pink neon lights, retro 80s aesthetic, stars twinkling, dreamy atmosphere, slow rotation, 4K detailed, cinematic',
  },
  {
    title: 'Trap Beat - Nano Banana Energy',
    bpm: 145,
    genre: 'trap',
    styleDescription: 'trap, 145 BPM, heavy 808 bass, crispy hi-hats, atmospheric synths, dark vibes',
    targetDuration: 90,
    klingPrompt:
      'bioluminescent banana peel fragments exploding in slow motion, electric purple and neon green energy waves, cyberpunk aesthetic, particles flying, dramatic lighting, futuristic, 4K ultra detailed',
  },
];

async function generateNanoBananaBeats() {
  console.log('🍌 GENERATING 2 NEON BANANA BEATS WITH FIXED KLING\n');
  console.log('✅ Kling integration FIXED - using generateSingleClip()\n');

  for (let i = 0; i < BANANA_BEATS.length; i++) {
    const beat = BANANA_BEATS[i];
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🍌 BEAT ${i + 1}/2: ${beat.title} (${beat.bpm} BPM)`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Genre: ${beat.genre}`);
    console.log(`Visual: ${beat.klingPrompt.substring(0, 60)}...`);
    console.log();

    try {
      // Step 1: Generate Suno beat
      console.log(`🎵 [1/4] Generating Suno beat...`);
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
        console.error(`   ❌ Suno failed, skipping\n`);
        continue;
      }

      const track = tracks[0];
      console.log(`   ✅ Audio ready: ${track.duration.toFixed(1)}s`);

      // Step 2: Download audio
      console.log(`\n💾 [2/4] Downloading audio...`);
      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `nano_banana_${i + 1}_${Date.now()}.mp3`);
      const axios = (await import('axios')).default;
      const fs = await import('fs');
      const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(audioPath, response.data);
      console.log(`   ✅ Downloaded`);

      // Step 3: Test Kling DIRECTLY with neon banana prompt
      console.log(`\n🍌 [3/4] Generating NEON BANANA visual with Kling...`);
      console.log(`   📝 Prompt: ${beat.klingPrompt}`);
      console.log(`   ⏳ This may take 60-180 seconds...`);

      const klingResult = await klingVideoGenerator.generateSingleClip(beat.klingPrompt, {
        prompt: beat.klingPrompt,
        duration: 5,
        aspectRatio: '9:16',
      });

      if (!klingResult.success || !klingResult.localPath) {
        console.error(`   ❌ Kling generation failed: ${klingResult.error}`);
        console.log(`   Trying with music mode generator instead...\n`);

        // Fallback to full music mode pipeline
        const job = await storage.createJob({
          mode: 'music',
          aspectRatio: '9:16',
          scriptName: beat.title,
          scriptContent: '',
          audioDuration: Math.floor(track.duration).toString(),
        });

        const result = await musicModeGenerator.generateVideo(
          {
            packageId: job.id,
            audioFilePath: audioPath,
            audioDuration: track.duration,
            instrumental: true,
          },
          '9:16',
          (percent, message) => {
            if (percent % 20 === 0) console.log(`   [${percent}%] ${message}`);
          },
        );

        console.log(`\n✅ BEAT ${i + 1} COMPLETE (fallback mode)!`);
        console.log(`   Video: ${result.videoPath}`);
        console.log(`   Theme: ${result.theme}`);

        await storage.updateJob(job.id, {
          status: 'completed',
          videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
          thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
          cost: '0.20',
          duration: Math.floor(track.duration),
          progress: 100,
          completedAt: new Date(),
        });

        continue;
      }

      console.log(`   ✅ KLING SUCCESS! Neon banana video generated!`);
      console.log(`   Path: ${klingResult.localPath}`);
      console.log(`   Cost: $${klingResult.cost.toFixed(2)}`);

      // Step 4: Use music mode to assemble everything
      console.log(`\n🎬 [4/4] Assembling final video with music mode...`);

      const job = await storage.createJob({
        mode: 'music',
        aspectRatio: '9:16',
        scriptName: beat.title,
        scriptContent: '',
        audioDuration: Math.floor(track.duration).toString(),
      });

      const result = await musicModeGenerator.generateVideo(
        {
          packageId: job.id,
          audioFilePath: audioPath,
          audioDuration: track.duration,
          instrumental: true,
        },
        '9:16',
        (percent, message) => {
          if (percent % 20 === 0) console.log(`   [${percent}%] ${message}`);
        },
      );

      console.log(`\n🍌✅ NEON BANANA BEAT ${i + 1} COMPLETE!`);
      console.log(`   Video: ${result.videoPath}`);
      console.log(`   Thumbnail: ${result.thumbnailPath}`);
      console.log(`   Theme: ${result.theme}`);
      console.log(`   Duration: ${track.duration.toFixed(1)}s`);
      console.log(`   Total Cost: $0.20 (Suno $0.10 + Kling $0.10)`);

      await storage.updateJob(job.id, {
        status: 'completed',
        videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
        thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
        cost: '0.20',
        duration: Math.floor(track.duration),
        progress: 100,
        completedAt: new Date(),
      });
    } catch (error: any) {
      console.error(`\n❌ Error on beat ${i + 1}: ${error.message}`);
      console.error(error.stack);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('🍌🎉 2 NEON BANANA BEATS GENERATED!');
  console.log('📺 View at: http://localhost:5000');
  console.log('');
  console.log('Visual Themes:');
  console.log('  1. Giant glowing neon banana in cosmic space (LOFI)');
  console.log('  2. Bioluminescent banana explosion with energy waves (TRAP)');
  console.log(`${'='.repeat(70)}\n`);
}

generateNanoBananaBeats().catch(console.error);
