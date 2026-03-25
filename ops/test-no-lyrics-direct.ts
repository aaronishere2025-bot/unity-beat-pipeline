/**
 * Direct test of NO LYRICS approach (bypasses HTTP auth)
 */

import { generateInstrumentalStructure } from './server/services/suno-api.js';

console.log('🧪 Testing generateInstrumentalStructure() with NO LYRICS approach\n');
console.log('='.repeat(60));

// Test 1: 3-minute beat
console.log('\n📋 Test 1: 3-minute instrumental (180s)');
const result3min = generateInstrumentalStructure(180);
console.log(`   Result length: ${result3min.length} chars`);
console.log(`   Result content: "${result3min}"`);
console.log(`   ✅ Expected: Empty string ("")`);
console.log(`   ${result3min === '' ? '✅ PASS' : '❌ FAIL'}`);

// Test 2: 4-minute beat
console.log('\n📋 Test 2: 4-minute instrumental (240s)');
const result4min = generateInstrumentalStructure(240);
console.log(`   Result length: ${result4min.length} chars`);
console.log(`   Result content: "${result4min}"`);
console.log(`   ✅ Expected: Empty string ("")`);
console.log(`   ${result4min === '' ? '✅ PASS' : '❌ FAIL'}`);

// Test 3: 30-minute mix (1800s)
console.log('\n📋 Test 3: 30-minute mix (1800s)');
const result30min = generateInstrumentalStructure(1800);
console.log(`   Result length: ${result30min.length} chars`);
console.log(`   Result content: "${result30min}"`);
console.log(`   ✅ Expected: Empty string ("")`);
console.log(`   ${result30min === '' ? '✅ PASS' : '❌ FAIL'}`);

console.log('\n' + '='.repeat(60));
console.log('\n✅ All tests completed!');
console.log('\n📝 Summary:');
console.log('   - NO LYRICS approach is active');
console.log('   - generateInstrumentalStructure() returns empty string');
console.log('   - Duration control will use style hints only');
console.log('\n⚠️  Note: Suno might generate shorter tracks without character count.');
console.log('   Monitor actual durations and adjust if needed.');
