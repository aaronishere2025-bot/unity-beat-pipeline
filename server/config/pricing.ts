/**
 * Centralized Pricing Configuration
 *
 * Single source of truth for all API costs and user pricing.
 * Replaces scattered pricing constants across multiple files.
 *
 * Created: 2026-01-26
 * Last Updated: 2026-01-26
 */

// ============================================================================
// API COSTS (What we pay to external services)
// ============================================================================

export const API_COSTS = {
  // OpenAI Models (costs per 1,000 tokens)
  openai: {
    'gpt-5.2': { input: 0.005, output: 0.015 },
    'gpt-4o': { input: 0.0025, output: 0.01 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'whisper-1': { perMinute: 0.006 },
  },

  // Gemini Models (costs per 1,000 tokens)
  gemini: {
    'gemini-2.5-flash': { input: 0.00015, output: 0.0006 },
    'gemini-2.5-pro': { input: 0.00125, output: 0.01 },
    'gemini-2.5-flash-image': { input: 0.0001, output: 0.0004 },
    'text-embedding-004': { input: 0.000025, output: 0 },
  },

  // Claude Models (costs per 1,000 tokens)
  claude: {
    'claude-opus-4-5': { input: 0.015, output: 0.075 },
    'claude-sonnet-4-5': { input: 0.003, output: 0.015 },
    'claude-sonnet-4': { input: 0.003, output: 0.015 },
    'claude-3-5-sonnet': { input: 0.003, output: 0.015 },
  },

  // Kling Video Generation (costs per clip)
  // Pricing: $50 per 10,000 credits = $0.005/credit
  // Standard mode (no sound): 20 credits/second
  // Standard mode (with sound / multi-shot): 40 credits/second
  kling: {
    'kling-3.0': {
      per5sClip: 0.5, // 5s × 20 credits/s = 100 credits = $0.50
      per10sClip: 1.0, // 10s × 20 credits/s = 200 credits = $1.00
      per15sClip: 1.5, // 15s × 20 credits/s = 300 credits = $1.50
      per15sClipWithSound: 3.0, // 15s × 40 credits/s = 600 credits = $3.00 (multi-shot requires sound)
    },
    'kling-2.5-turbo': {
      per5sClip: 0.5, // 5s × 20 credits/s = 100 credits = $0.50
      per10sClip: 1.0, // 10s × 20 credits/s = 200 credits = $1.00
      per15sClip: 1.5, // 15s × 20 credits/s = 300 credits = $1.50
    },
  },

  // Suno Music Generation (costs per song)
  suno: {
    v5: { perSong: 0.1 },
    v4: { perSong: 0.1 },
    'v3.5': { perSong: 0.1 },
  },

  // YouTube APIs (free)
  youtube: {
    'data-api': { perUnit: 0 },
    'analytics-api': { perUnit: 0 },
  },
} as const;

// ============================================================================
// USER PRICING (What we charge users)
// ============================================================================

export const USER_PRICING = {
  // Beat/Music Generation
  BEAT_FLAT: 2.5, // Flat $2.50 per beat (regardless of actual cost)
  BEAT_ACTUAL_COST: 0.1, // Typical actual cost (Suno)

  // Video Clip Generation
  VIDEO_CLIP: 0.3, // $0.30 per clip charged to user
  VIDEO_CLIP_ACTUAL_COST: 0.1, // Actual cost per Kling clip

  // Fallback Pricing
  DEFAULT_MARKUP: 3.0, // 300% markup for unknown/custom modes

  // Beat Store Commission
  COMMISSION_GENERATED: 0, // 0% on platform-generated beats
  COMMISSION_EXTERNAL: 0.1, // 10% on external uploads
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate cost for OpenAI API call based on token usage
 * @param model - Model name (e.g., 'gpt-4o', 'gpt-4o-mini')
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param durationSeconds - For Whisper, duration in seconds
 * @returns Cost in USD
 */
export function calculateOpenAICost(
  model: string,
  inputTokens: number = 0,
  outputTokens: number = 0,
  durationSeconds?: number,
): number {
  const modelKey = model as keyof typeof API_COSTS.openai;
  const pricing = API_COSTS.openai[modelKey] || API_COSTS.openai['gpt-4o'];

  // Whisper uses per-minute pricing
  if (model.includes('whisper') && durationSeconds) {
    return (durationSeconds / 60) * (pricing as any).perMinute;
  }

  // Standard token-based pricing
  if ('input' in pricing) {
    return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
  }

  return 0;
}

/**
 * Calculate cost for Gemini API call based on token usage
 * @param model - Model name (e.g., 'gemini-2.5-flash', 'gemini-2.5-pro')
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateGeminiCost(model: string, inputTokens: number = 0, outputTokens: number = 0): number {
  // Auto-detect model variant - check exact match first, then fallback
  let modelKey: string;
  if (model in API_COSTS.gemini) {
    modelKey = model;
  } else if (model.includes('pro')) {
    modelKey = 'gemini-2.5-pro';
  } else {
    modelKey = 'gemini-2.5-flash';
  }

  const pricing = API_COSTS.gemini[modelKey as keyof typeof API_COSTS.gemini];
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

/**
 * Calculate cost for Claude API call based on token usage
 * @param model - Model name (e.g., 'claude-sonnet-4-5', 'claude-opus-4-5')
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateClaudeCost(model: string, inputTokens: number = 0, outputTokens: number = 0): number {
  // Auto-detect model variant
  const modelKey = model.includes('opus')
    ? 'claude-opus-4-5'
    : model.includes('4.5') || model.includes('4-5')
      ? 'claude-sonnet-4-5'
      : 'claude-sonnet-4';

  const pricing = API_COSTS.claude[modelKey as keyof typeof API_COSTS.claude] || API_COSTS.claude['claude-sonnet-4'];
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}

/**
 * Calculate cost for vision models (Gemini multimodal)
 * Vision calls use gemini-2.5-flash with image inputs
 * @param model - Model name
 * @param inputTokens - Number of input tokens (includes image tokens)
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateVisionCost(model: string, inputTokens: number = 0, outputTokens: number = 0): number {
  // Vision uses Gemini multimodal pricing
  return calculateGeminiCost(model, inputTokens, outputTokens);
}

/**
 * Calculate cost for Kling video generation
 * @param clipCount - Number of clips generated
 * @param clipDuration - Duration of each clip (5 or 10 seconds)
 * @returns Cost in USD
 */
export function calculateKlingCost(clipCount: number, clipDuration: 5 | 10 | 15 = 15): number {
  const pricing = API_COSTS.kling['kling-3.0'];
  const costPerClip =
    clipDuration === 15 ? pricing.per15sClip : clipDuration === 10 ? pricing.per10sClip : pricing.per5sClip;

  return clipCount * costPerClip;
}

/**
 * Calculate cost for Suno music generation
 * @param songCount - Number of songs generated
 * @param version - Suno version (v5, v4, v3.5)
 * @returns Cost in USD
 */
export function calculateSunoCost(songCount: number, version: 'v5' | 'v4' | 'v3.5' = 'v5'): number {
  return songCount * API_COSTS.suno[version].perSong;
}

/**
 * Calculate user charge based on job mode and parameters
 * @param mode - Job mode ('beats', 'music', 'kling', 'unity_kling', etc.)
 * @param actualCost - Actual cost incurred
 * @param clipCount - Number of video clips (for video modes)
 * @returns User charge in USD
 */
export function calculateUserCharge(mode: string, actualCost: number, clipCount?: number): number {
  // Beats/Music: Flat rate
  if (mode === 'music' || mode === 'beats') {
    return USER_PRICING.BEAT_FLAT;
  }

  // Video: Per-clip pricing
  if ((mode === 'kling' || mode === 'unity_kling') && clipCount) {
    return clipCount * USER_PRICING.VIDEO_CLIP;
  }

  // Fallback: 300% markup on actual cost
  return actualCost * USER_PRICING.DEFAULT_MARKUP;
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate that a model exists in pricing config
 * @param service - Service name ('openai', 'gemini', 'claude', 'kling', 'suno')
 * @param model - Model name
 * @returns true if model exists, false otherwise
 */
export function validateModel(service: string, model: string): boolean {
  if (service === 'openai') {
    return model in API_COSTS.openai;
  }
  if (service === 'gemini') {
    // Gemini models auto-detect, so any gemini model is valid
    return true;
  }
  if (service === 'claude') {
    // Claude models auto-detect, so any claude model is valid
    return true;
  }
  if (service === 'kling') {
    return model in API_COSTS.kling;
  }
  if (service === 'suno') {
    // Suno versions are passed separately, not as model names
    return true;
  }
  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  API_COSTS,
  USER_PRICING,
  calculateOpenAICost,
  calculateGeminiCost,
  calculateClaudeCost,
  calculateVisionCost,
  calculateKlingCost,
  calculateSunoCost,
  calculateUserCharge,
  validateModel,
};
