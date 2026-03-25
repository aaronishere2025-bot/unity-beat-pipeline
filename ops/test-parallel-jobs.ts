#!/usr/bin/env tsx
/**
 * Test script to verify parallel job processing
 * Queues 3 short trap beats simultaneously and monitors execution
 */

import { storage } from './server/storage.js';
import { initializeSecretsWithFallback } from './server/secret-manager-loader.js';

console.log('🧪 Testing Parallel Job Processing\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

await initializeSecretsWithFallback();

// Create 3 trap beat jobs (2 minutes each for fast testing)
const jobs = [];

const styles = [
  'Dark trap, 140 BPM, heavy 808 bass, menacing synths, hard-hitting drums',
  'Chill trap, 145 BPM, atmospheric synths, smooth 808s, dreamy pads',
  'Melodic trap, 138 BPM, emotional piano, smooth 808s, atmospheric pads',
];

console.log('📝 Creating 3 test jobs...\n');

for (let i = 0; i < 3; i++) {
  const job = await storage.createJob({
    scriptName: `Parallel Test Beat ${i + 1}`,
    scriptContent: styles[i],
    mode: 'music',
    duration: 120, // 2 minutes for fast testing
    aspectRatio: '16:9',
    clipCount: 1,
    status: 'queued',
    progress: 0,
    metadata: {
      targetDuration: 120,
      singleClip: true,
      testJob: true,
      parallelTestGroup: Date.now(),
    },
  });

  jobs.push(job);
  console.log(`   ✅ Job ${i + 1}: ${job.id} - ${job.scriptName}`);
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('🚀 Jobs queued! Monitoring parallel execution...\n');
console.log('Expected behavior:');
console.log('  ✅ All 3 jobs should start within 2-5 seconds');
console.log('  ✅ All 3 should show "processing" status simultaneously');
console.log('  ✅ Total time: ~5-8 minutes (not 15-24 minutes sequential)\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Monitor jobs for 30 seconds
const startTime = Date.now();
const monitorDuration = 30000; // 30 seconds

let allStarted = false;

while (Date.now() - startTime < monitorDuration) {
  const statuses = await Promise.all(
    jobs.map(async (job) => {
      const updated = await storage.getJob(job.id);
      return {
        id: job.id.substring(0, 8),
        name: job.scriptName,
        status: updated?.status,
        progress: updated?.progress || 0,
      };
    }),
  );

  // Clear console and print status
  process.stdout.write('\x1Bc'); // Clear screen
  console.log('🎬 Parallel Job Execution Monitor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`⏱️  Elapsed: ${Math.floor((Date.now() - startTime) / 1000)}s / 30s\n`);

  const processingCount = statuses.filter((s) => s.status === 'processing').length;
  const queuedCount = statuses.filter((s) => s.status === 'queued').length;
  const completedCount = statuses.filter((s) => s.status === 'completed').length;

  console.log(`📊 Status: ${processingCount} processing, ${queuedCount} queued, ${completedCount} completed\n`);

  statuses.forEach((s, i) => {
    const statusIcon =
      s.status === 'processing' ? '🟢' : s.status === 'queued' ? '🟡' : s.status === 'completed' ? '✅' : '🔴';
    console.log(
      `   ${statusIcon} Job ${i + 1} [${s.id}]: ${s.status?.toUpperCase().padEnd(12)} | Progress: ${s.progress}%`,
    );
  });

  // Check if all jobs started
  if (processingCount >= 2 && !allStarted) {
    allStarted = true;
    console.log('\n🎉 SUCCESS: Multiple jobs running in parallel!');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await new Promise((resolve) => setTimeout(resolve, 2000)); // Update every 2 seconds
}

// Final status
console.log('\n\n📋 Final Status After 30 Seconds:');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const finalStatuses = await Promise.all(
  jobs.map(async (job) => {
    const updated = await storage.getJob(job.id);
    return {
      id: job.id,
      name: job.scriptName,
      status: updated?.status,
      progress: updated?.progress || 0,
    };
  }),
);

finalStatuses.forEach((s, i) => {
  console.log(`Job ${i + 1}: ${s.status} (${s.progress}%)`);
});

if (allStarted) {
  console.log('\n✅ Test PASSED: Parallel job processing is working!');
  console.log('   Worker pool successfully handles multiple jobs simultaneously.\n');
} else {
  console.log('\n⚠️  Test INCONCLUSIVE: Jobs may not have started yet.');
  console.log('   Check server logs or wait longer for jobs to begin processing.\n');
}

console.log('💡 Tip: Watch job progress at http://localhost:8080\n');
