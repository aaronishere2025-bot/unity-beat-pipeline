/**
 * Strategic Insights Injector
 *
 * Closes the feedback loop by automatically applying AI recommendations
 * from the Strategic Summary to future content generation.
 *
 * Flow: Strategic Summary → Insights Extraction → Injection into:
 *   - Suno Style Bandit (audio preferences)
 *   - Thumbnail Generator (visual styles)
 *   - Lyric Generator (narrative approaches)
 *   - Unity Orchestrator (topic selection)
 */

import { db } from '../db';
import { strategicSummaries } from '@shared/schema';
import { desc } from 'drizzle-orm';

export interface InjectedInsights {
  narrativeStyle: string;
  audioRecommendations: string[];
  visualRecommendations: string[];
  themeRecommendations: string[];
  avoidPatterns: string[];
  topPriority: string;
  confidenceLevel: 'high' | 'medium' | 'low';
  lastUpdated: Date;
}

class StrategicInsightsInjectorService {
  private cachedInsights: InjectedInsights | null = null;
  private cacheExpiry: Date | null = null;
  private readonly CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

  /**
   * Get the latest actionable insights from strategic summary
   */
  async getInjectedInsights(): Promise<InjectedInsights | null> {
    // Return cached if still valid
    if (this.cachedInsights && this.cacheExpiry && new Date() < this.cacheExpiry) {
      return this.cachedInsights;
    }

    try {
      const [latestSummary] = await db
        .select()
        .from(strategicSummaries)
        .orderBy(desc(strategicSummaries.generatedAt))
        .limit(1);

      if (!latestSummary) {
        console.log('📊 No strategic summary found for injection');
        return null;
      }

      const insights = this.extractInsights(latestSummary);
      this.cachedInsights = insights;
      this.cacheExpiry = new Date(Date.now() + this.CACHE_DURATION_MS);

      console.log(`🎯 [Insights Injector] Loaded insights from ${latestSummary.generatedAt}`);
      return insights;
    } catch (error: any) {
      console.error('❌ [Insights Injector] Failed to load insights:', error.message);
      return null;
    }
  }

  /**
   * Extract actionable insights from raw strategic summary
   */
  private extractInsights(summary: any): InjectedInsights {
    const rawData = summary.rawData || {};
    const claudeAnalysis = rawData.claudeAnalysis || {};
    const gptAnalysis = rawData.gptAnalysis || {};
    const geminiAnalysis = rawData.geminiAnalysis || {};
    const patternInsights = summary.patternInsights || {};

    // Extract narrative style from Claude (content strategist)
    let narrativeStyle = '';
    if (claudeAnalysis.executiveSummary) {
      narrativeStyle = this.extractNarrativePattern(claudeAnalysis.executiveSummary);
    }

    // Extract audio recommendations from all models
    const audioRecommendations: string[] = [];
    if (patternInsights.audio) {
      const audioPatterns = this.extractPatterns(patternInsights.audio);
      audioRecommendations.push(...audioPatterns);
    }
    if (gptAnalysis.audioInsight) {
      audioRecommendations.push(gptAnalysis.audioInsight);
    }

    // Extract visual/thumbnail recommendations
    const visualRecommendations: string[] = [];
    if (patternInsights.thumbnails) {
      const thumbPatterns = this.extractPatterns(patternInsights.thumbnails);
      visualRecommendations.push(...thumbPatterns);
    }
    if (geminiAnalysis.thumbnailInsight) {
      visualRecommendations.push(geminiAnalysis.thumbnailInsight);
    }

    // Extract theme recommendations
    const themeRecommendations: string[] = [];
    if (patternInsights.themes) {
      const themePatterns = this.extractPatterns(patternInsights.themes);
      themeRecommendations.push(...themePatterns);
    }

    // Extract winners for theme guidance
    const winners = summary.winnersAndLosers?.winners || [];
    for (const winner of winners.slice(0, 3)) {
      if (winner.insight) {
        themeRecommendations.push(`Winner pattern: ${winner.insight}`);
      }
    }

    // Extract warnings/avoid patterns
    const avoidPatterns = summary.warnings || [];

    // Extract top priority
    const execSummary = summary.executiveSummary || '';
    const topPriorityMatch = execSummary.match(/🎯 TOP PRIORITY: ([^\n]+)/);
    const topPriority = topPriorityMatch ? topPriorityMatch[1] : '';

    // Determine confidence
    let confidenceLevel: 'high' | 'medium' | 'low' = 'medium';
    const consensus = summary.consensus || {};
    if (consensus.agreementScore >= 70) {
      confidenceLevel = 'high';
    } else if (consensus.agreementScore < 30) {
      confidenceLevel = 'low';
    }

    return {
      narrativeStyle,
      audioRecommendations: audioRecommendations.slice(0, 5),
      visualRecommendations: visualRecommendations.slice(0, 5),
      themeRecommendations: themeRecommendations.slice(0, 5),
      avoidPatterns: avoidPatterns.slice(0, 5),
      topPriority,
      confidenceLevel,
      lastUpdated: new Date(summary.generatedAt),
    };
  }

  /**
   * Extract narrative pattern keywords from Claude's analysis
   */
  private extractNarrativePattern(text: string): string {
    const patterns: string[] = [];

    // Look for narrative style indicators
    if (/rivalry|versus|vs\./i.test(text)) patterns.push('RIVALRY_FRAMING');
    if (/first.person|"I"|perspective/i.test(text)) patterns.push('FIRST_PERSON');
    if (/epic|legendary|greatest/i.test(text)) patterns.push('EPIC_SCALE');
    if (/emotional|feeling|passion/i.test(text)) patterns.push('EMOTIONAL_HOOKS');
    if (/conflict|battle|war/i.test(text)) patterns.push('CONFLICT_DRIVEN');
    if (/mystery|secret|hidden/i.test(text)) patterns.push('MYSTERY_ELEMENTS');
    if (/underdog|rise|overcame/i.test(text)) patterns.push('UNDERDOG_ARC');

    return patterns.join(', ') || 'STANDARD_NARRATIVE';
  }

  /**
   * Extract key patterns from insight text
   */
  private extractPatterns(text: string): string[] {
    const patterns: string[] = [];

    // Split on periods and filter meaningful sentences
    const sentences = text.split(/[.!]/).filter((s) => s.trim().length > 20);

    for (const sentence of sentences.slice(0, 3)) {
      // Look for actionable phrases
      if (/perform|work|success|engage|retain/i.test(sentence)) {
        patterns.push(sentence.trim());
      }
    }

    return patterns;
  }

  /**
   * Generate a prompt injection for Suno lyrics generation
   */
  async getLyricInjection(): Promise<string> {
    const insights = await this.getInjectedInsights();
    if (!insights || insights.confidenceLevel === 'low') {
      return ''; // Don't inject low-confidence insights
    }

    let injection = '\n\n## STRATEGIC INSIGHTS (from AI analysis of past performance):\n';

    if (insights.narrativeStyle) {
      injection += `- NARRATIVE STYLE: Use ${insights.narrativeStyle} approach\n`;
    }

    for (const theme of insights.themeRecommendations.slice(0, 2)) {
      injection += `- ${theme}\n`;
    }

    if (insights.avoidPatterns.length > 0) {
      injection += `- AVOID: ${insights.avoidPatterns[0]}\n`;
    }

    return injection;
  }

  /**
   * Generate a prompt injection for thumbnail generation
   */
  async getThumbnailInjection(): Promise<string> {
    const insights = await this.getInjectedInsights();
    if (!insights || insights.confidenceLevel === 'low') {
      return '';
    }

    let injection = '\n## THUMBNAIL INSIGHTS:\n';

    for (const visual of insights.visualRecommendations.slice(0, 2)) {
      injection += `- ${visual}\n`;
    }

    return injection;
  }

  /**
   * Generate a prompt injection for Kling video prompts
   */
  async getVideoPromptInjection(): Promise<string> {
    const insights = await this.getInjectedInsights();
    if (!insights) {
      return '';
    }

    let injection = '';

    // Only inject high-confidence visual patterns
    if (insights.confidenceLevel === 'high' && insights.visualRecommendations.length > 0) {
      injection += `\nVisual style note: ${insights.visualRecommendations[0]}`;
    }

    return injection;
  }

  /**
   * Get audio style preferences for Suno
   */
  async getAudioStylePreferences(): Promise<{ preferredStyles: string[]; avoidStyles: string[] }> {
    const insights = await this.getInjectedInsights();

    const preferredStyles: string[] = [];
    const avoidStyles: string[] = [];

    if (!insights) {
      return { preferredStyles, avoidStyles };
    }

    // Parse audio recommendations for style hints
    for (const rec of insights.audioRecommendations) {
      if (/fast|upbeat|high.energy|peaks/i.test(rec)) {
        preferredStyles.push('high_energy');
      }
      if (/epic|cinematic|orchestral/i.test(rec)) {
        preferredStyles.push('epic_orchestral');
      }
      if (/trap|modern|beat/i.test(rec)) {
        preferredStyles.push('modern_trap');
      }
    }

    // Parse warnings for styles to avoid
    for (const warning of insights.avoidPatterns) {
      if (/slow|boring|flat/i.test(warning)) {
        avoidStyles.push('slow_ballad');
      }
      if (/generic|bland/i.test(warning)) {
        avoidStyles.push('generic_pop');
      }
    }

    return { preferredStyles, avoidStyles };
  }

  /**
   * Check if we should prioritize a specific theme based on insights
   */
  async shouldPrioritizeTheme(theme: string): Promise<{ prioritize: boolean; reason?: string }> {
    const insights = await this.getInjectedInsights();
    if (!insights) {
      return { prioritize: false };
    }

    const themeLower = theme.toLowerCase();

    // Check if theme matches winning patterns
    for (const rec of insights.themeRecommendations) {
      const recLower = rec.toLowerCase();
      if (recLower.includes(themeLower) || themeLower.includes(recLower.split(' ')[0])) {
        return { prioritize: true, reason: rec };
      }
    }

    // Check if theme should be avoided
    for (const avoid of insights.avoidPatterns) {
      if (avoid.toLowerCase().includes(themeLower)) {
        return { prioritize: false, reason: `Avoid: ${avoid}` };
      }
    }

    return { prioritize: false };
  }

  /**
   * Clear the cache to force fresh insights
   */
  clearCache(): void {
    this.cachedInsights = null;
    this.cacheExpiry = null;
    console.log('🔄 [Insights Injector] Cache cleared');
  }

  /**
   * Get a summary of current insights for logging
   */
  async getInsightsSummary(): Promise<string> {
    const insights = await this.getInjectedInsights();
    if (!insights) {
      return 'No strategic insights available';
    }

    return `Strategic Insights (${insights.confidenceLevel} confidence):
- Narrative: ${insights.narrativeStyle || 'standard'}
- Priority: ${insights.topPriority || 'none set'}
- Themes: ${insights.themeRecommendations.length} recommendations
- Avoid: ${insights.avoidPatterns.length} warnings
- Last updated: ${insights.lastUpdated.toISOString()}`;
  }
}

export const strategicInsightsInjector = new StrategicInsightsInjectorService();
