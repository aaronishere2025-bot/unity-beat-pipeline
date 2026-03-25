/**
 * Full-Track Narrative Mapper
 *
 * Maps lyrics to cohesive visual narrative structure for Kling clip generation.
 * Each 5-second clip is mapped to the EXACT lyrics playing during that window,
 * with the key action extracted so the visual directly depicts the lyrics.
 *
 * COST SAVINGS: 15 API calls → 1 API call = 73% reduction
 * QUALITY GAIN: Lyric-synced visuals → each clip matches what's being said
 */

import type { LyricSegment } from './gpt-cinematic-director';

export interface NarrativeArcData {
  mood_arc: string[];
  energy_peaks: number[];
  energy_valleys: number[];
  downbeats: number[];
  spectral_mood_curve: [number, string][];
  tempo_changes: Array<{ timestamp: number; bpm: number }>;
  visual_pacing: {
    camera_evolution: string;
    intensity_evolution: string;
    major_transitions: Array<{
      timestamp: number;
      type: 'gentle' | 'dramatic';
      from_section: string;
      to_section: string;
      energy_delta: number;
    }>;
    recommended_clip_duration: string;
  };
  cohesion_hints: {
    recurring_motifs: string[];
    color_palette_arc: string[];
    subject_consistency: string;
    visual_continuity_priority: 'high' | 'medium' | 'low';
  };
}

export interface FullTrackContext {
  figure: string;
  era: string;
  archetype: string;
  characterDescription?: string; // Verbatim physical description for character consistency across all clips
  duration: number;
  bpm: number;
  key: string | null;
  segments: Array<{
    type: string;
    start: number;
    end: number;
    energy: number;
    label?: string;
  }>;
  narrativeArc: NarrativeArcData | null; // NOW OPTIONAL
  lyrics: LyricSegment[];
  clipTimings: number[]; // [0, 5, 10, 15, ..., 60]
}

export interface ClipContext {
  index: number;
  timestamp: number;
  endTime: number;
  lyrics: string; // ALL lyrics that play during this 5s window
  energy: number;
  section: string;
  narrativePosition: string; // "opening" | "rising" | "climax" | "resolution"
}

/**
 * Get ALL lyric lines that overlap with a given time window [start, end)
 */
function getLyricsInWindow(lyrics: LyricSegment[], start: number, end: number): string {
  const overlapping: string[] = [];
  for (const lyric of lyrics) {
    // A lyric overlaps if it starts before the window ends AND ends after the window starts
    if (lyric.startTime < end && lyric.endTime > start && lyric.text.trim()) {
      overlapping.push(lyric.text.trim());
    }
  }
  return overlapping.join(' / ') || '[instrumental]';
}

/**
 * Get the narrative position based on where we are in the song
 */
function getNarrativePosition(clipIndex: number, totalClips: number): string {
  const ratio = clipIndex / totalClips;
  if (ratio < 0.15) return 'opening';
  if (ratio < 0.5) return 'rising';
  if (ratio < 0.75) return 'climax';
  return 'resolution';
}

/**
 * Get current section name at timestamp from audio segments
 */
function getSectionAtTime(segments: FullTrackContext['segments'], timestamp: number): string {
  for (const seg of segments) {
    if (timestamp >= seg.start && timestamp < seg.end) {
      return seg.label || seg.type;
    }
  }
  return 'verse';
}

/**
 * Get energy at timestamp from audio segments
 */
function getEnergyAtTime(segments: FullTrackContext['segments'], timestamp: number): number {
  for (const seg of segments) {
    if (timestamp >= seg.start && timestamp < seg.end) {
      return seg.energy;
    }
  }
  return 0.5;
}

/**
 * Build clip context for each 5-second window, mapping exact lyrics to each clip
 */
export function buildClipContexts(context: FullTrackContext): ClipContext[] {
  const clipContexts: ClipContext[] = [];
  const clipDuration = 5;

  for (let i = 0; i < context.clipTimings.length; i++) {
    const timestamp = context.clipTimings[i];
    const endTime = timestamp + clipDuration;

    clipContexts.push({
      index: i,
      timestamp,
      endTime,
      lyrics: getLyricsInWindow(context.lyrics, timestamp, endTime),
      energy: getEnergyAtTime(context.segments, timestamp),
      section: getSectionAtTime(context.segments, timestamp),
      narrativePosition: getNarrativePosition(i, context.clipTimings.length),
    });
  }

  return clipContexts;
}

// Common figurative/metaphorical patterns in lyrics
const FIGURATIVE_PATTERNS = [
  'fire in',
  'heart of',
  'soul of',
  'blood on',
  'crown weighs',
  'ghost of',
  'darkness rising',
  'light within',
  'shadow',
  'wings',
  'lion',
  'wolf',
  'eagle',
  'serpent',
  'dragon',
  'phoenix',
  'thunder',
  'storm inside',
  'weight of the world',
  'ocean of',
  'mountain of',
  'river of',
  'flame',
  'iron will',
  'steel resolve',
  'empire crumbles',
  'walls closing',
  'chains',
  'shackles',
  'rise like',
  'fall like',
  'burn',
  'drown',
];

// Action verbs that indicate literal depiction
const LITERAL_ACTION_VERBS = [
  'cross',
  'crossed',
  'crossing',
  'ride',
  'rode',
  'riding',
  'build',
  'built',
  'building',
  'sail',
  'sailed',
  'sailing',
  'fight',
  'fought',
  'fighting',
  'march',
  'marched',
  'marching',
  'conquer',
  'conquered',
  'conquering',
  'study',
  'studied',
  'studying',
  'lead',
  'led',
  'leading',
  'travel',
  'traveled',
  'traveling',
  'write',
  'wrote',
  'writing',
  'feed',
  'fed',
  'feeding',
  'pray',
  'prayed',
  'praying',
  'trade',
  'traded',
  'trading',
  'teach',
  'taught',
  'teaching',
  'give',
  'gave',
  'giving',
  'walk',
  'walked',
  'walking',
  'stand',
  'stood',
  'standing',
  'sit',
  'sat',
  'sitting',
  'kneel',
  'kneeled',
  'kneeling',
  'charge',
  'charged',
  'charging',
  'attack',
  'attacked',
  'attacking',
  'defend',
  'defended',
  'defending',
  'escape',
  'escaped',
  'escaping',
  'arrive',
  'arrived',
  'arriving',
  'enter',
  'entered',
  'entering',
  'climb',
  'climbed',
  'climbing',
  'run',
  'ran',
  'running',
];

/**
 * Extract the key activity from lyrics to give Gemini clearer scene direction.
 * Determines if lyrics are literal (show exact scene) or figurative (translate metaphor).
 */
function extractKeyActivity(lyrics: string): {
  activity: string;
  type: 'literal' | 'figurative';
  sceneDirection: string;
} {
  if (!lyrics || lyrics === '[instrumental]') {
    return {
      activity: 'transitional moment',
      type: 'literal',
      sceneDirection: 'in a reflective or transitional moment — landscape, establishing shot, or contemplative pause',
    };
  }

  const lower = lyrics.toLowerCase();

  // Check if figurative
  const isFigurative = FIGURATIVE_PATTERNS.some((pattern) => lower.includes(pattern));

  // Check if literal action
  const literalVerb = LITERAL_ACTION_VERBS.find((verb) => lower.includes(verb));

  // Extract nouns/settings for scene direction
  const words = lyrics.replace(/[^\w\s]/g, '').split(/\s+/);
  const significantWords = words.filter(
    (w) =>
      w.length > 3 &&
      !['with', 'from', 'that', 'this', 'they', 'them', 'were', 'have', 'been', 'will', 'your', 'into'].includes(
        w.toLowerCase(),
      ),
  );
  const keyPhrase = significantWords.slice(0, 5).join(' ');

  if (isFigurative && !literalVerb) {
    return {
      activity: keyPhrase || lyrics.slice(0, 40),
      type: 'figurative',
      sceneDirection: `expressing "${lyrics.slice(0, 50)}" through grounded physical action (translate the metaphor to a real visual)`,
    };
  }

  return {
    activity: keyPhrase || lyrics.slice(0, 40),
    type: 'literal',
    sceneDirection: `performing the action described: "${lyrics.slice(0, 60)}" — show this exact scene with accurate setting`,
  };
}

/**
 * Build complete visual story outline for Gemini
 *
 * LYRIC-ACTION FOCUSED: Each clip entry shows the exact lyrics playing
 * during that 5-second window and instructs Gemini to depict that action visually.
 *
 * Works with or without narrativeArc data.
 */
export function buildVisualStoryOutline(context: FullTrackContext): string {
  const { narrativeArc, duration, bpm, key, figure, era, archetype } = context;
  const clipContexts = buildClipContexts(context);

  let outline = `## LYRIC-SYNCED VIDEO NARRATIVE
Total Duration: ${duration}s | BPM: ${bpm} | Key: ${key || 'Unknown'}
Figure: ${figure} | Era: ${era} | Archetype: ${archetype}
Total Clips: ${clipContexts.length} (each 5 seconds)

## CRITICAL RULE: LYRIC-TO-VISUAL SYNC
Each 5-second Kling clip MUST visually depict what the lyrics describe during that exact time window.
- Read the lyrics for each clip below
- Extract the KEY ACTION or IMAGE from those lyrics
- Make that action/image the PRIMARY visual content of the Kling prompt
- Example: lyrics "marching to war" → clip shows figure marching with army in distance
- Example: lyrics "crown on my head" → clip shows coronation/crown being placed
- Example: lyrics "blood on the battlefield" → clip shows aftermath of battle, blood-stained ground
- If lyrics are [instrumental], use the narrative position to show a transitional visual

## CHARACTER VISUAL REFERENCE (COPY-PASTE INTO EVERY PROMPT)
${
  context.characterDescription
    ? `You MUST use this EXACT character description in every clip prompt. Do NOT paraphrase, summarize, or vary it:
"${context.characterDescription}"
- Costume can evolve (clean → battle-worn → bloodied) but the base appearance and outfit MUST match this description verbatim.`
    : `- Same actor/figure appearance across ALL clips (face, build, costume base)
- Costume can evolve (clean → battle-worn → bloodied) but same base outfit`
}
- Same era-appropriate setting palette throughout

`;

  // Add narrativeArc info if available
  if (narrativeArc) {
    outline += `## AUDIO-DRIVEN CONTEXT (from analysis)
Mood Progression: ${narrativeArc.mood_arc.join(' → ')}
Energy Peaks at: ${narrativeArc.energy_peaks.join('s, ')}s
Energy Valleys at: ${narrativeArc.energy_valleys.join('s, ')}s
Camera Evolution: ${narrativeArc.visual_pacing.camera_evolution}
Subject Consistency: ${narrativeArc.cohesion_hints.subject_consistency}
Recurring Motifs: ${narrativeArc.cohesion_hints.recurring_motifs.join(', ')}

`;
  }

  // Group clips by narrative position for a 3-act structure
  const opening = clipContexts.filter((c) => c.narrativePosition === 'opening');
  const rising = clipContexts.filter((c) => c.narrativePosition === 'rising');
  const climax = clipContexts.filter((c) => c.narrativePosition === 'climax');
  const resolution = clipContexts.filter((c) => c.narrativePosition === 'resolution');

  const renderClipBlock = (clips: ClipContext[]) => {
    let block = '';
    for (const clip of clips) {
      const activity = extractKeyActivity(clip.lyrics);
      block += `  CLIP ${clip.index + 1} [${clip.timestamp}s-${clip.endTime}s]:
    LYRICS: "${clip.lyrics}"
    → KEY ACTIVITY: ${activity.activity}
    → TYPE: ${activity.type} (${activity.type === 'literal' ? 'show this EXACT scene' : 'translate metaphor to grounded physical visual'})
    → VISUAL MUST SHOW: Figure physically ${activity.sceneDirection}
    → DO NOT: Show generic pose, ignore the setting described, reuse previous clip's scene
    Energy: ${(clip.energy * 100).toFixed(0)}% | Section: ${clip.section}
`;
    }
    return block;
  };

  if (opening.length > 0) {
    outline += `## ACT 1: OPENING (${opening[0].timestamp}s-${opening[opening.length - 1].endTime}s)
Establish character, setting. Slower camera. Build the world.
${renderClipBlock(opening)}
`;
  }

  if (rising.length > 0) {
    outline += `## ACT 2: RISING ACTION (${rising[0].timestamp}s-${rising[rising.length - 1].endTime}s)
Intensity increases. More dynamic camera. Story unfolds.
${renderClipBlock(rising)}
`;
  }

  if (climax.length > 0) {
    outline += `## ACT 3: CLIMAX (${climax[0].timestamp}s-${climax[climax.length - 1].endTime}s)
Peak intensity. Dramatic angles. Maximum action.
${renderClipBlock(climax)}
`;
  }

  if (resolution.length > 0) {
    outline += `## ACT 4: RESOLUTION (${resolution[0].timestamp}s-${resolution[resolution.length - 1].endTime}s)
Wind down. Wider shots. Reflection and legacy.
${renderClipBlock(resolution)}
`;
  }

  outline += `
## FULL LYRIC-TO-CLIP MAPPING (REFERENCE)
${clipContexts.map((c) => `  [${c.index + 1}] ${c.timestamp}s-${c.endTime}s | "${c.lyrics}" | ${c.narrativePosition} | energy:${(c.energy * 100).toFixed(0)}%`).join('\n')}
`;

  return outline;
}

/**
 * Scene group for multi-shot generation — groups 3 consecutive clips
 * into one Kling multi-shot API call.
 */
export interface SceneGroup {
  groupIndex: number;
  clips: ClipContext[];
  sectionLabel: string; // dominant section (verse/chorus/etc)
  moodArc: string; // e.g. "rising -> climax"
}

/**
 * Group ClipContexts into scene groups of N for multi-shot generation.
 * Each scene group becomes one Kling API call with native transitions.
 */
export function buildMultiShotVisualOutline(
  context: FullTrackContext,
  shotsPerGroup: number = 3,
): { sceneGroups: SceneGroup[]; outline: string } {
  const clipContexts = buildClipContexts(context);
  const { narrativeArc, duration, bpm, key, figure, era, archetype } = context;

  // Group clips into scene groups
  const sceneGroups: SceneGroup[] = [];
  for (let i = 0; i < clipContexts.length; i += shotsPerGroup) {
    const clips = clipContexts.slice(i, i + shotsPerGroup);
    const groupIndex = sceneGroups.length;

    // Determine dominant section and mood arc
    const sections = clips.map((c) => c.section);
    const sectionLabel = sections[0]; // use first clip's section as label
    const moodArc = clips
      .map((c) => c.narrativePosition)
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(' -> ');

    sceneGroups.push({ groupIndex, clips, sectionLabel, moodArc });
  }

  // Build outline text for Gemini
  let outline = `## MULTI-SHOT LYRIC-SYNCED VIDEO NARRATIVE
Total Duration: ${duration}s | BPM: ${bpm} | Key: ${key || 'Unknown'}
Figure: ${figure} | Era: ${era} | Archetype: ${archetype}
Total Clips: ${clipContexts.length} -> ${sceneGroups.length} scene groups (${shotsPerGroup} shots each, Kling handles transitions)

## CRITICAL RULE: SCENE GROUP GENERATION
Each scene group is a SINGLE Kling multi-shot API call producing a ${shotsPerGroup * 5}s clip.
Kling will create native scene transitions between shots — no FFmpeg crossfades needed.
Each shot within a group MUST flow naturally into the next.

## CHARACTER VISUAL REFERENCE (COPY-PASTE INTO EVERY PROMPT)
${
  context.characterDescription
    ? `Use this EXACT character description in every shot. Do NOT paraphrase:
"${context.characterDescription}"`
    : `Same actor/figure appearance across ALL shots (face, build, costume base)`
}

`;

  if (narrativeArc) {
    outline += `## AUDIO-DRIVEN CONTEXT
Mood Progression: ${narrativeArc.mood_arc.join(' -> ')}
Energy Peaks at: ${narrativeArc.energy_peaks.join('s, ')}s
Energy Valleys at: ${narrativeArc.energy_valleys.join('s, ')}s
Camera Evolution: ${narrativeArc.visual_pacing.camera_evolution}

`;
  }

  for (const group of sceneGroups) {
    outline += `## SCENE GROUP ${group.groupIndex + 1} (${group.clips[0].timestamp}s-${group.clips[group.clips.length - 1].endTime}s) [${group.sectionLabel}] [${group.moodArc}]
`;
    for (const clip of group.clips) {
      const activity = extractKeyActivity(clip.lyrics);
      outline += `  SHOT ${clip.index + 1} [${clip.timestamp}s-${clip.endTime}s]:
    LYRICS: "${clip.lyrics}"
    -> KEY ACTIVITY: ${activity.activity}
    -> TYPE: ${activity.type}
    -> VISUAL: Figure ${activity.sceneDirection}
    Energy: ${(clip.energy * 100).toFixed(0)}%
`;
    }
    outline += `  TRANSITION NOTE: Shots within this group should flow naturally — Kling will animate the transitions.
`;
  }

  outline += `
## SCENE GROUP REFERENCE
${sceneGroups.map((g) => `  Group ${g.groupIndex + 1}: clips ${g.clips.map((c) => c.index + 1).join(',')} | ${g.clips[0].timestamp}s-${g.clips[g.clips.length - 1].endTime}s | ${g.sectionLabel} | ${g.moodArc}`).join('\n')}
`;

  return { sceneGroups, outline };
}

/**
 * Generate compact context summary for API call
 */
export function buildCompactContext(context: FullTrackContext): string {
  return `${context.figure} (${context.archetype}) in ${context.era} | ${context.duration}s @ ${context.bpm} BPM | Key: ${context.key || 'Unknown'} | ${context.clipTimings.length} clips`;
}
