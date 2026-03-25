#!/usr/bin/env tsx
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

console.log('🎯 QUICK TEST: 3 Runs with Optimized Structure\n');

const results: Array<{ duration: number; pass: boolean }> = [];

for (let run = 1; run <= 3; run++) {
  console.log(`${'─'.repeat(50)}`);
  console.log(`Run ${run}/3: Creating job...`);

  const [job] = await db
    .insert(jobs)
    .values({
      scriptName: `Quick Test ${run}/3 - Optimized Structure`,
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

console.log(`\n${'═'.repeat(50)}`);
console.log('RESULTS:');
const passed = results.filter((r) => r.pass).length;
console.log(`Passed: ${passed}/3 (${((passed / 3) * 100).toFixed(0)}%)`);
console.log(`Durations: ${results.map((r) => r.duration.toFixed(0) + 's').join(', ')}`);
console.log(`Target: 90-270s (180±90s)`);
console.log(
  `\n${passed >= 3 ? '✅ ALL PASSED!' : passed >= 2 ? '⚠️  2/3 passed, run more tests' : '❌ Need optimization'}`,
);
console.log('═'.repeat(50));
