#!/usr/bin/env tsx
/**
 * Generate 10-Minute Lofi Study Mix (TEST VERSION)
 * - Generates 3-4 Suno tracks with consistent vibe
 * - Concatenates into 10-minute seamless mix
 * - Uses 1 SINGLE Kling clip looped for entire duration
 * - Cost: ~$0.40 (3 Suno tracks + 1 Kling clip)
 * - Time: ~8-12 minutes total
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';
import { execSync } from 'child_process';
import * as fs from 'fs';

async function generate10MinLofiMix() {
  console.log('🎧 GENERATING 10-MINUTE LOFI STUDY MIX (TEST)\n');
  console.log('Strategy:');
  console.log('  🎵 Generate 3-4 Suno tracks (~3 min each) with consistent vibe');
  console.log('  🔗 Concatenate into seamless 10-minute audio');
  console.log('  🎬 Generate 1 Kling clip, loop for entire 10 minutes');
  console.log('  💰 Cost: ~$0.40 (3-4 Suno × $0.10 + 1 Kling × $0.10)');
  console.log('  ⏱️  Time: ~8-12 minutes total');
  console.log('='.repeat(70));

  const TARGET_DURATION = 600; // 10 minutes in seconds
  const MAX_TRACKS = 4;

  // Consistent lofi style for all tracks
  const lofiStyle =
    'lofi hip-hop, chill study beats, 80-85 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative';

  const trackTitles = [
    'Rainy Window - Lofi Study Session',
    'Coffee Shop Dreams - Chill Beats',
    'Midnight Study - Peaceful Vibes',
    'Moonlight Piano - Lofi Jazz',
  ];

  const downloadedTracks: Array<{ path: string; duration: number; title: string }> = [];

  try {
    // ============================================
    // PHASE 1: GENERATE SUNO TRACKS
    // ============================================
    console.log(`\n🎵 [PHASE 1/4] Generating Suno tracks with consistent vibe...`);
    console.log(`   Style: ${lofiStyle}`);
    console.log(`   Target: ${TARGET_DURATION / 60} minutes\n`);

    for (let i = 0; i < MAX_TRACKS; i++) {
      const trackTitle = trackTitles[i];
      console.log(`\n   [${i + 1}/${MAX_TRACKS}] Generating: ${trackTitle}`);

      const sunoResult = await sunoApi.generateSong({
        lyrics: '',
        style: lofiStyle,
        title: trackTitle,
        instrumental: true,
        model: 'V5',
      });

      console.log(`      Task ID: ${sunoResult.taskId}`);
      console.log(`      ⏳ Waiting for Suno...`);

      const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000);

      if (!tracks || tracks.length === 0) {
        console.error(`      ❌ Track ${i + 1} failed, skipping...`);
        continue;
      }

      const track = tracks[0];
      const durationMin = (track.duration / 60).toFixed(1);
      console.log(`      ✅ Generated: ${durationMin} minutes (${track.duration.toFixed(1)}s)`);

      // Download audio
      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `lofi_track_${i + 1}_${Date.now()}.mp3`);
      const axios = (await import('axios')).default;

      console.log(`      💾 Downloading...`);
      const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(audioPath, response.data);
      const fileSizeMB = (response.data.length / 1024 / 1024).toFixed(1);
      console.log(`      ✅ Saved: ${fileSizeMB}MB → ${audioPath}`);

      downloadedTracks.push({
        path: audioPath,
        duration: track.duration,
        title: trackTitle,
      });

      const totalDurationSoFar = downloadedTracks.reduce((sum, t) => sum + t.duration, 0);
      const totalMinutes = (totalDurationSoFar / 60).toFixed(1);
      console.log(`      📊 Progress: ${totalMinutes} / ${TARGET_DURATION / 60} minutes`);

      // Stop if we've reached target
      if (totalDurationSoFar >= TARGET_DURATION) {
        console.log(`      🎯 Target duration reached! (${totalMinutes} minutes)`);
        break;
      }
    }

    if (downloadedTracks.length === 0) {
      throw new Error('No tracks were successfully generated');
    }

    const totalDuration = downloadedTracks.reduce((sum, t) => sum + t.duration, 0);
    const totalMinutes = (totalDuration / 60).toFixed(1);
    console.log(`\n   ✅ Generated ${downloadedTracks.length} tracks, total: ${totalMinutes} minutes`);

    // ============================================
    // PHASE 2: CONCATENATE ALL TRACKS
    // ============================================
    console.log(`\n🔗 [PHASE 2/4] Concatenating ${downloadedTracks.length} tracks into seamless mix...`);

    const concatFilePath = join(process.cwd(), 'data', 'temp', 'processing', `concat_list_${Date.now()}.txt`);
    const concatContent = downloadedTracks.map((t) => `file '${t.path}'`).join('\n');
    fs.writeFileSync(concatFilePath, concatContent);
    console.log(`   📄 Concat list: ${concatFilePath}`);

    const finalAudioPath = join(process.cwd(), 'data', 'temp', 'processing', `lofi_10min_mix_${Date.now()}.mp3`);
    console.log(`   🎵 Concatenating tracks (gapless)...`);

    execSync(`ffmpeg -f concat -safe 0 -i "${concatFilePath}" -c copy "${finalAudioPath}" -y`, { stdio: 'inherit' });

    const finalSizeMB = (fs.statSync(finalAudioPath).size / 1024 / 1024).toFixed(1);
    console.log(`   ✅ Final mix: ${finalSizeMB}MB → ${finalAudioPath}`);
    console.log(`   ⏱️  Duration: ${totalMinutes} minutes`);

    // ============================================
    // PHASE 3: GENERATE 1 KLING CLIP & LOOP
    // ============================================
    console.log(`\n🎬 [PHASE 3/4] Generating 1 looping Kling clip for entire mix...`);

    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '16:9',
      scriptName: `Lofi Study Mix - ${totalMinutes} Minutes`,
      scriptContent: `Seamless ${totalMinutes}-minute lofi hip-hop mix. ${downloadedTracks.length} tracks with consistent chill vibes.`,
      musicUrl: `/audio/lofi_10min_mix.mp3`,
      audioDuration: Math.floor(totalDuration).toString(),
    });
    console.log(`   ✅ Job created: ${job.id}`);

    const startTime = Date.now();
    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: finalAudioPath,
        audioDuration: totalDuration,
        instrumental: true,
      },
      '16:9',
      (percent, message) => {
        if (percent % 10 === 0) {
          console.log(`   [${percent}%] ${message}`);
        }
      },
    );

    const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    // ============================================
    // PHASE 4: FINALIZE
    // ============================================
    console.log(`\n✅ 10-MINUTE LOFI STUDY MIX COMPLETE!`);
    console.log(`${'='.repeat(70)}`);
    console.log(`   🎵 Title: Lofi Study Mix - ${totalMinutes} Minutes`);
    console.log(`   🎨 Visual Theme: ${result.theme}`);
    console.log(`   📊 Tracks: ${downloadedTracks.length} seamlessly mixed`);
    console.log(`   ⏱️  Duration: ${totalMinutes} minutes`);
    console.log(`   📁 Video: ${result.videoPath}`);
    console.log(`   🖼️  Thumbnail: ${result.thumbnailPath}`);
    console.log(`   ⚡ Processing time: ${elapsedMinutes} minutes`);
    console.log(`   💰 Cost: $${(downloadedTracks.length * 0.1 + 0.1).toFixed(2)}`);
    console.log(`${'='.repeat(70)}`);

    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
      cost: (downloadedTracks.length * 0.1 + 0.1).toFixed(2),
      duration: Math.floor(totalDuration),
      progress: 100,
      completedAt: new Date(),
      musicAnalysis: {
        bpm: result.beatAnalysis?.bpm || 80,
        key: result.beatAnalysis?.key || 'unknown',
        beatTimestamps: result.beatAnalysis?.beats || [],
        trackCount: downloadedTracks.length,
        trackList: downloadedTracks.map((t) => t.title),
      } as any,
    });

    console.log(`\n📺 View at: http://localhost:8080`);
    console.log(`\nTrack List:`);
    downloadedTracks.forEach((track, i) => {
      const minutes = (track.duration / 60).toFixed(1);
      console.log(`   ${i + 1}. ${track.title} (${minutes} min)`);
    });
    console.log(`\n🎉 Enjoy your lofi mix!\n`);

    // Cleanup
    downloadedTracks.forEach((track) => {
      try {
        fs.unlinkSync(track.path);
      } catch (err) {}
    });
    fs.unlinkSync(concatFilePath);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

generate10MinLofiMix().catch(console.error);
