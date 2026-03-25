/**
 * Chapter Planner Service
 *
 * Breaks historical topics into 6-chapter narrative arcs for 10-minute epic videos.
 * Uses GPT-4o for narrative generation and integrates with Consensus Engine for fact-checking.
 *
 * 6-CHAPTER NARRATIVE ARC:
 * 1. PROLOGUE (0-90s): Cold open hook, establish stakes, "before the storm"
 * 2. RISING_CONFLICT (90-180s): The challenge emerges, first obstacle, builds tension
 * 3. MIDPOINT (180-300s): Major revelation, shift in dynamics, point of no return
 * 4. ESCALATION (300-420s): Stakes intensify, setbacks mount, darkest hour
 * 5. CLIMAX (420-510s): Decisive moment, confrontation, peak tension
 * 6. LEGACY (510-600s): Resolution, aftermath, what it means for history
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { longFormPackages, longFormChapters, InsertLongFormChapter } from '@shared/schema';
import { eq } from 'drizzle-orm';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

// Chapter types for the 6-chapter arc
export type ChapterType = 'prologue' | 'rising_conflict' | 'midpoint' | 'escalation' | 'climax' | 'legacy';

// Chapter configuration
export const CHAPTER_CONFIG: Record<
  ChapterType,
  {
    duration: number; // seconds
    startTime: number; // seconds
    purpose: string;
    emotionalBeats: string[];
    lyricThemes: string[];
  }
> = {
  prologue: {
    duration: 90,
    startTime: 0,
    purpose: 'Cold open hook - grab attention in first 5 seconds, establish stakes',
    emotionalBeats: ['intrigue', 'foreshadowing', 'mystery'],
    lyricThemes: ['origin', 'destiny', 'before the storm'],
  },
  rising_conflict: {
    duration: 90,
    startTime: 90,
    purpose: 'The challenge emerges - introduce the central conflict and obstacles',
    emotionalBeats: ['tension', 'determination', 'first obstacle'],
    lyricThemes: ['challenge', 'opposition', 'struggle begins'],
  },
  midpoint: {
    duration: 120,
    startTime: 180,
    purpose: 'Major revelation - shift in dynamics, point of no return',
    emotionalBeats: ['revelation', 'turning point', 'commitment'],
    lyricThemes: ['revelation', 'transformation', 'no turning back'],
  },
  escalation: {
    duration: 120,
    startTime: 300,
    purpose: 'Stakes intensify - setbacks mount, darkest hour approaches',
    emotionalBeats: ['desperation', 'sacrifice', 'darkest hour'],
    lyricThemes: ['sacrifice', 'doubt', 'dark times'],
  },
  climax: {
    duration: 90,
    startTime: 420,
    purpose: 'Decisive moment - peak confrontation, maximum tension',
    emotionalBeats: ['triumph', 'confrontation', 'resolution'],
    lyricThemes: ['final battle', 'decisive moment', 'victory or defeat'],
  },
  legacy: {
    duration: 90,
    startTime: 510,
    purpose: 'Aftermath and meaning - what this event means for history',
    emotionalBeats: ['reflection', 'legacy', 'eternal'],
    lyricThemes: ['legacy', 'remembrance', 'lessons learned'],
  },
};

// Interfaces
export interface ChapterPlan {
  chapterNumber: number;
  chapterType: ChapterType;
  title: string;
  narrative: string;
  keyFacts: string[];
  emotionalBeats: string[];
  lyricThemes: string[];
  openingHook: string;
  cliffhanger: string;
  estimatedClips: number;
}

export interface LongFormPlan {
  topic: string;
  title: string;
  description: string;
  chapters: ChapterPlan[];
  totalClips: number;
  estimatedDuration: number; // seconds
}

/**
 * Chapter Planner Service
 */
class ChapterPlannerService {
  /**
   * Plan a 6-chapter narrative arc for a historical topic
   */
  async planChapters(topic: string, stylePreset: string = 'documentary'): Promise<LongFormPlan> {
    console.log(`\n📖 [ChapterPlanner] Planning 6-chapter arc for: ${topic}`);

    // Step 1: Generate the narrative structure using GPT-4o
    const narrativeStructure = await this.generateNarrativeStructure(topic, stylePreset);

    // Step 2: Create chapter plans
    const chapterPlans = await this.expandChapters(narrativeStructure, topic, stylePreset);

    // Step 3: Calculate totals
    const totalClips = chapterPlans.reduce((sum, ch) => sum + ch.estimatedClips, 0);
    const estimatedDuration = 600; // 10 minutes target

    const plan: LongFormPlan = {
      topic,
      title: narrativeStructure.title,
      description: narrativeStructure.description,
      chapters: chapterPlans,
      totalClips,
      estimatedDuration,
    };

    console.log(`   ✅ Planned ${plan.chapters.length} chapters, ~${totalClips} clips`);

    return plan;
  }

  /**
   * Generate narrative structure using GPT-4o
   */
  private async generateNarrativeStructure(
    topic: string,
    stylePreset: string,
  ): Promise<{
    title: string;
    description: string;
    chapters: Array<{
      type: ChapterType;
      title: string;
      summary: string;
      keyFacts: string[];
    }>;
  }> {
    console.log(`   🧠 [ChapterPlanner] Generating narrative structure...`);

    const prompt = `You are a historical documentary writer creating a 10-minute epic video about: "${topic}"

Create a 6-chapter narrative arc with maximum storytelling impact. Each chapter must build tension and maintain viewer engagement.

STYLE: ${stylePreset}

CHAPTER STRUCTURE:
1. PROLOGUE (0-90s): Cold open hook - start with the most dramatic moment or image
2. RISING_CONFLICT (90-180s): The challenge emerges - what stood in their way
3. MIDPOINT (180-300s): Major revelation - the turning point that changed everything
4. ESCALATION (300-420s): Stakes intensify - darkest hour, near failure
5. CLIMAX (420-510s): Decisive moment - the final confrontation or achievement
6. LEGACY (510-600s): Aftermath - what it means for history

REQUIREMENTS:
- Each chapter title should be dramatic and intriguing (2-6 words)
- Include 3-5 KEY HISTORICAL FACTS per chapter (accurate, verifiable)
- Make the narrative flow naturally from chapter to chapter
- End each chapter with a hook to the next (except legacy)
- First 5 seconds must hook the viewer immediately

OUTPUT FORMAT (JSON):
{
  "title": "Epic video title (catchy, under 60 chars)",
  "description": "Video description for YouTube (compelling, 150-200 chars)",
  "chapters": [
    {
      "type": "prologue",
      "title": "Chapter title",
      "summary": "What happens in this chapter (3-4 sentences)",
      "keyFacts": ["Historical fact 1", "Historical fact 2", "Historical fact 3"]
    },
    // ... all 6 chapters
  ]
}

Return ONLY valid JSON, no markdown.`;

    const model = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.7, maxOutputTokens: 2000, responseMimeType: 'application/json' },
    });
    const response = await model.generateContent(prompt);
    const content = response.response.text() || '';

    // Parse JSON response
    try {
      // Clean up response - remove markdown code blocks if present
      const cleanContent = content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(cleanContent);
    } catch (error) {
      console.error('   ⚠️ Failed to parse narrative structure:', error);
      // Return a basic structure on error
      return this.getDefaultNarrativeStructure(topic);
    }
  }

  /**
   * Expand chapters with detailed content
   */
  private async expandChapters(
    narrative: { title: string; description: string; chapters: any[] },
    topic: string,
    stylePreset: string,
  ): Promise<ChapterPlan[]> {
    console.log(`   📝 [ChapterPlanner] Expanding chapter details...`);

    const chapterPlans: ChapterPlan[] = [];
    const chapterTypes: ChapterType[] = ['prologue', 'rising_conflict', 'midpoint', 'escalation', 'climax', 'legacy'];

    for (let i = 0; i < 6; i++) {
      const chapterType = chapterTypes[i];
      const config = CHAPTER_CONFIG[chapterType];
      const narrativeChapter = narrative.chapters[i] || {};

      // Calculate clips for this chapter based on duration
      // ~5.5 seconds per clip for Kling
      const estimatedClips = Math.ceil(config.duration / 5.5);

      // Generate opening hook and cliffhanger
      const hooks = await this.generateHooks(topic, chapterType, narrativeChapter.summary || '', i < 5);

      chapterPlans.push({
        chapterNumber: i + 1,
        chapterType,
        title: narrativeChapter.title || `Chapter ${i + 1}`,
        narrative: narrativeChapter.summary || '',
        keyFacts: narrativeChapter.keyFacts || [],
        emotionalBeats: config.emotionalBeats,
        lyricThemes: config.lyricThemes,
        openingHook: hooks.opening,
        cliffhanger: hooks.cliffhanger,
        estimatedClips,
      });
    }

    return chapterPlans;
  }

  /**
   * Generate opening hooks and cliffhangers for chapters
   */
  private async generateHooks(
    topic: string,
    chapterType: ChapterType,
    summary: string,
    hasNextChapter: boolean,
  ): Promise<{ opening: string; cliffhanger: string }> {
    // For efficiency, use template-based hooks with GPT enhancement for important chapters
    const config = CHAPTER_CONFIG[chapterType];

    // Template-based hooks for speed
    const templateHooks: Record<ChapterType, { opening: string; cliffhanger: string }> = {
      prologue: {
        opening: `In the shadows of history, one moment changed everything...`,
        cliffhanger: `But no one could have predicted what came next.`,
      },
      rising_conflict: {
        opening: `The storm was gathering. The challenge was clear.`,
        cliffhanger: `Everything was about to change.`,
      },
      midpoint: {
        opening: `This was the moment of truth.`,
        cliffhanger: `But the darkest hour was yet to come.`,
      },
      escalation: {
        opening: `When all seemed lost...`,
        cliffhanger: `One final chance remained.`,
      },
      climax: {
        opening: `This was it. The decisive moment.`,
        cliffhanger: `The world would never be the same.`,
      },
      legacy: {
        opening: `When the dust settled...`,
        cliffhanger: `And so, history remembers.`,
      },
    };

    return templateHooks[chapterType];
  }

  /**
   * Default narrative structure fallback
   */
  private getDefaultNarrativeStructure(topic: string): {
    title: string;
    description: string;
    chapters: Array<{ type: ChapterType; title: string; summary: string; keyFacts: string[] }>;
  } {
    return {
      title: `The Epic Story of ${topic}`,
      description: `Discover the untold story of ${topic} - from humble beginnings to legendary status. A journey through history.`,
      chapters: [
        { type: 'prologue', title: 'Before the Storm', summary: 'The beginning of the story.', keyFacts: [] },
        { type: 'rising_conflict', title: 'The Challenge', summary: 'Obstacles emerge.', keyFacts: [] },
        { type: 'midpoint', title: 'The Turning Point', summary: 'Everything changes.', keyFacts: [] },
        { type: 'escalation', title: 'Dark Hours', summary: 'The darkest moment.', keyFacts: [] },
        { type: 'climax', title: 'The Decisive Moment', summary: 'The final confrontation.', keyFacts: [] },
        { type: 'legacy', title: 'A Legacy Eternal', summary: 'What it all means.', keyFacts: [] },
      ],
    };
  }

  /**
   * Save chapter plan to database
   */
  async saveChapterPlan(packageId: string, plan: LongFormPlan): Promise<void> {
    console.log(`   💾 [ChapterPlanner] Saving ${plan.chapters.length} chapters to database...`);

    for (const chapter of plan.chapters) {
      const config = CHAPTER_CONFIG[chapter.chapterType];

      const chapterData: InsertLongFormChapter = {
        packageId,
        chapterNumber: chapter.chapterNumber,
        chapterType: chapter.chapterType,
        title: chapter.title,
        narrative: chapter.narrative,
        keyFacts: chapter.keyFacts,
        emotionalBeats: chapter.emotionalBeats,
        lyricThemes: chapter.lyricThemes,
        openingHook: chapter.openingHook,
        cliffhanger: chapter.cliffhanger,
        startTime: config.startTime.toString(),
        endTime: (config.startTime + config.duration).toString(),
        duration: config.duration.toString(),
        clipCount: chapter.estimatedClips,
        status: 'pending',
      };

      await db.insert(longFormChapters).values(chapterData);
    }

    console.log(`   ✅ Saved all chapters`);
  }

  /**
   * Get chapters for a package
   */
  async getChaptersForPackage(packageId: string): Promise<any[]> {
    return await db
      .select()
      .from(longFormChapters)
      .where(eq(longFormChapters.packageId, packageId))
      .orderBy(longFormChapters.chapterNumber);
  }

  /**
   * Generate lyrics for all chapters
   * Uses the existing lyric generation patterns but adapted for long-form
   */
  async generateChapterLyrics(packageId: string, topic: string, musicStyle: string): Promise<void> {
    console.log(`\n🎵 [ChapterPlanner] Generating lyrics for all chapters...`);

    const chapters = await this.getChaptersForPackage(packageId);

    for (const chapter of chapters) {
      const lyrics = await this.generateSingleChapterLyrics(
        topic,
        chapter.chapterType,
        chapter.narrative,
        chapter.keyFacts || [],
        musicStyle,
      );

      // Update chapter with lyrics
      await db.update(longFormChapters).set({ lyrics }).where(eq(longFormChapters.id, chapter.id));

      console.log(`   ✅ Generated lyrics for Chapter ${chapter.chapterNumber}: ${chapter.title}`);
    }
  }

  /**
   * Generate lyrics for a single chapter
   */
  private async generateSingleChapterLyrics(
    topic: string,
    chapterType: ChapterType,
    narrative: string,
    keyFacts: string[],
    musicStyle: string,
  ): Promise<string> {
    const config = CHAPTER_CONFIG[chapterType];
    const durationBars = Math.ceil(config.duration / 3); // ~3 seconds per bar

    const prompt = `Write rap lyrics for a historical documentary about "${topic}".

CHAPTER: ${chapterType.toUpperCase().replace('_', ' ')}
NARRATIVE: ${narrative}
KEY FACTS TO INCLUDE: ${keyFacts.join(', ')}
MUSIC STYLE: ${musicStyle}
DURATION: ~${config.duration} seconds (~${durationBars} bars)

RHYME REQUIREMENTS (Anti-AI Detection):
- Use varied rhyme patterns (AABB, ABAB, AABCCB)
- Include internal rhymes where natural
- Mix perfect and slant rhymes
- Use enjambment (lines flowing into next)

LYRIC THEMES TO INCORPORATE:
${config.lyricThemes.map((t) => `- ${t}`).join('\n')}

EMOTIONAL BEATS:
${config.emotionalBeats.map((b) => `- ${b}`).join('\n')}

Write in first person from the historical figure's perspective.
Make it dramatic, engaging, and historically accurate.
Output ONLY the lyrics, no labels or explanations.`;

    const lyricsModel = getGemini().getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { temperature: 0.8, maxOutputTokens: 500 },
    });
    const response = await lyricsModel.generateContent(prompt);
    return response.response.text() || '';
  }
}

export const chapterPlannerService = new ChapterPlannerService();
