#!/usr/bin/env tsx
/**
 * Fix stuck jobs by regenerating from their Unity packages
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

  console.log('\n🔧 Fixing stuck jobs by regenerating from Unity packages...\n');

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

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 ${job.scriptName}`);
    console.log(`   Job ID: ${job.id}`);

    const unityMeta = job.unityMetadata as any;
    const packageId = unityMeta?.packageId;

    if (!packageId) {
      console.log('   ❌ No Unity package ID found - cannot regenerate');
      continue;
    }

    console.log(`   Unity Package: ${packageId}`);
    console.log(`   Current Status: ${job.status}`);
    console.log(`   Has Music: ${job.musicUrl ? '✓' : '✗'}`);

    // Reset job to queued so worker can pick it up
    console.log('\n   🔄 Resetting job to "queued" status...');

    await db
      .update(jobs)
      .set({
        status: 'queued',
        progress: 0,
        error: null,
        completedClips: [],
        totalCost: 0,
      })
      .where(eq(jobs.id, jobId));

    console.log('   ✅ Job reset to queued - worker will regenerate from Unity package');
    console.log('   📝 Will use existing Unity package:', packageId);
    console.log('   🎵 Will use existing music:', job.musicUrl || 'none');
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✅ All jobs reset to queued');
  console.log('👀 Monitor job-worker.ts logs to see regeneration progress');
  console.log('');
  console.log('The worker will:');
  console.log('  1. Load Unity package (lyrics + metadata)');
  console.log('  2. Generate visual prompts from package');
  console.log('  3. Generate clips with Kling AI');
  console.log('  4. Assemble video with FFmpeg (WITH TIMEOUTS now!)');
  console.log('  5. Mark job as completed');
  console.log('');
  console.log('⚠️  Note: Since these are the SAME topics (Pope Formosus), consider');
  console.log('    deleting one of them after they complete to avoid duplicates.');
}

main().catch(console.error);
