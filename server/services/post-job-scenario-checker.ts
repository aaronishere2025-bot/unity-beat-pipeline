/**
 * Post-Job Scenario Checker
 *
 * Runs external behavioral checks after every job completes.
 * Catches cost waste, retry bugs, and pipeline violations BEFORE they compound.
 *
 * Scenarios are defined as simple rules that evaluate job outcomes.
 * Violations are sent to Discord immediately.
 */

import { existsSync } from 'fs';
import { join } from 'path';

interface JobData {
  id: string;
  mode?: string;
  status: string;
  scriptName?: string;
  cost?: string;
  retryCount?: number;
  musicUrl?: string | null;
  createdAt: Date | string;
  completedAt?: Date | string | null;
  metadata?: any;
  videoPath?: string | null;
  thumbnailPath?: string | null;
  audioDuration?: string | number | null;
}

interface ScenarioResult {
  name: string;
  passed: boolean;
  message: string;
  severity: 'critical' | 'warning' | 'info';
}

const DISCORD_WEBHOOK =
  process.env.DISCORD_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1475241957382160557/i6U1UFlvQA4Zrr7niJS6roF8kYOYu_QQGsApi22RrJzGWEW_62wI5FXWxQbiaJUJEtUL';

class PostJobScenarioChecker {
  private static instance: PostJobScenarioChecker;

  static getInstance(): PostJobScenarioChecker {
    if (!PostJobScenarioChecker.instance) {
      PostJobScenarioChecker.instance = new PostJobScenarioChecker();
    }
    return PostJobScenarioChecker.instance;
  }

  /**
   * Run all scenarios against a completed job
   */
  async checkJob(job: JobData): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    results.push(this.checkCostLimit(job));
    results.push(this.checkDuration(job));
    results.push(this.checkOutputFiles(job));
    results.push(this.checkRetryWaste(job));
    results.push(this.checkSingleClipMode(job));

    const violations = results.filter((r) => !r.passed);

    if (violations.length > 0) {
      await this.reportViolations(job, violations);
    }

    const passed = results.filter((r) => r.passed).length;
    console.log(`[Scenario Check] Job ${job.id.slice(0, 8)}: ${passed}/${results.length} passed`);

    return results;
  }

  /**
   * Scenario: Music job total cost should not exceed $0.50
   */
  private checkCostLimit(job: JobData): ScenarioResult {
    const cost = parseFloat(job.cost || '0');
    const limit = job.mode === 'music' ? 0.5 : 3.0;

    if (cost > limit) {
      return {
        name: 'cost-limit',
        passed: false,
        message: `Job cost $${cost.toFixed(2)} exceeds ${job.mode} limit of $${limit.toFixed(2)}`,
        severity: 'critical',
      };
    }

    return {
      name: 'cost-limit',
      passed: true,
      message: `Cost $${cost.toFixed(2)} within limit`,
      severity: 'info',
    };
  }

  /**
   * Scenario: Job should not take longer than 45 min (music) or 90 min (kling)
   */
  private checkDuration(job: JobData): ScenarioResult {
    if (!job.createdAt || !job.completedAt) {
      return { name: 'duration', passed: true, message: 'No timing data', severity: 'info' };
    }

    const start = new Date(job.createdAt).getTime();
    const end = new Date(job.completedAt).getTime();
    const durationMin = (end - start) / 60000;
    const limit = job.mode === 'music' ? 45 : 90;

    if (durationMin > limit) {
      return {
        name: 'duration',
        passed: false,
        message: `Job took ${durationMin.toFixed(0)} min (limit: ${limit} min)`,
        severity: 'warning',
      };
    }

    return {
      name: 'duration',
      passed: true,
      message: `Completed in ${durationMin.toFixed(1)} min`,
      severity: 'info',
    };
  }

  /**
   * Scenario: Completed job must have video and thumbnail files on disk
   */
  private checkOutputFiles(job: JobData): ScenarioResult {
    if (job.status !== 'completed') {
      return { name: 'output-files', passed: true, message: 'Not a completed job', severity: 'info' };
    }

    const missing: string[] = [];
    if (job.videoPath && !existsSync(job.videoPath)) missing.push('video');
    if (job.thumbnailPath && !existsSync(job.thumbnailPath)) missing.push('thumbnail');

    if (missing.length > 0) {
      return {
        name: 'output-files',
        passed: false,
        message: `Missing output files: ${missing.join(', ')}`,
        severity: 'critical',
      };
    }

    return {
      name: 'output-files',
      passed: true,
      message: 'All output files exist',
      severity: 'info',
    };
  }

  /**
   * Scenario: Retried jobs should reuse audio (musicUrl should be file://)
   */
  private checkRetryWaste(job: JobData): ScenarioResult {
    if (!job.retryCount || job.retryCount === 0) {
      return { name: 'retry-reuse', passed: true, message: 'No retries', severity: 'info' };
    }

    if (job.mode !== 'music') {
      return { name: 'retry-reuse', passed: true, message: 'Non-music job', severity: 'info' };
    }

    // After retry, musicUrl should be a local file:// path (saved from first attempt)
    if (job.musicUrl && job.musicUrl.startsWith('file://')) {
      return {
        name: 'retry-reuse',
        passed: true,
        message: `Retry ${job.retryCount} reused audio (saved Suno credits)`,
        severity: 'info',
      };
    }

    // If musicUrl is still a remote URL after retries, Suno was called again (waste)
    if (job.musicUrl && !job.musicUrl.startsWith('file://') && job.retryCount > 0) {
      return {
        name: 'retry-reuse',
        passed: false,
        message: `Retry ${job.retryCount} did NOT reuse audio — Suno credits wasted! musicUrl: ${job.musicUrl?.slice(0, 50)}`,
        severity: 'critical',
      };
    }

    // No musicUrl but has retries — check if audio file exists on disk
    const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `audio_${job.id}.mp3`);
    if (!existsSync(audioPath)) {
      return {
        name: 'retry-reuse',
        passed: false,
        message: `Retry ${job.retryCount} but no cached audio found at ${audioPath}`,
        severity: 'warning',
      };
    }

    return {
      name: 'retry-reuse',
      passed: true,
      message: `Audio cached on disk for potential retries`,
      severity: 'info',
    };
  }

  /**
   * Scenario: Long-form music (>10 min) should use single-clip mode
   */
  private checkSingleClipMode(job: JobData): ScenarioResult {
    if (job.mode !== 'music') {
      return { name: 'single-clip', passed: true, message: 'Non-music job', severity: 'info' };
    }

    const duration = parseFloat(String(job.audioDuration || '0'));
    if (duration <= 600) {
      return { name: 'single-clip', passed: true, message: 'Short video, multi-clip OK', severity: 'info' };
    }

    const clipCount = job.metadata?.clipCount || 1;
    if (clipCount > 1) {
      return {
        name: 'single-clip',
        passed: false,
        message: `Long video (${Math.floor(duration / 60)} min) used ${clipCount} clips instead of 1 — wasted $${((clipCount - 1) * 0.275).toFixed(2)}`,
        severity: 'critical',
      };
    }

    return {
      name: 'single-clip',
      passed: true,
      message: `Single-clip mode active (saved $${(6 * 0.275).toFixed(2)})`,
      severity: 'info',
    };
  }

  /**
   * Send violations to Discord
   */
  private async reportViolations(job: JobData, violations: ScenarioResult[]): Promise<void> {
    const critical = violations.filter((v) => v.severity === 'critical');
    const warnings = violations.filter((v) => v.severity === 'warning');

    const color = critical.length > 0 ? 0xff0000 : 0xff6600;
    const title =
      critical.length > 0
        ? `SCENARIO VIOLATION: ${job.scriptName || job.id.slice(0, 8)}`
        : `Scenario Warning: ${job.scriptName || job.id.slice(0, 8)}`;

    const description = violations
      .map((v) => {
        const icon = v.severity === 'critical' ? '🚨' : '⚠️';
        return `${icon} **${v.name}**: ${v.message}`;
      })
      .join('\n');

    try {
      await fetch(DISCORD_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title,
              description,
              color,
              fields: [
                { name: 'Job ID', value: `\`${job.id.slice(0, 8)}\``, inline: true },
                { name: 'Mode', value: job.mode || 'unknown', inline: true },
                { name: 'Cost', value: `$${job.cost || '0.00'}`, inline: true },
              ],
              timestamp: new Date().toISOString(),
              footer: { text: 'Post-Job Scenario Checker' },
            },
          ],
        }),
      });
    } catch (error) {
      console.error(`[Scenario Check] Discord notification failed:`, error);
    }
  }
}

export const postJobScenarioChecker = PostJobScenarioChecker.getInstance();
