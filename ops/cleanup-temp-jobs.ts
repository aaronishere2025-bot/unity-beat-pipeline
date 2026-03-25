#!/usr/bin/env tsx
import { storage } from './server/storage';

async function cleanupTempJobs() {
  const jobs = await storage.getJobs();
  const tempJobs = jobs.filter((j) => j.scriptName?.includes('[Temp]') && j.status === 'failed');
  console.log(`Found ${tempJobs.length} failed temp jobs`);

  for (const job of tempJobs) {
    await storage.deleteJob(job.id);
    console.log(`Deleted: ${job.scriptName}`);
  }

  console.log('✅ Cleanup complete');
}

cleanupTempJobs();
