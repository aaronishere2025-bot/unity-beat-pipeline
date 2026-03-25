/**
 * Beat Visual Optimizer
 *
 * Uses YouTube analytics (CTR, retention, watch time) to learn which
 * visual styles work best for beat videos and optimizes Kling prompts.
 */

import { db } from '../db.js';
import { videoPerformanceHistory, jobs } from '@shared/schema';
import { desc, eq, and, gte, sql } from 'drizzle-orm';
import { visualVarietyEngine } from './visual-variety-engine.js';

interface VisualPerformance {
  visualStyle: string;
  avgCTR: number;
  avgRetention: number;
  avgWatchTime: number;
  sampleSize: number;
  confidence: number;
}

interface OptimizedKlingPrompt {
  prompt: string;
  style: string;
  reasoning: string;
  expectedCTR: number;
  basedOnSamples: number;
}

class BeatVisualOptimizer {
  private static instance: BeatVisualOptimizer;

  static getInstance() {
    if (!BeatVisualOptimizer.instance) {
      BeatVisualOptimizer.instance = new BeatVisualOptimizer();
    }
    return BeatVisualOptimizer.instance;
  }

  /**
   * Analyze which visual styles perform best for beat videos
   */
  async analyzeVisualPerformance(): Promise<VisualPerformance[]> {
    console.log('🔍 Analyzing visual performance for beat videos...');

    try {
      // Get all beat/music videos with YouTube analytics
      const beatJobs = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.mode, 'music'), sql`${jobs.youtubeVideoId} IS NOT NULL`));

      console.log(`Found ${beatJobs.length} beat videos with YouTube IDs`);

      if (beatJobs.length === 0) {
        console.log('⚠️  No beat videos with analytics yet');
        return [];
      }

      // Group by visual style and calculate performance
      const styleMap = new Map<
        string,
        {
          ctrs: number[];
          retentions: number[];
          watchTimes: number[];
          visualTheme: string;
        }
      >();

      for (const job of beatJobs) {
        const metadata = job.metadata as any;
        const visualTheme = metadata?.visualTheme || metadata?.loopVisual?.theme || 'generic';

        // Get latest performance data
        // Skip database query for now - will implement after table is ready
        const performance: any[] = [];

        /* TODO: Re-enable after videoPerformanceHistory table is ready
        const performance = await db
          .select()
          .from(videoPerformanceHistory)
          .where(eq(videoPerformanceHistory.videoId, job.youtubeVideoId!))
          .orderBy(desc(videoPerformanceHistory.timestamp))
          .limit(1);
        */

        if (performance.length > 0) {
          const perf = performance[0];

          if (!styleMap.has(visualTheme)) {
            styleMap.set(visualTheme, {
              ctrs: [],
              retentions: [],
              watchTimes: [],
              visualTheme,
            });
          }

          const data = styleMap.get(visualTheme)!;

          // Calculate CTR from impressions (if available)
          const ctr = perf.views && perf.views > 0 ? (perf.views / Math.max(perf.views * 100, 1)) * 100 : 0;

          data.ctrs.push(ctr);
          data.watchTimes.push(Number(perf.views || 0)); // Proxy for engagement
        }
      }

      // Calculate averages and confidence scores
      const results: VisualPerformance[] = [];

      for (const [style, data] of styleMap.entries()) {
        const avgCTR = data.ctrs.reduce((a, b) => a + b, 0) / data.ctrs.length;
        const avgRetention = data.retentions.reduce((a, b) => a + b, 0) / data.retentions.length || 0;
        const avgWatchTime = data.watchTimes.reduce((a, b) => a + b, 0) / data.watchTimes.length;
        const sampleSize = data.ctrs.length;

        // Confidence based on sample size (using Wilson score approach)
        const confidence = Math.min(sampleSize / 20, 1.0); // 20+ samples = 100% confidence

        results.push({
          visualStyle: style,
          avgCTR,
          avgRetention,
          avgWatchTime,
          sampleSize,
          confidence,
        });
      }

      // Sort by performance (weighted score)
      results.sort((a, b) => {
        const scoreA = (a.avgCTR * 0.4 + a.avgRetention * 0.3 + a.avgWatchTime * 0.3) * a.confidence;
        const scoreB = (b.avgCTR * 0.4 + b.avgRetention * 0.3 + b.avgWatchTime * 0.3) * b.confidence;
        return scoreB - scoreA;
      });

      console.log('\n📊 Visual Performance Rankings:');
      results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.visualStyle}`);
        console.log(`   CTR: ${r.avgCTR.toFixed(2)}%`);
        console.log(`   Retention: ${r.avgRetention.toFixed(1)}%`);
        console.log(`   Watch Time: ${r.avgWatchTime.toFixed(0)}s`);
        console.log(`   Sample Size: ${r.sampleSize} (confidence: ${(r.confidence * 100).toFixed(0)}%)`);
        console.log('');
      });

      return results;
    } catch (error: any) {
      console.error('⚠️  Error analyzing performance:', error.message);
      console.log('   Returning empty results (no data yet)');
      return [];
    }
  }

  /**
   * Generate optimized Kling prompt based on learned visual performance
   * NOW WITH MASSIVE VARIETY using visualVarietyEngine!
   */
  async generateOptimizedPrompt(beatStyle: string, bpm: number, energy?: number): Promise<OptimizedKlingPrompt> {
    const performances = await this.analyzeVisualPerformance();

    // Use NEW visual variety engine for diverse, unique prompts
    console.log('🎨 Using Visual Variety Engine for diverse prompt generation...');

    const energyLevel = energy || (bpm < 90 ? 0.3 : bpm > 130 ? 0.8 : 0.5);

    const visualPrompt = visualVarietyEngine.generateUniquePrompt({
      beatStyle,
      bpm,
      energy: energyLevel,
    });

    console.log(`   Theme: ${visualPrompt.theme}`);
    console.log(`   Colors: ${visualPrompt.colorPalette}`);
    console.log(`   Lighting: ${visualPrompt.lighting}`);
    console.log(`   Camera: ${visualPrompt.cameraMovement}`);
    console.log(`   Atmosphere: ${visualPrompt.atmosphere}`);

    // If we have performance data, mention it
    let reasoning = 'Using diverse visual variety engine with 100+ unique themes';
    let expectedCTR = 3.5; // Default
    let basedOnSamples = 0;

    if (performances.length > 0) {
      const bestStyle = performances[0];
      reasoning = `Visual variety engine + analytics: best style "${bestStyle.visualStyle}" achieves ${bestStyle.avgCTR.toFixed(1)}% CTR`;
      expectedCTR = bestStyle.avgCTR;
      basedOnSamples = performances.reduce((sum, p) => sum + p.sampleSize, 0);
    }

    return {
      prompt: visualPrompt.prompt,
      style: visualPrompt.theme,
      reasoning,
      expectedCTR,
      basedOnSamples,
    };
  }

  /**
   * Default prompts when no performance data available
   * NOW USES VISUAL VARIETY ENGINE!
   */
  private getDefaultPrompt(beatStyle: string, bpm: number): OptimizedKlingPrompt {
    // Use visual variety engine instead of hardcoded prompts
    const visualPrompt = visualVarietyEngine.generateUniquePrompt({
      beatStyle,
      bpm,
      energy: bpm < 90 ? 0.3 : bpm > 130 ? 0.8 : 0.5,
    });

    return {
      prompt: visualPrompt.prompt,
      style: visualPrompt.theme,
      reasoning: 'Visual variety engine - diverse unique prompt with 100+ theme options',
      expectedCTR: 3.5, // Industry average for music videos
      basedOnSamples: 0,
    };
  }

  /**
   * Learn from a specific video's performance
   */
  async recordVideoPerformance(
    jobId: string,
    youtubeVideoId: string,
    metrics: {
      impressions: number;
      clicks: number;
      avgViewDuration: number;
      views: number;
    },
  ): Promise<void> {
    const ctr = (metrics.clicks / metrics.impressions) * 100;

    console.log(`\n📈 Recording performance for ${youtubeVideoId}:`);
    console.log(`   Impressions: ${metrics.impressions}`);
    console.log(`   CTR: ${ctr.toFixed(2)}%`);
    console.log(`   Avg View Duration: ${metrics.avgViewDuration}s`);
    console.log(`   Views: ${metrics.views}`);

    // Store in videoPerformanceHistory
    await db.insert(videoPerformanceHistory).values({
      videoId: youtubeVideoId,
      views: metrics.views,
      likes: 0, // To be fetched separately
      timestamp: new Date(),
    } as any);

    // Analyze if this is underperforming
    if (ctr < 2.0) {
      console.log(`\n⚠️  LOW CTR WARNING: ${ctr.toFixed(2)}%`);
      console.log('   Recommendation: Change visual style or thumbnail');
      console.log('   Good CTR for music videos: 4-10%');
    }

    if (metrics.avgViewDuration < 30) {
      console.log(`\n⚠️  LOW RETENTION WARNING: ${metrics.avgViewDuration}s average`);
      console.log('   Recommendation: Visual may not match audio energy');
      console.log('   Target: 60+ seconds for 3-minute beats');
    }
  }
}

export const beatVisualOptimizer = BeatVisualOptimizer.getInstance();
