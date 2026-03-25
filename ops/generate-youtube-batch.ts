/**
 * Generate YouTube Videos Batch
 * Creates multiple Unity videos ready for YouTube upload
 */

import { unityContentGenerator } from './server/services/unity-content-generator';
import { db } from './server/db';
import { jobs, unityContentPackages } from './shared/schema';

const VIDEO_TOPICS = [
  {
    topic: 'The fall of Constantinople 1453',
    message: 'Make it epic and dramatic, focus on the final siege',
  },
  {
    topic: 'The building of the Great Pyramid',
    message: 'Show the engineering marvel and human achievement',
  },
  {
    topic: 'The American Revolution Declaration of Independence',
    message: 'Dramatic and inspiring, focus on freedom',
  },
  {
    topic: 'The Battle of Thermopylae - 300 Spartans',
    message: 'Epic battle, heroic last stand',
  },
];

async function generateYouTubeBatch() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  GENERATING YOUTUBE VIDEO BATCH');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const results = [];

  for (let i = 0; i < VIDEO_TOPICS.length; i++) {
    const { topic, message } = VIDEO_TOPICS[i];
    console.log(`\n[${i + 1}/${VIDEO_TOPICS.length}] Generating: ${topic}`);
    console.log('─────────────────────────────────────────────────────────────');

    try {
      // Generate Unity content package
      const pkg = await unityContentGenerator.generateCompletePackage({
        topic,
        message,
        targetDuration: 60,
        maxDuration: 180,
        visualStyle: 'cinematic',
        visualStyleV2: 'v2.0: cinematic',
        setting: 'contrast',
      });

      if (!pkg) {
        console.error(`❌ Failed to generate package`);
        results.push({ topic, status: 'failed', error: 'Package generation returned null' });
        continue;
      }

      console.log(`✅ Package generated (${pkg.timing.estimatedDuration}s)`);

      // Save to database
      const [savedPkg] = await db
        .insert(unityContentPackages)
        .values({
          title: topic, // Database requires title field
          topic,
          lyrics: pkg.lyrics,
          sunoStyleTags: pkg.sunoStyleTags,
          characterCast: pkg.characterCast,
          veoPrompts: pkg.veoPrompts,
          timing: pkg.timing,
          metadata: pkg.metadata,
          deepResearch: pkg.deepResearch || null,
          isHistoricalContent: pkg.isHistoricalContent || false,
          status: 'preparing',
        })
        .returning();

      console.log(`💾 Saved package: ${savedPkg.id}`);

      // Create job for video generation
      const [job] = await db
        .insert(jobs)
        .values({
          mode: 'unity_kling',
          scriptName: topic,
          scriptContent: pkg.lyrics.raw,
          unityPackageId: savedPkg.id,
          aspectRatio: '9:16', // YouTube Shorts
          clipDuration: 6,
          status: 'queued',
        })
        .returning();

      console.log(`🎬 Created job: ${job.id}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Mode: ${job.mode}`);

      results.push({
        topic,
        status: 'queued',
        jobId: job.id,
        packageId: savedPkg.id,
      });
    } catch (error: any) {
      console.error(`❌ Error: ${error.message}`);
      results.push({ topic, status: 'error', error: error.message });
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  BATCH GENERATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const successful = results.filter((r) => r.status === 'queued').length;
  const failed = results.length - successful;

  console.log(`✅ Successful: ${successful}/${VIDEO_TOPICS.length}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
  }

  console.log('');
  console.log('RESULTS:');
  for (const result of results) {
    const icon = result.status === 'queued' ? '✅' : '❌';
    console.log(`  ${icon} ${result.topic}`);
    if (result.jobId) {
      console.log(`     Job ID: ${result.jobId}`);
    }
  }

  console.log('');
  console.log('Jobs are now queued. Start job worker to process:');
  console.log('  tsx server/job-worker.ts');
}

generateYouTubeBatch().catch((error) => {
  console.error('❌ Batch generation failed:', error);
  process.exit(1);
});
