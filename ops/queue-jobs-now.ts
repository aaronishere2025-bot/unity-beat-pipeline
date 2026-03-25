#!/usr/bin/env tsx
import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function main() {
  await initializeSecretsFromGCP();
  const { db } = await import('./server/db');
  const { jobs } = await import('./shared/schema');
  const { eq } = await import('drizzle-orm');

  const jobIds = ['13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce', '1efa0a2b-778d-405d-a54d-82abfd96d8d3'];

  for (const jobId of jobIds) {
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
    console.log(`✅ Queued: ${jobId}`);
  }

  console.log('\n✅ 2 jobs queued! Job worker will start processing.');
}

main().catch(console.error);
