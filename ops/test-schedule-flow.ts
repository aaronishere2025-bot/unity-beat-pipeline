import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, isNull, and } from 'drizzle-orm';

async function testScheduleFlow() {
  console.log('🔍 TESTING AUTO-SCHEDULE FLOW\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Check for unscheduled jobs
    console.log('\n📋 STEP 1: Finding unscheduled jobs...\n');

    const completedJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId), isNull(jobs.scheduledTime)));

    console.log(`Found ${completedJobs.length} completed jobs without YouTube ID or scheduled time`);

    // Step 2: Filter for jobs with videos
    console.log('\n🎥 STEP 2: Filtering jobs with video files...\n');

    const jobsWithVideos = completedJobs.filter((job) => {
      const hasVideo = job.videoUrl || job.video_url;
      return hasVideo;
    });

    console.log(`Found ${jobsWithVideos.length} jobs with video files`);

    if (jobsWithVideos.length > 0) {
      console.log('\nSample jobs with videos:');
      jobsWithVideos.slice(0, 5).forEach((job) => {
        console.log(`  - ${job.scriptName}`);
        console.log(`    ID: ${job.id}`);
        console.log(`    Video: ${job.videoUrl || job.video_url}`);
        console.log(`    Mode: ${job.mode}`);
      });
    }

    // Step 3: Check for hasBeenScheduled flag
    console.log('\n🏷️  STEP 3: Checking hasBeenScheduled flags...\n');

    const unscheduled = jobsWithVideos.filter((job) => {
      const metadata = job.unityMetadata
        ? typeof job.unityMetadata === 'string'
          ? JSON.parse(job.unityMetadata)
          : job.unityMetadata
        : {};
      return metadata.hasBeenScheduled !== true;
    });

    console.log(`Found ${unscheduled.length} jobs without hasBeenScheduled flag`);

    // Step 4: Classify videos
    console.log('\n🎯 STEP 4: Classifying videos...\n');

    let lofiCount = 0;
    let trapCount = 0;

    unscheduled.forEach((job) => {
      const name = (job.scriptName || '').toLowerCase();
      const content = (job.scriptContent || '').toLowerCase();
      const combined = name + ' ' + content;

      if (
        combined.includes('trap') ||
        combined.includes('808') ||
        combined.includes('140 bpm') ||
        combined.includes('heavy bass')
      ) {
        trapCount++;
        console.log(`  🔥 TRAP: ${job.scriptName}`);
      } else {
        lofiCount++;
        console.log(`  🎵 LOFI: ${job.scriptName}`);
      }
    });

    console.log(`\nClassification:`);
    console.log(`  Lofi/Chill: ${lofiCount}`);
    console.log(`  Trap: ${trapCount}`);
    console.log(`  Total: ${lofiCount + trapCount}`);

    // Step 5: Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY\n');
    console.log(`✅ ${unscheduled.length} videos ready to schedule`);
    console.log(`   - ${lofiCount} will go to ChillBeats4Me (12pm & 8pm)`);
    console.log(`   - ${trapCount} will go to Trap Beats INC (2pm & 6pm)`);

    if (unscheduled.length === 0) {
      console.log('\n❌ No videos to schedule. Generate new videos to test.');
    } else {
      console.log('\n✅ Ready to test auto-schedule button!');
    }

    console.log('='.repeat(60) + '\n');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testScheduleFlow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
