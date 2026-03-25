import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function checkAllVideos() {
  try {
    console.log('📊 VIDEO STATUS REPORT\n');
    console.log('='.repeat(60));

    const allJobs = await db.select().from(jobs);

    const completed = allJobs.filter((j) => j.status === 'completed');
    const withVideo = allJobs.filter((j) => j.videoUrl || j.video_url);
    const uploaded = allJobs.filter((j) => j.youtubeVideoId || j.youtube_video_id);
    const scheduled = allJobs.filter((j) => j.scheduledTime || j.scheduled_time);

    console.log(`\n📈 Overall Stats:`);
    console.log(`   Total Jobs: ${allJobs.length}`);
    console.log(`   Completed: ${completed.length}`);
    console.log(`   With Video Files: ${withVideo.length}`);
    console.log(`   Uploaded to YouTube: ${uploaded.length}`);
    console.log(`   Scheduled (not uploaded): ${scheduled.filter((j) => !j.youtubeVideoId).length}`);

    // Breakdown by status
    console.log(`\n📋 By Status:`);
    const statuses = ['queued', 'processing', 'completed', 'failed'];
    statuses.forEach((status) => {
      const count = allJobs.filter((j) => j.status === status).length;
      console.log(`   ${status}: ${count}`);
    });

    // Videos ready to schedule
    const readyToSchedule = allJobs.filter((j) => {
      const hasVideo = j.videoUrl || j.video_url;
      const notUploaded = !j.youtubeVideoId && !j.youtube_video_id;
      const notScheduled = !j.scheduledTime && !j.scheduled_time;
      const metadata = j.unityMetadata
        ? typeof j.unityMetadata === 'string'
          ? JSON.parse(j.unityMetadata)
          : j.unityMetadata
        : {};
      const notFlagged = !metadata.hasBeenScheduled;

      return j.status === 'completed' && hasVideo && notUploaded && notScheduled && notFlagged;
    });

    console.log(`\n⚡ Ready to Auto-Schedule: ${readyToSchedule.length}`);

    // Show scheduled videos by date
    const scheduledNotUploaded = allJobs.filter(
      (j) => (j.scheduledTime || j.scheduled_time) && !(j.youtubeVideoId || j.youtube_video_id),
    );

    console.log(`\n📅 Scheduled Videos (not yet uploaded): ${scheduledNotUploaded.length}`);

    if (scheduledNotUploaded.length > 0) {
      console.log('\n   Next 10 scheduled uploads:');
      scheduledNotUploaded
        .sort((a, b) => {
          const aTime = new Date(a.scheduledTime || a.scheduled_time || 0);
          const bTime = new Date(b.scheduledTime || b.scheduled_time || 0);
          return aTime.getTime() - bTime.getTime();
        })
        .slice(0, 10)
        .forEach((j) => {
          const time = new Date(j.scheduledTime || j.scheduled_time || '');
          const metadata = j.unityMetadata
            ? typeof j.unityMetadata === 'string'
              ? JSON.parse(j.unityMetadata)
              : j.unityMetadata
            : {};

          console.log(`   ${time.toLocaleString()} - ${j.scriptName}`);
        });
    }

    // Show recently uploaded
    const recentlyUploaded = allJobs
      .filter((j) => j.youtubeVideoId || j.youtube_video_id)
      .sort((a, b) => {
        const aTime = new Date(a.updated_at || a.updatedAt || 0);
        const bTime = new Date(b.updated_at || b.updatedAt || 0);
        return bTime.getTime() - aTime.getTime();
      })
      .slice(0, 5);

    console.log(`\n✅ Recently Uploaded to YouTube: ${recentlyUploaded.length > 0 ? recentlyUploaded.length : 'None'}`);
    if (recentlyUploaded.length > 0) {
      recentlyUploaded.forEach((j) => {
        console.log(`   ${j.scriptName} - https://youtube.com/watch?v=${j.youtubeVideoId || j.youtube_video_id}`);
      });
    }

    console.log('\n' + '='.repeat(60));
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAllVideos()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
