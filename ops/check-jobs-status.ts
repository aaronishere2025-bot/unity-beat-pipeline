import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, isNull, and } from 'drizzle-orm';

async function checkJobs() {
  try {
    console.log('🔍 Checking jobs in database...\n');

    // Total jobs
    const allJobs = await db.select().from(jobs);
    console.log(`Total jobs: ${allJobs.length}`);

    // Completed jobs
    const completed = allJobs.filter((j) => j.status === 'completed');
    console.log(`Completed jobs: ${completed.length}`);

    // With video URL
    const withVideo = allJobs.filter((j) => j.videoUrl || j.video_url);
    console.log(`Jobs with video: ${withVideo.length}`);

    // Not uploaded yet (no YouTube ID)
    const notUploaded = allJobs.filter((j) => !j.youtubeVideoId && !j.youtube_video_id);
    console.log(`Not uploaded to YouTube: ${notUploaded.length}`);

    // Not scheduled yet
    const notScheduled = allJobs.filter((j) => !j.scheduledTime && !j.scheduled_time);
    console.log(`Not scheduled: ${notScheduled.length}`);

    // The actual query from auto-schedule
    const shouldBeScheduled = allJobs.filter(
      (j) =>
        j.status === 'completed' &&
        !j.youtubeVideoId &&
        !j.youtube_video_id &&
        !j.scheduledTime &&
        !j.scheduled_time &&
        (j.videoUrl || j.video_url),
    );

    console.log(`\n✅ Should be auto-schedulable: ${shouldBeScheduled.length}\n`);

    if (shouldBeScheduled.length > 0) {
      console.log('Sample jobs that should be scheduled:');
      shouldBeScheduled.slice(0, 5).forEach((j) => {
        console.log(
          `  - ${j.id} | ${j.scriptName || j.script_name} | ${j.mode} | video: ${!!(j.videoUrl || j.video_url)}`,
        );
      });
    } else {
      console.log('\n❌ No jobs meet the criteria. Breakdown:');
      console.log('\nCompleted jobs with videos but not scheduled:');
      const partial = allJobs.filter((j) => j.status === 'completed' && (j.videoUrl || j.video_url));
      console.log(`  Found: ${partial.length}`);

      if (partial.length > 0) {
        partial.slice(0, 5).forEach((j) => {
          console.log(`  - ${j.id}`);
          console.log(`    Status: ${j.status}`);
          console.log(`    Video URL: ${!!(j.videoUrl || j.video_url)}`);
          console.log(`    YouTube ID: ${j.youtubeVideoId || j.youtube_video_id || 'null'}`);
          console.log(`    Scheduled: ${j.scheduledTime || j.scheduled_time || 'null'}`);
          console.log(`    Mode: ${j.mode}`);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkJobs()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
