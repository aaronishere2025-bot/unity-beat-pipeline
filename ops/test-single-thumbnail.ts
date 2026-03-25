import { initializeSecretsFromGCP } from './server/secret-manager-loader';
import { join } from 'path';
import { existsSync, statSync } from 'fs';

async function testThumbnail() {
  console.log('🔐 Loading secrets...');
  await initializeSecretsFromGCP();
  console.log('✅ Secrets loaded\n');

  const { youtubeUploadService } = await import('./server/services/youtube-upload-service');

  // Test with one video
  const videoId = 'sxTBOL8ByE8';
  const thumbnailFile = 'sxTBOL8ByE8_fixed.jpg';
  const thumbnailPath = join(process.cwd(), 'data', 'thumbnails', thumbnailFile);

  console.log(`📺 Testing thumbnail upload for: ${videoId}`);
  console.log(`📸 Using file: ${thumbnailFile}`);
  console.log(`📁 Path: ${thumbnailPath}`);

  if (!existsSync(thumbnailPath)) {
    console.log('❌ File not found!');
    process.exit(1);
  }

  console.log('✅ File exists');

  // Check file size
  const stats = statSync(thumbnailPath);
  const fileSizeInBytes = stats.size;
  const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
  console.log(`📊 File size: ${fileSizeInMB.toFixed(2)} MB`);

  if (fileSizeInBytes > 2097152) {
    console.log('❌ File too large (>2MB)');
    process.exit(1);
  }

  console.log('\n🚀 Uploading thumbnail to YouTube...\n');

  try {
    const result = await youtubeUploadService.setThumbnail(videoId, thumbnailPath);

    if (result.success) {
      console.log('✅ SUCCESS! Thumbnail uploaded');
      console.log('\n📋 Next steps:');
      console.log('   1. Go to YouTube Studio');
      console.log(`   2. Open video: https://studio.youtube.com/video/${videoId}/edit`);
      console.log('   3. Check if custom thumbnail appears');
      console.log('   4. If not visible, may need to wait a few minutes for processing\n');
    } else {
      console.log(`❌ FAILED: ${result.error}`);
    }
  } catch (error: any) {
    console.log(`❌ ERROR: ${error.message}`);
  }

  process.exit(0);
}

testThumbnail().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
