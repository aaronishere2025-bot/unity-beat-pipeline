import { db, pool } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, sql } from 'drizzle-orm';

const recent = await db
  .select({
    id: jobs.id,
    name: jobs.scriptName,
    status: jobs.status,
    mode: jobs.mode,
    source: sql`${jobs.unityMetadata}->>'automationSource'`,
    createdAt: jobs.createdAt,
  })
  .from(jobs)
  .orderBy(desc(jobs.createdAt))
  .limit(20);

for (const j of recent) {
  const age = ((Date.now() - j.createdAt.getTime()) / 1000 / 60).toFixed(0);
  console.log(
    `${j.status.padEnd(10)} | ${(j.mode || '').padEnd(12)} | ${String(j.source || '').padEnd(16)} | ${age}m ago | ${j.name}`,
  );
}

await pool.end();
