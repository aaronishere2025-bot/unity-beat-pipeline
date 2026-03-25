#!/usr/bin/env tsx
/**
 * Generate TRUE 30-Minute Lofi Study Mix
 * - Generates 10+ Suno tracks with consistent vibe
 * - Concatenates all tracks into 30-minute seamless mix
 * - Uses 1 SINGLE Kling clip looped for entire duration
 * - Cost: ~$1.10 (10 Suno tracks + 1 Kling clip)
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';
import { execSync } from 'child_process';
import * as fs from 'fs';

async function generate30MinLofiMix() {
  console.log('🎧 GENERATING TRUE 30-MINUTE LOFI STUDY MIX\n');
  console.log('Strategy:');
  console.log('  🎵 Generate 10 Suno tracks (~3 min each) with consistent vibe');
  console.log('  🔗 Concatenate into seamless 30-minute audio');
  console.log('  🎬 Generate 1 Kling clip, loop for entire 30 minutes');
  console.log('  💰 Cost: ~$1.10 (10 Suno × $0.10 + 1 Kling × $0.10)');
  console.log('='.repeat(70));

  const TARGET_DURATION = 1800; // 30 minutes in seconds
  const TRACK_COUNT = 10; // Generate 10 tracks

  // Consistent lofi style for all tracks
  const lofiStyle =
    'lofi hip-hop, chill study beats, 80-85 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative';

  const trackTitles = [
    'Rainy Window - Lofi Study Session',
    'Coffee Shop Dreams - Chill Beats',
    'Midnight Study - Peaceful Vibes',
    'Moonlight Piano - Lofi Jazz',
    'Cozy Corner - Study Beats',
    'Late Night Focus - Chill Hop',
    'Warm Blanket - Lofi Vibes',
    'Book Pages - Study Music',
    'Gentle Rain - Chill Beats',
    'Quiet Hours - Lofi Study',
  ];

  const downloadedTracks: Array<{ path: string; duration: number; title: string }> = [];

  try {
    // ============================================
    // PHASE 1: GENERATE 10 SUNO TRACKS
    // ============================================
    console.log(`\n🎵 [PHASE 1/4] Generating ${TRACK_COUNT} Suno tracks with consistent vibe...`);
    console.log(`   Style: ${lofiStyle}`);
    console.log(`   ⏳ This will take 20-40 minutes total (2-4 min per track)...\n`);

    for (let i = 0; i < TRACK_COUNT; i++) {
      const trackTitle = trackTitles[i] || `Lofi Study Beat ${i + 1}`;
      console.log(`\n   [${i + 1}/${TRACK_COUNT}] Generating: ${trackTitle}`);

      const sunoResult = await sunoApi.generateSong({
        lyrics: '',
        style: lofiStyle,
        title: trackTitle,
        instrumental: true,
        model: 'V5',
      });

      console.log(`      Task ID: ${sunoResult.taskId}`);
      console.log(`      ⏳ Waiting for Suno...`);

      const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000); // 10 min timeout

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
      console.log(`      📊 Progress: ${totalMinutes} / 30.0 minutes`);

      // Stop if we've reached 30 minutes
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

    // Create FFmpeg concat file
    const concatFilePath = join(process.cwd(), 'data', 'temp', 'processing', `concat_list_${Date.now()}.txt`);
    const concatContent = downloadedTracks.map((t) => `file '${t.path}'`).join('\n');
    fs.writeFileSync(concatFilePath, concatContent);
    console.log(`   📄 Concat list: ${concatFilePath}`);

    // Concatenate with FFmpeg (using concat demuxer for gapless playback)
    const finalAudioPath = join(process.cwd(), 'data', 'temp', 'processing', `lofi_30min_mix_${Date.now()}.mp3`);
    console.log(`   🎵 Concatenating tracks (gapless)...`);
    console.log(`   ⏳ This may take 2-3 minutes...`);

    execSync(`ffmpeg -f concat -safe 0 -i "${concatFilePath}" -c copy "${finalAudioPath}" -y`, { stdio: 'inherit' });

    const finalSizeMB = (fs.statSync(finalAudioPath).size / 1024 / 1024).toFixed(1);
    console.log(`   ✅ Final mix: ${finalSizeMB}MB → ${finalAudioPath}`);
    console.log(`   ⏱️  Duration: ${totalMinutes} minutes`);

    // ============================================
    // PHASE 3: GENERATE 1 KLING CLIP
    // ============================================
    console.log(`\n🎬 [PHASE 3/4] Generating 1 looping Kling clip for entire mix...`);

    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '16:9',
      scriptName: `Lofi Study Mix - ${totalMinutes} Minutes`,
      scriptContent: `Seamless ${totalMinutes}-minute lofi hip-hop mix for studying, working, and relaxing. Compiled from ${downloadedTracks.length} tracks with consistent chill vibes.`,
      musicUrl: `/audio/lofi_30min_mix.mp3`,
      audioDuration: Math.floor(totalDuration).toString(),
    });
    console.log(`   ✅ Job created: ${job.id}`);

    console.log(`\n   This will:`);
    console.log(`   - Analyze beats and energy with librosa`);
    console.log(`   - Select lofi-themed visual (anime study room, rainy window, etc.)`);
    console.log(`   - Generate 5s Kling AI background`);
    console.log(`   - Loop seamlessly to match ${totalMinutes} minutes of audio`);
    console.log(`   - Render final ${totalMinutes}-minute video`);
    console.log(`   ⏳ Estimated time: 3-5 minutes...\n`);

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
    console.log(`\n✅ TRUE 30-MINUTE LOFI STUDY MIX COMPLETE!`);
    console.log(`${'='.repeat(70)}`);
    console.log(`   🎵 Title: Lofi Study Mix - ${totalMinutes} Minutes`);
    console.log(`   🎨 Visual Theme: ${result.theme}`);
    console.log(`   📊 Tracks: ${downloadedTracks.length} seamlessly mixed`);
    console.log(`   ⏱️  Duration: ${totalMinutes} minutes`);
    console.log(`   📁 Video: ${result.videoPath}`);
    console.log(`   🖼️  Thumbnail: ${result.thumbnailPath}`);
    console.log(`   ⚡ Processing time: ${elapsedMinutes} minutes`);
    console.log(
      `   💰 Cost: $${(downloadedTracks.length * 0.1 + 0.1).toFixed(2)} (${downloadedTracks.length} Suno + 1 Kling)`,
    );
    console.log(`${'='.repeat(70)}`);

    // Update job with completion details
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

    console.log(`\n📺 View your ${totalMinutes}-minute lofi mix at: http://localhost:8080`);
    console.log(`\nTrack List:`);
    downloadedTracks.forEach((track, i) => {
      const minutes = (track.duration / 60).toFixed(1);
      console.log(`   ${i + 1}. ${track.title} (${minutes} min)`);
    });
    console.log(`\nPerfect for:`);
    console.log(`  🎓 Extended study sessions (${totalMinutes} minutes uninterrupted)`);
    console.log(`  👨‍💻 Long coding marathons`);
    console.log(`  📝 Deep work and creative projects`);
    console.log(`  🧘 Background music for sustained focus`);
    console.log(`\n🎉 Enjoy your extended chill vibes!\n`);

    // Cleanup: Remove individual track files to save space
    console.log(`\n🧹 Cleaning up individual track files...`);
    downloadedTracks.forEach((track) => {
      try {
        fs.unlinkSync(track.path);
        console.log(`   🗑️  Removed: ${track.path}`);
      } catch (err) {
        console.log(`   ⚠️  Could not remove: ${track.path}`);
      }
    });
    fs.unlinkSync(concatFilePath);
    console.log(`   ✅ Cleanup complete!`);
  } catch (error: any) {
    console.error(`\n❌ Error generating 30-minute lofi mix: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

generate30MinLofiMix().catch(console.error);
