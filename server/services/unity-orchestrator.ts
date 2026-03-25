/**
 * UNITY AUTOMATION ORCHESTRATOR
 *
 * Full automation pipeline:
 * 1. Discover viral-worthy topics (daily)
 * 2. Generate video content
 * 3. Upload to YouTube
 * 4. Track performance
 *
 * Run this as a long-running service or trigger manually
 */

import {
  discoverContent,
  TopicCandidate,
  DiscoveryConfig,
  createContentQueue,
  ContentQueue,
  ContentQueueItem,
  autoContentDiscovery,
} from './auto-content-discovery';

import { youtubeUploadService } from './youtube-upload-service';
import { youtubeMetadataGenerator } from './youtube-metadata-generator';
import { ffmpegProcessor } from './ffmpeg-processor';
import { storage } from '../storage';
import { db } from '../db';
import { jobs } from '@shared/schema';
import { eq, gte, and, sql } from 'drizzle-orm';
import { sunoApi } from './suno-api';
import { sunoTaskService } from './suno-task-service';
import { generateViralLyrics, detectFemaleCharacter, getVocalStyleForCharacter } from './viral-lyrics-engine';
import { abTestingService, StyleVariant } from './ab-testing-service';
import { lyricAnalyticsService } from './lyric-analytics-service';
import { patternIntelligenceService } from './pattern-intelligence-service';
import { videoInsightsService } from './video-insights-service';
import { audioAnalysisService } from './audio-analysis-service';
import { acousticFingerprintService } from './acoustic-fingerprint-service';
import { strategicInsightsInjector } from './strategic-insights-injector';
import { analyticsAutoPilotService } from './analytics-autopilot-service';
import { postingTimeBandit as postingTimeBanditService } from './posting-time-bandit';
import { writeFileSync, existsSync, mkdirSync, unlinkSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import axios from 'axios';
import { TempPaths } from '../utils/temp-file-manager';

// State persistence file path
const STATE_FILE_PATH = join(TempPaths.base(), 'automation-state.json');

export interface OrchestratorConfig {
  videosPerDay: number;
  minViralScore: number;
  excludeFigures: string[];
  discoveryHour: number;
  uploadTimes: string[];
  timezone: string;
  outputDir: string;
  // Long-form content settings
  enableLongForm: boolean;
  longFormFrequency: 'daily' | 'weekly' | 'none';
  shortsPerLongForm: number; // Default 4 shorts per 1 long-form
}

export interface GeneratedVideo {
  id: string;
  figure: string;
  story: string;
  hook: string;
  videoPath: string;
  thumbnailPath?: string;
  createdAt: Date;
  uploadedAt?: Date;
  youtubeId?: string;
  youtubeUrl?: string;
  jobId?: string;
  packageId?: string; // Unity content package ID for theme tracking
  stats?: {
    views: number;
    likes: number;
    comments: number;
  };
}

export interface OrchestratorState {
  isRunning: boolean;
  lastDiscovery: Date | null;
  pendingTopics: TopicCandidate[];
  generatingVideos: string[];
  completedVideos: GeneratedVideo[];
  failedVideos: { topic: TopicCandidate; error: string }[];
  uploadQueue: GeneratedVideo[];
}

export interface OrchestratorStatus {
  isRunning: boolean;
  lastDiscovery: string | null;
  pendingTopics: number;
  generatingVideos: number;
  completedVideos: number;
  failedVideos: number;
  uploadQueue: { pending: number; completed: number };
  nextDiscovery: string | null;
  nextUpload: string | null;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  videosPerDay: 5,
  minViralScore: 7,
  excludeFigures: [],
  discoveryHour: 20, // 8pm for discovery + generation (after 7:30pm strategic summary)
  uploadTimes: ['12:00', '14:00', '16:00', '18:00', '20:00'], // Next day uploads: 12pm, 2pm, 4pm, 6pm, 8pm
  timezone: 'America/Chicago',
  outputDir: './data/videos',
  // Long-form content settings (4 shorts + 1 long-form daily)
  enableLongForm: true,
  longFormFrequency: 'daily',
  shortsPerLongForm: 4,
};

export class UnityOrchestrator {
  private config: OrchestratorConfig;
  private state: OrchestratorState;
  private discoveryInterval: NodeJS.Timeout | null = null;
  private uploadInterval: NodeJS.Timeout | null = null;
  private contentQueue: ContentQueue;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isRunning: false,
      lastDiscovery: null,
      pendingTopics: [],
      generatingVideos: [],
      completedVideos: [],
      failedVideos: [],
      uploadQueue: [],
    };
    this.contentQueue = createContentQueue();

    // Load persisted state and auto-resume if was running
    this.loadPersistedState();
  }

  /**
   * Save automation state to file for persistence across restarts
   */
  private saveState(): void {
    try {
      const dir = dirname(STATE_FILE_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const stateToSave = {
        isRunning: this.state.isRunning,
        lastDiscovery: this.state.lastDiscovery?.toISOString() || null,
        savedAt: new Date().toISOString(),
      };

      writeFileSync(STATE_FILE_PATH, JSON.stringify(stateToSave, null, 2));
      console.log('💾 Automation state saved');
    } catch (error: any) {
      console.error('Failed to save automation state:', error.message);
    }
  }

  /**
   * Load persisted state and auto-resume automation if it was running
   */
  private loadPersistedState(): void {
    try {
      if (existsSync(STATE_FILE_PATH)) {
        const data = readFileSync(STATE_FILE_PATH, 'utf-8');
        const savedState = JSON.parse(data);

        if (savedState.isRunning) {
          console.log('🔄 Automation was running before restart - auto-resuming...');
          // Schedule auto-start after a short delay to let the server fully initialize
          setTimeout(() => {
            try {
              this.start();
            } catch (err: any) {
              console.error('Failed to auto-resume automation:', err.message);
            }
          }, 5000);
        }

        if (savedState.lastDiscovery) {
          this.state.lastDiscovery = new Date(savedState.lastDiscovery);
        }
      }
    } catch (error: any) {
      console.error('Failed to load automation state:', error.message);
    }
  }

  /**
   * Get figures that have been used in the last 90 days (persistent deduplication)
   */
  async getRecentlyUsedFigures(days: number = 90): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      // Query jobs from the last N days that have unity metadata with a topic/figure
      const recentJobs = await db
        .select({
          unityMetadata: jobs.unityMetadata,
          scriptName: jobs.scriptName,
        })
        .from(jobs)
        .where(and(gte(jobs.createdAt, cutoffDate), eq(jobs.mode, 'unity_kling')));

      // Extract figure names from job metadata or script name
      const figures = new Set<string>();
      for (const job of recentJobs) {
        const metadata = job.unityMetadata as any;
        if (metadata?.topic) {
          figures.add(this.normalizeFigureName(metadata.topic));
        }
        // Also extract from script name (e.g., "Julius Caesar - Unity Kling")
        if (job.scriptName) {
          const match = job.scriptName.match(/^(.+?)\s*-\s*Unity/i);
          if (match) {
            figures.add(this.normalizeFigureName(match[1]));
          }
        }
      }

      console.log(`📊 Found ${figures.size} figures used in last ${days} days`);
      return Array.from(figures);
    } catch (error) {
      console.error('Error fetching recent figures:', error);
      return [];
    }
  }

  /**
   * Broad topics that should NOT block specific figures within them
   * e.g., "The Roman Empire" shouldn't block "Julius Caesar"
   */
  private broadTopicsToIgnore = [
    'the roman empire',
    'roman empire',
    'the greek empire',
    'ancient greece',
    'ancient egypt',
    'the british empire',
    'world war',
    'world war 1',
    'world war 2',
    'the renaissance',
    'the middle ages',
    'the mongol empire',
    'the ottoman empire',
    'the persian empire',
  ];

  /**
   * Normalize figure names for comparison (case-insensitive, trimmed)
   */
  private normalizeFigureName(name: string): string {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Extract key terms from a figure name for fuzzy matching
   * Removes common words like "the", "of", "and", etc.
   */
  private extractKeyTerms(name: string): string[] {
    const stopWords = [
      'the',
      'of',
      'and',
      'a',
      'an',
      'in',
      'on',
      'at',
      'to',
      'for',
      'with',
      'by',
      'from',
      'vs',
      'versus',
    ];
    const normalized = this.normalizeFigureName(name);
    return normalized.split(/[\s,\-]+/).filter((word) => word.length > 1 && !stopWords.includes(word));
  }

  /**
   * Check if two figure names likely refer to the same topic
   * Uses fuzzy matching based on key terms overlap
   */
  private figuresMatch(figure1: string, figure2: string): boolean {
    const norm1 = this.normalizeFigureName(figure1);
    const norm2 = this.normalizeFigureName(figure2);

    // Exact match
    if (norm1 === norm2) return true;

    // One contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

    // Key terms overlap check (for cases like "Apollo 8 Crew" vs "Apollo 8 astronauts...")
    const terms1 = this.extractKeyTerms(figure1);
    const terms2 = this.extractKeyTerms(figure2);

    // Check if significant key terms match (at least 2 key terms in common)
    const commonTerms = terms1.filter((t) => terms2.includes(t));
    if (commonTerms.length >= 2) {
      return true;
    }

    // Check for specific patterns like "Name + number" (e.g., "Apollo 8")
    const numericPattern1 = norm1.match(/([a-z]+)\s*(\d+)/);
    const numericPattern2 = norm2.match(/([a-z]+)\s*(\d+)/);
    if (numericPattern1 && numericPattern2) {
      if (numericPattern1[1] === numericPattern2[1] && numericPattern1[2] === numericPattern2[2]) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a name is a broad topic (not a specific figure)
   */
  private isBroadTopic(name: string): boolean {
    const normalized = this.normalizeFigureName(name);
    return this.broadTopicsToIgnore.some((broad) => normalized === broad || normalized.includes(broad));
  }

  /**
   * Check if a figure was recently used (within 90 days)
   * Ignores broad topics - only blocks specific figures
   * Uses fuzzy matching to catch variations of the same topic
   */
  async isFigureRecentlyUsed(figure: string, days: number = 90): Promise<boolean> {
    // Don't block broad topics - they shouldn't prevent specific figures
    if (this.isBroadTopic(figure)) {
      console.log(`   ℹ️ "${figure}" is a broad topic, not blocking specific figures`);
      return false;
    }

    const recentFigures = await this.getRecentlyUsedFigures(days);

    // Filter out broad topics from the block list
    const specificFigures = recentFigures.filter((f) => !this.isBroadTopic(f));

    // Use fuzzy matching instead of exact matching
    const matchingFigure = specificFigures.find((f) => this.figuresMatch(figure, f));
    if (matchingFigure) {
      console.log(`   🔒 Fuzzy match: "${figure}" matches recently used "${matchingFigure}"`);
      return true;
    }

    return false;
  }

  async initialize(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 UNITY ORCHESTRATOR INITIALIZING');
    console.log('='.repeat(60));

    const youtubeEnabled = youtubeUploadService.isEnabled();
    const youtubeAuth = youtubeEnabled ? await youtubeUploadService.isAuthenticated() : false;

    console.log(`✅ YouTube integration: ${youtubeEnabled ? 'Configured' : 'Not configured'}`);
    console.log(`✅ YouTube authenticated: ${youtubeAuth ? 'Yes' : 'No'}`);
    console.log(`✅ Videos per day: ${this.config.videosPerDay}`);
    console.log(`✅ Upload times: ${this.config.uploadTimes.join(', ')}`);
    console.log('='.repeat(60) + '\n');

    // Recover stuck "preparing" jobs (Suno polling was lost after restart)
    await this.recoverStuckJobs();
  }

  /**
   * Recover jobs stuck at "preparing" status (5% progress)
   * These jobs lost their Suno polling when the server restarted
   * Solution: Delete and regenerate them fresh
   */
  private async recoverStuckJobs(): Promise<void> {
    try {
      // Find jobs stuck at "preparing" with low progress
      const stuckJobs = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, 'preparing'), eq(jobs.mode, 'unity_kling')));

      if (stuckJobs.length === 0) {
        return;
      }

      console.log(`\n🔧 RECOVERY: Found ${stuckJobs.length} stuck "preparing" jobs`);

      for (const job of stuckJobs) {
        const metadata = job.unityMetadata as any;

        // Extract figure name with multiple fallbacks:
        // 1. metadata.topic (most reliable)
        // 2. Regex to strip common suffixes from scriptName
        // 3. Skip if no valid figure can be determined
        let figure = metadata?.topic;
        if (!figure && job.scriptName) {
          // Strip common suffixes: "- Unity Kling", "- Unity VEO", "- Quality Test", "- Fresh YYYY-MM-DD", etc.
          figure = job.scriptName
            .replace(
              /\s*-\s*(Unity\s*(Kling|VEO)|Quality\s*(Test|Loop\s*Tes.*)|Fresh\s*\d{4}-\d{2}-\d{2}|Parallel\s*\d+).*$/i,
              '',
            )
            .trim();
        }

        // Skip if we couldn't extract a valid figure name
        if (!figure || figure === 'Unknown' || figure.length < 2) {
          console.log(`   ⚠️ Skipping job ${job.id}: Unable to extract figure name from "${job.scriptName}"`);
          continue;
        }

        const story = job.scriptContent || '';

        console.log(`   🔄 Recovering: ${figure}`);

        // Delete the stuck job
        await db.delete(jobs).where(eq(jobs.id, job.id));
        console.log(`      ✅ Deleted stuck job: ${job.id}`);

        // Queue for regeneration (don't regenerate immediately to avoid blocking)
        this.state.pendingTopics.push({
          figure,
          event: story,
          hook: metadata?.hook || `The incredible story of ${figure}`,
          whyNow: 'Recovery from stuck Suno generation',
          category: 'historical' as const,
          viralScore: 8,
          source: 'recovery' as any,
        });

        console.log(`      📋 Queued for regeneration: ${figure}`);
      }

      console.log(`✅ RECOVERY: Queued ${stuckJobs.length} figures for regeneration\n`);
    } catch (error: any) {
      console.error(`⚠️ Recovery failed: ${error.message}`);
    }
  }

  async runDiscovery(): Promise<TopicCandidate[]> {
    console.log('\n📡 Running content discovery...\n');

    // Get figures used in last 90 days from database (persistent deduplication)
    const recentlyUsedFigures = await this.getRecentlyUsedFigures(90);
    console.log(`🔒 Excluding ${recentlyUsedFigures.length} figures used in last 90 days`);

    let allTopics: TopicCandidate[] = [];

    // Step 1: Try YouTube Trends discovery (new!)
    try {
      console.log('📈 Checking YouTube trends for topic ideas...');
      const { youtubeTrendsService } = await import('./youtube-trends-service');

      if (youtubeTrendsService.isConfigured()) {
        const trendTopics = await youtubeTrendsService.getTrendingTopicsForGeneration(3);

        if (trendTopics.length > 0) {
          console.log(`✅ Found ${trendTopics.length} trending-inspired topics:`);

          // Convert trend topics to TopicCandidate format
          for (const trendTopic of trendTopics) {
            const matchingFigure = recentlyUsedFigures.find((f) => this.figuresMatch(trendTopic.character1.name, f));

            if (matchingFigure) {
              console.log(
                `   ⏭️ Skipping ${trendTopic.character1.name} (fuzzy match: "${matchingFigure}" used within 90 days)`,
              );
              continue;
            }

            console.log(`   📺 ${trendTopic.character1.name} (trend: ${trendTopic.trendSource})`);

            // Convert trend topic to full TopicCandidate format
            allTopics.push({
              figure: trendTopic.character1.name,
              event: trendTopic.angle, // Creative angle as event description
              hook: trendTopic.topic, // Suggested title as hook
              whyNow: `Matches trending theme: ${trendTopic.trendSource.replace('youtube_trending:', '')}`,
              category: 'trending',
              viralScore: 9, // High priority for trend-matched content
              source: 'trending' as const, // Use valid source type
            });
          }
        }
      } else {
        console.log('   ⚠️ YouTube trends not configured, using fallback discovery');
      }
    } catch (trendError: any) {
      console.log(`   ⚠️ Trends discovery failed: ${trendError.message}`);
    }

    // Step 2: Gap Detection - find content opportunities based on competitor analysis
    try {
      console.log('\n🔍 Checking content gaps & extensions for opportunities...');
      const { gapDetectionService } = await import('./gap-detection-service');

      // Get both gaps (untapped topics) and extensions (topics to revisit with fresh angle)
      const allOpportunities = await gapDetectionService.getAllOpportunities();
      const gapOpportunities = allOpportunities.gaps;
      const extensionOpportunities = allOpportunities.extensions;

      console.log(`   📊 Found: ${gapOpportunities.length} gaps, ${extensionOpportunities.length} extensions`);

      // Process GAP opportunities (topics we haven't covered)
      if (gapOpportunities.length > 0) {
        console.log(`\n   🆕 GAPS (untapped topics):`);

        for (const gap of gapOpportunities.slice(0, 2)) {
          // Take top 2 gap opportunities
          const mainFigure = gap.historicalFigures[0] || gap.topic;
          const matchingFigure = recentlyUsedFigures.find((f) => this.figuresMatch(mainFigure, f));

          if (matchingFigure) {
            console.log(`      ⏭️ Skipping ${mainFigure} (fuzzy match: "${matchingFigure}" used within 90 days)`);
            continue;
          }

          if (allTopics.some((t) => this.figuresMatch(t.figure, mainFigure))) {
            console.log(`      ⏭️ Skipping ${mainFigure} (already selected)`);
            continue;
          }

          console.log(
            `      🎯 ${mainFigure} (score: ${gap.score}, ${gap.competitorViews.toLocaleString()} competitor views)`,
          );

          allTopics.push({
            figure: mainFigure,
            event: gap.suggestedAngles[0] || `The untold story of ${mainFigure}`,
            hook: gap.reasons[0] || `What really happened to ${mainFigure}`,
            whyNow: `Content gap: competitors have ${gap.competitorViews.toLocaleString()} views on similar content`,
            category: 'gap',
            viralScore: Math.min(10, gap.score / 10),
            source: 'suggested' as const,
          });
        }
      }

      // Process EXTENSION opportunities (topics to revisit with fresh angle)
      if (extensionOpportunities.length > 0) {
        console.log(`\n   🔄 EXTENSIONS (fresh angle on covered topics):`);

        for (const ext of extensionOpportunities.slice(0, 1)) {
          // Take top 1 extension opportunity
          const mainFigure = ext.historicalFigures[0] || ext.topic;

          // Extensions can bypass 90-day rule since they're intentional revisits
          if (allTopics.some((t) => this.figuresMatch(t.figure, mainFigure))) {
            console.log(`      ⏭️ Skipping ${mainFigure} (already selected this run)`);
            continue;
          }

          console.log(
            `      🔄 ${mainFigure} (score: ${ext.score}, ${ext.competitorViews.toLocaleString()} competitor views)`,
          );
          console.log(`         → Fresh angle: ${ext.suggestedAngles[0]}`);

          allTopics.push({
            figure: mainFigure,
            event: ext.suggestedAngles[0] || `A new perspective on ${mainFigure}`,
            hook: ext.reasons[0] || `What we missed about ${mainFigure}`,
            whyNow: `Extension: competitors crushing with ${ext.competitorViews.toLocaleString()} views - fresh angle needed`,
            category: 'extension',
            viralScore: Math.min(10, ext.score / 10),
            source: 'suggested' as const,
          });
        }
      }

      if (gapOpportunities.length === 0 && extensionOpportunities.length === 0) {
        console.log('   ℹ️ No gap or extension opportunities found');
      }
    } catch (gapError: any) {
      console.log(`   ⚠️ Gap detection failed: ${gapError.message}`);
    }

    // Step 3: Fill remaining slots with traditional discovery
    const remainingSlots = this.config.videosPerDay - allTopics.length;

    if (remainingSlots > 0) {
      console.log(`\n🎯 Discovering ${remainingSlots} additional topics via traditional pipeline...`);

      const discoveryConfig: DiscoveryConfig = {
        videosPerDay: remainingSlots,
        preferredCategories: [],
        excludeFigures: [
          ...this.config.excludeFigures,
          ...this.state.completedVideos.map((v) => v.figure),
          ...recentlyUsedFigures,
          ...allTopics.map((t) => t.figure), // Exclude already-selected trend topics
        ],
        minViralScore: this.config.minViralScore,
      };

      const traditionalTopics = await discoverContent(discoveryConfig);

      // Double-check: filter out any topics that match recently used figures (using fuzzy matching)
      const filteredTraditional = traditionalTopics.filter((topic) => {
        const matchingFigure = recentlyUsedFigures.find((f) => this.figuresMatch(topic.figure, f));
        if (matchingFigure) {
          console.log(`   ⏭️ Skipping ${topic.figure} (fuzzy match: "${matchingFigure}" used within 90 days)`);
        }
        return !matchingFigure;
      });

      allTopics = [...allTopics, ...filteredTraditional];
    }

    this.state.pendingTopics = allTopics;
    this.state.lastDiscovery = new Date();

    allTopics.forEach((topic) => {
      this.contentQueue.add(topic);
    });

    const trendCount = allTopics.filter((t) => t.source === 'trending' || t.category === 'trending').length;
    console.log(`\n✅ Discovered ${allTopics.length} topics for today (${trendCount} from YouTube trends)`);

    return allTopics;
  }

  async generateVideoForTopic(
    topic: TopicCandidate,
    force: boolean = false,
    userId?: string,
  ): Promise<GeneratedVideo | null> {
    const videoId = `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check 90-day deduplication before generating (skip if force flag is true)
    if (!force) {
      const isRecent = await this.isFigureRecentlyUsed(topic.figure, 90);
      if (isRecent) {
        console.log(`\n⚠️ BLOCKED: ${topic.figure} was already used within 90 days`);
        throw new Error(
          `"${topic.figure}" was already generated within the last 90 days. Please choose a different historical figure.`,
        );
      }
    } else {
      console.log(`\n⚡ FORCE REGENERATION: Bypassing 90-day check for ${topic.figure}`);
    }

    console.log(`\n🎬 Generating video: ${topic.figure}`);
    console.log(`   Hook: ${topic.hook}`);

    // Step 0a: CONSENSUS ENGINE - Cross-model AI verification (GPT-4o + Gemini)
    // This is critical for Google audit - videos are BLOCKED if GPT-4o and Gemini disagree
    let consensusResult: any = null;
    try {
      const { consensusEngine } = await import('./consensus-engine');
      console.log(`   🔄 Running cross-model consensus check (GPT-4o + Gemini)...`);

      consensusResult = await consensusEngine.validateAndProceed(topic.figure);

      // CRITICAL: Block video production if Master Judge returns BLOCKED
      if (consensusResult.action === 'BLOCKED') {
        console.log(`   ❌ BLOCKED BY CONSENSUS ENGINE`);
        console.log(`   📋 Reason: ${consensusResult.actionReasoning}`);
        console.log(`   ⛔ Conflicts detected: ${consensusResult.conflicts.length}`);
        for (const conflict of consensusResult.conflicts.slice(0, 3)) {
          console.log(
            `      - [${conflict.severity.toUpperCase()}] ${conflict.type}: GPT="${conflict.gptClaim.substring(0, 50)}..." vs Gemini="${conflict.geminiClaim.substring(0, 50)}..."`,
          );
        }
        // Actually BLOCK production - this proves the safety system works
        throw new Error(
          `CONSENSUS_BLOCKED: ${topic.figure} failed cross-model verification. ${consensusResult.blockedReason || 'Critical conflicts between GPT-4o and Gemini.'}`,
        );
      } else if (consensusResult.action === 'MANUAL_REVIEW') {
        console.log(`   ⚠️ MANUAL REVIEW REQUIRED (score: ${consensusResult.consensusScore}/100)`);
        console.log(`   📋 Reason: ${consensusResult.actionReasoning}`);
        // Log but continue - not critical enough to block
      } else if (consensusResult.action === 'PROCEED') {
        console.log(`   ✅ CONSENSUS VERIFIED (score: ${consensusResult.consensusScore}/100)`);
        console.log(`   📋 GPT-4o ✓ | Gemini ✓ | Master Judge: PROCEED`);
      }
    } catch (consensusError: any) {
      // If it's a CONSENSUS_BLOCKED error, re-throw to stop production
      if (consensusError.message.startsWith('CONSENSUS_BLOCKED:')) {
        throw consensusError;
      }
      console.log(`   ⚠️ Consensus check skipped: ${consensusError.message}`);
    }

    this.state.generatingVideos.push(videoId);

    let jobId: string | null = null;

    try {
      // Step 0: Select A/B test variant for this video (check auto-pilot first)
      let styleVariant: StyleVariant;
      const autoPilotStatus = analyticsAutoPilotService.getStatus();

      if (autoPilotStatus.isActive && autoPilotStatus.forcedStyle) {
        // Auto-pilot has a forced style from nightly strategic summary
        styleVariant =
          abTestingService.getVariantByName(autoPilotStatus.forcedStyle) ||
          abTestingService.selectVariant(topic.figure);
        console.log(`   🤖 [AUTO-PILOT] Forced style: "${styleVariant.name}"`);
      } else {
        styleVariant = abTestingService.selectVariant(topic.figure);
        console.log(`   🎲 A/B Test: Using "${styleVariant.name}" style variant`);
      }

      // Step 0.5: Get creative analytics insights for optimized hook/thumbnail
      let optimizedHook = topic.hook;
      let thumbnailPrompt = '';
      let thumbnailVariant: string | null = null;
      try {
        const { creativeAnalyticsService } = await import('./creative-analytics-service');
        const formulas = creativeAnalyticsService.getWinningFormulas();

        // Generate optimized hook using winning patterns
        optimizedHook = creativeAnalyticsService.generateOptimizedHook(topic.figure, topic.event.substring(0, 60));

        // Use A/B tested thumbnail variant instead of fixed formula
        const thumbnailResult = creativeAnalyticsService.assignThumbnailVariant(
          videoId,
          topic.figure,
          undefined, // second figure if VS format
        );
        thumbnailPrompt = thumbnailResult.thumbnailPrompt;
        thumbnailVariant = thumbnailResult.variant.id;

        console.log(`   🎯 Creative Analytics: Applied winning hook formula`);
        console.log(`   🎨 Thumbnail A/B: Using "${thumbnailResult.variant.name}" variant`);
        console.log(`   📷 Prompt: ${thumbnailPrompt.substring(0, 80)}...`);
      } catch (err) {
        // Creative analytics not available, use original hook
        optimizedHook = topic.hook;
      }

      // Step 0.6: Apply auto-fixes based on analytics learnings (conservative, confidence-based)
      let autoFixModifications: string[] = [];
      let autoFixVisuals: Record<string, any> = {};
      try {
        const { autoFixService } = await import('./auto-fix-service');
        autoFixModifications = autoFixService.getPromptModifications();
        autoFixVisuals = autoFixService.getVisualModifications();

        if (autoFixModifications.length > 0) {
          console.log(`   🔧 Auto-Fix: Applying ${autoFixModifications.length} learned fixes`);
        }
      } catch (err) {
        // Auto-fix service not available
      }

      // Step 0.7: Apply Strategic Insights from triple-model consensus (GPT-4o + Gemini + Claude)
      // Also check auto-pilot for forced theme
      let strategicInsights: string = '';
      try {
        const insights = await strategicInsightsInjector.getInjectedInsights();
        if (insights && insights.confidenceLevel !== 'low') {
          strategicInsights = await strategicInsightsInjector.getLyricInjection();

          // Check if auto-pilot has a forced theme (from nightly strategic summary)
          if (autoPilotStatus.isActive && autoPilotStatus.forcedTheme) {
            const forcedTheme = autoPilotStatus.forcedTheme;
            if (
              topic.figure.toLowerCase().includes(forcedTheme.toLowerCase()) ||
              topic.event.toLowerCase().includes(forcedTheme.toLowerCase())
            ) {
              console.log(`   🤖 [AUTO-PILOT] Theme matches forced priority: "${forcedTheme}"`);
              console.log(`      Topic will be prioritized for generation`);
            }
          }

          // Check if this theme should be prioritized (traditional strategic insights)
          const themePriority = await strategicInsightsInjector.shouldPrioritizeTheme(topic.figure);
          if (themePriority.prioritize) {
            console.log(`   🎯 Strategic Priority: ${topic.figure} matches winning pattern`);
            console.log(`      Reason: ${themePriority.reason}`);
          }

          console.log(`   📊 Strategic Insights: Injecting ${insights.confidenceLevel}-confidence learnings`);
          console.log(`      Narrative: ${insights.narrativeStyle || 'standard'}`);
        }
      } catch (err) {
        // Strategic insights not available
      }

      // Step 1: Generate video prompts using GPT (with style variant)
      console.log(`   📝 Generating video prompts...`);
      const prompts = await this.generatePromptsForTopic(topic, styleVariant);
      console.log(`   ✅ Generated ${prompts.length} prompts`);

      // Step 1b: Research the figure for era/appearance metadata
      const research = await this.researchFigure(topic);
      console.log(`   🔍 Research: ${research.era}, ${research.occupation}`);

      // Step 2: Create job IMMEDIATELY so it shows in the queue
      const jobName = `${topic.figure} - Unity Kling`;

      // Create a placeholder package first
      const veoPrompts = prompts.map((prompt, index) => ({
        clipNumber: index + 1,
        prompt: prompt,
        duration: 5,
        aspectRatio: '9:16',
      }));

      const packageData: any = {
        topic: topic.figure,
        figure: topic.figure,
        story: topic.event,
        hook: topic.hook,
        optimizedHook: optimizedHook,
        thumbnailPrompt: thumbnailPrompt,
        prompts: prompts,
        veoPrompts: veoPrompts,
        clipDuration: 5,
        aspectRatio: '9:16',
        videoEngine: 'kling',
        research: {
          era: research.era,
          gender: research.gender,
          appearance: research.appearance,
          setting: research.setting,
          nationality: research.nationality,
          occupation: research.occupation,
        },
        stylePreset: 'documentary',
        automationSource: 'unity_orchestrator',
        viralScore: topic.viralScore,
        abTestVariant: {
          id: styleVariant.id,
          name: styleVariant.name,
          visualStyle: styleVariant.visualStyle,
          colorGrade: styleVariant.colorGrade,
        },
        creativeAnalytics: {
          appliedFormulas: true,
          hookOptimized: optimizedHook !== topic.hook,
          thumbnailOptimized: !!thumbnailPrompt,
          thumbnailVariant: thumbnailVariant,
        },
        autoFixes: {
          promptModifications: autoFixModifications,
          visualModifications: autoFixVisuals,
          fixCount: autoFixModifications.length,
        },
      };

      const savedPackage = await storage.createUnityContentPackage({
        title: `${topic.figure} - Auto`,
        topic: topic.figure,
        status: 'preparing',
        packageData: packageData,
      });

      console.log(`   📦 Created package: ${savedPackage.id}`);

      // Record auto-fix application for outcome tracking
      if (autoFixModifications.length > 0) {
        try {
          const { autoFixService } = await import('./auto-fix-service');
          autoFixService.recordFixApplication(videoId, savedPackage.id);
        } catch (err) {
          // Auto-fix service not available
        }
      }

      // Check if this video should be a holdout (skip pattern enhancements for A/B testing)
      const holdoutResult = patternIntelligenceService.shouldBeHoldout(savedPackage.id);
      if (holdoutResult.isHoldout) {
        console.log(`   🧪 A/B HOLDOUT: This video will NOT apply learned patterns (control group)`);
      } else {
        console.log(`   📊 Pattern enhancements will be applied to this video`);
      }

      // Create job with "preparing" status - visible immediately in queue!
      const [job] = await db
        .insert(jobs)
        .values({
          scriptName: jobName,
          scriptContent: topic.event,
          mode: 'unity_kling',
          aspectRatio: '9:16',
          status: 'preparing',
          progress: 0,
          clipCount: prompts.length,
          userId: userId || null,
          unityMetadata: {
            packageId: savedPackage.id,
            promptCount: prompts.length,
            estimatedCost: prompts.length * 0.1,
            automationSource: 'unity_orchestrator',
            topic: topic.figure,
            hook: topic.hook,
            optimizedHook: optimizedHook,
            thumbnailPrompt: thumbnailPrompt,
            viralScore: topic.viralScore,
            videoEngine: 'kling',
            includeKaraoke: false,
            karaokeStyle: 'bounce',
            preparingMusic: true,
            // Pattern intelligence tracking
            isHoldout: holdoutResult.isHoldout,
            holdoutReason: holdoutResult.reason,
            patternEnhancementsApplied: !holdoutResult.isHoldout,
            // Creative analytics tracking
            creativeAnalyticsApplied: true,
            // Auto-fix tracking (for outcome measurement)
            autoFixesApplied: autoFixModifications.length,
            autoFixModifications: autoFixModifications,
            // Consensus Engine tracking (GPT-4o + Gemini verification)
            consensusStatus: consensusResult?.status || 'skipped',
            consensusScore: consensusResult?.consensusScore || 0,
            consensusConflicts: consensusResult?.conflicts?.length || 0,
          } as any,
        } as any)
        .returning();

      jobId = job.id;
      console.log(`   🎬 Created job: ${job.id} (visible in queue)`);

      // Step 3: Generate rap lyrics for the topic
      console.log(`   🎤 Generating rap lyrics...`);
      let lyrics = '';
      // Use gender-appropriate vocals based on historical figure
      const isFemale = detectFemaleCharacter(topic.figure);
      const vocalStyle = isFemale ? 'female rap vocals' : 'aggressive male rap vocals';
      let sunoTags = `epic trap, ${vocalStyle}, orchestral, cinematic`;
      console.log(`   🎙️ Vocal style: ${isFemale ? 'FEMALE' : 'MALE'} (${topic.figure})`);
      let audioFilePath: string | undefined;
      let sunoDuration: number | undefined; // Store duration for job update

      // Step 3: Generate lyrics (separate try/catch from Suno)
      try {
        // Build facts array with strategic insights injection
        const baseFacts = [topic.event, topic.hook];

        // FEEDBACK LOOP: Inject strategic insights into lyric generation
        if (strategicInsights && strategicInsights.trim()) {
          baseFacts.push(strategicInsights);
          console.log(`   🔗 Feedback Loop: Injecting strategic insights into lyrics`);
        }

        const lyricsResult = await generateViralLyrics(
          topic.figure,
          topic.year ? `${topic.year}` : 'Historical',
          topic.category || 'historical',
          baseFacts,
          'triumphant',
        );
        lyrics = lyricsResult.lyrics;
        sunoTags = lyricsResult.sunoTags || sunoTags;
        console.log(`   ✅ Generated lyrics (${lyrics.length} chars)`);

        // Extract and save lyric features for performance tracking
        try {
          const features = lyricAnalyticsService.extractFeatures(lyrics);
          await lyricAnalyticsService.saveFeatures(savedPackage.id, features);
          console.log(
            `   📊 Lyric features extracted: ${features.perspective}/${features.hookStyle}/${features.rhymeScheme}`,
          );
        } catch (featureErr: any) {
          console.warn(`   ⚠️ Lyric feature extraction failed: ${featureErr.message}`);
        }
      } catch (lyricsError: any) {
        const isQuotaOrRateLimit =
          lyricsError.message?.includes('429') ||
          lyricsError.message?.includes('quota') ||
          lyricsError.message?.includes('rate limit') ||
          lyricsError.message?.includes('RESOURCE_EXHAUSTED') ||
          lyricsError.status === 429;

        if (isQuotaOrRateLimit) {
          console.warn(`   ⚠️ Lyrics generation hit quota/rate limit: ${lyricsError.message}`);
        } else {
          console.warn(`   ⚠️ Lyrics generation failed: ${lyricsError.message}`);
        }
        (packageData as any).lyricsFailed = true;
        (packageData as any).lyricsFailureReason = lyricsError.message;
        console.error(`   ❌ LYRICS GENERATION FAILED - package will have no lyrics/music`);
      }

      // Step 4: Generate music with Suno (separate try/catch — only if lyrics succeeded)
      if (lyrics) {
        // Update job progress
        await db.update(jobs).set({ progress: 5 }).where(eq(jobs.id, job.id));

        try {
          console.log(`   🎵 Generating music with Suno...`);
          const sunoResult = await this.generateSunoMusic(topic.figure, lyrics, sunoTags, savedPackage.id, job.id);
          if (sunoResult) {
            audioFilePath = sunoResult.audioFilePath;
            sunoDuration = sunoResult.duration;
            console.log(`   ✅ Music generated: ${audioFilePath} (${sunoDuration}s)`);

            // Store audio analysis in package data for subtitle generation
            if (sunoResult.audioAnalysis) {
              packageData.audioAnalysis = sunoResult.audioAnalysis;
              console.log(`   📊 Audio analysis stored in package (BPM: ${sunoResult.audioAnalysis.bpm})`);
            }

            // Store acoustic fingerprint for retention correlation
            if (sunoResult.acousticFingerprint) {
              packageData.acousticFingerprint = sunoResult.acousticFingerprint;
              console.log(
                `   🧬 Acoustic fingerprint stored (Hook Survival: ${(sunoResult.acousticFingerprint.predicted_hook_survival * 100).toFixed(0)}%)`,
              );

              // Save to audio_dna table for strategic analysis
              try {
                await acousticFingerprintService.storeFingerprint(
                  savedPackage.id.toString(),
                  sunoResult.acousticFingerprint,
                );
                console.log(`   💾 Fingerprint saved to database for correlation analysis`);
              } catch (dbError: any) {
                console.warn(`   ⚠️ Failed to save fingerprint to DB: ${dbError.message}`);
              }
            }
          }
        } catch (sunoError: any) {
          console.error(`   ❌ Suno music generation failed: ${sunoError.message}`);
          (packageData as any).sunoFailed = true;
          (packageData as any).sunoFailureReason = sunoError.message;
          console.log(`   ℹ️ Continuing without music/karaoke — job-worker will attempt Suno retry`);
        }
      }

      // Step 5: Update package with audio, lyrics, and analysis
      const includeKaraoke = !!audioFilePath;

      if (lyrics) {
        packageData.lyrics = { raw: lyrics };
      }

      await storage.updateUnityContentPackage(savedPackage.id, {
        status: 'generating',
        audioFilePath: audioFilePath,
        packageData: packageData,
      });

      // Step 6: Update job to queued status (ready for Kling processing)
      // CRITICAL: Set musicUrl so FFmpeg can merge audio with video
      const musicUrl = audioFilePath ? `/api/suno-audio/${audioFilePath.split('/').pop()}` : null;
      if (musicUrl) {
        console.log(`   🎵 Setting musicUrl on job: ${musicUrl}`);
      }

      await db
        .update(jobs)
        .set({
          status: 'queued',
          progress: 0,
          musicUrl: musicUrl,
          audioDuration: sunoDuration?.toString() || null,
          unityMetadata: {
            ...job.unityMetadata,
            packageId: savedPackage.id,
            promptCount: prompts.length,
            estimatedCost: prompts.length * 0.1,
            automationSource: 'unity_orchestrator',
            topic: topic.figure,
            hook: topic.hook,
            viralScore: topic.viralScore,
            videoEngine: 'kling',
            includeKaraoke: includeKaraoke,
            karaokeStyle: 'bounce',
            preparingMusic: false,
            appliedThemeIds: topic.appliedThemeIds,
          },
        })
        .where(eq(jobs.id, job.id));

      console.log(`   ✅ Job updated to queued status`);
      if (includeKaraoke) {
        console.log(`   🎤 Karaoke subtitles: ENABLED (bounce style)`);
      }

      const generatedVideo: GeneratedVideo = {
        id: videoId,
        figure: topic.figure,
        story: topic.event,
        hook: topic.hook,
        videoPath: '',
        createdAt: new Date(),
        jobId: job.id,
        packageId: savedPackage.id, // For theme tracking
      };

      autoContentDiscovery.addExcludedFigure(topic.figure);

      console.log(`✅ Job queued for processing: ${job.id}`);

      this.startJobMonitor(job.id, generatedVideo, topic);

      return generatedVideo;
    } catch (error: any) {
      console.error(`❌ Generation failed: ${error.message}`);
      this.state.failedVideos.push({ topic, error: error.message });
      this.state.generatingVideos = this.state.generatingVideos.filter((id) => id !== videoId);

      // Mark job as failed if it was created
      if (jobId) {
        await db
          .update(jobs)
          .set({
            status: 'failed',
            errorMessage: error.message,
          })
          .where(eq(jobs.id, jobId));
      }

      return null;
    }
  }

  /**
   * Research a historical figure using Gemini to get key biographical details
   * for accurate video prompt generation
   */
  private async researchFigure(topic: TopicCandidate): Promise<{
    gender: string;
    era: string;
    setting: string;
    appearance: string;
    keyEvents: string[];
    occupation: string;
    nationality: string;
  }> {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
      const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are a historical research assistant. Given this historical figure, return ONLY a JSON object with biographical details for video production.

Figure: ${topic.figure}
Story context: ${topic.event}

Return JSON with these exact keys:
{
  "gender": "male" or "female",
  "era": "specific time period, e.g. 17th century France (1670-1707)",
  "setting": "primary locations, e.g. Paris Opera, French countryside, royal court",
  "appearance": "detailed physical description for video: hair color, build, distinctive features, typical clothing of the era",
  "keyEvents": ["event 1 in 1-2 sentences", "event 2", ...up to 8 key events],
  "occupation": "their role/profession, e.g. opera singer and swordswoman",
  "nationality": "e.g. French"
}

Be specific and historically accurate. The appearance should describe what they'd look like in period-accurate clothing.`,
              },
            ],
          },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      });

      const text = result.response.text();
      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`   🔍 Character research: ${parsed.gender}, ${parsed.era}, ${parsed.occupation}`);
        return parsed;
      }
    } catch (err: any) {
      console.warn(`   ⚠️ Character research failed: ${err.message}`);
    }

    // Minimal fallback
    return {
      gender: 'unknown',
      era: topic.year ? `${topic.year}` : 'historical era',
      setting: 'period-accurate historical setting',
      appearance: 'period-accurate clothing and appearance',
      keyEvents: [topic.event],
      occupation: 'historical figure',
      nationality: 'unknown',
    };
  }

  private async generatePromptsForTopic(topic: TopicCandidate, styleVariant?: StyleVariant): Promise<string[]> {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Generate 26 prompts for full song coverage (~130s at 5s per clip)
    const TARGET_PROMPT_COUNT = 26;

    // Step 1: Research the figure for accurate prompts
    const research = await this.researchFigure(topic);

    // Build style instructions from A/B test variant
    let styleInstructions = '';
    if (styleVariant) {
      styleInstructions = `
VISUAL STYLE: "${styleVariant.name}"
- Visual approach: ${styleVariant.visualStyle.toUpperCase()}
- Color palette: ${styleVariant.colorGrade.replace('_', ' ')}
- Camera work: ${styleVariant.cameraStyle.replace('_', ' ')}
- Lighting: ${styleVariant.lighting.replace('_', ' ')}
- Style modifiers: ${styleVariant.promptModifiers.join(', ')}`;
    }

    // Fetch analytics learnings to enhance prompts
    let analyticsEnhancements = '';
    try {
      const { youtubeAnalyticsService } = await import('./youtube-analytics-service');
      const learnings = await youtubeAnalyticsService.getVideoGenerationLearnings();

      if (learnings.visualStyles?.length > 0 || learnings.narrativeApproaches?.length > 0) {
        analyticsEnhancements = `
LEARNED FROM TOP PERFORMERS:
- Visual styles that work: ${learnings.visualStyles?.slice(0, 3).join(', ') || 'Cinematic dramatic lighting'}
- Narrative approaches: ${learnings.narrativeApproaches?.slice(0, 3).join(', ') || 'Epic storytelling'}`;
        console.log(`   📊 Applied analytics learnings to prompt generation`);
      }
    } catch (error) {
      // Analytics not available, continue without enhancements
    }

    const prompt = `You are a cinematic director creating video prompts for a historical documentary about a real person.

CHARACTER RESEARCH:
- Name: ${topic.figure}
- Gender: ${research.gender}
- Era: ${research.era}
- Nationality: ${research.nationality}
- Occupation: ${research.occupation}
- Appearance: ${research.appearance}
- Setting/Locations: ${research.setting}
- Story: ${topic.event}
- Hook: ${topic.hook}

KEY EVENTS TO DEPICT:
${research.keyEvents.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Generate EXACTLY ${TARGET_PROMPT_COUNT} vivid, cinematic video prompts that tell this person's story visually.

RULES:
- Each prompt is 1-2 sentences describing a SPECIFIC scene for a 5-second video clip
- ALWAYS specify the character's gender, appearance, and era-accurate clothing in EVERY prompt
- Use the character's NAME in every prompt (e.g. "${topic.figure}, a ${research.gender} ${research.occupation}")
- Include specific historical details: locations, objects, architecture from ${research.era}
- NO generic scenes. Every prompt must depict a SPECIFIC moment from their life
- ${research.gender === 'female' ? 'This is a WOMAN. Show her as the protagonist in every scene. Do NOT show men as the main subject.' : ''}
${styleVariant ? styleInstructions : 'Use documentary film style with dramatic cinematic lighting.'}
${analyticsEnhancements}

STRUCTURE (${TARGET_PROMPT_COUNT} prompts):
- Prompts 1-3: HOOK - Most dramatic/shocking moment to grab attention
- Prompts 4-8: ORIGIN - Early life, training, first defining moments
- Prompts 9-14: RISE - Key achievements, victories, signature moments
- Prompts 15-20: CONFLICT - Greatest challenges, enemies, dramatic confrontations
- Prompts 21-24: CLIMAX - The defining moment of their story
- Prompts 25-26: LEGACY - Final chapter and lasting impact

Return ONLY a JSON object: {"prompts": ["prompt 1", "prompt 2", ...]}`;

    try {
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      });

      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('   ⚠️ Gemini returned non-JSON, using fallback');
        return this.getDefaultPrompts(topic, research);
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const prompts = Array.isArray(parsed) ? parsed : parsed.prompts || [];

      if (prompts.length === 0) {
        return this.getDefaultPrompts(topic, research);
      }

      console.log(`   📝 Generated ${prompts.length} research-backed prompts via Gemini`);
      return prompts.slice(0, TARGET_PROMPT_COUNT);
    } catch (error: any) {
      console.error(`   ⚠️ Gemini prompt generation failed: ${error.message}`);
      return this.getDefaultPrompts(topic, research);
    }
  }

  private getDefaultPrompts(
    topic: TopicCandidate,
    research?: {
      gender: string;
      era: string;
      setting: string;
      appearance: string;
      keyEvents: string[];
      occupation: string;
      nationality: string;
    },
  ): string[] {
    const figure = topic.figure;
    const gender = research?.gender || 'person';
    const pronoun = gender === 'female' ? 'she' : gender === 'male' ? 'he' : 'they';
    const era = research?.era || 'historical period';
    const appearance = research?.appearance || 'period-accurate clothing';
    const setting = research?.setting || 'historical setting';
    const occupation = research?.occupation || 'historical figure';
    const events = research?.keyEvents || [topic.event];
    const desc = `${figure}, a ${gender} ${occupation} of ${era}, ${appearance}`;

    // Build event-specific prompts from research
    const eventPrompts = events
      .slice(0, 8)
      .map((event) => `${desc}, ${event}, cinematic documentary style, dramatic lighting`);

    const basePrompts = [
      // HOOK (1-3)
      `Close-up of ${figure}, ${appearance}, intense eyes looking directly at camera, ${era} setting, dramatic chiaroscuro lighting`,
      `${desc}, in a dramatic moment that defined ${pronoun === 'they' ? 'their' : pronoun === 'she' ? 'her' : 'his'} legend, ${setting}, cinematic wide shot`,
      `Young ${figure} as a child in ${era} ${setting}, ${gender === 'female' ? 'girl' : gender === 'male' ? 'boy' : 'child'} with determined expression, golden hour`,
      // RISE (4-8) - use researched events
      ...eventPrompts.slice(0, 5),
      // PEAK (9-13)
      `${desc}, at the height of ${pronoun === 'they' ? 'their' : pronoun === 'she' ? 'her' : 'his'} fame, commanding presence, ${setting}, epic wide shot`,
      ...eventPrompts.slice(5, 8),
      `${figure}, ${appearance}, surrounded by admirers in ${setting}, golden hour documentary framing`,
      // TENSION (14-18)
      `${desc}, facing a powerful enemy, tense confrontation, low-key dramatic lighting`,
      `${figure}, ${appearance}, wounded but defiant, emotional close-up, ${era} battlefield or arena`,
      `${desc}, making a desperate decision, rain or storm, dramatic low angle`,
      `${figure} alone, ${appearance}, contemplating sacrifice, intimate close-up in candlelight`,
      `${desc}, experiencing devastating loss, grief-stricken, ${setting}, somber lighting`,
      // CLIMAX (19-23)
      `${desc}, rising for one final stand, determination blazing, epic scale, dramatic clouds`,
      `${figure}, ${appearance}, in ${pronoun === 'they' ? 'their' : pronoun === 'she' ? 'her' : 'his'} greatest triumph, triumphant pose, ${setting}`,
      `${desc}, achieving the impossible, crowd witnessing, ${era} architecture, golden light`,
      `${figure} at peace after a lifetime of struggle, wisdom in eyes, soft warm lighting`,
      `${figure}'s legacy: symbolic imagery of ${pronoun === 'they' ? 'their' : pronoun === 'she' ? 'her' : 'his'} impact, ${setting}, documentary wide shot`,
      // LEGACY (24-26)
      `Monument or tribute to ${figure}, ${era} style memorial, documentary archival aesthetic`,
      `${figure}'s lasting impact on history, montage of ${pronoun === 'they' ? 'their' : pronoun === 'she' ? 'her' : 'his'} achievements, emotional pacing`,
      `Final shot: ${figure}, ${appearance}, looking into the distance, fade to black, ${era} sunset`,
    ];

    return basePrompts.slice(0, 26);
  }

  private async generateSunoMusic(
    figure: string,
    lyrics: string,
    styleTags: string,
    packageId: string | number,
    jobId?: string,
  ): Promise<{ audioFilePath: string; duration: number; audioAnalysis?: any; acousticFingerprint?: any } | null> {
    try {
      // Check if Suno API is available
      const credits = await sunoApi.checkCredits();
      if (credits.credits < 10) {
        console.log(`   ⚠️ Low Suno credits (${credits.credits}), skipping music generation`);
        return null;
      }

      // Generate song with Suno
      // Truncate title to 80 chars max (Suno API limit)
      const rawTitle = `${figure} - Historical Rap`;
      const truncatedTitle = rawTitle.length > 80 ? rawTitle.substring(0, 77) + '...' : rawTitle;

      const { taskId } = await sunoApi.generateSong({
        lyrics: lyrics,
        style: styleTags,
        title: truncatedTitle,
        instrumental: false,
        model: 'V5',
        targetDuration: 120, // Pass 120s target for historical rap videos
      });

      console.log(`   🎵 Suno task created: ${taskId}`);

      // Create persistent task record
      await sunoTaskService.createTask({
        packageId: packageId.toString(),
        jobId: jobId,
        taskId: taskId,
        figure: figure,
        lyrics: lyrics,
        styleTags: styleTags,
      });

      // Poll for completion (sunoTaskService handles persistence)
      const completedTask = await sunoTaskService.pollTask(taskId);

      if (completedTask && completedTask.status === 'completed' && completedTask.audioFilePath) {
        return {
          audioFilePath: completedTask.audioFilePath,
          duration: completedTask.duration || 60,
          audioAnalysis: completedTask.audioAnalysis,
          acousticFingerprint: completedTask.acousticFingerprint,
        };
      }

      console.warn(`   ⚠️ Suno task failed or incomplete`);
      return null;
    } catch (error: any) {
      console.error(`   ❌ Suno error: ${error.message}`);
      return null;
    }
  }

  private async startJobMonitor(jobId: string, video: GeneratedVideo, topic: TopicCandidate): Promise<void> {
    console.log(`   📡 Monitoring job ${jobId} for completion...`);

    const checkInterval = setInterval(async () => {
      try {
        const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

        if (!currentJob) {
          console.log(`   ⚠️ Job ${jobId} not found, stopping monitor`);
          clearInterval(checkInterval);
          return;
        }

        if (currentJob.status === 'completed') {
          console.log(`   ✅ Job ${jobId} completed!`);
          clearInterval(checkInterval);

          video.videoPath = currentJob.videoUrl || '';

          this.state.completedVideos.push(video);

          this.state.generatingVideos = this.state.generatingVideos.filter((id) => id !== video.id);

          if (video.videoPath) {
            await this.queueForUpload(video);
          }
        } else if (currentJob.status === 'failed') {
          console.log(`   ❌ Job ${jobId} failed: ${currentJob.errorMessage || 'Unknown error'}`);
          clearInterval(checkInterval);

          this.state.failedVideos.push({
            topic,
            error: currentJob.errorMessage || 'Job processing failed',
          });

          this.state.generatingVideos = this.state.generatingVideos.filter((id) => id !== video.id);
        }
      } catch (error: any) {
        console.error(`   ⚠️ Error checking job ${jobId}: ${error.message}`);
      }
    }, 30000);

    setTimeout(
      () => {
        clearInterval(checkInterval);
        console.log(`   ⏰ Job ${jobId} monitor timeout (video generation typically takes 5-15 minutes)`);
      },
      30 * 60 * 1000,
    );
  }

  async queueForUpload(video: GeneratedVideo): Promise<void> {
    if (!video.videoPath) {
      console.log('⚠️  No video path, cannot queue for upload');
      return;
    }

    const isAuth = await youtubeUploadService.isAuthenticated();
    if (!isAuth) {
      console.log('⚠️  YouTube not authenticated, skipping upload');
      return;
    }

    // Check auto-pilot for forced posting time
    const autoPilotStatus = analyticsAutoPilotService.getStatus();
    let selectedSlot: { timeSlot: string; isExploration: boolean } | null = null;

    if (autoPilotStatus.isActive && autoPilotStatus.forcedPostingTime) {
      // Auto-pilot has a forced posting time from nightly strategic summary
      selectedSlot = {
        timeSlot: autoPilotStatus.forcedPostingTime,
        isExploration: false,
      };
      console.log(`🤖 [AUTO-PILOT] Forced posting time: ${selectedSlot.timeSlot}`);
    } else {
      // Use Thompson Sampling to select optimal time slot
      const isWeekend = [0, 6].includes(new Date().getDay());
      const dayType = isWeekend ? 'weekend' : 'weekday';
      const format: 'shorts' | 'long_form' = 'shorts'; // Default to shorts

      selectedSlot = await postingTimeBanditService.selectTimeSlot(format, dayType);

      if (selectedSlot) {
        const actionType = selectedSlot.isExploration ? '🎲 EXPLORATION' : '📈 EXPLOITATION';
        console.log(`🎰 [POSTING BANDIT] ${actionType}: Selected ${selectedSlot.timeSlot} for upload`);
      }
    }

    // Store selected slot for outcome tracking after upload
    (video as any).selectedTimeSlot = selectedSlot?.timeSlot;
    (video as any).wasExploration = selectedSlot?.isExploration;

    this.state.uploadQueue.push(video);
    console.log(`📋 Queued for upload: ${video.figure} (scheduled: ${selectedSlot?.timeSlot || 'next available'})`);
  }

  async uploadVideo(video: GeneratedVideo): Promise<boolean> {
    if (!video.videoPath) {
      console.log('⚠️  No video path for upload');
      return false;
    }

    // Resolve video path - handle both absolute and relative paths
    const { isAbsolute, resolve } = await import('path');
    let videoPath = video.videoPath;

    // If path starts with / but isn't a true absolute path (e.g., /attached_assets/...)
    // we need to resolve it relative to cwd
    if (video.videoPath.startsWith('/attached_assets') || video.videoPath.startsWith('/data')) {
      videoPath = join(process.cwd(), video.videoPath);
    } else if (!isAbsolute(video.videoPath)) {
      videoPath = resolve(process.cwd(), video.videoPath);
    }

    if (!existsSync(videoPath)) {
      console.log(`⚠️  Video file not found: ${videoPath}`);
      return false;
    }

    try {
      console.log(`\n📤 PREPARING YOUTUBE UPLOAD: ${video.figure}`);
      console.log('='.repeat(50));

      // Step 1: Generate AI-powered metadata
      console.log('🤖 Generating optimized YouTube metadata...');
      const metadata = await youtubeMetadataGenerator.generateMetadata({
        jobName: `${video.figure} - Historical Rap`,
        mode: 'unity_kling',
        aspectRatio: '9:16',
        unityMetadata: {
          topic: video.figure,
          vibe: 'Epic Historical',
          style: 'documentary',
          battleType: 'historical_figure',
        },
      });
      console.log(`   ✅ Title: ${metadata.title}`);
      console.log(`   ✅ Tags: ${metadata.tags.slice(0, 5).join(', ')}...`);

      // Step 2: Generate AI historical thumbnail with era-appropriate background
      console.log('🎨 Generating AI historical thumbnail...');
      let thumbnailPath: string | undefined;
      try {
        const thumbDir = join(dirname(videoPath), 'thumbnails');
        if (!existsSync(thumbDir)) {
          mkdirSync(thumbDir, { recursive: true });
        }
        const thumbName = `${video.figure.replace(/[^a-zA-Z0-9]/g, '_')}_ai_thumb.png`;
        thumbnailPath = join(thumbDir, thumbName);

        // Generate AI thumbnail with historical figure face and era background
        const thumbnailUrl = await youtubeMetadataGenerator.generateHistoricalThumbnail(
          video.figure,
          video.figure, // The main historical figure's name
          undefined,
        );

        if (thumbnailUrl) {
          // Download the AI-generated thumbnail
          const downloaded = await youtubeMetadataGenerator.downloadThumbnail(thumbnailUrl, thumbnailPath);
          if (downloaded) {
            video.thumbnailPath = thumbnailPath;
            console.log(`   ✅ AI thumbnail generated: ${thumbName}`);
          } else {
            console.log(`   ⚠️ Failed to download AI thumbnail, will use enhanced video frame`);
            // Fall back to enhanced video frame extraction
            const fallbackThumbName = `${video.figure.replace(/[^a-zA-Z0-9]/g, '_')}_thumb.jpg`;
            thumbnailPath = join(thumbDir, fallbackThumbName);
            await ffmpegProcessor.extractBestThumbnail(videoPath, thumbnailPath);
            video.thumbnailPath = thumbnailPath;
            console.log(`   ✅ Enhanced fallback thumbnail extracted: ${fallbackThumbName}`);
          }
        } else {
          // Fall back to enhanced video frame extraction
          console.log(`   ⚠️ AI thumbnail generation returned null, using enhanced video frame`);
          const fallbackThumbName = `${video.figure.replace(/[^a-zA-Z0-9]/g, '_')}_thumb.jpg`;
          thumbnailPath = join(thumbDir, fallbackThumbName);
          await ffmpegProcessor.extractBestThumbnail(videoPath, thumbnailPath);
          video.thumbnailPath = thumbnailPath;
          console.log(`   ✅ Enhanced fallback thumbnail extracted: ${fallbackThumbName}`);
        }
      } catch (thumbError: any) {
        console.log(`   ⚠️ Thumbnail generation failed: ${thumbError.message}`);
        // Try enhanced extraction as last resort
        try {
          const thumbDir = join(dirname(videoPath), 'thumbnails');
          if (!existsSync(thumbDir)) {
            mkdirSync(thumbDir, { recursive: true });
          }
          const fallbackThumbName = `${video.figure.replace(/[^a-zA-Z0-9]/g, '_')}_thumb.jpg`;
          thumbnailPath = join(thumbDir, fallbackThumbName);
          await ffmpegProcessor.extractBestThumbnail(videoPath, thumbnailPath);
          video.thumbnailPath = thumbnailPath;
          console.log(`   ✅ Emergency fallback thumbnail extracted: ${fallbackThumbName}`);
        } catch (e) {
          thumbnailPath = undefined;
        }
      }

      // Step 3: Upload video with full metadata and thumbnail
      console.log('📤 Uploading to YouTube...');
      const result = await youtubeUploadService.uploadVideoWithThumbnail(
        videoPath,
        {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId,
          privacyStatus: 'private', // Always start private for safety
        },
        thumbnailPath,
      );

      if (result.success) {
        video.youtubeId = result.videoId;
        video.youtubeUrl = result.videoUrl;
        video.uploadedAt = new Date();

        console.log('='.repeat(50));
        console.log(`✅ YOUTUBE UPLOAD COMPLETE!`);
        console.log(`   📺 Video ID: ${result.videoId}`);
        console.log(`   🔗 URL: ${result.videoUrl}`);
        console.log(`   📝 Title: ${metadata.title}`);
        console.log('='.repeat(50) + '\n');

        // Record outcome with posting time bandit for learning
        const selectedTimeSlot = (video as any).selectedTimeSlot;
        if (selectedTimeSlot && result.videoId) {
          const isWeekend = [0, 6].includes(new Date().getDay());
          const dayType = isWeekend ? 'weekend' : 'weekday';
          const format: 'shorts' | 'long_form' = 'shorts';

          // Schedule outcome recording after 24-48 hours when analytics are available
          // For now, we'll record a placeholder that will be updated by analytics harvesting
          console.log(
            `📊 [POSTING BANDIT] Tracking outcome for ${selectedTimeSlot} - analytics will update after 24-48 hours`,
          );

          // Store video info for later outcome recording when analytics become available
          try {
            const outcomeData = {
              videoId: result.videoId,
              timeSlot: selectedTimeSlot,
              dayType,
              format,
              uploadedAt: new Date().toISOString(),
            };
            // This will be picked up by the analytics harvesting service to update bandit
            console.log(`   📝 Outcome tracking registered: ${JSON.stringify(outcomeData)}`);
          } catch (e) {
            console.warn(`   ⚠️ Outcome tracking registration failed: ${e}`);
          }
        }

        // Update video insights to link packageId to YouTube video ID
        if (video.packageId && result.videoId) {
          try {
            const linkSuccess = await videoInsightsService.updateVideoId(video.packageId, result.videoId);
            if (linkSuccess) {
              console.log(`📊 Theme tracking: linked package ${video.packageId} → ${result.videoId}`);
            } else {
              console.error(
                `❌ Theme tracking: failed to link package ${video.packageId} → ${result.videoId} (updateVideoId returned false)`,
              );
            }
          } catch (insightError) {
            console.error(`❌ Theme tracking error: ${insightError}`);
          }
        }

        // Log pattern usage for analytics tracking
        try {
          await this.logPatternUsage(result.videoId || '', video.packageId || '', metadata.title, video.figure);
        } catch (patternError) {
          console.warn(`⚠️ Pattern usage logging failed: ${patternError}`);
        }

        // Link lyric features to YouTube video for performance tracking
        if (video.packageId && result.videoId) {
          try {
            await lyricAnalyticsService.linkToVideo(video.packageId, result.videoId);
            console.log(`📊 Lyric analytics: linked to ${result.videoId}`);
          } catch (lyricError) {
            console.warn(`⚠️ Lyric analytics linking failed: ${lyricError}`);
          }
        }

        // NOTE: Thumbnail cleanup is handled inside uploadVideoWithThumbnail
        // after the upload stream is fully complete

        return true;
      } else {
        console.error(`❌ Upload failed: ${result.error}`);
        return false;
      }
    } catch (error: any) {
      console.error(`❌ Upload error: ${error.message}`);
      return false;
    }
  }

  async runDailyPipeline(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('🤖 RUNNING DAILY PIPELINE');
    console.log('='.repeat(60));
    console.log(`Started: ${new Date().toLocaleString()}`);
    console.log('='.repeat(60) + '\n');

    try {
      // Check if long-form is enabled
      if (this.config.enableLongForm && this.config.longFormFrequency === 'daily') {
        console.log('📺 Long-form enabled - running 4+1 daily mix');
        await this.runDailyMixPipeline();
        return;
      }

      const topics = await this.runDiscovery();

      if (topics.length === 0) {
        console.log('❌ No topics found, skipping today');
        return;
      }

      const generatedVideos: GeneratedVideo[] = [];

      for (const topic of topics) {
        const video = await this.generateVideoForTopic(topic);
        if (video) {
          generatedVideos.push(video);
        }
        await this.sleep(5000);
      }

      console.log('\n' + '='.repeat(60));
      console.log('✅ DAILY PIPELINE COMPLETE');
      console.log('='.repeat(60));
      console.log(`   Jobs created: ${generatedVideos.length}`);
      console.log('='.repeat(60) + '\n');
    } catch (error: any) {
      console.error(`❌ Pipeline error: ${error.message}`);
    }
  }

  /**
   * Run daily mix pipeline: 4 shorts + 1 long-form
   * All shorts auto-redirect to the long-form video
   */
  async runDailyMixPipeline(): Promise<{
    shorts: GeneratedVideo[];
    longFormPackageId?: string;
    autoRedirectMetadata?: any;
    success: boolean;
  }> {
    console.log('\n' + '='.repeat(60));
    console.log('🎬 RUNNING 4+1 DAILY MIX PIPELINE');
    console.log('='.repeat(60));
    console.log(`Config: ${this.config.shortsPerLongForm} shorts + 1 long-form`);
    console.log('='.repeat(60) + '\n');

    const result = {
      shorts: [] as GeneratedVideo[],
      longFormPackageId: undefined as string | undefined,
      autoRedirectMetadata: undefined as any,
      success: false,
    };

    try {
      // Step 0: Warm strategic insights cache
      console.log('\n🧠 STEP 0: WARMING STRATEGIC INSIGHTS');
      console.log('-'.repeat(40));
      try {
        const { strategicInsightsInjector } = await import('./strategic-insights-injector');
        const insights = await strategicInsightsInjector.getInjectedInsights();
        if (insights) {
          console.log(`   ✅ Strategic insights loaded (narrative: ${insights.narrativeStyle?.substring(0, 40)}...)`);
          console.log(`   📊 Audio recommendations: ${insights.audioRecommendations?.length || 0} patterns`);
          console.log(`   🎨 Visual recommendations: ${insights.visualRecommendations?.length || 0} patterns`);
        } else {
          console.log('   ⚠️ No strategic insights available (will use defaults)');
        }
      } catch (insightErr: any) {
        console.log(`   ⚠️ Strategic insights unavailable: ${insightErr.message}`);
      }

      // Step 1: Discover topics - need at least shortsPerLongForm + 1
      console.log('\n📡 STEP 1: TOPIC DISCOVERY');
      console.log('-'.repeat(40));
      const topics = await this.runDiscovery();

      if (topics.length === 0) {
        console.log('❌ No topics found, skipping today');
        return result;
      }

      // Pick the top-scoring topic for the long-form video
      const mainTopic = topics[0];
      console.log(`   ✅ Main topic (long-form): ${mainTopic.figure} (score: ${mainTopic.viralScore})`);

      // Step 2: Generate shorts from DIFFERENT topics (exclude the main topic)
      console.log('\n📹 STEP 2: GENERATING SHORTS (distinct from long-form)');
      console.log('-'.repeat(40));

      // Use topics starting from index 1 (skip the long-form topic)
      const shortTopics = topics.slice(1, 1 + this.config.shortsPerLongForm);

      // If not enough topics, backfill with the main topic variants
      if (shortTopics.length < this.config.shortsPerLongForm) {
        console.log(`   ⚠️ Only ${shortTopics.length} distinct topics, backfilling...`);
        // Re-run discovery with higher count if needed, for now just proceed with what we have
      }

      console.log(`   Generating ${shortTopics.length} shorts from distinct topics...`);

      for (const topic of shortTopics) {
        console.log(`   📹 Short: ${topic.figure}`);
        const video = await this.generateVideoForTopic(topic);
        if (video) {
          result.shorts.push(video);
        }
        await this.sleep(5000);
      }
      console.log(`   ✅ Created ${result.shorts.length} shorts`);

      // Step 3: Initialize long-form package
      console.log('\n🎬 STEP 3: INITIALIZING LONG-FORM VIDEO');
      console.log('-'.repeat(40));

      try {
        const { longFormOrchestratorService } = await import('./long-form-orchestrator-service');
        const { longFormPackages } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        const longFormResult = await longFormOrchestratorService.initializeLongFormPackage(
          mainTopic.figure,
          'documentary',
          'historical_epic',
        );

        if (longFormResult.status === 'verified') {
          result.longFormPackageId = longFormResult.packageId;
          console.log(`   ✅ Long-form package created: ${longFormResult.packageId}`);
          console.log(`   📊 Estimated cost: $${longFormResult.estimatedCost.toFixed(2)}`);

          // Step 4: Generate and persist auto-redirect metadata
          console.log('\n🔗 STEP 4: GENERATING AUTO-REDIRECT METADATA');
          console.log('-'.repeat(40));

          const shortPackageIds = result.shorts.filter((s) => s.packageId).map((s) => s.packageId as string);

          if (shortPackageIds.length > 0) {
            // Store placeholder for YouTube video IDs (will be populated after upload)
            result.autoRedirectMetadata = {
              longFormPackageId: result.longFormPackageId,
              shortPackageIds,
              // YouTube IDs will be added after videos are uploaded
              longFormVideoId: null, // Populated after long-form upload
              shortVideoIds: [], // Populated after shorts upload
              redirectConfig: {
                endScreenEnabled: true,
                cardTimestamp: 45, // 45 seconds into a 60s short
                descriptionLink: true,
              },
            };

            // Persist to long-form package
            await db
              .update(longFormPackages)
              .set({
                relatedShortIds: shortPackageIds,
                autoRedirectEnabled: true,
              })
              .where(eq(longFormPackages.id, result.longFormPackageId));

            console.log(`   ✅ Auto-redirect metadata saved for ${shortPackageIds.length} shorts`);
            console.log(`   📎 Shorts will link to long-form via end screens and cards`);
          }
        } else if (longFormResult.status === 'blocked') {
          console.log(`   ⚠️ Long-form blocked: ${longFormResult.error}`);
        }
      } catch (longFormError: any) {
        console.error(`   ❌ Long-form creation failed: ${longFormError.message}`);
      }

      result.success = true;

      console.log('\n' + '='.repeat(60));
      console.log('✅ 4+1 DAILY MIX COMPLETE');
      console.log('='.repeat(60));
      console.log(`   📹 Shorts created: ${result.shorts.length}`);
      console.log(`   🎬 Long-form package: ${result.longFormPackageId || 'None'}`);
      console.log(`   🔗 Auto-redirect: ${result.autoRedirectMetadata ? 'Configured' : 'Skipped'}`);
      console.log('='.repeat(60) + '\n');

      return result;
    } catch (error: any) {
      console.error(`❌ Daily mix pipeline error: ${error.message}`);
      return result;
    }
  }

  /**
   * Run full pipeline with analytics first
   * Order: 1) Analytics/Theme Clustering → 2) Viral Discovery → 3) Video Generation
   */
  async runFullPipelineWithAnalytics(): Promise<{ analytics: boolean; discovery: number; generation: number }> {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 RUNNING FULL PIPELINE WITH ANALYTICS');
    console.log('='.repeat(60));
    console.log(`Started: ${new Date().toLocaleString()}`);
    console.log('='.repeat(60) + '\n');

    const result = { analytics: false, discovery: 0, generation: 0 };

    try {
      // STEP 1: Run Analytics & Theme Clustering
      console.log('\n📊 STEP 1: ANALYTICS & THEME CLUSTERING');
      console.log('-'.repeat(40));
      try {
        const { patternIntelligenceService } = await import('./pattern-intelligence-service');
        const { youtubeAnalyticsService } = await import('./youtube-analytics-service');

        const insights = await (youtubeAnalyticsService as any).getAnalyticsInsights();
        if (insights && insights.topPerformers.length >= 3) {
          await patternIntelligenceService.generateThematicClusters(
            insights.topPerformers.map((v: any) => ({
              title: v.title,
              views: v.viewCount,
              engagement: v.engagementRate || 0,
              topic: v.title,
            })),
            insights.lowPerformers.map((v: any) => ({
              title: v.title,
              views: v.viewCount,
              topic: v.title,
            })),
          );

          const pruneResult = patternIntelligenceService.pruneObsoleteThemes();
          console.log(`   ✅ Theme clustering complete (${pruneResult.retained} themes retained)`);

          try {
            const { autoFixService } = await import('./auto-fix-service');
            const fixResult = await autoFixService.analyzeRecentVideos();
            console.log(
              `   🔧 Auto-fix analysis: ${fixResult.issuesFound} issues, ${fixResult.fixesActive} fixes active`,
            );
          } catch (err: any) {
            console.log(`   ⚠️ Auto-fix skipped: ${err.message}`);
          }

          result.analytics = true;
        } else {
          console.log('   ⚠️ Not enough video data for clustering (need 3+ videos)');
          result.analytics = false;
        }
      } catch (analyticsError: any) {
        console.log(`   ⚠️ Analytics skipped: ${analyticsError.message}`);
        result.analytics = false;
      }

      // STEP 2: Run Viral Discovery
      console.log('\n🔍 STEP 2: VIRAL TOPIC DISCOVERY');
      console.log('-'.repeat(40));
      const topics = await this.runDiscovery();
      result.discovery = topics.length;

      if (topics.length === 0) {
        console.log('   ❌ No topics found');
        return result;
      }
      console.log(`   ✅ Found ${topics.length} viral topics`);

      // STEP 3: Run Video Generation
      console.log('\n🎬 STEP 3: VIDEO GENERATION');
      console.log('-'.repeat(40));
      const generatedVideos: GeneratedVideo[] = [];

      for (const topic of topics) {
        console.log(`   📹 Generating: ${topic.figure}`);
        const video = await this.generateVideoForTopic(topic);
        if (video) {
          generatedVideos.push(video);
          result.generation++;
        }
        await this.sleep(5000);
      }

      console.log('\n' + '='.repeat(60));
      console.log('✅ FULL PIPELINE COMPLETE');
      console.log('='.repeat(60));
      console.log(`   📊 Analytics: ${result.analytics ? 'Success' : 'Skipped'}`);
      console.log(`   🔍 Topics found: ${result.discovery}`);
      console.log(`   🎬 Videos created: ${result.generation}`);
      console.log('='.repeat(60) + '\n');

      return result;
    } catch (error: any) {
      console.error(`❌ Full pipeline error: ${error.message}`);
      return result;
    }
  }

  getUploadTimesForToday(): Date[] {
    const today = new Date();

    return this.config.uploadTimes.map((timeStr) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date(today);
      date.setHours(hours, minutes, 0, 0);

      if (date < new Date()) {
        date.setDate(date.getDate() + 1);
      }

      return date;
    });
  }

  private clusteringInterval: NodeJS.Timeout | null = null;
  private lastClusteringDate: string | null = null;
  private summaryInterval: NodeJS.Timeout | null = null;
  private lastSummaryDate: string | null = null;

  start(): void {
    if (this.state.isRunning) {
      console.log('⚠️  Orchestrator already running');
      return;
    }

    this.state.isRunning = true;
    this.saveState(); // Persist state so automation resumes after restart
    console.log('🚀 Orchestrator started');

    // Daily auto-generation at 8:30 PM (after 7:30pm strategic summary)
    this.discoveryInterval = setInterval(() => {
      const now = new Date();
      if (
        now.getHours() === this.config.discoveryHour &&
        now.getMinutes() === 30 && // 8:30 PM
        (!this.state.lastDiscovery || now.getDate() !== this.state.lastDiscovery.getDate())
      ) {
        console.log('🎬 Starting daily auto-generation (8:30 PM - after nightly strategic summary)...');
        this.runDailyPipeline();
      }
    }, 60 * 1000);

    this.uploadInterval = setInterval(async () => {
      if (this.state.uploadQueue.length > 0) {
        const video = this.state.uploadQueue.shift();
        if (video) {
          await this.uploadVideo(video);
        }
      }
    }, 60 * 1000);

    // Daily theme clustering at 10 AM
    this.clusteringInterval = setInterval(async () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      if (now.getHours() === 10 && now.getMinutes() === 0 && this.lastClusteringDate !== todayStr) {
        console.log('🧠 Running scheduled daily theme clustering (10 AM)...');
        try {
          const { patternIntelligenceService } = await import('./pattern-intelligence-service');
          const { youtubeAnalyticsService } = await import('./youtube-analytics-service');

          const insights = await (youtubeAnalyticsService as any).getAnalyticsInsights();
          if (insights && insights.topPerformers.length >= 5) {
            await patternIntelligenceService.generateThematicClusters(
              insights.topPerformers.map((v: any) => ({
                title: v.title,
                views: v.viewCount,
                engagement: v.engagementRate || 0,
                topic: v.title,
              })),
              insights.lowPerformers.map((v: any) => ({
                title: v.title,
                views: v.viewCount,
                topic: v.title,
              })),
            );

            // Prune obsolete themes (90+ days inactive)
            const pruneResult = patternIntelligenceService.pruneObsoleteThemes();
            console.log(`   Theme cleanup: ${pruneResult.retained} active themes retained`);

            // Run auto-fix analysis to update fix confidence
            try {
              const { autoFixService } = await import('./auto-fix-service');
              const fixResult = await autoFixService.analyzeRecentVideos();
              console.log(
                `   🔧 Auto-fix analysis: ${fixResult.issuesFound} issues found, ${fixResult.fixesActive} fixes active`,
              );
            } catch (err: any) {
              console.log(`   ⚠️ Auto-fix analysis skipped: ${err.message}`);
            }

            this.lastClusteringDate = todayStr;
            console.log('✅ Daily analytics & theme clustering complete');
          } else {
            console.log('⚠️ Not enough video data for clustering (need 5+ videos)');
          }
        } catch (error: any) {
          console.error('❌ Daily clustering failed:', error.message);
        }
      }
    }, 60 * 1000);

    // Daily summary at 9 PM
    this.summaryInterval = setInterval(async () => {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      if (now.getHours() === 21 && now.getMinutes() === 0 && this.lastSummaryDate !== todayStr) {
        await this.generateDailySummary();
        this.lastSummaryDate = todayStr;
      }
    }, 60 * 1000);

    console.log(
      `   Auto-generation scheduled for: ${this.config.discoveryHour}:30 PM (${this.config.videosPerDay} videos)`,
    );
    console.log(`   Theme clustering scheduled for: 10:00 AM daily`);
    console.log(`   Daily summary scheduled for: 9:00 PM`);
    console.log(`   Upload times: ${this.config.uploadTimes.join(', ')} (next day uploads with posting time bandit)`);
  }

  stop(): void {
    if (this.discoveryInterval) clearInterval(this.discoveryInterval);
    if (this.uploadInterval) clearInterval(this.uploadInterval);
    if (this.clusteringInterval) clearInterval(this.clusteringInterval);
    if (this.summaryInterval) clearInterval(this.summaryInterval);
    this.state.isRunning = false;
    this.saveState(); // Persist stopped state
    console.log('🛑 Orchestrator stopped');
  }

  /**
   * Generate and log daily summary at 9 PM
   * Provides quick insight into today's performance and AI learnings
   */
  async generateDailySummary(): Promise<void> {
    console.log('\n' + '='.repeat(60));
    console.log('📊 DAILY SUMMARY (9 PM)');
    console.log('='.repeat(60));
    console.log(`Date: ${new Date().toLocaleDateString()}`);
    console.log('='.repeat(60) + '\n');

    try {
      // Get today's videos
      const todayVideos = this.state.completedVideos.filter((v) => {
        const videoDate = new Date(v.createdAt);
        const today = new Date();
        return videoDate.toDateString() === today.toDateString();
      });

      console.log(`📹 Videos created today: ${todayVideos.length}`);
      if (todayVideos.length > 0) {
        todayVideos.forEach((v) => {
          console.log(`   • ${v.figure}: "${v.hook}"`);
        });
      }

      // Get pattern intelligence insights
      try {
        const { patternIntelligenceService } = await import('./pattern-intelligence-service');
        const themeAnalysis = (patternIntelligenceService as any).getThemeAnalysis();

        if (themeAnalysis) {
          const emergingThemes = themeAnalysis.themes
            .filter((t: any) => t.status === 'emerging')
            .map((t: any) => t.theme);
          const provenThemes = themeAnalysis.themes
            .filter((t: any) => t.status === 'proven')
            .slice(0, 3)
            .map((t: any) => t.theme);
          const failingThemes = themeAnalysis.themes
            .filter((t: any) => t.status === 'failing')
            .map((t: any) => t.theme);

          console.log(`\n🧠 AI Theme Intelligence:`);
          if (provenThemes.length > 0) {
            console.log(`   ✅ Proven: ${provenThemes.join(', ')}`);
          }
          if (emergingThemes.length > 0) {
            console.log(`   📈 Emerging: ${emergingThemes.join(', ')}`);
          }
          if (failingThemes.length > 0) {
            console.log(`   ⚠️ Failing: ${failingThemes.join(', ')}`);
          }
        }
      } catch (e) {
        console.log(`   ⚠️ Pattern intelligence not available`);
      }

      // Get auto-fix status
      try {
        const { autoFixService } = await import('./auto-fix-service');
        const fixStatus = autoFixService.getStatus();

        console.log(`\n🔧 Auto-Fix Status:`);
        console.log(`   Active fixes: ${fixStatus.activeFixes}`);
        console.log(`   Observing: ${fixStatus.observingFixes}`);
        if ((fixStatus as any).recentOutcomes && (fixStatus as any).recentOutcomes.length > 0) {
          const successRate =
            ((fixStatus as any).recentOutcomes.filter((o: any) => o.improved).length /
              (fixStatus as any).recentOutcomes.length) *
            100;
          console.log(`   Recent success rate: ${successRate.toFixed(0)}%`);
        }
      } catch (e) {
        console.log(`   ⚠️ Auto-fix status not available`);
      }

      // Get YouTube performance snapshot
      try {
        const { youtubeAnalyticsService } = await import('./youtube-analytics-service');
        const insights = await (youtubeAnalyticsService as any).getAnalyticsInsights();

        if (insights) {
          console.log(`\n📈 YouTube Performance:`);
          console.log(`   Total videos tracked: ${insights.totalVideos || 0}`);
          if (insights.topPerformers && insights.topPerformers.length > 0) {
            const top = insights.topPerformers[0];
            console.log(`   Top performer: "${top.title}" (${top.viewCount} views)`);
          }
          if (insights.averageRetention) {
            console.log(`   Avg retention: ${insights.averageRetention.toFixed(1)}%`);
          }
        }
      } catch (e) {
        console.log(`   ⚠️ YouTube analytics not available`);
      }

      console.log('\n' + '='.repeat(60));
      console.log('✅ Daily summary complete');
      console.log('='.repeat(60) + '\n');
    } catch (error: any) {
      console.error(`❌ Daily summary error: ${error.message}`);
    }
  }

  async manualDiscovery(): Promise<TopicCandidate[]> {
    return this.runDiscovery();
  }

  async manualGenerate(
    figure: string,
    story: string,
    force: boolean = false,
    userId?: string,
  ): Promise<GeneratedVideo | null> {
    const topic: TopicCandidate = {
      figure,
      event: story,
      hook: `The incredible story of ${figure}`,
      whyNow: 'Manual request',
      viralScore: 10,
      source: 'suggested',
    };

    return this.generateVideoForTopic(topic, force, userId);
  }

  async manualUpload(videoPath: string, figure: string, hook: string): Promise<boolean> {
    const video: GeneratedVideo = {
      id: `manual_${Date.now()}`,
      figure,
      story: '',
      hook,
      videoPath,
      createdAt: new Date(),
    };

    return this.uploadVideo(video);
  }

  getStatus(): OrchestratorStatus {
    const nextDiscovery = new Date();
    nextDiscovery.setHours(this.config.discoveryHour, 0, 0, 0);
    if (nextDiscovery < new Date()) {
      nextDiscovery.setDate(nextDiscovery.getDate() + 1);
    }

    const uploadTimes = this.getUploadTimesForToday();
    const nextUpload = uploadTimes.find((t) => t > new Date());

    return {
      isRunning: this.state.isRunning,
      lastDiscovery: this.state.lastDiscovery?.toISOString() || null,
      pendingTopics: this.state.pendingTopics.length,
      generatingVideos: this.state.generatingVideos.length,
      completedVideos: this.state.completedVideos.length,
      failedVideos: this.state.failedVideos.length,
      uploadQueue: {
        pending: this.state.uploadQueue.length,
        completed: this.state.completedVideos.filter((v) => v.youtubeId).length,
      },
      nextDiscovery: nextDiscovery.toISOString(),
      nextUpload: nextUpload?.toISOString() || null,
    };
  }

  async getActiveJobs(): Promise<
    Array<{ id: string; name: string; status: string; progress: number; createdAt: Date | null }>
  > {
    try {
      const { desc } = await import('drizzle-orm');
      const activeJobs = await db
        .select({
          id: jobs.id,
          name: jobs.scriptName,
          status: jobs.status,
          progress: jobs.progress,
          createdAt: jobs.createdAt,
        })
        .from(jobs)
        .where(eq(jobs.mode, 'unity_kling'))
        .orderBy(desc(jobs.createdAt))
        .limit(20);

      return activeJobs.map((j) => ({
        id: j.id,
        name: j.name || 'Unnamed',
        status: j.status || 'unknown',
        progress: j.progress || 0,
        createdAt: j.createdAt,
      }));
    } catch (error: any) {
      console.error('Error fetching active jobs:', error.message);
      return [];
    }
  }

  getPendingTopics(): TopicCandidate[] {
    return [...this.state.pendingTopics];
  }

  getCompletedVideos(): GeneratedVideo[] {
    return [...this.state.completedVideos];
  }

  getFailedVideos(): { topic: TopicCandidate; error: string }[] {
    return [...this.state.failedVideos];
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('📝 Orchestrator config updated');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Log pattern usage for analytics tracking
   * Records which patterns and hooks were applied to each video
   */
  private async logPatternUsage(videoId: string, packageId: string, title: string, figure: string): Promise<void> {
    try {
      const { patternUsageLog } = await import('@shared/schema');
      const { patternIntelligenceService } = await import('./pattern-intelligence-service');
      const { metricsHarvestingService } = await import('./metrics-harvesting-service');

      // Extract patterns that were likely used in this title
      const extractedPatterns: string[] = [];
      const lowerTitle = title.toLowerCase();

      // Check for common patterns
      if (lowerTitle.includes(' vs ') || lowerTitle.includes(' vs. ')) extractedPatterns.push('versus_format');
      if (lowerTitle.includes('untold') || lowerTitle.includes('secret')) extractedPatterns.push('mystery_hook');
      if (lowerTitle.includes('rise') || lowerTitle.includes('fall')) extractedPatterns.push('rise_fall_narrative');
      if (lowerTitle.includes('lament') || lowerTitle.includes('confession'))
        extractedPatterns.push('first_person_narrative');
      if (lowerTitle.includes('last') && (lowerTitle.includes('words') || lowerTitle.includes('days')))
        extractedPatterns.push('final_moments');
      if (lowerTitle.includes('betrayal') || lowerTitle.includes('revenge')) extractedPatterns.push('conflict_hook');

      // Get any active hook templates that might match
      const hookTemplates = await metricsHarvestingService.getActiveHookTemplates();
      let matchedHookTemplateId: number | null = null;

      for (const template of hookTemplates) {
        // Check if title matches this template pattern
        const templateLower = template.template.toLowerCase();
        if (template.winningKeywords.some((k: string) => lowerTitle.includes(k.toLowerCase()))) {
          matchedHookTemplateId = 0; // We don't have numeric IDs in the cache, mark as matched
          extractedPatterns.push(`hook:${template.category}`);
          break;
        }
      }

      // Get proven themes from pattern intelligence
      const status = patternIntelligenceService.getAutoPromotionStatus();
      const themesApplied = status.provenPatterns.filter((p) => lowerTitle.includes(p.toLowerCase().split(' ')[0]));

      // Log the pattern usage
      await db.insert(patternUsageLog).values({
        videoId: videoId || null,
        packageId: packageId || null,
        patternsApplied: extractedPatterns,
        themesApplied: themesApplied,
        hookTemplateId: matchedHookTemplateId,
        isHoldout: 0, // Not a holdout (normal video with patterns applied)
        generatedTitle: title,
        outcomeRecorded: 0,
      } as any);

      console.log(`   📊 Pattern usage logged: ${extractedPatterns.length} patterns, ${themesApplied.length} themes`);
    } catch (error: any) {
      console.warn(`   ⚠️ Pattern logging error: ${error.message}`);
    }
  }
}

let orchestratorInstance: UnityOrchestrator | null = null;

export function getOrchestrator(): UnityOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new UnityOrchestrator();
  }
  return orchestratorInstance;
}

export function createOrchestrator(config?: Partial<OrchestratorConfig>): UnityOrchestrator {
  orchestratorInstance = new UnityOrchestrator(config);
  return orchestratorInstance;
}
