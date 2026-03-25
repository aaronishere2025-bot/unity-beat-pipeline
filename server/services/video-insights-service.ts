/**
 * VIDEO INSIGHTS SERVICE
 *
 * Provides full audit trail for theme tracking across videos:
 * 1. Record which themes were active when a video was generated
 * 2. Track theme contributions (positive/negative signals)
 * 3. Get comprehensive insights for any video
 * 4. Query videos by theme for analysis
 */

import { db } from '../db';
import { videoThemeApplications, type InsertVideoThemeApplications } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { patternIntelligenceService, type ThemeCategory, type ThematicPrinciple } from './pattern-intelligence-service';

// Applied theme snapshot at time of generation
export interface AppliedTheme {
  themeId: string;
  themeName: string;
  category: 'proven' | 'neutral' | 'emerging' | 'failing';
  successRate: number;
  whyItWorks: string;
  wasInHoldout: boolean;
}

// Theme contribution after performance data comes in
export interface ThemeContribution {
  themeId: string;
  themeName: string;
  contributionType: 'positive' | 'negative';
  viewsContributed: number;
  engagementContributed: number;
}

// Performance snapshot
export interface PerformanceSnapshot {
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
  performanceTier: 'viral' | 'high' | 'medium' | 'low' | 'new';
  recordedAt: string;
}

// Full video insights response
export interface VideoInsights {
  videoId: string;
  title: string;
  publishedAt: string;

  metrics: {
    views: number;
    likes: number;
    comments: number;
    engagementRate: number;
    estimatedCTR?: number;
    estimatedAVD?: number;
    shares?: number;
    subscribersGained?: number;
    subscribersLost?: number;
    watchTimeMinutes?: number;
    averageViewPercentage?: number;
    impressions?: number;
  };

  trafficSources?: {
    browse?: number;
    search?: number;
    suggested?: number;
    external?: number;
    direct?: number;
    notifications?: number;
    playlists?: number;
  };

  performanceTier: 'viral' | 'high' | 'medium' | 'low' | 'new';

  appliedThemes: Array<{
    themeId: string;
    themeName: string;
    categoryAtGeneration: string;
    currentCategory: string;
    successRateAtGeneration: number;
    currentSuccessRate: number;
    whyItWorks: string;
    trend: 'improving' | 'declining' | 'stable';
  }>;

  contributedThemes: Array<{
    themeId: string;
    themeName: string;
    signal: 'positive' | 'negative';
    reason: string;
  }>;

  wasInHoldout: boolean;
  generatedAt: string;
  packageId?: string;
}

// Video by theme result
export interface VideoByTheme {
  videoId: string;
  packageId?: string;
  appliedAt: Date;
  wasInHoldout: boolean;
  categoryAtApplication: string;
  successRateAtApplication: number;
  performanceTier?: string;
  views?: number;
}

class VideoInsightsService {
  /**
   * Record theme application when a video is generated
   * Called during video generation to snapshot active themes
   */
  async recordThemeApplication(
    videoId: string,
    packageId: string | null,
    appliedThemes: AppliedTheme[],
    wasInHoldout: boolean,
  ): Promise<void> {
    try {
      // Tag each theme with holdout status
      const themesWithHoldout = appliedThemes.map((theme) => ({
        ...theme,
        wasInHoldout,
      }));

      const insertData: InsertVideoThemeApplications = {
        videoId,
        packageId: packageId || undefined,
        appliedThemes: themesWithHoldout,
        themeContributions: null,
        performanceSnapshot: null,
      };

      await db.insert(videoThemeApplications).values(insertData);

      console.log(`📊 Recorded ${appliedThemes.length} themes for video ${videoId}${wasInHoldout ? ' (HOLDOUT)' : ''}`);
    } catch (error) {
      console.error(`Failed to record theme application for video ${videoId}:`, error);
    }
  }

  /**
   * Record theme contributions after performance data is processed
   * Called when analytics data shows how themes performed
   */
  async recordThemeContributions(
    videoId: string,
    contributions: ThemeContribution[],
    performanceSnapshot: PerformanceSnapshot,
  ): Promise<void> {
    try {
      await db
        .update(videoThemeApplications)
        .set({
          themeContributions: contributions,
          performanceSnapshot,
        })
        .where(eq(videoThemeApplications.videoId, videoId));

      console.log(`📈 Recorded ${contributions.length} theme contributions for video ${videoId}`);
    } catch (error) {
      console.error(`Failed to record theme contributions for video ${videoId}:`, error);
    }
  }

  /**
   * Update videoId after YouTube upload completes
   * Links the packageId-based record to the actual YouTube video ID
   */
  async updateVideoId(packageId: string, youtubeVideoId: string): Promise<boolean> {
    try {
      // First check if a record exists for this packageId
      const [existingRecord] = await db
        .select()
        .from(videoThemeApplications)
        .where(eq(videoThemeApplications.packageId, packageId))
        .limit(1);

      if (!existingRecord) {
        console.warn(`⚠️ No theme application found for packageId ${packageId} - creating stub record`);
        // Create a stub record so we can still link to YouTube analytics later
        await db.insert(videoThemeApplications).values({
          videoId: youtubeVideoId,
          packageId: packageId,
          appliedThemes: [],
          themeContributions: null,
          performanceSnapshot: null,
        });
        console.log(`🔗 Created stub theme application for videoId ${youtubeVideoId}`);
        return true;
      }

      // Update existing record
      await db
        .update(videoThemeApplications)
        .set({ videoId: youtubeVideoId })
        .where(eq(videoThemeApplications.packageId, packageId));

      console.log(`🔗 Updated theme application: packageId ${packageId} → videoId ${youtubeVideoId}`);
      return true;
    } catch (error) {
      console.error(`Failed to update videoId for package ${packageId}:`, error);
      return false;
    }
  }

  /**
   * Get full insights for a specific video
   * Returns theme audit trail with current vs. historical comparisons
   */
  async getVideoInsights(videoId: string): Promise<VideoInsights | null> {
    try {
      // Get stored theme application data
      const [themeData] = await db
        .select()
        .from(videoThemeApplications)
        .where(eq(videoThemeApplications.videoId, videoId))
        .limit(1);

      // Get current theme data from pattern intelligence service
      const currentThemes = patternIntelligenceService.getDashboardThemes();
      const currentThemesMap = new Map(currentThemes.map((t) => [t.id, t]));

      // Try to get video info from YouTube analytics
      let videoTitle = '';
      let publishedAt = '';
      let metrics = {
        views: 0,
        likes: 0,
        comments: 0,
        engagementRate: 0,
        estimatedCTR: undefined as number | undefined,
        estimatedAVD: undefined as number | undefined,
        shares: undefined as number | undefined,
        subscribersGained: undefined as number | undefined,
        subscribersLost: undefined as number | undefined,
        watchTimeMinutes: undefined as number | undefined,
        averageViewPercentage: undefined as number | undefined,
        impressions: undefined as number | undefined,
      };
      let performanceTier: 'viral' | 'high' | 'medium' | 'low' | 'new' = 'new';
      let trafficSources: VideoInsights['trafficSources'] = undefined;

      try {
        const { youtubeAnalyticsService } = await import('./youtube-analytics-service');
        const allMetrics = await youtubeAnalyticsService.getDetailedMetrics();
        const videoMetrics = allMetrics.find((v) => v.videoId === videoId);

        if (videoMetrics) {
          videoTitle = videoMetrics.title;
          publishedAt = videoMetrics.publishedAt;
          metrics = {
            views: videoMetrics.viewCount,
            likes: videoMetrics.likeCount,
            comments: videoMetrics.commentCount,
            engagementRate: videoMetrics.engagementRate || 0,
            estimatedCTR: videoMetrics.clickThroughRate,
            estimatedAVD: videoMetrics.averageViewDurationSeconds,
            shares: undefined,
            subscribersGained: undefined,
            subscribersLost: undefined,
            watchTimeMinutes: undefined,
            averageViewPercentage: undefined,
            impressions: undefined,
          } as any;
          performanceTier = videoMetrics.performanceTier || 'new';
        }

        // Fetch advanced analytics with traffic sources, shares, subscriber impact
        const advancedAnalytics = await youtubeAnalyticsService.getAdvancedAnalytics(videoId);
        if (advancedAnalytics) {
          metrics.shares = advancedAnalytics.shares;
          metrics.subscribersGained = advancedAnalytics.subscribersGained;
          metrics.subscribersLost = advancedAnalytics.subscribersLost;
          metrics.watchTimeMinutes = advancedAnalytics.estimatedMinutesWatched;
          metrics.averageViewPercentage = advancedAnalytics.averageViewPercentage;
          metrics.impressions = advancedAnalytics.impressions;
          metrics.estimatedCTR = advancedAnalytics.clickThroughRate;
          trafficSources = advancedAnalytics.trafficSources;
        }
      } catch (e) {
        console.log(`Could not fetch YouTube metrics for video ${videoId}`);
      }

      // Use performance snapshot if we have it and no live data
      if (themeData?.performanceSnapshot && metrics.views === 0) {
        const snapshot = themeData.performanceSnapshot as PerformanceSnapshot;
        metrics.views = snapshot.views;
        metrics.likes = snapshot.likes;
        metrics.comments = snapshot.comments;
        metrics.engagementRate = snapshot.engagementRate;
        performanceTier = snapshot.performanceTier;
      }

      // Build applied themes with current comparisons
      const appliedThemesData = (themeData?.appliedThemes as AppliedTheme[]) || [];
      const appliedThemes = appliedThemesData.map((applied) => {
        const current = currentThemesMap.get(applied.themeId);
        return {
          themeId: applied.themeId,
          themeName: applied.themeName,
          categoryAtGeneration: applied.category,
          currentCategory: current?.category || applied.category,
          successRateAtGeneration: applied.successRate,
          currentSuccessRate: current?.successRate || applied.successRate,
          whyItWorks: applied.whyItWorks,
          trend: current?.trend || ('stable' as 'improving' | 'declining' | 'stable'),
        };
      });

      // Build contributed themes
      const contributionsData = (themeData?.themeContributions as ThemeContribution[]) || [];
      const contributedThemes = contributionsData.map((contrib) => ({
        themeId: contrib.themeId,
        themeName: contrib.themeName,
        signal: contrib.contributionType,
        reason:
          contrib.contributionType === 'positive'
            ? `Added ${contrib.viewsContributed} views and ${contrib.engagementContributed.toFixed(2)} engagement`
            : `Performance below threshold`,
      }));

      // Determine holdout status
      const wasInHoldout = appliedThemesData.some((t) => t.wasInHoldout);

      return {
        videoId,
        title: videoTitle,
        publishedAt,
        metrics,
        trafficSources,
        performanceTier,
        appliedThemes,
        contributedThemes,
        wasInHoldout,
        generatedAt: themeData?.appliedAt?.toISOString() || new Date().toISOString(),
        packageId: themeData?.packageId || undefined,
      };
    } catch (error) {
      console.error(`Failed to get video insights for ${videoId}:`, error);
      return null;
    }
  }

  /**
   * Get all videos that used a specific theme
   * Useful for analyzing theme performance across videos
   */
  async getVideosByTheme(themeId: string): Promise<VideoByTheme[]> {
    try {
      const allApplications = await db.select().from(videoThemeApplications);

      const results: VideoByTheme[] = [];

      for (const app of allApplications) {
        const themes = (app.appliedThemes as AppliedTheme[]) || [];
        const matchingTheme = themes.find((t) => t.themeId === themeId);

        if (matchingTheme) {
          const snapshot = app.performanceSnapshot as PerformanceSnapshot | null;

          results.push({
            videoId: app.videoId,
            packageId: app.packageId || undefined,
            appliedAt: app.appliedAt,
            wasInHoldout: matchingTheme.wasInHoldout,
            categoryAtApplication: matchingTheme.category,
            successRateAtApplication: matchingTheme.successRate,
            performanceTier: snapshot?.performanceTier,
            views: snapshot?.views,
          });
        }
      }

      // Sort by appliedAt descending
      results.sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime());

      return results;
    } catch (error) {
      console.error(`Failed to get videos for theme ${themeId}:`, error);
      return [];
    }
  }

  /**
   * Get current active themes snapshot for recording with a new video
   * Integrates with pattern intelligence service
   */
  getCurrentThemesForRecording(): AppliedTheme[] {
    const dashboardThemes = patternIntelligenceService.getDashboardThemes();

    return dashboardThemes.map((theme) => ({
      themeId: theme.id,
      themeName: theme.name,
      category: theme.category,
      successRate: theme.successRate,
      whyItWorks: theme.whyItWorks,
      wasInHoldout: false, // Will be set by the caller based on A/B test
    }));
  }

  /**
   * Determine if a video should be in the holdout group
   * 15% of videos skip pattern enhancements for A/B testing
   */
  shouldBeHoldout(): boolean {
    return Math.random() < 0.15; // 15% holdout rate
  }

  /**
   * Get summary statistics for theme tracking
   */
  async getThemeTrackingSummary(): Promise<{
    totalVideosTracked: number;
    holdoutVideos: number;
    themesWithData: number;
    avgThemesPerVideo: number;
  }> {
    try {
      const allApplications = await db.select().from(videoThemeApplications);

      let totalThemes = 0;
      let holdoutCount = 0;
      const uniqueThemes = new Set<string>();

      for (const app of allApplications) {
        const themes = (app.appliedThemes as AppliedTheme[]) || [];
        totalThemes += themes.length;

        for (const theme of themes) {
          uniqueThemes.add(theme.themeId);
          if (theme.wasInHoldout) holdoutCount++;
        }
      }

      return {
        totalVideosTracked: allApplications.length,
        holdoutVideos: holdoutCount,
        themesWithData: uniqueThemes.size,
        avgThemesPerVideo: allApplications.length > 0 ? totalThemes / allApplications.length : 0,
      };
    } catch (error) {
      console.error('Failed to get theme tracking summary:', error);
      return {
        totalVideosTracked: 0,
        holdoutVideos: 0,
        themesWithData: 0,
        avgThemesPerVideo: 0,
      };
    }
  }
}

export const videoInsightsService = new VideoInsightsService();
