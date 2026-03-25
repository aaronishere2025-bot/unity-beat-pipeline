import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq, and, gte } from 'drizzle-orm';

async function cancelTodaysJobs() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log("🗑️  Canceling today's beat jobs...\n");

  const result = await db
    .update(jobs)
    .set({
      status: 'failed',
      error: 'Canceled - regenerating with 4-minute trap beats',
    })
    .where(and(gte(jobs.createdAt, today), eq(jobs.mode, 'music')));

  console.log('✅ Canceled jobs from today');
  console.log('   Ready to start fresh generation\n');
}

cancelTodaysJobs();
