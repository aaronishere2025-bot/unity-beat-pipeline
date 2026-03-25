/**
 * Content Strategy Routes
 *
 * Content strategy, agent scheduler, video scheduler, gap detection, vector memory.
 */

import { Router } from 'express';


const router = Router();




  // =====================================================
  // GAP DETECTION ROUTES
  // Analyze competitor content and find content opportunities
  // =====================================================

  router.get('/gaps', async (req, res) => {
    try {
      const { gapDetectionService } = await import('../services/gap-detection-service');
      const limit = parseInt(req.query.limit as string) || 20;

      let gaps = gapDetectionService.getCachedGaps();
      if (gaps.length === 0) {
        gaps = await gapDetectionService.findContentGaps(limit);
      }

      res.json({
        success: true,
        data: gaps.slice(0, limit),
        meta: {
          total: gaps.length,
          lastRefresh: gapDetectionService.getLastRefreshTime(),
          configured: gapDetectionService.isConfigured(),
        },
      });
    } catch (error: any) {
      console.error('Get gaps error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/gaps/opportunities', async (req, res) => {
    try {
      const { gapDetectionService } = await import('../services/gap-detection-service');
      const opportunities = await gapDetectionService.getTopOpportunities();

      res.json({
        success: true,
        data: opportunities,
        meta: {
          count: opportunities.length,
          lastRefresh: gapDetectionService.getLastRefreshTime(),
        },
      });
    } catch (error: any) {
      console.error('Get opportunities error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get extension opportunities - topics we've covered but can do better
  router.get('/gaps/extensions', async (req, res) => {
    try {
      const { gapDetectionService } = await import('../services/gap-detection-service');
      const extensions = await gapDetectionService.getExtensionOpportunities();

      res.json({
        success: true,
        data: extensions,
        meta: {
          count: extensions.length,
          description: 'Topics we covered but competitors are crushing - fresh angle opportunities',
          lastRefresh: gapDetectionService.getLastRefreshTime(),
        },
      });
    } catch (error: any) {
      console.error('Get extensions error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get ALL opportunities - both gaps and extensions
  router.get('/gaps/all', async (req, res) => {
    try {
      const { gapDetectionService } = await import('../services/gap-detection-service');
      const all = await gapDetectionService.getAllOpportunities();

      res.json({
        success: true,
        data: all,
        meta: {
          gapCount: all.gaps.length,
          extensionCount: all.extensions.length,
          lastRefresh: gapDetectionService.getLastRefreshTime(),
        },
      });
    } catch (error: any) {
      console.error('Get all opportunities error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/gaps/refresh', async (req, res) => {
    try {
      const { gapDetectionService } = await import('../services/gap-detection-service');
      await gapDetectionService.refreshGapAnalysis();
      const gaps = gapDetectionService.getCachedGaps();

      res.json({
        success: true,
        message: 'Gap analysis refreshed',
        data: {
          gapsFound: gaps.length,
          lastRefresh: gapDetectionService.getLastRefreshTime(),
        },
      });
    } catch (error: any) {
      console.error('Refresh gaps error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/gaps/channel/:channelId', async (req, res) => {
    try {
      const { gapDetectionService } = await import('../services/gap-detection-service');
      const { channelId } = req.params;
      const analysis = await gapDetectionService.analyzeCompetitorChannel(channelId);

      res.json({
        success: true,
        data: analysis,
      });
    } catch (error: any) {
      console.error('Analyze channel error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // GAP DISCOVERY API ENDPOINTS - Auto-find trending topics we haven't covered
  // ============================================================

  // Discover content gaps - finds trending historical topics we haven't made videos about
  router.get('/gap-discovery', async (req, res) => {
    try {
      const { trendWatcherAgentService } = await import('../services/trend-watcher-agent');
      const opportunities = await trendWatcherAgentService.findAllContentOpportunities();

      res.json({
        success: true,
        data: opportunities,
        message: opportunities.summary,
      });
    } catch (error: any) {
      console.error('Gap discovery error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get just the content gaps (trending topics not covered)
  router.get('/gap-discovery/gaps', async (req, res) => {
    try {
      const { trendWatcherAgentService } = await import('../services/trend-watcher-agent');
      const gaps = await trendWatcherAgentService.discoverContentGaps();

      res.json({
        success: true,
        data: gaps,
        count: gaps.length,
        message:
          gaps.length > 0
            ? `Found ${gaps.length} untapped topics! Top: ${gaps[0]?.topic}`
            : 'No gaps found - great coverage!',
      });
    } catch (error: any) {
      console.error('Gap discovery error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get competitor opportunities
  router.get('/gap-discovery/competitors', async (req, res) => {
    try {
      const { trendWatcherAgentService } = await import('../services/trend-watcher-agent');
      const opportunities = await trendWatcherAgentService.discoverCompetitorOpportunities();

      res.json({
        success: true,
        data: opportunities,
        count: opportunities.length,
      });
    } catch (error: any) {
      console.error('Competitor discovery error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get keyword tracking stats
  router.get('/gap-discovery/stats', async (req, res) => {
    try {
      const { trendWatcherAgentService } = await import('../services/trend-watcher-agent');
      const stats = trendWatcherAgentService.getTotalKeywordCount();

      res.json({
        success: true,
        data: {
          ...stats,
          tiers: {
            tier1: 'Core keywords - checked every 6 hours',
            tier2: 'Major figures - checked every 24 hours',
            tier3: 'Battles & events - checked every 72 hours',
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // VECTOR MEMORY ROUTES
  // ============================================================================

  router.get('/vector-memory/patterns', async (req, res) => {
    try {
      console.log(`🧠 [VectorMemory API] Fetching winning patterns...`);
      const { vectorMemoryService } = await import('../services/vector-memory-service');
      const patterns = await vectorMemoryService.getWinningPatterns();

      console.log(`   ✅ Returned ${patterns.length} winning patterns`);
      res.json({ success: true, data: patterns, count: patterns.length });
    } catch (error: any) {
      console.error('🧠 Vector memory patterns error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/vector-memory/query', async (req, res) => {
    try {
      const { queryText, minRetention = 70, limit = 5 } = req.body;

      if (!queryText || typeof queryText !== 'string') {
        return res.status(400).json({ success: false, error: 'queryText is required and must be a string' });
      }

      console.log(`🧠 [VectorMemory API] Querying similar high-performers for: "${queryText.substring(0, 50)}..."`);
      const { vectorMemoryService } = await import('../services/vector-memory-service');

      const embedding = await vectorMemoryService.generateEmbeddingForQuery(queryText);
      if (!embedding) {
        return res.status(500).json({ success: false, error: 'Failed to generate query embedding' });
      }

      const results = await vectorMemoryService.querySimilarHighPerformers(embedding, minRetention, limit);

      console.log(`   ✅ Found ${results.length} similar high performers`);
      res.json({ success: true, data: results, count: results.length });
    } catch (error: any) {
      console.error('🧠 Vector memory query error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/vector-memory/stats', async (req, res) => {
    try {
      console.log(`🧠 [VectorMemory API] Fetching stats...`);
      const { vectorMemoryService } = await import('../services/vector-memory-service');
      const stats = await vectorMemoryService.getStats();

      console.log(`   ✅ Stats: ${stats.totalVectors} vectors, ${stats.withMetrics} with metrics`);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('🧠 Vector memory stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // CONTENT STRATEGY ENDPOINTS - Content Strategy Agent
  // ============================================================================

  router.post('/content-strategy/generate-plan', async (req, res) => {
    try {
      const { contentStrategyAgent } = await import('../services/content-strategy-agent');
      const { date, videoCount, maxDailyCost } = req.body;

      const plan = await contentStrategyAgent.generateDailyPlan({
        date,
        videoCount,
        maxDailyCost,
      });

      res.json({
        success: true,
        data: plan,
      });
    } catch (error: any) {
      console.error('[Content Strategy] Generate plan error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/content-strategy/current-plan', async (req, res) => {
    try {
      const { contentStrategyAgent } = await import('../services/content-strategy-agent');

      const plan = await contentStrategyAgent.getCurrentPlan();

      res.json({
        success: true,
        data: plan,
      });
    } catch (error: any) {
      console.error('[Content Strategy] Get current plan error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/content-strategy/execute-plan', async (req, res) => {
    try {
      const { contentStrategyAgent } = await import('../services/content-strategy-agent');
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({
          success: false,
          error: 'planId is required',
        });
      }

      // Execute in background
      contentStrategyAgent.executeDailyPlan(planId).catch((error) => {
        console.error('[Content Strategy] Background execution error:', error);
      });

      res.json({
        success: true,
        message: 'Plan execution started in background',
      });
    } catch (error: any) {
      console.error('[Content Strategy] Execute plan error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/content-strategy/calendar', async (req, res) => {
    try {
      const { contentStrategyAgent } = await import('../services/content-strategy-agent');
      const limit = parseInt(req.query.limit as string) || 30;

      const plans = await contentStrategyAgent.getAllPlans(limit);

      res.json({
        success: true,
        data: plans,
      });
    } catch (error: any) {
      console.error('[Content Strategy] Get calendar error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // AGENT SCHEDULER ENDPOINTS - Configure Learning Speed
  // ============================================================================

  router.get('/scheduler/status', async (req, res) => {
    try {
      const { agentScheduler } = await import('../services/agent-scheduler');

      const status = agentScheduler.getStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error('[Scheduler] Status error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/scheduler/orchestrator-interval', async (req, res) => {
    try {
      const { agentScheduler } = await import('../services/agent-scheduler');
      const { minutes } = req.body;

      if (typeof minutes !== 'number' || minutes < 1 || minutes > 1440) {
        return res.status(400).json({
          success: false,
          error: 'minutes must be a number between 1 and 1440 (24 hours)',
        });
      }

      await agentScheduler.setOrchestratorInterval(minutes);

      res.json({
        success: true,
        message: `Orchestrator interval set to ${minutes} minutes`,
        data: agentScheduler.getStatus(),
      });
    } catch (error: any) {
      console.error('[Scheduler] Set interval error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/scheduler/content-strategy-schedules', async (req, res) => {
    try {
      const { agentScheduler } = await import('../services/agent-scheduler');
      const { schedules } = req.body;

      if (!Array.isArray(schedules) || schedules.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'schedules must be a non-empty array of cron expressions',
        });
      }

      // Validate cron expressions (basic check)
      for (const schedule of schedules) {
        if (typeof schedule !== 'string' || schedule.split(' ').length !== 5) {
          return res.status(400).json({
            success: false,
            error: `Invalid cron expression: ${schedule}. Format: "minute hour day month dayOfWeek"`,
          });
        }
      }

      await agentScheduler.setContentStrategySchedules(schedules);

      res.json({
        success: true,
        message: `Content strategy schedules updated (${schedules.length} runs per day)`,
        data: agentScheduler.getStatus(),
      });
    } catch (error: any) {
      console.error('[Scheduler] Set schedules error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // VIDEO SCHEDULER ROUTES - Automatic daily generation & uploads
  // ============================================================================

  // Get scheduler status
  router.get('/scheduler/status', async (req, res) => {
    try {
      const { videoScheduler } = await import('../services/video-scheduler');
      const status = videoScheduler.getStatus();
      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error('[Video Scheduler] Status error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Manually trigger video generation now (for testing)
  router.post('/scheduler/trigger-generation', async (req, res) => {
    try {
      const { videoScheduler } = await import('../services/video-scheduler');

      // Run in background
      videoScheduler.triggerGenerationNow().catch((err) => {
        console.error('[Video Scheduler] Manual generation error:', err.message);
      });

      res.json({
        success: true,
        message: 'Video generation started in background',
      });
    } catch (error: any) {
      console.error('[Video Scheduler] Trigger generation error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Upload slots removed — uploads now happen immediately on job completion
  router.post('/scheduler/trigger-upload', async (_req, res) => {
    res.json({
      success: true,
      message: 'Upload slots removed. Videos now upload immediately on completion via job-worker.',
    });
  });


export default router;
