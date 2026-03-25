import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function check() {
  const job = await db.select().from(jobs).where(eq(jobs.id, 'b0fff49d-30af-41a0-acac-b8be1dbbb758'));

  if (job[0]) {
    console.log('✅ Job b0fff49d completed\!');
    console.log(`   Duration: ${Math.floor(job[0].duration / 60)}:${String(job[0].duration % 60).padStart(2, '0')}`);
    console.log(`   Status: ${job[0].status}`);
    console.log(`   Video: ${job[0].videoUrl || 'N/A'}`);
  }
}
check();
