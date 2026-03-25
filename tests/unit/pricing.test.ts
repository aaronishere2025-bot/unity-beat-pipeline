import { describe, it, expect } from 'vitest';
import {
  calculateOpenAICost,
  calculateGeminiCost,
  calculateClaudeCost,
  calculateKlingCost,
  calculateSunoCost,
  calculateUserCharge,
  validateModel,
  API_COSTS,
  USER_PRICING,
} from '../../server/config/pricing';

// ============================================================================
// calculateOpenAICost
// ============================================================================

describe('calculateOpenAICost', () => {
  it('calculates cost for gpt-4o with tokens', () => {
    // 1000 input tokens: 0.0025, 1000 output tokens: 0.01 → $0.0125
    const cost = calculateOpenAICost('gpt-4o', 1000, 1000);
    expect(cost).toBeCloseTo(0.0125);
  });

  it('calculates cost for gpt-4o-mini with tokens', () => {
    // 1000 input: 0.00015, 1000 output: 0.0006 → $0.00075
    const cost = calculateOpenAICost('gpt-4o-mini', 1000, 1000);
    expect(cost).toBeCloseTo(0.00075);
  });

  it('calculates cost for gpt-4-turbo with tokens', () => {
    // 1000 input: 0.01, 1000 output: 0.03 → $0.04
    const cost = calculateOpenAICost('gpt-4-turbo', 1000, 1000);
    expect(cost).toBeCloseTo(0.04);
  });

  it('returns zero cost when both token counts are zero', () => {
    const cost = calculateOpenAICost('gpt-4o', 0, 0);
    expect(cost).toBe(0);
  });

  it('falls back to gpt-4o pricing for unknown model', () => {
    const fallback = calculateOpenAICost('gpt-4o', 2000, 500);
    const unknown = calculateOpenAICost('gpt-unknown-xyz', 2000, 500);
    expect(unknown).toBeCloseTo(fallback);
  });

  it('calculates whisper-1 cost using per-minute pricing', () => {
    // 60 seconds = 1 minute × $0.006 = $0.006
    const cost = calculateOpenAICost('whisper-1', 0, 0, 60);
    expect(cost).toBeCloseTo(0.006);
  });

  it('calculates whisper-1 cost for partial minute', () => {
    // 30 seconds = 0.5 minutes × $0.006 = $0.003
    const cost = calculateOpenAICost('whisper-1', 0, 0, 30);
    expect(cost).toBeCloseTo(0.003);
  });

  it('scales linearly with token count', () => {
    const cost1k = calculateOpenAICost('gpt-4o', 1000, 0);
    const cost2k = calculateOpenAICost('gpt-4o', 2000, 0);
    expect(cost2k).toBeCloseTo(cost1k * 2);
  });
});

// ============================================================================
// calculateGeminiCost
// ============================================================================

describe('calculateGeminiCost', () => {
  it('calculates cost for gemini-2.5-flash with tokens', () => {
    // 1000 input: 0.00015, 1000 output: 0.0006 → $0.00075
    const cost = calculateGeminiCost('gemini-2.5-flash', 1000, 1000);
    expect(cost).toBeCloseTo(0.00075);
  });

  it('calculates cost for gemini-2.5-pro with tokens', () => {
    // 1000 input: 0.00125, 1000 output: 0.01 → $0.01125
    const cost = calculateGeminiCost('gemini-2.5-pro', 1000, 1000);
    expect(cost).toBeCloseTo(0.01125);
  });

  it('falls back to gemini-2.5-pro for unknown pro model', () => {
    const known = calculateGeminiCost('gemini-2.5-pro', 1000, 1000);
    const unknown = calculateGeminiCost('gemini-future-pro', 1000, 1000);
    expect(unknown).toBeCloseTo(known);
  });

  it('falls back to gemini-2.5-flash for unknown non-pro model', () => {
    const known = calculateGeminiCost('gemini-2.5-flash', 1000, 1000);
    const unknown = calculateGeminiCost('gemini-future-flash', 1000, 1000);
    expect(unknown).toBeCloseTo(known);
  });

  it('returns zero cost when both token counts are zero', () => {
    const cost = calculateGeminiCost('gemini-2.5-flash', 0, 0);
    expect(cost).toBe(0);
  });

  it('calculates embedding cost (output is free)', () => {
    // text-embedding-004: input 0.000025, output 0
    const cost = calculateGeminiCost('text-embedding-004', 1000, 1000);
    expect(cost).toBeCloseTo(0.000025);
  });
});

// ============================================================================
// calculateClaudeCost
// ============================================================================

describe('calculateClaudeCost', () => {
  it('calculates cost for claude-opus-4-5', () => {
    // 1000 input: 0.015, 1000 output: 0.075 → $0.09
    const cost = calculateClaudeCost('claude-opus-4-5', 1000, 1000);
    expect(cost).toBeCloseTo(0.09);
  });

  it('calculates cost for claude-sonnet-4-5', () => {
    // 1000 input: 0.003, 1000 output: 0.015 → $0.018
    const cost = calculateClaudeCost('claude-sonnet-4-5', 1000, 1000);
    expect(cost).toBeCloseTo(0.018);
  });

  it('uses opus pricing when model name contains "opus"', () => {
    const cost = calculateClaudeCost('claude-opus-future', 1000, 1000);
    const opusCost = calculateClaudeCost('claude-opus-4-5', 1000, 1000);
    expect(cost).toBeCloseTo(opusCost);
  });

  it('uses sonnet-4-5 pricing for model names containing "4.5"', () => {
    const cost = calculateClaudeCost('claude-sonnet-4.5', 1000, 1000);
    const sonnetCost = calculateClaudeCost('claude-sonnet-4-5', 1000, 1000);
    expect(cost).toBeCloseTo(sonnetCost);
  });

  it('falls back to claude-sonnet-4 pricing for unknown model', () => {
    const fallback = calculateClaudeCost('claude-sonnet-4', 1000, 1000);
    const unknown = calculateClaudeCost('claude-unknown-model', 1000, 1000);
    expect(unknown).toBeCloseTo(fallback);
  });

  it('returns zero cost when both token counts are zero', () => {
    const cost = calculateClaudeCost('claude-sonnet-4-5', 0, 0);
    expect(cost).toBe(0);
  });
});

// ============================================================================
// calculateKlingCost
// ============================================================================

describe('calculateKlingCost', () => {
  it('calculates cost for a single 15-second clip (default)', () => {
    // per15sClip = $1.50
    const cost = calculateKlingCost(1);
    expect(cost).toBeCloseTo(1.5);
  });

  it('calculates cost for multiple 15-second clips', () => {
    const cost = calculateKlingCost(4);
    expect(cost).toBeCloseTo(6.0);
  });

  it('calculates cost for 10-second clips', () => {
    // per10sClip = $1.00
    const cost = calculateKlingCost(1, 10);
    expect(cost).toBeCloseTo(1.0);
  });

  it('calculates cost for 5-second clips', () => {
    // per5sClip = $0.50
    const cost = calculateKlingCost(1, 5);
    expect(cost).toBeCloseTo(0.5);
  });

  it('calculates cost for multiple 5-second clips', () => {
    const cost = calculateKlingCost(3, 5);
    expect(cost).toBeCloseTo(1.5);
  });

  it('returns zero cost for zero clips', () => {
    const cost = calculateKlingCost(0);
    expect(cost).toBe(0);
  });
});

// ============================================================================
// calculateSunoCost
// ============================================================================

describe('calculateSunoCost', () => {
  it('calculates cost for a single v5 song (default)', () => {
    // $0.10 per song
    const cost = calculateSunoCost(1);
    expect(cost).toBeCloseTo(0.1);
  });

  it('calculates cost for multiple v5 songs', () => {
    const cost = calculateSunoCost(5);
    expect(cost).toBeCloseTo(0.5);
  });

  it('calculates cost for v4 songs', () => {
    const cost = calculateSunoCost(2, 'v4');
    expect(cost).toBeCloseTo(0.2);
  });

  it('calculates cost for v3.5 songs', () => {
    const cost = calculateSunoCost(3, 'v3.5');
    expect(cost).toBeCloseTo(0.3);
  });

  it('returns zero cost for zero songs', () => {
    const cost = calculateSunoCost(0);
    expect(cost).toBe(0);
  });
});

// ============================================================================
// calculateUserCharge
// ============================================================================

describe('calculateUserCharge', () => {
  it('returns flat BEAT_FLAT rate for "beats" mode', () => {
    const charge = calculateUserCharge('beats', 0.05);
    expect(charge).toBe(USER_PRICING.BEAT_FLAT); // $2.50
  });

  it('returns flat BEAT_FLAT rate for "music" mode', () => {
    const charge = calculateUserCharge('music', 0.05);
    expect(charge).toBe(USER_PRICING.BEAT_FLAT);
  });

  it('returns per-clip charge for "kling" mode with clipCount', () => {
    // 5 clips × $0.30 = $1.50
    const charge = calculateUserCharge('kling', 0.05, 5);
    expect(charge).toBeCloseTo(5 * USER_PRICING.VIDEO_CLIP);
  });

  it('returns per-clip charge for "unity_kling" mode with clipCount', () => {
    const charge = calculateUserCharge('unity_kling', 0.05, 3);
    expect(charge).toBeCloseTo(3 * USER_PRICING.VIDEO_CLIP);
  });

  it('falls back to 300% markup for "kling" mode without clipCount', () => {
    const actualCost = 1.0;
    const charge = calculateUserCharge('kling', actualCost);
    expect(charge).toBeCloseTo(actualCost * USER_PRICING.DEFAULT_MARKUP);
  });

  it('applies 300% markup for unknown mode', () => {
    const actualCost = 0.5;
    const charge = calculateUserCharge('unknown_mode', actualCost);
    expect(charge).toBeCloseTo(actualCost * 3.0);
  });

  it('returns zero charge for zero actual cost on unknown mode', () => {
    const charge = calculateUserCharge('unknown_mode', 0);
    expect(charge).toBe(0);
  });
});

// ============================================================================
// validateModel
// ============================================================================

describe('validateModel', () => {
  it('returns true for a known OpenAI model', () => {
    expect(validateModel('openai', 'gpt-4o')).toBe(true);
  });

  it('returns true for gpt-4o-mini', () => {
    expect(validateModel('openai', 'gpt-4o-mini')).toBe(true);
  });

  it('returns false for an unknown OpenAI model', () => {
    expect(validateModel('openai', 'gpt-99-ultra')).toBe(false);
  });

  it('returns true for any gemini model (auto-detect)', () => {
    expect(validateModel('gemini', 'gemini-2.5-flash')).toBe(true);
    expect(validateModel('gemini', 'gemini-future-model')).toBe(true);
  });

  it('returns true for any claude model (auto-detect)', () => {
    expect(validateModel('claude', 'claude-sonnet-4-5')).toBe(true);
    expect(validateModel('claude', 'claude-future-model')).toBe(true);
  });

  it('returns true for a known Kling model', () => {
    expect(validateModel('kling', 'kling-3.0')).toBe(true);
  });

  it('returns false for an unknown Kling model', () => {
    expect(validateModel('kling', 'kling-1.0')).toBe(false);
  });

  it('returns true for suno (version-based, always valid)', () => {
    expect(validateModel('suno', 'anything')).toBe(true);
  });

  it('returns false for an unknown service', () => {
    expect(validateModel('elevenLabs', 'some-model')).toBe(false);
  });
});
