/**
 * FETCH RETENTION CURVES
 *
 * Gets second-by-second retention data for all videos in the database.
 * This is the KEY data for validating retention analytics!
 */

import { youtubeUploadService } from './server/services/youtube-upload-service';
import { db } from './server/db';
import { detailedVideoMetrics } from './shared/schema';
import { eq } from 'drizzle-orm';
import { google } from 'googleapis';

interface RetentionCurve {
  elapsedVideoTimeRatio: number; // 0-1 (position in video)
  audienceWatchRatio: number; // Retention percentage at that point
}

interface RetentionResult {
  videoId: string;
  title: string;
  duration: number;
  retentionCurve: RetentionCurve[];
  secondBySecondRetention: Array<{ second: number; retention: number }>;
  dropOffPoints: Array<{ second: number; dropPercentage: number }>;
  first3SecondRetention: number;
  first60SecondRetention: number;
}

async function fetchRetentionCurves(): Promise<void> {
  console.log('📈 FETCH RETENTION CURVES');
  console.log('=========================\n');

  try {
    // Check authentication
    const isAuthed = await youtubeUploadService.isAuthenticated();

    if (!isAuthed) {
      console.log('❌ Not authenticated! Run bulk-import-youtube-analytics.ts first.');
      return;
    }

    console.log('✅ Authenticated\n');

    // Get all videos from database
    console.log('📊 Fetching videos from database...');

    const allVideos = await db.select().from(detailedVideoMetrics);

    console.log(`Found ${allVideos.length} videos\n`);

    if (allVideos.length === 0) {
      console.log('⚠️  No videos in database. Run bulk-import-youtube-analytics.ts first.');
      return;
    }

    // Get OAuth client for direct API calls
    const oauth2Client = (youtubeUploadService as any).oauth2Client;

    if (!oauth2Client) {
      console.log('❌ OAuth client not available');
      return;
    }

    const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });
    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    console.log('🔍 Fetching retention curves...');
    console.log('─────────────────────────────────\n');

    let successCount = 0;
    let noDataCount = 0;

    for (let i = 0; i < allVideos.length; i++) {
      const video = allVideos[i];
      const progress = `[${i + 1}/${allVideos.length}]`;

      console.log(`${progress} ${video.title.substring(0, 50)}...`);

      try {
        // Get video duration first
        const videoResponse = await youtube.videos.list({
          part: ['contentDetails'],
          id: [video.videoId],
        });

        const durationISO = videoResponse.data.items?.[0]?.contentDetails?.duration || 'PT0S';
        const durationSeconds = parseDuration(durationISO);

        console.log(`   Duration: ${durationSeconds}s`);

        // Fetch retention data from YouTube Analytics
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(video.publishedAt).toISOString().split('T')[0];

        console.log(`   Fetching retention curve...`);

        // YouTube Analytics API for audience retention
        // Note: elapsedVideoTimeRatio is 0-1 (percentage through video)
        const retentionResponse = await youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate,
          endDate,
          metrics: 'audienceWatchRatio,relativeRetentionPerformance',
          dimensions: 'elapsedVideoTimeRatio',
          filters: `video==${video.videoId}`,
          sort: 'elapsedVideoTimeRatio',
        });

        if (!retentionResponse.data.rows || retentionResponse.data.rows.length === 0) {
          console.log(`   ⚠️  No retention data available\n`);
          noDataCount++;
          continue;
        }

        // Parse retention curve
        const retentionCurve: RetentionCurve[] = retentionResponse.data.rows.map((row: any) => ({
          elapsedVideoTimeRatio: parseFloat(row[0]),
          audienceWatchRatio: parseFloat(row[1]),
        }));

        // Convert to second-by-second format
        const secondBySecond = retentionCurve.map((point) => ({
          second: Math.round(point.elapsedVideoTimeRatio * durationSeconds),
          retention: point.audienceWatchRatio * 100, // Convert to percentage
        }));

        // Find drop-off points (>5% drop between consecutive points)
        const dropOffs = [];
        for (let j = 1; j < secondBySecond.length; j++) {
          const prev = secondBySecond[j - 1];
          const curr = secondBySecond[j];
          const drop = prev.retention - curr.retention;

          if (drop > 5) {
            dropOffs.push({
              second: curr.second,
              dropPercentage: drop,
            });
          }
        }

        // Calculate key metrics
        const first3Sec = secondBySecond.find((p) => p.second >= 3);
        const first60Sec = secondBySecond.find((p) => p.second >= 60);

        const first3SecondRetention = first3Sec?.retention || 0;
        const first60SecondRetention = first60Sec?.retention || 0;

        console.log(`   ✅ Got retention curve (${retentionCurve.length} points)`);
        console.log(`      First 3s: ${first3SecondRetention.toFixed(1)}%`);
        console.log(`      First 60s: ${first60SecondRetention.toFixed(1)}%`);
        console.log(`      Drop-offs: ${dropOffs.length}\n`);

        // Store retention curve in database
        await db
          .update(detailedVideoMetrics)
          .set({
            retentionCurve: secondBySecond as any,
            first60SecondsRetention: first60SecondRetention,
          })
          .where(eq(detailedVideoMetrics.videoId, video.videoId));

        successCount++;

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}\n`);

        // If quota exceeded, stop
        if (error.message.includes('quota')) {
          console.log('\n⚠️  YouTube API quota exceeded. Try again tomorrow.');
          break;
        }
      }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════');
    console.log('📊 RETENTION CURVE IMPORT SUMMARY');
    console.log('═══════════════════════════════════════════════\n');

    console.log(`Total videos:              ${allVideos.length}`);
    console.log(`Retention curves fetched:  ${successCount} ✅`);
    console.log(`No data available:         ${noDataCount} ⚠️`);
    console.log();

    if (successCount > 0) {
      console.log('✅ SUCCESS! Retention curves imported.');
      console.log('\nNow you can:');
      console.log('1. Run: npx tsx test-quick-status.ts');
      console.log('2. Run: npx tsx test-retention-analytics-proof.ts');
      console.log('3. See second-by-second analytics in action!\n');
    } else {
      console.log('⚠️  No retention curves fetched.');
      console.log('   Videos may be too new or not eligible for retention data.\n');
    }
  } catch (error: any) {
    console.error('\n❌ FAILED:', error.message);
    console.error(error.stack);
  }
}

// Helper: Parse ISO 8601 duration to seconds
function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

async function main() {
  try {
    await fetchRetentionCurves();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
