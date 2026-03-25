import dotenv from 'dotenv';
dotenv.config();
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { sql } from 'drizzle-orm';

async function main() {
  // Create a minimal unity_kling job — small topic, few clips
  const [newJob] = await db
    .insert(jobs)
    .values({
      scriptName: 'TEST: Gutenberg Printing Press',
      status: 'queued',
      mode: 'kling',
      topic: 'The Gutenberg Printing Press',
      clipCount: 3,
      progress: 0,
      skipUpload: true,
      metadata: {
        testRun: true,
        creditProbeEnabled: true,
        maxCredits: 2000, // hard cap ~$10
      } as any,
    })
    .returning();

  console.log('=== TEST JOB CREATED ===');
  console.log(`ID: ${newJob.id}`);
  console.log(`Script: ${newJob.scriptName}`);
  console.log(`Status: ${newJob.status}`);
  console.log(`Mode: ${newJob.mode}`);
  console.log(`Clips: ${newJob.clipCount}`);
  console.log(`Skip Upload: ${newJob.skipUpload}`);
  console.log('');
  console.log('The job worker should pick this up automatically.');
  console.log(
    'Monitor: tail -f /tmp/unity-scratch/server.log | grep -E "Gutenberg|credit|probe|circuit|kling|Kling|scene.group|Cost|402|batch"',
  );

  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
