#!/usr/bin/env tsx
import { join } from 'path';
/**
 * Finish beat video using existing audio
 */

import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { execSync } from 'child_process';

const EXISTING_AUDIO = join(process.cwd(), 'data', 'temp', 'processing', 'dark_trap_beat_1768606178885.mp3');

async function finishBeatVideo() {
  console.log('🎵 FINISHING BEAT VIDEO WITH EXISTING AUDIO\n');
  console.log(`✅ Using: ${EXISTING_AUDIO}\n`);
  console.log('='.repeat(70));

  try {
    // Get audio duration
    const durationCmd = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${EXISTING_AUDIO}"`,
    );
    const audioDuration = parseFloat(durationCmd.toString().trim());
    console.log(`   Duration: ${audioDuration.toFixed(1)}s\n`);

    // Create job
    console.log('📝 Creating job...\n');
    const job = await storage.createJob({
      scriptName: 'Dark Trap Beat - Midnight Energy',
      scriptContent: 'trap, hard 808s, aggressive hi-hats, dark synth, 140 BPM',
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

    console.log(`   ✅ Job ID: ${job.id}\n`);

    // Generate video with beat analyzer
    console.log('🎬 GENERATING VIDEO WITH BEAT ANALYSIS\n');
    console.log('   This will:');
    console.log('   1. Analyze beats with Python beat_analyzer');
    console.log('   2. Generate Kling video with Thompson Sampling');
    console.log('   3. Apply beat-reactive effects');
    console.log('   4. Assemble final video\n');

    await storage.updateJob(job.id, { status: 'processing', progress: 10 });

    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: EXISTING_AUDIO,
        audioDuration,
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
      duration: Math.floor(audioDuration),
      progress: 100,
      completedAt: new Date(),
    });

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ BEAT VIDEO COMPLETE!`);
    console.log(`${'='.repeat(70)}`);
    console.log(`\n🎵 Beat: Dark Trap Beat - Midnight Energy`);
    console.log(`   Style: Trap (140 BPM, hard 808s)`);
    console.log(`   Duration: ${audioDuration.toFixed(1)}s`);
    console.log(`\n🎬 Visual: Auto-selected by Thompson Sampling`);
    console.log(`   Beat Analysis: ✅ BPM, energy curves, drops`);
    console.log(`\n📊 Job:`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Status: Completed`);
    console.log(`\n📁 Files:`);
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Thumbnail: ${result.thumbnailPath}`);
    console.log(`\n💰 Cost: $0.10 (Kling only - reused Suno audio)`);
    console.log(`\n✨ View on dashboard: http://localhost:8080`);
    console.log(`${'='.repeat(70)}\n`);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

finishBeatVideo();
