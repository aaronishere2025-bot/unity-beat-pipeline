import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, eq } from 'drizzle-orm';

async function main() {
  const recent = await db
    .select()
    .from(jobs)
    .where(eq(jobs.status, 'completed'))
    .orderBy(desc(jobs.createdAt))
    .limit(5);
  console.log('=== RECENT COMPLETED JOBS ===');
  for (const j of recent) {
    console.log(
      `${j.mode} | ${(j.scriptName || '').substring(0, 40)} | ${j.audioDuration || '?'}s | music: ${j.musicUrl ? 'YES' : 'NO'}`,
    );
  }

  const failed = await db.select().from(jobs).where(eq(jobs.status, 'failed')).orderBy(desc(jobs.createdAt)).limit(3);
  console.log('\n=== RECENT FAILED JOBS ===');
  for (const j of failed) {
    console.log(
      `${j.mode} | ${(j.scriptName || '').substring(0, 40)} | err: ${(j.errorMessage || '').substring(0, 100)}`,
    );
  }

  // Check for unity_kling jobs with music
  const unityJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.mode, 'unity_kling'))
    .orderBy(desc(jobs.createdAt))
    .limit(5);
  console.log('\n=== RECENT UNITY_KLING JOBS ===');
  for (const j of unityJobs) {
    console.log(
      `${j.status} | ${(j.scriptName || '').substring(0, 40)} | ${j.audioDuration || '?'}s | music: ${j.musicUrl ? 'YES' : 'NO'}`,
    );
  }
  process.exit(0);
}
main();
