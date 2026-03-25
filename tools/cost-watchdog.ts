/**
 * COST WATCHDOG — Active spend monitor with automatic pause
 *
 * Polls the server log for Kling API submissions every 15 seconds.
 * If spend rate exceeds threshold (e.g. >$3 in 2 minutes), pauses
 * all processing jobs to prevent a spend loop.
 *
 * Usage: npx tsx tools/cost-watchdog.ts [budget] [logfile]
 *   budget  — total budget in dollars (default: 30)
 *   logfile — server log to monitor (auto-detected)
 */

import { db, pool } from '../server/db.js';
import { jobs } from '../shared/schema.js';
import { eq, and, sql, inArray } from 'drizzle-orm';

// ── Config ────────────────────────────────────────────────────────
const BUDGET = parseFloat(process.argv[2] || '30');
const POLL_INTERVAL_MS = 15_000; // 15 seconds
const SPIKE_WINDOW_MS = 2 * 60_000; // 2-minute rolling window
const SPIKE_THRESHOLD = 3.0; // $3 in 2 minutes = spend loop
const KLING_COST_PER_CLIP = 0.3;
const LOG_FILE = process.argv[3] || '/tmp/claude-1001/-home-aaronishere2025/tasks/bc4e455.output';

// ── State ─────────────────────────────────────────────────────────
interface CostEvent {
  timestamp: number;
  cost: number;
  type: 'kling' | 'suno' | 'gemini';
}

const costHistory: CostEvent[] = [];
let totalKlingSpend = 0;
const totalSunoSpend = 0;
const totalGeminiSpend = 0;
let lastKlingCount = 0;
const lastSunoCount = 0;
const lastGeminiCount = 0;
let paused = false;
let lastLineCount = 0;

function log(msg: string) {
  const ts = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles' });
  console.log(`[${ts}] ${msg}`);
}

// ── Log file parsing ──────────────────────────────────────────────
async function countFromLog(): Promise<{ kling: number; suno: number; gemini: number; klingFails: number }> {
  try {
    const fs = await import('fs');
    const content = fs.readFileSync(LOG_FILE, 'utf-8');
    const lines = content.split('\n');

    let kling = 0;
    let suno = 0;
    let gemini = 0;
    let klingFails = 0;

    for (const line of lines) {
      if (line.includes('"code":200') && line.includes('kie.ai')) kling++;
      if (line.includes('Credits insufficient')) klingFails++;
      // Suno completions
      if (line.includes('[Suno] Poll status: FIRST_SUCCESS') || line.includes('[Suno] Poll status: SUCCESS')) suno++;
      // Gemini image generations
      if (line.includes('generateBackgroundImage') && line.includes('success')) gemini++;
    }

    lastLineCount = lines.length;
    return { kling, suno, gemini, klingFails };
  } catch {
    return { kling: 0, suno: 0, gemini: 0, klingFails: 0 };
  }
}

// ── DB-based cost query (more accurate) ───────────────────────────
async function getDBCosts(): Promise<{ kling: number; suno: number; gemini: number }> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const rows = await db.execute(sql`
      SELECT provider, SUM(cost) as total_cost, COUNT(*) as call_count
      FROM api_usage
      WHERE created_at >= ${cutoff}
      GROUP BY provider
    `);

    let kling = 0,
      suno = 0,
      gemini = 0;
    for (const row of rows.rows as any[]) {
      const cost = parseFloat(row.total_cost || '0');
      if (row.provider === 'kling') kling = cost;
      if (row.provider === 'suno') suno = cost;
      if (row.provider === 'gemini') gemini = cost;
    }
    return { kling, suno, gemini };
  } catch {
    return { kling: 0, suno: 0, gemini: 0 };
  }
}

// ── Pause all processing jobs ─────────────────────────────────────
async function pauseAllJobs(reason: string): Promise<number> {
  const processingJobs = await db
    .select({ id: jobs.id, name: jobs.scriptName })
    .from(jobs)
    .where(eq(jobs.status, 'processing'));

  let count = 0;
  for (const job of processingJobs) {
    await db
      .update(jobs)
      .set({
        status: 'failed' as any,
        errorMessage: `[Cost Watchdog] PAUSED: ${reason}`,
      })
      .where(eq(jobs.id, job.id));
    log(`  PAUSED: ${job.name} (${job.id})`);
    count++;
  }

  // Also pause queued jobs
  const queuedJobs = await db
    .select({ id: jobs.id, name: jobs.scriptName })
    .from(jobs)
    .where(eq(jobs.status, 'queued'));

  for (const job of queuedJobs) {
    await db
      .update(jobs)
      .set({
        status: 'failed' as any,
        errorMessage: `[Cost Watchdog] PAUSED: ${reason}`,
      })
      .where(eq(jobs.id, job.id));
    log(`  PAUSED (queued): ${job.name} (${job.id})`);
    count++;
  }

  return count;
}

// ── Check for spend spikes ────────────────────────────────────────
function checkForSpike(): { spiking: boolean; rate: number } {
  const now = Date.now();
  const windowStart = now - SPIKE_WINDOW_MS;

  // Only look at events in the rolling window
  const recentEvents = costHistory.filter((e) => e.timestamp >= windowStart);
  const recentSpend = recentEvents.reduce((sum, e) => sum + e.cost, 0);

  return {
    spiking: recentSpend > SPIKE_THRESHOLD,
    rate: recentSpend,
  };
}

// ── Main loop ─────────────────────────────────────────────────────
async function monitor() {
  log('╔════════════════════════════════════════════════════════════╗');
  log('║      COST WATCHDOG — Active Spend Monitor                 ║');
  log('╚════════════════════════════════════════════════════════════╝');
  log(`Budget: $${BUDGET.toFixed(2)}`);
  log(`Spike threshold: $${SPIKE_THRESHOLD.toFixed(2)} in ${SPIKE_WINDOW_MS / 1000}s window`);
  log(`Polling every ${POLL_INTERVAL_MS / 1000}s`);
  log('');

  // Initial counts
  const initial = await countFromLog();
  lastKlingCount = initial.kling;

  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    // Get current counts from log
    const current = await countFromLog();
    const dbCosts = await getDBCosts();

    // Calculate new clips since last poll
    const newKling = current.kling - lastKlingCount;
    const newKlingCost = newKling * KLING_COST_PER_CLIP;

    if (newKling > 0) {
      for (let i = 0; i < newKling; i++) {
        costHistory.push({ timestamp: Date.now(), cost: KLING_COST_PER_CLIP, type: 'kling' });
      }
    }

    lastKlingCount = current.kling;
    totalKlingSpend = current.kling * KLING_COST_PER_CLIP;

    // Total spend from DB (more accurate)
    const dbTotal = dbCosts.kling + dbCosts.suno + dbCosts.gemini;
    const logTotal = totalKlingSpend;
    const bestTotal = Math.max(dbTotal, logTotal);

    // Check for spend spike
    const spike = checkForSpike();

    // Build status line
    const status = [
      `Kling: $${totalKlingSpend.toFixed(2)} (${current.kling} clips)`,
      `DB total: $${dbTotal.toFixed(2)}`,
      `Budget: $${(BUDGET - bestTotal).toFixed(2)} remaining`,
      `Rate: $${spike.rate.toFixed(2)}/2min`,
    ].join(' | ');

    if (newKling > 0) {
      log(`💰 +${newKling} clips (+$${newKlingCost.toFixed(2)}) | ${status}`);
    } else {
      log(`📊 ${status}`);
    }

    // ── ALERTS ────────────────────────────────────────────────

    // Alert 1: Budget exceeded
    if (bestTotal >= BUDGET) {
      log('');
      log('🚨🚨🚨 BUDGET EXCEEDED — PAUSING ALL JOBS 🚨🚨🚨');
      log(`Total spend: $${bestTotal.toFixed(2)} >= budget $${BUDGET.toFixed(2)}`);
      const paused = await pauseAllJobs(`Budget exceeded: $${bestTotal.toFixed(2)} >= $${BUDGET.toFixed(2)}`);
      log(`Paused ${paused} jobs. Exiting watchdog.`);
      await pool.end();
      process.exit(1);
    }

    // Alert 2: Spend spike (possible loop)
    if (spike.spiking && !paused) {
      log('');
      log('🚨 SPEND SPIKE DETECTED — PAUSING ALL JOBS');
      log(`$${spike.rate.toFixed(2)} spent in last 2 minutes (threshold: $${SPIKE_THRESHOLD.toFixed(2)})`);
      const count = await pauseAllJobs(`Spend spike: $${spike.rate.toFixed(2)} in 2 minutes`);
      log(`Paused ${count} jobs.`);
      paused = true;
      // Don't exit — keep monitoring in case user restarts jobs
    }

    // Alert 3: Credit failures still climbing (API down or no credits)
    if (current.klingFails > 702 + 10) {
      // 702 was the baseline from before top-up
      log(`⚠️  New Kling credit failures detected: ${current.klingFails - 702} since top-up`);
    }

    // Alert 4: 80% budget warning
    if (bestTotal >= BUDGET * 0.8 && bestTotal < BUDGET) {
      log(`⚠️  80% budget warning: $${bestTotal.toFixed(2)} of $${BUDGET.toFixed(2)}`);
    }

    // Reset spike flag if spending normalized
    if (paused && !spike.spiking) {
      log('✅ Spend rate normalized. Watchdog still monitoring.');
      paused = false;
    }
  }
}

monitor().catch(async (err) => {
  console.error('WATCHDOG FATAL:', err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
