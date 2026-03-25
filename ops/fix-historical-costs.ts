/**
 * Fix historical cost data: set cost=0 for "Credits insufficient" errors
 * These were never actually charged by kie.ai since no task was created
 */
import { db, pool } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Check current state
  const before = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE error_message LIKE '%Credits insufficient%') as credit_errors,
      SUM(cost::numeric) FILTER (WHERE error_message LIKE '%Credits insufficient%') as credit_error_cost,
      COUNT(*) FILTER (WHERE error_message LIKE '%exceeded the hourly%') as rate_errors,
      SUM(cost::numeric) FILTER (WHERE error_message LIKE '%exceeded the hourly%') as rate_error_cost,
      SUM(cost::numeric) as total_cost
    FROM api_usage
    WHERE service = 'kling'
  `);
  const b = before.rows[0] as any;
  console.log('=== BEFORE FIX ===');
  console.log(
    `  Credit insufficient errors: ${b.credit_errors} entries at $${parseFloat(b.credit_error_cost || 0).toFixed(2)}`,
  );
  console.log(`  Rate limit errors: ${b.rate_errors} entries at $${parseFloat(b.rate_error_cost || 0).toFixed(2)}`);
  console.log(`  Total Kling cost in DB: $${parseFloat(b.total_cost || 0).toFixed(2)}`);

  // Fix: set cost=0 for "Credits insufficient" errors (task never created, never charged)
  const fixed1 = await db.execute(sql`
    UPDATE api_usage
    SET cost = '0.0000'
    WHERE service = 'kling' AND error_message LIKE '%Credits insufficient%' AND cost::numeric > 0
  `);
  console.log(`\n  Fixed ${fixed1.rowCount} "Credits insufficient" entries → cost=$0`);

  // Fix: set cost=0 for "hourly rate exceeded" errors (429 = no task created)
  const fixed2 = await db.execute(sql`
    UPDATE api_usage
    SET cost = '0.0000'
    WHERE service = 'kling' AND error_message LIKE '%exceeded the hourly%' AND cost::numeric > 0
  `);
  console.log(`  Fixed ${fixed2.rowCount} "hourly rate exceeded" entries → cost=$0`);

  // Fix: set cost=0 for "call frequency too high" errors
  const fixed3 = await db.execute(sql`
    UPDATE api_usage
    SET cost = '0.0000'
    WHERE service = 'kling' AND error_message LIKE '%frequency is too high%' AND cost::numeric > 0
  `);
  console.log(`  Fixed ${fixed3.rowCount} "call frequency too high" entries → cost=$0`);

  // Fix: set cost=0 for "Rate limit exceeded" errors
  const fixed4 = await db.execute(sql`
    UPDATE api_usage
    SET cost = '0.0000'
    WHERE service = 'kling' AND error_message LIKE '%Rate limit%' AND cost::numeric > 0
  `);
  console.log(`  Fixed ${fixed4.rowCount} "Rate limit exceeded" entries → cost=$0`);

  // Verify
  const after = await db.execute(sql`
    SELECT
      COUNT(*) as total_entries,
      COUNT(*) FILTER (WHERE success = true) as successes,
      COUNT(*) FILTER (WHERE success = false) as failures,
      SUM(cost::numeric) as total_cost,
      SUM(cost::numeric) FILTER (WHERE success = true) as success_cost,
      SUM(cost::numeric) FILTER (WHERE success = false) as failure_cost
    FROM api_usage
    WHERE service = 'kling'
  `);
  const a = after.rows[0] as any;
  console.log('\n=== AFTER FIX ===');
  console.log(`  Total entries: ${a.total_entries} (${a.successes} ok, ${a.failures} fail)`);
  console.log(`  Total Kling cost: $${parseFloat(a.total_cost || 0).toFixed(2)}`);
  console.log(`  Success cost: $${parseFloat(a.success_cost || 0).toFixed(2)}`);
  console.log(
    `  Failure cost: $${parseFloat(a.failure_cost || 0).toFixed(2)} (should be low — only internal errors that were submitted)`,
  );

  const saved = parseFloat(b.total_cost || 0) - parseFloat(a.total_cost || 0);
  console.log(`\n  Corrected phantom costs: $${saved.toFixed(2)}`);

  await pool.end();
}

main();
