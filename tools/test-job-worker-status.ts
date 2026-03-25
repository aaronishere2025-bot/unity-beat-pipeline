import { db } from './server/db';
import { jobs } from '@shared/schema';

async function checkJobWorkerStatus() {
  console.log('🔍 Checking job worker status...\n');

  // Check queued jobs
  const queuedJobs = await db
    .select()
    .from(jobs)
    .where(sql`status = 'queued'`);

  console.log(`📊 Found ${queuedJobs.length} queued jobs:`);
  for (const job of queuedJobs) {
    console.log(`   - ${job.id.substring(0, 8)}: ${job.scriptName} (mode: ${job.mode})`);
    console.log(`     Unity metadata: ${job.unityMetadata ? 'YES' : 'NO'}`);
  }

  // Check processing jobs
  const processingJobs = await db
    .select()
    .from(jobs)
    .where(sql`status = 'processing'`);

  console.log(`\n⚙️  Found ${processingJobs.length} processing jobs`);

  if (queuedJobs.length > 0 && processingJobs.length === 0) {
    console.log('\n⚠️  WARNING: Jobs are queued but none are processing!');
    console.log('   This suggests the job worker polling loop may not be running.');
  }

  process.exit(0);
}

import { sql } from 'drizzle-orm';
checkJobWorkerStatus().catch(console.error);
