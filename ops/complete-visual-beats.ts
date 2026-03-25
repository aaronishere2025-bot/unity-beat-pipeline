#!/usr/bin/env tsx
/**
 * Complete the 2 visual beats using existing Suno audio
 * Generate Kling videos with centerpiece visuals
 */

import { klingVideoGenerator } from './server/services/kling-video-generator';
import { beatEffectsProcessor } from './server/services/beat-effects-processor';
import { storage } from './server/storage';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync } from 'fs';

const execAsync = promisify(exec);

// Audio files already downloaded from previous run
const BEATS = [
  {
    audioPath: join(process.cwd(), 'data', 'temp', 'processing', 'beat_visual_1_1768193295084.mp3'),
    duration: 129.96,
    title: 'LOFI Beat - Mushroom Forest',
    genre: 'lofi',
    bpm: 85,
    visualPrompt:
      'glowing bioluminescent mushroom forest with giant mushrooms, ethereal particles floating, soft purple and blue mist, magical atmosphere, 4K detailed, slow zoom in, dreamy ethereal vibe',
  },
  {
    audioPath: join(process.cwd(), 'data', 'temp', 'processing', 'beat_visual_2_1768193458962.mp3'),
    duration: 153.48,
    title: 'TRAP Beat - Space Jellyfish',
    genre: 'trap',
    bpm: 145,
    visualPrompt:
      'cosmic jellyfish floating gracefully in deep space, long glowing tentacles trailing, vibrant purple and teal bioluminescence, nebula background, stars, slow orbital rotation, mesmerizing hypnotic',
  },
];

async function completeVisualBeats() {
  console.log('🎨 COMPLETING 2 VISUAL BEATS WITH KLING AI CENTERPIECES\n');

  for (let i = 0; i < BEATS.length; i++) {
    const beat = BEATS[i];
    console.log(`\n${'='.repeat(70)}`);
    console.log(`BEAT ${i + 1}/2: ${beat.title}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Audio: ${beat.audioPath}`);
    console.log(`Visual: ${beat.visualPrompt.split(',')[0]}...`);
    console.log();

    try {
      if (!existsSync(beat.audioPath)) {
        console.error(`   ❌ Audio file not found, skipping\n`);
        continue;
      }

      // ============================================
      // STEP 1: Beat Analysis
      // ============================================
      console.log('🎵 STEP 1/5: Analyzing beats...');

      const { stdout: beatJson } = await execAsync(
        `cd scripts && python3 -m beat_analyzer.cli "${beat.audioPath}" --quiet`,
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
      );

      const beatAnalysis = JSON.parse(beatJson);
      console.log(
        `   ✅ ${beatAnalysis.bpm} BPM, ${beatAnalysis.beats.length} beats, ${beatAnalysis.segments.length} segments`,
      );

      // ============================================
      // STEP 2: Generate Kling Background Video (5 seconds)
      // ============================================
      console.log('\n🎨 STEP 2/5: Generating Kling AI background (5 seconds)...');
      console.log(`   📝 Prompt: ${beat.visualPrompt}`);
      console.log(`   ⏳ This may take 60-180 seconds...`);

      const klingResult = await klingVideoGenerator.generateVideo({
        prompt: beat.visualPrompt,
        duration: 5,
        aspectRatio: '9:16',
        mode: 'standard',
      });

      if (!klingResult || !klingResult.videoUrl) {
        console.error(`   ❌ Kling failed, skipping this beat\n`);
        continue;
      }

      console.log(`   ✅ Kling video generated!`);

      // Download Kling video
      const tempDir = join(process.cwd(), 'data', 'temp', 'processing');
      const klingVideoPath = join(tempDir, `kling_complete_${i + 1}_${Date.now()}.mp4`);
      const axios = (await import('axios')).default;
      const klingResponse = await axios.get(klingResult.videoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
      });
      writeFileSync(klingVideoPath, klingResponse.data);
      console.log(`   ✅ Downloaded Kling video`);

      // ============================================
      // STEP 3: Loop Video to Match Audio Duration
      // ============================================
      console.log('\n🔄 STEP 3/5: Looping video to match audio...');
      const loopCount = Math.ceil(beat.duration / 5);
      console.log(`   Looping 5s video × ${loopCount} = ${loopCount * 5}s`);

      const loopedPath = join(tempDir, `looped_complete_${i + 1}_${Date.now()}.mp4`);
      await execAsync(
        `ffmpeg -stream_loop ${loopCount - 1} -i "${klingVideoPath}" ` +
          `-t ${beat.duration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
          `"${loopedPath}" -y`,
        { timeout: 120000 },
      );
      console.log(`   ✅ Video looped`);

      // ============================================
      // STEP 4: Apply Beat Effects
      // ============================================
      console.log('\n⚡ STEP 4/5: Applying beat-reactive effects...');
      const effectsFilter = beatEffectsProcessor.generateEffectsFilter(
        {
          bpm: beatAnalysis.bpm,
          beats: beatAnalysis.beats,
          segments: beatAnalysis.segments,
          energyCurve: beatAnalysis.energyCurve,
          dropPoints: beatAnalysis.dropPoints,
        },
        beatAnalysis.duration,
      );

      const effectsPath = join(tempDir, `effects_complete_${i + 1}_${Date.now()}.mp4`);
      if (effectsFilter) {
        await execAsync(
          `ffmpeg -i "${loopedPath}" -vf "${effectsFilter}" ` +
            `-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p ` +
            `"${effectsPath}" -y`,
          { timeout: 180000 },
        );
        console.log(`   ✅ Effects applied: flash, zoom, glow, color shift`);
      } else {
        await execAsync(`cp "${loopedPath}" "${effectsPath}"`);
        console.log(`   ⚠️ No effects applied`);
      }

      // ============================================
      // STEP 5: Combine Video + Audio
      // ============================================
      console.log('\n🎬 STEP 5/5: Combining video + audio...');

      const job = await storage.createJob({
        mode: 'music',
        aspectRatio: '9:16',
        scriptName: beat.title,
        scriptContent: '',
        audioDuration: Math.floor(beat.duration).toString(),
      });

      const finalPath = join(process.cwd(), 'data/videos/renders', `music_${job.id}_${Date.now()}.mp4`);

      await execAsync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

      await execAsync(
        `ffmpeg -i "${effectsPath}" -i "${beat.audioPath}" ` +
          `-map 0:v:0 -map 1:a:0 ` +
          `-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 192k ` +
          `-t ${beat.duration} -shortest ` +
          `"${finalPath}" -y`,
        { timeout: 300000 },
      );

      console.log(`   ✅ Final video: ${finalPath}`);

      // Generate thumbnail
      const thumbnailPath = join(process.cwd(), 'data/thumbnails', `${job.id}_thumbnail.jpg`);
      await execAsync(`mkdir -p ${join(process.cwd(), 'data/thumbnails')}`);
      await execAsync(
        `ffmpeg -i "${finalPath}" -ss 00:00:05 -vframes 1 ` +
          `-vf "scale=1920:1080:force_original_aspect_ratio=decrease" ` +
          `"${thumbnailPath}" -y`,
        { timeout: 30000 },
      );

      console.log(`   ✅ Thumbnail: ${thumbnailPath}`);

      // Update job
      await storage.updateJob(job.id, {
        status: 'completed',
        videoUrl: `/api/videos/${finalPath.split('/').pop()}`,
        thumbnailUrl: `/api/thumbnails/${thumbnailPath.split('/').pop()}`,
        cost: '0.20', // Suno + Kling
        duration: Math.floor(beat.duration),
        progress: 100,
        completedAt: new Date(),
        musicAnalysis: {
          bpm: beatAnalysis.bpm,
          key: beatAnalysis.key,
          beatTimestamps: beatAnalysis.beats,
        } as any,
      });

      console.log(`\n✅ BEAT ${i + 1} COMPLETE!`);
      console.log(`   Job ID: ${job.id}`);
      console.log(`   Theme: ${beat.visualPrompt.split(',')[0]}`);
      console.log(`   Duration: ${beat.duration.toFixed(1)}s`);
      console.log(`   Cost: $0.20 (Suno $0.10 + Kling $0.10)`);
    } catch (error: any) {
      console.error(`\n❌ Error on beat ${i + 1}: ${error.message}`);
      console.error(error.stack);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('🎉 2 VISUAL BEATS WITH KLING CENTERPIECES COMPLETE!');
  console.log('📺 View at: http://localhost:5000');
  console.log('');
  console.log('Visual Themes:');
  console.log('  1. Glowing bioluminescent mushroom forest (LOFI)');
  console.log('  2. Cosmic jellyfish floating in space (TRAP)');
  console.log(`${'='.repeat(70)}\n`);
}

completeVisualBeats().catch(console.error);
