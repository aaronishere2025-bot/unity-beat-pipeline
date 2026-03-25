import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function addPathColumns() {
  console.log('Adding videoPath and thumbnailPath columns to jobs table...\n');

  try {
    // Check if columns already exist
    const checkVideo = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'jobs' AND column_name = 'video_path'
    `);

    if (checkVideo.rows.length > 0) {
      console.log('✅ video_path column already exists');
    } else {
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN video_path TEXT`);
      console.log('✅ Added video_path column');
    }

    const checkThumb = await db.execute(sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'jobs' AND column_name = 'thumbnail_path'
    `);

    if (checkThumb.rows.length > 0) {
      console.log('✅ thumbnail_path column already exists');
    } else {
      await db.execute(sql`ALTER TABLE jobs ADD COLUMN thumbnail_path TEXT`);
      console.log('✅ Added thumbnail_path column');
    }

    console.log('\n🎉 Schema migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

addPathColumns();
