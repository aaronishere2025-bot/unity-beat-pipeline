import { db } from './server/db';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  // First get columns
  const cols = await db.execute(sql`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'jobs' ORDER BY ordinal_position
  `);
  console.log('Columns:', cols.rows.map((r: any) => r.column_name).join(', '));

  const results = await db.execute(sql`
    SELECT id, status, progress, script_name, mode, retry_count, updated_at
    FROM jobs 
    WHERE id = '8bc3855d-1b29-4180-97d2-0603da85219a'
  `);
  console.log('\nLofi job:', JSON.stringify(results.rows, null, 2));

  const recent = await db.execute(sql`
    SELECT id, status, progress, script_name, mode, retry_count, updated_at
    FROM jobs 
    WHERE script_name ILIKE '%churchill%' OR script_name ILIKE '%winston%'
    ORDER BY created_at DESC LIMIT 3
  `);
  console.log('Churchill jobs:', JSON.stringify(recent.rows, null, 2));

  const allRecent = await db.execute(sql`
    SELECT id, status, progress, script_name, mode, retry_count, updated_at
    FROM jobs 
    ORDER BY created_at DESC LIMIT 8
  `);
  console.log('\nRecent jobs:', JSON.stringify(allRecent.rows, null, 2));

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
