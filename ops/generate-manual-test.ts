import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function generateManualTest() {
  console.log('🎬 Manual test: Generating video for a specific historical figure\n');

  await initializeSecretsFromGCP();

  const { autonomousGoalAgent } = await import('./server/services/autonomous-goal-agent');
  const { storage } = await import('./server/storage');

  try {
    // Test with a lesser-known historical figure
    const testFigure = 'Tomoe Gozen'; // Female samurai warrior
    const testAngle = "Japan's deadliest female samurai beheaded enemies in battle";
    const testHook = "She was the only woman who fought alongside men in ancient Japan's bloodiest wars";

    console.log(`📦 Creating Unity package for: ${testFigure}\n`);

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

    console.log('✅ Package created successfully!');
    console.log(`   Package ID: ${packageResult.packageId}`);
    console.log(`   Figure: ${packageResult.plan.figure}`);

    // Get full package
    const fullPackage = await storage.getUnityContentPackage(packageResult.packageId);
    if (!fullPackage) {
      throw new Error(`Failed to retrieve package: ${packageResult.packageId}`);
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
        automationSource: 'manual-test',
        topic: testFigure,
        hook: testHook,
        videoEngine: 'kling',
        includeKaraoke: true,
        karaokeStyle: 'bounce',
        enableI2V: false,
        enableLipSync: true,
        autoUpload: false, // Don't auto-upload test video
      },
      autoUpload: false,
    });

    console.log('\n✅ Job created successfully!');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Clips to generate: ${fullPackage.packageData.veoPrompts.length}`);
    console.log('\n🎥 Video generation started! Job worker will process this.');
    console.log(`   Monitor at: http://localhost:8080/api/jobs/${job.id}`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateManualTest();
