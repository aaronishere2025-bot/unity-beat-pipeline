// Apply scheduler database migration
import { sql } from 'drizzle-orm';
import { db } from './server/db';

async function applyMigration() {
  console.log('🔧 Applying scheduler migration...');

  try {
    // Add auto_upload column
    await db.execute(sql`
      ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS auto_upload BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('✅ Added auto_upload column');

    // Add uploaded_at column
    await db.execute(sql`
      ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP
    `);
    console.log('✅ Added uploaded_at column');

    // Add youtube_video_id column
    await db.execute(sql`
      ALTER TABLE jobs
      ADD COLUMN IF NOT EXISTS youtube_video_id VARCHAR(20)
    `);
    console.log('✅ Added youtube_video_id column');

    // Create index
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_jobs_auto_upload
      ON jobs(status, auto_upload, uploaded_at)
      WHERE status = 'completed' AND auto_upload = true AND uploaded_at IS NULL
    `);
    console.log('✅ Created index for auto-upload queries');

    // Verify
    const result = await db.execute(sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'jobs'
      AND column_name IN ('auto_upload', 'uploaded_at', 'youtube_video_id')
    `);

    console.log('\n📊 Verified columns:');
    for (const row of result.rows) {
      console.log(
        `   - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable}, default: ${row.column_default})`,
      );
    }

    console.log('\n✅ Migration completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

applyMigration();
