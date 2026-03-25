import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkFailedJobs() {
  console.log('Checking recent job failures...\n');

  const recentJobs = await db.execute(sql`
    SELECT id, status, mode, error_message, created_at
    FROM jobs
    ORDER BY created_at DESC
    LIMIT 10
  `);

  console.log(`Found ${recentJobs.rows.length} recent jobs:\n`);

  for (const job of recentJobs.rows) {
    console.log(`Job ${job.id}:`);
    console.log(`  Status: ${job.status}`);
    console.log(`  Mode: ${job.mode}`);
    console.log(`  Created: ${job.created_at}`);
    if (job.error_message) {
      console.log(`  Error: ${job.error_message}`);
    }
    console.log('');
  }

  const failedCount = recentJobs.rows.filter((j: any) => j.status === 'failed').length;
  console.log(`Failed jobs: ${failedCount}/${recentJobs.rows.length}`);
}

checkFailedJobs()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
