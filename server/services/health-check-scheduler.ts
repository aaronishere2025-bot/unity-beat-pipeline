/**
 * Health Check Scheduler
 *
 * Runs periodic health checks and triggers alerts for critical issues
 * - Checks every 5 minutes
 * - Console summaries every 15 minutes
 * - Stores snapshots in database
 * - Creates alerts for critical issues
 */

import { systemHealthMonitor, type ComprehensiveHealthReport } from './system-health-monitor';
import { proactiveRemediationAgent } from './proactive-remediation-agent';
import { claudeAutoFixer, type FixableIssue } from './claude-auto-fixer';
import { sendDiscordEmbed } from './alert-service';
import { db } from '../db';
import { systemHealthSnapshots, alerts, jobs } from '@shared/schema';
import { desc, gte, sql, eq, and, or } from 'drizzle-orm';

// ============================================================================
// Configuration
// ============================================================================

const HEALTH_CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes (reduced from 5min to cut DB query load 3x)
const CONSOLE_SUMMARY_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SNAPSHOTS_TO_KEEP = 1000; // ~3.5 days at 5-min intervals

// ============================================================================
// Health Check Scheduler
// ============================================================================

class HealthCheckScheduler {
  private checkInterval: NodeJS.Timeout | null = null;
  private summaryInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastAlerts = new Map<string, number>(); // Deduplication: alertType -> timestamp

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ Health Check Scheduler already running');
      return;
    }

    console.log('🏥 Starting Health Check Scheduler');
    this.isRunning = true;

    // Run initial check + summary
    await this.performHealthCheck();
    await this.printHealthSummary();

    // Schedule periodic health checks
    this.checkInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error: any) {
        console.error('[HealthCheckScheduler] Health check error:', error.message);
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    // Schedule periodic console summaries
    this.summaryInterval = setInterval(async () => {
      try {
        await this.printHealthSummary();
      } catch (error: any) {
        console.error('[HealthCheckScheduler] Summary error:', error.message);
      }
    }, CONSOLE_SUMMARY_INTERVAL_MS);

    console.log(`✅ Health Check Scheduler started (checks every ${HEALTH_CHECK_INTERVAL_MS / 1000}s)`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.summaryInterval) {
      clearInterval(this.summaryInterval);
      this.summaryInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Health Check Scheduler stopped');
  }

  /**
   * Perform a single health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const startTime = Date.now();
      const health = await systemHealthMonitor.getComprehensiveHealth();
      const duration = Date.now() - startTime;

      // Store snapshot
      await this.storeSnapshot(health);

      // Process alerts
      await this.processAlerts(health);

      // Run proactive remediation
      await this.performRemediation(health);

      // Run Claude auto-fixer for code-level issues
      await this.runAutoFixer(health);

      // Log if check was slow
      if (duration > 5000) {
        console.warn(`⚠️ Health check took ${duration}ms (threshold: 5000ms)`);
      }

      // Log critical status changes
      if (health.overallStatus === 'unhealthy') {
        console.error(`🚨 SYSTEM UNHEALTHY: ${health.criticalIssues.join(', ')}`);
      }
    } catch (error) {
      console.error('❌ Health check failed:', error);
    }
  }

  /**
   * Store health snapshot in database
   */
  private async storeSnapshot(health: ComprehensiveHealthReport): Promise<void> {
    try {
      await db.insert(systemHealthSnapshots).values({
        timestamp: health.timestamp,
        overallStatus: health.overallStatus,
        coreApisStatus: health.coreAPIs as any,
        backgroundLoopsStatus: health.backgroundLoops as any,
        systemResourcesStatus: health.systemResources as any,
        databaseStatus: health.database as any,
        jobQueueStatus: health.jobQueue as any,
        errorStatus: health.errorMonitoring as any,
        criticalIssues: health.criticalIssues,
      });

      // Cleanup old snapshots (1% chance per check)
      if (Math.random() < 0.01) {
        await this.cleanupOldSnapshots();
      }
    } catch (error) {
      console.error('Failed to store health snapshot:', error);
    }
  }

  /**
   * Cleanup old snapshots
   */
  private async cleanupOldSnapshots(): Promise<void> {
    try {
      // Get the Nth most recent snapshot timestamp
      const cutoffSnapshot = await db
        .select({ timestamp: systemHealthSnapshots.timestamp })
        .from(systemHealthSnapshots)
        .orderBy(desc(systemHealthSnapshots.timestamp))
        .offset(MAX_SNAPSHOTS_TO_KEEP)
        .limit(1);

      if (cutoffSnapshot.length > 0) {
        const deleted = await db
          .delete(systemHealthSnapshots)
          .where(sql`${systemHealthSnapshots.timestamp} < ${cutoffSnapshot[0].timestamp}`);

        console.log(`🧹 Cleaned up old health snapshots`);
      }
    } catch (error) {
      console.error('Failed to cleanup snapshots:', error);
    }
  }

  /**
   * Run proactive remediation based on health report
   */
  private async performRemediation(health: ComprehensiveHealthReport): Promise<void> {
    try {
      const report = await proactiveRemediationAgent.evaluate(health);
      if (report.actionsTaken.length > 0) {
        console.log(`[Remediation] Took ${report.actionsTaken.length} action(s) in ${report.durationMs}ms`);
      }
    } catch (error: any) {
      console.error('[HealthCheckScheduler] Remediation error:', error.message);
    }
  }

  /**
   * Run Claude auto-fixer for code-level issues
   */
  private async runAutoFixer(health: ComprehensiveHealthReport): Promise<void> {
    try {
      const issues: FixableIssue[] = [];

      // Collect failed jobs with error messages
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentFailed = await db
          .select({
            id: jobs.id,
            scriptName: jobs.scriptName,
            errorMessage: jobs.errorMessage,
            mode: jobs.mode,
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'failed'), gte(jobs.createdAt, oneDayAgo)))
          .orderBy(desc(jobs.createdAt))
          .limit(3);

        for (const job of recentFailed) {
          if (job.errorMessage) {
            issues.push({
              type: 'failed_job',
              summary: `${job.scriptName || job.mode || 'unknown'} failed`,
              details: `Job ${job.id} (${job.scriptName || job.mode}) failed with: ${job.errorMessage}`,
              jobId: job.id,
              errorMessage: job.errorMessage,
            });
          }
        }
      } catch {
        // Non-critical
      }

      // Collect critical errors from error monitoring
      if (health.errorMonitoring.criticalErrors > 0) {
        issues.push({
          type: 'runtime_error',
          summary: `${health.errorMonitoring.criticalErrors} critical runtime error(s)`,
          details: `System has ${health.errorMonitoring.criticalErrors} critical and ${health.errorMonitoring.activeErrors} total active errors. Check error_reports table for details.`,
        });
      }

      if (issues.length > 0) {
        await claudeAutoFixer.evaluateAndFix(issues);
      }
    } catch (error: any) {
      console.error('[HealthCheckScheduler] Auto-fixer error:', error.message);
    }
  }

  /**
   * Process alerts for critical issues
   */
  private async processAlerts(health: ComprehensiveHealthReport): Promise<void> {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Alert: System unhealthy
    if (health.overallStatus === 'unhealthy') {
      await this.createAlert(
        'system_unhealthy',
        'critical',
        'System Unhealthy',
        `System is unhealthy: ${health.criticalIssues.join('; ')}`,
        { criticalCount: health.criticalIssues.length },
      );
    }

    // Alert: Dead background loops
    for (const loop of health.backgroundLoops) {
      if (loop.status === 'unhealthy' && !loop.isRunning) {
        await this.createAlert(
          'background_loop_dead',
          'high',
          `Background Loop Dead: ${loop.loopName}`,
          `Loop "${loop.loopName}" has not sent heartbeat since ${loop.lastHeartbeat || 'never'}`,
          { loopName: loop.loopName, timeSinceHeartbeat: loop.timeSinceHeartbeat },
        );
      }
    }

    // Alert: Critical disk space
    const diskResource = health.systemResources.disk;
    if (diskResource && diskResource.status === 'unhealthy') {
      await this.createAlert(
        'disk_space_critical',
        'critical',
        'Critical Disk Space',
        `Disk usage at ${diskResource.usedPercent}% (total: ${diskResource.totalGB}GB)`,
        { usagePercent: diskResource.usedPercent, totalGB: diskResource.totalGB },
      );
    }

    // Alert: Stuck jobs
    if (health.jobQueue.stuckJobs > 0) {
      await this.createAlert(
        'repeated_error',
        'high',
        'Stuck Jobs Detected',
        `${health.jobQueue.stuckJobs} jobs stuck in processing for >30 minutes`,
        { stuckCount: health.jobQueue.stuckJobs },
      );
    }

    // Alert: High failure rate
    if (health.jobQueue.recentFailureRate > 0.2) {
      await this.createAlert(
        'high_failure_rate',
        'high',
        'High Job Failure Rate',
        `Recent failure rate: ${(health.jobQueue.recentFailureRate * 100).toFixed(1)}%`,
        { failureRate: health.jobQueue.recentFailureRate },
      );
    }

    // Alert: Critical errors
    if (health.errorMonitoring.criticalErrors > 0) {
      await this.createAlert(
        'critical_error',
        'critical',
        'Critical Errors Active',
        `${health.errorMonitoring.criticalErrors} critical errors need attention`,
        { criticalCount: health.errorMonitoring.criticalErrors },
      );
    }
  }

  /**
   * Create an alert (with deduplication)
   */
  private async createAlert(
    type: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    title: string,
    message: string,
    metadata?: any,
  ): Promise<void> {
    try {
      const alertKey = `${type}:${title}`;
      const now = Date.now();
      const lastAlert = this.lastAlerts.get(alertKey);

      // Skip if we created the same alert in the last hour
      if (lastAlert && now - lastAlert < 60 * 60 * 1000) {
        return;
      }

      // Create alert
      await db.insert(alerts).values({
        id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        severity,
        title,
        message,
        resolved: false,
        metadata,
        deduplicationKey: alertKey,
        lastTriggered: new Date(),
        triggerCount: 1,
      });

      this.lastAlerts.set(alertKey, now);
      console.log(`🚨 Alert created: [${severity.toUpperCase()}] ${title}`);
    } catch (error) {
      console.error('Failed to create alert:', error);
    }
  }

  /**
   * Print periodic health summary
   */
  private async printHealthSummary(): Promise<void> {
    try {
      const health = await systemHealthMonitor.getComprehensiveHealth();

      console.log('\n' + '═'.repeat(60));
      console.log('📊 HEALTH CHECK SUMMARY');
      console.log('═'.repeat(60));
      console.log(`Status: ${health.overallStatus.toUpperCase()}`);
      console.log(`Time: ${health.timestamp.toISOString()}`);
      console.log('─'.repeat(60));

      // Core APIs
      const healthyApis = health.coreAPIs.filter((a) => a.status === 'healthy').length;
      console.log(`APIs: ${healthyApis}/${health.coreAPIs.length} healthy`);
      const unhealthyApis = health.coreAPIs.filter((a) => a.status === 'unhealthy');
      if (unhealthyApis.length > 0) {
        unhealthyApis.forEach((api) => {
          console.log(`  ❌ ${api.service}: ${api.errorMessage || 'degraded'}`);
        });
      }

      // Background Loops
      const runningLoops = health.backgroundLoops.filter((l) => l.isRunning).length;
      console.log(`Loops: ${runningLoops}/${health.backgroundLoops.length} running`);
      const deadLoops = health.backgroundLoops.filter((l) => !l.isRunning);
      if (deadLoops.length > 0) {
        deadLoops.forEach((loop) => {
          console.log(`  ❌ ${loop.loopName}: dead (last heartbeat: ${loop.lastHeartbeat || 'never'})`);
        });
      }

      // System Resources
      console.log('Resources:');
      Object.entries(health.systemResources).forEach(([name, r]) => {
        const emoji = r.status === 'healthy' ? '✅' : r.status === 'degraded' ? '⚠️' : '❌';
        if ('usedPercent' in r) {
          console.log(`  ${emoji} ${name}: ${r.usedPercent}% used`);
        } else if ('loadAverage' in r) {
          console.log(`  ${emoji} ${name}: load ${r.loadAverage[0]?.toFixed(2) ?? 'N/A'}`);
        }
      });

      // Job Queue
      console.log(
        `Jobs: ${health.jobQueue.queuedJobs} queued, ${health.jobQueue.processingJobs} processing, ${health.jobQueue.stuckJobs} stuck`,
      );
      if (health.jobQueue.recentFailureRate > 0.1) {
        console.log(`  ⚠️ Failure rate: ${(health.jobQueue.recentFailureRate * 100).toFixed(1)}%`);
      }

      // Errors
      console.log(
        `Errors: ${health.errorMonitoring.activeErrors} active, ${health.errorMonitoring.criticalErrors} critical`,
      );

      // Critical Issues
      if (health.criticalIssues.length > 0) {
        console.log('─'.repeat(60));
        console.log('🚨 CRITICAL ISSUES:');
        health.criticalIssues.forEach((issue) => {
          console.log(`  • ${issue}`);
        });
      }

      // Warnings / Recommendations
      if (health.warnings?.length > 0) {
        console.log('─'.repeat(60));
        console.log('💡 WARNINGS:');
        health.warnings.forEach((warning) => {
          console.log(`  • ${warning}`);
        });
      }

      console.log('═'.repeat(60) + '\n');

      // Send to Discord
      await this.sendDiscordHealthSummary(health);
    } catch (error) {
      console.error('Failed to print health summary:', error);
    }
  }

  /**
   * Send health summary to Discord
   */
  private async sendDiscordHealthSummary(health: ComprehensiveHealthReport): Promise<void> {
    try {
      const statusEmoji =
        health.overallStatus === 'healthy'
          ? '\u2705'
          : health.overallStatus === 'degraded'
            ? '\u26A0\uFE0F'
            : '\u{1F6A8}';

      const statusColor =
        health.overallStatus === 'healthy' ? 0x2ecc71 : health.overallStatus === 'degraded' ? 0xf1c40f : 0xe74c3c;

      // APIs
      const healthyApis = health.coreAPIs.filter((a) => a.status === 'healthy').length;
      const unhealthyApis = health.coreAPIs.filter((a) => a.status !== 'healthy');
      let apiText = `${healthyApis}/${health.coreAPIs.length} healthy`;
      if (unhealthyApis.length > 0) {
        apiText += '\n' + unhealthyApis.map((a) => `\u274C ${a.service}: ${a.errorMessage || a.status}`).join('\n');
      }

      // Loops
      const runningLoops = health.backgroundLoops.filter((l) => l.isRunning).length;
      const deadLoops = health.backgroundLoops.filter((l) => !l.isRunning);
      let loopText = `${runningLoops}/${health.backgroundLoops.length} running`;
      if (deadLoops.length > 0) {
        loopText += '\n' + deadLoops.map((l) => `\u274C ${l.loopName}`).join('\n');
      }

      // Resources
      const disk = health.systemResources.disk;
      const mem = health.systemResources.memory;
      const cpu = health.systemResources.cpu;
      const resourceText = [
        `Disk: ${disk.usedPercent.toFixed(0)}% (${disk.availableGB}GB free)`,
        `Memory: ${mem.usedPercent.toFixed(0)}% (${mem.availableGB}GB free)`,
        `CPU: load ${cpu.loadAverage[0]?.toFixed(2) ?? 'N/A'} (${cpu.coreCount} cores)`,
      ].join('\n');

      // Jobs
      const jobText = `${health.jobQueue.queuedJobs} queued, ${health.jobQueue.processingJobs} processing, ${health.jobQueue.stuckJobs} stuck`;

      // Query failed jobs (last 24h) and stuck jobs
      let failedJobsText = '';
      let stuckJobsText = '';
      try {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        const recentFailed = await db
          .select({
            id: jobs.id,
            scriptName: jobs.scriptName,
            errorMessage: jobs.errorMessage,
            mode: jobs.mode,
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'failed'), gte(jobs.createdAt, oneDayAgo)))
          .orderBy(desc(jobs.createdAt))
          .limit(5);

        if (recentFailed.length > 0) {
          failedJobsText = recentFailed
            .map((j) => {
              const name = j.scriptName || j.mode || 'unknown';
              const err = j.errorMessage ? j.errorMessage.slice(0, 80) : 'no error message';
              return `\u2022 \`${j.id.slice(0, 8)}\` ${name}: ${err}`;
            })
            .join('\n');
        }

        const stuckJobs = await db
          .select({
            id: jobs.id,
            scriptName: jobs.scriptName,
            mode: jobs.mode,
            progress: jobs.progress,
            createdAt: jobs.createdAt,
          })
          .from(jobs)
          .where(and(eq(jobs.status, 'processing'), sql`${jobs.createdAt} < ${oneHourAgo}`))
          .orderBy(jobs.createdAt)
          .limit(5);

        if (stuckJobs.length > 0) {
          stuckJobsText = stuckJobs
            .map((j) => {
              const name = j.scriptName || j.mode || 'unknown';
              const age = Math.floor((Date.now() - j.createdAt.getTime()) / 60000);
              return `\u2022 \`${j.id.slice(0, 8)}\` ${name}: ${j.progress}% for ${age}m`;
            })
            .join('\n');
        }
      } catch {
        // Non-critical — skip if query fails
      }

      const fields = [
        { name: 'APIs', value: apiText.slice(0, 1024), inline: true },
        { name: 'Background Loops', value: loopText.slice(0, 1024), inline: true },
        { name: 'Resources', value: resourceText, inline: false },
        { name: 'Job Queue', value: jobText, inline: true },
        {
          name: 'Errors',
          value: `${health.errorMonitoring.activeErrors} active, ${health.errorMonitoring.criticalErrors} critical`,
          inline: true,
        },
      ];

      if (failedJobsText) {
        fields.push({
          name: '\u274C Failed Jobs (24h)',
          value: failedJobsText.slice(0, 1024),
          inline: false,
        });
      }

      if (stuckJobsText) {
        fields.push({
          name: '\u23F3 Stuck Jobs',
          value: stuckJobsText.slice(0, 1024),
          inline: false,
        });
      }

      if (health.criticalIssues.length > 0) {
        fields.push({
          name: '\u{1F6A8} Critical Issues',
          value: health.criticalIssues
            .map((i) => `\u2022 ${i}`)
            .join('\n')
            .slice(0, 1024),
          inline: false,
        });
      }

      if (health.warnings && health.warnings.length > 0) {
        fields.push({
          name: '\u{1F4A1} Warnings',
          value: health.warnings
            .map((w) => `\u2022 ${w}`)
            .join('\n')
            .slice(0, 1024),
          inline: false,
        });
      }

      // Use dedicated health channel if set, otherwise fall back to main webhook
      const healthWebhookUrl = process.env.DISCORD_HEALTH_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
      if (!healthWebhookUrl) return;

      const embed = {
        title: `${statusEmoji} Health Check: ${health.overallStatus.toUpperCase()}`,
        description: `${health.summary.healthyComponents}/${health.summary.totalComponents} components healthy`,
        color: statusColor,
        fields,
        footer: { text: 'Health Check Scheduler | Unity AI' },
        timestamp: new Date().toISOString(),
      };

      const response = await fetch(healthWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] }),
      });

      if (!response.ok) {
        console.error(`[HealthCheckScheduler] Discord health webhook failed: ${response.status}`);
      }
    } catch (error) {
      console.error('[HealthCheckScheduler] Failed to send Discord health summary:', error);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): { isRunning: boolean; lastCheck: Date | null } {
    return {
      isRunning: this.isRunning,
      lastCheck: this.isRunning ? new Date() : null,
    };
  }
}

// Export singleton
export const healthCheckScheduler = new HealthCheckScheduler();
