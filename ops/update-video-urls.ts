import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

async function updateVideoUrls() {
  const rendersDir = path.join(process.cwd(), 'data', 'videos', 'renders');
  const files = fs.readdirSync(rendersDir);

  // Find the latest audio versions for each job
  const popeFiles = files.filter((f) => f.includes('13f8da7f') && f.includes('audio')).sort();
  const tomoeFiles = files.filter((f) => f.includes('1efa0a2b') && f.includes('audio')).sort();

  const popeLatest = popeFiles[popeFiles.length - 1];
  const tomoeLatest = tomoeFiles[tomoeFiles.length - 1];

  console.log('🔧 Updating video URLs in database...\n');

  if (popeLatest) {
    const videoUrl = `/api/videos/${popeLatest}`;
    console.log(`Pope Formosus: ${videoUrl}`);

    await db.update(jobs).set({ video_url: videoUrl }).where(eq(jobs.id, '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce'));

    console.log('   ✅ Updated');
  }

  if (tomoeLatest) {
    const videoUrl = `/api/videos/${tomoeLatest}`;
    console.log(`\nTomoe Gozen: ${videoUrl}`);

    await db.update(jobs).set({ video_url: videoUrl }).where(eq(jobs.id, '1efa0a2b-778d-405d-a54d-82abfd96d8d3'));

    console.log('   ✅ Updated');
  }

  console.log('\n✅ Database updated!');
  process.exit(0);
}

updateVideoUrls().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
