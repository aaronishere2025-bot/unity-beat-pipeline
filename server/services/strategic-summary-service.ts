/**
 * Strategic Summary Service - "Ask Studio" Style Nightly Analysis
 *
 * Runs automatically at 9pm CST daily to generate a plain-English strategic summary
 * of system performance, winners vs. losers, and actionable recommendations.
 *
 * ENHANCED: Uses triple-model consensus (GPT-4o + Gemini + Claude) for higher quality insights.
 * All models analyze independently, then a Master Evaluator synthesizes consensus.
 *
 * TREND-WATCHER INTEGRATION: Incorporates external market signals (Google Trends + YouTube)
 * to detect style/topic shifts before they impact performance.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';
import { db } from '../db';
import { trendWatcherAgentService } from './trend-watcher-agent';
import {
  strategicSummaries,
  unityContentPackages,
  lyricPatternStats,
  audioPatternStats,
  postingTimeArms,
  styleBanditArms,
  detailedVideoMetrics,
  audioDna,
  visualAnalysis,
} from '@shared/schema';
import { desc, eq, gte, sql } from 'drizzle-orm';
import { apiCostTracker } from './api-cost-tracker';

// ============================================================================
// CO-REASONING DIRECTOR - Modal Expert Definitions
// Each model specializes in a different aspect of video production analysis
// ============================================================================

const MODAL_EXPERTS = {
  gpt4o: {
    role: 'Visual Motion Expert',
    focus: 'Camera movements, action choreography, visual pacing, cinematic techniques',
    priorityAreas: ['motion', 'cinematography', 'visual_impact'],
  },
  gemini: {
    role: 'Narrative Continuity Expert',
    focus: 'Character consistency, story logic, temporal coherence, plot flow',
    priorityAreas: ['continuity', 'narrative', 'consistency'],
  },
  claude: {
    role: 'Technical Cinematography Expert',
    focus: 'Era accuracy, historical authenticity, production quality, detail verification',
    priorityAreas: ['accuracy', 'authenticity', 'quality'],
  },
} as const;

interface ModalExpertInsight {
  expert: keyof typeof MODAL_EXPERTS;
  role: string;
  insights: string[];
  priorityFeedback: Record<string, string>;
  confidence: number;
  warnings: string[];
}

interface CoReasoningDirective {
  unifiedDirective: string;
  expertInsights: ModalExpertInsight[];
  synthesizedRecommendations: string[];
  expertWeights: { gpt4o: number; gemini: number; claude: number };
  videoTypeClassification: 'action-heavy' | 'story-heavy' | 'historical' | 'balanced';
  confidence: number;
}

interface ClipFeedback {
  clipIndex: number;
  prompt: string;
  expertFeedback: {
    gpt4o: { areas: Record<string, string>; confidence: number };
    gemini: { areas: Record<string, string>; confidence: number };
    claude: { areas: Record<string, string>; confidence: number };
  };
  unifiedSuggestion: string;
}

interface ModalExpertFeedbackResult {
  clipFeedback: ClipFeedback[];
  overallAnalysis: {
    motionScore: number;
    narrativeScore: number;
    authenticityScore: number;
  };
  topIssues: string[];
  recommendations: string[];
}

let _geminiGenAI: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_geminiGenAI) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _geminiGenAI = new GoogleGenerativeAI(apiKey);
  }
  return _geminiGenAI;
}

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: '',
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

// Claude removed - all calls now routed to Gemini for cost savings

interface ModelAnalysis {
  model: 'gpt-4o' | 'gemini' | 'claude';
  executiveSummary: string;
  winners: { item: string; metric: string; insight: string }[];
  losers: { item: string; metric: string; insight: string }[];
  themeInsight: string;
  lyricInsight: string;
  audioInsight: string;
  thumbnailInsight: string;
  postingTimeInsight: string;
  recommendations: string[];
  warnings: string[];
  confidenceLevel: string;
}

// Export types for external use
export type { ModelAnalysis, ModalExpertInsight, CoReasoningDirective, ClipFeedback, ModalExpertFeedbackResult };

export interface StrategicSummary {
  id: string;
  generatedAt: Date;

  executiveSummary: string;
  winnersAndLosers: {
    winners: { item: string; metric: string; insight: string }[];
    losers: { item: string; metric: string; insight: string }[];
  };

  patternInsights: {
    themes: string;
    lyrics: string;
    audio: string;
    thumbnails: string;
    postingTimes: string;
  };

  recommendations: string[];
  warnings: string[];

  costsBreakdown: {
    total: number;
    byService: { service: string; cost: number }[];
  };

  // Consensus metadata
  consensus: {
    status: 'CONSENSUS' | 'DIVERGENT' | 'SINGLE_MODEL';
    gptConfidence: string;
    geminiConfidence: string;
    claudeConfidence?: string;
    agreementScore: number; // 0-100
    divergences: string[];
  };

  rawData: any;
}

class StrategicSummaryService {
  private readonly GPT_MODEL = 'gpt-4o'; // Fixed: was 'gpt-4o' which doesn't exist
  private readonly GPT_MINI_MODEL = 'gpt-4o-mini';
  private readonly GEMINI_MODEL = 'gemini-2.5-flash'; // Fixed: was 'gemini-2.5-flash' which doesn't exist

  /**
   * Generate nightly strategic summary with triple-model consensus
   * Architecture: GPT-4o (Creative Strategist) + Gemini (Pattern Analyst) + Claude Opus 4.5 (Content Strategist) + GPT-4o-mini (Consensus Judge)
   */
  async generateNightlySummary(): Promise<StrategicSummary> {
    console.log(`🌙 [Strategic Summary] Starting triple-model consensus analysis...`);
    console.log(`   🎭 GPT-4o = Creative Strategist (Hooks & Psychology)`);
    console.log(`   🔬 Gemini = Pattern Analyst (Technical SEO & Retention)`);
    console.log(`   🧠 Claude Sonnet 4.5 = Content Strategist (Narrative & Authenticity)`);

    const rawData = await this.gatherSystemData();

    // Run all three models in parallel with specialized prompts
    console.log(`   🔄 Running GPT-4o, Gemini, and Claude in parallel...`);
    const [gptAnalysis, geminiAnalysis, claudeAnalysis] = await Promise.all([
      this.callGPT4oCreativeStrategist(rawData),
      this.callGeminiPatternAnalyst(rawData),
      this.callClaudeContentStrategist(rawData),
    ]);

    // Parse all three analyses
    const gptParsed = this.parseModelResponse(gptAnalysis, 'gpt-4o');
    const geminiParsed = this.parseModelResponse(geminiAnalysis, 'gemini');
    const claudeParsed = this.parseModelResponse(claudeAnalysis, 'claude');

    // Step 4: GPT-4o-mini as Consensus Judge to synthesize final directive
    console.log(`   ⚖️ GPT-4o-mini Consensus Judge synthesizing triple-model consensus...`);
    const consensus = await this.consensusJudge(gptParsed, geminiParsed, rawData, claudeParsed);

    await this.saveSummary(consensus);

    console.log(
      `✅ [Strategic Summary] Triple-model consensus complete (agreement: ${consensus.consensus.agreementScore}%)`,
    );

    // Auto-apply consensus to system components (close the feedback loop)
    try {
      const { consensusApplierService } = await import('./consensus-applier-service');
      console.log(`🔄 [Strategic Summary] Auto-applying consensus to system...`);
      const applyResult = await consensusApplierService.applyLatestConsensus();
      console.log(`   ✅ Applied ${applyResult.applied} directives to bandits/priorities`);
    } catch (applyError: any) {
      console.warn(`   ⚠️ Auto-apply failed (non-critical):`, applyError.message);
    }

    // Auto-pilot: Apply system configuration changes based on insights
    try {
      const { analyticsAutoPilotService } = await import('./analytics-autopilot-service');
      const config = analyticsAutoPilotService.getConfig();
      if (config.enabled) {
        console.log(`🤖 [Strategic Summary] Auto-pilot enabled, applying system changes...`);
        const autoPilotResult = await analyticsAutoPilotService.applyAutoPilot();
        console.log(
          `   ✅ Auto-pilot applied: style=${autoPilotResult.config.forcedStyle || 'none'}, time=${autoPilotResult.config.forcedPostingTime || 'none'}`,
        );
      } else {
        console.log(`   ℹ️ Auto-pilot disabled, skipping system changes`);
      }
    } catch (autoPilotError: any) {
      console.warn(`   ⚠️ Auto-pilot failed (non-critical):`, autoPilotError.message);
    }

    return consensus;
  }

  /**
   * GPT-4o as "Creative Strategist" - focuses on hooks, psychology, and emotional triggers
   */
  private async callGPT4oCreativeStrategist(rawData: any): Promise<string> {
    const prompt = `You are a VIRAL GROWTH STRATEGIST specializing in psychological "hooks" and emotional triggers.

## YOUR ROLE
Analyze this YouTube analytics data to identify:
1. What EMOTIONAL HOOKS are driving the highest CTR (Click-Through Rate)
2. Which TITLE PSYCHOLOGY patterns work best (curiosity gaps, controversy, relatability)
3. Which THUMBNAIL emotional expressions perform best
4. What STORY ARCS in content drive engagement

## RAW DATA
\`\`\`json
${JSON.stringify(rawData, null, 2)}
\`\`\`

## RESPOND IN JSON FORMAT:
{
  "executiveSummary": "2-3 sentences about the PSYCHOLOGICAL trends driving growth",
  "winners": [{"item": "name", "metric": "CTR/views", "insight": "WHY it hooks viewers psychologically"}],
  "losers": [{"item": "name", "metric": "CTR/views", "insight": "WHY it fails to hook viewers"}],
  "themeInsight": "Which historical themes create the strongest emotional connection",
  "lyricInsight": "Which lyric patterns trigger the most engagement (first-person, aggression, etc)",
  "audioInsight": "How music energy/tempo affects viewer psychology",
  "thumbnailInsight": "Which visual emotions (anger, triumph, mystery) perform best",
  "postingTimeInsight": "When audiences are most receptive to emotional content",
  "recommendations": ["3-5 specific creative/psychological recommendations"],
  "warnings": ["Psychological patterns that are declining"],
  "confidenceLevel": "high/medium/low"
}`;

    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
        systemInstruction: 'You are an expert in viral psychology and YouTube growth hooks.',
      });

      const result = await model.generateContent(prompt);
      const text = result.response.text();

      await apiCostTracker.trackGemini({
        model: 'gemini-2.5-flash',
        operation: 'strategic_summary_gemini_creative',
        inputTokens: prompt.length / 4,
        outputTokens: text.length / 4,
      });

      return text || '{}';
    } catch (error: any) {
      console.error(`❌ [Strategic Summary] Gemini Creative error:`, error.message);
      return '{}';
    }
  }

  /**
   * Gemini as "Pattern Analyst" - focuses on technical SEO, retention patterns, and Google ecosystem
   */
  private async callGeminiPatternAnalyst(rawData: any): Promise<string> {
    const prompt = `You are a YOUTUBE SEARCH ENGINEER and RETENTION ANALYST working for Google.

## YOUR ROLE
Analyze this YouTube analytics data for TECHNICAL OPTIMIZATION:
1. RETENTION CURVES: Where are the major drop-off points? What causes them?
2. SEO METADATA: Which titles/descriptions are ranking well in YouTube search?
3. ALGORITHMIC SIGNALS: What patterns does YouTube's recommendation system favor?
4. WATCH TIME OPTIMIZATION: How to maximize total minutes watched

## RAW DATA
\`\`\`json
${JSON.stringify(rawData, null, 2)}
\`\`\`

## RESPOND IN JSON FORMAT:
{
  "executiveSummary": "2-3 sentences about TECHNICAL performance and algorithm signals",
  "winners": [{"item": "name", "metric": "retention/watch time", "insight": "WHY it performs well technically"}],
  "losers": [{"item": "name", "metric": "retention/watch time", "insight": "WHY it underperforms technically"}],
  "themeInsight": "Which themes get the best YouTube search/recommendation distribution",
  "lyricInsight": "How lyric pacing affects retention curves",
  "audioInsight": "Technical audio patterns that correlate with watch time",
  "thumbnailInsight": "Which thumbnail styles get the best algorithmic distribution",
  "postingTimeInsight": "Optimal posting times based on YouTube's notification/recommendation system",
  "recommendations": ["3-5 specific TECHNICAL recommendations for algorithm optimization"],
  "warnings": ["Technical issues that could hurt channel health"],
  "confidenceLevel": "high/medium/low"
}`;

    try {
      const response = await gemini.models.generateContent({
        model: this.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      await apiCostTracker.trackGemini({
        model: this.GEMINI_MODEL,
        operation: 'strategic_summary_gemini_technical',
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      });

      const responseText = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      return responseText;
    } catch (error: any) {
      console.error(`❌ [Strategic Summary] Gemini Pattern error:`, error.message);
      return '{}';
    }
  }

  /**
   * Claude Opus 4.5 as "Content Strategist" - focuses on narrative, historical authenticity, and story structure
   */
  private async callClaudeContentStrategist(rawData: any): Promise<string> {
    const prompt = `You are a HISTORICAL CONTENT STRATEGIST specializing in narrative structure and educational entertainment.

## YOUR ROLE
Analyze this YouTube analytics data focusing on:
1. NARRATIVE AUTHENTICITY: Are historical figures portrayed accurately? Does authenticity correlate with engagement?
2. STORY STRUCTURE: Which narrative arcs (rivalry, redemption, tragedy) perform best?
3. EDUCATIONAL VALUE: How does factual depth affect retention and comments?
4. CULTURAL SENSITIVITY: Are there content patterns that risk controversy or demonetization?

## RAW DATA
\`\`\`json
${JSON.stringify(rawData, null, 2)}
\`\`\`

## RESPOND IN JSON FORMAT:
{
  "executiveSummary": "2-3 sentences about NARRATIVE and AUTHENTICITY trends",
  "winners": [{"item": "name", "metric": "engagement/comments", "insight": "WHY the narrative works"}],
  "losers": [{"item": "name", "metric": "engagement/comments", "insight": "WHY the narrative failed"}],
  "themeInsight": "Which historical periods/figures resonate with audiences and why",
  "lyricInsight": "How first-person narrative vs third-person affects connection",
  "audioInsight": "How music mood (epic, somber, triumphant) supports the narrative",
  "thumbnailInsight": "Which historical visual styles (portraits, battle scenes) work best",
  "postingTimeInsight": "When educational/historical content performs best",
  "recommendations": ["3-5 specific CONTENT and NARRATIVE recommendations"],
  "warnings": ["Potential authenticity or sensitivity issues to avoid"],
  "confidenceLevel": "high/medium/low"
}`;

    try {
      console.log(`   🧠 Calling Gemini Content Strategist...`);
      const result = await gemini.models.generateContent({
        model: this.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 4096, temperature: 0.5 },
      });

      const text = result.text || '{}';
      console.log(`   ✅ Gemini Content Strategist responded (${text.length} chars)`);

      // Track cost (Gemini pricing)
      await apiCostTracker.trackGemini({
        model: this.GEMINI_MODEL,
        operation: 'strategic_summary_content',
        inputTokens: prompt.length / 4,
        outputTokens: text.length / 4,
      });

      return text;
    } catch (error: any) {
      console.error(`❌ [Strategic Summary] Gemini Content error:`, error.message);
      return '{}';
    }
  }

  /**
   * GPT-4o-mini as "Consensus Judge" - synthesizes all three perspectives into a unified directive
   */
  private async consensusJudge(
    gpt: ModelAnalysis,
    gemini: ModelAnalysis,
    rawData: any,
    claude?: ModelAnalysis,
  ): Promise<StrategicSummary> {
    // First, calculate agreement metrics
    const { agreementScore, divergences, status } = this.calculateAgreement(gpt, gemini);

    // Call GPT-4o-mini to synthesize a final unified directive with action breakdown
    const claudeSection =
      claude && claude.executiveSummary
        ? `
## Claude Opus 4.5 (Content Strategist - Narrative & Authenticity):
${JSON.stringify({ executiveSummary: claude.executiveSummary, winners: claude.winners, recommendations: claude.recommendations }, null, 2)}`
        : '';

    const synthesisPrompt = `You are a STRATEGIC CONSENSUS JUDGE. ${claude ? 'Three' : 'Two'} AI analysts have provided different perspectives on YouTube channel performance. Synthesize them into ONE unified strategy WITH SPECIFIC IMPLEMENTATION STEPS.

## GPT-4o (Creative Strategist - Psychology & Hooks):
${JSON.stringify({ executiveSummary: gpt.executiveSummary, winners: gpt.winners, recommendations: gpt.recommendations }, null, 2)}

## Gemini (Pattern Analyst - Technical SEO & Retention):
${JSON.stringify({ executiveSummary: gemini.executiveSummary, winners: gemini.winners, recommendations: gemini.recommendations }, null, 2)}
${claudeSection}

## AREAS OF DISAGREEMENT:
${divergences.length > 0 ? divergences.join('\n') : 'All models largely agree.'}

## YOUR TASK:
Create a UNIFIED EXECUTIVE DIRECTIVE with:
1. Where both models AGREE (High Confidence actions)
2. Where they DISAGREE (Strategic Experiments)
3. SPECIFIC ACTION BREAKDOWN - HOW to implement each recommendation

Respond in JSON:
{
  "unifiedDirective": "2-3 sentence synthesis of both perspectives",
  "highConfidenceActions": ["Actions both models agree on"],
  "strategicExperiments": ["A/B tests to resolve disagreements"],
  "topPriority": "The single most important thing to do today",
  "actionBreakdown": [
    {
      "action": "Name of the action",
      "why": "Why this will help based on data",
      "how": "Step-by-step implementation",
      "metric": "How to measure success",
      "timeline": "When to evaluate (e.g., '72 hours', '1 week')"
    }
  ]
}`;

    let synthesis: any = {};
    try {
      const consensusModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        systemInstruction: 'You are a strategic synthesizer that finds consensus between competing analyses.',
      });

      const consensusResult = await consensusModel.generateContent(synthesisPrompt);
      const content = consensusResult.response.text();

      await apiCostTracker.trackGemini({
        model: 'gemini-2.5-flash',
        operation: 'strategic_summary_consensus_judge',
        inputTokens: synthesisPrompt.length / 4,
        outputTokens: content.length / 4,
      });

      synthesis = JSON.parse(content || '{}');
    } catch (error: any) {
      console.error(`❌ [Strategic Summary] Consensus Judge error:`, error.message);
    }

    // Build the final executive summary with consensus status
    let executiveSummary = '';
    if (status === 'CONSENSUS') {
      executiveSummary = `🟢 HIGH CONFIDENCE (${agreementScore}% agreement)\n\n`;
    } else {
      executiveSummary = `🟡 DIVERGENT VIEWS (${agreementScore}% agreement - see experiments)\n\n`;
    }

    executiveSummary += `📋 UNIFIED DIRECTIVE: ${synthesis.unifiedDirective || 'See individual analyses below.'}\n\n`;
    executiveSummary += `🎯 TOP PRIORITY: ${synthesis.topPriority || 'Review both perspectives.'}\n\n`;
    executiveSummary += `---\n[GPT-4o Creative] ${gpt.executiveSummary}\n\n[Gemini Technical] ${gemini.executiveSummary}`;

    // Add Claude's analysis if available
    if (claude && claude.executiveSummary) {
      executiveSummary += `\n\n[Claude Content] ${claude.executiveSummary}`;
    }

    // Merge recommendations, prioritizing consensus items
    const allRecs = [
      ...(synthesis.highConfidenceActions || []).map((a: string) => `✅ ${a}`),
      ...(synthesis.strategicExperiments || []).map((e: string) => `🧪 EXPERIMENT: ${e}`),
      ...gpt.recommendations.slice(0, 2),
      ...gemini.recommendations.slice(0, 2),
      ...(claude?.recommendations?.slice(0, 2) || []),
    ];
    const uniqueRecs = [...new Set(allRecs)].slice(0, 9);

    // Merge winners/losers (including Claude)
    let mergedWinners = this.mergeWinnersLosers(gpt.winners, gemini.winners);
    let mergedLosers = this.mergeWinnersLosers(gpt.losers, gemini.losers);
    if (claude) {
      mergedWinners = this.mergeWinnersLosers(mergedWinners, claude.winners);
      mergedLosers = this.mergeWinnersLosers(mergedLosers, claude.losers);
    }

    return {
      id: `summary_${Date.now()}`,
      generatedAt: new Date(),
      executiveSummary,
      winnersAndLosers: {
        winners: mergedWinners.slice(0, 5),
        losers: mergedLosers.slice(0, 5),
      },
      patternInsights: {
        themes: this.mergeInsights(gpt.themeInsight, gemini.themeInsight, claude?.themeInsight),
        lyrics: this.mergeInsights(gpt.lyricInsight, gemini.lyricInsight, claude?.lyricInsight),
        audio: this.mergeInsights(gpt.audioInsight, gemini.audioInsight, claude?.audioInsight),
        thumbnails: this.mergeInsights(gpt.thumbnailInsight, gemini.thumbnailInsight, claude?.thumbnailInsight),
        postingTimes: this.mergeInsights(gpt.postingTimeInsight, gemini.postingTimeInsight, claude?.postingTimeInsight),
      },
      recommendations: uniqueRecs,
      warnings: [...new Set([...gpt.warnings, ...gemini.warnings, ...(claude?.warnings || [])])],
      costsBreakdown: {
        total: rawData.costs?.totalCost || 0,
        byService:
          rawData.costs?.breakdown?.map((b: any) => ({
            service: b.service,
            cost: b.totalCost,
          })) || [],
      },
      consensus: {
        status,
        gptConfidence: gpt.confidenceLevel,
        geminiConfidence: gemini.confidenceLevel,
        claudeConfidence: claude?.confidenceLevel,
        agreementScore,
        divergences: divergences.slice(0, 5),
      },
      rawData: {
        ...rawData,
        gptAnalysis: gpt,
        geminiAnalysis: gemini,
        claudeAnalysis: claude,
        synthesis,
        actionBreakdown: synthesis.actionBreakdown || [],
      },
    };
  }

  /**
   * Calculate agreement score between two model analyses
   */
  private calculateAgreement(
    gpt: ModelAnalysis,
    gemini: ModelAnalysis,
  ): {
    agreementScore: number;
    divergences: string[];
    status: 'CONSENSUS' | 'DIVERGENT' | 'SINGLE_MODEL';
  } {
    const divergences: string[] = [];
    let agreementPoints = 0;
    let totalPoints = 0;

    // Compare winners
    const gptWinnerItems = new Set(gpt.winners.map((w) => w.item.toLowerCase()));
    const geminiWinnerItems = new Set(gemini.winners.map((w) => w.item.toLowerCase()));
    for (const item of gptWinnerItems) {
      totalPoints++;
      if (geminiWinnerItems.has(item)) agreementPoints++;
      else divergences.push(`GPT sees "${item}" as winner, Gemini disagrees`);
    }
    for (const item of geminiWinnerItems) {
      if (!gptWinnerItems.has(item)) {
        totalPoints++;
        divergences.push(`Gemini sees "${item}" as winner, GPT disagrees`);
      }
    }

    // Compare losers
    const gptLoserItems = new Set(gpt.losers.map((l) => l.item.toLowerCase()));
    const geminiLoserItems = new Set(gemini.losers.map((l) => l.item.toLowerCase()));
    for (const item of gptLoserItems) {
      totalPoints++;
      if (geminiLoserItems.has(item)) agreementPoints++;
    }
    for (const item of geminiLoserItems) {
      if (!gptLoserItems.has(item)) totalPoints++;
    }

    // Calculate score
    const agreementScore = totalPoints > 0 ? Math.round((agreementPoints / totalPoints) * 100) : 50;
    const status = agreementScore >= 70 ? 'CONSENSUS' : 'DIVERGENT';

    return { agreementScore, divergences, status };
  }

  /**
   * Merge winners/losers from both models
   */
  private mergeWinnersLosers(
    gptItems: { item: string; metric: string; insight: string }[],
    geminiItems: { item: string; metric: string; insight: string }[],
  ): { item: string; metric: string; insight: string }[] {
    const merged = [...gptItems];
    for (const gi of geminiItems) {
      if (!merged.some((m) => m.item.toLowerCase() === gi.item.toLowerCase())) {
        merged.push(gi);
      }
    }
    return merged;
  }

  /**
   * Parse model response into structured format
   */
  private parseModelResponse(response: string, model: 'gpt-4o' | 'gemini' | 'claude'): ModelAnalysis {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          model,
          executiveSummary: parsed.executiveSummary || '',
          winners: parsed.winners || [],
          losers: parsed.losers || [],
          themeInsight: parsed.themeInsight || '',
          lyricInsight: parsed.lyricInsight || '',
          audioInsight: parsed.audioInsight || '',
          thumbnailInsight: parsed.thumbnailInsight || '',
          postingTimeInsight: parsed.postingTimeInsight || '',
          recommendations: parsed.recommendations || [],
          warnings: parsed.warnings || [],
          confidenceLevel: parsed.confidenceLevel || 'medium',
        };
      }
    } catch (e) {
      console.warn(`⚠️ [Strategic Summary] Failed to parse ${model} response`);
    }

    return {
      model,
      executiveSummary: '',
      winners: [],
      losers: [],
      themeInsight: '',
      lyricInsight: '',
      audioInsight: '',
      thumbnailInsight: '',
      postingTimeInsight: '',
      recommendations: [],
      warnings: [],
      confidenceLevel: 'low',
    };
  }

  /**
   * Gather all relevant system data for analysis
   */
  private async gatherSystemData(): Promise<any> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      recentPackages,
      lyricStats,
      audioStats,
      visualStyleStats,
      postingStats,
      videoMetrics,
      costSummary,
      audioDnaRecords,
      ctrReport,
      visualAnalysisRecords,
    ] = await Promise.all([
      db
        .select()
        .from(unityContentPackages)
        .where(gte(unityContentPackages.createdAt, sevenDaysAgo))
        .orderBy(desc(unityContentPackages.createdAt))
        .limit(50),

      db.select().from(lyricPatternStats).orderBy(desc(lyricPatternStats.pulls)),

      db.select().from(audioPatternStats).orderBy(desc(audioPatternStats.pulls)),

      db.select().from(styleBanditArms).orderBy(desc(styleBanditArms.trials)),

      db.select().from(postingTimeArms).orderBy(desc(postingTimeArms.trials)),

      db.select().from(detailedVideoMetrics).orderBy(desc(detailedVideoMetrics.viewCount)).limit(50),

      apiCostTracker.getCostSummary('month'),

      // Fetch acoustic fingerprint data for audio DNA analysis
      db.select().from(audioDna).orderBy(desc(audioDna.createdAt)).limit(100),

      // Fetch CTR report for comprehensive click-through rate analysis
      this.fetchCTRReport(),

      // Fetch visual intelligence analysis data
      db.select().from(visualAnalysis).orderBy(desc(visualAnalysis.overallVisualScore)).limit(50),
    ]);

    const packageStats = this.analyzePackages(recentPackages);
    const videoPerformance = this.analyzeVideoMetrics(videoMetrics);

    return {
      period: '7 days',
      generatedAt: new Date().toISOString(),

      packages: {
        total: recentPackages.length,
        byStatus: packageStats.byStatus,
        byTopic: packageStats.topTopics,
        averageViralScore: packageStats.avgViralScore,
      },

      videoPerformance: {
        totalVideos: videoMetrics.length,
        avgViews: videoPerformance.avgViews,
        avgCtr: videoPerformance.avgCtr,
        avgRetention: videoPerformance.avgRetention,
        topVideos: videoPerformance.topVideos,
        byTier: videoPerformance.byTier,
      },

      lyrics: {
        topPatterns: lyricStats.slice(0, 10),
        byPerspective: this.groupByField(lyricStats, 'patternType', 'perspective'),
        byRhymeScheme: this.groupByField(lyricStats, 'patternType', 'rhyme_scheme'),
      },

      audio: {
        topPatterns: audioStats.slice(0, 10),
        byBpm: this.groupByField(audioStats, 'patternType', 'bpm_range'),
        byEnergy: this.groupByField(audioStats, 'patternType', 'intro_energy'),
      },

      visualStyles: {
        styles: visualStyleStats.map((s) => ({
          name: s.styleName,
          trials: s.trials,
          successes: s.successes,
          avgCtr: s.avgCtr,
          avgRetention: s.avgRetention,
          winRate: s.trials > 0 ? (((s.successes || 0) / s.trials) * 100).toFixed(1) + '%' : 'N/A',
        })),
        bestPerformer:
          visualStyleStats.length > 0
            ? visualStyleStats.reduce((a, b) => ((a.avgCtr || 0) > (b.avgCtr || 0) ? a : b))
            : null,
      },

      postingTimes: {
        arms: postingStats,
        bestTime:
          postingStats.length > 0 ? postingStats.reduce((a, b) => ((a.avgCtr || 0) > (b.avgCtr || 0) ? a : b)) : null,
      },

      // Acoustic Fingerprint Data for deep audio analysis
      audioDnaAnalysis: this.analyzeAudioDna(audioDnaRecords),

      // CTR Report for click-through rate analysis (ranked by weighted score = CTR × log(views))
      ctrAnalysis: ctrReport
        ? {
            summary: ctrReport.summary,
            note: 'Videos are ranked by weighted score (CTR × log10(views)) to prioritize statistically significant results. High confidence = 500+ views, Medium = 100+ views, Low = <100 views.',
            topPerformers: ctrReport.videos?.slice(0, 15).map((v: any) => ({
              title: v.title,
              ctr: v.ctr,
              views: v.views,
              confidence: v.confidence,
              weightedScore: v.weightedScore,
              status: v.status,
            })),
            highConfidenceOnly: ctrReport.videos
              ?.filter((v: any) => v.confidence === 'high' || v.confidence === 'medium')
              .slice(0, 10)
              .map((v: any) => ({
                title: v.title,
                ctr: v.ctr,
                views: v.views,
                confidence: v.confidence,
              })),
            recommendations: ctrReport.recommendations,
          }
        : null,

      // Visual Intelligence Analysis - AI vision analysis of thumbnails and video frames
      visualIntelligence: this.analyzeVisualData(visualAnalysisRecords),

      dataGaps: {
        lyricPatterns:
          lyricStats.length === 0
            ? '❌ NO DATA - run metrics harvest to populate'
            : `✅ ${lyricStats.length} patterns tracked`,
        audioPatterns:
          audioStats.length === 0
            ? '❌ NO DATA - run metrics harvest to populate'
            : `✅ ${audioStats.length} patterns tracked`,
        postingTimes:
          postingStats.length === 0
            ? '❌ NO DATA - needs database migration from JSON'
            : `✅ ${postingStats.length} time slots tracked`,
        visualStyles: visualStyleStats.length === 0 ? '❌ NO DATA' : `✅ ${visualStyleStats.length} styles tracked`,
        visualIntelligence:
          visualAnalysisRecords.length === 0
            ? '❌ NO DATA - run POST /api/visual-intelligence/analyze-batch to analyze thumbnails'
            : `✅ ${visualAnalysisRecords.length} thumbnails analyzed`,
        videoMetrics: videoPerformance.dataQuality
          ? `📊 ${videoPerformance.dataQuality.withCtr}/${videoPerformance.dataQuality.total} videos have CTR data (${videoPerformance.dataQuality.missingData} missing)`
          : '❌ NO DATA',
        audioDna:
          audioDnaRecords.length === 0
            ? '❌ NO DATA - run backfill_audio_dna.py to populate'
            : `✅ ${audioDnaRecords.length} audio fingerprints tracked`,
      },

      // External market signals from Trend-Watcher Agent
      externalTrends: await this.gatherTrendWatcherData(),

      costs: costSummary,
    };
  }

  /**
   * Gather external trend signals from Google Trends and YouTube
   * This helps the Consensus Judge adjust recommendations based on market shifts
   */
  private async gatherTrendWatcherData(): Promise<any> {
    try {
      console.log('📡 [Strategic Summary] Gathering Trend-Watcher signals...');
      const signals = await trendWatcherAgentService.getTrendWatcherSignals(true);
      const breakouts = await trendWatcherAgentService.getBreakoutAlerts();
      const summary = trendWatcherAgentService.getSummaryForConsensus();

      console.log(`   ✅ Trend signals gathered (${breakouts.length} breakout alerts)`);

      return {
        searchVelocity: signals.searchVelocity,
        ytPopularTitles: signals.ytPopularTitles?.slice(0, 5),
        ytPopularThemes: signals.ytPopularThemes,
        styleTrends: signals.styleTrends,
        breakoutAlerts: breakouts,
        consensusSummary: summary,
        timestamp: signals.timestamp,
      };
    } catch (error: any) {
      console.warn(`   ⚠️ Trend-Watcher unavailable: ${error.message}`);
      return {
        error: 'Trend-Watcher unavailable',
        message: error.message,
      };
    }
  }

  /**
   * Sanitize metric values to prevent NaN from breaking Thompson Sampling
   * Converts null, undefined, NaN, and string values to proper numbers
   */
  private sanitizeMetric(val: string | number | null | undefined): number {
    if (val === null || val === undefined) return 0;
    const parsed = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Videos to exclude from CTR analysis (test videos with artificially skewed metrics)
   * These videos had extensive A/B testing that inflated/deflated their natural CTR
   */
  private readonly EXCLUDED_TEST_VIDEOS = [
    "bigfoot's lament",
    'bigfoots lament',
    'bigfoot lament',
    'dogs vs cats',
    'dogs vs cats who will win',
    'cat vs dog',
    'cats vs dogs',
  ];

  /**
   * Check if a video title matches an excluded test video
   */
  private isExcludedTestVideo(title: string): boolean {
    if (!title) return false;
    const normalized = title.toLowerCase().trim();
    return this.EXCLUDED_TEST_VIDEOS.some((excluded) => normalized.includes(excluded) || excluded.includes(normalized));
  }

  /**
   * Analyze video metrics from imported YouTube data
   * FIXED: Now sanitizes all metrics to prevent NaN blindspots
   * FIXED: Excludes test videos from CTR calculations
   */
  private analyzeVideoMetrics(metrics: any[]): any {
    if (metrics.length === 0) {
      return {
        avgViews: 0,
        avgCtr: 0,
        avgRetention: 0,
        topVideos: [],
        byTier: {},
        dataQuality: { total: 0, withCtr: 0, withRetention: 0 },
        excludedTestVideos: [],
      };
    }

    // Sanitize all metrics first
    const sanitized = metrics.map((m) => ({
      ...m,
      viewCount: this.sanitizeMetric(m.viewCount),
      clickThroughRate: this.sanitizeMetric(m.clickThroughRate),
      first60SecondsRetention: this.sanitizeMetric(m.first60SecondsRetention),
    }));

    // Separate test videos from real videos for CTR analysis
    const excludedVideos = sanitized.filter((m) => this.isExcludedTestVideo(m.title));
    const realVideos = sanitized.filter((m) => !this.isExcludedTestVideo(m.title));

    // Log excluded videos for transparency
    if (excludedVideos.length > 0) {
      console.log(
        `   📊 [Strategic Summary] Excluding ${excludedVideos.length} test videos from CTR analysis: ${excludedVideos.map((v) => v.title).join(', ')}`,
      );
    }

    // Filter for videos with actual data (CTR > 0 means we have real data) - EXCLUDING test videos
    const withCtr = realVideos.filter((m) => m.clickThroughRate > 0);
    const withRetention = sanitized.filter((m) => m.first60SecondsRetention > 0);
    const withViews = sanitized.filter((m) => m.viewCount > 0);

    const avgViews =
      withViews.length > 0 ? Math.round(withViews.reduce((sum, m) => sum + m.viewCount, 0) / withViews.length) : 0;

    const avgCtr =
      withCtr.length > 0
        ? (withCtr.reduce((sum, m) => sum + m.clickThroughRate, 0) / withCtr.length).toFixed(2)
        : '0.00';

    const avgRetention =
      withRetention.length > 0
        ? (withRetention.reduce((sum, m) => sum + m.first60SecondsRetention, 0) / withRetention.length).toFixed(1)
        : '0.0';

    const byTier: Record<string, number> = {};
    for (const m of sanitized) {
      const tier = m.performanceTier || 'unknown';
      byTier[tier] = (byTier[tier] || 0) + 1;
    }

    return {
      avgViews,
      avgCtr,
      avgRetention,
      // Use realVideos (excludes test videos) for top performers
      topVideos: realVideos
        .filter((m) => m.clickThroughRate > 0)
        .sort((a, b) => b.clickThroughRate - a.clickThroughRate)
        .slice(0, 5)
        .map((m) => ({
          title: m.title?.substring(0, 50),
          views: m.viewCount,
          ctr: m.clickThroughRate.toFixed(2),
          retention: m.first60SecondsRetention.toFixed(1),
          tier: m.performanceTier,
        })),
      byTier,
      dataQuality: {
        total: metrics.length,
        withCtr: withCtr.length,
        withRetention: withRetention.length,
        missingData: metrics.length - withCtr.length,
      },
      // Report excluded test videos for transparency
      excludedTestVideos: excludedVideos.map((v) => ({
        title: v.title,
        ctr: v.clickThroughRate?.toFixed(2) || '0.00',
        reason: 'A/B testing skewed metrics',
      })),
    };
  }

  private analyzePackages(packages: any[]): any {
    const byStatus: Record<string, number> = {};
    const topicCounts: Record<string, number> = {};
    let totalViralScore = 0;
    let viralScoreCount = 0;

    for (const pkg of packages) {
      byStatus[pkg.status] = (byStatus[pkg.status] || 0) + 1;

      if (pkg.topic) {
        topicCounts[pkg.topic] = (topicCounts[pkg.topic] || 0) + 1;
      }

      if (pkg.viralScore) {
        totalViralScore += pkg.viralScore;
        viralScoreCount++;
      }
    }

    const topTopics = Object.entries(topicCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([topic, count]) => ({ topic, count }));

    return {
      byStatus,
      topTopics,
      avgViralScore: viralScoreCount > 0 ? Math.round(totalViralScore / viralScoreCount) : 0,
    };
  }

  private groupByField(stats: any[], typeField: string, value: string): any[] {
    return stats.filter((s) => s[typeField] === value);
  }

  /**
   * Analyze acoustic fingerprint data for deep audio insights
   * This enables Opus 4.5 to mathematically compare winners vs losers
   */
  private analyzeAudioDna(records: any[]): any {
    if (records.length === 0) {
      return {
        total: 0,
        summary: 'No audio DNA data available. Run backfill_audio_dna.py to populate.',
        avgBpm: 0,
        avgHookSurvival: 0,
        energyCurveDistribution: {},
        topPerformers: [],
        winnerPatterns: null,
      };
    }

    // Calculate averages
    const avgBpm = records.reduce((sum, r) => sum + (r.bpm || 0), 0) / records.length;
    const avgHookSurvival = records.reduce((sum, r) => sum + (r.predictedHookSurvival || 0), 0) / records.length;
    const avgPercussiveness = records.reduce((sum, r) => sum + (r.percussivenessScore || 0), 0) / records.length;
    const avgBrightness = records.reduce((sum, r) => sum + (r.brightnessScore || 0), 0) / records.length;

    // Group by energy curve
    const energyCurveDistribution: Record<string, number> = {};
    for (const r of records) {
      const curve = r.energyCurve || 'unknown';
      energyCurveDistribution[curve] = (energyCurveDistribution[curve] || 0) + 1;
    }

    // Find top performers by hook survival score
    const topPerformers = [...records]
      .sort((a, b) => (b.predictedHookSurvival || 0) - (a.predictedHookSurvival || 0))
      .slice(0, 5)
      .map((r) => ({
        packageId: r.packageId,
        bpm: r.bpm?.toFixed(1),
        energyCurve: r.energyCurve,
        hookSurvival: ((r.predictedHookSurvival || 0) * 100).toFixed(0) + '%',
        dnaScores: {
          energy: r.dnaScoreEnergy?.toFixed(0) || 0,
          rhythm: r.dnaScoreRhythm?.toFixed(0) || 0,
          clarity: r.dnaScoreClarity?.toFixed(0) || 0,
          hook: r.dnaScoreHook?.toFixed(0) || 0,
        },
      }));

    // Identify winner patterns (average of top 20%)
    const topCount = Math.max(1, Math.floor(records.length * 0.2));
    const topRecords = [...records]
      .sort((a, b) => (b.predictedHookSurvival || 0) - (a.predictedHookSurvival || 0))
      .slice(0, topCount);

    const winnerPatterns =
      topRecords.length > 0
        ? {
            avgBpm: topRecords.reduce((sum, r) => sum + (r.bpm || 0), 0) / topRecords.length,
            avgPercussiveness: topRecords.reduce((sum, r) => sum + (r.percussivenessScore || 0), 0) / topRecords.length,
            avgBrightness: topRecords.reduce((sum, r) => sum + (r.brightnessScore || 0), 0) / topRecords.length,
            avgHookSurvival: topRecords.reduce((sum, r) => sum + (r.predictedHookSurvival || 0), 0) / topRecords.length,
            dominantEnergyCurve: this.getMostCommon(topRecords.map((r) => r.energyCurve)),
          }
        : null;

    return {
      total: records.length,
      summary: `Analyzed ${records.length} audio fingerprints. Winners show ${winnerPatterns?.dominantEnergyCurve || 'varied'} energy curves with ${((winnerPatterns?.avgHookSurvival || 0) * 100).toFixed(0)}% predicted hook survival.`,
      avgBpm: avgBpm.toFixed(1),
      avgHookSurvival: (avgHookSurvival * 100).toFixed(0) + '%',
      avgPercussiveness: avgPercussiveness.toFixed(2),
      avgBrightness: avgBrightness.toFixed(2),
      energyCurveDistribution,
      topPerformers,
      winnerPatterns,
    };
  }

  /**
   * Analyze visual intelligence data for thumbnail and video frame insights
   * This enables the AI to "see" what's working in thumbnails and videos
   */
  private analyzeVisualData(records: any[]): any {
    if (records.length === 0) {
      return {
        total: 0,
        summary: 'No visual analysis data. Run POST /api/visual-intelligence/analyze-batch to analyze thumbnails.',
        avgThumbnailScore: 0,
        avgComposition: 0,
        avgColorImpact: 0,
        avgEmotionalImpact: 0,
        avgCuriosityGap: 0,
        tierDistribution: {},
        topPerformers: [],
        commonStrengths: [],
        commonWeaknesses: [],
      };
    }

    // Calculate averages
    const avgThumbnailScore = records.reduce((sum, r) => sum + (r.thumbnailScore || 0), 0) / records.length;
    const avgComposition = records.reduce((sum, r) => sum + (r.thumbnailComposition || 0), 0) / records.length;
    const avgColorImpact = records.reduce((sum, r) => sum + (r.thumbnailColorImpact || 0), 0) / records.length;
    const avgEmotionalImpact = records.reduce((sum, r) => sum + (r.thumbnailEmotionalImpact || 0), 0) / records.length;
    const avgCuriosityGap = records.reduce((sum, r) => sum + (r.thumbnailCuriosityGap || 0), 0) / records.length;

    // Group by visual tier
    const tierDistribution: Record<string, number> = {};
    for (const r of records) {
      const tier = r.visualTier || 'unknown';
      tierDistribution[tier] = (tierDistribution[tier] || 0) + 1;
    }

    // Find top performers by thumbnail score
    const topPerformers = [...records]
      .sort((a, b) => (b.thumbnailScore || 0) - (a.thumbnailScore || 0))
      .slice(0, 5)
      .map((r) => ({
        videoId: r.videoId,
        title: r.title,
        thumbnailScore: r.thumbnailScore?.toFixed(0),
        composition: r.thumbnailComposition?.toFixed(0),
        colorImpact: r.thumbnailColorImpact?.toFixed(0),
        emotionalImpact: r.thumbnailEmotionalImpact?.toFixed(0),
        curiosityGap: r.thumbnailCuriosityGap?.toFixed(0),
        visualTier: r.visualTier,
        strengths: r.thumbnailAnalysis?.strengths?.slice(0, 2) || [],
      }));

    // Collect common strengths and weaknesses
    const strengthCount: Record<string, number> = {};
    const weaknessCount: Record<string, number> = {};

    for (const r of records) {
      const analysis = r.thumbnailAnalysis as any;
      if (analysis?.strengths) {
        for (const s of analysis.strengths) {
          strengthCount[s] = (strengthCount[s] || 0) + 1;
        }
      }
      if (analysis?.weaknesses) {
        for (const w of analysis.weaknesses) {
          weaknessCount[w] = (weaknessCount[w] || 0) + 1;
        }
      }
    }

    const commonStrengths = Object.entries(strengthCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([strength, count]) => ({ strength, count }));

    const commonWeaknesses = Object.entries(weaknessCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([weakness, count]) => ({ weakness, count }));

    // Generate visual DNA summary
    const visualDna = {
      dominantTier: this.getMostCommon(records.map((r) => r.visualTier)),
      scoreRange: {
        min: Math.min(...records.map((r) => r.thumbnailScore || 0)),
        max: Math.max(...records.map((r) => r.thumbnailScore || 0)),
      },
      bestAspect:
        avgComposition >= avgColorImpact && avgComposition >= avgEmotionalImpact
          ? 'composition'
          : avgColorImpact >= avgEmotionalImpact
            ? 'color_impact'
            : 'emotional_impact',
    };

    return {
      total: records.length,
      summary: `Analyzed ${records.length} thumbnails. Average score: ${avgThumbnailScore.toFixed(0)}/100. Best aspect: ${visualDna.bestAspect.replace('_', ' ')}. Most common tier: ${visualDna.dominantTier}.`,
      avgThumbnailScore: avgThumbnailScore.toFixed(0),
      avgComposition: avgComposition.toFixed(0),
      avgColorImpact: avgColorImpact.toFixed(0),
      avgEmotionalImpact: avgEmotionalImpact.toFixed(0),
      avgCuriosityGap: avgCuriosityGap.toFixed(0),
      tierDistribution,
      topPerformers,
      commonStrengths,
      commonWeaknesses,
      visualDna,
    };
  }

  /**
   * Get most common value from array
   */
  private getMostCommon(arr: any[]): any {
    const counts: Record<string, number> = {};
    for (const val of arr) {
      if (val !== null && val !== undefined) {
        counts[String(val)] = (counts[String(val)] || 0) + 1;
      }
    }
    const entries = Object.entries(counts);
    if (entries.length === 0) return null;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * Merge insights from both models into a combined view
   */
  private mergeInsights(gptInsight: string, geminiInsight: string, claudeInsight?: string): string {
    const insights = [gptInsight, geminiInsight, claudeInsight].filter(Boolean);
    if (insights.length === 0) return 'No data available for analysis.';

    // Combine all available insights intelligently
    return insights.join(' ').replace(/\s+/g, ' ').trim();
  }

  private buildAnalysisPrompt(data: any): string {
    return `You are a YouTube Growth Strategist analyzing a historical rap video automation system.

## CONTEXT
This system automatically generates "Epic Rap Battles of History"-style videos about real historical figures.
It uses Thompson Sampling (Bayesian bandits) to optimize themes, lyrics, audio patterns, thumbnails, and posting times.
Your job is to analyze the past 7 days and provide a strategic summary.

## RAW DATA
\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

## ANALYSIS REQUIRED

Provide a strategic summary in the following JSON format:

{
  "executiveSummary": "2-3 sentences summarizing the overall system health and performance trend",
  
  "winners": [
    {"item": "Theme/Pattern name", "metric": "e.g. 8.2% CTR", "insight": "Why it's winning"}
  ],
  
  "losers": [
    {"item": "Theme/Pattern name", "metric": "e.g. 2.1% CTR", "insight": "Why it's losing"}
  ],
  
  "themeInsight": "One paragraph about what historical themes are working and why",
  "lyricInsight": "One paragraph about which lyric patterns drive engagement",
  "audioInsight": "One paragraph about audio/music patterns correlation with retention",
  "thumbnailInsight": "One paragraph about thumbnail style performance",
  "postingTimeInsight": "One paragraph about best posting times",
  
  "recommendations": [
    "Specific actionable recommendation 1",
    "Specific actionable recommendation 2",
    "Specific actionable recommendation 3"
  ],
  
  "warnings": [
    "Any concerning patterns or issues to watch"
  ],
  
  "confidenceLevel": "high/medium/low based on data quality"
}

IMPORTANT:
- Use plain English, avoid jargon
- Be specific with numbers when available
- Focus on actionable insights
- Identify patterns, not just data points
- If data is limited, say so in confidenceLevel`;
  }

  private async saveSummary(summary: StrategicSummary): Promise<void> {
    try {
      await db.insert(strategicSummaries).values({
        executiveSummary: summary.executiveSummary,
        winnersLosers: summary.winnersAndLosers,
        patternInsights: summary.patternInsights,
        recommendations: summary.recommendations,
        warnings: summary.warnings,
        costsBreakdown: summary.costsBreakdown,
        rawData: {
          ...summary.rawData,
          consensus: summary.consensus,
        },
        confidenceLevel: summary.consensus?.status === 'CONSENSUS' ? 'high' : 'medium',
      });
      console.log(
        `   💾 Saved consensus summary (${summary.consensus.status}, ${summary.consensus.agreementScore}% agreement)`,
      );
    } catch (error: any) {
      console.error(`❌ [Strategic Summary] Failed to save:`, error.message);
    }
  }

  /**
   * Get the latest strategic summary
   */
  async getLatestSummary(): Promise<any | null> {
    const [latest] = await db.select().from(strategicSummaries).orderBy(desc(strategicSummaries.generatedAt)).limit(1);

    return latest || null;
  }

  /**
   * Get summaries for the past N days
   */
  async getRecentSummaries(days: number = 7): Promise<any[]> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    return db
      .select()
      .from(strategicSummaries)
      .where(gte(strategicSummaries.generatedAt, cutoff))
      .orderBy(desc(strategicSummaries.generatedAt));
  }

  /**
   * Interactive Q&A: Ask questions about the strategic data
   * Uses Claude Opus 4.5 for deep analytical reasoning
   */
  async askQuestion(
    question: string,
    preferredModel: 'claude' | 'gpt' | 'gemini' = 'claude',
  ): Promise<{
    answer: string;
    model: string;
    dataUsed: string[];
  }> {
    console.log(`🤔 [Strategic Q&A] Processing question with ${preferredModel}...`);
    console.log(`   Question: ${question}`);

    // Gather current system data
    const rawData = await this.gatherSystemData();
    const latestSummary = await this.getLatestSummary();

    const systemPrompt = `You are an expert analytics advisor for a YouTube content creation system.
You have access to comprehensive data about video performance, patterns, and recommendations.

Your role is to answer questions about this data, provide insights, and suggest actionable improvements.
Be specific with numbers when available. Reference actual patterns and videos from the data.`;

    const userPrompt = `## CURRENT SYSTEM DATA
\`\`\`json
${JSON.stringify(rawData, null, 2)}
\`\`\`

## LATEST STRATEGIC SUMMARY
${latestSummary ? JSON.stringify(latestSummary, null, 2) : 'No summary available yet'}

## USER QUESTION
${question}

Please provide a clear, actionable answer based on the data. Include specific numbers, patterns, and recommendations where relevant.`;

    let answer = '';
    let model = '';
    const dataUsed = ['videoMetrics', 'patternStats', 'postingTimes', 'lyricPatterns', 'audioPatterns'];

    try {
      if (preferredModel === 'claude' || preferredModel === 'gemini') {
        // Use Gemini
        const result = await gemini.models.generateContent({
          model: this.GEMINI_MODEL,
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        });

        answer = result.text || 'No response from Gemini';
        model = this.GEMINI_MODEL;

        console.log(`   ✅ Gemini response received (${answer.length} chars)`);
      } else {
        // Default to Gemini
        const qaModel = getGemini().getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.5 },
          systemInstruction: systemPrompt,
        });

        const qaResult = await qaModel.generateContent(userPrompt);
        answer = qaResult.response.text() || 'No response from Gemini';
        model = 'gemini-2.5-flash';

        await apiCostTracker.trackGemini({
          model: 'gemini-2.5-flash',
          operation: 'strategic_qa',
          inputTokens: userPrompt.length / 4,
          outputTokens: (qaResult as any).response?.usage?.completion_tokens || 0,
        });

        console.log(`   ✅ GPT-4o response received (${answer.length} chars)`);
      }
    } catch (error: any) {
      console.error(`❌ [Strategic Q&A] Error with ${preferredModel}:`, error.message);

      // Fallback to Gemini if primary model fails
      if (preferredModel !== 'gemini') {
        console.log(`   🔄 Falling back to Gemini...`);
        const fallbackModel = getGemini().getGenerativeModel({
          model: 'gemini-2.5-flash',
          generationConfig: { temperature: 0.5 },
          systemInstruction: systemPrompt,
        });

        const fallbackResult = await fallbackModel.generateContent(userPrompt);
        answer = fallbackResult.response.text() || 'No response from fallback';
        model = `gemini-2.5-flash (fallback)`;
      } else {
        answer = `Error: ${error.message}`;
        model = 'error';
      }
    }

    return { answer, model, dataUsed };
  }

  /**
   * Generate nightly summary with Co-Reasoning Director enhancement
   * This is an optional enhancement mode that uses specialized modal experts
   * Note: coReasoningDirector is instantiated after this class, so we accept it as a parameter
   */
  async generateEnhancedSummaryWithCoReasoning(
    packageContext?: any,
    director?: { getCoReasoningDirective: (ctx: any) => Promise<any> },
  ): Promise<StrategicSummary & { coReasoningDirective?: any }> {
    console.log(`🎬 [Strategic Summary] Running ENHANCED mode with Co-Reasoning Director...`);

    // First, generate the standard strategic summary
    const baseSummary = await this.generateNightlySummary();

    // If package context is provided, also run Co-Reasoning Director for video-specific insights
    let coReasoningDirectiveResult = null;
    if (packageContext && director) {
      try {
        console.log(`   🎭 Adding Co-Reasoning Director analysis for video context...`);
        coReasoningDirectiveResult = await director.getCoReasoningDirective(packageContext);

        // Merge Co-Reasoning insights into the summary
        if (coReasoningDirectiveResult) {
          baseSummary.rawData.coReasoningDirective = coReasoningDirectiveResult;
          baseSummary.recommendations = [
            `🎬 [Co-Reasoning]: ${coReasoningDirectiveResult.unifiedDirective}`,
            ...coReasoningDirectiveResult.synthesizedRecommendations.slice(0, 3),
            ...baseSummary.recommendations,
          ].slice(0, 10);
        }
      } catch (error: any) {
        console.warn(`   ⚠️ Co-Reasoning Director enhancement failed:`, error.message);
      }
    }

    console.log(`✅ [Strategic Summary] Enhanced summary complete`);

    return {
      ...baseSummary,
      coReasoningDirective: coReasoningDirectiveResult,
    };
  }

  /**
   * Update insights based on new data or user feedback
   * Regenerates specific sections of the analysis
   */
  async updateInsight(
    section: 'themes' | 'lyrics' | 'audio' | 'thumbnails' | 'postingTimes',
    feedback?: string,
  ): Promise<string> {
    console.log(`🔄 [Strategic Summary] Updating ${section} insight...`);

    const rawData = await this.gatherSystemData();

    const sectionPrompts: Record<string, string> = {
      themes: `Analyze the historical theme performance data. Which themes are working best and why? Focus on: ${JSON.stringify(rawData.videoMetrics?.slice(0, 10))}`,
      lyrics: `Analyze the lyric pattern data. Which patterns drive highest engagement? Focus on: ${JSON.stringify(rawData.lyricPatterns)}`,
      audio: `Analyze the audio pattern data. How does BPM, energy, and tempo affect retention? Focus on: ${JSON.stringify(rawData.audioPatterns)}`,
      thumbnails: `Analyze thumbnail and visual style performance. Which styles get the best CTR? Focus on: ${JSON.stringify(rawData.visualStyles)}`,
      postingTimes: `Analyze posting time data. When are viewers most engaged? Focus on: ${JSON.stringify(rawData.postingTimes?.slice(0, 10))}`,
    };

    const prompt = `${sectionPrompts[section]}
    
${feedback ? `User feedback to incorporate: ${feedback}` : ''}

Provide a concise but detailed insight paragraph (3-5 sentences) with specific numbers and actionable recommendations.`;

    try {
      const insightModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.4 },
        systemInstruction: 'You are an expert YouTube analytics advisor. Provide specific, actionable insights.',
      });

      const insightResult = await insightModel.generateContent(prompt);
      const insight = insightResult.response.text() || '';
      console.log(`   ✅ Updated ${section} insight (${insight.length} chars)`);

      return insight;
    } catch (error: any) {
      console.error(`❌ [Strategic Summary] Update insight error:`, error.message);
      return `Error updating ${section} insight: ${error.message}`;
    }
  }

  /**
   * Fetch CTR report from YouTube Analytics service
   * Returns null if unavailable to avoid breaking the data gathering
   */
  private async fetchCTRReport(): Promise<any> {
    try {
      const { youtubeAnalyticsService } = await import('./youtube-analytics-service');
      return await youtubeAnalyticsService.getCTRReport();
    } catch (error: any) {
      console.warn(`⚠️ [Strategic Summary] Could not fetch CTR report: ${error.message}`);
      return null;
    }
  }
}

export const strategicSummaryService = new StrategicSummaryService();

// ============================================================================
// CO-REASONING DIRECTOR - Specialized Modal Expert System
// Upgrades triple-model consensus with specialized role-based prompting
// ============================================================================

class CoReasoningDirector {
  private readonly GPT_MODEL = 'gpt-4o';
  private readonly GPT_MINI_MODEL = 'gpt-4o-mini';
  private readonly GEMINI_MODEL = 'gemini-2.5-flash';

  /**
   * GPT-4o as Visual Motion Expert - focuses on camera movements and action choreography
   */
  private getGPT4oMotionExpertPrompt(context: any): string {
    const expert = MODAL_EXPERTS.gpt4o;
    return `You are a ${expert.role} analyzing video production for a historical rap content system.

## YOUR SPECIALIZED FOCUS: ${expert.focus}

As the Visual Motion Expert, you analyze:
1. CAMERA MOVEMENTS: Push-ins, pull-backs, orbits, tracking shots - are they enhancing emotional beats?
2. ACTION CHOREOGRAPHY: How well do physical movements match the lyric intensity and BPM?
3. VISUAL PACING: Are cuts/transitions synced to musical energy? Do scene changes land on beats?
4. CINEMATIC TECHNIQUES: Shot composition, depth of field suggestions, lighting for motion

## CONTEXT DATA
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

## RESPOND IN JSON:
{
  "motionAnalysis": "Overall assessment of visual motion quality",
  "cameraRecommendations": ["Specific camera movement improvements"],
  "choreographyInsights": ["Action/movement timing suggestions"],
  "pacingScore": 0-100,
  "priorityFeedback": {
    "motion": "Key motion insight",
    "cinematography": "Key cinematography insight", 
    "visual_impact": "Key visual impact insight"
  },
  "topIssues": ["Motion/visual issues to address"],
  "confidence": 0-100
}`;
  }

  /**
   * Gemini as Narrative Continuity Expert - focuses on story logic and character tracking
   */
  private getGeminiNarrativeExpertPrompt(context: any): string {
    const expert = MODAL_EXPERTS.gemini;
    return `You are a ${expert.role} analyzing video production for a historical rap content system.

## YOUR SPECIALIZED FOCUS: ${expert.focus}

As the Narrative Continuity Expert, you analyze:
1. CHARACTER CONSISTENCY: Does the historical figure's appearance/costume stay consistent across clips?
2. STORY LOGIC: Does the visual narrative flow logically from clip to clip?
3. TEMPORAL COHERENCE: Do time-of-day, lighting, and settings maintain continuity?
4. PLOT FLOW: Does the visual story arc match the lyrical narrative arc (intro → conflict → climax → resolution)?

## CONTEXT DATA
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

## RESPOND IN JSON:
{
  "narrativeAnalysis": "Overall assessment of story continuity",
  "characterConsistencyIssues": ["Specific character appearance inconsistencies"],
  "storyFlowSuggestions": ["How to improve narrative flow between clips"],
  "coherenceScore": 0-100,
  "priorityFeedback": {
    "continuity": "Key continuity insight",
    "narrative": "Key narrative insight",
    "consistency": "Key consistency insight"
  },
  "topIssues": ["Narrative/continuity issues to address"],
  "confidence": 0-100
}`;
  }

  /**
   * Claude as Technical Cinematography Expert - focuses on era accuracy and authenticity
   */
  private getClaudeTechnicalExpertPrompt(context: any): string {
    const expert = MODAL_EXPERTS.claude;
    return `You are a ${expert.role} analyzing video production for a historical rap content system.

## YOUR SPECIALIZED FOCUS: ${expert.focus}

As the Technical Cinematography Expert, you analyze:
1. ERA ACCURACY: Are costumes, props, architecture historically correct for the period?
2. HISTORICAL AUTHENTICITY: Would a historian approve of the visual representation?
3. PRODUCTION QUALITY: Lighting quality, resolution suggestions, professional polish
4. DETAIL VERIFICATION: Anachronism detection (modern items in ancient settings)

## CONTEXT DATA
\`\`\`json
${JSON.stringify(context, null, 2)}
\`\`\`

## RESPOND IN JSON:
{
  "technicalAnalysis": "Overall assessment of historical accuracy and production quality",
  "eraAccuracyIssues": ["Specific historical inaccuracies detected"],
  "authenticityRecommendations": ["How to improve historical authenticity"],
  "qualityScore": 0-100,
  "priorityFeedback": {
    "accuracy": "Key accuracy insight",
    "authenticity": "Key authenticity insight",
    "quality": "Key quality insight"
  },
  "topIssues": ["Technical/authenticity issues to address"],
  "confidence": 0-100
}`;
  }

  /**
   * Classify video type to determine expert weighting
   */
  private classifyVideoType(context: any): 'action-heavy' | 'story-heavy' | 'historical' | 'balanced' {
    const topic = (context.topic || '').toLowerCase();
    const bpm = context.bpm || 120;
    const era = context.era || '';

    // Action-heavy: high BPM, battle/war themes
    if (bpm > 140 || topic.includes('battle') || topic.includes('war') || topic.includes('conquer')) {
      return 'action-heavy';
    }

    // Historical: ancient/medieval eras, specific historical figures
    if (
      era.includes('ancient') ||
      era.includes('medieval') ||
      era.includes('1') ||
      topic.includes('caesar') ||
      topic.includes('cleopatra') ||
      topic.includes('khan')
    ) {
      return 'historical';
    }

    // Story-heavy: drama, tragedy, redemption themes
    if (
      topic.includes('tragedy') ||
      topic.includes('redemption') ||
      topic.includes('rise') ||
      topic.includes('fall') ||
      topic.includes('story')
    ) {
      return 'story-heavy';
    }

    return 'balanced';
  }

  /**
   * Calculate expert weights based on video type
   */
  private calculateExpertWeights(videoType: 'action-heavy' | 'story-heavy' | 'historical' | 'balanced'): {
    gpt4o: number;
    gemini: number;
    claude: number;
  } {
    switch (videoType) {
      case 'action-heavy':
        return { gpt4o: 0.5, gemini: 0.25, claude: 0.25 }; // Motion expert prioritized
      case 'story-heavy':
        return { gpt4o: 0.25, gemini: 0.5, claude: 0.25 }; // Narrative expert prioritized
      case 'historical':
        return { gpt4o: 0.25, gemini: 0.25, claude: 0.5 }; // Technical/authenticity expert prioritized
      case 'balanced':
      default:
        return { gpt4o: 0.34, gemini: 0.33, claude: 0.33 }; // Equal weighting
    }
  }

  /**
   * Get Co-Reasoning Directive - Main entry point
   * Calls each modal expert and synthesizes into unified directive
   */
  async getCoReasoningDirective(context: any): Promise<CoReasoningDirective> {
    console.log(`🎬 [Co-Reasoning Director] Starting modal expert analysis...`);
    console.log(`   👁️ GPT-4o = ${MODAL_EXPERTS.gpt4o.role}`);
    console.log(`   📖 Gemini = ${MODAL_EXPERTS.gemini.role}`);
    console.log(`   🎭 Claude = ${MODAL_EXPERTS.claude.role}`);

    const videoType = this.classifyVideoType(context);
    const weights = this.calculateExpertWeights(videoType);
    console.log(
      `   📊 Video type: ${videoType}, weights: GPT=${weights.gpt4o}, Gemini=${weights.gemini}, Claude=${weights.claude}`,
    );

    // Call all three experts in parallel
    const [gptInsights, geminiInsights, claudeInsights] = await Promise.all([
      this.callGPT4oMotionExpert(context),
      this.callGeminiNarrativeExpert(context),
      this.callClaudeTechnicalExpert(context),
    ]);

    // Parse expert responses
    const gptParsed = this.parseExpertResponse(gptInsights, 'gpt4o');
    const geminiParsed = this.parseExpertResponse(geminiInsights, 'gemini');
    const claudeParsed = this.parseExpertResponse(claudeInsights, 'claude');

    // Synthesize with GPT-4o-mini
    console.log(`   ⚖️ GPT-4o-mini synthesizing unified directive...`);
    const unifiedDirective = await this.synthesizeDirective(gptParsed, geminiParsed, claudeParsed, weights, videoType);

    console.log(`✅ [Co-Reasoning Director] Complete (confidence: ${unifiedDirective.confidence}%)`);

    return unifiedDirective;
  }

  /**
   * Call GPT-4o Motion Expert
   */
  private async callGPT4oMotionExpert(context: any): Promise<string> {
    try {
      const motionModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        systemInstruction: `You are a ${MODAL_EXPERTS.gpt4o.role}. Focus exclusively on: ${MODAL_EXPERTS.gpt4o.focus}`,
      });

      const motionPrompt = this.getGPT4oMotionExpertPrompt(context);
      const motionResult = await motionModel.generateContent(motionPrompt);
      const text = motionResult.response.text();

      await apiCostTracker.trackGemini({
        model: 'gemini-2.5-flash',
        operation: 'co_reasoning_gemini_motion_expert',
        inputTokens: motionPrompt.length / 4,
        outputTokens: text.length / 4,
      });

      return text || '{}';
    } catch (error: any) {
      console.error(`❌ [Co-Reasoning] Motion Expert error:`, error.message);
      return '{}';
    }
  }

  /**
   * Call Gemini Narrative Expert
   */
  private async callGeminiNarrativeExpert(context: any): Promise<string> {
    try {
      const response = await gemini.models.generateContent({
        model: this.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: this.getGeminiNarrativeExpertPrompt(context) }] }],
      });

      await apiCostTracker.trackGemini({
        model: this.GEMINI_MODEL,
        operation: 'co_reasoning_gemini_narrative_expert',
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      });

      return response.text || response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    } catch (error: any) {
      console.error(`❌ [Co-Reasoning] Gemini Narrative Expert error:`, error.message);
      return '{}';
    }
  }

  /**
   * Call Claude Technical Expert
   */
  private async callClaudeTechnicalExpert(context: any): Promise<string> {
    try {
      const prompt = this.getClaudeTechnicalExpertPrompt(context);
      console.log(`   🧠 Calling Gemini Technical Expert...`);
      const result = await gemini.models.generateContent({
        model: this.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 2048, temperature: 0.5 },
      });

      const text = result.text || '{}';

      await apiCostTracker.trackGemini({
        model: this.GEMINI_MODEL,
        operation: 'co_reasoning_technical_expert_gemini',
        inputTokens: prompt.length / 4,
        outputTokens: text.length / 4,
      });

      return text;
    } catch (error: any) {
      console.error(`❌ [Co-Reasoning] Gemini Technical Expert error:`, error.message);
      return '{}';
    }
  }

  /**
   * Parse expert response into structured format
   */
  private parseExpertResponse(response: string, expert: keyof typeof MODAL_EXPERTS): ModalExpertInsight {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const expertDef = MODAL_EXPERTS[expert];

        return {
          expert,
          role: expertDef.role,
          insights: [parsed.motionAnalysis || parsed.narrativeAnalysis || parsed.technicalAnalysis || ''].filter(
            Boolean,
          ),
          priorityFeedback: parsed.priorityFeedback || {},
          confidence: parsed.confidence || parsed.pacingScore || parsed.coherenceScore || parsed.qualityScore || 50,
          warnings: parsed.topIssues || [],
        };
      }
    } catch (e) {
      console.warn(`⚠️ [Co-Reasoning] Failed to parse ${expert} response`);
    }

    return {
      expert,
      role: MODAL_EXPERTS[expert].role,
      insights: [],
      priorityFeedback: {},
      confidence: 0,
      warnings: [],
    };
  }

  /**
   * Synthesize expert insights into unified directive using GPT-4o-mini
   */
  private async synthesizeDirective(
    gpt: ModalExpertInsight,
    gemini: ModalExpertInsight,
    claude: ModalExpertInsight,
    weights: { gpt4o: number; gemini: number; claude: number },
    videoType: 'action-heavy' | 'story-heavy' | 'historical' | 'balanced',
  ): Promise<CoReasoningDirective> {
    const synthesisPrompt = `You are the DIRECTOR synthesizing insights from three specialized video production experts.

## VIDEO TYPE: ${videoType}
## EXPERT WEIGHTS: GPT-4o=${weights.gpt4o * 100}%, Gemini=${weights.gemini * 100}%, Claude=${weights.claude * 100}%

## GPT-4o (${MODAL_EXPERTS.gpt4o.role}):
${JSON.stringify(gpt, null, 2)}

## Gemini (${MODAL_EXPERTS.gemini.role}):
${JSON.stringify(gemini, null, 2)}

## Claude (${MODAL_EXPERTS.claude.role}):
${JSON.stringify(claude, null, 2)}

## YOUR TASK:
Create a unified production directive that:
1. Weighs each expert's input according to the video type
2. Prioritizes the most critical issues from the weighted perspective
3. Creates actionable recommendations that balance all concerns

Respond in JSON:
{
  "unifiedDirective": "One clear sentence summarizing the production priority",
  "synthesizedRecommendations": ["Top 5 actionable recommendations, ordered by weighted importance"],
  "criticalIssues": ["Issues that multiple experts flagged"],
  "confidence": 0-100
}`;

    try {
      const synthModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
        systemInstruction: 'You are a production director synthesizing expert insights into clear directives.',
      });

      const synthResult = await synthModel.generateContent(synthesisPrompt);
      const content = synthResult.response.text() || '{}';

      await apiCostTracker.trackGemini({
        model: 'gemini-2.5-flash',
        operation: 'co_reasoning_synthesis',
        inputTokens: synthesisPrompt.length / 4,
        outputTokens: content.length / 4,
      });
      const synthesis = JSON.parse(content);

      return {
        unifiedDirective: synthesis.unifiedDirective || 'Review expert insights individually.',
        expertInsights: [gpt, gemini, claude],
        synthesizedRecommendations: synthesis.synthesizedRecommendations || [],
        expertWeights: weights,
        videoTypeClassification: videoType,
        confidence:
          synthesis.confidence ||
          Math.round(
            gpt.confidence * weights.gpt4o + gemini.confidence * weights.gemini + claude.confidence * weights.claude,
          ),
      };
    } catch (error: any) {
      console.error(`❌ [Co-Reasoning] Synthesis error:`, error.message);
      return {
        unifiedDirective: 'Synthesis failed - review expert insights individually.',
        expertInsights: [gpt, gemini, claude],
        synthesizedRecommendations: [...gpt.warnings, ...gemini.warnings, ...claude.warnings].slice(0, 5),
        expertWeights: weights,
        videoTypeClassification: videoType,
        confidence: 30,
      };
    }
  }

  /**
   * Generate Modal Expert Feedback for clip prompts
   * Per-clip feedback from each specialist organized by priority areas
   */
  async generateModalExpertFeedback(
    clipPrompts: { index: number; prompt: string }[],
    packageContext: any,
  ): Promise<ModalExpertFeedbackResult> {
    console.log(`📋 [Co-Reasoning Director] Generating per-clip expert feedback for ${clipPrompts.length} clips...`);

    const videoType = this.classifyVideoType(packageContext);
    const weights = this.calculateExpertWeights(videoType);

    // Build context for experts
    const clipContext = {
      ...packageContext,
      videoType,
      clips: clipPrompts.map((c) => ({ index: c.index, promptPreview: c.prompt.substring(0, 200) })),
    };

    // Call experts in parallel with clip-focused prompts
    const [gptFeedback, geminiFeedback, claudeFeedback] = await Promise.all([
      this.getClipFeedbackFromGPT(clipPrompts, clipContext),
      this.getClipFeedbackFromGemini(clipPrompts, clipContext),
      this.getClipFeedbackFromClaude(clipPrompts, clipContext),
    ]);

    // Parse responses
    const gptParsed = this.parseClipFeedback(gptFeedback, 'gpt4o');
    const geminiParsed = this.parseClipFeedback(geminiFeedback, 'gemini');
    const claudeParsed = this.parseClipFeedback(claudeFeedback, 'claude');

    // Merge into unified clip feedback
    const clipFeedback: ClipFeedback[] = clipPrompts.map((clip, i) => ({
      clipIndex: clip.index,
      prompt: clip.prompt,
      expertFeedback: {
        gpt4o: gptParsed[i] || { areas: {}, confidence: 0 },
        gemini: geminiParsed[i] || { areas: {}, confidence: 0 },
        claude: claudeParsed[i] || { areas: {}, confidence: 0 },
      },
      unifiedSuggestion: this.synthesizeClipSuggestion(gptParsed[i], geminiParsed[i], claudeParsed[i], weights),
    }));

    // Calculate overall scores
    const avgGptConfidence = gptParsed.reduce((sum, f) => sum + (f?.confidence || 0), 0) / gptParsed.length || 0;
    const avgGeminiConfidence =
      geminiParsed.reduce((sum, f) => sum + (f?.confidence || 0), 0) / geminiParsed.length || 0;
    const avgClaudeConfidence =
      claudeParsed.reduce((sum, f) => sum + (f?.confidence || 0), 0) / claudeParsed.length || 0;

    // Collect all issues
    const allIssues = [
      ...gptParsed.flatMap((f) => f?.issues || []),
      ...geminiParsed.flatMap((f) => f?.issues || []),
      ...claudeParsed.flatMap((f) => f?.issues || []),
    ];
    const topIssues = [...new Set(allIssues)].slice(0, 10);

    console.log(`✅ [Co-Reasoning Director] Clip feedback complete (${clipFeedback.length} clips analyzed)`);

    return {
      clipFeedback,
      overallAnalysis: {
        motionScore: Math.round(avgGptConfidence),
        narrativeScore: Math.round(avgGeminiConfidence),
        authenticityScore: Math.round(avgClaudeConfidence),
      },
      topIssues,
      recommendations: this.generateOverallRecommendations(topIssues, weights),
    };
  }

  /**
   * Get clip-specific feedback from GPT-4o (Motion Expert)
   */
  private async getClipFeedbackFromGPT(clips: { index: number; prompt: string }[], context: any): Promise<string> {
    const prompt = `You are a ${MODAL_EXPERTS.gpt4o.role}. Analyze these ${clips.length} video clip prompts for MOTION and CINEMATOGRAPHY issues.

## CONTEXT
Era: ${context.era || 'Unknown'}
Topic: ${context.topic || 'Unknown'}
BPM: ${context.bpm || 120}

## CLIPS TO ANALYZE
${clips.map((c) => `[Clip ${c.index}]: ${c.prompt}`).join('\n\n')}

## FOR EACH CLIP, IDENTIFY:
1. Camera movement issues (too static? wrong type for emotion?)
2. Action choreography problems (unrealistic motion? timing issues?)
3. Visual pacing concerns (too slow? too fast for 5-second clips?)

Respond in JSON:
{
  "clipFeedback": [
    {
      "clipIndex": 0,
      "areas": {
        "motion": "Motion feedback",
        "cinematography": "Camera feedback",
        "visual_impact": "Impact feedback"
      },
      "confidence": 0-100,
      "issues": ["List of issues"]
    }
  ]
}`;

    try {
      const clipModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      });

      const clipResult = await clipModel.generateContent(prompt);
      const text = clipResult.response.text();

      await apiCostTracker.trackGemini({
        model: 'gemini-2.5-flash',
        operation: 'co_reasoning_clip_feedback_gemini',
        inputTokens: prompt.length / 4,
        outputTokens: text.length / 4,
      });

      return text || '{}';
    } catch (error: any) {
      console.error(`❌ [Co-Reasoning] Gemini clip feedback error:`, error.message);
      return '{}';
    }
  }

  /**
   * Get clip-specific feedback from Gemini (Narrative Expert)
   */
  private async getClipFeedbackFromGemini(clips: { index: number; prompt: string }[], context: any): Promise<string> {
    const prompt = `You are a ${MODAL_EXPERTS.gemini.role}. Analyze these ${clips.length} video clip prompts for NARRATIVE CONTINUITY issues.

## CONTEXT
Era: ${context.era || 'Unknown'}
Topic: ${context.topic || 'Unknown'}
Characters: ${context.characters?.join(', ') || 'Unknown'}

## CLIPS TO ANALYZE (in sequence)
${clips.map((c) => `[Clip ${c.index}]: ${c.prompt}`).join('\n\n')}

## FOR EACH CLIP, IDENTIFY:
1. Character consistency issues (costume/appearance changes between clips?)
2. Story flow problems (does this clip connect logically to previous/next?)
3. Temporal coherence concerns (time-of-day jumps? setting inconsistencies?)

Respond in JSON:
{
  "clipFeedback": [
    {
      "clipIndex": 0,
      "areas": {
        "continuity": "Continuity feedback",
        "narrative": "Narrative flow feedback",
        "consistency": "Character consistency feedback"
      },
      "confidence": 0-100,
      "issues": ["List of issues"]
    }
  ]
}`;

    try {
      const response = await gemini.models.generateContent({
        model: this.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      await apiCostTracker.trackGemini({
        model: this.GEMINI_MODEL,
        operation: 'co_reasoning_clip_feedback_gemini',
        inputTokens: response.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
      });

      return response.text || '{}';
    } catch (error: any) {
      console.error(`❌ [Co-Reasoning] Gemini clip feedback error:`, error.message);
      return '{}';
    }
  }

  /**
   * Get clip-specific feedback from Gemini (Technical Expert)
   */
  private async getClipFeedbackFromClaude(clips: { index: number; prompt: string }[], context: any): Promise<string> {
    if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
      return '{}';
    }

    const prompt = `You are a ${MODAL_EXPERTS.claude.role}. Analyze these ${clips.length} video clip prompts for HISTORICAL ACCURACY and PRODUCTION QUALITY issues.

## CONTEXT
Era: ${context.era || 'Unknown'}
Historical Period: ${context.historicalPeriod || 'Unknown'}
Topic: ${context.topic || 'Unknown'}

## CLIPS TO ANALYZE
${clips.map((c) => `[Clip ${c.index}]: ${c.prompt}`).join('\n\n')}

## FOR EACH CLIP, IDENTIFY:
1. Era accuracy issues (anachronistic items? wrong architecture/costumes for period?)
2. Historical authenticity concerns (would a historian approve?)
3. Production quality problems (lighting descriptions? detail level?)

Respond in JSON:
{
  "clipFeedback": [
    {
      "clipIndex": 0,
      "areas": {
        "accuracy": "Era accuracy feedback",
        "authenticity": "Historical authenticity feedback",
        "quality": "Production quality feedback"
      },
      "confidence": 0-100,
      "issues": ["List of issues"]
    }
  ]
}`;

    try {
      const result = await gemini.models.generateContent({
        model: this.GEMINI_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { maxOutputTokens: 4096, temperature: 0.5 },
      });

      const text = result.text || '{}';

      await apiCostTracker.trackGemini({
        model: this.GEMINI_MODEL,
        operation: 'co_reasoning_clip_feedback_gemini',
        inputTokens: prompt.length / 4,
        outputTokens: text.length / 4,
      });

      return text;
    } catch (error: any) {
      console.error(`❌ [Co-Reasoning] Gemini clip feedback error:`, error.message);
      return '{}';
    }
  }

  /**
   * Parse clip feedback response
   */
  private parseClipFeedback(
    response: string,
    expert: keyof typeof MODAL_EXPERTS,
  ): { areas: Record<string, string>; confidence: number; issues?: string[] }[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.clipFeedback || [];
      }
    } catch (e) {
      console.warn(`⚠️ [Co-Reasoning] Failed to parse ${expert} clip feedback`);
    }
    return [];
  }

  /**
   * Synthesize clip suggestion from expert feedback
   */
  private synthesizeClipSuggestion(
    gpt: { areas: Record<string, string>; confidence: number; issues?: string[] } | undefined,
    gemini: { areas: Record<string, string>; confidence: number; issues?: string[] } | undefined,
    claude: { areas: Record<string, string>; confidence: number; issues?: string[] } | undefined,
    weights: { gpt4o: number; gemini: number; claude: number },
  ): string {
    const suggestions: string[] = [];

    // Prioritize by weight
    if (weights.gpt4o >= 0.4 && gpt?.issues?.length) {
      suggestions.push(`Motion: ${gpt.issues[0]}`);
    }
    if (weights.gemini >= 0.4 && gemini?.issues?.length) {
      suggestions.push(`Narrative: ${gemini.issues[0]}`);
    }
    if (weights.claude >= 0.4 && claude?.issues?.length) {
      suggestions.push(`Authenticity: ${claude.issues[0]}`);
    }

    // If no priority, add first available
    if (suggestions.length === 0) {
      if (gpt?.issues?.length) suggestions.push(gpt.issues[0]);
      else if (gemini?.issues?.length) suggestions.push(gemini.issues[0]);
      else if (claude?.issues?.length) suggestions.push(claude.issues[0]);
    }

    return suggestions.join(' | ') || 'No issues detected';
  }

  /**
   * Generate overall recommendations from issues
   */
  private generateOverallRecommendations(
    issues: string[],
    weights: { gpt4o: number; gemini: number; claude: number },
  ): string[] {
    const recommendations: string[] = [];

    // Group by area
    const motionIssues = issues.filter(
      (i) =>
        i.toLowerCase().includes('motion') || i.toLowerCase().includes('camera') || i.toLowerCase().includes('action'),
    );
    const narrativeIssues = issues.filter(
      (i) =>
        i.toLowerCase().includes('continuity') ||
        i.toLowerCase().includes('character') ||
        i.toLowerCase().includes('story'),
    );
    const authenticityIssues = issues.filter(
      (i) =>
        i.toLowerCase().includes('era') ||
        i.toLowerCase().includes('historical') ||
        i.toLowerCase().includes('accuracy'),
    );

    if (motionIssues.length > 2) {
      recommendations.push(`Focus on camera movement variety - ${motionIssues.length} motion issues detected`);
    }
    if (narrativeIssues.length > 2) {
      recommendations.push(`Improve character consistency - ${narrativeIssues.length} continuity issues detected`);
    }
    if (authenticityIssues.length > 2) {
      recommendations.push(`Review historical accuracy - ${authenticityIssues.length} authenticity issues detected`);
    }

    // Add weight-based priority
    const priorityArea =
      weights.gpt4o >= weights.gemini && weights.gpt4o >= weights.claude
        ? 'motion quality'
        : weights.gemini >= weights.claude
          ? 'narrative flow'
          : 'historical accuracy';
    recommendations.push(`Primary focus for this video type: ${priorityArea}`);

    return recommendations;
  }

  /**
   * Get modal expert definitions for external use
   */
  getModalExperts() {
    return MODAL_EXPERTS;
  }
}

export const coReasoningDirector = new CoReasoningDirector();
export { MODAL_EXPERTS };
