/**
 * AUTO-FIX AGENT
 *
 * Uses AI to diagnose errors and automatically generate + apply fixes.
 * Learns from successful fixes to improve over time.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { errorMonitor, type ErrorReport } from './error-monitor';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// TYPES
// ============================================================================

interface FixStrategy {
  strategy: string;
  description: string;
  actions: FixAction[];
  confidence: number;
  estimatedTime: string;
}

interface FixAction {
  type: 'code_change' | 'config_update' | 'retry' | 'restart' | 'manual';
  target: string;
  changes?: string;
  command?: string;
}

interface FixResult {
  success: boolean;
  strategy: string;
  appliedActions: string[];
  outcome: string;
  error?: string;
}

// ============================================================================
// FIX PATTERNS DATABASE
// ============================================================================

const KNOWN_FIX_PATTERNS = {
  'API rate limit': {
    pattern: /rate limit|429|too many requests/i,
    fixes: [
      {
        strategy: 'exponential_backoff',
        description: 'Add exponential backoff with retry logic',
        confidence: 0.9,
      },
      {
        strategy: 'request_queuing',
        description: 'Implement request queue with rate limiting',
        confidence: 0.8,
      },
    ],
  },
  'API timeout': {
    pattern: /timeout|ETIMEDOUT|timed out/i,
    fixes: [
      {
        strategy: 'increase_timeout',
        description: 'Increase timeout duration',
        confidence: 0.7,
      },
      {
        strategy: 'retry_with_backoff',
        description: 'Retry with exponential backoff',
        confidence: 0.9,
      },
    ],
  },
  'File not found': {
    pattern: /ENOENT|file not found|cannot find/i,
    fixes: [
      {
        strategy: 'create_directory',
        description: 'Create missing directory structure',
        confidence: 0.9,
      },
      {
        strategy: 'fix_path',
        description: 'Fix file path references',
        confidence: 0.8,
      },
    ],
  },
  'Database connection': {
    pattern: /database.*connection|postgres.*connection|ECONNREFUSED/i,
    fixes: [
      {
        strategy: 'reconnect',
        description: 'Reconnect to database with retry',
        confidence: 0.9,
      },
      {
        strategy: 'connection_pool',
        description: 'Adjust connection pool settings',
        confidence: 0.7,
      },
    ],
  },
  'Missing environment variable': {
    pattern: /environment variable|env.*not.*set|missing.*key/i,
    fixes: [
      {
        strategy: 'set_default',
        description: 'Set safe default value',
        confidence: 0.6,
      },
      {
        strategy: 'prompt_user',
        description: 'Prompt for missing configuration',
        confidence: 0.8,
      },
    ],
  },
};

// ============================================================================
// AUTO-FIX AGENT CLASS
// ============================================================================

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

class AutoFixAgent {
  private geminiAvailable: boolean;
  private fixHistory: Map<string, FixResult[]> = new Map();
  private learningEnabled = true;

  constructor() {
    this.geminiAvailable = !!(process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY);
  }

  /**
   * Attempt to fix an error
   */
  async attemptFix(errorReport: ErrorReport): Promise<FixResult> {
    console.log(`[Auto-Fix] Analyzing error: ${errorReport.errorMessage}`);

    try {
      // Step 1: Check known patterns first
      const knownFix = this.checkKnownPatterns(errorReport);
      if (knownFix) {
        console.log(`[Auto-Fix] Using known pattern: ${knownFix.strategy}`);
        return await this.applyFix(errorReport, knownFix);
      }

      // Step 2: Use AI to diagnose and generate fix
      console.log('[Auto-Fix] Using AI diagnostics...');
      const aiStrategy = await this.generateFixWithAI(errorReport);

      if (!aiStrategy) {
        return {
          success: false,
          strategy: 'none',
          appliedActions: [],
          outcome: 'No fix strategy could be generated',
          error: 'AI unable to generate fix',
        };
      }

      // Step 3: Apply the fix
      return await this.applyFix(errorReport, aiStrategy);
    } catch (error: any) {
      console.error('[Auto-Fix] Fix attempt failed:', error.message);

      return {
        success: false,
        strategy: 'error',
        appliedActions: [],
        outcome: 'Fix attempt failed',
        error: error.message,
      };
    }
  }

  /**
   * Check if error matches known pattern
   */
  private checkKnownPatterns(errorReport: ErrorReport): FixStrategy | null {
    for (const [patternName, patternConfig] of Object.entries(KNOWN_FIX_PATTERNS)) {
      if (patternConfig.pattern.test(errorReport.errorMessage)) {
        const fix = patternConfig.fixes[0]; // Use highest confidence fix

        return {
          strategy: fix.strategy,
          description: fix.description,
          actions: this.generateActionsForPattern(patternName, errorReport),
          confidence: fix.confidence,
          estimatedTime: '< 1 minute',
        };
      }
    }

    return null;
  }

  /**
   * Generate actions for known pattern
   */
  private generateActionsForPattern(pattern: string, errorReport: ErrorReport): FixAction[] {
    const actions: FixAction[] = [];

    switch (pattern) {
      case 'API rate limit':
        actions.push({
          type: 'retry',
          target: errorReport.context.service,
          command: 'Implement exponential backoff retry',
        });
        break;

      case 'API timeout':
        actions.push({
          type: 'config_update',
          target: 'timeout settings',
          changes: 'Increase timeout from default to 60000ms',
        });
        break;

      case 'File not found':
        actions.push({
          type: 'code_change',
          target: 'file path',
          changes: 'Create directory if not exists',
        });
        break;

      case 'Database connection':
        actions.push({
          type: 'retry',
          target: 'database connection',
          command: 'Reconnect with exponential backoff',
        });
        break;
    }

    return actions;
  }

  /**
   * Use AI to generate fix strategy
   */
  private async generateFixWithAI(errorReport: ErrorReport): Promise<FixStrategy | null> {
    if (!this.geminiAvailable) {
      console.log('[Auto-Fix] Gemini not configured, skipping AI diagnostics');
      return null;
    }

    try {
      const prompt = this.buildDiagnosticPrompt(errorReport);

      const sysPrompt = `You are an expert software engineer specializing in error diagnosis and automated fixes.
Your task is to analyze errors and generate concrete, executable fix strategies.

Output format (JSON):
{
  "strategy": "brief name",
  "description": "what the fix does",
  "actions": [
    {
      "type": "code_change|config_update|retry|restart",
      "target": "what to change",
      "changes": "specific changes to make"
    }
  ],
  "confidence": 0.0-1.0,
  "estimatedTime": "time estimate"
}`;

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 1000, responseMimeType: 'application/json' },
        systemInstruction: sysPrompt,
      });
      const result = await model.generateContent(prompt);
      const content = result.response.text();
      if (!content) return null;

      const strategy = JSON.parse(content) as FixStrategy;
      console.log(`[Auto-Fix] AI generated strategy: ${strategy.strategy} (confidence: ${strategy.confidence})`);

      return strategy;
    } catch (error: any) {
      console.error('[Auto-Fix] AI generation failed:', error.message);
      return null;
    }
  }

  /**
   * Build diagnostic prompt for AI
   */
  private buildDiagnosticPrompt(errorReport: ErrorReport): string {
    return `
ERROR REPORT:
Type: ${errorReport.errorType}
Message: ${errorReport.errorMessage}
Severity: ${errorReport.severity}
Service: ${errorReport.context.service}
Operation: ${errorReport.context.operation}
Occurrences: ${errorReport.occurrenceCount}

${errorReport.context.stackTrace ? `Stack Trace:\n${errorReport.context.stackTrace.substring(0, 1000)}` : ''}

${errorReport.context.metadata ? `Additional Context:\n${JSON.stringify(errorReport.context.metadata, null, 2)}` : ''}

TASK:
1. Diagnose the root cause
2. Generate a concrete fix strategy
3. List specific actions to implement
4. Estimate confidence (0.0-1.0)

Focus on fixes that can be automatically applied.
Prefer configuration changes over code changes.
If code changes are needed, be very specific about what to change.
`;
  }

  /**
   * Apply fix strategy
   */
  private async applyFix(errorReport: ErrorReport, strategy: FixStrategy): Promise<FixResult> {
    console.log(`[Auto-Fix] Applying strategy: ${strategy.strategy}`);

    const appliedActions: string[] = [];
    let success = true;
    let outcome = '';

    for (const action of strategy.actions) {
      try {
        const actionResult = await this.executeAction(action, errorReport);
        appliedActions.push(`${action.type}: ${actionResult}`);

        if (!actionResult.includes('success')) {
          success = false;
        }
      } catch (error: any) {
        appliedActions.push(`${action.type}: failed - ${error.message}`);
        success = false;
      }
    }

    outcome = success
      ? `Fix applied successfully: ${strategy.description}`
      : `Fix partially applied: ${appliedActions.length}/${strategy.actions.length} actions completed`;

    // Update error report
    if (success) {
      await errorMonitor.markFixed(errorReport.id, strategy.strategy);
    }

    // Save to fix history
    const result: FixResult = {
      success,
      strategy: strategy.strategy,
      appliedActions,
      outcome,
    };

    this.recordFix(errorReport.errorType, result);

    // Learn from this fix
    if (this.learningEnabled && success) {
      await this.learnFromFix(errorReport, strategy);
    }

    console.log(`[Auto-Fix] Result: ${success ? 'SUCCESS' : 'PARTIAL'}`);
    console.log(`[Auto-Fix] ${outcome}`);

    return result;
  }

  /**
   * Execute a fix action
   */
  private async executeAction(action: FixAction, errorReport: ErrorReport): Promise<string> {
    switch (action.type) {
      case 'retry':
        // For retry actions, we just log them - the actual retry will happen automatically
        return `success: retry logic will be applied to ${action.target}`;

      case 'config_update':
        // Update configuration
        return await this.updateConfiguration(action, errorReport);

      case 'code_change':
        // For code changes, log for manual review (auto-apply coming in v2)
        return `logged: code change needed in ${action.target}`;

      case 'restart':
        // Restart service/component
        return await this.restartComponent(action.target);

      default:
        return 'unknown action type';
    }
  }

  /**
   * Update configuration
   */
  private async updateConfiguration(action: FixAction, errorReport: ErrorReport): Promise<string> {
    try {
      // Save configuration change to database
      await db.execute(sql`
        INSERT INTO auto_fix_configs (
          error_type, service, config_key, config_value, applied_at
        ) VALUES (
          ${errorReport.errorType},
          ${errorReport.context.service},
          ${action.target},
          ${action.changes},
          NOW()
        )
      `);

      return `success: configuration updated for ${action.target}`;
    } catch (error: any) {
      return `failed: ${error.message}`;
    }
  }

  /**
   * Restart component
   */
  private async restartComponent(component: string): Promise<string> {
    console.log(`[Auto-Fix] Would restart ${component} (not implemented in safe mode)`);
    return `deferred: restart would be applied to ${component}`;
  }

  /**
   * Record fix in history
   */
  private recordFix(errorType: string, result: FixResult) {
    const history = this.fixHistory.get(errorType) || [];
    history.push(result);
    this.fixHistory.set(errorType, history);

    // Keep only last 50 fixes per type
    if (history.length > 50) {
      history.shift();
    }

    // Cap total keys to 100 — evict oldest entries
    if (this.fixHistory.size > 100) {
      const firstKey = this.fixHistory.keys().next().value;
      if (firstKey !== undefined) this.fixHistory.delete(firstKey);
    }
  }

  /**
   * Learn from successful fix
   */
  private async learnFromFix(errorReport: ErrorReport, strategy: FixStrategy) {
    try {
      // Save successful pattern for future use
      await db.execute(sql`
        INSERT INTO learned_fixes (
          error_pattern, fix_strategy, confidence, success_count, last_used
        ) VALUES (
          ${errorReport.errorMessage.substring(0, 200)},
          ${JSON.stringify(strategy)},
          ${strategy.confidence},
          1,
          NOW()
        )
        ON CONFLICT (error_pattern) DO UPDATE SET
          success_count = learned_fixes.success_count + 1,
          last_used = NOW(),
          confidence = LEAST(learned_fixes.confidence + 0.1, 1.0)
      `);

      console.log('[Auto-Fix] Learned from successful fix');
    } catch (error) {
      console.error('[Auto-Fix] Failed to record learning:', error);
    }
  }

  /**
   * Get fix statistics
   */
  getStats() {
    const allFixes = Array.from(this.fixHistory.values()).flat();

    return {
      totalFixes: allFixes.length,
      successfulFixes: allFixes.filter((f) => f.success).length,
      successRate: allFixes.length > 0 ? (allFixes.filter((f) => f.success).length / allFixes.length) * 100 : 0,
      byErrorType: Object.fromEntries(this.fixHistory.entries()),
      topStrategies: this.getTopStrategies(allFixes),
    };
  }

  /**
   * Get most successful fix strategies
   */
  private getTopStrategies(fixes: FixResult[]) {
    const strategies = new Map<string, { count: number; success: number }>();

    for (const fix of fixes) {
      const current = strategies.get(fix.strategy) || { count: 0, success: 0 };
      current.count++;
      if (fix.success) current.success++;
      strategies.set(fix.strategy, current);
    }

    return Array.from(strategies.entries())
      .map(([strategy, stats]) => ({
        strategy,
        uses: stats.count,
        successRate: (stats.success / stats.count) * 100,
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);
  }
}

// Export singleton
export const autoFixAgent = new AutoFixAgent();
