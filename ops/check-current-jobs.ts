import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc } from 'drizzle-orm';

async function checkJobs() {
  const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(10);

  console.log('\n📊 Recent Jobs:\n');

  for (const job of recentJobs) {
    const statusEmoji =
      job.status === 'completed' ? '✅' : job.status === 'processing' ? '⏳' : job.status === 'failed' ? '❌' : '⏸️';

    console.log(`${statusEmoji} [${job.status.toUpperCase()}] ${job.scriptName || 'Untitled'}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Created: ${new Date(job.createdAt).toLocaleString()}`);

    if (job.completedClips && job.completedClips.length > 0) {
      console.log(`   Clips: ${job.completedClips.length} completed`);
    }

    if (job.error) {
      console.log(`   Error: ${job.error.substring(0, 100)}...`);
    }
    console.log('');
  }

  process.exit(0);
}

checkJobs().catch(console.error);
