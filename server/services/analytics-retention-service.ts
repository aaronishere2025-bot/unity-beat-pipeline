/**
 * Analytics Data Retention Service
 *
 * Implements tiered retention:
 * - 90 days: Full detailed daily snapshots
 * - Beyond 90 days: Aggregated weekly/monthly rollups
 */

import { db } from '../db';
import {
  videoPerformanceHistory,
  aggregatedPerformance,
  InsertVideoPerformanceHistory,
  InsertAggregatedPerformance,
} from '@shared/schema';
import { youtubeAnalyticsService, DetailedVideoMetrics } from './youtube-analytics-service';
import { lt, gte, and, sql } from 'drizzle-orm';

const DETAILED_RETENTION_DAYS = 90;

class AnalyticsRetentionService {
  private snapshotInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Start automated snapshot and cleanup jobs
   */
  startAutomatedJobs(): void {
    // Take daily snapshots every 24 hours
    this.snapshotInterval = setInterval(
      () => {
        this.takeDailySnapshot().catch(console.error);
      },
      24 * 60 * 60 * 1000,
    );

    // Run cleanup weekly
    this.cleanupInterval = setInterval(
      () => {
        this.runRetentionCleanup().catch(console.error);
      },
      7 * 24 * 60 * 60 * 1000,
    );

    console.log('📊 Analytics retention jobs started');
  }

  /**
   * Stop automated jobs
   */
  stopAutomatedJobs(): void {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log('📊 Analytics retention jobs stopped');
  }

  /**
   * Take a daily snapshot of all video performance
   */
  async takeDailySnapshot(): Promise<{ snapshotCount: number }> {
    try {
      const metrics = await youtubeAnalyticsService.getDetailedMetrics();

      if (metrics.length === 0) {
        console.log('📊 No videos to snapshot');
        return { snapshotCount: 0 };
      }

      const snapshots: InsertVideoPerformanceHistory[] = metrics.map((video) => ({
        videoId: video.videoId,
        title: video.title,
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        engagementRate: video.engagementRate?.toString(),
        performanceTier: video.performanceTier,
      }));

      await db.insert(videoPerformanceHistory).values(snapshots);

      console.log(`📊 Saved daily snapshot for ${snapshots.length} videos`);
      return { snapshotCount: snapshots.length };
    } catch (error: any) {
      console.error('Failed to take daily snapshot:', error.message);
      throw error;
    }
  }

  /**
   * Run retention cleanup:
   * 1. Aggregate data older than 90 days into weekly rollups
   * 2. Delete the detailed records after aggregation
   */
  async runRetentionCleanup(): Promise<{
    aggregatedPeriods: number;
    deletedRecords: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DETAILED_RETENTION_DAYS);

    try {
      // Find old records that need aggregation
      const oldRecords = await db
        .select()
        .from(videoPerformanceHistory)
        .where(lt(videoPerformanceHistory.recordedAt, cutoffDate));

      if (oldRecords.length === 0) {
        console.log('📊 No old records to aggregate');
        return { aggregatedPeriods: 0, deletedRecords: 0 };
      }

      // Group by week
      const weeklyGroups = this.groupByWeek(oldRecords);
      let aggregatedCount = 0;

      for (const [weekKey, records] of Object.entries(weeklyGroups)) {
        const weekStart = new Date(weekKey);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        // Calculate aggregates
        const totalViews = records.reduce((sum, r) => sum + r.viewCount, 0);
        const totalLikes = records.reduce((sum, r) => sum + r.likeCount, 0);
        const totalComments = records.reduce((sum, r) => sum + r.commentCount, 0);
        const avgEngagement = records.reduce((sum, r) => sum + parseFloat(r.engagementRate || '0'), 0) / records.length;

        // Count by tier
        const tierCounts = records.reduce(
          (acc, r) => {
            acc[r.performanceTier || 'unknown'] = (acc[r.performanceTier || 'unknown'] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        );

        // Find best titles
        const sortedByViews = [...records].sort((a, b) => b.viewCount - a.viewCount);
        const bestTitles = sortedByViews.slice(0, 5).map((r) => r.title);

        const aggregation: InsertAggregatedPerformance = {
          periodType: 'weekly',
          periodStart: weekStart,
          periodEnd: weekEnd,
          totalVideos: records.length,
          totalViews,
          totalLikes,
          totalComments,
          avgEngagementRate: avgEngagement.toFixed(2),
          viralCount: tierCounts['viral'] || 0,
          highCount: tierCounts['high'] || 0,
          mediumCount: tierCounts['medium'] || 0,
          lowCount: tierCounts['low'] || 0,
          topPatterns: {
            bestTitles,
            bestTopics: [], // Could extract topics from titles
            avgViewsPerVideo: totalViews / records.length,
            peakDays: [],
          },
        };

        await db.insert(aggregatedPerformance).values(aggregation);
        aggregatedCount++;
      }

      // Delete old detailed records
      const deleteResult = await db
        .delete(videoPerformanceHistory)
        .where(lt(videoPerformanceHistory.recordedAt, cutoffDate));

      console.log(`📊 Aggregated ${aggregatedCount} weekly periods, deleted old records`);
      return {
        aggregatedPeriods: aggregatedCount,
        deletedRecords: oldRecords.length,
      };
    } catch (error: any) {
      console.error('Failed to run retention cleanup:', error.message);
      throw error;
    }
  }

  /**
   * Group records by week (Sunday start)
   */
  private groupByWeek(records: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};

    for (const record of records) {
      const date = new Date(record.recordedAt);
      // Get Sunday of that week
      const day = date.getDay();
      const sunday = new Date(date);
      sunday.setDate(date.getDate() - day);
      sunday.setHours(0, 0, 0, 0);

      const weekKey = sunday.toISOString().split('T')[0];
      if (!groups[weekKey]) {
        groups[weekKey] = [];
      }
      groups[weekKey].push(record);
    }

    return groups;
  }

  /**
   * Get historical performance data for AI training
   */
  async getHistoricalData(): Promise<{
    recentDetailed: any[];
    aggregatedHistory: any[];
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - DETAILED_RETENTION_DAYS);

    const [recentDetailed, aggregatedHistory] = await Promise.all([
      db
        .select()
        .from(videoPerformanceHistory)
        .where(gte(videoPerformanceHistory.recordedAt, cutoffDate))
        .orderBy(sql`${videoPerformanceHistory.recordedAt} DESC`)
        .limit(1000),
      db
        .select()
        .from(aggregatedPerformance)
        .orderBy(sql`${aggregatedPerformance.periodStart} DESC`)
        .limit(52), // Last year of weekly data
    ]);

    return { recentDetailed, aggregatedHistory };
  }

  /**
   * Get performance trends over time
   */
  async getPerformanceTrends(): Promise<{
    weeklyTrends: Array<{
      week: string;
      avgViews: number;
      avgEngagement: number;
      videoCount: number;
    }>;
  }> {
    const aggregated = await db
      .select()
      .from(aggregatedPerformance)
      .where(sql`${aggregatedPerformance.periodType} = 'weekly'`)
      .orderBy(sql`${aggregatedPerformance.periodStart} DESC`)
      .limit(12);

    const weeklyTrends = aggregated.map((a) => ({
      week: a.periodStart.toISOString().split('T')[0],
      avgViews: a.totalVideos > 0 ? a.totalViews / a.totalVideos : 0,
      avgEngagement: parseFloat(a.avgEngagementRate || '0'),
      videoCount: a.totalVideos,
    }));

    return { weeklyTrends };
  }
}

export const analyticsRetentionService = new AnalyticsRetentionService();
