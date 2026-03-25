/**
 * Create multiagent system tables directly
 */

import { sql } from 'drizzle-orm';
import { db } from './server/db';

async function createTables() {
  console.log('Creating multiagent system tables...\n');

  try {
    // Create orchestration_reports table
    console.log('[1/3] Creating orchestration_reports table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS orchestration_reports (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        applied_changes JSON,
        signals JSON,
        conflicts JSON,
        reasoning TEXT,
        execution_time_ms INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'success'
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS orchestration_reports_timestamp_idx ON orchestration_reports(timestamp)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS orchestration_reports_status_idx ON orchestration_reports(status)
    `);
    console.log('✅ orchestration_reports created\n');

    // Create content_plans table
    console.log('[2/3] Creating content_plans table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS content_plans (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        date VARCHAR(10) NOT NULL,
        videos JSON,
        total_cost REAL,
        status VARCHAR(20) NOT NULL DEFAULT 'planned',
        execution_started TIMESTAMP,
        execution_completed TIMESTAMP,
        videos_completed INTEGER DEFAULT 0,
        videos_failed INTEGER DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by VARCHAR(50) DEFAULT 'content-strategy-agent'
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS content_plans_date_idx ON content_plans(date)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS content_plans_status_idx ON content_plans(status)
    `);
    console.log('✅ content_plans created\n');

    // Create system_configuration table
    console.log('[3/3] Creating system_configuration table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_configuration (
        key VARCHAR(100) PRIMARY KEY,
        value JSON,
        description TEXT,
        updated_by VARCHAR(50),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS system_configuration_updated_at_idx ON system_configuration(updated_at)
    `);
    console.log('✅ system_configuration created\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ All multiagent system tables created successfully!');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error: any) {
    console.error('❌ Error creating tables:', error.message);
    throw error;
  }

  process.exit(0);
}

createTables();
