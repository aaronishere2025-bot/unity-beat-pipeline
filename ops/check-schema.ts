import { pool } from './server/db.js';

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length
      FROM information_schema.columns
      WHERE table_name = 'jobs'
      AND data_type LIKE '%character%'
      ORDER BY column_name;
    `);

    console.log('\n📊 VARCHAR/CHARACTER fields in jobs table:\n');
    for (const row of result.rows) {
      console.log(`   ${row.column_name}: ${row.data_type}(${row.character_maximum_length || 'unlimited'})`);
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkSchema();
