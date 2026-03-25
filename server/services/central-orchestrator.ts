/**
 * CENTRAL ORCHESTRATOR SERVICE (Hook Switching Monitor)
 *
 * The brain connecting ALL analytics services for automatic
 * title/thumbnail optimization based on real-time performance.
 *
 * Uses YOUR channel's historical performance to set dynamic thresholds,
 * not arbitrary industry numbers.
 *
 * Features:
 * - Dynamic thresholds based on YOUR channel performance (p25, p50, p75, p90)
 * - Real-time monitoring of fresh uploads
 * - Automatic thumbnail/title swap on underperformance
 * - Multi-variant testing (A/B/C)
 * - Performance logging for Thompson Sampling feedback
 * - Integration with all 5 analytics services
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

import { characterFigureBandit } from './character-figure-bandit';
import { promptQualityScoring } from './prompt-quality-scoring';
import { commentSentimentLoop } from './comment-sentiment-loop';
import { descriptionTagsOptimizer } from './description-tags-optimizer';
import { featureCorrelationAnalyzer } from './feature-correlation-analyzer';
import { systemHealthMonitor } from './system-health-monitor';

export enum VideoState {
  PENDING = 'pending',
  MONITORING = 'monitoring',
  SWAPPED_ONCE = 'swapped_1',
  SWAPPED_TWICE = 'swapped_2',
  LOCKED_WINNER = 'locked',
  LOCKED_LOSER = 'locked_low',
  EXPIRED = 'expired',
}

export interface VideoVariant {
  variantId: string;
  title: string;
  description: string;
  thumbnailPath: string;
  tags: string[];
}

export interface PerformanceSnapshot {
  timestamp: string;
  minutesSinceUpload: number;
  views: number;
  impressions: number;
  ctr: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  likes: number;
  comments: number;
  currentVariant: string;
}

export interface MonitoredVideo {
  videoId: string;
  uploadTime: string;
  currentVariant: string;
  state: VideoState;
  variants: Record<string, VideoVariant>;
  snapshots: PerformanceSnapshot[];
  swapLog: Array<{
    timestamp: string;
    fromVariant: string;
    toVariant: string;
    reason: string;
    performanceAtSwap: {
      views: number;
      impressions: number;
      ctr: number;
    };
  }>;
  variantPerformance: Record<
    string,
    {
      views: number[];
      ctr: number[];
      impressions: number[];
      avgRetention: number;
    }
  >;
  theme: string;
  character: string;
  contentType: 'short' | 'long';
}

export interface SwapNotification {
  videoId: string;
  timestamp: string;
  fromVariant: string;
  toVariant: string;
  oldTitle: string;
  newTitle: string;
  reason: string;
  performanceBefore: {
    views: number;
    impressions: number;
    ctr: number;
  };
  character: string;
  theme: string;
}

export interface DailyDigest {
  date: string;
  totalVideosMonitored: number;
  swapsToday: number;
  lockedWinners: number;
  lockedLosers: number;
  bestPerformer: {
    videoId: string;
    character: string;
    winningVariant: string;
    improvementPercent: number;
  } | null;
  worstPerformer: {
    videoId: string;
    character: string;
    variantsExhausted: boolean;
  } | null;
  swapVelocity: SwapVelocityMetrics;
}

export interface SwapVelocityMetrics {
  avgSwapsPerVideo: number;
  videosNeverSwapped: number;
  videosSwappedOnce: number;
  videosSwappedTwice: number;
  variantAWinRate: number;
  variantBWinRate: number;
  variantCWinRate: number;
  recommendation: 'variant_a_needs_work' | 'dialed_in' | 'too_aggressive' | 'insufficient_data';
  explanation: string;
}

export interface ChannelBaselines {
  avgViews1h: number;
  avgViews6h: number;
  avgViews24h: number;
  views1hP25: number;
  views1hP50: number;
  views1hP75: number;
  views1hP90: number;
  avgCtr: number;
  ctrP25: number;
  ctrP50: number;
  ctrP75: number;
  ctrP90: number;
  avgRetention: number;
  retentionP25: number;
  retentionP50: number;
  retentionP75: number;
  avgImpressions1h: number;
  impressions1hP25: number;
  impressions1hP50: number;
  impressions1hP75: number;
  videosAnalyzed: number;
  lastCalculated: string;
}

interface OrchestratorConfig {
  initialCheckMinutes: number;
  secondCheckMinutes: number;
  finalCheckMinutes: number;
  monitoringWindowHours: number;
  swapTriggerPercentile: number;
  lockWinnerPercentile: number;
  minImpressionsForDecision: number;
  maxSwapsPerVideo: number;
  pollIntervalSeconds: number;
}

interface SwapReport {
  totalVideosMonitored: number;
  videosByState: Record<string, number>;
  totalSwaps: number;
  swapImprovements: Array<{
    videoId: string;
    from: string;
    to: string;
    viewsBefore: number;
    viewsAfter: number;
    improvement: number;
  }>;
  variantPerformance: Record<
    string,
    {
      uses: number;
      avgViews: number;
      wins: number;
    }
  >;
}

interface ServiceInsights {
  characterBandit: {
    recommendedProfile: Record<string, string> | null;
    topCharacters: Array<{ name: string; viewsPerUse: number }>;
  };
  promptQuality: {
    avgQualityScore: number;
    topPatterns: Array<{ pattern: string; successRate: number }>;
  };
  commentSentiment: {
    avgSentiment: number;
    topEmotion: string | null;
    topRequest: string | null;
  };
  descriptionTags: {
    topTag: { tag: string; searchScore: number } | null;
    avgSearchTraffic: number;
  };
  featureCorrelation: {
    topFeature: string | null;
    directive: string | null;
  };
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  initialCheckMinutes: 60,
  secondCheckMinutes: 180,
  finalCheckMinutes: 360,
  monitoringWindowHours: 12,
  swapTriggerPercentile: 25,
  lockWinnerPercentile: 75,
  minImpressionsForDecision: 500,
  maxSwapsPerVideo: 2,
  pollIntervalSeconds: 300,
};

const DEFAULT_BASELINES: ChannelBaselines = {
  avgViews1h: 0,
  avgViews6h: 0,
  avgViews24h: 0,
  views1hP25: 0,
  views1hP50: 0,
  views1hP75: 0,
  views1hP90: 0,
  avgCtr: 0,
  ctrP25: 0,
  ctrP50: 0,
  ctrP75: 0,
  ctrP90: 0,
  avgRetention: 0,
  retentionP25: 0,
  retentionP50: 0,
  retentionP75: 0,
  avgImpressions1h: 0,
  impressions1hP25: 0,
  impressions1hP50: 0,
  impressions1hP75: 0,
  videosAnalyzed: 0,
  lastCalculated: '',
};

class CentralOrchestrator {
  private statePath: string;
  private baselinesPath: string;
  private monitoredVideos: Map<string, MonitoredVideo> = new Map();
  private baselines: ChannelBaselines = { ...DEFAULT_BASELINES };
  private config: OrchestratorConfig = { ...DEFAULT_CONFIG };
  private monitorInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  private onSwapCallback: ((videoId: string, fromVariant: string, toVariant: string) => Promise<boolean>) | null = null;
  private onFetchPerformance: ((videoId: string) => Promise<PerformanceSnapshot | null>) | null = null;
  private onSwapNotification: ((notification: SwapNotification) => void) | null = null;
  private swapHistory: SwapNotification[] = [];

  constructor() {
    this.statePath = join(process.cwd(), 'data', 'orchestrator-state.json');
    this.baselinesPath = join(process.cwd(), 'data', 'channel-baselines.json');
    this.loadState();
    this.loadBaselines();
    console.log(`🎯 Central Orchestrator: Loaded ${this.monitoredVideos.size} monitored videos`);
  }

  setSwapCallback(callback: (videoId: string, fromVariant: string, toVariant: string) => Promise<boolean>): void {
    this.onSwapCallback = callback;
  }

  setFetchPerformanceCallback(callback: (videoId: string) => Promise<PerformanceSnapshot | null>): void {
    this.onFetchPerformance = callback;
  }

  setSwapNotificationCallback(callback: (notification: SwapNotification) => void): void {
    this.onSwapNotification = callback;
    console.log('🎯 Central Orchestrator: Swap notification callback registered');
  }

  updateConfig(updates: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveState();
    console.log('🎯 Central Orchestrator: Config updated');
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  calculateChannelBaselines(
    historicalData: Array<{
      videoId: string;
      views1h?: number;
      views6h?: number;
      views24h?: number;
      ctr?: number;
      retention?: number;
      impressions1h?: number;
    }>,
  ): ChannelBaselines {
    if (!historicalData.length) {
      console.log('🎯 Central Orchestrator: No historical data for baselines');
      return this.baselines;
    }

    const views1h = historicalData.filter((v) => v.views1h != null).map((v) => v.views1h!);
    const views6h = historicalData.filter((v) => v.views6h != null).map((v) => v.views6h!);
    const views24h = historicalData.filter((v) => v.views24h != null).map((v) => v.views24h!);
    const ctrs = historicalData.filter((v) => v.ctr != null).map((v) => v.ctr!);
    const retentions = historicalData.filter((v) => v.retention != null).map((v) => v.retention!);
    const impressions1h = historicalData.filter((v) => v.impressions1h != null).map((v) => v.impressions1h!);

    const percentile = (arr: number[], p: number): number => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.min(Math.floor((sorted.length * p) / 100), sorted.length - 1);
      return sorted[idx];
    };

    const mean = (arr: number[]): number => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    this.baselines = {
      avgViews1h: mean(views1h),
      avgViews6h: mean(views6h),
      avgViews24h: mean(views24h),
      views1hP25: percentile(views1h, 25),
      views1hP50: percentile(views1h, 50),
      views1hP75: percentile(views1h, 75),
      views1hP90: percentile(views1h, 90),
      avgCtr: mean(ctrs),
      ctrP25: percentile(ctrs, 25),
      ctrP50: percentile(ctrs, 50),
      ctrP75: percentile(ctrs, 75),
      ctrP90: percentile(ctrs, 90),
      avgRetention: mean(retentions),
      retentionP25: percentile(retentions, 25),
      retentionP50: percentile(retentions, 50),
      retentionP75: percentile(retentions, 75),
      avgImpressions1h: mean(impressions1h),
      impressions1hP25: percentile(impressions1h, 25),
      impressions1hP50: percentile(impressions1h, 50),
      impressions1hP75: percentile(impressions1h, 75),
      videosAnalyzed: historicalData.length,
      lastCalculated: new Date().toISOString(),
    };

    this.saveBaselines();

    console.log(`🎯 Central Orchestrator: Calculated baselines from ${historicalData.length} videos`);
    console.log(
      `   Views 1h: p25=${this.baselines.views1hP25.toFixed(0)}, p50=${this.baselines.views1hP50.toFixed(0)}, p75=${this.baselines.views1hP75.toFixed(0)}`,
    );
    console.log(
      `   CTR: p25=${(this.baselines.ctrP25 * 100).toFixed(1)}%, p50=${(this.baselines.ctrP50 * 100).toFixed(1)}%, p75=${(this.baselines.ctrP75 * 100).toFixed(1)}%`,
    );

    return this.baselines;
  }

  getBaselines(): ChannelBaselines {
    return { ...this.baselines };
  }

  registerUpload(
    videoId: string,
    variants: Record<
      string,
      {
        title: string;
        description: string;
        thumbnailPath: string;
        tags?: string[];
      }
    >,
    options?: {
      theme?: string;
      character?: string;
      contentType?: 'short' | 'long';
    },
  ): MonitoredVideo {
    const variantObjects: Record<string, VideoVariant> = {};
    for (const [variantId, data] of Object.entries(variants)) {
      variantObjects[variantId] = {
        variantId,
        title: data.title,
        description: data.description,
        thumbnailPath: data.thumbnailPath,
        tags: data.tags || [],
      };
    }

    const video: MonitoredVideo = {
      videoId,
      uploadTime: new Date().toISOString(),
      currentVariant: 'A',
      state: VideoState.PENDING,
      variants: variantObjects,
      snapshots: [],
      swapLog: [],
      variantPerformance: {},
      theme: options?.theme || '',
      character: options?.character || '',
      contentType: options?.contentType || 'short',
    };

    this.monitoredVideos.set(videoId, video);
    this.saveState();

    console.log(`🎯 Central Orchestrator: Registered video ${videoId} with ${Object.keys(variants).length} variants`);

    if (video.character) {
      characterFigureBandit.selectCharacterProfile();
    }

    return video;
  }

  /**
   * Alias for registerUpload - used by Unity orchestrator
   */
  registerVideo(
    videoId: string,
    variants: Record<
      string,
      {
        title: string;
        description: string;
        thumbnailPath: string;
        tags?: string[];
      }
    >,
    options?: {
      theme?: string;
      character?: string;
      contentType?: 'short' | 'long';
    },
  ): MonitoredVideo {
    return this.registerUpload(videoId, variants, options);
  }

  async checkVideoPerformance(videoId: string): Promise<PerformanceSnapshot | null> {
    const video = this.monitoredVideos.get(videoId);
    if (!video) {
      console.warn(`🎯 Central Orchestrator: Video ${videoId} not registered`);
      return null;
    }

    if (!this.onFetchPerformance) {
      console.warn('🎯 Central Orchestrator: No performance fetch callback set');
      return null;
    }

    try {
      const snapshot = await this.onFetchPerformance(videoId);
      if (!snapshot) return null;

      const uploadTime = new Date(video.uploadTime);
      snapshot.minutesSinceUpload = Math.floor((Date.now() - uploadTime.getTime()) / 60000);
      snapshot.currentVariant = video.currentVariant;

      video.snapshots.push(snapshot);
      // Cap snapshots to prevent memory growth
      if (video.snapshots.length > 100) {
        video.snapshots = video.snapshots.slice(-100);
      }

      if (!video.variantPerformance[video.currentVariant]) {
        video.variantPerformance[video.currentVariant] = {
          views: [],
          ctr: [],
          impressions: [],
          avgRetention: 0,
        };
      }

      const varPerf = video.variantPerformance[video.currentVariant];
      varPerf.views.push(snapshot.views);
      varPerf.ctr.push(snapshot.ctr);
      varPerf.impressions.push(snapshot.impressions);
      if (snapshot.avgViewPercentage > 0) {
        const count = varPerf.views.length;
        varPerf.avgRetention = (varPerf.avgRetention * (count - 1) + snapshot.avgViewPercentage) / count;
      }

      this.saveState();
      return snapshot;
    } catch (error) {
      console.error(`🎯 Central Orchestrator: Error fetching performance for ${videoId}:`, error);
      return null;
    }
  }

  addPerformanceSnapshot(
    videoId: string,
    data: {
      views: number;
      impressions: number;
      ctr: number;
      avgViewDuration?: number;
      avgViewPercentage?: number;
      likes?: number;
      comments?: number;
    },
  ): PerformanceSnapshot | null {
    const video = this.monitoredVideos.get(videoId);
    if (!video) {
      console.warn(`🎯 Central Orchestrator: Video ${videoId} not registered`);
      return null;
    }

    const uploadTime = new Date(video.uploadTime);
    const minutesSinceUpload = Math.floor((Date.now() - uploadTime.getTime()) / 60000);

    const snapshot: PerformanceSnapshot = {
      timestamp: new Date().toISOString(),
      minutesSinceUpload,
      views: data.views,
      impressions: data.impressions,
      ctr: data.ctr,
      avgViewDuration: data.avgViewDuration || 0,
      avgViewPercentage: data.avgViewPercentage || 0,
      likes: data.likes || 0,
      comments: data.comments || 0,
      currentVariant: video.currentVariant,
    };

    video.snapshots.push(snapshot);
    // Cap snapshots to prevent memory growth
    if (video.snapshots.length > 100) {
      video.snapshots = video.snapshots.slice(-100);
    }

    if (!video.variantPerformance[video.currentVariant]) {
      video.variantPerformance[video.currentVariant] = {
        views: [],
        ctr: [],
        impressions: [],
        avgRetention: 0,
      };
    }

    const varPerf = video.variantPerformance[video.currentVariant];
    varPerf.views.push(snapshot.views);
    varPerf.ctr.push(snapshot.ctr);
    varPerf.impressions.push(snapshot.impressions);
    if (snapshot.avgViewPercentage > 0) {
      const count = varPerf.views.length;
      varPerf.avgRetention = (varPerf.avgRetention * (count - 1) + snapshot.avgViewPercentage) / count;
    }

    this.saveState();
    console.log(
      `🎯 Central Orchestrator: Added snapshot for ${videoId} - views=${data.views}, CTR=${(data.ctr * 100).toFixed(1)}%`,
    );
    return snapshot;
  }

  evaluateAndAct(videoId: string): {
    action: 'none' | 'swap' | 'lock_winner' | 'lock_loser' | 'expired' | 'wait';
    reason: string;
    details?: Record<string, any>;
  } {
    const video = this.monitoredVideos.get(videoId);
    if (!video) {
      return { action: 'none', reason: 'Video not registered' };
    }

    const uploadTime = new Date(video.uploadTime);
    const minutesSinceUpload = Math.floor((Date.now() - uploadTime.getTime()) / 60000);
    const hoursSinceUpload = minutesSinceUpload / 60;

    if (hoursSinceUpload > this.config.monitoringWindowHours) {
      if (
        video.state !== VideoState.EXPIRED &&
        video.state !== VideoState.LOCKED_WINNER &&
        video.state !== VideoState.LOCKED_LOSER
      ) {
        video.state = VideoState.EXPIRED;
        this.saveState();
      }
      return { action: 'expired', reason: 'Past monitoring window' };
    }

    if (video.state === VideoState.LOCKED_WINNER || video.state === VideoState.LOCKED_LOSER) {
      return { action: 'none', reason: `Video already ${video.state}` };
    }

    if (video.snapshots.length === 0) {
      return { action: 'wait', reason: 'No performance data yet' };
    }

    const latestSnapshot = video.snapshots[video.snapshots.length - 1];

    // ═══════════════════════════════════════════════════════════════════════
    // TWO-TIER DECISION LOGIC
    // ═══════════════════════════════════════════════════════════════════════
    // Tier 1 (0-60 min): Views-only decisions - YouTube Analytics not yet available
    // Tier 2 (48h+): Full CTR/impressions-based decisions when analytics mature
    // ═══════════════════════════════════════════════════════════════════════

    const analyticsAvailable = latestSnapshot.impressions >= this.config.minImpressionsForDecision;
    const isEarlyWindow = minutesSinceUpload <= 60;

    // TIER 1: Early views-only decision (0-60 min)
    // If views are WAY below threshold, swap immediately without waiting for analytics
    if (isEarlyWindow && !analyticsAvailable) {
      const viewsThreshold = this.baselines.views1hP25;
      const severeUnderperformance = viewsThreshold > 0 && latestSnapshot.views < viewsThreshold * 0.5;

      if (severeUnderperformance) {
        console.log(
          `🎯 TIER 1 Decision: Views ${latestSnapshot.views} < ${Math.floor(viewsThreshold * 0.5)} (50% of p25) - swapping early`,
        );

        const swapCount = video.swapLog.length;
        if (swapCount >= this.config.maxSwapsPerVideo) {
          video.state = VideoState.LOCKED_LOSER;
          this.saveState();
          return {
            action: 'lock_loser',
            reason: 'Tier 1: Max swaps reached, severe underperformance',
            details: { swapCount, maxSwaps: this.config.maxSwapsPerVideo, tier: 1 },
          };
        }

        const availableVariants = Object.keys(video.variants).filter((v) => v !== video.currentVariant);
        if (availableVariants.length === 0) {
          video.state = VideoState.LOCKED_LOSER;
          this.saveState();
          return { action: 'lock_loser', reason: 'Tier 1: No more variants to try' };
        }

        const nextVariant = this.selectBestVariant(video, availableVariants);

        if (video.state === VideoState.PENDING) {
          video.state = VideoState.MONITORING;
        }

        return {
          action: 'swap',
          reason: 'Tier 1: Views severely below threshold (analytics not yet available)',
          details: {
            tier: 1,
            fromVariant: video.currentVariant,
            toVariant: nextVariant,
            views: latestSnapshot.views,
            viewsThreshold: viewsThreshold * 0.5,
            minutesSinceUpload,
          },
        };
      }

      // Views not critically low but no analytics yet - wait
      return {
        action: 'wait',
        reason: `Tier 1: Waiting for analytics (views ${latestSnapshot.views} acceptable, impressions ${latestSnapshot.impressions}/${this.config.minImpressionsForDecision})`,
        details: { tier: 1, minutesSinceUpload },
      };
    }

    // TIER 1.5: Extended fallback for analytics-lag scenarios (60-360 min without analytics)
    // Prevents videos from getting stuck in wait mode when YouTube is slow to release data
    if (!analyticsAvailable) {
      const viewsThreshold = this.baselines.views1hP25;

      // After 180 min (3 hours) without analytics - use 70% threshold for views-only decision
      if (minutesSinceUpload >= 180) {
        const moderateUnderperformance = viewsThreshold > 0 && latestSnapshot.views < viewsThreshold * 0.7;

        if (moderateUnderperformance) {
          console.log(
            `🎯 TIER 1.5 Fallback: Views ${latestSnapshot.views} < ${Math.floor(viewsThreshold * 0.7)} (70% of p25) after 3h without analytics - swapping`,
          );

          const swapCount = video.swapLog.length;
          if (swapCount >= this.config.maxSwapsPerVideo) {
            video.state = VideoState.LOCKED_LOSER;
            this.saveState();
            return {
              action: 'lock_loser',
              reason: 'Tier 1.5: Max swaps reached, analytics-lag underperformance',
              details: { swapCount, maxSwaps: this.config.maxSwapsPerVideo, tier: 1.5 },
            };
          }

          const availableVariants = Object.keys(video.variants).filter((v) => v !== video.currentVariant);
          if (availableVariants.length === 0) {
            video.state = VideoState.LOCKED_LOSER;
            this.saveState();
            return { action: 'lock_loser', reason: 'Tier 1.5: No more variants to try' };
          }

          const nextVariant = this.selectBestVariant(video, availableVariants);

          if (video.state === VideoState.PENDING) {
            video.state = VideoState.MONITORING;
          }

          return {
            action: 'swap',
            reason: 'Tier 1.5: Views below 70% threshold (analytics delayed beyond 3h)',
            details: {
              tier: 1.5,
              fromVariant: video.currentVariant,
              toVariant: nextVariant,
              views: latestSnapshot.views,
              viewsThreshold: viewsThreshold * 0.7,
              minutesSinceUpload,
              analyticsDelay: true,
            },
          };
        }
      }

      // After 360 min (6 hours) without analytics - force decision based on 85% threshold
      if (minutesSinceUpload >= 360) {
        const mildUnderperformance = viewsThreshold > 0 && latestSnapshot.views < viewsThreshold * 0.85;

        if (mildUnderperformance) {
          console.log(
            `🎯 TIER 1.5 Force: Views ${latestSnapshot.views} < ${Math.floor(viewsThreshold * 0.85)} (85% of p25) after 6h - forcing swap`,
          );

          const swapCount = video.swapLog.length;
          if (swapCount >= this.config.maxSwapsPerVideo) {
            video.state = VideoState.LOCKED_LOSER;
            this.saveState();
            return {
              action: 'lock_loser',
              reason: 'Tier 1.5 Force: Max swaps reached after 6h analytics delay',
              details: { swapCount, maxSwaps: this.config.maxSwapsPerVideo, tier: 1.5 },
            };
          }

          const availableVariants = Object.keys(video.variants).filter((v) => v !== video.currentVariant);
          if (availableVariants.length === 0) {
            video.state = VideoState.LOCKED_LOSER;
            this.saveState();
            return { action: 'lock_loser', reason: 'Tier 1.5 Force: No more variants' };
          }

          const nextVariant = this.selectBestVariant(video, availableVariants);

          if (video.state === VideoState.PENDING) {
            video.state = VideoState.MONITORING;
          }

          return {
            action: 'swap',
            reason: 'Tier 1.5 Force: Analytics delayed 6h+, swapping on 85% views threshold',
            details: {
              tier: 1.5,
              fromVariant: video.currentVariant,
              toVariant: nextVariant,
              views: latestSnapshot.views,
              viewsThreshold: viewsThreshold * 0.85,
              minutesSinceUpload,
              analyticsDelay: true,
              forceSwap: true,
            },
          };
        }
      }

      // Still waiting for analytics but views are acceptable
      if (viewsThreshold > 0 && latestSnapshot.views < viewsThreshold * 0.7) {
        console.log(
          `🎯 Extended wait: Views ${latestSnapshot.views} below 70% of p25, waiting for analytics (${minutesSinceUpload}min)`,
        );
      }
      return {
        action: 'wait',
        reason: `Waiting for full analytics (impressions ${latestSnapshot.impressions}/${this.config.minImpressionsForDecision}, ${minutesSinceUpload}min elapsed)`,
        details: { minutesSinceUpload, tier: 1.5 },
      };
    }

    // ═══════════════════════════════════════════════════════════════════════
    // TIER 2: Full analytics-based decisions (impressions >= 500)
    // ═══════════════════════════════════════════════════════════════════════
    console.log(
      `🎯 TIER 2 Decision: Full analytics available (impressions: ${latestSnapshot.impressions}, CTR: ${(latestSnapshot.ctr * 100).toFixed(1)}%)`,
    );

    if (video.state === VideoState.PENDING) {
      video.state = VideoState.MONITORING;
    }

    const isUnderperforming = this.isUnderperformingTier2(latestSnapshot);
    const isWinning = this.isWinningTier2(latestSnapshot);

    if (isWinning) {
      video.state = VideoState.LOCKED_WINNER;
      this.saveState();
      return {
        action: 'lock_winner',
        reason: 'Performance above p75 threshold',
        details: {
          views: latestSnapshot.views,
          viewsThreshold: this.baselines.views1hP75,
          ctr: latestSnapshot.ctr,
          ctrThreshold: this.baselines.ctrP75,
        },
      };
    }

    if (isUnderperforming) {
      const swapCount = video.swapLog.length;

      if (swapCount >= this.config.maxSwapsPerVideo) {
        video.state = VideoState.LOCKED_LOSER;
        this.saveState();
        return {
          action: 'lock_loser',
          reason: 'Max swaps reached, still underperforming',
          details: { swapCount, maxSwaps: this.config.maxSwapsPerVideo },
        };
      }

      const availableVariants = Object.keys(video.variants).filter((v) => v !== video.currentVariant);
      if (availableVariants.length === 0) {
        video.state = VideoState.LOCKED_LOSER;
        this.saveState();
        return { action: 'lock_loser', reason: 'No more variants to try' };
      }

      const nextVariant = this.selectBestVariant(video, availableVariants);

      return {
        action: 'swap',
        reason: 'Tier 2: CTR/impressions below p25 threshold',
        details: {
          tier: 2,
          fromVariant: video.currentVariant,
          toVariant: nextVariant,
          views: latestSnapshot.views,
          viewsThreshold: this.baselines.views1hP25,
          ctr: latestSnapshot.ctr,
          ctrThreshold: this.baselines.ctrP25,
          impressions: latestSnapshot.impressions,
        },
      };
    }

    return { action: 'none', reason: 'Tier 2: Performance within acceptable range', details: { tier: 2 } };
  }

  async executeSwap(videoId: string, toVariant: string, skipCallback: boolean = false): Promise<boolean> {
    const video = this.monitoredVideos.get(videoId);
    if (!video) return false;

    const fromVariant = video.currentVariant;
    const latestSnapshot = video.snapshots[video.snapshots.length - 1];

    // If skipCallback is true, just update internal state (Unity orchestrator will handle YouTube API)
    // If skipCallback is false, use the callback to execute the swap (for standalone use)
    if (!skipCallback) {
      if (!this.onSwapCallback) {
        console.warn('🎯 Central Orchestrator: No swap callback set');
        return false;
      }

      try {
        const success = await this.onSwapCallback(videoId, fromVariant, toVariant);
        if (!success) return false;
      } catch (error) {
        console.error(`🎯 Central Orchestrator: Swap callback failed for ${videoId}:`, error);
        return false;
      }
    }

    // Update internal state
    video.swapLog.push({
      timestamp: new Date().toISOString(),
      fromVariant,
      toVariant,
      reason: 'Underperforming',
      performanceAtSwap: {
        views: latestSnapshot?.views || 0,
        impressions: latestSnapshot?.impressions || 0,
        ctr: latestSnapshot?.ctr || 0,
      },
    });

    video.currentVariant = toVariant;

    if (video.swapLog.length >= 2) {
      video.state = VideoState.SWAPPED_TWICE;
    } else {
      video.state = VideoState.SWAPPED_ONCE;
    }

    this.saveState();
    console.log(`🎯 Central Orchestrator: Swapped ${videoId} from ${fromVariant} to ${toVariant}`);
    this.recordSwapFeedback(video, fromVariant, false);

    // Fire swap notification callback for real-time dashboard updates
    if (this.onSwapNotification) {
      const notification: SwapNotification = {
        videoId,
        timestamp: new Date().toISOString(),
        fromVariant,
        toVariant,
        oldTitle: video.variants[fromVariant]?.title || 'Unknown',
        newTitle: video.variants[toVariant]?.title || 'Unknown',
        reason: 'Underperforming - below p25 threshold',
        performanceBefore: {
          views: latestSnapshot?.views || 0,
          impressions: latestSnapshot?.impressions || 0,
          ctr: latestSnapshot?.ctr || 0,
        },
        character: video.character,
        theme: video.theme,
      };
      this.swapHistory.push(notification);
      // Cap swap history to prevent memory growth
      if (this.swapHistory.length > 500) {
        this.swapHistory = this.swapHistory.slice(-500);
      }
      this.onSwapNotification(notification);
    }

    return true;
  }

  private isUnderperformingTier2(snapshot: PerformanceSnapshot): boolean {
    const ctrThreshold = this.baselines.ctrP25;
    const viewsThreshold = this.baselines.views1hP25;

    if (ctrThreshold === 0 && viewsThreshold === 0) {
      return false;
    }

    // Tier 2 prioritizes CTR when impressions are high (packaging problem indicator)
    const highImpressions = snapshot.impressions >= 1000;
    const lowCtr = ctrThreshold > 0 && snapshot.ctr < ctrThreshold;

    // High impressions + low CTR = packaging problem - definitely swap
    if (highImpressions && lowCtr) {
      return true;
    }

    // Low views still matters as a secondary signal
    const viewsUnder = viewsThreshold > 0 && snapshot.views < viewsThreshold;

    // Both views and CTR below threshold
    return viewsUnder && lowCtr;
  }

  private isWinningTier2(snapshot: PerformanceSnapshot): boolean {
    const viewsThreshold = this.baselines.views1hP75;
    const ctrThreshold = this.baselines.ctrP75;

    if (viewsThreshold === 0 && ctrThreshold === 0) {
      return false;
    }

    const viewsAbove = viewsThreshold > 0 && snapshot.views >= viewsThreshold;
    const ctrAbove = ctrThreshold > 0 && snapshot.ctr >= ctrThreshold;

    // Need both metrics above p75 to lock as winner
    return viewsAbove && ctrAbove;
  }

  private selectBestVariant(video: MonitoredVideo, availableVariants: string[]): string {
    if (availableVariants.length === 1) {
      return availableVariants[0];
    }

    const variantScores: Array<{ variant: string; score: number }> = [];

    for (const variant of availableVariants) {
      let score = 0.5;

      const perf = video.variantPerformance[variant];
      if (perf && perf.views.length > 0) {
        const avgViews = perf.views.reduce((a, b) => a + b, 0) / perf.views.length;
        const avgCtr = perf.ctr.reduce((a, b) => a + b, 0) / perf.ctr.length;
        score =
          (avgViews / Math.max(this.baselines.views1hP50, 1)) * 0.5 +
          (avgCtr / Math.max(this.baselines.ctrP50, 0.01)) * 0.5;
      }

      score += Math.random() * 0.2;

      variantScores.push({ variant, score });
    }

    variantScores.sort((a, b) => b.score - a.score);
    return variantScores[0].variant;
  }

  private recordSwapFeedback(video: MonitoredVideo, failedVariant: string, wasSuccess: boolean): void {
    if (video.character) {
      const attributes = this.inferCharacterAttributes(video.character);
      const performance = video.variantPerformance[failedVariant];

      characterFigureBandit.recordResult(
        video.character,
        attributes,
        performance?.views.length ? performance.views[performance.views.length - 1] : 0,
        performance?.avgRetention || 0.3,
        performance?.ctr.length ? performance.ctr[performance.ctr.length - 1] : 0,
        video.videoId,
      );
    }
  }

  private inferCharacterAttributes(character: string): Record<string, string> {
    const charLower = character.toLowerCase();
    const attributes: Record<string, string> = {};

    const genderMap: Record<string, string> = {
      cleopatra: 'female',
      joan: 'female',
      marie: 'female',
      elizabeth: 'female',
      caesar: 'male',
      napoleon: 'male',
      alexander: 'male',
      genghis: 'male',
    };

    const eraMap: Record<string, string> = {
      caesar: 'ancient',
      cleopatra: 'ancient',
      alexander: 'ancient',
      spartacus: 'ancient',
      genghis: 'medieval',
      joan: 'medieval',
      saladin: 'medieval',
      napoleon: 'early_modern',
      washington: 'early_modern',
      tesla: 'modern',
      einstein: 'modern',
      churchill: 'contemporary',
    };

    for (const [key, value] of Object.entries(genderMap)) {
      if (charLower.includes(key)) {
        attributes.gender = value;
        break;
      }
    }

    for (const [key, value] of Object.entries(eraMap)) {
      if (charLower.includes(key)) {
        attributes.era = value;
        break;
      }
    }

    return attributes;
  }

  gatherServiceInsights(): ServiceInsights {
    const charProfile = characterFigureBandit.selectCharacterProfile();
    const topChars = characterFigureBandit.getTopCharacters(5);

    const promptStats = promptQualityScoring.getStats();
    const promptPatterns = promptQualityScoring.getPatternRankings().slice(0, 3);

    const sentimentStats = commentSentimentLoop.getStats();

    const tagStats = descriptionTagsOptimizer.getStats();

    const correlationDirective = featureCorrelationAnalyzer.getLatestDirective();

    return {
      characterBandit: {
        recommendedProfile: charProfile.recommendedProfile,
        topCharacters: topChars.map((c) => ({ name: c.name, viewsPerUse: c.viewsPerUse })),
      },
      promptQuality: {
        avgQualityScore: promptStats.avgOverallScore,
        topPatterns: promptPatterns.map((p) => ({ pattern: p.pattern, successRate: p.successRate })),
      },
      commentSentiment: {
        avgSentiment: sentimentStats.avgSentiment,
        topEmotion: sentimentStats.topEmotion,
        topRequest: sentimentStats.topRequest,
      },
      descriptionTags: {
        topTag: tagStats.topTag,
        avgSearchTraffic: tagStats.avgSearchTraffic,
      },
      featureCorrelation: {
        topFeature: correlationDirective?.topFeature || null,
        directive: correlationDirective?.directive || null,
      },
    };
  }

  generateOptimizationRecommendations(videoId: string): string[] {
    const recommendations: string[] = [];
    const insights = this.gatherServiceInsights();

    if (insights.characterBandit.topCharacters.length > 0) {
      const topChar = insights.characterBandit.topCharacters[0];
      recommendations.push(`🏆 Top performer: ${topChar.name} (${topChar.viewsPerUse} views/use)`);
    }

    if (insights.promptQuality.topPatterns.length > 0) {
      const topPattern = insights.promptQuality.topPatterns[0];
      recommendations.push(
        `🎬 Best prompt pattern: ${topPattern.pattern} (${(topPattern.successRate * 100).toFixed(0)}% success)`,
      );
    }

    if (insights.commentSentiment.topEmotion) {
      recommendations.push(`💬 Top audience emotion: ${insights.commentSentiment.topEmotion}`);
    }

    if (insights.commentSentiment.topRequest) {
      recommendations.push(`📣 Most requested topic: ${insights.commentSentiment.topRequest}`);
    }

    if (insights.descriptionTags.topTag) {
      recommendations.push(`🏷️ Best performing tag: ${insights.descriptionTags.topTag.tag}`);
    }

    if (insights.featureCorrelation.directive) {
      recommendations.push(`🎵 Audio directive: ${insights.featureCorrelation.directive}`);
    }

    return recommendations;
  }

  getSwapReport(): SwapReport {
    const report: SwapReport = {
      totalVideosMonitored: this.monitoredVideos.size,
      videosByState: {},
      totalSwaps: 0,
      swapImprovements: [],
      variantPerformance: {},
    };

    for (const [, video] of this.monitoredVideos) {
      report.videosByState[video.state] = (report.videosByState[video.state] || 0) + 1;
      report.totalSwaps += video.swapLog.length;

      for (const swap of video.swapLog) {
        const fromPerf = video.variantPerformance[swap.fromVariant];
        const toPerf = video.variantPerformance[swap.toVariant];

        const fromViews = fromPerf?.views.length
          ? fromPerf.views.reduce((a, b) => a + b, 0) / fromPerf.views.length
          : 0;
        const toViews = toPerf?.views.length ? toPerf.views.reduce((a, b) => a + b, 0) / toPerf.views.length : 0;

        report.swapImprovements.push({
          videoId: video.videoId,
          from: swap.fromVariant,
          to: swap.toVariant,
          viewsBefore: fromViews,
          viewsAfter: toViews,
          improvement: toViews - fromViews,
        });
      }

      for (const [variantId, perf] of Object.entries(video.variantPerformance)) {
        if (!report.variantPerformance[variantId]) {
          report.variantPerformance[variantId] = { uses: 0, avgViews: 0, wins: 0 };
        }
        report.variantPerformance[variantId].uses += 1;
        if (perf.views.length) {
          const avgViews = perf.views.reduce((a, b) => a + b, 0) / perf.views.length;
          report.variantPerformance[variantId].avgViews += avgViews;
        }
      }
    }

    for (const variantId of Object.keys(report.variantPerformance)) {
      if (report.variantPerformance[variantId].uses > 0) {
        report.variantPerformance[variantId].avgViews /= report.variantPerformance[variantId].uses;
      }
    }

    return report;
  }

  getMonitoredVideo(videoId: string): MonitoredVideo | undefined {
    return this.monitoredVideos.get(videoId);
  }

  getAllMonitoredVideos(): MonitoredVideo[] {
    return Array.from(this.monitoredVideos.values());
  }

  getActiveMonitoredVideos(): MonitoredVideo[] {
    return this.getAllMonitoredVideos().filter(
      (v) =>
        v.state !== VideoState.EXPIRED && v.state !== VideoState.LOCKED_WINNER && v.state !== VideoState.LOCKED_LOSER,
    );
  }

  startMonitoring(): void {
    if (this.isMonitoring) {
      console.log('🎯 Central Orchestrator: Already monitoring');
      return;
    }

    this.isMonitoring = true;
    console.log(`🎯 Central Orchestrator: Starting monitoring loop (${this.config.pollIntervalSeconds}s interval)`);

    this.monitorInterval = setInterval(() => this.runMonitoringCycle(), this.config.pollIntervalSeconds * 1000);
  }

  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    console.log('🎯 Central Orchestrator: Stopped monitoring');
  }

  /**
   * Remove expired/locked videos older than 7 days to prevent unbounded Map growth
   */
  private pruneExpiredVideos(): void {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const [videoId, video] of this.monitoredVideos) {
      if (
        (video.state === VideoState.EXPIRED ||
          video.state === VideoState.LOCKED_WINNER ||
          video.state === VideoState.LOCKED_LOSER) &&
        new Date(video.uploadTime).getTime() < sevenDaysAgo
      ) {
        this.monitoredVideos.delete(videoId);
        pruned++;
      }
    }

    if (pruned > 0) {
      console.log(`🎯 Central Orchestrator: Pruned ${pruned} expired/locked videos older than 7 days`);
      this.saveState();
    }
  }

  async runMonitoringCycle(): Promise<
    Array<{
      videoId: string;
      fromVariant: string;
      toVariant: string;
      oldTitle: string;
      newTitle: string;
      newDescription: string;
    }>
  > {
    // Prune old expired/locked videos to prevent memory leak
    this.pruneExpiredVideos();

    // Record heartbeat for health monitoring
    systemHealthMonitor.recordHeartbeat('central-orchestrator');

    const activeVideos = this.getActiveMonitoredVideos();
    console.log(`🎯 Central Orchestrator: Checking ${activeVideos.length} active videos`);

    const swapsNeeded: Array<{
      videoId: string;
      fromVariant: string;
      toVariant: string;
      oldTitle: string;
      newTitle: string;
      newDescription: string;
    }> = [];

    for (const video of activeVideos) {
      const minutesSinceUpload = Math.floor((Date.now() - new Date(video.uploadTime).getTime()) / 60000);

      const shouldCheck =
        minutesSinceUpload >= this.config.initialCheckMinutes ||
        minutesSinceUpload >= this.config.secondCheckMinutes ||
        minutesSinceUpload >= this.config.finalCheckMinutes;

      if (!shouldCheck && video.snapshots.length === 0) {
        continue;
      }

      await this.checkVideoPerformance(video.videoId);
      const result = this.evaluateAndAct(video.videoId);

      if (result.action === 'swap' && result.details?.toVariant) {
        const currentVariant = video.variants[video.currentVariant];
        const newVariant = video.variants[result.details.toVariant];

        if (currentVariant && newVariant) {
          swapsNeeded.push({
            videoId: video.videoId,
            fromVariant: video.currentVariant,
            toVariant: result.details.toVariant,
            oldTitle: currentVariant.title,
            newTitle: newVariant.title,
            newDescription: newVariant.description,
          });

          // Mark the swap in the orchestrator (skip callback - Unity orchestrator handles YouTube API)
          await this.executeSwap(video.videoId, result.details.toVariant, true);
        }
      }
    }

    return swapsNeeded;
  }

  async runSingleCheck(videoId: string): Promise<{
    snapshot: PerformanceSnapshot | null;
    evaluation: any;
    swapExecuted: boolean;
  }> {
    const snapshot = await this.checkVideoPerformance(videoId);
    const evaluation = this.evaluateAndAct(videoId);
    let swapExecuted = false;

    if (evaluation.action === 'swap' && evaluation.details?.toVariant) {
      swapExecuted = await this.executeSwap(videoId, evaluation.details.toVariant);
    }

    return { snapshot, evaluation, swapExecuted };
  }

  /**
   * Calculate swap velocity metrics to understand if Variant A generation needs work
   */
  getSwapVelocityMetrics(): SwapVelocityMetrics {
    const allVideos = Array.from(this.monitoredVideos.values());

    if (allVideos.length < 5) {
      return {
        avgSwapsPerVideo: 0,
        videosNeverSwapped: 0,
        videosSwappedOnce: 0,
        videosSwappedTwice: 0,
        variantAWinRate: 0,
        variantBWinRate: 0,
        variantCWinRate: 0,
        recommendation: 'insufficient_data',
        explanation: `Need at least 5 videos to analyze swap velocity (currently ${allVideos.length})`,
      };
    }

    const neverSwapped = allVideos.filter((v) => v.swapLog.length === 0).length;
    const swappedOnce = allVideos.filter((v) => v.swapLog.length === 1).length;
    const swappedTwice = allVideos.filter((v) => v.swapLog.length >= 2).length;

    const totalSwaps = allVideos.reduce((sum, v) => sum + v.swapLog.length, 0);
    const avgSwapsPerVideo = totalSwaps / allVideos.length;

    // Calculate variant win rates (which variant is current for locked winners)
    const lockedWinners = allVideos.filter((v) => v.state === VideoState.LOCKED_WINNER);
    const variantAWins = lockedWinners.filter((v) => v.currentVariant === 'A').length;
    const variantBWins = lockedWinners.filter((v) => v.currentVariant === 'B').length;
    const variantCWins = lockedWinners.filter((v) => v.currentVariant === 'C').length;

    const totalWinners = lockedWinners.length || 1; // Avoid division by zero
    const variantAWinRate = variantAWins / totalWinners;
    const variantBWinRate = variantBWins / totalWinners;
    const variantCWinRate = variantCWins / totalWinners;

    // Calculate Variant A retention rate (videos that stayed on A or won with A)
    const variantARetentionRate = neverSwapped / allVideos.length;
    const swapRate = (swappedOnce + swappedTwice) / allVideos.length;
    const exhaustedRate = swappedTwice / allVideos.length;

    // Determine recommendation based on multiple factors
    let recommendation: SwapVelocityMetrics['recommendation'];
    let explanation: string;

    // Check if Variant A is underperforming (low retention AND low A win rate)
    if (variantARetentionRate < 0.4 && variantAWinRate < 0.3 && avgSwapsPerVideo > 0.8) {
      recommendation = 'variant_a_needs_work';
      explanation = `Only ${Math.round(variantARetentionRate * 100)}% of videos stayed on Variant A, and A wins only ${Math.round(variantAWinRate * 100)}% of locked videos. Your initial titles need improvement - analyze what makes B/C successful.`;
    } else if (exhaustedRate > 0.5) {
      recommendation = 'too_aggressive';
      explanation = `${Math.round(exhaustedRate * 100)}% of videos exhausted all variants. Consider loosening thresholds or improving all variant quality.`;
    } else if (variantARetentionRate > 0.6 || (variantAWinRate > 0.5 && lockedWinners.length >= 3)) {
      recommendation = 'dialed_in';
      explanation = `${Math.round(variantARetentionRate * 100)}% of videos stayed on Variant A, with ${Math.round(variantAWinRate * 100)}% A win rate. Your initial titles are hitting the mark!`;
    } else if (swapRate > 0.3 && swapRate < 0.7) {
      recommendation = 'dialed_in';
      explanation = `Healthy swap rate of ${Math.round(swapRate * 100)}% (${totalSwaps} total swaps across ${allVideos.length} videos). System is optimizing effectively.`;
    } else {
      recommendation = 'dialed_in';
      explanation = `${Math.round(swapRate * 100)}% of videos were swapped. Performance is stable.`;
    }

    return {
      avgSwapsPerVideo,
      videosNeverSwapped: neverSwapped,
      videosSwappedOnce: swappedOnce,
      videosSwappedTwice: swappedTwice,
      variantAWinRate,
      variantBWinRate,
      variantCWinRate,
      recommendation,
      explanation,
    };
  }

  /**
   * Generate daily digest summary for morning review
   */
  generateDailyDigest(date?: string): DailyDigest {
    const targetDate = date || new Date().toISOString().split('T')[0];
    const allVideos = Array.from(this.monitoredVideos.values());

    // Filter swaps from today
    const todaySwaps = this.swapHistory.filter((s) => s.timestamp.startsWith(targetDate));

    // Count states
    const lockedWinners = allVideos.filter((v) => v.state === VideoState.LOCKED_WINNER);
    const lockedLosers = allVideos.filter((v) => v.state === VideoState.LOCKED_LOSER);

    // Find best performer (locked winner with highest improvement)
    let bestPerformer: DailyDigest['bestPerformer'] = null;
    for (const video of lockedWinners) {
      if (video.swapLog.length > 0) {
        const firstSnapshot = video.snapshots[0];
        const lastSnapshot = video.snapshots[video.snapshots.length - 1];
        if (firstSnapshot && lastSnapshot && firstSnapshot.views > 0) {
          const improvement = ((lastSnapshot.views - firstSnapshot.views) / firstSnapshot.views) * 100;
          if (!bestPerformer || improvement > bestPerformer.improvementPercent) {
            bestPerformer = {
              videoId: video.videoId,
              character: video.character || 'Unknown',
              winningVariant: video.currentVariant,
              improvementPercent: Math.round(improvement),
            };
          }
        }
      }
    }

    // Find worst performer (locked loser)
    let worstPerformer: DailyDigest['worstPerformer'] = null;
    if (lockedLosers.length > 0) {
      const loser = lockedLosers[lockedLosers.length - 1];
      worstPerformer = {
        videoId: loser.videoId,
        character: loser.character || 'Unknown',
        variantsExhausted: true,
      };
    }

    return {
      date: targetDate,
      totalVideosMonitored: allVideos.length,
      swapsToday: todaySwaps.length,
      lockedWinners: lockedWinners.length,
      lockedLosers: lockedLosers.length,
      bestPerformer,
      worstPerformer,
      swapVelocity: this.getSwapVelocityMetrics(),
    };
  }

  /**
   * Get recent swap notifications (for dashboard)
   */
  getRecentSwaps(limit: number = 10): SwapNotification[] {
    return this.swapHistory.slice(-limit).reverse();
  }

  /**
   * Import historical videos from YouTube into the monitoring system
   * These videos won't be actively swapped (too old) but will contribute to:
   * - Swap velocity stats
   * - Variant win rate tracking
   * - Historical performance analysis
   */
  importHistoricalVideos(
    videos: Array<{
      videoId: string;
      title: string;
      publishedAt: string;
      viewCount: number;
      likeCount?: number;
      commentCount?: number;
    }>,
  ): { imported: number; skipped: number; errors: string[] } {
    const result = { imported: 0, skipped: 0, errors: [] as string[] };

    for (const video of videos) {
      try {
        // Skip if already monitored
        if (this.monitoredVideos.has(video.videoId)) {
          result.skipped++;
          continue;
        }

        // Determine content type based on title or other indicators
        // Shorts typically have #Shorts or are under 60 seconds
        const isShort =
          video.title.toLowerCase().includes('#short') ||
          video.title.toLowerCase().includes('short') ||
          video.title.includes('🔥'); // Common in shorts

        // Create a monitored video entry for historical tracking
        // We mark these as "expired" since they're past the monitoring window
        const monitoredVideo: MonitoredVideo = {
          videoId: video.videoId,
          uploadTime: video.publishedAt,
          currentVariant: 'A', // Historical videos default to variant A
          state: VideoState.EXPIRED, // Mark as expired - past monitoring window
          variants: {
            A: {
              variantId: 'A',
              title: video.title,
              description: '',
              thumbnailPath: '',
              tags: [],
            },
          },
          snapshots: [
            {
              timestamp: new Date().toISOString(),
              views: video.viewCount,
              impressions: 0, // Historical videos don't have impression data from Data API
              ctr: 0,
              avgViewDuration: 0,
              avgViewPercentage: 0,
              likes: video.likeCount || 0,
              comments: video.commentCount || 0,
              minutesSinceUpload: Math.floor((Date.now() - new Date(video.publishedAt).getTime()) / 60000),
              currentVariant: 'A',
            },
          ],
          swapLog: [],
          variantPerformance: {
            A: {
              views: [video.viewCount],
              ctr: [],
              impressions: [],
              avgRetention: 0,
            },
          },
          theme: '',
          character: this.extractCharacterFromTitle(video.title),
          contentType: isShort ? 'short' : 'long',
        };

        this.monitoredVideos.set(video.videoId, monitoredVideo);
        result.imported++;

        console.log(
          `🎯 Central Orchestrator: Imported historical video ${video.videoId} (${video.title.substring(0, 40)}...)`,
        );
      } catch (error: any) {
        result.errors.push(`${video.videoId}: ${error.message}`);
      }
    }

    this.saveState();
    console.log(`🎯 Central Orchestrator: Import complete - ${result.imported} imported, ${result.skipped} skipped`);

    return result;
  }

  /**
   * Extract character name from video title (best effort)
   * Examples: "Napoleon vs Caesar" -> "Napoleon", "Caesar's Greatest Battle" -> "Caesar"
   */
  private extractCharacterFromTitle(title: string): string {
    // Try to find "X vs Y" pattern
    const vsMatch = title.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+vs\.?\s+/i);
    if (vsMatch) return vsMatch[1];

    // Try possessive: "Caesar's ..."
    const possMatch = title.match(/^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)'s\s+/i);
    if (possMatch) return possMatch[1];

    // Try "The X of Y" pattern
    const ofMatch = title.match(/^The\s+.*?\s+of\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
    if (ofMatch) return ofMatch[1];

    // Default: first capitalized word
    const firstWord = title.match(/^([A-Z][a-z]+)/);
    return firstWord ? firstWord[1] : 'Unknown';
  }

  /**
   * Get count of monitored videos by state
   */
  getVideoCounts(): { total: number; active: number; expired: number; locked: number } {
    let active = 0,
      expired = 0,
      locked = 0;
    for (const video of this.monitoredVideos.values()) {
      if (video.state === VideoState.EXPIRED) expired++;
      else if (video.state === VideoState.LOCKED_WINNER || video.state === VideoState.LOCKED_LOSER) locked++;
      else active++;
    }
    return { total: this.monitoredVideos.size, active, expired, locked };
  }

  /**
   * Format daily digest as readable string for logging/display
   */
  formatDailyDigest(digest: DailyDigest): string {
    const lines: string[] = [
      '══════════════════════════════════════════════════════════════════',
      `  📊 DAILY HOOK SWITCHING DIGEST - ${digest.date}`,
      '══════════════════════════════════════════════════════════════════',
      '',
      `📹 Videos Monitored: ${digest.totalVideosMonitored}`,
      `🔄 Swaps Today: ${digest.swapsToday}`,
      `🏆 Locked Winners: ${digest.lockedWinners}`,
      `❌ Locked Losers: ${digest.lockedLosers}`,
      '',
    ];

    if (digest.bestPerformer) {
      lines.push(`⭐ Best Performer: ${digest.bestPerformer.character}`);
      lines.push(
        `   Variant ${digest.bestPerformer.winningVariant} won (+${digest.bestPerformer.improvementPercent}% improvement)`,
      );
      lines.push('');
    }

    if (digest.worstPerformer) {
      lines.push(`⚠️ Worst Performer: ${digest.worstPerformer.character}`);
      lines.push(`   All variants exhausted`);
      lines.push('');
    }

    lines.push('📈 Swap Velocity:');
    lines.push(`   Avg swaps/video: ${digest.swapVelocity.avgSwapsPerVideo.toFixed(2)}`);
    lines.push(`   Never swapped: ${digest.swapVelocity.videosNeverSwapped}`);
    lines.push(`   Swapped once: ${digest.swapVelocity.videosSwappedOnce}`);
    lines.push(`   Swapped twice: ${digest.swapVelocity.videosSwappedTwice}`);
    lines.push('');

    if (digest.swapVelocity.variantAWinRate > 0 || digest.swapVelocity.variantBWinRate > 0) {
      lines.push('🎯 Variant Win Rates:');
      lines.push(`   A: ${(digest.swapVelocity.variantAWinRate * 100).toFixed(0)}%`);
      lines.push(`   B: ${(digest.swapVelocity.variantBWinRate * 100).toFixed(0)}%`);
      lines.push(`   C: ${(digest.swapVelocity.variantCWinRate * 100).toFixed(0)}%`);
      lines.push('');
    }

    lines.push(`💡 Recommendation: ${digest.swapVelocity.recommendation.toUpperCase()}`);
    lines.push(`   ${digest.swapVelocity.explanation}`);
    lines.push('');
    lines.push('══════════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  printStatus(): string {
    const lines: string[] = [
      '══════════════════════════════════════════════════════════════════',
      '  CENTRAL ORCHESTRATOR - STATUS',
      '══════════════════════════════════════════════════════════════════',
      '',
      `Baselines (from ${this.baselines.videosAnalyzed} videos):`,
      `  Views 1h:  p25=${this.baselines.views1hP25.toFixed(0)}  p50=${this.baselines.views1hP50.toFixed(0)}  p75=${this.baselines.views1hP75.toFixed(0)}`,
      `  CTR:       p25=${(this.baselines.ctrP25 * 100).toFixed(1)}%  p50=${(this.baselines.ctrP50 * 100).toFixed(1)}%  p75=${(this.baselines.ctrP75 * 100).toFixed(1)}%`,
      '',
      `Monitored Videos: ${this.monitoredVideos.size}`,
    ];

    for (const [vid, video] of this.monitoredVideos) {
      const swaps = video.swapLog.length;
      const latestViews = video.snapshots.length ? video.snapshots[video.snapshots.length - 1].views : 0;
      lines.push(
        `  ${vid.substring(0, 20).padEnd(20)} state=${video.state.padEnd(12)} ` +
          `variant=${video.currentVariant}  swaps=${swaps}  views=${latestViews}`,
      );
    }

    lines.push('');
    lines.push(`Monitoring: ${this.isMonitoring ? 'ACTIVE' : 'STOPPED'}`);

    return lines.join('\n');
  }

  private saveState(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });

      const videosArray: Array<[string, MonitoredVideo]> = [];
      for (const [key, value] of this.monitoredVideos) {
        videosArray.push([key, value]);
      }

      const state = {
        monitoredVideos: videosArray,
        config: this.config,
        savedAt: new Date().toISOString(),
      };

      writeFileSync(this.statePath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.warn('🎯 Central Orchestrator: Could not save state');
    }
  }

  private loadState(): void {
    try {
      if (existsSync(this.statePath)) {
        const data = JSON.parse(readFileSync(this.statePath, 'utf-8'));

        if (data.monitoredVideos && Array.isArray(data.monitoredVideos)) {
          this.monitoredVideos = new Map(data.monitoredVideos);
        }

        if (data.config) {
          this.config = { ...DEFAULT_CONFIG, ...data.config };
        }
      }
    } catch (error) {
      console.warn('🎯 Central Orchestrator: Could not load state');
    }
  }

  private saveBaselines(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      writeFileSync(this.baselinesPath, JSON.stringify(this.baselines, null, 2));
    } catch (error) {
      console.warn('🎯 Central Orchestrator: Could not save baselines');
    }
  }

  private loadBaselines(): void {
    try {
      if (existsSync(this.baselinesPath)) {
        const data = JSON.parse(readFileSync(this.baselinesPath, 'utf-8'));
        this.baselines = { ...DEFAULT_BASELINES, ...data };
        console.log(`🎯 Central Orchestrator: Loaded baselines from ${this.baselines.videosAnalyzed} videos`);
      }
    } catch (error) {
      console.warn('🎯 Central Orchestrator: Could not load baselines');
    }
  }
}

export const centralOrchestrator = new CentralOrchestrator();
