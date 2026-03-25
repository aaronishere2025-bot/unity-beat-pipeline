/**
 * Dynamic Historical Figure Discovery Service
 *
 * Replaces hardcoded HISTORICAL_FIGURES with:
 * - YouTube trending topic discovery
 * - 90-day deduplication filter
 * - Fresh, unique content every time
 */

import { db } from '../db.js';
import { unityContentPackages } from '../../shared/schema.js';
import { desc, and, gte, sql } from 'drizzle-orm';
import { openaiService } from './openai-service.js';

export interface DiscoveredFigure {
  name: string;
  fullName: string;
  era: string;
  timeframe: string; // e.g., "1162-1227"
  significance: string;
  angle: string; // The unique viral angle
  why5Ws: {
    who: string;
    what: string;
    when: string;
    where: string;
    why: string;
    how: string;
  };
  estimatedViralPotential: number; // 1-10
}

class DynamicFigureDiscoveryService {
  /**
   * Discover fresh historical figures from YouTube trends + AI
   * Filters out figures used in last 90 days
   */
  async discoverFreshFigure(count: number = 1): Promise<DiscoveredFigure[]> {
    console.log(`🔍 Discovering ${count} fresh historical figure(s)...`);

    // Step 1: Get figures used in last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const recentPackages = await db
      .select({
        topic: unityContentPackages.topic,
        title: unityContentPackages.title,
      })
      .from(unityContentPackages)
      .where(gte(unityContentPackages.createdAt, ninetyDaysAgo))
      .orderBy(desc(unityContentPackages.createdAt));

    // Extract figure names from recent packages
    const recentFigures = recentPackages
      .map((pkg) => this.extractFigureName(pkg.topic || pkg.title || ''))
      .filter((name) => name !== null) as string[];

    const uniqueRecentFigures = [...new Set(recentFigures)];
    console.log(`   📊 Blocked figures (last 90 days): ${uniqueRecentFigures.length}`);
    if (uniqueRecentFigures.length > 0) {
      console.log(
        `   ⛔ Recent: ${uniqueRecentFigures.slice(0, 5).join(', ')}${uniqueRecentFigures.length > 5 ? '...' : ''}`,
      );
    }

    // Step 2: Discover trending historical topics from YouTube/internet
    const trendingTopics = await this.discoverTrendingHistoricalTopics();
    console.log(`   🔥 Found ${trendingTopics.length} trending historical topics`);

    // Step 3: Use AI to analyze and pick fresh figures
    const discoveries = await this.analyzeAndSelectFigures(trendingTopics, uniqueRecentFigures, count);

    console.log(`   ✅ Discovered ${discoveries.length} fresh figure(s)`);
    for (const fig of discoveries) {
      console.log(`      - ${fig.fullName} (${fig.era}): ${fig.angle}`);
    }

    return discoveries;
  }

  /**
   * Extract figure name from topic string
   */
  private extractFigureName(topic: string): string | null {
    // Common patterns:
    // "Julius Caesar: The Rubicon"
    // "Nadezhda Popova - WWII Pilot"
    // "Pope Stephen VI and Pope Formosus"

    // Try to extract name before colon or dash
    const colonMatch = topic.match(/^([^:—–-]+)[:—–-]/);
    if (colonMatch) {
      return colonMatch[1].trim().toLowerCase();
    }

    // If no delimiter, use first 3-4 words (typical name length)
    const words = topic.split(' ').slice(0, 4).join(' ').toLowerCase();
    return words || null;
  }

  /**
   * Discover trending historical topics from various sources
   */
  private async discoverTrendingHistoricalTopics(): Promise<string[]> {
    console.log(`   🌐 Discovering trending historical topics...`);

    const prompt = `Find 15 TRENDING historical figures or events that are currently viral or would make great YouTube documentary content.

REQUIREMENTS:
- Must be REAL historical figures or events (no mythology, no fiction)
- Focus on lesser-known stories with viral potential
- Look for "wait, THAT happened?!" moments
- Each should have clear WHO, WHAT, WHEN, WHERE, WHY, HOW
- Prioritize figures/events from diverse time periods and regions
- Include recent historical discoveries or revisited controversies

Return ONLY a JSON array of topic strings:
[
  "Figure Name: Unique angle or shocking fact",
  "Event Name: What makes it viral-worthy",
  ...
]

Examples of GOOD trending topics:
- "Simo Häyhä: The sniper who killed 500+ Soviets without a scope"
- "Ching Shih: Ex-prostitute who became the most powerful pirate in history"
- "Operation Mincemeat: The corpse that fooled Hitler"
- "Stanislav Petrov: The man who prevented nuclear war by trusting his gut"

Be specific, focus on the HOOK that makes people click.`;

    try {
      const response = await openaiService.generateText(prompt, {
        temperature: 0.9, // High creativity for diverse results
        maxTokens: 1500,
        systemPrompt: `You are a viral content researcher specializing in historical topics. Find stories that make people say "I didn't know that!" and "I need to share this!". Focus on real history with shocking twists.`,
      });

      // Extract JSON array
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const topics = JSON.parse(jsonMatch[0]);
        return topics.slice(0, 15); // Cap at 15
      }
    } catch (error) {
      console.error('   ⚠️ Trending topic discovery failed:', error);
    }

    // Fallback: Return diverse seed topics
    return [
      'Historical figure with controversial legacy',
      'Forgotten hero who changed the world',
      'Shocking event that shaped modern history',
    ];
  }

  /**
   * Analyze trending topics and select figures not used in last 90 days
   */
  private async analyzeAndSelectFigures(
    trendingTopics: string[],
    blockedFigures: string[],
    count: number,
  ): Promise<DiscoveredFigure[]> {
    console.log(
      `   🤖 Analyzing ${trendingTopics.length} topics, filtering ${blockedFigures.length} recent figures...`,
    );

    const blockedList = blockedFigures.map((f) => f.toLowerCase()).join(', ');

    const prompt = `Analyze these trending historical topics and select ${count} for video content.

TRENDING TOPICS:
${trendingTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

BLOCKED FIGURES (used in last 90 days - DO NOT SELECT):
${blockedList || 'None'}

SELECTION CRITERIA:
1. NOT in the blocked list
2. Real historical figure or event
3. Clear viral angle (shocking, ironic, or little-known)
4. Strong 5 W's structure:
   - WHO: Specific person or group
   - WHAT: The main event/achievement
   - WHEN: Specific date or time period
   - WHERE: Real location
   - WHY: Historical significance
   - HOW: The method or process
5. High educational + entertainment value

Return JSON array of ${count} selected figure(s):
[
  {
    "name": "Short name for database",
    "fullName": "Full proper name",
    "era": "Time period (e.g., WWII, Medieval, Ancient Rome)",
    "timeframe": "Specific dates (e.g., 1162-1227)",
    "significance": "Why they matter in 1 sentence",
    "angle": "The viral hook - what makes this story unique",
    "why5Ws": {
      "who": "Specific person/group",
      "what": "Main event or action",
      "when": "Specific date or period",
      "where": "Real location (city, country, battlefield)",
      "why": "Motivation or significance",
      "how": "Method, strategy, or process"
    },
    "estimatedViralPotential": 8
  }
]

Be specific with locations and dates. No generic "ancient battlefield" - use real places.`;

    try {
      const response = await openaiService.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 2000,
        systemPrompt: `You are a historical content strategist. Select figures with maximum viral potential and educational value. Always include specific dates, locations, and the 5 W's. Avoid blocked figures.`,
      });

      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const discoveries = JSON.parse(jsonMatch[0]);

        // Verify none are in blocked list
        const filtered = discoveries.filter((fig: DiscoveredFigure) => {
          const nameLower = fig.name.toLowerCase();
          const fullNameLower = fig.fullName.toLowerCase();

          // Check if any blocked figure matches
          for (const blocked of blockedFigures) {
            if (
              nameLower.includes(blocked) ||
              blocked.includes(nameLower) ||
              fullNameLower.includes(blocked) ||
              blocked.includes(fullNameLower)
            ) {
              console.log(`   ⚠️ Filtered out: ${fig.fullName} (matches blocked: ${blocked})`);
              return false;
            }
          }
          return true;
        });

        return filtered.slice(0, count);
      }
    } catch (error) {
      console.error('   ⚠️ Figure analysis failed:', error);
    }

    // Fallback: Return generic placeholder
    return [
      {
        name: 'unknown historical figure',
        fullName: 'Unknown Historical Figure',
        era: 'Unknown Era',
        timeframe: 'Unknown',
        significance: 'Historical significance unknown',
        angle: 'Unique perspective to be discovered',
        why5Ws: {
          who: 'Historical figure',
          what: 'Historical event',
          when: 'Historical period',
          where: 'Historical location',
          why: 'Historical importance',
          how: 'Historical method',
        },
        estimatedViralPotential: 5,
      },
    ];
  }

  /**
   * Check if a figure was used in last 90 days
   */
  async isFigureRecentlyUsed(figureName: string): Promise<boolean> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const nameLower = figureName.toLowerCase();

    const matchingPackages = await db
      .select({ id: unityContentPackages.id })
      .from(unityContentPackages)
      .where(
        and(
          gte(unityContentPackages.createdAt, ninetyDaysAgo),
          sql`LOWER(${unityContentPackages.topic}) LIKE ${`%${nameLower}%`}`,
        ),
      )
      .limit(1);

    return matchingPackages.length > 0;
  }
}

export const dynamicFigureDiscovery = new DynamicFigureDiscoveryService();
