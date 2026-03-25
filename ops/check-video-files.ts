import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { existsSync } from 'fs';

const ready = await db
  .select()
  .from(jobs)
  .where(and(eq(jobs.mode, 'music'), eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId)))
  .limit(10);

const lofi = ready.filter((job) => {
  const content = job.scriptContent || '';
  return /lofi|chillhop|jazz hop|lo-fi|study/i.test(content);
});

console.log('Checking video files...\n');

let validCount = 0;
for (const job of lofi) {
  const videoFilename = job.videoUrl?.replace('/api/videos/', '');
  const videoPath = `data/videos/renders/${videoFilename}`;
  const exists = videoFilename && existsSync(videoPath);

  console.log(exists ? '✅' : '❌', job.scriptName);
  if (exists) {
    console.log('   Path:', videoPath);
    validCount++;
  } else {
    console.log('   Missing:', videoPath);
  }
}

console.log(`\n${validCount} videos with valid files`);
