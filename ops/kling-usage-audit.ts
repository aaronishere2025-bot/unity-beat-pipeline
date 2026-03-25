import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Kling entries in api_usage
  console.log('=== KLING IN API_USAGE TABLE ===');
  const kling = await db.execute(sql`
    SELECT DATE(created_at) as day, service, operation, model,
           COUNT(*) as calls,
           SUM(CAST(cost AS NUMERIC)) as total_cost,
           SUM(tokens) as total_tokens
    FROM api_usage
    WHERE service ILIKE '%kling%' OR service ILIKE '%kie%' OR model ILIKE '%kling%'
       OR operation ILIKE '%kling%' OR operation ILIKE '%video%'
    GROUP BY DATE(created_at), service, operation, model
    ORDER BY day DESC
  `);
  if (kling.rows.length === 0) {
    console.log('  No kling entries found in api_usage!');
    // Check what services exist
    const services = await db.execute(sql`
      SELECT DISTINCT service FROM api_usage ORDER BY service
    `);
    console.log('  Available services:', services.rows.map((r: any) => r.service).join(', '));
  }
  for (const r of kling.rows) {
    const row = r as any;
    console.log(`  ${row.day} | ${row.service}/${row.operation} | ${row.calls} calls | $${row.total_cost}`);
  }

  // ALL api_usage for last 3 days
  console.log('\n=== ALL API_USAGE LAST 3 DAYS (by service) ===');
  const recent = await db.execute(sql`
    SELECT DATE(created_at) as day, service,
           COUNT(*) as calls,
           SUM(CAST(cost AS NUMERIC)) as total_cost
    FROM api_usage
    WHERE created_at > NOW() - INTERVAL '3 days'
    GROUP BY DATE(created_at), service
    ORDER BY day DESC, total_cost DESC
  `);
  for (const r of recent.rows) {
    const row = r as any;
    console.log(
      `  ${row.day} | ${row.service.padEnd(15)} | ${String(row.calls).padStart(5)} calls | $${parseFloat(row.total_cost || 0).toFixed(4)}`,
    );
  }

  // Now parse the ACTUAL log files for successful kie.ai task IDs
  console.log('\n=== PARSING LOG FILES FOR ACCEPTED KIE.AI TASKS ===');
  const fs = await import('fs');

  const logFiles = ['/tmp/unity-server.log', '/tmp/daily-cron-2026-03-05.log', '/tmp/unity-scratch/server.log'];

  for (const logFile of logFiles) {
    if (!fs.existsSync(logFile)) {
      console.log(`  ${logFile}: NOT FOUND`);
      continue;
    }
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');

    // Count different outcomes
    const sent = lines.filter((l) => l.includes('Sending kie.ai request')).length;
    const accepted = lines.filter(
      (l) =>
        l.includes('kie.ai task accepted') ||
        l.includes('task_id') ||
        (l.includes('code') && l.includes('200') && l.includes('kie')),
    ).length;
    const creditsInsuff = lines.filter((l) => l.includes('Credits insufficient')).length;
    const timeout = lines.filter((l) => l.includes('task timeout') || l.includes('generate task timeout')).length;
    const internalErr = lines.filter((l) => l.includes('internal error, please try again')).length;
    const downloaded = lines.filter(
      (l) => l.includes('Downloaded clip') || l.includes('clip.*downloaded') || l.includes('saved to'),
    ).length;
    const completed = lines.filter((l) => l.includes('completed') && l.includes('clip')).length;

    console.log(`\n  ${logFile}:`);
    console.log(`    Requests sent: ${sent}`);
    console.log(`    Accepted (200): ${accepted}`);
    console.log(`    Credits insufficient: ${creditsInsuff}`);
    console.log(`    Timeout errors: ${timeout}`);
    console.log(`    Internal errors: ${internalErr}`);
    console.log(`    Downloaded/completed: ${downloaded} / ${completed}`);

    // Extract actual task IDs that were accepted
    const taskIdMatches = content.match(/task_id["\s:]+(\w{20,})/g);
    if (taskIdMatches) {
      const uniqueIds = [...new Set(taskIdMatches)];
      console.log(`    Unique task IDs: ${uniqueIds.length}`);
    }

    // Look for credit/balance related lines
    const creditLines = lines.filter(
      (l) =>
        l.toLowerCase().includes('credit') || l.toLowerCase().includes('balance') || l.toLowerCase().includes('402'),
    );
    if (creditLines.length > 0) {
      console.log(`    Credit-related log lines: ${creditLines.length}`);
      // Show first occurrence
      const firstCredit = creditLines[0];
      console.log(`    First credit issue: ${firstCredit.slice(0, 150)}`);
    }
  }

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
