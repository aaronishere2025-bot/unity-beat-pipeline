/**
 * Create trending_topics table migration
 *
 * Run with: npx tsx tools/create-trending-topics-table.ts
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function createTrendingTopicsTable() {
  console.log('🔨 Creating trending_topics table...\n');

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trending_topics (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        keyword TEXT NOT NULL,
        normalized_keyword TEXT NOT NULL,
        source VARCHAR(50) NOT NULL,

        -- Search Opportunity Metrics
        search_volume INTEGER,
        competition_level VARCHAR(20),
        search_content_ratio DECIMAL(10, 2),
        trend_velocity INTEGER,

        -- Content Analysis
        suggested_angle TEXT,
        historical_category VARCHAR(20),
        related_keywords TEXT[],
        estimated_viral_potential INTEGER,

        -- Source-Specific Metadata
        source_metadata JSONB,

        -- Historical Context
        why_trending TEXT,
        content_gap TEXT,

        -- Lifecycle Management
        status VARCHAR(20) DEFAULT 'discovered',
        used_in_package_id VARCHAR,
        discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    console.log('✅ Table created successfully\n');

    // Create indexes
    console.log('🔨 Creating indexes...\n');

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS trending_topics_source_idx ON trending_topics(source);
    `);
    console.log('   ✅ trending_topics_source_idx');

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS trending_topics_status_idx ON trending_topics(status);
    `);
    console.log('   ✅ trending_topics_status_idx');

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS trending_topics_viral_potential_idx ON trending_topics(estimated_viral_potential);
    `);
    console.log('   ✅ trending_topics_viral_potential_idx');

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS trending_topics_discovered_at_idx ON trending_topics(discovered_at);
    `);
    console.log('   ✅ trending_topics_discovered_at_idx');

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS trending_topics_expires_at_idx ON trending_topics(expires_at);
    `);
    console.log('   ✅ trending_topics_expires_at_idx');

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS trending_topics_normalized_keyword_idx ON trending_topics(normalized_keyword);
    `);
    console.log('   ✅ trending_topics_normalized_keyword_idx');

    console.log('\n✅ All indexes created successfully\n');
    console.log('🎉 Migration complete!\n');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

createTrendingTopicsTable();
