/**
 * Test Daily Beat Generation: 1 Lofi + 5 Trap
 */

import { db } from './server/db.js';
import { jobs } from './shared/schema.js';

async function generateDailyBeats() {
  console.log('🎵 DAILY BEAT GENERATION TEST\n');
  console.log('Creating 6 beat jobs:');
  console.log('  - 1 Lofi beat');
  console.log('  - 5 Trap beats\n');

  const beatJobs = [];

  // 1 Lofi beat
  beatJobs.push({
    mode: 'music' as const,
    scriptName: `Lofi Study Beat - ${new Date().toLocaleDateString()}`,
    scriptContent: 'Chill lofi hip hop beat for studying and relaxation',
    aspectRatio: '16:9' as const,
    status: 'queued' as const,
    progress: 0,
    retryCount: 0,
    maxRetries: 3,
    autoUpload: false,
    metadata: {
      musicStyle: 'lofi',
      targetDuration: 180,
      clipDuration: 6,
      dailyBatch: true,
      batchType: 'lofi',
    },
  });

  // 5 Trap beats
  const trapStyles = [
    'Hard trap beat with heavy 808s',
    'Dark trap beat with aggressive energy',
    'Melodic trap beat with atmospheric vibes',
    'Minimal trap beat with hard-hitting drums',
    'Rage trap beat with distorted elements',
  ];

  for (let i = 0; i < 5; i++) {
    beatJobs.push({
      mode: 'music' as const,
      scriptName: `Trap Beat #${i + 1} - ${new Date().toLocaleDateString()}`,
      scriptContent: trapStyles[i],
      aspectRatio: '16:9' as const,
      status: 'queued' as const,
      progress: 0,
      retryCount: 0,
      maxRetries: 3,
      autoUpload: false,
      metadata: {
        musicStyle: 'trap',
        targetDuration: 180,
        clipDuration: 6,
        dailyBatch: true,
        batchType: 'trap',
      },
    });
  }

  // Insert all jobs
  const inserted = await db.insert(jobs).values(beatJobs).returning();

  console.log('\n✅ Created jobs:\n');
  inserted.forEach((job, i) => {
    const type = i === 0 ? 'LOFI' : 'TRAP';
    console.log(`   ${type} | ${job.id} | ${job.scriptName}`);
  });

  console.log('\n📊 Summary:');
  console.log(`   Total jobs: ${inserted.length}`);
  console.log(`   Lofi: 1`);
  console.log(`   Trap: 5`);
  console.log(`\n💰 Expected cost:`);
  console.log(`   Per beat: 65 credits (10 Suno + 55 Kling)`);
  console.log(`   Total: ${inserted.length * 65} credits`);
  console.log(`   Cost: $${(inserted.length * 65 * 0.005).toFixed(2)}`);
  console.log('\n🔄 Jobs are queued and will be processed by job-worker');
  console.log('   Monitor: tail -f /tmp/server-test-credits.log\n');
}

generateDailyBeats().catch(console.error);
