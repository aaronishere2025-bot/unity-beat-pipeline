#!/usr/bin/env tsx
/**
 * Upload beat videos to YouTube with proper style tags
 */

import { youtubeUploadService } from './server/services/youtube-upload-service';
import fs from 'fs';

const BEAT_VIDEOS = [
  {
    path: '/home/aaronishere2025/data/videos/renders/music_050b65e9-561f-46b4-862e-15166fa52e24_1768606467699.mp4',
    thumbnail: '/home/aaronishere2025/data/thumbnails/050b65e9-561f-46b4-862e-15166fa52e24_thumbnail.jpg',
    title: 'Dark Trap Beat - Midnight Energy | 140 BPM Hard 808s',
    description: `🎵 Dark Trap Beat - Midnight Energy

A hard-hitting trap beat with aggressive 808s and dark synth melodies. Perfect for freestyle rap, workout sessions, or creative focus.

🎹 Beat Info:
• BPM: 140
• Style: Dark Trap
• Key: Minor
• Duration: 2:03
• Mood: Aggressive, Dark, Energetic

🎨 Visual: Gold chains abstract with diamond sparkle aesthetic

📊 Features:
• Hard 808s
• Aggressive hi-hats
• Dark synth pads
• Minor key progression
• Cinematic atmosphere

Perfect for:
✅ Rap freestyles
✅ Workout & gym sessions
✅ Creative content creation
✅ Study & focus (high energy)
✅ Gaming highlights

#trap #trapbeat #darkrap #808s #beats #hiphop #instrumental #typebeat #freebeat #beatmaker #producer #music #rapbeat #hardtrap #darktrap`,
    tags: [
      'trap beat',
      'dark trap',
      '808s',
      'hard trap',
      '140 bpm',
      'type beat',
      'free beat',
      'rap beat',
      'hip hop instrumental',
      'trap music',
      'beat maker',
      'producer',
      'dark beats',
      'aggressive beat',
      'trap instrumental',
    ],
    styles: ['Trap', 'Dark Trap', 'Hard 808s', 'Minor Key'],
  },
  {
    path: '/home/aaronishere2025/data/videos/renders/music_20ee97e8-f850-404b-88c4-6e426ba592c2_1768608048660.mp4',
    thumbnail: '/home/aaronishere2025/data/thumbnails/20ee97e8-f850-404b-88c4-6e426ba592c2_thumbnail.jpg',
    title: 'Trap Energy Beat - Epic Orchestral Trap | 140 BPM',
    description: `🎵 Trap Energy Beat - Epic Orchestral Trap

Cinematic orchestral trap beat with thunderous 808s and epic production. Perfect for rap battles, motivational content, and high-energy sessions.

🎹 Beat Info:
• BPM: 140
• Style: Epic Orchestral Trap
• Duration: 2:06
• Mood: Epic, Energetic, Cinematic

🎨 Visual: Graffiti street art with vibrant spray paint

📊 Features:
• Orchestral elements
• Thunderous 808s
• Epic rap battle vibes
• Half-time drums
• Cinematic production

Perfect for:
✅ Rap battles
✅ Motivational content
✅ Epic moments
✅ Workout playlists
✅ Gaming montages

#trap #orchestraltrap #epicbeat #808s #beats #hiphop #instrumental #typebeat #rapbeat #cinematic #beatmaker #producer #epicmusic #trapmusic #orchestral`,
    tags: [
      'trap beat',
      'orchestral trap',
      'epic trap',
      '808s',
      '140 bpm',
      'type beat',
      'cinematic beat',
      'rap beat',
      'hip hop instrumental',
      'epic music',
      'beat maker',
      'producer',
      'orchestral music',
      'rap battle',
      'trap instrumental',
    ],
    styles: ['Trap', 'Orchestral', 'Epic', 'Cinematic'],
  },
  {
    path: '/home/aaronishere2025/data/videos/renders/beat_compilation_645c352b-aab7-44bc-bdfb-4241780364ba_1768608182347.mp4',
    thumbnail: '/home/aaronishere2025/data/thumbnails/645c352b-aab7-44bc-bdfb-4241780364ba_thumbnail.jpg',
    title: 'Beat Compilation - Trap Energy Mix | 2 Minutes of Fire',
    description: `🎵 Beat Compilation - Trap Energy Mix

A compilation of high-energy trap beats perfect for any session. Non-stop energy for 2 minutes straight.

🎹 Compilation Info:
• Duration: 2:07
• Style: Trap Mix
• BPM: 140
• Mood: High Energy, Aggressive

🎨 Visual: Dynamic graffiti street art

📊 Features:
• Multiple beat variations
• Seamless transitions
• Consistent energy
• Professional production
• Visual sync

Perfect for:
✅ Quick freestyle sessions
✅ Workout routines
✅ Content creation
✅ Beat showcases
✅ Music production study

#trap #beatcompilation #trapbeats #808s #beats #hiphop #instrumental #typebeat #beatmix #producer #music #rapbeat #compilation #trapmusic #beatmaker`,
    tags: [
      'beat compilation',
      'trap beats',
      'trap mix',
      '808s',
      '140 bpm',
      'type beat',
      'beat mix',
      'rap beats',
      'hip hop',
      'compilation',
      'beat maker',
      'producer',
      'trap music',
      'instrumental',
      'beat showcase',
    ],
    styles: ['Trap', 'Compilation', 'Mix', 'High Energy'],
  },
];

async function uploadBeatVideos() {
  console.log('📤 UPLOADING BEAT VIDEOS TO YOUTUBE\n');
  console.log('='.repeat(70));

  for (let i = 0; i < BEAT_VIDEOS.length; i++) {
    const video = BEAT_VIDEOS[i];

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📹 Video ${i + 1}/${BEAT_VIDEOS.length}`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`   Title: ${video.title}`);
    console.log(`   Styles: ${video.styles.join(', ')}`);

    // Check if files exist
    if (!fs.existsSync(video.path)) {
      console.error(`   ❌ Video not found: ${video.path}`);
      continue;
    }

    if (!fs.existsSync(video.thumbnail)) {
      console.error(`   ⚠️  Thumbnail not found, will upload without it`);
    }

    const fileSizeMB = (fs.statSync(video.path).size / 1024 / 1024).toFixed(1);
    console.log(`   Size: ${fileSizeMB} MB`);
    console.log(`   Tags: ${video.tags.length} tags`);
    console.log('');

    try {
      console.log('   📤 Uploading to YouTube...');

      const result = await youtubeUploadService.uploadVideo({
        videoPath: video.path,
        thumbnailPath: fs.existsSync(video.thumbnail) ? video.thumbnail : undefined,
        title: video.title,
        description: video.description,
        tags: video.tags,
        categoryId: '10', // Music category
        privacyStatus: 'public', // or 'unlisted' or 'private'
      });

      console.log(`   ✅ Uploaded successfully!`);
      console.log(`   📺 Video ID: ${result.videoId}`);
      console.log(`   🔗 URL: https://youtube.com/watch?v=${result.videoId}`);
      console.log('');

      // Add a delay between uploads to avoid rate limits
      if (i < BEAT_VIDEOS.length - 1) {
        console.log('   ⏳ Waiting 10 seconds before next upload...\n');
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    } catch (error: any) {
      console.error(`   ❌ Upload failed: ${error.message}`);
      console.error(error.stack);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ UPLOAD COMPLETE`);
  console.log(`${'='.repeat(70)}`);
  console.log(`\n📊 Summary:`);
  console.log(`   Videos processed: ${BEAT_VIDEOS.length}`);
  console.log(`   Total styles: Trap, Orchestral, Dark Trap, Compilation`);
  console.log(`   All videos tagged with:`);
  console.log(`   • BPM (140)`);
  console.log(`   • Style tags`);
  console.log(`   • Genre tags`);
  console.log(`   • Use case tags`);
  console.log(`\n🎯 Videos are now searchable by:`);
  console.log(`   - "trap beat 140 bpm"`);
  console.log(`   - "dark trap instrumental"`);
  console.log(`   - "orchestral trap beat"`);
  console.log(`   - "beat compilation"`);
  console.log(`${'='.repeat(70)}\n`);
}

uploadBeatVideos();
