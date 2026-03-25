import { initializeSecretsFromGCP } from './server/secret-manager-loader';

async function generateWithDiscovery() {
  console.log('🔐 Loading secrets...');
  await initializeSecretsFromGCP();
  console.log('✅ Secrets loaded\n');

  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   GENERATING VIDEO WITH AUTOMATIC TOPIC DISCOVERY         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const { topicDiscoveryAgent } = await import('./server/services/topic-discovery-agent');
  const { autonomousGoalAgent } = await import('./server/services/autonomous-goal-agent');
  const { storage } = await import('./server/storage');

  try {
    // Step 1: Discover fresh topic
    console.log('🔍 Step 1: Discovering fresh topic (with 90-day deduplication)...\n');
    const result = await topicDiscoveryAgent.discoverTopics(1, 90, false);

    if (result.topics.length === 0) {
      console.log('❌ No fresh topics found (all recent topics exhausted)');
      process.exit(1);
    }

    const topic = result.topics[0];
    console.log('✅ Topic discovered!');
    console.log(`   Figure: ${topic.figure}`);
    console.log(`   Hook: "${topic.hook}"`);
    console.log(`   Viral Score: ${topic.viralPotential}/10`);
    console.log(`   Recent topics filtered: ${result.filteredCount}\n`);

    // Step 2: Create Unity package
    console.log('🎯 Step 2: Creating Unity package from discovered topic...\n');
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
    console.log(`   Package ID: ${packageResult.packageId}`);
    console.log(`   Figure: ${packageResult.plan.figure}`);
    console.log(`   Angle: ${packageResult.plan.recommendedApproach.angle}`);
    console.log(`   Estimated Cost: $${packageResult.plan.estimatedCost}\n`);

    // Step 3: Submit job
    console.log('🚀 Step 3: Submitting video generation job...\n');

    const fullPackage = await storage.getUnityContentPackage(packageResult.packageId);
    if (!fullPackage) {
      throw new Error(`Failed to retrieve package: ${packageResult.packageId}`);
    }

    const job = await storage.createJob({
      scriptName: packageResult.plan.figure,
      scriptContent: 'N/A - Sourced from Unity package via topic discovery',
      mode: 'unity_kling',
      aspectRatio: '9:16',
      unityMetadata: {
        packageId: packageResult.packageId,
        promptCount: fullPackage.packageData.veoPrompts.length,
        estimatedCost: packageResult.plan.estimatedCost,
        automationSource: 'topic-discovery-agent',
        topic: topic.topic,
        hook: topic.hook,
        viralScore: topic.viralPotential,
      },
      autoUpload: true,
    });

    console.log('✅ Job submitted successfully!');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Auto Upload: ${job.autoUpload}\n`);

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   VIDEO GENERATION STARTED WITH FRESH TOPIC                ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Summary:`);
    console.log(`   Topic: ${topic.figure}`);
    console.log(`   Hook: ${topic.hook}`);
    console.log(`   Viral Potential: ${topic.viralPotential}/10`);
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Package ID: ${packageResult.packageId}`);
    console.log(`\n✅ System working as designed - no duplicates!`);

    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

generateWithDiscovery();
