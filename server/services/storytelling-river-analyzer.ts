import { GoogleGenerativeAI } from '@google/generative-ai';

let _gemini: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIRE VIDEO FORMULA - Research-Backed Storytelling Engine
 * Based on: Save the Cat, Story (McKee), Hero's Journey, Dan Harmon Story Circle
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * DAN HARMON'S 8-BEAT STORY CIRCLE
 * Maps perfectly to music video structure
 */
const STORY_BEATS = {
  YOU: { position: 0.0, name: 'Comfort Zone', shotType: 'wide', camera: 'slow pan establishing', emotion: 'neutral' },
  NEED: { position: 0.12, name: 'Want Something', shotType: 'medium', camera: 'dolly in', emotion: 'longing' },
  GO: {
    position: 0.25,
    name: 'Cross Threshold',
    shotType: 'medium',
    camera: 'tracking forward',
    emotion: 'anticipation',
  },
  SEARCH: {
    position: 0.37,
    name: 'Face Obstacles',
    shotType: 'dynamic',
    camera: 'handheld action',
    emotion: 'tension',
  },
  FIND: { position: 0.5, name: 'Get the Goal', shotType: 'medium', camera: 'reveal shot', emotion: 'discovery' },
  TAKE: {
    position: 0.65,
    name: 'Pay the Price',
    shotType: 'close-up',
    camera: 'slow-motion dramatic',
    emotion: 'peak_intensity',
  }, // CLIMAX at 65%
  RETURN: { position: 0.8, name: 'Head Back', shotType: 'dynamic', camera: 'crane up wide', emotion: 'catharsis' },
  CHANGE: { position: 0.92, name: 'Transformed', shotType: 'wide', camera: 'slow pull back', emotion: 'resolution' },
} as const;

/**
 * 6 RESEARCH-PROVEN EMOTIONAL ARCS
 * From computational analysis of successful stories
 */
type EmotionalArcType = 'rags_to_riches' | 'tragedy' | 'man_in_hole' | 'icarus' | 'cinderella' | 'oedipus';

const EMOTIONAL_ARCS: Record<EmotionalArcType, { name: string; pattern: number[]; bestFor: string }> = {
  rags_to_riches: {
    name: 'Rags to Riches',
    pattern: [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 1.0], // Steady rise
    bestFor: 'uplifting anthems, triumph stories',
  },
  tragedy: {
    name: 'Tragedy',
    pattern: [0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1], // Steady fall
    bestFor: 'sad ballads, loss stories',
  },
  man_in_hole: {
    name: 'Man in a Hole',
    pattern: [0.5, 0.3, 0.2, 0.15, 0.3, 0.6, 0.85, 1.0], // Fall then rise - MOST POPULAR
    bestFor: 'struggle to triumph, comeback stories',
  },
  icarus: {
    name: 'Icarus',
    pattern: [0.3, 0.5, 0.7, 0.9, 1.0, 0.7, 0.4, 0.2], // Rise then fall
    bestFor: 'hubris, cautionary tales',
  },
  cinderella: {
    name: 'Cinderella',
    pattern: [0.2, 0.5, 0.8, 0.4, 0.2, 0.5, 0.85, 1.0], // Rise, fall, rise
    bestFor: 'setback then comeback, fairy tales',
  },
  oedipus: {
    name: 'Oedipus',
    pattern: [0.7, 0.4, 0.2, 0.5, 0.8, 0.5, 0.3, 0.1], // Fall, rise, fall
    bestFor: 'complex tragedy, dramatic irony',
  },
};

/**
 * BPM TO EMOTIONAL ARC MAPPING
 * Research shows tempo correlates with emotional content
 */
function selectEmotionalArc(bpm: number, mood: string): EmotionalArcType {
  const moodLower = mood.toLowerCase();

  // Mood-based selection first
  if (moodLower.includes('sad') || moodLower.includes('melancholy') || moodLower.includes('dark')) {
    return bpm < 90 ? 'tragedy' : 'man_in_hole';
  }
  if (moodLower.includes('epic') || moodLower.includes('triumphant') || moodLower.includes('powerful')) {
    return 'rags_to_riches';
  }
  if (moodLower.includes('cautionary') || moodLower.includes('warning')) {
    return 'icarus';
  }

  // BPM-based fallback
  if (bpm < 80) return 'tragedy';
  if (bpm < 100) return 'man_in_hole';
  if (bpm < 120) return 'cinderella';
  if (bpm < 140) return 'rags_to_riches';
  return 'man_in_hole'; // Default - most universally engaging
}

/**
 * CINEMATIC CAMERA MOVEMENTS BY BPM
 */
function getCameraMovement(bpm: number, storyBeat: keyof typeof STORY_BEATS): string {
  const beatInfo = STORY_BEATS[storyBeat];

  // Base camera from story beat
  let camera = beatInfo.camera;

  // Modify intensity based on BPM
  if (bpm > 140) {
    // High energy - more dynamic
    if (storyBeat === 'SEARCH' || storyBeat === 'RETURN') {
      camera = 'rapid handheld with whip pans' as any;
    } else if (storyBeat === 'TAKE') {
      camera = 'extreme slow-motion close-up with shallow depth of field' as any;
    }
  } else if (bpm > 100) {
    // Medium energy - smooth dynamic
    if (storyBeat === 'SEARCH') {
      camera = 'smooth steadicam tracking' as any;
    } else if (storyBeat === 'TAKE') {
      camera = 'slow-motion dolly in with rack focus' as any;
    }
  } else {
    // Low energy - contemplative
    if (storyBeat === 'SEARCH') {
      camera = 'slow dolly with gentle drift' as any;
    } else if (storyBeat === 'TAKE') {
      camera = 'static close-up with subtle push' as any;
    }
  }

  return camera;
}

/**
 * MAP SCENE POSITION TO STORY BEAT
 */
function getStoryBeat(scenePosition: number): keyof typeof STORY_BEATS {
  const beats = Object.entries(STORY_BEATS) as [
    keyof typeof STORY_BEATS,
    (typeof STORY_BEATS)[keyof typeof STORY_BEATS],
  ][];

  for (let i = beats.length - 1; i >= 0; i--) {
    if (scenePosition >= beats[i][1].position) {
      return beats[i][0];
    }
  }
  return 'YOU';
}

/**
 * CINEMATIC PROMPT FORMULA
 * [SUBJECT] + [ACTION] + [CAMERA] + [LIGHTING] + [MOOD] + [SHOT TYPE]
 */
function buildCinematicPrompt(
  subject: string,
  action: string,
  storyBeat: keyof typeof STORY_BEATS,
  bpm: number,
  emotionalIntensity: number,
): string {
  const beat = STORY_BEATS[storyBeat];
  const camera = getCameraMovement(bpm, storyBeat);

  // Lighting based on emotional intensity
  let lighting = 'natural cinematic lighting';
  if (emotionalIntensity > 0.8) {
    lighting = 'dramatic rim lighting with deep shadows';
  } else if (emotionalIntensity > 0.6) {
    lighting = 'high contrast cinematic lighting';
  } else if (emotionalIntensity < 0.3) {
    lighting = 'soft diffused lighting with gentle gradients';
  }

  return `${subject}. ${action}. ${camera}, ${beat.shotType} shot, ${lighting}, ${beat.emotion} mood, highly detailed cinematic quality`;
}

/**
 * Timeout wrapper to prevent API calls from hanging indefinitely
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

export interface Scene {
  description: string;
  musicSection?: string;
  startTime?: number;
  endTime?: number;
  mood?: string;
  energyLevel?: number;
  visualStyle?: string;
  shotType?: 'wide' | 'medium' | 'close-up' | 'dynamic';
  cameraMovement?: string;
  actionIntensity?: 'low' | 'medium' | 'high';
  storyBeat?: string; // Dan Harmon's 8-beat position
  emotionalArc?: string; // Which of 6 arcs is being used
}

export interface SceneAnalysis {
  summary: string;
  keyMoments: string[];
  emotions: string[];
  sceneCount: number;
  estimatedDuration: number;
  scenes: Scene[];
  emotionalArc?: string; // Selected arc type
  storyStructure?: string; // "8-beat" for Dan Harmon structure
}

interface MusicAnalysis {
  bpm?: number;
  mood?: string;
  energy?: number[];
  visualStyle?: string;
  structure?: {
    sections?: Array<{ type: string; start: number; end: number }>;
  };
  genre?: string;
}

export async function analyzeScript(
  scriptContent: string,
  musicAnalysis?: MusicAnalysis,
  targetClipCount?: number,
): Promise<SceneAnalysis> {
  try {
    const hasMusicAnalysis =
      musicAnalysis && musicAnalysis.structure?.sections && musicAnalysis.structure.sections.length > 0;
    // Generate enough scenes for all clips (default to 10 scenes for optimal variety)
    const targetSceneCount = targetClipCount || 10;

    const musicContext = hasMusicAnalysis
      ? `

MUSIC ANALYSIS:
- Mood: ${musicAnalysis.mood || 'neutral'}
- BPM: ${musicAnalysis.bpm || 'unknown'}
- Energy Level: ${musicAnalysis.energy?.[0] || 0.5}
- Visual Style: ${musicAnalysis.visualStyle || 'cinematic'}
- Genre: ${musicAnalysis.genre || 'unknown'}
- Structure: ${JSON.stringify(musicAnalysis.structure?.sections || [])}

CRITICAL REQUIREMENTS:
Generate scenes that synchronize with the music structure. Each scene MUST:
1. Match a specific music section (intro, verse, chorus, bridge, outro, etc.)
2. Reflect the music's mood and energy level
3. Include visual style suggestions that complement the music
4. Align the script content to appropriate sections (e.g., dramatic moments on chorus, calm moments on intro)
5. Have startTime and endTime matching the music section times
6. ADAPT SHOT TYPE based on music intensity:
   - Intro/Verse (low-medium energy): WIDE shots to establish setting
   - Chorus/Bridge (high energy): CLOSE-UP shots for intensity and emotion
   - Outro (medium energy): MEDIUM shots for resolution
7. MATCH CAMERA MOVEMENT to music tempo/BPM:
   - Low BPM (<90): Slow dolly, gentle crane, subtle tracking
   - Medium BPM (90-130): Smooth tracking, steady pans, medium crane
   - High BPM (>130): Dynamic handheld, quick whip pans, fast tracking
8. SET ACTION INTENSITY based on energy level:
   - Low energy (0.0-0.3): Slow, contemplative movements (standing, observing, slow walk)
   - Medium energy (0.3-0.7): Moderate action (walking, gesturing, turning)
   - High energy (0.7-1.0): Dynamic, fast-paced action (running, combat, dramatic gestures)

Return EXACTLY ${targetSceneCount} scenes, one for each music section.
`
      : `
Generate ${targetSceneCount} diverse scenes that capture the key moments of the script.
Each scene should have a description and visual style suggestion.
`;

    // Select emotional arc based on BPM and mood
    const selectedArc = selectEmotionalArc(musicAnalysis?.bpm || 120, musicAnalysis?.mood || 'neutral');
    const arcInfo = EMOTIONAL_ARCS[selectedArc];

    const systemPrompt = hasMusicAnalysis
      ? `You are a MASTER STORYTELLING ENGINE using the "FIRE VIDEO FORMULA" - a research-backed framework combining:
- Dan Harmon's 8-Beat Story Circle
- Blake Snyder's Save the Cat beat structure  
- Joseph Campbell's Hero's Journey
- Cinematic prompt engineering for AI video generation

═══════════════════════════════════════════════════════════════════════════
🔥 FIRE VIDEO FORMULA - CREATE COMPELLING VISUAL STORIES
═══════════════════════════════════════════════════════════════════════════

SELECTED EMOTIONAL ARC: "${arcInfo.name}" (${arcInfo.bestFor})
This arc follows the pattern: ${arcInfo.pattern.map((v, i) => `Beat${i + 1}:${(v * 100).toFixed(0)}%`).join(' → ')}

8-BEAT STORY STRUCTURE (Map scenes to these beats):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Beat 1 (0-12%): "YOU" - COMFORT ZONE
  → Wide establishing shot, slow pan, neutral lighting
  → Show character in their ordinary world
  
Beat 2 (12-25%): "NEED" - WANT SOMETHING  
  → Medium shot, dolly in, soft lighting building
  → Introduce desire/goal/problem
  
Beat 3 (25-37%): "GO" - CROSS THE THRESHOLD
  → Tracking shot forward, anticipation lighting
  → Character enters unfamiliar territory
  
Beat 4 (37-50%): "SEARCH" - FACE OBSTACLES
  → Dynamic handheld, high contrast, tension building
  → Character struggles, learns, adapts
  
Beat 5 (50-65%): "FIND" - GET WHAT THEY WANTED
  → Reveal shot, dramatic lighting
  → Achievement moment (but at a cost)
  
Beat 6 (65-80%): "TAKE" - PAY THE PRICE ⚡ CLIMAX ⚡
  → CLOSE-UP, slow-motion, rim lighting with deep shadows
  → PEAK EMOTIONAL INTENSITY - This is the most important scene!
  → Maximum drama, sacrifice, transformation moment
  
Beat 7 (80-92%): "RETURN" - HEAD BACK  
  → Crane up wide shot, cathartic lighting
  → Character returns changed, releases tension
  
Beat 8 (92-100%): "CHANGE" - TRANSFORMED
  → Slow pull back wide, resolution lighting
  → Show new status quo, character has grown

═══════════════════════════════════════════════════════════════════════════
CINEMATIC PROMPT FORMULA (Use for EVERY scene):
[SUBJECT] + [ACTION VERB] + [CAMERA MOVEMENT] + [LIGHTING] + [MOOD]
═══════════════════════════════════════════════════════════════════════════

CAMERA MOVEMENTS BY BPM (Current: ${musicAnalysis?.bpm || 120} BPM):
${
  (musicAnalysis?.bpm || 120) > 140
    ? '→ HIGH ENERGY: Rapid handheld, whip pans, fast tracking, quick cuts'
    : (musicAnalysis?.bpm || 120) > 100
      ? '→ MEDIUM ENERGY: Smooth steadicam, dolly shots, controlled crane'
      : '→ LOW ENERGY: Slow dolly, gentle drift, static with subtle push'
}

🚨 CRITICAL: NARRATIVE JOURNEY = VISUAL JOURNEY 🚨
Each scene MUST show a DIFFERENT ENVIRONMENT based on what the lyrics describe.
The character should TRAVEL through the story - NOT stay in one place!

ENVIRONMENT EXTRACTION FROM LYRICS (MANDATORY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Parse lyrics for location words and CREATE DISTINCT ENVIRONMENTS:
- "barren lands" / "wasteland" → vast desert dunes, cracked earth, sand storms
- "mountains" / "peaks" → snow-capped mountains, rocky cliffs, mountain passes
- "city" / "kingdom" / "walls" → ancient stone city, towering walls, marketplaces
- "river" / "waters" → rushing river, delta marshlands, waterfall canyon
- "forest" / "trees" → dense ancient forest, misty woodland paths
- "ocean" / "sea" / "shores" → coastal cliffs, stormy seas, sandy beaches
- "battlefield" / "war" → muddy battlefield, siege warfare, burning ramparts
- "temple" / "sacred" → ancient temple ruins, columned halls, altar chambers
- "night" / "stars" → moonlit landscapes, starfield sky, torch-lit scenes
- "dawn" / "sunrise" → golden hour lighting, morning mist, long shadows

IF the same lyric phrase appears across scenes, show PROGRESSION:
- "walking the path" in Scene 1 → forest path
- "walking the path" in Scene 3 → mountain path  
- "walking the path" in Scene 5 → desert path

EVERY scene description MUST START with the specific environment/location.

ALSO EXTRACT:
- ACTIONS: What characters ARE DOING (verbs, movements, gestures)
- CONFLICT: Choreograph any combat/tension with specific moves
- ATMOSPHERE: Environmental mood, weather, time of day
- EFFECTS: Any mentioned visual elements (particles, weather, lighting)

NEVER INCLUDE: cars, vehicles, automobiles, driving, roads, traffic
(Ryder is a SPACE COWBOY name, NOT related to cars/vehicles)

Respond in JSON format with:
{
  "summary": "Overall story summary",
  "keyMoments": ["moment1", "moment2", ...],
  "emotions": ["emotion1", "emotion2", ...],
  "sceneCount": ${targetSceneCount},
  "estimatedDuration": <total duration in seconds>,
  "scenes": [
    {
      "description": "ULTRA-DETAILED visual description with specific actions, environment, camera work, lighting, and character movements pulled directly from lyrics",
      "musicSection": "intro|verse|chorus|bridge|outro|etc",
      "startTime": <number in seconds>,
      "endTime": <number in seconds>,
      "mood": "calm|mysterious|intense|uplifting|etc",
      "energyLevel": <0.0 to 1.0>,
      "visualStyle": "cinematic wide shots|slow tracking|quick cuts|etc",
      "shotType": "wide|medium|close-up (based on music intensity)",
      "cameraMovement": "specific camera movement matching BPM (dolly, crane, tracking, handheld, pan, etc)",
      "actionIntensity": "low|medium|high (based on energy level)"
    }
  ]
}`
      : `You are a storytelling analyst using the "Storytelling River" framework. Analyze scripts for:
1. Stepping stones (key narrative moments)
2. Forward motion (story progression)
3. Emotional arcs
4. Visual needs for cinematography

Respond in JSON format with:
{
  "summary": "Overall story summary",
  "keyMoments": ["moment1", "moment2", ...],
  "emotions": ["emotion1", "emotion2", ...],
  "sceneCount": ${targetSceneCount},
  "estimatedDuration": <estimated duration in seconds>,
  "scenes": [
    {
      "description": "Visual description of scene",
      "mood": "calm|mysterious|intense|etc",
      "energyLevel": <0.0 to 1.0>,
      "visualStyle": "cinematic style description",
      "shotType": "wide|medium|close-up",
      "cameraMovement": "camera movement description",
      "actionIntensity": "low|medium|high"
    }
  ]
}`;

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { maxOutputTokens: 8192, responseMimeType: 'application/json' },
      systemInstruction: systemPrompt,
    });

    const geminiResponse = await withTimeout(
      model.generateContent(`Analyze this script:${musicContext}

SCRIPT:
${scriptContent}`),
      45000, // 45 seconds (below database timeout to prevent crashes)
      'Gemini script analysis timed out after 45 seconds',
    );

    const content = geminiResponse.response.text() || '{}';
    const analysis = JSON.parse(content) as SceneAnalysis;

    if (!analysis.scenes || analysis.scenes.length === 0) {
      return generateFallbackAnalysis(scriptContent, musicAnalysis);
    }

    if (hasMusicAnalysis && musicAnalysis.structure?.sections) {
      const sections = musicAnalysis.structure.sections;
      analysis.scenes = analysis.scenes.map((scene, i) => {
        if (i < sections.length && !scene.startTime && !scene.endTime) {
          return {
            ...scene,
            musicSection: sections[i].type,
            startTime: sections[i].start,
            endTime: sections[i].end,
          };
        }
        return scene;
      });
    }

    analysis.sceneCount = analysis.scenes.length;

    return analysis;
  } catch (error) {
    console.error('Script analysis error:', error);
    return generateFallbackAnalysis(scriptContent, musicAnalysis);
  }
}

function generateFallbackAnalysis(scriptContent: string, musicAnalysis?: MusicAnalysis): SceneAnalysis {
  const hasMusicAnalysis =
    musicAnalysis && musicAnalysis.structure?.sections && musicAnalysis.structure.sections.length > 0;
  const sections = musicAnalysis?.structure?.sections || [];
  const targetCount = hasMusicAnalysis ? sections.length : 6;

  const baseScenes: Scene[] = [];

  if (hasMusicAnalysis) {
    sections.forEach((section, i) => {
      baseScenes.push({
        description: `Scene ${i + 1}: ${section.type} section - ${scriptContent.slice(0, 100)}...`,
        musicSection: section.type,
        startTime: section.start,
        endTime: section.end,
        mood: musicAnalysis.mood || 'neutral',
        energyLevel: musicAnalysis.energy?.[0] || 0.5,
        visualStyle: musicAnalysis.visualStyle || 'cinematic',
      });
    });
  } else {
    for (let i = 0; i < targetCount; i++) {
      baseScenes.push({
        description: `Scene ${i + 1}: ${scriptContent.slice(i * 20, (i + 1) * 20 + 50)}...`,
        mood: 'neutral',
        energyLevel: 0.5,
        visualStyle: 'cinematic',
      });
    }
  }

  return {
    summary: 'Script analysis unavailable - using fallback',
    keyMoments: baseScenes.map((_, i) => `Moment ${i + 1}`),
    emotions: ['neutral'],
    sceneCount: targetCount,
    estimatedDuration: hasMusicAnalysis ? Math.floor(sections[sections.length - 1]?.end || 48) : 48,
    scenes: baseScenes,
  };
}

export const storytellingRiverAnalyzer = {
  analyzeScript,
};
