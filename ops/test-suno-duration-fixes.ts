/**
 * TEST SUNO DURATION FIXES
 *
 * This script tests all three duration control methods and reports accuracy.
 * Run this to validate that duration fixes are working in your environment.
 *
 * Usage:
 *   npx tsx test-suno-duration-fixes.ts
 *
 * Expected results:
 *   - Method A (Lyric-based): N/A for instrumentals
 *   - Method B (Style hints): ~40% accuracy
 *   - Method C (Structure-based): ~85% accuracy
 */

import { sunoApi, generateInstrumentalStructure } from './server/services/suno-api.js';

interface TestResult {
  method: string;
  target: number;
  actual: number;
  error: number;
  errorPct: number;
  success: boolean;
  structure?: string;
  duration?: string;
}

async function testDurationControl() {
  console.log('🧪 SUNO DURATION CONTROL TEST\n');
  console.log('This will generate 6 test songs (60 Suno credits = $0.60)\n');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');

  await new Promise((resolve) => setTimeout(resolve, 5000));

  const results: TestResult[] = [];
  const TOLERANCE = 20; // ±20% tolerance

  // Test targets
  const testCases = [
    { target: 60, style: 'lofi, 75 BPM, chill beats' },
    { target: 120, style: 'trap, 140 BPM, hard hitting' },
    { target: 180, style: 'ambient, 95 BPM, atmospheric' },
  ];

  console.log('='.repeat(80));
  console.log('METHOD A: LYRIC-BASED (N/A for instrumentals)');
  console.log('='.repeat(80));
  console.log('⏭️  Skipped - only works for songs with lyrics\n');

  console.log('='.repeat(80));
  console.log('METHOD B: STYLE HINTS (Expected: ~40% accuracy)');
  console.log('='.repeat(80));

  for (const test of testCases) {
    console.log(`\n📋 Test: ${test.target}s target`);
    console.log(`   Style: ${test.style}`);

    try {
      const { taskId } = await sunoApi.generateSong({
        lyrics: '(instrumental)', // Minimal lyrics
        style: test.style,
        title: `Duration Test B ${test.target}s`,
        instrumental: false,
        model: 'V5',
        targetDuration: test.target, // This adds duration hints to style
      });

      console.log(`   ⏳ Generating... (taskId: ${taskId})`);

      const tracks = await sunoApi.waitForCompletion(taskId, 300000);
      const actual = tracks[0].duration;
      const error = Math.abs(actual - test.target);
      const errorPct = (error / test.target) * 100;
      const success = errorPct <= TOLERANCE;

      results.push({
        method: 'Style Hints',
        target: test.target,
        actual: actual,
        error: error,
        errorPct: errorPct,
        success: success,
        duration: `${Math.floor(actual / 60)}:${String(Math.floor(actual % 60)).padStart(2, '0')}`,
      });

      console.log(`   ${success ? '✅' : '❌'} Result: ${actual}s (error: ${error}s / ${errorPct.toFixed(1)}%)`);
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
      results.push({
        method: 'Style Hints',
        target: test.target,
        actual: 0,
        error: test.target,
        errorPct: 100,
        success: false,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 2000)); // Rate limiting
  }

  console.log('\n' + '='.repeat(80));
  console.log('METHOD C: STRUCTURE-BASED (Expected: ~85% accuracy)');
  console.log('='.repeat(80));

  for (const test of testCases) {
    console.log(`\n📋 Test: ${test.target}s target`);
    console.log(`   Style: ${test.style}`);

    try {
      // Generate structure-based prompt
      const structure = generateInstrumentalStructure(test.target, test.style);
      const sections = structure.split('\n').filter((l) => l.startsWith('[')).length;

      console.log(`   📐 Structure: ${sections} sections`);
      console.log(`   Preview:\n${structure.split('\n').slice(0, 10).join('\n')}...`);

      const { taskId } = await sunoApi.generateSong({
        lyrics: structure, // Full structure with tags
        style: test.style,
        title: `Duration Test C ${test.target}s`,
        instrumental: false, // KEY: Always false!
        model: 'V5',
      });

      console.log(`   ⏳ Generating... (taskId: ${taskId})`);

      const tracks = await sunoApi.waitForCompletion(taskId, 300000);
      const actual = tracks[0].duration;
      const error = Math.abs(actual - test.target);
      const errorPct = (error / test.target) * 100;
      const success = errorPct <= TOLERANCE;

      results.push({
        method: 'Structure-Based',
        target: test.target,
        actual: actual,
        error: error,
        errorPct: errorPct,
        success: success,
        structure: `${sections} sections`,
        duration: `${Math.floor(actual / 60)}:${String(Math.floor(actual % 60)).padStart(2, '0')}`,
      });

      console.log(`   ${success ? '✅' : '❌'} Result: ${actual}s (error: ${error}s / ${errorPct.toFixed(1)}%)`);
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
      results.push({
        method: 'Structure-Based',
        target: test.target,
        actual: 0,
        error: test.target,
        errorPct: 100,
        success: false,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, 2000)); // Rate limiting
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(80));

  console.table(
    results.map((r) => ({
      Method: r.method,
      Target: `${r.target}s`,
      Actual: r.actual ? `${r.actual}s` : 'FAILED',
      Error: r.actual ? `${r.error}s (${r.errorPct.toFixed(1)}%)` : 'N/A',
      Status: r.success ? '✅ PASS' : '❌ FAIL',
      Structure: r.structure || 'N/A',
    })),
  );

  // Calculate success rates by method
  const styleHints = results.filter((r) => r.method === 'Style Hints');
  const structureBased = results.filter((r) => r.method === 'Structure-Based');

  const styleSuccessRate = styleHints.filter((r) => r.success).length / styleHints.length;
  const structureSuccessRate = structureBased.filter((r) => r.success).length / structureBased.length;

  console.log('\n📈 SUCCESS RATES:');
  console.log(
    `   Style Hints:      ${(styleSuccessRate * 100).toFixed(0)}% (${styleHints.filter((r) => r.success).length}/${styleHints.length})`,
  );
  console.log(
    `   Structure-Based:  ${(structureSuccessRate * 100).toFixed(0)}% (${structureBased.filter((r) => r.success).length}/${structureBased.length})`,
  );

  // Average errors
  const avgErrorStyle =
    styleHints.filter((r) => r.actual > 0).reduce((sum, r) => sum + r.errorPct, 0) /
    styleHints.filter((r) => r.actual > 0).length;
  const avgErrorStruct =
    structureBased.filter((r) => r.actual > 0).reduce((sum, r) => sum + r.errorPct, 0) /
    structureBased.filter((r) => r.actual > 0).length;

  console.log('\n📉 AVERAGE ERROR:');
  console.log(`   Style Hints:      ${avgErrorStyle.toFixed(1)}%`);
  console.log(`   Structure-Based:  ${avgErrorStruct.toFixed(1)}%`);

  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATIONS:');
  console.log('='.repeat(80));

  if (structureSuccessRate >= 0.7) {
    console.log('✅ Structure-based method is working well (≥70% success rate)');
    console.log('   → Use generateInstrumentalStructure() for all instrumental generation');
  } else {
    console.log('⚠️  Structure-based method below expected performance (<70%)');
    console.log('   → Check if Suno API has changed behavior');
    console.log('   → Review section count vs duration mapping');
    console.log('   → Consider adjusting CHARS_PER_SECOND constant');
  }

  if (styleSuccessRate >= 0.5) {
    console.log('✅ Style hints performing better than expected (≥50%)');
    console.log('   → Can use as fallback for simple cases');
  } else {
    console.log('⚠️  Style hints performing as expected (~40%)');
    console.log('   → Avoid using style hints alone for critical durations');
  }

  console.log('\n📝 NEXT STEPS:');
  console.log('   1. Review SUNO-DURATION-FIX-GUIDE.md for optimization strategies');
  console.log('   2. Implement duration validation in job-worker.ts');
  console.log('   3. Add retry logic with taskId recycling to save credits');
  console.log('   4. Monitor duration accuracy in production via database tracking');

  console.log('\n💰 TEST COST: 60 credits ($0.60)\n');

  process.exit(0);
}

testDurationControl().catch(console.error);
