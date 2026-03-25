import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, eq, and } from 'drizzle-orm';

async function findCompleted() {
  const completedUnity = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.mode, 'unity_kling'), eq(jobs.status, 'completed')))
    .orderBy(desc(jobs.createdAt))
    .limit(5);

  console.log(`Completed Unity Jobs: ${completedUnity.length}`);

  if (completedUnity.length === 0) {
    console.log('\n❌ No completed unity_kling jobs found in database.');
    console.log('\nThis means:');
    console.log('1. ALL recent unity_kling jobs are failing (we fixed those bugs)');
    console.log('2. The "fallback issue" might be referring to:');
    console.log('   - Older jobs (before recent failures)');
    console.log('   - Jobs in "kling" mode (not unity_kling)');
    console.log('   - Unity package content that lacks variety\n');

    // Check for ANY completed jobs to understand the issue better
    const anyCompleted = await db
      .select()
      .from(jobs)
      .where(eq(jobs.status, 'completed'))
      .orderBy(desc(jobs.createdAt))
      .limit(3);

    console.log(`\nRecent completed jobs (any mode): ${anyCompleted.length}`);
    for (const job of anyCompleted) {
      console.log(`  - ${job.scriptName} (mode: ${job.mode})`);
    }
  } else {
    for (const job of completedUnity) {
      console.log(`\nJob: ${job.scriptName}`);
      console.log(`Prompts: ${job.prompts?.length || 0}`);
      if (job.prompts && job.prompts.length > 0) {
        console.log(`First prompt: ${job.prompts[0].substring(0, 100)}...`);
      }
    }
  }
}

findCompleted()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
