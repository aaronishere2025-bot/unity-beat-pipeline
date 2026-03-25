/**
 * Lyrics Quality Validator Service
 *
 * Uses GPT-4o to validate lyrics quality on multiple criteria:
 * 1. Grammar and spelling (0-20 points)
 * 2. Rhyme scheme consistency (0-20 points)
 * 3. Flow and rhythm (0-20 points)
 * 4. Coherence and storytelling (0-20 points)
 * 5. Appropriateness (no offensive content) (0-20 points)
 *
 * Returns a score 0-100 with specific feedback for improvements.
 * Integrated into unity-content-generator.ts to ensure high-quality lyrics before audio generation.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { apiCostTracker } from './api-cost-tracker';
import { errorMonitor } from './error-monitor';

let gemini: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Gemini API key not available');
    }
    gemini = new GoogleGenerativeAI(apiKey);
  }
  return gemini;
}

// ============================================
// TYPES
// ============================================

export interface LyricsValidationCriteria {
  grammarScore: number; // 0-20
  rhymeScore: number; // 0-20
  flowScore: number; // 0-20
  coherenceScore: number; // 0-20
  appropriatenessScore: number; // 0-20
}

export interface LyricsValidationFeedback {
  grammarIssues: string[];
  rhymeIssues: string[];
  flowIssues: string[];
  coherenceIssues: string[];
  appropriatenessIssues: string[];
  suggestions: string[];
}

export interface LyricsValidationResult {
  passed: boolean; // true if score >= 70
  overallScore: number; // 0-100
  criteria: LyricsValidationCriteria;
  feedback: LyricsValidationFeedback;
  shouldRegenerate: boolean;
  criticalIssues: string[];
}

export interface LyricsValidationContext {
  topic: string;
  message: string;
  targetDuration: number;
  bpm: number;
  structure?: string; // e.g., "intro-verse-chorus-verse-chorus-bridge-outro"
  deepResearch?: any; // Historical research context if available
  isHistorical?: boolean;
}

// ============================================
// VALIDATION SERVICE
// ============================================

class LyricsQualityValidatorService {
  private readonly PASS_THRESHOLD = 70; // Minimum score to pass
  private readonly MAX_REGENERATION_ATTEMPTS = 3;

  private readonly VALIDATION_PROMPT = `You are an expert rap/hip-hop lyrics quality validator and creative writing coach.

Analyze the provided lyrics against these 5 criteria, scoring each out of 20 points:

## SCORING CRITERIA

### 1. GRAMMAR AND SPELLING (0-20 points)
- Are words spelled correctly?
- Is punctuation used properly?
- Are there any typos or obvious errors?
- Is capitalization appropriate?
Score: 20 = Perfect grammar, 15+ = Minor issues, 10-14 = Several errors, <10 = Major problems

### 2. RHYME SCHEME CONSISTENCY (0-20 points)
- Is there a clear, consistent rhyme pattern?
- Do the rhymes feel natural or forced?
- Are multi-syllable rhymes used effectively?
- Does the rhyme scheme match the intended style?
Score: 20 = Sophisticated rhyme scheme, 15+ = Good consistency, 10-14 = Weak rhymes, <10 = No clear scheme

### 3. FLOW AND RHYTHM (0-20 points)
- Do the syllables fit the intended BPM and structure?
- Are lines balanced in length and pacing?
- Is there natural emphasis on key words?
- Would this be easy to rap/perform?
Score: 20 = Perfect flow, 15+ = Good rhythm, 10-14 = Awkward in places, <10 = Unrappable

### 4. COHERENCE AND STORYTELLING (0-20 points)
- Is there a clear narrative or message?
- Do verses connect logically?
- Is the topic explored meaningfully?
- Does the song have emotional impact?
Score: 20 = Compelling story, 15+ = Clear message, 10-14 = Somewhat disjointed, <10 = Confusing

### 5. APPROPRIATENESS (0-20 points)
- Is content free of gratuitous violence, hate speech, or offensive slurs?
- Is any mature content contextually justified?
- Would this be suitable for YouTube/general audiences?
- Are historical/educational topics handled respectfully?
Score: 20 = Fully appropriate, 15+ = Minor concerns, 10-14 = Questionable content, <10 = Inappropriate

## CONTEXT
{CONTEXT}

## LYRICS TO VALIDATE
{LYRICS}

## RESPONSE FORMAT
Respond in this EXACT JSON format (no additional text):

{
  "grammarScore": <0-20>,
  "rhymeScore": <0-20>,
  "flowScore": <0-20>,
  "coherenceScore": <0-20>,
  "appropriatenessScore": <0-20>,
  "overallScore": <0-100>,
  "grammarIssues": ["<specific issue>", ...],
  "rhymeIssues": ["<specific issue>", ...],
  "flowIssues": ["<specific issue>", ...],
  "coherenceIssues": ["<specific issue>", ...],
  "appropriatenessIssues": ["<specific issue>", ...],
  "suggestions": [
    "<actionable improvement suggestion>",
    ...
  ],
  "criticalIssues": ["<any deal-breaker problems>"],
  "shouldRegenerate": true|false
}`;

  /**
   * Validate lyrics quality using GPT-4o
   */
  async validateLyrics(
    lyrics: string,
    context: LyricsValidationContext,
    jobId?: string,
  ): Promise<LyricsValidationResult> {
    console.log(`\n🎵 [LyricsValidator] Validating lyrics quality...`);
    console.log(`   📝 Topic: ${context.topic}`);
    console.log(`   🎼 BPM: ${context.bpm}, Duration: ${context.targetDuration}s`);

    if (!lyrics || lyrics.trim().length === 0) {
      console.error(`   ❌ Empty lyrics provided`);
      return this.createFailedResult('No lyrics provided');
    }

    try {
      // Build context string
      const contextStr = this.buildContextString(context);

      // Build the prompt
      const prompt = this.VALIDATION_PROMPT.replace('{CONTEXT}', contextStr).replace('{LYRICS}', lyrics);

      console.log(`   🤖 Sending to Gemini for validation...`);

      const gemini = getGemini();
      const model = gemini.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500,
          responseMimeType: 'application/json',
        },
      });

      const fullPrompt = `You are an expert rap/hip-hop lyrics quality validator. Respond only with valid JSON.

${prompt}`;

      const response = await model.generateContent(fullPrompt);
      const text = response.response.text();

      // Track cost (Gemini is much cheaper than GPT-4o)
      const usage = response.response.usageMetadata;
      if (usage) {
        await apiCostTracker.trackOpenAI({
          model: 'gemini-2.5-flash',
          operation: 'lyrics_quality_validation',
          inputTokens: usage.promptTokenCount || 0,
          outputTokens: usage.candidatesTokenCount || 0,
          jobId,
          metadata: {
            topic: context.topic,
            lyricsLength: lyrics.length,
          },
        });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Try to extract JSON from markdown code blocks
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          console.error(`   ❌ Failed to parse Gemini response as JSON`);
          return this.createFailedResult('Failed to parse validation response');
        }
      }

      // Validate the response has all required fields
      if (!this.isValidResponse(parsed)) {
        console.error(`   ❌ Invalid response format from Gemini`);
        return this.createFailedResult('Invalid validation response format');
      }

      const overallScore =
        parsed.grammarScore +
        parsed.rhymeScore +
        parsed.flowScore +
        parsed.coherenceScore +
        parsed.appropriatenessScore;

      const passed = overallScore >= this.PASS_THRESHOLD;

      console.log(`   📊 Scores:`);
      console.log(`      Grammar: ${parsed.grammarScore}/20`);
      console.log(`      Rhyme: ${parsed.rhymeScore}/20`);
      console.log(`      Flow: ${parsed.flowScore}/20`);
      console.log(`      Coherence: ${parsed.coherenceScore}/20`);
      console.log(`      Appropriateness: ${parsed.appropriatenessScore}/20`);
      console.log(`   📈 Overall: ${overallScore}/100 ${passed ? '✅ PASSED' : '❌ FAILED'}`);

      if (parsed.criticalIssues && parsed.criticalIssues.length > 0) {
        console.log(`   ⚠️  Critical issues: ${parsed.criticalIssues.join(', ')}`);
      }

      return {
        passed,
        overallScore,
        criteria: {
          grammarScore: parsed.grammarScore,
          rhymeScore: parsed.rhymeScore,
          flowScore: parsed.flowScore,
          coherenceScore: parsed.coherenceScore,
          appropriatenessScore: parsed.appropriatenessScore,
        },
        feedback: {
          grammarIssues: parsed.grammarIssues || [],
          rhymeIssues: parsed.rhymeIssues || [],
          flowIssues: parsed.flowIssues || [],
          coherenceIssues: parsed.coherenceIssues || [],
          appropriatenessIssues: parsed.appropriatenessIssues || [],
          suggestions: parsed.suggestions || [],
        },
        shouldRegenerate: parsed.shouldRegenerate || false,
        criticalIssues: parsed.criticalIssues || [],
      };
    } catch (error: any) {
      console.error(`   ❌ Validation error:`, error.message);

      // Report error to monitoring system for auto-fix
      await errorMonitor.captureError(error, {
        service: 'lyrics-quality-validator',
        operation: 'validateLyrics',
        jobId,
        metadata: {
          topic: context.topic,
          lyricsLength: lyrics.length,
        },
      });

      return this.createFailedResult(error.message);
    }
  }

  /**
   * Generate improved lyrics based on validation feedback
   */
  generateImprovementInstructions(result: LyricsValidationResult): string {
    const instructions: string[] = [];

    if (result.criteria.grammarScore < 15) {
      instructions.push(`GRAMMAR FIXES NEEDED:\n${result.feedback.grammarIssues.map((i) => `  - ${i}`).join('\n')}`);
    }

    if (result.criteria.rhymeScore < 15) {
      instructions.push(`RHYME SCHEME IMPROVEMENTS:\n${result.feedback.rhymeIssues.map((i) => `  - ${i}`).join('\n')}`);
    }

    if (result.criteria.flowScore < 15) {
      instructions.push(`FLOW AND RHYTHM FIXES:\n${result.feedback.flowIssues.map((i) => `  - ${i}`).join('\n')}`);
    }

    if (result.criteria.coherenceScore < 15) {
      instructions.push(
        `STORYTELLING IMPROVEMENTS:\n${result.feedback.coherenceIssues.map((i) => `  - ${i}`).join('\n')}`,
      );
    }

    if (result.criteria.appropriatenessScore < 18) {
      instructions.push(
        `CONTENT APPROPRIATENESS:\n${result.feedback.appropriatenessIssues.map((i) => `  - ${i}`).join('\n')}`,
      );
    }

    if (result.feedback.suggestions.length > 0) {
      instructions.push(`GENERAL SUGGESTIONS:\n${result.feedback.suggestions.map((s) => `  - ${s}`).join('\n')}`);
    }

    if (result.criticalIssues.length > 0) {
      instructions.push(`CRITICAL ISSUES (MUST FIX):\n${result.criticalIssues.map((i) => `  - ${i}`).join('\n')}`);
    }

    return instructions.length > 0
      ? `\n[LYRICS QUALITY IMPROVEMENTS NEEDED]\n${instructions.join('\n\n')}\n[END IMPROVEMENTS]\n`
      : '';
  }

  /**
   * Build context string from validation context
   */
  private buildContextString(context: LyricsValidationContext): string {
    const parts: string[] = [];

    parts.push(`Topic: ${context.topic}`);
    parts.push(`Message/Theme: ${context.message}`);
    parts.push(`Target Duration: ${context.targetDuration} seconds`);
    parts.push(`BPM: ${context.bpm}`);

    if (context.structure) {
      parts.push(`Song Structure: ${context.structure}`);
    }

    if (context.isHistorical && context.deepResearch) {
      const research = context.deepResearch;
      parts.push(`\nHistorical Context:`);
      parts.push(`  - Figure: ${research.basicInfo?.fullName || 'Historical figure'}`);
      parts.push(`  - Era: ${research.basicInfo?.lived || 'Historical period'}`);
      parts.push(`  - Style: Documentary/educational rap`);
      parts.push(`  - Perspective: First person (the figure telling their story)`);
    }

    return parts.join('\n');
  }

  /**
   * Validate that GPT-4o response has all required fields
   */
  private isValidResponse(parsed: any): boolean {
    return (
      typeof parsed === 'object' &&
      typeof parsed.grammarScore === 'number' &&
      typeof parsed.rhymeScore === 'number' &&
      typeof parsed.flowScore === 'number' &&
      typeof parsed.coherenceScore === 'number' &&
      typeof parsed.appropriatenessScore === 'number' &&
      Array.isArray(parsed.grammarIssues) &&
      Array.isArray(parsed.rhymeIssues) &&
      Array.isArray(parsed.flowIssues) &&
      Array.isArray(parsed.coherenceIssues) &&
      Array.isArray(parsed.appropriatenessIssues) &&
      Array.isArray(parsed.suggestions)
    );
  }

  /**
   * Create a failed validation result
   */
  private createFailedResult(reason: string): LyricsValidationResult {
    return {
      passed: false,
      overallScore: 0,
      criteria: {
        grammarScore: 0,
        rhymeScore: 0,
        flowScore: 0,
        coherenceScore: 0,
        appropriatenessScore: 0,
      },
      feedback: {
        grammarIssues: [reason],
        rhymeIssues: [],
        flowIssues: [],
        coherenceIssues: [],
        appropriatenessIssues: [],
        suggestions: [],
      },
      shouldRegenerate: true,
      criticalIssues: [reason],
    };
  }

  /**
   * Get validation summary for logging/display
   */
  getValidationSummary(result: LyricsValidationResult): string {
    const lines: string[] = [];

    lines.push(`\n📊 LYRICS QUALITY VALIDATION SUMMARY`);
    lines.push(`   Overall Score: ${result.overallScore}/100 ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push(`   Grammar: ${result.criteria.grammarScore}/20`);
    lines.push(`   Rhyme: ${result.criteria.rhymeScore}/20`);
    lines.push(`   Flow: ${result.criteria.flowScore}/20`);
    lines.push(`   Coherence: ${result.criteria.coherenceScore}/20`);
    lines.push(`   Appropriateness: ${result.criteria.appropriatenessScore}/20`);

    if (result.criticalIssues.length > 0) {
      lines.push(`\n   ⚠️  Critical Issues:`);
      result.criticalIssues.forEach((issue) => {
        lines.push(`      - ${issue}`);
      });
    }

    if (result.feedback.suggestions.length > 0) {
      lines.push(`\n   💡 Suggestions:`);
      result.feedback.suggestions.slice(0, 3).forEach((suggestion) => {
        lines.push(`      - ${suggestion}`);
      });
    }

    return lines.join('\n');
  }
}

export const lyricsQualityValidator = new LyricsQualityValidatorService();
