/**
 * GAP DETECTION SERVICE
 *
 * Analyzes competitor content and finds content opportunities:
 * 1. Analyzes popular YouTube channels in the historical/educational niche
 * 2. Uses GPT-4o to analyze trending topics and find gaps
 * 3. Compares competitor topics against our existing video topics
 * 4. Scores opportunities based on trend momentum, competition, relevance, freshness
 * 5. Integrates with Thompson Sampling (character-figure-bandit) for weighting
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { db } from '../db';
import { jobs } from '@shared/schema';
import { desc, like, or, sql } from 'drizzle-orm';
import { characterFigureBandit } from './character-figure-bandit';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface ContentGap {
  topic: string;
  historicalFigures: string[];
  competitorViews: number;
  ourCoverage: 'none' | 'low' | 'medium';
  opportunityScore: number;
  suggestedAngles: string[];
  trendMomentum: 'rising' | 'stable' | 'declining';
  source?: string;
  competitorChannel?: string;
  discoveredAt: string;
}

export interface CompetitorAnalysis {
  channelId: string;
  channelTitle: string;
  subscriberCount: number;
  totalVideos: number;
  recentVideos: CompetitorVideo[];
  topTopics: string[];
  averageViews: number;
  analyzedAt: string;
}

export interface CompetitorVideo {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  viewCount: number;
  likeCount: number;
  tags?: string[];
}

export interface Opportunity {
  rank: number;
  topic: string;
  historicalFigures: string[];
  score: number;
  reasons: string[];
  suggestedAngles: string[];
  trendMomentum: 'rising' | 'stable' | 'declining';
  competitorViews: number;
  banditBoost: number;
  urgency: 'high' | 'medium' | 'low';
}

interface GapAnalysisState {
  gaps: ContentGap[];
  lastRefresh: string;
  competitorAnalyses: Record<string, CompetitorAnalysis>;
  version: number;
}

const HISTORICAL_EDUCATION_CHANNELS = [
  'UCqmugCqELzhIMNYnsjScXXw', // NowThis
  'UC22BdTgxefuvUivrjesETjg', // Simple History
  'UC2C_jShtL725hvbm1arSV9w', // CGP Grey
  'UCvjgEDvShRsAQ8ZTpQZn5Yw', // Kings and Generals
  'UCS7c-BfeKMufXmKHvXQAiEA', // Extra History
  'UCsXVk37bltHxD1rDPwtNM8Q', // Kurzgesagt
];

const COMPETITOR_KEYWORDS = [
  'history',
  'historical',
  'ancient',
  'medieval',
  'documentary',
  'biography',
  'emperor',
  'king',
  'queen',
  'battle',
  'war',
  'civilization',
  'empire',
  'conquest',
  'legend',
  'mythology',
];

class GapDetectionService {
  private oauth2Client: OAuth2Client | null = null;
  private credentialsPath = join(process.cwd(), 'data', 'youtube_credentials.json');
  private statePath = join(process.cwd(), 'data', 'gap_analysis.json');
  private state: GapAnalysisState = {
    gaps: [],
    lastRefresh: '',
    competitorAnalyses: {},
    version: 1,
  };

  constructor() {
    this.initializeClient();
    this.loadState();
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
      console.warn('Could not load YouTube credentials for gap detection');
    }
  }

  private loadState(): void {
    try {
      if (existsSync(this.statePath)) {
        const data = JSON.parse(readFileSync(this.statePath, 'utf-8'));
        this.state = data;
        console.log(`🔍 Gap Detection: Loaded ${this.state.gaps.length} gaps from state`);
      }
    } catch (error) {
      console.warn('Could not load gap analysis state');
    }
  }

  private saveState(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      writeFileSync(this.statePath, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.warn('Could not save gap analysis state');
    }
  }

  private async getOurExistingTopics(): Promise<string[]> {
    try {
      const existingJobs = await db
        .select({
          scriptName: jobs.scriptName,
          topic: jobs.unityMetadata,
        })
        .from(jobs)
        .where(sql`${jobs.status} = 'completed'`)
        .limit(500);

      const topics: string[] = [];
      for (const job of existingJobs) {
        topics.push((job.scriptName || '').toLowerCase());
        if (job.topic && typeof job.topic === 'object' && 'topic' in job.topic) {
          topics.push((job.topic as any).topic.toLowerCase());
        }
      }

      return [...new Set(topics)];
    } catch (error) {
      console.warn('Could not fetch existing topics from database');
      return [];
    }
  }

  private calculateCoverageLevel(topic: string, existingTopics: string[]): 'none' | 'low' | 'medium' {
    const topicLower = topic.toLowerCase();
    const topicWords = topicLower.split(/\s+/).filter((w) => w.length > 3);

    let matchScore = 0;
    for (const existing of existingTopics) {
      if (existing.includes(topicLower) || topicLower.includes(existing)) {
        return 'medium';
      }

      const matchingWords = topicWords.filter((word) => existing.includes(word));
      if (matchingWords.length >= 2) {
        matchScore += matchingWords.length;
      }
    }

    if (matchScore >= 3) return 'low';
    return 'none';
  }

  async analyzeCompetitorChannel(channelId: string): Promise<CompetitorAnalysis> {
    if (!this.oauth2Client) {
      console.warn('⚠️ YouTube not configured for gap detection');
      return this.getEmptyAnalysis(channelId);
    }

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      const channelResponse = await youtube.channels.list({
        part: ['snippet', 'statistics'],
        id: [channelId],
      });

      const channelData = channelResponse.data.items?.[0];
      if (!channelData) {
        console.warn(`Channel ${channelId} not found`);
        return this.getEmptyAnalysis(channelId);
      }

      const searchResponse = await youtube.search.list({
        part: ['snippet'],
        channelId,
        order: 'viewCount',
        type: ['video'],
        maxResults: 25,
        publishedAfter: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      });

      const videoIds = searchResponse.data.items?.map((item) => item.id?.videoId).filter(Boolean) as string[];

      let recentVideos: CompetitorVideo[] = [];
      if (videoIds.length > 0) {
        const videosResponse = await youtube.videos.list({
          part: ['snippet', 'statistics'],
          id: videoIds,
        });

        recentVideos = (videosResponse.data.items || []).map((item) => ({
          videoId: item.id || '',
          title: item.snippet?.title || '',
          description: item.snippet?.description || '',
          publishedAt: item.snippet?.publishedAt || '',
          viewCount: parseInt(item.statistics?.viewCount || '0'),
          likeCount: parseInt(item.statistics?.likeCount || '0'),
          tags: item.snippet?.tags || [],
        }));
      }

      const analysis: CompetitorAnalysis = {
        channelId,
        channelTitle: channelData.snippet?.title || '',
        subscriberCount: parseInt(channelData.statistics?.subscriberCount || '0'),
        totalVideos: parseInt(channelData.statistics?.videoCount || '0'),
        recentVideos,
        topTopics: await this.extractTopicsFromVideos(recentVideos),
        averageViews:
          recentVideos.length > 0
            ? Math.round(recentVideos.reduce((sum, v) => sum + v.viewCount, 0) / recentVideos.length)
            : 0,
        analyzedAt: new Date().toISOString(),
      };

      this.state.competitorAnalyses[channelId] = analysis;
      this.saveState();

      console.log(`📊 Analyzed competitor: ${analysis.channelTitle} (${recentVideos.length} videos)`);
      return analysis;
    } catch (error: any) {
      console.error(`Error analyzing channel ${channelId}:`, error.message);
      return this.getEmptyAnalysis(channelId);
    }
  }

  private getEmptyAnalysis(channelId: string): CompetitorAnalysis {
    return {
      channelId,
      channelTitle: 'Unknown',
      subscriberCount: 0,
      totalVideos: 0,
      recentVideos: [],
      topTopics: [],
      averageViews: 0,
      analyzedAt: new Date().toISOString(),
    };
  }

  private async extractTopicsFromVideos(videos: CompetitorVideo[]): Promise<string[]> {
    if (videos.length === 0) return [];

    try {
      const videoSummaries = videos.slice(0, 15).map((v) => ({
        title: v.title,
        views: v.viewCount,
        tags: v.tags?.slice(0, 5) || [],
      }));

      const topicModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 1000, responseMimeType: 'application/json' },
        systemInstruction: `Extract the main historical topics from these video titles.
Return a JSON object with a "topics" array containing 5-10 topic strings.
Focus on: historical figures, events, eras, civilizations.
Be specific (e.g., "Julius Caesar's assassination" not just "Rome").`,
      });
      const topicResult = await topicModel.generateContent(JSON.stringify(videoSummaries, null, 2));
      const content = topicResult.response.text() || '{}';
      const parsed = JSON.parse(content);
      return parsed.topics || [];
    } catch (error) {
      console.warn('Could not extract topics with AI');
      return [];
    }
  }

  async findContentGaps(limit: number = 20): Promise<ContentGap[]> {
    console.log('\n🔍 ===== GAP DETECTION ANALYSIS =====');
    console.log(`📅 ${new Date().toISOString()}`);

    const existingTopics = await this.getOurExistingTopics();
    console.log(`📚 Found ${existingTopics.length} existing topics in our library`);

    const competitorVideos: CompetitorVideo[] = [];

    for (const channelId of HISTORICAL_EDUCATION_CHANNELS.slice(0, 3)) {
      try {
        const analysis = await this.analyzeCompetitorChannel(channelId);
        competitorVideos.push(...analysis.recentVideos);
      } catch (error) {
        console.warn(`Could not analyze channel ${channelId}`);
      }
    }

    console.log(`📺 Collected ${competitorVideos.length} competitor videos`);

    if (competitorVideos.length === 0) {
      console.log('⚠️ No competitor videos found, using fallback gaps');
      return this.getFallbackGaps();
    }

    const gaps = await this.identifyGapsWithAI(competitorVideos, existingTopics);

    const banditStats = characterFigureBandit.getStats();
    const rankedGaps = this.rankGapsWithBandit(gaps, banditStats);

    this.state.gaps = rankedGaps.slice(0, 50);
    this.state.lastRefresh = new Date().toISOString();
    this.saveState();

    console.log(`\n✅ Found ${rankedGaps.length} content gaps`);
    console.log('=====================================\n');

    return rankedGaps.slice(0, limit);
  }

  private async identifyGapsWithAI(
    competitorVideos: CompetitorVideo[],
    existingTopics: string[],
  ): Promise<ContentGap[]> {
    try {
      const videoData = competitorVideos.slice(0, 30).map((v) => ({
        title: v.title,
        views: v.viewCount,
        publishedAt: v.publishedAt,
      }));

      const gapModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, maxOutputTokens: 3000, responseMimeType: 'application/json' },
        systemInstruction: `You are a content strategist for a historical rap/educational video channel.

Analyze competitor videos and identify TWO types of opportunities:

TYPE 1 - GAPS (topics we haven't covered):
- Topics performing well for competitors (high views)
- Feature compelling historical figures
- Good storytelling potential for rap/music videos
- NOT in our existing topics list

TYPE 2 - EXTENSIONS (topics we covered but competitors are crushing):
- Topics that overlap with our existing content
- But competitors have WAY more views (100K+)
- Opportunity to revisit with a fresh angle

For each opportunity, provide:
- topic: The specific topic/story
- historicalFigures: Main figures involved (1-3 names)
- suggestedAngles: 2-3 creative angles for our style
- trendMomentum: "rising", "stable", or "declining" based on recency and views
- estimatedViews: Average competitor views for this topic
- isExtension: true if this overlaps with our existing topics, false if new

Our existing topics (check for overlaps to find extensions):
${existingTopics.slice(0, 30).join(', ')}

Return JSON: { "gaps": [...] } - include BOTH gaps AND extensions in this array`,
      });
      const gapResult = await gapModel.generateContent(
        `Analyze these competitor videos and find 10-15 content gaps:\n\n${JSON.stringify(videoData, null, 2)}`,
      );
      const content = gapResult.response.text() || '{}';
      const parsed = JSON.parse(content);
      const aiGaps = parsed.gaps || [];

      return aiGaps.map((gap: any) => {
        // If AI marked it as extension, set coverage to 'low' to ensure it appears in extensions
        let ourCoverage: 'none' | 'low' | 'medium' = this.calculateCoverageLevel(gap.topic || '', existingTopics);
        if (gap.isExtension === true) {
          ourCoverage = ourCoverage === 'none' ? 'low' : ourCoverage; // Ensure extensions get picked up
        }

        return {
          topic: gap.topic || 'Unknown topic',
          historicalFigures: gap.historicalFigures || [],
          competitorViews: gap.estimatedViews || 10000,
          ourCoverage,
          opportunityScore: 0,
          suggestedAngles: gap.suggestedAngles || [],
          trendMomentum: gap.trendMomentum || 'stable',
          source: gap.isExtension ? 'extension_analysis' : 'competitor_analysis',
          discoveredAt: new Date().toISOString(),
        };
      });
    } catch (error: any) {
      console.error('AI gap identification failed:', error.message);
      return [];
    }
  }

  private rankGapsWithBandit(gaps: ContentGap[], banditStats: any): ContentGap[] {
    const rankings = characterFigureBandit.getAllRankings();
    const topDomains = rankings.domain?.slice(0, 3).map((d) => d.value) || [];
    const topEras = rankings.era?.slice(0, 3).map((e) => e.value) || [];
    const topStoryTypes = rankings.story_type?.slice(0, 3).map((s) => s.value) || [];

    return gaps
      .map((gap) => {
        let score = 50;

        if (gap.ourCoverage === 'none') score += 20;
        else if (gap.ourCoverage === 'low') score += 10;

        if (gap.trendMomentum === 'rising') score += 15;
        else if (gap.trendMomentum === 'stable') score += 5;
        else score -= 5;

        if (gap.competitorViews > 100000) score += 15;
        else if (gap.competitorViews > 50000) score += 10;
        else if (gap.competitorViews > 10000) score += 5;

        const topicLower = gap.topic.toLowerCase();

        for (const domain of topDomains) {
          if (topicLower.includes(domain)) {
            score += 10;
            break;
          }
        }

        for (const era of topEras) {
          if (topicLower.includes(era)) {
            score += 8;
            break;
          }
        }

        for (const storyType of topStoryTypes) {
          if (topicLower.includes(storyType)) {
            score += 8;
            break;
          }
        }

        if (gap.historicalFigures.length >= 2) score += 5;

        score = Math.min(100, Math.max(0, score));

        return {
          ...gap,
          opportunityScore: Math.round(score),
        };
      })
      .sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  async getTopOpportunities(): Promise<Opportunity[]> {
    if (this.state.gaps.length === 0 || this.isStateStale()) {
      await this.findContentGaps();
    }

    const rankings = characterFigureBandit.getAllRankings();

    return this.state.gaps
      .slice(0, 10)
      .map((gap, index) => {
        const banditBoost = this.calculateBanditBoost(gap, rankings);

        const reasons: string[] = [];
        if (gap.ourCoverage === 'none') reasons.push('Untapped topic');
        if (gap.trendMomentum === 'rising') reasons.push('Rising trend');
        if (gap.competitorViews > 50000) reasons.push('High competitor performance');
        if (banditBoost > 5) reasons.push('Matches proven attributes');

        return {
          rank: index + 1,
          topic: gap.topic,
          historicalFigures: gap.historicalFigures,
          score: gap.opportunityScore + banditBoost,
          reasons,
          suggestedAngles: gap.suggestedAngles,
          trendMomentum: gap.trendMomentum,
          competitorViews: gap.competitorViews,
          banditBoost,
          urgency: this.calculateUrgency(gap),
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private calculateBanditBoost(gap: ContentGap, rankings: any): number {
    let boost = 0;
    const topicLower = gap.topic.toLowerCase();

    const warKeywords = ['battle', 'war', 'conquest', 'military'];
    if (warKeywords.some((k) => topicLower.includes(k))) {
      const militaryRank = rankings.domain?.find((d: any) => d.value === 'military');
      if (militaryRank && militaryRank.expectedSuccess > 0.5) {
        boost += 10;
      }
    }

    const tragedyKeywords = ['death', 'fall', 'betrayal', 'assassination'];
    if (tragedyKeywords.some((k) => topicLower.includes(k))) {
      const tragedyRank = rankings.story_type?.find((s: any) => s.value === 'tragedy');
      if (tragedyRank && tragedyRank.expectedSuccess > 0.5) {
        boost += 8;
      }
    }

    return Math.round(boost);
  }

  private calculateUrgency(gap: ContentGap): 'high' | 'medium' | 'low' {
    if (gap.trendMomentum === 'rising' && gap.ourCoverage === 'none') {
      return 'high';
    }
    if (gap.competitorViews > 100000 && gap.ourCoverage !== 'medium') {
      return 'high';
    }
    if (gap.trendMomentum === 'declining') {
      return 'low';
    }
    return 'medium';
  }

  private isStateStale(): boolean {
    if (!this.state.lastRefresh) return true;
    const lastRefresh = new Date(this.state.lastRefresh);
    const hoursSince = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60);
    return hoursSince > 24;
  }

  async refreshGapAnalysis(): Promise<void> {
    console.log('🔄 Refreshing gap analysis...');
    await this.findContentGaps(30);
    console.log('✅ Gap analysis refresh complete');
  }

  /**
   * Get EXTENSION opportunities - topics competitors are crushing that we've covered
   * but could do better with a fresh angle
   */
  async getExtensionOpportunities(): Promise<Opportunity[]> {
    if (this.state.gaps.length === 0 || this.isStateStale()) {
      await this.findContentGaps();
    }

    const rankings = characterFigureBandit.getAllRankings();

    // Filter for topics we've already covered ('low' or 'medium') but competitors are winning
    let extensionGaps = this.state.gaps.filter(
      (gap) => (gap.ourCoverage === 'low' || gap.ourCoverage === 'medium') && gap.competitorViews > 50000, // Competitors have significant views
    );

    // If no extensions found from AI, use fallback extensions based on common topics
    if (extensionGaps.length === 0) {
      extensionGaps = this.getFallbackExtensions();
    }

    return extensionGaps
      .slice(0, 10)
      .map((gap, index) => {
        const banditBoost = this.calculateBanditBoost(gap, rankings);

        const reasons: string[] = [];
        reasons.push(
          `We covered this (${gap.ourCoverage}) but competitors have ${(gap.competitorViews / 1000).toFixed(0)}K views`,
        );
        if (gap.trendMomentum === 'rising') reasons.push('Topic is rising in popularity');
        if (banditBoost > 5) reasons.push('Matches proven winning attributes');
        reasons.push('Fresh angle could outperform');

        // Generate extension-specific angles
        const extensionAngles = [
          `Deeper dive: ${gap.suggestedAngles[0] || gap.topic}`,
          `Alternative perspective on ${gap.historicalFigures[0] || gap.topic}`,
          `What others missed about ${gap.topic}`,
        ];

        return {
          rank: index + 1,
          topic: gap.topic,
          historicalFigures: gap.historicalFigures,
          score: gap.opportunityScore + banditBoost + 15, // Boost for extension potential
          reasons,
          suggestedAngles: extensionAngles,
          trendMomentum: gap.trendMomentum,
          competitorViews: gap.competitorViews,
          banditBoost,
          urgency: (gap.trendMomentum === 'rising' ? 'high' : 'medium') as 'high' | 'medium' | 'low',
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Get COMBINED opportunities - both gaps AND extensions, sorted by score
   */
  async getAllOpportunities(): Promise<{ gaps: Opportunity[]; extensions: Opportunity[] }> {
    const [gaps, extensions] = await Promise.all([this.getTopOpportunities(), this.getExtensionOpportunities()]);

    return { gaps, extensions };
  }

  private getFallbackGaps(): ContentGap[] {
    return [
      {
        topic: 'Hannibal Barca crossing the Alps',
        historicalFigures: ['Hannibal Barca'],
        competitorViews: 75000,
        ourCoverage: 'none',
        opportunityScore: 85,
        suggestedAngles: [
          'The impossible mountain crossing with war elephants',
          'Genius military tactics against Rome',
          'The man who made Rome tremble',
        ],
        trendMomentum: 'rising',
        source: 'fallback',
        discoveredAt: new Date().toISOString(),
      },
      {
        topic: 'Rasputin and the fall of the Romanovs',
        historicalFigures: ['Rasputin', 'Nicholas II', 'Alexandra'],
        competitorViews: 120000,
        ourCoverage: 'none',
        opportunityScore: 90,
        suggestedAngles: [
          'The mystic who controlled an empire',
          'The night they tried to kill him - 5 times',
          'How one man brought down the Tsars',
        ],
        trendMomentum: 'stable',
        source: 'fallback',
        discoveredAt: new Date().toISOString(),
      },
      {
        topic: "Boudicca's rebellion against Rome",
        historicalFigures: ['Boudicca'],
        competitorViews: 55000,
        ourCoverage: 'none',
        opportunityScore: 82,
        suggestedAngles: [
          'The warrior queen who burned London',
          'Revenge for her daughters',
          "Rome's most feared enemy was a woman",
        ],
        trendMomentum: 'rising',
        source: 'fallback',
        discoveredAt: new Date().toISOString(),
      },
      {
        topic: 'The assassination of Archduke Franz Ferdinand',
        historicalFigures: ['Franz Ferdinand', 'Gavrilo Princip'],
        competitorViews: 95000,
        ourCoverage: 'none',
        opportunityScore: 88,
        suggestedAngles: [
          'The shot that killed 20 million',
          'Wrong turn that changed history',
          'The teenager who started WWI',
        ],
        trendMomentum: 'stable',
        source: 'fallback',
        discoveredAt: new Date().toISOString(),
      },
      {
        topic: "Zheng He's treasure fleet voyages",
        historicalFigures: ['Zheng He'],
        competitorViews: 45000,
        ourCoverage: 'none',
        opportunityScore: 75,
        suggestedAngles: [
          'Ships 5x bigger than Columbus',
          'The eunuch admiral who ruled the seas',
          "China's forgotten age of exploration",
        ],
        trendMomentum: 'rising',
        source: 'fallback',
        discoveredAt: new Date().toISOString(),
      },
    ];
  }

  /**
   * Fallback extension opportunities for common historical topics
   * These are topics we may have covered that competitors typically dominate
   */
  private getFallbackExtensions(): ContentGap[] {
    return [
      {
        topic: 'Alexander the Great - The Complete Conquest',
        historicalFigures: ['Alexander the Great', 'Darius III'],
        competitorViews: 850000,
        ourCoverage: 'low',
        opportunityScore: 92,
        suggestedAngles: [
          'From Macedonia to India in 11 years',
          'The general who never lost a battle',
          'What made his army unstoppable',
        ],
        trendMomentum: 'stable',
        source: 'extension_fallback',
        discoveredAt: new Date().toISOString(),
      },
      {
        topic: 'Cleopatra - More Than Beauty',
        historicalFigures: ['Cleopatra VII', 'Julius Caesar', 'Mark Antony'],
        competitorViews: 720000,
        ourCoverage: 'low',
        opportunityScore: 88,
        suggestedAngles: [
          'The genius queen who spoke 9 languages',
          'Outmaneuvering Rome for 21 years',
          'The real power behind the throne',
        ],
        trendMomentum: 'rising',
        source: 'extension_fallback',
        discoveredAt: new Date().toISOString(),
      },
      {
        topic: 'Julius Caesar - Rise and Fall',
        historicalFigures: ['Julius Caesar', 'Brutus', 'Pompey'],
        competitorViews: 950000,
        ourCoverage: 'medium',
        opportunityScore: 90,
        suggestedAngles: [
          'How one man destroyed the Republic',
          'The 23 stab wounds that changed history',
          'From debt to dictator in 10 years',
        ],
        trendMomentum: 'stable',
        source: 'extension_fallback',
        discoveredAt: new Date().toISOString(),
      },
      {
        topic: 'Napoleon - Military Genius Deep Dive',
        historicalFigures: ['Napoleon Bonaparte'],
        competitorViews: 1100000,
        ourCoverage: 'low',
        opportunityScore: 95,
        suggestedAngles: [
          'The battles that made him a legend',
          'From artillery officer to Emperor of Europe',
          'His greatest tactical innovations',
        ],
        trendMomentum: 'rising',
        source: 'extension_fallback',
        discoveredAt: new Date().toISOString(),
      },
      {
        topic: 'Genghis Khan - Empire Building',
        historicalFigures: ['Genghis Khan', 'Temujin'],
        competitorViews: 800000,
        ourCoverage: 'low',
        opportunityScore: 87,
        suggestedAngles: [
          'From outcast to world conqueror',
          'The psychology of Mongol terror',
          'Revolutionary military tactics',
        ],
        trendMomentum: 'stable',
        source: 'extension_fallback',
        discoveredAt: new Date().toISOString(),
      },
    ];
  }

  getLastRefreshTime(): string | null {
    return this.state.lastRefresh || null;
  }

  getCachedGaps(): ContentGap[] {
    return this.state.gaps;
  }

  isConfigured(): boolean {
    return this.oauth2Client !== null;
  }
}

export const gapDetectionService = new GapDetectionService();
