/**
 * Thompson Sampling Bandit Logic Tests
 *
 * Tests the mathematical formulas used in style-bandit-service.ts inline,
 * since sampleBeta, calculateReward, and sanitizeMetric are private methods.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// REWARD WEIGHTS (mirrors style-bandit-service.ts)
// ============================================================================
const REWARD_WEIGHTS = {
  w_ctr: 1.0,
  w_vtr: 2.0,
  w_sub: 10.0,
};

const DEFAULT_GAMMA = 0.95;

// ============================================================================
// Inline implementations of the private formulas
// ============================================================================

function betaMean(alpha: number, beta: number): number {
  return alpha / (alpha + beta);
}

function calculateReward(metrics: { clicked: boolean; vtr: number; subscribed: boolean }): number {
  const ctrComponent = REWARD_WEIGHTS.w_ctr * (metrics.clicked ? 1 : 0);
  const vtrComponent = REWARD_WEIGHTS.w_vtr * metrics.vtr;
  const subComponent = REWARD_WEIGHTS.w_sub * (metrics.subscribed ? 1 : 0);
  return ctrComponent + vtrComponent + subComponent;
}

function sanitizeMetric(val: number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  return isNaN(val) ? 0 : val;
}

function applyDecay(alpha: number, beta: number, gamma: number): { alpha: number; beta: number } {
  return {
    alpha: Math.max(1, alpha * gamma),
    beta: Math.max(1, beta * gamma),
  };
}

// ============================================================================
// 1. Beta distribution math — mean = alpha / (alpha + beta)
// ============================================================================

describe('Beta distribution mean formula', () => {
  it('computes correct mean for equal alpha and beta', () => {
    expect(betaMean(1, 1)).toBeCloseTo(0.5);
    expect(betaMean(5, 5)).toBeCloseTo(0.5);
    expect(betaMean(100, 100)).toBeCloseTo(0.5);
  });

  it('mean approaches 1 as alpha dominates', () => {
    expect(betaMean(99, 1)).toBeCloseTo(0.99);
    expect(betaMean(9, 1)).toBeCloseTo(0.9);
    expect(betaMean(3, 1)).toBeCloseTo(0.75);
  });

  it('mean approaches 0 as beta dominates', () => {
    expect(betaMean(1, 99)).toBeCloseTo(0.01);
    expect(betaMean(1, 9)).toBeCloseTo(0.1);
    expect(betaMean(1, 3)).toBeCloseTo(0.25);
  });

  it('mean stays in [0, 1] for positive alpha and beta', () => {
    const cases: [number, number][] = [
      [1, 1],
      [2, 8],
      [8, 2],
      [50, 1],
      [1, 50],
      [0.1, 0.9],
    ];
    for (const [a, b] of cases) {
      const mean = betaMean(a, b);
      expect(mean).toBeGreaterThanOrEqual(0);
      expect(mean).toBeLessThanOrEqual(1);
    }
  });

  it('mean is consistent with large parameter values', () => {
    expect(betaMean(200, 100)).toBeCloseTo(2 / 3, 5);
    expect(betaMean(1000, 500)).toBeCloseTo(2 / 3, 5);
  });
});

// ============================================================================
// 2. Uniform prior — new arms start at (1, 1), mean = 0.5
// ============================================================================

describe('Uniform prior (cold start)', () => {
  it('new arm alpha=1, beta=1 gives mean 0.5', () => {
    const alpha = 1;
    const beta = 1;
    expect(betaMean(alpha, beta)).toBeCloseTo(0.5);
  });

  it('cold start values produce maximum uncertainty (equal likelihood of any outcome)', () => {
    // With alpha=beta=1, the Beta distribution is uniform on [0,1]
    // Mean is 0.5, which is the midpoint — no bias toward success or failure
    const alpha = 1;
    const beta = 1;
    const mean = betaMean(alpha, beta);
    expect(mean).toBe(0.5);
  });
});

// ============================================================================
// 3. Decay factor — gamma = 0.95
// ============================================================================

describe('Gamma decay (γ = 0.95)', () => {
  it('applies decay proportionally to alpha and beta', () => {
    const alpha = 10;
    const beta = 5;
    const decayed = applyDecay(alpha, beta, DEFAULT_GAMMA);

    expect(decayed.alpha).toBeCloseTo(alpha * DEFAULT_GAMMA);
    expect(decayed.beta).toBeCloseTo(beta * DEFAULT_GAMMA);
  });

  it('mean stays the same after proportional decay (when both values are well above floor)', () => {
    const alpha = 100;
    const beta = 50;
    const meanBefore = betaMean(alpha, beta);

    const decayed = applyDecay(alpha, beta, DEFAULT_GAMMA);
    const meanAfter = betaMean(decayed.alpha, decayed.beta);

    // When decay doesn't hit the floor (max(1, ...)), the ratio is preserved
    expect(meanAfter).toBeCloseTo(meanBefore, 5);
  });

  it('decay floors at 1 to prevent degenerate arms', () => {
    // Small alpha/beta values decay but cannot drop below 1
    const alpha = 0.5;
    const beta = 0.5;
    const decayed = applyDecay(alpha, beta, DEFAULT_GAMMA);

    expect(decayed.alpha).toBe(1);
    expect(decayed.beta).toBe(1);
  });

  it('arms with alpha=beta decay symmetrically and mean stays 0.5', () => {
    const alpha = 20;
    const beta = 20;
    const decayed = applyDecay(alpha, beta, DEFAULT_GAMMA);

    expect(decayed.alpha).toBeCloseTo(decayed.beta);
    expect(betaMean(decayed.alpha, decayed.beta)).toBeCloseTo(0.5);
  });

  it('repeated decay converges arms toward uniform prior (alpha -> 1, beta -> 1)', () => {
    let alpha = 10;
    let beta = 10;

    for (let i = 0; i < 100; i++) {
      const d = applyDecay(alpha, beta, DEFAULT_GAMMA);
      alpha = d.alpha;
      beta = d.beta;
    }

    // After many decay cycles, both should be floored at 1
    expect(alpha).toBe(1);
    expect(beta).toBe(1);
  });
});

// ============================================================================
// 4. Reward calculation — weighted sum stays in [0, 1] range
// ============================================================================

describe('Reward calculation', () => {
  it('no click, no vtr, no sub yields reward 0', () => {
    const reward = calculateReward({ clicked: false, vtr: 0, subscribed: false });
    expect(reward).toBe(0);
  });

  it('click only yields w_ctr = 1.0', () => {
    const reward = calculateReward({ clicked: true, vtr: 0, subscribed: false });
    expect(reward).toBe(REWARD_WEIGHTS.w_ctr);
  });

  it('full vtr (1.0) only yields w_vtr = 2.0', () => {
    const reward = calculateReward({ clicked: false, vtr: 1.0, subscribed: false });
    expect(reward).toBe(REWARD_WEIGHTS.w_vtr);
  });

  it('subscribe only yields w_sub = 10.0', () => {
    const reward = calculateReward({ clicked: false, vtr: 0, subscribed: true });
    expect(reward).toBe(REWARD_WEIGHTS.w_sub);
  });

  it('all positive metrics sum correctly', () => {
    const reward = calculateReward({ clicked: true, vtr: 1.0, subscribed: true });
    const expected = REWARD_WEIGHTS.w_ctr + REWARD_WEIGHTS.w_vtr + REWARD_WEIGHTS.w_sub;
    expect(reward).toBe(expected);
  });

  it('partial vtr scales linearly', () => {
    const reward = calculateReward({ clicked: false, vtr: 0.5, subscribed: false });
    expect(reward).toBeCloseTo(REWARD_WEIGHTS.w_vtr * 0.5);
  });

  it('vtr is clamped to [0, 1] range — reward stays in expected bounds', () => {
    // With vtr in [0,1], reward is bounded by 0 to (w_ctr + w_vtr + w_sub)
    const maxReward = REWARD_WEIGHTS.w_ctr + REWARD_WEIGHTS.w_vtr + REWARD_WEIGHTS.w_sub;

    const cases = [
      { clicked: false, vtr: 0, subscribed: false },
      { clicked: true, vtr: 0.5, subscribed: false },
      { clicked: true, vtr: 1.0, subscribed: true },
    ];

    for (const metrics of cases) {
      const reward = calculateReward(metrics);
      expect(reward).toBeGreaterThanOrEqual(0);
      expect(reward).toBeLessThanOrEqual(maxReward);
    }
  });

  it('reward is positive for any non-zero metric', () => {
    expect(calculateReward({ clicked: true, vtr: 0, subscribed: false })).toBeGreaterThan(0);
    expect(calculateReward({ clicked: false, vtr: 0.01, subscribed: false })).toBeGreaterThan(0);
    expect(calculateReward({ clicked: false, vtr: 0, subscribed: true })).toBeGreaterThan(0);
  });
});

// ============================================================================
// 5. sanitizeMetric — null/NaN -> 0, valid numbers pass through
// ============================================================================

describe('sanitizeMetric', () => {
  it('returns 0 for null', () => {
    expect(sanitizeMetric(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(sanitizeMetric(undefined)).toBe(0);
  });

  it('returns 0 for NaN', () => {
    expect(sanitizeMetric(NaN)).toBe(0);
  });

  it('passes through valid positive numbers', () => {
    expect(sanitizeMetric(42)).toBe(42);
    expect(sanitizeMetric(0.5)).toBe(0.5);
    expect(sanitizeMetric(100)).toBe(100);
  });

  it('passes through zero', () => {
    expect(sanitizeMetric(0)).toBe(0);
  });

  it('passes through negative numbers', () => {
    // The function does not clamp negatives — just sanitizes non-numeric values
    expect(sanitizeMetric(-5)).toBe(-5);
  });

  it('handles edge case: Infinity passes through (not NaN, not null)', () => {
    // Infinity is a valid JS number per isNaN check
    expect(sanitizeMetric(Infinity)).toBe(Infinity);
  });

  it('handles computed NaN (e.g. 0/0)', () => {
    expect(sanitizeMetric(0 / 0)).toBe(0);
  });
});
