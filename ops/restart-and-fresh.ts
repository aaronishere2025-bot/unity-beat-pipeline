#!/usr/bin/env tsx
import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function main() {
  console.log('🔄 Restarting jobs + creating fresh test...\n');
  await initializeSecretsFromGCP();

  const { db } = await import('./server/db');
  const { jobs } = await import('./shared/schema');
  const { eq } = await import('drizzle-orm');
  const { autonomousGoalAgent } = await import('./server/services/autonomous-goal-agent');
  const { storage } = await import('./server/storage');

  // ============================================
  // 1. RESTART THE 2 PROCESSING JOBS
  // ============================================
  const jobIds = [
    '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce', // Pope Formosus
    '1efa0a2b-778d-405d-a54d-82abfd96d8d3', // Tomoe Gozen
  ];

  console.log('━━━ RESTARTING EXISTING JOBS ━━━\n');

  for (const jobId of jobIds) {
    const job = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .then((r) => r[0]);
    if (!job) continue;

    console.log(`🔄 Restarting: ${job.scriptName}`);

    // Full reset - clear everything except music and Unity package
    await db
      .update(jobs)
      .set({
        status: 'queued',
        progress: 0,
        error: null,
        completedClips: [],
        totalCost: 0,
      })
      .where(eq(jobs.id, jobId));

    console.log(`   ✅ Reset to queued (will reuse existing music)\n`);
  }

  // ============================================
  // 2. CREATE FRESH TEST JOB
  // ============================================
  console.log('\n━━━ CREATING FRESH TEST JOB ━━━\n');

  const testFigure = 'Simo Häyhä'; // The White Death - Finnish sniper
  const testAngle = 'The deadliest sniper in history who killed 500+ enemies in 100 days';
  const testHook = 'One man. One rifle. 500 confirmed kills in freezing winter.';

  console.log(`📦 Creating Unity package: ${testFigure}\n`);

  const packageResult = await autonomousGoalAgent.createPackageFromGoal({
    figure: testFigure,
    intent: 'viral',
    constraints: {
      maxDuration: 60,
      aspectRatio: '9:16',
    },
    suggestedAngle: testAngle,
    suggestedHook: testHook,
  });

  console.log('✅ Package created!');
  console.log(`   Package ID: ${packageResult.packageId}\n`);

  // Get full package
  const fullPackage = await storage.getUnityContentPackage(packageResult.packageId);
  if (!fullPackage) {
    throw new Error('Failed to retrieve package');
  }

  // Create job
  const job = await storage.createJob({
    scriptName: testFigure,
    scriptContent: testHook,
    mode: 'unity_kling',
    aspectRatio: '9:16',
    unityMetadata: {
      packageId: packageResult.packageId,
      promptCount: fullPackage.packageData.veoPrompts.length,
      estimatedCost: packageResult.plan.estimatedCost,
      automationSource: 'fresh-test-with-credits',
      topic: testFigure,
      hook: testHook,
      videoEngine: 'kling',
      includeKaraoke: true,
      karaokeStyle: 'bounce',
      enableI2V: false,
      enableLipSync: true,
      autoUpload: false,
    },
    autoUpload: false,
  });

  console.log('✅ Fresh test job created!');
  console.log(`   Job ID: ${job.id}`);
  console.log(`   Clips: ${fullPackage.packageData.veoPrompts.length}`);
  console.log(`   Est Cost: $${packageResult.plan.estimatedCost}\n`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n✅ ALL DONE!');
  console.log('\n📊 Status:');
  console.log('   - 2 jobs restarted (Pope Formosus, Tomoe Gozen)');
  console.log(`   - 1 fresh job created (${testFigure})`);
  console.log('   - 3 jobs queued for processing');
  console.log('\n🎬 Job worker will pick them up in ~5-10 seconds');
  console.log('💰 Now that credits are added, clips should generate!');
}

main().catch(console.error);
