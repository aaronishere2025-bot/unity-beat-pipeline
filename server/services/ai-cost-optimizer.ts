/**
 * AI Cost Optimizer
 *
 * Automatically select the cheapest AI model that meets quality requirements.
 * Supports OpenAI, Gemini, and Claude with dynamic model selection.
 */

export interface ModelPricing {
  provider: 'openai' | 'gemini' | 'claude';
  model: string;
  inputCostPer1K: number;
  outputCostPer1K: number;
  qualityTier: 'premium' | 'standard' | 'economy';
  contextWindow: number;
}

// Updated pricing as of Dec 2025
export const MODEL_PRICING: ModelPricing[] = [
  // Gemini Models (primary)
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    inputCostPer1K: 0.00015,
    outputCostPer1K: 0.0006,
    qualityTier: 'economy',
    contextWindow: 1000000,
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-pro',
    inputCostPer1K: 0.00125,
    outputCostPer1K: 0.01,
    qualityTier: 'premium',
    contextWindow: 2000000,
  },
];

export interface TaskRequirements {
  minQuality: 'premium' | 'standard' | 'economy';
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  preferredProvider?: 'openai' | 'gemini' | 'claude';
  requiresLongContext?: boolean; // > 100K tokens
}

export interface ModelRecommendation {
  provider: 'openai' | 'gemini' | 'claude';
  model: string;
  estimatedCost: number;
  savingsVsPremium: number;
  reasoning: string;
}

class AICostOptimizer {
  /**
   * Get cheapest model that meets requirements
   */
  getCheapestModel(requirements: TaskRequirements): ModelRecommendation {
    const { minQuality, estimatedInputTokens, estimatedOutputTokens, preferredProvider, requiresLongContext } =
      requirements;

    // Filter models by requirements
    let candidates = MODEL_PRICING.filter((model) => {
      // Quality tier check
      const qualityOrder = { economy: 0, standard: 1, premium: 2 };
      const meetsQuality = qualityOrder[model.qualityTier] >= qualityOrder[minQuality];

      // Provider preference
      const meetsProvider = !preferredProvider || model.provider === preferredProvider;

      // Context window check
      const meetsContext = !requiresLongContext || model.contextWindow >= 100000;

      return meetsQuality && meetsProvider && meetsContext;
    });

    if (candidates.length === 0) {
      // Fallback to gpt-4o if no matches
      candidates = MODEL_PRICING.filter((m) => m.model === 'gpt-4o');
    }

    // Calculate costs for each candidate
    const costAnalysis = candidates.map((model) => {
      const inputCost = (estimatedInputTokens / 1000) * model.inputCostPer1K;
      const outputCost = (estimatedOutputTokens / 1000) * model.outputCostPer1K;
      const totalCost = inputCost + outputCost;

      return {
        ...model,
        totalCost,
      };
    });

    // Sort by cost (cheapest first)
    costAnalysis.sort((a, b) => a.totalCost - b.totalCost);

    const cheapest = costAnalysis[0];
    const mostExpensive = costAnalysis[costAnalysis.length - 1];

    return {
      provider: cheapest.provider,
      model: cheapest.model,
      estimatedCost: cheapest.totalCost,
      savingsVsPremium: mostExpensive.totalCost - cheapest.totalCost,
      reasoning: `Selected ${cheapest.model} (${cheapest.qualityTier} tier) for $${cheapest.totalCost.toFixed(4)} vs ${mostExpensive.model} at $${mostExpensive.totalCost.toFixed(4)}`,
    };
  }

  /**
   * Get model recommendations for common tasks
   */
  getRecommendationForTask(task: string): ModelRecommendation {
    const taskProfiles: Record<string, TaskRequirements> = {
      // Strategic tasks (need quality)
      strategic_summary: {
        minQuality: 'premium',
        estimatedInputTokens: 10000,
        estimatedOutputTokens: 2000,
      },
      creative_strategy: {
        minQuality: 'premium',
        estimatedInputTokens: 5000,
        estimatedOutputTokens: 1500,
        preferredProvider: 'openai', // GPT-4o is best for creative
      },

      // Pattern analysis (can use economy)
      pattern_analysis: {
        minQuality: 'economy',
        estimatedInputTokens: 8000,
        estimatedOutputTokens: 1500,
        preferredProvider: 'gemini', // Gemini is great for patterns
      },
      data_extraction: {
        minQuality: 'economy',
        estimatedInputTokens: 5000,
        estimatedOutputTokens: 1000,
        preferredProvider: 'gemini',
      },

      // Narrative tasks (Claude excels)
      narrative_structure: {
        minQuality: 'premium',
        estimatedInputTokens: 6000,
        estimatedOutputTokens: 2000,
        preferredProvider: 'claude',
      },
      content_authenticity: {
        minQuality: 'standard',
        estimatedInputTokens: 4000,
        estimatedOutputTokens: 1000,
        preferredProvider: 'claude',
      },

      // Simple tasks (use cheapest)
      lyrics_validation: {
        minQuality: 'economy',
        estimatedInputTokens: 1500,
        estimatedOutputTokens: 300,
      },
      prompt_generation: {
        minQuality: 'economy',
        estimatedInputTokens: 1000,
        estimatedOutputTokens: 500,
      },
      consensus_judge: {
        minQuality: 'economy',
        estimatedInputTokens: 3000,
        estimatedOutputTokens: 500,
      },
    };

    const profile = taskProfiles[task] || taskProfiles['prompt_generation'];
    return this.getCheapestModel(profile);
  }

  /**
   * Compare cost of using different models
   */
  compareCosts(
    inputTokens: number,
    outputTokens: number,
    models: string[],
  ): Array<{ model: string; provider: string; cost: number; savings: string }> {
    const selectedModels = MODEL_PRICING.filter((m) => models.includes(m.model));

    const costs = selectedModels.map((model) => {
      const inputCost = (inputTokens / 1000) * model.inputCostPer1K;
      const outputCost = (outputTokens / 1000) * model.outputCostPer1K;
      const totalCost = inputCost + outputCost;

      return {
        model: model.model,
        provider: model.provider,
        cost: totalCost,
      };
    });

    // Sort by cost
    costs.sort((a, b) => a.cost - b.cost);

    // Calculate savings
    const mostExpensive = costs[costs.length - 1].cost;
    return costs.map((c) => ({
      ...c,
      savings:
        c.cost < mostExpensive ? `-${(((mostExpensive - c.cost) / mostExpensive) * 100).toFixed(0)}%` : 'baseline',
    }));
  }

  /**
   * Get best models for strategic summary
   * Optimized to use cheaper models where quality isn't critical
   */
  getStrategicSummaryConfig(): {
    creative: ModelRecommendation;
    pattern: ModelRecommendation;
    consensus: ModelRecommendation;
    totalEstimatedCost: number;
  } {
    // Creative strategy needs GPT-4o (best for creativity)
    const creative = this.getCheapestModel({
      minQuality: 'premium',
      estimatedInputTokens: 10000,
      estimatedOutputTokens: 2000,
      preferredProvider: 'openai',
    });

    // Pattern analysis can use Gemini Flash (10x cheaper!)
    const pattern = this.getCheapestModel({
      minQuality: 'economy',
      estimatedInputTokens: 8000,
      estimatedOutputTokens: 1500,
      preferredProvider: 'gemini',
    });

    // Consensus judge can use GPT-4o-mini (10x cheaper!)
    const consensus = this.getCheapestModel({
      minQuality: 'economy',
      estimatedInputTokens: 3000,
      estimatedOutputTokens: 500,
    });

    return {
      creative,
      pattern,
      consensus,
      totalEstimatedCost: creative.estimatedCost + pattern.estimatedCost + consensus.estimatedCost,
    };
  }
}

export const aiCostOptimizer = new AICostOptimizer();

// Example usage:
/*
// Get cheapest model for a task
const recommendation = aiCostOptimizer.getRecommendationForTask('lyrics_validation');
console.log(recommendation);
// Output: { provider: 'gemini', model: 'gemini-2.5-flash', estimatedCost: 0.00135, ... }

// Compare costs between models
const comparison = aiCostOptimizer.compareCosts(10000, 2000, [
  'gpt-4o',
  'gpt-4o-mini',
  'gemini-2.5-flash',
  'claude-haiku-4',
]);
console.log(comparison);
// Shows cost and savings for each model

// Get optimized config for strategic summary
const config = aiCostOptimizer.getStrategicSummaryConfig();
console.log(`Total estimated cost: $${config.totalEstimatedCost.toFixed(4)}`);
// Recommends best model for each part of the summary
*/
