import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, isNull, and } from 'drizzle-orm';
import { existsSync } from 'fs';
import { join } from 'path';

async function markIncompleteJobsFailed() {
  try {
    console.log('🔧 Finding incomplete jobs...\n');

    const allJobsFromDb = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId), isNull(jobs.videoUrl)));

    console.log(`Found ${allJobsFromDb.length} jobs marked completed without video URLs\n`);

    let marked = 0;

    for (const job of allJobsFromDb) {
      // Check if video file actually exists
      let videoExists = false;

      if (job.mode === 'music' || job.mode === 'beats') {
        const musicPath = join(process.cwd(), 'data', 'videos', 'renders', `music_${job.id}.mp4`);
        videoExists = existsSync(musicPath);
      } else if (job.mode === 'unity_kling' || job.mode === 'kling') {
        const unityPath = join(process.cwd(), 'data', 'videos', 'renders', `unity_${job.id}.mp4`);
        videoExists = existsSync(unityPath);
      }

      if (!videoExists) {
        console.log(`❌ Marking as failed: ${job.scriptName}`);

        await db
          .update(jobs)
          .set({
            status: 'failed',
            error: 'Video file not generated',
          })
          .where(eq(jobs.id, job.id));

        marked++;
      }
    }

    console.log(`\n✅ Marked ${marked} jobs as failed`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

markIncompleteJobsFailed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
