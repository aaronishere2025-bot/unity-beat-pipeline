import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const job = await db.select().from(jobs).where(eq(jobs.id, '4e2c1130-3eeb-4712-9aed-5d679e7b2842'));
  if (job[0]) {
    console.log('=== FULL JOB DETAILS ===\n');
    console.log(JSON.stringify(job[0], null, 2));
  } else {
    console.log('Job not found');
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
