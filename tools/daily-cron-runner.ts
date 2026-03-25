/**
 * DAILY CRON RUNNER — Headless Pipeline Runner
 *
 * Standalone script for external cron (no Express server needed).
 * Triggers daily content generation, waits for jobs to complete,
 * uploads to YouTube with publishAt for scheduled publishing, then exits.
 *
 * Usage:
 *   npx tsx tools/daily-cron-runner.ts
 *
 * Crontab (midnight PT daily):
 *   0 0 * * * /home/aaronishere2025/tools/daily-cron.sh
 *
 * Upload slot → publish time (America/Los_Angeles):
 *   Slot 0:  8:00 AM PT → RappingThroughHistory (history)
 *   Slot 1: 10:00 AM PT → ChillBeats4Me (lofi)
 *   Slot 2: 12:00 PM PT → Trap Beats INC (trap #1)
 *   Slot 3:  3:00 PM PT → Trap Beats INC (trap #2)
 */

import { initializeSecretsWithFallback } from '../server/secret-manager-loader.js';
import { db, pool } from '../server/db.js';
import { jobs } from '../shared/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';

// ── Publish-time mapping (hours in PT) ────────────────────────────
const SLOT_PUBLISH_HOURS: Record<number, number> = {
  0: 8, // 8 AM PT
  1: 10, // 10 AM PT
  2: 12, // 12 PM PT
  3: 15, // 3 PM PT
};

const SLOT_LABELS: Record<number, string> = {
  0: 'RappingThroughHistory @ 8 AM PT',
  1: 'ChillBeats4Me @ 10 AM PT',
  2: 'Trap Beats INC @ 12 PM PT',
  3: 'Trap Beats INC @ 3 PM PT',
};

// ── Config ────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 30_000; // 30 seconds
const MAX_WAIT_MS = 3 * 60 * 60_000; // 3 hours

// ── Helpers ───────────────────────────────────────────────────────

function log(msg: string) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  console.log(`[${ts}] ${msg}`);
}

/**
 * Build an ISO 8601 publishAt timestamp for today at the given PT hour.
 * YouTube requires UTC time; we convert from PT.
 */
function buildPublishAt(slotIndex: number): string {
  const hour = SLOT_PUBLISH_HOURS[slotIndex];
  if (hour === undefined) {
    throw new Error(`Unknown upload slot: ${slotIndex}`);
  }

  // Create a date in PT for today at the given hour
  const now = new Date();
  // Use Intl to get the current PT offset
  const ptFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = ptFormatter.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === 'year')!.value);
  const month = parseInt(parts.find((p) => p.type === 'month')!.value) - 1;
  const day = parseInt(parts.find((p) => p.type === 'day')!.value);

  // Build a date string in PT, then convert to UTC
  // We construct the date in UTC and adjust by the PT offset
  const ptDate = new Date(Date.UTC(year, month, day, hour, 0, 0));

  // Calculate PT offset: PST = UTC-8, PDT = UTC-7
  // We determine this by checking what the offset is right now in PT
  const testDate = new Date(year, month, day, hour, 0, 0);
  const utcStr = testDate.toLocaleString('en-US', { timeZone: 'UTC' });
  const ptStr = testDate.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' });
  const utcDate = new Date(utcStr);
  const ptDateLocal = new Date(ptStr);
  const offsetMs = utcDate.getTime() - ptDateLocal.getTime();

  // ptDate is already in UTC with PT hours — we need to add the offset
  // Actually, simpler approach: construct the time we want in PT and convert to UTC
  const targetPT = new Date(
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00`,
  );
  // Get the UTC time by adding the PT-to-UTC offset
  // In America/Los_Angeles: UTC = PT + 8 (PST) or PT + 7 (PDT)
  const isDST = new Date(year, month, day)
    .toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      timeZoneName: 'short',
    })
    .includes('PDT');
  const ptOffsetHours = isDST ? 7 : 8;
  const publishUTC = new Date(targetPT.getTime() + ptOffsetHours * 60 * 60 * 1000);

  return publishUTC.toISOString();
}

/**
 * Wait for all given job IDs to reach a terminal state (completed or failed).
 */
async function waitForJobs(jobIds: string[]): Promise<{ completed: string[]; failed: string[] }> {
  const completed: string[] = [];
  const failed: string[] = [];
  const pending = new Set(jobIds);
  const startTime = Date.now();

  log(
    `Waiting for ${jobIds.length} jobs to finish (polling every ${POLL_INTERVAL_MS / 1000}s, timeout ${MAX_WAIT_MS / 1000 / 60} min)...`,
  );

  while (pending.size > 0 && Date.now() - startTime < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const pendingIds = Array.from(pending);
    const rows = await db
      .select({ id: jobs.id, status: jobs.status, scriptName: jobs.scriptName })
      .from(jobs)
      .where(inArray(jobs.id, pendingIds));

    for (const row of rows) {
      if (row.status === 'completed') {
        completed.push(row.id);
        pending.delete(row.id);
        log(`  ✅ ${row.scriptName || row.id} → completed`);
      } else if (row.status === 'failed') {
        failed.push(row.id);
        pending.delete(row.id);
        log(`  ❌ ${row.scriptName || row.id} → failed`);
      }
    }

    if (pending.size > 0) {
      const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
      log(`  ⏳ ${pending.size} jobs still running (${elapsed} min elapsed)`);
    }
  }

  if (pending.size > 0) {
    log(`⚠️  Timed out with ${pending.size} jobs still running`);
    for (const id of pending) {
      failed.push(id);
    }
  }

  return { completed, failed };
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const overallStart = Date.now();

  log('╔════════════════════════════════════════════════════════════╗');
  log('║      DAILY CRON RUNNER — Headless Pipeline                ║');
  log('╚════════════════════════════════════════════════════════════╝');

  // 1. Load secrets
  log('Loading secrets...');
  await initializeSecretsWithFallback();
  log('Secrets loaded');

  // Track all job IDs we create
  const allJobIds: string[] = [];

  // 2. Trigger beat generation (1 lofi + 2 trap = 3 jobs)
  log('');
  log('━━━ Beat Generation ━━━');
  try {
    const { beatScheduler } = await import('../server/services/beat-scheduler.js');
    await beatScheduler.triggerGenerationNow();

    // Fetch recently created beat jobs (created in last 2 minutes with beat-scheduler source)
    const recentCutoff = new Date(Date.now() - 2 * 60 * 1000);
    const beatJobs = await db
      .select({ id: jobs.id, scriptName: jobs.scriptName })
      .from(jobs)
      .where(
        and(
          sql`${jobs.createdAt} >= ${recentCutoff}`,
          sql`(${jobs.unityMetadata}->>'automationSource') = 'beat-scheduler'`,
        ),
      );

    for (const j of beatJobs) {
      allJobIds.push(j.id);
      log(`  Beat job queued: ${j.scriptName} (${j.id})`);
    }
    log(`${beatJobs.length} beat jobs created`);
  } catch (err: any) {
    log(`❌ Beat generation failed: ${err.message}`);
  }

  // 3. Trigger history video generation (1 job)
  log('');
  log('━━━ History Video Generation ━━━');
  try {
    const { videoScheduler } = await import('../server/services/video-scheduler.js');
    await videoScheduler.runDailyGeneration();

    // Fetch recently created history jobs
    const recentCutoff = new Date(Date.now() - 5 * 60 * 1000);
    const historyJobs = await db
      .select({ id: jobs.id, scriptName: jobs.scriptName })
      .from(jobs)
      .where(
        and(
          sql`${jobs.createdAt} >= ${recentCutoff}`,
          sql`(${jobs.unityMetadata}->>'automationSource') = 'video-scheduler'`,
        ),
      );

    for (const j of historyJobs) {
      if (!allJobIds.includes(j.id)) {
        allJobIds.push(j.id);
        log(`  History job queued: ${j.scriptName} (${j.id})`);
      }
    }
    log(`${historyJobs.length} history jobs created`);
  } catch (err: any) {
    log(`❌ History video generation failed: ${err.message}`);
  }

  if (allJobIds.length === 0) {
    log('No jobs were created. Exiting.');
    await pool.end();
    process.exit(1);
  }

  // 4. Start job worker to process the queue
  log('');
  log('━━━ Processing Jobs ━━━');
  const { jobWorker } = await import('../server/services/job-worker.js');
  await jobWorker.start();

  // 5. Poll until all jobs reach terminal state
  const { completed, failed } = await waitForJobs(allJobIds);

  // 6. Stop the job worker
  jobWorker.stop();

  // 7. Upload completed jobs with publishAt
  log('');
  log('━━━ YouTube Uploads ━━━');

  const { uploadJobToYouTube } = await import('../server/services/video-scheduler.js');
  let uploadSuccess = 0;
  let uploadFailed = 0;

  for (const jobId of completed) {
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

    if (!job) continue;
    if (!job.autoUpload) {
      log(`  Skipping ${job.scriptName} — autoUpload is false`);
      continue;
    }
    if (job.uploadedAt) {
      log(`  Skipping ${job.scriptName} — already uploaded`);
      continue;
    }

    const uploadSlot = (job.unityMetadata as any)?.uploadSlot;
    if (uploadSlot === undefined || uploadSlot === null) {
      log(`  ⚠️ Skipping ${job.scriptName} — no uploadSlot in metadata`);
      continue;
    }

    try {
      const publishAt = buildPublishAt(uploadSlot);
      const slotLabel = SLOT_LABELS[uploadSlot] || `Slot ${uploadSlot}`;

      log(`  Uploading: ${job.scriptName} → ${slotLabel}`);
      log(`    publishAt: ${publishAt}`);

      const result = await uploadJobToYouTube(job, { publishAt });

      if (result.success) {
        log(`  ✅ Uploaded: ${result.videoId} → scheduled for ${slotLabel}`);
        uploadSuccess++;
      } else {
        log(`  ❌ Upload failed: ${result.error}`);
        uploadFailed++;
      }
    } catch (err: any) {
      log(`  ❌ Upload error for ${job.scriptName}: ${err.message}`);
      uploadFailed++;
    }

    // Rate limit protection between uploads
    await new Promise((r) => setTimeout(r, 5000));
  }

  // 8. Summary
  const totalDuration = ((Date.now() - overallStart) / 1000 / 60).toFixed(1);

  log('');
  log('╔════════════════════════════════════════════════════════════╗');
  log('║      DAILY CRON SUMMARY                                   ║');
  log('╚════════════════════════════════════════════════════════════╝');
  log(`  Jobs created:   ${allJobIds.length}`);
  log(`  Jobs completed: ${completed.length}`);
  log(`  Jobs failed:    ${failed.length}`);
  log(`  Uploads OK:     ${uploadSuccess}`);
  log(`  Uploads failed: ${uploadFailed}`);
  log(`  Total time:     ${totalDuration} min`);
  log('');

  // 9. Disconnect DB and exit
  await pool.end();
  const exitCode = failed.length > 0 || uploadFailed > 0 ? 1 : 0;
  log(`Exiting with code ${exitCode}`);
  process.exit(exitCode);
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
