/**
 * Analytics Routes
 *
 * Enhanced analytics, pattern intelligence, video insights, metrics harvesting,
 * lyric performance, creative analytics, unified analytics dashboard, feature correlation,
 * retention-clip correlator, retention optimizer, strategic summary, strategic insights.
 */

import { Router } from 'express';
import { join } from 'path';
import { db } from '../db';
import { lyricPatternStats, lyricFeatures, unityContentPackages } from '@shared/schema';
import { eq, desc, sql, and } from 'drizzle-orm';


const router = Router();

// Rate limiter: Track last strategic summary run time
let lastStrategicSummaryRun: Date | null = null;
const STRATEGIC_SUMMARY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown




  // ============================================================================
  // ENHANCED ANALYTICS API - AI-Powered Performance Analysis
  // ============================================================================

  // Get detailed metrics with performance tiers and engagement rates
  router.get('/analytics/detailed', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const metrics = await youtubeAnalyticsService.getDetailedMetrics();
      res.json({ success: true, data: metrics });
    } catch (error: any) {
      console.error('Detailed analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get AI-generated insights from video performance
  router.get('/analytics/insights', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const insights = await youtubeAnalyticsService.generateInsights();
      res.json({ success: true, data: insights });
    } catch (error: any) {
      console.error('Analytics insights error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get channel summary with trend analysis
  router.get('/analytics/summary', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const summary = await youtubeAnalyticsService.getChannelSummary();
      res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('Analytics summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get video generation learnings (for feeding back into prompts)
  router.get('/analytics/learnings', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const learnings = await youtubeAnalyticsService.getVideoGenerationLearnings();
      res.json({ success: true, data: learnings });
    } catch (error: any) {
      console.error('Analytics learnings error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get prompt enhancements based on analytics
  router.get('/analytics/prompt-enhancements', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const enhancements = await youtubeAnalyticsService.getPromptEnhancements();
      res.json({ success: true, data: enhancements });
    } catch (error: any) {
      console.error('Prompt enhancements error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Clear analytics cache to force refresh
  router.post('/analytics/refresh', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      youtubeAnalyticsService.clearCache();
      const metrics = await youtubeAnalyticsService.getDetailedMetrics();
      res.json({ success: true, message: 'Cache cleared', data: metrics });
    } catch (error: any) {
      console.error('Analytics refresh error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get "Rewind" analytics - standouts, momentum, sparklines
  router.get('/analytics/rewind', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const rewind = await youtubeAnalyticsService.getRewindAnalytics();
      res.json({ success: true, data: rewind });
    } catch (error: any) {
      console.error('Rewind analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get retention diagnosis for a specific video - identifies WHERE and WHY viewers drop off
  router.get('/analytics/retention/:videoId', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const diagnosis = await youtubeAnalyticsService.getRetentionDiagnosis(req.params.videoId);
      if (!diagnosis) {
        return res.status(404).json({ success: false, error: 'Video not found or no analytics available' });
      }
      res.json({ success: true, data: diagnosis });
    } catch (error: any) {
      console.error('Retention diagnosis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get bulk retention diagnoses for all recent videos
  router.get('/analytics/retention-diagnoses', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const limit = parseInt(req.query.limit as string) || 10;
      const diagnoses = await youtubeAnalyticsService.getBulkRetentionDiagnoses(limit);
      res.json({ success: true, data: diagnoses });
    } catch (error: any) {
      console.error('Bulk retention diagnoses error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Take a manual daily snapshot of video performance
  router.post('/analytics/snapshot', async (req, res) => {
    try {
      const { analyticsRetentionService } = await import('../services/analytics-retention-service');
      const result = await analyticsRetentionService.takeDailySnapshot();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Snapshot error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Run retention cleanup (aggregate old data, delete detailed records)
  router.post('/analytics/cleanup', async (req, res) => {
    try {
      const { analyticsRetentionService } = await import('../services/analytics-retention-service');
      const result = await analyticsRetentionService.runRetentionCleanup();
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('Cleanup error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get historical performance data (detailed + aggregated)
  router.get('/analytics/history', async (req, res) => {
    try {
      const { analyticsRetentionService } = await import('../services/analytics-retention-service');
      const data = await analyticsRetentionService.getHistoricalData();
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('History error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get performance trends over time
  router.get('/analytics/trends', async (req, res) => {
    try {
      const { analyticsRetentionService } = await import('../services/analytics-retention-service');
      const data = await analyticsRetentionService.getPerformanceTrends();
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Trends error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // PATTERN INTELLIGENCE API ROUTES
  // ============================================================================

  // Get full pattern intelligence analytics
  router.get('/pattern-intelligence', async (req, res) => {
    try {
      const { patternIntelligenceService } = await import('../services/pattern-intelligence-service');
      const analytics = patternIntelligenceService.getFullAnalytics();
      res.json({ success: true, data: analytics });
    } catch (error: any) {
      console.error('Pattern intelligence error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get dashboard-ready themes
  router.get('/pattern-intelligence/themes', async (req, res) => {
    try {
      const { patternIntelligenceService } = await import('../services/pattern-intelligence-service');
      const themes = patternIntelligenceService.getDashboardThemes();
      res.json({ success: true, data: themes });
    } catch (error: any) {
      console.error('Dashboard themes error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Trigger thematic clustering manually
  router.post('/pattern-intelligence/cluster', async (req, res) => {
    try {
      const { patternIntelligenceService } = await import('../services/pattern-intelligence-service');
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');

      const force = req.body?.force === true;

      // Get top performers for clustering
      const metrics = await youtubeAnalyticsService.getDetailedMetrics();
      const topPerformers = metrics
        .filter((v) => v.performanceTier === 'viral' || v.performanceTier === 'high')
        .map((v) => ({
          title: v.title,
          views: v.viewCount,
          engagement: v.engagementRate || 0,
          videoId: v.videoId,
        }));

      const lowPerformers = metrics
        .filter((v) => v.performanceTier === 'low')
        .map((v) => ({
          title: v.title,
          views: v.viewCount,
        }));

      await patternIntelligenceService.generateThematicClusters(topPerformers, lowPerformers, force);
      const analytics = patternIntelligenceService.getFullAnalytics();

      res.json({
        success: true,
        message: force ? 'Force re-clustering complete' : 'Clustering complete',
        data: analytics,
      });
    } catch (error: any) {
      console.error('Clustering error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all videos that used a specific theme
  router.get('/themes/:themeId/videos', async (req, res) => {
    try {
      const { videoInsightsService } = await import('../services/video-insights-service');
      const videos = await videoInsightsService.getVideosByTheme(req.params.themeId);
      res.json({ success: true, data: videos });
    } catch (error: any) {
      console.error('Theme videos error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get theme tracking summary statistics
  router.get('/video-insights/summary', async (req, res) => {
    try {
      const { videoInsightsService } = await import('../services/video-insights-service');
      const summary = await videoInsightsService.getThemeTrackingSummary();
      res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('Theme tracking summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get advanced analytics summary (CTR, AVD, retention)
  router.get('/analytics/advanced-summary', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const summary = await youtubeAnalyticsService.getAnalyticsSummary();
      res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('Advanced analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get advanced analytics for a specific video
  router.get('/analytics/video/:videoId/advanced', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const analytics = await youtubeAnalyticsService.getAdvancedAnalytics(req.params.videoId);
      if (!analytics) {
        return res.status(404).json({ success: false, error: 'Analytics not available for this video' });
      }
      res.json({ success: true, data: analytics });
    } catch (error: any) {
      console.error('Video analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get aggregated search terms across all videos
  // Shows what keywords people are using to find videos - useful for content discovery
  router.get('/analytics/search-terms', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const searchTerms = await youtubeAnalyticsService.getAggregatedSearchTerms();
      res.json({ success: true, data: searchTerms });
    } catch (error: any) {
      console.error('Search terms error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // METRICS HARVESTING API ROUTES
  // ============================================================================

  // Trigger metrics harvest (persist YouTube analytics to database)
  router.post('/analytics/harvest', async (req, res) => {
    try {
      const { metricsHarvestingService } = await import('../services/metrics-harvesting-service');
      const result = await metricsHarvestingService.harvestMetrics();
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Metrics harvest error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get harvest status
  router.get('/analytics/harvest/status', async (req, res) => {
    try {
      const { metricsHarvestingService } = await import('../services/metrics-harvesting-service');
      res.json({
        success: true,
        data: {
          isHarvesting: metricsHarvestingService.isCurrentlyHarvesting(),
          lastHarvestTime: metricsHarvestingService.getLastHarvestTime(),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get performance summary from persisted metrics
  router.get('/analytics/harvest/summary', async (req, res) => {
    try {
      const { metricsHarvestingService } = await import('../services/metrics-harvesting-service');
      const summary = await metricsHarvestingService.getPerformanceSummary();
      res.json({ success: true, data: summary });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get active hook templates
  router.get('/analytics/hook-templates', async (req, res) => {
    try {
      const { metricsHarvestingService } = await import('../services/metrics-harvesting-service');
      const templates = await metricsHarvestingService.getActiveHookTemplates();
      res.json({ success: true, data: templates });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Update pattern outcomes (run after videos mature)
  router.post('/analytics/update-outcomes', async (req, res) => {
    try {
      const { metricsHarvestingService } = await import('../services/metrics-harvesting-service');
      const updated = await metricsHarvestingService.updatePatternOutcomes();
      res.json({ success: true, data: { updatedCount: updated } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Backfill lyric pattern stats from existing packages
  router.post('/analytics/backfill-lyric-patterns', async (req, res) => {
    try {
      const { lyricAnalyticsService } = await import('../services/lyric-analytics-service');
      const { unityContentPackages, lyricPatternStats } = await import('@shared/schema');
      const { db } = await import('../db');
      const { desc } = await import('drizzle-orm');

      // Get all packages with lyrics
      const packages = await db
        .select()
        .from(unityContentPackages)
        .orderBy(desc(unityContentPackages.createdAt))
        .limit(200);

      let processed = 0;
      let extracted = 0;
      const errors: string[] = [];

      for (const pkg of packages) {
        processed++;
        try {
          // Extract lyrics from package_data JSON
          let lyrics = '';
          const packageData = pkg.packageData as any;
          if (packageData?.lyrics?.raw) {
            lyrics = packageData.lyrics.raw;
          } else if (packageData?.cleanLyrics) {
            lyrics = packageData.cleanLyrics;
          }

          if (!lyrics) continue;

          // Extract features
          const features = lyricAnalyticsService.extractFeatures(lyrics);

          // Save features (creates pattern stats entries via Thompson Sampling)
          await lyricAnalyticsService.saveFeatures(pkg.id, features);

          // Simulate a "successful" outcome to populate pattern stats
          // Use avg views from the package or default high value for patterns to register
          const mockViews = 1000;
          const mockCtr = 10;
          const mockRetention = 60;
          const isSuccess = true;

          // Update pattern stats for each feature type
          const patternsToUpdate = [
            { type: 'perspective', value: features.perspective },
            { type: 'rhyme_scheme', value: features.rhymeScheme },
            { type: 'hook_style', value: features.hookStyle },
            { type: 'emotional_intensity', value: features.emotionalIntensity },
          ];

          for (const pattern of patternsToUpdate) {
            await lyricAnalyticsService.updateOrCreatePatternStats(
              pattern.type,
              pattern.value,
              isSuccess,
              mockViews,
              mockCtr,
              mockRetention,
            );
          }

          extracted++;
        } catch (err: any) {
          errors.push(`${pkg.id}: ${err.message}`);
        }
      }

      res.json({
        success: true,
        data: {
          packagesProcessed: processed,
          patternsExtracted: extracted,
          errors: errors.slice(0, 10),
        },
      });
    } catch (error: any) {
      console.error('Backfill lyric patterns error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Backfill audio pattern analytics from existing package Librosa data
  router.post('/analytics/backfill-audio-patterns', async (req, res) => {
    try {
      const { audioPacingService } = await import('../services/audio-pacing-service');

      // Get packages with librosaAnalysis data
      const packages = await db
        .select({
          id: unityContentPackages.id,
          topic: unityContentPackages.topic,
          packageData: unityContentPackages.packageData,
        })
        .from(unityContentPackages)
        .where(sql`package_data->'librosaAnalysis' IS NOT NULL`)
        .orderBy(desc(unityContentPackages.createdAt));

      console.log(`📊 AUDIO BACKFILL: Processing ${packages.length} packages with Librosa data`);

      let processed = 0;
      let extracted = 0;
      const errors: string[] = [];

      for (const pkg of packages) {
        processed++;
        try {
          const packageData = pkg.packageData as any;
          const librosaData = packageData?.librosaAnalysis;

          if (!librosaData || !librosaData.bpm) {
            continue;
          }

          // Convert Librosa data to AudioPacingAnalysis format
          const analysis = audioPacingService.convertLibrosaToAnalysis({
            bpm: librosaData.bpm,
            duration: librosaData.duration || 180,
            beats: librosaData.beats || [],
            energySamples: librosaData.energySamples || [],
            averageEnergy: librosaData.averageEnergy,
            energyRange: librosaData.energyRange,
          });

          // Store the audio analysis
          await audioPacingService.storeAudioAnalysis(null, pkg.id, analysis);

          // Update pattern stats with simulated success data
          const mockRetentionData = { views: 1000, avgRetention: 60, ctr: 10 };
          await audioPacingService.updatePatternStatsDirectly(analysis, mockRetentionData, true);

          extracted++;
          console.log(`   ✅ Processed ${pkg.topic}: BPM ${analysis.bpm}, Pattern: ${analysis.patternCategory}`);
        } catch (err: any) {
          errors.push(`${pkg.id}: ${err.message}`);
        }
      }

      res.json({
        success: true,
        data: {
          packagesProcessed: processed,
          patternsExtracted: extracted,
          errors: errors.slice(0, 10),
        },
      });
    } catch (error: any) {
      console.error('Backfill audio patterns error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Run auto-promotion on patterns (promotes/demotes based on performance)
  router.post('/analytics/auto-promote', async (req, res) => {
    try {
      const { metricsHarvestingService } = await import('../services/metrics-harvesting-service');
      const result = await metricsHarvestingService.runAutoPromotion();
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Auto-promotion error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get auto-promotion status
  router.get('/analytics/auto-promote/status', async (req, res) => {
    try {
      const { patternIntelligenceService } = await import('../services/pattern-intelligence-service');
      const status = patternIntelligenceService.getAutoPromotionStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // LYRIC PERFORMANCE ANALYTICS API ROUTES
  // ============================================================================

  // Get lyric analytics summary (proven/avoid patterns)
  router.get('/analytics/lyrics/summary', async (req, res) => {
    try {
      const { lyricAnalyticsService } = await import('../services/lyric-analytics-service');
      const summary = await lyricAnalyticsService.getSummary();
      res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('Lyric analytics summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get pattern guidance for lyrics generation (what to use/avoid)
  router.get('/analytics/lyrics/guidance', async (req, res) => {
    try {
      const { lyricAnalyticsService } = await import('../services/lyric-analytics-service');
      const guidance = await lyricAnalyticsService.getPatternGuidance();
      res.json({ success: true, data: guidance });
    } catch (error: any) {
      console.error('Lyric pattern guidance error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all pattern stats (Thompson Sampling state)
  router.get('/analytics/lyrics/patterns', async (req, res) => {
    try {
      const patterns = await db.select().from(lyricPatternStats).orderBy(desc(lyricPatternStats.pulls));
      res.json({ success: true, data: patterns });
    } catch (error: any) {
      console.error('Lyric pattern stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get lyric features for a specific video
  router.get('/analytics/lyrics/video/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      const features = await db.select().from(lyricFeatures).where(eq(lyricFeatures.videoId, videoId)).limit(1);

      if (features.length === 0) {
        return res.status(404).json({ success: false, error: 'No lyric features found for this video' });
      }

      res.json({ success: true, data: features[0] });
    } catch (error: any) {
      console.error('Lyric features error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Test endpoint: Compare prompt with vs without analytics feedback
  router.post('/analytics/test-prompt-comparison', async (req, res) => {
    try {
      const { topic } = req.body || { topic: 'Julius Caesar' };
      const { metricsHarvestingService } = await import('../services/metrics-harvesting-service');

      // Get hook templates
      const hookTemplates = await metricsHarvestingService.getActiveHookTemplates();

      // Build prompt WITH analytics feedback
      let hookGuidance = '';
      if (hookTemplates.length > 0) {
        hookGuidance = `\n\n**PROVEN TITLE FORMULAS (from top-performing videos):**\nUse one of these validated title patterns:\n${hookTemplates
          .slice(0, 5)
          .map((t: any) => `- ${t.template} (${t.category}, ${(t.confidence * 100).toFixed(0)}% confidence)`)
          .join(
            '\n',
          )}\n\nAdapt these templates to fit the video content. Fill in placeholders with relevant names/topics.`;
      }

      const basePrompt = `Generate YouTube metadata for this AI-generated video:

**Video Title:** ${topic} - Historical Rap
**Mode:** Unity Kling
**Aspect Ratio:** 9:16 (YouTube Shorts/TikTok vertical)
**Duration:** Short-form content

**Content Details:**
- Topic: ${topic}
- Vibe: Epic Historical
- Battle Type: historical_figure`;

      const promptWithHooks =
        basePrompt +
        hookGuidance +
        `

**Requirements:**
1. Title should be viral-worthy with emojis
   - If PROVEN TITLE FORMULAS are provided above, prefer adapting one of those patterns
2. Description should include hook, summary, disclosure
3. Tags for discoverability`;

      const promptWithoutHooks =
        basePrompt +
        `

**Requirements:**
1. Title should be viral-worthy with emojis
2. Description should include hook, summary, disclosure
3. Tags for discoverability`;

      res.json({
        success: true,
        data: {
          hookTemplatesCount: hookTemplates.length,
          hookTemplates: hookTemplates.slice(0, 5).map((t: any) => ({
            template: t.template,
            category: t.category,
            confidence: t.confidence,
          })),
          hookGuidanceIncluded: hookGuidance.length > 0,
          hookGuidanceLength: hookGuidance.length,
          promptWithHooks: promptWithHooks,
          promptWithoutHooks: promptWithoutHooks,
          difference:
            hookGuidance.length > 0
              ? 'PROMPTS ARE DIFFERENT - Analytics feedback IS being injected'
              : 'WARNING: Prompts identical - No analytics feedback!',
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // CREATIVE ANALYTICS API ROUTES
  // ============================================================================

  // Get creative analytics insights (thumbnail/title/hook patterns)
  router.get('/creative-analytics', async (req, res) => {
    try {
      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');
      const insights = creativeAnalyticsService.getInsights();
      const stats = creativeAnalyticsService.getStats();
      const formulas = creativeAnalyticsService.getWinningFormulas();
      res.json({
        success: true,
        data: {
          insights,
          stats,
          formulas,
        },
      });
    } catch (error: any) {
      console.error('Creative analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all creative patterns
  router.get('/creative-analytics/patterns', async (req, res) => {
    try {
      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');
      const patterns = creativeAnalyticsService.getAllPatterns();
      res.json({ success: true, data: patterns });
    } catch (error: any) {
      console.error('Creative patterns error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get winning formulas for content generation
  router.get('/creative-analytics/formulas', async (req, res) => {
    try {
      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');
      const formulas = creativeAnalyticsService.getWinningFormulas();
      res.json({ success: true, data: formulas });
    } catch (error: any) {
      console.error('Winning formulas error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Sync creative analytics with YouTube data
  router.post('/creative-analytics/sync', async (req, res) => {
    try {
      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');

      // Get detailed metrics first
      const metrics = await youtubeAnalyticsService.getDetailedMetrics();

      // Enhance with advanced analytics (CTR, retention) for top videos
      const videosForSync = await Promise.all(
        metrics.slice(0, 30).map(async (m) => {
          // Try to get advanced analytics with CTR and retention
          let ctr = m.clickThroughRate || 0;
          let avgViewPercentage = m.averageViewPercentage || 0;
          let impressions = m.impressions || 0;
          let avgViewDuration = m.averageViewDuration || 0;

          // If no advanced data, try fetching it
          if (ctr === 0 || avgViewPercentage === 0) {
            try {
              const advancedMetrics = await youtubeAnalyticsService.getAdvancedAnalytics(m.videoId);
              if (advancedMetrics) {
                ctr = advancedMetrics.clickThroughRate || ctr;
                avgViewPercentage = advancedMetrics.averageViewPercentage || avgViewPercentage;
                impressions = advancedMetrics.impressions || impressions;
                avgViewDuration = advancedMetrics.averageViewDurationSeconds || avgViewDuration;
              }
            } catch (err) {
              // Continue with basic data if advanced fails
            }
          }

          return {
            id: m.videoId,
            youtubeId: m.videoId,
            title: m.title,
            figure: m.title.split(':')[0]?.trim() || m.title.split('-')[0]?.trim() || m.title,
            impressions,
            ctr,
            views: m.viewCount,
            avgViewDuration,
            avgViewPercentage,
            engagementRate: m.engagementRate || 0,
          };
        }),
      );

      await creativeAnalyticsService.syncWithYouTubeData(videosForSync);

      const stats = creativeAnalyticsService.getStats();
      res.json({
        success: true,
        message: `Synced ${videosForSync.length} videos with CTR and retention data`,
        data: stats,
      });
    } catch (error: any) {
      console.error('Creative sync error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Analyze patterns manually
  router.post('/creative-analytics/analyze', async (req, res) => {
    try {
      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');
      const insights = await creativeAnalyticsService.analyzePatterns();
      res.json({ success: true, data: insights });
    } catch (error: any) {
      console.error('Pattern analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get performance data for all tracked videos
  router.get('/creative-analytics/performance', async (req, res) => {
    try {
      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');
      const data = creativeAnalyticsService.getAllPerformanceData();
      res.json({ success: true, data });
    } catch (error: any) {
      console.error('Performance data error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate optimized creative elements
  router.post('/creative-analytics/generate', async (req, res) => {
    try {
      const { figure, figure2, theme, achievement } = req.body;
      if (!figure) {
        return res.status(400).json({ error: 'figure is required' });
      }

      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');

      const optimizedHook = creativeAnalyticsService.generateOptimizedHook(
        figure,
        achievement || `conquered the ancient world`,
      );
      const optimizedThumbnail = creativeAnalyticsService.generateOptimizedThumbnailPrompt(figure, figure2);
      const optimizedTitle = creativeAnalyticsService.generateOptimizedTitle(figure, theme || 'Epic History');

      res.json({
        success: true,
        data: {
          hook: optimizedHook,
          thumbnailPrompt: optimizedThumbnail,
          title: optimizedTitle,
        },
      });
    } catch (error: any) {
      console.error('Generate creative error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get thumbnail variant stats (legacy)
  router.get('/creative-analytics/thumbnail-variants', async (req, res) => {
    try {
      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');
      const stats = creativeAnalyticsService.getThumbnailVariantStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Thumbnail variants error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Manually recalculate thumbnail variant weights
  router.post('/creative-analytics/recalculate-weights', async (req, res) => {
    try {
      const { creativeAnalyticsService } = await import('../services/creative-analytics-service');
      creativeAnalyticsService.recalculateVariantWeights();
      const stats = creativeAnalyticsService.getThumbnailVariantStats();
      res.json({ success: true, data: stats, message: 'Weights recalculated based on CTR performance' });
    } catch (error: any) {
      console.error('Recalculate weights error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // RETENTION-CLIP CORRELATOR ENDPOINTS
  // Cross-reference YouTube retention with clips/audio to find drop-off causes
  // ============================================================================

  // Correlate retention data with clip/audio information
  router.post('/retention/correlate', async (req, res) => {
    try {
      const { retentionClipCorrelator } = await import('../services/retention-clip-correlator');
      const { videoId, packageId, retentionData, audioPath, clipDuration, clipPrompts } = req.body;

      if (!videoId || !packageId || !retentionData) {
        return res.status(400).json({
          success: false,
          error: 'videoId, packageId, and retentionData required',
        });
      }

      const report = await retentionClipCorrelator.correlateRetention(videoId, packageId, retentionData, {
        audioPath,
        clipDuration,
        clipPrompts,
      });

      res.json({ success: true, data: report });
    } catch (error: any) {
      console.error('Retention correlation error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Apply style bandit updates from retention analysis
  router.post('/retention/apply-feedback', async (req, res) => {
    try {
      const { retentionClipCorrelator } = await import('../services/retention-clip-correlator');
      const { styleBanditUpdates } = req.body;

      if (!styleBanditUpdates || !Array.isArray(styleBanditUpdates)) {
        return res.status(400).json({
          success: false,
          error: 'styleBanditUpdates array required',
        });
      }

      await retentionClipCorrelator.applyStyleBanditUpdates(styleBanditUpdates);

      res.json({
        success: true,
        data: { appliedUpdates: styleBanditUpdates.length },
      });
    } catch (error: any) {
      console.error('Apply feedback error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Analyze retention for a video and automatically apply learnings
  router.post('/retention/analyze-and-learn', async (req, res) => {
    try {
      const { retentionClipCorrelator } = await import('../services/retention-clip-correlator');
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const { videoId, packageId, audioPath, clipDuration, clipPrompts } = req.body;

      if (!videoId || !packageId) {
        return res.status(400).json({
          success: false,
          error: 'videoId and packageId required',
        });
      }

      // Get retention data from YouTube
      let retentionData;
      try {
        const analytics = await youtubeAnalyticsService.getAdvancedAnalytics(videoId);
        if (analytics && analytics.retentionCurve) {
          retentionData = analytics.retentionCurve.map((point: any) => ({
            second: point.second,
            retention: point.percentage,
          }));
        }
      } catch (ytError) {
        console.warn('Could not fetch YouTube retention data:', ytError);
        return res.status(400).json({
          success: false,
          error: 'Could not fetch YouTube retention data. Video may be too new or private.',
        });
      }

      if (!retentionData || retentionData.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No retention data available for this video',
        });
      }

      // Correlate retention with clips
      const report = await retentionClipCorrelator.correlateRetention(videoId, packageId, retentionData, {
        audioPath,
        clipDuration,
        clipPrompts,
      });

      // Apply learnings to style bandit
      await retentionClipCorrelator.applyStyleBanditUpdates(report.styleBanditUpdates);

      res.json({
        success: true,
        data: {
          report,
          learningsApplied: report.styleBanditUpdates.length,
          promptSuggestions: report.promptOptimizationSuggestions.length,
        },
      });
    } catch (error: any) {
      console.error('Analyze and learn error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // CHARACTER FIGURE BANDIT ROUTES
  // ============================================================

  router.get('/analytics/character-bandit/profile', async (req, res) => {
    try {
      const { characterFigureBandit } = await import('../services/character-figure-bandit');
      const profile = characterFigureBandit.selectCharacterProfile();
      res.json({ success: true, data: profile });
    } catch (error: any) {
      console.error('Character bandit profile error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/character-bandit/select', async (req, res) => {
    try {
      const { characterFigureBandit } = await import('../services/character-figure-bandit');
      const { candidates } = req.body;
      if (!candidates || !Array.isArray(candidates)) {
        return res.status(400).json({ success: false, error: 'candidates array required' });
      }
      const result = characterFigureBandit.selectFromCandidates(candidates);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Character bandit select error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/character-bandit/record', async (req, res) => {
    try {
      const { characterFigureBandit } = await import('../services/character-figure-bandit');
      const { character, attributes, views24h, retention8s, ctr, videoId } = req.body;
      if (!character || !attributes || views24h === undefined || retention8s === undefined) {
        return res.status(400).json({ success: false, error: 'character, attributes, views24h, retention8s required' });
      }
      characterFigureBandit.recordResult(character, attributes, views24h, retention8s, ctr || 0, videoId);
      res.json({ success: true, message: 'Result recorded' });
    } catch (error: any) {
      console.error('Character bandit record error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/character-bandit/rankings', async (req, res) => {
    try {
      const { characterFigureBandit } = await import('../services/character-figure-bandit');
      const rankings = characterFigureBandit.getAllRankings();
      res.json({ success: true, data: rankings });
    } catch (error: any) {
      console.error('Character bandit rankings error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/character-bandit/top-characters', async (req, res) => {
    try {
      const { characterFigureBandit } = await import('../services/character-figure-bandit');
      const n = parseInt(req.query.n as string) || 10;
      const top = characterFigureBandit.getTopCharacters(n);
      res.json({ success: true, data: top });
    } catch (error: any) {
      console.error('Character bandit top characters error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/character-bandit/stats', async (req, res) => {
    try {
      const { characterFigureBandit } = await import('../services/character-figure-bandit');
      const stats = characterFigureBandit.getStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Character bandit stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // UNIFIED ANALYTICS DASHBOARD ENDPOINTS
  // ============================================================

  router.get('/analytics/bandits', async (req, res) => {
    try {
      const { characterFigureBandit } = await import('../services/character-figure-bandit');
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');

      const charRankings = (characterFigureBandit as any).getAllRankings();
      const styleStatus = (sunoStyleBandit as any).getStatus();

      const characters = charRankings.map((r: any) => ({
        name: r.character || r.name,
        successes: r.successes || 0,
        failures: r.failures || 0,
        selectionCount: r.selections || r.totalVideos || 0,
        winRate: r.winRate || 0,
      }));

      const styles = (styleStatus.arms || []).map((arm: any) => ({
        name: arm.styleId || arm.name,
        successes: arm.successes || 0,
        failures: arm.failures || 0,
        selectionCount: arm.selections || 0,
        winRate: arm.winRate || 0,
      }));

      res.json({ success: true, data: { characters, styles } });
    } catch (error: any) {
      console.error('Unified bandits error:', error);
      res.json({ success: true, data: { characters: [], styles: [] } });
    }
  });


  router.get('/analytics/suggested-topics', async (req, res) => {
    try {
      const { characterFigureBandit } = await import('../services/character-figure-bandit');
      const topCharacters = characterFigureBandit.getTopCharacters(5);

      const suggestions = topCharacters.map((char: any, i: number) => ({
        topic: char.character || char.name,
        reason: `High performer with ${((char.winRate || 0) * 100).toFixed(0)}% win rate`,
        score: 100 - i * 10,
      }));

      res.json({ success: true, data: suggestions });
    } catch (error: any) {
      console.error('Suggested topics error:', error);
      res.json({ success: true, data: [] });
    }
  });


  // ============================================================
  // PROMPT QUALITY SCORING ROUTES
  // ============================================================

  router.post('/analytics/prompt-quality/score', async (req, res) => {
    try {
      const { promptQualityScoring } = await import('../services/prompt-quality-scoring');
      const { videoPath, prompt, regenerations, generationTime, manualScores } = req.body;
      if (!videoPath || !prompt) {
        return res.status(400).json({ success: false, error: 'videoPath and prompt required' });
      }
      const score = promptQualityScoring.scoreVideo(
        videoPath,
        prompt,
        regenerations || 0,
        generationTime || 0,
        manualScores,
      );
      res.json({ success: true, data: score });
    } catch (error: any) {
      console.error('Prompt quality score error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/prompt-quality/analyze', async (req, res) => {
    try {
      const { promptQualityScoring } = await import('../services/prompt-quality-scoring');
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt required' });
      }
      const elements = promptQualityScoring.analyzePrompt(prompt);
      res.json({ success: true, data: elements });
    } catch (error: any) {
      console.error('Prompt analyze error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/prompt-quality/enhance', async (req, res) => {
    try {
      const { promptQualityScoring } = await import('../services/prompt-quality-scoring');
      const { prompt } = req.body;
      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt required' });
      }
      const enhanced = promptQualityScoring.enhancePrompt(prompt);
      res.json({ success: true, data: enhanced });
    } catch (error: any) {
      console.error('Prompt enhance error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/prompt-quality/patterns', async (req, res) => {
    try {
      const { promptQualityScoring } = await import('../services/prompt-quality-scoring');
      const rankings = promptQualityScoring.getPatternRankings();
      res.json({ success: true, data: rankings });
    } catch (error: any) {
      console.error('Prompt patterns error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/prompt-quality/stats', async (req, res) => {
    try {
      const { promptQualityScoring } = await import('../services/prompt-quality-scoring');
      const stats = promptQualityScoring.getStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Prompt quality stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // COMMENT SENTIMENT LOOP ROUTES
  // ============================================================

  router.post('/analytics/comments/analyze', async (req, res) => {
    try {
      const { commentSentimentLoop } = await import('../services/comment-sentiment-loop');
      const { comment } = req.body;
      if (!comment) {
        return res.status(400).json({ success: false, error: 'comment required' });
      }
      const analysis = commentSentimentLoop.analyzeComment(comment);
      res.json({ success: true, data: analysis });
    } catch (error: any) {
      console.error('Comment analyze error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/comments/record', async (req, res) => {
    try {
      const { commentSentimentLoop } = await import('../services/comment-sentiment-loop');
      const { videoId, comment } = req.body;
      if (!videoId || !comment) {
        return res.status(400).json({ success: false, error: 'videoId and comment required' });
      }
      const analysis = commentSentimentLoop.recordComment(videoId, comment);
      res.json({ success: true, data: analysis });
    } catch (error: any) {
      console.error('Comment record error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/comments/record-batch', async (req, res) => {
    try {
      const { commentSentimentLoop } = await import('../services/comment-sentiment-loop');
      const { videoId, comments } = req.body;
      if (!videoId || !comments || !Array.isArray(comments)) {
        return res.status(400).json({ success: false, error: 'videoId and comments array required' });
      }
      const analyses = commentSentimentLoop.recordBatch(videoId, comments);
      res.json({ success: true, data: { count: analyses.length, analyses } });
    } catch (error: any) {
      console.error('Comment batch record error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/comments/video/:videoId', async (req, res) => {
    try {
      const { commentSentimentLoop } = await import('../services/comment-sentiment-loop');
      const summary = commentSentimentLoop.getVideoSummary(req.params.videoId);
      if (!summary) {
        return res.status(404).json({ success: false, error: 'No comments found for video' });
      }
      res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('Comment video summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/comments/characters', async (req, res) => {
    try {
      const { commentSentimentLoop } = await import('../services/comment-sentiment-loop');
      const sentiment = commentSentimentLoop.getCharacterSentiment();
      res.json({ success: true, data: sentiment });
    } catch (error: any) {
      console.error('Character sentiment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/comments/requests', async (req, res) => {
    try {
      const { commentSentimentLoop } = await import('../services/comment-sentiment-loop');
      const n = parseInt(req.query.n as string) || 10;
      const requests = commentSentimentLoop.getTopRequests(n);
      res.json({ success: true, data: requests });
    } catch (error: any) {
      console.error('Comment requests error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/comments/stats', async (req, res) => {
    try {
      const { commentSentimentLoop } = await import('../services/comment-sentiment-loop');
      const stats = commentSentimentLoop.getStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Comment stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // DESCRIPTION & TAGS OPTIMIZER ROUTES
  // ============================================================

  router.post('/analytics/seo/record', async (req, res) => {
    try {
      const { descriptionTagsOptimizer } = await import('../services/description-tags-optimizer');
      const {
        videoId,
        title,
        tags,
        description,
        searchTrafficPct,
        browseTrafficPct,
        externalTrafficPct,
        views24h,
        views7d,
        ctr,
      } = req.body;
      if (!videoId || !title || !tags || !description) {
        return res.status(400).json({ success: false, error: 'videoId, title, tags, description required' });
      }
      descriptionTagsOptimizer.recordVideo(
        videoId,
        title,
        tags,
        description,
        searchTrafficPct || 0,
        browseTrafficPct || 0,
        externalTrafficPct || 0,
        views24h || 0,
        views7d || 0,
        ctr || 0,
      );
      res.json({ success: true, message: 'SEO record saved' });
    } catch (error: any) {
      console.error('SEO record error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/seo/tag-rankings', async (req, res) => {
    try {
      const { descriptionTagsOptimizer } = await import('../services/description-tags-optimizer');
      const minUses = parseInt(req.query.minUses as string) || 3;
      const rankings = descriptionTagsOptimizer.getTagRankings(minUses);
      res.json({ success: true, data: rankings });
    } catch (error: any) {
      console.error('Tag rankings error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/seo/suggest-tags', async (req, res) => {
    try {
      const { descriptionTagsOptimizer } = await import('../services/description-tags-optimizer');
      const { topic, character, theme, era, maxTags } = req.body;
      if (!topic) {
        return res.status(400).json({ success: false, error: 'topic required' });
      }
      const tags = descriptionTagsOptimizer.suggestTags(topic, character, theme, era, maxTags || 15);
      res.json({ success: true, data: tags });
    } catch (error: any) {
      console.error('Suggest tags error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/seo/correlations', async (req, res) => {
    try {
      const { descriptionTagsOptimizer } = await import('../services/description-tags-optimizer');
      const correlations = descriptionTagsOptimizer.getTagCorrelations();
      res.json({ success: true, data: correlations });
    } catch (error: any) {
      console.error('Tag correlations error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/seo/description-patterns', async (req, res) => {
    try {
      const { descriptionTagsOptimizer } = await import('../services/description-tags-optimizer');
      const patterns = descriptionTagsOptimizer.getDescriptionPatternPerformance();
      res.json({ success: true, data: patterns });
    } catch (error: any) {
      console.error('Description patterns error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/seo/generate-description', async (req, res) => {
    try {
      const { descriptionTagsOptimizer } = await import('../services/description-tags-optimizer');
      const { topic, character, hookLine } = req.body;
      if (!topic) {
        return res.status(400).json({ success: false, error: 'topic required' });
      }
      const description = descriptionTagsOptimizer.generateOptimalDescription(topic, character, hookLine);
      res.json({ success: true, data: { description } });
    } catch (error: any) {
      console.error('Generate description error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/seo/stats', async (req, res) => {
    try {
      const { descriptionTagsOptimizer } = await import('../services/description-tags-optimizer');
      const stats = descriptionTagsOptimizer.getStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('SEO stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // FEATURE CORRELATION ANALYZER ROUTES (Librosa → YouTube Retention)
  // ============================================================

  router.post('/analytics/correlation/record', async (req, res) => {
    try {
      const { featureCorrelationAnalyzer } = await import('../services/feature-correlation-analyzer');
      const { videoId, title, audioFeatures, performance } = req.body;
      if (!videoId || !title || !audioFeatures || !performance) {
        return res.status(400).json({ success: false, error: 'videoId, title, audioFeatures, performance required' });
      }
      featureCorrelationAnalyzer.recordVideoFeatures(videoId, title, audioFeatures, performance);
      res.json({ success: true, message: 'Feature record saved' });
    } catch (error: any) {
      console.error('Correlation record error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/correlation/analyze', async (req, res) => {
    try {
      const { featureCorrelationAnalyzer } = await import('../services/feature-correlation-analyzer');
      const minSamples = parseInt(req.query.minSamples as string) || 5;
      const directive = featureCorrelationAnalyzer.analyzeCorrelations(minSamples);
      if (!directive) {
        return res.status(400).json({ success: false, error: `Need at least ${minSamples} samples for analysis` });
      }
      res.json({ success: true, data: directive });
    } catch (error: any) {
      console.error('Correlation analyze error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/correlation/stats', async (req, res) => {
    try {
      const { featureCorrelationAnalyzer } = await import('../services/feature-correlation-analyzer');
      const stats = featureCorrelationAnalyzer.getFeatureStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Correlation stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/correlation/top-performers', async (req, res) => {
    try {
      const { featureCorrelationAnalyzer } = await import('../services/feature-correlation-analyzer');
      const n = parseInt(req.query.n as string) || 5;
      const top = featureCorrelationAnalyzer.getTopPerformers(n);
      res.json({ success: true, data: top });
    } catch (error: any) {
      console.error('Top performers error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/correlation/directive', async (req, res) => {
    try {
      const { featureCorrelationAnalyzer } = await import('../services/feature-correlation-analyzer');
      const directive = featureCorrelationAnalyzer.getLatestDirective();
      if (!directive) {
        return res
          .status(404)
          .json({ success: false, error: 'No directive generated yet. Record data and call /analyze first.' });
      }
      res.json({ success: true, data: directive });
    } catch (error: any) {
      console.error('Get directive error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/analytics/correlation/report', async (req, res) => {
    try {
      const { featureCorrelationAnalyzer } = await import('../services/feature-correlation-analyzer');
      const report = featureCorrelationAnalyzer.printReport();
      res.json({ success: true, data: { report } });
    } catch (error: any) {
      console.error('Correlation report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/analytics/correlation/import-csv', async (req, res) => {
    try {
      const { featureCorrelationAnalyzer } = await import('../services/feature-correlation-analyzer');
      const { csvData } = req.body;
      if (!csvData) {
        return res.status(400).json({ success: false, error: 'csvData required' });
      }
      const imported = featureCorrelationAnalyzer.importFromCSV(csvData);
      res.json({ success: true, data: { imported } });
    } catch (error: any) {
      console.error('CSV import error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // =====================================================
  // STRATEGIC SUMMARY ROUTES
  // Nightly AI-generated system analysis (Ask Studio style)
  // =====================================================

  router.get('/strategic-summary/latest', async (req, res) => {
    try {
      const { strategicSummaryService } = await import('../services/strategic-summary-service');
      const summary = await strategicSummaryService.getLatestSummary();

      res.json({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      console.error('Get latest summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/strategic-summary/history', async (req, res) => {
    try {
      const { strategicSummaryService } = await import('../services/strategic-summary-service');
      const days = parseInt(req.query.days as string) || 7;
      const summaries = await strategicSummaryService.getRecentSummaries(days);

      res.json({
        success: true,
        data: summaries,
        meta: { count: summaries.length, days },
      });
    } catch (error: any) {
      console.error('Get summary history error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/strategic-summary/generate', async (req, res) => {
    try {
      // Rate limit: Prevent running more than once per hour
      if (lastStrategicSummaryRun) {
        const timeSinceLastRun = Date.now() - lastStrategicSummaryRun.getTime();
        if (timeSinceLastRun < STRATEGIC_SUMMARY_COOLDOWN_MS) {
          const minutesRemaining = Math.ceil((STRATEGIC_SUMMARY_COOLDOWN_MS - timeSinceLastRun) / 60000);
          console.warn(`🚫 Strategic summary rate limited: ${minutesRemaining} minutes remaining`);
          return res.status(429).json({
            success: false,
            error: 'Rate limit: Strategic summary can only run once per hour',
            minutesRemaining,
            nextAllowedTime: new Date(lastStrategicSummaryRun.getTime() + STRATEGIC_SUMMARY_COOLDOWN_MS),
          });
        }
      }

      // Cost protection: Check if we can afford this operation
      const { costGuard } = await import('../services/cost-guard');
      const costCheck = await costGuard.canProceed(3.0, 'strategic_summary_generate');

      if (!costCheck.allowed) {
        console.warn('🚫 Strategic summary blocked by cost guard:', costCheck.reason);
        return res.status(429).json({
          success: false,
          error: 'Cost limit reached',
          reason: costCheck.reason,
        });
      }

      console.log('✅ Strategic summary starting (passed rate limit + cost guard)');
      const { strategicSummaryService } = await import('../services/strategic-summary-service');
      const summary = await strategicSummaryService.generateNightlySummary();

      // Update last run time
      lastStrategicSummaryRun = new Date();

      res.json({
        success: true,
        message: 'Strategic summary generated successfully',
        data: summary,
      });
    } catch (error: any) {
      console.error('Generate summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Interactive Q&A endpoint - Ask questions about strategic data
  router.post('/strategic-summary/ask', async (req, res) => {
    try {
      const { strategicSummaryService } = await import('../services/strategic-summary-service');
      const { question, model = 'claude' } = req.body;

      if (!question) {
        return res.status(400).json({ success: false, error: 'Question is required' });
      }

      const result = await strategicSummaryService.askQuestion(question, model);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Strategic Q&A error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Update specific insight section with optional feedback
  router.post('/strategic-summary/update-insight', async (req, res) => {
    try {
      const { strategicSummaryService } = await import('../services/strategic-summary-service');
      const { section, feedback } = req.body;

      const validSections = ['themes', 'lyrics', 'audio', 'thumbnails', 'postingTimes'];
      if (!section || !validSections.includes(section)) {
        return res.status(400).json({
          success: false,
          error: `Section must be one of: ${validSections.join(', ')}`,
        });
      }

      const insight = await strategicSummaryService.updateInsight(section, feedback);

      res.json({
        success: true,
        data: { section, insight },
      });
    } catch (error: any) {
      console.error('Update insight error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Apply consensus recommendations to system components (bandits, priorities, etc.)
  router.post('/strategic-summary/apply-consensus', async (req, res) => {
    try {
      console.log(`🔄 [API] Consensus apply requested`);

      const { consensusApplierService } = await import('../services/consensus-applier-service');
      const result = await consensusApplierService.applyLatestConsensus();

      res.json({
        success: true,
        data: result,
        message: `Applied ${result.applied} directives (${result.skipped} skipped, ${result.errors} errors)`,
      });
    } catch (error: any) {
      console.error('Consensus apply error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get status of consensus application system
  router.get('/strategic-summary/apply-status', async (req, res) => {
    try {
      const { consensusApplierService } = await import('../services/consensus-applier-service');
      const status = await consensusApplierService.getApplicationHistory();

      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error('Apply status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // =====================================================
  // STRATEGIC INSIGHTS INJECTOR ROUTES
  // Closes the feedback loop by injecting AI recommendations
  // =====================================================

  router.get('/strategic-insights/status', async (req, res) => {
    try {
      const { strategicInsightsInjector } = await import('../services/strategic-insights-injector');
      const insights = await strategicInsightsInjector.getInjectedInsights();
      const summary = await strategicInsightsInjector.getInsightsSummary();

      res.json({
        success: true,
        data: {
          active: !!insights,
          summary,
          insights,
        },
      });
    } catch (error: any) {
      console.error('Strategic insights status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/strategic-insights/refresh', async (req, res) => {
    try {
      const { strategicInsightsInjector } = await import('../services/strategic-insights-injector');
      strategicInsightsInjector.clearCache();
      const insights = await strategicInsightsInjector.getInjectedInsights();

      res.json({
        success: true,
        message: 'Strategic insights cache refreshed',
        data: insights,
      });
    } catch (error: any) {
      console.error('Strategic insights refresh error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/strategic-insights/lyric-injection', async (req, res) => {
    try {
      const { strategicInsightsInjector } = await import('../services/strategic-insights-injector');
      const injection = await strategicInsightsInjector.getLyricInjection();

      res.json({
        success: true,
        data: { injection },
      });
    } catch (error: any) {
      console.error('Lyric injection error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/strategic-insights/audio-preferences', async (req, res) => {
    try {
      const { strategicInsightsInjector } = await import('../services/strategic-insights-injector');
      const preferences = await strategicInsightsInjector.getAudioStylePreferences();

      res.json({
        success: true,
        data: preferences,
      });
    } catch (error: any) {
      console.error('Audio preferences error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // RETENTION OPTIMIZER API ENDPOINTS
  // ============================================================================

  router.post('/retention/optimize', async (req, res) => {
    try {
      const { script, videoDurationSeconds, aspectRatio, topic, isRoyaltyFree } = req.body;

      if (!script) {
        return res.status(400).json({ success: false, error: 'script is required' });
      }

      const { retentionOptimizer } = await import('../services/retention-optimizer-service');

      const optimization = await retentionOptimizer.optimizeForRetention({
        script,
        videoDurationSeconds: videoDurationSeconds || 60,
        aspectRatio: aspectRatio || '9:16',
        topic: topic || 'Historical Figure',
        isRoyaltyFree: isRoyaltyFree || false,
      });

      console.log(`♻️ [Retention API] Optimization complete. Score: ${optimization.retentionScore}/100`);

      res.json({ success: true, data: optimization });
    } catch (error: any) {
      console.error('♻️ [Retention API] Error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/retention/benchmarks', async (req, res) => {
    try {
      const { RETENTION_BENCHMARKS, EMOTIONAL_TRIGGERS, PATTERN_INTERRUPT_TYPES, SMART_CHAPTERS } =
        await import('../services/retention-optimizer-service');

      res.json({
        success: true,
        data: {
          benchmarks: RETENTION_BENCHMARKS,
          emotionalTriggers: EMOTIONAL_TRIGGERS,
          patternInterruptTypes: PATTERN_INTERRUPT_TYPES,
          smartChapters: SMART_CHAPTERS,
        },
      });
    } catch (error: any) {
      console.error('♻️ [Retention API] Benchmarks error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/retention/analyze-hook', async (req, res) => {
    try {
      const { script, firstThreeSecondsContent } = req.body;

      if (!script) {
        return res.status(400).json({ success: false, error: 'script is required' });
      }

      const { retentionOptimizer } = await import('../services/retention-optimizer-service');
      const hookAnalysis = await retentionOptimizer.analyzeHookStrength(script, firstThreeSecondsContent);

      res.json({ success: true, data: hookAnalysis });
    } catch (error: any) {
      console.error('♻️ [Retention API] Hook analysis error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/retention/detect-triggers', async (req, res) => {
    try {
      const { script } = req.body;

      if (!script) {
        return res.status(400).json({ success: false, error: 'script is required' });
      }

      const { retentionOptimizer } = await import('../services/retention-optimizer-service');
      const triggers = await retentionOptimizer.detectEmotionalTriggers(script);

      res.json({ success: true, data: { triggers } });
    } catch (error: any) {
      console.error('♻️ [Retention API] Trigger detection error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/retention/pattern-interrupts', async (req, res) => {
    try {
      const videoDurationSeconds = parseInt(req.query.duration as string) || 60;
      const clipDuration = parseInt(req.query.clipDuration as string) || 5;

      const { retentionOptimizer } = await import('../services/retention-optimizer-service');
      const interrupts = retentionOptimizer.generatePatternInterrupts(videoDurationSeconds, clipDuration);

      res.json({
        success: true,
        data: {
          videoDurationSeconds,
          clipDuration,
          interruptCount: interrupts.length,
          interrupts,
        },
      });
    } catch (error: any) {
      console.error('♻️ [Retention API] Pattern interrupts error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/retention/smart-chapters', async (req, res) => {
    try {
      const videoDurationSeconds = parseInt(req.query.duration as string) || 60;

      const { retentionOptimizer } = await import('../services/retention-optimizer-service');
      const chapters = retentionOptimizer.getSmartChapters(videoDurationSeconds);
      const hookPoints = retentionOptimizer.getMidVideoHookPoints(videoDurationSeconds);

      res.json({
        success: true,
        data: {
          videoDurationSeconds,
          chapters,
          hookPoints,
        },
      });
    } catch (error: any) {
      console.error('♻️ [Retention API] Smart chapters error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
