/**
 * DYNAMIC TOPIC SELECTOR
 *
 * AI-powered topic selection with 90-day deduplication.
 * Uses trend-watcher-agent and content-strategy-agent to discover fresh topics.
 *
 * TRENDING INTEGRATION (Dec 2025):
 * - Can now blend trending topics from trend-discovery-bot
 * - Supports hybrid selection (e.g., 50% trending + 50% AI-generated)
 * - Falls back gracefully if no trends available
 *
 * UNLIMITED EXPLORER INTEGRATION (Phase 1 - Dec 2025):
 * - Can now use unlimited-topic-explorer for truly unique historical topics
 * - Deep 5W1H context for every topic
 * - Multi-level uniqueness checking (semantic similarity)
 * - Pool-based architecture for instant topic selection
 */

import { db } from '../db';
import { unityContentPackages, jobs, TrendingTopic } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { trendDiscoveryBot } from './trend-discovery-bot.js';
import { unlimitedTopicExplorer } from './unlimited-topic-explorer.js';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface TopicSuggestion {
  topic: string;
  figure: string;
  angle: string;
  viralPotential: number;
  intent: 'viral' | 'educational' | 'inspirational' | 'dramatic' | 'controversial';
  reasoning: string;
  source?: 'ai' | 'trending' | 'keyword' | 'unlimited_explorer';
  trendData?: {
    id: string;
    searchVolume?: number;
    competitionLevel?: string;
    trendVelocity?: number;
  };
  fiveW1H?: any; // Full 5W1H context (from unlimited explorer)
  exploredTopicId?: string; // ID in explored_topics table
}

export class DynamicTopicSelector {
  private recentTopicsCache: Set<string> | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /**
   * Get topics that were used in the last N days
   */
  async getRecentTopics(daysBack: number = 90): Promise<Set<string>> {
    // Use cache if still valid
    const now = Date.now();
    if (this.recentTopicsCache && now < this.cacheExpiry) {
      return this.recentTopicsCache;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    // Query both packages and jobs for topic/figure references
    const packages = await db
      .select({
        topic: unityContentPackages.topic,
        title: unityContentPackages.title,
      })
      .from(unityContentPackages)
      .where(sql`${unityContentPackages.createdAt} >= ${cutoffDate}`);

    const recentTopics = new Set<string>();

    for (const pkg of packages) {
      // Normalize topic strings (lowercase, remove special chars)
      const normalized = this.normalizeTopic(pkg.topic);
      recentTopics.add(normalized);

      // Also extract figure names from title
      const figureMatch = pkg.title.match(/^([A-Za-z\s]+?)(?:\s*-\s*Auto)?$/);
      if (figureMatch) {
        recentTopics.add(this.normalizeTopic(figureMatch[1]));
      }
    }

    console.log(`📊 Found ${recentTopics.size} unique topics used in last ${daysBack} days`);

    // Cache the result
    this.recentTopicsCache = recentTopics;
    this.cacheExpiry = now + this.CACHE_TTL;

    return recentTopics;
  }

  /**
   * Normalize topic string for comparison (lowercase, remove punctuation)
   */
  private normalizeTopic(topic: string): string {
    return topic
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if a topic is too similar to recent topics
   */
  private isTopicRecent(topic: string, recentTopics: Set<string>): boolean {
    const normalized = this.normalizeTopic(topic);

    // Exact match
    if (recentTopics.has(normalized)) {
      return true;
    }

    // Check for partial matches (e.g., "Napoleon" in "Napoleon Bonaparte")
    for (const recent of recentTopics) {
      if (normalized.includes(recent) || recent.includes(normalized)) {
        if (Math.max(normalized.length, recent.length) / Math.min(normalized.length, recent.length) < 2) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Use AI to discover fresh, trending historical topics
   */
  async discoverFreshTopics(count: number = 10): Promise<TopicSuggestion[]> {
    console.log(`\n🔍 Discovering ${count} fresh historical topics with AI...\n`);

    const recentTopics = await this.getRecentTopics(90);
    const recentTopicsList = Array.from(recentTopics).slice(0, 20).join(', ');

    const prompt = `You are a viral content strategist specializing in historical storytelling for YouTube Shorts and TikTok.

**CONTEXT:**
- Platform: YouTube Shorts / TikTok (vertical videos, 60-180 seconds)
- Audience: Young adults (18-35) interested in history, psychology, leadership
- Recent topics we've covered (DO NOT suggest these): ${recentTopicsList}

**TASK:**
Suggest ${count} fresh, viral-worthy historical topics that:
1. Have NOT been covered recently (avoid the list above)
2. Have high viral potential (shocking moments, untold stories, plot twists)
3. Are diverse across time periods, cultures, and themes
4. Include lesser-known stories with cinematic moments
5. Balance between ancient, medieval, renaissance, and modern eras

**FORMAT YOUR RESPONSE AS JSON:**
\`\`\`json
{
  "topics": [
    {
      "topic": "The Defenestration of Prague - How a window fight started a 30-year war",
      "figure": "Ferdinand II",
      "angle": "The angriest window toss in history that killed 8 million people",
      "viralPotential": 9.2,
      "intent": "viral",
      "reasoning": "Absurd premise (throwing people out windows) with massive consequences. Meme-worthy."
    },
    ...
  ]
}
\`\`\`

**PRIORITIZE:**
- Underdog stories (David vs Goliath)
- Shocking betrayals and plot twists
- "You won't believe what happened next" moments
- Cinematic battles and duels
- Hidden figures and untold stories
- Counterintuitive historical facts

**AVOID:**
- Topics we've recently covered
- Overdone topics (Hitler, JFK assassination basics, etc.)
- Topics requiring extensive explanation
- Non-cinematic administrative history`;

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    // Robust JSON parsing: handle markdown fences and truncated responses
    let cleanText = text.trim();
    // Strip markdown code fences if present
    if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    // Attempt to repair truncated JSON arrays (Gemini sometimes cuts off mid-response)
    let parsed: any;
    try {
      parsed = JSON.parse(cleanText);
    } catch {
      // Try to close unclosed arrays/objects for truncated responses
      let repaired = cleanText;
      // Close any open strings
      const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
      if (quoteCount % 2 !== 0) repaired += '"';
      // Close any open objects/arrays by counting braces
      const openBraces = (repaired.match(/{/g) || []).length - (repaired.match(/}/g) || []).length;
      const openBrackets = (repaired.match(/\[/g) || []).length - (repaired.match(/]/g) || []).length;
      // Remove trailing comma before closing
      repaired = repaired.replace(/,\s*$/, '');
      for (let i = 0; i < openBraces; i++) repaired += '}';
      for (let i = 0; i < openBrackets; i++) repaired += ']';
      try {
        parsed = JSON.parse(repaired);
        console.log(`⚠️ Repaired truncated JSON from Gemini (added ${openBraces} braces, ${openBrackets} brackets)`);
      } catch (repairErr) {
        throw new Error(
          `Failed to parse Gemini response even after repair: ${(repairErr as Error).message}\nRaw text: ${text.slice(0, 500)}`,
        );
      }
    }
    const suggestions: TopicSuggestion[] = parsed.topics;

    // Filter out any that are too similar to recent topics
    const filtered = suggestions.filter((s) => !this.isTopicRecent(s.topic, recentTopics));

    console.log(
      `✅ Discovered ${filtered.length} fresh topics (filtered ${suggestions.length - filtered.length} recent ones)\n`,
    );

    return filtered;
  }

  /**
   * Select N diverse topics for today's generation
   *
   * Uses AI to discover trending topics and ensures 90-day deduplication
   *
   * @param count Number of topics to select
   * @param lookbackDays Days to check for duplicates (default 90)
   * @param prioritizeTrending If true, includes trending topics (default false)
   * @param trendWeight 0-1, weight for trending vs AI-generated (default 0.5 = 50/50)
   * @param useUnlimitedExplorer If true, use unlimited explorer for truly unique topics (Phase 1)
   */
  async selectTopicsForToday(
    count: number = 5,
    lookbackDays: number = 90,
    prioritizeTrending: boolean = false,
    trendWeight: number = 0.5,
    useUnlimitedExplorer: boolean = false,
  ): Promise<TopicSuggestion[]> {
    console.log(`\n🎯 Selecting ${count} topics for today's generation...\n`);

    // NEW: Use Unlimited Topic Explorer if enabled
    if (useUnlimitedExplorer) {
      console.log('🌍 Using Unlimited Topic Explorer (Phase 1)...\n');

      try {
        const explored = await unlimitedTopicExplorer.selectTopicsForProduction(count);

        const topics = explored.map((topic) => ({
          topic: topic.primaryName,
          figure: topic.primaryName,
          angle: topic.discoveryAngle,
          viralPotential: topic.viralPotential,
          intent: this.inferIntent(topic.viralPotential),
          reasoning: `Discovered via unlimited explorer: ${topic.discoveryAngle}`,
          source: 'unlimited_explorer' as const,
          fiveW1H: topic.fiveW1H,
          exploredTopicId: topic.id,
        }));

        console.log('✨ Selected topics from unlimited explorer:');
        topics.forEach((topic, i) => {
          console.log(`  ${i + 1}. 🌍 ${topic.figure} - ${topic.angle.substring(0, 50)}...`);
          console.log(`     Viral score: ${topic.viralPotential}, Era: ${topic.fiveW1H?.when?.era || 'unknown'}`);
        });
        console.log('');

        return topics;
      } catch (error: any) {
        console.error(`❌ Unlimited explorer failed, falling back to AI discovery: ${error.message}`);
        // Fall through to traditional methods
      }
    }

    // If not prioritizing trending, use original behavior
    if (!prioritizeTrending) {
      const candidates = await this.discoverFreshTopics(count * 3);

      if (candidates.length < count) {
        console.warn(`⚠️  Only found ${candidates.length} fresh topics, requested ${count}`);
      }

      // Sort by viral potential and take top N
      const selected = candidates.sort((a, b) => b.viralPotential - a.viralPotential).slice(0, count);

      console.log('✨ Selected topics:');
      selected.forEach((topic, i) => {
        console.log(`  ${i + 1}. ${topic.figure} - ${topic.angle.substring(0, 60)}...`);
        console.log(`     Viral score: ${topic.viralPotential}, Intent: ${topic.intent}`);
      });
      console.log('');

      return selected;
    }

    // NEW: Hybrid approach - mix trending + AI-generated
    const trendCount = Math.floor(count * trendWeight);
    const aiCount = count - trendCount;

    console.log(`🔥 Hybrid selection: ${trendCount} trending + ${aiCount} AI-generated\n`);

    try {
      // Get trending topics
      const trendingTopics = await trendDiscoveryBot.getActiveTrends(trendCount * 2); // Get 2x for filtering

      if (trendingTopics.length === 0) {
        console.warn('⚠️  No trending topics available, falling back to 100% AI');
        return this.selectTopicsForToday(count, lookbackDays, false);
      }

      const actualTrendCount = Math.min(trendCount, trendingTopics.length);
      const actualAICount = count - actualTrendCount;

      console.log(`   Using ${actualTrendCount} trends + ${actualAICount} AI topics`);

      // Convert trending topics to TopicSuggestion format
      const selectedTrends = trendingTopics.slice(0, actualTrendCount).map((trend) => ({
        topic: trend.keyword,
        figure: trend.keyword,
        angle: trend.suggestedAngle || `The untold story of ${trend.keyword}`,
        viralPotential: trend.estimatedViralPotential || 0,
        intent: this.inferIntent(trend.estimatedViralPotential || 0),
        reasoning: trend.whyTrending,
        source: 'trending' as const,
        trendData: {
          id: trend.id,
          searchVolume: trend.searchVolume || undefined,
          competitionLevel: trend.competitionLevel || undefined,
          trendVelocity: trend.trendVelocity || undefined,
        },
      }));

      // Get AI-generated topics
      const aiTopics = actualAICount > 0 ? await this.discoverFreshTopics(actualAICount * 2) : [];
      const selectedAI = aiTopics.slice(0, actualAICount).map((topic) => ({
        ...topic,
        source: 'ai' as const,
      }));

      // Combine and shuffle
      const combined = this.shuffleArray([...selectedTrends, ...selectedAI]);

      console.log('✨ Selected topics:');
      combined.forEach((topic, i) => {
        const sourceIcon = topic.source === 'trending' ? '🔥' : '🤖';
        console.log(`  ${i + 1}. ${sourceIcon} ${topic.figure} - ${topic.angle.substring(0, 50)}...`);
        console.log(`     Viral score: ${topic.viralPotential}, Intent: ${topic.intent}`);
      });
      console.log('');

      return combined as any;
    } catch (error: any) {
      console.error(`❌ Trend discovery failed, falling back to 100% AI: ${error.message}`);
      return this.selectTopicsForToday(count, lookbackDays, false);
    }
  }

  /**
   * Infer intent from viral potential score
   */
  private inferIntent(viralScore: number): 'viral' | 'educational' | 'controversial' | 'inspirational' | 'dramatic' {
    if (viralScore >= 80) return 'viral';
    if (viralScore >= 60) return 'controversial';
    if (viralScore >= 40) return 'dramatic';
    return 'educational';
  }

  /**
   * Shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Clear the recent topics cache (useful for testing)
   */
  clearCache(): void {
    this.recentTopicsCache = null;
    this.cacheExpiry = 0;
  }
}

export const dynamicTopicSelector = new DynamicTopicSelector();
