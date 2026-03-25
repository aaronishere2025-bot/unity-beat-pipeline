import { db } from './server/db.js';
import { apiUsage, jobs, errorReports } from './shared/schema.js';
import { desc, eq, and, gte, sql } from 'drizzle-orm';

async function main() {
  console.log('=== OpenAI Cost Analysis ===\n');

  // Get total OpenAI costs
  const allOpenAIUsage = await db
    .select()
    .from(apiUsage)
    .where(eq(apiUsage.service, 'openai'))
    .orderBy(desc(apiUsage.createdAt));

  const totalOpenAICost = allOpenAIUsage.reduce((sum, usage) => sum + parseFloat(usage.cost), 0);

  console.log(`Total OpenAI API Cost: $${totalOpenAICost.toFixed(2)}\n`);

  // Cost by model
  const costsByModel: Record<string, number> = {};
  const countsByModel: Record<string, number> = {};

  allOpenAIUsage.forEach((usage) => {
    const model = usage.model;
    costsByModel[model] = (costsByModel[model] || 0) + parseFloat(usage.cost);
    countsByModel[model] = (countsByModel[model] || 0) + 1;
  });

  console.log('Cost by Model:');
  Object.entries(costsByModel)
    .sort((a, b) => b[1] - a[1])
    .forEach(([model, cost]) => {
      console.log(`  ${model}: $${cost.toFixed(2)} (${countsByModel[model]} calls)`);
    });

  console.log('\n=== Recent OpenAI Usage (Last 20 calls) ===\n');
  allOpenAIUsage.slice(0, 20).forEach((usage) => {
    const timestamp = new Date(usage.createdAt).toISOString();
    const status = usage.success ? '✅' : '❌';
    console.log(
      `${status} ${timestamp} | ${usage.model} | ${usage.operation} | $${parseFloat(usage.cost).toFixed(4)} | ${usage.tokens || 0} tokens`,
    );
    if (!usage.success) {
      console.log(`   ERROR: ${usage.errorMessage}`);
    }
  });

  // Cost by operation type
  console.log('\n=== Cost by Operation Type ===\n');
  const costsByOperation: Record<string, number> = {};
  const countsByOperation: Record<string, number> = {};

  allOpenAIUsage.forEach((usage) => {
    const op = usage.operation;
    costsByOperation[op] = (costsByOperation[op] || 0) + parseFloat(usage.cost);
    countsByOperation[op] = (countsByOperation[op] || 0) + 1;
  });

  Object.entries(costsByOperation)
    .sort((a, b) => b[1] - a[1])
    .forEach(([operation, cost]) => {
      console.log(`  ${operation}: $${cost.toFixed(2)} (${countsByOperation[operation]} calls)`);
    });

  // Recent error analysis
  console.log('\n=== Multi-Model Error Analysis Activity ===\n');
  const recentErrors = await db.select().from(errorReports).orderBy(desc(errorReports.createdAt)).limit(10);

  if (recentErrors.length > 0) {
    console.log(`Found ${recentErrors.length} recent error reports:`);
    recentErrors.forEach((err) => {
      console.log(`  ${err.id} | ${err.severity} | ${new Date(err.createdAt).toISOString()}`);
      console.log(`    Job: ${err.jobId || 'N/A'}`);
    });
  } else {
    console.log('No recent error reports found.');
  }

  // Recent jobs
  console.log('\n=== Recent Jobs (Last 10) ===\n');
  const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(10);

  recentJobs.forEach((job) => {
    console.log(`${job.id} | ${job.status} | ${job.mode} | Created: ${new Date(job.createdAt).toISOString()}`);
    if (job.error) {
      console.log(`  ERROR: ${job.error}`);
    }
  });

  process.exit(0);
}

main().catch(console.error);
