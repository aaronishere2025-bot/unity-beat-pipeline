/**
 * YouTube Trends Discovery Service
 *
 * Uses YouTube Data API to discover trending videos,
 * then uses Gemini to:
 * 1. Extract themes/topics from trending content
 * 2. Map themes to relevant historical figures
 * 3. Generate creative angles for historical rap videos
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface TrendingVideo {
  videoId: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  viewCount: number;
  tags?: string[];
}

interface ExtractedTheme {
  theme: string;
  keywords: string[];
  emotionalTone: string;
  popularity: number;
}

interface HistoricalMapping {
  theme: string;
  historicalFigure: string;
  era: string;
  angle: string;
  whyRelevant: string;
  suggestedTitle: string;
  emotionalHook: string;
  visualStyle: string;
}

interface TrendDiscoveryResult {
  trendingVideos: TrendingVideo[];
  extractedThemes: ExtractedTheme[];
  historicalMappings: HistoricalMapping[];
  discoveryTimestamp: string;
}

class YouTubeTrendsService {
  private oauth2Client: OAuth2Client | null = null;
  private credentialsPath = join(process.cwd(), 'data', 'youtube_credentials.json');

  // Theme cache with 24-hour TTL (trends change daily)
  private themeToFigureCache = new Map<string, { data: HistoricalMapping; timestamp: number }>();
  private THEME_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private lastDiscovery: TrendDiscoveryResult | null = null;

  constructor() {
    this.initializeClient();
    // Clean stale cache entries every 6 hours
    setInterval(() => this.cleanStaleCache(), 6 * 60 * 60 * 1000);
  }

  private initializeClient(): void {
    const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();

    if (clientId && clientSecret) {
      this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      this.loadStoredCredentials();
    }
  }

  private loadStoredCredentials(): void {
    try {
      if (existsSync(this.credentialsPath)) {
        const data = readFileSync(this.credentialsPath, 'utf-8');
        const credentials = JSON.parse(data);

        if (this.oauth2Client && credentials.refreshToken) {
          this.oauth2Client.setCredentials({
            access_token: credentials.accessToken,
            refresh_token: credentials.refreshToken,
            expiry_date: credentials.expiryDate,
          });
        }
      }

      const envRefreshToken = process.env.YOUTUBE_REFRESH_TOKEN?.trim();
      if (this.oauth2Client && envRefreshToken && !this.oauth2Client.credentials.refresh_token) {
        this.oauth2Client.setCredentials({ refresh_token: envRefreshToken });
      }
    } catch (error) {
      console.warn('Could not load YouTube credentials for trends:', error);
    }
  }

  /**
   * Fetch trending videos from YouTube
   */
  async getTrendingVideos(maxResults: number = 25, regionCode: string = 'US'): Promise<TrendingVideo[]> {
    if (!this.oauth2Client) {
      console.warn('⚠️ YouTube not configured for trends discovery');
      return [];
    }

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      const response = await youtube.videos.list({
        part: ['snippet', 'statistics'],
        chart: 'mostPopular',
        regionCode,
        maxResults,
        videoCategoryId: '0', // All categories
      });

      const videos: TrendingVideo[] = (response.data.items || []).map((item) => ({
        videoId: item.id || '',
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        channelTitle: item.snippet?.channelTitle || '',
        publishedAt: item.snippet?.publishedAt || '',
        viewCount: parseInt(item.statistics?.viewCount || '0'),
        tags: item.snippet?.tags || [],
      }));

      console.log(`📈 Fetched ${videos.length} trending videos from YouTube`);
      return videos;
    } catch (error: any) {
      console.error('Error fetching trending videos:', error.message);
      return [];
    }
  }

  /**
   * Use GPT-4o to extract themes from trending videos
   */
  async extractThemes(videos: TrendingVideo[]): Promise<ExtractedTheme[]> {
    if (videos.length === 0) return [];

    const videoSummaries = videos.slice(0, 20).map((v) => ({
      title: v.title,
      channel: v.channelTitle,
      views: v.viewCount,
      tags: v.tags?.slice(0, 5) || [],
    }));

    try {
      console.log('🧠 Analyzing trending videos with GPT-4o...');

      const themeModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, maxOutputTokens: 2000, responseMimeType: 'application/json' },
        systemInstruction: `You are a trend analyst specializing in identifying viral themes and emotional triggers in content.

Analyze the trending YouTube videos and extract 5-8 overarching THEMES that could be applied to historical content.

Focus on:
- Universal human emotions (courage, betrayal, redemption, ambition)
- Narrative patterns (underdog stories, rivalries, secrets revealed)
- Current cultural zeitgeist (what society is collectively interested in)

For each theme, identify:
1. The core theme name (single word or short phrase)
2. Related keywords (3-5 words)
3. The emotional tone it triggers
4. Relative popularity score (1-10)

Respond in JSON format:
{
  "themes": [
    {
      "theme": "courage",
      "keywords": ["bravery", "fearless", "standing up", "against odds"],
      "emotionalTone": "inspiring",
      "popularity": 8
    }
  ]
}`,
      });
      const themeResult = await themeModel.generateContent(
        `Analyze these trending videos and extract universal themes:\n\n${JSON.stringify(videoSummaries, null, 2)}`,
      );
      const content = themeResult.response.text() || '{}';
      const parsed = JSON.parse(content);

      const themes: ExtractedTheme[] = parsed.themes || [];
      console.log(`✅ Extracted ${themes.length} themes from trending content`);

      return themes;
    } catch (error: any) {
      console.error('Error extracting themes:', error.message);
      return [];
    }
  }

  /**
   * Use GPT-4o to map themes to historical figures with creative angles
   */
  async mapThemesToHistoricalFigures(themes: ExtractedTheme[]): Promise<HistoricalMapping[]> {
    if (themes.length === 0) return [];

    try {
      console.log('🎭 Mapping themes to historical figures with GPT-4o...');

      const mappingModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.9, maxOutputTokens: 4000, responseMimeType: 'application/json' },
        systemInstruction: `You are a creative director for a historical rap video channel. Your job is to take trending themes and map them to compelling historical figures.

For each theme, select a historical figure who BEST embodies that theme and craft a creative angle for a rap video.

Guidelines:
- Choose figures from diverse eras (ancient, medieval, renaissance, modern)
- Pick figures with dramatic stories and visual potential
- Create angles that would resonate with modern audiences
- Focus on lesser-known stories or perspectives of famous figures
- Make the connection feel fresh and relevant, not obvious

For each mapping, provide:
1. historicalFigure: Full name
2. era: Time period (e.g., "16th Century England")
3. angle: The specific creative spin (2-3 sentences)
4. whyRelevant: Why this figure exemplifies the theme (1 sentence)
5. suggestedTitle: A viral-worthy video title
6. emotionalHook: The core emotion to trigger in viewers
7. visualStyle: Suggested visual aesthetic for the video

Respond in JSON format:
{
  "mappings": [
    {
      "theme": "courage",
      "historicalFigure": "Winston Churchill",
      "era": "20th Century Britain",
      "angle": "Focus on his darkest hour during the Blitz when he chose to stay in London despite the bombing. Show his internal struggle between fear and duty.",
      "whyRelevant": "Churchill's refusal to surrender against overwhelming odds defines modern courage.",
      "suggestedTitle": "Churchill's Last Stand - The Night Britain Almost Broke",
      "emotionalHook": "defiance in the face of annihilation",
      "visualStyle": "Dark wartime aesthetic with dramatic lighting, bomb raids, bunker scenes"
    }
  ]
}`,
      });
      const mappingResult = await mappingModel.generateContent(
        `Map these trending themes to historical figures for rap videos:\n\n${JSON.stringify(themes, null, 2)}`,
      );
      const content = mappingResult.response.text() || '{}';
      const parsed = JSON.parse(content);

      const mappings: HistoricalMapping[] = parsed.mappings || [];
      console.log(`✅ Created ${mappings.length} historical figure mappings`);

      // Cache for quick lookup with TTL
      const timestamp = Date.now();
      mappings.forEach((m) => this.themeToFigureCache.set(m.theme.toLowerCase(), { data: m, timestamp }));

      return mappings;
    } catch (error: any) {
      console.error('Error mapping themes to figures:', error.message);
      return [];
    }
  }

  /**
   * Full discovery pipeline: fetch trends → extract themes → map to history
   */
  async discoverTrendingHistoricalTopics(): Promise<TrendDiscoveryResult> {
    console.log('\n🔍 ===== YOUTUBE TRENDS DISCOVERY =====');
    console.log(`📅 ${new Date().toISOString()}`);

    // Step 1: Fetch trending videos
    const trendingVideos = await this.getTrendingVideos(25);

    if (trendingVideos.length === 0) {
      console.log('⚠️ No trending videos found, using fallback themes');
      return this.getFallbackDiscovery();
    }

    // Step 2: Extract themes with AI
    const extractedThemes = await this.extractThemes(trendingVideos);

    if (extractedThemes.length === 0) {
      console.log('⚠️ No themes extracted, using fallback themes');
      return this.getFallbackDiscovery();
    }

    // Step 3: Map themes to historical figures
    const historicalMappings = await this.mapThemesToHistoricalFigures(extractedThemes);

    const result: TrendDiscoveryResult = {
      trendingVideos,
      extractedThemes,
      historicalMappings,
      discoveryTimestamp: new Date().toISOString(),
    };

    this.lastDiscovery = result;

    console.log('\n📊 TREND DISCOVERY SUMMARY:');
    console.log(`   📺 Trending videos analyzed: ${trendingVideos.length}`);
    console.log(`   🎯 Themes extracted: ${extractedThemes.length}`);
    console.log(`   🎭 Historical mappings: ${historicalMappings.length}`);
    historicalMappings.forEach((m) => {
      console.log(`      • ${m.theme} → ${m.historicalFigure} (${m.era})`);
    });
    console.log('=====================================\n');

    return result;
  }

  /**
   * Fallback themes when YouTube API fails
   */
  private getFallbackDiscovery(): TrendDiscoveryResult {
    const fallbackMappings: HistoricalMapping[] = [
      {
        theme: 'courage',
        historicalFigure: 'Winston Churchill',
        era: '20th Century Britain',
        angle: 'His darkest hour during the Blitz - choosing to stay while London burned',
        whyRelevant: 'The ultimate symbol of standing firm when all seems lost',
        suggestedTitle: 'Churchill vs Hitler - The Speech That Saved Britain',
        emotionalHook: 'defiance against impossible odds',
        visualStyle: 'WWII era, dark bunkers, dramatic radio broadcasts',
      },
      {
        theme: 'betrayal',
        historicalFigure: 'Julius Caesar',
        era: 'Ancient Rome',
        angle: 'Et tu Brute - when your closest ally becomes your killer',
        whyRelevant: "History's most famous betrayal still resonates today",
        suggestedTitle: "Caesar's Last Day - 23 Stab Wounds",
        emotionalHook: 'shock of ultimate betrayal',
        visualStyle: 'Roman senate, marble columns, crimson and gold',
      },
      {
        theme: 'ambition',
        historicalFigure: 'Genghis Khan',
        era: '13th Century Mongolia',
        angle: 'From rejected orphan to ruler of the largest empire in history',
        whyRelevant: 'The ultimate underdog story of ambition overcoming everything',
        suggestedTitle: 'Genghis Khan - From Nothing to Everything',
        emotionalHook: 'relentless hunger for greatness',
        visualStyle: 'Vast steppes, horseback warriors, epic scale',
      },
      {
        theme: 'redemption',
        historicalFigure: 'Mary Magdalene',
        era: '1st Century Judea',
        angle: 'From outcast to the first witness of resurrection',
        whyRelevant: 'The original redemption arc that defined Western storytelling',
        suggestedTitle: 'The Woman Everyone Forgot - Until Easter Morning',
        emotionalHook: 'hope after hitting rock bottom',
        visualStyle: 'Biblical era, dusty Jerusalem, dawn light',
      },
      {
        theme: 'rivalry',
        historicalFigure: 'Nikola Tesla',
        era: '19th Century America',
        angle: 'Tesla vs Edison - the genius who lost the battle but won history',
        whyRelevant: 'The original tech rivalry that shaped the modern world',
        suggestedTitle: 'Tesla vs Edison - Who REALLY Won?',
        emotionalHook: 'vindication of the overlooked genius',
        visualStyle: 'Victorian industrial, electricity, laboratories',
      },
    ];

    return {
      trendingVideos: [],
      extractedThemes: fallbackMappings.map((m) => ({
        theme: m.theme,
        keywords: [],
        emotionalTone: m.emotionalHook,
        popularity: 7,
      })),
      historicalMappings: fallbackMappings,
      discoveryTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Get the most recent discovery result
   */
  getLastDiscovery(): TrendDiscoveryResult | null {
    return this.lastDiscovery;
  }

  /**
   * Get topics ready for video generation (converts mappings to Unity-compatible format)
   */
  async getTrendingTopicsForGeneration(count: number = 5): Promise<
    Array<{
      topic: string;
      character1: { name: string; type: string };
      character2?: { name: string; type: string };
      stylePreset: string;
      trendSource: string;
      angle: string;
    }>
  > {
    // Use cached discovery or run new one
    let discovery = this.lastDiscovery;
    if (!discovery || this.isDiscoveryStale()) {
      discovery = await this.discoverTrendingHistoricalTopics();
    }

    const topics = discovery.historicalMappings.slice(0, count).map((mapping) => ({
      topic: mapping.suggestedTitle,
      character1: {
        name: mapping.historicalFigure,
        type: 'historical_figure',
      },
      stylePreset: this.inferStylePreset(mapping.visualStyle),
      trendSource: `youtube_trending:${mapping.theme}`,
      angle: mapping.angle,
    }));

    console.log(`📋 Prepared ${topics.length} trend-based topics for generation`);
    return topics;
  }

  private isDiscoveryStale(): boolean {
    if (!this.lastDiscovery) return true;
    const timestamp = new Date(this.lastDiscovery.discoveryTimestamp);
    const hoursSince = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
    return hoursSince > 12; // Refresh every 12 hours
  }

  private inferStylePreset(visualStyle: string): string {
    const style = visualStyle.toLowerCase();
    if (style.includes('war') || style.includes('battle') || style.includes('military')) {
      return 'documentary';
    }
    if (style.includes('ancient') || style.includes('roman') || style.includes('greek')) {
      return 'documentary';
    }
    if (style.includes('industrial') || style.includes('victorian')) {
      return 'documentary';
    }
    if (style.includes('biblical') || style.includes('religious')) {
      return 'documentary';
    }
    return 'documentary'; // Default for historical content
  }

  /**
   * Clean stale cache entries older than 24 hours
   */
  private cleanStaleCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [theme, entry] of this.themeToFigureCache.entries()) {
      if (now - entry.timestamp > this.THEME_CACHE_TTL) {
        this.themeToFigureCache.delete(theme);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} stale theme mappings from cache`);
    }
  }

  /**
   * Get a cached theme mapping if it's still fresh (< 24 hours old)
   */
  getCachedThemeMapping(theme: string): HistoricalMapping | null {
    const cached = this.themeToFigureCache.get(theme.toLowerCase());
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.THEME_CACHE_TTL) {
      // Stale, remove it
      this.themeToFigureCache.delete(theme.toLowerCase());
      return null;
    }

    return cached.data;
  }

  /**
   * Manually clear the theme cache
   */
  clearThemeCache(): void {
    const size = this.themeToFigureCache.size;
    this.themeToFigureCache.clear();
    console.log(`🗑️  Cleared ${size} theme mappings from cache`);
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return this.oauth2Client !== null;
  }
}

export const youtubeTrendsService = new YouTubeTrendsService();
