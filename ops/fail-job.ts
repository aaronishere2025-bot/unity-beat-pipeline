import { db, pool } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const jobId = process.argv[2];
const msg = process.argv[3] || 'Paused - waiting for Napoleon to finish first';

async function main() {
  const [updated] = await db
    .update(jobs)
    .set({ status: 'failed', errorMessage: msg } as any)
    .where(eq(jobs.id, jobId))
    .returning({ id: jobs.id, name: jobs.scriptName });

  if (updated) {
    console.log(`Set to failed: ${updated.name} (${updated.id})`);
  } else {
    console.log(`Job not found: ${jobId}`);
  }
  await pool.end();
}
main();
