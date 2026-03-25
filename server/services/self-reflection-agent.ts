/**
 * SELF-REFLECTION LOOP SERVICE
 *
 * Analyzes WHY failures happened and adjusts strategy autonomously.
 * Uses GPT-4o to identify root causes and propose adjustments.
 * Tracks adjustment success rates and prunes ineffective strategies.
 *
 * Key Features:
 * - Root cause analysis using AI
 * - Automatic strategy adjustment proposals
 * - Success tracking with exponential decay
 * - Integration with job pipeline
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { strategyAdjustments, unityContentPackages, jobs } from '@shared/schema';
import { eq, and, desc, gte, lt } from 'drizzle-orm';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

// ============================================================================
// INTERFACES
// ============================================================================

export type FailureType = 'visual_quality' | 'narrative_coherence' | 'historical_accuracy' | 'retention' | 'engagement';
export type Severity = 'critical' | 'major' | 'minor';
export type AdjustmentType =
  | 'prompt_modification'
  | 'style_change'
  | 'timing_shift'
  | 'model_preference'
  | 'workflow_change';

export interface FailureAnalysis {
  jobId: string;
  packageId: string;
  failureType: FailureType;
  rootCause: string;
  contributingFactors: string[];
  affectedClips: number[];
  severity: Severity;
}

export interface StrategyAdjustment {
  id: string;
  source: FailureAnalysis;
  adjustment: {
    type: AdjustmentType;
    description: string;
    parameters: Record<string, any>;
  };
  confidence: number;
  appliedCount: number;
  successRate: number;
  createdAt: Date;
}

export interface ClipReport {
  clipIndex: number;
  passed: boolean;
  confidence: number;
  issues: Array<{
    type: string;
    severity: 'critical' | 'major' | 'minor';
    description: string;
  }>;
  detectedEntities?: string[];
  historicalAccuracy?: number;
}

export interface NarrativeQuality {
  ncScore: number;
  sfScore: number;
  combinedScore: number;
  tier: 'excellent' | 'good' | 'fair' | 'poor';
  passesQualityGate: boolean;
  issues?: Array<{
    component: string;
    description: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
}

export interface YouTubeMetrics {
  videoId: string;
  views: number;
  ctr?: number;
  avgViewDuration?: number;
  retentionRate?: number;
  likes?: number;
  comments?: number;
}

export interface PackageContext {
  packageId: string;
  topic?: string;
  era?: string;
  style?: string;
  characterTypes?: string[];
  contentType?: string;
}

export interface AppliedAdjustment {
  adjustmentId: string;
  type: AdjustmentType;
  description: string;
  parameters: Record<string, any>;
}

export interface ModifiedContext extends PackageContext {
  appliedAdjustments: AppliedAdjustment[];
  modifiedParameters: Record<string, any>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const MIN_APPLICATIONS_FOR_PRUNING = 10;
const MIN_SUCCESS_RATE_FOR_ACTIVE = 0.2;
const EXPONENTIAL_DECAY_FACTOR = 0.9;
const HIGH_CONFIDENCE_THRESHOLD = 70;
const QUALITY_GATE_THRESHOLD = 60;

// ============================================================================
// SELF-REFLECTION AGENT CLASS
// ============================================================================

class SelfReflectionAgent {
  /**
   * Analyze failure from a completed job
   * Uses GPT-4o to identify root causes and patterns
   */
  async analyzeFailure(
    jobId: string,
    clipReports: ClipReport[],
    narrativeQuality: NarrativeQuality,
    youtubeMetrics?: YouTubeMetrics,
  ): Promise<FailureAnalysis | null> {
    console.log(`🔍 Self-reflection analyzing job: ${jobId}`);

    try {
      const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (job.length === 0) {
        console.warn(`⚠️ Job ${jobId} not found`);
        return null;
      }

      const jobData = job[0];
      const packageId = jobData.unityMetadata?.packageId || jobId;

      const failedClips = clipReports.filter((r) => !r.passed);
      const criticalIssues = clipReports.flatMap((r) => r.issues.filter((i) => i.severity === 'critical'));

      const failureType = this.determineFailureType(clipReports, narrativeQuality, youtubeMetrics);

      if (!failureType) {
        console.log(`✅ No significant failures detected for job ${jobId}`);
        return null;
      }

      const analysisPrompt = this.buildAnalysisPrompt(
        jobData,
        clipReports,
        narrativeQuality,
        youtubeMetrics,
        failureType,
      );

      const sysPrompt = `You are an AI video production analyst specializing in identifying root causes of quality failures.
Analyze the provided data and identify the most likely root cause and contributing factors.
Focus on actionable insights that can improve future video generation.

Respond in JSON format:
{
  "rootCause": "Main reason for the failure (1-2 sentences)",
  "contributingFactors": ["Factor 1", "Factor 2", ...],
  "severity": "critical" | "major" | "minor",
  "affectedClipIndices": [0, 3, 5],
  "recommendations": ["Recommendation 1", ...]
}`;

      const geminiModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 1000, responseMimeType: 'application/json' },
        systemInstruction: sysPrompt,
      });
      const geminiResult = await geminiModel.generateContent(analysisPrompt);
      const content = geminiResult.response.text() || '{}';
      const analysis = JSON.parse(content);

      const failureAnalysis: FailureAnalysis = {
        jobId,
        packageId,
        failureType,
        rootCause: analysis.rootCause || 'Unknown root cause',
        contributingFactors: analysis.contributingFactors || [],
        affectedClips: analysis.affectedClipIndices || failedClips.map((c) => c.clipIndex),
        severity: analysis.severity || 'major',
      };

      console.log(`📊 Failure analysis complete:`, {
        type: failureAnalysis.failureType,
        severity: failureAnalysis.severity,
        rootCause: failureAnalysis.rootCause.substring(0, 100),
      });

      return failureAnalysis;
    } catch (error: any) {
      console.error(`❌ Failure analysis error:`, error.message);
      return null;
    }
  }

  /**
   * Propose a strategy adjustment based on failure analysis
   */
  async proposeStrategyAdjustment(analysis: FailureAnalysis): Promise<StrategyAdjustment | null> {
    console.log(`💡 Proposing strategy adjustment for ${analysis.failureType} failure`);

    try {
      const adjustmentType = this.determineAdjustmentType(analysis.failureType);

      const proposalPrompt = this.buildProposalPrompt(analysis);

      const proposalSysPrompt = `You are an AI video production optimizer. Based on the failure analysis, propose a specific adjustment to prevent similar failures.

Adjustment types:
- prompt_modification: Changes to VEO/Kling prompt templates
- style_change: Modifications to visual style, camera directions
- timing_shift: Changes to clip duration, pacing, hook timing
- model_preference: Switching between VEO/Kling, quality settings
- workflow_change: Process modifications, retry strategies

Respond in JSON format:
{
  "description": "Clear description of the adjustment",
  "parameters": {
    "key1": "value1",
    "key2": "value2"
  },
  "confidence": 75,
  "rationale": "Why this adjustment should help"
}`;

      const proposalModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.5, maxOutputTokens: 800, responseMimeType: 'application/json' },
        systemInstruction: proposalSysPrompt,
      });
      const proposalResult = await proposalModel.generateContent(proposalPrompt);
      const content = proposalResult.response.text() || '{}';
      const proposal = JSON.parse(content);

      const adjustmentId = `adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const adjustment: StrategyAdjustment = {
        id: adjustmentId,
        source: analysis,
        adjustment: {
          type: adjustmentType,
          description: proposal.description || 'Unspecified adjustment',
          parameters: proposal.parameters || {},
        },
        confidence: Math.min(100, Math.max(0, proposal.confidence || 50)),
        appliedCount: 0,
        successRate: 0,
        createdAt: new Date(),
      };

      await this.saveAdjustment(adjustment);

      console.log(`✅ Strategy adjustment proposed:`, {
        id: adjustment.id,
        type: adjustment.adjustment.type,
        confidence: adjustment.confidence,
      });

      return adjustment;
    } catch (error: any) {
      console.error(`❌ Strategy proposal error:`, error.message);
      return null;
    }
  }

  /**
   * Apply learned adjustments to a package context before job starts
   */
  async applyLearnedAdjustments(packageContext: PackageContext): Promise<ModifiedContext> {
    console.log(`🎓 Applying learned adjustments for package: ${packageContext.packageId}`);

    const modifiedContext: ModifiedContext = {
      ...packageContext,
      appliedAdjustments: [],
      modifiedParameters: {},
    };

    try {
      const relevantAdjustments = await db
        .select()
        .from(strategyAdjustments)
        .where(
          and(
            eq(strategyAdjustments.isActive, true),
            gte(strategyAdjustments.confidence, HIGH_CONFIDENCE_THRESHOLD),
            gte(strategyAdjustments.successRate, MIN_SUCCESS_RATE_FOR_ACTIVE),
          ),
        )
        .orderBy(desc(strategyAdjustments.successRate))
        .limit(10);

      if (relevantAdjustments.length === 0) {
        console.log(`   No high-confidence adjustments available`);
        return modifiedContext;
      }

      const filteredAdjustments = this.filterByContext(relevantAdjustments, packageContext);

      for (const adj of filteredAdjustments) {
        const params = (adj.adjustmentParams as Record<string, any>) || {};

        modifiedContext.appliedAdjustments.push({
          adjustmentId: adj.id,
          type: adj.adjustmentType as AdjustmentType,
          description: adj.rootCause || '',
          parameters: params,
        });

        Object.assign(modifiedContext.modifiedParameters, params);
      }

      console.log(`   Applied ${modifiedContext.appliedAdjustments.length} adjustments`);

      return modifiedContext;
    } catch (error: any) {
      console.error(`❌ Error applying adjustments:`, error.message);
      return modifiedContext;
    }
  }

  /**
   * Update adjustment success rate after job completion
   */
  async updateAdjustmentSuccess(adjustmentId: string, wasSuccessful: boolean): Promise<void> {
    console.log(`📈 Updating adjustment ${adjustmentId}: ${wasSuccessful ? 'success' : 'failure'}`);

    try {
      const existing = await db
        .select()
        .from(strategyAdjustments)
        .where(eq(strategyAdjustments.id, adjustmentId))
        .limit(1);

      if (existing.length === 0) {
        console.warn(`⚠️ Adjustment ${adjustmentId} not found`);
        return;
      }

      const adj = existing[0];
      const newAppliedCount = adj.appliedCount + 1;
      const newSuccessCount = adj.successCount + (wasSuccessful ? 1 : 0);

      const decayedSuccessRate =
        adj.successRate * EXPONENTIAL_DECAY_FACTOR + (wasSuccessful ? 1 : 0) * (1 - EXPONENTIAL_DECAY_FACTOR);

      const newSuccessRate = Math.min(1, Math.max(0, decayedSuccessRate));

      const shouldPrune =
        newAppliedCount >= MIN_APPLICATIONS_FOR_PRUNING && newSuccessRate < MIN_SUCCESS_RATE_FOR_ACTIVE;

      await db
        .update(strategyAdjustments)
        .set({
          appliedCount: newAppliedCount,
          successCount: newSuccessCount,
          successRate: newSuccessRate,
          isActive: !shouldPrune,
          updatedAt: new Date(),
        })
        .where(eq(strategyAdjustments.id, adjustmentId));

      if (shouldPrune) {
        console.log(`🗑️ Pruned adjustment ${adjustmentId} (success rate: ${(newSuccessRate * 100).toFixed(1)}%)`);
      } else {
        console.log(
          `✅ Updated adjustment ${adjustmentId}: rate=${(newSuccessRate * 100).toFixed(1)}%, count=${newAppliedCount}`,
        );
      }
    } catch (error: any) {
      console.error(`❌ Error updating adjustment:`, error.message);
    }
  }

  /**
   * Get all active adjustments for a specific failure type
   */
  async getActiveAdjustmentsForType(failureType: FailureType): Promise<StrategyAdjustment[]> {
    try {
      const adjustments = await db
        .select()
        .from(strategyAdjustments)
        .where(and(eq(strategyAdjustments.failureType, failureType), eq(strategyAdjustments.isActive, true)))
        .orderBy(desc(strategyAdjustments.successRate));

      return adjustments.map((adj) => this.dbRecordToAdjustment(adj));
    } catch (error: any) {
      console.error(`❌ Error fetching adjustments:`, error.message);
      return [];
    }
  }

  /**
   * Get summary statistics for all adjustments
   */
  async getAdjustmentStats(): Promise<{
    totalAdjustments: number;
    activeAdjustments: number;
    avgSuccessRate: number;
    byType: Record<string, number>;
  }> {
    try {
      const all = await db.select().from(strategyAdjustments);

      const active = all.filter((a) => a.isActive);
      const avgSuccessRate = active.length > 0 ? active.reduce((sum, a) => sum + a.successRate, 0) / active.length : 0;

      const byType: Record<string, number> = {};
      for (const adj of all) {
        byType[adj.adjustmentType] = (byType[adj.adjustmentType] || 0) + 1;
      }

      return {
        totalAdjustments: all.length,
        activeAdjustments: active.length,
        avgSuccessRate,
        byType,
      };
    } catch (error: any) {
      console.error(`❌ Error getting stats:`, error.message);
      return {
        totalAdjustments: 0,
        activeAdjustments: 0,
        avgSuccessRate: 0,
        byType: {},
      };
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private determineFailureType(
    clipReports: ClipReport[],
    narrativeQuality: NarrativeQuality,
    youtubeMetrics?: YouTubeMetrics,
  ): FailureType | null {
    const criticalVisualIssues = clipReports.flatMap((r) =>
      r.issues.filter(
        (i) => i.severity === 'critical' && ['face_distortion', 'limb_morphing', 'visual_glitch'].includes(i.type),
      ),
    );
    if (criticalVisualIssues.length >= 2) {
      return 'visual_quality';
    }

    if (narrativeQuality.ncScore < QUALITY_GATE_THRESHOLD) {
      return 'narrative_coherence';
    }

    const anachronisms = clipReports.flatMap((r) => r.issues.filter((i) => i.type === 'anachronism'));
    if (anachronisms.length >= 2 || clipReports.some((r) => (r.historicalAccuracy || 100) < 60)) {
      return 'historical_accuracy';
    }

    if (youtubeMetrics) {
      if (youtubeMetrics.retentionRate && youtubeMetrics.retentionRate < 30) {
        return 'retention';
      }
      if (youtubeMetrics.ctr && youtubeMetrics.ctr < 2) {
        return 'engagement';
      }
    }

    return null;
  }

  private determineAdjustmentType(failureType: FailureType): AdjustmentType {
    const typeMap: Record<FailureType, AdjustmentType> = {
      visual_quality: 'prompt_modification',
      narrative_coherence: 'workflow_change',
      historical_accuracy: 'style_change',
      retention: 'timing_shift',
      engagement: 'timing_shift',
    };
    return typeMap[failureType] || 'prompt_modification';
  }

  private buildAnalysisPrompt(
    job: any,
    clipReports: ClipReport[],
    narrativeQuality: NarrativeQuality,
    youtubeMetrics: YouTubeMetrics | undefined,
    failureType: FailureType,
  ): string {
    const failedClips = clipReports.filter((r) => !r.passed);
    const allIssues = clipReports.flatMap((r) => r.issues);

    return `Analyze this video generation failure:

FAILURE TYPE: ${failureType}

JOB CONTEXT:
- Job ID: ${job.id}
- Mode: ${job.mode}
- Script: ${job.scriptName}

CLIP REPORTS (${clipReports.length} clips):
- Failed clips: ${failedClips.length}
- Total issues: ${allIssues.length}
- Critical issues: ${allIssues.filter((i) => i.severity === 'critical').length}
- Issue types: ${[...new Set(allIssues.map((i) => i.type))].join(', ')}

NARRATIVE QUALITY:
- NC Score: ${narrativeQuality.ncScore}/100
- SF Score: ${narrativeQuality.sfScore}/100
- Tier: ${narrativeQuality.tier}
- Passes Gate: ${narrativeQuality.passesQualityGate}

${
  youtubeMetrics
    ? `YOUTUBE METRICS:
- Views: ${youtubeMetrics.views}
- CTR: ${youtubeMetrics.ctr || 'N/A'}%
- Retention: ${youtubeMetrics.retentionRate || 'N/A'}%
- Avg View Duration: ${youtubeMetrics.avgViewDuration || 'N/A'}s`
    : 'YOUTUBE METRICS: Not available'
}

DETAILED ISSUES:
${allIssues
  .slice(0, 10)
  .map((i) => `- [${i.severity}] ${i.type}: ${i.description}`)
  .join('\n')}

Identify the root cause and contributing factors for this ${failureType} failure.`;
  }

  private buildProposalPrompt(analysis: FailureAnalysis): string {
    const adjustmentGuidelines: Record<FailureType, string> = {
      visual_quality: `For visual quality failures:
- Modify prompt templates to be more specific about anatomy
- Add "anatomically correct, no distortion" to prompts
- Adjust camera directions to avoid problematic angles
- Consider shorter clip durations for complex scenes`,

      narrative_coherence: `For narrative coherence failures:
- Enhance TNA breakdown with clearer dependencies
- Add transition prompts between major scenes
- Include continuity markers in prompts
- Reduce emotional arc complexity`,

      historical_accuracy: `For historical accuracy failures:
- Add stricter era constraints to prompts (specific years, not just era)
- Include "no anachronistic elements" in system prompts
- Reference specific period-accurate details
- Add validation checkpoints for costume/architecture`,

      retention: `For retention failures:
- Adjust hook timing (stronger visual in first 3 seconds)
- Increase pacing in first 15 seconds
- Add more visual variety early in video
- Consider shorter overall duration`,

      engagement: `For engagement failures:
- Optimize thumbnail frame selection
- Enhance title hook alignment
- Add more dramatic visual moments
- Consider trending visual styles`,
    };

    return `Based on this failure analysis, propose a specific strategy adjustment:

FAILURE ANALYSIS:
- Type: ${analysis.failureType}
- Severity: ${analysis.severity}
- Root Cause: ${analysis.rootCause}
- Contributing Factors: ${analysis.contributingFactors.join(', ')}
- Affected Clips: ${analysis.affectedClips.join(', ')}

ADJUSTMENT GUIDELINES:
${adjustmentGuidelines[analysis.failureType]}

Propose a specific, actionable adjustment with clear parameters that can be automatically applied to future jobs.`;
  }

  private filterByContext(adjustments: any[], context: PackageContext): any[] {
    return adjustments
      .filter((adj) => {
        const params = (adj.adjustmentParams as Record<string, any>) || {};

        if (params.era && context.era && !context.era.includes(params.era)) {
          return false;
        }

        if (params.contentType && context.contentType && params.contentType !== context.contentType) {
          return false;
        }

        return true;
      })
      .slice(0, 5);
  }

  private async saveAdjustment(adjustment: StrategyAdjustment): Promise<void> {
    await db.insert(strategyAdjustments).values({
      id: adjustment.id,
      failureType: adjustment.source.failureType,
      rootCause: adjustment.source.rootCause,
      adjustmentType: adjustment.adjustment.type,
      adjustmentParams: adjustment.adjustment.parameters,
      adjustmentDescription: adjustment.adjustment.description,
      appliedCount: adjustment.appliedCount,
      successCount: 0,
      successRate: adjustment.successRate,
      confidence: adjustment.confidence,
      isActive: true,
      sourceJobId: adjustment.source.jobId,
      sourcePackageId: adjustment.source.packageId,
      affectedClips: adjustment.source.affectedClips,
      contributingFactors: adjustment.source.contributingFactors,
      severity: adjustment.source.severity,
      createdAt: adjustment.createdAt,
      updatedAt: adjustment.createdAt,
    });
  }

  private dbRecordToAdjustment(record: any): StrategyAdjustment {
    return {
      id: record.id,
      source: {
        jobId: record.sourceJobId || '',
        packageId: record.sourcePackageId || '',
        failureType: record.failureType as FailureType,
        rootCause: record.rootCause || '',
        contributingFactors: record.contributingFactors || [],
        affectedClips: record.affectedClips || [],
        severity: (record.severity as Severity) || 'major',
      },
      adjustment: {
        type: record.adjustmentType as AdjustmentType,
        description: record.adjustmentDescription || '',
        parameters: record.adjustmentParams || {},
      },
      confidence: record.confidence,
      appliedCount: record.appliedCount,
      successRate: record.successRate,
      createdAt: record.createdAt,
    };
  }
}

// Export singleton instance
export const selfReflectionAgent = new SelfReflectionAgent();
