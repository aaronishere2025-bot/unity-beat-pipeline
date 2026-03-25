/**
 * Live validation test for Suno duration fixes
 * Cost: $0.10 (1 Suno generation)
 * Run from: /home/aaronishere2025
 */

async function main() {
  // Load secrets
  const { initializeSecretsWithFallback } = await import('/home/aaronishere2025/server/secret-manager-loader.js');
  await initializeSecretsWithFallback();

  const { sunoApi, generateInstrumentalStructure } = await import('/home/aaronishere2025/server/services/suno-api');

  if (!sunoApi.isConfigured()) {
    console.error('❌ Suno API not configured');
    process.exit(1);
  }

  const TARGET = 120;
  const STYLE = 'lofi, 85 BPM, chill beats, nostalgic';

  console.log('=== LIVE DURATION FIX VALIDATION ===\n');
  console.log(`Target: ${TARGET}s (${Math.floor(TARGET / 60)}:${String(TARGET % 60).padStart(2, '0')})`);
  console.log(`Style: ${STYLE}\n`);

  // Step 1: Generate structure
  const structure = generateInstrumentalStructure(TARGET, STYLE);
  const sections = structure.split('\n').filter((s: string) => s.startsWith('[')).length;
  console.log(`Structure: ${sections} sections\n`);

  // Step 2: Submit to Suno
  console.log('Submitting to Suno API...');
  const startTime = Date.now();

  const { taskId } = await sunoApi.generateSong({
    lyrics: structure,
    style: STYLE,
    title: 'Duration Fix Validation Test',
    instrumental: false,
    model: 'V5',
    targetDuration: TARGET,
  });

  console.log(`Task: ${taskId}\n`);

  // Step 3: Wait for completion
  console.log('Waiting for generation...\n');
  const tracks = await sunoApi.waitForCompletion(taskId, 300000);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Step 4: Analyze results
  console.log('\n=== RESULTS ===\n');
  console.log(`Generation time: ${elapsed}s`);
  console.log(`Tracks returned: ${tracks.length}\n`);

  let bestTrack = tracks[0];
  let bestError = Math.abs((bestTrack.duration || 0) - TARGET);

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const error = Math.abs((t.duration || 0) - TARGET);
    const errorPct = TARGET > 0 ? ((error / TARGET) * 100).toFixed(1) : '?';
    const pass = error <= TARGET * 0.25;
    console.log(
      `Track ${i}: ${t.duration}s (error: ${error.toFixed(1)}s / ${errorPct}%) ${pass ? '✅ PASS' : '❌ FAIL'}`,
    );

    if (error < bestError) {
      bestError = error;
      bestTrack = t;
    }
  }

  const bestErrorPct = TARGET > 0 ? ((bestError / TARGET) * 100).toFixed(1) : '?';
  const bestPass = bestError <= TARGET * 0.25;

  console.log(`\nBest track: ${bestTrack.duration}s (error: ${bestError.toFixed(1)}s / ${bestErrorPct}%)`);
  console.log(
    `Duration-aware selection: ${tracks.length > 1 && bestTrack !== tracks[0] ? '🎯 SELECTED BETTER TRACK' : 'Used track 0'}`,
  );
  console.log(
    `\nOverall: ${bestPass ? '✅ PASS' : '❌ FAIL'} (±25% tolerance = ${TARGET * 0.75}s - ${TARGET * 1.25}s)`,
  );
  console.log(`Cost: $0.10`);

  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
