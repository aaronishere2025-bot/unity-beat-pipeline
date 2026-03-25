import { pool } from './server/db.js';

async function checkConstraints() {
  try {
    // Check triggers
    console.log('\n🔧 Triggers on jobs table:\n');
    const triggers = await pool.query(`
      SELECT trigger_name, event_manipulation, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'jobs';
    `);

    if (triggers.rows.length > 0) {
      for (const trigger of triggers.rows) {
        console.log(`   ${trigger.trigger_name}: ${trigger.event_manipulation}`);
        console.log(`      ${trigger.action_statement.substring(0, 100)}...`);
      }
    } else {
      console.log('   No triggers found');
    }

    // Check foreign keys
    console.log('\n🔗 Foreign keys on jobs table:\n');
    const fks = await pool.query(`
      SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'jobs';
    `);

    if (fks.rows.length > 0) {
      for (const fk of fks.rows) {
        console.log(`   ${fk.column_name} -> ${fk.foreign_table_name}.${fk.foreign_column_name}`);
      }
    } else {
      console.log('   No foreign keys found');
    }

    console.log('\n');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkConstraints();
