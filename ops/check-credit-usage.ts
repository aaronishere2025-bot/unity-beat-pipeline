import { db, pool } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  try {
    // Kling usage breakdown
    const klingUsage = await db.execute(sql`
      SELECT service, operation, model, success, COUNT(*) as calls, SUM(cost::numeric) as total_cost,
             MIN(created_at) as first_call, MAX(created_at) as last_call
      FROM api_usage
      WHERE service = 'kling'
      GROUP BY service, operation, model, success
      ORDER BY total_cost DESC
    `);

    console.log('=== KLING API USAGE ===');
    for (const row of klingUsage.rows as any[]) {
      const status = row.success ? 'OK' : 'FAIL';
      console.log(
        `  ${status} | ${row.operation || 'unknown'} | ${row.model || 'unknown'} | ${row.calls} calls | $${parseFloat(row.total_cost || 0).toFixed(2)} | ${row.first_call} → ${row.last_call}`,
      );
    }

    const total = await db.execute(
      sql`SELECT SUM(cost::numeric) as total, COUNT(*) as calls FROM api_usage WHERE service = 'kling'`,
    );
    console.log(
      `\nTotal Kling: ${(total.rows[0] as any).calls} calls, $${parseFloat((total.rows[0] as any).total || 0).toFixed(2)}`,
    );

    // All providers last 24h
    const allUsage = await db.execute(sql`
      SELECT service, COUNT(*) as calls, SUM(cost::numeric) as total_cost
      FROM api_usage
      WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY service
      ORDER BY total_cost DESC
    `);

    console.log('\n=== ALL SERVICES (last 24h) ===');
    let grandTotal = 0;
    for (const row of allUsage.rows as any[]) {
      const cost = parseFloat(row.total_cost || 0);
      grandTotal += cost;
      console.log(`  ${(row.service || 'unknown').toString().padEnd(12)} | ${row.calls} calls | $${cost.toFixed(2)}`);
    }
    console.log(`  ${'TOTAL'.padEnd(12)} | $${grandTotal.toFixed(2)}`);

    // Per-job Kling
    console.log('\n=== KLING CLIPS PER JOB (last 24h) ===');
    const perJob = await db.execute(sql`
      SELECT au.job_id, j.script_name,
             COUNT(*) as total_calls,
             COUNT(*) FILTER (WHERE au.success = true) as successes,
             COUNT(*) FILTER (WHERE au.success = false) as failures,
             SUM(au.cost::numeric) as cost
      FROM api_usage au
      LEFT JOIN jobs j ON au.job_id::text = j.id::text
      WHERE au.service = 'kling' AND au.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY au.job_id, j.script_name
      ORDER BY cost DESC
    `);

    for (const row of perJob.rows as any[]) {
      const jobId = (row.job_id || 'unknown').toString().slice(0, 8);
      console.log(
        `  ${jobId} | ${(row.script_name || 'unknown').toString().padEnd(40)} | ${row.successes} ok + ${row.failures} fail = ${row.total_calls} calls | $${parseFloat(row.cost || 0).toFixed(2)}`,
      );
    }

    // Recent jobs
    console.log('\n=== RECENT JOBS ===');
    const recentJobs = await db.execute(sql`
      SELECT id, script_name, mode, status, progress, created_at, error_message
      FROM jobs
      ORDER BY created_at DESC
      LIMIT 15
    `);

    for (const row of recentJobs.rows as any[]) {
      const shortId = (row.id || '').toString().slice(0, 8);
      const err = row.error_message ? row.error_message.toString().slice(0, 70) : '';
      console.log(
        `  ${shortId} | ${(row.status || '').toString().padEnd(10)} | ${(row.mode || '').toString().padEnd(8)} | ${row.progress || 0}% | ${row.script_name} | ${err}`,
      );
    }

    // Kling by 5-minute intervals to see burst
    console.log('\n=== KLING REQUESTS BY 5-MIN WINDOW (last 24h) ===');
    const byWindow = await db.execute(sql`
      SELECT date_trunc('hour', created_at) +
             (EXTRACT(minute FROM created_at)::int / 5) * INTERVAL '5 minutes' as time_window,
             COUNT(*) as calls,
             SUM(cost::numeric) as cost,
             COUNT(*) FILTER (WHERE success = true) as ok,
             COUNT(*) FILTER (WHERE success = false) as fail
      FROM api_usage
      WHERE service = 'kling' AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY time_window
      ORDER BY time_window
    `);

    for (const row of byWindow.rows as any[]) {
      const cost = parseFloat(row.cost || 0);
      const bar = '█'.repeat(Math.min(50, Math.round(cost * 10)));
      console.log(`  ${row.time_window} | ${row.ok} ok + ${row.fail} fail | $${cost.toFixed(2)} ${bar}`);
    }

    // Failed Kling requests with error messages
    console.log('\n=== KLING FAILURE REASONS ===');
    const failures = await db.execute(sql`
      SELECT error_message, COUNT(*) as count
      FROM api_usage
      WHERE service = 'kling' AND success = false AND created_at > NOW() - INTERVAL '24 hours'
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT 10
    `);

    for (const row of failures.rows as any[]) {
      const msg = (row.error_message || 'unknown').toString().slice(0, 80);
      console.log(`  ${row.count}x | ${msg}`);
    }
  } catch (e: any) {
    console.error('Error:', e.message);
  }

  await pool.end();
}

main();
