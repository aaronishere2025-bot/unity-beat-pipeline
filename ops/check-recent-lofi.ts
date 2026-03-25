import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { desc, like } from 'drizzle-orm';

async function checkRecentLofi() {
  console.log('🔍 RECENT LOFI JOBS\n');

  const recentJobs = await db.query.jobs.findMany({
    where: like(jobs.scriptName, '%Lofi%'),
    orderBy: [desc(jobs.createdAt)],
    limit: 10,
  });

  console.log('Found ' + recentJobs.length + ' lofi jobs:\n');

  recentJobs.forEach((job, i) => {
    console.log(i + 1 + '. ' + job.scriptName);
    console.log('   ID: ' + job.id);
    console.log('   Status: ' + job.status + ' (' + job.progress + '%)');
    console.log('   Video: ' + (job.videoPath ? '✅' : '❌'));
    console.log('   YouTube: ' + (job.youtubeVideoId ? '✅ ' + job.youtubeVideoId : '❌'));
    console.log('   Created: ' + new Date(job.createdAt).toLocaleString() + '\n');
  });
}

checkRecentLofi();
