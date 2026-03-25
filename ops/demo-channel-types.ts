#!/usr/bin/env tsx
/**
 * Demo: Show how metadata adapts to different beats and channel types
 */

import { beatMetadataGenerator, ChannelConfig, BeatMetadata } from './server/services/beat-metadata-generator';

// Simulated beats with VARIED styles
const DEMO_BEATS: Array<{ name: string; style: string; duration: number }> = [
  {
    name: 'Trap Energy',
    style: 'trap, hard 808s, aggressive hi-hats, 140 BPM, dark synth, minor key',
    duration: 127,
  },
  {
    name: 'Lofi Chill',
    style: 'lofi hip-hop, jazzy chords, 85 BPM, vinyl crackle, mellow bass, chill',
    duration: 109,
  },
  {
    name: 'Phonk Drift',
    style: 'phonk, cowbell, drift vibes, 160 BPM, memphis rap, hard bass',
    duration: 130,
  },
  {
    name: 'Boom Bap Classic',
    style: 'boom bap, 95 BPM, dusty drums, jazz sample, SP-404, golden era hip hop',
    duration: 134,
  },
  {
    name: 'Future Bass',
    style: 'future bass, melodic, 150 BPM, bright synths, uplifting, emotional',
    duration: 157,
  },
];

// Different channel configurations
const CHANNEL_TYPES: ChannelConfig[] = [
  {
    type: 'variety_channel',
    name: 'Beat Variety Channel',
    description: 'All types of beats',
    primaryGenres: ['Trap', 'Lofi', 'Phonk', 'Boom Bap', 'Future Bass'],
    targetAudience: ['producers', 'rappers', 'content creators'],
  },
  {
    type: 'lofi_channel',
    name: 'Lofi Beats Channel',
    description: 'Study and chill beats',
    primaryGenres: ['Lofi Hip Hop', 'Chillhop'],
    targetAudience: ['students', 'workers', 'readers'],
  },
  {
    type: 'trap_channel',
    name: 'Trap Beats Channel',
    description: 'Hard trap for rappers',
    primaryGenres: ['Trap', 'Dark Trap'],
    targetAudience: ['rappers', 'producers', 'gym goers'],
  },
  {
    type: 'type_beat_channel',
    name: 'Type Beats Store',
    description: 'Professional beats for sale',
    primaryGenres: ['Trap', 'Drill', 'Boom Bap'],
    targetAudience: ['artists', 'rappers', 'labels'],
  },
];

async function demoChannelTypes() {
  console.log('🎵 CHANNEL-AWARE METADATA DEMO\n');
  console.log('='.repeat(80));
  console.log('\nThis demo shows how THE SAME BEAT gets different metadata');
  console.log('based on your channel type!\n');
  console.log('='.repeat(80));

  // Demo 1: Show the Lofi beat on different channel types
  console.log(`\n\n${'#'.repeat(80)}`);
  console.log(`# DEMO 1: Same Beat, Different Channel Types`);
  console.log(`${'#'.repeat(80)}`);

  const lofiBeat = DEMO_BEATS[1]; // Lofi Chill
  console.log(`\n🎹 Beat: ${lofiBeat.name}`);
  console.log(`   Style: ${lofiBeat.style}`);

  for (const channelConfig of CHANNEL_TYPES) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`📺 Channel Type: ${channelConfig.type.toUpperCase()}`);
    console.log(`${'─'.repeat(80)}`);

    const beatMeta = await beatMetadataGenerator.extractBeatMetadata('', lofiBeat.style);
    beatMeta.duration = lofiBeat.duration;

    const metadata = beatMetadataGenerator.generateMetadata(beatMeta, channelConfig, '');

    console.log(`\n📝 Title: ${metadata.title}`);
    console.log(`\n🏷️  Tags (first 10):`);
    metadata.tags.slice(0, 10).forEach((tag, i) => {
      console.log(`   ${i + 1}. ${tag}`);
    });

    console.log(`\n📄 Description (first 8 lines):`);
    metadata.description
      .split('\n')
      .slice(0, 8)
      .forEach((line) => {
        console.log(`   ${line}`);
      });
  }

  // Demo 2: Show all beats on a variety channel
  console.log(`\n\n${'#'.repeat(80)}`);
  console.log(`# DEMO 2: Different Beats, Variety Channel`);
  console.log(`${'#'.repeat(80)}`);
  console.log(`\nShowing how different BPMs and genres are detected:\n`);

  const varietyChannel = CHANNEL_TYPES[0];

  for (const beat of DEMO_BEATS) {
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`🎹 ${beat.name}`);
    console.log(`${'─'.repeat(80)}`);

    const beatMeta = await beatMetadataGenerator.extractBeatMetadata('', beat.style);
    beatMeta.duration = beat.duration;

    console.log(`\n   Detected:`);
    console.log(`   • BPM: ${Math.round(beatMeta.bpm)}`);
    console.log(`   • Genre: ${beatMeta.genre}${beatMeta.subgenre ? ` / ${beatMeta.subgenre}` : ''}`);
    console.log(`   • Mood: ${beatMeta.mood.join(', ')}`);
    console.log(`   • Energy: ${beatMeta.energy.toUpperCase()}`);
    console.log(`   • Instruments: ${beatMeta.instrumentTags.join(', ') || 'None'}`);

    const metadata = beatMetadataGenerator.generateMetadata(beatMeta, varietyChannel, '');

    console.log(`\n   Generated Title:`);
    console.log(`   "${metadata.title}"`);

    console.log(`\n   Key Tags:`);
    metadata.tags.slice(0, 8).forEach((tag, i) => {
      console.log(`   ${i + 1}. ${tag}`);
    });

    console.log(`\n   Use Cases:`);
    beatMeta.useCases.forEach((useCase) => {
      console.log(`   ✅ ${useCase}`);
    });
  }

  // Summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`✅ KEY TAKEAWAYS`);
  console.log(`${'='.repeat(80)}`);

  console.log(`\n✨ VARIED BPMs:`);
  DEMO_BEATS.forEach((beat) => {
    const bpmMatch = beat.style.match(/(\d+)\s*BPM/i);
    const bpm = bpmMatch ? bpmMatch[1] : '???';
    console.log(`   • ${beat.name}: ${bpm} BPM`);
  });

  console.log(`\n🎯 CHANNEL-SPECIFIC TAGGING:`);
  console.log(`   • Lofi Channel: Focus on study, chill, relaxation tags`);
  console.log(`   • Trap Channel: Focus on rap, hard, aggressive tags`);
  console.log(`   • Type Beat Channel: Focus on [FREE], artist names, for sale`);
  console.log(`   • Variety Channel: Show genre diversity, broader tags`);

  console.log(`\n📊 SMART DETECTION:`);
  console.log(`   ✅ BPM automatically extracted from style`);
  console.log(`   ✅ Genre determined from keywords (trap, lofi, phonk)`);
  console.log(`   ✅ Mood detected (dark, chill, epic, dreamy)`);
  console.log(`   ✅ Energy calculated from BPM (<90=low, >130=high)`);
  console.log(`   ✅ Instruments tagged (808s, vinyl, jazz, cowbell)`);
  console.log(`   ✅ Use cases matched to genre and energy`);

  console.log(`\n💡 HOW TO USE:`);
  console.log(`   1. Set your channel type in CHANNEL_CONFIG`);
  console.log(`   2. Generate beats with varied styles and BPMs`);
  console.log(`   3. System automatically adapts metadata per beat`);
  console.log(`   4. Each beat gets optimized tags for your channel focus`);

  console.log(`\n🚀 RESULT:`);
  console.log(`   • No more manual tagging`);
  console.log(`   • Consistent channel branding`);
  console.log(`   • SEO-optimized titles and tags`);
  console.log(`   • Proper BPM in every title`);
  console.log(`   • Genre-appropriate descriptions`);

  console.log(`\n${'='.repeat(80)}\n`);
}

demoChannelTypes();
