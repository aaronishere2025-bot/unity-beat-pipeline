/**
 * Create a test video job to demonstrate FFmpeg optimizations
 */

import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function createTestJob() {
  console.log('🎬 Creating test video job (lofi beat with GPU acceleration)...\n');

  const jobId = crypto.randomUUID();
  const timestamp = Date.now();

  const job = await db
    .insert(jobs)
    .values({
      id: jobId,
      scriptName: `Optimization Test ${timestamp}`,
      scriptContent:
        'chill lofi beats, smooth jazz, 85 BPM, warm vinyl sound, mellow piano, soft bass, ambient atmosphere, study vibes, relaxing instrumental',
      mode: 'music',
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  console.log('✅ Test job created!');
  console.log(`   ID: ${jobId}`);
  console.log(`   Mode: music (lofi beat)`);
  console.log(`   Status: queued\n`);

  console.log('📊 Expected Performance:');
  console.log('   • Music generation: ~30-60 seconds (Suno API)');
  console.log('   • Audio analysis: ~5 seconds');
  console.log('   • Video encoding: ~1 minute (GPU accelerated) ⚡');
  console.log('   • Total: ~2 minutes\n');

  console.log('🔍 Monitor progress:');
  console.log(`   curl -s http://localhost:8080/api/jobs/${jobId} | jq '.status, .progress'`);
  console.log('');
  console.log('🎮 Monitor GPU:');
  console.log('   watch -n 1 nvidia-smi');
  console.log('');
  console.log('📺 View in browser:');
  console.log('   http://localhost:8080/jobs');
  console.log('');

  return jobId;
}

createTestJob().catch(console.error);
