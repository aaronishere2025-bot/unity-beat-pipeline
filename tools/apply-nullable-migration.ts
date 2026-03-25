import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function applyMigration() {
  console.log('📝 Making script_name and script_content nullable...\n');

  try {
    // Make script_name nullable
    await db.execute(sql`ALTER TABLE jobs ALTER COLUMN script_name DROP NOT NULL`);
    console.log('✅ script_name is now nullable');

    // Make script_content nullable
    await db.execute(sql`ALTER TABLE jobs ALTER COLUMN script_content DROP NOT NULL`);
    console.log('✅ script_content is now nullable');

    console.log('\n✨ Migration applied successfully!');
    console.log('   Unity kling jobs can now be created without script fields\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }

  process.exit(0);
}

applyMigration();
