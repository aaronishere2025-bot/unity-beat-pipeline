/**
 * AUTO CONTENT DISCOVERY ENGINE
 *
 * Automatically finds viral-worthy historical events to create videos about.
 *
 * Sources:
 * - "This Day in History" events
 * - Trending historical searches
 * - Anniversary of major events
 * - Underrated figures gaining attention
 *
 * Pipeline:
 * 1. Discover potential topics
 * 2. Score for viral potential
 * 3. Find best micro-story
 * 4. Queue for video generation
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { googleTrendsService } from './google-trends-service';
import { patternIntelligenceService } from './pattern-intelligence-service';
import { youtubeAnalyticsService } from './youtube-analytics-service';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface TopicCandidate {
  figure: string;
  event: string;
  hook: string;
  whyNow: string;
  viralScore: number;
  source: 'this_day' | 'trending' | 'anniversary' | 'suggested';
  category?: string;
  year?: number;
  appliedThemeIds?: string[];
}

export interface ContentQueueItem {
  id: string;
  topic: TopicCandidate;
  status: 'queued' | 'generating' | 'completed' | 'failed';
  scheduledFor: Date;
  createdAt: Date;
  videoPath?: string;
  error?: string;
}

export interface DiscoveryConfig {
  videosPerDay: number;
  preferredCategories?: string[];
  excludeFigures: string[];
  minViralScore: number;
}

const THIS_DAY_PROMPT = `You are a historical researcher finding viral-worthy events for short-form video content.

Given today's date, find 5 historical events that:
1. Have a clear protagonist (single person focus)
2. Involve drama, conflict, revenge, or triumph
3. Have lesser-known but fascinating details
4. Can be told in 2 minutes with a clear arc

AVOID:
- Events without a clear main character
- Purely political events without personal drama
- Events that are overdone (everyone knows the story)
- Sensitive topics (recent tragedies, ongoing conflicts)

For each event, provide:
- The historical figure
- What happened
- The hook (one sentence that makes people stop scrolling)
- Why it's viral-worthy

Output JSON array.`;

const TRENDING_PROMPT = `You are a trend analyst for historical content on TikTok and YouTube Shorts.

Based on current cultural moments (new movies, TV shows, games, news), identify historical figures or events that are likely trending or about to trend.

Consider:
- New historical movies/shows being released
- Video games with historical settings
- News events that relate to historical parallels
- Viral moments referencing history
- School curriculum cycles (what students are learning)

For each topic, explain:
- The historical figure/event
- Why it's trending NOW
- The viral hook
- Content angle that hasn't been overdone

Output 5 trending topics.`;

const SCORING_PROMPT = `You score historical topics for viral potential on TikTok/YouTube Shorts.

Score each topic 1-10 on:
1. HOOK STRENGTH (0-10): How attention-grabbing is the first sentence?
2. RELATABILITY (0-10): Can modern viewers connect emotionally?
3. SHAREABILITY (0-10): Would people share this or tag friends?
4. VISUAL POTENTIAL (0-10): Can this be shown dramatically in video?
5. CONTROVERSY (0-10): Is there debate/surprise that drives comments?
6. TIMELINESS (0-10): Is there a reason to post this NOW?

Final score = weighted average (hook and shareability weighted higher)`;

export async function getThisDayInHistory(date: Date = new Date()): Promise<TopicCandidate[]> {
  const month = date.toLocaleString('en-US', { month: 'long' });
  const day = date.getDate();

  try {
    const thisDayModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.8, responseMimeType: 'application/json' },
      systemInstruction: THIS_DAY_PROMPT,
    });
    const thisDayResult = await thisDayModel.generateContent(`Find viral-worthy historical events for ${month} ${day}.

Output format:
{
  "events": [
    {
      "figure": "Name",
      "event": "What happened",
      "year": 1776,
      "hook": "One sentence hook",
      "whyViral": "Why this would work as content",
      "category": "battle|death|birth|discovery|political|cultural|crime|disaster"
    }
  ]
}`);

    const result = JSON.parse(thisDayResult.response.text());

    return (result.events || []).map((e: any) => ({
      figure: e.figure,
      event: e.event,
      hook: e.hook,
      whyNow: `This day in history (${month} ${day}, ${e.year})`,
      viralScore: 7,
      source: 'this_day' as const,
      category: e.category,
      year: e.year,
    }));
  } catch (error: any) {
    console.error('This Day In History discovery failed:', error.message);
    return [];
  }
}

export async function getTrendingTopics(): Promise<TopicCandidate[]> {
  console.log('📈 Fetching trending topics from Google Trends...');

  try {
    // First, get real data from Google Trends
    const googleTrends = await googleTrendsService.getViralHistoricalTopics('US');

    if (googleTrends.length > 0) {
      console.log(`   ✅ Got ${googleTrends.length} topics from Google Trends`);

      // Enhance with GPT to find historical angles for non-historical trends
      const enhancedTopics: TopicCandidate[] = [];

      for (const trend of googleTrends.slice(0, 10)) {
        // Check if this is already a historical topic
        const isHistorical = trend.source === 'google_trends';

        if (isHistorical) {
          enhancedTopics.push({
            figure: trend.figure,
            event: trend.event,
            hook: trend.hook,
            whyNow: `🔥 Trending on Google: ${trend.traffic || 'High searches'}`,
            viralScore: 9, // Higher score for actual trending data
            source: 'trending' as const,
          });
        } else {
          // Try to find a historical angle for general trending topics
          try {
            const trendAngleModel = getGemini().getGenerativeModel({
              model: 'gemini-2.5-flash',
              generationConfig: { temperature: 0.8, maxOutputTokens: 300, responseMimeType: 'application/json' },
              systemInstruction:
                'You find historical angles for trending topics. Given a current trending topic, find a historical parallel, figure, or event that relates to it. Be creative but factual.',
            });
            const trendAngleResult = await trendAngleModel.generateContent(`Trending topic: "${trend.figure}"
Context: ${trend.event}

Find a historical figure or event that relates to this. Output JSON:
{
  "figure": "Historical figure name",
  "event": "What happened historically",
  "hook": "One sentence connecting history to current trend",
  "connection": "Why this historical topic relates to the trend"
}`);

            const result = JSON.parse(trendAngleResult.response.text());

            if (result.figure) {
              enhancedTopics.push({
                figure: result.figure,
                event: result.event,
                hook: result.hook,
                whyNow: `🔥 Related to trending: "${trend.figure}" (${trend.traffic || 'High searches'})`,
                viralScore: 8.5,
                source: 'trending' as const,
              });
            }
          } catch (enhanceError) {
            // If enhancement fails, still include the original trend
            enhancedTopics.push({
              figure: trend.figure,
              event: trend.event,
              hook: trend.hook,
              whyNow: `🔥 Trending: ${trend.traffic || 'High searches'}`,
              viralScore: 8,
              source: 'trending' as const,
            });
          }
        }
      }

      return enhancedTopics;
    }

    // Fallback to GPT-only if Google Trends fails
    console.log('   ⚠️ Google Trends unavailable, falling back to GPT analysis...');

    const trendingModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      systemInstruction: TRENDING_PROMPT,
    });
    const trendingResult =
      await trendingModel.generateContent(`What historical topics are trending or about to trend right now?

Consider:
- Recent movie/show releases
- Upcoming anniversaries
- Current events with historical parallels
- What's viral on TikTok/YouTube

Respond with JSON in this format:
{
  "topics": [
    {
      "figure": "Name",
      "event": "Specific story angle",
      "hook": "One sentence hook",
      "whyTrending": "Why this is relevant now",
      "contentAngle": "Fresh take that isn't overdone"
    }
  ]
}`);

    const result = JSON.parse(trendingResult.response.text());

    return (result.topics || []).map((t: any) => ({
      figure: t.figure,
      event: t.event,
      hook: t.hook,
      whyNow: t.whyTrending,
      viralScore: 8,
      source: 'trending' as const,
    }));
  } catch (error: any) {
    console.error('Trending topics discovery failed:', error.message);
    return [];
  }
}

export async function getUpcomingAnniversaries(daysAhead: number = 7): Promise<TopicCandidate[]> {
  const dates = [];
  for (let i = 0; i < daysAhead; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    dates.push(date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }));
  }

  try {
    const anniversaryModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
      systemInstruction: `Find major historical anniversaries (25th, 50th, 75th, 100th, etc.) coming up in the next week that would make good viral content.

Focus on:
- Round number anniversaries (50, 100, 150 years, etc.)
- Events with dramatic stories
- Single protagonist focus
- Lesser-known details about famous events`,
    });
    const anniversaryResult =
      await anniversaryModel.generateContent(`Find anniversaries for these dates: ${dates.join(', ')}

Look for events that are hitting milestone anniversaries (25, 50, 75, 100, 150, 200 years).

Respond with JSON in this format:
{
  "anniversaries": [
    {
      "figure": "Name",
      "event": "What happened",
      "date": "Month Day",
      "yearsAgo": 100,
      "hook": "One sentence hook",
      "milestone": "100th anniversary"
    }
  ]
}`);

    const result = JSON.parse(anniversaryResult.response.text());

    return (result.anniversaries || []).map((a: any) => ({
      figure: a.figure,
      event: a.event,
      hook: a.hook,
      whyNow: `${a.milestone} on ${a.date}`,
      viralScore: 8,
      source: 'anniversary' as const,
    }));
  } catch (error: any) {
    console.error('Anniversary discovery failed:', error.message);
    return [];
  }
}

export async function scoreTopics(topics: TopicCandidate[]): Promise<TopicCandidate[]> {
  if (topics.length === 0) return [];

  try {
    const scoringModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.5, responseMimeType: 'application/json' },
      systemInstruction: SCORING_PROMPT,
    });
    const scoringResult = await scoringModel.generateContent(`Score these topics for viral potential:

${topics
  .map(
    (t, i) => `${i + 1}. ${t.figure}: ${t.event}
   Hook: ${t.hook}
   Why now: ${t.whyNow}`,
  )
  .join('\n\n')}

Respond with JSON in this format:
{
  "scores": [
    {
      "index": 0,
      "hook": 8,
      "relatability": 7,
      "shareability": 9,
      "visual": 8,
      "controversy": 6,
      "timeliness": 7,
      "finalScore": 8.2,
      "reasoning": "Brief explanation"
    }
  ]
}`);

    const result = JSON.parse(scoringResult.response.text());

    return topics.map((topic, i) => {
      const score = result.scores?.find((s: any) => s.index === i);
      return {
        ...topic,
        viralScore: score?.finalScore || topic.viralScore,
      };
    });
  } catch (error: any) {
    console.error('Topic scoring failed:', error.message);
    return topics;
  }
}

export interface ContentQueue {
  items: ContentQueueItem[];
  add(topic: TopicCandidate, scheduledFor?: Date): ContentQueueItem;
  getNext(): ContentQueueItem | null;
  getPending(): ContentQueueItem[];
  markComplete(id: string, videoPath: string): void;
  markFailed(id: string, error: string): void;
  markGenerating(id: string): void;
}

export function createContentQueue(): ContentQueue {
  const items: ContentQueueItem[] = [];

  return {
    items,

    add(topic: TopicCandidate, scheduledFor?: Date): ContentQueueItem {
      const item: ContentQueueItem = {
        id: `content_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        topic,
        status: 'queued',
        scheduledFor: scheduledFor || new Date(),
        createdAt: new Date(),
      };
      items.push(item);
      return item;
    },

    getNext(): ContentQueueItem | null {
      const now = new Date();
      return items.find((item) => item.status === 'queued' && item.scheduledFor <= now) || null;
    },

    getPending(): ContentQueueItem[] {
      return items.filter((item) => item.status === 'queued');
    },

    markComplete(id: string, videoPath: string): void {
      const item = items.find((i) => i.id === id);
      if (item) {
        item.status = 'completed';
        item.videoPath = videoPath;
      }
    },

    markFailed(id: string, error: string): void {
      const item = items.find((i) => i.id === id);
      if (item) {
        item.status = 'failed';
        item.error = error;
      }
    },

    markGenerating(id: string): void {
      const item = items.find((i) => i.id === id);
      if (item) {
        item.status = 'generating';
      }
    },
  };
}

export async function discoverContent(config: DiscoveryConfig): Promise<TopicCandidate[]> {
  console.log('🔍 Discovering content...\n');

  const [thisDayTopics, trendingTopics, anniversaryTopics] = await Promise.all([
    getThisDayInHistory(),
    getTrendingTopics(),
    getUpcomingAnniversaries(7),
  ]);

  console.log(`   This day: ${thisDayTopics.length} topics`);
  console.log(`   Trending: ${trendingTopics.length} topics`);
  console.log(`   Anniversaries: ${anniversaryTopics.length} topics`);

  const allTopics = [...thisDayTopics, ...trendingTopics, ...anniversaryTopics];

  const filtered = allTopics.filter(
    (t) => !config.excludeFigures.some((f) => t.figure.toLowerCase().includes(f.toLowerCase())),
  );

  console.log('\n📊 Scoring topics...');
  const scored = await scoreTopics(filtered);

  const qualified = scored.filter((t) => t.viralScore >= config.minViralScore);

  qualified.sort((a, b) => b.viralScore - a.viralScore);

  const selected = qualified.slice(0, config.videosPerDay);

  console.log(`\n✅ Selected ${selected.length} topics for today`);
  selected.forEach((t, i) => {
    console.log(`   ${i + 1}. ${t.figure} (${t.viralScore.toFixed(1)}) - ${t.hook.substring(0, 50)}...`);
  });

  return selected;
}

export async function suggestTopics(count: number = 10, existingFigures: string[] = []): Promise<TopicCandidate[]> {
  try {
    // Get thematic principles from pattern intelligence (if available)
    const principlesPrompt = patternIntelligenceService.formatPrinciplesForPrompt();
    const activeThemes = patternIntelligenceService.getThemesByCategory();
    const hasPrinciples = principlesPrompt.length > 0;

    if (hasPrinciples) {
      console.log('   📊 ANALYTICS → PROMPTS: Injecting learned thematic principles...');

      // Show exactly which themes are being applied
      if (activeThemes.proven.length > 0) {
        console.log('   🔥 PROVEN THEMES BEING APPLIED:');
        activeThemes.proven.slice(0, 3).forEach((t) => {
          console.log(`      • "${t.name}" (${t.successRate.toFixed(0)}% success, ${t.videosApplied} videos)`);
          console.log(`        WHY: ${t.whyItWorks.substring(0, 80)}...`);
        });
      }

      if (activeThemes.emerging.length > 0) {
        console.log('   📊 EMERGING THEMES BEING TESTED:');
        activeThemes.emerging.slice(0, 2).forEach((t) => {
          console.log(`      • "${t.name}" (${t.videosApplied} videos, testing...)`);
        });
      }

      if (activeThemes.failing.length > 0) {
        console.log('   ⛔ THEMES BEING AVOIDED:');
        activeThemes.failing.slice(0, 2).forEach((t) => {
          console.log(`      • "${t.name}" (${t.successRate.toFixed(0)}% success - underperforming)`);
        });
      }
    } else {
      console.log('   ⚠️ No analytics themes available yet - using base prompts only');
    }

    // Build a name→id map for the themes being injected so Gemini can report which it used per topic
    const themeNameToId: Record<string, string> = {};
    if (hasPrinciples) {
      for (const t of [...activeThemes.proven.slice(0, 3), ...activeThemes.emerging.slice(0, 2)]) {
        themeNameToId[t.name.toLowerCase()] = t.id;
      }
    }
    const availableThemeNames = Object.keys(themeNameToId);

    // Get YouTube search terms that drive traffic (if available)
    let searchTermsContext = '';
    try {
      const searchTerms = await youtubeAnalyticsService.getAggregatedSearchTerms();
      if (searchTerms.length > 0) {
        console.log(`   🔍 Using ${searchTerms.length} search terms from YouTube analytics...`);
        const topTerms = searchTerms.slice(0, 15).map((t) => `"${t.term}" (${t.totalViews} views)`);
        searchTermsContext = `
YOUTUBE SEARCH SIGNALS (real keywords people search to find videos like yours):
${topTerms.join(', ')}

Consider creating content that relates to these search patterns while still being unique and specific.
`;
      }
    } catch (e) {
      // Search terms not available - continue without them
    }

    const suggestModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      systemInstruction: `You are a viral content strategist for historical short-form videos.

CRITICAL: Suggest SPECIFIC MOMENTS/EVENTS, not general biographies!

BAD (too broad):
- "Julius Caesar" → too general
- "Cleopatra's life" → too broad
- "Napoleon Bonaparte" → just a name

GOOD (specific moments):
- "The night Julius Caesar crossed the Rubicon" → specific decision
- "Cleopatra smuggled to Caesar in a rolled carpet" → specific event
- "The 23 stab wounds that killed Caesar" → specific dramatic moment
- "Napoleon's midnight escape from Elba island" → specific event
- "Lincoln's bodyguard who left for a drink" → specific irony

Suggest ${count} SPECIFIC historical moments/events that would work for 60-second rap videos.

Focus on:
- Single dramatic moments (not whole lives)
- Specific decisions that changed everything
- Ironic twists of fate
- "What if" moments that haunt history
- Specific betrayals, escapes, or confrontations
- The ONE thing most people don't know about a famous person
- Specific battles, speeches, or turning points

${
  hasPrinciples
    ? `
LEARNED THEMATIC PRINCIPLES (from analyzing past video performance):
${principlesPrompt}

Use these principles to guide your suggestions, but create FRESH content - don't just repeat what worked before.
`
    : ''
}
${searchTermsContext}
Avoid already covered: ${existingFigures.join(', ') || 'none yet'}`,
    });
    const suggestResult =
      await suggestModel.generateContent(`Suggest ${count} SPECIFIC viral-worthy historical moments (not general biographies).

Each should be about a SINGLE EVENT or MOMENT, not someone's whole life.
${hasPrinciples ? '\nApply the thematic principles provided to maximize viral potential.' : ''}

Respond with JSON in this format:
{
  "suggestions": [
    {
      "figure": "Person's name",
      "era": "Time period",
      "specificEvent": "The SPECIFIC moment/event title (not their whole life)",
      "bestStory": "2-3 sentence description of this specific dramatic event",
      "hook": "One sentence that makes people stop scrolling",
      "whyViral": "Why this specific moment would go viral"${availableThemeNames.length > 0 ? `,\n      "themesUsed": ["theme name 1", "theme name 2"]` : ''}
    }
  ]
}${availableThemeNames.length > 0 ? `\n\nFor "themesUsed", list ONLY the themes from the provided principles that directly influenced this specific suggestion. Choose from: ${availableThemeNames.map((n) => `"${n}"`).join(', ')}. Leave empty if none apply.` : ''}`);

    const result = JSON.parse(suggestResult.response.text());

    return (result.suggestions || []).map((s: any) => {
      // Map theme names reported by Gemini back to theme IDs
      let topicThemeIds: string[] | undefined;
      if (s.themesUsed && Array.isArray(s.themesUsed) && s.themesUsed.length > 0) {
        topicThemeIds = s.themesUsed.map((name: string) => themeNameToId[name.toLowerCase()]).filter(Boolean);
        if (topicThemeIds!.length === 0) topicThemeIds = undefined;
      }

      return {
        figure: s.specificEvent || s.figure, // Use specific event as the "figure" for more focused content
        event: s.bestStory,
        hook: s.hook,
        whyNow: s.whyViral,
        viralScore: 8,
        source: 'suggested' as const,
        historicalFigure: s.figure, // Keep the actual person's name for deduplication
        appliedThemeIds: topicThemeIds,
      };
    });
  } catch (error: any) {
    console.error('Topic suggestions failed:', error.message);
    return [];
  }
}

class AutoContentDiscoveryService {
  private excludeFigures: string[] = [];

  addExcludedFigure(figure: string): void {
    if (!this.excludeFigures.includes(figure.toLowerCase())) {
      this.excludeFigures.push(figure.toLowerCase());
    }
  }

  getExcludedFigures(): string[] {
    return [...this.excludeFigures];
  }

  async discover(config?: Partial<DiscoveryConfig>): Promise<TopicCandidate[]> {
    const fullConfig: DiscoveryConfig = {
      videosPerDay: config?.videosPerDay || 3,
      preferredCategories: config?.preferredCategories || [],
      excludeFigures: [...this.excludeFigures, ...(config?.excludeFigures || [])],
      minViralScore: config?.minViralScore || 7,
    };

    return discoverContent(fullConfig);
  }

  async getSuggestions(count: number = 10): Promise<TopicCandidate[]> {
    return suggestTopics(count, this.excludeFigures);
  }

  async getThisDay(): Promise<TopicCandidate[]> {
    return getThisDayInHistory();
  }

  async getTrending(): Promise<TopicCandidate[]> {
    return getTrendingTopics();
  }

  async getAnniversaries(daysAhead: number = 7): Promise<TopicCandidate[]> {
    return getUpcomingAnniversaries(daysAhead);
  }
}

export const autoContentDiscovery = new AutoContentDiscoveryService();
