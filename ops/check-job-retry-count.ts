import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function checkJob() {
  const jobId = '0a53d1aa-daea-4646-a7ae-76a745527920';

  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
  });

  if (!job) {
    console.log('Job not found');
    return;
  }

  console.log('Job Status:', job.status);
  console.log('Retry Count:', job.retryCount);
  console.log('Max Retries:', job.maxRetries);
  console.log('Error:', job.error);
  console.log('Error Message:', job.errorMessage);
  console.log('Completed At:', job.completedAt);
}

checkJob().then(() => process.exit(0));
