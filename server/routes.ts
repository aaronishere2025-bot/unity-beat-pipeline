import type { Express } from 'express';
import { createServer, type Server } from 'http';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { storage } from './storage';
import { jobWorker } from './services/job-worker';
import { db } from './db';

export async function registerRoutes(app: Express): Promise<Server> {
  // Cookie parser middleware (for JWT tokens)
  app.use(cookieParser());

  // ============================================================================
  // Route modules
  // ============================================================================

  // Infrastructure routes (health, costs validation, auto-fix, errors, alerts, audit, monitoring)
  const infrastructureRoutes = (await import('./routes/infrastructure')).default;
  app.use('/api', infrastructureRoutes);

  // Auth routes
  const authRoutes = (await import('./routes/auth')).default;
  app.use('/api/auth', authRoutes);

  // YouTube routes
  const youtubeModule = await import('./routes/youtube');
  app.use('/api/youtube', youtubeModule.default);
  app.use(youtubeModule.youtubeHtmlRouter);

  // Engagement & payments routes (subscriptions, stripe, user, beat-store, marketplace, engagement, feedback)
  const engagementRoutes = (await import('./routes/engagement')).default;
  app.use('/api', engagementRoutes);

  // Job routes (jobs, beats, pricing, usage, test-prompts, calculate-cost)
  const jobRoutes = (await import('./routes/jobs')).default;
  app.use('/api', jobRoutes);

  // Music routes (suno, audio, cache, karaoke, style-bandit, sync)
  const musicRoutes = (await import('./routes/music')).default;
  app.use('/api', musicRoutes);

  // Unity content routes (unity, narrative, character-profiles, scenes)
  const unityRoutes = (await import('./routes/unity')).default;
  app.use('/api', unityRoutes);

  // Video routes (videos, thumbnails, storage, long-form, lip-sync, visual-intelligence)
  const videoRoutes = (await import('./routes/videos')).default;
  app.use('/api', videoRoutes);

  // Series routes (series, episodes, battle-styles)
  const seriesRoutes = (await import('./routes/series')).default;
  app.use('/api', seriesRoutes);

  // Kling routes (kling, kling25)
  const klingRoutes = (await import('./routes/kling')).default;
  app.use('/api', klingRoutes);

  // Analytics routes (analytics, creative-analytics, retention, strategic-summary, strategic-insights)
  const analyticsRoutes = (await import('./routes/analytics')).default;
  app.use('/api', analyticsRoutes);

  // Orchestrator routes (orchestrator, orchestration)
  const orchestratorRoutes = (await import('./routes/orchestrator')).default;
  app.use('/api', orchestratorRoutes);

  // Automation routes (autopilot, autonomous, automation)
  const automationRoutes = (await import('./routes/automation')).default;
  app.use('/api', automationRoutes);

  // Optimization routes (optimization, costs, routing, batch-consensus, accuracy)
  const optimizationRoutes = (await import('./routes/optimization')).default;
  app.use('/api', optimizationRoutes);

  // Rotation & A/B testing routes (rotation, ab-scheduler, metadata-rotation, nugget-experiment, bandit)
  const rotationRoutes = (await import('./routes/rotation')).default;
  app.use('/api', rotationRoutes);

  // Content strategy routes (content-strategy, scheduler, vector-memory, gaps, gap-discovery)
  const contentStrategyRoutes = (await import('./routes/content-strategy')).default;
  app.use('/api', contentStrategyRoutes);

  // Rumble routes
  const rumbleRoutes = (await import('./routes/rumble')).default;
  app.use('/api', rumbleRoutes);

  // Fact-check routes
  const factCheckRoutes = (await import('./routes/fact-check')).default;
  app.use('/api', factCheckRoutes);

  // Cost monitoring and batch API routes (existing extracted module)
  const costMonitoringRoutes = (await import('./routes/cost-monitoring-routes')).default;
  app.use('/api/costs', costMonitoringRoutes);
  app.use('/api/batch', costMonitoringRoutes);

  // ============================================================================
  // Static file serving
  // ============================================================================

  // Serve public folder for static downloads
  app.use(
    '/downloads',
    express.static(join(process.cwd(), 'public'), {
      setHeaders: (res, path) => {
        if (path.endsWith('.mp4')) {
          res.setHeader('Content-Disposition', 'attachment');
          res.setHeader('Content-Type', 'video/mp4');
        }
      },
    }),
  );

  // ============================================================================
  // Startup initialization
  // ============================================================================

  // Seed scenes on startup
  await storage.seedScenes();
  await storage.seedCharacterPriorities();

  // Register error management routes (dynamic import)
  const { registerErrorRoutes } = await import('./error-routes');
  registerErrorRoutes(app);

  // Start batch checker service (checks for completed batch jobs hourly)
  const { batchCheckerService } = await import('./services/batch-checker-service');
  batchCheckerService.start();
  console.log('Batch Checker Service started - checking for completed batches hourly');

  // Start job worker
  jobWorker.start();

  // ============================================================================
  // Background schedulers
  // ============================================================================

  // Strategic summary scheduler (DISABLED for cost protection)
  const scheduleNightlySummary = () => {
    console.log('[Scheduler] Strategic summary scheduler DISABLED to prevent cost overruns');
    console.log('   To run manually: POST /api/strategic-summary/generate');
    console.log('   Or use Batch API: server/services/batch-strategic-summary.ts');
    return;

    let ranTodayFlag = false;

    const checkAndRun = async () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();

      if (hour === 19 && minute === 30 && !ranTodayFlag) {
        ranTodayFlag = true;
        console.log('[Scheduler] Running nightly Trend-Watcher + Strategic Summary...');
        try {
          const { strategicSummaryService } = await import('./services/strategic-summary-service');
          await strategicSummaryService.generateNightlySummary();
          console.log('[Scheduler] Nightly strategic summary complete');
        } catch (error: any) {
          console.error('[Scheduler] Nightly summary failed:', error.message);
        }
      }

      if (hour === 0 && minute === 0) {
        ranTodayFlag = false;
      }
    };

    setInterval(checkAndRun, 60000);

    const catchUpIfMissed = async () => {
      const now = new Date();
      const hour = now.getHours();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);

      if (hour >= 19) {
        try {
          const { strategicSummaries } = await import('@shared/schema');
          const { desc } = await import('drizzle-orm');
          const [lastSummary] = await db
            .select()
            .from(strategicSummaries)
            .orderBy(desc(strategicSummaries.generatedAt))
            .limit(1);

          const lastRunDate = lastSummary ? new Date(lastSummary.generatedAt) : null;
          const ranToday = lastRunDate && lastRunDate >= todayStart;

          if (!ranToday) {
            console.log('[Catch-Up] Server started after 7:30pm - AUTO-START DISABLED FOR COST PROTECTION');
            ranTodayFlag = true;
          } else {
            console.log('[Catch-Up] Strategic summary already ran today');
            ranTodayFlag = true;
          }
        } catch (error: any) {
          console.error('[Catch-Up] Failed:', error.message);
        }
      }
    };

    setTimeout(catchUpIfMissed, 10000);
  };
  scheduleNightlySummary();

  // A/B Metadata Scheduler
  const startABMetadataScheduler = async () => {
    try {
      const { abMetadataScheduler } = await import('./services/ab-metadata-scheduler');
      abMetadataScheduler.startAutoRotation(30);
      console.log('[Scheduler] A/B Metadata rotation started (30 min intervals)');
    } catch (error: any) {
      console.error('[Scheduler] A/B Metadata scheduler failed to start:', error.message);
    }
  };
  startABMetadataScheduler();

  // Metadata Rotation Service
  const startMetadataRotationScheduler = () => {
    const runRotationCheck = async () => {
      try {
        const { metadataRotationService } = await import('./services/metadata-rotation-service');
        const result = await metadataRotationService.checkAndExecuteRotations();
        if (result.titleRotations > 0 || result.thumbnailRotations > 0 || result.completed > 0) {
          console.log(
            `[Rotation] Titles: ${result.titleRotations}, Thumbnails: ${result.thumbnailRotations}, Completed: ${result.completed}`,
          );
        }
      } catch (error: any) {
        console.error('[Rotation] Check failed:', error.message);
      }
    };

    setInterval(runRotationCheck, 24 * 60 * 60 * 1000);
    setTimeout(runRotationCheck, 60 * 1000);
  };
  startMetadataRotationScheduler();

  // Clip Quality Validator
  const initClipQualityValidator = async () => {
    try {
      const { clipQualityValidator } = await import('./services/clip-quality-validator');
      clipQualityValidator.setEnabled(true);
      console.log('[Validator] Clip quality validator enabled');
    } catch (error: any) {
      console.warn('[Validator] Clip quality validator not available:', error.message);
    }
  };
  initClipQualityValidator();

  // Analytics Auto-Pilot
  const initAnalyticsAutoPilot = async () => {
    try {
      const { analyticsAutoPilotService } = await import('./services/analytics-autopilot-service');
      analyticsAutoPilotService.setEnabled(true);
      const result = await analyticsAutoPilotService.applyAutoPilot();
      if (result.success && result.changes.length > 0) {
        console.log(`[Auto-Pilot] ENABLED - Applied ${result.changes.length} config changes`);
      } else {
        console.log('[Auto-Pilot] ENABLED - No recommendations to apply yet');
      }
    } catch (error: any) {
      console.warn('[Auto-Pilot] Initialization failed:', error.message);
    }
  };
  setTimeout(initAnalyticsAutoPilot, 3000);

  // Cleanup Service
  const initCleanupService = async () => {
    try {
      const { cleanupService } = await import('./services/cleanup-service');
      cleanupService.startScheduler(1);
      console.log('[Scheduler] Cleanup service started (hourly, 24h retention)');
    } catch (error: any) {
      console.warn('[Cleanup] Service initialization failed:', error.message);
    }
  };
  setTimeout(initCleanupService, 5000);

  const httpServer = createServer(app);

  return httpServer;
}
