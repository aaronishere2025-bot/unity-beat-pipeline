#!/usr/bin/env tsx
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq } from 'drizzle-orm';

const jobId = '4f9b6119-b75e-408e-b287-70fb16d5fe03';

await db
  .update(jobs)
  .set({
    script_name: 'Lofi Study Mix - 30 Minutes (Extended)',
    script_content:
      'True 30-minute lofi hip-hop mix. Extended from 19.4-minute base mix by looping audio. Features lowrider hydraulics bouncing visual theme.',
    video_url: '/api/videos/lofi_full_30min_final.mp4',
    thumbnail_url: '/api/thumbnails/lofi_30min_thumbnail.jpg',
    music_url: '/audio/lofi_exact_30min.mp3',
    audio_duration: '1800.00',
    aspect_ratio: '16:9',
  })
  .where(eq(jobs.id, jobId));

console.log('✅ Job updated with video URLs');

process.exit(0);
