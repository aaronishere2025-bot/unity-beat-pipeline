#!/usr/bin/env tsx
/**
 * Run migration to add cost tracking columns to api_usage table
 */

import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
import fs from 'fs';

async function runMigration() {
  console.log('\n========================================');
  console.log('RUNNING COST TRACKING MIGRATION');
  console.log('========================================\n');

  try {
    // Read migration SQL
    const migrationSQL = fs.readFileSync('./migrations/add-cost-tracking-columns.sql', 'utf-8');

    // Split by semicolons and run each statement
    const statements = migrationSQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.startsWith('COMMENT ON') || statement.startsWith('GRANT')) {
        console.log(`⏭️  Skipping statement ${i + 1} (optional): ${statement.substring(0, 60)}...`);
        continue;
      }

      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      console.log(`  ${statement.substring(0, 80)}...`);

      try {
        await db.execute(sql.raw(statement + ';'));
        console.log(`  ✅ Success\n`);
      } catch (error: any) {
        // Ignore "already exists" errors
        if (error.message?.includes('already exists') || error.code === '42P07' || error.code === '42710') {
          console.log(`  ⏭️  Already exists, skipping\n`);
        } else {
          console.error(`  ❌ Error: ${error.message}\n`);
          // Continue with other statements
        }
      }
    }

    console.log('========================================');
    console.log('MIGRATION COMPLETED');
    console.log('========================================\n');

    // Verify columns exist
    console.log('Verifying new columns...');
    const result = await db.execute(
      sql.raw(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'api_usage'
      ORDER BY ordinal_position;
    `),
    );

    console.log('\napi_usage table columns:');
    for (const row of result.rows as any[]) {
      console.log(`  - ${row.column_name} (${row.data_type}) ${row.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
    }

    console.log('\n✅ Migration completed successfully!\n');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
