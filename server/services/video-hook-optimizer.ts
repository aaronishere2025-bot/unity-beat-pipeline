/**
 * Video Hook Optimizer
 *
 * Research-backed hook strategies for short-form video content.
 * Based on comprehensive analysis of TikTok, YouTube Shorts, and Instagram Reels.
 *
 * Key Statistics:
 * - 70-80% of viewers decide to stay/swipe within first 3 seconds
 * - Gen Z active attention span: 1.3 seconds
 * - Videos using pattern interrupts: 58% retention vs 41% for static
 * - 65% of viewers who watch past 3 seconds continue to 10 seconds
 * - High saturation colors increase engagement by 25%
 * - Movement-based openings dramatically outperform static
 */

export interface HookConfig {
  battleType: 'creature' | 'food' | 'standard' | 'general' | 'historical';
  character1?: { name: string; type?: string; element?: string };
  character2?: { name: string; type?: string; element?: string };
  vibe?: string;
  stylePreset?: string;
  targetPlatform?: 'tiktok' | 'youtube_shorts' | 'instagram_reels' | 'all';
}

export interface HookEnhancedPrompt {
  originalPrompt: string;
  hookEnhancedPrompt: string;
  hookType: string;
  hookTechniques: string[];
  retentionMarkers: RetentionMarker[];
}

export interface RetentionMarker {
  timestampSeconds: number;
  technique: string;
  description: string;
}

/**
 * Camera angles and movements proven to capture attention
 */
const HOOK_CAMERA_TECHNIQUES = {
  heroShot: 'Low-angle static shot',
  midBattleImpact: 'Medium close-up tracking shot',
  povCharge: 'FPV tracking shot',
  dramaticReveal: 'Extreme close-up with slow dolly out',
  whipPan: 'Handheld whip pan',
  dutchAngle: 'Dutch canted angle',
  epicWide: 'Wide establishing shot with movement',
  intimateClose: 'Extreme close-up (ECU)',
};

/**
 * Visual hook templates for battle content
 * Based on research showing mid-action entry outperforms pre-action setup
 */
const BATTLE_HOOK_TEMPLATES = {
  clashImpact: {
    template:
      "{camera}: Two warriors' weapons CLASH mid-strike, sparks exploding between them, faces locked in fierce determination. {lighting}. {style}.",
    camera: 'Medium close-up tracking shot',
    techniques: ['mid-action entry', 'clash/impact moment', 'high contrast', 'movement'],
  },

  heroRise: {
    template:
      '{camera}: {character} raises weapon overhead, {element} crackling around them, dramatic backlighting silhouetting their battle stance. {lighting}. {style}.',
    camera: 'Low-angle static shot',
    techniques: ['hero shot', 'power pose', 'dramatic backlighting', 'visual pop'],
  },

  chargeToward: {
    template:
      '{camera}: Racing toward the battlefield, {character} charging with weapon drawn, debris and particles flying past camera. {lighting}. {style}.',
    camera: 'FPV tracking shot',
    techniques: ['POV immersion', 'dynamic movement', 'urgency', 'first-person engagement'],
  },

  dramaticStare: {
    template:
      "Opens on {camera} of {character}'s intense eyes, reflecting {element}, slowly pulling back to reveal full battle stance, opponent visible in background blur. {lighting}. {style}.",
    camera: 'extreme close-up',
    techniques: ['dramatic reveal', 'eye contact', 'parasocial connection', 'suspense build'],
  },

  weaponClash: {
    template:
      "{camera}: {character1}'s weapon meets {character2}'s in explosive impact, camera catching the exact moment of collision, slow motion capturing every spark and shard. {lighting}. {style}.",
    camera: 'Handheld medium shot with whip pan',
    techniques: ['mid-action entry', 'slow motion impact', 'high energy', 'dynamic movement'],
  },

  dualTension: {
    template:
      "{camera}: Split-focus shot showing both {character1} and {character2} in aggressive stances, the space between them crackling with tension, each warrior's element manifesting. {lighting}. {style}.",
    camera: 'Wide shot with shallow depth transitioning',
    techniques: ['face-to-face framing', 'dual character intro', 'tension establishment', 'elemental contrast'],
  },

  historicalLegends: {
    template:
      '{camera}: Two legendary warriors face off across an ancient battlefield, {character1} gripping their era-appropriate weapon as {character2} raises their shield, silk banners billowing and gold coins scattering in the wind. {lighting}. {style}.',
    camera: 'Epic wide crane shot',
    techniques: ['historical grandeur', 'trade goods visuals', 'era-appropriate weapons', 'legendary standoff'],
  },

  historicalClash: {
    template:
      "{camera}: Steel meets steel as {character1}'s blade locks with {character2}'s, ancient trade goods - silk fabrics, spices, and gold - scatter dramatically around them, two civilizations colliding. {lighting}. {style}.",
    camera: 'Medium close-up tracking shot',
    techniques: ['mid-action entry', 'historical artifacts', 'trade route imagery', 'civilizations clash'],
  },

  historicalReveal: {
    template:
      "Opens on {camera} of {character}'s battle-hardened face, firelight reflecting off ancient armor, slowly revealing an epic battlefield strewn with historical banners and trade goods. {lighting}. {style}.",
    camera: 'extreme close-up dolly out',
    techniques: ['dramatic reveal', 'historical authenticity', 'period-accurate visuals', 'epic scale'],
  },

  tradeRouteBattle: {
    template:
      '{camera}: Along the ancient trade routes, {character1} and {character2} clash amid cascading silk fabrics, exotic spices exploding in vibrant dust clouds, and gold coins catching the firelight. {lighting}. {style}.',
    camera: 'Dynamic tracking shot',
    techniques: ['trade goods emphasis', 'silk road imagery', 'historical spectacle', 'cultural artifacts'],
  },
};

/**
 * Historical-specific lighting for period-accurate atmosphere
 */
const HISTORICAL_LIGHTING = {
  ancientTorchlit:
    'flickering torchlight, warm amber glow on armor, deep shadows in ancient stone, period-authentic fire',
  medievalGolden: 'golden hour through castle windows, dusty God rays, banner-filtered light, tournament atmosphere',
  silkRoadSunset: 'Silk Road sunset glow, warm spice-colored lighting, desert twilight, caravan campfire warmth',
  empireClash: 'dramatic overcast, lightning-lit battlefield, dual-tone empire colors, conquest atmosphere',
  palaceIntrigue: 'candlelit palace interior, gold-reflected illumination, rich tapestry ambiance, royal court drama',
};

/**
 * Lighting keywords that create dramatic visual pop
 */
const DRAMATIC_LIGHTING = {
  fireVsIce: 'warm firelight clashing against cold blue glow, high contrast, volumetric lighting',
  neonUrban: 'harsh neon glow cutting through shadows, practical lighting from flickering signs',
  epicSunset: 'dramatic golden hour backlighting, rim light silhouettes, lens flare',
  stormDramatic: 'lightning illumination, dark atmospheric tension, strobe-like highlights',
  battleArena: 'overhead spotlights through dust and smoke, dramatic shadows, arena lighting',
  grimyRaw: 'flickering fluorescent mixed with neon graffiti glow, desaturated with color pops',
  cinematic: 'volumetric God rays, dramatic chiaroscuro, theatrical lighting',
};

/**
 * Style descriptors for hook moments
 */
const HOOK_STYLES = {
  epicBattle: 'cinematic epic scale, slow motion emphasis, shallow depth of field',
  rawGritty: 'handheld intensity, unpolished A24 aesthetic, raw energy, visual irony',
  hyperKinetic: 'fast cuts, dynamic camera, MTV-style energy, maximum impact',
  dramaticSlow: 'slow motion detail, every movement weighted, tension building',
  confrontational: 'face-to-face intensity, aggressive framing, battle tension',
};

/**
 * Pattern interrupt techniques for retention throughout video
 * Research shows pattern interrupts every 3-5 seconds achieve 58% retention vs 41%
 */
const PATTERN_INTERRUPTS = [
  { type: 'camera_angle_shift', description: 'Sudden shift from wide to close-up or vice versa' },
  { type: 'speed_change', description: 'Transition between slow motion and real-time' },
  { type: 'lighting_shift', description: 'Dramatic change in lighting mood or color' },
  { type: 'perspective_change', description: 'Switch from third person to POV or reverse' },
  { type: 'action_escalation', description: 'Sudden increase in intensity or movement' },
  { type: 'element_burst', description: 'Visual element explosion (sparks, flames, ice shards)' },
  { type: 'reaction_cut', description: 'Quick cut to character reaction or crowd' },
  { type: 'whip_pan', description: 'Fast camera movement to new subject' },
];

/**
 * Video Hook Optimizer Class
 */
class VideoHookOptimizer {
  /**
   * Get the best hook type for the content
   */
  selectHookType(config: HookConfig): keyof typeof BATTLE_HOOK_TEMPLATES {
    const { battleType, vibe } = config;

    // For historical battles, use era-appropriate hooks with trade goods visuals
    // These hooks emphasize: swords, shields, banners, silk, spices, gold - NO FOOD
    if (battleType === 'historical') {
      const historicalHooks: (keyof typeof BATTLE_HOOK_TEMPLATES)[] = [
        'historicalLegends',
        'historicalClash',
        'historicalReveal',
        'tradeRouteBattle',
      ];
      return historicalHooks[Math.floor(Math.random() * historicalHooks.length)];
    }

    // For creature battles, dramatic stare with elemental eyes works great
    if (battleType === 'creature') {
      return Math.random() > 0.5 ? 'dramaticStare' : 'weaponClash';
    }

    // For food battles, go for comedic clash impact
    if (battleType === 'food') {
      return 'clashImpact';
    }

    // For intense vibes, use hero rise or charge
    if (vibe?.toLowerCase().includes('intense') || vibe?.toLowerCase().includes('epic')) {
      return Math.random() > 0.5 ? 'heroRise' : 'chargeToward';
    }

    // Default: rotate through high-impact hooks
    const hookTypes: (keyof typeof BATTLE_HOOK_TEMPLATES)[] = ['clashImpact', 'heroRise', 'weaponClash', 'dualTension'];
    return hookTypes[Math.floor(Math.random() * hookTypes.length)];
  }

  /**
   * Select appropriate lighting for the battle type
   */
  selectLighting(config: HookConfig): string {
    const { character1, character2, battleType, stylePreset } = config;

    // For historical battles, use period-appropriate lighting
    // Emphasizes ancient atmosphere, NO modern food-related neon lighting
    if (battleType === 'historical') {
      const historicalLightingOptions = Object.values(HISTORICAL_LIGHTING);
      return historicalLightingOptions[Math.floor(Math.random() * historicalLightingOptions.length)];
    }

    // Check for fire vs ice elements
    const elements = [character1?.element?.toLowerCase() || '', character2?.element?.toLowerCase() || ''].join(' ');

    if (elements.includes('fire') && elements.includes('ice')) {
      return DRAMATIC_LIGHTING.fireVsIce;
    }

    if (elements.includes('fire') || elements.includes('flame')) {
      return DRAMATIC_LIGHTING.epicSunset;
    }

    if (elements.includes('ice') || elements.includes('frost')) {
      return 'cold blue twilight glow, frost-reflected highlights, icy atmosphere';
    }

    if (elements.includes('storm') || elements.includes('lightning')) {
      return DRAMATIC_LIGHTING.stormDramatic;
    }

    // Based on style preset
    if (stylePreset?.includes('gritty') || stylePreset?.includes('raw')) {
      return DRAMATIC_LIGHTING.grimyRaw;
    }

    if (stylePreset?.includes('cinematic')) {
      return DRAMATIC_LIGHTING.cinematic;
    }

    // Default epic battle lighting
    return DRAMATIC_LIGHTING.battleArena;
  }

  /**
   * Select style descriptor for hook
   */
  selectStyle(config: HookConfig): string {
    const { vibe, stylePreset } = config;

    if (stylePreset?.includes('gritty') || vibe?.includes('raw')) {
      return HOOK_STYLES.rawGritty;
    }

    if (vibe?.includes('intense') || vibe?.includes('aggressive')) {
      return HOOK_STYLES.hyperKinetic;
    }

    if (vibe?.includes('dramatic') || vibe?.includes('epic')) {
      return HOOK_STYLES.dramaticSlow;
    }

    return HOOK_STYLES.epicBattle;
  }

  /**
   * Generate an optimized hook prompt for the intro section
   */
  generateHookPrompt(config: HookConfig): HookEnhancedPrompt {
    const hookType = this.selectHookType(config);
    const hookTemplate = BATTLE_HOOK_TEMPLATES[hookType];
    const lighting = this.selectLighting(config);
    const style = this.selectStyle(config);

    // Build character references
    const char1Name = config.character1?.name || 'the warrior';
    const char2Name = config.character2?.name || 'their opponent';
    const element = config.character1?.element || config.character2?.element || 'energy';

    // Fill template
    let hookPrompt = hookTemplate.template
      .replace('{camera}', hookTemplate.camera)
      .replace('{character}', char1Name)
      .replace('{character1}', char1Name)
      .replace('{character2}', char2Name)
      .replace('{element}', element)
      .replace('{lighting}', lighting)
      .replace('{style}', style);

    // Add hook-specific enhancements
    hookPrompt = this.addHookEnhancements(hookPrompt);

    return {
      originalPrompt: '',
      hookEnhancedPrompt: hookPrompt,
      hookType,
      hookTechniques: hookTemplate.techniques,
      retentionMarkers: this.generateRetentionMarkers(6), // For 6-second intro
    };
  }

  /**
   * Enhance an existing intro prompt with hook techniques
   */
  enhanceIntroPrompt(originalPrompt: string, config: HookConfig): HookEnhancedPrompt {
    const hookType = this.selectHookType(config);
    const hookTemplate = BATTLE_HOOK_TEMPLATES[hookType];
    const lighting = this.selectLighting(config);
    const style = this.selectStyle(config);

    // Analyze original prompt for key elements
    const hasCamera = /(?:shot|angle|camera|tracking|close-up|wide)/i.test(originalPrompt);
    const hasLighting = /(?:light|glow|illuminate|shadow|backlight)/i.test(originalPrompt);
    const hasAction = /(?:clash|strike|charge|attack|fight)/i.test(originalPrompt);

    let enhancedPrompt = originalPrompt;

    // Add camera technique if missing strong hook camera
    if (!hasCamera || !originalPrompt.toLowerCase().startsWith(hookTemplate.camera.toLowerCase())) {
      // Prepend strong camera hook
      enhancedPrompt = `${hookTemplate.camera}: ${enhancedPrompt}`;
    }

    // Enhance with mid-action entry if not already action-focused
    if (!hasAction) {
      enhancedPrompt = enhancedPrompt.replace(
        /^([^.]+\.)/,
        '$1 The action begins IMMEDIATELY with explosive movement.',
      );
    }

    // Add dramatic lighting if weak
    if (!hasLighting) {
      enhancedPrompt += ` ${lighting}.`;
    }

    // Add hook-specific style
    enhancedPrompt += ` ${style}.`;

    // Add hook enhancement keywords
    enhancedPrompt = this.addHookEnhancements(enhancedPrompt);

    return {
      originalPrompt,
      hookEnhancedPrompt: enhancedPrompt,
      hookType,
      hookTechniques: hookTemplate.techniques,
      retentionMarkers: this.generateRetentionMarkers(6),
    };
  }

  /**
   * Add hook enhancement keywords that increase retention
   */
  private addHookEnhancements(prompt: string): string {
    const enhancements = ['immediate visual impact', 'attention-grabbing first frame', 'high contrast colors'];

    // Check what's already present
    if (!prompt.includes('immediate') && !prompt.includes('instant')) {
      prompt = prompt.replace(/^/, 'HOOK MOMENT: ');
    }

    // Ensure movement is emphasized
    if (!prompt.includes('movement') && !prompt.includes('motion') && !prompt.includes('dynamic')) {
      prompt += ' Dynamic movement fills the frame.';
    }

    return prompt;
  }

  /**
   * Generate retention markers for pattern interrupts
   * Research: Pattern interrupts every 3-5 seconds achieve 58% retention
   */
  generateRetentionMarkers(durationSeconds: number): RetentionMarker[] {
    const markers: RetentionMarker[] = [];

    // First hook at 0-3 seconds (critical window)
    markers.push({
      timestampSeconds: 0,
      technique: 'hook_moment',
      description: 'Primary visual hook - maximum impact opening',
    });

    // Pattern interrupts every 3-5 seconds
    for (let time = 3; time < durationSeconds; time += 3 + Math.floor(Math.random() * 2)) {
      const interrupt = PATTERN_INTERRUPTS[Math.floor(Math.random() * PATTERN_INTERRUPTS.length)];
      markers.push({
        timestampSeconds: time,
        technique: interrupt.type,
        description: interrupt.description,
      });
    }

    return markers;
  }

  /**
   * Enhance a verse/section prompt with retention techniques
   */
  enhanceSectionPrompt(
    sectionPrompt: string,
    sectionType: string,
    durationSeconds: number,
  ): { enhancedPrompt: string; retentionMarkers: RetentionMarker[] } {
    let enhancedPrompt = sectionPrompt;
    const retentionMarkers = this.generateRetentionMarkers(durationSeconds);

    // Add section-specific enhancements
    if (sectionType.toLowerCase().includes('chorus')) {
      // Chorus should have maximum energy and visual payoff
      enhancedPrompt = this.enhanceChorus(enhancedPrompt);
    } else if (sectionType.toLowerCase().includes('verse')) {
      // Verses should build tension with pattern interrupts
      enhancedPrompt = this.enhanceVerse(enhancedPrompt);
    } else if (sectionType.toLowerCase().includes('bridge')) {
      // Bridge is emotional peak - intimate then explosive
      enhancedPrompt = this.enhanceBridge(enhancedPrompt);
    } else if (sectionType.toLowerCase().includes('outro')) {
      // Outro should have memorable final moment
      enhancedPrompt = this.enhanceOutro(enhancedPrompt);
    }

    return { enhancedPrompt, retentionMarkers };
  }

  private enhanceChorus(prompt: string): string {
    const chorusEnhancements = [
      'maximum visual energy',
      'dynamic camera movement',
      'epic scale composition',
      'climactic action',
    ];

    if (!prompt.includes('epic') && !prompt.includes('climax')) {
      prompt += ` CHORUS PEAK: ${chorusEnhancements.join(', ')}.`;
    }

    return prompt;
  }

  private enhanceVerse(prompt: string): string {
    if (!prompt.includes('tension') && !prompt.includes('building')) {
      prompt += ' Building tension with each beat, camera actively engaging with the action.';
    }
    return prompt;
  }

  private enhanceBridge(prompt: string): string {
    if (!prompt.includes('intimate') && !prompt.includes('close')) {
      prompt = prompt.replace(/\.([^.]*$)/, '. Intimate close-up moments transitioning to wide emotional reveal.$1');
    }
    return prompt;
  }

  private enhanceOutro(prompt: string): string {
    if (!prompt.includes('final') && !prompt.includes('resolution')) {
      prompt += ' Memorable final frame composition, visual resolution of the conflict.';
    }
    return prompt;
  }

  /**
   * Get hook statistics and recommendations
   */
  getHookRecommendations(targetPlatform: string = 'all'): {
    criticalWindow: string;
    retentionTargets: Record<string, string>;
    keyTechniques: string[];
  } {
    const recommendations = {
      criticalWindow: '0-3 seconds - 70-80% of viewers decide to stay or swipe',
      retentionTargets: {
        '30sec': '50-60% retention target',
        '1min': '40-50% retention target',
        '2min': '30-40% retention target',
        '3min': '20-30% retention target',
      },
      keyTechniques: [
        'Mid-action entry (start during action, not before)',
        'Low-angle hero shots for power/dominance',
        'Movement in first frame (never static)',
        'High saturation colors (10-15% above normal)',
        'Direct eye contact for parasocial connection',
        'Pattern interrupts every 3-5 seconds',
        'Clash/impact moments as opening frames',
      ],
    };

    return recommendations;
  }
}

export const videoHookOptimizer = new VideoHookOptimizer();

/**
 * Quick helper to enhance an intro prompt
 */
export function optimizeIntroHook(prompt: string, config: HookConfig): string {
  const result = videoHookOptimizer.enhanceIntroPrompt(prompt, config);
  return result.hookEnhancedPrompt;
}

/**
 * Generate a standalone hook prompt
 */
export function generateBattleHook(config: HookConfig): string {
  const result = videoHookOptimizer.generateHookPrompt(config);
  return result.hookEnhancedPrompt;
}
