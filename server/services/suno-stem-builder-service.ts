/**
 * Suno Stem Builder Service
 *
 * Handles 3-stem music composition for 10-minute long-form videos.
 * Each stem is ~3-3.5 minutes (180-210 seconds) to reach 10 minutes total.
 *
 * STEM STRUCTURE:
 * - Stem 1 (Act 1): Prologue + Rising Conflict (0-180s)
 * - Stem 2 (Act 2): Midpoint + Escalation (180-420s with 10s crossfade)
 * - Stem 3 (Act 3): Climax + Legacy (420-600s with 10s crossfade)
 *
 * CROSSFADE STRATEGY:
 * - 10-second crossfades between stems for seamless audio
 * - Optional 15-second instrumental interludes between acts
 *
 * COST: ~$0.30 per stem (3 stems = ~$0.90 for full 10-min audio)
 */

import { db } from '../db';
import { longFormAudioSegments, longFormPackages, InsertLongFormAudioSegment } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { chapterPlannerService, ChapterType, CHAPTER_CONFIG } from './chapter-planner-service';

// Stem configuration
export interface StemConfig {
  segmentNumber: number;
  segmentType: 'act_1' | 'act_2' | 'act_3';
  chapters: ChapterType[];
  startTime: number;
  duration: number;
  crossfadeBefore: number; // Seconds of crossfade from previous stem
}

export const STEM_CONFIG: StemConfig[] = [
  {
    segmentNumber: 1,
    segmentType: 'act_1',
    chapters: ['prologue', 'rising_conflict'],
    startTime: 0,
    duration: 180,
    crossfadeBefore: 0,
  },
  {
    segmentNumber: 2,
    segmentType: 'act_2',
    chapters: ['midpoint', 'escalation'],
    startTime: 170, // 10s overlap for crossfade
    duration: 250, // Extra length for crossfade
    crossfadeBefore: 10,
  },
  {
    segmentNumber: 3,
    segmentType: 'act_3',
    chapters: ['climax', 'legacy'],
    startTime: 410, // 10s overlap for crossfade
    duration: 200, // Extra length to reach 600s+
    crossfadeBefore: 10,
  },
];

// Musical key progressions that work well together
const KEY_PROGRESSIONS = [
  { act1: 'D minor', act2: 'F major', act3: 'D minor' }, // Classic dramatic
  { act1: 'A minor', act2: 'C major', act3: 'A minor' }, // Epic tension
  { act1: 'G minor', act2: 'Bb major', act3: 'G minor' }, // Dark to triumph
  { act1: 'E minor', act2: 'G major', act3: 'E minor' }, // Emotional journey
  { act1: 'C minor', act2: 'Eb major', act3: 'C minor' }, // Beethoven-style
];

// BPM ranges for different story phases
const BPM_RANGES = {
  act_1: { min: 85, max: 100 }, // Slower, building
  act_2: { min: 95, max: 115 }, // More intense
  act_3: { min: 100, max: 130 }, // Peak energy
};

export interface StemPrompt {
  segmentNumber: number;
  segmentType: string;
  tempo: number;
  key: string;
  mood: string;
  sunoPrompt: string;
  lyrics: string;
  duration: number;
}

/**
 * Suno Stem Builder Service
 */
class SunoStemBuilderService {
  /**
   * Plan all 3 stems for a long-form package
   */
  async planStems(packageId: string, topic: string, musicStyle: string): Promise<StemPrompt[]> {
    console.log(`\n🎼 [StemBuilder] Planning 3 stems for: ${topic}`);

    // Get chapters for this package
    const chapters = await chapterPlannerService.getChaptersForPackage(packageId);

    if (chapters.length < 6) {
      throw new Error(`Expected 6 chapters, got ${chapters.length}`);
    }

    // Select a key progression
    const keyProgression = KEY_PROGRESSIONS[Math.floor(Math.random() * KEY_PROGRESSIONS.length)];

    const stems: StemPrompt[] = [];

    for (const config of STEM_CONFIG) {
      const stem = await this.buildStemPrompt(config, chapters, topic, musicStyle, keyProgression);
      stems.push(stem);
    }

    console.log(`   ✅ Planned ${stems.length} stems`);
    return stems;
  }

  /**
   * Build a single stem prompt
   */
  private async buildStemPrompt(
    config: StemConfig,
    chapters: any[],
    topic: string,
    musicStyle: string,
    keyProgression: { act1: string; act2: string; act3: string },
  ): Promise<StemPrompt> {
    // Get chapters for this stem
    const stemChapters = chapters.filter((ch) => config.chapters.includes(ch.chapterType as ChapterType));

    // Combine lyrics from chapters
    const combinedLyrics = stemChapters
      .map((ch) => ch.lyrics || '')
      .filter((l) => l.length > 0)
      .join('\n\n');

    // Get key for this act
    const key =
      config.segmentType === 'act_1'
        ? keyProgression.act1
        : config.segmentType === 'act_2'
          ? keyProgression.act2
          : keyProgression.act3;

    // Get BPM range for this act
    const bpmRange = BPM_RANGES[config.segmentType];
    const tempo = Math.floor(Math.random() * (bpmRange.max - bpmRange.min + 1)) + bpmRange.min;

    // Get mood based on chapters
    const moods = stemChapters.flatMap((ch) => ch.emotionalBeats || []);
    const mood = moods.join(', ');

    // Build Suno prompt
    const sunoPrompt = this.buildSunoPrompt(topic, config.segmentType, musicStyle, key, tempo, mood, stemChapters);

    return {
      segmentNumber: config.segmentNumber,
      segmentType: config.segmentType,
      tempo,
      key,
      mood,
      sunoPrompt,
      lyrics: combinedLyrics,
      duration: config.duration,
    };
  }

  /**
   * Build Suno prompt for a stem
   */
  private buildSunoPrompt(
    topic: string,
    actType: string,
    musicStyle: string,
    key: string,
    tempo: number,
    mood: string,
    chapters: any[],
  ): string {
    // Map act to energy description
    const actEnergy = {
      act_1: 'building intensity, establishing atmosphere, mysterious introduction',
      act_2: 'peak tension, dramatic escalation, emotional depth',
      act_3: 'triumphant climax, powerful resolution, epic finale',
    };

    // Get chapter titles for context
    const chapterTitles = chapters.map((ch) => ch.title).join(' / ');

    // Build the prompt
    const prompt = `${musicStyle} rap beat about ${topic}

Key: ${key}
BPM: ${tempo}
Mood: ${mood}
Energy: ${actEnergy[actType as keyof typeof actEnergy] || 'dramatic'}

Structure: ${actType.replace('_', ' ').toUpperCase()} - ${chapterTitles}

Style notes:
- Cinematic orchestral elements
- Hard-hitting drums with dramatic builds
- Epic brass and strings for historical weight
- Clear space for vocals
- ${actType === 'act_1' ? 'Start atmospheric, build gradually' : ''}
- ${actType === 'act_2' ? 'Maintain intensity, emotional peaks' : ''}
- ${actType === 'act_3' ? 'Build to triumphant climax, powerful outro' : ''}

No generic trap beats. Make it feel like a historical documentary score with modern hip-hop elements.`;

    return prompt;
  }

  /**
   * Save stem plans to database
   */
  async saveStemPlans(packageId: string, stems: StemPrompt[]): Promise<void> {
    console.log(`   💾 [StemBuilder] Saving ${stems.length} stems to database...`);

    for (const stem of stems) {
      const config = STEM_CONFIG.find((c) => c.segmentNumber === stem.segmentNumber);

      const segmentData: InsertLongFormAudioSegment = {
        packageId,
        segmentNumber: stem.segmentNumber,
        segmentType: stem.segmentType,
        tempo: stem.tempo,
        key: stem.key,
        mood: stem.mood,
        sunoPrompt: stem.sunoPrompt,
        lyrics: stem.lyrics,
        duration: stem.duration.toString(),
        startTime: config?.startTime.toString() || '0',
        crossfadeDuration: (config?.crossfadeBefore || 0).toString(),
        status: 'pending',
      };

      await db.insert(longFormAudioSegments).values(segmentData);
    }

    console.log(`   ✅ Saved all stems`);
  }

  /**
   * Get stems for a package
   */
  async getStemsForPackage(packageId: string): Promise<any[]> {
    return await db
      .select()
      .from(longFormAudioSegments)
      .where(eq(longFormAudioSegments.packageId, packageId))
      .orderBy(longFormAudioSegments.segmentNumber);
  }

  /**
   * Generate FFmpeg command for stitching stems with crossfades
   */
  generateStitchCommand(stem1Path: string, stem2Path: string, stem3Path: string, outputPath: string): string {
    // FFmpeg command for crossfade stitching
    // Uses acrossfade filter for smooth transitions
    const crossfadeDuration = 10; // 10 second crossfades

    const command =
      `ffmpeg -i "${stem1Path}" -i "${stem2Path}" -i "${stem3Path}" ` +
      `-filter_complex "` +
      `[0:a][1:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri[a01];` +
      `[a01][2:a]acrossfade=d=${crossfadeDuration}:c1=tri:c2=tri[aout]" ` +
      `-map "[aout]" -c:a aac -b:a 192k "${outputPath}"`;

    return command;
  }

  /**
   * Calculate total cost estimate for stems
   */
  estimateStemCost(): { perStem: number; total: number } {
    // Suno V5 pricing estimate: ~$0.10 per 30 seconds
    // Each stem is ~180-200 seconds = ~$0.60-0.70
    // Conservative estimate: $0.30 per stem (with credits)
    return {
      perStem: 0.3,
      total: 0.9, // 3 stems
    };
  }

  /**
   * Estimate total clips needed for long-form video
   */
  estimateTotalClips(targetDuration: number = 600): number {
    // Kling clips are ~5.5 seconds each
    // 600 seconds / 5.5 = ~109 clips
    // Add 10% buffer for transitions
    return Math.ceil((targetDuration / 5.5) * 1.1);
  }

  /**
   * Calculate total cost estimate for long-form video
   */
  estimateTotalCost(): {
    audio: number;
    video: number;
    total: number;
    breakdown: { item: string; cost: number }[];
  } {
    const audioCost = this.estimateStemCost().total;
    const clipCount = this.estimateTotalClips();
    const videoCost = clipCount * 1.5; // Kling at $1.50/15s clip (300 credits @ $0.005/credit)

    return {
      audio: audioCost,
      video: videoCost,
      total: audioCost + videoCost,
      breakdown: [
        { item: '3 Suno stems (10 min audio)', cost: audioCost },
        { item: `~${clipCount} Kling clips`, cost: videoCost },
        { item: 'FFmpeg processing', cost: 0 },
        { item: 'OpenAI (prompts/lyrics)', cost: 0.5 },
      ],
    };
  }
}

export const sunoStemBuilderService = new SunoStemBuilderService();
