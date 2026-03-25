import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function createTestJob() {
  console.log('🧪 Creating test job with parallel looping...\n');

  const jobData = {
    mode: 'music' as const,
    scriptName: 'Parallel Loop Test - 10 Min Lofi',
    scriptContent: 'Testing parallel segment looping for 10-minute video',
    prompts: ['A peaceful study environment'],
    aspectRatio: '16:9' as const,
    clipDuration: 5,
    autoUpload: false,
    status: 'queued' as const,
    progress: 0,
  };

  const [job] = await db.insert(jobs).values(jobData).returning();

  console.log('✅ Test job created!');
  console.log(`   Job ID: ${job.id}`);
  console.log(`   Mode: ${job.mode}`);
  console.log(`   Status: ${job.status}`);
  console.log('\n⏱️  This should complete in 2-4 minutes with parallel looping!');
  console.log('   (vs 15-20 minutes with old single-loop approach)\n');
  console.log('Monitor with:');
  console.log(`   tail -f /tmp/server-parallel-loop.log | grep -E "Parallel|Segment|Progress"`);
}

createTestJob();
