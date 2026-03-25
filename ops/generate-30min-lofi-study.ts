#!/usr/bin/env tsx
/**
 * Generate 30-minute Lofi Study Beat
 * Perfect for studying, working, or relaxing
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';

async function generate30MinLofiStudyBeat() {
  console.log('🎧 GENERATING 30-MINUTE LOFI STUDY BEAT\n');
  console.log('Perfect for:');
  console.log('  📚 Studying');
  console.log('  💻 Working/Coding');
  console.log('  🧘 Relaxing/Meditation');
  console.log('  ☕ Coffee shop vibes\n');
  console.log('='.repeat(70));

  const beat = {
    title: 'Lofi Study Beats - 30 Minutes of Chill Vibes',
    bpm: 80,
    genre: 'lofi',
    styleDescription:
      'lofi hip-hop, chill study beats, 80 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative',
    targetDuration: 1800, // 30 minutes = 1800 seconds
  };

  try {
    // Step 1: Generate 30-minute Suno beat
    console.log(`\n🎵 [1/3] Generating 30-minute lofi music with Suno...`);
    console.log(`   Style: ${beat.styleDescription}`);
    console.log(`   Target duration: 30:00 minutes`);
    console.log(`   ⏳ This will take 2-4 minutes...\n`);

    const sunoResult = await sunoApi.generateSong({
      lyrics: '',
      style: beat.styleDescription,
      title: beat.title,
      instrumental: true,
      model: 'V5',
      targetDuration: beat.targetDuration,
    });

    console.log(`   Task ID: ${sunoResult.taskId}`);
    console.log(`   ⏳ Waiting for Suno to complete...`);
    const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000); // 10 min timeout

    if (!tracks || tracks.length === 0) {
      console.error(`   ❌ Suno failed to generate music\n`);
      return;
    }

    const track = tracks[0];
    const durationMin = (track.duration / 60).toFixed(1);
    console.log(`   ✅ Audio ready: ${durationMin} minutes (${track.duration.toFixed(1)}s)`);

    // Step 2: Download audio
    console.log(`\n💾 [2/3] Downloading audio...`);
    const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `lofi_study_30min_${Date.now()}.mp3`);
    const axios = (await import('axios')).default;
    const fs = await import('fs');

    console.log(`   🌐 Downloading from Suno...`);
    const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, response.data);
    const fileSizeMB = (response.data.length / 1024 / 1024).toFixed(1);
    console.log(`   ✅ Downloaded: ${fileSizeMB}MB → ${audioPath}`);

    // Step 3: Create job
    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '16:9',
      scriptName: beat.title,
      scriptContent:
        'Chill lofi hip-hop beats for studying, working, and relaxing. 30 minutes of uninterrupted flow state music.',
      musicUrl: `/audio/${track.id}.mp3`,
      audioDuration: Math.floor(track.duration).toString(),
    });
    console.log(`   ✅ Job created: ${job.id}`);

    // Step 4: Generate video with lofi-themed Kling AI background
    console.log(`\n🎬 [3/3] Generating 30-minute video with lofi visuals...`);
    console.log(`   This will:`);
    console.log(`   - Analyze beats and energy with librosa`);
    console.log(`   - Select lofi-themed visual (anime study room, rainy window, etc.)`);
    console.log(`   - Generate 5s Kling AI background`);
    console.log(`   - Loop seamlessly to match 30 minutes of audio`);
    console.log(`   - Apply subtle beat effects on drops`);
    console.log(`   - Render final 30-minute video`);
    console.log(`   ⏳ Estimated time: 3-5 minutes...\n`);

    const startTime = Date.now();
    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: audioPath,
        audioDuration: track.duration,
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

    console.log(`\n✅ 30-MINUTE LOFI STUDY BEAT COMPLETE!`);
    console.log(`${'='.repeat(70)}`);
    console.log(`   🎵 Title: ${beat.title}`);
    console.log(`   🎨 Visual Theme: ${result.theme}`);
    console.log(`   ⏱️  Duration: ${durationMin} minutes`);
    console.log(`   📁 Video: ${result.videoPath}`);
    console.log(`   🖼️  Thumbnail: ${result.thumbnailPath}`);
    console.log(`   ⚡ Processing time: ${elapsedMinutes} minutes`);
    console.log(`   💰 Cost: $0.20 (Suno $0.10 + Kling $0.10)`);
    console.log(`${'='.repeat(70)}`);

    // Update job with completion details
    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
      cost: '0.20',
      duration: Math.floor(track.duration),
      progress: 100,
      completedAt: new Date(),
      musicAnalysis: {
        bpm: result.beatAnalysis?.bpm || 80,
        key: result.beatAnalysis?.key || 'unknown',
        beatTimestamps: result.beatAnalysis?.beats || [],
      } as any,
    });

    console.log(`\n📺 View your 30-minute lofi study beat at: http://localhost:5000`);
    console.log(`\nPerfect for:`);
    console.log(`  🎓 Deep study sessions`);
    console.log(`  👨‍💻 Coding marathons`);
    console.log(`  📝 Writing and creative work`);
    console.log(`  🧘 Background music for focus`);
    console.log(`\n🎉 Enjoy your chill vibes!\n`);
  } catch (error: any) {
    console.error(`\n❌ Error generating 30-minute lofi beat: ${error.message}`);
    console.error(error.stack);
  }
}

generate30MinLofiStudyBeat().catch(console.error);
