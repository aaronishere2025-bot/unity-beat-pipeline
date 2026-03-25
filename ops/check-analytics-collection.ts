import { db } from './server/db.js';
import { youtubeAnalytics, jobs } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

async function checkAnalytics() {
  console.log('=== CHECKING ANALYTICS COLLECTION ===\n');

  // Check recent analytics
  const analytics = await db.select().from(youtubeAnalytics).orderBy(desc(youtubeAnalytics.uploadedAt)).limit(10);

  console.log(`Total analytics records found: ${analytics.length}`);

  if (analytics.length > 0) {
    console.log('\n✅ Analytics ARE being collected:\n');
    analytics.forEach((a, i) => {
      console.log(`${i + 1}. Video ID: ${a.videoId}`);
      console.log(`   Views: ${a.views || 0}`);
      console.log(`   Retention: ${a.avgRetention ? a.avgRetention + '%' : 'N/A'}`);
      console.log(`   CTR: ${a.ctr ? a.ctr + '%' : 'N/A'}`);
      console.log(`   Uploaded: ${a.uploadedAt}`);
      console.log('');
    });
  } else {
    console.log('\n❌ NO ANALYTICS DATA FOUND!');
    console.log('   The system is NOT collecting YouTube performance data.');
    console.log('   This means the learning loop is BROKEN.\n');
  }

  // Check if the lofi job has a YouTube video ID
  const lofiJob = await db.select().from(jobs).where(eq(jobs.id, 'd920a422-ccc9-4eea-b165-90ad485cd121')).limit(1);

  if (lofiJob.length > 0) {
    console.log('=== LOFI JOB STATUS ===');
    console.log(`YouTube Video ID: ${lofiJob[0].youtubeVideoId || '❌ NOT UPLOADED'}`);
    console.log(`YouTube Video URL: ${lofiJob[0].youtubeVideoUrl || 'N/A'}`);
  }
}

checkAnalytics();
