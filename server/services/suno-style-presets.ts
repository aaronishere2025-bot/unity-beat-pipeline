/**
 * Suno Style Presets for Unity Content
 *
 * Provides optimized music prompts for unity anthem style content
 * designed to work with Suno AI music generation.
 *
 * Features:
 * - Unity anthem presets (Inspiration, Protest, Unity Rally)
 * - Optimized BPM and key recommendations
 * - Genre-specific instrumentation suggestions
 * - Vocal style and production tips
 *
 * VEO 8-SECOND ALIGNMENT:
 * BPMs must align with 8-second VEO clip boundaries for perfect audio-visual sync.
 * Formula: beats_in_8s = BPM ÷ 7.5
 * Aligned BPMs: 60, 90, 120, 150, 180, 210, 240
 * AVOID: 128, 140, 143.6 (common but misaligned)
 */

export const VEO_ALIGNED_BPMS = [60, 90, 120, 150, 180, 210, 240] as const;

export function snapToVeoAlignedBpm(bpm: number): number {
  let closest: number = VEO_ALIGNED_BPMS[0];
  let minDiff = Math.abs(bpm - closest);

  for (const alignedBpm of VEO_ALIGNED_BPMS) {
    const diff = Math.abs(bpm - alignedBpm);
    if (diff < minDiff) {
      minDiff = diff;
      closest = alignedBpm;
    }
  }

  return closest;
}

export interface SunoStylePreset {
  name: string;
  description: string;
  genre: string;
  subgenre?: string;
  bpm: { min: number; max: number; target: number };
  key: string;
  mood: string[];
  instruments: string[];
  vocals: {
    style: string;
    effects?: string[];
  };
  production: {
    mix: string;
    effects: string[];
  };
  sunoPrompt: string;
  sunoStyleTags: string[];
}

export interface UnityMusicPrompt {
  stylePreset: SunoStylePreset;
  customizedPrompt: string;
  lyricsPrompt: string;
  styleDescription: string;
  tags: string[];
}

/**
 * Unity Anthem Style Presets
 * Optimized for political unity and healing content
 */
export const UNITY_STYLE_PRESETS: Record<string, SunoStylePreset> = {
  // Inspirational Unity Anthem
  inspiration: {
    name: 'Unity Inspiration',
    description: 'Uplifting anthem that inspires hope and togetherness',
    genre: 'Epic Pop',
    subgenre: 'Anthemic',
    bpm: { min: 115, max: 125, target: 120 }, // VEO-aligned (was 125)
    key: 'C Major',
    mood: ['hopeful', 'powerful', 'unifying', 'emotional'],
    instruments: ['orchestral strings', 'piano', 'epic drums', 'choir', 'acoustic guitar', 'synth pads'],
    vocals: {
      style: 'powerful, emotional, anthemic',
      effects: ['reverb', 'harmony layers'],
    },
    production: {
      mix: 'modern, radio-ready, dynamic',
      effects: ['build-ups', 'drops', 'emotional crescendos'],
    },
    sunoPrompt:
      'Epic anthemic pop, powerful emotional vocals, orchestral strings, choir harmonies, inspirational build-up, stadium sound, 120 BPM, C Major',
    sunoStyleTags: ['anthemic', 'epic', 'inspirational', 'orchestral pop', 'stadium', 'powerful vocals'],
  },

  // Protest Unity Track
  protest: {
    name: 'Unity Protest',
    description: 'Energetic protest anthem calling for change and unity',
    genre: 'Hip-Hop',
    subgenre: 'Conscious Rap',
    bpm: { min: 85, max: 95, target: 90 },
    key: 'A Minor',
    mood: ['defiant', 'passionate', 'determined', 'raw'],
    instruments: ['hard-hitting drums', 'bass', 'piano chords', 'crowd chants', 'brass stabs'],
    vocals: {
      style: 'passionate, rhythmic, powerful delivery',
      effects: ['ad-libs', 'crowd response'],
    },
    production: {
      mix: 'punchy, bass-heavy, raw energy',
      effects: ['vinyl crackle', 'phone filter for verses', 'build-ups'],
    },
    sunoPrompt:
      'Conscious hip-hop, passionate powerful vocals, hard-hitting drums, piano chords, brass accents, crowd chants, protest energy, 90 BPM, A Minor',
    sunoStyleTags: ['conscious rap', 'protest', 'hip-hop', 'powerful', 'bass-heavy', 'raw'],
  },

  // Unity Rally (Arena Style)
  rally: {
    name: 'Unity Rally',
    description: 'Arena-ready rally song that gets crowds moving together',
    genre: 'Electronic Pop',
    subgenre: 'EDM Festival',
    bpm: { min: 115, max: 125, target: 120 }, // VEO-aligned (was 128)
    key: 'G Major',
    mood: ['energetic', 'euphoric', 'collective', 'triumphant'],
    instruments: ['synth leads', 'four-on-floor kick', 'claps', 'synth bass', 'festival horns', 'vocal chops'],
    vocals: {
      style: 'chant-like, stadium singalong, powerful',
      effects: ['vocoder', 'harmony stacks', 'call-and-response'],
    },
    production: {
      mix: 'festival-ready, massive, wide stereo',
      effects: ['builds', 'drops', 'risers', 'crowd noise'],
    },
    sunoPrompt:
      'EDM festival anthem, euphoric synths, powerful chant vocals, massive drop, four-on-floor beat, festival horns, crowd energy, 128 BPM, G Major',
    sunoStyleTags: ['EDM', 'festival', 'anthem', 'euphoric', 'chant', 'massive drop'],
  },

  // Healing Ballad
  healing: {
    name: 'Unity Healing',
    description: 'Emotional ballad focused on healing divisions',
    genre: 'R&B Soul',
    subgenre: 'Neo-Soul',
    bpm: { min: 55, max: 65, target: 60 }, // VEO-aligned (was 75)
    key: 'E♭ Major',
    mood: ['emotional', 'healing', 'intimate', 'hopeful'],
    instruments: ['rhodes piano', 'lush strings', 'soft drums', 'bass guitar', 'ambient pads'],
    vocals: {
      style: 'soulful, intimate, emotional',
      effects: ['reverb', 'subtle delay', 'backing vocals'],
    },
    production: {
      mix: 'warm, intimate, organic feel',
      effects: ['tape saturation', 'vinyl warmth'],
    },
    sunoPrompt:
      'Neo-soul ballad, soulful emotional vocals, rhodes piano, lush strings, warm production, intimate healing vibe, 75 BPM, Eb Major',
    sunoStyleTags: ['neo-soul', 'ballad', 'emotional', 'healing', 'intimate', 'warm'],
  },

  // Battle Unity (Confrontational then Resolution)
  battleUnity: {
    name: 'Battle to Unity',
    description: 'Starts as confrontational battle rap, transforms to unity',
    genre: 'Hip-Hop',
    subgenre: 'Battle Rap / Anthemic',
    bpm: { min: 115, max: 125, target: 120 }, // VEO-aligned (was 125)
    key: 'D Minor to D Major',
    mood: ['confrontational', 'intense', 'transformative', 'triumphant'],
    instruments: ['aggressive 808s', 'trap hi-hats', 'orchestral hits', 'piano', 'choir (in resolution)'],
    vocals: {
      style: 'aggressive bars then emotional delivery',
      effects: ['distortion on battle parts', 'reverb on unity parts'],
    },
    production: {
      mix: 'aggressive then opens up, dynamic range',
      effects: ['key change', 'tempo shift', 'production shift'],
    },
    sunoPrompt:
      'Hip-hop battle rap transforming to anthemic unity, aggressive 808s to orchestral, intense verses to triumphant chorus, choir resolution, 125 BPM, D Minor to D Major',
    sunoStyleTags: ['battle rap', 'anthem', 'transformation', 'orchestral hip-hop', 'dynamic', 'triumphant'],
  },

  // Epic Battle Rap - Comedic Storytelling
  epicBattleRap: {
    name: 'Epic Battle Rap',
    description: 'Observational rap with comedic storytelling, wry delivery, and epic production',
    genre: 'Hip-Hop',
    subgenre: 'Comedic Battle Rap',
    bpm: { min: 85, max: 95, target: 90 }, // VEO-aligned (was 95)
    key: 'A Minor',
    mood: ['comedic', 'epic', 'wry', 'playful', 'dramatic'],
    instruments: [
      'bouncy bassline',
      'jazzy piano loops',
      'warm synth pads',
      'minimalistic drum kit',
      'crisp percussion with swing',
      'orchestral stabs',
    ],
    vocals: {
      style: 'wry detached delivery, conversational flow, comedic storytelling',
      effects: ['layered vocal harmonies', 'subtle reverb', 'ad-libs'],
    },
    production: {
      mix: 'dynamic progression, punchy low-end, warm mids',
      effects: ['ironic detachment meets genuine connection', 'swing percussion'],
    },
    sunoPrompt:
      'Hip-hop, observational rap, comedic storytelling, wry detached delivery, conversational flow, bouncy bassline, jazzy piano loops, warm synth pads, minimalistic drum kit, layered vocal harmonies, dynamic progression, crisp percussion with swing, 95 BPM, A Minor',
    sunoStyleTags: ['hip-hop', 'comedic rap', 'battle rap', 'jazzy', 'observational', 'storytelling', '95 BPM'],
  },

  // Acoustic Unity
  acoustic: {
    name: 'Acoustic Unity',
    description: 'Stripped-down acoustic anthem for intimate connection',
    genre: 'Folk Pop',
    subgenre: 'Acoustic Singer-Songwriter',
    bpm: { min: 115, max: 125, target: 120 }, // VEO-aligned (was 105)
    key: 'G Major',
    mood: ['authentic', 'warm', 'connected', 'genuine'],
    instruments: ['acoustic guitar', 'light percussion', 'bass', 'piano', 'strings (subtle)'],
    vocals: {
      style: 'warm, authentic, conversational',
      effects: ['light room reverb', 'harmony on chorus'],
    },
    production: {
      mix: 'organic, natural, room sound',
      effects: ['minimal processing', 'natural dynamics'],
    },
    sunoPrompt:
      'Acoustic folk pop, warm authentic vocals, acoustic guitar, light percussion, organic production, intimate singalong, 105 BPM, G Major',
    sunoStyleTags: ['acoustic', 'folk pop', 'singalong', 'authentic', 'warm', 'organic'],
  },

  // Cinematic Unity
  cinematic: {
    name: 'Cinematic Unity',
    description: 'Epic cinematic score with vocals for trailers/videos',
    genre: 'Cinematic',
    subgenre: 'Epic Trailer',
    bpm: { min: 85, max: 95, target: 90 },
    key: 'C Minor',
    mood: ['epic', 'cinematic', 'powerful', 'dramatic'],
    instruments: ['full orchestra', 'taiko drums', 'choir', 'brass section', 'strings', 'electronic elements'],
    vocals: {
      style: 'operatic, powerful, soaring',
      effects: ['large hall reverb', 'layered choir'],
    },
    production: {
      mix: 'massive, cinematic, wide',
      effects: ['builds', 'impacts', 'risers', 'LFE bass'],
    },
    sunoPrompt:
      'Epic cinematic trailer music, powerful operatic vocals, full orchestra, taiko drums, massive choir, dramatic builds and impacts, 90 BPM, C Minor',
    sunoStyleTags: ['cinematic', 'epic', 'trailer', 'orchestral', 'dramatic', 'powerful'],
  },

  // Narrative Conscious Hip-Hop - User Custom Style
  narrativeConscious: {
    name: 'Narrative Conscious',
    description: 'Narrative-driven conscious hip-hop with storytelling vocals and minimalist groove',
    genre: 'Hip-Hop',
    subgenre: 'Conscious Hip-Hop',
    bpm: { min: 85, max: 95, target: 90 },
    key: 'D Minor',
    mood: ['reflective', 'hopeful', 'grounded', 'tension', 'narrative'],
    instruments: [
      'warm electric piano',
      'subtle bassline',
      'tight drum kit',
      'atmospheric synth pads',
      'light percussion',
    ],
    vocals: {
      style: 'storytelling-focused, dynamic pacing, conversational delivery',
      effects: ['subtle reverb', 'vocal clarity focus'],
    },
    production: {
      mix: 'clean mix with vocal clarity, minimalist arrangement',
      effects: ['groove-centric beat', 'layered textures', 'reflective tension'],
    },
    sunoPrompt:
      'hip-hop, narrative-driven conscious hip-hop, storytelling-focused vocals with dynamic pacing and conversational delivery, warm electric piano, subtle bassline, tight drum kit, atmospheric synth pads, light percussion, groove-centric beat, layered textures, clean mix with vocal clarity, minimalist arrangement, reflective tension, grounded hope, 90 BPM, D Minor',
    sunoStyleTags: ['conscious hip-hop', 'narrative', 'storytelling', 'minimalist', 'groove', 'reflective', '90 BPM'],
  },
};

/**
 * Theme modifiers that can be applied to any preset
 */
export const THEME_MODIFIERS = {
  political: {
    lyricsHints: ['divided nation', 'common ground', 'beyond party lines', 'we the people'],
    additionalTags: ['political unity', 'healing divide'],
  },
  social: {
    lyricsHints: ['community', 'neighbors', 'stand together', 'one voice'],
    additionalTags: ['social unity', 'community'],
  },
  generational: {
    lyricsHints: ['bridge the gap', 'young and old', 'legacy', 'future generations'],
    additionalTags: ['generational unity', 'legacy'],
  },
  cultural: {
    lyricsHints: ['diverse threads', 'one tapestry', 'many voices', 'shared story'],
    additionalTags: ['cultural unity', 'diversity'],
  },
};

/**
 * Suno Style Preset Generator
 */
class SunoStyleGenerator {
  /**
   * Get a style preset by name
   */
  getPreset(presetName: string): SunoStylePreset | null {
    return UNITY_STYLE_PRESETS[presetName] || null;
  }

  /**
   * Get all available presets
   */
  getAllPresets(): Record<string, SunoStylePreset> {
    return UNITY_STYLE_PRESETS;
  }

  /**
   * Generate a customized Suno music prompt
   */
  generateMusicPrompt(
    presetName: string,
    options: {
      topic?: string;
      theme?: keyof typeof THEME_MODIFIERS;
      customMood?: string[];
      customBpm?: number;
    } = {},
  ): UnityMusicPrompt {
    const preset = this.getPreset(presetName);
    if (!preset) {
      throw new Error(`Unknown style preset: ${presetName}`);
    }

    const { topic, theme, customMood, customBpm } = options;
    const bpm = customBpm || preset.bpm.target;
    const themeModifier = theme ? THEME_MODIFIERS[theme] : null;

    // Build customized prompt
    let customizedPrompt = preset.sunoPrompt;

    if (customBpm) {
      customizedPrompt = customizedPrompt.replace(new RegExp(`${preset.bpm.target} BPM`), `${customBpm} BPM`);
    }

    if (customMood && customMood.length > 0) {
      customizedPrompt += `, ${customMood.join(', ')}`;
    }

    if (topic) {
      customizedPrompt += `, about ${topic}`;
    }

    // Build lyrics prompt
    const lyricsPromptParts = [
      `Write lyrics for a ${preset.name} style song`,
      topic ? `about ${topic}` : '',
      `in ${preset.genre} style`,
      `with ${preset.mood.join(', ')} mood`,
      `targeting ${bpm} BPM`,
    ];

    if (themeModifier) {
      lyricsPromptParts.push(`Include themes like: ${themeModifier.lyricsHints.join(', ')}`);
    }

    const lyricsPrompt = lyricsPromptParts.filter(Boolean).join('. ');

    // Combine tags
    const tags = [...preset.sunoStyleTags, ...(themeModifier?.additionalTags || [])];

    // Build style description
    const styleDescription = `
${preset.name} - ${preset.description}

Genre: ${preset.genre}${preset.subgenre ? ` / ${preset.subgenre}` : ''}
BPM: ${bpm}
Key: ${preset.key}
Mood: ${preset.mood.join(', ')}

Instrumentation:
${preset.instruments.map((i) => `  - ${i}`).join('\n')}

Vocals: ${preset.vocals.style}
${preset.vocals.effects ? `Effects: ${preset.vocals.effects.join(', ')}` : ''}

Production: ${preset.production.mix}
${preset.production.effects.length > 0 ? `Effects: ${preset.production.effects.join(', ')}` : ''}
    `.trim();

    return {
      stylePreset: preset,
      customizedPrompt,
      lyricsPrompt,
      styleDescription,
      tags,
    };
  }

  /**
   * Generate a complete Suno-ready prompt for unity content
   */
  generateUnityTrackPrompt(
    topic: string,
    options: {
      style?: string;
      theme?: keyof typeof THEME_MODIFIERS;
      targetBpm?: number;
      includeRapBattle?: boolean;
    } = {},
  ): {
    sunoStylePrompt: string;
    sunoLyricsPrompt: string;
    styleDescription: string;
    suggestedSections: string[];
    productionNotes: string[];
  } {
    const { style = 'battleUnity', theme = 'political', targetBpm, includeRapBattle = true } = options;

    const musicPrompt = this.generateMusicPrompt(style, {
      topic,
      theme,
      customBpm: targetBpm,
    });

    // Build section structure
    const suggestedSections = includeRapBattle
      ? [
          '[INTRO] - Tension-building instrumental (8 bars)',
          '[VERSE 1 - DIVISION] - Show the conflict, aggressive delivery (16 bars)',
          '[PRE-CHORUS] - Rising tension, hint at hope (4 bars)',
          '[CHORUS] - Unity anthem, big and powerful (8 bars)',
          '[VERSE 2 - AWAKENING] - Shift perspective, see common ground (16 bars)',
          '[BRIDGE] - Emotional moment, key change (8 bars)',
          '[FINAL CHORUS] - Triumphant resolution (8 bars)',
          '[OUTRO] - Fade with hope, instrumental (4 bars)',
        ]
      : [
          '[INTRO] - Set the mood (4 bars)',
          '[VERSE 1] - Establish theme (16 bars)',
          '[CHORUS] - Main message (8 bars)',
          '[VERSE 2] - Deepen theme (16 bars)',
          '[CHORUS] - Repeat with variation (8 bars)',
          '[BRIDGE] - Emotional peak (8 bars)',
          '[OUTRO] - Resolution (4 bars)',
        ];

    // Production notes
    const productionNotes = [
      `Target BPM: ${musicPrompt.stylePreset.bpm.target}`,
      `Key: ${musicPrompt.stylePreset.key}`,
      'Start with tension, build to release',
      'Use dynamics - soft verses, powerful chorus',
      'Include crowd/chant elements for sing-along potential',
      'End on resolution, not conflict',
      'Consider key change for emotional lift in bridge',
    ];

    return {
      sunoStylePrompt: musicPrompt.customizedPrompt,
      sunoLyricsPrompt: musicPrompt.lyricsPrompt,
      styleDescription: musicPrompt.styleDescription,
      suggestedSections,
      productionNotes,
    };
  }

  /**
   * Get recommended preset for a given topic/mood
   */
  recommendPreset(options: {
    isRapBattle?: boolean;
    energy?: 'low' | 'medium' | 'high';
    targetAudience?: 'youth' | 'general' | 'mature';
    platform?: 'tiktok' | 'youtube' | 'spotify';
  }): string {
    const { isRapBattle = true, energy = 'high', targetAudience = 'general', platform } = options;

    if (isRapBattle) {
      return 'battleUnity';
    }

    if (platform === 'tiktok') {
      return energy === 'high' ? 'rally' : 'acoustic';
    }

    if (energy === 'low') {
      return 'healing';
    }

    if (energy === 'high') {
      return targetAudience === 'youth' ? 'rally' : 'inspiration';
    }

    return 'inspiration';
  }
}

export const sunoStyleGenerator = new SunoStyleGenerator();

// ============================================
// DOCUMENTARY SUNO FORMATTING SYSTEM
// ============================================

/**
 * Historical Documentary Style Tags by Culture/Region
 * Maps historical figures to culturally-appropriate music elements
 */
export const CULTURAL_MUSIC_ELEMENTS: Record<
  string,
  {
    instruments: string[];
    vocalStyle: string;
    rhythmElements: string[];
    moodDescriptors: string[];
  }
> = {
  mongolian: {
    instruments: ['morin khuur', 'war drums', 'horsehead fiddle', 'throat singing drone'],
    vocalStyle: 'mongolian throat singing, powerful male vocalist',
    rhythmElements: ['war drums', 'galloping rhythm', 'steppe winds'],
    moodDescriptors: ['epic', 'conquering', 'vast', 'dramatic'],
  },
  chinese: {
    instruments: ['erhu', 'pipa', 'guzheng', 'dizi flute', 'temple bells'],
    vocalStyle: 'operatic male vocals, traditional Chinese inflections',
    rhythmElements: ['gong hits', 'taiko-style drums', 'flowing melodies'],
    moodDescriptors: ['imperial', 'majestic', 'ancient', 'philosophical'],
  },
  roman: {
    instruments: ['brass fanfare', 'war horns', 'lyre', 'timpani'],
    vocalStyle: 'powerful male choir, Latin chants',
    rhythmElements: ['marching drums', 'triumphant brass', 'legionary cadence'],
    moodDescriptors: ['triumphant', 'imperial', 'conquering', 'dramatic'],
  },
  egyptian: {
    instruments: ['sistrum', 'harp', 'oud', 'frame drums'],
    vocalStyle: 'haunting female vocals, ancient prayer style',
    rhythmElements: ['desert percussion', 'hypnotic rhythms', 'Nile flows'],
    moodDescriptors: ['mysterious', 'ancient', 'divine', 'eternal'],
  },
  greek: {
    instruments: ['lyre', 'aulos flute', 'kithara', 'frame drums'],
    vocalStyle: 'theatrical male vocals, epic poem delivery',
    rhythmElements: ['Olympic fanfare', 'heroic cadence', 'tragic swells'],
    moodDescriptors: ['heroic', 'tragic', 'philosophical', 'epic'],
  },
  viking: {
    instruments: ['war horns', 'tagelharpa', 'frame drums', 'kantele'],
    vocalStyle: 'deep chanting, nordic folk vocals',
    rhythmElements: ['thunderous drums', 'ocean rhythms', 'battle cries'],
    moodDescriptors: ['fierce', 'primal', 'seafaring', 'mythic'],
  },
  japanese: {
    instruments: ['taiko drums', 'shakuhachi', 'shamisen', 'koto'],
    vocalStyle: 'dramatic male vocals, theatrical delivery',
    rhythmElements: ['taiko thunder', 'zen silence', 'sakura falling'],
    moodDescriptors: ['honor', 'discipline', 'dramatic', 'spiritual'],
  },
  persian: {
    instruments: ['santur', 'tar', 'daf drum', 'ney flute'],
    vocalStyle: 'soulful male vocals, poetic delivery',
    rhythmElements: ['complex rhythms', 'flowing melodies', 'desert winds'],
    moodDescriptors: ['poetic', 'mystical', 'scholarly', 'dramatic'],
  },
  medieval_european: {
    instruments: ['church organ', 'choir', 'war drums', 'brass fanfare'],
    vocalStyle: 'gregorian chant, cathedral reverb',
    rhythmElements: ['cathedral bells', 'royal trumpets', 'crusader drums'],
    moodDescriptors: ['majestic', 'holy', 'dramatic', 'legendary'],
  },
  african: {
    instruments: ['djembe', 'kora', 'balafon', 'talking drums'],
    vocalStyle: 'call and response, powerful storytelling',
    rhythmElements: ['polyrhythmic drums', 'chanting', 'primal energy'],
    moodDescriptors: ['primal', 'spiritual', 'powerful', 'ancestral'],
  },
  default: {
    instruments: ['orchestral strings', 'epic drums', 'brass section', 'choir'],
    vocalStyle: 'powerful male vocalist, cinematic delivery',
    rhythmElements: ['war drums', 'dramatic swells', 'epic builds'],
    moodDescriptors: ['epic', 'cinematic', 'dramatic', 'powerful'],
  },
};

/**
 * Map historical figures to their cultural music style
 */
export function detectHistoricalCulture(figureName: string, region?: string): string {
  const name = figureName.toLowerCase();
  const reg = (region || '').toLowerCase();

  // Mongolian
  if (
    name.includes('genghis') ||
    name.includes('temüjin') ||
    name.includes('khubilai') ||
    name.includes('kublai') ||
    reg.includes('mongol') ||
    reg.includes('steppe')
  ) {
    return 'mongolian';
  }

  // Chinese
  if (
    name.includes('qin shi') ||
    name.includes('sun tzu') ||
    name.includes('confucius') ||
    name.includes('cao cao') ||
    name.includes('zhuge') ||
    reg.includes('china') ||
    reg.includes('han')
  ) {
    return 'chinese';
  }

  // Roman
  if (
    name.includes('caesar') ||
    name.includes('augustus') ||
    name.includes('nero') ||
    name.includes('marcus aurelius') ||
    name.includes('trajan') ||
    reg.includes('rome') ||
    reg.includes('roman')
  ) {
    return 'roman';
  }

  // Egyptian
  if (
    name.includes('cleopatra') ||
    name.includes('ramses') ||
    name.includes('tutankhamun') ||
    name.includes('nefertiti') ||
    reg.includes('egypt') ||
    reg.includes('pharaoh')
  ) {
    return 'egyptian';
  }

  // Greek
  if (
    name.includes('alexander') ||
    name.includes('leonidas') ||
    name.includes('socrates') ||
    name.includes('aristotle') ||
    name.includes('plato') ||
    reg.includes('greece') ||
    reg.includes('sparta')
  ) {
    return 'greek';
  }

  // Viking/Norse
  if (
    name.includes('ragnar') ||
    name.includes('leif') ||
    name.includes('erik') ||
    name.includes('harald') ||
    reg.includes('viking') ||
    reg.includes('norse') ||
    reg.includes('scandinavia')
  ) {
    return 'viking';
  }

  // Japanese
  if (
    name.includes('musashi') ||
    name.includes('tokugawa') ||
    name.includes('oda nobunaga') ||
    name.includes('shogun') ||
    reg.includes('japan') ||
    reg.includes('samurai')
  ) {
    return 'japanese';
  }

  // Persian
  if (
    name.includes('cyrus') ||
    name.includes('darius') ||
    name.includes('xerxes') ||
    name.includes('rumi') ||
    reg.includes('persia') ||
    reg.includes('iran')
  ) {
    return 'persian';
  }

  // Medieval European
  if (
    name.includes('charlemagne') ||
    name.includes('richard') ||
    name.includes('william') ||
    name.includes('henry') ||
    name.includes('joan') ||
    reg.includes('medieval') ||
    reg.includes('crusade')
  ) {
    return 'medieval_european';
  }

  // African
  if (
    name.includes('mansa musa') ||
    name.includes('shaka') ||
    name.includes('sundiata') ||
    reg.includes('africa') ||
    reg.includes('mali') ||
    reg.includes('zulu')
  ) {
    return 'african';
  }

  return 'default';
}

/**
 * Suno Documentary Formatting Interface
 */
export interface SunoDocumentaryFormat {
  title: string;
  styleTags: string;
  formattedLyrics: string;
  rawLyrics: string;
  makeInstrumental: boolean;
  culturalElements: (typeof CULTURAL_MUSIC_ELEMENTS)[string];
  structureBreakdown: string;
}

/**
 * Deep Research interface (imported concept from unity-content-generator)
 */
interface DeepResearchBasicInfo {
  fullName: string;
  lived: string;
  region: string;
  knownFor: string;
}

interface DocumentaryResearch {
  basicInfo?: DeepResearchBasicInfo;
  culturalContext?: string;
}

/**
 * FORMAT LYRICS FOR SUNO
 * Auto-generates culturally-specific style tags and properly formats lyrics
 *
 * @param lyricsData - The lyrics object with sections and raw text
 * @param research - Deep historical research data (optional)
 * @param figureName - Name of the historical figure for cultural detection
 * @returns Suno-ready formatted package
 */
export function formatForSuno(
  lyricsData: { raw: string; sections?: Record<string, string> },
  research?: DocumentaryResearch | null,
  figureName?: string,
): SunoDocumentaryFormat {
  // Detect cultural style
  const culture = detectHistoricalCulture(
    figureName || research?.basicInfo?.fullName || 'Unknown',
    research?.basicInfo?.region,
  );

  const culturalElements = CULTURAL_MUSIC_ELEMENTS[culture] || CULTURAL_MUSIC_ELEMENTS.default;

  // Generate title
  const title = generateDocumentaryTitle(figureName || research?.basicInfo?.fullName || 'The Legend');

  // Build style tags string (Suno format)
  const styleTags = buildStyleTagsString(culturalElements, research);

  // Format lyrics with proper Suno section markers
  const formattedLyrics = formatLyricsForSuno(lyricsData.raw);

  // Structure breakdown for reference
  const structureBreakdown = generateStructureBreakdown(lyricsData.raw);

  return {
    title,
    styleTags,
    formattedLyrics,
    rawLyrics: lyricsData.raw,
    makeInstrumental: false,
    culturalElements,
    structureBreakdown,
  };
}

/**
 * Generate a documentary-style title
 */
function generateDocumentaryTitle(figureName: string): string {
  const titles = [
    `The ${getEpithet(figureName)}`,
    `${figureName}: A Legacy`,
    `Rise of ${figureName}`,
    `The Legend of ${figureName}`,
  ];

  // For known figures, use specific titles
  const name = figureName.toLowerCase();
  if (name.includes('genghis') || name.includes('temüjin')) {
    return 'The Wolf Khan';
  }
  if (name.includes('alexander')) {
    return "The Conqueror's Dream";
  }
  if (name.includes('cleopatra')) {
    return 'Queen of the Nile';
  }
  if (name.includes('caesar')) {
    return 'The Ides of Glory';
  }

  return titles[0];
}

/**
 * Get epithet for a historical figure
 */
function getEpithet(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('genghis')) return 'Wolf Khan';
  if (lower.includes('alexander')) return 'Great Conqueror';
  if (lower.includes('caesar')) return 'Roman Eagle';
  if (lower.includes('cleopatra')) return 'Last Pharaoh';
  if (lower.includes('leonidas')) return 'Spartan King';
  if (lower.includes('musashi')) return 'Sword Saint';
  return 'Legend';
}

/**
 * Build Suno style tags string from cultural elements
 */
function buildStyleTagsString(
  culturalElements: (typeof CULTURAL_MUSIC_ELEMENTS)[string],
  research?: DocumentaryResearch | null,
): string {
  const parts: string[] = [];

  // Core genre
  parts.push('epic orchestral hip-hop');

  // Cultural vocal style
  parts.push(culturalElements.vocalStyle);

  // Mood descriptors
  parts.push(...culturalElements.moodDescriptors.slice(0, 2));

  // Key instruments (limited to avoid token overload)
  const keyInstruments = culturalElements.instruments.slice(0, 3);
  parts.push(...keyInstruments);

  // Rhythm elements
  parts.push(culturalElements.rhythmElements[0]);

  // Add 'cinematic' for documentary feel
  parts.push('cinematic');

  return parts.join(', ');
}

/**
 * Format raw lyrics for Suno with proper section markers
 * Ensures [Intro], [Verse 1], [Chorus], etc. are properly formatted
 * Converts parentheses to softer/spoken delivery markers
 */
function formatLyricsForSuno(rawLyrics: string): string {
  let formatted = rawLyrics;

  // Ensure section markers are properly formatted
  // Convert variations to standard format
  const sectionMappings: Array<[RegExp, string]> = [
    [/\[intro\]/gi, '[Intro]'],
    [/\[verse\s*1\s*[-–]\s*[^\]]+\]/gi, '[Verse 1]'], // Keep simple
    [/\[verse\s*2\s*[-–]\s*[^\]]+\]/gi, '[Verse 2]'],
    [/\[verse\s*3\s*[-–]\s*[^\]]+\]/gi, '[Verse 3]'],
    [/\[verse\s*4\s*[-–]\s*[^\]]+\]/gi, '[Verse 4]'],
    [/\[verse\s*1\]/gi, '[Verse 1]'],
    [/\[verse\s*2\]/gi, '[Verse 2]'],
    [/\[chorus\]/gi, '[Chorus]'],
    [/\[final\s*chorus\]/gi, '[Final Chorus]'],
    [/\[bridge\]/gi, '[Bridge]'],
    [/\[outro\]/gi, '[Outro]'],
    [/\[end\]/gi, '[End]'],
    [/\[drop\]/gi, '[Drop]'],
    [/\[buildup\]/gi, '[Buildup]'],
  ];

  for (const [pattern, replacement] of sectionMappings) {
    formatted = formatted.replace(pattern, replacement);
  }

  // Ensure [End] is at the end if not present
  if (!formatted.includes('[End]') && !formatted.includes('[end]')) {
    formatted = formatted.trim() + '\n\n[End]';
  }

  return formatted;
}

/**
 * Generate structure breakdown for reference
 */
function generateStructureBreakdown(lyrics: string): string {
  const sections: string[] = [];
  const sectionRegex = /\[([^\]]+)\]/g;
  let match;

  while ((match = sectionRegex.exec(lyrics)) !== null) {
    sections.push(match[1]);
  }

  if (sections.length === 0) {
    return 'No section markers found';
  }

  return sections.map((section, i) => `${i + 1}. [${section}]`).join('\n');
}

/**
 * Generate Suno-ready documentary preset
 */
export function generateDocumentaryPreset(figureName: string, research?: DocumentaryResearch | null): SunoStylePreset {
  const culture = detectHistoricalCulture(figureName, research?.basicInfo?.region);
  const culturalElements = CULTURAL_MUSIC_ELEMENTS[culture] || CULTURAL_MUSIC_ELEMENTS.default;

  return {
    name: `Documentary: ${figureName}`,
    description: `Historical documentary about ${figureName} with culturally authentic sound`,
    genre: 'Epic Orchestral Hip-Hop',
    subgenre: `Historical Documentary (${culture})`,
    bpm: { min: 80, max: 100, target: 90 },
    key: 'D Minor',
    mood: culturalElements.moodDescriptors,
    instruments: culturalElements.instruments,
    vocals: {
      style: culturalElements.vocalStyle,
      effects: ['dramatic reverb', 'cinematic layering'],
    },
    production: {
      mix: 'cinematic, epic, documentary feel',
      effects: ['war drums', 'dramatic builds', 'cultural authenticity'],
    },
    sunoPrompt: buildStyleTagsString(culturalElements, research),
    sunoStyleTags: [
      'epic',
      'orchestral hip-hop',
      'documentary',
      'cinematic',
      culture,
      ...culturalElements.moodDescriptors.slice(0, 2),
    ],
  };
}
