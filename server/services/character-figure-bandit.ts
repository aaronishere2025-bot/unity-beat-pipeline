/**
 * CHARACTER FIGURE BANDIT SERVICE
 *
 * Thompson Sampling to learn which historical figure attributes perform best.
 * Tracks across multiple dimensions:
 * - Gender, Era, Domain, Fame Level, Story Type, Region
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface AttributeArm {
  value: string;
  alpha: number;
  beta: number;
  totalUses: number;
  totalViews: number;
  avgRetention: number;
}

interface CharacterRecord {
  characterName: string;
  videoId: string;
  attributes: Record<string, string>;
  views24h: number;
  retention8s: number;
  ctr: number;
  recordedAt: string;
}

interface CharacterStats {
  uses: number;
  totalViews: number;
  avgRetention: number;
  attributes: Record<string, string>;
}

const DIMENSIONS: Record<string, string[]> = {
  gender: ['male', 'female', 'group'],
  era: ['ancient', 'medieval', 'early_modern', 'modern', 'contemporary'],
  domain: ['military', 'science', 'arts', 'politics', 'sports', 'exploration', 'religion', 'crime', 'royalty'],
  fame_level: ['legendary', 'famous', 'notable', 'obscure'],
  story_type: ['triumph', 'tragedy', 'rivalry', 'mystery', 'scandal', 'underdog', 'genius', 'villain'],
  region: ['europe', 'americas', 'asia', 'africa', 'middle_east', 'oceania'],
};

const CHARACTER_SUGGESTIONS: Record<string, string[]> = {
  'female|ancient': ['Cleopatra', 'Boudicca', 'Hypatia', 'Nefertiti'],
  'female|medieval': ['Joan of Arc', 'Eleanor of Aquitaine', 'Wu Zetian'],
  'female|modern': ['Marie Curie', 'Amelia Earhart', 'Harriet Tubman', 'Florence Nightingale'],
  'female|contemporary': ['Frida Kahlo', 'Coco Chanel', 'Flo-Jo', 'Hedy Lamarr'],
  'male|ancient': ['Julius Caesar', 'Alexander the Great', 'Spartacus', 'Hannibal'],
  'male|medieval': ['Genghis Khan', 'Saladin', 'William Wallace', 'Richard Lionheart'],
  'male|modern': ['Napoleon', 'Tesla', 'Lincoln', 'Darwin'],
  'male|contemporary': ['Einstein', 'Churchill', 'MLK', 'Bruce Lee'],
  'military|tragedy': ['Spartacus', 'Hannibal', 'Napoleon', 'Rommel'],
  'science|genius': ['Tesla', 'Einstein', 'Da Vinci', 'Newton'],
  'arts|tragedy': ['Van Gogh', 'Mozart', 'Poe', 'Hemingway'],
  'exploration|triumph': ['Marco Polo', 'Magellan', 'Amundsen', 'Armstrong'],
  'royalty|scandal': ['Henry VIII', 'Cleopatra', 'Marie Antoinette', 'Rasputin'],
};

class CharacterFigureBandit {
  private dataPath: string;
  private arms: Record<string, Record<string, AttributeArm>> = {};
  private history: CharacterRecord[] = [];
  private characterStats: Record<string, CharacterStats> = {};
  private viewsThreshold = 1000;
  private retentionThreshold = 0.5;

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'character_figure_bandit.json');
    this.initializeArms();
    this.loadState();
  }

  private initializeArms(): void {
    for (const [dim, values] of Object.entries(DIMENSIONS)) {
      this.arms[dim] = {};
      for (const value of values) {
        this.arms[dim][value] = {
          value,
          alpha: 1,
          beta: 1,
          totalUses: 0,
          totalViews: 0,
          avgRetention: 0,
        };
      }
    }
  }

  private sampleBeta(alpha: number, beta: number): number {
    const x = this.gammaVariate(alpha);
    const y = this.gammaVariate(beta);
    return x / (x + y);
  }

  private gammaVariate(shape: number): number {
    if (shape < 1) {
      return this.gammaVariate(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    while (true) {
      let x: number, v: number;
      do {
        x = this.normalVariate();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  private normalVariate(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  selectCharacterProfile(): {
    recommendedProfile: Record<string, string>;
    samplingDetails: Record<string, { selected: string; sampleValue: number; confidence: string }>;
    suggestedCharacters: string[];
  } {
    const profile: Record<string, string> = {};
    const samplingDetails: Record<string, { selected: string; sampleValue: number; confidence: string }> = {};

    for (const [dim, arms] of Object.entries(this.arms)) {
      const armSamples = Object.values(arms).map((arm) => ({
        value: arm.value,
        sample: this.sampleBeta(arm.alpha, arm.beta),
      }));

      armSamples.sort((a, b) => b.sample - a.sample);
      const best = armSamples[0];

      profile[dim] = best.value;
      samplingDetails[dim] = {
        selected: best.value,
        sampleValue: Math.round(best.sample * 1000) / 1000,
        confidence: this.getConfidence(arms[best.value]),
      };
    }

    return {
      recommendedProfile: profile,
      samplingDetails,
      suggestedCharacters: this.suggestCharacters(profile),
    };
  }

  selectFromCandidates(candidates: Array<Record<string, string>>): {
    selected: Record<string, string>;
    score: number;
    allScores: Array<[string, number]>;
  } {
    const scored: Array<[Record<string, string>, number]> = [];

    for (const candidate of candidates) {
      let score = 1.0;
      for (const [dim, value] of Object.entries(candidate)) {
        if (dim === 'name') continue;
        if (this.arms[dim] && this.arms[dim][value]) {
          score *= this.sampleBeta(this.arms[dim][value].alpha, this.arms[dim][value].beta);
        }
      }
      scored.push([candidate, score]);
    }

    scored.sort((a, b) => b[1] - a[1]);
    const [best, bestScore] = scored[0];

    return {
      selected: best,
      score: Math.round(bestScore * 10000) / 10000,
      allScores: scored.map(([c, s]) => [c.name || 'Unknown', Math.round(s * 10000) / 10000]),
    };
  }

  private getConfidence(arm: AttributeArm): string {
    if (arm.totalUses < 3) return 'exploring';
    if (arm.totalUses < 10) return 'learning';
    if (arm.totalUses < 25) return 'confident';
    return 'highly_confident';
  }

  private suggestCharacters(profile: Record<string, string>): string[] {
    const matches: string[] = [];
    const gender = profile.gender || '';
    const era = profile.era || '';
    const domain = profile.domain || '';
    const storyType = profile.story_type || '';

    for (const [key, chars] of Object.entries(CHARACTER_SUGGESTIONS)) {
      const parts = key.split('|');
      if (parts.some((p) => p === gender || p === era || p === domain || p === storyType)) {
        matches.push(...chars);
      }
    }

    const unique = [...new Set(matches)];
    return unique.slice(0, 5);
  }

  recordResult(
    character: string,
    attributes: Record<string, string>,
    views24h: number,
    retention8s: number,
    ctr: number = 0,
    videoId?: string,
  ): void {
    const viewsSuccess = views24h >= this.viewsThreshold;
    const retentionSuccess = retention8s >= this.retentionThreshold;
    const overallSuccess = viewsSuccess && retentionSuccess;

    for (const [dim, value] of Object.entries(attributes)) {
      if (!this.arms[dim]) continue;
      if (!this.arms[dim][value]) {
        this.arms[dim][value] = {
          value,
          alpha: 1,
          beta: 1,
          totalUses: 0,
          totalViews: 0,
          avgRetention: 0,
        };
      }

      const arm = this.arms[dim][value];
      arm.totalUses += 1;
      arm.totalViews += views24h;
      arm.avgRetention = (arm.avgRetention * (arm.totalUses - 1) + retention8s) / arm.totalUses;

      if (overallSuccess) {
        arm.alpha += 1;
      } else {
        arm.beta += 1;
      }
    }

    if (!this.characterStats[character]) {
      this.characterStats[character] = {
        uses: 0,
        totalViews: 0,
        avgRetention: 0,
        attributes,
      };
    }

    const stats = this.characterStats[character];
    stats.uses += 1;
    stats.totalViews += views24h;
    stats.avgRetention = (stats.avgRetention * (stats.uses - 1) + retention8s) / stats.uses;

    this.history.push({
      characterName: character,
      videoId: videoId || `video_${this.history.length}`,
      attributes,
      views24h,
      retention8s,
      ctr,
      recordedAt: new Date().toISOString(),
    });

    console.log(`📊 Character Bandit: Recorded ${character} - ${overallSuccess ? 'SUCCESS' : 'FAILURE'}`);
    this.saveState();
  }

  getDimensionRankings(dimension: string): Array<{
    value: string;
    expectedSuccess: number;
    totalUses: number;
    avgRetention: number;
    status: string;
  }> {
    if (!this.arms[dimension]) return [];

    const rankings = Object.values(this.arms[dimension]).map((arm) => {
      const expected = arm.alpha / (arm.alpha + arm.beta);
      return {
        value: arm.value,
        expectedSuccess: Math.round(expected * 1000) / 1000,
        totalUses: arm.totalUses,
        avgRetention: Math.round(arm.avgRetention * 1000) / 1000,
        status: this.getStatus(arm),
      };
    });

    rankings.sort((a, b) => b.expectedSuccess - a.expectedSuccess);
    return rankings;
  }

  private getStatus(arm: AttributeArm): string {
    const exp = arm.alpha / (arm.alpha + arm.beta);
    if (arm.totalUses < 3) return 'EXPLORING';
    if (exp > 0.6) return 'PROVEN';
    if (exp > 0.4) return 'NEUTRAL';
    if (exp > 0.25) return 'EMERGING';
    return 'FAILING';
  }

  getAllRankings(): Record<
    string,
    Array<{
      value: string;
      expectedSuccess: number;
      totalUses: number;
      status: string;
    }>
  > {
    const result: Record<string, any[]> = {};
    for (const dim of Object.keys(DIMENSIONS)) {
      result[dim] = this.getDimensionRankings(dim);
    }
    return result;
  }

  getTopCharacters(n: number = 10): Array<{
    name: string;
    uses: number;
    totalViews: number;
    avgRetention: number;
    viewsPerUse: number;
  }> {
    return Object.entries(this.characterStats)
      .map(([name, stats]) => ({
        name,
        uses: stats.uses,
        totalViews: stats.totalViews,
        avgRetention: Math.round(stats.avgRetention * 1000) / 1000,
        viewsPerUse: Math.round(stats.totalViews / stats.uses),
      }))
      .sort((a, b) => b.viewsPerUse - a.viewsPerUse)
      .slice(0, n);
  }

  getStats(): {
    totalDimensions: number;
    totalArms: number;
    armsWithData: number;
    historyCount: number;
    topDimension: { name: string; topValue: string; successRate: number } | null;
  } {
    let totalArms = 0;
    let armsWithData = 0;
    let topDimension: { name: string; topValue: string; successRate: number } | null = null;
    let highestRate = 0;

    for (const [dim, arms] of Object.entries(this.arms)) {
      for (const arm of Object.values(arms)) {
        totalArms++;
        if (arm.totalUses > 0) armsWithData++;
        const rate = arm.alpha / (arm.alpha + arm.beta);
        if (arm.totalUses >= 3 && rate > highestRate) {
          highestRate = rate;
          topDimension = { name: dim, topValue: arm.value, successRate: rate };
        }
      }
    }

    return {
      totalDimensions: Object.keys(DIMENSIONS).length,
      totalArms,
      armsWithData,
      historyCount: this.history.length,
      topDimension,
    };
  }

  private saveState(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      const state = {
        arms: this.arms,
        history: this.history.slice(-500),
        characterStats: this.characterStats,
        savedAt: new Date().toISOString(),
      };
      writeFileSync(this.dataPath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.warn('Could not save Character Bandit state');
    }
  }

  private loadState(): void {
    try {
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        if (data.arms) this.arms = data.arms;
        if (data.history) this.history = data.history;
        if (data.characterStats) this.characterStats = data.characterStats;
        console.log(`👤 Character Figure Bandit: Loaded ${this.history.length} records`);
      }
    } catch (error) {
      console.warn('Could not load Character Bandit state');
    }
  }
}

export const characterFigureBandit = new CharacterFigureBandit();
