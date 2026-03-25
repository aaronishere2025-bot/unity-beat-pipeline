import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const recent = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      status: jobs.status,
      progress: jobs.progress,
      retryCount: jobs.retryCount,
      errorMessage: jobs.errorMessage,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.updatedAt))
    .limit(10);
  for (const j of recent) {
    console.log(`[${j.status}] ${j.progress}% | retries:${j.retryCount} | ${j.scriptName} | ${j.id}`);
    if (j.errorMessage) console.log(`  ERROR: ${j.errorMessage.slice(0, 400)}`);
  }
  process.exit(0);
}
main();
