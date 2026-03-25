import { db } from './server/db';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  // Lofi job error
  const lofi = await db.execute(sql`
    SELECT id, error_message, metadata
    FROM jobs 
    WHERE id = '8bc3855d-1b29-4180-97d2-0603da85219a'
  `);
  console.log('=== LOFI JOB ERROR ===');
  console.log('Error:', lofi.rows[0]?.error_message);
  const meta = lofi.rows[0]?.metadata;
  if (meta && typeof meta === 'object') {
    console.log('Metadata keys:', Object.keys(meta as any));
    const m = meta as any;
    if (m.lastError) console.log('lastError:', m.lastError);
    if (m.failureReason) console.log('failureReason:', m.failureReason);
  }

  // Churchill job error
  const churchill = await db.execute(sql`
    SELECT id, error_message, metadata
    FROM jobs 
    WHERE id = '55e22a0a-fa10-4154-b389-37ca945eaadc'
  `);
  console.log('\n=== CHURCHILL JOB ERROR ===');
  console.log('Error:', churchill.rows[0]?.error_message);
  const meta2 = churchill.rows[0]?.metadata;
  if (meta2 && typeof meta2 === 'object') {
    console.log('Metadata keys:', Object.keys(meta2 as any));
    const m2 = meta2 as any;
    if (m2.lastError) console.log('lastError:', m2.lastError);
    if (m2.failureReason) console.log('failureReason:', m2.failureReason);
  }

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
