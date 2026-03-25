/**
 * Test Stem Analysis Pipeline
 *
 * Tests the complete Demucs integration:
 * 1. Separates audio into 4 stems (vocals, drums, bass, other)
 * 2. Analyzes each stem with Librosa
 * 3. Correlates stem features with retention patterns
 * 4. Stores results in database
 *
 * Usage:
 *   npx tsx test-stem-analysis.ts [audio_file_path]
 *
 * If no audio file provided, will look for sample audio in:
 * - data/videos/renders/
 * - attached_assets/music/
 */

import { demucsSeparationService } from './server/services/demucs-separation-service';
import { featureCorrelationAnalyzer } from './server/services/feature-correlation-analyzer';
import { existsSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';

async function findSampleAudio(): Promise<string | null> {
  console.log('🔍 Looking for sample audio files...');

  const searchPaths = [
    'data/videos/renders/**/*.mp3',
    'attached_assets/music/**/*.mp3',
    'attached_assets/music/**/*.wav',
  ];

  for (const pattern of searchPaths) {
    const files = glob.sync(pattern, { cwd: process.cwd(), absolute: true });
    if (files.length > 0) {
      console.log(`   Found ${files.length} files matching ${pattern}`);
      return files[0];
    }
  }

  return null;
}

async function testStemAnalysis(audioPath: string) {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  STEM ANALYSIS PIPELINE TEST');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Audio file: ${audioPath}`);
  console.log('');

  // Verify file exists
  if (!existsSync(audioPath)) {
    console.error(`❌ Audio file not found: ${audioPath}`);
    process.exit(1);
  }

  // Step 1: Separate stems and analyze
  console.log('STEP 1: Separating stems with Demucs...');
  console.log('─────────────────────────────────────────────────────────────');

  const result = await demucsSeparationService.separateAndAnalyze(audioPath);

  if (!result.success) {
    console.error(`❌ Stem separation failed: ${result.error}`);
    process.exit(1);
  }

  console.log('✅ Stem separation complete!');
  console.log('');

  // Display stems
  console.log('STEMS:');
  for (const [stemName, stemPath] of Object.entries(result.stems || {})) {
    console.log(`  - ${stemName}: ${stemPath}`);
  }
  console.log('');

  // Display analysis results
  console.log('STEP 2: Per-stem analysis results');
  console.log('─────────────────────────────────────────────────────────────');

  if (!result.analysis || Object.keys(result.analysis).length === 0) {
    console.error('❌ No analysis data returned');
    process.exit(1);
  }

  for (const [stemName, analysis] of Object.entries(result.analysis)) {
    console.log(`\n${stemName.toUpperCase()} STEM:`);
    console.log(`  Duration: ${analysis.duration}s`);
    console.log(`  Tempo: ${analysis.tempo} BPM`);
    console.log(`  Beats: ${analysis.beat_count}`);
    console.log(`  Onsets: ${analysis.onset_count}`);
    console.log(`  Overall Features:`);
    console.log(`    - Avg Energy: ${analysis.overall.avg_energy.toFixed(4)}`);
    console.log(`    - Peak Energy: ${analysis.overall.peak_energy.toFixed(4)}`);
    console.log(`    - Energy Variance: ${analysis.overall.energy_variance.toFixed(6)}`);
    console.log(`    - Avg Brightness: ${analysis.overall.avg_brightness.toFixed(1)} Hz`);
    console.log(`    - Avg Bandwidth: ${analysis.overall.avg_bandwidth.toFixed(1)} Hz`);

    // Show first 5 seconds of per-second features
    console.log(`  First 5 seconds (per-second features):`);
    for (let i = 0; i < Math.min(5, analysis.per_second_features.length); i++) {
      const feat = analysis.per_second_features[i];
      console.log(
        `    t=${feat.time}s: energy=${feat.energy.toFixed(4)}, brightness=${feat.brightness.toFixed(1)}Hz, zcr=${feat.zcr.toFixed(4)}`,
      );
    }
  }

  console.log('');
  console.log('STEP 3: Feature correlation analysis');
  console.log('─────────────────────────────────────────────────────────────');

  // Record features for a mock video (for testing correlation)
  // In real usage, this would be called with actual YouTube retention data
  const mockVideoId = `test_${Date.now()}`;
  const mockRetention = 0.45 + Math.random() * 0.3; // Random retention 45-75%

  featureCorrelationAnalyzer.recordVideoFeatures(
    mockVideoId,
    'Test Video with Stem Analysis',
    {
      bpm: result.analysis.vocals?.tempo || 120,
      avgEnergy: result.analysis.vocals?.overall.avg_energy || 0.5,
      spectralBrightness: result.analysis.vocals?.overall.avg_brightness || 2000,
      stemFeatures: {
        vocals: result.analysis.vocals
          ? {
              avgEnergy: result.analysis.vocals.overall.avg_energy,
              peakEnergy: result.analysis.vocals.overall.peak_energy,
              energyVariance: result.analysis.vocals.overall.energy_variance,
              avgBrightness: result.analysis.vocals.overall.avg_brightness,
              avgBandwidth: result.analysis.vocals.overall.avg_bandwidth,
            }
          : undefined,
        drums: result.analysis.drums
          ? {
              avgEnergy: result.analysis.drums.overall.avg_energy,
              peakEnergy: result.analysis.drums.overall.peak_energy,
              energyVariance: result.analysis.drums.overall.energy_variance,
              avgBrightness: result.analysis.drums.overall.avg_brightness,
              avgBandwidth: result.analysis.drums.overall.avg_bandwidth,
            }
          : undefined,
        bass: result.analysis.bass
          ? {
              avgEnergy: result.analysis.bass.overall.avg_energy,
              peakEnergy: result.analysis.bass.overall.peak_energy,
              energyVariance: result.analysis.bass.overall.energy_variance,
              avgBrightness: result.analysis.bass.overall.avg_brightness,
              avgBandwidth: result.analysis.bass.overall.avg_bandwidth,
            }
          : undefined,
        other: result.analysis.other
          ? {
              avgEnergy: result.analysis.other.overall.avg_energy,
              peakEnergy: result.analysis.other.overall.peak_energy,
              energyVariance: result.analysis.other.overall.energy_variance,
              avgBrightness: result.analysis.other.overall.avg_brightness,
              avgBandwidth: result.analysis.other.overall.avg_bandwidth,
            }
          : undefined,
      },
    },
    {
      stayedPercentage: mockRetention,
      views24h: Math.floor(Math.random() * 10000),
      ctr: 0.05 + Math.random() * 0.1,
    },
  );

  console.log(`✅ Recorded video features with stem data`);
  console.log(`   Video ID: ${mockVideoId}`);
  console.log(`   Retention: ${(mockRetention * 100).toFixed(1)}%`);

  // Get feature stats
  const stats = featureCorrelationAnalyzer.getFeatureStats();
  console.log('');
  console.log(`Feature Correlation Stats:`);
  console.log(`  Total records: ${stats.totalRecords}`);
  console.log(`  Avg BPM: ${stats.avgBpm}`);
  console.log(`  Avg Energy: ${stats.avgEnergy.toFixed(2)}`);
  console.log(`  Avg Brightness: ${stats.avgBrightness.toFixed(2)}`);
  console.log(`  Avg Retention: ${stats.avgRetention.toFixed(1)}%`);

  console.log('');
  console.log('STEP 4: Cache statistics');
  console.log('─────────────────────────────────────────────────────────────');

  const cacheStats = demucsSeparationService.getCacheStats();
  console.log(`Cache entries: ${cacheStats.entryCount}`);
  if (cacheStats.oldestEntry) {
    console.log(`Oldest entry: ${(cacheStats.oldestEntry / 1000 / 60).toFixed(1)} minutes ago`);
  }
  if (cacheStats.newestEntry) {
    console.log(`Newest entry: ${(cacheStats.newestEntry / 1000 / 60).toFixed(1)} minutes ago`);
  }
  console.log(`Last cleanup: ${new Date(cacheStats.lastCleanup).toLocaleString()}`);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TEST COMPLETE! ✅');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('EXPECTED OUTPUT:');
  console.log('When you have enough videos with stem analysis, the system will be able to:');
  console.log('1. Separate any generated song into 4 stems');
  console.log("2. Analyze each stem's energy/spectral features per second");
  console.log('3. Correlate stem features with YouTube retention curves');
  console.log('4. Report insights like:');
  console.log('   "Videos with strong drum presence in seconds 3-7 have 25% better retention"');
  console.log('   "High vocal energy at hook (0-5s) correlates 0.78 with retention"');
  console.log('   "Bass energy variance shows -0.42 correlation (too dynamic hurts)"');
}

async function main() {
  const audioPath = process.argv[2];

  if (audioPath) {
    // Use provided audio path
    await testStemAnalysis(audioPath);
  } else {
    // Find sample audio
    const sampleAudio = await findSampleAudio();

    if (!sampleAudio) {
      console.error('❌ No sample audio found!');
      console.error('');
      console.error('Please provide an audio file:');
      console.error('  npx tsx test-stem-analysis.ts /path/to/audio.mp3');
      console.error('');
      console.error('Or place audio files in:');
      console.error('  - data/videos/renders/');
      console.error('  - attached_assets/music/');
      process.exit(1);
    }

    await testStemAnalysis(sampleAudio);
  }
}

main().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
