/**
 * Generate Constantinople 1453 Video
 */

import { unityContentGenerator } from './server/services/unity-content-generator';
import { db } from './server/db';
import { jobs, unityContentPackages } from './shared/schema';

async function generateConstantinople() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  GENERATING: Constantinople 1453');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const topic = 'The fall of Constantinople 1453';
  const message = 'Make it epic and dramatic, focus on the final siege';

  try {
    console.log('🎬 Generating Unity content package...');
    console.log(`   Topic: ${topic}`);
    console.log(`   Style: Epic and dramatic`);
    console.log('');

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
      console.error('❌ Failed to generate package');
      process.exit(1);
    }

    console.log('');
    console.log('✅ Package generated!');
    console.log(`   Actual Duration: ${pkg.actualSongDuration}s`);
    console.log(`   Rounded Duration: ${pkg.roundedDuration}s`);
    console.log(`   Clips: ${pkg.veoPrompts.length}`);
    console.log(`   Cost estimate: $${pkg.timing?.costEstimate?.toFixed(2) || 'N/A'}`);
    console.log('');

    // Save to database
    console.log('💾 Saving to database...');
    const [savedPkg] = await db
      .insert(unityContentPackages)
      .values({
        title: topic,
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

    console.log(`✅ Package saved: ${savedPkg.id}`);
    console.log('');

    // Create job for video generation
    console.log('🎬 Creating video generation job...');
    const [job] = await db
      .insert(jobs)
      .values({
        mode: 'unity_kling',
        scriptName: topic,
        scriptContent: pkg.lyrics.raw,
        unityPackageId: savedPkg.id,
        aspectRatio: '9:16', // YouTube Shorts
        clipDuration: 5, // 5-second clips as requested
        status: 'queued',
      })
      .returning();

    console.log('✅ Job created!');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Mode: ${job.mode}`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  SUCCESS!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('📊 Summary:');
    console.log(`   Package ID: ${savedPkg.id}`);
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Actual Duration: ${pkg.actualSongDuration}s`);
    console.log(`   Rounded Duration: ${pkg.roundedDuration}s`);
    console.log(`   Clips: ${pkg.veoPrompts.length} × 5 seconds`);
    console.log(`   Estimated cost: $${pkg.timing?.costEstimate?.toFixed(2) || 'N/A'}`);
    console.log('');
    console.log('🚀 Next step: Start job worker to process the video:');
    console.log('   tsx server/job-worker.ts');
    console.log('');
  } catch (error: any) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('  ERROR');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');
    console.error(`❌ ${error.message}`);
    console.error('');
    if (error.stack) {
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

generateConstantinople();
