import { youtubeUploadService } from './server/services/youtube-upload-service.js';
import { readFileSync } from 'fs';

async function uploadBeatWithPurchaseLink() {
  console.log('\n📺 Uploading Beat to YouTube with Purchase Link\n');
  console.log('═══════════════════════════════════════════════════════\n');

  try {
    // Purchase link from our listing
    const purchaseLink = 'https://buy.stripe.com/test_9B63cvdxoaer2OH4WBefC01';
    const beatName = 'Trap Beat - $5 Special';
    const videoPath = '/home/aaronishere2025/data/videos/renders/beat_1_Dark_Trap_Energy_1768614391757.mp4';

    // YouTube metadata
    const title = `${beatName} | Dark Trap Beat | 150 BPM [FREE DOWNLOAD]`;
    const description = `
🎵 ${beatName}

Dark aggressive trap beat perfect for rap and hip-hop. 150 BPM with heavy 808s and hard-hitting percussion.

🛒 BUY THIS BEAT (Instant Download): ${purchaseLink}

📊 BEAT INFO:
• BPM: 150
• Key: C minor
• Style: Trap / Hip-Hop
• Duration: 3:00
• Quality: Professional Studio Quality

💰 PRICING:
• Basic License: $5.00
• Includes: MP3 + WAV files
• Usage: Music videos, streaming, performances

🎤 PERFECT FOR:
• Rap vocals
• Hip-hop artists
• Music producers
• Content creators

📝 LICENSE TERMS:
• Non-exclusive rights
• Unlimited audio streams
• Up to 100K video views
• Credit required: "Produced by Unity AI"

🔗 PURCHASE LINK: ${purchaseLink}

✨ Generated with Unity AI - Professional beats powered by artificial intelligence

#TrapBeat #HipHopBeat #RapBeat #BeatForSale #TypeBeat #ProducerLife #150BPM #DarkTrap #AggressiveBeat #HeavyBass #808s
`.trim();

    console.log('📋 Upload Details:');
    console.log(`   Title: ${title}`);
    console.log(`   Video: ${videoPath}`);
    console.log(`   Purchase Link: ${purchaseLink}\n`);

    console.log('⏳ Uploading to YouTube...\n');

    // Upload to YouTube
    const result = await youtubeUploadService.uploadVideo(videoPath, {
      title,
      description,
      tags: [
        'trap beat',
        'hip hop beat',
        'rap beat',
        'beat for sale',
        'type beat',
        '150 bpm',
        'dark trap',
        'aggressive beat',
        'heavy bass',
        '808s',
        'beats',
        'instrumental',
        'producer',
        'music production',
      ],
      categoryId: '10', // Music category
      privacyStatus: 'public',
    });

    console.log('\n✅ Upload Complete!\n');
    console.log('📊 YouTube Video:');
    console.log(`   Video ID: ${result.videoId}`);
    console.log(`   URL: https://youtube.com/watch?v=${result.videoId}`);
    console.log(`   Title: ${result.title || title}`);
    console.log('\n🛒 Purchase link is in the description!\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('✨ SUCCESS! Beat is live on YouTube with purchase link');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('✅ Next Steps:');
    console.log(`   1. View video: https://youtube.com/watch?v=${result.videoId}`);
    console.log(`   2. Check description has purchase link`);
    console.log(`   3. Test purchase: ${purchaseLink}`);
    console.log(`   4. Share video to promote sales\n`);

    return result;
  } catch (error: any) {
    console.error('\n❌ Upload failed:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run
uploadBeatWithPurchaseLink()
  .then(() => {
    console.log('🎉 Beat successfully uploaded to YouTube with purchase link!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
