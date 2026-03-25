/**
 * Auto-Fix Service
 *
 * Analyzes YouTube analytics to diagnose issues and automatically apply fixes
 * to video generation. Uses confidence thresholds to avoid overcorrection.
 *
 * Key principles:
 * 1. Conservative - only apply fixes after seeing pattern in 3+ videos
 * 2. Trackable - record which fixes were applied to which videos
 * 3. Measurable - validate if fixes actually improved outcomes
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';
import { youtubeAnalyticsService, AdvancedVideoAnalytics } from './youtube-analytics-service';

// Minimum videos needed to activate a fix (prevents overcorrection)
const MIN_VIDEOS_FOR_FIX = 3;
const FIX_CONFIDENCE_THRESHOLD = 0.6; // 60% of analyzed videos must show the issue

// Types of issues we can diagnose and fix
type IssueType =
  | 'hook_weak_3s' // High drop-off in first 3 seconds
  | 'hook_weak_10s' // High drop-off by 10 seconds
  | 'retention_mid_drop' // Drop-off mid-video (content/pacing issue)
  | 'low_mobile_views' // Not optimized for mobile
  | 'low_search_discovery' // Not being found via search
  | 'low_suggested_traffic' // Not recommended by YouTube
  | 'young_audience_drop' // Losing younger viewers
  | 'subtitle_readability' // Text too small for devices
  | 'video_too_long' // Viewers not finishing
  | 'low_subscriber_convert' // Views not converting to subs
  | 'geographic_mismatch'; // Content not reaching target regions

// A diagnosed issue from a single video
interface DiagnosedIssue {
  type: IssueType;
  severity: 'critical' | 'moderate' | 'minor';
  value: number; // The metric value that triggered this
  threshold: number; // What value would be healthy
  videoId: string;
  diagnosedAt: Date;
}

// A fix that can be applied to video generation
interface Fix {
  id: string;
  issueType: IssueType;
  description: string;
  action: FixAction;
  confidence: number; // 0-1, based on how many videos showed this issue
  videosSeen: number; // Number of videos that showed this issue
  videosTotal: number; // Total videos analyzed
  status: 'observing' | 'active' | 'graduated' | 'retired';
  createdAt: Date;
  activatedAt?: Date;
  appliedToVideos: string[]; // Video IDs this fix was applied to
  outcomesMeasured: FixOutcome[];
}

// What action to take to fix an issue
interface FixAction {
  target: 'prompt' | 'subtitle' | 'hook' | 'pacing' | 'title' | 'thumbnail';
  modification: string; // Natural language description for GPT prompts
  parameters?: Record<string, any>; // Specific parameters to change
}

// Measured outcome after fix was applied
interface FixOutcome {
  videoId: string;
  fixAppliedAt: Date;
  metricBefore: number; // Channel average before
  metricAfter: number; // This video's performance
  improved: boolean;
}

// Issue observation for building confidence
interface IssueObservation {
  issueType: IssueType;
  observations: DiagnosedIssue[];
  lastAnalyzed: Date;
}

class AutoFixService {
  private observations: Map<IssueType, IssueObservation> = new Map();
  private activeFixes: Map<string, Fix> = new Map();
  private appliedFixes: Map<string, string[]> = new Map(); // videoId -> fixIds

  constructor() {
    this.loadState();
  }

  /**
   * Analyze a video and diagnose any issues
   */
  diagnoseVideo(analytics: AdvancedVideoAnalytics): DiagnosedIssue[] {
    const issues: DiagnosedIssue[] = [];
    const videoId = analytics.videoId;

    // 1. Hook issues (first 3 seconds)
    const first3sRetention = this.estimateRetentionAt(analytics, 3);
    if (first3sRetention < 70) {
      issues.push({
        type: 'hook_weak_3s',
        severity: first3sRetention < 50 ? 'critical' : 'moderate',
        value: first3sRetention,
        threshold: 70,
        videoId,
        diagnosedAt: new Date(),
      });
    }

    // 2. Hook issues (first 10 seconds)
    const first10sRetention = this.estimateRetentionAt(analytics, 10);
    if (first10sRetention < 50) {
      issues.push({
        type: 'hook_weak_10s',
        severity: first10sRetention < 30 ? 'critical' : 'moderate',
        value: first10sRetention,
        threshold: 50,
        videoId,
        diagnosedAt: new Date(),
      });
    }

    // 3. Mid-video drop (content/pacing issue)
    if (analytics.averageViewPercentage < 30) {
      issues.push({
        type: 'retention_mid_drop',
        severity: analytics.averageViewPercentage < 20 ? 'critical' : 'moderate',
        value: analytics.averageViewPercentage,
        threshold: 30,
        videoId,
        diagnosedAt: new Date(),
      });
    }

    // 4. Mobile optimization
    if (analytics.deviceTypes && analytics.deviceTypes.mobile < 50) {
      issues.push({
        type: 'low_mobile_views',
        severity: analytics.deviceTypes.mobile < 30 ? 'moderate' : 'minor',
        value: analytics.deviceTypes.mobile,
        threshold: 50,
        videoId,
        diagnosedAt: new Date(),
      });
    }

    // 5. Search discovery
    if (analytics.trafficSources && analytics.trafficSources.search < 5) {
      issues.push({
        type: 'low_search_discovery',
        severity: 'minor',
        value: analytics.trafficSources.search,
        threshold: 5,
        videoId,
        diagnosedAt: new Date(),
      });
    }

    // 6. Suggested traffic (YouTube recommending your content)
    if (analytics.trafficSources && analytics.trafficSources.suggested < 20) {
      issues.push({
        type: 'low_suggested_traffic',
        severity: analytics.trafficSources.suggested < 10 ? 'moderate' : 'minor',
        value: analytics.trafficSources.suggested,
        threshold: 20,
        videoId,
        diagnosedAt: new Date(),
      });
    }

    // 7. Subscriber conversion
    const subConversionRate = analytics.subscribersGained / (analytics.estimatedMinutesWatched || 1);
    if (subConversionRate < 0.01) {
      issues.push({
        type: 'low_subscriber_convert',
        severity: 'minor',
        value: subConversionRate,
        threshold: 0.01,
        videoId,
        diagnosedAt: new Date(),
      });
    }

    return issues;
  }

  /**
   * Estimate retention at a specific second (using curve if available)
   */
  private estimateRetentionAt(analytics: AdvancedVideoAnalytics, second: number): number {
    if (analytics.realRetentionCurve && analytics.realRetentionCurve.length > 0) {
      // Use real retention data
      const ratio = second / 60; // Assume 60s video
      const point = analytics.realRetentionCurve.find((p) => p.elapsedVideoTimeRatio >= ratio);
      return point ? point.audienceWatchRatio * 100 : analytics.averageViewPercentage;
    }

    // Use estimated curve
    const point = analytics.retentionCurve.find((p) => p.second >= second);
    return point ? point.percentage : analytics.averageViewPercentage;
  }

  /**
   * Record observations and update fix confidence
   */
  recordObservations(issues: DiagnosedIssue[]): void {
    for (const issue of issues) {
      const existing = this.observations.get(issue.type) || {
        issueType: issue.type,
        observations: [],
        lastAnalyzed: new Date(),
      };

      // Don't duplicate observations for same video
      if (!existing.observations.find((o) => o.videoId === issue.videoId)) {
        existing.observations.push(issue);
      }

      existing.lastAnalyzed = new Date();
      this.observations.set(issue.type, existing);
    }

    this.updateFixConfidence();
    this.saveState();
  }

  /**
   * Update confidence levels and promote fixes that meet threshold
   */
  private updateFixConfidence(): void {
    for (const [issueType, observation] of this.observations) {
      const videosSeen = observation.observations.length;

      // Calculate severity-weighted confidence
      const criticalCount = observation.observations.filter((o) => o.severity === 'critical').length;
      const moderateCount = observation.observations.filter((o) => o.severity === 'moderate').length;
      const minorCount = observation.observations.filter((o) => o.severity === 'minor').length;

      // Weight: critical=1.5, moderate=1.0, minor=0.5
      const weightedScore = criticalCount * 1.5 + moderateCount * 1.0 + minorCount * 0.5;
      const maxPossibleScore = videosSeen * 1.5;
      const confidence = maxPossibleScore > 0 ? weightedScore / maxPossibleScore : 0;

      const existingFix = this.activeFixes.get(issueType);

      if (videosSeen >= MIN_VIDEOS_FOR_FIX && confidence >= FIX_CONFIDENCE_THRESHOLD) {
        // Promote to active if not already
        if (!existingFix || existingFix.status === 'observing') {
          const fix = this.createFix(issueType, confidence, videosSeen);
          fix.status = 'active';
          fix.activatedAt = new Date();
          this.activeFixes.set(issueType, fix);
          console.log(
            `🔧 Auto-fix ACTIVATED: ${issueType} (confidence: ${(confidence * 100).toFixed(0)}%, videos: ${videosSeen})`,
          );
        } else {
          // Update existing fix
          existingFix.confidence = confidence;
          existingFix.videosSeen = videosSeen;
        }
      } else if (existingFix) {
        // Update stats but keep observing
        existingFix.confidence = confidence;
        existingFix.videosSeen = videosSeen;
        if (existingFix.status === 'observing') {
          console.log(
            `👀 Auto-fix observing: ${issueType} (confidence: ${(confidence * 100).toFixed(0)}%, videos: ${videosSeen}/${MIN_VIDEOS_FOR_FIX})`,
          );
        }
      } else {
        // Create new fix in observing status
        const fix = this.createFix(issueType, confidence, videosSeen);
        fix.status = 'observing';
        this.activeFixes.set(issueType, fix);
      }
    }
  }

  /**
   * Create a fix for a specific issue type
   */
  private createFix(issueType: IssueType, confidence: number, videosSeen: number): Fix {
    const actions: Record<IssueType, FixAction> = {
      hook_weak_3s: {
        target: 'prompt',
        modification:
          'Open with immediate action or conflict. First frame must show movement, drama, or intrigue. Avoid establishing shots.',
        parameters: { hookIntensity: 'high', openingType: 'action' },
      },
      hook_weak_10s: {
        target: 'prompt',
        modification:
          'Establish stakes within 10 seconds. Show what the viewer will learn or experience. Add text overlay reinforcing the hook.',
        parameters: { stakesClarityBoost: true },
      },
      retention_mid_drop: {
        target: 'pacing',
        modification:
          'Add variety mid-video: scene changes, perspective shifts, or reveals. Avoid repetitive visuals for more than 5 seconds.',
        parameters: { sceneChangeFrequency: 'high' },
      },
      low_mobile_views: {
        target: 'subtitle',
        modification: 'Increase subtitle font size for mobile readability. Use bolder text with higher contrast.',
        parameters: { subtitleScale: 1.2, fontWeight: 'bold' },
      },
      low_search_discovery: {
        target: 'title',
        modification:
          'Include searchable keywords in title. Use terms people actually search for (historical figure name + "story" or "explained").',
        parameters: { seoKeywords: true },
      },
      low_suggested_traffic: {
        target: 'thumbnail',
        modification:
          'Increase visual contrast in thumbnail. Use close-up faces with dramatic lighting and minimal text.',
        parameters: { thumbnailStyle: 'dramatic_closeup' },
      },
      young_audience_drop: {
        target: 'prompt',
        modification: 'Use more dynamic camera angles and faster cuts. Reference contemporary context where relevant.',
        parameters: { dynamicCamera: true },
      },
      subtitle_readability: {
        target: 'subtitle',
        modification: 'Use larger, bolder subtitles with dark background for all devices.',
        parameters: { subtitleScale: 1.3, background: 'dark' },
      },
      video_too_long: {
        target: 'pacing',
        modification: 'Reduce video length by 10-15 seconds. Cut less essential scenes.',
        parameters: { targetDurationReduction: 0.15 },
      },
      low_subscriber_convert: {
        target: 'hook',
        modification: 'Add subtle channel branding in first 5 seconds. End with stronger call-to-action.',
        parameters: { brandingVisibility: 'subtle' },
      },
      geographic_mismatch: {
        target: 'prompt',
        modification:
          'Consider cultural relevance in visual choices. Avoid region-specific references that may not translate.',
        parameters: { culturalNeutrality: true },
      },
    };

    return {
      id: `fix_${issueType}_${Date.now()}`,
      issueType,
      description: this.getIssueDescription(issueType),
      action: actions[issueType],
      confidence,
      videosSeen,
      videosTotal: videosSeen,
      status: 'observing',
      createdAt: new Date(),
      appliedToVideos: [],
      outcomesMeasured: [],
    };
  }

  /**
   * Get human-readable description for an issue
   */
  private getIssueDescription(issueType: IssueType): string {
    const descriptions: Record<IssueType, string> = {
      hook_weak_3s: 'Viewers leaving in first 3 seconds - hook not grabbing attention',
      hook_weak_10s: 'Viewers leaving by 10 seconds - stakes/conflict unclear',
      retention_mid_drop: 'Mid-video drop-off - content or pacing issue',
      low_mobile_views: 'Below-average mobile viewership - may need larger text',
      low_search_discovery: 'Low search traffic - videos not being found',
      low_suggested_traffic: 'YouTube not recommending videos - low algorithmic reach',
      young_audience_drop: 'Losing younger viewers - content may feel dated',
      subtitle_readability: 'Subtitle size may be too small for some devices',
      video_too_long: 'Viewers not finishing - video may be too long',
      low_subscriber_convert: 'Views not converting to subscribers',
      geographic_mismatch: 'Content not reaching expected regions',
    };
    return descriptions[issueType] || issueType;
  }

  /**
   * Get all active fixes that should be applied to new videos
   */
  getActiveFixes(): Fix[] {
    return Array.from(this.activeFixes.values()).filter((fix) => fix.status === 'active');
  }

  /**
   * Get fixes formatted for prompt modification
   */
  getPromptModifications(): string[] {
    return this.getActiveFixes()
      .filter((fix) => fix.action.target === 'prompt' || fix.action.target === 'hook' || fix.action.target === 'pacing')
      .map((fix) => fix.action.modification);
  }

  /**
   * Get fixes formatted for subtitle/visual modifications
   */
  getVisualModifications(): Record<string, any> {
    const mods: Record<string, any> = {};
    for (const fix of this.getActiveFixes()) {
      if (fix.action.parameters) {
        Object.assign(mods, fix.action.parameters);
      }
    }
    return mods;
  }

  /**
   * Record that fixes were applied to a video
   */
  recordFixApplication(videoId: string, packageId: string): void {
    const activeFixIds = this.getActiveFixes().map((f) => f.id);
    this.appliedFixes.set(videoId, activeFixIds);

    // Update each fix's applied list
    for (const fix of this.getActiveFixes()) {
      if (!fix.appliedToVideos.includes(videoId)) {
        fix.appliedToVideos.push(videoId);
      }
    }

    console.log(`📝 Applied ${activeFixIds.length} fixes to video ${videoId}`);
    this.saveState();
  }

  /**
   * Get which fixes were applied to a video
   */
  getAppliedFixes(videoId: string): string[] {
    return this.appliedFixes.get(videoId) || [];
  }

  /**
   * Measure outcome of a fix after video performance is known
   */
  async measureFixOutcome(videoId: string): Promise<void> {
    const appliedFixIds = this.appliedFixes.get(videoId);
    if (!appliedFixIds || appliedFixIds.length === 0) return;

    const analytics = await youtubeAnalyticsService.getAdvancedAnalytics(videoId);
    if (!analytics) return;

    // Get channel averages for comparison
    const channelMetrics = await youtubeAnalyticsService.getBulkAdvancedAnalytics(20);
    const avgRetention = channelMetrics.reduce((s, v) => s + v.averageViewPercentage, 0) / channelMetrics.length;

    for (const fixId of appliedFixIds) {
      const fix = Array.from(this.activeFixes.values()).find((f) => f.id === fixId);
      if (!fix) continue;

      const outcome: FixOutcome = {
        videoId,
        fixAppliedAt: fix.activatedAt || new Date(),
        metricBefore: avgRetention,
        metricAfter: analytics.averageViewPercentage,
        improved: analytics.averageViewPercentage > avgRetention,
      };

      fix.outcomesMeasured.push(outcome);

      // Check if fix should graduate or retire
      if (fix.outcomesMeasured.length >= 5) {
        const successRate = fix.outcomesMeasured.filter((o) => o.improved).length / fix.outcomesMeasured.length;

        if (successRate >= 0.6) {
          fix.status = 'graduated';
          console.log(`🎓 Fix GRADUATED (${(successRate * 100).toFixed(0)}% success): ${fix.issueType}`);
        } else if (successRate < 0.3) {
          fix.status = 'retired';
          console.log(`❌ Fix RETIRED (${(successRate * 100).toFixed(0)}% success): ${fix.issueType}`);
        }
      }
    }

    this.saveState();
  }

  /**
   * Run full analysis on recent videos and update fixes
   */
  async analyzeRecentVideos(): Promise<{
    videosAnalyzed: number;
    issuesFound: number;
    fixesActive: number;
    fixesObserving: number;
  }> {
    const analytics = await youtubeAnalyticsService.getBulkAdvancedAnalytics(20);
    let totalIssues = 0;

    for (const video of analytics) {
      const issues = this.diagnoseVideo(video);
      this.recordObservations(issues);
      totalIssues += issues.length;

      // Also measure outcomes for videos we've applied fixes to
      if (this.appliedFixes.has(video.videoId)) {
        await this.measureFixOutcome(video.videoId);
      }
    }

    const activeFixes = Array.from(this.activeFixes.values());
    return {
      videosAnalyzed: analytics.length,
      issuesFound: totalIssues,
      fixesActive: activeFixes.filter((f) => f.status === 'active').length,
      fixesObserving: activeFixes.filter((f) => f.status === 'observing').length,
    };
  }

  /**
   * Get status summary for dashboard
   */
  getStatus(): {
    activeFixes: Array<{ type: string; confidence: number; videosSeen: number; description: string }>;
    observingFixes: Array<{ type: string; confidence: number; videosSeen: number; needed: number }>;
    graduatedFixes: Array<{ type: string; successRate: number }>;
    retiredFixes: Array<{ type: string; successRate: number }>;
  } {
    const fixes = Array.from(this.activeFixes.values());

    return {
      activeFixes: fixes
        .filter((f) => f.status === 'active')
        .map((f) => ({
          type: f.issueType,
          confidence: Math.round(f.confidence * 100),
          videosSeen: f.videosSeen,
          description: f.description,
        })),
      observingFixes: fixes
        .filter((f) => f.status === 'observing')
        .map((f) => ({
          type: f.issueType,
          confidence: Math.round(f.confidence * 100),
          videosSeen: f.videosSeen,
          needed: MIN_VIDEOS_FOR_FIX - f.videosSeen,
        })),
      graduatedFixes: fixes
        .filter((f) => f.status === 'graduated')
        .map((f) => ({
          type: f.issueType,
          successRate:
            f.outcomesMeasured.length > 0
              ? Math.round((f.outcomesMeasured.filter((o) => o.improved).length / f.outcomesMeasured.length) * 100)
              : 0,
        })),
      retiredFixes: fixes
        .filter((f) => f.status === 'retired')
        .map((f) => ({
          type: f.issueType,
          successRate:
            f.outcomesMeasured.length > 0
              ? Math.round((f.outcomesMeasured.filter((o) => o.improved).length / f.outcomesMeasured.length) * 100)
              : 0,
        })),
    };
  }

  /**
   * Save state to file for persistence
   */
  private saveState(): void {
    const state = {
      observations: Object.fromEntries(this.observations),
      activeFixes: Object.fromEntries(this.activeFixes),
      appliedFixes: Object.fromEntries(this.appliedFixes),
      savedAt: new Date().toISOString(),
    };

    try {
      const fs = require('fs');
      fs.writeFileSync('auto-fix-state.json', JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Failed to save auto-fix state:', error);
    }
  }

  /**
   * Load state from file
   */
  private loadState(): void {
    try {
      const fs = require('fs');
      if (fs.existsSync('auto-fix-state.json')) {
        const state = JSON.parse(fs.readFileSync('auto-fix-state.json', 'utf-8'));

        this.observations = new Map(Object.entries(state.observations || {})) as any;
        this.activeFixes = new Map(Object.entries(state.activeFixes || {}));
        this.appliedFixes = new Map(Object.entries(state.appliedFixes || {}));

        const activeFixes = Array.from(this.activeFixes.values()).filter((f) => f.status === 'active');
        console.log(`📊 Loaded auto-fix state: ${activeFixes.length} active fixes`);
      }
    } catch (error) {
      console.log('No existing auto-fix state found, starting fresh');
    }
  }
}

export const autoFixService = new AutoFixService();
