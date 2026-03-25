#!/usr/bin/env tsx
/**
 * Manually trigger processing for specific jobs
 */

import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function main() {
  console.log('🔧 Loading secrets...');
  await initializeSecretsFromGCP();

  const jobIds = [
    '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce',
    '772612e0-8160-4cce-9162-5227ffe41982',
    '1efa0a2b-778d-405d-a54d-82abfd96d8d3',
  ];

  console.log('\n🚀 Manually triggering job processing...\n');

  // Import after secrets are loaded
  const { jobWorker } = await import('./server/services/job-worker');

  // Force process each job
  for (const jobId of jobIds) {
    console.log(`📦 Triggering: ${jobId}`);
    try {
      // The job worker should pick these up on next poll
      // But we can also try to manually process them
      await (jobWorker as any).processJob(jobId);
    } catch (err: any) {
      console.error(`   ❌ Error: ${err.message}`);
    }
  }

  console.log('\n✅ Jobs triggered\n');
}

main().catch(console.error);
