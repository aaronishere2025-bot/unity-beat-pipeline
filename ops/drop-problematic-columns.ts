#!/usr/bin/env tsx
/**
 * Drop estimated_cost and budget_limit columns from jobs table
 * TEMPORARY FIX: These columns are causing Drizzle ORM issues
 */

import { db } from './server/db.js';
import { sql } from 'drizzle-orm';
import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';

async function dropColumns() {
  console.log('🔧 Loading secrets from Google Secret Manager...');
  await initializeSecretsFromGCP();

  console.log('🗑️  Dropping estimated_cost and budget_limit columns from jobs table...');

  try {
    // Drop both columns in a single ALTER TABLE statement
    await db.execute(sql`
      ALTER TABLE jobs
      DROP COLUMN IF EXISTS estimated_cost,
      DROP COLUMN IF EXISTS budget_limit;
    `);

    console.log('✅ Columns dropped successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. The schema.ts file has been updated to comment out these fields');
    console.log('2. The job-worker.ts budget check has been disabled');
    console.log('3. You can now test the pipeline without these columns blocking');
    console.log('');
    console.log('To restore these columns later, you will need to:');
    console.log('- Uncomment the fields in shared/schema.ts');
    console.log('- Run: npm run db:push');
    console.log('- Uncomment the budget check in server/services/job-worker.ts');
  } catch (error: any) {
    console.error('❌ Error dropping columns:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

dropColumns();
