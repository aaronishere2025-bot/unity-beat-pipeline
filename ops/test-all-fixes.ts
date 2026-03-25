import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function runTest() {
  console.log('🧪 COMPREHENSIVE TEST - All Fixes\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: 4-minute beat (should be close to 4:00 ±15s)
  console.log('Test 1: 4-Minute Trap Beat');
  console.log('   Expected: 3:45 - 4:15 duration');

  const [job1] = await db
    .insert(jobs)
    .values({
      mode: 'music',
      scriptName: 'Test 4-Min Trap Beat',
      scriptContent: 'Testing accurate duration for 4-minute request',
      prompts: ['Dark trap beat with heavy bass'],
      aspectRatio: '16:9',
      clipDuration: 5,
      autoUpload: false,
      status: 'queued',
      progress: 0,
    })
    .returning();

  console.log(`   ✅ Job created: ${job1.id}\n`);

  // Test 2: 10-minute lofi (parallel looping test)
  console.log('Test 2: 10-Minute Lofi with Parallel Looping');
  console.log('   Expected: ~10:00 duration, 2-4 min generation time');

  const [job2] = await db
    .insert(jobs)
    .values({
      mode: 'music',
      scriptName: 'Test 10-Min Lofi Mix',
      scriptContent: 'Testing parallel segment looping',
      prompts: ['Peaceful study environment'],
      aspectRatio: '16:9',
      clipDuration: 5,
      autoUpload: false,
      status: 'queued',
      progress: 0,
    })
    .returning();

  console.log(`   ✅ Job created: ${job2.id}\n`);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 WHAT TO VERIFY:\n');
  console.log('1. ⚡ Parallel Looping:');
  console.log('   - Watch logs for "🚀 Parallel looping" and "✅ Segment X/Y done"');
  console.log('   - 10-min video should complete in 2-4 min (vs 15-20 min old way)\n');

  console.log('2. 📹 Actual Duration:');
  console.log('   - Duration field should show ACTUAL video time');
  console.log('   - 4-min request → 3:45-4:15 actual');
  console.log('   - 10-min request → ~10:00 actual\n');

  console.log('3. 🎛️ FFmpeg Speed:');
  console.log('   - Using "ultrafast" preset for 10-20x faster encoding\n');

  console.log('4. 🔄 Manual Retry:');
  console.log('   - Failed jobs show blue refresh icon');
  console.log('   - Click to retry (no auto-retry)\n');

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 MONITOR:');
  console.log(`   tail -f /tmp/server-fixed-duration.log | grep -E "Parallel|Segment|duration|Progress"`);
  console.log(`   npx tsx check-stuck.ts`);
}

runTest();
