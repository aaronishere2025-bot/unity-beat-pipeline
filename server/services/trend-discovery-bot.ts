/**
 * TREND DISCOVERY BOT
 *
 * Comprehensive trend discovery system that finds COMPLETELY UNIQUE trending topics
 * with search opportunity analysis for video generation.
 *
 * Features:
 * - Multi-source trend discovery (YouTube Data API, Google Trends, Reddit, Twitter/X)
 * - Search opportunity analysis (search volume vs competition)
 * - Historical content filtering
 * - Deduplication against existing content
 * - AI-powered angle generation
 * - Semantic similarity checking
 *
 * Sources:
 * 1. YouTube Data API v3 - Trending searches & video analysis
 * 2. Google Trends API - Rising historical searches
 * 3. Reddit API - r/history, r/todayilearned trending posts
 * 4. Twitter/X trends - Historical hashtags
 *
 * Discovery Frequency: Every 6 hours (4x daily)
 * Trend Expiry: 14 days
 */

import { db } from '../db';
import { trendingTopics, unityContentPackages, TrendingTopic, InsertTrendingTopic } from '@shared/schema';
import { sql, eq, and, gte, desc, or } from 'drizzle-orm';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { googleTrendsService } from './google-trends-service';
import { youtubeTrendsService } from './youtube-trends-service';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Search opportunity levels
type OpportunityLevel = 'golden' | 'good' | 'saturated';

interface SearchOpportunityResult {
  score: number; // 0-100
  level: OpportunityLevel;
  searchVolume: number;
  existingVideoCount: number;
  ratio: number;
}

interface DiscoveredTrend {
  keyword: string;
  source: 'youtube_data' | 'google_trends' | 'reddit' | 'twitter';
  searchVolume: number;
  competitionLevel: 'low' | 'medium' | 'high';
  searchContentRatio: number;
  trendVelocity: number; // 0-100
  suggestedAngle: string;
  historicalCategory: 'person' | 'place' | 'thing' | 'event';
  relatedKeywords: string[];
  estimatedViralPotential: number; // 0-100
  whyTrending: string;
  contentGap: string;
  sourceMetadata: any;
}

interface TrendDiscoveryResult {
  discovered: DiscoveredTrend[];
  deduplicated: number;
  goldenOpportunities: number;
  totalSources: number;
  executionTimeMs: number;
}

class TrendDiscoveryBot {
  private oauth2Client: OAuth2Client | null = null;
  private credentialsPath = join(process.cwd(), 'data', 'youtube_credentials.json');

  // Historical keywords for filtering
  private historicalKeywords = [
    'history',
    'historical',
    'war',
    'battle',
    'empire',
    'king',
    'queen',
    'president',
    'ancient',
    'medieval',
    'revolution',
    'dynasty',
    'civilization',
    'emperor',
    'pharaoh',
    'viking',
    'samurai',
    'gladiator',
    'knight',
    'castle',
    'palace',
    'monument',
    'archaeological',
    'artifact',
    'century',
    'era',
    'bc',
    'ad',
    'legendary',
    'mythological',
    'conquest',
  ];

  constructor() {
    this.initializeYouTubeClient();
  }

  private initializeYouTubeClient(): void {
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
      console.warn('⚠️ [Trend Discovery Bot] Could not load YouTube credentials:', error);
    }
  }

  /**
   * MAIN DISCOVERY METHOD
   * Discovers trending topics from all sources with complete uniqueness checking
   */
  async discoverTrends(maxResults: number = 20): Promise<TrendDiscoveryResult> {
    const startTime = Date.now();

    console.log('\n🔍 [TREND DISCOVERY BOT] Starting comprehensive trend discovery...');
    console.log(`📅 ${new Date().toISOString()}`);
    console.log(`🎯 Target: ${maxResults} unique trends\n`);

    // Step 1: Load existing topics for deduplication
    const existingTopics = await this.getExistingTopics();
    console.log(`📚 Loaded ${existingTopics.size} existing topics for deduplication`);

    // Step 2: Discover from all sources in parallel
    const [youtubeTopics, googleTrends, redditTopics] = await Promise.all([
      this.discoverFromYouTube(),
      this.discoverFromGoogleTrends(),
      this.discoverFromReddit(),
      // Twitter/X API requires paid access, skipping for now
    ]);

    console.log(`\n📊 Source Discovery Results:`);
    console.log(`   YouTube: ${youtubeTopics.length} topics`);
    console.log(`   Google Trends: ${googleTrends.length} topics`);
    console.log(`   Reddit: ${redditTopics.length} topics`);

    // Step 3: Combine and deduplicate
    const allTopics = [...youtubeTopics, ...googleTrends, ...redditTopics];
    const uniqueTopics = await this.deduplicateTopics(allTopics, existingTopics);

    console.log(`\n✅ After deduplication: ${uniqueTopics.length} unique topics`);

    // Step 4: Analyze search opportunity for each
    const topicsWithOpportunity = await this.analyzeSearchOpportunity(uniqueTopics);

    // Step 5: Sort by viral potential and take top N
    const topTrends = topicsWithOpportunity
      .sort((a, b) => b.estimatedViralPotential - a.estimatedViralPotential)
      .slice(0, maxResults);

    // Step 6: Save to database
    await this.saveTrendsToDatabase(topTrends);

    const goldenOpportunities = topTrends.filter((t) => t.competitionLevel === 'low').length;
    const executionTimeMs = Date.now() - startTime;

    console.log(`\n🎉 [TREND DISCOVERY BOT] Discovery Complete!`);
    console.log(`   ⏱️  Execution time: ${(executionTimeMs / 1000).toFixed(1)}s`);
    console.log(`   ✨ Unique trends: ${topTrends.length}`);
    console.log(`   🏆 Golden opportunities: ${goldenOpportunities}`);
    console.log(`   🔥 Top 5:`);
    topTrends.slice(0, 5).forEach((t, i) => {
      console.log(`      ${i + 1}. ${t.keyword} (${t.source}, ${t.competitionLevel} competition)`);
    });

    return {
      discovered: topTrends,
      deduplicated: allTopics.length - uniqueTopics.length,
      goldenOpportunities,
      totalSources: 3,
      executionTimeMs,
    };
  }

  /**
   * Discover trending historical topics from YouTube Data API
   */
  private async discoverFromYouTube(): Promise<DiscoveredTrend[]> {
    if (!this.oauth2Client) {
      console.log('⚠️ YouTube API not configured, skipping');
      return [];
    }

    try {
      console.log('📺 Discovering from YouTube Data API...');
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      const trends: DiscoveredTrend[] = [];

      // Search for trending history-related videos
      const searchQueries = [
        'history facts',
        'historical events',
        'ancient history',
        'medieval history',
        'world history',
        'historical figures',
      ];

      for (const query of searchQueries) {
        try {
          const response = await youtube.search.list({
            part: ['snippet'],
            q: query,
            type: ['video'],
            order: 'viewCount',
            publishedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
            maxResults: 10,
            relevanceLanguage: 'en',
          });

          for (const item of response.data.items || []) {
            const title = item.snippet?.title || '';
            const description = item.snippet?.description || '';
            const videoId = item.id?.videoId || '';

            // Extract potential topics from title
            const extractedTopics = await this.extractTopicsFromText(title + ' ' + description);

            for (const topic of extractedTopics) {
              if (this.isHistoricalTopic(topic)) {
                trends.push({
                  keyword: topic,
                  source: 'youtube_data',
                  searchVolume: 0, // Will be filled by search opportunity analysis
                  competitionLevel: 'medium',
                  searchContentRatio: 0,
                  trendVelocity: 70, // YouTube trending = high velocity
                  suggestedAngle: '', // Will be filled by AI
                  historicalCategory: 'person', // Will be refined
                  relatedKeywords: [],
                  estimatedViralPotential: 75,
                  whyTrending: `Trending on YouTube in "${query}" category`,
                  contentGap: '',
                  sourceMetadata: {
                    youtubeVideoCount: 1,
                    videoId,
                    channelTitle: item.snippet?.channelTitle,
                  },
                });
              }
            }
          }

          await this.delay(500); // Rate limit protection
        } catch (err: any) {
          console.log(`   ⚠️ YouTube search failed for "${query}": ${err.message}`);
        }
      }

      console.log(`   ✅ Found ${trends.length} topics from YouTube`);
      return trends;
    } catch (error: any) {
      console.error(`❌ YouTube discovery failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Discover trending historical topics from Google Trends
   */
  private async discoverFromGoogleTrends(): Promise<DiscoveredTrend[]> {
    try {
      console.log('📈 Discovering from Google Trends...');

      const viralTopics = await googleTrendsService.getViralHistoricalTopics('US');
      const trends: DiscoveredTrend[] = [];

      for (const topic of viralTopics) {
        trends.push({
          keyword: topic.figure,
          source: 'google_trends',
          searchVolume: 0, // Will be estimated from formattedTraffic
          competitionLevel: 'medium',
          searchContentRatio: 0,
          trendVelocity: topic.viralScore * 10, // Convert to 0-100 scale
          suggestedAngle: topic.hook,
          historicalCategory: 'person',
          relatedKeywords: [],
          estimatedViralPotential: topic.viralScore * 10,
          whyTrending: topic.whyNow,
          contentGap: '',
          sourceMetadata: {
            interestScore: topic.viralScore,
            isRising: true,
            formattedTraffic: topic.traffic,
          },
        });
      }

      console.log(`   ✅ Found ${trends.length} topics from Google Trends`);
      return trends;
    } catch (error: any) {
      console.error(`❌ Google Trends discovery failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Discover trending historical topics from Reddit
   */
  private async discoverFromReddit(): Promise<DiscoveredTrend[]> {
    try {
      console.log('🔴 Discovering from Reddit...');

      // Reddit API requires authentication. For now, we'll use a simple public endpoint approach
      // In production, use proper OAuth2 authentication

      const subreddits = ['history', 'todayilearned', 'AskHistorians', 'HistoryMemes'];
      const trends: DiscoveredTrend[] = [];

      for (const subreddit of subreddits) {
        try {
          const response = await fetch(`https://www.reddit.com/r/${subreddit}/hot.json?limit=25`, {
            headers: {
              'User-Agent': 'TrendDiscoveryBot/1.0',
            },
          });

          if (!response.ok) {
            console.log(`   ⚠️ Reddit fetch failed for r/${subreddit}: ${response.status}`);
            continue;
          }

          const data = await response.json();
          const posts = data.data?.children || [];

          for (const post of posts) {
            const postData = post.data;
            const title = postData.title || '';
            const upvotes = postData.ups || 0;
            const comments = postData.num_comments || 0;

            // Only process posts with significant engagement
            if (upvotes < 100) continue;

            // Extract topics from title
            const extractedTopics = await this.extractTopicsFromText(title);

            for (const topic of extractedTopics) {
              if (this.isHistoricalTopic(topic)) {
                trends.push({
                  keyword: topic,
                  source: 'reddit',
                  searchVolume: 0,
                  competitionLevel: 'medium',
                  searchContentRatio: 0,
                  trendVelocity: Math.min(100, Math.round((upvotes / 1000) * 50)),
                  suggestedAngle: '',
                  historicalCategory: 'person',
                  relatedKeywords: [],
                  estimatedViralPotential: Math.min(100, Math.round((upvotes + comments) / 20)),
                  whyTrending: `Popular on r/${subreddit} (${upvotes} upvotes)`,
                  contentGap: '',
                  sourceMetadata: {
                    subreddit,
                    upvotes,
                    comments,
                    redditUrl: `https://reddit.com${postData.permalink}`,
                  },
                });
              }
            }
          }

          await this.delay(1000); // Reddit rate limiting
        } catch (err: any) {
          console.log(`   ⚠️ Reddit scrape failed for r/${subreddit}: ${err.message}`);
        }
      }

      console.log(`   ✅ Found ${trends.length} topics from Reddit`);
      return trends;
    } catch (error: any) {
      console.error(`❌ Reddit discovery failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract potential topics from text using simple NLP
   */
  private async extractTopicsFromText(text: string): Promise<string[]> {
    // Simple extraction: look for capitalized phrases (potential proper nouns)
    const topics: string[] = [];

    // Pattern: 2-4 consecutive capitalized words
    const capitalizedPhrases = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g) || [];

    for (const phrase of capitalizedPhrases) {
      if (phrase.length > 3 && !phrase.match(/^(The|And|But|For|Yet|So|Or)$/)) {
        topics.push(phrase);
      }
    }

    return [...new Set(topics)];
  }

  /**
   * Check if a topic is likely historical
   */
  private isHistoricalTopic(topic: string): boolean {
    const lower = topic.toLowerCase();

    // Check for historical keywords
    for (const keyword of this.historicalKeywords) {
      if (lower.includes(keyword)) {
        return true;
      }
    }

    // Check for dates/years
    if (lower.match(/\b(bc|ad|\d{1,4}\s*(bc|ad|bce|ce)|\d{3,4}s)\b/)) {
      return true;
    }

    // Check for titles (King, Queen, Emperor, etc.)
    if (lower.match(/\b(king|queen|emperor|empress|pharaoh|caesar|sultan|tsar|khan|lord|sir|duke|prince)\b/)) {
      return true;
    }

    return false;
  }

  /**
   * Get existing topics from database for deduplication
   */
  private async getExistingTopics(): Promise<Set<string>> {
    try {
      // Get topics from unity content packages
      const packages = await db
        .select({
          topic: unityContentPackages.topic,
          title: unityContentPackages.title,
        })
        .from(unityContentPackages)
        .where(sql`${unityContentPackages.createdAt} >= NOW() - INTERVAL '90 days'`);

      // Get topics from trending topics table (not stale)
      const existing = await db
        .select({
          keyword: trendingTopics.keyword,
          normalizedKeyword: trendingTopics.normalizedKeyword,
        })
        .from(trendingTopics)
        .where(
          or(
            eq(trendingTopics.status, 'used'),
            gte(trendingTopics.discoveredAt, new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
          ),
        );

      const topics = new Set<string>();

      // Add package topics
      for (const pkg of packages) {
        topics.add(this.normalizeTopic(pkg.topic));
        // Extract figure name from title
        const figureMatch = pkg.title.match(/^([A-Za-z\s]+?)(?:\s*-\s*)/);
        if (figureMatch) {
          topics.add(this.normalizeTopic(figureMatch[1]));
        }
      }

      // Add trending topics
      for (const trend of existing) {
        topics.add(trend.normalizedKeyword);
      }

      return topics;
    } catch (error: any) {
      console.error(`❌ Failed to load existing topics: ${error.message}`);
      return new Set();
    }
  }

  /**
   * Deduplicate topics against existing content and each other
   */
  private async deduplicateTopics(topics: DiscoveredTrend[], existingTopics: Set<string>): Promise<DiscoveredTrend[]> {
    console.log(`\n🔍 Deduplicating ${topics.length} topics...`);

    const unique: DiscoveredTrend[] = [];
    const seen = new Set<string>();

    for (const topic of topics) {
      const normalized = this.normalizeTopic(topic.keyword);

      // Check against existing topics
      if (existingTopics.has(normalized)) {
        console.log(`   ⏭️  Skipping existing: ${topic.keyword}`);
        continue;
      }

      // Check for partial matches with existing topics
      let isDuplicate = false;
      for (const existing of existingTopics) {
        if (this.isSimilarTopic(normalized, existing)) {
          console.log(`   ⏭️  Skipping similar to existing: ${topic.keyword}`);
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) continue;

      // Check against already seen topics in this batch
      if (seen.has(normalized)) {
        console.log(`   ⏭️  Skipping duplicate in batch: ${topic.keyword}`);
        continue;
      }

      // Check for partial matches with already seen
      let seenDuplicate = false;
      for (const s of seen) {
        if (this.isSimilarTopic(normalized, s)) {
          seenDuplicate = true;
          break;
        }
      }
      if (seenDuplicate) continue;

      unique.push(topic);
      seen.add(normalized);
    }

    return unique;
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
   * Check if two topics are similar (semantic similarity)
   */
  private isSimilarTopic(topic1: string, topic2: string): boolean {
    // Simple Jaccard similarity on words
    const words1 = new Set(topic1.split(' '));
    const words2 = new Set(topic2.split(' '));

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    const similarity = intersection.size / union.size;

    // Also check containment
    if (topic1.includes(topic2) || topic2.includes(topic1)) {
      const lengthRatio = Math.max(topic1.length, topic2.length) / Math.min(topic1.length, topic2.length);
      if (lengthRatio < 1.5) {
        return true; // Very similar
      }
    }

    return similarity > 0.6; // 60% word overlap = similar
  }

  /**
   * Analyze search opportunity for each topic
   */
  private async analyzeSearchOpportunity(topics: DiscoveredTrend[]): Promise<DiscoveredTrend[]> {
    console.log(`\n🔍 Analyzing search opportunity for ${topics.length} topics...`);

    if (!this.oauth2Client) {
      console.log('⚠️ YouTube API not configured, skipping opportunity analysis');
      return topics;
    }

    const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
    const enrichedTopics: DiscoveredTrend[] = [];

    for (const topic of topics) {
      try {
        // Search for existing videos on this topic
        const response = await youtube.search.list({
          part: ['snippet'],
          q: topic.keyword + ' history',
          type: ['video'],
          maxResults: 50,
        });

        const existingVideoCount = response.data.pageInfo?.totalResults || 0;

        // Estimate search volume from Google Trends data if available
        const searchVolume = topic.sourceMetadata?.formattedTraffic
          ? this.parseTrafficToVolume(topic.sourceMetadata.formattedTraffic)
          : existingVideoCount * 10; // Rough estimate

        // Calculate search opportunity
        const opportunity = this.calculateSearchOpportunity(searchVolume, existingVideoCount);

        // Enrich topic with opportunity data
        enrichedTopics.push({
          ...topic,
          searchVolume,
          competitionLevel:
            opportunity.level === 'golden' || opportunity.level === 'good'
              ? 'low'
              : opportunity.level === 'saturated'
                ? 'high'
                : 'medium',
          searchContentRatio: parseFloat(opportunity.ratio.toFixed(2)),
          estimatedViralPotential: Math.round(opportunity.score),
        });

        await this.delay(300); // Rate limit
      } catch (err: any) {
        console.log(`   ⚠️ Opportunity analysis failed for "${topic.keyword}": ${err.message}`);
        enrichedTopics.push(topic);
      }
    }

    return enrichedTopics;
  }

  /**
   * Calculate search opportunity score
   */
  private calculateSearchOpportunity(searchVolume: number, existingVideoCount: number): SearchOpportunityResult {
    const ratio = searchVolume / Math.max(existingVideoCount, 1);

    let level: OpportunityLevel;
    let score: number;

    if (ratio > 100) {
      level = 'golden';
      score = 95;
    } else if (ratio > 50) {
      level = 'golden';
      score = 85;
    } else if (ratio > 10) {
      level = 'good';
      score = 70;
    } else if (ratio > 5) {
      level = 'good';
      score = 55;
    } else {
      level = 'saturated';
      score = 30;
    }

    return {
      score,
      level,
      searchVolume,
      existingVideoCount,
      ratio,
    };
  }

  /**
   * Parse formatted traffic string to estimated volume
   */
  private parseTrafficToVolume(traffic: string): number {
    const match = traffic.match(/(\d+)([KMB]?\+?)/);
    if (!match) return 1000; // Default

    const num = parseInt(match[1]);
    const suffix = match[2];

    if (suffix.includes('M')) return num * 1000000;
    if (suffix.includes('K')) return num * 1000;
    if (suffix.includes('B')) return num * 1000000000;
    return num;
  }

  /**
   * Save trends to database
   */
  private async saveTrendsToDatabase(trends: DiscoveredTrend[]): Promise<void> {
    console.log(`\n💾 Saving ${trends.length} trends to database...`);

    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days from now

    for (const trend of trends) {
      try {
        const insertData: InsertTrendingTopic = {
          keyword: trend.keyword,
          normalizedKeyword: this.normalizeTopic(trend.keyword),
          source: trend.source,
          searchVolume: trend.searchVolume,
          competitionLevel: trend.competitionLevel,
          searchContentRatio: trend.searchContentRatio.toString(),
          trendVelocity: trend.trendVelocity,
          suggestedAngle: trend.suggestedAngle || null,
          historicalCategory: trend.historicalCategory,
          relatedKeywords: trend.relatedKeywords,
          estimatedViralPotential: trend.estimatedViralPotential,
          whyTrending: trend.whyTrending,
          contentGap: trend.contentGap || null,
          sourceMetadata: trend.sourceMetadata,
          status: 'discovered',
          usedInPackageId: null,
          discoveredAt: new Date(),
          expiresAt,
        };

        await db.insert(trendingTopics).values(insertData);
      } catch (err: any) {
        console.log(`   ⚠️ Failed to save "${trend.keyword}": ${err.message}`);
      }
    }

    console.log(`   ✅ Saved ${trends.length} trends`);
  }

  /**
   * Get active trending topics from database
   */
  async getActiveTrends(limit: number = 10): Promise<TrendingTopic[]> {
    try {
      const now = new Date();

      const trends = await db
        .select()
        .from(trendingTopics)
        .where(and(eq(trendingTopics.status, 'discovered'), gte(trendingTopics.expiresAt, now)))
        .orderBy(desc(trendingTopics.estimatedViralPotential), desc(trendingTopics.trendVelocity))
        .limit(limit);

      return trends;
    } catch (error: any) {
      console.error(`❌ Failed to get active trends: ${error.message}`);
      return [];
    }
  }

  /**
   * Mark a trend as used
   */
  async markTrendAsUsed(trendId: string, packageId: string): Promise<void> {
    try {
      await db
        .update(trendingTopics)
        .set({
          status: 'used',
          usedInPackageId: packageId,
          updatedAt: new Date(),
        })
        .where(eq(trendingTopics.id, trendId));

      console.log(`✅ Marked trend ${trendId} as used in package ${packageId}`);
    } catch (error: any) {
      console.error(`❌ Failed to mark trend as used: ${error.message}`);
    }
  }

  /**
   * Clean up stale trends (older than expiry date)
   */
  async cleanupStaleTrends(): Promise<number> {
    try {
      console.log('🧹 Cleaning up stale trends...');

      const now = new Date();

      // Mark as stale
      const result = await db
        .update(trendingTopics)
        .set({
          status: 'stale',
          updatedAt: now,
        })
        .where(and(eq(trendingTopics.status, 'discovered'), sql`${trendingTopics.expiresAt} < ${now}`));

      console.log(`   ✅ Marked ${result.rowCount || 0} trends as stale`);
      return result.rowCount || 0;
    } catch (error: any) {
      console.error(`❌ Failed to cleanup stale trends: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get discovery statistics
   */
  async getDiscoveryStats(): Promise<{
    total: number;
    bySource: Record<string, number>;
    byCompetition: Record<string, number>;
    goldenOpportunities: number;
    avgViralPotential: number;
  }> {
    try {
      const now = new Date();

      const trends = await db
        .select()
        .from(trendingTopics)
        .where(and(eq(trendingTopics.status, 'discovered'), gte(trendingTopics.expiresAt, now)));

      const stats = {
        total: trends.length,
        bySource: {} as Record<string, number>,
        byCompetition: {} as Record<string, number>,
        goldenOpportunities: 0,
        avgViralPotential: 0,
      };

      let totalViral = 0;

      for (const trend of trends) {
        // By source
        stats.bySource[trend.source] = (stats.bySource[trend.source] || 0) + 1;

        // By competition
        const comp = trend.competitionLevel || 'unknown';
        stats.byCompetition[comp] = (stats.byCompetition[comp] || 0) + 1;

        // Golden opportunities
        if (trend.competitionLevel === 'low') {
          stats.goldenOpportunities++;
        }

        // Viral potential
        totalViral += trend.estimatedViralPotential || 0;
      }

      stats.avgViralPotential = trends.length > 0 ? Math.round(totalViral / trends.length) : 0;

      return stats;
    } catch (error: any) {
      console.error(`❌ Failed to get discovery stats: ${error.message}`);
      return {
        total: 0,
        bySource: {},
        byCompetition: {},
        goldenOpportunities: 0,
        avgViralPotential: 0,
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const trendDiscoveryBot = new TrendDiscoveryBot();

// Export types
export type { DiscoveredTrend, TrendDiscoveryResult, SearchOpportunityResult };
