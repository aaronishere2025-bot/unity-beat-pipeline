import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, isNull, and } from 'drizzle-orm';
import { existsSync } from 'fs';
import { join } from 'path';

async function fixMissingVideoUrls() {
  try {
    console.log('🔧 Finding jobs with missing video URLs...\n');

    const allJobsFromDb = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId), isNull(jobs.videoUrl)));

    console.log(`Found ${allJobsFromDb.length} completed jobs without video URLs\n`);

    let fixed = 0;
    let notFound = 0;

    for (const job of allJobsFromDb) {
      // Try to find the video file
      let videoPath = null;

      if (job.mode === 'music' || job.mode === 'beats') {
        // Music video path
        const musicPath = join(process.cwd(), 'data', 'videos', 'renders', `music_${job.id}.mp4`);
        if (existsSync(musicPath)) {
          videoPath = `/api/videos/music_${job.id}.mp4`;
        }
      } else if (job.mode === 'unity_kling' || job.mode === 'kling') {
        // Unity/Kling video path
        const unityPath = join(process.cwd(), 'data', 'videos', 'renders', `unity_${job.id}.mp4`);
        if (existsSync(unityPath)) {
          videoPath = `/api/videos/unity_${job.id}.mp4`;
        }
      }

      if (videoPath) {
        console.log(`✅ Fixing job ${job.scriptName}`);
        console.log(`   Video: ${videoPath}`);

        await db.update(jobs).set({ videoUrl: videoPath }).where(eq(jobs.id, job.id));

        fixed++;
      } else {
        console.log(`❌ No video file found for ${job.scriptName} (${job.mode})`);
        notFound++;
      }
    }

    console.log(`\n✅ Fixed ${fixed} jobs`);
    console.log(`❌ ${notFound} jobs have no video files`);
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixMissingVideoUrls()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
