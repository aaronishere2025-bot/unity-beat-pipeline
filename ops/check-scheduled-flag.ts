import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, isNull, and } from 'drizzle-orm';

async function checkScheduledFlag() {
  try {
    console.log('🔍 Checking hasBeenScheduled flags...\n');

    const allJobsFromDb = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId), isNull(jobs.scheduledTime)));

    console.log(`Found ${allJobsFromDb.length} completed jobs without YouTube ID or scheduled time`);

    // Check how many have hasBeenScheduled flag
    let hasFlag = 0;
    let noFlag = 0;
    let hasVideo = 0;

    for (const job of allJobsFromDb) {
      const metadata = job.unityMetadata
        ? typeof job.unityMetadata === 'string'
          ? JSON.parse(job.unityMetadata)
          : job.unityMetadata
        : {};

      const hasVideoUrl = job.videoUrl || job.video_url;
      if (hasVideoUrl) hasVideo++;

      if (metadata.hasBeenScheduled === true) {
        hasFlag++;
      } else {
        noFlag++;
        if (hasVideoUrl) {
          console.log(`  - ${job.id} | ${job.scriptName} | hasVideo: ${!!hasVideoUrl} | hasBeenScheduled: false`);
        }
      }
    }

    console.log(`\nResults:`);
    console.log(`  With hasBeenScheduled=true: ${hasFlag}`);
    console.log(`  Without flag (should be schedulable): ${noFlag}`);
    console.log(`  Total with video URL: ${hasVideo}`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkScheduledFlag()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
