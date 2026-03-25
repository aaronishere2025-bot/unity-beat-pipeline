import { pool } from './server/db.js';

async function checkCostColumn() {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_name = 'jobs'
      AND column_name = 'cost';
    `);

    console.log('\n💰 Cost column details:\n');
    if (result.rows.length > 0) {
      const col = result.rows[0];
      console.log(`   Column: ${col.column_name}`);
      console.log(`   Type: ${col.data_type}`);
      console.log(`   Precision: ${col.numeric_precision}`);
      console.log(`   Scale: ${col.numeric_scale}`);
      console.log(`   Max Length: ${col.character_maximum_length || 'N/A'}`);
    } else {
      console.log('   ❌ Cost column not found!');
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCostColumn();
