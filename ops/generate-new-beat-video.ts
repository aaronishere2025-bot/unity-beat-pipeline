#!/usr/bin/env tsx
/**
 * Generate a fresh 1-minute beat video with beat analyzer
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import axios from 'axios';
import fs from 'fs';
import { join } from 'path';

async function generateNewBeatVideo() {
  console.log('🎵 GENERATING NEW BEAT VIDEO\n');
  console.log('Using the new beat analyzer system!\n');
  console.log('='.repeat(70));

  try {
    // PHASE 1: Generate beat with Suno
    console.log('\n🎵 PHASE 1: GENERATING BEAT\n');

    const beatStyle =
      'trap, hard 808s, aggressive hi-hats, dark synth, minor key, 140 BPM energy, trap snares, cinematic';
    const beatTitle = 'Dark Trap Beat - Midnight Energy';

    console.log(`   Style: ${beatStyle}`);
    console.log(`   Title: ${beatTitle}\n`);

    const sunoResult = await sunoApi.generateSong({
      lyrics: '',
      style: beatStyle,
      title: beatTitle,
      instrumental: true,
      model: 'V5',
    });

    console.log(`   Task ID: ${sunoResult.taskId}`);
    console.log(`   ⏳ Waiting for Suno (2-3 minutes)...`);

    const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000);

    if (!tracks || tracks.length === 0) {
      throw new Error('Suno failed to generate track');
    }

    const track = tracks.reduce((longest, t) => (t.duration > longest.duration ? t : longest));

    console.log(`   ✅ Beat generated: ${track.duration.toFixed(1)}s`);

    // Download audio
    console.log(`\n💾 Downloading audio...`);
    const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `dark_trap_beat_${Date.now()}.mp3`);
    const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, response.data);
    console.log(`   ✅ Saved: ${audioPath}`);

    // PHASE 2: Create job in database
    console.log('\n📝 PHASE 2: CREATING JOB\n');

    const job = await storage.createJob({
      scriptName: beatTitle,
      scriptContent: beatStyle,
      mode: 'music',
      aspectRatio: '9:16',
      clipDuration: 6,
      autoUpload: false,
      metadata: {
        musicGenre: 'trap',
        bpm: 140,
        instrumental: true,
      },
    });

    console.log(`   ✅ Job created: ${job.id}`);

    // PHASE 3: Generate video with beat analyzer
    console.log('\n🎬 PHASE 3: GENERATING VIDEO WITH BEAT ANALYSIS\n');
    console.log('   This will analyze beats, energy curves, and drop points!\n');

    await storage.updateJob(job.id, { status: 'processing', progress: 10 });

    console.log(`   Generating with music-mode-generator...\n`);

    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: audioPath,
        audioDuration: track.duration,
        instrumental: true,
      },
      '9:16',
      (progress, status) => {
        console.log(`   [${progress}%] ${status}`);
      },
    );

    console.log(`\n✅ Video generated!`);
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Thumbnail: ${result.thumbnailPath}`);

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

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ NEW BEAT VIDEO COMPLETE!`);
    console.log(`${'='.repeat(70)}`);
    console.log(`\n🎵 Beat: ${beatTitle}`);
    console.log(`   Style: Trap (140 BPM)`);
    console.log(`   Duration: ${track.duration.toFixed(1)}s`);
    console.log(`\n🎬 Visual: Auto-selected by Thompson Sampling`);
    console.log(`   Analysis: BPM, energy curves, beat timestamps, drop points`);
    console.log(`\n📊 Job:`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Status: Completed`);
    console.log(`\n📁 Files:`);
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Thumbnail: ${result.thumbnailPath}`);
    console.log(`\n💰 Cost: $0.10 (Suno) + $0.10 (Kling) = $0.20`);
    console.log(`\n✨ View on dashboard: http://localhost:8080`);
    console.log(`${'='.repeat(70)}\n`);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

generateNewBeatVideo();
