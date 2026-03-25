import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { desc } from 'drizzle-orm';

async function main() {
  const recent = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      mode: jobs.mode,
      status: jobs.status,
      progress: jobs.progress,
      errorMessage: jobs.errorMessage,
      retryCount: jobs.retryCount,
      createdAt: jobs.createdAt,
      duration: jobs.duration,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(8);

  for (const j of recent) {
    console.log('---');
    console.log(j.scriptName, '(' + j.id + ')');
    console.log('  Status:', j.status, '| Progress:', j.progress + '% | Retries:', j.retryCount);
    console.log('  Error:', (j.errorMessage || 'none').substring(0, 400));
    console.log('');
  }
}
main().catch(console.error);
