/**
 * PROMPT QUALITY SCORING SERVICE
 *
 * Scores Kling video outputs on quality dimensions and tracks
 * which prompt patterns lead to better results.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface QualityScore {
  videoPath: string;
  promptUsed: string;
  overallScore: number;
  visualConsistency: number;
  motionQuality: number;
  promptAdherence: number;
  technicalQuality: number;
  composition: number;
  regenerationsNeeded: number;
  generationTimeSec: number;
  issues: string[];
  promptElements: Record<string, boolean>;
  scoredAt: string;
}

interface PromptPattern {
  pattern: string;
  description: string;
  timesUsed: number;
  avgQualityScore: number;
  successRate: number;
  avgRegenerations: number;
}

const PROMPT_PATTERNS: Record<string, { regex?: RegExp; check?: (p: string) => boolean; description: string }> = {
  has_camera_direction: {
    regex: /(camera|shot|angle|pan|zoom|close-up|wide|tracking)/i,
    description: 'Includes camera/shot direction',
  },
  has_lighting: {
    regex: /(lighting|lit|shadow|bright|dark|golden hour|dramatic light)/i,
    description: 'Specifies lighting',
  },
  has_motion: {
    regex: /(walking|running|moving|gesture|action|dynamic|still|static)/i,
    description: 'Specifies motion/action',
  },
  has_style: {
    regex: /(cinematic|documentary|epic|realistic|stylized|anime|painted)/i,
    description: 'Specifies visual style',
  },
  has_emotion: {
    regex: /(angry|happy|sad|determined|fierce|calm|intense|stoic)/i,
    description: 'Specifies emotion/expression',
  },
  has_environment: {
    regex: /(background|environment|setting|scene|battlefield|palace|forest)/i,
    description: 'Specifies environment/background',
  },
  has_costume: {
    regex: /(wearing|dressed|armor|robe|uniform|clothing|outfit)/i,
    description: 'Specifies costume/clothing',
  },
  is_specific: {
    regex: /\b\d+\b|specific|exact|precise/i,
    description: 'Uses specific/precise language',
  },
  word_count_optimal: {
    check: (p: string) => {
      const words = p.split(/\s+/).length;
      return words >= 20 && words <= 60;
    },
    description: 'Prompt length 20-60 words',
  },
  avoids_negatives: {
    check: (p: string) => !/(don't|no |never|without)/i.test(p),
    description: 'Avoids negative instructions',
  },
};

class PromptQualityScoringService {
  private dataPath: string;
  private history: QualityScore[] = [];
  private patternStats: Record<string, PromptPattern> = {};
  private qualityThreshold = 0.6;

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'prompt_quality_scoring.json');
    this.initializePatterns();
    this.loadState();
  }

  private initializePatterns(): void {
    for (const [name, def] of Object.entries(PROMPT_PATTERNS)) {
      this.patternStats[name] = {
        pattern: name,
        description: def.description,
        timesUsed: 0,
        avgQualityScore: 0,
        successRate: 0,
        avgRegenerations: 0,
      };
    }
  }

  analyzePrompt(prompt: string): Record<string, boolean> {
    const results: Record<string, boolean> = {};

    for (const [name, def] of Object.entries(PROMPT_PATTERNS)) {
      if (def.regex) {
        results[name] = def.regex.test(prompt);
      } else if (def.check) {
        results[name] = def.check(prompt);
      } else {
        results[name] = false;
      }
    }

    return results;
  }

  scoreVideo(
    videoPath: string,
    prompt: string,
    regenerations: number = 0,
    generationTime: number = 0,
    manualScores?: Partial<{
      visualConsistency: number;
      motionQuality: number;
      promptAdherence: number;
      technicalQuality: number;
      composition: number;
    }>,
  ): QualityScore {
    const promptElements = this.analyzePrompt(prompt);

    const scores = {
      visualConsistency: manualScores?.visualConsistency ?? 0.7,
      motionQuality: manualScores?.motionQuality ?? 0.7,
      promptAdherence: manualScores?.promptAdherence ?? 0.7,
      technicalQuality: manualScores?.technicalQuality ?? 0.7,
      composition: manualScores?.composition ?? 0.7,
    };

    const weights = {
      visualConsistency: 0.25,
      motionQuality: 0.2,
      promptAdherence: 0.25,
      technicalQuality: 0.15,
      composition: 0.15,
    };

    let overall = 0;
    for (const [key, weight] of Object.entries(weights)) {
      overall += (scores[key as keyof typeof scores] || 0.7) * weight;
    }

    const regenPenalty = regenerations * 0.05;
    overall = Math.max(0, overall - regenPenalty);

    const issues: string[] = [];
    if (scores.visualConsistency < 0.5) issues.push('inconsistent_visuals');
    if (scores.motionQuality < 0.5) issues.push('jerky_motion');
    if (scores.technicalQuality < 0.5) issues.push('low_quality');
    if (regenerations > 2) issues.push('multiple_regenerations');

    const score: QualityScore = {
      videoPath,
      promptUsed: prompt,
      overallScore: Math.round(overall * 1000) / 1000,
      ...scores,
      regenerationsNeeded: regenerations,
      generationTimeSec: generationTime,
      issues,
      promptElements,
      scoredAt: new Date().toISOString(),
    };

    this.recordScore(score);
    return score;
  }

  private recordScore(score: QualityScore): void {
    this.history.push(score);

    const passed = score.overallScore >= this.qualityThreshold;

    for (const [pattern, present] of Object.entries(score.promptElements)) {
      if (present && this.patternStats[pattern]) {
        const stats = this.patternStats[pattern];
        stats.timesUsed += 1;
        stats.avgQualityScore = (stats.avgQualityScore * (stats.timesUsed - 1) + score.overallScore) / stats.timesUsed;
        stats.avgRegenerations =
          (stats.avgRegenerations * (stats.timesUsed - 1) + score.regenerationsNeeded) / stats.timesUsed;

        const prevSuccesses = stats.successRate * (stats.timesUsed - 1);
        stats.successRate = (prevSuccesses + (passed ? 1 : 0)) / stats.timesUsed;
      }
    }

    this.saveState();
  }

  getPatternRankings(): Array<{
    pattern: string;
    description: string;
    timesUsed: number;
    avgQuality: number;
    successRate: number;
    avgRegens: number;
    status: string;
  }> {
    return Object.values(this.patternStats)
      .filter((p) => p.timesUsed > 0)
      .map((p) => ({
        pattern: p.pattern,
        description: p.description,
        timesUsed: p.timesUsed,
        avgQuality: Math.round(p.avgQualityScore * 1000) / 1000,
        successRate: Math.round(p.successRate * 1000) / 1000,
        avgRegens: Math.round(p.avgRegenerations * 100) / 100,
        status: this.getPatternStatus(p),
      }))
      .sort((a, b) => b.successRate - a.successRate);
  }

  private getPatternStatus(p: PromptPattern): string {
    if (p.timesUsed < 5) return 'EXPLORING';
    if (p.successRate > 0.7) return 'PROVEN';
    if (p.successRate > 0.5) return 'NEUTRAL';
    if (p.successRate > 0.3) return 'EMERGING';
    return 'FAILING';
  }

  enhancePrompt(basePrompt: string): {
    enhancedPrompt: string;
    addedElements: string[];
    reasoning: string[];
  } {
    const currentElements = this.analyzePrompt(basePrompt);
    const addedElements: string[] = [];
    const reasoning: string[] = [];
    let enhanced = basePrompt;

    const topPatterns = this.getPatternRankings()
      .filter((p) => p.status === 'PROVEN' && p.timesUsed >= 5)
      .slice(0, 5);

    for (const pattern of topPatterns) {
      if (!currentElements[pattern.pattern]) {
        const suggestion = this.getPatternSuggestion(pattern.pattern);
        if (suggestion) {
          addedElements.push(pattern.pattern);
          reasoning.push(`Adding ${pattern.description} (${Math.round(pattern.successRate * 100)}% success rate)`);
          enhanced += ` ${suggestion}`;
        }
      }
    }

    return {
      enhancedPrompt: enhanced.trim(),
      addedElements,
      reasoning,
    };
  }

  private getPatternSuggestion(pattern: string): string | null {
    const suggestions: Record<string, string> = {
      has_camera_direction: 'Medium shot, slight camera movement.',
      has_lighting: 'Dramatic lighting with strong shadows.',
      has_motion: 'Subtle natural movement.',
      has_style: 'Cinematic, documentary style.',
      has_emotion: 'Intense, determined expression.',
      has_environment: 'Historical setting in background.',
      has_costume: 'Period-accurate clothing and armor.',
    };
    return suggestions[pattern] || null;
  }

  getStats(): {
    totalScored: number;
    avgOverallScore: number;
    passRate: number;
    avgRegenerations: number;
    topPattern: { name: string; successRate: number } | null;
    worstPattern: { name: string; successRate: number } | null;
  } {
    if (this.history.length === 0) {
      return {
        totalScored: 0,
        avgOverallScore: 0,
        passRate: 0,
        avgRegenerations: 0,
        topPattern: null,
        worstPattern: null,
      };
    }

    const avgScore = this.history.reduce((sum, s) => sum + s.overallScore, 0) / this.history.length;
    const passCount = this.history.filter((s) => s.overallScore >= this.qualityThreshold).length;
    const avgRegens = this.history.reduce((sum, s) => sum + s.regenerationsNeeded, 0) / this.history.length;

    const rankings = this.getPatternRankings().filter((p) => p.timesUsed >= 3);
    const topPattern = rankings.length > 0 ? { name: rankings[0].pattern, successRate: rankings[0].successRate } : null;
    const worstPattern =
      rankings.length > 0
        ? { name: rankings[rankings.length - 1].pattern, successRate: rankings[rankings.length - 1].successRate }
        : null;

    return {
      totalScored: this.history.length,
      avgOverallScore: Math.round(avgScore * 1000) / 1000,
      passRate: Math.round((passCount / this.history.length) * 1000) / 1000,
      avgRegenerations: Math.round(avgRegens * 100) / 100,
      topPattern,
      worstPattern,
    };
  }

  private saveState(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      const state = {
        history: this.history.slice(-500),
        patternStats: this.patternStats,
        savedAt: new Date().toISOString(),
      };
      writeFileSync(this.dataPath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.warn('Could not save Prompt Quality state');
    }
  }

  private loadState(): void {
    try {
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        if (data.history) this.history = data.history;
        if (data.patternStats) this.patternStats = { ...this.patternStats, ...data.patternStats };
        console.log(`🎬 Prompt Quality Scoring: Loaded ${this.history.length} scores`);
      }
    } catch (error) {
      console.warn('Could not load Prompt Quality state');
    }
  }
}

export const promptQualityScoring = new PromptQualityScoringService();
