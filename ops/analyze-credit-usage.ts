import { db } from './server/db';
import { jobs } from './shared/schema';
import { desc, gte } from 'drizzle-orm';

async function analyzeCreditUsage() {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const allJobs = await db
    .select({
      id: jobs.id,
      scriptName: jobs.scriptName,
      scriptContent: jobs.scriptContent,
      retryCount: jobs.retryCount,
      status: jobs.status,
    })
    .from(jobs)
    .where(gte(jobs.createdAt, oneWeekAgo))
    .orderBy(desc(jobs.createdAt));

  // Identify long-form jobs
  const longJobs: typeof allJobs = [];
  const regularJobs: typeof allJobs = [];

  console.log('🔍 Analyzing Credit Usage (Last 7 Days)\n');

  for (const job of allJobs) {
    const name = job.scriptName || '';
    const content = job.scriptContent || '';
    const isLong =
      name.includes('30-Minute') ||
      name.includes('30-Min') ||
      content.includes('30:00') ||
      content.includes('target 30:00');

    if (isLong) {
      longJobs.push(job);
    } else {
      regularJobs.push(job);
    }
  }

  // Calculate long-form job costs
  let totalLongCalls = 0;
  console.log(`📊 Long-Form Jobs (30-minute mixes): ${longJobs.length}\n`);

  for (const job of longJobs) {
    const songCount = 10; // 10 × 3min songs = 30min
    const retries = job.retryCount || 0;
    const totalCalls = songCount * (1 + retries);
    totalLongCalls += totalCalls;

    console.log(`${job.status === 'completed' ? '✅' : '❌'} ${job.scriptName?.slice(0, 50)}`);
    console.log(`   Songs: ${songCount} × Attempts: ${1 + retries} = ${totalCalls} Suno calls`);
    console.log(`   Credits: ${totalCalls * 10}`);
  }

  // Calculate regular job costs
  const regularCalls = regularJobs.reduce((sum, j) => sum + (1 + (j.retryCount || 0)), 0);

  console.log(`\n📊 Regular Jobs (single beats): ${regularJobs.length}`);
  console.log(`   Total Suno calls: ${regularCalls}`);
  console.log(`   Credits: ${regularCalls * 10}`);

  console.log(`\n💰 TOTAL CREDIT USAGE:`);
  console.log(`   Long-form jobs: ${totalLongCalls} calls × 10 credits = ${totalLongCalls * 10} credits`);
  console.log(`   Regular jobs: ${regularCalls} calls × 10 credits = ${regularCalls * 10} credits`);
  console.log(`   ─────────────────────────────────────────────`);
  console.log(`   TOTAL: ${(totalLongCalls + regularCalls) * 10} credits spent`);
  console.log(`   Cost: $${((totalLongCalls + regularCalls) * 0.1).toFixed(2)}`);

  console.log(`\n🔥 BIGGEST CREDIT CONSUMERS:`);
  console.log(`   30-minute jobs use 10× more credits than regular beats!`);
  console.log(`   Each 30-min job = ${10 * 10} credits minimum`);
  console.log(`   With retries = up to ${10 * 4 * 10} credits per failed 30-min job!`);
}

analyzeCreditUsage().catch(console.error);
