/**
 * DYNAMIC MODEL ROUTER SERVICE
 *
 * Auto-selects between Gemini 2.5 Flash, Gemini 2.5 Pro based on:
 * - Task type and complexity
 * - Historical performance data
 * - Thompson Sampling for exploration/exploitation balance
 * - Cost and latency optimization
 *
 * Uses Bayesian updates with exponential decay to adapt to changing model performance.
 */

import { GoogleGenAI } from '@google/genai';
import { db } from '../db';
import { modelPerformance } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// ============================================================================
// INTERFACES
// ============================================================================

export interface TaskProfile {
  type: 'prompt_generation' | 'validation' | 'analysis' | 'creative' | 'technical' | 'narrative';
  complexity: 'low' | 'medium' | 'high';
  context: {
    contentType?: string;
    historicalEra?: string;
    requiresAccuracy?: boolean;
    requiresCreativity?: boolean;
  };
}

export interface ModelPerformanceStats {
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  taskType: string;
  totalCalls: number;
  successCount: number;
  avgLatency: number;
  avgCost: number;
  avgQualityScore: number;
  successRate: number;
  lastUpdated: Date;
}

export interface RoutingDecision {
  selectedModel: string;
  reasoning: string;
  confidence: number;
  alternatives: Array<{
    model: string;
    score: number;
    tradeoff: string;
  }>;
  expectedCost: number;
  expectedLatency: number;
}

export interface PerformanceReport {
  summary: {
    totalCalls: number;
    avgSuccessRate: number;
    totalCost: number;
    bestPerformer: string;
  };
  byModel: Record<
    string,
    {
      calls: number;
      successRate: number;
      avgLatency: number;
      avgCost: number;
      avgQuality: number;
    }
  >;
  byTaskType: Record<
    string,
    {
      bestModel: string;
      modelStats: Record<string, ModelPerformanceStats>;
    }
  >;
  recommendations: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro'] as const;
type ModelType = (typeof MODELS)[number];

const TASK_TYPES = ['prompt_generation', 'validation', 'analysis', 'creative', 'technical', 'narrative'] as const;

const DEFAULT_ROUTING: Record<string, ModelType> = {
  prompt_generation: 'gemini-2.5-flash',
  validation: 'gemini-2.5-pro',
  analysis: 'gemini-2.5-flash',
  creative: 'gemini-2.5-flash',
  technical: 'gemini-2.5-pro',
  narrative: 'gemini-2.5-pro',
};

const CONTEXT_OVERRIDES: Record<string, { condition: (ctx: TaskProfile['context']) => boolean; model: ModelType }[]> = {
  prompt_generation: [{ condition: (ctx) => ctx.requiresAccuracy === true, model: 'gemini-2.5-pro' }],
  validation: [{ condition: (ctx) => ctx.requiresCreativity === true, model: 'gemini-2.5-flash' }],
  analysis: [{ condition: (ctx) => ctx.historicalEra !== undefined, model: 'gemini-2.5-pro' }],
  creative: [{ condition: (ctx) => ctx.requiresAccuracy === true, model: 'gemini-2.5-pro' }],
  technical: [{ condition: (ctx) => ctx.contentType === 'code', model: 'gemini-2.5-pro' }],
  narrative: [{ condition: (ctx) => ctx.requiresCreativity === true, model: 'gemini-2.5-flash' }],
};

const EXPECTED_COSTS: Record<ModelType, number> = {
  'gemini-2.5-flash': 0.0005,
  'gemini-2.5-pro': 0.005,
};

const EXPECTED_LATENCY: Record<ModelType, number> = {
  'gemini-2.5-flash': 800,
  'gemini-2.5-pro': 2000,
};

const DECAY_FACTOR = 0.95;
const MIN_SAMPLES_FOR_ROUTING = 5;
const EXPLORATION_WEIGHT = 0.1;

// ============================================================================
// SCORING WEIGHTS
// ============================================================================

const SCORING_WEIGHTS = {
  successRate: 0.4,
  qualityScore: 0.3,
  costEfficiency: 0.15,
  latencyEfficiency: 0.15,
};

// ============================================================================
// DYNAMIC MODEL ROUTER CLASS
// ============================================================================

class DynamicModelRouter {
  private gemini: GoogleGenAI;
  private performanceCache: Map<string, ModelPerformanceStats> = new Map();
  private lastCacheUpdate: Date = new Date(0);
  private readonly CACHE_TTL_MS = 60000;

  constructor() {
    this.gemini = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY,
      httpOptions: {
        apiVersion: '',
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  }

  /**
   * Route a task to the best model based on task profile and historical performance
   */
  async routeTask(task: TaskProfile): Promise<RoutingDecision> {
    console.log(`🔀 [Model Router] Routing task: ${task.type} (${task.complexity} complexity)`);

    await this.refreshCache();

    const modelScores: Array<{ model: ModelType; score: number; components: Record<string, number> }> = [];

    for (const model of MODELS) {
      const stats = await this.getModelStats(model, task.type);
      const score = this.calculateModelScore(model, task, stats);
      modelScores.push({ model, score: score.total, components: score.components });
    }

    modelScores.sort((a, b) => b.score - a.score);

    const thompsonScores = await this.applyThompsonSampling(modelScores, task.type);

    const selectedModel = thompsonScores[0].model;
    const confidence = this.calculateConfidence(thompsonScores[0], thompsonScores);

    const alternatives = thompsonScores.slice(1).map((alt, idx) => ({
      model: alt.model,
      score: alt.score,
      tradeoff: this.getTradeoffDescription(selectedModel, alt.model, task),
    }));

    const decision: RoutingDecision = {
      selectedModel,
      reasoning: this.generateReasoning(selectedModel, task, modelScores),
      confidence,
      alternatives,
      expectedCost: EXPECTED_COSTS[selectedModel],
      expectedLatency: EXPECTED_LATENCY[selectedModel],
    };

    console.log(`✅ [Model Router] Selected: ${selectedModel} (confidence: ${(confidence * 100).toFixed(1)}%)`);
    return decision;
  }

  /**
   * Simple API: Get the best model for a task type with optional context
   */
  async getModelForTask(taskType: TaskProfile['type'], context: TaskProfile['context'] = {}): Promise<ModelType> {
    const decision = await this.routeTask({
      type: taskType,
      complexity: 'medium',
      context,
    });
    return decision.selectedModel as ModelType;
  }

  /**
   * Record the outcome of a model call for learning
   */
  async recordOutcome(
    model: ModelType,
    taskType: string,
    success: boolean,
    qualityScore: number,
    latency: number,
    cost: number,
  ): Promise<void> {
    console.log(
      `📊 [Model Router] Recording outcome: ${model}/${taskType} - success=${success}, quality=${qualityScore}`,
    );

    try {
      const existing = await db
        .select()
        .from(modelPerformance)
        .where(and(eq(modelPerformance.model, model), eq(modelPerformance.taskType, taskType)))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(modelPerformance).values({
          model,
          taskType,
          totalCalls: 1,
          successCount: success ? 1 : 0,
          totalLatency: latency,
          totalCost: cost.toString(),
          totalQualityScore: qualityScore,
          alphaSuccess: success ? 2 : 1,
          betaFailure: success ? 1 : 2,
          lastUpdated: new Date(),
        });
      } else {
        const record = existing[0];
        const decayedCalls = record.totalCalls * DECAY_FACTOR;
        const decayedSuccess = record.successCount * DECAY_FACTOR;
        const decayedLatency = record.totalLatency * DECAY_FACTOR;
        const decayedCost = parseFloat(record.totalCost) * DECAY_FACTOR;
        const decayedQuality = record.totalQualityScore * DECAY_FACTOR;
        const decayedAlpha = (record.alphaSuccess - 1) * DECAY_FACTOR + 1;
        const decayedBeta = (record.betaFailure - 1) * DECAY_FACTOR + 1;

        await db
          .update(modelPerformance)
          .set({
            totalCalls: Math.round(decayedCalls + 1),
            successCount: Math.round(decayedSuccess + (success ? 1 : 0)),
            totalLatency: decayedLatency + latency,
            totalCost: (decayedCost + cost).toFixed(6),
            totalQualityScore: decayedQuality + qualityScore,
            alphaSuccess: decayedAlpha + (success ? 1 : 0),
            betaFailure: decayedBeta + (success ? 0 : 1),
            lastUpdated: new Date(),
          })
          .where(eq(modelPerformance.id, record.id));
      }

      this.invalidateCache();
    } catch (error) {
      console.error(`❌ [Model Router] Failed to record outcome:`, error);
    }
  }

  /**
   * Get comprehensive performance report
   */
  async getPerformanceReport(): Promise<PerformanceReport> {
    const allStats = await db.select().from(modelPerformance);

    const byModel: PerformanceReport['byModel'] = {};
    const byTaskType: PerformanceReport['byTaskType'] = {};
    let totalCalls = 0;
    let totalSuccesses = 0;
    let totalCost = 0;

    for (const stat of allStats) {
      const avgLatency = stat.totalCalls > 0 ? stat.totalLatency / stat.totalCalls : 0;
      const avgCost = stat.totalCalls > 0 ? parseFloat(stat.totalCost) / stat.totalCalls : 0;
      const avgQuality = stat.totalCalls > 0 ? stat.totalQualityScore / stat.totalCalls : 0;
      const successRate = stat.totalCalls > 0 ? stat.successCount / stat.totalCalls : 0;

      if (!byModel[stat.model]) {
        byModel[stat.model] = { calls: 0, successRate: 0, avgLatency: 0, avgCost: 0, avgQuality: 0 };
      }
      byModel[stat.model].calls += stat.totalCalls;
      byModel[stat.model].avgLatency = (byModel[stat.model].avgLatency + avgLatency) / 2;
      byModel[stat.model].avgCost = (byModel[stat.model].avgCost + avgCost) / 2;
      byModel[stat.model].avgQuality = (byModel[stat.model].avgQuality + avgQuality) / 2;
      byModel[stat.model].successRate = (byModel[stat.model].successRate + successRate) / 2;

      if (!byTaskType[stat.taskType]) {
        byTaskType[stat.taskType] = { bestModel: '', modelStats: {} };
      }
      byTaskType[stat.taskType].modelStats[stat.model] = {
        model: stat.model as ModelType,
        taskType: stat.taskType,
        totalCalls: stat.totalCalls,
        successCount: stat.successCount,
        avgLatency,
        avgCost,
        avgQualityScore: avgQuality,
        successRate,
        lastUpdated: stat.lastUpdated,
      };

      totalCalls += stat.totalCalls;
      totalSuccesses += stat.successCount;
      totalCost += parseFloat(stat.totalCost);
    }

    for (const taskType of Object.keys(byTaskType)) {
      let bestScore = -1;
      let bestModel = DEFAULT_ROUTING[taskType] || 'gemini-2.5-flash';
      for (const [model, stats] of Object.entries(byTaskType[taskType].modelStats)) {
        const score =
          stats.successRate * 0.4 +
          (stats.avgQualityScore / 100) * 0.3 +
          (1 - stats.avgCost / 0.01) * 0.15 +
          (1 - stats.avgLatency / 5000) * 0.15;
        if (score > bestScore) {
          bestScore = score;
          bestModel = model as any;
        }
      }
      byTaskType[taskType].bestModel = bestModel;
    }

    const recommendations = this.generateRecommendations(byModel, byTaskType, totalCost);

    let bestPerformer = 'gemini-2.5-flash';
    let bestPerformerScore = -1;
    for (const [model, stats] of Object.entries(byModel)) {
      const score = stats.successRate * 0.5 + stats.avgQuality * 0.3 + (1 - stats.avgCost / 0.01) * 0.2;
      if (score > bestPerformerScore) {
        bestPerformerScore = score;
        bestPerformer = model;
      }
    }

    return {
      summary: {
        totalCalls,
        avgSuccessRate: totalCalls > 0 ? totalSuccesses / totalCalls : 0,
        totalCost,
        bestPerformer,
      },
      byModel,
      byTaskType,
      recommendations,
    };
  }

  /**
   * Wrap an OpenAI call with automatic routing and outcome recording
   */
  async callWithRouting<T>(
    taskType: TaskProfile['type'],
    context: TaskProfile['context'],
    callFn: (model: ModelType) => Promise<{ result: T; qualityScore: number }>,
  ): Promise<{ result: T; model: ModelType; latency: number; cost: number }> {
    const decision = await this.routeTask({ type: taskType, complexity: 'medium', context });
    const model = decision.selectedModel as ModelType;
    const startTime = Date.now();

    try {
      const { result, qualityScore } = await callFn(model);
      const latency = Date.now() - startTime;
      const cost = decision.expectedCost;

      await this.recordOutcome(model, taskType, true, qualityScore, latency, cost);

      return { result, model, latency, cost };
    } catch (error) {
      const latency = Date.now() - startTime;

      await this.recordOutcome(model, taskType, false, 0, latency, decision.expectedCost);

      for (const alt of decision.alternatives) {
        try {
          console.log(`🔄 [Model Router] Falling back to ${alt.model}`);
          const { result, qualityScore } = await callFn(alt.model as ModelType);
          const altLatency = Date.now() - startTime;
          const altCost = EXPECTED_COSTS[alt.model as ModelType];

          await this.recordOutcome(alt.model as ModelType, taskType, true, qualityScore, altLatency, altCost);

          return { result, model: alt.model as ModelType, latency: altLatency, cost: altCost };
        } catch (altError) {
          continue;
        }
      }

      throw error;
    }
  }

  /**
   * Get stats for a specific model and task type
   */
  async getStats(model: ModelType, taskType: string): Promise<ModelPerformanceStats | null> {
    return this.getModelStats(model, taskType);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async getModelStats(model: ModelType, taskType: string): Promise<ModelPerformanceStats | null> {
    const cacheKey = `${model}:${taskType}`;
    if (this.performanceCache.has(cacheKey)) {
      return this.performanceCache.get(cacheKey)!;
    }

    const result = await db
      .select()
      .from(modelPerformance)
      .where(and(eq(modelPerformance.model, model), eq(modelPerformance.taskType, taskType)))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const record = result[0];
    const stats: ModelPerformanceStats = {
      model: record.model as ModelType,
      taskType: record.taskType,
      totalCalls: record.totalCalls,
      successCount: record.successCount,
      avgLatency: record.totalCalls > 0 ? record.totalLatency / record.totalCalls : EXPECTED_LATENCY[model],
      avgCost: record.totalCalls > 0 ? parseFloat(record.totalCost) / record.totalCalls : EXPECTED_COSTS[model],
      avgQualityScore: record.totalCalls > 0 ? record.totalQualityScore / record.totalCalls : 75,
      successRate: record.totalCalls > 0 ? record.successCount / record.totalCalls : 0.8,
      lastUpdated: record.lastUpdated,
    };

    this.performanceCache.set(cacheKey, stats);
    return stats;
  }

  private calculateModelScore(
    model: ModelType,
    task: TaskProfile,
    stats: ModelPerformanceStats | null,
  ): { total: number; components: Record<string, number> } {
    const successRate = stats?.successRate ?? 0.8;
    const qualityScore = (stats?.avgQualityScore ?? 75) / 100;
    const avgCost = stats?.avgCost ?? EXPECTED_COSTS[model];
    const avgLatency = stats?.avgLatency ?? EXPECTED_LATENCY[model];

    const maxCost = Math.max(...Object.values(EXPECTED_COSTS));
    const maxLatency = Math.max(...Object.values(EXPECTED_LATENCY));

    const costEfficiency = 1 - avgCost / maxCost;
    const latencyEfficiency = 1 - avgLatency / maxLatency;

    let contextBonus = 0;
    const overrides = CONTEXT_OVERRIDES[task.type] || [];
    for (const override of overrides) {
      if (override.condition(task.context) && override.model === model) {
        contextBonus = 0.1;
        break;
      }
    }

    let defaultBonus = 0;
    if (DEFAULT_ROUTING[task.type] === model && (!stats || stats.totalCalls < MIN_SAMPLES_FOR_ROUTING)) {
      defaultBonus = 0.15;
    }

    const components = {
      successRate: successRate * SCORING_WEIGHTS.successRate,
      qualityScore: qualityScore * SCORING_WEIGHTS.qualityScore,
      costEfficiency: costEfficiency * SCORING_WEIGHTS.costEfficiency,
      latencyEfficiency: latencyEfficiency * SCORING_WEIGHTS.latencyEfficiency,
      contextBonus,
      defaultBonus,
    };

    const total = Object.values(components).reduce((sum, val) => sum + val, 0);

    return { total, components };
  }

  private async applyThompsonSampling(
    modelScores: Array<{ model: ModelType; score: number; components: Record<string, number> }>,
    taskType: string,
  ): Promise<Array<{ model: ModelType; score: number }>> {
    const sampledScores: Array<{ model: ModelType; score: number }> = [];

    for (const { model, score } of modelScores) {
      const stats = await db
        .select()
        .from(modelPerformance)
        .where(and(eq(modelPerformance.model, model), eq(modelPerformance.taskType, taskType)))
        .limit(1);

      let sampledScore = score;

      if (stats.length > 0) {
        const alpha = stats[0].alphaSuccess;
        const beta = stats[0].betaFailure;
        const thompsonSample = this.betaSample(alpha, beta);
        sampledScore = score * (1 - EXPLORATION_WEIGHT) + thompsonSample * EXPLORATION_WEIGHT;
      } else {
        const explorationBonus = Math.random() * EXPLORATION_WEIGHT;
        sampledScore = score + explorationBonus;
      }

      sampledScores.push({ model, score: sampledScore });
    }

    return sampledScores.sort((a, b) => b.score - a.score);
  }

  private betaSample(alpha: number, beta: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const x = Math.pow(u1, 1 / alpha);
    const y = Math.pow(u2, 1 / beta);
    return x / (x + y);
  }

  private calculateConfidence(
    selected: { model: ModelType; score: number },
    allScores: Array<{ model: ModelType; score: number }>,
  ): number {
    if (allScores.length <= 1) return 0.9;

    const scoreDiff = selected.score - allScores[1].score;
    const maxScore = Math.max(...allScores.map((s) => s.score));

    const normalizedDiff = maxScore > 0 ? scoreDiff / maxScore : 0;
    return Math.min(0.95, 0.5 + normalizedDiff * 2);
  }

  private getTradeoffDescription(selected: ModelType, alternative: ModelType, task: TaskProfile): string {
    const tradeoffs: Partial<Record<ModelType, Partial<Record<ModelType, string>>>> = {
      'gemini-2.5-flash': {
        'gemini-2.5-pro': 'More accurate for complex tasks, but slower and higher cost',
      },
      'gemini-2.5-pro': {
        'gemini-2.5-flash': 'Much faster and cheaper, good for simpler tasks',
      },
    };

    return tradeoffs[selected]?.[alternative] || 'Different performance characteristics';
  }

  private generateReasoning(
    selected: ModelType,
    task: TaskProfile,
    scores: Array<{ model: ModelType; score: number; components: Record<string, number> }>,
  ): string {
    const selectedScore = scores.find((s) => s.model === selected);
    const components = selectedScore?.components || {};

    const reasons: string[] = [];

    if (DEFAULT_ROUTING[task.type] === selected) {
      reasons.push(`Default choice for ${task.type} tasks`);
    }

    if (components.contextBonus && components.contextBonus > 0) {
      reasons.push(`Context-appropriate for ${JSON.stringify(task.context)}`);
    }

    if (components.successRate && components.successRate > 0.3) {
      reasons.push(`Strong historical success rate`);
    }

    if (components.qualityScore && components.qualityScore > 0.25) {
      reasons.push(`High quality scores`);
    }

    if (components.costEfficiency && components.costEfficiency > 0.1) {
      reasons.push(`Cost efficient`);
    }

    if (reasons.length === 0) {
      reasons.push(`Best overall score for ${task.type} task with ${task.complexity} complexity`);
    }

    return reasons.join('. ') + '.';
  }

  private generateRecommendations(
    byModel: PerformanceReport['byModel'],
    byTaskType: PerformanceReport['byTaskType'],
    totalCost: number,
  ): string[] {
    const recommendations: string[] = [];

    const flashStats = byModel['gemini-2.5-flash'];
    if (flashStats && flashStats.successRate > 0.8 && flashStats.calls < 50) {
      recommendations.push(
        'Consider increasing Gemini 2.5 Flash usage for cost savings - it shows good success rate with much lower cost',
      );
    }

    for (const [taskType, data] of Object.entries(byTaskType)) {
      if (data.bestModel !== DEFAULT_ROUTING[taskType]) {
        recommendations.push(
          `Performance data suggests ${data.bestModel} outperforms default ${DEFAULT_ROUTING[taskType]} for ${taskType} tasks`,
        );
      }
    }

    if (totalCost > 100) {
      recommendations.push(
        'High API costs detected - consider batching requests or using Gemini for lower-stakes tasks',
      );
    }

    for (const [model, stats] of Object.entries(byModel)) {
      if (stats.successRate < 0.7 && stats.calls > 20) {
        recommendations.push(
          `${model} showing low success rate (${(stats.successRate * 100).toFixed(1)}%) - investigate failure patterns`,
        );
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Model routing is performing well - no immediate optimizations needed');
    }

    return recommendations;
  }

  private async refreshCache(): Promise<void> {
    if (Date.now() - this.lastCacheUpdate.getTime() < this.CACHE_TTL_MS) {
      return;
    }

    const allStats = await db.select().from(modelPerformance);

    this.performanceCache.clear();

    for (const stat of allStats) {
      const key = `${stat.model}:${stat.taskType}`;
      this.performanceCache.set(key, {
        model: stat.model as ModelType,
        taskType: stat.taskType,
        totalCalls: stat.totalCalls,
        successCount: stat.successCount,
        avgLatency: stat.totalCalls > 0 ? stat.totalLatency / stat.totalCalls : 0,
        avgCost: stat.totalCalls > 0 ? parseFloat(stat.totalCost) / stat.totalCalls : 0,
        avgQualityScore: stat.totalCalls > 0 ? stat.totalQualityScore / stat.totalCalls : 0,
        successRate: stat.totalCalls > 0 ? stat.successCount / stat.totalCalls : 0,
        lastUpdated: stat.lastUpdated,
      });
    }

    this.lastCacheUpdate = new Date();
  }

  private invalidateCache(): void {
    this.performanceCache.clear();
    this.lastCacheUpdate = new Date(0);
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const dynamicModelRouter = new DynamicModelRouter();
