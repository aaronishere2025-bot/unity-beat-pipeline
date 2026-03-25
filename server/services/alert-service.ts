/**
 * ALERT SERVICE
 *
 * Monitors for alert-worthy conditions and sends notifications.
 * Integrates with error-monitor.ts for intelligent alerting.
 *
 * Alert Types:
 * - repeated_error: Same error occurring 3+ times in 1 hour
 * - critical_error: Critical severity errors
 * - high_failure_rate: Job failure rate > 30% in last hour
 * - rate_limit: API rate limit errors
 * - database_connection: Database connection failures
 * - cost_overrun: Cost exceeding budget by 20%+
 */

import { db } from '../db';
import { alerts, jobs, errorReports } from '@shared/schema';
import { sql, and, gte, eq, desc, isNull } from 'drizzle-orm';
import type { ErrorReport } from './error-monitor';
import { apiCostTracker } from './api-cost-tracker';

// ============================================================================
// TYPES
// ============================================================================

export interface AlertCondition {
  type:
    | 'repeated_error'
    | 'critical_error'
    | 'high_failure_rate'
    | 'rate_limit'
    | 'database_connection'
    | 'cost_overrun';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  metadata: Record<string, any>;
}

export interface AlertConfig {
  // Repeated error threshold
  repeatedErrorThreshold: number; // default: 3 occurrences
  repeatedErrorWindow: number; // default: 1 hour (in minutes)

  // Failure rate threshold
  failureRateThreshold: number; // default: 0.30 (30%)
  failureRateWindow: number; // default: 1 hour (in minutes)

  // Cost overrun threshold
  costOverrunThreshold: number; // default: 0.20 (20% over budget)
  dailyCostBudget: number; // default: $50

  // Deduplication window
  deduplicationWindow: number; // default: 15 minutes
}

const DEFAULT_CONFIG: AlertConfig = {
  repeatedErrorThreshold: 3,
  repeatedErrorWindow: 60,
  failureRateThreshold: 0.3,
  failureRateWindow: 60,
  costOverrunThreshold: 0.2,
  dailyCostBudget: 50.0,
  deduplicationWindow: 15,
};

// ============================================================================
// DISCORD WEBHOOK
// ============================================================================

const SEVERITY_COLORS: Record<string, number> = {
  critical: 0xff0000, // Red
  high: 0xff8c00, // Dark Orange
  medium: 0xffd700, // Gold
  low: 0x3498db, // Blue
};

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🚨',
  high: '⚠️',
  medium: '⚡',
  low: 'ℹ️',
};

/**
 * Send a raw Discord embed via webhook. Reusable by other services.
 */
export async function sendDiscordEmbed(embed: {
  title: string;
  description: string;
  color: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  footer?: { text: string };
  timestamp?: string;
}): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [{ ...embed, timestamp: embed.timestamp || new Date().toISOString() }] }),
    });

    if (!response.ok) {
      console.error(`[Alert Service] Discord embed failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('[Alert Service] Discord embed error:', error);
  }
}

async function sendDiscordWebhook(condition: AlertCondition, alertId: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const fields = Object.entries(condition.metadata)
      .filter(([_, v]) => v !== undefined && v !== null)
      .slice(0, 6) // Discord max 25, keep it concise
      .map(([key, value]) => ({
        name: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
        value: String(value).slice(0, 256),
        inline: true,
      }));

    const embed = {
      title: `${SEVERITY_EMOJI[condition.severity] || '📢'} ${condition.title}`,
      description: condition.message,
      color: SEVERITY_COLORS[condition.severity] || 0x808080,
      fields,
      footer: { text: `Alert ID: ${alertId} | Unity AI` },
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      console.error(`[Alert Service] Discord webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('[Alert Service] Discord webhook error:', error);
  }
}

// ============================================================================
// ALERT SERVICE CLASS
// ============================================================================

class AlertService {
  private config: AlertConfig;

  constructor(config?: Partial<AlertConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check for alert-worthy conditions after an error
   */
  async checkConditionsAfterError(errorReport: ErrorReport): Promise<void> {
    const conditions: AlertCondition[] = [];

    // Check for critical errors
    if (errorReport.severity === 'critical') {
      conditions.push({
        type: 'critical_error',
        severity: 'critical',
        title: `Critical Error: ${errorReport.errorType}`,
        message: `A critical error occurred in ${errorReport.context.service}: ${errorReport.errorMessage}`,
        metadata: {
          errorId: errorReport.id,
          errorType: errorReport.errorType,
          service: errorReport.context.service,
          jobId: errorReport.context.jobId,
        },
      });
    }

    // Check for repeated errors
    if (errorReport.occurrenceCount >= this.config.repeatedErrorThreshold) {
      const timeWindow = new Date(Date.now() - this.config.repeatedErrorWindow * 60 * 1000);

      conditions.push({
        type: 'repeated_error',
        severity: 'high',
        title: `Repeated Error: ${errorReport.errorType}`,
        message: `Error "${errorReport.errorMessage}" has occurred ${errorReport.occurrenceCount} times in the last ${this.config.repeatedErrorWindow} minutes`,
        metadata: {
          errorId: errorReport.id,
          errorType: errorReport.errorType,
          service: errorReport.context.service,
          occurrenceCount: errorReport.occurrenceCount,
          timeWindow: `${this.config.repeatedErrorWindow}m`,
          threshold: this.config.repeatedErrorThreshold,
          currentValue: errorReport.occurrenceCount,
        },
      });
    }

    // Check for rate limit errors
    if (
      errorReport.errorType === 'API_ERROR' &&
      (errorReport.errorMessage.includes('rate limit') || errorReport.errorMessage.includes('429'))
    ) {
      conditions.push({
        type: 'rate_limit',
        severity: 'high',
        title: 'API Rate Limit Reached',
        message: `Rate limit hit for ${errorReport.context.service}: ${errorReport.errorMessage}`,
        metadata: {
          errorId: errorReport.id,
          service: errorReport.context.service,
          errorType: errorReport.errorType,
        },
      });
    }

    // Check for database errors
    if (errorReport.errorType === 'DATABASE_ERROR') {
      conditions.push({
        type: 'database_connection',
        severity: 'critical',
        title: 'Database Connection Error',
        message: `Database error in ${errorReport.context.service}: ${errorReport.errorMessage}`,
        metadata: {
          errorId: errorReport.id,
          service: errorReport.context.service,
          errorType: errorReport.errorType,
        },
      });
    }

    // Trigger alerts for all conditions
    for (const condition of conditions) {
      await this.triggerAlert(condition);
    }
  }

  /**
   * Check for high failure rate
   */
  async checkFailureRate(): Promise<void> {
    const timeWindow = new Date(Date.now() - this.config.failureRateWindow * 60 * 1000);

    try {
      // Query job stats from last hour
      const recentJobs = await db
        .select({
          total: sql<number>`count(*)`,
          failed: sql<number>`count(*) filter (where status = 'failed')`,
        })
        .from(jobs)
        .where(gte(jobs.createdAt, timeWindow));

      if (recentJobs.length === 0 || !recentJobs[0].total) {
        return;
      }

      const total = Number(recentJobs[0].total);
      const failed = Number(recentJobs[0].failed);
      const failureRate = total > 0 ? failed / total : 0;

      if (failureRate > this.config.failureRateThreshold) {
        await this.triggerAlert({
          type: 'high_failure_rate',
          severity: 'high',
          title: 'High Job Failure Rate',
          message: `${(failureRate * 100).toFixed(1)}% of jobs failed in the last ${this.config.failureRateWindow} minutes (${failed}/${total})`,
          metadata: {
            failureRate: failureRate,
            timeWindow: `${this.config.failureRateWindow}m`,
            threshold: this.config.failureRateThreshold,
            currentValue: failureRate,
            affectedJobs: [],
          },
        });
      }
    } catch (error) {
      console.error('[Alert Service] Failed to check failure rate:', error);
    }
  }

  /**
   * Check for cost overruns
   */
  async checkCostOverrun(): Promise<void> {
    try {
      const stats = await apiCostTracker.getCostSummary('today');
      const totalCost = stats.totalCost;
      const budget = this.config.dailyCostBudget;
      const overrunThreshold = budget * (1 + this.config.costOverrunThreshold);

      if (totalCost > overrunThreshold) {
        const percentOver = ((totalCost - budget) / budget) * 100;

        await this.triggerAlert({
          type: 'cost_overrun',
          severity: 'high',
          title: 'Daily Cost Budget Exceeded',
          message: `Today's API costs ($${totalCost.toFixed(2)}) exceed budget ($${budget.toFixed(2)}) by ${percentOver.toFixed(1)}%`,
          metadata: {
            costAmount: totalCost,
            budgetAmount: budget,
            threshold: this.config.costOverrunThreshold,
            currentValue: (totalCost - budget) / budget,
          },
        });
      }
    } catch (error) {
      console.error('[Alert Service] Failed to check cost overrun:', error);
    }
  }

  /**
   * Trigger an alert (with deduplication)
   */
  async triggerAlert(condition: AlertCondition): Promise<void> {
    try {
      // Generate deduplication key
      const deduplicationKey = this.generateDeduplicationKey(condition);

      // Check for recent duplicate alerts
      const deduplicationWindow = new Date(Date.now() - this.config.deduplicationWindow * 60 * 1000);

      const existingAlert = await db
        .select()
        .from(alerts)
        .where(
          and(
            eq(alerts.deduplicationKey, deduplicationKey),
            gte(alerts.lastTriggered, deduplicationWindow),
            eq(alerts.resolved, false),
          ),
        )
        .limit(1);

      if (existingAlert.length > 0) {
        // Update existing alert
        const alert = existingAlert[0];
        await db
          .update(alerts)
          .set({
            lastTriggered: new Date(),
            triggerCount: alert.triggerCount + 1,
            metadata: condition.metadata,
          })
          .where(eq(alerts.id, alert.id));

        console.log(`[Alert Service] Updated existing alert ${alert.id} (count: ${alert.triggerCount + 1})`);
        return;
      }

      // Create new alert
      const alertId = this.generateAlertId();

      await db.insert(alerts).values({
        id: alertId,
        type: condition.type,
        severity: condition.severity,
        title: condition.title,
        message: condition.message,
        metadata: condition.metadata,
        resolved: false,
        deduplicationKey,
        lastTriggered: new Date(),
        triggerCount: 1,
      });

      // Log to console
      this.logAlert(alertId, condition);

      // Send Discord notification for new alerts
      await sendDiscordWebhook(condition, alertId);
    } catch (error) {
      console.error('[Alert Service] Failed to trigger alert:', error);
    }
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy: string, notes?: string): Promise<boolean> {
    try {
      const result = await db
        .update(alerts)
        .set({
          resolved: true,
          resolvedAt: new Date(),
          resolvedBy,
          resolutionNotes: notes,
        })
        .where(eq(alerts.id, alertId));

      console.log(`[Alert Service] Resolved alert ${alertId} by ${resolvedBy}`);
      return true;
    } catch (error) {
      console.error('[Alert Service] Failed to resolve alert:', error);
      return false;
    }
  }

  /**
   * Get recent alerts
   */
  async getRecentAlerts(
    options: {
      limit?: number;
      resolved?: boolean;
      severity?: string;
      type?: string;
    } = {},
  ): Promise<any[]> {
    try {
      const { limit = 50, resolved, severity, type } = options;

      let query = db.select().from(alerts);

      const conditions = [];
      if (resolved !== undefined) {
        conditions.push(eq(alerts.resolved, resolved));
      }
      if (severity) {
        conditions.push(eq(alerts.severity, severity));
      }
      if (type) {
        conditions.push(eq(alerts.type, type));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const results = await query.orderBy(desc(alerts.createdAt)).limit(limit);

      return results;
    } catch (error) {
      console.error('[Alert Service] Failed to get recent alerts:', error);
      return [];
    }
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(): Promise<{
    total: number;
    unresolved: number;
    resolved: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    averageResolutionTime: number;
    recentAlerts: any[];
  }> {
    try {
      const allAlerts = await db.select().from(alerts);

      const stats = {
        total: allAlerts.length,
        unresolved: allAlerts.filter((a) => !a.resolved).length,
        resolved: allAlerts.filter((a) => a.resolved).length,
        bySeverity: {} as Record<string, number>,
        byType: {} as Record<string, number>,
        averageResolutionTime: 0,
        recentAlerts: [] as any[],
      };

      // Count by severity and type
      for (const alert of allAlerts) {
        stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
        stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
      }

      // Calculate average resolution time
      const resolvedAlerts = allAlerts.filter((a) => a.resolved && a.resolvedAt);
      if (resolvedAlerts.length > 0) {
        const totalResolutionTime = resolvedAlerts.reduce((sum, alert) => {
          const created = new Date(alert.createdAt).getTime();
          const resolved = new Date(alert.resolvedAt!).getTime();
          return sum + (resolved - created);
        }, 0);
        stats.averageResolutionTime = totalResolutionTime / resolvedAlerts.length / 1000 / 60; // in minutes
      }

      // Get recent unresolved alerts
      stats.recentAlerts = await this.getRecentAlerts({ limit: 10, resolved: false });

      return stats;
    } catch (error) {
      console.error('[Alert Service] Failed to get alert stats:', error);
      return {
        total: 0,
        unresolved: 0,
        resolved: 0,
        bySeverity: {},
        byType: {},
        averageResolutionTime: 0,
        recentAlerts: [],
      };
    }
  }

  /**
   * Auto-resolve alerts when conditions are fixed
   */
  async autoResolveAlerts(): Promise<void> {
    try {
      // Get all unresolved alerts
      const unresolvedAlerts = await this.getRecentAlerts({ resolved: false, limit: 100 });

      for (const alert of unresolvedAlerts) {
        let shouldResolve = false;
        let resolutionNotes = '';

        switch (alert.type) {
          case 'repeated_error':
            // Check if error hasn't occurred recently
            if (alert.metadata?.errorId) {
              const recentErrors = await db
                .select()
                .from(errorReports)
                .where(
                  and(
                    eq(errorReports.id, alert.metadata.errorId),
                    gte(errorReports.lastSeen, new Date(Date.now() - 60 * 60 * 1000)), // last hour
                  ),
                );

              if (recentErrors.length === 0) {
                shouldResolve = true;
                resolutionNotes = 'Error has not occurred in the last hour';
              }
            }
            break;

          case 'high_failure_rate':
            // Check current failure rate
            const timeWindow = new Date(Date.now() - this.config.failureRateWindow * 60 * 1000);
            const recentJobs = await db
              .select({
                total: sql<number>`count(*)`,
                failed: sql<number>`count(*) filter (where status = 'failed')`,
              })
              .from(jobs)
              .where(gte(jobs.createdAt, timeWindow));

            if (recentJobs.length > 0 && recentJobs[0].total) {
              const total = Number(recentJobs[0].total);
              const failed = Number(recentJobs[0].failed);
              const currentRate = total > 0 ? failed / total : 0;

              if (currentRate <= this.config.failureRateThreshold) {
                shouldResolve = true;
                resolutionNotes = `Failure rate normalized to ${(currentRate * 100).toFixed(1)}%`;
              }
            }
            break;

          case 'cost_overrun':
            // Cost alerts typically require manual review
            break;
        }

        if (shouldResolve) {
          await this.resolveAlert(alert.id, 'system', resolutionNotes);
        }
      }
    } catch (error) {
      console.error('[Alert Service] Failed to auto-resolve alerts:', error);
    }
  }

  /**
   * Generate deduplication key
   */
  private generateDeduplicationKey(condition: AlertCondition): string {
    const parts = [condition.type, condition.metadata.errorType || '', condition.metadata.service || ''];
    return parts.filter(Boolean).join(':');
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log alert to console
   */
  private logAlert(alertId: string, condition: AlertCondition): void {
    const icon =
      condition.severity === 'critical'
        ? '🚨'
        : condition.severity === 'high'
          ? '⚠️'
          : condition.severity === 'medium'
            ? '⚡'
            : 'ℹ️';

    console.log('');
    console.log('━'.repeat(80));
    console.log(`${icon} [ALERT] ${condition.severity.toUpperCase()}: ${condition.title}`);
    console.log('━'.repeat(80));
    console.log(`Message: ${condition.message}`);
    console.log(`Type: ${condition.type}`);
    console.log(`ID: ${alertId}`);
    if (Object.keys(condition.metadata).length > 0) {
      console.log(`Metadata:`, JSON.stringify(condition.metadata, null, 2));
    }
    console.log('━'.repeat(80));
    console.log('');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[Alert Service] Configuration updated:', config);
  }

  /**
   * Get current configuration
   */
  getConfig(): AlertConfig {
    return { ...this.config };
  }
}

// Export singleton
export const alertService = new AlertService();

// Export for testing with custom config
export { AlertService };
