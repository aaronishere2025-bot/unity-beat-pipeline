import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function main() {
  const id = '4a0b6ba5-aaff-4ec3-8d6d-e4265e962d4d';
  await db
    .update(jobs)
    .set({
      status: 'queued',
      retryCount: 0,
      errorMessage: null,
      progress: 0,
    })
    .where(eq(jobs.id, id));
  console.log('✅ Mansa Musa reset to queued');
  process.exit(0);
}
main();
