import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function fixJobs() {
  console.log('🔧 Fixing jobs with correct unityMetadata...\n');

  // Map jobs to their packages (from generation output)
  const jobPackageMap = [
    {
      jobId: 'c1b22cd8-29de-42fc-8f65-f779bbe03d77',
      packageId: 'a5fca4cb-324a-4f2e-a0fc-3e8365220c0c',
      topic: 'Saladin: The man who took Jerusalem… then shocked the world by refusing revenge',
    },
    {
      jobId: '92c8e564-537c-40df-86b3-cfaf165ff880',
      packageId: '071679ba-449b-42b7-8d10-8459c5f79145',
      topic: 'Leonardo da Vinci: The anatomy scandal - dissecting human bodies in secret',
    },
    {
      jobId: '484805fb-4869-4bf3-9e47-7946ebc71152',
      packageId: 'a63c7f2a-0c35-42bd-ae4b-21b062648131',
      topic: 'Machiavelli: Describing how power already worked (Church hated him)',
    },
  ];

  for (const { jobId, packageId, topic } of jobPackageMap) {
    console.log(`🔍 Fixing job: ${jobId.substring(0, 8)}...`);
    console.log(`   Package: ${packageId.substring(0, 8)}...`);
    console.log(`   Topic: ${topic.substring(0, 50)}...`);

    await db
      .update(jobs)
      .set({
        status: 'queued', // Reset to queued
        unityMetadata: {
          packageId: packageId,
          promptCount: 20, // Typical for shorts
          estimatedCost: 2,
          automationSource: 'video-scheduler',
          topic: topic,
          videoEngine: 'kling',
          includeKaraoke: true,
          karaokeStyle: 'bounce',
          enableI2V: false,
        },
        errorMessage: null, // Clear error
        retryCount: 0, // Reset retry count
      })
      .where(eq(jobs.id, jobId));

    console.log(`   ✅ Fixed!\n`);
  }

  console.log('✨ All 3 jobs fixed and ready to process!\n');
  console.log('💡 The server will automatically pick them up and start processing.\n');
  process.exit(0);
}

fixJobs().catch(console.error);
