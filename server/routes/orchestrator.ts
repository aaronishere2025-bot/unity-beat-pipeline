/**
 * Orchestrator Routes
 *
 * Central orchestrator, pipeline health, orchestration endpoints.
 */

import { Router } from 'express';
import { db } from '../db';


const router = Router();




  // ============================================================
  // CENTRAL ORCHESTRATOR ROUTES (Hook Switching Monitor)
  // ============================================================

  router.get('/orchestrator/status', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const status = centralOrchestrator.printStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error('Orchestrator status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/baselines', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const baselines = centralOrchestrator.getBaselines();
      res.json({ success: true, data: baselines });
    } catch (error: any) {
      console.error('Get baselines error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestrator/baselines/calculate', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const { videoData } = req.body;
      if (!videoData || !Array.isArray(videoData)) {
        return res.status(400).json({ success: false, error: 'videoData array required' });
      }
      const baselines = centralOrchestrator.calculateChannelBaselines(videoData);
      res.json({ success: true, data: baselines });
    } catch (error: any) {
      console.error('Calculate baselines error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestrator/register', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const { videoId, variants, theme, character, contentType } = req.body;
      if (!videoId || !variants) {
        return res.status(400).json({ success: false, error: 'videoId and variants required' });
      }
      const video = (centralOrchestrator as any).registerUpload(videoId, variants);
      res.json({ success: true, data: video });
    } catch (error: any) {
      console.error('Register upload error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestrator/check/:videoId', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const { videoId } = req.params;
      const { views, impressions, ctr, avgViewDuration, avgViewPercentage, likes, comments } = req.body;
      const snapshot = centralOrchestrator.addPerformanceSnapshot(videoId, {
        views: views || 0,
        impressions: impressions || 0,
        ctr: ctr || 0,
        avgViewDuration: avgViewDuration || 0,
        avgViewPercentage: avgViewPercentage || 0,
        likes: likes || 0,
        comments: comments || 0,
      });
      if (!snapshot) {
        return res.status(404).json({ success: false, error: 'Video not registered' });
      }
      res.json({ success: true, data: snapshot });
    } catch (error: any) {
      console.error('Check performance error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestrator/evaluate/:videoId', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const { videoId } = req.params;
      const result = centralOrchestrator.evaluateAndAct(videoId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Evaluate error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/insights', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const insights = centralOrchestrator.gatherServiceInsights();
      res.json({ success: true, data: insights });
    } catch (error: any) {
      console.error('Gather insights error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/recommendations', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const recommendations = (centralOrchestrator as any).generateOptimizationRecommendations();
      res.json({ success: true, data: recommendations });
    } catch (error: any) {
      console.error('Recommendations error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/report', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const report = centralOrchestrator.getSwapReport();
      res.json({ success: true, data: report });
    } catch (error: any) {
      console.error('Swap report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/videos', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const videos = (centralOrchestrator as any).getMonitoredVideo
        ? []
        : (centralOrchestrator as any).getMonitoredVideos?.() || [];
      res.json({ success: true, data: videos });
    } catch (error: any) {
      console.error('Get videos error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/video/:videoId', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const { videoId } = req.params;
      const video = (centralOrchestrator as any).getVideo?.(videoId);
      if (!video) {
        return res.status(404).json({ success: false, error: 'Video not found' });
      }
      res.json({ success: true, data: video });
    } catch (error: any) {
      console.error('Get video error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestrator/start', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      centralOrchestrator.startMonitoring();
      res.json({ success: true, message: 'Monitoring started' });
    } catch (error: any) {
      console.error('Start monitoring error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestrator/stop', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      centralOrchestrator.stopMonitoring();
      res.json({ success: true, message: 'Monitoring stopped' });
    } catch (error: any) {
      console.error('Stop monitoring error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestrator/run-check', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const results = (centralOrchestrator as any).runSingleCheck?.() || [];
      res.json({ success: true, data: results });
    } catch (error: any) {
      console.error('Run check error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestrator/swap-callback', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      (centralOrchestrator as any).setSwapCallback?.(
        async (videoId: string, fromVariant: string, toVariant: string) => {
          console.log(`[Orchestrator] Swap callback: ${videoId} ${fromVariant} → ${toVariant}`);
          return true;
        },
      );
      res.json({ success: true, message: 'Swap callback registered' });
    } catch (error: any) {
      console.error('Set callback error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/daily-digest', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const date = req.query.date as string | undefined;
      const digest = centralOrchestrator.generateDailyDigest(date);
      const formatted = centralOrchestrator.formatDailyDigest(digest);
      res.json({ success: true, data: digest, formatted });
    } catch (error: any) {
      console.error('Daily digest error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/swap-velocity', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const metrics = centralOrchestrator.getSwapVelocityMetrics();
      res.json({ success: true, data: metrics });
    } catch (error: any) {
      console.error('Swap velocity error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestrator/recent-swaps', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const limit = parseInt(req.query.limit as string) || 10;
      const swaps = centralOrchestrator.getRecentSwaps(limit);
      res.json({ success: true, data: swaps });
    } catch (error: any) {
      console.error('Recent swaps error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Import historical YouTube videos into monitoring system
  // Accepts optional channelUrl to import from any public channel
  router.post('/orchestrator/import-videos', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const { youtubeUploadService } = await import('../services/youtube-upload-service');

      // Check if YouTube is connected
      const isConnected = await youtubeUploadService.isAuthenticated();
      if (!isConnected) {
        return res.status(400).json({
          success: false,
          error: 'YouTube not connected. Please connect your YouTube account first.',
        });
      }

      const maxResults = parseInt(req.body.maxResults as string) || 50;
      const channelUrl = req.body.channelUrl as string | undefined;

      let videos;
      let channelName = 'your channel';

      if (channelUrl && channelUrl.trim()) {
        // Import from specified channel URL
        console.log(`📺 Importing videos from channel: ${channelUrl}`);
        videos = await youtubeUploadService.getChannelVideosByUrl(channelUrl.trim(), maxResults);
        channelName = channelUrl.trim();
      } else {
        // Import from user's own channel
        videos = await youtubeUploadService.getVideoStats(maxResults);
      }

      if (!videos.length) {
        return res.json({
          success: true,
          message: `No videos found on ${channelName}`,
          data: { imported: 0, skipped: 0, errors: [] },
        });
      }

      // Import into orchestrator
      const result = centralOrchestrator.importHistoricalVideos(videos);

      res.json({
        success: true,
        message: `Imported ${result.imported} videos from ${channelName}, ${result.skipped} already existed`,
        data: result,
      });
    } catch (error: any) {
      console.error('Import videos error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get video counts by state
  router.get('/orchestrator/video-counts', async (req, res) => {
    try {
      const { centralOrchestrator } = await import('../services/central-orchestrator');
      const counts = centralOrchestrator.getVideoCounts();
      res.json({ success: true, data: counts });
    } catch (error: any) {
      console.error('Video counts error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // ORCHESTRATION ENDPOINTS - Feedback Loop Orchestrator
  // ============================================================================

  router.post('/orchestration/run-cycle', async (req, res) => {
    try {
      const { feedbackLoopOrchestrator } = await import('../services/feedback-loop-orchestrator-agent');

      const result = await feedbackLoopOrchestrator.runOrchestrationCycle();

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('[Orchestrator] Run cycle error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestration/status', async (req, res) => {
    try {
      const { feedbackLoopOrchestrator } = await import('../services/feedback-loop-orchestrator-agent');

      const status = await feedbackLoopOrchestrator.getStatus();

      res.json({
        success: true,
        data: status,
      });
    } catch (error: any) {
      console.error('[Orchestrator] Status error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/orchestration/reports', async (req, res) => {
    try {
      const { feedbackLoopOrchestrator } = await import('../services/feedback-loop-orchestrator-agent');
      const limit = parseInt(req.query.limit as string) || 10;

      const reports = await feedbackLoopOrchestrator.getReports(limit);

      res.json({
        success: true,
        data: reports,
      });
    } catch (error: any) {
      console.error('[Orchestrator] Reports error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/orchestration/schedule', async (req, res) => {
    try {
      const { feedbackLoopOrchestrator } = await import('../services/feedback-loop-orchestrator-agent');
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'enabled must be a boolean',
        });
      }

      await feedbackLoopOrchestrator.setEnabled(enabled);

      res.json({
        success: true,
        message: `Orchestrator ${enabled ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      console.error('[Orchestrator] Schedule error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
