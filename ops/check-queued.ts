import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, desc } from 'drizzle-orm';

async function checkQueued() {
  const queued = await db.select().from(jobs).where(eq(jobs.status, 'queued')).orderBy(desc(jobs.createdAt));
  console.log('=== QUEUED JOBS ===');
  console.log(`Total queued: ${queued.length}\n`);
  queued.forEach((j) => console.log(`  - ${j.id} (${j.mode}, ${j.progress}%)`));
}

checkQueued();
