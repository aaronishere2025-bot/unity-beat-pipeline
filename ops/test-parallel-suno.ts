#!/usr/bin/env tsx

/**
 * Quick test script to verify parallel Suno generation
 * Generates 3 short songs simultaneously to test the optimization
 */

import { sunoApi } from './server/services/suno-api.js';
import { initializeSecretsWithFallback } from './server/secret-manager-loader.js';

async function testParallelSuno() {
  console.log('🧪 Testing Parallel Suno Generation\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Load secrets
  await initializeSecretsWithFallback();

  const numSongs = 3;
  const style = 'lofi, chill, study beats';

  console.log(`📝 Test config:`);
  console.log(`   - Songs: ${numSongs}`);
  console.log(`   - Style: ${style}`);
  console.log(`   - Expected time: 2-3 minutes (if parallel)`);
  console.log(`   - Expected time: 6-9 minutes (if sequential)\n`);

  const startTime = Date.now();

  console.log('🚀 Submitting all songs in parallel...\n');

  // Parallel submission
  const submissionPromises = [];
  for (let i = 0; i < numSongs; i++) {
    submissionPromises.push(
      sunoApi
        .generateSong({
          lyrics: '',
          style,
          title: `Parallel Test Song ${i + 1}`,
          instrumental: true,
          model: 'V5',
          targetDuration: 120, // 2 minutes
        })
        .then((result) => {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`   ✅ Song ${i + 1} submitted: ${result.taskId} (${elapsed}s)`);
          return result;
        }),
    );
  }

  // Wait for all submissions
  const results = await Promise.all(submissionPromises);
  const submissionTime = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n⏱️  Total submission time: ${submissionTime}s`);
  console.log(`\n📊 Results:`);

  if (parseFloat(submissionTime) < 10) {
    console.log(`   ✅ PARALLEL EXECUTION CONFIRMED!`);
    console.log(`   All ${numSongs} songs submitted in ${submissionTime}s`);
  } else {
    console.log(`   ❌ SEQUENTIAL EXECUTION DETECTED!`);
    console.log(`   Took ${submissionTime}s (should be <10s for parallel)`);
  }

  console.log(`\n📋 Task IDs:`);
  results.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.taskId}`);
  });

  console.log(`\n✅ Test complete!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

testParallelSuno().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
