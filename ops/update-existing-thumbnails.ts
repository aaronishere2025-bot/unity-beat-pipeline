/**
 * Update YouTube Thumbnails with Existing Files
 *
 * Uses existing thumbnail files from data/thumbnails/
 */

import { initializeSecretsFromGCP } from './server/secret-manager-loader';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

// Video IDs from the user's list
const VIDEOS = [
  { id: 'sxTBOL8ByE8', title: '3 Rabies Patients. 1 Secret Trial. A Legend Is Born.' },
  { id: 'R0X6RUJro8U', title: '72 Hours, a Drunk Tsar, and a Palace Coup' },
  { id: 'cDJv0kbeyTU', title: '6 Hours That Saved a Revolution' },
  { id: 'ehO0ke8zt24', title: 'The 5 Rounds That Shook the World of Boxing Forever' },
  { id: 'nUU7Rh1rTxg', title: 'The 10-Minute Ordeal That Defied Death and Destiny' },
  { id: 'MN993V_lkbU', title: "The 15-Day Trek That Shook Rome's Foundations" },
];

function findBestThumbnail(videoId: string): string | null {
  const thumbnailsDir = join(process.cwd(), 'data', 'thumbnails');

  // Try different file patterns in order of preference
  const patterns = [
    `${videoId}_fixed.jpg`,
    `${videoId}_compressed.jpg`,
    `${videoId}_thumbnail.png`,
    `${videoId}.jpg`,
    `${videoId}.png`,
  ];

  for (const pattern of patterns) {
    const path = join(thumbnailsDir, pattern);
    if (existsSync(path)) {
      return path;
    }
  }

  // Try partial match (for files like MN993V_lkbU_*_thumbnail_compressed.jpg)
  try {
    const files = readdirSync(thumbnailsDir);
    const match = files
      .filter((f) => f.startsWith(videoId) && (f.endsWith('.jpg') || f.endsWith('.png')))
      .sort((a, b) => {
        // Prefer: _fixed > _compressed > _thumbnail > others
        if (a.includes('_fixed')) return -1;
        if (b.includes('_fixed')) return 1;
        if (a.includes('_compressed')) return -1;
        if (b.includes('_compressed')) return 1;
        return 0;
      })[0];

    if (match) {
      return join(thumbnailsDir, match);
    }
  } catch (e) {}

  return null;
}

async function main() {
  console.log('🎬 YouTube Thumbnail Updater (Using Existing Files)\n');

  // Load secrets
  console.log('🔐 Loading secrets from Google Secret Manager...');
  await initializeSecretsFromGCP();
  console.log('✅ Secrets loaded\n');

  // Import services after secrets loaded
  const { youtubeUploadService } = await import('./server/services/youtube-upload-service');

  // Check authentication
  const isAuth = await youtubeUploadService.isAuthenticated();
  if (!isAuth) {
    console.error('❌ YouTube not authenticated!');
    process.exit(1);
  }

  console.log('✅ YouTube authenticated\n');

  // Get channel info
  const channelInfo = await youtubeUploadService.getChannelInfo();
  if (channelInfo) {
    console.log(`📺 Channel: ${channelInfo.name}\n`);
  }

  // Process each video
  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  for (let i = 0; i < VIDEOS.length; i++) {
    const video = VIDEOS[i];
    console.log(`\n[${i + 1}/${VIDEOS.length}] ${video.title}`);
    console.log(`   Video ID: ${video.id}`);

    // Find thumbnail file
    const thumbnailPath = findBestThumbnail(video.id);
    if (!thumbnailPath) {
      console.log('   ⚠️  No thumbnail file found - skipping');
      skipCount++;
      continue;
    }

    console.log(`   📁 Using: ${thumbnailPath.split('/').pop()}`);

    try {
      // Update thumbnail on YouTube
      console.log('   📤 Uploading to YouTube...');
      const result = await youtubeUploadService.setThumbnail(video.id, thumbnailPath);

      if (result.success) {
        console.log('   ✅ Thumbnail updated successfully!');
        successCount++;
      } else {
        console.error(`   ❌ Failed: ${result.error}`);
        failCount++;
      }

      // Wait 2 seconds between updates to avoid rate limits
      if (i < VIDEOS.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n✨ Done!`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ⚠️  Skipped: ${skipCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
}

main().catch(console.error);
