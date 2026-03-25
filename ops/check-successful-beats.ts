/**
 * Check how successful beats were created
 */

import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq, and, like, desc } from 'drizzle-orm';

async function main() {
  console.log('\n🔍 Checking Successful Beat Jobs\n');
  console.log('━'.repeat(80));

  const successfulBeats = await db
    .select()
    .from(jobs)
    .where(and(like(jobs.scriptName, 'beat_%'), eq(jobs.status, 'completed')))
    .orderBy(desc(jobs.createdAt))
    .limit(5);

  console.log(`\nFound ${successfulBeats.length} successful beat jobs:\n`);

  for (const job of successfulBeats) {
    console.log(`\n📋 ${job.scriptName}`);
    console.log(`   ID: ${job.id}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Has musicUrl: ${job.musicUrl ? 'YES' : 'NO'}`);
    console.log(`   Has unityPackageId: ${job.unityPackageId ? 'YES' : 'NO'}`);
    console.log(`   Has audioPath: ${job.audioPath ? 'YES' : 'NO'}`);
    console.log(`   Script Content: ${job.scriptContent?.substring(0, 80) || 'none'}...`);
    console.log(`   Video URL: ${job.videoUrl || 'none'}`);
    console.log('   ─'.repeat(40));
  }

  console.log('\n━'.repeat(80));
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
