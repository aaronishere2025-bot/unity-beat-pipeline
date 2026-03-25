/**
 * PROACTIVE REMEDIATION AGENT
 *
 * Hooks into the health check cycle to take safe, automated actions
 * to fix system-level problems (zombie processes, temp files, disk pressure, etc.).
 *
 * Safety model:
 *   AUTO-ALLOWED: kill zombie FFmpeg (>30min), clean temp (>24h), clean cache (>7d), compress logs (>100MB)
 *   ACT + NOTIFY: restart unity-server, aggressive disk cleanup (>90%), API key failures
 *   NOTIFY ONLY:  GCP scaling, DB connection failures >30min, memory errors, config changes
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync, readdirSync, writeFileSync, readFileSync } from 'fs';
import type { ComprehensiveHealthReport } from './system-health-monitor';
import { sendDiscordEmbed } from './alert-service';
import { apiCostTracker } from './api-cost-tracker';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

interface ActionResult {
  action: string;
  status: 'success' | 'skipped' | 'failed' | 'notify_only';
  detail: string;
  category: 'auto' | 'act_notify' | 'notify_only';
  timestamp: Date;
}

interface RemediationReport {
  timestamp: Date;
  actionsTaken: ActionResult[];
  actionsSkipped: ActionResult[];
  notificationsOnly: ActionResult[];
  durationMs: number;
}

// ============================================================================
// Constants
// ============================================================================

const ZOMBIE_FFMPEG_THRESHOLD_MIN = 30;
const TEMP_FILE_AGE_DAYS = 1;
const CACHE_FILE_AGE_DAYS = 7;
const LOG_SIZE_THRESHOLD_MB = 100;
const DISK_AGGRESSIVE_CLEANUP_PERCENT = 90;
const SERVER_HEALTH_TIMEOUT_MS = 10_000;
const LOGS_DIR = '/home/aaronishere2025/logs';
const TEMP_DIR = '/tmp/unity-scratch';
const CACHE_DIR = '/tmp/audio-analysis-cache';
const COST_REPORT_MARKER = '/tmp/unity-cost-report-marker';

// Discord embed colors
const COLOR_GREEN = 0x2ecc71;
const COLOR_YELLOW = 0xf1c40f;
const COLOR_RED = 0xe74c3c;

// ============================================================================
// Proactive Remediation Agent
// ============================================================================

class ProactiveRemediationAgent {
  private static instance: ProactiveRemediationAgent;
  private actionLog: ActionResult[] = [];
  private readonly MAX_LOG_SIZE = 500;
  // Cost report dedup uses file marker (survives restarts)
  private readonly startedAt = Date.now();
  private readonly STARTUP_GRACE_MS = 60_000; // Skip server check for first 60s

  static getInstance(): ProactiveRemediationAgent {
    if (!ProactiveRemediationAgent.instance) {
      ProactiveRemediationAgent.instance = new ProactiveRemediationAgent();
    }
    return ProactiveRemediationAgent.instance;
  }

  /**
   * Core method — called by health-check-scheduler every 15 min
   */
  async evaluate(health: ComprehensiveHealthReport): Promise<RemediationReport> {
    const start = Date.now();
    const results: ActionResult[] = [];

    console.log('[Remediation] Evaluating system health for remediation...');

    // Auto-allowed actions (always safe)
    results.push(await this.killZombieProcesses());
    results.push(await this.cleanTempFiles());
    results.push(await this.cleanStaleCache());
    results.push(await this.compressLargeLogs());

    // Conditional: aggressive disk cleanup if >90%
    if (health.systemResources.disk.usedPercent >= DISK_AGGRESSIVE_CLEANUP_PERCENT) {
      results.push(await this.aggressiveDiskCleanup(health.systemResources.disk.usedPercent));
    }

    // API key health check (notify only)
    results.push(await this.checkApiKeys(health));

    // Server responsiveness (act + notify)
    results.push(await this.checkServerResponsiveness());

    // Database connection persistence (notify only if unhealthy)
    if (health.database.status === 'unhealthy') {
      results.push({
        action: 'database_connection_failure',
        status: 'notify_only',
        detail: `Database unhealthy: ${health.database.errorMessage || 'connection failed'}. Requires human intervention.`,
        category: 'notify_only',
        timestamp: new Date(),
      });
    }

    // Memory issues (notify only)
    if (health.systemResources.memory.status === 'unhealthy') {
      results.push({
        action: 'memory_pressure',
        status: 'notify_only',
        detail: `Memory at ${health.systemResources.memory.usedPercent.toFixed(1)}% — not auto-fixable. Requires human review.`,
        category: 'notify_only',
        timestamp: new Date(),
      });
    }

    // Daily cost report (once per day)
    await this.sendDailyCostReport();

    // Categorize results
    const actionsTaken = results.filter((r) => r.status === 'success');
    const actionsSkipped = results.filter((r) => r.status === 'skipped' || r.status === 'failed');
    const notificationsOnly = results.filter((r) => r.status === 'notify_only');

    // Log actions
    for (const result of results) {
      this.logAction(result);
    }

    // Send Discord notifications for significant actions
    const notifiable = results
      .filter((r) => r.status === 'success' || r.status === 'notify_only' || r.status === 'failed')
      .filter((r) => r.status !== 'skipped');

    if (notifiable.length > 0) {
      await this.notifyDiscord(notifiable);
    }

    const report: RemediationReport = {
      timestamp: new Date(),
      actionsTaken,
      actionsSkipped,
      notificationsOnly,
      durationMs: Date.now() - start,
    };

    if (actionsTaken.length > 0) {
      console.log(`[Remediation] Took ${actionsTaken.length} actions in ${report.durationMs}ms`);
      for (const a of actionsTaken) {
        console.log(`  [${a.action}] ${a.detail}`);
      }
    }

    if (notificationsOnly.length > 0) {
      console.log(`[Remediation] ${notificationsOnly.length} notification-only items`);
      for (const n of notificationsOnly) {
        console.log(`  [${n.action}] ${n.detail}`);
      }
    }

    return report;
  }

  // ==========================================================================
  // Auto-Allowed Actions
  // ==========================================================================

  /**
   * Kill FFmpeg processes running longer than 30 minutes
   */
  private async killZombieProcesses(): Promise<ActionResult> {
    try {
      // Get FFmpeg processes with their elapsed time
      const { stdout } = await execAsync('ps -eo pid,etimes,comm | grep ffmpeg | grep -v grep || true');

      if (!stdout.trim()) {
        return {
          action: 'kill_zombie_ffmpeg',
          status: 'skipped',
          detail: 'No FFmpeg processes running',
          category: 'auto',
          timestamp: new Date(),
        };
      }

      const lines = stdout.trim().split('\n');
      const thresholdSec = ZOMBIE_FFMPEG_THRESHOLD_MIN * 60;
      const killed: number[] = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 3) continue;

        const pid = parseInt(parts[0], 10);
        const elapsedSec = parseInt(parts[1], 10);

        if (!isNaN(pid) && !isNaN(elapsedSec) && elapsedSec > thresholdSec) {
          try {
            await execAsync(`kill ${pid}`);
            killed.push(pid);
            console.log(`[Remediation] Killed zombie FFmpeg PID ${pid} (running ${Math.floor(elapsedSec / 60)}m)`);
          } catch {
            // Process may have already exited
          }
        }
      }

      if (killed.length === 0) {
        return {
          action: 'kill_zombie_ffmpeg',
          status: 'skipped',
          detail: `${lines.length} FFmpeg process(es) running but none exceed ${ZOMBIE_FFMPEG_THRESHOLD_MIN}m threshold`,
          category: 'auto',
          timestamp: new Date(),
        };
      }

      return {
        action: 'kill_zombie_ffmpeg',
        status: 'success',
        detail: `Killed ${killed.length} zombie FFmpeg process(es): PIDs ${killed.join(', ')}`,
        category: 'auto',
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        action: 'kill_zombie_ffmpeg',
        status: 'failed',
        detail: `Error checking FFmpeg processes: ${error.message}`,
        category: 'auto',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Clean temp files in /tmp/unity-scratch/ older than 24h
   */
  private async cleanTempFiles(): Promise<ActionResult> {
    try {
      if (!existsSync(TEMP_DIR)) {
        return {
          action: 'clean_temp_files',
          status: 'skipped',
          detail: `${TEMP_DIR} does not exist`,
          category: 'auto',
          timestamp: new Date(),
        };
      }

      const { stdout } = await execAsync(
        `find ${TEMP_DIR} -type f -mtime +${TEMP_FILE_AGE_DAYS} -delete -print 2>/dev/null | wc -l`,
      );

      const count = parseInt(stdout.trim(), 10) || 0;

      if (count === 0) {
        return {
          action: 'clean_temp_files',
          status: 'skipped',
          detail: `No temp files older than ${TEMP_FILE_AGE_DAYS} day(s)`,
          category: 'auto',
          timestamp: new Date(),
        };
      }

      return {
        action: 'clean_temp_files',
        status: 'success',
        detail: `Deleted ${count} temp file(s) from ${TEMP_DIR} older than ${TEMP_FILE_AGE_DAYS} day(s)`,
        category: 'auto',
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        action: 'clean_temp_files',
        status: 'failed',
        detail: `Error cleaning temp files: ${error.message}`,
        category: 'auto',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Clean stale audio analysis cache older than 7 days
   */
  private async cleanStaleCache(): Promise<ActionResult> {
    try {
      if (!existsSync(CACHE_DIR)) {
        return {
          action: 'clean_stale_cache',
          status: 'skipped',
          detail: `${CACHE_DIR} does not exist`,
          category: 'auto',
          timestamp: new Date(),
        };
      }

      const { stdout } = await execAsync(
        `find ${CACHE_DIR} -type f -mtime +${CACHE_FILE_AGE_DAYS} -delete -print 2>/dev/null | wc -l`,
      );

      const count = parseInt(stdout.trim(), 10) || 0;

      if (count === 0) {
        return {
          action: 'clean_stale_cache',
          status: 'skipped',
          detail: `No cache files older than ${CACHE_FILE_AGE_DAYS} day(s)`,
          category: 'auto',
          timestamp: new Date(),
        };
      }

      return {
        action: 'clean_stale_cache',
        status: 'success',
        detail: `Deleted ${count} cache file(s) from ${CACHE_DIR} older than ${CACHE_FILE_AGE_DAYS} day(s)`,
        category: 'auto',
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        action: 'clean_stale_cache',
        status: 'failed',
        detail: `Error cleaning cache: ${error.message}`,
        category: 'auto',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Compress/truncate log files over 100MB — keep last 10K lines
   */
  private async compressLargeLogs(): Promise<ActionResult> {
    try {
      if (!existsSync(LOGS_DIR)) {
        return {
          action: 'compress_large_logs',
          status: 'skipped',
          detail: `${LOGS_DIR} does not exist`,
          category: 'auto',
          timestamp: new Date(),
        };
      }

      const thresholdBytes = LOG_SIZE_THRESHOLD_MB * 1024 * 1024;
      let truncated = 0;

      let files: string[];
      try {
        files = readdirSync(LOGS_DIR);
      } catch {
        files = [];
      }

      for (const file of files) {
        if (!file.endsWith('.log')) continue;

        const fullPath = `${LOGS_DIR}/${file}`;
        try {
          const stat = statSync(fullPath);
          if (stat.size > thresholdBytes) {
            // Keep last 10000 lines
            await execAsync(`tail -n 10000 ${fullPath} > ${fullPath}.tmp && mv ${fullPath}.tmp ${fullPath}`);
            truncated++;
            console.log(`[Remediation] Truncated ${file} (was ${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
          }
        } catch {
          // Skip files that can't be read
        }
      }

      if (truncated === 0) {
        return {
          action: 'compress_large_logs',
          status: 'skipped',
          detail: `No log files exceed ${LOG_SIZE_THRESHOLD_MB}MB`,
          category: 'auto',
          timestamp: new Date(),
        };
      }

      return {
        action: 'compress_large_logs',
        status: 'success',
        detail: `Truncated ${truncated} log file(s) exceeding ${LOG_SIZE_THRESHOLD_MB}MB (kept last 10K lines)`,
        category: 'auto',
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        action: 'compress_large_logs',
        status: 'failed',
        detail: `Error compressing logs: ${error.message}`,
        category: 'auto',
        timestamp: new Date(),
      };
    }
  }

  // ==========================================================================
  // Act + Notify Actions
  // ==========================================================================

  /**
   * Aggressive disk cleanup when usage >90%
   */
  private async aggressiveDiskCleanup(usedPercent: number): Promise<ActionResult> {
    try {
      let freedCount = 0;

      // Delete ALL temp files (not just old ones)
      if (existsSync(TEMP_DIR)) {
        const { stdout: tempCount } = await execAsync(`find ${TEMP_DIR} -type f -delete -print 2>/dev/null | wc -l`);
        freedCount += parseInt(tempCount.trim(), 10) || 0;
      }

      // Delete ALL cache files
      if (existsSync(CACHE_DIR)) {
        const { stdout: cacheCount } = await execAsync(`find ${CACHE_DIR} -type f -delete -print 2>/dev/null | wc -l`);
        freedCount += parseInt(cacheCount.trim(), 10) || 0;
      }

      // Clean old rendered videos (>7 days)
      const rendersDir = '/home/aaronishere2025/data/videos/renders';
      if (existsSync(rendersDir)) {
        const { stdout: renderCount } = await execAsync(
          `find ${rendersDir} -type f -mtime +7 -delete -print 2>/dev/null | wc -l`,
        );
        freedCount += parseInt(renderCount.trim(), 10) || 0;
      }

      return {
        action: 'aggressive_disk_cleanup',
        status: 'success',
        detail: `Disk at ${usedPercent.toFixed(1)}% — aggressive cleanup deleted ${freedCount} file(s) from temp, cache, and old renders`,
        category: 'act_notify',
        timestamp: new Date(),
      };
    } catch (error: any) {
      return {
        action: 'aggressive_disk_cleanup',
        status: 'failed',
        detail: `Aggressive disk cleanup failed: ${error.message}`,
        category: 'act_notify',
        timestamp: new Date(),
      };
    }
  }

  /**
   * Check if server is responsive; restart via systemctl if not
   */
  private async checkServerResponsiveness(): Promise<ActionResult> {
    // Skip during startup — server may not be listening yet
    if (Date.now() - this.startedAt < this.STARTUP_GRACE_MS) {
      return {
        action: 'check_server_responsiveness',
        status: 'skipped',
        detail: 'Skipped during startup grace period',
        category: 'act_notify',
        timestamp: new Date(),
      };
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SERVER_HEALTH_TIMEOUT_MS);

      try {
        const response = await fetch('http://localhost:8080/api/health', {
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (response.ok) {
          return {
            action: 'check_server_responsiveness',
            status: 'skipped',
            detail: 'Server responded OK to health check',
            category: 'act_notify',
            timestamp: new Date(),
          };
        }

        // Server responded but not OK
        return {
          action: 'check_server_responsiveness',
          status: 'notify_only',
          detail: `Server health endpoint returned ${response.status} — monitoring but not restarting`,
          category: 'act_notify',
          timestamp: new Date(),
        };
      } catch (fetchError: any) {
        clearTimeout(timeout);

        // Server did not respond — attempt restart
        if (fetchError.name === 'AbortError' || fetchError.code === 'ECONNREFUSED') {
          console.log('[Remediation] Server unresponsive — attempting systemctl restart');
          try {
            await execAsync('systemctl restart unity-server', { timeout: 30_000 });
            return {
              action: 'restart_server',
              status: 'success',
              detail: 'Server was unresponsive — restarted via systemctl restart unity-server',
              category: 'act_notify',
              timestamp: new Date(),
            };
          } catch (restartError: any) {
            return {
              action: 'restart_server',
              status: 'failed',
              detail: `Server unresponsive and restart failed: ${restartError.message}`,
              category: 'act_notify',
              timestamp: new Date(),
            };
          }
        }

        throw fetchError;
      }
    } catch (error: any) {
      return {
        action: 'check_server_responsiveness',
        status: 'failed',
        detail: `Server responsiveness check error: ${error.message}`,
        category: 'act_notify',
        timestamp: new Date(),
      };
    }
  }

  // ==========================================================================
  // Notify-Only Actions
  // ==========================================================================

  /**
   * Check API key health by verifying recent successful calls or probing free endpoints
   */
  private async checkApiKeys(health: ComprehensiveHealthReport): Promise<ActionResult> {
    const failingApis = health.coreAPIs.filter(
      (api) => api.status === 'unhealthy' && api.recentCallCount > 0 && api.recentSuccessRate < 10,
    );

    if (failingApis.length === 0) {
      return {
        action: 'check_api_keys',
        status: 'skipped',
        detail: 'All API keys appear functional',
        category: 'notify_only',
        timestamp: new Date(),
      };
    }

    // Try lightweight probes for failing APIs
    const probeResults: string[] = [];

    for (const api of failingApis) {
      switch (api.service) {
        case 'openai': {
          try {
            const key = process.env.OPENAI_API_KEY;
            if (!key) {
              probeResults.push('OpenAI: API key not set');
              break;
            }
            const resp = await fetch('https://api.openai.com/v1/models', {
              headers: { Authorization: `Bearer ${key}` },
              signal: AbortSignal.timeout(5000),
            });
            probeResults.push(`OpenAI: probe returned ${resp.status}`);
          } catch (e: any) {
            probeResults.push(`OpenAI: probe failed — ${e.message}`);
          }
          break;
        }
        case 'gemini': {
          try {
            const key = process.env.GEMINI_API_KEY;
            if (!key) {
              probeResults.push('Gemini: API key not set');
              break;
            }
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
              signal: AbortSignal.timeout(5000),
            });
            probeResults.push(`Gemini: probe returned ${resp.status}`);
          } catch (e: any) {
            probeResults.push(`Gemini: probe failed — ${e.message}`);
          }
          break;
        }
        default:
          // Suno/Kling: no free probe endpoint, rely on apiUsage data
          probeResults.push(
            `${api.service}: ${api.recentSuccessRate.toFixed(0)}% success rate (${api.recentCallCount} calls) — possible key issue`,
          );
          break;
      }
    }

    return {
      action: 'check_api_keys',
      status: 'notify_only',
      detail: `API key issues detected: ${probeResults.join('; ')}`,
      category: 'notify_only',
      timestamp: new Date(),
    };
  }

  // ==========================================================================
  // Daily Cost Report
  // ==========================================================================

  /**
   * Send a daily cost summary to Discord — once per day, survives restarts
   */
  private async sendDailyCostReport(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // Check file marker to survive restarts
    try {
      if (existsSync(COST_REPORT_MARKER)) {
        const markerDate = readFileSync(COST_REPORT_MARKER, 'utf-8').trim();
        if (markerDate === today) return; // Already sent today
      }
    } catch {
      // If marker can't be read, proceed to send
    }

    try {
      const stats = await apiCostTracker.getCostSummary('today');
      const totalCost = stats.totalCost;
      const byService = stats.byService;

      // Build per-service breakdown lines
      const serviceLines = Object.entries(byService)
        .filter(([_, data]) => data.cost > 0)
        .sort(([, a], [, b]) => b.cost - a.cost)
        .map(([service, data]) => `**${service}**: $${data.cost.toFixed(2)} (${data.count} calls)`);

      // Pick color based on spend level
      let color = COLOR_GREEN;
      let emoji = '\uD83D\uDCB0'; // money bag
      if (totalCost > 50) {
        color = COLOR_RED;
        emoji = '\uD83D\uDCA8'; // dash/sweat
      } else if (totalCost > 25) {
        color = COLOR_YELLOW;
        emoji = '\uD83D\uDCB8'; // money with wings
      }

      const fields: { name: string; value: string; inline: boolean }[] = [];

      if (serviceLines.length > 0) {
        fields.push({
          name: 'Breakdown by Service',
          value: serviceLines.join('\n').slice(0, 1024),
          inline: false,
        });
      }

      fields.push({
        name: 'Date',
        value: today,
        inline: true,
      });

      await sendDiscordEmbed({
        title: `${emoji} Daily Cost Report: $${totalCost.toFixed(2)}`,
        description:
          serviceLines.length > 0
            ? `Total API spend today across ${serviceLines.length} service(s)`
            : 'No API costs recorded today',
        color,
        fields,
        footer: { text: 'Daily Cost Report | Unity AI' },
      });

      // Write marker file so restarts don't re-send
      try {
        writeFileSync(COST_REPORT_MARKER, today);
      } catch {}

      console.log(`[Remediation] Sent daily cost report: $${totalCost.toFixed(2)}`);
    } catch (error: any) {
      console.error('[Remediation] Failed to send daily cost report:', error.message);
    }
  }

  // ==========================================================================
  // Safety + Logging
  // ==========================================================================

  /**
   * Log an action to the in-memory ring buffer
   */
  private logAction(result: ActionResult): void {
    this.actionLog.push(result);
    if (this.actionLog.length > this.MAX_LOG_SIZE) {
      this.actionLog.splice(0, this.actionLog.length - this.MAX_LOG_SIZE);
    }
  }

  /**
   * Send Discord notification for remediation actions
   */
  private async notifyDiscord(actions: ActionResult[]): Promise<void> {
    const successes = actions.filter((a) => a.status === 'success');
    const failures = actions.filter((a) => a.status === 'failed');
    const notifications = actions.filter((a) => a.status === 'notify_only');

    // Determine dominant color
    let color = COLOR_GREEN;
    let emoji = '\u2705'; // checkmark
    if (failures.length > 0) {
      color = COLOR_RED;
      emoji = '\u{1F6A8}'; // siren
    } else if (notifications.length > 0 && successes.length === 0) {
      color = COLOR_YELLOW;
      emoji = '\u26A0\uFE0F'; // warning
    }

    const fields: { name: string; value: string; inline: boolean }[] = [];

    if (successes.length > 0) {
      fields.push({
        name: 'Actions Taken',
        value: successes
          .map((a) => `\u2022 **${a.action}**: ${a.detail}`)
          .join('\n')
          .slice(0, 1024),
        inline: false,
      });
    }

    if (failures.length > 0) {
      fields.push({
        name: 'Failed Actions',
        value: failures
          .map((a) => `\u2022 **${a.action}**: ${a.detail}`)
          .join('\n')
          .slice(0, 1024),
        inline: false,
      });
    }

    if (notifications.length > 0) {
      fields.push({
        name: 'Requires Attention',
        value: notifications
          .map((a) => `\u2022 **${a.action}**: ${a.detail}`)
          .join('\n')
          .slice(0, 1024),
        inline: false,
      });
    }

    await sendDiscordEmbed({
      title: `${emoji} Remediation Report`,
      description: `${successes.length} action(s) taken, ${failures.length} failed, ${notifications.length} need attention`,
      color,
      fields,
      footer: { text: 'Proactive Remediation Agent | Unity AI' },
    });
  }

  /**
   * Get recent action history (for API/dashboard)
   */
  getRecentActions(limit = 50): ActionResult[] {
    return this.actionLog.slice(-limit);
  }

  /**
   * Get remediation stats
   */
  getStats(): {
    totalActions: number;
    successCount: number;
    failCount: number;
    notifyCount: number;
    recentActions: ActionResult[];
  } {
    const recent = this.actionLog.slice(-100);
    return {
      totalActions: this.actionLog.length,
      successCount: recent.filter((a) => a.status === 'success').length,
      failCount: recent.filter((a) => a.status === 'failed').length,
      notifyCount: recent.filter((a) => a.status === 'notify_only').length,
      recentActions: this.actionLog.slice(-10),
    };
  }
}

// Export singleton
export const proactiveRemediationAgent = ProactiveRemediationAgent.getInstance();
