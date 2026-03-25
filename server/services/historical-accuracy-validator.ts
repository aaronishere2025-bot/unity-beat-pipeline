/**
 * Historical Accuracy Validator Service
 *
 * Uses GPT-4o Vision to analyze video frames and verify:
 * 1. Era Accuracy - Clothing, architecture, technology match the historical period
 * 2. Character Consistency - Same person throughout all clips
 * 3. Anachronism Detection - Wrong-era items (wristwatches on Romans, etc.)
 * 4. Story Continuity - Smooth flow between consecutive clips
 *
 * Data Flow:
 * Job → Clip Generated → Frame Extraction → GPT-4o Vision → Report → Database
 *
 * Integrates with: job-worker.ts, storage.ts, visual-intelligence-service.ts
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { storage } from '../storage';
import { existsSync, promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import type { InsertClipAccuracyReport, ClipAccuracyReport } from '@shared/schema';
import { errorMonitor } from './error-monitor';

const execAsync = promisify(exec);

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface HistoricalContext {
  figureName: string;
  era: string;
  dateRange: string;
  expectedAppearance: string[];
  expectedClothing: string[];
  expectedSettings: string[];
  archetype: string;
  age?: string;
}

interface ValidationResult {
  passed: boolean;
  eraAccuracyScore: number;
  characterConsistencyScore: number;
  anachronismScore: number;
  continuityScore: number;
  overallScore: number;
  analysis: InsertClipAccuracyReport['analysis'];
  shouldRegenerate: boolean;
  criticalIssues: string[];
}

interface PreviousClipContext {
  summary: string;
  characterFeatures: string[];
  setting: string;
  mood: string;
}

class HistoricalAccuracyValidatorService {
  private readonly PASS_THRESHOLD = 90; // Minimum overall score to pass (STRICT)
  private readonly ERA_ACCURACY_MIN = 90; // Era accuracy must be near-perfect
  private readonly CHARACTER_CONSISTENCY_MIN = 90; // Character must be near-perfect
  private readonly ANACHRONISM_MIN = 95; // Almost no anachronisms allowed
  private readonly MAX_FRAMES_TO_ANALYZE = 4; // Frames per clip to check

  private readonly VALIDATION_PROMPT = `You are an EXTREMELY STRICT historical accuracy validator for AI-generated video content.

⚠️ CRITICAL: You must be HARSH in your evaluation. We require near-PERFECT accuracy (90+ scores).

Analyze these video frames and evaluate them against the provided historical context.

HISTORICAL CONTEXT:
{CONTEXT}

PREVIOUS CLIP CONTEXT (for continuity):
{PREVIOUS_CONTEXT}

Evaluate each aspect with a score from 0-100. BE STRICT - only give high scores for truly perfect accuracy:

1. ERA ACCURACY (Weight: 35%) - REQUIRED MINIMUM: 90/100
   - Does clothing EXACTLY match the historical period? (No "modern-looking" fabric)
   - Is architecture/setting PERFECTLY appropriate for the era?
   - Are weapons, tools, technology 100% period-correct?
   - ANY modern element, even subtle, should drop score below 90
   - Score 100 = Absolutely perfect, could be a museum exhibit
   - Score 90-99 = Nearly perfect, tiny forgivable details
   - Score < 90 = Has noticeable modern elements or wrong-era items

2. CHARACTER CONSISTENCY (Weight: 30%) - REQUIRED MINIMUM: 90/100
   - Does the person EXACTLY match the expected appearance?
   - Is the age, build, facial features spot-on?
   - Are distinctive features (scars, hair, facial structure) consistent?
   - Score 100 = Identical to description, perfect match
   - Score 90-99 = Very close match, minor acceptable variance
   - Score < 90 = Noticeable differences in appearance

3. ANACHRONISM DETECTION (Weight: 20%) - REQUIRED MINIMUM: 95/100
   - Look for ANY modern items: wristwatches, eyeglasses, zippers, plastic, modern shoes
   - Check for wrong-era technology (cameras, modern weapons for period)
   - Check for modern hair styles, makeup, accessories
   - Score 100 = ZERO anachronisms, completely period-accurate
   - Score 95-99 = One very minor questionable element
   - Score < 95 = Clear anachronisms present

4. STORY CONTINUITY (Weight: 15%)
   - Does this clip flow naturally from the previous one?
   - Is the narrative consistent?
   - Are there jarring transitions?
   - Score 100 = Perfect flow, seamless transition
   - Score < 60 = Jarring or disconnected

Respond in this exact JSON format:
{
  "eraAccuracyScore": <0-100>,
  "characterConsistencyScore": <0-100>,
  "anachronismScore": <0-100>,
  "continuityScore": <0-100>,
  "eraDetails": {
    "expectedEra": "<era description>",
    "detectedElements": ["<what you see>"],
    "correctElements": ["<matching items>"],
    "incorrectElements": ["<wrong items>"],
    "suggestions": ["<how to fix>"]
  },
  "characterDetails": {
    "expectedCharacter": "<name>",
    "expectedAge": "<age>",
    "expectedAppearance": ["<features>"],
    "detectedFeatures": ["<what you see>"],
    "matchScore": <0-100>,
    "issues": ["<problems found>"]
  },
  "anachronisms": [
    {
      "item": "<wrong item>",
      "severity": "critical|major|minor",
      "frameTimestamp": <seconds>,
      "suggestion": "<how to fix>"
    }
  ],
  "continuity": {
    "previousClipSummary": "<what happened before>",
    "currentClipSummary": "<what happens now>",
    "transitionSmooth": true|false,
    "narrativeFlow": "excellent|good|fair|poor",
    "issues": ["<problems>"]
  },
  "keyFrameDescriptions": [
    {
      "frameIndex": <0-3>,
      "timestamp": <seconds>,
      "description": "<what you see>",
      "issues": ["<problems in this frame>"]
    }
  ],
  "criticalIssues": ["<any deal-breaker problems>"],
  "shouldRegenerate": true|false
}`;

  /**
   * Extract frames from a video clip for analysis
   */
  async extractFrames(videoPath: string, numFrames: number = 4): Promise<string[]> {
    const framesDir = path.join('/tmp', 'accuracy_frames', Date.now().toString());
    await fs.mkdir(framesDir, { recursive: true });

    try {
      const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      );
      const duration = parseFloat(durationOutput.trim()) || 5;

      const framePaths: string[] = [];
      for (let i = 0; i < numFrames; i++) {
        const timestamp = (duration / (numFrames + 1)) * (i + 1);
        const framePath = path.join(framesDir, `frame_${i}.jpg`);

        await execAsync(`ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}" -y 2>/dev/null`);

        if (existsSync(framePath)) {
          framePaths.push(framePath);
        }
      }

      return framePaths;
    } catch (error: any) {
      console.error(`❌ [AccuracyValidator] Frame extraction failed:`, error.message);
      return [];
    }
  }

  /**
   * Clean up temporary frame files
   */
  async cleanupFrames(framePaths: string[]): Promise<void> {
    for (const fp of framePaths) {
      try {
        await fs.unlink(fp);
      } catch {}
    }

    if (framePaths.length > 0) {
      const dir = path.dirname(framePaths[0]);
      try {
        await fs.rmdir(dir);
      } catch {}
    }
  }

  /**
   * Generate a repaired prompt based on validation failures
   * Takes the original prompt and validation issues, returns an improved prompt
   */
  generateRepairedPrompt(originalPrompt: string, validationResult: ValidationResult, packageData: any): string {
    const repairs: string[] = [];
    const analysis = validationResult.analysis;

    // Era accuracy issues - add explicit period instructions
    if (validationResult.eraAccuracyScore < this.ERA_ACCURACY_MIN) {
      const eraDetails = analysis?.eraDetails;
      if (eraDetails?.incorrectElements?.length) {
        repairs.push(`CRITICAL: Remove these wrong-era elements: ${eraDetails.incorrectElements.join(', ')}`);
      }
      if (eraDetails?.suggestions?.length) {
        repairs.push(`Period correction: ${eraDetails.suggestions.join('. ')}`);
      }

      // Add explicit era context
      const deepResearch = packageData?.deepResearch || {};
      const era = deepResearch.basicInfo?.era || 'historical';
      repairs.push(`MUST use authentic ${era} period clothing, architecture, and props only`);
    }

    // Character consistency issues
    if (validationResult.characterConsistencyScore < this.CHARACTER_CONSISTENCY_MIN) {
      const charDetails = analysis?.characterDetails;
      if (charDetails?.issues?.length) {
        repairs.push(`Character fix: ${charDetails.issues.join('. ')}`);
      }
      if (charDetails?.expectedAppearance?.length) {
        repairs.push(`Character MUST have: ${charDetails.expectedAppearance.join(', ')}`);
      }
    }

    // Anachronism issues - add explicit prohibitions
    if (validationResult.anachronismScore < this.ANACHRONISM_MIN) {
      const anachronisms = analysis?.anachronisms || [];
      if (anachronisms.length > 0) {
        const items = anachronisms.map((a: any) => a.item).join(', ');
        repairs.push(`ABSOLUTELY NO: ${items}`);
        repairs.push(`NO modern items: no wristwatches, no glasses, no zippers, no plastic, no modern architecture`);
      }
    }

    // Continuity issues
    if (validationResult.continuityScore < 60) {
      const continuity = analysis?.continuity;
      if (continuity?.issues?.length) {
        repairs.push(`Scene continuity: ${continuity.issues.join('. ')}`);
      }
    }

    // Add critical issues as explicit instructions
    if (validationResult.criticalIssues?.length) {
      repairs.push(`FIX THESE: ${validationResult.criticalIssues.join('. ')}`);
    }

    // Build the repaired prompt
    if (repairs.length === 0) {
      return originalPrompt;
    }

    const repairBlock = `\n\n[ACCURACY CORRECTIONS - MUST FOLLOW]\n${repairs.join('\n')}\n[END CORRECTIONS]\n`;

    // Insert repair block after any timestamp marker or at the start
    const timestampMatch = originalPrompt.match(/\[TIMESTAMP:.*?\]/);
    if (timestampMatch) {
      const insertPos = timestampMatch.index! + timestampMatch[0].length;
      return originalPrompt.slice(0, insertPos) + repairBlock + originalPrompt.slice(insertPos);
    }

    return repairBlock + originalPrompt;
  }

  /**
   * Build historical context from package data
   */
  buildHistoricalContext(packageData: any): HistoricalContext {
    const deepResearch = packageData.deepResearch || {};
    const basicInfo = deepResearch.basicInfo || {};
    const characters = packageData.characterCast || [];
    const mainCharacter = characters[0] || {};

    return {
      figureName: basicInfo.name || mainCharacter.name || packageData.metadata?.topic || 'Unknown Figure',
      era: basicInfo.era || 'Unknown Era',
      dateRange: basicInfo.dateRange || basicInfo.lifespan || 'Unknown Dates',
      expectedAppearance: [
        ...(mainCharacter.physicalDescription || []),
        mainCharacter.vibe || '',
        basicInfo.iconicTraits || '',
      ].filter(Boolean),
      expectedClothing: [...(deepResearch.costumeDetails || []), ...(deepResearch.attireKeywords || [])].filter(
        Boolean,
      ),
      expectedSettings: [basicInfo.setting || '', ...(deepResearch.locationKeywords || [])].filter(Boolean),
      archetype: mainCharacter.archetype || mainCharacter.vibe || 'historical figure',
      age: basicInfo.ageAtDeath || basicInfo.typicalAge || undefined,
    };
  }

  /**
   * Validate a single clip against historical context
   */
  async validateClip(
    clipPath: string,
    clipIndex: number,
    jobId: string,
    packageId: string,
    packageData: any,
    previousClipContext?: PreviousClipContext,
  ): Promise<ValidationResult> {
    console.log(`\n🔍 [AccuracyValidator] Validating clip ${clipIndex + 1}...`);
    console.log(`   📹 Path: ${clipPath}`);

    if (!existsSync(clipPath)) {
      console.error(`   ❌ Clip file not found: ${clipPath}`);
      return this.createFailedResult('Clip file not found');
    }

    const context = this.buildHistoricalContext(packageData);
    console.log(`   🎭 Figure: ${context.figureName}, Era: ${context.era}`);

    const framePaths = await this.extractFrames(clipPath, this.MAX_FRAMES_TO_ANALYZE);
    if (framePaths.length === 0) {
      console.error(`   ❌ No frames extracted`);
      return this.createFailedResult('Failed to extract frames');
    }

    console.log(`   🖼️  Extracted ${framePaths.length} frames for analysis`);

    try {
      const frameDataParts = await Promise.all(
        framePaths.map(async (fp) => {
          const data = await fs.readFile(fp);
          return {
            inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' },
          };
        }),
      );

      const contextStr = `
Figure: ${context.figureName}
Era: ${context.era}
Date Range: ${context.dateRange}
Age: ${context.age || 'As depicted in historical accounts'}
Expected Appearance: ${context.expectedAppearance.join(', ') || 'Period-appropriate'}
Expected Clothing: ${context.expectedClothing.join(', ') || 'Period-appropriate attire'}
Expected Settings: ${context.expectedSettings.join(', ') || 'Historical locations'}
Archetype: ${context.archetype}`;

      const previousContextStr = previousClipContext
        ? `Previous Scene: ${previousClipContext.summary}
Previous Setting: ${previousClipContext.setting}
Character Features: ${previousClipContext.characterFeatures.join(', ')}
Mood: ${previousClipContext.mood}`
        : 'This is the first clip - no previous context.';

      const prompt = this.VALIDATION_PROMPT.replace('{CONTEXT}', contextStr).replace(
        '{PREVIOUS_CONTEXT}',
        previousContextStr,
      );

      console.log(`   🤖 Sending to Gemini Vision for analysis...`);

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      });
      const result = await model.generateContent([{ text: prompt }, ...frameDataParts]);
      const content = result.response.text();

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error(`   ❌ Failed to parse Gemini response`);
        await this.cleanupFrames(framePaths);
        return this.createFailedResult('Invalid Gemini response format');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      const weights = { era: 0.35, character: 0.3, anachronism: 0.2, continuity: 0.15 };
      const overallScore = Math.round(
        parsed.eraAccuracyScore * weights.era +
          parsed.characterConsistencyScore * weights.character +
          parsed.anachronismScore * weights.anachronism +
          parsed.continuityScore * weights.continuity,
      );

      // STRICT VALIDATION: Overall score + individual component minimums
      const passed =
        overallScore >= this.PASS_THRESHOLD &&
        parsed.eraAccuracyScore >= this.ERA_ACCURACY_MIN &&
        parsed.characterConsistencyScore >= this.CHARACTER_CONSISTENCY_MIN &&
        parsed.anachronismScore >= this.ANACHRONISM_MIN;

      console.log(
        `   📊 Scores - Era: ${parsed.eraAccuracyScore}, Character: ${parsed.characterConsistencyScore}, Anachronism: ${parsed.anachronismScore}, Continuity: ${parsed.continuityScore}`,
      );
      console.log(`   📈 Overall: ${overallScore}/100 ${passed ? '✅ PASSED' : '❌ FAILED'}`);

      // Log specific failures for strict validation
      if (!passed) {
        const failures: string[] = [];
        if (parsed.eraAccuracyScore < this.ERA_ACCURACY_MIN) {
          failures.push(`Era: ${parsed.eraAccuracyScore} < ${this.ERA_ACCURACY_MIN}`);
        }
        if (parsed.characterConsistencyScore < this.CHARACTER_CONSISTENCY_MIN) {
          failures.push(`Character: ${parsed.characterConsistencyScore} < ${this.CHARACTER_CONSISTENCY_MIN}`);
        }
        if (parsed.anachronismScore < this.ANACHRONISM_MIN) {
          failures.push(`Anachronism: ${parsed.anachronismScore} < ${this.ANACHRONISM_MIN}`);
        }
        if (overallScore < this.PASS_THRESHOLD) {
          failures.push(`Overall: ${overallScore} < ${this.PASS_THRESHOLD}`);
        }
        console.log(`   ⚠️  Failed checks: ${failures.join(', ')}`);
      }

      if (parsed.anachronisms?.length > 0) {
        console.log(`   ⚠️  Anachronisms found: ${parsed.anachronisms.map((a: any) => a.item).join(', ')}`);
      }

      await this.cleanupFrames(framePaths);

      return {
        passed,
        eraAccuracyScore: parsed.eraAccuracyScore,
        characterConsistencyScore: parsed.characterConsistencyScore,
        anachronismScore: parsed.anachronismScore,
        continuityScore: parsed.continuityScore,
        overallScore,
        analysis: {
          eraDetails: parsed.eraDetails || {
            expectedEra: context.era,
            detectedElements: [],
            correctElements: [],
            incorrectElements: [],
            suggestions: [],
          },
          characterDetails: parsed.characterDetails || {
            expectedCharacter: context.figureName,
            expectedAge: context.age || 'Unknown',
            expectedAppearance: context.expectedAppearance,
            detectedFeatures: [],
            matchScore: parsed.characterConsistencyScore,
            issues: [],
          },
          anachronisms: parsed.anachronisms || [],
          continuity: parsed.continuity || {
            previousClipSummary: previousClipContext?.summary,
            currentClipSummary: 'Analyzed',
            transitionSmooth: true,
            narrativeFlow: 'good',
            issues: [],
          },
          framesAnalyzed: framePaths.length,
          keyFrameDescriptions: parsed.keyFrameDescriptions || [],
        },
        shouldRegenerate: parsed.shouldRegenerate || false,
        criticalIssues: parsed.criticalIssues || [],
      };
    } catch (error: any) {
      console.error(`   ❌ Validation error:`, error.message);

      // Report error to monitoring system for auto-fix
      await errorMonitor.captureError(error, {
        service: 'historical-accuracy-validator',
        operation: 'validateClip',
        jobId: jobId,
        metadata: {
          clipPath: clipPath,
          figureName: context.figureName,
          era: context.era,
        },
      });

      await this.cleanupFrames(framePaths);
      return this.createFailedResult(error.message);
    }
  }

  /**
   * Create a failed validation result
   */
  private createFailedResult(reason: string): ValidationResult {
    return {
      passed: false,
      eraAccuracyScore: 0,
      characterConsistencyScore: 0,
      anachronismScore: 0,
      continuityScore: 0,
      overallScore: 0,
      analysis: {
        eraDetails: {
          expectedEra: 'Unknown',
          detectedElements: [],
          correctElements: [],
          incorrectElements: [],
          suggestions: [],
        },
        characterDetails: {
          expectedCharacter: 'Unknown',
          expectedAge: 'Unknown',
          expectedAppearance: [],
          detectedFeatures: [],
          matchScore: 0,
          issues: [reason],
        },
        anachronisms: [],
        continuity: {
          currentClipSummary: 'Validation failed',
          transitionSmooth: false,
          narrativeFlow: 'poor',
          issues: [reason],
        },
        framesAnalyzed: 0,
        keyFrameDescriptions: [],
      },
      shouldRegenerate: true,
      criticalIssues: [reason],
    };
  }

  /**
   * Save validation report to database
   */
  async saveReport(
    jobId: string,
    packageId: string,
    clipIndex: number,
    clipPath: string,
    result: ValidationResult,
    attempt: number = 1,
    isRegeneration: boolean = false,
    preScore: number | null = null,
  ): Promise<ClipAccuracyReport> {
    const report: InsertClipAccuracyReport = {
      jobId,
      packageId,
      clipIndex,
      clipPath,
      eraAccuracyScore: result.eraAccuracyScore,
      characterConsistencyScore: result.characterConsistencyScore,
      anachronismScore: result.anachronismScore,
      continuityScore: result.continuityScore,
      overallScore: result.overallScore,
      passed: result.passed,
      analysis: result.analysis,
      validationAttempt: attempt,
      regenerationRequested: result.shouldRegenerate,
      // Track regeneration history
      preRegenerationScore: isRegeneration ? preScore : result.overallScore,
      wasRegenerated: isRegeneration,
      regenerationCount: isRegeneration ? attempt - 1 : 0,
    };

    return await storage.createClipAccuracyReport(report);
  }

  /**
   * Get context from previous clip report for continuity checking
   */
  async getPreviousClipContext(jobId: string, clipIndex: number): Promise<PreviousClipContext | undefined> {
    if (clipIndex <= 0) return undefined;

    const prevReport = await storage.getPreviousClipReport(jobId, clipIndex);
    if (!prevReport || !prevReport.analysis) return undefined;

    const analysis = prevReport.analysis as any;
    return {
      summary: analysis.continuity?.currentClipSummary || 'Previous scene',
      characterFeatures: analysis.characterDetails?.detectedFeatures || [],
      setting: analysis.eraDetails?.detectedElements?.[0] || 'Historical setting',
      mood: analysis.continuity?.narrativeFlow || 'good',
    };
  }

  /**
   * Get all reports for a job
   */
  async getJobReports(jobId: string): Promise<ClipAccuracyReport[]> {
    return await storage.getClipAccuracyReports(jobId);
  }

  /**
   * Calculate job-wide accuracy summary
   */
  async getJobAccuracySummary(jobId: string): Promise<{
    totalClips: number;
    passedClips: number;
    failedClips: number;
    averageScore: number;
    criticalIssues: string[];
    recommendations: string[];
  }> {
    const reports = await this.getJobReports(jobId);

    if (reports.length === 0) {
      return {
        totalClips: 0,
        passedClips: 0,
        failedClips: 0,
        averageScore: 0,
        criticalIssues: [],
        recommendations: [],
      };
    }

    const passedClips = reports.filter((r) => r.passed).length;
    const averageScore = Math.round(reports.reduce((sum, r) => sum + r.overallScore, 0) / reports.length);

    const allCriticalIssues: string[] = [];
    const allAnachronisms: string[] = [];

    for (const report of reports) {
      const analysis = report.analysis as any;
      if (analysis?.anachronisms) {
        for (const a of analysis.anachronisms) {
          if (a.severity === 'critical') {
            allCriticalIssues.push(`Clip ${report.clipIndex + 1}: ${a.item}`);
          }
          allAnachronisms.push(a.item);
        }
      }
    }

    const recommendations: string[] = [];
    if (averageScore < 70) {
      recommendations.push('Consider regenerating clips with more specific era constraints');
    }
    if (allAnachronisms.length > 0) {
      const uniqueAnachronisms = [...new Set(allAnachronisms)];
      recommendations.push(`Add to negative prompts: ${uniqueAnachronisms.slice(0, 5).join(', ')}`);
    }

    return {
      totalClips: reports.length,
      passedClips,
      failedClips: reports.length - passedClips,
      averageScore,
      criticalIssues: allCriticalIssues,
      recommendations,
    };
  }
}

export const historicalAccuracyValidator = new HistoricalAccuracyValidatorService();
