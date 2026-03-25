#!/usr/bin/env tsx
/**
 * Dynamic beat upload with channel-aware metadata
 * Extracts actual BPM and adapts tags to channel type
 */

import { beatMetadataGenerator, ChannelConfig } from './server/services/beat-metadata-generator';
import { youtubeUploadService } from './server/services/youtube-upload-service';
import fs from 'fs';

// CONFIGURE YOUR CHANNEL TYPE HERE
const CHANNEL_CONFIG: ChannelConfig = {
  type: 'variety_channel', // Change this based on your channel focus
  name: 'Your Beat Channel',
  description: 'High-quality beats for creators',
  primaryGenres: ['Trap', 'Lofi', 'Phonk', 'Boom Bap'],
  targetAudience: ['producers', 'rappers', 'content creators', 'students'],
};

// Our generated beats with their actual styles
const BEATS = [
  {
    path: '/home/aaronishere2025/data/videos/renders/music_050b65e9-561f-46b4-862e-15166fa52e24_1768606467699.mp4',
    thumbnail: '/home/aaronishere2025/data/thumbnails/050b65e9-561f-46b4-862e-15166fa52e24_thumbnail.jpg',
    audioStyle: 'trap, hard 808s, aggressive hi-hats, 140 BPM, dark synth, minor key',
    duration: 123,
  },
  {
    path: '/home/aaronishere2025/data/videos/renders/music_20ee97e8-f850-404b-88c4-6e426ba592c2_1768608048660.mp4',
    thumbnail: '/home/aaronishere2025/data/thumbnails/20ee97e8-f850-404b-88c4-6e426ba592c2_thumbnail.jpg',
    audioStyle: 'cinematic orchestral trap, epic rap battle, 140 BPM half-time, thunderous 808s',
    duration: 126,
  },
  {
    path: '/home/aaronishere2025/data/videos/renders/beat_compilation_645c352b-aab7-44bc-bdfb-4241780364ba_1768608182347.mp4',
    thumbnail: '/home/aaronishere2025/data/thumbnails/645c352b-aab7-44bc-bdfb-4241780364ba_thumbnail.jpg',
    audioStyle: 'trap, hard 808s, aggressive hi-hats, 140 BPM, dark synth',
    duration: 127,
  },
];

async function uploadBeatsWithDynamicMetadata() {
  console.log('🎵 DYNAMIC BEAT UPLOAD SYSTEM\n');
  console.log('='.repeat(70));
  console.log(`\n📺 Channel Configuration:`);
  console.log(`   Type: ${CHANNEL_CONFIG.type}`);
  console.log(`   Name: ${CHANNEL_CONFIG.name}`);
  console.log(`   Focus: ${CHANNEL_CONFIG.primaryGenres.join(', ')}`);
  console.log('');

  console.log('💡 Note: Metadata adapts to your channel type!');
  console.log('   Change CHANNEL_CONFIG.type to:');
  console.log('   • lofi_channel - Focus on study/chill beats');
  console.log('   • trap_channel - Focus on hard trap beats');
  console.log('   • type_beat_channel - Focus on selling beats');
  console.log('   • variety_channel - Show genre diversity\n');
  console.log('='.repeat(70));

  for (let i = 0; i < BEATS.length; i++) {
    const beat = BEATS[i];

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🎹 Beat ${i + 1}/${BEATS.length}`);
    console.log(`${'─'.repeat(70)}`);

    // Check if file exists
    if (!fs.existsSync(beat.path)) {
      console.error(`   ❌ Video not found: ${beat.path}`);
      continue;
    }

    // Extract beat metadata from style
    console.log(`   📊 Analyzing beat...`);
    const beatMeta = await beatMetadataGenerator.extractBeatMetadata(beat.path, beat.audioStyle);

    beatMeta.duration = beat.duration;

    console.log(`\n   🎼 Detected:`);
    console.log(`      Genre: ${beatMeta.genre}${beatMeta.subgenre ? ` (${beatMeta.subgenre})` : ''}`);
    console.log(`      BPM: ${Math.round(beatMeta.bpm)}`);
    console.log(`      Mood: ${beatMeta.mood.join(', ')}`);
    console.log(`      Energy: ${beatMeta.energy.toUpperCase()}`);
    console.log(`      Instruments: ${beatMeta.instrumentTags.join(', ')}`);

    // Generate channel-aware metadata
    const metadata = beatMetadataGenerator.generateMetadata(beatMeta, CHANNEL_CONFIG, beat.path);

    const fileSizeMB = (fs.statSync(beat.path).size / 1024 / 1024).toFixed(1);

    console.log(`\n   📝 Generated Metadata:`);
    console.log(`      Title: ${metadata.title}`);
    console.log(`      Tags: ${metadata.tags.length} tags`);
    console.log(`      Size: ${fileSizeMB} MB`);

    // Show first few tags
    console.log(`\n   🏷️  Tag Preview (first 10):`);
    metadata.tags.slice(0, 10).forEach((tag, idx) => {
      console.log(`      ${idx + 1}. ${tag}`);
    });

    // Show description preview
    console.log(`\n   📄 Description Preview:`);
    const descLines = metadata.description.split('\n').slice(0, 10);
    descLines.forEach((line) => {
      console.log(`      ${line}`);
    });
    console.log(`      ... (${metadata.description.split('\n').length} total lines)`);

    console.log(`\n   ⏭️  Upload Status: Ready (OAuth not configured)`);
    console.log(`   💡 To upload: Configure YouTube OAuth in Secret Manager`);

    // Uncomment to actually upload:
    /*
    try {
      const result = await youtubeUploadService.uploadVideo({
        videoPath: beat.path,
        thumbnailPath: fs.existsSync(beat.thumbnail) ? beat.thumbnail : undefined,
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: metadata.category,
        privacyStatus: 'public',
      });

      console.log(`   ✅ Uploaded: https://youtube.com/watch?v=${result.videoId}`);
    } catch (error: any) {
      console.error(`   ❌ Upload failed: ${error.message}`);
    }
    */

    if (i < BEATS.length - 1) {
      console.log(`\n   ⏳ Processing next beat...\n`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ METADATA GENERATION COMPLETE`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\n📊 Summary:`);
  console.log(`   Beats processed: ${BEATS.length}`);
  console.log(`   Channel type: ${CHANNEL_CONFIG.type}`);
  console.log(`   All beats tagged with:`);
  console.log(`   • Actual extracted BPM (varies per beat)`);
  console.log(`   • Genre-specific tags`);
  console.log(`   • Channel-appropriate descriptions`);
  console.log(`   • Mood and energy descriptors`);

  console.log(`\n🎯 Each beat is now optimized for:`);
  console.log(`   • Search: "[genre] beat [bpm] bpm"`);
  console.log(`   • Discovery: Genre-specific keywords`);
  console.log(`   • Audience: ${CHANNEL_CONFIG.targetAudience.join(', ')}`);

  console.log(`\n💡 To try different channel types:`);
  console.log(`   1. Edit CHANNEL_CONFIG.type in this file`);
  console.log(`   2. Run again to see how metadata changes`);
  console.log(`   3. Example: 'lofi_channel' vs 'trap_channel' vs 'type_beat_channel'`);

  console.log(`\n🔐 To enable uploads:`);
  console.log(`   1. Add YouTube OAuth to Secret Manager`);
  console.log(`   2. Uncomment upload code in script`);
  console.log(`   3. Rerun to upload with optimized metadata`);

  console.log(`${'='.repeat(70)}\n`);
}

uploadBeatsWithDynamicMetadata();
