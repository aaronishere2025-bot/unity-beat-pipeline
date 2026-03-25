import { sunoApi } from './server/services/suno-api.js';

console.log('🎵 Testing Suno API Connection\n');
console.log('═'.repeat(60));

try {
  console.log('📝 Test 1: Simple lofi beat generation');
  console.log('   Prompt: "chill lofi beat, 85 BPM, relaxing"');
  console.log('   Duration: 180 seconds (3 minutes)\n');

  const { taskId } = await sunoApi.generateSong({
    lyrics: '',
    style: 'chill lofi beat, 85 BPM, jazzy chords, relaxing, vinyl crackle',
    title: 'Test Lofi Beat',
    instrumental: true,
    model: 'V5',
  });

  console.log(`   ⏳ Task created: ${taskId}`);
  console.log('   Waiting for Suno to generate music...\n');

  const tracks = await sunoApi.waitForCompletion(taskId, 180000); // 3 minute timeout

  console.log('✅ SUCCESS!');
  console.log(`   Generated ${tracks.length} tracks:\n`);

  for (const track of tracks) {
    console.log(`   📀 Track ${track.id}`);
    console.log(`      Duration: ${track.duration}s`);
    console.log(`      URL: ${track.audioUrl?.substring(0, 60)}...`);
  }

  const totalDuration = tracks.reduce((sum, t) => sum + t.duration, 0);
  console.log(`\n💾 Total audio duration: ${totalDuration.toFixed(1)}s`);
  console.log(`💰 Cost: $0.10 (per Suno generation)`);
} catch (error: any) {
  console.error('\n❌ FAILED!');
  console.error(`   Error: ${error.message}`);
  console.error(`\n   Full error:`, error);
}

console.log('\n' + '═'.repeat(60));
