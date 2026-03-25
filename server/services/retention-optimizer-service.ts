/**
 * RETENTION OPTIMIZER SERVICE
 *
 * Applies 2025 YouTube Shorts retention research to video generation:
 * - 75-80% Viewed-vs-Swiped target
 * - Pattern interrupts every 2-3 seconds (58% vs 41% retention)
 * - Mid-video hooks at 60s/120s for 3-minute Shorts
 * - Deceptive cadence (V→vi) for perfect loops
 * - Psychological trigger matrix for engagement KPIs
 * - Cognitive Load Theory: snackable re-engagement loops
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

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
// RETENTION BENCHMARKS (2025 YouTube Shorts Research)
// ============================================================================

export const RETENTION_BENCHMARKS = {
  viewedVsSwiped: { good: 0.75, excellent: 0.8, description: 'Must stop 7-8 out of 10 scrollers' },
  averagePercentViewed: { good: 0.7, excellent: 0.9, description: 'Viral-level retention' },
  thirtySecondRetention: { critical: 0.5, description: 'Algorithm anchor point' },
  completionRate: { good: 0.6, excellent: 0.7, description: 'Higher than long-form' },
  engagementRate: { good: 0.09, excellent: 0.11, description: 'Likes + comments + shares' },
  patternInterruptInterval: { optimal: 3, max: 5, description: '58% vs 41% retention' },
  hookWindowSeconds: { critical: 3, description: 'Valley of death - most viewers lost here' },
};

export const EMOTIONAL_TRIGGERS = {
  awe_surprise: {
    actions: ['share', 'comment'],
    weight: 1.0,
    description: 'Sense of discovery and wonder',
    historyExamples: ['Surprising scientific fact from the past', 'Ancient craft demonstration'],
  },
  humor_joy: {
    actions: ['tag_friends', 'share'],
    weight: 0.9,
    description: 'High relatability and positive connection',
    historyExamples: ['Bizarre historical customs', 'Absurd historical inventions'],
  },
  anger_outrage: {
    actions: ['share', 'comment'],
    weight: 0.85,
    description: 'Need to voice opinion or raise awareness',
    historyExamples: ['Historical injustices', 'Forgotten atrocities', 'Controversial figures'],
  },
  empathy: {
    actions: ['follow', 'comment'],
    weight: 0.8,
    description: 'Connection through stories of struggle and hope',
    historyExamples: ['Day in the life of ordinary people', 'Personal sacrifice narratives'],
  },
  fear_fomo: {
    actions: ['click', 'participate'],
    weight: 0.75,
    description: 'Urgency to stay informed',
    historyExamples: ['Historical anniversaries', 'Trending movie tie-ins'],
  },
};

export const PATTERN_INTERRUPT_TYPES = {
  zoom_transition: { effectiveness: 'high', description: 'Refocuses attention on facial expressions or details' },
  dynamic_text: { effectiveness: 'high', description: 'Previews upcoming value (e.g., "Wait for the 1945 reveal")' },
  broll_integration: { effectiveness: 'moderate', description: 'Illustrates a concept described in narration' },
  jump_cut: { effectiveness: 'high', description: 'Removes silences, increases pacing' },
  color_shift: { effectiveness: 'moderate', description: 'Signals narrative change' },
  whip_pan: { effectiveness: 'high', description: 'Hides cuts, creates continuous motion' },
};

export const SMART_CHAPTERS = {
  threeMinute: [
    { time: 0, label: 'The Setup', description: 'Hook + context establishment' },
    { time: 60, label: 'The Conflict', description: 'Rising tension, pattern interrupt' },
    { time: 120, label: 'The Payoff', description: 'Climax + deceptive cadence loop' },
  ],
  ninetySeconds: [
    { time: 0, label: 'The Hook', description: 'Promise-proof-payoff in 3 seconds' },
    { time: 30, label: 'The Build', description: 'Rising action, 30s retention anchor' },
    { time: 60, label: 'The Turn', description: 'Narrative twist or revelation' },
  ],
  sixtySeconds: [
    { time: 0, label: 'The Hook', description: 'Mid-action opening' },
    { time: 20, label: 'The Story', description: 'Core narrative' },
    { time: 45, label: 'The Loop', description: 'Deceptive cadence ending' },
  ],
};

// ============================================================================
// TYPES
// ============================================================================

export interface PatternInterrupt {
  timestamp: number;
  type: keyof typeof PATTERN_INTERRUPT_TYPES;
  description: string;
  clipIndex?: number;
}

export interface HookPoint {
  timestamp: number;
  hookType: 'blind_turn' | 'curiosity_gap' | 'narrative_twist' | 'emotional_peak';
  suggestion: string;
  chapterLabel?: string;
}

export interface EmotionalTrigger {
  type: keyof typeof EMOTIONAL_TRIGGERS;
  strength: number;
  timestamp?: number;
  textExcerpt?: string;
  suggestedAction: string[];
}

export interface LoopAnalysis {
  loopPotential: number;
  cadenceType: 'deceptive' | 'authentic' | 'half' | 'unknown';
  crossFadeDuration: number;
  suggestions: string[];
}

export interface HookAnalysis {
  hookStrength: number;
  promisePresent: boolean;
  proofPresent: boolean;
  payoffTeased: boolean;
  startsMidAction: boolean;
  suggestions: string[];
  thirtySecondAnchorStrength: number;
}

export interface NarrativeOptimization {
  characterCount: number;
  dayInLifeScore: number;
  visualToNarrationRatio: number;
  factCheckSlots: string[];
  suggestions: string[];
}

export interface SmartChapter {
  time: number;
  label: string;
  description: string;
}

export interface RetentionOptimization {
  patternInterrupts: PatternInterrupt[];
  hookPoints: HookPoint[];
  emotionalTriggers: EmotionalTrigger[];
  loopSuggestions: LoopAnalysis;
  hookAnalysis: HookAnalysis;
  narrativeOptimizations: NarrativeOptimization;
  smartChapters: SmartChapter[];
  musicCompliance: {
    isCompliant: boolean;
    maxSafeDuration: number;
    warnings: string[];
  };
  retentionScore: number;
  benchmarkComparison: {
    metric: string;
    target: number;
    estimated: number;
    status: 'exceeds' | 'meets' | 'below';
  }[];
}

// ============================================================================
// RETENTION OPTIMIZER SERVICE
// ============================================================================

class RetentionOptimizerService {
  /**
   * Generate pattern interrupts for a video
   * Data shows 58% retention with 3-4s interrupts vs 41% for static
   */
  generatePatternInterrupts(videoDurationSeconds: number, clipDuration: number = 5): PatternInterrupt[] {
    const interrupts: PatternInterrupt[] = [];
    const interruptInterval = RETENTION_BENCHMARKS.patternInterruptInterval.optimal;
    const types = Object.keys(PATTERN_INTERRUPT_TYPES) as (keyof typeof PATTERN_INTERRUPT_TYPES)[];

    let typeIndex = 0;
    for (let t = interruptInterval; t < videoDurationSeconds; t += interruptInterval) {
      const type = types[typeIndex % types.length];
      interrupts.push({
        timestamp: t,
        type,
        description: PATTERN_INTERRUPT_TYPES[type].description,
        clipIndex: Math.floor(t / clipDuration),
      });
      typeIndex++;
    }

    console.log(`♻️ [Retention] Generated ${interrupts.length} pattern interrupts for ${videoDurationSeconds}s video`);
    return interrupts;
  }

  /**
   * Get mid-video hook points for re-engagement
   * Critical for 3-minute Shorts: hooks at 60s and 120s
   */
  getMidVideoHookPoints(videoDurationSeconds: number): HookPoint[] {
    const hooks: HookPoint[] = [];

    if (videoDurationSeconds >= 180) {
      hooks.push(
        {
          timestamp: 60,
          hookType: 'blind_turn',
          suggestion: 'Insert narrative twist or tempo shift',
          chapterLabel: 'The Conflict',
        },
        {
          timestamp: 120,
          hookType: 'curiosity_gap',
          suggestion: 'Reveal partial answer, tease final payoff',
          chapterLabel: 'The Payoff',
        },
      );
    } else if (videoDurationSeconds >= 90) {
      hooks.push(
        {
          timestamp: 30,
          hookType: 'narrative_twist',
          suggestion: '30-second retention anchor - must maintain 50%+',
          chapterLabel: 'The Build',
        },
        {
          timestamp: 60,
          hookType: 'emotional_peak',
          suggestion: 'Peak emotional moment before loop',
          chapterLabel: 'The Turn',
        },
      );
    } else if (videoDurationSeconds >= 45) {
      hooks.push(
        { timestamp: 20, hookType: 'curiosity_gap', suggestion: 'Maintain curiosity through mid-point' },
        {
          timestamp: Math.floor(videoDurationSeconds * 0.75),
          hookType: 'emotional_peak',
          suggestion: 'Build to loop point',
        },
      );
    }

    console.log(`♻️ [Retention] Generated ${hooks.length} hook points for ${videoDurationSeconds}s video`);
    return hooks;
  }

  /**
   * Detect emotional triggers in script using GPT
   */
  async detectEmotionalTriggers(script: string): Promise<EmotionalTrigger[]> {
    try {
      const triggerModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        systemInstruction: `Analyze this historical script for emotional triggers that drive engagement.

Trigger types and their effects:
- awe_surprise: Drives shares and comments (discovery, wonder)
- humor_joy: Drives friend tags and shares (relatability)
- anger_outrage: Drives shares and comments (injustice, controversy)
- empathy: Drives follows and comments (struggle, hope)
- fear_fomo: Drives clicks (urgency, timeliness)

Return JSON array: [{ "type": "trigger_type", "strength": 0.0-1.0, "textExcerpt": "quote", "suggestedAction": ["share", "comment"] }]`,
      });
      const triggerResult = await triggerModel.generateContent(script);
      const content = triggerResult.response.text() || '{"triggers":[]}';
      const parsed = JSON.parse(content);
      const triggers = parsed.triggers || parsed || [];

      console.log(`♻️ [Retention] Detected ${triggers.length} emotional triggers`);
      return triggers;
    } catch (error) {
      console.error('♻️ [Retention] Error detecting triggers:', error);
      return [];
    }
  }

  /**
   * Suggest enhancements to add more emotional triggers
   */
  async suggestTriggerEnhancements(script: string, targetTrigger?: keyof typeof EMOTIONAL_TRIGGERS): Promise<string[]> {
    try {
      const triggerInfo = targetTrigger ? EMOTIONAL_TRIGGERS[targetTrigger] : EMOTIONAL_TRIGGERS.awe_surprise;

      const enhanceModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, responseMimeType: 'application/json' },
        systemInstruction: `Suggest 3-5 ways to enhance this historical script with "${targetTrigger || 'awe_surprise'}" trigger.

Target effect: ${triggerInfo.description}
History examples: ${triggerInfo.historyExamples.join(', ')}
Goal actions: ${triggerInfo.actions.join(', ')}

Return JSON: { "enhancements": ["suggestion 1", "suggestion 2", ...] }`,
      });
      const enhanceResult = await enhanceModel.generateContent(script);
      const content = enhanceResult.response.text() || '{"enhancements":[]}';
      const parsed = JSON.parse(content);
      return parsed.enhancements || [];
    } catch (error) {
      console.error('♻️ [Retention] Error suggesting enhancements:', error);
      return [];
    }
  }

  /**
   * Analyze loop potential - deceptive cadence (V→vi) creates unresolved tension
   */
  analyzeLoopPotential(videoDurationSeconds: number, hasDeceptiveCadence: boolean = false): LoopAnalysis {
    const loopPotential = hasDeceptiveCadence ? 0.85 : 0.5;

    return {
      loopPotential,
      cadenceType: hasDeceptiveCadence ? 'deceptive' : 'unknown',
      crossFadeDuration: Math.min(0.5, videoDurationSeconds * 0.02),
      suggestions: hasDeceptiveCadence
        ? ['Audio ends on V→vi progression - excellent for loops', 'Apply 0.3-0.5s cross-fade at loop point']
        : [
            'Consider ending on deceptive cadence (V→vi) instead of authentic (V→I)',
            'Deceptive cadence creates unresolved tension that encourages rewatching',
            'Apply cross-fade at loop point to eliminate audio clicks',
          ],
    };
  }

  /**
   * Analyze hook strength - first 3 seconds are "valley of death"
   */
  async analyzeHookStrength(script: string, firstThreeSecondsContent?: string): Promise<HookAnalysis> {
    try {
      const hookModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        systemInstruction: `Analyze the opening hook of this historical video script.

The first 3 seconds are the "valley of death" where most viewers are lost.
Effective hooks use "promise-proof-payoff" framework and start "mid-action".

Score these elements (0-1):
- promisePresent: Does it promise value or intrigue?
- proofPresent: Is there immediate credibility?
- payoffTeased: Is the payoff hinted at?
- startsMidAction: Does it start in the middle of action, not slow build?
- thirtySecondAnchorStrength: Will 50%+ audience remain at 30s mark?

Return JSON: {
  "hookStrength": 0.0-1.0,
  "promisePresent": true/false,
  "proofPresent": true/false,
  "payoffTeased": true/false,
  "startsMidAction": true/false,
  "thirtySecondAnchorStrength": 0.0-1.0,
  "suggestions": ["improvement 1", "improvement 2"]
}`,
      });
      const hookResult = await hookModel.generateContent(
        `Script: ${script}\n\nFirst 3 seconds: ${firstThreeSecondsContent || 'Not specified'}`,
      );
      const content = hookResult.response.text() || '{}';
      const parsed = JSON.parse(content);

      return {
        hookStrength: parsed.hookStrength || 0.5,
        promisePresent: parsed.promisePresent || false,
        proofPresent: parsed.proofPresent || false,
        payoffTeased: parsed.payoffTeased || false,
        startsMidAction: parsed.startsMidAction || false,
        suggestions: parsed.suggestions || [],
        thirtySecondAnchorStrength: parsed.thirtySecondAnchorStrength || 0.5,
      };
    } catch (error) {
      console.error('♻️ [Retention] Error analyzing hook:', error);
      return {
        hookStrength: 0.5,
        promisePresent: false,
        proofPresent: false,
        payoffTeased: false,
        startsMidAction: false,
        suggestions: ['Unable to analyze - start with provocative question or mid-action'],
        thirtySecondAnchorStrength: 0.5,
      };
    }
  }

  /**
   * Optimize historical narrative for retention
   * "Day in the Life" outperforms "Great Man" historiography
   */
  async optimizeHistoricalNarrative(topic: string, script: string): Promise<NarrativeOptimization> {
    try {
      const narrativeModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        systemInstruction: `Analyze this historical script for retention optimization.

Key principles:
1. "Day in the Life" content of ordinary people outperforms "Great Man" narratives
2. Limit to 3-5 key historical figures
3. 70% of narration should connect to main characters
4. 3:1 visual-to-narration ratio
5. Verify facts across 3+ academic sources

Return JSON: {
  "characterCount": number,
  "dayInLifeScore": 0.0-1.0 (how relatable/everyday is the content),
  "visualToNarrationRatio": number (ideal is 3.0),
  "factCheckSlots": ["claim 1 to verify", "claim 2 to verify"],
  "suggestions": ["improvement 1", "improvement 2"]
}`,
      });
      const narrativeResult = await narrativeModel.generateContent(`Topic: ${topic}\n\nScript: ${script}`);
      const content = narrativeResult.response.text() || '{}';
      const parsed = JSON.parse(content);

      return {
        characterCount: parsed.characterCount || 1,
        dayInLifeScore: parsed.dayInLifeScore || 0.5,
        visualToNarrationRatio: parsed.visualToNarrationRatio || 1.0,
        factCheckSlots: parsed.factCheckSlots || [],
        suggestions: parsed.suggestions || [],
      };
    } catch (error) {
      console.error('♻️ [Retention] Error optimizing narrative:', error);
      return {
        characterCount: 1,
        dayInLifeScore: 0.5,
        visualToNarrationRatio: 1.0,
        factCheckSlots: [],
        suggestions: ['Consider adding "day in the life" elements for relatability'],
      };
    }
  }

  /**
   * Get Smart Chapters based on video duration
   */
  getSmartChapters(videoDurationSeconds: number): SmartChapter[] {
    if (videoDurationSeconds >= 150) {
      return SMART_CHAPTERS.threeMinute;
    } else if (videoDurationSeconds >= 75) {
      return SMART_CHAPTERS.ninetySeconds;
    } else {
      return SMART_CHAPTERS.sixtySeconds;
    }
  }

  /**
   * Check music compliance for Content ID
   * 90-second rule: Audio Library tracks limited to 90s in 3-min Shorts
   */
  checkMusicCompliance(
    videoDurationSeconds: number,
    isRoyaltyFree: boolean,
  ): { isCompliant: boolean; maxSafeDuration: number; warnings: string[] } {
    const warnings: string[] = [];

    if (videoDurationSeconds > 60 && !isRoyaltyFree) {
      warnings.push('⚠️ Videos >60s with copyrighted music may be globally blocked (not just demonetized)');
    }

    if (videoDurationSeconds > 90 && !isRoyaltyFree) {
      warnings.push('⚠️ YouTube Audio Library tracks limited to 90s in 3-minute Shorts');
      warnings.push('Consider using royalty-free tracks or splitting audio');
    }

    return {
      isCompliant: isRoyaltyFree || videoDurationSeconds <= 60,
      maxSafeDuration: isRoyaltyFree ? videoDurationSeconds : 90,
      warnings,
    };
  }

  /**
   * Calculate overall retention score based on all factors
   */
  calculateRetentionScore(
    hookStrength: number,
    patternInterruptCount: number,
    emotionalTriggerCount: number,
    loopPotential: number,
    videoDurationSeconds: number,
  ): number {
    const idealInterrupts = videoDurationSeconds / RETENTION_BENCHMARKS.patternInterruptInterval.optimal;
    const interruptScore = Math.min(1, patternInterruptCount / idealInterrupts);
    const triggerScore = Math.min(1, emotionalTriggerCount / 3);

    const score = (hookStrength * 0.35 + interruptScore * 0.25 + triggerScore * 0.2 + loopPotential * 0.2) * 100;

    return Math.round(score);
  }

  /**
   * Main optimization method - comprehensive retention analysis
   */
  async optimizeForRetention(options: {
    script: string;
    videoDurationSeconds: number;
    aspectRatio: '9:16' | '16:9';
    topic: string;
    musicStyle?: string;
    isRoyaltyFree?: boolean;
    firstThreeSecondsContent?: string;
  }): Promise<RetentionOptimization> {
    console.log(
      `♻️ [Retention] Optimizing ${options.videoDurationSeconds}s ${options.aspectRatio} video for retention...`,
    );

    const patternInterrupts = this.generatePatternInterrupts(options.videoDurationSeconds);
    const hookPoints = this.getMidVideoHookPoints(options.videoDurationSeconds);
    const smartChapters = this.getSmartChapters(options.videoDurationSeconds);
    const musicCompliance = this.checkMusicCompliance(options.videoDurationSeconds, options.isRoyaltyFree || false);

    const [emotionalTriggers, hookAnalysis, narrativeOptimizations] = await Promise.all([
      this.detectEmotionalTriggers(options.script),
      this.analyzeHookStrength(options.script, options.firstThreeSecondsContent),
      this.optimizeHistoricalNarrative(options.topic, options.script),
    ]);

    const loopSuggestions = this.analyzeLoopPotential(options.videoDurationSeconds, false);

    const retentionScore = this.calculateRetentionScore(
      hookAnalysis.hookStrength,
      patternInterrupts.length,
      emotionalTriggers.length,
      loopSuggestions.loopPotential,
      options.videoDurationSeconds,
    );

    const benchmarkComparison = [
      {
        metric: 'Viewed vs Swiped',
        target: RETENTION_BENCHMARKS.viewedVsSwiped.good,
        estimated: hookAnalysis.hookStrength * 0.9,
        status:
          hookAnalysis.hookStrength >= 0.75
            ? 'exceeds'
            : hookAnalysis.hookStrength >= 0.6
              ? 'meets'
              : ('below' as const),
      },
      {
        metric: '30-Second Retention',
        target: RETENTION_BENCHMARKS.thirtySecondRetention.critical,
        estimated: hookAnalysis.thirtySecondAnchorStrength,
        status: hookAnalysis.thirtySecondAnchorStrength >= 0.5 ? 'meets' : ('below' as const),
      },
      {
        metric: 'Pattern Interrupt Density',
        target: 1.0,
        estimated: patternInterrupts.length / (options.videoDurationSeconds / 3),
        status: patternInterrupts.length >= options.videoDurationSeconds / 5 ? 'meets' : ('below' as const),
      },
    ];

    console.log(`♻️ [Retention] Optimization complete. Score: ${retentionScore}/100`);

    return {
      patternInterrupts,
      hookPoints,
      emotionalTriggers,
      loopSuggestions,
      hookAnalysis,
      narrativeOptimizations,
      smartChapters,
      musicCompliance,
      retentionScore,
      benchmarkComparison: benchmarkComparison as any,
    };
  }

  /**
   * Generate prompt guidance for GPT Cinematic Director
   * Includes pattern interrupt timing and emotional triggers
   */
  generateDirectorGuidance(optimization: RetentionOptimization, clipIndex: number, clipDuration: number): string {
    const clipStart = clipIndex * clipDuration;
    const clipEnd = clipStart + clipDuration;

    const interruptsInClip = optimization.patternInterrupts.filter(
      (i) => i.timestamp >= clipStart && i.timestamp < clipEnd,
    );

    const hooksInClip = optimization.hookPoints.filter((h) => h.timestamp >= clipStart && h.timestamp < clipEnd);

    const guidance: string[] = [];

    if (interruptsInClip.length > 0) {
      guidance.push(`PATTERN INTERRUPTS: Include ${interruptsInClip.map((i) => i.type.replace('_', ' ')).join(', ')}`);
    }

    if (hooksInClip.length > 0) {
      guidance.push(`RE-ENGAGEMENT HOOK: ${hooksInClip[0].suggestion}`);
    }

    if (clipIndex === 0 && optimization.hookAnalysis.hookStrength < 0.7) {
      guidance.push('CRITICAL: Start mid-action, use promise-proof-payoff framework');
    }

    if (optimization.emotionalTriggers.length > 0) {
      const topTrigger = optimization.emotionalTriggers[0];
      guidance.push(
        `EMOTIONAL TARGET: ${topTrigger.type.replace('_', '/')} → drives ${topTrigger.suggestedAction?.join(', ') || 'engagement'}`,
      );
    }

    return guidance.join(' | ');
  }
}

export const retentionOptimizer = new RetentionOptimizerService();
