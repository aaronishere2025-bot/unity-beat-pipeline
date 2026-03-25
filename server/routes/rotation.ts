/**
 * Rotation & A/B Testing Routes
 *
 * A/B testing, metadata rotation, nugget experiments, posting time bandit,
 * hill-climbing, experimental styles, consensus.
 */

import { Router } from 'express';


const router = Router();




  // Get A/B testing status and distribution
  router.get('/ab-testing/status', async (req, res) => {
    try {
      const { abTestingService, STYLE_VARIANTS } = await import('../services/ab-testing-service');
      res.json({
        success: true,
        data: {
          variants: STYLE_VARIANTS.map((v) => ({
            id: v.id,
            name: v.name,
            description: v.description,
            visualStyle: v.visualStyle,
            colorGrade: v.colorGrade,
            cameraStyle: v.cameraStyle,
          })),
          distribution: abTestingService.getVariantDistribution(),
          performance: abTestingService.getPerformanceSummary(),
          recentAssignments: abTestingService.getRecentAssignments(10),
        },
      });
    } catch (error: any) {
      console.error('A/B testing status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // EXPERIMENTAL STYLE (A/B MASTER LOOP) API ROUTES
  // ============================================================================

  // Get experimental style status
  router.get('/experimental-styles/status', async (req, res) => {
    try {
      const { experimentalStyleService } = await import('../services/experimental-style-service');
      const status = experimentalStyleService.getStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Update baseline stats from regular videos
  router.post('/experimental-styles/baseline', async (req, res) => {
    try {
      const { avgViews, avgRetention, avgCTR } = req.body;
      const { experimentalStyleService } = await import('../services/experimental-style-service');
      experimentalStyleService.updateBaseline(avgViews, avgRetention, avgCTR);
      res.json({ success: true, message: 'Baseline updated' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Record outcome for an experimental video
  router.post('/experimental-styles/outcome', async (req, res) => {
    try {
      const { videoId, styleId, views, retention, ctr } = req.body;
      const { experimentalStyleService } = await import('../services/experimental-style-service');
      experimentalStyleService.recordOutcome(videoId, styleId, views, retention, ctr);
      res.json({ success: true, message: 'Outcome recorded' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Add a new experimental style
  router.post('/experimental-styles/add', async (req, res) => {
    try {
      const { id, name, description, visualStyle, musicStyle, lyricsStyle } = req.body;
      if (!id || !name || !visualStyle) {
        return res.status(400).json({ error: 'id, name, and visualStyle are required' });
      }
      const { experimentalStyleService } = await import('../services/experimental-style-service');
      experimentalStyleService.addStyle({ id, name, description, visualStyle, musicStyle, lyricsStyle });
      res.json({ success: true, message: `Added style: ${name}` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // =========================================================================
  // METADATA ROTATION - Timed A/B testing for titles and thumbnails
  // Rotates: Title at 12h, Thumbnail at 24h, Completes at 48h
  // =========================================================================

  // Get all active rotation configs
  router.get('/rotation/active', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const rotations = await metadataRotationService.getActiveRotations();
      res.json({ success: true, data: rotations });
    } catch (error: any) {
      console.error('Get active rotations error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get rotation config for a specific video
  router.get('/rotation/:videoId', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const { videoId } = req.params;
      const config = await metadataRotationService.getRotationStatus(videoId);

      if (!config) {
        return res.status(404).json({ success: false, error: 'No rotation config found for this video' });
      }

      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error('Get rotation status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Create rotation config manually
  router.post('/rotation/create', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const { youtubeVideoId, packageId, publishTime, titleA, titleB, thumbnailA, thumbnailB } = req.body;

      if (!youtubeVideoId || !titleA) {
        return res.status(400).json({ success: false, error: 'youtubeVideoId and titleA are required' });
      }

      const config = await metadataRotationService.createRotationConfig({
        youtubeVideoId,
        packageId,
        publishTime: publishTime ? new Date(publishTime) : new Date(),
        titleA,
        titleB,
        thumbnailA,
        thumbnailB,
      });

      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error('Create rotation config error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Trigger rotation check (for testing or manual runs)
  router.post('/rotation/check', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const results = await metadataRotationService.checkAndExecuteRotations();
      res.json({ success: true, data: results });
    } catch (error: any) {
      console.error('Rotation check error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Force rotate title for a specific video
  router.post('/rotation/rotate-title/:videoId', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const { videoId } = req.params;
      const result = await metadataRotationService.forceRotateTitle(videoId);
      res.json(result);
    } catch (error: any) {
      console.error('Force rotate title error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Force rotate thumbnail for a specific video
  router.post('/rotation/rotate-thumbnail/:videoId', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const { videoId } = req.params;
      const result = await metadataRotationService.forceRotateThumbnail(videoId);
      res.json(result);
    } catch (error: any) {
      console.error('Force rotate thumbnail error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate Title B (High-Curiosity version) from Title A
  router.post('/rotation/generate-title-b', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const { titleA, topic } = req.body;

      if (!titleA || !topic) {
        return res.status(400).json({ success: false, error: 'titleA and topic are required' });
      }

      const result = await metadataRotationService.generateTitleB(titleA, topic);
      res.json({ success: true, data: { titleA, titleB: result.titleB } });
    } catch (error: any) {
      console.error('Generate Title B error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate and store Title B for a specific video's rotation config
  router.post('/rotation/:videoId/generate-title-b', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const { videoId } = req.params;
      const { topic } = req.body;

      const result = await metadataRotationService.generateAndStoreTitleB(videoId, topic);
      res.json(result);
    } catch (error: any) {
      console.error('Generate and store Title B error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate and store Thumbnail B for a specific video's rotation config
  router.post('/rotation/:videoId/generate-thumbnail-b', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const { videoId } = req.params;
      const { topic } = req.body;

      const result = await metadataRotationService.generateAndStoreThumbnailB(videoId, topic);
      res.json(result);
    } catch (error: any) {
      console.error('Generate and store Thumbnail B error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Sync analytics for A/B rotation performance tracking
  router.post('/rotation/:videoId/sync-analytics', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const { videoId } = req.params;
      const { viewCount } = req.body;

      const result = await metadataRotationService.syncAnalytics(videoId, viewCount);
      res.json(result);
    } catch (error: any) {
      console.error('Sync analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // =========================================================================
  // CONSENSUS ENGINE - Cross-Model AI Verification (GPT-4o + Gemini)
  // =========================================================================

  // Get consensus reports history
  router.get('/consensus/history', async (req, res) => {
    try {
      const { consensusEngine } = await import('../services/consensus-engine');
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await consensusEngine.getConsensusHistory(limit);
      res.json({ success: true, data: history });
    } catch (error: any) {
      console.error('Consensus history error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get topics that cause the most AI disagreements
  router.get('/consensus/disagreement-patterns', async (req, res) => {
    try {
      const { consensusEngine } = await import('../services/consensus-engine');
      const patterns = await consensusEngine.getDisagreementPatterns();
      res.json({ success: true, data: patterns });
    } catch (error: any) {
      console.error('Disagreement patterns error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Manually validate a topic with consensus engine
  router.post('/consensus/validate', async (req, res) => {
    try {
      const { topic } = req.body;
      if (!topic) {
        return res.status(400).json({ success: false, error: 'Topic is required' });
      }

      const { consensusEngine } = await import('../services/consensus-engine');
      const result = await consensusEngine.validateAndProceed(topic);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Consensus validation error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Run batch consensus test (text-only, no video generation)
  router.post('/consensus/batch-test', async (req, res) => {
    try {
      const { shortCount = 0, longCount = 10, testStructure = true } = req.body;

      const { batchConsensusTest } = await import('../services/batch-consensus-test');

      console.log(`\n🧪 Starting batch test: ${shortCount} shorts, ${longCount} longs`);

      const result = await batchConsensusTest.runBatchTest({
        shortCount: Math.min(shortCount, 100),
        longCount: Math.min(longCount, 20),
        testStructure,
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Batch consensus test error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });



  // ============================================================================
  // A/B METADATA SCHEDULER - Title/Thumbnail Rotation
  // Auto-rotates titles at 12h and thumbnails at 24h
  // ============================================================================

  // Register a video for A/B testing
  router.post('/ab-scheduler/register', async (req, res) => {
    try {
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      const { videoId, topic, initialTitle } = req.body;

      if (!videoId || !topic) {
        return res.status(400).json({ success: false, error: 'videoId and topic required' });
      }

      const variant = await abMetadataScheduler.registerVideo(videoId, topic, initialTitle || 'Untitled');
      res.json({ success: true, data: variant });
    } catch (error: any) {
      console.error('A/B register error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get A/B scheduler status
  router.get('/ab-scheduler/status', async (req, res) => {
    try {
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      const status = abMetadataScheduler.getStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error('A/B status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Start auto-rotation (checks every N minutes)
  router.post('/ab-scheduler/start', async (req, res) => {
    try {
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      const intervalMinutes = req.body.intervalMinutes || 30;
      abMetadataScheduler.startAutoRotation(intervalMinutes);
      res.json({ success: true, message: `Auto-rotation started (every ${intervalMinutes} min)` });
    } catch (error: any) {
      console.error('A/B start error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Stop auto-rotation
  router.post('/ab-scheduler/stop', async (req, res) => {
    try {
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      abMetadataScheduler.stopAutoRotation();
      res.json({ success: true, message: 'Auto-rotation stopped' });
    } catch (error: any) {
      console.error('A/B stop error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Force rotate title for a specific video
  router.post('/ab-scheduler/rotate/:videoId', async (req, res) => {
    try {
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      const result = await abMetadataScheduler.forceRotateTitle(req.params.videoId);
      res.json({ success: result.success, newTitle: result.newTitle, error: result.error });
    } catch (error: any) {
      console.error('A/B rotate error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Check and rotate all due videos (manual trigger)
  router.post('/ab-scheduler/check-rotate', async (req, res) => {
    try {
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      const result = await abMetadataScheduler.checkAndRotate();
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('A/B check-rotate error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // NUGGET A/B EXPERIMENT ENDPOINTS
  // Automated testing of visual anchors for first clips
  // ============================================================================

  // Create a new nugget A/B experiment
  router.post('/nugget-experiment/create', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');
      const { sprintId, variantA, variantB } = req.body;

      if (!sprintId) {
        return res.status(400).json({ success: false, error: 'sprintId required' });
      }

      const experiment = await nuggetExperimentService.createExperiment(
        sprintId,
        variantA || 'in_media_res',
        variantB || 'abstract_mystery',
      );

      res.json({ success: true, data: experiment });
    } catch (error: any) {
      console.error('Create nugget experiment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get active experiment
  router.get('/nugget-experiment/active', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');
      const { sprintId } = req.query;

      const experiment = await nuggetExperimentService.getActiveExperiment(sprintId as string);

      res.json({ success: true, data: experiment });
    } catch (error: any) {
      console.error('Get active experiment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get experiment by ID
  router.get('/nugget-experiment/:id', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');
      const experiment = await nuggetExperimentService.getExperimentById(req.params.id);

      if (!experiment) {
        return res.status(404).json({ success: false, error: 'Experiment not found' });
      }

      res.json({ success: true, data: experiment });
    } catch (error: any) {
      console.error('Get experiment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all experiments
  router.get('/nugget-experiments', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');
      const limit = parseInt(req.query.limit as string) || 10;

      const experiments = await nuggetExperimentService.getAllExperiments(limit);

      res.json({ success: true, data: experiments });
    } catch (error: any) {
      console.error('Get experiments error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Select variant for a new video (with traffic allocation)
  router.post('/nugget-experiment/:id/select-variant', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');

      const selection = await nuggetExperimentService.selectVariantForVideo(req.params.id);

      res.json({ success: true, data: selection });
    } catch (error: any) {
      console.error('Select variant error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Record video assignment to experiment
  router.post('/nugget-experiment/:id/assign-video', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');
      const { videoId, variant, packageId } = req.body;

      if (!videoId || !variant) {
        return res.status(400).json({ success: false, error: 'videoId and variant required' });
      }

      await nuggetExperimentService.recordVideoAssignment(req.params.id, videoId, variant, packageId);

      res.json({ success: true, message: 'Video assigned to experiment' });
    } catch (error: any) {
      console.error('Assign video error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Update video metrics from YouTube analytics
  router.post('/nugget-experiment/:id/update-metrics', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');
      const { videoId, swipeRate, retention3s, ctr, impressions } = req.body;

      if (!videoId) {
        return res.status(400).json({ success: false, error: 'videoId required' });
      }

      const result = await nuggetExperimentService.updateVideoMetrics(req.params.id, videoId, {
        swipeRate,
        retention3s,
        ctr,
        impressions,
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Update metrics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Declare winner manually or check if winner should be declared
  router.post('/nugget-experiment/:id/declare-winner', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');

      const result = await nuggetExperimentService.declareWinner(req.params.id);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Declare winner error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Cancel experiment
  router.post('/nugget-experiment/:id/cancel', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');
      const { reason } = req.body;

      await nuggetExperimentService.cancelExperiment(req.params.id, reason || 'Manual cancellation');

      res.json({ success: true, message: 'Experiment cancelled' });
    } catch (error: any) {
      console.error('Cancel experiment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Inject nugget with experiment-aware variant selection
  router.post('/nugget-experiment/:id/inject', async (req, res) => {
    try {
      const { nuggetExperimentService } = await import('../services/nugget-experiment-service');
      const { basePrompt, clipIndex } = req.body;

      if (!basePrompt || clipIndex === undefined) {
        return res.status(400).json({ success: false, error: 'basePrompt and clipIndex required' });
      }

      const result = await nuggetExperimentService.injectNuggetForExperiment(req.params.id, basePrompt, clipIndex);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Inject nugget for experiment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // POSTING TIME BANDIT ENDPOINTS
  // Thompson Sampling for optimal video upload times
  // ============================================================================

  router.get('/bandit/posting-time/stats', async (req, res) => {
    try {
      const { postingTimeBandit } = await import('../services/posting-time-bandit');
      const stats = await postingTimeBandit.getArmStats();
      const schedule = await postingTimeBandit.getRecommendedSchedule();
      res.json({ success: true, data: { stats, schedule } });
    } catch (error: any) {
      console.error('Posting time bandit stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/bandit/posting-time/select', async (req, res) => {
    try {
      const { postingTimeBandit } = await import('../services/posting-time-bandit');
      const { format, dayType } = req.body;

      if (!format || !['shorts', 'long_form'].includes(format)) {
        return res.status(400).json({ success: false, error: 'format must be "shorts" or "long_form"' });
      }

      const selection = await postingTimeBandit.selectTimeSlot(format, dayType);
      res.json({ success: true, data: selection });
    } catch (error: any) {
      console.error('Posting time bandit select error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/bandit/posting-time/record', async (req, res) => {
    try {
      const { postingTimeBandit } = await import('../services/posting-time-bandit');
      const { timeSlot, format, dayType, videoId, views, ctr, avgViewDuration } = req.body;

      if (!timeSlot || !format || !dayType || !videoId) {
        return res.status(400).json({ success: false, error: 'timeSlot, format, dayType, and videoId required' });
      }

      await postingTimeBandit.recordOutcome(timeSlot, format, dayType, videoId, {
        views: views || 0,
        ctr: ctr || 0,
        avgViewDuration: avgViewDuration || 0,
      });

      res.json({ success: true, message: 'Outcome recorded' });
    } catch (error: any) {
      console.error('Posting time bandit record error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // A/B METADATA SCHEDULER API ENDPOINTS
  // ============================================================

  // Get A/B scheduler status
  router.get('/ab-scheduler/status', async (req, res) => {
    try {
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      const status = abMetadataScheduler.getStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Manually register a video for A/B testing
  router.post('/ab-scheduler/register', async (req, res) => {
    try {
      const { videoId, topic, initialTitle } = req.body;
      if (!videoId || !topic || !initialTitle) {
        return res.status(400).json({ success: false, error: 'videoId, topic, and initialTitle required' });
      }
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      const variant = await abMetadataScheduler.registerVideo(videoId, topic, initialTitle);
      res.json({ success: true, data: variant });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Force rotate a video's title
  router.post('/ab-scheduler/force-rotate/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      const { abMetadataScheduler } = await import('../services/ab-metadata-scheduler');
      const result = await abMetadataScheduler.forceRotateTitle(videoId);
      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // METADATA ROTATION SERVICE API ENDPOINTS
  // ============================================================

  // Get rotation status for all active videos
  router.get('/metadata-rotation/status', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const rotations = await metadataRotationService.getActiveRotations();
      res.json({ success: true, data: rotations, count: rotations.length });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Manually trigger rotation check
  router.post('/metadata-rotation/check', async (req, res) => {
    try {
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const result = await metadataRotationService.checkAndExecuteRotations();
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Create a new rotation config
  router.post('/metadata-rotation/create', async (req, res) => {
    try {
      const { youtubeVideoId, packageId, titleA, titleB, thumbnailA, thumbnailB } = req.body;
      if (!youtubeVideoId || !titleA) {
        return res.status(400).json({ success: false, error: 'youtubeVideoId and titleA required' });
      }
      const { metadataRotationService } = await import('../services/metadata-rotation-service');
      const config = await metadataRotationService.createRotationConfig({
        youtubeVideoId,
        packageId,
        publishTime: new Date(),
        titleA,
        titleB,
        thumbnailA,
        thumbnailB,
      });
      res.json({ success: true, data: config });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
