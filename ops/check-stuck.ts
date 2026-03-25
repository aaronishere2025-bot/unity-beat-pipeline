import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function check() {
  const processing = await db.select().from(jobs).where(eq(jobs.status, 'processing'));
  console.log('=== PROCESSING JOBS ===\n');
  processing.forEach((j) => {
    const minutesAgo = Math.floor((Date.now() - new Date(j.updatedAt).getTime()) / 60000);
    console.log(`Job: ${j.id}`);
    console.log(`  Progress: ${j.progress}%`);
    console.log(`  Last update: ${minutesAgo} min ago`);
    console.log(`  Error: ${j.error?.substring(0, 100) || 'None'}`);
    console.log();
  });
}
check();
