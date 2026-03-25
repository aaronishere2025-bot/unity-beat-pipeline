/**
 * Long-Form Orchestrator Service
 *
 * Coordinates the full 10-minute video generation pipeline:
 * 1. Consensus verification for historical accuracy
 * 2. Chapter planning (6 chapters)
 * 3. Lyric generation for each chapter
 * 4. Suno stem generation (3 stems)
 * 5. Video clip generation (~110 clips)
 * 6. Assembly and upload
 *
 * DAILY MIX STRATEGY (4 shorts + 1 long):
 * - Generate 4 related short-form videos (60s each)
 * - Generate 1 long-form epic video (10 min)
 * - Auto-redirect shorts to long-form via YouTube cards/end screens
 */

import { db } from '../db';
import {
  longFormPackages,
  longFormChapters,
  longFormAudioSegments,
  InsertLongFormPackage,
  unityContentPackages,
  canonicalFacts,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { consensusEngine } from './consensus-engine';
import { chapterPlannerService, LongFormPlan } from './chapter-planner-service';
import { sunoStemBuilderService, StemPrompt } from './suno-stem-builder-service';
import { contentQualityService, QualityScore } from './content-quality-service';

export interface DailyMixConfig {
  topic: string;
  stylePreset: string;
  shortCount: number; // Default 4
  generateLongForm: boolean;
  autoRedirect: boolean;
}

export interface LongFormGenerationResult {
  packageId: string;
  status: 'created' | 'planning' | 'verified' | 'blocked' | 'failed' | 'quality_review';
  plan?: LongFormPlan;
  stems?: StemPrompt[];
  estimatedCost: number;
  relatedShortIds?: string[];
  qualityReport?: {
    overallScore: number;
    qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    approved: boolean;
    educationalValue: string;
    chapterScores: Array<{ chapter: number; score: number; approved: boolean }>;
    issues: string[];
  };
  error?: string;
}

/**
 * Long-Form Orchestrator Service
 */
class LongFormOrchestratorService {
  /**
   * Initialize a long-form video package
   */
  async initializeLongFormPackage(
    topic: string,
    stylePreset: string = 'documentary',
    contentType: string = 'historical_epic',
  ): Promise<LongFormGenerationResult> {
    console.log(`\n🎬 [LongFormOrchestrator] Initializing long-form package for: ${topic}`);

    try {
      // Step 1: Create package in database
      const packageData: InsertLongFormPackage = {
        topic,
        title: `The Epic Story of ${topic}`,
        stylePreset,
        contentType,
        status: 'draft',
        progress: 0,
        totalChapters: 6,
        targetDuration: 600,
        costBudget: '15.00',
      };

      const [newPackage] = await db.insert(longFormPackages).values(packageData).returning();

      const packageId = newPackage.id;
      console.log(`   📦 Created package: ${packageId}`);

      // Step 2: Verify with Consensus Engine
      console.log(`   🔍 Running Consensus Engine verification...`);
      const consensusResult = await (consensusEngine as any).validateTopic(topic);

      // Update package with consensus status
      await db
        .update(longFormPackages)
        .set({
          consensusReportId: consensusResult.auditLog ? 1 : null, // Placeholder
          consensusStatus: consensusResult.action,
          status: consensusResult.action === 'BLOCKED' ? 'failed' : 'planning',
        })
        .where(eq(longFormPackages.id, packageId));

      if (consensusResult.action === 'BLOCKED') {
        console.log(`   ❌ BLOCKED by Consensus Engine: ${consensusResult.blockedReason}`);
        return {
          packageId,
          status: 'blocked',
          estimatedCost: 0,
          error: consensusResult.blockedReason,
        };
      }

      console.log(`   ✅ Consensus verified (${consensusResult.consensusScore}% agreement)`);

      // Step 3: Plan chapters
      const plan = await chapterPlannerService.planChapters(topic, stylePreset);
      await chapterPlannerService.saveChapterPlan(packageId, plan);

      // Update package title from plan
      await db
        .update(longFormPackages)
        .set({
          title: plan.title,
          description: plan.description,
          totalClips: plan.totalClips,
        })
        .where(eq(longFormPackages.id, packageId));

      // Step 4: Generate lyrics for all chapters
      await chapterPlannerService.generateChapterLyrics(packageId, topic, stylePreset);

      // Step 5: QUALITY GATE - Evaluate each chapter for educational value
      console.log(`   🎯 Running Quality Gate evaluation...`);
      const chapters = await db.select().from(longFormChapters).where(eq(longFormChapters.packageId, packageId));
      const topicFacts = await db.select().from(canonicalFacts).where(eq(canonicalFacts.topic, topic));

      const chapterQualities = await Promise.all(
        chapters.map(async (ch) => {
          return contentQualityService.evaluateChapter(
            {
              number: ch.chapterNumber,
              title: ch.title,
              lyrics: ch.lyrics || '',
              keyFacts: (ch.keyFacts as string[]) || [],
              emotionalBeat: (Array.isArray(ch.emotionalBeats) ? ch.emotionalBeats[0] : ch.emotionalBeats) || '',
            },
            topic,
            topicFacts.map((f) => ({
              factKey: f.factKey,
              factValue: f.factValue,
              confidence: f.confidence,
            })),
          );
        }),
      );

      const fullQualityReport = await contentQualityService.evaluateFullVideo(chapterQualities, topic);

      console.log(`   📊 Quality Score: ${fullQualityReport.overallScore}% (Grade: ${fullQualityReport.qualityGrade})`);
      console.log(`   📚 Educational Value: ${fullQualityReport.educationalValue.slice(0, 100)}...`);

      // Update package with quality scores
      await db
        .update(longFormPackages)
        .set({
          qualityScore: fullQualityReport.overallScore,
          qualityGrade: fullQualityReport.qualityGrade,
        })
        .where(eq(longFormPackages.id, packageId));

      // Check if quality passes threshold
      if (!fullQualityReport.approved) {
        console.log(`   ⚠️ Quality below threshold - requires review`);
        console.log(`   Issues: ${fullQualityReport.aggregateIssues.slice(0, 3).join(', ')}`);

        return {
          packageId,
          status: 'quality_review',
          plan,
          estimatedCost: 0,
          qualityReport: {
            overallScore: fullQualityReport.overallScore,
            qualityGrade: fullQualityReport.qualityGrade,
            approved: false,
            educationalValue: fullQualityReport.educationalValue,
            chapterScores: chapterQualities.map((cq) => ({
              chapter: cq.chapterNumber,
              score: cq.score.overall,
              approved: cq.approved,
            })),
            issues: fullQualityReport.aggregateIssues,
          },
          error: `Quality score ${fullQualityReport.overallScore}% below 70% threshold`,
        };
      }

      console.log(`   ✅ Quality Gate PASSED`);

      // Step 6: Plan audio stems
      const stems = await sunoStemBuilderService.planStems(packageId, topic, stylePreset);
      await sunoStemBuilderService.saveStemPlans(packageId, stems);

      // Step 7: Calculate estimated cost
      const costEstimate = sunoStemBuilderService.estimateTotalCost();

      // Update package with cost estimate
      await db
        .update(longFormPackages)
        .set({
          estimatedCost: costEstimate.total.toFixed(2),
          status: 'planning',
          progress: 20,
        })
        .where(eq(longFormPackages.id, packageId));

      console.log(`   💰 Estimated cost: $${costEstimate.total.toFixed(2)}`);
      console.log(`   ✅ Long-form package ready for generation`);

      return {
        packageId,
        status: 'verified',
        plan,
        stems,
        estimatedCost: costEstimate.total,
        qualityReport: {
          overallScore: fullQualityReport.overallScore,
          qualityGrade: fullQualityReport.qualityGrade,
          approved: true,
          educationalValue: fullQualityReport.educationalValue,
          chapterScores: chapterQualities.map((cq) => ({
            chapter: cq.chapterNumber,
            score: cq.score.overall,
            approved: cq.approved,
          })),
          issues: fullQualityReport.aggregateIssues,
        },
      };
    } catch (error: any) {
      console.error(`   ❌ Failed to initialize long-form package:`, error);
      return {
        packageId: '',
        status: 'failed',
        estimatedCost: 0,
        error: error.message,
      };
    }
  }

  /**
   * Generate daily content mix (4 shorts + 1 long-form)
   */
  async generateDailyMix(config: DailyMixConfig): Promise<{
    longFormResult?: LongFormGenerationResult;
    shortPackageIds: string[];
    success: boolean;
    message: string;
  }> {
    console.log(`\n🎯 [DailyMix] Starting daily content mix for: ${config.topic}`);
    console.log(
      `   📊 Config: ${config.shortCount} shorts + ${config.generateLongForm ? '1 long-form' : 'no long-form'}`,
    );

    const shortPackageIds: string[] = [];
    let longFormResult: LongFormGenerationResult | undefined;

    try {
      // Step 1: Generate short-form packages
      if (config.shortCount > 0) {
        console.log(`\n📹 Generating ${config.shortCount} short-form packages...`);

        // Create shorts with related subtopics
        const subtopics = await this.generateRelatedSubtopics(config.topic, config.shortCount);

        for (let i = 0; i < subtopics.length; i++) {
          const subtopic = subtopics[i];
          console.log(`   [${i + 1}/${subtopics.length}] Creating short for: ${subtopic}`);

          // Create a Unity package for the short (using existing pipeline)
          const shortPackage = await this.createShortPackage(subtopic, config.stylePreset);
          if (shortPackage) {
            shortPackageIds.push(shortPackage);
          }
        }

        console.log(`   ✅ Created ${shortPackageIds.length} short packages`);
      }

      // Step 2: Generate long-form package
      if (config.generateLongForm) {
        console.log(`\n🎬 Generating long-form package...`);
        longFormResult = await this.initializeLongFormPackage(config.topic, config.stylePreset);

        if (longFormResult.status === 'verified' && config.autoRedirect) {
          // Link shorts to long-form for auto-redirect
          await db
            .update(longFormPackages)
            .set({ relatedShortIds: shortPackageIds })
            .where(eq(longFormPackages.id, longFormResult.packageId));

          console.log(`   🔗 Linked ${shortPackageIds.length} shorts to long-form`);
        }
      }

      return {
        longFormResult,
        shortPackageIds,
        success: true,
        message: `Daily mix created: ${shortPackageIds.length} shorts${longFormResult ? ' + 1 long-form' : ''}`,
      };
    } catch (error: any) {
      console.error(`   ❌ Daily mix failed:`, error);
      return {
        longFormResult,
        shortPackageIds,
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Generate related subtopics for shorts
   */
  private async generateRelatedSubtopics(mainTopic: string, count: number): Promise<string[]> {
    // For now, generate variations of the main topic
    // In production, this would use GPT to generate related hooks
    const variations = [
      `${mainTopic} - The Untold Beginning`,
      `${mainTopic} - The Hidden Truth`,
      `${mainTopic} - What They Don't Tell You`,
      `${mainTopic} - The Final Moments`,
      `${mainTopic} - The Legacy`,
      `${mainTopic} - The Rise`,
      `${mainTopic} - The Fall`,
    ];

    // Shuffle and take requested count
    return variations.sort(() => Math.random() - 0.5).slice(0, count);
  }

  /**
   * Create a short-form package (placeholder - integrates with existing pipeline)
   * Short-form uses 9:16 (vertical) aspect ratio
   */
  private async createShortPackage(topic: string, stylePreset: string): Promise<string | null> {
    try {
      const [newPackage] = await db
        .insert(unityContentPackages)
        .values({
          title: topic,
          topic,
          packageData: {
            metadata: {
              topic,
              generatedAt: new Date().toISOString(),
              version: '1.0',
              targetPlatform: 'youtube_shorts',
              visualStyleV2: stylePreset,
              setting: 'historical',
              voice: 'dramatic',
              energy: 'high',
              mood: 'epic',
            },
            timing: {
              totalSyllables: 0,
              totalBeats: 0,
              estimatedDurationSeconds: 60,
              formattedDuration: '1:00',
              bpm: 120,
              syllablesPerBeat: 2,
              sectionsBreakdown: [],
              totalVeoClips: 12,
              estimatedVeoCost: 1.2,
              warnings: [],
              recommendations: [],
            },
            lyrics: { raw: '', sections: [] },
            sunoStyleTags: {
              genre: 'hip-hop',
              subgenre: 'historical rap',
              bpm: 120,
              vocals: 'male',
              instruments: ['drums', 'bass'],
              production: ['cinematic'],
              mood: ['epic'],
              fullStyleString: stylePreset,
            },
            characterCast: [],
            veoPrompts: [],
          },
          status: 'draft',
        })
        .returning();

      return newPackage.id;
    } catch (error) {
      console.error(`Failed to create short package:`, error);
      return null;
    }
  }

  /**
   * Long-form content aspect ratio
   * Long-form uses 16:9 (landscape) for YouTube
   */
  static readonly LONG_FORM_ASPECT_RATIO = '16:9';

  /**
   * Get long-form package status
   */
  async getPackageStatus(packageId: string): Promise<any> {
    const [pkg] = await db.select().from(longFormPackages).where(eq(longFormPackages.id, packageId));

    if (!pkg) return null;

    const chapters = await chapterPlannerService.getChaptersForPackage(packageId);
    const stems = await sunoStemBuilderService.getStemsForPackage(packageId);

    return {
      ...pkg,
      chapters,
      stems,
      costEstimate: sunoStemBuilderService.estimateTotalCost(),
    };
  }

  /**
   * Get all long-form packages
   */
  async getAllPackages(): Promise<any[]> {
    return await db.select().from(longFormPackages).orderBy(longFormPackages.createdAt);
  }

  /**
   * Generate YouTube auto-redirect metadata
   * Creates end screen and card links from shorts to long-form
   */
  generateAutoRedirectMetadata(
    longFormVideoId: string,
    shortVideoIds: string[],
  ): {
    endScreenLinks: Array<{ shortVideoId: string; linkToLongForm: string }>;
    cardLinks: Array<{ shortVideoId: string; timestamp: number; linkToLongForm: string }>;
    description: string;
  } {
    const endScreenLinks = shortVideoIds.map((shortId) => ({
      shortVideoId: shortId,
      linkToLongForm: `https://youtube.com/watch?v=${longFormVideoId}`,
    }));

    // Cards appear at 75% of video duration
    const cardLinks = shortVideoIds.map((shortId) => ({
      shortVideoId: shortId,
      timestamp: 45, // 45s into a 60s short
      linkToLongForm: `https://youtube.com/watch?v=${longFormVideoId}`,
    }));

    const description = `
🎬 Want the FULL story? Watch the 10-minute epic: https://youtube.com/watch?v=${longFormVideoId}

This is Part ${shortVideoIds.length} of a ${shortVideoIds.length + 1}-part series.
    `.trim();

    return {
      endScreenLinks,
      cardLinks,
      description,
    };
  }
}

export const longFormOrchestratorService = new LongFormOrchestratorService();
