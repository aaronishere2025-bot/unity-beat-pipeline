import { db } from './server/db.js';
import { jobs, apiUsage } from './shared/schema.js';
import { sql } from 'drizzle-orm';

async function checkData() {
  console.log('📊 Database Statistics:\n');

  // Count jobs
  const jobCount = await db.select({ count: sql<number>`count(*)` }).from(jobs);
  console.log(`Total Jobs: ${jobCount[0].count}`);

  // Count jobs by status
  const jobsByStatus = await db
    .select({
      status: jobs.status,
      count: sql<number>`count(*)`,
    })
    .from(jobs)
    .groupBy(jobs.status);

  console.log('\nJobs by status:');
  jobsByStatus.forEach((s) => console.log(`  ${s.status}: ${s.count}`));

  // Count jobs by mode
  const jobsByMode = await db
    .select({
      mode: jobs.mode,
      count: sql<number>`count(*)`,
    })
    .from(jobs)
    .groupBy(jobs.mode);

  console.log('\nJobs by mode:');
  jobsByMode.forEach((m) => console.log(`  ${m.mode}: ${m.count}`));

  // Count API usage
  const apiCount = await db.select({ count: sql<number>`count(*)` }).from(apiUsage);
  console.log(`\n\nTotal API Usage Records: ${apiCount[0].count}`);

  // Get API usage by service
  const apiByService = await db
    .select({
      service: apiUsage.service,
      count: sql<number>`count(*)`,
      totalCost: sql<number>`sum(CAST(cost AS DECIMAL))`,
    })
    .from(apiUsage)
    .groupBy(apiUsage.service);

  console.log('\nAPI Usage by service:');
  apiByService.forEach((s) =>
    console.log(`  ${s.service}: ${s.count} calls, $${parseFloat(s.totalCost as any).toFixed(2)}`),
  );

  // Check if we have enough data for testing
  console.log('\n\n📈 Data Availability for Testing:');
  console.log(`  ✓ Jobs: ${jobCount[0].count > 0 ? 'YES' : 'NO (need to generate)'}`);
  console.log(`  ✓ API Usage: ${apiCount[0].count > 0 ? 'YES' : 'NO (need to generate)'}`);

  if (jobCount[0].count < 5) {
    console.log('\n⚠️  Recommendation: Generate at least 5 test jobs to populate charts');
  }
  if (apiCount[0].count < 20) {
    console.log('⚠️  Recommendation: Generate more API usage data for better visualizations');
  }

  process.exit(0);
}

checkData().catch(console.error);
