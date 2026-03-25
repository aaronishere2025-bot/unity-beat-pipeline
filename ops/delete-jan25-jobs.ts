#!/usr/bin/env tsx
import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq, and, like } from 'drizzle-orm';

async function deleteJan25Jobs() {
  const recentJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.mode, 'music'), like(jobs.scriptName, '%Jan 25%')))
    .limit(10);

  console.log(`Found ${recentJobs.length} jobs from Jan 25:`);
  for (const job of recentJobs) {
    console.log(`  - ${job.id} ${job.scriptName} ${job.status}`);
    await db.delete(jobs).where(eq(jobs.id, job.id));
    console.log(`    ✅ Deleted`);
  }
  console.log('\n✅ All Jan 25 jobs deleted');
}

deleteJan25Jobs().catch(console.error);
