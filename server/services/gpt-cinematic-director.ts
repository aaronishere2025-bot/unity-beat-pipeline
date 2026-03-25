/**
 * KLING-GROUNDED CINEMATIC SYSTEM v2.0
 *
 * - Grounded prompts (no VFX, no magic)
 * - 5-second clip generation
 * - BPM-synced intervals from Librosa
 * - Lyric-matched visuals
 * - Analytics-driven pattern feedback loop
 * - Dynamic Model Router for intelligent AI model selection
 */

import { GoogleGenAI } from '@google/genai';
import { patternIntelligenceService } from './pattern-intelligence-service';
import { retentionOptimizer, PATTERN_INTERRUPT_TYPES, RetentionOptimization } from './retention-optimizer-service';
import type { TemporalNarrativeAtom } from './narrative-tna-service';
import { dynamicModelRouter } from './dynamic-model-router';
import { apiCostTracker } from './api-cost-tracker';

const gemini = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: '',
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

const GEMINI_MODEL = 'gemini-2.5-flash';

// ============================================================================
// TYPES
// ============================================================================

export interface LibrosaAnalysis {
  bpm: number;
  beatTimestamps: number[];
  downbeats: number[];
  sections: SectionMarker[];
  energy: number[];
  duration: number;
}

export interface SectionMarker {
  startTime: number;
  endTime: number;
  type: 'intro' | 'verse' | 'prechorus' | 'chorus' | 'bridge' | 'outro';
  energy: 'low' | 'medium' | 'high' | 'peak';
}

export interface VideoSegment {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  beatType: BeatType;
  musicalEnergy: 'low' | 'medium' | 'high' | 'peak';
  lyricLine: string;
  prompt: string;
  negativePrompt: string;
}

export interface LyricSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export type BeatType = 'hook' | 'setup' | 'rising' | 'conflict' | 'climax' | 'resolution' | 'hook_next';
export type Archetype = 'conqueror' | 'philosopher' | 'revolutionary' | 'ruler' | 'warrior' | 'innovator';

// Legacy interface for backward compatibility
export interface SegmentInput {
  segment_index: number;
  timestamp: string;
  beat_type: BeatType;
  lyric_line: string;
}

export interface BatchPromptResult {
  segment_index: number;
  timestamp: string;
  beat_type: string;
  lyric_excerpt: string;
  prompt: string;
  negative_prompt: string;
  visual_logic: string;
}

// ============================================================================
// CONTEXT-AWARE CONDITION INJECTION (CACI) INTERFACES
// ============================================================================

export interface CACIContext {
  globalNarrative: {
    plotArc: 'rising' | 'climax' | 'falling' | 'resolution';
    emotionalTone: string;
    editingStyle: 'shot-reverse' | 'montage' | 'continuous' | 'rhythmic';
  };
  localShot: {
    importance: 'hero' | 'supporting' | 'transition';
    hookMoment: boolean;
    patternInterruptTarget: boolean;
  };
  modalPriorities: {
    motion: number; // 0-100 priority for movement emphasis
    continuity: number; // 0-100 priority for character consistency
    cinematography: number; // 0-100 priority for camera work
    emotion: number; // 0-100 priority for emotional impact
  };
}

// ============================================================================
// GROUNDED SYSTEM PROMPT - No VFX, No Magic, Kling-Safe
// ============================================================================

export const KLING_GROUNDED_PROMPT = `You create Kling 3.0 video prompts for 15-SECOND CLIPS that match rap lyrics about historical figures.

## KLING 3.0 CAPABILITIES

Kling 3.0 is a major upgrade. It handles complex scenes, multiple characters, advanced camera work, and realistic physics (flowing water, fabric, anatomy). Use these capabilities fully.

## WHAT KLING 3.0 DOES WELL (USE THESE)

✅ FULLY SUPPORTED:
- Multiple characters interacting (up to 3-4 in a scene with clear subject focus)
- Complex camera movements (tracking, crane, drone, POV, whip pan, dolly zoom)
- Multi-shot sequences within a single clip (establish → close-up → action)
- Realistic physics (flowing water, fabric movement, natural hair/cape motion)
- Accurate human anatomy (hands, faces, body proportions)
- Rich atmospheric effects (dust, fog, smoke, rain, snow, fire, wind)
- Period costumes, armor, weapons with correct materials and movement
- Facial expressions, body language, physical acting with emotional range
- Epic landscape SCALE (vast armies, sweeping battlefields, towering architecture)
- Grounded realism (blood, dirt, sweat, weathered faces, scars)
- Character consistency across cuts when using reference images

## STILL AVOID:

❌ FORBIDDEN:
- Fantasy/supernatural VFX (glowing auras, energy beams, magic, morphing)
- Text, symbols, or numbers appearing in scene
- Abstract metaphors made literal ("death as figure", "time freezing")
- Transformation or shapeshifting
- Anachronisms (items that didn't exist in the figure's time period - check era constraints)

## TRANSLATING LYRIC METAPHORS TO GROUNDED VISUALS

| Lyric Metaphor | ❌ Wrong (VFX) | ✅ Right (Grounded) |
|----------------|----------------|---------------------|
| "reaper kept score" | Grim reaper appears | Surveys battlefield of bodies |
| "40 million souls" | Souls floating | Endless fallen stretching to horizon |
| "blood on my hands" | Glowing blood | Actual blood dripping from hands |
| "crown weighs heavy" | Crown glowing/sinking | Hand on temple, exhausted expression |
| "fire in my veins" | Veins glowing | Intense stare, clenched fists, sweating |
| "empire crumbles" | Buildings morphing | Dust falling, cracks in throne |
| "ghost of my father" | Ghost appears | Looking at empty throne/portrait |
| "darkness rising" | Shadow VFX | Storm clouds, fading sunlight |
| "heart of a lion" | Lion appears | Roaring battle cry, fearless charge |
| "eagle soars" | Eagle appears | Arms spread wide on cliff, wind billowing cape |
| "wolf among sheep" | Wolf appears | Lone warrior striding through fearful crowd |
| "snake in the grass" | Snake appears | Crouching figure hidden in tall grass, plotting |
| "bear of a man" | Bear appears | Massive warrior with broad shoulders, towering |
| "hawk eye" | Hawk appears | Intense narrowed gaze scanning horizon |
| "serpent's tongue" | Serpent appears | Whispering figure leaning close, persuasive |
| "dragon's fury" | Dragon appears | Raging warrior destroying surroundings |
| "rise like a phoenix" | Phoenix appears | Figure rising from ashes/rubble, triumphant |
| "lamb to slaughter" | Lamb appears | Unarmed figure walking into ambush |
| "wrote history" | Text appears | Quill to paper, intense writing |

## MATERIAL & TEXTURE KEYWORDS (USE IN EVERY PROMPT)
Specify exact materials to prevent modern textures:
- Metals: bronze, iron, steel, gold, silver, copper (NOT chrome, aluminum, titanium)
- Fabrics: wool, linen, silk, leather, fur, cotton (NOT synthetic, nylon, polyester)
- Surfaces: stone, wood, clay, marble, packed earth (NOT concrete, glass, plastic, tile)
- Add texture adjectives: weathered, aged, rough-hewn, hand-forged, sun-bleached, patinated, dust-covered
Every object in frame should have its material specified. Unspecified = Kling fills with modern textures.

## 15-SECOND CLIP RULES

Each clip is 15 SECONDS — enough for a mini-scene with setup and payoff. Design multi-beat sequences:

✅ GOOD 15-second sequences:
- "Wide shot of rider approaching fortress, cuts to close-up as gates open, rider charges through courtyard" (approach → reveal → action)
- "Warrior kneels in mud, slowly rises gripping sword, turns to face approaching army on horizon" (defeat → resolve → confrontation)
- "King surveys war table, slams fist scattering maps, strides to balcony overlooking troops" (planning → decision → command)
- "Close-up of hands forging a blade, pull back to reveal the smith, pan to warrior receiving the finished weapon" (craft → reveal → transfer)
- "Soldiers march through rain, commander raises sword, army surges forward into battle" (buildup → signal → charge)

❌ BAD for 15 seconds:
- "stands looking" (too static — 15 seconds of nothing)
- "entire war from start to finish" (too epic — keep it to one scene)
- "thinks about past" (not visual — show action)
- Single action with no progression (wastes the 15s format)

## CAMERA DIRECTION FOR 15 SECONDS

Kling 3.0 understands complex camera language. Use multi-shot direction within a single clip:

| Movement | Description | Best For |
|----------|-------------|----------|
| tracking_push | Slow tracking push over 15s, wide to close | Building tension, intimacy |
| crane_reveal | Crane up/down revealing scene scale | Opening shots, epic moments |
| dolly_orbit | Dolly around subject 45-90° | Hero moments, power display |
| whip_pan_cut | Whip pan transition between subjects | Scene transitions, energy |
| POV_approach | First-person approach toward subject | Tension, confrontation |
| drone_pullback | Aerial pullback revealing landscape | Scale, aftermath, victory |
| multi_shot | "cuts to close-up" / "camera shifts to" | Narrative pacing within clip |

ENCOURAGE multi-shot direction: "Wide establishing shot, then cuts to close-up of face, camera tracks as subject moves"

## MUSICAL ENERGY MAPPING

| Energy Level | Visual Intensity | Camera | Lighting |
|--------------|------------------|--------|----------|
| low | Subtle motion, contemplative, slow reveal | gentle tracking or slow crane | Soft, diffused, dawn/dusk |
| medium | Clear action, moderate pace, scene build | tracking push, dolly | Natural, warm, golden |
| high | Dynamic multi-beat action, fast cuts | whip pan, fast track, crash zoom | Dramatic contrast, rim light |
| peak | Maximum intensity, climax sequence | drone + crash zoom + whip pan | Golden hour, high contrast, backlit |

## KLING 3.0 PROMPT STRUCTURE (60-100 words)

Structure as: [SUBJECT with appearance and period-accurate materials], [ACTION sequence — multi-beat for 15 seconds], [ENVIRONMENT with era-specific details], [CAMERA direction including cuts/movements]

Example format:
"A 13th century Mongol warlord in blood-stained leather armor and iron helm surveys an endless battlefield of fallen enemies from horseback, dismounts and kneels to pick up a fallen banner, rises and plants it in the earth with both hands, vast Mongolian steppe at crimson dusk with packed earth and wind-blown grass, wide establishing shot slowly pushes in, cuts to close-up of weathered face at the moment of planting, golden hour backlighting with dust particles"

## CAMERA MOVEMENTS KLING 3.0 UNDERSTANDS:
- "Camera slowly pushes in" / "slow tracking push" (gradual zoom)
- "Camera pulls back to reveal" / "drone pullback" (scale reveal)
- "Camera pans left/right" / "whip pan to" (follow action / cut)
- "Camera tracks alongside subject" / "dolly alongside" (movement)
- "Crane shot rising to reveal" / "crane down to" (vertical)
- "Camera orbits subject" / "slow orbit 90 degrees" (showcase)
- "POV shot approaching" / "first person" (immersion)
- "Cuts to close-up" / "camera shifts to" (multi-shot within clip)
- "Handheld following action" (documentary energy)
- "Dutch angle" (tension, unease)

## PATTERN INTERRUPTS FOR RETENTION (YouTube Shorts Research)

Data shows videos with visual changes every 2-3 seconds achieve 58% retention vs 41% for static content.

Within each 15-second clip, include 2-3 visual beats:
| Interrupt Type | Technique |
|----------------|-----------|
| shot_change | Cut from wide to close-up at ~5s mark, then action at ~10s |
| camera_shift | Start tracking, whip pan to new angle at midpoint |
| action_escalation | Build from subtle to intense across the 15 seconds |
| environment_reveal | Start tight, pull back to show epic scale |

For clips at 60s or 120s marks (mid-video hooks): Insert "blind turn" - sudden shift in tempo, reveal, or narrative twist.

## NEGATIVE PROMPT (ALWAYS USE BASE, ADD ERA-SPECIFIC)

cartoon, anime, illustration, painting, text, watermark, logo, blurry, low quality, distorted face, extra limbs, static pose, t-pose, looking at camera
(Add era-specific restrictions based on CRITICAL ERA CONSTRAINT if provided)`;

// Base negative - keep era-neutral to avoid breaking modern-era videos
// Kling 3.0: Removed "multiple people, crowd" — model handles multi-character scenes well now
const STANDARD_NEGATIVE =
  'cartoon, anime, illustration, text, watermark, blurry, distorted, static pose, magical effects, glowing, VFX, supernatural, morphing';

// ============================================================================
// FANTASY THUMBNAIL PROMPT - Vibrant, eye-catching imagery (thumbnail-style)
// ============================================================================

const FANTASY_THUMBNAIL_PROMPT = `You create vibrant fantasy-themed video prompts for 15-SECOND CLIPS using Kling 3.0 that look like eye-catching YouTube thumbnails come to life with cinematic motion.

## STYLE: VIBRANT FANTASY CINEMATIC

Think: Bold colors, dramatic poses, striking compositions with CINEMATIC MOTION — visuals that GRAB ATTENTION and hold it for 15 seconds.

✅ WHAT WORKS:
- Fantasy characters in dynamic action sequences (not just poses)
- VIBRANT saturated colors (electric blues, fiery oranges, mystic purples, golden yellows)
- Dramatic lighting with high contrast (rim lighting, god rays, dramatic shadows)
- Fantasy elements (glowing crystals, magical weapons, mystical auras, floating particles)
- Epic fantasy settings (enchanted forests, crystal caves, floating islands, ancient ruins)
- Multi-beat sequences: pose → action → reveal across 15 seconds
- Complex camera work: orbit → push in → whip pan
- Glowing effects tastefully used (eyes, weapons, magical energy)

❌ AVOID:
- Dull, muted colors
- Static, boring poses held for full 15 seconds
- Overly realistic/historical accuracy
- Complex busy backgrounds that distract from subject
- Text or logos

## FANTASY THEME CATEGORIES:

**Epic Fantasy Warriors:**
- Glowing armor with mystical runes
- Legendary weapons crackling with energy
- Battle sequences with dramatic lighting
- Fire, ice, or lightning effects in motion

**Mystical Mages:**
- Robes flowing with magical energy
- Spell-casting dramatic hand gestures, building to climax
- Glowing crystals or orbs summoned and wielded
- Ethereal magical particles swirling with increasing intensity

**Dark Fantasy:**
- Shadow warriors with glowing eyes emerging from darkness
- Cursed artifacts pulsing with power
- Dramatic moonlight or torch-lit scenes
- Purple and blue color palettes

**Celestial/Divine:**
- Golden divine light rays intensifying
- Angelic or holy warrior aesthetic
- White and gold color schemes
- Heavenly glow effects building to climax

## 15-SECOND CLIP RULES:

Each clip should be a MINI CINEMATIC SEQUENCE — start strong, build, and end with impact:

✅ GOOD for 15s fantasy:
- "Hero warrior in golden armor draws glowing sword from stone altar, blue energy erupts along the blade as warrior raises it skyward, camera orbits from low angle revealing epic sunset backdrop with floating particles, warrior turns and points sword forward commanding unseen army, dramatic god rays break through storm clouds"
- "Mystical sorceress with flowing purple robes approaches crystal pedestal, places hands on orb as swirling galaxy of stars manifests, magical glow illuminates her face with increasing intensity, camera pushes in as power reaches crescendo, dark cavern transforms with cascading light"
- "Shadow knight with glowing red eyes stands in moonlit mist, cursed blade ignites with dark energy, strides forward through parting fog revealing ruined battlefield, camera tracks alongside then crashes to close-up of burning eyes"

❌ BAD:
- "Person walks through forest" (boring, no progression)
- "Standing and looking around" (no action arc)
- "Static pose for 15 seconds" (wastes the format)

## CAMERA MOVEMENTS (15 seconds — USE MULTI-SHOT):

| Movement | Best For |
|----------|----------|
| orbit_to_push | Showcase hero, then intensify with zoom |
| crane_reveal | Rising reveal of epic scale and power |
| track_to_crash | Follow action, crash zoom to detail |
| pull_to_whip | Pull back to show scale, whip pan to new angle |
| static_to_orbit | Hold for power moment, then orbit to showcase |

## COLOR PALETTES (Choose ONE per clip):

- **Fire**: Orange, red, yellow, gold
- **Ice/Frost**: Electric blue, white, cyan, silver
- **Shadow/Dark**: Purple, deep blue, black, crimson accents
- **Nature/Life**: Emerald green, gold, vibrant nature tones
- **Divine/Holy**: White, gold, soft yellow, heavenly glow
- **Arcane/Magic**: Violet, pink, blue, mysterious glow

## LIGHTING STYLE:

ALWAYS dramatic and high-contrast:
- Rim lighting (glowing outline on character)
- God rays (light beams through atmosphere)
- Magical glow (from weapons, eyes, hands)
- Dramatic shadows (create depth and mood)
- Particle effects (floating embers, sparkles, energy wisps)

## PROMPT STRUCTURE (60-100 words):

[FANTASY CHARACTER with striking appearance], [MULTI-BEAT ACTION SEQUENCE across 15s], [VIBRANT COLOR SCHEME], [DRAMATIC LIGHTING], [FANTASY SETTING], [CAMERA DIRECTION with cuts/movements], [MOOD]

Example:
"A legendary dragon knight in gleaming obsidian armor with glowing crimson runes draws enormous flaming greatsword from the earth, flames erupt along the blade as knight raises it skyward in triumphant pose, turns and strides forward through floating embers, ancient battlefield at twilight, camera orbits from low angle during draw then tracks alongside as knight advances, crashes to close-up of fierce glowing eyes, dramatic god rays breaking through storm clouds, epic and powerful cinematic fantasy"

## NEGATIVE PROMPT:
Realistic historical, dull colors, muted tones, boring pose, standing idle, looking at camera, text, watermark, blurry, low quality, photo-realistic, documentary style

Remember: Every clip should be a 15-second CINEMATIC SEQUENCE that builds from attention-grab to climax. Not a static thumbnail — a thumbnail that comes ALIVE.`;

const FANTASY_NEGATIVE =
  'realistic historical, dull colors, muted, boring pose, standing idle, text, watermark, blurry, documentary, photo-realistic';

// ============================================================================
// ERA ENFORCEMENT - Prevent anachronisms based on historical period
// ============================================================================

interface EraConstraints {
  centuryDescription: string;
  allowedTransport: string[];
  forbiddenItems: string[];
  periodNegative: string;
}

export function getEraConstraints(era: string): EraConstraints {
  const eraLower = era.toLowerCase();

  // First check for explicit modern era keywords - these should NOT restrict modern items
  if (
    eraLower.includes('modern') ||
    eraLower.includes('contemporary') ||
    eraLower.includes('present') ||
    eraLower.includes('current') ||
    eraLower.includes('21st century') ||
    eraLower.includes('2000s') ||
    eraLower.includes('2010s') ||
    eraLower.includes('2020s')
  ) {
    return {
      centuryDescription: 'modern era (21st century)',
      allowedTransport: [
        'car',
        'automobile',
        'airplane',
        'helicopter',
        'train',
        'bus',
        'motorcycle',
        'bicycle',
        'subway',
      ],
      forbiddenItems: [], // No restrictions for modern era
      periodNegative: '', // No era-specific negatives for modern
    };
  }

  // Extract year from era string if present
  const yearMatch = era.match(/(\d{3,4})/);
  // Default to 1950 if no year found (safer middle ground that allows most modern tech)
  // Pre-industrial keywords will override this below
  let year = yearMatch ? parseInt(yearMatch[1]) : 1950;

  // Check for pre-industrial era keywords to override the default
  if (
    eraLower.includes('ancient') ||
    eraLower.includes('roman') ||
    eraLower.includes('egypt') ||
    eraLower.includes('greek') ||
    eraLower.includes('medieval') ||
    eraLower.includes('viking') ||
    eraLower.includes('mongol') ||
    eraLower.includes('renaissance') ||
    eraLower.includes('tudor') ||
    eraLower.includes('colonial') ||
    eraLower.includes('revolutionary') ||
    eraLower.includes('napoleonic') ||
    eraLower.includes('victorian') ||
    eraLower.includes('civil war')
  ) {
    // For these historical keywords, use the explicit era detection below
    year = yearMatch ? parseInt(yearMatch[1]) : 1750; // Historical default
  }

  // Ancient (before 500 AD)
  if (
    year < 500 ||
    era.toLowerCase().includes('ancient') ||
    era.toLowerCase().includes('roman') ||
    era.toLowerCase().includes('egypt') ||
    era.toLowerCase().includes('greek')
  ) {
    return {
      centuryDescription: 'ancient world (before 500 AD)',
      allowedTransport: ['horse', 'chariot', 'ship', 'camel', 'elephant', 'cart', 'wagon'],
      forbiddenItems: ['gun', 'cannon', 'clock', 'glass windows', 'paper books', 'printing'],
      periodNegative:
        'medieval, renaissance, industrial, modern, gun, cannon, printed books, mechanical clock, glass windows, brick buildings',
    };
  }

  // Medieval (500-1400)
  if (
    (year >= 500 && year < 1400) ||
    era.toLowerCase().includes('medieval') ||
    era.toLowerCase().includes('viking') ||
    era.toLowerCase().includes('mongol')
  ) {
    return {
      centuryDescription: 'medieval era (500-1400 AD)',
      allowedTransport: ['horse', 'ship', 'cart', 'wagon', 'camel'],
      forbiddenItems: ['gun', 'printing press', 'pocket watch'],
      periodNegative:
        'modern, industrial, renaissance painting style, guns, firearms, printed books, pocket watch, eyeglasses',
    };
  }

  // Renaissance/Early Modern (1400-1700)
  if (
    (year >= 1400 && year < 1700) ||
    era.toLowerCase().includes('renaissance') ||
    era.toLowerCase().includes('tudor') ||
    era.toLowerCase().includes('elizabethan')
  ) {
    return {
      centuryDescription: 'renaissance/early modern (1400-1700)',
      allowedTransport: ['horse', 'carriage', 'ship', 'cart'],
      forbiddenItems: ['steam engine', 'factory', 'railroad'],
      periodNegative: 'modern, industrial, steam engine, factory, railroad, photography, electric light',
    };
  }

  // 18th Century (1700-1800)
  if (
    (year >= 1700 && year < 1800) ||
    era.toLowerCase().includes('colonial') ||
    era.toLowerCase().includes('revolutionary') ||
    era.toLowerCase().includes('18th')
  ) {
    return {
      centuryDescription: '18th century (1700s)',
      allowedTransport: ['horse', 'horse-drawn carriage', 'sailing ship', 'cart', 'stagecoach'],
      forbiddenItems: ['steam train', 'automobile', 'factory', 'telegraph', 'photography'],
      periodNegative:
        'modern, car, automobile, train, railroad, steam locomotive, photography, telephone, electric light, factory smokestacks, industrial',
    };
  }

  // Early 19th Century (1800-1860)
  if (
    (year >= 1800 && year < 1860) ||
    era.toLowerCase().includes('napoleonic') ||
    era.toLowerCase().includes('early 19th')
  ) {
    return {
      centuryDescription: 'early 19th century (1800-1860)',
      allowedTransport: ['horse', 'carriage', 'early steam train', 'sailing ship', 'stagecoach'],
      forbiddenItems: ['automobile', 'telephone', 'electric light', 'photography before 1840'],
      periodNegative: 'modern, car, automobile, telephone, electric light, airplane, paved roads, skyscraper, neon',
    };
  }

  // Late 19th Century (1860-1900)
  if (
    (year >= 1860 && year < 1900) ||
    era.toLowerCase().includes('victorian') ||
    era.toLowerCase().includes('civil war') ||
    era.toLowerCase().includes('late 19th')
  ) {
    return {
      centuryDescription: 'late 19th century (1860-1900)',
      allowedTransport: ['horse', 'carriage', 'steam train', 'steamship', 'early bicycle'],
      forbiddenItems: ['automobile', 'airplane', 'telephone before 1876', 'electric light before 1880'],
      periodNegative:
        'modern, car, automobile, airplane, helicopter, television, computer, smartphone, neon lights, modern skyscraper',
    };
  }

  // Early 20th Century (1900-1945)
  if (
    (year >= 1900 && year < 1945) ||
    eraLower.includes('world war') ||
    eraLower.includes('wwi') ||
    eraLower.includes('wwii') ||
    eraLower.includes('ww1') ||
    eraLower.includes('ww2') ||
    eraLower.includes('1920s') ||
    eraLower.includes('1930s') ||
    eraLower.includes('1940s') ||
    eraLower.includes('great depression') ||
    eraLower.includes('prohibition')
  ) {
    return {
      centuryDescription: 'early 20th century (1900-1945)',
      allowedTransport: ['horse', 'automobile', 'car', 'train', 'steamship', 'airplane', 'trolley', 'bus'],
      forbiddenItems: ['helicopter', 'jet plane', 'television', 'computer', 'smartphone', 'modern SUV'],
      periodNegative:
        'smartphone, computer, television, jet airplane, helicopter, LED lights, SUV, contemporary 21st century fashion',
    };
  }

  // Mid 20th Century (1945-1970) - Cold War, Civil Rights Era
  if (
    (year >= 1945 && year < 1970) ||
    eraLower.includes('cold war') ||
    eraLower.includes('civil rights') ||
    eraLower.includes('postwar') ||
    eraLower.includes('1950s') ||
    eraLower.includes('1960s') ||
    eraLower.includes('korean war') ||
    eraLower.includes('vietnam')
  ) {
    return {
      centuryDescription: 'mid 20th century (1945-1970)',
      allowedTransport: ['car', 'automobile', 'train', 'airplane', 'bus', 'motorcycle', 'bicycle'],
      forbiddenItems: [], // Cars, planes, phones all appropriate for this era
      periodNegative: '', // No restrictions - most modern tech existed
    };
  }

  // Late 20th Century (1970-2000)
  if (
    (year >= 1970 && year < 2000) ||
    eraLower.includes('1970s') ||
    eraLower.includes('1980s') ||
    eraLower.includes('1990s') ||
    eraLower.includes('disco') ||
    eraLower.includes('reagan') ||
    eraLower.includes('cold war end') ||
    eraLower.includes('gulf war')
  ) {
    return {
      centuryDescription: 'late 20th century (1970-2000)',
      allowedTransport: [
        'car',
        'automobile',
        'airplane',
        'helicopter',
        'train',
        'bus',
        'motorcycle',
        'bicycle',
        'subway',
      ],
      forbiddenItems: [], // All modern tech appropriate
      periodNegative: '', // No restrictions
    };
  }

  // Early 21st Century (2000+) - if year detection found 2000+ but missed modern keywords
  if (year >= 2000) {
    return {
      centuryDescription: '21st century (2000+)',
      allowedTransport: [
        'car',
        'automobile',
        'airplane',
        'helicopter',
        'train',
        'bus',
        'motorcycle',
        'bicycle',
        'subway',
      ],
      forbiddenItems: [], // All modern tech appropriate
      periodNegative: '', // No restrictions
    };
  }

  // Default - assume pre-industrial if truly unclear
  return {
    centuryDescription: 'historical period',
    allowedTransport: ['horse', 'carriage', 'ship', 'cart'],
    forbiddenItems: ['automobile', 'airplane', 'electricity', 'modern technology'],
    periodNegative: 'modern, car, automobile, airplane, telephone, electric light, computer, smartphone, television',
  };
}

function buildEraEnforcedNegative(era: string): string {
  const constraints = getEraConstraints(era);
  return `${STANDARD_NEGATIVE}, ${constraints.periodNegative}`;
}

/**
 * Scan a prompt for forbidden era items and remove them.
 * Returns the cleaned prompt. Logs warnings for each removed item.
 */
export function enforceEraConstraints(prompt: string, era: string): string {
  const constraints = getEraConstraints(era);
  if (constraints.forbiddenItems.length === 0) return prompt;

  let cleaned = prompt;
  for (const item of constraints.forbiddenItems) {
    // Match the forbidden item as a whole word (case-insensitive)
    const regex = new RegExp(`\\b${item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(cleaned)) {
      console.warn(`   ⚠️ ERA VIOLATION: Removed "${item}" from prompt (era: ${era})`);
      // Remove the item and any surrounding comma/space artifacts
      cleaned = cleaned.replace(regex, '');
      cleaned = cleaned
        .replace(/,\s*,/g, ',')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }
  }
  return cleaned;
}

// ============================================================================
// ANALYTICS FEEDBACK LOOP - Apply winning patterns from past performance
// ============================================================================

/**
 * Get learned patterns from analytics to inject into prompt generation
 * This creates a feedback loop: successful videos → pattern analysis → better prompts
 */
function getPatternEnhancedGuidance(): string {
  try {
    const patterns = patternIntelligenceService.getApplicablePatterns();
    const summary = patternIntelligenceService.getAnalyticsSummary();

    // Only add guidance if we have statistically significant patterns
    if (summary.significantPatterns < 3) {
      console.log('   📊 Pattern Intelligence: Not enough data yet for feedback loop');
      return '';
    }

    const sections: string[] = [];

    // Winning visual styles
    if (patterns.visualStyles.length > 0) {
      sections.push(`PROVEN VISUAL STYLES (from top-performing videos):
${patterns.visualStyles.map((s) => `- ${s}`).join('\n')}`);
    }

    // Winning narrative approaches
    if (patterns.narrativeApproaches.length > 0) {
      sections.push(`PROVEN NARRATIVE APPROACHES:
${patterns.narrativeApproaches.map((s) => `- ${s}`).join('\n')}`);
    }

    // Cluster insights
    if (patterns.clusterInsights.length > 0) {
      sections.push(`THEME INSIGHTS:
${patterns.clusterInsights.map((s) => `- ${s}`).join('\n')}`);
    }

    // Patterns to avoid
    if (patterns.avoidPatterns.length > 0) {
      sections.push(`AVOID (consistently underperformed):
${patterns.avoidPatterns.map((s) => `- ${s}`).join('\n')}`);
    }

    if (sections.length === 0) {
      return '';
    }

    console.log(
      `   🎯 Pattern Intelligence: Injecting ${summary.highConfidencePatterns} high-confidence patterns into prompts`,
    );

    return `

## ANALYTICS-DRIVEN ENHANCEMENTS (from ${summary.significantPatterns} analyzed videos)
These patterns have been statistically validated from past performance data:

${sections.join('\n\n')}

Apply these winning formulas where appropriate, but maintain creative variety.`;
  } catch (error) {
    console.error('   ⚠️ Pattern intelligence error:', error);
    return '';
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMessage)), timeoutMs)),
  ]);
}

function parseGeminiJson<T>(content: string): T {
  let jsonStr = content.trim();

  // Strategy 1: Strip markdown code fences
  if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
  else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
  if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);

  try {
    return JSON.parse(jsonStr.trim()) as T;
  } catch (_firstErr) {
    // Strategy 2: Extract JSON object from anywhere in the response
    const jsonMatch = content.match(/\{[\s\S]*"segments"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch (_) {
        /* fall through */
      }
    }

    // Strategy 3: Find JSON between code fences anywhere in the text
    const fenceMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenceMatch) {
      try {
        return JSON.parse(fenceMatch[1].trim()) as T;
      } catch (_) {
        /* fall through */
      }
    }

    // Log the raw response for debugging, then re-throw original error
    console.error(`   ❌ parseGeminiJson failed. Raw response (first 500 chars): ${content.slice(0, 500)}`);
    throw _firstErr;
  }
}

function getBeatTypeFromPosition(ratio: number, sectionType?: string): BeatType {
  if (sectionType) {
    switch (sectionType) {
      case 'intro':
        return 'hook';
      case 'verse':
        return ratio < 0.3 ? 'setup' : 'rising';
      case 'prechorus':
        return 'conflict';
      case 'chorus':
        return 'climax';
      case 'bridge':
        return 'resolution';
      case 'outro':
        return 'hook_next';
    }
  }
  if (ratio < 0.1) return 'hook';
  if (ratio < 0.25) return 'setup';
  if (ratio < 0.5) return 'rising';
  if (ratio < 0.65) return 'conflict';
  if (ratio < 0.8) return 'climax';
  if (ratio < 0.92) return 'resolution';
  return 'hook_next';
}

// ============================================================================
// BPM SYNC UTILITIES
// ============================================================================

// Import pre-computed types from audio-analysis-service
import type { BeatClipMapping, PrecomputedClipData } from './audio-analysis-service';

/**
 * Use pre-computed clip data when available (FAST PATH)
 * Falls back to calculating from scratch if pre-computed data not available
 */
export function getSegmentsFromPrecomputed(
  precomputed: PrecomputedClipData | undefined,
  engine: 'kling' | 'veo' = 'kling',
  sections: SectionMarker[],
): { start: number; end: number; beatType: BeatType; energy: string; isSectionBoundary: boolean }[] {
  if (!precomputed) {
    console.log('   ⚠️ No pre-computed data available, will calculate on the fly');
    return [];
  }

  const beatToClip = precomputed.beatToClip[engine];
  if (!beatToClip || beatToClip.length === 0) {
    console.log('   ⚠️ No beat-to-clip mapping for engine:', engine);
    return [];
  }

  console.log(`   ✅ Using pre-computed ${engine} clips: ${beatToClip.length} segments`);
  console.log(`   📊 Section boundaries at clips: [${precomputed.sectionBoundaryClips[engine].join(',')}]`);

  return beatToClip.map((clip, i) => {
    const section = sections.find((s) => clip.clipStart >= s.startTime && clip.clipStart < s.endTime);
    const positionRatio = clip.clipStart / precomputed.clipMaps[engine].totalDuration;

    return {
      start: clip.clipStart,
      end: clip.clipEnd,
      beatType: getBeatTypeFromPosition(positionRatio, section?.type),
      energy: clip.energyLevel, // Already computed!
      isSectionBoundary: clip.isSectionBoundary, // Already flagged!
    };
  });
}

/**
 * Calculate segment boundaries from scratch (SLOW PATH - legacy fallback)
 */
export function calculateSegmentBoundaries(
  librosa: LibrosaAnalysis,
  targetSegmentDuration: number = 5,
): { start: number; end: number; beatType: BeatType; energy: string }[] {
  const segments: { start: number; end: number; beatType: BeatType; energy: string }[] = [];
  const { downbeats, sections, duration, bpm } = librosa;

  const beatsPerSecond = bpm / 60;
  const beatsPerSegment = Math.round(beatsPerSecond * targetSegmentDuration);

  let currentStart = 0;

  for (let i = 0; i < downbeats.length; i += beatsPerSegment) {
    const startBeat = downbeats[i] || currentStart;
    const endBeat = downbeats[i + beatsPerSegment] || duration;

    const section = sections.find((s) => startBeat >= s.startTime && startBeat < s.endTime);
    const energy = section?.energy || 'medium';
    const positionRatio = startBeat / duration;
    const beatType = getBeatTypeFromPosition(positionRatio, section?.type);

    segments.push({
      start: startBeat,
      end: Math.min(endBeat, startBeat + 5.5),
      beatType,
      energy,
    });

    currentStart = endBeat;
  }

  return segments;
}

export function alignLyricsToSegments(
  lyrics: LyricSegment[],
  segments: { start: number; end: number; beatType: BeatType; energy: string }[],
): { segment: (typeof segments)[0]; lyric: string }[] {
  return segments.map((seg) => {
    const overlappingLyrics = lyrics.filter(
      (l) =>
        (l.startTime >= seg.start && l.startTime < seg.end) ||
        (l.endTime > seg.start && l.endTime <= seg.end) ||
        (l.startTime <= seg.start && l.endTime >= seg.end),
    );
    const lyricText =
      overlappingLyrics
        .map((l) => l.text)
        .join(' ')
        .trim() || '[instrumental]';
    return { segment: seg, lyric: lyricText };
  });
}

// ============================================================================
// CONTEXT-AWARE CONDITION INJECTION (CACI) - Dynamic Prioritization
// ============================================================================

/**
 * Build CACI context from TNA breakdown and retention optimization
 * Determines plot position, emotional tone, and modal priorities for dynamic prompt injection
 */
export function buildCACIContext(
  tnas: TemporalNarrativeAtom[],
  clipIndex: number,
  retentionOptimization?: RetentionOptimization,
): CACIContext {
  const totalClips = tnas.length || 1;
  const positionRatio = clipIndex / totalClips;

  // Determine plot arc from position (0-25% rising, 25-75% climax, 75-90% falling, 90-100% resolution)
  let plotArc: CACIContext['globalNarrative']['plotArc'];
  if (positionRatio < 0.25) {
    plotArc = 'rising';
  } else if (positionRatio < 0.75) {
    plotArc = 'climax';
  } else if (positionRatio < 0.9) {
    plotArc = 'falling';
  } else {
    plotArc = 'resolution';
  }

  // Get TNA at clipIndex for emotional tone
  const currentTNA = tnas[clipIndex];
  const emotionalTone = currentTNA?.emotionalArc || 'stable';

  // Determine editing style based on TNA type and lyric content
  let editingStyle: CACIContext['globalNarrative']['editingStyle'] = 'continuous';
  if (currentTNA) {
    const lyricText = currentTNA.text.toLowerCase();
    if (
      lyricText.includes('said') ||
      lyricText.includes('told') ||
      lyricText.includes('asked') ||
      lyricText.includes('spoke')
    ) {
      editingStyle = 'shot-reverse';
    } else if (currentTNA.type === 'action') {
      editingStyle = 'continuous';
    } else if (currentTNA.type === 'transition') {
      editingStyle = 'montage';
    } else if (currentTNA.type === 'beat' || currentTNA.type === 'hook') {
      editingStyle = 'rhythmic';
    }
  }

  // Determine shot importance
  let importance: CACIContext['localShot']['importance'] = 'supporting';
  if (currentTNA?.type === 'hook' || clipIndex === 0) {
    importance = 'hero';
  } else if (currentTNA?.type === 'transition') {
    importance = 'transition';
  } else if (plotArc === 'climax' && currentTNA?.emotionalArc === 'peak') {
    importance = 'hero';
  }

  // Check if this is a hook moment from retention optimization
  const clipStart = clipIndex * 5; // Assuming 5s clips
  const hookMoment =
    retentionOptimization?.hookPoints?.some((h) => h.timestamp >= clipStart && h.timestamp < clipStart + 5) ||
    clipIndex === 0;

  // Check if this is a pattern interrupt target
  const patternInterruptTarget =
    retentionOptimization?.patternInterrupts?.some((p) => p.clipIndex === clipIndex) || false;

  // Calculate modal priorities based on TNA type, position, and hook status
  const modalPriorities: CACIContext['modalPriorities'] = {
    motion: 50,
    continuity: 50,
    cinematography: 50,
    emotion: 50,
  };

  // Hook moments: emphasize motion and emotion
  if (hookMoment) {
    modalPriorities.motion = 90;
    modalPriorities.emotion = 85;
    modalPriorities.cinematography = 70;
    modalPriorities.continuity = 40;
  }
  // Transitions: emphasize continuity
  else if (importance === 'transition') {
    modalPriorities.continuity = 90;
    modalPriorities.cinematography = 60;
    modalPriorities.motion = 40;
    modalPriorities.emotion = 50;
  }
  // Action scenes: emphasize motion
  else if (currentTNA?.type === 'action') {
    modalPriorities.motion = 85;
    modalPriorities.cinematography = 75;
    modalPriorities.emotion = 55;
    modalPriorities.continuity = 45;
  }
  // Emotional beats: emphasize emotion and cinematography
  else if (currentTNA?.type === 'emotion') {
    modalPriorities.emotion = 90;
    modalPriorities.cinematography = 80;
    modalPriorities.continuity = 55;
    modalPriorities.motion = 35;
  }
  // Climax moments: everything high
  else if (plotArc === 'climax') {
    modalPriorities.motion = 75;
    modalPriorities.emotion = 80;
    modalPriorities.cinematography = 75;
    modalPriorities.continuity = 60;
  }
  // Resolution: emphasize continuity and emotion
  else if (plotArc === 'resolution') {
    modalPriorities.continuity = 70;
    modalPriorities.emotion = 75;
    modalPriorities.cinematography = 65;
    modalPriorities.motion = 45;
  }

  return {
    globalNarrative: {
      plotArc,
      emotionalTone: emotionalTone.toString(),
      editingStyle,
    },
    localShot: {
      importance,
      hookMoment,
      patternInterruptTarget,
    },
    modalPriorities,
  };
}

/**
 * Apply dynamic prioritization to a prompt based on CACI context
 * Reorders prompt elements and adds emphasis keywords for high-priority modals
 */
export function applyDynamicPrioritization(prompt: string, caciContext: CACIContext): string {
  const { modalPriorities, localShot, globalNarrative } = caciContext;

  // Sort modals by priority
  const sortedModals = Object.entries(modalPriorities)
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key as keyof typeof modalPriorities);

  // Build priority guidance prefix
  const priorityOrder = sortedModals.join(' > ');

  // Define emphasis keywords for each modal
  const emphasisKeywords: Record<keyof typeof modalPriorities, string[]> = {
    motion: ['dynamic movement', 'fluid motion', 'kinetic energy'],
    continuity: ['consistent character', 'seamless transition', 'visual continuity'],
    cinematography: ['dramatic composition', 'striking framing', 'masterful lighting'],
    emotion: ['intense emotion', 'powerful expression', 'visceral feeling'],
  };

  // Get emphasis for top two priorities (if priority > 70)
  const emphasisPhrases: string[] = [];
  for (const modal of sortedModals.slice(0, 2)) {
    if (modalPriorities[modal] >= 70) {
      const keywords = emphasisKeywords[modal];
      emphasisPhrases.push(keywords[Math.floor(Math.random() * keywords.length)]);
    }
  }

  // Build enhanced prompt
  let enhancedPrompt = prompt;

  // Add emphasis phrases if we have high-priority modals
  if (emphasisPhrases.length > 0) {
    // Insert emphasis near the action/subject portion
    const commaIndex = enhancedPrompt.indexOf(',');
    if (commaIndex > 0 && commaIndex < 100) {
      enhancedPrompt =
        enhancedPrompt.slice(0, commaIndex) +
        ` with ${emphasisPhrases.join(' and ')}` +
        enhancedPrompt.slice(commaIndex);
    } else {
      enhancedPrompt += `, emphasizing ${emphasisPhrases.join(' and ')}`;
    }
  }

  // Add hook-specific enhancements
  if (localShot.hookMoment) {
    if (!enhancedPrompt.toLowerCase().includes('dramatic')) {
      enhancedPrompt = enhancedPrompt.replace(/camera/, 'dramatic moment, camera');
    }
  }

  // Add pattern interrupt cue
  if (localShot.patternInterruptTarget) {
    enhancedPrompt += ' [PATTERN INTERRUPT: include visual change at midpoint]';
  }

  return enhancedPrompt;
}

/**
 * Generate CACI priority guidance string for injection into system prompts
 */
export function generateCACIPriorityGuidance(caciContext: CACIContext): string {
  const { modalPriorities, globalNarrative, localShot } = caciContext;

  // Sort modals by priority
  const sortedModals = Object.entries(modalPriorities)
    .sort(([, a], [, b]) => b - a)
    .map(([key, value]) => `${key}(${value})`);

  const priorityOrder = sortedModals.join(' > ');

  let guidance = `\n## PRIORITY GUIDANCE (CACI)
- Focus: ${priorityOrder}
- Plot Arc: ${globalNarrative.plotArc}
- Editing Style: ${globalNarrative.editingStyle}
- Shot Importance: ${localShot.importance}`;

  if (localShot.hookMoment) {
    guidance += '\n- ⚡ HOOK MOMENT: Maximum impact, start mid-action';
  }
  if (localShot.patternInterruptTarget) {
    guidance += '\n- ♻️ PATTERN INTERRUPT: Include visual change within clip';
  }

  return guidance;
}

// ============================================================================
// MAIN GENERATION FUNCTIONS
// ============================================================================

export async function generateGroundedPrompt(
  figureName: string,
  era: string,
  archetype: Archetype,
  beatType: BeatType,
  musicalEnergy: string,
  lyricLine: string,
): Promise<{ visualConcept: string; prompt: string; negativePrompt: string }> {
  // Get era-specific constraints to prevent anachronisms
  const eraConstraints = getEraConstraints(era);

  // Only add era constraints for historical eras, not modern
  const isModernEra = eraConstraints.forbiddenItems.length === 0;
  const eraConstraintText = isModernEra
    ? ''
    : `
⚠️ CRITICAL ERA CONSTRAINT: This is set in the ${eraConstraints.centuryDescription}.
- ONLY these transport allowed: ${eraConstraints.allowedTransport.join(', ')}
- ABSOLUTELY FORBIDDEN: ${eraConstraints.forbiddenItems.join(', ')}
STRICTLY period-accurate - no anachronisms.`;

  // Dynamic Model Router - get recommended model for this task
  let selectedModel = 'gemini-2.5-flash';
  let routingDecision: any = null;
  try {
    routingDecision = await dynamicModelRouter.routeTask({
      type: 'prompt_generation',
      complexity: 'high',
      context: { contentType: 'historical_rap', requiresCreativity: true, historicalEra: era },
    });
    selectedModel = routingDecision.selectedModel;
    console.log(`   🔀 Model Router: Selected ${selectedModel} for prompt generation`);
  } catch (routerErr: any) {
    console.warn(`   ⚠️ Model routing failed (using gemini-2.5-flash): ${routerErr.message}`);
  }

  const startTime = Date.now();
  let success = true;
  let qualityScore = 75; // Default quality score

  try {
    const response = await withTimeout(
      gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: `${KLING_GROUNDED_PROMPT}

---

FIGURE: ${figureName}
ERA: ${era}
ARCHETYPE: ${archetype}
BEAT TYPE: ${beatType}
MUSICAL ENERGY: ${musicalEnergy}
LYRIC: "${lyricLine}"
${eraConstraintText}
Create a GROUNDED 5-second visual that shows what this lyric means.
The visual MUST depict the action described in the lyric - the viewer will HEAR this lyric while SEEING the clip.
No VFX, no magic - real cinematography only.
Output JSON: { "visualConcept": "...", "prompt": "...", "negativePrompt": "..." }`,
        config: {
          temperature: 0.7,
          maxOutputTokens: 600,
          responseMimeType: 'application/json',
        },
      }),
      60000,
      'Gemini grounded prompt generation timed out',
    );

    const responseText = response.text || '{}';

    // Track cost for this API call
    const usageMetadata = (response as any).usageMetadata;
    if (usageMetadata) {
      apiCostTracker.trackGemini({
        model: GEMINI_MODEL,
        operation: 'prompt_generation',
        inputTokens: usageMetadata.promptTokenCount || 0,
        outputTokens: usageMetadata.candidatesTokenCount || 0,
        success: true,
        metadata: { function: 'generateGroundedPrompt', figureName, era },
      });
    }

    const result = parseGeminiJson<any>(responseText);

    // Estimate quality based on prompt length and structure
    qualityScore = result.prompt && result.prompt.length > 50 ? 80 : 60;
    if (result.visualConcept && result.visualConcept.length > 20) qualityScore += 10;

    // Build negative prompt - only add era-specific for historical eras
    let finalNegative = STANDARD_NEGATIVE;
    if (!isModernEra && eraConstraints.periodNegative) {
      finalNegative += `, ${eraConstraints.periodNegative}`;
    }
    if (result.negativePrompt) {
      finalNegative += `, ${result.negativePrompt}`;
    }

    // Record outcome for learning
    const latency = Date.now() - startTime;
    const estimatedCost = 0.005; // ~$0.005 per GPT-4o call
    try {
      await dynamicModelRouter.recordOutcome(
        selectedModel as any,
        'prompt_generation',
        success,
        qualityScore,
        latency,
        estimatedCost,
      );
    } catch (recordErr: any) {
      // Non-blocking - don't fail the generation if recording fails
    }

    return {
      visualConcept: result.visualConcept || '',
      prompt: result.prompt || '',
      negativePrompt: finalNegative,
    };
  } catch (genErr: any) {
    success = false;
    qualityScore = 0;
    const latency = Date.now() - startTime;

    // Record failed outcome
    try {
      await dynamicModelRouter.recordOutcome(selectedModel as any, 'prompt_generation', false, 0, latency, 0.005);
    } catch (recordErr: any) {
      // Non-blocking
    }

    throw genErr;
  }
}

export async function generateBPMSyncedPrompts(
  figureName: string,
  era: string,
  archetype: Archetype,
  lyrics: LyricSegment[],
  librosa: LibrosaAnalysis,
): Promise<VideoSegment[]> {
  // Get era-specific constraints to prevent anachronisms
  const eraConstraints = getEraConstraints(era);

  // Only add era constraints for historical eras, not modern
  const isModernEra = eraConstraints.forbiddenItems.length === 0;
  const eraConstraintText = isModernEra
    ? ''
    : `
⚠️ CRITICAL ERA CONSTRAINT: This is set in the ${eraConstraints.centuryDescription}.
- ONLY these transport allowed: ${eraConstraints.allowedTransport.join(', ')}
- ABSOLUTELY FORBIDDEN: ${eraConstraints.forbiddenItems.join(', ')}
STRICTLY period-accurate - no anachronisms.`;

  // Get analytics-driven pattern enhancements (feedback loop from past performance)
  const patternGuidance = getPatternEnhancedGuidance();

  const segmentBoundaries = calculateSegmentBoundaries(librosa, 5);
  const alignedSegments = alignLyricsToSegments(lyrics, segmentBoundaries);

  const segmentList = alignedSegments
    .map(
      (s, i) =>
        `[${i}] ${s.segment.start.toFixed(1)}-${s.segment.end.toFixed(1)}s | ${s.segment.beatType} | Energy: ${s.segment.energy} | "${s.lyric}"`,
    )
    .join('\n');

  const response = await withTimeout(
    gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${KLING_GROUNDED_PROMPT}
${patternGuidance}

## BATCH GENERATION RULES:
- Generate ALL segments in one response
- Do NOT repeat the same action in consecutive segments
- Vary camera movements throughout
- Match visual intensity to musical energy
- Each prompt MUST depict the action described in the lyrics for that segment
- Build toward climax, then release
- Each prompt must be under 75 words
- Instrumental sections: show relevant contemplative/transitional visuals

---

FIGURE: ${figureName}
ERA: ${era}
ARCHETYPE: ${archetype}
BPM: ${librosa.bpm}
TOTAL DURATION: ${librosa.duration}s
${eraConstraintText}
SEGMENTS (synced to beats):
${segmentList}

Generate a grounded Kling prompt for each segment. The visual MUST match the lyrics.
Output JSON: { "segments": [ { "index": 0, "visualConcept": "...", "prompt": "...", "negativePrompt": "..." }, ... ] }`,
      config: {
        temperature: 0.7,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
    }),
    180000,
    'Gemini BPM-synced generation timed out',
  );

  const responseText = response.text || '{}';

  // Track cost for this API call
  const bpmUsageMetadata = (response as any).usageMetadata;
  if (bpmUsageMetadata) {
    apiCostTracker.trackGemini({
      model: GEMINI_MODEL,
      operation: 'prompt_generation_bpm_synced',
      inputTokens: bpmUsageMetadata.promptTokenCount || 0,
      outputTokens: bpmUsageMetadata.candidatesTokenCount || 0,
      success: true,
      metadata: { function: 'generateBPMSyncedPrompts', figureName, era, segmentCount: alignedSegments.length },
    });
  }

  const result = parseGeminiJson<{ segments: any[] }>(responseText);

  return result.segments.map((gptSeg: any, i: number) => {
    // Build negative prompt - only add era-specific for historical eras
    let finalNegative = STANDARD_NEGATIVE;
    if (!isModernEra && eraConstraints.periodNegative) {
      finalNegative += `, ${eraConstraints.periodNegative}`;
    }
    if (gptSeg.negativePrompt) {
      finalNegative += `, ${gptSeg.negativePrompt}`;
    }

    return {
      index: i,
      startTime: alignedSegments[i]?.segment.start || i * 5,
      endTime: alignedSegments[i]?.segment.end || (i + 1) * 5,
      duration: (alignedSegments[i]?.segment.end || (i + 1) * 5) - (alignedSegments[i]?.segment.start || i * 5),
      beatType: alignedSegments[i]?.segment.beatType || 'rising',
      musicalEnergy: (alignedSegments[i]?.segment.energy || 'medium') as any,
      lyricLine: alignedSegments[i]?.lyric || '',
      prompt: gptSeg.prompt || '',
      negativePrompt: finalNegative,
    };
  });
}

// ============================================================================
// BATCHED GENERATION - Split into smaller GPT calls for reliable full coverage
// ============================================================================

const BATCH_SIZE = 8; // GPT reliably handles 8-9 segments per call

async function generateBatchPrompts(
  figureName: string,
  era: string,
  archetype: string,
  batchSegments: { index: number; start: number; end: number; beatType: BeatType; lyric: string }[],
  batchNumber: number,
  totalBatches: number,
  storyContext: string,
  styleMode: 'grounded' | 'fantasy' = 'grounded',
): Promise<{ index: number; prompt: string; negativePrompt: string; visualConcept: string }[]> {
  // Select system prompt and negative based on style mode
  const systemPrompt = styleMode === 'fantasy' ? FANTASY_THUMBNAIL_PROMPT : KLING_GROUNDED_PROMPT;
  const baseNegative = styleMode === 'fantasy' ? FANTASY_NEGATIVE : STANDARD_NEGATIVE;

  // Get era-specific constraints (only for grounded mode)
  const eraConstraints = styleMode === 'grounded' ? getEraConstraints(era) : { forbiddenItems: [], periodNegative: '' };
  const isModernEra = eraConstraints.forbiddenItems.length === 0;
  const eraConstraintText =
    styleMode === 'grounded' && !isModernEra
      ? `
⚠️ CRITICAL ERA CONSTRAINT: This is set in the ${getEraConstraints(era).centuryDescription}.
- ONLY these transport allowed: ${getEraConstraints(era).allowedTransport.join(', ')}
- ABSOLUTELY FORBIDDEN: ${eraConstraints.forbiddenItems.join(', ')}
STRICTLY period-accurate - no anachronisms.`
      : '';

  // Get analytics-driven pattern enhancements (feedback loop from past performance)
  const patternGuidance = getPatternEnhancedGuidance();

  const segmentList = batchSegments
    .map((s) => `[${s.index}] ${s.start}-${s.end}s | ${s.beatType} | "${s.lyric.slice(0, 80)}"`)
    .join('\n');

  const narrativePhase =
    batchNumber === 0
      ? 'OPENING - establish character and setting'
      : batchNumber === totalBatches - 1
        ? 'CLIMAX/RESOLUTION - peak intensity, triumphant ending'
        : `RISING ACTION - build intensity (phase ${batchNumber + 1}/${totalBatches})`;

  // Build user content based on style mode
  const userContent =
    styleMode === 'fantasy'
      ? `
THEME: ${figureName}
STYLE: ${archetype}
SEGMENTS TO GENERATE (${batchSegments.length} total):
${segmentList}

Create EXACTLY ${batchSegments.length} VIBRANT FANTASY thumbnail-style prompts. Each clip should be visually STUNNING and unique.
Use different color palettes, poses, and magical elements for each clip.
Respond with JSON: { "segments": [ { "index": N, "prompt": "...", "negativePrompt": "...", "visualConcept": "..." }, ... ] }
`
      : `
FIGURE: ${figureName}
ERA: ${era}
ARCHETYPE: ${archetype}
${eraConstraintText}
SEGMENTS TO GENERATE (${batchSegments.length} total):
${segmentList}

CRITICAL: For each segment, the lyrics shown are what plays during that 5-second window.
Your Kling prompt MUST visually depict the ACTION described in those lyrics.
- Extract the key verb/action from the lyrics
- Make that the PRIMARY visual content
- The viewer will HEAR these lyrics while SEEING your clip - they must match
- Example: lyrics "marching to war" → clip shows figure marching toward battlefield

Generate EXACTLY ${batchSegments.length} unique cinematic prompts matched to each segment's lyrics.
Respond with JSON: { "segments": [ { "index": N, "prompt": "...", "negativePrompt": "...", "visualConcept": "..." }, ... ] }
`;

  const batchSystemContent =
    systemPrompt +
    patternGuidance +
    `

## BATCH ${batchNumber + 1}/${totalBatches} RULES:
- Generate EXACTLY ${batchSegments.length} prompts for segments ${batchSegments[0].index}-${batchSegments[batchSegments.length - 1].index}
- NARRATIVE PHASE: ${narrativePhase}
- Each prompt must be UNIQUE - different camera angles, actions, settings
- No repeated actions in consecutive segments
- Each prompt under 75 words
- STORY CONTEXT: ${storyContext}

## CRITICAL: LYRIC-TO-VISUAL MATCHING
Each segment has LYRICS that play during that 5-second window.
Your Kling prompt MUST depict the action/scene described in those lyrics.
The viewer HEARS the lyrics while SEEING the clip - they must match.
Extract the KEY VERB from the lyrics and make it the primary visual.`;

  const response = await withTimeout(
    gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: `${batchSystemContent}\n\n---\n\n${userContent}`,
      config: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
    120000,
    `Gemini batch ${batchNumber + 1} timed out`,
  );

  const batchResponseText = response.text || '{}';

  // Track cost for this API call
  const batchUsage = (response as any).usageMetadata;
  if (batchUsage) {
    apiCostTracker.trackGemini({
      model: GEMINI_MODEL,
      operation: 'prompt_generation_batch',
      inputTokens: batchUsage.promptTokenCount || 0,
      outputTokens: batchUsage.candidatesTokenCount || 0,
      success: true,
      metadata: {
        function: 'generateBatchPrompts',
        figureName,
        era,
        batchNumber,
        totalBatches,
        segmentCount: batchSegments.length,
      },
    });
  }

  const result = parseGeminiJson<{ segments: any[] }>(batchResponseText);

  // Apply negatives based on style mode
  return (result.segments || []).map((seg: any) => {
    let finalNegative = baseNegative;
    if (styleMode === 'grounded' && !isModernEra && eraConstraints.periodNegative) {
      finalNegative += `, ${eraConstraints.periodNegative}`;
    }
    if (seg.negativePrompt) {
      finalNegative += `, ${seg.negativePrompt}`;
    }
    return {
      ...seg,
      negativePrompt: finalNegative,
    };
  });
}

export async function generateAllPrompts(
  figureName: string,
  era: string,
  archetype: string,
  fullLyrics: string,
  totalClips: number,
  styleMode: 'grounded' | 'fantasy' = 'grounded',
): Promise<BatchPromptResult[]> {
  const numSegments = totalClips;
  const lines = fullLyrics.split('\n').filter((l) => l.trim() && !l.startsWith('['));
  const linesPerSegment = Math.max(1, Math.ceil(lines.length / numSegments));

  // Build all segments
  const segments: { index: number; start: number; end: number; beatType: BeatType; lyric: string }[] = [];

  for (let i = 0; i < numSegments; i++) {
    const startLine = i * linesPerSegment;
    const segmentLines = lines.slice(startLine, startLine + linesPerSegment);
    segments.push({
      index: i,
      start: i * 5,
      end: (i + 1) * 5,
      beatType: getBeatTypeFromPosition(i / numSegments),
      lyric: segmentLines.join(' ') || '[instrumental]',
    });
  }

  // Create story context from lyrics
  const storyContext = lines.slice(0, 5).join(' ').slice(0, 200);

  // Split into batches
  const batches: (typeof segments)[] = [];
  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    batches.push(segments.slice(i, i + BATCH_SIZE));
  }

  console.log(`   🎬 BATCHED GENERATION: ${numSegments} clips split into ${batches.length} GPT calls`);

  // Generate each batch
  const allGptResults: { index: number; prompt: string; negativePrompt: string; visualConcept: string }[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(
      `   📝 Batch ${batchIdx + 1}/${batches.length}: Generating clips ${batch[0].index + 1}-${batch[batch.length - 1].index + 1}...`,
    );

    // Try batch with one retry on failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const batchResults = await generateBatchPrompts(
          figureName,
          era,
          archetype,
          batch,
          batchIdx,
          batches.length,
          storyContext,
          styleMode,
        );

        console.log(`   ✅ Batch ${batchIdx + 1}: Got ${batchResults.length}/${batch.length} prompts`);

        // Map results by index for reliability
        for (const result of batchResults) {
          if (result.prompt) {
            allGptResults.push(result);
          }
        }

        // Small delay between batches to avoid rate limits
        if (batchIdx < batches.length - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
        break; // Success — exit retry loop
      } catch (err: any) {
        if (attempt === 0) {
          console.warn(`   ⚠️ Batch ${batchIdx + 1} attempt 1 failed: ${err.message} — retrying in 3s...`);
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          console.error(`   ❌ Batch ${batchIdx + 1} failed after 2 attempts: ${err.message}`);
        }
      }
    }
  }

  console.log(`   📊 Total GPT prompts received: ${allGptResults.length}/${numSegments}`);

  // Build final prompts array, ensuring ALL segments are covered
  const promptsByIndex = new Map<number, (typeof allGptResults)[0]>();
  for (const result of allGptResults) {
    promptsByIndex.set(result.index, result);
  }

  const allPrompts: BatchPromptResult[] = [];
  const defaultNegative = styleMode === 'fantasy' ? FANTASY_NEGATIVE : STANDARD_NEGATIVE;

  for (let i = 0; i < numSegments; i++) {
    const segment = segments[i];
    const gptResult = promptsByIndex.get(i);

    if (gptResult && gptResult.prompt) {
      allPrompts.push({
        segment_index: i,
        timestamp: `${segment.start}-${segment.end}s`,
        beat_type: segment.beatType,
        lyric_excerpt: segment.lyric.slice(0, 50),
        prompt: enforceEraConstraints(validateAndCompressPrompt(ensureKlingFormat(gptResult.prompt)), era),
        negative_prompt: gptResult.negativePrompt || defaultNegative,
        visual_logic: gptResult.visualConcept || '',
      });
    } else {
      // Fallback: build a proper camera-first Kling prompt from figure/era/archetype
      const fallbackPrompt = buildFallbackKlingPrompt(figureName, era, archetype, segment, i, numSegments, styleMode);

      allPrompts.push({
        segment_index: i,
        timestamp: `${segment.start}-${segment.end}s`,
        beat_type: segment.beatType,
        lyric_excerpt: segment.lyric.slice(0, 50),
        prompt: enforceEraConstraints(validateAndCompressPrompt(ensureKlingFormat(fallbackPrompt)), era),
        negative_prompt: defaultNegative,
        visual_logic: '[template fallback]',
      });

      console.log(`   ⚠️ Clip ${i + 1}: Missing from Gemini, using structured fallback template`);
    }
  }

  console.log(
    `   ✅ Final prompt count: ${allPrompts.length}/${numSegments} (${allPrompts.filter((p) => !p.visual_logic.includes('fallback')).length} from GPT)`,
  );

  return allPrompts;
}

/**
 * Build a proper camera-first Kling prompt when Gemini batch generation fails.
 * Uses figure/era/archetype and beatType to create visually coherent prompts
 * instead of stuffing raw lyrics into a generic template.
 */
function buildFallbackKlingPrompt(
  figureName: string,
  era: string,
  archetype: string,
  segment: { start: number; end: number; beatType: BeatType; lyric: string },
  clipIndex: number,
  totalClips: number,
  styleMode: 'grounded' | 'fantasy',
): string {
  if (styleMode === 'fantasy') {
    const elements = ['fire', 'ice', 'shadow', 'divine'];
    const cameras = [
      'Camera slowly pushes in on',
      'Camera orbits around',
      'Static shot of',
      'Camera pulls back revealing',
    ];
    return `${cameras[clipIndex % 4]} a vibrant fantasy ${archetype} figure with dramatic ${elements[clipIndex % 4]}-themed aura, powerful pose, epic fantasy landscape, volumetric lighting, photorealistic, 35mm film grain, shallow depth of field`;
  }

  // Camera-first structure matching KLING_GROUNDED_PROMPT best practices
  const cameraByBeat: Record<string, string> = {
    hook: 'Camera slowly pushes in on',
    setup: 'Static shot of',
    rising: 'Slow tracking shot following',
    conflict: 'Camera dramatically pushes in on',
    climax: 'Camera dramatically pushes in on',
    resolution: 'Camera slowly pulls back revealing',
    hook_next: 'Camera slowly orbits',
  };

  const actionByBeat: Record<string, string[]> = {
    hook: [
      'standing tall against the horizon',
      'staring directly into camera with fierce intensity',
      'emerging from shadow into golden light',
    ],
    setup: [
      'surveying the landscape from a ridge',
      'sitting on a weathered throne in contemplation',
      'walking through a torch-lit corridor',
    ],
    rising: [
      'striding forward with determined pace',
      'drawing a sword from its leather scabbard',
      'mounting a horse on the dusty steppe',
    ],
    conflict: [
      'slamming a fist on a wooden war table',
      'pointing a blade toward the horizon',
      'shouting a battle cry with clenched fists',
    ],
    climax: [
      'charging forward on horseback through dust clouds',
      'raising a bloodied sword in triumph',
      'standing over a fallen battlefield at golden hour',
    ],
    resolution: [
      'kneeling alone on the battlefield as rain falls',
      'placing a hand on a cracked stone throne',
      'walking away into vast empty steppe at dusk',
    ],
    hook_next: [
      'turning to face a new horizon',
      'gripping the reins of a war horse at dawn',
      'standing silhouetted against a burning sky',
    ],
  };

  const camera = cameraByBeat[segment.beatType] || 'Camera slowly pushes in on';
  const actions = actionByBeat[segment.beatType] || actionByBeat.rising;
  const action = actions[clipIndex % actions.length];

  // Get era-appropriate materials
  const eraConstraints = getEraConstraints(era);
  const materials =
    eraConstraints.forbiddenItems.length > 0 ? 'weathered leather armor and iron helm' : 'period-appropriate attire';

  return `${camera} a ${era} ${archetype} warrior ${figureName} in ${materials}, ${action}, ${era} setting with packed earth and aged stone, dramatic natural lighting with dust particles, photorealistic, 35mm film grain, shallow depth of field`;
}

function ensureKlingFormat(prompt: string): string {
  let fixed = prompt;
  // Remove any legacy 9:16 references (aspect ratio set via API parameter)
  fixed = fixed.replace(/\s*9:16\.?\s*/g, ' ').trim();
  // Strip any --no flags (Stable Diffusion syntax, Kling ignores these — wastes char budget)
  fixed = fixed.replace(/\s*--no\s+[^,.]*/g, '').trim();
  return fixed;
}

const STYLE_ANCHOR = 'cinematic composition, natural lighting, photorealistic detail';

// Redundant quality words that Kling ignores — just waste char budget
const REDUNDANT_QUALITY_WORDS = [
  'stunning',
  'breathtaking',
  'ultra-detailed',
  'ultra detailed',
  'hyper-detailed',
  'hyper detailed',
  '4K',
  '8K',
  'masterpiece',
  'best quality',
  'award-winning',
  'award winning',
  'highly detailed',
  'extremely detailed',
  'intricate details',
  'unreal engine',
  'octane render',
  'ray tracing',
];

// Complex camera terms — Kling 3.0 handles most of these well, only strip truly broken ones
const COMPLEX_CAMERA_TERMS = [
  'jib shot', // niche term Kling doesn't understand
];

// VFX/magic language that triggers Kling safety filters or produces bad output
const VFX_LANGUAGE = [
  'glowing',
  'magical',
  'supernatural',
  'ethereal glow',
  'mystical aura',
  'energy burst',
  'light beams',
  'particle effects',
  'morphing',
  'transforming',
];

/**
 * Sanitize prompt for Kling safety — remove terms that degrade output quality.
 * Camera instruction moved to front if not already there.
 */
function sanitizeForKlingSafety(prompt: string): string {
  let cleaned = prompt;

  // Remove VFX/magic language
  for (const term of VFX_LANGUAGE) {
    cleaned = cleaned.replace(new RegExp(`\\b${term}\\b`, 'gi'), '');
  }

  // Remove complex camera terms
  for (const term of COMPLEX_CAMERA_TERMS) {
    cleaned = cleaned.replace(new RegExp(`\\b${term}\\b`, 'gi'), '');
  }

  // Remove redundant quality descriptors
  for (const term of REDUNDANT_QUALITY_WORDS) {
    cleaned = cleaned.replace(new RegExp(`\\b${term}\\b`, 'gi'), '');
  }

  // Clean up double commas, double spaces, leading/trailing commas
  cleaned = cleaned
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*\./g, '.')
    .trim();
  cleaned = cleaned.replace(/^[,\s]+/, '').replace(/[,\s]+$/, '');

  return cleaned;
}

/**
 * Post-generation gate: ensures every prompt reaching Kling is under 400 chars
 * with the style anchor intact.
 *
 * Steps:
 * 1. Strip --no flags (safety net)
 * 2. Sanitize for Kling safety (remove VFX, complex camera, redundant quality words)
 * 3. If over 550 chars: truncate at last comma boundary, re-append style anchor
 * 4. Ensure style anchor present if room
 */
export function validateAndCompressPrompt(prompt: string): string {
  const MAX_CHARS = 550; // Kling 3.0 handles longer prompts (up from 400)

  // 1. Strip --no flags
  let result = prompt.replace(/\s*--no\s+[^,.]*/g, '').trim();

  // 2. Strip 9:16 references
  result = result.replace(/\s*9:16\.?\s*/g, ' ').trim();

  // 3. Sanitize for Kling safety
  result = sanitizeForKlingSafety(result);

  // 4. Check if style anchor already present
  const hasStyleAnchor = result.toLowerCase().includes('cinematic') || result.toLowerCase().includes('photorealistic');

  // 5. If under budget with anchor, we're done
  if (result.length <= MAX_CHARS && hasStyleAnchor) {
    return result;
  }

  // 6. If under budget but missing anchor, append it
  if (!hasStyleAnchor && result.length + STYLE_ANCHOR.length + 2 <= MAX_CHARS) {
    if (!result.endsWith(',') && !result.endsWith('.')) {
      result += ',';
    }
    result += ` ${STYLE_ANCHOR}`;
    return result;
  }

  // 7. Over budget — truncate at last comma boundary, then re-append style anchor
  if (result.length > MAX_CHARS) {
    const budgetForContent = MAX_CHARS - STYLE_ANCHOR.length - 2; // 2 for ", "
    const cutPoint = result.lastIndexOf(',', budgetForContent);
    if (cutPoint > budgetForContent / 2) {
      result = result.substring(0, cutPoint).trim();
    } else {
      // No good comma boundary — hard cut
      result = result.substring(0, budgetForContent).trim();
    }
    // Re-append style anchor
    if (!result.endsWith(',')) result += ',';
    result += ` ${STYLE_ANCHOR}`;
  } else if (!hasStyleAnchor) {
    // Under budget but no room for full anchor — skip it to preserve content
  }

  return result;
}

// Legacy function for backward compatibility
export async function generateSinglePrompt(
  figureName: string,
  era: string,
  archetype: string,
  segment: SegmentInput,
): Promise<{ prompt: string; negative_prompt: string; visual_logic: string }> {
  const result = await generateGroundedPrompt(
    figureName,
    era,
    archetype as Archetype,
    segment.beat_type,
    segment.beat_type === 'climax' ? 'peak' : 'medium',
    segment.lyric_line,
  );
  return {
    prompt: validateAndCompressPrompt(ensureKlingFormat(result.prompt)),
    negative_prompt: result.negativePrompt,
    visual_logic: result.visualConcept,
  };
}

export function parseLyricsToSegments(lyrics: string, totalClips: number): SegmentInput[] {
  const lines = lyrics.split('\n').filter((line) => line.trim().length > 0);
  const linesPerClip = Math.max(1, Math.ceil(lines.length / totalClips));

  const segments: SegmentInput[] = [];

  for (let i = 0; i < totalClips; i++) {
    const startLine = i * linesPerClip;
    const endLine = Math.min(startLine + linesPerClip, lines.length);
    const segmentLines = lines.slice(startLine, endLine);

    segments.push({
      segment_index: i,
      timestamp: `${i * 5}-${(i + 1) * 5}s`,
      beat_type: getBeatTypeFromPosition(i / totalClips) as SegmentInput['beat_type'],
      lyric_line: segmentLines.join(' ').slice(0, 200),
    });
  }

  return segments;
}

// ============================================================================
// RETENTION-OPTIMIZED PROMPT GENERATION (2025 YouTube Shorts Research)
// ============================================================================

export interface RetentionAwareOptions {
  figureName: string;
  era: string;
  archetype: string;
  fullLyrics: string;
  totalClips: number;
  videoDurationSeconds: number;
  aspectRatio?: '9:16' | '16:9';
  topic?: string;
}

export interface RetentionAwareResult {
  prompts: BatchPromptResult[];
  retentionOptimization: RetentionOptimization;
  smartChapters: { time: number; label: string; description: string }[];
}

/**
 * Generate prompts with retention optimization applied
 * Includes pattern interrupts, mid-video hooks, and psychological triggers
 */
export async function generateRetentionAwarePrompts(options: RetentionAwareOptions): Promise<RetentionAwareResult> {
  console.log(`🎬 [Retention-Aware] Generating ${options.totalClips} prompts with retention optimization...`);

  // First, get retention optimization analysis with error handling
  let optimization: RetentionOptimization;
  try {
    optimization = await retentionOptimizer.optimizeForRetention({
      script: options.fullLyrics,
      videoDurationSeconds: options.videoDurationSeconds,
      aspectRatio: options.aspectRatio || '9:16',
      topic: options.topic || options.figureName,
      firstThreeSecondsContent: options.fullLyrics.split('\n')[0]?.slice(0, 100),
    });
  } catch (error: any) {
    console.warn(`⚠️ [Retention-Aware] Optimization failed, using defaults: ${error.message}`);
    // Provide safe defaults if optimization fails
    optimization = {
      patternInterrupts: retentionOptimizer.generatePatternInterrupts(options.videoDurationSeconds),
      hookPoints: retentionOptimizer.getMidVideoHookPoints(options.videoDurationSeconds),
      emotionalTriggers: [],
      loopSuggestions: { loopPotential: 0.5, cadenceType: 'unknown', crossFadeDuration: 0.3, suggestions: [] },
      hookAnalysis: {
        hookStrength: 0.5,
        promisePresent: false,
        proofPresent: false,
        payoffTeased: false,
        startsMidAction: false,
        suggestions: [],
        thirtySecondAnchorStrength: 0.5,
      },
      narrativeOptimizations: {
        characterCount: 1,
        dayInLifeScore: 0.5,
        visualToNarrationRatio: 1.0,
        factCheckSlots: [],
        suggestions: [],
      },
      smartChapters: retentionOptimizer.getSmartChapters(options.videoDurationSeconds),
      musicCompliance: { isCompliant: true, maxSafeDuration: 90, warnings: [] },
      retentionScore: 50,
      benchmarkComparison: [],
    };
  }

  console.log(`   ♻️ Retention Score: ${optimization.retentionScore}/100`);
  console.log(`   ♻️ Pattern Interrupts: ${optimization.patternInterrupts?.length || 0}`);
  console.log(`   ♻️ Hook Points: ${optimization.hookPoints?.length || 0}`);
  console.log(`   ♻️ Emotional Triggers: ${optimization.emotionalTriggers?.length || 0}`);

  // Generate base prompts
  const basePrompts = await generateAllPrompts(
    options.figureName,
    options.era,
    options.archetype,
    options.fullLyrics,
    options.totalClips,
  );

  // Calculate clip duration from total clips and video duration
  const clipDuration = options.videoDurationSeconds / options.totalClips;

  // Enhance prompts with retention guidance (null-safe access)
  const hookPoints = optimization.hookPoints || [];
  const patternInterrupts = optimization.patternInterrupts || [];
  const hookAnalysis = optimization.hookAnalysis || { hookStrength: 0.5 };

  const enhancedPrompts = basePrompts.map((prompt, index) => {
    const clipStart = index * clipDuration;
    const clipEnd = clipStart + clipDuration;

    // Check if this clip is at a hook point (null-safe)
    const hookAtClip = hookPoints.find((h) => h.timestamp >= clipStart && h.timestamp < clipEnd);

    // Check if this is the first clip (critical hook)
    const isFirstClip = index === 0;

    // Get pattern interrupt guidance for this clip (null-safe)
    const interruptsInClip = patternInterrupts.filter((i) => i.clipIndex === index);

    let enhancedPrompt = prompt.prompt;
    let visualLogic = prompt.visual_logic;

    // Add hook guidance for first clip
    if (isFirstClip && hookAnalysis.hookStrength < 0.7) {
      visualLogic += ' | HOOK: Start mid-action for maximum retention';
      if (!enhancedPrompt.toLowerCase().includes('dramatic')) {
        enhancedPrompt = enhancedPrompt.replace(/,\s*camera/, ', dramatic moment, camera');
      }
    }

    // Add mid-video hook guidance
    if (hookAtClip) {
      visualLogic += ` | MID-HOOK (${hookAtClip.chapterLabel || hookAtClip.hookType}): ${hookAtClip.suggestion}`;
    }

    // Add pattern interrupt notes
    if (interruptsInClip.length > 0) {
      const interruptTypes = interruptsInClip.map((i) => i.type).join(', ');
      visualLogic += ` | PATTERN INTERRUPT: ${interruptTypes}`;
    }

    return {
      ...prompt,
      prompt: enhancedPrompt,
      visual_logic: visualLogic,
    };
  });

  console.log(`   ✅ Enhanced ${enhancedPrompts.length} prompts with retention optimization`);

  // ============================================
  // LEVEL 5: DYNAMIC MODEL ROUTER - Record outcome for learning
  // ============================================
  try {
    await dynamicModelRouter.recordOutcome(
      'gemini-2.5-flash',
      'prompt_generation',
      true, // success
      optimization.retentionScore / 100, // quality score 0-1
      0, // latency (not tracked here)
      0.01 * enhancedPrompts.length, // estimated cost
    );
  } catch (routerErr: any) {
    console.warn(`   ⚠️ Model router outcome recording failed (non-blocking): ${routerErr.message}`);
  }

  return {
    prompts: enhancedPrompts,
    retentionOptimization: optimization,
    smartChapters: optimization.smartChapters || [],
  };
}

/**
 * Get retention guidance for a specific clip index
 * Used during video generation for real-time optimization
 */
export function getClipRetentionGuidance(
  clipIndex: number,
  clipDuration: number,
  totalClips: number,
  videoDurationSeconds: number,
): string {
  const clipStart = clipIndex * clipDuration;
  const clipEnd = clipStart + clipDuration;
  const guidance: string[] = [];

  // First clip is critical (valley of death)
  if (clipIndex === 0) {
    guidance.push(
      'CRITICAL HOOK: First 3 seconds determine 75% of viewers. Start mid-action with promise-proof-payoff.',
    );
  }

  // 30-second anchor (clips 5-6 for 5s clips)
  if (clipStart <= 30 && clipEnd >= 30) {
    guidance.push('30-SECOND ANCHOR: Must maintain 50%+ viewers. Insert pattern interrupt or curiosity gap.');
  }

  // 60-second hook (for longer videos)
  if (videoDurationSeconds >= 90 && clipStart <= 60 && clipEnd >= 60) {
    guidance.push('60-SECOND BLIND TURN: Insert narrative twist or tempo shift to re-engage.');
  }

  // 120-second hook (for 3-minute videos)
  if (videoDurationSeconds >= 150 && clipStart <= 120 && clipEnd >= 120) {
    guidance.push('120-SECOND PAYOFF TEASE: Reveal partial answer, build to final climax.');
  }

  // Last clip - loop setup
  if (clipIndex === totalClips - 1) {
    guidance.push('LOOP SETUP: End with unresolved visual that connects back to opening.');
  }

  // Pattern interrupt timing
  const interruptCount = Math.floor((clipEnd - clipStart) / 3);
  if (interruptCount > 0) {
    guidance.push(`Include ${interruptCount}+ visual changes (zoom, color shift, or angle change).`);
  }

  return guidance.join(' | ');
}

console.log('✅ Kling-Grounded Cinematic System v2.1 loaded (with Retention Optimizer + CACI)');
