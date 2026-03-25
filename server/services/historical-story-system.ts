/**
 * Historical Story System - DYNAMIC CINEMATIC PROMPTS
 *
 * Generates eye-catching, dynamic VEO/Kling prompts for ANY historical story.
 * Characters and story beats adapt to the episode's actual cast.
 *
 * Architecture:
 * 1. Story Beat Templates - character-agnostic emotional/narrative beats
 * 2. Camera Movement Pools - dynamic cinematography vocabulary
 * 3. Dynamic Verb Pools - action verbs for visual energy
 * 4. Character Slot System - fills templates with episode-specific characters
 */

// ============================================
// CHARACTER DEFINITIONS (Generic Interface)
// ============================================

export interface HistoricalCharacter {
  name: string;
  displayName: string;
  gender: 'male' | 'female';
  age: string;
  appearance: string;
  outfit: string;
  accessories: string;
  role?: 'protagonist' | 'ally' | 'antagonist' | 'supporting';
}

// ============================================
// CAMERA MOVEMENT POOLS (Reusable across all stories)
// ============================================

export const CAMERA_MOVEMENTS = {
  impact: ['SLOW MOTION LOW ANGLE', 'WHIP PAN', 'CRASH ZOOM', 'DUTCH ANGLE'],
  intimate: ['PUSH IN', 'EXTREME CLOSE-UP', 'INTIMATE CLOSE-UP', 'RACK FOCUS'],
  epic: ['CRANE DOWN', 'AERIAL TRACKING', 'EXTREME WIDE', 'CRANE UP'],
  chaos: ['HANDHELD CHAOS', 'HANDHELD URGENT', 'DUTCH ANGLE', 'TRACKING SHOT'],
  power: ['LOW ANGLE POWER', 'STEADICAM ORBIT', 'DOLLY IN', 'HERO SHOT'],
  tragedy: ['SLOW MOTION', 'SLOW MOTION FALL', 'TRACKING SHOT', 'PULL BACK'],
  contemplative: ['MEDIUM SHOT', 'STATIC HOLD', 'SLOW PUSH', 'RACK FOCUS'],
  reveal: ['WHIP PAN', 'AERIAL PULL BACK', 'CRANE UP', 'STEADICAM REVEAL'],
};

// ============================================
// DYNAMIC VERB POOLS (Action verbs for visual energy)
// ============================================

export const DYNAMIC_VERBS = {
  emergence: ['BURSTS', 'EMERGES', 'RISES', 'UNFURLS', 'EXPLODES', 'MATERIALIZES'],
  motion: ['SWIRLING', 'STREAMING', 'RUSHING', 'GLIDING', 'SURGING', 'SWEEPING'],
  light: ['BLAZING', 'CATCHING', 'FLICKERING', 'DANCING', 'GLOWING', 'WASHING'],
  impact: ['CRASHES', 'SLAMS', 'STRIKES', 'SHATTERS', 'THUNDERS', 'ROARS'],
  emotion: ['TRANSFORMS', 'HARDENS', 'SOFTENS', 'BREAKS', 'IGNITES', 'CRUMBLES'],
  fall: ['COLLAPSES', 'CRUMPLES', 'SLIPS', 'FADES', 'LOOSENS', 'FALLS'],
  tension: ['COILING', 'TIGHTENING', 'BUILDING', 'MOUNTING', 'PRESSING', 'GRIPPING'],
};

// ============================================
// STORY BEAT ARCHETYPES (Character-agnostic)
// ============================================

export interface StoryBeatTemplate {
  id: string;
  name: string;
  emotionalCore: string;
  cameraPool: keyof typeof CAMERA_MOVEMENTS;
  verbPool: keyof typeof DYNAMIC_VERBS;
  lightingMood: string;
  promptTemplate: string; // Uses {CHARACTER}, {ACTION}, {SETTING} placeholders
}

export const STORY_BEAT_TEMPLATES: StoryBeatTemplate[] = [
  // ACT 1: ORIGIN/INTRODUCTION
  {
    id: 'dramatic_entrance',
    name: 'Dramatic Entrance',
    emotionalCore: 'surprise, power reveal',
    cameraPool: 'impact',
    verbPool: 'emergence',
    lightingMood: 'torchlight DANCING across',
    promptTemplate: '{CAMERA}: {CHARACTER} {VERB} into frame, {DETAIL}, {LIGHTING}, 9:16',
  },
  {
    id: 'first_reaction',
    name: 'First Reaction',
    emotionalCore: 'shock, recognition',
    cameraPool: 'intimate',
    verbPool: 'emotion',
    lightingMood: 'firelight FLICKERING on stunned face',
    promptTemplate: '{CAMERA}: {CHARACTER} frozen mid-step, expression {VERB}, {DETAIL}, 9:16',
  },
  {
    id: 'rising_moment',
    name: 'Rising Moment',
    emotionalCore: 'power, determination',
    cameraPool: 'power',
    verbPool: 'emergence',
    lightingMood: 'golden light CATCHING',
    promptTemplate: '{CAMERA}: {CHARACTER} {VERB} to full height, {DETAIL}, {LIGHTING}, 9:16',
  },

  // ACT 2: ALLIANCE/ROMANCE
  {
    id: 'seduction_scene',
    name: 'Seduction/Alliance',
    emotionalCore: 'attraction, manipulation',
    cameraPool: 'intimate',
    verbPool: 'motion',
    lightingMood: 'moonlight STREAMING through',
    promptTemplate: '{CAMERA} through moonlit setting: {CHARACTER} glides ahead, {DETAIL}, {LIGHTING}, 9:16',
  },
  {
    id: 'intimate_moment',
    name: 'Intimate Moment',
    emotionalCore: 'connection, vulnerability',
    cameraPool: 'intimate',
    verbPool: 'light',
    lightingMood: 'candlelight FLICKERING between faces',
    promptTemplate: "{CAMERA}: {CHARACTER}'s finger traces {OTHER}'s jawline, {DETAIL}, 9:16",
  },

  // ACT 2: TRIUMPH/BIRTH
  {
    id: 'struggle_scene',
    name: 'Struggle Scene',
    emotionalCore: 'pain, determination',
    cameraPool: 'chaos',
    verbPool: 'tension',
    lightingMood: 'harsh shadows DANCING',
    promptTemplate: '{CAMERA}: {CHARACTER} {VERB}, face contorted, {DETAIL}, shadows {LIGHTING}, 9:16',
  },
  {
    id: 'triumph_moment',
    name: 'Triumph Moment',
    emotionalCore: 'victory, fierce joy',
    cameraPool: 'power',
    verbPool: 'emotion',
    lightingMood: 'golden light BLAZING',
    promptTemplate: "{CAMERA}: {CHARACTER}'s face {VERB} from agony to triumph, {DETAIL}, 9:16",
  },
  {
    id: 'legacy_reveal',
    name: 'Legacy Reveal',
    emotionalCore: 'pride, hope',
    cameraPool: 'epic',
    verbPool: 'light',
    lightingMood: 'shaft of sunlight STREAMING',
    promptTemplate: '{CAMERA}: {CHARACTER} lifts {OBJECT} toward light, dust motes {VERB}, {DETAIL}, 9:16',
  },

  // ACT 3: BETRAYAL/FALL
  {
    id: 'betrayal_chaos',
    name: 'Betrayal Chaos',
    emotionalCore: 'horror, violence',
    cameraPool: 'chaos',
    verbPool: 'impact',
    lightingMood: 'steel-blue light STABBING',
    promptTemplate: 'DUTCH ANGLE CHAOS: {CHARACTER} surrounded by enemies, weapons {VERB}, {DETAIL}, 9:16',
  },
  {
    id: 'fall_scene',
    name: 'Fall Scene',
    emotionalCore: 'tragedy, disbelief',
    cameraPool: 'tragedy',
    verbPool: 'fall',
    lightingMood: 'harsh overhead light EXPOSING',
    promptTemplate: '{CAMERA}: {CHARACTER} {VERB} to floor, hand still reaching, {DETAIL}, 9:16',
  },

  // ACT 3: BATTLE
  {
    id: 'battle_chaos',
    name: 'Battle Chaos',
    emotionalCore: 'desperation, violence',
    cameraPool: 'chaos',
    verbPool: 'impact',
    lightingMood: 'flames ROARING',
    promptTemplate: '{CAMERA}: {CHARACTER} on {SETTING}, armor dented, {VERB}, flames {LIGHTING}, 9:16',
  },
  {
    id: 'battle_separation',
    name: 'Battle Separation',
    emotionalCore: 'loss, reaching',
    cameraPool: 'epic',
    verbPool: 'motion',
    lightingMood: 'smoke BILLOWING',
    promptTemplate: '{CAMERA}: {CHARACTER} at ship stern, hand pressed to mouth, watching {OTHER} {VERB} away, 9:16',
  },
  {
    id: 'victor_moment',
    name: 'Victor Moment',
    emotionalCore: 'cold triumph',
    cameraPool: 'power',
    verbPool: 'light',
    lightingMood: 'cold light GLEAMING',
    promptTemplate: '{CAMERA}: {CHARACTER} at {SETTING}, pristine amid chaos, cold smile {VERB}, 9:16',
  },

  // ACT 4: DEATH/RESOLUTION
  {
    id: 'death_scene',
    name: 'Death Scene',
    emotionalCore: 'grief, intimacy',
    cameraPool: 'tragedy',
    verbPool: 'fall',
    lightingMood: 'single torch GUTTERING',
    promptTemplate: '{CAMERA}: {CHARACTER} collapsed against marble, hand pressed to wound, eyes {VERB}, 9:16',
  },
  {
    id: 'rush_to_dying',
    name: 'Rush to Dying',
    emotionalCore: 'desperation, love',
    cameraPool: 'tragedy',
    verbPool: 'motion',
    lightingMood: 'dim light FADING',
    promptTemplate: '{CAMERA}: {CHARACTER} {VERB} to fallen {OTHER}, robes streaming, slides to knees, 9:16',
  },
  {
    id: 'final_breath',
    name: 'Final Breath',
    emotionalCore: 'grief, release',
    cameraPool: 'intimate',
    verbPool: 'fall',
    lightingMood: 'light FADING from eyes',
    promptTemplate: "{CAMERA}: {CHARACTER}'s eyes fixed on {OTHER}, tears falling, grip {VERB}, 9:16",
  },
  {
    id: 'chosen_death',
    name: 'Chosen Death',
    emotionalCore: 'dignity, defiance',
    cameraPool: 'contemplative',
    verbPool: 'tension',
    lightingMood: 'golden light WASHING over',
    promptTemplate: "{CAMERA}: {CHARACTER}'s face hardening with resolve, fingers {VERB}, no fear in eyes, 9:16",
  },
  {
    id: 'peaceful_end',
    name: 'Peaceful End',
    emotionalCore: 'acceptance, transcendence',
    cameraPool: 'tragedy',
    verbPool: 'light',
    lightingMood: 'golden light WASHING over face',
    promptTemplate: '{CAMERA}: {CHARACTER} eyes CLOSING peacefully, {DETAIL}, crown tilting but not falling, 9:16',
  },

  // LEGACY
  {
    id: 'final_rest',
    name: 'Final Rest',
    emotionalCore: 'reverence, stillness',
    cameraPool: 'epic',
    verbPool: 'light',
    lightingMood: 'last light FADING',
    promptTemplate: '{CAMERA}: {CHARACTER} lying in full regalia, {DETAIL}, last light {VERB}, 9:16',
  },
  {
    id: 'eternal_legacy',
    name: 'Eternal Legacy',
    emotionalCore: 'immortality, awe',
    cameraPool: 'reveal',
    verbPool: 'light',
    lightingMood: 'sunset GLITTERING gold',
    promptTemplate:
      "AERIAL PULL BACK: Monuments at sunset, {CHARACTER}'s face carved in stone, legacy {VERB} to horizon, 9:16",
  },
];

// ============================================
// STORY ARCHETYPES (Different narrative structures)
// ============================================

interface StoryArchetype {
  id: string;
  name: string;
  beatSequence: string[]; // References beat template IDs
  characterRoles: string[]; // protagonist, ally, antagonist, etc.
}

const STORY_ARCHETYPES: Record<string, StoryArchetype> = {
  rise_and_fall: {
    id: 'rise_and_fall',
    name: 'Rise and Fall',
    beatSequence: [
      'dramatic_entrance',
      'first_reaction',
      'rising_moment',
      'seduction_scene',
      'intimate_moment',
      'struggle_scene',
      'triumph_moment',
      'betrayal_chaos',
      'fall_scene',
      'battle_chaos',
      'battle_separation',
      'victor_moment',
      'death_scene',
      'rush_to_dying',
      'final_breath',
      'chosen_death',
      'peaceful_end',
      'final_rest',
      'eternal_legacy',
    ],
    characterRoles: ['protagonist', 'ally', 'antagonist'],
  },
  conqueror: {
    id: 'conqueror',
    name: 'Conqueror',
    beatSequence: [
      'dramatic_entrance',
      'rising_moment',
      'triumph_moment',
      'battle_chaos',
      'victor_moment',
      'battle_chaos',
      'victor_moment',
      'legacy_reveal',
      'death_scene',
      'final_rest',
      'eternal_legacy',
    ],
    characterRoles: ['protagonist', 'ally', 'enemy'],
  },
  tragic_love: {
    id: 'tragic_love',
    name: 'Tragic Love',
    beatSequence: [
      'dramatic_entrance',
      'first_reaction',
      'seduction_scene',
      'intimate_moment',
      'struggle_scene',
      'triumph_moment',
      'battle_separation',
      'death_scene',
      'rush_to_dying',
      'final_breath',
      'chosen_death',
      'peaceful_end',
      'eternal_legacy',
    ],
    characterRoles: ['protagonist', 'lover', 'antagonist'],
  },
};

// ============================================
// CLEOPATRA CHARACTER DEFINITIONS (Example template)
// ============================================

export const CLEOPATRA_CHARACTERS: HistoricalCharacter[] = [
  {
    name: 'cleopatra',
    displayName: 'CLEOPATRA VII',
    gender: 'female',
    age: 'late 20s',
    appearance: 'olive-skinned Egyptian queen, piercing kohl-lined eyes, regal bone structure, full lips',
    outfit: 'white silk Egyptian gown with gold embroidery, cobra crown headdress',
    accessories: 'golden arm bands, ornate necklace, asp motif jewelry',
    role: 'protagonist',
  },
  {
    name: 'julius_caesar',
    displayName: 'JULIUS CAESAR',
    gender: 'male',
    age: 'mid 50s',
    appearance: 'weathered Roman general, sharp calculating eyes, receding grey hair, strong jaw',
    outfit: 'crimson Roman military cloak, gold-trimmed armor breastplate',
    accessories: 'laurel wreath, gladius sword at hip, signet ring',
    role: 'ally',
  },
  {
    name: 'mark_antony',
    displayName: 'MARK ANTONY',
    gender: 'male',
    age: 'early 40s',
    appearance: 'broad-shouldered Roman warrior, passionate dark eyes, curly dark hair, battle scars',
    outfit: 'purple Roman general cloak, bronze chest armor, leather pteruges',
    accessories: 'Roman eagle medallion, ornate sword, wine goblet',
    role: 'ally',
  },
  {
    name: 'octavian',
    displayName: 'OCTAVIAN',
    gender: 'male',
    age: 'late 20s',
    appearance: 'pale calculating young Roman, cold blue eyes, cropped blonde hair, thin lips',
    outfit: 'pristine white toga with purple border, polished silver armor',
    accessories: 'Roman signet ring, scroll in hand, laurel wreath',
    role: 'antagonist',
  },
];

// ============================================
// STORY BEATS (for compatibility with existing system)
// ============================================

export interface StoryBeat {
  id: string;
  name: string;
  clipRange: [number, number];
  characters: string[];
  setting: string;
  emotion: string;
  action: string;
  camera: string;
}

export const CLEOPATRA_BEATS: StoryBeat[] = [
  {
    id: 'carpet_reveal',
    name: 'The Carpet Reveal',
    clipRange: [1, 3],
    characters: ['cleopatra', 'julius_caesar'],
    setting: "Caesar's tent in Alexandria, torches blazing",
    emotion: 'surprise, intrigue, bold seduction',
    action: 'Cleopatra emerges from rolled carpet before stunned Caesar',
    camera: 'SLOW MOTION LOW ANGLE, WHIP PAN, PUSH IN',
  },
  {
    id: 'seduction',
    name: 'Seduction',
    clipRange: [4, 5],
    characters: ['cleopatra', 'julius_caesar'],
    setting: 'Moonlit palace gardens, lotus pools',
    emotion: 'attraction, ambition, romance',
    action: 'Cleopatra seduces Caesar',
    camera: 'CRANE DOWN, INTIMATE CLOSE-UP',
  },
  {
    id: 'caesarion_birth',
    name: 'Birth of Caesarion',
    clipRange: [6, 8],
    characters: ['cleopatra'],
    setting: 'Royal birthing chamber, silk drapes',
    emotion: 'agony, triumph, maternal love',
    action: 'Cleopatra gives birth to heir',
    camera: 'HANDHELD URGENT, EXTREME CLOSE-UP',
  },
  {
    id: 'caesar_death',
    name: "Caesar's Fall",
    clipRange: [9, 10],
    characters: ['julius_caesar'],
    setting: 'Roman Senate floor, marble columns',
    emotion: 'betrayal, horror, chaos',
    action: 'Caesar assassinated',
    camera: 'DUTCH ANGLE CHAOS, SLOW MOTION FALL',
  },
  {
    id: 'antony_arrives',
    name: 'Antony Arrives',
    clipRange: [11, 12],
    characters: ['cleopatra', 'mark_antony'],
    setting: 'Golden barge on Nile, sunset',
    emotion: 'seduction, power display',
    action: 'Cleopatra meets Antony',
    camera: 'AERIAL TRACKING, LOW ANGLE',
  },
  {
    id: 'actium_battle',
    name: 'Battle of Actium',
    clipRange: [13, 15],
    characters: ['mark_antony', 'cleopatra'],
    setting: 'Mediterranean naval battle, burning ships',
    emotion: 'desperation, defeat',
    action: 'Naval battle lost',
    camera: 'HANDHELD CHAOS, EXTREME WIDE',
  },
  {
    id: 'octavian_triumph',
    name: 'Octavian Triumphant',
    clipRange: [16, 17],
    characters: ['octavian'],
    setting: 'Victorious ship bow',
    emotion: 'cold triumph, calculation',
    action: 'Octavian commands victory',
    camera: 'LOW ANGLE POWER, MEDIUM SHOT',
  },
  {
    id: 'antony_death',
    name: 'Death of Antony',
    clipRange: [18, 20],
    characters: ['mark_antony', 'cleopatra'],
    setting: 'Alexandria mausoleum, single torch',
    emotion: 'grief, desperation, love',
    action: "Antony dies in Cleopatra's arms",
    camera: 'INTIMATE SHOT, SLOW MOTION',
  },
  {
    id: 'asp_death',
    name: 'Death by Asp',
    clipRange: [21, 22],
    characters: ['cleopatra'],
    setting: 'Royal death chamber, fig basket',
    emotion: 'dignity, defiance, peace',
    action: 'Cleopatra chooses death',
    camera: 'CLOSE-UP, SLOW MOTION',
  },
  {
    id: 'legacy',
    name: 'Eternal Legacy',
    clipRange: [23, 24],
    characters: ['cleopatra'],
    setting: 'Egyptian monuments at sunset',
    emotion: 'reverence, immortality',
    action: 'Her legend echoes',
    camera: 'CRANE UP, AERIAL PULL BACK',
  },
];

// ============================================
// DYNAMIC PROMPT GENERATION
// ============================================

function getRandomFromArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateDynamicPrompt(
  beatTemplate: StoryBeatTemplate,
  character: HistoricalCharacter,
  otherCharacter: HistoricalCharacter | null,
  setting: string,
  clipIndex: number,
): string {
  const cameraPool = CAMERA_MOVEMENTS[beatTemplate.cameraPool];
  const verbPool = DYNAMIC_VERBS[beatTemplate.verbPool];

  const camera = cameraPool[clipIndex % cameraPool.length];
  const verb = verbPool[clipIndex % verbPool.length];

  // Build character-specific details
  const charDetail = `${character.appearance.split(',')[0]}, ${character.outfit.split(',')[0]}`;

  let prompt = beatTemplate.promptTemplate
    .replace('{CAMERA}', camera)
    .replace('{CHARACTER}', character.displayName)
    .replace('{VERB}', verb)
    .replace('{DETAIL}', charDetail)
    .replace('{LIGHTING}', beatTemplate.lightingMood)
    .replace('{SETTING}', setting)
    .replace('{OBJECT}', character.accessories.split(',')[0] || 'legacy');

  if (otherCharacter) {
    prompt = prompt.replace('{OTHER}', otherCharacter.displayName);
  } else {
    prompt = prompt.replace('{OTHER}', 'the enemy');
  }

  return prompt;
}

// ============================================
// MAIN API - STORY PROMPT GENERATION
// ============================================

export interface StoryPromptResult {
  clip: number;
  timestamp: string;
  character: string;
  prompt: string;
  wordCount: number;
  action: string;
  setting: string;
}

export interface StoryGenerationStats {
  totalClips: number;
  characters: string[];
  characterDistribution: Record<string, { count: number; percentage: number }>;
  avgWordCount: number;
  estimatedCost: number;
}

/**
 * Generate cinematic prompts for ANY historical story.
 * Adapts to the characters provided - not hardcoded to Cleopatra.
 *
 * @param figureName Name of historical figure (used to select archetype)
 * @param totalClips Number of clips to generate
 * @param clipDuration Duration per clip in seconds
 * @param customCharacters Optional - provide custom character cast
 * @param storyArchetype Optional - 'rise_and_fall', 'conqueror', 'tragic_love'
 */
export function generateStoryPrompts(
  figureName: string,
  totalClips: number = 24,
  clipDuration: number = 5,
  customCharacters?: HistoricalCharacter[],
  storyArchetype: string = 'rise_and_fall',
): { prompts: StoryPromptResult[]; stats: StoryGenerationStats } {
  const figureLower = figureName.toLowerCase().replace(/\s+/g, '_');

  console.log(`\n🎬 GENERATING DYNAMIC STORY: ${figureName}`);
  console.log(`   Total clips requested: ${totalClips}`);
  console.log(`   Clip duration: ${clipDuration}s`);
  console.log(`   Story archetype: ${storyArchetype}`);

  // Use custom characters if provided, otherwise use Cleopatra as fallback
  let characters: HistoricalCharacter[];
  if (customCharacters && customCharacters.length > 0) {
    characters = customCharacters;
    console.log(`   Using CUSTOM characters: ${characters.map((c) => c.displayName).join(', ')}`);
  } else if (figureLower.includes('cleopatra')) {
    characters = CLEOPATRA_CHARACTERS;
    console.log(`   Using CLEOPATRA template characters`);
  } else {
    // Create generic character from figure name
    characters = createCharacterFromName(figureName);
    console.log(`   Generated characters from figure name: ${characters.map((c) => c.displayName).join(', ')}`);
  }

  // Get story archetype
  const archetype = STORY_ARCHETYPES[storyArchetype] || STORY_ARCHETYPES.rise_and_fall;
  console.log(`   Using archetype: ${archetype.name} (${archetype.beatSequence.length} beats)`);

  // Generate prompts
  const prompts = generatePromptsFromArchetype(characters, archetype, totalClips, clipDuration);

  // Calculate statistics
  const charCounts: Record<string, number> = {};
  for (const p of prompts) {
    charCounts[p.character] = (charCounts[p.character] || 0) + 1;
  }

  const characterDistribution: Record<string, { count: number; percentage: number }> = {};
  for (const [charName, count] of Object.entries(charCounts)) {
    characterDistribution[charName] = {
      count,
      percentage: Math.round((count / prompts.length) * 100),
    };
  }

  const avgWordCount = Math.round(prompts.reduce((sum, p) => sum + p.prompt.split(/\s+/).length, 0) / prompts.length);

  const estimatedCost = prompts.length * 0.1;

  console.log(`\n   📊 Character Distribution:`);
  for (const [charName, data] of Object.entries(characterDistribution)) {
    console.log(`      ${charName}: ${data.count} clips (${data.percentage}%)`);
  }
  console.log(`   📝 Average word count: ${avgWordCount}`);
  console.log(`   💰 Estimated cost: $${estimatedCost.toFixed(2)}`);

  return {
    prompts,
    stats: {
      totalClips: prompts.length,
      characters: Object.keys(characterDistribution),
      characterDistribution,
      avgWordCount,
      estimatedCost,
    },
  };
}

/**
 * Generate prompts using story archetype and character cast
 */
function generatePromptsFromArchetype(
  characters: HistoricalCharacter[],
  archetype: StoryArchetype,
  totalClips: number,
  clipDuration: number,
): StoryPromptResult[] {
  const results: StoryPromptResult[] = [];
  const protagonist = characters.find((c) => c.role === 'protagonist') || characters[0];
  const ally = characters.find((c) => c.role === 'ally') || characters[1];
  const antagonist = characters.find((c) => c.role === 'antagonist') || characters[2];

  // Scale beat sequence to match total clips
  const beatSequence = archetype.beatSequence;
  const beatsPerClip = beatSequence.length / totalClips;

  for (let clipIdx = 0; clipIdx < totalClips; clipIdx++) {
    const beatIdx = Math.min(
      Math.floor(
        clipIdx * beatsPerClip * (beatSequence.length / totalClips) + (clipIdx / totalClips) * beatSequence.length,
      ) % beatSequence.length,
      beatSequence.length - 1,
    );
    const beatId =
      beatSequence[Math.floor((clipIdx / totalClips) * beatSequence.length) % beatSequence.length] ||
      beatSequence[clipIdx % beatSequence.length];

    const beatTemplate =
      STORY_BEAT_TEMPLATES.find((b) => b.id === beatId) || STORY_BEAT_TEMPLATES[clipIdx % STORY_BEAT_TEMPLATES.length];

    // Determine character for this clip (70% protagonist, 15% ally, 15% antagonist)
    let character: HistoricalCharacter;
    let otherCharacter: HistoricalCharacter | null = null;

    const roll = Math.random();
    if (roll < 0.7 || !ally) {
      character = protagonist;
      otherCharacter = ally || antagonist || null;
    } else if (roll < 0.85 || !antagonist) {
      character = ally || protagonist;
      otherCharacter = protagonist;
    } else {
      character = antagonist || protagonist;
      otherCharacter = protagonist;
    }

    // Generate setting based on beat
    const setting = getSettingForBeat(beatTemplate.id, character);

    // Generate dynamic prompt
    const prompt = generateDynamicPrompt(beatTemplate, character, otherCharacter, setting, clipIdx);

    // Calculate timestamp
    const startSec = clipIdx * clipDuration;
    const endSec = startSec + clipDuration;
    const timestamp = formatTimestamp(startSec, endSec);

    results.push({
      clip: clipIdx + 1,
      timestamp,
      character: character.displayName,
      prompt,
      wordCount: prompt.split(/\s+/).length,
      action: beatTemplate.name,
      setting,
    });
  }

  return results;
}

/**
 * Create character definitions from a figure name
 */
function createCharacterFromName(figureName: string): HistoricalCharacter[] {
  const displayName = figureName.toUpperCase();

  return [
    {
      name: figureName.toLowerCase().replace(/\s+/g, '_'),
      displayName,
      gender: 'male', // Default, should be overridden by deepResearch
      age: 'middle-aged',
      appearance: 'weathered features, commanding presence, piercing eyes',
      outfit: 'period-accurate royal attire, armor or robes of power',
      accessories: 'symbols of authority, weapons of the era',
      role: 'protagonist',
    },
    {
      name: 'ally',
      displayName: 'TRUSTED ALLY',
      gender: 'male',
      age: 'adult',
      appearance: 'loyal features, battle-worn, dedicated gaze',
      outfit: 'military attire of the era',
      accessories: 'weapons, insignia of rank',
      role: 'ally',
    },
    {
      name: 'antagonist',
      displayName: 'RIVAL POWER',
      gender: 'male',
      age: 'adult',
      appearance: 'calculating eyes, ambitious bearing, cold expression',
      outfit: 'opposing faction attire',
      accessories: 'symbols of competing power',
      role: 'antagonist',
    },
  ];
}

/**
 * Get contextual setting for a beat
 */
function getSettingForBeat(beatId: string, character: HistoricalCharacter): string {
  const settings: Record<string, string> = {
    dramatic_entrance: 'torch-lit chamber, dramatic shadows',
    first_reaction: 'same chamber, stunned observers',
    rising_moment: 'throne room, golden light streaming',
    seduction_scene: 'moonlit gardens, lotus pools',
    intimate_moment: 'private chamber, candlelight',
    struggle_scene: 'enclosed space, flickering torches',
    triumph_moment: 'palace balcony, dawn light',
    legacy_reveal: 'sacred temple, shaft of sunlight',
    betrayal_chaos: 'grand hall, chaos erupting',
    fall_scene: 'marble floor, blood pooling',
    battle_chaos: 'burning battlefield, smoke rising',
    battle_separation: 'ship deck, distant horizon',
    victor_moment: 'conquered ground, enemies fallen',
    death_scene: 'cold stone chamber, single torch',
    rush_to_dying: 'mausoleum, dim light fading',
    final_breath: 'intimate space, tears falling',
    chosen_death: 'royal chamber, golden furniture',
    peaceful_end: 'deathbed, peaceful light',
    final_rest: 'tomb chamber, last light fading',
    eternal_legacy: 'monuments at sunset, eternal desert',
  };

  return settings[beatId] || 'dramatic period setting';
}

function formatTimestamp(startSec: number, endSec: number): string {
  const startMin = Math.floor(startSec / 60);
  const startSecRem = startSec % 60;
  const endMin = Math.floor(endSec / 60);
  const endSecRem = endSec % 60;

  return `${startMin}:${String(startSecRem).padStart(2, '0')}-${endMin}:${String(endSecRem).padStart(2, '0')}`;
}

// ============================================
// LEGACY EXPORTS
// ============================================

export interface ClipAssignment {
  clipIndex: number;
  beat: StoryBeat;
  primaryChar: HistoricalCharacter;
  secondaryChar?: HistoricalCharacter;
  shotType: 'solo' | 'wide' | 'environment';
  action: string;
  setting: string;
  camera: string;
  lighting: string;
}

export interface KlingPrompt {
  clip: number;
  timestamp: string;
  character: string;
  prompt: string;
  wordCount: number;
  action: string;
  setting: string;
}

export const EMOTION_LIGHTING: Record<string, string> = {
  surprise: 'torchlight DANCING dramatically',
  intrigue: 'candlelight FLICKERING mysteriously',
  attraction: 'golden light CATCHING faces',
  ambition: 'powerful backlight BLAZING',
  romance: 'soft amber light GLOWING',
  hope: 'morning light STREAMING through',
  maternal: 'warm soft light WASHING over',
  betrayal: 'harsh cold light STABBING',
  horror: 'stark red-accented shadows POOLING',
  chaos: 'fire light ROARING unstable',
  seduction: 'sultry golden hour PAINTING',
  passion: 'dramatic contrast DANCING',
  desperation: 'harsh overhead light EXPOSING',
  defeat: 'cold twilight FADING',
  grief: 'single candle GUTTERING',
  despair: 'near darkness CONSUMING',
  dignity: 'regal light CROWNING',
  defiance: 'strong backlight BLAZING',
  reverence: 'golden eternal sunset GLOWING',
  historical: 'warm amber documentary PAINTING',
};

export const CHARACTER_ACTIONS: Record<string, string[]> = {
  cleopatra: [
    'RISES with serpentine grace',
    'EXTENDS hand imperiously',
    'TURNS with cobra-like precision',
    'COMMANDS with blazing eyes',
  ],
  julius_caesar: [
    'STANDS with military bearing',
    'GESTURES decisively at maps',
    'COMMANDS his legions',
    'FALLS in slow motion',
  ],
  mark_antony: [
    'APPROACHES with passionate intensity',
    'REACHES toward her desperately',
    'FIGHTS with fierce determination',
    'COLLAPSES wounded',
  ],
  octavian: [
    'WATCHES with cold calculation',
    'ADVANCES with Roman discipline',
    'CLAIMS victory coldly',
    'STANDS triumphant',
  ],
};

export { CLEOPATRA_CHARACTERS as CLEOPATRA_CAST };

// ============================================
// STORY TEMPLATE AVAILABILITY
// ============================================

export function getAvailableStoryTemplates(): string[] {
  return Object.keys(STORY_ARCHETYPES);
}

export function hasStoryTemplate(figureName: string): boolean {
  // Now we can generate for ANY figure using archetypes
  return true;
}

export function getStoryArchetypes(): Record<string, StoryArchetype> {
  return STORY_ARCHETYPES;
}

/**
 * Create characters from deep research data
 */
export function createCharactersFromDeepResearch(
  deepResearch: any,
  additionalCharacters?: { name: string; role: 'ally' | 'antagonist' }[],
): HistoricalCharacter[] {
  const characters: HistoricalCharacter[] = [];

  // Main character from deep research
  const mainChar: HistoricalCharacter = {
    name: deepResearch.basicInfo?.fullName?.toLowerCase().replace(/\s+/g, '_') || 'protagonist',
    displayName: deepResearch.basicInfo?.fullName?.toUpperCase() || 'PROTAGONIST',
    gender:
      deepResearch.characterAppearance?.physical?.includes('woman') ||
      deepResearch.characterAppearance?.physical?.includes('female')
        ? 'female'
        : 'male',
    age: deepResearch.characterAppearance?.ageToDepict || 'middle-aged',
    appearance: deepResearch.characterAppearance?.physical || 'commanding presence, piercing eyes',
    outfit: deepResearch.characterAppearance?.primaryOutfit || 'period-accurate attire',
    accessories: deepResearch.characterAppearance?.accessories || 'symbols of authority',
    role: 'protagonist',
  };
  characters.push(mainChar);

  // Add additional characters if specified
  if (additionalCharacters) {
    for (const addChar of additionalCharacters) {
      characters.push({
        name: addChar.name.toLowerCase().replace(/\s+/g, '_'),
        displayName: addChar.name.toUpperCase(),
        gender: 'male',
        age: 'adult',
        appearance: 'period-accurate appearance',
        outfit: 'era-appropriate attire',
        accessories: 'symbols of their role',
        role: addChar.role,
      });
    }
  }

  return characters;
}
