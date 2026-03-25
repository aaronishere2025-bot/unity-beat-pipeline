import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc } from 'drizzle-orm';

async function main() {
  const recent = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      scriptName: jobs.scriptName,
      errorMessage: jobs.errorMessage,
      metadata: jobs.metadata,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.updatedAt))
    .limit(10);

  console.log('\n=== RECENT JOBS ===');
  for (const j of recent) {
    const meta = j.metadata as any;
    console.log(
      `[${j.status}] ${j.scriptName} | requeue:${meta?.requeueCount || 0} | doNotRequeue:${meta?.doNotRequeue || false}`,
    );
    if (j.errorMessage) console.log(`  err: ${j.errorMessage.substring(0, 120)}`);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
