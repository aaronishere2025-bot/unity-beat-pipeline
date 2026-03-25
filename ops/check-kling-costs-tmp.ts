import { db } from './server/db.js';
import { apiUsage, jobs } from './shared/schema.js';
import { desc, eq, and, gte, sql, inArray } from 'drizzle-orm';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           KLING API CREDIT SPENDING ANALYSIS                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // ─── SECTION 1: All Kling API cost records from api_usage table (last 24h) ───
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SECTION 1: Kling API Usage Records (Last 24 Hours)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const klingUsage24h = await db
    .select()
    .from(apiUsage)
    .where(and(eq(apiUsage.service, 'kling'), gte(apiUsage.createdAt, twentyFourHoursAgo)))
    .orderBy(desc(apiUsage.createdAt));

  if (klingUsage24h.length === 0) {
    console.log('  No Kling API usage records found in the last 24 hours.\n');
  } else {
    const totalCost24h = klingUsage24h.reduce((sum, u) => sum + parseFloat(u.cost), 0);
    const successCount = klingUsage24h.filter((u) => u.success).length;
    const failCount = klingUsage24h.filter((u) => !u.success).length;

    console.log(`  Total records: ${klingUsage24h.length}`);
    console.log(`  Successful:    ${successCount}`);
    console.log(`  Failed:        ${failCount}`);
    console.log(`  Total cost:    $${totalCost24h.toFixed(4)}\n`);

    // By operation
    const byOp: Record<string, { count: number; cost: number; successCount: number; failCount: number }> = {};
    klingUsage24h.forEach((u) => {
      if (!byOp[u.operation]) byOp[u.operation] = { count: 0, cost: 0, successCount: 0, failCount: 0 };
      byOp[u.operation].count++;
      byOp[u.operation].cost += parseFloat(u.cost);
      if (u.success) byOp[u.operation].successCount++;
      else byOp[u.operation].failCount++;
    });

    console.log('  By Operation:');
    Object.entries(byOp)
      .sort((a, b) => b[1].cost - a[1].cost)
      .forEach(([op, data]) => {
        console.log(
          `    ${op}: $${data.cost.toFixed(4)} (${data.count} calls, ${data.successCount} ok / ${data.failCount} fail)`,
        );
      });

    // By job
    const byJob: Record<
      string,
      { count: number; cost: number; successCount: number; failCount: number; clipCount: number }
    > = {};
    klingUsage24h.forEach((u) => {
      const jid = u.jobId || 'unknown';
      if (!byJob[jid]) byJob[jid] = { count: 0, cost: 0, successCount: 0, failCount: 0, clipCount: 0 };
      byJob[jid].count++;
      byJob[jid].cost += parseFloat(u.cost);
      if (u.success) byJob[jid].successCount++;
      else byJob[jid].failCount++;
      const meta = u.metadata as any;
      if (meta && meta.clipCount) byJob[jid].clipCount += meta.clipCount;
    });

    console.log('\n  By Job ID:');
    Object.entries(byJob)
      .sort((a, b) => b[1].cost - a[1].cost)
      .forEach(([jobId, data]) => {
        console.log(
          `    ${jobId.slice(0, 8)}...: $${data.cost.toFixed(4)} (${data.count} API calls, ${data.clipCount} clips tracked, ${data.successCount} ok / ${data.failCount} fail)`,
        );
      });

    // Show last 20 records detail
    console.log('\n  Last 20 Kling API Records:');
    klingUsage24h.slice(0, 20).forEach((u) => {
      const ts = new Date(u.createdAt).toISOString().replace('T', ' ').slice(0, 19);
      const status = u.success ? 'OK' : 'FAIL';
      const meta = u.metadata as any;
      const clips = meta?.clipCount || '?';
      const errMsg = u.errorMessage ? ` | ERR: ${u.errorMessage.slice(0, 60)}` : '';
      console.log(
        `    [${ts}] ${status} | $${parseFloat(u.cost).toFixed(4)} | ${clips} clips | ${u.operation}${errMsg}`,
      );
    });
  }

  // ─── SECTION 2: The 4 unity_kling processing jobs ───
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SECTION 2: The 4 Unity Kling Jobs (Processing)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Find the 4 specific jobs by their known IDs from the log
  const jobIds = [
    '66e9fcaa-9d8c-4a86-9d74-7149de8f926c', // Zu Chongzhi
    'f63ed649-2774-4492-86db-5ca36aef90af', // Salem Witch Trials
    '2a01766e-6820-4ba3-b8b5-bb1621f9e3eb', // Florida Edwards
    '9c70e2b0-7757-461f-b1ca-3e06b4aac912', // Napoleon Bonaparte
  ];

  const targetJobs = await db.select().from(jobs).where(inArray(jobs.id, jobIds));

  // Also fallback: search for recent unity_kling processing jobs
  if (targetJobs.length === 0) {
    console.log('  Known job IDs not found, searching for recent unity_kling jobs...\n');
    const recentKlingJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.mode, 'unity_kling'), gte(jobs.createdAt, twentyFourHoursAgo)))
      .orderBy(desc(jobs.createdAt))
      .limit(10);

    recentKlingJobs.forEach((job) => printJobDetails(job));
  } else {
    for (const job of targetJobs) {
      printJobDetails(job);

      // Get Kling API usage for this specific job
      const jobKlingUsage = await db
        .select()
        .from(apiUsage)
        .where(and(eq(apiUsage.service, 'kling'), eq(apiUsage.jobId, job.id)))
        .orderBy(desc(apiUsage.createdAt));

      if (jobKlingUsage.length > 0) {
        const totalJobCost = jobKlingUsage.reduce((sum, u) => sum + parseFloat(u.cost), 0);
        const totalClips = jobKlingUsage.reduce((sum, u) => {
          const meta = u.metadata as any;
          return sum + (meta?.clipCount || 0);
        }, 0);
        const successOps = jobKlingUsage.filter((u) => u.success).length;
        const failOps = jobKlingUsage.filter((u) => !u.success).length;

        console.log(`    Kling API records: ${jobKlingUsage.length} entries`);
        console.log(`    Total tracked clips: ${totalClips}`);
        console.log(`    API calls OK/FAIL: ${successOps}/${failOps}`);
        console.log(`    Total Kling cost for job: $${totalJobCost.toFixed(4)}`);

        if (failOps > 0) {
          const failMsgs = jobKlingUsage.filter((u) => !u.success && u.errorMessage);
          const errorTypes: Record<string, number> = {};
          failMsgs.forEach((u) => {
            const key = u.errorMessage!.slice(0, 80);
            errorTypes[key] = (errorTypes[key] || 0) + 1;
          });
          console.log('    Error breakdown:');
          Object.entries(errorTypes).forEach(([msg, count]) => {
            console.log(`      [${count}x] ${msg}`);
          });
        }
      } else {
        console.log('    No Kling API usage records found for this job.');
      }
      console.log('');
    }
  }

  // ─── SECTION 3: Total Kling spend (all time) ───
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SECTION 3: Total Kling Spend (All Time vs Last 24h)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const allKlingUsage = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.service, 'kling'))
    .orderBy(desc(apiUsage.createdAt));

  const totalAllTime = allKlingUsage.reduce((sum, u) => sum + parseFloat(u.cost), 0);
  const totalLast24h = klingUsage24h.reduce((sum, u) => sum + parseFloat(u.cost), 0);
  const totalSuccessAllTime = allKlingUsage.filter((u) => u.success).length;
  const totalFailAllTime = allKlingUsage.filter((u) => !u.success).length;
  const totalClipsAllTime = allKlingUsage.reduce((sum, u) => {
    const meta = u.metadata as any;
    return sum + (meta?.clipCount || 0);
  }, 0);

  console.log(`  All-time Kling records: ${allKlingUsage.length}`);
  console.log(`  All-time total cost:    $${totalAllTime.toFixed(4)}`);
  console.log(`  All-time clips tracked: ${totalClipsAllTime}`);
  console.log(`  All-time OK/FAIL:       ${totalSuccessAllTime}/${totalFailAllTime}`);
  console.log(`  Last 24h cost:          $${totalLast24h.toFixed(4)}`);
  console.log(`  Last 24h records:       ${klingUsage24h.length}`);

  // By day breakdown
  console.log('\n  Daily Breakdown (Last 7 Days):');
  const byDay: Record<string, { cost: number; count: number; ok: number; fail: number }> = {};
  allKlingUsage.forEach((u) => {
    const day = new Date(u.createdAt).toISOString().split('T')[0];
    if (!byDay[day]) byDay[day] = { cost: 0, count: 0, ok: 0, fail: 0 };
    byDay[day].cost += parseFloat(u.cost);
    byDay[day].count++;
    if (u.success) byDay[day].ok++;
    else byDay[day].fail++;
  });
  Object.entries(byDay)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 7)
    .forEach(([day, data]) => {
      console.log(`    ${day}: $${data.cost.toFixed(4)} (${data.count} records, ${data.ok} ok / ${data.fail} fail)`);
    });

  // ─── SECTION 4: Check recent unity_kling jobs for comparison ───
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SECTION 4: All Recent Unity Kling Jobs (Last 24h)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const recentUnityKlingJobs = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.mode, 'unity_kling'), gte(jobs.createdAt, twentyFourHoursAgo)))
    .orderBy(desc(jobs.createdAt));

  if (recentUnityKlingJobs.length === 0) {
    console.log('  No unity_kling jobs found in the last 24 hours.');
  } else {
    console.log(`  Found ${recentUnityKlingJobs.length} unity_kling jobs:\n`);
    for (const job of recentUnityKlingJobs) {
      // Skip jobs already shown in section 2
      if (jobIds.includes(job.id)) continue;
      printJobDetails(job);
      console.log('');
    }
  }

  // ─── SECTION 5: Cost estimate from log analysis ───
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  SECTION 5: Kling Credit Cost Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Kling pricing: $0.30 per 15s clip
  console.log('  Pricing reference: $0.30 per 15-second clip (Kling 3.0)\n');

  // Summarize the 4 jobs from log
  const logSummary = [
    { name: 'Zu Chongzhi', id: '66e9fcaa', totalClips: 26, savedBefore: 0, note: 'Was at 100% before restart' },
    {
      name: 'Salem Witch Trials',
      id: 'f63ed649',
      totalClips: 26,
      savedBefore: 10,
      note: '10 clips saved from prev run',
    },
    { name: 'Florida Edwards', id: '2a01766e', totalClips: 26, savedBefore: 10, note: '10 clips saved from prev run' },
    { name: 'Napoleon Bonaparte', id: '9c70e2b0', totalClips: 26, savedBefore: 3, note: '3 clips saved from prev run' },
  ];

  console.log('  From log analysis (bc4e455.output):');
  console.log('  Each job has 26 total clips. Clips 1-10 were submitted first, then 11-20, then 21-26.');
  console.log('  "Credits insufficient" errors started appearing during the initial batch.\n');

  logSummary.forEach((s) => {
    const newClipsNeeded = s.totalClips - s.savedBefore;
    const costIfAllSucceeded = newClipsNeeded * 0.3;
    console.log(
      `    ${s.name} (${s.id}...): ${s.totalClips} clips total, ${s.savedBefore} pre-saved, ${newClipsNeeded} new needed`,
    );
    console.log(`      Estimated cost if all succeeded: $${costIfAllSucceeded.toFixed(2)}`);
    console.log(`      Note: ${s.note}`);
  });

  const totalNewClipsNeeded = logSummary.reduce((sum, s) => sum + (s.totalClips - s.savedBefore), 0);
  const totalMaxCost = totalNewClipsNeeded * 0.3;
  console.log(`\n    Total new clips needed:              ${totalNewClipsNeeded}`);
  console.log(`    Max cost if ALL clips succeeded:     $${totalMaxCost.toFixed(2)}`);
  console.log(`    (Actual cost lower due to "Credits insufficient" failures)`);
  console.log(`\n    NOTE: "Credits insufficient" means the kie.ai account balance hit zero.`);
  console.log(`    Credits were exhausted during the batch submission of clips 1-10 for the 4 jobs.`);
  console.log(`    All subsequent attempts (attempts 2/3 and 3/3) also failed.`);

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                     ANALYSIS COMPLETE                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  process.exit(0);
}

function printJobDetails(job: any) {
  const created = new Date(job.createdAt).toISOString().replace('T', ' ').slice(0, 19);
  const updated = new Date(job.updatedAt).toISOString().replace('T', ' ').slice(0, 19);
  const ageMinutes = Math.round((Date.now() - new Date(job.createdAt).getTime()) / 60000);

  console.log(`  Job: ${job.id}`);
  console.log(`    Name:        ${job.scriptName || 'N/A'}`);
  console.log(`    Mode:        ${job.mode}`);
  console.log(`    Status:      ${job.status}`);
  console.log(`    Progress:    ${job.progress}%`);
  console.log(`    Created:     ${created} (${ageMinutes} min ago)`);
  console.log(`    Updated:     ${updated}`);
  console.log(`    Clip Count:  ${job.clipCount || 'N/A'}`);
  console.log(`    Cost:        $${job.cost || 'N/A'}`);
  console.log(`    Actual Cost: $${job.actualCostUSD || 'N/A'}`);
  console.log(`    Retry Count: ${job.retryCount}`);

  if (job.completedClips && Array.isArray(job.completedClips)) {
    console.log(`    Saved Clips: ${job.completedClips.length}`);
    const clipCost = job.completedClips.reduce((sum: number, c: any) => sum + (c.cost || 0), 0);
    console.log(`    Clip Cost:   $${clipCost.toFixed(4)}`);
  }

  if (job.unityMetadata) {
    const um = job.unityMetadata as any;
    console.log(`    Unity Pkg:   ${um.packageId || 'N/A'}`);
    console.log(`    Topic:       ${um.topic || 'N/A'}`);
    console.log(`    Prompt Cnt:  ${um.promptCount || 'N/A'}`);
    console.log(`    Est. Cost:   $${um.estimatedCost || 'N/A'}`);
    console.log(`    Video Eng:   ${um.videoEngine || 'N/A'}`);
  }

  if (job.errorMessage) {
    console.log(`    ERROR:       ${job.errorMessage.slice(0, 120)}`);
  }
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
