/**
 * Create system_health_snapshots table
 * Run: npx tsx create-health-table.ts
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function createHealthTable() {
  console.log('🔨 Creating system_health_snapshots table...');

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_health_snapshots (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
        overall_status VARCHAR(20) NOT NULL,
        core_apis_status JSONB,
        background_loops_status JSONB,
        system_resources_status JSONB,
        database_status JSONB,
        job_queue_status JSONB,
        error_status JSONB,
        critical_issues JSONB
      )
    `);

    console.log('✅ Created system_health_snapshots table');

    // Create indexes
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS system_health_timestamp_idx
      ON system_health_snapshots(timestamp)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS system_health_overall_status_idx
      ON system_health_snapshots(overall_status)
    `);

    console.log('✅ Created indexes');

    // Verify table exists
    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'system_health_snapshots'
    `);

    if (result.rows.length > 0) {
      console.log('✅ Verified table exists');
    } else {
      console.error('❌ Table creation failed');
      process.exit(1);
    }

    console.log('\n🎉 Database migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

createHealthTable();
