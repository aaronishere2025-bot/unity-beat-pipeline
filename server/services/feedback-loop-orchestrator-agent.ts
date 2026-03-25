/**
 * FEEDBACK LOOP ORCHESTRATOR AGENT
 *
 * Coordinates all learning systems and applies recommendations to content generation.
 * Runs hourly to close the feedback loop: YouTube Performance → Learning → Generation
 *
 * Integrates:
 * - Comment Sentiment Loop (character priorities, content requests)
 * - Creative Analytics (thumbnail/title/hook patterns)
 * - Feature Correlation Analyzer (audio BPM/energy directives)
 * - Style Bandit (visual style preferences)
 *
 * Resolves conflicts when signals disagree and maintains audit trail.
 */

import { db } from '../db';
import {
  orchestrationReports,
  systemConfiguration,
  InsertOrchestrationReport,
  InsertSystemConfiguration,
} from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface LearningSignals {
  commentSentiment?: {
    topCharacters: Array<{ character: string; sentiment: number; mentions: number }>;
    contentRequests: string[];
    emotionalHighlights: Array<{ emotion: string; count: number }>;
    dataAvailable: boolean;
  };
  creativeAnalytics?: {
    winningThumbnailVariants: Array<{ variant: string; ctr: number; weight: number }>;
    titlePatterns: string[];
    hookPatterns: string[];
    dataAvailable: boolean;
  };
  featureCorrelation?: {
    bpmRecommendation?: { target: number; correlation: number };
    energyRecommendation?: { target: number; correlation: number };
    directive: string;
    actionItems: string[];
    dataAvailable: boolean;
  };
  styleBandit?: {
    topPerformingStyles: Array<{ style: string; performance: number }>;
    dataAvailable: boolean;
  };
}

export interface AppliedChanges {
  commentSentiment?: {
    characterPriorityUpdates?: Array<{ character: string; oldPriority: number; newPriority: number }>;
    requestsActedOn?: string[];
  };
  creativeAnalytics?: {
    thumbnailWeightUpdates?: Array<{ variant: string; oldWeight: number; newWeight: number }>;
    titlePatternUpdates?: string[];
    hookOptimizations?: string[];
  };
  featureCorrelation?: {
    bpmDirective?: { target: number; correlation: number };
    energyDirective?: { target: number; correlation: number };
    appliedToSuno?: boolean;
  };
  styleBandit?: {
    styleWeightUpdates?: Array<{ style: string; oldWeight: number; newWeight: number }>;
  };
}

export interface Conflict {
  type: string;
  description: string;
  resolution: string;
}

export interface OrchestrationResult {
  report: {
    id: string;
    timestamp: Date;
    appliedChanges: AppliedChanges;
    signals: LearningSignals;
    conflicts: Conflict[];
    reasoning: string;
    executionTimeMs: number;
    status: 'success' | 'partial' | 'failed';
  };
  summary: string;
}

interface ConfigValue {
  orchestrator?: {
    enabled?: boolean;
    runInterval?: number;
    minConfidence?: number;
  };
  characterPriorities?: Record<string, number>;
  thumbnailWeights?: Record<string, number>;
  sunoDirectives?: {
    targetBPM?: number;
    targetEnergy?: number;
    bpmCorrelation?: number;
    energyCorrelation?: number;
  };
  styleWeights?: Record<string, number>;
}

// ============================================================================
// FEEDBACK LOOP ORCHESTRATOR AGENT CLASS
// ============================================================================

class FeedbackLoopOrchestratorAgent {
  private lastRunTimestamp: Date | null = null;
  private isRunning = false;

  constructor() {
    this.initializeDefaultConfig();
  }

  /**
   * Main orchestration cycle - reads all learning systems and applies changes
   */
  async runOrchestrationCycle(): Promise<OrchestrationResult> {
    if (this.isRunning) {
      throw new Error('Orchestration cycle already running');
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('[Feedback Orchestrator] Starting orchestration cycle...');

      // Step 1: Gather signals from all learning systems
      const signals = await this.gatherLearningSignals();

      // Step 2: Apply changes based on signals
      const appliedChanges: AppliedChanges = {};
      const conflicts: Conflict[] = [];

      // Apply comment sentiment signals
      if (signals.commentSentiment?.dataAvailable) {
        const sentimentChanges = await this.applyCommentSentimentSignals(signals.commentSentiment);
        appliedChanges.commentSentiment = sentimentChanges;
      }

      // Apply creative analytics signals
      if (signals.creativeAnalytics?.dataAvailable) {
        const creativeChanges = await this.applyCreativeAnalyticsSignals(signals.creativeAnalytics);
        appliedChanges.creativeAnalytics = creativeChanges;
      }

      // Apply feature correlation signals
      if (signals.featureCorrelation?.dataAvailable) {
        const featureChanges = await this.applyFeatureCorrelationSignals(signals.featureCorrelation);
        appliedChanges.featureCorrelation = featureChanges;
      }

      // Apply style bandit signals
      if (signals.styleBandit?.dataAvailable) {
        const styleChanges = await this.applyStyleBanditSignals(signals.styleBandit);
        appliedChanges.styleBandit = styleChanges;
      }

      // Step 3: Resolve any conflicts
      const resolvedConflicts = await this.resolveConflicts(appliedChanges);
      conflicts.push(...resolvedConflicts);

      // Step 4: Generate reasoning
      const reasoning = this.generateReasoning(signals, appliedChanges, conflicts);

      // Step 5: Save report to database
      const executionTimeMs = Date.now() - startTime;
      const status: 'success' | 'partial' | 'failed' = conflicts.length > 0 ? 'partial' : 'success';

      const [report] = await db
        .insert(orchestrationReports)
        .values({
          appliedChanges,
          signals,
          conflicts,
          reasoning,
          executionTimeMs,
          status,
        })
        .returning();

      this.lastRunTimestamp = new Date();

      const summary = this.generateSummary(appliedChanges, conflicts);

      console.log('[Feedback Orchestrator] Cycle complete:', summary);

      return {
        report: report as any,
        summary,
      };
    } catch (error) {
      console.error('[Feedback Orchestrator] Cycle failed:', error);

      // Save error report
      const executionTimeMs = Date.now() - startTime;
      const [report] = await db
        .insert(orchestrationReports)
        .values({
          appliedChanges: {},
          signals: {},
          conflicts: [
            {
              type: 'fatal_error',
              description: error instanceof Error ? error.message : String(error),
              resolution: 'none',
            },
          ],
          reasoning: `Fatal error during orchestration: ${error instanceof Error ? error.message : String(error)}`,
          executionTimeMs,
          status: 'failed',
        })
        .returning();

      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Gather signals from all 4 learning systems
   */
  private async gatherLearningSignals(): Promise<LearningSignals> {
    const signals: LearningSignals = {};

    try {
      // Dynamic import to avoid circular dependencies
      const { commentSentimentLoop } = await import('./comment-sentiment-loop');

      // Get aggregated sentiment data
      const sentimentData = commentSentimentLoop.getAggregatedSentiment?.() || null;

      if (sentimentData) {
        signals.commentSentiment = {
          topCharacters: sentimentData.topCharacters || [],
          contentRequests: sentimentData.contentRequests || [],
          emotionalHighlights: sentimentData.emotionalHighlights || [],
          dataAvailable: true,
        };
      } else {
        signals.commentSentiment = { dataAvailable: false } as any;
      }
    } catch (error) {
      console.error('[Feedback Orchestrator] Error gathering comment sentiment:', error);
      signals.commentSentiment = { dataAvailable: false } as any;
    }

    try {
      const { creativeAnalyticsService } = await import('./creative-analytics-service');

      // Get winning patterns
      const patterns = creativeAnalyticsService.getWinningFormulas?.() || null;

      if (patterns) {
        signals.creativeAnalytics = {
          winningThumbnailVariants: (patterns.thumbnail || []) as any,
          titlePatterns: patterns.title || [],
          hookPatterns: patterns.hook || [],
          dataAvailable: true,
        };
      } else {
        signals.creativeAnalytics = { dataAvailable: false } as any;
      }
    } catch (error) {
      console.error('[Feedback Orchestrator] Error gathering creative analytics:', error);
      signals.creativeAnalytics = { dataAvailable: false } as any;
    }

    try {
      const { featureCorrelationAnalyzer } = await import('./feature-correlation-analyzer');

      // Get latest directive
      const directive = featureCorrelationAnalyzer.getLatestDirective?.() || null;

      if (directive) {
        signals.featureCorrelation = {
          bpmRecommendation: (directive as any).bpmRecommendation,
          energyRecommendation: (directive as any).energyRecommendation,
          directive: directive.directive || '',
          actionItems: directive.actionItems || [],
          dataAvailable: true,
        };
      } else {
        signals.featureCorrelation = { dataAvailable: false } as any;
      }
    } catch (error) {
      console.error('[Feedback Orchestrator] Error gathering feature correlation:', error);
      signals.featureCorrelation = { dataAvailable: false } as any;
    }

    try {
      const { styleBanditService } = await import('./style-bandit-service');

      // Get top performing styles
      const styles = (styleBanditService as any).getTopPerformingStyles?.(3) || [];

      signals.styleBandit = {
        topPerformingStyles: styles,
        dataAvailable: styles.length > 0,
      };
    } catch (error) {
      console.error('[Feedback Orchestrator] Error gathering style bandit:', error);
      signals.styleBandit = { dataAvailable: false } as any;
    }

    return signals;
  }

  /**
   * Apply comment sentiment signals to character priorities
   */
  private async applyCommentSentimentSignals(signals: NonNullable<LearningSignals['commentSentiment']>) {
    const changes: AppliedChanges['commentSentiment'] = {
      characterPriorityUpdates: [],
      requestsActedOn: [],
    };

    // Get current character priorities
    const config = await this.getConfig('characterPriorities');
    const priorities: Record<string, number> = (config?.value as any)?.characterPriorities || {};

    // Update priorities based on sentiment (>0.6 sentiment, >10 mentions)
    for (const char of signals.topCharacters) {
      if (char.sentiment > 0.6 && char.mentions > 10) {
        const oldPriority = priorities[char.character] || 1.0;
        const newPriority = Math.min(oldPriority * 1.2, 2.0); // Max 2x boost

        if (newPriority !== oldPriority) {
          priorities[char.character] = newPriority;
          changes.characterPriorityUpdates!.push({
            character: char.character,
            oldPriority,
            newPriority,
          });
        }
      }
    }

    // Save updated priorities
    await this.setConfig('characterPriorities', { characterPriorities: priorities }, 'feedback-orchestrator');

    // Track content requests (for Content Strategy Agent to act on)
    if (signals.contentRequests.length > 0) {
      changes.requestsActedOn = signals.contentRequests.slice(0, 5); // Top 5
    }

    return changes;
  }

  /**
   * Apply creative analytics signals to thumbnail weights
   */
  private async applyCreativeAnalyticsSignals(signals: NonNullable<LearningSignals['creativeAnalytics']>) {
    const changes: AppliedChanges['creativeAnalytics'] = {
      thumbnailWeightUpdates: [],
      titlePatternUpdates: [],
      hookOptimizations: [],
    };

    // Get current thumbnail weights
    const config = await this.getConfig('thumbnailWeights');
    const weights: Record<string, number> = (config?.value as any)?.thumbnailWeights || {
      vs_battle: 0.25,
      portrait_dramatic: 0.25,
      action_scene: 0.2,
      text_heavy: 0.15,
      minimal_clean: 0.15,
    };

    // Update weights based on CTR performance
    for (const variant of signals.winningThumbnailVariants) {
      if (variant.ctr > 0.04) {
        // Above 4% CTR
        const oldWeight = weights[variant.variant] || 0.2;
        const newWeight = Math.min(oldWeight * 1.15, 0.4); // Max 40% weight

        if (newWeight !== oldWeight) {
          weights[variant.variant] = newWeight;
          changes.thumbnailWeightUpdates!.push({
            variant: variant.variant,
            oldWeight,
            newWeight,
          });
        }
      }
    }

    // Normalize weights to sum to 1.0
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    for (const key in weights) {
      weights[key] = weights[key] / totalWeight;
    }

    await this.setConfig('thumbnailWeights', { thumbnailWeights: weights }, 'feedback-orchestrator');

    // Track winning patterns
    changes.titlePatternUpdates = signals.titlePatterns.slice(0, 3);
    changes.hookOptimizations = signals.hookPatterns.slice(0, 3);

    return changes;
  }

  /**
   * Apply feature correlation signals to Suno music generation
   */
  private async applyFeatureCorrelationSignals(signals: NonNullable<LearningSignals['featureCorrelation']>) {
    const changes: AppliedChanges['featureCorrelation'] = {};

    // Only apply if correlation is strong (>0.5)
    const minCorrelation = 0.5;

    if (signals.bpmRecommendation && signals.bpmRecommendation.correlation > minCorrelation) {
      changes.bpmDirective = signals.bpmRecommendation;
    }

    if (signals.energyRecommendation && signals.energyRecommendation.correlation > minCorrelation) {
      changes.energyDirective = signals.energyRecommendation;
    }

    // Save directives for Suno to read
    if (changes.bpmDirective || changes.energyDirective) {
      await this.setConfig(
        'sunoDirectives',
        {
          targetBPM: changes.bpmDirective?.target,
          targetEnergy: changes.energyDirective?.target,
          bpmCorrelation: changes.bpmDirective?.correlation,
          energyCorrelation: changes.energyDirective?.correlation,
        } as any,
        'feedback-orchestrator',
      );

      changes.appliedToSuno = true;
    }

    return changes;
  }

  /**
   * Apply style bandit signals to visual style preferences
   */
  private async applyStyleBanditSignals(signals: NonNullable<LearningSignals['styleBandit']>) {
    const changes: AppliedChanges['styleBandit'] = {
      styleWeightUpdates: [],
    };

    // Get current style weights
    const config = await this.getConfig('styleWeights');
    const weights: Record<string, number> = (config?.value as any)?.styleWeights || {};

    // Boost top performing styles
    for (const style of signals.topPerformingStyles) {
      const oldWeight = weights[style.style] || 1.0;
      const newWeight = Math.min(oldWeight * 1.1, 1.5); // Max 1.5x weight

      if (newWeight !== oldWeight) {
        weights[style.style] = newWeight;
        changes.styleWeightUpdates!.push({
          style: style.style,
          oldWeight,
          newWeight,
        });
      }
    }

    await this.setConfig('styleWeights', { styleWeights: weights }, 'feedback-orchestrator');

    return changes;
  }

  /**
   * Resolve conflicts when multiple signals disagree
   */
  private async resolveConflicts(changes: AppliedChanges): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];

    // Example: If both comment sentiment and trends suggest different characters
    // Resolution: Prioritize comment sentiment (direct audience feedback)

    // For now, we use a simple priority system:
    // 1. Comment Sentiment (direct user feedback)
    // 2. Creative Analytics (proven performance)
    // 3. Feature Correlation (audio optimization)
    // 4. Style Bandit (visual preferences)

    // Future: Could use consensus-engine for conflict resolution

    return conflicts;
  }

  /**
   * Generate human-readable reasoning for the orchestration cycle
   */
  private generateReasoning(signals: LearningSignals, changes: AppliedChanges, conflicts: Conflict[]): string {
    const parts: string[] = [];

    if (changes.commentSentiment?.characterPriorityUpdates?.length) {
      parts.push(
        `Updated ${changes.commentSentiment.characterPriorityUpdates.length} character priorities based on sentiment`,
      );
    }

    if (changes.creativeAnalytics?.thumbnailWeightUpdates?.length) {
      parts.push(
        `Adjusted ${changes.creativeAnalytics.thumbnailWeightUpdates.length} thumbnail variant weights based on CTR`,
      );
    }

    if (changes.featureCorrelation?.appliedToSuno) {
      parts.push(
        `Applied audio directives to Suno: BPM ${changes.featureCorrelation.bpmDirective?.target}, Energy ${changes.featureCorrelation.energyDirective?.target}`,
      );
    }

    if (changes.styleBandit?.styleWeightUpdates?.length) {
      parts.push(`Updated ${changes.styleBandit.styleWeightUpdates.length} style weights based on performance`);
    }

    if (conflicts.length > 0) {
      parts.push(`Resolved ${conflicts.length} conflicts`);
    }

    if (parts.length === 0) {
      return 'No changes applied - insufficient data or no significant patterns detected';
    }

    return parts.join('. ') + '.';
  }

  /**
   * Generate short summary for logging
   */
  private generateSummary(changes: AppliedChanges, conflicts: Conflict[]): string {
    const changeCount = [
      changes.commentSentiment?.characterPriorityUpdates?.length || 0,
      changes.creativeAnalytics?.thumbnailWeightUpdates?.length || 0,
      changes.featureCorrelation?.appliedToSuno ? 1 : 0,
      changes.styleBandit?.styleWeightUpdates?.length || 0,
    ].reduce((sum, count) => sum + count, 0);

    return `Applied ${changeCount} changes, ${conflicts.length} conflicts`;
  }

  /**
   * Get configuration value
   */
  private async getConfig(key: string) {
    const result = await db.select().from(systemConfiguration).where(eq(systemConfiguration.key, key)).limit(1);

    return result[0] || null;
  }

  /**
   * Set configuration value
   */
  private async setConfig(key: string, value: ConfigValue, updatedBy: string) {
    await db
      .insert(systemConfiguration)
      .values({
        key,
        value,
        updatedBy,
      })
      .onConflictDoUpdate({
        target: systemConfiguration.key,
        set: {
          value,
          updatedBy,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Initialize default configuration values
   */
  private async initializeDefaultConfig() {
    const defaults: Array<{ key: string; value: ConfigValue; description: string }> = [
      {
        key: 'orchestrator',
        value: {
          orchestrator: {
            enabled: true,
            runInterval: 3600,
            minConfidence: 0.6,
          },
        },
        description: 'Feedback Loop Orchestrator configuration',
      },
      {
        key: 'characterPriorities',
        value: {
          characterPriorities: {},
        },
        description: 'Character selection priorities based on sentiment',
      },
      {
        key: 'thumbnailWeights',
        value: {
          thumbnailWeights: {
            vs_battle: 0.25,
            portrait_dramatic: 0.25,
            action_scene: 0.2,
            text_heavy: 0.15,
            minimal_clean: 0.15,
          },
        },
        description: 'Thumbnail variant selection weights',
      },
      {
        key: 'sunoDirectives',
        value: {
          sunoDirectives: {},
        },
        description: 'Music generation directives from feature correlation',
      },
      {
        key: 'styleWeights',
        value: {
          styleWeights: {},
        },
        description: 'Visual style weights from bandit performance',
      },
    ];

    // Only initialize if they don't exist
    for (const def of defaults) {
      const existing = await this.getConfig(def.key);
      if (!existing) {
        await this.setConfig(def.key, def.value, 'system-init');
      }
    }
  }

  /**
   * Get orchestrator status
   */
  async getStatus() {
    const config = await this.getConfig('orchestrator');
    const enabled = (config?.value as any)?.orchestrator?.enabled ?? true;

    // Get last 5 reports
    const recentReports = await db
      .select()
      .from(orchestrationReports)
      .orderBy(desc(orchestrationReports.timestamp))
      .limit(5);

    return {
      enabled,
      isRunning: this.isRunning,
      lastRun: this.lastRunTimestamp,
      recentReports: recentReports.map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        status: r.status,
        executionTimeMs: r.executionTimeMs,
        summary: r.reasoning,
      })),
    };
  }

  /**
   * Get recent orchestration reports
   */
  async getReports(limit: number = 10) {
    return await db.select().from(orchestrationReports).orderBy(desc(orchestrationReports.timestamp)).limit(limit);
  }

  /**
   * Enable/disable orchestrator
   */
  async setEnabled(enabled: boolean) {
    const config = await this.getConfig('orchestrator');
    const currentValue = (config?.value as any) || {};

    await this.setConfig(
      'orchestrator',
      {
        orchestrator: {
          ...currentValue.orchestrator,
          enabled,
        },
      },
      'manual-override',
    );
  }
}

// Export singleton instance
export const feedbackLoopOrchestrator = new FeedbackLoopOrchestratorAgent();
