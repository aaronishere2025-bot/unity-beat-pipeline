import { sunoApi } from './server/services/suno-api.js';

console.log('🔍 Detailed Suno API Investigation\n');
console.log('Testing with exact job parameters...\n');

const params = {
  lyrics: '',
  style:
    'target 30:00 length | Warm morning coffee shop lofi | 80-85 BPM | jazzy chords, soft percussion, vinyl crackle, cozy atmosphere, sunrise energy',
  title: '30-Minute Morning Coffee Lofi Mix ☕ - Part 1',
  instrumental: true,
  model: 'V5' as const,
  targetDuration: 180,
};

console.log('Parameters:');
console.log('  Lyrics:', params.lyrics || '(empty - instrumental)');
console.log('  Style:', params.style.substring(0, 80) + '...');
console.log('  Title:', params.title);
console.log('  Instrumental:', params.instrumental);
console.log('  Model:', params.model);
console.log('  Target Duration:', params.targetDuration + 's');
console.log('');

try {
  console.log('Step 1: Submitting to Suno...');
  const { taskId } = await sunoApi.generateSong(params);
  console.log(`✅ Task ID: ${taskId}\n`);

  console.log('Step 2: Polling for completion (3 minute timeout)...');
  console.log('Waiting for taskStatus === "SUCCESS" with full tracks\n');

  const tracks = await sunoApi.waitForCompletion(taskId, 180000);

  if (tracks && tracks.length > 0) {
    console.log('\n✅ SUCCESS! Generated tracks:');
    tracks.forEach((track, i) => {
      console.log(`\nTrack ${i + 1}:`);
      console.log(`  ID: ${track.id}`);
      console.log(`  Duration: ${track.duration}s`);
      console.log(`  Audio URL: ${track.audioUrl?.substring(0, 60)}...`);
    });
  } else {
    console.log('\n❌ TIMEOUT - No tracks returned');
    console.log('Task stuck at preview stage (FIRST_SUCCESS)');
  }
} catch (error: any) {
  console.error('\n❌ ERROR:', error.message);
}
