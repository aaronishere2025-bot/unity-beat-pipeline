import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { existsSync } from 'fs';

const job = await db.select().from(jobs).where(eq(jobs.id, '77da3ada-3014-4e8b-8007-eb46c19c8458')).limit(1);

if (job.length > 0) {
  const j = job[0];
  const videoFilename = j.videoUrl?.replace('/api/videos/', '');
  const videoPath = `data/videos/renders/${videoFilename}`;
  console.log('Video URL:', j.videoUrl);
  console.log('Video Path:', videoPath);
  console.log('File exists:', existsSync(videoPath));
  console.log('YouTube ID:', j.youtubeVideoId);
  console.log('Gumroad URL:', j.gumroadUrl);
}
