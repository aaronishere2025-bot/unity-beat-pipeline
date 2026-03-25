import { db, pool } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  const r = await db.execute(sql`
    SELECT id, script_name, status FROM jobs
    WHERE created_at > NOW() - INTERVAL '24 hours'
    ORDER BY created_at DESC
  `);
  for (const row of r.rows as any[]) {
    console.log(`${row.id} | ${row.status} | ${row.script_name}`);
  }
  await pool.end();
}
main();
