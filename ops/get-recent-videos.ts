import { storage } from './server/storage.js';

async function getRecentVideos() {
  console.log('🎬 Fetching 6 most recent completed videos...\n');

  const allJobs = await storage.listJobs();

  // Filter jobs that have been uploaded to YouTube
  const uploadedJobs = allJobs
    .filter((job) => job.youtubeVideoId)
    .sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    })
    .slice(0, 6);

  console.log(`Found ${uploadedJobs.length} videos uploaded to YouTube:\n`);

  const completedJobs =
    uploadedJobs.length > 0
      ? uploadedJobs
      : allJobs
          .filter((job) => job.status === 'completed')
          .sort((a, b) => {
            const dateA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
            const dateB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
            return dateB - dateA;
          })
          .slice(0, 6);

  console.log(`Found ${completedJobs.length} recent completed videos:\n`);

  for (const job of completedJobs) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📹 Job ID: ${job.id}`);
    console.log(`   Title: ${job.scriptName}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Video: ${job.finalOutputPath || 'N/A'}`);
    console.log(`   Thumbnail: ${job.thumbnailPath || 'N/A'}`);
    console.log(`   YouTube ID: ${job.youtubeVideoId || 'Not uploaded'}`);
    console.log(`   Completed: ${job.completedAt}`);

    if (job.unityMetadata) {
      console.log(`   Topic: ${job.unityMetadata.topic || 'N/A'}`);
      console.log(`   Lyrics preview: ${job.unityMetadata.lyrics?.substring(0, 100) || 'N/A'}...`);
    }

    if (job.generatedPrompts && job.generatedPrompts.length > 0) {
      console.log(`   First prompt: ${job.generatedPrompts[0]?.prompt?.substring(0, 80) || 'N/A'}...`);
    }
    console.log('');
  }

  return completedJobs;
}

getRecentVideos()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
