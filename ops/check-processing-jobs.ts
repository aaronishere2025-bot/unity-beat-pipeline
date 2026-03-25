import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const processing = await db.select().from(jobs).where(eq(jobs.status, 'processing'));

console.log('Jobs in "processing" state:', processing.length);
console.log('');

processing.forEach((job, i) => {
  const updatedAt = new Date(job.updatedAt || job.createdAt || Date.now());
  const hoursStuck = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
  console.log(i + 1 + '.', job.scriptName || 'Untitled');
  console.log('   Progress:', job.progress + '%');
  console.log('   Stuck for:', hoursStuck.toFixed(1), 'hours');
  console.log('');
});
