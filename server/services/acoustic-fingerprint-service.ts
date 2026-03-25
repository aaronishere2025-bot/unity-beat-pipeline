import { spawn } from 'child_process';
import { db } from '../db';
import { audioDna } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface AcousticFingerprint {
  file_path: string;
  duration_seconds: number;

  bpm: number;
  bpm_confidence: number;
  beat_count: number;
  beat_regularity: number;

  energy_mean: number;
  energy_variance: number;
  energy_dynamic_range: number;
  energy_curve: string;

  first_energy_spike_seconds: number;
  hook_energy_ratio: number;

  zcr_mean: number;
  percussiveness_score: number;

  spectral_centroid_mean: number;
  brightness_score: number;
  spectral_contrast_mean: number;

  onset_count: number;
  onset_density: number;

  mfcc_means: number[];

  num_sections: number;
  section_boundaries: number[];

  key_estimate: string;
  key_confidence: number;

  predicted_hook_survival: number;
  energy_spikes: Array<{ time: number; magnitude: number }>;

  dna_scores: {
    energy_score: number;
    rhythm_score: number;
    clarity_score: number;
    hook_score: number;
  };

  track_character: string;
  harmonic_ratio: number;
}

export interface WinnerPattern {
  bpm_range: [number, number];
  energy_variance_min: number;
  first_drop_max_seconds: number;
  percussiveness_min: number;
  brightness_min: number;
}

class AcousticFingerprintService {
  private winnerPatterns: WinnerPattern = {
    bpm_range: [120, 150],
    energy_variance_min: 0.0005,
    first_drop_max_seconds: 4.0,
    percussiveness_min: 0.3,
    brightness_min: 0.4,
  };

  async extractFingerprint(audioPath: string): Promise<AcousticFingerprint | null> {
    console.log(`🎵 [AcousticFingerprintService] Extracting fingerprint: ${audioPath}`);

    return new Promise((resolve) => {
      const python = spawn('python3', ['scripts/audio_analyzer.py', '--fingerprint', audioPath]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          console.error(`   ❌ Fingerprint extraction failed: ${stderr}`);
          resolve(null);
          return;
        }

        try {
          const result = JSON.parse(stdout);
          if (result.success && result.fingerprint) {
            console.log(
              `   ✅ Fingerprint extracted: BPM=${result.fingerprint.bpm}, Hook Survival=${result.fingerprint.predicted_hook_survival}`,
            );
            resolve(result.fingerprint);
          } else {
            console.error(`   ❌ Fingerprint extraction failed: ${result.error || 'Unknown error'}`);
            resolve(null);
          }
        } catch (e) {
          console.error(`   ❌ Failed to parse fingerprint: ${e}`);
          resolve(null);
        }
      });
    });
  }

  async storeFingerprint(
    packageId: string,
    fingerprint: AcousticFingerprint,
    videoId?: string,
  ): Promise<string | null> {
    try {
      const [result] = await db
        .insert(audioDna)
        .values({
          packageId,
          videoId: videoId || null,
          filePath: fingerprint.file_path,

          bpm: fingerprint.bpm,
          bpmConfidence: fingerprint.bpm_confidence,
          beatCount: fingerprint.beat_count,
          beatRegularity: fingerprint.beat_regularity,

          energyMean: fingerprint.energy_mean,
          energyVariance: fingerprint.energy_variance,
          energyDynamicRange: fingerprint.energy_dynamic_range,
          energyCurve: fingerprint.energy_curve,

          firstEnergySpikeSeconds: fingerprint.first_energy_spike_seconds,
          hookEnergyRatio: fingerprint.hook_energy_ratio,

          zcrMean: fingerprint.zcr_mean,
          percussivenessScore: fingerprint.percussiveness_score,

          spectralCentroidMean: fingerprint.spectral_centroid_mean,
          brightnessScore: fingerprint.brightness_score,
          spectralContrastMean: fingerprint.spectral_contrast_mean,

          onsetCount: fingerprint.onset_count,
          onsetDensity: fingerprint.onset_density,

          mfccMeans: JSON.stringify(fingerprint.mfcc_means),

          numSections: fingerprint.num_sections,
          sectionBoundaries: JSON.stringify(fingerprint.section_boundaries),

          keyEstimate: fingerprint.key_estimate,
          keyConfidence: fingerprint.key_confidence,

          predictedHookSurvival: fingerprint.predicted_hook_survival,
          energySpikes: JSON.stringify(fingerprint.energy_spikes),

          dnaScores: JSON.stringify(fingerprint.dna_scores),

          trackCharacter: fingerprint.track_character,
          harmonicRatio: fingerprint.harmonic_ratio,

          durationSeconds: fingerprint.duration_seconds,
        })
        .returning({ id: audioDna.id });

      console.log(`   ✅ Fingerprint stored: ${result.id}`);
      return result.id;
    } catch (e) {
      console.error(`   ❌ Failed to store fingerprint: ${e}`);
      return null;
    }
  }

  async getFingerprintByPackage(packageId: string): Promise<AcousticFingerprint | null> {
    const results = await db.select().from(audioDna).where(eq(audioDna.packageId, packageId)).limit(1);
    if (results.length === 0) return null;

    const row = results[0];
    return this.rowToFingerprint(row);
  }

  async getWinnerFingerprints(): Promise<AcousticFingerprint[]> {
    const results = await db.select().from(audioDna).where(eq(audioDna.predictedHookSurvival, 0.5)).limit(50);

    return results.map((row) => this.rowToFingerprint(row)).filter((f) => f !== null) as AcousticFingerprint[];
  }

  compareToWinnerPatterns(fingerprint: AcousticFingerprint): {
    similarity_score: number;
    matching_features: string[];
    diverging_features: string[];
    recommendation: string;
  } {
    const matching: string[] = [];
    const diverging: string[] = [];
    let score = 0;

    if (fingerprint.bpm >= this.winnerPatterns.bpm_range[0] && fingerprint.bpm <= this.winnerPatterns.bpm_range[1]) {
      matching.push(
        `BPM ${fingerprint.bpm} is in optimal range ${this.winnerPatterns.bpm_range[0]}-${this.winnerPatterns.bpm_range[1]}`,
      );
      score += 20;
    } else {
      diverging.push(
        `BPM ${fingerprint.bpm} outside optimal range ${this.winnerPatterns.bpm_range[0]}-${this.winnerPatterns.bpm_range[1]}`,
      );
    }

    if (fingerprint.energy_variance >= this.winnerPatterns.energy_variance_min) {
      matching.push(`Energy variance ${fingerprint.energy_variance.toFixed(4)} shows dynamic audio`);
      score += 25;
    } else {
      diverging.push(`Energy variance ${fingerprint.energy_variance.toFixed(4)} too low - audio sounds flat`);
    }

    if (fingerprint.first_energy_spike_seconds <= this.winnerPatterns.first_drop_max_seconds) {
      matching.push(
        `First energy spike at ${fingerprint.first_energy_spike_seconds.toFixed(1)}s catches attention early`,
      );
      score += 25;
    } else {
      diverging.push(
        `First energy spike at ${fingerprint.first_energy_spike_seconds.toFixed(1)}s - hook may be too slow`,
      );
    }

    if (fingerprint.percussiveness_score >= this.winnerPatterns.percussiveness_min) {
      matching.push(`Percussiveness ${(fingerprint.percussiveness_score * 100).toFixed(0)}% provides good punch`);
      score += 15;
    } else {
      diverging.push(`Percussiveness ${(fingerprint.percussiveness_score * 100).toFixed(0)}% too low - lacks punch`);
    }

    if (fingerprint.brightness_score >= this.winnerPatterns.brightness_min) {
      matching.push(`Brightness ${(fingerprint.brightness_score * 100).toFixed(0)}% gives clear, crisp audio`);
      score += 15;
    } else {
      diverging.push(`Brightness ${(fingerprint.brightness_score * 100).toFixed(0)}% too low - audio sounds muffled`);
    }

    let recommendation: string;
    if (score >= 80) {
      recommendation = 'EXCELLENT: This audio profile matches winner patterns. Proceed with confidence.';
    } else if (score >= 60) {
      recommendation = 'GOOD: Audio has strong elements but could improve on: ' + diverging.slice(0, 2).join('; ');
    } else if (score >= 40) {
      recommendation = 'AVERAGE: Consider adjusting: ' + diverging.join('; ');
    } else {
      recommendation =
        'NEEDS WORK: Audio profile differs significantly from winners. Key issues: ' + diverging.join('; ');
    }

    return {
      similarity_score: score,
      matching_features: matching,
      diverging_features: diverging,
      recommendation,
    };
  }

  generateStrategicInsight(fingerprint: AcousticFingerprint): string {
    const comparison = this.compareToWinnerPatterns(fingerprint);
    const scores = fingerprint.dna_scores;

    return `
## Audio DNA Analysis

**Overall Hook Survival Prediction:** ${(fingerprint.predicted_hook_survival * 100).toFixed(0)}%

### DNA Scores (0-100)
- Energy Score: ${scores.energy_score}/100
- Rhythm Score: ${scores.rhythm_score}/100
- Clarity Score: ${scores.clarity_score}/100
- Hook Score: ${scores.hook_score}/100

### Key Metrics
- **BPM:** ${fingerprint.bpm} (${fingerprint.energy_curve} energy curve)
- **First Drop:** ${fingerprint.first_energy_spike_seconds.toFixed(1)}s
- **Hook Energy Ratio:** ${fingerprint.hook_energy_ratio.toFixed(2)}x (${fingerprint.hook_energy_ratio > 1 ? 'front-loaded ✓' : 'slow build'})
- **Percussiveness:** ${(fingerprint.percussiveness_score * 100).toFixed(0)}%
- **Brightness:** ${(fingerprint.brightness_score * 100).toFixed(0)}%
- **Track Character:** ${fingerprint.track_character}

### Winner Pattern Match: ${comparison.similarity_score}/100

**Matching Winner Traits:**
${comparison.matching_features.map((f) => `- ✓ ${f}`).join('\n')}

**Improvement Areas:**
${comparison.diverging_features.map((f) => `- ✗ ${f}`).join('\n')}

### Recommendation
${comparison.recommendation}
`.trim();
  }

  private rowToFingerprint(row: any): AcousticFingerprint | null {
    try {
      return {
        file_path: row.filePath || '',
        duration_seconds: row.durationSeconds || 0,
        bpm: row.bpm || 0,
        bpm_confidence: row.bpmConfidence || 0,
        beat_count: row.beatCount || 0,
        beat_regularity: row.beatRegularity || 0,
        energy_mean: row.energyMean || 0,
        energy_variance: row.energyVariance || 0,
        energy_dynamic_range: row.energyDynamicRange || 0,
        energy_curve: row.energyCurve || 'flat',
        first_energy_spike_seconds: row.firstEnergySpikeSeconds || 0,
        hook_energy_ratio: row.hookEnergyRatio || 1,
        zcr_mean: row.zcrMean || 0,
        percussiveness_score: row.percussivenessScore || 0,
        spectral_centroid_mean: row.spectralCentroidMean || 0,
        brightness_score: row.brightnessScore || 0,
        spectral_contrast_mean: row.spectralContrastMean || 0,
        onset_count: row.onsetCount || 0,
        onset_density: row.onsetDensity || 0,
        mfcc_means: JSON.parse(row.mfccMeans || '[]'),
        num_sections: row.numSections || 0,
        section_boundaries: JSON.parse(row.sectionBoundaries || '[]'),
        key_estimate: row.keyEstimate || 'C',
        key_confidence: row.keyConfidence || 0,
        predicted_hook_survival: row.predictedHookSurvival || 0,
        energy_spikes: JSON.parse(row.energySpikes || '[]'),
        dna_scores: JSON.parse(row.dnaScores || '{"energy_score":0,"rhythm_score":0,"clarity_score":0,"hook_score":0}'),
        track_character: row.trackCharacter || 'balanced',
        harmonic_ratio: row.harmonicRatio || 0.5,
      };
    } catch (e) {
      console.error(`Failed to convert row to fingerprint: ${e}`);
      return null;
    }
  }

  updateWinnerPatterns(patterns: Partial<WinnerPattern>): void {
    this.winnerPatterns = { ...this.winnerPatterns, ...patterns };
    console.log(`📊 Winner patterns updated:`, this.winnerPatterns);
  }
}

export const acousticFingerprintService = new AcousticFingerprintService();
