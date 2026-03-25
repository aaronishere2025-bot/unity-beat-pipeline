/**
 * Check all completed jobs
 */

import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq, desc } from 'drizzle-orm';

async function main() {
  console.log('\n🔍 Checking All Completed Jobs\n');
  console.log('━'.repeat(80));

  const completedJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, 'completed'))
    .orderBy(desc(jobs.createdAt))
    .limit(10);

  console.log(`\nFound ${completedJobs.length} completed jobs:\n`);

  for (const job of completedJobs) {
    console.log(`\n📋 ${job.scriptName || 'Untitled'}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Has musicUrl: ${job.musicUrl ? 'YES' : 'NO'}`);
    console.log(`   Has unityPackageId: ${job.unityPackageId ? 'YES' : 'NO'}`);
    console.log(`   Has audioPath: ${job.audioPath ? 'YES' : 'NO'}`);
    console.log(`   Created: ${job.createdAt}`);
    console.log('   ─'.repeat(40));
  }

  console.log('\n━'.repeat(80));
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
