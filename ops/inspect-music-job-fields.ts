/**
 * Inspect music mode job fields
 */

import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  console.log('\n🔍 Inspecting Music Mode Job Fields\n');
  console.log('━'.repeat(80));

  // Get one failed and one successful music mode job
  const failedJob = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, 'failed'))
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  const successfulJob = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, 'completed'))
    .orderBy(desc(jobs.createdAt))
    .limit(1);

  console.log('\n❌ FAILED JOB:');
  if (failedJob.length > 0) {
    const job = failedJob[0];
    console.log(`   ID: ${job.id}`);
    console.log(`   Script Name: ${job.scriptName}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Script Content: ${job.scriptContent || 'none'}`);
    console.log(`   Music URL: ${job.musicUrl || 'NONE'}`);
    console.log(`   Unity Package ID: ${job.unityPackageId || 'NONE'}`);
    console.log(`   Audio Path: ${job.audioPath || 'NONE'}`);
    console.log(`   Unity Metadata: ${job.unityMetadata ? 'present' : 'NONE'}`);
  }

  console.log('\n✅ SUCCESSFUL JOB:');
  if (successfulJob.length > 0) {
    const job = successfulJob[0];
    console.log(`   ID: ${job.id}`);
    console.log(`   Script Name: ${job.scriptName}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Script Content: ${job.scriptContent || 'none'}`);
    console.log(`   Music URL: ${job.musicUrl || 'NONE'}`);
    console.log(`   Unity Package ID: ${job.unityPackageId || 'NONE'}`);
    console.log(`   Audio Path: ${job.audioPath || 'NONE'}`);
    console.log(`   Unity Metadata: ${job.unityMetadata ? 'present' : 'NONE'}`);
  }

  console.log('\n━'.repeat(80));
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
