import { autonomousGoalAgent } from './server/services/autonomous-goal-agent';
import { storage } from './server/storage';

async function generateFreshVideo() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  FRESH VIDEO GENERATION - JULIUS CAESAR                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Create fresh package
  console.log('🎯 Creating fresh package with Level 5 features...\n');

  const result = await autonomousGoalAgent.createPackageFromGoal({
    figure: 'Julius Caesar',
    intent: 'viral',
    constraints: {
      maxDuration: 60,
      aspectRatio: '9:16',
    },
  });

  console.log(`\n✅ FRESH PACKAGE CREATED: ${result.packageId}`);
  console.log(`   Topic: ${result.plan.recommendedApproach.angle}`);
  console.log(`   Posting: ${result.plan.optimalTiming.weekdaySlot}, ${result.plan.optimalTiming.weekendSlot}`);

  // Get package and create job
  const pkg = await storage.getUnityContentPackage(result.packageId);
  if (!pkg?.packageData?.veoPrompts) {
    throw new Error('Package missing prompts');
  }

  console.log(`\n🎬 Creating Kling generation job...`);
  console.log(`   Prompts: ${pkg.packageData.veoPrompts.length}`);
  console.log(`   Est cost: $${(pkg.packageData.veoPrompts.length * 0.1).toFixed(2)}`);

  const job = await storage.createJob({
    scriptName: `Julius Caesar - Fresh Gen ${Date.now()}`,
    scriptContent: `Fresh Unity video generation for Julius Caesar`,
    mode: 'unity_kling',
    aspectRatio: '9:16',
    unityMetadata: {
      packageId: result.packageId,
      promptCount: pkg.packageData.veoPrompts.length,
      estimatedCost: pkg.packageData.veoPrompts.length * 0.1,
      automationSource: 'fresh_level5_test',
    },
  });

  console.log(`\n🚀 JOB CREATED: ${job.id}`);
  console.log(`   Status: ${job.status}`);
  console.log(`   The job worker will now process this automatically.`);
  console.log(`\n   Monitor at: /api/jobs/${job.id}`);

  return { packageId: result.packageId, jobId: job.id };
}

generateFreshVideo().catch(console.error);
