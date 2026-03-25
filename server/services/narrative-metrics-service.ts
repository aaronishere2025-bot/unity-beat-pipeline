/**
 * NARRATIVE METRICS SERVICE
 *
 * Formalizes NC (Narrative Coherence) and SF (Script Faithfulness) scoring
 * for quality gate evaluation of generated video content.
 *
 * Metrics:
 * - NC (Narrative Coherence): Measures internal consistency of the video narrative
 * - SF (Script Faithfulness): Measures how well the video follows the original script
 * - Combined Quality: Weighted combination for tier assignment
 */

import { db } from '../db';
import {
  narrativeTnaBreakdowns,
  clipAccuracyReports,
  narrativeQualityResults,
  unityContentPackages,
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  narrativeDtgService,
  type NarrativeGraph,
  type TNA,
  type ClipAccuracyReport as DTGClipAccuracyReport,
  type ConsistencyViolation,
} from './narrative-dtg-service';
import {
  narrativeTnaService,
  type TemporalNarrativeAtom,
  type CoverageScore,
  type CoherenceScore,
} from './narrative-tna-service';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type QualityTier = 'excellent' | 'good' | 'fair' | 'poor';

export interface NCComponents {
  entityConsistency: number; // 0-100: From DTG consistency check (40%)
  temporalFlow: number; // 0-100: From TNA dependency validation (25%)
  emotionalArc: number; // 0-100: From TNA emotional progression (20%)
  transitionQuality: number; // 0-100: From clip accuracy continuity scores (15%)
}

export interface NarrativeCoherence {
  score: number; // 0-100 weighted score
  components: NCComponents;
  violations: ConsistencyViolation[];
  issues: Array<{
    component: keyof NCComponents;
    description: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
}

export interface SFComponents {
  coverageRate: number; // 0-100: % of TNA requiredElements that appear (50%)
  accuracyRate: number; // 0-100: % of visual elements matching historical era (30%)
  integrityScore: number; // 0-100: Overall script intent preservation (20%)
}

export interface ScriptFaithfulness {
  score: number; // 0-100 weighted score
  components: SFComponents;
  uncoveredElements: string[];
  anachronisms: string[];
  issues: Array<{
    component: keyof SFComponents;
    description: string;
    severity: 'critical' | 'major' | 'minor';
  }>;
}

export interface NarrativeQuality {
  nc: NarrativeCoherence;
  sf: ScriptFaithfulness;
  combined: number; // 0-100: 60% NC + 40% SF
  tier: QualityTier;
  passesQualityGate: boolean;
  evaluatedAt: Date;
  summary: string;
}

export interface GeneratedPrompt {
  clipIndex: number;
  prompt: string;
  energy?: string;
  camera?: string;
  lyricSnippet?: string;
  section?: string;
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

// ============================================================================
// CONSTANTS
// ============================================================================

const NC_WEIGHTS = {
  entityConsistency: 0.4,
  temporalFlow: 0.25,
  emotionalArc: 0.2,
  transitionQuality: 0.15,
} as const;

const SF_WEIGHTS = {
  coverageRate: 0.5,
  accuracyRate: 0.3,
  integrityScore: 0.2,
} as const;

const QUALITY_WEIGHTS = {
  nc: 0.6,
  sf: 0.4,
} as const;

const TIER_THRESHOLDS = {
  excellent: 85,
  good: 70,
  fair: 50,
  poor: 0,
} as const;

const QUALITY_GATE_THRESHOLD = 60;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function assignTier(score: number): QualityTier {
  if (score >= TIER_THRESHOLDS.excellent) return 'excellent';
  if (score >= TIER_THRESHOLDS.good) return 'good';
  if (score >= TIER_THRESHOLDS.fair) return 'fair';
  return 'poor';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mapClipReportToDTGFormat(report: ClipReport): DTGClipAccuracyReport {
  return {
    clipIndex: report.clipIndex,
    passed: report.passed,
    issues: report.issues,
    detectedEntities: report.detectedEntities,
  };
}

function convertTNAToLegacyFormat(tna: TemporalNarrativeAtom): TNA {
  return {
    clipIndex: tna.index,
    timestamp: `${tna.timeWindow.start}-${tna.timeWindow.end}`,
    lyricLine: tna.text,
    prompt: tna.narrativeObjective,
    entities: [
      ...tna.requiredElements.characters.map((name) => ({
        name,
        type: 'character' as const,
      })),
      ...tna.requiredElements.props.map((name) => ({
        name,
        type: 'prop' as const,
      })),
      ...tna.requiredElements.settings.map((name) => ({
        name,
        type: 'location' as const,
      })),
    ],
    sceneDescription: tna.narrativeObjective,
  };
}

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

class NarrativeMetricsService {
  /**
   * Calculate Narrative Coherence (NC) score
   * Measures internal consistency of the video narrative
   *
   * Components:
   * - entityConsistency (40%): From DTG consistency check
   * - temporalFlow (25%): From TNA dependency validation
   * - emotionalArc (20%): From TNA emotional progression
   * - transitionQuality (15%): From clip accuracy continuity scores
   */
  calculateNC(dtgGraph: NarrativeGraph, tnas: TemporalNarrativeAtom[], clipReports: ClipReport[]): NarrativeCoherence {
    const issues: NarrativeCoherence['issues'] = [];

    // 1. Entity Consistency (40%) - from DTG consistency check
    const violations = narrativeDtgService.checkConsistency(dtgGraph);
    const longRangeScore = narrativeDtgService.scoreLongRangeDependency(dtgGraph);

    let entityConsistency = 100;
    const criticalViolations = violations.filter((v) => v.severity === 'critical').length;
    const majorViolations = violations.filter((v) => v.severity === 'major').length;
    const minorViolations = violations.filter((v) => v.severity === 'minor').length;

    entityConsistency -= criticalViolations * 25;
    entityConsistency -= majorViolations * 10;
    entityConsistency -= minorViolations * 3;

    entityConsistency = clamp(entityConsistency * 0.6 + longRangeScore * 0.4, 0, 100);

    if (entityConsistency < 70) {
      issues.push({
        component: 'entityConsistency',
        description: `${violations.length} entity consistency violations detected`,
        severity: criticalViolations > 0 ? 'critical' : 'major',
      });
    }

    // 2. Temporal Flow (25%) - from TNA dependency validation
    const generatedClips = clipReports.map((r) => ({
      clipIndex: r.clipIndex,
      prompt: '',
      startTime: r.clipIndex * 5,
      endTime: (r.clipIndex + 1) * 5,
      detectedElements: {
        characters:
          r.detectedEntities?.filter(
            (e) => !e.toLowerCase().includes('setting') && !e.toLowerCase().includes('location'),
          ) || [],
        props: [],
        settings:
          r.detectedEntities?.filter(
            (e) => e.toLowerCase().includes('setting') || e.toLowerCase().includes('location'),
          ) || [],
      },
    }));

    const coherenceResult = narrativeTnaService.scoreUnitCoherence(generatedClips, tnas);
    const temporalFlow = coherenceResult.dependencyScore;

    const dependencyIssues = coherenceResult.issues.filter((i) => i.type === 'dependency_violation');
    if (dependencyIssues.length > 0) {
      issues.push({
        component: 'temporalFlow',
        description: `${dependencyIssues.length} temporal dependency violations`,
        severity: dependencyIssues.length >= 3 ? 'critical' : 'major',
      });
    }

    // 3. Emotional Arc (20%) - from TNA emotional progression
    const emotionalArc = coherenceResult.emotionalArcScore;

    const arcIssues = coherenceResult.issues.filter((i) => i.type === 'arc_disruption');
    if (arcIssues.length > 2) {
      issues.push({
        component: 'emotionalArc',
        description: `Emotional arc has ${arcIssues.length} disruptions`,
        severity: arcIssues.length >= 5 ? 'major' : 'minor',
      });
    }

    // 4. Transition Quality (15%) - from clip accuracy continuity scores
    const dtgClipReports = clipReports.map(mapClipReportToDTGFormat);
    const continuityErrors = narrativeDtgService.detectContinuityErrors(dtgGraph, dtgClipReports);

    let transitionQuality = 100;
    const visualMismatches = continuityErrors.filter((e) => e.errorType === 'visual_mismatch').length;
    const stateInconsistencies = continuityErrors.filter((e) => e.errorType === 'state_inconsistency').length;

    transitionQuality -= visualMismatches * 15;
    transitionQuality -= stateInconsistencies * 10;
    transitionQuality = clamp(transitionQuality, 0, 100);

    if (transitionQuality < 70) {
      issues.push({
        component: 'transitionQuality',
        description: `${continuityErrors.length} continuity errors between clips`,
        severity: visualMismatches > 0 ? 'major' : 'minor',
      });
    }

    // Calculate weighted NC score
    const components: NCComponents = {
      entityConsistency: Math.round(entityConsistency),
      temporalFlow: Math.round(temporalFlow),
      emotionalArc: Math.round(emotionalArc),
      transitionQuality: Math.round(transitionQuality),
    };

    const weightedScore =
      components.entityConsistency * NC_WEIGHTS.entityConsistency +
      components.temporalFlow * NC_WEIGHTS.temporalFlow +
      components.emotionalArc * NC_WEIGHTS.emotionalArc +
      components.transitionQuality * NC_WEIGHTS.transitionQuality;

    return {
      score: Math.round(weightedScore),
      components,
      violations,
      issues,
    };
  }

  /**
   * Calculate Script Faithfulness (SF) score
   * Measures how well the video follows the original script
   *
   * Components:
   * - coverageRate (50%): % of TNA requiredElements that appear
   * - accuracyRate (30%): % of visual elements matching historical era
   * - integrityScore (20%): Overall script intent preservation
   */
  calculateSF(
    tnas: TemporalNarrativeAtom[],
    generatedPrompts: GeneratedPrompt[],
    clipReports: ClipReport[],
  ): ScriptFaithfulness {
    const issues: ScriptFaithfulness['issues'] = [];
    const uncoveredElements: string[] = [];
    const anachronisms: string[] = [];

    // 1. Coverage Rate (50%) - % of TNA requiredElements that appear in prompts/clips
    const generatedClips = generatedPrompts.map((p) => ({
      clipIndex: p.clipIndex,
      prompt: p.prompt,
      startTime: p.clipIndex * 5,
      endTime: (p.clipIndex + 1) * 5,
      detectedElements: {
        characters: this.extractCharactersFromPrompt(p.prompt),
        props: this.extractPropsFromPrompt(p.prompt),
        settings: this.extractSettingsFromPrompt(p.prompt),
      },
    }));

    const coverageResult = narrativeTnaService.scoreUnitCoverage(generatedClips, tnas);
    const coverageRate = coverageResult.score;

    for (const detail of coverageResult.details) {
      if (!detail.covered) {
        uncoveredElements.push(...detail.missingElements);
      }
    }

    if (coverageRate < 70) {
      issues.push({
        component: 'coverageRate',
        description: `Only ${coverageRate}% of required narrative elements covered`,
        severity: coverageRate < 50 ? 'critical' : 'major',
      });
    }

    // 2. Accuracy Rate (30%) - % of visual elements matching historical era
    let accuracySum = 0;
    let accuracyCount = 0;

    for (const report of clipReports) {
      if (report.historicalAccuracy !== undefined) {
        accuracySum += report.historicalAccuracy;
        accuracyCount++;
      }

      const anachronismIssues = report.issues.filter(
        (i) =>
          i.type === 'anachronism' ||
          i.description.toLowerCase().includes('anachronism') ||
          i.description.toLowerCase().includes('modern'),
      );

      for (const issue of anachronismIssues) {
        anachronisms.push(`Clip ${report.clipIndex}: ${issue.description}`);
      }
    }

    const accuracyRate =
      accuracyCount > 0 ? accuracySum / accuracyCount : this.estimateAccuracyFromReports(clipReports);

    if (anachronisms.length > 0) {
      issues.push({
        component: 'accuracyRate',
        description: `${anachronisms.length} potential anachronisms detected`,
        severity: anachronisms.length >= 3 ? 'major' : 'minor',
      });
    }

    // 3. Integrity Score (20%) - Overall script intent preservation
    const integrityScore = this.calculateIntegrityScore(tnas, generatedPrompts, clipReports);

    if (integrityScore < 70) {
      issues.push({
        component: 'integrityScore',
        description: 'Script intent may not be fully preserved',
        severity: integrityScore < 50 ? 'major' : 'minor',
      });
    }

    // Calculate weighted SF score
    const components: SFComponents = {
      coverageRate: Math.round(coverageRate),
      accuracyRate: Math.round(accuracyRate),
      integrityScore: Math.round(integrityScore),
    };

    const weightedScore =
      components.coverageRate * SF_WEIGHTS.coverageRate +
      components.accuracyRate * SF_WEIGHTS.accuracyRate +
      components.integrityScore * SF_WEIGHTS.integrityScore;

    return {
      score: Math.round(weightedScore),
      components,
      uncoveredElements,
      anachronisms,
      issues,
    };
  }

  /**
   * Create a graceful fallback result when data isn't available
   */
  private createFallbackResult(reason: string): NarrativeQuality {
    const fallbackNC: NarrativeCoherence = {
      score: 0,
      components: {
        entityConsistency: 0,
        temporalFlow: 0,
        emotionalArc: 0,
        transitionQuality: 0,
      },
      violations: [],
      issues: [
        {
          component: 'entityConsistency',
          description: reason,
          severity: 'minor',
        },
      ],
    };

    const fallbackSF: ScriptFaithfulness = {
      score: 0,
      components: {
        coverageRate: 0,
        accuracyRate: 0,
        integrityScore: 0,
      },
      uncoveredElements: [],
      anachronisms: [],
      issues: [
        {
          component: 'coverageRate',
          description: reason,
          severity: 'minor',
        },
      ],
    };

    return {
      nc: fallbackNC,
      sf: fallbackSF,
      combined: 0,
      tier: 'poor' as QualityTier,
      passesQualityGate: false,
      evaluatedAt: new Date(),
      summary: `Evaluation incomplete: ${reason}`,
    };
  }

  /**
   * Evaluate overall narrative quality for a package
   * Loads TNAs, builds DTG, loads clip reports, calculates NC and SF
   * Stores results in database
   *
   * Returns graceful fallback when data isn't available yet
   */
  async evaluateNarrativeQuality(packageId: string): Promise<NarrativeQuality> {
    console.log(`📊 Evaluating narrative quality for package: ${packageId}`);

    try {
      // Guard: Validate packageId
      if (!packageId || typeof packageId !== 'string' || packageId.trim() === '') {
        console.warn(`⚠️ Invalid packageId provided for narrative quality evaluation`);
        return this.createFallbackResult('Invalid or missing packageId');
      }

      // 1. Load TNAs from database
      let tnaResult;
      try {
        tnaResult = await db
          .select()
          .from(narrativeTnaBreakdowns)
          .where(eq(narrativeTnaBreakdowns.packageId, packageId))
          .limit(1);
      } catch (dbError: any) {
        console.warn(`⚠️ Failed to load TNAs: ${dbError.message}`);
        return this.createFallbackResult('Database error loading TNA breakdowns');
      }

      const tnas: TemporalNarrativeAtom[] = (tnaResult[0]?.tnas as TemporalNarrativeAtom[]) || [];

      // Guard: Check if TNAs exist
      if (tnas.length === 0) {
        console.warn(`⚠️ No TNA breakdown found for package ${packageId} - cannot evaluate narrative quality`);
        return this.createFallbackResult('No TNA breakdown available for this package');
      }

      // 2. Load clip accuracy reports
      let clipReportResults;
      try {
        clipReportResults = await db
          .select()
          .from(clipAccuracyReports)
          .where(eq(clipAccuracyReports.packageId, packageId));
      } catch (dbError: any) {
        console.warn(`⚠️ Failed to load clip reports: ${dbError.message}`);
        return this.createFallbackResult('Database error loading clip accuracy reports');
      }

      const clipReports: ClipReport[] = (clipReportResults || []).map((r) => ({
        clipIndex: r?.clipIndex ?? 0,
        passed: r?.passed ?? false,
        confidence: (r as any)?.confidence ?? 0,
        issues: ((r as any)?.analysisResult as any)?.issues || [],
        detectedEntities: ((r as any)?.analysisResult as any)?.detectedEntities,
        historicalAccuracy: ((r as any)?.analysisResult as any)?.historicalAccuracy,
      }));

      // Guard: Check if clip reports exist
      if (clipReports.length === 0) {
        console.warn(
          `⚠️ No clip accuracy reports found for package ${packageId} - narrative evaluation requires clip validation`,
        );
        return this.createFallbackResult('No clip accuracy reports available yet - clips must be validated first');
      }

      // 3. Load generated prompts from package
      let packageResult;
      try {
        packageResult = await db
          .select()
          .from(unityContentPackages)
          .where(eq(unityContentPackages.id, packageId))
          .limit(1);
      } catch (dbError: any) {
        console.warn(`⚠️ Failed to load package: ${dbError.message}`);
        return this.createFallbackResult('Database error loading package data');
      }

      // Guard: Check if package exists
      if (!packageResult || packageResult.length === 0) {
        console.warn(`⚠️ Package ${packageId} not found`);
        return this.createFallbackResult('Package not found');
      }

      const packageData = packageResult[0]?.packageData;
      const generatedPrompts: GeneratedPrompt[] = ((packageData as any)?.veoPrompts || []).map((p: any) => ({
        clipIndex: (p?.clipNumber ?? 1) - 1,
        prompt: p?.prompt || '',
        lyricSnippet: p?.lyricSnippet,
        section: p?.section,
      }));

      // Guard: Check if prompts exist
      if (generatedPrompts.length === 0) {
        console.warn(`⚠️ No generated prompts found for package ${packageId}`);
        return this.createFallbackResult('No generated prompts available in package');
      }

      // 4. Build DTG graph from TNAs
      const legacyTNAs = tnas.map(convertTNAToLegacyFormat);
      const clipResults = clipReports.map((r) => ({
        clipIndex: r.clipIndex,
        success: r.passed,
        generatedEntities: r.detectedEntities,
      }));

      const dtgGraph = narrativeDtgService.buildGraph(legacyTNAs, clipResults);

      // 5. Calculate NC and SF
      const nc = this.calculateNC(dtgGraph, tnas, clipReports);
      const sf = this.calculateSF(tnas, generatedPrompts, clipReports);

      // 6. Calculate combined score (60% NC + 40% SF)
      const combined = Math.round(nc.score * QUALITY_WEIGHTS.nc + sf.score * QUALITY_WEIGHTS.sf);

      // 7. Assign tier
      const tier = assignTier(combined);

      // 8. Determine pass/fail
      const passesQualityGate = combined >= QUALITY_GATE_THRESHOLD;

      // 9. Generate summary
      const summary = this.generateSummary(nc, sf, combined, tier);

      const result: NarrativeQuality = {
        nc,
        sf,
        combined,
        tier,
        passesQualityGate,
        evaluatedAt: new Date(),
        summary,
      };

      // 10. Store results in database (non-blocking - don't fail if storage fails)
      try {
        await this.storeResults(packageId, result);
      } catch (storeError: any) {
        console.warn(`⚠️ Failed to store narrative quality results: ${storeError.message}`);
      }

      console.log(
        `✅ Narrative quality: ${tier.toUpperCase()} (${combined}/100) - ${passesQualityGate ? 'PASS' : 'FAIL'}`,
      );

      return result;
    } catch (error: any) {
      console.error(`❌ Narrative quality evaluation failed for package ${packageId}: ${error.message}`);
      return this.createFallbackResult(`Evaluation error: ${error.message}`);
    }
  }

  /**
   * Quality gate check - returns pass/fail with reason
   */
  async checkQualityGate(packageId: string): Promise<{
    passed: boolean;
    score: number;
    tier: QualityTier;
    reason: string;
    blockers: string[];
  }> {
    const quality = await this.evaluateNarrativeQuality(packageId);

    const blockers: string[] = [];

    if (quality.nc.score < 50) {
      blockers.push(`NC score (${quality.nc.score}) below minimum threshold`);
    }
    if (quality.sf.score < 50) {
      blockers.push(`SF score (${quality.sf.score}) below minimum threshold`);
    }

    const criticalIssues = [
      ...quality.nc.issues.filter((i) => i.severity === 'critical'),
      ...quality.sf.issues.filter((i) => i.severity === 'critical'),
    ];

    for (const issue of criticalIssues) {
      blockers.push(issue.description);
    }

    return {
      passed: quality.passesQualityGate && blockers.length === 0,
      score: quality.combined,
      tier: quality.tier,
      reason: quality.summary,
      blockers,
    };
  }

  /**
   * Get stored results for a package
   */
  async getStoredResults(packageId: string): Promise<NarrativeQuality | null> {
    try {
      const results = await db
        .select()
        .from(narrativeQualityResults)
        .where(eq(narrativeQualityResults.packageId, packageId))
        .limit(1);

      if (results.length === 0) return null;

      const row = results[0];
      return {
        nc: row.ncResult as NarrativeCoherence,
        sf: row.sfResult as ScriptFaithfulness,
        combined: row.combinedScore,
        tier: row.tier as QualityTier,
        passesQualityGate: row.passesQualityGate,
        evaluatedAt: row.evaluatedAt,
        summary: row.summary,
      };
    } catch (error: any) {
      console.error(`Failed to get stored results: ${error.message}`);
      return null;
    }
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private extractCharactersFromPrompt(prompt: string): string[] {
    const characters: string[] = [];
    const patterns = [
      /\b(king|queen|warrior|prince|princess|emperor|conqueror|ruler|general|khan|caesar)\b/gi,
      /\b([A-Z][a-z]+ the [A-Z][a-z]+)\b/g,
      /\b(man|woman|figure|hero|protagonist)\b/gi,
    ];

    for (const pattern of patterns) {
      const matches = prompt.matchAll(pattern);
      for (const match of matches) {
        if (match[1] || match[0]) {
          characters.push((match[1] || match[0]).toLowerCase());
        }
      }
    }

    return [...new Set(characters)];
  }

  private extractPropsFromPrompt(prompt: string): string[] {
    const props: string[] = [];
    const patterns = [
      /\b(sword|crown|armor|scroll|staff|banner|shield|helmet|throne|chariot|bow|spear)\b/gi,
      /\b(weapon|artifact|treasure|relic)\b/gi,
    ];

    for (const pattern of patterns) {
      const matches = prompt.matchAll(pattern);
      for (const match of matches) {
        props.push(match[0].toLowerCase());
      }
    }

    return [...new Set(props)];
  }

  private extractSettingsFromPrompt(prompt: string): string[] {
    const settings: string[] = [];
    const patterns = [
      /\b(palace|throne room|battlefield|steppe|desert|mountain|city|temple|fortress|camp|tent|river|sea)\b/gi,
      /\b(ancient|medieval|historical)\s+(\w+)\b/gi,
    ];

    for (const pattern of patterns) {
      const matches = prompt.matchAll(pattern);
      for (const match of matches) {
        settings.push(match[0].toLowerCase());
      }
    }

    return [...new Set(settings)];
  }

  private estimateAccuracyFromReports(clipReports: ClipReport[]): number {
    if (clipReports.length === 0) return 80;

    let score = 100;

    for (const report of clipReports) {
      const anachronisms = report.issues.filter(
        (i) =>
          i.type === 'anachronism' ||
          i.description.toLowerCase().includes('modern') ||
          i.description.toLowerCase().includes('anachronism'),
      );

      score -= anachronisms.length * 10;

      const visualGlitches = report.issues.filter((i) => i.type === 'visual_glitch' || i.type === 'text_artifact');

      score -= visualGlitches.length * 5;
    }

    return clamp(score, 0, 100);
  }

  private calculateIntegrityScore(
    tnas: TemporalNarrativeAtom[],
    prompts: GeneratedPrompt[],
    reports: ClipReport[],
  ): number {
    if (tnas.length === 0) return 100;

    let score = 100;

    const hookTNAs = tnas.filter((t) => t.type === 'hook');
    const hooksCovered = hookTNAs.filter((hook) => {
      const matchingPrompt = prompts.find((p) => p.prompt.toLowerCase().includes(hook.text.toLowerCase().slice(0, 20)));
      return matchingPrompt !== undefined;
    });

    if (hookTNAs.length > 0) {
      const hookCoverage = hooksCovered.length / hookTNAs.length;
      if (hookCoverage < 1) {
        score -= (1 - hookCoverage) * 20;
      }
    }

    const transitionTNAs = tnas.filter((t) => t.type === 'transition');
    const gapIssues = reports.filter((r) =>
      r.issues.some((i) => i.description.includes('gap') || i.description.includes('transition')),
    );

    if (transitionTNAs.length > 0 && gapIssues.length > transitionTNAs.length * 0.3) {
      score -= 15;
    }

    const failedClips = reports.filter((r) => !r.passed);
    const failureRate = failedClips.length / Math.max(reports.length, 1);

    if (failureRate > 0.2) {
      score -= failureRate * 30;
    }

    return clamp(score, 0, 100);
  }

  private generateSummary(nc: NarrativeCoherence, sf: ScriptFaithfulness, combined: number, tier: QualityTier): string {
    const parts: string[] = [];

    parts.push(`Quality tier: ${tier.toUpperCase()} (${combined}/100)`);
    parts.push(`NC: ${nc.score}/100 | SF: ${sf.score}/100`);

    if (nc.issues.length > 0 || sf.issues.length > 0) {
      const criticalCount =
        nc.issues.filter((i) => i.severity === 'critical').length +
        sf.issues.filter((i) => i.severity === 'critical').length;

      const majorCount =
        nc.issues.filter((i) => i.severity === 'major').length + sf.issues.filter((i) => i.severity === 'major').length;

      if (criticalCount > 0) {
        parts.push(`Critical issues: ${criticalCount}`);
      }
      if (majorCount > 0) {
        parts.push(`Major issues: ${majorCount}`);
      }
    }

    if (tier === 'excellent') {
      parts.push('Narrative is coherent and faithful to script.');
    } else if (tier === 'good') {
      parts.push('Minor improvements possible.');
    } else if (tier === 'fair') {
      parts.push('Several issues need attention.');
    } else {
      parts.push('Significant rework recommended.');
    }

    return parts.join(' | ');
  }

  private async storeResults(packageId: string, result: NarrativeQuality): Promise<void> {
    try {
      await db
        .insert(narrativeQualityResults)
        .values({
          packageId,
          ncScore: result.nc.score,
          sfScore: result.sf.score,
          combinedScore: result.combined,
          tier: result.tier,
          passesQualityGate: result.passesQualityGate,
          ncResult: result.nc as any,
          sfResult: result.sf as any,
          summary: result.summary,
          evaluatedAt: result.evaluatedAt,
        })
        .onConflictDoUpdate({
          target: narrativeQualityResults.packageId,
          set: {
            ncScore: result.nc.score,
            sfScore: result.sf.score,
            combinedScore: result.combined,
            tier: result.tier,
            passesQualityGate: result.passesQualityGate,
            ncResult: result.nc as any,
            sfResult: result.sf as any,
            summary: result.summary,
            evaluatedAt: result.evaluatedAt,
            updatedAt: new Date(),
          },
        });
    } catch (error: any) {
      console.error(`Failed to store narrative quality results: ${error.message}`);
    }
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const narrativeMetricsService = new NarrativeMetricsService();
