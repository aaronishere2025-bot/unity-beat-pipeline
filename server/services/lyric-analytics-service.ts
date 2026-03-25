/**
 * LYRIC ANALYTICS SERVICE
 *
 * Tracks which lyric characteristics correlate with video performance.
 * Uses Thompson Sampling to learn which patterns work best.
 * Feeds successful patterns back into viral-lyrics-engine.
 *
 * Tracked Features:
 * - Perspective (first_person, third_person, mixed)
 * - Hook style (identity_declaration, challenge, question, claim)
 * - Rhyme scheme (AABB, ABAB, AABCCB, XAXA, mixed)
 * - Emotional intensity (low, medium, high, extreme)
 * - Pacing (syllables per line, syllables per second)
 * - Adversarial callouts (direct challenges)
 * - Vocabulary novelty (unique words ratio)
 */

import { db } from '../db';
import { lyricFeatures, lyricPatternStats, detailedVideoMetrics } from '@shared/schema';
import { eq, and, desc, sql, gte } from 'drizzle-orm';
import crypto from 'crypto';

// ============================================================================
// INTERFACES
// ============================================================================

export interface LyricFeatureExtraction {
  fullLyrics: string;
  wordCount: number;
  lineCount: number;
  perspective: 'first_person' | 'third_person' | 'mixed';
  narratorStyle: 'boastful' | 'storytelling' | 'educational' | 'aggressive';
  hookText: string;
  hookStyle: 'identity_declaration' | 'challenge' | 'question' | 'claim' | 'shock';
  hookWordCount: number;
  rhymeScheme: 'AABB' | 'ABAB' | 'AABCCB' | 'XAXA' | 'mixed';
  rhymeDensity: number;
  internalRhymes: number;
  slantRhymes: number;
  multisyllabicRhymes: number;
  avgSyllablesPerLine: number;
  syllablesPerSecond: number | null;
  lineVariation: number;
  emotionalIntensity: 'low' | 'medium' | 'high' | 'extreme';
  emotionalArc: 'rising' | 'falling' | 'peak_middle' | 'steady';
  factDensity: number;
  adversarialCallouts: number;
  repetitionAnchors: number;
  vocabularyNovelty: number;
  featureHash: string;
}

export interface PatternGuidance {
  perspective: {
    use: string[];
    avoid: string[];
  };
  hookStyle: {
    use: string[];
    avoid: string[];
  };
  rhymeScheme: {
    use: string[];
    avoid: string[];
  };
  emotionalIntensity: {
    use: string[];
    avoid: string[];
  };
  promptInjection: string;
}

// ============================================================================
// FEATURE EXTRACTION UTILITIES
// ============================================================================

const FIRST_PERSON_MARKERS = ['i ', "i'", 'my ', 'me ', 'mine', 'myself'];
const THIRD_PERSON_MARKERS = ['he ', 'she ', 'they ', 'his ', 'her ', 'their ', 'him '];
const ADVERSARIAL_WORDS = ['you ', 'your ', 'they say', 'them ', 'those who'];
const EMOTIONAL_INTENSIFIERS = [
  'kill',
  'die',
  'death',
  'blood',
  'conquer',
  'destroy',
  'crush',
  'burn',
  'war',
  'empire',
  'legacy',
  'legend',
  'immortal',
  'eternal',
];
const FACT_INDICATORS =
  /\b\d{3,4}\b|\b\d+\s*(million|billion|thousand|hundred|years?|days?|men|soldiers|battles?|wars?)\b/gi;

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');

  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function getLastWord(line: string): string {
  const words = line.trim().split(/\s+/);
  const lastWord = words[words.length - 1] || '';
  return lastWord.toLowerCase().replace(/[^a-z]/g, '');
}

function rhymesWithStrict(word1: string, word2: string): boolean {
  if (word1 === word2) return false;
  if (word1.length < 2 || word2.length < 2) return false;

  const ending1 = word1.slice(-3);
  const ending2 = word2.slice(-3);

  if (ending1 === ending2) return true;
  if (word1.slice(-2) === word2.slice(-2)) return true;

  return false;
}

function detectRhymeScheme(lines: string[]): 'AABB' | 'ABAB' | 'AABCCB' | 'XAXA' | 'mixed' {
  if (lines.length < 4) return 'mixed';

  const endWords = lines.slice(0, 8).map(getLastWord);

  let aaCount = 0;
  let abCount = 0;

  for (let i = 0; i < endWords.length - 1; i += 2) {
    if (rhymesWithStrict(endWords[i], endWords[i + 1])) aaCount++;
  }

  for (let i = 0; i < endWords.length - 2; i += 2) {
    if (rhymesWithStrict(endWords[i], endWords[i + 2])) abCount++;
  }

  if (aaCount >= 2) return 'AABB';
  if (abCount >= 2) return 'ABAB';

  return 'mixed';
}

function countInternalRhymes(lyrics: string): number {
  const lines = lyrics.split('\n').filter((l) => l.trim() && !l.startsWith('['));
  let count = 0;

  for (const line of lines) {
    const words = line
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);
    for (let i = 0; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        if (rhymesWithStrict(words[i], words[j])) {
          count++;
        }
      }
    }
  }

  return count;
}

function detectHookStyle(hookText: string): 'identity_declaration' | 'challenge' | 'question' | 'claim' | 'shock' {
  const hookLower = hookText.toLowerCase();

  if (hookLower.includes('?')) return 'question';
  if (/^i am |^i'm |^they call me |^my name is /i.test(hookLower)) return 'identity_declaration';
  if (/^you |think you|could you|try me/i.test(hookLower)) return 'challenge';
  if (/kill|die|blood|death|destroy|burn|war|conquer/i.test(hookLower)) return 'shock';

  return 'claim';
}

function detectEmotionalIntensity(lyrics: string): 'low' | 'medium' | 'high' | 'extreme' {
  const lyricsLower = lyrics.toLowerCase();
  let score = 0;

  for (const word of EMOTIONAL_INTENSIFIERS) {
    const matches = lyricsLower.match(new RegExp(word, 'gi'));
    if (matches) score += matches.length;
  }

  const wordCount = lyrics.split(/\s+/).length;
  const density = score / wordCount;

  if (density > 0.15) return 'extreme';
  if (density > 0.08) return 'high';
  if (density > 0.03) return 'medium';
  return 'low';
}

function detectEmotionalArc(lyrics: string): 'rising' | 'falling' | 'peak_middle' | 'steady' {
  const lines = lyrics.split('\n').filter((l) => l.trim() && !l.startsWith('['));
  if (lines.length < 6) return 'steady';

  const third = Math.floor(lines.length / 3);
  const first = lines.slice(0, third).join(' ');
  const middle = lines.slice(third, third * 2).join(' ');
  const last = lines.slice(third * 2).join(' ');

  const scoreFirst = EMOTIONAL_INTENSIFIERS.filter((w) => first.toLowerCase().includes(w)).length;
  const scoreMiddle = EMOTIONAL_INTENSIFIERS.filter((w) => middle.toLowerCase().includes(w)).length;
  const scoreLast = EMOTIONAL_INTENSIFIERS.filter((w) => last.toLowerCase().includes(w)).length;

  if (scoreLast > scoreFirst && scoreLast > scoreMiddle) return 'rising';
  if (scoreFirst > scoreLast && scoreFirst > scoreMiddle) return 'falling';
  if (scoreMiddle > scoreFirst && scoreMiddle > scoreLast) return 'peak_middle';
  return 'steady';
}

// ============================================================================
// MAIN SERVICE
// ============================================================================

export class LyricAnalyticsService {
  /**
   * Extract all lyric features from raw lyrics text
   */
  extractFeatures(lyrics: string, syllablesPerSecond?: number): LyricFeatureExtraction {
    const lines = lyrics.split('\n').filter((l) => l.trim() && !l.startsWith('['));
    const words = lyrics
      .replace(/\[[^\]]*\]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    const lyricsLower = lyrics.toLowerCase();
    const firstPersonCount = FIRST_PERSON_MARKERS.filter((m) => lyricsLower.includes(m)).length;
    const thirdPersonCount = THIRD_PERSON_MARKERS.filter((m) => lyricsLower.includes(m)).length;

    let perspective: 'first_person' | 'third_person' | 'mixed';
    if (firstPersonCount > thirdPersonCount * 2) perspective = 'first_person';
    else if (thirdPersonCount > firstPersonCount * 2) perspective = 'third_person';
    else perspective = 'mixed';

    const hookMatch = lyrics.match(/\[HOOK\]([\s\S]*?)(?=\[|$)/i) || lyrics.match(/\[INTRO\]([\s\S]*?)(?=\[|$)/i);
    const hookText = hookMatch ? hookMatch[1].trim() : lines.slice(0, 4).join('\n');
    const hookWords = hookText.split(/\s+/).filter((w) => w.length > 0);

    const syllablesPerLine = lines.map((line) => {
      return line.split(/\s+/).reduce((sum, word) => sum + countSyllables(word), 0);
    });
    const avgSyllablesPerLine = syllablesPerLine.reduce((a, b) => a + b, 0) / (lines.length || 1);

    const mean = avgSyllablesPerLine;
    const variance = syllablesPerLine.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / (lines.length || 1);
    const lineVariation = Math.sqrt(variance) / (mean || 1);

    const adversarialCount = ADVERSARIAL_WORDS.reduce((count, word) => {
      const matches = lyricsLower.match(new RegExp(word, 'gi'));
      return count + (matches ? matches.length : 0);
    }, 0);

    const factMatches = lyrics.match(FACT_INDICATORS);
    const factDensity = (factMatches ? factMatches.length : 0) / (lines.length || 1);

    const wordSet = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z]/g, '')));
    const vocabularyNovelty = wordSet.size / (words.length || 1);

    const narratorStyle =
      adversarialCount > 3
        ? 'aggressive'
        : factDensity > 0.3
          ? 'educational'
          : perspective === 'first_person'
            ? 'boastful'
            : 'storytelling';

    const featureHash = this.computeFeatureHash({
      perspective,
      hookStyle: detectHookStyle(hookText),
      rhymeScheme: detectRhymeScheme(lines),
      emotionalIntensity: detectEmotionalIntensity(lyrics),
    });

    return {
      fullLyrics: lyrics,
      wordCount: words.length,
      lineCount: lines.length,
      perspective,
      narratorStyle: narratorStyle as any,
      hookText,
      hookStyle: detectHookStyle(hookText),
      hookWordCount: hookWords.length,
      rhymeScheme: detectRhymeScheme(lines),
      rhymeDensity: lines.length > 0 ? 0.8 : 0, // Simplified - assumes most lines rhyme
      internalRhymes: countInternalRhymes(lyrics),
      slantRhymes: 0, // Would need phonetic analysis
      multisyllabicRhymes: 0, // Would need phonetic analysis
      avgSyllablesPerLine: Math.round(avgSyllablesPerLine * 100) / 100,
      syllablesPerSecond: syllablesPerSecond || null,
      lineVariation: Math.round(lineVariation * 1000) / 1000,
      emotionalIntensity: detectEmotionalIntensity(lyrics),
      emotionalArc: detectEmotionalArc(lyrics),
      factDensity: Math.round(factDensity * 1000) / 1000,
      adversarialCallouts: adversarialCount,
      repetitionAnchors: 0, // Would need repeated phrase detection
      vocabularyNovelty: Math.round(vocabularyNovelty * 1000) / 1000,
      featureHash,
    };
  }

  /**
   * Compute a hash for grouping similar feature combinations
   */
  private computeFeatureHash(features: {
    perspective: string;
    hookStyle: string;
    rhymeScheme: string;
    emotionalIntensity: string;
  }): string {
    const key = `${features.perspective}|${features.hookStyle}|${features.rhymeScheme}|${features.emotionalIntensity}`;
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  /**
   * Save extracted features to database
   */
  async saveFeatures(packageId: string, features: LyricFeatureExtraction, videoId?: string): Promise<void> {
    await db.insert(lyricFeatures).values({
      packageId,
      videoId,
      fullLyrics: features.fullLyrics,
      wordCount: features.wordCount,
      lineCount: features.lineCount,
      perspective: features.perspective,
      narratorStyle: features.narratorStyle,
      hookText: features.hookText,
      hookStyle: features.hookStyle,
      hookWordCount: features.hookWordCount,
      rhymeScheme: features.rhymeScheme,
      rhymeDensity: features.rhymeDensity.toString(),
      internalRhymes: features.internalRhymes,
      slantRhymes: features.slantRhymes,
      multisyllabicRhymes: features.multisyllabicRhymes,
      avgSyllablesPerLine: features.avgSyllablesPerLine.toString(),
      syllablesPerSecond: features.syllablesPerSecond?.toString() || null,
      lineVariation: features.lineVariation.toString(),
      emotionalIntensity: features.emotionalIntensity,
      emotionalArc: features.emotionalArc,
      factDensity: features.factDensity.toString(),
      adversarialCallouts: features.adversarialCallouts,
      repetitionAnchors: features.repetitionAnchors,
      vocabularyNovelty: features.vocabularyNovelty.toString(),
      featureHash: features.featureHash,
    });

    console.log(`📊 Saved lyric features for package ${packageId}`);
  }

  /**
   * Link lyric features to YouTube video after upload
   */
  async linkToVideo(packageId: string, videoId: string): Promise<void> {
    await db.update(lyricFeatures).set({ videoId }).where(eq(lyricFeatures.packageId, packageId));

    console.log(`🔗 Linked lyric features to video ${videoId}`);
  }

  /**
   * Update pattern stats based on video performance
   * Called by metrics harvesting to update Thompson Sampling state
   */
  async updatePatternPerformance(videoId: string): Promise<void> {
    const features = await db.select().from(lyricFeatures).where(eq(lyricFeatures.videoId, videoId)).limit(1);

    if (features.length === 0) {
      console.log(`⚠️ No lyric features found for video ${videoId}`);
      return;
    }

    const metrics = await db
      .select()
      .from(detailedVideoMetrics)
      .where(eq(detailedVideoMetrics.videoId, videoId))
      .limit(1);

    if (metrics.length === 0) {
      console.log(`⚠️ No metrics found for video ${videoId}`);
      return;
    }

    const feature = features[0];
    const metric = metrics[0];

    const views = Number(metric.viewCount || 0);
    const avgViewDuration = Number((metric as any).averageViewDuration || (metric as any).avgViewDuration || 0);
    const ctr = Number(metric.clickThroughRate || 0);

    const isSuccess = views >= 500 && (ctr > 8 || avgViewDuration > 50);

    const patternsToUpdate = [
      { type: 'perspective', value: feature.perspective },
      { type: 'hook_style', value: feature.hookStyle },
      { type: 'rhyme_scheme', value: feature.rhymeScheme },
      { type: 'emotional_intensity', value: feature.emotionalIntensity },
      { type: 'narrator_style', value: feature.narratorStyle },
      { type: 'emotional_arc', value: feature.emotionalArc },
    ];

    for (const pattern of patternsToUpdate) {
      if (!pattern.value) continue;

      const existing = await db
        .select()
        .from(lyricPatternStats)
        .where(and(eq(lyricPatternStats.patternType, pattern.type), eq(lyricPatternStats.patternValue, pattern.value)))
        .limit(1);

      if (existing.length > 0) {
        const stat = existing[0];
        const newAlpha = Number(stat.alpha) + (isSuccess ? 1 : 0);
        const newBeta = Number(stat.beta) + (isSuccess ? 0 : 1);
        const newPulls = stat.pulls + 1;

        const existingVideoIds = stat.sampleVideoIds || [];
        const newVideoIds = [...existingVideoIds.slice(-9), videoId];

        const newAvgViews = (Number(stat.avgViews) * stat.pulls + views) / newPulls;
        const newAvgRetention = (Number(stat.avgRetention) * stat.pulls + avgViewDuration) / newPulls;
        const newAvgCtr = (Number(stat.avgCtr) * stat.pulls + ctr) / newPulls;
        const newSuccessRate = ((newAlpha - 1) / (newPulls || 1)) * 100;

        let verdict: 'proven' | 'neutral' | 'avoid' = 'neutral';
        if (newPulls >= 5) {
          if (newSuccessRate >= 50) verdict = 'proven';
          else if (newSuccessRate <= 20) verdict = 'avoid';
        }

        await db
          .update(lyricPatternStats)
          .set({
            alpha: newAlpha.toString(),
            beta: newBeta.toString(),
            pulls: newPulls,
            avgViews: newAvgViews.toString(),
            avgRetention: newAvgRetention.toString(),
            avgCtr: newAvgCtr.toString(),
            successRate: newSuccessRate.toString(),
            verdict,
            sampleVideoIds: newVideoIds,
            lastUpdated: new Date(),
          })
          .where(eq(lyricPatternStats.id, stat.id));
      } else {
        await db.insert(lyricPatternStats).values({
          patternType: pattern.type,
          patternValue: pattern.value,
          alpha: isSuccess ? '2' : '1',
          beta: isSuccess ? '1' : '2',
          pulls: 1,
          avgViews: views.toString(),
          avgRetention: avgViewDuration.toString(),
          avgCtr: ctr.toString(),
          successRate: isSuccess ? '100' : '0',
          verdict: 'neutral',
          sampleVideoIds: [videoId],
        });
      }
    }

    console.log(`📈 Updated lyric pattern stats for video ${videoId} (success: ${isSuccess})`);
  }

  /**
   * Thompson Sampling: Sample from Beta distribution to select best pattern
   */
  private sampleBeta(alpha: number, beta: number): number {
    const gamma1 = this.sampleGamma(alpha);
    const gamma2 = this.sampleGamma(beta);
    return gamma1 / (gamma1 + gamma2);
  }

  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(1 + shape) * Math.pow(Math.random(), 1 / shape);
    }

    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = this.randomNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();

      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  private randomNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /**
   * Get guidance for lyrics generation based on learned patterns
   */
  async getPatternGuidance(): Promise<PatternGuidance> {
    const stats = await db.select().from(lyricPatternStats).where(gte(lyricPatternStats.pulls, 3)); // Only patterns with enough data

    const guidance: PatternGuidance = {
      perspective: { use: [], avoid: [] },
      hookStyle: { use: [], avoid: [] },
      rhymeScheme: { use: [], avoid: [] },
      emotionalIntensity: { use: [], avoid: [] },
      promptInjection: '',
    };

    const byType: Record<string, typeof stats> = {};
    for (const stat of stats) {
      if (!byType[stat.patternType]) byType[stat.patternType] = [];
      byType[stat.patternType].push(stat);
    }

    for (const type of ['perspective', 'hook_style', 'rhyme_scheme', 'emotional_intensity']) {
      const patterns = byType[type] || [];

      const sampledPatterns = patterns
        .map((p) => ({
          value: p.patternValue,
          sample: this.sampleBeta(Number(p.alpha), Number(p.beta)),
          verdict: p.verdict,
        }))
        .sort((a, b) => b.sample - a.sample);

      const guidanceKey = type.replace('_', '') as keyof PatternGuidance;
      if (guidanceKey === 'promptInjection') continue;

      const normalizedKey =
        type === 'hook_style'
          ? 'hookStyle'
          : type === 'rhyme_scheme'
            ? 'rhymeScheme'
            : type === 'emotional_intensity'
              ? 'emotionalIntensity'
              : type;

      for (const p of sampledPatterns) {
        if (p.verdict === 'proven') {
          (guidance as any)[normalizedKey].use.push(p.value);
        } else if (p.verdict === 'avoid') {
          (guidance as any)[normalizedKey].avoid.push(p.value);
        }
      }
    }

    const promptParts: string[] = [];

    if (guidance.perspective.use.length > 0) {
      promptParts.push(
        `PROVEN PERSPECTIVE: Use ${guidance.perspective.use.join(' or ')} - these get 50%+ more engagement`,
      );
    }
    if (guidance.perspective.avoid.length > 0) {
      promptParts.push(`AVOID PERSPECTIVE: ${guidance.perspective.avoid.join(', ')} - poor performance`);
    }

    if (guidance.hookStyle.use.length > 0) {
      promptParts.push(`PROVEN HOOKS: ${guidance.hookStyle.use.join(', ')} hooks work best`);
    }
    if (guidance.hookStyle.avoid.length > 0) {
      promptParts.push(`AVOID HOOKS: ${guidance.hookStyle.avoid.join(', ')} - low retention`);
    }

    if (guidance.rhymeScheme.use.length > 0) {
      promptParts.push(`WINNING RHYME SCHEME: ${guidance.rhymeScheme.use.join(' or ')}`);
    }

    if (guidance.emotionalIntensity.use.length > 0) {
      promptParts.push(`OPTIMAL INTENSITY: ${guidance.emotionalIntensity.use.join(' or ')}`);
    }

    guidance.promptInjection =
      promptParts.length > 0 ? `\n\n## LEARNED FROM PERFORMANCE DATA\n${promptParts.join('\n')}` : '';

    return guidance;
  }

  /**
   * Get Thompson Sampling recommendation for a specific pattern type
   */
  async sampleBestPattern(patternType: string): Promise<string | null> {
    const patterns = await db.select().from(lyricPatternStats).where(eq(lyricPatternStats.patternType, patternType));

    if (patterns.length === 0) return null;

    let bestPattern = '';
    let bestSample = -1;

    for (const p of patterns) {
      const sample = this.sampleBeta(Number(p.alpha), Number(p.beta));
      if (sample > bestSample) {
        bestSample = sample;
        bestPattern = p.patternValue;
      }
    }

    return bestPattern;
  }

  /**
   * Direct method to update or create pattern stats - for backfill purposes
   */
  async updateOrCreatePatternStats(
    patternType: string,
    patternValue: string,
    isSuccess: boolean,
    views: number,
    ctr: number,
    retention: number,
  ): Promise<void> {
    if (!patternValue) return;

    const existing = await db
      .select()
      .from(lyricPatternStats)
      .where(and(eq(lyricPatternStats.patternType, patternType), eq(lyricPatternStats.patternValue, patternValue)))
      .limit(1);

    if (existing.length > 0) {
      const stat = existing[0];
      const newAlpha = Number(stat.alpha) + (isSuccess ? 1 : 0);
      const newBeta = Number(stat.beta) + (isSuccess ? 0 : 1);
      const newPulls = stat.pulls + 1;

      const newAvgViews = (Number(stat.avgViews) * stat.pulls + views) / newPulls;
      const newAvgRetention = (Number(stat.avgRetention) * stat.pulls + retention) / newPulls;
      const newAvgCtr = (Number(stat.avgCtr) * stat.pulls + ctr) / newPulls;
      const newSuccessRate = ((newAlpha - 1) / (newPulls || 1)) * 100;

      let verdict: 'proven' | 'neutral' | 'avoid' = 'neutral';
      if (newPulls >= 5) {
        if (newSuccessRate >= 50) verdict = 'proven';
        else if (newSuccessRate <= 20) verdict = 'avoid';
      }

      await db
        .update(lyricPatternStats)
        .set({
          alpha: newAlpha.toString(),
          beta: newBeta.toString(),
          pulls: newPulls,
          avgViews: newAvgViews.toString(),
          avgRetention: newAvgRetention.toString(),
          avgCtr: newAvgCtr.toString(),
          successRate: newSuccessRate.toString(),
          verdict,
          lastUpdated: new Date(),
        })
        .where(eq(lyricPatternStats.id, stat.id));
    } else {
      await db.insert(lyricPatternStats).values({
        patternType,
        patternValue,
        alpha: isSuccess ? '2' : '1',
        beta: isSuccess ? '1' : '2',
        pulls: 1,
        avgViews: views.toString(),
        avgRetention: retention.toString(),
        avgCtr: ctr.toString(),
        successRate: isSuccess ? '100' : '0',
        verdict: 'neutral',
        sampleVideoIds: [],
      });
    }
  }

  /**
   * Get analytics summary for dashboard
   */
  async getSummary(): Promise<{
    totalTracked: number;
    patternsLearned: number;
    provenPatterns: string[];
    avoidPatterns: string[];
    topPerformingCombination: string | null;
  }> {
    const [featureCount] = await db.select({ count: sql<number>`count(*)` }).from(lyricFeatures);
    const [patternCount] = await db.select({ count: sql<number>`count(*)` }).from(lyricPatternStats);

    const proven = await db.select().from(lyricPatternStats).where(eq(lyricPatternStats.verdict, 'proven'));

    const avoid = await db.select().from(lyricPatternStats).where(eq(lyricPatternStats.verdict, 'avoid'));

    const topFeature = await db
      .select()
      .from(lyricFeatures)
      .innerJoin(detailedVideoMetrics, eq(lyricFeatures.videoId, detailedVideoMetrics.videoId))
      .orderBy(desc(detailedVideoMetrics.viewCount))
      .limit(1);

    return {
      totalTracked: Number(featureCount.count),
      patternsLearned: Number(patternCount.count),
      provenPatterns: proven.map((p) => `${p.patternType}: ${p.patternValue}`),
      avoidPatterns: avoid.map((p) => `${p.patternType}: ${p.patternValue}`),
      topPerformingCombination:
        topFeature.length > 0
          ? `${topFeature[0].lyric_features.perspective} / ${topFeature[0].lyric_features.hookStyle} / ${topFeature[0].lyric_features.rhymeScheme}`
          : null,
    };
  }
}

export const lyricAnalyticsService = new LyricAnalyticsService();
