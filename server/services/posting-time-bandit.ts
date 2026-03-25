/**
 * POSTING TIME BANDIT SERVICE
 *
 * Thompson Sampling for finding optimal video upload times.
 * Learns which time slots perform best for shorts vs long_form content.
 *
 * Tracks:
 * - 6 time slots: 6AM, 9AM, 12PM, 3PM, 6PM, 9PM
 * - Day types: weekday vs weekend
 * - Content format: shorts vs long_form
 *
 * Uses PostgreSQL database for persistence via Drizzle ORM.
 */

import { db } from '../db';
import { postingTimeArms, type PostingTimeArm } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const TIME_SLOTS = ['12:00', '14:00', '16:00', '18:00', '20:00'];
const DAY_TYPES: Array<'weekday' | 'weekend'> = ['weekday', 'weekend'];
const FORMATS: Array<'shorts' | 'long_form'> = ['shorts', 'long_form'];

const SUCCESS_THRESHOLD = {
  minViews: 500,
  minCTR: 8,
  minAVD: 40,
};

class PostingTimeBanditService {
  private initialized = false;

  constructor() {
    this.ensureInitialized();
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      const existingArms = await db.select().from(postingTimeArms).limit(1);

      if (existingArms.length === 0) {
        await this.initializeDefaultArms();
      }

      this.initialized = true;
      console.log('⏰ Posting Time Bandit: Database initialized');
    } catch (error) {
      console.warn('⚠️ Could not initialize Posting Time bandit:', error);
    }
  }

  private async initializeDefaultArms(): Promise<void> {
    const armsToInsert: Array<{
      id: string;
      timeSlot: string;
      dayType: string;
      format: string;
      alpha: number;
      beta: number;
      trials: number;
      successes: number;
      avgCtr: number | null;
      avgAvd: number | null;
      avgViews: number | null;
    }> = [];

    for (const format of FORMATS) {
      for (const dayType of DAY_TYPES) {
        for (const timeSlot of TIME_SLOTS) {
          const id = `${format}_${dayType}_${timeSlot.replace(':', '')}`;
          armsToInsert.push({
            id,
            timeSlot,
            dayType,
            format,
            alpha: 1,
            beta: 1,
            trials: 0,
            successes: 0,
            avgCtr: null,
            avgAvd: null,
            avgViews: null,
          });
        }
      }
    }

    await db.insert(postingTimeArms).values(armsToInsert);
    console.log(`⏰ Posting Time Bandit: Initialized with ${armsToInsert.length} time slot arms`);
  }

  private sampleBeta(alpha: number, beta: number): number {
    const gammaAlpha = this.sampleGamma(alpha);
    const gammaBeta = this.sampleGamma(beta);
    return gammaAlpha / (gammaAlpha + gammaBeta);
  }

  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x: number, v: number;
      do {
        const u1 = Math.random();
        const u2 = Math.random();
        x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v;
      }

      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  private getCurrentDayType(): 'weekday' | 'weekend' {
    const day = new Date().getDay();
    return day === 0 || day === 6 ? 'weekend' : 'weekday';
  }

  /**
   * Select optimal time slot using Thompson Sampling
   */
  async selectTimeSlot(
    format: 'shorts' | 'long_form',
    dayType?: 'weekday' | 'weekend',
  ): Promise<{
    timeSlot: string;
    dayType: 'weekday' | 'weekend';
    armId: string;
    confidence: number;
    isExploration: boolean;
  }> {
    await this.ensureInitialized();

    const targetDayType = dayType || this.getCurrentDayType();

    const relevantArms = await db
      .select()
      .from(postingTimeArms)
      .where(and(eq(postingTimeArms.format, format), eq(postingTimeArms.dayType, targetDayType)));

    if (relevantArms.length === 0) {
      await this.initializeDefaultArms();
      return this.selectTimeSlot(format, dayType);
    }

    const samples: Array<{
      id: string;
      sample: number;
      mean: number;
      arm: PostingTimeArm;
    }> = [];

    for (const arm of relevantArms) {
      const sample = this.sampleBeta(arm.alpha, arm.beta);
      const mean = arm.alpha / (arm.alpha + arm.beta);
      samples.push({ id: arm.id, sample, mean, arm });
    }

    samples.sort((a, b) => b.sample - a.sample);
    const selected = samples[0];

    await db
      .update(postingTimeArms)
      .set({
        trials: selected.arm.trials + 1,
        lastUpdated: new Date(),
      })
      .where(eq(postingTimeArms.id, selected.id));

    const confidence = Math.min(0.95, selected.arm.trials / (selected.arm.trials + 10));

    const bestMeanArm = relevantArms.sort((a, b) => b.alpha / (b.alpha + b.beta) - a.alpha / (a.alpha + a.beta))[0];
    const isExploration = selected.id !== bestMeanArm.id;

    console.log(`⏰ POSTING TIME BANDIT: Selected ${selected.arm.timeSlot} ${targetDayType} for ${format}`);
    console.log(`   Sample: ${selected.sample.toFixed(3)}, Mean: ${selected.mean.toFixed(3)}`);
    console.log(`   Trials: ${selected.arm.trials + 1}, ${isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'}`);

    return {
      timeSlot: selected.arm.timeSlot,
      dayType: targetDayType,
      armId: selected.id,
      confidence,
      isExploration,
    };
  }

  /**
   * Record outcome for a video posted at a specific time
   */
  async recordOutcome(
    timeSlot: string,
    format: 'shorts' | 'long_form',
    dayType: 'weekday' | 'weekend',
    videoId: string,
    metrics: {
      views: number;
      ctr: number;
      avgViewDuration: number;
    },
  ): Promise<void> {
    await this.ensureInitialized();

    const armId = `${format}_${dayType}_${timeSlot.replace(':', '')}`;

    const arms = await db.select().from(postingTimeArms).where(eq(postingTimeArms.id, armId));

    if (arms.length === 0) {
      console.warn(`⚠️ Unknown posting time arm: ${armId}`);
      return;
    }

    const arm = arms[0];

    let isSuccess = false;

    if (metrics.views < SUCCESS_THRESHOLD.minViews) {
      isSuccess = false;
    } else {
      isSuccess = metrics.ctr > SUCCESS_THRESHOLD.minCTR || metrics.avgViewDuration > SUCCESS_THRESHOLD.minAVD;
    }

    const currentTrials = arm.trials || 0;
    const n = currentTrials + 1;
    const currentAvgViews = arm.avgViews || 0;
    const currentAvgCtr = arm.avgCtr || 0;
    const currentAvgAvd = arm.avgAvd || 0;

    const newAvgViews = (currentAvgViews * currentTrials + metrics.views) / n;
    const newAvgCtr = (currentAvgCtr * currentTrials + metrics.ctr) / n;
    const newAvgAvd = (currentAvgAvd * currentTrials + metrics.avgViewDuration) / n;

    await db
      .update(postingTimeArms)
      .set({
        alpha: isSuccess ? arm.alpha + 1 : arm.alpha,
        beta: isSuccess ? arm.beta : arm.beta + 1,
        successes: isSuccess ? arm.successes + 1 : arm.successes,
        avgViews: newAvgViews,
        avgCtr: newAvgCtr,
        avgAvd: newAvgAvd,
        lastUpdated: new Date(),
      })
      .where(eq(postingTimeArms.id, armId));

    if (isSuccess) {
      console.log(
        `✅ POSTING TIME BANDIT: "${arm.timeSlot} ${arm.dayType}" SUCCESS (views: ${metrics.views}, CTR: ${metrics.ctr}%)`,
      );
    } else {
      console.log(
        `❌ POSTING TIME BANDIT: "${arm.timeSlot} ${arm.dayType}" FAILURE (views: ${metrics.views}, CTR: ${metrics.ctr}%)`,
      );
    }
  }

  /**
   * Get all arms from the database
   */
  async getArms(): Promise<PostingTimeArm[]> {
    await this.ensureInitialized();
    return db.select().from(postingTimeArms);
  }

  /**
   * Get performance stats for all arms
   */
  async getArmStats(): Promise<{
    arms: Array<{
      id: string;
      timeSlot: string;
      dayType: string;
      format: string;
      trials: number;
      successes: number;
      successRate: number;
      avgViews: number;
      avgCtr: number;
      avgAvd: number;
    }>;
    totalTrials: number;
    bestByFormat: Record<string, { armId: string; timeSlot: string; dayType: string; successRate: number }>;
  }> {
    await this.ensureInitialized();

    const allArms = await db.select().from(postingTimeArms);

    const arms = allArms
      .map((arm) => ({
        id: arm.id,
        timeSlot: arm.timeSlot,
        dayType: arm.dayType,
        format: arm.format,
        trials: arm.trials,
        successes: arm.successes,
        successRate: arm.alpha / (arm.alpha + arm.beta),
        avgViews: arm.avgViews || 0,
        avgCtr: arm.avgCtr || 0,
        avgAvd: arm.avgAvd || 0,
      }))
      .sort((a, b) => b.successRate - a.successRate);

    const bestByFormat: Record<string, { armId: string; timeSlot: string; dayType: string; successRate: number }> = {};

    for (const format of FORMATS) {
      for (const dayType of DAY_TYPES) {
        const key = `${format}_${dayType}`;
        const relevantArms = arms.filter((a) => a.format === format && a.dayType === dayType);
        if (relevantArms.length > 0) {
          const best = relevantArms[0];
          bestByFormat[key] = {
            armId: best.id,
            timeSlot: best.timeSlot,
            dayType: best.dayType,
            successRate: best.successRate,
          };
        }
      }
    }

    return {
      arms,
      totalTrials: arms.reduce((sum, a) => sum + a.trials, 0),
      bestByFormat,
    };
  }

  /**
   * Get recommended posting schedule for the week
   */
  async getRecommendedSchedule(): Promise<{
    shorts: {
      weekday: { timeSlot: string; confidence: number } | null;
      weekend: { timeSlot: string; confidence: number } | null;
    };
    long_form: {
      weekday: { timeSlot: string; confidence: number } | null;
      weekend: { timeSlot: string; confidence: number } | null;
    };
    insights: string[];
  }> {
    await this.ensureInitialized();

    const allArms = await db.select().from(postingTimeArms);

    const schedule: {
      shorts: {
        weekday: { timeSlot: string; confidence: number } | null;
        weekend: { timeSlot: string; confidence: number } | null;
      };
      long_form: {
        weekday: { timeSlot: string; confidence: number } | null;
        weekend: { timeSlot: string; confidence: number } | null;
      };
      insights: string[];
    } = {
      shorts: { weekday: null, weekend: null },
      long_form: { weekday: null, weekend: null },
      insights: [],
    };

    for (const format of FORMATS) {
      for (const dayType of DAY_TYPES) {
        const relevantArms = allArms
          .filter((arm) => arm.format === format && arm.dayType === dayType)
          .map((arm) => ({
            arm,
            successRate: arm.alpha / (arm.alpha + arm.beta),
          }))
          .sort((a, b) => b.successRate - a.successRate);

        if (relevantArms.length > 0) {
          const best = relevantArms[0];
          const confidence = Math.min(0.95, best.arm.trials / (best.arm.trials + 10));
          schedule[format][dayType] = {
            timeSlot: best.arm.timeSlot,
            confidence,
          };

          if (best.arm.trials >= 5) {
            schedule.insights.push(
              `${format} on ${dayType}s: Best time is ${best.arm.timeSlot} (${(best.successRate * 100).toFixed(0)}% success rate, ${best.arm.trials} trials)`,
            );
          } else {
            schedule.insights.push(`${format} on ${dayType}s: Still exploring - only ${best.arm.trials} trials so far`);
          }
        }
      }
    }

    return schedule;
  }
}

export const postingTimeBandit = new PostingTimeBanditService();
