#!/usr/bin/env tsx
import { storage } from './server/storage.js';

async function main() {
  console.log('⏱️  Generation Speed Test - Trap + Lofi Beats\n');
  console.log('═'.repeat(60));

  const startTime = Date.now();
  const jobIds: string[] = [];

  console.log('\n📝 Creating 5 Trap Beat Jobs (30 minutes each)...');
  for (let i = 1; i <= 5; i++) {
    const job = await storage.createJob({
      scriptName: `SpeedTest Trap ${i} - ${Date.now()}`,
      scriptContent: `Hard trap beat with 808s, aggressive hi-hats, dark melody`,
      mode: 'music',
      targetDuration: 1800, // 30 minutes
      metadata: {
        testRun: 'speed-test-trap',
        index: i,
      },
    });
    jobIds.push(job.id);
    console.log(`   ✅ Trap ${i}: ${job.id}`);
  }

  console.log('\n📝 Creating 5 Lofi Beat Jobs (30 minutes each)...');
  for (let i = 1; i <= 5; i++) {
    const job = await storage.createJob({
      scriptName: `SpeedTest Lofi ${i} - ${Date.now()}`,
      scriptContent: `Chill lofi beat, jazzy chords, vinyl crackle, 85 BPM, relaxing`,
      mode: 'music',
      targetDuration: 1800, // 30 minutes
      metadata: {
        testRun: 'speed-test-lofi',
        index: i,
      },
    });
    jobIds.push(job.id);
    console.log(`   ✅ Lofi ${i}: ${job.id}`);
  }

  const queueTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n' + '═'.repeat(60));
  console.log('🚀 All 10 jobs queued in ' + queueTime + 's');
  console.log('\n📊 Job IDs:');
  jobIds.forEach((id, i) => {
    const type = i < 5 ? 'Trap' : 'Lofi';
    const num = (i % 5) + 1;
    console.log(`   ${type} ${num}: ${id}`);
  });

  console.log('\n⏱️  Timer started at: ' + new Date().toISOString());
  console.log('💡 Watch progress at: http://localhost:8080/jobs');
  console.log('\n📈 Expected with optimizations:');
  console.log('   • Worker pool: Processing up to 10 jobs in parallel');
  console.log('   • Suno adaptive polling: 30-40% faster per song');
  console.log('   • Music mode (no video): ~8-12 minutes for all 10');
  console.log('\n🎯 Run this to check completion:');
  console.log(`   npx tsx check-test-completion.ts "${jobIds.join(',')}"`);
  console.log('\n' + '═'.repeat(60));
}

main().catch(console.error);
