import { autonomousGoalAgent } from './server/services/autonomous-goal-agent';
import { storage } from './server/storage';

async function generateFreshVideo() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  FRESH VIDEO GENERATION - ALEXANDER THE GREAT              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('🎯 Creating fresh package with Level 5 features...\n');

  const result = await autonomousGoalAgent.createPackageFromGoal({
    figure: 'Alexander the Great',
    intent: 'viral',
    constraints: {
      maxDuration: 60,
      aspectRatio: '9:16',
    },
  });

  console.log(`\n✅ FRESH PACKAGE CREATED: ${result.packageId}`);
  console.log(`   Topic: ${result.plan.recommendedApproach.angle}`);

  // Get package and create job
  const pkg = await storage.getUnityContentPackage(result.packageId);
  if (!pkg?.packageData?.veoPrompts) {
    throw new Error('Package missing prompts - packageData: ' + JSON.stringify(pkg?.packageData ? 'exists' : 'null'));
  }

  console.log(`\n🎬 Creating Kling generation job...`);
  console.log(`   Prompts: ${pkg.packageData.veoPrompts.length}`);

  const job = await storage.createJob({
    scriptName: `Alexander the Great - Fresh ${new Date().toISOString().split('T')[0]}`,
    scriptContent: `Fresh Unity video generation for Alexander the Great`,
    mode: 'unity_kling',
    aspectRatio: '9:16',
    unityMetadata: {
      packageId: result.packageId,
      promptCount: pkg.packageData.veoPrompts.length,
      estimatedCost: pkg.packageData.veoPrompts.length * 0.1,
      automationSource: 'fresh_level5',
    },
  });

  console.log(`\n🚀 JOB CREATED: ${job.id}`);
  console.log(`   Status: ${job.status}`);
  console.log(`   The job worker will process this automatically.`);

  return { packageId: result.packageId, jobId: job.id };
}

generateFreshVideo()
  .then((result) => {
    console.log('\n✅ SUCCESS!');
    console.log(`   Package: ${result.packageId}`);
    console.log(`   Job: ${result.jobId}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
