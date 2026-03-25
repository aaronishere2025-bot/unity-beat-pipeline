import { GoogleGenerativeAI } from '@google/generative-ai';
import type { InsertSeries, InsertEpisode } from '@shared/schema';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface StoryInput {
  person: string;
  place: string;
  thing: string;
  genre?: string;
  tone?: string;
  timePeriod?: string;
  isHistoricalFigure?: boolean;
  additionalContext?: string;
}

export interface GeneratedStoryBible {
  title: string;
  protagonist: {
    name: string;
    description: string;
    traits: string[];
    motivation: string;
    backstory: string;
  };
  antagonist: {
    name: string;
    description: string;
    traits: string[];
    motivation: string;
    backstory: string;
  };
  setting: {
    name: string;
    description: string;
    locations: Array<{
      name: string;
      description: string;
      visualStyle: string;
    }>;
    era: string;
    atmosphere: string;
  };
  macguffin: {
    name: string;
    description: string;
    significance: string;
    visualDescription: string;
  };
  storyArc: {
    premise: string;
    conflict: string;
    stakes: string;
    themes: string[];
    tone: string;
    genre: string;
  };
  supportingCharacters: Array<{
    name: string;
    role: string;
    description: string;
    relationship: string;
  }>;
  visualStyle: {
    colorPalette: string[];
    cinematicStyle: string;
    lighting: string;
    moodBoard: string[];
  };
  episodeConcepts: Array<{
    episodeNumber: number;
    title: string;
    synopsis: string;
    mainConflict: string;
    emotionalArc: string;
  }>;
}

export async function generateStoryBible(input: StoryInput): Promise<GeneratedStoryBible> {
  console.log('📚 Generating Story Bible...');
  const isAutoDiscovery = input.isHistoricalFigure && input.timePeriod && !input.person && !input.place && !input.thing;

  if (isAutoDiscovery) {
    console.log(`   🔍 Mode: AUTO-DISCOVERY (AI will select historical figure)`);
    console.log(`   🕰️ Era: ${input.timePeriod}`);
  } else {
    console.log(`   👤 Person: ${input.person}`);
    console.log(`   🌍 Place: ${input.place}`);
    console.log(`   🎁 Thing: ${input.thing}`);
    if (input.isHistoricalFigure) {
      console.log(`   📜 Mode: HISTORICAL FIGURE (fact-checked)`);
    }
    if (input.timePeriod) {
      console.log(`   🕰️ Era: ${input.timePeriod}`);
    }
  }

  // Different prompts for historical vs fictional stories
  const prompt = input.isHistoricalFigure ? generateHistoricalPrompt(input) : generateFictionalPrompt(input);

  // Adaptive retry logic - use simplified prompt on retries
  let result: any = {};
  let attempts = 0;
  const maxAttempts = 3;

  // Simplified prompt for retries (shorter, more focused)
  const simplifiedPrompt = input.isHistoricalFigure
    ? `You are a historical researcher. Generate a Story Bible about a fascinating figure from: ${input.timePeriod || 'history'}.
${input.person ? `Focus on: ${input.person}` : 'Discover someone with a dramatic life story - battles, inventions, explorations, or social change.'}

REQUIRED JSON (minimum 1500 characters response):
{
  "title": "Their Name - The Story",
  "isHistorical": true,
  "protagonist": {"name": "Real Name", "description": "Who they were (50+ chars)", "traits": ["trait1","trait2"], "motivation": "What drove them", "backstory": "Their life story with dates and events (200+ chars)"},
  "antagonist": {"name": "Real Rival", "description": "Who opposed them", "traits": [], "motivation": "Why", "backstory": "Their story"},
  "setting": {"name": "Place", "description": "The world they lived in", "locations": [{"name":"Location1","description":"Details","visualStyle":"era-appropriate"}], "era": "Dates", "atmosphere": "mood"},
  "macguffin": {"name": "Their Achievement", "description": "What they did", "significance": "Why it mattered", "visualDescription": "How it looks"},
  "storyArc": {"premise": "One sentence story", "conflict": "Main challenge", "stakes": "What was at risk", "themes": ["theme1"], "tone": "epic", "genre": "biography"},
  "supportingCharacters": [{"name": "Person", "role": "Their role", "description": "Brief", "relationship": "To protagonist"}],
  "visualStyle": {"colorPalette": ["#hex1"], "cinematicStyle": "era-appropriate", "lighting": "dramatic", "moodBoard": ["mood1"]},
  "episodeConcepts": [{"episodeNumber": 1, "title": "Episode", "synopsis": "Based on real event", "mainConflict": "Challenge", "emotionalArc": "Journey"}]
}`
    : prompt;

  while (attempts < maxAttempts) {
    attempts++;
    const useSimplified = attempts > 1;
    const currentPrompt = useSimplified ? simplifiedPrompt : prompt;

    console.log(`   🔄 API call attempt ${attempts}/${maxAttempts}${useSimplified ? ' (simplified prompt)' : ''}...`);

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    });
    const completion = await model.generateContent(currentPrompt);
    const rawContent = completion.response.text() || '{}';
    console.log(`   📄 Raw AI response length: ${rawContent.length}`);

    // Check if response is too short (likely empty or error)
    if (rawContent.length < 500) {
      console.log(`   ⚠️ Response too short (${rawContent.length} chars), content: ${rawContent.substring(0, 100)}`);
      if (attempts < maxAttempts) {
        console.log(`   🔄 Retrying with simplified prompt...`);
        continue;
      }
    }

    try {
      result = JSON.parse(rawContent);
      // Check if the result has essential content (not generic fallbacks)
      const hasValidProtagonist =
        result.protagonist?.name &&
        result.protagonist.name.length > 5 &&
        !result.protagonist.name.includes('The Hero') &&
        !result.protagonist.name.includes('remarkable historical');
      const hasValidTitle = result.title && result.title.length > 10 && !result.title.includes('remarkable historical');

      if (hasValidProtagonist && hasValidTitle) {
        console.log(`   ✅ Valid response received`);
        break;
      } else if (attempts < maxAttempts) {
        console.log(`   ⚠️ Response has generic content, retrying with simplified prompt...`);
        continue;
      }
    } catch (parseError) {
      console.log(`   ❌ JSON parse error: ${parseError}`);
      if (attempts >= maxAttempts) {
        result = {};
      }
    }
  }

  // FALLBACK: If historical mode failed (empty result), try as fictional character
  if (input.isHistoricalFigure && (!result.protagonist?.name || result.protagonist.name.length < 5)) {
    console.log(`   ⚠️ Historical figure not found - falling back to FICTIONAL mode with provided context`);
    console.log(`   📖 Using additional context: ${input.additionalContext?.substring(0, 100) || 'none'}...`);

    // Generate as fictional character using the context provided
    const fictionalPrompt = generateFictionalPrompt({
      ...input,
      isHistoricalFigure: false,
    });

    const fallbackModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    });
    const fallbackCompletion = await fallbackModel.generateContent(fictionalPrompt);
    const fallbackContent = fallbackCompletion.response.text() || '{}';
    console.log(`   📄 Fictional fallback response length: ${fallbackContent.length}`);

    try {
      result = JSON.parse(fallbackContent);
      result.isHistorical = false; // Mark as fictional since historical lookup failed
      console.log(`   ✅ Created as fictional character instead`);
    } catch (e) {
      console.log(`   ❌ Fictional fallback also failed`);
    }
  }

  // Apply validation and ensure all fields exist
  result = validateAndFixStoryBible(result, input);

  console.log(`   ✅ Story Bible generated!`);
  console.log(`   📖 Title: ${result.title}`);
  console.log(`   👤 Protagonist: ${result.protagonist?.name}`);
  console.log(`   👿 Antagonist: ${result.antagonist?.name}`);
  console.log(`   🗺️ Locations: ${result.setting?.locations?.length || 0}`);
  console.log(`   📺 Episodes: ${result.episodeConcepts?.length || 0}`);

  return result;
}

function generateHistoricalPrompt(input: StoryInput): string {
  // Check if this is auto-discovery mode (only time period provided, no person/place/thing)
  const isAutoDiscovery = input.timePeriod && !input.person && !input.place && !input.thing;

  // Random category selection for variety
  const categories = [
    { type: 'warrior', desc: 'a warrior, general, or military leader who fought legendary battles' },
    { type: 'explorer', desc: 'an explorer, navigator, or adventurer who discovered new lands' },
    { type: 'inventor', desc: 'an inventor, scientist, or engineer who changed technology' },
    { type: 'rebel', desc: 'a rebel, revolutionary, or freedom fighter who challenged power' },
    { type: 'artist', desc: 'an artist, musician, or architect whose work transcended time' },
    { type: 'healer', desc: 'a doctor, healer, or medical pioneer who saved lives' },
    { type: 'merchant', desc: 'a merchant, trader, or economic pioneer who built empires' },
    { type: 'spy', desc: 'a spy, diplomat, or cunning strategist who operated in shadows' },
    { type: 'outlaw', desc: 'an outlaw, pirate, or bandit with a legendary reputation' },
    { type: 'visionary', desc: 'a philosopher, prophet, or visionary who changed how people think' },
    { type: 'survivor', desc: 'a survivor who overcame impossible odds or escaped death' },
    { type: 'ruler', desc: 'a ruler, queen, or king whose reign was transformative' },
  ];
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const randomSeed = Math.floor(Math.random() * 1000000);

  const discoverySection = isAutoDiscovery
    ? `
🔍 AUTO-DISCOVERY MODE ACTIVATED (Seed: ${randomSeed})
You must DISCOVER and SELECT a fascinating historical figure from this era:
- TIME PERIOD: ${input.timePeriod}

⚠️ VARIETY REQUIREMENT: For this request, focus on finding ${randomCategory.desc}.
DO NOT choose the same people repeatedly - explore OBSCURE but documented figures!

DISCOVERY CRITERIA:
1. Choose someone with a DRAMATIC life story (triumph, tragedy, adventure, or transformation)
2. AVOID the most famous figures - find someone lesser-known but captivating
3. Look for people with visual/cinematic potential (adventures, battles, inventions, explorations)
4. Choose someone whose story can be told in a compelling 60-180 second music video
5. Focus on a specific PIVOTAL MOMENT or achievement in their life
6. This time, find a ${randomCategory.type.toUpperCase()} type figure

AVOID THESE OVERUSED FIGURES (pick someone different!):
- Zhang Qian, Marco Polo, Zheng He (explorers)
- Cleopatra, Julius Caesar, Alexander (ancient rulers)
- Leonardo da Vinci, Michelangelo (Renaissance artists)
- Napoleon, Washington (modern leaders)

After selecting your historical figure, research their life thoroughly and create the story bible about their most dramatic moment.`
    : `
HISTORICAL SUBJECT:
- HISTORICAL FIGURE: ${input.person}
- REGION/LOCATION: ${input.place}
- KEY ACHIEVEMENT/EVENT: ${input.thing}`;

  return `You are a HISTORICAL RESEARCHER and TV DOCUMENTARY PRODUCER creating a fact-checked story bible about a real historical figure.

⚠️ CRITICAL: ALL INFORMATION MUST BE HISTORICALLY ACCURATE AND VERIFIABLE
- Research and fact-check all dates, events, relationships, and achievements
- Do NOT invent or embellish facts - stick to documented history
- Clearly distinguish between verified facts and historical speculation
- Include specific dates, places, and names from actual history
${discoverySection}
${input.timePeriod && !isAutoDiscovery ? `- TIME PERIOD: ${input.timePeriod}` : ''}
${input.genre ? `- STYLE: ${input.genre}` : ''}
${input.tone ? `- TONE: ${input.tone}` : ''}
${input.additionalContext ? `- FOCUS AREAS: ${input.additionalContext}` : ''}

Create a historically accurate story bible:

1. PROTAGONIST (The Historical Figure)
   - Use their REAL NAME
   - Accurate birth/death dates and locations
   - Real personality traits documented by historians
   - Actual motivations based on historical record
   - Factual backstory with verified events

2. ANTAGONIST / RIVAL (Real historical figure who opposed them)
   - Another real person from history who was their rival, opponent, or obstacle
   - Their actual relationship and conflicts
   - Real motivations and goals

3. SETTING (Accurate historical locations)
   - Real places they lived and worked
   - Accurate descriptions of the era
   - Historical atmosphere and conditions

4. KEY ACHIEVEMENT (The "thing" - their legacy)
   - What they're most famous for
   - The real significance and impact
   - How it changed history

5. STORY ARC (Based on their real life)
   - The central challenge they faced
   - Real historical conflicts
   - Actual stakes and outcomes
   - Themes from their life story

6. SUPPORTING FIGURES (Real people from their life)
   - Family, colleagues, rivals
   - Their actual relationships
   - Real roles they played

7. VISUAL STYLE
   - Accurate period clothing and architecture
   - Real locations and settings
   - Authentic color palette for the era

8. EPISODE CONCEPTS (Key moments from their life)
   - Based on REAL documented events
   - Include actual dates
   - Show character development through real experiences

Return as JSON with this structure:
{
  "title": "Series title featuring their name",
  "isHistorical": true,
  "historicalNote": "Brief note about sources and historical accuracy",
  "protagonist": { "name": "Real name", "description": "...", "traits": [], "motivation": "...", "backstory": "Real biography" },
  "antagonist": { "name": "Real rival's name", "description": "...", "traits": [], "motivation": "...", "backstory": "Real history" },
  "setting": { "name": "...", "description": "...", "locations": [{ "name": "Real place", "description": "...", "visualStyle": "..." }], "era": "Specific years", "atmosphere": "..." },
  "macguffin": { "name": "Their achievement", "description": "...", "significance": "Real impact", "visualDescription": "..." },
  "storyArc": { "premise": "...", "conflict": "Real challenges", "stakes": "...", "themes": [], "tone": "...", "genre": "..." },
  "supportingCharacters": [{ "name": "Real name", "role": "...", "description": "...", "relationship": "..." }],
  "visualStyle": { "colorPalette": [], "cinematicStyle": "...", "lighting": "...", "moodBoard": [] },
  "episodeConcepts": [{ "episodeNumber": 1, "title": "...", "synopsis": "Based on real events", "mainConflict": "...", "emotionalArc": "..." }]
}`;
}

function generateFictionalPrompt(input: StoryInput): string {
  return `You are a professional TV showrunner and story architect. Create a complete story bible for an animated series based on these core elements:

CORE ELEMENTS:
- PERSON (Protagonist): ${input.person}
- PLACE (Setting): ${input.place}  
- THING (MacGuffin/Key Object): ${input.thing}
${input.timePeriod ? `- TIME PERIOD: ${input.timePeriod}` : ''}
${input.genre ? `- GENRE: ${input.genre}` : ''}
${input.tone ? `- TONE: ${input.tone}` : ''}
${input.additionalContext ? `- ADDITIONAL CONTEXT: ${input.additionalContext}` : ''}

Create a compelling story bible with:

1. PROTAGONIST - Expand the person into a fully realized character
   - Give them a memorable name that fits the world
   - Create depth with motivations, flaws, and a compelling backstory
   - Define their character arc potential

2. ANTAGONIST - Create a worthy adversary
   - Someone who directly opposes the protagonist's goals
   - Give them understandable (even sympathetic) motivations
   - Make them a dark mirror or foil to the protagonist

3. SETTING - Expand the place into a rich world
   - Create 3-5 distinct locations within this world
   - Define the atmosphere, rules, and visual style
   - Make it feel lived-in and consistent

4. MACGUFFIN - The "thing" that drives the plot
   - Why is it significant?
   - What happens if the antagonist gets it?
   - How does it connect to the protagonist's journey?

5. STORY ARC - The overarching narrative
   - A compelling premise in one sentence
   - The central conflict
   - What's at stake (personal AND world-level)
   - Core themes to explore

6. SUPPORTING CHARACTERS - 3-5 allies, rivals, or mentors
   - Each should have a distinct role and personality
   - Show their relationship to the protagonist

7. VISUAL STYLE - How this should look on screen
   - Color palette (5-7 hex colors)
   - Cinematic style (documentary, action, noir, etc.)
   - Lighting approach
   - Mood board keywords

8. EPISODE CONCEPTS - 5 episode ideas for Season 1
   - Each builds on the previous
   - Mix of character development and plot advancement
   - End on cliffhangers where appropriate

Return JSON in this EXACT format:
{
  "title": "Series Title",
  "protagonist": {
    "name": "Character Name",
    "description": "Who they are (50+ characters)",
    "traits": ["trait1", "trait2", "trait3"],
    "motivation": "What drives them",
    "backstory": "Their history and origin (100+ characters)"
  },
  "antagonist": {
    "name": "Villain Name",
    "description": "Who they are",
    "traits": ["trait1", "trait2"],
    "motivation": "Why they oppose the hero",
    "backstory": "Their origin"
  },
  "setting": {
    "name": "World Name",
    "description": "Description of the world (50+ characters)",
    "locations": [
      {"name": "Location 1", "description": "Details", "visualStyle": "How it looks"}
    ],
    "era": "Time period",
    "atmosphere": "Overall mood"
  },
  "macguffin": {
    "name": "Object Name",
    "description": "What it is",
    "significance": "Why it matters",
    "visualDescription": "How it looks"
  },
  "storyArc": {
    "premise": "One sentence pitch",
    "conflict": "Central struggle",
    "stakes": "What's at risk",
    "themes": ["theme1", "theme2"],
    "tone": "Emotional tone",
    "genre": "Genre classification"
  },
  "supportingCharacters": [
    {"name": "Ally", "role": "mentor/friend/rival", "description": "Who they are", "relationship": "To protagonist"}
  ],
  "visualStyle": {
    "colorPalette": ["#hex1", "#hex2"],
    "cinematicStyle": "Visual approach",
    "lighting": "Lighting style",
    "moodBoard": ["keyword1", "keyword2"]
  },
  "episodeConcepts": [
    {"episodeNumber": 1, "title": "Ep Title", "synopsis": "What happens", "mainConflict": "Challenge", "emotionalArc": "Character journey"}
  ]
}`;
}

function validateAndFixStoryBible(result: any, input: StoryInput): GeneratedStoryBible {
  // Validate required fields and provide defaults if missing
  // Schema requires: title, protagonist, setting, storyArc
  // descriptions must be at least 10 characters

  // For auto-discovery mode, use generic fallbacks when input fields are empty
  const personFallback = input.person || 'A remarkable historical figure';
  const placeFallback = input.place || input.timePeriod || 'An ancient realm';
  const thingFallback = input.thing || 'Their greatest achievement';

  if (!result.title || result.title.length < 3) {
    result.title = `${personFallback} - The Series`;
  }

  // Ensure protagonist has all required fields with proper lengths
  if (!result.protagonist || !result.protagonist.name) {
    result.protagonist = {
      name: personFallback.split(' ').pop() || 'The Hero',
      description: `A compelling ${personFallback} who embarks on an extraordinary journey in ${placeFallback}`,
      traits: ['determined', 'resourceful', 'brave'],
      motivation: `To protect the ${thingFallback} from those who would misuse its power`,
      backstory: `Once an ordinary individual living in ${placeFallback}, destiny called when the ${thingFallback} appeared`,
    };
  } else {
    // Ensure existing protagonist has description of minimum length
    if (!result.protagonist.description || result.protagonist.description.length < 10) {
      result.protagonist.description = `A compelling ${personFallback} who embarks on an extraordinary journey`;
    }
    if (!result.protagonist.traits || result.protagonist.traits.length === 0) {
      result.protagonist.traits = ['determined', 'resourceful'];
    }
    if (!result.protagonist.motivation || result.protagonist.motivation.length < 5) {
      result.protagonist.motivation = `To protect the ${thingFallback}`;
    }
    if (!result.protagonist.backstory || result.protagonist.backstory.length < 5) {
      result.protagonist.backstory = `A ${personFallback} from ${placeFallback}`;
    }
  }

  // Ensure setting has all required fields with proper lengths
  const settingName = result.setting?.name || placeFallback;
  if (!result.setting || !result.setting.name || result.setting.name.length < 1) {
    result.setting = {
      name: settingName.length > 0 ? settingName : 'The World',
      description: `The mysterious realm of ${placeFallback}, a place of wonder and danger where the fate of many will be decided`,
      locations: [
        {
          name: placeFallback.length > 0 ? placeFallback : 'Main Location',
          description: `The main location in ${placeFallback} where the story begins`,
          visualStyle: 'cinematic',
        },
      ],
      era: input.timePeriod || 'present',
      atmosphere: 'mysterious',
    };
  } else {
    // Ensure setting.name is not empty
    if (!result.setting.name || result.setting.name.length < 1) {
      result.setting.name = placeFallback.length > 0 ? placeFallback : 'The World';
    }
    if (!result.setting.description || result.setting.description.length < 10) {
      result.setting.description = `The mysterious realm of ${placeFallback}, a place of wonder and danger`;
    }
    if (!result.setting.locations || result.setting.locations.length === 0) {
      result.setting.locations = [
        {
          name: placeFallback.length > 0 ? placeFallback : 'Main Location',
          description: `The main location where the story begins`,
          visualStyle: 'cinematic',
        },
      ];
    }
    if (!result.setting.era) {
      result.setting.era = input.timePeriod || 'present';
    }
    if (!result.setting.atmosphere) {
      result.setting.atmosphere = 'mysterious';
    }
  }

  // Ensure storyArc has all required fields with proper lengths
  if (!result.storyArc) {
    result.storyArc = {
      premise: `A ${input.person} must protect the powerful ${input.thing} in the dangerous realm of ${input.place}`,
      conflict: 'Dark forces seek to control the powerful artifact for their own ends',
      stakes: 'The fate of the world hangs in the balance, and only our hero can stop the coming darkness',
      themes: ['power', 'identity', 'sacrifice'],
      tone: input.tone || 'epic',
      genre: input.genre || 'adventure',
    };
  } else {
    // Validate all storyArc fields with type checking - AI may return wrong types
    if (
      !result.storyArc.premise ||
      typeof result.storyArc.premise !== 'string' ||
      result.storyArc.premise.length < 10
    ) {
      result.storyArc.premise =
        typeof result.storyArc.premise === 'object'
          ? JSON.stringify(result.storyArc.premise)
          : `A ${input.person} must protect the powerful ${input.thing} in ${input.place}`;
    }
    if (!result.storyArc.conflict || typeof result.storyArc.conflict !== 'string') {
      result.storyArc.conflict =
        typeof result.storyArc.conflict === 'object'
          ? JSON.stringify(result.storyArc.conflict)
          : 'Forces seek to control the powerful artifact';
    }
    if (!result.storyArc.stakes || typeof result.storyArc.stakes !== 'string') {
      result.storyArc.stakes =
        typeof result.storyArc.stakes === 'object'
          ? JSON.stringify(result.storyArc.stakes)
          : 'The fate of the world hangs in the balance';
    }
    if (!result.storyArc.themes || !Array.isArray(result.storyArc.themes)) {
      result.storyArc.themes = ['power', 'identity'];
    } else {
      // Ensure all themes are strings
      result.storyArc.themes = result.storyArc.themes.map((t: any) => (typeof t === 'string' ? t : String(t)));
    }
    if (!result.storyArc.tone || typeof result.storyArc.tone !== 'string') {
      result.storyArc.tone = input.tone || 'epic';
    }
    if (!result.storyArc.genre || typeof result.storyArc.genre !== 'string') {
      result.storyArc.genre = input.genre || 'adventure';
    }
  }

  // Ensure antagonist has all required fields with proper types (optional field but needs complete structure if present)
  if (!result.antagonist) {
    result.antagonist = {
      name: 'The Shadow',
      description: `A formidable adversary who seeks to claim the ${input.thing} for dark purposes`,
      traits: ['cunning', 'powerful', 'ruthless'],
      motivation: `To seize the ${input.thing} and dominate ${input.place}`,
      backstory: 'A dark figure risen from the shadows, driven by an insatiable hunger for power',
    };
  } else {
    // Validate all antagonist fields - AI may return partial objects
    if (!result.antagonist.name) {
      result.antagonist.name = 'The Shadow';
    }
    if (
      !result.antagonist.description ||
      typeof result.antagonist.description !== 'string' ||
      result.antagonist.description.length < 10
    ) {
      result.antagonist.description = `A formidable adversary who seeks to claim the ${input.thing} for dark purposes`;
    }
    if (!result.antagonist.traits || !Array.isArray(result.antagonist.traits)) {
      result.antagonist.traits = ['cunning', 'powerful', 'ruthless'];
    }
    if (!result.antagonist.motivation || typeof result.antagonist.motivation !== 'string') {
      result.antagonist.motivation = `To seize the ${input.thing} and dominate ${input.place}`;
    }
    if (!result.antagonist.backstory || typeof result.antagonist.backstory !== 'string') {
      result.antagonist.backstory = 'A dark figure risen from the shadows, driven by an insatiable hunger for power';
    }
  }

  if (!result.supportingCharacters || !Array.isArray(result.supportingCharacters)) {
    result.supportingCharacters = [];
  } else {
    // Validate and sanitize each supporting character - AI may return wrong types
    result.supportingCharacters = result.supportingCharacters
      .filter((char: any) => char && typeof char === 'object' && char.name)
      .map((char: any) => ({
        name: typeof char.name === 'string' ? char.name : String(char.name || 'Unknown'),
        role:
          typeof char.role === 'string'
            ? char.role
            : typeof char.role === 'object'
              ? JSON.stringify(char.role)
              : 'Supporting Character',
        description:
          typeof char.description === 'string'
            ? char.description
            : typeof char.description === 'object'
              ? JSON.stringify(char.description)
              : `A character in the story`,
        relationship:
          typeof char.relationship === 'string'
            ? char.relationship
            : typeof char.relationship === 'object'
              ? JSON.stringify(char.relationship)
              : 'Connected to the protagonist',
        characterProfileId: typeof char.characterProfileId === 'string' ? char.characterProfileId : undefined,
      }));
  }

  if (!result.visualStyle) {
    result.visualStyle = {
      colorPalette: ['#1a1a2e', '#16213e', '#0f3460', '#e94560'],
      cinematicStyle: 'cinematic',
      lighting: 'dramatic',
      moodBoard: ['epic', 'mysterious', 'intense'],
    };
  } else {
    // Validate visualStyle fields
    if (!result.visualStyle.colorPalette || !Array.isArray(result.visualStyle.colorPalette)) {
      result.visualStyle.colorPalette = ['#1a1a2e', '#16213e', '#0f3460', '#e94560'];
    }
    if (!result.visualStyle.cinematicStyle || typeof result.visualStyle.cinematicStyle !== 'string') {
      result.visualStyle.cinematicStyle = 'cinematic';
    }
    if (!result.visualStyle.lighting || typeof result.visualStyle.lighting !== 'string') {
      result.visualStyle.lighting = 'dramatic';
    }
    if (!result.visualStyle.moodBoard || !Array.isArray(result.visualStyle.moodBoard)) {
      result.visualStyle.moodBoard = ['epic', 'mysterious', 'intense'];
    }
  }

  if (!result.episodeConcepts || !Array.isArray(result.episodeConcepts) || result.episodeConcepts.length === 0) {
    result.episodeConcepts = [
      {
        episodeNumber: 1,
        title: 'The Beginning',
        synopsis: `${result.protagonist.name} discovers their destiny`,
        mainConflict: 'First encounter with the unknown',
        emotionalArc: 'Curiosity to determination',
      },
    ];
  }

  // Ensure macguffin has all required fields with correct types
  const macguffinName = result.macguffin?.name || thingFallback;
  if (!result.macguffin || !result.macguffin.name || result.macguffin.name.length < 1) {
    result.macguffin = {
      name: macguffinName.length > 0 ? macguffinName : 'The Achievement',
      description: `The legendary ${thingFallback}, an artifact of immense power sought by many`,
      significance: 'A powerful artifact sought by many that could change the fate of the world',
      visualDescription: 'A mysterious object of great power that glows with an otherworldly energy',
    };
  } else {
    // Validate all macguffin fields - AI may return wrong types
    if (!result.macguffin.name || typeof result.macguffin.name !== 'string' || result.macguffin.name.length < 1) {
      result.macguffin.name = thingFallback.length > 0 ? thingFallback : 'The Achievement';
    }
    if (!result.macguffin.description || typeof result.macguffin.description !== 'string') {
      result.macguffin.description = `The legendary ${thingFallback}, an artifact of immense power`;
    }
    // CRITICAL: significance must be string, AI sometimes returns array
    if (!result.macguffin.significance || typeof result.macguffin.significance !== 'string') {
      if (Array.isArray(result.macguffin.significance)) {
        result.macguffin.significance = result.macguffin.significance.join('. ');
      } else {
        result.macguffin.significance = 'A powerful artifact sought by many that could change the fate of the world';
      }
    }
    if (!result.macguffin.visualDescription || typeof result.macguffin.visualDescription !== 'string') {
      result.macguffin.visualDescription = 'A mysterious object of great power that glows with an otherworldly energy';
    }
  }

  return result as GeneratedStoryBible;
}

export async function generateEpisodeScript(
  series: InsertSeries,
  episodeNumber: number,
  previousEpisodeSummary?: string,
  musicAnalysis?: {
    duration: number;
    tempo: number;
    mood: string;
    energy: number;
    sections: Array<{ type: string; start: number; end: number; energy: number; description: string }>;
    lyrics?: string;
    hasVocals: boolean;
  },
): Promise<{
  title: string;
  synopsis: string;
  plotPoints: Array<{
    order: number;
    description: string;
    scene: string;
    characters: string[];
    emotionalBeat: string;
  }>;
  generatedScenes: Array<{
    sceneNumber: number;
    start: number;
    end: number;
    prompt: string;
    cameraWork: string;
    mood: string;
    character?: string;
  }>;
  continuityNotes: {
    characterStates: Record<string, string>;
    plotThreads: string[];
    unresolvedConflicts: string[];
  };
}> {
  console.log(`📝 Generating Episode ${episodeNumber} Script...`);

  const prompt = `You are a TV episode writer. Create a detailed episode script for this animated series.

SERIES BIBLE:
Title: ${series.title}

Protagonist: ${JSON.stringify(series.protagonist, null, 2)}

${series.antagonist ? `Antagonist: ${JSON.stringify(series.antagonist, null, 2)}` : ''}

Setting: ${JSON.stringify(series.setting, null, 2)}

${series.macguffin ? `MacGuffin: ${JSON.stringify(series.macguffin, null, 2)}` : ''}

Story Arc: ${JSON.stringify(series.storyArc, null, 2)}

${series.supportingCharacters ? `Supporting Characters: ${JSON.stringify(series.supportingCharacters, null, 2)}` : ''}

Visual Style: ${JSON.stringify(series.visualStyle, null, 2)}

EPISODE NUMBER: ${episodeNumber}

${
  previousEpisodeSummary
    ? `PREVIOUS EPISODE SUMMARY (for continuity):
${previousEpisodeSummary}`
    : 'This is the FIRST episode - establish the world and characters.'
}

${
  musicAnalysis
    ? `MUSIC ANALYSIS (sync scenes to this):
Duration: ${musicAnalysis.duration}s
Tempo: ${musicAnalysis.tempo} BPM
Mood: ${musicAnalysis.mood}
Energy: ${musicAnalysis.energy}
Has Vocals: ${musicAnalysis.hasVocals}
${musicAnalysis.lyrics ? `Lyrics:\n${musicAnalysis.lyrics}` : ''}

Music Sections:
${musicAnalysis.sections
  .map(
    (s, i) => `${i + 1}. ${s.type.toUpperCase()} (${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s) - Energy: ${s.energy}`,
  )
  .join('\n')}
`
    : 'No music provided - create a compelling narrative structure.'
}

Create a detailed episode script with:

1. TITLE - Catchy episode title

2. SYNOPSIS - 2-3 paragraph summary

3. PLOT POINTS - Break down into 5-8 key story beats
   - Each beat should map to a scene
   - Include which characters appear
   - Note the emotional beat (tension, relief, revelation, etc.)

4. GENERATED SCENES - Create detailed video generation prompts for each music section (or story beat if no music)
   - Each scene should be 150+ characters
   - Include camera work (wide, close-up, tracking, etc.)
   - Match energy to music sections
   - Specify which character is featured

5. CONTINUITY NOTES - For future episodes
   - Character states (how they've changed)
   - Plot threads (unresolved storylines)
   - Unresolved conflicts (what's still pending)

Return as JSON. Make each scene vivid and cinematic.`;

  const episodeModel = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 16384, responseMimeType: 'application/json' },
  });
  const completion = await episodeModel.generateContent(prompt);
  const result = JSON.parse(completion.response.text() || '{}');

  console.log(`   ✅ Episode ${episodeNumber} script generated!`);
  console.log(`   📺 Title: ${result.title}`);
  console.log(`   📊 Plot Points: ${result.plotPoints?.length || 0}`);
  console.log(`   🎬 Scenes: ${result.generatedScenes?.length || 0}`);

  return {
    title: result.title || `Episode ${episodeNumber}`,
    synopsis: result.synopsis || '',
    plotPoints: result.plotPoints || [],
    generatedScenes: result.generatedScenes || [],
    continuityNotes: result.continuityNotes || {
      characterStates: {},
      plotThreads: [],
      unresolvedConflicts: [],
    },
  };
}

export async function generateEpisodeFromMusic(
  series: InsertSeries,
  episodeNumber: number,
  audioAnalysis: {
    duration: number;
    tempo: number;
    mood: string;
    energy: number;
    sections: Array<{ type: string; start: number; end: number; energy: number; description: string }>;
    lyrics?: string;
    hasVocals: boolean;
  },
  previousEpisodeSummary?: string,
): Promise<{
  title: string;
  synopsis: string;
  plotPoints: Array<{
    order: number;
    description: string;
    scene: string;
    characters: string[];
    emotionalBeat: string;
  }>;
  generatedScenes: Array<{
    sceneNumber: number;
    start: number;
    end: number;
    prompt: string;
    cameraWork: string;
    mood: string;
    character?: string;
  }>;
}> {
  console.log(`🎵 Generating music-driven Episode ${episodeNumber}...`);

  const prompt = `You are a music video director creating episodic animated content. Create an episode that perfectly syncs with this music.

SERIES CONTEXT:
Title: ${series.title}
Protagonist: ${series.protagonist?.name} - ${series.protagonist?.description}
${series.antagonist ? `Antagonist: ${series.antagonist.name} - ${series.antagonist.description}` : ''}
Setting: ${series.setting?.name} - ${series.setting?.description}
Genre: ${series.storyArc?.genre}
Tone: ${series.storyArc?.tone}

${
  previousEpisodeSummary
    ? `PREVIOUS EPISODE (for continuity):
${previousEpisodeSummary}`
    : 'FIRST EPISODE - Establish the world and character.'
}

MUSIC ANALYSIS:
Duration: ${audioAnalysis.duration}s
Tempo: ${audioAnalysis.tempo} BPM
Overall Mood: ${audioAnalysis.mood}
Overall Energy: ${audioAnalysis.energy}
Has Vocals: ${audioAnalysis.hasVocals}

MUSIC SECTIONS:
${audioAnalysis.sections
  .map(
    (s, i) =>
      `Section ${i + 1} - ${s.type.toUpperCase()}:
   Time: ${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s (${(s.end - s.start).toFixed(1)}s duration)
   Energy: ${s.energy}
   Description: ${s.description}`,
  )
  .join('\n\n')}

${
  audioAnalysis.lyrics
    ? `
LYRICS:
${audioAnalysis.lyrics}
`
    : 'INSTRUMENTAL TRACK - Focus on visual storytelling through atmosphere and action.'
}

CREATE AN EPISODE that:
1. PERFECTLY SYNCS each scene to a music section
2. MATCHES energy levels - high energy sections = action, low energy = atmospheric
3. Uses the PROTAGONIST as the main character
4. Advances the overall story
5. Creates a narrative arc even within this single episode

Return JSON with:
{
  "title": "Episode title",
  "synopsis": "2-3 paragraph episode summary",
  "plotPoints": [
    {
      "order": 1,
      "description": "What happens",
      "scene": "Visual description",
      "characters": ["Character names"],
      "emotionalBeat": "tension/relief/revelation/etc"
    }
  ],
  "generatedScenes": [
    {
      "sceneNumber": 1,
      "start": 0,
      "end": 15,
      "prompt": "Detailed 150+ char visual prompt for video generation, including subject, action, environment, lighting, mood",
      "cameraWork": "Wide establishing shot, slow push in",
      "mood": "mysterious",
      "character": "Protagonist name"
    }
  ]
}

IMPORTANT:
- Create exactly ${audioAnalysis.sections.length} scenes, one for each music section
- Scene timing MUST match music section timing exactly
- High energy sections (>0.7) = dynamic action, fast cuts
- Low energy sections (<0.4) = atmospheric, slow movement
- Medium energy = character moments, dialogue`;

  const musicEpModel = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 16384, responseMimeType: 'application/json' },
  });
  const completion = await musicEpModel.generateContent(prompt);
  const result = JSON.parse(completion.response.text() || '{}');

  console.log(`   ✅ Music-driven Episode ${episodeNumber} generated!`);
  console.log(`   📺 Title: ${result.title}`);
  console.log(`   🎬 Scenes: ${result.generatedScenes?.length || 0}`);

  return {
    title: result.title || `Episode ${episodeNumber}`,
    synopsis: result.synopsis || '',
    plotPoints: result.plotPoints || [],
    generatedScenes: result.generatedScenes || [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MUSIC PROMPT GENERATOR - Creates Suno-ready prompts with inline SCENE: descriptions
// Uses the 8-Beat Fire Video Formula for compelling narrative structure
// Outputs lyrics that can be split into: clean lyrics (Suno) + visuals.json (video)
// ═══════════════════════════════════════════════════════════════════════════

// Theme configurations with emotional arcs and key words
export const THEME_CONFIG = {
  conflict: {
    label: 'Conflict',
    emotionalArc: 'Tension → Confrontation → Defiance',
    verse1Focus: 'The threat approaching / stakes established',
    chorusFocus: 'Declaration of resistance / core identity',
    verse2Focus: "The clash / what's being fought for",
    bridgeFocus: 'Moment of doubt OR moment of resolve',
    keyWords: ['stand', 'rise', 'fight', 'never', 'hold', 'break', 'fire', 'storm'],
    visualPattern:
      'Intro: Calm before storm | Verse 1: Threat approaching | Chorus: Confrontation | Verse 2: Battle | Bridge: Resolve | Final: Victory',
  },
  triumph: {
    label: 'Triumph',
    emotionalArc: 'Struggle recalled → Victory claimed → Legacy declared',
    verse1Focus: "How far they've come / what was overcome",
    chorusFocus: 'Celebration of identity / achievement claimed',
    verse2Focus: 'Those who helped / what was sacrificed',
    bridgeFocus: 'Moment of reflection / gratitude',
    keyWords: ['won', 'rose', 'crowned', 'glory', 'name', 'legend', 'eternal'],
    visualPattern:
      'Intro: Recall struggle | Verse 1: Journey | Chorus: Victory | Verse 2: Sacrifices | Bridge: Gratitude | Final: Legacy',
  },
  journey: {
    label: 'Journey',
    emotionalArc: 'Setting Out → Trials → Transformation',
    verse1Focus: 'Leaving home / the call',
    chorusFocus: 'The mission / what drives them forward',
    verse2Focus: "Obstacles / what's been learned",
    bridgeFocus: 'Farthest point / darkest moment',
    keyWords: ['road', 'path', 'miles', 'horizon', 'forward', 'home', 'return'],
    visualPattern:
      'Intro: Home/origin | Verse 1: Setting out | Chorus: Forward momentum | Verse 2: Trials | Bridge: Darkest moment | Final: Arrival',
  },
  loss: {
    label: 'Loss',
    emotionalArc: 'Memory → Pain → Meaning Found',
    verse1Focus: 'What was / who was lost',
    chorusFocus: 'The ache / what remains',
    verse2Focus: 'The emptiness / carrying on',
    bridgeFocus: 'Finding purpose in pain',
    keyWords: ['remember', 'carry', 'echo', 'ghost', 'heart', 'gone', 'remains'],
    visualPattern:
      'Intro: Memory (warm, golden) | Verse 1: The loss | Chorus: The ache | Verse 2: Carrying on | Bridge: Finding meaning | Final: Grief as strength',
  },
  origin: {
    label: 'Origin',
    emotionalArc: 'Before → Catalyst → Becoming',
    verse1Focus: 'Who they were / humble beginnings',
    chorusFocus: "Who they're becoming / core identity emerges",
    verse2Focus: 'The moment everything changed',
    bridgeFocus: 'The choice / the transformation',
    keyWords: ['born', 'became', 'once', 'now', 'name', 'first', 'begin'],
    visualPattern:
      'Intro: Before (humble, small) | Verse 1: Limitations | Chorus: Transformation | Verse 2: Catalyst | Bridge: Becoming | Final: New identity',
  },
  love: {
    label: 'Love/Bond',
    emotionalArc: 'Connection → Tested → Strengthened',
    verse1Focus: 'How they met / the bond',
    chorusFocus: 'What they mean to each other',
    verse2Focus: 'Challenges faced together',
    bridgeFocus: 'Deepest truth of the bond',
    keyWords: ['heart', 'together', 'never', 'side', 'through', 'always', 'promise'],
    visualPattern:
      'Intro: First meeting | Verse 1: Connection | Chorus: The bond | Verse 2: Challenges | Bridge: Truth | Final: Strengthened',
  },
  betrayal: {
    label: 'Betrayal',
    emotionalArc: 'Trust → Shattered → Resolve',
    verse1Focus: 'What was believed / the trust',
    chorusFocus: 'The pain of betrayal / defiant response',
    verse2Focus: 'The moment of truth / aftermath',
    bridgeFocus: 'Rising from the ashes',
    keyWords: ['trusted', 'knife', 'back', 'lies', 'truth', 'see now', 'never again'],
    visualPattern:
      'Intro: Trust shown | Verse 1: The betrayal | Chorus: Pain/defiance | Verse 2: Aftermath | Bridge: Rising | Final: Resolve',
  },
  sacrifice: {
    label: 'Sacrifice',
    emotionalArc: 'Cost recognized → Choice made → Meaning found',
    verse1Focus: 'What must be given up',
    chorusFocus: "Why it's worth it",
    verse2Focus: 'The weight of the choice',
    bridgeFocus: 'Peace with the decision',
    keyWords: ['give', 'let go', 'worth', 'price', 'must', 'for you', 'remember me'],
    visualPattern:
      "Intro: Cost recognized | Verse 1: What's given up | Chorus: Why it's worth it | Verse 2: The weight | Bridge: Peace | Final: Legacy",
  },
} as const;

// Music style configurations with Suno tags
export const MUSIC_STYLE_CONFIG = {
  epic_orchestral: {
    label: 'Epic Orchestral',
    sunoTags: 'epic orchestral, cinematic, film score, dramatic strings, brass fanfare, choir',
    lyricNotes: 'Grand imagery, declarative statements, sustained vowels, build to BIG moments',
    syllablePreference: 'longer sustained phrases',
  },
  folk_ballad: {
    label: 'Folk Ballad',
    sunoTags: 'folk ballad, acoustic, storytelling, traditional, narrative, fingerpicked guitar',
    lyricNotes: 'Narrative structure, more detail allowed, conversational tone',
    syllablePreference: 'natural speech rhythm',
  },
  anthemic_rock: {
    label: 'Anthemic Rock',
    sunoTags: 'anthemic rock, arena rock, powerful, driving drums, electric guitar, stadium',
    lyricNotes: 'Short punchy phrases, call-and-response, group singalong moments',
    syllablePreference: 'short punchy',
  },
  dramatic_pop: {
    label: 'Dramatic Pop',
    sunoTags: 'dramatic pop, emotional, building, synth, modern, cinematic pop',
    lyricNotes: 'Intimate verses, explosive choruses, contemporary phrasing',
    syllablePreference: 'varied for contrast',
  },
  dark_ambient: {
    label: 'Dark/Atmospheric',
    sunoTags: 'dark ambient, atmospheric, brooding, minor key, ethereal, haunting',
    lyricNotes: 'Sparse lyrics, mysterious imagery, space for atmosphere',
    syllablePreference: 'sparse and weighted',
  },
  world_fusion: {
    label: 'World/Ancient',
    sunoTags: 'world music, ancient, tribal drums, chanting, middle eastern, mystical',
    lyricNotes: 'Ritualistic repetition, elemental imagery, incantation-like',
    syllablePreference: 'rhythmic and repetitive',
  },
} as const;

// Tempo configurations
export const TEMPO_CONFIG = {
  slow: {
    label: 'Slow (Ballad)',
    bpmRange: '60-80',
    bpm: 70,
    maxSyllablesPerLine: 12,
    maxLinesPerVerse: 6,
    notes: 'Room for emotional detail, sustained vowels',
  },
  medium: {
    label: 'Medium (Cinematic)',
    bpmRange: '80-110',
    bpm: 95,
    maxSyllablesPerLine: 10,
    maxLinesPerVerse: 6,
    notes: 'Balanced, most versatile',
  },
  fast: {
    label: 'Fast (Driving)',
    bpmRange: '110-140',
    bpm: 120,
    maxSyllablesPerLine: 8,
    maxLinesPerVerse: 4,
    notes: 'Punchy, rhythmic, percussive consonants',
  },
} as const;

// Mood configurations
export const MOOD_CONFIG = {
  dramatic: {
    label: 'Dramatic',
    promptModifier: 'Heighten contrast. Use opposing imagery (light/dark, rise/fall). Build tension. Delay resolution.',
    wordAdditions: ['shadow', 'thunder', 'clash', 'shatter', 'blaze'],
    visualStyle: 'High contrast, storm clouds, dynamic camera',
  },
  hopeful: {
    label: 'Hopeful',
    promptModifier: 'Focus on possibility. Dawn imagery. Rising motion. Light breaking through.',
    wordAdditions: ['dawn', 'light', 'rising', 'together', 'believe', 'tomorrow'],
    visualStyle: 'Golden light, sunrise, upward camera moves',
  },
  melancholic: {
    label: 'Melancholic',
    promptModifier: 'Beautiful sadness. Memory-focused. Gentle imagery. Acceptance not defeat.',
    wordAdditions: ['remember', 'echo', 'fade', 'gentle', 'once', 'remains'],
    visualStyle: 'Muted colors, rain, slow gentle movement',
  },
  defiant: {
    label: 'Defiant',
    promptModifier: 'Aggressive confidence. Challenge to opposition. Unbreakable will. No hedging.',
    wordAdditions: ['never', 'stand', 'unbroken', 'dare', 'still here'],
    visualStyle: 'Low angle hero shots, intense lighting',
  },
  mysterious: {
    label: 'Mysterious',
    promptModifier: 'Questions over answers. Veiled imagery. Whispered power. Anticipation.',
    wordAdditions: ['whisper', 'shadow', 'hidden', 'waiting', 'secrets', 'beneath'],
    visualStyle: 'Fog, shadows, slow reveals',
  },
  triumphant: {
    label: 'Triumphant',
    promptModifier: 'Victorious energy. Achievement celebrated. Legacy declared. Uplifting crescendo.',
    wordAdditions: ['glory', 'won', 'rise', 'crown', 'forever', 'legend'],
    visualStyle: 'Epic wide shots, light breaking through',
  },
} as const;

// Cinematic vocabulary for scene descriptions - V2 ENHANCED for Luma/Veo
export const CINEMATIC_VOCABULARY = {
  cameraMoves: [
    'Smooth tracking shot forward',
    'Slow push-in dramatic zoom',
    'Orbiting shot around subject',
    'Dolly track alongside subject',
    'Slow reverse crane shot',
    '360-degree orbit with slight tilt',
    'Whip pan settling on close-up',
    'Steady pull-back revealing scene',
    'Low-angle tracking shot pushing forward',
    'Aerial pull-back revealing landscape',
  ],
  angles: [
    'Low-angle hero shot',
    'Eye-level medium shot',
    'Extreme close-up on eyes',
    'Wide cinematic vista',
    'Dutch angle tension shot',
    'Over-shoulder framing',
  ],
  lighting: [
    'Golden hour glow with volumetric mist',
    'Storm light with lightning flashes',
    'Firelight with dramatic shadows',
    'Silhouette backlit',
    'Soft morning light',
    'High-contrast harsh lighting',
    'Diffused misty atmosphere',
    'Warm sunrise gold with dust motes',
  ],
  movement: ['slow, contemplative', 'building intensity', 'explosive, dynamic', 'peaceful, still'],
  compositions: [
    'Hero shot composition',
    'Wide establishing vista',
    'Intimate close framing',
    'Epic scale panorama',
    'Tight detail composition',
  ],
} as const;

// Character Registry for IP Adapter Consistency
export const CHARACTER_REGISTRY: Record<string, { name: string; description: string }> = {
  ram: {
    name: 'Ramfoucious',
    description:
      'A lean young man with sun-weathered bronze skin, intense dark eyes, short black hair, wearing a simple woven reed tunic and leather cord necklace, carrying a black obsidian blade',
  },
  ramfoucious: {
    name: 'Ramfoucious',
    description:
      'A lean young man with sun-weathered bronze skin, intense dark eyes, short black hair, wearing a simple woven reed tunic and leather cord necklace, carrying a black obsidian blade',
  },
  'namtar-khal': {
    name: 'Namtar-Khal',
    description:
      'A tall imposing priest-king with bleached white robes, shaved head with ritual scars, pale calculating eyes, bone jewelry and gold chains, carrying a staff of petrified wood',
  },
  namtar: {
    name: 'Namtar-Khal',
    description:
      'A tall imposing priest-king with bleached white robes, shaved head with ritual scars, pale calculating eyes, bone jewelry and gold chains, carrying a staff of petrified wood',
  },
  ishra: {
    name: 'Ishra',
    description:
      'An older woman with wild grey-streaked hair, weathered face marked with ash symbols, wearing layered marsh reeds and herbs, piercing knowing eyes',
  },
  ubar: {
    name: 'Ubar the Bull',
    description:
      'A massive muscular warrior with shaved head, ritual battle scars across chest, leather armor with bronze studs, carrying a heavy war club',
  },
  tammuk: {
    name: 'Tammuk',
    description:
      'A small bright-eyed boy around 8 years old, messy dark hair, simple linen clothes, barefoot, with an otherworldly calm expression',
  },
  ninsara: {
    name: 'Ninsara',
    description:
      'A swift athletic woman with long braided black hair, leather hunting gear, quiver of arrows on back, alert focused expression',
  },
};

// Location style presets for consistent lighting/atmosphere
export const LOCATION_STYLES: Record<string, string> = {
  'twin rivers': 'Golden hour glow, volumetric mist over water, epic cinematic vista, warm amber and blue-green tones',
  floodplain: 'Golden hour glow, volumetric mist over water, epic cinematic vista, warm amber and blue-green tones',
  marsh: 'Soft diffused light through fog, bioluminescent accents, olive-moss color palette, mysterious atmosphere',
  'obsidian steppe':
    'High-contrast harsh lighting, heat shimmer distortion, black glass reflections, scarlet sky, desolate beauty',
  'cedar spine': 'Storm light with lightning flashes, volumetric fog through trees, emerald and grey tones, epic scale',
  ziggurat: 'Warm sunrise gold, monumental architecture, dust motes in light beams, ancient grandeur',
};

// Timing configuration for clip batching
export const TIMING_CONFIG_CLIPS = {
  slow: { secondsPerLine: 4.0, introDuration: 6, outroDuration: 6 },
  medium: { secondsPerLine: 3.0, introDuration: 5, outroDuration: 5 },
  fast: { secondsPerLine: 2.0, introDuration: 4, outroDuration: 4 },
} as const;

// Maximum clip duration for Luma/Veo
export const MAX_CLIP_DURATION = 10; // seconds

// Few-shot examples for different moods to improve AI consistency
export const FEW_SHOT_EXAMPLES = {
  dramatic: `[Verse 1]
SCENE: Warrior silhouette against storm sky, low-angle tracking shot, lightning flash
The storm calls out my name tonight
Thunder echoes through my veins
I've walked through fire, faced my fear
Nothing left but what remains

[Chorus]
SCENE: Hero raises weapon overhead, dramatic push-in, golden rim lighting
Rise from the ashes, break the chains
We are the storm, we are the flame
Rise from the ashes, stake our claim
Nothing will ever be the same`,

  triumphant: `[Verse 1]
SCENE: Dawn breaking over battlefield, wide aerial shot, golden hour mist
We stood against the darkest night
When all hope had fled away
But in our hearts a fire burned bright
That led us to this day

[Chorus]
SCENE: Heroes united on hilltop, orbiting shot with lens flare, epic scale
Victory echoes through the land
Together we will stand
Glory written in the sand
We hold our fate in our own hand`,

  melancholic: `[Verse 1]
SCENE: Lone figure at window, rain streaking glass, soft blue lighting
The echoes of your voice still linger here
In empty rooms where shadows play
I count the days since you disappeared
And wonder if you feel the same way

[Chorus]
SCENE: Memory montage dissolve, slow push-in on eyes, diffused golden light
Remember when we had it all
Before the silence came
I still hear you through the wall
Whispering my name`,
};

// Validation feedback builder for retry mechanism
export function buildValidationFeedback(errors: string[], warnings: string[]): string {
  const feedbackParts: string[] = [];

  if (errors.length > 0) {
    feedbackParts.push('CRITICAL ERRORS TO FIX:');
    errors.forEach((e) => feedbackParts.push(`- ${e}`));
  }

  if (warnings.length > 0) {
    feedbackParts.push('WARNINGS TO ADDRESS:');
    warnings.forEach((w) => feedbackParts.push(`- ${w}`));
  }

  // Add specific guidance based on error types
  if (errors.some((e) => e.includes('lines') && e.includes('need'))) {
    feedbackParts.push('ACTION: Add more verses or extend existing sections');
  }
  if (errors.some((e) => e.includes('Chorus only appears'))) {
    feedbackParts.push('ACTION: Repeat the [Chorus] section 2-3 times throughout');
  }
  if (errors.some((e) => e.includes('Forbidden'))) {
    feedbackParts.push(
      'ACTION: Remove all dates (BCE/CE), real locations (Mesopotamia, Iraq, etc.), and academic terms',
    );
  }
  if (warnings.some((w) => w.includes('Chorus appears late'))) {
    feedbackParts.push('ACTION: Move chorus earlier in the song (by line 6)');
  }

  return feedbackParts.join('\n');
}

// Compact output rules (extracted to reduce prompt size)
// SHORT FORMAT: 12-18 lines for ~90 second videos (TikTok/Reels friendly)
export const OUTPUT_RULES_COMPACT = `
LYRICS: 12-18 lines ONLY, chorus by line 6, repeats 2x, max 10 syllables/line, ABAB rhyme, hook 3+ times
VISUALS: ONE "SCENE:" per section, max 20 words, use: wide shot, push-in, tracking, golden hour, storm light
FORBIDDEN: BCE/CE dates, Mesopotamia/Tigris/Euphrates/Iraq/Iran/Turkey/Syria, archaeological/museum terms`;

// Forbidden patterns for validation
export const FORBIDDEN_PATTERNS = [
  /\b\d{4}\s*(BCE|CE|BC|AD)\b/i,
  /\bc\.\s*\d{4}\b/i,
  /archaeological/i,
  /anthropological/i,
  /excavation/i,
  /artifact\s+from/i,
  /Kuwait/i,
  /Iraq/i,
  /Iran/i,
  /Turkey/i,
  /Syria/i,
  /museum/i,
  /discovered\s+in/i,
  /according\s+to/i,
  /research\s+shows/i,
  /scientists/i,
  /historians/i,
];

export type ThemeType = keyof typeof THEME_CONFIG;
export type MusicStyleType = keyof typeof MUSIC_STYLE_CONFIG;
export type TempoType = keyof typeof TEMPO_CONFIG;
export type MoodType = keyof typeof MOOD_CONFIG;

export interface EpisodeVariables {
  theme: ThemeType; // conflict, triumph, journey, loss, origin, love, betrayal, sacrifice
  conflict: string; // e.g., "alien invasion", "inner demons", "rival DJ"
  location: string; // e.g., "Mercury surface", "underground bunker"
  emotionalJourney: string; // e.g., "fear to triumph", "doubt to confidence"
  musicStyle: MusicStyleType; // epic_orchestral, folk_ballad, anthemic_rock, dramatic_pop, dark_ambient, world_fusion
  tempo: TempoType; // slow, medium, fast
  mood: MoodType; // dramatic, hopeful, melancholic, defiant, mysterious, triumphant
  plotBeat?: string; // Specific plot beat for this episode
  featuredCharacters?: string[]; // Max 2 characters for focus
  hookPhrase?: string; // Optional custom hook phrase
}

// Visual section for video generator
export interface VisualSection {
  section: string; // e.g., "Intro", "Verse 1", "Chorus"
  scene: string; // Scene description (max 20 words)
  mood: string; // e.g., "mysterious, ethereal"
  camera: string; // e.g., "aerial, slow pullback"
  lighting: string; // e.g., "golden hour, misty"
}

// Video clip for Luma/Veo generation (supports clip batching)
export interface VideoClip {
  clipId: string; // Unique ID: "verse1_clip0"
  section: string; // Section name: "Verse 1"
  clipIndex: number; // Index within section: 0, 1, 2...
  duration: number; // Clip duration in seconds
  prompt: string; // Full Luma/Veo prompt
  subjectAction: string; // WHO is doing WHAT
  cameraMovement: string; // HOW we see it
  composition: string; // Shot type
  styleLighting: string; // Visual mood
  startTime: number; // Start timestamp in full video
  endTime: number; // End timestamp
  ipAdapterRef?: string; // Reference for character consistency
  isReferenceSource: boolean; // True if this clip provides the reference
  isContinuation: boolean; // True if this is clip 2+ of a split scene
  originalScene: string; // Original SCENE description
}

// Separated output for Suno and Video Generator
export interface SplitLyricsOutput {
  cleanLyrics: string; // Lyrics with SCENE: lines removed (for Suno)
  visuals: {
    sections: VisualSection[];
  };
  sunoStyleTag: string; // Full Suno prompt string
  hookMoment: string; // 4 lines for TikTok clip
  tiktokTimestamp: string; // Where to clip for 15-second sound
}

export interface MusicPrompt {
  sunoPrompt: {
    style: string; // Music style description for Suno
    lyrics: string; // Full lyrics with inline SCENE: descriptions
    cleanLyrics: string; // Lyrics without SCENE: lines (for Suno)
    tags: string[]; // Genre/mood tags
  };
  visuals: {
    sections: VisualSection[];
  };
  episodeContext: {
    title: string;
    synopsis: string;
    visualThemes: string[];
    keyMoments: string[];
  };
  tiktokOptimization: {
    hookMoment: string; // 4 lines that work as TikTok clip
    hookTimestamp: string; // Estimated timestamp for clip
  };
  validation: {
    totalLines: number;
    totalLinesWithMarkers: number;
    contentLinesOnly: number;
    chorusByLine6: boolean;
    forbiddenPatternsFound: string[];
    hookRepetitions: number;
    isWithinRange: boolean;
  };
  recommendedDuration: number; // in seconds
}

// ═══════════════════════════════════════════════════════════════════════════
// SPLITTER FUNCTION - Separates lyrics with SCENE: lines into clean outputs
// ═══════════════════════════════════════════════════════════════════════════

export function splitLyricsAndVisuals(combinedOutput: string): SplitLyricsOutput {
  const lines = combinedOutput.trim().split('\n');

  const cleanLyricsLines: string[] = [];
  const visualSections: VisualSection[] = [];

  let currentSection: string | null = null;
  let currentScene: string | null = null;

  let sunoStyleTag = '';
  let hookMoment = '';
  let tiktokTimestamp = '';

  for (const line of lines) {
    const stripped = line.trim();

    // Skip empty lines but preserve them in lyrics for formatting
    if (!stripped) {
      cleanLyricsLines.push('');
      continue;
    }

    // Check for section tags like [Verse 1], [Chorus], etc.
    const sectionMatch = stripped.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      // Save previous section's visual if exists
      if (currentSection && currentScene) {
        visualSections.push({
          section: currentSection,
          scene: currentScene,
          mood: inferMoodFromScene(currentScene),
          camera: inferCameraFromScene(currentScene),
          lighting: inferLightingFromScene(currentScene),
        });
      }

      currentSection = sectionMatch[1];
      currentScene = null;
      cleanLyricsLines.push(line); // Keep section tags in lyrics
      continue;
    }

    // Check for SCENE: lines (don't add to lyrics)
    if (stripped.toUpperCase().startsWith('SCENE:')) {
      currentScene = stripped.slice(6).trim();
      continue;
    }

    // Check for SUNO STYLE metadata
    if (stripped.toUpperCase().startsWith('SUNO STYLE:')) {
      sunoStyleTag = stripped.slice(11).trim();
      continue;
    }

    // Check for HOOK MOMENT metadata
    if (stripped.toUpperCase().startsWith('HOOK MOMENT:')) {
      hookMoment = stripped.slice(12).trim();
      continue;
    }

    // Check for TIKTOK CLIP metadata
    if (stripped.toUpperCase().startsWith('TIKTOK CLIP:')) {
      tiktokTimestamp = stripped.slice(12).trim();
      continue;
    }

    // Regular lyric line - add to clean lyrics
    cleanLyricsLines.push(line);
  }

  // Don't forget the last section
  if (currentSection && currentScene) {
    visualSections.push({
      section: currentSection,
      scene: currentScene,
      mood: inferMoodFromScene(currentScene),
      camera: inferCameraFromScene(currentScene),
      lighting: inferLightingFromScene(currentScene),
    });
  }

  // Clean up lyrics - remove trailing empty lines, normalize spacing
  let cleanLyrics = cleanLyricsLines.join('\n').trim();
  cleanLyrics = cleanLyrics.replace(/\n{3,}/g, '\n\n');

  return {
    cleanLyrics,
    visuals: { sections: visualSections },
    sunoStyleTag,
    hookMoment,
    tiktokTimestamp,
  };
}

// Helper functions to infer visual metadata from scene descriptions
function inferMoodFromScene(scene: string): string {
  const sceneLower = scene.toLowerCase();
  if (sceneLower.includes('storm') || sceneLower.includes('dark') || sceneLower.includes('chaos'))
    return 'intense, dramatic';
  if (sceneLower.includes('dawn') || sceneLower.includes('golden') || sceneLower.includes('warm'))
    return 'hopeful, warm';
  if (sceneLower.includes('mist') || sceneLower.includes('fog') || sceneLower.includes('shadow'))
    return 'mysterious, ethereal';
  if (sceneLower.includes('epic') || sceneLower.includes('hero') || sceneLower.includes('triumph'))
    return 'triumphant, heroic';
  if (sceneLower.includes('calm') || sceneLower.includes('peaceful') || sceneLower.includes('gentle'))
    return 'peaceful, serene';
  return 'cinematic';
}

function inferCameraFromScene(scene: string): string {
  const sceneLower = scene.toLowerCase();
  if (sceneLower.includes('aerial') || sceneLower.includes('drone')) return 'aerial shot';
  if (sceneLower.includes('close-up') || sceneLower.includes('extreme close')) return 'close-up';
  if (sceneLower.includes('wide') || sceneLower.includes('establishing')) return 'wide shot';
  if (sceneLower.includes('push in') || sceneLower.includes('dolly')) return 'push in';
  if (sceneLower.includes('pull back')) return 'pull back';
  if (sceneLower.includes('tracking')) return 'tracking shot';
  if (sceneLower.includes('low angle')) return 'low angle (heroic)';
  if (sceneLower.includes('high angle')) return 'high angle (vulnerable)';
  return 'medium shot';
}

function inferLightingFromScene(scene: string): string {
  const sceneLower = scene.toLowerCase();
  if (sceneLower.includes('golden') || sceneLower.includes('sunset') || sceneLower.includes('warm'))
    return 'golden hour';
  if (sceneLower.includes('storm') || sceneLower.includes('lightning')) return 'storm light';
  if (sceneLower.includes('fire') || sceneLower.includes('torch')) return 'firelight';
  if (sceneLower.includes('silhouette') || sceneLower.includes('backlit')) return 'silhouette, backlit';
  if (sceneLower.includes('dawn') || sceneLower.includes('morning')) return 'soft morning light';
  if (sceneLower.includes('night') || sceneLower.includes('dark')) return 'dramatic shadows';
  if (sceneLower.includes('mist') || sceneLower.includes('fog')) return 'diffused, misty';
  return 'natural lighting';
}

// Validation function for lyrics
export function validateLyrics(
  lyrics: string,
  tempo: TempoType = 'medium',
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    totalLines: number;
    chorusFirstLine: number | null;
    chorusCount: number;
    forbiddenFound: number;
    syllableViolations: number;
  };
} {
  const maxSyllables = TEMPO_CONFIG[tempo].maxSyllablesPerLine;

  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = lyrics.split('\n');
  const contentLines = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('[') && !l.startsWith('('));

  // 1. Total line count (SHORT FORMAT: 12-18 lines for ~90 second videos)
  const totalLines = contentLines.length;
  if (totalLines < 12) {
    warnings.push(`Short: ${totalLines} lines (target: 12-18)`);
  } else if (totalLines > 18) {
    errors.push(`Too long: ${totalLines} lines (max: 18)`);
  }

  // 2. Check for [Chorus]
  if (!lyrics.includes('[Chorus]') && !lyrics.includes('[CHORUS]')) {
    errors.push('Missing [Chorus] section');
  }

  // 3. Chorus placement
  let chorusFirstLine: number | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase().includes('[CHORUS]')) {
      chorusFirstLine = i;
      break;
    }
  }

  // For short format (12-18 lines), chorus should appear by line 8
  if (chorusFirstLine && chorusFirstLine > 8) {
    warnings.push(`Chorus appears late (line ${chorusFirstLine})`);
  }

  // 4. Chorus repetitions
  const chorusCount =
    (lyrics.toUpperCase().match(/\[CHORUS\]/g) || []).length +
    (lyrics.toUpperCase().match(/\[FINAL CHORUS\]/g) || []).length;
  if (chorusCount < 2) {
    errors.push(`Chorus only appears ${chorusCount}x (need 2-3)`);
  }

  // 5. Forbidden patterns check
  let forbiddenFound = 0;
  const forbiddenDescriptions: string[] = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(lyrics)) {
      forbiddenFound++;
      forbiddenDescriptions.push(pattern.source);
    }
  }
  if (forbiddenFound > 0) {
    errors.push(`Forbidden content found: ${forbiddenDescriptions.slice(0, 3).join(', ')}`);
  }

  // 6. Syllable check (approximate)
  function countSyllables(word: string): number {
    word = word.toLowerCase();
    const count = (word.match(/[aeiouy]+/g) || []).length;
    if (word.endsWith('e') && count > 1) return count - 1;
    return Math.max(1, count);
  }

  let syllableViolations = 0;
  for (const line of contentLines) {
    const words = line.match(/[a-zA-Z]+/g) || [];
    const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
    if (syllables > maxSyllables) {
      syllableViolations++;
    }
  }

  if (syllableViolations > 3) {
    warnings.push(`${syllableViolations} lines exceed ${maxSyllables} syllables`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: {
      totalLines,
      chorusFirstLine,
      chorusCount,
      forbiddenFound,
      syllableViolations,
    },
  };
}

export async function generateMusicPrompt(
  series: {
    title: string;
    protagonist: { name: string; description: string; motivation: string; backstory?: string; traits?: string[] };
    antagonist?: { name: string; description: string; motivation?: string; backstory?: string };
    setting: {
      name: string;
      description: string;
      era?: string;
      locations?: Array<{ name: string; description: string }>;
    };
    storyArc: { genre: string; tone: string; conflict: string; stakes?: string; themes?: string[] };
    macguffin?: { name: string; description: string; significance: string };
    supportingCharacters?: Array<{ name: string; role: string; description: string }>;
    isHistorical?: boolean;
    historicalNote?: string;
  },
  episodeNumber: number,
  variables: EpisodeVariables,
  previousEpisodeSummary?: string,
): Promise<MusicPrompt> {
  console.log('🎵 Generating Viral Music Prompt with SCENE: descriptions...');
  console.log(`   📺 Series: ${series.title}`);
  console.log(`   🎬 Episode: ${episodeNumber}`);
  console.log(`   🎸 Style: ${variables.musicStyle}`);
  console.log(`   🎭 Theme: ${variables.theme}`);
  console.log(`   🎵 Mood: ${variables.mood}`);

  // Get configurations
  const themeConfig = THEME_CONFIG[variables.theme] || THEME_CONFIG.conflict;
  const styleConfig = MUSIC_STYLE_CONFIG[variables.musicStyle] || MUSIC_STYLE_CONFIG.epic_orchestral;
  const tempoConfig = TEMPO_CONFIG[variables.tempo] || TEMPO_CONFIG.medium;
  const moodConfig = MOOD_CONFIG[variables.mood] || MOOD_CONFIG.dramatic;

  // Build the world context section
  const worldContext = `
SETTING: ${series.setting.name} - ${series.setting.description}
${series.setting.era ? `ERA: ${series.setting.era}` : ''}

PROTAGONIST: ${series.protagonist.name}
- ${series.protagonist.description}
${series.protagonist.traits?.length ? `- Traits: ${series.protagonist.traits.join(', ')}` : ''}
${series.protagonist.backstory ? `- Backstory: ${series.protagonist.backstory}` : ''}

${
  series.antagonist
    ? `ANTAGONIST: ${series.antagonist.name}
- ${series.antagonist.description}
${series.antagonist.motivation ? `- Motivation: ${series.antagonist.motivation}` : ''}`
    : ''
}

${
  series.macguffin
    ? `MACGUFFIN: ${series.macguffin.name}
- ${series.macguffin.description}
- Significance: ${series.macguffin.significance}`
    : ''
}

${
  series.setting.locations?.length
    ? `KEY LOCATIONS:
${series.setting.locations.map((l) => `- ${l.name}: ${l.description}`).join('\n')}`
    : ''
}

${
  series.supportingCharacters?.length
    ? `SUPPORTING CHARACTERS (max 2 per song):
${series.supportingCharacters
  .slice(0, 4)
  .map((c) => `- ${c.name} (${c.role}): ${c.description}`)
  .join('\n')}`
    : ''
}`;

  // Build the prompt
  const prompt = `You are a songwriter and visual director for an animated series. You create synchronized lyrics and scene descriptions for AI music video generation.

Your output feeds TWO systems:
1. Suno AI (for music generation) - gets clean lyrics
2. Video Generator (auto-syncs visuals to audio tempo) - gets SCENE: descriptions

═══════════════════════════════════════════════════════════════════════════
WORLD CONTEXT
═══════════════════════════════════════════════════════════════════════════
${worldContext}

═══════════════════════════════════════════════════════════════════════════
EPISODE CONTEXT
═══════════════════════════════════════════════════════════════════════════
Theme: ${themeConfig.label}
Emotional Arc: ${themeConfig.emotionalArc}
Music Style: ${styleConfig.label}
Tempo: ${tempoConfig.label} (${tempoConfig.bpm} BPM)
Mood: ${moodConfig.label}
${variables.plotBeat ? `Plot Beat: ${variables.plotBeat}` : ''}
${variables.featuredCharacters?.length ? `Featured Characters: ${variables.featuredCharacters.join(', ')}` : ''}
Location: ${variables.location}
${variables.hookPhrase ? `Hook Phrase to use: "${variables.hookPhrase}"` : ''}

${
  previousEpisodeSummary
    ? `PREVIOUS EPISODE (for continuity):
${previousEpisodeSummary}`
    : 'FIRST EPISODE - Establish the world and character.'
}

═══════════════════════════════════════════════════════════════════════════
THEME-SPECIFIC GUIDANCE: ${themeConfig.label.toUpperCase()}
═══════════════════════════════════════════════════════════════════════════
Emotional Arc: ${themeConfig.emotionalArc}
Visual Pattern: ${themeConfig.visualPattern}

Section Focus:
- Verse 1: ${themeConfig.verse1Focus}
- Chorus: ${themeConfig.chorusFocus}
- Verse 2: ${themeConfig.verse2Focus}
- Bridge: ${themeConfig.bridgeFocus}

Key Words to Use: ${themeConfig.keyWords.join(', ')}
Mood Modifier: ${moodConfig.promptModifier}
Additional Words: ${moodConfig.wordAdditions.join(', ')}

═══════════════════════════════════════════════════════════════════════════
OUTPUT RULES
═══════════════════════════════════════════════════════════════════════════

LYRIC RULES (SHORT FORMAT - ~90 second video):
- Total: 12-18 lines ONLY (NOT 24-32, we want SHORT songs)
- Chorus MUST appear by line 6
- Chorus repeats exactly 2 times (not 3)
- Maximum ${tempoConfig.maxSyllablesPerLine} syllables per line
- Maximum 10 words per line
- Clear rhyme scheme: ABAB
- Hook phrase appears minimum 3 times total
- End lines with strong syllables (not "the", "a", "of")
- Structure: [Verse 1] + [Chorus] + [Verse 2] + [Chorus] (4 sections max)
- ${styleConfig.lyricNotes}

VISUAL RULES:
- Every section gets exactly ONE line starting with "SCENE:"
- Scene descriptions: maximum 20 words
- Use cinematic vocabulary: ${CINEMATIC_VOCABULARY.cameraMoves.slice(0, 5).join(', ')}
- Angles: ${CINEMATIC_VOCABULARY.angles.slice(0, 3).join(', ')}
- Lighting: ${CINEMATIC_VOCABULARY.lighting.slice(0, 4).join(', ')}
- Visual style for this mood: ${moodConfig.visualStyle}

FORBIDDEN (will cause validation failure):
- Dates with BCE/CE/BC/AD notation
- Real locations: Mesopotamia, Tigris, Euphrates, Iraq, Kuwait, Iran, Turkey, Syria
- Archaeological terms: excavation, artifact, museum
- Academic language: archaeological, anthropological, historians, scientists
- Parenthetical information
- Semi-colons

═══════════════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════

[Section Tag]
SCENE: [Visual description - max 20 words with camera/lighting]
[Lyrics - 4-6 lines per section]

End with:
SUNO STYLE: ${styleConfig.sunoTags}, ${moodConfig.label.toLowerCase()}, ${tempoConfig.bpm} BPM
HOOK MOMENT: [Best 2-4 lines for TikTok clip]

═══════════════════════════════════════════════════════════════════════════
MOOD-SPECIFIC EXAMPLES (match the ${moodConfig.label.toLowerCase()} mood)
═══════════════════════════════════════════════════════════════════════════

${FEW_SHOT_EXAMPLES[variables.mood as keyof typeof FEW_SHOT_EXAMPLES] || FEW_SHOT_EXAMPLES.dramatic}

═══════════════════════════════════════════════════════════════════════════

Now create the FULL song for Episode ${episodeNumber} with SCENE: descriptions for every section.
Return as JSON:
{
  "combinedLyrics": "Full lyrics with [Section] tags and SCENE: lines, ending with SUNO STYLE and HOOK MOMENT",
  "episodeContext": {
    "title": "Episode title",
    "synopsis": "2-3 sentence summary",
    "visualThemes": ["theme1", "theme2", "theme3"],
    "keyMoments": ["Intro visual", "Chorus climax visual", "Outro visual"]
  }
}`;

  // Retry mechanism with validation feedback
  const MAX_RETRIES = 2;
  let bestResult: any = null;
  let bestValidation: any = null;
  let bestSplitResult: SplitLyricsOutput | null = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
        { role: 'user', content: prompt },
      ];

      // Add feedback from previous attempt if this is a retry
      if (attempt > 0 && bestValidation && bestResult?.combinedLyrics) {
        const feedback = buildValidationFeedback(bestValidation.errors, bestValidation.warnings);
        console.log(`   🔄 Retry ${attempt}/${MAX_RETRIES} with feedback...`);
        messages.push({
          role: 'assistant',
          content: JSON.stringify({ combinedLyrics: bestResult.combinedLyrics.substring(0, 1500) + '...' }),
        });
        messages.push({
          role: 'user',
          content: `The output above had validation issues. Please regenerate a SHORT song (do not truncate) with these fixes:\n\n${feedback}\n\nRequirements: 12-18 lines total (SHORT FORMAT), chorus by line 6, chorus repeats 2x.\nReturn the corrected full JSON with "combinedLyrics" and "episodeContext".`,
        });
      }

      const musicPromptModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' },
      });
      const combinedPrompt = messages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
      const completion = await musicPromptModel.generateContent(combinedPrompt);
      const result = JSON.parse(completion.response.text() || '{}');

      // Skip empty results
      if (!result.combinedLyrics || result.combinedLyrics.length < 100) {
        console.log(`   ⚠️ Attempt ${attempt + 1}: Empty or too short response, skipping`);
        continue;
      }

      // Split into clean lyrics and visuals
      const splitResult = splitLyricsAndVisuals(result.combinedLyrics);

      // Validate the lyrics
      const validation = validateLyrics(splitResult.cleanLyrics, variables.tempo);

      console.log(
        `   📊 Attempt ${attempt + 1}: ${validation.metrics.totalLines} lines, ${validation.errors.length} errors, ${validation.warnings.length} warnings`,
      );

      // Score this result (prefer lines within SHORT format range, fewer errors)
      const linesInRange = validation.metrics.totalLines >= 12 && validation.metrics.totalLines <= 18;
      const score =
        (linesInRange ? 100 : 0) +
        validation.metrics.totalLines -
        validation.errors.length * 20 -
        validation.warnings.length * 5;

      // Keep best result
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
        bestValidation = validation;
        bestSplitResult = splitResult;
      }

      // If validation passes, break out of retry loop
      if (validation.valid && validation.errors.length === 0) {
        console.log(`   ✅ Validation passed on attempt ${attempt + 1}`);
        break;
      }
    } catch (err: any) {
      console.log(`   ⚠️ Attempt ${attempt + 1} failed: ${err.message}`);
    }

    // If we've exhausted retries, log and continue with best effort
    if (attempt === MAX_RETRIES) {
      console.log(`   ⚠️ Max retries reached. Using best result (score: ${bestScore}).`);
    }
  }

  // Use best results (fall back to empty if nothing worked)
  if (!bestSplitResult || !bestValidation || !bestResult) {
    throw new Error('Failed to generate lyrics after all attempts. Please try again.');
  }

  const splitResult = bestSplitResult;
  const validation = bestValidation;
  const result = bestResult;

  // Build the Suno style tag if not present
  const sunoStyle =
    splitResult.sunoStyleTag || `${styleConfig.sunoTags}, ${moodConfig.label.toLowerCase()}, ${tempoConfig.bpm} BPM`;

  // Calculate clean lyrics content lines (excluding section markers and blank lines)
  const cleanLyricsContentLines = splitResult.cleanLyrics
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('[') && !l.startsWith('(')).length;

  console.log(`   ✅ Viral Music Prompt Generated!`);
  console.log(`   🎵 Style: ${sunoStyle.slice(0, 50)}...`);
  console.log(
    `   📝 Clean Lyrics: ${cleanLyricsContentLines} content lines (${splitResult.cleanLyrics.split('\n').length} total with markers)`,
  );
  console.log(`   🎬 Visual Sections: ${splitResult.visuals.sections.length}`);
  console.log(`   ✓ Valid: ${validation.valid} (${validation.metrics.totalLines} content lines)`);
  if (validation.errors.length > 0) {
    console.log(`   ⚠️ Errors: ${validation.errors.join(', ')}`);
  }
  if (validation.warnings.length > 0) {
    console.log(`   📋 Warnings: ${validation.warnings.join(', ')}`);
  }

  return {
    sunoPrompt: {
      style: sunoStyle,
      lyrics: result.combinedLyrics,
      cleanLyrics: splitResult.cleanLyrics,
      tags: [
        styleConfig.label.toLowerCase().replace(/\//g, '-'),
        moodConfig.label.toLowerCase(),
        tempoConfig.label.split(' ')[0].toLowerCase(),
        ...moodConfig.wordAdditions.slice(0, 2),
      ],
    },
    visuals: splitResult.visuals,
    episodeContext: result.episodeContext || {
      title: `Episode ${episodeNumber}`,
      synopsis: '',
      visualThemes: [],
      keyMoments: [],
    },
    tiktokOptimization: {
      hookMoment: splitResult.hookMoment,
      hookTimestamp: splitResult.tiktokTimestamp || '0:45-1:00',
    },
    validation: {
      totalLines: validation.metrics.totalLines,
      totalLinesWithMarkers: splitResult.cleanLyrics.split('\n').length,
      contentLinesOnly: cleanLyricsContentLines,
      chorusByLine6: validation.metrics.chorusFirstLine !== null && validation.metrics.chorusFirstLine <= 6,
      forbiddenPatternsFound: validation.errors.filter((e: string) => e.includes('Forbidden')),
      hookRepetitions: validation.metrics.chorusCount,
      isWithinRange: validation.metrics.totalLines >= 12 && validation.metrics.totalLines <= 18,
    },
    recommendedDuration: tempoConfig.bpm >= 110 ? 120 : tempoConfig.bpm <= 80 ? 180 : 150,
  };
}

// Quick Episode Generator - Generates everything in one call
export interface QuickEpisodeResult {
  musicPrompt: MusicPrompt;
  sceneOutline: Array<{
    beat: number;
    beatName: string;
    lyricsSection: string;
    visualDescription: string;
    cameraWork: string;
    mood: string;
    estimatedDuration: number;
  }>;
}

export async function generateQuickEpisode(
  series: {
    title: string;
    protagonist: { name: string; description: string; motivation: string };
    antagonist?: { name: string; description: string };
    setting: { name: string; description: string };
    storyArc: { genre: string; tone: string; conflict: string };
  },
  episodeNumber: number,
  variables: EpisodeVariables,
  previousEpisodeSummary?: string,
): Promise<QuickEpisodeResult> {
  console.log('⚡ Quick Episode Generator - Creating complete episode package...');

  // Generate music prompt with lyrics
  const musicPrompt = await generateMusicPrompt(series, episodeNumber, variables, previousEpisodeSummary);

  // Generate scene outline based on the 8-beat structure
  const sceneOutline = [
    {
      beat: 1,
      beatName: 'YOU - Comfort Zone',
      lyricsSection: '[INTRO]',
      visualDescription: `Wide establishing shot of ${series.protagonist.name} in ${variables.location}`,
      cameraWork: 'Slow pan, wide shot',
      mood: 'atmospheric',
      estimatedDuration: 15,
    },
    {
      beat: 2,
      beatName: 'NEED - Want Something',
      lyricsSection: '[VERSE 1]',
      visualDescription: `${series.protagonist.name} encounters ${variables.conflict}`,
      cameraWork: 'Medium shot, dolly in',
      mood: 'building tension',
      estimatedDuration: 25,
    },
    {
      beat: 3,
      beatName: 'GO - Cross Threshold',
      lyricsSection: '[PRE-CHORUS]',
      visualDescription: `${series.protagonist.name} makes decision, enters the unknown`,
      cameraWork: 'Tracking shot forward',
      mood: 'anticipation',
      estimatedDuration: 15,
    },
    {
      beat: 4,
      beatName: 'SEARCH - Face Obstacles',
      lyricsSection: '[CHORUS]',
      visualDescription: `High energy action in ${variables.location}`,
      cameraWork: 'Dynamic handheld, quick cuts',
      mood: 'intense',
      estimatedDuration: 30,
    },
    {
      beat: 5,
      beatName: 'FIND - Get What Wanted',
      lyricsSection: '[VERSE 2]',
      visualDescription: `${series.protagonist.name} discovers truth, but at a cost`,
      cameraWork: 'Reveal shot, dramatic lighting',
      mood: 'dark revelation',
      estimatedDuration: 25,
    },
    {
      beat: 6,
      beatName: 'TAKE - Pay the Price (CLIMAX)',
      lyricsSection: '[BRIDGE]',
      visualDescription: `PEAK MOMENT: ${series.protagonist.name} transforms through ${variables.emotionalJourney}`,
      cameraWork: 'Close-up, slow motion, rim lighting',
      mood: 'peak intensity',
      estimatedDuration: 20,
    },
    {
      beat: 7,
      beatName: 'RETURN - Head Back',
      lyricsSection: '[FINAL CHORUS]',
      visualDescription: `${series.protagonist.name} triumphant, changed by experience`,
      cameraWork: 'Crane up wide shot',
      mood: 'cathartic',
      estimatedDuration: 30,
    },
    {
      beat: 8,
      beatName: 'CHANGE - Transformed',
      lyricsSection: '[OUTRO]',
      visualDescription: `New status quo, ${series.protagonist.name} is different now`,
      cameraWork: 'Slow pull back, fade',
      mood: 'resolution',
      estimatedDuration: 20,
    },
  ];

  console.log(`   ✅ Quick Episode Package Ready!`);
  console.log(`   🎵 Music prompt ready for Suno`);
  console.log(`   🎬 ${sceneOutline.length} scene beats outlined`);

  return {
    musicPrompt,
    sceneOutline,
  };
}

export const storyGenerator = {
  generateStoryBible,
  generateEpisodeScript,
  generateEpisodeFromMusic,
  generateMusicPrompt,
  generateQuickEpisode,
  splitLyricsAndVisuals,
  validateLyrics,
  THEME_CONFIG,
  MUSIC_STYLE_CONFIG,
  TEMPO_CONFIG,
  MOOD_CONFIG,
  CINEMATIC_VOCABULARY,
  FORBIDDEN_PATTERNS,
};
