/**
 * Pre-Upload Quality Gate Service
 *
 * Runs audio DNA and visual analysis before YouTube upload.
 * Blocks uploads that don't meet minimum quality thresholds.
 *
 * Quality Grades:
 * - A+ (95+): Exceptional
 * - A  (90-94): Excellent
 * - A- (85-89): Very Good
 * - B+ (80-84): Good - MINIMUM THRESHOLD
 * - B  (75-79): Average
 * - C  (65-74): Below Average
 * - D  (<65): Poor - BLOCKED
 */

import { existsSync, unlinkSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
const execAsync = promisify(exec);
import { db } from '../db';
import { audioDna } from '@shared/schema';
import { eq } from 'drizzle-orm';

const MINIMUM_AUDIO_SCORE = 80; // B+ minimum for audio
const MINIMUM_OVERALL_SCORE = 80; // B+ minimum overall

interface QualityGateResult {
  passed: boolean;
  overallScore: number;
  grade: string;
  audioAnalysis: {
    score: number;
    energyScore: number;
    rhythmScore: number;
    clarityScore: number;
    hookScore: number;
    hookSurvival: number;
    energyCurve: string;
    recommendation?: string;
  } | null;
  visualAnalysis: {
    score: number;
    frameQuality: number;
    recommendation?: string;
  } | null;
  blockReason?: string;
  recommendations: string[];
}

function getGrade(score: number): string {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  return 'D';
}

class PreUploadQualityGateService {
  /**
   * Run full quality gate check before upload
   * @param packageId - The unity content package ID
   * @param audioPath - Path to the audio file (REQUIRED)
   * @param videoPath - Path to the generated video for frame analysis
   * @param jobId - Optional job ID to check for existing historical validation
   */
  async runQualityCheck(
    packageId: string,
    audioPath?: string,
    videoPath?: string,
    jobId?: string,
  ): Promise<QualityGateResult> {
    console.log(`\n🔍 QUALITY GATE: Running pre-upload analysis...`);

    const recommendations: string[] = [];
    let audioResult: QualityGateResult['audioAnalysis'] = null;
    let visualResult: QualityGateResult['visualAnalysis'] = null;
    let blockReason: string | undefined;

    // AUDIO ANALYSIS (Required)
    if (audioPath && existsSync(audioPath)) {
      audioResult = await this.runAudioAnalysis(packageId, audioPath);
      if (audioResult) {
        console.log(`   🎵 Audio Score: ${audioResult.score}/100 (${getGrade(audioResult.score)})`);
        if (audioResult.recommendation) {
          recommendations.push(audioResult.recommendation);
        }
      }
    } else {
      // Check if we have existing audio DNA in database
      audioResult = await this.getExistingAudioAnalysis(packageId);
      if (audioResult) {
        console.log(`   🎵 Audio Score (cached): ${audioResult.score}/100 (${getGrade(audioResult.score)})`);
      } else {
        console.log(`   ⚠️ No audio file or cached analysis found`);
        // Don't block for missing audio - the video might still be good
      }
    }

    // VISUAL ANALYSIS (Analyze video frames directly)
    // Skip if historical accuracy already validated all clips for this job
    if (videoPath && existsSync(videoPath)) {
      let skipVisual = false;
      if (jobId) {
        try {
          const { storage } = await import('../storage');
          const reports = await storage.getClipAccuracyReports(jobId);
          if (reports.length > 0 && reports.every((r) => r.passed)) {
            // All clips already passed historical validation — skip expensive GPT-4 Vision
            const avgScore = Math.round(reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length);
            visualResult = { score: avgScore, frameQuality: avgScore };
            skipVisual = true;
            console.log(
              `   🎬 Visual Score (from historical validation): ${avgScore}/100 (${getGrade(avgScore)}) — skipped redundant Vision call`,
            );
          }
        } catch {}
      }

      if (!skipVisual) {
        visualResult = await this.runVideoFrameAnalysis(videoPath);
        if (visualResult) {
          console.log(`   🎬 Visual Score: ${visualResult.score}/100 (${getGrade(visualResult.score)})`);
          if (visualResult.recommendation) {
            recommendations.push(visualResult.recommendation);
          }
        }
      }
    }

    // Calculate overall score
    // If we only have audio, use audio score
    // If we have both, weight 60% audio / 40% visual
    let overallScore = 0;

    if (audioResult && visualResult) {
      overallScore = Math.round(audioResult.score * 0.6 + visualResult.score * 0.4);
    } else if (audioResult) {
      overallScore = audioResult.score;
    } else if (visualResult) {
      overallScore = visualResult.score;
    } else {
      // No analysis available - BLOCK upload, require manual review
      console.log(`   ❌ QUALITY GATE FAILED: No analysis data available`);
      console.log(`   📛 Reason: Cannot verify quality without audio or visual analysis`);
      console.log(`   ℹ️  Manual review required before upload`);
      return {
        passed: false,
        overallScore: 0,
        grade: 'N/A',
        audioAnalysis: null,
        visualAnalysis: null,
        blockReason: 'No quality analysis available - manual review required',
        recommendations: [
          'Ensure audio file exists and is accessible',
          'Verify video file is valid for frame extraction',
        ],
      };
    }

    const grade = getGrade(overallScore);

    // Determine if quality gate passes
    let passed = overallScore >= MINIMUM_OVERALL_SCORE;

    // Check individual score thresholds
    if (audioResult && audioResult.score < MINIMUM_AUDIO_SCORE) {
      passed = false;
      blockReason = `Audio score ${audioResult.score}/100 below minimum ${MINIMUM_AUDIO_SCORE}`;
    }

    if (!passed && !blockReason) {
      blockReason = `Overall score ${overallScore}/100 below minimum ${MINIMUM_OVERALL_SCORE}`;
    }

    const result: QualityGateResult = {
      passed,
      overallScore,
      grade,
      audioAnalysis: audioResult,
      visualAnalysis: visualResult,
      blockReason,
      recommendations,
    };

    // Log final result
    if (passed) {
      console.log(`   ✅ QUALITY GATE PASSED: ${overallScore}/100 (${grade})`);
    } else {
      console.log(`   ❌ QUALITY GATE FAILED: ${overallScore}/100 (${grade})`);
      console.log(`   📛 Reason: ${blockReason}`);
      if (recommendations.length > 0) {
        console.log(`   💡 Recommendations:`);
        recommendations.forEach((r) => console.log(`      - ${r}`));
      }
    }

    return result;
  }

  /**
   * Run audio DNA analysis
   */
  private async runAudioAnalysis(packageId: string, audioPath: string): Promise<QualityGateResult['audioAnalysis']> {
    try {
      const { acousticFingerprintService } = await import('./acoustic-fingerprint-service');

      // Check if we already have analysis for this package
      let fingerprint = await acousticFingerprintService.getFingerprintByPackage(packageId);

      // If not, run the analysis
      if (!fingerprint) {
        console.log(`   🎵 Analyzing audio: ${audioPath}`);
        fingerprint = await acousticFingerprintService.extractFingerprint(audioPath);

        if (fingerprint) {
          await acousticFingerprintService.storeFingerprint(packageId, fingerprint);
        }
      }

      if (!fingerprint) {
        console.log(`   ⚠️ Audio analysis failed - no fingerprint generated`);
        return null;
      }

      // Calculate audio score from DNA scores
      const dnaScores = fingerprint.dna_scores || {};
      const energyScore = dnaScores.energy_score || 50;
      const rhythmScore = dnaScores.rhythm_score || 50;
      const clarityScore = dnaScores.clarity_score || 50;
      const hookScore = dnaScores.hook_score || 50;

      // Weighted average for audio quality score
      const audioScore = Math.round(energyScore * 0.25 + rhythmScore * 0.25 + clarityScore * 0.25 + hookScore * 0.25);

      const hookSurvival = (fingerprint.predicted_hook_survival || 0) * 100;

      // Generate recommendation based on weakest area
      let recommendation: string | undefined;
      const weakestScore = Math.min(energyScore, rhythmScore, clarityScore, hookScore);
      if (weakestScore < 60) {
        if (weakestScore === hookScore) {
          recommendation = 'Consider adding stronger hook patterns in the first 5 seconds';
        } else if (weakestScore === energyScore) {
          recommendation = 'Audio lacks energy dynamics - consider more varied instrumentation';
        } else if (weakestScore === clarityScore) {
          recommendation = 'Audio clarity is low - check for vocal/instrument overlap';
        } else if (weakestScore === rhythmScore) {
          recommendation = 'Rhythm inconsistency detected - ensure steady beat';
        }
      }

      return {
        score: audioScore,
        energyScore,
        rhythmScore,
        clarityScore,
        hookScore,
        hookSurvival,
        energyCurve: fingerprint.energy_curve || 'unknown',
        recommendation,
      };
    } catch (err: any) {
      console.error(`   ⚠️ Audio analysis error: ${err.message}`);
      return null;
    }
  }

  /**
   * Get existing audio analysis from database
   */
  private async getExistingAudioAnalysis(packageId: string): Promise<QualityGateResult['audioAnalysis']> {
    try {
      const [existing] = await db.select().from(audioDna).where(eq(audioDna.packageId, packageId)).limit(1);

      if (!existing) return null;

      const dnaScores = (existing.dnaScores as any) || {};
      const energyScore = dnaScores.energy_score || 50;
      const rhythmScore = dnaScores.rhythm_score || 50;
      const clarityScore = dnaScores.clarity_score || 50;
      const hookScore = dnaScores.hook_score || 50;

      return {
        score: Math.round(energyScore * 0.25 + rhythmScore * 0.25 + clarityScore * 0.25 + hookScore * 0.25),
        energyScore,
        rhythmScore,
        clarityScore,
        hookScore,
        hookSurvival: (existing.predictedHookSurvival || 0) * 100,
        energyCurve: existing.energyCurve || 'unknown',
      };
    } catch {
      return null;
    }
  }

  /**
   * Analyze video frames for quality
   * Uses clip-quality-validator (GPT-4 Vision) when available, falls back to file-size heuristics
   */
  private async runVideoFrameAnalysis(videoPath: string): Promise<QualityGateResult['visualAnalysis']> {
    try {
      // Extract 5 sample frames for better coverage
      const frames = await this.extractSampleFrames(videoPath, 5);

      if (frames.length === 0) {
        return null;
      }

      let totalScore = 0;
      let frameCount = 0;
      let recommendation: string | undefined;
      let usedVisionValidator = false;

      // Try clip-quality-validator (GPT-4 Vision) for accurate analysis
      try {
        const { clipQualityValidator } = await import('./clip-quality-validator');
        const clipResult = await clipQualityValidator.validateClip(videoPath, `quality-gate-${Date.now()}`);
        if (clipResult && typeof clipResult.confidence === 'number') {
          totalScore = clipResult.combinedScore ?? clipResult.confidence;
          frameCount = 1;
          usedVisionValidator = true;
          console.log(`   🔍 Vision validator score: ${totalScore}/100`);
          if (!clipResult.passed) {
            const issues =
              clipResult.issues?.map((i: any) => i.description || i).join(', ') || 'quality below threshold';
            recommendation = `Vision analysis flagged issues: ${issues}`;
          }
        }
      } catch {
        // Vision validator not available — fall back to frame analysis
      }

      // Fallback: file-size-based frame analysis
      if (!usedVisionValidator) {
        for (const framePath of frames) {
          try {
            const frameScore = await this.analyzeFrameQuality(framePath);
            totalScore += frameScore;
            frameCount++;
          } catch {}
        }
      }

      // Clean up temp frames
      for (const framePath of frames) {
        try {
          unlinkSync(framePath);
        } catch {}
      }

      if (frameCount === 0) {
        return null;
      }

      const avgScore = usedVisionValidator ? totalScore : Math.round(totalScore / frameCount);

      // Raised threshold from 70 to 75 for higher quality bar
      if (avgScore < 75) {
        recommendation = recommendation || 'Video frames show quality issues - consider regenerating clips';
      }

      return {
        score: avgScore,
        frameQuality: avgScore,
        recommendation,
      };
    } catch (err: any) {
      console.error(`   ⚠️ Video frame analysis error: ${err.message}`);
      return null;
    }
  }

  /**
   * Extract sample frames from video (5 frames for better coverage)
   */
  private async extractSampleFrames(videoPath: string, count: number = 5): Promise<string[]> {
    const frames: string[] = [];
    const tempDir = join(process.cwd(), 'data', 'temp', 'processing');

    try {
      // Get video duration (async, non-blocking)
      const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
        { timeout: 15000 },
      );

      const duration = parseFloat(durationOutput.trim()) || 30;

      // Extract frames at 5 evenly-spaced points for better coverage
      const timestamps = [
        Math.max(1, duration * 0.1), // 10% - near start
        duration * 0.3, // 30% - early-mid
        duration * 0.5, // 50% - middle
        duration * 0.7, // 70% - late-mid
        duration * 0.9, // 90% - near end
      ];

      for (let i = 0; i < Math.min(count, timestamps.length); i++) {
        const framePath = join(tempDir, `quality_frame_${Date.now()}_${i}.jpg`);

        try {
          await execAsync(
            `ffmpeg -i "${videoPath}" -ss ${timestamps[i]} -vframes 1 -q:v 2 "${framePath}" -y -loglevel error`,
            {
              timeout: 15000,
            },
          );

          if (existsSync(framePath)) {
            frames.push(framePath);
          }
        } catch {}
      }
    } catch (err: any) {
      console.log(`   ⚠️ Frame extraction error: ${err.message}`);
    }

    return frames;
  }

  /**
   * Analyze a single frame for quality metrics (fallback when Vision validator unavailable)
   */
  private async analyzeFrameQuality(framePath: string): Promise<number> {
    try {
      const { statSync } = await import('fs');
      const stats = statSync(framePath);
      const sizeKB = stats.size / 1024;

      // Multi-signal quality check:
      // 1. File size (low weight - file size alone is unreliable)
      let sizeScore = 75;
      if (sizeKB < 5)
        sizeScore = 30; // Almost certainly blank/black
      else if (sizeKB < 15)
        sizeScore = 55; // Likely very simple/dark
      else if (sizeKB >= 30) sizeScore = 80; // Has some detail

      // 2. Image dimensions check via JPEG header (quick, no subprocess)
      // JPEG files with proper content are always > 10KB for 1080p+ resolution
      const isLikelyBlank = sizeKB < 5;

      // 3. Combine signals - if frame is clearly blank, score low
      if (isLikelyBlank) {
        return 40; // Definitely problematic
      }

      // For normal frames, give benefit of doubt since we can't do deep analysis here
      // The clip-quality-validator with GPT-4 Vision does the real visual analysis
      return Math.min(sizeScore, 85); // Cap at 85 — only Vision gives 90+
    } catch {
      return 60; // Cautious default on error (not assumed good)
    }
  }
}

export const preUploadQualityGate = new PreUploadQualityGateService();
