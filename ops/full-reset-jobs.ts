#!/usr/bin/env tsx
/**
 * Fully reset jobs - clear ALL state
 */

import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function main() {
  console.log('🔧 Loading secrets...');
  await initializeSecretsFromGCP();

  const { db } = await import('./server/db');
  const { jobs } = await import('./shared/schema');
  const { eq } = await import('drizzle-orm');

  const jobIds = [
    '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce',
    '772612e0-8160-4cce-9162-5227ffe41982',
    '1efa0a2b-778d-405d-a54d-82abfd96d8d3',
  ];

  console.log('\n🔧 FULL RESET - Clearing all state...\n');

  for (const jobId of jobIds) {
    const job = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .then((rows) => rows[0]);

    if (!job) {
      console.log(`❌ Job ${jobId} not found`);
      continue;
    }

    console.log(`📦 ${job.scriptName}`);
    console.log(`   Resetting ALL fields to fresh state...`);

    // FULL RESET - clear everything except Unity metadata and music
    await db
      .update(jobs)
      .set({
        status: 'queued',
        progress: 0,
        error: null,
        completedClips: [],
        totalCost: 0,
        // Don't touch these - we want to reuse them:
        // - musicUrl (keep existing music)
        // - unityMetadata (keep Unity package reference)
      })
      .where(eq(jobs.id, jobId));

    console.log(`   ✅ Reset to queued with progress=0\n`);
  }

  console.log('✅ All jobs fully reset');
  console.log('🔄 Job worker should pick them up now...\n');
}

main().catch(console.error);
