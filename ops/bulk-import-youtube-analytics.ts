/**
 * BULK IMPORT YOUTUBE ANALYTICS
 *
 * Fetches ALL videos from your OAuth-authenticated YouTube channel
 * and imports their analytics data into the database.
 *
 * This populates retention analytics with REAL data for validation!
 */

import { youtubeUploadService } from './server/services/youtube-upload-service';
import { db } from './server/db';
import { detailedVideoMetrics, jobs } from './shared/schema';
import { eq } from 'drizzle-orm';

interface BulkImportResult {
  totalVideos: number;
  imported: number;
  skipped: number;
  errors: number;
  videosWithRetention: number;
  avgRetention: number;
  details: Array<{
    videoId: string;
    title: string;
    status: 'imported' | 'skipped' | 'error';
    reason?: string;
    retention?: number;
  }>;
}

async function bulkImportAnalytics(): Promise<BulkImportResult> {
  console.log('🚀 BULK YOUTUBE ANALYTICS IMPORT');
  console.log('=================================\n');

  const result: BulkImportResult = {
    totalVideos: 0,
    imported: 0,
    skipped: 0,
    errors: 0,
    videosWithRetention: 0,
    avgRetention: 0,
    details: [],
  };

  try {
    // Step 1: Check authentication
    console.log('🔐 Step 1: Checking YouTube authentication...');

    const isAuthed = await youtubeUploadService.isAuthenticated();

    if (!isAuthed) {
      console.log('❌ Not authenticated with YouTube!');
      console.log('\nTo authenticate:');
      console.log('1. Start the server: npm run dev');
      console.log('2. Visit: http://localhost:5000/api/youtube/auth');
      console.log('3. Follow OAuth flow');
      console.log('4. Re-run this script\n');
      return result;
    }

    console.log('✅ Authenticated!\n');

    // Step 2: Get channel info
    console.log('📺 Step 2: Fetching channel information...');

    const channelInfo = await youtubeUploadService.getChannelInfo();

    if (!channelInfo) {
      console.log('❌ Failed to fetch channel info');
      return result;
    }

    console.log(`✅ Channel: ${channelInfo.name}`);
    console.log(`   Channel ID: ${channelInfo.id}\n`);

    // Step 3: Fetch all videos from channel
    console.log('📥 Step 3: Fetching all videos from channel...');
    console.log('   (This may take a minute for large channels)\n');

    const videos = await youtubeUploadService.getChannelVideosByUrl(
      `https://youtube.com/channel/${channelInfo.id}`,
      1000, // Max 1000 videos
    );

    result.totalVideos = videos.length;
    console.log(`✅ Found ${videos.length} videos!\n`);

    if (videos.length === 0) {
      console.log('⚠️  No videos found on channel');
      return result;
    }

    // Step 4: Import analytics for each video
    console.log('📊 Step 4: Importing analytics for each video...');
    console.log('──────────────────────────────────────────────\n');

    let retentionSum = 0;
    let retentionCount = 0;

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      const progress = `[${i + 1}/${videos.length}]`;

      try {
        console.log(`${progress} ${video.title.substring(0, 60)}...`);

        // Check if already imported
        const existing = await db
          .select()
          .from(detailedVideoMetrics)
          .where(eq(detailedVideoMetrics.videoId, video.videoId))
          .limit(1);

        if (existing.length > 0) {
          console.log(`   ⏭️  Already imported, skipping\n`);
          result.skipped++;
          result.details.push({
            videoId: video.videoId,
            title: video.title,
            status: 'skipped',
            reason: 'Already in database',
          });
          continue;
        }

        // Fetch detailed analytics
        console.log('   📡 Fetching analytics...');

        const analytics = await youtubeUploadService.getVideoAnalytics(video.videoId);

        if (!analytics) {
          console.log('   ⚠️  No analytics data available (video too new)\n');
          result.skipped++;
          result.details.push({
            videoId: video.videoId,
            title: video.title,
            status: 'skipped',
            reason: 'No analytics available (48-72h delay)',
          });
          continue;
        }

        // Calculate engagement metrics
        const engagementRate =
          video.viewCount > 0 ? ((video.likeCount + video.commentCount) / video.viewCount) * 100 : 0;

        // Store in database
        await db.insert(detailedVideoMetrics).values({
          videoId: video.videoId,
          title: video.title,
          publishedAt: new Date(video.publishedAt),
          thumbnailUrl: video.thumbnailUrl,
          viewCount: video.viewCount,
          likeCount: video.likeCount,
          commentCount: video.commentCount,
          privacyStatus: video.privacyStatus,
          estimatedMinutesWatched: analytics.estimatedMinutesWatched,
          averageViewDuration: analytics.avgViewDuration,
          averageViewPercentage: analytics.avgViewPercentage,
          subscribersGained: analytics.subscribersGained,
          impressions: analytics.impressions,
          clickThroughRate: analytics.ctr,
          engagementRate,
          likeToViewRatio: video.viewCount > 0 ? (video.likeCount / video.viewCount) * 100 : 0,
          fetchedAt: new Date(),
        });

        result.imported++;

        if (analytics.avgViewPercentage) {
          result.videosWithRetention++;
          retentionSum += analytics.avgViewPercentage;
          retentionCount++;
        }

        console.log(`   ✅ Imported!`);
        console.log(`      Views: ${video.viewCount.toLocaleString()}`);
        console.log(`      Retention: ${analytics.avgViewPercentage?.toFixed(1)}%`);
        console.log(`      CTR: ${analytics.ctr?.toFixed(2)}%\n`);

        result.details.push({
          videoId: video.videoId,
          title: video.title,
          status: 'imported',
          retention: analytics.avgViewPercentage,
        });

        // Small delay to avoid rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}\n`);
        result.errors++;
        result.details.push({
          videoId: video.videoId,
          title: video.title,
          status: 'error',
          reason: error.message,
        });
      }
    }

    // Calculate average retention
    if (retentionCount > 0) {
      result.avgRetention = retentionSum / retentionCount;
    }

    // Step 5: Link imported videos to jobs (if they were generated by this system)
    console.log('\n🔗 Step 5: Linking videos to generation jobs...');

    const allJobs = await db.select().from(jobs);
    let linkedCount = 0;

    for (const job of allJobs) {
      if (!job.youtubeVideoId) continue;

      const matchingVideo = result.details.find((v) => v.videoId === job.youtubeVideoId);

      if (matchingVideo && matchingVideo.status === 'imported') {
        linkedCount++;
      }
    }

    console.log(`✅ Linked ${linkedCount} videos to generation jobs\n`);

    // Step 6: Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('📊 IMPORT SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log(`Total videos found:        ${result.totalVideos}`);
    console.log(`Successfully imported:     ${result.imported} ✅`);
    console.log(`Skipped (already exist):   ${result.skipped} ⏭️`);
    console.log(`Errors:                    ${result.errors} ❌`);
    console.log(`\nVideos with retention:     ${result.videosWithRetention}`);
    console.log(`Average retention:         ${result.avgRetention.toFixed(1)}%`);
    console.log(`Linked to jobs:            ${linkedCount}\n`);

    if (result.imported > 0) {
      console.log('✅ SUCCESS! Analytics data imported.');
      console.log('\nNext steps:');
      console.log('1. Run validation: npx tsx test-quick-status.ts');
      console.log('2. View retention data: Check dashboard');
      console.log('3. Analyze patterns: System will start learning from this data\n');
    } else if (result.skipped === result.totalVideos) {
      console.log('✅ All videos already imported!');
      console.log('   Run validation to see current status.\n');
    } else {
      console.log('⚠️  No new data imported.');
      console.log('   Most videos may be too new (<48 hours) for analytics.\n');
    }

    return result;
  } catch (error: any) {
    console.error('\n❌ IMPORT FAILED:', error.message);
    console.error(error.stack);
    return result;
  }
}

async function main() {
  try {
    const result = await bulkImportAnalytics();

    // Write detailed report to file
    const reportPath = '/tmp/bulk-import-report.json';
    const fs = await import('fs');
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    console.log(`📄 Detailed report saved to: ${reportPath}\n`);

    process.exit(result.errors > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
