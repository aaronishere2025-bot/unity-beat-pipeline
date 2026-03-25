import { db, pool } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const jobId = process.argv[2];
if (!jobId) {
  console.log('Usage: npx tsx reset-job.ts <job-id>');
  process.exit(1);
}

async function main() {
  const [updated] = await db
    .update(jobs)
    .set({ status: 'queued', progress: 0, errorMessage: null } as any)
    .where(eq(jobs.id, jobId))
    .returning({ id: jobs.id, name: jobs.scriptName, status: jobs.status });

  if (updated) {
    console.log(`Reset: ${updated.name} (${updated.id}) → queued`);
  } else {
    console.log(`Job not found: ${jobId}`);
  }
  await pool.end();
}
main();
