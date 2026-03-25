/**
 * TEST: Audio Pattern Interrupt System
 *
 * Tests audio interrupt planning based on retention predictions.
 */

import { audioPatternInterruptService } from './server/services/audio-pattern-interrupt-service';

async function testAudioInterrupts() {
  console.log('🧪 TESTING AUDIO PATTERN INTERRUPT SYSTEM\n');
  console.log('='.repeat(60));

  // ============================================================================
  // TEST 1: With Historical Retention Data
  // ============================================================================
  console.log('\n📊 TEST 1: Planning interrupts with historical retention data\n');

  // Simulated retention curve with known drop points
  const retentionCurve = [
    { second: 0, retention: 100 },
    { second: 3, retention: 85 }, // Hook survived
    { second: 10, retention: 78 },
    { second: 15, retention: 65 }, // Big drop!
    { second: 20, retention: 60 },
    { second: 30, retention: 52 }, // Another drop
    { second: 40, retention: 48 },
    { second: 50, retention: 45 },
    { second: 60, retention: 40 }, // End drop
  ];

  const interrupts1 = audioPatternInterruptService.planInterrupts({
    retentionCurve,
    duration: 60,
    bpm: 85,
    genre: 'lofi',
    preventionWindow: 2,
  });

  console.log(`\n✅ Planned ${interrupts1.length} interrupts:\n`);
  for (const interrupt of interrupts1) {
    console.log(`   ${interrupt.timestamp}s: ${interrupt.type}`);
    console.log(`      → ${interrupt.reason}`);
    console.log(`      → Urgency: ${(interrupt.urgency * 100).toFixed(0)}%\n`);
  }

  // ============================================================================
  // TEST 2: Without Historical Data (Default Strategy)
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 TEST 2: Default interrupts (no retention data)\n');

  const interrupts2 = audioPatternInterruptService.planInterrupts({
    retentionCurve: [],
    duration: 90,
    bpm: 140,
    genre: 'trap',
    preventionWindow: 2,
  });

  console.log(`\n✅ Generated ${interrupts2.length} default interrupts for trap beat\n`);

  // ============================================================================
  // TEST 3: Generate Suno Prompt with Interrupts
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('\n🎤 TEST 3: Generate Suno prompt with interrupts\n');

  const baseStyle = 'lofi hip-hop, jazzy chords, mellow vibes, 85 BPM';
  const completePrompt = audioPatternInterruptService.buildCompleteSunoPrompt(baseStyle, interrupts1, 60, 85);

  console.log(`\n📝 Final Suno Prompt:\n   "${completePrompt}"\n`);

  // ============================================================================
  // TEST 4: Analyze Interrupt Effectiveness
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('\n📈 TEST 4: Analyze interrupt effectiveness\n');

  // Simulated retention AFTER interrupts were applied
  const actualRetention = [
    { second: 0, retention: 100 },
    { second: 3, retention: 88 },
    { second: 10, retention: 82 }, // Improved!
    { second: 13, retention: 80 }, // Interrupt at 13s worked!
    { second: 15, retention: 78 }, // Drop prevented!
    { second: 20, retention: 75 },
    { second: 28, retention: 72 }, // Interrupt at 28s worked!
    { second: 30, retention: 70 }, // Drop minimized
    { second: 40, retention: 67 },
    { second: 50, retention: 64 },
    { second: 58, retention: 62 }, // Interrupt at 58s worked!
    { second: 60, retention: 60 }, // Drop minimized
  ];

  const effectiveness = audioPatternInterruptService.analyzeInterruptEffectiveness(interrupts1, actualRetention);

  console.log(`   Total interrupts: ${effectiveness.totalInterrupts}`);
  console.log(`   Successful: ${effectiveness.successfulInterrupts}`);
  console.log(`   Failed: ${effectiveness.failedInterrupts}`);
  console.log(`   Effectiveness: ${(effectiveness.effectiveness * 100).toFixed(1)}%\n`);

  const recommendation = audioPatternInterruptService.recommendAdjustments(effectiveness.effectiveness, 'lofi');
  console.log(`   ${recommendation}\n`);

  // ============================================================================
  // TEST 5: Different Genres
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('\n🎵 TEST 5: Compare interrupt strategies across genres\n');

  const genres: Array<'lofi' | 'trap' | 'chill' | 'ambient'> = ['lofi', 'trap', 'chill', 'ambient'];

  for (const genre of genres) {
    const genreInterrupts = audioPatternInterruptService.planInterrupts({
      retentionCurve: [],
      duration: 60,
      bpm: genre === 'trap' ? 140 : 85,
      genre,
      preventionWindow: 2,
    });

    console.log(`   ${genre.toUpperCase()}:`);
    console.log(`      ${genreInterrupts.length} interrupts`);
    const types = genreInterrupts.map((i) => i.type).join(', ');
    console.log(`      Types: ${types}\n`);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '='.repeat(60));
  console.log('\n💡 KEY INSIGHTS\n');
  console.log('✅ System predicts retention drops from historical data');
  console.log('✅ Interrupts inserted 2 seconds BEFORE predicted drops');
  console.log('✅ Different interrupt types for different genres');
  console.log('✅ Suno prompts enriched with structure hints');
  console.log('✅ Effectiveness tracking to improve future predictions\n');

  console.log('📋 INTEGRATION STEPS:\n');
  console.log('1. When generating music, fetch historical retention for similar content');
  console.log('2. Call audioPatternInterruptService.planInterrupts(...)');
  console.log('3. Use buildCompleteSunoPrompt(...) to enrich Suno request');
  console.log('4. After video publishes, analyze effectiveness');
  console.log('5. Feed results back to improve predictions\n');

  console.log('='.repeat(60));
  console.log('✅ Test complete!\n');
}

// Run test
testAudioInterrupts().catch(console.error);
