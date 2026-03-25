/**
 * Test YouTube upload with bandit channel selection
 */

import { youtubeOAuthSimple } from './server/services/youtube-oauth-simple';
import { youtubeChannelBandit } from './server/services/youtube-channel-bandit';
import { existsSync } from 'fs';
import { join } from 'path';

async function main() {
  console.log('\n📤 Testing YouTube Upload Integration\n');

  // Find a test video
  const videoPath = 'data/videos/renders/beat_10_Chillhop_Evening_1768614424678.mp4';
  const thumbnailPath = 'data/thumbnails/fffd26b1-cda1-456e-bcb3-68c165d83781_thumbnail.jpg';

  // Verify files exist
  if (!existsSync(videoPath)) {
    console.error(`❌ Video not found: ${videoPath}`);
    process.exit(1);
  }

  if (!existsSync(thumbnailPath)) {
    console.error(`❌ Thumbnail not found: ${thumbnailPath}`);
    console.log('⚠️ Continuing without thumbnail...');
  }

  console.log(`✅ Video file: ${videoPath}`);
  console.log(`✅ Thumbnail file: ${thumbnailPath}\n`);

  // Test metadata
  const metadata = {
    title: 'Chillhop Evening - Lofi Beats to Relax',
    description: `Chill lofi hip hop beats for studying, working, or relaxing.

🎵 Beat produced with AI-powered music generation
🎨 Visuals created with Kling AI

#lofi #chillhop #studybeats #relaxing

This video was created with AI tools for educational purposes.`,
    tags: ['lofi', 'chillhop', 'study beats', 'relaxing', 'hip hop'],
    privacyStatus: 'unlisted' as const, // Use unlisted for testing
  };

  console.log('📝 Upload metadata:');
  console.log(`  Title: ${metadata.title}`);
  console.log(`  Tags: ${metadata.tags.join(', ')}`);
  console.log(`  Privacy: ${metadata.privacyStatus}\n`);

  // Test bandit selection
  console.log('🎰 Testing bandit channel selection...\n');
  const selectedChannel = await youtubeOAuthSimple.selectChannelWithBandit(metadata);

  if (!selectedChannel) {
    console.error('❌ No channel selected');
    process.exit(1);
  }

  console.log(`✅ Selected channel: ${selectedChannel.title}\n`);

  // Confirm before uploading
  console.log('⚠️  This will upload a video to YouTube!');
  console.log('   Press Ctrl+C to cancel, or wait 3 seconds to continue...\n');

  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Perform upload
  console.log('📤 Uploading video...\n');

  const result = await youtubeOAuthSimple.uploadVideo(
    selectedChannel.id,
    videoPath,
    existsSync(thumbnailPath) ? thumbnailPath : null,
    metadata,
  );

  if (result.success) {
    console.log('\n✅ Upload successful!');
    console.log(`   Video ID: ${result.videoId}`);
    console.log(`   Video URL: ${result.videoUrl}`);
    console.log(`   Channel: ${result.channelName}\n`);

    // Record outcome in bandit (for now, just a basic success signal)
    console.log('📊 Recording upload outcome in bandit...');
    await youtubeChannelBandit.updateReward(selectedChannel.id, {
      views: 0, // Will be updated later when analytics are available
      ctr: 0,
      retention: 0,
      likes: 0,
      contentType: 'lofi',
    });

    // After 24 hours, you would fetch YouTube analytics and update with real metrics:
    // await youtubeChannelBandit.updateReward(selectedChannel.id, {
    //   views: 1000,
    //   ctr: 5.2,
    //   retention: 45.3,
    //   likes: 42,
    //   contentType: 'lofi',
    // });

    console.log('✅ Outcome recorded\n');
  } else {
    console.error('\n❌ Upload failed!');
    console.error(`   Error: ${result.error}\n`);
    process.exit(1);
  }

  console.log('✅ Test complete!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
