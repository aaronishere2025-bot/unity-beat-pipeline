import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { isNull, and, eq } from 'drizzle-orm';

async function checkTodaysSchedule() {
  console.log("📅 Checking Today's Schedule (Jan 30, 2026)\n");

  const today = new Date('2026-01-30');
  const tomorrow = new Date('2026-01-31');

  console.log(`Today: ${today.toLocaleDateString()}`);
  console.log(`Tomorrow: ${tomorrow.toLocaleDateString()}\n`);

  // Get all scheduled jobs
  const allScheduledJobs = await db.select().from(jobs).where(isNull(jobs.youtubeVideoId));

  console.log(`Total jobs without YouTube ID: ${allScheduledJobs.length}\n`);

  // Filter for today
  const todayJobs = allScheduledJobs.filter((job) => {
    if (!job.scheduledTime) return false;
    const jobDate = new Date(job.scheduledTime);
    return jobDate >= today && jobDate < tomorrow;
  });

  console.log(`Jobs scheduled for today: ${todayJobs.length}\n`);

  // Group by channel
  const byChannel: Record<string, any[]> = {};

  todayJobs.forEach((job) => {
    const metadata = job.unityMetadata
      ? typeof job.unityMetadata === 'string'
        ? JSON.parse(job.unityMetadata)
        : job.unityMetadata
      : {};

    const channelId = metadata.channelConnectionId || 'unknown';
    if (!byChannel[channelId]) byChannel[channelId] = [];
    byChannel[channelId].push(job);
  });

  // Show by channel
  Object.entries(byChannel).forEach(([channelId, channelJobs]) => {
    console.log(`\n📺 Channel: ${channelId}`);
    console.log(`Videos: ${channelJobs.length}`);

    channelJobs
      .sort((a, b) => new Date(a.scheduledTime || '').getTime() - new Date(b.scheduledTime || '').getTime())
      .forEach((job) => {
        const time = new Date(job.scheduledTime || '');
        console.log(`  ${time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${job.scriptName}`);
      });
  });

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`\n✅ Total videos for Jan 30: ${todayJobs.length}`);
  console.log(`Channels: ${Object.keys(byChannel).length}`);
}

checkTodaysSchedule()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
