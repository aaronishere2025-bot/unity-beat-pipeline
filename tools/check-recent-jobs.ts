import { db } from './server/db';
import { jobs } from '@shared/schema';
import { desc } from 'drizzle-orm';

async function checkJobs() {
  console.log('📊 Checking recent jobs...\n');

  const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(10);

  if (recentJobs.length === 0) {
    console.log('❌ No jobs found in database\n');
  } else {
    console.log(`✅ Found ${recentJobs.length} recent jobs:\n`);
    for (const job of recentJobs) {
      const status =
        job.status === 'completed' ? '✅' : job.status === 'processing' ? '🔄' : job.status === 'failed' ? '❌' : '⏳';
      console.log(`${status} ${job.id.substring(0, 8)}... - ${job.status.toUpperCase()}`);
      console.log(`   Mode: ${job.mode}`);
      console.log(`   Package: ${job.packageId?.substring(0, 8)}...`);
      console.log(`   Auto-upload: ${job.autoUpload ? 'YES' : 'NO'}`);
      console.log(`   Created: ${job.createdAt.toLocaleString()}`);
      if (job.completedAt) {
        console.log(`   Completed: ${job.completedAt.toLocaleString()}`);
      }
      console.log('');
    }
  }

  const queuedCount = recentJobs.filter((j) => j.status === 'queued').length;
  const processingCount = recentJobs.filter((j) => j.status === 'processing').length;
  const completedCount = recentJobs.filter((j) => j.status === 'completed').length;
  const failedCount = recentJobs.filter((j) => j.status === 'failed').length;

  console.log('═══════════════════════════════════════');
  console.log('📊 Status Summary:');
  console.log(`   ⏳ Queued: ${queuedCount}`);
  console.log(`   🔄 Processing: ${processingCount}`);
  console.log(`   ✅ Completed: ${completedCount}`);
  console.log(`   ❌ Failed: ${failedCount}\n`);

  if (queuedCount > 0) {
    console.log('💡 To process queued jobs:');
    console.log('   1. Start the server: npm run dev');
    console.log('   2. Job worker will automatically process them\n');
  }

  process.exit(0);
}

checkJobs().catch(console.error);
