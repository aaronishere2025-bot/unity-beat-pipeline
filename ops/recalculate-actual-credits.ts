import { db } from './server/db';
import { jobs } from './shared/schema';
import { gte, desc } from 'drizzle-orm';

async function recalculateActualCredits() {
  const sinceJan18 = new Date('2026-01-18');

  const allJobs = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      scriptContent: jobs.scriptContent,
      status: jobs.status,
      retryCount: jobs.retryCount,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .where(gte(jobs.createdAt, sinceJan18))
    .orderBy(desc(jobs.createdAt));

  console.log('💰 ACTUAL CREDIT USAGE CALCULATION (Corrected Prices)\n');
  console.log(`Total jobs since Jan 18: ${allJobs.length}\n`);

  let totalSunoCredits = 0;
  let totalKlingCredits = 0;
  let longFormJobs = 0;

  for (const job of allJobs) {
    const name = job.scriptName || '';
    const content = job.scriptContent || '';
    const isLong = name.includes('30-Minute') || content.includes('30:00');
    const retries = job.retryCount || 0;
    const attempts = 1 + retries;

    if (isLong) {
      longFormJobs++;
      // 30-minute mix: 10 songs + 10 video clips
      const sunoCredits = 10 * 10 * attempts; // 10 songs × 10 credits × attempts
      const klingCredits = 10 * 55 * attempts; // 10 clips × 55 credits × attempts

      totalSunoCredits += sunoCredits;
      totalKlingCredits += klingCredits;

      console.log(`${job.status === 'completed' ? '✅' : '❌'} ${name?.slice(0, 50)}`);
      console.log(`   Attempts: ${attempts}`);
      console.log(`   Suno: ${sunoCredits} credits`);
      console.log(`   Kling: ${klingCredits} credits`);
      console.log(`   Total: ${sunoCredits + klingCredits} credits\n`);
    } else {
      // Regular single beat: 1 song + 1 video clip
      const sunoCredits = 10 * attempts;
      const klingCredits = 55 * attempts;

      totalSunoCredits += sunoCredits;
      totalKlingCredits += klingCredits;
    }
  }

  const regularJobs = allJobs.length - longFormJobs;

  console.log('\n─'.repeat(60));
  console.log(`📊 BREAKDOWN:`);
  console.log(`   Long-form (30-min) jobs: ${longFormJobs}`);
  console.log(`   Regular single jobs: ${regularJobs}\n`);

  console.log(`💰 TOTAL CREDIT USAGE:`);
  console.log(`   Suno (music): ${totalSunoCredits} credits`);
  console.log(`   Kling (video): ${totalKlingCredits} credits`);
  console.log(`   ─────────────────────────────────`);
  console.log(`   TOTAL: ${totalSunoCredits + totalKlingCredits} credits`);
  console.log(`   Cost: $${((totalSunoCredits + totalKlingCredits) * 0.005).toFixed(2)}\n`);

  console.log(`📈 EXPECTED BALANCE:`);
  console.log(`   Purchased: 20,000 credits`);
  console.log(`   Spent: ${totalSunoCredits + totalKlingCredits} credits`);
  console.log(`   Remaining: ${20000 - (totalSunoCredits + totalKlingCredits)} credits`);
}

recalculateActualCredits().catch(console.error);
