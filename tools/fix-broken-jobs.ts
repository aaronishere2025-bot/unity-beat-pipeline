import { db } from './server/db';
import { jobs, unityContentPackages } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function fixBrokenJobs() {
  console.log('🔧 Fixing jobs with missing unityMetadata...\n');

  // Get the two broken jobs
  const brokenJobIds = [
    '92c8e564-537c-40df-86b3-cfaf165ff880', // Leonardo
    'c1b22cd8-29de-42fc-8f65-f779bbe03d77', // Saladin
  ];

  for (const jobId of brokenJobIds) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

    if (!job) {
      console.log(`❌ Job ${jobId} not found`);
      continue;
    }

    console.log(`🔍 Found job: ${jobId.substring(0, 8)}...`);
    console.log(`   Package ID: ${job.packageId}`);

    // Get package info
    if (!job.packageId) {
      console.log(`   ⚠️ No package ID, skipping`);
      continue;
    }

    const [pkg] = await db
      .select()
      .from(unityContentPackages)
      .where(eq(unityContentPackages.id, job.packageId))
      .limit(1);

    if (!pkg) {
      console.log(`   ❌ Package not found: ${job.packageId}`);
      continue;
    }

    console.log(`   📦 Found package: ${pkg.topicSummary?.substring(0, 50)}...`);

    // Update job with unityMetadata
    await db
      .update(jobs)
      .set({
        status: 'queued', // Reset to queued
        unityMetadata: {
          packageId: job.packageId,
          promptCount: 0,
          estimatedCost: 0,
          automationSource: 'video-scheduler-fix',
          topic: pkg.topicSummary || 'Historical content',
          videoEngine: 'kling',
          includeKaraoke: true,
          karaokeStyle: 'bounce',
          enableI2V: false,
        },
        errorMessage: null, // Clear error
      })
      .where(eq(jobs.id, jobId));

    console.log(`   ✅ Fixed job ${jobId.substring(0, 8)}...\n`);
  }

  console.log('✨ All jobs fixed! They will be processed when the server picks them up.\n');
  process.exit(0);
}

fixBrokenJobs().catch(console.error);
