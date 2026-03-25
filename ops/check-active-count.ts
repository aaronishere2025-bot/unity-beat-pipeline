import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, or } from 'drizzle-orm';

console.log('Checking job counts by status:\n');

const queued = await db.select().from(jobs).where(eq(jobs.status, 'queued'));
const processing = await db.select().from(jobs).where(eq(jobs.status, 'processing'));
const completed = await db.select().from(jobs).where(eq(jobs.status, 'completed'));
const failed = await db.select().from(jobs).where(eq(jobs.status, 'failed'));

console.log('queued      :', queued.length);
console.log('processing  :', processing.length);
console.log('completed   :', completed.length);
console.log('failed      :', failed.length);

console.log('\nTruly "active" (queued + processing):');
console.log('Total       :', queued.length + processing.length);
