/**
 * ANALYTICS AUTO-PILOT SERVICE
 *
 * Automatically adjusts the video generation and upload system based on
 * AI recommendations from the Strategic Summary. Unlike the Consensus Applier
 * which updates bandit weights, this service manages configuration overrides
 * that force specific behaviors.
 *
 * Features:
 * 1. Auto-Adjust Posting Times - Force optimal upload windows
 * 2. Auto-Adjust Style Preferences - Override Suno style selection
 * 3. Auto-Adjust Theme Priorities - Boost/reduce theme weights
 * 4. Auto-Adjust Thumbnail Strategy - Guide thumbnail generation
 */

import { db } from '../db';
import { strategicSummaries, thematicPrinciples } from '@shared/schema';
import { desc, eq, sql } from 'drizzle-orm';

export interface ThumbnailGuidance {
  emotion: string;
  colors: string[];
  composition: string;
}

export interface AutoPilotConfig {
  enabled: boolean;
  forcedPostingTime: string | null;
  forcedStyle: string | null;
  forcedTheme: string | null;
  thumbnailGuidance: ThumbnailGuidance | null;
  lastUpdated: Date;
  lastSummaryId: string | null;
  appliedRecommendations: string[];
}

const STYLE_MAPPING: Record<string, string> = {
  aggressive: 'gritty_warrior',
  gritty: 'gritty_warrior',
  dark: 'dark_trap_minimal',
  epic: 'epic_orchestral_trap',
  orchestral: 'orchestral_epic_slow',
  melodic: 'melodic_trap',
  'boom bap': 'boom_bap_classic',
  classic: 'boom_bap_classic',
  trap: 'dark_trap_minimal',
  cinematic: 'epic_orchestral_trap',
};

const THEME_MAPPING: Record<string, string> = {
  military: 'military_conquest',
  battle: 'military_conquest',
  war: 'military_conquest',
  conquest: 'military_conquest',
  rise: 'rise_and_fall',
  fall: 'rise_and_fall',
  empire: 'rise_and_fall',
  leadership: 'leadership_strategy',
  strategy: 'leadership_strategy',
  wisdom: 'leadership_strategy',
  legacy: 'legacy_remembrance',
  hero: 'heroic_journey',
  journey: 'heroic_journey',
  origin: 'origin_story',
  beginning: 'origin_story',
};

class AnalyticsAutoPilotService {
  private config: AutoPilotConfig = {
    enabled: false,
    forcedPostingTime: null,
    forcedStyle: null,
    forcedTheme: null,
    thumbnailGuidance: null,
    lastUpdated: new Date(),
    lastSummaryId: null,
    appliedRecommendations: [],
  };

  constructor() {
    console.log('🤖 [Auto-Pilot] Service initialized');
  }

  getConfig(): AutoPilotConfig {
    return { ...this.config };
  }

  setEnabled(enabled: boolean): AutoPilotConfig {
    this.config.enabled = enabled;
    this.config.lastUpdated = new Date();
    console.log(`🤖 [Auto-Pilot] ${enabled ? 'ENABLED' : 'DISABLED'}`);
    return this.getConfig();
  }

  resetToDefaults(): AutoPilotConfig {
    this.config = {
      enabled: this.config.enabled,
      forcedPostingTime: null,
      forcedStyle: null,
      forcedTheme: null,
      thumbnailGuidance: null,
      lastUpdated: new Date(),
      lastSummaryId: null,
      appliedRecommendations: [],
    };
    console.log('🤖 [Auto-Pilot] Reset to defaults');
    return this.getConfig();
  }

  async applyAutoPilot(): Promise<{
    success: boolean;
    config: AutoPilotConfig;
    changes: string[];
    errors: string[];
  }> {
    console.log('🤖 [Auto-Pilot] Starting auto-pilot application...');

    const changes: string[] = [];
    const errors: string[] = [];

    try {
      const [latestSummary] = await db
        .select()
        .from(strategicSummaries)
        .orderBy(desc(strategicSummaries.generatedAt))
        .limit(1);

      if (!latestSummary) {
        errors.push('No strategic summary found - run nightly analysis first');
        return { success: false, config: this.getConfig(), changes, errors };
      }

      console.log(`   📋 Processing summary from ${latestSummary.generatedAt}`);

      if (latestSummary.confidenceLevel === 'low') {
        errors.push(`Confidence too low (${latestSummary.confidenceLevel}) - skipping auto-apply`);
        return { success: false, config: this.getConfig(), changes, errors };
      }

      // Extract insights from patternInsights JSON column
      const insights = latestSummary.patternInsights as {
        themes?: string;
        lyrics?: string;
        audio?: string;
        thumbnails?: string;
        postingTimes?: string;
      } | null;

      const postingTimeChange = this.parsePostingTimeInsights(insights?.postingTimes || null);
      if (postingTimeChange) {
        this.config.forcedPostingTime = postingTimeChange;
        changes.push(`Forced posting time: ${postingTimeChange}`);
      }

      const styleChange = this.parseAudioInsights(insights?.audio || null);
      if (styleChange) {
        this.config.forcedStyle = styleChange;
        changes.push(`Forced style: ${styleChange}`);
      }

      const themeChange = await this.parseThemeInsights(insights?.themes || null);
      if (themeChange) {
        this.config.forcedTheme = themeChange;
        changes.push(`Forced theme: ${themeChange}`);
      }

      const thumbnailChange = this.parseThumbnailInsights(insights?.thumbnails || null);
      if (thumbnailChange) {
        this.config.thumbnailGuidance = thumbnailChange;
        changes.push(`Thumbnail guidance: ${thumbnailChange.emotion}, ${thumbnailChange.colors.join(', ')}`);
      }

      const recommendations = (latestSummary.recommendations as string[]) || [];
      this.config.appliedRecommendations = recommendations.slice(0, 5);

      this.config.lastUpdated = new Date();
      this.config.lastSummaryId = latestSummary.id;

      console.log(`✅ [Auto-Pilot] Applied ${changes.length} configuration changes`);

      return { success: true, config: this.getConfig(), changes, errors };
    } catch (error: any) {
      console.error('❌ [Auto-Pilot] Failed:', error.message);
      errors.push(error.message);
      return { success: false, config: this.getConfig(), changes, errors };
    }
  }

  private parsePostingTimeInsights(insight: string | null): string | null {
    if (!insight) return null;

    const lowerInsight = insight.toLowerCase();

    const timePatterns = [
      { pattern: /(?:best|optimal|peak).*?(\d{1,2})\s*(?:pm|:00\s*pm)/i, hour: (h: number) => h + 12 },
      { pattern: /(?:best|optimal|peak).*?(\d{1,2})\s*(?:am|:00\s*am)/i, hour: (h: number) => h },
      { pattern: /(?:evening|night).*?(?:6|7|8|9)\s*pm/i, hour: () => 18 },
      { pattern: /(?:afternoon).*?(?:3|4|5)\s*pm/i, hour: () => 15 },
      { pattern: /(?:morning).*?(?:9|10|11)\s*am/i, hour: () => 9 },
    ];

    for (const { pattern, hour } of timePatterns) {
      const match = insight.match(pattern);
      if (match) {
        const extractedHour = match[1] ? hour(parseInt(match[1], 10)) : hour(0);
        const normalizedHour = extractedHour % 24;
        return `${normalizedHour.toString().padStart(2, '0')}:00`;
      }
    }

    if (lowerInsight.includes('evening')) return '18:00';
    if (lowerInsight.includes('night')) return '21:00';
    if (lowerInsight.includes('afternoon')) return '15:00';
    if (lowerInsight.includes('morning')) return '09:00';

    return null;
  }

  private parseAudioInsights(insight: string | null): string | null {
    if (!insight) return null;

    const lowerInsight = insight.toLowerCase();

    for (const [keyword, style] of Object.entries(STYLE_MAPPING)) {
      if (lowerInsight.includes(keyword)) {
        const performancePattern = new RegExp(`${keyword}[^.]*?(\\d+)%\\s*(?:better|higher|more)`, 'i');
        const match = insight.match(performancePattern);

        if (match && parseInt(match[1], 10) >= 20) {
          console.log(`   🎵 Found strong style signal: "${keyword}" performs ${match[1]}% better`);
          return style;
        }

        if (lowerInsight.includes('recommend') || lowerInsight.includes('prefer') || lowerInsight.includes('best')) {
          return style;
        }
      }
    }

    return null;
  }

  private async parseThemeInsights(insight: string | null): Promise<string | null> {
    if (!insight) return null;

    const lowerInsight = insight.toLowerCase();
    let bestTheme: string | null = null;
    let highestMention = 0;

    for (const [keyword, theme] of Object.entries(THEME_MAPPING)) {
      const regex = new RegExp(keyword, 'gi');
      const matches = lowerInsight.match(regex);
      const count = matches ? matches.length : 0;

      if (count > highestMention) {
        const performancePattern = new RegExp(`${keyword}[^.]*?(\\d+)%`, 'i');
        const perfMatch = insight.match(performancePattern);

        if (perfMatch && parseInt(perfMatch[1], 10) >= 20) {
          bestTheme = theme;
          highestMention = count;
        } else if (lowerInsight.includes('recommend') || lowerInsight.includes('focus')) {
          bestTheme = theme;
          highestMention = count;
        }
      }
    }

    if (bestTheme) {
      try {
        await db
          .update(thematicPrinciples)
          .set({
            priority: sql`LEAST(priority + 0.5, 5.0)`,
            updatedAt: new Date(),
          } as any)
          .where(eq(thematicPrinciples.id, bestTheme));
        console.log(`   🎭 Boosted theme priority: ${bestTheme}`);
      } catch (error: any) {
        console.warn(`   ⚠️ Could not update theme priority: ${error.message}`);
      }
    }

    return bestTheme;
  }

  private parseThumbnailInsights(insight: string | null): ThumbnailGuidance | null {
    if (!insight) return null;

    const lowerInsight = insight.toLowerCase();

    let emotion = 'intense';
    if (lowerInsight.includes('anger') || lowerInsight.includes('rage')) emotion = 'angry';
    else if (lowerInsight.includes('confident') || lowerInsight.includes('power')) emotion = 'confident';
    else if (lowerInsight.includes('mysterious') || lowerInsight.includes('dark')) emotion = 'mysterious';
    else if (lowerInsight.includes('heroic') || lowerInsight.includes('triumph')) emotion = 'heroic';
    else if (lowerInsight.includes('dramatic')) emotion = 'dramatic';

    const colors: string[] = [];
    const colorPatterns = [
      { pattern: /red|crimson|scarlet/i, color: 'red' },
      { pattern: /gold|golden|amber/i, color: 'gold' },
      { pattern: /blue|azure|navy/i, color: 'blue' },
      { pattern: /green|emerald/i, color: 'green' },
      { pattern: /black|dark/i, color: 'black' },
      { pattern: /orange|fire/i, color: 'orange' },
      { pattern: /purple|violet/i, color: 'purple' },
    ];

    for (const { pattern, color } of colorPatterns) {
      if (pattern.test(insight)) {
        colors.push(color);
      }
    }

    if (colors.length === 0) {
      colors.push('gold', 'black');
    }

    let composition = 'centered';
    if (lowerInsight.includes('close-up') || lowerInsight.includes('closeup') || lowerInsight.includes('face')) {
      composition = 'close-up portrait';
    } else if (lowerInsight.includes('action') || lowerInsight.includes('dynamic')) {
      composition = 'dynamic action';
    } else if (lowerInsight.includes('wide') || lowerInsight.includes('epic')) {
      composition = 'epic wide shot';
    } else if (lowerInsight.includes('contrast') || lowerInsight.includes('split')) {
      composition = 'high contrast split';
    }

    return { emotion, colors, composition };
  }

  getForcedPostingTime(): string | null {
    return this.config.enabled ? this.config.forcedPostingTime : null;
  }

  getForcedStyle(): string | null {
    return this.config.enabled ? this.config.forcedStyle : null;
  }

  getForcedTheme(): string | null {
    return this.config.enabled ? this.config.forcedTheme : null;
  }

  getThumbnailGuidance(): ThumbnailGuidance | null {
    return this.config.enabled ? this.config.thumbnailGuidance : null;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getStatus(): {
    isActive: boolean;
    forcedStyle: string | null;
    forcedTheme: string | null;
    forcedPostingTime: string | null;
  } {
    return {
      isActive: this.config.enabled,
      forcedStyle: this.config.enabled ? this.config.forcedStyle : null,
      forcedTheme: this.config.enabled ? this.config.forcedTheme : null,
      forcedPostingTime: this.config.enabled ? this.config.forcedPostingTime : null,
    };
  }
}

export const analyticsAutoPilotService = new AnalyticsAutoPilotService();

export async function applyAutoPilot() {
  return analyticsAutoPilotService.applyAutoPilot();
}

export function getAutoPilotConfig() {
  return analyticsAutoPilotService.getConfig();
}

export function setAutoPilotEnabled(enabled: boolean) {
  return analyticsAutoPilotService.setEnabled(enabled);
}

export function resetToDefaults() {
  return analyticsAutoPilotService.resetToDefaults();
}
