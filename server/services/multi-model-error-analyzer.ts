/**
 * MULTI-MODEL ERROR ANALYZER
 *
 * Uses Gemini 2.5 Flash and Gemini 2.5 Pro in parallel to analyze errors.
 * Each model provides independent analysis, then consensus is reached.
 *
 * Benefits:
 * - 2x faster (parallel analysis instead of sequential)
 * - Multiple perspectives on the same error
 * - Cross-validation of solutions
 * - Higher confidence in recommendations
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ErrorReport } from './error-monitor';

interface ModelAnalysis {
  model: 'gemini-2.5-flash' | 'gemini-2.5-pro';
  rootCause: string;
  suggestedFix: {
    description: string;
    codeChanges: Array<{
      file: string;
      oldCode: string;
      newCode: string;
      reasoning: string;
    }>;
    testPlan: string[];
  };
  confidence: number;
  reasoning: string;
  analysisTime: number;
}

interface ConsensusAnalysis {
  agreedRootCause: string;
  bestFix: {
    description: string;
    codeChanges: Array<{
      file: string;
      oldCode: string;
      newCode: string;
      reasoning: string;
      agreeingModels: string[];
    }>;
    testPlan: string[];
  };
  modelAnalyses: ModelAnalysis[];
  consensusConfidence: number;
  totalAnalysisTime: number;
}

class MultiModelErrorAnalyzer {
  private gemini: GoogleGenerativeAI | null = null;
  private initialized = false;

  constructor() {
    // Lazy initialization - API clients created on first use
    // This allows secrets to be loaded before initialization
  }

  /**
   * Initialize API clients (lazy loaded after secrets are available)
   */
  private ensureInitialized() {
    if (this.initialized) return;

    // Initialize Gemini (used for both flash and pro models)
    const geminiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (geminiKey) {
      this.gemini = new GoogleGenerativeAI(geminiKey);
      console.log('[Multi-Model] ✅ Gemini initialized (2.5-flash + 2.5-pro)');
    }

    this.initialized = true;
  }

  /**
   * Analyze error using all available models in parallel
   */
  async analyzeError(errorReport: ErrorReport): Promise<ConsensusAnalysis> {
    this.ensureInitialized();
    const startTime = Date.now();
    console.log('[Multi-Model Analyzer] Starting parallel analysis with 2 models...');

    // Run both Gemini models in parallel for independent perspectives
    const analyses = await Promise.allSettled([
      this.analyzeWithGeminiFlash(errorReport),
      this.analyzeWithGeminiPro(errorReport),
    ]);

    // Extract successful analyses
    const modelAnalyses: ModelAnalysis[] = analyses
      .filter((result): result is PromiseFulfilledResult<ModelAnalysis> => result.status === 'fulfilled')
      .map((result) => result.value);

    const totalTime = Date.now() - startTime;

    console.log(`[Multi-Model Analyzer] Completed in ${totalTime}ms:`);
    console.log(`  - Gemini 2.5 Flash: ${analyses[0].status === 'fulfilled' ? '✅' : '❌'}`);
    console.log(`  - Gemini 2.5 Pro: ${analyses[1].status === 'fulfilled' ? '✅' : '❌'}`);

    // Build consensus
    const consensus = this.buildConsensus(modelAnalyses, totalTime);

    return consensus;
  }

  /**
   * Analyze with Gemini 2.5 Flash (fast first pass)
   */
  private async analyzeWithGeminiFlash(errorReport: ErrorReport): Promise<ModelAnalysis> {
    if (!this.gemini) {
      throw new Error('Gemini not configured');
    }

    const startTime = Date.now();

    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `You are an expert debugging assistant. Analyze this error and provide a specific, actionable fix in JSON format:

${this.buildPrompt(errorReport)}

Output JSON with: rootCause, suggestedFix (description, codeChanges array, testPlan array), confidence (0-1), reasoning`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from markdown code block if present
    let jsonText = text;
    if (text.includes('```json')) {
      jsonText = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      jsonText = text.split('```')[1].split('```')[0].trim();
    }

    const content = JSON.parse(jsonText);
    const analysisTime = Date.now() - startTime;

    return {
      model: 'gemini-2.5-flash',
      rootCause: content.rootCause,
      suggestedFix: content.suggestedFix,
      confidence: content.confidence,
      reasoning: content.reasoning,
      analysisTime,
    };
  }

  /**
   * Analyze with Gemini 2.5 Pro (deep analysis)
   */
  private async analyzeWithGeminiPro(errorReport: ErrorReport): Promise<ModelAnalysis> {
    if (!this.gemini) {
      throw new Error('Gemini not configured');
    }

    const startTime = Date.now();

    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const prompt = `You are an expert debugging assistant. Analyze this error and provide a specific, actionable fix in JSON format:

${this.buildPrompt(errorReport)}

Output JSON format:
{
  "rootCause": "What actually caused this error",
  "suggestedFix": {
    "description": "What to do to fix it",
    "codeChanges": [{"file": "path.ts", "oldCode": "...", "newCode": "...", "reasoning": "..."}],
    "testPlan": ["step 1", "step 2"]
  },
  "confidence": 0.85,
  "reasoning": "Why this is the right fix"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Extract JSON from markdown code block if present
    let jsonText = text;
    if (text.includes('```json')) {
      jsonText = text.split('```json')[1].split('```')[0].trim();
    } else if (text.includes('```')) {
      jsonText = text.split('```')[1].split('```')[0].trim();
    }

    const content = JSON.parse(jsonText);
    const analysisTime = Date.now() - startTime;

    return {
      model: 'gemini-2.5-pro',
      rootCause: content.rootCause,
      suggestedFix: content.suggestedFix,
      confidence: content.confidence,
      reasoning: content.reasoning,
      analysisTime,
    };
  }

  /**
   * Build consensus from multiple model analyses
   */
  private buildConsensus(analyses: ModelAnalysis[], totalTime: number): ConsensusAnalysis {
    if (analyses.length === 0) {
      throw new Error('No successful analyses to build consensus from');
    }

    // Find most common root cause
    const rootCauses = analyses.map((a) => a.rootCause.toLowerCase());
    const agreedRootCause = this.findMostSimilar(rootCauses, analyses);

    // Combine code changes and track which models agree
    const codeChangeMap = new Map<
      string,
      Array<{
        change: any;
        models: string[];
        confidence: number;
      }>
    >();

    for (const analysis of analyses) {
      for (const change of analysis.suggestedFix.codeChanges) {
        const key = `${change.file}:${change.reasoning}`;
        const existing = codeChangeMap.get(key);

        if (existing) {
          existing[0].models.push(analysis.model);
          existing[0].confidence = Math.max(existing[0].confidence, analysis.confidence);
        } else {
          codeChangeMap.set(key, [
            {
              change,
              models: [analysis.model],
              confidence: analysis.confidence,
            },
          ]);
        }
      }
    }

    // Pick best code changes (those with multiple models agreeing or highest confidence)
    const bestChanges = Array.from(codeChangeMap.values())
      .sort((a, b) => {
        const aScore = a[0].models.length * 10 + a[0].confidence;
        const bScore = b[0].models.length * 10 + b[0].confidence;
        return bScore - aScore;
      })
      .slice(0, 5) // Top 5 changes
      .map((item) => ({
        file: item[0].change.file,
        oldCode: item[0].change.oldCode,
        newCode: item[0].change.newCode,
        reasoning: item[0].change.reasoning,
        agreeingModels: item[0].models,
      }));

    // Combine test plans
    const allTestSteps = new Set<string>();
    for (const analysis of analyses) {
      for (const step of analysis.suggestedFix.testPlan) {
        allTestSteps.add(step);
      }
    }

    // Calculate consensus confidence (average of all models)
    const consensusConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;

    // Find best description (from highest confidence model)
    const bestAnalysis = analyses.sort((a, b) => b.confidence - a.confidence)[0];

    return {
      agreedRootCause,
      bestFix: {
        description: bestAnalysis.suggestedFix.description,
        codeChanges: bestChanges,
        testPlan: Array.from(allTestSteps),
      },
      modelAnalyses: analyses,
      consensusConfidence,
      totalAnalysisTime: totalTime,
    };
  }

  /**
   * Find most similar root cause among analyses
   */
  private findMostSimilar(causes: string[], analyses: ModelAnalysis[]): string {
    // Simple approach: return the one from highest confidence model
    const sorted = [...analyses].sort((a, b) => b.confidence - a.confidence);
    return sorted[0].rootCause;
  }

  /**
   * Build analysis prompt
   */
  private buildPrompt(errorReport: ErrorReport): string {
    return `
ERROR DETAILS:
Type: ${errorReport.errorType}
Message: ${errorReport.errorMessage}
Severity: ${errorReport.severity}
Service: ${errorReport.context.service}
Operation: ${errorReport.context.operation}
${errorReport.context.jobId ? `Job ID: ${errorReport.context.jobId}` : ''}

${
  errorReport.context.stackTrace
    ? `
STACK TRACE:
${errorReport.context.stackTrace.substring(0, 1500)}
`
    : ''
}

${
  errorReport.context.metadata
    ? `
METADATA:
${JSON.stringify(errorReport.context.metadata, null, 2)}
`
    : ''
}

TASK:
1. Identify the root cause (be very specific)
2. Suggest concrete code changes to fix it
3. Provide a test plan to verify the fix
4. Rate your confidence (0.0-1.0)
5. Explain your reasoning

Be extremely specific with file paths and code changes. The fix needs to be directly applicable.
`;
  }

  /**
   * Get available models count
   */
  getAvailableModels(): string[] {
    this.ensureInitialized();
    const models: string[] = [];
    if (this.gemini) {
      models.push('gemini-2.5-flash');
      models.push('gemini-2.5-pro');
    }
    return models;
  }
}

// Export singleton
export const multiModelErrorAnalyzer = new MultiModelErrorAnalyzer();
