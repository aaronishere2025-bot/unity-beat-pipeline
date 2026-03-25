/**
 * Upload 6 beats with auto-routing
 * 3 lofi → ChillBeats4Me
 * 3 trap → Trap Beats INC
 */

import { youtubeOAuthSimple } from './server/services/youtube-oauth-simple';
import { youtubeChannelBandit } from './server/services/youtube-channel-bandit';
import { existsSync } from 'fs';

interface BeatUpload {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
  contentType: 'lofi' | 'trap';
}

const uploads: BeatUpload[] = [
  // LOFI BEATS (should route to ChillBeats4Me)
  {
    videoPath: 'data/videos/renders/beat_10_Chillhop_Evening_1768614424678.mp4',
    title: 'Chillhop Evening - Lofi Beats to Relax 🌙',
    description: `Chill lofi hip hop beats for studying, working, or relaxing.

🎵 Perfect for evening study sessions
🌙 Smooth, laid-back vibes
📚 Great for focus and productivity

#lofi #chillhop #studybeats #relaxing

Created with AI tools for educational purposes.`,
    tags: ['lofi', 'chillhop', 'study beats', 'relaxing', 'chill', 'hip hop'],
    contentType: 'lofi',
  },
  {
    videoPath: 'data/videos/renders/beat_6_Lofi_Study_Session_1768614431054.mp4',
    title: 'Lofi Study Session - Focus Beats for Work 📚',
    description: `Lo-fi hip hop beats perfect for studying and concentration.

📚 Study session vibes
☕ Coffee shop atmosphere
🎧 Smooth, relaxing instrumentals

#lofi #studymusic #chillbeats #focus

Created with AI tools for educational purposes.`,
    tags: ['lofi', 'study music', 'chill beats', 'focus', 'lo-fi', 'instrumental'],
    contentType: 'lofi',
  },
  {
    videoPath: 'data/videos/renders/beat_7_Jazz_Hop_Vibes_1768614405003.mp4',
    title: 'Jazz Hop Vibes - Chill Lofi Jazz Instrumental 🎷',
    description: `Jazz-infused lofi hip hop beats with smooth saxophone vibes.

🎷 Jazzy instrumental hip hop
🎹 Smooth piano & sax
☕ Perfect for relaxing

#jazzhop #lofi #chillbeats #jazz #instrumental

Created with AI tools for educational purposes.`,
    tags: ['jazz hop', 'lofi', 'chill beats', 'jazz', 'instrumental', 'smooth'],
    contentType: 'lofi',
  },

  // TRAP BEATS (should route to Trap Beats INC)
  {
    videoPath: 'data/videos/renders/beat_1_Dark_Trap_Energy_1768614391757.mp4',
    title: 'Dark Trap Energy - Hard 808 Instrumental 🔥',
    description: `Dark trap beat with heavy 808s and aggressive energy.

🔥 Hard trap instrumental
💀 Dark, aggressive vibes
🎵 Heavy 808 bass

#trap #trapbeat #808 #beats #instrumental #hard

Free for non-profit use. Created with AI tools.`,
    tags: ['trap', 'trap beat', '808', 'hard', 'dark', 'instrumental', 'beats'],
    contentType: 'trap',
  },
  {
    videoPath: 'data/videos/renders/beat_2_Hard_Trap_Banger_1768614435035.mp4',
    title: 'Hard Trap Banger - Aggressive Beat 2025 💥',
    description: `Hard-hitting trap beat with aggressive drums and bass.

💥 Hard trap banger
⚡ Aggressive energy
🔊 Club-ready production

#trap #trapbeat #hard #aggressive #2025 #beats

Free for non-profit use. Created with AI tools.`,
    tags: ['trap', 'hard trap', 'banger', 'aggressive', 'beats', '2025'],
    contentType: 'trap',
  },
  {
    videoPath: 'data/videos/renders/beat_3_UK_Drill_1768614420106.mp4',
    title: 'UK Drill - Dark Trap Instrumental 🇬🇧',
    description: `UK Drill style trap beat with sliding 808s and dark melodies.

🇬🇧 UK Drill style
🎵 Sliding 808s
💀 Dark, gritty production

#ukdrill #drill #trap #trapbeat #uk #instrumental

Free for non-profit use. Created with AI tools.`,
    tags: ['uk drill', 'drill', 'trap', 'trap beat', 'uk', 'dark', 'instrumental'],
    contentType: 'trap',
  },
];

async function main() {
  console.log('\n📤 Uploading 6 Beats with Auto-Routing\n');
  console.log('━'.repeat(60));

  const results: any[] = [];
  let lofiCount = 0;
  let trapCount = 0;

  for (let i = 0; i < uploads.length; i++) {
    const upload = uploads[i];
    const num = i + 1;

    console.log(`\n[${num}/6] ${upload.contentType.toUpperCase()}: ${upload.title.substring(0, 50)}...`);
    console.log('━'.repeat(60));

    // Verify file exists
    if (!existsSync(upload.videoPath)) {
      console.error(`❌ Video not found: ${upload.videoPath}`);
      continue;
    }

    // Use bandit to select channel
    const selectedChannel = await youtubeOAuthSimple.selectChannelWithBandit({
      title: upload.title,
      description: upload.description,
      tags: upload.tags,
    });

    if (!selectedChannel) {
      console.error('❌ No channel selected');
      continue;
    }

    console.log(`🎯 Selected: ${selectedChannel.title}`);
    console.log(`📤 Uploading... (this may take 1-2 minutes)\n`);

    // Upload
    const result = await youtubeOAuthSimple.uploadVideo(
      selectedChannel.id,
      upload.videoPath,
      null, // No thumbnail for now
      {
        title: upload.title,
        description: upload.description,
        tags: upload.tags,
        privacyStatus: 'unlisted', // Unlisted for testing
      },
    );

    if (result.success) {
      console.log(`✅ SUCCESS!`);
      console.log(`   Channel: ${result.channelName}`);
      console.log(`   Video URL: ${result.videoUrl}`);

      if (upload.contentType === 'lofi') lofiCount++;
      if (upload.contentType === 'trap') trapCount++;

      // Record outcome in bandit
      await youtubeChannelBandit.updateReward(selectedChannel.id, {
        views: 0,
        contentType: upload.contentType,
      });

      results.push({
        title: upload.title,
        channel: result.channelName,
        url: result.videoUrl,
        contentType: upload.contentType,
      });
    } else {
      console.error(`❌ FAILED: ${result.error}`);
      results.push({
        title: upload.title,
        error: result.error,
        contentType: upload.contentType,
      });
    }

    // Wait 2 seconds between uploads
    if (i < uploads.length - 1) {
      console.log('\n⏳ Waiting 2 seconds before next upload...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log('\n\n' + '━'.repeat(60));
  console.log('📊 UPLOAD SUMMARY');
  console.log('━'.repeat(60));
  console.log(`Total uploaded: ${results.filter((r) => r.url).length}/6`);
  console.log(`Lofi beats: ${lofiCount}`);
  console.log(`Trap beats: ${trapCount}\n`);

  console.log('✅ Successful uploads:\n');
  results
    .filter((r) => r.url)
    .forEach((r, i) => {
      console.log(`${i + 1}. [${r.contentType.toUpperCase()}] → ${r.channel}`);
      console.log(`   ${r.title.substring(0, 60)}...`);
      console.log(`   ${r.url}\n`);
    });

  if (results.some((r) => r.error)) {
    console.log('❌ Failed uploads:\n');
    results
      .filter((r) => r.error)
      .forEach((r, i) => {
        console.log(`${i + 1}. [${r.contentType.toUpperCase()}] ${r.title.substring(0, 60)}...`);
        console.log(`   Error: ${r.error}\n`);
      });
  }

  console.log('━'.repeat(60));
  console.log('✅ Upload batch complete!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
