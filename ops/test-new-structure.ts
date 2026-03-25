import { generateInstrumentalStructure } from './server/services/suno-api.js';

console.log('=== Testing NEW Instrumental Structure Generation ===\n');

console.log('1. Testing 120s (2 min):');
const s120 = generateInstrumentalStructure(120);
console.log(`   Characters: ${s120.length} (target: ${120 * 14} = ${Math.floor(s120.length / 14)}s expected)\n`);

console.log('2. Testing 180s (3 min):');
const s180 = generateInstrumentalStructure(180);
console.log(`   Characters: ${s180.length} (target: ${180 * 14} = ${Math.floor(s180.length / 14)}s expected)\n`);

console.log('3. Testing 300s (5 min):');
const s300 = generateInstrumentalStructure(300);
console.log(`   Characters: ${s300.length} (target: ${300 * 14} = ${Math.floor(s300.length / 14)}s expected)`);
console.log('\n--- Preview (first 500 chars) ---');
console.log(s300.substring(0, 500));
console.log('...\n');
console.log('--- Last 300 chars ---');
console.log(s300.substring(s300.length - 300));
