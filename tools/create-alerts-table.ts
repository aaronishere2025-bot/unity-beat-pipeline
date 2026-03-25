/**
 * Create alerts table
 */

import { sql } from 'drizzle-orm';
import { db } from '../server/db.js';

async function createAlertsTable() {
  console.log('Creating alerts table...\n');

  try {
    console.log('[1/1] Creating alerts table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS alerts (
        id VARCHAR(50) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        metadata JSON,
        resolved BOOLEAN DEFAULT FALSE,
        resolved_at TIMESTAMP,
        resolved_by VARCHAR(100),
        resolution_notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        deduplication_key VARCHAR(200) NOT NULL,
        last_triggered TIMESTAMP DEFAULT NOW(),
        trigger_count INTEGER DEFAULT 1
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS alerts_type_idx ON alerts(type)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS alerts_severity_idx ON alerts(severity)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS alerts_resolved_idx ON alerts(resolved)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS alerts_created_at_idx ON alerts(created_at DESC)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS alerts_deduplication_idx ON alerts(deduplication_key)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS alerts_last_triggered_idx ON alerts(last_triggered DESC)
    `);

    console.log('✅ alerts table created\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Alerts table created successfully!');
    console.log('═══════════════════════════════════════════════════════════');
  } catch (error: any) {
    console.error('❌ Error creating table:', error.message);
    throw error;
  }

  process.exit(0);
}

createAlertsTable();
