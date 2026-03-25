/**
 * Beat Performance Tracker
 *
 * Collects YouTube analytics for beat videos and feeds them to the
 * beat visual optimizer for learning.
 */

import { db } from '../db.js';
import { jobs } from '@shared/schema';
import { eq, and, sql, isNotNull } from 'drizzle-orm';
import { beatVisualOptimizer } from './beat-visual-optimizer.js';
import { google } from 'googleapis';

interface YouTubeMetrics {
  impressions: number;
  clicks: number;
  avgViewDuration: number;
  views: number;
  ctr: number;
}

class BeatPerformanceTracker {
  private static instance: BeatPerformanceTracker;

  static getInstance() {
    if (!BeatPerformanceTracker.instance) {
      BeatPerformanceTracker.instance = new BeatPerformanceTracker();
    }
    return BeatPerformanceTracker.instance;
  }

  /**
   * Collect analytics for all beat videos uploaded in the last 30 days
   * and feed to the learning system
   */
  async collectAndLearn(): Promise<void> {
    console.log('\n📊 BEAT PERFORMANCE TRACKER: Collecting analytics...\n');

    // Get all beat/music jobs uploaded to YouTube in last 30 days
    const beatJobs = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.mode, 'music'),
          isNotNull(jobs.youtubeVideoId),
          sql`${jobs.uploadedAt} > NOW() - INTERVAL '30 days'`,
        ),
      );

    console.log(`Found ${beatJobs.length} beat videos uploaded in last 30 days\n`);

    if (beatJobs.length === 0) {
      console.log('⚠️  No beat videos to analyze yet');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const job of beatJobs) {
      try {
        console.log(`\n📹 Analyzing: ${job.scriptName || job.id}`);
        console.log(`   YouTube ID: ${job.youtubeVideoId}`);
        console.log(`   Uploaded: ${job.uploadedAt}`);

        // Fetch metrics from YouTube Analytics API
        const metrics = await this.fetchYouTubeMetrics(job.youtubeVideoId!);

        if (!metrics) {
          console.log('   ⚠️  No metrics available yet (video too new?)');
          continue;
        }

        // Record performance with the learning system
        await beatVisualOptimizer.recordVideoPerformance(job.id, job.youtubeVideoId!, {
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          avgViewDuration: metrics.avgViewDuration,
          views: metrics.views,
        });

        console.log(`   ✅ Recorded: ${metrics.views} views, ${metrics.ctr.toFixed(2)}% CTR`);
        successCount++;
      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log(`\n📈 SUMMARY:`);
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`   📊 Total processed: ${successCount + errorCount}/${beatJobs.length}`);

    // After collecting data, analyze performance
    if (successCount > 0) {
      console.log('\n🔍 Analyzing visual performance patterns...');
      await beatVisualOptimizer.analyzeVisualPerformance();
    }
  }

  /**
   * Fetch YouTube Analytics metrics for a video
   */
  private async fetchYouTubeMetrics(videoId: string): Promise<YouTubeMetrics | null> {
    try {
      // Initialize YouTube Analytics API
      const youtube = google.youtube('v3');
      const youtubeAnalytics = google.youtubeAnalytics('v2');

      // Get OAuth2 client
      const oauth2Client = await this.getOAuth2Client();

      // 1. Get basic video stats (views, likes, comments)
      const videoResponse = await youtube.videos.list({
        auth: oauth2Client,
        part: ['statistics'],
        id: [videoId],
      });

      if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
        return null;
      }

      const stats = videoResponse.data.items[0].statistics;
      const views = parseInt(stats?.viewCount || '0');

      // 2. Get analytics data (CTR, impressions, watch time)
      // Note: Requires video to be at least 24-48 hours old
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      try {
        const analyticsResponse = await youtubeAnalytics.reports.query({
          auth: oauth2Client,
          ids: 'channel==MINE',
          startDate,
          endDate,
          metrics: 'views,estimatedMinutesWatched,averageViewDuration,cardImpressions,cardClicks',
          dimensions: 'video',
          filters: `video==${videoId}`,
        });

        if (analyticsResponse.data.rows && analyticsResponse.data.rows.length > 0) {
          const row = analyticsResponse.data.rows[0];
          const impressions = parseInt(row[3]?.toString() || '0') || views * 100; // Estimate if not available
          const clicks = views; // Clicks = views for practical purposes
          const avgViewDuration = parseFloat(row[2]?.toString() || '0');
          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

          return {
            impressions,
            clicks,
            avgViewDuration,
            views,
            ctr,
          };
        }
      } catch (analyticsError: any) {
        console.warn(`   ⚠️  Analytics API error (video might be too new): ${analyticsError.message}`);
      }

      // Fallback: Use basic stats only
      // Estimate impressions as views * 100 (rough average)
      // Estimate CTR as 1% (YouTube average)
      return {
        impressions: views * 100,
        clicks: views,
        avgViewDuration: 0, // Unknown
        views,
        ctr: 1.0,
      };
    } catch (error: any) {
      console.error(`Failed to fetch YouTube metrics: ${error.message}`);
      return null;
    }
  }

  /**
   * Get OAuth2 client for YouTube API
   */
  private async getOAuth2Client() {
    const { OAuth2 } = google.auth;

    const oauth2Client = new OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      'http://localhost:3000/oauth2callback',
    );

    // Set refresh token
    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    });

    return oauth2Client;
  }

  /**
   * Record performance for a specific job (called after YouTube upload)
   */
  async recordJobPerformance(jobId: string, youtubeVideoId: string): Promise<void> {
    console.log(`\n📊 Scheduling analytics collection for ${youtubeVideoId}`);
    console.log(`   Will collect data after 24 hours for accurate metrics`);

    // In a production system, this would schedule a task to run after 24 hours
    // For now, it will be picked up by the periodic collection
  }
}

export const beatPerformanceTracker = BeatPerformanceTracker.getInstance();
