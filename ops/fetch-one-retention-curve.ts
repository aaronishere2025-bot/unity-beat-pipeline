/**
 * Fetch retention curve for a single video (for testing)
 */

import { youtubeUploadService } from './server/services/youtube-upload-service';
import { db } from './server/db';
import { detailedVideoMetrics } from './shared/schema';
import { eq, sql } from 'drizzle-orm';
import { google } from 'googleapis';

const VIDEO_ID = 'iFLr_LIpevs';

async function fetchOneRetentionCurve() {
  console.log(`📈 Fetching retention curve for video: ${VIDEO_ID}\n`);

  // Check authentication
  const isAuthed = await youtubeUploadService.isAuthenticated();
  if (!isAuthed) {
    console.log('❌ Not authenticated!');
    return;
  }

  // Get video from database
  const videos = await db.select().from(detailedVideoMetrics).where(eq(detailedVideoMetrics.videoId, VIDEO_ID));

  if (videos.length === 0) {
    console.log('❌ Video not found in database');
    return;
  }

  const video = videos[0];
  console.log(`Video: ${video.title}`);
  console.log(`Published: ${video.publishedAt}\n`);

  // Get OAuth client
  const oauth2Client = (youtubeUploadService as any).oauth2Client;
  const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: oauth2Client });
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  // Get video duration
  const videoResponse = await youtube.videos.list({
    part: ['contentDetails'],
    id: [VIDEO_ID],
  });

  const durationISO = videoResponse.data.items?.[0]?.contentDetails?.duration || 'PT0S';
  const durationSeconds = parseDuration(durationISO);

  console.log(`Duration: ${durationSeconds}s`);

  // Fetch retention data
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(video.publishedAt).toISOString().split('T')[0];

  console.log(`Fetching retention curve...`);

  const retentionResponse = await youtubeAnalytics.reports.query({
    ids: 'channel==MINE',
    startDate,
    endDate,
    metrics: 'audienceWatchRatio,relativeRetentionPerformance',
    dimensions: 'elapsedVideoTimeRatio',
    filters: `video==${VIDEO_ID}`,
    sort: 'elapsedVideoTimeRatio',
  });

  if (!retentionResponse.data.rows || retentionResponse.data.rows.length === 0) {
    console.log('⚠️  No retention data available');
    return;
  }

  // Parse retention curve
  const retentionCurve = retentionResponse.data.rows.map((row: any) => ({
    elapsedVideoTimeRatio: parseFloat(row[0]),
    audienceWatchRatio: parseFloat(row[1]),
  }));

  // Convert to second-by-second format
  const secondBySecond = retentionCurve.map((point) => ({
    second: Math.round(point.elapsedVideoTimeRatio * durationSeconds),
    retention: point.audienceWatchRatio * 100,
  }));

  // Find drop-off points
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

  console.log(`✅ Got retention curve (${retentionCurve.length} points)`);
  console.log(`   First 3s: ${first3SecondRetention.toFixed(1)}%`);
  console.log(`   First 60s: ${first60SecondRetention.toFixed(1)}%`);
  console.log(`   Drop-offs: ${dropOffs.length}\n`);

  // Save to database using raw SQL
  console.log('Saving to database...');
  await db.execute(sql`
    UPDATE detailed_video_metrics
    SET
      retention_curve = ${JSON.stringify(secondBySecond)}::jsonb,
      first_60_seconds_retention = ${first60SecondRetention}
    WHERE video_id = ${VIDEO_ID}
  `);

  console.log('✅ Saved!');

  // Verify
  const updated = await db.execute(sql`
    SELECT
      retention_curve IS NOT NULL as has_curve,
      jsonb_array_length(retention_curve) as points
    FROM detailed_video_metrics
    WHERE video_id = ${VIDEO_ID}
  `);

  console.log(`\nVerification:`);
  console.log(`   Curve in DB: ${updated.rows[0].has_curve ? 'YES' : 'NO'}`);
  console.log(`   Curve points: ${updated.rows[0].points}`);
}

function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

fetchOneRetentionCurve()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
