import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const jobIds = [
    '94e50d3e-929c-4510-81c5-250cb4340678', // Cao Cao
    '4a0b6ba5-aaff-4ec3-8d6d-e4265e962d4d', // Mansa Musa
  ];

  for (const id of jobIds) {
    const [job] = await db
      .select({ scriptName: jobs.scriptName, status: jobs.status, retryCount: jobs.retryCount })
      .from(jobs)
      .where(eq(jobs.id, id));

    if (!job) {
      console.log(`Job ${id} not found`);
      continue;
    }

    console.log(`Resetting: ${job.scriptName} (status: ${job.status}, retries: ${job.retryCount})`);

    await db
      .update(jobs)
      .set({
        status: 'queued',
        retryCount: 0,
        errorMessage: null,
        progress: 0,
      })
      .where(eq(jobs.id, id));

    console.log(`  ✅ Reset to queued with 0 retries`);
  }

  process.exit(0);
}
main();
