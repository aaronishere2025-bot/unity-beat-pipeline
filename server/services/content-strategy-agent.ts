/**
 * CONTENT STRATEGY AGENT
 *
 * Makes high-level decisions about what videos to create next based on:
 * - Comment sentiment (audience requests, character mentions)
 * - Creative analytics (winning patterns)
 * - Trend watcher (breakout topics)
 * - Posting time bandit (optimal timing)
 *
 * Generates daily content plans and executes them through the autonomous goal agent.
 */

import { db } from '../db';
import { contentPlans, InsertContentPlan, systemConfiguration } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface VideoPlanning {
  figure: string;
  theme: string;
  format: 'shorts' | 'long_form';
  scheduledTime: string;
  estimatedCost: number;
  reasoning: string;
  packageId?: string;
  jobId?: string;
  executed?: boolean;
}

export interface DailyContentPlan {
  id?: string;
  date: string;
  videos: VideoPlanning[];
  totalCost: number;
  status: 'planned' | 'executing' | 'completed' | 'failed';
  createdBy?: string;
}

export interface ContentDemand {
  requestedFigures: Array<{ figure: string; score: number; source: string }>;
  highSentimentCharacters: Array<{ character: string; sentiment: number; mentions: number }>;
  trendingTopics: Array<{ topic: string; velocity: number }>;
}

// ============================================================================
// CONTENT STRATEGY AGENT CLASS
// ============================================================================

class ContentStrategyAgent {
  /**
   * Generate daily content plan for next 24 hours
   */
  async generateDailyPlan(
    options: {
      date?: string;
      videoCount?: number;
      maxDailyCost?: number;
    } = {},
  ): Promise<DailyContentPlan> {
    const date = options.date || this.getTomorrowDate();
    const videoCount = options.videoCount || 5; // 4 shorts + 1 long-form
    const maxDailyCost = options.maxDailyCost || 15; // $15 daily budget

    console.log(`[Content Strategy] Generating plan for ${date}, ${videoCount} videos, max cost $${maxDailyCost}`);

    // Step 1: Analyze content demand from all sources
    const demand = await this.analyzeContentDemand();

    // Step 2: Select figures for videos
    const selectedFigures = await this.selectFigures(demand, videoCount);

    // Step 3: Determine optimal posting times
    const postingSchedule = await this.determineOptimalTiming(videoCount);

    // Step 4: Create video plans
    const videos: VideoPlanning[] = [];
    let totalCost = 0;

    for (let i = 0; i < selectedFigures.length; i++) {
      const figure = selectedFigures[i];
      const format: 'shorts' | 'long_form' = i === 0 ? 'long_form' : 'shorts'; // First is long-form
      const estimatedCost = format === 'long_form' ? 3.5 : 2.6; // Rough estimates

      if (totalCost + estimatedCost > maxDailyCost) {
        console.log(`[Content Strategy] Budget limit reached at ${videos.length} videos`);
        break;
      }

      videos.push({
        figure: figure.figure,
        theme: figure.theme,
        format,
        scheduledTime: postingSchedule[i] || '18:00',
        estimatedCost,
        reasoning: figure.reasoning,
      });

      totalCost += estimatedCost;
    }

    // Step 5: Save plan to database
    const plan: DailyContentPlan = {
      date,
      videos,
      totalCost,
      status: 'planned',
      createdBy: 'content-strategy-agent',
    };

    const [savedPlan] = await db.insert(contentPlans).values(plan).returning();

    console.log(`[Content Strategy] Plan created: ${videos.length} videos, $${totalCost.toFixed(2)} total cost`);

    return {
      ...plan,
      id: savedPlan.id,
    };
  }

  /**
   * Analyze content demand from all learning systems
   */
  private async analyzeContentDemand(): Promise<ContentDemand> {
    const demand: ContentDemand = {
      requestedFigures: [],
      highSentimentCharacters: [],
      trendingTopics: [],
    };

    // Get comment sentiment data
    try {
      const { commentSentimentLoop } = await import('./comment-sentiment-loop');
      const sentiment = commentSentimentLoop.getAggregatedSentiment?.();

      if (sentiment) {
        // Add explicit requests
        for (const request of sentiment.contentRequests) {
          demand.requestedFigures.push({
            figure: request,
            score: 10, // High priority for direct requests
            source: 'user_request',
          });
        }

        // Add high sentiment characters
        demand.highSentimentCharacters = sentiment.topCharacters.filter((c) => c.sentiment > 0.6 && c.mentions > 10);
      }
    } catch (error) {
      console.warn('[Content Strategy] Could not load comment sentiment:', error);
    }

    // Get trending topics
    try {
      const trendWatcherModule = await import('./trend-watcher-agent');
      const trendWatcherAgent = (trendWatcherModule as any).trendWatcherAgent;
      const topics = (await trendWatcherAgent?.getBreakoutTopics?.()) || [];

      demand.trendingTopics = topics.map((t: any) => ({
        topic: t.topic || t.query || t,
        velocity: t.velocity || t.score || 1.0,
      }));
    } catch (error) {
      console.warn('[Content Strategy] Could not load trending topics:', error);
    }

    return demand;
  }

  /**
   * Select figures for videos based on demand and diversity
   */
  private async selectFigures(
    demand: ContentDemand,
    count: number,
  ): Promise<Array<{ figure: string; theme: string; reasoning: string }>> {
    const selected: Array<{ figure: string; theme: string; reasoning: string }> = [];

    // Get character priorities from configuration
    const config = await db
      .select()
      .from(systemConfiguration)
      .where(eq(systemConfiguration.key, 'characterPriorities'))
      .limit(1);

    const priorities: Record<string, number> = (config[0]?.value as any)?.characterPriorities || {};

    // Score all potential figures
    const scores: Array<{ figure: string; score: number; sources: string[] }> = [];

    // Add user requests (highest priority)
    for (const req of demand.requestedFigures) {
      const existingIdx = scores.findIndex((s) => s.figure.toLowerCase() === req.figure.toLowerCase());
      if (existingIdx >= 0) {
        scores[existingIdx].score += req.score;
        scores[existingIdx].sources.push(req.source);
      } else {
        scores.push({
          figure: req.figure,
          score: req.score,
          sources: [req.source],
        });
      }
    }

    // Add high sentiment characters
    for (const char of demand.highSentimentCharacters) {
      const existingIdx = scores.findIndex((s) => s.figure.toLowerCase() === char.character.toLowerCase());
      const sentimentScore = char.sentiment * Math.log10(char.mentions + 1) * 5; // Scale by mentions

      if (existingIdx >= 0) {
        scores[existingIdx].score += sentimentScore;
        scores[existingIdx].sources.push('high_sentiment');
      } else {
        scores.push({
          figure: char.character,
          score: sentimentScore,
          sources: ['high_sentiment'],
        });
      }
    }

    // Add trending topics
    for (const topic of demand.trendingTopics) {
      const existingIdx = scores.findIndex((s) => s.figure.toLowerCase() === topic.topic.toLowerCase());
      const trendScore = topic.velocity * 3; // Scale trend velocity

      if (existingIdx >= 0) {
        scores[existingIdx].score += trendScore;
        scores[existingIdx].sources.push('trending');
      } else {
        scores.push({
          figure: topic.topic,
          score: trendScore,
          sources: ['trending'],
        });
      }
    }

    // Apply character priority boosts
    for (const score of scores) {
      const priority = priorities[score.figure] || 1.0;
      score.score *= priority;
    }

    // Sort by score and select top N
    scores.sort((a, b) => b.score - a.score);

    for (let i = 0; i < Math.min(count, scores.length); i++) {
      const item = scores[i];

      // Determine theme based on sources
      let theme = 'The incredible story of ' + item.figure;
      if (item.sources.includes('user_request')) {
        theme = 'By popular demand: ' + item.figure;
      } else if (item.sources.includes('trending')) {
        theme = 'Trending now: ' + item.figure;
      }

      selected.push({
        figure: item.figure,
        theme,
        reasoning: `Score: ${item.score.toFixed(2)}, Sources: ${item.sources.join(', ')}`,
      });
    }

    // If we don't have enough, add some defaults
    const defaults = [
      'Julius Caesar',
      'Cleopatra',
      'Napoleon',
      'Alexander the Great',
      'Joan of Arc',
      'Leonardo da Vinci',
      'Queen Elizabeth I',
    ];

    while (selected.length < count) {
      const randomFigure = defaults[Math.floor(Math.random() * defaults.length)];
      if (!selected.find((s) => s.figure.toLowerCase() === randomFigure.toLowerCase())) {
        selected.push({
          figure: randomFigure,
          theme: 'The incredible story of ' + randomFigure,
          reasoning: 'Fallback selection - proven historical figure',
        });
      }
    }

    return selected;
  }

  /**
   * Determine optimal posting times using posting time bandit
   */
  private async determineOptimalTiming(count: number): Promise<string[]> {
    const times: string[] = [];

    try {
      const { postingTimeBandit } = await import('./posting-time-bandit');

      for (let i = 0; i < count; i++) {
        const format: 'shorts' | 'long_form' = i === 0 ? 'long_form' : 'shorts';
        const dayType: 'weekday' | 'weekend' = this.getDayType();

        const optimalTime = await (postingTimeBandit as any).selectOptimalTime?.(format, dayType);
        times.push(optimalTime || '18:00'); // Default to 6pm
      }
    } catch (error) {
      console.warn('[Content Strategy] Could not load posting times, using defaults:', error);
      // Fallback times: spread throughout the day
      const defaultTimes = ['10:00', '14:00', '16:00', '18:00', '20:00'];
      return defaultTimes.slice(0, count);
    }

    return times;
  }

  /**
   * Execute a daily content plan
   */
  async executeDailyPlan(planId: string): Promise<void> {
    console.log(`[Content Strategy] Executing plan ${planId}`);

    // Get the plan
    const [plan] = await db.select().from(contentPlans).where(eq(contentPlans.id, planId)).limit(1);

    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    if (plan.status !== 'planned') {
      throw new Error(`Plan ${planId} is not in planned state (current: ${plan.status})`);
    }

    // Update status to executing
    await db
      .update(contentPlans)
      .set({
        status: 'executing',
        executionStarted: new Date(),
      })
      .where(eq(contentPlans.id, planId));

    let videosCompleted = 0;
    let videosFailed = 0;

    try {
      const { autonomousGoalAgent } = await import('./autonomous-goal-agent');

      for (const video of plan.videos as VideoPlanning[]) {
        try {
          console.log(`[Content Strategy] Creating video: ${video.figure}`);

          // Create Unity package using autonomous goal agent
          const goal = `${video.figure}: ${video.theme}`;
          const result = await autonomousGoalAgent.createPackageFromGoal(goal as any);

          // Update plan with package ID
          const updatedVideos = (plan.videos as VideoPlanning[]).map((v) =>
            v.figure === video.figure && !v.packageId ? { ...v, packageId: result.packageId, executed: true } : v,
          );

          await db.update(contentPlans).set({ videos: updatedVideos }).where(eq(contentPlans.id, planId));

          videosCompleted++;
          console.log(`[Content Strategy] Video ${videosCompleted} created: ${video.figure}`);
        } catch (error: any) {
          console.error(`[Content Strategy] Failed to create video ${video.figure}:`, error.message);
          videosFailed++;
        }
      }

      // Update final status
      await db
        .update(contentPlans)
        .set({
          status: 'completed',
          executionCompleted: new Date(),
          videosCompleted,
          videosFailed,
        })
        .where(eq(contentPlans.id, planId));

      console.log(`[Content Strategy] Plan execution complete: ${videosCompleted} succeeded, ${videosFailed} failed`);
    } catch (error: any) {
      console.error(`[Content Strategy] Plan execution failed:`, error.message);

      await db
        .update(contentPlans)
        .set({
          status: 'failed',
          executionCompleted: new Date(),
          videosCompleted,
          videosFailed,
        })
        .where(eq(contentPlans.id, planId));

      throw error;
    }
  }

  /**
   * Get current content plan (today or tomorrow)
   */
  async getCurrentPlan(): Promise<DailyContentPlan | null> {
    const today = this.getTodayDate();
    const tomorrow = this.getTomorrowDate();

    const plans = await db
      .select()
      .from(contentPlans)
      .where(eq(contentPlans.date, today))
      .orderBy(desc(contentPlans.createdAt))
      .limit(1);

    if (plans.length > 0) {
      return plans[0] as any;
    }

    // Try tomorrow
    const tomorrowPlans = await db
      .select()
      .from(contentPlans)
      .where(eq(contentPlans.date, tomorrow))
      .orderBy(desc(contentPlans.createdAt))
      .limit(1);

    return tomorrowPlans.length > 0 ? (tomorrowPlans[0] as any) : null;
  }

  /**
   * Get all content plans
   */
  async getAllPlans(limit: number = 30) {
    return await db.select().from(contentPlans).orderBy(desc(contentPlans.date)).limit(limit);
  }

  /**
   * Helper: Get today's date as YYYY-MM-DD
   */
  private getTodayDate(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Helper: Get tomorrow's date as YYYY-MM-DD
   */
  private getTomorrowDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }

  /**
   * Helper: Determine if today/tomorrow is weekday or weekend
   */
  private getDayType(): 'weekday' | 'weekend' {
    const day = new Date().getDay();
    return day === 0 || day === 6 ? 'weekend' : 'weekday';
  }
}

// Export singleton instance
export const contentStrategyAgent = new ContentStrategyAgent();
