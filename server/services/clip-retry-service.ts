/**
 * Clip Retry Service
 *
 * Implements the "Correction Barrier" quality gate with:
 * - Max 3 attempts per clip
 * - GPT-4o feedback-driven prompt rewriting
 * - Reference frame anchoring for character consistency
 * - Effort-based Thompson Sampling rewards
 * - Kling 2.5 optimized prompts
 *
 * Enhanced with Bayesian Surprise Analysis for intelligent retry prioritization:
 * - High-surprise + low-quality clips get priority
 * - Surprise context passed to prompt rewriter for enhanced regeneration
 */

import { kling25PromptOptimizer } from './kling25-prompt-optimizer';
import { historicalAccuracyValidator } from './historical-accuracy-validator';
import { styleBanditService } from './style-bandit-service';
import { audioVideoSyncService, ForcedAlignmentResult } from './audio-video-sync-service';
import { bayesianSurpriseAnalyzer } from './pattern-intelligence-service';
import { existsSync, promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';

const execAsync = promisify(exec);

const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  PASS_THRESHOLD: 80,
  SYNC_PASS_THRESHOLD: 70, // Slightly lower for sync since it's newer
  REFERENCE_FRAME_QUALITY: 2,
};

interface ClipGenerationFn {
  (
    prompt: string,
    options?: any,
  ): Promise<{
    success: boolean;
    videoUrl?: string;
    localPath?: string;
    error?: string;
    cost: number;
  }>;
}

interface RetryResult {
  success: boolean;
  finalPath?: string;
  finalScore: number;
  attemptsUsed: number;
  totalCost: number;
  rewardApplied: {
    alphaChange: number;
    betaChange: number;
    rewardType: string;
  };
  promptHistory: Array<{
    attempt: number;
    prompt: string;
    score: number;
    corrections: string[];
  }>;
  validationDetails?: any;
}

interface ClipContext {
  jobId: string;
  packageId: string;
  clipIndex: number;
  packageData: any;
  styleName: string;
  previousClipPath?: string;
  // Audio sync context (optional)
  audioPath?: string;
  clipStartTime?: number;
  clipEndTime?: number;
  forcedAlignment?: ForcedAlignmentResult;
}

class ClipRetryService {
  /**
   * Extract a reference frame from a video for character consistency anchoring
   */
  async extractReferenceFrame(videoPath: string): Promise<string | null> {
    if (!existsSync(videoPath)) {
      console.warn(`⚠️ [ClipRetry] Cannot extract reference: video not found`);
      return null;
    }

    const framesDir = path.join('/tmp', 'reference_frames', Date.now().toString());
    await fs.mkdir(framesDir, { recursive: true });

    try {
      const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      );
      const duration = parseFloat(durationOutput.trim()) || 5;

      const midpoint = duration * 0.6;
      const framePath = path.join(framesDir, 'reference.jpg');

      await execAsync(
        `ffmpeg -ss ${midpoint} -i "${videoPath}" -vframes 1 -q:v ${RETRY_CONFIG.REFERENCE_FRAME_QUALITY} "${framePath}" -y 2>/dev/null`,
      );

      if (existsSync(framePath)) {
        const frameData = await fs.readFile(framePath);
        const base64 = frameData.toString('base64');

        await fs.unlink(framePath);
        try {
          await fs.rmdir(framesDir);
        } catch {}

        return base64;
      }
    } catch (error: any) {
      console.error(`❌ [ClipRetry] Reference frame extraction failed:`, error.message);
    }

    return null;
  }

  /**
   * Main retry loop with quality gate
   * Attempts up to 3 generations, applying GPT-4o feedback corrections each time
   */
  async retryWithQualityGate(
    initialPrompt: string,
    generateFn: ClipGenerationFn,
    context: ClipContext,
    generationOptions?: any,
  ): Promise<RetryResult> {
    const promptHistory: RetryResult['promptHistory'] = [];
    let currentPrompt = initialPrompt;
    let totalCost = 0;
    let lastValidation: any = null;
    let referenceFrameBase64: string | null = null;

    if (context.previousClipPath) {
      referenceFrameBase64 = await this.extractReferenceFrame(context.previousClipPath);
      if (referenceFrameBase64) {
        console.log(`🎬 [ClipRetry] Reference frame extracted for character consistency`);
      }
    }

    for (let attempt = 1; attempt <= RETRY_CONFIG.MAX_ATTEMPTS; attempt++) {
      console.log(`\n🔄 [ClipRetry] Attempt ${attempt}/${RETRY_CONFIG.MAX_ATTEMPTS} for clip ${context.clipIndex + 1}`);
      console.log(`   📝 Prompt: ${currentPrompt.substring(0, 100)}...`);

      const genResult = await generateFn(currentPrompt, generationOptions);
      totalCost += genResult.cost;

      if (!genResult.success || !genResult.localPath) {
        console.error(`   ❌ Generation failed: ${genResult.error}`);
        promptHistory.push({
          attempt,
          prompt: currentPrompt,
          score: 0,
          corrections: ['generation_failed'],
        });

        if (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
          currentPrompt = `${currentPrompt}. [RETRY: Ensure stable video generation]`;
          continue;
        }

        const failReward = kling25PromptOptimizer.calculateEffortReward(false, attempt);
        await this.applyStyleReward(context.styleName, failReward);

        return {
          success: false,
          finalScore: 0,
          attemptsUsed: attempt,
          totalCost,
          rewardApplied: failReward,
          promptHistory,
        };
      }

      const previousClipContext = context.previousClipPath
        ? await this.buildPreviousClipContext(context.previousClipPath)
        : undefined;

      const validation = await historicalAccuracyValidator.validateClip(
        genResult.localPath,
        context.clipIndex,
        context.jobId,
        context.packageId,
        context.packageData,
        previousClipContext,
      );

      lastValidation = validation;
      const score = validation.overallScore;

      console.log(`   📊 Validation score: ${score}/100 (threshold: ${RETRY_CONFIG.PASS_THRESHOLD})`);
      console.log(
        `   📈 Era: ${validation.eraAccuracyScore}, Char: ${validation.characterConsistencyScore}, Anach: ${validation.anachronismScore}, Cont: ${validation.continuityScore}`,
      );

      // HILL-CLIMBING: Check for critical failure (score < 30) - fail out early to save credits
      const failCheck = kling25PromptOptimizer.shouldFailOut(score);
      if (failCheck.failOut) {
        console.log(`   🚨 HILL-CLIMB FAIL-OUT: ${failCheck.reason}`);

        const failReward = kling25PromptOptimizer.calculateEffortReward(false, attempt);
        await this.applyStyleReward(context.styleName, failReward);

        // Clean up failed clip
        try {
          if (existsSync(genResult.localPath)) {
            await fs.unlink(genResult.localPath);
          }
        } catch {}

        promptHistory.push({
          attempt,
          prompt: currentPrompt,
          score,
          corrections: ['hill_climb_fail_out'],
        });

        return {
          success: false,
          finalScore: score,
          attemptsUsed: attempt,
          totalCost,
          rewardApplied: { ...failReward, rewardType: 'hill_climb_fail_out' },
          promptHistory,
          validationDetails: validation,
        };
      }

      if (score >= RETRY_CONFIG.PASS_THRESHOLD) {
        console.log(`   ✅ VISUAL PASSED on attempt ${attempt}!`);

        // AUDIO-VIDEO SYNC CHECK (if audio context provided)
        let syncCheck = null;
        if (context.audioPath && context.clipStartTime !== undefined && context.clipEndTime !== undefined) {
          console.log(`   🔄 Checking audio-video sync...`);
          syncCheck = await audioVideoSyncService.quickSyncCheck(
            genResult.localPath,
            context.clipStartTime,
            context.clipEndTime,
            context.forcedAlignment,
          );

          if (!syncCheck.passed) {
            console.log(
              `   ⚠️ SYNC WARNING: Score ${syncCheck.syncScore}/100 (threshold: ${RETRY_CONFIG.SYNC_PASS_THRESHOLD})`,
            );
            syncCheck.issues.forEach((issue) => console.log(`      - ${issue}`));

            // If sync fails badly, treat as validation failure for retry
            if (syncCheck.syncScore < 50 && attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
              console.log(`   ❌ Sync score too low (${syncCheck.syncScore} < 50) - forcing retry`);

              promptHistory.push({
                attempt,
                prompt: currentPrompt,
                score,
                corrections: ['sync_failure', ...syncCheck.issues.slice(0, 2)],
              });

              try {
                if (existsSync(genResult.localPath)) {
                  await fs.unlink(genResult.localPath);
                }
              } catch {}

              continue; // Force retry
            }
          } else {
            console.log(`   ✅ SYNC PASSED: ${syncCheck.syncScore}/100`);
          }
        }

        const reward = kling25PromptOptimizer.calculateEffortReward(true, attempt);
        await this.applyStyleReward(context.styleName, reward);

        // HILL-CLIMBING: Check for exponential win (score > 85 + improvement > 15)
        const previousScore = promptHistory.length > 0 ? promptHistory[promptHistory.length - 1].score : 0;
        const hillClimbResult = kling25PromptOptimizer.evaluateHillClimb(
          score,
          previousScore,
          currentPrompt,
          context.styleName,
        );

        if (hillClimbResult.action === 'lock_and_sprint') {
          console.log(`   🚀 EXPONENTIAL WIN: Locking winning keywords!`);
          console.log(`   📋 Keywords: ${hillClimbResult.lockedKeywords?.slice(0, 5).join(', ')}`);
        } else if (hillClimbResult.action === 'extract_keywords') {
          console.log(`   ✨ HIGH SCORE: Extracted ${hillClimbResult.lockedKeywords?.length || 0} winning keywords`);
        }

        promptHistory.push({
          attempt,
          prompt: currentPrompt,
          score,
          corrections:
            hillClimbResult.action === 'lock_and_sprint'
              ? ['exponential_win', ...(hillClimbResult.lockedKeywords?.slice(0, 3) || [])]
              : [],
        });

        return {
          success: true,
          finalPath: genResult.localPath,
          finalScore: score,
          attemptsUsed: attempt,
          totalCost,
          rewardApplied: reward,
          promptHistory,
          validationDetails: {
            ...validation,
            hillClimb: hillClimbResult,
            syncCheck,
          },
        };
      }

      console.log(`   ❌ Rejected (${score} < ${RETRY_CONFIG.PASS_THRESHOLD})`);

      if (attempt < RETRY_CONFIG.MAX_ATTEMPTS) {
        const optimizationResult = kling25PromptOptimizer.assembleRetryPrompt(
          currentPrompt,
          {
            eraAccuracyScore: validation.eraAccuracyScore,
            characterConsistencyScore: validation.characterConsistencyScore,
            anachronismScore: validation.anachronismScore,
            continuityScore: validation.continuityScore,
            criticalIssues: validation.criticalIssues || [],
            analysis: validation.analysis,
          } as any,
          attempt + 1,
          referenceFrameBase64 || undefined,
        );

        promptHistory.push({
          attempt,
          prompt: currentPrompt,
          score,
          corrections: optimizationResult.appliedCorrections,
        });

        currentPrompt = optimizationResult.optimizedPrompt;

        console.log(`   🔧 Corrections applied: ${optimizationResult.appliedCorrections.join(', ')}`);

        try {
          if (existsSync(genResult.localPath)) {
            await fs.unlink(genResult.localPath);
          }
        } catch {}
      } else {
        promptHistory.push({
          attempt,
          prompt: currentPrompt,
          score,
          corrections: [],
        });
      }
    }

    console.log(`\n🚨 [ClipRetry] CLIP DISCARDED after ${RETRY_CONFIG.MAX_ATTEMPTS} attempts`);

    const failReward = kling25PromptOptimizer.calculateEffortReward(false, RETRY_CONFIG.MAX_ATTEMPTS);
    await this.applyStyleReward(context.styleName, failReward);

    return {
      success: false,
      finalScore: lastValidation?.overallScore || 0,
      attemptsUsed: RETRY_CONFIG.MAX_ATTEMPTS,
      totalCost,
      rewardApplied: failReward,
      promptHistory,
      validationDetails: lastValidation,
    };
  }

  /**
   * Build context from previous clip for continuity validation
   */
  private async buildPreviousClipContext(clipPath: string): Promise<
    | {
        summary: string;
        characterFeatures: string[];
        setting: string;
        mood: string;
      }
    | undefined
  > {
    return {
      summary: 'Previous scene in sequence',
      characterFeatures: ['consistent historical figure'],
      setting: 'continuing historical setting',
      mood: 'consistent narrative mood',
    };
  }

  /**
   * Apply effort-based reward to the visual style bandit
   */
  private async applyStyleReward(
    styleName: string,
    reward: { alphaChange: number; betaChange: number; rewardType: string },
  ): Promise<void> {
    if (!styleName) return;

    try {
      console.log(`📊 [ClipRetry] Applying ${reward.rewardType} reward to style "${styleName}"`);
      console.log(`   Δα: ${reward.alphaChange}, Δβ: ${reward.betaChange}`);

      if (reward.alphaChange > 0) {
        await styleBanditService.recordOutcome(styleName, true);
      } else if (reward.betaChange > 0) {
        for (let i = 0; i < Math.ceil(reward.betaChange); i++) {
          await styleBanditService.recordOutcome(styleName, false);
        }
      }
    } catch (error: any) {
      console.error(`⚠️ [ClipRetry] Failed to apply style reward:`, error.message);
    }
  }

  /**
   * Get retry statistics for a job
   */
  getRetryStats(results: RetryResult[]): {
    totalClips: number;
    passedClips: number;
    failedClips: number;
    easyWins: number;
    mediumWins: number;
    hardWins: number;
    totalFails: number;
    totalCost: number;
    avgAttempts: number;
    avgScore: number;
  } {
    const stats = {
      totalClips: results.length,
      passedClips: results.filter((r) => r.success).length,
      failedClips: results.filter((r) => !r.success).length,
      easyWins: results.filter((r) => r.rewardApplied.rewardType === 'easy_win').length,
      mediumWins: results.filter((r) => r.rewardApplied.rewardType === 'medium_win').length,
      hardWins: results.filter((r) => r.rewardApplied.rewardType === 'hard_win').length,
      totalFails: results.filter((r) => r.rewardApplied.rewardType === 'total_fail').length,
      totalCost: results.reduce((sum, r) => sum + r.totalCost, 0),
      avgAttempts: 0,
      avgScore: 0,
    };

    if (results.length > 0) {
      stats.avgAttempts = results.reduce((sum, r) => sum + r.attemptsUsed, 0) / results.length;
      stats.avgScore = results.reduce((sum, r) => sum + r.finalScore, 0) / results.length;
    }

    return stats;
  }

  /**
   * Calculate retry priorities using Bayesian surprise analysis
   * High-surprise + low-quality clips get priority for regeneration
   *
   * @param tnaData TNA breakdown data for narrative impact analysis
   * @param clipReports Clip quality reports with scores
   * @param librosaData Audio analysis data for surprise detection
   * @returns Map of clipIndex -> priority score (1-10, higher = more urgent)
   */
  calculateSurpriseBasedPriorities(
    tnaData:
      | Array<{
          clipIndex: number;
          type: string;
          emotionalArc: string;
          text: string;
        }>
      | null
      | undefined,
    clipReports:
      | Array<{
          clipIndex: number;
          qualityScore: number;
          passed: boolean;
        }>
      | null
      | undefined,
    librosaData?: {
      duration: number;
      bpm: number;
      sections?: Array<{
        startTime: number;
        endTime: number;
        type: string;
        energy: string;
      }>;
    } | null,
  ): Map<number, number> {
    console.log(`🎯 [ClipRetry] Calculating surprise-based retry priorities...`);

    // Guard: Return default priorities if no inputs available
    if (!tnaData || !Array.isArray(tnaData) || tnaData.length === 0) {
      console.warn(`⚠️ [ClipRetry] No TNA data available - using default priorities`);
      return this.createDefaultPriorities(clipReports?.length || 10);
    }

    if (!clipReports || !Array.isArray(clipReports) || clipReports.length === 0) {
      console.warn(`⚠️ [ClipRetry] No clip reports available - using default priorities`);
      return this.createDefaultPriorities(tnaData.length);
    }

    // Sanitize inputs - ensure all required fields have defaults
    const sanitizedTnaData = tnaData.map((tna, idx) => ({
      clipIndex: tna?.clipIndex ?? idx,
      type: tna?.type || 'beat',
      emotionalArc: tna?.emotionalArc || 'stable',
      text: tna?.text || '',
    }));

    const sanitizedClipReports = clipReports.map((report, idx) => ({
      clipIndex: report?.clipIndex ?? idx,
      qualityScore: typeof report?.qualityScore === 'number' ? report.qualityScore : 50,
      passed: Boolean(report?.passed),
    }));

    // Default librosa if not provided
    const defaultLibrosa = {
      duration: sanitizedClipReports.length * 5,
      bpm: 120,
      sections: [] as Array<{
        startTime: number;
        endTime: number;
        type: string;
        energy: string;
      }>,
    };

    const libData = librosaData || defaultLibrosa;

    // Use Bayesian surprise analyzer to calculate priorities
    try {
      const priorities = bayesianSurpriseAnalyzer.calculateRetryPriorities(
        sanitizedTnaData as any,
        sanitizedClipReports as any,
      );

      // Log priority breakdown
      const highPriority = Array.from(priorities.entries()).filter(([_, p]) => p >= 8);
      const medPriority = Array.from(priorities.entries()).filter(([_, p]) => p >= 5 && p < 8);
      const lowPriority = Array.from(priorities.entries()).filter(([_, p]) => p < 5);

      console.log(`   🔴 High priority (8-10): ${highPriority.length} clips`);
      console.log(`   🟡 Medium priority (5-7): ${medPriority.length} clips`);
      console.log(`   🟢 Low priority (1-4): ${lowPriority.length} clips`);

      return priorities;
    } catch (error: any) {
      console.error(`❌ [ClipRetry] Bayesian surprise calculation failed: ${error.message}`);
      console.log(`   ⚠️ Falling back to default priorities`);
      return this.createDefaultPriorities(sanitizedClipReports.length);
    }
  }

  /**
   * Create default priorities (5 for all clips) when Bayesian analysis unavailable
   */
  private createDefaultPriorities(clipCount: number): Map<number, number> {
    const priorities = new Map<number, number>();
    for (let i = 0; i < clipCount; i++) {
      priorities.set(i, 5); // Default medium priority
    }
    console.log(`   📋 Created default priorities for ${clipCount} clips (all priority 5)`);
    return priorities;
  }

  /**
   * Get ordered list of clips to retry based on surprise-weighted priorities
   * Clips with high narrative impact and low quality are prioritized
   */
  getRetryOrder(failedClipIndices: number[], priorities: Map<number, number>): number[] {
    return failedClipIndices
      .map((idx) => ({ idx, priority: priorities.get(idx) || 5 }))
      .sort((a, b) => b.priority - a.priority)
      .map((item) => item.idx);
  }

  /**
   * Enhance a retry prompt with surprise context
   * Adds emphasis on narrative importance for high-surprise clips
   */
  enhancePromptWithSurpriseContext(
    originalPrompt: string,
    clipIndex: number,
    priorities: Map<number, number>,
    tnaContext?: {
      type: string;
      emotionalArc: string;
      narrativeObjective?: string;
    },
  ): string {
    const priority = priorities.get(clipIndex) || 5;

    if (priority < 7) {
      // Low/medium priority - no enhancement needed
      return originalPrompt;
    }

    // High priority clip - add narrative emphasis
    let enhancedPrompt = originalPrompt;

    const narrativeEmphasis = [];

    if (priority >= 9) {
      narrativeEmphasis.push('[CRITICAL NARRATIVE MOMENT]');
    } else if (priority >= 8) {
      narrativeEmphasis.push('[HIGH IMPACT MOMENT]');
    } else {
      narrativeEmphasis.push('[KEY STORY BEAT]');
    }

    if (tnaContext) {
      if (tnaContext.emotionalArc === 'peak') {
        narrativeEmphasis.push('Maximize visual intensity and drama.');
      } else if (tnaContext.emotionalArc === 'rising') {
        narrativeEmphasis.push('Build tension and anticipation.');
      }

      if (tnaContext.type === 'hook') {
        narrativeEmphasis.push('This is a hook moment - ensure maximum viewer engagement.');
      } else if (tnaContext.type === 'action') {
        narrativeEmphasis.push('Emphasize dynamic motion and energy.');
      }

      if (tnaContext.narrativeObjective) {
        narrativeEmphasis.push(`Narrative goal: ${tnaContext.narrativeObjective}`);
      }
    }

    if (narrativeEmphasis.length > 1) {
      enhancedPrompt = narrativeEmphasis.join(' ') + ' ' + originalPrompt;
    }

    console.log(`   🎭 Enhanced prompt for high-priority clip ${clipIndex} (priority: ${priority})`);

    return enhancedPrompt;
  }
}

export const clipRetryService = new ClipRetryService();
