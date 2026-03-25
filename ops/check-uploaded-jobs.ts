import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { isNotNull, desc } from 'drizzle-orm';

const uploadedJobs = await db
  .select()
  .from(jobs)
  .where(isNotNull(jobs.youtubeVideoId))
  .orderBy(desc(jobs.uploadedAt))
  .limit(10);

console.log('Recently uploaded jobs:\n');
for (const job of uploadedJobs) {
  const durationMin = Math.floor((job.duration || 0) / 60);
  const durationSec = (job.duration || 0) % 60;
  console.log(`📹 ${job.scriptName}`);
  console.log(`   Duration: ${durationMin}m ${durationSec}s (${job.duration}s total)`);
  console.log(`   YouTube: ${job.youtubeUrl}`);
  console.log(`   Script: ${job.scriptContent?.substring(0, 60)}...`);
  console.log('');
}
