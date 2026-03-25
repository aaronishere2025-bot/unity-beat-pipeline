import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq, desc } from 'drizzle-orm';

async function check() {
  const processing = await db.select().from(jobs).where(eq(jobs.status, 'processing')).orderBy(desc(jobs.updatedAt));
  console.log('=== PROCESSING JOBS ===');
  console.log(`Total processing: ${processing.length}\n`);
  processing.forEach((j) => {
    console.log(`Job: ${j.id}`);
    console.log(`  Mode: ${j.mode}`);
    console.log(`  Progress: ${j.progress}%`);
    console.log(`  Updated: ${j.updatedAt}`);
    console.log();
  });

  const completed = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, 'completed'))
    .orderBy(desc(jobs.completedAt))
    .limit(5);
  console.log('=== RECENT COMPLETIONS ===');
  console.log(`Total completed: ${completed.length}\n`);
  completed.forEach((j) => {
    console.log(`✅ ${j.id} (${j.mode}, completed: ${j.completedAt})`);
  });
}

check();
