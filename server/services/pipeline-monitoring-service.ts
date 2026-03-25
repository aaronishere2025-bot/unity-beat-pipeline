/**
 * Pipeline Monitoring Service
 *
 * Tracks health, costs, and success/failure rates across the entire
 * video generation pipeline. Provides daily digests and alerts.
 */

import { db } from '../db';
import { pipelineHealth, dailyHealthDigest, apiUsage, InsertPipelineHealth } from '@shared/schema';
import { eq, desc, gte, lte, sql, and } from 'drizzle-orm';

export type PipelineStep =
  | 'discovery'
  | 'prompt_generation'
  | 'music_generation'
  | 'video_generation'
  | 'karaoke_subtitles'
  | 'ffmpeg_assembly'
  | 'metadata_generation'
  | 'thumbnail_generation'
  | 'youtube_upload';

export type StepStatus = 'pending' | 'success' | 'failed' | 'skipped';

interface CostSummary {
  kling: number;
  suno: number;
  openai: number;
  veo: number;
  total: number;
}

interface HealthSummary {
  today: {
    attempted: number;
    completed: number;
    failed: number;
    uploaded: number;
    successRate: number;
  };
  thisWeek: {
    attempted: number;
    completed: number;
    failed: number;
    uploaded: number;
    successRate: number;
    costs: CostSummary;
    costPerVideo: number;
  };
  stepFailureRates: Record<PipelineStep, { failures: number; total: number; rate: number }>;
  recentFailures: Array<{
    figure: string;
    step: string;
    error: string;
    timestamp: Date;
  }>;
  alerts: Array<{
    type: 'degradation' | 'cost_spike' | 'failure_rate';
    message: string;
    severity: 'warning' | 'critical';
  }>;
}

class PipelineMonitoringService {
  private activeJobs: Map<string, { healthId: number; startTime: Date }> = new Map();

  /**
   * Start tracking a new pipeline job
   */
  async startJob(jobId: string, figure: string): Promise<number> {
    const [record] = await db
      .insert(pipelineHealth)
      .values({
        jobId,
        figure,
        stepDiscovery: 'success', // Discovery already happened if we're here
        finalStatus: 'in_progress',
      })
      .returning();

    this.activeJobs.set(jobId, { healthId: record.id, startTime: new Date() });
    console.log(`📊 Pipeline monitoring started for: ${figure}`);

    return record.id;
  }

  /**
   * Update a step status
   */
  async updateStep(jobId: string, step: PipelineStep, status: StepStatus, error?: string): Promise<void> {
    const active = this.activeJobs.get(jobId);
    if (!active) {
      console.warn(`⚠️ No active monitoring for job ${jobId}`);
      return;
    }

    const stepColumn = this.getStepColumn(step);
    const updates: any = { [stepColumn]: status };

    if (status === 'failed') {
      updates.failedStep = step;
      updates.errorMessage = error || 'Unknown error';
    }

    await db.update(pipelineHealth).set(updates).where(eq(pipelineHealth.id, active.healthId));
  }

  /**
   * Record costs for a job
   */
  async recordCost(jobId: string, service: 'kling' | 'suno' | 'openai', cost: number): Promise<void> {
    const active = this.activeJobs.get(jobId);
    if (!active) return;

    const costColumn = service === 'kling' ? 'costKling' : service === 'suno' ? 'costSuno' : 'costOpenai';

    // Get current costs
    const [current] = await db.select().from(pipelineHealth).where(eq(pipelineHealth.id, active.healthId));

    if (current) {
      const currentCost = parseFloat((current[costColumn as keyof typeof current] as string) || '0');
      const currentTotal = parseFloat((current.costTotal as string) || '0');

      await db
        .update(pipelineHealth)
        .set({
          [costColumn]: (currentCost + cost).toFixed(4),
          costTotal: (currentTotal + cost).toFixed(4),
        })
        .where(eq(pipelineHealth.id, active.healthId));
    }
  }

  /**
   * Complete a job (success or failure)
   */
  async completeJob(jobId: string, success: boolean, videoId?: string): Promise<void> {
    const active = this.activeJobs.get(jobId);
    if (!active) return;

    const duration = Math.round((Date.now() - active.startTime.getTime()) / 1000);

    await db
      .update(pipelineHealth)
      .set({
        finalStatus: success ? 'completed' : 'failed',
        completedAt: new Date(),
        totalDurationSeconds: duration,
        videoId: videoId || null,
      })
      .where(eq(pipelineHealth.id, active.healthId));

    this.activeJobs.delete(jobId);
    console.log(`📊 Pipeline ${success ? 'completed' : 'failed'}: ${jobId} (${duration}s)`);
  }

  /**
   * Log API usage with cost tracking
   */
  async logApiUsage(
    service: string,
    operation: string,
    cost: number,
    jobId?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await db.insert(apiUsage).values({
      service,
      operation,
      cost: cost.toFixed(4),
      jobId: jobId || null,
      metadata: metadata || null,
    });

    // Also record to pipeline health if we have an active job
    if (jobId && this.activeJobs.has(jobId)) {
      const serviceType = service.includes('kling') ? 'kling' : service.includes('suno') ? 'suno' : 'openai';
      await this.recordCost(jobId, serviceType, cost);
    }
  }

  /**
   * Get comprehensive health summary
   */
  async getHealthSummary(): Promise<HealthSummary> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Today's stats
    const todayJobs = await db.select().from(pipelineHealth).where(gte(pipelineHealth.startedAt, todayStart));

    // This week's stats
    const weekJobs = await db.select().from(pipelineHealth).where(gte(pipelineHealth.startedAt, weekStart));

    // Calculate step failure rates from all time
    const allJobs = await db.select().from(pipelineHealth);
    const stepFailureRates = this.calculateStepFailureRates(allJobs);

    // Recent failures
    const recentFailures = allJobs
      .filter((j) => j.finalStatus === 'failed')
      .slice(-5)
      .map((j) => ({
        figure: j.figure,
        step: j.failedStep || 'unknown',
        error: j.errorMessage || 'Unknown error',
        timestamp: j.startedAt,
      }));

    // Get cost data from api_usage table
    const weekCosts = await this.getCostSummary(weekStart, now);

    // Calculate alerts
    const alerts = this.generateAlerts(weekJobs, stepFailureRates, weekCosts);

    const todayCompleted = todayJobs.filter((j) => j.finalStatus === 'completed').length;
    const todayFailed = todayJobs.filter((j) => j.finalStatus === 'failed').length;
    const weekCompleted = weekJobs.filter((j) => j.finalStatus === 'completed').length;
    const weekFailed = weekJobs.filter((j) => j.finalStatus === 'failed').length;

    return {
      today: {
        attempted: todayJobs.length,
        completed: todayCompleted,
        failed: todayFailed,
        uploaded: todayJobs.filter((j) => j.stepYoutubeUpload === 'success').length,
        successRate: todayJobs.length > 0 ? (todayCompleted / todayJobs.length) * 100 : 0,
      },
      thisWeek: {
        attempted: weekJobs.length,
        completed: weekCompleted,
        failed: weekFailed,
        uploaded: weekJobs.filter((j) => j.stepYoutubeUpload === 'success').length,
        successRate: weekJobs.length > 0 ? (weekCompleted / weekJobs.length) * 100 : 0,
        costs: weekCosts,
        costPerVideo: weekCompleted > 0 ? weekCosts.total / weekCompleted : 0,
      },
      stepFailureRates,
      recentFailures,
      alerts,
    };
  }

  /**
   * Get cost summary from api_usage table
   */
  async getCostSummary(startDate: Date, endDate: Date): Promise<CostSummary> {
    const usage = await db
      .select()
      .from(apiUsage)
      .where(and(gte(apiUsage.createdAt, startDate), lte(apiUsage.createdAt, endDate)));

    const costs: CostSummary = { kling: 0, suno: 0, openai: 0, veo: 0, total: 0 };

    for (const record of usage) {
      const cost = parseFloat(record.cost as string);
      costs.total += cost;

      if (record.service.includes('kling')) {
        costs.kling += cost;
      } else if (record.service.includes('suno')) {
        costs.suno += cost;
      } else if (record.service.includes('openai') || record.service.includes('gpt')) {
        costs.openai += cost;
      } else if (record.service.includes('veo')) {
        costs.veo += cost;
      }
    }

    return costs;
  }

  /**
   * Get all-time cost summary
   */
  async getAllTimeCosts(): Promise<{
    total: number;
    byService: Record<string, { count: number; cost: number }>;
    thisWeek: CostSummary;
    thisMonth: CostSummary;
    perVideoAverage: number;
  }> {
    const now = new Date();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // All-time by service
    const allUsage = await db.select().from(apiUsage);
    const byService: Record<string, { count: number; cost: number }> = {};
    let total = 0;

    for (const record of allUsage) {
      const cost = parseFloat(record.cost as string);
      total += cost;

      if (!byService[record.service]) {
        byService[record.service] = { count: 0, cost: 0 };
      }
      byService[record.service].count++;
      byService[record.service].cost += cost;
    }

    // Period summaries
    const thisWeek = await this.getCostSummary(weekStart, now);
    const thisMonth = await this.getCostSummary(monthStart, now);

    // Per video average
    const completedJobs = await db.select().from(pipelineHealth).where(eq(pipelineHealth.finalStatus, 'completed'));

    const perVideoAverage = completedJobs.length > 0 ? total / completedJobs.length : 0;

    return { total, byService, thisWeek, thisMonth, perVideoAverage };
  }

  /**
   * Generate daily digest
   */
  async generateDailyDigest(date: Date = new Date()): Promise<string> {
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);

    const jobs = await db
      .select()
      .from(pipelineHealth)
      .where(and(gte(pipelineHealth.startedAt, dateStart), lte(pipelineHealth.startedAt, dateEnd)));

    const costs = await this.getCostSummary(dateStart, dateEnd);

    const completed = jobs.filter((j) => j.finalStatus === 'completed').length;
    const failed = jobs.filter((j) => j.finalStatus === 'failed').length;
    const uploaded = jobs.filter((j) => j.stepYoutubeUpload === 'success').length;

    // Find which step failed most
    const failedJobs = jobs.filter((j) => j.finalStatus === 'failed');
    const stepFailures: Record<string, number> = {};
    for (const job of failedJobs) {
      if (job.failedStep) {
        stepFailures[job.failedStep] = (stepFailures[job.failedStep] || 0) + 1;
      }
    }

    let digest = `📊 DAILY DIGEST - ${dateStart.toDateString()}\n`;
    digest += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    digest += `✅ Generated: ${completed}/${jobs.length}\n`;
    digest += `📤 Uploaded: ${uploaded}/${completed}\n`;
    digest += `❌ Failed: ${failed}\n`;

    if (Object.keys(stepFailures).length > 0) {
      digest += `\n⚠️ Failures by step:\n`;
      for (const [step, count] of Object.entries(stepFailures)) {
        digest += `   • ${step}: ${count}\n`;
      }
    }

    digest += `\n💰 Costs:\n`;
    digest += `   • Kling: $${costs.kling.toFixed(2)}\n`;
    digest += `   • Suno: $${costs.suno.toFixed(2)}\n`;
    digest += `   • OpenAI: $${costs.openai.toFixed(2)}\n`;
    digest += `   • Total: $${costs.total.toFixed(2)}\n`;

    if (completed > 0) {
      digest += `   • Per video: $${(costs.total / completed).toFixed(2)}\n`;
    }

    // Store digest in database
    await db.insert(dailyHealthDigest).values({
      date: dateStart,
      videosAttempted: jobs.length,
      videosCompleted: completed,
      videosFailed: failed,
      videosUploaded: uploaded,
      totalCostKling: costs.kling.toFixed(4),
      totalCostSuno: costs.suno.toFixed(4),
      totalCostOpenai: costs.openai.toFixed(4),
      totalCost: costs.total.toFixed(4),
      costPerVideo: completed > 0 ? (costs.total / completed).toFixed(4) : '0',
    });

    return digest;
  }

  private calculateStepFailureRates(
    jobs: any[],
  ): Record<PipelineStep, { failures: number; total: number; rate: number }> {
    const steps: PipelineStep[] = [
      'discovery',
      'prompt_generation',
      'music_generation',
      'video_generation',
      'karaoke_subtitles',
      'ffmpeg_assembly',
      'metadata_generation',
      'thumbnail_generation',
      'youtube_upload',
    ];

    const rates: Record<PipelineStep, { failures: number; total: number; rate: number }> = {} as any;

    for (const step of steps) {
      const column = this.getStepColumn(step);
      const total = jobs.filter((j) => j[column] !== 'pending').length;
      const failures = jobs.filter((j) => j[column] === 'failed').length;

      rates[step] = {
        failures,
        total,
        rate: total > 0 ? (failures / total) * 100 : 0,
      };
    }

    return rates;
  }

  private generateAlerts(
    weekJobs: any[],
    stepRates: Record<PipelineStep, { failures: number; total: number; rate: number }>,
    costs: CostSummary,
  ): Array<{ type: 'degradation' | 'cost_spike' | 'failure_rate'; message: string; severity: 'warning' | 'critical' }> {
    const alerts: Array<{
      type: 'degradation' | 'cost_spike' | 'failure_rate';
      message: string;
      severity: 'warning' | 'critical';
    }> = [];

    // Check step failure rates
    for (const [step, data] of Object.entries(stepRates)) {
      if (data.rate > 30) {
        alerts.push({
          type: 'failure_rate',
          message: `${step} has ${data.rate.toFixed(0)}% failure rate (${data.failures}/${data.total})`,
          severity: data.rate > 50 ? 'critical' : 'warning',
        });
      }
    }

    // Check if costs are spiking
    const completedCount = weekJobs.filter((j) => j.finalStatus === 'completed').length;
    if (completedCount > 0) {
      const costPerVideo = costs.total / completedCount;
      if (costPerVideo > 5) {
        alerts.push({
          type: 'cost_spike',
          message: `Cost per video is high: $${costPerVideo.toFixed(2)}`,
          severity: costPerVideo > 10 ? 'critical' : 'warning',
        });
      }
    }

    // Check overall success rate
    const weekSuccess = weekJobs.filter((j) => j.finalStatus === 'completed').length;
    const weekTotal = weekJobs.length;
    if (weekTotal >= 5 && weekSuccess / weekTotal < 0.7) {
      alerts.push({
        type: 'degradation',
        message: `Weekly success rate is low: ${((weekSuccess / weekTotal) * 100).toFixed(0)}%`,
        severity: weekSuccess / weekTotal < 0.5 ? 'critical' : 'warning',
      });
    }

    return alerts;
  }

  private getStepColumn(step: PipelineStep): string {
    const mapping: Record<PipelineStep, string> = {
      discovery: 'stepDiscovery',
      prompt_generation: 'stepPromptGeneration',
      music_generation: 'stepMusicGeneration',
      video_generation: 'stepVideoGeneration',
      karaoke_subtitles: 'stepKaraokeSubtitles',
      ffmpeg_assembly: 'stepFfmpegAssembly',
      metadata_generation: 'stepMetadataGeneration',
      thumbnail_generation: 'stepThumbnailGeneration',
      youtube_upload: 'stepYoutubeUpload',
    };
    return mapping[step];
  }
}

export const pipelineMonitoringService = new PipelineMonitoringService();
