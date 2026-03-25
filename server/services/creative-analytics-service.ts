/**
 * CREATIVE ANALYTICS SERVICE
 *
 * Tracks and analyzes the presentation elements that drive CTR and retention:
 * - Thumbnail variables (face/VS/colors/text)
 * - Title variables (length/format/emotional words/emoji)
 * - Hook variables (first-person/question/energy)
 *
 * Learns winning formulas and applies them to future content generation.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { thumbnailVariantStats, videoThumbnailAssignments } from '@shared/schema';
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

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ThumbnailAnalysis {
  hasFace: boolean;
  isVsFormat: boolean;
  hasTextOverlay: boolean;
  colorPalette: 'bright' | 'dark' | 'mixed';
  expression: 'dramatic' | 'neutral' | 'intense' | 'unknown';
  hasFireExplosions: boolean;
  subjectCount: 1 | 2 | 'multiple';
}

// ============================================================================
// THUMBNAIL A/B TESTING TYPES
// ============================================================================

export type ThumbnailVariant = 'vs_battle' | 'portrait_dramatic' | 'action_scene' | 'text_heavy' | 'minimal_clean';

export interface ThumbnailVariantConfig {
  id: ThumbnailVariant;
  name: string;
  description: string;
  promptModifiers: string;
  weight: number; // Current selection weight (0-100, totals to 100)
  baseWeight: number; // Initial weight before learning
}

export interface ThumbnailVariantPerformance {
  variantId: ThumbnailVariant;
  videoCount: number;
  totalImpressions: number;
  totalClicks: number;
  avgCtr: number;
  bestCtr: number;
  worstCtr: number;
  lastUpdated: Date;
}

export interface TitleAnalysis {
  length: number;
  wordCount: number;
  format: 'vs' | 'story_of' | 'question' | 'statement' | 'list' | 'other';
  hasEmoji: boolean;
  emojiCount: number;
  emotionalWords: string[];
  emotionalIntensity: 'low' | 'medium' | 'high';
  allCapsWords: string[];
}

export interface HookAnalysis {
  style: 'first_person_boast' | 'third_person_setup' | 'question' | 'shocking_fact' | 'challenge' | 'other';
  wordCount: number;
  energyLevel: 'low' | 'medium' | 'high' | 'explosive';
  hasDirectAddress: boolean;
  openingWord: string;
  mentionsFigureName: boolean;
}

export interface CreativeMetadata {
  videoId: string;
  youtubeId?: string;
  figure: string;
  thumbnail: ThumbnailAnalysis;
  title: TitleAnalysis;
  hook: HookAnalysis;
  rawTitle: string;
  rawHook: string;
  thumbnailPrompt?: string;
  createdAt: Date;
}

export interface CreativePerformance extends CreativeMetadata {
  impressions: number;
  ctr: number;
  views: number;
  avgViewDuration: number;
  avgViewPercentage: number;
  retention0to3s: number;
  engagementRate: number;
}

export interface CreativePattern {
  id: string;
  category: 'thumbnail' | 'title' | 'hook';
  pattern: string;
  description: string;
  whyItWorks: string;
  avgCtr: number;
  avgRetention: number;
  sampleCount: number;
  successRate: number;
  confidence: number;
  examples: string[];
  lastUpdated: Date;
}

export interface CreativeInsights {
  thumbnailWinners: CreativePattern[];
  titleWinners: CreativePattern[];
  hookWinners: CreativePattern[];
  recommendations: string[];
  lastAnalyzed: Date;
}

// ============================================================================
// THUMBNAIL A/B TESTING VARIANTS
// ============================================================================

const THUMBNAIL_VARIANTS: ThumbnailVariantConfig[] = [
  {
    id: 'vs_battle',
    name: 'VS Battle',
    description: 'Two figures facing off, split screen, dramatic confrontation',
    promptModifiers:
      'Split composition with two historical figures facing each other, VS battle format, dramatic lighting from both sides, intense stare-down, fire or energy between them, bold contrast, cinematic rivalry shot',
    weight: 25,
    baseWeight: 25,
  },
  {
    id: 'portrait_dramatic',
    name: 'Dramatic Portrait',
    description: 'Close-up face with intense expression and dramatic lighting',
    promptModifiers:
      'Extreme close-up portrait, intense eyes looking directly at camera, dramatic side lighting, deep shadows, powerful expression showing determination or rage, single dominant subject filling the frame',
    weight: 25,
    baseWeight: 25,
  },
  {
    id: 'action_scene',
    name: 'Action Scene',
    description: 'Dynamic action moment with movement and energy',
    promptModifiers:
      'Dynamic action pose, movement and energy, battle scene or commanding gesture, flames and debris, cinematic motion blur, epic scale with armies or destruction in background',
    weight: 20,
    baseWeight: 20,
  },
  {
    id: 'text_heavy',
    name: 'Text Overlay',
    description: 'Bold text overlays with impactful words',
    promptModifiers:
      'Space for bold text overlay, clean background sections for typography, high contrast zones, dramatic figure slightly to one side allowing text space, bold colors that pop',
    weight: 15,
    baseWeight: 15,
  },
  {
    id: 'minimal_clean',
    name: 'Minimal Clean',
    description: 'Clean composition with single subject and simple background',
    promptModifiers:
      'Clean minimal composition, single powerful subject, simple gradient or solid background, professional studio-style lighting, focus on subject without distractions, elegant and understated',
    weight: 15,
    baseWeight: 15,
  },
];

// Emotional trigger words that boost CTR
const EMOTIONAL_WORDS = [
  'SECRET',
  'TERRIFYING',
  'EPIC',
  'BRUTAL',
  'SHOCKING',
  'INSANE',
  'LEGENDARY',
  'UNSTOPPABLE',
  'DEADLY',
  'FORBIDDEN',
  'ULTIMATE',
  'GREATEST',
  'DARKEST',
  'BLOODIEST',
  'UNDEFEATED',
  'MYSTERIOUS',
  'HIDDEN',
  'ANCIENT',
  'POWERFUL',
  'RUTHLESS',
  'FEARLESS',
  'SAVAGE',
  'CONQUERED',
  'DESTROYED',
  'BETRAYED',
  'REVENGE',
  'EMPIRE',
  'BATTLE',
  'WAR',
  'DEATH',
  'IMMORTAL',
  'GODLIKE',
  'CURSED',
  'FALLEN',
];

// ============================================================================
// CREATIVE ANALYTICS SERVICE
// ============================================================================

class CreativeAnalyticsService {
  private creativeData: Map<string, CreativeMetadata> = new Map();
  private performanceData: Map<string, CreativePerformance> = new Map();
  private patterns: Map<string, CreativePattern> = new Map();
  private insights: CreativeInsights | null = null;
  private lastAnalysis: Date | null = null;

  // Thumbnail A/B Testing State
  private thumbnailVariants: ThumbnailVariantConfig[] = [...THUMBNAIL_VARIANTS];
  private variantPerformance: Map<ThumbnailVariant, ThumbnailVariantPerformance> = new Map();
  private videoVariantAssignments: Map<string, ThumbnailVariant> = new Map();

  private dbInitialized: boolean = false;

  /**
   * Evict oldest entries from a Map to prevent unbounded memory growth.
   */
  private capMapSize<K, V>(map: Map<K, V>, maxSize: number): void {
    if (map.size <= maxSize) return;
    const keysToDelete = Array.from(map.keys()).slice(0, map.size - maxSize);
    for (const key of keysToDelete) {
      map.delete(key);
    }
  }

  constructor() {
    // Initialize variant performance tracking with defaults
    for (const variant of THUMBNAIL_VARIANTS) {
      this.variantPerformance.set(variant.id, {
        variantId: variant.id,
        videoCount: 0,
        totalImpressions: 0,
        totalClicks: 0,
        avgCtr: 0,
        bestCtr: 0,
        worstCtr: 100,
        lastUpdated: new Date(),
      });
    }
    // Load persisted state from database on startup
    this.loadVariantStatsFromDatabase().catch((err) => {
      console.error('⚠️ Failed to load thumbnail variant stats from database:', err.message);
    });
  }

  // ============================================================================
  // DATABASE PERSISTENCE METHODS
  // ============================================================================

  /**
   * Load thumbnail variant stats from database on startup
   * Populates in-memory Maps with persisted data
   */
  async loadVariantStatsFromDatabase(): Promise<void> {
    try {
      const rows = await db.select().from(thumbnailVariantStats);

      if (rows.length === 0) {
        // No data in DB - initialize with defaults and save
        console.log('📊 Thumbnail A/B: No persisted data found, initializing defaults...');
        for (const variant of THUMBNAIL_VARIANTS) {
          await this.saveVariantStats(variant.id);
        }
        this.dbInitialized = true;
        console.log('✅ Thumbnail A/B: Defaults saved to database');
        return;
      }

      // Populate in-memory state from database
      for (const row of rows) {
        const variantId = row.id as ThumbnailVariant;

        // Update variant performance map
        const perf = this.variantPerformance.get(variantId);
        if (perf) {
          perf.videoCount = row.videoCount;
          perf.totalImpressions = row.totalImpressions;
          perf.totalClicks = row.totalClicks;
          perf.avgCtr = parseFloat(row.avgCtr);
          perf.bestCtr = parseFloat(row.bestCtr);
          perf.worstCtr = parseFloat(row.worstCtr);
          perf.lastUpdated = row.updatedAt;
        }

        // Update variant weights
        const variant = this.thumbnailVariants.find((v) => v.id === variantId);
        if (variant) {
          variant.weight = row.weight;
        }
      }

      // Load video-variant assignments
      const assignments = await db.select().from(videoThumbnailAssignments);
      for (const assignment of assignments) {
        this.videoVariantAssignments.set(assignment.videoId, assignment.variantId as ThumbnailVariant);
      }

      this.dbInitialized = true;
      console.log(
        `✅ Thumbnail A/B: Loaded ${rows.length} variant stats and ${assignments.length} video assignments from database`,
      );
    } catch (error: any) {
      console.error('❌ Failed to load variant stats from database:', error.message);
    }
  }

  /**
   * Upsert a variant's stats to the database
   */
  async saveVariantStats(variantId: ThumbnailVariant): Promise<void> {
    try {
      const variant = this.thumbnailVariants.find((v) => v.id === variantId);
      const perf = this.variantPerformance.get(variantId);

      if (!variant || !perf) return;

      await db
        .insert(thumbnailVariantStats)
        .values({
          id: variantId,
          name: variant.name,
          videoCount: perf.videoCount,
          totalImpressions: perf.totalImpressions,
          totalClicks: perf.totalClicks,
          avgCtr: perf.avgCtr.toFixed(2),
          bestCtr: perf.bestCtr.toFixed(2),
          worstCtr: perf.worstCtr.toFixed(2),
          weight: Math.round(variant.weight),
        })
        .onConflictDoUpdate({
          target: thumbnailVariantStats.id,
          set: {
            videoCount: perf.videoCount,
            totalImpressions: perf.totalImpressions,
            totalClicks: perf.totalClicks,
            avgCtr: perf.avgCtr.toFixed(2),
            bestCtr: perf.bestCtr.toFixed(2),
            worstCtr: perf.worstCtr.toFixed(2),
            weight: Math.round(variant.weight),
            updatedAt: new Date(),
          },
        });
    } catch (error: any) {
      console.error(`❌ Failed to save variant stats for ${variantId}:`, error.message);
    }
  }

  /**
   * Record a video-to-variant assignment in the database
   */
  async recordThumbnailAssignment(
    videoId: string,
    youtubeVideoId: string | null,
    variantId: ThumbnailVariant,
  ): Promise<void> {
    try {
      await db.insert(videoThumbnailAssignments).values({
        videoId,
        youtubeVideoId,
        variantId,
      });
      console.log(`📝 Recorded thumbnail assignment: video ${videoId.substring(0, 8)} → ${variantId}`);
    } catch (error: any) {
      console.error(`❌ Failed to record thumbnail assignment:`, error.message);
    }
  }

  /**
   * Update a video's CTR data in the assignments table
   */
  async updateThumbnailAssignmentCtr(videoId: string, impressions: number, clicks: number, ctr: number): Promise<void> {
    try {
      await db
        .update(videoThumbnailAssignments)
        .set({
          impressions,
          clicks,
          ctr: ctr.toFixed(2),
          ctrCheckedAt: new Date(),
        })
        .where(eq(videoThumbnailAssignments.videoId, videoId));
    } catch (error: any) {
      console.error(`❌ Failed to update assignment CTR for ${videoId}:`, error.message);
    }
  }

  // ============================================================================
  // THUMBNAIL A/B TESTING METHODS
  // ============================================================================

  /**
   * Select a thumbnail variant using weighted random selection
   */
  selectThumbnailVariant(): ThumbnailVariantConfig {
    const totalWeight = this.thumbnailVariants.reduce((sum, v) => sum + v.weight, 0);
    let random = Math.random() * totalWeight;

    for (const variant of this.thumbnailVariants) {
      random -= variant.weight;
      if (random <= 0) {
        return variant;
      }
    }

    // Fallback to first variant
    return this.thumbnailVariants[0];
  }

  /**
   * Assign a variant to a video and return the modified thumbnail prompt
   */
  assignThumbnailVariant(
    videoId: string,
    baseFigure: string,
    secondFigure?: string,
    youtubeVideoId?: string,
  ): {
    variant: ThumbnailVariantConfig;
    thumbnailPrompt: string;
  } {
    const variant = this.selectThumbnailVariant();
    this.videoVariantAssignments.set(videoId, variant.id);
    this.capMapSize(this.videoVariantAssignments, 1000);

    // Update variant video count
    const perf = this.variantPerformance.get(variant.id)!;
    perf.videoCount++;
    perf.lastUpdated = new Date();

    // Generate prompt based on variant
    const thumbnailPrompt = this.generateVariantThumbnailPrompt(variant, baseFigure, secondFigure);

    console.log(`🎨 Thumbnail A/B: Assigned "${variant.name}" to video ${videoId.substring(0, 8)}`);

    // Persist to database (async, fire-and-forget with error handling)
    this.recordThumbnailAssignment(videoId, youtubeVideoId || null, variant.id);
    this.saveVariantStats(variant.id);

    return { variant, thumbnailPrompt };
  }

  /**
   * Generate a thumbnail prompt using the variant's modifiers
   */
  private generateVariantThumbnailPrompt(variant: ThumbnailVariantConfig, figure: string, figure2?: string): string {
    const subject = figure2 ? `${figure} and ${figure2}` : figure;

    return `${subject}, ${variant.promptModifiers}, ultra-high quality, 4K, YouTube thumbnail style, vibrant colors, high contrast`;
  }

  /**
   * Update variant performance when CTR data comes in
   */
  updateVariantPerformance(videoId: string, impressions: number, clicks: number, ctr: number): void {
    const variantId = this.videoVariantAssignments.get(videoId);
    if (!variantId) return;

    const perf = this.variantPerformance.get(variantId);
    if (!perf) return;

    perf.totalImpressions += impressions;
    perf.totalClicks += clicks;
    perf.avgCtr = perf.totalImpressions > 0 ? (perf.totalClicks / perf.totalImpressions) * 100 : 0;
    perf.bestCtr = Math.max(perf.bestCtr, ctr);
    perf.worstCtr = Math.min(perf.worstCtr, ctr);
    perf.lastUpdated = new Date();

    // Persist to database (async, fire-and-forget with error handling)
    this.saveVariantStats(variantId);
    this.updateThumbnailAssignmentCtr(videoId, impressions, clicks, ctr);
  }

  /**
   * Recalculate variant weights based on performance
   * Higher CTR = higher weight
   */
  recalculateVariantWeights(): void {
    const performances = Array.from(this.variantPerformance.values()).filter((p) => p.videoCount >= 2); // Need at least 2 videos for statistical significance

    if (performances.length < 2) {
      console.log('📊 Thumbnail A/B: Not enough data to recalculate weights yet');
      return;
    }

    // Calculate total CTR across all variants with data
    const totalCtr = performances.reduce((sum, p) => sum + p.avgCtr, 0);

    if (totalCtr === 0) {
      console.log('📊 Thumbnail A/B: No CTR data yet, keeping default weights');
      return;
    }

    // Assign weights proportionally to CTR performance
    // But keep a minimum weight of 5% for exploration
    const MIN_WEIGHT = 5;
    const DISTRIBUTABLE_WEIGHT = 100 - this.thumbnailVariants.length * MIN_WEIGHT;

    for (const variant of this.thumbnailVariants) {
      const perf = this.variantPerformance.get(variant.id);
      if (perf && perf.videoCount >= 2) {
        // Weight based on performance
        const performanceRatio = perf.avgCtr / totalCtr;
        variant.weight = MIN_WEIGHT + performanceRatio * DISTRIBUTABLE_WEIGHT;
      } else {
        // Keep base weight for variants without enough data
        variant.weight = variant.baseWeight;
      }
    }

    // Normalize weights to sum to 100
    const currentTotal = this.thumbnailVariants.reduce((sum, v) => sum + v.weight, 0);
    for (const variant of this.thumbnailVariants) {
      variant.weight = (variant.weight / currentTotal) * 100;
    }

    console.log('📊 Thumbnail A/B: Weights recalculated:');
    for (const variant of this.thumbnailVariants) {
      console.log(`   ${variant.name}: ${variant.weight.toFixed(1)}%`);
    }

    // Persist all variant stats to database after weight recalculation
    for (const variant of this.thumbnailVariants) {
      this.saveVariantStats(variant.id);
    }
  }

  /**
   * Get all variant stats for UI display
   */
  getThumbnailVariantStats(): {
    variants: Array<{
      id: ThumbnailVariant;
      name: string;
      description: string;
      weight: number;
      videoCount: number;
      avgCtr: number;
      bestCtr: number;
      isLeading: boolean;
    }>;
    totalVideos: number;
    hasEnoughData: boolean;
    leadingVariant: string | null;
  } {
    const variantStats = this.thumbnailVariants.map((v) => {
      const perf = this.variantPerformance.get(v.id)!;
      return {
        id: v.id,
        name: v.name,
        description: v.description,
        weight: Math.round(v.weight * 10) / 10,
        videoCount: perf.videoCount,
        avgCtr: Math.round(perf.avgCtr * 100) / 100,
        bestCtr: Math.round(perf.bestCtr * 100) / 100,
        isLeading: false,
      };
    });

    // Find leading variant
    const withData = variantStats.filter((v) => v.videoCount >= 2);
    let leadingVariant: string | null = null;

    if (withData.length > 0) {
      const best = withData.reduce((a, b) => (a.avgCtr > b.avgCtr ? a : b));
      best.isLeading = true;
      leadingVariant = best.name;
    }

    const totalVideos = variantStats.reduce((sum, v) => sum + v.videoCount, 0);

    return {
      variants: variantStats,
      totalVideos,
      hasEnoughData: withData.length >= 2,
      leadingVariant,
    };
  }

  /**
   * Get variant assignment for a video
   */
  getVideoVariant(videoId: string): ThumbnailVariant | null {
    return this.videoVariantAssignments.get(videoId) || null;
  }

  // ============================================================================
  // TITLE ANALYSIS
  // ============================================================================

  analyzeTitle(title: string): TitleAnalysis {
    const words = title.split(/\s+/);
    const upperTitle = title.toUpperCase();

    // Detect format
    let format: TitleAnalysis['format'] = 'other';
    if (/\bvs\.?\b/i.test(title) || /\bversus\b/i.test(title)) {
      format = 'vs';
    } else if (/the\s+(story|tale|legend|rise|fall)\s+of/i.test(title)) {
      format = 'story_of';
    } else if (title.includes('?')) {
      format = 'question';
    } else if (/^\d+\s/.test(title) || /top\s+\d+/i.test(title)) {
      format = 'list';
    } else {
      format = 'statement';
    }

    // Find emotional words
    const emotionalWords = EMOTIONAL_WORDS.filter((word) => upperTitle.includes(word));

    // Find ALL CAPS words (excluding small words)
    const allCapsWords = words.filter((w) => w.length > 2 && w === w.toUpperCase() && /[A-Z]/.test(w));

    // Count emojis
    // @ts-ignore - Unicode regex flag
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu;
    const emojis = title.match(emojiRegex) || [];

    // Calculate emotional intensity
    let emotionalIntensity: TitleAnalysis['emotionalIntensity'] = 'low';
    if (emotionalWords.length >= 3 || allCapsWords.length >= 2) {
      emotionalIntensity = 'high';
    } else if (emotionalWords.length >= 1 || allCapsWords.length >= 1) {
      emotionalIntensity = 'medium';
    }

    return {
      length: title.length,
      wordCount: words.length,
      format,
      hasEmoji: emojis.length > 0,
      emojiCount: emojis.length,
      emotionalWords,
      emotionalIntensity,
      allCapsWords,
    };
  }

  // ============================================================================
  // HOOK ANALYSIS
  // ============================================================================

  analyzeHook(hookText: string): HookAnalysis {
    const words = hookText.split(/\s+/);
    const lowerHook = hookText.toLowerCase();
    const firstWord = words[0]?.toLowerCase() || '';

    // Detect style
    let style: HookAnalysis['style'] = 'other';

    // First person boast detection
    if (/^i\s+(am|was|have|conquered|crushed|destroyed|built|ruled)/i.test(hookText)) {
      style = 'first_person_boast';
    } else if (/^(my|mine)\s/i.test(hookText)) {
      style = 'first_person_boast';
    } else if (/^(they|he|she|the|in|when|before)/i.test(hookText)) {
      style = 'third_person_setup';
    } else if (hookText.includes('?')) {
      style = 'question';
    } else if (/^(did you know|nobody|no one|never|imagine)/i.test(hookText)) {
      style = 'shocking_fact';
    } else if (/^(watch|see|witness|behold|face me|come|fight)/i.test(hookText)) {
      style = 'challenge';
    }

    // Energy level based on punctuation and word choice
    const exclamationCount = (hookText.match(/!/g) || []).length;
    const capsRatio = (hookText.match(/[A-Z]/g) || []).length / hookText.length;
    const powerWords = [
      'crush',
      'destroy',
      'conquer',
      'dominate',
      'annihilate',
      'unleash',
      'rise',
      'fall',
      'die',
      'kill',
      'burn',
    ];
    const hasPowerWords = powerWords.some((w) => lowerHook.includes(w));

    let energyLevel: HookAnalysis['energyLevel'] = 'medium';
    if (exclamationCount >= 2 || capsRatio > 0.3 || (exclamationCount >= 1 && hasPowerWords)) {
      energyLevel = 'explosive';
    } else if (exclamationCount >= 1 || hasPowerWords) {
      energyLevel = 'high';
    } else if (style === 'question' || style === 'third_person_setup') {
      energyLevel = 'low';
    }

    // Direct address (you, your, watch, etc.)
    const hasDirectAddress = /\b(you|your|watch|witness|behold|see)\b/i.test(hookText);

    // Check if figure name is mentioned (common historical figure indicators)
    const figureIndicators = ['I am', 'My name is', 'They call me', "I'm", 'son of', 'daughter of'];
    const mentionsFigureName = figureIndicators.some((ind) => lowerHook.includes(ind.toLowerCase()));

    return {
      style,
      wordCount: words.length,
      energyLevel,
      hasDirectAddress,
      openingWord: firstWord,
      mentionsFigureName,
    };
  }

  // ============================================================================
  // THUMBNAIL ANALYSIS (via GPT vision or prompt analysis)
  // ============================================================================

  analyzeThumbnailPrompt(prompt: string): ThumbnailAnalysis {
    const lowerPrompt = prompt.toLowerCase();

    return {
      hasFace: /face|portrait|close-?up|expression|eyes|looking/i.test(prompt),
      isVsFormat: /vs\.?|versus|facing off|confrontation|battle.*between|two.*warriors/i.test(prompt),
      hasTextOverlay: /text|title|words|typography|bold.*text/i.test(prompt),
      colorPalette: this.detectColorPalette(lowerPrompt),
      expression: this.detectExpression(lowerPrompt),
      hasFireExplosions: /fire|flame|explosion|burning|inferno|blaze|smoke/i.test(prompt),
      subjectCount: this.detectSubjectCount(lowerPrompt),
    };
  }

  private detectColorPalette(prompt: string): ThumbnailAnalysis['colorPalette'] {
    const brightWords = ['bright', 'vibrant', 'colorful', 'gold', 'yellow', 'orange', 'red', 'saturated'];
    const darkWords = ['dark', 'shadow', 'black', 'night', 'dim', 'moody', 'dramatic lighting'];

    const hasBright = brightWords.some((w) => prompt.includes(w));
    const hasDark = darkWords.some((w) => prompt.includes(w));

    if (hasBright && hasDark) return 'mixed';
    if (hasBright) return 'bright';
    if (hasDark) return 'dark';
    return 'mixed';
  }

  private detectExpression(prompt: string): ThumbnailAnalysis['expression'] {
    if (/intense|fierce|angry|rage|fury|war/i.test(prompt)) return 'intense';
    if (/dramatic|epic|powerful|commanding/i.test(prompt)) return 'dramatic';
    if (/calm|neutral|stoic|serene/i.test(prompt)) return 'neutral';
    return 'unknown';
  }

  private detectSubjectCount(prompt: string): ThumbnailAnalysis['subjectCount'] {
    if (/two|2|both|facing each other|vs|versus/i.test(prompt)) return 2;
    if (/multiple|group|army|soldiers|crowd/i.test(prompt)) return 'multiple';
    return 1;
  }

  // ============================================================================
  // DATA RECORDING
  // ============================================================================

  recordCreative(
    videoId: string,
    figure: string,
    title: string,
    hookText: string,
    thumbnailPrompt?: string,
    youtubeId?: string,
  ): CreativeMetadata {
    const metadata: CreativeMetadata = {
      videoId,
      youtubeId,
      figure,
      thumbnail: thumbnailPrompt ? this.analyzeThumbnailPrompt(thumbnailPrompt) : this.getDefaultThumbnailAnalysis(),
      title: this.analyzeTitle(title),
      hook: this.analyzeHook(hookText),
      rawTitle: title,
      rawHook: hookText,
      thumbnailPrompt,
      createdAt: new Date(),
    };

    this.creativeData.set(videoId, metadata);
    this.capMapSize(this.creativeData, 1000);
    console.log(`📊 Recorded creative metadata for: ${figure}`);
    console.log(`   Title format: ${metadata.title.format}, Emotional: ${metadata.title.emotionalIntensity}`);
    console.log(`   Hook style: ${metadata.hook.style}, Energy: ${metadata.hook.energyLevel}`);

    return metadata;
  }

  private getDefaultThumbnailAnalysis(): ThumbnailAnalysis {
    return {
      hasFace: true,
      isVsFormat: false,
      hasTextOverlay: false,
      colorPalette: 'mixed',
      expression: 'dramatic',
      hasFireExplosions: false,
      subjectCount: 1,
    };
  }

  // ============================================================================
  // PERFORMANCE TRACKING
  // ============================================================================

  updatePerformance(
    videoId: string,
    metrics: {
      impressions: number;
      ctr: number;
      views: number;
      avgViewDuration: number;
      avgViewPercentage: number;
      retention0to3s?: number;
      engagementRate: number;
    },
  ): void {
    const creative = this.creativeData.get(videoId);
    if (!creative) {
      console.log(`⚠️ No creative metadata found for video: ${videoId}`);
      return;
    }

    const performance: CreativePerformance = {
      ...creative,
      ...metrics,
      retention0to3s: metrics.retention0to3s || metrics.avgViewPercentage,
    };

    this.performanceData.set(videoId, performance);
    this.capMapSize(this.performanceData, 1000);
    console.log(
      `📈 Updated performance for ${creative.figure}: CTR ${metrics.ctr.toFixed(2)}%, Views ${metrics.views}`,
    );
  }

  // ============================================================================
  // GPT PATTERN ANALYSIS
  // ============================================================================

  async analyzePatterns(): Promise<CreativeInsights> {
    const performances = Array.from(this.performanceData.values());

    if (performances.length < 3) {
      console.log('⚠️ Not enough data for pattern analysis (need 3+ videos)');
      return this.getEmptyInsights();
    }

    console.log(`\n🧠 Analyzing creative patterns across ${performances.length} videos...`);

    // Sort by CTR to find top/bottom performers
    const sortedByCtr = [...performances].sort((a, b) => b.ctr - a.ctr);
    const topPerformers = sortedByCtr.slice(0, Math.ceil(performances.length * 0.3));
    const bottomPerformers = sortedByCtr.slice(-Math.ceil(performances.length * 0.3));

    try {
      const patternSysPrompt = `You are a YouTube Shorts optimization expert analyzing creative elements (thumbnails, titles, hooks) to identify winning patterns.

Your job is to find SPECIFIC, ACTIONABLE patterns that correlate with high CTR and retention.

Return JSON with this structure:
{
  "thumbnailPatterns": [
    {
      "pattern": "vs_format_with_faces",
      "description": "Two dramatic faces facing off with VS in center",
      "whyItWorks": "Creates conflict/curiosity, viewers want to see who wins",
      "confidence": 85
    }
  ],
  "titlePatterns": [
    {
      "pattern": "emotional_caps_word",
      "description": "Using ALL CAPS emotional words like TERRIFYING, BRUTAL",
      "whyItWorks": "Triggers emotional response, stands out in feed",
      "confidence": 78
    }
  ],
  "hookPatterns": [
    {
      "pattern": "first_person_boast",
      "description": "Opening with 'I am [name], I [powerful claim]'",
      "whyItWorks": "Immediate character presence, bold claim hooks attention",
      "confidence": 82
    }
  ],
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2"
  ]
}`;

      const patternUserPrompt = `Analyze these creative elements and their performance:

TOP PERFORMERS (High CTR):
${topPerformers
  .map(
    (p) => `
- "${p.rawTitle}"
  Hook: "${p.rawHook.substring(0, 100)}..."
  Title Format: ${p.title.format}, Emotional Words: ${p.title.emotionalWords.join(', ') || 'none'}
  Hook Style: ${p.hook.style}, Energy: ${p.hook.energyLevel}
  Thumbnail: VS=${p.thumbnail.isVsFormat}, Face=${p.thumbnail.hasFace}, Colors=${p.thumbnail.colorPalette}
  CTR: ${p.ctr.toFixed(2)}%, Views: ${p.views}, Retention: ${p.avgViewPercentage.toFixed(1)}%
`,
  )
  .join('\n')}

BOTTOM PERFORMERS (Low CTR):
${bottomPerformers
  .map(
    (p) => `
- "${p.rawTitle}"
  Hook: "${p.rawHook.substring(0, 100)}..."
  Title Format: ${p.title.format}, Emotional Words: ${p.title.emotionalWords.join(', ') || 'none'}
  Hook Style: ${p.hook.style}, Energy: ${p.hook.energyLevel}
  Thumbnail: VS=${p.thumbnail.isVsFormat}, Face=${p.thumbnail.hasFace}, Colors=${p.thumbnail.colorPalette}
  CTR: ${p.ctr.toFixed(2)}%, Views: ${p.views}, Retention: ${p.avgViewPercentage.toFixed(1)}%
`,
  )
  .join('\n')}

Identify the specific patterns that differentiate top from bottom performers.`;

      const patternModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
        systemInstruction: patternSysPrompt,
      });
      const patternResult = await patternModel.generateContent(patternUserPrompt);
      const patternText = patternResult.response.text();

      const analysis = JSON.parse(patternText || '{}');

      // Convert to CreativePatterns
      const thumbnailWinners = this.convertToPatterns(analysis.thumbnailPatterns || [], 'thumbnail', performances);
      const titleWinners = this.convertToPatterns(analysis.titlePatterns || [], 'title', performances);
      const hookWinners = this.convertToPatterns(analysis.hookPatterns || [], 'hook', performances);

      this.insights = {
        thumbnailWinners,
        titleWinners,
        hookWinners,
        recommendations: analysis.recommendations || [],
        lastAnalyzed: new Date(),
      };

      // Store patterns
      [...thumbnailWinners, ...titleWinners, ...hookWinners].forEach((p) => {
        this.patterns.set(p.id, p);
      });
      this.capMapSize(this.patterns, 1000);

      this.lastAnalysis = new Date();
      console.log(`✅ Pattern analysis complete:`);
      console.log(`   Thumbnail patterns: ${thumbnailWinners.length}`);
      console.log(`   Title patterns: ${titleWinners.length}`);
      console.log(`   Hook patterns: ${hookWinners.length}`);

      return this.insights;
    } catch (error: any) {
      console.error('❌ Pattern analysis failed:', error.message);
      return this.getEmptyInsights();
    }
  }

  private convertToPatterns(
    rawPatterns: any[],
    category: CreativePattern['category'],
    performances: CreativePerformance[],
  ): CreativePattern[] {
    const avgCtr = performances.reduce((sum, p) => sum + p.ctr, 0) / performances.length;
    const avgRetention = performances.reduce((sum, p) => sum + p.avgViewPercentage, 0) / performances.length;

    return rawPatterns.map((p, i) => ({
      id: `${category}_${Date.now()}_${i}`,
      category,
      pattern: p.pattern || 'unknown',
      description: p.description || '',
      whyItWorks: p.whyItWorks || '',
      avgCtr: avgCtr * (1 + (p.confidence || 50) / 200), // Estimate based on confidence
      avgRetention: avgRetention,
      sampleCount: performances.length,
      successRate: p.confidence || 50,
      confidence: p.confidence || 50,
      examples: [],
      lastUpdated: new Date(),
    }));
  }

  private getEmptyInsights(): CreativeInsights {
    return {
      thumbnailWinners: [],
      titleWinners: [],
      hookWinners: [],
      recommendations: ['Need more video data for pattern analysis'],
      lastAnalyzed: new Date(),
    };
  }

  // ============================================================================
  // GENERATION GUIDANCE
  // ============================================================================

  getWinningFormulas(): {
    thumbnail: string[];
    title: string[];
    hook: string[];
  } {
    if (!this.insights) {
      return this.getDefaultFormulas();
    }

    return {
      thumbnail: this.insights.thumbnailWinners.map(
        (p) => `${p.description} (${p.confidence}% confidence) - ${p.whyItWorks}`,
      ),
      title: this.insights.titleWinners.map((p) => `${p.description} (${p.confidence}% confidence) - ${p.whyItWorks}`),
      hook: this.insights.hookWinners.map((p) => `${p.description} (${p.confidence}% confidence) - ${p.whyItWorks}`),
    };
  }

  getDefaultFormulas(): {
    thumbnail: string[];
    title: string[];
    hook: string[];
  } {
    return {
      thumbnail: [
        'VS format with two dramatic faces facing off - creates conflict/curiosity',
        'Big expressive face, bright contrasting colors - proven to stop scrolls',
        'Fire/explosions in background for epic feel - adds drama without overwhelming',
      ],
      title: [
        'Use ALL CAPS emotional words (BRUTAL, LEGENDARY, EPIC) - triggers emotional response',
        'VS format: "[Figure1] vs [Figure2]: Epic Rap Battle" - clear conflict hook',
        'Keep to 5-7 words max, front-load the hook',
      ],
      hook: [
        'First-person boast: "I am [name], I [powerful claim]!" - immediate presence',
        "Start with the figure's most famous quote or achievement",
        'High energy, explosive delivery in first 3 seconds',
      ],
    };
  }

  generateOptimizedHook(figure: string, achievement: string): string {
    const winningPatterns = this.insights?.hookWinners || [];
    const useFirstPerson =
      winningPatterns.some((p) => p.pattern.includes('first_person') || p.description.includes('first person')) || true; // Default to first person

    if (useFirstPerson) {
      return `I am ${figure}! ${achievement}—watch me prove it!`;
    }
    return `${figure}: ${achievement}`;
  }

  generateOptimizedThumbnailPrompt(figure1: string, figure2?: string): string {
    const winningPatterns = this.insights?.thumbnailWinners || [];
    const useVsFormat =
      figure2 && winningPatterns.some((p) => p.pattern.includes('vs') || p.description.includes('VS'));

    if (useVsFormat && figure2) {
      return `Two epic warriors facing off: ${figure1} on left, ${figure2} on right. Big expressive dramatic faces, intense eyes locked in combat. Bold "VS" text in center with fire and explosions in background. Bright contrasting colors, high drama, cinematic lighting. Historical epic battle style.`;
    }

    return `Epic portrait of ${figure1}: dramatic close-up face, intense powerful expression, looking directly at viewer. Rich warm colors, dramatic lighting with fire/golden glow in background. Historical warrior king/leader aesthetic, commanding presence.`;
  }

  generateOptimizedTitle(figure: string, theme: string): string {
    const winningPatterns = this.insights?.titleWinners || [];
    const useEmotionalCaps =
      winningPatterns.some((p) => p.pattern.includes('caps') || p.pattern.includes('emotional')) || true;

    const emotionalWord = EMOTIONAL_WORDS[Math.floor(Math.random() * 10)]; // Top 10

    if (useEmotionalCaps) {
      return `${figure}: The ${emotionalWord} Truth`;
    }
    return `${figure} - ${theme}`;
  }

  // ============================================================================
  // API METHODS
  // ============================================================================

  getInsights(): CreativeInsights | null {
    return this.insights;
  }

  getAllPatterns(): CreativePattern[] {
    return Array.from(this.patterns.values());
  }

  getCreativeData(videoId: string): CreativeMetadata | undefined {
    return this.creativeData.get(videoId);
  }

  getPerformanceData(videoId: string): CreativePerformance | undefined {
    return this.performanceData.get(videoId);
  }

  getAllPerformanceData(): CreativePerformance[] {
    return Array.from(this.performanceData.values());
  }

  getStats(): {
    totalVideosTracked: number;
    videosWithPerformance: number;
    patternsIdentified: number;
    lastAnalysis: string | null;
    topThumbnailPattern: string | null;
    topTitlePattern: string | null;
    topHookPattern: string | null;
  } {
    return {
      totalVideosTracked: this.creativeData.size,
      videosWithPerformance: this.performanceData.size,
      patternsIdentified: this.patterns.size,
      lastAnalysis: this.lastAnalysis?.toISOString() || null,
      topThumbnailPattern: this.insights?.thumbnailWinners[0]?.description || null,
      topTitlePattern: this.insights?.titleWinners[0]?.description || null,
      topHookPattern: this.insights?.hookWinners[0]?.description || null,
    };
  }

  // ============================================================================
  // SYNC WITH YOUTUBE ANALYTICS
  // ============================================================================

  async syncWithYouTubeData(
    videos: Array<{
      id: string;
      youtubeId: string;
      title: string;
      figure: string;
      hook?: string;
      thumbnailPrompt?: string;
      impressions: number;
      ctr: number;
      views: number;
      avgViewDuration: number;
      avgViewPercentage: number;
      engagementRate: number;
    }>,
  ): Promise<void> {
    console.log(`\n📊 Syncing creative analytics for ${videos.length} videos...`);

    for (const video of videos) {
      // Record creative metadata if not exists
      if (!this.creativeData.has(video.id)) {
        this.recordCreative(
          video.id,
          video.figure,
          video.title,
          video.hook || video.title, // Fallback to title if no hook
          video.thumbnailPrompt,
          video.youtubeId,
        );
      }

      // Update performance data
      this.updatePerformance(video.id, {
        impressions: video.impressions,
        ctr: video.ctr,
        views: video.views,
        avgViewDuration: video.avgViewDuration,
        avgViewPercentage: video.avgViewPercentage,
        engagementRate: video.engagementRate,
      });
    }

    // Run pattern analysis if we have enough data
    if (this.performanceData.size >= 5) {
      await this.analyzePatterns();
    }

    console.log(`✅ Creative analytics sync complete`);
  }
}

// Singleton export
export const creativeAnalyticsService = new CreativeAnalyticsService();
