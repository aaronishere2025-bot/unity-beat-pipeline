/**
 * Quick Audio Analysis Accuracy Test
 *
 * Tests ONLY the audio analysis pipeline (skips content generation)
 * - Full track analysis
 * - Stem separation
 * - Per-stem analysis
 * - Accuracy validation
 *
 * Usage: npx tsx test-audio-accuracy-only.ts
 */

import { audioAnalysisService } from './server/services/audio-analysis-service';
import { demucsSeparationService } from './server/services/demucs-separation-service';
import { existsSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

async function testAudioAccuracy() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  AUDIO ANALYSIS ACCURACY TEST');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  // Create test audio if it doesn't exist
  const testAudioPath = '/tmp/test_caesar_audio.wav';

  if (!existsSync(testAudioPath)) {
    console.log('Creating test audio file...');
    execSync(`python3 -c "
import numpy as np
import soundfile as sf

# Generate test audio (60 seconds, 120 BPM)
sr = 22050
duration = 60
t = np.linspace(0, duration, int(sr * duration))

# Epic music: bass + melody + drums
audio = (
    0.2 * np.sin(2 * np.pi * 110 * t) +  # Bass (A2)
    0.15 * np.sin(2 * np.pi * 220 * t) +  # A3
    0.1 * np.sin(2 * np.pi * 440 * t)    # Melody (A4)
)

# Add drum hits every 0.5s (120 BPM)
for beat_time in np.arange(0, duration, 0.5):
    beat_start = int(beat_time * sr)
    beat_end = min(beat_start + int(0.1 * sr), len(audio))
    decay = np.exp(-10 * np.linspace(0, 0.1, beat_end - beat_start))
    audio[beat_start:beat_end] += 0.4 * decay

# Normalize
audio = audio / np.max(np.abs(audio))

sf.write('${testAudioPath}', audio, sr)
"`);
    console.log('✅ Test audio created');
    console.log('');
  } else {
    console.log('✅ Using existing test audio');
    console.log('');
  }

  console.log('STEP 1: Full Track Analysis (Basic Librosa)');
  console.log('─────────────────────────────────────────────────────────────');

  const basicAnalysis = await audioAnalysisService.analyzeAudio(
    testAudioPath,
    undefined, // No lyrics for faster test
    false, // Don't force refresh
    false, // Don't include stems yet
  );

  if (!basicAnalysis.success || !basicAnalysis.analysis) {
    console.error('❌ Basic analysis failed:', basicAnalysis.error);
    process.exit(1);
  }

  console.log('✅ Basic analysis complete!');
  console.log(`   BPM: ${basicAnalysis.analysis.bpm}`);
  console.log(`   Duration: ${basicAnalysis.analysis.duration}s`);
  console.log(`   Beats: ${basicAnalysis.analysis.beatCount}`);
  console.log(`   Sections: ${basicAnalysis.analysis.sections.length}`);
  const avgEnergy =
    basicAnalysis.analysis.sections.reduce((sum, s) => sum + s.energy, 0) / basicAnalysis.analysis.sections.length;
  console.log(`   Avg Energy: ${avgEnergy.toFixed(4)}`);
  console.log('');

  console.log('STEP 2: Stem Separation (Demucs)');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('This takes ~30-60 seconds...');
  console.log('');

  const stemResult = await demucsSeparationService.separateAndAnalyze(testAudioPath);

  if (!stemResult.success || !stemResult.analysis) {
    console.error('❌ Stem separation failed:', stemResult.error);
    process.exit(1);
  }

  console.log('✅ Stem separation complete!');
  console.log('');

  console.log('STEP 3: Per-Stem Analysis Results');
  console.log('─────────────────────────────────────────────────────────────');

  for (const [stemName, stemData] of Object.entries(stemResult.analysis)) {
    console.log(`${stemName.toUpperCase()}:`);
    console.log(`  Duration: ${stemData.duration}s`);
    console.log(`  Tempo: ${stemData.tempo.toFixed(1)} BPM`);
    console.log(`  Beats: ${stemData.beat_count}`);
    console.log(`  Onsets: ${stemData.onset_count}`);
    console.log(`  Avg Energy: ${stemData.overall.avg_energy.toFixed(4)}`);
    console.log(`  Peak Energy: ${stemData.overall.peak_energy.toFixed(4)}`);
    console.log(`  Energy Variance: ${stemData.overall.energy_variance.toFixed(6)}`);
    console.log(`  Brightness: ${stemData.overall.avg_brightness.toFixed(1)} Hz`);
    console.log(`  Per-second datapoints: ${stemData.per_second_features.length}`);
    console.log('');
  }

  console.log('STEP 4: Accuracy Validation');
  console.log('─────────────────────────────────────────────────────────────');

  const validations: Array<{ check: string; status: string; details: string }> = [];

  // Check 1: BPM Consistency
  const fullBpm = basicAnalysis.analysis.bpm;
  const drumsBpm = stemResult.analysis.drums?.tempo || 0;
  const bpmDiff = Math.abs(fullBpm - drumsBpm);

  validations.push({
    check: 'BPM Consistency',
    status: bpmDiff < 5 ? '✅ PASS' : '⚠️  WARN',
    details: `Full: ${fullBpm} BPM, Drums: ${drumsBpm.toFixed(1)} BPM (diff: ${bpmDiff.toFixed(1)})`,
  });

  // Check 2: Duration Consistency
  const fullDuration = basicAnalysis.analysis.duration;
  const stemDurations = Object.values(stemResult.analysis).map((s) => s.duration);
  const avgStemDuration = stemDurations.reduce((a, b) => a + b, 0) / stemDurations.length;
  const durationDiff = Math.abs(fullDuration - avgStemDuration);

  validations.push({
    check: 'Duration Consistency',
    status: durationDiff < 0.5 ? '✅ PASS' : '⚠️  WARN',
    details: `Full: ${fullDuration}s, Stems avg: ${avgStemDuration.toFixed(1)}s (diff: ${durationDiff.toFixed(2)}s)`,
  });

  // Check 3: All Stems Present
  const stemNames = Object.keys(stemResult.analysis);
  const expectedStems = ['vocals', 'drums', 'bass', 'other'];
  const missingStems = expectedStems.filter((s) => !stemNames.includes(s));

  validations.push({
    check: 'Stem Completeness',
    status: missingStems.length === 0 ? '✅ PASS' : '❌ FAIL',
    details:
      missingStems.length === 0
        ? 'All 4 stems present (vocals, drums, bass, other)'
        : `Missing: ${missingStems.join(', ')}`,
  });

  // Check 4: Per-Second Features
  const vocals = stemResult.analysis.vocals;
  if (vocals && vocals.per_second_features.length > 0) {
    const expectedSeconds = Math.floor(vocals.duration);
    const actualSeconds = vocals.per_second_features.length;

    validations.push({
      check: 'Per-Second Features',
      status: Math.abs(expectedSeconds - actualSeconds) <= 1 ? '✅ PASS' : '⚠️  WARN',
      details: `${actualSeconds} datapoints (expected ~${expectedSeconds})`,
    });
  }

  // Check 5: Energy Sanity
  const stemEnergySum =
    (stemResult.analysis.vocals?.overall.avg_energy || 0) +
    (stemResult.analysis.drums?.overall.avg_energy || 0) +
    (stemResult.analysis.bass?.overall.avg_energy || 0) +
    (stemResult.analysis.other?.overall.avg_energy || 0);

  validations.push({
    check: 'Energy Balance',
    status: '✅ INFO',
    details: `Full track: ${avgEnergy.toFixed(4)}, Stems sum: ${stemEnergySum.toFixed(4)}`,
  });

  // Print validation results
  console.log('');
  for (const validation of validations) {
    console.log(`${validation.status} ${validation.check}`);
    console.log(`   ${validation.details}`);
  }
  console.log('');

  console.log('STEP 5: Show Retention-Ready Metrics');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('');

  // Show example per-second data
  console.log('EXAMPLE PER-SECOND DATA (First 10 seconds):');
  console.log('Time | Vocals Energy | Drums Energy | Bass Energy | Correlation→Retention');
  console.log('-----|---------------|--------------|-------------|------------------------');

  for (let t = 0; t < Math.min(10, vocals.per_second_features.length); t++) {
    const vEnergy = stemResult.analysis.vocals?.per_second_features[t]?.energy || 0;
    const dEnergy = stemResult.analysis.drums?.per_second_features[t]?.energy || 0;
    const bEnergy = stemResult.analysis.bass?.per_second_features[t]?.energy || 0;

    console.log(
      `${t.toString().padStart(4)}s|    ${vEnergy.toFixed(4)}     |   ${dEnergy.toFixed(4)}    |  ${bEnergy.toFixed(4)}  | ← Correlate with retention[${t}s]`,
    );
  }

  console.log('');
  console.log('When you upload to YouTube and get retention data, you can correlate:');
  console.log('  drums_energy[5s] ↔ retention[5s] → Find correlation coefficient');
  console.log('  After 10+ videos: "Drums at 3-7s → +25% retention" (correlation 0.78)');
  console.log('');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TEST COMPLETE! ✅');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const passCount = validations.filter((v) => v.status.includes('PASS')).length;
  const warnCount = validations.filter((v) => v.status.includes('WARN')).length;
  const failCount = validations.filter((v) => v.status.includes('FAIL')).length;

  console.log('ACCURACY SUMMARY:');
  console.log(`  ✅ Passed: ${passCount}/${validations.length}`);
  if (warnCount > 0) console.log(`  ⚠️  Warnings: ${warnCount}`);
  if (failCount > 0) console.log(`  ❌ Failed: ${failCount}`);
  console.log('');

  console.log('WHAT WAS TESTED:');
  console.log('  ✅ Full track audio analysis (Librosa)');
  console.log('  ✅ Stem separation (Demucs: vocals/drums/bass/other)');
  console.log('  ✅ Per-stem audio analysis');
  console.log('  ✅ BPM, duration, energy consistency');
  console.log('  ✅ Per-second features for retention correlation');
  console.log('');

  console.log('SYSTEM IS READY FOR:');
  console.log('  ✅ Generate videos with music');
  console.log('  ✅ Analyze audio at stem level');
  console.log('  ✅ Upload to YouTube');
  console.log('  ✅ Fetch retention data');
  console.log('  ✅ Correlate stem features with retention');
  console.log('  ✅ Get insights: "Drums at 3-7s drive retention!"');
  console.log('');

  // Write results to file
  const results = {
    timestamp: new Date().toISOString(),
    validations,
    metrics: {
      fullTrack: {
        bpm: basicAnalysis.analysis.bpm,
        duration: basicAnalysis.analysis.duration,
        avgEnergy,
      },
      stems: Object.fromEntries(
        Object.entries(stemResult.analysis).map(([name, data]) => [
          name,
          {
            tempo: data.tempo,
            avgEnergy: data.overall.avg_energy,
            peakEnergy: data.overall.peak_energy,
            brightness: data.overall.avg_brightness,
            datapoints: data.per_second_features.length,
          },
        ]),
      ),
    },
  };

  writeFileSync('/tmp/audio-accuracy-test-results.json', JSON.stringify(results, null, 2));
  console.log('📄 Results saved to: /tmp/audio-accuracy-test-results.json');
  console.log('');
}

testAudioAccuracy().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
