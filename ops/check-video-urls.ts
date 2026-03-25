import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, isNull, and } from 'drizzle-orm';

async function checkVideoUrls() {
  try {
    console.log('🔍 Checking video URLs...\n');

    const allJobsFromDb = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId), isNull(jobs.scheduledTime)));

    console.log(`Found ${allJobsFromDb.length} completed jobs without YouTube ID or scheduled time\n`);

    for (const job of allJobsFromDb.slice(0, 15)) {
      console.log(`Job: ${job.id}`);
      console.log(`  Name: ${job.scriptName}`);
      console.log(`  Mode: ${job.mode}`);
      console.log(`  videoUrl: ${job.videoUrl || 'NULL'}`);
      console.log(`  video_url: ${job.video_url || 'NULL'}`);

      const metadata = job.unityMetadata
        ? typeof job.unityMetadata === 'string'
          ? JSON.parse(job.unityMetadata)
          : job.unityMetadata
        : {};
      console.log(`  hasBeenScheduled: ${metadata.hasBeenScheduled || 'false'}`);
      console.log('');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkVideoUrls()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
