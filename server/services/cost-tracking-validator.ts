import { db } from '../db';
import { jobs, apiUsage } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { API_COSTS } from '../config/pricing.js';

/**
 * Cost Tracking Validator
 *
 * Validates that:
 * - All API calls are logged to api_usage table
 * - Job total cost matches sum of API usage (within tolerance)
 * - No hardcoded costs are being used
 * - Failed attempts are logged
 *
 * Usage:
 *   const report = await costTrackingValidator.validateJob(jobId);
 *   if (report.hasGaps) {
 *     console.error('Cost tracking gaps detected:', report.gaps);
 *   }
 */

export interface CostValidationReport {
  jobId: string;
  jobMode: string;
  jobStatus: string;

  // Cost comparison
  jobActualCost: number;
  apiUsageSum: number;
  difference: number;
  differencePercent: number;
  withinTolerance: boolean;

  // API call breakdown
  apiCallCount: number;
  successfulCalls: number;
  failedCalls: number;

  // Service breakdown
  serviceBreakdown: {
    service: string;
    calls: number;
    totalCost: number;
    successRate: number;
  }[];

  // Gap detection
  hasGaps: boolean;
  gaps: string[];
  warnings: string[];

  // Validation result
  isValid: boolean;
  validationErrors: string[];
}

export interface SystemWideCostReport {
  totalJobs: number;
  jobsWithGaps: number;
  jobsWithExcessiveDifference: number;

  totalCostTracked: number;
  totalCostReported: number;

  averageDifference: number;
  maxDifference: number;

  gapsByService: Record<string, number>;
  commonIssues: string[];
}

class CostTrackingValidator {
  private static instance: CostTrackingValidator;

  // Tolerance for cost differences (±1 cent = $0.01)
  private readonly TOLERANCE_USD = 0.01;

  // Tolerance percentage (5%)
  private readonly TOLERANCE_PERCENT = 5.0;

  static getInstance(): CostTrackingValidator {
    if (!CostTrackingValidator.instance) {
      CostTrackingValidator.instance = new CostTrackingValidator();
    }
    return CostTrackingValidator.instance;
  }

  /**
   * Validate cost tracking for a specific job
   */
  async validateJob(jobId: string): Promise<CostValidationReport> {
    // Get job details
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Get all API usage for this job
    const apiUsageRecords = await db.select().from(apiUsage).where(eq(apiUsage.jobId, jobId));

    // Calculate totals
    const jobActualCost = parseFloat(job.actualCostUSD || '0');
    const apiUsageSum = apiUsageRecords.reduce((sum, record) => sum + parseFloat(record.cost || '0'), 0);

    const difference = Math.abs(jobActualCost - apiUsageSum);
    const differencePercent = jobActualCost > 0 ? (difference / jobActualCost) * 100 : 0;

    const withinTolerance = difference <= this.TOLERANCE_USD || differencePercent <= this.TOLERANCE_PERCENT;

    // Count calls
    const apiCallCount = apiUsageRecords.length;
    const successfulCalls = apiUsageRecords.filter((r) => r.success).length;
    const failedCalls = apiCallCount - successfulCalls;

    // Service breakdown
    const serviceMap = new Map<string, { calls: number; cost: number; successes: number }>();

    for (const record of apiUsageRecords) {
      const service = record.service || 'unknown';
      if (!serviceMap.has(service)) {
        serviceMap.set(service, { calls: 0, cost: 0, successes: 0 });
      }

      const stats = serviceMap.get(service)!;
      stats.calls++;
      stats.cost += parseFloat(record.cost || '0');
      if (record.success) stats.successes++;
    }

    const serviceBreakdown = Array.from(serviceMap.entries()).map(([service, stats]) => ({
      service,
      calls: stats.calls,
      totalCost: stats.cost,
      successRate: stats.calls > 0 ? (stats.successes / stats.calls) * 100 : 0,
    }));

    // Gap detection
    const gaps: string[] = [];
    const warnings: string[] = [];
    const validationErrors: string[] = [];

    // Check for expected API calls based on job mode
    if (job.mode === 'kling' || job.mode === 'unity_kling') {
      // Should have OpenAI calls for prompt generation
      const openaiCalls = apiUsageRecords.filter((r) => r.service === 'openai');
      if (openaiCalls.length === 0) {
        gaps.push('No OpenAI calls found - prompt generation may not be tracked');
      }

      // Should have Kling calls
      const klingCalls = apiUsageRecords.filter((r) => r.service === 'kling');
      if (klingCalls.length === 0) {
        gaps.push('No Kling calls found - video generation may not be tracked');
      }

      // Check if clip count matches
      const clipCount = job.clipCount || 0;
      if (clipCount > 0 && klingCalls.length < clipCount) {
        warnings.push(
          `Expected ${clipCount} Kling calls but found ${klingCalls.length} - some clips may not be tracked`,
        );
      }
    }

    if (job.mode === 'music' || job.mode === 'beats') {
      // Should have Suno calls
      const sunoCalls = apiUsageRecords.filter((r) => r.service === 'suno');
      if (sunoCalls.length === 0) {
        gaps.push('No Suno calls found - music generation may not be tracked');
      }
    }

    // Check for cost difference issues
    if (!withinTolerance) {
      if (apiUsageSum > jobActualCost) {
        validationErrors.push(
          `API usage sum ($${apiUsageSum.toFixed(4)}) exceeds job cost ($${jobActualCost.toFixed(4)}) by $${difference.toFixed(4)}`,
        );
      } else {
        validationErrors.push(
          `Job cost ($${jobActualCost.toFixed(4)}) exceeds API usage sum ($${apiUsageSum.toFixed(4)}) by $${difference.toFixed(4)} - missing tracking?`,
        );
      }
    }

    // Check for zero-cost successful calls (suspicious)
    const zeroCostSuccesses = apiUsageRecords.filter((r) => r.success && parseFloat(r.cost || '0') === 0);
    if (zeroCostSuccesses.length > 0) {
      warnings.push(`Found ${zeroCostSuccesses.length} successful calls with $0 cost - may indicate tracking issues`);
    }

    // Check for failed attempts (good - means we're tracking failures)
    if (failedCalls > 0) {
      // This is actually good - we're tracking failures
      // Just informational
    }

    const hasGaps = gaps.length > 0;
    const isValid = validationErrors.length === 0 && !hasGaps;

    return {
      jobId,
      jobMode: job.mode || 'unknown',
      jobStatus: job.status || 'unknown',
      jobActualCost,
      apiUsageSum,
      difference,
      differencePercent,
      withinTolerance,
      apiCallCount,
      successfulCalls,
      failedCalls,
      serviceBreakdown,
      hasGaps,
      gaps,
      warnings,
      isValid,
      validationErrors,
    };
  }

  /**
   * Validate cost tracking across all completed jobs
   */
  async validateAllJobs(limit: number = 100): Promise<SystemWideCostReport> {
    // Get recent completed jobs
    const completedJobs = await db
      .select()
      .from(jobs)
      .where(eq(jobs.status, 'completed'))
      .orderBy(sql`${jobs.createdAt} DESC`)
      .limit(limit);

    let jobsWithGaps = 0;
    let jobsWithExcessiveDifference = 0;
    let totalCostTracked = 0;
    let totalCostReported = 0;
    let totalDifference = 0;
    let maxDifference = 0;

    const gapsByService: Record<string, number> = {};
    const commonIssues: string[] = [];
    const issueCount: Record<string, number> = {};

    for (const job of completedJobs) {
      try {
        const report = await this.validateJob(job.id);

        totalCostTracked += report.apiUsageSum;
        totalCostReported += report.jobActualCost;
        totalDifference += report.difference;

        if (report.difference > maxDifference) {
          maxDifference = report.difference;
        }

        if (report.hasGaps) {
          jobsWithGaps++;

          // Track which services have gaps
          for (const gap of report.gaps) {
            const service = gap.split(' ')[0]; // Extract service name
            gapsByService[service] = (gapsByService[service] || 0) + 1;
          }
        }

        if (!report.withinTolerance) {
          jobsWithExcessiveDifference++;
        }

        // Track common validation errors
        for (const error of report.validationErrors) {
          issueCount[error] = (issueCount[error] || 0) + 1;
        }

        // Track common gaps
        for (const gap of report.gaps) {
          issueCount[gap] = (issueCount[gap] || 0) + 1;
        }
      } catch (error) {
        console.error(`Failed to validate job ${job.id}:`, error);
      }
    }

    // Get top 5 most common issues
    const sortedIssues = Object.entries(issueCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue, count]) => `${issue} (${count} jobs)`);

    const averageDifference = completedJobs.length > 0 ? totalDifference / completedJobs.length : 0;

    return {
      totalJobs: completedJobs.length,
      jobsWithGaps,
      jobsWithExcessiveDifference,
      totalCostTracked,
      totalCostReported,
      averageDifference,
      maxDifference,
      gapsByService,
      commonIssues: sortedIssues,
    };
  }

  /**
   * Check if a specific service is properly tracking costs
   */
  async validateService(
    serviceName: string,
    limit: number = 50,
  ): Promise<{
    service: string;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    totalCost: number;
    averageCost: number;
    recentCalls: any[];
  }> {
    const recentCalls = await db
      .select()
      .from(apiUsage)
      .where(eq(apiUsage.service, serviceName))
      .orderBy(sql`${apiUsage.createdAt} DESC`)
      .limit(limit);

    const totalCalls = recentCalls.length;
    const successfulCalls = recentCalls.filter((r) => r.success).length;
    const failedCalls = totalCalls - successfulCalls;
    const totalCost = recentCalls.reduce((sum, r) => sum + parseFloat(r.cost || '0'), 0);
    const averageCost = totalCalls > 0 ? totalCost / totalCalls : 0;

    return {
      service: serviceName,
      totalCalls,
      successfulCalls,
      failedCalls,
      totalCost,
      averageCost,
      recentCalls: recentCalls.slice(0, 10), // Return top 10 for inspection
    };
  }

  /**
   * Alert if cost tracking gaps are detected
   */
  async checkForGapsAndAlert(jobId: string): Promise<void> {
    const report = await this.validateJob(jobId);

    if (report.hasGaps) {
      console.warn(`[Cost Validator] Gaps detected in job ${jobId}:`);
      for (const gap of report.gaps) {
        console.warn(`  - ${gap}`);
      }
    }

    if (!report.withinTolerance) {
      console.warn(
        `[Cost Validator] Cost mismatch in job ${jobId}: ` +
          `Job cost $${report.jobActualCost.toFixed(4)} vs ` +
          `API usage $${report.apiUsageSum.toFixed(4)} ` +
          `(difference: $${report.difference.toFixed(4)}, ${report.differencePercent.toFixed(2)}%)`,
      );
    }

    if (report.validationErrors.length > 0) {
      console.error(`[Cost Validator] Validation errors in job ${jobId}:`);
      for (const error of report.validationErrors) {
        console.error(`  - ${error}`);
      }
    }
  }

  /**
   * Get summary statistics for cost tracking system
   */
  async getSystemStats(): Promise<{
    last24Hours: {
      totalCalls: number;
      totalCost: number;
      averageCost: number;
      services: Record<string, { calls: number; cost: number }>;
    };
    last7Days: {
      totalCalls: number;
      totalCost: number;
      averageCost: number;
    };
  }> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Last 24 hours
    const last24HoursCalls = await db
      .select()
      .from(apiUsage)
      .where(sql`${apiUsage.createdAt} >= ${oneDayAgo}`);

    const totalCalls24h = last24HoursCalls.length;
    const totalCost24h = last24HoursCalls.reduce((sum, r) => sum + parseFloat(r.cost || '0'), 0);
    const averageCost24h = totalCalls24h > 0 ? totalCost24h / totalCalls24h : 0;

    // Service breakdown
    const serviceMap = new Map<string, { calls: number; cost: number }>();
    for (const record of last24HoursCalls) {
      const service = record.service || 'unknown';
      if (!serviceMap.has(service)) {
        serviceMap.set(service, { calls: 0, cost: 0 });
      }
      const stats = serviceMap.get(service)!;
      stats.calls++;
      stats.cost += parseFloat(record.cost || '0');
    }

    const services: Record<string, { calls: number; cost: number }> = {};
    for (const [service, stats] of serviceMap.entries()) {
      services[service] = stats;
    }

    // Last 7 days
    const last7DaysCalls = await db
      .select()
      .from(apiUsage)
      .where(sql`${apiUsage.createdAt} >= ${sevenDaysAgo}`);

    const totalCalls7d = last7DaysCalls.length;
    const totalCost7d = last7DaysCalls.reduce((sum, r) => sum + parseFloat(r.cost || '0'), 0);
    const averageCost7d = totalCalls7d > 0 ? totalCost7d / totalCalls7d : 0;

    return {
      last24Hours: {
        totalCalls: totalCalls24h,
        totalCost: totalCost24h,
        averageCost: averageCost24h,
        services,
      },
      last7Days: {
        totalCalls: totalCalls7d,
        totalCost: totalCost7d,
        averageCost: averageCost7d,
      },
    };
  }

  /**
   * Verify that centralized pricing config is being used correctly
   */
  verifyCentralizedPricing(): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check that API_COSTS is defined and has all required services
    if (!API_COSTS) {
      issues.push('API_COSTS not imported from pricing config');
      return { valid: false, issues };
    }

    // Check OpenAI models
    if (!API_COSTS.openai || Object.keys(API_COSTS.openai).length === 0) {
      issues.push('OpenAI pricing not found in config');
    }

    // Check Gemini models
    if (!API_COSTS.gemini || Object.keys(API_COSTS.gemini).length === 0) {
      issues.push('Gemini pricing not found in config');
    }

    // Check Claude models
    if (!API_COSTS.claude || Object.keys(API_COSTS.claude).length === 0) {
      issues.push('Claude pricing not found in config');
    }

    // Check Kling pricing
    if (!API_COSTS.kling || !API_COSTS.kling['kling-3.0']) {
      issues.push('Kling pricing not found in config');
    }

    // Check Suno pricing
    if (!API_COSTS.suno || Object.keys(API_COSTS.suno).length === 0) {
      issues.push('Suno pricing not found in config');
    }

    const valid = issues.length === 0;
    return { valid, issues };
  }

  /**
   * Validate recent jobs from the last N hours
   */
  async validateRecentJobs(hours: number = 24): Promise<{
    summary: {
      totalJobsChecked: number;
      jobsWithIssues: number;
      jobsValid: number;
      coveragePercent: number;
    };
    issues: Array<{
      jobId: string;
      mode: string;
      gaps: string[];
      errors: string[];
    }>;
  }> {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get recent completed jobs
    const recentJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'completed'), sql`${jobs.createdAt} >= ${cutoffTime}`))
      .orderBy(sql`${jobs.createdAt} DESC`);

    const issues: Array<{ jobId: string; mode: string; gaps: string[]; errors: string[] }> = [];
    let jobsWithIssues = 0;
    let jobsValid = 0;

    for (const job of recentJobs) {
      try {
        const report = await this.validateJob(job.id);

        if (!report.isValid || report.hasGaps) {
          jobsWithIssues++;
          issues.push({
            jobId: job.id,
            mode: job.mode || 'unknown',
            gaps: report.gaps,
            errors: report.validationErrors,
          });
        } else {
          jobsValid++;
        }
      } catch (error: any) {
        jobsWithIssues++;
        issues.push({
          jobId: job.id,
          mode: job.mode || 'unknown',
          gaps: [],
          errors: [`Validation failed: ${error.message}`],
        });
      }
    }

    const totalJobsChecked = recentJobs.length;
    const coveragePercent = totalJobsChecked > 0 ? (jobsValid / totalJobsChecked) * 100 : 100;

    return {
      summary: {
        totalJobsChecked,
        jobsWithIssues,
        jobsValid,
        coveragePercent,
      },
      issues,
    };
  }
}

export const costTrackingValidator = CostTrackingValidator.getInstance();
