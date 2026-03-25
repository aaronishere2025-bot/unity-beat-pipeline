#!/usr/bin/env tsx
import { join } from 'path';
/**
 * Finish the Stuck Test Job
 *
 * Audio is complete (19.3 minutes, 10 songs)
 * Suno timeout fix WORKED - all songs generated
 * Failed during FFmpeg thumbnail generation
 */

const FAILED_JOB_ID = '77da3ada-3014-4e8b-8007-eb46c19c8458';
const COMPLETE_AUDIO = join(
  process.cwd(),
  'data',
  'temp',
  'processing',
  'music_77da3ada-3014-4e8b-8007-eb46c19c8458_complete_1768924843758.mp3',
);
const AUDIO_DURATION = 1160.35; // seconds (~19.3 minutes)

async function finishJob() {
  console.log('🔧 Finishing Stuck Test Job (FFmpeg Thumbnail Issue)\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Job ID:', FAILED_JOB_ID);
  console.log('  Audio:', COMPLETE_AUDIO);
  console.log('  Duration:', (AUDIO_DURATION / 60).toFixed(1), 'minutes (10/10 songs)');
  console.log('  Note: Suno timeout fix WORKED - all 10 songs generated!');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { musicModeGenerator } = await import('./server/services/music-mode-generator');
  const { storage } = await import('./server/storage');

  try {
    // Update job status
    console.log('📊 Updating job status...');
    await storage.updateJob(FAILED_JOB_ID, {
      status: 'processing',
      progress: 98,
      error: null,
    });
    console.log('   Status: processing (98%)\n');

    // Generate video
    console.log('🎬 Generating video with purple lofi aesthetic...\n');

    const result = await musicModeGenerator.generateVideo(
      {
        packageId: FAILED_JOB_ID,
        audioFilePath: COMPLETE_AUDIO,
        audioDuration: AUDIO_DURATION,
        description: '30-Minute Purple Lofi Study Mix 🎧 [FIXED]',
      },
      '16:9',
      (progress, message) => {
        console.log(`   [${progress}%] ${message}`);
      },
    );

    console.log('\n✅ Video generated successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Video:', result.videoPath);
    console.log('  Thumbnail:', result.thumbnailPath || 'N/A');
    console.log('  Cost:', result.cost ? `$${result.cost.toFixed(2)}` : 'N/A');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Update job to completed
    console.log('💾 Updating job to completed...');

    const videoFilename = result.videoPath.split('/').pop();
    const thumbnailFilename = result.thumbnailPath?.split('/').pop();

    await storage.updateJob(FAILED_JOB_ID, {
      status: 'completed',
      progress: 100,
      videoUrl: `/api/videos/${videoFilename}`,
      thumbnailUrl: thumbnailFilename ? `/api/thumbnails/${thumbnailFilename}` : null,
      duration: Math.round(AUDIO_DURATION).toString(),
      cost: result.cost?.toString(),
      metadata: {
        recoveredFromFFmpegStuck: true,
        completedSongs: 10,
        requestedSongs: 10,
        sunoTimeoutFixed: true,
        allSongsGenerated: true,
      },
    });

    console.log('\n🎉 SUCCESS! Job completed!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📺 VIEW AT:');
    console.log('  Dashboard: http://localhost:8080/jobs');
    console.log('  Direct:    http://localhost:8080/jobs/' + FAILED_JOB_ID);
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('✅ CONFIRMATION: Suno timeout fix WORKED!');
    console.log('   All 10 songs generated successfully.');
    console.log('   Failure was in FFmpeg thumbnail, not Suno.\n');
  } catch (error: any) {
    console.error('\n❌ Failed to finish job:', error.message);
    console.error(error.stack);

    // Update job with error
    await storage.updateJob(FAILED_JOB_ID, {
      status: 'failed',
      error: `Recovery failed: ${error.message}`,
    });

    process.exit(1);
  }
}

// Run
finishJob().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
