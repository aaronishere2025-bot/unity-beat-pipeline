import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function generateOneVideo() {
  console.log('🎬 Generating 1 video with automatic topic discovery\n');

  await initializeSecretsFromGCP();

  const { topicDiscoveryAgent } = await import('./server/services/topic-discovery-agent');
  const { autonomousGoalAgent } = await import('./server/services/autonomous-goal-agent');
  const { storage } = await import('./server/storage');

  try {
    // Discover 1 unique topic (30-day window to find fresh topics easier)
    console.log('🔍 Discovering unique historical figure (30-day deduplication)...\n');
    const result = await topicDiscoveryAgent.discoverTopics(1, 30, false);

    if (result.topics.length === 0) {
      console.log('❌ No unique topics found even with 30-day window');
      process.exit(1);
    }

    const topic = result.topics[0];
    console.log('✅ Topic discovered!');
    console.log(`   Figure: ${topic.figure}`);
    console.log(`   Hook: "${topic.hook}"`);
    console.log(`   Viral Score: ${topic.viralPotential}/10\n`);

    // Create Unity package
    console.log('🎯 Creating Unity package...\n');
    const packageResult = await autonomousGoalAgent.createPackageFromGoal({
      figure: topic.figure,
      intent: topic.intent,
      constraints: {
        maxDuration: 60,
        aspectRatio: '9:16',
      },
      suggestedAngle: topic.angle,
      suggestedHook: topic.hook,
    });

    console.log('✅ Package created!');
    console.log(`   Package ID: ${packageResult.packageId}\n`);

    // Get full package
    const fullPackage = await storage.getUnityContentPackage(packageResult.packageId);
    if (!fullPackage) {
      throw new Error(`Failed to retrieve package: ${packageResult.packageId}`);
    }

    // Create job
    console.log('🚀 Creating video generation job...\n');
    const job = await storage.createJob({
      scriptName: topic.figure,
      scriptContent: topic.hook,
      mode: 'unity_kling',
      aspectRatio: '9:16',
      unityMetadata: {
        packageId: packageResult.packageId,
        promptCount: fullPackage.packageData.veoPrompts.length,
        estimatedCost: packageResult.plan.estimatedCost,
        automationSource: 'manual-generation',
        topic: topic.topic,
        hook: topic.hook,
        viralScore: topic.viralPotential,
        videoEngine: 'kling',
        includeKaraoke: true,
        karaokeStyle: 'bounce',
        enableLipSync: true,
        autoUpload: false,
      },
      autoUpload: false,
    });

    console.log('✅ Job created successfully!');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Prompts: ${fullPackage.packageData.veoPrompts.length}`);
    console.log(`   Estimated Cost: $${packageResult.plan.estimatedCost}`);
    console.log('\n🎥 Video generation queued! Job worker will process this.');
    console.log(`   Monitor: http://localhost:8080/api/jobs/${job.id}`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateOneVideo();
