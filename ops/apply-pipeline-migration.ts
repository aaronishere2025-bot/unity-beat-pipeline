/**
 * Apply Pipeline Orchestrator Migration
 *
 * This script creates the pipeline_state and pipeline_locks tables
 */

import { pool } from './server/db';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyMigration() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      APPLYING PIPELINE ORCHESTRATOR MIGRATION              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Read migration file
    const migrationPath = join(process.cwd(), 'migrations', 'add_pipeline_orchestrator_tables.sql');
    const migrationSql = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded\n');
    console.log('━━━ Creating tables ━━━\n');

    // Execute migration
    await pool.query(migrationSql);

    console.log('✅ Migration applied successfully!\n');
    console.log('Created tables:');
    console.log('  • pipeline_state - Tracks stage execution history');
    console.log('  • pipeline_locks - Manages distributed locking\n');

    // Verify tables exist
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('pipeline_state', 'pipeline_locks')
      ORDER BY table_name
    `);

    console.log('✓ Verification:');
    for (const row of result.rows) {
      console.log(`  • ${row.table_name} exists`);
    }

    console.log('\n🎉 Migration complete! Pipeline Orchestrator is ready.\n');
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

applyMigration();
