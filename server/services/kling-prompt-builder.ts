/**
 * KLING 3.0 PROMPT BUILDER
 *
 * Optimized for Kling 3.0 video generation via kie.ai
 * Enhanced with RETENTION_PROTOCOL_V1 camera sequencing (60-70% retention target)
 *
 * KLING 3.0 IMPROVEMENTS OVER 2.5:
 * - Native 15-second clips (up from 5-10s)
 * - Multi-shot storyboarding with up to 6 camera cuts
 * - Multiple characters supported (up to 3-4 with clear subject focus)
 * - Complex camera (crane, drone, POV, whip pan, dolly zoom)
 * - Better physics (flowing water, fabric, anatomy — hands look correct)
 * - Character consistency across cuts via reference images
 * - Reads ~80-120 tokens effectively (longer prompts ok)
 * - Aspect ratio set via API parameter, NOT in prompt text
 *
 * OPTIMAL STRUCTURE:
 * [Subject], [age], [gender], [2-3 traits], [outfit].
 * [ACTION SEQUENCE — multi-beat for 15 seconds].
 * [Setting/environment, 8-15 words].
 * [Camera direction with cuts/movements], [lighting].
 */

import { RETENTION_PROTOCOL_V1 } from '../config/retention-protocol';

// ============================================================
// KLING SYSTEM PROMPT
// ============================================================

export const KLING_SYSTEM_PROMPT = `You generate prompts for Kling 3.0 AI video (15-second clips).

=== RULES ===
1. TARGET 60-100 WORDS per prompt (Kling 3.0 handles up to ~120 tokens well)
2. ONE primary subject with clear focus (secondary characters OK)
3. Start with subject description
4. Action verb in CAPS, then describe the full 15-second sequence
5. Include camera direction (multi-shot cuts encouraged)
6. DO NOT include aspect ratio in prompt (set via API parameter)
7. Negative prompts go via API parameter, NOT in prompt text

=== STRUCTURE ===
[Subject description], [age], [gender], [2-3 visual traits], [outfit]. [ACTION in CAPS] [multi-beat sequence across 15 seconds]. [Setting/environment]. [Camera direction with cuts], [lighting].

=== KLING 3.0 EXCELS AT ===
- Multi-beat action sequences within 15 seconds
- Multiple characters interacting (up to 3-4 with clear subject focus)
- Complex camera: tracking, crane, drone, POV, whip pan, dolly zoom, orbit
- Multi-shot within a clip: "wide shot, cuts to close-up, tracks alongside"
- Realistic physics: flowing water, fabric, hair, natural body movement
- Accurate anatomy: hands, faces, proportions all correct
- Dynamic verbs: BURSTS, STORMS, CRASHES, RISES, FALLS, EMERGES, REACHES
- Lighting: golden hour, rim light, dramatic shadows, candlelight, torch glow
- Motion: fabric billowing, dust swirling, hair flowing, rain falling

=== STILL AVOID ===
- "looks at camera" (creates awkward eye contact)
- "BBC documentary" (boring, static)
- Abstract concepts it can't visualize
- Single static pose held for 15 seconds (wastes the format)
- Supernatural VFX (glowing auras, magic beams, morphing)

=== EXAMPLE PROMPTS ===

GOOD (85 words):
"Egyptian queen, 30, olive skin, kohl-lined eyes, white linen gown with gold thread. EMERGES from rolled carpet in slow motion as gold dust swirls, rises to feet and locks eyes with Roman general seated on marble throne, strides forward with regal confidence as guards part to either side, ancient palace throne room with towering marble columns and flickering oil lamps. Wide shot of carpet unrolling, cuts to close-up of queen's face as she rises, tracks alongside her approach, dramatic rim lighting from torches."

BAD (too vague, wastes 15s):
"Cleopatra stands in a room and looks around at things while historical events happen in the background."

=== HISTORICAL ERA ACCURACY (CRITICAL) ===
When generating prompts for historical figures, you MUST enforce era-accurate visuals:

ANCIENT (Before 500 AD):
- Clothing: togas, tunics, leather sandals, bronze/iron armor, cloaks
- Weapons: swords, spears, shields, bows
- Settings: marble columns, temples, amphitheaters, dirt roads

MEDIEVAL (500-1500 AD):
- Clothing: chainmail, plate armor, wool tunics, fur cloaks
- Weapons: longswords, crossbows, maces, halberds
- Settings: castles, stone walls, torchlit halls, muddy villages

REVOLUTIONARY ERA (1700-1800):
- Clothing: tricorn hats, redcoats, blue coats, powdered wigs, breeches
- Weapons: muskets, flintlock pistols, bayonets, sabers
- Settings: wooden ships, colonial towns, snowy forests, candlelit rooms

VICTORIAN/INDUSTRIAL (1800-1900):
- Clothing: top hats, frock coats, corsets, petticoats
- Weapons: rifles, revolvers, cavalry sabers
- Settings: gas lamps, cobblestone streets, factories, steam trains

MODERN (1900+):
- Apply appropriate technology limits for specific decade
- WWI: trench warfare equipment, biplanes
- WWII: period-accurate vehicles, prop planes

=== FORBIDDEN ===
- "looks at camera" / "gazes at viewer"
- "stands regally" (static, no action — especially bad for 15 seconds)
- "BBC documentary cinematography"
- Prompts under 40 words (underutilizes 15-second format)
- Abstract emotions without visual representation
- ANACHRONISTIC ELEMENTS (modern items in historical settings)
- Supernatural VFX (glowing, morphing, magic beams)`;

// ============================================================
// KLING DYNAMIC ACTION VERBS
// ============================================================

export const KLING_DYNAMIC_VERBS = [
  // Explosive
  'BURSTS',
  'ERUPTS',
  'EXPLODES',
  'CRASHES',
  'SHATTERS',
  // Movement
  'STORMS',
  'RUSHES',
  'CHARGES',
  'LUNGES',
  'LEAPS',
  // Rising/Falling
  'RISES',
  'FALLS',
  'COLLAPSES',
  'ASCENDS',
  'PLUMMETS',
  // Emotional
  'REACHES',
  'GRASPS',
  'CLUTCHES',
  'RELEASES',
  'EMBRACES',
  // Combat
  'STRIKES',
  'SLASHES',
  'THRUSTS',
  'BLOCKS',
  'DEFLECTS',
  // Emergence
  'EMERGES',
  // Additional dynamic verbs
  'SURGES',
  'SWEEPS',
  'HURLS',
  'SPINS',
  'PROWLS',
  'COMMANDS',
  'SEIZES',
  'CONQUERS',
  'RALLIES',
  'THUNDERS',
];

// AVOID these boring verbs
export const BORING_VERBS = ['stands', 'sits', 'looks', 'gazes', 'watches', 'walks', 'moves', 'is', 'appears', 'seems'];

// ============================================================
// KLING CAMERA MOVEMENTS
// ============================================================

export const KLING_CAMERA_MOVEMENTS = {
  explosive: [
    'whip pan to close-up',
    'crash zoom with handheld shake',
    'fast tracking alongside action',
    'rapid dolly push, cuts to wide',
  ],
  dramatic: [
    'slow crane up revealing scene',
    'dolly in to close-up',
    'tracking push, cuts to detail',
    'orbit around subject',
  ],
  intimate: [
    'slow push in to face',
    'gentle tracking alongside',
    'close-up dolly with shallow focus',
    'subtle orbit, holds on expression',
  ],
  epic: [
    'drone pullback revealing landscape',
    'sweeping crane, cuts to ground level',
    'wide establishing, pushes in to subject',
    'tracking alongside, whip pan to reveal',
  ],
  tension: [
    'slow creep in, dutch angle',
    'POV approach toward subject',
    'circling shot tightening',
    'low angle push, cuts to overhead',
  ],
};

// ============================================================
// RETENTION PROTOCOL CAMERA SEQUENCING
// ============================================================
// Maps retention protocol camera pattern names to Kling camera movements
export const RETENTION_CAMERA_MAP: Record<string, string> = {
  extreme_close: 'extreme close-up push in',
  fast_motion: 'fast motion tracking',
  dutch_angle: 'dutch angle tilt',
  whip_pan: 'whip pan transition',
  wide_establishing: 'wide establishing crane',
  tracking_shot: 'tracking shot following subject',
  pov_perspective: 'first person POV',
  over_shoulder: 'over shoulder medium shot',
  medium_close: 'medium close-up dolly',
  crane_up: 'crane up reveal',
  dolly_in: 'dolly in slow push',
  handheld_shake: 'handheld dynamic shake',
  wide_action: 'wide action shot tracking',
  crash_zoom: 'crash zoom in',
  tracking_fast: 'fast tracking shot',
  aerial_swoop: 'aerial swoop down',
  slow_push: 'slow push in tension',
  tilt_reveal: 'tilt up reveal',
  crane_down: 'crane down dramatic',
  wide_epic: 'wide epic hero shot',
  slow_pull_back: 'slow pull back',
  aerial_reveal: 'aerial pullback reveal',
};

/**
 * Get camera movement using RETENTION_PROTOCOL_V1 pattern for 36-clip videos
 * Enforces strict visual rhythm: tight → wide → tight → wide
 */
export function getRetentionProtocolCamera(clipIndex: number, totalClips: number): string {
  // Only use retention protocol pattern for 36-clip videos (180s)
  if (totalClips !== 36) {
    // Fall back to energy-based selection for non-standard lengths
    const position = clipIndex / totalClips;
    if (position < 0.1) return 'extreme close-up push in'; // Hook
    if (position < 0.3) return 'wide establishing crane'; // Setup
    if (position < 0.5) return 'tracking shot following subject'; // Rising
    if (position < 0.7) return 'dutch angle tilt'; // Conflict
    if (position < 0.9) return 'wide epic hero shot'; // Climax
    return 'aerial pullback reveal'; // Resolution
  }

  // Use exact retention protocol pattern for 36 clips
  const pattern = RETENTION_PROTOCOL_V1.camera_pattern_36_clips;
  const patternIndex = clipIndex % pattern.length;
  const cameraStyle = pattern[patternIndex];

  // Map to Kling camera movement
  return RETENTION_CAMERA_MAP[cameraStyle] || 'dramatic tracking shot';
}

/**
 * Check if camera enforces MOVEMENT MANDATE (no static shots)
 * Per RETENTION_PROTOCOL_V1: Every prompt must include dynamic action
 */
export function isCameraMovementDynamic(cameraMovement: string): boolean {
  const staticPatterns = ['static', 'still', 'fixed', 'stationary', 'locked'];
  const lower = cameraMovement.toLowerCase();
  return !staticPatterns.some((pattern) => lower.includes(pattern));
}

// ============================================================
// KLING LIGHTING STYLES
// ============================================================

export const KLING_LIGHTING: Record<string, string> = {
  power: 'dramatic rim lighting, deep shadows',
  romance: 'warm golden hour glow, soft diffusion',
  danger: 'harsh red underlighting, stark shadows',
  mystery: 'single candle flame, dancing shadows',
  triumph: 'bright backlight creating silhouette halo',
  grief: 'cold blue moonlight, minimal fill',
  chaos: 'flickering firelight, unstable shadows',
  peace: 'soft diffused daylight, gentle warmth',
  awe: 'golden hour epic light, dust motes swirling',
  horror: 'harsh underlighting, deep darkness',
  determination: 'strong side lighting, sharp shadows',
  desperation: 'flickering torch, unstable warm glow',
};

// ============================================================
// CINEMATIC PROMPT ENGINE v3.0 - ERA PALETTES
// ============================================================

export const ERA_PALETTES: Record<string, { name: string; promptString: string }> = {
  ancient_classical: {
    name: 'Ancient/Classical',
    promptString:
      'muted earth tones, ochre and terracotta palette, classical painting aesthetic, weathered marble textures, bronze age warmth',
  },
  ancient_egyptian: {
    name: 'Ancient Egyptian',
    promptString:
      'warm golden and turquoise palette, lapis lazuli blues, desert sand tones, Egyptian royal opulence, Nile green accents',
  },
  medieval: {
    name: 'Medieval',
    promptString:
      'deep crimson and forest green, gold leaf accents, stone gray undertones, medieval illuminated manuscript aesthetic, rich tapestry colors',
  },
  mongol_empire: {
    name: 'Mongol Empire',
    promptString:
      'vast Mongolian steppe palette, golden grassland tones, endless sky blues, nomadic earthy browns, epic windswept atmosphere',
  },
  renaissance: {
    name: 'Renaissance',
    promptString:
      'rich Renaissance oil painting palette, vermillion and ultramarine, warm flesh tones, Baroque dramatic lighting, Old Master aesthetic',
  },
  victorian: {
    name: 'Victorian/19th Century',
    promptString:
      'deep burgundy and forest green, rich mahogany wood tones, sepia undertones, Victorian era warmth, brass and copper accents',
  },
  world_war: {
    name: 'World War Era',
    promptString:
      'desaturated wartime palette, Saving Private Ryan color grade, bleached war photography, olive drab and steel gray, gritty documentary realism',
  },
};

// ============================================================
// SHOT TYPES FOR NARRATIVE BEATS
// ============================================================

// 5-SECOND CLIP BEAT SYSTEM (12 clips for 60s video)
// Each beat maps to specific clip numbers
export const SHOT_TYPES: Record<string, { shot: string; camera: string; clips: string }> = {
  hook: { shot: 'extreme close-up', camera: 'intense push in 35%', clips: '1 (0-5s)' },
  setup: { shot: 'wide establishing', camera: 'slow pan', clips: '2-3 (5-15s)' },
  rising: { shot: 'tracking shot', camera: 'dolly following', clips: '4-5 (15-25s)' },
  conflict: { shot: 'dutch angle', camera: 'circling', clips: '6-7 (25-35s)' },
  climax: { shot: 'low angle hero', camera: 'crane up', clips: '8-9 (35-45s)' },
  resolution: { shot: 'pull back wide', camera: 'slow pull out', clips: '10-11 (45-55s)' },
  hook_next: { shot: 'close-up', camera: 'subtle push', clips: '12 (55-60s)' },
};

// Maps clip number (1-indexed) to beat type for 5-second clips
export function getClipBeat(clipNumber: number, totalClips: number): keyof typeof SHOT_TYPES {
  // Scale beat positions to any total clip count
  const position = clipNumber / totalClips;

  if (clipNumber === 1) return 'hook'; // First clip always hook
  if (position <= 0.17) return 'setup'; // ~clips 2-3 of 12
  if (position <= 0.33) return 'rising'; // ~clips 4-5 of 12
  if (position <= 0.5) return 'conflict'; // ~clips 6-7 of 12
  if (position <= 0.67) return 'climax'; // ~clips 8-9 of 12
  if (position <= 0.92) return 'resolution'; // ~clips 10-11 of 12
  return 'hook_next'; // Last clip(s) tease next
}

// ============================================================
// DOCUMENTARY LIGHTING SETUPS (Enhanced)
// ============================================================

export const DOCUMENTARY_LIGHTING: Record<string, { mood: string; promptString: string; bestFor: string[] }> = {
  rembrandt_dramatic: {
    mood: 'gravitas, power',
    promptString: 'low-key Rembrandt lighting, deep dramatic shadows, chiaroscuro effect, single source illumination',
    bestFor: ['conqueror', 'ruler', 'warrior'],
  },
  candlelight_period: {
    mood: 'intimacy, contemplation',
    promptString: 'natural candlelight illumination, warm flickering firelight, Barry Lyndon cinematography aesthetic',
    bestFor: ['philosopher', 'innovator', 'ruler'],
  },
  golden_hour_epic: {
    mood: 'triumph, destiny',
    promptString: 'golden hour backlighting, dramatic rim light on edges, atmospheric god rays, warm triumphant glow',
    bestFor: ['conqueror', 'warrior', 'revolutionary'],
  },
  high_contrast_tension: {
    mood: 'conflict, danger',
    promptString:
      'high contrast dramatic shadows, stark light and dark, tension-filled noir lighting, hard shadow edges',
    bestFor: ['revolutionary', 'warrior', 'conqueror'],
  },
  blue_hour_somber: {
    mood: 'melancholy, loss',
    promptString:
      'cool blue hour twilight, melancholy desaturated tones, contemplative evening light, somber atmospheric quality',
    bestFor: ['philosopher', 'resolution'],
  },
};

// ============================================================
// ARCHETYPE SYSTEM
// ============================================================

export const ARCHETYPES: Record<string, { signatureShots: string[]; lightingStyle: string; cameraEnergy: string }> = {
  conqueror: {
    signatureShots: ['low angle hero', 'tracking charge', 'wide battlefield'],
    lightingStyle: 'rembrandt_dramatic',
    cameraEnergy: 'explosive',
  },
  philosopher: {
    signatureShots: ['close-up contemplative', 'medium shot writing', 'wide study'],
    lightingStyle: 'candlelight_period',
    cameraEnergy: 'intimate',
  },
  revolutionary: {
    signatureShots: ['dutch angle defiance', 'crowd POV', 'low angle uprising'],
    lightingStyle: 'high_contrast_tension',
    cameraEnergy: 'tension',
  },
  ruler: {
    signatureShots: ['wide throne room', 'low angle authority', 'medium decree'],
    lightingStyle: 'golden_hour_epic',
    cameraEnergy: 'epic',
  },
  warrior: {
    signatureShots: ['tracking combat', 'extreme close-up eyes', 'wide battlefield'],
    lightingStyle: 'rembrandt_dramatic',
    cameraEnergy: 'explosive',
  },
};

// ============================================================
// INTERFACES
// ============================================================

export interface KlingCharacter {
  name: string;
  age: number;
  gender: string;
  appearance: string; // 2-3 key visual traits
  outfit: string;
}

export interface KlingPromptConfig {
  character: KlingCharacter;
  action: string; // Verb + what they're doing
  setting: string; // Location, 5-10 words
  camera: string; // Movement type
  lighting: string; // Lighting style
  negatives?: string[]; // Things to exclude
}

export interface KlingStoryBeat {
  clipRange: [number, number];
  event: string;
  setting: string;
  emotion: string;
  energy: 'explosive' | 'dramatic' | 'intimate' | 'epic' | 'tension';
}

export interface KlingBatchRequest {
  totalClips: number;
  character: KlingCharacter;
  storyBeats: KlingStoryBeat[];
}

export interface KlingClipContext {
  clipIndex: number;
  totalClips: number;
  sectionType: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro';
  previousPrompt: string | null;
  previousCamera: string | null;
  previousVerb: string | null;
}

export interface CinematicPromptConfig extends KlingPromptConfig {
  era?: string;
  beatType?: 'hook' | 'setup' | 'rising' | 'conflict' | 'climax' | 'resolution' | 'hook_next';
  archetype?: 'conqueror' | 'philosopher' | 'revolutionary' | 'ruler' | 'warrior';
}

// ============================================================
// PROMPT BUILDERS
// ============================================================

/**
 * Build a single Kling-optimized prompt
 */
export function buildKlingPrompt(config: KlingPromptConfig): string {
  const { character, action, setting, camera, lighting, negatives = ['text', 'watermark', 'modern elements'] } = config;

  // Build subject (15-20 words) - Use accurate age for the historical moment
  const ageDescription = character.age >= 18 ? `age ${character.age}` : `age ${character.age}`; // Show actual age
  const subject = `${character.name}, ${ageDescription}, ${character.gender}, ${character.appearance}, ${character.outfit}`;

  // Negatives kept as metadata only — not embedded in prompt text (Kling ignores --no syntax)

  // Assemble (target: 60-100 words for Kling 3.0's 15-second clips)
  // Aspect ratio set via API parameter, not in prompt text
  const prompt = `${subject}. ${action}. ${setting}. ${camera}, ${lighting}.`.trim();

  // Verify word count — Kling 3.0 handles longer prompts (up to ~120 tokens)
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 120) {
    console.warn(`⚠️ Kling prompt too long: ${wordCount} words. Truncating.`);
    // Smart truncation: Keep essential structure but shorten subject/action
    const shortSubject = `${character.name}, age ${character.age}, ${character.gender}, ${character.appearance.split(',')[0]}, ${character.outfit.split('.')[0]}`;
    const shortAction = action.split(' ').slice(0, 12).join(' ');
    const shortSetting = setting.split(' ').slice(0, 12).join(' ');

    const truncatedPrompt = `${shortSubject}. ${shortAction}. ${shortSetting}. ${camera}, ${lighting}.`.trim();

    // Final safety check
    const truncatedWordCount = truncatedPrompt.split(/\s+/).length;
    if (truncatedWordCount > 110) {
      const contentWords = `${shortSubject}. ${shortAction}. ${shortSetting}`.split(/\s+/).slice(0, 70).join(' ');
      return `${contentWords}. ${camera}, ${lighting}.`.trim();
    }

    return truncatedPrompt;
  }

  return prompt;
}

/**
 * Get camera movement based on energy level, avoiding previous
 */
export function getKlingCamera(
  energy: 'explosive' | 'dramatic' | 'intimate' | 'epic' | 'tension',
  clipIndex: number,
  previousCamera?: string | null,
): string {
  let options = [...KLING_CAMERA_MOVEMENTS[energy]];
  if (previousCamera) {
    options = options.filter((c) => c !== previousCamera);
  }
  return options[clipIndex % options.length];
}

/**
 * Get dynamic verb, avoiding previous and boring verbs
 */
export function getKlingVerb(clipIndex: number, previousVerb?: string | null): string {
  let options = [...KLING_DYNAMIC_VERBS];
  if (previousVerb) {
    options = options.filter((v) => v !== previousVerb);
  }
  return options[clipIndex % options.length];
}

/**
 * Get lighting based on emotion
 */
export function getKlingLighting(emotion: string): string {
  const emotionLower = emotion.toLowerCase();
  return KLING_LIGHTING[emotionLower] || KLING_LIGHTING['power'];
}

/**
 * Build batch prompt for generating multiple clips at once
 */
export function buildKlingBatchPrompt(request: KlingBatchRequest): string {
  const { totalClips, character, storyBeats } = request;

  return `Generate ${totalClips} Kling 3.0 video prompts (15-second clips) for a documentary about ${character.name}.

=== CHARACTER (use in every prompt) ===
Name: ${character.name}
Age: ${character.age}
Gender: ${character.gender}
Appearance: ${character.appearance}
Outfit: ${character.outfit}

=== STORY BEATS ===
${storyBeats
  .map(
    (beat) =>
      `Clips ${beat.clipRange[0]}-${beat.clipRange[1]}: ${beat.event}
  Setting: ${beat.setting}
  Emotion: ${beat.emotion}
  Energy: ${beat.energy}`,
  )
  .join('\n\n')}

=== REQUIREMENTS ===
1. Each prompt 60-100 words (Kling 3.0 handles longer prompts for 15s clips)
2. Multi-beat ACTION SEQUENCE per prompt (verb in CAPS, then 15-second sequence)
3. Structure: Subject. ACTION SEQUENCE. Setting. Camera direction with cuts, lighting.
4. Clips 1-3 are HOOKS: most explosive, mid-action, start with impact
5. NEVER repeat same action verb twice in a row
6. NEVER repeat same camera movement twice in a row
7. Use multi-shot camera: "wide shot, cuts to close-up, tracks alongside"
8. DO NOT include aspect ratio in prompts (set via API)

=== GOOD ACTION VERBS ===
BURSTS, STORMS, CRASHES, RISES, FALLS, REACHES, STRIKES, LUNGES, EMERGES, CONQUERS, RALLIES, SURGES

=== FORBIDDEN ===
- "looks at camera"
- "stands regally"
- "gazes with calculating eyes"
- Prompts under 40 words (underutilizes 15-second format)
- "BBC documentary"
- Boring verbs: stands, sits, looks, gazes, watches, walks
- Static scenes with no progression across 15 seconds

=== OUTPUT FORMAT ===
Return ONLY a JSON array, no markdown:
[
  {"clip": 1, "prompt": "...", "wordCount": 85},
  {"clip": 2, "prompt": "...", "wordCount": 78},
  ...
]

Generate all ${totalClips} prompts now. Each must be UNIQUE, 60-100 words, with multi-beat action sequences.`;
}

/**
 * Build single clip prompt with context
 * Now uses RETENTION_PROTOCOL_V1 camera sequencing for optimal retention
 */
export function buildKlingSinglePromptContext(
  character: KlingCharacter,
  event: string,
  setting: string,
  emotion: string,
  context: KlingClipContext,
): string {
  const { clipIndex, totalClips, sectionType, previousCamera, previousVerb } = context;

  // Determine energy level based on section type and position
  const isHook = clipIndex <= 3;
  const isChorus = sectionType === 'chorus';
  const energy: 'explosive' | 'dramatic' | 'intimate' | 'epic' | 'tension' =
    isHook || isChorus
      ? 'explosive'
      : sectionType === 'bridge'
        ? 'intimate'
        : sectionType === 'outro'
          ? 'epic'
          : 'dramatic';

  // RETENTION PROTOCOL: Use strict camera sequencing for 36-clip videos
  let camera: string;
  if (totalClips === 36) {
    camera = getRetentionProtocolCamera(clipIndex, totalClips);
    console.log(`   🎥 Retention protocol camera [${clipIndex + 1}/36]: ${camera.split(' ').slice(0, 3).join(' ')}...`);
  } else {
    // Fall back to energy-based selection
    camera = getKlingCamera(energy, clipIndex, previousCamera);
  }

  // Verify camera movement is dynamic (no static shots per retention protocol)
  if (!isCameraMovementDynamic(camera)) {
    console.warn(`   ⚠️ Static camera detected: "${camera}" - forcing dynamic movement`);
    camera = 'tracking shot following subject';
  }

  // Pick verb (avoid previous)
  const verb = getKlingVerb(clipIndex, previousVerb);

  // Get lighting
  const lighting = getKlingLighting(emotion);

  // Build the prompt
  return buildKlingPrompt({
    character,
    action: `${verb} ${event}`,
    setting,
    camera,
    lighting,
    negatives: ['text', 'watermark', 'modern elements', 'blurry', 'standing still', 'posing', 'static'],
  });
}

/**
 * Map section type to Kling section type
 */
export function mapSectionType(sectionType: string): 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' {
  const lower = sectionType.toLowerCase();
  if (lower.includes('intro') || lower.includes('hook')) return 'intro';
  if (lower.includes('chorus')) return 'chorus';
  if (lower.includes('bridge') || lower.includes('pre')) return 'bridge';
  if (lower.includes('outro') || lower.includes('end')) return 'outro';
  return 'verse';
}

/**
 * Validate and fix a Kling prompt
 * CRITICAL: Always repairs missing elements (CAPS verb)
 * NOTE: Aspect ratio (9:16) is set via API parameter, NOT in prompt text
 * NOTE: --no flags are Stable Diffusion syntax — Kling ignores them. Stripped here.
 */
export function validateKlingPrompt(prompt: string): { valid: boolean; issues: string[]; fixed: string } {
  const issues: string[] = [];
  let fixed = prompt;

  // Strip --no flags (Stable Diffusion syntax, Kling ignores these)
  // Strip 9:16 references (set via API parameter)
  let cleanPrompt = prompt
    .replace(/\s*9:16\.?\s*/g, ' ')
    .replace(/\s*--no\s+[^,.]*/g, '')
    .trim();

  // Check word count AFTER stripping endings — Kling 3.0 handles up to ~120 tokens
  const wordCount = cleanPrompt.split(/\s+/).length;
  if (wordCount > 110) {
    issues.push(`Too long: ${wordCount} words (max 110 for Kling 3.0)`);
    // Truncate the content portion only
    cleanPrompt = cleanPrompt.split(/\s+/).slice(0, 100).join(' ');
    if (!cleanPrompt.endsWith('.')) cleanPrompt += '.';
  }

  // Check for boring verbs
  for (const boring of BORING_VERBS) {
    const regex = new RegExp(`\\b${boring}\\b`, 'i');
    if (regex.test(cleanPrompt)) {
      issues.push(`Boring verb detected: "${boring}"`);
    }
  }

  // Check for forbidden patterns
  const forbidden = ['looks at camera', 'gazes at viewer', 'stands regally', 'BBC documentary', 'looking around'];
  for (const pattern of forbidden) {
    if (cleanPrompt.toLowerCase().includes(pattern.toLowerCase())) {
      issues.push(`Forbidden pattern: "${pattern}"`);
    }
  }

  // Check for action verb in CAPS - only ONE allowed
  const capsVerbsFound = KLING_DYNAMIC_VERBS.filter((verb) => cleanPrompt.includes(verb));

  if (capsVerbsFound.length === 0) {
    issues.push('No CAPS action verb found');
    // Insert a random CAPS verb after subject name
    const randomVerb = KLING_DYNAMIC_VERBS[Math.floor(Math.random() * KLING_DYNAMIC_VERBS.length)];
    // Find first comma or space after potential subject
    const insertPoint =
      cleanPrompt.indexOf(',') > 0
        ? cleanPrompt.indexOf(',')
        : cleanPrompt.indexOf(' ', 15) > 0
          ? cleanPrompt.indexOf(' ', 15)
          : 0;
    if (insertPoint > 0) {
      cleanPrompt = cleanPrompt.slice(0, insertPoint) + ` ${randomVerb}` + cleanPrompt.slice(insertPoint);
    } else {
      cleanPrompt = `${randomVerb} ` + cleanPrompt;
    }
  } else if (capsVerbsFound.length > 1) {
    // DOUBLE VERB FIX: Keep only the first CAPS verb, remove others
    issues.push(`Multiple CAPS verbs found: ${capsVerbsFound.join(', ')} - keeping first`);
    const firstVerb = capsVerbsFound[0];
    for (let i = 1; i < capsVerbsFound.length; i++) {
      // Remove subsequent CAPS verbs
      cleanPrompt = cleanPrompt.replace(new RegExp(`\\s*${capsVerbsFound[i]}\\s*`, 'g'), ' ');
    }
  }

  // Ensure content ends with period
  if (!cleanPrompt.endsWith('.')) cleanPrompt += '.';

  // Reconstruct: clean prompt without --no flags (negatives handled separately via API)
  fixed = cleanPrompt.trim();

  return {
    valid: issues.length === 0,
    issues,
    fixed,
  };
}

/**
 * Convert a VEO-style prompt to Kling format
 */
export function convertVeoToKling(veoPrompt: string, character: KlingCharacter, clipIndex: number): string {
  // Extract action from VEO prompt if possible
  let action = '';
  const capsMatch = veoPrompt.match(/\b([A-Z]{4,}(?:ING|S|ED)?)\b/);
  if (capsMatch) {
    action = capsMatch[1];
  } else {
    action = getKlingVerb(clipIndex, null);
  }

  // Extract setting (anything after "in" or location-like phrases)
  let setting = 'dramatic historical setting';
  const settingMatch = veoPrompt.match(/(?:in|at|on|within)\s+([^,.]+)/i);
  if (settingMatch) {
    setting = settingMatch[1].trim().slice(0, 40);
  }

  // Pick camera and lighting
  const camera = getKlingCamera('dramatic', clipIndex, null);
  const lighting = getKlingLighting('power');

  return buildKlingPrompt({
    character,
    action: `${action} forward with determination`,
    setting,
    camera,
    lighting,
    negatives: ['text', 'watermark', 'modern elements'],
  });
}

// ============================================================
// STORY BEAT TEMPLATES
// ============================================================

/**
 * Generate standard documentary story beats
 */
export function generateDocumentaryStoryBeats(
  keyEvents: { event: string; visualSetting?: string; emotionalBeat?: string }[],
  totalClips: number,
): KlingStoryBeat[] {
  const beats: KlingStoryBeat[] = [];
  const clipsPerBeat = Math.ceil(totalClips / Math.max(keyEvents.length, 5));

  // Map key events to story beats
  keyEvents.forEach((event, index) => {
    const startClip = index * clipsPerBeat + 1;
    const endClip = Math.min((index + 1) * clipsPerBeat, totalClips);

    // Determine energy based on position
    let energy: KlingStoryBeat['energy'] = 'dramatic';
    if (index === 0) energy = 'explosive'; // Hook
    if (index === keyEvents.length - 1) energy = 'epic'; // Finale
    if (index === Math.floor(keyEvents.length / 2)) energy = 'intimate'; // Bridge

    beats.push({
      clipRange: [startClip, endClip],
      event: event.event,
      setting: event.visualSetting || 'historical dramatic setting',
      emotion: event.emotionalBeat || 'power',
      energy,
    });
  });

  return beats;
}

// ============================================================
// CINEMATIC PROMPT ENGINE v3.0 - HELPER FUNCTIONS
// ============================================================

/**
 * Get era palette string for era keywords
 * Matches common historical era terms to appropriate color palettes
 */
export function getEraPalette(era: string): string | null {
  const eraLower = era.toLowerCase();

  // Direct match first
  if (ERA_PALETTES[eraLower]) {
    return ERA_PALETTES[eraLower].promptString;
  }

  // Keyword matching
  if (
    eraLower.includes('egypt') ||
    eraLower.includes('cleopatra') ||
    eraLower.includes('pharaoh') ||
    eraLower.includes('nile')
  ) {
    return ERA_PALETTES.ancient_egyptian.promptString;
  }
  if (
    eraLower.includes('rome') ||
    eraLower.includes('roman') ||
    eraLower.includes('greek') ||
    eraLower.includes('classical') ||
    eraLower.includes('sparta')
  ) {
    return ERA_PALETTES.ancient_classical.promptString;
  }
  if (
    eraLower.includes('mongol') ||
    eraLower.includes('genghis') ||
    eraLower.includes('khan') ||
    eraLower.includes('steppe')
  ) {
    return ERA_PALETTES.mongol_empire.promptString;
  }
  if (
    eraLower.includes('medieval') ||
    eraLower.includes('crusade') ||
    eraLower.includes('knight') ||
    eraLower.includes('castle')
  ) {
    return ERA_PALETTES.medieval.promptString;
  }
  if (
    eraLower.includes('renaissance') ||
    eraLower.includes('medici') ||
    eraLower.includes('da vinci') ||
    eraLower.includes('baroque')
  ) {
    return ERA_PALETTES.renaissance.promptString;
  }
  if (
    eraLower.includes('victorian') ||
    eraLower.includes('19th') ||
    eraLower.includes('industrial') ||
    eraLower.includes('napoleon')
  ) {
    return ERA_PALETTES.victorian.promptString;
  }
  if (
    eraLower.includes('war') ||
    eraLower.includes('ww1') ||
    eraLower.includes('ww2') ||
    eraLower.includes('1940') ||
    eraLower.includes('1914')
  ) {
    return ERA_PALETTES.world_war.promptString;
  }

  return null;
}

/**
 * Get shot type based on narrative beat position
 * Maps clip position within video to appropriate shot type
 */
export function getShotForBeat(
  beatType: string | null,
  clipNumber: number,
  totalClips: number,
): { shot: string; camera: string; beat: string } {
  // Direct beat type match if provided
  if (beatType && SHOT_TYPES[beatType]) {
    return {
      shot: SHOT_TYPES[beatType].shot,
      camera: SHOT_TYPES[beatType].camera,
      beat: beatType,
    };
  }

  // Auto-detect beat from clip position (5-second clip system)
  const beat = getClipBeat(clipNumber, totalClips);
  return {
    shot: SHOT_TYPES[beat].shot,
    camera: SHOT_TYPES[beat].camera,
    beat,
  };
}

// DEPRECATED: Old position-based logic replaced by getClipBeat()
function _legacyShotForBeat(clipIndex: number, totalClips: number): { shot: string; camera: string } {
  const position = clipIndex / totalClips;
  if (position < 0.05) {
    return { shot: SHOT_TYPES.hook.shot, camera: SHOT_TYPES.hook.camera };
  } else if (position < 0.25) {
    return { shot: SHOT_TYPES.setup.shot, camera: SHOT_TYPES.setup.camera };
  } else if (position < 0.42) {
    return { shot: SHOT_TYPES.rising.shot, camera: SHOT_TYPES.rising.camera };
  } else if (position < 0.58) {
    return { shot: SHOT_TYPES.conflict.shot, camera: SHOT_TYPES.conflict.camera };
  } else if (position < 0.75) {
    return { shot: SHOT_TYPES.climax.shot, camera: SHOT_TYPES.climax.camera };
  } else if (position < 0.92) {
    return { shot: SHOT_TYPES.resolution.shot, camera: SHOT_TYPES.resolution.camera };
  } else {
    return { shot: SHOT_TYPES.hook_next.shot, camera: SHOT_TYPES.hook_next.camera };
  }
}

/**
 * Detect archetype from figure description keywords
 * Returns the best-matching archetype for visual treatment
 */
export function getArchetype(
  figureDescription: string,
): 'conqueror' | 'philosopher' | 'revolutionary' | 'ruler' | 'warrior' {
  const descLower = figureDescription.toLowerCase();

  // Conqueror keywords
  if (
    descLower.includes('conquer') ||
    descLower.includes('empire') ||
    descLower.includes('genghis') ||
    descLower.includes('alexander') ||
    descLower.includes('caesar') ||
    descLower.includes('napoleon')
  ) {
    return 'conqueror';
  }

  // Philosopher keywords
  if (
    descLower.includes('philosoph') ||
    descLower.includes('thinker') ||
    descLower.includes('scholar') ||
    descLower.includes('socrates') ||
    descLower.includes('plato') ||
    descLower.includes('confucius') ||
    descLower.includes('inventor') ||
    descLower.includes('scientist')
  ) {
    return 'philosopher';
  }

  // Revolutionary keywords
  if (
    descLower.includes('revolution') ||
    descLower.includes('rebel') ||
    descLower.includes('uprising') ||
    descLower.includes('freedom') ||
    descLower.includes('spartacus') ||
    descLower.includes('liberation')
  ) {
    return 'revolutionary';
  }

  // Ruler keywords
  if (
    descLower.includes('king') ||
    descLower.includes('queen') ||
    descLower.includes('emperor') ||
    descLower.includes('pharaoh') ||
    descLower.includes('cleopatra') ||
    descLower.includes('throne') ||
    descLower.includes('ruler') ||
    descLower.includes('dynasty')
  ) {
    return 'ruler';
  }

  // Warrior keywords
  if (
    descLower.includes('warrior') ||
    descLower.includes('soldier') ||
    descLower.includes('gladiator') ||
    descLower.includes('samurai') ||
    descLower.includes('knight') ||
    descLower.includes('battle') ||
    descLower.includes('combat') ||
    descLower.includes('fight')
  ) {
    return 'warrior';
  }

  // Default to conqueror for historical figures
  return 'conqueror';
}

/**
 * Build a cinematic Kling prompt with era, archetype, and beat awareness
 * Enhanced version that incorporates Cinematic Prompt Engine v3.0 concepts
 * Keeps prompts under 70 words while adding atmosphere
 */
export function buildCinematicKlingPrompt(config: CinematicPromptConfig): string {
  const {
    character,
    action,
    setting,
    camera: providedCamera,
    lighting: providedLighting,
    negatives = ['text', 'watermark', 'modern elements'],
    era,
    beatType,
    archetype,
  } = config;

  // Get era palette if provided
  const eraPalette = era ? getEraPalette(era) : null;

  // Get archetype-based lighting and energy if archetype provided
  const archetypeData = archetype ? ARCHETYPES[archetype] : null;

  // Determine camera from beat type or use provided
  let camera = providedCamera;
  if (beatType && !providedCamera) {
    const shotData = getShotForBeat(beatType, 0, 10);
    camera = shotData.camera;
  }

  // Determine lighting from archetype or use provided
  let lighting = providedLighting;
  if (archetypeData && !providedLighting) {
    const lightingKey = archetypeData.lightingStyle;
    if (DOCUMENTARY_LIGHTING[lightingKey]) {
      lighting = DOCUMENTARY_LIGHTING[lightingKey].promptString;
    }
  }

  // Build subject (keep concise for word count)
  const subject = `${character.name}, ${character.age}, ${character.gender}, ${character.appearance}, ${character.outfit}`;

  // Build enhanced setting with era palette (abbreviated to save words)
  let enhancedSetting = setting;
  if (eraPalette) {
    // Take only first 2-3 key palette terms to save words
    const paletteTerms = eraPalette.split(',').slice(0, 2).join(',').trim();
    enhancedSetting = `${setting}, ${paletteTerms}`;
  }

  // Negatives kept as metadata only — not embedded in prompt text (Kling ignores --no syntax)

  // Assemble prompt (target: 50-70 words, aspect ratio set via API parameter)
  const prompt = `${subject}. ${action}. ${enhancedSetting}. ${camera}, ${lighting}.`.trim();

  // Verify word count and truncate if needed
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 80) {
    console.warn(`⚠️ Cinematic prompt too long: ${wordCount} words. Truncating.`);
    // Smart truncation: shorten subject and setting, preserve camera/lighting
    const shortSubject = `${character.name}, ${character.gender}, ${character.appearance.split(',')[0]}`;
    const shortSetting = setting.split(' ').slice(0, 6).join(' ');

    return `${shortSubject}. ${action}. ${shortSetting}. ${camera}, ${lighting}.`.trim();
  }

  return prompt;
}

console.log('✅ Kling 2.5 Turbo Prompt Builder loaded (with Cinematic Engine v3.0)');
