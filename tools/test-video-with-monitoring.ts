/**
 * Generate test video and monitor error capture + auto-fix system
 */

import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { db } from './server/db.js';
import { jobs, unityContentPackages } from './shared/schema.js';
import { desc, eq } from 'drizzle-orm';
import { errorMonitor } from './server/services/error-monitor.js';

async function testVideoWithMonitoring() {
  console.log('🔐 Loading secrets...');
  await initializeSecretsFromGCP();

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║     TEST VIDEO GENERATION WITH ERROR MONITORING           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Get an existing Unity package to test with
  const packages = await db.select().from(unityContentPackages).orderBy(desc(unityContentPackages.createdAt)).limit(1);

  if (packages.length === 0) {
    console.log('❌ No Unity packages found. Creating one first...');

    // Create a simple test package
    const testPackage = await db
      .insert(unityContentPackages)
      .values({
        title: 'Test: Auto-Fix System Demo',
        topic: 'Testing error monitoring',
        figure: 'Test Subject',
        era: 'Modern',
        theme: 'technology',
        lyrics: JSON.stringify({
          verses: [
            { text: 'Testing the auto-fix system', timestamp: 0 },
            { text: 'Watching errors get caught', timestamp: 3 },
            { text: 'And fixes applied automatically', timestamp: 6 },
          ],
        }),
        generatedPrompts: JSON.stringify([
          { scene: 'Test scene 1', description: 'A computer detecting errors' },
          { scene: 'Test scene 2', description: 'AI agents fixing bugs' },
        ]),
        status: 'ready',
        estimatedCost: 1.0,
        clipCount: 2,
      })
      .returning();

    console.log(`✅ Created test package: ${testPackage[0].id}\n`);
    packages.push(testPackage[0]);
  }

  const pkg = packages[0];
  console.log(`📦 Using package: ${pkg.title} (${pkg.id})\n`);

  // Create a job using this package
  console.log('🎬 Creating video generation job...');

  const newJob = await db
    .insert(jobs)
    .values({
      mode: 'unity_kling',
      aspectRatio: '9:16',
      scriptName: pkg.title || 'Test Video',
      scriptContent: 'Auto-generated test',
      unityMetadata: {
        packageId: pkg.id,
        promptCount: 2,
        estimatedCost: 1.0,
        automationSource: 'test-script',
        topic: pkg.topic || 'test',
        includeKaraoke: false,
        enableLipSync: false,
      },
      status: 'queued',
    })
    .returning();

  const jobId = newJob[0].id;
  console.log(`✅ Job created: ${jobId}`);
  console.log(`   Status: ${newJob[0].status}`);
  console.log(`   Mode: ${newJob[0].mode}\n`);

  // Monitor the job for 2 minutes
  console.log('👀 Monitoring job progress and error capture...\n');
  console.log('   (Press Ctrl+C to stop monitoring)\n');

  let lastStatus = newJob[0].status;
  let lastProgress = 0;
  let checkCount = 0;
  const maxChecks = 24; // 2 minutes (5 second intervals)

  while (checkCount < maxChecks) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds

    // Check job status
    const currentJob = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

    if (currentJob.length === 0) {
      console.log('❌ Job disappeared from database');
      break;
    }

    const job = currentJob[0];

    // Report status changes
    if (job.status !== lastStatus || (job.progress || 0) !== lastProgress) {
      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] Status: ${job.status} | Progress: ${job.progress || 0}%`);

      if (job.errorMessage) {
        console.log(`   ⚠️  Error: ${job.errorMessage}`);
      }

      lastStatus = job.status;
      lastProgress = job.progress || 0;
    }

    // Check if job completed or failed
    if (job.status === 'completed') {
      console.log('\n✅ Job completed successfully!');
      console.log(`   Video URL: ${job.videoUrl || 'Not available'}`);
      break;
    }

    if (job.status === 'failed') {
      console.log('\n❌ Job failed!');
      console.log(`   Error: ${job.errorMessage}`);
      break;
    }

    checkCount++;
  }

  // Get error monitoring stats
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              ERROR MONITORING RESULTS                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const stats = await errorMonitor.getStats();
  console.log('📊 Error Statistics:');
  console.log(`   Total errors: ${stats.total}`);
  console.log(`   Active: ${stats.active}`);
  console.log(`   Fixed: ${stats.fixed}`);
  console.log(`   Fix success rate: ${stats.fixSuccessRate.toFixed(1)}%\n`);

  console.log('📈 By Severity:');
  console.log(`   Critical: ${stats.bySeverity.critical}`);
  console.log(`   High: ${stats.bySeverity.high}`);
  console.log(`   Medium: ${stats.bySeverity.medium}`);
  console.log(`   Low: ${stats.bySeverity.low}\n`);

  console.log('🏷️  By Category:');
  for (const [category, count] of Object.entries(stats.byCategory)) {
    console.log(`   ${category}: ${count}`);
  }

  // Show recent errors
  const recentErrors = errorMonitor.getRecentErrors(5);
  if (recentErrors.length > 0) {
    console.log('\n🔍 Recent Errors Captured:');
    for (const error of recentErrors) {
      console.log(`\n   Error ID: ${error.id}`);
      console.log(`   Type: ${error.errorType} (${error.severity})`);
      console.log(`   Message: ${error.errorMessage.substring(0, 80)}...`);
      console.log(`   Fix Attempted: ${error.fixAttempted ? '✅' : '❌'}`);
      if (error.fixSucceeded !== undefined) {
        console.log(`   Fix Succeeded: ${error.fixSucceeded ? '✅' : '❌'}`);
      }
    }
  }

  console.log('\n✅ Test complete!\n');
  process.exit(0);
}

testVideoWithMonitoring().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
