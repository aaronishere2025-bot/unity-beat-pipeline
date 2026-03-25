import { initializeSecretsFromGCP } from './server/secret-manager-loader';
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq } from 'drizzle-orm';

async function checkJob() {
  await initializeSecretsFromGCP();

  const job = await db.select().from(jobs).where(eq(jobs.id, '1321b574-3922-4fd3-b278-c07041e25147')).limit(1);

  if (job.length === 0) {
    console.log('❌ Job not found');
    process.exit(1);
  }

  const j = job[0];
  console.log('\n📊 Emu War Job Status:\n');
  console.log(`   Status: ${j.status}`);
  console.log(`   Progress: ${j.progress || 0}%`);
  console.log(`   Completed Clips: ${j.completedClips?.length || 0}`);
  if (j.currentStep) console.log(`   Current Step: ${j.currentStep}`);
  console.log();

  process.exit(0);
}

checkJob().catch(console.error);
