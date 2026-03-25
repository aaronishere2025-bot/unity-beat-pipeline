#!/usr/bin/env tsx
import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function diagnose() {
  await initializeSecretsFromGCP();

  const { db } = await import('./server/db');
  const { jobs } = await import('./shared/schema');
  const { inArray } = await import('drizzle-orm');

  const jobIds = [
    '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce', // Pope Formosus - 68%
    '1efa0a2b-778d-405d-a54d-82abfd96d8d3', // Tomoe Gozen - 63%
  ];

  console.log('🔍 Diagnosing current processing jobs...\n');

  const currentJobs = await db.select().from(jobs).where(inArray(jobs.id, jobIds));

  for (const job of currentJobs) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 ${job.scriptName}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Progress: ${job.progress}%`);
    console.log(`   Cost: $${job.totalCost || 0}`);
    console.log(`   Clips: ${job.completedClips?.length || 0}`);
    console.log(`   Music: ${job.musicUrl ? 'Yes' : 'No'}`);
    console.log(`   Video: ${job.outputVideoUrl ? 'Yes' : 'No'}`);

    if (job.error) {
      console.log(`   Error: ${job.error.substring(0, 300)}`);
    }

    const unityMeta = job.unityMetadata as any;
    if (unityMeta?.prompts) {
      console.log(`   Prompts generated: ${unityMeta.prompts.length}`);
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

diagnose().catch(console.error);
