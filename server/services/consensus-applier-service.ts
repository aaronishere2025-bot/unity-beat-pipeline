/**
 * CONSENSUS APPLIER SERVICE
 *
 * Closes the feedback loop by automatically applying AI consensus recommendations
 * back into the system's decision-making components:
 *
 * 1. Thompson Sampling bandits (style, posting time)
 * 2. Character priority queue
 * 3. Thumbnail generation guidance
 * 4. Theme weighting
 *
 * This creates a true learning system where AI insights drive future content.
 */

import { db } from '../db';
import {
  strategicSummaries,
  characterProfiles,
  thematicPrinciples,
  styleBanditArms,
  postingTimeArms,
} from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';

interface ConsensusDirective {
  category: 'style' | 'character' | 'theme' | 'thumbnail' | 'posting_time';
  action: 'boost' | 'reduce' | 'maintain' | 'add';
  target: string;
  reason: string;
  confidence: number; // 0-1
}

interface ApplyResult {
  applied: number;
  skipped: number;
  errors: number;
  changes: Array<{
    category: string;
    target: string;
    action: string;
    before: any;
    after: any;
  }>;
}

class ConsensusApplierService {
  /**
   * Apply the latest strategic summary recommendations to all system components
   */
  async applyLatestConsensus(): Promise<ApplyResult> {
    console.log(`🔄 [Consensus Applier] Starting to apply latest consensus recommendations...`);

    const result: ApplyResult = {
      applied: 0,
      skipped: 0,
      errors: 0,
      changes: [],
    };

    try {
      // Get the latest strategic summary
      const [latestSummary] = await db
        .select()
        .from(strategicSummaries)
        .orderBy(desc(strategicSummaries.generatedAt))
        .limit(1);

      if (!latestSummary) {
        console.log(`   ⚠️ No strategic summary found - run nightly summary first`);
        return result;
      }

      console.log(`   📋 Applying consensus from ${latestSummary.generatedAt}`);
      console.log(`   📊 Confidence level: ${latestSummary.confidenceLevel}`);

      // Only apply if confidence is reasonable (medium or high)
      if (latestSummary.confidenceLevel === 'low') {
        console.log(`   ⚠️ Confidence too low (${latestSummary.confidenceLevel}) - skipping auto-apply`);
        result.skipped++;
        return result;
      }

      // Parse the insights and recommendations
      const directives = this.parseDirectives(latestSummary);
      console.log(`   🎯 Found ${directives.length} directives to apply`);

      // Apply each directive
      for (const directive of directives) {
        try {
          const change = await this.applyDirective(directive);
          if (change) {
            result.changes.push(change);
            result.applied++;
          } else {
            result.skipped++;
          }
        } catch (error: any) {
          console.error(`   ❌ Failed to apply directive:`, error.message);
          result.errors++;
        }
      }

      console.log(
        `✅ [Consensus Applier] Complete: ${result.applied} applied, ${result.skipped} skipped, ${result.errors} errors`,
      );
      return result;
    } catch (error: any) {
      console.error(`❌ [Consensus Applier] Failed:`, error.message);
      result.errors++;
      return result;
    }
  }

  /**
   * Parse the strategic summary into actionable directives
   */
  private parseDirectives(summary: any): ConsensusDirective[] {
    const directives: ConsensusDirective[] = [];

    // Parse theme insights
    if (summary.insightThemes) {
      const themeDirectives = this.parseThemeInsights(summary.insightThemes);
      directives.push(...themeDirectives);
    }

    // Parse audio/style insights
    if (summary.insightAudio) {
      const audioDirectives = this.parseAudioInsights(summary.insightAudio);
      directives.push(...audioDirectives);
    }

    // Parse thumbnail insights
    if (summary.insightThumbnails) {
      const thumbnailDirectives = this.parseThumbnailInsights(summary.insightThumbnails);
      directives.push(...thumbnailDirectives);
    }

    // Parse posting time insights
    if (summary.insightPostingTimes) {
      const timeDirectives = this.parsePostingTimeInsights(summary.insightPostingTimes);
      directives.push(...timeDirectives);
    }

    // Parse general recommendations
    if (summary.recommendations) {
      const recDirectives = this.parseRecommendations(summary.recommendations);
      directives.push(...recDirectives);
    }

    return directives;
  }

  /**
   * Parse theme insights into directives
   */
  private parseThemeInsights(insight: string): ConsensusDirective[] {
    const directives: ConsensusDirective[] = [];
    const lowerInsight = insight.toLowerCase();

    // Detect recommended themes
    const themePatterns = [
      { pattern: /military|battle|war|conquest/i, target: 'military_conflict', action: 'boost' as const },
      { pattern: /roman|rome|caesar|augustus/i, target: 'ancient_rome', action: 'boost' as const },
      { pattern: /greek|sparta|athens|alexander/i, target: 'ancient_greece', action: 'boost' as const },
      { pattern: /medieval|knight|crusade/i, target: 'medieval', action: 'boost' as const },
      { pattern: /religious|biblical|jesus|moses/i, target: 'religious', action: 'boost' as const },
      { pattern: /underperform|avoid|reduce|less of/i, target: 'detected_weak', action: 'reduce' as const },
    ];

    for (const { pattern, target, action } of themePatterns) {
      if (pattern.test(lowerInsight)) {
        directives.push({
          category: 'theme',
          action,
          target,
          reason: `Theme insight: ${insight.substring(0, 100)}...`,
          confidence: 0.7,
        });
      }
    }

    return directives;
  }

  /**
   * Parse audio/style insights into directives
   */
  private parseAudioInsights(insight: string): ConsensusDirective[] {
    const directives: ConsensusDirective[] = [];
    const lowerInsight = insight.toLowerCase();

    const stylePatterns = [
      {
        pattern: /orchestral|epic|cinematic|golden|imperial|triumphant/i,
        target: 'golden_empire',
        action: 'boost' as const,
      },
      { pattern: /trap|808|aggressive|drill|gritty/i, target: 'gritty_warrior', action: 'boost' as const },
      { pattern: /dark|modern|minimal|sleek/i, target: 'modern_dark', action: 'boost' as const },
      { pattern: /historical|vintage|parchment|old/i, target: 'parchment_history', action: 'boost' as const },
    ];

    for (const { pattern, target, action } of stylePatterns) {
      if (pattern.test(lowerInsight)) {
        directives.push({
          category: 'style',
          action,
          target, // Target is already mapped to database entry
          reason: `Audio insight: ${insight.substring(0, 100)}...`,
          confidence: 0.7,
        });
      }
    }

    return directives;
  }

  /**
   * Parse thumbnail insights into directives
   */
  private parseThumbnailInsights(insight: string): ConsensusDirective[] {
    const directives: ConsensusDirective[] = [];

    // Thumbnail directives are stored as guidance, not bandit updates
    directives.push({
      category: 'thumbnail',
      action: 'maintain',
      target: 'guidance',
      reason: insight,
      confidence: 0.8,
    });

    return directives;
  }

  /**
   * Parse posting time insights into directives
   */
  private parsePostingTimeInsights(insight: string): ConsensusDirective[] {
    const directives: ConsensusDirective[] = [];
    const lowerInsight = insight.toLowerCase();

    // Detect time patterns
    const timePatterns = [
      { pattern: /morning|early|8am|9am|10am/i, target: 'morning', action: 'boost' as const },
      { pattern: /afternoon|noon|12pm|1pm|2pm|3pm/i, target: 'afternoon', action: 'boost' as const },
      { pattern: /evening|night|6pm|7pm|8pm|9pm|10pm/i, target: 'evening', action: 'boost' as const },
      { pattern: /weekend|saturday|sunday/i, target: 'weekend', action: 'boost' as const },
    ];

    for (const { pattern, target, action } of timePatterns) {
      if (pattern.test(lowerInsight)) {
        directives.push({
          category: 'posting_time',
          action,
          target,
          reason: `Posting insight: ${insight.substring(0, 100)}...`,
          confidence: 0.6,
        });
      }
    }

    return directives;
  }

  /**
   * Parse general recommendations into directives
   */
  private parseRecommendations(recommendations: string[]): ConsensusDirective[] {
    const directives: ConsensusDirective[] = [];

    for (const rec of recommendations) {
      // Parse character mentions
      const characterMatch = rec.match(/more\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
      if (characterMatch) {
        directives.push({
          category: 'character',
          action: 'boost',
          target: characterMatch[1],
          reason: rec,
          confidence: 0.6,
        });
      }

      // Parse style recommendations
      if (/aggressive|intense|energy|drill|trap|gritty/i.test(rec)) {
        directives.push({
          category: 'style',
          action: 'boost',
          target: 'gritty_warrior',
          reason: rec,
          confidence: 0.5,
        });
      } else if (/epic|golden|imperial|triumphant/i.test(rec)) {
        directives.push({
          category: 'style',
          action: 'boost',
          target: 'golden_empire',
          reason: rec,
          confidence: 0.5,
        });
      } else if (/dark|modern|minimal|sleek/i.test(rec)) {
        directives.push({
          category: 'style',
          action: 'boost',
          target: 'modern_dark',
          reason: rec,
          confidence: 0.5,
        });
      } else if (/historical|vintage|parchment|old/i.test(rec)) {
        directives.push({
          category: 'style',
          action: 'boost',
          target: 'parchment_history',
          reason: rec,
          confidence: 0.5,
        });
      }
    }

    return directives;
  }

  /**
   * Maps AI style descriptions to actual database style names
   */
  private mapStyleName(aiStyle: string): string {
    const lowerStyle = aiStyle.toLowerCase();

    // Controlled vocabulary mapping as requested
    const styleMap: Record<string, string[]> = {
      gritty_warrior: ['aggressive', 'drill', 'trap', 'gritty'],
      golden_empire: ['epic', 'golden', 'imperial', 'triumphant'],
      modern_dark: ['dark', 'modern', 'minimal', 'sleek'],
      parchment_history: ['historical', 'vintage', 'parchment', 'old'],
    };

    for (const [dbStyle, keywords] of Object.entries(styleMap)) {
      if (keywords.some((keyword) => lowerStyle.includes(keyword)) || lowerStyle.includes(dbStyle)) {
        console.log(`   🎯 [Style Mapping] Resolved "${aiStyle}" to "${dbStyle}"`);
        return dbStyle;
      }
    }

    return aiStyle;
  }

  /**
   * Levenshtein-like fuzzy matching for strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = (str1 || '').toLowerCase();
    const s2 = (str2 || '').toLowerCase();

    if (s1 === s2) return 1.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    const editDistance = (a: string, b: string): number => {
      const matrix = Array.from({ length: a.length + 1 }, () => Array.from({ length: b.length + 1 }, (_, j) => j));
      for (let i = 1; i <= a.length; i++) matrix[i][0] = i;

      for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
          const cost = a[i - 1] === b[j - 1] ? 0 : 1;
          matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
        }
      }
      return matrix[a.length][b.length];
    };

    const distance = editDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Apply a single directive to the appropriate system component
   */
  private async applyDirective(directive: ConsensusDirective): Promise<any | null> {
    const boostAmount = directive.confidence * 2; // 0-2 range for alpha/beta adjustments

    switch (directive.category) {
      case 'style':
        return await this.applyStyleDirective(directive, boostAmount);

      case 'character':
        return await this.applyCharacterDirective(directive, boostAmount);

      case 'theme':
        return await this.applyThemeDirective(directive, boostAmount);

      case 'posting_time':
        return await this.applyPostingTimeDirective(directive, boostAmount);

      case 'thumbnail':
        // Thumbnail guidance is stored but not applied to a bandit
        console.log(`   📸 Thumbnail guidance stored: ${directive.reason.substring(0, 50)}...`);
        return null;

      default:
        return null;
    }
  }

  /**
   * Apply style directive to Suno Style Bandit
   */
  private async applyStyleDirective(directive: ConsensusDirective, boostAmount: number): Promise<any | null> {
    try {
      const resolvedTarget = this.mapStyleName(directive.target);

      // Find style by name (case-insensitive partial match)
      const arms = await db
        .select()
        .from(styleBanditArms)
        .where(sql`LOWER(${styleBanditArms.styleName}) = LOWER(${resolvedTarget})`)
        .limit(1);

      const existingArm = arms[0];

      if (!existingArm) {
        console.log(`   ⚠️ Style arm not found: ${directive.target} (resolved to: ${resolvedTarget})`);
        return null;
      }

      const beforeAlpha = existingArm.alpha;
      const beforeBeta = existingArm.beta;

      let newAlpha = existingArm.alpha;
      let newBeta = existingArm.beta;

      if (directive.action === 'boost') {
        // Increase alpha (successes) to make this style more likely
        newAlpha = existingArm.alpha + boostAmount;
      } else if (directive.action === 'reduce') {
        // Increase beta (failures) to make this style less likely
        newBeta = existingArm.beta + boostAmount;
      }

      await db
        .update(styleBanditArms)
        .set({
          alpha: newAlpha,
          beta: newBeta,
        })
        .where(eq(styleBanditArms.id, existingArm.id));

      console.log(
        `   🎵 Style "${resolvedTarget}": α ${beforeAlpha.toFixed(1)} → ${newAlpha.toFixed(1)}, β ${beforeBeta.toFixed(1)} → ${newBeta.toFixed(1)}`,
      );

      return {
        category: 'style',
        target: resolvedTarget,
        action: directive.action,
        before: { alpha: beforeAlpha, beta: beforeBeta },
        after: { alpha: newAlpha, beta: newBeta },
      };
    } catch (error: any) {
      console.error(`   ❌ Style directive failed:`, error.message);
      return null;
    }
  }

  /**
   * Apply character directive to Character Priority Queue
   */
  private async applyCharacterDirective(directive: ConsensusDirective, boostAmount: number): Promise<any | null> {
    try {
      // Get all characters for fuzzy matching
      const allCharacters = await db.select().from(characterProfiles);

      let bestMatch = null;
      let highestSimilarity = 0;

      for (const char of allCharacters) {
        const similarity = this.calculateSimilarity(directive.target, char.name);
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = char;
        }
      }

      // Threshold for fuzzy matching (0.6 is usually a good balance)
      if (!bestMatch || highestSimilarity < 0.6) {
        console.log(
          `   ⚠️ Character not found: ${directive.target} (Best match similarity: ${highestSimilarity.toFixed(2)})`,
        );
        return null;
      }

      if (highestSimilarity < 1.0) {
        console.log(
          `   🎯 [Character Fuzzy Match] Resolved "${directive.target}" to "${bestMatch.name}" (Score: ${highestSimilarity.toFixed(2)})`,
        );
      }

      const character = bestMatch;
      const beforePriority = parseFloat(character.priority || '1.0');

      let newPriority = beforePriority;
      if (directive.action === 'boost') {
        newPriority = Math.min(beforePriority + boostAmount, 10); // Max priority 10
      } else if (directive.action === 'reduce') {
        newPriority = Math.max(beforePriority - boostAmount, 0); // Min priority 0
      }

      await db
        .update(characterProfiles)
        .set({
          priority: newPriority.toString(),
        })
        .where(eq(characterProfiles.id, character.id));

      console.log(
        `   👤 Character "${character.name}": priority ${beforePriority.toFixed(1)} → ${newPriority.toFixed(1)}`,
      );

      return {
        category: 'character',
        target: character.name,
        action: directive.action,
        before: { priority: beforePriority },
        after: { priority: newPriority },
      };
    } catch (error: any) {
      console.error(`   ❌ Character directive failed:`, error.message);
      return null;
    }
  }

  /**
   * Apply theme directive to Thematic Principles
   */
  private async applyThemeDirective(directive: ConsensusDirective, boostAmount: number): Promise<any | null> {
    try {
      // Get all themes for fuzzy matching
      const allThemes = await db.select().from(thematicPrinciples);

      let bestMatch = null;
      let highestSimilarity = 0;

      for (const theme of allThemes) {
        const similarity = this.calculateSimilarity(directive.target, (theme as any).themeCategory);
        if (similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestMatch = theme;
        }
      }

      // Threshold for fuzzy matching
      if (!bestMatch || highestSimilarity < 0.6) {
        console.log(
          `   ⚠️ Theme not found: ${directive.target} (Best match similarity: ${highestSimilarity.toFixed(2)})`,
        );
        return null;
      }

      if (highestSimilarity < 1.0) {
        console.log(
          `   🎯 [Theme Fuzzy Match] Resolved "${directive.target}" to "${(bestMatch as any).themeCategory}" (Score: ${highestSimilarity.toFixed(2)})`,
        );
      }

      const theme = bestMatch;
      const beforeWeight = (theme as any).weight || 1.0;

      let newWeight = beforeWeight;
      if (directive.action === 'boost') {
        newWeight = Math.min(beforeWeight + boostAmount * 0.5, 3.0); // Max weight 3x
      } else if (directive.action === 'reduce') {
        newWeight = Math.max(beforeWeight - boostAmount * 0.5, 0.1); // Min weight 0.1x
      }

      await db
        .update(thematicPrinciples)
        .set({
          weight: newWeight,
          updatedAt: new Date(),
        } as any)
        .where(eq(thematicPrinciples.id, theme.id));

      console.log(
        `   🎭 Theme "${(theme as any).themeCategory}": weight ${beforeWeight.toFixed(2)} → ${newWeight.toFixed(2)}`,
      );

      return {
        category: 'theme',
        target: (theme as any).themeCategory,
        action: directive.action,
        before: { weight: beforeWeight },
        after: { weight: newWeight },
      };
    } catch (error: any) {
      console.error(`   ❌ Theme directive failed:`, error.message);
      return null;
    }
  }

  /**
   * Apply posting time directive
   */
  private async applyPostingTimeDirective(directive: ConsensusDirective, boostAmount: number): Promise<any | null> {
    try {
      // Find posting time arm
      const arms = await db
        .select()
        .from(postingTimeArms)
        .where(sql`LOWER(${(postingTimeArms as any).name}) LIKE LOWER(${'%' + directive.target + '%'})`)
        .limit(1);

      if (arms.length === 0) {
        console.log(`   ⚠️ Posting time arm not found: ${directive.target}`);
        return null;
      }

      const arm = arms[0];
      const beforeAlpha = arm.alpha;
      const beforeBeta = arm.beta;

      let newAlpha = arm.alpha;
      let newBeta = arm.beta;

      if (directive.action === 'boost') {
        newAlpha = arm.alpha + boostAmount;
      } else if (directive.action === 'reduce') {
        newBeta = arm.beta + boostAmount;
      }

      await db
        .update(postingTimeArms)
        .set({
          alpha: newAlpha,
          beta: newBeta,
          updatedAt: new Date(),
        } as any)
        .where(eq(postingTimeArms.id, arm.id));

      console.log(
        `   ⏰ Posting time "${(arm as any).name}": α ${beforeAlpha.toFixed(1)} → ${newAlpha.toFixed(1)}, β ${beforeBeta.toFixed(1)} → ${newBeta.toFixed(1)}`,
      );

      return {
        category: 'posting_time',
        target: (arm as any).name,
        action: directive.action,
        before: { alpha: beforeAlpha, beta: beforeBeta },
        after: { alpha: newAlpha, beta: newBeta },
      };
    } catch (error: any) {
      console.error(`   ❌ Posting time directive failed:`, error.message);
      return null;
    }
  }

  /**
   * Get a summary of recent consensus applications
   */
  async getApplicationHistory(): Promise<any> {
    // This would query a log table if we had one
    // For now, return the latest summary's application status
    const [latestSummary] = await db
      .select()
      .from(strategicSummaries)
      .orderBy(desc(strategicSummaries.generatedAt))
      .limit(1);

    return {
      lastSummary: latestSummary?.generatedAt || null,
      confidenceLevel: latestSummary?.confidenceLevel || 'unknown',
      status: latestSummary ? 'available' : 'no_summaries',
    };
  }
}

export const consensusApplierService = new ConsensusApplierService();
