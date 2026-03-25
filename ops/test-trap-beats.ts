#!/usr/bin/env tsx
/**
 * Test Music Mode - Chill Trap Beats (Instrumental)
 *
 * Generates a simple trap beat video:
 * 1. Generate instrumental trap beat (Suno)
 * 2. Run beat analyzer
 * 3. Pick vibrant theme
 * 4. Loop background video
 * 5. Apply beat effects
 * 6. Combine audio + video
 * 7. Done! (NO lyrics, NO YouTube upload)
 */

import { storage } from './server/storage';
import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { existsSync } from 'fs';
import { join } from 'path';

async function testTrapBeats() {
  console.log('🎵 TRAP BEATS TEST - Instrumental Mode\n');

  try {
    // ============================================
    // STEP 1: Generate Trap Beat with Suno
    // ============================================
    console.log('STEP 1: Generating chill trap beat...');

    if (!sunoApi.isConfigured()) {
      throw new Error('Suno API not configured - set SUNO_API_KEY in .env or Secret Manager');
    }

    const beatStyle =
      'Chill trap, 140 BPM, atmospheric synths, heavy 808 bass, crispy hi-hats, dreamy pads, lo-fi aesthetic, smooth vibes';

    const sunoResult = await sunoApi.generateSong({
      lyrics: '', // Empty for instrumental
      style: beatStyle,
      title: 'Chill Trap Beat',
      instrumental: true, // CRITICAL: No vocals
      model: 'V5',
      targetDuration: 120, // 2 minutes
    });

    console.log(`   ✅ Beat generation started: ${sunoResult.taskId}`);
    console.log(`   ⏳ Waiting for Suno (60-120 seconds)...\n`);

    // Wait for completion
    const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 300000); // 5 min max

    if (!tracks || tracks.length === 0) {
      throw new Error('Suno beat generation failed');
    }

    const track = tracks[0];
    console.log(`   ✅ Beat ready!`);
    console.log(`   Duration: ${track.duration}s`);
    console.log(`   URL: ${track.audioUrl}\n`);

    // Download audio
    const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `trap_beat_${Date.now()}.mp3`);
    const axios = (await import('axios')).default;
    const fs = await import('fs');

    const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, response.data);

    console.log(`   ✅ Downloaded: ${audioPath}\n`);

    // ============================================
    // STEP 2: Create Music Mode Job
    // ============================================
    console.log('STEP 2: Creating Music Mode job...');

    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '9:16',
      scriptName: 'Chill Trap Beat - Test',
      scriptContent: '', // No lyrics for instrumental
      musicUrl: `/audio/${track.id}.mp3`,
      audioDuration: track.duration.toString(),
    });

    console.log(`   ✅ Job created: ${job.id}\n`);

    // ============================================
    // STEP 3: Run Music Mode Generator
    // ============================================
    console.log('STEP 3: Generating beat video...');
    console.log('   This will:');
    console.log('   - Analyze beats & energy');
    console.log('   - Pick trap-themed visual');
    console.log('   - Loop background 5-10 times');
    console.log('   - Apply beat-reactive effects');
    console.log('   - Combine video + audio');
    console.log('   ⏳ ~3-5 minutes total\n');

    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: audioPath,
        audioDuration: track.duration,
        instrumental: true, // NO KARAOKE
      },
      '9:16',
      (percent, message) => {
        console.log(`   [${percent}%] ${message}`);
      },
    );

    console.log(`\n✅ Beat video complete!`);
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Thumbnail: ${result.thumbnailPath}`);
    console.log(`   Theme: ${result.theme}`);
    console.log(`   Loop count: ${result.metadata.loopCount}`);
    console.log(`   Processing time: ${(result.metadata.processingTimeMs / 1000).toFixed(1)}s`);

    // Update job
    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
      cost: '0.10',
      duration: track.duration,
      progress: 100,
      completedAt: new Date(),
      musicAnalysis: {
        bpm: result.beatAnalysis.bpm,
        key: result.beatAnalysis.key,
        beatTimestamps: result.beatAnalysis.beats,
      } as any,
    });

    console.log(`\n🎉 Trap Beat Test PASSED!`);
    console.log(`\n📊 Summary:`);
    console.log(`   Cost: $0.10 (Suno only)`);
    console.log(`   No lyrics, no karaoke - just vibes`);
    console.log(`   No YouTube upload - manual control`);
    console.log(`   1 looped background matching trap energy`);
    console.log(`\n🎬 View video at: http://localhost:5000`);
  } catch (error: any) {
    console.error('\n❌ Trap Beat Test FAILED:');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testTrapBeats().catch(console.error);
