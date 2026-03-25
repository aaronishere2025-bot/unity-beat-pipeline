/**
 * Cohesive Prompt Generator (Gemini)
 *
 * Generates all Kling video prompts in a single Gemini API call with full
 * lyric-synced narrative context. Each 5-second clip prompt is matched to
 * the exact lyrics playing during that window.
 *
 * Uses Gemini 2.5 Flash for fast, cost-effective generation.
 */

import { GoogleGenAI } from '@google/genai';
import type { FullTrackContext } from './full-track-narrative-mapper';
import {
  buildVisualStoryOutline,
  buildCompactContext,
  buildMultiShotVisualOutline,
} from './full-track-narrative-mapper';
import type { SceneGroup } from './full-track-narrative-mapper';
import { KLING_GROUNDED_PROMPT, validateAndCompressPrompt } from './gpt-cinematic-director';
import { apiCostTracker } from './api-cost-tracker';

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: '',
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

const GEMINI_MODEL = 'gemini-2.5-flash';

export interface CohesiveVideoSegment {
  clip_index: number;
  timestamp: number;
  lyric: string;
  visual_concept: string;
  prompt: string;
  negative_prompt: string;
  continuity_notes: string;
  mood: string;
  section: string;
}

/**
 * Helper to add timeout to promises
 */
function withTimeout<T>(promise: Promise<T>, ms: number, error: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(error)), ms))]);
}

/**
 * Parse JSON response with error handling - strips markdown code fences if present
 */
function parseJsonResponse<T>(content: string): T {
  // Strip markdown code fences (```json ... ```) that Gemini sometimes adds
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse Gemini response as JSON: ${cleaned.slice(0, 200)}...`);
  }
}

/**
 * Get era-specific constraints
 */
function getEraConstraints(era: string): {
  centuryDescription: string;
  allowedTransport: string[];
  forbiddenItems: string[];
  periodNegative: string;
} {
  const eraLower = era.toLowerCase();

  if (eraLower.includes('ancient') || eraLower.includes('roman') || eraLower.includes('bc')) {
    return {
      centuryDescription: 'ancient world (before 500 AD)',
      allowedTransport: ['horse', 'chariot', 'ship', 'camel'],
      forbiddenItems: ['gun', 'cannon', 'clock', 'glass windows'],
      periodNegative: 'medieval, renaissance, industrial, modern, gun, cannon, clock',
    };
  }

  if (
    eraLower.includes('medieval') ||
    eraLower.includes('middle age') ||
    eraLower.includes('1200') ||
    eraLower.includes('1300')
  ) {
    return {
      centuryDescription: 'medieval period (500-1500 AD)',
      allowedTransport: ['horse', 'cart', 'ship', 'camel'],
      forbiddenItems: ['gun', 'cannon', 'automobile', 'electricity'],
      periodNegative: 'modern, industrial, gun, automobile, electricity, neon',
    };
  }

  return {
    centuryDescription: 'modern era',
    allowedTransport: [],
    forbiddenItems: [],
    periodNegative: '',
  };
}

/**
 * Generate ALL video prompts in a single cohesive Gemini API call.
 *
 * Each clip's prompt is synced to the exact lyrics playing during that 5-second window.
 */
export async function generateCohesivePrompts(context: FullTrackContext): Promise<CohesiveVideoSegment[]> {
  console.log(`\n🎬 COHESIVE PROMPT GENERATION (Gemini)`);
  console.log(`   Figure: ${context.figure}`);
  console.log(`   Duration: ${context.duration}s`);
  console.log(`   Clips: ${context.clipTimings.length}`);
  console.log(`   Model: ${GEMINI_MODEL}`);

  // Build visual story outline with lyric-to-clip mapping
  const visualOutline = buildVisualStoryOutline(context);
  const compactContext = buildCompactContext(context);

  console.log(`   Context: ${compactContext}`);

  // Get era constraints
  const eraConstraints = getEraConstraints(context.era);
  const isModernEra = eraConstraints.forbiddenItems.length === 0;

  const eraConstraintText = isModernEra
    ? ''
    : `
⚠️ CRITICAL ERA CONSTRAINT: This is set in the ${eraConstraints.centuryDescription}.
- ONLY these transport allowed: ${eraConstraints.allowedTransport.join(', ')}
- ABSOLUTELY FORBIDDEN: ${eraConstraints.forbiddenItems.join(', ')}
STRICTLY period-accurate - no anachronisms.`;

  const systemPrompt =
    KLING_GROUNDED_PROMPT +
    `\n\n## 🎬 LYRIC-SYNCED COHESIVE GENERATION

You are generating ALL prompts for a complete video in ONE call.
Each 5-second clip MUST visually depict what the lyrics describe at that exact moment.

## #1 RULE: LITERAL SCENE DEPICTION (MANDATORY)
For each clip, you will see the EXACT lyrics playing during that 5-second window.
Your prompt MUST show the SPECIFIC ACTIVITY described in those lyrics — not a generic pose.

HOW TO MATCH:
1. Read the lyrics for the clip
2. Determine if the lyrics are LITERAL or FIGURATIVE:
   - LITERAL lyrics describe a real action (crossing desert, fighting battle, building a city) → Show that EXACT scene
   - FIGURATIVE lyrics use metaphor (fire in my veins, heart of a lion, crown weighs heavy) → Translate to a grounded physical visual (see metaphor table in KLING rules above)
3. Extract the SPECIFIC ACTIVITY and SETTING from the lyrics
4. Show the figure PHYSICALLY DOING that activity in the correct setting
5. The viewer must HEAR the lyrics and SEE exactly what they describe happening on screen

CRITICAL — DO NOT:
- Show generic "power poses" or "standing regally" when lyrics describe a specific action
- Use a throne room when lyrics describe a battlefield, desert, ocean, or other location
- Ignore the WHAT and WHERE of the lyrics — if they say "crossed the Sahara", show desert, not palace
- Default to the same generic scene for every clip — each clip's visual MUST change to match its lyrics

LITERAL LYRICS → LITERAL VISUALS:
- "crossed the Sahara carrying gold" → Figure on camelback crossing vast desert, gold-laden caravan behind
- "conquered the eastern lands" → Figure leading cavalry charge across eastern landscape with region-accurate architecture
- "built the great mosque" → Figure overseeing construction, workers hauling stone, scaffolding on rising structure
- "sailed across the ocean" → Figure standing at bow of period-accurate ship, ocean waves, crew in background
- "studied the stars" → Figure in observatory/rooftop at night, astronomical instruments, star-filled sky
- "developed a cure" → Figure in period-appropriate workspace examining specimens, herbs, scrolls
- "fed the poor" → Figure distributing food/gold to kneeling people in marketplace
- "wrote the law" → Figure at desk with quill, parchment, intense focus, candlelight

FIGURATIVE LYRICS → GROUNDED VISUALS:
- "fire in my veins" → Intense stare, clenched fists, sweat on brow, veins visible on forearms
- "heart of a lion" → Fearless battle cry, chest forward, charging into danger
- "crown weighs heavy" → Hand on temple, exhausted expression, alone on throne
- "empire crumbles" → Dust falling from ceiling cracks, crumbling stone, figure watching helplessly
- "ghost of my father" → Looking at empty throne or portrait, hand reaching out to nothing
- "wolf among sheep" → Lone warrior striding confidently through fearful crowd

## #2 RULE: CULTURAL & GEOGRAPHIC ACCURACY
- Show people, architecture, and landscapes accurate to the figure's heritage, region, and era
- If the figure is West African (Mansa Musa), show West African features, Malian/Saharan architecture, desert landscapes
- If conquering a specific region, show THAT region's geography and people
- Period-accurate clothing, weapons, buildings — no anachronisms
- Ethnically accurate depictions of the figure and surrounding people

## #3 RULE: COHESION
1. **Character appearance**: You MUST use the EXACT character description provided in CHARACTER VISUAL REFERENCE in every prompt. Do NOT paraphrase, summarize, or vary the character description. Copy it verbatim into each prompt's subject line.
2. **Smooth transitions**: Energy changes gradual, not jarring
3. **Recurring motifs**: Establish visual motifs early, bring them back
4. **Camera evolution**: Static → slow push → dynamic → slow pull → static

OUTPUT FORMAT:
Return ONLY valid JSON (no markdown, no code fences): { "prompts": [...] } with ${context.clipTimings.length} prompts:
{
  "prompts": [
    {
      "clip_index": 0,
      "timestamp": 0.0,
      "lyric": "the exact lyrics for this clip window",
      "visual_concept": "1-line: the SPECIFIC ACTIVITY from the lyrics this clip shows (not a generic description)",
      "prompt": "Kling-safe prompt depicting the specific lyric activity with culturally accurate setting (50-75 words). MUST end with: photorealistic, 35mm film grain, natural skin texture, shallow depth of field",
      "negative_prompt": "Things to avoid",
      "continuity_notes": "Visual elements to maintain from previous clips",
      "mood": "establishing/building/peak/resolve",
      "section": "intro/verse/chorus/etc"
    }
  ]
}`;

  const userPrompt = `${visualOutline}

${eraConstraintText}

Generate ALL ${context.clipTimings.length} prompts. For EACH clip:
1. Read the LYRICS for that clip's time window
2. Identify: Is this LITERAL (real action) or FIGURATIVE (metaphor)?
3. LITERAL → Show the EXACT activity described (crossing desert, building, fighting, sailing, studying)
4. FIGURATIVE → Translate to grounded physical visual (metaphor table above)
5. NEVER default to generic poses — each clip must show a DIFFERENT scene matching its lyrics
6. Include culturally accurate setting, geography, and people for the figure's heritage and era

WRONG: Every clip shows figure standing in throne room regardless of lyrics
RIGHT: Clip lyrics say "crossed the desert" → desert scene. Lyrics say "built the mosque" → construction scene.

The viewer will HEAR these lyrics while WATCHING your clips — if they don't match, the video fails.

Output as JSON: { "prompts": [...] }`;

  const startTime = Date.now();

  try {
    console.log(`   🤖 Calling ${GEMINI_MODEL} with full lyric-synced narrative context...`);

    const response = await withTimeout(
      gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        config: {
          temperature: 0.7,
          maxOutputTokens: 8000,
          responseMimeType: 'application/json',
        },
      }),
      120000,
      'Cohesive prompt generation timed out',
    );

    const responseText = response.text || '{}';

    // Track cost
    const usageMetadata = (response as any).usageMetadata;
    if (usageMetadata) {
      apiCostTracker.trackGemini({
        model: GEMINI_MODEL,
        operation: 'cohesive_prompt_generation',
        inputTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        success: true,
        metadata: {
          figure: context.figure,
          era: context.era,
          clipCount: context.clipTimings.length,
        },
      });
    }

    const result = parseJsonResponse<{ prompts: CohesiveVideoSegment[] }>(responseText);

    if (!result.prompts || !Array.isArray(result.prompts)) {
      throw new Error('Invalid response format: missing prompts array');
    }

    if (result.prompts.length !== context.clipTimings.length) {
      console.warn(`   ⚠️ Expected ${context.clipTimings.length} prompts, got ${result.prompts.length}`);
    }

    // Post-process: add standard negative prompt
    const STANDARD_NEGATIVE =
      'blurry, low quality, distorted faces, watermark, text overlay, multiple people in frame, crowds, glowing effects, VFX, magic, supernatural, abstract';

    for (const segment of result.prompts) {
      let finalNegative = STANDARD_NEGATIVE;

      if (!isModernEra && eraConstraints.periodNegative) {
        finalNegative += `, ${eraConstraints.periodNegative}`;
      }

      if (segment.negative_prompt) {
        finalNegative += `, ${segment.negative_prompt}`;
      }

      segment.negative_prompt = finalNegative;

      // Validate and compress prompt for Kling (strip --no flags, enforce 400 char limit, ensure style anchor)
      segment.prompt = validateAndCompressPrompt(segment.prompt);
    }

    const avgPromptLength = result.prompts.reduce((sum, p) => sum + p.prompt.length, 0) / result.prompts.length;
    const qualityScore = avgPromptLength > 80 ? 90 : avgPromptLength > 50 ? 75 : 60;

    const latency = Date.now() - startTime;

    console.log(`   ✅ Generated ${result.prompts.length} lyric-synced prompts in ${(latency / 1000).toFixed(1)}s`);
    console.log(`   📊 Quality Score: ${qualityScore}/100`);

    return result.prompts;
  } catch (genErr: any) {
    const latency = Date.now() - startTime;

    console.error(`   ❌ Cohesive generation failed: ${genErr.message}`);

    apiCostTracker.trackGemini({
      model: GEMINI_MODEL,
      operation: 'cohesive_prompt_generation',
      success: false,
      errorMessage: genErr.message,
    });

    throw genErr;
  }
}

// ═══════════════════════════════════════════════════════════════════
// MULTI-SHOT PROMPT GENERATION
// ═══════════════════════════════════════════════════════════════════

export interface CohesiveSceneGroup {
  group_index: number;
  shots: CohesiveVideoSegment[]; // individual shot prompts within the group
  combined_prompt: string; // "[Shot 1] ... [Shot 2] ... [Shot 3] ..."
  mood_arc: string;
  section_label: string;
}

/**
 * Generate multi-shot scene group prompts in a single Gemini API call.
 *
 * Groups clips into scene groups of N and generates per-shot prompts
 * with [Shot N] markers for Kling 3.0 multi-shot mode.
 */
export async function generateCohesiveMultiShotPrompts(
  context: FullTrackContext,
  shotsPerGroup: number = 3,
): Promise<CohesiveSceneGroup[]> {
  console.log(`\n🎬 MULTI-SHOT COHESIVE PROMPT GENERATION (Gemini)`);
  console.log(`   Figure: ${context.figure}`);
  console.log(`   Duration: ${context.duration}s`);
  console.log(
    `   Clips: ${context.clipTimings.length} -> ${Math.ceil(context.clipTimings.length / shotsPerGroup)} scene groups`,
  );
  console.log(`   Shots per group: ${shotsPerGroup}`);
  console.log(`   Model: ${GEMINI_MODEL}`);

  // Build multi-shot visual outline
  const { sceneGroups, outline: visualOutline } = buildMultiShotVisualOutline(context, shotsPerGroup);
  const compactContext = buildCompactContext(context);

  console.log(`   Context: ${compactContext}`);

  // Era constraints
  const eraConstraints = getEraConstraints(context.era);
  const isModernEra = eraConstraints.forbiddenItems.length === 0;

  const eraConstraintText = isModernEra
    ? ''
    : `
⚠️ CRITICAL ERA CONSTRAINT: This is set in the ${eraConstraints.centuryDescription}.
- ONLY these transport allowed: ${eraConstraints.allowedTransport.join(', ')}
- ABSOLUTELY FORBIDDEN: ${eraConstraints.forbiddenItems.join(', ')}
STRICTLY period-accurate - no anachronisms.`;

  const systemPrompt =
    KLING_GROUNDED_PROMPT +
    `\n\n## 🎬 MULTI-SHOT SCENE GROUP GENERATION

You are generating prompts for a video using Kling 3.0's MULTI-SHOT mode.
Instead of individual 5s clips, you generate SCENE GROUPS of ${shotsPerGroup} shots each.
Each scene group becomes ONE Kling API call — Kling handles transitions between shots natively.

## KEY DIFFERENCE FROM SINGLE-SHOT:
- Each group has ${shotsPerGroup} shots that FLOW NATURALLY into each other
- Kling will animate smooth transitions between shots — no hard cuts
- Shots within a group should share a VISUAL THREAD (same location, continuous action, or dramatic progression)
- Each shot still MUST match its specific lyrics

## #1 RULE: LYRIC-TO-VISUAL SYNC (same as single-shot)
Each shot MUST visually depict what the lyrics describe during that exact time window.

## #2 RULE: INTRA-GROUP FLOW
Shots within the same group should feel like a continuous scene:
- GOOD: Shot 1 shows soldier approaching gate, Shot 2 shows soldier walking through gate, Shot 3 shows soldier in courtyard
- BAD: Shot 1 shows battle, Shot 2 shows throne room, Shot 3 shows ocean (too disconnected for native transitions)
- If lyrics jump locations, use a connecting visual element (dust, light, character's gaze)

## #3 RULE: CHARACTER CONSISTENCY
${
  context.characterDescription
    ? `Use this EXACT character description in every shot: "${context.characterDescription}"`
    : 'Same character appearance across ALL shots'
}

OUTPUT FORMAT:
Return ONLY valid JSON: { "scene_groups": [...] } with ${sceneGroups.length} groups:
{
  "scene_groups": [
    {
      "group_index": 0,
      "section_label": "verse/chorus/etc",
      "mood_arc": "establishing -> building",
      "shots": [
        {
          "clip_index": 0,
          "timestamp": 0.0,
          "lyric": "the exact lyrics",
          "visual_concept": "specific activity from lyrics",
          "prompt": "Kling prompt for this shot (50-75 words). MUST end with: photorealistic, 35mm film grain, natural skin texture, shallow depth of field",
          "negative_prompt": "things to avoid",
          "continuity_notes": "visual thread connecting to adjacent shots",
          "mood": "establishing/building/peak/resolve",
          "section": "intro/verse/chorus/etc"
        }
      ],
      "combined_prompt": "[Shot 1] prompt text. [Shot 2] prompt text. [Shot 3] prompt text"
    }
  ]
}`;

  const userPrompt = `${visualOutline}

${eraConstraintText}

Generate ALL ${sceneGroups.length} scene groups with ${shotsPerGroup} shots each.

For EACH shot within a group:
1. Read the LYRICS for that shot's time window
2. Create a prompt that depicts the lyrics AND flows naturally with adjacent shots
3. Ensure visual thread between shots (same location evolving, continuous action, connected imagery)

For EACH scene group:
4. Write the combined_prompt as: "[Shot 1] <shot 1 prompt>. [Shot 2] <shot 2 prompt>. [Shot 3] <shot 3 prompt>"
5. The combined_prompt is what Kling receives — it must read as a coherent scene progression

Output as JSON: { "scene_groups": [...] }`;

  const startTime = Date.now();

  try {
    console.log(`   🤖 Calling ${GEMINI_MODEL} for multi-shot scene group prompts...`);

    const response = await withTimeout(
      gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: `${systemPrompt}\n\n---\n\n${userPrompt}`,
        config: {
          temperature: 0.7,
          maxOutputTokens: 10000,
          responseMimeType: 'application/json',
        },
      }),
      120000,
      'Multi-shot prompt generation timed out',
    );

    const responseText = response.text || '{}';

    // Track cost
    const usageMetadata = (response as any).usageMetadata;
    if (usageMetadata) {
      apiCostTracker.trackGemini({
        model: GEMINI_MODEL,
        operation: 'multishot_prompt_generation',
        inputTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        success: true,
        metadata: {
          figure: context.figure,
          era: context.era,
          sceneGroupCount: sceneGroups.length,
          shotsPerGroup,
        },
      });
    }

    const result = parseJsonResponse<{ scene_groups: CohesiveSceneGroup[] }>(responseText);

    if (!result.scene_groups || !Array.isArray(result.scene_groups)) {
      throw new Error('Invalid response: missing scene_groups array');
    }

    if (result.scene_groups.length !== sceneGroups.length) {
      console.warn(`   ⚠️ Expected ${sceneGroups.length} scene groups, got ${result.scene_groups.length}`);
    }

    // Post-process: validate prompts and add standard negative
    const STANDARD_NEGATIVE =
      'blurry, low quality, distorted faces, watermark, text overlay, multiple people in frame, crowds, glowing effects, VFX, magic, supernatural, abstract';

    for (const group of result.scene_groups) {
      for (const shot of group.shots) {
        let finalNegative = STANDARD_NEGATIVE;
        if (!isModernEra && eraConstraints.periodNegative) {
          finalNegative += `, ${eraConstraints.periodNegative}`;
        }
        if (shot.negative_prompt) {
          finalNegative += `, ${shot.negative_prompt}`;
        }
        shot.negative_prompt = finalNegative;
        shot.prompt = validateAndCompressPrompt(shot.prompt);
      }

      // Rebuild combined_prompt from validated per-shot prompts
      if (group.shots.length > 0) {
        group.combined_prompt = group.shots.map((shot, i) => `[Shot ${i + 1}] ${shot.prompt}`).join('. ');
      }
    }

    const totalShots = result.scene_groups.reduce((sum, g) => sum + g.shots.length, 0);
    const latency = Date.now() - startTime;

    console.log(
      `   ✅ Generated ${result.scene_groups.length} scene groups (${totalShots} shots) in ${(latency / 1000).toFixed(1)}s`,
    );

    return result.scene_groups;
  } catch (genErr: any) {
    console.error(`   ❌ Multi-shot prompt generation failed: ${genErr.message}`);

    apiCostTracker.trackGemini({
      model: GEMINI_MODEL,
      operation: 'multishot_prompt_generation',
      success: false,
      errorMessage: genErr.message,
    });

    throw genErr;
  }
}
