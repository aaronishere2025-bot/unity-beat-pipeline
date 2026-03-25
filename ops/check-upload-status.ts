import { initializeSecretsFromGCP } from './server/secret-manager-loader';
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq, desc } from 'drizzle-orm';

async function checkUploads() {
  await initializeSecretsFromGCP();

  // Get recent completed jobs
  const recentJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, 'completed'))
    .orderBy(desc(jobs.createdAt))
    .limit(5);

  console.log('\n📊 Recent Completed Jobs:\n');

  for (const job of recentJobs) {
    console.log(`📺 ${job.scriptName} (${job.id.substring(0, 8)}...)`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Completed: ${job.updatedAt}`);
    console.log(`   Video URL: ${job.videoUrl || '❌ None'}`);
    console.log(`   YouTube ID: ${job.youtubeVideoId || '❌ Not uploaded'}`);
    console.log(`   Auto Upload: ${job.autoUpload ? '✅ Yes' : '❌ No'}`);

    if (job.error) {
      console.log(`   ❌ Error: ${job.error}`);
    }

    console.log();
  }

  process.exit(0);
}

checkUploads().catch(console.error);
