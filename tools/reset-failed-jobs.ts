import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function resetFailedJobs() {
  console.log('🔄 Resetting failed jobs to queued...\n');

  const failedJobIds = [
    'c1b22cd8-29de-42fc-8f65-f779bbe03d77', // Saladin
    '92c8e564-537c-40df-86b3-cfaf165ff880', // Leonardo
    '484805fb-4869-4bf3-9e47-7946ebc71152', // Machiavelli
    '5b728a5c-a8aa-4c68-8c07-7f4c56817445', // Julius Caesar
  ];

  for (const jobId of failedJobIds) {
    await db
      .update(jobs)
      .set({
        status: 'queued',
        progress: 0,
        errorMessage: null,
        retryCount: 0,
      })
      .where(eq(jobs.id, jobId));

    console.log(`✅ Reset job: ${jobId.substring(0, 8)}...`);
  }

  console.log('\n✨ All 4 jobs reset to queued! Server will pick them up automatically.\n');
  process.exit(0);
}

resetFailedJobs().catch(console.error);
