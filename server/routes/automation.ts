/**
 * Automation Routes
 *
 * Unity automation, autopilot, autonomous goals, topic pool management.
 */

import { Router } from 'express';
import { optionalAuthMiddleware } from '../middleware/auth.js';
import { autonomousGoalAgent } from '../services/autonomous-goal-agent';
import { jobs } from '@shared/schema';


const router = Router();

// Track active refill operations for progress reporting
let activeRefill: { startedAt: number; count: number; status: 'running' | 'done' | 'error'; error?: string } | null =
  null;




  // ============================================================================
  // UNITY AUTOMATION API ROUTES
  // ============================================================================

  // Get automation status
  router.get('/automation/status', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      res.json(orchestrator.getStatus());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Start automation
  router.post('/automation/start', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      await orchestrator.initialize();
      orchestrator.start();
      res.json({ success: true, status: 'started' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Stop automation
  router.post('/automation/stop', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      orchestrator.stop();
      res.json({ success: true, status: 'stopped' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Run content discovery manually
  router.post('/automation/discover', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      const topics = await orchestrator.manualDiscovery();
      res.json({ success: true, topics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Generate video for a specific topic
  router.post('/automation/generate', optionalAuthMiddleware, async (req, res) => {
    try {
      const { figure, story, force } = req.body;
      if (!figure || !story) {
        return res.status(400).json({ error: 'figure and story required' });
      }
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      const video = await orchestrator.manualGenerate(figure, story, force === true, req.user?.id);
      res.json({ success: true, video });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Run full daily pipeline (simple version)
  router.post('/automation/pipeline', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      await orchestrator.runDailyPipeline();
      res.json({ success: true, status: 'completed' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Run full pipeline with analytics first (Analytics → Viral → Generation)
  router.post('/automation/full-pipeline', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      const result = await orchestrator.runFullPipelineWithAnalytics();
      res.json({
        success: true,
        status: 'completed',
        analytics: result.analytics,
        topicsFound: result.discovery,
        videosCreated: result.generation,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // ========== Topic Pool / Character Discovery Routes ==========

  // Get explored topic pool with filtering
  router.get('/automation/topic-pool', async (req, res) => {
    try {
      const { unlimitedTopicExplorer } = await import('../services/unlimited-topic-explorer');
      const status = await unlimitedTopicExplorer.getPoolStatus();
      const breakdown = await unlimitedTopicExplorer.getPoolBreakdown();

      const { db: database } = await import('../db');
      const { exploredTopics } = await import('@shared/schema');
      const { desc, eq: eqOp } = await import('drizzle-orm');

      const statusFilter = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;

      let query = database.select().from(exploredTopics);
      if (statusFilter && statusFilter !== 'all') {
        query = query.where(eqOp(exploredTopics.status, statusFilter)) as any;
      }

      const topics = await (query as any).orderBy(desc(exploredTopics.viralPotential)).limit(limit).execute();

      res.json({ success: true, status, breakdown, topics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Refill topic pool (generate new characters) - non-blocking for large batches
  router.post('/automation/topic-pool/refill', async (req, res) => {
    try {
      const { unlimitedTopicExplorer } = await import('../services/unlimited-topic-explorer');
      const count = req.body.count || 50;

      // For small counts (≤5), run synchronously (fast enough with parallelization)
      if (count <= 5) {
        await unlimitedTopicExplorer.refillPool(count, true);
        const status = await unlimitedTopicExplorer.getPoolStatus();
        const breakdown = await unlimitedTopicExplorer.getPoolBreakdown();
        res.json({ success: true, status, breakdown });
        return;
      }

      // For larger counts, run in background and return immediately
      if (activeRefill?.status === 'running') {
        res.status(409).json({ error: 'A refill is already in progress', startedAt: activeRefill.startedAt });
        return;
      }

      activeRefill = { startedAt: Date.now(), count, status: 'running' };
      res.json({ success: true, async: true, message: `Discovering ${count} characters in background...` });

      // Run in background
      unlimitedTopicExplorer
        .refillPool(count, true)
        .then(() => {
          activeRefill = { ...activeRefill!, status: 'done' };
        })
        .catch((err: any) => {
          activeRefill = { ...activeRefill!, status: 'error', error: err.message };
        });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Check refill progress
  router.get('/automation/topic-pool/refill-status', async (_req, res) => {
    if (!activeRefill) {
      res.json({ active: false });
      return;
    }
    const elapsed = ((Date.now() - activeRefill.startedAt) / 1000).toFixed(1);
    res.json({ active: activeRefill.status === 'running', ...activeRefill, elapsedSeconds: elapsed });
  });


  // Force refresh the pool (clear discovered + generate fresh batch)
  router.post('/automation/topic-pool/refresh', async (req, res) => {
    try {
      const { unlimitedTopicExplorer } = await import('../services/unlimited-topic-explorer');

      if (activeRefill?.status === 'running') {
        res.status(409).json({ error: 'A refill is already in progress', startedAt: activeRefill.startedAt });
        return;
      }

      activeRefill = { startedAt: Date.now(), count: 50, status: 'running' };
      res.json({ success: true, async: true, message: 'Force refresh started in background...' });

      unlimitedTopicExplorer
        .forceRefresh()
        .then(() => {
          activeRefill = { ...activeRefill!, status: 'done' };
        })
        .catch((err: any) => {
          activeRefill = { ...activeRefill!, status: 'error', error: err.message };
        });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Reject a topic
  router.post('/automation/topic-pool/:id/reject', async (req, res) => {
    try {
      const { unlimitedTopicExplorer } = await import('../services/unlimited-topic-explorer');
      const reason = req.body.reason || 'Manually rejected';
      await unlimitedTopicExplorer.rejectTopic(req.params.id, reason);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Batch generate videos from multiple topics
  router.post('/automation/topic-pool/batch-generate', optionalAuthMiddleware, async (req, res) => {
    try {
      const { topicIds } = req.body;
      if (!topicIds || !Array.isArray(topicIds) || topicIds.length === 0) {
        return res.status(400).json({ error: 'topicIds array required' });
      }

      const { db: database } = await import('../db');
      const { exploredTopics } = await import('@shared/schema');
      const { inArray } = await import('drizzle-orm');

      const topics = await database.select().from(exploredTopics).where(inArray(exploredTopics.id, topicIds)).execute();

      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();

      const results: any[] = [];
      for (const topic of topics) {
        try {
          const video = await orchestrator.manualGenerate(topic.primaryName, topic.discoveryAngle, false, req.user?.id);
          results.push({ topicId: topic.id, name: topic.primaryName, success: true, video });
        } catch (err: any) {
          results.push({ topicId: topic.id, name: topic.primaryName, success: false, error: err.message });
        }
      }

      res.json({
        success: true,
        results,
        generated: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Get pending topics
  router.get('/automation/topics', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      res.json({ topics: orchestrator.getPendingTopics() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Get completed videos
  router.get('/automation/videos', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      res.json({ videos: orchestrator.getCompletedVideos() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Get active automation jobs from database
  router.get('/automation/jobs', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      const activeJobs = await orchestrator.getActiveJobs();
      res.json({ success: true, jobs: activeJobs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Get suggested topics (AI-generated suggestions)
  router.get('/automation/suggestions', async (req, res) => {
    try {
      const count = parseInt(req.query.count as string) || 10;
      const { autoContentDiscovery } = await import('../services/auto-content-discovery');
      const suggestions = await autoContentDiscovery.getSuggestions(count);
      res.json({ success: true, suggestions });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Get "This Day in History" topics
  router.get('/automation/this-day', async (req, res) => {
    try {
      const { autoContentDiscovery } = await import('../services/auto-content-discovery');
      const topics = await autoContentDiscovery.getThisDay();
      res.json({ success: true, topics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Get trending historical topics
  router.get('/automation/trending', async (req, res) => {
    try {
      const { autoContentDiscovery } = await import('../services/auto-content-discovery');
      const topics = await autoContentDiscovery.getTrending();
      res.json({ success: true, topics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Get upcoming anniversaries
  router.get('/automation/anniversaries', async (req, res) => {
    try {
      const daysAhead = parseInt(req.query.days as string) || 7;
      const { autoContentDiscovery } = await import('../services/auto-content-discovery');
      const topics = await autoContentDiscovery.getAnniversaries(daysAhead);
      res.json({ success: true, topics });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Update automation config
  router.patch('/automation/config', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      orchestrator.updateConfig(req.body);
      res.json({ success: true, config: orchestrator.getConfig() });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Trigger daily summary manually (for testing)
  router.post('/automation/summary', async (req, res) => {
    try {
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      await orchestrator.generateDailySummary();
      res.json({ success: true, message: 'Daily summary generated - check console logs' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Manual upload to YouTube
  router.post('/automation/upload', async (req, res) => {
    try {
      const { videoPath, figure, hook } = req.body;
      if (!videoPath || !figure) {
        return res.status(400).json({ error: 'videoPath and figure required' });
      }
      const { getOrchestrator } = await import('../services/unity-orchestrator');
      const orchestrator = getOrchestrator();
      const success = await orchestrator.manualUpload(videoPath, figure, hook || '');
      res.json({ success });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // ============================================================================
  // ANALYTICS AUTO-PILOT ROUTES
  // ============================================================================

  router.get('/autopilot/config', async (req, res) => {
    try {
      const { getAutoPilotConfig } = await import('../services/analytics-autopilot-service');
      const config = getAutoPilotConfig();
      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error('Auto-pilot config error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/autopilot/apply', async (req, res) => {
    try {
      const { applyAutoPilot } = await import('../services/analytics-autopilot-service');
      const result = await applyAutoPilot();
      res.json({ success: result.success, data: result });
    } catch (error: any) {
      console.error('Auto-pilot apply error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/autopilot/toggle', async (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: 'enabled must be a boolean' });
      }
      const { setAutoPilotEnabled } = await import('../services/analytics-autopilot-service');
      const config = setAutoPilotEnabled(enabled);
      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error('Auto-pilot toggle error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/autopilot/reset', async (req, res) => {
    try {
      const { resetToDefaults } = await import('../services/analytics-autopilot-service');
      const config = resetToDefaults();
      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error('Auto-pilot reset error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================
  // AUTONOMOUS GOAL DECOMPOSITION ENDPOINTS
  // ============================================

  router.post('/autonomous/plan', async (req, res) => {
    try {
      const { figure, intent, constraints } = req.body;

      if (!figure || typeof figure !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'figure is required and must be a string',
        });
      }

      console.log(`🎯 [Autonomous] Decomposing goal for: ${figure}`);

      const plan = await autonomousGoalAgent.decomposeGoal({
        figure,
        intent: intent || 'viral',
        constraints,
      });

      res.json({
        success: true,
        data: plan,
      });
    } catch (error: any) {
      console.error('🎯 [Autonomous] Plan error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/autonomous/generate', async (req, res) => {
    try {
      const { figure, intent, constraints } = req.body;

      if (!figure || typeof figure !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'figure is required and must be a string',
        });
      }

      console.log(`📦 [Autonomous] Generating package for: ${figure}`);

      const result = await autonomousGoalAgent.createPackageFromGoal({
        figure,
        intent: intent || 'viral',
        constraints,
      });

      res.json({
        success: true,
        data: {
          packageId: result.packageId,
          plan: result.plan,
          message: `Package created for ${figure}`,
        },
      });
    } catch (error: any) {
      console.error('📦 [Autonomous] Generate error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
