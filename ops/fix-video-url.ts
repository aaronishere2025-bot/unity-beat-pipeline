#!/usr/bin/env tsx
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq } from 'drizzle-orm';

const jobId = '9910d756-7588-4ca7-b0ec-3f9617b7498c';

await db
  .update(jobs)
  .set({
    video_url: '/api/videos/music_9910d756-7588-4ca7-b0ec-3f9617b7498c_final.mp4',
    thumbnail_url: '/api/thumbnails/9910d756-7588-4ca7-b0ec-3f9617b7498c_thumbnail.jpg',
  })
  .where(eq(jobs.id, jobId));

console.log('✅ Video URL updated');
process.exit(0);
