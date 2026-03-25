import 'dotenv/config';
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function main() {
  const id = 'bb7b9575-17c1-4435-a42c-1873de7bfa20';
  await db.update(jobs).set({ status: 'queued', progress: 0, retryCount: 0, error: null } as any).where(eq(jobs.id, id));
  console.log('Reset to queued');
  process.exit(0);
}
main();
