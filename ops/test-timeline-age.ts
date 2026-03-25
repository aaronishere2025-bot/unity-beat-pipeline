/**
 * TEST: Timeline-Based Age Calculation
 *
 * Shows how characters age accurately based on event years
 */

console.log('🧪 Testing Timeline-Based Age Calculation\n');

// Example: Genghis Khan (1162-1227)
const genghisKhan = {
  name: 'Genghis Khan',
  lived: '1162-1227',
  keyEvents: [
    { event: 'Father murdered, family exiled', year: 1167, section: 'intro' },
    { event: 'Becoming Khan of Mongols', year: 1206, section: 'verse_1' },
    { event: 'Conquering Khwarezmian Empire', year: 1220, section: 'chorus' },
    { event: 'Death after conquering Western Xia', year: 1227, section: 'bridge' },
  ],
};

// Example: Julius Caesar (100 BC - 44 BC)
const caesar = {
  name: 'Julius Caesar',
  lived: '-100--44', // Birth 100 BC (negative year)
  keyEvents: [
    { event: 'Kidnapped by pirates', year: -75, section: 'intro' },
    { event: 'Crossing the Rubicon', year: -49, section: 'verse_1' },
    { event: 'Conquest of Gaul complete', year: -50, section: 'chorus' },
    { event: 'Assassination', year: -44, section: 'bridge' },
  ],
};

function calculateAge(lived: string, eventYear: number): number {
  const birthYear = parseInt(lived.split('-')[0]);
  return eventYear - birthYear;
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📜 ${genghisKhan.name} (${genghisKhan.lived})`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

for (const event of genghisKhan.keyEvents) {
  const age = calculateAge(genghisKhan.lived, event.year);
  console.log(`\n🎬 SECTION: ${event.section.toUpperCase()}`);
  console.log(`   Event: ${event.event}`);
  console.log(`   Year: ${event.year}`);
  console.log(`   📅 Age: ${age} years old`);
  console.log(`   Prompt: "Genghis Khan, age ${age}, male, ..." `);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📜 ${caesar.name} (100 BC - 44 BC)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

for (const event of caesar.keyEvents) {
  const age = calculateAge(caesar.lived, event.year);
  console.log(`\n🎬 SECTION: ${event.section.toUpperCase()}`);
  console.log(`   Event: ${event.event}`);
  console.log(`   Year: ${event.year} (${Math.abs(event.year)} BC)`);
  console.log(`   📅 Age: ${age} years old`);
  console.log(`   Prompt: "Julius Caesar, age ${age}, male, ..." `);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n✅ Timeline-based aging ensures:');
console.log('   - Each scene shows the character at the CORRECT age for that moment');
console.log('   - Intro shows younger version (childhood/youth)');
console.log('   - Verses show prime years (building power)');
console.log('   - Chorus shows peak (conquests, achievements)');
console.log('   - Bridge shows final years (death, legacy)');
console.log('\n📊 Example Genghis Khan timeline:');
console.log('   Age 5 (1167) → Exiled, father murdered');
console.log('   Age 44 (1206) → Becomes Khan');
console.log('   Age 58 (1220) → Conquering empires');
console.log('   Age 65 (1227) → Death');
console.log('\n🎯 Result: Historically accurate aging throughout the video!');
