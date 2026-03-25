// Test the new 4-minute song calculation for 30-minute lofi mix

const targetDuration = 1800; // 30 minutes
const SUNO_MAX_DURATION = 240; // 4 minutes per song

const needsMultipleSongs = targetDuration > SUNO_MAX_DURATION;
const songCount = needsMultipleSongs ? Math.ceil(targetDuration / SUNO_MAX_DURATION) : 1;

console.log('=== 30-MINUTE LOFI MIX CALCULATION ===\n');
console.log('Target duration:', targetDuration, 'seconds =', Math.floor(targetDuration / 60), 'minutes');
console.log('Suno max per song:', SUNO_MAX_DURATION, 'seconds =', Math.floor(SUNO_MAX_DURATION / 60), 'minutes');
console.log('\n📊 Generation Plan:');
console.log('  Needs multiple songs:', needsMultipleSongs);
console.log('  Song count:', songCount, 'songs');
console.log('  Each song:', SUNO_MAX_DURATION, 'seconds (4 minutes)');
console.log(
  '  Total duration:',
  songCount * SUNO_MAX_DURATION,
  'seconds =',
  Math.floor((songCount * SUNO_MAX_DURATION) / 60),
  'minutes',
);

console.log('\n💰 Cost Estimate:');
const sunoCost = songCount * 0.05; // $0.05 per song
const klingCost = 1 * 0.275; // 1 clip (single clip mode)
const totalCost = sunoCost + klingCost;
console.log('  Suno:', songCount, 'songs × $0.05 = $' + sunoCost.toFixed(2));
console.log('  Kling: 1 clip × $0.275 = $' + klingCost.toFixed(2));
console.log('  Total: $' + totalCost.toFixed(2));

console.log('\n✅ Old system (2-min songs):');
const oldSongCount = Math.ceil(targetDuration / 120);
const oldCost = oldSongCount * 0.05 + 0.275;
console.log('  Songs needed:', oldSongCount, '(15 songs × 2 min)');
console.log('  Cost: $' + oldCost.toFixed(2));

console.log('\n📉 Savings:');
console.log('  Fewer songs:', oldSongCount, '→', songCount, '(' + (oldSongCount - songCount), 'fewer)');
console.log(
  '  Cost reduction:',
  '$' + oldCost.toFixed(2),
  '→',
  '$' + totalCost.toFixed(2),
  '(save $' + (oldCost - totalCost).toFixed(2) + ')',
);
