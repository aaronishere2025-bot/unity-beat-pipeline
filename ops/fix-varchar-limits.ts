import { pool } from './server/db.js';

/**
 * Fix VARCHAR(20) constraints that caused job completion failures
 *
 * ISSUE: Jobs failed at 100% with error "value too long for type character varying(20)"
 * ROOT CAUSE: Several fields had overly restrictive 20-character limits
 * SOLUTION: Increase limits to reasonable values to prevent future failures
 */
async function fixVarcharLimits() {
  console.log('\n🔧 Fixing VARCHAR constraints in jobs table...\n');

  const migrations = [
    {
      field: 'mode',
      from: 'VARCHAR(20)',
      to: 'VARCHAR(50)',
      reason: 'Allow for longer mode names (e.g., "unity_kling_experimental")',
    },
    {
      field: 'status',
      from: 'VARCHAR(20)',
      to: 'VARCHAR(50)',
      reason: 'Allow for descriptive status values',
    },
    {
      field: 'youtube_video_id',
      from: 'VARCHAR(20)',
      to: 'VARCHAR(50)',
      reason: 'Prevent issues if YouTube changes ID format or if we store additional metadata',
    },
    {
      field: 'aspect_ratio',
      from: 'VARCHAR(10)',
      to: 'VARCHAR(20)',
      reason: 'Allow for more complex aspect ratio formats',
    },
  ];

  try {
    for (const migration of migrations) {
      console.log(`📝 ${migration.field}: ${migration.from} → ${migration.to}`);
      console.log(`   Reason: ${migration.reason}`);

      await pool.query(`
        ALTER TABLE jobs
        ALTER COLUMN ${migration.field} TYPE VARCHAR(${migration.to.match(/\d+/)[0]});
      `);

      console.log(`   ✅ Updated\n`);
    }

    console.log('✅ All VARCHAR constraints updated successfully!\n');
    console.log('📊 Summary:');
    console.log('   - mode: 20 → 50 chars');
    console.log('   - status: 20 → 50 chars');
    console.log('   - youtube_video_id: 20 → 50 chars');
    console.log('   - aspect_ratio: 10 → 20 chars\n');

    console.log('🎯 Expected impact:');
    console.log('   - Prevents "value too long" errors during job completion');
    console.log('   - Allows for future flexibility in field values');
    console.log('   - No data loss or migration needed\n');

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

fixVarcharLimits();
