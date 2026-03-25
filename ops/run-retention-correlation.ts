/**
 * Run retention correlation analysis on videos with both generation data and retention curves
 */

import { db } from './server/db';
import { jobs, detailedVideoMetrics } from './shared/schema';
import { eq, isNotNull, sql } from 'drizzle-orm';
import { retentionClipCorrelator } from './server/services/retention-clip-correlator';
import type { VideoMetadata, RetentionDataPoint } from './server/services/retention-clip-correlator';

async function runRetentionCorrelation() {
  console.log('🎯 RETENTION CORRELATION ANALYSIS');
  console.log('==================================\n');

  // Get jobs with YouTube video IDs
  const jobsWithVideos = await db.select().from(jobs).where(isNotNull(jobs.youtubeVideoId));

  console.log(`Found ${jobsWithVideos.length} jobs with YouTube uploads\n`);

  let analyzed = 0;
  let totalToxicCombos = 0;

  for (const job of jobsWithVideos) {
    if (!job.youtubeVideoId) continue;

    // Check if video has retention curve (use raw SQL to read JSONB)
    const metricsResult = await db.execute(sql`
      SELECT
        video_id,
        title,
        average_view_percentage,
        retention_curve
      FROM detailed_video_metrics
      WHERE video_id = ${job.youtubeVideoId}
    `);

    if (metricsResult.rows.length === 0 || !metricsResult.rows[0].retention_curve) {
      console.log(`⏭️  Skipping ${job.scriptName} - no retention curve`);
      continue;
    }

    const metrics = metricsResult.rows[0] as any;

    // Check if job has generation metadata
    if (!job.completedClips || job.completedClips.length === 0) {
      console.log(`⏭️  Skipping ${job.scriptName} - no generation data`);
      continue;
    }

    console.log(`\n📊 Analyzing: ${job.scriptName}`);
    console.log(`   Video ID: ${job.youtubeVideoId}`);
    console.log(`   Clips: ${job.completedClips.length}`);
    console.log(`   Retention: ${Number(metrics.average_view_percentage || 0).toFixed(1)}%`);

    try {
      // Parse retention curve (already parsed from JSONB)
      const retentionData: RetentionDataPoint[] = metrics.retention_curve;

      if (!Array.isArray(retentionData)) {
        console.log(`   ⚠️  Invalid retention curve format`);
        continue;
      }

      console.log(`   Retention points: ${retentionData.length}`);

      // Build metadata from job
      const metadata: VideoMetadata = {
        videoId: job.youtubeVideoId,
        title: job.scriptName || '',
        clips: (job.completedClips as any[]).map((clip: any, idx: number) => ({
          clipIndex: idx,
          startTime: clip.startTime || 0,
          endTime: clip.endTime || 0,
          styleCategory: clip.styleCategory || clip.style || 'unknown',
          audioStyle: job.musicStyle || 'unknown',
          prompt: clip.prompt || '',
        })),
        audioStyle: job.musicStyle || 'unknown',
        totalDuration: retentionData[retentionData.length - 1]?.second || 0,
      };

      console.log(`   Metadata prepared - running analysis...`);

      // Run correlation analysis
      const toxicCombos = await retentionClipCorrelator.analyzeDropOffsWithReactionLag(
        job.youtubeVideoId,
        retentionData,
        metadata,
      );

      console.log(`   ✅ Detected ${toxicCombos.length} toxic combos`);
      totalToxicCombos += toxicCombos.length;
      analyzed++;

      // Display toxic combos
      if (toxicCombos.length > 0) {
        console.log(`\n   ☠️  TOXIC COMBOS FOUND:`);
        toxicCombos.forEach((combo, idx) => {
          console.log(`   ${idx + 1}. ${combo.styleCategory} + ${combo.audioStyle}`);
          console.log(`      Drop: ${combo.dropPercentage.toFixed(1)}% at ${combo.dropSecond}s`);
          console.log(`      Reason: ${combo.reason}`);
        });
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
    }
  }

  console.log(`\n\n═══════════════════════════════════════════════`);
  console.log(`📊 CORRELATION ANALYSIS SUMMARY`);
  console.log(`═══════════════════════════════════════════════\n`);
  console.log(`Videos analyzed: ${analyzed}`);
  console.log(`Total toxic combos detected: ${totalToxicCombos}`);
  console.log();

  if (totalToxicCombos > 0) {
    console.log('✅ Toxic combos saved to database!');
    console.log('   Future generations will automatically avoid these patterns.');
    console.log('\nRun: npx tsx test-quick-status.ts to see updated analytics\n');
  } else if (analyzed === 0) {
    console.log('⚠️  No videos ready for analysis yet');
    console.log('   Generate more videos and wait 48h for YouTube retention data\n');
  } else {
    console.log('✅ Analysis complete - no significant drop-offs detected\n');
  }
}

runRetentionCorrelation()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
