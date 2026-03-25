import { initializeSecretsFromGCP } from './server/secret-manager-loader';
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkJob() {
  await initializeSecretsFromGCP();

  const job = await db.select().from(jobs).where(eq(jobs.id, 'f0536869-cc2c-4d5b-9a70-2bd2c755406a')).limit(1);

  if (job[0]) {
    console.log('Job audioDuration:', job[0].audioDuration);
    console.log('Job duration:', job[0].duration);
    console.log('Job status:', job[0].status);
    console.log('Job progress:', job[0].progress);
  } else {
    console.log('Job not found');
  }

  process.exit(0);
}

checkJob().catch(console.error);
