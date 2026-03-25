/**
 * MOCK TEST: Kling API cost analysis
 *
 * Does NOT call the real API. Analyzes the server log to determine:
 * 1. How many requests were sent per job
 * 2. The retry pattern (how many retries per failed clip)
 * 3. Whether kie.ai charges per REQUEST or per SUCCESSFUL generation
 * 4. The burst rate (requests per minute)
 *
 * Usage: npx tsx tools/test-kling-cost-per-request.ts [logfile]
 */

import { readFileSync } from 'fs';

const LOG_FILE = process.argv[2] || '/tmp/claude-1001/-home-aaronishere2025/tasks/bc4e455.output';

interface RequestEvent {
  time: string;
  type: 'submit' | 'success' | 'credit_fail' | 'rate_limit' | 'other_fail';
  model: string;
  duration: string;
  aspect: string;
}

function analyze() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      KLING API COST ANALYSIS — Mock Test                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const content = readFileSync(LOG_FILE, 'utf-8');
  const lines = content.split('\n');

  const events: RequestEvent[] = [];
  let submissions = 0;
  let successes = 0;
  let creditFails = 0;
  let rateLimits = 0;
  let otherFails = 0;
  let retryAttempt1 = 0;
  let retryAttempt2 = 0;
  let retryAttempt3 = 0;

  // Track timestamps for burst detection
  const submitTimestamps: number[] = [];

  for (const line of lines) {
    // Count submissions
    if (line.includes('Sending kie.ai request')) {
      submissions++;
      // Extract time
      const timeMatch = line.match(/(\d+:\d+:\d+\s*[AP]M)/);
      if (timeMatch) {
        const d = new Date(`2026-03-03 ${timeMatch[1]}`);
        submitTimestamps.push(d.getTime());
      }
    }

    // Count results
    if (line.includes('"code":200') && line.includes('kie.ai')) successes++;
    if (line.includes('Credits insufficient')) creditFails++;
    if (line.includes('"code":429')) rateLimits++;

    // Count retry attempts
    if (line.includes('[Attempt 1/3]')) retryAttempt1++;
    if (line.includes('[Attempt 2/3]')) retryAttempt2++;
    if (line.includes('[Attempt 3/3]')) retryAttempt3++;

    // Count kling-specific errors
    if (line.includes('[Kling]') && line.includes('Failed:') && !line.includes('Credits') && !line.includes('429')) {
      otherFails++;
    }
  }

  console.log('━━━ Request Counts ━━━');
  console.log(`  Total submissions to kie.ai:  ${submissions}`);
  console.log(`  Successful (code 200):        ${successes}`);
  console.log(`  Credit failures:              ${creditFails}`);
  console.log(`  Rate limit (429):             ${rateLimits}`);
  console.log(`  Other failures:               ${otherFails}`);
  console.log('');

  console.log('━━━ Retry Pattern ━━━');
  console.log(`  Attempt 1/3 (original):       ${retryAttempt1}`);
  console.log(`  Attempt 2/3 (simplified):     ${retryAttempt2}`);
  console.log(`  Attempt 3/3 (generic):        ${retryAttempt3}`);
  console.log(`  Total retry overhead:         ${retryAttempt2 + retryAttempt3} extra requests`);
  console.log('');

  // Burst analysis
  if (submitTimestamps.length > 1) {
    submitTimestamps.sort((a, b) => a - b);

    // Find the worst 1-minute burst
    let worstBurst = 0;
    let worstBurstTime = 0;
    for (let i = 0; i < submitTimestamps.length; i++) {
      const windowEnd = submitTimestamps[i] + 60_000;
      let count = 0;
      for (let j = i; j < submitTimestamps.length && submitTimestamps[j] <= windowEnd; j++) {
        count++;
      }
      if (count > worstBurst) {
        worstBurst = count;
        worstBurstTime = submitTimestamps[i];
      }
    }

    // Find worst 5-minute burst
    let worst5MinBurst = 0;
    for (let i = 0; i < submitTimestamps.length; i++) {
      const windowEnd = submitTimestamps[i] + 5 * 60_000;
      let count = 0;
      for (let j = i; j < submitTimestamps.length && submitTimestamps[j] <= windowEnd; j++) {
        count++;
      }
      if (count > worst5MinBurst) worst5MinBurst = count;
    }

    console.log('━━━ Burst Analysis ━━━');
    console.log(`  Worst 1-min burst:            ${worstBurst} requests`);
    console.log(`  Worst 5-min burst:            ${worst5MinBurst} requests`);
    const totalDuration = (submitTimestamps[submitTimestamps.length - 1] - submitTimestamps[0]) / 60_000;
    console.log(
      `  Avg rate:                     ${(submissions / totalDuration).toFixed(1)} requests/min over ${totalDuration.toFixed(0)} min`,
    );
    console.log('');
  }

  // Cost scenarios
  console.log('━━━ Cost Scenarios ━━━');
  console.log('');
  console.log('  IF kie.ai charges per SUCCESSFUL generation only:');
  console.log(`    ${successes} clips × $0.30 = $${(successes * 0.3).toFixed(2)}`);
  console.log(`    ${successes} clips × 10 credits = ${successes * 10} credits`);
  console.log('');
  console.log('  IF kie.ai charges per SUBMISSION (including failures):');
  console.log(`    ${submissions} requests × $0.30 = $${(submissions * 0.3).toFixed(2)}`);
  console.log(`    ${submissions} requests × 10 credits = ${submissions * 10} credits`);
  console.log(`    ${submissions} requests × 14 credits = ${submissions * 14} credits`);
  console.log('');

  // Which matches -191 credits?
  // They had some credits before, topped up $30
  // $30 at kie.ai = probably some amount of credits
  // -191 means they went 191 credits into debt
  console.log('  To match -191 credits (with $30 top-up):');
  const topUpCredits = [1000, 1500, 2000, 3000, 5000, 10000];
  for (const tc of topUpCredits) {
    const creditsPerReq = Math.round((tc + 191) / submissions);
    const creditsPerSuccess = Math.round((tc + 191) / successes);
    console.log(`    If $30 = ${tc} credits: ${creditsPerReq} credits/request OR ${creditsPerSuccess} credits/success`);
  }

  console.log('');
  console.log('━━━ Root Cause ━━━');
  console.log(`  4 jobs × 26 clips each = 104 clip requests expected`);
  console.log(`  Actual requests sent: ${submissions} (${(submissions / 104).toFixed(1)}x expected)`);
  console.log(`  Retry multiplier: ${(submissions / 104).toFixed(1)}x`);
  console.log('');
  console.log('  The retry system (3 attempts per clip × 4 parallel jobs) created');
  console.log(`  a ${submissions}-request storm. If kie.ai charges per request,`);
  console.log(`  the retries on "Credits insufficient" errors drain credits further.`);
  console.log('');
  console.log('  FIX NEEDED: Stop retrying on "Credits insufficient" errors.');
  console.log('  That error is financial, not prompt-related — retrying wastes credits.');
}

analyze();
