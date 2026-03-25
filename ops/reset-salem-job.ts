import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const jobId = 'f63ed649-2774-4492-86db-5ca36aef90af';

  // Check current state
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) {
    console.log('Job not found!');
    return;
  }

  console.log('=== SALEM WITCH TRIALS JOB ===');
  console.log('Name:', job.scriptName);
  console.log('Status:', job.status);
  console.log('Music URL:', job.musicUrl);
  console.log('Audio Duration:', job.audioDuration, 'seconds');
  console.log('Error:', job.errorMessage?.slice(0, 300));
  console.log('Progress:', job.progress);

  // Reset to queued so job-worker picks it up
  await db
    .update(jobs)
    .set({
      status: 'queued',
      progress: 0,
      errorMessage: null,
      videoUrl: null,
      thumbnailUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));

  console.log('\n✅ Job reset to queued — job-worker will pick it up');
}
main().catch(console.error);
