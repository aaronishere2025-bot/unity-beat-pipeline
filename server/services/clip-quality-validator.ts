/**
 * Clip Quality Validator Service
 * Uses GPT-4 Vision to scan video clips for quality issues before use
 * Catches: distorted faces, morphing limbs, anachronistic elements, visual glitches
 *
 * Enhanced with Narrative Metrics (NC/SF) integration for combined quality scoring.
 * Visual quality contributes 60% and narrative quality contributes 40% to final score.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
import { existsSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PATH_CONFIG } from '../config/video-constants';
import { narrativeMetricsService, type NarrativeQuality } from './narrative-metrics-service';
import { bayesianSurpriseAnalyzer } from './pattern-intelligence-service';
import { narrativeTnaService, type TemporalNarrativeAtom } from './narrative-tna-service';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface NarrativeQualityContext {
  ncScore: number; // 0-100 Narrative Coherence
  sfScore: number; // 0-100 Script Faithfulness
  combinedScore: number; // 0-100 Combined NC/SF
  tier: 'excellent' | 'good' | 'fair' | 'poor';
  passesGate: boolean;
}

export interface ClipQualityResult {
  passed: boolean;
  confidence: number; // 0-100
  issues: ClipIssue[];
  recommendation: 'use' | 'regenerate' | 'use_with_caution';
  analysisTime: number;
  narrativeQuality?: NarrativeQualityContext;
  combinedScore?: number; // 60% visual + 40% narrative
}

export interface ClipIssue {
  type: 'face_distortion' | 'limb_morphing' | 'anachronism' | 'visual_glitch' | 'text_artifact' | 'other';
  severity: 'critical' | 'major' | 'minor';
  description: string;
  timestamp?: string; // Approximate location in clip
}

interface FrameAnalysis {
  frameIndex: number;
  issues: ClipIssue[];
  quality: number;
}

class ClipQualityValidator {
  private frameDir: string;
  private enabled: boolean = true;
  private maxFramesToAnalyze: number = 3; // Sample 3 frames per clip (start, middle, end)

  constructor() {
    this.frameDir = join(PATH_CONFIG.TEMP_DIR, 'quality_frames');
    try {
      mkdirSync(this.frameDir, { recursive: true });
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Enable or disable the validator
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`🔍 Clip quality validator: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Extract frames from video for analysis
   */
  private async extractFrames(videoPath: string, clipId: string): Promise<string[]> {
    const framePaths: string[] = [];

    try {
      // Get video duration (async, non-blocking)
      const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
      const { stdout: durationStr } = await execAsync(durationCmd, { timeout: 15000 });
      const duration = parseFloat(durationStr.trim()) || 5;

      // Extract frames at start, middle, and end
      const timestamps = [0.5, duration / 2, Math.max(duration - 0.5, 0.5)];

      for (let i = 0; i < timestamps.length; i++) {
        const framePath = join(this.frameDir, `${clipId}_frame_${i}.jpg`);
        const ts = timestamps[i].toFixed(2);

        try {
          await execAsync(`ffmpeg -ss ${ts} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}" -y -loglevel error`, {
            timeout: 15000,
          });

          if (existsSync(framePath)) {
            framePaths.push(framePath);
          }
        } catch (e) {
          // Frame extraction failed for this timestamp
        }
      }
    } catch (error) {
      console.warn(`⚠️ Frame extraction failed: ${error}`);
    }

    return framePaths;
  }

  /**
   * Analyze a single frame using GPT-4 Vision
   */
  private async analyzeFrame(
    framePath: string,
    frameIndex: number,
    historicalContext?: string,
  ): Promise<FrameAnalysis> {
    try {
      const imageData = readFileSync(framePath);
      const base64Image = imageData.toString('base64');

      const contextPrompt = historicalContext
        ? `This is a frame from a historical video about: ${historicalContext}.`
        : 'This is a frame from an AI-generated historical video.';

      const systemPrompt = `You are a video quality inspector for AI-generated historical content.
Analyze frames for visual quality issues that would make the video look unprofessional or AI-generated.

CRITICAL ISSUES (should reject):
- Distorted faces (melting, asymmetrical, wrong number of features)
- Extra or missing limbs (more than 2 arms, 3 hands, etc)
- Morphing body parts (limbs blending into each other)
- Text artifacts (random letters, gibberish watermarks)

MAJOR ISSUES (use with caution):
- Anachronistic elements (modern items in ancient scenes)
- Unnatural poses or proportions
- Background inconsistencies (buildings morphing)

MINOR ISSUES (acceptable):
- Slight blur or softness
- Minor lighting inconsistencies
- Generic faces (not historically accurate but not distorted)

Respond in JSON format:
{
  "quality": 0-100,
  "issues": [
    {"type": "face_distortion|limb_morphing|anachronism|visual_glitch|text_artifact|other", "severity": "critical|major|minor", "description": "brief description"}
  ],
  "overallAssessment": "brief summary"
}`;

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 500, responseMimeType: 'application/json' },
      });
      const result = await model.generateContent([
        { text: `${systemPrompt}\n\n${contextPrompt} Analyze this frame for quality issues.` },
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
      ]);
      const content = result.response.text();

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          frameIndex,
          issues: [{ type: 'other', severity: 'minor', description: 'Gemini returned non-JSON response' }],
          quality: 50,
        };
      }

      const analysis = JSON.parse(jsonMatch[0]);

      return {
        frameIndex,
        issues: analysis.issues || [],
        quality: analysis.quality || 50,
      };
    } catch (error: any) {
      console.warn(`⚠️ Frame analysis failed: ${error.message}`);
      return {
        frameIndex,
        issues: [{ type: 'other', severity: 'minor', description: `Analysis API error: ${error.message}` }],
        quality: 50,
      }; // Cautious on failure, not assumed OK
    }
  }

  /**
   * Validate a video clip for quality issues
   * @param videoPath Path to the video clip
   * @param clipId Unique identifier for the clip
   * @param historicalContext Optional context about the video content
   * @returns Quality validation result
   */
  async validateClip(videoPath: string, clipId: string, historicalContext?: string): Promise<ClipQualityResult> {
    const startTime = Date.now();

    if (!this.enabled) {
      return {
        passed: true,
        confidence: 100,
        issues: [],
        recommendation: 'use',
        analysisTime: 0,
      };
    }

    if (!existsSync(videoPath)) {
      return {
        passed: false,
        confidence: 100,
        issues: [{ type: 'other', severity: 'critical', description: 'Video file not found' }],
        recommendation: 'regenerate',
        analysisTime: Date.now() - startTime,
      };
    }

    console.log(`🔍 Validating clip quality: ${clipId}`);

    // Extract frames
    const framePaths = await this.extractFrames(videoPath, clipId);

    if (framePaths.length === 0) {
      console.warn(`⚠️ No frames extracted for ${clipId} — marking as failed (cannot verify quality)`);
      return {
        passed: false,
        confidence: 80,
        issues: [
          {
            type: 'other',
            severity: 'critical',
            description: 'Could not extract any frames for quality analysis — video may be corrupted',
          },
        ],
        recommendation: 'regenerate',
        analysisTime: Date.now() - startTime,
      };
    }

    // Analyze frames in parallel
    const frameAnalyses = await Promise.all(framePaths.map((fp, idx) => this.analyzeFrame(fp, idx, historicalContext)));

    // Cleanup extracted frames
    for (const fp of framePaths) {
      try {
        unlinkSync(fp);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    // Aggregate issues
    const allIssues: ClipIssue[] = [];
    let totalQuality = 0;

    for (const analysis of frameAnalyses) {
      allIssues.push(...analysis.issues);
      totalQuality += analysis.quality;
    }

    const avgQuality = totalQuality / frameAnalyses.length;

    // Determine recommendation
    const criticalIssues = allIssues.filter((i) => i.severity === 'critical');
    const majorIssues = allIssues.filter((i) => i.severity === 'major');

    let recommendation: 'use' | 'regenerate' | 'use_with_caution';
    let passed: boolean;

    if (criticalIssues.length > 0) {
      recommendation = 'regenerate';
      passed = false;
    } else if (majorIssues.length >= 2 || avgQuality < 50) {
      recommendation = 'use_with_caution';
      passed = false;
    } else if (majorIssues.length === 1 || avgQuality < 70) {
      recommendation = 'use_with_caution';
      passed = true;
    } else {
      recommendation = 'use';
      passed = true;
    }

    const result: ClipQualityResult = {
      passed,
      confidence: avgQuality,
      issues: allIssues,
      recommendation,
      analysisTime: Date.now() - startTime,
    };

    console.log(
      `   ${passed ? '✅' : '❌'} Quality: ${avgQuality.toFixed(0)}% | Issues: ${allIssues.length} | Recommendation: ${recommendation}`,
    );

    return result;
  }

  /**
   * Validate multiple clips and return results
   */
  async validateClips(
    clips: Array<{ path: string; id: string; context?: string }>,
  ): Promise<Map<string, ClipQualityResult>> {
    const results = new Map<string, ClipQualityResult>();

    console.log(`🔍 Validating ${clips.length} clips for quality...`);

    // Process clips sequentially to avoid overwhelming the API
    for (const clip of clips) {
      const result = await this.validateClip(clip.path, clip.id, clip.context);
      results.set(clip.id, result);
    }

    // Summary
    const passed = Array.from(results.values()).filter((r) => r.passed).length;
    const failed = results.size - passed;
    console.log(`   ✅ Passed: ${passed} | ❌ Failed: ${failed}`);

    return results;
  }

  /**
   * Quick check - just analyze the middle frame (faster, less thorough)
   */
  async quickValidate(videoPath: string, clipId: string): Promise<boolean> {
    if (!this.enabled) return true;

    const result = await this.validateClip(videoPath, clipId);
    return result.passed;
  }

  /**
   * Extended validation with narrative quality integration
   * Combines visual quality (60%) with narrative quality (40%) for comprehensive scoring
   *
   * @param videoPath Path to the video clip
   * @param clipId Unique identifier for the clip
   * @param packageId Package ID for narrative quality lookup
   * @param tnaContext Optional TNA context for real-time narrative evaluation
   * @param historicalContext Optional historical context for visual validation
   */
  async validateClipWithNarrativeQuality(
    videoPath: string,
    clipId: string,
    packageId: string,
    tnaContext?: TemporalNarrativeAtom[],
    historicalContext?: string,
  ): Promise<ClipQualityResult> {
    const startTime = Date.now();

    // 1. Perform visual quality validation
    const visualResult = await this.validateClip(videoPath, clipId, historicalContext);

    // 2. Get or evaluate narrative quality for the package
    let narrativeQuality: NarrativeQualityContext | undefined;
    let narrativeScore = 0;

    try {
      // Try to get existing narrative quality evaluation
      const storedResults = await narrativeMetricsService.getStoredResults(packageId);

      if (storedResults) {
        narrativeQuality = {
          ncScore: storedResults.nc.score,
          sfScore: storedResults.sf.score,
          combinedScore: storedResults.combined,
          tier: storedResults.tier,
          passesGate: storedResults.passesQualityGate,
        };
        narrativeScore = storedResults.combined;
      } else if (tnaContext && tnaContext.length > 0) {
        // If no stored results but TNA context provided, run a quick evaluation
        console.log(`   📊 Running narrative quality evaluation for package ${packageId}...`);
        const evaluation = await narrativeMetricsService.evaluateNarrativeQuality(packageId);
        narrativeQuality = {
          ncScore: evaluation.nc.score,
          sfScore: evaluation.sf.score,
          combinedScore: evaluation.combined,
          tier: evaluation.tier,
          passesGate: evaluation.passesQualityGate,
        };
        narrativeScore = evaluation.combined;
      }
    } catch (error: any) {
      console.warn(`   ⚠️ Could not evaluate narrative quality: ${error.message}`);
      // Continue with visual-only validation
    }

    // 3. Calculate combined score (60% visual + 40% narrative)
    let combinedScore: number | undefined;
    let finalPassed = visualResult.passed;
    let finalRecommendation = visualResult.recommendation;

    if (narrativeQuality) {
      // 60% visual accuracy + 40% narrative quality
      combinedScore = Math.round(visualResult.confidence * 0.6 + narrativeScore * 0.4);

      // Update pass/fail based on combined score
      const COMBINED_PASS_THRESHOLD = 60;
      const combinedPasses = combinedScore >= COMBINED_PASS_THRESHOLD;

      // Both visual AND combined must pass
      finalPassed = visualResult.passed && combinedPasses;

      // Update recommendation based on combined evaluation
      if (!finalPassed) {
        if (combinedScore < 40) {
          finalRecommendation = 'regenerate';
        } else if (combinedScore < 60) {
          finalRecommendation = 'use_with_caution';
        }
      }

      console.log(
        `   📊 Combined quality: ${combinedScore}/100 (Visual: ${visualResult.confidence}%, Narrative: ${narrativeScore}%)`,
      );
    }

    return {
      ...visualResult,
      passed: finalPassed,
      recommendation: finalRecommendation,
      analysisTime: Date.now() - startTime,
      narrativeQuality,
      combinedScore,
    };
  }

  /**
   * Validate multiple clips with narrative quality context
   */
  async validateClipsWithNarrativeQuality(
    clips: Array<{ path: string; id: string; context?: string }>,
    packageId: string,
    tnaContext?: TemporalNarrativeAtom[],
  ): Promise<Map<string, ClipQualityResult>> {
    const results = new Map<string, ClipQualityResult>();

    console.log(`🔍 Validating ${clips.length} clips with narrative quality context...`);

    // Process clips sequentially
    for (const clip of clips) {
      const result = await this.validateClipWithNarrativeQuality(
        clip.path,
        clip.id,
        packageId,
        tnaContext,
        clip.context,
      );
      results.set(clip.id, result);
    }

    // Summary
    const passed = Array.from(results.values()).filter((r) => r.passed).length;
    const failed = results.size - passed;
    const avgCombined =
      results.size > 0
        ? Math.round(
            Array.from(results.values())
              .filter((r) => r.combinedScore !== undefined)
              .reduce((sum, r) => sum + (r.combinedScore || 0), 0) /
              Math.max(1, Array.from(results.values()).filter((r) => r.combinedScore !== undefined).length),
          )
        : 0;

    console.log(`   ✅ Passed: ${passed} | ❌ Failed: ${failed} | 📊 Avg Combined: ${avgCombined}/100`);

    return results;
  }
}

export const clipQualityValidator = new ClipQualityValidator();
