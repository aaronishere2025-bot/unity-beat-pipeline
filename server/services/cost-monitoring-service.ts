/**
 * Cost Monitoring Service
 *
 * Tracks OpenAI spending, calculates savings from optimizations,
 * and provides alerts when approaching limits.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

export interface CostSummary {
  today: number;
  yesterday: number;
  thisWeek: number;
  thisMonth: number;
  breakdown: {
    service: string;
    model: string;
    cost: number;
    calls: number;
  }[];
}

export interface SavingsReport {
  estimatedWithoutOptimization: number;
  actualSpent: number;
  totalSavings: number;
  savingsPercentage: number;
  optimizations: {
    name: string;
    description: string;
    estimatedMonthlySavings: number;
    active: boolean;
  }[];
}

class CostMonitoringService {
  /**
   * Get cost summary for different time periods
   */
  async getCostSummary(): Promise<CostSummary> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get costs by period
    const results = await db.execute(sql`
      SELECT
        SUM(CASE WHEN created_at >= ${today.toISOString()} THEN CAST(cost AS DECIMAL) ELSE 0 END) as today_cost,
        SUM(CASE WHEN created_at >= ${yesterday.toISOString()} AND created_at < ${today.toISOString()} THEN CAST(cost AS DECIMAL) ELSE 0 END) as yesterday_cost,
        SUM(CASE WHEN created_at >= ${weekAgo.toISOString()} THEN CAST(cost AS DECIMAL) ELSE 0 END) as week_cost,
        SUM(CASE WHEN created_at >= ${monthStart.toISOString()} THEN CAST(cost AS DECIMAL) ELSE 0 END) as month_cost
      FROM api_usage
      WHERE service = 'openai'
    `);

    const row: any = results.rows[0];

    // Get breakdown by service and model
    const breakdown = await db.execute(sql`
      SELECT
        service,
        model,
        SUM(CAST(cost AS DECIMAL)) as total_cost,
        COUNT(*) as call_count
      FROM api_usage
      WHERE created_at >= ${monthStart.toISOString()}
      GROUP BY service, model
      ORDER BY total_cost DESC
    `);

    return {
      today: parseFloat(row?.today_cost || '0'),
      yesterday: parseFloat(row?.yesterday_cost || '0'),
      thisWeek: parseFloat(row?.week_cost || '0'),
      thisMonth: parseFloat(row?.month_cost || '0'),
      breakdown: breakdown.rows.map((r: any) => ({
        service: r.service,
        model: r.model,
        cost: parseFloat(r.total_cost || '0'),
        calls: parseInt(r.call_count || '0', 10),
      })),
    };
  }

  /**
   * Calculate savings from optimizations
   */
  async getSavingsReport(): Promise<SavingsReport> {
    const costs = await this.getCostSummary();

    // Cost per strategic summary with different approaches
    const COST_GPT4O_SYNC = 3.0; // Old way: gpt-4o synchronous
    const COST_GPT4O_BATCH = 1.5; // Batch API: 50% off
    const COST_GPT4O_MINI_SYNC = 0.3; // gpt-4o-mini synchronous
    const COST_GPT4O_MINI_BATCH = 0.15; // Batch + mini: 95% savings
    const COST_FLEX_MINI_CACHE = 0.1; // Flex + mini + caching: 97% savings

    // Estimate what we WOULD have spent without optimizations
    // Assume 1 strategic summary per day = 30 per month
    const dailySummaries = 30;
    const estimatedOldCost = dailySummaries * COST_GPT4O_SYNC; // $90/month

    const optimizations = [
      {
        name: 'Batch API',
        description: '50% discount on asynchronous processing',
        estimatedMonthlySavings: dailySummaries * (COST_GPT4O_SYNC - COST_GPT4O_BATCH),
        active: false, // Will be true when user enables it
      },
      {
        name: 'GPT-4o-mini for Non-Critical Tasks',
        description: '90% cost reduction for pattern analysis and consensus',
        estimatedMonthlySavings: dailySummaries * (COST_GPT4O_SYNC - COST_GPT4O_MINI_SYNC),
        active: false, // Will be true when integrated
      },
      {
        name: 'Batch API + GPT-4o-mini',
        description: 'Combined: 95% cost reduction',
        estimatedMonthlySavings: dailySummaries * (COST_GPT4O_SYNC - COST_GPT4O_MINI_BATCH),
        active: false,
      },
      {
        name: 'Flex Processing + Caching',
        description: 'Maximum savings: 97% cost reduction',
        estimatedMonthlySavings: dailySummaries * (COST_GPT4O_SYNC - COST_FLEX_MINI_CACHE),
        active: false,
      },
      {
        name: 'Scheduler Disabled',
        description: 'No automatic runs (manual only)',
        estimatedMonthlySavings: estimatedOldCost, // Saves 100% of automatic costs
        active: true, // Currently active
      },
    ];

    const totalPotentialSavings = optimizations
      .filter((o) => o.active)
      .reduce((sum, o) => sum + o.estimatedMonthlySavings, 0);

    return {
      estimatedWithoutOptimization: estimatedOldCost,
      actualSpent: costs.thisMonth,
      totalSavings: totalPotentialSavings,
      savingsPercentage: (totalPotentialSavings / estimatedOldCost) * 100,
      optimizations,
    };
  }

  /**
   * Check if spending is approaching limits
   */
  async checkSpendingAlerts(): Promise<{
    alerts: Array<{ level: 'info' | 'warning' | 'critical'; message: string }>;
  }> {
    const costs = await this.getCostSummary();
    const alerts: Array<{ level: 'info' | 'warning' | 'critical'; message: string }> = [];

    // Daily limit: $10
    const DAILY_LIMIT = 10;
    if (costs.today > DAILY_LIMIT * 0.9) {
      alerts.push({
        level: 'critical',
        message: `Daily spending at $${costs.today.toFixed(2)} (90% of $${DAILY_LIMIT} limit)`,
      });
    } else if (costs.today > DAILY_LIMIT * 0.75) {
      alerts.push({
        level: 'warning',
        message: `Daily spending at $${costs.today.toFixed(2)} (75% of $${DAILY_LIMIT} limit)`,
      });
    }

    // Monthly limit: $200
    const MONTHLY_LIMIT = 200;
    if (costs.thisMonth > MONTHLY_LIMIT * 0.9) {
      alerts.push({
        level: 'critical',
        message: `Monthly spending at $${costs.thisMonth.toFixed(2)} (90% of $${MONTHLY_LIMIT} limit)`,
      });
    } else if (costs.thisMonth > MONTHLY_LIMIT * 0.75) {
      alerts.push({
        level: 'warning',
        message: `Monthly spending at $${costs.thisMonth.toFixed(2)} (75% of $${MONTHLY_LIMIT} limit)`,
      });
    } else if (costs.thisMonth > MONTHLY_LIMIT * 0.5) {
      alerts.push({
        level: 'info',
        message: `Monthly spending at $${costs.thisMonth.toFixed(2)} (50% of $${MONTHLY_LIMIT} limit)`,
      });
    }

    // Compare to yesterday
    if (costs.today > costs.yesterday * 2) {
      alerts.push({
        level: 'warning',
        message: `Today's spending ($${costs.today.toFixed(2)}) is 2x yesterday ($${costs.yesterday.toFixed(2)})`,
      });
    }

    return { alerts };
  }

  /**
   * Get daily cost trend for the last 7 days
   */
  async getDailyTrend(): Promise<Array<{ date: string; cost: number; calls: number }>> {
    const results = await db.execute(sql`
      SELECT
        DATE(created_at) as date,
        SUM(CAST(cost AS DECIMAL)) as total_cost,
        COUNT(*) as call_count
      FROM api_usage
      WHERE service = 'openai'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    return results.rows.map((r: any) => ({
      date: r.date,
      cost: parseFloat(r.total_cost || '0'),
      calls: parseInt(r.call_count || '0', 10),
    }));
  }
}

export const costMonitoringService = new CostMonitoringService();
