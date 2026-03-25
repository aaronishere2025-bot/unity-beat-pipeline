#!/usr/bin/env tsx
/**
 * Generate 4 TRAP beats with vibrant trap visuals
 * Dark, aggressive, hypnotic aesthetics
 */

import { sunoApi } from './server/services/suno-api';
import { klingVideoGenerator } from './server/services/kling-video-generator';
import { beatEffectsProcessor } from './server/services/beat-effects-processor';
import { storage } from './server/storage';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, writeFileSync } from 'fs';

const execAsync = promisify(exec);

// 4 TRAP BEAT THEMES - Dark, aggressive, hypnotic visuals
const TRAP_THEMES = [
  {
    bpm: 145,
    style: 'Dark trap, heavy 808 bass, rolling hi-hats, atmospheric synths, menacing vibes, aggressive',
    visualPrompt:
      'purple lean waves liquid motion, syrupy fluid dripping and swirling, hypnotic abstract art, dark background, neon purple glow, smooth slow motion, ultra detailed 4K, mesmerizing',
    title: 'TRAP Beat - Purple Waves',
  },
  {
    bpm: 150,
    style: 'Hard trap, punchy 808s, crispy snares, dark melody, urban aggressive, hypnotic bounce',
    visualPrompt:
      'diamond rain falling through darkness, crystal light refractions, luxury sparkle particles, black background, cinematic slow motion, vivid prismatic colors, 8K ultra detailed, captivating',
    title: 'TRAP Beat - Diamond Rain',
  },
  {
    bpm: 140,
    style: 'Trap banger, distorted 808, tight hi-hats, dark ambient pads, club energy, intense',
    visualPrompt:
      'electric plasma ball with lightning tendrils, pulsing energy waves, vibrant electric blue and purple, dark atmospheric background, slow orbital rotation, high voltage aesthetic, hyper realistic',
    title: 'TRAP Beat - Plasma Energy',
  },
  {
    bpm: 155,
    style: 'Trap inferno, massive 808 bass, rapid hi-hats, fire samples, dark aggressive menacing',
    visualPrompt:
      'liquid gold flowing and morphing, metallic reflections, luxury abstract art, hypnotic fluid motion, dark background with golden glow, cinematic lighting, 4K ultra detailed, mesmerizing',
    title: 'TRAP Beat - Liquid Gold',
  },
];

async function generate4TrapBeats() {
  console.log('🔥 GENERATING 4 TRAP BEATS WITH VIBRANT VISUALS\n');
  console.log('🎨 Dark, aggressive, hypnotic aesthetics\n');

  for (let i = 0; i < TRAP_THEMES.length; i++) {
    const theme = TRAP_THEMES[i];
    console.log(`\n${'='.repeat(70)}`);
    console.log(`TRAP BEAT ${i + 1}/4: ${theme.title}`);
    console.log(`${'='.repeat(70)}`);
    console.log(`BPM: ${theme.bpm}`);
    console.log(`Visual: ${theme.visualPrompt.split(',')[0]}...`);
    console.log();

    try {
      // ============================================
      // STEP 1: Generate Suno Beat
      // ============================================
      console.log('🎵 STEP 1/6: Generating Suno trap beat...');
      const sunoResult = await sunoApi.generateSong({
        lyrics: '',
        style: theme.style,
        title: theme.title,
        instrumental: true,
        model: 'V5',
        targetDuration: 120, // 2 minutes
      });

      console.log(`   Task: ${sunoResult.taskId}`);
      console.log(`   ⏳ Waiting for Suno (60-120 seconds)...`);
      const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 300000);

      if (!tracks || tracks.length === 0) {
        console.error(`   ❌ Suno failed, skipping\n`);
        continue;
      }

      const track = tracks[0];
      console.log(`   ✅ Beat ready: ${track.duration}s`);

      // Download audio
      const tempDir = join(process.cwd(), 'data', 'temp', 'processing');
      if (!existsSync(tempDir)) {
        await execAsync(`mkdir -p ${tempDir}`);
      }

      const audioPath = join(tempDir, `trap_beat_${i + 1}_${Date.now()}.mp3`);
      const axios = (await import('axios')).default;
      const fs = await import('fs');
      const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(audioPath, response.data);
      console.log(`   ✅ Downloaded audio`);

      // ============================================
      // STEP 2: Beat Analysis
      // ============================================
      console.log('\n🎵 STEP 2/6: Analyzing beats...');
      const scriptDir = join(process.cwd(), 'scripts');
      const pythonPath = 'python3';

      const { stdout: beatJson } = await execAsync(
        `cd ${scriptDir} && ${pythonPath} -m beat_analyzer.cli "${audioPath}" --quiet`,
        { timeout: 60000, maxBuffer: 10 * 1024 * 1024 },
      );

      const beatAnalysis = JSON.parse(beatJson);
      console.log(
        `   ✅ ${beatAnalysis.bpm} BPM, ${beatAnalysis.beats.length} beats, ${beatAnalysis.segments.length} segments`,
      );

      // ============================================
      // STEP 3: Generate Kling Background Video (5 seconds)
      // ============================================
      console.log('\n🎨 STEP 3/6: Generating Kling AI background (5 seconds)...');
      console.log(`   📝 Prompt: ${theme.visualPrompt}`);
      console.log(`   ⏳ This may take 60-180 seconds...`);

      const klingResult = await klingVideoGenerator.generateVideo({
        prompt: theme.visualPrompt,
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
      const klingVideoPath = join(tempDir, `kling_trap_${i + 1}_${Date.now()}.mp4`);
      const klingResponse = await axios.get(klingResult.videoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
      });
      writeFileSync(klingVideoPath, klingResponse.data);
      console.log(`   ✅ Downloaded Kling video`);

      // ============================================
      // STEP 4: Loop Video to Match Audio Duration
      // ============================================
      console.log('\n🔄 STEP 4/6: Looping video to match audio...');
      const loopCount = Math.ceil(track.duration / 5);
      console.log(`   Looping 5s video × ${loopCount} = ${loopCount * 5}s`);

      const loopedPath = join(tempDir, `looped_trap_${i + 1}_${Date.now()}.mp4`);
      await execAsync(
        `ffmpeg -stream_loop ${loopCount - 1} -i "${klingVideoPath}" ` +
          `-t ${track.duration} -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
          `"${loopedPath}" -y`,
        { timeout: 120000 },
      );
      console.log(`   ✅ Video looped`);

      // ============================================
      // STEP 5: Apply Beat Effects
      // ============================================
      console.log('\n⚡ STEP 5/6: Applying beat-reactive effects...');
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

      const effectsPath = join(tempDir, `effects_trap_${i + 1}_${Date.now()}.mp4`);
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
      // STEP 6: Combine Video + Audio
      // ============================================
      console.log('\n🎬 STEP 6/6: Combining video + audio...');

      const job = await storage.createJob({
        mode: 'music',
        aspectRatio: '9:16',
        scriptName: theme.title,
        scriptContent: '',
        musicUrl: `/audio/${track.id}.mp3`,
        audioDuration: Math.floor(track.duration).toString(),
      });

      const finalPath = join(process.cwd(), 'data/videos/renders', `music_${job.id}_${Date.now()}.mp4`);

      await execAsync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

      await execAsync(
        `ffmpeg -i "${effectsPath}" -i "${audioPath}" ` +
          `-map 0:v:0 -map 1:a:0 ` +
          `-c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p ` +
          `-c:a aac -b:a 192k ` +
          `-t ${track.duration} -shortest ` +
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
        duration: Math.floor(track.duration),
        progress: 100,
        completedAt: new Date(),
        musicAnalysis: {
          bpm: beatAnalysis.bpm,
          key: beatAnalysis.key,
          beatTimestamps: beatAnalysis.beats,
        } as any,
      });

      console.log(`\n✅ TRAP BEAT ${i + 1} COMPLETE!`);
      console.log(`   Job ID: ${job.id}`);
      console.log(`   Theme: ${theme.visualPrompt.split(',')[0]}`);
      console.log(`   Cost: $0.20 (Suno $0.10 + Kling $0.10)`);
    } catch (error: any) {
      console.error(`\n❌ Error on trap beat ${i + 1}: ${error.message}`);
      console.error(error.stack);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('🔥 4 TRAP BEATS GENERATED!');
  console.log('📺 View at: http://localhost:5000');
  console.log('💎 Dark, aggressive, hypnotic visuals');
  console.log('💰 Total Cost: $0.80 (4 beats × $0.20)');
  console.log(`${'='.repeat(70)}\n`);
}

generate4TrapBeats().catch(console.error);
