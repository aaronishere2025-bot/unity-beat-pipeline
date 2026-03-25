import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, desc } from 'drizzle-orm';

const queued = await db.select().from(jobs).where(eq(jobs.status, 'queued')).limit(1);
const processing = await db.select().from(jobs).where(eq(jobs.status, 'processing')).limit(1);

console.log('Queue Status:');
console.log('  Queued:', queued.length > 0 ? queued.length + ' jobs waiting' : 'Empty');
console.log(
  '  Processing:',
  processing.length > 0 ? processing[0].scriptName + ' (' + processing[0].progress + '%)' : 'None',
);

if (queued.length === 0 && processing.length === 0) {
  console.log('\n✨ All jobs processed! System is idle.');
} else if (queued.length > 0 && processing.length === 0) {
  console.log('\n⚠️  Jobs in queue but none processing - worker may need restart');
}
