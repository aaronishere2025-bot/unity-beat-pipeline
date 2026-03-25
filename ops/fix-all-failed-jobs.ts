import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, and, gte } from 'drizzle-orm';

console.log('🔧 Fixing failed jobs...\n');

// Fix jobs at 100% progress (completed but marked failed)
const completedButFailed = await db
  .select()
  .from(jobs)
  .where(and(eq(jobs.status, 'failed'), gte(jobs.progress, 100)));

console.log('Jobs at 100% to mark as completed:', completedButFailed.length);

for (const job of completedButFailed) {
  console.log('  Fixing:', job.scriptName || job.id);
  await db
    .update(jobs)
    .set({
      status: 'completed',
      error: null,
      errorMessage: null,
      completedAt: new Date(),
    })
    .where(eq(jobs.id, job.id));
}

console.log('\n✅ All 100% jobs marked as completed\n');

// Reset jobs at < 100% progress for retry (now that Suno credits work)
const earlyFailed = await db
  .select()
  .from(jobs)
  .where(and(eq(jobs.status, 'failed')));

const toRetry = earlyFailed.filter((j) => (j.progress || 0) < 100);

console.log('Jobs to reset for retry:', toRetry.length);

for (const job of toRetry) {
  console.log('  Resetting:', job.scriptName || job.id, '(' + job.progress + '%)');
  await db
    .update(jobs)
    .set({
      status: 'queued',
      error: null,
      errorMessage: null,
      retryCount: 0,
      progress: 0,
    })
    .where(eq(jobs.id, job.id));
}

console.log('\n✅ All early-failed jobs reset to queued');
console.log('💡 Server will auto-process these jobs now that Suno credits are loaded');
