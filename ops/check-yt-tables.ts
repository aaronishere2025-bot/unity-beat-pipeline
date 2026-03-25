import 'dotenv/config';
import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function main() {
  const r = await db.execute(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%youtube%' OR table_name ILIKE '%channel%')`,
  );
  console.log('Tables:', r.rows);

  // Check connected channels
  try {
    const ch = await db.execute(
      sql`SELECT id, channel_name, channel_id, is_active, LEFT(refresh_token, 15) as token_prefix, last_upload_at FROM connected_youtube_channels LIMIT 10`,
    );
    console.log('\nConnected channels:');
    console.table(ch.rows);
  } catch (e: any) {
    console.log('No connected_youtube_channels table:', e.message?.slice(0, 80));
  }

  // Check YOUTUBE_REFRESH_TOKEN env var
  const token = process.env.YOUTUBE_REFRESH_TOKEN;
  console.log(`\nYOUTUBE_REFRESH_TOKEN env: ${token ? token.slice(0, 15) + '...' : 'NOT SET'}`);

  process.exit(0);
}
main();
