#!/usr/bin/env tsx
/**
 * Add cost tracking columns to api_usage table
 */

import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function addColumns() {
  console.log('\n========================================');
  console.log('ADDING COST TRACKING COLUMNS');
  console.log('========================================\n');

  const columns = [
    { name: 'model', type: 'VARCHAR(100)', nullable: true },
    { name: 'estimated_cost', type: 'DECIMAL(10, 4)', nullable: true },
    { name: 'input_tokens', type: 'INTEGER', nullable: true },
    { name: 'output_tokens', type: 'INTEGER', nullable: true },
    { name: 'success', type: 'BOOLEAN', nullable: false, default: 'true' },
    { name: 'error_message', type: 'TEXT', nullable: true },
  ];

  for (const col of columns) {
    try {
      console.log(`Adding column: ${col.name} (${col.type})...`);

      let alterSQL = `ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`;
      if (!col.nullable) {
        alterSQL += ` NOT NULL`;
      }
      if (col.default) {
        alterSQL += ` DEFAULT ${col.default}`;
      }

      await db.execute(sql.raw(alterSQL));
      console.log(`  ✅ Added ${col.name}\n`);
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.code === '42701') {
        console.log(`  ⏭️  Column ${col.name} already exists\n`);
      } else {
        console.error(`  ❌ Error adding ${col.name}: ${error.message}\n`);
      }
    }
  }

  // Create indexes
  console.log('Creating indexes...');
  const indexes = [
    'CREATE INDEX IF NOT EXISTS api_usage_job_id_idx ON api_usage(job_id)',
    'CREATE INDEX IF NOT EXISTS api_usage_created_at_idx ON api_usage(created_at)',
    'CREATE INDEX IF NOT EXISTS api_usage_service_idx ON api_usage(service)',
    'CREATE INDEX IF NOT EXISTS api_usage_success_idx ON api_usage(success)',
  ];

  for (const indexSQL of indexes) {
    try {
      await db.execute(sql.raw(indexSQL));
      const indexName = indexSQL.match(/INDEX IF NOT EXISTS (\w+)/)?.[1];
      console.log(`  ✅ Index ${indexName} created\n`);
    } catch (error: any) {
      if (error.message?.includes('already exists')) {
        console.log(`  ⏭️  Index already exists\n`);
      } else {
        console.error(`  ❌ Error: ${error.message}\n`);
      }
    }
  }

  // Verify
  console.log('Verifying columns...');
  const result = await db.execute(
    sql.raw(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'api_usage'
    ORDER BY ordinal_position;
  `),
  );

  console.log('\napi_usage table columns:');
  for (const row of result.rows as any[]) {
    const nullable = row.is_nullable === 'YES' ? '' : 'NOT NULL';
    const defaultVal = row.column_default ? ` DEFAULT ${row.column_default}` : '';
    console.log(`  - ${row.column_name} (${row.data_type}) ${nullable}${defaultVal}`);
  }

  console.log('\n========================================');
  console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
  console.log('========================================\n');
  process.exit(0);
}

addColumns().catch((error) => {
  console.error('\n❌ Migration failed:', error);
  process.exit(1);
});
