/**
 * MIGRATION SCRIPT: Add AI Analysis and Resolution fields to error_reports
 * Run with: npx tsx migrate-error-reports.ts
 */

import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function migrateErrorReports() {
  console.log('[Migration] Adding AI Analysis and Resolution fields to error_reports...');

  try {
    // Add AI Analysis JSON field
    await db.execute(sql`
      ALTER TABLE error_reports
      ADD COLUMN IF NOT EXISTS ai_analysis JSON
    `);
    console.log('[Migration] ✓ Added ai_analysis column');

    // Add resolution tracking fields
    await db.execute(sql`
      ALTER TABLE error_reports
      ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT false
    `);
    console.log('[Migration] ✓ Added resolved column');

    await db.execute(sql`
      ALTER TABLE error_reports
      ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP
    `);
    console.log('[Migration] ✓ Added resolved_at column');

    await db.execute(sql`
      ALTER TABLE error_reports
      ADD COLUMN IF NOT EXISTS resolved_by VARCHAR(100)
    `);
    console.log('[Migration] ✓ Added resolved_by column');

    await db.execute(sql`
      ALTER TABLE error_reports
      ADD COLUMN IF NOT EXISTS resolved_notes TEXT
    `);
    console.log('[Migration] ✓ Added resolved_notes column');

    // Add markdown report field
    await db.execute(sql`
      ALTER TABLE error_reports
      ADD COLUMN IF NOT EXISTS markdown_report TEXT
    `);
    console.log('[Migration] ✓ Added markdown_report column');

    // Add indexes for faster queries
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS error_reports_resolved_idx
      ON error_reports(resolved)
    `);
    console.log('[Migration] ✓ Added resolved index');

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS error_reports_resolved_at_idx
      ON error_reports(resolved_at)
    `);
    console.log('[Migration] ✓ Added resolved_at index');

    console.log('[Migration] ✅ Migration completed successfully!');
  } catch (error: any) {
    console.error('[Migration] ❌ Migration failed:', error.message);
    throw error;
  }
}

// Run migration
migrateErrorReports()
  .then(() => {
    console.log('[Migration] Done. You can now use the enhanced error_reports table.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[Migration] Fatal error:', error);
    process.exit(1);
  });
