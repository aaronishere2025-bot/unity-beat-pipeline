/**
 * Create YouTube Channel Bandit table
 */

import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('📺 Creating YouTube Channel Bandit table...\n');

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS youtube_channel_bandit_arms (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

        channel_id VARCHAR(100) NOT NULL UNIQUE,
        channel_name VARCHAR(200) NOT NULL,
        youtube_channel_id VARCHAR(100) NOT NULL,

        -- Thompson Sampling parameters
        alpha REAL NOT NULL DEFAULT 1.0,
        beta REAL NOT NULL DEFAULT 1.0,
        trials INTEGER NOT NULL DEFAULT 0,
        successes INTEGER NOT NULL DEFAULT 0,

        -- Performance metrics
        avg_views REAL,
        avg_ctr REAL,
        avg_retention REAL,
        avg_likes REAL,
        total_uploads INTEGER NOT NULL DEFAULT 0,

        -- Content type performance
        lofi_success_rate REAL,
        trap_success_rate REAL,
        history_success_rate REAL,

        -- Anti-bot tracking
        consecutive_uses INTEGER NOT NULL DEFAULT 0,
        last_used_at TIMESTAMP,

        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_youtube_channel_bandit_channel_id
      ON youtube_channel_bandit_arms(channel_id)
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_youtube_channel_bandit_last_used
      ON youtube_channel_bandit_arms(last_used_at)
    `);

    console.log('✅ YouTube Channel Bandit table created successfully!\n');
  } catch (error) {
    console.error('❌ Error creating table:', error);
    process.exit(1);
  }

  process.exit(0);
}

main();
