import { storage } from './server/storage';

async function testListJobs() {
  console.log('🔍 Testing storage.listJobs()...\n');

  const allJobs = await storage.listJobs();

  console.log(`📊 Total jobs: ${allJobs.length}\n`);

  const queued = allJobs.filter((j) => j.status === 'queued');
  const processing = allJobs.filter((j) => j.status === 'processing');
  const completed = allJobs.filter((j) => j.status === 'completed');
  const failed = allJobs.filter((j) => j.status === 'failed');

  console.log(`Status breakdown:`);
  console.log(`  - Queued: ${queued.length}`);
  console.log(`  - Processing: ${processing.length}`);
  console.log(`  - Completed: ${completed.length}`);
  console.log(`  - Failed: ${failed.length}\n`);

  if (queued.length > 0) {
    console.log('🎯 Queued jobs:');
    for (const job of queued) {
      console.log(`   - ${job.id.substring(0, 8)}: ${job.scriptName} (mode: ${job.mode})`);
      console.log(`     Progress: ${job.progress}%, Unity: ${job.unityMetadata ? 'YES' : 'NO'}`);
    }
  }

  process.exit(0);
}

testListJobs().catch(console.error);
