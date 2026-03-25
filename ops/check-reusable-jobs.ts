import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, eq } from 'drizzle-orm';
import { existsSync } from 'fs';

async function main() {
  const failedJobs = await db
    .select()
    .from(jobs)
    .where(eq(jobs.mode, 'unity_kling'))
    .orderBy(desc(jobs.createdAt))
    .limit(10);

  console.log('=== UNITY_KLING JOBS WITH REUSABLE MUSIC ===\n');
  for (const j of failedJobs) {
    const musicPath = j.musicUrl?.replace('file://', '') || '';
    const hasMusic = musicPath && existsSync(musicPath);
    const hasLyrics = !!(j as any).scriptContent && (j as any).scriptContent.length > 50;
    const clipCount = j.clipCount || 0;

    console.log(`ID: ${j.id}`);
    console.log(`  Name: ${j.scriptName}`);
    console.log(`  Status: ${j.status}`);
    console.log(`  Duration: ${j.audioDuration}s`);
    console.log(`  Music file exists: ${hasMusic} (${musicPath.substring(0, 60)})`);
    console.log(`  Clip count: ${clipCount}`);
    console.log(`  Error: ${(j.errorMessage || 'none').substring(0, 80)}`);
    console.log(`  Completed clips: ${j.completedClips ? JSON.parse(JSON.stringify(j.completedClips)).length : 0}`);
    console.log('');
  }
  process.exit(0);
}
main();
