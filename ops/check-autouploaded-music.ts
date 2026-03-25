import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { and, eq, isNotNull } from 'drizzle-orm';

console.log('Checking auto-uploaded music jobs...\n');

const uploadedMusic = await db
  .select()
  .from(jobs)
  .where(and(eq(jobs.mode, 'music'), isNotNull(jobs.youtubeVideoId)))
  .limit(5);

console.log(`Found ${uploadedMusic.length} auto-uploaded music videos\n`);

uploadedMusic.forEach((job) => {
  console.log('==========');
  console.log('Name:', job.scriptName);
  console.log('YouTube ID:', job.youtubeVideoId);
  console.log('URL:', job.youtubeUrl);
  console.log('Auto-upload:', job.autoUpload);
  console.log('Script:', job.scriptContent?.substring(0, 100));
  console.log('');
});

if (uploadedMusic.length === 0) {
  console.log('💡 No music videos have been auto-uploaded yet');
  console.log('   Auto-upload is disabled by default (autoUpload: false)');
}
