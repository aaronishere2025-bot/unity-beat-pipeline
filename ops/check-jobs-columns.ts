import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkColumns() {
  const cols = await db.execute(sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'jobs'
    ORDER BY ordinal_position
  `);

  console.log('Jobs table columns:');
  for (const row of cols.rows as any[]) {
    console.log('  -', row.column_name);
  }
}

checkColumns().catch(console.error);
