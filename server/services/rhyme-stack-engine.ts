/**
 * RHYME STACK ENGINE
 * Multi-syllable rhyme stacking, flow optimization, and emphasis marking
 *
 * Features:
 * - Multi-syllable rhyme families (divided/united/fightin')
 * - Smooth rhyme scheme transitions
 * - Flow checking (syllable count per beat)
 * - Emphasis marking for punch words
 * - Double/triple meaning detection
 */

export interface RhymeFamily {
  name: string;
  rhymes: string[];
  extensions?: string[];
  theme: string;
  meanings?: Record<string, string[]>;
}

export interface FlowCheck {
  line: string;
  syllableCount: number;
  flowsWell: boolean;
  suggestions: string[];
}

export interface UnityFormula {
  type: string;
  template: string;
}

// ============================================
// MULTI-SYLLABLE RHYME FAMILIES
// ============================================

export const RHYME_FAMILIES: Record<string, RhymeFamily> = {
  // -ided/-ited/-ighting family (UNITY theme)
  divided: {
    name: 'divided',
    rhymes: ['divided', 'united', 'excited', 'ignited', 'invited', 'recited', 'sighted', 'delighted', 'benighted'],
    extensions: [
      "fightin'",
      "writin'",
      "bitin'",
      "lightin'",
      "strivin'",
      "drivin'",
      "arrivin'",
      "survivin'",
      "divin'",
      "timin'",
    ],
    theme: 'unity/division',
  },

  // -art family (HEART theme)
  heart: {
    name: 'heart',
    rhymes: ['heart', 'apart', 'start', 'smart', 'art', 'part', 'tart', 'chart', 'dart', 'cart', 'mart'],
    meanings: {
      heart: ['love', 'humanity', 'emotion', 'core'],
      apart: ['division', 'collapse', 'separation'],
      start: ['beginning', 'manipulation', 'origin'],
      smart: ['wisdom', 'awareness', 'intelligence'],
      art: ['culture', 'beauty', 'expression', 'craft'],
      part: ['role', 'piece', 'participation'],
      tart: ['bitter', 'sour', 'corrupted'],
    },
    theme: 'emotion/humanity',
  },

  // -ight family (FIGHT/LIGHT theme)
  fight: {
    name: 'fight',
    rhymes: [
      'fight',
      'night',
      'right',
      'sight',
      'light',
      'might',
      'tight',
      'bright',
      'flight',
      'slight',
      'height',
      'white',
    ],
    theme: 'struggle/hope',
  },

  // -eed/-ead family (NEED theme)
  need: {
    name: 'need',
    rhymes: ['need', 'seed', 'feed', 'lead', 'bleed', 'freed', 'greed', 'breed', 'speed', 'creed', 'deed'],
    theme: 'growth/humanity',
  },

  // -ow/-oke family (WAKE theme)
  woke: {
    name: 'woke',
    rhymes: ['woke', 'smoke', 'broke', 'spoke', 'choke', 'joke', 'folk', 'stroke', 'evoke', 'provoke'],
    extensions: ['know', 'go', 'show', 'flow', 'grow', 'blow', 'throw'],
    theme: 'awakening',
  },

  // -ution/-usion family (SOLUTION theme)
  solution: {
    name: 'solution',
    rhymes: [
      'solution',
      'revolution',
      'evolution',
      'pollution',
      'conclusion',
      'illusion',
      'confusion',
      'delusion',
      'intrusion',
      'exclusion',
      'inclusion',
      'fusion',
    ],
    theme: 'resolution/truth',
  },

  // -icker/-igger family (TRIGGER theme)
  ticker: {
    name: 'ticker',
    rhymes: ['ticker', 'quicker', 'thicker', 'slicker', 'flicker', 'bicker', 'picker', 'kicker', 'sticker'],
    extensions: ['bigger', 'figure', 'trigger', 'rigger', 'vigor'],
    theme: 'systems/manipulation',
  },

  // -amming/-anding family (PROGRAMMING theme)
  programming: {
    name: 'programming',
    rhymes: ['programming', 'slamming', 'jamming', 'cramming', 'scamming', 'damning', 'hamming'],
    extensions: ['standing', 'understanding', 'demanding', 'commanding', 'expanding', 'landing', 'handing', 'branding'],
    theme: 'control/awareness',
  },

  // -eak/-eek family (WEAK theme)
  weak: {
    name: 'weak',
    rhymes: ['weak', 'week', 'seek', 'speak', 'peak', 'leak', 'freak', 'Greek', 'cheek', 'sneak', 'sleek', 'meek'],
    theme: 'vulnerability/time',
  },

  // -ove family (LOVE theme)
  love: {
    name: 'love',
    rhymes: ['love', 'above', 'shove', 'dove', 'glove', 'of'],
    theme: 'connection/transcendence',
  },

  // -ews/-use family (NEWS theme)
  news: {
    name: 'news',
    rhymes: [
      'news',
      'views',
      'choose',
      'lose',
      'use',
      'abuse',
      'refuse',
      'confuse',
      'amuse',
      'accuse',
      'bruise',
      'cruise',
      'shoes',
      'blues',
    ],
    theme: 'media/awakening',
  },

  // -ed family (RED theme - political)
  red: {
    name: 'red',
    rhymes: [
      'red',
      'said',
      'head',
      'dead',
      'fed',
      'led',
      'shed',
      'spread',
      'thread',
      'bread',
      'dread',
      'bed',
      'bled',
      'misled',
    ],
    theme: 'political/shared',
  },

  // -ain family (RAIN theme)
  rain: {
    name: 'rain',
    rhymes: ['rain', 'pain', 'gain', 'brain', 'chain', 'train', 'strain', 'plain', 'main', 'vain', 'sane', 'insane'],
    theme: 'shared experience',
  },
};

// ============================================
// INTERNAL RHYME STACKS
// ============================================

export const INTERNAL_STACKS: Record<string, string[]> = {
  all_fall: ['all', 'fall', 'call', 'wall', 'tall', 'ball', 'hall', 'stall'],
  same_blame: ['same', 'blame', 'name', 'game', 'fame', 'shame', 'claim', 'frame'],
  old_cold: ['old', 'cold', 'told', 'sold', 'hold', 'bold', 'gold', 'fold'],
  mind_find: ['mind', 'find', 'blind', 'kind', 'grind', 'behind', 'bind', 'wind'],
  see_free: ['see', 'free', 'be', 'we', 'me', 'key', 'tree', 'agree'],
  time_rhyme: ['time', 'rhyme', 'climb', 'crime', 'prime', 'dime', 'sublime'],
};

// ============================================
// UNITY BAR FORMULAS
// ============================================

export const UNITY_FORMULAS: Record<string, UnityFormula> = {
  flip_the_script: {
    type: 'flip_the_script',
    template: 'You say {right_pos}, I say {left_pos},\nBut we both know {shared_truth} is the mission.',
  },
  common_enemy: {
    type: 'common_enemy',
    template: 'While we fight, THEY win - politicians stay fed,\nWhat if we turned on THEM instead?',
  },
  humanity_over_ideology: {
    type: 'humanity_over_ideology',
    template: "Strip the labels, what's left? Just people in pain,\nLeft and right both get wet in the same damn rain.",
  },
  kids_family: {
    type: 'kids_family',
    template: 'Your kid, my kid, bleed the same red,\nStop the war - protect them instead.',
  },
  algorithm_expose: {
    type: 'algorithm_expose',
    template: 'They got us fighting left and right,\nWhile THEY eat good every single night.',
  },
  neighbor_unity: {
    type: 'neighbor_unity',
    template: "Turn off the news, go talk to your neighbor,\nYou'll find out real quick - he ain't who they say he is.",
  },
};

// ============================================
// RHYME STACK ENGINE CLASS
// ============================================

export class RhymeStackEngine {
  /**
   * Get the rhyme family for an anchor word
   */
  getRhymeFamily(anchorWord: string): RhymeFamily | null {
    const anchorLower = anchorWord.toLowerCase().replace(/[.,!?']/g, '');

    for (const [, familyData] of Object.entries(RHYME_FAMILIES)) {
      const allRhymes = familyData.rhymes || [];
      const extensions = familyData.extensions || [];

      if (allRhymes.includes(anchorLower) || extensions.includes(anchorLower)) {
        return familyData;
      }
    }

    return null;
  }

  /**
   * Generate a stack of rhyming words from anchor
   */
  generateRhymeStack(anchor: string, count: number = 6): string[] {
    const family = this.getRhymeFamily(anchor);
    if (!family) {
      return [anchor];
    }

    const allOptions = [...family.rhymes, ...(family.extensions || [])];
    const unique = Array.from(new Set(allOptions));
    return unique.slice(0, count);
  }

  /**
   * Find internal rhyme options for a word
   */
  findInternalRhymes(target: string): string[] {
    const targetLower = target.toLowerCase();

    for (const [, words] of Object.entries(INTERNAL_STACKS)) {
      if (words.includes(targetLower)) {
        return words.filter((w) => w !== targetLower);
      }
    }

    return [];
  }

  /**
   * Add emphasis markers to rhyme words
   * Uses italics (*word*) instead of CAPS - Suno-friendly format
   */
  addEmphasis(line: string): string {
    const words = line.split(' ');
    if (words.length === 0) return line;

    // Emphasize the last word (rhyme word) with asterisks
    const lastIndex = words.length - 1;
    let lastWord = words[lastIndex];
    const punctuation = lastWord.match(/[.,!?'"]+$/)?.[0] || '';
    lastWord = lastWord.replace(/[.,!?'"]+$/, '');

    // Wrap in asterisks for emphasis (Suno interprets as melodic emphasis)
    words[lastIndex] = `*${lastWord.toLowerCase()}*${punctuation}`;

    return words.join(' ');
  }

  /**
   * Check if a line flows well
   */
  checkFlow(line: string, targetSyllables?: number): FlowCheck {
    const syllables = this.countSyllables(line);

    const result: FlowCheck = {
      line,
      syllableCount: syllables,
      flowsWell: true,
      suggestions: [],
    };

    // Check against target if provided
    if (targetSyllables && Math.abs(syllables - targetSyllables) > 2) {
      result.flowsWell = false;
      if (syllables > targetSyllables) {
        result.suggestions.push('Line may be too long - consider cutting filler words');
      } else {
        result.suggestions.push('Line may be too short - consider adding descriptive words');
      }
    }

    // Check for common filler words
    const fillerWords = ['just', 'really', 'very', 'that', 'like', 'so'];
    const words = line.toLowerCase().split(/\s+/);
    const foundFillers = words.filter((w) => fillerWords.includes(w));
    if (foundFillers.length > 0) {
      result.suggestions.push(`Consider removing filler words: ${foundFillers.join(', ')}`);
    }

    return result;
  }

  /**
   * Estimate syllable count for flow checking
   */
  countSyllables(text: string): number {
    const cleanText = text.toLowerCase().replace(/[^a-z\s]/g, '');
    const words = cleanText.split(/\s+/).filter((w) => w.length > 0);

    let total = 0;
    for (const word of words) {
      const vowels = 'aeiouy';
      let count = 0;
      let prevVowel = false;

      for (const char of word) {
        const isVowel = vowels.includes(char);
        if (isVowel && !prevVowel) {
          count++;
        }
        prevVowel = isVowel;
      }

      // Adjust for silent e
      if (word.endsWith('e') && count > 1) {
        count--;
      }

      // At least one syllable per word
      total += Math.max(1, count);
    }

    return total;
  }

  /**
   * Remove filler words to tighten flow
   */
  tightenLine(line: string): string {
    const removables: Array<[RegExp, string]> = [
      [/\bwhen we not\b/gi, 'when not'],
      [/\bjust\s+/gi, ''],
      [/\breally\s+/gi, ''],
      [/\s+that\s+/gi, ' '],
      [/\bvery\s+/gi, ''],
    ];

    let result = line;
    for (const [pattern, replacement] of removables) {
      result = result.replace(pattern, replacement);
    }

    return result.trim();
  }

  /**
   * Get a unity bar formula with filled-in values
   */
  getUnityFormula(formulaType: string, values?: Record<string, string>): string {
    const formula = UNITY_FORMULAS[formulaType];
    if (!formula) return '';

    if (!values) return formula.template;

    let result = formula.template;
    for (const [key, value] of Object.entries(values)) {
      result = result.replace(`{${key}}`, value);
    }
    return result;
  }

  /**
   * Suggest transition between rhyme families
   */
  suggestTransition(fromFamily: string, toFamily: string): string | null {
    const transitions: Record<string, string> = {
      divided_ticker: 'dive in',
      ticker_solution: 'bigger picture / figure',
      heart_fight: 'start / sight',
      fight_need: 'right / freed',
      need_woke: 'freed / spoke',
      woke_solution: 'evoke / revolution',
      solution_love: 'resolution / above',
      news_red: 'views / said',
      red_rain: 'head / pain',
    };

    const key = `${fromFamily}_${toFamily}`;
    return transitions[key] || null;
  }

  /**
   * Calculate optimal syllables per line for BPM
   */
  getSyllablesForBpm(bpm: number): number {
    if (bpm <= 100) return 12;
    if (bpm <= 120) return 10;
    if (bpm <= 130) return 8;
    if (bpm <= 145) return 7;
    return 6;
  }

  /**
   * Generate a complete rhyme stack verse segment
   */
  generateStackVerse(anchorWord: string, lineCount: number = 6): string[] {
    const family = this.getRhymeFamily(anchorWord);
    if (!family) {
      return [`Can't find rhyme family for: ${anchorWord}`];
    }

    const rhymes = this.generateRhymeStack(anchorWord, lineCount);
    const lines: string[] = [];

    for (const rhyme of rhymes) {
      // Generate a placeholder line ending with the rhyme word
      // In production, this would be filled by the AI
      lines.push(`[Line ending with ${rhyme}]`);
    }

    return lines;
  }

  /**
   * Build a rhyme chain transitioning between families
   */
  buildRhymeChain(startFamily: string, endFamily: string): string[] {
    const chain: string[] = [startFamily];
    const familyOrder = ['divided', 'ticker', 'solution', 'love', 'heart', 'fight', 'need', 'woke'];

    const startIdx = familyOrder.indexOf(startFamily);
    const endIdx = familyOrder.indexOf(endFamily);

    if (startIdx === -1 || endIdx === -1) {
      return [startFamily, endFamily];
    }

    if (startIdx < endIdx) {
      for (let i = startIdx + 1; i <= endIdx; i++) {
        chain.push(familyOrder[i]);
      }
    } else {
      for (let i = startIdx - 1; i >= endIdx; i--) {
        chain.push(familyOrder[i]);
      }
    }

    return chain;
  }
}

// Export singleton
export const rhymeStackEngine = new RhymeStackEngine();
