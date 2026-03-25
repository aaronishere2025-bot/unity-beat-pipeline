import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';

async function checkLofiJob() {
  console.log('🎵 CHECKING LOFI VERIFICATION TEST JOB\n');

  const job = await db.query.jobs.findFirst({
    where: eq(jobs.scriptName, '3-Minute Lofi Verification Test - Jan 22'),
  });

  if (!job) {
    console.log('❌ Job not found');
    process.exit(1);
  }

  console.log('Job Details:');
  console.log('  ID:', job.id);
  console.log('  Status:', job.status);
  console.log('  Progress:', job.progress + '%');
  console.log('  Video Path:', job.videoPath || '❌ NOT SET');
  console.log('  Thumbnail:', job.thumbnailPath || '❌ NOT SET');
  console.log('  YouTube ID:', job.youtubeVideoId || '❌ NOT UPLOADED');
  console.log('  Duration:', job.duration);
  console.log('  Cost:', '$' + (job.cost || 0).toFixed(2));

  if (job.videoPath && fs.existsSync(job.videoPath)) {
    const stats = fs.statSync(job.videoPath);
    console.log('\n  Video File: ✅ Exists (' + (stats.size / 1024 / 1024).toFixed(2) + ' MB)');
  } else {
    console.log('\n🔍 Searching for video file...');
    const files = fs.readdirSync('/home/aaronishere2025/data/videos/renders/').filter((f) => f.includes(job.id));

    if (files.length > 0) {
      console.log('  Found:');
      files.forEach((f) => {
        const stats = fs.statSync('/home/aaronishere2025/data/videos/renders/' + f);
        console.log('    ' + f + ' (' + (stats.size / 1024 / 1024).toFixed(2) + ' MB)');
      });
    }
  }
}

checkLofiJob();
