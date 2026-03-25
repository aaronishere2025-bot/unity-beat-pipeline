/**
 * CLAUDE CODE ERROR REPORTER
 *
 * Generates error reports formatted specifically for Claude Code to process.
 * When errors occur, this service creates a detailed report that Claude Code
 * can read and use to make direct code changes.
 *
 * Output format: Markdown file with:
 * - Error context (file, line, function)
 * - Root cause analysis
 * - Suggested fix with exact code changes
 * - Test plan
 */

import type { ErrorReport } from './error-monitor';
import { db } from '../db';
import { sql } from 'drizzle-orm';

interface ClaudeCodeErrorReport {
  errorId: string;
  timestamp: string;
  title: string;
  severity: 'low' | 'medium' | 'high' | 'critical';

  // Context
  service: string;
  operation: string;
  errorType: string;
  errorMessage: string;
  stackTrace?: string;

  // Analysis
  rootCause: string;
  affectedFiles: string[];
  relatedCode: CodeSnippet[];

  // Fix
  suggestedFix: {
    description: string;
    changes: CodeChange[];
    testPlan: string[];
    estimatedImpact: 'low' | 'medium' | 'high';
  };

  // Meta
  confidence: number;
  autoApplyable: boolean;
}

interface CodeSnippet {
  file: string;
  lineStart: number;
  lineEnd: number;
  code: string;
}

interface CodeChange {
  file: string;
  action: 'edit' | 'create' | 'delete';
  oldCode?: string;
  newCode?: string;
  reasoning: string;
}

class ClaudeCodeErrorReporter {
  constructor() {}

  /**
   * Generate Claude Code-compatible error report and save to database
   */
  async generateReport(errorReport: ErrorReport): Promise<string> {
    console.log(`[Claude Code Reporter] Generating report for ${errorReport.id}...`);

    // Generate detailed analysis using AI
    const analysis = await this.analyzeError(errorReport);

    // Create the report
    const claudeReport: ClaudeCodeErrorReport = {
      errorId: errorReport.id,
      timestamp: new Date().toISOString(),
      title: `Auto-Fix Required: ${errorReport.errorType}`,
      severity: errorReport.severity,

      service: errorReport.context.service,
      operation: errorReport.context.operation,
      errorType: errorReport.errorType,
      errorMessage: errorReport.errorMessage,
      stackTrace: errorReport.context.stackTrace,

      rootCause: analysis.rootCause,
      affectedFiles: analysis.affectedFiles,
      relatedCode: analysis.relatedCode,

      suggestedFix: analysis.suggestedFix,

      confidence: analysis.confidence,
      autoApplyable: analysis.autoApplyable,
    };

    // Generate markdown for API responses
    const markdownReport = this.formatAsMarkdown(claudeReport);

    // Save AI analysis and markdown report to database
    await this.saveReportToDatabase(errorReport.id, analysis, markdownReport);

    console.log(`[Claude Code Reporter] Report saved to database: ${errorReport.id}`);
    return errorReport.id;
  }

  /**
   * Save report to database
   */
  private async saveReportToDatabase(errorId: string, analysis: any, markdownReport: string) {
    try {
      await db.execute(sql`
        UPDATE error_reports
        SET
          ai_analysis = ${JSON.stringify(analysis)},
          markdown_report = ${markdownReport}
        WHERE id = ${errorId}
      `);
      console.log(`[Claude Code Reporter] ✓ Saved to database`);
    } catch (error: any) {
      console.error('[Claude Code Reporter] Failed to save to database:', error.message);
    }
  }

  /**
   * Analyze error using TRIPLE GEMINI AI (3 Gemini 2.0 Flash critics with different personalities)
   */
  private async analyzeError(errorReport: ErrorReport): Promise<any> {
    try {
      // Use triple-gemini analyzer for 15x cheaper, faster analysis with caching
      const { tripleGeminiErrorAnalyzer } = await import('./triple-gemini-error-analyzer');

      const isReady = await tripleGeminiErrorAnalyzer.isReady();
      if (!isReady) {
        console.log('[Claude Code Reporter] Gemini not configured, using basic analysis');
        return this.generateBasicAnalysis(errorReport);
      }

      const availableCritics = tripleGeminiErrorAnalyzer.getAvailableCritics();
      console.log(
        `[Claude Code Reporter] Using ${availableCritics.length} Gemini critics: ${availableCritics.join(', ')}`,
      );

      const consensus = await tripleGeminiErrorAnalyzer.analyzeError(errorReport);

      console.log(`[Claude Code Reporter] Triple Gemini analysis complete:`);
      console.log(`  - Root cause: ${consensus.agreedRootCause.substring(0, 80)}...`);
      console.log(`  - Confidence: ${(consensus.consensusConfidence * 100).toFixed(1)}%`);
      console.log(`  - Analysis time: ${consensus.totalAnalysisTime}ms`);
      console.log(`  - Code changes: ${consensus.bestFix.codeChanges.length}`);
      console.log(`  - Cache hits: ${consensus.cacheHits}/3`);
      console.log(`  - Estimated cost: $${consensus.estimatedCost.toFixed(6)}`);

      // Convert to Claude Code report format
      return {
        rootCause: consensus.agreedRootCause,
        affectedFiles: Array.from(new Set(consensus.bestFix.codeChanges.map((c) => c.file))),
        relatedCode: [], // Critics don't provide line numbers yet
        suggestedFix: {
          description: consensus.bestFix.description,
          changes: consensus.bestFix.codeChanges.map((change) => ({
            file: change.file,
            action: 'edit',
            oldCode: change.oldCode,
            newCode: change.newCode,
            reasoning: `${change.reasoning} (agreed by: ${change.agreeingCritics.join(', ')})`,
          })),
          testPlan: consensus.bestFix.testPlan,
          estimatedImpact: consensus.consensusConfidence > 0.8 ? 'low' : 'medium',
        },
        confidence: consensus.consensusConfidence,
        autoApplyable: consensus.consensusConfidence > 0.7,
        tripleGeminiMetadata: {
          critics: consensus.criticAnalyses.map((a) => ({
            critic: a.critic,
            temperature: a.temperature,
            confidence: a.confidence,
            analysisTime: a.analysisTime,
            cached: a.cached,
          })),
          totalTime: consensus.totalAnalysisTime,
          cacheHits: consensus.cacheHits,
          estimatedCost: consensus.estimatedCost,
        },
      };
    } catch (error: any) {
      console.error('[Claude Code Reporter] Triple Gemini analysis failed:', error.message);
      return this.generateBasicAnalysis(errorReport);
    }
  }

  /**
   * Build analysis prompt for AI
   */
  private buildAnalysisPrompt(errorReport: ErrorReport): string {
    return `
ERROR DETAILS:
Type: ${errorReport.errorType}
Message: ${errorReport.errorMessage}
Severity: ${errorReport.severity}
Service: ${errorReport.context.service}
Operation: ${errorReport.context.operation}

${errorReport.context.stackTrace ? `STACK TRACE:\n${errorReport.context.stackTrace.substring(0, 2000)}` : ''}

${errorReport.context.metadata ? `METADATA:\n${JSON.stringify(errorReport.context.metadata, null, 2)}` : ''}

TASK:
1. Identify the root cause (be specific - which file/function/line)
2. List all affected files
3. Extract relevant code snippets (with line numbers)
4. Generate exact code changes needed to fix
5. Create test plan
6. Assess if this can be auto-applied

Be extremely specific. Claude Code needs exact file paths and code snippets to make changes.
`;
  }

  /**
   * Generate basic analysis when AI not available
   */
  private generateBasicAnalysis(errorReport: ErrorReport): any {
    const changes: CodeChange[] = [];

    // Generate basic fix recommendations based on error type
    if (errorReport.errorType === 'API_ERROR' && errorReport.errorMessage.includes('timeout')) {
      changes.push({
        file: `server/services/${errorReport.context.service}.ts`,
        action: 'edit',
        oldCode: 'timeout: 30000',
        newCode: 'timeout: 60000',
        reasoning: 'Increase timeout to prevent timeouts',
      });
    } else if (errorReport.errorType === 'FILE_ERROR' && errorReport.errorMessage.includes('ENOENT')) {
      changes.push({
        file: `server/services/${errorReport.context.service}.ts`,
        action: 'edit',
        oldCode: 'existsSync(filePath)',
        newCode: 'mkdirSync(dirname(filePath), { recursive: true })',
        reasoning: "Create directory if it doesn't exist",
      });
    }

    return {
      rootCause: errorReport.errorMessage,
      affectedFiles: [`server/services/${errorReport.context.service}.ts`],
      relatedCode: [],
      suggestedFix: {
        description: `Fix ${errorReport.errorType} in ${errorReport.context.service}`,
        changes,
        testPlan: [
          'Test the operation that caused the error',
          'Verify error no longer occurs',
          'Check for any side effects',
        ],
        estimatedImpact: 'low',
      },
      confidence: 0.6,
      autoApplyable: changes.length > 0,
    };
  }

  /**
   * Format report as markdown for Claude Code to read
   */
  private formatAsMarkdown(report: ClaudeCodeErrorReport): string {
    // Check if triple-gemini analysis was used
    const tripleGeminiInfo = (report as any).tripleGeminiMetadata;
    const multiModelInfo = (report as any).multiModelMetadata; // Legacy support

    const aiAnalysisHeader = tripleGeminiInfo
      ? `
**Analysis Method:** 🤖 Triple Gemini Consensus (3 critics with different personalities)
**Critics Used:** ${tripleGeminiInfo.critics.map((c: any) => `${c.critic} (temp=${c.temperature}, conf=${(c.confidence * 100).toFixed(0)}%, ${c.cached ? '💾 cached' : '🔄 fresh'})`).join(', ')}
**Total Analysis Time:** ${tripleGeminiInfo.totalTime}ms
**Cache Hits:** ${tripleGeminiInfo.cacheHits}/3
**Estimated Cost:** $${tripleGeminiInfo.estimatedCost.toFixed(6)}`
      : multiModelInfo
        ? `
**Analysis Method:** 🤖 Multi-Model Consensus (${multiModelInfo.models.length} AI models)
**Models Used:** ${multiModelInfo.models.map((m: any) => `${m.model} (${(m.confidence * 100).toFixed(0)}%, ${m.analysisTime}ms)`).join(', ')}
**Total Analysis Time:** ${multiModelInfo.totalTime}ms`
        : '';

    return `# ${report.title}

**Error ID:** \`${report.errorId}\`
**Timestamp:** ${report.timestamp}
**Severity:** ${report.severity.toUpperCase()}
**Confidence:** ${(report.confidence * 100).toFixed(0)}%
**Auto-Applyable:** ${report.autoApplyable ? '✅ Yes' : '❌ No'}${aiAnalysisHeader}

---

## Error Context

**Service:** ${report.service}
**Operation:** ${report.operation}
**Error Type:** ${report.errorType}
**Error Message:**
\`\`\`
${report.errorMessage}
\`\`\`

${
  report.stackTrace
    ? `
**Stack Trace:**
\`\`\`
${report.stackTrace.substring(0, 1000)}
\`\`\`
`
    : ''
}

---

## Root Cause Analysis

${report.rootCause}

**Affected Files:**
${report.affectedFiles.map((f) => `- \`${f}\``).join('\n')}

---

## Related Code

${report.relatedCode
  .map(
    (snippet) => `
### \`${snippet.file}:${snippet.lineStart}-${snippet.lineEnd}\`

\`\`\`typescript
${snippet.code}
\`\`\`
`,
  )
  .join('\n')}

---

## Suggested Fix

${report.suggestedFix.description}

**Estimated Impact:** ${report.suggestedFix.estimatedImpact}

### Code Changes

${report.suggestedFix.changes
  .map(
    (change, i) => `
#### Change ${i + 1}: ${change.action} \`${change.file}\`

**Reasoning:** ${change.reasoning}

${
  change.oldCode
    ? `
**Old Code:**
\`\`\`typescript
${change.oldCode}
\`\`\`
`
    : ''
}

${
  change.newCode
    ? `
**New Code:**
\`\`\`typescript
${change.newCode}
\`\`\`
`
    : ''
}
`,
  )
  .join('\n')}

---

## Test Plan

${report.suggestedFix.testPlan.map((step, i) => `${i + 1}. ${step}`).join('\n')}

---

## Instructions for Claude Code

This error report has been formatted for your analysis. To apply the fix:

1. Read the Root Cause Analysis carefully
2. Review the Affected Files list
3. Examine the Related Code sections for context
4. Apply the Code Changes using your Edit tool
5. Execute the Test Plan to verify the fix

**Recommended approach:**
\`\`\`typescript
// Read the affected files first
${report.affectedFiles.map((f) => `await Read({ file_path: "${f}" });`).join('\n')}

// Then apply changes using Edit tool
${report.suggestedFix.changes
  .map(
    (change) => `
// ${change.reasoning}
await Edit({
  file_path: "${change.file}",
  old_string: \`${change.oldCode || 'TBD'}\`,
  new_string: \`${change.newCode || 'TBD'}\`
});`,
  )
  .join('\n')}
\`\`\`

---

**Generated by:** Claude Code Error Reporter
**Report Path:** \`/tmp/claude-code-error-reports/${report.errorId}.md\`
`;
  }

  /**
   * Get all error reports from database
   */
  async getReports(limit: number = 50): Promise<any[]> {
    try {
      const result = await db.execute(sql`
        SELECT id, error_type, error_message, severity, ai_analysis, markdown_report, first_seen, resolved
        FROM error_reports
        WHERE markdown_report IS NOT NULL
        ORDER BY first_seen DESC
        LIMIT ${limit}
      `);
      return result.rows;
    } catch (error: any) {
      console.error('[Claude Code Reporter] Failed to fetch reports:', error.message);
      return [];
    }
  }

  /**
   * Get specific error report
   */
  async getReport(errorId: string): Promise<any | null> {
    try {
      const result = await db.execute(sql`
        SELECT *
        FROM error_reports
        WHERE id = ${errorId}
      `);
      return result.rows[0] || null;
    } catch (error: any) {
      console.error('[Claude Code Reporter] Failed to fetch report:', error.message);
      return null;
    }
  }

  /**
   * Clear old resolved reports (automatic cleanup)
   */
  async clearOldReports(olderThanDays: number = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await db.execute(sql`
        DELETE FROM error_reports
        WHERE resolved = true
          AND resolved_at < ${cutoffDate}
      `);

      const deletedCount = (result as any).rowCount || 0;
      console.log(
        `[Claude Code Reporter] Deleted ${deletedCount} old resolved reports (older than ${olderThanDays} days)`,
      );
      return deletedCount;
    } catch (error: any) {
      console.error('[Claude Code Reporter] Failed to clear old reports:', error.message);
      return 0;
    }
  }
}

// Export singleton
export const claudeCodeErrorReporter = new ClaudeCodeErrorReporter();
