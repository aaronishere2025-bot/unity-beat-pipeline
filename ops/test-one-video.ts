/**
 * Test: Run ONE historical video with multi-shot, monitor credits closely.
 *
 * Expected cost for Salem Witch Trials (71.68s audio):
 *   - ~14 prompts → ~5 scene groups (3 shots each)
 *   - Probe: 1 × 5s × 20 credits/sec = 100 credits ($0.50)
 *   - Scene groups: 5 × 15s × 40 credits/sec = 3,000 credits ($15.00)
 *   - TOTAL EXPECTED: ~3,100 credits (~$15.50)
 *   - HARD CAP: 3,600 credits ($18.00) via credit guard
 */

import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const jobId = 'f63ed649-2774-4492-86db-5ca36aef90af'; // Salem Witch Trials

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) {
    console.error('Job not found!');
    process.exit(1);
  }

  console.log('=== PRE-FLIGHT CHECK ===');
  console.log(`Job: ${job.scriptName}`);
  console.log(`Status: ${job.status}`);
  console.log(`Audio: ${job.audioDuration}s`);
  console.log(`Music: ${job.musicUrl}`);
  console.log(`Metadata:`, JSON.stringify(job.metadata, null, 2));

  // Calculate expected cost
  const audioDuration = parseFloat(job.audioDuration || '0');
  const promptsNeeded = Math.ceil(audioDuration / 5);
  const sceneGroups = Math.ceil(promptsNeeded / 3);
  const creditsPerGroup = 600; // 15s × 40 credits/sec (sound=true for multi-shot)
  const probeCredits = 100;
  const totalCredits = probeCredits + sceneGroups * creditsPerGroup;
  const totalCost = totalCredits * 0.005;

  console.log(`\n=== EXPECTED CREDIT USAGE ===`);
  console.log(`Audio duration: ${audioDuration}s`);
  console.log(`Prompts needed: ~${promptsNeeded}`);
  console.log(`Scene groups: ~${sceneGroups}`);
  console.log(`Credits per group: ${creditsPerGroup} (15s × 40 credits/sec, sound=true)`);
  console.log(`Probe cost: ${probeCredits} credits`);
  console.log(`TOTAL EXPECTED: ${totalCredits} credits ($${totalCost.toFixed(2)})`);
  console.log(`HARD CAP: 3,600 credits ($18.00) via credit guard`);

  console.log(`\n=== RESETTING JOB ===`);
  // Clear doNotRequeue and reset to queued
  await db
    .update(jobs)
    .set({
      status: 'queued',
      progress: 0,
      errorMessage: null,
      videoUrl: null,
      thumbnailUrl: null,
      clipCount: 0,
      completedClips: null,
      metadata: { requeueCount: 0 } as any,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId));

  console.log('✅ Job reset to queued');
  console.log(
    '\nStart server with: PORT=8080 nohup npx tsx server/index-dev.ts > /tmp/unity-scratch/server.log 2>&1 &',
  );
  console.log(
    'Monitor with: tail -f /tmp/unity-scratch/server.log | grep -E "kie\\.ai|credit|circuit|probe|scene.group|Cost|batch"',
  );

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
