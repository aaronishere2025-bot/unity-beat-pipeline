#!/usr/bin/env tsx
/**
 * Create explored_topics table for Unlimited Topic Explorer Phase 1
 */

import { initializeSecretsFromGCP } from '../server/secret-manager-loader.js';
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function createExploredTopicsTable() {
  console.log('🔧 Creating explored_topics table...\n');

  try {
    await initializeSecretsFromGCP();

    // Create the table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS explored_topics (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

        -- Core Identity
        topic_type VARCHAR(20) NOT NULL,
        primary_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,

        -- Complete 5W1H Context
        five_w1h JSON NOT NULL,

        -- Viral Scoring
        viral_potential INTEGER NOT NULL,
        discovery_angle TEXT NOT NULL,
        visual_appeal INTEGER,

        -- Status Tracking
        status VARCHAR(20) NOT NULL DEFAULT 'discovered',
        used_in_package_id VARCHAR,
        rejection_reason TEXT,

        -- Timestamps
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        used_at TIMESTAMP
      );
    `);

    console.log('✅ Table created: explored_topics\n');

    // Create indexes
    console.log('🔧 Creating indexes...\n');

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS explored_topics_type_idx
      ON explored_topics(topic_type);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS explored_topics_status_idx
      ON explored_topics(status);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS explored_topics_viral_potential_idx
      ON explored_topics(viral_potential);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS explored_topics_created_at_idx
      ON explored_topics(created_at);
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS explored_topics_normalized_name_idx
      ON explored_topics(normalized_name);
    `);

    console.log('✅ All indexes created\n');

    // Verify table exists
    const result = await db.execute(sql`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_name = 'explored_topics';
    `);

    console.log('📊 Table verification:', result);
    console.log('\n✅ Migration complete!\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

createExploredTopicsTable().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
