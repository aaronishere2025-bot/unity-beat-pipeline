import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { isNull } from 'drizzle-orm';

async function testFrontendData() {
  console.log('🔍 Testing Frontend Data Format\n');

  // Get a few scheduled jobs
  const scheduledJobs = await db.select().from(jobs).where(isNull(jobs.youtubeVideoId)).limit(5);

  console.log('Sample jobs that frontend will receive:\n');

  scheduledJobs.forEach((job, i) => {
    console.log(`Job ${i + 1}:`);
    console.log(`  scriptName: ${job.scriptName}`);
    console.log(`  scheduled_time (DB): ${job.scheduledTime}`);
    console.log(`  Has video: ${!!(job.videoUrl || job.video_url)}`);

    // Simulate frontend mapping
    const frontendJob = {
      scheduledTime: job.scheduledTime || job.scheduled_time,
      scriptName: job.scriptName || job.script_name,
    };

    console.log(`  scheduledTime (frontend will see): ${frontendJob.scheduledTime}`);

    if (frontendJob.scheduledTime) {
      const date = new Date(frontendJob.scheduledTime);
      console.log(`  Date: ${date.toLocaleDateString()}`);
      console.log(`  Time: ${date.toLocaleTimeString()}`);
    }
    console.log('');
  });

  // Check today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`\n📅 Checking for videos on ${today.toLocaleDateString()}...\n`);

  const todayJobs = scheduledJobs.filter((job) => {
    const schedTime = job.scheduledTime || job.scheduled_time;
    if (!schedTime) return false;

    const jobDate = new Date(schedTime);
    jobDate.setHours(0, 0, 0, 0);

    return jobDate.getTime() === today.getTime();
  });

  console.log(`Found ${todayJobs.length} videos for today`);
  todayJobs.forEach((job) => {
    console.log(
      `  - ${job.scriptName} at ${new Date(job.scheduledTime || job.scheduled_time || '').toLocaleTimeString()}`,
    );
  });
}

testFrontendData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
