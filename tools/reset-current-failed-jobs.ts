import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function resetFailedJobs() {
  console.log('🔄 Resetting failed jobs from background generation...\n');

  const jobsToReset = [
    { id: '48450548-75d5-43e2-998d-586b65a32d64', topic: 'Oppenheimer' },
    { id: '27995ca0-9086-4884-a906-b29675fd1a55', topic: 'Napoleon' },
    { id: 'a30e5745-40f1-4b94-95e6-37fecce23d46', topic: 'Genghis Khan' },
    { id: 'd2bfe546-4dc6-469a-bd54-47d9b2c26bd4', topic: 'Julius Caesar' },
    { id: '46685435-eab1-437a-a231-8db14add6701', topic: 'Winston Churchill' },
  ];

  for (const job of jobsToReset) {
    await db
      .update(jobs)
      .set({
        status: 'queued',
        progress: 0,
        errorMessage: null,
        retryCount: 0,
        completedClips: null, // Clear any partial clips
      })
      .where(eq(jobs.id, job.id));

    console.log(`✅ Reset job: ${job.topic} (${job.id.substring(0, 8)}...)`);
  }

  console.log('\n✨ All 5 jobs reset to queued! Job worker will process them now.\n');
  process.exit(0);
}

resetFailedJobs().catch(console.error);
