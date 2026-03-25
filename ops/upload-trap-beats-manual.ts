#!/usr/bin/env tsx
/**
 * Manual upload of the 5 trap beats with proper metadata
 */

import { youtubeMetadataGenerator } from './server/services/youtube-metadata-generator';
import { youtubeChannelManager } from './server/services/youtube-channel-manager';
import { join } from 'path';

const trapBeats = [
  {
    videoPath: '/home/aaronishere2025/data/videos/renders/music_7f3330bd-c287-4e3d-b42f-3a7efdd54475_1769306531569.mp4',
    thumbnailPath: '/home/aaronishere2025/data/thumbnails/7f3330bd-c287-4e3d-b42f-3a7efdd54475_thumbnail.jpg',
    title: 'Trap Beat #1 - Jan 25',
    genre: 'trap',
    style: 'Trap soul, 140 BPM, soulful samples, smooth 808s, emotional chords, introspective vibes',
    duration: 165,
    publishTime: new Date('2026-01-25T12:00:00Z'), // 7:00 AM EST
  },
  {
    videoPath: '/home/aaronishere2025/data/videos/renders/music_2fcb1ee7-f51c-49e5-a9aa-59caac285fe0_1769306822281.mp4',
    thumbnailPath: '/home/aaronishere2025/data/thumbnails/2fcb1ee7-f51c-49e5-a9aa-59caac285fe0_thumbnail.jpg',
    title: 'Trap Beat #2 - Jan 25',
    genre: 'trap',
    style: 'Hard trap, 155 BPM, aggressive 808s, double-time hi-hats, distorted synths, mosh pit energy',
    duration: 81,
    publishTime: new Date('2026-01-25T15:00:00Z'), // 10:00 AM EST
  },
  {
    videoPath: '/home/aaronishere2025/data/videos/renders/music_b109f4cc-efe2-4218-a7d3-bc6f8dd8dd06_1769307053617.mp4',
    thumbnailPath: '/home/aaronishere2025/data/thumbnails/b109f4cc-efe2-4218-a7d3-bc6f8dd8dd06_thumbnail.jpg',
    title: 'Trap Beat #3 - Jan 25',
    genre: 'trap',
    style: 'Aggressive trap, 150 BPM, distorted 808s, rapid hi-hats, dark synths, intense energy, club banger',
    duration: 115,
    publishTime: new Date('2026-01-25T18:00:00Z'), // 1:00 PM EST
  },
  {
    videoPath: '/home/aaronishere2025/data/videos/renders/music_379ca5b8-b213-4dd4-b6df-7e24996e0182_1769307277762.mp4',
    thumbnailPath: '/home/aaronishere2025/data/thumbnails/379ca5b8-b213-4dd4-b6df-7e24996e0182_thumbnail.jpg',
    title: 'Trap Beat #4 - Jan 25',
    genre: 'trap',
    style: 'Vibrant trap, 142 BPM, colorful synths, bouncy 808s, energetic hi-hats, uplifting pads, party vibes',
    duration: 108,
    publishTime: new Date('2026-01-25T21:00:00Z'), // 4:00 PM EST
  },
  {
    videoPath: '/home/aaronishere2025/data/videos/renders/music_42ebd2ea-931b-4308-9761-36118f2d48df_1769307507675.mp4',
    thumbnailPath: '/home/aaronishere2025/data/thumbnails/42ebd2ea-931b-4308-9761-36118f2d48df_thumbnail.jpg',
    title: 'Trap Beat #5 - Jan 25',
    genre: 'trap',
    style: 'Chill trap, 145 BPM, atmospheric synths, smooth 808s, crispy hi-hats, dreamy pads, lo-fi aesthetic',
    duration: 146,
    publishTime: new Date('2026-01-26T00:00:00Z'), // 7:00 PM EST
  },
];

async function uploadTrapBeats() {
  console.log('🎵 UPLOADING 5 TRAP BEATS WITH YOUTUBE SCHEDULER\n');

  for (let i = 0; i < trapBeats.length; i++) {
    const beat = trapBeats[i];

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🎬 Uploading ${i + 1}/5: ${beat.title}`);
    console.log(`   Schedule: ${beat.publishTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    console.log(`${'─'.repeat(70)}`);

    try {
      // Generate metadata
      const videoInfo = {
        jobName: beat.title,
        mode: 'music',
        aspectRatio: '16:9',
        unityMetadata: {
          musicStyle: beat.style,
        },
        duration: beat.duration,
      };

      const metadata = await youtubeMetadataGenerator.generateMetadata(videoInfo);

      console.log(`   📝 Title: ${metadata.title}`);
      console.log(`   📋 Description: ${metadata.description.substring(0, 100)}...`);
      console.log(`   🏷️  Tags: ${metadata.tags.slice(0, 3).join(', ')}...`);

      // Upload to Trap Beats INC channel with scheduler
      const uploadResult = await youtubeChannelManager.uploadVideo(
        'yt_1768620554675_usovd1wx3', // Trap Beats INC channel ID
        beat.videoPath,
        beat.thumbnailPath,
        {
          ...metadata,
          publishAt: beat.publishTime.toISOString(),
          privacyStatus: 'private',
        },
      );

      if (uploadResult.success) {
        console.log(`   ✅ Uploaded successfully!`);
        console.log(`   🔗 Video ID: ${uploadResult.data.videoId}`);
        console.log(
          `   📅 Scheduled for: ${beat.publishTime.toLocaleString('en-US', { timeZone: 'America/New_York' })}`,
        );
      } else {
        console.error(`   ❌ Upload failed: ${uploadResult.error}`);
      }
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
    }

    // Small delay between uploads
    if (i < trapBeats.length - 1) {
      console.log(`\n   ⏳ Waiting 5 seconds before next upload...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ ALL 5 TRAP BEATS UPLOADED`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\n📺 Videos scheduled throughout the day with YouTube's native scheduler!`);
}

uploadTrapBeats().catch(console.error);
