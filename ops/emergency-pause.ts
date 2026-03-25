import { db, pool } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  // 1. Abort all active Kling polling loops (in-memory)
  try {
    const { KlingVideoGenerator } = await import('./server/services/kling-video-generator.js');
    KlingVideoGenerator.abortAllJobs();
    console.log('🛑 Aborted all active Kling polling');
  } catch (e) {
    console.log('⚠️  Could not abort Kling polling (may be running in different process)');
  }

  // 2. Pause all DB jobs
  const processing = await db
    .update(jobs)
    .set({ status: 'failed', errorMessage: '[Emergency Pause] All jobs stopped' } as any)
    .where(eq(jobs.status, 'processing'))
    .returning({ id: jobs.id, name: jobs.scriptName });
  const queued = await db
    .update(jobs)
    .set({ status: 'failed', errorMessage: '[Emergency Pause] All jobs stopped' } as any)
    .where(eq(jobs.status, 'queued'))
    .returning({ id: jobs.id, name: jobs.scriptName });

  console.log('PAUSED processing:');
  for (const j of processing) console.log('  ' + j.name + ' (' + j.id + ')');
  console.log('PAUSED queued:');
  for (const j of queued) console.log('  ' + j.name + ' (' + j.id + ')');
  console.log('Total paused: ' + (processing.length + queued.length));
  await pool.end();
}
main();
