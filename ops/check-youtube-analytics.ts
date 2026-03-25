import { db } from './server/db.js';
import { videoPerformanceHistory, jobs } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

async function checkAnalytics() {
  console.log('=== YOUTUBE ANALYTICS COLLECTION STATUS ===\n');

  // Check recent performance data
  const performance = await db
    .select()
    .from(videoPerformanceHistory)
    .orderBy(desc(videoPerformanceHistory.timestamp))
    .limit(10);

  console.log(`Total performance records: ${performance.length}\n`);

  if (performance.length > 0) {
    console.log('✅ Analytics ARE being collected:\n');
    performance.forEach((p, i) => {
      console.log(`${i + 1}. Video: ${p.videoId}`);
      console.log(`   Views: ${p.views}`);
      console.log(`   Likes: ${p.likes || 0}`);
      console.log(`   Timestamp: ${p.timestamp}`);
      console.log('');
    });
  } else {
    console.log('❌ NO ANALYTICS DATA!');
    console.log('   The learning loop is BROKEN.\n');
    console.log('💡 To fix:');
    console.log('   1. Ensure videos are uploaded with youtubeVideoId');
    console.log('   2. Run: npm run jobs:check-analytics-loop');
    console.log('   3. Check youtube-analytics-service.ts is fetching data\n');
  }

  // Check if lofi job was uploaded
  const lofiJob = await db.select().from(jobs).where(eq(jobs.id, 'd920a422-ccc9-4eea-b165-90ad485cd121')).limit(1);

  if (lofiJob.length > 0) {
    console.log('=== LOFI JOB UPLOAD STATUS ===');
    console.log(`YouTube Video ID: ${lofiJob[0].youtubeVideoId || '❌ NOT UPLOADED TO YOUTUBE'}`);
    console.log(`YouTube URL: ${lofiJob[0].youtubeVideoUrl || 'N/A'}`);
    console.log(`Video Path: ${lofiJob[0].videoUrl || 'N/A'}`);

    if (!lofiJob[0].youtubeVideoId) {
      console.log('\n⚠️  Video completed but NOT uploaded to YouTube!');
      console.log('   This is why no analytics are collected.');
      console.log('   Run: npx tsx upload-lofi-to-youtube.ts');
    }
  }
}

checkAnalytics();
