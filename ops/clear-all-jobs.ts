import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { or, eq, ne } from 'drizzle-orm';

console.log('🧹 Clearing all non-completed jobs...\n');

// Keep only completed jobs, delete everything else
const deleted = await db.delete(jobs).where(ne(jobs.status, 'completed'));

console.log('✅ Cleared all queued, processing, and failed jobs');
console.log('   Only completed jobs remain in database\n');

// Show remaining jobs
const remaining = await db.select().from(jobs);
console.log(`📊 Remaining jobs: ${remaining.length}`);
for (const job of remaining.slice(0, 5)) {
  console.log(`   ✓ ${job.scriptName} (${job.status})`);
}
