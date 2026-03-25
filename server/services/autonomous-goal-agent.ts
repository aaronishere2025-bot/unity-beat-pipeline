/**
 * AUTONOMOUS GOAL DECOMPOSITION SERVICE
 *
 * Auto-discovers trending angles, optimal timing, and thumbnail strategies
 * from simple goals like "Julius Caesar" + "viral".
 *
 * Features:
 * 1. Goal Decomposition - Takes simple goal, returns full content plan
 * 2. Trending Angles Discovery - Finds viral-worthy angles via GPT + trends
 * 3. Optimal Timing Calculator - Uses posting time bandit + analytics
 * 4. Thumbnail Strategy Generator - Visual intelligence patterns
 * 5. Package Creation - Full autonomous flow to Unity package
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { trendWatcherAgentService as trendWatcherAgent } from './trend-watcher-agent';
import { patternIntelligenceService, TrackedPattern } from './pattern-intelligence-service';
import { postingTimeBandit } from './posting-time-bandit';
import { unityContentGenerator } from './unity-content-generator';
import { dynamicFigureDiscovery } from './dynamic-figure-discovery.js';
import { apiCostTracker } from './api-cost-tracker';
import { storage } from '../storage';
import { db } from '../db';
import { videoPerformanceHistory } from '@shared/schema';
import { desc, sql } from 'drizzle-orm';

let gemini: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!gemini && process.env.GEMINI_API_KEY) {
    gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  if (!gemini) {
    throw new Error('Gemini API key not available');
  }
  return gemini;
}

export interface SimpleGoal {
  figure?: string; // Optional - if not provided, dynamic discovery will find a fresh figure
  useDynamicDiscovery?: boolean; // Set to true to always discover new figures from trends
  intent?: 'viral' | 'educational' | 'controversial' | 'inspirational' | 'dramatic';
  constraints?: {
    maxDuration?: number;
    aspectRatio?: '9:16' | '16:9';
    tone?: string;
  };
  suggestedAngle?: string; // Optional angle from topic discovery agent
  suggestedHook?: string; // Optional hook from topic discovery agent
}

export interface DiscoveredAngle {
  angle: string;
  viralPotential: number;
  reasoning: string;
  suggestedHook: string;
  trendAlignment: string[];
}

export interface OptimalPostingTime {
  time: string;
  day: string;
  reasoning: string;
  expectedReach: number;
}

export interface ThumbnailStrategy {
  style: string;
  colorScheme: string[];
  textOverlay: string;
  emotionalTrigger: string;
  ctaType: string;
}

export interface CompetitorAnalysis {
  topPerformers: string[];
  gaps: string[];
  opportunities: string[];
}

export interface DecomposedPlan {
  figure: string;
  discoveredAngles: DiscoveredAngle[];
  optimalPostingTimes: OptimalPostingTime[];
  thumbnailStrategies: ThumbnailStrategy[];
  suggestedStyles: string[];
  competitorAnalysis?: CompetitorAnalysis;
  recommendedApproach: {
    angle: string;
    hook: string;
    style: string;
    postingTime: string;
    thumbnailStrategy: ThumbnailStrategy;
  };
}

const INTENT_PROMPTS: Record<string, string> = {
  viral:
    'Focus on shocking facts, controversies, and "what they don\'t teach you" angles. Prioritize emotional hooks and shareable moments.',
  educational:
    'Focus on lesser-known facts, historical context, and "you won\'t believe" revelations. Make learning feel like discovery.',
  controversial:
    'Explore divisive takes, historical debates, and "unpopular opinions" about the figure. Challenge mainstream narratives.',
  inspirational:
    'Highlight overcoming adversity, leadership moments, and timeless wisdom. Create "if they could, you can" narratives.',
  dramatic: 'Focus on betrayal, revenge, rise and fall, and epic moments. Create cinematic storytelling hooks.',
};

const THUMBNAIL_STYLES = [
  { style: 'dramatic_portrait', description: 'Close-up face with intense expression, bold text overlay' },
  { style: 'action_scene', description: 'Dynamic battle or conflict scene with motion blur' },
  { style: 'mystery_reveal', description: 'Silhouette or partially hidden figure with question marks' },
  { style: 'contrast_split', description: 'Before/after or hero/villain split screen' },
  { style: 'text_focused', description: 'Bold provocative text with minimal imagery' },
  { style: 'reaction_style', description: 'Shocked/surprised expression with arrows pointing' },
];

const EMOTIONAL_TRIGGERS = [
  'curiosity',
  'shock',
  'admiration',
  'fear',
  'anger',
  'inspiration',
  'nostalgia',
  'surprise',
];

const CTA_TYPES = ['question', 'challenge', 'secret_reveal', 'countdown', 'comparison', 'warning'];

class AutonomousGoalAgent {
  /**
   * Main entry point: Decompose a simple goal into a full content plan
   */
  async decomposeGoal(goal: SimpleGoal): Promise<DecomposedPlan> {
    console.log(`🎯 Decomposing goal for: ${goal.figure} (intent: ${goal.intent || 'viral'})`);

    const [angles, timing, thumbnails, styles, competitors] = await Promise.all([
      this.discoverTrendingAngles(goal.figure || '', goal.intent || 'viral'),
      this.calculateOptimalTiming(goal.figure || '', 'general'),
      this.generateThumbnailStrategies(goal.figure || '', goal.intent || 'viral'),
      this.suggestStyles(goal.figure || '', goal.intent || 'viral'),
      this.analyzeCompetitors(goal.figure || ''),
    ]);

    const recommendedApproach = this.selectBestApproach(angles, timing, thumbnails, styles);

    return {
      figure: goal.figure || '',
      discoveredAngles: angles,
      optimalPostingTimes: timing,
      thumbnailStrategies: thumbnails,
      suggestedStyles: styles,
      competitorAnalysis: competitors,
      recommendedApproach,
    };
  }

  /**
   * Discover trending angles for a historical figure
   */
  async discoverTrendingAngles(figure: string, intent: string): Promise<DiscoveredAngle[]> {
    console.log(`🔍 Discovering trending angles for: ${figure}`);

    let trendData: string[] = [];
    try {
      const marketSignals = await (trendWatcherAgent as any).getMarketSignals([figure]);
      trendData = marketSignals.ytPopularThemes || [];
    } catch (error) {
      console.warn('Could not fetch trend data, proceeding with GPT analysis');
    }

    let patternInsights: string[] = [];
    try {
      const patterns = await (patternIntelligenceService as any).getHighConfidencePatterns(10);
      patternInsights = patterns.map((p: any) => `${p.pattern} (${p.successRate.toFixed(0)}% success)`);
    } catch (error) {
      console.warn('Could not fetch pattern insights');
    }

    const intentPrompt = INTENT_PROMPTS[intent] || INTENT_PROMPTS.viral;

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.8,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `You are a viral content strategist specializing in historical short-form content.
Your job is to find the most engaging angles for videos about historical figures.
${intentPrompt}

Current trending themes: ${trendData.join(', ') || 'No trend data available'}
Successful patterns from our channel: ${patternInsights.join(', ') || 'No pattern data available'}

Return JSON with exactly 5 angles, each with:
- angle: The specific story angle (be specific, not generic)
- viralPotential: 0-100 score
- reasoning: Why this angle works
- suggestedHook: The opening line/hook for this angle
- trendAlignment: Array of trending topics this aligns with

Find 5 viral-worthy angles for a short video about: ${figure}
Intent: ${intent}
Consider: controversies, untold stories, "what they don't teach you" moments, dramatic arcs, and surprising facts.`;

    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Track cost for this API call
    await apiCostTracker.trackGemini({
      model: 'gemini-2.5-flash',
      operation: 'goal_angle_discovery',
      inputTokens: response.response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.response.usageMetadata?.candidatesTokenCount || 0,
      jobId: undefined,
      success: true,
      metadata: { function: 'discoverTrendingAngles', figure, intent },
    });

    try {
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse JSON response');
        }
      }
      const angles = result.angles || result.discoveredAngles || [];

      return angles
        .map((a: any) => ({
          angle: a.angle || a.title || '',
          viralPotential: Math.min(100, Math.max(0, a.viralPotential || a.viral_potential || 50)),
          reasoning: a.reasoning || a.reason || '',
          suggestedHook: a.suggestedHook || a.hook || '',
          trendAlignment: Array.isArray(a.trendAlignment) ? a.trendAlignment : [],
        }))
        .sort((a: DiscoveredAngle, b: DiscoveredAngle) => b.viralPotential - a.viralPotential);
    } catch (error) {
      console.error('Failed to parse angles response:', error);
      return this.getFallbackAngles(figure);
    }
  }

  /**
   * Calculate optimal posting times based on historical data
   */
  async calculateOptimalTiming(figure: string, targetAudience: string): Promise<OptimalPostingTime[]> {
    console.log(`⏰ Calculating optimal timing for: ${figure}`);

    const results: OptimalPostingTime[] = [];

    try {
      const weekdaySlot = await postingTimeBandit.selectTimeSlot('shorts', 'weekday');
      const weekendSlot = await postingTimeBandit.selectTimeSlot('shorts', 'weekend');

      results.push({
        time: weekdaySlot.timeSlot,
        day: 'Weekday',
        reasoning: `Thompson Sampling selected with ${(weekdaySlot.confidence * 100).toFixed(0)}% confidence. ${weekdaySlot.isExploration ? 'Exploration mode.' : 'Exploitation mode.'}`,
        expectedReach: Math.round(weekdaySlot.confidence * 10000),
      });

      results.push({
        time: weekendSlot.timeSlot,
        day: 'Weekend',
        reasoning: `Thompson Sampling selected with ${(weekendSlot.confidence * 100).toFixed(0)}% confidence. ${weekendSlot.isExploration ? 'Exploration mode.' : 'Exploitation mode.'}`,
        expectedReach: Math.round(weekendSlot.confidence * 8000),
      });
    } catch (error) {
      console.warn('Could not get bandit recommendations, using defaults');
    }

    const historicalPerformance = await this.getHistoricalTimePerformance();

    const additionalTimes: OptimalPostingTime[] = [
      {
        time: '12:00 PM CST',
        day: 'Tuesday',
        reasoning: 'Lunch break engagement peak for history content',
        expectedReach: 7500,
      },
      {
        time: '6:00 PM CST',
        day: 'Thursday',
        reasoning: 'After-work discovery time, high engagement window',
        expectedReach: 8500,
      },
      {
        time: '8:00 PM CST',
        day: 'Sunday',
        reasoning: 'Weekend prime time for educational content',
        expectedReach: 9000,
      },
    ];

    return [...results, ...additionalTimes].slice(0, 5);
  }

  /**
   * Generate thumbnail strategies based on visual intelligence
   */
  async generateThumbnailStrategies(figure: string, angle: string): Promise<ThumbnailStrategy[]> {
    console.log(`🎨 Generating thumbnail strategies for: ${figure}`);

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `You are a thumbnail optimization expert for YouTube Shorts.
Create 4 distinct thumbnail strategies that maximize click-through rate.

Available styles: ${THUMBNAIL_STYLES.map((s) => s.style).join(', ')}
Emotional triggers: ${EMOTIONAL_TRIGGERS.join(', ')}
CTA types: ${CTA_TYPES.join(', ')}

Return JSON with 4 strategies, each with:
- style: One of the available styles
- colorScheme: Array of 3-4 colors (hex or names)
- textOverlay: The text to display (max 5 words)
- emotionalTrigger: Primary emotion to evoke
- ctaType: Type of call-to-action

Create 4 thumbnail strategies for: ${figure}
Content angle: ${angle}
Target: Maximum CTR and curiosity`;

    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Track cost for this API call
    await apiCostTracker.trackGemini({
      model: 'gemini-2.5-flash',
      operation: 'thumbnail_strategy_generation',
      inputTokens: response.response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.response.usageMetadata?.candidatesTokenCount || 0,
      jobId: undefined,
      success: true,
      metadata: { function: 'generateThumbnailStrategies', figure, angle },
    });

    try {
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse JSON response');
        }
      }
      const strategies = result.strategies || result.thumbnailStrategies || [];

      return strategies.map((s: any) => ({
        style: s.style || 'dramatic_portrait',
        colorScheme: Array.isArray(s.colorScheme) ? s.colorScheme : ['#FF0000', '#000000', '#FFFFFF'],
        textOverlay: s.textOverlay || s.text || '',
        emotionalTrigger: s.emotionalTrigger || 'curiosity',
        ctaType: s.ctaType || 'question',
      }));
    } catch (error) {
      console.error('Failed to parse thumbnail strategies:', error);
      return this.getFallbackThumbnails(figure);
    }
  }

  /**
   * Suggest music/visual styles based on figure and intent
   */
  async suggestStyles(figure: string, intent: string): Promise<string[]> {
    const styleMap: Record<string, string[]> = {
      viral: ['epic orchestral hip-hop', 'dramatic trap beat', 'cinematic boom-bap'],
      educational: ['thoughtful piano underscore', 'documentary strings', 'ambient electronic'],
      controversial: ['aggressive industrial', 'dark trap', 'intense orchestral'],
      inspirational: ['uplifting orchestral', 'motivational hip-hop', 'triumphant fanfare'],
      dramatic: ['epic trailer music', 'Hans Zimmer style', 'thunderous drums'],
    };

    return styleMap[intent] || styleMap.viral;
  }

  /**
   * Analyze competitor content for gaps and opportunities
   */
  async analyzeCompetitors(figure: string): Promise<CompetitorAnalysis> {
    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.6,
        responseMimeType: 'application/json',
      },
    });

    const prompt = `You are a competitive content analyst. Analyze what content exists about historical figures and find gaps.
Return JSON with:
- topPerformers: Array of 3-5 types of content that perform well
- gaps: Array of 3-5 content gaps or underserved angles
- opportunities: Array of 3-5 specific content opportunities

Analyze the competitive landscape for short-form video content about: ${figure}
What's overdone? What's missing? What opportunities exist?`;

    const response = await model.generateContent(prompt);
    const text = response.response.text();

    // Track cost for this API call
    await apiCostTracker.trackGemini({
      model: 'gemini-2.5-flash',
      operation: 'competitor_analysis',
      inputTokens: response.response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.response.usageMetadata?.candidatesTokenCount || 0,
      jobId: undefined,
      success: true,
      metadata: { function: 'analyzeCompetitors', figure },
    });

    try {
      let result: any;
      try {
        result = JSON.parse(text);
      } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Failed to parse JSON response');
        }
      }
      return {
        topPerformers: result.topPerformers || [],
        gaps: result.gaps || [],
        opportunities: result.opportunities || [],
      };
    } catch (error) {
      return {
        topPerformers: ['Epic battles', 'Death stories', 'Rise to power'],
        gaps: ['Personal struggles', 'Unknown allies', 'Failed plans'],
        opportunities: ['Untold stories', 'Myth vs reality', 'Modern parallels'],
      };
    }
  }

  /**
   * Select the best overall approach from all analyses
   */
  private selectBestApproach(
    angles: DiscoveredAngle[],
    timing: OptimalPostingTime[],
    thumbnails: ThumbnailStrategy[],
    styles: string[],
  ): DecomposedPlan['recommendedApproach'] {
    const bestAngle = angles[0] || { angle: 'Unknown story', suggestedHook: '' };
    const bestTiming = timing[0] || { time: '6:00 PM CST', day: 'Weekday' };
    const bestThumbnail = thumbnails[0] || {
      style: 'dramatic_portrait',
      colorScheme: ['#FF0000', '#000000'],
      textOverlay: 'WATCH THIS',
      emotionalTrigger: 'curiosity',
      ctaType: 'question',
    };

    return {
      angle: bestAngle.angle,
      hook: bestAngle.suggestedHook,
      style: styles[0] || 'epic orchestral hip-hop',
      postingTime: `${bestTiming.time} ${bestTiming.day}`,
      thumbnailStrategy: bestThumbnail,
    };
  }

  /**
   * Create a full Unity package from a simple goal
   */
  async createPackageFromGoal(goal: SimpleGoal): Promise<{
    packageId: string;
    plan: DecomposedPlan;
  }> {
    let figure = goal.figure;
    let discoveredContext = null;

    // Dynamic discovery: find fresh figure from trends if requested or if no figure provided
    if (goal.useDynamicDiscovery || !goal.figure) {
      console.log(`🔍 Dynamic discovery mode: Finding fresh historical figure...`);

      const discoveries = await dynamicFigureDiscovery.discoverFreshFigure(1);
      if (discoveries.length === 0) {
        throw new Error('Dynamic discovery failed to find fresh figures');
      }

      discoveredContext = discoveries[0];
      figure = discoveredContext.fullName;

      console.log(`   ✅ Discovered: ${discoveredContext.fullName} (${discoveredContext.era})`);
      console.log(`   📐 Angle: ${discoveredContext.angle}`);
      console.log(`   📍 Context: ${discoveredContext.why5Ws.where}, ${discoveredContext.timeframe}`);

      // Use discovered angle if no suggested angle provided
      if (!goal.suggestedAngle) {
        goal.suggestedAngle = discoveredContext.angle;
      }
    }

    if (!figure) {
      throw new Error('No figure specified and dynamic discovery is disabled');
    }

    console.log(`📦 Creating package from goal: ${figure}`);

    const plan = await this.decomposeGoal({ ...goal, figure });

    // Build topic with discovered context if available
    const topic = discoveredContext
      ? `${discoveredContext.fullName}: ${discoveredContext.angle}`
      : `${figure}: ${plan.recommendedApproach.angle}`;

    // Build context string from 5 W's if available
    const contextHint = discoveredContext
      ? `WHO: ${discoveredContext.why5Ws.who}. WHAT: ${discoveredContext.why5Ws.what}. WHEN: ${discoveredContext.why5Ws.when} (${discoveredContext.timeframe}). WHERE: ${discoveredContext.why5Ws.where}. WHY: ${discoveredContext.why5Ws.why}. HOW: ${discoveredContext.why5Ws.how}.`
      : undefined;

    const packageData = await unityContentGenerator.generateCompletePackage({
      topic,
      message: discoveredContext
        ? `Historical documentary about ${discoveredContext.fullName}: ${discoveredContext.significance}`
        : `Unity content about ${topic}`,
      voice: 'aggressive' as any,
      energy: 'high' as any,
      mood: (goal.intent === 'inspirational' ? 'triumphant' : 'intense') as any,
      visualStyleV2: 'gritty_warrior' as any,
      setting: (discoveredContext?.why5Ws.where || 'ancient_battlefield') as any,
      targetDurationSeconds: goal.constraints?.maxDuration || 180, // Default to 3 minutes
      aspectRatio: goal.constraints?.aspectRatio || '9:16',
      contextHint, // Pass 5 W's context to generator
    });

    const pkg = await storage.createUnityContentPackage({
      title: topic,
      topic: figure,
      packageData: packageData as any, // packageData IS the result, not a property of it
      status: 'draft',
    });

    console.log(`✅ Created package ${pkg.id} for ${figure}`);

    return {
      packageId: pkg.id,
      plan,
    };
  }

  private async getHistoricalTimePerformance(): Promise<Record<string, number>> {
    try {
      const history = await db
        .select({
          hour: sql<number>`EXTRACT(HOUR FROM ${videoPerformanceHistory.recordedAt})`,
          avgViews: sql<number>`AVG(${videoPerformanceHistory.viewCount})`,
        })
        .from(videoPerformanceHistory)
        .groupBy(sql`EXTRACT(HOUR FROM ${videoPerformanceHistory.recordedAt})`)
        .limit(24);

      const result: Record<string, number> = {};
      for (const row of history) {
        result[`${row.hour}:00`] = row.avgViews;
      }
      return result;
    } catch (error) {
      return {};
    }
  }

  private getFallbackAngles(figure: string): DiscoveredAngle[] {
    return [
      {
        angle: `The untold truth about ${figure}`,
        viralPotential: 75,
        reasoning: 'Mystery and revelation angles consistently perform well',
        suggestedHook: `Everything you learned about ${figure} was wrong...`,
        trendAlignment: ['history', 'education', 'viral'],
      },
      {
        angle: `${figure}'s biggest mistake`,
        viralPotential: 70,
        reasoning: 'Failure stories create strong emotional engagement',
        suggestedHook: `${figure} had one fatal flaw that destroyed everything...`,
        trendAlignment: ['drama', 'lessons', 'history'],
      },
      {
        angle: `The dark side of ${figure}`,
        viralPotential: 80,
        reasoning: 'Controversial takes drive high engagement',
        suggestedHook: `They don't teach you THIS about ${figure}...`,
        trendAlignment: ['controversy', 'education', 'viral'],
      },
    ];
  }

  private getFallbackThumbnails(figure: string): ThumbnailStrategy[] {
    return [
      {
        style: 'dramatic_portrait',
        colorScheme: ['#FF0000', '#000000', '#FFFFFF'],
        textOverlay: 'THE TRUTH',
        emotionalTrigger: 'curiosity',
        ctaType: 'secret_reveal',
      },
      {
        style: 'mystery_reveal',
        colorScheme: ['#1A1A2E', '#E94560', '#FFFFFF'],
        textOverlay: 'HIDDEN HISTORY',
        emotionalTrigger: 'shock',
        ctaType: 'question',
      },
    ];
  }
}

export const autonomousGoalAgent = new AutonomousGoalAgent();
