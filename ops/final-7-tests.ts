#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

console.log('🎯 FINAL 7 TESTS (4-10 of 10 total)\n');

const results: Array<{ duration: number; pass: boolean }> = [];

for (let run = 4; run <= 10; run++) {
  console.log(`${'─'.repeat(50)}`);
  console.log(`Run ${run}/10: Creating job...`);

  const [job] = await db
    .insert(jobs)
    .values({
      scriptName: `Final Test ${run}/10 - 90% Validation`,
      scriptContent: 'target 3:00 length | trap hip hop | 140 BPM | hard 808s',
      mode: 'music',
      status: 'queued',
      progress: 0,
      metadata: { withVideo: false, isInstrumental: true, targetDuration: 180 },
    })
    .returning();

  console.log(`Job: ${job.id}`);

  let attempts = 0;
  while (attempts < 80) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;

    const [status] = await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);

    if (status.status === 'completed') {
      const dur = parseFloat(status.audioDuration || '0');
      const diff = Math.abs(dur - 180);
      const pass = diff <= 90;
      results.push({ duration: dur, pass });
      console.log(`✅ ${dur}s (${diff.toFixed(1)}s off) - ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
      break;
    } else if (status.status === 'failed') {
      results.push({ duration: 0, pass: false });
      console.log(`❌ Failed`);
      break;
    }
  }
}

// Add the first 3 runs (already completed successfully)
const allResults = [
  { duration: 142.87, pass: true },
  { duration: 124.27, pass: true },
  { duration: 109.94, pass: true },
  ...results,
];

console.log(`\n${'═'.repeat(60)}`);
console.log('📊 FINAL RESULTS (All 10 Tests)');
console.log('═'.repeat(60));

allResults.forEach((r, i) => {
  const diff = Math.abs(r.duration - 180);
  console.log(`Run ${i + 1}: ${r.duration.toFixed(1)}s (${diff.toFixed(1)}s off) - ${r.pass ? '✅' : '❌'}`);
});

const passed = allResults.filter((r) => r.pass).length;
const successRate = (passed / allResults.length) * 100;

console.log('\n' + '─'.repeat(60));
console.log(`Passed: ${passed}/10`);
console.log(`Success Rate: ${successRate.toFixed(0)}%`);
console.log(`Target: ≥90% (9/10 minimum)`);
console.log('─'.repeat(60));

if (successRate >= 90) {
  console.log(`\n✅ SUCCESS! ${successRate}% success rate achieved!`);
  console.log('🎉 Structure tag optimization COMPLETE!\n');
} else {
  console.log(`\n⚠️  ${successRate}% success rate (need 90%)`);
  console.log(`   Need ${Math.ceil(9 - passed)} more passes\n`);
}

console.log('═'.repeat(60));
