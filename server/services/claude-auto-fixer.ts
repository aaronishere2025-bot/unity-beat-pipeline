/**
 * CLAUDE AUTO-FIXER
 *
 * Automatically invokes Claude Code CLI to diagnose and fix errors detected
 * by the health check system. Reports results back to Discord.
 *
 * Safety:
 * - Max 1 invocation per 30 minutes (rate limiting)
 * - 5-minute timeout per invocation
 * - $2 max budget per invocation
 * - Only triggers on code-fixable issues (not infra like disk/network)
 * - Logs everything to /tmp/claude-auto-fix/
 * - Posts results to Discord
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { sendDiscordEmbed } from './alert-service';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes between invocations
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minute max per invocation
const MAX_BUDGET_USD = 0.5;
const LOG_DIR = '/tmp/claude-auto-fix';
const PROJECT_DIR = '/home/aaronishere2025';
const LOCK_FILE = '/tmp/claude-auto-fix.lock';
const ATTEMPTED_JOBS_FILE = '/tmp/claude-auto-fix/attempted-jobs.json';

// Discord embed colors
const COLOR_GREEN = 0x2ecc71;
const COLOR_YELLOW = 0xf1c40f;
const COLOR_RED = 0xe74c3c;
const COLOR_BLUE = 0x3498db;

// ============================================================================
// Types
// ============================================================================

interface FixableIssue {
  type: 'failed_job' | 'stuck_job' | 'runtime_error' | 'build_error';
  summary: string;
  details: string;
  jobId?: string;
  errorMessage?: string;
}

interface FixAttemptResult {
  timestamp: Date;
  issue: FixableIssue;
  success: boolean;
  claudeOutput: string;
  durationMs: number;
  error?: string;
}

// ============================================================================
// Claude Auto-Fixer Service
// ============================================================================

class ClaudeAutoFixer {
  private static instance: ClaudeAutoFixer;
  private lastInvocation = 0;
  private isRunning = false;
  private history: FixAttemptResult[] = [];
  private readonly MAX_HISTORY = 50;
  private attemptedJobIds = new Set<string>(); // Track which jobs we've already tried to fix

  static getInstance(): ClaudeAutoFixer {
    if (!ClaudeAutoFixer.instance) {
      ClaudeAutoFixer.instance = new ClaudeAutoFixer();
    }
    return ClaudeAutoFixer.instance;
  }

  constructor() {
    // Ensure log directory exists
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    // Load previously attempted job IDs from disk (survives restarts)
    try {
      if (existsSync(ATTEMPTED_JOBS_FILE)) {
        const data = JSON.parse(readFileSync(ATTEMPTED_JOBS_FILE, 'utf-8'));
        if (Array.isArray(data)) {
          data.forEach((id: string) => this.attemptedJobIds.add(id));
          console.log(`[ClaudeAutoFixer] Loaded ${data.length} previously attempted job IDs`);
        }
      }
    } catch {}
  }

  private persistAttemptedJobs(): void {
    try {
      writeFileSync(ATTEMPTED_JOBS_FILE, JSON.stringify([...this.attemptedJobIds]));
    } catch {}
  }

  /**
   * Evaluate health report and attempt to fix code-level issues
   */
  async evaluateAndFix(issues: FixableIssue[]): Promise<FixAttemptResult | null> {
    // Filter to only code-fixable issues that haven't been attempted before
    const fixable = issues.filter((i) => {
      if (!this.isCodeFixable(i)) return false;
      // Skip jobs we've already attempted to fix (prevents infinite retry loops)
      if (i.jobId && this.attemptedJobIds.has(i.jobId)) {
        console.log(`[ClaudeAutoFixer] Skipping already-attempted job: ${i.jobId}`);
        return false;
      }
      return true;
    });
    if (fixable.length === 0) return null;

    // Rate limiting
    const now = Date.now();
    if (now - this.lastInvocation < COOLDOWN_MS) {
      const remaining = Math.ceil((COOLDOWN_MS - (now - this.lastInvocation)) / 60000);
      console.log(`[ClaudeAutoFixer] Cooldown active — ${remaining}m remaining`);
      return null;
    }

    // Prevent concurrent runs
    if (this.isRunning) {
      console.log('[ClaudeAutoFixer] Already running, skipping');
      return null;
    }

    // Pick the most important issue
    const issue = this.prioritize(fixable);
    console.log(`[ClaudeAutoFixer] Attempting fix: ${issue.type} — ${issue.summary}`);

    return await this.invokeClaude(issue);
  }

  /**
   * Invoke Claude Code CLI to fix an issue
   */
  private async invokeClaude(issue: FixableIssue): Promise<FixAttemptResult> {
    this.isRunning = true;
    this.lastInvocation = Date.now();
    const start = Date.now();

    // Track this job ID so we don't re-attempt it (persists across restarts)
    if (issue.jobId) {
      this.attemptedJobIds.add(issue.jobId);
      this.persistAttemptedJobs();
    }

    // Write lock file
    try {
      writeFileSync(LOCK_FILE, new Date().toISOString());
    } catch {}

    const prompt = this.buildPrompt(issue);
    const logFile = `${LOG_DIR}/fix-${Date.now()}.log`;

    try {
      // Notify Discord that we're starting
      await this.notifyStart(issue);

      // Write prompt to file for logging
      writeFileSync(`${logFile}.prompt`, prompt);

      // Invoke Claude CLI in print mode with permissions bypassed
      const claudeCmd = [
        'claude',
        '-p',
        '--dangerously-skip-permissions',
        '--model opus',
        `--max-budget-usd ${MAX_BUDGET_USD}`,
      ].join(' ');

      // Write prompt to temp file to avoid shell escaping issues with emojis/special chars
      const promptFile = `${logFile}.input`;
      writeFileSync(promptFile, prompt);

      const { stdout, stderr } = await execAsync(`cat "${promptFile}" | ${claudeCmd}`, {
        cwd: PROJECT_DIR,
        timeout: TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL: '1' },
      });

      const output = stdout + (stderr ? `\n\nSTDERR:\n${stderr}` : '');

      // Save full output
      writeFileSync(logFile, output);

      // Check if Claude's output indicates a real fix vs an error condition
      const outputLower = output.toLowerCase();
      const isActualFailure =
        /exceeded.*budget|error:|could not|unable to|cannot fix|can't fix/i.test(output) && output.length < 200;

      const result: FixAttemptResult = {
        timestamp: new Date(),
        issue,
        success: !isActualFailure,
        claudeOutput: output.slice(0, 4000), // Truncate for Discord
        durationMs: Date.now() - start,
        error: isActualFailure ? output.slice(0, 500) : undefined,
      };

      this.recordResult(result);
      await this.notifyResult(result);
      console.log(`[ClaudeAutoFixer] Fix completed in ${result.durationMs}ms`);

      return result;
    } catch (error: any) {
      const output = error.stdout || error.message || 'Unknown error';
      writeFileSync(
        logFile,
        `ERROR:\n${error.message}\n\nSTDOUT:\n${error.stdout || ''}\n\nSTDERR:\n${error.stderr || ''}`,
      );

      const result: FixAttemptResult = {
        timestamp: new Date(),
        issue,
        success: false,
        claudeOutput: output.slice(0, 4000),
        durationMs: Date.now() - start,
        error: error.message?.slice(0, 500),
      };

      this.recordResult(result);
      await this.notifyResult(result);
      console.error(`[ClaudeAutoFixer] Fix failed: ${error.message}`);

      return result;
    } finally {
      this.isRunning = false;
      // Remove lock file
      try {
        const { unlinkSync } = require('fs');
        unlinkSync(LOCK_FILE);
      } catch {}
    }
  }

  /**
   * Build the prompt for Claude CLI
   */
  private buildPrompt(issue: FixableIssue): string {
    const baseInstructions = `You are an automated error fixer for a YouTube content creation platform.
Your job is to diagnose and fix the following error.

RULES:
- Read the relevant source files before making changes
- Make minimal, targeted fixes — don't refactor unrelated code
- After fixing, verify the fix compiles by running: npm run build
- If the build succeeds, the fix is done
- If you can't fix it, explain why clearly
- Do NOT restart the server or run destructive commands
- Do NOT modify .env files or secrets
- Do NOT push to git`;

    switch (issue.type) {
      case 'failed_job':
        return `${baseInstructions}

FAILED JOB ERROR:
${issue.details}

${issue.errorMessage ? `Error message: ${issue.errorMessage}` : ''}
${issue.jobId ? `Job ID: ${issue.jobId}` : ''}

Investigate the error, find the root cause in the codebase, and apply a fix.
Focus on the server/services/ directory where the job pipeline code lives.`;

      case 'stuck_job':
        return `${baseInstructions}

STUCK JOB:
${issue.details}

Jobs are stuck in "processing" status. Investigate:
1. Check server/services/job-worker.ts for the processing pipeline
2. Check if there's a missing error handler causing silent failures
3. Check if FFmpeg or Kling processes are hanging
4. Apply a fix to prevent jobs from getting stuck in the future`;

      case 'runtime_error':
        return `${baseInstructions}

RUNTIME ERROR:
${issue.details}

${issue.errorMessage ? `Error: ${issue.errorMessage}` : ''}

Find and fix the root cause. Check the stack trace to identify the exact file and line.`;

      case 'build_error':
        return `${baseInstructions}

BUILD ERROR:
${issue.details}

Fix the TypeScript compilation error. Run npm run build to verify.`;

      default:
        return `${baseInstructions}

ERROR:
${issue.details}

Investigate and fix the issue.`;
    }
  }

  /**
   * Check if an issue is something Claude Code can fix (vs infrastructure)
   */
  private isCodeFixable(issue: FixableIssue): boolean {
    // Skip infrastructure issues that Claude can't fix
    const infraPatterns = [
      /rate limit|429|too many requests/i,
      /ECONNREFUSED|ETIMEDOUT|network/i,
      /disk space|no space left/i,
      /out of memory|OOM/i,
      /permission denied/i,
      /API key.*invalid|unauthorized|403/i,
      /Server restarted during processing/i, // Not a code bug, just restart
    ];

    const msg = `${issue.summary} ${issue.details} ${issue.errorMessage || ''}`;
    return !infraPatterns.some((p) => p.test(msg));
  }

  /**
   * Prioritize issues — failed jobs > runtime errors > stuck jobs > build errors
   */
  private prioritize(issues: FixableIssue[]): FixableIssue {
    const priority: Record<string, number> = {
      runtime_error: 1,
      failed_job: 2,
      build_error: 3,
      stuck_job: 4,
    };

    return issues.sort((a, b) => (priority[a.type] || 99) - (priority[b.type] || 99))[0];
  }

  /**
   * Notify Discord that a fix attempt is starting
   */
  private async notifyStart(issue: FixableIssue): Promise<void> {
    const webhookUrl = process.env.DISCORD_HEALTH_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      await sendDiscordEmbed({
        title: '\uD83E\uDD16 Claude Auto-Fixer: Starting',
        description: `Detected fixable issue — invoking Claude Code CLI`,
        color: COLOR_BLUE,
        fields: [
          { name: 'Issue Type', value: issue.type, inline: true },
          { name: 'Summary', value: issue.summary.slice(0, 256), inline: false },
          { name: 'Budget', value: `$${MAX_BUDGET_USD} max`, inline: true },
          { name: 'Timeout', value: `${TIMEOUT_MS / 60000}m`, inline: true },
        ],
        footer: { text: 'Claude Auto-Fixer | Unity AI' },
      });
    } catch {
      // Non-critical
    }
  }

  /**
   * Notify Discord with the fix result
   */
  private async notifyResult(result: FixAttemptResult): Promise<void> {
    const webhookUrl = process.env.DISCORD_HEALTH_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
      const emoji = result.success ? '\u2705' : '\u274C';
      const color = result.success ? COLOR_GREEN : COLOR_RED;
      const status = result.success ? 'Fix Applied' : 'Fix Failed';

      // Truncate claude output for Discord (max 1024 per field)
      const outputPreview = result.claudeOutput
        .replace(/```/g, '`\u200b`\u200b`') // Escape triple backticks
        .slice(0, 900);

      const fields = [
        { name: 'Issue', value: `**${result.issue.type}**: ${result.issue.summary.slice(0, 200)}`, inline: false },
        { name: 'Duration', value: `${(result.durationMs / 1000).toFixed(1)}s`, inline: true },
        { name: 'Status', value: status, inline: true },
      ];

      if (outputPreview) {
        fields.push({
          name: 'Claude Output',
          value: outputPreview.slice(0, 1024),
          inline: false,
        });
      }

      if (result.error) {
        fields.push({
          name: 'Error',
          value: result.error.slice(0, 256),
          inline: false,
        });
      }

      await sendDiscordEmbed({
        title: `${emoji} Claude Auto-Fixer: ${status}`,
        description: `Auto-fix attempt completed in ${(result.durationMs / 1000).toFixed(1)}s`,
        color,
        fields,
        footer: { text: 'Claude Auto-Fixer | Unity AI' },
      });
    } catch {
      // Non-critical
    }
  }

  /**
   * Record result in history
   */
  private recordResult(result: FixAttemptResult): void {
    this.history.push(result);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
  }

  /**
   * Shell-escape a string for use in echo
   */
  private shellEscape(str: string): string {
    // Use $'...' syntax for safe shell escaping
    return "$'" + str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      totalAttempts: this.history.length,
      successCount: this.history.filter((r) => r.success).length,
      failCount: this.history.filter((r) => !r.success).length,
      lastAttempt: this.history.length > 0 ? this.history[this.history.length - 1] : null,
      isRunning: this.isRunning,
      cooldownRemaining: Math.max(0, COOLDOWN_MS - (Date.now() - this.lastInvocation)),
      recentHistory: this.history.slice(-5),
    };
  }

  /**
   * Get recent fix history
   */
  getHistory(limit = 10): FixAttemptResult[] {
    return this.history.slice(-limit);
  }
}

// Export singleton
export const claudeAutoFixer = ClaudeAutoFixer.getInstance();
export type { FixableIssue, FixAttemptResult };
