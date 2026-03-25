import { db, pool } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  const recent = await db.execute(sql`
    SELECT id, script_name, mode, status, progress, error_message
    FROM jobs
    WHERE created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
  `);
  for (const j of recent.rows as any[]) {
    const id = j.id.toString().slice(0, 8);
    const err = (j.error_message || '').toString().slice(0, 70);
    console.log(
      `${id} | ${(j.status || '').toString().padEnd(10)} | ${(j.mode || '').padEnd(12)} | ${j.progress}% | ${j.script_name} | ${err}`,
    );
  }
  await pool.end();
}
main();
