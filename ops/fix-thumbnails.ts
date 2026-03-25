import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

async function fixThumbnails() {
  console.log('🔧 Updating thumbnail URLs...\n');

  await db.execute(
    sql.raw(
      "UPDATE jobs SET thumbnail_url = '/api/thumbnails/13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce_thumb.jpg' WHERE id = '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce'",
    ),
  );
  console.log('✅ Pope Formosus thumbnail updated');

  await db.execute(
    sql.raw(
      "UPDATE jobs SET thumbnail_url = '/api/thumbnails/1efa0a2b-778d-405d-a54d-82abfd96d8d3_thumb.jpg' WHERE id = '1efa0a2b-778d-405d-a54d-82abfd96d8d3'",
    ),
  );
  console.log('✅ Tomoe Gozen thumbnail updated');

  console.log('\n✅ All thumbnails updated!');
  process.exit(0);
}

fixThumbnails().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
