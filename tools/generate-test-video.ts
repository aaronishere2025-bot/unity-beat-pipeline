// Generate a test video to verify the full pipeline
import { initializeSecretsFromGCP } from '../server/secret-manager-loader.js';
import { autonomousGoalAgent } from '../server/services/autonomous-goal-agent';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function generateTestVideo() {
  // Load secrets first
  console.log('🔐 Loading secrets from Secret Manager...');
  await initializeSecretsFromGCP();
  console.log('✅ Secrets loaded\n');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      GENERATING TEST VIDEO - FULL PIPELINE VERIFICATION   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Use autonomous goal agent to create a complete package from a simple goal
    console.log('🎯 Creating package from goal: "Genghis Khan - viral short"...\n');

    const result = await autonomousGoalAgent.createPackageFromGoal({
      figure: 'Genghis Khan',
      intent: 'viral',
      constraints: {
        maxDuration: 60,
        aspectRatio: '9:16',
      },
    });

    console.log('✓ Package created successfully!');
    console.log(`  Package ID: ${result.packageId}`);
    console.log(`  Figure: ${result.plan.figure}`);
    console.log(`  Recommended approach:`);
    console.log(`    Angle: ${result.plan.recommendedApproach.angle}`);
    console.log(`    Hook: ${result.plan.recommendedApproach.hook.substring(0, 80)}...`);
    console.log(`    Style: ${result.plan.recommendedApproach.style}`);
    console.log(`    Posting: ${result.plan.recommendedApproach.postingTime}`);

    // Check if package was saved to database
    const packages = await db.execute(sql`
      SELECT id, title, status, created_at
      FROM unity_content_packages
      ORDER BY created_at DESC
      LIMIT 3
    `);

    console.log('\n📦 Recent packages in database:');
    for (const pkg of packages.rows) {
      console.log(`  - ${pkg.id}: ${pkg.title} (${pkg.status})`);
    }

    // Trigger the video generation job
    console.log('\n🚀 Triggering video generation job with auto-upload...');
    const { storage } = await import('../server/storage');

    // Fetch the full package data to get the definitive prompt count
    const fullPackage = await storage.getUnityContentPackage(result.packageId);
    if (!fullPackage) {
      throw new Error(`Failed to retrieve newly created package: ${result.packageId}`);
    }
    console.log(`✅ Retrieved full package with ${fullPackage.packageData.veoPrompts.length} prompts.`);

    const job = await storage.createJob({
      scriptName: result.plan.figure,
      scriptContent: 'N/A - Sourced from Unity package',
      mode: 'unity_kling',
      aspectRatio: '9:16',
      unityMetadata: {
        packageId: result.packageId,
        promptCount: fullPackage.packageData.veoPrompts.length,
        estimatedCost: result.plan.estimatedCost,
        automationSource: 'test-script',
        topic: result.plan.figure,
        hook: result.plan.recommendedApproach.hook,
      },
      autoUpload: true, // Enable auto-upload to YouTube
    });

    console.log('✅ Job submitted successfully!');
    console.log(`   Job ID: ${job.id}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Auto Upload: ${job.autoUpload}`);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║  TEST VIDEO JOB SUBMITTED - Generation has started        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    return result.packageId;
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

generateTestVideo().catch(console.error);
