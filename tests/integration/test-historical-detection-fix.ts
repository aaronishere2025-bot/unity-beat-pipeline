/**
 * Test Historical Content Detection Fix
 *
 * Verifies that topics containing "warfare", "war", "WWII", etc.
 * are correctly detected as historical content.
 */

import { isHistoricalContent } from '../server/services/unity-content-generator.js';

console.log('🧪 Testing Historical Content Detection\n');
console.log('='.repeat(80));

const testCases = [
  {
    topic:
      'Tsutomu Yamaguchi: An extraordinary tale of survival against all odds, highlighting human resilience and the unforeseen impacts of technological warfare.',
    expected: true,
    reason: 'Contains "warfare"',
  },
  {
    topic: 'The Radium Girls: Factory workers unknowingly poisoned by radium paint',
    expected: true,
    reason: 'Contains "historical" context (early 20th century labor)',
  },
  {
    topic: 'Hiroshima and Nagasaki atomic bombings in 1945',
    expected: true,
    reason: 'Contains "Hiroshima", "Nagasaki", and specific year',
  },
  {
    topic: 'WWII pilot Nadezhda Popova',
    expected: true,
    reason: 'Contains "WWII"',
  },
  {
    topic: 'Julius Caesar crossing the Rubicon',
    expected: true,
    reason: 'Contains "Caesar" (historical figure)',
  },
  {
    topic: 'World War II veterans and their stories',
    expected: true,
    reason: 'Contains "World War" and "veterans"',
  },
  {
    topic: 'The Battle of Stalingrad',
    expected: true,
    reason: 'Contains "Battle of"',
  },
  {
    topic: 'Nuclear warfare in the Cold War era',
    expected: true,
    reason: 'Contains "warfare" and "nuclear"',
  },
  {
    topic: 'Pizza vs Taco: The Ultimate Food Battle',
    expected: false,
    reason: 'Food battle - not historical',
  },
  {
    topic: 'iPhone vs Android: Which is better?',
    expected: false,
    reason: 'Technology comparison - not historical',
  },
];

let passed = 0;
let failed = 0;

console.log('\nRunning tests...\n');

for (const testCase of testCases) {
  const result = isHistoricalContent(testCase.topic);
  const status = result === testCase.expected ? '✅ PASS' : '❌ FAIL';

  if (result === testCase.expected) {
    passed++;
  } else {
    failed++;
  }

  console.log(`${status}: "${testCase.topic.substring(0, 60)}..."`);
  console.log(`   Expected: ${testCase.expected}, Got: ${result}`);
  console.log(`   Reason: ${testCase.reason}\n`);
}

console.log('='.repeat(80));
console.log(`\nResults: ${passed}/${testCases.length} tests passed`);

if (failed > 0) {
  console.log(`❌ ${failed} test(s) failed\n`);
  process.exit(1);
} else {
  console.log('✅ All tests passed!\n');
  process.exit(0);
}
