import { storage } from './server/storage.js';
import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        const fileStream = fs.createWriteStream(filepath);
        response.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });
        fileStream.on('error', reject);
      })
      .on('error', reject);
  });
}

interface VideoInfo {
  title: string;
  topic: string;
  thumbnailPrompt: string;
}

const videosToUpdate: VideoInfo[] = [
  {
    title: '3 Rabies Patients. 1 Secret Trial. A Legend Is Born.',
    topic: 'Louis Pasteur',
    thumbnailPrompt:
      'Louis Pasteur in his laboratory with dramatic lighting, Victorian era scientist with microscope and medical vials, dark mysterious atmosphere, cinematic portrait, high contrast, dramatic shadows, professional YouTube thumbnail, 16:9 aspect ratio, photorealistic, epic historical scene',
  },
  {
    title: '72 Hours, a Drunk Tsar, and a Palace Coup',
    topic: 'Catherine the Great',
    thumbnailPrompt:
      'Catherine the Great in imperial Russian palace, regal empress with crown and royal attire, dramatic lighting, gold and red colors, cinematic portrait, confident powerful pose, 18th century Russian architecture background, professional YouTube thumbnail, 16:9 aspect ratio, photorealistic',
  },
  {
    title: '6 Hours That Saved a Revolution',
    topic: 'George Washington',
    thumbnailPrompt:
      'George Washington crossing the Delaware River at night, dramatic winter scene with ice, Revolutionary War general in blue uniform, heroic pose with soldiers, dark dramatic sky, cinematic lighting, professional YouTube thumbnail, 16:9 aspect ratio, photorealistic, epic battle scene',
  },
  {
    title: 'The 5 Rounds That Shook the World of Boxing Forever',
    topic: 'Jack Johnson',
    thumbnailPrompt:
      'Jack Johnson in boxing ring, first African American heavyweight champion, powerful athletic pose with boxing gloves, early 1900s boxing arena, dramatic lighting, high contrast black and white with color accents, professional YouTube thumbnail, 16:9 aspect ratio, photorealistic, heroic portrait',
  },
  {
    title: 'The 10-Minute Ordeal That Defied Death and Destiny',
    topic: 'Theodore Roosevelt',
    thumbnailPrompt:
      'Theodore Roosevelt giving a speech with bullet hole in his jacket, determined expression, early 1900s presidential attire, dramatic stage lighting, American flag in background, powerful confident pose, professional YouTube thumbnail, 16:9 aspect ratio, photorealistic, cinematic portrait',
  },
  {
    title: "The 15-Day Trek That Shook Rome's Foundations",
    topic: 'Hannibal',
    thumbnailPrompt:
      'Hannibal Barca crossing the Alps with elephants, epic mountain landscape, ancient Carthaginian general in military armor, dramatic snowy peaks, cinematic lighting, heroic pose, ancient warfare scene, professional YouTube thumbnail, 16:9 aspect ratio, photorealistic, legendary historical moment',
  },
];

async function updateYouTubeThumbnails() {
  console.log('🎨 Generating and uploading thumbnails for 6 YouTube videos...\n');

  // Load secrets from GCP and .env
  console.log('🔐 Loading secrets...');

  // Load .env first (if GCP fails, .env will be used as fallback)
  const { config } = await import('dotenv');
  config();

  await initializeSecretsFromGCP();

  // Initialize OpenAI after secrets are loaded
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Import YouTube service after secrets are loaded
  const { youtubeUploadService } = await import('./server/services/youtube-upload-service.js');

  // Check if YouTube is authenticated
  const isAuth = await youtubeUploadService.isAuthenticated();
  if (!isAuth) {
    console.error('❌ YouTube not authenticated! Please authenticate first.');
    return;
  }

  console.log('✅ YouTube authenticated\n');

  // Get recent videos from YouTube channel
  console.log('📺 Fetching videos from YouTube channel...\n');
  const youtubeVideos = await youtubeUploadService.getVideoStats(20);
  console.log(`Found ${youtubeVideos.length} videos on YouTube\n`);

  for (let i = 0; i < videosToUpdate.length; i++) {
    const videoInfo = videosToUpdate[i];
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[${i + 1}/${videosToUpdate.length}] ${videoInfo.topic}`);
    console.log(`   Searching for: ${videoInfo.title.substring(0, 50)}...`);

    try {
      // Find matching video on YouTube by title
      const matchingVideo = youtubeVideos.find((video) => {
        const videoTitle = video.title.toLowerCase();
        const searchTitle = videoInfo.title.toLowerCase();
        // Match by first significant words
        const searchWords = searchTitle.split(' ').slice(0, 5).join(' ');
        return videoTitle.includes(searchWords) || searchTitle.includes(videoTitle);
      });

      if (!matchingVideo) {
        console.log(`   ❌ Could not find matching video on YouTube`);
        console.log(
          `      Available titles: ${youtubeVideos
            .slice(0, 3)
            .map((v) => v.title.substring(0, 40))
            .join(', ')}...`,
        );
        continue;
      }

      const videoId = matchingVideo.videoId;
      console.log(`   ✅ Found video: "${matchingVideo.title.substring(0, 50)}..."`);
      console.log(`   📹 YouTube Video ID: ${videoId}`);

      // Generate thumbnail with DALL-E 3
      console.log(`   🎨 Generating thumbnail with DALL-E 3...`);

      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: videoInfo.thumbnailPrompt,
        size: '1792x1024',
        quality: 'hd',
        n: 1,
      });

      const thumbnailUrl = response.data[0]?.url;

      if (!thumbnailUrl) {
        console.log(`   ❌ Failed to generate thumbnail`);
        continue;
      }

      console.log(`   ✅ Thumbnail generated`);

      // Download thumbnail to local file
      const thumbnailDir = path.join(process.cwd(), 'data', 'thumbnails');
      if (!fs.existsSync(thumbnailDir)) {
        fs.mkdirSync(thumbnailDir, { recursive: true });
      }

      const thumbnailFilename = `${videoId}_${Date.now()}_thumbnail.png`;
      const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

      console.log(`   💾 Downloading thumbnail...`);
      await downloadImage(thumbnailUrl, thumbnailPath);

      // Compress thumbnail to under 2MB (YouTube limit) using ffmpeg
      console.log(`   🗜️  Compressing thumbnail...`);
      const compressedPath = thumbnailPath.replace('.png', '_compressed.jpg');

      // Use ffmpeg to compress the image
      await execAsync(
        `ffmpeg -y -i "${thumbnailPath}" -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease" -q:v 5 "${compressedPath}"`,
      );

      const stats = fs.statSync(compressedPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`   ✅ Compressed to ${sizeMB} MB`);

      // Upload thumbnail to YouTube
      console.log(`   📤 Uploading thumbnail to YouTube...`);
      const result = await youtubeUploadService.setThumbnail(videoId, compressedPath);

      if (!result.success) {
        console.log(`   ❌ Failed to upload thumbnail: ${result.error}`);
        continue;
      }

      console.log(`   ✅ Thumbnail uploaded to YouTube!`);
      console.log(`   📍 Thumbnail saved locally: ${thumbnailPath}`);

      // Wait between uploads to avoid rate limits
      if (i < videosToUpdate.length - 1) {
        console.log(`   ⏳ Waiting 5 seconds before next video...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Thumbnail upload complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

updateYouTubeThumbnails()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
