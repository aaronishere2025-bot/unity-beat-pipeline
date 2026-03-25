/**
 * Check which generated videos have retention curves
 */

import { db } from './server/db';
import { jobs, detailedVideoMetrics } from './shared/schema';
import { eq, isNotNull } from 'drizzle-orm';

async function checkVideosWithRetention() {
  console.log('🔍 Checking generated videos with retention curves...\n');

  // Get all jobs that have YouTube video IDs
  const allJobs = await db.select().from(jobs).where(isNotNull(jobs.youtubeVideoId));

  console.log(`Found ${allJobs.length} jobs with YouTube uploads\n`);

  let videosWithCurves = 0;
  let videosWithGenData = 0;

  for (const job of allJobs) {
    if (!job.youtubeVideoId) continue;

    // Check if this video has retention curve
    const metrics = await db
      .select()
      .from(detailedVideoMetrics)
      .where(eq(detailedVideoMetrics.videoId, job.youtubeVideoId))
      .limit(1);

    const hasCurve = metrics.length > 0 && metrics[0].retentionCurve !== null;
    const hasGenData = job.completedClips && job.completedClips.length > 0;

    if (hasCurve) videosWithCurves++;
    if (hasGenData) videosWithGenData++;

    if (hasCurve && hasGenData) {
      console.log(`✅ READY FOR ANALYSIS:`);
      console.log(`   Job: ${job.id}`);
      console.log(`   Video: ${job.youtubeVideoId}`);
      console.log(`   Title: ${job.scriptName}`);
      console.log(`   Clips: ${job.completedClips?.length || 0}`);
      const retention = metrics[0].averageViewPercentage;
      console.log(`   Retention: ${retention ? Number(retention).toFixed(1) : 'N/A'}%`);
      console.log();
    }
  }

  console.log('\n📊 SUMMARY');
  console.log('──────────');
  console.log(`Jobs with YouTube uploads: ${allJobs.length}`);
  console.log(`Videos with retention curves: ${videosWithCurves}`);
  console.log(`Videos with generation data: ${videosWithGenData}`);
  console.log(`Videos ready for correlation: ${videosWithCurves > 0 && videosWithGenData > 0 ? 'Yes' : 'No'}`);
  console.log();
}

checkVideosWithRetention()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
