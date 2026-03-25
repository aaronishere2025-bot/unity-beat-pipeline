import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const jobId = '77da3ada-3014-4e8b-8007-eb46c19c8458';
const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

if (job.length === 0) {
  console.log('Job not found');
  process.exit(1);
}

const j = job[0];
console.log('Job Details:');
console.log('====================');
console.log('ID:', j.id);
console.log('Name:', j.scriptName);
console.log('Status:', j.status);
console.log('Mode:', j.mode);
console.log('Progress:', j.progress);
console.log('Cost:', j.cost);
console.log('Created:', j.createdAt);
console.log('Updated:', j.updatedAt);
console.log('\nPaths:');
console.log('- Audio URL:', j.audioUrl);
console.log('- Video URL:', j.videoUrl);
console.log('- Rendered Video:', j.renderedVideoPath);
console.log('- Thumbnail:', j.thumbnailUrl);
console.log('\nYouTube:');
console.log('- Upload Status:', j.youtubeUploadStatus);
console.log('- Video ID:', j.youtubeVideoId);
console.log('- Auto Upload:', j.autoUpload);
console.log('\nError:');
console.log(j.error || '(No error message)');
console.log('\nPrompts:');
console.log(j.prompts);
