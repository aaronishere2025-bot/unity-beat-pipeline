import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const jobId = '77da3ada-3014-4e8b-8007-eb46c19c8458';
const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

if (job.length > 0) {
  const j = job[0];
  console.log('Job Details:');
  console.log('  Name:', j.scriptName);
  console.log('  Mode:', j.mode);
  console.log('  Auto-upload:', j.autoUpload);
  console.log('  YouTube Video ID:', j.youtubeVideoId);
  console.log('  YouTube URL:', j.youtubeUrl);
  console.log('  Script Content:', j.scriptContent?.substring(0, 200));
  console.log('\nUnity Metadata:', JSON.stringify(j.unityMetadata, null, 2));
}
