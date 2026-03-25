/**
 * INTELLIGENT OPTIMIZATION SERVICE
 *
 * Implements data-efficient optimization algorithms:
 * 1. Thompson Sampling - Bayesian bandit for style/variant selection
 * 2. Survival Analysis - Track video lifespan patterns (spike vs long-tail)
 * 3. Anomaly Detection - Flag videos performing 2x+ average in first 6 hours
 * 4. Content Decay Tracking - When do videos stop gaining views?
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { desc } from 'drizzle-orm';
import { detailedVideoMetrics } from '@shared/schema';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

// ============================================================================
// THOMPSON SAMPLING - Bayesian Multi-Armed Bandit
// ============================================================================

interface BanditArm {
  id: string;
  name: string;
  alpha: number; // Successes (wins) + 1
  beta: number; // Failures (losses) + 1
  pulls: number; // Total selections
  lastSampled: Date | null;
}

interface ThompsonSamplingState {
  arms: Map<string, BanditArm>;
  lastUpdated: Date;
}

/**
 * Sample from Beta distribution using Box-Muller approximation
 * Beta(α, β) represents our belief about the true success rate
 */
function sampleBeta(alpha: number, beta: number): number {
  // Use the gamma distribution method for Beta sampling
  // Beta(α, β) = Gamma(α, 1) / (Gamma(α, 1) + Gamma(β, 1))
  const gammaAlpha = sampleGamma(alpha);
  const gammaBeta = sampleGamma(beta);
  return gammaAlpha / (gammaAlpha + gammaBeta);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang's method
 */
function sampleGamma(shape: number): number {
  if (shape < 1) {
    // For shape < 1, use: Gamma(a) = Gamma(a+1) * U^(1/a)
    return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  while (true) {
    let x: number, v: number;
    do {
      // Generate standard normal using Box-Muller
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

// ============================================================================
// STYLE SELECTION BANDIT
// ============================================================================

const STYLE_ARMS: string[] = [
  'classic_documentary',
  'epic_cinematic',
  'intimate_portrait',
  'raw_authentic',
  'modern_stylized',
];

const THUMBNAIL_ARMS: string[] = ['vs_battle', 'dramatic_portrait', 'action_scene', 'text_heavy', 'minimal_clean'];

class IntelligentOptimizationService {
  private styleBandit: ThompsonSamplingState;
  private thumbnailBandit: ThompsonSamplingState;

  // Survival analysis state
  private videoLifespans: Map<
    string,
    {
      videoId: string;
      uploadDate: Date;
      hourlyViews: number[];
      peakHour: number;
      decayStartHour: number | null;
      isLongTail: boolean;
    }
  > = new Map();

  // Anomaly detection thresholds
  private baselineMetrics: {
    avgFirst6HourViews: number;
    stdFirst6HourViews: number;
    sampleSize: number;
  } = { avgFirst6HourViews: 0, stdFirst6HourViews: 0, sampleSize: 0 };

  constructor() {
    // Initialize bandits with uniform priors (Beta(1,1) = uniform)
    this.styleBandit = this.initializeBandit(STYLE_ARMS);
    this.thumbnailBandit = this.initializeBandit(THUMBNAIL_ARMS);

    console.log('🧠 Intelligent Optimization Service initialized');
    console.log(`   Style arms: ${STYLE_ARMS.length}, Thumbnail arms: ${THUMBNAIL_ARMS.length}`);
  }

  private initializeBandit(armIds: string[]): ThompsonSamplingState {
    const arms = new Map<string, BanditArm>();
    for (const id of armIds) {
      arms.set(id, {
        id,
        name: id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        alpha: 1, // Prior: 1 success
        beta: 1, // Prior: 1 failure
        pulls: 0,
        lastSampled: null,
      });
    }
    return { arms, lastUpdated: new Date() };
  }

  // ============================================================================
  // THOMPSON SAMPLING SELECTION
  // ============================================================================

  /**
   * Select a style using Thompson Sampling
   * Returns the style ID that has the highest sampled value
   */
  selectStyle(): { styleId: string; confidence: number; explorationRatio: number } {
    return this.thompsonSelect(this.styleBandit, 'style');
  }

  /**
   * Select a thumbnail variant using Thompson Sampling
   */
  selectThumbnailVariant(): { variantId: string; confidence: number; explorationRatio: number } {
    return this.thompsonSelect(this.thumbnailBandit, 'thumbnail');
  }

  private thompsonSelect(
    bandit: ThompsonSamplingState,
    type: string,
  ): { styleId: string; variantId: string; confidence: number; explorationRatio: number } {
    const samples: { id: string; sample: number; mean: number }[] = [];

    for (const [id, arm] of bandit.arms) {
      const sample = sampleBeta(arm.alpha, arm.beta);
      const mean = arm.alpha / (arm.alpha + arm.beta);
      samples.push({ id, sample, mean });
    }

    // Select arm with highest sampled value
    samples.sort((a, b) => b.sample - a.sample);
    const selected = samples[0];

    // Update pull count
    const arm = bandit.arms.get(selected.id)!;
    arm.pulls++;
    arm.lastSampled = new Date();
    bandit.lastUpdated = new Date();

    // Calculate metrics
    const totalPulls = Array.from(bandit.arms.values()).reduce((s, a) => s + a.pulls, 0);
    const uniformPulls = totalPulls / bandit.arms.size;
    const explorationRatio = arm.pulls > 0 ? uniformPulls / arm.pulls : 1;

    // Confidence based on sample size (more pulls = more confident)
    const confidence = Math.min(0.95, arm.pulls / (arm.pulls + 10));

    console.log(
      `🎰 Thompson Sampling (${type}): Selected "${selected.id}" (sample: ${selected.sample.toFixed(3)}, mean: ${selected.mean.toFixed(3)})`,
    );

    return {
      styleId: selected.id,
      variantId: selected.id,
      confidence,
      explorationRatio,
    };
  }

  /**
   * Update bandit with outcome (success = high engagement, failure = low engagement)
   * Requires 500+ views as baseline, then checks CTR > 8% or AVD > 50%
   */
  updateStyleOutcome(styleId: string, ctr: number, avgViewDuration: number, views: number): void {
    this.updateBanditOutcome(this.styleBandit, styleId, ctr, avgViewDuration, views, 'style');
  }

  updateThumbnailOutcome(variantId: string, ctr: number, avgViewDuration: number, views: number): void {
    this.updateBanditOutcome(this.thumbnailBandit, variantId, ctr, avgViewDuration, views, 'thumbnail');
  }

  private updateBanditOutcome(
    bandit: ThompsonSamplingState,
    armId: string,
    ctr: number,
    avgViewDuration: number,
    views: number,
    type: string,
  ): void {
    const arm = bandit.arms.get(armId);
    if (!arm) {
      console.warn(`Unknown ${type} arm: ${armId}`);
      return;
    }

    // Stricter success criteria - views >= 500 is required baseline
    // Then also need: CTR > 8% OR AVD > 50%
    // Under 500 views = automatic failure (weight negative)
    const meetsViewThreshold = views >= 500;
    const meetsEngagementThreshold = ctr > 8 || avgViewDuration > 50;
    const isSuccess = meetsViewThreshold && meetsEngagementThreshold;

    if (isSuccess) {
      arm.alpha += 1; // Add a success
    } else {
      arm.beta += 1; // Add a failure (includes all videos under 500 views)
    }

    const newMean = arm.alpha / (arm.alpha + arm.beta);
    const reason = !meetsViewThreshold ? `<500 views` : !meetsEngagementThreshold ? 'low engagement' : 'passed';
    console.log(
      `📈 ${type} bandit update: ${armId} ${isSuccess ? '✅ WIN' : '❌ LOSS'} [${reason}] (new mean: ${(newMean * 100).toFixed(1)}%)`,
    );

    bandit.lastUpdated = new Date();
  }

  // ============================================================================
  // SURVIVAL ANALYSIS - Video Lifespan Patterns
  // ============================================================================

  /**
   * Track a video's view trajectory over time
   * Call this periodically to build lifespan data
   */
  async trackVideoLifespan(videoId: string, currentViews: number, hoursOld: number): Promise<void> {
    let lifespan = this.videoLifespans.get(videoId);

    if (!lifespan) {
      lifespan = {
        videoId,
        uploadDate: new Date(Date.now() - hoursOld * 3600000),
        hourlyViews: [],
        peakHour: 0,
        decayStartHour: null,
        isLongTail: false,
      };
      this.videoLifespans.set(videoId, lifespan);
    }

    // Record view count at this hour
    const hourIndex = Math.floor(hoursOld);
    while (lifespan.hourlyViews.length <= hourIndex) {
      lifespan.hourlyViews.push(0);
    }
    lifespan.hourlyViews[hourIndex] = currentViews;

    // Analyze pattern if we have enough data (48+ hours)
    if (lifespan.hourlyViews.length >= 48) {
      this.analyzeLifespanPattern(lifespan);
    }
  }

  private analyzeLifespanPattern(lifespan: typeof this.videoLifespans extends Map<string, infer V> ? V : never): void {
    const views = lifespan.hourlyViews;

    // Find peak hour (highest view velocity)
    let maxVelocity = 0;
    let peakHour = 0;
    for (let i = 1; i < views.length; i++) {
      const velocity = views[i] - views[i - 1];
      if (velocity > maxVelocity) {
        maxVelocity = velocity;
        peakHour = i;
      }
    }
    lifespan.peakHour = peakHour;

    // Find decay start (when velocity drops below 10% of peak)
    const threshold = maxVelocity * 0.1;
    for (let i = peakHour + 1; i < views.length - 1; i++) {
      const velocity = views[i + 1] - views[i];
      if (velocity < threshold) {
        lifespan.decayStartHour = i;
        break;
      }
    }

    // Long tail = still gaining views after 72 hours
    if (views.length >= 72) {
      const last24hGain = views[views.length - 1] - views[views.length - 25];
      const first24hGain = views[24] - views[0];
      lifespan.isLongTail = last24hGain > first24hGain * 0.1; // Still 10%+ of initial velocity
    }
  }

  /**
   * Get survival analysis summary
   */
  getSurvivalStats(): {
    averagePeakHour: number;
    averageDecayStart: number;
    longTailPercentage: number;
    spikersCount: number;
    longTailCount: number;
  } {
    const lifespans = Array.from(this.videoLifespans.values());
    const analyzed = lifespans.filter((l) => l.hourlyViews.length >= 48);

    if (analyzed.length === 0) {
      return { averagePeakHour: 0, averageDecayStart: 0, longTailPercentage: 0, spikersCount: 0, longTailCount: 0 };
    }

    const avgPeak = analyzed.reduce((s, l) => s + l.peakHour, 0) / analyzed.length;
    const withDecay = analyzed.filter((l) => l.decayStartHour !== null);
    const avgDecay =
      withDecay.length > 0 ? withDecay.reduce((s, l) => s + (l.decayStartHour || 0), 0) / withDecay.length : 0;
    const longTailCount = analyzed.filter((l) => l.isLongTail).length;

    return {
      averagePeakHour: Math.round(avgPeak),
      averageDecayStart: Math.round(avgDecay),
      longTailPercentage: Math.round((longTailCount / analyzed.length) * 100),
      spikersCount: analyzed.length - longTailCount,
      longTailCount,
    };
  }

  // ============================================================================
  // ANOMALY DETECTION - Hot Content Signals
  // ============================================================================

  /**
   * Update baseline metrics from historical data
   * Focuses on early performance (first 6-24 hours) for anomaly detection
   */
  async updateBaseline(): Promise<void> {
    try {
      // Get videos with detailed metrics including publish date
      const videos = await db
        .select()
        .from(detailedVideoMetrics)
        .orderBy(desc(detailedVideoMetrics.createdAt))
        .limit(100);

      if (videos.length < 5) {
        console.log('📊 Anomaly detection: Not enough data for baseline');
        return;
      }

      // Calculate early performance: views relative to age
      // For each video, estimate views per hour in first 24 hours
      const now = Date.now();
      const earlyPerformanceRates: number[] = [];

      for (const video of videos) {
        if (!video.publishedAt || !video.viewCount) continue;

        const hoursOld = (now - new Date(video.publishedAt).getTime()) / 3600000;

        // Only include videos that are at least 6 hours old but less than 7 days
        // This gives us a fair comparison of early performance
        if (hoursOld >= 6 && hoursOld <= 168) {
          // Estimate views per hour rate (normalized to 24h window)
          const viewsPerHour = video.viewCount / Math.min(hoursOld, 24);
          earlyPerformanceRates.push(viewsPerHour);
        }
      }

      if (earlyPerformanceRates.length < 5) {
        console.log('📊 Anomaly detection: Not enough early performance data');
        return;
      }

      // Calculate mean and std of early performance rates
      const mean = earlyPerformanceRates.reduce((s, v) => s + v, 0) / earlyPerformanceRates.length;
      const variance =
        earlyPerformanceRates.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / earlyPerformanceRates.length;
      const std = Math.sqrt(variance);

      this.baselineMetrics = {
        avgFirst6HourViews: mean * 6, // Convert rate back to expected 6-hour views
        stdFirst6HourViews: std * 6,
        sampleSize: earlyPerformanceRates.length,
      };

      console.log(
        `📊 Baseline updated: avg 6h views=${(mean * 6).toFixed(0)}, std=${(std * 6).toFixed(0)}, n=${earlyPerformanceRates.length}`,
      );
    } catch (error) {
      console.error('Failed to update baseline:', error);
    }
  }

  /**
   * Check if a video is performing anomalously well
   * Returns true if views > 2x average for its age
   */
  detectAnomaly(
    videoId: string,
    currentViews: number,
    hoursOld: number,
  ): {
    isAnomaly: boolean;
    anomalyScore: number;
    message: string;
  } {
    if (this.baselineMetrics.sampleSize < 10) {
      return { isAnomaly: false, anomalyScore: 0, message: 'Insufficient baseline data' };
    }

    // Only check videos in their first 6-24 hours
    if (hoursOld < 1 || hoursOld > 24) {
      return { isAnomaly: false, anomalyScore: 0, message: 'Outside detection window' };
    }

    const expected = this.baselineMetrics.avgFirst6HourViews;
    const std = this.baselineMetrics.stdFirst6HourViews;

    // Z-score: how many standard deviations above mean?
    const zScore = (currentViews - expected) / (std || 1);

    // Anomaly if >2 standard deviations above mean (2x+ performance)
    const isAnomaly = zScore > 2;

    if (isAnomaly) {
      console.log(
        `🔥 ANOMALY DETECTED: Video ${videoId} has ${currentViews} views in ${hoursOld.toFixed(1)}h (${zScore.toFixed(1)}σ above mean)`,
      );
    }

    return {
      isAnomaly,
      anomalyScore: zScore,
      message: isAnomaly
        ? `🔥 Hot content! ${zScore.toFixed(1)}x above average`
        : `Normal performance (${zScore.toFixed(1)}σ)`,
    };
  }

  // ============================================================================
  // CONTENT DECAY TRACKING
  // ============================================================================

  /**
   * Analyze when videos typically stop gaining significant views
   */
  getDecayAnalysis(): {
    typicalDecayDay: number;
    halfLifeHours: number;
    recommendations: string[];
  } {
    const lifespans = Array.from(this.videoLifespans.values()).filter((l) => l.decayStartHour !== null);

    if (lifespans.length < 5) {
      return {
        typicalDecayDay: 3, // Default assumption
        halfLifeHours: 48,
        recommendations: ['Need more data to provide accurate decay analysis'],
      };
    }

    const avgDecayHour = lifespans.reduce((s, l) => s + (l.decayStartHour || 48), 0) / lifespans.length;
    const typicalDecayDay = Math.ceil(avgDecayHour / 24);

    // Calculate half-life (when video reaches 50% of total views)
    const halfLifes = lifespans.map((l) => {
      const views = l.hourlyViews;
      const total = views[views.length - 1];
      const halfPoint = total / 2;
      for (let i = 0; i < views.length; i++) {
        if (views[i] >= halfPoint) return i;
      }
      return views.length;
    });
    const avgHalfLife = halfLifes.reduce((s, h) => s + h, 0) / halfLifes.length;

    const recommendations: string[] = [];

    if (typicalDecayDay <= 2) {
      recommendations.push('Your content is spike-based. Optimize for immediate engagement and cross-posting.');
    } else if (typicalDecayDay >= 7) {
      recommendations.push('Your content has long-tail potential. Consider evergreen topics and SEO optimization.');
    }

    if (avgHalfLife < 24) {
      recommendations.push('Videos hit half their views in <24h. Consider posting during peak hours.');
    }

    return {
      typicalDecayDay,
      halfLifeHours: Math.round(avgHalfLife),
      recommendations,
    };
  }

  // ============================================================================
  // BANDIT STATE MANAGEMENT
  // ============================================================================

  /**
   * Get current bandit state for UI/debugging
   */
  getBanditState(type: 'style' | 'thumbnail'): {
    arms: Array<{
      id: string;
      name: string;
      mean: number;
      confidence: number;
      pulls: number;
      alpha: number;
      beta: number;
    }>;
    totalPulls: number;
    bestArm: string;
  } {
    const bandit = type === 'style' ? this.styleBandit : this.thumbnailBandit;

    const arms = Array.from(bandit.arms.values()).map((arm) => ({
      id: arm.id,
      name: arm.name,
      mean: arm.alpha / (arm.alpha + arm.beta),
      confidence: arm.pulls / (arm.pulls + 10),
      pulls: arm.pulls,
      alpha: arm.alpha,
      beta: arm.beta,
    }));

    arms.sort((a, b) => b.mean - a.mean);

    return {
      arms,
      totalPulls: arms.reduce((s, a) => s + a.pulls, 0),
      bestArm: arms[0]?.id || '',
    };
  }

  /**
   * Load bandit state from database (call on startup)
   */
  async loadState(): Promise<void> {
    // In production, load from database
    // For now, start fresh each restart
    console.log('🧠 Intelligent optimization: State initialized (fresh start)');
  }

  /**
   * Get complete optimization insights
   */
  getOptimizationInsights(): {
    styleBandit: any;
    thumbnailBandit: any;
    survival: any;
    decay: any;
    baseline: any;
  } {
    return {
      styleBandit: this.getBanditState('style'),
      thumbnailBandit: this.getBanditState('thumbnail'),
      survival: this.getSurvivalStats(),
      decay: this.getDecayAnalysis(),
      baseline: this.baselineMetrics,
    };
  }

  // ============================================================================
  // EMBEDDING-BASED TOPIC CLUSTERING
  // ============================================================================

  // Cache for topic embeddings (figure name -> embedding vector)
  private topicEmbeddings: Map<string, number[]> = new Map();
  private topicClusters: Map<string, string[]> = new Map(); // cluster name -> figure names

  /**
   * Generate embedding for a historical figure/topic using Gemini
   * Uses Gemini to generate semantic feature scores as a pseudo-embedding
   */
  async generateTopicEmbedding(figure: string, themes: string[] = []): Promise<number[]> {
    // Check cache first
    if (this.topicEmbeddings.has(figure)) {
      return this.topicEmbeddings.get(figure)!;
    }

    try {
      const embeddingModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { maxOutputTokens: 200, responseMimeType: 'application/json' },
      });
      const embeddingResult =
        await embeddingModel.generateContent(`Rate the following themes for historical figure "${figure}" on a scale of 0-10. Return JSON with numeric scores:
{
  "war": 0-10,
  "conquest": 0-10,
  "betrayal": 0-10,
  "tragedy": 0-10,
  "ambition": 0-10,
  "leadership": 0-10,
  "romance": 0-10,
  "revenge": 0-10,
  "sacrifice": 0-10,
  "underdog": 0-10,
  "genius": 0-10,
  "power": 0-10,
  "fall": 0-10,
  "redemption": 0-10,
  "innovation": 0-10,
  "rebellion": 0-10
}`);

      const content = embeddingResult.response.text() || '{}';
      const scores = JSON.parse(content);

      // Convert to pseudo-embedding vector (16 dimensions)
      const embedding = [
        scores.war || 0,
        scores.conquest || 0,
        scores.betrayal || 0,
        scores.tragedy || 0,
        scores.ambition || 0,
        scores.leadership || 0,
        scores.romance || 0,
        scores.revenge || 0,
        scores.sacrifice || 0,
        scores.underdog || 0,
        scores.genius || 0,
        scores.power || 0,
        scores.fall || 0,
        scores.redemption || 0,
        scores.innovation || 0,
        scores.rebellion || 0,
      ].map((v) => v / 10); // Normalize to 0-1

      this.topicEmbeddings.set(figure, embedding);
      console.log(`🧠 Generated semantic features for "${figure}" (${embedding.length} dimensions, Gemini-based)`);
      return embedding;
    } catch (error) {
      console.error(`Failed to generate semantic features for ${figure}:`, error);
      return [];
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Find similar historical figures based on embedding similarity
   */
  async findSimilarTopics(
    figure: string,
    topN: number = 5,
  ): Promise<{
    similar: Array<{ figure: string; similarity: number }>;
    themes: string[];
  }> {
    const targetEmbedding = await this.generateTopicEmbedding(figure);
    if (targetEmbedding.length === 0) {
      return { similar: [], themes: [] };
    }

    const similarities: Array<{ figure: string; similarity: number }> = [];

    for (const [otherFigure, embedding] of this.topicEmbeddings) {
      if (otherFigure === figure) continue;

      const similarity = this.cosineSimilarity(targetEmbedding, embedding);
      similarities.push({ figure: otherFigure, similarity });
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    const topSimilar = similarities.slice(0, topN);

    // Infer themes from similar figures (via GPT)
    const themes = await this.inferSharedThemes(
      figure,
      topSimilar.map((s) => s.figure),
    );

    return { similar: topSimilar, themes };
  }

  /**
   * Infer shared themes between figures using GPT
   */
  private async inferSharedThemes(figure: string, similarFigures: string[]): Promise<string[]> {
    if (similarFigures.length === 0) return [];

    try {
      const themeModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { maxOutputTokens: 200, responseMimeType: 'application/json' },
      });
      const themeResult =
        await themeModel.generateContent(`What psychological themes connect ${figure} with ${similarFigures.join(', ')}?
Return 3-5 themes as a JSON object with a "themes" array of strings. Examples: betrayal, ambition, underdog, tragedy, revenge, power, love, sacrifice, redemption.`);

      const content = themeResult.response.text() || '{}';
      const parsed = JSON.parse(content);
      return parsed.themes || [];
    } catch (error) {
      console.error('Failed to infer themes:', error);
      return [];
    }
  }

  /**
   * Cluster figures by theme similarity using K-means-like approach
   */
  async clusterTopics(
    figures: string[],
    numClusters: number = 5,
  ): Promise<{
    clusters: Array<{
      name: string;
      figures: string[];
      centroid: string;
    }>;
  }> {
    // Generate embeddings for all figures
    const embeddings: Array<{ figure: string; embedding: number[] }> = [];

    for (const figure of figures) {
      const embedding = await this.generateTopicEmbedding(figure);
      if (embedding.length > 0) {
        embeddings.push({ figure, embedding });
      }
    }

    if (embeddings.length < numClusters) {
      return { clusters: [{ name: 'All', figures, centroid: figures[0] || '' }] };
    }

    // Simple K-means clustering
    const clusters = this.kMeansClustering(embeddings, numClusters);

    // Name clusters based on common themes
    const namedClusters: Array<{ name: string; figures: string[]; centroid: string }> = [];

    for (const cluster of clusters) {
      if (cluster.members.length === 0) continue;

      const clusterName = await this.generateClusterName(cluster.members.map((m) => m.figure));
      namedClusters.push({
        name: clusterName,
        figures: cluster.members.map((m) => m.figure),
        centroid: cluster.centroid?.figure || cluster.members[0].figure,
      });
    }

    // Cache clusters
    for (const cluster of namedClusters) {
      this.topicClusters.set(cluster.name, cluster.figures);
    }

    return { clusters: namedClusters };
  }

  /**
   * Simple K-means clustering for embeddings
   */
  private kMeansClustering(
    items: Array<{ figure: string; embedding: number[] }>,
    k: number,
    maxIterations: number = 10,
  ): Array<{
    centroid: { figure: string; embedding: number[] } | null;
    members: Array<{ figure: string; embedding: number[] }>;
  }> {
    // Initialize centroids randomly
    const centroids = items.slice(0, k).map((item) => ({ ...item }));
    let clusters: Array<{ centroid: (typeof centroids)[0] | null; members: typeof items }> = centroids.map((c) => ({
      centroid: c,
      members: [],
    }));

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Clear clusters
      clusters = centroids.map((c) => ({ centroid: c, members: [] as typeof items }));

      // Assign items to nearest centroid
      for (const item of items) {
        let bestCluster = 0;
        let bestSimilarity = -1;

        for (let i = 0; i < centroids.length; i++) {
          const similarity = this.cosineSimilarity(item.embedding, centroids[i].embedding);
          if (similarity > bestSimilarity) {
            bestSimilarity = similarity;
            bestCluster = i;
          }
        }

        clusters[bestCluster].members.push(item);
      }

      // Update centroids (use the item closest to centroid as new centroid)
      for (let i = 0; i < clusters.length; i++) {
        if (clusters[i].members.length === 0) continue;

        // Calculate mean embedding
        const dim = clusters[i].members[0].embedding.length;
        const meanEmbedding = new Array(dim).fill(0);

        for (const member of clusters[i].members) {
          for (let d = 0; d < dim; d++) {
            meanEmbedding[d] += member.embedding[d];
          }
        }

        for (let d = 0; d < dim; d++) {
          meanEmbedding[d] /= clusters[i].members.length;
        }

        // Find member closest to mean
        let bestMember = clusters[i].members[0];
        let bestSim = -1;

        for (const member of clusters[i].members) {
          const sim = this.cosineSimilarity(member.embedding, meanEmbedding);
          if (sim > bestSim) {
            bestSim = sim;
            bestMember = member;
          }
        }

        centroids[i] = bestMember;
        clusters[i].centroid = bestMember;
      }
    }

    return clusters;
  }

  /**
   * Generate a descriptive name for a cluster of figures
   */
  private async generateClusterName(figures: string[]): Promise<string> {
    if (figures.length === 0) return 'Unknown';
    if (figures.length === 1) return figures[0];

    try {
      const clusterNameModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { maxOutputTokens: 50, responseMimeType: 'application/json' },
      });
      const clusterNameResult =
        await clusterNameModel.generateContent(`What theme connects these historical figures: ${figures.join(', ')}?
Give a 2-3 word theme name. Return JSON: {"name": "Theme Name"}`);

      const content = clusterNameResult.response.text() || '{}';
      const parsed = JSON.parse(content);
      return parsed.name || 'Mixed Themes';
    } catch (error) {
      return 'Mixed Themes';
    }
  }

  /**
   * Find unexplored content opportunities
   * "People who like X might like Y"
   */
  async findContentOpportunities(
    performedWell: string[],
    alreadyCovered: string[],
    candidates: string[],
  ): Promise<
    Array<{
      figure: string;
      reason: string;
      similarity: number;
      matchedWith: string;
    }>
  > {
    const opportunities: Array<{
      figure: string;
      reason: string;
      similarity: number;
      matchedWith: string;
    }> = [];

    // Generate embeddings for well-performing content
    for (const goodFigure of performedWell) {
      await this.generateTopicEmbedding(goodFigure);
    }

    // Check each candidate against well-performing content
    for (const candidate of candidates) {
      if (alreadyCovered.includes(candidate)) continue;

      const candidateEmb = await this.generateTopicEmbedding(candidate);
      if (candidateEmb.length === 0) continue;

      let bestMatch = '';
      let bestSimilarity = 0;

      for (const goodFigure of performedWell) {
        const goodEmb = this.topicEmbeddings.get(goodFigure);
        if (!goodEmb) continue;

        const similarity = this.cosineSimilarity(candidateEmb, goodEmb);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = goodFigure;
        }
      }

      if (bestSimilarity > 0.7) {
        // High similarity threshold
        opportunities.push({
          figure: candidate,
          reason: `Similar to ${bestMatch} (${(bestSimilarity * 100).toFixed(0)}% match)`,
          similarity: bestSimilarity,
          matchedWith: bestMatch,
        });
      }
    }

    // Sort by similarity
    opportunities.sort((a, b) => b.similarity - a.similarity);
    return opportunities.slice(0, 10);
  }

  /**
   * Get embedding cache stats
   */
  getEmbeddingStats(): {
    cachedFigures: number;
    clusters: number;
    clusterNames: string[];
  } {
    return {
      cachedFigures: this.topicEmbeddings.size,
      clusters: this.topicClusters.size,
      clusterNames: Array.from(this.topicClusters.keys()),
    };
  }
}

// Singleton export
export const intelligentOptimization = new IntelligentOptimizationService();
