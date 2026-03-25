import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function fixScheduledTimeColumn() {
  try {
    console.log('🔧 Adding scheduled_time column to jobs table...');

    // Check if column exists
    const checkColumn = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'jobs'
        AND column_name = 'scheduled_time'
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✅ Column scheduled_time already exists');
      return;
    }

    // Add the column
    await db.execute(sql`
      ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS scheduled_time TIMESTAMP
    `);

    console.log('✅ Successfully added scheduled_time column');

    // Verify
    const verify = await db.execute(sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'jobs'
        AND column_name = 'scheduled_time'
    `);

    console.log('Verification:', verify.rows);
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

fixScheduledTimeColumn()
  .then(() => {
    console.log('✅ Migration complete');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
