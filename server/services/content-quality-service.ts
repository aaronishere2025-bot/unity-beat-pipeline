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

export interface QualityScore {
  overall: number;
  educational: number;
  narrative: number;
  engagement: number;
  factAccuracy: number;
  details: {
    learningObjectives: string[];
    hookStrength: number;
    escalationScore: number;
    payoffScore: number;
    repetitionScore: number;
    lexicalDiversity: number;
    emotionCoverage: string[];
    factsCovered: number;
    factsRequired: number;
  };
  issues: string[];
  recommendations: string[];
  passesThreshold: boolean;
}

export interface ChapterQuality {
  chapterNumber: number;
  title: string;
  score: QualityScore;
  approved: boolean;
}

export class ContentQualityService {
  private readonly QUALITY_THRESHOLD = 70;

  async evaluateChapter(
    chapter: {
      number: number;
      title: string;
      lyrics: string;
      keyFacts: string[];
      emotionalBeat: string;
    },
    topic: string,
    canonicalFacts: Array<{ factKey: string; factValue: string; confidence: number }>,
  ): Promise<ChapterQuality> {
    const prompt = `You are a content quality evaluator for educational historical videos (Epic Rap Battles style).

TOPIC: ${topic}
CHAPTER ${chapter.number}: ${chapter.title}
EMOTIONAL BEAT: ${chapter.emotionalBeat}

LYRICS/SCRIPT:
${chapter.lyrics}

KEY FACTS TO COVER:
${chapter.keyFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

VERIFIED CANONICAL FACTS:
${canonicalFacts.map((f) => `- ${f.factKey}: ${f.factValue} (${f.confidence}% confidence)`).join('\n')}

Evaluate this chapter for QUALITY (not brain rot). Score each category 0-100:

1. EDUCATIONAL VALUE (Does it teach real history?)
   - Are facts accurate and meaningful?
   - Will viewers learn something valuable?
   - Is complex history made accessible?

2. NARRATIVE CRAFT (Is it well-written?)
   - Hook strength: Does it grab attention immediately?
   - Escalation: Does tension/interest build?
   - Payoff: Is there a satisfying resolution/cliffhanger?

3. ENGAGEMENT (Is it interesting, not repetitive?)
   - Lexical diversity: Varied vocabulary or repetitive?
   - Emotional range: Multiple emotions covered?
   - Pacing: Too slow, too fast, or well-balanced?

4. FACT ACCURACY (Matches verified facts?)
   - How many key facts are properly represented?
   - Any historical inaccuracies or anachronisms?

Return JSON:
{
  "educational": 0-100,
  "narrative": 0-100,
  "engagement": 0-100,
  "factAccuracy": 0-100,
  "hookStrength": 0-100,
  "escalationScore": 0-100,
  "payoffScore": 0-100,
  "repetitionScore": 0-100 (higher = less repetitive = better),
  "lexicalDiversity": 0-100,
  "learningObjectives": ["3 things viewers will learn"],
  "emotionsCovered": ["emotions present in chapter"],
  "factsCovered": number,
  "factsRequired": number,
  "issues": ["specific problems found"],
  "recommendations": ["how to improve"],
  "overallAssessment": "brief quality summary"
}`;

    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      });

      const result = await model.generateContent(prompt);
      const evaluation = JSON.parse(result.response.text());

      const overall = Math.round(
        evaluation.educational * 0.3 +
          evaluation.narrative * 0.25 +
          evaluation.engagement * 0.25 +
          evaluation.factAccuracy * 0.2,
      );

      const score: QualityScore = {
        overall,
        educational: evaluation.educational || 0,
        narrative: evaluation.narrative || 0,
        engagement: evaluation.engagement || 0,
        factAccuracy: evaluation.factAccuracy || 0,
        details: {
          learningObjectives: evaluation.learningObjectives || [],
          hookStrength: evaluation.hookStrength || 0,
          escalationScore: evaluation.escalationScore || 0,
          payoffScore: evaluation.payoffScore || 0,
          repetitionScore: evaluation.repetitionScore || 0,
          lexicalDiversity: evaluation.lexicalDiversity || 0,
          emotionCoverage: evaluation.emotionsCovered || [],
          factsCovered: evaluation.factsCovered || 0,
          factsRequired: evaluation.factsRequired || chapter.keyFacts.length,
        },
        issues: evaluation.issues || [],
        recommendations: evaluation.recommendations || [],
        passesThreshold: overall >= this.QUALITY_THRESHOLD,
      };

      return {
        chapterNumber: chapter.number,
        title: chapter.title,
        score,
        approved: score.passesThreshold,
      };
    } catch (error) {
      console.error('[ContentQuality] Evaluation failed:', error);
      return {
        chapterNumber: chapter.number,
        title: chapter.title,
        score: {
          overall: 50,
          educational: 50,
          narrative: 50,
          engagement: 50,
          factAccuracy: 50,
          details: {
            learningObjectives: [],
            hookStrength: 50,
            escalationScore: 50,
            payoffScore: 50,
            repetitionScore: 50,
            lexicalDiversity: 50,
            emotionCoverage: [],
            factsCovered: 0,
            factsRequired: chapter.keyFacts.length,
          },
          issues: ['Evaluation failed - defaulting to manual review'],
          recommendations: [],
          passesThreshold: false,
        },
        approved: false,
      };
    }
  }

  async evaluateFullVideo(
    chapters: ChapterQuality[],
    topic: string,
  ): Promise<{
    overallScore: number;
    approved: boolean;
    qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
    summary: string;
    chapterScores: ChapterQuality[];
    aggregateIssues: string[];
    educationalValue: string;
  }> {
    const avgScore = chapters.reduce((sum, ch) => sum + ch.score.overall, 0) / chapters.length;
    const allIssues = chapters.flatMap((ch) => ch.score.issues);
    const allObjectives = chapters.flatMap((ch) => ch.score.details.learningObjectives);
    const uniqueObjectives = [...new Set(allObjectives)];

    const qualityGrade =
      avgScore >= 90 ? 'A' : avgScore >= 80 ? 'B' : avgScore >= 70 ? 'C' : avgScore >= 60 ? 'D' : 'F';

    const prompt = `Summarize the educational value of a ${chapters.length}-chapter historical video about "${topic}".

Learning objectives covered:
${uniqueObjectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Chapter scores: ${chapters.map((ch) => `Ch${ch.chapterNumber}: ${ch.score.overall}%`).join(', ')}
Average: ${avgScore.toFixed(0)}%

Write a 2-sentence summary of what viewers will learn and why this video has educational merit.`;

    let educationalValue = `This video covers ${uniqueObjectives.length} key historical lessons about ${topic}.`;

    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { maxOutputTokens: 150 },
      });

      const result = await model.generateContent(prompt);
      educationalValue = result.response.text() || educationalValue;
    } catch (error) {
      console.error('[ContentQuality] Summary generation failed:', error);
    }

    return {
      overallScore: Math.round(avgScore),
      approved: avgScore >= this.QUALITY_THRESHOLD,
      qualityGrade,
      summary: `${qualityGrade}-grade content (${avgScore.toFixed(0)}%) - ${chapters.filter((c) => c.approved).length}/${chapters.length} chapters passed`,
      chapterScores: chapters,
      aggregateIssues: [...new Set(allIssues)],
      educationalValue,
    };
  }

  async detectBrainRot(content: string): Promise<{
    isBrainRot: boolean;
    signals: string[];
    score: number;
  }> {
    const words = content.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const lexicalDiversity = (uniqueWords.size / words.length) * 100;

    const repeatedPhrases = this.findRepeatedPhrases(content);
    const hasSubstance = content.length > 200 && uniqueWords.size > 50;

    const brainRotSignals: string[] = [];

    if (lexicalDiversity < 40) {
      brainRotSignals.push('Low vocabulary diversity - too repetitive');
    }
    if (repeatedPhrases.length > 3) {
      brainRotSignals.push(`Repeated phrases: ${repeatedPhrases.slice(0, 3).join(', ')}`);
    }
    if (!hasSubstance) {
      brainRotSignals.push('Insufficient content depth');
    }

    const score = Math.min(100, lexicalDiversity + (hasSubstance ? 20 : 0) - repeatedPhrases.length * 5);

    return {
      isBrainRot: brainRotSignals.length >= 2 || score < 50,
      signals: brainRotSignals,
      score: Math.max(0, score),
    };
  }

  private findRepeatedPhrases(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const phrases: Map<string, number> = new Map();

    for (let i = 0; i < words.length - 2; i++) {
      const phrase = words.slice(i, i + 3).join(' ');
      phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }

    return Array.from(phrases.entries())
      .filter(([, count]) => count > 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([phrase]) => phrase);
  }
}

export const contentQualityService = new ContentQualityService();
