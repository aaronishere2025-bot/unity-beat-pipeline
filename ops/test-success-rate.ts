#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

console.log('═══════════════════════════════════════════════════════════');
console.log('🎯 TESTING SUCCESS RATE: 10 Consecutive Runs');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('Target: 180s (3:00)');
console.log('Tolerance: ±90s (90-270s acceptable)\n');

const results: Array<{ run: number; duration: number; pass: boolean }> = [];
const TOTAL_RUNS = 10;

for (let run = 1; run <= TOTAL_RUNS; run++) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🎵 RUN ${run}/${TOTAL_RUNS}: Creating job...`);

  const [job] = await db
    .insert(jobs)
    .values({
      scriptName: `Success Rate Test ${run}/10`,
      scriptContent: 'target 3:00 length | trap hip hop | 140 BPM | hard 808s, dark melody',
      mode: 'music',
      status: 'queued',
      progress: 0,
      metadata: {
        withVideo: false,
        isInstrumental: true,
        targetDuration: 180,
      },
    })
    .returning();

  console.log(`   Job ID: ${job.id}`);
  console.log(`   Waiting for completion...`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 80; // ~7 minutes

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;

    const [status] = await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);

    if (status.status === 'completed') {
      const duration = parseFloat(status.audioDuration || '0');
      const diff = Math.abs(duration - 180);
      const pass = diff <= 90;

      results.push({ run, duration, pass });

      console.log(`   ✅ Completed: ${duration}s (${diff.toFixed(1)}s off)`);
      console.log(`   Status: ${pass ? '✅ PASS' : '❌ FAIL'}`);
      break;
    } else if (status.status === 'failed') {
      console.log(`   ❌ Job failed: ${status.errorMessage}`);
      results.push({ run, duration: 0, pass: false });
      break;
    }

    if (attempts % 12 === 0) {
      process.stdout.write(`\r   Progress: ${status.progress}%...`);
    }
  }

  if (attempts >= maxAttempts) {
    console.log(`   ⏱️ Timeout`);
    results.push({ run, duration: 0, pass: false });
  }
}

// Calculate statistics
console.log('\n\n');
console.log('═'.repeat(60));
console.log('📊 FINAL RESULTS');
console.log('═'.repeat(60));
console.log('\nIndividual Results:');
console.log('┌──────┬──────────┬────────────┬────────┐');
console.log('│ Run  │ Duration │ Difference │ Status │');
console.log('├──────┼──────────┼────────────┼────────┤');

let totalDuration = 0;
let passCount = 0;

results.forEach((r) => {
  const diff = Math.abs(r.duration - 180);
  totalDuration += r.duration;
  if (r.pass) passCount++;

  console.log(
    `│ ${String(r.run).padStart(2)}   │ ${String(r.duration.toFixed(1)).padStart(6)}s  │ ${String(diff.toFixed(1)).padStart(8)}s   │ ${r.pass ? '✅ PASS' : '❌ FAIL'} │`,
  );
});

console.log('└──────┴──────────┴────────────┴────────┘');

const avgDuration = totalDuration / results.length;
const successRate = (passCount / results.length) * 100;

console.log('\n📈 Statistics:');
console.log(`   Total Runs:      ${results.length}`);
console.log(`   Passed:          ${passCount}`);
console.log(`   Failed:          ${results.length - passCount}`);
console.log(`   Success Rate:    ${successRate.toFixed(1)}%`);
console.log(`   Average Length:  ${avgDuration.toFixed(1)}s`);
console.log(`   Target:          180s ±90s`);

console.log('\n🎯 Result:');
if (successRate >= 90) {
  console.log(`   ✅ SUCCESS! ${successRate.toFixed(0)}% success rate achieved!`);
} else {
  console.log(`   ⚠️  ${successRate.toFixed(0)}% success rate (target: 90%)`);
  console.log(`   Need ${Math.ceil(0.9 * results.length - passCount)} more passes`);
}

console.log('═'.repeat(60));
console.log('\n');

process.exit(successRate >= 90 ? 0 : 1);
