/**
 * Optimization Routes
 *
 * Intelligent optimization, cost routes, dynamic model router, batch consensus, accuracy.
 */

import { Router } from 'express';
import { join } from 'path';
import { storage } from '../storage';


const router = Router();




  // Cost Summary endpoint for dashboard
  router.get('/costs/summary', async (req, res) => {
    try {
      const period = (req.query.period as 'today' | 'month' | 'all') || 'month';
      const stats = await storage.getApiUsageStats(period);

      res.json({
        success: true,
        data: {
          totalCost: stats.totalCost,
          breakdown: stats.byService,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch cost summary',
      });
    }
  });


  // Detailed cost breakdown endpoint
  router.get('/costs/breakdown', async (req, res) => {
    try {
      const period = (req.query.period as 'today' | 'month' | 'all') || 'month';
      const stats = await storage.getApiUsageStats(period);

      const breakdown = Object.entries(stats.byService)
        .map(([service, data]) => ({
          service,
          calls: data.count,
          cost: data.cost,
          percentage: stats.totalCost > 0 ? ((data.cost / stats.totalCost) * 100).toFixed(1) : '0',
        }))
        .sort((a, b) => b.cost - a.cost);

      res.json({
        success: true,
        data: {
          period,
          totalCost: stats.totalCost,
          breakdown,
          recentUsage: stats.recentUsage.slice(0, 20),
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch cost breakdown',
      });
    }
  });


  // Get costs by job ID
  router.get('/costs/by-job/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const costs = await storage.getCostsByJob(jobId);

      res.json({
        success: true,
        data: costs,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch job costs',
      });
    }
  });


  // Get costs by service with detailed breakdown
  router.get('/costs/by-service', async (req, res) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const service = req.query.service as string | undefined;
      const successOnly = req.query.successOnly === 'true';

      const costs = await storage.getCostsByService({
        startDate,
        endDate,
        service,
        successOnly,
      });

      res.json({
        success: true,
        data: costs,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch service costs',
      });
    }
  });


  // Get daily costs summary
  router.get('/costs/daily', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const groupBy = (req.query.groupBy as 'service' | 'model' | 'operation') || 'service';

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const summary = await storage.getDailyCostsSummary({
        startDate,
        endDate,
        groupBy,
      });

      res.json({
        success: true,
        data: {
          days,
          groupBy,
          summary,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch daily costs',
      });
    }
  });


  // Get cost analytics summary (comprehensive)
  router.get('/costs/analytics', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get service breakdown
      const serviceBreakdown = await storage.getCostsByService({
        startDate,
        endDate,
      });

      // Get daily summary
      const dailySummary = await storage.getDailyCostsSummary({
        startDate,
        endDate,
        groupBy: 'service',
      });

      // Calculate totals
      const totalCost = serviceBreakdown.reduce((sum, s) => sum + s.totalCost, 0);
      const totalCalls = serviceBreakdown.reduce((sum, s) => sum + s.totalCalls, 0);
      const totalSuccessfulCalls = serviceBreakdown.reduce((sum, s) => sum + s.successfulCalls, 0);
      const totalFailedCalls = serviceBreakdown.reduce((sum, s) => sum + s.failedCalls, 0);

      // Get recent stats
      const recentStats = await storage.getApiUsageStats('today');

      res.json({
        success: true,
        data: {
          period: { days, startDate, endDate },
          totals: {
            cost: totalCost,
            calls: totalCalls,
            successfulCalls: totalSuccessfulCalls,
            failedCalls: totalFailedCalls,
            successRate: totalCalls > 0 ? totalSuccessfulCalls / totalCalls : 0,
            avgCostPerCall: totalCalls > 0 ? totalCost / totalCalls : 0,
          },
          today: {
            cost: recentStats.totalCost,
            calls: recentStats.recentUsage.length,
          },
          byService: serviceBreakdown,
          dailyTrend: dailySummary,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch cost analytics',
      });
    }
  });


  // ============================================================================
  // HISTORICAL ACCURACY VALIDATION API ROUTES
  // ============================================================================

  // Get all accuracy reports for a job
  router.get('/accuracy/reports/:jobId', async (req, res) => {
    try {
      const { historicalAccuracyValidator } = await import('../services/historical-accuracy-validator');
      const reports = await historicalAccuracyValidator.getJobReports(req.params.jobId);
      res.json({ success: true, reports });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get accuracy summary for a job
  router.get('/accuracy/summary/:jobId', async (req, res) => {
    try {
      const { historicalAccuracyValidator } = await import('../services/historical-accuracy-validator');
      const summary = await historicalAccuracyValidator.getJobAccuracySummary(req.params.jobId);
      res.json({ success: true, summary });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get full validation breakdown for a job (visual + audio layers with pre/post scores)
  router.get('/accuracy/full-breakdown/:jobId', async (req, res) => {
    try {
      const { historicalAccuracyValidator } = await import('../services/historical-accuracy-validator');
      const { acousticFingerprintService } = await import('../services/acoustic-fingerprint-service');

      // Get job details to find packageId
      const job = await storage.getJob(req.params.jobId);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      // Get visual layer scores (clip accuracy reports)
      const visualReports = await historicalAccuracyValidator.getJobReports(req.params.jobId);
      const visualSummary = await historicalAccuracyValidator.getJobAccuracySummary(req.params.jobId);

      // Get audio layer scores
      const packageId = (job.unityMetadata as any)?.packageId;
      let audioScores = null;
      if (packageId) {
        const fingerprint = await acousticFingerprintService.getFingerprintByPackage(packageId);
        if (fingerprint) {
          const dnaScores = (fingerprint as any).dna_scores ? JSON.parse((fingerprint as any).dna_scores) : null;
          audioScores = {
            bpm: fingerprint.bpm,
            energyCurve: (fingerprint as any).energy_curve,
            hookEnergyRatio: (fingerprint as any).hook_energy_ratio,
            predictedHookSurvival: (fingerprint as any).predicted_hook_survival,
            trackCharacter: (fingerprint as any).track_character,
            dnaScores: dnaScores,
          };
        }
      }

      // Aggregate reports by clip index - take the latest (final) report per clip
      const clipMap = new Map<number, (typeof visualReports)[0][]>();
      for (const report of visualReports) {
        const existing = clipMap.get(report.clipIndex) || [];
        existing.push(report);
        clipMap.set(report.clipIndex, existing);
      }

      // Process into pre/post breakdown (one entry per clip)
      const clipBreakdown = Array.from(clipMap.entries())
        .map(([clipIndex, reports]) => {
          // Sort by validation attempt to get chronological order
          reports.sort((a, b) => (a.validationAttempt || 1) - (b.validationAttempt || 1));

          const firstReport = reports[0];
          const finalReport = reports[reports.length - 1];
          const wasRegenerated = reports.length > 1;

          return {
            clipIndex,
            clipPath: finalReport.clipPath,
            visualScores: {
              eraAccuracy: finalReport.eraAccuracyScore,
              characterConsistency: finalReport.characterConsistencyScore,
              anachronismScore: finalReport.anachronismScore,
              continuityScore: finalReport.continuityScore,
              overall: finalReport.overallScore,
            },
            prePost: {
              preRegenerationScore: firstReport.overallScore,
              postRegenerationScore: wasRegenerated ? finalReport.overallScore : null,
              wasRegenerated,
              regenerationCount: reports.length - 1,
              improvement: wasRegenerated ? finalReport.overallScore - firstReport.overallScore : null,
            },
            passed: finalReport.passed,
            analysis: finalReport.analysis,
            createdAt: finalReport.createdAt,
          };
        })
        .sort((a, b) => a.clipIndex - b.clipIndex);

      // Calculate aggregate pre/post statistics for regenerated clips only
      const regeneratedClips = clipBreakdown.filter((c) => c.prePost.wasRegenerated);
      const avgPreScore =
        regeneratedClips.length > 0
          ? Math.round(
              regeneratedClips.reduce((sum, c) => sum + (c.prePost.preRegenerationScore || 0), 0) /
                regeneratedClips.length,
            )
          : null;
      const avgPostScore =
        regeneratedClips.length > 0
          ? Math.round(
              regeneratedClips.reduce((sum, c) => sum + (c.prePost.postRegenerationScore || 0), 0) /
                regeneratedClips.length,
            )
          : null;

      // Calculate averages from aggregated clips (not raw reports)
      const totalClips = clipBreakdown.length || 1;

      res.json({
        success: true,
        breakdown: {
          jobId: req.params.jobId,
          packageId,

          // Visual Layer Summary (using aggregated final scores per clip)
          visualLayer: {
            summary: visualSummary,
            avgEraAccuracy: Math.round(
              clipBreakdown.reduce((sum, c) => sum + c.visualScores.eraAccuracy, 0) / totalClips,
            ),
            avgCharacterConsistency: Math.round(
              clipBreakdown.reduce((sum, c) => sum + c.visualScores.characterConsistency, 0) / totalClips,
            ),
            avgAnachronismScore: Math.round(
              clipBreakdown.reduce((sum, c) => sum + c.visualScores.anachronismScore, 0) / totalClips,
            ),
            avgContinuityScore: Math.round(
              clipBreakdown.reduce((sum, c) => sum + c.visualScores.continuityScore, 0) / totalClips,
            ),
          },

          // Audio Layer Summary
          audioLayer: audioScores,

          // Pre/Post Regeneration Statistics
          regenerationStats: {
            totalClips: clipBreakdown.length,
            regeneratedClips: regeneratedClips.length,
            avgPreScore,
            avgPostScore,
            avgImprovement: avgPreScore && avgPostScore ? avgPostScore - avgPreScore : null,
          },

          // Per-clip breakdown
          clips: clipBreakdown,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Manually validate a specific clip
  router.post('/accuracy/validate', async (req, res) => {
    try {
      const { clipPath, clipIndex, jobId, packageId } = req.body;
      if (!clipPath || clipIndex === undefined || !jobId || !packageId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: clipPath, clipIndex, jobId, packageId',
        });
      }

      const pkg = await storage.getUnityContentPackage(packageId);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Package not found' });
      }

      const { historicalAccuracyValidator } = await import('../services/historical-accuracy-validator');
      const previousContext = await historicalAccuracyValidator.getPreviousClipContext(jobId, clipIndex);

      const result = await historicalAccuracyValidator.validateClip(
        clipPath,
        clipIndex,
        jobId,
        packageId,
        pkg.packageData,
        previousContext,
      );

      const report = await historicalAccuracyValidator.saveReport(
        jobId,
        packageId,
        clipIndex,
        clipPath,
        result,
        1, // attempt 1
        false, // not a regeneration
        null, // no pre-score
      );

      res.json({ success: true, result, report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // INTELLIGENT OPTIMIZATION ENDPOINTS
  // ============================================================================

  // Get complete optimization insights (Thompson Sampling, Survival, Anomaly Detection)
  router.get('/optimization/insights', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const insights = intelligentOptimization.getOptimizationInsights();
      res.json({ success: true, data: insights });
    } catch (error: any) {
      console.error('Optimization insights error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get bandit state for styles or thumbnails
  router.get('/optimization/bandit/:type', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const type = req.params.type as 'style' | 'thumbnail';
      if (type !== 'style' && type !== 'thumbnail') {
        return res.status(400).json({ success: false, error: 'Type must be "style" or "thumbnail"' });
      }
      const state = intelligentOptimization.getBanditState(type);
      res.json({ success: true, data: state });
    } catch (error: any) {
      console.error('Bandit state error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Select optimal style using Thompson Sampling
  router.get('/optimization/select-style', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const selection = intelligentOptimization.selectStyle();
      res.json({ success: true, data: selection });
    } catch (error: any) {
      console.error('Style selection error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Select optimal thumbnail variant using Thompson Sampling
  router.get('/optimization/select-thumbnail', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const selection = intelligentOptimization.selectThumbnailVariant();
      res.json({ success: true, data: selection });
    } catch (error: any) {
      console.error('Thumbnail selection error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Update bandit with video performance outcome
  router.post('/optimization/update-outcome', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const { styleId, thumbnailVariantId, ctr, avgViewDuration, views } = req.body;

      if (styleId) {
        intelligentOptimization.updateStyleOutcome(styleId, ctr || 0, avgViewDuration || 0, views || 0);
      }
      if (thumbnailVariantId) {
        intelligentOptimization.updateThumbnailOutcome(thumbnailVariantId, ctr || 0, avgViewDuration || 0, views || 0);
      }

      res.json({ success: true, message: 'Outcome recorded' });
    } catch (error: any) {
      console.error('Outcome update error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Check for anomaly (hot content signal)
  router.post('/optimization/check-anomaly', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const { videoId, views, hoursOld } = req.body;
      const result = intelligentOptimization.detectAnomaly(videoId, views, hoursOld);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Anomaly check error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get survival analysis (video lifespan patterns)
  router.get('/optimization/survival', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const survival = intelligentOptimization.getSurvivalStats();
      const decay = intelligentOptimization.getDecayAnalysis();
      res.json({ success: true, data: { survival, decay } });
    } catch (error: any) {
      console.error('Survival analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Update baseline for anomaly detection
  router.post('/optimization/update-baseline', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      await intelligentOptimization.updateBaseline();
      res.json({ success: true, message: 'Baseline updated' });
    } catch (error: any) {
      console.error('Baseline update error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Find similar topics using embeddings
  router.post('/optimization/similar-topics', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const { figure, topN } = req.body;
      if (!figure) {
        return res.status(400).json({ success: false, error: 'Figure name required' });
      }
      const result = await intelligentOptimization.findSimilarTopics(figure, topN || 5);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Similar topics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Cluster topics by theme
  router.post('/optimization/cluster-topics', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const { figures, numClusters } = req.body;
      if (!figures || !Array.isArray(figures)) {
        return res.status(400).json({ success: false, error: 'Array of figures required' });
      }
      const result = await intelligentOptimization.clusterTopics(figures, numClusters || 5);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Cluster topics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Find content opportunities based on embeddings
  router.post('/optimization/content-opportunities', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const { performedWell, alreadyCovered, candidates } = req.body;
      if (!performedWell || !candidates) {
        return res.status(400).json({
          success: false,
          error: 'performedWell and candidates arrays required',
        });
      }
      const opportunities = await intelligentOptimization.findContentOpportunities(
        performedWell,
        alreadyCovered || [],
        candidates,
      );
      res.json({ success: true, data: { opportunities } });
    } catch (error: any) {
      console.error('Content opportunities error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get embedding stats
  router.get('/optimization/embedding-stats', async (req, res) => {
    try {
      const { intelligentOptimization } = await import('../services/intelligent-optimization-service');
      const stats = intelligentOptimization.getEmbeddingStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('Embedding stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // BATCH CONSENSUS TEST API ENDPOINTS
  // ============================================================

  // Run batch consensus test (on-demand)
  router.post('/batch-consensus/test', async (req, res) => {
    try {
      const { shortCount = 5, longCount = 2 } = req.body;
      const { batchConsensusTest } = await import('../services/batch-consensus-test');
      const result = await (batchConsensusTest as any).runBatchTest(shortCount);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // DYNAMIC MODEL ROUTER API ENDPOINTS
  // ============================================================================

  router.get('/routing/performance', async (req, res) => {
    try {
      const { dynamicModelRouter } = await import('../services/dynamic-model-router');
      const report = await dynamicModelRouter.getPerformanceReport();

      res.json({
        success: true,
        data: report,
      });
    } catch (error: any) {
      console.error('🔀 [Model Router] Performance report error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/routing/recommend', async (req, res) => {
    try {
      const { dynamicModelRouter } = await import('../services/dynamic-model-router');
      const { type, complexity, context } = req.body;

      if (!type) {
        return res.status(400).json({ success: false, error: 'Task type is required' });
      }

      const validTypes = ['prompt_generation', 'validation', 'analysis', 'creative', 'technical', 'narrative'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({
          success: false,
          error: `Invalid task type. Must be one of: ${validTypes.join(', ')}`,
        });
      }

      const decision = await dynamicModelRouter.routeTask({
        type,
        complexity: complexity || 'medium',
        context: context || {},
      });

      res.json({
        success: true,
        data: decision,
      });
    } catch (error: any) {
      console.error('🔀 [Model Router] Recommend error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/routing/stats', async (req, res) => {
    try {
      const { dynamicModelRouter } = await import('../services/dynamic-model-router');
      const { model, taskType } = req.query;

      if (model && taskType) {
        const stats = await dynamicModelRouter.getStats(model as any, taskType as string);

        res.json({
          success: true,
          data: stats,
        });
      } else {
        const report = await dynamicModelRouter.getPerformanceReport();

        res.json({
          success: true,
          data: {
            summary: report.summary,
            byModel: report.byModel,
          },
        });
      }
    } catch (error: any) {
      console.error('🔀 [Model Router] Stats error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/routing/record-outcome', async (req, res) => {
    try {
      const { dynamicModelRouter } = await import('../services/dynamic-model-router');
      const { model, taskType, success, qualityScore, latency, cost } = req.body;

      if (!model || !taskType) {
        return res.status(400).json({
          success: false,
          error: 'Model and taskType are required',
        });
      }

      await dynamicModelRouter.recordOutcome(
        model,
        taskType,
        success ?? true,
        qualityScore ?? 75,
        latency ?? 1000,
        cost ?? 0.001,
      );

      res.json({
        success: true,
        message: 'Outcome recorded successfully',
      });
    } catch (error: any) {
      console.error('🔀 [Model Router] Record outcome error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
