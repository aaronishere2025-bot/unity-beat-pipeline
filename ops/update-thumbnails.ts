/**
 * Update Thumbnails Script
 *
 * Updates thumbnails for specific YouTube videos
 * Requires YouTube OAuth to be completed first
 */

import { initializeSecretsFromGCP } from './server/secret-manager-loader';
import axios from 'axios';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// Video titles to update (from user's list)
const VIDEO_TITLES = [
  '3 Rabies Patients. 1 Secret Trial. A Legend Is Born.',
  '72 Hours, a Drunk Tsar, and a Palace Coup',
  '6 Hours That Saved a Revolution',
  'The 5 Rounds That Shook the World of Boxing Forever',
  'The 10-Minute Ordeal That Defied Death and Destiny',
  "The 15-Day Trek That Shook Rome's Foundations",
];

// Thumbnail prompts for each video
const THUMBNAIL_PROMPTS = [
  'Louis Pasteur in a dramatic laboratory scene with rabies vaccine, dark moody lighting, scientific breakthrough moment',
  'Catherine the Great in imperial Russian palace, cunning expression, dramatic palace coup scene',
  'George Washington crossing Delaware River at night, revolutionary war, heroic dramatic moment',
  'Jack Johnson boxing match, African American boxer, powerful triumphant pose, 1908 historic moment',
  'Theodore Roosevelt giving speech with bullet hole in chest, rugged determination, American hero',
  'Hannibal crossing Alps with elephants, epic Roman warfare, dramatic mountain landscape',
];

interface VideoMatch {
  videoId: string;
  title: string;
  currentThumbnailUrl: string;
}

async function downloadImage(url: string, filepath: string): Promise<void> {
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  writeFileSync(filepath, response.data);
  console.log(`✅ Downloaded: ${filepath}`);
}

async function main() {
  console.log('🎬 YouTube Thumbnail Updater\n');

  // Load secrets from Google Secret Manager
  console.log('🔐 Loading secrets from Google Secret Manager...');
  await initializeSecretsFromGCP();
  console.log('✅ Secrets loaded\n');

  // Import services AFTER secrets are loaded
  const { youtubeUploadService } = await import('./server/services/youtube-upload-service');
  const { youtubeMetadataGenerator } = await import('./server/services/youtube-metadata-generator');

  // Check authentication
  const isAuth = await youtubeUploadService.isAuthenticated();
  if (!isAuth) {
    console.error('❌ YouTube not authenticated!');
    console.error('📌 Please complete OAuth first:');
    console.error('   1. Visit: http://localhost:8080/api/youtube/auth-url');
    console.error('   2. Click the OAuth link and authorize');
    console.error('   3. Run this script again');
    process.exit(1);
  }

  console.log('✅ YouTube authenticated\n');

  // Get channel info
  const channelInfo = await youtubeUploadService.getChannelInfo();
  if (channelInfo) {
    console.log(`📺 Channel: ${channelInfo.name}\n`);
  }

  // Get recent videos
  console.log('🔍 Fetching your recent videos...');
  const videos = await youtubeUploadService.getVideoStats(50);
  console.log(`   Found ${videos.length} videos\n`);

  // Match videos by title
  const matches: VideoMatch[] = [];
  for (const targetTitle of VIDEO_TITLES) {
    const video = videos.find(
      (v: any) =>
        v.title.toLowerCase().includes(targetTitle.toLowerCase()) ||
        targetTitle.toLowerCase().includes(v.title.toLowerCase()),
    );

    if (video) {
      matches.push({
        videoId: video.videoId,
        title: video.title,
        currentThumbnailUrl: video.thumbnailUrl,
      });
      console.log(`✅ Found: "${video.title}"`);
    } else {
      console.log(`⚠️  Not found: "${targetTitle}"`);
    }
  }

  if (matches.length === 0) {
    console.error('\n❌ No matching videos found!');
    process.exit(1);
  }

  console.log(`\n📊 Found ${matches.length} / ${VIDEO_TITLES.length} videos\n`);

  // Create thumbnails directory
  const thumbnailsDir = join(process.cwd(), 'data', 'thumbnails', 'updates');
  if (!existsSync(thumbnailsDir)) {
    mkdirSync(thumbnailsDir, { recursive: true });
  }

  // Process each video
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const prompt =
      THUMBNAIL_PROMPTS[
        VIDEO_TITLES.indexOf(
          VIDEO_TITLES.find(
            (t) =>
              match.title.toLowerCase().includes(t.toLowerCase()) ||
              t.toLowerCase().includes(match.title.toLowerCase()),
          ) || '',
        )
      ];

    console.log(`\n[${i + 1}/${matches.length}] Processing: ${match.title}`);
    console.log(`   Video ID: ${match.videoId}`);

    try {
      // Generate new thumbnail
      console.log('   🎨 Generating new thumbnail...');
      const thumbnailUrl = await youtubeMetadataGenerator.generateThumbnail(prompt);

      if (!thumbnailUrl) {
        console.error('   ❌ Failed to generate thumbnail');
        continue;
      }

      console.log(`   ✅ Generated thumbnail: ${thumbnailUrl}`);

      // Download thumbnail
      const thumbnailPath = join(thumbnailsDir, `${match.videoId}.jpg`);
      await downloadImage(thumbnailUrl, thumbnailPath);

      // Update on YouTube
      console.log('   📤 Uploading to YouTube...');
      const result = await youtubeUploadService.setThumbnail(match.videoId, thumbnailPath);

      if (result.success) {
        console.log('   ✅ Thumbnail updated successfully!');
      } else {
        console.error(`   ❌ Failed to update: ${result.error}`);
      }

      // Wait 2 seconds between updates to avoid rate limits
      if (i < matches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n✨ Done!');
}

main().catch(console.error);
