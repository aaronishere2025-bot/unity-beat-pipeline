import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { consensusReports } from '@shared/schema';
import { consensusEngine } from './consensus-engine';
import { chapterPlannerService } from './chapter-planner-service';

let _gemini: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface BatchTestResult {
  runId: string;
  totalPrompts: number;
  completed: number;
  passed: number;
  blocked: number;
  needsReview: number;
  averageConsensusScore: number;
  results: PromptTestResult[];
  duration: number;
}

export interface PromptTestResult {
  prompt: string;
  type: 'short' | 'long';
  consensusScore: number;
  action: 'PROCEED' | 'BLOCKED' | 'REVIEW';
  conflicts: string[];
  factsVerified: number;
  structureScore?: number;
  chapters?: ChapterStructureResult[];
}

export interface ChapterStructureResult {
  chapter: number;
  type: string;
  title: string;
  hasHook: boolean;
  hasCliffhanger: boolean;
  factCount: number;
  emotionalBeats: string[];
}

class BatchConsensusTestService {
  async generateHistoricalPrompts(count: number, type: 'short' | 'long'): Promise<string[]> {
    console.log(`\n🎲 Generating ${count} ${type}-form historical prompts...`);

    const prompt =
      type === 'long'
        ? `Generate ${count} unique historical topics perfect for 10-minute epic documentary videos.

Requirements:
- Each topic should be a specific historical figure or event
- Focus on dramatic stories with clear narrative arcs
- Include diverse eras (ancient, medieval, modern, 20th century)
- Mix of war, politics, science, exploration, tragedy, triumph
- Topics should have enough depth for a 6-chapter narrative

Return JSON:
{
  "topics": ["Julius Caesar's Assassination", "The Fall of Constantinople", ...]
}`
        : `Generate ${count} unique historical topics for 60-second viral shorts.

Requirements:
- Specific dramatic moments or facts
- Single protagonist focus
- Shocking, surprising, or emotionally powerful
- Mix of famous and lesser-known stories
- Perfect for TikTok/YouTube Shorts

Return JSON:
{
  "topics": ["Napoleon's secret height truth", "Cleopatra's real cause of death", ...]
}`;

    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
      });

      const geminiResponse = await model.generateContent(prompt);
      const result = JSON.parse(geminiResponse.response.text() || '{}');
      const topics = result.topics || [];
      console.log(`   ✅ Generated ${topics.length} ${type}-form prompts`);
      return topics;
    } catch (error) {
      console.error(`   ❌ Failed to generate prompts:`, error);
      return [];
    }
  }

  async testLongFormStructure(topic: string): Promise<{
    structureScore: number;
    chapters: ChapterStructureResult[];
    narrativeArc: boolean;
    hookStrength: number;
    educationalDepth: number;
  }> {
    console.log(`   📖 Testing long-form structure for: ${topic}`);

    try {
      const plan = await chapterPlannerService.planChapters(topic, 'documentary');

      const chapters: ChapterStructureResult[] = plan.chapters.map((ch) => ({
        chapter: ch.chapterNumber,
        type: ch.chapterType,
        title: ch.title,
        hasHook: !!ch.openingHook && ch.openingHook.length > 10,
        hasCliffhanger: !!ch.cliffhanger && ch.cliffhanger.length > 10,
        factCount: ch.keyFacts?.length || 0,
        emotionalBeats: ch.emotionalBeats || [],
      }));

      const hasAllChapterTypes = ['prologue', 'rising_conflict', 'midpoint', 'escalation', 'climax', 'legacy'].every(
        (type) => chapters.some((ch) => ch.type === type),
      );

      const totalFacts = chapters.reduce((sum, ch) => sum + ch.factCount, 0);
      const hasHooks = chapters.filter((ch) => ch.hasHook).length;
      const hasCliffhangers = chapters.filter((ch) => ch.hasCliffhanger).length;

      const hookStrength = (hasHooks / chapters.length) * 100;
      const educationalDepth = Math.min(100, (totalFacts / 18) * 100);
      const narrativeArc = hasAllChapterTypes;

      const structureScore = Math.round(
        hookStrength * 0.25 + educationalDepth * 0.35 + (narrativeArc ? 25 : 0) + (hasCliffhangers / 5) * 15,
      );

      return {
        structureScore,
        chapters,
        narrativeArc,
        hookStrength,
        educationalDepth,
      };
    } catch (error) {
      console.error(`   ❌ Structure test failed:`, error);
      return {
        structureScore: 0,
        chapters: [],
        narrativeArc: false,
        hookStrength: 0,
        educationalDepth: 0,
      };
    }
  }

  async runBatchTest(config: {
    shortCount: number;
    longCount: number;
    testStructure: boolean;
  }): Promise<BatchTestResult> {
    const runId = `batch_${Date.now()}`;
    const startTime = Date.now();
    console.log(`\n🧪 Starting Batch Consensus Test: ${runId}`);
    console.log(`   Config: ${config.shortCount} shorts, ${config.longCount} longs, structure=${config.testStructure}`);

    const results: PromptTestResult[] = [];
    let passed = 0;
    let blocked = 0;
    let needsReview = 0;
    let totalConsensusScore = 0;

    const longPrompts = config.longCount > 0 ? await this.generateHistoricalPrompts(config.longCount, 'long') : [];

    const shortPrompts = config.shortCount > 0 ? await this.generateHistoricalPrompts(config.shortCount, 'short') : [];

    console.log(`\n📊 Testing ${longPrompts.length} long-form prompts...`);
    for (let i = 0; i < longPrompts.length; i++) {
      const topic = longPrompts[i];
      console.log(`\n[${i + 1}/${longPrompts.length}] Testing: ${topic}`);

      try {
        const consensusResult = await consensusEngine.validateAndProceed(topic);

        let structureResult = undefined;
        if (config.testStructure && consensusResult.action !== 'BLOCKED') {
          structureResult = await this.testLongFormStructure(topic);
        }

        const result: PromptTestResult = {
          prompt: topic,
          type: 'long',
          consensusScore: consensusResult.consensusScore,
          action: consensusResult.action as any,
          conflicts: (consensusResult.conflicts || []) as any,
          factsVerified: (consensusResult as any).factsVerified || 0,
          structureScore: structureResult?.structureScore,
          chapters: structureResult?.chapters,
        };

        results.push(result);
        totalConsensusScore += consensusResult.consensusScore;

        if (consensusResult.action === 'PROCEED') passed++;
        else if (consensusResult.action === 'BLOCKED') blocked++;
        else needsReview++;

        console.log(`   ✅ Consensus: ${consensusResult.consensusScore}% (${consensusResult.action})`);
        if (structureResult) {
          console.log(
            `   📖 Structure: ${structureResult.structureScore}% | Narrative Arc: ${structureResult.narrativeArc ? 'YES' : 'NO'}`,
          );
        }

        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error: any) {
        console.error(`   ❌ Test failed for "${topic}":`, error.message);
        results.push({
          prompt: topic,
          type: 'long',
          consensusScore: 0,
          action: 'BLOCKED',
          conflicts: [error.message],
          factsVerified: 0,
        });
        blocked++;
      }
    }

    console.log(`\n📊 Testing ${shortPrompts.length} short-form prompts...`);
    for (let i = 0; i < shortPrompts.length; i++) {
      const topic = shortPrompts[i];
      console.log(`\n[${i + 1}/${shortPrompts.length}] Testing: ${topic}`);

      try {
        const consensusResult = await consensusEngine.validateAndProceed(topic);

        const result: PromptTestResult = {
          prompt: topic,
          type: 'short',
          consensusScore: consensusResult.consensusScore,
          action: consensusResult.action as any,
          conflicts: (consensusResult.conflicts || []) as any,
          factsVerified: (consensusResult as any).factsVerified || 0,
        };

        results.push(result);
        totalConsensusScore += consensusResult.consensusScore;

        if (consensusResult.action === 'PROCEED') passed++;
        else if (consensusResult.action === 'BLOCKED') blocked++;
        else needsReview++;

        console.log(`   ✅ Consensus: ${consensusResult.consensusScore}% (${consensusResult.action})`);

        await new Promise((resolve) => setTimeout(resolve, 300));
      } catch (error: any) {
        console.error(`   ❌ Test failed for "${topic}":`, error.message);
        results.push({
          prompt: topic,
          type: 'short',
          consensusScore: 0,
          action: 'BLOCKED',
          conflicts: [error.message],
          factsVerified: 0,
        });
        blocked++;
      }
    }

    const duration = Date.now() - startTime;
    const totalPrompts = results.length;
    const averageConsensusScore = totalPrompts > 0 ? Math.round(totalConsensusScore / totalPrompts) : 0;

    console.log(`\n📈 BATCH TEST COMPLETE: ${runId}`);
    console.log(`   Total: ${totalPrompts} prompts`);
    console.log(`   Passed: ${passed} (${Math.round((passed / totalPrompts) * 100)}%)`);
    console.log(`   Blocked: ${blocked} (${Math.round((blocked / totalPrompts) * 100)}%)`);
    console.log(`   Review: ${needsReview} (${Math.round((needsReview / totalPrompts) * 100)}%)`);
    console.log(`   Average Consensus: ${averageConsensusScore}%`);
    console.log(`   Duration: ${(duration / 1000).toFixed(1)}s`);

    return {
      runId,
      totalPrompts,
      completed: totalPrompts,
      passed,
      blocked,
      needsReview,
      averageConsensusScore,
      results,
      duration,
    };
  }
}

export const batchConsensusTest = new BatchConsensusTestService();
