import { storage } from '../storage';
import type { InsertApiUsage } from '@shared/schema';
import { API_COSTS } from '../config/pricing.js';

// Re-export for backwards compatibility
export { API_COSTS };

// Job-level cost tracking
interface JobCostAccumulator {
  jobId: string;
  totalCost: number;
  estimatedCost: number;
  createdAt: number;
  threshold?: number;
  onThresholdExceeded?: (jobId: string, current: number, estimated: number) => void;
}

class ApiCostTracker {
  private jobCostAccumulators: Map<string, JobCostAccumulator> = new Map();

  private pruneStaleAccumulators() {
    if (this.jobCostAccumulators.size <= 200) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [key, acc] of this.jobCostAccumulators) {
      if (acc.createdAt < cutoff) {
        this.jobCostAccumulators.delete(key);
      }
    }
  }

  // Job cost monitoring
  initJobCostTracking(params: {
    jobId: string;
    estimatedCost: number;
    threshold?: number;
    onThresholdExceeded?: (jobId: string, current: number, estimated: number) => void;
  }) {
    this.pruneStaleAccumulators();
    this.jobCostAccumulators.set(params.jobId, {
      jobId: params.jobId,
      totalCost: 0,
      estimatedCost: params.estimatedCost,
      createdAt: Date.now(),
      threshold: params.threshold,
      onThresholdExceeded: params.onThresholdExceeded,
    });
  }

  getJobCost(jobId: string): { totalCost: number; estimatedCost: number } | null {
    const accumulator = this.jobCostAccumulators.get(jobId);
    if (!accumulator) return null;
    return {
      totalCost: accumulator.totalCost,
      estimatedCost: accumulator.estimatedCost,
    };
  }

  clearJobCostTracking(jobId: string) {
    this.jobCostAccumulators.delete(jobId);
  }

  private updateJobCost(jobId: string | undefined, cost: number) {
    if (!jobId) return;
    const accumulator = this.jobCostAccumulators.get(jobId);
    if (!accumulator) return;

    accumulator.totalCost += cost;

    // Check threshold
    if (accumulator.threshold && accumulator.totalCost > accumulator.threshold) {
      accumulator.onThresholdExceeded?.(jobId, accumulator.totalCost, accumulator.estimatedCost);
    }
  }

  async trackOpenAI(params: {
    model: string;
    operation: string;
    inputTokens?: number;
    outputTokens?: number;
    durationSeconds?: number;
    jobId?: string;
    success?: boolean;
    errorMessage?: string;
    estimatedCost?: number;
    metadata?: Record<string, any>;
  }) {
    const {
      model,
      operation,
      inputTokens = 0,
      outputTokens = 0,
      durationSeconds,
      jobId,
      success = true,
      errorMessage,
      estimatedCost,
      metadata,
    } = params;

    let cost = 0;
    const modelKey = model as keyof typeof API_COSTS.openai;
    const pricing = API_COSTS.openai[modelKey] || API_COSTS.openai['gpt-4o'];

    if (model.includes('whisper') && durationSeconds) {
      cost = (durationSeconds / 60) * (pricing as any).perMinute;
    } else if ('input' in pricing) {
      cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
    }

    const usage: InsertApiUsage = {
      service: 'openai',
      model,
      operation,
      cost: cost.toFixed(4),
      estimatedCost: estimatedCost?.toFixed(4),
      tokens: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      success,
      errorMessage,
      jobId,
      metadata: { ...metadata },
    };

    if (durationSeconds) {
      usage.durationSeconds = durationSeconds.toFixed(2);
    }

    try {
      await storage.logApiUsage(usage);
      this.updateJobCost(jobId, cost);

      const statusIcon = success ? '💰' : '❌';
      console.log(
        `${statusIcon} [OpenAI] ${operation}: $${cost.toFixed(4)} (${model}, ${inputTokens + outputTokens} tokens)${!success ? ` - FAILED: ${errorMessage}` : ''}`,
      );
    } catch (err) {
      console.error('[Cost Tracker] Failed to log OpenAI usage:', err);
    }

    return cost;
  }

  async trackGemini(params: {
    model: string;
    operation: string;
    inputTokens?: number;
    outputTokens?: number;
    jobId?: string;
    success?: boolean;
    errorMessage?: string;
    estimatedCost?: number;
    metadata?: Record<string, any>;
  }) {
    const {
      model,
      operation,
      inputTokens = 0,
      outputTokens = 0,
      jobId,
      success = true,
      errorMessage,
      estimatedCost,
      metadata,
    } = params;

    let modelKey: string;
    if (model in API_COSTS.gemini) {
      modelKey = model;
    } else if (model.includes('pro')) {
      modelKey = 'gemini-2.5-pro';
    } else {
      modelKey = 'gemini-2.5-flash';
    }
    const pricing = API_COSTS.gemini[modelKey as keyof typeof API_COSTS.gemini] || API_COSTS.gemini['gemini-2.5-flash'];
    const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;

    const usage: InsertApiUsage = {
      service: 'gemini',
      model,
      operation,
      cost: cost.toFixed(4),
      estimatedCost: estimatedCost?.toFixed(4),
      tokens: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      success,
      errorMessage,
      jobId,
      metadata: { ...metadata },
    };

    try {
      await storage.logApiUsage(usage);
      this.updateJobCost(jobId, cost);

      const statusIcon = success ? '💰' : '❌';
      console.log(
        `${statusIcon} [Gemini] ${operation}: $${cost.toFixed(4)} (${model}, ${inputTokens + outputTokens} tokens)${!success ? ` - FAILED: ${errorMessage}` : ''}`,
      );
    } catch (err) {
      console.error('[Cost Tracker] Failed to log Gemini usage:', err);
    }

    return cost;
  }

  async trackClaude(params: {
    model: string;
    operation: string;
    inputTokens?: number;
    outputTokens?: number;
    jobId?: string;
    success?: boolean;
    errorMessage?: string;
    estimatedCost?: number;
    metadata?: Record<string, any>;
  }) {
    const {
      model,
      operation,
      inputTokens = 0,
      outputTokens = 0,
      jobId,
      success = true,
      errorMessage,
      estimatedCost,
      metadata,
    } = params;

    const modelKey = model.includes('opus')
      ? 'claude-opus-4-5'
      : model.includes('4.5') || model.includes('4-5')
        ? 'claude-sonnet-4-5'
        : 'claude-sonnet-4';
    const pricing = API_COSTS.claude[modelKey as keyof typeof API_COSTS.claude] || API_COSTS.claude['claude-sonnet-4'];
    const cost = (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;

    const usage: InsertApiUsage = {
      service: 'claude',
      model,
      operation,
      cost: cost.toFixed(4),
      estimatedCost: estimatedCost?.toFixed(4),
      tokens: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      success,
      errorMessage,
      jobId,
      metadata: { ...metadata },
    };

    try {
      await storage.logApiUsage(usage);
      this.updateJobCost(jobId, cost);

      const statusIcon = success ? '💰' : '❌';
      console.log(
        `${statusIcon} [Claude] ${operation}: $${cost.toFixed(4)} (${model}, ${inputTokens + outputTokens} tokens)${!success ? ` - FAILED: ${errorMessage}` : ''}`,
      );
    } catch (err) {
      console.error('[Cost Tracker] Failed to log Claude usage:', err);
    }

    return cost;
  }

  async trackKling(params: {
    operation: string;
    clipCount: number;
    durationSeconds?: number;
    jobId?: string;
    success?: boolean;
    errorMessage?: string;
    estimatedCost?: number;
    metadata?: Record<string, any>;
  }) {
    const {
      operation,
      clipCount,
      durationSeconds,
      jobId,
      success = true,
      errorMessage,
      estimatedCost,
      metadata,
    } = params;

    // Only charge cost for successful calls or calls that were actually submitted to kie.ai
    // Credit/balance errors mean the task was never created, so no charge
    const isFinancialError =
      errorMessage &&
      (errorMessage.toLowerCase().includes('credits insufficient') ||
        errorMessage.toLowerCase().includes('insufficient') ||
        errorMessage.toLowerCase().includes('balance'));
    const cost = success || !isFinancialError ? clipCount * API_COSTS.kling['kling-3.0'].per15sClip : 0;

    const usage: InsertApiUsage = {
      service: 'kling',
      model: 'kling-3.0',
      operation,
      cost: cost.toFixed(4),
      estimatedCost: estimatedCost?.toFixed(4),
      success,
      errorMessage,
      jobId,
      metadata: { clipCount, ...metadata },
    };

    if (durationSeconds) {
      usage.durationSeconds = durationSeconds.toFixed(2);
    }

    try {
      await storage.logApiUsage(usage);
      this.updateJobCost(jobId, cost);

      const statusIcon = success ? '💰' : '❌';
      console.log(
        `${statusIcon} [Kling] ${operation}: $${cost.toFixed(4)} (${clipCount} clips)${!success ? ` - FAILED: ${errorMessage}` : ''}`,
      );
    } catch (err) {
      console.error('[Cost Tracker] Failed to log Kling usage:', err);
    }

    return cost;
  }

  async trackSuno(params: {
    operation: string;
    songCount: number;
    model?: string;
    durationSeconds?: number;
    jobId?: string;
    success?: boolean;
    errorMessage?: string;
    estimatedCost?: number;
    metadata?: Record<string, any>;
  }) {
    const {
      operation,
      songCount,
      model = 'v5',
      durationSeconds,
      jobId,
      success = true,
      errorMessage,
      estimatedCost,
      metadata,
    } = params;

    const cost = songCount * API_COSTS.suno.v5.perSong;

    const usage: InsertApiUsage = {
      service: 'suno',
      model,
      operation,
      cost: cost.toFixed(4),
      estimatedCost: estimatedCost?.toFixed(4),
      success,
      errorMessage,
      jobId,
      metadata: { songCount, ...metadata },
    };

    if (durationSeconds) {
      usage.durationSeconds = durationSeconds.toFixed(2);
    }

    try {
      await storage.logApiUsage(usage);
      this.updateJobCost(jobId, cost);

      const statusIcon = success ? '💰' : '❌';
      console.log(
        `${statusIcon} [Suno] ${operation}: $${cost.toFixed(4)} (${songCount} songs)${!success ? ` - FAILED: ${errorMessage}` : ''}`,
      );
    } catch (err) {
      console.error('[Cost Tracker] Failed to log Suno usage:', err);
    }

    return cost;
  }

  async trackYouTube(params: {
    operation: string;
    quotaUnits?: number;
    jobId?: string;
    success?: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }) {
    const { operation, quotaUnits = 1, jobId, success = true, errorMessage, metadata } = params;

    const usage: InsertApiUsage = {
      service: 'youtube',
      model: 'data-api-v3',
      operation,
      cost: '0.0000',
      success,
      errorMessage,
      jobId,
      metadata: { quotaUnits, ...metadata },
    };

    try {
      await storage.logApiUsage(usage);
      const statusIcon = success ? '✅' : '❌';
      if (!success) {
        console.log(`${statusIcon} [YouTube] ${operation} - FAILED: ${errorMessage}`);
      }
    } catch (err) {
      console.error('[Cost Tracker] Failed to log YouTube usage:', err);
    }

    return 0;
  }

  async getCostSummary(period: 'today' | 'month' | 'all' = 'month') {
    return storage.getApiUsageStats(period);
  }

  async getDailyCosts(
    days: number = 30,
  ): Promise<Array<{ date: string; cost: number; byService: Record<string, number> }>> {
    const stats = await storage.getApiUsageStats('all');
    const dailyCosts: Record<string, { cost: number; byService: Record<string, number> }> = {};

    for (const usage of stats.recentUsage) {
      const date = new Date(usage.createdAt).toISOString().split('T')[0];
      if (!dailyCosts[date]) {
        dailyCosts[date] = { cost: 0, byService: {} };
      }
      const cost = parseFloat(usage.cost) || 0;
      dailyCosts[date].cost += cost;
      dailyCosts[date].byService[usage.service] = (dailyCosts[date].byService[usage.service] || 0) + cost;
    }

    return Object.entries(dailyCosts)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, days);
  }
}

export const apiCostTracker = new ApiCostTracker();
