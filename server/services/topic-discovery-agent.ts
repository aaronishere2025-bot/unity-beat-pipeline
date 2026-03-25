/**
 * TOPIC DISCOVERY AGENT
 *
 * Specialized agent for discovering viral-worthy historical topics.
 * - Uses AI to find trending, underexplored historical stories
 * - Enforces 90-day deduplication to avoid repetition
 * - Analyzes viral potential and audience engagement
 * - Tracks what's trending on YouTube/TikTok
 */

import { db } from '../db';
import { unityContentPackages } from '@shared/schema';
import { sql } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface TopicDiscovery {
  topic: string;
  figure: string;
  angle: string;
  hook: string; // Catchy hook for the video
  conflictArchetype?: 'man_vs_nature' | 'man_vs_man' | 'man_vs_society' | 'man_vs_self' | 'man_vs_fate' | 'man_vs_god'; // Retention protocol conflict type
  conflictDescription?: string; // Description of the opposing forces
  viralPotential: number; // 1-10 score
  intent: 'viral' | 'educational' | 'inspirational' | 'dramatic' | 'controversial';
  era: 'ancient' | 'medieval' | 'renaissance' | 'modern';
  reasoning: string;
  keywords: string[]; // SEO keywords for YouTube
  competitorGaps: string; // What competitors haven't covered
}

export interface TopicDiscoveryResult {
  topics: TopicDiscovery[];
  recentTopicsCount: number;
  filteredCount: number;
  executionTimeMs: number;
}

class TopicDiscoveryAgent {
  private agentId = 'topic-discovery-agent';
  private recentTopicsCache: Set<string> | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  /**
   * Main method: Discover fresh topics for today
   */
  async discoverTopics(
    count: number = 5,
    daysBack: number = 90,
    prioritizeTrending: boolean = false,
  ): Promise<TopicDiscoveryResult> {
    const startTime = Date.now();

    console.log(`\n🔍 [Topic Discovery Agent] Finding ${count} fresh topics...`);
    console.log(`   📅 Deduplication window: ${daysBack} days`);
    console.log(`   🔥 Prioritize trending: ${prioritizeTrending}\n`);

    try {
      // Step 1: Get recent topics from database
      const recentTopics = await this.getRecentTopics(daysBack);
      console.log(`   ✓ Loaded ${recentTopics.size} recent topics from database`);

      // Step 1.5: Get trending topics from Trend Discovery Bot (if enabled)
      let trendingTopics: TopicDiscovery[] = [];
      if (prioritizeTrending) {
        try {
          const { trendDiscoveryBot } = await import('./trend-discovery-bot');
          const trends = await trendDiscoveryBot.getActiveTrends(count);

          trendingTopics = trends.map((trend) => ({
            topic: trend.keyword,
            figure: trend.keyword,
            angle: trend.suggestedAngle || `Explore ${trend.keyword}`,
            hook: trend.whyTrending || '',
            viralPotential: Math.round(trend.estimatedViralPotential! / 10), // Scale to 1-10
            intent: 'viral' as const,
            era: 'ancient' as const, // TODO: Infer from historical category
            reasoning: trend.contentGap || trend.whyTrending || '',
            keywords: trend.relatedKeywords,
            competitorGaps: `Low competition: ${trend.competitionLevel}`,
          })) as any;

          console.log(`   ✓ Loaded ${trendingTopics.length} trending topics from Trend Discovery Bot`);
        } catch (trendErr: any) {
          console.log(`   ⚠️ Trend Discovery Bot unavailable: ${trendErr.message}`);
        }
      }

      // Step 2: Analyze trending content on YouTube (optional - requires API)
      const trendingInsights = await this.analyzeTrendingContent();

      // Step 3: Generate topic suggestions with AI (with retry logic)
      let filtered: TopicDiscovery[] = [];
      let allCandidates: TopicDiscovery[] = [];
      let attempts = 0;
      const maxAttempts = 5;

      while (filtered.length < count && attempts < maxAttempts) {
        attempts++;
        console.log(`   🔄 Attempt ${attempts}/${maxAttempts} to find ${count} unique topics...`);

        const candidates = await this.generateTopicSuggestions(
          count * 5, // Request even more candidates to increase chances
          recentTopics,
          trendingInsights,
        );

        // Step 4: Combine AI-generated candidates with trending topics
        allCandidates = prioritizeTrending ? [...trendingTopics, ...candidates] : candidates;

        // Step 5: Filter out recent topics and rank by viral potential
        filtered = this.filterAndRankTopics(allCandidates, recentTopics);

        if (filtered.length >= count) {
          console.log(`   ✅ Found ${filtered.length} unique topics on attempt ${attempts}`);
          break;
        } else if (attempts < maxAttempts) {
          console.log(
            `   ⚠️  Only found ${filtered.length}/${count} unique topics, retrying with stricter uniqueness...`,
          );
        }
      }

      if (filtered.length === 0) {
        console.error(`   ❌ Could not find any unique topics after ${maxAttempts} attempts`);
        throw new Error(`No unique topics found after ${maxAttempts} attempts. Try reducing the deduplication window.`);
      }

      // Step 6: Select top N diverse topics
      const selected = this.selectDiverseTopics(filtered, count);

      const executionTimeMs = Date.now() - startTime;

      console.log(`\n✅ [Topic Discovery Agent] Found ${selected.length} topics in ${executionTimeMs}ms\n`);

      return {
        topics: selected,
        recentTopicsCount: recentTopics.size,
        filteredCount: allCandidates.length - filtered.length,
        executionTimeMs,
      };
    } catch (error: any) {
      console.error(`❌ [Topic Discovery Agent] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get topics used in the last N days (with caching)
   */
  private async getRecentTopics(daysBack: number): Promise<Set<string>> {
    const now = Date.now();
    if (this.recentTopicsCache && now < this.cacheExpiry) {
      return this.recentTopicsCache;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const packages = await db
      .select({
        topic: unityContentPackages.topic,
        title: unityContentPackages.title,
      })
      .from(unityContentPackages)
      .where(sql`${unityContentPackages.createdAt} >= ${cutoffDate}`);

    const topics = new Set<string>();

    for (const pkg of packages) {
      topics.add(this.normalizeTopic(pkg.topic));
      // Extract figure name from title
      const figureMatch = pkg.title.match(/^([A-Za-z\s]+?)(?:\s*-\s*)/);
      if (figureMatch) {
        topics.add(this.normalizeTopic(figureMatch[1]));
      }
    }

    this.recentTopicsCache = topics;
    this.cacheExpiry = now + this.CACHE_TTL;

    return topics;
  }

  /**
   * Analyze trending historical content on YouTube (simplified version)
   */
  private async analyzeTrendingContent(): Promise<string> {
    // TODO: Integrate with youtube-trends-service for real data
    // For now, return generic insights
    return `Current trends:
    - Underdog stories and unexpected victories
    - Historical mysteries and unsolved cases
    - Lesser-known figures who changed history
    - Dramatic betrayals and plot twists
    - "What if" alternate history scenarios`;
  }

  /**
   * Generate topic suggestions using AI
   */
  private async generateTopicSuggestions(
    count: number,
    recentTopics: Set<string>,
    trendingInsights: string,
  ): Promise<TopicDiscovery[]> {
    const recentList = Array.from(recentTopics).slice(0, 50).join(', '); // Show more recent topics

    const prompt = `You are an expert viral content strategist and historian specializing in YouTube Shorts and TikTok content.

**MISSION:**
Find ${count} fresh, viral-worthy historical topics that will captivate young audiences (18-35) on short-form video platforms.

**CRITICAL - AVOID THESE ${recentTopics.size} RECENT TOPICS:**
${recentList}

⚠️ IMPORTANT: The topics above have been covered in the last 90 days. You MUST suggest completely different historical figures, events, and eras. Do NOT suggest any figure that appears in the list above or is closely related to them (same empire, same battle, same time period).

**TRENDING INSIGHTS:**
${trendingInsights}

**CRITERIA FOR GREAT TOPICS:**
1. **CONFLICT ENFORCEMENT (CRITICAL)**: Every topic MUST have a clear dramatic conflict archetype:
   - Man vs. Nature (survival against elements, disasters, terrain)
   - Man vs. Man (war, betrayal, rivalry, political struggle)
   - Man vs. Society (rebellion, revolution, fighting the system)
   - Man vs. Self (internal struggle, doubt, redemption)
   - Man vs. Fate (fighting destiny, prophecy, inevitable death)
   - Man vs. God (defying religious authority, challenging divine will)
   ⚠️ REJECT topics without clear opposing forces. Static biography = instant scroll.

2. **Cinematic Moments**: Visual, dramatic events (battles, escapes, duels, discoveries)
3. **Shock Value**: Unexpected twists, plot reversals, "wait, what?" moments
4. **Underdog Appeal**: Unknown heroes, underdogs beating odds
5. **Relatable Emotions**: Fear, betrayal, courage, love, revenge
6. **Meme Potential**: Absurd, ironic, or quotable moments
7. **Historical Diversity**: Mix eras, cultures, and themes
8. **Competitor Gaps**: Stories competitors haven't over-saturated

**EXAMPLE GOOD TOPICS:**
- "The Night Witches: Soviet female pilots who bombed Nazis in wooden planes"
- "Tarrare: The French soldier who could eat ANYTHING (including a live cat)"
- "Rasputin: The man who survived poisoning, shooting, beating, and drowning"

**AVOID:**
- Overdone topics (Julius Caesar, Napoleon basics, Hitler)
- Non-visual/administrative history
- Complex topics requiring 10+ minutes of context
- Topics we've covered recently (see list above)

**OUTPUT FORMAT (JSON):**
\`\`\`json
{
  "topics": [
    {
      "topic": "Full descriptive title of the historical event/story",
      "figure": "Main character or group",
      "angle": "The viral hook - what makes this story crazy/unique",
      "hook": "Opening line that grabs attention immediately",
      "conflictArchetype": "man_vs_nature",
      "conflictDescription": "Brief description of the opposing forces in this story",
      "viralPotential": 9.2,
      "intent": "viral",
      "era": "modern",
      "reasoning": "Why this topic will perform well (including which conflict archetype drives retention)",
      "keywords": ["keyword1", "keyword2", "keyword3"],
      "competitorGaps": "What makes this unique vs competitors"
    }
  ]
}
\`\`\`

Generate exactly ${count} topics. Be creative, surprising, and viral-focused.`;

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 6000,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    const parsed = JSON.parse(text);
    return parsed.topics;
  }

  /**
   * Filter out recent topics and rank by viral potential
   */
  private filterAndRankTopics(candidates: TopicDiscovery[], recentTopics: Set<string>): TopicDiscovery[] {
    const filtered = candidates.filter((topic) => {
      const isRecent = this.isTopicRecent(topic.topic, recentTopics) || this.isTopicRecent(topic.figure, recentTopics);

      if (isRecent) {
        console.log(`   ⏭️  Skipping recent topic: ${topic.figure}`);
      }

      return !isRecent;
    });

    // Rank by viral potential
    return filtered.sort((a, b) => b.viralPotential - a.viralPotential);
  }

  /**
   * Select diverse topics across eras and intents
   */
  private selectDiverseTopics(ranked: TopicDiscovery[], count: number): TopicDiscovery[] {
    const selected: TopicDiscovery[] = [];
    const usedEras = new Set<string>();
    const usedIntents = new Set<string>();

    // First pass: prioritize diversity
    for (const topic of ranked) {
      if (selected.length >= count) break;

      const eraUnique = !usedEras.has(topic.era);
      const intentUnique = !usedIntents.has(topic.intent);

      if (eraUnique || intentUnique) {
        selected.push(topic);
        usedEras.add(topic.era);
        usedIntents.add(topic.intent);
      }
    }

    // Second pass: fill remaining slots with highest viral potential
    for (const topic of ranked) {
      if (selected.length >= count) break;
      if (!selected.includes(topic)) {
        selected.push(topic);
      }
    }

    // Log selection
    console.log('\n📊 Selected Topics:');
    selected.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.figure} (${t.era}, ${t.intent})`);
      console.log(`      "${t.hook}"`);
      console.log(`      Viral: ${t.viralPotential}/10`);
    });

    return selected;
  }

  /**
   * Normalize topic for comparison
   */
  private normalizeTopic(topic: string): string {
    return topic
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if topic is too similar to recent topics
   */
  private isTopicRecent(topic: string, recentTopics: Set<string>): boolean {
    const normalized = this.normalizeTopic(topic);

    if (recentTopics.has(normalized)) {
      return true;
    }

    // Extract key names/entities (capitalized words, excluding common words)
    const extractKeyEntities = (text: string): Set<string> => {
      const commonWords = new Set([
        'the',
        'and',
        'of',
        'in',
        'to',
        'a',
        'an',
        'for',
        'with',
        'on',
        'at',
        'from',
        'by',
        'about',
        'as',
        'into',
        'through',
        'during',
        'before',
        'after',
        'above',
        'below',
        'between',
        'under',
        'again',
        'further',
        'then',
        'once',
        'here',
        'there',
        'when',
        'where',
        'why',
        'how',
        'all',
        'both',
        'each',
        'few',
        'more',
        'most',
        'other',
        'some',
        'such',
        'than',
        'too',
        'very',
      ]);

      // Match sequences of capitalized words (names)
      const matches = text.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
      const entities = new Set<string>();

      for (const match of matches) {
        const normalized = match.toLowerCase();
        if (!commonWords.has(normalized) && normalized.length > 2) {
          entities.add(normalized);
        }
      }

      return entities;
    };

    const topicEntities = extractKeyEntities(topic);

    // Check for partial matches and entity overlap
    for (const recent of recentTopics) {
      // Check substring matches
      if (normalized.includes(recent) || recent.includes(normalized)) {
        const lengthRatio = Math.max(normalized.length, recent.length) / Math.min(normalized.length, recent.length);
        if (lengthRatio < 1.5) {
          return true;
        }
      }

      // Check if topics share the same key entities (e.g., "Pope Formosus and Pope Stephen VI" vs "Pope Stephen VI and Pope Formosus")
      const recentEntities = extractKeyEntities(recent);

      // Calculate entity overlap
      const intersection = new Set([...topicEntities].filter((x) => recentEntities.has(x)));
      const union = new Set([...topicEntities, ...recentEntities]);

      if (union.size > 0) {
        const overlapRatio = intersection.size / union.size;

        // If >70% of entities overlap, consider it a duplicate
        if (overlapRatio > 0.7) {
          console.log(
            `   🔍 Detected entity overlap: "${topic}" vs "${recent}" (${(overlapRatio * 100).toFixed(0)}% match)`,
          );
          return true;
        }
      }

      // Check word-level Jaccard similarity (for cases where capitalization is inconsistent)
      const topicWords = new Set(normalized.split(/\s+/).filter((w) => w.length > 3));
      const recentWords = new Set(recent.split(/\s+/).filter((w) => w.length > 3));

      const wordIntersection = new Set([...topicWords].filter((x) => recentWords.has(x)));
      const wordUnion = new Set([...topicWords, ...recentWords]);

      if (wordUnion.size > 0) {
        const wordSimilarity = wordIntersection.size / wordUnion.size;

        // If >60% of significant words overlap, consider it a duplicate
        if (wordSimilarity > 0.6) {
          console.log(
            `   🔍 Detected word overlap: "${topic}" vs "${recent}" (${(wordSimilarity * 100).toFixed(0)}% similarity)`,
          );
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Learn from successful topics (called by feedback loop)
   */
  async learnFromSuccess(
    topic: string,
    metrics: {
      views: number;
      ctr: number;
      avgViewDuration: number;
    },
  ): Promise<void> {
    // TODO: Store learning patterns when agentLearnings table is added to schema
    console.log(`✅ [Topic Discovery Agent] Learned from success: ${topic} (CTR: ${metrics.ctr})`);
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.recentTopicsCache = null;
    this.cacheExpiry = 0;
  }
}

export const topicDiscoveryAgent = new TopicDiscoveryAgent();
