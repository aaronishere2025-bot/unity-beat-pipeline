import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const jobId = '77da3ada-3014-4e8b-8007-eb46c19c8458';

console.log(`Fixing job ${jobId}...`);

// Check current status
const current = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
if (current.length === 0) {
  console.log('❌ Job not found');
  process.exit(1);
}

console.log('\nBefore:');
console.log('  Status:', current[0].status);
console.log('  Progress:', current[0].progress);
console.log('  Error:', current[0].error);
console.log('  Video:', current[0].videoUrl);

// Update to completed
await db
  .update(jobs)
  .set({
    status: 'completed',
    error: null,
    errorMessage: null,
    completedAt: new Date(),
    cost: '0.20',
  })
  .where(eq(jobs.id, jobId));

console.log('\n✅ Job updated to completed status');

// Verify
const updated = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
console.log('\nAfter:');
console.log('  Status:', updated[0].status);
console.log('  Progress:', updated[0].progress);
console.log('  Error:', updated[0].error);
console.log('  Video:', updated[0].videoUrl);
console.log('\n✨ Job now shows as successfully completed!');
