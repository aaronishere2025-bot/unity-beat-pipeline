/**
 * GEMINI PERSONALITY BANDIT SERVICE
 *
 * Thompson Sampling for Gemini AI personality experimentation.
 * Tests which Gemini "character" generates the best content.
 *
 * Instead of 3-model consensus (GPT-4o + Gemini + Claude),
 * we use ONE model (Gemini) with 3 different personalities.
 *
 * Features:
 * - 3 distinct Gemini personalities (arms)
 * - Thompson Sampling for automatic learning
 * - Multi-objective reward: R = w_quality × Quality + w_viral × Viral + w_engagement × Engagement
 * - Gamma decay (γ = 0.95) for trend adaptation
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// MULTI-OBJECTIVE REWARD WEIGHTS
// ============================================================================
const REWARD_WEIGHTS = {
  w_quality: 2.0, // Content quality (coherence, accuracy, style)
  w_viral: 3.0, // Virality potential (hooks, pacing, drama)
  w_engagement: 1.5, // Engagement signals (CTR, retention, comments)
};

// Default gamma decay factor
const DEFAULT_GAMMA = 0.95;

// ============================================================================
// GEMINI PERSONALITY ARMS
// ============================================================================

export interface GeminiPersonalityArm {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;

  // Personality traits
  traits: {
    creativity: number; // 1-10: How creative/experimental
    accuracy: number; // 1-10: Historical accuracy focus
    dramatization: number; // 1-10: How dramatic/theatrical
    pacing: number; // 1-10: Fast-paced vs methodical
    humor: number; // 1-10: How humorous/witty
    formality: number; // 1-10: Formal vs casual tone
  };

  // Thompson Sampling state
  alpha: number; // Successes + 1
  beta: number; // Failures + 1
  pulls: number; // Times selected

  // Performance tracking
  avgQualityScore: number; // 0-100
  avgViralScore: number; // 0-100
  avgEngagement: number; // 0-100
  totalUses: number;
  videoIds: string[];

  lastUsed: string | null;
  createdAt: string;
}

// Multi-objective reward metrics
export interface RewardMetrics {
  qualityScore: number; // 0-100: Content quality
  viralScore: number; // 0-100: Virality potential
  engagementScore: number; // 0-100: Actual engagement
}

// Default personality arms
const DEFAULT_PERSONALITIES: Omit<
  GeminiPersonalityArm,
  | 'alpha'
  | 'beta'
  | 'pulls'
  | 'avgQualityScore'
  | 'avgViralScore'
  | 'avgEngagement'
  | 'totalUses'
  | 'videoIds'
  | 'lastUsed'
  | 'createdAt'
>[] = [
  {
    id: 'historian_dramatist',
    name: 'The Historian Dramatist',
    description: 'Academic historian who brings history to life with theatrical flair',
    systemPrompt: `You are a renowned historian with a gift for storytelling. You have:

- Deep knowledge of historical facts, dates, and context
- A theatrical, dramatic style that makes history feel ALIVE
- Ability to connect historical events to modern audiences
- Strong narrative structure with clear beginnings, middles, and ends
- Emphasis on human drama, conflict, and turning points

Your style:
- Start with a HOOK that grabs attention
- Use vivid, cinematic descriptions
- Build tension and suspense
- Include surprising twists or lesser-known facts
- End with powerful conclusions that resonate

Your tone is authoritative yet accessible, like a documentary narrator who's also a natural storyteller.`,
    traits: {
      creativity: 7,
      accuracy: 9,
      dramatization: 8,
      pacing: 7,
      humor: 4,
      formality: 6,
    },
  },
  {
    id: 'viral_storyteller',
    name: 'The Viral Storyteller',
    description: 'Modern content creator optimized for maximum virality and engagement',
    systemPrompt: `You are a viral content creator who understands what makes people CLICK and WATCH. You have:

- Mastery of social media hooks and attention-grabbing techniques
- Understanding of pacing, rhythm, and modern short-form content
- Ability to simplify complex topics without losing essence
- Focus on emotional impact and relatability
- Strategic use of cliffhangers and pattern interrupts

Your style:
- EXPLOSIVE openings that stop the scroll
- Fast-paced, punchy delivery
- Modern slang and casual language when appropriate
- Questions that make viewers think
- Callbacks and running themes
- Strong CTAs (calls to action)

Your tone is energetic, conversational, and optimized for platforms like TikTok and YouTube Shorts.`,
    traits: {
      creativity: 9,
      accuracy: 6,
      dramatization: 10,
      pacing: 10,
      humor: 8,
      formality: 3,
    },
  },
  {
    id: 'balanced_educator',
    name: 'The Balanced Educator',
    description: 'Educational content specialist who blends accuracy with accessibility',
    systemPrompt: `You are an educational content specialist who makes learning engaging. You have:

- Commitment to historical accuracy and proper context
- Skill at breaking down complex topics into digestible pieces
- Use of analogies, metaphors, and modern references
- Balance between entertainment and education
- Clear, structured explanations with logical flow

Your style:
- Clear topic introduction and framing
- Step-by-step progression through events
- Helpful context and "why this matters" moments
- Occasional humor to maintain engagement
- Educational takeaways and deeper meaning
- Respectful tone that treats audience as intelligent

Your tone is warm, intelligent, and reliable - like a favorite teacher who makes class interesting.`,
    traits: {
      creativity: 6,
      accuracy: 8,
      dramatization: 6,
      pacing: 6,
      humor: 6,
      formality: 5,
    },
  },
];

interface GeminiPersonalityBanditState {
  arms: Record<string, GeminiPersonalityArm>;
  currentDefault: string;
  minPullsBeforeSwitch: number;
  gamma: number;
  lastUpdated: string;
  lastDecayApplied: string | null;
}

class GeminiPersonalityBanditService {
  private dataPath: string;
  private state: GeminiPersonalityBanditState;

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'gemini_personality_bandit.json');
    this.state = this.loadState();
  }

  private loadState(): GeminiPersonalityBanditState {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });

      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        if (!data.gamma) data.gamma = DEFAULT_GAMMA;
        console.log(
          `🎭 Gemini Personality Bandit: Loaded ${Object.keys(data.arms || {}).length} personalities (γ=${data.gamma})`,
        );
        return data;
      }
    } catch (error) {
      console.warn('⚠️ Could not load Gemini personality bandit state');
    }

    return this.initializeDefaultState();
  }

  private initializeDefaultState(): GeminiPersonalityBanditState {
    const arms: Record<string, GeminiPersonalityArm> = {};

    for (const personality of DEFAULT_PERSONALITIES) {
      arms[personality.id] = {
        ...personality,
        alpha: 1,
        beta: 1,
        pulls: 0,
        avgQualityScore: 0,
        avgViralScore: 0,
        avgEngagement: 0,
        totalUses: 0,
        videoIds: [],
        lastUsed: null,
        createdAt: new Date().toISOString(),
      };
    }

    const state: GeminiPersonalityBanditState = {
      arms,
      currentDefault: 'balanced_educator',
      minPullsBeforeSwitch: 5,
      gamma: DEFAULT_GAMMA,
      lastUpdated: new Date().toISOString(),
      lastDecayApplied: null,
    };

    this.saveState(state);
    console.log(
      `🎭 Gemini Personality Bandit: Initialized with ${DEFAULT_PERSONALITIES.length} personalities (γ=${DEFAULT_GAMMA})`,
    );

    return state;
  }

  private saveState(state?: GeminiPersonalityBanditState): void {
    try {
      const toSave = state || this.state;
      toSave.lastUpdated = new Date().toISOString();
      writeFileSync(this.dataPath, JSON.stringify(toSave, null, 2));
    } catch (error) {
      console.warn('⚠️ Could not save Gemini personality bandit state');
    }
  }

  /**
   * Apply gamma decay to all arms
   */
  private applyGammaDecay(): void {
    const gamma = this.state.gamma;
    for (const arm of Object.values(this.state.arms)) {
      arm.alpha = Math.max(1, arm.alpha * gamma);
      arm.beta = Math.max(1, arm.beta * gamma);
    }
    this.state.lastDecayApplied = new Date().toISOString();
    console.log(`🎰 [Gemini Bandit] Applied γ=${gamma} decay to all personalities`);
  }

  /**
   * Calculate multi-objective reward
   * R = w_quality × Quality + w_viral × Viral + w_engagement × Engagement
   */
  private calculateReward(metrics: RewardMetrics): number {
    const qualityComponent = REWARD_WEIGHTS.w_quality * (metrics.qualityScore / 100);
    const viralComponent = REWARD_WEIGHTS.w_viral * (metrics.viralScore / 100);
    const engagementComponent = REWARD_WEIGHTS.w_engagement * (metrics.engagementScore / 100);

    return qualityComponent + viralComponent + engagementComponent;
  }

  /**
   * Sample from Beta distribution
   */
  private sampleBeta(alpha: number, beta: number): number {
    const gammaAlpha = this.sampleGamma(alpha);
    const gammaBeta = this.sampleGamma(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number, v: number;
      do {
        const u1 = Math.random();
        const u2 = Math.random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  /**
   * Select a Gemini personality using Thompson Sampling
   */
  selectPersonality(): {
    personalityId: string;
    personalityName: string;
    systemPrompt: string;
    traits: GeminiPersonalityArm['traits'];
    confidence: number;
    isExploration: boolean;
  } {
    const samples: Array<{
      id: string;
      sample: number;
      mean: number;
      arm: GeminiPersonalityArm;
    }> = [];

    // Sample from each personality's Beta distribution
    for (const [id, arm] of Object.entries(this.state.arms)) {
      const sample = this.sampleBeta(arm.alpha, arm.beta);
      const mean = arm.alpha / (arm.alpha + arm.beta);
      samples.push({ id, sample, mean, arm });
    }

    // Select personality with highest sample
    samples.sort((a, b) => b.sample - a.sample);
    const selected = samples[0];

    // Update pull count
    selected.arm.pulls++;
    selected.arm.lastUsed = new Date().toISOString();
    this.saveState();

    // Calculate confidence
    const confidence = Math.min(0.95, selected.arm.pulls / (selected.arm.pulls + 10));

    // Check if exploration
    const bestMeanArm = Object.values(this.state.arms).sort(
      (a, b) => b.alpha / (b.alpha + b.beta) - a.alpha / (a.alpha + a.beta),
    )[0];
    const isExploration = selected.id !== bestMeanArm.id;

    console.log(`🎭 GEMINI PERSONALITY: Selected "${selected.arm.name}"`);
    console.log(`   Sample: ${selected.sample.toFixed(3)}, Mean: ${selected.mean.toFixed(3)}`);
    console.log(`   Pulls: ${selected.arm.pulls}, ${isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'}`);

    return {
      personalityId: selected.id,
      personalityName: selected.arm.name,
      systemPrompt: selected.arm.systemPrompt,
      traits: selected.arm.traits,
      confidence,
      isExploration,
    };
  }

  /**
   * Update reward based on performance
   */
  updateReward(personalityId: string, metrics: RewardMetrics, videoId?: string): void {
    const arm = this.state.arms[personalityId];
    if (!arm) {
      console.warn(`⚠️ Unknown personality ID: ${personalityId}`);
      return;
    }

    // Apply gamma decay first
    this.applyGammaDecay();

    // Calculate reward
    const reward = this.calculateReward(metrics);

    // Update Beta distribution
    if (reward > 1.0) {
      arm.alpha += reward;
      console.log(
        `✅ GEMINI PERSONALITY: "${arm.name}" REWARD +${reward.toFixed(2)} (Q:${metrics.qualityScore} V:${metrics.viralScore} E:${metrics.engagementScore})`,
      );
    } else {
      arm.beta += 1.0;
      console.log(
        `❌ GEMINI PERSONALITY: "${arm.name}" POOR REWARD (Q:${metrics.qualityScore} V:${metrics.viralScore} E:${metrics.engagementScore})`,
      );
    }

    // Update rolling averages
    const n = Math.max(1, arm.totalUses + 1);
    arm.avgQualityScore = (arm.avgQualityScore * arm.totalUses + metrics.qualityScore) / n;
    arm.avgViralScore = (arm.avgViralScore * arm.totalUses + metrics.viralScore) / n;
    arm.avgEngagement = (arm.avgEngagement * arm.totalUses + metrics.engagementScore) / n;
    arm.totalUses++;

    if (videoId && !arm.videoIds.includes(videoId)) {
      arm.videoIds.push(videoId);
      if (arm.videoIds.length > 20) {
        arm.videoIds = arm.videoIds.slice(-20);
      }
    }

    this.saveState();
    this.maybeUpdateDefault();
  }

  /**
   * Update default personality if a new one is performing better
   */
  private maybeUpdateDefault(): void {
    const armsWithEnoughPulls = Object.values(this.state.arms).filter(
      (arm) => arm.pulls >= this.state.minPullsBeforeSwitch,
    );

    if (armsWithEnoughPulls.length === 0) return;

    armsWithEnoughPulls.sort((a, b) => {
      const rateA = a.alpha / (a.alpha + a.beta);
      const rateB = b.alpha / (b.alpha + b.beta);
      return rateB - rateA;
    });

    const best = armsWithEnoughPulls[0];
    const bestRate = best.alpha / (best.alpha + best.beta);

    const currentDefault = this.state.arms[this.state.currentDefault];
    const currentRate = currentDefault.alpha / (currentDefault.alpha + currentDefault.beta);

    if (best.id !== this.state.currentDefault && bestRate > currentRate * 1.2) {
      console.log(`🎭 GEMINI BANDIT: Switching default from "${currentDefault.name}" to "${best.name}"`);
      console.log(`   Old rate: ${(currentRate * 100).toFixed(1)}%, New rate: ${(bestRate * 100).toFixed(1)}%`);
      this.state.currentDefault = best.id;
      this.saveState();
    }
  }

  /**
   * Get current status of all personalities
   */
  getStatus(): {
    currentDefault: string;
    gamma: number;
    arms: Array<{
      id: string;
      name: string;
      pulls: number;
      successRate: number;
      avgQuality: number;
      avgViral: number;
      avgEngagement: number;
      isWinning: boolean;
    }>;
    totalPulls: number;
  } {
    const arms = Object.values(this.state.arms)
      .map((arm) => ({
        id: arm.id,
        name: arm.name,
        pulls: arm.pulls,
        successRate: arm.alpha / (arm.alpha + arm.beta),
        avgQuality: arm.avgQualityScore,
        avgViral: arm.avgViralScore,
        avgEngagement: arm.avgEngagement,
        isWinning: arm.id === this.state.currentDefault,
      }))
      .sort((a, b) => b.successRate - a.successRate);

    return {
      currentDefault: this.state.currentDefault,
      gamma: this.state.gamma,
      arms,
      totalPulls: arms.reduce((sum, a) => sum + a.pulls, 0),
    };
  }

  /**
   * Get personality details by ID
   */
  getPersonality(personalityId: string): GeminiPersonalityArm | null {
    return this.state.arms[personalityId] || null;
  }

  /**
   * Get current default personality
   */
  getCurrentDefault(): {
    personalityId: string;
    personalityName: string;
    systemPrompt: string;
  } {
    const arm = this.state.arms[this.state.currentDefault];
    return {
      personalityId: arm.id,
      personalityName: arm.name,
      systemPrompt: arm.systemPrompt,
    };
  }
}

export const geminiPersonalityBandit = new GeminiPersonalityBanditService();
