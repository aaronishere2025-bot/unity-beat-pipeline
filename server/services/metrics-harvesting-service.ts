/**
 * Metrics Harvesting Service
 *
 * Persists YouTube analytics data to the database for long-term analysis.
 * Runs daily to capture CTR, watch time, retention, and performance trends.
 * Extracts winning hook templates from top performers.
 */

import { db } from '../db';
import {
  detailedVideoMetrics,
  hookTemplates,
  patternUsageLog,
  unityContentPackages,
  crossPlatformUploads,
  lyricFeatures,
} from '@shared/schema';
import { eq, desc, sql, and, gte, lt } from 'drizzle-orm';
import { youtubeAnalyticsService } from './youtube-analytics-service';
import { lyricAnalyticsService } from './lyric-analytics-service';
import { audioPacingService } from './audio-pacing-service';
import { sunoStyleBandit } from './suno-style-bandit';
import { GoogleGenerativeAI } from '@google/generative-ai';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface HarvestResult {
  videosHarvested: number;
  newVideos: number;
  updatedVideos: number;
  hookTemplatesExtracted: number;
  errors: string[];
}

class MetricsHarvestingService {
  private lastHarvestTime: Date | null = null;
  private isHarvesting = false;

  /**
   * Main harvesting function - call daily to update metrics
   */
  async harvestMetrics(): Promise<HarvestResult> {
    if (this.isHarvesting) {
      console.log('⚠️ Metrics harvesting already in progress, skipping...');
      return {
        videosHarvested: 0,
        newVideos: 0,
        updatedVideos: 0,
        hookTemplatesExtracted: 0,
        errors: ['Already harvesting'],
      };
    }

    this.isHarvesting = true;
    const result: HarvestResult = {
      videosHarvested: 0,
      newVideos: 0,
      updatedVideos: 0,
      hookTemplatesExtracted: 0,
      errors: [],
    };

    try {
      console.log('🌾 Starting metrics harvest...');

      // Get detailed metrics from YouTube
      const metrics = await youtubeAnalyticsService.getDetailedMetrics();
      console.log(`📊 Found ${metrics.length} videos to process`);

      // Process each video
      for (const video of metrics) {
        try {
          // Get advanced analytics (CTR, watch time, etc.)
          const advanced = await youtubeAnalyticsService.getAdvancedAnalytics(video.videoId);

          // Check if video exists in database
          const existing = await db
            .select()
            .from(detailedVideoMetrics)
            .where(eq(detailedVideoMetrics.videoId, video.videoId))
            .limit(1);

          const metricsData = {
            videoId: video.videoId,
            title: video.title,
            publishedAt: new Date(video.publishedAt),
            viewCount: video.viewCount,
            likeCount: video.likeCount,
            commentCount: video.commentCount,
            impressions: Math.round(advanced?.impressions || 0),
            clickThroughRate: advanced?.clickThroughRate?.toFixed(2) || null,
            estimatedMinutesWatched: advanced?.estimatedMinutesWatched?.toFixed(2) || null,
            averageViewDurationSeconds: advanced?.averageViewDurationSeconds?.toFixed(2) || null,
            averageViewPercentage: advanced?.averageViewPercentage?.toFixed(2) || null,
            first60SecondsRetention: advanced?.first60SecondsRetention?.toFixed(2) || null,
            retentionDropPoints: advanced?.dropOffPoints || null,
            subscribersGained: Math.round(advanced?.subscribersGained || 0),
            subscribersLost: Math.round(advanced?.subscribersLost || 0),
            shares: Math.round(advanced?.shares || 0),
            trafficSources: advanced?.trafficSources || null,
            searchTerms: advanced?.searchTerms || null,
            performanceTier: video.performanceTier || null,
            engagementRate: video.engagementRate?.toFixed(2) || null,
            harvestCount: 1,
          };

          if (existing.length > 0) {
            // Update existing record
            await db
              .update(detailedVideoMetrics)
              .set({
                ...metricsData,
                harvestCount: (existing[0].harvestCount || 0) + 1,
                lastHarvestedAt: new Date(),
              })
              .where(eq(detailedVideoMetrics.videoId, video.videoId));
            result.updatedVideos++;
          } else {
            // Insert new record
            await db.insert(detailedVideoMetrics).values(metricsData);
            result.newVideos++;
          }

          // Update lyric pattern performance (Thompson Sampling feedback loop)
          // First, ensure lyric features exist for this video
          try {
            const existingFeatures = await db
              .select()
              .from(lyricFeatures)
              .where(eq(lyricFeatures.videoId, video.videoId))
              .limit(1);

            if (existingFeatures.length === 0) {
              // Try to extract features from the associated unity package
              await this.extractLyricFeaturesForVideo(video.videoId, video.title);
            }

            await lyricAnalyticsService.updatePatternPerformance(video.videoId);
          } catch (lyricErr: any) {
            // Non-critical - don't fail harvest for this
            console.log(`   ⚠️ Lyric pattern update skipped for ${video.videoId}: ${lyricErr.message}`);
          }

          // Update audio pattern stats (Thompson Sampling feedback loop)
          try {
            await audioPacingService.correlateWithRetention(video.videoId, {
              avgRetention: advanced?.averageViewPercentage,
              views: video.viewCount,
              ctr: advanced?.clickThroughRate,
              avgViewDuration: advanced?.averageViewDurationSeconds,
            });
          } catch (audioErr: any) {
            // Non-critical - don't fail harvest for this
            console.log(`   ⚠️ Audio pattern update skipped for ${video.videoId}: ${audioErr.message}`);
          }

          // Update Suno Style Bandit with performance data (Thompson Sampling feedback)
          // TODO: The banditStyleId tracking gap - unity-content-generator.ts generates banditStyleId
          // when sunoStyleBandit.selectStyle() is called, but it must be persisted to the database
          // in packageData.sunoStyleTags.banditStyleId at generation time for this feedback loop to work.
          try {
            await this.updateSunoStyleBanditPerformance(video.videoId, {
              views: video.viewCount,
              ctr: advanced?.clickThroughRate || 0,
              avgViewDuration: advanced?.averageViewDurationSeconds || 0,
              avgViewPercentage: advanced?.averageViewPercentage || 0,
              subscribersGained: advanced?.subscribersGained || 0,
            });
          } catch (banditErr: any) {
            // Non-critical - don't fail harvest for this
            console.log(`   ⚠️ Suno style bandit update skipped for ${video.videoId}: ${banditErr.message}`);
          }

          result.videosHarvested++;
        } catch (error: any) {
          result.errors.push(`Failed to harvest ${video.videoId}: ${error.message}`);
        }
      }

      // Extract hook templates from top performers
      const hookCount = await this.extractHookTemplates();
      result.hookTemplatesExtracted = hookCount;

      this.lastHarvestTime = new Date();
      console.log(
        `✅ Metrics harvest complete: ${result.videosHarvested} videos (${result.newVideos} new, ${result.updatedVideos} updated), ${hookCount} hook templates extracted`,
      );
    } catch (error: any) {
      console.error('❌ Metrics harvest failed:', error.message);
      result.errors.push(error.message);
    } finally {
      this.isHarvesting = false;
    }

    return result;
  }

  /**
   * Extract winning hook templates from top performing videos
   */
  async extractHookTemplates(): Promise<number> {
    try {
      // Get top performers from database
      const topPerformers = await db
        .select()
        .from(detailedVideoMetrics)
        .where(sql`${detailedVideoMetrics.performanceTier} IN ('viral', 'high')`)
        .orderBy(desc(detailedVideoMetrics.viewCount))
        .limit(20);

      if (topPerformers.length < 3) {
        console.log('⚠️ Not enough top performers for hook template extraction');
        return 0;
      }

      // Use GPT to analyze titles and extract patterns
      const titles = topPerformers.map((v) => ({
        title: v.title,
        views: v.viewCount,
        ctr: v.clickThroughRate,
        tier: v.performanceTier,
      }));

      const prompt = `Analyze these top-performing video titles and extract reusable hook templates.

TOP PERFORMING TITLES:
${titles.map((t) => `- "${t.title}" (${t.views} views, ${t.tier})`).join('\n')}

Extract 3-5 hook TEMPLATES that can be reused for new videos. Templates should use placeholders like:
- [FIGURE] for historical figure name
- [OPPONENT] for opposing figure  
- [DRAMATIC_MOMENT] for the key dramatic element
- [SECRET] for hidden/revealed information
- [NUMBER] for specific numbers
- [ERA] for time period

For each template, provide:
1. The template pattern
2. A category (conflict, mystery, challenge, reveal, warning, comparison)
3. Keywords that make this pattern work

Return JSON array:
[
  {
    "template": "[FIGURE] vs [OPPONENT] - [DRAMATIC_MOMENT]",
    "category": "conflict",
    "winningKeywords": ["vs", "battle", "fight", "war"],
    "confidence": 0.85
  }
]

Return ONLY the JSON array, no other text.`;

      const hookModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3 },
      });
      const hookResult = await hookModel.generateContent(prompt);
      const content = hookResult.response.text() || '[]';

      // Parse JSON from response
      let templates: any[];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        templates = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        console.error('Failed to parse hook templates JSON');
        return 0;
      }

      // Store templates in database
      let insertedCount = 0;
      for (const template of templates) {
        try {
          // Check if similar template exists
          const existing = await db
            .select()
            .from(hookTemplates)
            .where(eq(hookTemplates.template, template.template))
            .limit(1);

          if (existing.length === 0) {
            await db.insert(hookTemplates).values({
              template: template.template,
              category: template.category || 'general',
              winningKeywords: template.winningKeywords || [],
              confidence: template.confidence?.toString() || '0.70',
              sourceVideoIds: topPerformers.map((v) => v.videoId),
              timesUsed: 0,
              isActive: 1,
            });
            insertedCount++;
            console.log(`📝 New hook template: "${template.template}"`);
          }
        } catch (error: any) {
          console.error(`Failed to insert template: ${error.message}`);
        }
      }

      return insertedCount;
    } catch (error: any) {
      console.error('Failed to extract hook templates:', error.message);
      return 0;
    }
  }

  /**
   * Get all active hook templates sorted by success rate
   */
  async getActiveHookTemplates(): Promise<
    {
      template: string;
      category: string;
      successRate: number;
      winningKeywords: string[];
      confidence: number;
    }[]
  > {
    const templates = await db
      .select()
      .from(hookTemplates)
      .where(eq(hookTemplates.isActive, 1))
      .orderBy(desc(hookTemplates.successRate));

    return templates.map((t) => ({
      template: t.template,
      category: t.category,
      successRate: parseFloat(t.successRate || '0'),
      winningKeywords: t.winningKeywords || [],
      confidence: parseFloat(t.confidence || '0.5'),
    }));
  }

  /**
   * Update pattern outcomes after videos mature (3+ days old)
   */
  async updatePatternOutcomes(): Promise<number> {
    try {
      // Find pattern usage logs without recorded outcomes
      const pendingLogs = await db
        .select()
        .from(patternUsageLog)
        .where(eq(patternUsageLog.outcomeRecorded, 0))
        .limit(50);

      if (pendingLogs.length === 0) return 0;

      let updated = 0;
      for (const log of pendingLogs) {
        if (!log.videoId) continue;

        // Check if video is mature enough (3+ days)
        const metrics = await db
          .select()
          .from(detailedVideoMetrics)
          .where(eq(detailedVideoMetrics.videoId, log.videoId))
          .limit(1);

        if (metrics.length === 0) continue;

        const video = metrics[0];
        const daysSincePublish = (Date.now() - new Date(video.publishedAt).getTime()) / (1000 * 60 * 60 * 24);

        if (daysSincePublish < 3) continue;

        // Record outcome
        await db
          .update(patternUsageLog)
          .set({
            outcomeRecorded: 1,
            outcomeViews: video.viewCount,
            outcomeTier: video.performanceTier,
            outcomeRecordedAt: new Date(),
          })
          .where(eq(patternUsageLog.id, log.id));

        // Update hook template stats if one was used
        if (log.hookTemplateId) {
          const templateStats = await db
            .select()
            .from(hookTemplates)
            .where(eq(hookTemplates.id, log.hookTemplateId))
            .limit(1);

          if (templateStats.length > 0) {
            const template = templateStats[0];
            const timesUsed = (template.timesUsed || 0) + 1;
            const currentAvgViews = parseFloat(template.avgViewsWhenUsed || '0');
            const newAvgViews = (currentAvgViews * (timesUsed - 1) + video.viewCount) / timesUsed;

            const isSuccess = video.performanceTier === 'viral' || video.performanceTier === 'high';
            const currentSuccessRate = parseFloat(template.successRate || '0');
            const successCount = Math.round((currentSuccessRate / 100) * (timesUsed - 1));
            const newSuccessRate = ((successCount + (isSuccess ? 1 : 0)) / timesUsed) * 100;

            await db
              .update(hookTemplates)
              .set({
                timesUsed,
                avgViewsWhenUsed: newAvgViews.toString(),
                successRate: newSuccessRate.toString(),
                updatedAt: new Date(),
              })
              .where(eq(hookTemplates.id, log.hookTemplateId));
          }
        }

        updated++;
      }

      console.log(`📈 Updated ${updated} pattern outcomes`);
      return updated;
    } catch (error: any) {
      console.error('Failed to update pattern outcomes:', error.message);
      return 0;
    }
  }

  /**
   * Update Suno Style Bandit with video performance data
   *
   * This provides the feedback loop for Thompson Sampling to learn which
   * Suno music styles perform best on YouTube.
   *
   * NOTE: For this to work, the banditStyleId must be stored in
   * packageData.sunoStyleTags.banditStyleId when the content is generated.
   * See unity-content-generator.ts where sunoStyleBandit.selectStyle() is called.
   */
  private async updateSunoStyleBanditPerformance(
    videoId: string,
    metrics: {
      views: number;
      ctr: number;
      avgViewDuration: number;
      avgViewPercentage: number; // VTR (0-100)
      subscribersGained: number;
    },
  ): Promise<void> {
    // Look up the package associated with this YouTube video
    const uploadRecord = await db
      .select()
      .from(crossPlatformUploads)
      .where(eq(crossPlatformUploads.youtubeVideoId, videoId))
      .limit(1);

    if (uploadRecord.length === 0) {
      // No package linked to this video - skip bandit update
      return;
    }

    const packageId = uploadRecord[0].packageId;

    // Get the package data to find the banditStyleId
    const packageRecord = await db
      .select()
      .from(unityContentPackages)
      .where(eq(unityContentPackages.id, packageId))
      .limit(1);

    if (packageRecord.length === 0) {
      return;
    }

    const packageData = packageRecord[0].packageData;
    const banditStyleId = packageData?.sunoStyleTags?.banditStyleId;

    if (!banditStyleId) {
      // TODO: This is the tracking gap that needs to be fixed at generation time.
      // The banditStyleId is generated in unity-content-generator.ts when
      // sunoStyleBandit.selectStyle() is called, but it's not being persisted
      // to packageData.sunoStyleTags.banditStyleId when saving the package.
      //
      // To fix this, update the code in unity-content-generator.ts that saves
      // the package to include banditStyleId and isExperimental fields.
      return;
    }

    // Feed the multi-objective performance data back to the bandit
    // R = w_ctr × CTR + w_vtr × VTR + w_sub × Subscribed
    // where w_ctr=1.0, w_vtr=2.0, w_sub=10.0
    sunoStyleBandit.updateReward(banditStyleId, {
      clicked: metrics.ctr > 0, // Had impressions and clicks
      vtr: metrics.avgViewPercentage / 100, // Convert 0-100 to 0-1
      subscribed: metrics.subscribersGained > 0,
    });

    console.log(
      `   🎵 Suno bandit updated: ${banditStyleId} | CTR: ${metrics.ctr.toFixed(1)}% | VTR: ${metrics.avgViewPercentage.toFixed(1)}% | Subs: ${metrics.subscribersGained}`,
    );
  }

  /**
   * Get performance summary from persisted metrics
   */
  async getPerformanceSummary(): Promise<{
    totalVideos: number;
    avgCtr: number;
    avgWatchTime: number;
    avgRetention: number;
    topSearchTerms: { term: string; views: number }[];
    performanceByTier: { tier: string; count: number; avgViews: number }[];
  }> {
    const allMetrics = await db.select().from(detailedVideoMetrics);

    if (allMetrics.length === 0) {
      return {
        totalVideos: 0,
        avgCtr: 0,
        avgWatchTime: 0,
        avgRetention: 0,
        topSearchTerms: [],
        performanceByTier: [],
      };
    }

    // Calculate averages
    const ctrs = allMetrics.filter((m) => m.clickThroughRate).map((m) => parseFloat(m.clickThroughRate!));
    const watchTimes = allMetrics
      .filter((m) => m.averageViewDurationSeconds)
      .map((m) => parseFloat(m.averageViewDurationSeconds!));
    const retentions = allMetrics
      .filter((m) => m.first60SecondsRetention)
      .map((m) => parseFloat(m.first60SecondsRetention!));

    // Aggregate search terms
    const searchTermMap = new Map<string, number>();
    for (const metric of allMetrics) {
      if (metric.searchTerms) {
        for (const term of metric.searchTerms) {
          const current = searchTermMap.get(term.term) || 0;
          searchTermMap.set(term.term, current + term.views);
        }
      }
    }

    // Group by performance tier
    const tierMap = new Map<string, { count: number; totalViews: number }>();
    for (const metric of allMetrics) {
      const tier = metric.performanceTier || 'unknown';
      const current = tierMap.get(tier) || { count: 0, totalViews: 0 };
      tierMap.set(tier, {
        count: current.count + 1,
        totalViews: current.totalViews + metric.viewCount,
      });
    }

    return {
      totalVideos: allMetrics.length,
      avgCtr: ctrs.length > 0 ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : 0,
      avgWatchTime: watchTimes.length > 0 ? watchTimes.reduce((a, b) => a + b, 0) / watchTimes.length : 0,
      avgRetention: retentions.length > 0 ? retentions.reduce((a, b) => a + b, 0) / retentions.length : 0,
      topSearchTerms: Array.from(searchTermMap.entries())
        .map(([term, views]) => ({ term, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10),
      performanceByTier: Array.from(tierMap.entries())
        .map(([tier, data]) => ({
          tier,
          count: data.count,
          avgViews: Math.round(data.totalViews / data.count),
        }))
        .sort((a, b) => b.avgViews - a.avgViews),
    };
  }

  /**
   * Get last harvest time
   */
  getLastHarvestTime(): Date | null {
    return this.lastHarvestTime;
  }

  /**
   * Check if currently harvesting
   */
  isCurrentlyHarvesting(): boolean {
    return this.isHarvesting;
  }

  /**
   * Run auto-promotion on patterns using harvested metrics
   * This connects persisted metrics to the pattern intelligence system
   */
  async runAutoPromotion(): Promise<{
    promoted: string[];
    demoted: string[];
    unchanged: string[];
    channelAvgViews: number;
  }> {
    try {
      const { patternIntelligenceService } = await import('./pattern-intelligence-service');

      // Get all harvested video metrics
      const allMetrics = await db.select().from(detailedVideoMetrics);

      if (allMetrics.length < 10) {
        console.log('⚠️ Not enough videos for auto-promotion (need 10+)');
        return { promoted: [], demoted: [], unchanged: [], channelAvgViews: 0 };
      }

      // Calculate channel average (excluding outliers)
      const views = allMetrics.map((m) => m.viewCount).sort((a, b) => a - b);
      const trimmedViews = views.slice(Math.floor(views.length * 0.1), Math.floor(views.length * 0.9));
      const channelAvgViews = trimmedViews.reduce((a, b) => a + b, 0) / trimmedViews.length;

      console.log(`📊 Running auto-promotion with channel avg of ${Math.round(channelAvgViews)} views`);

      // Prepare video metrics for pattern analysis
      const videoMetrics = allMetrics.map((m) => ({
        videoId: m.videoId,
        title: m.title,
        views: m.viewCount,
        performanceTier: m.performanceTier,
      }));

      // Run auto-promotion
      const result = await patternIntelligenceService.autoPromotePatterns(videoMetrics, channelAvgViews);

      return {
        ...result,
        channelAvgViews: Math.round(channelAvgViews),
      };
    } catch (error: any) {
      console.error('Auto-promotion failed:', error.message);
      return { promoted: [], demoted: [], unchanged: [], channelAvgViews: 0 };
    }
  }

  /**
   * Extract lyric features for a video that doesn't have them
   * Finds the associated unity package and extracts features from the lyrics
   */
  async extractLyricFeaturesForVideo(videoId: string, videoTitle?: string): Promise<void> {
    try {
      let packageData: any = null;
      let packageId: string | null = null;

      // Method 1: Try cross_platform_uploads table
      const upload = await db
        .select()
        .from(crossPlatformUploads)
        .where(eq(crossPlatformUploads.youtubeVideoId, videoId))
        .limit(1);

      if (upload.length > 0 && upload[0].packageId) {
        packageId = upload[0].packageId;
        const pkg = await db.select().from(unityContentPackages).where(eq(unityContentPackages.id, packageId)).limit(1);
        if (pkg.length > 0) {
          packageData = pkg[0];
        }
      }

      // Method 2: Fallback - search by video title matching package topic
      if (!packageData && videoTitle) {
        // Clean the title to match potential package topics
        const cleanTitle = videoTitle
          .toLowerCase()
          .replace(/[^\w\s]/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Get recent packages and find a match
        const recentPackages = await db
          .select()
          .from(unityContentPackages)
          .orderBy(desc(unityContentPackages.createdAt))
          .limit(100);

        for (const pkg of recentPackages) {
          const pkgTopic = (pkg.topic || '')
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .trim();
          // Check if title contains the topic or vice versa
          if (cleanTitle.includes(pkgTopic) || pkgTopic.includes(cleanTitle.split(' ')[0])) {
            packageData = pkg;
            packageId = pkg.id;
            console.log(`   📝 Found package via title match: "${pkg.topic}"`);
            break;
          }
        }
      }

      if (!packageData || !packageId) {
        console.log(`   📝 No package found for video ${videoId}`);
        return;
      }

      // Extract lyrics from the package
      let lyrics = '';
      if (packageData.lyrics && typeof packageData.lyrics === 'object') {
        lyrics = (packageData.lyrics as any).raw || '';
      }

      if (!lyrics && packageData.cleanLyrics) {
        lyrics = packageData.cleanLyrics;
      }

      if (!lyrics) {
        console.log(`   📝 No lyrics found in package ${packageId}`);
        return;
      }

      // Extract features using lyric analytics service
      const features = lyricAnalyticsService.extractFeatures(lyrics);

      // Save features with videoId
      await lyricAnalyticsService.saveFeatures(packageId, features, videoId);

      console.log(
        `   ✅ Extracted lyric features for video ${videoId} (${features.perspective}, ${features.rhymeScheme})`,
      );
    } catch (error: any) {
      console.log(`   ⚠️ Failed to extract lyric features for ${videoId}: ${error.message}`);
    }
  }
}

export const metricsHarvestingService = new MetricsHarvestingService();
