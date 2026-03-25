/**
 * END-TO-END PIPELINE TEST
 *
 * Tests the full video generation pipeline:
 * 1. Topic Discovery Agent finds fresh viral topic
 * 2. Autonomous Goal Agent creates Unity package
 * 3. Job created in Neon database
 * 4. Job worker picks it up and generates video with kie.ai
 */

import { initializeSecretsFromGCP } from '../server/secret-manager-loader';
import { topicDiscoveryAgent } from '../server/services/topic-discovery-agent';
import { autonomousGoalAgent } from '../server/services/autonomous-goal-agent';
import { db } from '../server/db';
import { jobs } from '@shared/schema';

async function testFullPipeline() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 END-TO-END PIPELINE TEST');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Load secrets
  console.log('🔐 Loading secrets...');
  await initializeSecretsFromGCP();
  console.log('✅ Secrets loaded\n');

  try {
    // STEP 1: Discover fresh topic
    console.log('━━━ STEP 1: Topic Discovery ━━━');
    const discovery = await topicDiscoveryAgent.discoverTopics(1, 90);

    if (discovery.topics.length === 0) {
      console.error('❌ No topics discovered! Check recent topics in database.');
      process.exit(1);
    }

    const topic = discovery.topics[0];
    console.log(`✅ Discovered topic: ${topic.figure}`);
    console.log(`   Hook: "${topic.hook}"`);
    console.log(`   Viral score: ${topic.viralPotential}/10`);
    console.log(`   Deduplication: Checked ${discovery.recentTopicsCount} recent topics\n`);

    // STEP 2: Create Unity package
    console.log('━━━ STEP 2: Unity Package Generation ━━━');
    const result = await autonomousGoalAgent.createPackageFromGoal({
      figure: topic.figure,
      intent: topic.intent,
      constraints: {
        maxDuration: 60, // Short video (60 seconds)
        aspectRatio: '9:16', // Vertical for shorts
      },
      suggestedAngle: topic.angle,
      suggestedHook: topic.hook,
    });

    console.log(`✅ Unity package created: ${result.packageId}`);
    console.log(`   Angle: ${result.plan.recommendedApproach.angle.substring(0, 80)}...`);
    console.log(`   Viral score: ${result.plan.recommendedApproach.viralScore}\n`);

    // STEP 3: Create job in database
    console.log('━━━ STEP 3: Job Creation ━━━');
    const [job] = await db
      .insert(jobs)
      .values({
        scriptName: `${topic.figure} - Pipeline Test`,
        scriptContent: topic.hook,
        mode: 'unity_kling',
        status: 'queued',
        aspectRatio: '9:16',
        unityMetadata: {
          packageId: result.packageId,
          promptCount: 0, // Will be loaded from package
          estimatedCost: 0,
          automationSource: 'test-full-pipeline',
          topic: result.plan.recommendedApproach.angle,
          hook: topic.hook,
          viralScore: topic.viralPotential,
          videoEngine: 'kling',
          includeKaraoke: true,
          karaokeStyle: 'bounce',
          enableI2V: false,
          enableLipSync: true,
          autoUpload: false, // Don't auto-upload test video
        },
      })
      .returning();

    console.log(`✅ Job created: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Package: ${result.packageId}\n`);

    // STEP 4: Monitor job processing
    console.log('━━━ STEP 4: Job Worker Processing ━━━');
    console.log(`⏳ Job queued - job worker will pick it up in ~5 seconds`);
    console.log(`\n📊 Monitor progress:`);
    console.log(`   - Job ID: ${job.id}`);
    console.log(`   - Check logs: tail -f /tmp/server-neon.log`);
    console.log(`   - Watch dashboard: http://localhost:5000\n`);

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ PIPELINE TEST COMPLETE - Job is queued!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n💡 The job worker polls every 5 seconds and will start processing.');
    console.log('   Video generation typically takes 3-5 minutes per clip.\n');
  } catch (error: any) {
    console.error('\n❌ Pipeline test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

testFullPipeline();
