/**
 * Google Trends Service
 *
 * Fetches real trending data from Google Trends to identify
 * viral-worthy historical topics for video content.
 */

// @ts-ignore - no declaration file for google-trends-api
import googleTrends from 'google-trends-api';

export interface TrendingTopic {
  title: string;
  formattedTraffic: string;
  relatedQueries: string[];
  articles: Array<{
    title: string;
    source: string;
    url: string;
  }>;
}

export interface DailyTrendsResult {
  date: string;
  topics: TrendingTopic[];
}

export interface HistoricalTrendData {
  keyword: string;
  interestScore: number;
  isRising: boolean;
  relatedTopics: string[];
}

class GoogleTrendsService {
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get daily trending searches (top 20 from past 24 hours)
   * This gives us what's actually trending RIGHT NOW
   */
  async getDailyTrends(geo: string = 'US'): Promise<DailyTrendsResult[]> {
    try {
      console.log(`📈 Fetching daily trends for ${geo}...`);

      // Add retry logic with delay
      let results: string | null = null;
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          if (attempt > 1) {
            await this.delay(1000 * attempt); // Increasing delay between retries
          }

          results = await googleTrends.dailyTrends({
            geo,
            trendDate: new Date(),
            hl: 'en-US',
          });

          // Check if response is valid JSON (not HTML captcha page)
          if (results && !results.startsWith('<!')) {
            break;
          } else {
            throw new Error('Received HTML instead of JSON (possible rate limit)');
          }
        } catch (attemptError: any) {
          lastError = attemptError;
          console.log(`   ⚠️ Attempt ${attempt}/3 failed: ${attemptError.message}`);
        }
      }

      if (!results || results.startsWith('<!')) {
        throw lastError || new Error('All attempts failed');
      }

      const parsed = JSON.parse(results);
      const trendingDays = parsed.default?.trendingSearchesDays || [];

      const formattedResults: DailyTrendsResult[] = trendingDays.map((day: any) => ({
        date: day.date,
        topics: (day.trendingSearches || []).map((search: any) => ({
          title: search.title?.query || search.query || '',
          formattedTraffic: search.formattedTraffic || '',
          relatedQueries: (search.relatedQueries || []).map((q: any) => q.query),
          articles: (search.articles || []).map((article: any) => ({
            title: article.title || '',
            source: article.source || '',
            url: article.url || '',
          })),
        })),
      }));

      console.log(`   ✅ Found ${formattedResults[0]?.topics?.length || 0} trending topics`);
      return formattedResults;
    } catch (error: any) {
      console.error('❌ Daily trends fetch failed:', error.message);
      return [];
    }
  }

  /**
   * Get real-time trending stories
   * These are actively trending news/topics
   */
  async getRealTimeTrends(geo: string = 'US', category: string = 'all'): Promise<TrendingTopic[]> {
    try {
      console.log(`📈 Fetching real-time trends for ${geo}...`);

      const results = await googleTrends.realTimeTrends({
        geo,
        category,
      });

      const parsed = JSON.parse(results);
      const stories = parsed.storySummaries?.trendingStories || [];

      const topics: TrendingTopic[] = stories.map((story: any) => ({
        title: story.title || story.entityNames?.[0] || '',
        formattedTraffic: '',
        relatedQueries: story.entityNames || [],
        articles: (story.articles || []).map((article: any) => ({
          title: article.articleTitle || '',
          source: article.source || '',
          url: article.url || '',
        })),
      }));

      console.log(`   ✅ Found ${topics.length} real-time trending stories`);
      return topics;
    } catch (error: any) {
      console.error('❌ Real-time trends fetch failed:', error.message);
      return [];
    }
  }

  /**
   * Check if a specific keyword is trending and get related queries
   */
  async getKeywordTrend(keyword: string, geo: string = 'US'): Promise<HistoricalTrendData | null> {
    try {
      const endDate = new Date();
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Past 7 days

      const [interestResult, relatedResult] = await Promise.all([
        googleTrends.interestOverTime({
          keyword,
          startTime: startDate,
          endTime: endDate,
          geo,
        }),
        googleTrends.relatedQueries({
          keyword,
          geo,
        }),
      ]);

      // Check if we got HTML instead of JSON (rate limit or captcha)
      if (typeof interestResult === 'string' && interestResult.trim().startsWith('<')) {
        // Google is returning HTML (rate limited), return null silently
        return null;
      }
      if (typeof relatedResult === 'string' && relatedResult.trim().startsWith('<')) {
        return null;
      }

      const interestData = JSON.parse(interestResult);
      const relatedData = JSON.parse(relatedResult);

      const timelineData = interestData.default?.timelineData || [];
      const lastFew = timelineData.slice(-3);
      const firstFew = timelineData.slice(0, 3);

      const avgRecent = lastFew.reduce((sum: number, d: any) => sum + (d.value?.[0] || 0), 0) / (lastFew.length || 1);
      const avgEarlier =
        firstFew.reduce((sum: number, d: any) => sum + (d.value?.[0] || 0), 0) / (firstFew.length || 1);

      const relatedTopics = (relatedData.default?.rankedList?.[0]?.rankedKeyword || [])
        .slice(0, 5)
        .map((item: any) => item.query);

      return {
        keyword,
        interestScore: Math.round(avgRecent),
        isRising: avgRecent > avgEarlier,
        relatedTopics,
      };
    } catch (error: any) {
      // Only log if it's not a rate limit / HTML response error
      if (!error.message?.includes('is not valid JSON')) {
        console.error(`❌ Keyword trend fetch failed for "${keyword}":`, error.message);
      }
      return null;
    }
  }

  /**
   * Filter daily trends for history-related topics
   * Uses keywords to identify historical content
   */
  async getHistoricalTrends(geo: string = 'US'): Promise<TrendingTopic[]> {
    const historicalKeywords = [
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
      'civil war',
      'world war',
      'wwii',
      'wwi',
      'documentary',
      'biography',
      'museum',
      'artifact',
      'discovery',
      'archaeological',
      'century',
      'era',
      'civilization',
      'emperor',
      'pharaoh',
    ];

    const famousHistoricalFigures = [
      'napoleon',
      'cleopatra',
      'caesar',
      'alexander',
      'lincoln',
      'washington',
      'churchill',
      'hitler',
      'stalin',
      'genghis khan',
      'julius caesar',
      'marie antoinette',
      'elizabeth',
      'henry viii',
      'vikings',
      'samurai',
      'gladiator',
      'spartan',
      'roman',
      'greek',
      'egyptian',
      'aztec',
      'mayan',
      'oppenheimer',
      'einstein',
      'tesla',
      'edison',
      'darwin',
      'newton',
    ];

    try {
      const dailyTrends = await this.getDailyTrends(geo);

      if (dailyTrends.length === 0) {
        return [];
      }

      const allTopics = dailyTrends.flatMap((day) => day.topics);

      // Filter for history-related topics
      const historicalTopics = allTopics.filter((topic) => {
        const lowerTitle = topic.title.toLowerCase();
        const lowerArticles = topic.articles.map((a) => a.title.toLowerCase()).join(' ');
        const combined = `${lowerTitle} ${lowerArticles}`;

        // Check if any historical keyword matches
        const hasHistoricalKeyword = historicalKeywords.some((kw) => combined.includes(kw));
        const hasFamousFigure = famousHistoricalFigures.some((fig) => combined.includes(fig));

        return hasHistoricalKeyword || hasFamousFigure;
      });

      console.log(`   🏛️ Found ${historicalTopics.length} history-related trends`);
      return historicalTopics;
    } catch (error: any) {
      console.error('❌ Historical trends fetch failed:', error.message);
      return [];
    }
  }

  /**
   * Get trending topics and enhance with AI analysis for video potential
   * Returns topics formatted for the automation system
   */
  async getViralHistoricalTopics(geo: string = 'US'): Promise<
    Array<{
      figure: string;
      event: string;
      hook: string;
      whyNow: string;
      viralScore: number;
      source: string;
      traffic?: string;
    }>
  > {
    try {
      // Get both daily trends and historical-filtered trends
      const [dailyTrends, historicalTrends] = await Promise.all([
        this.getDailyTrends(geo),
        this.getHistoricalTrends(geo),
      ]);

      const topics: Array<{
        figure: string;
        event: string;
        hook: string;
        whyNow: string;
        viralScore: number;
        source: string;
        traffic?: string;
      }> = [];

      // Process historical trends first (they're more relevant)
      for (const trend of historicalTrends.slice(0, 5)) {
        const articleContext = trend.articles[0]?.title || '';

        topics.push({
          figure: trend.title,
          event: articleContext || `Trending topic about ${trend.title}`,
          hook: `${trend.title} is trending right now - here's why`,
          whyNow: `Currently trending on Google with ${trend.formattedTraffic || 'high'} searches`,
          viralScore: 9, // High score because it's actually trending
          source: 'google_trends',
          traffic: trend.formattedTraffic,
        });
      }

      // Add top general trends that could have historical angles
      const allDailyTopics = dailyTrends.flatMap((d) => d.topics);
      for (const trend of allDailyTopics.slice(0, 10)) {
        // Skip if already added
        if (topics.some((t) => t.figure.toLowerCase() === trend.title.toLowerCase())) {
          continue;
        }

        topics.push({
          figure: trend.title,
          event: trend.articles[0]?.title || `Trending: ${trend.title}`,
          hook: `Why ${trend.title} is going viral right now`,
          whyNow: `${trend.formattedTraffic || 'Trending'} searches in the past 24 hours`,
          viralScore: 8,
          source: 'google_trends_daily',
          traffic: trend.formattedTraffic,
        });
      }

      console.log(`✅ Prepared ${topics.length} topics from Google Trends`);
      return topics;
    } catch (error: any) {
      console.error('❌ Viral historical topics fetch failed:', error.message);
      return [];
    }
  }
}

export const googleTrendsService = new GoogleTrendsService();
