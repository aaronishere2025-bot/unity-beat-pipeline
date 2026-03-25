import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, and, inArray } from 'drizzle-orm';

async function main() {
  // Kill the known zombie jobs
  const zombieIds = [
    '66e9fcaa-9d8c-4a86-9d74-7149de8f926c', // Zu Chongzhi
    'f63ed649-2774-4492-86db-5ca36aef90af', // Salem Witch Trials
  ];

  // Also find any other jobs stuck in processing/queued for unity_kling
  const allStuck = await db
    .select({ id: jobs.id, scriptName: jobs.scriptName, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.mode, 'unity_kling'), inArray(jobs.status, ['processing', 'queued', 'preparing'])));

  const allIds = [...new Set([...zombieIds, ...allStuck.map((j) => j.id)])];

  console.log(`Killing ${allIds.length} zombie jobs:`);
  for (const id of allIds) {
    const match = allStuck.find((j) => j.id === id);
    console.log(`  ${id.slice(0, 8)} - ${match?.scriptName || 'known zombie'} (${match?.status || 'target'})`);
  }

  for (const id of allIds) {
    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorMessage: 'PERMANENTLY KILLED: Zombie job detected in credit audit. Do not requeue.',
        updatedAt: new Date(),
        metadata: {
          doNotRequeue: true,
          killedAt: new Date().toISOString(),
          killedReason: 'credit-leak-audit-2026-03-05',
        } as any,
      })
      .where(eq(jobs.id, id));
  }

  console.log(`\n✅ ${allIds.length} zombie jobs permanently killed`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
