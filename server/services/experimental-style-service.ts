/**
 * Experimental Style Service (A/B Master Loop)
 *
 * 10% of videos are "experimental" with weird music, different art styles.
 * If an experiment hits, the system "adopts" that style across the whole farm.
 *
 * This fights the "sameness" problem - AI systems drift toward a mean without variation.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface ExperimentalStyle {
  id: string;
  name: string;
  description: string;

  // Prompt modifiers
  visualStyle: string; // Added to Kling prompts
  musicStyle: string; // Added to Suno prompts
  lyricsStyle: string; // Added to GPT lyrics prompts

  // Tracking
  timesUsed: number;
  videos: string[]; // Video IDs that used this style
  avgViews: number;
  avgRetention: number;
  avgCTR: number;

  // Status
  status: 'experimental' | 'promising' | 'adopted' | 'retired';
  createdAt: string;
  lastUsed: string | null;
}

interface ExperimentOutcome {
  videoId: string;
  styleId: string;
  views: number;
  retention: number;
  ctr: number;
  recordedAt: string;
}

interface ExperimentalConfig {
  experimentRate: number; // % of videos that are experimental (default: 10)
  minVideosToEvaluate: number; // Min videos before judging a style (default: 3)
  adoptionThreshold: number; // Performance vs baseline to adopt (default: 1.3 = 30% better)
  retirementThreshold: number; // Performance vs baseline to retire (default: 0.5 = 50% worse)
}

const DEFAULT_CONFIG: ExperimentalConfig = {
  experimentRate: 10,
  minVideosToEvaluate: 3,
  adoptionThreshold: 1.3,
  retirementThreshold: 0.5,
};

// Pre-defined experimental styles to try
const EXPERIMENTAL_STYLES: Omit<
  ExperimentalStyle,
  'timesUsed' | 'videos' | 'avgViews' | 'avgRetention' | 'avgCTR' | 'status' | 'createdAt' | 'lastUsed'
>[] = [
  {
    id: 'dark_cinematic',
    name: 'Dark Cinematic',
    description: 'Moody, high-contrast visuals with dramatic lighting',
    visualStyle: 'dark cinematic lighting, high contrast, dramatic shadows, film noir aesthetic, moody atmosphere',
    musicStyle: '[Dark Orchestral] [Epic Choir] [Minor Key]',
    lyricsStyle: 'Use darker, more ominous language. Focus on tragedy and downfall.',
  },
  {
    id: 'anime_battle',
    name: 'Anime Battle',
    description: 'Anime-inspired action sequences with speed lines',
    visualStyle: 'anime style, dynamic action poses, speed lines, dramatic angles, cel shading, vibrant colors',
    musicStyle: '[J-Rock] [Intense] [Fast Tempo] [Guitar Riffs]',
    lyricsStyle: 'Use short, punchy lines. Include battle cries and dramatic declarations.',
  },
  {
    id: 'oil_painting',
    name: 'Renaissance Oil Painting',
    description: 'Classical oil painting aesthetic, museum quality',
    visualStyle:
      'oil painting style, renaissance art, chiaroscuro lighting, classical composition, museum quality, Rembrandt lighting',
    musicStyle: '[Classical] [Orchestral] [Baroque] [Harpsichord]',
    lyricsStyle: 'Use elevated, poetic language. Reference classical virtues and philosophical concepts.',
  },
  {
    id: 'graffiti_street',
    name: 'Street Art Graffiti',
    description: 'Urban street art style with bold colors',
    visualStyle: 'graffiti art style, street art, bold colors, spray paint texture, urban aesthetic, Banksy-inspired',
    musicStyle: '[Boom Bap] [Old School Hip Hop] [Scratch Effects] [Heavy Bass]',
    lyricsStyle: 'Use street slang and raw energy. Reference modern struggles and rebellion.',
  },
  {
    id: 'neon_synthwave',
    name: 'Neon Synthwave',
    description: '80s retro-futuristic with neon colors and grid lines',
    visualStyle: 'synthwave aesthetic, neon colors, retro 80s, digital grid, chrome reflections, VHS distortion',
    musicStyle: '[Synthwave] [80s Retro] [Electronic Drums] [Synth Leads]',
    lyricsStyle: 'Reference technology and the future. Use metaphors about machines and digital worlds.',
  },
  {
    id: 'watercolor_ethereal',
    name: 'Watercolor Ethereal',
    description: 'Soft watercolor with dreamy, flowing visuals',
    visualStyle: 'watercolor painting, soft edges, flowing colors, ethereal atmosphere, dreamy, pastel tones',
    musicStyle: '[Ethereal] [Ambient] [Soft Piano] [String Swells]',
    lyricsStyle: 'Use flowing, poetic language. Focus on emotions and inner journeys.',
  },
  {
    id: 'comic_book',
    name: 'Comic Book Action',
    description: 'Bold comic book style with halftone dots and action panels',
    visualStyle:
      'comic book style, bold outlines, halftone dots, dynamic composition, Jack Kirby inspired, pow effects',
    musicStyle: '[Heroic Orchestral] [Brass Heavy] [Triumphant] [March Tempo]',
    lyricsStyle: 'Use heroic declarations and dramatic one-liners. Reference superhuman feats.',
  },
  {
    id: 'horror_gothic',
    name: 'Gothic Horror',
    description: 'Dark gothic atmosphere with supernatural elements',
    visualStyle: 'gothic horror, dark castle, fog, moonlight, supernatural glow, Victorian gothic, eerie shadows',
    musicStyle: '[Dark Ambient] [Organ] [Choir] [Haunting Melody]',
    lyricsStyle: 'Use ominous foreshadowing and supernatural themes. Reference death and the unknown.',
  },
];

class ExperimentalStyleService {
  private dataPath: string;
  private styles: Map<string, ExperimentalStyle> = new Map();
  private outcomes: ExperimentOutcome[] = [];
  private config: ExperimentalConfig;
  private baselineStats: { avgViews: number; avgRetention: number; avgCTR: number } | null = null;

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'experimental_styles.json');
    this.config = DEFAULT_CONFIG;
    this.loadData();
  }

  private loadData(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });

      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        this.styles = new Map(Object.entries(data.styles || {}));
        this.outcomes = data.outcomes || [];
        this.config = { ...DEFAULT_CONFIG, ...data.config };
        this.baselineStats = data.baselineStats || null;
      } else {
        // Initialize with experimental styles
        this.initializeStyles();
      }
    } catch (error) {
      console.warn('⚠️ Could not load experimental styles data');
      this.initializeStyles();
    }
  }

  private initializeStyles(): void {
    for (const style of EXPERIMENTAL_STYLES) {
      this.styles.set(style.id, {
        ...style,
        timesUsed: 0,
        videos: [],
        avgViews: 0,
        avgRetention: 0,
        avgCTR: 0,
        status: 'experimental',
        createdAt: new Date().toISOString(),
        lastUsed: null,
      });
    }
    this.saveData();
  }

  private saveData(): void {
    try {
      const data = {
        styles: Object.fromEntries(this.styles),
        outcomes: this.outcomes.slice(-500), // Keep last 500 outcomes
        config: this.config,
        baselineStats: this.baselineStats,
      };
      writeFileSync(this.dataPath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('⚠️ Could not save experimental styles data');
    }
  }

  /**
   * Update baseline stats from regular (non-experimental) videos
   */
  updateBaseline(avgViews: number, avgRetention: number, avgCTR: number): void {
    this.baselineStats = { avgViews, avgRetention, avgCTR };
    this.saveData();
    console.log(
      `📊 Updated baseline: ${avgViews.toFixed(0)} views, ${avgRetention.toFixed(1)}% retention, ${avgCTR.toFixed(2)}% CTR`,
    );
  }

  /**
   * Decide if this video should be experimental
   * Returns style to use, or null for standard approach
   */
  shouldBeExperimental(videoId: string): ExperimentalStyle | null {
    // Roll the dice
    const roll = Math.random() * 100;
    if (roll > this.config.experimentRate) {
      return null; // Not experimental
    }

    // Get available experimental styles (not retired)
    const availableStyles = Array.from(this.styles.values()).filter((s) => s.status !== 'retired');

    if (availableStyles.length === 0) {
      return null;
    }

    // Prefer styles with fewer uses (exploration)
    // But also give promising styles more chances (exploitation)
    const weights = availableStyles.map((s) => {
      if (s.status === 'promising') return 3; // 3x weight for promising
      if (s.status === 'adopted') return 0.5; // Less weight for already-adopted
      return 1 + (5 - Math.min(s.timesUsed, 5)); // More weight for less-used
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < availableStyles.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        const selected = availableStyles[i];
        console.log(`🧪 EXPERIMENTAL: Using style "${selected.name}" for video ${videoId}`);
        return selected;
      }
    }

    return availableStyles[0];
  }

  /**
   * Record that a style was used for a video
   */
  recordStyleUsage(styleId: string, videoId: string): void {
    const style = this.styles.get(styleId);
    if (!style) return;

    style.timesUsed++;
    style.videos.push(videoId);
    style.lastUsed = new Date().toISOString();
    this.saveData();
  }

  /**
   * Record outcome for an experimental video
   */
  recordOutcome(videoId: string, styleId: string, views: number, retention: number, ctr: number): void {
    this.outcomes.push({
      videoId,
      styleId,
      views,
      retention,
      ctr,
      recordedAt: new Date().toISOString(),
    });

    // Update style stats
    const style = this.styles.get(styleId);
    if (style) {
      const styleOutcomes = this.outcomes.filter((o) => o.styleId === styleId);
      style.avgViews = styleOutcomes.reduce((a, o) => a + o.views, 0) / styleOutcomes.length;
      style.avgRetention = styleOutcomes.reduce((a, o) => a + o.retention, 0) / styleOutcomes.length;
      style.avgCTR = styleOutcomes.reduce((a, o) => a + o.ctr, 0) / styleOutcomes.length;

      // Evaluate style status
      this.evaluateStyle(style);
    }

    this.saveData();
  }

  /**
   * Evaluate if a style should be promoted or retired
   */
  private evaluateStyle(style: ExperimentalStyle): void {
    if (style.timesUsed < this.config.minVideosToEvaluate) {
      return; // Not enough data
    }

    if (!this.baselineStats) {
      return; // No baseline to compare
    }

    // Calculate performance ratio vs baseline
    const viewsRatio = style.avgViews / Math.max(this.baselineStats.avgViews, 1);
    const retentionRatio = style.avgRetention / Math.max(this.baselineStats.avgRetention, 1);
    const ctrRatio = style.avgCTR / Math.max(this.baselineStats.avgCTR, 0.01);

    // Combined score (weighted average)
    const performanceScore = viewsRatio * 0.4 + retentionRatio * 0.4 + ctrRatio * 0.2;

    const previousStatus = style.status;

    if (performanceScore >= this.config.adoptionThreshold) {
      style.status = 'adopted';
      if (previousStatus !== 'adopted') {
        console.log(
          `🎉 STYLE ADOPTED: "${style.name}" is performing ${((performanceScore - 1) * 100).toFixed(0)}% better than baseline!`,
        );
      }
    } else if (performanceScore >= 0.9) {
      style.status = 'promising';
      if (previousStatus === 'experimental') {
        console.log(`📈 STYLE PROMISING: "${style.name}" is showing potential`);
      }
    } else if (performanceScore <= this.config.retirementThreshold) {
      style.status = 'retired';
      if (previousStatus !== 'retired') {
        console.log(
          `⚰️ STYLE RETIRED: "${style.name}" is performing ${((1 - performanceScore) * 100).toFixed(0)}% worse than baseline`,
        );
      }
    }
  }

  /**
   * Get style modifiers to apply to prompts
   */
  getStyleModifiers(style: ExperimentalStyle): {
    visualModifier: string;
    musicModifier: string;
    lyricsModifier: string;
  } {
    return {
      visualModifier: style.visualStyle,
      musicModifier: style.musicStyle,
      lyricsModifier: style.lyricsStyle,
    };
  }

  /**
   * Get adopted styles (for use in all videos)
   */
  getAdoptedStyles(): ExperimentalStyle[] {
    return Array.from(this.styles.values()).filter((s) => s.status === 'adopted');
  }

  /**
   * Get status summary
   */
  getStatus(): {
    config: ExperimentalConfig;
    baseline: any;
    styles: Array<{
      id: string;
      name: string;
      status: string;
      timesUsed: number;
      avgViews: number;
      avgRetention: number;
      performanceVsBaseline: number | null;
    }>;
    recentOutcomes: ExperimentOutcome[];
  } {
    const stylesWithPerf = Array.from(this.styles.values()).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      timesUsed: s.timesUsed,
      avgViews: s.avgViews,
      avgRetention: s.avgRetention,
      performanceVsBaseline: this.baselineStats ? s.avgViews / Math.max(this.baselineStats.avgViews, 1) : null,
    }));

    return {
      config: this.config,
      baseline: this.baselineStats,
      styles: stylesWithPerf,
      recentOutcomes: this.outcomes.slice(-20),
    };
  }

  /**
   * Add a new experimental style
   */
  addStyle(
    style: Omit<
      ExperimentalStyle,
      'timesUsed' | 'videos' | 'avgViews' | 'avgRetention' | 'avgCTR' | 'status' | 'createdAt' | 'lastUsed'
    >,
  ): void {
    this.styles.set(style.id, {
      ...style,
      timesUsed: 0,
      videos: [],
      avgViews: 0,
      avgRetention: 0,
      avgCTR: 0,
      status: 'experimental',
      createdAt: new Date().toISOString(),
      lastUsed: null,
    });
    this.saveData();
    console.log(`🧪 Added new experimental style: "${style.name}"`);
  }

  /**
   * Update config
   */
  updateConfig(updates: Partial<ExperimentalConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveData();
  }
}

export const experimentalStyleService = new ExperimentalStyleService();
