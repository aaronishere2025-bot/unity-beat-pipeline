#!/usr/bin/env tsx
import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function main() {
  await initializeSecretsFromGCP();

  const { db } = await import('./server/db');
  const { jobs } = await import('./shared/schema');
  const { eq } = await import('drizzle-orm');

  // Delete the duplicate Pope job that's less complete (16% vs 68%)
  const jobId = '772612e0-8160-4cce-9162-5227ffe41982'; // Pope Stephen VI - 16% complete

  console.log('🗑️ Deleting duplicate Pope job (keeping the one at 68%)...');

  await db.delete(jobs).where(eq(jobs.id, jobId));

  console.log('✅ Deleted: Pope Stephen VI job');
  console.log('💰 Saved: ~$2-3 in Kling costs');
}

main().catch(console.error);
