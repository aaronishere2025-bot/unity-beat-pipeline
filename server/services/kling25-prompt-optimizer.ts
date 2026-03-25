/**
 * Kling 2.5 Prompt Optimizer
 *
 * Optimizes prompts for Kling 2.5's Diffusion Transformer architecture:
 * - 6-Element template structure (camera, shot, subject, environment, style, physics)
 * - First 50 tokens weighted heavily
 * - Recursive enhancement based on GPT-4o feedback
 * - Negative prompt injection for anti-hallucination
 * - Reference frame anchoring for character consistency
 */

import {
  KLING_25_CONFIG,
  KLING_25_FEEDBACK_CORRECTIONS,
  buildKling25NegativePrompt,
  assembleKling25Prompt,
} from '../config/kling-prompting';

interface ValidationFeedback {
  eraAccuracyScore: number;
  characterConsistencyScore: number;
  anachronismScore: number;
  continuityScore: number;
  microExpressionsScore?: number;
  physicsRealismScore?: number;
  cameraIntentScore?: number;
  temporalStabilityScore?: number;
  criticalIssues: string[];
  analysis?: {
    eraDetails?: { incorrectElements?: string[]; suggestions?: string[] };
    characterDetails?: { issues?: string[] };
    anachronisms?: Array<{ item: string; severity: string }>;
    continuity?: { issues?: string[] };
  };
}

interface PromptElements {
  cameraMovement: string;
  shotType: string;
  subjectAction: string;
  environmentLighting: string;
  styleMood: string;
  physicsDetails: string;
}

interface OptimizationResult {
  optimizedPrompt: string;
  negativePrompt: string;
  appliedCorrections: string[];
  attemptNumber: number;
  referenceFrameUsed: boolean;
}

class Kling25PromptOptimizerService {
  /**
   * Parse an existing prompt to extract 6-element structure
   */
  parsePromptElements(prompt: string): Partial<PromptElements> {
    const elements: Partial<PromptElements> = {};

    const cameraKeywords = Object.values(KLING_25_CONFIG.CAMERA_MOVEMENTS);
    for (const cam of cameraKeywords) {
      if (prompt.toLowerCase().includes(cam.split(' ')[0])) {
        elements.cameraMovement = cam;
        break;
      }
    }

    const shotKeywords = Object.values(KLING_25_CONFIG.SHOT_TYPES);
    for (const shot of shotKeywords) {
      if (prompt.toLowerCase().includes(shot.split(' ')[0])) {
        elements.shotType = shot;
        break;
      }
    }

    return elements;
  }

  /**
   * Build a base prompt using 6-element template
   */
  buildBasePrompt(
    subject: string,
    action: string,
    era: string,
    setting: string,
    options: {
      cameraMovement?: keyof typeof KLING_25_CONFIG.CAMERA_MOVEMENTS;
      shotType?: keyof typeof KLING_25_CONFIG.SHOT_TYPES;
      lighting?: keyof typeof KLING_25_CONFIG.LIGHTING_STYLES;
      mood?: string;
      physicsEffects?: Array<keyof typeof KLING_25_CONFIG.PHYSICS_KEYWORDS>;
    } = {},
  ): string {
    const camera = options.cameraMovement
      ? KLING_25_CONFIG.CAMERA_MOVEMENTS[options.cameraMovement]
      : KLING_25_CONFIG.CAMERA_MOVEMENTS.tracking_shot;

    const shot = options.shotType
      ? KLING_25_CONFIG.SHOT_TYPES[options.shotType]
      : KLING_25_CONFIG.SHOT_TYPES.medium_shot;

    const lighting = options.lighting
      ? KLING_25_CONFIG.LIGHTING_STYLES[options.lighting]
      : KLING_25_CONFIG.LIGHTING_STYLES.natural;

    const physics =
      options.physicsEffects?.map((effect) => KLING_25_CONFIG.PHYSICS_KEYWORDS[effect]).join(', ') ||
      'realistic fabric physics';

    const microExpression =
      KLING_25_CONFIG.MICRO_EXPRESSION_KEYWORDS[
        Math.floor(Math.random() * KLING_25_CONFIG.MICRO_EXPRESSION_KEYWORDS.length)
      ];

    return assembleKling25Prompt({
      cameraMovement: camera,
      shotType: shot,
      subjectAction: `${subject} ${action}, ${microExpression}`,
      environmentLighting: `${era} ${setting}, ${lighting}`,
      styleMood: `hyper-realistic, ${options.mood || 'cinematic intensity'}, 4K detail`,
      physicsDetails: physics,
    });
  }

  /**
   * Apply feedback-based corrections to a prompt
   * Detects issues and applies targeted fixes
   */
  applyFeedbackCorrections(
    originalPrompt: string,
    feedback: ValidationFeedback,
  ): { correctedPrompt: string; appliedCorrections: string[] } {
    let prompt = originalPrompt;
    const appliedCorrections: string[] = [];

    if (
      feedback.anachronismScore < 70 ||
      feedback.criticalIssues.some((i) => i.toLowerCase().includes('anachronism'))
    ) {
      prompt = KLING_25_FEEDBACK_CORRECTIONS.anachronism(prompt);
      appliedCorrections.push('anachronism');

      const anachronisms = feedback.analysis?.anachronisms || [];
      if (anachronisms.length > 0) {
        const items = anachronisms.map((a) => a.item).join(', ');
        prompt = `${prompt}. ABSOLUTELY NO: ${items}`;
      }
    }

    if (feedback.physicsRealismScore !== undefined && feedback.physicsRealismScore < 60) {
      prompt = KLING_25_FEEDBACK_CORRECTIONS.physics(prompt);
      appliedCorrections.push('physics');
    }

    if (feedback.characterConsistencyScore < 70) {
      prompt = KLING_25_FEEDBACK_CORRECTIONS.morphing(prompt);
      appliedCorrections.push('morphing/character');

      const charIssues = feedback.analysis?.characterDetails?.issues || [];
      if (charIssues.length > 0) {
        prompt = `${prompt}. Character fix: ${charIssues.join('. ')}`;
      }
    }

    if (feedback.temporalStabilityScore !== undefined && feedback.temporalStabilityScore < 60) {
      prompt = KLING_25_FEEDBACK_CORRECTIONS.morphing(prompt);
      if (!appliedCorrections.includes('morphing/character')) {
        appliedCorrections.push('temporal_stability');
      }
    }

    if (feedback.microExpressionsScore !== undefined && feedback.microExpressionsScore < 50) {
      prompt = KLING_25_FEEDBACK_CORRECTIONS.expression(prompt);
      appliedCorrections.push('expression');
    }

    if (feedback.cameraIntentScore !== undefined && feedback.cameraIntentScore < 60) {
      prompt = KLING_25_FEEDBACK_CORRECTIONS.camera(prompt);
      appliedCorrections.push('camera');
    }

    if (feedback.continuityScore < 60) {
      prompt = KLING_25_FEEDBACK_CORRECTIONS.continuity(prompt);
      appliedCorrections.push('continuity');
    }

    const eraIssues = feedback.analysis?.eraDetails?.incorrectElements || [];
    if (feedback.eraAccuracyScore < 70 && eraIssues.length > 0) {
      prompt = `${prompt}. Remove: ${eraIssues.join(', ')}`;
      appliedCorrections.push('era_accuracy');
    }

    return { correctedPrompt: prompt, appliedCorrections };
  }

  /**
   * Assemble a retry prompt with all optimizations
   * NOW USES RECURSIVE OPTIMIZATION WITH MULTIPLICATIVE SCALING
   * Attempt 1 = 1x fixes, Attempt 2 = 2x (double), Attempt 3 = 3x (triple)
   */
  assembleRetryPrompt(
    originalPrompt: string,
    feedback: ValidationFeedback,
    attemptNumber: number,
    referenceFrameBase64?: string,
  ): OptimizationResult {
    // Step 1: Apply legacy feedback corrections
    const { correctedPrompt, appliedCorrections } = this.applyFeedbackCorrections(originalPrompt, feedback);

    const negativePrompt = buildKling25NegativePrompt(feedback.criticalIssues);

    // Step 2: Build audit feedback string from validation for recursive optimization
    const auditParts: string[] = [];
    if (feedback.anachronismScore < 60) auditParts.push('anachronism detected');
    if (feedback.eraAccuracyScore < 60) auditParts.push('era inaccuracy, modern elements present');
    if (feedback.characterConsistencyScore < 60) auditParts.push('character inconsistent');
    if (feedback.continuityScore < 60) auditParts.push('continuity issues');
    if (feedback.microExpressionsScore !== undefined && feedback.microExpressionsScore < 50) {
      auditParts.push('expressionless, stiff');
    }
    if (feedback.physicsRealismScore !== undefined && feedback.physicsRealismScore < 50) {
      auditParts.push('floating objects, scale issues');
    }
    // Add critical issues
    auditParts.push(...feedback.criticalIssues);

    const auditFeedback = auditParts.join('. ');

    // Step 3: Calculate overall score for severity
    const overallScore = Math.round(
      (feedback.eraAccuracyScore +
        feedback.characterConsistencyScore +
        feedback.anachronismScore +
        feedback.continuityScore) /
        4,
    );

    // Step 4: Apply RECURSIVE OPTIMIZATION with multiplicative scaling
    const recursiveResult = this.fullRecursiveOptimize(
      correctedPrompt,
      {
        score: overallScore,
        auditFeedback: auditFeedback.length > 0 ? auditFeedback : undefined,
      },
      attemptNumber,
    );

    let finalPrompt = recursiveResult.enhancedPrompt;

    // Add retry marker for tracking
    if (attemptNumber >= 2) {
      finalPrompt = `[RETRY ${attemptNumber}/${attemptNumber}x INTENSITY] ${finalPrompt}`;
    }

    // Combine all corrections
    const allCorrections = [
      ...appliedCorrections,
      ...recursiveResult.scoreEnhancements.slice(0, 3).map((e) => e.split(',')[0].trim()),
      ...recursiveResult.auditEnhancements.slice(0, 3).map((e) => e.split(',')[0].trim()),
    ];

    console.log(`🎬 [Kling25Optimizer] Retry ${attemptNumber} with ${attemptNumber}x INTENSITY`);
    console.log(`   Legacy corrections: ${appliedCorrections.join(', ') || 'none'}`);
    console.log(`   Score enhancements: ${recursiveResult.scoreEnhancements.length}`);
    console.log(`   Audit enhancements: ${recursiveResult.auditEnhancements.length}`);
    console.log(`   Motion brush: ${recursiveResult.motionBrushValue || 'N/A'}`);
    console.log(`   Expected score gain: +${recursiveResult.expectedScoreGain}`);

    return {
      optimizedPrompt: finalPrompt,
      negativePrompt,
      appliedCorrections: allCorrections,
      attemptNumber,
      referenceFrameUsed: !!referenceFrameBase64,
    };
  }

  /**
   * Calculate effort-based reward for Thompson Sampling
   * Easy Win (attempt 1): +2.0 alpha
   * Medium Win (attempt 2): +1.0 alpha
   * Hard Win (attempt 3): +0.5 alpha
   * Total Fail: +3.0 beta
   */
  calculateEffortReward(
    passed: boolean,
    attemptNumber: number,
  ): { alphaChange: number; betaChange: number; rewardType: string } {
    if (!passed) {
      return {
        alphaChange: 0,
        betaChange: 3.0,
        rewardType: 'total_fail',
      };
    }

    switch (attemptNumber) {
      case 1:
        return { alphaChange: 2.0, betaChange: 0, rewardType: 'easy_win' };
      case 2:
        return { alphaChange: 1.0, betaChange: 0, rewardType: 'medium_win' };
      case 3:
      default:
        return { alphaChange: 0.5, betaChange: 0, rewardType: 'hard_win' };
    }
  }

  // ============================================================================
  // HILL-CLIMBING PROMPT LOGIC
  // Instead of brute-force retries, climb the hill of success
  // Extract winning keywords from high-scoring prompts as "Master Templates"
  // ============================================================================

  private readonly HILL_CLIMB_CONFIG = {
    CRITICAL_FAIL_THRESHOLD: 30, // Below this = instant fail-out
    EXPONENTIAL_WIN_THRESHOLD: 85, // Above this = lock winning keywords
    IMPROVEMENT_THRESHOLD: 15, // Score jump to trigger exponential win
    MASTER_TEMPLATE_KEYWORDS: new Map<string, string[]>(), // category -> winning keywords
  };

  /**
   * HIGH-VALUE PROMPT KEYWORDS
   * These are the cinematography terms that Kling 2.5 responds best to
   */
  private readonly WINNING_KEYWORD_PATTERNS = [
    // Camera movements
    'dolly zoom',
    'tracking shot',
    'push in',
    'pull out',
    'crane shot',
    'whip pan',
    'crash zoom',
    'steadicam',
    'handheld shake',
    // Lighting
    'chiaroscuro',
    'golden hour',
    'rim lighting',
    'volumetric light',
    'dramatic shadows',
    'backlit silhouette',
    // Motion
    'kinetic energy',
    'motion blur',
    'dynamic movement',
    'explosive action',
    'fluid mechanics',
    'mid-action pose',
    // Composition
    'rule of thirds',
    'leading lines',
    'negative space',
    'depth layering',
    'foreground element',
    'atmospheric haze',
    // Style
    'cinematic grain',
    'anamorphic',
    'film noir',
    'epic scale',
    'photorealistic',
    'hyperdetailed',
  ];

  /**
   * EARLY FAIL-OUT DECISION
   * If score < 30, don't waste credits on retries
   * Returns null to signal pipeline should stop
   */
  shouldFailOut(score: number): {
    failOut: boolean;
    reason: string;
  } {
    if (score < this.HILL_CLIMB_CONFIG.CRITICAL_FAIL_THRESHOLD) {
      console.log(`🚨 [HillClimb] CRITICAL FAILURE (${score}): Failing out to save credits`);
      return {
        failOut: true,
        reason: `Score ${score} below critical threshold ${this.HILL_CLIMB_CONFIG.CRITICAL_FAIL_THRESHOLD} - structural mismatch detected`,
      };
    }
    return { failOut: false, reason: '' };
  }

  /**
   * EXPONENTIAL WIN DETECTION
   * If score > 85 AND improvement > 15, we found a winning formula
   */
  detectExponentialWin(
    currentScore: number,
    previousScore: number,
  ): {
    isExponentialWin: boolean;
    improvement: number;
    action: string;
  } {
    const improvement = currentScore - previousScore;

    if (
      improvement > this.HILL_CLIMB_CONFIG.IMPROVEMENT_THRESHOLD &&
      currentScore > this.HILL_CLIMB_CONFIG.EXPONENTIAL_WIN_THRESHOLD
    ) {
      console.log(`🚀 [HillClimb] EXPONENTIAL WIN: ${previousScore} → ${currentScore} (+${improvement})`);
      return {
        isExponentialWin: true,
        improvement,
        action: 'lock_keywords_and_sprint',
      };
    }

    if (currentScore > this.HILL_CLIMB_CONFIG.EXPONENTIAL_WIN_THRESHOLD) {
      console.log(`✨ [HillClimb] HIGH SCORE: ${currentScore} - extracting winning keywords`);
      return {
        isExponentialWin: false,
        improvement,
        action: 'extract_keywords',
      };
    }

    return {
      isExponentialWin: false,
      improvement,
      action: 'continue_optimization',
    };
  }

  /**
   * EXTRACT WINNING KEYWORDS from a high-scoring prompt
   * These become the "Genetic Blueprint" for future generations
   */
  extractWinningKeywords(prompt: string): string[] {
    const lowerPrompt = prompt.toLowerCase();
    const foundKeywords: string[] = [];

    for (const keyword of this.WINNING_KEYWORD_PATTERNS) {
      if (lowerPrompt.includes(keyword)) {
        foundKeywords.push(keyword);
      }
    }

    // Also extract any [ENHANCED:] or [AUDIT-FIX:] blocks that worked
    const enhancedMatch = prompt.match(/\[ENHANCED:\s*([^\]]+)\]/);
    if (enhancedMatch) {
      const enhancements = enhancedMatch[1].split(',').map((s) => s.trim());
      foundKeywords.push(...enhancements);
    }

    const auditMatch = prompt.match(/\[AUDIT-FIX[^:]*:\s*([^\]]+)\]/);
    if (auditMatch) {
      const fixes = auditMatch[1].split(';').map((s) => s.trim());
      foundKeywords.push(...fixes);
    }

    // Deduplicate
    return [...new Set(foundKeywords)];
  }

  /**
   * LOCK WINNING KEYWORDS as Master Template for a category
   * Future prompts in this category will inherit these keywords
   */
  lockWinningKeywords(
    category: string,
    winningPrompt: string,
  ): {
    category: string;
    lockedKeywords: string[];
    sprintTriggered: boolean;
  } {
    const keywords = this.extractWinningKeywords(winningPrompt);

    if (keywords.length > 0) {
      this.HILL_CLIMB_CONFIG.MASTER_TEMPLATE_KEYWORDS.set(category, keywords);
      console.log(`🔒 [HillClimb] LOCKED ${keywords.length} keywords for "${category}"`);
      console.log(`   Keywords: ${keywords.slice(0, 5).join(', ')}...`);

      return {
        category,
        lockedKeywords: keywords,
        sprintTriggered: true,
      };
    }

    return {
      category,
      lockedKeywords: [],
      sprintTriggered: false,
    };
  }

  /**
   * GET MASTER TEMPLATE for a category
   * Returns locked winning keywords if available
   */
  getMasterTemplate(category: string): string[] | null {
    return this.HILL_CLIMB_CONFIG.MASTER_TEMPLATE_KEYWORDS.get(category) || null;
  }

  /**
   * INJECT MASTER TEMPLATE into a new prompt
   * Inherits winning keywords from previous success
   */
  injectMasterTemplate(
    prompt: string,
    category: string,
  ): {
    enhancedPrompt: string;
    templateApplied: boolean;
    keywordsInjected: string[];
  } {
    const template = this.getMasterTemplate(category);

    if (!template || template.length === 0) {
      return {
        enhancedPrompt: prompt,
        templateApplied: false,
        keywordsInjected: [],
      };
    }

    // Inject top 5 winning keywords as a template block
    const topKeywords = template.slice(0, 5);
    const templateBlock = `[MASTER-TEMPLATE: ${topKeywords.join(', ')}]`;

    console.log(`📋 [HillClimb] Applying Master Template for "${category}"`);

    return {
      enhancedPrompt: `${templateBlock} ${prompt}`,
      templateApplied: true,
      keywordsInjected: topKeywords,
    };
  }

  /**
   * FULL HILL-CLIMBING EVALUATION
   * Called after each clip generation to decide next action
   */
  evaluateHillClimb(
    currentScore: number,
    previousScore: number,
    currentPrompt: string,
    category: string,
  ): {
    action: 'fail_out' | 'lock_and_sprint' | 'extract_keywords' | 'continue' | 'retry';
    reason: string;
    lockedKeywords?: string[];
    improvement: number;
  } {
    // Check for critical failure first
    const failCheck = this.shouldFailOut(currentScore);
    if (failCheck.failOut) {
      return {
        action: 'fail_out',
        reason: failCheck.reason,
        improvement: currentScore - previousScore,
      };
    }

    // Check for exponential win
    const winCheck = this.detectExponentialWin(currentScore, previousScore);

    if (winCheck.isExponentialWin) {
      const lockResult = this.lockWinningKeywords(category, currentPrompt);
      return {
        action: 'lock_and_sprint',
        reason: `Exponential win detected: +${winCheck.improvement} points`,
        lockedKeywords: lockResult.lockedKeywords,
        improvement: winCheck.improvement,
      };
    }

    if (winCheck.action === 'extract_keywords') {
      const keywords = this.extractWinningKeywords(currentPrompt);
      return {
        action: 'extract_keywords',
        reason: `High score ${currentScore} - extracted ${keywords.length} keywords`,
        lockedKeywords: keywords,
        improvement: winCheck.improvement,
      };
    }

    // Below threshold - needs retry (lowered to 70 for production speed)
    if (currentScore < 70) {
      return {
        action: 'retry',
        reason: `Score ${currentScore} below pass threshold 70`,
        improvement: winCheck.improvement,
      };
    }

    return {
      action: 'continue',
      reason: `Score ${currentScore} acceptable`,
      improvement: winCheck.improvement,
    };
  }

  // ============================================================================
  // LITTLE NUGGET VISUAL ANCHOR SYSTEM
  // Injects a high-motion "nugget" in the first 0.5-1.5 seconds of first clip
  // ============================================================================

  /**
   * Nugget types for first-clip visual anchors
   * Based on 2025 YouTube Shorts retention data
   */
  private readonly NUGGET_TYPES = {
    in_media_res: {
      name: 'In-Media-Res Smash',
      visualCommand: 'rapid dolly zoom, subject in dynamic mid-action moment, intense motion blur',
      psychologicalTrigger: 'Survival Reflex - brains focus on movement first',
      cameraStyle: 'crash_zoom' as const,
    },
    abstract_mystery: {
      name: 'Abstract Mystery',
      visualCommand: 'extreme macro close-up, unusual texture fills frame, shallow depth of field',
      psychologicalTrigger: 'Pattern Break - viewer stays 1s longer to identify object',
      cameraStyle: 'push_in' as const,
    },
    reaction_reveal: {
      name: 'Reaction Reveal',
      visualCommand: 'extreme close-up face, intense emotional expression, micro-expressions visible',
      psychologicalTrigger: 'Mirror Neurons - automatic emotion mirroring',
      cameraStyle: 'static_shot' as const,
    },
  };

  /**
   * Get a random nugget type or select by name
   */
  selectNuggetType(preferredType?: keyof typeof this.NUGGET_TYPES): {
    type: string;
    visualCommand: string;
    psychologicalTrigger: string;
    cameraStyle: string;
  } {
    const types = Object.keys(this.NUGGET_TYPES) as Array<keyof typeof this.NUGGET_TYPES>;
    const selectedKey = preferredType || types[Math.floor(Math.random() * types.length)];
    const nugget = this.NUGGET_TYPES[selectedKey];

    return {
      type: selectedKey,
      visualCommand: nugget.visualCommand,
      psychologicalTrigger: nugget.psychologicalTrigger,
      cameraStyle: (KLING_25_CONFIG.CAMERA_MOVEMENTS as any)[nugget.cameraStyle] || '',
    };
  }

  /**
   * Inject a Little Nugget visual anchor into the first clip prompt
   * Creates high-motion, high-contrast opening for 0-1.5 seconds
   */
  injectNugget(
    basePrompt: string,
    clipIndex: number,
    nuggetType?: keyof typeof this.NUGGET_TYPES,
  ): {
    optimizedPrompt: string;
    nuggetApplied: boolean;
    nuggetDetails?: {
      type: string;
      visualCommand: string;
      psychologicalTrigger: string;
    };
  } {
    // Only apply to first clip (index 0)
    if (clipIndex !== 0) {
      return { optimizedPrompt: basePrompt, nuggetApplied: false };
    }

    const nugget = this.selectNuggetType(nuggetType);

    // Inject the nugget command at the start of the prompt
    const nuggetPrefix = `[0s-1.5s: Dynamic high-motion visual nugget, ${nugget.visualCommand}, high contrast, saturated focal point]`;
    const optimizedPrompt = `${nuggetPrefix} ${basePrompt}`;

    return {
      optimizedPrompt,
      nuggetApplied: true,
      nuggetDetails: {
        type: nugget.type,
        visualCommand: nugget.visualCommand,
        psychologicalTrigger: nugget.psychologicalTrigger,
      },
    };
  }

  /**
   * Validate that a clip has adequate "nugget" qualities
   * Returns a nugget score 0-100 based on motion delta, color pop, context gap
   */
  calculateNuggetScore(validationResult: {
    motionDelta?: number; // Pixel change between Frame 1 and Frame 15 (0-100)
    colorSaturation?: number; // High-saturation focal point presence (0-100)
    contextGap?: number; // Does it raise a question? (0-100)
  }): {
    score: number;
    passed: boolean;
    penalties: string[];
  } {
    const weights = {
      motionDelta: 0.4, // 40% - most important for "nugget" effect
      colorSaturation: 0.3, // 30% - color pop
      contextGap: 0.3, // 30% - curiosity hook
    };

    const motionScore = validationResult.motionDelta || 50;
    const colorScore = validationResult.colorSaturation || 50;
    const contextScore = validationResult.contextGap || 50;

    const totalScore = Math.round(
      motionScore * weights.motionDelta + colorScore * weights.colorSaturation + contextScore * weights.contextGap,
    );

    const penalties: string[] = [];

    if (motionScore < 40) penalties.push('LOW_MOTION: First clip lacks dynamic movement');
    if (colorScore < 40) penalties.push('LOW_COLOR_POP: No high-saturation focal point');
    if (contextScore < 40) penalties.push('LOW_CONTEXT_GAP: No curiosity hook');

    // First clip must score at least 60 to pass
    const passed = totalScore >= 60;

    return {
      score: totalScore,
      passed,
      penalties,
    };
  }

  // ============================================================================
  // AUDIT-TO-PROMPT MAPPING TABLE
  // Maps GPT-4o Vision audit findings to Kling 2.5 cinematography keywords
  // ============================================================================

  private readonly AUDIT_TO_PROMPT_MAP: Record<
    string,
    {
      detectedIssue: string;
      technicalFix: string;
      motionBrushValue?: number;
    }
  > = {
    // Motion failures
    stagnant: {
      detectedIssue: 'Stagnant/Still frame',
      technicalFix: 'kinetic energy, fast-paced action, dynamic motion blur',
      motionBrushValue: 8,
    },
    stiff: {
      detectedIssue: 'Stiff movement',
      technicalFix: 'fluid body mechanics, natural gesture flow, organic motion',
      motionBrushValue: 7,
    },
    static: {
      detectedIssue: 'Static composition',
      technicalFix: 'camera push-in, dynamic framing shift, parallax movement',
      motionBrushValue: 6,
    },
    frozen: {
      detectedIssue: 'Frozen subject',
      technicalFix: 'mid-action pose, explosive movement, blur trails on limbs',
      motionBrushValue: 9,
    },

    // Era/Period failures
    anachronism: {
      detectedIssue: 'Wrong-era elements detected',
      technicalFix: 'strict period-accurate costume, pre-industrial materials only, hand-crafted textures',
    },
    modern: {
      detectedIssue: 'Modern elements in historical scene',
      technicalFix: 'remove all synthetic materials, organic wood/stone/leather only, torchlit ambiance',
    },
    wristwatch: {
      detectedIssue: 'Anachronistic accessory',
      technicalFix: 'bare wrists, period-accurate jewelry only, historically verified accessories',
    },
    glasses: {
      detectedIssue: 'Wrong-era eyewear',
      technicalFix: 'no modern eyewear, period-appropriate vision aids only if post-13th century',
    },

    // Lighting failures
    flat: {
      detectedIssue: 'Flat lighting',
      technicalFix: 'dramatic chiaroscuro, single key light source, deep shadows',
    },
    overexposed: {
      detectedIssue: 'Overexposed frame',
      technicalFix: 'controlled exposure, balanced highlights, rich midtones',
    },
    underlit: {
      detectedIssue: 'Underlit scene',
      technicalFix: 'warm fill lighting, ambient bounce, visible detail in shadows',
    },

    // Character/Face failures
    distorted: {
      detectedIssue: 'Facial distortion',
      technicalFix: 'anatomically correct proportions, stable facial geometry, reference-anchored features',
    },
    inconsistent: {
      detectedIssue: 'Character inconsistency',
      technicalFix: 'maintain exact facial structure from reference, identical costume details, consistent aging',
    },
    expressionless: {
      detectedIssue: 'Blank expression',
      technicalFix: 'micro-expression: subtle brow tension, lip compression, eye narrowing',
    },
    uncanny: {
      detectedIssue: 'Uncanny valley effect',
      technicalFix: 'photorealistic skin texture, natural asymmetry, subtle imperfections',
    },

    // Composition failures
    cluttered: {
      detectedIssue: 'Cluttered composition',
      technicalFix: 'clean negative space, rule of thirds, single focal point',
    },
    empty: {
      detectedIssue: 'Empty/boring composition',
      technicalFix: 'layered depth, foreground element, atmospheric haze',
    },
    centered: {
      detectedIssue: 'Boring center composition',
      technicalFix: 'dynamic off-center framing, leading lines, visual tension',
    },

    // Color/Mood failures
    desaturated: {
      detectedIssue: 'Washed out colors',
      technicalFix: 'rich saturated palette, vibrant accents, bold color blocking',
    },
    garish: {
      detectedIssue: 'Oversaturated/garish',
      technicalFix: 'muted earth tones, period-accurate dyes, subtle color harmony',
    },
    monochrome: {
      detectedIssue: 'Unintended monochrome',
      technicalFix: 'warm/cool color contrast, complementary accent colors, tonal variety',
    },

    // Physics/Realism failures
    floating: {
      detectedIssue: 'Objects floating unrealistically',
      technicalFix: 'gravity-grounded elements, weight-bearing posture, contact shadows',
    },
    clipping: {
      detectedIssue: 'Object clipping/intersection',
      technicalFix: 'proper spatial separation, collision-aware placement, depth layering',
    },
    scale: {
      detectedIssue: 'Incorrect scale',
      technicalFix: 'anatomically proportioned, reference-scaled objects, consistent perspective',
    },
  };

  /**
   * Severity scaling based on score ranges
   */
  private getSeverityPrefix(score: number): string {
    if (score < 20) return 'CRITICAL FAILURE: Complete visual overhaul required. ';
    if (score < 40) return 'MAJOR ISSUE: Significant corrections needed. ';
    if (score < 60) return 'NEEDS IMPROVEMENT: Targeted fixes required. ';
    return '';
  }

  /**
   * Parse GPT-4o Vision audit feedback and extract failure keywords
   */
  parseAuditFeedback(auditText: string): {
    detectedIssues: string[];
    technicalFixes: string[];
    motionBrushValues: number[];
  } {
    const detectedIssues: string[] = [];
    const technicalFixes: string[] = [];
    const motionBrushValues: number[] = [];

    const lowerAudit = auditText.toLowerCase();

    for (const [keyword, mapping] of Object.entries(this.AUDIT_TO_PROMPT_MAP)) {
      if (lowerAudit.includes(keyword)) {
        detectedIssues.push(mapping.detectedIssue);
        technicalFixes.push(mapping.technicalFix);
        if (mapping.motionBrushValue) {
          motionBrushValues.push(mapping.motionBrushValue);
        }
      }
    }

    return { detectedIssues, technicalFixes, motionBrushValues };
  }

  /**
   * RECURSIVE PROMPT OPTIMIZATION
   * Uses GPT-4o Vision audit feedback to intelligently rewrite prompts
   * The prompt becomes a "living document" that improves with each failure
   */
  recursivePromptOptimize(
    originalPrompt: string,
    score: number,
    auditFeedback: string,
    attemptNumber: number = 1,
  ): {
    enhancedPrompt: string;
    detectedIssues: string[];
    technicalFixes: string[];
    motionBrushValue: number | null;
    severityLevel: string;
    attemptNumber: number;
  } {
    // Parse the audit feedback to extract failure keywords
    const parsed = this.parseAuditFeedback(auditFeedback);

    // Get severity prefix based on score
    const severityPrefix = this.getSeverityPrefix(score);
    const severityLevel = score < 20 ? 'critical' : score < 40 ? 'major' : score < 60 ? 'moderate' : 'minor';

    // Determine motion brush value (take highest if multiple motion issues)
    const motionBrushValue = parsed.motionBrushValues.length > 0 ? Math.max(...parsed.motionBrushValues) : null;

    // Build enhancement block from technical fixes
    // MULTIPLICATIVE SCALING: Attempt 1 = 3 fixes, Attempt 2 = 6 fixes (2x), Attempt 3 = 9 fixes (3x)
    let enhancementBlock = '';

    if (parsed.technicalFixes.length > 0) {
      const baseFixes = 3;
      const maxFixes = Math.min(baseFixes * attemptNumber, parsed.technicalFixes.length);
      const selectedFixes = parsed.technicalFixes.slice(0, maxFixes);
      enhancementBlock = `[AUDIT-FIX x${attemptNumber}: ${selectedFixes.join('; ')}] `;
    }

    // Build the enhanced prompt
    let enhancedPrompt = severityPrefix + enhancementBlock + originalPrompt;

    // If motion brush recommended, add directive
    if (motionBrushValue && motionBrushValue >= 7) {
      enhancedPrompt = `[MOTION-BRUSH: ${motionBrushValue}/10] ` + enhancedPrompt;
    }

    return {
      enhancedPrompt,
      detectedIssues: parsed.detectedIssues,
      technicalFixes: parsed.technicalFixes,
      motionBrushValue,
      severityLevel,
      attemptNumber,
    };
  }

  /**
   * Full recursive optimization cycle with reflection
   * Combines score-based enhancement with audit feedback for maximum improvement
   */
  fullRecursiveOptimize(
    originalPrompt: string,
    validationResult: {
      score: number;
      auditFeedback?: string;
      motionDelta?: number;
      colorSaturation?: number;
      contextGap?: number;
    },
    attemptNumber: number = 1,
  ): {
    enhancedPrompt: string;
    scoreEnhancements: string[];
    auditEnhancements: string[];
    totalEnhancements: number;
    severityLevel: string;
    motionBrushValue: number | null;
    expectedScoreGain: number;
    attemptNumber: number;
  } {
    let enhancedPrompt = originalPrompt;
    const scoreEnhancements: string[] = [];
    const auditEnhancements: string[] = [];
    let motionBrushValue: number | null = null;
    let expectedScoreGain = 0;

    // Step 1: Apply score-based enhancements (motion, color, context)
    if (
      validationResult.motionDelta !== undefined ||
      validationResult.colorSaturation !== undefined ||
      validationResult.contextGap !== undefined
    ) {
      const scoreResult = this.enhancePromptFromScores(
        enhancedPrompt,
        {
          motionDelta: validationResult.motionDelta,
          colorSaturation: validationResult.colorSaturation,
          contextGap: validationResult.contextGap,
        },
        attemptNumber,
      );
      enhancedPrompt = scoreResult.enhancedPrompt;
      scoreEnhancements.push(...scoreResult.enhancements);
      expectedScoreGain += scoreResult.expectedImprovements.reduce((sum, imp) => sum + imp.targetGain, 0);
    }

    // Step 2: Apply audit-based enhancements (GPT-4o Vision feedback)
    if (validationResult.auditFeedback) {
      const auditResult = this.recursivePromptOptimize(
        enhancedPrompt,
        validationResult.score,
        validationResult.auditFeedback,
        attemptNumber,
      );
      enhancedPrompt = auditResult.enhancedPrompt;
      auditEnhancements.push(...auditResult.technicalFixes);
      motionBrushValue = auditResult.motionBrushValue;

      // Audit fixes typically add 10-20 points per issue fixed
      expectedScoreGain += auditResult.technicalFixes.length * 12;
    }

    const severityLevel =
      validationResult.score < 20
        ? 'critical'
        : validationResult.score < 40
          ? 'major'
          : validationResult.score < 60
            ? 'moderate'
            : 'minor';

    return {
      enhancedPrompt,
      scoreEnhancements,
      auditEnhancements,
      totalEnhancements: scoreEnhancements.length + auditEnhancements.length,
      severityLevel,
      motionBrushValue,
      expectedScoreGain,
      attemptNumber,
    };
  }

  // ============================================================================
  // SCORE-BASED PROMPT ENHANCEMENT SYSTEM
  // Improves prompts based on what scored poorly in previous attempts
  // ============================================================================

  /**
   * Enhancement directives for each metric type
   */
  private readonly ENHANCEMENT_DIRECTIVES = {
    motion: {
      threshold: 50,
      weak: [
        'rapid dynamic movement',
        'intense motion blur',
        'fast-paced action sequence',
        'camera shake effect',
        'explosive kinetic energy',
        'whip pan transition',
        'subject in mid-leap or mid-strike',
      ],
      strong: ['dramatic sweeping motion', 'high-velocity action', 'blur trails on moving elements'],
    },
    color: {
      threshold: 50,
      weak: [
        'high-contrast saturated colors',
        'vibrant focal point',
        'bold dramatic color palette',
        'intense color grading',
        'saturated reds and golds',
        'eye-catching color pop',
      ],
      strong: ['rich cinematic color', 'vivid tonal contrast', 'striking visual palette'],
    },
    context: {
      threshold: 50,
      weak: [
        'mysterious reveal moment',
        'unexpected visual element',
        'curiosity-inducing composition',
        'dramatic tension build',
        'what-happens-next framing',
        'incomplete action frozen mid-moment',
      ],
      strong: ['intriguing visual hook', 'compelling mystery element', 'captivating story tease'],
    },
  };

  /**
   * Enhance a prompt based on previous validation scores
   * Targets specific weaknesses with enhancement directives
   */
  enhancePromptFromScores(
    originalPrompt: string,
    previousScores: {
      motionDelta?: number;
      colorSaturation?: number;
      contextGap?: number;
    },
    attemptNumber: number = 1,
  ): {
    enhancedPrompt: string;
    enhancements: string[];
    targetedMetrics: string[];
    expectedImprovements: { metric: string; from: number; targetGain: number }[];
  } {
    const enhancements: string[] = [];
    const targetedMetrics: string[] = [];
    const expectedImprovements: { metric: string; from: number; targetGain: number }[] = [];

    // Analyze which metrics need improvement
    const motionScore = previousScores.motionDelta || 50;
    const colorScore = previousScores.colorSaturation || 50;
    const contextScore = previousScores.contextGap || 50;

    // MULTIPLICATIVE INTENSITY SCALING
    // Attempt 1 = 1x base, Attempt 2 = 2x (double), Attempt 3 = 3x (triple)
    const intensityMultiplier = Math.min(attemptNumber, 3);
    const baseGain = 15; // Base expected improvement per metric

    if (motionScore < this.ENHANCEMENT_DIRECTIVES.motion.threshold) {
      const directives =
        motionScore < 30 ? this.ENHANCEMENT_DIRECTIVES.motion.weak : this.ENHANCEMENT_DIRECTIVES.motion.strong;
      // More fixes on each retry: 2 → 4 → 6 fixes
      const count = Math.min(intensityMultiplier * 2, directives.length);
      const selected = directives.slice(0, count);
      enhancements.push(...selected);
      targetedMetrics.push('motion');
      // Multiplicative gain: 15 → 30 → 45
      expectedImprovements.push({
        metric: 'motion',
        from: motionScore,
        targetGain: baseGain * intensityMultiplier,
      });
    }

    if (colorScore < this.ENHANCEMENT_DIRECTIVES.color.threshold) {
      const directives =
        colorScore < 30 ? this.ENHANCEMENT_DIRECTIVES.color.weak : this.ENHANCEMENT_DIRECTIVES.color.strong;
      const count = Math.min(intensityMultiplier * 2, directives.length);
      const selected = directives.slice(0, count);
      enhancements.push(...selected);
      targetedMetrics.push('color');
      expectedImprovements.push({
        metric: 'color',
        from: colorScore,
        targetGain: baseGain * intensityMultiplier,
      });
    }

    if (contextScore < this.ENHANCEMENT_DIRECTIVES.context.threshold) {
      const directives =
        contextScore < 30 ? this.ENHANCEMENT_DIRECTIVES.context.weak : this.ENHANCEMENT_DIRECTIVES.context.strong;
      const count = Math.min(intensityMultiplier * 2, directives.length);
      const selected = directives.slice(0, count);
      enhancements.push(...selected);
      targetedMetrics.push('context');
      expectedImprovements.push({
        metric: 'context',
        from: contextScore,
        targetGain: baseGain * intensityMultiplier,
      });
    }

    // Build enhanced prompt
    let enhancedPrompt = originalPrompt;

    if (enhancements.length > 0) {
      // Insert enhancements after the nugget prefix if present, otherwise at start
      const nuggetMatch = originalPrompt.match(/^\[0s-1\.5s:.*?\]/);

      if (nuggetMatch) {
        // Insert after nugget prefix
        const afterNugget = originalPrompt.substring(nuggetMatch[0].length);
        const enhancementBlock = ` [ENHANCED: ${enhancements.join(', ')}]`;
        enhancedPrompt = nuggetMatch[0] + enhancementBlock + afterNugget;
      } else {
        // Insert at beginning
        enhancedPrompt = `[ENHANCED: ${enhancements.join(', ')}] ${originalPrompt}`;
      }
    }

    return {
      enhancedPrompt,
      enhancements,
      targetedMetrics,
      expectedImprovements,
    };
  }

  /**
   * Full reprompt cycle: analyze scores, enhance, and return improved prompt
   * with tracking for before/after comparison
   */
  repromptWithFeedback(
    originalPrompt: string,
    validationResult: {
      motionDelta?: number;
      colorSaturation?: number;
      contextGap?: number;
    },
    attemptNumber: number = 1,
  ): {
    originalPrompt: string;
    enhancedPrompt: string;
    originalScore: number;
    enhancements: string[];
    targetedMetrics: string[];
    expectedImprovements: { metric: string; from: number; targetGain: number }[];
    attemptNumber: number;
  } {
    // Calculate original score
    const originalScoreResult = this.calculateNuggetScore(validationResult);

    // Enhance the prompt
    const enhancement = this.enhancePromptFromScores(originalPrompt, validationResult, attemptNumber);

    return {
      originalPrompt,
      enhancedPrompt: enhancement.enhancedPrompt,
      originalScore: originalScoreResult.score,
      enhancements: enhancement.enhancements,
      targetedMetrics: enhancement.targetedMetrics,
      expectedImprovements: enhancement.expectedImprovements,
      attemptNumber,
    };
  }

  /**
   * Get Thompson Sampling reward for nugget performance
   * If swipe_rate < 0.15 (85%+ watched), give big alpha boost
   */
  calculateNuggetReward(swipeRate: number): {
    alphaChange: number;
    betaChange: number;
    rewardType: string;
  } {
    if (swipeRate < 0.1) {
      // Exceptional - under 10% swipe away
      return { alphaChange: 4.0, betaChange: 0, rewardType: 'nugget_viral' };
    } else if (swipeRate < 0.15) {
      // Great - under 15% swipe away
      return { alphaChange: 3.0, betaChange: 0, rewardType: 'nugget_success' };
    } else if (swipeRate < 0.25) {
      // OK - under 25% swipe away
      return { alphaChange: 1.0, betaChange: 0, rewardType: 'nugget_ok' };
    } else if (swipeRate < 0.4) {
      // Mediocre
      return { alphaChange: 0, betaChange: 0, rewardType: 'nugget_neutral' };
    } else {
      // Failed - over 40% swiped away
      return { alphaChange: 0, betaChange: 2.0, rewardType: 'nugget_fail' };
    }
  }

  /**
   * Get prompt structure analysis for debugging
   */
  analyzePromptStructure(prompt: string): {
    hasCamera: boolean;
    hasShot: boolean;
    hasPhysics: boolean;
    hasMicroExpression: boolean;
    hasNugget: boolean;
    tokenEstimate: number;
    priorityTokens: string;
  } {
    const lower = prompt.toLowerCase();

    const hasCamera = Object.keys(KLING_25_CONFIG.CAMERA_MOVEMENTS).some((key) =>
      lower.includes(key.replace('_', ' ')),
    );

    const hasShot = Object.keys(KLING_25_CONFIG.SHOT_TYPES).some((key) => lower.includes(key.replace('_', ' ')));

    const hasPhysics = Object.keys(KLING_25_CONFIG.PHYSICS_KEYWORDS).some((key) => lower.includes(key));

    const hasMicroExpression = KLING_25_CONFIG.MICRO_EXPRESSION_KEYWORDS.some((exp) => lower.includes(exp));

    // Check for nugget prefix
    const hasNugget = lower.includes('[0s-1.5s:') || lower.includes('visual nugget');

    const words = prompt.split(/\s+/);
    const priorityTokens = words.slice(0, 50).join(' ');

    return {
      hasCamera,
      hasShot,
      hasPhysics,
      hasMicroExpression,
      hasNugget,
      tokenEstimate: words.length,
      priorityTokens,
    };
  }
}

export const kling25PromptOptimizer = new Kling25PromptOptimizerService();
