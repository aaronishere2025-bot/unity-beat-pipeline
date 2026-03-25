import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('=== FULL KLING/KIE.AI CREDIT AUDIT ===\n');

  // 1. Check all tables that exist
  const tables = await db.execute(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name ILIKE '%cost%' OR table_name ILIKE '%api%' OR table_name ILIKE '%track%'
    OR table_name ILIKE '%kling%' OR table_name ILIKE '%credit%'
    ORDER BY table_name
  `);
  console.log('=== RELEVANT TABLES ===');
  for (const t of tables.rows) console.log(' ', (t as any).table_name);

  // 2. Check api_cost_tracker if it exists
  try {
    const allProviders = await db.execute(sql`
      SELECT DISTINCT provider, model FROM api_cost_tracker ORDER BY provider, model
    `);
    console.log('\n=== ALL PROVIDERS IN COST TRACKER ===');
    for (const r of allProviders.rows) console.log(`  ${(r as any).provider} / ${(r as any).model}`);

    // Kling-specific costs
    const klingCosts = await db.execute(sql`
      SELECT DATE(created_at) as day, provider, model,
             COUNT(*) as calls,
             COALESCE(SUM(CAST(cost_usd AS NUMERIC)), 0) as total_cost
      FROM api_cost_tracker
      WHERE provider ILIKE '%kling%' OR provider ILIKE '%kie%' OR model ILIKE '%kling%'
      GROUP BY DATE(created_at), provider, model
      ORDER BY day DESC
    `);
    console.log('\n=== KLING COSTS BY DAY ===');
    for (const r of klingCosts.rows) {
      const row = r as any;
      console.log(`  ${row.day} | ${row.provider}/${row.model} | ${row.calls} calls | $${row.total_cost}`);
    }

    // ALL costs in last 3 days
    const recentAll = await db.execute(sql`
      SELECT DATE(created_at) as day, provider,
             COUNT(*) as calls,
             COALESCE(SUM(CAST(cost_usd AS NUMERIC)), 0) as total_cost
      FROM api_cost_tracker
      WHERE created_at > NOW() - INTERVAL '3 days'
      GROUP BY DATE(created_at), provider
      ORDER BY day DESC, total_cost DESC
    `);
    console.log('\n=== ALL API COSTS LAST 3 DAYS ===');
    for (const r of recentAll.rows) {
      const row = r as any;
      console.log(`  ${row.day} | ${row.provider} | ${row.calls} calls | $${row.total_cost}`);
    }
  } catch (e: any) {
    console.log('api_cost_tracker query error:', e.message);
  }

  // 3. Check all jobs from last 3 days with clip info
  try {
    const recentJobs = await db.execute(sql`
      SELECT id, script_name, mode, status, progress, clip_count,
             cost, audio_duration, error_message,
             created_at, updated_at
      FROM jobs
      WHERE created_at > NOW() - INTERVAL '3 days'
      ORDER BY created_at DESC
    `);
    console.log('\n=== ALL JOBS LAST 3 DAYS ===');
    for (const r of recentJobs.rows) {
      const row = r as any;
      console.log(`  ${row.created_at} | ${row.mode} | ${row.status} | ${row.script_name}`);
      console.log(`    clips: ${row.clip_count} | cost: $${row.cost} | progress: ${row.progress}%`);
      if (row.error_message) console.log(`    error: ${row.error_message.slice(0, 150)}`);
    }
  } catch (e: any) {
    console.log('jobs query error:', e.message);
  }

  // 4. Check for kling-specific tables
  try {
    const klingTables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      AND (table_name ILIKE '%kling%' OR table_name ILIKE '%video_gen%' OR table_name ILIKE '%clip%')
    `);
    console.log('\n=== KLING-RELATED TABLES ===');
    for (const t of klingTables.rows) console.log(' ', (t as any).table_name);
  } catch (e: any) {}

  // 5. Check for any resume records (multi-shot tracking)
  try {
    const resumeData = await db.execute(sql`
      SELECT * FROM information_schema.columns
      WHERE table_name = 'jobs'
      AND column_name ILIKE '%resume%' OR column_name ILIKE '%kling%' OR column_name ILIKE '%clip%'
    `);
    console.log('\n=== KLING-RELATED JOB COLUMNS ===');
    for (const r of resumeData.rows) console.log(' ', (r as any).column_name);
  } catch (e: any) {}

  // 6. Look at job metadata/extras for kling task IDs
  try {
    const jobCols = await db.execute(sql`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'jobs' ORDER BY ordinal_position
    `);
    console.log('\n=== ALL JOB COLUMNS ===');
    const cols = jobCols.rows.map((r: any) => r.column_name);
    console.log(cols.join(', '));
  } catch (e: any) {}

  // 7. Check kling API calls via any metadata column
  try {
    const metadataJobs = await db.execute(sql`
      SELECT id, script_name, mode, status, clip_count, cost,
             video_generation_metadata, created_at
      FROM jobs
      WHERE mode = 'unity_kling' AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
    `);
    console.log('\n=== UNITY_KLING JOBS LAST 7 DAYS ===');
    for (const r of metadataJobs.rows) {
      const row = r as any;
      console.log(`\n  Job: ${row.script_name} (${row.id.slice(0, 8)})`);
      console.log(`  Status: ${row.status} | Clips: ${row.clip_count} | Cost: $${row.cost}`);
      console.log(`  Created: ${row.created_at}`);
      if (row.video_generation_metadata) {
        const meta =
          typeof row.video_generation_metadata === 'string'
            ? JSON.parse(row.video_generation_metadata)
            : row.video_generation_metadata;
        console.log(`  Metadata keys: ${Object.keys(meta).join(', ')}`);
        if (meta.klingTaskIds) console.log(`  Kling task IDs: ${meta.klingTaskIds.length} tasks`);
        if (meta.clipResults) console.log(`  Clip results: ${meta.clipResults.length} entries`);
        if (meta.totalKlingCredits) console.log(`  Tracked credits: ${meta.totalKlingCredits}`);
      }
    }
  } catch (e: any) {
    console.log('metadata query error:', e.message);
  }

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
