/**
 * UNITY LYRICS GENERATOR
 *
 * Generates unity-focused rap battle lyrics with:
 * - Message arcs (division → awakening → transcendence)
 * - Multi-syllable rhyme stacking
 * - Flow optimization
 * - Emphasis on rhyme words
 * - Unity resolution structure
 */

import { rhymeStackEngine, UNITY_FORMULAS, RHYME_FAMILIES } from './rhyme-stack-engine';
import { openaiService } from './openai-service';

export interface UnityLyrics {
  topic: string;
  bpm: number;
  targetSyllablesPerLine: number;
  sections: Record<string, string>;
  fullLyrics: string;
  commonGround: Record<string, any> | null;
  customBarsUsed: string[];
}

export interface UnityOptions {
  topic: string;
  commonGround?: Record<string, any>;
  customBars?: string[];
  bpm?: number;
  structure?: 'standard' | 'short';
}

// ============================================
// MESSAGE ARCS
// ============================================

export const MESSAGE_ARCS = {
  unity: [
    'shared_struggle', // We're all suffering
    'world_collapsing', // Everything falling apart
    'reveal_manipulation', // They've been playing us
    'division_tactic', // How they divide us
    'love_corrupted', // What we've lost
    'humanity_stakes', // What's at risk
  ],
  awakening: [
    'asleep', // We were blind
    'programmed', // They controlled us
    'eyes_opening', // Starting to see
    'seeing_truth', // The real picture
    'breaking_free', // Liberation
    'call_to_rise', // Unite and rise
  ],
  algorithm: [
    'digital_control', // Phones/social media
    'time_theft', // Hours lost
    'mind_manipulation', // Programming thoughts
    'division_profit', // They profit from hate
    'unplug', // Break free
    'human_connection', // Return to humanity
  ],
};

// ============================================
// VERSE STRUCTURES
// ============================================

export const VERSE_STRUCTURES = {
  standard: {
    intro: 2,
    verse1: 14,
    buildup: 2,
    verse2: 10,
    chorus: 8,
    verse3: 12,
    verse4: 14,
    outro: 8,
  },
  short: {
    intro: 2,
    verse1: 8,
    chorus: 6,
    verse2: 8,
    outro: 4,
  },
};

// ============================================
// UNITY LYRICS GENERATOR CLASS
// ============================================

export class UnityLyricsGenerator {
  /**
   * Generate complete unity rap battle lyrics
   */
  async generateUnityLyrics(options: UnityOptions): Promise<UnityLyrics> {
    const { topic, commonGround = null, customBars = [], bpm = 125, structure = 'standard' } = options;

    const sections: Record<string, string> = {};
    const targetSyllables = rhymeStackEngine.getSyllablesForBpm(bpm);

    // Generate each section
    sections.intro = this.generateIntro();
    sections.verse1_division = this.generateDivisionVerse(customBars);
    sections.verse2_system = this.generateSystemVerse();
    sections.verse3_algorithm = this.generateAlgorithmVerse(customBars);
    sections.chorus = this.generateChorus();
    sections.verse4_awakening = this.generateAwakeningVerse(customBars);
    sections.outro = this.generateOutro();

    // Combine into full lyrics
    const fullLyrics = this.combineSections(sections);

    return {
      topic,
      bpm,
      targetSyllablesPerLine: targetSyllables,
      sections,
      fullLyrics,
      commonGround,
      customBarsUsed: customBars,
    };
  }

  /**
   * Generate AI-powered unity lyrics using OpenAI
   */
  async generateAIUnityLyrics(options: UnityOptions): Promise<UnityLyrics> {
    const { topic, commonGround = null, customBars = [], bpm = 125 } = options;

    const targetSyllables = rhymeStackEngine.getSyllablesForBpm(bpm);

    // Build rhyme hints
    const rhymeHints = this.buildRhymeHints();
    const unityFormulas = Object.entries(UNITY_FORMULAS)
      .map(([key, formula]) => `${key}: "${formula.template}"`)
      .join('\n');

    const prompt = `Generate a UNITY RAP BATTLE about "${topic}" that heals division.

## RHYME FAMILIES TO USE (multi-syllable stacking):
${rhymeHints}

## UNITY FORMULAS (use at least 2):
${unityFormulas}

## CUSTOM BARS TO INCLUDE:
${customBars.length > 0 ? customBars.join('\n') : 'None provided'}

## STRUCTURE:
- BPM: ${bpm} (target ~${targetSyllables} syllables per line)
- Arc: DIVISION → SYSTEM REVEAL → ALGORITHM EXPOSE → AWAKENING → UNITY

## SECTIONS REQUIRED:
1. [INTRO] - Instrumental setup (2 lines)
2. [VERSE 1 - DIVISION] - Show the conflict (14 lines, use -ided/-ited family)
3. [VERSE 2 - SYSTEM] - Expose the manipulation (10 lines, use -ews/-use family)
4. [VERSE 3 - ALGORITHM] - Digital control theme (12 lines, use -eak/-eek and -amming families)
5. [CHORUS] - Unity anthem, big and powerful (8 lines)
6. [VERSE 4 - AWAKENING] - Rising from darkness (14 lines)
7. [OUTRO] - Transcendence, human connection (8 lines)

## EMPHASIS RULES:
- Wrap rhyme words in asterisks for emphasis (e.g., "*divided*", "*united*", "*heart*", "*apart*")
- Do NOT use ALL CAPS - Suno interprets caps as shouting
- Stack rhymes within the same family before transitioning
- Include internal rhymes where possible

## COMMON GROUND (if political):
${commonGround ? JSON.stringify(commonGround, null, 2) : 'Focus on shared humanity over ideology'}

Generate the complete lyrics with all sections. Make it powerful, authentic, and unifying.`;

    try {
      const response = await openaiService.generateText(prompt, {
        temperature: 0.9,
        maxTokens: 3000,
        systemPrompt:
          'You are a master lyricist and unity content creator. Generate powerful, authentic rap lyrics that heal division and bring people together.',
      });

      const sections = this.parseGeneratedLyrics(response);
      const fullLyrics = this.combineSections(sections);

      return {
        topic,
        bpm,
        targetSyllablesPerLine: targetSyllables,
        sections,
        fullLyrics,
        commonGround,
        customBarsUsed: customBars,
      };
    } catch (error) {
      console.error('AI lyrics generation failed, using template:', error);
      return this.generateUnityLyrics(options);
    }
  }

  /**
   * Generate lyrics from a free-form creative prompt
   */
  async generateFromPrompt(options: {
    prompt: string;
    bpm?: number;
    structure?: 'standard' | 'short';
  }): Promise<UnityLyrics> {
    const { prompt: userPrompt, bpm = 125, structure = 'standard' } = options;

    const targetSyllables = rhymeStackEngine.getSyllablesForBpm(bpm);
    const rhymeHints = this.buildRhymeHints();

    const structureGuide =
      structure === 'short'
        ? `SHORT FORMAT (12-18 lines total):
1. [VERSE 1] - Opening verse (6-8 lines)
2. [CHORUS] - Hook/anthem (4-6 lines)
3. [VERSE 2] - Second verse (6-8 lines)  
4. [CHORUS] - Repeat hook (4-6 lines)`
        : `STANDARD FORMAT:
1. [INTRO] - Set the mood (2-4 lines)
2. [VERSE 1] - First verse (10-14 lines)
3. [CHORUS] - Main hook/anthem (6-8 lines)
4. [VERSE 2] - Second verse (10-14 lines)
5. [CHORUS] - Repeat hook (6-8 lines)
6. [BRIDGE] - Shift/build (4-6 lines)
7. [OUTRO] - Resolution (4-6 lines)`;

    const fullPrompt = `You are a master lyricist. Generate complete song lyrics based on the user's creative vision.

## USER'S CREATIVE PROMPT:
${userPrompt}

## TECHNICAL REQUIREMENTS:
- BPM: ${bpm} (target ~${targetSyllables} syllables per line for natural flow)
- Format each section with [SECTION NAME] headers
- Make lyrics feel authentic and powerful
- Use vivid imagery and strong metaphors
- Include internal rhymes and multi-syllable rhyme patterns

## RHYME TOOLKIT (use these for strong rhymes):
${rhymeHints}

## SONG STRUCTURE:
${structureGuide}

## STYLE NOTES:
- Wrap rhyme words in asterisks for emphasis (e.g., "*divided*", "*united*", "*heart*", "*apart*")
- Do NOT use ALL CAPS - Suno interprets caps as shouting
- Stack rhymes within the same sound family before transitioning
- Each line should flow naturally when spoken/rapped at ${bpm} BPM
- Include hooks that are memorable and repeatable

Generate the complete lyrics now. Make them powerful, authentic, and emotionally resonant.`;

    try {
      console.log('📝 Generating lyrics from creative prompt...');
      const response = await openaiService.generateText(fullPrompt, {
        temperature: 0.9,
        maxTokens: 3000,
        systemPrompt:
          "You are a master lyricist and songwriter. Create powerful, authentic lyrics that capture the user's creative vision with strong rhyme schemes and natural flow.",
      });

      const sections = this.parseGeneratedLyrics(response);
      const fullLyrics = this.combineSections(sections);

      // Extract a topic from the prompt for display
      const topicMatch = userPrompt.match(/about\s+(.+?)(?:\.|,|$)/i);
      const topic = topicMatch ? topicMatch[1].trim() : userPrompt.slice(0, 50);

      console.log('✅ Lyrics generated successfully from prompt');

      return {
        topic,
        bpm,
        targetSyllablesPerLine: targetSyllables,
        sections,
        fullLyrics,
        commonGround: null,
        customBarsUsed: [],
      };
    } catch (error) {
      console.error('Prompt-based lyrics generation failed:', error);
      throw new Error('Failed to generate lyrics from prompt. Please try again.');
    }
  }

  /**
   * Build rhyme hints for the prompt
   */
  private buildRhymeHints(): string {
    const families = ['divided', 'heart', 'fight', 'news', 'weak', 'solution'];
    return families
      .map((name) => {
        const family = RHYME_FAMILIES[name];
        if (!family) return '';
        const rhymes = family.rhymes.slice(0, 6).join(', ');
        const extensions = family.extensions?.slice(0, 4).join(', ') || '';
        return `${name.toUpperCase()}: ${rhymes}${extensions ? ` + ${extensions}` : ''} (theme: ${family.theme})`;
      })
      .join('\n');
  }

  /**
   * Parse AI-generated lyrics into sections
   * Supports both Unity-specific sections (VERSE 1 - DIVISION) and generic sections (VERSE 1)
   * Handles repeated sections by appending numbered suffixes (chorus_1, chorus_2, etc.)
   */
  private parseGeneratedLyrics(text: string): Record<string, string> {
    const sections: Record<string, string> = {};
    const sectionCounts: Record<string, number> = {};

    // Find all section markers in the text
    const sectionRegex = /\[([^\]]+)\]/gi;
    const sectionMarkers: Array<{ name: string; index: number }> = [];
    let match;

    while ((match = sectionRegex.exec(text)) !== null) {
      sectionMarkers.push({
        name: match[1].trim(),
        index: match.index + match[0].length,
      });
    }

    // Extract content between sections
    for (let i = 0; i < sectionMarkers.length; i++) {
      const startIndex = sectionMarkers[i].index;
      const endIndex =
        i < sectionMarkers.length - 1
          ? sectionMarkers[i + 1].index - sectionMarkers[i + 1].name.length - 2
          : text.length;
      const content = text.slice(startIndex, endIndex).trim();

      if (content) {
        // Normalize section key
        let key = this.normalizeSectionKey(sectionMarkers[i].name);

        // Track occurrences and append suffix for repeated sections
        if (sectionCounts[key] === undefined) {
          sectionCounts[key] = 1;
        } else {
          sectionCounts[key]++;
          key = `${key}_${sectionCounts[key]}`;
        }

        sections[key] = content;
      }
    }

    return sections;
  }

  /**
   * Normalize section names to consistent keys
   */
  private normalizeSectionKey(sectionName: string): string {
    const name = sectionName.toUpperCase();

    // Map variations to consistent keys
    if (name.includes('INTRO')) return 'intro';
    if (name.includes('VERSE 1') || name.includes('VERSE1')) {
      if (name.includes('DIVISION')) return 'verse1_division';
      return 'verse1';
    }
    if (name.includes('VERSE 2') || name.includes('VERSE2')) {
      if (name.includes('SYSTEM')) return 'verse2_system';
      return 'verse2';
    }
    if (name.includes('VERSE 3') || name.includes('VERSE3')) {
      if (name.includes('ALGORITHM')) return 'verse3_algorithm';
      return 'verse3';
    }
    if (name.includes('VERSE 4') || name.includes('VERSE4')) {
      if (name.includes('AWAKENING')) return 'verse4_awakening';
      return 'verse4';
    }
    if (name.includes('PRE-CHORUS') || name.includes('PRECHORUS')) return 'pre_chorus';
    if (name.includes('CHORUS')) return 'chorus';
    if (name.includes('BRIDGE')) return 'bridge';
    if (name.includes('HOOK')) return 'hook';
    if (name.includes('OUTRO')) return 'outro';
    if (name.includes('DROP')) return 'drop';
    if (name.includes('BUILDUP')) return 'buildup';

    // For any other sections, create a clean key
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Generate intro section
   */
  private generateIntro(): string {
    return `[Intro]
[Instrumental - dark piano, glitchy 808s, building tension]`;
  }

  /**
   * Generate division verse with rhyme stacking
   */
  private generateDivisionVerse(customBars: string[] = []): string {
    const opening = customBars[0] || 'They thought they had us divided';
    const follow = customBars[1] || 'But we stand together united';

    return `[VERSE 1 - THE DIVISION]
(intense, building)

*"${rhymeStackEngine.addEmphasis(opening)},
${rhymeStackEngine.addEmphasis(follow)},
${rhymeStackEngine.addEmphasis("Do it better when not fightin'")},
${rhymeStackEngine.addEmphasis("So we better start strivin'")},
${rhymeStackEngine.addEmphasis("'Fore we fall back to dividin'")},
${rhymeStackEngine.addEmphasis("Ain't no better timin'")},
${rhymeStackEngine.addEmphasis("So it's time to dive in")}—
${rhymeStackEngine.addEmphasis('What makes us ticker')}?
${rhymeStackEngine.addEmphasis('The games of the trickers')},
${rhymeStackEngine.addEmphasis('Got us all bicker')},
${rhymeStackEngine.addEmphasis('Look at the bigger picture')},
${rhymeStackEngine.addEmphasis('I think we gotta figure')}
${rhymeStackEngine.addEmphasis('Out the solutions')},
${rhymeStackEngine.addEmphasis('To all these illusions')}."*`;
  }

  /**
   * Generate system verse
   */
  private generateSystemVerse(): string {
    return `[VERSE 2 - THE SYSTEM]
(darker, exposing truth)

*"${rhymeStackEngine.addEmphasis('Turn off the news')},
${rhymeStackEngine.addEmphasis('And just amuse')},
${rhymeStackEngine.addEmphasis('Life in their shoes')},
${rhymeStackEngine.addEmphasis('Everything to prove')},
${rhymeStackEngine.addEmphasis('To their cause')},
${rhymeStackEngine.addEmphasis("They'd hate to fall")},
${rhymeStackEngine.addEmphasis("Divine's in sight")},
${rhymeStackEngine.addEmphasis("Regime's delight")},
${rhymeStackEngine.addEmphasis('Extreme cockfight')},
${rhymeStackEngine.addEmphasis('Population morpheme Fortnite')}."*`;
  }

  /**
   * Generate algorithm verse
   */
  private generateAlgorithmVerse(customBars: string[] = []): string {
    let mathBar = 'Multiply the time on your phone times the days in the week';
    for (const bar of customBars) {
      if (bar.toLowerCase().includes('multiply') || bar.toLowerCase().includes('phone')) {
        mathBar = bar;
        break;
      }
    }

    return `[drop - beat switches darker]

[VERSE 3 - THE ALGORITHM]
(slow, deliberate, each bar lands heavy)

*"${rhymeStackEngine.addEmphasis('Two weeks the dreams change being')},
${rhymeStackEngine.addEmphasis('Stop us seeing, being believing')},
${rhymeStackEngine.addEmphasis('Delusional fantasies in the head')},
${rhymeStackEngine.addEmphasis('Turning human minds undead')},
${rhymeStackEngine.addEmphasis('Every night before bed')},
${rhymeStackEngine.addEmphasis('Think about algorithmic programming')},
${rhymeStackEngine.addEmphasis("Put it algebraic we're understanding")},
${mathBar},
${rhymeStackEngine.addEmphasis("Then you'll feel weak")},
${rhymeStackEngine.addEmphasis('No control over brain nor feet')}."*`;
  }

  /**
   * Generate chorus
   */
  private generateChorus(): string {
    return `[buildup - tension rising]

[CHORUS]
(anthemic, unifying, BIG)

*"${rhymeStackEngine.addEmphasis('Red hat, blue hat - bleed the same red')},
${rhymeStackEngine.addEmphasis('Same dreams hijacked inside our heads')},
${rhymeStackEngine.addEmphasis("Same rain fallin' on both our heads")},
${rhymeStackEngine.addEmphasis("We ain't enemies - we been misled")},
${rhymeStackEngine.addEmphasis('Break the code, break the chains')},
${rhymeStackEngine.addEmphasis('Take back control of our brains')},
${rhymeStackEngine.addEmphasis('Different minds but the same heart beats')},
${rhymeStackEngine.addEmphasis('Time to unite these divided streets')}."*`;
  }

  /**
   * Generate awakening verse
   */
  private generateAwakeningVerse(customBars: string[] = []): string {
    return `[drop]

[VERSE 4 - THE AWAKENING]
(rising from dark to light)

*"${rhymeStackEngine.addEmphasis('But now woken up')},
${rhymeStackEngine.addEmphasis("No more giving that's tough")},
${rhymeStackEngine.addEmphasis('The system is taken')},
${rhymeStackEngine.addEmphasis("It's not mistaken")},
${rhymeStackEngine.addEmphasis('But human temptation')},
${rhymeStackEngine.addEmphasis('It gives it up')}—
${rhymeStackEngine.addEmphasis('So to be free')},
${rhymeStackEngine.addEmphasis("Don't subscribe")},
${rhymeStackEngine.addEmphasis('To controversy')},
${rhymeStackEngine.addEmphasis('Then we will see')},
${rhymeStackEngine.addEmphasis('What sets us apart')},
${rhymeStackEngine.addEmphasis('From a chimp or an ape')},
${rhymeStackEngine.addEmphasis('We will see the planets')},
${rhymeStackEngine.addEmphasis('Divine embraced')}."*`;
  }

  /**
   * Generate outro
   */
  private generateOutro(): string {
    return `[OUTRO]
(softer, transcendent, final truth)

*"${rhymeStackEngine.addEmphasis("I don't gotta agree to show love")},
${rhymeStackEngine.addEmphasis("Don't gotta think the same to rise above")},
${rhymeStackEngine.addEmphasis("Put down the phone, look 'em in the eyes")},
${rhymeStackEngine.addEmphasis("That's when the algorithm dies")},
${rhymeStackEngine.addEmphasis('Human to human')},
${rhymeStackEngine.addEmphasis('No more illusion')},
${rhymeStackEngine.addEmphasis('Heart to heart')},
${rhymeStackEngine.addEmphasis("That's where we start")},
${rhymeStackEngine.addEmphasis('Divine embraced')},
${rhymeStackEngine.addEmphasis('The human race')},
${rhymeStackEngine.addEmphasis('Finally found its place')}."*

(beat fades to heartbeat, then silence)

[END]`;
  }

  /**
   * Combine all sections
   */
  private combineSections(sections: Record<string, string>): string {
    const order = [
      'intro',
      'verse1_division',
      'verse2_system',
      'verse3_algorithm',
      'chorus',
      'verse4_awakening',
      'outro',
    ];

    return order
      .filter((key) => sections[key])
      .map((key) => sections[key])
      .join('\n\n');
  }

  /**
   * Generate political battle that ends in unity
   */
  async generatePoliticalBattle(
    issue: string,
    leftPosition: string,
    rightPosition: string,
    commonGround: string,
  ): Promise<{
    issue: string;
    structure: string;
    sideA: string;
    sideB: string;
    unityResolution: string;
    fullLyrics: string;
  }> {
    const sideA = this.buildPositionVerse('Side A', leftPosition);
    const sideB = this.buildPositionVerse('Side B', rightPosition);
    const unity = this.buildUnityResolution(commonGround);

    return {
      issue,
      structure: 'battle_to_unity',
      sideA,
      sideB,
      unityResolution: unity,
      fullLyrics: `${sideA}\n\n${sideB}\n\n${unity}`,
    };
  }

  private buildPositionVerse(side: string, position: string): string {
    return `[${side.toUpperCase()}]
(confident, passionate)

*"I stand for ${position},
This ain't just tradition,
It's about the mission,
Time you start to listen…"*`;
  }

  private buildUnityResolution(commonGround: string): string {
    const neighborFormula = UNITY_FORMULAS.neighbor_unity.template;

    return `[UNITY - BOTH TOGETHER]
(realization, coming together)

*"Wait… while we been fighting left and right,
They been eating good every night,
${commonGround} - that's the real fight,
Different paths but the same sight,
${neighborFormula}"*`;
  }
}

// Export singleton
export const unityLyricsGenerator = new UnityLyricsGenerator();
