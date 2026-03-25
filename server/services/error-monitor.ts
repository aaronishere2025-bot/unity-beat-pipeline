/**
 * ERROR MONITOR SERVICE
 *
 * Captures all errors system-wide, categorizes them, and triggers auto-fix agent.
 * Learns from error patterns to prevent future issues.
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

export interface ErrorContext {
  service: string;
  operation: string;
  jobId?: string;
  packageId?: string;
  timestamp: Date;
  stackTrace?: string;
  metadata?: any;
}

export interface ErrorReport {
  id: string;
  errorType: string;
  errorMessage: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: ErrorContext;
  fixAttempted: boolean;
  fixSucceeded?: boolean;
  fixStrategy?: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
  status: 'active' | 'fixed' | 'ignored' | 'escalated';
}

export interface ErrorPattern {
  pattern: string;
  category: string;
  commonCauses: string[];
  suggestedFix: string;
  confidence: number;
}

// ============================================================================
// ERROR CATEGORIES
// ============================================================================

const ERROR_CATEGORIES = {
  API_ERROR: {
    patterns: ['API', 'fetch', 'request', 'timeout', 'rate limit', '429', '500', '502', '503'],
    severity: 'high',
    autoFixable: true,
  },
  DATABASE_ERROR: {
    patterns: ['database', 'SQL', 'query', 'connection', 'postgres', 'drizzle'],
    severity: 'critical',
    autoFixable: true,
  },
  FILE_ERROR: {
    patterns: ['ENOENT', 'file not found', 'permission denied', 'EACCES', 'cannot read'],
    severity: 'medium',
    autoFixable: true,
  },
  SUNO_ERROR: {
    patterns: ['suno', 'music generation', 'audio', 'lyrics'],
    severity: 'high',
    autoFixable: true,
  },
  KLING_ERROR: {
    patterns: ['kling', 'video generation', 'clip generation', 'prompt'],
    severity: 'high',
    autoFixable: true,
  },
  VALIDATION_ERROR: {
    patterns: ['validation', 'invalid', 'missing required', 'schema'],
    severity: 'low',
    autoFixable: true,
  },
  TIMEOUT_ERROR: {
    patterns: ['timeout', 'ETIMEDOUT', 'ECONNREFUSED'],
    severity: 'medium',
    autoFixable: true,
  },
  MEMORY_ERROR: {
    patterns: ['out of memory', 'heap', 'allocation failed'],
    severity: 'critical',
    autoFixable: false,
  },
  UNKNOWN: {
    patterns: [],
    severity: 'medium',
    autoFixable: false,
  },
};

// ============================================================================
// ERROR MONITOR CLASS
// ============================================================================

class ErrorMonitor {
  private errorCache: Map<string, ErrorReport> = new Map();
  private errorHandlers: Array<(error: ErrorReport) => Promise<void>> = [];
  // Dedup: track recent AI analyses by error category to avoid re-analyzing the same type within 5 min
  private recentAnalyses: Map<string, number> = new Map();
  private readonly ANALYSIS_DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Capture and analyze an error
   */
  async captureError(error: Error, context: Partial<ErrorContext>): Promise<ErrorReport> {
    const errorMessage = error.message || String(error);
    const errorHash = this.hashError(errorMessage, context.service || 'unknown');

    // Check if we've seen this error before
    let report = this.errorCache.get(errorHash);

    if (report) {
      // Update existing error
      report.occurrenceCount++;
      report.lastSeen = new Date();
      this.errorCache.set(errorHash, report);
    } else {
      // Create new error report
      const category = this.categorizeError(errorMessage);
      const severity = this.determineSeverity(errorMessage, category);

      report = {
        id: this.generateId(),
        errorType: category,
        errorMessage,
        severity,
        context: {
          service: context.service || 'unknown',
          operation: context.operation || 'unknown',
          jobId: context.jobId,
          packageId: context.packageId,
          timestamp: new Date(),
          stackTrace: error.stack,
          metadata: context.metadata,
        },
        fixAttempted: false,
        occurrenceCount: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
        status: 'active',
      };

      this.errorCache.set(errorHash, report);
    }

    // Save to database
    await this.saveErrorReport(report);

    // Log the error
    console.error(`[Error Monitor] ${report.severity.toUpperCase()}: ${errorMessage}`);
    console.error(`[Error Monitor] Category: ${report.errorType}, Service: ${report.context.service}`);

    // Deduplicate AI analysis — skip if same error category was analyzed within 5 minutes
    const lastAnalysis = this.recentAnalyses.get(report.errorType);
    const now = Date.now();
    const isRecentlyAnalyzed = lastAnalysis && now - lastAnalysis < this.ANALYSIS_DEDUP_WINDOW_MS;

    if (isRecentlyAnalyzed) {
      console.log(
        `[Error Monitor] Skipping AI analysis for ${report.errorType} — same category analyzed ${Math.round((now - lastAnalysis!) / 1000)}s ago`,
      );
    } else {
      // Trigger auto-fix if applicable
      if (this.shouldAutoFix(report)) {
        console.log(`[Error Monitor] Triggering auto-fix for ${report.id}`);
        this.triggerAutoFix(report);
        this.recentAnalyses.set(report.errorType, now);
      }

      // Generate Claude Code error report for all high/critical errors
      if (report.severity === 'high' || report.severity === 'critical') {
        this.generateClaudeCodeReport(report);
        this.recentAnalyses.set(report.errorType, now);
      }
    }

    // Check for alert-worthy conditions
    await this.checkAlerts(report);

    // Notify error handlers
    for (const handler of this.errorHandlers) {
      try {
        await handler(report);
      } catch (handlerError) {
        console.error('[Error Monitor] Handler error:', handlerError);
      }
    }

    return report;
  }

  /**
   * Check for alert-worthy conditions
   */
  private async checkAlerts(report: ErrorReport) {
    try {
      // Import alert service dynamically to avoid circular dependencies
      const { alertService } = await import('./alert-service');

      // Check conditions after error
      await alertService.checkConditionsAfterError(report);

      // Periodically check failure rate (every 10th error to avoid too frequent checks)
      if (report.occurrenceCount % 10 === 0) {
        await alertService.checkFailureRate();
      }

      // Periodically check cost overrun (every 20th error)
      if (report.occurrenceCount % 20 === 0) {
        await alertService.checkCostOverrun();
      }
    } catch (error: any) {
      console.error('[Error Monitor] Failed to check alerts:', error.message);
    }
  }

  /**
   * Register error handler
   */
  onError(handler: (error: ErrorReport) => Promise<void>) {
    this.errorHandlers.push(handler);
  }

  /**
   * Categorize error based on message
   */
  private categorizeError(message: string): string {
    const lowerMessage = message.toLowerCase();

    for (const [category, config] of Object.entries(ERROR_CATEGORIES)) {
      for (const pattern of config.patterns) {
        if (lowerMessage.includes(pattern.toLowerCase())) {
          return category;
        }
      }
    }

    return 'UNKNOWN';
  }

  /**
   * Determine error severity
   */
  private determineSeverity(message: string, category: string): 'low' | 'medium' | 'high' | 'critical' {
    const categoryConfig = ERROR_CATEGORIES[category as keyof typeof ERROR_CATEGORIES];
    if (categoryConfig) {
      return categoryConfig.severity as any;
    }

    // Check for critical keywords
    if (message.includes('crash') || message.includes('fatal') || message.includes('shutdown')) {
      return 'critical';
    }

    return 'medium';
  }

  /**
   * Check if error should trigger auto-fix
   */
  private shouldAutoFix(report: ErrorReport): boolean {
    // Don't auto-fix if already attempted
    if (report.fixAttempted) {
      return false;
    }

    // Check if category is auto-fixable
    const categoryConfig = ERROR_CATEGORIES[report.errorType as keyof typeof ERROR_CATEGORIES];
    if (!categoryConfig?.autoFixable) {
      return false;
    }

    // Don't auto-fix memory errors
    if (report.errorType === 'MEMORY_ERROR') {
      return false;
    }

    // Auto-fix if high or critical severity, or if occurred multiple times
    return report.severity === 'high' || report.severity === 'critical' || report.occurrenceCount >= 3;
  }

  /**
   * Trigger auto-fix agent
   */
  private async triggerAutoFix(report: ErrorReport) {
    try {
      // Mark as attempted
      report.fixAttempted = true;
      await this.saveErrorReport(report);

      // Import auto-fix agent dynamically
      const { autoFixAgent } = await import('./auto-fix-agent');

      // Trigger fix in background
      autoFixAgent.attemptFix(report).catch((err) => {
        console.error('[Error Monitor] Auto-fix failed:', err.message);
      });
    } catch (error: any) {
      console.error('[Error Monitor] Failed to trigger auto-fix:', error.message);
    }
  }

  /**
   * Generate Claude Code-compatible error report
   */
  private async generateClaudeCodeReport(report: ErrorReport) {
    try {
      // Import reporter dynamically
      const { claudeCodeErrorReporter } = await import('./claude-code-error-reporter');

      // Generate report in background
      claudeCodeErrorReporter
        .generateReport(report)
        .then((errorId) => {
          console.log(`[Error Monitor] Claude Code report generated and saved to database: ${errorId}`);
          console.log(`[Error Monitor] 💡 TIP: View report via API at GET /api/errors/${errorId}`);
        })
        .catch((err) => {
          console.error('[Error Monitor] Failed to generate Claude Code report:', err.message);
        });
    } catch (error: any) {
      console.error('[Error Monitor] Failed to trigger Claude Code reporter:', error.message);
    }
  }

  /**
   * Get error statistics
   */
  async getStats() {
    const errors = Array.from(this.errorCache.values());

    const stats = {
      total: errors.length,
      active: errors.filter((e) => e.status === 'active').length,
      fixed: errors.filter((e) => e.status === 'fixed').length,
      bySeverity: {
        critical: errors.filter((e) => e.severity === 'critical').length,
        high: errors.filter((e) => e.severity === 'high').length,
        medium: errors.filter((e) => e.severity === 'medium').length,
        low: errors.filter((e) => e.severity === 'low').length,
      },
      byCategory: {} as Record<string, number>,
      fixSuccessRate: 0,
    };

    // Count by category
    for (const error of errors) {
      stats.byCategory[error.errorType] = (stats.byCategory[error.errorType] || 0) + 1;
    }

    // Calculate fix success rate
    const fixAttempts = errors.filter((e) => e.fixAttempted).length;
    const fixSuccesses = errors.filter((e) => e.fixSucceeded).length;
    stats.fixSuccessRate = fixAttempts > 0 ? (fixSuccesses / fixAttempts) * 100 : 0;

    return stats;
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 20): ErrorReport[] {
    return Array.from(this.errorCache.values())
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, limit);
  }

  /**
   * Mark error as fixed
   */
  async markFixed(errorId: string, strategy: string) {
    for (const [hash, report] of this.errorCache.entries()) {
      if (report.id === errorId) {
        report.status = 'fixed';
        report.fixSucceeded = true;
        report.fixStrategy = strategy;
        this.errorCache.set(hash, report);
        await this.saveErrorReport(report);
        return true;
      }
    }
    return false;
  }

  /**
   * Save error report to database
   */
  private async saveErrorReport(report: ErrorReport) {
    try {
      // Include AI analysis if available
      const aiAnalysis = (report as any).aiAnalysis || null;
      const markdownReport = (report as any).markdownReport || null;
      const resolved = (report as any).resolved || false;
      const resolvedAt = (report as any).resolvedAt || null;
      const resolvedBy = (report as any).resolvedBy || null;
      const resolvedNotes = (report as any).resolvedNotes || null;

      await db.execute(sql`
        INSERT INTO error_reports (
          id, error_type, error_message, severity, context,
          fix_attempted, fix_succeeded, fix_strategy,
          occurrence_count, first_seen, last_seen, status,
          ai_analysis, markdown_report, resolved, resolved_at, resolved_by, resolved_notes
        ) VALUES (
          ${report.id}, ${report.errorType}, ${report.errorMessage},
          ${report.severity}, ${JSON.stringify(report.context)},
          ${report.fixAttempted}, ${report.fixSucceeded || null}, ${report.fixStrategy || null},
          ${report.occurrenceCount}, ${report.firstSeen}, ${report.lastSeen}, ${report.status},
          ${aiAnalysis ? JSON.stringify(aiAnalysis) : null}, ${markdownReport},
          ${resolved}, ${resolvedAt}, ${resolvedBy}, ${resolvedNotes}
        )
        ON CONFLICT (id) DO UPDATE SET
          occurrence_count = ${report.occurrenceCount},
          last_seen = ${report.lastSeen},
          fix_attempted = ${report.fixAttempted},
          fix_succeeded = ${report.fixSucceeded || null},
          fix_strategy = ${report.fixStrategy || null},
          status = ${report.status},
          ai_analysis = ${aiAnalysis ? JSON.stringify(aiAnalysis) : null},
          markdown_report = ${markdownReport},
          resolved = ${resolved},
          resolved_at = ${resolvedAt},
          resolved_by = ${resolvedBy},
          resolved_notes = ${resolvedNotes}
      `);
    } catch (error) {
      console.error('[Error Monitor] Failed to save error report:', error);
    }
  }

  /**
   * Hash error for deduplication
   */
  private hashError(message: string, service: string): string {
    const normalized = message.toLowerCase().replace(/\d+/g, 'N');
    return `${service}:${normalized}`;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton
export const errorMonitor = new ErrorMonitor();

// Global error handler
process.on('uncaughtException', (error) => {
  errorMonitor.captureError(error, {
    service: 'global',
    operation: 'uncaughtException',
  });
});

process.on('unhandledRejection', (reason: any) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  errorMonitor.captureError(error, {
    service: 'global',
    operation: 'unhandledRejection',
  });
});
