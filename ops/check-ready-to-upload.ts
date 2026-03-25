import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, and, isNull } from 'drizzle-orm';

console.log('Checking what will be uploaded...\n');

// Find completed music videos without YouTube IDs
const ready = await db
  .select()
  .from(jobs)
  .where(and(eq(jobs.mode, 'music'), eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId)))
  .limit(10);

// Filter for lofi
const lofi = ready.filter((job) => {
  const content = job.scriptContent || '';
  return /lofi|chillhop|jazz hop|lo-fi|study/i.test(content);
});

console.log(`Completed music videos: ${ready.length}`);
console.log(`Completed lofi videos: ${lofi.length}\n`);

if (lofi.length > 0) {
  console.log('Ready to upload:');
  lofi.forEach((job) => {
    const duration = Math.floor((job.duration || 0) / 60);
    console.log(`  - ${job.scriptName} (${duration} min)`);
  });
} else {
  console.log('❌ No lofi videos ready to upload');
  console.log('   The job we just created is still processing');
  console.log('   Wait ~10-15 minutes for Suno to generate the music');
}
