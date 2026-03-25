import { autonomousGoalAgent } from './services/autonomous-goal-agent';
import { topicDiscoveryAgent } from './services/topic-discovery-agent';
import { storage } from './storage';

async function generateFreshVideos() {
  console.log('🎬 Generating 5 fresh historical videos with AI topic discovery...\n');

  try {
    // Use AI topic discovery with 90-day deduplication
    console.log('🔍 Discovering fresh topics (90-day deduplication)...');
    const discoveryResult = await topicDiscoveryAgent.discoverTopics(5, 90);
    const topics = discoveryResult.topics;

    console.log(`✅ Discovered ${topics.length} unique topics:\n`);
    topics.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.figure} - ${t.angle}`);
    });
    console.log('');

    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i];
      try {
        console.log(`\n📦 [${i + 1}/5] Creating package for: ${topic.figure} (${topic.intent})`);
        console.log(`   Hook: ${topic.hook}`);

        const result = await autonomousGoalAgent.createPackageFromGoal({
          figure: topic.figure,
          intent: topic.intent,
          suggestedAngle: topic.angle,
          suggestedHook: topic.hook,
        });
        console.log(`✅ Created package ${result.packageId} for ${topic.figure}`);

        // Create a job for the package
        const dateStr = new Date().toISOString().split('T')[0];
        const job = await storage.createJob({
          scriptName: `${topic.figure} - Fresh ${dateStr}`,
          scriptContent: topic.hook,
          mode: 'unity_kling',
          aspectRatio: '9:16',
          unityMetadata: {
            packageId: result.packageId,
            promptCount: 8,
            estimatedCost: 0.8,
            automationSource: 'fresh_level5',
            topic: topic.angle,
            hook: topic.hook,
          },
        });
        console.log(`✅ Queued job ${job.id} for ${topic.figure}`);
      } catch (error: any) {
        console.error(`❌ Failed for ${topic.figure}: ${error.message}`);
      }
    }

    console.log('\n🎉 All packages created! Jobs will be processed by the worker.\n');
  } catch (error: any) {
    console.error('❌ Topic discovery failed:', error.message);
    console.error('   Try again or check topic-discovery-agent logs');
  }

  process.exit(0);
}

generateFreshVideos();
