import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function checkJobDuration() {
  const job = await db.select().from(jobs).where(eq(jobs.id, '66713f52-2763-4c67-9804-6d8f53c3a207')).limit(1);

  if (job.length === 0) {
    console.log('Job not found');
    return;
  }

  const j = job[0];
  console.log('=== JOB DURATION ANALYSIS ===\n');
  console.log('Job Name:', j.scriptName);
  console.log('Job Mode:', j.mode);
  console.log('\n📊 Duration Fields:');
  console.log('  job.duration (UI):', j.duration, 'seconds =', Math.floor(j.duration / 60), 'min');
  console.log('  job.metadata.targetDuration:', j.metadata?.targetDuration);
  console.log('  job.metadata.actualDuration:', j.metadata?.actualDuration);
  console.log('\n🎵 Song Generation:');
  console.log('  Expected songs (for 30min):', Math.ceil(1800 / 120), 'songs × 2min');
  console.log('  Actual metadata:', JSON.stringify(j.metadata, null, 2));
  console.log('\n💰 Cost:', j.cost);
  console.log('Audio path:', j.audioPath);
}

checkJobDuration().catch(console.error);
