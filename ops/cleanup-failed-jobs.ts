import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

// Delete the 3 failed jobs
const failedIds = [
  'c31d66b3-56f2-4613-ae24-2bea1f2a4681',
  'd1b439bc-4086-49e9-a1e3-a698ef8c5b2c',
  '714b11e9-ca86-4eaa-8a26-e2f9c0e97d48',
];

for (const id of failedIds) {
  await db.delete(jobs).where(eq(jobs.id, id));
}

console.log('✅ Cleaned up 3 failed jobs');
