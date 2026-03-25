import { storage } from './server/storage.js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import https from 'https';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

async function generateThumbnailsForRecentVideos() {
  console.log('🎨 Generating on-topic thumbnails for 6 most recent videos...\n');

  const allJobs = await storage.listJobs();

  // Get 5 most recent completed jobs
  const completedJobs = allJobs
    .filter((job) => job.status === 'completed')
    .sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 5);

  if (completedJobs.length === 0) {
    console.log('❌ No completed jobs found');
    return;
  }

  console.log(`Found ${completedJobs.length} completed jobs to process\n`);

  for (let i = 0; i < completedJobs.length; i++) {
    const job = completedJobs[i];
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`[${i + 1}/${completedJobs.length}] Processing: ${job.scriptName}`);
    console.log(`   Job ID: ${job.id}`);

    // Extract topic information
    const topic = job.unityMetadata?.topic || job.scriptName || 'Historical figure';
    console.log(`   Topic: ${topic.substring(0, 100)}...`);

    try {
      // Generate thumbnail prompt based on the topic
      const thumbnailPrompt = `Create a dramatic, eye-catching YouTube thumbnail for "${job.scriptName}".

${topic}

Style: Cinematic portrait with dramatic lighting, high contrast, bold colors, historically accurate period setting. Professional YouTube thumbnail composition with clear focal point. Photorealistic, epic atmosphere, 16:9 aspect ratio. IMPORTANT: Adults only - mature historical figures, no children.`;

      console.log(`   🎨 Generating thumbnail with DALL-E 3...`);

      // Generate the thumbnail using OpenAI DALL-E 3
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt: thumbnailPrompt,
        size: '1792x1024', // Closest to 16:9
        quality: 'hd',
        n: 1,
      });

      const thumbnailUrl = response.data[0]?.url;

      if (thumbnailUrl) {
        console.log(`   ✅ Thumbnail generated: ${thumbnailUrl}`);

        // Download and save thumbnail locally
        const thumbnailDir = path.join(process.cwd(), 'data', 'thumbnails');
        if (!fs.existsSync(thumbnailDir)) {
          fs.mkdirSync(thumbnailDir, { recursive: true });
        }

        const thumbnailFilename = `${job.id}_thumbnail.png`;
        const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

        console.log(`   💾 Downloading thumbnail to ${thumbnailPath}...`);
        await downloadImage(thumbnailUrl, thumbnailPath);

        // Update job with thumbnail path
        await storage.updateJob(job.id, {
          thumbnailPath: thumbnailPath,
        });

        console.log(`   ✅ Job updated with thumbnail path`);
        console.log(`   📍 Thumbnail saved: ${thumbnailPath}`);
      } else {
        console.log(`   ❌ Failed to generate thumbnail`);
      }

      // Wait a bit between generations to avoid rate limits
      if (i < completedJobs.length - 1) {
        console.log(`   ⏳ Waiting 5 seconds before next generation...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error: any) {
      console.error(`   ❌ Error generating thumbnail: ${error.message}`);
    }
  }

  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Thumbnail generation complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

generateThumbnailsForRecentVideos()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
