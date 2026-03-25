/**
 * 🎬 LYRIC ACTION EXTRACTOR v2.0
 * Extracts SPECIFIC, DISTINCT actions from each lyric line for VEO video generation
 *
 * Key improvements:
 * 1. Extracts VERB-BASED actions, not descriptions
 * 2. Tracks story progression to prevent duplicate scenes
 * 3. Rejects generic actions in favor of specific ones
 * 4. Outputs action-first prompts for VEO
 */

import { openaiService } from './openai-service';

export interface LyricAction {
  clipIndex: number;
  timestamp: string;
  lyricText: string;

  // Core action elements
  subject: string; // WHO is doing the action (specific name)
  verb: string; // WHAT they're doing (active verb)
  object: string; // Target of the action (if any)
  setting: string; // WHERE it happens (specific location)

  // Visual details
  bodyPosition: string; // How the body is positioned
  movement: string; // Direction/type of movement
  emotionalState: string; // Internal emotion driving the action
  visualIntensity: 'calm' | 'building' | 'peak' | 'falling';

  // VEO-ready prompt parts
  actionPhrase: string; // The complete action sentence for VEO prompt
  cameraGuidance: string; // Suggested camera for this action

  // Quality control
  isSpecific: boolean; // Flag if this is truly specific vs generic
  confidence: number; // 0-1 confidence in extraction
}

export interface StoryProgression {
  previousScenes: string[]; // Actions shown in previous clips
  narrativePhase: 'origin' | 'struggle' | 'rise' | 'peak' | 'fall' | 'legacy';
  emotionalArc: 'building' | 'climax' | 'resolution';
  ageProgression: 'young' | 'prime' | 'aged' | 'various';
}

// Action categories for variety enforcement
const ACTION_CATEGORIES = {
  movement: ['riding', 'walking', 'running', 'marching', 'fleeing', 'approaching', 'departing'],
  combat: ['fighting', 'attacking', 'defending', 'charging', 'conquering', 'besieging'],
  emotional: ['grieving', 'celebrating', 'reflecting', 'raging', 'praying'],
  interaction: ['speaking', 'commanding', 'negotiating', 'embracing', 'confronting'],
  transformation: ['aging', 'changing', 'rising', 'falling', 'dying'],
  observation: ['watching', 'surveying', 'discovering', 'witnessing'],
};

// Generic actions to REJECT
const GENERIC_ACTIONS = [
  'present in scene',
  'performing',
  'standing',
  'appearing',
  'being shown',
  'in the scene',
  'looking at camera',
  'present',
  'visible',
  'shown',
];

/**
 * Extract specific actions from lyrics with story progression tracking
 */
export async function extractActionsFromLyrics(
  lyrics: string,
  characterName: string,
  clipIndex: number,
  totalClips: number,
  storyProgression: StoryProgression,
  context?: {
    isHistorical?: boolean;
    topic?: string;
    sectionType?: string;
  },
): Promise<LyricAction> {
  // Calculate narrative phase based on clip position
  const progressPercent = (clipIndex / totalClips) * 100;
  let narrativePhase: StoryProgression['narrativePhase'] = 'origin';
  if (progressPercent < 15) narrativePhase = 'origin';
  else if (progressPercent < 35) narrativePhase = 'struggle';
  else if (progressPercent < 55) narrativePhase = 'rise';
  else if (progressPercent < 75) narrativePhase = 'peak';
  else if (progressPercent < 90) narrativePhase = 'fall';
  else narrativePhase = 'legacy';

  // Build exclusion list from previous scenes
  const excludeActions = storyProgression.previousScenes.slice(-5).join(', ');

  const extractionPrompt = `Extract the SPECIFIC VISUAL ACTION from these lyrics for a music video clip.

LYRICS TO ANALYZE:
"${lyrics}"

CHARACTER: ${characterName}
CLIP: ${clipIndex + 1} of ${totalClips}
NARRATIVE PHASE: ${narrativePhase.toUpperCase()}
SECTION TYPE: ${context?.sectionType || 'verse'}
${context?.isHistorical ? 'HISTORICAL FIGURE: Use period-accurate actions and settings' : ''}

🚫 ACTIONS TO AVOID (already shown in previous clips):
${excludeActions || 'None yet - this is the first clip'}

NARRATIVE PHASE GUIDANCE:
- ORIGIN: Birth, childhood trauma, formative moments (show youth, early struggles)
- STRUGGLE: Survival, escape, early fights, building power (show determination)
- RISE: Victories, conquest, expansion, gaining followers (show action and scale)
- PEAK: Maximum power, glory, achievements (show grandeur and command)
- FALL: Betrayal, loss, aging, mortality (show vulnerability)
- LEGACY: Death, what remains, final moments (show passing and impact)

Extract a SINGLE, SPECIFIC action that:
1. LITERALLY matches what the lyrics describe
2. Shows MOVEMENT and ACTION (not just standing/looking)
3. Is DIFFERENT from previous clips
4. Fits the ${narrativePhase} phase of the story
5. Can be filmed in 5-8 seconds

Return ONLY valid JSON:
{
  "subject": "${characterName}",
  "verb": "active present-tense verb (riding, fighting, grieving, etc.)",
  "object": "target of action if any",
  "setting": "specific location/environment",
  "bodyPosition": "how the body is positioned (on horseback, kneeling, standing tall)",
  "movement": "direction/type of motion (charging forward, collapsing, rising)",
  "emotionalState": "internal emotion (fury, grief, triumph)",
  "visualIntensity": "calm|building|peak|falling",
  "actionPhrase": "Complete sentence: [SUBJECT] [VERB] [DETAILS]. E.g. 'Genghis Khan charges on horseback across the burning steppe, sword raised'",
  "cameraGuidance": "Camera suggestion: e.g. 'tracking shot following the horse'",
  "isSpecific": true,
  "confidence": 0.9
}

⚠️ CRITICAL RULES:
1. The "actionPhrase" MUST describe visible motion/action
2. NO generic actions like "stands dramatically" or "appears powerful"
3. Use ACTIVE VERBS: rides, fights, weeps, charges, falls, rises, commands
4. If lyrics say "I conquered" → show the conquest happening
5. If lyrics say "my father died" → show the death/grief scene
6. Each clip MUST show something DIFFERENT from previous clips`;

  try {
    const response = await openaiService.generateText(extractionPrompt, {
      temperature: 0.5,
      maxTokens: 800,
    });

    // Parse response
    let jsonStr = response.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);

    // Validate the action is specific
    const isGeneric = GENERIC_ACTIONS.some(
      (g) => (parsed.verb || '').toLowerCase().includes(g) || (parsed.actionPhrase || '').toLowerCase().includes(g),
    );

    if (isGeneric) {
      console.warn(`   ⚠️ Extracted generic action for clip ${clipIndex + 1}, enhancing...`);
      parsed.isSpecific = false;
    }

    const result: LyricAction = {
      clipIndex,
      timestamp: '', // Will be set by caller
      lyricText: lyrics,
      subject: parsed.subject || characterName,
      verb: parsed.verb || 'moves',
      object: parsed.object || '',
      setting: parsed.setting || 'historical setting',
      bodyPosition: parsed.bodyPosition || 'dynamic stance',
      movement: parsed.movement || 'purposeful motion',
      emotionalState: parsed.emotionalState || 'intense',
      visualIntensity: parsed.visualIntensity || 'building',
      actionPhrase: parsed.actionPhrase || `${characterName} in motion`,
      cameraGuidance: parsed.cameraGuidance || 'dynamic tracking shot',
      isSpecific: parsed.isSpecific !== false && !isGeneric,
      confidence: parsed.confidence || 0.7,
    };

    console.log(`   🎬 Clip ${clipIndex + 1} Action: "${result.actionPhrase.substring(0, 60)}..."`);

    return result;
  } catch (error) {
    console.error(`   ❌ Action extraction failed for clip ${clipIndex + 1}:`, error);

    // Create fallback with narrative phase context
    const phaseFallbacks: Record<string, string> = {
      origin: `Young ${characterName} survives harsh conditions in the wilderness`,
      struggle: `${characterName} fights desperately against overwhelming odds`,
      rise: `${characterName} leads warriors charging across the battlefield`,
      peak: `${characterName} surveys conquered territory from horseback`,
      fall: `${characterName} faces betrayal with weathered determination`,
      legacy: `${characterName} breathes final breath, legacy echoing forward`,
    };

    return {
      clipIndex,
      timestamp: '',
      lyricText: lyrics,
      subject: characterName,
      verb: narrativePhase === 'origin' ? 'survives' : 'acts',
      object: '',
      setting: 'appropriate historical setting',
      bodyPosition: 'dynamic stance',
      movement: 'purposeful motion',
      emotionalState: 'intense',
      visualIntensity: 'building',
      actionPhrase: phaseFallbacks[narrativePhase] || `${characterName} in commanding action`,
      cameraGuidance: 'epic tracking shot',
      isSpecific: false,
      confidence: 0.3,
    };
  }
}

/**
 * Extract ALL actions for a song with variety enforcement
 */
export async function extractAllLyricActions(
  sections: Array<{ content: string; type: string; startTime: number; endTime: number }>,
  characterName: string,
  isHistorical: boolean = false,
): Promise<LyricAction[]> {
  console.log(`🎬 EXTRACTING ACTIONS for ${sections.length} sections...`);

  const allActions: LyricAction[] = [];
  const storyProgression: StoryProgression = {
    previousScenes: [],
    narrativePhase: 'origin',
    emotionalArc: 'building',
    ageProgression: 'young',
  };

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];

    const action = await extractActionsFromLyrics(
      section.content,
      characterName,
      i,
      sections.length,
      storyProgression,
      {
        isHistorical,
        topic: characterName,
        sectionType: section.type,
      },
    );

    // Update timestamp
    action.timestamp = `${Math.floor(section.startTime / 60)}:${String(Math.floor(section.startTime % 60)).padStart(2, '0')}`;

    // Add to story progression for next iteration
    storyProgression.previousScenes.push(action.actionPhrase);

    // Update narrative phase for next clip
    const progressPercent = ((i + 1) / sections.length) * 100;
    if (progressPercent < 15) storyProgression.narrativePhase = 'origin';
    else if (progressPercent < 35) storyProgression.narrativePhase = 'struggle';
    else if (progressPercent < 55) storyProgression.narrativePhase = 'rise';
    else if (progressPercent < 75) storyProgression.narrativePhase = 'peak';
    else if (progressPercent < 90) storyProgression.narrativePhase = 'fall';
    else storyProgression.narrativePhase = 'legacy';

    allActions.push(action);
  }

  // Log variety analysis
  const uniqueVerbs = new Set(allActions.map((a) => a.verb));
  console.log(`   ✅ Extracted ${allActions.length} actions with ${uniqueVerbs.size} unique verbs`);
  console.log(`   📊 Verb variety: ${Array.from(uniqueVerbs).slice(0, 8).join(', ')}...`);

  return allActions;
}

/**
 * Build ACTION-FIRST VEO prompt from extracted action
 * The action is the FIRST thing in the prompt, not buried in context
 */
export function buildActionFirstPrompt(
  action: LyricAction,
  characterAppearance: string,
  styleGuidance: string,
): string {
  // ACTION IS FIRST - literally the opening of the prompt
  return `${action.actionPhrase}

CHARACTER: ${action.subject}, ${characterAppearance}
BODY: ${action.bodyPosition}, ${action.movement}
EMOTION: ${action.emotionalState} intensity
SETTING: ${action.setting}
CAMERA: ${action.cameraGuidance}

${styleGuidance}

(No text, no subtitles, pure visual storytelling)`;
}

/**
 * Validate action variety across all clips
 * Returns clips that need re-generation due to duplicates
 */
export function validateActionVariety(actions: LyricAction[]): number[] {
  const duplicateIndices: number[] = [];
  const seenActions = new Set<string>();

  for (const action of actions) {
    // Normalize action for comparison
    const normalized = action.verb.toLowerCase() + '_' + action.setting.toLowerCase().substring(0, 20);

    if (seenActions.has(normalized)) {
      duplicateIndices.push(action.clipIndex);
    } else {
      seenActions.add(normalized);
    }
  }

  if (duplicateIndices.length > 0) {
    console.warn(`   ⚠️ Found ${duplicateIndices.length} duplicate actions at clips: ${duplicateIndices.join(', ')}`);
  }

  return duplicateIndices;
}
