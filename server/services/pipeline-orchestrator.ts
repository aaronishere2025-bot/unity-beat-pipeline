/**
 * PIPELINE ORCHESTRATOR SERVICE
 *
 * Master coordinator for the entire video generation pipeline ensuring all components run in sync.
 * Single owner of generation scheduling — prevents double-fire issues.
 *
 * DAILY SCHEDULE (America/Los_Angeles — prime time uploads):
 *  1:00 AM — Trend discovery: YouTube/Google/Reddit trending topics
 *  2:00 AM — Topic pool refill: Ensure enough topics for generation
 *  3:00 AM — Stale job cleanup: Remove old failed jobs
 *  5:00 AM — Performance analysis: Analyze yesterday's metrics
 *  7:50 PM — Lofi generation (30 min mix → uploads ~8:20 PM PT)
 *  8:50 PM — Trap beat (5 min → uploads ~9 PM PT)
 *  Every 30 min — Health check: Monitor stuck jobs
 *
 *  DISABLED: Historical rap (4 PM PT) — re-enable when 3-min vids ready
 *
 * FEATURES:
 * - Conflict prevention with distributed locking
 * - Dependency management between stages
 * - Auto-recovery from transient failures
 * - Health monitoring with alerts
 * - Comprehensive metrics tracking
 */

import { CronJob } from 'cron';
import { db } from '../db';
import { jobs, pipelineState, pipelineLocks } from '@shared/schema';
import { eq, and, sql, lt, desc } from 'drizzle-orm';
import { storage } from '../storage';
import { sendDiscordEmbed } from './alert-service';

// Stage definitions with scheduling (all times America/Los_Angeles)
export const PIPELINE_SCHEDULE = {
  // Discovery Phase — overnight
  trendDiscovery: {
    cron: '0 1 * * *', // Daily at 1 AM
    description: 'Discover trending topics from YouTube/Google/Reddit',
    timeout: 15 * 60 * 1000, // 15 minutes
    dependencies: [],
  },

  // Pool Maintenance
  topicPoolRefill: {
    cron: '0 2 * * *', // Daily at 2 AM
    description: 'Refill topic pool if below threshold',
    timeout: 10 * 60 * 1000, // 10 minutes
    dependencies: ['trendDiscovery'],
  },

  // Stale Job Cleanup
  staleJobCleanup: {
    cron: '0 3 * * *', // Daily at 3 AM
    description: 'Clean up old failed jobs, expired trends',
    timeout: 5 * 60 * 1000, // 5 minutes
    dependencies: [],
  },

  // Analytics & Learning
  performanceAnalysis: {
    cron: '0 5 * * *', // Daily at 5 AM
    description: "Analyze yesterday's video performance",
    timeout: 10 * 60 * 1000, // 10 minutes
    dependencies: [],
  },

  // Prime Time Generation — generate just before target upload time
  // historicalGeneration disabled — re-enable when 3-min history vids are ready
  // historicalGeneration: {
  //   cron: '0 16 * * *', // 4:00 PM PT → ~3 min gen → uploads ~4:05 PM PT
  //   description: 'Generate 1 historical rap video (uploads immediately)',
  //   timeout: 30 * 60 * 1000,
  //   dependencies: [],
  // },

  lofiGeneration: {
    cron: '50 19 * * *', // 7:50 PM PT → ~30 min gen → uploads ~8:20 PM PT
    description: 'Generate 1 lofi study beats mix — 30 min (uploads immediately)',
    timeout: 120 * 60 * 1000, // 2 hours (lofi multi-track takes a while)
    dependencies: [],
  },

  trapGeneration1: {
    cron: '50 20 * * *', // 8:50 PM PT → ~5 min → uploads ~9 PM PT
    description: 'Generate 1 trap beat — 5 min (uploads immediately)',
    timeout: 30 * 60 * 1000, // 30 minutes
    dependencies: [],
  },

  // Monitoring — every 30min
  pipelineHealthCheck: {
    cron: '*/30 * * * *', // Every 30 minutes
    description: 'Check for stuck jobs, stale processes',
    timeout: 2 * 60 * 1000, // 2 minutes
    dependencies: [],
  },
};

interface PipelineStateData {
  currentStage: 'idle' | 'discovery' | 'generation' | 'upload' | 'error';
  activeJobs: {
    trendDiscovery: boolean;
    topicGeneration: boolean;
    videoGeneration: string[];
    uploads: string[];
  };
  lastRun: {
    trendDiscovery: Date | null;
    topicPoolRefill: Date | null;
    dailyGeneration: Date | null;
  };
  health: {
    jobWorkerRunning: boolean;
    serverResponsive: boolean;
    databaseConnected: boolean;
    apiKeysValid: boolean;
  };
  metrics: {
    todayGeneratedVideos: number;
    todayDiscoveredTrends: number;
    topicPoolSize: number;
    failedJobsLast24h: number;
  };
}

interface PipelineStage {
  name: keyof typeof PIPELINE_SCHEDULE;
  cron: string;
  description: string;
  timeout: number;
  dependencies: string[];
  task: () => Promise<void>;
}

interface HealthReport {
  jobWorkerAlive: boolean;
  jobsProcessing: number;
  oldestQueuedJob: number | null;
  databaseResponsive: boolean;
  diskSpace: { available: number; total: number } | null;
  klingApiWorking: boolean;
  sunoApiWorking: boolean;
  youtubeApiWorking: boolean;
  topicPoolSize: number;
  staleTopicsCount: number;
  duplicateTopicsFound: number;
  failedJobsLast1h: number;
  failedJobsLast24h: number;
  alerts: string[];
}

class LockManager {
  private locks: Map<string, { holder: string; acquiredAt: Date }> = new Map();

  async acquireLock(resource: string, holder: string, timeoutMs: number = 30000): Promise<boolean> {
    try {
      // Try to acquire lock in database for distributed coordination
      const expiresAt = new Date(Date.now() + timeoutMs);

      await db
        .insert(pipelineLocks)
        .values({
          resource,
          holder,
          acquiredAt: new Date(),
          expiresAt,
        })
        .onConflictDoNothing();

      // Check if we got the lock
      const [lock] = await db.select().from(pipelineLocks).where(eq(pipelineLocks.resource, resource)).limit(1);

      if (lock && lock.holder === holder) {
        this.locks.set(resource, { holder, acquiredAt: new Date() });
        console.log(`🔒 [LockManager] ${holder} acquired lock on ${resource}`);
        return true;
      }

      // Lock held by someone else - check if stale
      if (lock && lock.expiresAt < new Date()) {
        console.warn(`🔓 [LockManager] Releasing stale lock on ${resource} from ${lock.holder}`);
        await db.delete(pipelineLocks).where(eq(pipelineLocks.resource, resource));
        this.locks.delete(resource);
        return false; // Caller should retry
      }

      return false;
    } catch (error: any) {
      console.error(`❌ [LockManager] Error acquiring lock: ${error.message}`);
      return false;
    }
  }

  async releaseLock(resource: string, holder: string): Promise<void> {
    try {
      await db.delete(pipelineLocks).where(and(eq(pipelineLocks.resource, resource), eq(pipelineLocks.holder, holder)));

      this.locks.delete(resource);
      console.log(`🔓 [LockManager] ${holder} released lock on ${resource}`);
    } catch (error: any) {
      console.error(`❌ [LockManager] Error releasing lock: ${error.message}`);
    }
  }

  async cleanupStaleLocks(): Promise<void> {
    try {
      const now = new Date();
      const deleted = await db.delete(pipelineLocks).where(lt(pipelineLocks.expiresAt, now));

      if (deleted) {
        console.log(`🧹 [LockManager] Cleaned up stale locks`);
      }
    } catch (error: any) {
      console.error(`❌ [LockManager] Error cleaning up stale locks: ${error.message}`);
    }
  }
}

export class PipelineOrchestrator {
  private isRunning = false;
  private cronJobs: Map<string, CronJob> = new Map();
  private lockManager = new LockManager();
  private currentState: PipelineStateData = {
    currentStage: 'idle',
    activeJobs: {
      trendDiscovery: false,
      topicGeneration: false,
      videoGeneration: [],
      uploads: [],
    },
    lastRun: {
      trendDiscovery: null,
      topicPoolRefill: null,
      dailyGeneration: null,
    },
    health: {
      jobWorkerRunning: false,
      serverResponsive: true,
      databaseConnected: false,
      apiKeysValid: false,
    },
    metrics: {
      todayGeneratedVideos: 0,
      todayDiscoveredTrends: 0,
      topicPoolSize: 0,
      failedJobsLast24h: 0,
    },
  };

  /**
   * Start the pipeline orchestrator with all scheduled tasks
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[Pipeline Orchestrator] Already running');
      return;
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║      PIPELINE ORCHESTRATOR STARTING                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    this.isRunning = true;

    // Clean up stale locks from previous runs
    await this.lockManager.cleanupStaleLocks();

    // Initialize health check first
    await this.updateHealthMetrics();

    // Schedule all pipeline stages
    this.schedulePipelineStages();

    // Run initial health check (non-fatal — cron retries every 30 min)
    try {
      await this.runPipelineHealthCheck();
    } catch (healthErr: any) {
      console.warn(`⚠️ Initial health check failed (non-fatal, cron will retry): ${healthErr.message}`);
    }

    console.log('✅ Pipeline Orchestrator started successfully\n');
    this.printSchedule();
  }

  /**
   * Stop the pipeline orchestrator
   */
  async stop(): Promise<void> {
    console.log('[Pipeline Orchestrator] Stopping...');

    for (const [name, job] of this.cronJobs.entries()) {
      job.stop();
      console.log(`   Stopped: ${name}`);
    }

    this.cronJobs.clear();
    this.isRunning = false;

    console.log('✅ Pipeline Orchestrator stopped');
  }

  /**
   * Schedule all pipeline stages as cron jobs
   */
  private schedulePipelineStages(): void {
    // Schedule all stages dynamically from PIPELINE_SCHEDULE
    for (const [name, config] of Object.entries(PIPELINE_SCHEDULE)) {
      const stageName = name as keyof typeof PIPELINE_SCHEDULE;

      if (stageName === 'pipelineHealthCheck') {
        // Health check has its own handler
        this.cronJobs.set(
          name,
          new CronJob(
            config.cron,
            async () => {
              try {
                await this.runPipelineHealthCheck();
              } catch (error: any) {
                console.error(`[PipelineOrchestrator] ${name} CronJob error:`, error.message);
              }
            },
            null,
            true,
            'America/Los_Angeles',
          ),
        );
      } else {
        this.cronJobs.set(
          name,
          new CronJob(
            config.cron,
            async () => {
              try {
                await this.runStage(stageName);
              } catch (error: any) {
                console.error(`[PipelineOrchestrator] ${name} CronJob error:`, error.message);
              }
            },
            null,
            true,
            'America/Los_Angeles',
          ),
        );
      }
    }
  }

  /**
   * Run a specific pipeline stage with locking and error handling
   */
  private async runStage(stageName: keyof typeof PIPELINE_SCHEDULE): Promise<void> {
    const stage = PIPELINE_SCHEDULE[stageName];
    const lockName = `stage_${stageName}`;

    console.log(`\n━━━ [Pipeline] Starting stage: ${stageName} ━━━`);

    // Try to acquire lock
    const lockAcquired = await this.lockManager.acquireLock(lockName, 'pipeline-orchestrator', stage.timeout);

    if (!lockAcquired) {
      console.log(`⏭️  [Pipeline] Stage ${stageName} already running or locked, skipping`);
      return;
    }

    // Record stage start
    const startTime = Date.now();
    await this.recordStageStart(stageName);

    try {
      // Check dependencies
      const canRun = await this.checkDependencies(stageName, stage.dependencies);
      if (!canRun) {
        console.log(`⏳ [Pipeline] Stage ${stageName} blocked by dependencies`);
        await this.recordStageBlocked(stageName);
        return;
      }

      // Execute stage with timeout
      await this.executeWithTimeout(stageName, stage.timeout);

      // Record success
      const duration = Date.now() - startTime;
      await this.recordStageSuccess(stageName, duration);
      console.log(`✅ [Pipeline] Stage ${stageName} completed in ${(duration / 1000).toFixed(1)}s`);

      // Discord notification for generation stages
      if (['lofiGeneration', 'trapGeneration1'].includes(stageName)) {
        sendDiscordEmbed({
          title: `✅ Pipeline: ${stageName}`,
          description: `Stage completed in ${(duration / 1000).toFixed(1)}s`,
          color: 0x00ff00,
          fields: [
            { name: 'Stage', value: stageName, inline: true },
            { name: 'Duration', value: `${(duration / 1000).toFixed(1)}s`, inline: true },
          ],
          footer: { text: 'Pipeline Orchestrator' },
        }).catch(() => {});
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;
      await this.recordStageFailure(stageName, error, duration);
      console.error(`❌ [Pipeline] Stage ${stageName} failed: ${error.message}`);

      // Discord alert on failure
      sendDiscordEmbed({
        title: `❌ Pipeline FAILED: ${stageName}`,
        description: error.message?.slice(0, 256) || 'Unknown error',
        color: 0xff0000,
        fields: [
          { name: 'Stage', value: stageName, inline: true },
          { name: 'Duration', value: `${(duration / 1000).toFixed(1)}s`, inline: true },
        ],
        footer: { text: 'Pipeline Orchestrator' },
      }).catch(() => {});
    } finally {
      await this.lockManager.releaseLock(lockName, 'pipeline-orchestrator');
    }
  }

  /**
   * Check if stage dependencies are satisfied
   */
  private async checkDependencies(stageName: string, dependencies: string[]): Promise<boolean> {
    if (dependencies.length === 0) return true;

    // Check if dependencies have run successfully today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const dep of dependencies) {
      const [lastRun] = await db
        .select()
        .from(pipelineState)
        .where(and(eq(pipelineState.stage, dep), eq(pipelineState.status, 'completed')))
        .orderBy(desc(pipelineState.createdAt))
        .limit(1);

      if (!lastRun || lastRun.createdAt < today) {
        console.log(`⚠️  [Pipeline] Dependency ${dep} not satisfied for ${stageName}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Execute stage task with timeout
   */
  private async executeWithTimeout(stageName: keyof typeof PIPELINE_SCHEDULE, timeoutMs: number): Promise<void> {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Stage execution timeout')), timeoutMs),
    );

    const taskPromise = this.getStageTask(stageName)();

    await Promise.race([taskPromise, timeoutPromise]);
  }

  /**
   * Get the actual task function for a stage
   */
  private getStageTask(stageName: keyof typeof PIPELINE_SCHEDULE): () => Promise<void> {
    switch (stageName) {
      case 'trendDiscovery':
        return () => this.runTrendDiscovery();
      case 'topicPoolRefill':
        return () => this.runTopicPoolRefill();
      case 'staleJobCleanup':
        return () => this.runStaleJobCleanup();
      case 'performanceAnalysis':
        return () => this.runPerformanceAnalysis();
      case 'lofiGeneration':
        return () => this.runLofiGeneration();
      case 'trapGeneration1':
        return () => this.runTrapGeneration(1);
      default:
        return async () => {
          console.log(`⚠️  [Pipeline] No task implementation for stage: ${stageName}`);
        };
    }
  }

  /**
   * STAGE IMPLEMENTATIONS
   */

  private async runHistoricalGeneration(): Promise<void> {
    console.log('🎬 Running historical rap generation (target: upload by 5 PM PT)...');

    try {
      const { videoScheduler } = await import('./video-scheduler');
      await videoScheduler.triggerGenerationNow();

      this.currentState.lastRun.dailyGeneration = new Date();
      this.currentState.metrics.todayGeneratedVideos = await this.countTodayGeneratedVideos();

      console.log('   ✓ Historical video generation triggered (uploads immediately on completion)');
    } catch (error: any) {
      console.error(`   ✗ Historical video generation failed: ${error.message}`);
      throw error;
    }
  }

  private async runLofiGeneration(): Promise<void> {
    console.log('🎵 Running lofi generation (target: upload by 8 PM PT)...');

    try {
      const { beatScheduler } = await import('./beat-scheduler');
      await beatScheduler.generateLofi();

      console.log('   ✓ Lofi generation triggered (uploads immediately on completion)');
    } catch (error: any) {
      console.error(`   ✗ Lofi generation failed: ${error.message}`);
      throw error;
    }
  }

  private async runTrapGeneration(_slotNumber: number): Promise<void> {
    console.log('🎵 Running trap beat generation (target: upload by 9 PM PT)...');

    try {
      const { beatScheduler } = await import('./beat-scheduler');
      const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      await beatScheduler.generateTrap(`Trap Beat - ${today}`);

      console.log('   ✓ Trap beat generation triggered (uploads immediately on completion)');
    } catch (error: any) {
      console.error(`   ✗ Trap beat generation failed: ${error.message}`);
      throw error;
    }
  }

  private async runTrendDiscovery(): Promise<void> {
    console.log('🔍 Discovering trending topics...');

    try {
      // Use trend-discovery-bot to find trending topics from multiple sources
      const { trendDiscoveryBot } = await import('./trend-discovery-bot');

      const result = await trendDiscoveryBot.discoverTrends(20);

      this.currentState.metrics.todayDiscoveredTrends = result.discovered.length;
      this.currentState.lastRun.trendDiscovery = new Date();

      console.log(`   ✓ Discovered ${result.discovered.length} fresh trending topics`);
      console.log(`   🏆 ${result.goldenOpportunities} golden opportunities`);
    } catch (error: any) {
      console.error(`   ✗ Trend discovery failed: ${error.message}`);
      throw error;
    }
  }

  private async runTopicPoolRefill(): Promise<void> {
    console.log('🔄 Refilling topic pool...');

    try {
      // Dynamically import to avoid circular dependencies
      const { dynamicTopicSelector } = await import('./dynamic-topic-selector');

      // Check current pool size
      const poolSize = await this.getTopicPoolSize();
      console.log(`   Current pool size: ${poolSize}`);

      if (poolSize < 10) {
        console.log('   Pool below threshold, generating new topics...');
        const topics = await dynamicTopicSelector.selectTopicsForToday(15);
        console.log(`   ✓ Added ${topics.length} topics to pool`);
      } else {
        console.log('   ✓ Pool size adequate, no refill needed');
      }

      this.currentState.metrics.topicPoolSize = await this.getTopicPoolSize();
      this.currentState.lastRun.topicPoolRefill = new Date();
    } catch (error: any) {
      console.error(`   ✗ Topic pool refill failed: ${error.message}`);
      throw error;
    }
  }

  private async runStaleJobCleanup(): Promise<void> {
    console.log('🧹 Cleaning up stale jobs...');

    try {
      const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Delete old failed jobs
      const deletedJobs = await db.delete(jobs).where(and(eq(jobs.status, 'failed'), lt(jobs.createdAt, cutoffDate)));

      // Clean up old pipeline state records
      const deletedState = await db.delete(pipelineState).where(lt(pipelineState.createdAt, cutoffDate));

      console.log(`   ✓ Cleaned up old records`);
    } catch (error: any) {
      console.error(`   ✗ Cleanup failed: ${error.message}`);
      throw error;
    }
  }

  private async runPerformanceAnalysis(): Promise<void> {
    console.log('📊 Analyzing video performance...');

    try {
      // Run feedback loop orchestrator for learning from analytics
      const { feedbackLoopOrchestrator } = await import('./feedback-loop-orchestrator-agent');
      await feedbackLoopOrchestrator.runOrchestrationCycle();

      console.log(`   ✓ Performance analysis complete`);
    } catch (error: any) {
      console.error(`   ✗ Performance analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Health monitoring and recovery
   */
  private async runPipelineHealthCheck(): Promise<void> {
    const health = await this.monitorPipelineHealth();

    // Auto-recovery actions
    if (health.oldestQueuedJob && health.oldestQueuedJob > 60) {
      console.warn('⚠️  Jobs stuck in queue for >60min, investigating...');
      await this.handleStuckJobs();
    }

    if (health.topicPoolSize < 10) {
      console.warn('⚠️  Topic pool low, triggering emergency refill...');
      await this.runTopicPoolRefill();
    }

    if (health.failedJobsLast1h > 3) {
      console.warn(`⚠️  High failure rate: ${health.failedJobsLast1h} failed jobs in last hour`);
    }

    // Update current state
    this.currentState.health = {
      jobWorkerRunning: health.jobWorkerAlive,
      serverResponsive: true,
      databaseConnected: health.databaseResponsive,
      apiKeysValid: health.klingApiWorking && health.sunoApiWorking,
    };
    this.currentState.metrics.failedJobsLast24h = health.failedJobsLast24h;
  }

  private async monitorPipelineHealth(): Promise<HealthReport> {
    const checks: HealthReport = {
      jobWorkerAlive: false,
      jobsProcessing: 0,
      oldestQueuedJob: null,
      databaseResponsive: false,
      diskSpace: null,
      klingApiWorking: false,
      sunoApiWorking: false,
      youtubeApiWorking: false,
      topicPoolSize: 0,
      staleTopicsCount: 0,
      duplicateTopicsFound: 0,
      failedJobsLast1h: 0,
      failedJobsLast24h: 0,
      alerts: [],
    };

    // Check job worker
    try {
      const processingJobs = await db.select().from(jobs).where(eq(jobs.status, 'processing'));
      checks.jobsProcessing = processingJobs.length;
      checks.jobWorkerAlive = true;
    } catch (error) {
      checks.alerts.push('Job worker check failed');
    }

    // Check oldest queued job
    try {
      const [oldestJob] = await db
        .select()
        .from(jobs)
        .where(eq(jobs.status, 'queued'))
        .orderBy(jobs.createdAt)
        .limit(1);

      if (oldestJob) {
        checks.oldestQueuedJob = Math.floor((Date.now() - oldestJob.createdAt.getTime()) / 1000 / 60);
      }
    } catch (error) {
      checks.alerts.push('Oldest job check failed');
    }

    // Check database
    try {
      await db.execute(sql`SELECT 1`);
      checks.databaseResponsive = true;
    } catch (error) {
      checks.alerts.push('Database not responsive');
    }

    // Check API keys
    checks.klingApiWorking = !!process.env.KLING_SECRET_KEY;
    checks.sunoApiWorking = !!process.env.SUNO_API_KEY;
    checks.youtubeApiWorking = !!process.env.YOUTUBE_CLIENT_ID;

    // Check topic pool
    checks.topicPoolSize = await this.getTopicPoolSize();

    // Check failed jobs
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentFailed = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'failed'), sql`${jobs.createdAt} >= ${oneHourAgo}`));

    checks.failedJobsLast1h = recentFailed.length;

    const dailyFailed = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'failed'), sql`${jobs.createdAt} >= ${oneDayAgo}`));

    checks.failedJobsLast24h = dailyFailed.length;

    return checks;
  }

  private async handleStuckJobs(): Promise<void> {
    // Find jobs stuck in processing for >30 minutes
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const stuckJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'processing'), lt(jobs.updatedAt, thirtyMinAgo)));

    if (stuckJobs.length > 0) {
      console.log(`   Found ${stuckJobs.length} stuck jobs, marking as failed`);

      for (const job of stuckJobs) {
        await storage.updateJob(job.id, {
          status: 'failed',
          errorMessage: 'Job stuck for >30min, auto-failed by orchestrator',
        } as any);
      }
    }
  }

  /**
   * Helper methods
   */

  private async getTopicPoolSize(): Promise<number> {
    try {
      // Query the explored_topics table to count available topics (status = 'discovered')
      const { exploredTopics } = await import('@shared/schema');
      const { eq, sql: drizzleSql } = await import('drizzle-orm');

      const result = await db
        .select({ count: drizzleSql<number>`count(*)::int` })
        .from(exploredTopics)
        .where(eq(exploredTopics.status, 'discovered'));

      return result[0]?.count || 0;
    } catch (error) {
      console.error('❌ Error getting topic pool size:', error);
      return 0;
    }
  }

  private async countTodayGeneratedVideos(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'completed'), sql`${jobs.createdAt} >= ${today}`));

    return todayJobs.length;
  }

  /**
   * Database recording methods
   */

  private async recordStageStart(stage: string): Promise<void> {
    try {
      await db.insert(pipelineState).values({
        stage,
        status: 'running',
        startedAt: new Date(),
        metadata: {},
      });
    } catch (error: any) {
      console.error(`Failed to record stage start: ${error.message}`);
    }
  }

  private async recordStageSuccess(stage: string, duration: number): Promise<void> {
    try {
      await db
        .update(pipelineState)
        .set({
          status: 'completed',
          completedAt: new Date(),
          metadata: { duration },
        })
        .where(and(eq(pipelineState.stage, stage), eq(pipelineState.status, 'running')));
    } catch (error: any) {
      console.error(`Failed to record stage success: ${error.message}`);
    }
  }

  private async recordStageFailure(stage: string, error: Error, duration: number): Promise<void> {
    try {
      await db
        .update(pipelineState)
        .set({
          status: 'failed',
          completedAt: new Date(),
          error: error.message,
          metadata: { duration, stack: error.stack },
        })
        .where(and(eq(pipelineState.stage, stage), eq(pipelineState.status, 'running')));
    } catch (err: any) {
      console.error(`Failed to record stage failure: ${err.message}`);
    }
  }

  private async recordStageBlocked(stage: string): Promise<void> {
    try {
      await db
        .update(pipelineState)
        .set({
          status: 'blocked',
          completedAt: new Date(),
        })
        .where(and(eq(pipelineState.stage, stage), eq(pipelineState.status, 'running')));
    } catch (error: any) {
      console.error(`Failed to record stage blocked: ${error.message}`);
    }
  }

  private async updateHealthMetrics(): Promise<void> {
    this.currentState.metrics.topicPoolSize = await this.getTopicPoolSize();
    this.currentState.metrics.todayGeneratedVideos = await this.countTodayGeneratedVideos();
  }

  /**
   * Status and control methods
   */

  getStatus(): {
    isRunning: boolean;
    currentState: PipelineStateData;
    nextRuns: Record<string, Date | null>;
  } {
    const nextRuns: Record<string, Date | null> = {};

    for (const [name, job] of this.cronJobs.entries()) {
      nextRuns[name] = job.nextDate()?.toJSDate() || null;
    }

    return {
      isRunning: this.isRunning,
      currentState: this.currentState,
      nextRuns,
    };
  }

  async triggerStage(stageName: keyof typeof PIPELINE_SCHEDULE): Promise<void> {
    console.log(`🔧 [Pipeline] Manually triggering stage: ${stageName}`);
    await this.runStage(stageName);
  }

  private printSchedule(): void {
    console.log('📅 Pipeline Schedule:');
    for (const [name, config] of Object.entries(PIPELINE_SCHEDULE)) {
      const job = this.cronJobs.get(name);
      const nextRun = job?.nextDate()?.toJSDate();
      console.log(`   ${name}: ${config.description}`);
      console.log(`      Cron: ${config.cron}`);
      if (nextRun) {
        console.log(`      Next: ${nextRun.toLocaleString()}`);
      }
    }
    console.log('');
  }
}

// Export singleton instance
export const pipelineOrchestrator = new PipelineOrchestrator();
