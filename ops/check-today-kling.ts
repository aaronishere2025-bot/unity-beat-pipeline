import { db, pool } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  // ALL Kling calls today with timestamps
  const today = await db.execute(sql`
    SELECT created_at, operation, success, cost, error_message, job_id
    FROM api_usage
    WHERE service = 'kling' AND created_at > '2026-03-03 00:00:00'
    ORDER BY created_at
  `);

  console.log('=== ALL KLING CALLS TODAY (March 3) ===');
  for (const row of today.rows as any[]) {
    const t = new Date(row.created_at).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' });
    const s = row.success ? 'OK  ' : 'FAIL';
    const jobId = row.job_id ? row.job_id.toString().slice(0, 8) : 'no-job';
    const err = row.error_message ? ' | ' + row.error_message.toString().slice(0, 60) : '';
    console.log(`  ${t} | ${s} | $${parseFloat(row.cost || 0).toFixed(2)} | ${jobId} | ${err}`);
  }

  console.log(`\nTotal today: ${today.rows.length} calls`);

  const totalCost = (today.rows as any[]).reduce((sum: number, r: any) => sum + parseFloat(r.cost || 0), 0);
  console.log(`Total cost today: $${totalCost.toFixed(2)}`);

  const successes = (today.rows as any[]).filter((r: any) => r.success).length;
  const failures = (today.rows as any[]).filter((r: any) => !r.success).length;
  console.log(`Successes: ${successes}, Failures: ${failures}`);

  // Now check: does the cost tracker log CREDIT INSUFFICIENT errors?
  console.log('\n=== CHECKING IF "Credits insufficient" IS TRACKED ===');
  const creditErrors = await db.execute(sql`
    SELECT COUNT(*) as count
    FROM api_usage
    WHERE service = 'kling' AND error_message LIKE '%Credits%'
  `);
  console.log(`Credit insufficient errors in DB: ${(creditErrors.rows[0] as any).count}`);

  // Check what errors ARE tracked
  console.log('\n=== ALL KLING ERROR TYPES EVER TRACKED ===');
  const allErrors = await db.execute(sql`
    SELECT error_message, COUNT(*) as count, SUM(cost::numeric) as total_cost
    FROM api_usage
    WHERE service = 'kling' AND success = false
    GROUP BY error_message
    ORDER BY count DESC
    LIMIT 20
  `);
  for (const row of allErrors.rows as any[]) {
    const msg = (row.error_message || 'null').toString().slice(0, 80);
    console.log(`  ${row.count}x ($${parseFloat(row.total_cost || 0).toFixed(2)}) | ${msg}`);
  }

  // How does the cost tracker work? Check if it tracks submissions vs completions
  console.log('\n=== KLING COST TRACKER PATTERNS ===');
  const patterns = await db.execute(sql`
    SELECT operation, success, model, COUNT(*) as count, SUM(cost::numeric) as total
    FROM api_usage
    WHERE service = 'kling'
    GROUP BY operation, success, model
    ORDER BY total DESC
  `);
  for (const row of patterns.rows as any[]) {
    console.log(
      `  ${row.operation} | success=${row.success} | ${row.model || 'none'} | ${row.count} calls | $${parseFloat(row.total || 0).toFixed(2)}`,
    );
  }

  await pool.end();
}

main();
