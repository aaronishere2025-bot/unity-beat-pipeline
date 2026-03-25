/**
 * SUNO STYLE CONFIGURATION
 * Automatically applies optimized style tags based on content type
 */

// ============================================================================
// FORBIDDEN TERMS - Auto-remove copyrighted names
// ============================================================================

export const FORBIDDEN_TERMS = [
  // Artists
  'Eminem',
  'Kendrick Lamar',
  'Drake',
  'Kanye',
  'Jay-Z',
  'Nas',
  'Hans Zimmer',
  'John Williams',
  'Beethoven',
  'Mozart',

  // Shows/Films
  'Game of Thrones',
  'Lord of the Rings',
  'Star Wars',
  'Marvel',
  'Gladiator',
  'Vikings',
  'Peaky Blinders',

  // Brands
  'Netflix',
  'HBO',
  'Disney',
  'Pixar',
];

export const TERM_REPLACEMENTS: Record<string, string> = {
  Eminem: 'aggressive lyrical delivery with technical wordplay',
  'Kendrick Lamar': 'narrative-driven conscious hip-hop',
  'Hans Zimmer': 'blockbuster film score production',
  'Game of Thrones': 'medieval fantasy epic scale',
  Gladiator: 'ancient war epic cinematic',
  HBO: 'prestige drama',
  Marvel: 'blockbuster action',
};

// ============================================================================
// BASE STYLE COMPONENTS
// ============================================================================

const HOOK_REQUIREMENTS = `
hook-first structure, beat drops in first 2 bars,
no slow intro, no ambient buildup, immediate energy from bar 1,
attention-grabbing percussion from first beat
`.trim();

const VOCAL_CLARITY = `
clear confident diction, professional vocal delivery,
lyrics clearly audible over instrumental
`.trim();

// ============================================================================
// CONTENT TYPE STYLES
// ============================================================================

export const SUNO_STYLES = {
  // Historical Epic Battles (Genghis vs Alexander, Spartans vs Persians)
  historicalBattle: {
    genre: 'cinematic orchestral trap, epic rap battle',
    bpm: '140 BPM half-time feel',
    instrumentation: `
      thunderous 808s layered with taiko war drums,
      dark orchestral strings, brass stabs on impacts,
      choir harmonies on chorus
    `.trim(),
    vocals: 'two aggressive male vocal deliveries trading bars',
    mood: 'blockbuster film score meets modern hip-hop, medieval fantasy epic scale',
    structure: HOOK_REQUIREMENTS,
    clarity: VOCAL_CLARITY,
  },

  // Food Battles (Pizza vs Tacos, Cats vs Dogs food themes)
  foodBattle: {
    genre: 'comedic hip-hop, playful rap battle',
    bpm: '95 BPM, bouncy groove',
    instrumentation: `
      boom-bap drums, jazzy piano samples,
      funky bass, occasional horn stabs,
      playful synth accents
    `.trim(),
    vocals: 'two distinct character voices, theatrical delivery',
    mood: 'funny but competitive, mock-serious energy, absurdist comedy',
    structure: HOOK_REQUIREMENTS,
    clarity: VOCAL_CLARITY,
  },

  // Creature/Animal Battles (Owl vs Crane warriors)
  creatureBattle: {
    genre: 'epic orchestral hip-hop, fantasy rap battle',
    bpm: '100 BPM, powerful groove',
    instrumentation: `
      orchestral strings, war drums, tribal percussion,
      ethereal pads, brass fanfares on chorus,
      cinematic risers and impacts
    `.trim(),
    vocals: 'two powerful character voices with distinct personalities',
    mood: 'fantasy adventure epic, mythical battle energy',
    structure: HOOK_REQUIREMENTS,
    clarity: VOCAL_CLARITY,
  },

  // Motivational/Inspirational
  motivational: {
    genre: 'uplifting orchestral hip-hop, inspirational rap',
    bpm: '85 BPM, anthemic feel',
    instrumentation: `
      soaring strings, piano foundation,
      building drums, choir swells,
      triumphant brass on chorus
    `.trim(),
    vocals: 'passionate confident delivery, storytelling flow',
    mood: 'triumphant, overcoming adversity, hero journey',
    structure: HOOK_REQUIREMENTS,
    clarity: VOCAL_CLARITY,
  },

  // Chill/Lofi (for non-battle content)
  chill: {
    genre: 'lofi hip-hop, relaxed beats',
    bpm: '75 BPM, laid-back groove',
    instrumentation: `
      dusty vinyl samples, mellow piano,
      soft drums with swing, warm bass,
      ambient textures
    `.trim(),
    vocals: 'smooth relaxed delivery, conversational tone',
    mood: 'cozy, reflective, late night vibes',
    structure: 'gentle intro okay, smooth transitions',
    clarity: VOCAL_CLARITY,
  },
};

// ============================================================================
// STYLE BUILDER FUNCTION
// ============================================================================

export type ContentType = keyof typeof SUNO_STYLES;

export function buildSunoStyle(contentType: ContentType): string {
  const style = SUNO_STYLES[contentType];

  const parts = [
    style.genre,
    style.bpm,
    style.instrumentation,
    style.vocals,
    style.mood,
    style.structure,
    style.clarity,
  ];

  return parts.join(', ').replace(/\s+/g, ' ').trim();
}

// ============================================================================
// AUTO-DETECT CONTENT TYPE
// ============================================================================

export function detectContentType(topic: string, lyrics?: string): ContentType {
  const text = `${topic} ${lyrics || ''}`.toLowerCase();

  // Historical figures
  const historicalKeywords = [
    'genghis',
    'khan',
    'alexander',
    'caesar',
    'cleopatra',
    'napoleon',
    'spartans',
    'persians',
    'vikings',
    'samurai',
    'gladiator',
    'emperor',
    'pharaoh',
    'king',
    'queen',
    'dynasty',
    'empire',
    'conquest',
    'battle of',
    'war of',
    'marco polo',
    'kublai',
    'saladin',
    'richard',
    'crusade',
    'attila',
    'hun',
    'mongol',
    'roman',
    'greek',
    'egyptian',
    'persian',
    'ottoman',
    'byzantine',
    'medieval',
    'ancient',
    'warrior king',
  ];

  // Food themes
  const foodKeywords = [
    'pizza',
    'taco',
    'burger',
    'sushi',
    'pasta',
    'food',
    'chef',
    'kitchen',
    'restaurant',
    'cooking',
    'breakfast',
    'dinner',
    'lunch',
    'delicious',
    'tasty',
    'hungry',
    'eat',
    'ramen',
    'curry',
    'steak',
    'chicken',
    'beef',
    'pork',
    'fish',
    'vegetable',
    'fruit',
    'dessert',
  ];

  // Creature/Animal themes
  const creatureKeywords = [
    'owl',
    'crane',
    'wolf',
    'eagle',
    'lion',
    'dragon',
    'phoenix',
    'cat',
    'dog',
    'bear',
    'tiger',
    'anthropomorphic',
    'creature',
    'beast',
    'animal warrior',
    'spirit animal',
    'fox',
    'hawk',
    'raven',
    'serpent',
    'shark',
    'panther',
    'gorilla',
    'elephant',
    'rhino',
  ];

  // Check for matches
  const hasHistorical = historicalKeywords.some((kw) => text.includes(kw));
  const hasFood = foodKeywords.some((kw) => text.includes(kw));
  const hasCreature = creatureKeywords.some((kw) => text.includes(kw));

  // Priority: Historical > Creature > Food > Default
  if (hasHistorical && !hasCreature) return 'historicalBattle';
  if (hasCreature) return 'creatureBattle';
  if (hasFood) return 'foodBattle';

  // Default to historical battle (main content type)
  return 'historicalBattle';
}

// ============================================================================
// SANITIZE FUNCTION - Remove forbidden terms
// ============================================================================

export function sanitizeSunoPrompt(prompt: string): string {
  let sanitized = prompt;

  // Replace known terms with safe alternatives
  for (const [forbidden, replacement] of Object.entries(TERM_REPLACEMENTS)) {
    const regex = new RegExp(forbidden, 'gi');
    sanitized = sanitized.replace(regex, replacement);
  }

  // Remove any remaining forbidden terms
  for (const term of FORBIDDEN_TERMS) {
    const regex = new RegExp(term, 'gi');
    sanitized = sanitized.replace(regex, '');
  }

  // Clean up double spaces and commas
  sanitized = sanitized.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();

  return sanitized;
}

// ============================================================================
// MAIN EXPORT - Generate complete Suno style tags
// ============================================================================

export function generateSunoStyleTags(
  topic: string,
  lyrics?: string,
  overrideType?: ContentType,
): {
  fullStyleString: string;
  contentType: ContentType;
  genre: string;
  bpm: string;
  mood: string;
} {
  // Detect or use override
  const contentType = overrideType || detectContentType(topic, lyrics);
  const style = SUNO_STYLES[contentType];

  // Build the style string
  const styleString = buildSunoStyle(contentType);

  // Sanitize to remove any forbidden terms
  const sanitized = sanitizeSunoPrompt(styleString);

  console.log(`🎵 Suno Style Generated:`);
  console.log(`   Content Type: ${contentType}`);
  console.log(`   Style Tags: ${sanitized.substring(0, 100)}...`);

  return {
    fullStyleString: sanitized,
    contentType,
    genre: style.genre,
    bpm: style.bpm,
    mood: style.mood,
  };
}

// ============================================================================
// STRUCTURE TAGS GENERATOR
// ============================================================================

export function generateStructureTags(contentType: ContentType): string {
  const structures: Record<ContentType, string> = {
    historicalBattle: `
[Intro] 4 bars, immediate drums and strings, tension building, no slow buildup
[Verse 1] aggressive delivery, first warrior attacks, war drums prominent
[Chorus] choir joins, full orchestral, anthemic hook, memorable melody
[Verse 2] different vocal tone, second warrior counters, brass accents
[Chorus] bigger production, more layers, battle intensity peaks
[Bridge] stripped back, reflective, strings only, mutual respect emerges
[Outro] full resolution, triumphant ending, both voices unite
    `.trim(),

    foodBattle: `
[Intro] 4 bars, playful beat drops immediately, comedic energy
[Verse 1] first food champion attacks, bouncy flow, funny wordplay
[Chorus] catchy hook, singalong potential, food worship energy
[Verse 2] second champion counters, different character voice
[Chorus] repeat with ad-libs, building energy
[Bridge] mock-serious moment, dramatic pause, then resolution
[Outro] comedic resolution, both foods respected
    `.trim(),

    creatureBattle: `
[Intro] 4 bars, epic drums, mythical atmosphere, immediate energy
[Verse 1] first creature warrior, powerful delivery, establishing dominance
[Chorus] anthemic, orchestral swell, memorable battle cry hook
[Verse 2] second creature responds, different vocal character
[Chorus] intensified, fuller arrangement
[Bridge] moment of recognition, warriors see each other's strength
[Outro] respectful conclusion, legendary status affirmed
    `.trim(),

    motivational: `
[Intro] 4 bars, building energy, hopeful tone
[Verse 1] setting the scene, the struggle, relatable challenge
[Chorus] triumphant hook, the breakthrough moment
[Verse 2] deeper into the journey, overcoming obstacles
[Chorus] bigger, more triumphant
[Bridge] reflective moment, wisdom gained
[Outro] call to action, inspiring close
    `.trim(),

    chill: `
[Intro] 8 bars, ambient texture, gentle beat introduction
[Verse 1] relaxed flow, storytelling, smooth delivery
[Chorus] melodic hook, warm feeling
[Verse 2] continuing the vibe, deeper reflection
[Chorus] slight variation, maintained energy
[Outro] gentle fadeout, peaceful resolution
    `.trim(),
  };

  return structures[contentType];
}

// ============================================================================
// COMPLETE SUNO PROMPT GENERATOR
// ============================================================================

export interface SunoPromptConfig {
  style: string;
  structure: string;
  contentType: ContentType;
  genre: string;
  bpm: string;
  mood: string;
}

export function generateCompleteSunoPrompt(
  topic: string,
  lyrics?: string,
  overrideType?: ContentType,
): SunoPromptConfig {
  const styleResult = generateSunoStyleTags(topic, lyrics, overrideType);
  const structure = generateStructureTags(styleResult.contentType);

  return {
    style: styleResult.fullStyleString,
    structure,
    contentType: styleResult.contentType,
    genre: styleResult.genre,
    bpm: styleResult.bpm,
    mood: styleResult.mood,
  };
}
