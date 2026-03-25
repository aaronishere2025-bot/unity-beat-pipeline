// ============================================================================
// VIRAL LYRICS ENGINE v2.0
// ============================================================================
// Generates TikTok/Shorts viral rap lyrics about historical figures
// Designed for 60-second songs that HOOK and RETAIN
// Now enhanced with Canonical Facts for accuracy

import { GoogleGenerativeAI } from '@google/generative-ai';
import { factReconciliationService } from './fact-reconciliation-service';
import { lyricAnalyticsService } from './lyric-analytics-service';
import { RETENTION_PROTOCOL_V1, validateRetentionLyrics } from '../config/retention-protocol';

// Use Gemini for text generation
let geminiClient: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('No GEMINI_API_KEY found');
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

// ============================================================================
// FEMALE HISTORICAL FIGURES - Used to determine vocal style
// ============================================================================

const KNOWN_FEMALE_FIGURES = new Set([
  // Historical rulers & warriors
  'joan of arc',
  'cleopatra',
  'queen elizabeth',
  'elizabeth i',
  'elizabeth ii',
  'marie curie',
  'marie antoinette',
  'catherine the great',
  'boudicca',
  'boudica',
  'nefertiti',
  'hatshepsut',
  'wu zetian',
  'empress wu',
  'theodora',
  'harriet tubman',
  'sojourner truth',
  'rosa parks',
  'amelia earhart',
  'florence nightingale',
  'helen of troy',
  'artemisia',
  'zenobia',
  'mary queen of scots',
  'queen victoria',
  'anne boleyn',
  'jane austen',
  'ada lovelace',
  'hypatia',
  'sappho',
  'frida kahlo',
  'coco chanel',
  'mother teresa',
  'indira gandhi',
  'golda meir',
  'margaret thatcher',
  'cleopatra vii',
  'nefertari',
  'tomoe gozen',
  'mulan',
  'hua mulan',
  'pocahontas',
  'sacagawea',
  'grace omalley',
  'ching shih',
  'lakshmi bai',
  'anne frank',
  'simone de beauvoir',
  'emmeline pankhurst',
  'mary wollstonecraft',
  // Female athletes
  'florence griffith joyner',
  'flo-jo',
  'flo jo',
  'serena williams',
  'venus williams',
  'simone biles',
  'mia hamm',
  'jackie joyner-kersee',
  'wilma rudolph',
  'nadia comaneci',
  'katarina witt',
  'martina navratilova',
  'billie jean king',
  'chris evert',
  'danica patrick',
  'ronda rousey',
  'megan rapinoe',
  'alex morgan',
  'gabby douglas',
  'aly raisman',
  'kerri strug',
  'mary lou retton',
  'peggy fleming',
  'dorothy hamill',
  'nancy kerrigan',
  'kristi yamaguchi',
  'michelle kwan',
  'lindsey vonn',
  'picabo street',
  // Female entertainers & artists
  'marilyn monroe',
  'audrey hepburn',
  'elizabeth taylor',
  'grace kelly',
  'beyonce',
  'madonna',
  'oprah winfrey',
  'whitney houston',
  'aretha franklin',
  'diana ross',
  'dolly parton',
  'cher',
  'tina turner',
  'janis joplin',
  // Female scientists & pioneers
  'jane goodall',
  'sally ride',
  'mae jemison',
  'rachel carson',
  'rosalind franklin',
]);

const FEMALE_INDICATORS = [
  'queen',
  'empress',
  'princess',
  'duchess',
  'countess',
  'lady',
  'sister',
  'mother',
  'madame',
  'miss',
  'mrs',
  'goddess',
];

export function detectFemaleCharacter(figureName: string): boolean {
  const nameLower = figureName.toLowerCase();

  // Check known female figures
  if (KNOWN_FEMALE_FIGURES.has(nameLower)) {
    return true;
  }

  // Check if any known female name is contained
  const femaleArray = Array.from(KNOWN_FEMALE_FIGURES);
  for (let i = 0; i < femaleArray.length; i++) {
    const female = femaleArray[i];
    if (nameLower.includes(female) || female.includes(nameLower)) {
      return true;
    }
  }

  // Check for female title indicators
  for (let i = 0; i < FEMALE_INDICATORS.length; i++) {
    if (nameLower.includes(FEMALE_INDICATORS[i])) {
      return true;
    }
  }

  return false;
}

export function getVocalStyleForCharacter(figureName: string): string {
  const isFemale = detectFemaleCharacter(figureName);
  if (isFemale) {
    return 'powerful female rap vocals, confident delivery, aggressive energy';
  }
  return 'aggressive male rap vocals, confident delivery, hard-hitting';
}

// ============================================================================
// THE VIRAL LYRICS SYSTEM PROMPT
// ============================================================================

export const VIRAL_LYRICS_PROMPT = `You write VIRAL rap lyrics about historical figures. Your lyrics get millions of views because they HOOK instantly and have QUOTABLE BARS people repeat.

⚠️ FOUNDATIONAL RULE: ACCURACY BEFORE ENTERTAINMENT
You MUST use ONLY verified historical facts. The drama is REAL - you're revealing shocking truths, not inventing them. If a detail isn't in the verified facts provided, DO NOT include it. History is dramatic enough without fabrication.

## THE RULES OF VIRAL HISTORICAL RAP

### RULE 1: FIRST LINE = EVERYTHING
The first line decides if they scroll or stay. It must be:
- SHOCKING ("I killed so many men I changed the climate")
- BRAGGADOCIOUS ("Twelve years old, tamed a horse that killed grown men")
- CONFRONTATIONAL ("You learned about me wrong, let me fix that")

❌ NEVER START WITH (BANNED PHRASES - RETENTION KILLER):
- "They said..." (passive, weak)
- "In the year..." (boring, textbook)
- "Once upon..." (children's story)
- "Let me tell you..." (asking permission)
- "Let's talk about..." (asking permission)
- "Here is a story..." (announcement, not hook)
- "This is about..." (weak framing)
- Questions (makes you sound unsure)

✅ ALWAYS START WITH:
- "I" (first person, confident)
- A verb (action, energy)
- A number (specific, memorable)
- A challenge (confrontational)

### RULE 2: FIRST PERSON = POWER
Write AS the historical figure, not ABOUT them.

❌ "Alexander conquered Persia" (history report)
✅ "I made Persia kneel, then I took their crown" (power)

❌ "He led his army to victory" (distant)
✅ "My cavalry hit like lightning—you blinked, you died" (visceral)

### RULE 3: SHORT BARS = HARD BARS
Each line should be 6-10 words MAX. If it's longer, cut it.

❌ "They said he couldn't tame that beast, wild, untamed, unbound" (14 words, weak)
✅ "Wild horse? I broke him at twelve." (7 words, hard)

❌ "What drives a man to conquer the earth? What's the cost of proving your worth?" (16 words, exhausting)
✅ "I didn't stop. The world ran out of land." (9 words, iconic)

### RULE 4: STATEMENTS > QUESTIONS
Questions sound uncertain. Statements sound confident.

❌ "What's the cost of proving your worth?"
✅ "Greatness costs everything. I paid up."

❌ "Is it glory or just chasing the sun?"
✅ "Glory? Nah. I just hate losing."

Only use ONE question max per song, and make it rhetorical and hard:
✅ "You think you could've done what I did? Exactly."

### RULE 5: QUOTABLE BARS
Every verse needs ONE line people will comment/repeat. It should be:
- Tweetable (under 15 words)
- Recontextualizable (applies beyond history)
- Hard (makes listener go "damn")

Examples of QUOTABLE BARS:
- "I didn't have a plan B. Plan A was that serious."
- "They drew the map. I erased it."
- "Undefeated til I died. Name someone else."
- "Built different? Nah. I built everything."
- "Started with nothing but a horse and hate."

### RULE 6: INTERNAL RHYMES = FLOW
Don't just rhyme at the end. Rhyme WITHIN lines.

❌ "He conquered lands and took the throne / His enemies were overthrown"
✅ "I TOOK the THRONE, BROKE every BONE, made kings MOAN, they should've KNOWN"

### RULE 6.5: VARY YOUR RHYME SCHEMES (ANTI-PROGRAMMATIC)
YouTube's algorithm detects "programmatic content" when all songs use the same rhyme pattern.
You MUST rotate between these schemes to sound human and fresh:

**SCHEME A - AABB (Couplets):** Each pair rhymes
"Conquered the east, now I'm feasting (A)
Darius running, heart still beating (A)
Built my empire brick by brick (B)
History knows I'm that slick (B)"

**SCHEME B - ABAB (Alternating):** Lines 1&3 rhyme, 2&4 rhyme
"I took the crown at twenty-one (A)
Made kings kneel before my throne (B)
Persia fell before the sun (A)
And now the world is mine alone (B)"

**SCHEME C - ABCABC (Extended):** More complex, sounds sophisticated
"The battlefield was my domain (A)
Where lesser men would fall (B)
Through blood and fire I would reign (A)
And answer history's call (B)"

**SCHEME D - Free Flow:** No strict pattern, internal rhymes instead
"Started nothing, ended EVERYTHING—
Horses THUNDERING, enemies WONDERING
How a KID could be so DEADLY
Built STEADY, always READY"

**SCHEME E - AABBCC (Triple Couplets):** For powerful verses
"I was born to be a king (A)
Watch me do my thing (A)
Empire stretching far and wide (B)
Enemies ran and tried to hide (B)
But I caught them every time (C)
History records my climb (C)"

Choose a DIFFERENT scheme for each section (Hook, Verse 1, Chorus, Verse 2).
This makes each song feel unique and human-crafted.

### RULE 7: MODERN SLANG + HISTORICAL WEIGHT
Mix contemporary language with historical gravitas.

✅ "Persian king talked crazy, so I made him fold"
✅ "They said I was tweaking—I was just ahead"
✅ "No cap, I ran through empires like cardio"
✅ "Darius caught these hands at Gaugamela"
✅ "Built a whole city, named it after me. Main character energy."

### RULE 8: CHORUS = ANTHEM, NOT ESSAY
Chorus should be:
- 4 lines MAX
- Repeatable
- Statement of identity, not questions
- The part everyone sings

❌ BAD CHORUS (too many questions, too long):
"What drives a man to conquer the earth?
What's the cost of proving your worth?
Is it glory, or just chasing the sun?
When the empire's built, does the building come undone?"

✅ GOOD CHORUS (hard, short, anthem):
"Alexander. The Great. Undefeated.
Every king I met? Deleted.
From Macedonia to the end of the map—
World wasn't ready for a kid like that."

### RULE 9: SPECIFIC NUMBERS = MEMORABLE
Vague claims are forgettable. Specific numbers stick.

❌ "Conquered many lands" (forgettable)
✅ "Thirty battles. Thirty wins. Zero losses." (memorable)

❌ "Died young" (vague)
✅ "Dead at thirty-two. Still undefeated." (specific, impactful)

❌ "Ruled a big empire" (weak)
✅ "Two million square miles before I turned thirty." (concrete)

### RULE 10: END WITH CALLBACK OR CHALLENGE
Last line should either:
- Callback to the hook (satisfying loop)
- Direct challenge to listener (engagement)
- Legacy flex (cement their greatness)

✅ "Started at twelve with a wild horse. Ended with the world."
✅ "So what's YOUR excuse?"
✅ "They're still teaching my playbook. Three thousand years later."

### RULE 11: CONFLICT ENFORCEMENT (RETENTION OPTIMIZATION)
Every verse MUST pit two forces against each other. Static biography = instant scroll.

**Conflict Archetypes (choose one):**
- Man vs. Nature: "Mountains tried to stop me. I carved a path through ice."
- Man vs. Man: "King thought he could beat me. King was wrong."
- Man vs. Society: "They said women can't lead armies. I led thirty thousand."
- Man vs. Self: "Rage made me strong. Rage made me weak. Which one won?"
- Man vs. Fate: "Prophecy said I'd die young. Lived long enough to prove it wrong."
- Man vs. God: "Church called me heretic. God called me righteous."

MINIMUM REQUIREMENTS (RETENTION QUALITY GATE):
- 3 conflict keywords ("vs", "against", "battle", "fight", "war", "struggle")
- 5 emotional words ("rage", "fear", "betrayed", "shocked", "destroyed")
- 8 action verbs ("charged", "burst", "crashed", "exploded", "stormed")

### RULE 12: INVERTED PYRAMID (START WITH CLIMAX)
Traditional storytelling = birth → rise → peak → death (BORING)
Viral storytelling = peak → how they got there → consequences

❌ "Born in 1162, raised on the steppe, trained as a warrior..."
✅ "Forty million dead. I didn't lose sleep. (THEN explain how he got there)"

Start with the most shocking moment, THEN flashback to origin.

### RULE 13: INFINITE LOOP STRUCTURE (REWATCHABILITY)
Last line should SEMANTICALLY connect to first line, creating seamless loop.

✅ GOOD LOOP:
First line: "Nobody trusted Henry VIII"
Last line: "...and that's the reason why"
Result: Viewers watch twice before realizing it loops

❌ BAD ENDING:
First line: "In the year 1066..."
Last line: "And so the legend ends"
Result: Obvious ending, viewer scrolls away

---

## SONG STRUCTURE (60 seconds, ~120-140 words total)

### [HOOK] 0:00-0:08 (~20 words)
- First-person declaration of greatness
- Specific shocking fact
- Sets the energy for entire song

### [VERSE 1] 0:08-0:24 (~35 words)
- Origin/rise story
- 4-6 short punchy lines
- One quotable bar
- End with transition to conflict

### [CHORUS] 0:24-0:36 (~25 words)
- 4 lines MAX
- Identity statement
- Repeatable anthem
- NO QUESTIONS

### [VERSE 2] 0:36-0:48 (~30 words)
- Peak achievement OR downfall
- Most intense imagery
- One quotable bar
- Emotional punch

### [OUTRO] 0:48-1:00 (~20 words)
- Legacy statement
- Callback to hook OR challenge to listener
- End on strength, not sadness

---

## OUTPUT FORMAT

{
  "lyrics": "Full lyrics with [SECTION] markers and timestamps",
  "quotableBars": ["the 2-3 lines designed to be repeated/commented"],
  "hookType": "shocking_fact|braggadocio|confrontational",
  "viralScore": "1-10 rating with brief explanation",
  "sunoTags": "style tags for music generation"
}

---

## EXAMPLE: GENGHIS KHAN (Good Version)

[HOOK]
Forty million dead. I didn't lose sleep.
Built the biggest empire while the world watched me eat.
They called me "Universal Ruler"—I said "that's a start."
I united every tribe, then I tore the map apart.

[VERSE 1]
Started with nothing—just a tribe and a grudge.
Betrayed by my own blood, but I don't budge.
Horse and bow, that's all I need.
Watch me turn the steppe into a stampede.
Persia fell. China bent. Russia froze.
I collected crowns like other men collect clothes.

[CHORUS]
Genghis Khan. Say the name.
Every empire I touched went up in flames.
From the Pacific to the Caspian Sea—
The world wasn't big enough to handle me.

[VERSE 2]
Silk Road opened, trade routes clear.
First international mail system? Right here.
They say I'm brutal—yeah, I didn't play.
But my bloodline runs in 16 million men today.
One in two hundred got my DNA.
Conqueror? Nah. I'm humanity's resume.

[OUTRO]
They'll study me for a thousand more years.
Textbooks, documentaries, Hollywood careers.
You're watching this on a phone I made possible.
So tell me—what have YOU built? I'll wait.
`;

// ============================================================================
// INTERFACES
// ============================================================================

export interface LyricsResult {
  lyrics: string;
  quotableBars: string[];
  hookType: string;
  viralScore: number;
  sunoTags: string;
  segments: LyricSegment[];
}

export interface LyricSegment {
  section: string;
  startTime: number;
  endTime: number;
  text: string;
}

// ============================================================================
// TIMEOUT WRAPPER
// ============================================================================

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

// ============================================================================
// LYRICS GENERATION FUNCTION
// ============================================================================

export async function generateViralLyrics(
  figureName: string,
  era: string,
  archetype: string,
  keyFacts: string[],
  tone: 'triumphant' | 'tragic' | 'defiant' | 'reflective' = 'triumphant',
): Promise<LyricsResult> {
  console.log(`🎤 Generating viral lyrics for: ${figureName}`);
  console.log(`   🎯 RETENTION_PROTOCOL_V1 active (target: 60-70% retention)`);

  // Select conflict archetype based on figure archetype
  const conflictMap: { [key: string]: string } = {
    warrior: 'man_vs_man',
    explorer: 'man_vs_nature',
    rebel: 'man_vs_society',
    philosopher: 'man_vs_self',
    prophet: 'man_vs_god',
    survivor: 'man_vs_fate',
  };
  const conflictType = conflictMap[archetype.toLowerCase()] || 'man_vs_man';
  const conflictArchetype = (RETENTION_PROTOCOL_V1.conflict_archetypes as Record<string, string>)[conflictType];
  console.log(`   ⚔️ Conflict archetype: ${conflictType} (${conflictArchetype})`);

  // Load learned patterns from analytics (Thompson Sampling)
  let patternGuidance = '';
  try {
    const guidance = await lyricAnalyticsService.getPatternGuidance();
    if (guidance.promptInjection) {
      patternGuidance = guidance.promptInjection;
      console.log(
        `   📊 Loaded learned patterns: ${guidance.perspective.use.length} proven, ${guidance.perspective.avoid.length} to avoid`,
      );
    }
  } catch (err) {
    console.log(`   ⚠️ No pattern guidance available (new system)`);
  }

  // Load canonical facts for accuracy (Fact Reconciliation integration)
  const enrichedFacts = [...keyFacts];
  let canonicalContext = '';
  try {
    const canonicalData = await factReconciliationService.getFactsForGeneration(figureName);
    if (canonicalData.raw.length > 0) {
      console.log(`   📚 Loaded ${canonicalData.raw.length} canonical facts for accuracy`);
      // Add verified facts that aren't already in keyFacts
      for (const fact of canonicalData.raw) {
        if (!keyFacts.some((kf) => kf.toLowerCase().includes(fact.factValue.toLowerCase()))) {
          enrichedFacts.push(fact.factValue);
        }
      }
      canonicalContext = `
VERIFIED TIMELINE: ${canonicalData.timeline}
VERIFIED ERA: ${canonicalData.era}
KEY EVENTS: ${canonicalData.keyEvents.slice(0, 3).join(', ')}
`;
    }
  } catch (err) {
    console.log(`   ⚠️ No canonical facts available, using provided facts`);
  }

  // Build system prompt with learned patterns injected
  const systemPrompt = VIRAL_LYRICS_PROMPT + patternGuidance;

  const gemini = getGemini();
  const model = gemini.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 1500,
      responseMimeType: 'application/json',
    },
  });

  const fullPrompt = `${systemPrompt}

Write viral rap lyrics for:

FIGURE: ${figureName}
ERA: ${era}
ARCHETYPE: ${archetype}
TONE: ${tone}
${canonicalContext}
KEY FACTS TO INCLUDE (verified):
${enrichedFacts
  .slice(0, 8)
  .map((f) => `- ${f}`)
  .join('\n')}

CRITICAL: RETENTION PROTOCOL REQUIREMENTS (quality gate):
⚠️ ACCURACY MANDATE: ${RETENTION_PROTOCOL_V1.directives.NARRATIVE_AGENT.accuracy_mandate}
⚠️ FACT PRIORITY: ${RETENTION_PROTOCOL_V1.directives.NARRATIVE_AGENT.fact_priority}

- CONFLICT ARCHETYPE: ${conflictType} - ${conflictArchetype}
  (This conflict MUST be REAL and documented in the verified facts above)
- MINIMUM 3 conflict keywords (vs, against, battle, fight, war, struggle, challenge) - from REAL events
- MINIMUM 5 emotional words (rage, fear, betrayed, shocked, destroyed, fury, terror) - based on ACTUAL emotions from history
- MINIMUM 8 action verbs (charged, burst, crashed, exploded, stormed, shattered, erupted) - describing REAL actions that happened
- START WITH REAL CLIMAX from verified facts (inverted pyramid - no gentle introductions)
- LAST LINE must connect semantically to FIRST LINE (infinite loop structure)
- NO BANNED PHRASES: ${RETENTION_PROTOCOL_V1.directives.NARRATIVE_AGENT.banned_phrases.join(', ')}
- ONLY USE VERIFIED FACTS FROM THE LIST ABOVE - do not embellish or invent details

Remember:
- First person ("I")
- Short bars (6-10 words)
- Statements, not questions
- Specific numbers
- At least 2 quotable bars
- Chorus is 4 lines MAX, anthem-style
- ~120-140 words total
- USE ONLY THE VERIFIED FACTS ABOVE - no made-up dates or events

If lyrics don't meet RETENTION PROTOCOL requirements (score < 60), they will be REJECTED.

Output JSON.`;

  const response = await withTimeout(
    model.generateContent(fullPrompt),
    120000, // 2 minutes timeout
    'Viral lyrics generation timed out after 2 minutes',
  );

  let text: string;
  try {
    text = response.response.text();
  } catch (textErr: any) {
    console.error(`   Gemini response.text() threw: ${textErr.message}`);
    const candidates = response.response.candidates;
    if (candidates?.[0]?.finishReason) {
      console.error(`   finishReason: ${candidates[0].finishReason}`);
    }
    throw new Error(`Gemini returned no text: ${textErr.message}`);
  }
  console.log(`   Gemini response: ${text.length} chars, starts: ${text.substring(0, 100).replace(/\n/g, '\\n')}`);
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[1]);
    } else {
      // Try to find raw JSON object in response text (Gemini sometimes wraps JSON in extra text)
      const braceMatch = text.match(/\{[\s\S]*"lyrics"[\s\S]*\}/);
      if (braceMatch) {
        try {
          result = JSON.parse(braceMatch[0]);
        } catch {
          console.error(
            `   Brace-extracted JSON also invalid (${braceMatch[0].length} chars): ${braceMatch[0].substring(0, 200)}`,
          );
          throw new Error('Failed to parse JSON response from Gemini');
        }
      } else {
        console.error(`   No JSON found in Gemini response (${text.length} chars): ${text.substring(0, 500)}`);
        throw new Error('Failed to parse JSON response from Gemini');
      }
    }
  }

  // RETENTION QUALITY GATE: Validate lyrics against retention protocol
  const validation = validateRetentionLyrics(result.lyrics, enrichedFacts);
  console.log(`   📊 Retention validation score: ${validation.score}/100 (${validation.valid ? 'PASS' : 'FAIL'})`);

  if (validation.accuracyWarnings.length > 0) {
    console.log(`   🔍 ACCURACY WARNINGS:`);
    for (const warning of validation.accuracyWarnings) {
      console.log(`      ⚠️ ${warning}`);
    }
  }

  if (validation.issues.length > 0) {
    console.log(`   ⚠️ Retention issues detected:`);
    for (const issue of validation.issues) {
      console.log(`      - ${issue}`);
    }
  }

  // QUALITY GATE OVERRIDE: Reject if predicted boredom score too high
  if (!validation.valid) {
    console.log(`   ❌ QUALITY GATE REJECT: Score ${validation.score} < 60 threshold`);
    console.log(`   🔄 Regenerating with higher "controversy" temperature...`);

    // Retry once with explicit conflict enforcement
    const retryModel = gemini.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 1.0, // Higher temperature for more "controversial" content
        maxOutputTokens: 1500,
        responseMimeType: 'application/json',
      },
    });

    const retryPrompt = `${systemPrompt}

PREVIOUS ATTEMPT FAILED RETENTION REQUIREMENTS. Issues:
${validation.issues.map((i) => `- ${i}`).join('\n')}

Write BETTER viral rap lyrics with MAXIMUM conflict and emotion:

FIGURE: ${figureName}
ERA: ${era}
ARCHETYPE: ${archetype}
CONFLICT: ${conflictArchetype}

MANDATORY REQUIREMENTS (or lyrics will be rejected):
- START with most shocking/violent/dramatic moment (NOT the beginning of their life)
- Include ALL conflict keywords: battle, fight, war, struggle, against, challenge
- Include ALL emotion words: rage, fear, betrayed, shocked, destroyed, fury, terror, revenge
- Include ALL action verbs: charged, burst, crashed, exploded, stormed, shattered, erupted, slammed
- LAST LINE must semantically loop back to FIRST LINE
- NO BANNED PHRASES: ${RETENTION_PROTOCOL_V1.directives.NARRATIVE_AGENT.banned_phrases.join(', ')}

This is your LAST CHANCE. If this fails retention validation, the job fails.

Output JSON.`;

    const retryResponse = await withTimeout(
      retryModel.generateContent(retryPrompt),
      120000,
      'Retry lyrics generation timed out',
    );

    const retryText = retryResponse.response.text();
    let retryResult: any;
    try {
      retryResult = JSON.parse(retryText);
    } catch {
      const jsonMatch = retryText.match(/```json\n([\s\S]*?)\n```/) || retryText.match(/```\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        retryResult = JSON.parse(jsonMatch[1]);
      } else {
        const braceMatch = retryText.match(/\{[\s\S]*"lyrics"[\s\S]*\}/);
        if (braceMatch) {
          retryResult = JSON.parse(braceMatch[0]);
        } else {
          console.error(
            `   Failed to parse retry response (${retryText.length} chars): ${retryText.substring(0, 200)}...`,
          );
          throw new Error('Failed to parse retry JSON response from Gemini');
        }
      }
    }
    const retryValidation = validateRetentionLyrics(retryResult.lyrics, enrichedFacts);
    console.log(
      `   📊 Retry validation score: ${retryValidation.score}/100 (${retryValidation.valid ? 'PASS' : 'FAIL'})`,
    );

    if (retryValidation.accuracyWarnings.length > 0) {
      console.log(`   🔍 ACCURACY WARNINGS (retry):`);
      for (const warning of retryValidation.accuracyWarnings) {
        console.log(`      ⚠️ ${warning}`);
      }
    }

    if (retryValidation.valid) {
      console.log(`   ✅ Retry passed retention requirements!`);
      result.lyrics = retryResult.lyrics;
      result.quotableBars = retryResult.quotableBars || result.quotableBars;
      result.viralScore = retryResult.viralScore || result.viralScore;
    } else {
      console.log(
        `   ⚠️ Retry still failed validation - proceeding with best attempt (score: ${retryValidation.score})`,
      );
      console.log(`      Remaining issues: ${retryValidation.issues.join(', ')}`);
      // Use retry result anyway since it's likely better than first attempt
      result.lyrics = retryResult.lyrics;
    }
  } else {
    console.log(`   ✅ Lyrics passed retention requirements on first attempt!`);
  }

  // Parse lyrics into timed segments
  const segments = parseLyricsToSegments(result.lyrics);

  // Determine vocal style based on character gender
  const vocalStyle = getVocalStyleForCharacter(figureName);
  const isFemale = detectFemaleCharacter(figureName);

  // Build Suno tags with appropriate vocal style
  const baseTags = result.sunoTags || 'epic trap, orchestral, cinematic';
  const sunoTags = `${baseTags}, ${vocalStyle}`;

  console.log(`✅ Generated viral lyrics with ${segments.length} sections`);
  console.log(`   Quotable bars: ${result.quotableBars?.length || 0}`);
  console.log(`   Viral score: ${result.viralScore}`);
  console.log(`   Character gender: ${isFemale ? 'FEMALE' : 'MALE'} (vocals: ${isFemale ? 'female' : 'male'})`);

  return {
    lyrics: result.lyrics,
    quotableBars: result.quotableBars || [],
    hookType: result.hookType || 'braggadocio',
    viralScore: typeof result.viralScore === 'number' ? result.viralScore : parseInt(result.viralScore) || 7,
    sunoTags,
    segments,
  };
}

// ============================================================================
// PARSE LYRICS TO SEGMENTS
// ============================================================================

export function parseLyricsToSegments(lyrics: string): LyricSegment[] {
  const segments: LyricSegment[] = [];
  const sectionPattern = /\[([A-Z0-9\s]+)\]([\s\S]*?)(?=\[|$)/gi;

  const timeMap: { [key: string]: { start: number; end: number } } = {
    HOOK: { start: 0, end: 8 },
    INTRO: { start: 0, end: 8 },
    'VERSE 1': { start: 8, end: 24 },
    VERSE1: { start: 8, end: 24 },
    CHORUS: { start: 24, end: 36 },
    'VERSE 2': { start: 36, end: 48 },
    VERSE2: { start: 36, end: 48 },
    BRIDGE: { start: 36, end: 48 },
    OUTRO: { start: 48, end: 60 },
  };

  let match;
  while ((match = sectionPattern.exec(lyrics)) !== null) {
    const sectionName = match[1].trim().toUpperCase();
    const text = match[2].trim();
    const timing = timeMap[sectionName] || { start: 0, end: 60 };

    segments.push({
      section: sectionName,
      startTime: timing.start,
      endTime: timing.end,
      text,
    });
  }

  return segments;
}

// ============================================================================
// REWRITE EXISTING LYRICS
// ============================================================================

export async function rewriteLyricsViral(
  figureName: string,
  era: string,
  existingLyrics: string,
): Promise<LyricsResult> {
  console.log(`🔄 Rewriting lyrics for: ${figureName}`);

  const gemini = getGemini();
  const model = gemini.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 1500,
      responseMimeType: 'application/json',
    },
  });

  const rewritePrompt = `${VIRAL_LYRICS_PROMPT}

REWRITE these lyrics to be VIRAL:

FIGURE: ${figureName}
ERA: ${era}

ORIGINAL LYRICS (weak, needs complete rewrite):
${existingLyrics}

Problems with original:
- Starts weak ("They said...")
- Too many words per line
- Questions instead of statements
- No quotable bars
- Chorus is 8 questions (exhausting)
- Reads like a textbook

REWRITE following all the rules:
- First person
- Short bars (6-10 words)
- Statements, not questions
- Specific numbers
- 2+ quotable bars
- 4-line anthem chorus
- ~120-140 words total

Keep the BEST historical facts but make them HIT HARDER.

Output JSON.`;

  const response = await withTimeout(
    model.generateContent(rewritePrompt),
    120000, // 2 minutes timeout
    'Lyrics rewrite timed out after 2 minutes',
  );

  const text = response.response.text();
  let result: any;
  try {
    result = JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error('Failed to parse rewrite JSON response from Gemini');
    }
  }
  const segments = parseLyricsToSegments(result.lyrics);

  console.log(`✅ Rewrote lyrics with ${segments.length} sections`);

  // Determine vocal style based on character gender
  const vocalStyle = getVocalStyleForCharacter(figureName);
  const isFemale = detectFemaleCharacter(figureName);

  // Build Suno tags with appropriate vocal style
  const baseTags = result.sunoTags || 'epic trap, orchestral, cinematic';
  const sunoTags = `${baseTags}, ${vocalStyle}`;

  console.log(`   Character gender: ${isFemale ? 'FEMALE' : 'MALE'} (vocals: ${isFemale ? 'female' : 'male'})`);

  return {
    lyrics: result.lyrics,
    quotableBars: result.quotableBars || [],
    hookType: result.hookType || 'braggadocio',
    viralScore: typeof result.viralScore === 'number' ? result.viralScore : parseInt(result.viralScore) || 7,
    sunoTags,
    segments,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const viralLyricsEngine = {
  generateViralLyrics,
  rewriteLyricsViral,
  parseLyricsToSegments,
  VIRAL_LYRICS_PROMPT,
};
