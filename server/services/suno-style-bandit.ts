/**
 * SUNO STYLE BANDIT SERVICE
 *
 * Thompson Sampling for Suno music style experimentation.
 * Automatically finds which music styles perform best on YouTube.
 *
 * Features:
 * - Multi-objective reward: R = w_ctr × CTR + w_vtr × VTR + w_sub × Subscribed
 * - Gamma decay (γ = 0.95) for trend adaptation
 * - Cold start exploration for new arms
 *
 * Tracks:
 * - Genre variations (hip-hop, trap, orchestral, etc.)
 * - BPM ranges (slow, medium, fast)
 * - Vocal styles (aggressive, smooth, storytelling)
 * - Instrumentation combinations
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// MULTI-OBJECTIVE REWARD WEIGHTS
// ============================================================================
const REWARD_WEIGHTS = {
  w_ctr: 1.0, // Click is worth 1 point
  w_vtr: 2.0, // High retention is worth more (multiply by retention rate 0-1)
  w_sub: 10.0, // Subscriber is the ultimate prize (10 points)
};

// Default gamma decay factor for trend adaptation
const DEFAULT_GAMMA = 0.95;

// ============================================================================
// SUNO STYLE ARMS - Different music style configurations to test
// ============================================================================

export interface SunoStyleArm {
  id: string;
  name: string;
  description: string;

  // Suno prompt components
  genre: string;
  bpm: string;
  vocals: string;
  instruments: string;
  mood: string;

  // Full style string to pass to Suno
  fullStylePrompt: string;

  // Thompson Sampling state
  alpha: number; // Successes + 1
  beta: number; // Failures + 1
  pulls: number; // Times selected

  // Performance tracking
  avgViews: number;
  avgRetention: number;
  avgCTR: number;
  totalSubscribers: number;
  videoIds: string[];

  lastUsed: string | null;
  createdAt: string;
}

// Multi-objective reward metrics interface
export interface RewardMetrics {
  clicked: boolean; // Did user click? (CTR component)
  vtr: number; // View-through rate 0-1 (retention)
  subscribed: boolean; // Did they subscribe?
}

// Default style arms to start experimenting with
const DEFAULT_STYLE_ARMS: Omit<
  SunoStyleArm,
  | 'alpha'
  | 'beta'
  | 'pulls'
  | 'avgViews'
  | 'avgRetention'
  | 'avgCTR'
  | 'totalSubscribers'
  | 'videoIds'
  | 'lastUsed'
  | 'createdAt'
>[] = [
  {
    id: 'epic_orchestral_trap',
    name: 'Epic Orchestral Trap',
    description: 'Cinematic orchestral with trap 808s - our current default',
    genre: 'cinematic orchestral trap, epic rap battle',
    bpm: '140 BPM half-time feel',
    vocals: 'aggressive male vocal delivery, powerful storytelling',
    instruments: 'thunderous 808s, taiko war drums, dark orchestral strings, brass stabs, choir harmonies',
    mood: 'blockbuster film score meets modern hip-hop, epic battle energy',
    fullStylePrompt:
      'cinematic orchestral trap, epic rap battle, 140 BPM half-time, thunderous 808s layered with taiko war drums, dark orchestral strings, brass stabs, choir harmonies, aggressive male vocal, powerful storytelling, hook-first structure',
  },
  {
    id: 'boom_bap_classic',
    name: 'Boom Bap Classic',
    description: '90s hip-hop golden era style with jazzy samples',
    genre: 'boom bap hip-hop, classic 90s rap',
    bpm: '90 BPM, laid-back groove',
    vocals: 'confident rhythmic delivery, storytelling flow',
    instruments: 'crisp drum breaks, jazzy piano loops, vinyl crackle, warm bass, subtle scratches',
    mood: 'golden era hip-hop, confident swagger, street poetry',
    fullStylePrompt:
      'boom bap hip-hop, classic 90s rap, 90 BPM laid-back groove, crisp drum breaks, jazzy piano loops, vinyl crackle, warm bass, confident rhythmic delivery, storytelling flow, hook-first structure',
  },
  {
    id: 'dark_trap_minimal',
    name: 'Dark Trap Minimal',
    description: 'Modern dark trap with minimal production',
    genre: 'dark trap, minimal beat',
    bpm: '145 BPM, aggressive tempo',
    vocals: 'menacing delivery, raw energy',
    instruments: 'heavy distorted 808s, hi-hat rolls, dark synth pads, eerie bells, bass slides',
    mood: 'ominous, threatening, intense',
    fullStylePrompt:
      'dark trap, minimal beat, 145 BPM aggressive, heavy distorted 808s, hi-hat rolls, dark synth pads, eerie bells, menacing vocal delivery, raw energy, hook-first structure',
  },
  {
    id: 'orchestral_epic_slow',
    name: 'Orchestral Epic Slow',
    description: 'Slower dramatic orchestral for emotional moments',
    genre: 'epic orchestral, dramatic film score',
    bpm: '85 BPM, slow and powerful',
    vocals: 'emotional powerful delivery, dramatic pauses',
    instruments: 'full orchestra, soaring strings, timpani, choir swells, french horns, piano',
    mood: 'triumphant, emotional, legendary',
    fullStylePrompt:
      'epic orchestral, dramatic film score, 85 BPM slow and powerful, full orchestra, soaring strings, timpani, choir swells, french horns, emotional vocal delivery, dramatic pauses, hook-first structure',
  },
  {
    id: 'melodic_trap',
    name: 'Melodic Trap',
    description: 'Melodic trap with autotune-style hooks',
    genre: 'melodic trap, melodic rap',
    bpm: '130 BPM, bouncy feel',
    vocals: 'melodic flow, sung-rap hybrid, catchy hooks',
    instruments: 'melodic synth leads, bouncy 808s, atmospheric pads, guitar loops, bell melodies',
    mood: 'catchy, vibey, modern',
    fullStylePrompt:
      'melodic trap, melodic rap, 130 BPM bouncy, melodic synth leads, bouncy 808s, atmospheric pads, guitar loops, melodic flow, sung-rap hybrid, catchy hooks, hook-first structure',
  },
  {
    id: 'aggressive_drill',
    name: 'UK Drill Aggressive',
    description: 'UK drill style with sliding 808s',
    genre: 'UK drill, aggressive rap',
    bpm: '140 BPM, drill bounce',
    vocals: 'aggressive rapid delivery, intense energy',
    instruments: 'sliding 808s, drill hi-hats, dark piano, eerie strings, aggressive bass',
    mood: 'intense, raw, street energy',
    fullStylePrompt:
      'UK drill, aggressive rap, 140 BPM drill bounce, sliding 808s, drill hi-hats, dark piano, eerie strings, aggressive rapid delivery, intense energy, hook-first structure',
  },
  {
    id: 'cinematic_choir',
    name: 'Cinematic Choir Heavy',
    description: 'Heavy choir focus for religious/mythological content',
    genre: 'cinematic choir, epic sacred music',
    bpm: '100 BPM, majestic tempo',
    vocals: 'powerful operatic, choir backing',
    instruments: 'massive choir, pipe organ, war drums, brass fanfare, strings, timpani',
    mood: 'divine, majestic, overwhelming',
    fullStylePrompt:
      'cinematic choir, epic sacred music, 100 BPM majestic, massive choir, pipe organ, war drums, brass fanfare, strings, timpani, powerful operatic vocals, choir backing, hook-first structure',
  },
  {
    id: 'lo_fi_storytelling',
    name: 'Lo-Fi Storytelling',
    description: 'Chill lo-fi for more contemplative historical pieces',
    genre: 'lo-fi hip-hop, chill beats',
    bpm: '75 BPM, relaxed groove',
    vocals: 'smooth conversational delivery, intimate storytelling',
    instruments: 'dusty vinyl samples, mellow keys, soft drums, warm bass, ambient textures',
    mood: 'reflective, cozy, intimate',
    fullStylePrompt:
      'lo-fi hip-hop, chill beats, 75 BPM relaxed, dusty vinyl samples, mellow keys, soft drums, warm bass, smooth conversational delivery, intimate storytelling, hook-first structure',
  },
];

// Sonic identity keywords - when users ask about the music, it's a strong signal
const SONIC_KEYWORDS = [
  'song',
  'music',
  'beat',
  'track',
  'name of',
  'what is this',
  'fire beat',
  'instrumental',
  'producer',
  'who made',
];
const SONIC_BOOST = 2.0; // +2.0 alpha boost for sonic interest signals

interface ContentSprintLock {
  styleId: string;
  styleName: string;
  remainingVideos: number;
  lockedAt: string;
  reason: string;
}

interface SunoStyleBanditState {
  arms: Record<string, SunoStyleArm>;
  currentDefault: string;
  minPullsBeforeSwitch: number;
  gamma: number; // Decay factor for trend adaptation
  contentSprintLock: ContentSprintLock | null; // Lock winning style for N videos
  successThreshold: {
    minViews: number;
    minCTR: number;
    minRetention: number;
  };
  lastUpdated: string;
  lastDecayApplied: string | null;
}

class SunoStyleBanditService {
  private dataPath: string;
  private state: SunoStyleBanditState;

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'suno_style_bandit.json');
    this.state = this.loadState();
  }

  private loadState(): SunoStyleBanditState {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });

      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        // Ensure gamma exists for backward compatibility
        if (!data.gamma) {
          data.gamma = DEFAULT_GAMMA;
        }
        // Ensure totalSubscribers exists for all arms
        for (const arm of Object.values(data.arms) as SunoStyleArm[]) {
          if (arm.totalSubscribers === undefined) {
            arm.totalSubscribers = 0;
          }
        }
        console.log(`🎵 Suno Style Bandit: Loaded ${Object.keys(data.arms || {}).length} style arms (γ=${data.gamma})`);
        return data;
      }
    } catch (error) {
      console.warn('⚠️ Could not load Suno style bandit state');
    }

    // Initialize with default arms
    return this.initializeDefaultState();
  }

  private initializeDefaultState(): SunoStyleBanditState {
    const arms: Record<string, SunoStyleArm> = {};

    for (const arm of DEFAULT_STYLE_ARMS) {
      arms[arm.id] = {
        ...arm,
        alpha: 1, // Cold start: alpha=1, beta=1 for high uncertainty
        beta: 1,
        pulls: 0,
        avgViews: 0,
        avgRetention: 0,
        avgCTR: 0,
        totalSubscribers: 0,
        videoIds: [],
        lastUsed: null,
        createdAt: new Date().toISOString(),
      };
    }

    const state: SunoStyleBanditState = {
      arms,
      currentDefault: 'epic_orchestral_trap',
      minPullsBeforeSwitch: 5,
      gamma: DEFAULT_GAMMA,
      contentSprintLock: null,
      successThreshold: {
        minViews: 500,
        minCTR: 8,
        minRetention: 40,
      },
      lastUpdated: new Date().toISOString(),
      lastDecayApplied: null,
    };

    this.saveState(state);
    console.log(`🎵 Suno Style Bandit: Initialized with ${DEFAULT_STYLE_ARMS.length} style arms (γ=${DEFAULT_GAMMA})`);

    return state;
  }

  private saveState(state?: SunoStyleBanditState): void {
    try {
      const toSave = state || this.state;
      toSave.lastUpdated = new Date().toISOString();
      writeFileSync(this.dataPath, JSON.stringify(toSave, null, 2));
    } catch (error) {
      console.warn('⚠️ Could not save Suno style bandit state');
    }
  }

  /**
   * Apply gamma decay to all arms
   * This ensures old trends "fade out" and new arms get a fair chance
   */
  private applyGammaDecay(): void {
    const gamma = this.state.gamma;

    for (const arm of Object.values(this.state.arms)) {
      // Apply decay but maintain minimum values to prevent collapse
      arm.alpha = Math.max(1, arm.alpha * gamma);
      arm.beta = Math.max(1, arm.beta * gamma);
    }

    this.state.lastDecayApplied = new Date().toISOString();
    console.log(`🎰 [Bandit] Applied γ=${gamma} decay to all arms`);
  }

  /**
   * Calculate multi-objective reward
   * R = w_ctr × CTR + w_vtr × VTR + w_sub × Subscribed
   */
  private calculateReward(metrics: RewardMetrics): number {
    const ctrComponent = REWARD_WEIGHTS.w_ctr * (metrics.clicked ? 1 : 0);
    const vtrComponent = REWARD_WEIGHTS.w_vtr * metrics.vtr;
    const subComponent = REWARD_WEIGHTS.w_sub * (metrics.subscribed ? 1 : 0);

    return ctrComponent + vtrComponent + subComponent;
  }

  /**
   * Sample from Beta distribution using Box-Muller
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
   * Select a Suno style using Thompson Sampling
   * Returns the style with highest sampled probability of success
   */
  selectStyle(): {
    styleId: string;
    styleName: string;
    fullStylePrompt: string;
    confidence: number;
    isExploration: boolean;
  } {
    const samples: Array<{
      id: string;
      sample: number;
      mean: number;
      arm: SunoStyleArm;
    }> = [];

    // Sample from each arm's Beta distribution
    for (const [id, arm] of Object.entries(this.state.arms)) {
      const sample = this.sampleBeta(arm.alpha, arm.beta);
      const mean = arm.alpha / (arm.alpha + arm.beta);
      samples.push({ id, sample, mean, arm });
    }

    // Select arm with highest sample
    samples.sort((a, b) => b.sample - a.sample);
    const selected = samples[0];

    // Update pull count
    selected.arm.pulls++;
    selected.arm.lastUsed = new Date().toISOString();
    this.state.lastUpdated = new Date().toISOString();
    this.saveState();

    // Calculate confidence (more pulls = higher confidence)
    const confidence = Math.min(0.95, selected.arm.pulls / (selected.arm.pulls + 10));

    // Check if this is exploration (not the current best arm)
    const bestMeanArm = Object.values(this.state.arms).sort(
      (a, b) => b.alpha / (b.alpha + b.beta) - a.alpha / (a.alpha + a.beta),
    )[0];
    const isExploration = selected.id !== bestMeanArm.id;

    console.log(`🎵 SUNO BANDIT: Selected "${selected.arm.name}"`);
    console.log(`   Sample: ${selected.sample.toFixed(3)}, Mean: ${selected.mean.toFixed(3)}`);
    console.log(`   Pulls: ${selected.arm.pulls}, ${isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'}`);

    return {
      styleId: selected.id,
      styleName: selected.arm.name,
      fullStylePrompt: selected.arm.fullStylePrompt,
      confidence,
      isExploration,
    };
  }

  /**
   * Update reward using multi-objective function
   * R = w_ctr × CTR + w_vtr × VTR + w_sub × Subscribed
   *
   * Also applies gamma decay to all arms for trend adaptation
   */
  updateReward(styleId: string, metrics: RewardMetrics): void {
    const arm = this.state.arms[styleId];
    if (!arm) {
      console.warn(`⚠️ Unknown style ID: ${styleId}`);
      return;
    }

    // Apply gamma decay to all arms first
    this.applyGammaDecay();

    // Calculate multi-objective reward
    const reward = this.calculateReward(metrics);

    // Update the chosen arm based on reward
    if (reward > 0) {
      // Positive reward - increment alpha by reward amount
      arm.alpha += reward;
      console.log(
        `✅ SUNO BANDIT: "${arm.name}" REWARD +${reward.toFixed(2)} (click: ${metrics.clicked}, VTR: ${(metrics.vtr * 100).toFixed(1)}%, sub: ${metrics.subscribed})`,
      );
    } else {
      // Zero reward (no click, no retention, no sub) - increment failure
      arm.beta += 1.0;
      console.log(
        `❌ SUNO BANDIT: "${arm.name}" NO REWARD (click: ${metrics.clicked}, VTR: ${(metrics.vtr * 100).toFixed(1)}%, sub: ${metrics.subscribed})`,
      );
    }

    // Track subscriber count
    if (metrics.subscribed) {
      arm.totalSubscribers++;
    }

    // Update rolling averages
    const n = Math.max(1, arm.pulls);
    arm.avgCTR = (arm.avgCTR * (n - 1) + (metrics.clicked ? 100 : 0)) / n;
    arm.avgRetention = (arm.avgRetention * (n - 1) + metrics.vtr * 100) / n;

    this.saveState();

    // Check if we should update the default
    this.maybeUpdateDefault();
  }

  /**
   * Record outcome for a video that used a specific style (legacy method - backward compatible)
   * Now uses multi-objective reward internally
   */
  recordOutcome(
    styleId: string,
    videoId: string,
    metrics: {
      views: number;
      ctr: number;
      avgViewDuration: number;
      subscribed?: boolean;
    },
  ): void {
    const arm = this.state.arms[styleId];
    if (!arm) {
      console.warn(`⚠️ Unknown style ID: ${styleId}`);
      return;
    }

    // Apply gamma decay to all arms
    this.applyGammaDecay();

    // Convert legacy metrics to multi-objective format
    // CTR > 5% counts as a click, avgViewDuration is retention percentage
    const clicked = metrics.ctr > 5;
    const vtr = Math.min(1, metrics.avgViewDuration / 100); // Convert percentage to 0-1
    const subscribed = metrics.subscribed || false;

    // Calculate multi-objective reward
    const reward = this.calculateReward({ clicked, vtr, subscribed });

    // Update Beta distribution based on reward
    if (reward > 0) {
      arm.alpha += reward;
      console.log(
        `✅ SUNO BANDIT: "${arm.name}" REWARD +${reward.toFixed(2)} (views: ${metrics.views}, CTR: ${metrics.ctr}%, VTR: ${metrics.avgViewDuration}%)`,
      );
    } else {
      arm.beta += 1.0;
      console.log(`❌ SUNO BANDIT: "${arm.name}" NO REWARD (views: ${metrics.views}, CTR: ${metrics.ctr}%)`);
    }

    // Track video and update rolling averages
    if (!arm.videoIds.includes(videoId)) {
      arm.videoIds.push(videoId);

      // Keep only last 20 videos for rolling average
      if (arm.videoIds.length > 20) {
        arm.videoIds = arm.videoIds.slice(-20);
      }
    }

    // Track subscriber
    if (subscribed) {
      arm.totalSubscribers++;
    }

    // Update rolling averages
    const n = arm.videoIds.length;
    arm.avgViews = (arm.avgViews * (n - 1) + metrics.views) / n;
    arm.avgRetention = (arm.avgRetention * (n - 1) + metrics.avgViewDuration) / n;
    arm.avgCTR = (arm.avgCTR * (n - 1) + metrics.ctr) / n;

    this.saveState();

    // Check if we should update the default
    this.maybeUpdateDefault();
  }

  /**
   * Check if any arm has proven significantly better and should become the default
   */
  private maybeUpdateDefault(): void {
    // Get arm with highest mean success rate that has enough pulls
    const armsWithEnoughPulls = Object.values(this.state.arms).filter(
      (arm) => arm.pulls >= this.state.minPullsBeforeSwitch,
    );

    if (armsWithEnoughPulls.length === 0) return;

    // Sort by success rate (alpha / (alpha + beta))
    armsWithEnoughPulls.sort((a, b) => {
      const rateA = a.alpha / (a.alpha + a.beta);
      const rateB = b.alpha / (b.alpha + b.beta);
      return rateB - rateA;
    });

    const best = armsWithEnoughPulls[0];
    const bestRate = best.alpha / (best.alpha + best.beta);

    // Get current default rate
    const currentDefault = this.state.arms[this.state.currentDefault];
    const currentRate = currentDefault.alpha / (currentDefault.alpha + currentDefault.beta);

    // Switch if new arm is 20%+ better
    if (best.id !== this.state.currentDefault && bestRate > currentRate * 1.2) {
      console.log(`🎵 SUNO BANDIT: Switching default from "${currentDefault.name}" to "${best.name}"`);
      console.log(`   Old rate: ${(currentRate * 100).toFixed(1)}%, New rate: ${(bestRate * 100).toFixed(1)}%`);
      this.state.currentDefault = best.id;
      this.saveState();
    }
  }

  /**
   * Add a new style arm for experimentation
   * Cold start: alpha=1, beta=1 for high uncertainty (encourages exploration)
   */
  addStyleArm(
    arm: Omit<
      SunoStyleArm,
      | 'alpha'
      | 'beta'
      | 'pulls'
      | 'avgViews'
      | 'avgRetention'
      | 'avgCTR'
      | 'totalSubscribers'
      | 'videoIds'
      | 'lastUsed'
      | 'createdAt'
    >,
  ): void {
    if (this.state.arms[arm.id]) {
      console.warn(`⚠️ Style arm "${arm.id}" already exists`);
      return;
    }

    this.state.arms[arm.id] = {
      ...arm,
      alpha: 1, // Cold start for high uncertainty
      beta: 1,
      pulls: 0,
      avgViews: 0,
      avgRetention: 0,
      avgCTR: 0,
      totalSubscribers: 0,
      videoIds: [],
      lastUsed: null,
      createdAt: new Date().toISOString(),
    };

    this.saveState();
    console.log(`🎵 SUNO BANDIT: Added new style arm "${arm.name}" (cold start: α=1, β=1)`);
  }

  /**
   * Get current arm scores with detailed metrics
   */
  getArmScores(): Array<{
    armId: string;
    name: string;
    expectedReward: number;
    pulls: number;
    avgVTR: number;
    avgCTR: number;
    totalSubscribers: number;
    alpha: number;
    beta: number;
  }> {
    return Object.values(this.state.arms)
      .map((arm) => ({
        armId: arm.id,
        name: arm.name,
        expectedReward: arm.alpha / (arm.alpha + arm.beta),
        pulls: arm.pulls,
        avgVTR: arm.avgRetention,
        avgCTR: arm.avgCTR,
        totalSubscribers: arm.totalSubscribers,
        alpha: arm.alpha,
        beta: arm.beta,
      }))
      .sort((a, b) => b.expectedReward - a.expectedReward);
  }

  /**
   * Get status summary of all arms
   */
  getStatus(): {
    currentDefault: string;
    gamma: number;
    arms: Array<{
      id: string;
      name: string;
      pulls: number;
      successRate: number;
      avgViews: number;
      avgCTR: number;
      avgVTR: number;
      totalSubscribers: number;
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
        avgViews: arm.avgViews,
        avgCTR: arm.avgCTR,
        avgVTR: arm.avgRetention,
        totalSubscribers: arm.totalSubscribers,
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
   * Get the full style prompt for a specific style ID
   */
  getStylePrompt(styleId: string): string | null {
    return this.state.arms[styleId]?.fullStylePrompt || null;
  }

  /**
   * Get the current default style (for non-experimental videos)
   */
  getCurrentDefault(): {
    styleId: string;
    styleName: string;
    fullStylePrompt: string;
  } {
    const arm = this.state.arms[this.state.currentDefault];
    return {
      styleId: arm.id,
      styleName: arm.name,
      fullStylePrompt: arm.fullStylePrompt,
    };
  }

  /**
   * Set gamma decay factor
   */
  setGamma(gamma: number): void {
    if (gamma <= 0 || gamma > 1) {
      console.warn('⚠️ Gamma must be between 0 and 1');
      return;
    }
    this.state.gamma = gamma;
    this.saveState();
    console.log(`🎵 SUNO BANDIT: Set gamma decay factor to ${gamma}`);
  }

  /**
   * Get current gamma value
   */
  getGamma(): number {
    return this.state.gamma;
  }

  // ===========================================================================
  // SONIC IDENTITY REWARD SYSTEM
  // When users ask about the music, it's a strong engagement signal
  // ===========================================================================

  /**
   * Process comments to detect sonic interest and boost audio style
   * Returns the boost amount applied (0 if no sonic keywords found)
   */
  processSonicEngagement(
    styleId: string,
    comments: string[],
  ): {
    boostApplied: number;
    matchedKeywords: string[];
    totalMatches: number;
  } {
    const arm = this.state.arms[styleId];
    if (!arm) {
      console.warn(`⚠️ SONIC: Unknown style ID: ${styleId}`);
      return { boostApplied: 0, matchedKeywords: [], totalMatches: 0 };
    }

    const matchedKeywords: string[] = [];
    let totalMatches = 0;

    for (const comment of comments) {
      const lowerComment = comment.toLowerCase();
      for (const keyword of SONIC_KEYWORDS) {
        if (lowerComment.includes(keyword)) {
          matchedKeywords.push(keyword);
          totalMatches++;
        }
      }
    }

    if (totalMatches === 0) {
      return { boostApplied: 0, matchedKeywords: [], totalMatches: 0 };
    }

    // Apply sonic boost - cap at 3x boost for massive engagement
    const boostMultiplier = Math.min(3, totalMatches);
    const boostApplied = SONIC_BOOST * boostMultiplier;

    arm.alpha += boostApplied;
    this.saveState();

    console.log(`🎵 SONIC BOOST: "${arm.name}" +${boostApplied.toFixed(1)} alpha`);
    console.log(`   Keywords matched: ${[...new Set(matchedKeywords)].join(', ')}`);
    console.log(`   Total matches: ${totalMatches}, New α: ${arm.alpha.toFixed(2)}`);

    // Check if we should trigger a content sprint lock
    this.maybeStartContentSprint(styleId, 'sonic_engagement');

    return {
      boostApplied,
      matchedKeywords: [...new Set(matchedKeywords)],
      totalMatches,
    };
  }

  // ===========================================================================
  // CONTENT SPRINT LOCK
  // Lock a winning audio style for N consecutive videos
  // ===========================================================================

  /**
   * Check if we should start a content sprint for a style
   */
  private maybeStartContentSprint(styleId: string, reason: string): void {
    // Don't start if already locked
    if (this.state.contentSprintLock) return;

    const arm = this.state.arms[styleId];
    if (!arm) return;

    // Calculate success rate
    const successRate = arm.alpha / (arm.alpha + arm.beta);

    // Start sprint if success rate > 70% and we have enough pulls
    if (successRate > 0.7 && arm.pulls >= 3) {
      this.state.contentSprintLock = {
        styleId: arm.id,
        styleName: arm.name,
        remainingVideos: 5, // Lock for 5 videos
        lockedAt: new Date().toISOString(),
        reason,
      };
      this.saveState();

      console.log(`🔒 CONTENT SPRINT: Locked "${arm.name}" for 5 videos`);
      console.log(`   Reason: ${reason}, Success rate: ${(successRate * 100).toFixed(1)}%`);
    }
  }

  /**
   * Get the content sprint lock if active
   */
  getContentSprintLock(): ContentSprintLock | null {
    return this.state.contentSprintLock;
  }

  /**
   * Force start a content sprint for a specific style
   */
  startContentSprint(styleId: string, videoCount: number = 5): boolean {
    const arm = this.state.arms[styleId];
    if (!arm) {
      console.warn(`⚠️ Cannot start sprint: Unknown style ID: ${styleId}`);
      return false;
    }

    this.state.contentSprintLock = {
      styleId: arm.id,
      styleName: arm.name,
      remainingVideos: videoCount,
      lockedAt: new Date().toISOString(),
      reason: 'manual',
    };
    this.saveState();

    console.log(`🔒 CONTENT SPRINT: Manually locked "${arm.name}" for ${videoCount} videos`);
    return true;
  }

  /**
   * Use a sprint video slot (call this when a video is created during a sprint)
   * Returns the locked style if still active, null if sprint ended
   */
  useSprintSlot(): {
    styleId: string;
    styleName: string;
    fullStylePrompt: string;
    remainingAfter: number;
  } | null {
    if (!this.state.contentSprintLock) return null;

    const lock = this.state.contentSprintLock;
    const arm = this.state.arms[lock.styleId];
    if (!arm) {
      this.state.contentSprintLock = null;
      this.saveState();
      return null;
    }

    lock.remainingVideos--;

    if (lock.remainingVideos <= 0) {
      console.log(`🔓 CONTENT SPRINT: Completed sprint for "${arm.name}"`);
      this.state.contentSprintLock = null;
    } else {
      console.log(`🔒 CONTENT SPRINT: ${lock.remainingVideos} videos remaining for "${arm.name}"`);
    }

    this.saveState();

    return {
      styleId: arm.id,
      styleName: arm.name,
      fullStylePrompt: arm.fullStylePrompt,
      remainingAfter: Math.max(0, lock.remainingVideos),
    };
  }

  /**
   * Cancel an active content sprint
   */
  cancelContentSprint(): boolean {
    if (!this.state.contentSprintLock) return false;

    const styleName = this.state.contentSprintLock.styleName;
    this.state.contentSprintLock = null;
    this.saveState();

    console.log(`🔓 CONTENT SPRINT: Cancelled sprint for "${styleName}"`);
    return true;
  }

  /**
   * Select style with sprint lock awareness
   * If sprint is active, returns locked style instead of sampling
   */
  selectStyleWithSprint(): {
    styleId: string;
    styleName: string;
    fullStylePrompt: string;
    confidence: number;
    isExploration: boolean;
    isSprintLocked: boolean;
    sprintRemaining: number;
  } {
    // Check for active sprint first
    if (this.state.contentSprintLock) {
      const sprintResult = this.useSprintSlot();
      if (sprintResult) {
        return {
          styleId: sprintResult.styleId,
          styleName: sprintResult.styleName,
          fullStylePrompt: sprintResult.fullStylePrompt,
          confidence: 1.0, // Full confidence during sprint
          isExploration: false,
          isSprintLocked: true,
          sprintRemaining: sprintResult.remainingAfter,
        };
      }
    }

    // No sprint - use normal Thompson Sampling
    const selected = this.selectStyle();
    return {
      ...selected,
      isSprintLocked: false,
      sprintRemaining: 0,
    };
  }
}

export const sunoStyleBandit = new SunoStyleBanditService();
