/**
 * WORLD MODEL SIMULATION SERVICE
 *
 * Previews clips in "latent space" before expensive Kling generation.
 * Uses GPT-4o to analyze prompts for:
 * - Physical/historical plausibility
 * - Motion feasibility
 * - Character consistency
 * - Continuity between clips
 * - Lighting/scene coherence
 *
 * Saves money by catching issues BEFORE API calls to Kling.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { TemporalNarrativeAtom } from './narrative-tna-service';

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
// TYPES
// ============================================================================

export type IssueType =
  | 'anachronism'
  | 'motion_impossible'
  | 'character_drift'
  | 'continuity_break'
  | 'lighting_mismatch';

export interface PredictedIssue {
  type: IssueType;
  description: string;
  confidence: number;
  suggestedFix: string;
}

export interface SimulationResult {
  clipIndex: number;
  prompt: string;
  predictedIssues: PredictedIssue[];
  physicsPlausibility: number;
  narrativeAlignment: number;
  predictedQualityScore: number;
  shouldGenerate: boolean;
  recommendedPromptRevision?: string;
  worldStateAfter?: WorldState;
}

export interface WorldState {
  currentScene: {
    location: string;
    lighting: string;
    timeOfDay: string;
    weather: string;
  };
  characters: Array<{
    name: string;
    appearance: string;
    position: string;
    lastAction: string;
  }>;
  props: Array<{
    name: string;
    state: string;
    location: string;
  }>;
  narrativePosition: number;
}

export interface HistoricalContext {
  figureName: string;
  era: string;
  dateRange: string;
  forbiddenItems: string[];
  expectedAppearance: string[];
  archetype: string;
}

export interface CharacterInfo {
  name: string;
  appearance: string;
  archetype: string;
  era: string;
}

export interface PackageContext {
  packageId: string;
  topic: string;
  era: string;
  dateRange: string;
  characters: CharacterInfo[];
  deepResearch?: any;
}

export interface PreflightResult {
  passRate: number;
  totalClips: number;
  predictedPasses: number;
  predictedFailures: number;
  estimatedSavings: number;
  results: SimulationResult[];
  suggestions: string[];
  autoFixedPrompts?: Map<number, string>;
}

export interface CostSavingsLog {
  packageId: string;
  simulatedAt: Date;
  totalClips: number;
  issuesCaught: number;
  estimatedSavings: number;
  actualOutcome?: {
    regenerationsAvoided: number;
    actualSavings: number;
  };
}

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const SIMULATION_SYSTEM_PROMPT = `You are a World Model Simulator that predicts whether a video prompt will generate successfully in Kling 2.5 Turbo.

Your job is to analyze prompts BEFORE they are sent to the video generation API and identify potential issues.

## WHAT YOU CHECK

1. **PHYSICS PLAUSIBILITY (0-100)**
   - Can the described motion complete in 5 seconds?
   - Are movements physically possible?
   - Is the action clear and executable?
   - Red flags: teleportation, instant costume changes, impossible speeds

2. **HISTORICAL ACCURACY (Anachronisms)**
   - Does the prompt contain items that didn't exist in the given era?
   - Common anachronisms: wristwatches, glasses, zippers, modern architecture
   - Check weapons, clothing, technology against the time period

3. **MOTION FEASIBILITY**
   - Can Kling render this motion smoothly?
   - Red flags: multiple people, complex VFX, magical effects, morphing
   - Red flags: whip pans, drone shots, split screens

4. **CHARACTER CONSISTENCY**
   - Does the character description match previous clips?
   - Is appearance consistent (age, clothing, features)?
   - Red flags: costume changes without scene transition, age shifts

5. **CONTINUITY WITH PREVIOUS STATE**
   - Does lighting match the scene (can't go from day to night instantly)?
   - Is the character in a plausible position given their last action?
   - Do props maintain their state?

6. **LIGHTING COHERENCE**
   - Is lighting consistent within the 5-second clip?
   - Does it match the time of day and setting?
   - Red flags: sudden lighting changes, mismatched shadows

## OUTPUT FORMAT

Return JSON:
{
  "physicsPlausibility": <0-100>,
  "narrativeAlignment": <0-100>,
  "predictedQualityScore": <0-100>,
  "issues": [
    {
      "type": "anachronism|motion_impossible|character_drift|continuity_break|lighting_mismatch",
      "description": "<specific issue>",
      "confidence": <0-100>,
      "suggestedFix": "<how to fix>"
    }
  ],
  "worldStateAfter": {
    "currentScene": {
      "location": "<where we end up>",
      "lighting": "<lighting state>",
      "timeOfDay": "<time>",
      "weather": "<weather>"
    },
    "characters": [
      {
        "name": "<character name>",
        "appearance": "<current appearance>",
        "position": "<where they are>",
        "lastAction": "<what they just did>"
      }
    ],
    "props": [
      {
        "name": "<prop>",
        "state": "<current state>",
        "location": "<where it is>"
      }
    ],
    "narrativePosition": <0-1>
  },
  "recommendedRevision": "<improved prompt if issues found, or null>"
}

## SCORING GUIDELINES

- **90-100**: Perfect prompt, will generate well
- **70-89**: Minor issues, likely to pass (acceptable quality)
- **50-69**: Significant issues, may need revision (warning level)
- **0-49**: Critical issues, will likely fail (high risk)

QUALITY THRESHOLD: 70 (prompts below this are flagged for review/auto-fix)

NOTE: The 70 threshold is used for prediction and auto-fix triggering.
Prompts scoring below 70 will be flagged and offered revisions, but generation
will still proceed. This allows the pipeline to complete while surfacing risks.`;

const SEQUENCE_ANALYSIS_PROMPT = `You are analyzing a SEQUENCE of video prompts for continuity and narrative flow.

Track the world state through each clip:
1. Character positions and actions
2. Scene/location changes
3. Lighting progression (time of day)
4. Prop states
5. Narrative arc position (0=beginning, 0.5=midpoint, 1=resolution)

Identify:
- Continuity breaks between clips
- Impossible transitions (teleportation, instant lighting changes)
- Character drift (appearance inconsistencies)
- Narrative gaps or jumps

For each clip, output the world state AFTER that clip completes.`;

// ============================================================================
// WORLD MODEL SIMULATOR CLASS
// ============================================================================

class WorldModelSimulator {
  /**
   * QUALITY THRESHOLD DOCUMENTATION
   *
   * This threshold (70%) determines which individual clips are predicted to pass/fail.
   * It is used for:
   * 1. Marking clips as "shouldGenerate" in simulation results
   * 2. Triggering auto-fix attempts for low-quality prompts
   * 3. Calculating pass rate statistics
   *
   * IMPORTANT: This threshold is for PREDICTION only - it does NOT block generation.
   * The system will WARN but PROCEED with generation regardless of pass rate.
   *
   * Threshold rationale:
   * - Set at 70% to balance false positives vs false negatives
   * - GPT-4o scoring guidelines (line 222-228) treat 70+ as "likely to pass"
   * - Below 70 indicates "significant issues, may need revision"
   *
   * Pass Rate Interpretation (for entire sequence):
   * - 90%+: Excellent - all clips predicted to pass, minimal risk
   * - 70-89%: Good - most clips will pass, acceptable risk level
   * - 50-69%: Warning - significant portion may fail, review recommended
   * - <50%: High risk - major issues detected, strong revision needed
   *
   * Note: The system provides suggestions and auto-fixes but always proceeds with generation.
   * This is by design to allow the pipeline to complete while surfacing potential issues.
   */
  private readonly QUALITY_THRESHOLD = 70;
  private readonly KLING_COST_PER_CLIP = 0.35; // Approximate cost per 5s clip
  private costSavingsLogs: CostSavingsLog[] = [];

  /**
   * Simulate a single clip against the current world state
   */
  async simulateClip(
    prompt: string,
    worldState: WorldState,
    historicalContext: HistoricalContext,
    clipIndex: number = 0,
  ): Promise<SimulationResult> {
    console.log(`🔮 [WorldModel] Simulating clip ${clipIndex}...`);

    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
        systemInstruction: SIMULATION_SYSTEM_PROMPT,
      });

      const userPrompt = `Analyze this video prompt for potential issues.

HISTORICAL CONTEXT:
- Figure: ${historicalContext.figureName}
- Era: ${historicalContext.era}
- Date Range: ${historicalContext.dateRange}
- Archetype: ${historicalContext.archetype}
- Forbidden Items: ${historicalContext.forbiddenItems.join(', ') || 'None specified'}
- Expected Appearance: ${historicalContext.expectedAppearance.join(', ') || 'Not specified'}

CURRENT WORLD STATE:
${JSON.stringify(worldState, null, 2)}

PROMPT TO ANALYZE (Clip #${clipIndex}):
${prompt}

Analyze for physics plausibility, historical accuracy, motion feasibility, character consistency, and continuity.`;

      const geminiResult = await model.generateContent(userPrompt);
      const content = geminiResult.response.text();
      if (!content) {
        throw new Error('No response from Gemini');
      }

      const analysis = JSON.parse(content);

      const predictedQuality =
        analysis.predictedQualityScore ?? Math.round((analysis.physicsPlausibility + analysis.narrativeAlignment) / 2);

      const result: SimulationResult = {
        clipIndex,
        prompt,
        predictedIssues: (analysis.issues || []).map((issue: any) => ({
          type: issue.type as IssueType,
          description: issue.description,
          confidence: issue.confidence,
          suggestedFix: issue.suggestedFix,
        })),
        physicsPlausibility: analysis.physicsPlausibility ?? 75,
        narrativeAlignment: analysis.narrativeAlignment ?? 75,
        predictedQualityScore: predictedQuality,
        shouldGenerate: predictedQuality >= this.QUALITY_THRESHOLD,
        recommendedPromptRevision: analysis.recommendedRevision || undefined,
        worldStateAfter: analysis.worldStateAfter || worldState,
      };

      console.log(
        `✅ [WorldModel] Clip ${clipIndex}: Score ${result.predictedQualityScore}, ${result.predictedIssues.length} issues`,
      );
      return result;
    } catch (error: any) {
      console.error(`❌ [WorldModel] Simulation failed for clip ${clipIndex}:`, error.message);

      return {
        clipIndex,
        prompt,
        predictedIssues: [
          {
            type: 'continuity_break',
            description: `Simulation failed: ${error.message}`,
            confidence: 50,
            suggestedFix: 'Review prompt manually',
          },
        ],
        physicsPlausibility: 50,
        narrativeAlignment: 50,
        predictedQualityScore: 50,
        shouldGenerate: false,
        worldStateAfter: worldState,
      };
    }
  }

  /**
   * Simulate an entire sequence of prompts with progressive world state tracking
   */
  async simulateSequence(
    prompts: string[],
    tnas: TemporalNarrativeAtom[],
    characterInfo: CharacterInfo[],
  ): Promise<SimulationResult[]> {
    console.log(`🎬 [WorldModel] Simulating sequence of ${prompts.length} clips...`);

    const results: SimulationResult[] = [];

    let worldState: WorldState = this.initializeWorldState(characterInfo, tnas);

    const historicalContext: HistoricalContext = {
      figureName: characterInfo[0]?.name || 'Unknown',
      era: characterInfo[0]?.era || 'Unknown Era',
      dateRange: 'Unknown',
      forbiddenItems: this.getEraForbiddenItems(characterInfo[0]?.era || ''),
      expectedAppearance: characterInfo.map((c) => c.appearance),
      archetype: characterInfo[0]?.archetype || 'warrior',
    };

    for (let i = 0; i < prompts.length; i++) {
      const narrativePosition = prompts.length > 1 ? i / (prompts.length - 1) : 0.5;
      worldState.narrativePosition = narrativePosition;

      const result = await this.simulateClip(prompts[i], worldState, historicalContext, i);

      if (result.worldStateAfter) {
        worldState = result.worldStateAfter;
      }

      results.push(result);
    }

    console.log(
      `✅ [WorldModel] Sequence simulation complete: ${results.filter((r) => r.shouldGenerate).length}/${prompts.length} passed`,
    );
    return results;
  }

  /**
   * Run preflight check before ANY Kling API calls
   * Returns pass rate and suggestions for improvement
   */
  async preflightCheck(
    prompts: string[],
    packageContext: PackageContext,
    autoFix: boolean = true,
  ): Promise<PreflightResult> {
    console.log(`🚀 [WorldModel] Running preflight check for ${prompts.length} prompts...`);

    const tnas: TemporalNarrativeAtom[] = [];

    // AI-FIXED: Check if characters exists before accessing .length (GPT-5.2 + Claude consensus)
    const characterInfo: CharacterInfo[] =
      packageContext.characters && packageContext.characters.length > 0
        ? packageContext.characters
        : [
            {
              name: packageContext.topic,
              appearance: 'Historical figure in period-appropriate attire',
              archetype: 'warrior',
              era: packageContext.era,
            },
          ];

    const results = await this.simulateSequence(prompts, tnas, characterInfo);

    const predictedPasses = results.filter((r) => r.shouldGenerate).length;
    const predictedFailures = results.length - predictedPasses;
    const passRate = (predictedPasses / results.length) * 100;

    const suggestions: string[] = [];

    // PASS RATE EVALUATION LOGIC
    // This evaluates the overall sequence pass rate and provides warnings/suggestions.
    // CRITICAL: This does NOT block generation - it only warns and suggests improvements.
    //
    // The 70% threshold here means:
    // - If <70% of clips are predicted to pass, trigger warnings and auto-fix
    // - The system will still proceed with generation even if pass rate is 0%
    // - Users see warnings but pipeline continues to allow for false positives
    if (passRate < 70) {
      // Determine warning severity based on pass rate
      let severityPrefix = '⚠️';
      let actionVerb = 'Consider revising';

      if (passRate < 50) {
        severityPrefix = '🚨';
        actionVerb = 'Strongly recommend revising';
      }

      suggestions.push(
        `${severityPrefix} Only ${passRate.toFixed(1)}% of clips predicted to pass. ${actionVerb} prompts before generation. (Generation will proceed regardless)`,
      );

      // Log warning to console for visibility
      console.log(
        `${severityPrefix} [WorldModel] Low pass rate: ${passRate.toFixed(1)}% - but proceeding with generation...`,
      );

      // Identify most common issue types to help with targeted fixes
      const issueTypes = new Map<IssueType, number>();
      results.forEach((r) => {
        r.predictedIssues.forEach((issue) => {
          issueTypes.set(issue.type, (issueTypes.get(issue.type) || 0) + 1);
        });
      });

      const sortedIssues = Array.from(issueTypes.entries()).sort((a, b) => b[1] - a[1]);

      if (sortedIssues.length > 0) {
        suggestions.push(`Most common issue: ${sortedIssues[0][0]} (${sortedIssues[0][1]} occurrences)`);
      }
    } else if (passRate >= 90) {
      console.log(
        `✅ [WorldModel] Excellent pass rate: ${passRate.toFixed(1)}% - high confidence in generation quality`,
      );
    } else {
      console.log(`✓ [WorldModel] Good pass rate: ${passRate.toFixed(1)}% - acceptable quality level`);
    }

    let autoFixedPrompts: Map<number, string> | undefined;

    // Auto-fix logic: Only attempt fixes if pass rate is below threshold
    // This tries to improve prompts automatically before generation
    if (autoFix && passRate < 70) {
      console.log(`🔧 [WorldModel] Attempting auto-fix for prompts below quality threshold...`);
      autoFixedPrompts = await this.getPromptRevisions(results);
      if (autoFixedPrompts.size > 0) {
        suggestions.push(`Auto-fixed ${autoFixedPrompts.size} prompts with predicted issues.`);
      }
    }

    const estimatedSavings = this.calculateCostSavings(results);

    this.logCostSavings({
      packageId: packageContext.packageId,
      simulatedAt: new Date(),
      totalClips: prompts.length,
      issuesCaught: predictedFailures,
      estimatedSavings,
    });

    console.log(
      `📊 [WorldModel] Preflight complete: ${passRate.toFixed(1)}% pass rate, $${estimatedSavings.toFixed(2)} potential savings`,
    );

    return {
      passRate,
      totalClips: prompts.length,
      predictedPasses,
      predictedFailures,
      estimatedSavings,
      results,
      suggestions,
      autoFixedPrompts,
    };
  }

  /**
   * Generate revised prompts for clips that failed simulation
   */
  async getPromptRevisions(simulationResults: SimulationResult[]): Promise<Map<number, string>> {
    const revisions = new Map<number, string>();

    const failedResults = simulationResults.filter((r) => !r.shouldGenerate);

    if (failedResults.length === 0) {
      return revisions;
    }

    console.log(`🔧 [WorldModel] Generating revisions for ${failedResults.length} failed prompts...`);

    for (const result of failedResults) {
      if (result.recommendedPromptRevision) {
        revisions.set(result.clipIndex, result.recommendedPromptRevision);
      } else {
        const revised = await this.generateRevision(result);
        if (revised) {
          revisions.set(result.clipIndex, revised);
        }
      }
    }

    console.log(`✅ [WorldModel] Generated ${revisions.size} prompt revisions`);
    return revisions;
  }

  /**
   * Generate a revised prompt for a failed simulation
   */
  private async generateRevision(result: SimulationResult): Promise<string | null> {
    try {
      const issueDescriptions = result.predictedIssues
        .map((i) => `- ${i.type}: ${i.description}. Fix: ${i.suggestedFix}`)
        .join('\n');

      const revisionSysPrompt = `You are a video prompt revision specialist. Given an original prompt and its issues, create a fixed version that:
1. Maintains the core narrative intent
2. Removes anachronisms
3. Makes motion physically plausible for 5-second clips
4. Ensures character consistency
5. Fixes lighting/continuity issues

Return ONLY the revised prompt, no explanation.`;

      const revisionModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.5, maxOutputTokens: 500 },
        systemInstruction: revisionSysPrompt,
      });

      const revisionPrompt = `ORIGINAL PROMPT:
${result.prompt}

ISSUES FOUND:
${issueDescriptions}

SCORES:
- Physics Plausibility: ${result.physicsPlausibility}/100
- Narrative Alignment: ${result.narrativeAlignment}/100
- Overall Quality: ${result.predictedQualityScore}/100

Create a revised prompt that fixes these issues while preserving the narrative intent.`;

      const revisionResult = await revisionModel.generateContent(revisionPrompt);
      return revisionResult.response.text()?.trim() || null;
    } catch (error: any) {
      console.error(`❌ [WorldModel] Revision generation failed:`, error.message);
      return null;
    }
  }

  /**
   * Initialize world state from character info and TNAs
   */
  private initializeWorldState(characterInfo: CharacterInfo[], tnas: TemporalNarrativeAtom[]): WorldState {
    return {
      currentScene: {
        location: 'Unknown',
        lighting: 'natural daylight',
        timeOfDay: 'day',
        weather: 'clear',
      },
      characters: characterInfo.map((c) => ({
        name: c.name,
        appearance: c.appearance,
        position: 'center frame',
        lastAction: 'none',
      })),
      props: [],
      narrativePosition: 0,
    };
  }

  /**
   * Get list of items forbidden for a given era
   */
  private getEraForbiddenItems(era: string): string[] {
    const eraLower = era.toLowerCase();

    const modernItems = [
      'wristwatch',
      'glasses',
      'sunglasses',
      'zipper',
      'plastic',
      'modern buttons',
      'velcro',
      'synthetic fabric',
      'sneakers',
      'digital display',
      'electricity',
      'light bulb',
      'car',
      'airplane',
    ];

    if (eraLower.includes('ancient') || eraLower.includes('roman') || eraLower.includes('greek')) {
      return [...modernItems, 'stirrups', 'crossbow', 'gunpowder', 'paper'];
    }

    if (eraLower.includes('medieval') || eraLower.includes('1200') || eraLower.includes('1300')) {
      return [...modernItems, 'musket', 'telescope', 'printing press'];
    }

    if (eraLower.includes('mongol') || eraLower.includes('khan')) {
      return [...modernItems, 'musket', 'cannon', 'printing press', 'compass'];
    }

    if (eraLower.includes('egyptian') || eraLower.includes('pharaoh')) {
      return [...modernItems, 'iron weapons', 'horse cavalry', 'crossbow'];
    }

    return modernItems;
  }

  /**
   * Calculate estimated cost savings from catching issues early
   */
  private calculateCostSavings(results: SimulationResult[]): number {
    const failedClips = results.filter((r) => !r.shouldGenerate);

    const regenerationRate = 0.7;
    const expectedRegenerations = failedClips.length * regenerationRate;

    return expectedRegenerations * this.KLING_COST_PER_CLIP;
  }

  /**
   * Log cost savings for tracking
   */
  private logCostSavings(log: CostSavingsLog): void {
    this.costSavingsLogs.push(log);

    if (this.costSavingsLogs.length > 1000) {
      this.costSavingsLogs = this.costSavingsLogs.slice(-500);
    }

    console.log(
      `💰 [WorldModel] Cost savings logged: $${log.estimatedSavings.toFixed(2)} (${log.issuesCaught} issues caught)`,
    );
  }

  /**
   * Get cost savings statistics
   */
  getCostSavingsStats(): {
    totalSimulations: number;
    totalIssuesCaught: number;
    totalEstimatedSavings: number;
    averageSavingsPerPackage: number;
  } {
    const totalSimulations = this.costSavingsLogs.length;
    const totalIssuesCaught = this.costSavingsLogs.reduce((sum, log) => sum + log.issuesCaught, 0);
    const totalEstimatedSavings = this.costSavingsLogs.reduce((sum, log) => sum + log.estimatedSavings, 0);

    return {
      totalSimulations,
      totalIssuesCaught,
      totalEstimatedSavings,
      averageSavingsPerPackage: totalSimulations > 0 ? totalEstimatedSavings / totalSimulations : 0,
    };
  }

  /**
   * Update a cost savings log with actual outcome data
   */
  updateActualOutcome(packageId: string, regenerationsAvoided: number, actualSavings: number): void {
    const log = this.costSavingsLogs.find((l) => l.packageId === packageId);
    if (log) {
      log.actualOutcome = {
        regenerationsAvoided,
        actualSavings,
      };
      console.log(`📊 [WorldModel] Updated actual outcome for ${packageId}: $${actualSavings.toFixed(2)} saved`);
    }
  }

  /**
   * Quick check for a single prompt without full simulation
   */
  async quickCheck(
    prompt: string,
    era: string,
  ): Promise<{
    likely_pass: boolean;
    quick_issues: string[];
  }> {
    const forbiddenItems = this.getEraForbiddenItems(era);
    const promptLower = prompt.toLowerCase();

    const quick_issues: string[] = [];

    for (const item of forbiddenItems) {
      if (promptLower.includes(item.toLowerCase())) {
        quick_issues.push(`Possible anachronism: "${item}" may not exist in ${era}`);
      }
    }

    const impossibleMotions = [
      'teleport',
      'morph',
      'transform',
      'shapeshift',
      'fly through',
      'phase through',
      'disappear',
      'materialize',
    ];

    for (const motion of impossibleMotions) {
      if (promptLower.includes(motion)) {
        quick_issues.push(`Impossible motion detected: "${motion}"`);
      }
    }

    const vfxTerms = [
      'glow',
      'glowing',
      'magical',
      'supernatural',
      'energy beam',
      'particle',
      'aura',
      'spirit',
      'ghost',
      'phantom',
    ];

    for (const vfx of vfxTerms) {
      if (promptLower.includes(vfx)) {
        quick_issues.push(`VFX term detected (Kling can't render): "${vfx}"`);
      }
    }

    return {
      likely_pass: quick_issues.length === 0,
      quick_issues,
    };
  }
}

export const worldModelSimulator = new WorldModelSimulator();
