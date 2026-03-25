/**
 * Test full pipeline with GPU encoding:
 * 1. One lofi mix (30 minutes)
 * 2. Five trap beats (4 minutes each)
 */
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function generateTestJobs() {
  console.log('🎬 Full Pipeline Test with GPU Encoding\n');
  console.log('This will generate:');
  console.log('  1. One lofi mix (30 minutes)');
  console.log('  2. Five trap beats (4 minutes each)');
  console.log('');
  console.log('Watch GPU usage: watch -n 1 nvidia-smi');
  console.log('Monitor jobs: curl http://localhost:8080/api/jobs | jq');
  console.log('');

  const createdJobs = [];

  try {
    // 1. Create lofi mix (30 minutes)
    console.log('📝 Creating lofi mix job...');
    const lofiJob = await db
      .insert(jobs)
      .values({
        mode: 'music',
        scriptName: `GPU Test Lofi Mix ${Date.now()}`,
        aspectRatio: '16:9',
        clipDuration: 1800, // 30 minutes
        status: 'queued',
        progress: 0,
        prompts: ['Lofi hip hop beats to study/relax to'],
        scriptContent: JSON.stringify({
          style: 'lofi',
          mood: 'chill',
          duration: 1800,
          useLoopVisual: true,
        }),
      })
      .returning();

    createdJobs.push(lofiJob[0]);
    console.log(`   ✅ Created: ${lofiJob[0].id}`);
    console.log(`   📦 Mode: music, Duration: 30 min`);
    console.log('');

    // 2. Create 5 trap beats (4 minutes each)
    console.log('📝 Creating 5 trap beat jobs...');

    for (let i = 1; i <= 5; i++) {
      const trapJob = await db
        .insert(jobs)
        .values({
          mode: 'music',
          scriptName: `GPU Test Trap Beat ${Date.now()}_${i}`,
          aspectRatio: '16:9',
          clipDuration: 240, // 4 minutes
          status: 'queued',
          progress: 0,
          prompts: ['Hard trap beat with heavy 808s'],
          scriptContent: JSON.stringify({
            style: 'trap',
            mood: 'aggressive',
            duration: 240,
          }),
        })
        .returning();

      createdJobs.push(trapJob[0]);
      console.log(`   ✅ Beat ${i}: ${trapJob[0].id}`);

      // Small delay between creates
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log('');
    console.log('✅ All jobs created successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Total jobs: ${createdJobs.length}`);
    console.log(`   Lofi mixes: 1 (30 min)`);
    console.log(`   Trap beats: 5 (4 min each)`);
    console.log('');
    console.log('🎯 Expected Results:');
    console.log('   - FFmpeg will use GPU encoding (h264_nvenc)');
    console.log('   - 30-min lofi: ~3-5 min total (vs 15-20 min with CPU)');
    console.log('   - 4-min trap: ~2-3 min each (vs 8-12 min with CPU)');
    console.log('   - Total time: ~15-20 min (vs 60-80 min with CPU)');
    console.log('');
    console.log('📍 Job IDs:');
    createdJobs.forEach((job, i) => {
      if (i === 0) {
        console.log(`   Lofi: ${job.id}`);
      } else {
        console.log(`   Beat ${i}: ${job.id}`);
      }
    });
    console.log('');
    console.log('🔍 Monitor progress:');
    console.log(`   curl http://localhost:8080/api/jobs/${createdJobs[0].id}`);
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

generateTestJobs().catch(console.error);
