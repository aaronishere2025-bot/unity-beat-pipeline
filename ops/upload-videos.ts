import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { existsSync } from 'fs';
import { join } from 'path';

async function uploadVideos() {
  const jobIds = [
    '8133eae9-ab9f-4961-b0a2-02a82abe7a5b', // Pope
    'f0536869-cc2c-4d5b-9a70-2bd2c755406a', // Mad Jack
  ];

  const { youtubeUploadService } = await import('./server/services/youtube-upload-service.js');
  const { youtubeMetadataGenerator } = await import('./server/services/youtube-metadata-generator.js');

  // Check authentication
  const isAuth = await youtubeUploadService.isAuthenticated();
  if (!isAuth) {
    console.log('❌ YouTube not authenticated. Please authenticate first.');
    console.log('Visit: http://localhost:8080 and connect YouTube from settings');
    process.exit(1);
  }

  console.log('✅ YouTube authenticated\n');

  for (const jobId of jobIds) {
    console.log(`\n${'='.repeat(80)}`);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));

    if (!job) {
      console.log(`❌ Job ${jobId} not found`);
      continue;
    }

    console.log(`📹 ${job.scriptName}`);

    // Find video file
    let videoPath: string | null = null;

    if (job.videoUrl) {
      const filename = job.videoUrl.replace('/api/videos/', '');
      videoPath = join(process.cwd(), 'data', 'videos', 'renders', filename);

      if (!existsSync(videoPath)) {
        console.log(`❌ Video file not found: ${videoPath}`);
        continue;
      }
    }

    if (!videoPath) {
      console.log(`❌ No video URL in job`);
      continue;
    }

    console.log(`📁 Video file: ${videoPath}`);

    // Generate metadata
    const unityMeta = job.unityMetadata as any;
    const metadata = await youtubeMetadataGenerator.generateMetadata({
      topic: unityMeta?.topic || job.scriptName || 'Historical Story',
      hook: unityMeta?.hook,
      researchSummary: unityMeta?.researchSummary,
      scriptContent: job.scriptContent,
    });

    console.log(`📝 Title: ${metadata.title}`);
    console.log(`📝 Description length: ${metadata.description.length} chars`);
    console.log(`📝 Tags: ${metadata.tags.join(', ')}`);

    // Generate thumbnail if not exists
    let thumbnailPath = null;
    if (job.thumbnailUrl) {
      thumbnailPath = job.thumbnailUrl.replace('/api/thumbnails/', '');
      thumbnailPath = join(process.cwd(), 'data', 'thumbnails', thumbnailPath);
    }

    console.log(`\n📤 Uploading to YouTube...`);

    try {
      const result = await youtubeUploadService.uploadVideoWithThumbnail(
        videoPath,
        {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          privacyStatus: 'public',
          categoryId: '27', // Education
        },
        thumbnailPath || undefined,
      );

      console.log(`✅ Uploaded successfully!`);
      console.log(`   Video ID: ${result.videoId}`);
      console.log(`   URL: https://youtube.com/watch?v=${result.videoId}`);

      // Update job in database
      await db
        .update(jobs)
        .set({
          youtubeVideoId: result.videoId,
          uploadedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      console.log(`   ✅ Database updated`);
    } catch (error: any) {
      console.log(`❌ Upload failed: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(80)}`);
  console.log('✅ Upload process complete!\n');
  process.exit(0);
}

uploadVideos().catch(console.error);
