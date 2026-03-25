import { pool } from './server/db.js';

async function checkAllColumns() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'jobs'
      ORDER BY ordinal_position;
    `);

    console.log('\n📊 All columns in jobs table:\n');
    for (const col of result.rows) {
      const typeInfo = col.character_maximum_length
        ? `${col.data_type}(${col.character_maximum_length})`
        : col.numeric_precision
          ? `${col.data_type}(${col.numeric_precision},${col.numeric_scale})`
          : col.data_type;

      console.log(`   ${col.column_name.padEnd(30)} ${typeInfo}`);
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkAllColumns();
