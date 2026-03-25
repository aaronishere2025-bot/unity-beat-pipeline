import { db } from './server/db';
import { jobs } from './shared/schema';
import { desc, sql } from 'drizzle-orm';

async function findChurchJob() {
  console.log('Searching for church-related jobs from today...\n');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const recentJobs = await db
    .select({
      id: jobs.id,
      status: jobs.status,
      scriptName: jobs.scriptName,
      scriptContent: jobs.scriptContent,
      finalVideoUrl: jobs.finalVideoUrl,
      createdAt: jobs.createdAt,
    })
    .from(jobs)
    .orderBy(desc(jobs.createdAt))
    .limit(50);

  console.log(`Checking ${recentJobs.length} recent jobs\n`);

  // Look for church-related content
  const churchJobs = recentJobs.filter((job) => {
    const name = (job.scriptName || '').toLowerCase();
    const content = (job.scriptContent || '').toLowerCase();
    const createdToday = new Date(job.createdAt).getDate() === new Date().getDate();

    return (
      createdToday &&
      (name.includes('church') ||
        content.includes('church') ||
        name.includes('cathedral') ||
        content.includes('cathedral') ||
        name.includes('protestant') ||
        name.includes('catholic') ||
        name.includes('reformation'))
    );
  });

  if (churchJobs.length > 0) {
    console.log('🔍 Church-related jobs from today:\n');
    for (const job of churchJobs) {
      console.log(`Job ID: ${job.id}`);
      console.log(`Status: ${job.status}`);
      console.log(`Name: ${job.scriptName}`);
      console.log(`Created: ${job.createdAt}`);
      if (job.finalVideoUrl) {
        console.log(`✅ Video Ready: ${job.finalVideoUrl}`);
      }
      console.log('---\n');
    }
  } else {
    console.log('❌ No church-related jobs found from today.\n');
    console.log('Recent jobs from today:\n');

    const todayJobs = recentJobs.filter((job) => {
      return new Date(job.createdAt).getDate() === new Date().getDate();
    });

    for (const job of todayJobs.slice(0, 10)) {
      const hasVideo = job.finalVideoUrl ? '✅' : '⏳';
      console.log(
        `${hasVideo} ${job.id.slice(0, 8)} | ${job.status?.padEnd(12)} | ${job.scriptName?.slice(0, 50) || 'Untitled'}`,
      );
    }
  }
}

findChurchJob().catch(console.error);
