import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const jobId = process.argv[2];
if (!jobId) {
  console.error('Usage: npx tsx delete-job.ts <job-id>');
  process.exit(1);
}

await db.delete(jobs).where(eq(jobs.id, jobId));
console.log(`✅ Deleted job: ${jobId}`);
