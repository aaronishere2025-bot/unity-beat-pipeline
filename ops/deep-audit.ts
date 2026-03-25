import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  // 1. All unity_kling jobs with actual costs
  console.log('=== ALL UNITY_KLING JOBS (ALL TIME) ===');
  const allKling = await db.execute(sql`
    SELECT id, script_name, status, clip_count, completed_clips,
           cost, actual_cost_usd, created_at, updated_at,
           error_message
    FROM jobs WHERE mode = 'unity_kling'
    ORDER BY created_at DESC
    LIMIT 30
  `);
  let totalCost = 0;
  let totalClips = 0;
  for (const r of allKling.rows) {
    const row = r as any;
    const cost = parseFloat(row.cost || '0') + parseFloat(row.actual_cost_usd || '0');
    totalCost += cost;
    totalClips += parseInt(row.clip_count || '0');
    console.log(
      `  ${row.created_at?.toISOString?.()?.slice(0, 10) || row.created_at} | ${row.status.padEnd(10)} | clips:${row.clip_count || 0}/${row.completed_clips || '?'} | $${row.cost} | ${row.script_name}`,
    );
    if (row.error_message) console.log(`    ERR: ${row.error_message.slice(0, 120)}`);
  }
  console.log(`\n  DB-tracked total: $${totalCost.toFixed(2)} | ${totalClips} clips`);

  // 2. Check api_usage table
  console.log('\n=== API_USAGE TABLE ===');
  try {
    const cols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'api_usage' ORDER BY ordinal_position
    `);
    console.log('Columns:', cols.rows.map((r: any) => r.column_name).join(', '));

    const usage = await db.execute(sql`
      SELECT * FROM api_usage
      WHERE provider ILIKE '%kling%' OR provider ILIKE '%kie%' OR service ILIKE '%kling%' OR service ILIKE '%kie%'
      ORDER BY created_at DESC LIMIT 20
    `);
    console.log(`Kling rows: ${usage.rows.length}`);
    for (const r of usage.rows) console.log(' ', JSON.stringify(r));
  } catch (e: any) {
    console.log('Error:', e.message);
    // Try without filters
    try {
      const all = await db.execute(sql`SELECT * FROM api_usage ORDER BY created_at DESC LIMIT 5`);
      console.log('Sample rows:', JSON.stringify(all.rows.slice(0, 2), null, 2));
    } catch (e2: any) {
      console.log('Also failed:', e2.message);
    }
  }

  // 3. Parse actual kie.ai responses from logs to count accepted task_ids
  console.log('\n=== CHECKING METADATA COLUMN FOR KLING TASK IDS ===');
  const withMeta = await db.execute(sql`
    SELECT id, script_name, metadata, completed_clips, clip_count
    FROM jobs
    WHERE mode = 'unity_kling' AND metadata IS NOT NULL
    ORDER BY created_at DESC LIMIT 10
  `);
  for (const r of withMeta.rows) {
    const row = r as any;
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
    if (meta) {
      console.log(`\n  ${row.script_name} (${row.id.slice(0, 8)})`);
      console.log(`  Metadata keys: ${Object.keys(meta).join(', ')}`);
      if (meta.klingTasks) console.log(`  Kling tasks: ${JSON.stringify(meta.klingTasks).slice(0, 200)}`);
      if (meta.resumeRecord) console.log(`  Resume: ${JSON.stringify(meta.resumeRecord).slice(0, 200)}`);
      if (meta.creditUsage) console.log(`  Credit usage: ${JSON.stringify(meta.creditUsage)}`);
    }
  }

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
