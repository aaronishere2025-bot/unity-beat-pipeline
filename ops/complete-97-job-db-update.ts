#!/usr/bin/env tsx
/**
 * Complete 97% Job - Database Update Only
 * Video already generated, just need to update the database
 */

const FAILED_JOB_ID = '7f0e393e-000d-4a20-b218-2618696bfeba';
const VIDEO_FILENAME = 'music_7f0e393e-000d-4a20-b218-2618696bfeba_1768923953361.mp4';
const THUMBNAIL_FILENAME = '7f0e393e-000d-4a20-b218-2618696bfeba_thumbnail.jpg';
const AUDIO_DURATION = 1169.28; // seconds (~19.5 minutes)

async function completeJobUpdate() {
  console.log('💾 Completing Database Update for 97% Job\n');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Job ID:', FAILED_JOB_ID);
  console.log('  Video:', VIDEO_FILENAME);
  console.log('  Thumbnail:', THUMBNAIL_FILENAME);
  console.log('  Duration:', Math.round(AUDIO_DURATION), 'seconds');
  console.log('═══════════════════════════════════════════════════════════\n');

  const { storage } = await import('./server/storage');

  try {
    await storage.updateJob(FAILED_JOB_ID, {
      status: 'completed',
      progress: 100,
      videoUrl: `/api/videos/${VIDEO_FILENAME}`,
      thumbnailUrl: `/api/thumbnails/${THUMBNAIL_FILENAME}`,
      duration: Math.round(AUDIO_DURATION).toString(),
      cost: '0.10',
      metadata: {
        recoveredFrom97Percent: true,
        completedSongs: 9,
        requestedSongs: 10,
        partialGeneration: true,
      },
    });

    console.log('✅ Database updated successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📺 VIEW AT:');
    console.log('  Dashboard: http://localhost:8080/jobs');
    console.log('  Direct:    http://localhost:8080/jobs/' + FAILED_JOB_ID);
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (error: any) {
    console.error('❌ Failed to update database:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
completeJobUpdate().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
