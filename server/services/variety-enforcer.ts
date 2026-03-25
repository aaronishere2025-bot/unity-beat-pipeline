/**
 * VARIETY ENFORCER
 * Prevents repetitive shots in AI-generated video content
 * Ensures each clip feels unique while maintaining story coherence
 */

export const CAMERA_SHOTS = {
  establishing: [
    'Ultra-wide establishing shot',
    'Aerial crane shot descending into',
    'Slow dolly-in from distance revealing',
    'Silhouette wide shot against glowing backdrop',
    'Ground-level wide shot looking up at',
  ],

  hero: [
    'Low-angle hero shot emphasizing power of',
    'Dutch angle dramatic shot of',
    'Backlit silhouette shot of',
    'Slow-motion entrance shot of',
    'Epic wide hero pose of',
  ],

  action: [
    'Handheld tracking shot following',
    'Whip pan catching',
    'Crash zoom into',
    'POV shot from perspective of',
    'Over-shoulder shot behind',
    'Side-profile tracking',
    'Orbital shot circling around',
    'Steadicam push-in on',
  ],

  impact: [
    'Extreme slow-motion capture of',
    'Freeze-frame at moment of',
    'Speed ramping from slow to fast on',
    'Multi-angle quick cuts of',
    'Close-up detail shot of',
  ],

  intimate: [
    'Extreme close-up on eyes of',
    'Soft focus close-up of',
    'Macro shot of sweat/detail on',
    'Two-shot with shallow depth of field',
    'Reflection shot in weapon/armor of',
  ],

  reaction: [
    'Quick cut to reaction of',
    'Split-second insert of',
    'Cutaway to crowd watching',
    'Environmental reaction shot showing',
  ],

  resolution: [
    'Slow pull-back wide shot of',
    'Crane shot rising above',
    'Static tableau shot of',
    'Fade-through dissolve of',
    'Golden hour silhouette of',
  ],
};

export const COMBAT_ACTIONS = {
  offensive: [
    'lunges forward with overhead strike',
    'spins into a sweeping horizontal slash',
    'charges with weapon raised high',
    'leaps through the air, weapon descending',
    'unleashes rapid combo of strikes',
    'thrusts weapon forward in piercing attack',
    'winds up for devastating power blow',
    'feints left then strikes right',
  ],

  defensive: [
    'raises shield to block incoming strike',
    'parries with expert precision',
    'sidesteps and deflects',
    'rolls under sweeping attack',
    'catches blade on weapon guard',
    'backpedals while blocking',
    'ducks and weaves through strikes',
    'uses environment for cover',
  ],

  clash: [
    'weapons lock in grinding standoff',
    'blades meet in shower of sparks',
    'shield crashes against weapon',
    'both strike simultaneously, blades crossing',
    'weapons connect with thunderous impact',
    'steel rings against steel in stalemate',
  ],

  movement: [
    'circles opponent with predatory focus',
    'advances slowly with weapon ready',
    'retreats to reassess strategy',
    'strafes sideways, eyes locked',
    'closes distance with measured steps',
    'maintains defensive stance while moving',
  ],

  recovery: [
    'staggers back from heavy blow',
    'catches breath in momentary pause',
    'steadies stance after near-miss',
    'shakes off impact, refocusing',
    'rises from knocked-down position',
    'retrieves dropped weapon quickly',
  ],

  emotional: [
    'locks eyes with opponent in mutual respect',
    'nods acknowledgment of worthy foe',
    'shows exhaustion but refuses to yield',
    'grins despite the intensity',
    'roars battle cry with renewed vigor',
    'pauses in moment of realization',
  ],
};

export const SETTING_AREAS = {
  arena: [
    'center of the arena floor',
    'near the crowd barriers',
    'on the elevated champion platform',
    'beside the entrance gates',
    'in the shadowed corner',
    'under the main spotlight',
    'by the victory podium',
    'along the arena wall',
    'on scattered debris and rubble',
    'near the burning torch stands',
  ],

  environmental: [
    'dust swirling around their feet',
    'sparks raining down from above',
    'smoke drifting through the scene',
    'debris flying from impact',
    'flames flickering in background',
    'mist rolling across the ground',
    'golden particles floating in air',
    'shadows dancing on walls',
  ],
};

export const LIGHTING_PROGRESSION = {
  intro: [
    'dramatic rim lighting from behind',
    'golden hour warm glow',
    'high contrast theatrical lighting',
    'silhouette backlighting',
  ],

  verse: [
    'dynamic mixed lighting with warm and cool tones',
    'practical lighting from in-scene sources',
    'naturalistic but dramatic',
    'moving light sources creating shadows',
  ],

  chorus: [
    'maximum dramatic contrast',
    'strobing intensity from impacts',
    'explosive bright highlights',
    'epic lens flares and light beams',
  ],

  bridge: [
    'soft diffused emotional lighting',
    'intimate close-up lighting',
    'sunset golden warmth',
    'calm after storm atmosphere',
  ],

  outro: [
    'warm unified golden glow',
    'peaceful ambient lighting',
    'hopeful dawn light',
    'respectful soft illumination',
  ],
};

export const ARMOR_DEGRADATION: Record<number, string> = {
  0: 'pristine and polished, gleaming',
  1: 'minor scratches and dust',
  2: 'visible dents and battle wear',
  3: 'damaged sections, pieces missing',
  4: 'heavily battered, barely holding',
  5: 'broken but still standing, helmet removed',
};

export const ENERGY_LEVELS = {
  low: {
    pacing: 'slow, deliberate movements',
    camera: 'steady, contemplative shots',
    action: 'circling, assessing, recovering',
  },
  medium: {
    pacing: 'measured, tactical movements',
    camera: 'tracking, following action',
    action: 'probing strikes, testing defenses',
  },
  high: {
    pacing: 'fast, aggressive movements',
    camera: 'dynamic, handheld intensity',
    action: 'full combat, rapid exchanges',
  },
  peak: {
    pacing: 'explosive, maximum intensity',
    camera: 'crash zooms, whip pans, slow-mo impacts',
    action: 'climactic clash, decisive moments',
  },
};

interface UsageTracker {
  cameras: string[];
  actions: string[];
  settings: string[];
  lastCamera: string;
  lastAction: string;
  lastSetting: string;
  clipIndex: number;
}

export class VarietyEnforcer {
  private tracker: UsageTracker;
  private totalClips: number;

  constructor(totalClips: number) {
    this.totalClips = totalClips;
    this.tracker = {
      cameras: [],
      actions: [],
      settings: [],
      lastCamera: '',
      lastAction: '',
      lastSetting: '',
      clipIndex: 0,
    };
  }

  private getSectionType(clipIndex: number): string {
    const position = clipIndex / this.totalClips;

    if (position < 0.1) return 'intro';
    if (position < 0.3) return 'verse';
    if (position < 0.4) return 'chorus';
    if (position < 0.6) return 'verse';
    if (position < 0.7) return 'chorus';
    if (position < 0.85) return 'bridge';
    return 'outro';
  }

  private getEnergyLevel(section: string, clipIndex: number): keyof typeof ENERGY_LEVELS {
    const energyMap: Record<string, keyof typeof ENERGY_LEVELS> = {
      intro: 'medium',
      verse: 'medium',
      chorus: 'peak',
      bridge: 'low',
      outro: 'low',
    };

    const withinSectionPosition = (clipIndex % 4) / 4;
    const baseEnergy = energyMap[section] || 'medium';

    if (section === 'chorus' && withinSectionPosition < 0.5) return 'high';
    if (section === 'verse' && withinSectionPosition > 0.7) return 'high';

    return baseEnergy;
  }

  private getArmorState(clipIndex: number): string {
    const progression = clipIndex / this.totalClips;
    const state = Math.min(5, Math.floor(progression * 6));
    return ARMOR_DEGRADATION[state] || ARMOR_DEGRADATION[0];
  }

  private selectWithVariety<T>(options: T[], recentlyUsed: T[], lastUsed: T): T {
    const recentSet = new Set(recentlyUsed.slice(-3));
    let available = options.filter((opt) => !recentSet.has(opt) && opt !== lastUsed);

    if (available.length < 2) {
      available = options.filter((opt) => opt !== lastUsed);
    }

    if (available.length === 0) {
      available = options;
    }

    return available[Math.floor(Math.random() * available.length)];
  }

  getCameraShot(clipIndex: number, section: string): string {
    const energy = this.getEnergyLevel(section, clipIndex);

    let cameraCategory: keyof typeof CAMERA_SHOTS;

    if (clipIndex === 0) {
      cameraCategory = 'establishing';
    } else if (section === 'intro') {
      cameraCategory = 'hero';
    } else if (section === 'chorus') {
      cameraCategory = energy === 'peak' ? 'impact' : 'action';
    } else if (section === 'bridge') {
      cameraCategory = 'intimate';
    } else if (section === 'outro') {
      cameraCategory = 'resolution';
    } else {
      const actionCategories: (keyof typeof CAMERA_SHOTS)[] = ['action', 'reaction', 'intimate', 'hero'];
      cameraCategory = actionCategories[clipIndex % actionCategories.length];
    }

    const options = CAMERA_SHOTS[cameraCategory];
    const selected = this.selectWithVariety(options, this.tracker.cameras, this.tracker.lastCamera);

    this.tracker.cameras.push(selected);
    this.tracker.lastCamera = selected;

    return selected;
  }

  getCombatAction(clipIndex: number, section: string): string {
    const energy = this.getEnergyLevel(section, clipIndex);

    let actionCategory: keyof typeof COMBAT_ACTIONS;

    if (section === 'intro') {
      actionCategory = 'movement';
    } else if (section === 'chorus') {
      actionCategory = energy === 'peak' ? 'clash' : 'offensive';
    } else if (section === 'bridge') {
      actionCategory = 'emotional';
    } else if (section === 'outro') {
      actionCategory = 'emotional';
    } else {
      const combatCategories: (keyof typeof COMBAT_ACTIONS)[] = [
        'offensive',
        'defensive',
        'clash',
        'movement',
        'offensive',
        'recovery',
      ];
      actionCategory = combatCategories[clipIndex % combatCategories.length];
    }

    const options = COMBAT_ACTIONS[actionCategory];
    const selected = this.selectWithVariety(options, this.tracker.actions, this.tracker.lastAction);

    this.tracker.actions.push(selected);
    this.tracker.lastAction = selected;

    return selected;
  }

  getSettingArea(clipIndex: number): string {
    const options = SETTING_AREAS.arena;
    const selected = this.selectWithVariety(options, this.tracker.settings, this.tracker.lastSetting);

    this.tracker.settings.push(selected);
    this.tracker.lastSetting = selected;

    return selected;
  }

  getEnvironmentalEffect(clipIndex: number, section: string): string {
    if (section === 'chorus') {
      return SETTING_AREAS.environmental[clipIndex % SETTING_AREAS.environmental.length];
    }

    const subtleEffects = SETTING_AREAS.environmental.slice(0, 3);
    return subtleEffects[clipIndex % subtleEffects.length];
  }

  getLighting(section: string, clipIndex: number): string {
    const sectionLighting =
      LIGHTING_PROGRESSION[section as keyof typeof LIGHTING_PROGRESSION] || LIGHTING_PROGRESSION.verse;

    return sectionLighting[clipIndex % sectionLighting.length];
  }

  generateVariedPrompt(
    clipIndex: number,
    sectionName: string,
    characterA: string,
    characterB: string,
    baseSetting: string,
  ): string {
    this.tracker.clipIndex = clipIndex;
    const section = this.getSectionType(clipIndex);

    const camera = this.getCameraShot(clipIndex, section);
    const action = this.getCombatAction(clipIndex, section);
    const settingArea = this.getSettingArea(clipIndex);
    const environment = this.getEnvironmentalEffect(clipIndex, section);
    const lighting = this.getLighting(section, clipIndex);
    const armorState = this.getArmorState(clipIndex);
    const energy = ENERGY_LEVELS[this.getEnergyLevel(section, clipIndex)];

    const focusCharacter = clipIndex % 2 === 0 ? characterA : characterB;
    const otherCharacter = clipIndex % 2 === 0 ? characterB : characterA;

    let prompt = '';

    prompt += `${camera} ${focusCharacter}`;

    if (section === 'bridge' || section === 'outro') {
      prompt += ` as they ${action}`;
    } else {
      prompt += ` who ${action}`;
      prompt += ` while ${otherCharacter} responds`;
    }

    prompt += `. Set in ${baseSetting}, specifically ${settingArea}`;
    prompt += `, ${environment}`;
    prompt += `. Armor is ${armorState}`;
    prompt += `. ${lighting}`;
    prompt += `. ${energy.pacing}, ${energy.camera}`;
    prompt += `. Cinematic 9:16 vertical, high detail, epic scale.`;

    return prompt;
  }

  validateVariety(
    newPrompt: string,
    previousPrompt: string,
  ): {
    isValid: boolean;
    similarity: number;
    issues: string[];
  } {
    const issues: string[] = [];

    const keyPhrases = [
      'wide shot',
      'close-up',
      'tracking',
      'dolly',
      'crane',
      'lunges',
      'blocks',
      'dodges',
      'clashes',
      'circles',
      'center of',
      'near the',
      'beside the',
    ];

    let matchCount = 0;
    for (const phrase of keyPhrases) {
      if (previousPrompt.toLowerCase().includes(phrase) && newPrompt.toLowerCase().includes(phrase)) {
        matchCount++;
        issues.push(`Repeated phrase: "${phrase}"`);
      }
    }

    const similarity = matchCount / keyPhrases.length;

    return {
      isValid: similarity < 0.3,
      similarity: similarity * 100,
      issues,
    };
  }

  getVarietySummary(): {
    totalClips: number;
    uniqueCameras: number;
    uniqueActions: number;
    uniqueSettings: number;
    varietyScore: number;
  } {
    const uniqueCameras = new Set(this.tracker.cameras).size;
    const uniqueActions = new Set(this.tracker.actions).size;
    const uniqueSettings = new Set(this.tracker.settings).size;

    const totalTracked = this.tracker.cameras.length;

    // Prevent division by zero when nothing has been tracked yet
    if (totalTracked === 0) {
      return {
        totalClips: 0,
        uniqueCameras: 0,
        uniqueActions: 0,
        uniqueSettings: 0,
        varietyScore: 0,
      };
    }

    const maxPossible = totalTracked * 3;
    const actual = uniqueCameras + uniqueActions + uniqueSettings;
    const varietyScore = Math.round((actual / maxPossible) * 100);

    return {
      totalClips: totalTracked,
      uniqueCameras,
      uniqueActions,
      uniqueSettings,
      varietyScore,
    };
  }

  reset(): void {
    this.tracker = {
      cameras: [],
      actions: [],
      settings: [],
      lastCamera: '',
      lastAction: '',
      lastSetting: '',
      clipIndex: 0,
    };
  }
}

export function enhancePromptsWithVariety(
  existingPrompts: any[],
  characterA: string,
  characterB: string,
  baseSetting: string,
): string[] {
  const enforcer = new VarietyEnforcer(existingPrompts.length);

  return existingPrompts.map((prompt, index) => {
    const sectionName = typeof prompt === 'object' ? prompt.sectionName : 'verse';
    return enforcer.generateVariedPrompt(index, sectionName, characterA, characterB, baseSetting);
  });
}

export const varietyEnforcer = {
  VarietyEnforcer,
  enhancePromptsWithVariety,
  CAMERA_SHOTS,
  COMBAT_ACTIONS,
  SETTING_AREAS,
  LIGHTING_PROGRESSION,
  ARMOR_DEGRADATION,
  ENERGY_LEVELS,
};
