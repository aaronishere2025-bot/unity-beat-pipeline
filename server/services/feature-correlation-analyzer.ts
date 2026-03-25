/**
 * FEATURE CORRELATION ANALYZER
 *
 * Correlates librosa audio features with YouTube retention metrics
 * to generate production directives for content optimization.
 *
 * Tracks: BPM, avg_energy, spectral_brightness vs stayed_percentage
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface VideoFeatureRecord {
  videoId: string;
  title: string;
  bpm: number;
  avgEnergy: number;
  spectralBrightness: number;
  stayedPercentage: number;
  views24h: number;
  ctr: number;
  recordedAt: string;
  // NEW: Stem-level features (optional)
  stemFeatures?: {
    vocals?: StemFeatures;
    drums?: StemFeatures;
    bass?: StemFeatures;
    other?: StemFeatures;
  };
}

interface StemFeatures {
  avgEnergy: number;
  peakEnergy: number;
  energyVariance: number;
  avgBrightness: number;
  avgBandwidth: number;
}

interface CorrelationResult {
  feature: string;
  correlation: number;
  interpretation: string;
  status: 'golden_ticket' | 'significant' | 'noise' | 'negative';
}

interface ProductionDirective {
  generatedAt: string;
  sampleSize: number;
  correlations: CorrelationResult[];
  topFeature: string;
  directive: string;
  actionItems: string[];
}

class FeatureCorrelationAnalyzer {
  private dataPath: string;
  private records: VideoFeatureRecord[] = [];
  private directiveHistory: ProductionDirective[] = [];

  constructor() {
    this.dataPath = join(process.cwd(), 'data', 'feature_correlation.json');
    this.loadState();
  }

  recordVideoFeatures(
    videoId: string,
    title: string,
    audioFeatures: {
      bpm: number;
      avgEnergy: number;
      spectralBrightness: number;
      stemFeatures?: {
        vocals?: StemFeatures;
        drums?: StemFeatures;
        bass?: StemFeatures;
        other?: StemFeatures;
      };
    },
    performance: {
      stayedPercentage: number;
      views24h?: number;
      ctr?: number;
    },
  ): void {
    const record: VideoFeatureRecord = {
      videoId,
      title,
      bpm: audioFeatures.bpm,
      avgEnergy: audioFeatures.avgEnergy,
      spectralBrightness: audioFeatures.spectralBrightness,
      stayedPercentage: performance.stayedPercentage,
      views24h: performance.views24h || 0,
      ctr: performance.ctr || 0,
      recordedAt: new Date().toISOString(),
      stemFeatures: audioFeatures.stemFeatures,
    };

    const existing = this.records.findIndex((r) => r.videoId === videoId);
    if (existing >= 0) {
      this.records[existing] = record;
    } else {
      this.records.push(record);
    }

    console.log(
      `📊 Feature Correlation: Recorded ${videoId} (BPM: ${audioFeatures.bpm}, Energy: ${audioFeatures.avgEnergy.toFixed(2)}, Brightness: ${audioFeatures.spectralBrightness.toFixed(2)})`,
    );
    this.saveState();
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0 || n !== y.length) return 0;

    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denominator = Math.sqrt(denomX * denomY);
    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  private getCorrelationStatus(corr: number): 'golden_ticket' | 'significant' | 'noise' | 'negative' {
    if (corr >= 0.7) return 'golden_ticket';
    if (corr >= 0.3) return 'significant';
    if (corr >= 0) return 'noise';
    return 'negative';
  }

  private getInterpretation(feature: string, corr: number): string {
    const status = this.getCorrelationStatus(corr);

    const interpretations: Record<string, Record<string, string>> = {
      bpm: {
        golden_ticket: 'Tempo is your #1 retention driver. Faster pacing = longer watch time.',
        significant: 'Tempo matters. Consider experimenting with faster tracks.',
        noise: 'BPM has minimal impact on retention. Focus elsewhere.',
        negative: 'Tracks are too fast - audience fatigue. Slow down.',
      },
      avgEnergy: {
        golden_ticket: 'Energy/loudness is your #1 retention driver. Heavy bass and impact work.',
        significant: 'Energy drives engagement. Push the intensity.',
        noise: "Energy levels don't correlate with retention. Focus elsewhere.",
        negative: 'Tracks are too intense - consider softer dynamics.',
      },
      spectralBrightness: {
        golden_ticket: 'High-frequency shimmer is your #1 retention driver. Gold/white flashes work.',
        significant: 'Brightness matters. More high-freq sparkle helps.',
        noise: 'Spectral brightness has minimal impact. Focus elsewhere.',
        negative: 'Too much high-frequency content - sounds harsh.',
      },
    };

    return interpretations[feature]?.[status] || 'No interpretation available.';
  }

  analyzeCorrelations(minSamples: number = 5): ProductionDirective | null {
    if (this.records.length < minSamples) {
      console.log(`📊 Feature Correlation: Need ${minSamples} samples, have ${this.records.length}`);
      return null;
    }

    const stayedPcts = this.records.map((r) => r.stayedPercentage);

    const features: Array<{ name: string; values: number[] }> = [
      { name: 'bpm', values: this.records.map((r) => r.bpm) },
      { name: 'avgEnergy', values: this.records.map((r) => r.avgEnergy) },
      { name: 'spectralBrightness', values: this.records.map((r) => r.spectralBrightness) },
    ];

    // NEW: Add stem-level features if available
    const recordsWithStems = this.records.filter((r) => r.stemFeatures);
    if (recordsWithStems.length >= minSamples) {
      console.log(`📊 Analyzing stem-level correlations (${recordsWithStems.length} videos with stems)`);

      const stemNames: Array<'vocals' | 'drums' | 'bass' | 'other'> = ['vocals', 'drums', 'bass', 'other'];
      const stemStayedPcts = recordsWithStems.map((r) => r.stayedPercentage);

      for (const stemName of stemNames) {
        const stemRecords = recordsWithStems.filter((r) => r.stemFeatures?.[stemName]);
        if (stemRecords.length >= minSamples) {
          // Add stem-specific features
          features.push({
            name: `${stemName}_energy`,
            values: stemRecords.map((r) => r.stemFeatures![stemName]!.avgEnergy),
          });
          features.push({
            name: `${stemName}_brightness`,
            values: stemRecords.map((r) => r.stemFeatures![stemName]!.avgBrightness),
          });
          features.push({
            name: `${stemName}_variance`,
            values: stemRecords.map((r) => r.stemFeatures![stemName]!.energyVariance),
          });
        }
      }
    }

    const correlations: CorrelationResult[] = features.map((f) => {
      const corr = this.pearsonCorrelation(f.values, stayedPcts);
      return {
        feature: f.name,
        correlation: Math.round(corr * 100) / 100,
        interpretation: this.getInterpretation(f.name, corr),
        status: this.getCorrelationStatus(corr),
      };
    });

    correlations.sort((a, b) => b.correlation - a.correlation);
    const topFeature = correlations[0];

    const directive = this.generateDirective(topFeature);
    const actionItems = this.generateActionItems(correlations);

    const result: ProductionDirective = {
      generatedAt: new Date().toISOString(),
      sampleSize: this.records.length,
      correlations,
      topFeature: topFeature.feature,
      directive,
      actionItems,
    };

    this.directiveHistory.push(result);
    this.saveState();

    return result;
  }

  private generateDirective(topFeature: CorrelationResult): string {
    const directives: Record<string, Record<string, string>> = {
      bpm: {
        golden_ticket: 'DIRECTIVE: Increase tempo across all tracks. Target 100-120 BPM for optimal retention.',
        significant: 'DIRECTIVE: Experiment with faster tracks. Current data suggests tempo helps.',
        noise: 'DIRECTIVE: BPM is not a priority. Focus on other features.',
        negative: 'DIRECTIVE: SLOW DOWN. Reduce tempo to prevent audience fatigue.',
      },
      avgEnergy: {
        golden_ticket: 'DIRECTIVE: Heavier bass and louder masters. Impact is driving retention.',
        significant: 'DIRECTIVE: Push energy levels higher. Louder = better engagement.',
        noise: 'DIRECTIVE: Energy levels are not a priority. Focus elsewhere.',
        negative: 'DIRECTIVE: Reduce intensity. Tracks are too aggressive.',
      },
      spectralBrightness: {
        golden_ticket: 'DIRECTIVE: Use more Gold/White flashes. High-freq shimmer is your secret weapon.',
        significant: 'DIRECTIVE: Add more brightness to audio. Clarity drives retention.',
        noise: 'DIRECTIVE: Spectral brightness is not a priority. Focus elsewhere.',
        negative: 'DIRECTIVE: Reduce high frequencies. Sound is too harsh.',
      },
    };

    return directives[topFeature.feature]?.[topFeature.status] || 'Continue current approach.';
  }

  private generateActionItems(correlations: CorrelationResult[]): string[] {
    const items: string[] = [];

    for (const corr of correlations) {
      if (corr.status === 'golden_ticket') {
        items.push(`🏆 DOUBLE DOWN on ${corr.feature} (${corr.correlation} correlation)`);
      } else if (corr.status === 'significant') {
        items.push(`📈 INCREASE ${corr.feature} in next batch`);
      } else if (corr.status === 'negative') {
        items.push(`⚠️ REDUCE ${corr.feature} - currently overdoing it`);
      }
    }

    if (items.length === 0) {
      items.push('📊 No strong correlations yet - continue A/B testing');
    }

    return items;
  }

  getFeatureStats(): {
    totalRecords: number;
    avgBpm: number;
    avgEnergy: number;
    avgBrightness: number;
    avgRetention: number;
    bpmRange: { min: number; max: number };
  } {
    if (this.records.length === 0) {
      return {
        totalRecords: 0,
        avgBpm: 0,
        avgEnergy: 0,
        avgBrightness: 0,
        avgRetention: 0,
        bpmRange: { min: 0, max: 0 },
      };
    }

    const n = this.records.length;
    return {
      totalRecords: n,
      avgBpm: Math.round(this.records.reduce((s, r) => s + r.bpm, 0) / n),
      avgEnergy: Math.round((this.records.reduce((s, r) => s + r.avgEnergy, 0) / n) * 100) / 100,
      avgBrightness: Math.round((this.records.reduce((s, r) => s + r.spectralBrightness, 0) / n) * 100) / 100,
      avgRetention: Math.round((this.records.reduce((s, r) => s + r.stayedPercentage, 0) / n) * 100) / 100,
      bpmRange: {
        min: Math.min(...this.records.map((r) => r.bpm)),
        max: Math.max(...this.records.map((r) => r.bpm)),
      },
    };
  }

  getTopPerformers(n: number = 5): VideoFeatureRecord[] {
    return [...this.records].sort((a, b) => b.stayedPercentage - a.stayedPercentage).slice(0, n);
  }

  getLatestDirective(): ProductionDirective | null {
    return this.directiveHistory[this.directiveHistory.length - 1] || null;
  }

  getDirectiveHistory(): ProductionDirective[] {
    return this.directiveHistory;
  }

  importFromCSV(csvData: string): number {
    const lines = csvData.trim().split('\n');
    if (lines.length < 2) return 0;

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const bpmIdx = headers.findIndex((h) => h === 'bpm');
    const energyIdx = headers.findIndex((h) => h.includes('energy'));
    const brightnessIdx = headers.findIndex((h) => h.includes('brightness') || h.includes('spectral'));
    const retentionIdx = headers.findIndex((h) => h.includes('stayed') || h.includes('retention'));
    const videoIdIdx = headers.findIndex((h) => h.includes('video') && h.includes('id'));
    const titleIdx = headers.findIndex((h) => h === 'title');

    let imported = 0;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());

      const bpm = parseFloat(cols[bpmIdx]) || 0;
      const energy = parseFloat(cols[energyIdx]) || 0;
      const brightness = parseFloat(cols[brightnessIdx]) || 0;
      const retention = parseFloat(cols[retentionIdx]) || 0;
      const videoId = cols[videoIdIdx] || `import_${i}`;
      const title = cols[titleIdx] || `Imported Video ${i}`;

      if (bpm > 0 && retention > 0) {
        this.recordVideoFeatures(
          videoId,
          title,
          { bpm, avgEnergy: energy, spectralBrightness: brightness },
          { stayedPercentage: retention },
        );
        imported++;
      }
    }

    return imported;
  }

  printReport(): string {
    const directive = this.analyzeCorrelations();
    if (!directive) {
      return 'Not enough data for analysis. Need at least 5 videos with librosa stats.';
    }

    const lines: string[] = [
      '═══════════════════════════════════════════════════════════',
      `  PRODUCTION DIRECTIVE - ${new Date().toLocaleDateString()}`,
      '═══════════════════════════════════════════════════════════',
      '',
      `Sample Size: ${directive.sampleSize} videos`,
      '',
      '--- FEATURE CORRELATIONS ---',
    ];

    for (const corr of directive.correlations) {
      const icon =
        corr.status === 'golden_ticket'
          ? '🏆'
          : corr.status === 'significant'
            ? '📈'
            : corr.status === 'negative'
              ? '⚠️'
              : '○';
      lines.push(`${icon} ${corr.feature.toUpperCase()}: ${corr.correlation.toFixed(2)} (${corr.status})`);
    }

    lines.push('');
    lines.push('--- DIRECTIVE ---');
    lines.push(directive.directive);
    lines.push('');
    lines.push('--- ACTION ITEMS ---');
    directive.actionItems.forEach((item) => lines.push(item));

    return lines.join('\n');
  }

  private saveState(): void {
    try {
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      const state = {
        records: this.records.slice(-500),
        directiveHistory: this.directiveHistory.slice(-50),
        savedAt: new Date().toISOString(),
      };
      writeFileSync(this.dataPath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.warn('Could not save Feature Correlation state');
    }
  }

  private loadState(): void {
    try {
      if (existsSync(this.dataPath)) {
        const data = JSON.parse(readFileSync(this.dataPath, 'utf-8'));
        if (data.records) this.records = data.records;
        if (data.directiveHistory) this.directiveHistory = data.directiveHistory;
        console.log(`📊 Feature Correlation: Loaded ${this.records.length} records`);
      }
    } catch (error) {
      console.warn('Could not load Feature Correlation state');
    }
  }
}

export const featureCorrelationAnalyzer = new FeatureCorrelationAnalyzer();
