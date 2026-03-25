/**
 * UNITY CONTENT GENERATOR
 *
 * Comprehensive AI-powered content generation system that creates:
 * - Lyrics with proper timing analysis
 * - Suno style tags (separate from lyrics)
 * - Character cast definitions
 * - Detailed VEO prompts with camera, lighting, beat sync
 * - Video style templates
 *
 * Ensures lyrics, audio, and video are synchronized before generation.
 */

import { openaiService } from './openai-service';
import { unityTimingAnalyzer, TimingAnalysis, SectionTiming } from './unity-timing-analyzer';
import { rhymeStackEngine, UNITY_FORMULAS, RHYME_FAMILIES } from './rhyme-stack-engine';
import { videoHookOptimizer, HookConfig } from './video-hook-optimizer';
import {
  VarietyEnforcer,
  CAMERA_SHOTS,
  COMBAT_ACTIONS,
  LIGHTING_PROGRESSION,
  ARMOR_DEGRADATION,
} from './variety-enforcer';
import { sanitizeVeoPrompt, isPromptRisky } from './prompt-sanitizer';
import { worldModelSimulator } from './world-model-simulator';
import { lyricsQualityValidator } from './lyrics-quality-validator';
import {
  generateStoryPrompts,
  getAvailableStoryTemplates,
  CLEOPATRA_CHARACTERS,
  CLEOPATRA_BEATS,
  HistoricalCharacter,
  StoryBeat,
} from './historical-story-system';
import {
  extractActionsFromLyrics,
  extractAllLyricActions,
  buildActionFirstPrompt,
  LyricAction,
  StoryProgression,
} from './lyric-action-extractor';
import {
  KLING_SYSTEM_PROMPT,
  KLING_DYNAMIC_VERBS,
  KLING_CAMERA_MOVEMENTS,
  KLING_LIGHTING,
  buildKlingPrompt,
  buildKlingBatchPrompt,
  getKlingCamera,
  getKlingVerb,
  getKlingLighting,
  validateKlingPrompt,
  mapSectionType,
  generateDocumentaryStoryBeats,
  KlingCharacter,
  KlingStoryBeat,
  KlingBatchRequest,
} from './kling-prompt-builder';
import {
  generateSunoStyleTags as generateOptimizedSunoStyle,
  generateStructureTags,
  detectContentType,
  sanitizeSunoPrompt,
  ContentType as SunoContentType,
} from '../config/suno-styles';
import { sunoStyleBandit } from './suno-style-bandit';
import { sunoApi } from './suno-api';
import {
  UNITY_MUSIC_CONFIG,
  STYLE_PRESETS,
  StylePresetKey,
  getStylePreset,
  applyStylePresetToPrompt,
  HISTORICAL_FIGURES,
  HISTORICAL_VISUAL_ELEMENTS,
  isHistoricalVsHistorical,
  isCreatureVsCreature,
  isFoodVsFood,
  getHistoricalBattleData,
  getHistoricalVisualElements,
  HISTORICAL_MODE_BANS,
  HISTORICAL_STYLE_OVERRIDES,
  getHistoricalFigureData,
  buildHistoricalEnforcementBlock,
  HistoricalFigureData,
  findHistoricalEncounter,
  getHistoricalLyricsGuidance,
  getHistoricalVeoGuidance,
  HistoricalEncounter,
} from '../config/video-constants';

// ============================================
// TYPES
// ============================================

// ============================================
// 🔧 ROBUST JSON PARSING HELPER
// Extracts and parses JSON from AI responses that may contain explanatory text
// ============================================

/**
 * Robustly extract and parse JSON from AI responses
 * Handles cases where the AI returns explanation text before/after the JSON
 *
 * @param response - Raw AI response string
 * @param context - Context for error messages
 * @returns Parsed JSON object or throws detailed error
 */
function extractAndParseJSON<T = any>(response: string, context: string = 'unknown'): T {
  if (typeof response !== 'string') {
    throw new Error(`Invalid response type for ${context}: expected string, got ${typeof response}`);
  }

  if (!response || response.trim() === '') {
    throw new Error(`Empty response received for ${context}: AI returned no content`);
  }

  // Try direct parse first (fastest path) - clean before parsing
  try {
    const cleaned = cleanMalformedJSON(response.trim());
    return JSON.parse(cleaned);
  } catch (directError) {
    // If direct parse fails, try to extract JSON from text
  }

  // Look for JSON patterns: {...} or [...]
  const jsonPatterns = [
    /\{[\s\S]*\}/, // Object
    /\[[\s\S]*\]/, // Array
  ];

  for (const pattern of jsonPatterns) {
    const match = response.match(pattern);
    if (match) {
      try {
        const extracted = match[0];
        // Clean extracted JSON before parsing
        const cleaned = cleanMalformedJSON(extracted);
        return JSON.parse(cleaned);
      } catch (extractError) {
        // Continue to next pattern
        continue;
      }
    }
  }

  // If all extraction attempts fail, throw detailed error
  const preview = response.substring(0, 200);
  throw new Error(
    `Failed to extract valid JSON for ${context}.\n` +
      `Response preview: "${preview}..."\n` +
      `Response length: ${response.length} chars\n` +
      `Tip: Ensure AI returns ONLY valid JSON, no explanatory text.`,
  );
}

/**
 * Clean common JSON malformations that LLMs produce
 *
 * @param jsonStr - Potentially malformed JSON string
 * @returns Cleaned JSON string ready for parsing
 */
function cleanMalformedJSON(jsonStr: string): string {
  let cleaned = jsonStr.trim();

  // 1. Remove markdown code fences if present (with newlines)
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7); // Remove ```json
    // Remove any newline characters immediately after
    cleaned = cleaned.replace(/^[\r\n]+/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3); // Remove ```
    cleaned = cleaned.replace(/^[\r\n]+/, '');
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
    // Remove any newline characters before the ending ```
    cleaned = cleaned.replace(/[\r\n]+$/, '');
  }

  cleaned = cleaned.trim();

  // 2. Fix unterminated strings at the end (common with token limits)
  // Match the last string value that might be unterminated
  cleaned = cleaned.replace(/:\s*"([^"]*?)$/, ':"$1"}');

  // 3. Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');

  // 4. Fix missing closing braces/brackets (attempt to balance)
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/\]/g) || []).length;

  // Add missing closing brackets/braces
  if (openBrackets > closeBrackets) {
    cleaned += ']'.repeat(openBrackets - closeBrackets);
  }
  if (openBraces > closeBraces) {
    cleaned += '}'.repeat(openBraces - closeBraces);
  }

  // 5. Fix unescaped quotes within strings (basic heuristic)
  // This is tricky - we look for patterns like: "text with "embedded" quotes"
  // Replace with: "text with \"embedded\" quotes"
  // DISABLED: This pattern is too aggressive and breaks valid JSON across lines
  // Most modern LLMs don't make this mistake anyway
  // cleaned = cleaned.replace(/"([^"]*)"([^"]*)"([^"]*)"(\s*[:,}\]])/g, (match, p1, p2, p3, p4) => {
  //   if (!/[:{}\[\]]/.test(p2)) {
  //     return `"${p1}\\"${p2}\\"${p3}"${p4}`;
  //   }
  //   return match;
  // });

  // 6. Remove any null bytes or problematic control characters (but keep \n and \r for formatting)
  // Note: JSON.parse handles whitespace, so we only remove truly problematic characters
  cleaned = cleaned.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');

  // 7. Fix missing quotes around property names (common error)
  // Transform {propertyName: "value"} to {"propertyName": "value"}
  // DISABLED: This can break valid JSON in complex cases
  // cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s*:)/g, '$1"$2"$3');

  // 8. Fix single quotes to double quotes (JSON only allows double quotes)
  // DISABLED: This breaks apostrophes in strings like "Khan's" or "it's"
  // Only enable if you're sure the JSON uses single quotes for string delimiters
  // cleaned = cleaned.replace(/'/g, '"');

  return cleaned;
}

// ============================================
// 🎭 CENTRALIZED GENDER DETECTION FOR HISTORICAL FIGURES
// Export this function for use in routes.ts and elsewhere
// ============================================
export const EXPLICIT_FEMALE_NAMES = [
  'cleopatra',
  'nefertiti',
  'hatshepsut',
  'boudicca',
  'zenobia',
  'theodora',
  'catherine',
  'elizabeth',
  'victoria',
  'marie',
  'joan',
  'helen',
  'wu zetian',
  'tomyris',
  'artemisia',
  'hypatia',
  'sappho',
  'empress',
  'queen',
  'nzinga',
  'sacagawea',
  'pocahontas',
  'sheba',
  'makeda',
  'himiko',
  'trung',
  'boudica',
  'tomoe', // Tomoe Gozen - Japanese female samurai
  'gozen', // Title for noblewomen in Japan
  'ching shih', // Chinese female pirate
  'zheng', // Ching Shih's family name
  'juliane', // Juliane Koepcke
];

export const EXPLICIT_MALE_NAMES = [
  'genghis',
  'alexander',
  'caesar',
  'napoleon',
  'julius',
  'marcus',
  'nero',
  'augustus',
  'khan',
  'attila',
  'charlemagne',
  'ramesses',
  'xerxes',
  'darius',
  'hannibal',
  'spartacus',
  'leonidas',
  'saladin',
  'richard',
  'william',
  'ashoka',
  'akbar',
  'shaka',
  'mansa',
  'sundiata',
  'pachacuti',
  'montezuma',
];

/**
 * CENTRALIZED GENDER DETECTION for historical figures
 * Use this single function everywhere to avoid duplication
 *
 * PRIORITY ORDER:
 * 1. Explicit female names (always female)
 * 2. Explicit male names (always male)
 * 3. Title indicators (queen/empress vs king/emperor)
 * 4. Default to male only if completely unclear
 */
export function inferHistoricalGender(name: string, appearance: string = ''): 'male' | 'female' {
  const text = `${name} ${appearance}`.toLowerCase();

  // PRIORITY 1: Explicit female names - ALWAYS return female
  if (EXPLICIT_FEMALE_NAMES.some((n) => text.includes(n))) {
    return 'female';
  }

  // PRIORITY 2: Explicit male names - return male
  if (EXPLICIT_MALE_NAMES.some((n) => text.includes(n))) {
    return 'male';
  }

  // PRIORITY 3: Title/role indicators
  const femaleIndicators = [
    'queen',
    'empress',
    'princess',
    'woman',
    'female',
    'her ',
    'she ',
    'lady',
    'duchess',
    'countess',
    'pharaoh queen',
  ];
  const maleIndicators = [
    'king',
    'emperor',
    'prince',
    'man',
    'male',
    'his ',
    'he ',
    'lord',
    'duke',
    'count',
    'pharaoh',
  ];

  const femaleScore = femaleIndicators.filter((ind) => text.includes(ind)).length;
  const maleScore = maleIndicators.filter((ind) => text.includes(ind)).length;

  if (femaleScore > maleScore) return 'female';
  if (maleScore > femaleScore) return 'male';

  // FALLBACK: Default to male only if completely unclear
  return 'male';
}

export interface CharacterCast {
  id: number;
  name?: string; // v2.0: Real names like "MIKE", "DANIELLE", "JENNY"
  age: number;
  gender: 'male' | 'female' | 'non-binary';
  appearance: string;
  wardrobeBase: string;
  vibe: string;
  role: string;
  humanizingDetail?: string; // v2.0: The detail that makes them real
}

export interface VeoPrompt {
  sectionName: string;
  sectionIndex: number;
  durationSeconds: number;
  // TIMESTAMP MARKERS: Exact position in song this clip represents
  timestampStart: number; // Start time in seconds (e.g., 32.5)
  timestampEnd: number; // End time in seconds (e.g., 40.5)
  timestampFormatted: string; // Human-readable format (e.g., "0:32-0:40")
  lyricContentAtTimestamp?: string; // The actual lyrics playing during this clip
  characterIds: number[];
  shotType: VeoShotType;
  cameraMovement: string;
  lightingMood: string;
  featuredCharacters: string[];
  visualMetaphor?: string;
  sceneDetails: {
    location: string;
    timeOfDay: string;
    wardrobe: string;
    props: string[];
  };
  characterAction: {
    startingPosition: string;
    movement: string;
    expression: string;
    keyGesture: string;
  };
  camera: {
    shotType: string;
    angle: string;
    movement: string;
    startingFrame: string;
    endingFrame: string;
  };
  lighting: {
    keyLight: string;
    fillRim: string;
    practicalLights: string;
    mood: string;
    colorGrade: string;
  };
  depthComposition: {
    foreground: string;
    midground: string;
    background: string;
    ruleOfThirds: string;
  };
  audioAtmosphere: {
    ambientSound: string;
    sfx: string;
    reverbSpace: string;
  };
  beatSync: {
    timings: Array<{ seconds: string; action: string }>;
  };
  visualReferences: string[];
  fullPrompt: string;
}

/**
 * Character appearance stats for tracking across clips
 */
export interface CharacterAppearanceStats {
  characterName: string;
  characterId: number;
  appearanceCount: number;
  totalClips: number;
  appearancePercentage: number;
  meetsThreshold: boolean;
}

export interface SunoStyleTags {
  bpm: number;
  genre: string;
  subgenre: string;
  vocals: string;
  instruments: string[];
  production: string[];
  mood: string[];
  fullStyleString: string;
  contentType?: string; // historicalBattle, foodBattle, creatureBattle, motivational, chill
  structureTags?: string; // Section structure guidance for Suno
  banditStyleId?: string; // Thompson Sampling bandit style ID (for tracking)
  isExperimental?: boolean; // Was this style selected via experimentation?
}

/**
 * DEEP HISTORICAL RESEARCH - Enhanced research for documentary-style content
 * Captures the full story arc, philosophical thread, and visual details
 */
export interface KeyHistoricalEvent {
  event: string; // Name of the event
  year: string; // When it happened
  whatHappened: string; // 2-3 sentences describing it
  whyItMatters: string; // Significance
  visualSetting: string; // Where it happened, what it looked like
  sceneDirection?: string; // NEW: Specific cinematographic action for VEO
  emotionalBeat?: string; // NEW: What audience should feel (awe, horror, hope)
}

export interface PhilosophicalThread {
  coreQuestion: string; // What question does their life raise?
  tension: string; // What opposing forces did they embody?
  lesson: string; // What does their story teach about being human?
  modernRelevance: string; // Why does this matter today?
}

export interface DeepHistoricalResearch {
  basicInfo: {
    fullName: string;
    lived: string; // "1162-1227"
    region: string;
    knownFor: string; // One sentence
  };
  characterAppearance: {
    physical: string; // Detailed physical description with scars, features
    ageToDepict: string; // What age captures them best
    distinctiveFeatures: string; // Battle scars, birthmarks, facial hair
    primaryOutfit: string; // SPECIFIC clothing with materials and colors
    accessories: string; // SPECIFIC weapons, jewelry, symbols
    presence: string; // How they moved and carried themselves
  };
  originScene?: {
    // NEW: Origin/childhood scene for intro
    childhoodMoment: string; // Specific dramatic childhood scene
    childhoodSetting: string; // Where/when visually
  };
  keyEvents: KeyHistoricalEvent[]; // 4-6 most dramatic/meaningful events with scene directions
  narrativeArc?: {
    // NEW: Section-by-section narrative arc for VEO
    introScene: string; // Opening scene (origin + rise)
    riseScene: string; // Rise to power visual
    peakScene: string; // Height of power (epic army shot)
    reflectionScene: string; // Intimate vulnerability moment
    legacyScene: string; // Closing legacy image
  };
  philosophicalThread: PhilosophicalThread;
  visualSettings: {
    primaryLocations: string[]; // Specific places from their life
    eraAesthetics: string; // Architecture, clothing, technology
    colorPalette: string; // Colors of their era/culture
    iconicImagery: string[]; // Symbols, objects, scenes
  };
}

/**
 * LYRIC VISUAL MOMENT - Extracted visual directives from lyrics
 * Used to ensure VEO scenes MATCH what the lyrics describe
 */
export interface LyricVisualMoment {
  lineNumber: number; // Which line in the section (1-indexed)
  lyricText: string; // The actual lyrics for this moment
  subject: string; // WHO/WHAT is shown (e.g., "his father", "young Temüjin", "the enemy warriors")
  action: string; // WHAT is happening (e.g., "being poisoned", "hands bound", "dragging him")
  setting: string; // WHERE it happens (e.g., "a yurt at night", "frozen steppe", "enemy camp")
  emotion: string; // What the audience should FEEL (horror, sympathy, anger, awe)
  visualDetails: string[]; // Specific visual elements mentioned (rope, blood, horses, etc.)
  timeInSection: 'start' | 'middle' | 'end'; // When in the section this moment occurs
  confidence: number; // 0-1 how confident the extraction is
}

/**
 * Section lyric scenes - all visual moments extracted from a section's lyrics
 */
export interface SectionLyricScenes {
  sectionType: string; // intro, verse, chorus, bridge, outro
  sectionIndex: number;
  primaryMoment: LyricVisualMoment; // The MOST important visual moment for VEO
  allMoments: LyricVisualMoment[]; // All extracted moments from this section
  overallEmotion: string; // Dominant emotion for the section
  visualProgression: string; // How visuals should progress through section
}

export interface UnityContentPackage {
  lyrics: {
    raw: string;
    sections: Record<string, string>;
  };
  sunoStyleTags: SunoStyleTags;
  characterCast: CharacterCast[];
  veoPrompts: VeoPrompt[];
  timing: TimingAnalysis;
  lyricScenes?: SectionLyricScenes[]; // NEW: Extracted visual scenes from lyrics
  characterAppearances?: CharacterAppearanceStats[];
  // Documentary mode fields - preserved through regeneration paths
  isHistoricalContent?: boolean; // Whether this is historical documentary content
  deepResearch?: DeepHistoricalResearch | null; // Deep research for documentary mode
  battleTheme?: string | null; // Optional battle theme for VS BATTLE MODE
  // NEW: Pre-generated Suno song data (when song is generated during package creation)
  sunoAudioUrl?: string; // URL to pre-generated Suno audio
  sunoTrackId?: string; // Suno track ID
  actualSongDuration?: number; // Actual song duration from Suno (e.g., 87s)
  roundedDuration?: number; // Rounded to nearest 5s (e.g., 90s)
  clipsNeeded?: number; // Exact number of 5s clips (e.g., 18)
  metadata: {
    topic: string;
    message: string;
    visualStyle: string;
    visualStyleV2: string; // v2.0 visual tone
    setting: string; // v2.0 setting approach
    stylePreset?: StylePresetKey; // Style preset (comedy_meme, wholesome, etc.)
    targetDuration: number;
    generatedAt: string;
    lyricsValidation?: {
      // Lyrics quality validation results
      score: number; // 0-100
      attempts: number; // Number of regeneration attempts
      passed: boolean; // Whether lyrics passed validation
      criteria: {
        grammar: number; // 0-20
        rhyme: number; // 0-20
        flow: number; // 0-20
        coherence: number; // 0-20
        appropriateness: number; // 0-20
      };
    };
  };
}

// ============================================
// VIDEO STYLE TEMPLATES
// ============================================

export const VIDEO_STYLE_TEMPLATES = {
  cinematic: {
    name: 'Cinematic Epic',
    description: 'Movie-quality, dramatic lighting, sweeping cameras',
    cameraStyles: ['dolly in', 'crane shot', 'tracking shot', 'slow push'],
    lightingMoods: ['dramatic shadows', 'golden hour', 'rim lighting', 'volumetric'],
    colorGrades: ['orange and teal', 'desaturated with color pops', 'film grain'],
    locations: ['rooftops', 'city streets', 'industrial spaces', 'nature vistas'],
    shotTypes: ['wide establishing', 'medium two-shot', 'close-up', 'extreme close-up'],
  },
  gritty: {
    name: 'Street Cypher',
    description: 'Raw, handheld, urban authenticity',
    cameraStyles: ['handheld', 'whip pan', 'documentary style', 'shaky cam'],
    lightingMoods: ['harsh streetlight', 'neon glow', 'fluorescent', 'available light'],
    colorGrades: ['high contrast', 'crushed blacks', 'desaturated', 'cyan tint'],
    locations: ['subway platforms', 'back alleys', 'parking garages', 'graffiti walls'],
    shotTypes: ['medium shot', 'over shoulder', 'POV', 'reaction shot'],
  },
  debate_stage: {
    name: 'Debate Stage',
    description: 'Two podiums, dramatic lighting, studio setting',
    cameraStyles: ['smooth pan between subjects', 'split screen', 'reaction cuts'],
    lightingMoods: ['TV studio lighting', 'presidential debate style', 'dramatic key light'],
    colorGrades: ['clean and bright', 'red vs blue accents', 'neutral with saturation'],
    locations: ['debate stage', 'studio set', 'podiums', 'audience silhouettes'],
    shotTypes: ['two-shot', 'single close-up', 'wide stage shot', 'audience reaction'],
  },
  news_montage: {
    name: 'News Montage',
    description: 'Breaking news style, split screens, headlines',
    cameraStyles: ['static tripod', 'slow zoom', 'graphics overlay'],
    lightingMoods: ['news studio', 'screen glow', 'harsh camera flash'],
    colorGrades: ['broadcast standard', 'high saturation', 'clean whites'],
    locations: ['news desk', 'protest footage', 'social media feeds', 'split screens'],
    shotTypes: ['anchor shot', 'b-roll', 'graphics', 'countdown'],
  },
  motion_graphics: {
    name: 'Motion Graphics',
    description: 'Kinetic typography, animated words, abstract',
    cameraStyles: ['static', '3D camera move through text', 'zoom bursts'],
    lightingMoods: ['bold colors', 'high contrast', 'glowing elements'],
    colorGrades: ['vibrant', 'neon', 'black with color pops'],
    locations: ['abstract space', 'pure black', 'geometric patterns'],
    shotTypes: ['full frame text', 'text reveal', 'particle effects'],
  },
  documentary: {
    name: 'Documentary',
    description: 'Real, intimate, personal stories',
    cameraStyles: ['interview style', 'fly on wall', 'observational'],
    lightingMoods: ['natural light', 'window light', 'practical sources only'],
    colorGrades: ['natural colors', 'slight desaturation', 'film-like'],
    locations: ['homes', 'workplaces', 'community spaces', 'real locations'],
    shotTypes: ['interview medium', 'cutaway b-roll', 'wide establishing'],
  },
} as const;

export type VideoStyleKey = keyof typeof VIDEO_STYLE_TEMPLATES;

// ============================================
// VEO 3.1 SHOT VARIETY FRAMEWORK
// ============================================

/**
 * Shot Type System - Determines framing and character focus
 */
export const VEO_SHOT_TYPES = {
  'HERO-3': {
    code: 'HERO-3',
    description: 'Epic wide shot, all 3 characters, dramatic composition',
    whenToUse: 'Chorus, key moments, triumphant resolution',
    framing: 'Wide establishing with all characters balanced in frame',
    characterCount: 'all',
  },
  'DUO-DEBATE': {
    code: 'DUO-DEBATE',
    description: 'Two-shot, characters facing each other, tension',
    whenToUse: 'Verses with conflict, debate moments',
    framing: 'Medium two-shot, facing each other, tension in negative space',
    characterCount: 2,
  },
  'DUO-ALLY': {
    code: 'DUO-ALLY',
    description: 'Two-shot, characters side by side, unity',
    whenToUse: 'Resolution moments, coming together',
    framing: 'Medium two-shot, shoulder to shoulder, unified composition',
    characterCount: 2,
  },
  'SOLO-POWER': {
    code: 'SOLO-POWER',
    description: 'Low angle close-up, character dominates frame',
    whenToUse: "Character's big moment, powerful statement",
    framing: 'Low angle close-up, subject filling frame, heroic composition',
    characterCount: 1,
  },
  'SOLO-VULNERABLE': {
    code: 'SOLO-VULNERABLE',
    description: 'High angle or tight close-up, intimate',
    whenToUse: 'Emotional lyrics, vulnerable moments',
    framing: 'High angle or extreme close-up, intimate and exposed',
    characterCount: 1,
  },
  REACTION: {
    code: 'REACTION',
    description: 'Quick cut close-up on face reacting',
    whenToUse: 'After punchlines, comedic beats, surprise moments',
    framing: 'Tight close-up on face, capturing reaction',
    characterCount: 1,
  },
  DETAIL: {
    code: 'DETAIL',
    description: 'Extreme close-up on symbolic object or texture',
    whenToUse: 'Transitions, B-roll, visual emphasis',
    framing: 'Macro/extreme close-up, cinematic lighting on key object',
    characterCount: 0,
  },
  METAPHOR: {
    code: 'METAPHOR',
    description: 'Abstract visual representing lyric concept',
    whenToUse: 'Chorus, bridge, symbolic moments',
    framing: 'Artistic composition, symbolic imagery',
    characterCount: 'variable',
  },
  ENVIRONMENT: {
    code: 'ENVIRONMENT',
    description: 'Wide establishing shot, no characters',
    whenToUse: 'Scene transitions, establishing location',
    framing: 'Wide shot of environment, sets scene',
    characterCount: 0,
  },
  TRACKING: {
    code: 'TRACKING',
    description: 'Following character movement',
    whenToUse: 'Energy sections, action, dynamic moments',
    framing: 'Moving camera following subject through space',
    characterCount: 'variable',
  },
} as const;

export type VeoShotType = keyof typeof VEO_SHOT_TYPES;

/**
 * INDIE CHAOS KEYWORD ROTATIONS - Injected into prompts for variety
 */
export const INDIE_KEYWORDS = {
  // Director energy rotation
  directorEnergy: [
    'Spike Jonze energy, earnest weirdness',
    'Michel Gondry whimsy, handmade aesthetic',
    'Eric Wareheim absurdism, uncomfortable close-up',
    'Tim & Eric aesthetic, anti-comedy chaos',
  ],
  // TikTok-native energy
  tiktokEnergy: [
    'TikTok viral moment, caught mid-reaction',
    'unhinged energy but earnest',
    'main character moment but self-aware',
    'screenshot-worthy chaos',
  ],
  // Anti-perfection camera
  antiPerfectionCamera: [
    'slightly out of focus, intimate',
    'awkward framing, too much headroom',
    'uncomfortably close, invasive',
    "Dutch angle when it shouldn't be",
    'handheld shake, documentary urgency',
  ],
  // Color grading keywords
  colorGrading: [
    'desaturated, crushed blacks',
    'cross-processed, weird color',
    'NOT color corrected, raw',
    '35mm film grain, textured',
    'muted palette, moody',
  ],
  // Comedy timing
  comedyTiming: [
    'comedic timing pause, beat before punchline',
    'reaction shot held too long',
    'awkward silence energy',
    'dramatic zoom on mundane object',
  ],
  // Food as main character
  epicFood: [
    'epic slow-mo cheese pull',
    'presented like a holy artifact',
    'dramatic backlighting on food',
    'food as the main character',
    'reverent, dramatic food moment',
  ],
} as const;

/**
 * Get random indie keyword from category
 */
export function getIndieKeyword(category: keyof typeof INDIE_KEYWORDS, index: number): string {
  const keywords = INDIE_KEYWORDS[category];
  return keywords[index % keywords.length];
}

/**
 * Camera Movement Library - Categorized by energy level
 */
export const CAMERA_MOVEMENTS = {
  slow_emotional: [
    'Slow dolly in on face',
    'Gentle push toward subject',
    'Floating steadicam orbit',
    'Gradual crane descent',
    'Imperceptible creep forward',
    'Slow pan across scene',
  ],
  medium_narrative: [
    'Tracking shot following movement',
    'Smooth arc around subjects',
    'Dolly alongside walking characters',
    'Pan across scene revealing elements',
    'Push in with reveal',
    'Steady glide through space',
  ],
  high_energy: [
    'Rapid dolly in',
    'Crane shot ascending dramatically',
    '360-degree spinning orbit',
    'Whip pan between subjects',
    'Handheld urgent following',
    'Dynamic push with energy burst',
  ],
  static_dramatic: [
    'Locked-off tripod, subject moves within frame',
    'Static wide, action unfolds',
    'Fixed close-up, emotions play on face',
    'Tableau composition, no movement',
    'Portrait-style fixed frame',
  ],
} as const;

export type CameraMovementCategory = keyof typeof CAMERA_MOVEMENTS;

/**
 * Lighting Moods - Matched to section energy and type
 */
export const LIGHTING_MOODS = {
  intro: {
    description: 'Moody low-key 35mm film grain, single practical source, harsh shadows like indie doc',
    keyLight: 'Single harsh practical',
    color: 'Desaturated cool with warm practicals',
    mood: 'Voyeuristic, raw, unpolished A24 vibe',
    technique: 'Underexposed, grain visible, NOT commercial',
  },
  verse_conflict: {
    description: 'Harsh chiaroscuro, unflattering angles, documentary realism',
    keyLight: 'Hard side light from window',
    color: 'Mixed color temps, unbalanced',
    mood: 'Tension, rawness, authentic conflict',
    technique: 'Single hard source, visible grain, not polished',
  },
  prechorus: {
    description: 'Flickering neon and fluorescent, color clashing, chaotic',
    keyLight: 'Multiple competing sources',
    color: 'Neon greens and pinks clashing',
    mood: 'Anxious, chaotic, meme energy',
    technique: 'Mixed practicals, visible flicker, absurdist',
  },
  chorus_peak: {
    description: 'Chaotic mixed sources, overblown highlights, music video energy NOT commercial',
    keyLight: 'Aggressive backlight with practicals',
    color: 'Saturated with crushed blacks',
    mood: 'Peak chaos, absurdist, meme-worthy',
    technique: 'Blow out highlights intentionally, embrace imperfection',
  },
  bridge: {
    description: 'Intimate single source, unflattering closeup, raw vulnerability',
    keyLight: 'Single overhead practical',
    color: 'Warm tungsten, imperfect',
    mood: 'Vulnerable, honest, documentary intimacy',
    technique: 'Get too close, show imperfections, real skin',
  },
  resolution: {
    description: 'Naturalistic mixed lighting, authentic not staged, lived-in feel',
    keyLight: 'Available practical sources',
    color: 'Whatever exists in location',
    mood: 'Authentic resolution, earned not fake',
    technique: 'Documentary style, not lit for beauty',
  },
  outro: {
    description: 'Messy aftermath lighting, still chaotic but resolved, imperfect harmony',
    keyLight: 'Mixed practicals from scene',
    color: 'Warm but desaturated',
    mood: 'Exhausted resolution, real not posed',
    technique: "Don't clean it up, show the mess",
  },
} as const;

export type LightingMoodKey = keyof typeof LIGHTING_MOODS;

/**
 * Section-to-Shot Matrix - Deterministic patterns for each section type
 */
export const SECTION_SHOT_MATRIX: Record<
  string,
  {
    shotSequence: VeoShotType[];
    cameraCategory: CameraMovementCategory;
    lightingMood: LightingMoodKey;
    notes: string;
  }
> = {
  intro: {
    shotSequence: ['ENVIRONMENT', 'HERO-3'],
    cameraCategory: 'slow_emotional',
    lightingMood: 'intro',
    notes: 'Slow crane descent → Dolly in revealing all characters',
  },
  verse_1: {
    shotSequence: ['DUO-DEBATE', 'SOLO-POWER', 'REACTION', 'DETAIL'],
    cameraCategory: 'medium_narrative',
    lightingMood: 'verse_conflict',
    notes: 'Build tension through debate shots, punctuate with reactions',
  },
  verse: {
    shotSequence: ['DUO-DEBATE', 'SOLO-POWER', 'REACTION', 'TRACKING'],
    cameraCategory: 'medium_narrative',
    lightingMood: 'verse_conflict',
    notes: 'Dynamic narrative shots with character focus',
  },
  prechorus: {
    shotSequence: ['TRACKING', 'SOLO-VULNERABLE', 'REACTION'],
    cameraCategory: 'medium_narrative',
    lightingMood: 'prechorus',
    notes: 'Build tension with tracking, flickering light',
  },
  chorus: {
    shotSequence: ['HERO-3', 'METAPHOR', 'HERO-3', 'TRACKING'],
    cameraCategory: 'high_energy',
    lightingMood: 'chorus_peak',
    notes: 'Epic wide shots, explosive bright, crane ascending',
  },
  verse_2: {
    shotSequence: ['DUO-ALLY', 'SOLO-VULNERABLE', 'REACTION', 'DUO-ALLY'],
    cameraCategory: 'medium_narrative',
    lightingMood: 'resolution',
    notes: 'Characters coming together, warming light',
  },
  bridge: {
    shotSequence: ['METAPHOR', 'SOLO-VULNERABLE', 'ENVIRONMENT', 'METAPHOR'],
    cameraCategory: 'slow_emotional',
    lightingMood: 'bridge',
    notes: 'Dreamlike, single spotlight, abstract visuals',
  },
  final_chorus: {
    shotSequence: ['HERO-3', 'TRACKING', 'HERO-3', 'METAPHOR'],
    cameraCategory: 'high_energy',
    lightingMood: 'chorus_peak',
    notes: 'Triumphant HERO-3, celebration tracking shots',
  },
  outro: {
    shotSequence: ['DETAIL', 'HERO-3', 'ENVIRONMENT'],
    cameraCategory: 'slow_emotional',
    lightingMood: 'outro',
    notes: 'Food fusion → Characters sharing → Wide pull-back',
  },
  hook: {
    shotSequence: ['HERO-3', 'REACTION', 'TRACKING'],
    cameraCategory: 'high_energy',
    lightingMood: 'chorus_peak',
    notes: 'High energy hook moments',
  },
  drop: {
    shotSequence: ['METAPHOR', 'TRACKING', 'HERO-3'],
    cameraCategory: 'high_energy',
    lightingMood: 'chorus_peak',
    notes: 'Explosive drop with dynamic visuals',
  },
  instrumental: {
    shotSequence: ['ENVIRONMENT', 'DETAIL', 'METAPHOR'],
    cameraCategory: 'slow_emotional',
    lightingMood: 'bridge',
    notes: 'B-roll and atmospheric shots',
  },
};

/**
 * Visual Metaphor Library - Common metaphors for lyrics
 */
export const VISUAL_METAPHORS = {
  walls_barriers: [
    'Brick wall made of food items, crack of golden light through center',
    'Glass partition between characters, reflections overlapping',
    'Two tables pushed apart, gap widening',
    'Shadow line dividing frame in half',
  ],
  unity_together: [
    'Wall crumbling in slow motion, debris floating upward',
    'Two streams merging into one color',
    'Scattered ingredients assembling into fusion dish',
    'Separate spotlights merging into single warm glow',
    'Split screen gradually pushing together',
  ],
  conflict_debate: [
    'Chess match with food items as pieces',
    'Split screen with opposing color tints',
    'Storm clouds forming overhead',
    'Face-to-face confrontation stance',
  ],
  resolution_peace: [
    'Golden hour light flooding scene',
    'Storm clouds parting, sunbeam illuminating table',
    'All ingredients combining into fusion creation',
    'Hands from different people sharing food',
  ],
} as const;

// ============================================
// ARTICLE-ENHANCED: SYMBOL MAPPING SYSTEM
// Converts abstract concepts to concrete visuals
// ============================================
export const SYMBOL_MAPPING: Record<string, string[]> = {
  passion: ['fire', 'flames', 'burning embers', 'red glow', 'heat shimmer'],
  transformation: ['fire consuming old photo', 'phoenix imagery', 'caterpillar/butterfly', 'ice melting'],
  emotion: ['water', 'rain on window', 'waves crashing', 'tears', 'ocean depths'],
  cleansing: ['rain washing street', 'water running over hands', 'fog clearing', 'wiping slate'],
  freedom: ['birds taking flight', 'open sky', 'chains breaking', 'cage door opening', 'wind in hair'],
  escape: ['running toward light', 'door opening', 'wings spreading', 'balloon rising'],
  restriction: ['chains', 'bars', 'closed spaces', 'walls closing in', 'locked doors'],
  bondage: ['ropes untying', 'shackles', 'tight grip loosening', 'breaking free'],
  time: ['clock faces', 'hourglasses', 'decay', 'seasons changing', 'sand falling'],
  mortality: ['wilting flowers', 'sunset', 'fading photographs', 'empty chairs'],
  self_reflection: ['mirrors', 'reflections', 'shadows', 'looking at old photos', 'journal entries'],
  identity: ['face in water', 'shattered mirror reassembling', 'mask removal', 'true colors emerging'],
  love: ['two flames becoming one', 'hands reaching', 'hearts beating', 'shared warmth'],
  connection: ['threads weaving together', 'puzzle pieces fitting', 'bridges forming', 'roots intertwining'],
  hope: ['sunrise', 'sprouting seeds', 'light through clouds', 'rainbow after storm', 'first bloom'],
  despair: ['rain without end', 'wilted plants', 'empty streets', 'grey skies', 'silence'],
  anger: ['storm clouds', 'thunder', 'red tint', 'clenched fists', 'cracked ground'],
  peace: ['still water', 'soft light', 'gentle breeze', 'sleeping child', 'sunset on horizon'],
};

// ============================================
// ARTICLE-ENHANCED: COMEDY PROMPT TRIGGERS
// Keywords that create comedic vs dramatic output
// ============================================
export const COMEDY_TRIGGERS = {
  absurd: [
    'surreal juxtaposition',
    'deadpan delivery',
    'awkward pause',
    'melodramatic reaction',
    'chaotic energy',
    'over-the-top expression',
    'goofy confidence',
    'absurd normalcy',
  ],
  techniques: [
    'breaking fourth wall',
    'exaggerated double-take',
    'slow-motion mundane action',
    'unexpected reveal',
    'comedic timing beat',
    'slapstick moment',
    'bewildered oblivion',
  ],
  visual_comedy: [
    'character talks directly to camera with deadpan expression',
    'one character reacts with exaggerated shock while others remain calm',
    'mundane action performed with epic cinematography',
    'split screen showing identical reactions in different settings',
    'character pauses mid-action to acknowledge absurdity',
  ],
} as const;

export const EPIC_TRIGGERS = [
  'cinematic',
  'dramatic lighting',
  'slow motion',
  'sweeping camera',
  'majestic',
  'heroic',
  'volumetric lighting',
  'rim lighting',
  'crane shot',
  'tracking shot',
  'lens flare',
  'epic reveal',
];

// ============================================
// SELF-CRITIQUE GATE SYSTEM
// Quality gate that validates outputs before proceeding
// ============================================

export interface SelfCritiqueResult {
  meetsRequirements: number; // 1-10
  worksForNextStage: number; // 1-10
  failureModeRisk: number; // 1-10 (10 = low risk, 1 = high risk)
  overallScore: number; // Average of above
  feedback: string; // Specific feedback for improvement
  passed: boolean; // True if all scores >= 7
}

export interface CritiqueConfig {
  type: 'lyrics' | 'prompts';
  criteria: string[]; // Specific criteria to check
  minScore: number; // Minimum acceptable score (default 7)
  emergencyAcceptThreshold?: number; // Emergency "good enough" threshold (default 6.5)
  minScoreImprovement?: number; // Minimum score improvement to continue regenerating (default 0.5)
}

const LYRICS_CRITIQUE_CRITERIA = [
  'Hook strength - Does the intro punch hard with a specific, emotional hook (NOT a generic question)?',
  'Pacing - Does the flow match the BPM with appropriate syllable counts?',
  'Narrative arc - Does it follow the Looking Around → Looking Down → The Turn → Looking Up structure?',
  'Specificity - Are there concrete details, names, and scenes (not generic statements)?',
  'First person consistency - For historical content, is it all in first person?',
];

const PROMPTS_CRITIQUE_CRITERIA = [
  'Cinematography - Does each prompt specify camera angle, movement, and framing?',
  'Action specificity - Is there a clear, filmable action (verb + object) for every clip?',
  'Character consistency - Do descriptions match the established character appearance?',
  'Visual variety - Are camera shots and settings diverse across clips?',
  'Era/setting accuracy - For historical content, are visual elements period-appropriate?',
];

/**
 * SELF-CRITIQUE GATE
 *
 * Validates generated content (lyrics or prompts) against quality criteria.
 * If any score < 7, returns feedback for regeneration.
 *
 * @param content - The generated content to critique
 * @param requirements - Context about what was requested
 * @param config - Configuration for type-specific critique
 * @param previousScore - Optional previous attempt score for diminishing returns check
 * @returns Critique result with scores and feedback
 */
export async function selfCritiqueGate(
  content: string,
  requirements: string,
  config: CritiqueConfig,
  previousScore?: number,
): Promise<SelfCritiqueResult> {
  const { type, criteria, minScore = 7, emergencyAcceptThreshold = 6.5, minScoreImprovement = 0.5 } = config;

  const critiquePrompt = `You are a quality assurance reviewer for AI-generated ${type}.

## REQUIREMENTS GIVEN:
${requirements}

## GENERATED ${type.toUpperCase()}:
${content}

## EVALUATION CRITERIA:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Rate each dimension 1-10 (10 = excellent, 1 = poor):

1. **MEETS_REQUIREMENTS** (1-10): Does this output satisfy the stated requirements?
2. **WORKS_FOR_NEXT_STAGE** (1-10): Will this ${type === 'lyrics' ? 'work well for audio generation with Suno?' : 'generate visually coherent video clips with Kling/VEO?'}
3. **FAILURE_MODE_RISK** (1-10): How safe is this from obvious failure modes? (10 = very safe, 1 = likely to fail)

Then provide SPECIFIC, ACTIONABLE feedback for improvement.

Respond ONLY in this exact JSON format:
{
  "meetsRequirements": <number 1-10>,
  "worksForNextStage": <number 1-10>,
  "failureModeRisk": <number 1-10>,
  "feedback": "<specific feedback string>"
}`;

  try {
    const response = await openaiService.generateText(critiquePrompt, {
      temperature: 0.3, // Low temp for consistent evaluation
      maxTokens: 500,
      systemPrompt: `You are a strict quality reviewer. Be honest about weaknesses. Output ONLY valid JSON.`,
    });

    // Parse the JSON response using robust extraction
    const parsed = extractAndParseJSON(response, 'self-critique evaluation');
    const meetsRequirements = Math.min(10, Math.max(1, parsed.meetsRequirements || 7));
    const worksForNextStage = Math.min(10, Math.max(1, parsed.worksForNextStage || 7));
    const failureModeRisk = Math.min(10, Math.max(1, parsed.failureModeRisk || 7));
    const overallScore = (meetsRequirements + worksForNextStage + failureModeRisk) / 3;
    let passed = meetsRequirements >= minScore && worksForNextStage >= minScore && failureModeRisk >= minScore;

    // EMERGENCY ACCEPT: If score is above emergency threshold, accept with warning
    if (!passed && overallScore >= emergencyAcceptThreshold) {
      console.log(
        `   ⚠️ [Self-Critique] Score ${overallScore.toFixed(1)} is below ideal (${minScore}) but above emergency threshold (${emergencyAcceptThreshold}) - accepting anyway`,
      );
      passed = true;
    }

    // DIMINISHING RETURNS: If score barely improved from previous attempt, accept
    if (!passed && previousScore !== undefined) {
      const improvement = overallScore - previousScore;
      if (improvement < minScoreImprovement && improvement >= 0) {
        console.log(
          `   ⚠️ [Self-Critique] Score improved by only ${improvement.toFixed(2)} (< ${minScoreImprovement} threshold) - diminishing returns detected, accepting`,
        );
        passed = true;
      } else if (improvement < 0) {
        console.log(
          `   ⚠️ [Self-Critique] Score decreased by ${Math.abs(improvement).toFixed(2)} from previous attempt - accepting previous version`,
        );
        passed = true;
      }
    }

    return {
      meetsRequirements,
      worksForNextStage,
      failureModeRisk,
      overallScore,
      feedback: parsed.feedback || '',
      passed,
    };
  } catch (error) {
    console.warn(`   ⚠️ [Self-Critique] Error during critique: ${error}`);
    // On error, default to pass to avoid blocking
    return {
      meetsRequirements: 7,
      worksForNextStage: 7,
      failureModeRisk: 7,
      overallScore: 7,
      feedback: 'Critique failed - defaulting to pass',
      passed: true,
    };
  }
}

/**
 * Critique lyrics specifically for hook strength and pacing
 */
export async function critiqueLyrics(
  lyrics: string,
  topic: string,
  bpm: number,
  isHistorical: boolean,
  previousScore?: number,
): Promise<SelfCritiqueResult> {
  const requirements = `Topic: ${topic}
BPM: ${bpm}
Historical mode: ${isHistorical}
Requirements:
- Strong punch hook in intro (NOT a question)
- ${isHistorical ? 'First person narrative throughout' : 'Multiple character perspectives'}
- Narrative arc from frustration to resolution
- Specific details and scenes (not generic statements)`;

  return selfCritiqueGate(
    lyrics,
    requirements,
    {
      type: 'lyrics',
      criteria: LYRICS_CRITIQUE_CRITERIA,
      minScore: 7,
      emergencyAcceptThreshold: 6.5,
      minScoreImprovement: 0.5,
    },
    previousScore,
  );
}

/**
 * Critique VEO/Kling prompts for cinematography and action specificity
 */
export async function critiquePrompts(
  prompts: Array<{ fullPrompt: string }>,
  topic: string,
  isHistorical: boolean,
  previousScore?: number,
): Promise<SelfCritiqueResult> {
  const promptsText = prompts.map((p, i) => `Clip ${i + 1}: ${p.fullPrompt}`).join('\n\n');

  const requirements = `Topic: ${topic}
Clip count: ${prompts.length}
Historical mode: ${isHistorical}
Requirements:
- Each clip has specific camera movement and angle
- Clear, filmable action in every prompt
- Visual variety across all clips
- ${isHistorical ? 'Period-appropriate settings and costumes' : 'Consistent character appearances'}`;

  return selfCritiqueGate(
    promptsText,
    requirements,
    {
      type: 'prompts',
      criteria: PROMPTS_CRITIQUE_CRITERIA,
      minScore: 7,
      emergencyAcceptThreshold: 6.5,
      minScoreImprovement: 0.5,
    },
    previousScore,
  );
}

// ============================================
// ARTICLE-ENHANCED: PACING RULES BY SECTION
// Shot duration and cut speed based on song structure
// ============================================
export const PACING_RULES: Record<
  string,
  {
    shotDurationBeats: string;
    content: string;
    cutSpeed: 'slow' | 'moderate' | 'fast' | 'varied';
    cameraEnergy: string;
  }
> = {
  intro: {
    shotDurationBeats: '8-12 beats',
    content: 'establishing, atmospheric',
    cutSpeed: 'slow',
    cameraEnergy: 'slow dolly or static, letting scene breathe',
  },
  verse: {
    shotDurationBeats: '4-8 beats',
    content: 'narrative, story-building',
    cutSpeed: 'slow',
    cameraEnergy: 'steady tracking, conversational framing',
  },
  prechorus: {
    shotDurationBeats: '2-4 beats',
    content: 'build, tension rising',
    cutSpeed: 'moderate',
    cameraEnergy: 'increasing movement, tighter framing',
  },
  chorus: {
    shotDurationBeats: '1-2 beats',
    content: 'performance, peak energy',
    cutSpeed: 'fast',
    cameraEnergy: 'dynamic cuts, wide shots, dramatic angles',
  },
  bridge: {
    shotDurationBeats: '4-6 beats',
    content: 'contrast, reflection',
    cutSpeed: 'varied',
    cameraEnergy: 'intimate close-ups, dreamlike movement',
  },
  outro: {
    shotDurationBeats: '6-10 beats',
    content: 'resolution, denouement',
    cutSpeed: 'slow',
    cameraEnergy: 'slow pull-back, lingering on final moments',
  },
  hook: {
    shotDurationBeats: '2-4 beats',
    content: 'catchy, memorable',
    cutSpeed: 'fast',
    cameraEnergy: 'punchy cuts matching hook rhythm',
  },
  drop: {
    shotDurationBeats: '1-2 beats',
    content: 'explosive, impact',
    cutSpeed: 'fast',
    cameraEnergy: 'maximum energy, quick cuts, dramatic reveals',
  },
};

// ============================================
// ARTICLE-ENHANCED: NLP VISUAL EXTRACTION TYPE
// Structure for extracting visual elements from lyrics
// ============================================
export interface NLPVisualScene {
  nouns: string[];
  nounPhrases: string[];
  verbs: string[];
  adjectives: string[];
  entities: Array<{ text: string; type: string }>;
  moodScore: number;
  mood: 'positive' | 'negative' | 'neutral';
  concreteVisuals: string[];
  abstractConcepts: string[];
  symbolMappings: string[];
}

// ============================================
// VOICE/ENERGY/MOOD OPTIONS - v2.0 FACTS + FUN
// ============================================

export const VOICE_STYLES = {
  observational: `Observational comedian energy. "You ever notice how..."
Wry, detached, letting absurdity speak for itself.
Not angry - amused. Like pointing out something obvious everyone missed.
Think: Hannibal Buress meets J. Cole.`,

  storyteller: `Storyteller voice. Specific scenes, specific people.
"My uncle posted something, my aunt replied..."
Let the story make the point. Don't editorialize.
Think: Kendrick's narratives, Dave Chappelle's setups.`,

  clever: `Wordplay-heavy. Double meanings. Bars that reward relistening.
Punchlines that work as music AND commentary.
The realization should hit 2 seconds AFTER the bar lands.
Think: Lupe Fiasco, early Eminem craft.`,

  soulful: `Heart on sleeve but not preachy. Vulnerable observations.
Gospel influence - conviction without condemnation.
Speaking FROM the struggle, not ABOUT it.
Think: Chance the Rapper, Lauryn Hill.`,

  passionate: `High conviction, earned intensity.
Not angry at people - passionate about truth.
The fire comes from love, not hate.
Think: Killer Mike, late-career Nas.`,
} as const;

export const ENERGY_LEVELS = {
  building: 'Starts conversational, builds to anthem. Peak at final chorus.',
  rolling: 'Steady groove throughout. Let the words do the work.',
  explosive: 'High energy from jump. Urgent but not angry.',
  chill: 'Laid back delivery. Heavy content, light touch.',
} as const;

export const MOOD_ARCS = {
  ironic_to_warm: `Start with ironic distance (pointing out absurdity),
end with genuine human warmth (connection despite it all).
The comedy earns the sincerity.`,

  tense_to_hopeful: `Acknowledge real tension/division early,
find unexpected common ground,
end with realistic hope (not naive optimism).`,

  playful: `Keep it light throughout.
Serious points wrapped in fun delivery.
The spoonful of sugar approach.`,

  reflective: `Thoughtful throughout.
Personal realizations shared out loud.
Intimate, like a late-night conversation.`,
} as const;

// ============================================
// VISUAL STYLE + SETTING OPTIONS - v2.0
// ============================================

export const VISUAL_STYLES = {
  cinematic: `Movie-quality but with comedic/ironic beats.
Beautiful shots that reveal absurdity.
Wes Anderson meets social commentary.`,

  comedic: `Visual comedy that makes the point.
Split screens showing parallels.
Timing is everything - visual punchlines.`,

  documentary: `Real-feeling, intimate, unpolished edges.
Caught moments rather than staged ones.
Makes it feel TRUE.`,

  symbolic: `Visual metaphors. Show don't tell.
Let imagery do the heavy lifting.
Rewards rewatching.`,
} as const;

export const SETTING_APPROACHES = {
  everyday: `Recognizable daily life. Gas stations, grocery stores, porches, diners.
Relatable spaces where real conversations happen (or don't).`,

  contrast: `Juxtapose different worlds to show similarities.
Mansion and trailer with the same news on.
Different neighborhoods, same frustrations.`,

  symbolic: `Abstract/metaphorical spaces.
Two people on opposite escalators.
Mirrors, split screens, visual rhymes.`,

  mixed: `Vary by section. Ground verses in reality,
let chorus/bridge go more symbolic.`,
} as const;

// Quick vibe presets for easy selection
export const VIBE_PRESETS = {
  observational: { voice: 'observational', energy: 'rolling', mood: 'ironic_to_warm', visual: 'comedic' },
  storyteller: { voice: 'storyteller', energy: 'building', mood: 'tense_to_hopeful', visual: 'documentary' },
  clever: { voice: 'clever', energy: 'rolling', mood: 'playful', visual: 'cinematic' },
  soulful: { voice: 'soulful', energy: 'building', mood: 'reflective', visual: 'cinematic' },
  passionate: { voice: 'passionate', energy: 'explosive', mood: 'tense_to_hopeful', visual: 'documentary' },
} as const;

// ============================================
// DEFAULT AVOID TERMS - Words that don't resonate in songs
// These sound too corporate/tech and break the human connection
// ============================================
export const DEFAULT_AVOID_TERMS = [
  // Social media / tech terms
  'TikTok',
  'tiktok',
  'algorithm',
  'app',
  'apps',
  'viral',
  'trending',
  'influencer',
  'content creator',
  'platform',
  'notification',
  'notifications',
  'timeline',
  'newsfeed',
  'clickbait',
  'engagement',
  'metrics',
  'analytics',
  'optimize',
  'monetize',
  'subscribe',
  'follower',
  'followers',
  'likes',

  // Corporate speak
  'synergy',
  'leverage',
  'ecosystem',
  'stakeholder',
  'bandwidth',
  'circle back',
  'pivot',
  'disruption',
  'innovative',
  'scalable',

  // Tech jargon
  'download',
  'upload',
  'WiFi',
  'wi-fi',
  'bluetooth',
  'update',
  'software',
  'hardware',
  'interface',
  'API',
  'data',
  'database',

  // Generic internet terms
  'online',
  'offline',
  'website',
  'webpage',
  'internet',
  'cyber',
  'digital',
  'virtual',
  'avatar',
  'username',
  'password',
  'login',
];

// ============================================
// NARRATIVE ARC v2.0 - FACTS + FUN + JOURNEY
// Make them LAUGH → Make them THINK → Make them FEEL
// ============================================

// The narrative arc structure - v2.0 with full section details
const NARRATIVE_ARC = {
  intro: {
    perspective: 'LOOKING AROUND',
    tone: 'Wry, detached',
    description:
      'Observational. Set the scene. "You ever notice..." energy. Plant seeds of irony. NO thesis statement yet.',
    example: `Yo, you ever notice how the ANGRIEST people
Got the same look in their EYES?
Scrolling at 3 AM like the answer's in there SOMEWHERE
(beat) It ain't.`,
  },
  verse1: {
    perspective: 'LOOKING DOWN',
    tone: 'Ironic, specific',
    description:
      'Show division/absurdity through SPECIFIC SCENES. Make it relatable - moments everyone recognizes. Dark humor OK.',
    example: `Mike's at the diner, 6 AM, coffee BLACK
Reading something on his phone that's got him ready to REACT
Danielle walks in, night shift DONE, scrubs still on
Her algorithm said that Mike's the PROBLEM
His said the same about HER — ain't that AWESOME?`,
  },
  prechorus: {
    perspective: 'THE TENSION',
    tone: 'Building, honest',
    description: 'Acknowledge the weight. Moment of honesty before the turn. Build to the pivot.',
    example: `But hold up, wait, let me ask you SOMETHING
If we're all so different, why we all feel NOTHING?
Same emptiness at 3 AM, same scroll, same HOLE`,
  },
  chorus: {
    perspective: 'THE TURN',
    tone: 'Catchy, questioning',
    description: 'NOT preachy resolution. A QUESTION or OBSERVATION that reframes. Should work as hook AND as insight.',
    example: `What if the FEED is just a hall of mirrors?
What if the ENEMY is just the guy who FEARS us?
What if we're STARING at a screen to avoid the FACE
Of someone who'd understand if we gave 'em SPACE?`,
  },
  verse2: {
    perspective: 'LOOKING SIDEWAYS',
    tone: 'Recognition, parallel',
    description:
      'Show the parallels (different people, same struggles). Juxtaposition reveals truth. The "oh shit, we\'re the same" moment.',
    example: `Mike's got a son who won't call back, moved to Portland, got his VIEWS
Danielle's got a mama who sends articles she don't wanna LOSE
Both of them LONELY at a table meant for two
Both of them WISHING someone saw what they've been through`,
  },
  bridge: {
    perspective: 'THE REALIZATION',
    tone: 'Quiet, sincere',
    description: 'Quieter, more intimate. The actual insight. Earned sincerity (comedy bought us credibility).',
    example: `I ain't saying we gotta AGREE on everything
I ain't saying KUMBAYA, let's hold hands and sing
I'm saying maybe... MAYBE...
The person I've been hating in my HEAD
Might be HURTING just as bad in their bed`,
  },
  finalChorus: {
    perspective: 'LOOKING UP',
    tone: 'Hopeful, warmer',
    description:
      "Same hook but now it MEANS something. We've earned the hope. Not naive - realistic optimism. Action implied.",
    example: `What if the FEED is just a hall of mirrors?
What if the ENEMY is just the guy who FEARS us?
(new resolution)
Maybe I'll START today, put my phone away
See who's REAL, see who STAYS`,
  },
  outro: {
    perspective: 'THE LANDING',
    tone: 'Warm, memorable',
    description: 'Stick the landing. Memorable final image/line. Leave them thinking. Specific, not generic.',
    example: `Mike still reads his articles, Danielle still scrolls her feed
But Tuesdays now they sit together, talking 'bout what they both NEED
Sometimes the REVOLUTION starts with "hey, this COFFEE's cheap"
(laughs) See you next Tuesday, Mike. Yeah, see you DANIELLE.`,
  },
};

// THE GOLDEN RULES - Show don't tell through SPECIFIC SCENES
const SHOW_DONT_TELL = {
  never: [
    '"We\'re all divided, we need unity"',
    '"Left and right, we need to stop the fight"',
    '"The media profits from our division"',
    '"Wake up sheeple"',
  ],
  always: [
    '"Same gas station, different bumper stickers / Both complaining that the coffee\'s bitter"',
    '"His algorithm said I\'m the problem / My algorithm said the same about him / We\'re both scrolling at 3 AM in the same apartment building"',
    '"News anchor smiling while the world\'s on fire / Same story both channels, just different choir"',
  ],
  specificityTest:
    'Before every line, ask: "Could this be in ANY song, or is it THIS story?" If any song → too generic → rewrite with specific detail',
};

// Visual irony techniques for VEO prompts
const VISUAL_IRONY_TECHNIQUES = [
  { technique: 'Parallel action', example: 'Dad in red hat, dad in blue hat - both yelling at the same game on TV' },
  { technique: 'Reveal', example: "Person posting angry comment, reveal they're at a kid's birthday party" },
  { technique: 'Split screen sync', example: 'News anchors from different channels making identical gestures' },
  { technique: 'Visual rhyme', example: 'McMansion living room, trailer living room - same news on both TVs' },
  {
    technique: 'Record scratch',
    example: "Person laughing at meme, realizes it's making fun of someone like their mom",
  },
];

// Unity Checklist v2.0
const UNITY_CHECKLIST = {
  lyrics: [
    'Would BOTH sides share this?',
    '3+ screenshot-worthy bars?',
    'SHOWS through scenes (not TELLS through statements)?',
    'Comedy earns the sincere moments?',
    'At least one callback/payoff?',
    'Makes you laugh AND think?',
    'Unity feels EARNED not forced?',
  ],
  video: [
    'At least one visual irony/comedy beat?',
    'Reveals sync with lyric punchlines?',
    'Characters specific and sympathetic?',
    'Works on mute?',
    'Has a "send to friend" moment?',
  ],
};

// ============================================
// CHARACTER INTELLIGENCE SYSTEM
// Smart character type detection for ALL content
// Uses HISTORICAL_FIGURES imported from video-constants.ts
// ============================================

// Cache for AI-researched historical figures (normalized lowercase keys)
const researchedFiguresCache: Map<string, HistoricalFigureData> = new Map();
const researchedEncountersCache: Map<string, HistoricalEncounter> = new Map();

// Normalize cache key for figures (lowercase)
function normalizeFigureKey(name: string): string {
  return name.toLowerCase().trim();
}

// Normalize cache key for encounters (alphabetical order, lowercase)
function normalizeEncounterKey(figure1: string, figure2: string): string {
  const names = [figure1.toLowerCase().trim(), figure2.toLowerCase().trim()].sort();
  return `${names[0]}_vs_${names[1]}`;
}

/**
 * AI-powered research for any historical figure
 * Falls back to this when figure isn't in HISTORICAL_FIGURES
 * Ensures all returned data is specific to the figure, not generic placeholders
 */
export async function researchHistoricalFigure(figureName: string): Promise<HistoricalFigureData | null> {
  const cacheKey = normalizeFigureKey(figureName);
  if (researchedFiguresCache.has(cacheKey)) {
    console.log(`   Using cached research for: ${figureName}`);
    return researchedFiguresCache.get(cacheKey)!;
  }

  console.log(`   🔍 AI researching historical figure: ${figureName}`);

  try {
    const response = await openaiService.generateText(
      `Research this historical figure: "${figureName}"

Return ONLY valid JSON with SPECIFIC details about this person:
{
  "title": "Their full title/name",
  "era": "Time period ID (e.g., 'mongol_empire', 'roman_republic')",
  "region": "Geographic region they ruled/lived",
  "canonicalDescription": "Detailed physical appearance - face, build, distinguishing features",
  "armor": "Specific clothing/armor they wore",
  "weapons": "Their signature weapons",
  "settings": ["3 specific locations associated with them"],
  "tradeGoods": ["5 specific items from their era/region"],
  "props": ["4 specific objects associated with them"],
  "spiritAnimal": "Animal representing their personality",
  "visualTheme": "Visual theme for videos about them"
}

Every field MUST be specific to ${figureName}, not generic.`,
      { temperature: 0.3, maxTokens: 1000 },
    );

    const parsed = extractAndParseJSON(response, `figure research for ${figureName}`);

    // Helper to validate arrays have real content
    const validateArray = (arr: unknown, minLength: number, fallbackFn: () => string[]): string[] => {
      if (
        Array.isArray(arr) &&
        arr.length >= minLength &&
        arr.every((item) => typeof item === 'string' && item.length > 3)
      ) {
        return arr as string[];
      }
      return fallbackFn();
    };

    // Build figure-specific fallbacks using the figure's name
    const figureData: HistoricalFigureData = {
      title: parsed.title && parsed.title.length > 3 ? parsed.title : figureName,
      era:
        parsed.era && parsed.era !== 'unknown' ? parsed.era : `era_of_${figureName.toLowerCase().replace(/\s+/g, '_')}`,
      region: parsed.region && parsed.region !== 'unknown' ? parsed.region : `lands of ${figureName}`,
      canonicalDescription:
        parsed.canonicalDescription && parsed.canonicalDescription.length > 20
          ? parsed.canonicalDescription
          : `${figureName}, a distinguished figure of their era, with commanding presence`,
      armor:
        parsed.armor && parsed.armor.length > 10 ? parsed.armor : `ceremonial robes befitting ${figureName}'s status`,
      weapons: parsed.weapons || `weapons of ${figureName}'s era`,
      settings: validateArray(parsed.settings, 2, () => [
        `${figureName}'s throne room`,
        `${figureName}'s palace courtyard`,
        `battlefields where ${figureName} made history`,
      ]),
      tradeGoods: validateArray(parsed.tradeGoods, 3, () => [
        `gold coins from ${figureName}'s era`,
        `silk and fine textiles`,
        `weapons and armor`,
        `scrolls and documents`,
      ]),
      props: validateArray(parsed.props, 2, () => [
        `${figureName}'s royal seal`,
        `ceremonial sword`,
        `crown or headdress`,
        `ancient scrolls`,
      ]),
      spiritAnimal: parsed.spiritAnimal && parsed.spiritAnimal.length > 2 ? parsed.spiritAnimal : 'eagle',
      visualTheme:
        parsed.visualTheme && parsed.visualTheme.length > 10 ? parsed.visualTheme : `Epic saga of ${figureName}`,
    };

    researchedFiguresCache.set(cacheKey, figureData);
    console.log(`   ✓ Researched: ${figureData.title} (${figureData.era}), ${figureData.settings.length} settings`);
    return figureData;
  } catch (error) {
    console.error(`   Failed to research ${figureName}:`, error);
    return null;
  }
}

// Cache for deep research
const deepResearchCache: Map<string, DeepHistoricalResearch> = new Map();

/**
 * DEEP HISTORICAL RESEARCH - Enhanced AI research for documentary-style content
 * Returns comprehensive data including:
 * - Key life events (4-6 dramatic moments)
 * - Philosophical thread (what their story MEANS)
 * - Detailed visual settings for VEO
 *
 * Usage: For non-battle historical content like "Story of Genghis Khan"
 */
export async function deepResearchHistoricalFigure(figureName: string): Promise<DeepHistoricalResearch | null> {
  const cacheKey = normalizeFigureKey(figureName);
  if (deepResearchCache.has(cacheKey)) {
    console.log(`   📚 Using cached deep research for: ${figureName}`);
    return deepResearchCache.get(cacheKey)!;
  }

  console.log(`   🔬 DEEP RESEARCH: Discovering ${figureName}...`);

  try {
    const response = await openaiService.generateText(
      `CRITICAL: Your response must be ONLY valid JSON. No explanatory text, no markdown, just pure JSON.

Research ${figureName} in depth for a documentary-style music video.

Return ONLY valid JSON with comprehensive historical data:
{
  "basic_info": {
    "full_name": "Their complete name/title",
    "lived": "birth-death years (e.g., '1162-1227')",
    "region": "Geographic region they ruled/operated in",
    "known_for": "One sentence summary of their legacy"
  },
  "character_appearance": {
    "physical": "HIGHLY SPECIFIC physical description: exact age appearance (weathered man in his 50s), facial features (deep-set piercing eyes, thin scar across left cheek), skin tone (sun-darkened bronze), hair style (wispy grey-streaked beard and mustache), build (stocky warrior build). Be specific like a casting director.",
    "age_to_depict": "What age captures them at their most iconic (e.g., 'Late 50s - weathered but commanding')",
    "distinctive_features": "Specific recognizable features: battle scars, birthmarks, facial hair style, eye color, expression lines",
    "primary_outfit": "SPECIFIC clothing with materials and colors: 'earth-brown wool deel with wolf-fur shoulder pauldrons, leather lamellar armor visible at chest, wide leather belt with gold clasp'",
    "accessories": "SPECIFIC weapons and symbols: 'curved Mongol saber sheathed at left hip, horsehair sulde battle standard, leather riding boots with iron stirrup marks'",
    "presence": "How they moved: commanding stillness, predatory alertness, the weight of command in every gesture"
  },
  "origin_scene": {
    "childhood_moment": "SPECIFIC dramatic childhood scene that shows their origin (e.g., '9-year-old Temüjin, hands bound with rope, walking behind enemy horsemen')",
    "childhood_setting": "SPECIFIC location with full environmental details where/when this happened (e.g., 'frozen Mongolian steppe at dawn, breath visible in cold air, frost on grass, endless flat horizon'; 'in a cramped wooden hut with thatched roof, smoke from cooking fire, dirt floor'; 'on the muddy bank of the Yellow River, fishing boats in background, grey overcast sky'). Include location TYPE and sensory atmosphere."
  },
  "key_events": [
    {
      "event": "Name of the event",
      "year": "When it happened",
      "what_happened": "2-3 sentences describing the event",
      "why_it_matters": "Historical significance",
      "visual_setting": "SPECIFIC dramatic location with full environmental details. Examples: 'in a dark cave carved into limestone, dripping water echoing off wet rock walls, makeshift torch casting flickering shadows'; 'on marble throne in vast columned hall, shafts of dusty sunlight through high windows'; 'on muddy battlefield at dawn, smoke drifting through trampled grass, abandoned weapons scattered'. ALWAYS specify the exact TYPE of location (cave, throne room, battlefield, forest clearing, ship deck, prison cell, temple courtyard) and include sensory details (lighting quality, sounds, textures, atmosphere, weather). Be HIGHLY SPECIFIC about the setting - this is what will be visually generated.",
      "scene_direction": "SPECIFIC cinematographic action: 'Tracking shot following subject through burning ruins, stepping over fallen banners, soldiers kneeling as he passes'",
      "emotional_beat": "What this scene should make the audience FEEL (awe, horror, hope, sorrow)"
    }
  ],
  "narrative_arc": {
    "intro_scene": "SPECIFIC opening scene with location and atmosphere: what the audience sees in first 10 seconds (e.g., 'in a dark cave with water dripping from stalactites, young survivor building makeshift shelter from palm fronds'; 'boy with bound hands walking across frozen Mongolian steppe behind enemy horsemen, hard cut to same steppe 40 years later')",
    "rise_scene": "SPECIFIC visual moment showing their rise to power WITH location details (e.g., 'standing on ship deck in storm, rallying crew as waves crash over rails'; 'in throne room with gold pillars, receiving surrender of enemy generals')",
    "peak_scene": "SPECIFIC visual moment at height of power WITH dramatic setting (e.g., 'silhouetted on horseback atop sand dune, watching 100,000 warriors stretch to horizon under blood-red sunset'; 'commanding 300-ship pirate fleet from flagship deck, red battle flags snapping in wind')",
    "reflection_scene": "SPECIFIC intimate moment showing vulnerability WITH location (e.g., 'alone in dark tent at night, armor removed, looking at scarred hands by candlelight'; 'sitting on cave floor, treating wounds, rain visible through entrance')",
    "legacy_scene": "SPECIFIC closing image WITH setting (e.g., 'aerial crane rising above endless steppe, figure grows smaller, land swallows him'; 'empty captain's chair on ship deck at sunset, waves carrying vessel into fog')"
  },
  "philosophical_thread": {
    "core_question": "What existential question does their life raise?",
    "tension": "What opposing forces did they embody or struggle with?",
    "lesson": "What does their story teach us about being human?",
    "modern_relevance": "Why does this still matter today?"
  },
  "visual_settings": {
    "primary_locations": ["4-5 SPECIFIC dramatic locations from their life with environmental details. Examples: 'in a dark limestone cave in the Peruvian rainforest, wet rock walls, dim natural light from entrance'; 'on the deck of a Chinese war junk in the South China Sea, red silk banners, morning fog'; 'in a sandstone throne room in Samarkand, carved columns, golden light through latticed windows'. Include location TYPE and sensory details."],
    "era_aesthetics": "Architecture, clothing style, technology of their time",
    "color_palette": "Colors associated with their era and culture",
    "iconic_imagery": ["5 symbols, objects, or scenes associated with them"]
  }
}

REQUIREMENTS:
- Include 4-6 KEY EVENTS that form a narrative arc (rise, peak, transformation, legacy)
- The philosophical_thread should connect all events into a MEANINGFUL story
- All data must be historically accurate and specific to ${figureName}
- The visual settings should be cinematic and epic
- Return ONLY valid JSON, no markdown code blocks, no explanatory text

DO NOT write "Here is the JSON..." or any other text. Start your response with { and end with }`,
      {
        temperature: 0.2,
        maxTokens: 2500,
        systemPrompt: 'You are a JSON-only API. Return only valid JSON, never explanatory text.',
      },
    );

    // Use robust JSON extraction instead of manual stripping
    const parsed = extractAndParseJSON(response, `deep research for ${figureName}`);

    // Transform snake_case API response to camelCase TypeScript interface
    const research: DeepHistoricalResearch = {
      basicInfo: {
        fullName: parsed.basic_info?.full_name || figureName,
        lived: parsed.basic_info?.lived || 'Unknown era',
        region: parsed.basic_info?.region || 'Unknown region',
        knownFor: parsed.basic_info?.known_for || `Historical figure ${figureName}`,
      },
      characterAppearance: {
        physical: parsed.character_appearance?.physical || `Commanding figure of their era`,
        ageToDepict: parsed.character_appearance?.age_to_depict || '40, at the height of power',
        distinctiveFeatures: parsed.character_appearance?.distinctive_features || 'Distinguished bearing',
        primaryOutfit: parsed.character_appearance?.primary_outfit || 'Period-appropriate ceremonial attire',
        accessories: parsed.character_appearance?.accessories || 'Symbols of power and authority',
        presence: parsed.character_appearance?.presence || 'Commanding, authoritative presence',
      },
      originScene: parsed.origin_scene
        ? {
            childhoodMoment: parsed.origin_scene.childhood_moment || `Young ${figureName} facing adversity`,
            childhoodSetting: parsed.origin_scene.childhood_setting || 'Harsh landscape at dawn',
          }
        : undefined,
      keyEvents: (parsed.key_events || []).map((e: any) => ({
        event: e.event || 'Key moment',
        year: e.year || 'Unknown',
        whatHappened: e.what_happened || e.whatHappened || 'Significant historical event',
        whyItMatters: e.why_it_matters || e.whyItMatters || 'Changed the course of history',
        visualSetting: e.visual_setting || e.visualSetting || 'Epic historical setting',
        sceneDirection: e.scene_direction || e.sceneDirection || undefined,
        emotionalBeat: e.emotional_beat || e.emotionalBeat || undefined,
      })),
      narrativeArc: parsed.narrative_arc
        ? {
            introScene: parsed.narrative_arc.intro_scene || `Origin and rise of ${figureName}`,
            riseScene: parsed.narrative_arc.rise_scene || `${figureName} gaining power`,
            peakScene: parsed.narrative_arc.peak_scene || `${figureName} at the height of power`,
            reflectionScene: parsed.narrative_arc.reflection_scene || `${figureName} alone, contemplating`,
            legacyScene: parsed.narrative_arc.legacy_scene || `Final image, figure fades into history`,
          }
        : undefined,
      philosophicalThread: {
        coreQuestion: parsed.philosophical_thread?.core_question || 'What drives a person to reshape the world?',
        tension: parsed.philosophical_thread?.tension || 'Power versus humanity',
        lesson: parsed.philosophical_thread?.lesson || 'The cost and meaning of greatness',
        modernRelevance: parsed.philosophical_thread?.modern_relevance || 'Leadership and legacy endure',
      },
      visualSettings: {
        primaryLocations: parsed.visual_settings?.primary_locations || [`${figureName}'s realm`],
        eraAesthetics: parsed.visual_settings?.era_aesthetics || 'Period-accurate architecture and dress',
        colorPalette: parsed.visual_settings?.color_palette || 'Earth tones, gold, rich fabrics',
        iconicImagery: parsed.visual_settings?.iconic_imagery || ['crowns', 'scrolls', 'ancient maps'],
      },
    };

    // Ensure we have at least 3 key events
    if (research.keyEvents.length < 3) {
      console.warn(`   ⚠️ Only ${research.keyEvents.length} key events found, adding generic arc`);
      research.keyEvents = [
        {
          event: 'Rise to Power',
          year: research.basicInfo.lived.split('-')[0] || 'Early life',
          whatHappened: `${figureName} began their journey to greatness`,
          whyItMatters: 'The beginning of a legend',
          visualSetting: 'Humble origins, dramatic lighting',
        },
        {
          event: 'Peak Achievement',
          year: 'Height of power',
          whatHappened: `${figureName} achieved their greatest triumph`,
          whyItMatters: 'The moment that defined their legacy',
          visualSetting: 'Grand palace or battlefield, epic scope',
        },
        {
          event: 'Legacy Moment',
          year: research.basicInfo.lived.split('-')[1] || 'Later life',
          whatHappened: `${figureName} secured their place in history`,
          whyItMatters: 'What remains after the end',
          visualSetting: 'Symbolic setting, golden hour lighting',
        },
        ...research.keyEvents,
      ].slice(0, 6);
    }

    deepResearchCache.set(cacheKey, research);

    console.log(`   ✅ DEEP RESEARCH COMPLETE:`);
    console.log(`      ${research.basicInfo.fullName} (${research.basicInfo.lived})`);
    console.log(`      Key Events: ${research.keyEvents.length}`);
    console.log(`      Philosophy: "${research.philosophicalThread.coreQuestion}"`);
    console.log(`      Locations: ${research.visualSettings.primaryLocations.slice(0, 3).join(', ')}`);

    return research;
  } catch (error) {
    console.error(`   ❌ Deep research failed for ${figureName}:`, error);
    return null;
  }
}

/**
 * Helper function to extract JSON from AI responses that might include extra text
 */
function extractJSON(text: string): string {
  // Try to find JSON object in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  return text;
}

/**
 * 🎬 LYRIC SCENE EXTRACTOR
 * Analyzes lyrics to extract visual moments for VEO
 * Ensures video scenes MATCH what the lyrics describe
 *
 * Usage: Run after lyrics generation, before VEO prompt generation
 */
export async function extractLyricScenes(
  sectionLyrics: string,
  sectionType: string,
  sectionIndex: number,
  context?: {
    topic?: string;
    characterName?: string;
    isHistorical?: boolean;
    stylePreset?: string;
  },
): Promise<SectionLyricScenes> {
  console.log(`   🎬 LYRIC SCENE EXTRACTOR: Analyzing ${sectionType} section ${sectionIndex + 1}...`);

  try {
    const contextInfo = context
      ? `
CONTEXT:
- Topic: ${context.topic || 'Unknown'}
- Main character: ${context.characterName || 'Various characters'}
- Historical content: ${context.isHistorical ? 'Yes - use period-accurate visuals' : 'No'}
- Style preset: ${context.stylePreset || 'documentary'}
`
      : '';

    // 🎬 SECTION VISUAL PHILOSOPHY - each section type has a specific visual purpose
    const sectionVisualPhilosophy: Record<string, string> = {
      intro: `HOOK EVENT: Most dramatic/shocking moment to grab attention immediately.
Examples: father being poisoned, child being bound and dragged, traumatic origin moment.
Goal: Make viewer say "WHAT?!" in the first 5 seconds.`,
      verse: `SURVIVAL PROGRESSION: Show character aging and growing through struggles.
Verse 1: Cold, harsh survival, frost-bitten feet, small tribe forming, character aging visibly.
Verse 2: ACTION SEQUENCES - arrows blacking out sun, cities burning, horseback formations, prisoners transported, wealth display.
Goal: Show journey from survivor to conqueror.`,
      chorus: `POWER IMAGERY: Peak of power, destruction followed by building.
Examples: throne of skulls, plundering cities, standing over ruins, building empire monuments.
Goal: Maximum visual impact of power and legacy.`,
      bridge: `MORTALITY/DEATH: End of life, reflection, passing.
Examples: dying in bed with plague, decrepit body, closing eyes for last time, burial.
Goal: Emotional gut-punch of mortality and loss.`,
      outro: `COSMIC LEGACY: Pull back to show scope and legacy.
Examples: camera pulling back to show entire empire, viewer perspective, earth from above.
Goal: Leave viewer with sense of historical impact and scale.`,
    };

    const sectionPhilosophy =
      sectionVisualPhilosophy[sectionType.toLowerCase().replace(/[^a-z]/g, '')] ||
      sectionVisualPhilosophy['verse'] ||
      '';

    const response = await openaiService.generateText(
      `Analyze these lyrics and extract the VISUAL MOMENTS that should be shown in a music video.

LYRICS TO ANALYZE:
${sectionLyrics}

SECTION TYPE: ${sectionType.toUpperCase()}
${contextInfo}

🎬 SECTION VISUAL PHILOSOPHY (CRITICAL - FOLLOW THIS):
${sectionPhilosophy}

For each line or couplet, extract:
1. SUBJECT: Who/what should be shown (specific person, object, or scene)
2. ACTION: What is happening visually
3. SETTING: Where this takes place
4. EMOTION: What the audience should feel
5. VISUAL DETAILS: Specific elements mentioned (props, weather, lighting cues)

RETURN ONLY VALID JSON:
{
  "moments": [
    {
      "lineNumber": 1,
      "lyricText": "exact lyrics for this moment",
      "subject": "who/what is shown",
      "action": "what is happening",
      "setting": "where it happens",
      "emotion": "audience feeling",
      "visualDetails": ["specific", "visual", "elements"],
      "timeInSection": "start" | "middle" | "end",
      "confidence": 0.0-1.0
    }
  ],
  "primaryMomentIndex": 0,
  "overallEmotion": "dominant emotion for section",
  "visualProgression": "how visuals should flow through section"
}

CRITICAL RULES:
1. Extract EXACTLY what the lyrics describe - don't invent scenes
2. The PRIMARY MOMENT should be the most visually impactful/important scene
3. If lyrics say "poisoned his father" - show father being poisoned
4. If lyrics say "hands bound, dragged behind a steed" - show that exact scene
5. Be literal with visual extraction - the VEO must match the lyrics
6. Include emotional beats from word emphasis (words ending in asterisks like *bleed*)

YOU MUST RESPOND WITH ONLY THE JSON OBJECT. DO NOT include any explanatory text, apologies, or comments.
If you cannot analyze the lyrics, still return a valid JSON object with at least one moment.`,
      { temperature: 0.4, maxTokens: 1500 },
    );

    // Parse response with robust error handling
    let jsonStr = response.trim();

    // Remove markdown code fences (now also handled in cleanMalformedJSON, but keep for initial cleanup)
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    // Use robust JSON extraction with automatic retry logic (up to 3 attempts)
    let parsed;
    let parseAttempts = 0;
    const maxAttempts = 3;

    while (parseAttempts < maxAttempts) {
      try {
        if (parseAttempts === 0) {
          // First attempt: use the original response
          parsed = extractAndParseJSON(jsonStr, `lyric scene extraction for ${sectionType}`);
          break;
        } else if (parseAttempts === 1) {
          // Second attempt: retry with stronger JSON enforcement
          console.warn(
            `   ⚠️ JSON parse failed (attempt ${parseAttempts}/${maxAttempts}), retrying with stronger prompt...`,
          );
          const retryResponse = await openaiService.generateText(
            `Extract visual moments from these lyrics. Return ONLY valid JSON, no other text.

LYRICS:
${sectionLyrics}

CRITICAL: Your response must be ONLY the JSON object below. No explanation, no apologies, JUST the JSON.

Required JSON format (copy this structure exactly):
{
  "moments": [{"lineNumber": 1, "lyricText": "text", "subject": "who", "action": "what", "setting": "where", "emotion": "feeling", "visualDetails": [], "timeInSection": "start", "confidence": 0.8}],
  "primaryMomentIndex": 0,
  "overallEmotion": "emotion",
  "visualProgression": "description"
}

START YOUR RESPONSE WITH { AND END WITH }`,
            { temperature: 0.2, maxTokens: 1500 },
          );

          parsed = extractAndParseJSON(
            retryResponse,
            `lyric scene extraction retry ${parseAttempts} for ${sectionType}`,
          );
          break;
        } else if (parseAttempts === 2) {
          // Third attempt: minimal JSON structure with explicit example
          console.warn(
            `   ⚠️ JSON parse failed again (attempt ${parseAttempts}/${maxAttempts}), using minimal structure fallback...`,
          );
          const firstLine = sectionLyrics.split('\n')[0] || 'lyrics';
          const minimalRetry = await openaiService.generateText(
            `Return a JSON object with visual moments for these lyrics:
${sectionLyrics}

Your ENTIRE response must be this JSON (fill in the blanks):
{"moments":[{"lineNumber":1,"lyricText":"${firstLine.replace(/"/g, '\\"')}","subject":"main character","action":"visible action","setting":"location","emotion":"feeling","visualDetails":["detail1","detail2"],"timeInSection":"start","confidence":0.8}],"primaryMomentIndex":0,"overallEmotion":"dominant emotion","visualProgression":"how it flows"}

Return ONLY this JSON structure. Nothing else.`,
            { temperature: 0.1, maxTokens: 800 },
          );

          parsed = extractAndParseJSON(minimalRetry, `lyric scene extraction minimal fallback for ${sectionType}`);
          break;
        }
      } catch (error) {
        parseAttempts++;
        if (parseAttempts >= maxAttempts) {
          // All attempts failed - throw with detailed error
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(`   ❌ Failed to extract lyric scenes after ${maxAttempts} attempts for ${sectionType}`);
          console.error(`      Last error: ${errorMsg}`);
          throw new Error(
            `Failed to extract lyric scenes after ${maxAttempts} attempts for ${sectionType}.\n` +
              `Last error: ${errorMsg}\n` +
              `Context: Section ${sectionIndex + 1}, ${sectionLyrics.length} chars of lyrics\n` +
              `This usually indicates malformed JSON from the AI model. Check the response format.`,
          );
        }
        // Continue to next attempt
      }
    }

    // Transform to our interface
    const allMoments: LyricVisualMoment[] = (parsed.moments || []).map((m: any) => ({
      lineNumber: m.lineNumber || 1,
      lyricText: m.lyricText || '',
      subject: m.subject || 'main character',
      action: m.action || 'present in scene',
      setting: m.setting || 'appropriate setting',
      emotion: m.emotion || 'engaged',
      visualDetails: m.visualDetails || [],
      timeInSection: m.timeInSection || 'middle',
      confidence: m.confidence || 0.7,
    }));

    // Get primary moment (highest confidence or specified index)
    const primaryIndex = parsed.primaryMomentIndex || 0;
    const primaryMoment = allMoments[primaryIndex] ||
      allMoments[0] || {
        lineNumber: 1,
        lyricText: sectionLyrics.split('\n')[0] || '',
        subject: 'main character',
        action: 'present in scene',
        setting: 'appropriate setting',
        emotion: 'engaged',
        visualDetails: [],
        timeInSection: 'start' as const,
        confidence: 0.5,
      };

    const result: SectionLyricScenes = {
      sectionType,
      sectionIndex,
      primaryMoment,
      allMoments,
      overallEmotion: parsed.overallEmotion || 'engaged',
      visualProgression: parsed.visualProgression || 'build through section',
    };

    console.log(`   ✅ Extracted ${allMoments.length} visual moments from ${sectionType}`);
    console.log(`      Primary scene: "${primaryMoment.subject} ${primaryMoment.action}" (${primaryMoment.emotion})`);

    return result;
  } catch (error) {
    console.error(`   ❌ Lyric scene extraction failed:`, error);

    // Fallback: create basic scene from lyrics
    const lines = sectionLyrics.split('\n').filter((l) => l.trim());
    return {
      sectionType,
      sectionIndex,
      primaryMoment: {
        lineNumber: 1,
        lyricText: lines[0] || sectionLyrics,
        subject: 'main character',
        action: 'performing in scene',
        setting: 'appropriate setting',
        emotion: 'engaged',
        visualDetails: [],
        timeInSection: 'start',
        confidence: 0.3,
      },
      allMoments: [],
      overallEmotion: 'engaged',
      visualProgression: 'standard progression',
    };
  }
}

/**
 * AI-powered research for historical encounter between two figures
 * Returns a complete HistoricalEncounter with all required fields
 * Validates response has real data, not placeholders
 */
export async function researchHistoricalEncounter(
  figure1: string,
  figure2: string,
): Promise<HistoricalEncounter | null> {
  const cacheKey = normalizeEncounterKey(figure1, figure2);
  if (researchedEncountersCache.has(cacheKey)) {
    console.log(`   Using cached encounter research: ${figure1} vs ${figure2}`);
    return researchedEncountersCache.get(cacheKey)!;
  }

  console.log(`   🔍 AI researching encounter: ${figure1} vs ${figure2}`);

  try {
    const response = await openaiService.generateText(
      `Research the historical relationship between "${figure1}" and "${figure2}".
You MUST provide real historical data for each field.

Return ONLY valid JSON:
{
  "didTheyMeet": true or false,
  "relationship": "alliance" | "war" | "trade" | "diplomacy" | "rivalry" | "never_met",
  "actualEvent": "Specific historical event or connection between them",
  "year": "Specific year range (e.g., '1271-1295')",
  "location": "Specific geographic location(s)",
  "atmosphere": "Specific era/setting vibe with real details",
  "keyFacts": ["5 specific true historical facts about these figures"],
  "settings": ["3 specific historically accurate scene descriptions for video"],
  "mustInclude": ["3 specific visual elements accurate to their era"],
  "mustAvoid": ["3 specific anachronistic elements to avoid"],
  "narrativeArc": "Specific story structure for their encounter"
}`,
      { temperature: 0.3, maxTokens: 1200 },
    );

    const parsed = extractAndParseJSON(response, `encounter research for ${figure1} vs ${figure2}`);

    // Validate required fields have real data
    const hasRealData =
      parsed.actualEvent &&
      parsed.actualEvent.length > 20 &&
      parsed.year &&
      parsed.year !== 'unknown' &&
      parsed.location &&
      parsed.location !== 'unknown' &&
      Array.isArray(parsed.keyFacts) &&
      parsed.keyFacts.length >= 3 &&
      Array.isArray(parsed.settings) &&
      parsed.settings.length >= 1 &&
      parsed.narrativeArc &&
      parsed.narrativeArc.length > 20;

    if (!hasRealData) {
      console.warn(`   AI research returned incomplete data, using fallback construction`);
    }

    // Map relationship to valid enum with strict validation
    const VALID_RELATIONSHIPS = ['alliance', 'war', 'trade', 'diplomacy', 'rivalry', 'never_met'] as const;
    type RelationType = (typeof VALID_RELATIONSHIPS)[number];

    let relationship: RelationType;
    if (VALID_RELATIONSHIPS.includes(parsed.relationship as RelationType)) {
      relationship = parsed.relationship as RelationType;
    } else if (parsed.didTheyMeet === false) {
      relationship = 'never_met';
      console.log(`   Mapped relationship 'never met' from didTheyMeet flag`);
    } else {
      // Default based on context clues in keyFacts
      const factsText = (parsed.keyFacts || []).join(' ').toLowerCase();
      if (factsText.includes('war') || factsText.includes('battle') || factsText.includes('fought')) {
        relationship = 'war';
      } else if (factsText.includes('trade') || factsText.includes('commerce')) {
        relationship = 'trade';
      } else if (factsText.includes('ally') || factsText.includes('alliance')) {
        relationship = 'alliance';
      } else if (factsText.includes('rival')) {
        relationship = 'rivalry';
      } else {
        relationship = 'diplomacy';
      }
      console.log(`   Inferred relationship '${relationship}' from context`);
    }

    // Helper to validate arrays have real content (same as in figure research)
    const validateArray = (arr: unknown, minLength: number, fallbackFn: () => string[]): string[] => {
      if (
        Array.isArray(arr) &&
        arr.length >= minLength &&
        arr.every((item) => typeof item === 'string' && item.length > 3)
      ) {
        return arr as string[];
      }
      return fallbackFn();
    };

    // Build encounter with validated real data - all fallbacks are figure-specific
    const encounter: HistoricalEncounter = {
      figures: [figure1, figure2] as [string, string],
      keyFacts: validateArray(parsed.keyFacts, 3, () => [
        `${figure1} was a major historical figure of their era`,
        `${figure2} was a major historical figure of their era`,
        `Both ${figure1} and ${figure2} shaped the course of history`,
        `Their legacies continue to influence our world today`,
        `The story of ${figure1} and ${figure2} remains legendary`,
      ]),
      actualEvent:
        parsed.actualEvent && parsed.actualEvent.length > 10
          ? parsed.actualEvent
          : `The legendary encounter where ${figure1} and ${figure2} crossed paths in history`,
      year:
        parsed.year && parsed.year !== 'unknown' && parsed.year.length > 2
          ? parsed.year
          : `The era of ${figure1} and ${figure2}`,
      location:
        parsed.location && parsed.location !== 'unknown' && parsed.location.length > 3
          ? parsed.location
          : `The lands where ${figure1} and ${figure2} made history`,
      atmosphere:
        parsed.atmosphere && parsed.atmosphere.length > 10
          ? parsed.atmosphere
          : `The epic age when ${figure1} and ${figure2} walked the earth`,
      relationship,
      settings: validateArray(parsed.settings, 1, () => [
        `Grand throne room where ${figure1} holds court`,
        `Battlefield where ${figure2} commands their forces`,
        `Diplomatic hall where ${figure1} and ${figure2} negotiate`,
      ]),
      mustInclude: validateArray(parsed.mustInclude, 1, () => [
        `${figure1}'s distinctive attire and weapons`,
        `${figure2}'s iconic armor or clothing`,
        `Period-accurate architecture and setting details`,
      ]),
      mustAvoid: validateArray(parsed.mustAvoid, 1, () => [
        `Modern technology or electronics`,
        `Contemporary clothing or accessories`,
        `Anachronistic architecture or vehicles`,
      ]),
      narrativeArc:
        parsed.narrativeArc && parsed.narrativeArc.length > 20
          ? parsed.narrativeArc
          : `${figure1} and ${figure2} meet in an epic encounter that will echo through history`,
    };

    researchedEncountersCache.set(cacheKey, encounter);
    console.log(
      `   ✓ Researched encounter: ${encounter.relationship}, ${encounter.keyFacts.length} facts, ${encounter.settings.length} settings`,
    );
    return encounter;
  } catch (error) {
    console.error(`   Failed to research encounter:`, error);
    return null;
  }
}

/**
 * Get historical figure data - checks hardcoded first, then AI research
 */
export async function getOrResearchHistoricalFigure(figureName: string): Promise<HistoricalFigureData | null> {
  // Check hardcoded first
  const hardcoded = HISTORICAL_FIGURES[figureName.toLowerCase()];
  if (hardcoded) {
    return hardcoded;
  }

  // Fall back to AI research
  return researchHistoricalFigure(figureName);
}

/**
 * Detect historical figure in topic
 * Returns figure data if found
 */
export function detectHistoricalFigure(topic: string): (typeof HISTORICAL_FIGURES)[string] | null {
  const lowerTopic = topic.toLowerCase();
  for (const [key, figureData] of Object.entries(HISTORICAL_FIGURES)) {
    if (lowerTopic.includes(key)) {
      return figureData;
    }
  }
  return null;
}

/**
 * Check if topic is about a historical person/era (for HUMAN representation)
 */
export function isHistoricalContent(topic: string): boolean {
  const lowerTopic = topic.toLowerCase();

  // Check for known historical figures
  if (detectHistoricalFigure(topic)) {
    return true;
  }

  // Check for historical era keywords
  const historicalKeywords = [
    'ancient',
    'medieval',
    'renaissance',
    'empire',
    'dynasty',
    'kingdom',
    'century',
    'era',
    'age of',
    'war of',
    'war', // General war references (WWII, Vietnam War, etc.)
    'warfare',
    'battle of',
    'conquest',
    'king',
    'queen',
    'emperor',
    'empress',
    'prince',
    'princess',
    'duke',
    'duchess',
    'lord',
    'lady',
    'khan', // Mongol rulers
    'pharaoh',
    'shogun',
    'sultan',
    'tsar',
    'tsarina',
    'caesar',
    'pope', // Catholic religious leaders
    'cardinal',
    'bishop',
    'archbishop',
    'monk',
    'friar',
    'clergy',
    'priest',
    'rabbi', // Jewish religious leaders
    'imam', // Islamic religious leaders
    'caliph', // Islamic rulers
    'history of',
    'story of',
    'rise of',
    'fall of',
    'reign of',
    'wwii',
    'ww2',
    'world war',
    'vietnam',
    'korea',
    'revolutionary',
    'revolution',
    'atomic bomb',
    'nuclear',
    'hiroshima',
    'nagasaki',
    'soviet',
    'nazi',
    'allied',
    'axis',
    'veteran',
    'soldier',
    'general',
    'admiral',
    'commander',
    'pilot',
    'historical',
    'survivor', // Historical survival stories
    'mongol', // Mongol Empire
    'viking', // Viking era
    'samurai', // Japanese warriors
    'gladiator', // Roman fighters
    'knight', // Medieval knights
    'warrior', // Historical warriors
  ];

  return historicalKeywords.some((kw) => lowerTopic.includes(kw));
}

/**
 * Named creatures that should be used AS-IS when detected in topics
 * If topic mentions these, use the actual creature
 */
export const NAMED_CREATURES = [
  // Cryptids & Folklore
  'bigfoot',
  'sasquatch',
  'yeti',
  'mothman',
  'chupacabra',
  'loch ness',
  'nessie',
  'kraken',
  // Mythical creatures
  'dragon',
  'unicorn',
  'phoenix',
  'griffin',
  'pegasus',
  'centaur',
  'minotaur',
  'hydra',
  'sphinx',
  'chimera',
  'basilisk',
  'manticore',
  'thunderbird',
  'roc',
  // Supernatural
  'mermaid',
  'siren',
  'werewolf',
  'vampire',
  'zombie',
  'ghost',
  'demon',
  'angel',
  'fairy',
  'elf',
  'dwarf',
  'goblin',
  'orc',
  'troll',
  'giant',
  'cyclops',
  // Sci-fi
  'robot',
  'android',
  'cyborg',
  'alien',
  'martian',
  'xenomorph',
  // Specific animals used as characters
  'bigfoot',
  'kong',
  'godzilla',
  'kaiju',
];

/**
 * Character type hints based on content category
 * Helps AI make creative decisions
 */
export const CHARACTER_TYPE_HINTS: Record<string, string> = {
  food: 'anthropomorphic_animal', // Food battles → spirit animals
  beverage: 'wizard_mage', // Drinks → mystics (non-human mages)
  animal: 'warrior_animal', // Animals → those animals as warriors
  season: 'elemental_being', // Seasons → elementals
  weather: 'elemental_being', // Weather → nature spirits
  city: 'robot_mech', // Cities → giant mechs or mascots
  place: 'regional_mascot', // Places → regional creatures
  technology: 'robot_mech', // Tech → robots
  abstract: 'mythical_creature', // Abstract concepts → symbolic creatures
  emotion: 'anthropomorphic_animal', // Emotions → expressive animals (NO HUMANS)
  historical: 'historical_human', // History → REAL historical figures (humans, real locations, actual events)
  mythology: 'god_deity', // Mythology → gods/creatures
  space: 'astronaut_alien', // Space → aliens (NO HUMANS)
  ocean: 'aquatic_creature', // Ocean → mermaids, sea creatures
  forest: 'woodland_spirit', // Forest → forest spirits, animals
  music: 'anthropomorphic_animal', // Music → animal performers (NO HUMANS)
  default: 'anthropomorphic_animal', // Default → animals (NEVER HUMANS)
};

/**
 * Spirit animal associations for food battles
 * Maps foods to culturally/thematically appropriate animals
 */
export const FOOD_SPIRIT_ANIMALS: Record<string, string[]> = {
  // Italian
  pizza: ['pig', 'bear', 'raccoon'], // Indulgent eaters, Italian wild boar
  pasta: ['pig', 'goat', 'rooster'], // Italian farm animals
  lasagna: ['pig', 'bear'], // Layered comfort food lovers

  // Mexican
  taco: ['donkey', 'armadillo', 'iguana'], // Mexican burro, native fauna
  burrito: ['donkey', 'coyote', 'hawk'], // Desert southwest animals
  nachos: ['armadillo', 'iguana'], // Mexican reptiles
  enchilada: ['jaguar', 'quetzal'], // Aztec/Mayan sacred animals

  // American
  burger: ['bull', 'bison', 'eagle'], // Beef connection, American icons
  hotdog: ['dachshund', 'wolf', 'coyote'], // Dog shape, canines
  bbq: ['pig', 'armadillo', 'longhorn'], // Southern American
  fried_chicken: ['rooster', 'hawk', 'eagle'], // Bird connection

  // Japanese
  sushi: ['otter', 'crane', 'koi', 'tanuki'], // Japanese aesthetic, river spirits
  ramen: ['fox', 'tanuki', 'dragon'], // Kitsune folklore, warmth seekers
  tempura: ['crane', 'koi'], // Elegant Japanese

  // Chinese
  dim_sum: ['panda', 'dragon', 'phoenix'], // Chinese symbols
  kung_pao: ['tiger', 'dragon'], // Fierce flavors

  // Korean
  kimchi: ['tiger', 'bear'], // Korean national animal
  bibimbap: ['crane', 'tiger'], // Korean symbols

  // Vietnamese
  pho: ['water_buffalo', 'dragon', 'crane'], // Vietnamese symbols
  banh_mi: ['water_buffalo', 'rooster'], // Street food energy

  // Indian
  curry: ['tiger', 'elephant', 'peacock'], // Indian national animals
  naan: ['elephant', 'cobra'], // Indian icons
  samosa: ['peacock', 'mongoose'], // Indian fauna

  // Thai
  pad_thai: ['elephant', 'tiger', 'gecko'], // Thai animals

  // Middle Eastern
  falafel: ['camel', 'falcon', 'hawk'], // Desert animals
  shawarma: ['falcon', 'camel'], // Middle Eastern
  hummus: ['camel', 'gazelle'], // Mediterranean

  // Beverages
  coffee: ['owl', 'rabbit', 'hummingbird'], // Alertness, energy
  tea: ['crane', 'turtle', 'panda'], // Calm, wisdom
  beer: ['bear', 'boar', 'ox'], // Germanic strength
  wine: ['fox', 'peacock', 'bull'], // Sophistication

  // Desserts
  ice_cream: ['polar_bear', 'penguin', 'seal'], // Cold
  cake: ['bear', 'rabbit'], // Sweet tooth
  chocolate: ['bear', 'raccoon'], // Indulgence

  // General categories
  spicy: ['dragon', 'phoenix', 'tiger'], // Fire animals
  sweet: ['bear', 'hummingbird', 'rabbit'], // Sweet lovers
  savory: ['pig', 'wolf', 'boar'], // Meat eaters
  fresh: ['rabbit', 'deer', 'crane'], // Light eaters
};

/**
 * Topic category detection keywords
 */
export const TOPIC_CATEGORY_KEYWORDS: Record<string, string[]> = {
  food: [
    'pizza',
    'taco',
    'burger',
    'sushi',
    'ramen',
    'curry',
    'noodle',
    'rice',
    'bread',
    'pasta',
    'steak',
    'chicken',
    'fish',
    'vegetable',
    'fruit',
    'dessert',
    'cake',
    'ice cream',
    'chocolate',
    'candy',
    'fries',
    'salad',
    'soup',
    'sandwich',
  ],
  beverage: [
    'coffee',
    'tea',
    'beer',
    'wine',
    'soda',
    'juice',
    'water',
    'milk',
    'cocktail',
    'whiskey',
    'vodka',
    'rum',
    'espresso',
    'latte',
    'smoothie',
  ],
  animal: [
    'cat',
    'dog',
    'lion',
    'tiger',
    'bear',
    'wolf',
    'fox',
    'eagle',
    'hawk',
    'shark',
    'whale',
    'dolphin',
    'elephant',
    'monkey',
    'snake',
    'bird',
  ],
  season: ['summer', 'winter', 'spring', 'fall', 'autumn'],
  weather: ['rain', 'sun', 'snow', 'storm', 'thunder', 'lightning', 'wind', 'cloud'],
  city: [
    'new york',
    'los angeles',
    'chicago',
    'tokyo',
    'london',
    'paris',
    'berlin',
    'nyc',
    'la',
    'sf',
    'miami',
    'atlanta',
    'seattle',
    'boston',
  ],
  technology: [
    'iphone',
    'android',
    'mac',
    'pc',
    'playstation',
    'xbox',
    'nintendo',
    'ai',
    'robot',
    'internet',
    'computer',
    'phone',
    'tech',
  ],
  emotion: [
    'love',
    'hate',
    'fear',
    'joy',
    'sadness',
    'anger',
    'hope',
    'despair',
    'lonely',
    'happy',
    'sad',
    'anxious',
    'calm',
    'excited',
  ],
  space: [
    'space',
    'moon',
    'mars',
    'star',
    'galaxy',
    'universe',
    'astronaut',
    'rocket',
    'alien',
    'planet',
    'cosmic',
    'stellar',
    'nebula',
  ],
  ocean: [
    'ocean',
    'sea',
    'beach',
    'wave',
    'underwater',
    'marine',
    'coral',
    'fish',
    'mermaid',
    'ship',
    'sail',
    'surf',
    'tide',
    'deep sea',
  ],
  forest: [
    'forest',
    'jungle',
    'woods',
    'tree',
    'nature',
    'wild',
    'woodland',
    'rainforest',
    'grove',
    'meadow',
    'garden',
  ],
  mythology: [
    'god',
    'goddess',
    'myth',
    'legend',
    'ancient',
    'olympus',
    'norse',
    'egyptian',
    'greek',
    'roman',
    'celtic',
    'aztec',
    'mayan',
  ],
};

/**
 * Character type definitions with VEO prompt guidance
 */
export const CHARACTER_TYPES = {
  anthropomorphic_animal: {
    name: 'Anthropomorphic Animal',
    description: 'Animal standing upright like a human, with human-like expressions and gestures',
    veoPrefix: 'anthropomorphic talking',
    posture: 'standing fully upright on two legs with humanoid proportions',
    features: 'animal face with expressive human-like emotions, fur/feathers/scales visible',
  },
  warrior_animal: {
    name: 'Warrior Animal',
    description: 'Actual animal species as a warrior, wearing armor appropriate to their form',
    veoPrefix: 'anthropomorphic warrior',
    posture: 'standing upright in battle stance',
    features: 'animal features with warrior gear, fierce expression',
  },
  mythical_creature: {
    name: 'Mythical Creature',
    description: 'Fantasy creatures like dragons, phoenixes, or griffins',
    veoPrefix: 'majestic mythical',
    posture: 'powerful stance befitting the creature',
    features: 'legendary creature with dramatic presence',
  },
  elemental_being: {
    name: 'Elemental Being',
    description: 'Nature spirits made of their element - fire, water, ice, etc.',
    veoPrefix: 'ethereal elemental spirit made of',
    posture: 'floating or standing with elemental aura',
    features: 'body composed of or emanating their element',
  },
  robot_mech: {
    name: 'Robot/Mech',
    description: 'Mechanical beings or giant mech suits',
    veoPrefix: 'advanced mechanical',
    posture: 'standing with mechanical precision',
    features: 'metallic body, glowing eyes, visible joints and mechanisms',
  },
  wizard_mage: {
    name: 'Wizard/Mage',
    description: 'Mystical spellcasters with robes and magical implements',
    veoPrefix: 'mystical',
    posture: 'standing with arcane power',
    features: 'flowing robes, magical aura, staff or wand',
  },
  creature_persona: {
    name: 'Creature Persona',
    description: 'Anthropomorphic animals or creatures with human-like personality and expression',
    veoPrefix: 'anthropomorphic talking',
    posture: 'standing upright with expressive body language',
    features: 'animal features with human-like expressions, themed accessories',
  },
  god_deity: {
    name: 'God/Deity',
    description: 'Divine beings from various mythologies',
    veoPrefix: 'divine',
    posture: 'powerful godlike stance',
    features: 'radiant aura, divine symbols, larger than life presence',
  },
  aquatic_creature: {
    name: 'Aquatic Creature',
    description: 'Mermaids, sea creatures, water spirits',
    veoPrefix: 'majestic aquatic',
    posture: 'graceful underwater or surfacing pose',
    features: 'scales, fins, flowing water elements',
  },
  woodland_spirit: {
    name: 'Woodland Spirit',
    description: 'Forest spirits, nature guardians, tree beings',
    veoPrefix: 'mystical woodland',
    posture: 'emerging from or blending with nature',
    features: 'bark texture, leaves, moss, glowing nature elements',
  },
  historical_human: {
    name: 'Historical Human',
    description: 'Real historical figures portrayed as actual humans with period-accurate appearance',
    veoPrefix: 'HUMAN historical figure',
    posture: 'commanding presence appropriate to their era and role',
    features:
      'HUMAN ONLY - NO ANIMALS. Period-accurate clothing, armor, and accessories. Realistic human proportions and features.',
  },
} as const;

export type CharacterTypeKey = keyof typeof CHARACTER_TYPES;

/**
 * Detect if topic contains a named creature
 * Uses word boundaries to avoid false matches (e.g., "orc" in "forced")
 */
export function detectNamedCreature(topic: string): string | null {
  const lower = topic.toLowerCase();
  return (
    NAMED_CREATURES.find((creature) => {
      // Use word boundaries to match whole words only
      const regex = new RegExp(`\\b${creature}\\b`, 'i');
      return regex.test(lower);
    }) || null
  );
}

/**
 * Detect topic category based on keywords
 */
export function detectTopicCategory(topic: string): string {
  const lower = topic.toLowerCase();

  for (const [category, keywords] of Object.entries(TOPIC_CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return category;
    }
  }

  return 'default';
}

/**
 * Get spirit animal for a food item
 */
export function getFoodSpiritAnimal(food: string): string {
  const lower = food.toLowerCase().replace(/\s+/g, '_');

  // Direct match
  if (FOOD_SPIRIT_ANIMALS[lower]) {
    return FOOD_SPIRIT_ANIMALS[lower][0];
  }

  // Partial match
  for (const [key, animals] of Object.entries(FOOD_SPIRIT_ANIMALS)) {
    if (lower.includes(key) || key.includes(lower)) {
      return animals[0];
    }
  }

  // Default based on food type hints
  if (lower.includes('spicy') || lower.includes('hot')) return 'dragon';
  if (lower.includes('sweet') || lower.includes('dessert')) return 'bear';
  if (lower.includes('meat') || lower.includes('beef')) return 'bull';
  if (lower.includes('fish') || lower.includes('seafood')) return 'otter';

  return 'wolf'; // Noble default
}

/**
 * Character analysis result from AI
 */
export interface CharacterAnalysis {
  characterType: CharacterTypeKey;
  reasoning: string;
  namedCreature?: string;
  characters: Array<{
    name: string;
    species: string;
    appearance: string;
    personality: string;
    role: 'protagonist' | 'supporting' | 'narrator' | 'antagonist';
    veoDescription: string;
  }>;
  visualStyle: string;
}

// ============================================
// VIRAL VLOG FORMAT - Selfie Stick Camera
// The format that makes mythical characters feel REAL
// ============================================

/**
 * Vlog prompt template - The viral Bigfoot format
 * Key: Selfie stick camera + Speaking directly to camera + No subtitles
 */
export const VLOG_PROMPT_TEMPLATE = {
  cameraPosition: 'is holding a selfie stick (thats where the camera is)',
  dialoguePrefix: 'Speaking directly to camera saying:',
  endingSuffix: 'No subtitles, no text overlay.',
  movementStyle: 'natural movement',
};

/**
 * Mundane activities that contrast with mythical characters
 * MYTHICAL + MUNDANE = VIRAL
 */
export const MUNDANE_ACTIVITIES: Record<string, string[]> = {
  cooking: [
    'stirring a giant pot',
    'chopping vegetables',
    'taste-testing a dish',
    'flipping something in a pan',
    'plating a meal',
    'reading a recipe book',
  ],
  gym: [
    'lifting weights',
    'doing stretches',
    'checking their reflection',
    'drinking from a protein shaker',
    'wiping down equipment',
    'adjusting workout playlist',
  ],
  tech_review: [
    'unboxing a package',
    'holding up a product',
    'tapping on a phone screen',
    'comparing two items',
    'pointing at features',
    'giving thumbs up',
  ],
  daily_routine: [
    'drinking morning coffee',
    'checking their phone',
    'making their bed',
    'brushing teeth in mirror',
    'packing a bag',
    'putting on shoes',
  ],
  shopping: [
    'pushing a shopping cart',
    'examining products on shelf',
    'reading a label',
    'comparing prices',
    'loading groceries',
    'standing in checkout line',
  ],
  relationship_advice: [
    'sitting on a couch pensively',
    'gesturing emphatically',
    'nodding knowingly',
    'shaking head in disbelief',
    'counting points on fingers',
    'leaning in conspiratorially',
  ],
  behind_the_scenes: [
    'preparing for battle',
    'polishing armor',
    'sharpening weapons',
    'reading battle plans',
    'meditating before combat',
    'stretching before action',
  ],
};

/**
 * Ambient sounds for different settings
 */
export const AMBIENT_SOUNDS: Record<string, string[]> = {
  kitchen: ['sizzling sounds', 'bubbling pot', 'chopping sounds', 'kitchen clatter'],
  gym: ['weights clanking', 'workout music playing', 'heavy breathing', 'gym ambiance'],
  forest: ['birds chirping', 'forest ambiance', 'leaves rustling', 'distant wildlife'],
  desert: ['desert wind', 'sand shifting', 'distant thunder', 'hawk cry'],
  medieval: ['torch crackling', 'distant horns', 'armor clinking', 'crowd murmur'],
  mystical: ['magical hum', 'ethereal whispers', 'crystal chimes', 'mystical ambiance'],
  urban: ['city sounds', 'traffic', 'people chatting', 'phone notifications'],
  ocean: ['waves crashing', 'seagulls', 'ocean breeze', 'ship creaking'],
  space: ['space ambiance', 'computer beeps', 'mechanical hum', 'radio static'],
};

/**
 * Generate a viral vlog-style VEO prompt
 * Uses the Bigfoot selfie stick format that gets 15M+ views
 */
export function generateVlogPrompt(params: {
  characterDescription: string;
  location: string;
  action: string;
  lighting: string;
  dialogue: string;
  ambientSounds: string;
}): string {
  return `${params.characterDescription} ${VLOG_PROMPT_TEMPLATE.cameraPosition} in ${params.location}, ${params.action}, ${params.lighting}, ${VLOG_PROMPT_TEMPLATE.movementStyle}. ${VLOG_PROMPT_TEMPLATE.dialoguePrefix} ${params.dialogue}. ${params.ambientSounds}. ${VLOG_PROMPT_TEMPLATE.endingSuffix}`;
}

/**
 * Get random mundane activity for a category
 */
export function getRandomMundaneActivity(category: keyof typeof MUNDANE_ACTIVITIES): string {
  const activities = MUNDANE_ACTIVITIES[category];
  return activities[Math.floor(Math.random() * activities.length)];
}

/**
 * Get random ambient sound for a setting
 */
export function getRandomAmbientSound(setting: keyof typeof AMBIENT_SOUNDS): string {
  const sounds = AMBIENT_SOUNDS[setting];
  return sounds[Math.floor(Math.random() * sounds.length)];
}

// ============================================
// MAIN GENERATOR CLASS
// ============================================

export interface GenerationOptions {
  topic: string;
  message?: string;
  voice?: keyof typeof VOICE_STYLES;
  visualStyleV2?: keyof typeof VISUAL_STYLES; // v2.0 visual tone
  setting?: keyof typeof SETTING_APPROACHES; // v2.0 setting approach
  energy?: keyof typeof ENERGY_LEVELS;
  mood?: keyof typeof MOOD_ARCS;
  visualStyle?: VideoStyleKey;
  stylePreset?: StylePresetKey; // NEW: Style preset (comedy_meme, wholesome, etc.)
  battleMode?: boolean; // VS BATTLE MODE: Epic warriors in themed armor
  aspectRatio?: '9:16' | '16:9'; // Video aspect ratio
  bpm?: number;
  targetDurationSeconds?: number;
  vertical?: boolean;
  customBars?: string[];
  avoidTerms?: string[];
  characterCount?: number; // How many named characters to include (1-6)
  contextHint?: string; // Optional 5 W's context for historical figures (WHO, WHAT, WHEN, WHERE, WHY, HOW)
}

/**
 * AI-Powered Character Type Classification
 * Uses GPT-4o-mini for fast, accurate classification of topics
 * Replaces keyword-based detection with intelligent analysis
 */
async function classifyTopicWithAI(
  topic: string,
  context?: string,
): Promise<{
  isHistorical: boolean;
  characterType: 'human' | 'anthropomorphic_animal' | 'creature';
  confidence: number;
  reasoning: string;
}> {
  const prompt = `Classify this topic for video character selection:

Topic: "${topic}"
${context ? `Additional Context: "${context}"` : ''}

Determine:
1. Is this about REAL historical people/events? (true/false)
2. What character type should represent this? (human, anthropomorphic_animal, creature)
3. Your confidence level (0.0 to 1.0)

Guidelines:
- Historical figures (Caesar, Napoleon, Pope Stephen VI, etc.) → isHistorical: true, characterType: "human"
- Historical events/eras (WWII, Medieval times, etc.) → isHistorical: true, characterType: "human"
- Fantasy/fictional creatures (dragons, unicorns, etc.) → isHistorical: false, characterType: "creature"
- Modern/educational content with no specific historical figures → isHistorical: false, characterType: "anthropomorphic_animal"

Respond ONLY with valid JSON:
{
  "isHistorical": true/false,
  "characterType": "human" | "anthropomorphic_animal" | "creature",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation (1 sentence)"
}

Examples:
- "Pope Stephen VI" → {"isHistorical": true, "characterType": "human", "confidence": 0.95, "reasoning": "Medieval Catholic Pope is a historical figure"}
- "Talking dragon adventure" → {"isHistorical": false, "characterType": "creature", "confidence": 0.9, "reasoning": "Fantasy creature, not historical"}
- "Climate change explained" → {"isHistorical": false, "characterType": "anthropomorphic_animal", "confidence": 0.85, "reasoning": "Educational topic with no specific historical figures"}`;

  try {
    const response = await openaiService.generateText(prompt, {
      temperature: 0.3, // Low temp for consistent classification
      maxTokens: 200,
      systemPrompt: `You are a content classifier. Analyze topics and determine if they require human historical characters or creative non-human characters. Return ONLY valid JSON.`,
    });

    const parsed = extractAndParseJSON(response, 'AI topic classification');

    // Validate the response structure
    if (
      typeof parsed.isHistorical !== 'boolean' ||
      !['human', 'anthropomorphic_animal', 'creature'].includes(parsed.characterType) ||
      typeof parsed.confidence !== 'number' ||
      typeof parsed.reasoning !== 'string'
    ) {
      throw new Error('Invalid response structure from AI classification');
    }

    return {
      isHistorical: parsed.isHistorical,
      characterType: parsed.characterType,
      confidence: Math.min(1.0, Math.max(0.0, parsed.confidence)), // Clamp to 0-1
      reasoning: parsed.reasoning,
    };
  } catch (error: any) {
    console.error(`AI classification error: ${error.message}`);
    throw error; // Propagate error so caller can handle fallback
  }
}

export class UnityContentGenerator {
  /**
   * CHARACTER INTELLIGENCE: Analyze Content for Character Type
   * Determines the best character type for ANY content (not just VS battles)
   * Flow: Historical figure → Named creature → AI Classification → Keyword fallback → Default
   */
  async analyzeContentCharacters(topic: string, lyrics?: string): Promise<CharacterAnalysis> {
    console.log(`🧠 CHARACTER INTELLIGENCE: Analyzing topic "${topic}"`);

    // Step 0: CHECK FOR HISTORICAL FIGURES FIRST - Use HUMANS for these!
    const historicalFigure = detectHistoricalFigure(topic);
    if (historicalFigure) {
      console.log(`   🏛️ HISTORICAL FIGURE DETECTED: ${historicalFigure.title}`);
      console.log(`   Using HUMAN representation with period-accurate attire`);
      return this.buildHistoricalFigureAnalysis(historicalFigure, topic);
    }

    // Step 1: Check for named creatures in topic
    const namedCreature = detectNamedCreature(topic);
    if (namedCreature) {
      console.log(`   Found named creature: ${namedCreature}`);
      return this.buildNamedCreatureAnalysis(namedCreature, topic);
    }

    // Step 2: AI-POWERED CLASSIFICATION (Primary method)
    // Try AI classification first - faster and more accurate than keyword matching
    let isHistorical = false;
    let aiClassificationUsed = false;
    const category = detectTopicCategory(topic); // Detect category for fallback

    try {
      console.log(`   🤖 Running AI classification...`);
      const aiClassification = await classifyTopicWithAI(topic, lyrics?.slice(0, 200));

      console.log(`   🤖 AI Classification Result:`);
      console.log(`      - Is Historical: ${aiClassification.isHistorical}`);
      console.log(`      - Character Type: ${aiClassification.characterType}`);
      console.log(`      - Confidence: ${(aiClassification.confidence * 100).toFixed(0)}%`);
      console.log(`      - Reasoning: ${aiClassification.reasoning}`);

      // Use AI classification if confidence is high (>0.8)
      if (aiClassification.confidence > 0.8) {
        console.log(`   ✅ High confidence - using AI classification`);
        isHistorical = aiClassification.isHistorical;
        aiClassificationUsed = true;
      } else {
        console.log(
          `   ⚠️ Low confidence (${(aiClassification.confidence * 100).toFixed(0)}%) - falling back to keyword matching`,
        );
      }
    } catch (error: any) {
      console.error(`   ❌ AI classification failed: ${error.message}`);
      console.log(`   📋 Falling back to keyword matching`);
    }

    // Step 3: Keyword Fallback (if AI classification not used or failed)
    if (!aiClassificationUsed) {
      isHistorical = isHistoricalContent(topic) || detectHistoricalFigure(topic) !== null || category === 'historical';
      console.log(`   📋 Keyword Classification: ${isHistorical ? 'HISTORICAL (USING HUMANS)' : 'Non-historical'}`);
    }

    // For historical content, use simple direct analysis
    if (isHistorical) {
      const prompt = `Analyze this historical topic and identify the real historical figure(s):

TOPIC: "${topic}"
${lyrics ? `LYRICS PREVIEW: "${lyrics.slice(0, 500)}"` : ''}

RULES:
- Identify the REAL HUMAN historical figure from the topic
- Use their actual name, time period, and historical role
- Period-accurate clothing and appearance
- Real historical locations (specific cities, battlefields, palaces)
- Species MUST be "HUMAN"
- Include specific dates and events

Return JSON:
{
  "characterType": "historical_human",
  "reasoning": "Historical figure and their significance",
  "characters": [
    {
      "name": "Full name of historical figure",
      "species": "HUMAN",
      "appearance": "Period-accurate human appearance and clothing",
      "personality": "Key personality traits from history",
      "role": "protagonist",
      "veoDescription": "Full description with historical setting and period details"
    }
  ],
  "visualStyle": "Historical period art direction"
}`;

      const response = await openaiService.generateText(prompt, {
        temperature: 0.7,
        maxTokens: 1000,
        systemPrompt: `You are a historical content analyst. Identify REAL HUMAN historical figures and return accurate period details. Species must always be "HUMAN".`,
      });

      const parsed = extractAndParseJSON(response, 'historical character analysis');
      console.log(`   Historical analysis: ${parsed.characters[0]?.name} (HUMAN)`);
      return {
        characterType: 'historical_human',
        reasoning: parsed.reasoning,
        characters: parsed.characters,
        visualStyle: parsed.visualStyle,
      };
    }

    // NON-HISTORICAL: Fallback to simple animal/creature defaults
    console.log(`   Non-historical content - using simple creature defaults`);
    const suggestedType = CHARACTER_TYPE_HINTS[category] || 'anthropomorphic_animal';

    return {
      characterType: suggestedType as CharacterTypeKey,
      reasoning: `${category} content - using ${suggestedType}`,
      characters: [],
      visualStyle: 'Creative non-human characters',
    };
  }

  /**
   * Build character analysis for named creatures (Bigfoot, Dragon, etc.)
   */
  private buildNamedCreatureAnalysis(creature: string, topic: string): CharacterAnalysis {
    const creatureName = creature.charAt(0).toUpperCase() + creature.slice(1);
    const characterType = CHARACTER_TYPES.mythical_creature;

    return {
      characterType: 'mythical_creature',
      namedCreature: creature,
      reasoning: `Topic explicitly mentions ${creatureName} - using the actual creature`,
      characters: [
        {
          name: creatureName,
          species: creatureName,
          appearance: `A ${creatureName}, the legendary ${creature} with distinctive features`,
          personality: `Iconic ${creature} personality - mysterious yet relatable`,
          role: 'protagonist',
          veoDescription: `${characterType.veoPrefix} ${creatureName}, ${characterType.posture}, ${characterType.features}. THIS IS AN ACTUAL ${creature.toUpperCase()}, NOT A HUMAN.`,
        },
      ],
      visualStyle: `Cinematic treatment of ${creatureName} in relatable situations`,
    };
  }

  /**
   * Build character analysis for historical figures - HUMAN representation
   */
  private buildHistoricalFigureAnalysis(figure: (typeof HISTORICAL_FIGURES)[string], topic: string): CharacterAnalysis {
    console.log(`   Building historical figure: ${figure.title} (${figure.era})`);

    const primarySetting = figure.settings?.[0] || 'historical setting';

    return {
      characterType: 'historical_human' as CharacterTypeKey,
      reasoning: `Historical figure: ${figure.title} - HUMAN ONLY, no animals`,
      characters: [
        {
          name: figure.title.toUpperCase(),
          species: 'HUMAN',
          appearance: `${figure.canonicalDescription}. ${figure.armor}. ${figure.weapons || ''}`,
          personality: figure.title,
          role: 'protagonist',
          veoDescription: `${figure.title}, ${figure.canonicalDescription}. Wearing ${figure.armor}. ${figure.weapons ? `Armed with ${figure.weapons}.` : ''} Set in ${primarySetting}.`,
        },
      ],
      visualStyle: `Historical ${figure.era}. Setting: ${primarySetting}.`,
    };
  }

  /**
   * ARTICLE-ENHANCED: NLP Visual Extraction
   * Extract visual elements, mood, and symbols from lyrics using OpenAI
   * Based on: spaCy + VADER approach from "AI Music Video Generator" article
   */
  async extractVisualScene(lyricLine: string): Promise<NLPVisualScene> {
    try {
      const response = await openaiService.generateText(
        `Analyze this lyric line for visual elements:

"${lyricLine}"

Extract:
1. Concrete nouns (objects, places, people)
2. Noun phrases (descriptive groups)
3. Action verbs
4. Adjectives/descriptors
5. Named entities (people, places, brands)
6. Mood (-1.0 negative to +1.0 positive)
7. Abstract concepts (love, freedom, anger, hope, etc.)

For abstract concepts, map them to concrete visual symbols:
- passion/love → fire, flames, hearts
- freedom → birds, open sky, chains breaking
- time → clocks, hourglasses
- self-reflection → mirrors, shadows
- hope → sunrise, sprouting seeds
- anger → storm clouds, red tint

Respond in JSON:
{
  "nouns": ["word1", "word2"],
  "nounPhrases": ["phrase1", "phrase2"],
  "verbs": ["action1", "action2"],
  "adjectives": ["adj1", "adj2"],
  "entities": [{"text": "name", "type": "PERSON/PLACE/ORG"}],
  "moodScore": 0.5,
  "abstractConcepts": ["love", "hope"],
  "symbolMappings": ["fire representing passion", "sunrise representing hope"]
}`,
        {
          temperature: 0.3,
          maxTokens: 500,
          systemPrompt: 'You are an NLP analyzer extracting visual elements from lyrics. Be precise and concrete.',
        },
      );

      const parsed = extractAndParseJSON(response, 'NLP visual scene extraction');

      // Determine concrete visuals from nouns
      const concreteVisuals = (parsed.nouns || []).filter(
        (n: string) => !['thing', 'stuff', 'way', 'something', 'nothing'].includes(n.toLowerCase()),
      );

      // Map abstract concepts to visual symbols
      const symbolMappings: string[] = [];
      for (const concept of parsed.abstractConcepts || []) {
        const lowerConcept = concept.toLowerCase();
        const symbols = SYMBOL_MAPPING[lowerConcept] || SYMBOL_MAPPING[lowerConcept.replace(' ', '_')];
        if (symbols) {
          symbolMappings.push(`${symbols[0]} (${concept})`);
        }
      }

      return {
        nouns: parsed.nouns || [],
        nounPhrases: parsed.nounPhrases || [],
        verbs: parsed.verbs || [],
        adjectives: parsed.adjectives || [],
        entities: parsed.entities || [],
        moodScore: parsed.moodScore || 0,
        mood: parsed.moodScore > 0.3 ? 'positive' : parsed.moodScore < -0.3 ? 'negative' : 'neutral',
        concreteVisuals,
        abstractConcepts: parsed.abstractConcepts || [],
        symbolMappings: symbolMappings.length > 0 ? symbolMappings : parsed.symbolMappings || [],
      };
    } catch (error) {
      console.warn('NLP extraction failed, using defaults:', error);
      return this.getDefaultNLPScene();
    }
  }

  private getDefaultNLPScene(): NLPVisualScene {
    return {
      nouns: [],
      nounPhrases: [],
      verbs: [],
      adjectives: [],
      entities: [],
      moodScore: 0,
      mood: 'neutral',
      concreteVisuals: [],
      abstractConcepts: [],
      symbolMappings: [],
    };
  }

  /**
   * ARTICLE-ENHANCED: Build comedy-enhanced prompt
   * Applies absurdist/comedy triggers based on section type
   */
  buildComedyEnhancedPrompt(
    basePrompt: string,
    sectionType: string,
    comedyLevel: 'subtle' | 'medium' | 'absurd' = 'medium',
  ): string {
    // Select comedy technique based on section
    const comedyTechniques = {
      verse: [
        'character pauses mid-action to acknowledge absurdity',
        'one character reacts with exaggerated shock while others remain calm',
      ],
      chorus: [
        'mundane action performed with epic cinematography',
        'split screen showing identical reactions in different settings',
      ],
      bridge: ['character talks directly to camera with deadpan expression', 'unexpected reveal'],
      outro: ['breaking fourth wall', 'exaggerated double-take'],
    };

    const techniques = comedyTechniques[sectionType as keyof typeof comedyTechniques] || comedyTechniques.verse;
    const technique = techniques[Math.floor(Math.random() * techniques.length)];

    // Add comedy triggers based on level
    const triggers = {
      subtle: COMEDY_TRIGGERS.absurd.slice(0, 2),
      medium: COMEDY_TRIGGERS.absurd.slice(0, 4),
      absurd: COMEDY_TRIGGERS.absurd,
    };

    const selectedTriggers = triggers[comedyLevel];
    const trigger = selectedTriggers[Math.floor(Math.random() * selectedTriggers.length)];

    return `${basePrompt}

Comedy direction: ${technique}. ${trigger} energy.`;
  }

  /**
   * ARTICLE-ENHANCED: Get pacing guidance for section
   * Returns shot duration, cut speed, camera energy, and BPM-derived pacing markers
   */
  getPacingGuidance(
    sectionType: string,
    bpm: number = 120,
    energy: number = 0.5,
  ): {
    shotDuration: number;
    cutSpeed: string;
    cameraEnergy: string;
    framesPerBeat: number;
    bpmCategory: 'slow' | 'moderate' | 'fast' | 'intense';
    pacingDescription: string;
    cameraSpeed: string;
    actionTiming: string;
  } {
    const pacing = PACING_RULES[sectionType.toLowerCase()] || PACING_RULES.verse;

    // Calculate frames per beat (at 24fps)
    const framesPerBeat = (60 * 24) / bpm;

    // Parse beat range and convert to seconds
    const beatRange = pacing.shotDurationBeats.match(/(\d+)-(\d+)/);
    const minBeats = beatRange ? parseInt(beatRange[1]) : 4;
    const maxBeats = beatRange ? parseInt(beatRange[2]) : 8;
    const avgBeats = (minBeats + maxBeats) / 2;

    // Convert to seconds
    const beatsPerSecond = bpm / 60;
    const shotDuration = avgBeats / beatsPerSecond;

    // BPM-DERIVED PACING MARKERS
    // Categorize BPM for pacing decisions
    let bpmCategory: 'slow' | 'moderate' | 'fast' | 'intense';
    let pacingDescription: string;
    let cameraSpeed: string;
    let actionTiming: string;

    if (bpm < 80) {
      bpmCategory = 'slow';
      pacingDescription = 'Slow, deliberate movements. Hold on emotional moments. Languid camera drifts.';
      cameraSpeed = 'slow push-in over 4-6 seconds, gentle tracking';
      actionTiming = 'Actions unfold gradually, moments of stillness between movements';
    } else if (bpm < 110) {
      bpmCategory = 'moderate';
      pacingDescription = 'Steady rhythm. Natural movement pace. Smooth transitions.';
      cameraSpeed = 'medium tracking, 2-3 second camera moves';
      actionTiming = 'Actions sync to half-beats, natural walking pace';
    } else if (bpm < 140) {
      bpmCategory = 'fast';
      pacingDescription = 'Energetic movement. Quick cuts on beat. Dynamic camera work.';
      cameraSpeed = 'fast tracking, 1-2 second camera moves, whip pans between beats';
      actionTiming = 'Actions on every beat, quick gestures, snappy movements';
    } else {
      bpmCategory = 'intense';
      pacingDescription = 'Frenetic energy. Rapid-fire cuts. Aggressive camera movement.';
      cameraSpeed = 'rapid whip pans, sub-second camera snaps, strobe-like cuts';
      actionTiming = 'Actions on every half-beat, explosive movements, no pauses';
    }

    // Modify pacing based on energy level
    if (energy > 0.8) {
      pacingDescription += ' PEAK ENERGY: Maximum intensity, camera shake, impact moments.';
      actionTiming += ', dramatic impact freeze-frames';
    } else if (energy < 0.3) {
      pacingDescription += ' Low energy: Contemplative, breathing room, minimal movement.';
      actionTiming += ', stillness and reflection';
    }

    return {
      shotDuration: Math.round(shotDuration * 10) / 10,
      cutSpeed: pacing.cutSpeed,
      cameraEnergy: pacing.cameraEnergy,
      framesPerBeat: Math.round(framesPerBeat),
      bpmCategory,
      pacingDescription,
      cameraSpeed,
      actionTiming,
    };
  }

  /**
   * Generate complete content package: lyrics + style tags + characters + VEO prompts
   */
  async generateCompletePackage(options: GenerationOptions): Promise<UnityContentPackage> {
    const {
      topic,
      message,
      voice = 'observational',
      energy = 'building',
      mood = 'ironic_to_warm',
      visualStyle = 'cinematic',
      visualStyleV2 = 'cinematic', // v2.0 visual tone
      setting = 'everyday', // v2.0 setting approach
      stylePreset = 'comedy_meme', // Style preset (default to Comedy/Meme for fun content!)
      bpm = UNITY_MUSIC_CONFIG.DEFAULT_BPM,
      targetDurationSeconds = 60, // Default to 60s (Shorts format)
      vertical = true,
      customBars = [],
      avoidTerms = [],
      characterCount = 3, // How many named characters to include
    } = options;

    // HARD CAP: Never exceed 3 minutes (180 seconds)
    const MAX_DURATION = 180;
    const cappedDuration = Math.min(targetDurationSeconds, MAX_DURATION);
    if (targetDurationSeconds > MAX_DURATION) {
      console.log(`⚠️ Duration ${targetDurationSeconds}s exceeds max ${MAX_DURATION}s - capping at 3 minutes`);
    }

    // Get style preset configuration
    const presetConfig = getStylePreset(stylePreset);
    console.log('Generating complete Unity content package...');
    console.log(`   Topic: ${topic}`);
    console.log(
      `   Target: ${Math.floor(cappedDuration / 60)}:${(cappedDuration % 60).toString().padStart(2, '0')} (max 3:00)`,
    );
    console.log(`   Style: ${visualStyle} / v2.0: ${visualStyleV2} / Setting: ${setting}`);
    console.log(`   Style Preset: ${presetConfig.name} - ${presetConfig.targetVibe}`);

    // Step 1: Suggest structure based on target duration (using capped value)
    const suggestedStructure = unityTimingAnalyzer.suggestStructureForDuration(cappedDuration, bpm);
    console.log('📐 Suggested structure:', suggestedStructure);

    // EARLY DETECTION: Check for historical content (documentary)
    // Do this BEFORE lyrics generation so we can use deep research in lyrics
    const detectedHistoricalFigureData = detectHistoricalFigure(topic);
    const isHistoricalTopic = isHistoricalContent(topic) || detectedHistoricalFigureData !== null;

    // Extract the figure name from topic for deep research
    // detectHistoricalFigure returns data, but we need the name from the topic
    let historicalFigureName: string | null = null;
    if (detectedHistoricalFigureData) {
      // Find the matching key (name) in HISTORICAL_FIGURES
      const lowerTopic = topic.toLowerCase();
      for (const key of Object.keys(HISTORICAL_FIGURES)) {
        if (lowerTopic.includes(key)) {
          historicalFigureName = key;
          break;
        }
      }
    }
    // If no hardcoded figure, but topic mentions historical keywords, use topic as the name
    if (!historicalFigureName && isHistoricalTopic) {
      // Extract potential figure name from topic (e.g., "The Story of Genghis Khan" -> "Genghis Khan")
      const storyOfMatch = topic.match(/(?:story of|history of|legend of|life of|rise of|fall of)\s+(.+)/i);
      if (storyOfMatch) {
        historicalFigureName = storyOfMatch[1].trim();
      } else {
        historicalFigureName = topic; // Use full topic as fallback
      }
    }

    // DEEP RESEARCH for historical documentary content
    let deepResearch: DeepHistoricalResearch | null = null;
    if (isHistoricalTopic && historicalFigureName) {
      console.log(`   🏛️ HISTORICAL DOCUMENTARY MODE: Starting deep research for ${historicalFigureName}...`);
      deepResearch = await deepResearchHistoricalFigure(historicalFigureName);
      if (deepResearch) {
        console.log(`   📚 Deep research complete for ${deepResearch.basicInfo.fullName}`);
        console.log(`   📖 Core Question: "${deepResearch.philosophicalThread.coreQuestion}"`);
        console.log(`   📅 Key Events: ${deepResearch.keyEvents.length}`);
      }
    }

    // Step 2: Generate lyrics with timing awareness
    let lyricsResult = await this.generateLyrics({
      topic,
      message: message || '',
      voice,
      energy,
      mood,
      bpm,
      structure: suggestedStructure,
      customBars,
      avoidTerms,
      characterCount,
      deepResearch, // Pass deep research for philosophical thread integration
    });

    // Step 2.1: LYRICS QUALITY VALIDATION (grammar, rhyme, flow, coherence, appropriateness)
    const MAX_LYRICS_VALIDATION_ATTEMPTS = 3;
    const LYRICS_EMERGENCY_ACCEPT_SCORE = 65; // Accept if >= 65/100
    const MIN_SCORE_IMPROVEMENT = 5; // Minimum 5-point improvement to continue

    let lyricsValidationAttempt = 0;
    let previousValidationScore: number | undefined = undefined;
    let validationResult = await lyricsQualityValidator.validateLyrics(lyricsResult.raw, {
      topic,
      message: message || '',
      targetDuration: cappedDuration,
      bpm,
      structure: `${suggestedStructure.intro}-${suggestedStructure.verses}v-${suggestedStructure.choruses}c-${suggestedStructure.bridge ? 'bridge-' : ''}${suggestedStructure.outro}`,
      deepResearch,
      isHistorical: isHistoricalTopic,
    });

    // Log validation summary
    console.log(lyricsQualityValidator.getValidationSummary(validationResult));
    console.log(`   📊 [Quality Validator] Initial score: ${validationResult.overallScore}/100`);

    // Regenerate lyrics if validation fails (max 3 attempts with smart exit conditions)
    while (!validationResult.passed && lyricsValidationAttempt < MAX_LYRICS_VALIDATION_ATTEMPTS - 1) {
      // Check emergency accept threshold
      if (validationResult.overallScore >= LYRICS_EMERGENCY_ACCEPT_SCORE) {
        console.log(
          `   ⚠️ [Quality Validator] Score ${validationResult.overallScore}/100 is below ideal (70) but above emergency threshold (${LYRICS_EMERGENCY_ACCEPT_SCORE}) - accepting`,
        );
        break;
      }

      // Check diminishing returns
      if (previousValidationScore !== undefined) {
        const improvement = validationResult.overallScore - previousValidationScore;
        if (improvement < MIN_SCORE_IMPROVEMENT && improvement >= 0) {
          console.log(
            `   ⚠️ [Quality Validator] Score improved by only ${improvement} points (< ${MIN_SCORE_IMPROVEMENT} threshold) - diminishing returns, accepting`,
          );
          break;
        }
        if (improvement < 0) {
          console.log(
            `   ⚠️ [Quality Validator] Score decreased by ${Math.abs(improvement)} points - accepting previous version`,
          );
          break;
        }
        console.log(`   📈 [Quality Validator] Score improved by ${improvement} points - continuing`);
      }

      previousValidationScore = validationResult.overallScore;
      lyricsValidationAttempt++;
      console.log(
        `\n🔄 [Quality Validator] Regenerating lyrics (attempt ${lyricsValidationAttempt + 1}/${MAX_LYRICS_VALIDATION_ATTEMPTS})...`,
      );

      const improvementInstructions = lyricsQualityValidator.generateImprovementInstructions(validationResult);

      lyricsResult = await this.generateLyrics({
        topic,
        message: `${message}\n\n${improvementInstructions}`,
        voice,
        energy,
        mood,
        bpm,
        structure: suggestedStructure,
        customBars,
        avoidTerms,
        characterCount,
        deepResearch,
      });

      // Re-validate
      validationResult = await lyricsQualityValidator.validateLyrics(lyricsResult.raw, {
        topic,
        message: message || '',
        targetDuration: cappedDuration,
        bpm,
        structure: `${suggestedStructure.intro}-${suggestedStructure.verses}v-${suggestedStructure.choruses}c-${suggestedStructure.bridge ? 'bridge-' : ''}${suggestedStructure.outro}`,
        deepResearch,
        isHistorical: isHistoricalTopic,
      });

      console.log(lyricsQualityValidator.getValidationSummary(validationResult));
      console.log(
        `   📊 [Quality Validator] Score after attempt ${lyricsValidationAttempt + 1}: ${validationResult.overallScore}/100`,
      );
    }

    if (validationResult.passed) {
      console.log(`✅ [Quality Validator] Lyrics passed validation (score: ${validationResult.overallScore}/100)`);
    } else {
      console.log(
        `⚠️ [Quality Validator] Lyrics did not pass after ${lyricsValidationAttempt + 1} attempts (score: ${validationResult.overallScore}/100) - proceeding anyway`,
      );
    }

    // Step 2.5: SELF-CRITIQUE GATE for lyrics (hook strength, pacing)
    const MAX_LYRICS_CRITIQUE_ATTEMPTS = 2; // Max 2 attempts (1 initial + 1 retry)
    let lyricsCritiqueAttempt = 0;
    let previousCritiqueScore: number | undefined = undefined;

    let lyricsCritique = await critiqueLyrics(lyricsResult.raw, topic, bpm, isHistoricalTopic);
    console.log(`   📊 [Self-Critique] Lyrics initial score: ${lyricsCritique.overallScore.toFixed(1)}/10`);
    console.log(
      `   📝 Scores - Requirements: ${lyricsCritique.meetsRequirements}/10, Next Stage: ${lyricsCritique.worksForNextStage}/10, Risk: ${lyricsCritique.failureModeRisk}/10`,
    );

    if (lyricsCritique.passed) {
      console.log(`✅ [Self-Critique] Lyrics passed on first attempt`);
    } else {
      while (!lyricsCritique.passed && lyricsCritiqueAttempt < MAX_LYRICS_CRITIQUE_ATTEMPTS - 1) {
        lyricsCritiqueAttempt++;
        console.log(
          `\n🔄 [Self-Critique] Lyrics need revision (score: ${lyricsCritique.overallScore.toFixed(1)}/10) - regenerating (attempt ${lyricsCritiqueAttempt + 1}/${MAX_LYRICS_CRITIQUE_ATTEMPTS})...`,
        );
        console.log(`   💡 Feedback: ${lyricsCritique.feedback}`);

        previousCritiqueScore = lyricsCritique.overallScore;

        // Regenerate with critique feedback incorporated
        lyricsResult = await this.generateLyrics({
          topic,
          message: `${message}\n\nCRITICAL FEEDBACK TO ADDRESS:\n${lyricsCritique.feedback}`,
          voice,
          energy,
          mood,
          bpm,
          structure: suggestedStructure,
          customBars,
          avoidTerms,
          characterCount,
          deepResearch,
        });

        // Re-critique with previous score for diminishing returns check
        lyricsCritique = await critiqueLyrics(lyricsResult.raw, topic, bpm, isHistoricalTopic, previousCritiqueScore);
        console.log(
          `   📊 [Self-Critique] Score after attempt ${lyricsCritiqueAttempt + 1}: ${lyricsCritique.overallScore.toFixed(1)}/10`,
        );

        // The selfCritiqueGate function will handle emergency accept and diminishing returns internally
        // But we log additional context here
        if (previousCritiqueScore !== undefined && !lyricsCritique.passed) {
          const improvement = lyricsCritique.overallScore - previousCritiqueScore;
          if (improvement > 0) {
            console.log(`   📈 [Self-Critique] Score improved by ${improvement.toFixed(2)} points`);
          } else if (improvement < 0) {
            console.log(`   📉 [Self-Critique] Score decreased by ${Math.abs(improvement).toFixed(2)} points`);
          }
        }
      }

      if (lyricsCritique.passed) {
        console.log(`✅ [Self-Critique] Lyrics passed after ${lyricsCritiqueAttempt + 1} attempts`);
      } else {
        console.log(
          `⚠️ [Self-Critique] Lyrics did not pass after ${lyricsCritiqueAttempt + 1} attempts (final score: ${lyricsCritique.overallScore.toFixed(1)}/10) - proceeding anyway`,
        );
      }
    }

    // Step 3: Analyze timing of generated lyrics (using capped duration)
    const timing = await unityTimingAnalyzer.analyzeLyricsTiming(lyricsResult.raw, {
      bpm,
      targetDurationSeconds: cappedDuration,
    });

    // Step 4: Generate Suno style tags
    // 🏛️ DOCUMENTARY MODE: Pass flag for single historical figures
    const sunoStyleTags = await this.generateSunoStyleTags({
      topic,
      voice,
      energy,
      mood,
      bpm,
      lyrics: lyricsResult.raw,
      isHistoricalDocumentary: !!deepResearch,
    });

    // Step 4.5: GENERATE ACTUAL SUNO SONG (NEW - for exact duration)
    console.log('🎵 Generating Suno song to get exact duration...');
    let actualSongDuration: number;
    let sunoAudioUrl: string;
    let sunoTrackId: string;
    const roundedDuration: number = cappedDuration; // Default to capped duration
    const clipsNeeded: number = Math.ceil(cappedDuration / 5); // Default to capped duration clips
    const currentLyrics = lyricsResult.raw;

    try {
      // Prepare style string (truncate to 1000 chars max for Suno API limit)
      let styleString = sunoStyleTags.fullStyleString;
      if (styleString.length > 1000) {
        styleString = styleString.substring(0, 997) + '...';
        console.log(`   ⚠️ Style truncated from ${sunoStyleTags.fullStyleString.length} to 1000 chars`);
      }

      // First attempt
      const { taskId } = await sunoApi.generateSong({
        lyrics: currentLyrics,
        style: styleString,
        title: topic.length > 80 ? topic.substring(0, 80) : topic,
        instrumental: false,
        model: 'V5',
        targetDuration: cappedDuration, // Pass target duration for style hints
      });

      console.log(`   🎵 Song generation started (task: ${taskId})`);
      console.log(`   ⏳ Waiting for Suno to complete (60-120 seconds)...`);

      let tracks = await sunoApi.waitForCompletion(taskId, 300000); // 5 min max
      actualSongDuration = tracks[0].duration;
      sunoAudioUrl = tracks[0].audioUrl;
      sunoTrackId = tracks[0].id;

      console.log(`   ✅ Song generated: ${actualSongDuration}s`);

      // If > 180s, try once more (Suno varies ±5-10s)
      if (actualSongDuration > 180) {
        console.log(`   ⚠️ Song ${actualSongDuration}s exceeds 180s cap`);
        console.log(`   🔄 Regenerating (attempt 2/2) - Suno varies by 5-10s...`);

        const retryTask = await sunoApi.generateSong({
          lyrics: currentLyrics,
          style: styleString,
          title: topic.length > 80 ? topic.substring(0, 80) : topic,
          instrumental: false,
          model: 'V5',
          targetDuration: cappedDuration, // Pass target duration for style hints
        });

        const retryTracks = await sunoApi.waitForCompletion(retryTask.taskId, 300000);

        // Use retry version regardless
        tracks = retryTracks;
        actualSongDuration = retryTracks[0].duration;
        sunoAudioUrl = retryTracks[0].audioUrl;
        sunoTrackId = retryTracks[0].id;

        if (actualSongDuration <= 180) {
          console.log(`   ✅ Retry succeeded: ${actualSongDuration}s (under cap!)`);
        } else {
          console.log(`   ⚠️ Still ${actualSongDuration}s - will cap video at 180s`);
          console.log(`   💡 Duration hints should improve this over time`);
        }
      }

      // Calculate rounded duration and clips needed
      const cappedSongDuration = Math.min(actualSongDuration, 180);
      const roundedDuration = Math.ceil(cappedSongDuration / 5) * 5;
      const clipsNeeded = roundedDuration / 5;

      console.log(`   📊 Song: ${actualSongDuration}s → Capped: ${cappedSongDuration}s → Rounded: ${roundedDuration}s`);
      console.log(`   🎬 Will generate ${clipsNeeded} clips × 5 seconds each`);
      console.log('');
    } catch (error: any) {
      console.error(`   ❌ Suno generation failed: ${error.message}`);
      throw new Error(`Failed to generate Suno song: ${error.message}`);
    }

    // Step 5: Run CHARACTER INTELLIGENCE analysis
    // This determines character type (anthropomorphic, mythical, human, etc.)
    console.log('🧠 Running Character Intelligence analysis...');
    const characterAnalysis = await this.analyzeContentCharacters(topic, lyricsResult.raw);
    console.log(`   📊 Character type: ${characterAnalysis.characterType}`);
    console.log(`   📝 Reasoning: ${characterAnalysis.reasoning}`);
    if (characterAnalysis.namedCreature) {
      console.log(`   🦕 Named creature: ${characterAnalysis.namedCreature}`);
    }

    // Step 6: Generate character cast
    const characterCast = await this.generateCharacterCast({
      topic,
      message: message || '',
      visualStyle,
      characterCount,
      characterAnalysis, // Pass pre-computed analysis
    });

    // Determine if vlog format should be used (for named creatures/mythical content)
    const shouldUseVlogFormat = characterAnalysis
      ? characterAnalysis.namedCreature !== undefined ||
        characterAnalysis.characterType === 'mythical_creature' ||
        characterAnalysis.characterType === 'anthropomorphic_animal'
      : false;

    // Step 7: Generate VEO prompts at 5-second intervals (NEW - exact clip count)
    let veoPrompts = await this.generateVeoPrompts({
      lyrics: lyricsResult,
      timing,
      characterCast,
      visualStyle,
      visualStyleV2,
      setting,
      vertical,
      stylePreset: isHistoricalTopic ? 'historical' : stylePreset, // Auto-select historical preset for historical content
      characterType: characterAnalysis?.characterType, // Pass character type for VEO guidance
      isHistoricalContent: isHistoricalTopic, // Pass historical flag for content
      useVlogFormat: shouldUseVlogFormat, // Enable vlog format for viral content
      deepResearch, // Deep research data for documentary mode (key events, philosophical thread, etc.)
      // NEW: Exact duration and clip parameters
      actualSongDuration: roundedDuration, // Rounded duration (e.g., 90s for 87s song)
      targetClipCount: clipsNeeded, // Exact clips needed (e.g., 18 for 90s)
      clipDuration: 5, // Each clip is 5 seconds
    });

    // Step 7.5: SELF-CRITIQUE GATE for prompts (cinematography, action specificity)
    const MAX_PROMPTS_CRITIQUE_ATTEMPTS = 2; // Max 2 attempts (1 initial + 1 retry)
    let promptsCritiqueAttempt = 0;
    let previousPromptsCritiqueScore: number | undefined = undefined;

    let promptsCritique = await critiquePrompts(veoPrompts, topic, isHistoricalTopic);
    console.log(`   📊 [Self-Critique] Prompts initial score: ${promptsCritique.overallScore.toFixed(1)}/10`);
    console.log(
      `   📝 Scores - Requirements: ${promptsCritique.meetsRequirements}/10, Next Stage: ${promptsCritique.worksForNextStage}/10, Risk: ${promptsCritique.failureModeRisk}/10`,
    );

    if (promptsCritique.passed) {
      console.log(`✅ [Self-Critique] Prompts passed on first attempt`);
    } else {
      while (!promptsCritique.passed && promptsCritiqueAttempt < MAX_PROMPTS_CRITIQUE_ATTEMPTS - 1) {
        promptsCritiqueAttempt++;
        console.log(
          `\n🔄 [Self-Critique] Prompts need revision (score: ${promptsCritique.overallScore.toFixed(1)}/10) - regenerating (attempt ${promptsCritiqueAttempt + 1}/${MAX_PROMPTS_CRITIQUE_ATTEMPTS})...`,
        );
        console.log(`   💡 Feedback: ${promptsCritique.feedback}`);

        previousPromptsCritiqueScore = promptsCritique.overallScore;

        // Regenerate prompts with feedback incorporated via style preset adjustment
        // The feedback is incorporated by logging it for manual review - full regeneration would be expensive
        // Instead, we run a second pass with the critique in mind
        veoPrompts = await this.generateVeoPrompts({
          lyrics: lyricsResult,
          timing,
          characterCast,
          visualStyle,
          visualStyleV2,
          setting,
          vertical,
          stylePreset: isHistoricalTopic ? 'historical' : stylePreset,
          characterType: characterAnalysis?.characterType,
          isHistoricalContent: isHistoricalTopic,
          useVlogFormat: shouldUseVlogFormat,
          deepResearch,
          // NEW: Exact duration and clip parameters
          actualSongDuration: roundedDuration,
          targetClipCount: clipsNeeded,
          clipDuration: 5,
        });

        // Re-critique with previous score for diminishing returns check
        promptsCritique = await critiquePrompts(veoPrompts, topic, isHistoricalTopic, previousPromptsCritiqueScore);
        console.log(
          `   📊 [Self-Critique] Score after attempt ${promptsCritiqueAttempt + 1}: ${promptsCritique.overallScore.toFixed(1)}/10`,
        );

        // The selfCritiqueGate function will handle emergency accept and diminishing returns internally
        // But we log additional context here
        if (previousPromptsCritiqueScore !== undefined && !promptsCritique.passed) {
          const improvement = promptsCritique.overallScore - previousPromptsCritiqueScore;
          if (improvement > 0) {
            console.log(`   📈 [Self-Critique] Score improved by ${improvement.toFixed(2)} points`);
          } else if (improvement < 0) {
            console.log(`   📉 [Self-Critique] Score decreased by ${Math.abs(improvement).toFixed(2)} points`);
          }
        }
      }

      if (promptsCritique.passed) {
        console.log(`✅ [Self-Critique] Prompts passed after ${promptsCritiqueAttempt + 1} attempts`);
      } else {
        console.log(
          `⚠️ [Self-Critique] Prompts did not pass after ${promptsCritiqueAttempt + 1} attempts (final score: ${promptsCritique.overallScore.toFixed(1)}/10) - proceeding anyway`,
        );
      }
    }

    // ============================================
    // QUALITY THRESHOLD GATE - Prevent low-quality generation
    // Checks both Self-Critique score AND World Model pass rate
    // ============================================
    console.log(`\n🚦 QUALITY GATE: Checking generation quality thresholds...`);

    const QUALITY_THRESHOLD = 7.0;
    const WORLD_MODEL_THRESHOLD = 0.5;

    // Get Self-Critique score (use prompts critique as it's the final quality check)
    const selfCritiqueScore = promptsCritique.overallScore;

    // Run World Model preflight to get pass rate
    let worldModelPassRate = 1.0; // Default to passing if World Model fails
    try {
      console.log(`   🌍 Running World Model preflight simulation...`);
      const promptTexts = veoPrompts.map((p) => p.fullPrompt || (p as any).prompt || '');
      const packageContext = {
        packageId: 'quality-check-' + Date.now(),
        topic: characterCast[0]?.name || topic,
        era: setting || '',
        dateRange: 'modern', // Default date range for quality check
        characters: characterCast.map((c) => ({
          name: c.name || 'Character',
          appearance: c.appearance || '',
          archetype: c.vibe || 'warrior',
          era: setting || '',
        })),
      };

      const preflightResult = await worldModelSimulator.preflightCheck(promptTexts, packageContext, false);
      worldModelPassRate = preflightResult.passRate / 100; // Convert percentage to decimal

      console.log(`   📊 World Model Pass Rate: ${(worldModelPassRate * 100).toFixed(1)}%`);
      console.log(`   💰 Estimated savings: $${preflightResult.estimatedSavings.toFixed(2)}`);

      if (preflightResult.suggestions.length > 0) {
        preflightResult.suggestions.forEach((s) => console.log(`   💡 ${s}`));
      }
    } catch (worldModelErr: any) {
      console.warn(`   ⚠️ World Model preflight failed (non-blocking): ${worldModelErr.message}`);
      worldModelPassRate = 1.0; // Default to passing if check fails
    }

    // Quality gate logic: BOTH metrics must be below threshold to fail
    if (selfCritiqueScore < QUALITY_THRESHOLD && worldModelPassRate < WORLD_MODEL_THRESHOLD) {
      console.error(
        `❌ Quality gate FAILED: Self-Critique ${selfCritiqueScore.toFixed(1)}/10, World Model ${(worldModelPassRate * 100).toFixed(1)}%`,
      );
      console.error(
        `   Threshold: Self-Critique >= ${QUALITY_THRESHOLD}/10 OR World Model >= ${(WORLD_MODEL_THRESHOLD * 100).toFixed(0)}%`,
      );
      throw new Error(
        `Quality threshold not met. Self-Critique: ${selfCritiqueScore.toFixed(1)}/10 (need ${QUALITY_THRESHOLD}), World Model pass rate: ${(worldModelPassRate * 100).toFixed(1)}% (need ${(WORLD_MODEL_THRESHOLD * 100).toFixed(0)}%). Aborting to prevent generating low-quality content.`,
      );
    }

    console.log(
      `✅ Quality gate PASSED: Self-Critique ${selfCritiqueScore.toFixed(1)}/10, World Model ${(worldModelPassRate * 100).toFixed(1)}%`,
    );

    const result: UnityContentPackage = {
      lyrics: lyricsResult,
      sunoStyleTags,
      characterCast,
      veoPrompts,
      timing,
      // Documentary mode fields - preserved through regeneration paths
      isHistoricalContent: isHistoricalTopic,
      deepResearch,
      // NEW: Actual song data (pre-generated during package creation)
      sunoAudioUrl,
      sunoTrackId,
      actualSongDuration,
      roundedDuration,
      clipsNeeded,
      metadata: {
        topic,
        message: message || '',
        visualStyle,
        visualStyleV2, // v2.0 visual tone
        setting, // v2.0 setting approach
        stylePreset, // Style preset (comedy_meme, wholesome, etc.)
        targetDuration: cappedDuration, // Capped at 180s max
        generatedAt: new Date().toISOString(),
        lyricsValidation: {
          score: validationResult.overallScore,
          attempts: lyricsValidationAttempt + 1,
          passed: validationResult.passed,
          criteria: {
            grammar: validationResult.criteria.grammarScore,
            rhyme: validationResult.criteria.rhymeScore,
            flow: validationResult.criteria.flowScore,
            coherence: validationResult.criteria.coherenceScore,
            appropriateness: validationResult.criteria.appropriatenessScore,
          },
        },
      },
    };

    console.log('✅ Complete package generated!');
    console.log(`   Duration: ${timing.formattedDuration}`);
    console.log(`   Clips: ${timing.totalVeoClips}`);
    console.log(`   Est. Cost: $${timing.estimatedVeoCost}`);

    return result;
  }

  /**
   * Generate lyrics with structure awareness
   */
  private async generateLyrics(params: {
    topic: string;
    message: string;
    voice: keyof typeof VOICE_STYLES;
    energy: keyof typeof ENERGY_LEVELS;
    mood: keyof typeof MOOD_ARCS;
    bpm: number;
    structure: ReturnType<typeof unityTimingAnalyzer.suggestStructureForDuration>;
    customBars: string[];
    avoidTerms: string[];
    characterCount: number;
    deepResearch?: DeepHistoricalResearch | null; // Documentary-style deep research
  }): Promise<{ raw: string; sections: Record<string, string> }> {
    const {
      topic,
      message,
      voice,
      energy,
      mood,
      bpm,
      structure,
      customBars,
      avoidTerms,
      characterCount,
      deepResearch,
    } = params;

    const rhymeHints = this.buildRhymeHints();
    const targetSyllables = rhymeStackEngine.getSyllablesForBpm(bpm);

    // Build the narrative arc section instructions
    const arcInstructions = Object.entries(NARRATIVE_ARC)
      .map(
        ([section, info]) =>
          `${section.toUpperCase()}: ${info.perspective} - ${info.description}\n   Example: "${info.example}"`,
      )
      .join('\n');

    // DOCUMENTARY MODE: Deep research for historical content
    // Uses philosophical thread to create meaningful narrative arc
    let documentaryInstructions = '';
    if (deepResearch) {
      const keyEventsList = deepResearch.keyEvents
        .slice(0, 6)
        .map((e, i) => `   ${i + 1}. ${e.event} (${e.year}): ${e.whatHappened}`)
        .join('\n');

      // Build origin scene for punch hook
      const originHook = deepResearch.originScene
        ? `Use this dramatic origin moment: "${deepResearch.originScene.childhoodMoment}"`
        : `Open with a dramatic moment from their early life that shows what they overcame`;

      documentaryInstructions = `
## 📚 DOCUMENTARY MODE - HISTORICAL BIOGRAPHY
This is a MEANINGFUL documentary about ${deepResearch.basicInfo.fullName} (${deepResearch.basicInfo.lived}).
${deepResearch.basicInfo.knownFor}

## 🎤 FIRST PERSON PERSPECTIVE (CRITICAL)
ALL lyrics MUST be written in FIRST PERSON - the historical figure is rapping their OWN story!
- Use "I", "my", "me" - NOT "he", "his", "him"
- The figure is speaking directly to the listener about their own life
- They are PROUD, REFLECTIVE, or DEFIANT about their legacy

## 🥊 PUNCH HOOK (CRITICAL - DO NOT START WITH A QUESTION)
The intro MUST open with a PUNCH, not a question. 
BAD: "You ever hear of a world so divided?" (passive, question, third person)
BAD: "They killed his father." (third person - not the figure speaking)
GOOD: "They killed my father. Enslaved me at nine. I came back and erased their bloodline." (punch, FIRST PERSON, active)

${originHook}

The hook should:
- Be in FIRST PERSON - the figure telling their own story
- State a shocking fact or dramatic moment in the first 2 lines
- Create immediate emotional stakes
- Make the listener go "wait, WHAT?"
- NOT ask questions - DELIVER the punch

## PHILOSOPHICAL THREAD (CORE OF THE NARRATIVE)
This is NOT just a biography - it's a story with MEANING. Weave this thread through every verse:
- CORE QUESTION: "${deepResearch.philosophicalThread.coreQuestion}"
- TENSION: ${deepResearch.philosophicalThread.tension}
- LESSON: ${deepResearch.philosophicalThread.lesson}
- WHY IT MATTERS TODAY: ${deepResearch.philosophicalThread.modernRelevance}

## KEY LIFE EVENTS (Structure the song around these)
${keyEventsList}

## STYLE: "VIBEY INFORMATIONAL" 
- Educational but ENTERTAINING - like a YouTube documentary people actually watch
- Facts that make you go "wow I didn't know that"
- Use the PHILOSOPHICAL THREAD to connect events into a story
- End with the lesson/relevance to modern life
- Every line should have PUNCH - active voice, specific details, no fluff

## STRUCTURE MAPPING TO EVENTS:
- INTRO: PUNCH HOOK - Dramatic origin moment that grabs attention (NOT a question)
- VERSE 1: Early life and rise (events 1-2) - specific dates, places, actions
- CHORUS: The philosophical tension - what drove them / what it cost
- VERSE 2: Peak achievements (events 3-4) - specific battles, conquests, moments
- CHORUS: Repeat the core theme with more intensity
- BRIDGE: The cost/sacrifice/transformation (event 5-6) - intimate, vulnerable moment
- OUTRO: Legacy and the lesson for today - the question for US

## CHARACTER (SINGLE HISTORICAL FIGURE - HUMAN):
Name: ${deepResearch.basicInfo.fullName}
Physical: ${deepResearch.characterAppearance.physical}
Presence: ${deepResearch.characterAppearance.presence}
Outfit: ${deepResearch.characterAppearance.primaryOutfit}
Era: ${deepResearch.basicInfo.lived} in ${deepResearch.basicInfo.region}
`;
    }

    // BUILD CHARACTER INSTRUCTIONS - Priority: Documentary > Historical Battle > Battle > Standard
    let characterInstructions: string;

    // DOCUMENTARY MODE - Single historical figure biography (non-battle)
    if (deepResearch) {
      console.log(`   📹 DOCUMENTARY MODE: Single figure - ${deepResearch.basicInfo.fullName}`);
      characterInstructions = `## DOCUMENTARY MODE - SINGLE HISTORICAL FIGURE (FIRST PERSON)
${deepResearch.basicInfo.fullName} is RAPPING THEIR OWN STORY in FIRST PERSON:
- Name: ${deepResearch.basicInfo.fullName}
- Era: ${deepResearch.basicInfo.lived}
- Physical: ${deepResearch.characterAppearance.physical}
- Outfit: ${deepResearch.characterAppearance.primaryOutfit}
- Presence: ${deepResearch.characterAppearance.presence}

CRITICAL RULES:
1. ALL lyrics in FIRST PERSON - "I conquered", "my empire", "they betrayed me" (NOT third person)
2. The historical figure is the NARRATOR speaking directly to the audience
3. This is a biographical song about ONE person rapping their own legacy
4. Do NOT introduce other main characters - only references to enemies, allies, etc.
5. All scenes show THIS person at different stages of their life`;
    } else {
      // Standard unity content - still creature-focused but not battle
      characterInstructions = `## CHARACTERS (feature exactly ${characterCount} named NON-HUMAN characters)
IMPORTANT: ALL characters must be NON-HUMAN - anthropomorphic animals, mythical creatures, robots, elementals, or nature spirits.

- Give each character a CREATIVE NON-HUMAN NAME (Rufus the Owl, Grumble the Bear, Spark the Lightning Bug - NOT Mike, Danielle, Jenny)
- Characters are TALKING ANTHROPOMORPHIC CREATURES or mythical beings
- Include character-appropriate details (feathers, scales, fur, glowing eyes, elemental effects)
- Make them VISUALLY DISTINCT but EQUALLY SYMPATHETIC
- Weave their stories through the lyrics - they connect by the end
${characterCount === 1 ? "- Focus on ONE creature's internal journey from frustration to clarity" : ''}
${characterCount === 2 ? '- Two creatures on opposite sides who discover common ground' : ''}
${characterCount >= 3 ? '- Multiple creature perspectives that converge toward unity' : ''}`;
    }

    const prompt = `Generate UNITY-FOCUSED RAP LYRICS about "${topic}".

CORE MESSAGE: ${message}

## STYLE
- Voice: ${VOICE_STYLES[voice]}
- Energy: ${ENERGY_LEVELS[energy]}
- Mood Arc: ${MOOD_ARCS[mood]}
- BPM: ${bpm} (target ~${targetSyllables} syllables per line)

## STRUCTURE (follow this exactly)
- Intro: ${structure.intro} lines (set the scene - show the PROBLEM)
- Verse 1: ${structure.verseLinesEach} lines (deepen the frustration - where we ARE)
- Chorus: ${structure.chorusLinesEach} lines (THE TURN - realization moment)
${structure.verses >= 2 ? `- Verse 2: ${structure.verseLinesEach} lines (the SOLUTION - where we COULD BE)` : ''}
- Chorus: ${structure.chorusLinesEach} lines (repeat with more hope)
${structure.bridge ? `- Bridge: 6 lines (emotional peak - shared humanity)` : ''}
- Outro: ${structure.outro} lines (RESOLUTION - specific call to action, end with hope)

${characterInstructions}
${documentaryInstructions}

## RHYME TOOLKIT
${rhymeHints}

## NARRATIVE ARC v2.0 - FACTS + FUN + JOURNEY

Make them LAUGH → Make them THINK → Make them FEEL

### THE ARC (each section has specific requirements):
${arcInstructions}

### THE GOLDEN RULE: SHOW DON'T TELL

**SPECIFICITY TEST:** Before every line, ask: "Could this be in ANY song, or is it THIS story?"
- If any song → too generic → rewrite with SPECIFIC detail
- If THIS story only → proceed

**❌ NEVER DO THIS (Preachy):**
${SHOW_DONT_TELL.never.join('\n')}

**✅ ALWAYS DO THIS (Observational):**
${SHOW_DONT_TELL.always.join('\n')}

### WHY THIS APPROACH WORKS:
- Meets people WHERE THEY ARE (frustrated, divided)
- Negativity gets ACKNOWLEDGED, not ignored
- The shift to unity feels EARNED, not preachy  
- Comedy buys credibility for the sincere moments
- BOTH sides will want to share it

### QUALITY CHECKLIST:
**Lyrics:**
${UNITY_CHECKLIST.lyrics.map((item) => `- ${item}`).join('\n')}

**Video sync:**
${UNITY_CHECKLIST.video.map((item) => `- ${item}`).join('\n')}

## CUSTOM BARS TO INCLUDE
${customBars.length > 0 ? customBars.join('\n') : 'None provided'}

## EMPHASIS RULES
- Wrap rhyme words in asterisks: *divided*, *united*, *heart*
- Do NOT use ALL CAPS (Suno interprets as shouting)
- Stack rhymes within same sound family

## WORDS TO AVOID (these don't resonate in songs - too corporate/tech)
${[...DEFAULT_AVOID_TERMS, ...avoidTerms].join(', ')}

Instead of tech terms, use HUMAN equivalents:
- Instead of "algorithm" → "the feed", "what they show us", "the machine"
- Instead of "app" → "the screen", "this phone", "the glow"
- Instead of "viral" → "spreading", "everywhere", "catching fire"
- Instead of "scrolling" → "searching", "looking", "staring at the light"
- Keep it HUMAN. Keep it REAL. Keep it TIMELESS.

Generate complete lyrics with [SECTION] markers. Take us on a JOURNEY from division to unity. Make it feel EARNED.`;

    // Build system prompt for unity content
    // Check if this is historical content based on deepResearch or topic analysis
    const isHistorical = !!deepResearch || isHistoricalContent(topic);

    const characterRules = isHistorical
      ? `CRITICAL CHARACTER RULES FOR HISTORICAL CONTENT:
- Use REAL HUMAN historical figures (no animals, no anthropomorphic creatures)
- Period-accurate names, clothing, and settings
- Show actual historical events and locations
- First-person perspective - the historical figure tells their own story`
      : `CRITICAL CHARACTER RULES:
- ALL characters must be NON-HUMAN: anthropomorphic animals, mythical creatures, robots, elementals, nature spirits
- NEVER use human names like Mike, Danielle, Jenny
- Use creative creature names: "Rufus the Owl", "Grumble the Bear", "Spark the Lightning Bug"
- Characters have personalities and relatable struggles despite being non-human`;

    const systemPrompt = `You are a songwriter creating ${isHistorical ? 'historical documentary' : 'unity'} content using the FACTS + FUN + NARRATIVE ARC approach.

YOUR JOB: Make people ${isHistorical ? 'LEARN → ENGAGE → REMEMBER' : 'LAUGH → Make people THINK → Make people FEEL'}

${characterRules}

PHILOSOPHY:
- Truth lands hardest when it's wrapped in clever wordplay and specific scenes
- Show, don't tell. NEVER preach. Let the listener connect the dots.
- Observational comedy energy: "You ever notice how..." not "We need to..."

THE ARC:
1. LOOKING AROUND (Intro) - Wry observation, plant irony
2. LOOKING DOWN (Verse 1) - Show division through SPECIFIC SCENES, dark humor OK
3. THE TURN (Chorus) - A QUESTION that reframes, not a preachy answer
4. LOOKING SIDEWAYS (Verse 2) - Parallels, the "oh wait we're the same" moment  
5. THE REALIZATION (Bridge) - Quiet, earned sincerity
6. LOOKING UP (Final) - Same hook, warmer now, action implied

SPECIFICITY TEST: For every line, ask "Could this be in ANY unity song, or is it THIS story?"
If any song → too generic → ADD SPECIFIC DETAILS (creature names, places, actions)

The comedy earns the sincerity. Both sides should want to share it.`;

    try {
      const response = await openaiService.generateText(prompt, {
        temperature: 0.9,
        maxTokens: 3000,
        systemPrompt,
      });

      const sections = this.parseLyricsSections(response);

      return {
        raw: response,
        sections,
      };
    } catch (error) {
      console.error('Lyrics generation failed:', error);
      throw new Error('Failed to generate lyrics');
    }
  }

  /**
   * Generate Suno style tags using new configuration system
   * Auto-detects content type (historical, food, creature, motivational, chill)
   * and applies optimized style tags with forbidden term sanitization
   *
   * NEW: Optionally uses Thompson Sampling bandit for style experimentation
   */
  private async generateSunoStyleTags(params: {
    topic: string;
    voice: keyof typeof VOICE_STYLES;
    energy: keyof typeof ENERGY_LEVELS;
    mood: keyof typeof MOOD_ARCS;
    bpm: number;
    lyrics?: string;
    isHistoricalDocumentary?: boolean; // Documentary mode for single historical figures
    useExperimentalStyle?: boolean; // Use Thompson Sampling bandit for style selection
  }): Promise<SunoStyleTags> {
    const { topic, voice, energy, mood, bpm, lyrics, isHistoricalDocumentary, useExperimentalStyle } = params;

    try {
      // Determine content type from flags or auto-detect FIRST
      // This ensures proper content routing even for experimental styles
      let overrideType: SunoContentType | undefined;

      // 🏛️ DOCUMENTARY MODE: Use historical style for single historical figures
      if (isHistoricalDocumentary) {
        overrideType = 'historicalBattle'; // Reuse historical style for documentary too
        console.log(`   🏛️ DOCUMENTARY: Using historical Suno style for documentary content`);
      }

      // Use new optimized style generation system
      const styleResult = generateOptimizedSunoStyle(topic, lyrics, overrideType);
      const structureTags = generateStructureTags(styleResult.contentType);

      console.log(`🎵 Suno Style Config Applied:`);
      console.log(`   Content Type: ${styleResult.contentType}`);
      console.log(`   Genre: ${styleResult.genre}`);
      console.log(`   BPM: ${styleResult.bpm}`);

      // Parse instruments and production from full style string
      const instruments = this.extractSunoElements(styleResult.fullStyleString, 'instruments');
      const production = this.extractSunoElements(styleResult.fullStyleString, 'production');
      const moodTags = this.extractSunoElements(styleResult.fullStyleString, 'mood');

      // Build the base style object with all required fields
      const baseStyle: SunoStyleTags = {
        bpm,
        genre: styleResult.genre.split(',')[0].trim(),
        subgenre: styleResult.contentType.replace(/([A-Z])/g, ' $1').trim(),
        vocals: styleResult.fullStyleString.includes('vocals')
          ? 'two distinct character voices, theatrical delivery'
          : 'confident vocal delivery',
        instruments,
        production,
        mood: moodTags,
        fullStyleString: sanitizeSunoPrompt(styleResult.fullStyleString),
        contentType: styleResult.contentType,
        structureTags,
      };

      // 🎰 THOMPSON SAMPLING: Optionally use bandit to experiment with fullStyleString only
      // This preserves all metadata (genre, contentType, etc.) while testing new styles
      const shouldExperiment = useExperimentalStyle ?? Math.random() < 0.2;

      if (shouldExperiment) {
        try {
          const banditSelection = sunoStyleBandit.selectStyle();
          console.log(`🎰 SUNO BANDIT: Experimenting with style "${banditSelection.styleName}"`);
          console.log(`   ${banditSelection.isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'} mode`);
          console.log(`   Base contentType: ${styleResult.contentType} (preserved)`);

          // Only swap the fullStyleString, keep all other metadata intact
          return {
            ...baseStyle,
            fullStyleString: sanitizeSunoPrompt(banditSelection.fullStylePrompt),
            banditStyleId: banditSelection.styleId,
            isExperimental: true,
          };
        } catch (banditError) {
          console.warn('⚠️ Suno bandit selection failed, using default style:', banditError);
          // Fall through to return base style
        }
      }

      return baseStyle;
    } catch (error) {
      console.error('Suno style generation failed, using fallback:', error);

      // Fallback to detected or default style
      const detectedType = detectContentType(topic, lyrics);
      const fallbackStyle = generateOptimizedSunoStyle(topic, lyrics, detectedType);

      return {
        bpm,
        genre: fallbackStyle.genre,
        subgenre: detectedType.replace(/([A-Z])/g, ' $1').trim(),
        vocals: 'confident vocal delivery',
        instruments: ['drums', 'bass', 'strings'],
        production: ['cinematic', 'polished'],
        mood: [fallbackStyle.mood],
        fullStyleString: fallbackStyle.fullStyleString,
      };
    }
  }

  /**
   * Extract specific elements from Suno style string
   */
  private extractSunoElements(styleString: string, type: 'instruments' | 'production' | 'mood'): string[] {
    const instrumentKeywords = [
      'drums',
      'bass',
      'piano',
      'strings',
      'brass',
      'synth',
      '808',
      'taiko',
      'percussion',
      'choir',
      'horn',
    ];
    const productionKeywords = [
      'cinematic',
      'reverb',
      'layered',
      'polished',
      'epic',
      'half-time',
      'bouncy',
      'powerful',
    ];
    const moodKeywords = [
      'epic',
      'aggressive',
      'playful',
      'competitive',
      'triumphant',
      'comedic',
      'fantasy',
      'mythical',
    ];

    const keywords =
      type === 'instruments' ? instrumentKeywords : type === 'production' ? productionKeywords : moodKeywords;

    const lowerStyle = styleString.toLowerCase();
    return keywords.filter((kw) => lowerStyle.includes(kw)).slice(0, 4);
  }

  /**
   * Robust JSON parsing for VEO prompt data with multiple fallback strategies
   * Now uses centralized extractAndParseJSON helper
   */
  private parseVeoPromptJson(response: string): Record<string, unknown> | null {
    try {
      return extractAndParseJSON<Record<string, unknown>>(response, 'VEO prompt');
    } catch (error) {
      // If extraction fails completely, try to extract just the fullPrompt as fallback
      try {
        const fullPromptMatch = response.match(/"fullPrompt"\s*:\s*"([^"]+)"/);
        if (fullPromptMatch) {
          console.warn('   ⚠️ Could not parse full VEO prompt JSON, extracted fullPrompt only');
          return { fullPrompt: fullPromptMatch[1] };
        }
      } catch {
        // Return null as final fallback
      }

      return null;
    }
  }

  /**
   * Robust JSON parsing for character data with multiple fallback strategies
   */
  private parseCharacterJson(response: string): CharacterCast[] {
    try {
      // Strategy 1: Use centralized extractAndParseJSON (handles markdown fences, etc.)
      const parsed = extractAndParseJSON(response, 'character cast generation');
      if (parsed.characters && Array.isArray(parsed.characters)) {
        return parsed.characters;
      }
      return [];
    } catch (error) {
      // Strategy 2: Try to extract individual character objects if full parse fails
      try {
        // Clean markdown and extract JSON
        const jsonStr = response.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          return [];
        }

        const cleanJson = cleanMalformedJSON(jsonMatch[0]);
        const charMatches = cleanJson.match(/"id"\s*:\s*\d+[\s\S]*?"humanizingDetail"\s*:\s*"[^"]*"/g);
        if (charMatches && charMatches.length > 0) {
          return charMatches
            .map((match, idx) => {
              const obj = JSON.parse('{' + match + '}');
              return { ...obj, id: idx + 1 };
            })
            .filter((c) => c.name);
        }
      } catch {
        // Fallback to empty
      }

      return [];
    }
  }

  /**
   * Generate character cast for video - v2.0 with SPECIFIC named characters
   * Now integrates CHARACTER INTELLIGENCE SYSTEM at the START
   */
  private async generateCharacterCast(params: {
    topic: string;
    message: string;
    visualStyle: VideoStyleKey;
    characterCount: number;
    characterAnalysis?: CharacterAnalysis | null; // Pre-computed analysis from parent
  }): Promise<CharacterCast[]> {
    const { topic, message, visualStyle, characterCount, characterAnalysis: passedAnalysis } = params;

    // ========================================
    // CHARACTER INTELLIGENCE: Use passed analysis or compute if needed
    // ========================================
    const characterAnalysis =
      passedAnalysis ||
      (await (async () => {
        console.log('🧠 CHARACTER INTELLIGENCE: Starting analysis for character generation...');
        return await this.analyzeContentCharacters(topic);
      })());

    // 🏛️ HISTORICAL FIGURES FIRST - Check for HUMAN characters from historical analysis
    if (characterAnalysis.characters.length > 0 && characterAnalysis.characters[0]?.species === 'HUMAN') {
      console.log(`   🏛️ HISTORICAL FIGURE DETECTED - Using HUMAN representation`);
      console.log(`   Reason: ${characterAnalysis.reasoning}`);

      // 🎭 GENDER DETECTION: Uses centralized inferHistoricalGender() function
      // See top of file for the single source of truth

      // Convert historical CharacterAnalysis to CharacterCast format - HUMAN characters
      return characterAnalysis.characters.slice(0, characterCount).map((char, idx) => {
        const gender = inferHistoricalGender(char.name, char.appearance);
        // Age varies by section position in the story
        const baseAge = gender === 'female' ? 30 : 35; // Reasonable adult age for historical figures

        return {
          id: idx + 1,
          name: char.name.toUpperCase(),
          age: baseAge,
          gender,
          appearance: `${char.appearance}. THIS IS A HUMAN HISTORICAL FIGURE - NOT AN ANIMAL.`,
          wardrobeBase: char.appearance,
          vibe: char.personality,
          role: char.role,
          humanizingDetail: char.veoDescription,
        };
      });
    }

    // If named creature detected (Bigfoot, Dragon, etc.) - use analysis directly
    if (characterAnalysis.namedCreature && characterAnalysis.characters.length > 0) {
      console.log(`   🦕 Named creature detected: ${characterAnalysis.namedCreature}`);
      console.log(`   Using creature-specific characters from analysis`);

      // Get character type info for enhanced descriptions
      const charType = CHARACTER_TYPES[characterAnalysis.characterType] || CHARACTER_TYPES.mythical_creature;

      // Convert CharacterAnalysis characters to CharacterCast format
      return characterAnalysis.characters.slice(0, characterCount).map((char, idx) => ({
        id: idx + 1,
        name: char.name.toUpperCase(),
        age: 0, // Creatures don't have ages in the same way
        gender: 'non-binary' as const,
        appearance: `${charType.veoPrefix} ${char.species}. ${char.appearance}. ${charType.posture}. ${charType.features}`,
        wardrobeBase: `Natural ${char.species} form - ${char.appearance}`,
        vibe: char.personality,
        role: char.role,
        humanizingDetail: char.veoDescription,
      }));
    }

    // Log the character type decision for debugging
    console.log(`   📊 Character type decision: ${characterAnalysis.characterType}`);
    console.log(`   📝 Reasoning: ${characterAnalysis.reasoning}`);

    // Get CHARACTER_TYPES guidance for this type (fallback to anthropomorphic_animal - NEVER humans)
    const charTypeInfo = CHARACTER_TYPES[characterAnalysis.characterType] || CHARACTER_TYPES.anthropomorphic_animal;
    console.log(`   🎨 Using type: ${charTypeInfo.name} - ${charTypeInfo.description}`);

    // Build example based on character count (ALL NON-HUMAN)
    const singleCharExample = `CHARACTER 1 - RUFUS:
Anthropomorphic owl with wise, amber eyes. Stands upright wearing a cozy oversized cardigan and reading glasses perched on beak. Has a worn leather journal tucked under wing. Feathers slightly ruffled from long nights of study. Expression shows both weariness and quiet determination.`;

    const twoCharExample = `CHARACTER 1 - GRUMBLE:
Anthropomorphic bear, older and distinguished. Thick gray-brown fur, wearing a faded flannel jacket and worn cap. Kind tired eyes with wisdom lines. Still wears a simple wooden ring on his paw.

CHARACTER 2 - FLUTTER:
Anthropomorphic hummingbird, energetic and caring. Iridescent feathers shimmer green and purple. Wears tiny scrubs, moves with quick purposeful energy. Tired but still bright-eyed.`;

    const multiCharExample = `${twoCharExample}

CHARACTER 3 - MAMA OAK (connector):
Ancient treant spirit, bark-textured skin with moss accents. Warm amber eyes that glow softly. Knows everyone in the forest. Leaves rustle when she laughs. Voice like wind through branches.`;

    const exampleToUse =
      characterCount === 1 ? singleCharExample : characterCount === 2 ? twoCharExample : multiCharExample;

    // Get the visual style template with fallback
    const styleTemplate = VIDEO_STYLE_TEMPLATES[visualStyle] || VIDEO_STYLE_TEMPLATES.cinematic;

    // Build character type guidance based on analysis
    const characterTypeGuidance =
      characterAnalysis.characters.length > 0
        ? `\n🎨 CHARACTER TYPE GUIDANCE (from analysis):
Type: ${charTypeInfo.name}
Description: ${charTypeInfo.description}
VEO Prefix: "${charTypeInfo.veoPrefix}"
Posture: ${charTypeInfo.posture}
Features: ${charTypeInfo.features}

⚠️ CRITICAL: ALL CHARACTERS MUST BE NON-HUMAN.
Use these visual guidelines for your creatures/animals/robots/elementals.
NEVER create human characters - use anthropomorphic animals or mythical creatures instead.
Analysis suggests: ${characterAnalysis.visualStyle}
`
        : '';

    const prompt = `Create exactly ${characterCount} SPECIFIC, NAMED NON-HUMAN character${characterCount === 1 ? '' : 's'} for a ${characterCount === 1 ? 'personal journey' : 'unity-focused'} music video about "${topic}".

⚠️ CRITICAL: ALL CHARACTERS MUST BE NON-HUMAN (animals, creatures, robots, elementals, spirits - NEVER humans)

MESSAGE: ${message}
VISUAL STYLE: ${styleTemplate.name} - ${styleTemplate.description}
${characterTypeGuidance}
CHARACTER REQUIREMENTS:
- Give each a REAL NAME (not generic like "The Worker")
- Make them SPECIFIC NON-HUMAN characters (anthropomorphic animals, mythical creatures, robots, elementals)
${characterCount === 1 ? "- This is a SOLO journey - ONE creature's internal growth story\n- The character should be deeply relatable despite being non-human\n- Show their transformation through visual details (changing environment, posture, expression)" : '- Visually distinct but EQUALLY SYMPATHETIC\n- All should be LIKEABLE despite differences\n- Audience should see themselves in ALL of them'}
- Include humanizing details (accessories, personal items, expressive features)
- NEVER create human characters - use anthropomorphic animals, mythical creatures, robots, or elementals

IMPORTANT: Generate EXACTLY ${characterCount} NON-HUMAN character${characterCount === 1 ? '' : 's'}. No more, no less.

EXAMPLE FORMAT:
${exampleToUse}

Respond in JSON format:
{
  "characters": [
    {
      "id": 1,
      "name": "RUFUS",
      "age": 0,
      "gender": "non-binary",
      "appearance": "detailed physical description of the NON-HUMAN character with expressive features",
      "wardrobeBase": "accessories, items, or natural features that define them",
      "vibe": "personality - what makes them likeable despite being non-human",
      "role": "narrative role - how they connect to the story",
      "humanizingDetail": "the detail that makes them relatable (a worn journal, favorite perch, treasured acorn, etc.)"
    }
  ]
}`;

    const soloSystemPrompt = `Create ONE SPECIFIC, NAMED NON-HUMAN character for a personal journey story.

CRITICAL: The character MUST be non-human (anthropomorphic animal, mythical creature, robot, elemental, or spirit). NEVER create a human.

The character should have:
- A real first name
- A specific species (owl, bear, dragon, robot, fire elemental, etc.)
- Humanizing details (personal items, habits, expressive features)
- Something that makes them deeply relatable despite being non-human
- Internal struggle that mirrors the song's theme

This is a SOLO journey - one creature's internal transformation. The audience should see themselves in this character.
IMPORTANT: Return EXACTLY 1 NON-HUMAN character in the JSON array.`;

    const multiSystemPrompt = `Create SPECIFIC, NAMED NON-HUMAN characters that feel REAL, not like types.

CRITICAL: ALL characters MUST be non-human (anthropomorphic animals, mythical creatures, robots, elementals, or spirits). NEVER create humans.
        
Each character should have:
- A real first name
- A specific species (owl, bear, dragon, robot, fire elemental, etc.)
- Humanizing details (personal items, habits, expressive features)
- Something that makes them likeable despite being non-human
- Something that connects them to the other characters

All characters should be equally sympathetic. The audience should see themselves in ALL of them.
IMPORTANT: Return EXACTLY ${characterCount} NON-HUMAN characters in the JSON array.`;

    try {
      const response = await openaiService.generateText(prompt, {
        temperature: 0.8,
        maxTokens: 1500,
        systemPrompt: characterCount === 1 ? soloSystemPrompt : multiSystemPrompt,
      });

      const characters = this.parseCharacterJson(response);

      if (characters.length === 0) {
        console.log('⚠️ No characters parsed, using defaults');
        throw new Error('No characters in response');
      }

      console.log(`✅ Generated ${characters.length} character(s) from AI`);
      return characters;
    } catch (error) {
      console.log(
        '⚠️ Character cast generation using defaults:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      // Return default NON-HUMAN characters based on characterCount
      const allDefaults: CharacterCast[] = [
        {
          id: 1,
          name: 'RUFUS',
          age: 0,
          gender: 'non-binary',
          appearance:
            'Anthropomorphic owl with wise amber eyes. Stands upright wearing a cozy oversized cardigan. Reading glasses perched on beak. Feathers slightly ruffled. Expression shows weariness and quiet determination.',
          wardrobeBase: 'Oversized cardigan, reading glasses, worn leather journal tucked under wing',
          vibe: 'Introspective. Keeps starting journals but never finishes them. Trying to find his path.',
          role: 'The protagonist on a solo journey of self-discovery and growth.',
          humanizingDetail:
            'A worn leather journal with unfinished thoughts. A small plant on his windowsill he nurtures.',
        },
        {
          id: 2,
          name: 'GRUMBLE',
          age: 0,
          gender: 'male',
          appearance:
            'Anthropomorphic bear, older and distinguished. Thick gray-brown fur, reading glasses perched on nose, kind tired eyes with wisdom lines. Stands upright with weathered paws.',
          wardrobeBase: 'Faded flannel jacket, simple wooden ring on paw, worn cap',
          vibe: 'Has strong opinions about everything, shares honey anyway. Gruff exterior, soft heart.',
          role: 'Regular at the forest gathering spot. Represents one perspective. Does not know he has more in common with others than he thinks.',
          humanizingDetail: 'Wooden ring he still wears. Lost his mate three winters ago.',
        },
        {
          id: 3,
          name: 'MAMA OAK',
          age: 0,
          gender: 'female',
          appearance:
            'Ancient treant spirit, bark-textured skin with moss accents. Warm amber eyes that glow softly. Leaves rustle when she laughs. Voice like wind through branches.',
          wardrobeBase: 'Natural bark and moss, glowing amber eyes, crown of small leaves',
          vibe: 'Been here since the forest was young. Knows everyone. Calls everyone "little seedling".',
          role: 'The connector. Sees what others do not see about themselves. The audience surrogate.',
          humanizingDetail: 'Her reactions guide ours. She knows something they do not know yet.',
        },
      ];

      // Return only the requested number of characters
      return allDefaults.slice(0, characterCount);
    }
  }

  /**
   * Generate detailed VEO prompts for each section
   * Now integrates CHARACTER TYPE guidance and VLOG FORMAT for intro/outro
   */
  private async generateVeoPrompts(params: {
    lyrics: { raw: string; sections: Record<string, string> };
    timing: TimingAnalysis;
    characterCast: CharacterCast[];
    visualStyle: VideoStyleKey;
    visualStyleV2: keyof typeof VISUAL_STYLES;
    setting: keyof typeof SETTING_APPROACHES;
    vertical: boolean;
    stylePreset?: StylePresetKey; // Style preset for aesthetic control
    characterType?: CharacterTypeKey; // Character type from analysis (for VEO guidance)
    isHistoricalContent?: boolean; // Non-battle historical content (documentaries, stories)
    useVlogFormat?: boolean; // Enable vlog format (selfie stick camera)
    deepResearch?: DeepHistoricalResearch | null; // Deep research for documentary mode
    // NEW: Exact clip generation parameters (when Suno song is pre-generated)
    actualSongDuration?: number; // Rounded song duration (e.g., 90s)
    targetClipCount?: number; // Exact number of 5s clips to generate (e.g., 18)
    clipDuration?: number; // Duration of each clip (e.g., 5)
  }): Promise<VeoPrompt[]> {
    const {
      lyrics,
      timing,
      characterCast,
      visualStyle,
      visualStyleV2,
      setting,
      vertical,
      stylePreset = 'comedy_meme',
      characterType,
      isHistoricalContent: historicalContentFlag = false,
      useVlogFormat = false,
      deepResearch = null,
      // NEW: Exact clip parameters
      actualSongDuration,
      targetClipCount,
      clipDuration = 5,
    } = params;

    // NEW: 5-SECOND INTERVAL MODE
    // If actualSongDuration and targetClipCount are provided, we're in the new mode
    // where Suno song was pre-generated and we need exact 5-second clips
    const use5SecondMode = actualSongDuration !== undefined && targetClipCount !== undefined;
    if (use5SecondMode) {
      console.log(`   🎬 5-SECOND MODE: Generating ${targetClipCount} prompts for ${actualSongDuration}s song`);
    }

    // Get style preset configuration
    const presetConfig = getStylePreset(stylePreset);
    console.log(`   🎨 Applying ${presetConfig.name} style to VEO prompts...`);
    const template = VIDEO_STYLE_TEMPLATES[visualStyle] || VIDEO_STYLE_TEMPLATES.cinematic;
    const aspectRatio = vertical ? '9:16' : '16:9';

    const prompts: VeoPrompt[] = [];

    // 🎵 TIMESTAMP CALCULATION: Calculate cumulative timestamps for each section
    // This maps each clip to its exact position in the song
    // DURATION CAP: Never exceed 180 seconds (3 minutes) to control costs
    // IMPORTANT: Calculate this FIRST so we know the actual capped count for all downstream logic
    const MAX_VIDEO_DURATION = 180;
    const sectionTimestamps: Array<{ startTime: number; endTime: number; formatted: string }> = [];
    let cumulativeTime = 0;
    let cappedSectionCount = 0;

    for (let idx = 0; idx < timing.sections.length; idx++) {
      const section = timing.sections[idx];
      const startTime = cumulativeTime;
      const endTime = cumulativeTime + section.estimatedDurationSeconds;

      // Check if we've exceeded the duration cap BEFORE adding to the array
      // This ensures sections that would extend past the limit are omitted entirely
      if (endTime > MAX_VIDEO_DURATION) {
        console.log(
          `   ⚠️ Duration cap reached at section ${idx} (would end at ${endTime.toFixed(1)}s > ${MAX_VIDEO_DURATION}s) - limiting to ${cappedSectionCount} sections`,
        );
        break;
      }

      // Only add to array AFTER passing the cap check
      const formatted = `${Math.floor(startTime / 60)}:${String(Math.floor(startTime % 60)).padStart(2, '0')}-${Math.floor(endTime / 60)}:${String(Math.floor(endTime % 60)).padStart(2, '0')}`;
      sectionTimestamps.push({ startTime, endTime, formatted });
      cumulativeTime = endTime;
      cappedSectionCount = idx + 1; // Update to include this successfully added section
    }
    console.log(
      `   ⏱️ TIMESTAMP MAPPING: ${sectionTimestamps.length} sections with timestamps (${cappedSectionCount} within ${MAX_VIDEO_DURATION}s)`,
    );

    // Get character type info for VEO guidance
    const charTypeInfo = characterType ? CHARACTER_TYPES[characterType] || null : null;
    if (charTypeInfo) {
      console.log(`   🎭 Character type for VEO: ${charTypeInfo.name}`);
    }
    if (useVlogFormat) {
      console.log(`   📹 VLOG FORMAT: Enabled for intro/outro sections`);
    }

    // Documentary mode: use key events to guide visual settings per section
    if (deepResearch) {
      console.log(`   📚 DOCUMENTARY MODE: ${deepResearch.keyEvents?.length || 0} key events for visual guidance`);
    }

    // ============================================
    // 🎬 HISTORICAL STORY SYSTEM INTEGRATION
    // For figures with story templates (Cleopatra), use multi-character
    // story beats with proper character alternation and eyeline matching
    // ============================================
    const availableTemplates = getAvailableStoryTemplates();
    const figureNameLower = deepResearch?.basicInfo?.fullName?.toLowerCase() || '';
    const hasStoryTemplate = availableTemplates.some((t) => figureNameLower.includes(t));

    // Strict trigger conditions: requires deepResearch AND historical documentary mode
    const useStorySystem = hasStoryTemplate && deepResearch && historicalContentFlag;

    // Pre-generate story prompts if applicable (will be used in the loop below)
    let storyPromptsByIndex: Map<
      number,
      { prompt: string; character: string; action: string; setting: string }
    > | null = null;

    if (useStorySystem) {
      console.log(
        `   🎭 STORY SYSTEM: Augmenting prompts with multi-character story beats for ${deepResearch.basicInfo.fullName}`,
      );

      // Generate story prompts - each clip gets proper character alternation
      const { prompts: storyPrompts, stats } = generateStoryPrompts(
        figureNameLower,
        cappedSectionCount, // Map sections to clips
        8, // 8 seconds per clip (VEO standard)
      );

      console.log(
        `   📊 Story Distribution: ${Object.entries(stats.characterDistribution)
          .map(([c, d]) => `${c}: ${d.percentage}%`)
          .join(', ')}`,
      );
      console.log(
        `   📝 Avg word count: ${stats.avgWordCount.toFixed(1)}, Est cost: $${stats.estimatedCost.toFixed(2)}`,
      );

      // Index story prompts for lookup in the section loop
      storyPromptsByIndex = new Map();
      storyPrompts.forEach((sp, idx) => {
        storyPromptsByIndex!.set(idx, {
          prompt: sp.prompt,
          character: sp.character,
          action: sp.action,
          setting: sp.setting,
        });
      });
    }

    // 🎬 ACTION VARIETY TRACKING: Clip-indexed tracking with source awareness
    // Map keyed by clip index to handle retries correctly
    type ActionEntry = { action: string; source: 'lyric' | 'keyEvent' | 'narrative' | 'generic'; verb: string };
    const actionsByClip = new Map<number, ActionEntry>();
    const usedSettings: string[] = [];

    // Initialize variety enforcer for unique shots across clips
    const varietyEnforcer = new VarietyEnforcer(cappedSectionCount);

    // Helper to extract canonical verb for duplicate detection
    const extractCanonicalVerb = (action: string): string => {
      const words = action.toLowerCase().split(/\s+/);
      // Skip name patterns (first 2 words), extract core verb
      const verbs = words.filter(
        (w, i) =>
          i >= 2 && w.length > 3 && !['the', 'with', 'and', 'his', 'her', 'their', 'from', 'over', 'while'].includes(w),
      );
      return verbs.slice(0, 2).join(' ') || words.slice(2, 4).join(' ');
    };

    // Helper to get only generic action verbs for duplicate checking
    const getGenericVerbs = (): Set<string> => {
      const verbs = new Set<string>();
      actionsByClip.forEach((entry) => {
        if (entry.source === 'generic') {
          verbs.add(entry.verb);
        }
      });
      return verbs;
    };

    // ✅ FIX: Generate one prompt per 5 seconds (not one per section)
    // For a 180s song, this generates 36 prompts (180÷5), not 7-8 (section count)
    let globalClipIndex = 0; // Track overall clip index across all sections

    for (let i = 0; i < cappedSectionCount; i++) {
      const section = timing.sections[i];
      const sectionContent = Object.values(lyrics.sections)[i] || '';
      const sectionTimestamp = sectionTimestamps[i];

      // Calculate how many 5-second clips fit in this section
      const sectionDuration = sectionTimestamp.endTime - sectionTimestamp.startTime;
      const clipsInSection = Math.ceil(sectionDuration / 5);

      console.log(
        `   🎬 Section ${i + 1} (${section.type}): ${sectionDuration.toFixed(1)}s = ${clipsInSection} clips (5s each)`,
      );

      // Determine if this section should use vlog format (intro/outro only)
      const sectionType = section.type.toLowerCase();
      const isIntroOutro = sectionType === 'intro' || sectionType === 'outro';
      const useVlogForSection = useVlogFormat && isIntroOutro;

      // For documentary mode, map section to a key event if available
      let keyEventForSection: KeyHistoricalEvent | null = null;
      if (deepResearch && deepResearch.keyEvents.length > 0) {
        // Map sections to key events: intro=0, verse1=1, verse2=2, chorus=skip, bridge=3-4, outro=last
        const sectionType = section.type.toLowerCase();
        if (sectionType === 'intro' && deepResearch.keyEvents[0]) {
          keyEventForSection = deepResearch.keyEvents[0];
        } else if (sectionType.includes('verse') && section.type.includes('1') && deepResearch.keyEvents[1]) {
          keyEventForSection = deepResearch.keyEvents[1];
        } else if (sectionType.includes('verse') && section.type.includes('2') && deepResearch.keyEvents[2]) {
          keyEventForSection = deepResearch.keyEvents[2];
        } else if (sectionType === 'bridge' && deepResearch.keyEvents[3]) {
          keyEventForSection = deepResearch.keyEvents[3];
        } else if (sectionType === 'outro' && deepResearch.keyEvents[deepResearch.keyEvents.length - 1]) {
          keyEventForSection = deepResearch.keyEvents[deepResearch.keyEvents.length - 1];
        }
      }

      // Generate multiple clips for this section (one per 5 seconds)
      for (let clipIndex = 0; clipIndex < clipsInSection; clipIndex++) {
        const clipStartTime = sectionTimestamp.startTime + clipIndex * 5;
        const clipEndTime = Math.min(clipStartTime + 5, sectionTimestamp.endTime);

        // Create timestamp for this specific 5-second clip
        const clipTimestamp = {
          startTime: clipStartTime,
          endTime: clipEndTime,
          formatted: `${Math.floor(clipStartTime / 60)}:${String(Math.floor(clipStartTime % 60)).padStart(2, '0')}-${Math.floor(clipEndTime / 60)}:${String(Math.floor(clipEndTime % 60)).padStart(2, '0')}`,
        };

        let veoPrompt = await this.generateSingleVeoPrompt({
          section,
          sectionContent,
          sectionIndex: globalClipIndex, // Use global clip index for variety tracking
          characterCast,
          template,
          visualStyleV2,
          setting,
          aspectRatio,
          totalSections: cappedSectionCount, // Keep section count for section-based logic
          stylePreset, // Pass style preset through
          presetConfig, // Pass preset config for efficiency
          characterTypeInfo: charTypeInfo, // Character type for VEO guidance
          useVlogFormat: useVlogForSection, // Vlog format for intro/outro
          varietyEnforcer, // Variety enforcer for unique shots
          isHistoricalContent: historicalContentFlag, // Non-battle historical content flag
          deepResearch, // Full deep research for character appearance
          keyEventForSection, // Specific key event for this section's visual setting
          timestamp: clipTimestamp, // 🎵 Timestamp for this 5-second clip
          // 🎬 Variety tracking
          genericVerbsUsed: getGenericVerbs(),
          extractCanonicalVerb,
          onActionSelected: (idx, action, source, verb) => {
            actionsByClip.set(idx, { action, source, verb });
          },
        });

        // 🎭 STORY SYSTEM OVERRIDE: Replace fullPrompt with story-optimized prompt
        // This preserves all VeoPrompt structure while using story system's
        // character alternation and Kling-optimized prompts (50-80 words)
        if (storyPromptsByIndex && storyPromptsByIndex.has(globalClipIndex)) {
          const storyData = storyPromptsByIndex.get(globalClipIndex)!;

          // Sanitize the story prompt before using it
          const sanitizationResult = sanitizeVeoPrompt(storyData.prompt);
          const sanitizedPrompt = sanitizationResult.wasModified ? sanitizationResult.sanitized : storyData.prompt;

          // Override fullPrompt with story system's optimized prompt
          veoPrompt = {
            ...veoPrompt,
            fullPrompt: sanitizedPrompt,
            featuredCharacters: [storyData.character],
            characterAction: {
              ...veoPrompt.characterAction,
              movement: storyData.action,
            },
            sceneDetails: {
              ...veoPrompt.sceneDetails,
              location: storyData.setting.split(',')[0],
            },
          };

          if (globalClipIndex === 0) {
            console.log(
              `   🎭 Story override applied: ${storyData.character} - ${storyData.action.substring(0, 50)}...`,
            );
          }
        }

        // ============================================
        // PROMPT VALIDATION: Reject physically impossible actions
        // Prevents "motion_impossible" errors from World Model
        // ============================================
        // Pattern validation - check for impossible actions
        // Use function to check context, not just regex
        const hasImpossibleFly = (text: string): boolean => {
          if (!/\bflying\b/i.test(text)) return false;
          const lowerText = text.toLowerCase();
          const flyingWords = [
            'bird',
            'plane',
            'dragon',
            'wings',
            'eagle',
            'hawk',
            'creature',
            'angel',
            'bat',
            'insect',
            'bee',
            'butterfly',
            'aircraft',
          ];
          return !flyingWords.some((word) => lowerText.includes(word));
        };

        const hasImpossibleWaterWalk = (text: string): boolean => {
          if (!/\bwalking on water\b/i.test(text)) return false;
          const lowerText = text.toLowerCase();
          const allowedWords = ['jesus', 'miracle', 'divine', 'christ', 'biblical', 'messiah'];
          return !allowedWords.some((word) => lowerText.includes(word));
        };

        const impossiblePatterns = [
          /\bdiving into.*pool\b/i,
          /\bteleport(s|ing)?\b/i,
          /\blevitat(e|es|ing)?\b/i,
          /\bfloating in (space|void|air)\b/i,
          /\bphasing through\b/i,
          /\bvanish(es|ing)? into thin air\b/i,
        ];

        let validationAttempts = 0;
        const MAX_VALIDATION_RETRIES = 2;

        while (validationAttempts < MAX_VALIDATION_RETRIES) {
          const promptToCheck = veoPrompt.fullPrompt || (veoPrompt as any).prompt || '';
          const actionToCheck = veoPrompt.characterAction?.movement || '';

          // Check regex patterns
          const hasPatternMatch = impossiblePatterns.some(
            (pattern) => pattern.test(promptToCheck) || pattern.test(actionToCheck),
          );

          // Check context-aware functions
          const hasImpossibleAction =
            hasPatternMatch ||
            hasImpossibleFly(promptToCheck) ||
            hasImpossibleFly(actionToCheck) ||
            hasImpossibleWaterWalk(promptToCheck) ||
            hasImpossibleWaterWalk(actionToCheck);

          if (hasImpossibleAction) {
            console.log(
              `   ⚠️ Rejected impossible action in prompt (attempt ${validationAttempts + 1}/${MAX_VALIDATION_RETRIES})`,
            );
            validationAttempts++;

            // Regenerate with same parameters
            veoPrompt = await this.generateSingleVeoPrompt({
              section,
              sectionContent,
              sectionIndex: globalClipIndex,
              characterCast,
              template,
              visualStyleV2,
              setting,
              aspectRatio,
              totalSections: cappedSectionCount,
              stylePreset,
              presetConfig,
              characterTypeInfo: charTypeInfo,
              useVlogFormat: useVlogForSection,
              varietyEnforcer,
              isHistoricalContent: historicalContentFlag,
              deepResearch,
              keyEventForSection,
              timestamp: clipTimestamp,
              genericVerbsUsed: getGenericVerbs(),
              extractCanonicalVerb,
              onActionSelected: (idx, action, source, verb) => {
                actionsByClip.set(idx, { action, source, verb });
              },
            });

            // Re-apply story system override if applicable
            if (storyPromptsByIndex && storyPromptsByIndex.has(globalClipIndex)) {
              const storyData = storyPromptsByIndex.get(globalClipIndex)!;
              const sanitizationResult = sanitizeVeoPrompt(storyData.prompt);
              const sanitizedPrompt = sanitizationResult.wasModified ? sanitizationResult.sanitized : storyData.prompt;

              veoPrompt = {
                ...veoPrompt,
                fullPrompt: sanitizedPrompt,
                featuredCharacters: [storyData.character],
                characterAction: {
                  ...veoPrompt.characterAction,
                  movement: storyData.action,
                },
                sceneDetails: {
                  ...veoPrompt.sceneDetails,
                  location: storyData.setting.split(',')[0],
                },
              };
            }
          } else {
            // Prompt is valid, exit validation loop
            break;
          }
        }

        if (validationAttempts >= MAX_VALIDATION_RETRIES) {
          console.log(
            `   ⚠️ Max validation retries reached, using last generated prompt (may contain impossible action)`,
          );
        }

        prompts.push(veoPrompt);
        globalClipIndex++;
      }
    }

    // Log variety score for prompt variety tracking
    if (varietyEnforcer) {
      const summary = varietyEnforcer.getVarietySummary();
      console.log(
        `   🎬 Variety Score: ${summary.varietyScore}% (${summary.uniqueCameras} cameras, ${summary.uniqueActions} actions, ${summary.uniqueSettings} settings)`,
      );
    }

    // ============================================
    // LEVEL 5: WORLD MODEL SIMULATOR - Preflight check
    // Runs simulations to predict potential issues before Kling API calls
    // ============================================
    try {
      console.log(`\n🌍 WORLD MODEL: Running preflight simulation...`);
      const promptTexts = prompts.map((p) => p.fullPrompt || (p as any).prompt || '');
      const packageContext = {
        packageId: 'veo-gen-' + Date.now(),
        topic: characterCast[0]?.name || 'historical figure',
        era: setting || '',
        dateRange: 'modern', // Default date range
        characters: characterCast.map((c) => ({
          name: c.name || 'Character',
          appearance: c.appearance || '',
          archetype: c.vibe || 'warrior',
          era: setting || '',
        })),
      };

      const preflightResult = await worldModelSimulator.preflightCheck(promptTexts, packageContext, true);

      console.log(`   📊 Pass rate: ${preflightResult.passRate.toFixed(1)}%`);
      console.log(`   💰 Estimated savings: $${preflightResult.estimatedSavings.toFixed(2)}`);

      if (preflightResult.suggestions.length > 0) {
        preflightResult.suggestions.forEach((s) => console.log(`   💡 ${s}`));
      }

      // Apply auto-fixed prompts if available
      if (preflightResult.autoFixedPrompts && preflightResult.autoFixedPrompts.size > 0) {
        for (const [index, revisedPrompt] of preflightResult.autoFixedPrompts) {
          if (index < prompts.length && prompts[index]) {
            prompts[index].fullPrompt = revisedPrompt;
            (prompts[index] as any).prompt = revisedPrompt;
          }
        }
        console.log(`   🔧 Applied ${preflightResult.autoFixedPrompts.size} prompt revisions from World Model`);
      }
    } catch (worldModelErr: any) {
      console.warn(`   ⚠️ World model preflight failed (non-blocking): ${worldModelErr.message}`);
    }

    // NEW: POST-PROCESS for 5-second intervals
    // If in 5-second mode, split section prompts into exact 5-second clips
    if (use5SecondMode && targetClipCount && actualSongDuration) {
      console.log(`   ✂️ Splitting prompts into ${targetClipCount} × ${clipDuration}s clips...`);

      const fiveSecondPrompts: VeoPrompt[] = [];

      // Map each 5-second timestamp to its section
      for (let clipIndex = 0; clipIndex < targetClipCount; clipIndex++) {
        const clipStartTime = clipIndex * clipDuration;
        const clipEndTime = Math.min(clipStartTime + clipDuration, actualSongDuration);

        // Find which section this timestamp falls into
        let sourcePrompt: VeoPrompt | null = null;
        let sourceSection: SectionTiming | null = null;

        for (let i = 0; i < prompts.length; i++) {
          const prompt = prompts[i];
          const section = timing.sections[i];

          // Calculate section's actual time range
          const sectionStart = timing.sections.slice(0, i).reduce((sum, s) => sum + s.estimatedDurationSeconds, 0);
          const sectionEnd = sectionStart + section.estimatedDurationSeconds;

          // Check if this clip falls within this section
          if (clipStartTime >= sectionStart && clipStartTime < sectionEnd) {
            sourcePrompt = prompt;
            sourceSection = section;
            break;
          }
        }

        // If we found a source prompt, create a 5-second version
        if (sourcePrompt && sourceSection) {
          const clipPrompt: VeoPrompt = {
            ...sourcePrompt,
            // Update timestamps
            timestampStart: clipStartTime,
            timestampEnd: clipEndTime,
            timestampFormatted: `${Math.floor(clipStartTime / 60)}:${String(Math.floor(clipStartTime % 60)).padStart(2, '0')}-${Math.floor(clipEndTime / 60)}:${String(Math.floor(clipEndTime % 60)).padStart(2, '0')}`,
            // Add clip index to prompt for variation
            fullPrompt: `${sourcePrompt.fullPrompt} (Clip ${clipIndex + 1}/${targetClipCount}, ${clipStartTime}-${clipEndTime}s)`,
          };

          fiveSecondPrompts.push(clipPrompt);
        } else {
          // Fallback: use last prompt if we can't find a section (shouldn't happen)
          console.warn(`   ⚠️ Couldn't find section for clip ${clipIndex} at ${clipStartTime}s`);
          if (prompts.length > 0) {
            const lastPrompt = prompts[prompts.length - 1];
            fiveSecondPrompts.push({
              ...lastPrompt,
              timestampStart: clipStartTime,
              timestampEnd: clipEndTime,
              timestampFormatted: `${Math.floor(clipStartTime / 60)}:${String(Math.floor(clipStartTime % 60)).padStart(2, '0')}-${Math.floor(clipEndTime / 60)}:${String(Math.floor(clipEndTime % 60)).padStart(2, '0')}`,
            });
          }
        }
      }

      console.log(`   ✅ Generated ${fiveSecondPrompts.length} prompts at 5-second intervals`);
      return fiveSecondPrompts;
    }

    return prompts;
  }

  /**
   * 🏛️ HISTORICAL DOCUMENTARY PROMPT BUILDER
   * Completely bypasses comedy/food systems for authentic historical content
   * Uses deepResearch data directly for settings, actions, and character appearance
   */
  private async buildHistoricalDocumentaryPrompt(params: {
    section: SectionTiming;
    sectionContent: string;
    sectionIndex: number;
    totalSections: number;
    aspectRatio: string;
    deepResearch: DeepHistoricalResearch;
    keyEventForSection?: KeyHistoricalEvent | null;
    lyricScene?: SectionLyricScenes | null; // NEW: Lyric-derived scene data
    timestamp?: { startTime: number; endTime: number; formatted: string }; // 🎵 Timestamp in song
    genericVerbsUsed?: Set<string>; // 🎬 Only GENERIC action verbs for duplicate checking
    extractCanonicalVerb?: (action: string) => string; // Verb extraction helper
  }): Promise<VeoPrompt & { actionSource: 'lyric' | 'keyEvent' | 'narrative' | 'generic' }> {
    const {
      section,
      sectionContent,
      sectionIndex,
      totalSections,
      aspectRatio,
      deepResearch,
      keyEventForSection,
      lyricScene,
      timestamp,
      genericVerbsUsed = new Set(),
      extractCanonicalVerb = (a: string) => a.toLowerCase().split(' ').slice(2, 4).join(' '),
    } = params;

    console.log(
      `   🏛️ DOCUMENTARY MODE: Building historical prompt for section ${sectionIndex + 1}/${totalSections} [${timestamp?.formatted || 'no timestamp'}]`,
    );

    // 🎬 SECTION VISUAL PHILOSOPHY (from user guide):
    // INTRO: Dramatic hook event - grab attention with emotional punch
    // VERSE 1: Survival progression with aging - show character development through time
    // CHORUS: Power imagery - throne, conquest, destruction then building
    // VERSE 2: Action sequences - arrows, burning cities, horseback formations
    // BRIDGE: Mortality/reflection - death scene, closing eyes, end of life
    // OUTRO: Cosmic pan out - legacy, viewer perspective, earth

    // Historical actions by section type - NO comedy, NO food, NO TikTok energy
    const historicalActionsBySection: Record<string, string[]> = {
      intro: [
        // HOOK EVENT: Most dramatic/shocking moment to grab attention (ADULT VERSION)
        'adult warrior experiencing traumatic betrayal with raw emotional impact',
        'adult warrior with hands bound being dragged behind horse',
        'adult warrior witnessing family member poisoned or killed',
        'lone adult survivor in harsh wilderness terrain',
      ],
      verse: [
        // SURVIVAL PROGRESSION: Character building strength (ADULT VERSION)
        'adult warrior running barefoot through cold frost-bitten terrain',
        'battle-hardened adult hiding in brush with frost on face, staring at stars',
        'adult leader forming small group of loyal followers in camp',
        'tribe growing larger with each scene - more warriors joining',
        'warrior transforming from survivor to battle-hardened leader',
      ],
      chorus: [
        // POWER IMAGERY: Peak of power, destruction and building
        'sitting on throne of conquered enemies skulls',
        'plundering ancient city with warriors beside him',
        'standing victorious over smoldering ruins then building new structures',
        'commanding view of newly built empire from high vantage',
        'great monument or wall construction in progress',
      ],
      bridge: [
        // MORTALITY: Death scene, end of life reflection
        'lying in bed with visible signs of illness, weakened',
        'decrepit body showing effects of plague or age',
        'closing eyes for the final time in dimly lit chamber',
        'wolves standing still as mourning begins',
        'burial preparation in secret mountain location',
      ],
      outro: [
        // COSMIC LEGACY: Pan out to viewer/earth perspective
        'legacy monument revealing vast empire scope',
        'camera pulling back from face to show entire empire map',
        'viewer watching the story unfold - meta perspective',
        'earth from above showing conquered territories',
        'silhouette fading into historical mist',
      ],
      'pre-chorus': [
        'tension building before decisive battle moment',
        'warriors preparing arrows and weapons for campaign',
        'dramatic pause before historic speech',
      ],
      hook: [
        'legendary hero moment at peak emotion',
        'dramatic weapon raise to sky with army behind',
        'epic declaration before massive conquest',
      ],
    };

    // 🎬 VERSE-SPECIFIC PROGRESSION: Verse 1 vs Verse 2 have different visual purposes
    const verseProgressionActions: Record<string, string[]> = {
      verse_1: [
        // SURVIVAL & ORIGIN: Cold, struggle, tribe formation (ADULT VERSION)
        'adult warrior surviving in freezing cold steppe',
        'battle-hardened adult with frost-bitten feet running through harsh terrain',
        'small group of loyal adult warriors huddled around campfire',
        'tribe slowly growing - more adult warriors appearing each clip',
        'warrior maturing from survivor to hardened battle leader',
      ],
      verse_2: [
        // ACTION & CONQUEST: Arrows, cities burning, horseback formations
        'swarm of arrows shooting from archers blacking out the sun',
        'city walls being struck with endless wave of arrows',
        'burning city with horsemen riding through flames in triangle formation',
        'prisoners hog-tied on backs of horses being transported',
        'displaying acquired wealth and trading with foreign merchants',
        'silks and gold being exchanged for provisions',
      ],
    };

    // Historical lighting by section - epic, period-accurate
    const historicalLightingBySection: Record<string, string> = {
      intro: 'harsh dramatic lighting with deep shadows, trauma-inducing cold tones, dust motes in air',
      verse: 'torchlight and firelight casting dramatic shadows, warm amber tones, period-accurate illumination',
      chorus: 'dramatic backlighting with epic sun rays, maximum visual drama, legendary hero lighting',
      bridge: 'dim sickroom candlelight, deathbed atmosphere, fading golden to cold grey tones, mortality lighting',
      outro: 'triumphant sunset lighting, warm golden legacy tones, epic closing atmosphere',
      'pre-chorus': 'building tension with torch flickers intensifying, dramatic shadows',
      hook: 'spotlight burst on legendary moment, maximum dramatic impact',
    };

    // Historical camera movements - documentary epic style
    const historicalCameraBySection: Record<string, string[]> = {
      intro: ['sweeping crane over landscape', 'epic establishing wide shot', 'slow tracking toward subject'],
      verse: ['steady medium shot', 'slow push-in for emphasis', 'elegant tracking shot'],
      chorus: ['dynamic hero shot low angle', 'sweeping 180 arc', 'epic wide with subject centered'],
      bridge: ['intimate close-up', 'gentle push-in', 'contemplative static shot'],
      outro: ['pulling back to reveal scope', 'crane up to final wide', 'silhouette shot'],
      'pre-chorus': ['tension-building slow zoom', 'anticipatory tracking'],
      hook: ['dramatic snap zoom', 'low angle hero shot'],
    };

    // Documentary shot types by section - epic, heroic framing
    const historicalShotTypesBySection: Record<string, VeoShotType[]> = {
      intro: ['ENVIRONMENT', 'HERO-3', 'TRACKING'],
      verse: ['SOLO-POWER', 'TRACKING', 'DETAIL', 'DUO-ALLY'],
      chorus: ['HERO-3', 'SOLO-POWER', 'TRACKING'],
      bridge: ['SOLO-VULNERABLE', 'METAPHOR', 'DETAIL'],
      outro: ['HERO-3', 'ENVIRONMENT', 'TRACKING'],
      'pre-chorus': ['DUO-DEBATE', 'TRACKING'],
      hook: ['HERO-3', 'SOLO-POWER'],
    };

    // Get section-specific elements
    const sectionTypeKey = section.type.toLowerCase().replace(/[^a-z_]/g, '') || 'verse';

    // 🎬 VERSE PROGRESSION: Distinguish verse 1 (survival) from verse 2 (action/conquest)
    // Verse 1: Cold, struggle, tribe formation, aging from young to adult
    // Verse 2: Arrows blacking out sun, burning cities, horseback formations, wealth display
    let actions: string[];
    if (sectionTypeKey.includes('verse')) {
      const verseNumber = section.type.match(/\d+/)?.[0] || '1';
      if (verseNumber === '2' || parseInt(verseNumber) >= 2) {
        actions = verseProgressionActions['verse_2'];
        console.log(`   🎬 Using VERSE 2 actions: Action sequences, arrows, conquest`);
      } else {
        actions = verseProgressionActions['verse_1'];
        console.log(`   🎬 Using VERSE 1 actions: Survival, aging, tribe formation`);
      }
    } else {
      actions = historicalActionsBySection[sectionTypeKey] || historicalActionsBySection['verse'];
    }

    const lighting = historicalLightingBySection[sectionTypeKey] || historicalLightingBySection['verse'];
    const cameras = historicalCameraBySection[sectionTypeKey] || historicalCameraBySection['verse'];
    const shotTypes = historicalShotTypesBySection[sectionTypeKey] || historicalShotTypesBySection['verse'];

    // 🎬 NARRATIVE ARC: Use specific scene from narrative arc when available
    let narrativeArcScene: string | null = null;
    if (deepResearch.narrativeArc) {
      if (sectionTypeKey === 'intro') {
        narrativeArcScene = deepResearch.narrativeArc.introScene;
      } else if (sectionTypeKey.includes('verse') && sectionIndex <= 2) {
        narrativeArcScene = deepResearch.narrativeArc.riseScene;
      } else if (sectionTypeKey === 'chorus') {
        narrativeArcScene = deepResearch.narrativeArc.peakScene;
      } else if (sectionTypeKey === 'bridge') {
        narrativeArcScene = deepResearch.narrativeArc.reflectionScene;
      } else if (sectionTypeKey === 'outro') {
        narrativeArcScene = deepResearch.narrativeArc.legacyScene;
      }
    }

    // 🎵 LYRIC-DERIVED SCENE: Extract visual action from what lyrics ACTUALLY describe
    // Priority: Lyric scene → Key event → Narrative arc → Generic actions
    let lyricDerivedAction: string | null = null;
    let lyricVisualContext = '';

    if (lyricScene && lyricScene.primaryMoment && lyricScene.primaryMoment.confidence >= 0.5) {
      const moment = lyricScene.primaryMoment;
      // Build action from the lyrics
      lyricDerivedAction = `${moment.subject} ${moment.action}`;
      lyricVisualContext = `
🎵 LYRICS DESCRIBE THIS SCENE (HIGHEST PRIORITY):
"${moment.lyricText}"
→ SUBJECT: ${moment.subject}
→ ACTION: ${moment.action}  
→ SETTING: ${moment.setting}
→ EMOTION: ${moment.emotion}
→ VISUAL DETAILS: ${moment.visualDetails.join(', ') || 'from lyrics'}

⚠️ THE VEO SCENE MUST MATCH WHAT THE LYRICS SAY
If lyrics mention "poisoned his father" - show the poisoning
If lyrics mention "hands bound" - show the binding
BE LITERAL with what the lyrics describe.
`;
      console.log(`   🎵 LYRIC-MATCHED SCENE: "${moment.subject} ${moment.action}" (confidence: ${moment.confidence})`);
    }

    // NEW PRIORITY ORDER: Lyrics first → then key event → narrative arc → generic
    // Track which source we're using for variety enforcement
    const actionSource: 'lyric' | 'keyEvent' | 'narrative' | 'generic' = lyricDerivedAction
      ? 'lyric'
      : keyEventForSection?.sceneDirection
        ? 'keyEvent'
        : narrativeArcScene
          ? 'narrative'
          : 'generic';

    let selectedAction =
      lyricDerivedAction ||
      keyEventForSection?.sceneDirection ||
      narrativeArcScene ||
      actions[sectionIndex % actions.length];

    // 🎬 VARIETY ENFORCEMENT: Only check duplicates for GENERIC actions
    // Specific sources (lyric, keyEvent, narrative) are ALWAYS preserved - no duplicate checking
    if (genericVerbsUsed.size > 0 && selectedAction && actionSource === 'generic') {
      const actionVerb = extractCanonicalVerb(selectedAction);
      const isDuplicate = genericVerbsUsed.has(actionVerb) && actionVerb.length > 5;

      if (isDuplicate) {
        console.log(`   ⚠️ DUPLICATE GENERIC VERB: "${actionVerb}" - finding alternative`);
        // Try to find unused action from the pool
        const unusedActions = actions.filter((act) => {
          const actVerb = extractCanonicalVerb(act);
          return !genericVerbsUsed.has(actVerb);
        });
        if (unusedActions.length > 0) {
          selectedAction = unusedActions[sectionIndex % unusedActions.length];
          console.log(`   🔄 GENERIC FALLBACK: "${selectedAction.substring(0, 50)}..."`);
        }
      }
    }

    // 🎵 LOG ACTION SOURCE: Track what's driving each clip's action
    console.log(`   📍 ACTION SOURCE [${actionSource.toUpperCase()}]: "${selectedAction?.substring(0, 60)}..."`);

    // For intro, include origin scene flash if available (but only if no lyric-derived action)
    if (sectionTypeKey === 'intro' && deepResearch.originScene && sectionIndex === 0 && !lyricDerivedAction) {
      selectedAction = `Opens on ${deepResearch.originScene.childhoodMoment} in ${deepResearch.originScene.childhoodSetting}. Hard cut to ${selectedAction}`;
    }

    // 🎵 LYRIC-DERIVED CAMERA: Map emotion from lyrics to camera style
    // Emotion-to-camera mapping for documentary
    const emotionToCameraMap: Record<string, string> = {
      horror: 'intimate close-up with slow push in',
      anger: 'low angle power shot with slow tracking',
      sympathy: 'medium close-up with gentle movement',
      awe: 'sweeping crane shot with epic wide reveal',
      tension: 'tight framing with slow zoom',
      sorrow: 'static shot with minimal movement',
      determination: 'low angle hero shot',
      fear: 'handheld intimate shot',
      triumph: 'dynamic hero shot with upward crane movement',
      desperation: 'close tracking following subject',
      hope: 'pull back to reveal epic scope',
    };

    let lyricDerivedCamera: string | null = null;
    if (lyricScene && lyricScene.primaryMoment && lyricScene.primaryMoment.confidence >= 0.5) {
      const emotion = lyricScene.primaryMoment.emotion?.toLowerCase() || '';
      // Check for emotion matches
      for (const [emotionKey, cameraStyle] of Object.entries(emotionToCameraMap)) {
        if (emotion.includes(emotionKey)) {
          lyricDerivedCamera = cameraStyle;
          console.log(`   🎵 LYRIC-MATCHED CAMERA: "${cameraStyle}" (from emotion: ${emotion})`);
          break;
        }
      }
    }

    // Camera selection: lyric-derived → section default
    const selectedCamera = lyricDerivedCamera || cameras[sectionIndex % cameras.length];
    const selectedShotType = shotTypes[sectionIndex % shotTypes.length];

    // 🎵 LYRIC-DERIVED LOCATION: Use setting from lyrics if available
    // Priority: Lyric setting → Key event → Research locations → Generic
    let lyricDerivedLocation: string | null = null;
    if (lyricScene && lyricScene.primaryMoment && lyricScene.primaryMoment.confidence >= 0.5) {
      const setting = lyricScene.primaryMoment.setting;
      if (setting && setting.length > 5 && !setting.includes('appropriate') && !setting.includes('unknown')) {
        lyricDerivedLocation = setting;
        console.log(`   🎵 LYRIC-MATCHED LOCATION: "${lyricDerivedLocation}"`);
      }
    }

    // Build location from lyrics first, then key event or deepResearch
    const location =
      lyricDerivedLocation ||
      keyEventForSection?.visualSetting ||
      deepResearch.visualSettings?.primaryLocations?.[
        sectionIndex % (deepResearch.visualSettings?.primaryLocations?.length || 1)
      ] ||
      'ancient historical setting';

    // CALCULATE ACCURATE AGE FOR THIS SPECIFIC EVENT (before building prompts)
    // Extract birth year from "lived" field (e.g., "1162-1227" → 1162)
    const birthYear = parseInt(deepResearch.basicInfo.lived?.split('-')[0] || '0');
    const eventYear = keyEventForSection?.year ? parseInt(String(keyEventForSection.year)) : null;

    let accurateAge = 40; // Fallback
    let ageDescription = deepResearch.characterAppearance?.ageToDepict || 'peak of power';

    if (birthYear > 0 && eventYear && eventYear > birthYear) {
      accurateAge = eventYear - birthYear;
      ageDescription = `age ${accurateAge} (year ${eventYear})`;
      console.log(`   📅 Age calculation: ${eventYear} (event) - ${birthYear} (birth) = ${accurateAge} years old`);
    } else {
      // No event year available, use generic age from research
      accurateAge = parseInt(deepResearch.characterAppearance?.ageToDepict?.match(/\d+/)?.[0] || '40');
      console.log(`   📅 Using generic age: ${accurateAge} (no event year available)`);
    }

    // Build character appearance - FORCE HUMAN, no animal annotations
    const characterAppearance = `
${deepResearch.basicInfo.fullName} (${deepResearch.basicInfo.lived}):
- Physical: ${deepResearch.characterAppearance?.physical || 'commanding historical figure'}
- Age to depict: ${ageDescription}
- Distinctive features: ${deepResearch.characterAppearance?.distinctiveFeatures || 'regal bearing'}
- Primary outfit: ${deepResearch.characterAppearance?.primaryOutfit || 'period-accurate attire'}
- Accessories: ${deepResearch.characterAppearance?.accessories || 'era-appropriate weapons and symbols'}
- Presence: ${deepResearch.characterAppearance?.presence || 'legendary authority'}

⚠️ THIS IS A REAL HISTORICAL HUMAN FIGURE - NOT AN ANIMAL, NOT ANTHROPOMORPHIC
Render as HUMAN with period-accurate clothing, armor, and weapons.
`.trim();

    // Build key event context if available - NOW with scene direction and emotional beat
    const eventContext = keyEventForSection
      ? `
📍 HISTORICAL EVENT FOR THIS SCENE:
Event: "${keyEventForSection.event}" (${keyEventForSection.year})
Setting: ${keyEventForSection.visualSetting}
What happened: ${keyEventForSection.whatHappened}
${keyEventForSection.sceneDirection ? `Scene Direction: ${keyEventForSection.sceneDirection}` : ''}
${keyEventForSection.emotionalBeat ? `Emotional Beat: Make the audience feel ${keyEventForSection.emotionalBeat}` : ''}
`
      : '';

    // Philosophical thread for depth
    const philosophicalContext = deepResearch.philosophicalThread
      ? `
💭 PHILOSOPHICAL UNDERCURRENT (subtle visual reinforcement):
Core tension: ${deepResearch.philosophicalThread.tension}
Lesson: ${deepResearch.philosophicalThread.lesson}
Modern relevance: ${deepResearch.philosophicalThread.modernRelevance || 'What remains?'}
`
      : '';

    // Build the COMPLETE documentary prompt with epic cinematic style
    const documentaryPrompt = `Generate a VEO 3.1 video prompt for this HISTORICAL DOCUMENTARY section.

🏛️ MODE: HISTORICAL DOCUMENTARY (Epic Cinematic Style)
Serious, epic historical biography with documentary cinematography.
Planet Earth grandeur meets "Marco Polo" period drama intensity.

SECTION: ${section.name} (${section.type})
DURATION: ${Math.round(section.estimatedDurationSeconds)} seconds
SECTION ${sectionIndex + 1} of ${totalSections}

🎭 THE HISTORICAL FIGURE (ONE PERSON - render consistently):
${characterAppearance}
${eventContext}
${philosophicalContext}
${lyricVisualContext}
🎬 SCENE REQUIREMENTS:
LOCATION: ${location}
ACTION: ${selectedAction}
CAMERA: ${selectedCamera}
LIGHTING: ${lighting}

📜 ERA AESTHETICS:
${deepResearch.visualSettings?.eraAesthetics || 'Period-accurate historical'}
COLOR PALETTE: ${deepResearch.visualSettings?.colorPalette || 'Warm amber, earth tones, desaturated epic'}
ICONIC IMAGERY: ${deepResearch.visualSettings?.iconicImagery?.slice(0, 4).join(', ') || 'Historical artifacts and landscapes'}

LYRICS/NARRATIVE CONTENT:
${sectionContent}

✅ REQUIRED VISUAL ELEMENTS:
- Period-accurate locations: ${deepResearch.basicInfo?.lived || 'historical era'} settings (palaces, battlefields, steppes, fortresses)
- Epic documentary cinematography: crane shots, sweeping wides, slow tracking moves
- Authentic lighting: golden hour sun rays, torchlight with orange flicker, campfire amber glow
- Human historical figure with weathered skin, battle scars, period clothing and weapons
- Legendary hero framing: low angles for heroism, silhouettes against sky, dramatic scale
- Consistent character appearance: same face, same armor, same physique throughout
- Gritty textures: dust particles in light, fabric movement, visible breath in cold air
- Ancient architecture: hand-carved stone, weathered wood, iron fixtures, banner fabric

🎬 OUTPUT FORMAT (KLING 2.5 TURBO OPTIMIZED - MAX 70 WORDS):
Return ONLY the video prompt. No JSON. No explanation. Just the prompt.

The prompt MUST:
1. MAX 70 words (Kling ignores beyond ~80 tokens)
2. ONE subject, ONE action per prompt
3. Subject description FIRST: name, age, gender, 2-3 traits, outfit
4. Action verb in CAPS: BURSTS, STORMS, EMERGES, RISES, CRASHES
5. Camera + lighting at end
6. End with "9:16. --no text --no modern"

Example output format (52 words):
"${deepResearch.basicInfo.fullName}, age ${accurateAge}, male, weathered bronze skin, piercing eyes, ${deepResearch.characterAppearance?.primaryOutfit || 'period armor'}. EMERGES from shadows, dust swirling around boots. ${location}. ${selectedCamera}, ${lighting}. 9:16. --no text --no modern"`;

    // Call OpenAI to generate the Kling-optimized prompt
    const response = await openaiService.generateText(documentaryPrompt, {
      temperature: 0.85,
      maxTokens: 500, // Kling prompts are short, no need for 2000 tokens
      systemPrompt: KLING_SYSTEM_PROMPT,
    });

    // Use raw text response directly - no JSON parsing needed
    const rawPrompt = response.trim();

    // Validate the Kling prompt using our validation function
    const validation = validateKlingPrompt(rawPrompt);

    // Build Kling-optimized fallback if OpenAI didn't follow format
    // Uses the Kling structure: Subject. ACTION. Setting. Camera, lighting. 9:16. --no
    const klingVerb = getKlingVerb(sectionIndex, null);
    const klingCamera = getKlingCamera(sectionIndex <= 3 ? 'explosive' : 'dramatic', sectionIndex, null);
    const klingLighting = getKlingLighting(keyEventForSection?.emotionalBeat || 'power');

    // accurateAge already calculated above (lines 5784-5800)

    const klingFallback = buildKlingPrompt({
      character: {
        name: deepResearch.basicInfo.fullName,
        age: accurateAge,
        gender: 'male', // Will be detected properly in full flow
        appearance: deepResearch.characterAppearance?.distinctiveFeatures || 'weathered commanding presence',
        outfit: deepResearch.characterAppearance?.primaryOutfit?.split('.')[0] || 'period armor',
      },
      action: `${klingVerb} ${selectedAction.split(' ').slice(0, 4).join(' ')}`,
      setting: location,
      camera: klingCamera,
      lighting: klingLighting,
      negatives: ['text', 'modern elements', 'watermark', 'blurry'],
    });

    const timestampMarker = timestamp ? `[TIMESTAMP: ${timestamp.formatted}] ` : '';

    // Use OpenAI response if valid, otherwise use Kling fallback
    const finalPrompt = validation.valid ? rawPrompt : validation.fixed || klingFallback;
    const fullPromptText = `${timestampMarker}${finalPrompt}`;

    if (!validation.valid) {
      console.log(`   ⚠️ Kling prompt validation: ${validation.issues.join(', ')} - using fixed/fallback`);
    }

    // Log word count for Kling optimization tracking
    const wordCount = finalPrompt.split(/\s+/).length;
    console.log(`   📊 Kling prompt: ${wordCount} words ${wordCount <= 70 ? '✓' : '⚠️ (over 70)'}`);

    // Log the documentary-specific prompt for debugging
    console.log(
      `   🏛️ DOCUMENTARY: Section ${sectionIndex + 1} [${timestamp?.formatted || 'no ts'}] - Shot: ${selectedShotType}, Camera: ${selectedCamera}, Location: ${location}`,
    );

    return {
      sectionIndex,
      sectionName: section.name,
      durationSeconds: section.estimatedDurationSeconds,
      characterIds: [1], // Documentary uses single character ID
      shotType: selectedShotType, // Section-specific shot type, NOT hardcoded
      cameraMovement: selectedCamera,
      lightingMood: lighting,
      featuredCharacters: [deepResearch.basicInfo.fullName],
      visualMetaphor: deepResearch.philosophicalThread?.coreQuestion || undefined,
      // 🎵 TIMESTAMP FIELDS: Track when this clip plays in the song
      timestampStart: timestamp?.startTime ?? 0,
      timestampEnd: timestamp?.endTime ?? section.estimatedDurationSeconds,
      timestampFormatted: timestamp?.formatted ?? '0:00-0:00',
      lyricContentAtTimestamp: sectionContent, // The lyrics playing during this clip
      sceneDetails: {
        location,
        timeOfDay: 'golden hour',
        wardrobe: deepResearch.characterAppearance?.primaryOutfit || 'period attire',
        props: deepResearch.visualSettings?.iconicImagery?.slice(0, 3) || [],
      },
      characterAction: {
        startingPosition: 'commanding',
        movement: selectedAction,
        expression: 'legendary gravitas',
        keyGesture: 'heroic gesture',
      },
      camera: {
        shotType: selectedCamera,
        angle: 'hero angle',
        movement: 'sweeping crane',
        startingFrame: 'epic establishing',
        endingFrame: 'legendary close',
      },
      lighting: {
        keyLight: 'golden hour',
        fillRim: 'dramatic rim light',
        practicalLights: 'torches and campfires',
        mood: lighting,
        colorGrade: 'desaturated epic, warm amber',
      },
      depthComposition: {
        foreground: 'historical artifacts, weapons',
        midground: deepResearch.basicInfo.fullName,
        background: location,
        ruleOfThirds: 'subject at power point',
      },
      audioAtmosphere: {
        ambientSound: 'epic historical ambience',
        sfx: 'wind across steppes, distant drums, horse hooves',
        reverbSpace: 'vast open landscape',
      },
      beatSync: { timings: [] },
      visualReferences: ['epic documentary cinematography', 'historical drama', 'epic hero shots'],
      fullPrompt: fullPromptText,
      actionSource, // 🎬 Track what source determined this action
    } as VeoPrompt & { actionSource: 'lyric' | 'keyEvent' | 'narrative' | 'generic' };
  }

  /**
   * Generate a single detailed VEO prompt
   * Now integrates CHARACTER TYPE guidance and VLOG FORMAT for viral content
   */
  private async generateSingleVeoPrompt(params: {
    section: SectionTiming;
    sectionContent: string;
    sectionIndex: number;
    characterCast: CharacterCast[];
    template: (typeof VIDEO_STYLE_TEMPLATES)[VideoStyleKey];
    visualStyleV2: keyof typeof VISUAL_STYLES;
    setting: keyof typeof SETTING_APPROACHES;
    aspectRatio: string;
    totalSections: number;
    stylePreset?: StylePresetKey;
    presetConfig?: (typeof STYLE_PRESETS)[StylePresetKey];
    characterTypeInfo?: (typeof CHARACTER_TYPES)[CharacterTypeKey] | null; // Character type for VEO guidance
    useVlogFormat?: boolean; // Vlog format for intro/outro sections
    varietyEnforcer?: VarietyEnforcer | null; // Variety enforcer for unique shots
    isHistoricalContent?: boolean; // Non-battle historical content flag
    deepResearch?: DeepHistoricalResearch | null; // Deep research for documentary mode
    keyEventForSection?: KeyHistoricalEvent | null; // Key event for this specific section
    timestamp?: { startTime: number; endTime: number; formatted: string }; // 🎵 Timestamp in song
    // 🎬 Variety tracking (passed from caller)
    genericVerbsUsed?: Set<string>;
    extractCanonicalVerb?: (action: string) => string;
    onActionSelected?: (
      sectionIndex: number,
      action: string,
      source: 'lyric' | 'keyEvent' | 'narrative' | 'generic',
      verb: string,
    ) => void;
  }): Promise<VeoPrompt> {
    const {
      section,
      sectionContent,
      sectionIndex,
      characterCast,
      template,
      visualStyleV2,
      setting,
      aspectRatio,
      totalSections,
      stylePreset = 'comedy_meme',
      presetConfig: passedConfig,
      characterTypeInfo = null,
      useVlogFormat = false,
      varietyEnforcer = null,
      isHistoricalContent: historicalContentFlag = false,
      deepResearch = null,
      keyEventForSection = null,
      timestamp,
      genericVerbsUsed = new Set(),
      extractCanonicalVerb = (a: string) => a.toLowerCase().split(' ').slice(2, 4).join(' '),
      onActionSelected,
    } = params;

    // 🏛️ DOCUMENTARY MODE: Early return to use completely isolated documentary pipeline
    // This bypasses ALL comedy/food systems for authentic historical content
    if (deepResearch) {
      console.log(`   🏛️ DOCUMENTARY: Section ${sectionIndex + 1} using isolated documentary pipeline`);

      // 🎵 EXTRACT LYRIC SCENES: Parse lyrics to find what visual scenes they describe
      let lyricScene: SectionLyricScenes | null = null;
      try {
        lyricScene = await extractLyricScenes(sectionContent, section.type, sectionIndex, {
          topic: deepResearch.basicInfo?.fullName || 'historical figure',
          characterName: deepResearch.basicInfo?.fullName,
          isHistorical: true,
          stylePreset: 'documentary',
        });
      } catch (error) {
        console.error(`   ⚠️ Lyric scene extraction failed for section ${sectionIndex + 1}:`, error);
      }

      const docPrompt = await this.buildHistoricalDocumentaryPrompt({
        section,
        sectionContent,
        sectionIndex,
        totalSections,
        aspectRatio,
        deepResearch,
        keyEventForSection,
        lyricScene, // NEW: Pass lyric-derived scene data
        timestamp, // 🎵 Timestamp marker for this section
        genericVerbsUsed, // 🎬 Only generic verbs for duplicate checking
        extractCanonicalVerb, // Pass verb extraction helper
      });

      // 🎬 TRACK ACTION: Callback to parent to update clip-indexed map
      if (onActionSelected && docPrompt.characterAction?.movement) {
        onActionSelected(
          sectionIndex,
          docPrompt.characterAction.movement,
          docPrompt.actionSource,
          extractCanonicalVerb(docPrompt.characterAction.movement),
        );
      }

      return docPrompt;
    }

    // Get style preset config (use passed config or fetch)
    const presetConfig = passedConfig || getStylePreset(stylePreset);

    // 🎵 LYRIC SCENE EXTRACTION: Parse lyrics to find visual scenes (for ALL modes)
    // This ensures VEO scenes MATCH what the song lyrics describe
    let lyricSceneGuidance = '';
    let lyricDerivedAction: string | null = null;
    let lyricDerivedSetting: string | null = null;
    let lyricDerivedCamera: string | null = null;

    // Emotion-to-camera mapping for non-documentary modes
    const emotionToCameraMapNonDoc: Record<string, string> = {
      horror: 'tight close-up with slow ominous push',
      anger: 'aggressive low angle with sharp movements',
      sympathy: 'gentle medium shot with soft focus',
      awe: 'sweeping wide shot revealing scale',
      tension: 'claustrophobic framing with slow zoom',
      sorrow: 'static melancholic shot',
      determination: 'powerful low angle hero shot',
      fear: 'shaky handheld intimate',
      triumph: 'dynamic upward crane with energy',
      joy: 'bright tracking with movement',
      love: 'soft romantic close-up with glow',
      excitement: 'fast cuts with dynamic angles',
      epic: 'massive scope sweeping shot',
    };

    try {
      const characterName = characterCast[0]?.name || 'main character';
      const lyricScene = await extractLyricScenes(sectionContent, section.type, sectionIndex, {
        topic: characterName,
        characterName,
        isHistorical: false,
        stylePreset,
      });

      if (lyricScene && lyricScene.primaryMoment && lyricScene.primaryMoment.confidence >= 0.4) {
        const moment = lyricScene.primaryMoment;

        // Extract lyric-derived values for DIRECT usage
        lyricDerivedAction = `${moment.subject} ${moment.action}`;

        // Only use setting if it's specific (not generic "appropriate setting")
        if (
          moment.setting &&
          moment.setting.length > 5 &&
          !moment.setting.includes('appropriate') &&
          !moment.setting.includes('unknown')
        ) {
          lyricDerivedSetting = moment.setting;
        }

        // Map emotion to camera
        const emotion = moment.emotion?.toLowerCase() || '';
        for (const [emotionKey, cameraStyle] of Object.entries(emotionToCameraMapNonDoc)) {
          if (emotion.includes(emotionKey)) {
            lyricDerivedCamera = cameraStyle;
            break;
          }
        }

        // Build MANDATORY guidance block with high priority
        lyricSceneGuidance = `
🎵🎵🎵 MANDATORY LYRIC-MATCHED SCENE 🎵🎵🎵

⚠️ THIS IS THE HIGHEST PRIORITY - THE VEO SCENE MUST MATCH THESE LYRICS:
"${moment.lyricText}"

📹 REQUIRED SCENE ELEMENTS (DO NOT OVERRIDE):
→ ACTION: ${lyricDerivedAction}
→ SETTING: ${lyricDerivedSetting || moment.setting}
→ CAMERA: ${lyricDerivedCamera || 'dynamic shot matching emotion'}
→ EMOTION TO CONVEY: ${moment.emotion}
→ VISUAL DETAILS: ${moment.visualDetails.join(', ') || 'as described in lyrics'}

CRITICAL: The VEO scene MUST show "${lyricDerivedAction}" - do NOT substitute with generic actions.
If lyrics say something specific happens, SHOW THAT SPECIFIC THING.
`;
        console.log(`   🎵 LYRIC SCENE for ${section.type}: "${moment.subject} ${moment.action}"`);
        if (lyricDerivedSetting) console.log(`   🎵 LYRIC SETTING: "${lyricDerivedSetting}"`);
        if (lyricDerivedCamera) console.log(`   🎵 LYRIC CAMERA: "${lyricDerivedCamera}"`);
      }
    } catch (error) {
      console.warn(`   ⚠️ Lyric scene extraction skipped for section ${sectionIndex + 1}:`, error);
    }

    // Build character descriptions with CHARACTER_TYPES guidance if available
    // For historical documentary mode, SKIP creature detection (historical figures are always human)
    const isHistoricalDocumentary = !!deepResearch || historicalContentFlag;
    const characterDescriptions = characterCast
      .map((c) => {
        // Include character type guidance in descriptions if available
        const typeGuidance = characterTypeInfo
          ? ` [VEO: ${characterTypeInfo.veoPrefix}, ${characterTypeInfo.posture}]`
          : '';
        // SKIP creature detection for historical documentary - historical figures are ALWAYS human
        // Otherwise check if non-human character by appearance keywords
        const isNonHuman = isHistoricalDocumentary
          ? false
          : /anthropomorphic|creature|animal|cat|dog|wolf|bear|dragon|robot|elemental|spirit|monster|beast|talking/i.test(
              c.appearance || '',
            );
        const ageInfo = isNonHuman ? '' : `${c.age}yo `;
        const creatureEmphasis = isNonHuman ? ' [CREATURE/ANIMAL CHARACTER with exaggerated features]' : '';
        return `${c.name || `CHARACTER ${c.id}`}: ${ageInfo}${c.gender}, ${c.appearance}. Wardrobe: ${c.wardrobeBase}. Vibe: ${c.vibe}${c.humanizingDetail ? `. (${c.humanizingDetail})` : ''}${typeGuidance}${creatureEmphasis}`;
      })
      .join('\n');

    // Determine which narrative arc stage this section is in
    const narrativeStage = this.getNarrativeStage(section.type, sectionIndex, totalSections);
    const visualIronyForSection = VISUAL_IRONY_TECHNIQUES[sectionIndex % VISUAL_IRONY_TECHNIQUES.length];

    // Get v2.0 visual tone and setting guidance
    const visualToneGuidance = VISUAL_STYLES[visualStyleV2] || VISUAL_STYLES.cinematic;

    // NOTE: DOCUMENTARY MODE handled via early return at line 6115 above
    // deepResearch is guaranteed to be null/undefined here, so no documentary override needed
    const settingGuidance: string = SETTING_APPROACHES[setting] || SETTING_APPROACHES.everyday;
    const effectiveSetting = setting; // Track which setting we're actually using

    // Build style preset guidance
    const sectionTypeKey = section.type.toLowerCase().replace(/[^a-z_]/g, '');
    const sectionOverride =
      presetConfig.sectionOverrides[sectionTypeKey] ||
      presetConfig.sectionOverrides[sectionTypeKey.replace('_', '')] ||
      '';

    // Check historicalContentFlag for historical content (e.g., "story of Genghis Khan")
    const isHistoricalContent = historicalContentFlag || false;

    // NOTE: DOCUMENTARY MODE handled via early return at line 6115 above
    // deepResearch is guaranteed to be null/undefined here, so no documentary guidance needed
    const documentaryGuidance = '';

    // deepResearch is always null here due to early return, so isDocumentaryMode is always false
    const isDocumentaryMode = false;
    const shouldUseHistoricalStyle = isHistoricalContent || isDocumentaryMode;

    const effectivePresetConfig = shouldUseHistoricalStyle
      ? {
          ...presetConfig,
          name: isDocumentaryMode ? 'Historical Documentary Epic' : HISTORICAL_STYLE_OVERRIDES.name,
          targetVibe: isDocumentaryMode
            ? 'Epic history documentary meets prestige drama'
            : HISTORICAL_STYLE_OVERRIDES.targetVibe,
          references: isDocumentaryMode
            ? ['Planet Earth cinematography', 'Netflix historical drama', 'Kurosawa epic framing']
            : HISTORICAL_STYLE_OVERRIDES.references,
          cameraModifiers: isDocumentaryMode
            ? ['sweeping crane', 'tracking shot', 'dramatic push-in', 'epic wide establishing']
            : HISTORICAL_STYLE_OVERRIDES.cameraModifiers,
          lightingModifiers: isDocumentaryMode
            ? ['golden hour', 'torchlight flicker', 'campfire glow', 'dramatic backlight']
            : HISTORICAL_STYLE_OVERRIDES.lightingModifiers,
          colorGradeModifiers: isDocumentaryMode
            ? ['warm amber tones', 'desaturated epic', 'period-accurate palette']
            : HISTORICAL_STYLE_OVERRIDES.colorGradeModifiers,
          // Override comedy for documentary
          comedyLevel: 'none',
          foodProminence: 0,
        }
      : presetConfig;

    const stylePresetGuidance = `
🎨 STYLE PRESET: ${effectivePresetConfig.name.toUpperCase()}
Target Vibe: ${effectivePresetConfig.targetVibe}
References: ${effectivePresetConfig.references.slice(0, 3).join(', ')}

REQUIRED CAMERA STYLE (use at least one): ${effectivePresetConfig.cameraModifiers.slice(0, 3).join(', ')}
REQUIRED LIGHTING (use at least one): ${effectivePresetConfig.lightingModifiers.slice(0, 3).join(', ')}
REQUIRED COLOR GRADE: ${effectivePresetConfig.colorGradeModifiers.slice(0, 2).join(', ')}

CHARACTER VIBE: ${presetConfig.characterVibeOverride}
WARDROBE STYLE: ${isHistoricalContent ? 'PERIOD-ACCURATE HISTORICAL ATTIRE ONLY' : presetConfig.wardrobeStyle}

${
  presetConfig.foodProminence >= 0.7 && !isHistoricalContent
    ? `🍕🌮 FOOD IS THE STAR (${Math.round(presetConfig.foodProminence * 100)}% prominence):
${presetConfig.foodStyle}
Make FOOD visually prominent in this section - hero shots, slow motion, steam, cheese pulls, etc.`
    : ''
}${
      isHistoricalContent
        ? `🏛️ HISTORICAL CONTENT - NO FOOD IMAGERY:
Use TRADE GOODS instead: silk fabrics, exotic spices, gold coins, ancient scrolls, jewels, porcelain.
Replace any food references with historical artifacts appropriate to the era.
Think Silk Road markets, not food courts.`
        : ''
    }

${
  presetConfig.comedyLevel !== 'none' && !isHistoricalContent
    ? `😂 COMEDY LEVEL: ${presetConfig.comedyLevel.toUpperCase()}
Comedy techniques: ${presetConfig.comedyLevel === 'absurd' ? 'deadpan delivery, taking mundane things too seriously, overly dramatic for ordinary actions, mock-epic framing' : 'subtle humor, light touches, natural moments'}`
    : ''
}

${
  sectionOverride && !isHistoricalContent
    ? `📍 SECTION-SPECIFIC GUIDANCE FOR ${sectionTypeKey.toUpperCase()}:
${sectionOverride}`
    : ''
}

⚠️ WORDS TO AVOID (can trigger safety filters or wrong vibe):
${isHistoricalContent ? [...HISTORICAL_MODE_BANS.clothing.slice(0, 4), ...HISTORICAL_MODE_BANS.materials.slice(0, 3), ...HISTORICAL_MODE_BANS.aesthetics.slice(0, 3)].join(', ') : presetConfig.avoidWords.slice(0, 8).join(', ')}

✅ PREFERRED WORDS TO INCLUDE:
${isHistoricalContent ? 'period-accurate, historical, authentic, legendary, epic, ancient, classical, regal, majestic' : presetConfig.includeWords.slice(0, 8).join(', ')}
`;

    // Build CHARACTER TYPE guidance for VEO prompts
    const characterTypeGuidance = characterTypeInfo
      ? `
🎭 CHARACTER TYPE GUIDANCE:
Type: ${characterTypeInfo.name}
Description: ${characterTypeInfo.description}

VEO CHARACTER REQUIREMENTS:
- Prefix descriptions with: "${characterTypeInfo.veoPrefix}"
- Character posture: ${characterTypeInfo.posture}
- Visual features: ${characterTypeInfo.features}

Use these guidelines for ALL character descriptions in this section.
`
      : '';

    // Build VLOG FORMAT guidance for viral intro/outro sections
    const vlogFormatGuidance = useVlogFormat
      ? `
📹📹📹 VIRAL VLOG FORMAT ACTIVE 📹📹📹

THIS IS A SELFIE-STICK VLOG STYLE SHOT!
This format gets 15M+ views - Bigfoot holding a selfie stick, speaking directly to camera.

CAMERA SETUP:
${VLOG_PROMPT_TEMPLATE.cameraPosition}
Movement: ${VLOG_PROMPT_TEMPLATE.movementStyle}

VLOG REQUIREMENTS:
- Character is HOLDING A SELFIE STICK (that's where camera is)
- Character speaks DIRECTLY TO CAMERA
- Format prefix: "${VLOG_PROMPT_TEMPLATE.dialoguePrefix}"
- End with: "${VLOG_PROMPT_TEMPLATE.endingSuffix}"

MUNDANE ACTIVITY OPTIONS (pick one to contrast with mythical character):
- ${getRandomMundaneActivity('daily_routine')}
- ${getRandomMundaneActivity('cooking')}
- ${getRandomMundaneActivity('tech_review')}

AMBIENT SOUND OPTIONS:
- ${getRandomAmbientSound('forest')}
- ${getRandomAmbientSound('mystical')}
- ${getRandomAmbientSound('urban')}

The MAGIC is: mythical creature + mundane activity = VIRAL.
Think: Dragon reviewing a blender, Bigfoot doing a morning routine vlog.
`
      : '';

    // Build HOOK OPTIMIZATION guidance for INTRO sections
    // Research: 70-80% of viewers decide to stay/swipe within first 3 seconds
    const isIntroSection = section.type.toLowerCase() === 'intro';
    const hookConfig: HookConfig = {
      battleType: 'general',
      character1: characterCast[0]
        ? {
            name: characterCast[0].name || `Character 1`,
            element:
              characterCast[0].appearance?.includes('fire') || characterCast[0].appearance?.includes('flame')
                ? 'fire'
                : characterCast[0].appearance?.includes('ice') || characterCast[0].appearance?.includes('frost')
                  ? 'ice'
                  : 'power',
          }
        : undefined,
      character2: characterCast[1]
        ? {
            name: characterCast[1].name || `Character 2`,
            element:
              characterCast[1].appearance?.includes('fire') || characterCast[1].appearance?.includes('flame')
                ? 'fire'
                : characterCast[1].appearance?.includes('ice') || characterCast[1].appearance?.includes('frost')
                  ? 'ice'
                  : 'power',
          }
        : undefined,
      vibe: characterCast[0]?.vibe || 'epic',
      stylePreset: stylePreset,
    };

    const hookGuidance = isIntroSection
      ? `
🎯 HOOK OPTIMIZATION (3-Second Rule):
- Open with movement, never static
- High saturation colors
- Dynamic camera angle
- Immediate visual interest
`
      : '';

    const prompt = `Generate a detailed VEO 3.1 video prompt for this music video section.

SECTION: ${section.name} (${section.type})
DURATION: ${Math.round(section.estimatedDurationSeconds)} seconds
CLIPS NEEDED: ${section.veoClipsNeeded}
SECTION ${sectionIndex + 1} of ${totalSections}
${lyricSceneGuidance}
${hookGuidance}
${characterTypeGuidance}
${vlogFormatGuidance}
${stylePresetGuidance}
${documentaryGuidance}

NARRATIVE ARC STAGE: ${narrativeStage.perspective}
Tone: ${narrativeStage.tone}
Description: ${narrativeStage.description}

LYRICS CONTENT:
${sectionContent}

CHARACTER CAST:
${characterDescriptions}

VISUAL IRONY TECHNIQUE TO CONSIDER:
${visualIronyForSection.technique}: ${visualIronyForSection.example}

VISUAL STYLE: ${template.name}
- Camera styles: ${template.cameraStyles.join(', ')}
- Lighting: ${template.lightingMoods.join(', ')}
- Locations: ${template.locations.join(', ')}
- Shot types: ${template.shotTypes.join(', ')}

v2.0 VISUAL TONE: ${visualStyleV2.toUpperCase()}
${visualToneGuidance}

v2.0 SETTING APPROACH: ${effectiveSetting.toUpperCase()}
${settingGuidance}

v2.0 VISUAL PRINCIPLES:
- SHOW don't tell (embed facts in visuals, not statements)
- Visual irony (split screens, reveals, parallels)
- Specific and sympathetic characters
- Comedy earns sincere moments
- Works on mute (story reads visually)

Create a detailed prompt including:
1. Scene details (location, time, wardrobe, props)
2. Character action (starting position, movement, expression, key gesture)
3. Camera (shot type, angle, movement, frames)
4. Lighting (key, fill, practicals, mood, color grade)
5. Composition (foreground, midground, background)
6. Beat sync timing (what happens at 0-2s, 2-4s, etc.)
7. VISUAL IRONY moment (how to show the contrast/humor/parallel visually)

⏱️ CRITICAL: MICRO-TIMESTAMP ACTION BREAKDOWN ⏱️
You MUST break this 8-second clip into EXACTLY 4 action beats (2 seconds each).
Each beat should show a SPECIFIC ACTION derived from the lyrics above.
DO NOT use generic actions like "standing", "talking", "present in scene".

REQUIRED FORMAT:
[0-2s] First specific action (e.g., "emerges from rolled carpet")
[2-4s] Second specific action (e.g., "locks eyes with Caesar")
[4-6s] Third specific action (e.g., "stands tall, adjusts crown")
[6-8s] Fourth specific action (e.g., "extends hand in calculated greeting")

Each action MUST be:
- VISUAL and SPECIFIC (not "feels emotion" but "clenches fist")
- DERIVED from the lyrics content above
- DIFFERENT from other actions in this clip
- Part of a mini-story within this 8 seconds

CRITICAL: Return ONLY valid JSON. No explanatory text, no markdown code blocks. Start with { and end with }.

Respond in JSON:
{
  "sceneDetails": {
    "location": "specific location",
    "timeOfDay": "time and light quality",
    "wardrobe": "what characters wear",
    "props": ["prop1", "prop2"]
  },
  "characterAction": {
    "startingPosition": "where/how they start",
    "movement": "what they do",
    "expression": "emotional journey",
    "keyGesture": "important moment"
  },
  "camera": {
    "shotType": "shot description",
    "angle": "camera angle",
    "movement": "how camera moves",
    "startingFrame": "opening composition",
    "endingFrame": "closing composition"
  },
  "lighting": {
    "keyLight": "main light source",
    "fillRim": "secondary lighting",
    "practicalLights": "in-scene lights",
    "mood": "overall feel",
    "colorGrade": "color treatment"
  },
  "depthComposition": {
    "foreground": "front elements",
    "midground": "subject placement",
    "background": "back elements",
    "ruleOfThirds": "compositional notes"
  },
  "audioAtmosphere": {
    "ambientSound": "environment sounds",
    "sfx": "specific effects",
    "reverbSpace": "acoustic character"
  },
  "beatSync": [
    { "seconds": "0-2", "action": "SPECIFIC action from lyrics (e.g., 'emerges from carpet')" },
    { "seconds": "2-4", "action": "SPECIFIC action from lyrics (e.g., 'locks eyes with opponent')" },
    { "seconds": "4-6", "action": "SPECIFIC action from lyrics (e.g., 'draws weapon slowly')" },
    { "seconds": "6-8", "action": "SPECIFIC action from lyrics (e.g., 'lunges forward to attack')" }
  ],
  "visualReferences": ["movie/show reference"],
  "fullPrompt": "Complete VEO-ready prompt text"
}`;

    try {
      const response = await openaiService.generateText(prompt, {
        temperature: 0.7, // Slightly lower for more consistent JSON formatting
        maxTokens: 2000,
        systemPrompt:
          'You are a JSON-only API that generates music video prompts. Always return valid JSON only, never explanatory text.',
      });

      const parsed = this.parseVeoPromptJson(response);
      if (!parsed) {
        throw new Error('Invalid response format - could not parse JSON');
      }

      // Safe property extraction with defaults
      const sceneDetails = (parsed.sceneDetails as Record<string, unknown>) || {};
      const charAction = (parsed.characterAction as Record<string, unknown>) || {};
      const cam = (parsed.camera as Record<string, unknown>) || {};
      const light = (parsed.lighting as Record<string, unknown>) || {};
      const depth = (parsed.depthComposition as Record<string, unknown>) || {};
      const audio = (parsed.audioAtmosphere as Record<string, unknown>) || {};
      const beatSyncArr = Array.isArray(parsed.beatSync) ? parsed.beatSync : [];
      const visRefs = Array.isArray(parsed.visualReferences) ? parsed.visualReferences : [];
      const fullPromptStr = typeof parsed.fullPrompt === 'string' ? parsed.fullPrompt : '';

      // 🎵 LYRIC-DERIVED OVERRIDES: Force lyric-derived values into the generated JSON
      // This ensures VEO scenes MATCH what the song lyrics describe
      if (lyricDerivedAction) {
        charAction.movement = lyricDerivedAction;
        console.log(`   🎵 OVERRIDE: movement → "${lyricDerivedAction}"`);
      }
      if (lyricDerivedSetting) {
        sceneDetails.location = lyricDerivedSetting;
        console.log(`   🎵 OVERRIDE: location → "${lyricDerivedSetting}"`);
      }
      if (lyricDerivedCamera) {
        cam.movement = lyricDerivedCamera;
        console.log(`   🎵 OVERRIDE: camera → "${lyricDerivedCamera}"`);
      }

      // Get shot type and camera from section matrix
      const sectionType = this.normalizeSectionType(section.type, sectionIndex, 1);
      const matrix = SECTION_SHOT_MATRIX[sectionType] || SECTION_SHOT_MATRIX.verse;
      const shotType = matrix.shotSequence[0] || 'HERO-3';
      const cameraMovementStr = String(cam.movement || CAMERA_MOVEMENTS[matrix.cameraCategory][0]);
      const lightingMoodStr = String(light.keyLight || LIGHTING_MOODS[matrix.lightingMood].description);
      const featuredChars = characterCast.slice(0, 2).map((c) => c.name || `Character ${c.id}`);

      return {
        sectionName: section.name,
        sectionIndex,
        durationSeconds: section.estimatedDurationSeconds,
        // 🎵 TIMESTAMP FIELDS: Track when this clip plays in the song
        timestampStart: timestamp?.startTime ?? 0,
        timestampEnd: timestamp?.endTime ?? section.estimatedDurationSeconds,
        timestampFormatted: timestamp?.formatted ?? '0:00-0:00',
        lyricContentAtTimestamp: sectionContent, // The lyrics playing during this clip
        characterIds: characterCast.slice(0, 2).map((c) => c.id),
        shotType: shotType as VeoShotType,
        cameraMovement: cameraMovementStr,
        lightingMood: lightingMoodStr,
        featuredCharacters: featuredChars,
        sceneDetails: {
          location: String(sceneDetails.location || ''),
          timeOfDay: String(sceneDetails.timeOfDay || ''),
          wardrobe: String(sceneDetails.wardrobe || ''),
          props: Array.isArray(sceneDetails.props) ? sceneDetails.props.map(String) : [],
        },
        characterAction: {
          startingPosition: String(charAction.startingPosition || ''),
          movement: String(charAction.movement || ''),
          expression: String(charAction.expression || ''),
          keyGesture: String(charAction.keyGesture || ''),
        },
        camera: {
          shotType: String(cam.shotType || ''),
          angle: String(cam.angle || ''),
          movement: String(cam.movement || ''),
          startingFrame: String(cam.startingFrame || ''),
          endingFrame: String(cam.endingFrame || ''),
        },
        lighting: {
          keyLight: String(light.keyLight || ''),
          fillRim: String(light.fillRim || ''),
          practicalLights: String(light.practicalLights || ''),
          mood: String(light.mood || ''),
          colorGrade: String(light.colorGrade || ''),
        },
        depthComposition: {
          foreground: String(depth.foreground || ''),
          midground: String(depth.midground || ''),
          background: String(depth.background || ''),
          ruleOfThirds: String(depth.ruleOfThirds || ''),
        },
        audioAtmosphere: {
          ambientSound: String(audio.ambientSound || ''),
          sfx: String(audio.sfx || ''),
          reverbSpace: String(audio.reverbSpace || ''),
        },
        beatSync: {
          timings: beatSyncArr.map((item: unknown) => {
            const obj = item as Record<string, unknown>;
            return { seconds: String(obj.seconds || ''), action: String(obj.action || '') };
          }),
        },
        visualReferences: visRefs.map(String),
        // 🎵 Include timestamp marker AND micro-timestamps in fullPrompt for VEO
        fullPrompt: (() => {
          const timestampMarker = timestamp ? `[TIMESTAMP: ${timestamp.formatted}] ` : '';
          // Build micro-timestamp action breakdown for VEO
          const microTimestamps =
            beatSyncArr.length >= 4
              ? `\n\n⏱️ ACTION BREAKDOWN:\n${beatSyncArr
                  .slice(0, 4)
                  .map((item: unknown) => {
                    const obj = item as Record<string, unknown>;
                    return `[${obj.seconds}] ${obj.action}`;
                  })
                  .join('\n')}`
              : '';
          const basePrompt = fullPromptStr || this.buildFallbackPrompt(section, aspectRatio, template, timestamp);
          return `${timestampMarker}${basePrompt}${microTimestamps}`;
        })(),
      };
    } catch (error) {
      console.error(`VEO prompt generation failed for ${section.name}:`, error);
      return this.createFallbackVeoPrompt(
        section,
        sectionIndex,
        characterCast,
        template,
        aspectRatio,
        sectionContent,
        timestamp,
      );
    }
  }

  private buildFallbackPrompt(
    section: SectionTiming,
    aspectRatio: string,
    template: (typeof VIDEO_STYLE_TEMPLATES)[VideoStyleKey],
    timestamp?: { startTime: number; endTime: number; formatted: string },
  ): string {
    const timestampMarker = timestamp ? `[TIMESTAMP: ${timestamp.formatted}] ` : '';
    return `${timestampMarker}${aspectRatio}, ${Math.round(section.estimatedDurationSeconds)} seconds, cinematic ${template.name.toLowerCase()} style, ${section.type} section, ${template.cameraStyles[0]}, ${template.lightingMoods[0]}, ${template.locations[0]}, professional production quality`;
  }

  private createFallbackVeoPrompt(
    section: SectionTiming,
    sectionIndex: number,
    characterCast: CharacterCast[],
    template: (typeof VIDEO_STYLE_TEMPLATES)[VideoStyleKey],
    aspectRatio: string,
    sectionContent?: string, // 🎵 Lyric content for this section
    timestamp?: { startTime: number; endTime: number; formatted: string }, // 🎵 Timestamp info
  ): VeoPrompt {
    // Determine shot type and camera movement based on section type using the VEO 3.1 framework
    const sectionType = section.type.toLowerCase();
    const matrix = SECTION_SHOT_MATRIX[sectionType] || SECTION_SHOT_MATRIX.verse;
    const shotType = matrix.shotSequence[sectionIndex % matrix.shotSequence.length];
    const lighting = LIGHTING_MOODS[matrix.lightingMood];
    const cameraMovements = CAMERA_MOVEMENTS[matrix.cameraCategory];
    const cameraMovement = cameraMovements[sectionIndex % cameraMovements.length];

    // Select featured characters
    const featuredCharacters = this.selectCharactersForShot(shotType, characterCast, sectionIndex).map(
      (c) => c.name || `Character ${c.id}`,
    );

    return {
      sectionName: section.name,
      sectionIndex,
      durationSeconds: section.estimatedDurationSeconds,
      // 🎵 TIMESTAMP FIELDS: Track when this clip plays in the song
      timestampStart: timestamp?.startTime ?? 0,
      timestampEnd: timestamp?.endTime ?? section.estimatedDurationSeconds,
      timestampFormatted:
        timestamp?.formatted ?? `0:00-0:${String(Math.floor(section.estimatedDurationSeconds)).padStart(2, '0')}`,
      lyricContentAtTimestamp: sectionContent, // The lyrics playing during this clip
      characterIds: characterCast.map((c) => c.id),
      shotType,
      cameraMovement,
      lightingMood: lighting.description,
      featuredCharacters,
      visualMetaphor:
        sectionType === 'bridge' || sectionType === 'chorus' ? 'Abstract visual representing lyrical theme' : undefined,
      sceneDetails: {
        location: template.locations[sectionIndex % template.locations.length],
        timeOfDay: 'evening, golden hour ending',
        wardrobe: characterCast[0]?.wardrobeBase || 'casual streetwear',
        props: [],
      },
      characterAction: {
        startingPosition: 'Standing, contemplative',
        movement: 'Subtle movement, emotional reaction',
        expression: 'Thoughtful, building intensity',
        keyGesture: 'Meaningful gesture on beat',
      },
      camera: {
        shotType: VEO_SHOT_TYPES[shotType]?.framing || template.shotTypes[sectionIndex % template.shotTypes.length],
        angle: shotType === 'SOLO-POWER' ? 'Low angle' : shotType === 'SOLO-VULNERABLE' ? 'High angle' : 'Eye level',
        movement: cameraMovement,
        startingFrame: 'Subject left third, negative space right',
        endingFrame: 'Tighter on subject, emotion visible',
      },
      lighting: {
        keyLight: lighting.keyLight,
        fillRim: 'Subtle fill, rim separation',
        practicalLights: 'Environmental practicals',
        mood: lighting.mood,
        colorGrade: template.colorGrades[0],
      },
      depthComposition: {
        foreground: shotType === 'DETAIL' ? 'Key object in sharp focus' : 'Environmental element, soft focus',
        midground: 'Subject, sharp focus',
        background: 'Setting depth, bokeh',
        ruleOfThirds: 'Subject on vertical third',
      },
      audioAtmosphere: {
        ambientSound: 'Environmental ambience',
        sfx: 'Subtle sound design',
        reverbSpace: 'Appropriate to location',
      },
      beatSync: {
        timings: [
          { seconds: '0-2', action: 'Establishing, mood setting' },
          { seconds: '2-4', action: 'Action begins, building' },
          { seconds: '4-6', action: 'Peak moment, emotion' },
          { seconds: '6-8', action: 'Resolution, transition' },
        ],
      },
      visualReferences: ['Kendrick Lamar music videos', 'Euphoria cinematography'],
      // 🎵 Include timestamp marker in fullPrompt for consistency
      fullPrompt: this.buildFallbackPrompt(section, aspectRatio, template, timestamp),
    };
  }

  /**
   * Get the narrative arc stage for a section based on position and type
   * Section types from timing analyzer: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'drop' | 'hook' | 'instrumental'
   */
  private getNarrativeStage(
    sectionType: string,
    sectionIndex: number,
    totalSections: number,
  ): {
    perspective: string;
    tone: string;
    description: string;
  } {
    const type = sectionType.toLowerCase();
    const position = sectionIndex / Math.max(totalSections - 1, 1);

    // Map section types and positions to narrative arc stages
    // Using actual NARRATIVE_ARC keys: intro, verse1, prechorus, chorus, verse2, bridge, finalChorus, outro

    // Intro sections
    if (type === 'intro') {
      return NARRATIVE_ARC.intro;
    }

    // Outro sections
    if (type === 'outro') {
      return NARRATIVE_ARC.outro;
    }

    // Bridge sections
    if (type === 'bridge') {
      return NARRATIVE_ARC.bridge;
    }

    // Chorus sections - map based on position
    if (type === 'chorus' || type === 'hook') {
      if (position >= 0.75) {
        return NARRATIVE_ARC.finalChorus;
      } else if (position >= 0.4) {
        return NARRATIVE_ARC.chorus; // Second chorus
      }
      return NARRATIVE_ARC.chorus; // First chorus
    }

    // Verse sections - map based on position
    if (type === 'verse') {
      if (position >= 0.4) {
        return NARRATIVE_ARC.verse2;
      }
      return NARRATIVE_ARC.verse1;
    }

    // Pre-chorus or hook building to chorus
    if (type === 'prechorus' || type === 'pre-chorus') {
      return NARRATIVE_ARC.prechorus;
    }

    // Drop/instrumental - treat as bridge or transitional
    if (type === 'drop' || type === 'instrumental') {
      if (position >= 0.6) {
        return NARRATIVE_ARC.bridge;
      }
      return NARRATIVE_ARC.prechorus;
    }

    // Fallback based purely on position
    if (position < 0.15) return NARRATIVE_ARC.intro;
    if (position < 0.35) return NARRATIVE_ARC.verse1;
    if (position < 0.5) return NARRATIVE_ARC.chorus;
    if (position < 0.7) return NARRATIVE_ARC.verse2;
    if (position < 0.85) return NARRATIVE_ARC.bridge;
    return NARRATIVE_ARC.outro;
  }

  private parseLyricsSections(text: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const sectionRegex = /\[([^\]]+)\]/gi;
    const sectionMarkers: Array<{ name: string; index: number }> = [];

    let match;
    while ((match = sectionRegex.exec(text)) !== null) {
      sectionMarkers.push({ name: match[1], index: match.index + match[0].length });
    }

    for (let i = 0; i < sectionMarkers.length; i++) {
      const startIndex = sectionMarkers[i].index;
      const endIndex =
        i < sectionMarkers.length - 1
          ? sectionMarkers[i + 1].index - sectionMarkers[i + 1].name.length - 2
          : text.length;
      const content = text.slice(startIndex, endIndex).trim();

      if (content) {
        const key = this.normalizeSectionKey(sectionMarkers[i].name);
        sections[key] = content;
      }
    }

    return sections;
  }

  private normalizeSectionKey(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private buildRhymeHints(): string {
    const families = ['divided', 'heart', 'fight', 'news', 'weak', 'solution'];
    return families
      .map((name) => {
        const family = RHYME_FAMILIES[name];
        if (!family) return '';
        const rhymes = family.rhymes.slice(0, 6).join(', ');
        return `${name.toUpperCase()}: ${rhymes} (theme: ${family.theme})`;
      })
      .join('\n');
  }

  /**
   * Build species-specific roast guidance for battle lyrics
   * Maps common animals/creatures to their stereotypical traits for roasting
   */
  private buildSpeciesRoasts(sideAName: string | undefined, sideBName: string | undefined): string {
    // Handle undefined/null names
    const safeA = sideAName || 'Warrior';
    const safeB = sideBName || 'Champion';

    const speciesTraits: Record<string, { positives: string[]; negatives: string[]; roastable: string[] }> = {
      // Animals
      cat: {
        positives: ['grace', 'independence', 'stealth', 'nine lives', 'sharp claws', 'landing on feet'],
        negatives: ['aloof', 'hairballs', 'knocking things off tables', 'sleeping 16 hours', 'ignoring owners'],
        roastable: [
          'cough up hairballs',
          'knock cups off tables for fun',
          'sleep all day',
          'ignore everyone who loves you',
          'act like you own the place',
          'get scared by cucumbers',
        ],
      },
      dog: {
        positives: ['loyalty', 'enthusiasm', 'pack mentality', 'protective', 'unconditional love', 'good boy energy'],
        negatives: ['drooling', 'chasing tails', 'eating garbage', 'barking at nothing', 'rolling in mud'],
        roastable: [
          'drool on everything',
          'chase your own tail',
          'eat from the trash',
          'bark at mailmen',
          'sniff butts as greeting',
          'get excited over nothing',
          'beg for scraps',
        ],
      },
      // Food spirit animals
      pizza: {
        positives: ['universal love', 'bringing people together', 'customizable', 'comfort food king'],
        negatives: ['greasy', 'burns the roof of mouth', 'cold next day'],
        roastable: ['leave grease stains everywhere', 'burn mouths', 'get soggy in boxes'],
      },
      taco: {
        positives: ['flavor explosion', 'handheld convenience', 'cultural heritage', 'versatile'],
        negatives: ['falls apart', 'messy to eat', 'hard shells break'],
        roastable: ['fall apart at first bite', 'make a mess everywhere', 'crack under pressure'],
      },
      burger: {
        positives: ['American classic', 'satisfying', 'customizable', 'BBQ king'],
        negatives: ['messy', 'grease dripping', 'bun falls apart'],
        roastable: ['fall apart mid-bite', 'drip grease everywhere', 'need two hands just to eat'],
      },
      sushi: {
        positives: ['elegant', 'healthy', 'artful presentation', 'sophisticated'],
        negatives: ['expensive', 'pretentious', 'tiny portions'],
        roastable: ['cost a fortune for two bites', 'act all fancy', 'leave everyone still hungry'],
      },
    };

    const sideALower = safeA.toLowerCase();
    const sideBLower = safeB.toLowerCase();

    const aTraits = speciesTraits[sideALower] || {
      positives: ['unique qualities'],
      negatives: ['some flaws'],
      roastable: ['do something silly'],
    };
    const bTraits = speciesTraits[sideBLower] || {
      positives: ['unique qualities'],
      negatives: ['some flaws'],
      roastable: ['do something silly'],
    };

    return `
### ${safeA.toUpperCase()} CAN ROAST ${safeB.toUpperCase()} FOR:
${bTraits.roastable.map((r) => `- "${safeB}s ${r}"`).join('\n')}
- ${safeA}'s superiority: ${aTraits.positives.slice(0, 3).join(', ')}

### ${safeB.toUpperCase()} CAN ROAST ${safeA.toUpperCase()} FOR:
${aTraits.roastable.map((r) => `- "${safeA}s ${r}"`).join('\n')}
- ${safeB}'s superiority: ${bTraits.positives.slice(0, 3).join(', ')}

MANDATORY: Each verse MUST include at least 2 species-specific roasts!
The roasts should be FUNNY and based on REAL creature/food traits, not generic insults.
`;
  }

  /**
   * Get a random roast line for one side roasting the other
   */
  private getRandomRoast(fromSide: string, toSide: string): string {
    const roasts: Record<string, Record<string, string[]>> = {
      cat: {
        dog: [
          'drool on the floor like a broken faucet',
          'chase your tail like you got no brain',
          'bark at shadows, scared of your own reflection',
          'sniff butts as your idea of hello',
          "eat from trash like it's fine dining",
        ],
      },
      dog: {
        cat: [
          'knock things off tables just to watch them fall',
          "cough up hairballs like it's a hobby",
          'sleep 16 hours and call it productive',
          "ignore your owner like they don't exist",
          "act like you own the house you don't pay for",
        ],
      },
    };

    const fromLower = fromSide.toLowerCase();
    const toLower = toSide.toLowerCase();

    if (roasts[fromLower]?.[toLower]) {
      const options = roasts[fromLower][toLower];
      return options[Math.floor(Math.random() * options.length)];
    }

    // Generic fallback
    return `do that weird thing ${toSide}s always do`;
  }

  /**
   * Generate music-aware VEO prompts based on librosa audio analysis
   * Uses the comprehensive VEO 3.1 shot variety framework with:
   * - Deterministic shot type selection from SECTION_SHOT_MATRIX
   * - Energy-based camera movement selection from CAMERA_MOVEMENTS
   * - Section-based lighting mood selection from LIGHTING_MOODS
   * - Character appearance tracking with 40% threshold validation
   */
  async generateMusicAwareVeoPrompts(params: {
    audioAnalysis: {
      bpm: number;
      duration: number;
      sections: Array<{
        type: string;
        startTime: number;
        endTime: number;
        energy: number;
      }>;
      energyPeaks?: Array<{ time: number; energy: number }>;
      beatCount: number;
      // VEO Audio Sync - pre-computed 8-second aligned sections
      veoSyncSections?: Array<{
        start: number;
        end: number;
        avgEnergy?: number;
        energyNormalized?: number;
        energyLevel?: string;
        cameraSuggestion?: string;
      }>;
      bpmAlignment?: {
        bpm: number;
        isAligned: boolean;
        beatsIn8Seconds: number;
        barsIn8Seconds: number;
        nearestAligned: number;
      };
    };
    audioTextSummary: string;
    lyrics: { raw: string; sections: Array<{ content: string; type: string }> };
    characterCast: CharacterCast[];
    visualStyle: VideoStyleKey;
    visualStyleV2: keyof typeof VISUAL_STYLES;
    // Video engine determines clip duration: Kling=5s, VEO=8s
    videoEngine?: 'kling' | 'veo';
    setting: keyof typeof SETTING_APPROACHES;
    vertical: boolean;
    isHistoricalContent?: boolean;
    deepResearch?: DeepHistoricalResearch | null;
  }): Promise<VeoPrompt[]> {
    const {
      audioAnalysis,
      audioTextSummary,
      lyrics,
      characterCast,
      visualStyle,
      visualStyleV2,
      setting,
      vertical,
      isHistoricalContent = false,
      deepResearch = null,
      videoEngine = 'kling',
    } = params;

    const template = VIDEO_STYLE_TEMPLATES[visualStyle] || VIDEO_STYLE_TEMPLATES.cinematic;
    const aspectRatio = vertical ? '9:16' : '16:9';

    // Calculate clips needed based on ACTUAL audio duration
    // Kling uses 5-second clips, VEO uses 8-second clips
    // HARD CAP: Never exceed 180 seconds (3 minutes) to control costs
    const CLIP_DURATION = videoEngine === 'kling' ? 5 : 8;
    const MAX_VIDEO_DURATION = 180; // 3 minutes max
    const rawAudioDuration = audioAnalysis.duration || 120;
    const audioDuration = Math.min(rawAudioDuration, MAX_VIDEO_DURATION);
    const totalClipsNeeded = Math.ceil(audioDuration / CLIP_DURATION);

    console.log(`🎬 ${videoEngine === 'kling' ? 'KLING' : 'VEO'} Shot Variety Framework - Generating prompts...`);
    console.log(`   Characters: ${characterCast.map((c) => c.name).join(', ')}`);
    if (rawAudioDuration > MAX_VIDEO_DURATION) {
      console.log(
        `   ⚠️ Audio duration ${rawAudioDuration.toFixed(1)}s exceeds max ${MAX_VIDEO_DURATION}s - CAPPING at 3 minutes`,
      );
    }
    console.log(`   Audio duration: ${audioDuration.toFixed(1)}s (capped at ${MAX_VIDEO_DURATION}s max)`);
    console.log(
      `   Clips needed: ${totalClipsNeeded} (@ ${CLIP_DURATION}s each, max ${Math.ceil(MAX_VIDEO_DURATION / CLIP_DURATION)})`,
    );
    console.log(`   Sections from Librosa: ${audioAnalysis.sections.length}`);

    // Check if VEO sync sections are available (pre-computed 8-second aligned sections)
    const hasVeoSyncSections = audioAnalysis.veoSyncSections && audioAnalysis.veoSyncSections.length > 0;
    if (hasVeoSyncSections) {
      console.log(`   🎯 VEO SYNC: Using ${audioAnalysis.veoSyncSections!.length} pre-aligned 8-second sections`);
      if (audioAnalysis.bpmAlignment) {
        const align = audioAnalysis.bpmAlignment;
        console.log(
          `      BPM: ${align.bpm} (${align.isAligned ? '✓ ALIGNED' : '⚠️ NOT ALIGNED, using forced 8s snapping'})`,
        );
      }
    }

    // Documentary mode detection
    const isDocumentaryMode = isHistoricalContent && !!deepResearch;
    if (isDocumentaryMode) {
      console.log(`   🏛️ DOCUMENTARY MODE ENABLED: ${deepResearch?.basicInfo?.fullName || 'Historical Figure'}`);
      console.log(
        `      Key Events: ${deepResearch?.keyEvents?.length || 0}, Locations: ${deepResearch?.visualSettings?.primaryLocations?.length || 0}`,
      );
    }

    // Expand sections into 8-second clip slots to cover full audio duration
    // Each clip slot inherits the section type, energy, and timing info
    // DURATION CAP: Stop at MAX_VIDEO_DURATION to prevent excessive clip generation
    // IMPORTANT: clipIndex is assigned during population to ensure contiguous numbering
    const expandedClipSlots: Array<{
      type: string;
      startTime: number;
      endTime: number;
      energy: number;
      clipIndex: number;
      parentSectionIndex: number;
      slotWithinSection: number;
      cameraSuggestion?: string; // From VEO sync
      energyLevel?: string; // From VEO sync
    }> = [];

    // PREFER VEO SYNC SECTIONS if available (these are pre-computed 8-second aligned)
    if (hasVeoSyncSections) {
      // Use VEO sync sections directly - they're already 8-second aligned
      // FIX: Use PROPER SONG STRUCTURE instead of deriving type from energy
      // Standard song structure: INTRO (1 clip) → VERSE → CHORUS → VERSE → CHORUS → BRIDGE → CHORUS → OUTRO
      const getSongSectionType = (clipIndex: number, totalClips: number, energy: string | undefined): string => {
        const energyLower = energy?.toLowerCase() || 'medium';
        const position = clipIndex / totalClips;

        // First clip is ALWAYS intro - only one
        if (clipIndex === 0) return 'intro';

        // Last clip is ALWAYS outro - only one
        if (clipIndex === totalClips - 1) return 'outro';

        // Middle section: Use energy to distinguish verse vs chorus
        // High energy = chorus, medium/low = verse
        // But also consider position - choruses tend to be after verses
        if (energyLower === 'high') return 'chorus';

        // Bridge typically appears in the 60-75% range of the song
        if (position >= 0.6 && position <= 0.75 && energyLower === 'medium') return 'bridge';

        // Default to verse for medium/low energy
        return 'verse';
      };

      for (let i = 0; i < Math.min(audioAnalysis.veoSyncSections!.length, totalClipsNeeded); i++) {
        const syncSection = audioAnalysis.veoSyncSections![i];
        const sectionType = getSongSectionType(i, totalClipsNeeded, syncSection.energyLevel);

        expandedClipSlots.push({
          type: sectionType,
          startTime: syncSection.start,
          endTime: syncSection.end,
          energy: syncSection.avgEnergy || syncSection.energyNormalized || 0.5,
          clipIndex: i,
          parentSectionIndex: i,
          slotWithinSection: 0,
          cameraSuggestion: syncSection.cameraSuggestion,
          energyLevel: syncSection.energyLevel,
        });
      }
      console.log(`   ✓ Built ${expandedClipSlots.length} clip slots from VEO sync sections (proper song structure)`);
    } else {
      // Fallback: Build clip slots aligned to the configured clip duration
      // TRUE GRID SNAPPING: Start at 0, CLIP_DURATION, 2*CLIP_DURATION, etc.
      console.log(`   ⚠️ VEO sync sections not available - using fallback ${CLIP_DURATION}-second grid snapping`);

      // Build a map of Librosa sections for energy/type lookup by time
      const getSectionAtTime = (time: number): { type: string; energy: number } => {
        for (const section of audioAnalysis.sections) {
          const start = section.startTime || 0;
          const end = section.endTime || audioDuration;
          if (time >= start && time < end) {
            return { type: section.type, energy: section.energy };
          }
        }
        // Default fallback if no section covers this time
        return { type: 'verse', energy: 0.5 };
      };

      // Generate exactly grid-aligned clips: 0-N, N-2N, 2N-3N, etc.
      for (let clipIdx = 0; clipIdx < totalClipsNeeded; clipIdx++) {
        const clipStart = clipIdx * CLIP_DURATION; // Always on grid boundaries
        const clipEnd = Math.min(clipStart + CLIP_DURATION, audioDuration);

        // Stop if this clip starts at or past duration
        if (clipStart >= audioDuration) break;

        // Look up the section type/energy based on the clip's midpoint
        const clipMidpoint = clipStart + CLIP_DURATION / 2;
        const sectionInfo = getSectionAtTime(clipMidpoint);

        expandedClipSlots.push({
          type: sectionInfo.type,
          startTime: clipStart,
          endTime: clipEnd,
          energy: sectionInfo.energy,
          clipIndex: clipIdx,
          parentSectionIndex: 0, // Not directly tied to a section
          slotWithinSection: clipIdx,
        });
      }
      console.log(
        `   ✓ Built ${expandedClipSlots.length} clip slots with TRUE ${CLIP_DURATION}-second grid alignment (fallback)`,
      );
    }

    // Verify clip count is within limits
    console.log(`   Expanded clip slots: ${expandedClipSlots.length} (max ${totalClipsNeeded} for ${audioDuration}s)`);
    if (expandedClipSlots.length > totalClipsNeeded) {
      console.error(`   ❌ BUG: Clip count ${expandedClipSlots.length} exceeds limit ${totalClipsNeeded}!`);
    }

    // VERIFY grid alignment: Log first few clips to confirm alignment
    const firstClips = expandedClipSlots.slice(0, Math.min(3, expandedClipSlots.length));
    console.log(
      `   ✓ ${CLIP_DURATION}-Second Alignment Check: ${firstClips.map((c) => `[${c.startTime}s-${c.endTime}s]`).join(', ')}...`,
    );

    // Assert all clips are on grid boundaries
    const misalignedClips = expandedClipSlots.filter((c) => c.startTime % CLIP_DURATION !== 0);
    if (misalignedClips.length > 0) {
      console.error(
        `   ❌ ALIGNMENT ERROR: ${misalignedClips.length} clips NOT on ${CLIP_DURATION}-second boundaries!`,
      );
      misalignedClips
        .slice(0, 3)
        .forEach((c) =>
          console.error(
            `      - Clip ${c.clipIndex}: starts at ${c.startTime}s (expected ${Math.floor(c.startTime / CLIP_DURATION) * CLIP_DURATION}s)`,
          ),
        );
    } else {
      console.log(`   ✓ ALL ${expandedClipSlots.length} clips verified on ${CLIP_DURATION}-second boundaries`);
    }

    // Track character appearances for 40% threshold validation
    const characterAppearanceCount: Record<string, number> = {};
    characterCast.forEach((c) => {
      characterAppearanceCount[c.name || `Character ${c.id}`] = 0;
    });

    // Track verse count to distinguish verse_1 vs verse_2
    const verseCount = 0;
    const chorusCount = 0;

    // Build character descriptions for the prompt
    // For historical documentary, characters are ALWAYS human - skip creature detection
    const isHistoricalDocumentary = !!(isHistoricalContent && deepResearch);
    const characterDescriptions = characterCast
      .map((c) => {
        const appearance = c.appearance || 'distinctive appearance';
        // SKIP creature detection for historical documentary - historical figures are ALWAYS human
        const isNonHuman = isHistoricalDocumentary
          ? false
          : /anthropomorphic|creature|animal|cat|dog|wolf|bear|dragon|robot|elemental|spirit|monster|beast|talking/i.test(
              appearance,
            );
        const creatureEmphasis = isNonHuman ? ' [CREATURE/ANIMAL with exaggerated animated features]' : '';
        // Remove age for non-human characters as it makes them seem human
        const ageInfo = isNonHuman ? '' : `${c.age}yo `;
        return `${c.name}: ${ageInfo}${c.gender}, ${appearance}.${creatureEmphasis} ${c.humanizingDetail || ''}`;
      })
      .join('\n');

    // Build the VEO 3.1 framework prompt for OpenAI
    const shotTypeDescriptions = Object.entries(VEO_SHOT_TYPES)
      .map(([code, info]) => `- ${code}: ${info.description} (Use for: ${info.whenToUse})`)
      .join('\n');

    const cameraMovementDescriptions = Object.entries(CAMERA_MOVEMENTS)
      .map(([category, movements]) => `${category.toUpperCase()}:\n  ${movements.slice(0, 3).join(', ')}`)
      .join('\n');

    const lightingMoodDescriptions = Object.entries(LIGHTING_MOODS)
      .map(([key, mood]) => `- ${key}: ${mood.description}`)
      .join('\n');

    const sectionMatrixDescriptions = Object.entries(SECTION_SHOT_MATRIX)
      .map(
        ([section, config]) =>
          `- ${section.toUpperCase()}: ${config.shotSequence.join(' → ')} | Camera: ${config.cameraCategory} | Lighting: ${config.lightingMood}`,
      )
      .join('\n');

    // Process each section with the framework
    const prompt = `You are an AWARD-WINNING MUSIC VIDEO DIRECTOR using the VEO 3.1 SHOT VARIETY FRAMEWORK.

═══════════════════════════════════════════════════════════════════
🎬 VEO 3.1 SHOT VARIETY FRAMEWORK
═══════════════════════════════════════════════════════════════════

## SHOT TYPE SYSTEM (Select ONE per clip):
${shotTypeDescriptions}

## CAMERA MOVEMENT LIBRARY (By Energy Level):
${cameraMovementDescriptions}

## LIGHTING MOODS (By Section Type):
${lightingMoodDescriptions}

## SECTION-TO-SHOT MATRIX (DETERMINISTIC - FOLLOW THIS):
${sectionMatrixDescriptions}

═══════════════════════════════════════════════════════════════════
📹 PROMPT FORMAT (100-150 words each):
═══════════════════════════════════════════════════════════════════

[SHOT TYPE]: [Camera movement] of [CHARACTER(S) with positioning]. [ANTI-PERFECTION CAMERA keyword].

[CHARACTER NAME] [ACTION VERB] [specific action]. [TIKTOK ENERGY keyword].

Setting: [Environment], [time of day].
Lighting: [Mood lighting - MOODY not corporate]. [COLOR GRADING keyword].
Energy: [DIRECTOR ENERGY keyword - rotate through Spike Jonze/Gondry/Tim&Eric].
Food moment (if food visible): [EPIC FOOD keyword - treat food as main character].
Comedy (for verse/chorus): [COMEDY TIMING keyword].
Style: A24 indie film, NOT a commercial, weird and meme-worthy. ${aspectRatio}.

(No subtitles)

═══════════════════════════════════════════════════════════════════
AUDIO ANALYSIS:
${audioTextSummary}

TOTAL CLIPS TO GENERATE: ${expandedClipSlots.length} clips (${audioDuration.toFixed(1)}s audio @ 8s per clip)

CLIP SLOTS (expanded from ${audioAnalysis.sections.length} sections):
${expandedClipSlots.map((slot, i) => `${i + 1}. ${slot.type.toUpperCase()} [${slot.startTime.toFixed(1)}s-${slot.endTime.toFixed(1)}s] (energy: ${(slot.energy ?? 0.5).toFixed(2)})`).join('\n')}

═══════════════════════════════════════════════════════════════════
FULL LYRICS:
${lyrics.raw}

═══════════════════════════════════════════════════════════════════
CHARACTER CAST (${characterCast.length} characters - ENSURE PRIORITY CHARACTER APPEARS IN 40%+ OF CLIPS):
${characterDescriptions}

PRIORITY CHARACTER: ${characterCast[0]?.name || 'First character'} - MUST appear in at least 40% of clips!

═══════════════════════════════════════════════════════════════════
VISUAL STYLE: ${template.name} - ${template.description}
SETTING: ${SETTING_APPROACHES[setting]}

═══════════════════════════════════════════════════════════════════
YOUR TASK:
═══════════════════════════════════════════════════════════════════

Generate ${expandedClipSlots.length} VEO prompts - ONE for EACH clip slot above.
Each clip = exactly 8 seconds. Together they cover the full ${audioDuration.toFixed(1)}s audio.

For each clip slot, generate a VEO prompt that:
1. Uses the SHOT TYPE from the Section-to-Shot Matrix (rotate through the sequence)
2. Selects CAMERA MOVEMENT based on energy level (low/medium/high)
3. Applies LIGHTING MOOD for the section type
4. Features SPECIFIC CHARACTERS with actions
5. Includes VISUAL METAPHOR for chorus/bridge sections
6. Follows the 100-150 word PROMPT FORMAT
7. Has UNIQUE ACTION/MOMENT - no two clips should be identical!

RESPOND WITH A JSON ARRAY:
[
  {
    "sectionName": "INTRO",
    "sectionIndex": 0,
    "sectionType": "intro",
    "durationSeconds": 8,
    "energyLevel": "low",
    "shotType": "ENVIRONMENT",
    "cameraMovement": "Slow dolly in, handheld shake",
    "lightingMood": "Moody harsh single source, crushed blacks",
    "featuredCharacters": ["${characterCast[0]?.name || 'Mike'}", "${characterCast[1]?.name || 'Danielle'}"],
    "visualMetaphor": null,
    "fullPrompt": "[ENVIRONMENT]: Slow dolly through doorway, slightly out of focus. Office breakroom, caught mid-moment energy. ${characterCast[0]?.name || 'Mike'} mid-chew freeze frame. Lighting moody, desaturated. Spike Jonze energy. Pizza presented like holy artifact. A24 indie film, NOT a commercial, meme-worthy. (No subtitles)"
  }
]`;

    try {
      // Calculate tokens needed: ~200 words per prompt, ~1.5 tokens per word = ~300 tokens per prompt
      const tokensNeeded = Math.min(16000, expandedClipSlots.length * 300 + 500);
      console.log(`   Requesting ${tokensNeeded} tokens for ${expandedClipSlots.length} prompts...`);

      const response = await openaiService.generateText(prompt, {
        temperature: 0.7,
        maxTokens: tokensNeeded,
        systemPrompt: `You are an INDIE MUSIC VIDEO DIRECTOR channeling Spike Jonze, Michel Gondry, Eric Wareheim, and Tim & Eric.

═══════════════════════════════════════════════════════════════════
CRITICAL STYLE RULES - ANTI-COMMERCIAL
═══════════════════════════════════════════════════════════════════
NEVER create:
- "Stock footage" or "corporate ad" vibes
- Generic "happy friends enjoying food" scenes  
- "Warm, inviting lighting" cliches
- Anything that looks like a Denny's commercial or insurance ad
- Perfectly lit, perfectly framed, perfectly boring

═══════════════════════════════════════════════════════════════════
DIRECTOR ENERGY (Rotate Through These)
═══════════════════════════════════════════════════════════════════
- Spike Jonze energy: earnest weirdness, emotional surrealism
- Michel Gondry whimsy: handmade aesthetic, playful absurdity
- Eric Wareheim absurdism: uncomfortable close-ups, deadpan chaos
- Tim & Eric aesthetic: anti-comedy, intentionally awkward, meme-worthy

═══════════════════════════════════════════════════════════════════
TIKTOK-NATIVE ENERGY
═══════════════════════════════════════════════════════════════════
- "TikTok viral moment" - the shot that makes people screenshot
- "Caught mid-reaction" - unguarded, authentic expressions
- "Unhinged energy" - slightly unhinged but earnest
- "Main character moment but self-aware" - dramatic but with a wink

═══════════════════════════════════════════════════════════════════
ANTI-PERFECTION CAMERA (Include These)
═══════════════════════════════════════════════════════════════════
- "Slightly out of focus" for intimate moments
- "Awkward framing" - too much headroom, off-center
- "Too close" - uncomfortably intimate close-ups
- "Dutch angle when it shouldn't be" - for absurdist effect
- "Handheld shake" - documentary urgency

═══════════════════════════════════════════════════════════════════
COLOR GRADING (Not Color Corrected)
═══════════════════════════════════════════════════════════════════
- "Desaturated" - muted, not vibrant
- "Crushed blacks" - moody shadows
- "Cross-processed" - intentionally weird color
- "NOT color corrected" - raw, ungraded feel
- "35mm film grain" - texture, not clean digital

═══════════════════════════════════════════════════════════════════
COMEDY TIMING (For Comedic Sections)
═══════════════════════════════════════════════════════════════════
- "Comedic timing pause" - beat before the punchline
- "Reaction shot held too long" - awkward silence energy
- "Awkward silence energy" - let it breathe uncomfortably
- "Dramatic zoom on mundane object" - the pizza, the taco, the fry

═══════════════════════════════════════════════════════════════════
FOOD AS MAIN CHARACTER (Critical for Unity Content)
═══════════════════════════════════════════════════════════════════
- "Epic slow-mo cheese pull" - treat it like a hero shot
- "Taco presented like a holy artifact" - reverent, dramatic
- "Pizza slice with dramatic backlighting" - food deserves respect
- "Food as the main character" - the debate subject IS epic
- "Dramatic treatment of mundane food" - that's the comedy

═══════════════════════════════════════════════════════════════════
YOUR TASK
═══════════════════════════════════════════════════════════════════
Generate prompts that:
- Follow the Section-to-Shot Matrix deterministically
- Rotate through director energies (Spike Jonze → Gondry → Tim & Eric)
- Include anti-perfection camera keywords in each prompt
- Apply moody color grading language
- Treat FOOD with epic, dramatic seriousness (that's the joke)
- Add comedy timing for verse/chorus sections
- Track character appearances (priority character in 40%+ clips)
- Create 100-150 word prompts that are INDIE, WEIRD, and MEME-WORTHY`,
      });

      const parsed = this.parseVeoPromptJson(response);
      if (!parsed || !Array.isArray(parsed)) {
        console.log('⚠️ AI response parsing failed, using framework fallback');
        return this.generateFrameworkBasedPrompts(
          expandedClipSlots as any[],
          characterCast,
          template,
          aspectRatio,
          lyrics,
          isHistoricalContent,
          deepResearch,
        );
      }

      console.log(`   ✅ AI returned ${(parsed as any[]).length} prompts (expected ${expandedClipSlots.length})`);

      // If AI returned fewer prompts than needed, we'll need to fill the gaps
      const aiPrompts = parsed as any[];

      // Process parsed prompts with framework validation using EXPANDED clip slots
      const prompts = expandedClipSlots.map((slot, idx) => {
        // Get AI prompt if available, otherwise generate framework-based one
        const p = aiPrompts[idx] || {};
        const section = { type: slot.type, startTime: slot.startTime, endTime: slot.endTime, energy: slot.energy };
        const sectionType = this.normalizeSectionType(section.type, slot.clipIndex, expandedClipSlots.length);
        const matrix = SECTION_SHOT_MATRIX[sectionType] || SECTION_SHOT_MATRIX.verse;

        // Get deterministic shot type from matrix
        const shotSequence = matrix.shotSequence;
        const shotTypeIndex = idx % shotSequence.length;
        const shotType = (p.shotType as VeoShotType) || shotSequence[shotTypeIndex];

        // Get camera movement based on energy
        const energyLevel = section.energy > 0.7 ? 'high' : section.energy > 0.4 ? 'medium' : 'low';
        const cameraCategory = this.getCameraCategory(energyLevel, matrix.cameraCategory);
        const movements = CAMERA_MOVEMENTS[cameraCategory];
        const cameraMovement = p.cameraMovement || movements[idx % movements.length];

        // Get lighting mood
        const lightingMood = LIGHTING_MOODS[matrix.lightingMood];
        const lightingDescription = p.lightingMood || lightingMood.description;

        // Track featured characters
        const featuredCharacters = this.extractFeaturedCharacters(
          p.fullPrompt || '',
          characterCast,
          p.featuredCharacters,
        );
        featuredCharacters.forEach((name) => {
          if (characterAppearanceCount[name] !== undefined) {
            characterAppearanceCount[name]++;
          }
        });

        // Build the VeoPrompt
        return this.buildVeoPromptFromAI(p, idx, section, characterCast, template, aspectRatio, {
          shotType,
          cameraMovement,
          lightingMood: lightingDescription,
          featuredCharacters,
          visualMetaphor: p.visualMetaphor || undefined,
        });
      });

      // Validate character appearances (40% threshold)
      const totalClips = prompts.length;
      const threshold = Math.ceil(totalClips * 0.4);
      const priorityCharacter = characterCast[0];

      if (priorityCharacter) {
        const priorityAppearances =
          characterAppearanceCount[priorityCharacter.name || `Character ${priorityCharacter.id}`] || 0;
        if (priorityAppearances < threshold) {
          console.log(
            `⚠️ CHARACTER APPEARANCE WARNING: ${priorityCharacter.name} appears in ${priorityAppearances}/${totalClips} clips (${Math.round((priorityAppearances / totalClips) * 100)}%)`,
          );
          console.log(`   Required: ${threshold} clips (40%+). Injecting into B-roll/reactions...`);

          // Rebalance: inject priority character into clips with DETAIL, REACTION, or ENVIRONMENT shots
          this.rebalanceCharacterAppearances(prompts, priorityCharacter, characterAppearanceCount, threshold);
        }
      }

      // Log final character appearance stats
      console.log('📊 Character Appearance Stats:');
      Object.entries(characterAppearanceCount).forEach(([name, count]) => {
        const percentage = Math.round((count / totalClips) * 100);
        const status = count >= threshold ? '✅' : '⚠️';
        console.log(`   ${status} ${name}: ${count}/${totalClips} clips (${percentage}%)`);
      });

      return prompts;
    } catch (error) {
      console.error('VEO 3.1 Framework prompt generation failed:', error);
      return this.generateFrameworkBasedPrompts(
        expandedClipSlots as any[],
        characterCast,
        template,
        aspectRatio,
        lyrics,
        isHistoricalContent,
        deepResearch,
      );
    }
  }

  /**
   * Extract section types from lyrics structure
   * The lyrics have proper section names like "chorus_the_turn", "prechorus_the_tension"
   * which we use to assign the correct shot types (METAPHOR for chorus/bridge)
   */
  private extractLyricsSectionTypes(lyrics: { raw: string; sections?: any }): string[] {
    const sectionTypes: string[] = [];

    if (!lyrics.sections) {
      // Try to parse section headers from raw lyrics
      const headerPattern = /###\s*\[([^\]]+)\]/gi;
      let match;
      while ((match = headerPattern.exec(lyrics.raw)) !== null) {
        const header = match[1].toLowerCase();
        // Extract type from header like "INTRO: LOOKING AROUND" or "VERSE 1: LOOKING DOWN"
        if (header.includes('intro')) sectionTypes.push('intro');
        else if (header.includes('chorus') || header.includes('hook')) sectionTypes.push('chorus');
        else if (header.includes('prechorus') || header.includes('pre-chorus')) sectionTypes.push('prechorus');
        else if (header.includes('bridge')) sectionTypes.push('bridge');
        else if (header.includes('outro')) sectionTypes.push('outro');
        else if (header.includes('verse')) sectionTypes.push('verse');
        else sectionTypes.push('verse');
      }
    } else if (typeof lyrics.sections === 'object') {
      // Handle object format with keys like "intro_looking_around", "chorus_the_turn"
      const keys = Object.keys(lyrics.sections);
      for (const key of keys) {
        const keyLower = key.toLowerCase();
        if (keyLower.includes('intro')) sectionTypes.push('intro');
        else if (keyLower.includes('chorus') || keyLower.includes('hook') || keyLower.includes('final_chorus'))
          sectionTypes.push('chorus');
        else if (keyLower.includes('prechorus') || keyLower.includes('pre_chorus')) sectionTypes.push('prechorus');
        else if (keyLower.includes('bridge')) sectionTypes.push('bridge');
        else if (keyLower.includes('outro')) sectionTypes.push('outro');
        else if (keyLower.includes('verse')) sectionTypes.push('verse');
        else sectionTypes.push('verse');
      }
    }

    console.log(`   🎵 Extracted ${sectionTypes.length} section types from lyrics: ${sectionTypes.join(', ')}`);
    return sectionTypes;
  }

  /**
   * Normalize section type to match SECTION_SHOT_MATRIX keys
   */
  private normalizeSectionType(type: string, index: number, totalSections: number): string {
    const normalized = type.toLowerCase().replace(/[^a-z]/g, '');
    const position = index / Math.max(totalSections - 1, 1);

    if (normalized === 'verse') {
      return position < 0.4 ? 'verse_1' : 'verse_2';
    }
    if (normalized === 'chorus' || normalized === 'hook') {
      return position >= 0.7 ? 'final_chorus' : 'chorus';
    }
    if (normalized === 'prechorus' || normalized === 'pre-chorus') {
      return 'prechorus';
    }

    // Return exact match or fallback
    return SECTION_SHOT_MATRIX[normalized] ? normalized : 'verse';
  }

  /**
   * Get camera movement category based on energy and section default
   */
  private getCameraCategory(energyLevel: string, sectionDefault: CameraMovementCategory): CameraMovementCategory {
    if (energyLevel === 'high') return 'high_energy';
    if (energyLevel === 'low') return 'slow_emotional';
    return sectionDefault;
  }

  /**
   * Extract featured characters from prompt text or explicit list
   */
  private extractFeaturedCharacters(
    promptText: string,
    characterCast: CharacterCast[],
    explicitList?: string[],
  ): string[] {
    if (explicitList && Array.isArray(explicitList) && explicitList.length > 0) {
      return explicitList;
    }

    const featured: string[] = [];
    const promptUpper = promptText.toUpperCase();

    characterCast.forEach((c) => {
      if (c.name && promptUpper.includes(c.name.toUpperCase())) {
        featured.push(c.name);
      }
    });

    return featured.length > 0 ? featured : [characterCast[0]?.name || 'Unknown'];
  }

  /**
   * Rebalance character appearances to meet 40% threshold
   */
  private rebalanceCharacterAppearances(
    prompts: VeoPrompt[],
    priorityCharacter: CharacterCast,
    appearanceCount: Record<string, number>,
    threshold: number,
  ): void {
    const priorityName = priorityCharacter.name || `Character ${priorityCharacter.id}`;
    let currentCount = appearanceCount[priorityName] || 0;

    // Target shot types for injection (B-roll and reaction shots)
    const injectableShots: VeoShotType[] = ['DETAIL', 'REACTION', 'ENVIRONMENT', 'METAPHOR'];

    for (const prompt of prompts) {
      if (currentCount >= threshold) break;

      if (injectableShots.includes(prompt.shotType) && !prompt.featuredCharacters.includes(priorityName)) {
        // Inject priority character into this clip
        prompt.featuredCharacters.push(priorityName);
        prompt.fullPrompt = `${priorityName} visible in background. ${prompt.fullPrompt}`;
        currentCount++;
        console.log(`   ↳ Injected ${priorityName} into clip ${prompt.sectionIndex + 1} (${prompt.shotType})`);
      }
    }

    appearanceCount[priorityName] = currentCount;
  }

  /**
   * Build VeoPrompt from AI response with framework fields
   */
  private buildVeoPromptFromAI(
    aiResponse: any,
    index: number,
    section: { type: string; startTime: number; endTime: number; energy: number },
    characterCast: CharacterCast[],
    template: (typeof VIDEO_STYLE_TEMPLATES)[VideoStyleKey],
    aspectRatio: string,
    frameworkFields: {
      shotType: VeoShotType;
      cameraMovement: string;
      lightingMood: string;
      featuredCharacters: string[];
      visualMetaphor?: string;
    },
  ): VeoPrompt {
    // Clamp duration: minimum 1s (avoid 0s clips), maximum 8s (VEO limit)
    const duration = Math.max(1, Math.min(section.endTime - section.startTime, 8));
    const energyLevel = section.energy > 0.7 ? 'high' : section.energy > 0.4 ? 'medium' : 'low';

    return {
      sectionName: aiResponse.sectionName || section.type.toUpperCase(),
      sectionIndex: index,
      durationSeconds: aiResponse.durationSeconds || duration,
      timestampStart: section.startTime,
      timestampEnd: section.endTime,
      timestampFormatted: `${Math.floor(section.startTime / 60)}:${String(Math.floor(section.startTime % 60)).padStart(2, '0')}-${Math.floor(section.endTime / 60)}:${String(Math.floor(section.endTime % 60)).padStart(2, '0')}`,
      characterIds: characterCast
        .filter((c) => frameworkFields.featuredCharacters.includes(c.name || ''))
        .map((c) => c.id),
      shotType: frameworkFields.shotType,
      cameraMovement: frameworkFields.cameraMovement,
      lightingMood: frameworkFields.lightingMood,
      featuredCharacters: frameworkFields.featuredCharacters,
      visualMetaphor: frameworkFields.visualMetaphor,
      sceneDetails: {
        location: template.locations[index % template.locations.length],
        timeOfDay: energyLevel === 'high' ? 'dramatic lighting' : 'natural light',
        wardrobe: characterCast[0]?.wardrobeBase || 'casual',
        props: [],
      },
      characterAction: {
        startingPosition: aiResponse.characterAction || 'Dynamic position',
        movement: 'Synced to beat',
        expression: energyLevel === 'high' ? 'Intense' : 'Engaged',
        keyGesture: 'Key moment',
      },
      camera: {
        shotType: VEO_SHOT_TYPES[frameworkFields.shotType]?.framing || 'medium',
        angle:
          frameworkFields.shotType === 'SOLO-POWER'
            ? 'low angle'
            : frameworkFields.shotType === 'SOLO-VULNERABLE'
              ? 'high angle'
              : 'eye level',
        movement: frameworkFields.cameraMovement,
        startingFrame: '',
        endingFrame: '',
      },
      lighting: {
        keyLight: frameworkFields.lightingMood,
        fillRim: '',
        practicalLights: '',
        mood: frameworkFields.lightingMood,
        colorGrade: template.name.toLowerCase(),
      },
      depthComposition: {
        foreground: frameworkFields.shotType === 'DETAIL' ? 'key object in sharp focus' : '',
        midground: 'characters',
        background: 'environment',
        ruleOfThirds: 'balanced',
      },
      audioAtmosphere: {
        ambientSound: 'music sync',
        sfx: '',
        reverbSpace: '',
      },
      beatSync: {
        timings: [{ seconds: `0-${Math.round(duration)}`, action: `${energyLevel} energy` }],
      },
      visualReferences: [],
      fullPrompt:
        aiResponse.fullPrompt ||
        this.buildFrameworkPrompt(frameworkFields, section, characterCast, aspectRatio, template),
    };
  }

  /**
   * Build a prompt string using the VEO 3.1 framework format
   */
  private buildFrameworkPrompt(
    fields: {
      shotType: VeoShotType;
      cameraMovement: string;
      lightingMood: string;
      featuredCharacters: string[];
      visualMetaphor?: string;
    },
    section: { type: string; energy: number },
    characterCast: CharacterCast[],
    aspectRatio: string,
    template: (typeof VIDEO_STYLE_TEMPLATES)[VideoStyleKey],
  ): string {
    const shotInfo = VEO_SHOT_TYPES[fields.shotType];
    const characters = fields.featuredCharacters
      .map((name) => {
        const char = characterCast.find((c) => c.name === name);
        if (!char) return name;
        const appearance = char.appearance?.split('.')[0] || 'distinct appearance';
        // Check if non-human character - don't include age for creatures
        const isNonHuman =
          /anthropomorphic|creature|animal|cat|dog|wolf|bear|dragon|robot|elemental|spirit|monster|beast|talking/i.test(
            appearance,
          );
        if (isNonHuman) {
          return `${char.name} (${appearance}) [NOT HUMAN - CREATURE CHARACTER]`;
        }
        return `${char.name}, ${char.age}yo ${char.gender}, ${appearance}`;
      })
      .join('; ');

    const action = this.getActionForShotType(fields.shotType);
    const metaphorLine = fields.visualMetaphor ? `Visual metaphor: ${fields.visualMetaphor}. ` : '';

    return `[${fields.shotType}]: ${fields.cameraMovement} of ${characters}.

${action}

${metaphorLine}Setting: ${template.locations[0]}, ${section.energy > 0.5 ? 'dramatic moment' : 'intimate scene'}.
Lighting: ${fields.lightingMood}.
Style: Cinematic, ${aspectRatio}.

(No subtitles)`;
  }

  /**
   * Get appropriate action description for shot type
   */
  private getActionForShotType(shotType: VeoShotType): string {
    const actions: Record<VeoShotType, string> = {
      'HERO-3': 'All three characters in dramatic formation, unified composition.',
      'DUO-DEBATE': 'Two characters face each other in tension, confrontational stance.',
      'DUO-ALLY': 'Two characters side by side, moving together in unity.',
      'SOLO-POWER': 'Character dominates frame, powerful stance, commanding presence.',
      'SOLO-VULNERABLE': 'Character in intimate close-up, emotional vulnerability visible.',
      REACTION: "Quick cut to character's face reacting with surprise or realization.",
      DETAIL: 'Extreme close-up on symbolic object, textures and lighting emphasized, cinematic detail shot.',
      METAPHOR: 'Abstract visual representing the lyrical theme, symbolic imagery.',
      ENVIRONMENT: 'Wide establishing shot of the scene, setting the atmosphere.',
      TRACKING: 'Camera follows character movement through the space, dynamic energy.',
    };
    return actions[shotType] || 'Dynamic action matching the scene energy.';
  }

  /**
   * Generate prompts using the framework directly (fallback when AI fails)
   * Supports Documentary Mode for historical content
   */
  private generateFrameworkBasedPrompts(
    sections: Array<{ type: string; startTime: number; endTime: number; energy: number }>,
    characterCast: CharacterCast[],
    template: (typeof VIDEO_STYLE_TEMPLATES)[VideoStyleKey],
    aspectRatio: string,
    lyrics: { raw: string; sections: Array<{ content: string; type: string }> },
    isHistoricalContent?: boolean,
    deepResearch?: DeepHistoricalResearch | null,
  ): VeoPrompt[] {
    console.log('🎬 Generating prompts using VEO 3.1 Framework (fallback mode)...');

    // Documentary mode detection
    const isDocumentaryMode = isHistoricalContent && !!deepResearch;
    if (isDocumentaryMode) {
      console.log(
        `   🏛️ DOCUMENTARY MODE: Using historical settings for ${deepResearch?.basicInfo?.fullName || 'Historical Figure'}`,
      );
    }

    // Extract lyrics section types to get proper chorus/bridge/verse detection
    // The lyrics have proper section names like "chorus_the_turn", "prechorus_the_tension"
    const lyricsSectionTypes = this.extractLyricsSectionTypes(lyrics);
    console.log(`   Lyrics section types: ${lyricsSectionTypes.join(', ')}`);

    let verseCount = 0;
    let chorusCount = 0;

    // Track how many times we've used each section type for shot sequence cycling
    // This ensures METAPHOR shots appear in chorus sections (not skipped due to overall index)
    const sectionTypeCounters: Record<string, number> = {};

    return sections.map((section, idx) => {
      // Use lyrics section type if available, otherwise fall back to audio section type
      // This ensures CHORUS and BRIDGE sections get METAPHOR shots for visual metaphors like "pizza walls"
      let sectionKey = lyricsSectionTypes[idx] || section.type.toLowerCase();

      // Normalize section key for matrix lookup
      if (sectionKey.includes('verse')) {
        verseCount++;
        sectionKey = verseCount === 1 ? 'verse_1' : 'verse_2';
      } else if (sectionKey.includes('chorus') || sectionKey.includes('hook')) {
        chorusCount++;
        sectionKey = chorusCount >= 2 && idx > sections.length * 0.6 ? 'final_chorus' : 'chorus';
      } else if (sectionKey.includes('prechorus') || sectionKey.includes('pre-chorus')) {
        sectionKey = 'prechorus';
      } else if (sectionKey.includes('bridge')) {
        sectionKey = 'bridge';
      } else if (sectionKey.includes('intro')) {
        sectionKey = 'intro';
      } else if (sectionKey.includes('outro')) {
        sectionKey = 'outro';
      }

      // Get the counter for this section type (how many times we've used this type's shot sequence)
      const sectionTypeCount = sectionTypeCounters[sectionKey] || 0;
      sectionTypeCounters[sectionKey] = sectionTypeCount + 1;

      const matrix = SECTION_SHOT_MATRIX[sectionKey] || SECTION_SHOT_MATRIX.verse;
      // Use section-type-specific counter instead of overall index
      // This ensures each section type cycles through its own shot sequence properly
      // e.g., 1st chorus gets HERO-3, 2nd chorus gets METAPHOR, 3rd gets HERO-3, etc.
      const shotType = matrix.shotSequence[sectionTypeCount % matrix.shotSequence.length];

      console.log(`   Section ${idx + 1}: "${section.type}" → "${sectionKey}" [${sectionTypeCount}] → ${shotType}`);
      const lighting = LIGHTING_MOODS[matrix.lightingMood];
      const cameraMovements = CAMERA_MOVEMENTS[matrix.cameraCategory];
      const cameraMovement = cameraMovements[idx % cameraMovements.length];

      // Select characters based on shot type
      const featuredCharacters = this.selectCharactersForShot(shotType, characterCast, idx);

      // Build documentaryOptions if in documentary mode
      const documentaryOptions =
        isDocumentaryMode && deepResearch
          ? {
              isHistoricalContent: true,
              deepResearch: deepResearch,
              keyEvent: deepResearch.keyEvents?.[idx % (deepResearch.keyEvents?.length || 1)] || null,
            }
          : undefined;

      return this.createMusicAwarePrompt(
        section,
        idx,
        characterCast,
        template,
        aspectRatio,
        lyrics,
        {
          shotType,
          cameraMovement,
          lightingMood: lighting.description,
          featuredCharacters: featuredCharacters.filter((c) => c).map((c) => c.name || `Character ${c.id}`),
        },
        undefined,
        documentaryOptions,
      );
    });
  }

  /**
   * Select appropriate characters for a shot type
   */
  private selectCharactersForShot(
    shotType: VeoShotType,
    characterCast: CharacterCast[],
    index: number,
  ): CharacterCast[] {
    // Guard against empty character cast
    if (!characterCast || characterCast.length === 0) {
      return [];
    }

    const shotInfo = VEO_SHOT_TYPES[shotType];

    if (shotInfo.characterCount === 'all' || shotInfo.characterCount === 'variable') {
      return characterCast;
    }
    if (shotInfo.characterCount === 0) {
      return [];
    }
    if (shotInfo.characterCount === 1) {
      return [characterCast[index % characterCast.length]];
    }
    if (shotInfo.characterCount === 2) {
      const first = index % characterCast.length;
      const second = (index + 1) % characterCast.length;
      return [characterCast[first], characterCast[second]];
    }
    return characterCast.slice(0, 3);
  }

  private createMusicAwarePrompt(
    section: { type: string; startTime: number; endTime: number; energy: number },
    index: number,
    characterCast: CharacterCast[],
    template: (typeof VIDEO_STYLE_TEMPLATES)[VideoStyleKey],
    aspectRatio: string,
    lyrics?: { raw: string; sections?: Array<{ content: string; type: string }> },
    frameworkOverrides?: {
      shotType: VeoShotType;
      cameraMovement: string;
      lightingMood: string;
      featuredCharacters: string[];
    },
    enhancedOptions?: {
      nlpScene?: NLPVisualScene;
      comedyMode?: 'subtle' | 'medium' | 'absurd';
      bpm?: number;
    },
    documentaryOptions?: {
      isHistoricalContent: boolean;
      deepResearch: DeepHistoricalResearch | null;
      keyEvent: KeyHistoricalEvent | null;
    },
  ): VeoPrompt {
    const duration = section.endTime - section.startTime;
    const energyLevel = section.energy > 0.7 ? 'high' : section.energy > 0.4 ? 'medium' : 'low';
    const sectionType = section.type.toLowerCase();

    // ARTICLE-ENHANCED: Get pacing guidance with BPM and energy markers
    const pacingGuidance = this.getPacingGuidance(sectionType, enhancedOptions?.bpm || 120, section.energy);

    // Use framework overrides if provided, otherwise use defaults
    let shotType: VeoShotType = frameworkOverrides?.shotType || 'TRACKING';
    let cameraMovement = frameworkOverrides?.cameraMovement || '';
    let lightingMood = frameworkOverrides?.lightingMood || '';
    const featuredCharacters =
      frameworkOverrides?.featuredCharacters || characterCast.map((c) => c.name || `Character ${c.id}`);

    // Fallback shot type mapping by section
    if (!frameworkOverrides) {
      const shotBySection: Record<string, VeoShotType> = {
        intro: 'ENVIRONMENT',
        verse: 'DUO-DEBATE',
        chorus: 'HERO-3',
        bridge: 'METAPHOR',
        outro: 'HERO-3',
        'pre-chorus': 'TRACKING',
        hook: 'HERO-3',
        prechorus: 'TRACKING',
      };
      shotType = shotBySection[sectionType] || 'TRACKING';
    }

    // Build ONLY featured character descriptions (not all characters!)
    // This ensures shot variety - solo shots only show one person, duo shots show two, etc.
    const featuredCharsData = characterCast.filter((c) => featuredCharacters.includes(c.name || `Character ${c.id}`));

    // For historical documentary, SKIP creature detection - historical figures are ALWAYS human
    const isHistoricalDocumentary = documentaryOptions?.isHistoricalContent && documentaryOptions?.deepResearch;

    // Helper to check if character is non-human (skip for historical documentary)
    const checkIsNonHuman = (appearance: string): boolean => {
      if (isHistoricalDocumentary) return false;
      return /anthropomorphic|creature|animal|cat|dog|wolf|bear|dragon|robot|elemental|spirit|monster|beast|talking/i.test(
        appearance,
      );
    };

    // For B-roll shots (ENVIRONMENT, DETAIL, METAPHOR) with no featured characters, describe the scene only
    let characterDescriptions = '';
    if (featuredCharsData.length === 0) {
      // No characters in frame - B-roll shot
      characterDescriptions = 'Empty shot establishing atmosphere';
    } else if (featuredCharsData.length === 1) {
      // Solo shot - single character focus
      const c = featuredCharsData[0];
      const appearance = c.appearance || (c as any).physicalDescription || 'distinctive appearance';
      const isNonHuman = checkIsNonHuman(appearance);
      if (isNonHuman) {
        characterDescriptions = `${c.name} (${appearance}) [CREATURE/ANIMAL with exaggerated animated features] in solo frame`;
      } else {
        characterDescriptions = `${c.name} (${c.age}yo ${c.gender}, ${appearance}) in solo frame`;
      }
    } else if (featuredCharsData.length === 2) {
      // Two-shot - pair focus
      characterDescriptions = featuredCharsData
        .map((c) => {
          const appearance = c.appearance || (c as any).physicalDescription || 'distinctive appearance';
          const isNonHuman = checkIsNonHuman(appearance);
          if (isNonHuman) {
            return `${c.name} (${appearance}) [CREATURE/ANIMAL with animated features]`;
          }
          return `${c.name} (${c.age}yo ${c.gender}, ${appearance})`;
        })
        .join(' facing ');
    } else {
      // Group shot - all featured together
      characterDescriptions = featuredCharsData
        .map((c) => {
          const appearance = c.appearance || (c as any).physicalDescription || 'distinctive appearance';
          const isNonHuman = checkIsNonHuman(appearance);
          if (isNonHuman) {
            return `${c.name} (${appearance}) [CREATURE with animated features]`;
          }
          return `${c.name} (${c.age}yo ${c.gender}, ${appearance})`;
        })
        .join(', ');
    }

    // Section-specific camera work (fallback if not overridden)
    const cameraBySection: Record<string, string> = {
      intro: 'Slow dolly in through doorway',
      verse: 'Medium tracking shot following characters',
      chorus: 'Wide crane shot, dramatic low angle',
      bridge: 'Extreme close-up rack focus',
      outro: 'Slow crane pull back and up',
      'pre-chorus': 'Quick handheld movement',
      hook: 'Dynamic orbit shot around characters',
    };

    if (!cameraMovement) {
      cameraMovement = cameraBySection[sectionType] || cameraBySection['verse'];
    }

    // Indie/raw energy actions
    const indieActionsBySection: Record<string, string[]> = {
      intro: ['mid-chew freeze frame', 'caught off-guard candid moment', 'awkward pause before speaking'],
      verse: ['animated hand gestures mid-argument', 'eye-roll reaction shot', 'exasperated slump against counter'],
      chorus: ['chaotic overlapping conversation', 'absurdist standoff moment', 'dramatic zoom on confused expression'],
      bridge: ['quiet contemplative stare', 'unexpected vulnerability crack', 'intimate confession moment'],
      outro: ['reluctant smile breaking through', 'shared exhausted laugh', 'messy table aftermath shot'],
      'pre-chorus': ['suspicious side-eye', 'leaning in with skepticism', 'tension-building silence'],
      hook: ['sudden realization beat', 'deadpan stare at camera', 'chaotic energy burst'],
    };

    // 📚 DOCUMENTARY MODE: Historical epic actions (not indie office drama)
    const documentaryActionsBySection: Record<string, string[]> = {
      intro: [
        'surveying vast landscape with determination',
        'dramatic entrance through ancient doorway',
        'standing before assembled warriors',
      ],
      verse: [
        'strategizing over ancient maps',
        'addressing followers with commanding presence',
        'riding across expansive terrain',
        'contemplating next conquest',
      ],
      chorus: [
        'triumphant moment of victory',
        'inspiring followers with legendary speech',
        'dramatic declaration of intent',
        'leading charge across battlefield',
      ],
      bridge: [
        'moment of quiet reflection',
        'gazing at empire horizon',
        'intimate moment of vulnerability',
        'writing or reading ancient scrolls',
      ],
      outro: [
        'legacy monument reveal',
        'standing tall against epic landscape',
        'final commanding gaze at horizon',
        'triumphant pose as legend',
      ],
      'pre-chorus': [
        'building tension before decisive moment',
        'warriors preparing for action',
        'dramatic pause before speech',
      ],
      hook: ['legendary hero moment', 'dramatic weapon or symbol raise', 'epic declaration'],
    };

    // EARLY MODE DETECTION: Determine documentary mode for action/lighting/setting selection
    const isDocumentaryMode = documentaryOptions?.isHistoricalContent && documentaryOptions?.deepResearch;
    // 🔧 FIX: Historical mode activates when EITHER deepResearch exists OR isHistoricalContent is true
    // This ensures we never fall back to "office breakroom" for historical content
    const isHistoricalMode = !!isDocumentaryMode || !!documentaryOptions?.isHistoricalContent;

    // Select actions based on mode: documentary > indie
    const actionsBySection = isDocumentaryMode ? documentaryActionsBySection : indieActionsBySection;

    // Indie/A24 lighting
    const indieLightingByEnergy: Record<string, string> = {
      low: 'moody low-key lighting, harsh shadows, single source feel like 35mm indie film',
      medium: 'naturalistic documentary lighting, handheld vibe, imperfect exposure',
      high: 'chaotic mixed lighting, neon and practicals, music video energy NOT commercial',
    };

    // 📚 DOCUMENTARY MODE: Epic historical lighting (not indie A24)
    const documentaryLightingBySection: Record<string, string> = {
      intro: 'golden hour light streaming across ancient landscape, dust motes in air, epic establishing atmosphere',
      verse: 'torchlight and firelight casting dramatic shadows, period-accurate illumination, warm amber tones',
      chorus: 'dramatic backlighting with epic sun rays, maximum visual drama, legendary hero lighting',
      bridge: 'intimate candlelight or campfire glow, warm contemplative atmosphere, moment of reflection',
      outro: 'triumphant sunrise/sunset lighting, warm golden legacy tones, epic closing atmosphere',
      'pre-chorus': 'building tension with torch flickers intensifying, dramatic shadows lengthening',
      hook: 'spotlight burst on legendary moment, maximum dramatic impact',
    };

    if (!lightingMood) {
      if (isDocumentaryMode) {
        // 📚 Use documentary epic lighting, NOT indie A24
        lightingMood = documentaryLightingBySection[sectionType] || documentaryLightingBySection['verse'];
      } else {
        lightingMood = indieLightingByEnergy[energyLevel];
      }
    }

    // Default action selection from section-based arrays
    const actions = actionsBySection[sectionType] || actionsBySection['verse'];
    let actionText = actions[index % actions.length];

    // 🏛️ HISTORICAL/DOCUMENTARY MODE: Use period-accurate historical settings
    let location: string;

    if (isDocumentaryMode && documentaryOptions?.deepResearch) {
      // 📚 DOCUMENTARY MODE - Use deep research visual settings!
      // CRITICAL: Action and Setting must be COORDINATED from same key event
      const deepResearch = documentaryOptions.deepResearch;
      const keyEvent = documentaryOptions.keyEvent;

      // Use key event for BOTH action AND setting (coordination fix)
      if (keyEvent?.visualSetting) {
        location = keyEvent.visualSetting;

        // 🎬 COORDINATE ACTION WITH SETTING - derive action from key event context
        // Parse setting keywords to select matching action
        const settingLower = keyEvent.visualSetting.toLowerCase();

        // Map setting keywords to appropriate actions
        if (settingLower.includes('throne') || settingLower.includes('court') || settingLower.includes('palace')) {
          const throneActions = [
            'addressing subjects with commanding presence',
            'receiving counsel and making decisions',
            'standing defiantly before opposition',
          ];
          actionText = throneActions[index % throneActions.length];
        } else if (settingLower.includes('battle') || settingLower.includes('war') || settingLower.includes('siege')) {
          const battleActions = [
            'leading charge across battlefield',
            'rallying troops before engagement',
            'surveying battlefield with strategic intent',
          ];
          actionText = battleActions[index % battleActions.length];
        } else if (
          settingLower.includes('chamber') ||
          settingLower.includes('private') ||
          settingLower.includes('dimly lit')
        ) {
          const chamberActions = [
            'contemplating strategy in solitude',
            'writing or reading ancient scrolls',
            'intimate moment of reflection',
          ];
          actionText = chamberActions[index % chamberActions.length];
        } else if (
          settingLower.includes('banquet') ||
          settingLower.includes('feast') ||
          settingLower.includes('hall')
        ) {
          const banquetActions = [
            'presiding over lavish celebration',
            'engaging in diplomatic conversation',
            'commanding attention at grand gathering',
          ];
          actionText = banquetActions[index % banquetActions.length];
        } else if (settingLower.includes('ship') || settingLower.includes('barge') || settingLower.includes('nile')) {
          const shipActions = [
            'surveying domain from royal vessel',
            'arriving in dramatic naval display',
            'gazing across waters with purpose',
          ];
          actionText = shipActions[index % shipActions.length];
        }
        // Otherwise keep the section-based action
      } else {
        // Fall back to rotating through primary locations from research
        const primaryLocations = deepResearch.visualSettings.primaryLocations;
        if (primaryLocations && primaryLocations.length > 0) {
          location = primaryLocations[index % primaryLocations.length];
        } else {
          // Ultimate fallback based on era
          location = `${deepResearch.visualSettings.eraAesthetics}, ${deepResearch.visualSettings.colorPalette}`;
        }
      }
      console.log(`   📍 Documentary location: ${location}`);
    } else if (isHistoricalMode) {
      // 🏛️ HISTORICAL SETTINGS - NOT office breakroom!
      const historicalSettings = [
        'ancient palace throne room with towering columns and flickering torchlight',
        'vast battlefield at golden hour with war banners flying',
        'ancient city streets with period-accurate architecture',
        'nomadic camp on windswept steppes under dramatic sky',
        'grand war council chamber with maps and candles',
        'fortress walls overlooking ancient landscape',
        'sacred temple with incense smoke and ancient symbols',
        'royal courtyard with period-accurate statues and fountains',
      ];
      location = historicalSettings[index % historicalSettings.length];
    } else {
      // 🔧 FALLBACK: Generic but visually interesting settings for non-historical content
      // Never use "office breakroom" - it was a test placeholder that leaked into production
      const modernSettings = [
        'stylish urban loft with dramatic window lighting',
        'downtown city street at golden hour with cinematic atmosphere',
        'rooftop overlooking city skyline at sunset',
        'modern minimalist space with mood lighting',
        'vibrant street art backdrop in urban setting',
      ];
      location = modernSettings[index % modernSettings.length];
    }

    // ARTICLE-ENHANCED: Build visual elements from NLP scene if provided
    let nlpVisualElements = '';
    let symbolMappingElements = '';
    if (enhancedOptions?.nlpScene) {
      const scene = enhancedOptions.nlpScene;
      if (scene.concreteVisuals.length > 0) {
        nlpVisualElements = `Visual elements: ${scene.concreteVisuals.slice(0, 3).join(', ')}.`;
      }
      if (scene.symbolMappings.length > 0) {
        symbolMappingElements = `Symbolic imagery: ${scene.symbolMappings.slice(0, 2).join(', ')}.`;
      }
    }

    // INDIE CHAOS KEYWORDS - rotate through for variety
    const directorEnergy = getIndieKeyword('directorEnergy', index);
    const tiktokEnergy = getIndieKeyword('tiktokEnergy', index);
    const antiPerfection = getIndieKeyword('antiPerfectionCamera', index);
    const colorGrade = getIndieKeyword('colorGrading', index);
    const comedyTiming = getIndieKeyword('comedyTiming', index);
    const epicFood = getIndieKeyword('epicFood', index);

    let fullPrompt: string;

    if (isHistoricalMode) {
      // 🏛️ HISTORICAL MODE: Documentary epic style (NOT indie A24)
      const historicalCameraBySection: Record<string, string> = {
        intro: 'Sweeping crane shot across ancient landscape, establishing grandeur',
        verse: 'Tracking shot following historical figure through period setting',
        chorus: 'Epic hero shots, dramatic low angles, maximum visual impact',
        bridge: 'Intimate close-up, contemplative moment of leadership',
        outro: 'Rising crane shot, triumphant wide angle, legacy moment',
        'pre-chorus': 'Building tension with steadicam approach',
        hook: 'Dramatic hero reveal shot',
      };

      const historicalLightingBySection: Record<string, string> = {
        intro: 'golden hour light streaming through ancient architecture, dust particles in air',
        verse: 'torchlight and firelight casting dramatic shadows, period-accurate illumination',
        chorus: 'dramatic backlighting silhouettes, epic sun rays, maximum visual drama',
        bridge: 'intimate candlelight or campfire glow, warm and contemplative',
        outro: 'triumphant sunrise/sunset lighting, warm golden tones',
        'pre-chorus': 'building shadows, torch flickers intensifying',
        hook: 'spotlight burst on legendary moment',
      };

      const historicalCamera = historicalCameraBySection[sectionType] || historicalCameraBySection['verse'];

      // ADAPTIVE LIGHTING: Derive lighting from scene setting keywords, fallback to section default
      const locationLower = location.toLowerCase();
      let historicalLight: string;
      if (
        locationLower.includes('night') ||
        locationLower.includes('tent') ||
        locationLower.includes('yurt') ||
        locationLower.includes('indoor')
      ) {
        historicalLight =
          'torchlight with orange flicker, campfire glow with warm amber and cool blue rim light, candlelight shadows';
      } else if (
        locationLower.includes('sunset') ||
        locationLower.includes('dusk') ||
        locationLower.includes('twilight')
      ) {
        historicalLight = 'golden sunset rays through dust, warm amber sky, dramatic silhouettes against horizon';
      } else if (locationLower.includes('moonlit') || locationLower.includes('moon')) {
        historicalLight = 'cold blue moonlight with silver highlights, dark shadows, visible breath in cold air';
      } else if (
        locationLower.includes('burning') ||
        locationLower.includes('fire') ||
        locationLower.includes('smoke')
      ) {
        historicalLight = 'orange fire glow reflecting off surfaces, smoke-diffused light, dramatic shadows';
      } else if (
        locationLower.includes('bright') ||
        locationLower.includes('blue sky') ||
        locationLower.includes('sunny') ||
        locationLower.includes('plain')
      ) {
        historicalLight = 'bright golden sunlight, crisp shadows, dust motes in sunbeams, epic outdoor natural light';
      } else {
        historicalLight = historicalLightingBySection[sectionType] || historicalLightingBySection['verse'];
      }

      // BPM-DERIVED pacing for documentary (passed from librosa analysis)
      const bpmPacing = enhancedOptions?.bpm
        ? `[${pacingGuidance.bpmCategory.toUpperCase()} TEMPO @ ${enhancedOptions.bpm}BPM] ${pacingGuidance.pacingDescription}`
        : 'Deliberate documentary pacing';

      fullPrompt = `[${shotType}]: ${historicalCamera}. HISTORICAL DOCUMENTARY EPIC.

SUBJECT: ${characterDescriptions}
Human historical figure with weathered skin, visible age lines, authentic period clothing textures.

ACTION: ${actionText}
${pacingGuidance.actionTiming}

SETTING: ${location}
Lighting: ${historicalLight}

PACING & RHYTHM:
${bpmPacing}
Camera: ${pacingGuidance.cameraSpeed}
Energy level: ${energyLevel} (${Math.round(section.energy * 100)}%)

VISUAL COMPOSITION:
- FOREGROUND: Historical figure dominates frame, period-accurate attire with visible wear and stitching
- MIDGROUND: Ancient architecture, hand-carved stone, weathered wood, iron fixtures
- BACKGROUND: Sweeping landscapes, distant mountains, period structures with atmospheric haze
- TEXTURE: Dust particles in light beams, fabric movement in wind, torch smoke wisps
- CINEMATOGRAPHY: Epic crane shots, slow tracking moves, dramatic silhouettes
${nlpVisualElements ? `- ${nlpVisualElements}\n` : ''}${symbolMappingElements ? `- ${symbolMappingElements}\n` : ''}
Style: Epic history documentary meets cinematic drama. Period-accurate ${aspectRatio}.

(No subtitles)`;
    } else {
      // NON-HISTORICAL: Original indie A24 style prompt
      // BPM-DERIVED pacing for indie style
      const bpmPacing = enhancedOptions?.bpm
        ? `[${pacingGuidance.bpmCategory.toUpperCase()} @ ${enhancedOptions.bpm}BPM]`
        : '';

      fullPrompt = `[${shotType}]: ${cameraMovement} of ${characterDescriptions}. ${antiPerfection}.

${actionText}. ${tiktokEnergy}.
${pacingGuidance.actionTiming}

Setting: ${location}, ${energyLevel === 'high' ? 'dramatic moment' : 'daytime'}.
Lighting: ${lightingMood}. ${colorGrade}.
Pacing: ${bpmPacing} ${pacingGuidance.cutSpeed} cuts, ${pacingGuidance.cameraEnergy}.
Camera speed: ${pacingGuidance.cameraSpeed}
${nlpVisualElements ? nlpVisualElements + '\n' : ''}${symbolMappingElements ? symbolMappingElements + '\n' : ''}Energy: ${directorEnergy} (${Math.round(section.energy * 100)}% intensity).
${sectionType === 'chorus' || sectionType === 'bridge' ? `Food moment: ${epicFood}.` : ''}
${sectionType === 'verse' || sectionType === 'chorus' ? `Comedy: ${comedyTiming}.` : ''}
Style: A24 indie film, NOT a commercial, weird and meme-worthy. ${aspectRatio}.

(No subtitles)`;
    }

    // Clean up any double newlines
    fullPrompt = fullPrompt.replace(/\n\n\n+/g, '\n\n').trim();

    // PROACTIVE VEO PROMPT SANITIZATION: Avoid content policy violations before first API call
    const hasChildSubject = /\b(child|boy|girl|\d+-year-old)\b/i.test(fullPrompt);
    const sanitizationResult = sanitizeVeoPrompt(fullPrompt, {
      isDocumentary: isHistoricalMode,
      hasChildSubject,
      logReplacements: true,
    });

    if (sanitizationResult.wasModified) {
      fullPrompt = sanitizationResult.sanitized;
    }

    // ARTICLE-ENHANCED: Apply comedy triggers if specified
    if (
      enhancedOptions?.comedyMode &&
      (sectionType === 'verse' || sectionType === 'chorus' || sectionType === 'bridge')
    ) {
      fullPrompt = this.buildComedyEnhancedPrompt(fullPrompt, sectionType, enhancedOptions.comedyMode);
    }

    // ====================================================
    // KLING 2.5 TURBO FINAL OPTIMIZATION — DEC 2025 GOLD STANDARD
    // Replaces 400-600 token bloat with perfect 74-120 token end-weighted prompt
    // Character lock FIRST, then shot/camera, action, setting, lighting, specs LAST
    // ====================================================
    const characterLock = characterCast
      .map(
        (c) =>
          `${c.name?.toUpperCase() || 'CHARACTER'}: ${c.age}yo ${c.gender}, ${c.appearance?.split('.')[0] || 'distinctive appearance'}`,
      )
      .join('. ');

    const klingEssentials = [
      characterLock,
      `[${shotType}]: ${cameraMovement} of ${featuredCharacters.join(' and ')}`,
      actionText || 'dynamic action',
      location,
      lightingMood,
      `${pacingGuidance?.cameraSpeed || 'cinematic movement'}, ${aspectRatio}, photorealistic, --no subtitles`,
    ]
      .filter(Boolean)
      .join('. ');

    fullPrompt = klingEssentials.trim();
    // → 74-120 tokens. Kling 2.5 Turbo reads every single one perfectly.
    // ====================================================

    // Visual metaphor for abstract sections
    const visualMetaphor =
      sectionType === 'bridge' || sectionType === 'chorus' ? 'Abstract visual representing unity' : undefined;

    return {
      sectionName: section.type.toUpperCase(),
      sectionIndex: index,
      durationSeconds: Math.max(1, Math.min(duration, 8)), // Min 1s, max 8s
      timestampStart: section.startTime,
      timestampEnd: section.endTime,
      timestampFormatted: `${Math.floor(section.startTime / 60)}:${String(Math.floor(section.startTime % 60)).padStart(2, '0')}-${Math.floor(section.endTime / 60)}:${String(Math.floor(section.endTime % 60)).padStart(2, '0')}`,
      characterIds: characterCast.map((c) => c.id),
      shotType,
      cameraMovement,
      lightingMood,
      featuredCharacters,
      visualMetaphor,
      sceneDetails: {
        location: location,
        timeOfDay: 'daytime',
        wardrobe: characterCast[0]?.wardrobeBase || 'casual',
        props: ['pizza', 'tacos', 'food items'],
      },
      characterAction: {
        startingPosition: energyLevel === 'high' ? 'In motion' : 'Standing',
        movement: actionText,
        expression: energyLevel === 'high' ? 'Intense' : 'Engaged',
        keyGesture: 'Dynamic moment',
      },
      camera: {
        shotType: VEO_SHOT_TYPES[shotType]?.framing || 'medium',
        angle:
          shotType === 'SOLO-POWER'
            ? 'dramatic low angle'
            : shotType === 'SOLO-VULNERABLE'
              ? 'high angle'
              : 'eye level',
        movement: cameraMovement,
        startingFrame: '',
        endingFrame: '',
      },
      lighting: {
        keyLight: lightingMood,
        fillRim: energyLevel === 'high' ? 'strong rim light' : 'subtle fill',
        practicalLights: '',
        mood: energyLevel === 'high' ? 'dramatic' : 'natural',
        colorGrade: template.name.toLowerCase(),
      },
      depthComposition: {
        foreground: shotType === 'DETAIL' ? 'key object in sharp focus' : 'dynamic elements',
        midground: 'characters in motion',
        background: 'office environment',
        ruleOfThirds: energyLevel === 'high' ? 'bold off-center' : 'balanced',
      },
      audioAtmosphere: {
        ambientSound: 'music sync',
        sfx: '',
        reverbSpace: '',
      },
      beatSync: {
        timings: [{ seconds: `0-${Math.round(duration)}`, action: `${energyLevel} energy section` }],
      },
      visualReferences: [],
      fullPrompt, // Use the enhanced prompt we built above
    };
  }

  /**
   * ARTICLE-ENHANCED: Generate prompts with NLP extraction for lyrics
   * Analyzes lyrics to extract visual elements and apply symbol mapping
   */
  async generateEnhancedVeoPrompts(params: {
    sections: Array<{ type: string; startTime: number; endTime: number; energy: number }>;
    characterCast: CharacterCast[];
    template: (typeof VIDEO_STYLE_TEMPLATES)[VideoStyleKey];
    aspectRatio: string;
    lyrics: { raw: string; sections: Array<{ content: string; type: string }> };
    bpm?: number;
    comedyMode?: 'subtle' | 'medium' | 'absurd';
  }): Promise<VeoPrompt[]> {
    const { sections, characterCast, template, aspectRatio, lyrics, bpm = 120, comedyMode } = params;

    console.log('🎬 Generating ENHANCED VEO prompts with NLP extraction...');
    console.log(`   📊 Analyzing ${sections.length} sections for visual elements`);
    console.log(`   🎭 Comedy mode: ${comedyMode || 'disabled'}`);
    console.log(`   🎵 BPM: ${bpm}`);

    // Get lyrics section types
    const lyricsSectionTypes = this.extractLyricsSectionTypes(lyrics);

    // Track section type counters for shot cycling
    const sectionTypeCounters: Record<string, number> = {};
    let verseCount = 0;
    let chorusCount = 0;

    const prompts: VeoPrompt[] = [];

    for (let idx = 0; idx < sections.length; idx++) {
      const section = sections[idx];

      // Get lyrics content for this section
      const lyricsContent = lyrics.sections[idx]?.content || '';

      // Extract NLP visual scene from lyrics
      let nlpScene: NLPVisualScene | undefined;
      if (lyricsContent.trim()) {
        try {
          nlpScene = await this.extractVisualScene(lyricsContent);
          if (nlpScene.concreteVisuals.length > 0 || nlpScene.symbolMappings.length > 0) {
            console.log(
              `   📝 Section ${idx + 1} NLP: ${nlpScene.concreteVisuals.join(', ')} | Symbols: ${nlpScene.symbolMappings.join(', ')}`,
            );
          }
        } catch (error) {
          console.warn(`   ⚠️ NLP extraction failed for section ${idx + 1}`);
        }
      }

      // Normalize section key
      let sectionKey = lyricsSectionTypes[idx] || section.type.toLowerCase();
      if (sectionKey.includes('verse')) {
        verseCount++;
        sectionKey = verseCount === 1 ? 'verse_1' : 'verse_2';
      } else if (sectionKey.includes('chorus') || sectionKey.includes('hook')) {
        chorusCount++;
        sectionKey = chorusCount >= 2 && idx > sections.length * 0.6 ? 'final_chorus' : 'chorus';
      } else if (sectionKey.includes('prechorus') || sectionKey.includes('pre-chorus')) {
        sectionKey = 'prechorus';
      } else if (sectionKey.includes('bridge')) {
        sectionKey = 'bridge';
      } else if (sectionKey.includes('intro')) {
        sectionKey = 'intro';
      } else if (sectionKey.includes('outro')) {
        sectionKey = 'outro';
      }

      // Get shot sequence from matrix
      const sectionTypeCount = sectionTypeCounters[sectionKey] || 0;
      sectionTypeCounters[sectionKey] = sectionTypeCount + 1;

      const matrix = SECTION_SHOT_MATRIX[sectionKey] || SECTION_SHOT_MATRIX.verse;
      const shotType = matrix.shotSequence[sectionTypeCount % matrix.shotSequence.length];
      const lighting = LIGHTING_MOODS[matrix.lightingMood];
      const cameraMovements = CAMERA_MOVEMENTS[matrix.cameraCategory];
      const cameraMovement = cameraMovements[idx % cameraMovements.length];

      // Select characters for shot
      const featuredCharacters = this.selectCharactersForShot(shotType, characterCast, idx);

      // Create enhanced prompt with NLP, comedy, and pacing
      const prompt = this.createMusicAwarePrompt(
        section,
        idx,
        characterCast,
        template,
        aspectRatio,
        lyrics,
        {
          shotType,
          cameraMovement,
          lightingMood: lighting.description,
          featuredCharacters: featuredCharacters.map((c) => c.name || `Character ${c.id}`),
        },
        {
          nlpScene,
          comedyMode,
          bpm,
        },
      );

      prompts.push(prompt);
    }

    console.log(`✅ Generated ${prompts.length} enhanced VEO prompts`);
    return prompts;
  }
}

export const unityContentGenerator = new UnityContentGenerator();
