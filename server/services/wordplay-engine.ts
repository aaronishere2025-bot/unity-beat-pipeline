/**
 * INTELLIGENT WORDPLAY ENGINE v2.0
 * ================================
 * TypeScript implementation using Datamuse API for real-time wordplay.
 *
 * Features:
 * 1. Datamuse API Integration - 550K+ English words, 100k queries/day free
 * 2. Real-time Rhyme Lookup - Perfect rhymes, near rhymes, sounds-like
 * 3. Homophone Detection - Words that sound the same
 * 4. Curated Double Meanings - Battle rap-specific punchline fuel
 * 5. Emotional Precision Mapping - Vivid phrase generation
 * 6. Smart Caching - Minimize API calls during battle generation
 */

import axios from 'axios';

// ============================================
// DATAMUSE API CLIENT
// Free API: 100,000 queries/day, no key required
// ============================================

const DATAMUSE_BASE = 'https://api.datamuse.com/words';

interface DatamuseWord {
  word: string;
  score: number;
  numSyllables?: number;
  tags?: string[];
}

// In-memory cache to reduce API calls
const rhymeCache = new Map<string, DatamuseWord[]>();
const homophoneCache = new Map<string, string[]>();
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes
const cacheTimestamps = new Map<string, number>();

function isCacheValid(key: string): boolean {
  const timestamp = cacheTimestamps.get(key);
  if (!timestamp) return false;
  return Date.now() - timestamp < CACHE_TTL;
}

/**
 * Fetch rhymes from Datamuse API
 */
async function fetchRhymes(word: string, maxResults = 20): Promise<DatamuseWord[]> {
  const cacheKey = `rhyme:${word}:${maxResults}`;

  if (rhymeCache.has(cacheKey) && isCacheValid(cacheKey)) {
    return rhymeCache.get(cacheKey)!;
  }

  try {
    const response = await axios.get<DatamuseWord[]>(DATAMUSE_BASE, {
      params: {
        rel_rhy: word, // Perfect rhymes
        max: maxResults,
        md: 's', // Include syllable count
      },
      timeout: 5000,
    });

    const results = response.data;
    rhymeCache.set(cacheKey, results);
    cacheTimestamps.set(cacheKey, Date.now());

    return results;
  } catch (error) {
    console.warn(`[Datamuse] Failed to fetch rhymes for "${word}":`, error);
    return [];
  }
}

/**
 * Fetch near rhymes (approximate rhymes)
 */
async function fetchNearRhymes(word: string, maxResults = 10): Promise<DatamuseWord[]> {
  const cacheKey = `near:${word}:${maxResults}`;

  if (rhymeCache.has(cacheKey) && isCacheValid(cacheKey)) {
    return rhymeCache.get(cacheKey)!;
  }

  try {
    const response = await axios.get<DatamuseWord[]>(DATAMUSE_BASE, {
      params: {
        rel_nry: word, // Near rhymes
        max: maxResults,
        md: 's',
      },
      timeout: 5000,
    });

    const results = response.data;
    rhymeCache.set(cacheKey, results);
    cacheTimestamps.set(cacheKey, Date.now());

    return results;
  } catch (error) {
    console.warn(`[Datamuse] Failed to fetch near rhymes for "${word}":`, error);
    return [];
  }
}

/**
 * Fetch homophones (sounds like)
 */
async function fetchHomophones(word: string): Promise<string[]> {
  const cacheKey = `homophone:${word}`;

  if (homophoneCache.has(cacheKey) && isCacheValid(cacheKey)) {
    return homophoneCache.get(cacheKey)!;
  }

  try {
    const response = await axios.get<DatamuseWord[]>(DATAMUSE_BASE, {
      params: {
        sl: word, // Sounds like
        max: 10,
      },
      timeout: 5000,
    });

    // Filter to only exact homophones (same pronunciation, different spelling)
    const homophones = response.data
      .filter((w) => w.word.toLowerCase() !== word.toLowerCase() && w.score >= 90)
      .map((w) => w.word);

    homophoneCache.set(cacheKey, homophones);
    cacheTimestamps.set(cacheKey, Date.now());

    return homophones;
  } catch (error) {
    console.warn(`[Datamuse] Failed to fetch homophones for "${word}":`, error);
    return [];
  }
}

/**
 * Fetch words related by meaning
 */
async function fetchRelatedWords(word: string, maxResults = 10): Promise<DatamuseWord[]> {
  const cacheKey = `related:${word}:${maxResults}`;

  if (rhymeCache.has(cacheKey) && isCacheValid(cacheKey)) {
    return rhymeCache.get(cacheKey)!;
  }

  try {
    const response = await axios.get<DatamuseWord[]>(DATAMUSE_BASE, {
      params: {
        ml: word, // Means like (semantic similarity)
        max: maxResults,
      },
      timeout: 5000,
    });

    const results = response.data;
    rhymeCache.set(cacheKey, results);
    cacheTimestamps.set(cacheKey, Date.now());

    return results;
  } catch (error) {
    console.warn(`[Datamuse] Failed to fetch related words for "${word}":`, error);
    return [];
  }
}

// ============================================
// CURATED DOUBLE MEANINGS (Battle Rap Specific)
// These are hand-picked for punchline potential
// ============================================

export const DOUBLE_MEANINGS: Record<string, string[]> = {
  fire: ['flames', 'excellent/amazing', 'terminate employment', 'shoot weapons'],
  cold: ['temperature', 'ruthless/emotionless', 'impressive (slang)'],
  light: ['illumination', 'not heavy', 'ignite', 'easy/simple'],
  dark: ['no light', 'evil/sinister', 'mysterious/unknown'],
  sick: ['ill/diseased', 'amazing (slang)', 'twisted/depraved'],
  dead: ['not alive', 'exhausted', 'certain (dead right)', 'empty/quiet'],
  heavy: ['weighs a lot', 'serious/profound', 'influential'],
  sharp: ['keen edge', 'intelligent', 'stylish', 'sudden (sharp turn)'],
  hard: ['solid/firm', 'difficult', 'intense effort', 'cold/harsh'],
  tight: ['close/snug', 'close friendship', 'excellent (slang)'],
  sweet: ['sugary', 'kind/pleasant', 'excellent (slang)'],
  raw: ['uncooked', 'unfiltered/authentic', 'painful/exposed'],
  hot: ['high temperature', 'attractive', 'popular/trending', 'stolen'],
  cool: ['temperature', 'calm/collected', 'impressive', 'okay/acceptable'],
  fly: ['insect', 'travel by air', 'stylish (slang)', 'zipper'],
  bust: ['break', 'arrest', 'chest/sculpture', 'failure'],
  cut: ['slice', 'reduce', 'stop', 'version/mix', 'shape (cut of a suit)'],
  hit: ['strike', 'popular song', 'dose of drugs', 'assassinate'],
  run: ['move fast', 'operate', 'stretch of time', 'political campaign'],
  drop: ['fall', 'release (music)', 'give up', 'decrease'],
  blow: ['wind', 'fail spectacularly', 'spend recklessly', 'punch'],
  crash: ['collision', 'sleep', 'fail financially', 'attend uninvited'],
  wave: ['ocean motion', 'hand gesture', 'trend/movement'],
  chain: ['links of metal', 'series/succession', 'jewelry', 'restraint'],
  crown: ['royal headpiece', 'achievement', 'tooth cap', 'victory'],
  throne: ['royal seat', 'toilet (slang)', 'position of power'],
  game: ['sport/play', 'scheme', 'wild animals', 'willingness'],
  flow: ['liquid movement', 'rap delivery', 'abundance'],
  bars: ['metal rods', 'rap lyrics', 'prison', 'pub/restaurant'],
  beef: ['meat', 'conflict/dispute', 'complaint'],
  shade: ['shadow', 'insult/criticism', 'color variation'],
  cap: ['hat', 'lie (slang)', 'limit', 'ammunition'],
  ice: ['frozen water', 'diamonds', 'cold attitude', 'kill (slang)'],
  heat: ['warmth', 'pressure/criticism', 'weapon', 'intensity'],
  smoke: ['burning vapor', 'defeat badly', 'gun', 'deception'],
  blade: ['knife edge', 'shoulder bone', 'grass leaf', 'propeller'],
  reign: ['rule as monarch', 'period of power', 'prevail/dominate'],
  soul: ['spirit/essence', 'emotional depth', 'music genre'],
  ghost: ['spirit', 'disappear', 'write for someone else'],
  real: ['authentic', 'significant', 'genuine emotion'],
  snake: ['reptile', 'betrayer', "plumber's tool"],
  king: ['monarch', 'champion', 'chess piece'],
  queen: ['female monarch', 'powerful woman', 'chess piece'],
  dope: ['drugs', 'excellent', 'information'],
  clean: ['not dirty', 'innocent', 'skilled'],
  dirty: ['unclean', 'corrupt', 'gritty style'],
  body: ['physical form', 'defeat someone', 'corpse'],
  kill: ['end life', 'perform excellently', 'cancel'],
  murder: ['homicide', 'excel at something', 'dominate'],
  bury: ['inter dead', 'defeat decisively', 'hide/suppress'],
  burn: ['fire damage', 'insult', 'suntan', 'waste resources'],
  break: ['shatter', 'pause', 'opportunity', 'dance style'],
  build: ['construct', 'increase', 'physique'],
  fall: ['descend', 'autumn', 'fail', 'become'],
  rise: ['ascend', 'rebel', 'increase', 'morning'],
};

// ============================================
// EMOTIONAL PRECISION MAPPINGS
// Transform generic emotions into vivid expressions
// ============================================

export const EMOTIONAL_PRECISION: Record<string, string[]> = {
  angry: [
    'cold fury burning slow and patient',
    'rage compressed into diamond-hard focus',
    'controlled violence waiting for release',
    'the stillness before the storm breaks',
    'white-hot purpose channeled into action',
  ],
  sad: [
    'melancholic weight settling in chest',
    'hollow echo where hope used to live',
    "grief that hasn't found words yet",
    'the ache of watching someone slip away',
    'quiet devastation behind steady eyes',
  ],
  hopeful: [
    'defiant spark in overwhelming dark',
    'stubborn belief against all evidence',
    'the first breath after drowning',
    'light glimpsed through closing doors',
    'impossible hope held like a weapon',
  ],
  triumphant: [
    'vindication settling into bones',
    'the roar building from deep within',
    'gravity releasing its hold',
    'destiny clicking into place',
    "standing where they said you'd fall",
  ],
  fearful: [
    "cold certainty of what's coming",
    'the weight of inevitable consequence',
    'walls closing without escape',
    'the moment before everything breaks',
    'darkness that knows your name',
  ],
  defiant: [
    'steel spine refusing to bend',
    'fire that burns brighter under pressure',
    'the no that echoes through silence',
    'standing when kneeling would be easier',
    'choosing the storm over surrender',
  ],
  contemptuous: [
    'cold dismissal from impossible height',
    'looking down from throne of certainty',
    'patience with something beneath notice',
    'the pause before erasing an insect',
    'boredom with inevitable victory',
  ],
  desperate: [
    'clawing at walls closing in',
    'screaming into deafening silence',
    "throwing everything at what won't break",
    'the animal cornered and snarling',
    'masks cracking, truth bleeding through',
  ],
};

// ============================================
// RHYME RESULT INTERFACE
// ============================================

export interface RhymeResult {
  word: string;
  rhymeType: 'perfect' | 'near';
  score: number;
  syllables?: number;
  doubleMeanings: string[];
}

export interface WordplayOption {
  technique: 'homophone' | 'double_meaning' | 'semantic_rhyme' | 'contrast';
  primaryWord: string;
  secondaryWord: string;
  exampleBar: string;
  explanation: string;
}

// ============================================
// INTELLIGENT WORDPLAY ENGINE CLASS (API-POWERED)
// ============================================

export class IntelligentWordplayEngine {
  /**
   * Find rhymes using Datamuse API
   */
  async findRhymes(
    word: string,
    options: {
      meaningContext?: string;
      maxResults?: number;
      includeNear?: boolean;
    } = {},
  ): Promise<RhymeResult[]> {
    const maxResults = options.maxResults || 15;
    const includeNear = options.includeNear ?? true;

    console.log(`[Datamuse API] Fetching rhymes for "${word}"...`);

    // Fetch perfect rhymes
    const perfectRhymes = await fetchRhymes(word, maxResults);

    // Optionally fetch near rhymes
    const nearRhymes = includeNear ? await fetchNearRhymes(word, Math.floor(maxResults / 2)) : [];

    const results: RhymeResult[] = [];

    // Process perfect rhymes
    for (const r of perfectRhymes) {
      results.push({
        word: r.word,
        rhymeType: 'perfect',
        score: r.score,
        syllables: r.numSyllables,
        doubleMeanings: DOUBLE_MEANINGS[r.word.toLowerCase()] || [],
      });
    }

    // Process near rhymes
    for (const r of nearRhymes) {
      results.push({
        word: r.word,
        rhymeType: 'near',
        score: r.score,
        syllables: r.numSyllables,
        doubleMeanings: DOUBLE_MEANINGS[r.word.toLowerCase()] || [],
      });
    }

    // Sort by score (higher = better rhyme)
    results.sort((a, b) => b.score - a.score);

    console.log(`[Datamuse API] Found ${results.length} rhymes for "${word}"`);

    return results.slice(0, maxResults);
  }

  /**
   * Find homophones using Datamuse API
   */
  async findHomophones(word: string): Promise<string[]> {
    console.log(`[Datamuse API] Fetching homophones for "${word}"...`);
    const homophones = await fetchHomophones(word);
    console.log(`[Datamuse API] Found ${homophones.length} homophones for "${word}"`);
    return homophones;
  }

  /**
   * Find double meanings (curated local database)
   */
  findDoubleMeanings(word: string): string[] {
    return DOUBLE_MEANINGS[word.toLowerCase()] || [];
  }

  /**
   * Get emotional precision phrase for a mood
   */
  getEmotionalPhrase(mood: string): string {
    const moodLower = mood.toLowerCase();
    const phrases = EMOTIONAL_PRECISION[moodLower];

    if (phrases && phrases.length > 0) {
      return phrases[Math.floor(Math.random() * phrases.length)];
    }

    // Try to find partial match
    for (const [key, values] of Object.entries(EMOTIONAL_PRECISION)) {
      if (moodLower.includes(key) || key.includes(moodLower)) {
        return values[Math.floor(Math.random() * values.length)];
      }
    }

    return mood;
  }

  /**
   * Find words related by meaning
   */
  async findRelatedWords(word: string, maxResults = 10): Promise<string[]> {
    const related = await fetchRelatedWords(word, maxResults);
    return related.map((w) => w.word);
  }

  /**
   * Generate wordplay options for a word with theme context
   */
  async generateWordplayOptions(word: string, theme?: string): Promise<WordplayOption[]> {
    const options: WordplayOption[] = [];

    // 1. Homophone wordplay
    const homophones = await this.findHomophones(word);
    for (const homophone of homophones) {
      options.push({
        technique: 'homophone',
        primaryWord: word,
        secondaryWord: homophone,
        exampleBar: `I ${word} supreme / while you feel the ${homophone}`,
        explanation: `"${word}" sounds like "${homophone}" - allows dual meaning`,
      });
    }

    // 2. Double meaning wordplay
    const meanings = this.findDoubleMeanings(word);
    if (meanings.length >= 2) {
      options.push({
        technique: 'double_meaning',
        primaryWord: word,
        secondaryWord: meanings.join(' / '),
        exampleBar: `My bars are ${word} / your career got ${word}`,
        explanation: `"${word}" means both: ${meanings.slice(0, 2).join(' AND ')}`,
      });
    }

    // 3. Semantic rhymes (rhymes that also relate to theme)
    if (theme) {
      const rhymes = await this.findRhymes(word, { maxResults: 5 });
      for (const rhyme of rhymes) {
        if (rhyme.doubleMeanings.length > 0) {
          options.push({
            technique: 'semantic_rhyme',
            primaryWord: word,
            secondaryWord: rhyme.word,
            exampleBar: `${word.charAt(0).toUpperCase() + word.slice(1)} meets ${rhyme.word}`,
            explanation: `Rhymes AND has double meanings: ${rhyme.doubleMeanings.slice(0, 2).join(', ')}`,
          });
        }
      }
    }

    return options;
  }

  /**
   * Get themed rhymes for power symbols (async batch)
   */
  async getThemedRhymePairs(powerSymbols: string[], theme: string): Promise<Array<{ seed: string; rhymes: string[] }>> {
    const pairs: Array<{ seed: string; rhymes: string[] }> = [];

    // Process in parallel for speed
    const promises = powerSymbols.map(async (symbol) => {
      const rhymes = await this.findRhymes(symbol, { maxResults: 5 });
      return {
        seed: symbol,
        rhymes: rhymes.map((r) => r.word),
      };
    });

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result.rhymes.length > 0) {
        pairs.push(result);
      }
    }

    return pairs;
  }

  /**
   * Generate wordplay hints for battle rap (async)
   */
  async generateBattleWordplayHints(
    protagonistSymbols: string[],
    antagonistSymbols: string[],
    theme: string,
  ): Promise<{
    rhymeSuggestions: Array<{ from: string; to: string[] }>;
    homophoneChains: Array<{ word: string; soundsLike: string[] }>;
    doubleMeanings: Array<{ word: string; meanings: string[] }>;
    contrastPairs: Array<{ light: string; shadow: string }>;
  }> {
    const allSymbols = Array.from(new Set([...protagonistSymbols, ...antagonistSymbols]));
    const symbolsToProcess = allSymbols.slice(0, 6); // Limit API calls

    console.log(`[Datamuse API] Generating battle wordplay hints for ${symbolsToProcess.length} symbols...`);

    // Fetch rhymes and homophones in parallel
    const rhymePromises = symbolsToProcess.map(async (symbol) => {
      const rhymes = await this.findRhymes(symbol, { maxResults: 4 });
      return {
        from: symbol,
        to: rhymes.map((r) => r.word),
      };
    });

    const homophonePromises = symbolsToProcess.map(async (symbol) => {
      const soundsLike = await this.findHomophones(symbol);
      return {
        word: symbol,
        soundsLike,
      };
    });

    const [rhymeResults, homophoneResults] = await Promise.all([
      Promise.all(rhymePromises),
      Promise.all(homophonePromises),
    ]);

    // Filter out empty results
    const rhymeSuggestions = rhymeResults.filter((r) => r.to.length > 0);
    const homophoneChains = homophoneResults.filter((h) => h.soundsLike.length > 0);

    // Double meanings (local lookup, no API needed)
    const doubleMeanings = allSymbols
      .map((symbol) => ({
        word: symbol,
        meanings: this.findDoubleMeanings(symbol),
      }))
      .filter((d) => d.meanings.length > 0);

    // Contrast pairs (static, for push-pull tension)
    const contrastPairs: Array<{ light: string; shadow: string }> = [
      { light: 'light', shadow: 'dark' },
      { light: 'rise', shadow: 'fall' },
      { light: 'hope', shadow: 'fear' },
    ];

    console.log(
      `[Datamuse API] Battle hints ready: ${rhymeSuggestions.length} rhyme chains, ${homophoneChains.length} homophones`,
    );

    return {
      rhymeSuggestions,
      homophoneChains,
      doubleMeanings,
      contrastPairs,
    };
  }
}

// Export singleton instance
export const wordplayEngine = new IntelligentWordplayEngine();

// Export helper function (async version)
export async function getWordplayHintsForBattle(
  protagSymbols: string[],
  antagSymbols: string[],
  theme: string = 'power conflict',
) {
  return wordplayEngine.generateBattleWordplayHints(protagSymbols, antagSymbols, theme);
}

// ============================================
// LEGACY EXPORTS (for backward compatibility)
// These are empty but prevent import errors
// ============================================

export const RHYME_DATABASE: Record<string, any> = {};
export const HOMOPHONE_CHAINS: Record<string, string[]> = {};
