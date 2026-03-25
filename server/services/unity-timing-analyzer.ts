/**
 * UNITY TIMING ANALYZER
 *
 * Calculates accurate song duration from lyrics + BPM before generation.
 * Uses OpenAI for precise syllable counting and section analysis.
 * Enables proper synchronization between lyrics, Suno audio, and VEO video clips.
 */

import { openaiService } from './openai-service';
import { UNITY_MUSIC_CONFIG } from '../config/video-constants';

export interface SectionTiming {
  name: string;
  type: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'drop' | 'hook' | 'instrumental';
  lineCount: number;
  syllableCount: number;
  estimatedBeats: number;
  estimatedDurationSeconds: number;
  veoClipsNeeded: number;
  beatSyncPoints: number[];
}

export interface TimingAnalysis {
  totalSyllables: number;
  totalBeats: number;
  totalDurationSeconds: number;
  formattedDuration: string;
  bpm: number;
  syllablesPerBeat: number;
  sections: SectionTiming[];
  totalVeoClips: number;
  estimatedVeoCost: number;
  warnings: string[];
  recommendations: string[];
}

export interface TimingOptions {
  bpm?: number;
  targetDurationSeconds?: number;
  clipDurationSeconds?: number;
  syllablesPerBeat?: number;
}

const DEFAULT_CLIP_DURATION = 5; // Kling 5-second clips
const DEFAULT_SYLLABLES_PER_BEAT = 2; // Typical rap delivery
const KLING_COST_PER_CLIP = 1.5; // Kling AI: $1.50 per 15-second clip (300 credits @ $0.005/credit)

/**
 * Calculate timing for lyrics before generation
 */
export async function analyzeLyricsTiming(lyrics: string, options: TimingOptions = {}): Promise<TimingAnalysis> {
  const {
    bpm = UNITY_MUSIC_CONFIG.DEFAULT_BPM,
    targetDurationSeconds,
    clipDurationSeconds = DEFAULT_CLIP_DURATION,
    syllablesPerBeat = DEFAULT_SYLLABLES_PER_BEAT,
  } = options;

  console.log('⏱️ Analyzing lyrics timing...');

  // Use AI to count syllables accurately
  const sectionAnalysis = await analyzeWithAI(lyrics, bpm);

  // Calculate totals
  const totalSyllables = sectionAnalysis.reduce((sum, s) => sum + s.syllableCount, 0);
  const totalBeats = Math.ceil(totalSyllables / syllablesPerBeat);
  const secondsPerBeat = 60 / bpm;
  const totalDurationSeconds = totalBeats * secondsPerBeat;

  // Add VEO clip calculations to each section
  const sectionsWithClips = sectionAnalysis.map((section) => {
    const clips = Math.ceil(section.estimatedDurationSeconds / clipDurationSeconds);
    const beatSyncPoints = generateBeatSyncPoints(section.estimatedDurationSeconds, bpm, clipDurationSeconds);
    return {
      ...section,
      veoClipsNeeded: clips,
      beatSyncPoints,
    };
  });

  const totalVeoClips = sectionsWithClips.reduce((sum, s) => sum + s.veoClipsNeeded, 0);
  const estimatedVeoCost = totalVeoClips * KLING_COST_PER_CLIP; // Kling: $0.10 per clip flat rate

  // Generate warnings and recommendations
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (totalDurationSeconds > 180) {
    warnings.push(`Song duration (${formatDuration(totalDurationSeconds)}) exceeds 3 minute target`);
    recommendations.push('Consider reducing verse lengths or removing a section');
  }

  if (totalDurationSeconds < 60) {
    warnings.push(`Song duration (${formatDuration(totalDurationSeconds)}) is very short`);
    recommendations.push('Consider adding another verse or extending the chorus');
  }

  if (totalVeoClips > 25) {
    warnings.push(`High clip count (${totalVeoClips}) will increase generation time and cost`);
    recommendations.push('Consider longer clips or fewer sections');
  }

  const result: TimingAnalysis = {
    totalSyllables,
    totalBeats,
    totalDurationSeconds,
    formattedDuration: formatDuration(totalDurationSeconds),
    bpm,
    syllablesPerBeat,
    sections: sectionsWithClips,
    totalVeoClips,
    estimatedVeoCost: Math.round(estimatedVeoCost * 100) / 100,
    warnings,
    recommendations,
  };

  console.log(
    `✅ Timing analysis complete: ${result.formattedDuration}, ${totalVeoClips} clips, $${result.estimatedVeoCost}`,
  );

  return result;
}

/**
 * Use OpenAI for accurate syllable counting and section analysis
 */
async function analyzeWithAI(lyrics: string, bpm: number): Promise<SectionTiming[]> {
  const prompt = `Analyze these lyrics and count syllables accurately for each section.

LYRICS:
${lyrics}

For each section, provide:
1. Section name (from the [SECTION] markers)
2. Section type (intro, verse, chorus, bridge, outro, drop, hook, or instrumental)
3. Line count (excluding empty lines and stage directions)
4. Total syllable count (count EVERY syllable accurately - this is critical for timing)
5. Estimated beats (syllables ÷ 2 for typical rap delivery)

IMPORTANT SYLLABLE COUNTING RULES:
- "divided" = 3 syllables (di-vi-ded)
- "united" = 3 syllables (u-ni-ted)  
- "algorithm" = 4 syllables (al-go-rith-m)
- Contractions count as spoken: "don't" = 1, "gotta" = 2
- Skip instrumental directions like "[beat drops]"

Respond in JSON format:
{
  "sections": [
    {
      "name": "INTRO",
      "type": "intro",
      "lineCount": 2,
      "syllableCount": 24
    }
  ]
}`;

  try {
    const response = await openaiService.generateText(prompt, {
      temperature: 0.3, // Low temperature for accuracy
      maxTokens: 2000,
      systemPrompt:
        'You are a precise lyric analyzer. Count syllables exactly as they would be spoken/rapped. Be accurate - timing depends on this.',
    });

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('AI response did not contain valid JSON, using fallback');
      return fallbackAnalysis(lyrics, bpm);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const sections = parsed.sections || [];

    // Calculate timing for each section
    const secondsPerBeat = 60 / bpm;
    return sections.map((section: any) => {
      const estimatedBeats = Math.ceil(section.syllableCount / 2);
      const estimatedDurationSeconds = estimatedBeats * secondsPerBeat;

      return {
        name: section.name,
        type: section.type || 'verse',
        lineCount: section.lineCount || 0,
        syllableCount: section.syllableCount || 0,
        estimatedBeats,
        estimatedDurationSeconds: Math.round(estimatedDurationSeconds * 10) / 10,
        veoClipsNeeded: 0, // Will be calculated later
        beatSyncPoints: [],
      };
    });
  } catch (error) {
    console.error('AI timing analysis failed:', error);
    return fallbackAnalysis(lyrics, bpm);
  }
}

/**
 * Fallback syllable counting when AI is unavailable
 */
function fallbackAnalysis(lyrics: string, bpm: number): SectionTiming[] {
  const sections: SectionTiming[] = [];
  const sectionRegex = /\[([^\]]+)\]/gi;
  const sectionMarkers: Array<{ name: string; start: number }> = [];

  let match;
  while ((match = sectionRegex.exec(lyrics)) !== null) {
    sectionMarkers.push({ name: match[1], start: match.index + match[0].length });
  }

  for (let i = 0; i < sectionMarkers.length; i++) {
    const start = sectionMarkers[i].start;
    const end =
      i < sectionMarkers.length - 1
        ? sectionMarkers[i + 1].start - sectionMarkers[i + 1].name.length - 2
        : lyrics.length;
    const content = lyrics.slice(start, end).trim();

    const lines = content.split('\n').filter((line) => line.trim() && !line.startsWith('(') && !line.startsWith('['));

    // Rough syllable estimate: average 2 syllables per word
    const words = content
      .replace(/[^a-zA-Z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const syllableCount = words.length * 2;

    const estimatedBeats = Math.ceil(syllableCount / 2);
    const secondsPerBeat = 60 / bpm;
    const estimatedDurationSeconds = estimatedBeats * secondsPerBeat;

    sections.push({
      name: sectionMarkers[i].name,
      type: detectSectionType(sectionMarkers[i].name),
      lineCount: lines.length,
      syllableCount,
      estimatedBeats,
      estimatedDurationSeconds: Math.round(estimatedDurationSeconds * 10) / 10,
      veoClipsNeeded: 0,
      beatSyncPoints: [],
    });
  }

  return sections;
}

/**
 * Detect section type from name
 */
function detectSectionType(name: string): SectionTiming['type'] {
  const upper = name.toUpperCase();
  if (upper.includes('INTRO')) return 'intro';
  if (upper.includes('VERSE')) return 'verse';
  if (upper.includes('CHORUS') || upper.includes('HOOK')) return 'chorus';
  if (upper.includes('BRIDGE')) return 'bridge';
  if (upper.includes('OUTRO')) return 'outro';
  if (upper.includes('DROP')) return 'drop';
  if (upper.includes('INSTRUMENTAL')) return 'instrumental';
  return 'verse';
}

/**
 * Generate beat sync points for VEO clips
 */
function generateBeatSyncPoints(durationSeconds: number, bpm: number, clipDuration: number): number[] {
  const points: number[] = [];
  const beatInterval = 60 / bpm;
  const clipCount = Math.ceil(durationSeconds / clipDuration);

  for (let clip = 0; clip < clipCount; clip++) {
    const clipStart = clip * clipDuration;
    // Key moments: start, halfway, end of each clip
    points.push(clipStart);
    points.push(clipStart + clipDuration / 2);
    points.push(clipStart + clipDuration - 0.5);
  }

  return points;
}

/**
 * Format seconds as MM:SS
 */
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Estimate duration before lyrics are generated
 */
export function estimateDurationFromStructure(
  structure: {
    intro?: number;
    verses?: number;
    verseLinesEach?: number;
    choruses?: number;
    chorusLinesEach?: number;
    bridge?: boolean;
    outro?: number;
  },
  bpm: number = UNITY_MUSIC_CONFIG.DEFAULT_BPM,
): {
  estimatedDurationSeconds: number;
  formattedDuration: string;
  estimatedClips: number;
  breakdown: Record<string, number>;
} {
  const syllablesPerLine = 8; // Target for rap
  const syllablesPerBeat = 2;
  const secondsPerBeat = 60 / bpm;
  const clipDuration = 8;

  const breakdown: Record<string, number> = {};
  let totalSyllables = 0;

  // Intro (usually instrumental or minimal lyrics)
  const introLines = structure.intro ?? 2;
  const introSyllables = (introLines * syllablesPerLine) / 2; // Lighter lyrics
  breakdown.intro = Math.round((introSyllables / syllablesPerBeat) * secondsPerBeat);
  totalSyllables += introSyllables;

  // Verses
  const verseCount = structure.verses ?? 2;
  const verseLinesEach = structure.verseLinesEach ?? 12;
  const verseSyllablesEach = verseLinesEach * syllablesPerLine;
  for (let i = 1; i <= verseCount; i++) {
    breakdown[`verse${i}`] = Math.round((verseSyllablesEach / syllablesPerBeat) * secondsPerBeat);
    totalSyllables += verseSyllablesEach;
  }

  // Choruses
  const chorusCount = structure.choruses ?? 2;
  const chorusLinesEach = structure.chorusLinesEach ?? 8;
  const chorusSyllablesEach = chorusLinesEach * syllablesPerLine;
  for (let i = 1; i <= chorusCount; i++) {
    breakdown[`chorus${i}`] = Math.round((chorusSyllablesEach / syllablesPerBeat) * secondsPerBeat);
    totalSyllables += chorusSyllablesEach;
  }

  // Bridge
  if (structure.bridge) {
    const bridgeSyllables = 6 * syllablesPerLine;
    breakdown.bridge = Math.round((bridgeSyllables / syllablesPerBeat) * secondsPerBeat);
    totalSyllables += bridgeSyllables;
  }

  // Outro
  const outroLines = structure.outro ?? 4;
  const outroSyllables = outroLines * syllablesPerLine;
  breakdown.outro = Math.round((outroSyllables / syllablesPerBeat) * secondsPerBeat);
  totalSyllables += outroSyllables;

  const estimatedDurationSeconds = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const estimatedClips = Math.ceil(estimatedDurationSeconds / clipDuration);

  return {
    estimatedDurationSeconds,
    formattedDuration: formatDuration(estimatedDurationSeconds),
    estimatedClips,
    breakdown,
  };
}

/**
 * Adjust lyrics structure to hit target duration
 */
export function suggestStructureForDuration(
  targetDurationSeconds: number,
  bpm: number = UNITY_MUSIC_CONFIG.DEFAULT_BPM,
): {
  verses: number;
  verseLinesEach: number;
  choruses: number;
  chorusLinesEach: number;
  bridge: boolean;
  intro: number;
  outro: number;
} {
  const syllablesPerLine = 8;
  const syllablesPerBeat = 2;
  const secondsPerBeat = 60 / bpm;

  // Work backwards from target duration
  const totalBeats = targetDurationSeconds / secondsPerBeat;
  const totalSyllables = totalBeats * syllablesPerBeat;
  const totalLines = Math.floor(totalSyllables / syllablesPerLine);

  if (targetDurationSeconds <= 60) {
    // Short format: 1 verse, 1 chorus
    return {
      verses: 1,
      verseLinesEach: Math.min(8, Math.floor(totalLines * 0.5)),
      choruses: 1,
      chorusLinesEach: Math.min(6, Math.floor(totalLines * 0.4)),
      bridge: false,
      intro: 2,
      outro: 2,
    };
  } else if (targetDurationSeconds <= 120) {
    // Medium format: 2 verses, 2 choruses
    return {
      verses: 2,
      verseLinesEach: Math.min(10, Math.floor(totalLines * 0.3)),
      choruses: 2,
      chorusLinesEach: Math.min(8, Math.floor(totalLines * 0.2)),
      bridge: false,
      intro: 2,
      outro: 4,
    };
  } else {
    // Full format: 2-3 verses, 2-3 choruses, bridge
    return {
      verses: 2,
      verseLinesEach: Math.min(14, Math.floor(totalLines * 0.25)),
      choruses: 3,
      chorusLinesEach: Math.min(8, Math.floor(totalLines * 0.15)),
      bridge: true,
      intro: 2,
      outro: 6,
    };
  }
}

/**
 * Recalculate timing when actual audio duration is known (e.g., after MP3 upload)
 * Scales all section durations proportionally to fit the actual audio
 */
export function recalculateTimingForAudioDuration(
  originalTiming: any, // Accept any timing format
  actualAudioDurationSeconds: number,
  clipDurationSeconds: number = 8,
): any {
  // Handle both possible property names: 'sections' or 'sectionsBreakdown'
  const originalSections = originalTiming.sections || originalTiming.sectionsBreakdown || [];
  const originalDuration = originalTiming.totalDurationSeconds || originalTiming.estimatedDurationSeconds || 120;

  if (!originalSections.length) {
    console.warn('⚠️ No sections found in timing data, cannot recalculate');
    return originalTiming;
  }

  const scaleFactor = actualAudioDurationSeconds / originalDuration;

  console.log(`🔄 Recalculating timing for actual audio duration: ${formatDuration(actualAudioDurationSeconds)}`);
  console.log(`   Original: ${formatDuration(originalDuration)}, Scale factor: ${scaleFactor.toFixed(2)}`);
  console.log(`   Found ${originalSections.length} sections to scale`);

  // Scale each section proportionally - handle both naming conventions
  // DESIGN: Keep original clip counts - don't add clips for longer audio
  // Each clip naturally covers more time, and sections flow into each other

  const scaledSections = originalSections.map((section: any) => {
    const sectionDuration = section.estimatedDurationSeconds || section.durationSeconds || 10;
    const scaledDuration = sectionDuration * scaleFactor;

    // KEEP original clip count - don't increase for longer audio
    // This preserves the pacing and allows natural flow between sections
    const originalClips =
      section.veoClipsNeeded || section.clipCount || Math.ceil(sectionDuration / clipDurationSeconds);
    const newClipsNeeded = originalClips; // Preserve original count

    const bpm = originalTiming.bpm || 125;
    const newBeatSyncPoints = generateBeatSyncPointsForScaled(scaledDuration, bpm, clipDurationSeconds);

    return {
      ...section,
      estimatedDurationSeconds: Math.round(scaledDuration * 10) / 10,
      durationSeconds: Math.round(scaledDuration * 10) / 10,
      estimatedBeats: Math.round((section.estimatedBeats || section.syllables / 2 || 10) * scaleFactor),
      veoClipsNeeded: newClipsNeeded,
      clipCount: newClipsNeeded,
      beatSyncPoints: newBeatSyncPoints,
    };
  });

  const totalVeoClips = scaledSections.reduce((sum: number, s: any) => sum + (s.veoClipsNeeded || s.clipCount || 1), 0);
  const estimatedVeoCost = totalVeoClips * KLING_COST_PER_CLIP; // Kling: $0.10 per clip flat rate

  // Generate new warnings based on actual duration
  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (actualAudioDurationSeconds > 180) {
    warnings.push(`Audio duration (${formatDuration(actualAudioDurationSeconds)}) exceeds 3 minute target`);
  }

  if (actualAudioDurationSeconds < 45) {
    warnings.push(`Audio duration (${formatDuration(actualAudioDurationSeconds)}) is very short`);
  }

  if (totalVeoClips > 30) {
    warnings.push(`High clip count (${totalVeoClips}) will increase generation time and cost`);
    recommendations.push('Consider using longer clips or fewer sections');
  }

  console.log(
    `   Total VEO clips: ${totalVeoClips} (was ${originalSections.reduce((sum: number, s: any) => sum + (s.clipCount || s.veoClipsNeeded || 1), 0)})`,
  );

  return {
    totalSyllables: originalTiming.totalSyllables,
    totalBeats: Math.round((originalTiming.totalBeats || 150) * scaleFactor),
    totalDurationSeconds: actualAudioDurationSeconds,
    estimatedDurationSeconds: actualAudioDurationSeconds,
    formattedDuration: formatDuration(actualAudioDurationSeconds),
    bpm: originalTiming.bpm || 125,
    syllablesPerBeat: originalTiming.syllablesPerBeat || 2,
    sections: scaledSections,
    sectionsBreakdown: scaledSections, // Include both property names for compatibility
    totalVeoClips,
    estimatedVeoCost: Math.round(estimatedVeoCost * 100) / 100,
    warnings,
    recommendations,
  };
}

/**
 * Generate beat sync points for scaled sections
 */
function generateBeatSyncPointsForScaled(durationSeconds: number, bpm: number, clipDuration: number): number[] {
  const points: number[] = [];
  const clipCount = Math.ceil(durationSeconds / clipDuration);

  for (let clip = 0; clip < clipCount; clip++) {
    const clipStart = clip * clipDuration;
    points.push(clipStart);
    points.push(clipStart + clipDuration / 2);
    points.push(Math.min(clipStart + clipDuration - 0.5, durationSeconds));
  }

  return points.filter((p) => p <= durationSeconds);
}

export const unityTimingAnalyzer = {
  analyzeLyricsTiming,
  estimateDurationFromStructure,
  suggestStructureForDuration,
  recalculateTimingForAudioDuration,
  formatDuration,
};
