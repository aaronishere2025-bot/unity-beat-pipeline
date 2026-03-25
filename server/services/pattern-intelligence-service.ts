/**
 * PATTERN INTELLIGENCE SERVICE
 *
 * Adds statistical rigor to analytics insights to avoid spurious correlations:
 * 1. Statistical significance thresholds - Patterns need 2+ samples
 * 2. Confidence scoring - Weight by sample size and consistency
 * 3. A/B holdouts - 15% of videos skip pattern enhancements
 * 4. Decay weighting - Recent performance weighted higher
 * 5. Pattern clustering - Group related patterns together
 * 6. GPT thematic clustering - Finds WHY patterns work, not just WHAT works
 * 7. Database persistence - Thematic principles survive server restarts
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { thematicPrinciples as thematicPrinciplesTable } from '@shared/schema';
import { eq } from 'drizzle-orm';

let _gemini: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

// Minimum view threshold for a video to count as "successful"
const MIN_VIEWS_FOR_SUCCESS = 50;

export interface TrackedPattern {
  id: string;
  pattern: string;
  category: 'title' | 'topic' | 'visual' | 'narrative' | 'style';
  cluster?: string; // Cluster group ID

  // Statistical tracking
  sampleCount: number;
  successCount: number; // Videos with above-average performance
  totalViews: number;
  totalEngagement: number;

  // Quality-adjusted tracking (excludes low-quality videos)
  qualityAdjustedSampleCount: number;
  qualityAdjustedSuccessCount: number;
  lowQualityVideoCount: number; // Videos excluded due to quality issues

  // Timing
  firstSeen: Date;
  lastSeen: Date;

  // Confidence
  confidenceScore: number; // 0-100, weighted by sample size
  isSignificant: boolean; // Has 2+ samples
  hasQualityConfounders: boolean; // True if low-quality videos might be skewing results

  // Performance
  avgViews: number;
  avgEngagement: number;
  successRate: number; // % of videos that performed well
  qualityAdjustedSuccessRate: number; // Success rate excluding low-quality videos
}

// Video quality metrics for confounding factor detection
export interface VideoQualityMetrics {
  videoId: string;
  renderErrorCount: number;
  retryCount: number;
  audioSyncIssues: boolean;
  clipFailures: number;
  uploadDelay: number; // Minutes from completion to upload
  earlyDropOffRate: number; // % viewers who left in first 30 seconds
  completionRate: number; // % who watched to end
  qualityScore: number; // 0-100 composite score
}

export interface PatternCluster {
  id: string;
  name: string;
  keywords: string[];
  patterns: string[];
  combinedConfidence: number;
  combinedSampleCount: number;
}

export interface HoldoutResult {
  isHoldout: boolean;
  reason: string;
  holdoutPercentage: number;
}

// ============================================================================
// BAYESIAN SURPRISE INTERFACES
// For narratively impactful moment detection and retry prioritization
// ============================================================================

export interface SurpriseEvent {
  clipIndex: number;
  timestamp: number;
  type: 'visual' | 'narrative' | 'emotional' | 'technical';
  surpriseScore: number; // 0-100, how unexpected/impactful
  description: string;
  retryPriority: number; // Higher = more important to get right
}

export interface BayesianSurpriseAnalysis {
  events: SurpriseEvent[];
  totalSurprise: number;
  highImpactMoments: number[];
  retryPriorities: Map<number, number>; // clipIndex -> priority
}

export interface ClipReport {
  clipIndex: number;
  qualityScore: number; // 0-100
  status: 'completed' | 'failed' | 'pending';
  retryCount: number;
  prompt?: string;
  errorMessage?: string;
  generatedAt?: Date;
}

export interface LibrosaData {
  duration: number;
  bpm: number;
  energy: number[];
  energyTimes: number[];
  beats: number[];
  sections: Array<{
    type: string;
    start: number;
    end: number;
  }>;
  spectralContrast?: number[];
  onsetStrength?: number[];
}

export interface TNAData {
  id: string;
  index: number;
  type: 'beat' | 'action' | 'emotion' | 'transition' | 'hook';
  text: string;
  narrativeObjective: string;
  emotionalArc: 'rising' | 'falling' | 'peak' | 'stable';
  dependencies: string[];
  timeWindow: {
    start: number;
    end: number;
  };
}

export interface SurpriseEnhancedFeedback {
  packageId: string;
  analysis: BayesianSurpriseAnalysis;
  actionableInsights: Array<{
    clipIndex: number;
    insight: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    suggestedAction: string;
  }>;
  budgetAllocation: Map<number, number>;
  summary: string;
}

// Cluster definitions for grouping related patterns
const PATTERN_CLUSTERS: Record<string, { name: string; keywords: string[] }> = {
  conflict_emotional: {
    name: 'Conflict & Emotional Hooks',
    keywords: ['betrayal', 'revenge', 'tragedy', 'downfall', 'death', 'assassination', 'murder', 'execution', 'fall'],
  },
  power_rise: {
    name: 'Power & Rise Stories',
    keywords: ['rise', 'power', 'conquer', 'empire', 'glory', 'triumph', 'victory', 'domination', 'reign'],
  },
  mystery_secrets: {
    name: 'Mystery & Secrets',
    keywords: ['secret', 'hidden', 'mystery', 'untold', 'unknown', 'forbidden', 'conspiracy', 'truth'],
  },
  epic_dramatic: {
    name: 'Epic & Dramatic',
    keywords: ['epic', 'legendary', 'greatest', 'ultimate', 'dramatic', 'cinematic', 'intense'],
  },
  underdog_struggle: {
    name: 'Underdog & Struggle',
    keywords: ['underdog', 'unlikely', 'struggle', 'against', 'odds', 'impossible', 'survive', 'overcome'],
  },
  visual_lighting: {
    name: 'Visual Style - Lighting',
    keywords: ['lighting', 'shadows', 'dramatic light', 'golden hour', 'chiaroscuro', 'moody', 'dark'],
  },
  visual_camera: {
    name: 'Visual Style - Camera',
    keywords: ['close-up', 'wide shot', 'tracking', 'slow motion', 'panning', 'zoom', 'angle'],
  },
};

const MIN_SAMPLES_FOR_SIGNIFICANCE = 2;
const HOLDOUT_PERCENTAGE = 15; // 15% of videos skip pattern enhancements
const DECAY_HALF_LIFE_DAYS = 30; // Patterns lose half their weight every 30 days
const HIGH_CONFIDENCE_THRESHOLD = 70;
const OBSOLETE_THEME_DAYS = 90; // Prune themes not updated in 90 days
const MIN_QUALITY_SCORE = 60; // Videos below this are excluded from theme analysis

class PatternIntelligenceService {
  private patterns: Map<string, TrackedPattern> = new Map();
  private holdoutHistory: Map<string, boolean> = new Map(); // jobId -> isHoldout
  private videoQualityMetrics: Map<string, VideoQualityMetrics> = new Map(); // videoId -> quality
  private thematicPrinciplesMap: Map<string, ThematicPrinciple> = new Map(); // For fast lookup
  private initialized: boolean = false;

  /**
   * Initialize the service by loading persisted data from database
   * Should be called once when the service is created
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadFromDatabase();
      this.initialized = true;
      console.log('✅ PatternIntelligenceService initialized with database persistence');
    } catch (error: any) {
      console.error('⚠️ Failed to load thematic principles from database:', error.message);
      // Continue with empty state - will rebuild from scratch
      this.initialized = true;
    }
  }

  /**
   * Load all thematic principles from database into memory
   */
  private async loadFromDatabase(): Promise<void> {
    const rows = await db.select().from(thematicPrinciplesTable);

    if (rows.length === 0) {
      console.log('📊 No persisted thematic principles found - starting fresh');
      return;
    }

    // Convert database rows to in-memory ThematicPrinciple objects
    for (const row of rows) {
      const principle: ThematicPrinciple = {
        id: row.id,
        name: row.name,
        description: row.description,
        whyItWorks: row.whyItWorks,
        examples: row.examples || [],
        antiPatterns: row.antiPatterns || [],
        confidence: row.confidence,
        sampleCount: row.sampleCount,
        createdAt: row.createdAt || new Date(),
        lastUpdated: row.updatedAt || new Date(),
        videosApplied: row.videosApplied,
        successfulVideos: row.successfulVideos,
        totalViews: row.totalViews,
        avgEngagement: parseFloat(String(row.avgEngagement)) || 0,
        successRate: parseFloat(String(row.successRate)) || 0,
        recentSuccessRate: parseFloat(String(row.recentSuccessRate)) || 0,
        trend: (row.trend as 'improving' | 'declining' | 'stable') || 'stable',
        contributingVideos: (row.contributingVideos || []) as any,
        category: (row.category as ThemeCategory) || 'emerging',
      };

      this.thematicPrinciplesMap.set(principle.id, principle);
      this.thematicPrinciples.push(principle);
    }

    console.log(`📊 Loaded ${rows.length} thematic principles from database`);

    // Set lastClusteringTime to now since we have data
    if (this.thematicPrinciples.length > 0) {
      this.lastClusteringTime = new Date();
    }
  }

  /**
   * Save or update a thematic principle to the database (upsert)
   */
  private async saveThemeToDatabase(theme: ThematicPrinciple): Promise<void> {
    try {
      const dbRecord = {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        whyItWorks: theme.whyItWorks,
        examples: theme.examples,
        antiPatterns: theme.antiPatterns,
        confidence: theme.confidence,
        sampleCount: theme.sampleCount,
        videosApplied: theme.videosApplied,
        successfulVideos: theme.successfulVideos,
        totalViews: theme.totalViews,
        avgEngagement: String(theme.avgEngagement),
        successRate: String(theme.successRate),
        recentSuccessRate: String(theme.recentSuccessRate || 0),
        trend: theme.trend,
        category: theme.category,
        contributingVideos: theme.contributingVideos,
        createdAt: theme.createdAt,
        updatedAt: new Date(),
      };

      // Upsert using INSERT ON CONFLICT UPDATE
      await db
        .insert(thematicPrinciplesTable)
        .values(dbRecord as any)
        .onConflictDoUpdate({
          target: thematicPrinciplesTable.id,
          set: {
            name: dbRecord.name,
            description: dbRecord.description,
            whyItWorks: dbRecord.whyItWorks,
            examples: dbRecord.examples,
            antiPatterns: dbRecord.antiPatterns,
            confidence: dbRecord.confidence,
            sampleCount: dbRecord.sampleCount,
            videosApplied: dbRecord.videosApplied,
            successfulVideos: dbRecord.successfulVideos,
            totalViews: dbRecord.totalViews,
            avgEngagement: dbRecord.avgEngagement,
            successRate: dbRecord.successRate,
            recentSuccessRate: dbRecord.recentSuccessRate,
            trend: dbRecord.trend,
            category: dbRecord.category,
            contributingVideos: dbRecord.contributingVideos as any,
            updatedAt: dbRecord.updatedAt,
          },
        });
    } catch (error: any) {
      console.error(`⚠️ Failed to save theme "${theme.name}" to database:`, error.message);
    }
  }

  /**
   * Calculate video quality score from production metrics
   * Returns 0-100 where higher = better quality
   */
  calculateVideoQualityScore(metrics: Partial<VideoQualityMetrics>): number {
    let score = 100;

    // Penalize for render errors (major issue)
    score -= (metrics.renderErrorCount || 0) * 15;

    // Penalize for retries (suggests generation issues)
    score -= (metrics.retryCount || 0) * 10;

    // Penalize for audio sync issues (major viewer experience issue)
    if (metrics.audioSyncIssues) score -= 25;

    // Penalize for clip failures
    score -= (metrics.clipFailures || 0) * 8;

    // Penalize for late uploads (off-peak timing)
    if ((metrics.uploadDelay || 0) > 120) score -= 10; // 2+ hours delay

    // Penalize for high early drop-off (suggests quality issue)
    if ((metrics.earlyDropOffRate || 0) > 0.5) score -= 15;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Record video quality metrics for confounding factor detection
   */
  recordVideoQuality(videoId: string, metrics: Partial<VideoQualityMetrics>): void {
    const qualityScore = this.calculateVideoQualityScore(metrics);
    this.videoQualityMetrics.set(videoId, {
      videoId,
      renderErrorCount: metrics.renderErrorCount || 0,
      retryCount: metrics.retryCount || 0,
      audioSyncIssues: metrics.audioSyncIssues || false,
      clipFailures: metrics.clipFailures || 0,
      uploadDelay: metrics.uploadDelay || 0,
      earlyDropOffRate: metrics.earlyDropOffRate || 0,
      completionRate: metrics.completionRate || 0,
      qualityScore,
    });

    if (qualityScore < MIN_QUALITY_SCORE) {
      console.log(`⚠️ Quality confounder: Video ${videoId} has low quality score (${qualityScore}/100)`);
    }
  }

  /**
   * Check if a video has quality confounders that might explain low performance
   */
  hasQualityConfounders(videoId: string): boolean {
    const metrics = this.videoQualityMetrics.get(videoId);
    if (!metrics) return false;
    return metrics.qualityScore < MIN_QUALITY_SCORE;
  }

  /**
   * Get quality-adjusted theme verdict
   * Returns "Avoid" only if theme underperforms on HIGH-QUALITY videos
   */
  getThemeVerdict(pattern: TrackedPattern): { verdict: string; hasConfounders: boolean; reason: string } {
    // If we have low-quality videos in this theme, check if they're skewing results
    if (pattern.lowQualityVideoCount > 0 && pattern.qualityAdjustedSampleCount >= 2) {
      // Use quality-adjusted metrics
      if (pattern.qualityAdjustedSuccessRate > 40) {
        return {
          verdict: 'Neutral',
          hasConfounders: true,
          reason: `${pattern.lowQualityVideoCount} low-quality video(s) may be skewing results. Quality-adjusted success: ${pattern.qualityAdjustedSuccessRate.toFixed(0)}%`,
        };
      }
    }

    // If only low-quality samples, don't penalize theme
    if (pattern.qualityAdjustedSampleCount < 2 && pattern.lowQualityVideoCount > 0) {
      return {
        verdict: 'Insufficient Quality Data',
        hasConfounders: true,
        reason: `All ${pattern.sampleCount} sample(s) have quality issues. Cannot determine if theme is underperforming.`,
      };
    }

    // Standard verdict based on quality-adjusted rate
    if (pattern.qualityAdjustedSuccessRate >= 60) {
      return { verdict: 'Proven', hasConfounders: false, reason: 'High success rate on quality videos' };
    } else if (pattern.qualityAdjustedSuccessRate >= 40) {
      return { verdict: 'Neutral', hasConfounders: false, reason: 'Average performance' };
    } else {
      return { verdict: 'Avoid', hasConfounders: false, reason: 'Low success rate on quality videos' };
    }
  }

  /**
   * Register a pattern observation from a video's performance
   * Now includes quality-adjusted tracking to prevent wrongly penalizing themes
   */
  recordPattern(
    pattern: string,
    category: TrackedPattern['category'],
    videoId: string,
    views: number,
    engagement: number,
    isSuccess: boolean,
    publishDate: Date,
  ): void {
    const patternId = this.generatePatternId(pattern, category);
    const existing = this.patterns.get(patternId);
    const isLowQuality = this.hasQualityConfounders(videoId);

    if (existing) {
      existing.sampleCount++;
      existing.totalViews += views;
      existing.totalEngagement += engagement;
      if (isSuccess) existing.successCount++;
      existing.lastSeen = new Date();
      existing.avgViews = existing.totalViews / existing.sampleCount;
      existing.avgEngagement = existing.totalEngagement / existing.sampleCount;
      existing.successRate = (existing.successCount / existing.sampleCount) * 100;
      existing.isSignificant = existing.sampleCount >= MIN_SAMPLES_FOR_SIGNIFICANCE;
      existing.confidenceScore = this.calculateConfidence(existing);
      existing.cluster = this.findCluster(pattern);

      // Quality-adjusted tracking
      if (isLowQuality) {
        existing.lowQualityVideoCount++;
        existing.hasQualityConfounders = true;
      } else {
        existing.qualityAdjustedSampleCount++;
        if (isSuccess) existing.qualityAdjustedSuccessCount++;
      }
      existing.qualityAdjustedSuccessRate =
        existing.qualityAdjustedSampleCount > 0
          ? (existing.qualityAdjustedSuccessCount / existing.qualityAdjustedSampleCount) * 100
          : 0;
    } else {
      const newPattern: TrackedPattern = {
        id: patternId,
        pattern,
        category,
        cluster: this.findCluster(pattern),
        sampleCount: 1,
        successCount: isSuccess ? 1 : 0,
        totalViews: views,
        totalEngagement: engagement,
        // Quality-adjusted fields
        qualityAdjustedSampleCount: isLowQuality ? 0 : 1,
        qualityAdjustedSuccessCount: isLowQuality ? 0 : isSuccess ? 1 : 0,
        lowQualityVideoCount: isLowQuality ? 1 : 0,
        firstSeen: publishDate,
        lastSeen: new Date(),
        confidenceScore: 0, // Low confidence with 1 sample
        isSignificant: false,
        hasQualityConfounders: isLowQuality,
        avgViews: views,
        avgEngagement: engagement,
        successRate: isSuccess ? 100 : 0,
        qualityAdjustedSuccessRate: isLowQuality ? 0 : isSuccess ? 100 : 0,
      };
      this.patterns.set(patternId, newPattern);
    }
  }

  /**
   * Calculate confidence score based on sample size, consistency, and recency
   */
  private calculateConfidence(pattern: TrackedPattern): number {
    // Base confidence from sample size (logarithmic curve)
    // 1 sample = 0, 5 samples = 50, 15+ samples = 80+
    const sampleScore = Math.min(80, Math.log2(pattern.sampleCount + 1) * 20);

    // Consistency bonus (how consistent is the success rate?)
    // 100% or 0% success with few samples = suspicious
    // 60-80% success with many samples = reliable
    const successVariance = Math.abs(pattern.successRate - 50) / 50;
    const consistencyPenalty = pattern.sampleCount < 5 ? successVariance * 30 : successVariance * 10;

    // Recency decay - patterns lose weight over time
    const daysSinceLastSeen = (Date.now() - pattern.lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.pow(0.5, daysSinceLastSeen / DECAY_HALF_LIFE_DAYS);

    // Final score
    const rawScore = (sampleScore - consistencyPenalty) * decayFactor;
    return Math.max(0, Math.min(100, Math.round(rawScore)));
  }

  /**
   * Find which cluster a pattern belongs to
   */
  private findCluster(pattern: string): string | undefined {
    const lowerPattern = pattern.toLowerCase();

    for (const [clusterId, cluster] of Object.entries(PATTERN_CLUSTERS)) {
      for (const keyword of cluster.keywords) {
        if (lowerPattern.includes(keyword.toLowerCase())) {
          return clusterId;
        }
      }
    }
    return undefined;
  }

  /**
   * Generate a unique ID for a pattern
   */
  private generatePatternId(pattern: string, category: string): string {
    return `${category}:${pattern
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .substring(0, 50)}`;
  }

  /**
   * Get only statistically significant patterns
   * Filters out patterns with < 5 samples
   */
  getSignificantPatterns(): TrackedPattern[] {
    return Array.from(this.patterns.values())
      .filter((p) => p.isSignificant)
      .sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Get patterns grouped by cluster with combined confidence
   */
  getClusteredPatterns(): PatternCluster[] {
    const clusters: Map<string, PatternCluster> = new Map();

    for (const pattern of this.patterns.values()) {
      if (!pattern.cluster || !pattern.isSignificant) continue;

      const clusterDef = PATTERN_CLUSTERS[pattern.cluster];
      if (!clusterDef) continue;

      let cluster = clusters.get(pattern.cluster);
      if (!cluster) {
        cluster = {
          id: pattern.cluster,
          name: clusterDef.name,
          keywords: clusterDef.keywords,
          patterns: [],
          combinedConfidence: 0,
          combinedSampleCount: 0,
        };
        clusters.set(pattern.cluster, cluster);
      }

      cluster.patterns.push(pattern.pattern);
      cluster.combinedSampleCount += pattern.sampleCount;
    }

    // Calculate combined confidence for each cluster
    for (const cluster of clusters.values()) {
      // Clusters with more patterns and samples get higher confidence
      const sampleScore = Math.min(80, Math.log2(cluster.combinedSampleCount + 1) * 15);
      const patternDiversityBonus = Math.min(20, cluster.patterns.length * 5);
      cluster.combinedConfidence = Math.round(sampleScore + patternDiversityBonus);
    }

    return Array.from(clusters.values()).sort((a, b) => b.combinedConfidence - a.combinedConfidence);
  }

  /**
   * Determine if a video should be a holdout (skip pattern enhancements)
   * Used for A/B testing pattern effectiveness
   */
  shouldBeHoldout(jobId: string): HoldoutResult {
    // Check if already decided for this job
    if (this.holdoutHistory.has(jobId)) {
      return {
        isHoldout: this.holdoutHistory.get(jobId)!,
        reason: 'Previously assigned',
        holdoutPercentage: HOLDOUT_PERCENTAGE,
      };
    }

    // Random selection for holdout
    const random = Math.random() * 100;
    const isHoldout = random < HOLDOUT_PERCENTAGE;

    this.holdoutHistory.set(jobId, isHoldout);

    return {
      isHoldout,
      reason: isHoldout
        ? `Selected as holdout (${HOLDOUT_PERCENTAGE}% chance) - will NOT apply learned patterns`
        : `Normal video (${100 - HOLDOUT_PERCENTAGE}% chance) - will apply learned patterns`,
      holdoutPercentage: HOLDOUT_PERCENTAGE,
    };
  }

  /**
   * Get high-confidence patterns that should be applied to video generation
   * Only returns patterns that meet significance and confidence thresholds
   */
  getApplicablePatterns(): {
    titlePatterns: string[];
    visualStyles: string[];
    narrativeApproaches: string[];
    avoidPatterns: string[];
    clusterInsights: string[];
  } {
    const significant = this.getSignificantPatterns();
    const highConfidence = significant.filter((p) => p.confidenceScore >= HIGH_CONFIDENCE_THRESHOLD);

    const titlePatterns = highConfidence
      .filter((p) => p.category === 'title' && p.successRate >= 50)
      .map((p) => p.pattern);

    const visualStyles = highConfidence
      .filter((p) => p.category === 'visual' && p.successRate >= 50)
      .map((p) => p.pattern);

    const narrativeApproaches = highConfidence
      .filter((p) => p.category === 'narrative' && p.successRate >= 50)
      .map((p) => p.pattern);

    // Patterns to avoid (low success rate with high confidence)
    const avoidPatterns = highConfidence.filter((p) => p.successRate < 30 && p.sampleCount >= 7).map((p) => p.pattern);

    // Get cluster-level insights
    const clusters = this.getClusteredPatterns();
    const clusterInsights = clusters
      .filter((c) => c.combinedConfidence >= 60)
      .map((c) => `${c.name} themes tend to perform well (${c.combinedSampleCount} videos)`);

    return {
      titlePatterns: titlePatterns.slice(0, 5),
      visualStyles: visualStyles.slice(0, 5),
      narrativeApproaches: narrativeApproaches.slice(0, 5),
      avoidPatterns: avoidPatterns.slice(0, 3),
      clusterInsights: clusterInsights.slice(0, 3),
    };
  }

  /**
   * Apply time decay to all patterns
   * Should be called periodically (e.g., daily)
   */
  applyTimeDecay(): void {
    for (const pattern of this.patterns.values()) {
      pattern.confidenceScore = this.calculateConfidence(pattern);
    }
    console.log('📉 Applied time decay to pattern confidence scores');
  }

  /**
   * Get analytics summary for the pattern intelligence system
   */
  getAnalyticsSummary(): {
    totalPatterns: number;
    significantPatterns: number;
    highConfidencePatterns: number;
    holdoutRate: number;
    topClusters: string[];
    recentActivity: string;
  } {
    const all = Array.from(this.patterns.values());
    const significant = all.filter((p) => p.isSignificant);
    const highConfidence = significant.filter((p) => p.confidenceScore >= HIGH_CONFIDENCE_THRESHOLD);
    const clusters = this.getClusteredPatterns();

    // Recent activity
    const now = Date.now();
    const recentPatterns = all.filter((p) => now - p.lastSeen.getTime() < 7 * 24 * 60 * 60 * 1000);

    return {
      totalPatterns: all.length,
      significantPatterns: significant.length,
      highConfidencePatterns: highConfidence.length,
      holdoutRate: HOLDOUT_PERCENTAGE,
      topClusters: clusters.slice(0, 3).map((c) => c.name),
      recentActivity: `${recentPatterns.length} patterns updated in last 7 days`,
    };
  }

  /**
   * Extract patterns from video performance data
   * Analyzes titles, topics, and visual elements
   */
  extractPatternsFromVideo(
    title: string,
    topic: string,
    views: number,
    engagement: number,
    avgViews: number,
    avgEngagement: number,
    publishDate: Date,
  ): void {
    const isSuccess = views > avgViews || engagement > avgEngagement;
    const videoId = `${Date.now()}_${title.substring(0, 20)}`;

    // Extract title patterns
    const titleWords = title.toLowerCase().split(/\s+/);
    const emotionalWords = [
      'epic',
      'legendary',
      'untold',
      'secret',
      'fall',
      'rise',
      'death',
      'betrayal',
      'last',
      'first',
      'greatest',
    ];

    for (const word of titleWords) {
      if (emotionalWords.includes(word)) {
        this.recordPattern(word, 'title', videoId, views, engagement, isSuccess, publishDate);
      }
    }

    // Extract topic patterns
    const topicKeywords = topic.toLowerCase().split(/\s+/);
    for (const keyword of topicKeywords) {
      if (keyword.length > 4) {
        this.recordPattern(keyword, 'topic', videoId, views, engagement, isSuccess, publishDate);
      }
    }

    // Record title format patterns
    if (title.includes('vs') || title.includes('VS')) {
      this.recordPattern('versus_format', 'title', videoId, views, engagement, isSuccess, publishDate);
    }
    if (title.startsWith('🔥') || title.includes('⚔️')) {
      this.recordPattern('emoji_hook', 'title', videoId, views, engagement, isSuccess, publishDate);
    }
    if (title.includes('#Shorts')) {
      this.recordPattern('shorts_tag', 'title', videoId, views, engagement, isSuccess, publishDate);
    }
  }

  // =========================================================
  // GPT-POWERED THEMATIC CLUSTERING
  // Finds underlying concepts WHY patterns work, not just WHAT
  // =========================================================

  private thematicPrinciples: ThematicPrinciple[] = [];
  private lastClusteringTime: Date | null = null;
  private readonly RECLUSTERING_INTERVAL_HOURS = 24; // Re-cluster daily

  /**
   * Generate thematic principles using GPT analysis
   * This finds the WHY behind successful patterns
   */
  async generateThematicClusters(
    topPerformers: { title: string; views: number; engagement: number; topic?: string; videoId?: string }[],
    lowPerformers: { title: string; views: number; topic?: string }[] = [],
    force: boolean = false,
  ): Promise<ThematicPrinciple[]> {
    // Check if we should re-cluster (skip if force=true)
    if (!force && this.lastClusteringTime && this.thematicPrinciples.length > 0) {
      const hoursSinceLastClustering = (Date.now() - this.lastClusteringTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastClustering < this.RECLUSTERING_INTERVAL_HOURS) {
        console.log(
          `📊 Using cached thematic principles (${Math.round(hoursSinceLastClustering)}h since last clustering)`,
        );
        return this.thematicPrinciples;
      }
    }

    if (force) {
      console.log('🔄 Force re-clustering requested - bypassing cache');
    }

    if (topPerformers.length < 3) {
      console.log('⚠️ Not enough top performers for thematic clustering (need 3+)');
      return this.getDefaultPrinciples();
    }

    try {
      console.log(
        `🧠 Running GPT thematic clustering on ${topPerformers.length} top / ${lowPerformers.length} low performers...`,
      );

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
        systemInstruction: `You are a content strategy analyst. Your job is to find the UNDERLYING PSYCHOLOGICAL PRINCIPLES that explain why certain videos perform well.

DO NOT just list keywords or surface-level patterns.
DO find the deeper human motivations, emotional triggers, and narrative structures that drive engagement.

Example of BAD output: "Videos with 'betrayal' in the title perform well"
Example of GOOD output: "High-stakes personal betrayal narratives - audiences connect deeply with stories of trust violated, especially when the betrayer had something to lose"

Think like a behavioral psychologist analyzing what makes content resonate with viewers.`,
      });

      const geminiResponse =
        await model.generateContent(`Analyze these YouTube video performances and extract 4-6 THEMATIC PRINCIPLES that explain WHY certain content works.

TOP PERFORMERS (high views/engagement):
${topPerformers
  .slice(0, 15)
  .map((v) => `- "${v.title}" (${v.views} views, ${v.engagement?.toFixed(1) || '?'}% engagement)`)
  .join('\n')}

LOW PERFORMERS (underperforming):
${lowPerformers
  .slice(0, 10)
  .map((v) => `- "${v.title}" (${v.views} views)`)
  .join('\n')}

Return a JSON object with:
{
  "principles": [
    {
      "name": "Short memorable name (3-6 words)",
      "description": "2-3 sentence explanation of the underlying psychological/narrative principle",
      "whyItWorks": "Brief explanation of the human motivation it taps into",
      "examples": ["1-2 brief examples from the data"],
      "matchingVideoTitles": ["EXACT titles from the TOP PERFORMERS list that match this principle - be selective, only include videos that truly embody this theme"],
      "antiPatterns": ["What to AVOID - patterns from low performers that conflict with this"]
    }
  ],
  "metaInsight": "One overarching insight about what this audience wants"
}

IMPORTANT: Each video should only match 1-2 principles at most. Be selective about matchingVideoTitles - don't assign every video to every principle.`);

      const result = JSON.parse(geminiResponse.response.text() || '{}');

      if (result.principles && Array.isArray(result.principles)) {
        this.thematicPrinciples = result.principles.map((p: any, index: number) => {
          // Match videos to this specific principle using GPT's matchingVideoTitles
          const matchingTitles = (p.matchingVideoTitles || p.examples || []).map((t: string) => t.toLowerCase());
          const matchingVideos = topPerformers.filter((v) => {
            const titleLower = v.title.toLowerCase();
            // Check if video title matches any of the specified matching titles (fuzzy match)
            return matchingTitles.some(
              (match: string) =>
                titleLower.includes(match.toLowerCase().slice(0, 20)) ||
                match.toLowerCase().includes(titleLower.slice(0, 20)),
            );
          });

          // If no matches found via matchingVideoTitles, don't default to all videos
          const videosForTheme = matchingVideos.length > 0 ? matchingVideos : [];
          const videoCount = videosForTheme.length;

          // Calculate ACTUAL success based on view thresholds (not blind 70% assumption)
          const totalViews = videosForTheme.reduce((sum, v) => sum + v.views, 0);
          const successfulVideos = videosForTheme.filter((v) => v.views >= MIN_VIEWS_FOR_SUCCESS).length;
          const actualSuccessRate = videoCount > 0 ? (successfulVideos / videoCount) * 100 : 0;

          const principle: ThematicPrinciple = {
            id: `principle_${index + 1}`,
            name: p.name || 'Unnamed Principle',
            description: p.description || '',
            // CRITICAL: Store detailed WHY explanation (not just theme name)
            whyItWorks: p.whyItWorks || p.reasoning || p.psychology || 'Psychological trigger not yet analyzed.',
            examples: p.examples || [],
            antiPatterns: p.antiPatterns || [],
            confidence: Math.max(50, 100 - index * 10), // First principles have higher confidence
            sampleCount: videoCount,
            createdAt: new Date(),
            lastUpdated: new Date(),
            // Initialize performance tracking based ONLY on matching videos
            videosApplied: videoCount,
            successfulVideos: successfulVideos,
            totalViews: totalViews,
            avgEngagement:
              videoCount > 0 ? videosForTheme.reduce((sum, v) => sum + (v.engagement || 0), 0) / videoCount : 0,
            successRate: actualSuccessRate, // Based on actual views, not blind assumption
            recentSuccessRate: actualSuccessRate,
            trend: 'stable',
            contributingVideos: videosForTheme.map((v) => ({
              videoId: v.videoId || '',
              title: v.title,
              views: v.views,
              engagement: v.engagement || 0,
              wasSuccess: v.views >= MIN_VIEWS_FOR_SUCCESS, // Based on actual performance
              date: new Date(),
            })),
            category: 'emerging', // Will be recalculated
          };
          principle.category = this.computeCategory(principle);

          console.log(`   🎯 Theme "${principle.name}": ${videoCount} matching videos`);
          return principle;
        });

        this.lastClusteringTime = new Date();

        // Save all newly generated themes to database
        for (const principle of this.thematicPrinciples) {
          this.thematicPrinciplesMap.set(principle.id, principle);
          await this.saveThemeToDatabase(principle);
        }

        console.log(`✅ Generated ${this.thematicPrinciples.length} thematic principles (persisted to database)`);
        if (result.metaInsight) {
          console.log(`   💡 Meta-insight: ${result.metaInsight}`);
        }

        return this.thematicPrinciples;
      }

      return this.getDefaultPrinciples();
    } catch (error: any) {
      console.error('Failed to generate thematic clusters:', error.message);
      return this.getDefaultPrinciples();
    }
  }

  /**
   * Get default principles when GPT clustering fails or insufficient data
   */
  private getDefaultPrinciples(): ThematicPrinciple[] {
    return [
      {
        id: 'default_1',
        name: 'Specific Dramatic Moments',
        description:
          'Focus on singular, pivotal moments rather than broad biographies. The assassination, the betrayal, the turning point.',
        whyItWorks:
          'Human attention gravitates to decisive moments with clear stakes and emotional weight. A single moment creates tension and resolution within seconds, perfect for short-form content.',
        examples: ['The 23 stab wounds that killed Caesar', "The night Lincoln's bodyguard left for a drink"],
        antiPatterns: ['Generic "rise and fall" narratives', 'Broad biographical overviews'],
        confidence: 70,
        sampleCount: 0,
        createdAt: new Date(),
        lastUpdated: new Date(),
        videosApplied: 0,
        successfulVideos: 0,
        totalViews: 0,
        avgEngagement: 0,
        successRate: 0,
        recentSuccessRate: 0,
        trend: 'stable',
        contributingVideos: [],
        category: 'emerging',
      },
      {
        id: 'default_2',
        name: 'First-Person Emotional Stakes',
        description:
          'The historical figure raps their own story, making the audience feel their personal stakes and emotions.',
        whyItWorks:
          'First-person perspective creates intimacy and identification with the subject. Viewers feel like they ARE the historical figure, not just watching them.',
        examples: ['I conquered...', 'They thought I would fail...'],
        antiPatterns: ['Third-person documentary narration', 'Distant historical analysis'],
        confidence: 70,
        sampleCount: 0,
        createdAt: new Date(),
        lastUpdated: new Date(),
        videosApplied: 0,
        successfulVideos: 0,
        totalViews: 0,
        avgEngagement: 0,
        successRate: 0,
        recentSuccessRate: 0,
        trend: 'stable',
        contributingVideos: [],
        category: 'emerging',
      },
    ];
  }

  /**
   * Compute theme category based on sample count and success rate
   */
  private computeCategory(p: ThematicPrinciple): ThemeCategory {
    if (p.videosApplied < MIN_SAMPLES_FOR_SIGNIFICANCE) {
      return 'emerging';
    }
    if (p.successRate >= 50) {
      return 'proven';
    }
    if (p.successRate >= 35) {
      return 'neutral'; // 35-50% range - not winners, not losers
    }
    return 'failing';
  }

  /**
   * Get themes by category
   */
  getThemesByCategory(): {
    proven: ThematicPrinciple[];
    neutral: ThematicPrinciple[];
    emerging: ThematicPrinciple[];
    failing: ThematicPrinciple[];
  } {
    const all = this.getThematicPrinciples();
    return {
      proven: all.filter((p) => this.computeCategory(p) === 'proven'),
      neutral: all.filter((p) => this.computeCategory(p) === 'neutral'),
      emerging: all.filter((p) => this.computeCategory(p) === 'emerging'),
      failing: all.filter((p) => this.computeCategory(p) === 'failing'),
    };
  }

  /**
   * Get neutral themes (35-50% success rate with enough samples)
   */
  getNeutralThemes(): ThematicPrinciple[] {
    return this.thematicPrinciples
      .filter((p) => p.videosApplied >= MIN_SAMPLES_FOR_SIGNIFICANCE && p.successRate >= 35 && p.successRate < 50)
      .sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Record theme performance after a video completes
   * This is how we track THEME success, not keyword success
   */
  recordThemePerformance(
    principleId: string,
    videoId: string,
    title: string,
    views: number,
    engagement: number,
    isSuccess: boolean,
  ): void {
    const principle = this.thematicPrinciples.find((p) => p.id === principleId);
    if (!principle) return;

    // Deduplicate: skip if this video was already recorded for this theme
    const existing = principle.contributingVideos.find((v) => v.videoId === videoId);
    if (existing) {
      // Update metrics in place (views may have changed since last run)
      existing.views = views;
      existing.engagement = engagement;
      existing.wasSuccess = isSuccess;
      return;
    }

    principle.videosApplied++;
    principle.totalViews += views;
    if (isSuccess) principle.successfulVideos++;

    // Track contributing video
    principle.contributingVideos.push({
      videoId,
      title,
      views,
      engagement,
      wasSuccess: isSuccess,
      date: new Date(),
    });

    // Keep only last 20 contributing videos
    if (principle.contributingVideos.length > 20) {
      principle.contributingVideos = principle.contributingVideos.slice(-20);
    }

    // Recalculate averages
    principle.avgEngagement =
      (principle.avgEngagement * (principle.videosApplied - 1) + engagement) / principle.videosApplied;
    principle.successRate = (principle.successfulVideos / principle.videosApplied) * 100;
    principle.lastUpdated = new Date();

    // Calculate 7-day trend
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentVideos = principle.contributingVideos.filter((v) => v.date >= sevenDaysAgo);
    if (recentVideos.length >= 2) {
      const recentSuccesses = recentVideos.filter((v) => v.wasSuccess).length;
      principle.recentSuccessRate = (recentSuccesses / recentVideos.length) * 100;

      // Determine trend
      if (principle.recentSuccessRate > principle.successRate + 10) {
        principle.trend = 'improving';
      } else if (principle.recentSuccessRate < principle.successRate - 10) {
        principle.trend = 'declining';
      } else {
        principle.trend = 'stable';
      }
    }

    // Update confidence based on sample size
    const sampleScore = Math.min(80, Math.log2(principle.videosApplied + 1) * 20);
    const successBonus = principle.successRate > 60 ? 10 : principle.successRate < 40 ? -10 : 0;
    principle.confidence = Math.max(30, Math.min(100, sampleScore + successBonus));

    // Update category
    principle.category = this.computeCategory(principle);

    console.log(
      `📊 Theme "${principle.name}" performance: ${principle.videosApplied} videos, ${principle.successRate.toFixed(0)}% success, trend: ${principle.trend}, category: ${principle.category}`,
    );

    // Persist to database
    this.saveThemeToDatabase(principle);
  }

  /**
   * Get themes that have proven performance (enough samples + good success rate)
   */
  getProvenThemes(): ThematicPrinciple[] {
    return this.thematicPrinciples
      .filter((p) => p.videosApplied >= MIN_SAMPLES_FOR_SIGNIFICANCE && p.successRate >= 50)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get themes to AVOID (poor performance with enough samples)
   */
  getFailingThemes(): ThematicPrinciple[] {
    return this.thematicPrinciples
      .filter((p) => p.videosApplied >= MIN_SAMPLES_FOR_SIGNIFICANCE && p.successRate < 35)
      .sort((a, b) => a.successRate - b.successRate);
  }

  /**
   * Prune obsolete themes that haven't been updated in 90+ days
   * Called during daily clustering to keep the theme list fresh
   */
  pruneObsoleteThemes(): { removed: string[]; retained: number } {
    const now = Date.now();
    const cutoffMs = OBSOLETE_THEME_DAYS * 24 * 60 * 60 * 1000;
    const removed: string[] = [];

    // Find themes with no recent activity
    const beforeCount = this.thematicPrinciples.length;
    this.thematicPrinciples = this.thematicPrinciples.filter((p) => {
      // Get most recent video contribution
      const mostRecentVideo =
        p.contributingVideos.length > 0 ? Math.max(...p.contributingVideos.map((v) => v.date.getTime())) : 0;

      const daysSinceActivity = (now - mostRecentVideo) / (1000 * 60 * 60 * 24);

      // Keep if: has recent activity OR is proven with high sample count
      if (daysSinceActivity < OBSOLETE_THEME_DAYS) {
        return true; // Keep - recent activity
      }

      if (p.category === 'proven' && p.videosApplied >= 10) {
        return true; // Keep - well-established proven theme
      }

      // Remove obsolete theme
      removed.push(p.name);
      console.log(
        `   🗑️ PRUNED: "${p.name}" - ${daysSinceActivity.toFixed(0)} days inactive, ${p.videosApplied} samples`,
      );
      return false;
    });

    if (removed.length > 0) {
      console.log(`🧹 Pruned ${removed.length} obsolete themes (>${OBSOLETE_THEME_DAYS} days inactive)`);
    }

    return { removed, retained: this.thematicPrinciples.length };
  }

  /**
   * Get thematic principles for prompt injection
   */
  getThematicPrinciples(): ThematicPrinciple[] {
    if (this.thematicPrinciples.length === 0) {
      return this.getDefaultPrinciples();
    }
    return this.thematicPrinciples;
  }

  /**
   * Format principles for injection into content generation prompts
   * Flow: Raw data → GPT clusters themes → Track THEME performance → Apply threshold → Inject
   *
   * CRITICAL: Includes both THEME and WHY explanation to give GPT context for creative application
   */
  formatPrinciplesForPrompt(): string {
    const themes = this.getThemesByCategory();

    if (themes.proven.length === 0 && themes.emerging.length === 0) {
      return '';
    }

    let prompt = '';
    const trendIcon = (t: 'improving' | 'declining' | 'stable') =>
      t === 'improving' ? '📈' : t === 'declining' ? '📉' : '➡️';

    // 🔥 PROVEN THEMES (50%+ success with enough samples)
    if (themes.proven.length > 0) {
      prompt += `🔥 PROVEN THEMES (${MIN_SAMPLES_FOR_SIGNIFICANCE}+ videos, statistically validated):\n`;
      for (const p of themes.proven.slice(0, 3)) {
        prompt += `• ${p.name} [${p.videosApplied} videos, ${p.successRate.toFixed(0)}% success ${trendIcon(p.trend)}]\n`;
        prompt += `  WHAT: ${p.description}\n`;
        prompt += `  WHY IT WORKS: ${p.whyItWorks}\n`;
        if (p.examples.length > 0) {
          prompt += `  Examples: ${p.examples.slice(0, 2).join(', ')}\n`;
        }
      }
      prompt += '\n';
    }

    // ⚖️ NEUTRAL THEMES (35-50% success - not winners, not losers)
    if (themes.neutral.length > 0) {
      prompt += `⚖️ NEUTRAL THEMES (use sparingly, 35-50% success):\n`;
      for (const p of themes.neutral.slice(0, 2)) {
        prompt += `• ${p.name} [${p.videosApplied} videos, ${p.successRate.toFixed(0)}% ${trendIcon(p.trend)}]: ${p.description}\n`;
      }
      prompt += '\n';
    }

    // 📊 EMERGING THEMES (testing phase - not enough data yet)
    if (themes.emerging.length > 0) {
      prompt += `📊 EMERGING THEMES (testing, need ${MIN_SAMPLES_FOR_SIGNIFICANCE}+ videos):\n`;
      for (const p of themes.emerging.slice(0, 2)) {
        prompt += `• ${p.name} [${p.videosApplied}/${MIN_SAMPLES_FOR_SIGNIFICANCE} samples]\n`;
        prompt += `  WHY IT MIGHT WORK: ${p.whyItWorks}\n`;
      }
      prompt += '\n';
    }

    // ⛔ FAILING THEMES (avoid these - proven to underperform)
    if (themes.failing.length > 0) {
      prompt += `⛔ AVOID THESE (proven to underperform <35%):\n`;
      for (const p of themes.failing.slice(0, 2)) {
        prompt += `• ${p.name} [${p.successRate.toFixed(0)}% - FAILED]\n`;
        if (p.antiPatterns.length > 0) {
          prompt += `  Problems: ${p.antiPatterns.join(', ')}\n`;
        }
      }
      prompt += '\n';
    }

    prompt += `\nApply proven theme PRINCIPLES creatively. The WHY explanations show what psychological triggers work - use them to inform NEW content, don't copy past titles.`;

    return prompt;
  }

  /**
   * Check if re-clustering is needed
   */
  needsReclustering(): boolean {
    if (!this.lastClusteringTime) return true;
    const hoursSinceLastClustering = (Date.now() - this.lastClusteringTime.getTime()) / (1000 * 60 * 60);
    return hoursSinceLastClustering >= this.RECLUSTERING_INTERVAL_HOURS;
  }

  /**
   * Get full analytics including thematic principles - for dashboard display
   */
  getFullAnalytics(): {
    patterns: TrackedPattern[];
    clusters: PatternCluster[];
    principles: ThematicPrinciple[];
    themesByCategory: {
      proven: ThematicPrinciple[];
      neutral: ThematicPrinciple[];
      emerging: ThematicPrinciple[];
      failing: ThematicPrinciple[];
    };
    holdoutRate: number;
    lastClusteringTime: Date | null;
    needsReclustering: boolean;
    stats: {
      totalThemes: number;
      provenCount: number;
      neutralCount: number;
      emergingCount: number;
      failingCount: number;
      totalVideosTracked: number;
      avgSuccessRate: number;
    };
  } {
    const themes = this.getThemesByCategory();
    const allPrinciples = this.getThematicPrinciples();

    const totalVideos = allPrinciples.reduce((sum, p) => sum + p.videosApplied, 0);
    const avgSuccess =
      allPrinciples.length > 0 ? allPrinciples.reduce((sum, p) => sum + p.successRate, 0) / allPrinciples.length : 0;

    return {
      patterns: this.getSignificantPatterns(),
      clusters: this.getClusteredPatterns(),
      principles: allPrinciples,
      themesByCategory: themes,
      holdoutRate: HOLDOUT_PERCENTAGE,
      lastClusteringTime: this.lastClusteringTime,
      needsReclustering: this.needsReclustering(),
      stats: {
        totalThemes: allPrinciples.length,
        provenCount: themes.proven.length,
        neutralCount: themes.neutral.length,
        emergingCount: themes.emerging.length,
        failingCount: themes.failing.length,
        totalVideosTracked: totalVideos,
        avgSuccessRate: avgSuccess,
      },
    };
  }

  /**
   * Get dashboard-ready theme data with all UI-required fields
   */
  getDashboardThemes(): Array<{
    id: string;
    name: string;
    category: ThemeCategory;
    categoryIcon: string;
    successRate: number;
    sampleCount: number;
    trend: 'improving' | 'declining' | 'stable';
    trendIcon: string;
    whyItWorks: string;
    description: string;
    contributingVideos: Array<{
      videoId: string;
      title: string;
      views: number;
      wasSuccess: boolean;
    }>;
    examples: string[];
    antiPatterns: string[];
  }> {
    const principles = this.getThematicPrinciples();

    return principles.map((p) => ({
      id: p.id,
      name: p.name,
      category: this.computeCategory(p),
      categoryIcon: this.getCategoryIcon(this.computeCategory(p)),
      successRate: p.successRate,
      sampleCount: p.videosApplied,
      trend: p.trend,
      trendIcon: p.trend === 'improving' ? '📈' : p.trend === 'declining' ? '📉' : '➡️',
      whyItWorks: p.whyItWorks,
      description: p.description,
      contributingVideos: p.contributingVideos.slice(-10).map((v) => ({
        videoId: v.videoId,
        title: v.title,
        views: v.views,
        wasSuccess: v.wasSuccess,
      })),
      examples: p.examples,
      antiPatterns: p.antiPatterns,
    }));
  }

  private getCategoryIcon(category: ThemeCategory): string {
    switch (category) {
      case 'proven':
        return '🔥';
      case 'neutral':
        return '⚖️';
      case 'emerging':
        return '📊';
      case 'failing':
        return '⛔';
    }
  }

  // =========================================================
  // AUTO-PROMOTION SYSTEM
  // Automatically promotes patterns when they hit validation thresholds
  // =========================================================

  /**
   * Auto-promote patterns based on persisted metrics
   * Criteria: 5+ videos achieving 120%+ of channel average
   * Returns list of newly promoted patterns
   */
  async autoPromotePatterns(
    videoMetrics: Array<{
      videoId: string;
      title: string;
      views: number;
      performanceTier?: string | null;
      patterns?: string[];
    }>,
    channelAvgViews: number,
  ): Promise<{
    promoted: string[];
    demoted: string[];
    unchanged: string[];
  }> {
    const result = {
      promoted: [] as string[],
      demoted: [] as string[],
      unchanged: [] as string[],
    };

    const PROMOTION_THRESHOLD = 1.2; // 120% of channel average
    const DEMOTION_THRESHOLD = 0.5; // 50% of channel average
    const MIN_SAMPLES = 5;

    // Extract patterns from video titles and track their performance
    const patternPerformance: Map<string, { wins: number; losses: number; totalViews: number; videos: string[] }> =
      new Map();

    // Extract patterns from each video
    for (const video of videoMetrics) {
      const extractedPatterns = this.extractPatternsFromTitle(video.title);
      const isWinner = video.views >= channelAvgViews * PROMOTION_THRESHOLD;
      const isLoser = video.views <= channelAvgViews * DEMOTION_THRESHOLD;

      for (const pattern of extractedPatterns) {
        const existing = patternPerformance.get(pattern) || { wins: 0, losses: 0, totalViews: 0, videos: [] };
        existing.totalViews += video.views;
        existing.videos.push(video.videoId);
        if (isWinner) existing.wins++;
        if (isLoser) existing.losses++;
        patternPerformance.set(pattern, existing);
      }
    }

    // Evaluate patterns for promotion/demotion
    for (const [pattern, stats] of patternPerformance.entries()) {
      const totalSamples = stats.videos.length;

      if (totalSamples < MIN_SAMPLES) {
        result.unchanged.push(pattern);
        continue;
      }

      const winRate = stats.wins / totalSamples;
      const lossRate = stats.losses / totalSamples;

      // Auto-promote patterns with 60%+ win rate (120%+ channel avg in 5+ videos)
      if (winRate >= 0.6 && stats.wins >= MIN_SAMPLES) {
        // Create or update pattern as proven
        const existingPrinciple = this.thematicPrinciples.find(
          (p) =>
            p.name.toLowerCase().includes(pattern.toLowerCase()) ||
            p.examples.some((e) => e.toLowerCase().includes(pattern.toLowerCase())),
        );

        if (existingPrinciple) {
          if (existingPrinciple.category !== 'proven') {
            existingPrinciple.category = 'proven';
            existingPrinciple.successRate = winRate * 100;
            existingPrinciple.videosApplied = totalSamples;
            existingPrinciple.successfulVideos = stats.wins;
            existingPrinciple.lastUpdated = new Date();
            result.promoted.push(`${pattern} (${stats.wins}/${totalSamples} wins, ${(winRate * 100).toFixed(0)}%)`);
            console.log(`🔥 AUTO-PROMOTED: "${pattern}" - ${stats.wins} videos at 120%+ channel avg`);
          } else {
            result.unchanged.push(pattern);
          }
        } else {
          // Create new proven pattern
          const newPrinciple: ThematicPrinciple = {
            id: `auto_${pattern.replace(/\s+/g, '_').toLowerCase()}`,
            name: `${pattern} (Auto-Discovered)`,
            description: `Pattern auto-discovered from ${stats.wins} high-performing videos.`,
            whyItWorks: 'This pattern consistently drives above-average performance based on historical data.',
            examples: [pattern],
            antiPatterns: [],
            confidence: Math.min(90, 50 + winRate * 50),
            sampleCount: totalSamples,
            createdAt: new Date(),
            lastUpdated: new Date(),
            videosApplied: totalSamples,
            successfulVideos: stats.wins,
            totalViews: stats.totalViews,
            avgEngagement: 0,
            successRate: winRate * 100,
            recentSuccessRate: winRate * 100,
            trend: 'stable',
            contributingVideos: [],
            category: 'proven',
          };
          this.thematicPrinciples.push(newPrinciple);
          result.promoted.push(`${pattern} (NEW - ${stats.wins}/${totalSamples} wins)`);
          console.log(`🆕 NEW PROVEN PATTERN: "${pattern}" - ${stats.wins} high performers`);
        }
      }
      // Auto-demote patterns with 60%+ loss rate
      else if (lossRate >= 0.6 && stats.losses >= MIN_SAMPLES) {
        const existingPrinciple = this.thematicPrinciples.find((p) =>
          p.name.toLowerCase().includes(pattern.toLowerCase()),
        );

        if (existingPrinciple && existingPrinciple.category !== 'failing') {
          existingPrinciple.category = 'failing';
          existingPrinciple.successRate = (1 - lossRate) * 100;
          existingPrinciple.lastUpdated = new Date();
          result.demoted.push(`${pattern} (${stats.losses}/${totalSamples} underperforming)`);
          console.log(`⛔ AUTO-DEMOTED: "${pattern}" - ${stats.losses} videos underperforming`);
        } else if (!existingPrinciple) {
          // Add to avoid list
          const avoidPrinciple: ThematicPrinciple = {
            id: `avoid_${pattern.replace(/\s+/g, '_').toLowerCase()}`,
            name: `AVOID: ${pattern}`,
            description: `Pattern auto-flagged as underperforming from ${stats.losses} low-view videos.`,
            whyItWorks: 'This pattern should be avoided as it consistently underperforms.',
            examples: [],
            antiPatterns: [pattern],
            confidence: 70,
            sampleCount: totalSamples,
            createdAt: new Date(),
            lastUpdated: new Date(),
            videosApplied: totalSamples,
            successfulVideos: 0,
            totalViews: stats.totalViews,
            avgEngagement: 0,
            successRate: (1 - lossRate) * 100,
            recentSuccessRate: (1 - lossRate) * 100,
            trend: 'declining',
            contributingVideos: [],
            category: 'failing',
          };
          this.thematicPrinciples.push(avoidPrinciple);
          result.demoted.push(`${pattern} (NEW AVOID - ${stats.losses} underperformers)`);
        } else {
          result.unchanged.push(pattern);
        }
      } else {
        result.unchanged.push(pattern);
      }
    }

    console.log(
      `📊 Auto-promotion complete: ${result.promoted.length} promoted, ${result.demoted.length} demoted, ${result.unchanged.length} unchanged`,
    );
    return result;
  }

  /**
   * Extract patterns from a video title for auto-promotion tracking
   */
  private extractPatternsFromTitle(title: string): string[] {
    const patterns: string[] = [];
    const lowerTitle = title.toLowerCase();

    // Format patterns
    if (lowerTitle.includes(' vs ') || lowerTitle.includes(' vs. ')) {
      patterns.push('versus_format');
    }
    if (lowerTitle.includes('untold story') || lowerTitle.includes('untold truth')) {
      patterns.push('untold_narrative');
    }
    if (
      lowerTitle.includes('last') &&
      (lowerTitle.includes('words') || lowerTitle.includes('days') || lowerTitle.includes('hours'))
    ) {
      patterns.push('last_moments');
    }
    if (lowerTitle.includes('rise and fall') || lowerTitle.includes('rise & fall')) {
      patterns.push('rise_and_fall');
    }
    if (lowerTitle.includes('secret') || lowerTitle.includes('hidden')) {
      patterns.push('secret_reveal');
    }
    if (lowerTitle.includes('betrayal') || lowerTitle.includes('betrayed')) {
      patterns.push('betrayal_theme');
    }
    if (lowerTitle.includes('revenge') || lowerTitle.includes('vengeance')) {
      patterns.push('revenge_theme');
    }
    if (lowerTitle.includes('tragedy') || lowerTitle.includes('tragic')) {
      patterns.push('tragedy_theme');
    }
    if (lowerTitle.includes('legendary') || lowerTitle.includes('legend of')) {
      patterns.push('legendary_framing');
    }
    if (lowerTitle.includes('murder') || lowerTitle.includes('assassination') || lowerTitle.includes('death')) {
      patterns.push('death_hook');
    }
    if (lowerTitle.includes('lament') || lowerTitle.includes('lament of')) {
      patterns.push('lament_format');
    }
    if (lowerTitle.includes('confession') || lowerTitle.includes('confesses')) {
      patterns.push('confession_format');
    }

    // Era patterns
    if (
      lowerTitle.includes('ancient') ||
      lowerTitle.includes('rome') ||
      lowerTitle.includes('greek') ||
      lowerTitle.includes('egypt')
    ) {
      patterns.push('ancient_era');
    }
    if (
      lowerTitle.includes('medieval') ||
      lowerTitle.includes('kingdom') ||
      lowerTitle.includes('king') ||
      lowerTitle.includes('queen')
    ) {
      patterns.push('royalty_theme');
    }
    if (lowerTitle.includes('world war') || lowerTitle.includes('ww1') || lowerTitle.includes('ww2')) {
      patterns.push('world_war_era');
    }

    return patterns;
  }

  /**
   * Get auto-promotion status for dashboard display
   */
  getAutoPromotionStatus(): {
    provenPatterns: string[];
    emergingPatterns: string[];
    failingPatterns: string[];
    lastPromotionCheck: Date | null;
  } {
    const byCategory = this.getThemesByCategory();
    return {
      provenPatterns: byCategory.proven.map((p) => p.name),
      emergingPatterns: byCategory.emerging.map((p) => p.name),
      failingPatterns: byCategory.failing.map((p) => p.name),
      lastPromotionCheck: this.lastClusteringTime,
    };
  }
}

// Theme category types
export type ThemeCategory = 'proven' | 'neutral' | 'emerging' | 'failing';

// Thematic principle interface - the PRIMARY tracking unit
export interface ThematicPrinciple {
  id: string;
  name: string;
  description: string;
  whyItWorks: string; // CRITICAL: The reasoning WHY this works (not just WHAT)
  examples: string[];
  antiPatterns: string[];
  confidence: number;
  sampleCount: number;
  createdAt: Date;
  lastUpdated: Date;

  // Performance tracking for the THEME (not keywords)
  videosApplied: number; // How many videos used this theme
  successfulVideos: number; // Videos that performed above average
  totalViews: number; // Total views from videos using this theme
  avgEngagement: number; // Average engagement from videos using this theme
  successRate: number; // % of videos that succeeded with this theme

  // Trend tracking (7-day window)
  recentSuccessRate: number; // Success rate in last 7 days
  trend: 'improving' | 'declining' | 'stable';

  // Video tracking
  contributingVideos: Array<{
    videoId: string;
    title: string;
    views: number;
    engagement: number;
    wasSuccess: boolean;
    date: Date;
  }>;

  // Computed category
  category: ThemeCategory;
}

// ============================================================================
// BAYESIAN SURPRISE ANALYZER
// Detects narratively impactful moments for retry prioritization
// ============================================================================

class BayesianSurpriseAnalyzer {
  private surpriseHistory: Map<string, BayesianSurpriseAnalysis> = new Map();

  /**
   * Analyze Bayesian Surprise across TNAs and audio data
   * Identifies semantically meaningful events that deserve extra generation attention
   */
  analyzeBayesianSurprise(
    tnas: TNAData[],
    clipReports: ClipReport[],
    librosaData: LibrosaData,
  ): BayesianSurpriseAnalysis {
    console.log('🎯 Analyzing Bayesian Surprise for narrative impact detection...');

    const events: SurpriseEvent[] = [];

    // 1. Detect peak energy moments from librosa
    const energyEvents = this.detectEnergySpikes(librosaData, tnas);
    events.push(...energyEvents);

    // 2. Identify emotional arc peaks/valleys from TNAs
    const emotionalEvents = this.detectEmotionalPeaks(tnas);
    events.push(...emotionalEvents);

    // 3. Find hook points and pattern interrupts
    const hookEvents = this.detectHookPoints(tnas);
    events.push(...hookEvents);

    // 4. Identify transition moments between major story beats
    const transitionEvents = this.detectTransitionMoments(tnas, librosaData);
    events.push(...transitionEvents);

    // Sort by surprise score and deduplicate by clipIndex (keep highest)
    const deduped = this.deduplicateEvents(events);

    // Calculate total surprise and identify high impact moments
    const totalSurprise = deduped.reduce((sum, e) => sum + e.surpriseScore, 0);
    const highImpactMoments = deduped.filter((e) => e.surpriseScore >= 70).map((e) => e.clipIndex);

    // Build retry priorities map
    const retryPriorities = this.calculateRetryPriorities(
      { events: deduped, totalSurprise, highImpactMoments, retryPriorities: new Map() },
      clipReports,
    );

    const analysis: BayesianSurpriseAnalysis = {
      events: deduped,
      totalSurprise,
      highImpactMoments,
      retryPriorities,
    };

    console.log(`✅ Bayesian Surprise: ${deduped.length} events, ${highImpactMoments.length} high-impact moments`);
    return analysis;
  }

  /**
   * Detect energy spikes in librosa data - these are visually impactful moments
   */
  private detectEnergySpikes(librosaData: LibrosaData, tnas: TNAData[]): SurpriseEvent[] {
    const events: SurpriseEvent[] = [];
    const { energy, energyTimes, duration } = librosaData;

    if (!energy || energy.length === 0) return events;

    // Calculate mean and std for spike detection
    const mean = energy.reduce((a, b) => a + b, 0) / energy.length;
    const variance = energy.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / energy.length;
    const std = Math.sqrt(variance);

    // Find energy values that are 1.5+ std above mean
    const spikeThreshold = mean + std * 1.5;

    for (let i = 0; i < energy.length; i++) {
      if (energy[i] >= spikeThreshold) {
        const timestamp = energyTimes?.[i] ?? (i / energy.length) * duration;
        const clipIndex = this.timestampToClipIndex(timestamp, tnas);

        // Calculate surprise score based on deviation from mean
        const deviation = (energy[i] - mean) / std;
        const surpriseScore = Math.min(100, Math.round(40 + deviation * 20));

        events.push({
          clipIndex,
          timestamp,
          type: 'visual',
          surpriseScore,
          description: `Energy spike at ${timestamp.toFixed(1)}s - ${deviation.toFixed(1)} std above mean`,
          retryPriority: Math.round(surpriseScore / 10),
        });
      }
    }

    return events;
  }

  /**
   * Detect emotional peaks and valleys from TNA emotional arcs
   */
  private detectEmotionalPeaks(tnas: TNAData[]): SurpriseEvent[] {
    const events: SurpriseEvent[] = [];

    for (let i = 0; i < tnas.length; i++) {
      const tna = tnas[i];
      const prevArc = i > 0 ? tnas[i - 1].emotionalArc : 'stable';

      // Peak moments are always high surprise
      if (tna.emotionalArc === 'peak') {
        events.push({
          clipIndex: tna.index,
          timestamp: tna.timeWindow.start,
          type: 'emotional',
          surpriseScore: 85,
          description: `Emotional peak: "${tna.narrativeObjective}"`,
          retryPriority: 9,
        });
      }
      // Emotional direction changes are moderately surprising
      else if (
        (prevArc === 'rising' && tna.emotionalArc === 'falling') ||
        (prevArc === 'falling' && tna.emotionalArc === 'rising')
      ) {
        events.push({
          clipIndex: tna.index,
          timestamp: tna.timeWindow.start,
          type: 'emotional',
          surpriseScore: 65,
          description: `Emotional shift (${prevArc} → ${tna.emotionalArc}): "${tna.text.substring(0, 50)}..."`,
          retryPriority: 7,
        });
      }
    }

    return events;
  }

  /**
   * Detect hook points - TNAs marked as hooks or at critical positions
   */
  private detectHookPoints(tnas: TNAData[]): SurpriseEvent[] {
    const events: SurpriseEvent[] = [];

    for (const tna of tnas) {
      // Hook type TNAs are always high priority
      if (tna.type === 'hook') {
        events.push({
          clipIndex: tna.index,
          timestamp: tna.timeWindow.start,
          type: 'narrative',
          surpriseScore: 95, // Hooks are highest priority
          description: `Hook point: "${tna.text.substring(0, 60)}..."`,
          retryPriority: 10,
        });
      }

      // First 3 clips are critical for retention
      if (tna.index < 3) {
        events.push({
          clipIndex: tna.index,
          timestamp: tna.timeWindow.start,
          type: 'narrative',
          surpriseScore: 80 - tna.index * 10, // 80, 70, 60 for clips 0, 1, 2
          description: `Opening sequence clip ${tna.index + 1} - critical for retention`,
          retryPriority: 8 - tna.index,
        });
      }
    }

    return events;
  }

  /**
   * Detect transition moments between major story beats
   */
  private detectTransitionMoments(tnas: TNAData[], librosaData: LibrosaData): SurpriseEvent[] {
    const events: SurpriseEvent[] = [];
    const sections = librosaData.sections || [];

    // TNAs marked as transitions
    for (const tna of tnas) {
      if (tna.type === 'transition') {
        events.push({
          clipIndex: tna.index,
          timestamp: tna.timeWindow.start,
          type: 'technical',
          surpriseScore: 55,
          description: `Story transition: "${tna.narrativeObjective}"`,
          retryPriority: 6,
        });
      }
    }

    // Section boundaries from librosa (verse→chorus, etc)
    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      const prevSection = sections[i - 1];

      // Major section changes (e.g., verse to chorus)
      if (section.type !== prevSection.type) {
        const clipIndex = this.timestampToClipIndex(section.start, tnas);

        events.push({
          clipIndex,
          timestamp: section.start,
          type: 'technical',
          surpriseScore: 60,
          description: `Section change: ${prevSection.type} → ${section.type}`,
          retryPriority: 6,
        });
      }
    }

    return events;
  }

  /**
   * Convert timestamp to clip index using TNA time windows
   */
  private timestampToClipIndex(timestamp: number, tnas: TNAData[]): number {
    for (const tna of tnas) {
      if (timestamp >= tna.timeWindow.start && timestamp < tna.timeWindow.end) {
        return tna.index;
      }
    }
    // Default to last clip if beyond all time windows
    return tnas.length > 0 ? tnas[tnas.length - 1].index : 0;
  }

  /**
   * Deduplicate events by clip index, keeping the highest surprise score
   */
  private deduplicateEvents(events: SurpriseEvent[]): SurpriseEvent[] {
    const byClip = new Map<number, SurpriseEvent>();

    for (const event of events) {
      const existing = byClip.get(event.clipIndex);
      if (!existing || event.surpriseScore > existing.surpriseScore) {
        byClip.set(event.clipIndex, event);
      }
    }

    return Array.from(byClip.values()).sort((a, b) => b.surpriseScore - a.surpriseScore);
  }

  /**
   * Calculate retry priorities by cross-referencing surprise with quality
   * High surprise + low quality = highest retry priority
   */
  calculateRetryPriorities(surpriseAnalysis: BayesianSurpriseAnalysis, clipReports: ClipReport[]): Map<number, number> {
    const priorities = new Map<number, number>();

    // Build clip quality lookup
    const qualityMap = new Map<number, number>();
    for (const report of clipReports) {
      qualityMap.set(report.clipIndex, report.qualityScore);
    }

    for (const event of surpriseAnalysis.events) {
      const quality = qualityMap.get(event.clipIndex) ?? 50; // Default to medium quality

      // Priority calculation:
      // High surprise (70+) + low quality (<50) = priority 10 (highest)
      // High surprise + high quality (70+) = priority 2 (low - already good)
      // Low surprise (<40) + low quality = priority 5 (medium)
      // Low surprise + high quality = priority 1 (lowest)

      let priority: number;

      if (event.surpriseScore >= 70 && quality < 50) {
        // Critical: High impact moment with poor quality - MUST retry
        priority = 10;
      } else if (event.surpriseScore >= 70 && quality >= 70) {
        // Good: High impact already executed well - no retry needed
        priority = 2;
      } else if (event.surpriseScore >= 70) {
        // High impact, medium quality - worth retrying
        priority = 7;
      } else if (event.surpriseScore >= 40 && quality < 50) {
        // Medium impact, low quality - moderate retry priority
        priority = 5;
      } else if (event.surpriseScore >= 40) {
        // Medium impact, acceptable quality
        priority = 3;
      } else if (quality < 50) {
        // Low impact, low quality - some retry value
        priority = 4;
      } else {
        // Low impact, acceptable quality - lowest priority
        priority = 1;
      }

      priorities.set(event.clipIndex, priority);
    }

    console.log(
      `📊 Retry priorities: ${Array.from(priorities.entries()).filter(([_, p]) => p >= 7).length} high priority clips`,
    );
    return priorities;
  }

  /**
   * Reallocate frame budget to high-impact moments
   * Distributes extra generation attempts based on surprise scores
   */
  reallocateFrameBudget(surpriseAnalysis: BayesianSurpriseAnalysis, totalBudget: number): Map<number, number> {
    const allocation = new Map<number, number>();
    const events = surpriseAnalysis.events;

    if (events.length === 0) return allocation;

    // Calculate total weight from surprise scores
    const totalWeight = events.reduce((sum, e) => sum + e.surpriseScore, 0);

    if (totalWeight === 0) return allocation;

    // Base allocation: 1 attempt per clip
    const baseAllocation = 1;
    const extraBudget = totalBudget - events.length; // Budget after base allocation

    if (extraBudget <= 0) {
      // Not enough budget - just give 1 each to highest priority
      for (const event of events.slice(0, totalBudget)) {
        allocation.set(event.clipIndex, 1);
      }
      return allocation;
    }

    // Distribute extra budget proportionally by surprise score
    for (const event of events) {
      const proportion = event.surpriseScore / totalWeight;
      const extraAttempts = Math.floor(extraBudget * proportion);
      allocation.set(event.clipIndex, baseAllocation + extraAttempts);
    }

    // Give remaining budget to highest surprise clips
    const allocated = Array.from(allocation.values()).reduce((a, b) => a + b, 0);
    let remaining = totalBudget - allocated;

    const sortedByPriority = [...events].sort((a, b) => b.surpriseScore - a.surpriseScore);
    for (const event of sortedByPriority) {
      if (remaining <= 0) break;
      const current = allocation.get(event.clipIndex) || 1;
      allocation.set(event.clipIndex, current + 1);
      remaining--;
    }

    console.log(`💰 Frame budget allocated: ${totalBudget} attempts across ${allocation.size} clips`);
    return allocation;
  }

  /**
   * Get surprise-enhanced feedback for a package
   * Loads data and generates actionable insights for quality improvement
   */
  async getSurpriseEnhancedFeedback(
    packageId: string,
    tnas: TNAData[],
    clipReports: ClipReport[],
    librosaData: LibrosaData,
  ): Promise<SurpriseEnhancedFeedback> {
    console.log(`📦 Generating surprise-enhanced feedback for package ${packageId}...`);

    // Run surprise analysis
    const analysis = this.analyzeBayesianSurprise(tnas, clipReports, librosaData);

    // Store for pattern learning
    this.surpriseHistory.set(packageId, analysis);

    // Generate actionable insights
    const actionableInsights: SurpriseEnhancedFeedback['actionableInsights'] = [];

    for (const event of analysis.events) {
      const quality = clipReports.find((r) => r.clipIndex === event.clipIndex)?.qualityScore ?? 50;
      const retryPriority = analysis.retryPriorities.get(event.clipIndex) ?? 5;

      let priority: 'critical' | 'high' | 'medium' | 'low';
      let suggestedAction: string;

      if (retryPriority >= 9) {
        priority = 'critical';
        suggestedAction = 'Immediate regeneration required - this is a key narrative moment';
      } else if (retryPriority >= 7) {
        priority = 'high';
        suggestedAction = 'Regenerate with enhanced prompt - high viewer impact';
      } else if (retryPriority >= 4) {
        priority = 'medium';
        suggestedAction = 'Consider regeneration if budget allows';
      } else {
        priority = 'low';
        suggestedAction = "Acceptable quality for this moment's narrative importance";
      }

      // Build insight based on event type
      let insight: string;
      switch (event.type) {
        case 'emotional':
          insight = `Emotional ${event.surpriseScore >= 70 ? 'peak' : 'shift'} - viewers expect visual intensity. Current quality: ${quality}/100`;
          break;
        case 'narrative':
          insight = `${event.clipIndex < 3 ? 'Opening hook' : 'Key story beat'} - critical for ${event.clipIndex < 3 ? 'retention' : 'engagement'}. Quality: ${quality}/100`;
          break;
        case 'visual':
          insight = `High energy moment - audio demands matching visual impact. Quality: ${quality}/100`;
          break;
        case 'technical':
          insight = `Transition point - smooth visual flow needed. Quality: ${quality}/100`;
          break;
      }

      actionableInsights.push({
        clipIndex: event.clipIndex,
        insight,
        priority,
        suggestedAction,
      });
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    actionableInsights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Calculate budget allocation
    const totalBudget = Math.max(clipReports.length, analysis.events.length * 2);
    const budgetAllocation = this.reallocateFrameBudget(analysis, totalBudget);

    // Generate summary
    const criticalCount = actionableInsights.filter((i) => i.priority === 'critical').length;
    const highCount = actionableInsights.filter((i) => i.priority === 'high').length;

    const summary =
      criticalCount > 0
        ? `⚠️ ${criticalCount} CRITICAL clips need regeneration for narrative impact. ${highCount} additional high-priority improvements available.`
        : highCount > 0
          ? `📈 ${highCount} high-priority clips can be improved. All critical moments have acceptable quality.`
          : `✅ All narrative moments have acceptable quality. Focus on optimization rather than regeneration.`;

    console.log(`✅ Feedback generated: ${criticalCount} critical, ${highCount} high priority`);

    return {
      packageId,
      analysis,
      actionableInsights,
      budgetAllocation,
      summary,
    };
  }

  /**
   * Get stored surprise analysis for a package
   */
  getSurpriseAnalysis(packageId: string): BayesianSurpriseAnalysis | undefined {
    return this.surpriseHistory.get(packageId);
  }

  /**
   * Store surprise data for pattern learning
   */
  recordSurpriseOutcome(packageId: string, clipIndex: number, wasSuccessful: boolean, viewerRetention: number): void {
    const analysis = this.surpriseHistory.get(packageId);
    if (!analysis) return;

    const event = analysis.events.find((e) => e.clipIndex === clipIndex);
    if (!event) return;

    // Log for future pattern learning
    console.log(
      `📊 Surprise outcome: Clip ${clipIndex} (surprise: ${event.surpriseScore}) - ${wasSuccessful ? 'SUCCESS' : 'FAILED'}, retention: ${viewerRetention}%`,
    );
  }

  /**
   * Get analytics on surprise prediction accuracy
   */
  getAccuracyStats(): {
    totalPredictions: number;
    highSurpriseClips: number;
    avgSurpriseScore: number;
  } {
    let totalPredictions = 0;
    let highSurpriseClips = 0;
    let totalSurprise = 0;

    for (const analysis of this.surpriseHistory.values()) {
      totalPredictions += analysis.events.length;
      highSurpriseClips += analysis.highImpactMoments.length;
      totalSurprise += analysis.totalSurprise;
    }

    return {
      totalPredictions,
      highSurpriseClips,
      avgSurpriseScore: totalPredictions > 0 ? totalSurprise / totalPredictions : 0,
    };
  }
}

// Create singleton instance and initialize from database
const patternIntelligenceServiceInstance = new PatternIntelligenceService();
const bayesianSurpriseAnalyzerInstance = new BayesianSurpriseAnalyzer();

// Initialize on module load (non-blocking)
patternIntelligenceServiceInstance.init().catch((err) => {
  console.error('⚠️ PatternIntelligenceService initialization failed:', err.message);
});

export const patternIntelligenceService = patternIntelligenceServiceInstance;
export const bayesianSurpriseAnalyzer = bayesianSurpriseAnalyzerInstance;
