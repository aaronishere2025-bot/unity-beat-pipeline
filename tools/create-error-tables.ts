/**
 * Create error tracking and auto-fix tables
 */

import { sql } from 'drizzle-orm';
import { db } from './server/db';

async function createErrorTables() {
  console.log('Creating error tracking tables...\n');

  try {
    // Create error_reports table
    console.log('[1/3] Creating error_reports table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS error_reports (
        id VARCHAR PRIMARY KEY,
        error_type VARCHAR(50) NOT NULL,
        error_message TEXT NOT NULL,
        severity VARCHAR(20) NOT NULL,
        context JSON,
        fix_attempted BOOLEAN DEFAULT FALSE,
        fix_succeeded BOOLEAN,
        fix_strategy TEXT,
        occurrence_count INTEGER DEFAULT 1,
        first_seen TIMESTAMP NOT NULL,
        last_seen TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'active'
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS error_reports_type_idx ON error_reports(error_type)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS error_reports_severity_idx ON error_reports(severity)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS error_reports_status_idx ON error_reports(status)
    `);

    console.log('✅ error_reports created\n');

    // Create learned_fixes table
    console.log('[2/3] Creating learned_fixes table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS learned_fixes (
        error_pattern VARCHAR(200) PRIMARY KEY,
        fix_strategy JSON NOT NULL,
        confidence REAL DEFAULT 0.5,
        success_count INTEGER DEFAULT 0,
        last_used TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS learned_fixes_confidence_idx ON learned_fixes(confidence DESC)
    `);

    console.log('✅ learned_fixes created\n');

    // Create auto_fix_configs table
    console.log('[3/3] Creating auto_fix_configs table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auto_fix_configs (
        id SERIAL PRIMARY KEY,
        error_type VARCHAR(50) NOT NULL,
        service VARCHAR(100) NOT NULL,
        config_key VARCHAR(100) NOT NULL,
        config_value TEXT,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS auto_fix_configs_error_type_idx ON auto_fix_configs(error_type)
    `);

    console.log('✅ auto_fix_configs created\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ All error tracking tables created successfully!');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error: any) {
    console.error('❌ Error creating tables:', error.message);
    throw error;
  }

  process.exit(0);
}

createErrorTables();
