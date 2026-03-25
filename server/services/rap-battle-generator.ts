import { GoogleGenerativeAI } from '@google/generative-ai';
import { wordplayEngine, getWordplayHintsForBattle, EMOTIONAL_PRECISION } from './wordplay-engine';
import {
  VocalTrackGenerator,
  BATTLE_TONES,
  EMOTIONAL_TONES,
  PRODUCTION_STYLES,
  VOCAL_STYLES,
  getToneForBattleRound,
  generateBattleStylePrompt,
  getAvailableEmotions,
  getAvailableProductions,
  getAvailableVocalStyles,
} from './vocal-track-generator';
import {
  engagementEngine,
  ENGAGEMENT_TRIGGERS,
  VIRAL_STRUCTURES,
  ENGAGEMENT_PRESETS,
  ENGAGEMENT_CHECKLIST,
  type EngagementType,
} from './engagement-engine';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface BattleCharacter {
  name: string;
  role: 'protagonist' | 'antagonist';
  description: string;
  traits: string[];
  motivation: string;
  backstory: string;

  flowStyle?: 'aggressive' | 'calculated' | 'melodic' | 'staccato' | 'storyteller';
  vocalTone?: string;
  vocalStyleKey?: string;
  emotionalToneKey?: string;
  confidenceSource?: string;
  insecurity?: string;
  signaturePhrase?: string;
  attackStyle?: string;
  title?: string;
  insultsForOpponent?: string[];
  powerSymbols?: string[];
  originDetail?: string;
  definingMoment?: string;
  secretShame?: string;
}

export interface BattleRound {
  roundNumber: number;
  roundType: string;
  character: string;
  role: 'protagonist' | 'antagonist';
  scene: string;
  voiceTag: string;
  lyrics: string;
  mood: string;
  cameraMovement: string;
}

export interface RapBattle {
  title: string;
  setting: string;
  stakes: string;
  rounds: BattleRound[];
  sunoStyle: string;
  cleanLyrics: string;
  visualTheme: string;
  hookMoment: string;
  visualsJson: Array<{
    section: string;
    scene: string;
    mood: string;
    camera: string;
    lighting: string;
    character: string;
  }>;
}

const BATTLE_SCENE_TEMPLATES = {
  opener: {
    antagonist: (antag: string, protag: string) =>
      `${antag} standing atop elevated position, arms spread wide, looking down at ${protag} with contempt, dramatic lighting casting long shadows. Low-angle shot emphasizing power and dominance. Cold blue lighting with harsh shadows. Cinematic wide establishing shot.`,
  },
  response: {
    protagonist: (antag: string, protag: string) =>
      `${protag} stepping forward defiantly, pointing upward at ${antag}, energy building around them, wind picking up. Push-in tracking shot building intensity. Warm firelight breaking through darkness. Medium shot with dynamic movement.`,
  },
  escalation: {
    antagonist: (antag: string, protag: string) =>
      `Extreme close-up on ${antag}'s face, eyes narrowing with visible rage, composure cracking, grip tightening with fury. Slow dramatic push-in. Storm clouds gathering, lightning in distance. Tense atmospheric lighting.`,
  },
  closer: {
    protagonist: (antag: string, protag: string) =>
      `${protag} ascending toward ${antag}, crowd energy exploding behind them, ${antag} stepping backward in fear, environment responding to the shift in power. Epic wide shot transitioning to triumphant close-up. Dawn light breaking through, golden rays, victorious atmosphere.`,
  },
};

function getSceneForRound(roundNumber: number, antagName: string, protagName: string): string {
  switch (roundNumber) {
    case 1:
      return BATTLE_SCENE_TEMPLATES.opener.antagonist(antagName, protagName);
    case 2:
      return BATTLE_SCENE_TEMPLATES.response.protagonist(antagName, protagName);
    case 3:
      return BATTLE_SCENE_TEMPLATES.escalation.antagonist(antagName, protagName);
    case 4:
      return BATTLE_SCENE_TEMPLATES.closer.protagonist(antagName, protagName);
    default:
      return 'Battle arena with dramatic lighting';
  }
}

function inferBattleTraits(character: BattleCharacter): BattleCharacter {
  const traits = character.traits || [];
  const backstory = character.backstory || '';
  const motivation = character.motivation || '';

  if (!character.flowStyle) {
    if (character.role === 'antagonist') {
      character.flowStyle = 'calculated';
    } else {
      character.flowStyle = 'storyteller';
    }
  }

  // NOTE: vocalTone is now set by the caller using the vocal system
  // Only set default if NOT already provided via vocalStyleKey/emotionalToneKey

  if (!character.confidenceSource) {
    character.confidenceSource = motivation || traits[0] || 'inner strength';
  }

  if (!character.attackStyle) {
    if (character.role === 'antagonist') {
      character.attackStyle = 'dismissive superiority, makes opponent feel small and insignificant';
    } else {
      character.attackStyle = 'turns insults into proof of strength, flips weaknesses';
    }
  }

  if (!character.powerSymbols) {
    const symbols = extractPowerSymbols(backstory + ' ' + motivation);
    character.powerSymbols = symbols.length > 0 ? symbols : ['strength', 'destiny', 'truth'];
  }

  if (!character.insultsForOpponent) {
    if (character.role === 'antagonist') {
      character.insultsForOpponent = ['fool', 'weakling', 'pretender', 'nothing'];
    } else {
      character.insultsForOpponent = ['tyrant', 'false king', 'coward', 'oppressor'];
    }
  }

  return character;
}

function extractPowerSymbols(text: string): string[] {
  const symbols: string[] = [];
  const keywords = [
    'sword',
    'blade',
    'fire',
    'flame',
    'water',
    'river',
    'mountain',
    'stone',
    'lightning',
    'thunder',
    'storm',
    'wind',
    'crown',
    'throne',
    'blood',
    'iron',
    'gold',
    'silver',
    'star',
    'sun',
    'moon',
    'shadow',
    'light',
    'darkness',
    'dragon',
    'eagle',
    'lion',
    'wolf',
    'serpent',
    'phoenix',
    'chain',
    'freedom',
  ];

  const lowerText = text.toLowerCase();
  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      symbols.push(keyword);
    }
  }

  return symbols.slice(0, 5);
}

async function generateWordplaySection(protag: BattleCharacter, antag: BattleCharacter): Promise<string> {
  const protagSymbols = protag.powerSymbols || ['hope', 'fire', 'blade'];
  const antagSymbols = antag.powerSymbols || ['throne', 'shadow', 'chain'];

  console.log('🔗 [Datamuse API] Fetching wordplay hints from API...');
  const hints = await getWordplayHintsForBattle(protagSymbols, antagSymbols, 'power conflict destiny');

  let section = '';

  if (hints.rhymeSuggestions.length > 0) {
    section += `### RHYME CHAINS (from Datamuse API - 550K+ words)\n`;
    for (const rs of hints.rhymeSuggestions.slice(0, 5)) {
      section += `- ${rs.from} → ${rs.to.join(', ')}\n`;
    }
    section += '\n';
  }

  if (hints.homophoneChains.length > 0) {
    section += `### HOMOPHONE WORDPLAY (double meaning gold)\n`;
    for (const hc of hints.homophoneChains.slice(0, 5)) {
      section += `- "${hc.word}" sounds like: ${hc.soundsLike.join(', ')}\n`;
      section += `  Example: "I ${hc.word} supreme / while you feel the ${hc.soundsLike[0]}"\n`;
    }
    section += '\n';
  }

  if (hints.doubleMeanings.length > 0) {
    section += `### DOUBLE MEANINGS (punchline fuel)\n`;
    for (const dm of hints.doubleMeanings.slice(0, 4)) {
      section += `- "${dm.word}" = ${dm.meanings.slice(0, 3).join(' / ')}\n`;
    }
    section += '\n';
  }

  section += `### CONTRAST PAIRS (push-pull tension)\n`;
  for (const cp of hints.contrastPairs) {
    section += `- ${cp.light} vs ${cp.shadow}\n`;
  }

  section += `\n### EMOTIONAL PRECISION\n`;
  section += `- Antagonist Round 1: "${wordplayEngine.getEmotionalPhrase('contemptuous')}"\n`;
  section += `- Protagonist Round 2: "${wordplayEngine.getEmotionalPhrase('defiant')}"\n`;
  section += `- Antagonist Round 3: "${wordplayEngine.getEmotionalPhrase('desperate')}"\n`;
  section += `- Protagonist Round 4: "${wordplayEngine.getEmotionalPhrase('triumphant')}"\n`;

  return section;
}

/**
 * Build engagement engineering section for the battle prompt
 */
function buildEngagementSection(triggers: string[], structureId: string): string {
  const structure = VIRAL_STRUCTURES[structureId] || VIRAL_STRUCTURES.hook_hold_payoff;

  let section = `## ENGAGEMENT ENGINEERING (MAKE IT VIRAL!)

### STRUCTURE: ${structure.name}
${structure.description}

${structure.lyricApplication}

### ENGAGEMENT TRIGGERS TO INCLUDE:
`;

  for (const triggerId of triggers) {
    const trigger = ENGAGEMENT_TRIGGERS[triggerId];
    if (trigger) {
      section += `
#### ${triggerId.toUpperCase().replace(/_/g, ' ')} (${trigger.type} trigger)
- Psychology: ${trigger.psychology}
- What to do: ${trigger.lyricPrompt}
- Examples: ${trigger.examples.slice(0, 2).join(' / ')}
`;
    }
  }

  section += `
### CRITICAL ENGAGEMENT RULES:
1. FIRST LINE must stop the scroll - provocative, emotional, or mysterious
2. Include at least ONE line people will quote/screenshot
3. Include at least ONE line that rewards relistening (double meaning)
4. End in a way that either loops OR demands "part 2??" comments
5. Specificity > generality - the more specific, the more relatable

### TEST QUESTIONS (content MUST pass):
- Would someone comment "this hit different"?
- Would someone tag a friend who relates?
- Would someone add this to a playlist?
- Would someone want to hear it again?
- Would someone argue about the meaning in comments?
`;

  return section;
}

export interface BattleOptions {
  rounds?: number;
  barsPerVerse?: number;
  bpm?: number;
  style?: string;
  productionStyle?: string;
  antagonistVocalStyle?: string;
  protagonistVocalStyle?: string;
  antagonistTone?: string;
  protagonistTone?: string;
  // Engagement Engine options
  engagementPreset?: string; // 'viral_battle', 'emotional_ballad', 'hype_anthem', 'story_song', 'custom'
  engagementTriggers?: string[]; // custom triggers when preset is 'custom'
  viralStructure?: string; // 'hook_hold_payoff', 'open_loop', 'perspective_flip'
}

export async function generateRapBattle(
  protagonist: BattleCharacter,
  antagonist: BattleCharacter,
  setting: string,
  stakes: string,
  options: BattleOptions = {},
): Promise<RapBattle> {
  const rounds = options.rounds || 4;
  const barsPerVerse = options.barsPerVerse || 6;
  const bpm = options.bpm || 140;

  const productionKey = options.productionStyle || 'hard_trap';
  const production = PRODUCTION_STYLES[productionKey] || PRODUCTION_STYLES.hard_trap;

  const antagVocalKey = options.antagonistVocalStyle || antagonist.vocalStyleKey || 'raw_rap';
  const protagVocalKey = options.protagonistVocalStyle || protagonist.vocalStyleKey || 'raw_rap';
  const antagVocal = VOCAL_STYLES[antagVocalKey] || VOCAL_STYLES.raw_rap;
  const protagVocal = VOCAL_STYLES[protagVocalKey] || VOCAL_STYLES.raw_rap;

  const antagToneKey = options.antagonistTone || antagonist.emotionalToneKey || 'dismissive_cold';
  const protagToneKey = options.protagonistTone || protagonist.emotionalToneKey || 'rising_from_ashes';
  const antagTone = BATTLE_TONES[antagToneKey] || EMOTIONAL_TONES[antagToneKey] || BATTLE_TONES.dismissive_cold;
  const protagTone = EMOTIONAL_TONES[protagToneKey] || BATTLE_TONES[protagToneKey] || EMOTIONAL_TONES.rising_from_ashes;

  const style = options.style || `${production.sunoPrompt}, battle rap`;

  console.log('🎹 [Vocal Track Generator] Production:', productionKey, '-', production.name);
  console.log('🎤 [Vocal Track Generator] Antagonist Vocal:', antagVocalKey, '-', antagVocal.name);
  console.log('🎤 [Vocal Track Generator] Protagonist Vocal:', protagVocalKey, '-', protagVocal.name);
  console.log('🎭 [Vocal Track Generator] Antagonist Tone:', antagToneKey, '-', antagTone.name);
  console.log('🎭 [Vocal Track Generator] Protagonist Tone:', protagToneKey, '-', protagTone.name);

  // Create style configuration for the battle
  const styleConfig = {
    production,
    antagVocal,
    protagVocal,
    antagTone,
    protagTone,
    bpm,
  };

  // Set vocal tones from the selected styles (not hardcoded defaults)
  const protag = inferBattleTraits({
    ...protagonist,
    role: 'protagonist',
    vocalTone: `${protagVocal.sunoTags}, ${protagTone.sunoVocal}`,
  });
  const antag = inferBattleTraits({
    ...antagonist,
    role: 'antagonist',
    vocalTone: `${antagVocal.sunoTags}, ${antagTone.sunoVocal}`,
  });

  const prompt = buildBattlePrompt(protag, antag, setting, stakes, rounds, barsPerVerse, bpm, styleConfig);

  console.log('🎤 Generating rap battle between', protag.name, 'vs', antag.name);
  console.log(
    '🎨 Power symbols:',
    protag.powerSymbols?.join(', ') || 'default',
    'vs',
    antag.powerSymbols?.join(', ') || 'default',
  );

  const wordplaySection = await generateWordplaySection(protag, antag);
  console.log('📝 [WORDPLAY ENGINE - Datamuse API] Generated hints:');
  console.log(wordplaySection.split('\n').slice(0, 15).join('\n') + '...');

  // Build engagement section based on preset or custom triggers
  const engagementPreset = options.engagementPreset || 'viral_battle';
  const viralStructure = options.viralStructure || 'hook_hold_payoff';

  let engagementTriggers: string[];
  if (engagementPreset === 'custom' && options.engagementTriggers?.length) {
    engagementTriggers = options.engagementTriggers;
  } else {
    const preset = ENGAGEMENT_PRESETS[engagementPreset] || ENGAGEMENT_PRESETS.viral_battle;
    engagementTriggers = preset.lyricTriggers;
  }

  console.log('🎯 [ENGAGEMENT ENGINE] Preset:', engagementPreset);
  console.log('🎯 [ENGAGEMENT ENGINE] Triggers:', engagementTriggers.join(', '));
  console.log('🎯 [ENGAGEMENT ENGINE] Structure:', viralStructure);

  // Build engagement instructions from selected triggers
  const engagementSection = buildEngagementSection(engagementTriggers, viralStructure);

  // Combine the battle prompt with the wordplay section and engagement section
  const fullPrompt = `${prompt}

---

## WORDPLAY ARSENAL (USE THESE!)
${wordplaySection}

---

${engagementSection}

---

IMPORTANT: You MUST use at least 3 rhymes from the RHYME CHAINS above in your bars.
You MUST use at least 1 HOMOPHONE for a punchline.
You MUST incorporate the EMOTIONAL PRECISION phrases into each round's delivery.
You MUST include at least ONE engagement trigger element in your lyrics.`;

  console.log('🎯 Sending wordplay-enhanced prompt to Gemini...');
  console.log(`📏 Prompt length: ${fullPrompt.length} chars`);

  const model = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { maxOutputTokens: 4096 },
    systemInstruction: `You are a master battle rap lyricist. You write devastating, character-specific bars with callbacks, flips, and knockout lines. Each bar must rhyme, flow naturally, and build toward the protagonist's victory.

CRITICAL RULES:
1. Maximum 10 syllables per bar
2. ROTATE RHYME ARCHITECTURES (pick one per battle):
   - THE MARCH (AABB): Couplets - best for battles & action, high energy, driving
   - THE BALLAD (ABAB): Alternating - best for strategy & betrayal, narrative, sophisticated
   - THE VERSE (AABCCB): Six-line - best for tragedies & myths, melodic with "reveal" on third line
   - THE STREET (XAXA): Loose - best for gritty realism, conversational, avoids AI clichés
3. Each callback must EXPLICITLY reference the opponent's previous line
4. Round 4 must end with a KNOCKOUT BAR that would make a crowd explode
5. Antagonist Round 3 must show cracks - overcompensating, desperate
6. Every line must be character-specific - no generic bars
7. USE THE WORDPLAY ARSENAL PROVIDED - rhyme chains, homophones, double meanings

COMPLEXITY REQUIREMENTS (Anti-AI Detection):
- Use INTERNAL RHYMES: "The bold soldier told his story" (rhymes within the line)
- Prefer SLANT RHYMES over perfect rhymes: "stone/home", "blood/flood" instead of "light/night"
- Vary RHYME DENSITY: Some lines with 3+ rhymes, some with just end rhymes
- Break end-of-line predictability with enjambment

FORBIDDEN: Real dates (BCE/CE), real historical locations (Mesopotamia, Tigris, etc.), modern references, breaking character.`,
  });

  const response = await model.generateContent(fullPrompt);
  const rawOutput = response.response.text();

  // Debug: log full response details
  console.log('🔍 Gemini Response details:');
  console.log('   - content length:', rawOutput.length);

  // Log full output for debugging
  console.log('🔍 GPT-5 FULL raw output:');
  console.log('='.repeat(80));
  console.log(rawOutput);
  console.log('='.repeat(80));
  console.log(`📏 Total length: ${rawOutput.length} chars`);

  const battle = parseBattleOutput(rawOutput, protag, antag, setting, stakes, bpm);

  return battle;
}

interface StyleConfig {
  production: { name: string; sunoPrompt: string };
  antagVocal: { name: string; sunoTags: string };
  protagVocal: { name: string; sunoTags: string };
  antagTone: { name: string; sunoVocal: string };
  protagTone: { name: string; sunoVocal: string };
  bpm: number;
}

function buildBattlePrompt(
  protag: BattleCharacter,
  antag: BattleCharacter,
  setting: string,
  stakes: string,
  rounds: number,
  barsPerVerse: number,
  bpm: number,
  styleConfig?: StyleConfig,
): string {
  return `# RAP BATTLE: ${protag.name} vs ${antag.name}

## SETTING
${setting}

## STAKES  
${stakes}

## CHARACTERS

### ANTAGONIST: ${antag.name}
- Role: ${antag.role}
- Description: ${antag.description}
- Traits: ${antag.traits?.join(', ') || 'powerful, cold'}
- Flow Style: ${antag.flowStyle} - slower, deliberate, menacing
- Vocal Tone: ${antag.vocalTone}
- Confidence Source: ${antag.confidenceSource}
- Hidden Weakness: ${antag.insecurity || 'fears losing power'}
- Signature Phrase: "${antag.signaturePhrase || 'I am eternal'}"
- Attack Style: ${antag.attackStyle}
- Calls opponent: ${antag.insultsForOpponent?.join(', ') || 'fool, weakling'}
- Power Symbols: ${antag.powerSymbols?.join(', ') || 'throne, darkness'}
- Origin: ${antag.originDetail || antag.backstory}
- Secret Shame: ${antag.secretShame || 'fears the prophecy about their downfall'}

### PROTAGONIST: ${protag.name}
- Role: ${protag.role}
- Description: ${protag.description}
- Traits: ${protag.traits?.join(', ') || 'determined, brave'}
- Flow Style: ${protag.flowStyle} - building, emotional, explosive
- Vocal Tone: ${protag.vocalTone}
- Confidence Source: ${protag.confidenceSource}
- Hidden Strength: Turns insults into power
- Signature Phrase: "${protag.signaturePhrase || 'I will not break'}"
- Attack Style: ${protag.attackStyle}
- Calls opponent: ${protag.insultsForOpponent?.join(', ') || 'tyrant, coward'}
- Power Symbols: ${protag.powerSymbols?.join(', ') || 'blade, destiny'}
- Origin: ${protag.originDetail || protag.backstory}
- Defining Moment: ${protag.definingMoment || protag.motivation}

---

## BATTLE STRUCTURE (${rounds} rounds, ${barsPerVerse} bars each)

### ROUND 1: ${antag.name} OPENS (Dismissive Superiority)
- Tone: Confident, almost bored, looking down
- Goal: Establish dominance, mock opponent's origins
- Must include: Reference to opponent's background/weakness
- Must include: Brag about own power/status
- End with: Challenge or dismissive question
- Scene: Antagonist in position of power, looking down

### ROUND 2: ${protag.name} RESPONDS (Defiant Fire)
- Tone: Controlled anger, building intensity
- Goal: Callback to Round 1, flip the insults
- Must include: CALLBACK - directly reference AND FLIP an antagonist Round 1 line
- Must include: Origin/struggle as source of strength
- End with: Threat or promise
- Scene: Protagonist stepping forward, crowd energy building

### ROUND 3: ${antag.name} ESCALATES (Losing Composure)
- Tone: Angrier, more personal, cruel, DESPERATE
- Goal: Attack deeper, hit the secret shame
- Must include: Personal attack on protagonist's losses/pain
- Must include: Threat of violence/destruction
- End with: Demand for submission ("KNEEL", "BOW", etc.)
- CRITICAL: Show cracks - antagonist is overcompensating because Round 2 HURT
- Scene: Close-up on antagonist's face, composure cracking

### ROUND 4: ${protag.name} CLOSES (Devastating Victory)
- Tone: Quiet confidence EXPLODING into triumph
- Goal: Complete destruction, invoke destiny
- Must include: CALLBACK to antagonist's Round 1 insult - FLIP IT
- Must include: CALLBACK to antagonist's Round 3 demand - REFUSE IT
- Must include: Turn antagonist's power symbols against them
- End with: THE KNOCKOUT BAR - the crowd would ERUPT
- Scene: Protagonist ascending, antagonist retreating, power shifting visibly

---

## BAR TECHNIQUES (Use variety)

1. **BRAG** - Flex status: "I control what you fear"
2. **ATTACK** - Direct hit: "You're a pretender on a stolen throne"
3. **CALLBACK** - Reference their bar: "You said I'm weak? Weak is being scared of me"
4. **FLIP** - Invert their strength: "You call it ancient? I call it dying out"
5. **WORDPLAY** - Double meanings: "You're stone cold but I'm shattering you"
6. **PROPHECY** - Invoke fate: "Destiny chose me, you're just in the way"
7. **ORIGIN** - Humble beginnings: "From nothing to everything you fear"

---

## OUTPUT FORMAT (FOLLOW EXACTLY)

[ROUND 1 - ${antag.name.toUpperCase()}]
SCENE: [Detailed visual description for video generation, include environment, lighting, camera angle, character positioning]
[TAG: ${antag.vocalTone}]
(exactly ${barsPerVerse} bars here)

[ROUND 2 - ${protag.name.toUpperCase()}]
SCENE: [Detailed visual description for video generation]
[TAG: ${protag.vocalTone}]
(exactly ${barsPerVerse} bars here)

[ROUND 3 - ${antag.name.toUpperCase()}]
SCENE: [Detailed visual description for video generation]
[TAG: ${antag.vocalTone}]
(exactly ${barsPerVerse} bars here)

[ROUND 4 - ${protag.name.toUpperCase()}]
SCENE: [Detailed visual description for video generation]
[TAG: ${protag.vocalTone}]
(exactly ${barsPerVerse} bars here)

---
SUNO STYLE: ${styleConfig ? `${styleConfig.bpm} BPM, ${styleConfig.production.sunoPrompt}, alternating [${antag.vocalTone}] and [${protag.vocalTone}], building intensity, dynamic swells` : `${bpm} BPM, hard trap beat, battle rap, ${antag.vocalTone?.split(',')[0]} vs ${protag.vocalTone?.split(',')[0]}`}

VISUAL THEME: Epic confrontation between power and defiance. Cinematic battle arena with dramatic lighting. 
HOOK MOMENT: The knockout bar at Round 4 finale - the crowd eruption moment.

---

## SUNO LYRIC FORMATTING (CRITICAL FOR AI MUSIC GENERATION)

1. **Line Length**: Maximum 10 syllables per line - short, punchy lines work best
2. **Breathing Room**: Add natural pauses - use "..." for dramatic pauses
3. **Internal Rhymes**: Stack rhymes within lines ("cut, crossed, left, lost")
4. **Avoid Run-ons**: Each line should be a complete thought
5. **Emphasis Words**: Use ALL CAPS sparingly for knockout moments
6. **Hook Phrases**: Create repeatable phrases the audience can chant

---

Now write the battle. Remember:
- Round 2 MUST callback Round 1
- Round 4 MUST callback BOTH Round 1 AND Round 3
- Antagonist Round 3 shows DESPERATION
- Round 4 ends with KNOCKOUT BAR that would make a crowd lose their minds
- Keep lines SHORT and PUNCHY for Suno compatibility
- USE THE WORDPLAY HINTS - homophones create double meanings, rhyme chains keep flow tight
`;
}

function parseBattleOutput(
  rawOutput: string,
  protag: BattleCharacter,
  antag: BattleCharacter,
  setting: string,
  stakes: string,
  bpm: number = 150, // VEO-aligned (was 140)
): RapBattle {
  const rounds: BattleRound[] = [];
  const visualsJson: RapBattle['visualsJson'] = [];
  let sunoStyle = '';

  const sunoMatch = rawOutput.match(/SUNO STYLE:\s*(.+?)(?=\n|$)/i);
  if (sunoMatch) {
    sunoStyle = sunoMatch[1].trim();
  }

  // Extract visual theme and hook moment
  let visualTheme = '';
  let hookMoment = '';

  const themeMatch = rawOutput.match(/VISUAL THEME:\s*(.+?)(?=\n|$)/i);
  if (themeMatch) {
    visualTheme = themeMatch[1].trim();
  }

  const hookMatch = rawOutput.match(/HOOK MOMENT:\s*(.+?)(?=\n|$)/i);
  if (hookMatch) {
    hookMoment = hookMatch[1].trim();
  }

  // Try multiple parsing patterns to handle GPT output variations

  // Pattern 0: [ROUND 1 - NAME] with markdown **SCENE**: or **SCENE:** format
  const roundPattern0 =
    /\[ROUND (\d+) - ([^\]]+)\]\s*\*\*SCENE\*?\*?:?\s*(.+?)\s*\[TAG:\s*([^\]]+)\]\s*([\s\S]*?)(?=\[ROUND|\n---|\[OPENER|\[RESPONSE|\[ESCALATION|\[CLOSER|$)/gi;

  // Pattern 1: [ROUND 1 - NAME] format with SCENE and TAG (no markdown)
  const roundPattern1 =
    /\[ROUND (\d+) - ([^\]]+)\]\s*SCENE:\s*([^\n]+)\s*\[TAG:\s*([^\]]+)\]\s*([\s\S]*?)(?=\[ROUND|\n---|\[OPENER|\[RESPONSE|\[ESCALATION|\[CLOSER|$)/gi;

  // Pattern 2: [OPENER - NAME] format (round type instead of number)
  const roundPattern2 =
    /\[(OPENER|RESPONSE|ESCALATION|CLOSER) - ([^\]]+)\]\s*(?:SCENE:\s*([^\n]+))?\s*(?:\[TAG:\s*([^\]]+)\])?\s*([\s\S]*?)(?=\[ROUND|\n---|\[OPENER|\[RESPONSE|\[ESCALATION|\[CLOSER|$)/gi;

  // Pattern 3: Simple [OPENER - NAME] with just lyrics (no SCENE/TAG)
  const roundPattern3 =
    /\[(OPENER|RESPONSE|ESCALATION|CLOSER) - ([^\]]+)\]\s*([\s\S]*?)(?=\[OPENER|\[RESPONSE|\[ESCALATION|\[CLOSER|$)/gi;

  const roundTypeToNumber: Record<string, number> = {
    opener: 1,
    response: 2,
    escalation: 3,
    closer: 4,
  };

  let match;

  // Try Pattern 0 first (markdown formatted **SCENE:** and **[TAG:**)
  console.log('📋 Trying Pattern 0 (markdown SCENE/TAG)...');
  while ((match = roundPattern0.exec(rawOutput)) !== null) {
    const roundNumber = parseInt(match[1]);
    const character = match[2].trim();
    const scene = match[3].trim();
    const voiceTag = match[4].trim();
    let lyrics = match[5].trim();

    // Clean lyrics - remove markdown, separators, and section headers
    lyrics = lyrics.replace(/\*\*[^*]+\*\*/g, '').trim(); // Remove any remaining markdown
    lyrics = lyrics.replace(/\n{2,}/g, '\n').trim();
    lyrics = lyrics
      .split('\n')
      .filter(
        (line) =>
          line.trim() &&
          !line.startsWith('---') &&
          !line.startsWith('SUNO') &&
          !line.startsWith('[') &&
          !line.startsWith('**'),
      )
      .join('\n');

    if (lyrics) {
      const isAntagonist = character.toLowerCase().includes(antag.name.toLowerCase());
      const role: 'protagonist' | 'antagonist' = isAntagonist ? 'antagonist' : 'protagonist';

      let mood = 'intense';
      let camera = 'medium shot';
      let lighting = 'dramatic';
      let roundType = 'verse';

      if (roundNumber === 1) {
        mood = 'dominant, cold';
        camera = 'low-angle wide shot, emphasizing power';
        lighting = 'cold blue lighting with harsh shadows';
        roundType = 'opener';
      } else if (roundNumber === 2) {
        mood = 'defiant, building';
        camera = 'push-in tracking shot';
        lighting = 'warm firelight breaking through';
        roundType = 'response';
      } else if (roundNumber === 3) {
        mood = 'desperate, cracking';
        camera = 'extreme close-up, slow push-in';
        lighting = 'storm clouds, lightning, tension';
        roundType = 'escalation';
      } else if (roundNumber === 4) {
        mood = 'triumphant, explosive';
        camera = 'epic wide to close-up, crane up';
        lighting = 'dawn breaking, golden rays, victorious';
        roundType = 'closer';
      }

      rounds.push({
        roundNumber,
        roundType,
        character,
        role,
        scene,
        voiceTag,
        lyrics,
        mood,
        cameraMovement: camera,
      });

      visualsJson.push({
        section: `Round ${roundNumber} - ${character}`,
        scene,
        mood,
        camera,
        lighting,
        character: isAntagonist ? antag.name : protag.name,
      });
    }
  }

  // Try Pattern 1 if Pattern 0 didn't match (most structured, no markdown)
  if (rounds.length === 0) {
    console.log('📋 Trying Pattern 1 (ROUND X with SCENE/TAG)...');
    while ((match = roundPattern1.exec(rawOutput)) !== null) {
      const roundNumber = parseInt(match[1]);
      const character = match[2].trim();
      const scene = match[3].trim();
      const voiceTag = match[4].trim();
      let lyrics = match[5].trim();

      lyrics = lyrics.replace(/\n{2,}/g, '\n').trim();
      lyrics = lyrics
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('---') && !line.startsWith('SUNO') && !line.startsWith('['))
        .join('\n');

      if (lyrics) {
        const isAntagonist = character.toLowerCase().includes(antag.name.toLowerCase());
        const role: 'protagonist' | 'antagonist' = isAntagonist ? 'antagonist' : 'protagonist';

        let mood = 'intense';
        let camera = 'medium shot';
        let lighting = 'dramatic';
        let roundType = 'verse';

        if (roundNumber === 1) {
          mood = 'dominant, cold';
          camera = 'low-angle wide shot, emphasizing power';
          lighting = 'cold blue lighting with harsh shadows';
          roundType = 'opener';
        } else if (roundNumber === 2) {
          mood = 'defiant, building';
          camera = 'push-in tracking shot';
          lighting = 'warm firelight breaking through';
          roundType = 'response';
        } else if (roundNumber === 3) {
          mood = 'desperate, cracking';
          camera = 'extreme close-up, slow push-in';
          lighting = 'storm clouds, lightning, tension';
          roundType = 'escalation';
        } else if (roundNumber === 4) {
          mood = 'triumphant, explosive';
          camera = 'epic wide to close-up, crane up';
          lighting = 'dawn breaking, golden rays, victorious';
          roundType = 'closer';
        }

        rounds.push({
          roundNumber,
          roundType,
          character,
          role,
          scene,
          voiceTag,
          lyrics,
          mood,
          cameraMovement: camera,
        });

        visualsJson.push({
          section: `Round ${roundNumber} - ${character}`,
          scene,
          mood,
          camera,
          lighting,
          character: isAntagonist ? antag.name : protag.name,
        });
      }
    }
  }

  // If Pattern 1 failed, try Pattern 2 (OPENER/RESPONSE format with SCENE)
  if (rounds.length === 0) {
    console.log('📋 Trying Pattern 2 (OPENER/RESPONSE with SCENE)...');
    while ((match = roundPattern2.exec(rawOutput)) !== null) {
      const roundType = match[1].toLowerCase();
      const roundNumber = roundTypeToNumber[roundType] || 1;
      const character = match[2].trim();
      const scene = match[3]?.trim() || getSceneForRound(roundNumber, antag.name, protag.name);
      const voiceTag =
        match[4]?.trim() || (roundNumber % 2 === 1 ? antag.vocalTone : protag.vocalTone) || 'intense vocals';
      let lyrics = match[5].trim();

      lyrics = lyrics.replace(/\n{2,}/g, '\n').trim();
      lyrics = lyrics
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('---') && !line.startsWith('SUNO') && !line.startsWith('['))
        .join('\n');

      if (lyrics) {
        const isAntagonist = roundNumber === 1 || roundNumber === 3;
        const role: 'protagonist' | 'antagonist' = isAntagonist ? 'antagonist' : 'protagonist';

        let mood = 'intense';
        let camera = 'medium shot';
        let lighting = 'dramatic';

        if (roundNumber === 1) {
          mood = 'dominant, cold';
          camera = 'low-angle wide shot';
          lighting = 'cold blue lighting';
        } else if (roundNumber === 2) {
          mood = 'defiant, building';
          camera = 'push-in tracking';
          lighting = 'warm firelight';
        } else if (roundNumber === 3) {
          mood = 'desperate, cracking';
          camera = 'extreme close-up';
          lighting = 'storm lighting';
        } else if (roundNumber === 4) {
          mood = 'triumphant, explosive';
          camera = 'epic crane up';
          lighting = 'golden dawn';
        }

        rounds.push({
          roundNumber,
          roundType,
          character,
          role,
          scene,
          voiceTag,
          lyrics,
          mood,
          cameraMovement: camera,
        });

        visualsJson.push({
          section: `Round ${roundNumber} - ${character}`,
          scene,
          mood,
          camera,
          lighting,
          character: isAntagonist ? antag.name : protag.name,
        });
      }
    }
  }

  // If Pattern 2 failed, try Pattern 3 (simplest - just [OPENER - NAME] and lyrics)
  if (rounds.length === 0) {
    console.log('📋 Trying Pattern 3 (simple OPENER/RESPONSE)...');
    while ((match = roundPattern3.exec(rawOutput)) !== null) {
      const roundType = match[1].toLowerCase();
      const roundNumber = roundTypeToNumber[roundType] || 1;
      const character = match[2].trim();
      let lyrics = match[3].trim();

      lyrics = lyrics.replace(/\n{2,}/g, '\n').trim();
      lyrics = lyrics
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('---') && !line.startsWith('SUNO') && !line.startsWith('['))
        .join('\n');

      if (lyrics) {
        const isAntagonist = roundNumber === 1 || roundNumber === 3;
        const role: 'protagonist' | 'antagonist' = isAntagonist ? 'antagonist' : 'protagonist';

        const scene = getSceneForRound(roundNumber, antag.name, protag.name);
        const voiceTag = isAntagonist
          ? antag.vocalTone || 'deep menacing vocals'
          : protag.vocalTone || 'raw emotional vocals';

        let mood = 'intense';
        let camera = 'medium shot';
        let lighting = 'dramatic';

        if (roundNumber === 1) {
          mood = 'dominant, cold';
          camera = 'low-angle wide shot';
          lighting = 'cold blue lighting';
        } else if (roundNumber === 2) {
          mood = 'defiant, building';
          camera = 'push-in tracking';
          lighting = 'warm firelight';
        } else if (roundNumber === 3) {
          mood = 'desperate, cracking';
          camera = 'extreme close-up';
          lighting = 'storm lighting';
        } else if (roundNumber === 4) {
          mood = 'triumphant, explosive';
          camera = 'epic crane up';
          lighting = 'golden dawn';
        }

        rounds.push({
          roundNumber,
          roundType,
          character,
          role,
          scene,
          voiceTag,
          lyrics,
          mood,
          cameraMovement: camera,
        });

        visualsJson.push({
          section: `Round ${roundNumber} - ${character}`,
          scene,
          mood,
          camera,
          lighting,
          character: isAntagonist ? antag.name : protag.name,
        });
      }
    }
  }

  console.log(`📊 Parsed ${rounds.length} rounds from GPT-5 output`);

  // If still no rounds parsed, throw an error instead of using fallback
  if (rounds.length === 0) {
    console.error('❌ FAILED TO PARSE GPT-5 OUTPUT. Raw output:');
    console.error(rawOutput);
    throw new Error('Failed to parse rap battle output from GPT-5. Please try again.');
  }

  const cleanLyrics = formatSunoLyrics(rounds, protag, antag);

  return {
    title: `${protag.name} vs ${antag.name}`,
    setting,
    stakes,
    rounds,
    sunoStyle:
      sunoStyle ||
      `${bpm} BPM, battle rap, ${antag.vocalTone?.split(',')[0] || 'menacing'} vs ${protag.vocalTone?.split(',')[0] || 'defiant'}`,
    cleanLyrics,
    visualTheme:
      visualTheme || 'Epic confrontation between power and defiance. Cinematic battle arena with dramatic lighting.',
    hookMoment: hookMoment || 'The knockout bar at Round 4 finale - the crowd eruption moment.',
    visualsJson,
  };
}

function formatSunoLyrics(rounds: BattleRound[], protag: BattleCharacter, antag: BattleCharacter): string {
  const lines: string[] = [];

  lines.push('[Intro]');
  lines.push('[Instrumental]');
  lines.push('(The battle begins...)');
  lines.push('');

  for (const round of rounds) {
    const roundType = round.roundType?.toUpperCase() || `ROUND ${round.roundNumber}`;
    const performer =
      round.character?.toUpperCase() ||
      (round.role === 'antagonist' ? antag.name.toUpperCase() : protag.name.toUpperCase());

    if (round.roundNumber === 3) {
      lines.push('[buildup]');
      lines.push('');
    }

    lines.push(`[${roundType} - ${performer}]`);

    const emotionCue = getEmotionCueForRound(round.roundNumber, round.role);
    if (emotionCue) {
      lines.push(emotionCue);
    }

    const formattedLyrics = formatLyricsWithSunoTechniques(round.lyrics, round.roundNumber, round.role);
    lines.push(formattedLyrics);
    lines.push('');

    if (round.roundNumber === 4) {
      lines.push('(KEY CHANGE – triumphant, powerful)');
      lines.push('[drop]');
      lines.push('');
    }
  }

  lines.push('[Outro]');
  lines.push('(soft fade, victory echo)');
  lines.push(`(${protag.name}... ${protag.name}...)`);
  lines.push('');

  return lines.join('\n');
}

function getEmotionCueForRound(roundNumber: number, role: 'protagonist' | 'antagonist'): string {
  if (role === 'antagonist') {
    if (roundNumber === 1) return '(cold, commanding, dominant)';
    if (roundNumber === 3) return '(aggressive, desperate, cracking)';
  } else {
    if (roundNumber === 2) return '(defiant, building intensity)';
    if (roundNumber === 4) return '(BIG, emotional, triumphant)';
  }
  return '';
}

function formatLyricsWithSunoTechniques(
  lyrics: string,
  roundNumber: number,
  role: 'protagonist' | 'antagonist',
): string {
  const lyricLines = lyrics.split('\n').filter((l) => l.trim());
  const formattedLines: string[] = [];

  for (let idx = 0; idx < lyricLines.length; idx++) {
    let line = lyricLines[idx].trim();

    line = addParentheticalAdLibs(line, idx, lyricLines.length, role, roundNumber);

    line = addInternalRhymeEmphasis(line);

    if (roundNumber === 4 && idx === lyricLines.length - 1) {
      line = createKnockoutLineFormatting(line);
    }

    if (roundNumber === 3 && role === 'antagonist' && idx === lyricLines.length - 1) {
      line = line + ' (NOW!)';
    }

    formattedLines.push(line);
  }

  return formattedLines.join('\n');
}

function addParentheticalAdLibs(
  line: string,
  lineIndex: number,
  totalLines: number,
  role: 'protagonist' | 'antagonist',
  roundNumber: number,
): string {
  const lastWord =
    line
      .split(' ')
      .pop()
      ?.replace(/[.,!?]$/, '') || '';

  if (lineIndex === 0 && roundNumber === 1 && role === 'antagonist') {
    return `(Yeah...) ${line}`;
  }

  if (lineIndex === 0 && roundNumber === 2 && role === 'protagonist') {
    return `(Let's go) ${line}`;
  }

  if (lineIndex === totalLines - 1 && roundNumber === 4) {
    return line;
  }

  if (line.endsWith('!') && lineIndex > 0) {
    return line.replace(/!$/, `! (${lastWord}!)`);
  }

  if (lineIndex % 4 === 3 && lineIndex < totalLines - 1) {
    return `${line} (${lastWord})`;
  }

  return line;
}

function addInternalRhymeEmphasis(line: string): string {
  const rhymePatterns = [
    /(I've been \w+), (I've been \w+)/gi,
    /(You can't \w+), (you won't \w+)/gi,
    /(\w+) and (\1)/gi,
  ];

  for (const pattern of rhymePatterns) {
    if (pattern.test(line)) {
      return line;
    }
  }

  return line;
}

function createKnockoutLineFormatting(line: string): string {
  const words = line.split(' ');
  if (words.length >= 3) {
    const lastThree = words.slice(-3).join(' ');
    const rest = words.slice(0, -3).join(' ');
    const lastWord = words[words.length - 1].replace(/[.,!?]$/, '');
    return `${rest} ${lastThree}... (${lastWord}!)`;
  }
  return line;
}

function formatLyricsWithVocalStyling(lyrics: string, roundNumber: number): string {
  const lyricLines = lyrics.split('\n').filter((l) => l.trim());

  return lyricLines
    .map((line, idx) => {
      let formatted = line.trim();

      if (roundNumber === 4 && idx === lyricLines.length - 1) {
        const words = formatted.split(' ');
        if (words.length >= 2) {
          const lastWord = words.pop();
          formatted = words.join(' ') + ` ${lastWord}... (${lastWord})`;
        }
      }

      if (line.includes('!') || line.toUpperCase() === line) {
        formatted = formatted.replace(/([A-Z]{2,})/g, '($1)');
      }

      return formatted;
    })
    .join('\n');
}

export function formatBattleForSuno(battle: RapBattle): string {
  const lines: string[] = [];

  lines.push('[Intro]');
  lines.push('[Instrumental]');
  lines.push('(The battle begins...)');
  lines.push('');

  for (const round of battle.rounds) {
    const roundType = round.roundType?.toUpperCase() || `ROUND ${round.roundNumber}`;
    const performer = round.character?.toUpperCase() || 'PERFORMER';

    if (round.roundNumber === 3) {
      lines.push('[buildup]');
      lines.push('');
    }

    lines.push(`[${roundType} - ${performer}]`);

    const emotionCue =
      round.role === 'antagonist'
        ? round.roundNumber === 1
          ? '(cold, commanding, dominant)'
          : '(aggressive, desperate)'
        : round.roundNumber === 2
          ? '(defiant, building)'
          : '(BIG, emotional, triumphant)';
    lines.push(emotionCue);

    const formattedLyrics = formatLyricsWithSunoTechniques(round.lyrics, round.roundNumber, round.role);
    lines.push(formattedLyrics);
    lines.push('');

    if (round.roundNumber === 4) {
      lines.push('(KEY CHANGE – triumphant, powerful)');
      lines.push('[drop]');
      lines.push('');
    }
  }

  lines.push('[Outro]');
  lines.push('(soft fade, victory echo)');
  lines.push('(Victory... Victory...)');
  lines.push('');
  lines.push('---');
  lines.push(`SUNO STYLE: ${enhanceSunoStyle(battle.sunoStyle)}`);

  return lines.join('\n');
}

function enhanceSunoStyle(baseStyle: string): string {
  if (baseStyle.includes('key of') && baseStyle.includes('progression')) {
    return baseStyle;
  }

  const enhancements = [
    'key of C minor',
    'i-VII-VI-VII progression',
    'building intensity',
    'hard-hitting 808s',
    'orchestral stabs',
    'alternating aggressive male vocals',
    'cinematic drops',
  ];

  const hasEnhancement = (keyword: string) => baseStyle.toLowerCase().includes(keyword.toLowerCase());

  const missingEnhancements = enhancements.filter(
    (e) => !hasEnhancement(e.split(' ')[0]) && !hasEnhancement(e.split(' ').pop() || ''),
  );

  if (missingEnhancements.length > 0) {
    return `${baseStyle}, ${missingEnhancements.slice(0, 3).join(', ')}`;
  }

  return baseStyle;
}

export function formatBattleForVideo(battle: RapBattle): Array<{
  clipId: string;
  character: string;
  scenePrompt: string;
  duration: number;
  lyricsInClip: string;
  mood: string;
  cameraMovement: string;
}> {
  return battle.rounds.map((round) => ({
    clipId: `battle_round_${round.roundNumber}`,
    character: round.character,
    scenePrompt: round.scene,
    duration: 15.0,
    lyricsInClip: round.lyrics,
    mood: round.mood,
    cameraMovement: round.cameraMovement,
  }));
}

export function getAvailableStyleOptions() {
  return {
    emotionalTones: Object.entries({ ...BATTLE_TONES, ...EMOTIONAL_TONES }).map(([key, tone]) => ({
      key,
      name: tone.name,
      description: tone.description,
      feeling: tone.feeling,
    })),
    productionStyles: Object.entries(PRODUCTION_STYLES).map(([key, prod]) => ({
      key,
      name: prod.name,
      description: prod.description,
      genre: prod.genre,
      tempo: prod.tempo,
    })),
    vocalStyles: Object.entries(VOCAL_STYLES).map(([key, vocal]) => ({
      key,
      name: vocal.name,
      description: vocal.description,
    })),
  };
}

export const rapBattleGenerator = {
  generateRapBattle,
  formatBattleForSuno,
  formatBattleForVideo,
  getAvailableStyleOptions,
};
