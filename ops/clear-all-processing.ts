import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

console.log('🧹 Clearing ALL processing jobs to unblock queue...\n');

const processing = await db.select().from(jobs).where(eq(jobs.status, 'processing'));

console.log(`Found ${processing.length} processing job(s):`);
for (const job of processing) {
  console.log(`  ${job.id.substring(0, 12)}... - ${job.scriptName} (${job.progress}%)`);

  await db
    .update(jobs)
    .set({
      status: 'failed',
      error: 'Server restart - cleared processing state',
    })
    .where(eq(jobs.id, job.id));

  console.log(`    ✅ Cleared`);
}

const queued = await db.select().from(jobs).where(eq(jobs.status, 'queued'));
console.log(`\n📋 ${queued.length} jobs now queued and ready to process`);

console.log('\n✅ Done! Restart server now.');
process.exit(0);
