#!/usr/bin/env tsx
/**
 * Generate 6 diverse beats (3 lofi + 3 trap) with FULL VIDEO GENERATION
 */

import { storage } from './server/storage';

// LOFI BEATS (3)
const LOFI_BEATS = [
  {
    name: 'Midnight Study Lounge',
    style: 'lofi hip hop, warm piano, 80 BPM, vinyl texture, smooth bass, jazzy, relaxing',
    tags: ['lofi', 'study music', 'chill beats', 'homework', 'focus'],
  },
  {
    name: 'Coffee Shop Rain',
    style: 'chillhop, gentle keys, 75 BPM, rain ambience, acoustic elements, cozy atmosphere',
    tags: ['lofi', 'coffee shop', 'rainy day', 'chill', 'relaxing'],
  },
  {
    name: 'City Nights Chill',
    style: 'lofi beats, rhodes piano, 88 BPM, urban sounds, deep bass, dreamy synths',
    tags: ['lofi', 'night vibes', 'city', 'chill', 'aesthetic'],
  },
];

// TRAP BEATS (3)
const TRAP_BEATS = [
  {
    name: 'Beast Mode',
    style: 'dark trap, heavy 808s, 138 BPM, aggressive synth, rapid hi-hats, intense energy',
    tags: ['trap', 'rap beat', 'hard', '808', 'type beat'],
  },
  {
    name: 'Money Moves',
    style: 'trap banger, booming bass, 142 BPM, bell melody, trap rolls, hype energy',
    tags: ['trap', 'hard trap', 'rap', 'freestyle', 'banger'],
  },
  {
    name: 'Nightfall Dreams',
    style: 'melodic trap, emotional keys, 135 BPM, soft 808s, guitar touches, atmospheric pads',
    tags: ['trap', 'melodic', 'emotional', 'rap beat', 'type beat'],
  },
];

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   GENERATING 6 BEATS WITH FULL VIDEO (3 Lofi + 3 Trap)    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const allBeats = [
    ...LOFI_BEATS.map((b) => ({ ...b, contentType: 'lofi' as const })),
    ...TRAP_BEATS.map((b) => ({ ...b, contentType: 'trap' as const })),
  ];

  const createdJobs: string[] = [];

  for (let i = 0; i < allBeats.length; i++) {
    const beat = allBeats[i];
    const beatNum = i + 1;

    console.log(`\n${'━'.repeat(60)}`);
    console.log(`[${beatNum}/6] ${beat.name.toUpperCase()} [${beat.contentType}]`);
    console.log(`${'━'.repeat(60)}`);
    console.log(`📊 Style: ${beat.style}`);

    try {
      // Create Music Mode job with full video generation
      const job = await storage.createJob({
        scriptName: `${beat.name} [${beat.contentType}_channel]`,
        scriptContent: beat.style,
        mode: 'music',
        aspectRatio: '9:16',
        clipDuration: 5,
        status: 'queued',
        progress: 0,
        metadata: {
          beatStyle: beat.style,
          contentType: beat.contentType,
          tags: beat.tags,
          generateFullVideo: true,
        },
      });

      createdJobs.push(job.id);
      console.log(`✅ Job created: ${job.id}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Mode: ${job.mode}`);
    } catch (error: any) {
      console.error(`❌ Failed to create job for ${beat.name}:`, error.message);
    }
  }

  console.log(`\n${'━'.repeat(60)}`);
  console.log('📊 GENERATION SUMMARY');
  console.log(`${'━'.repeat(60)}`);
  console.log(`✅ ${createdJobs.length}/6 jobs created successfully\n`);

  console.log('📋 Job IDs:');
  for (let i = 0; i < createdJobs.length; i++) {
    const jobId = createdJobs[i];
    const beat = allBeats[i];
    console.log(`   ${i + 1}. ${beat.name} → ${jobId}`);
  }

  console.log(`\n⏳ Jobs are now queued for full video generation:`);
  console.log('   1. Generate music with Suno');
  console.log('   2. Analyze audio beats with Librosa');
  console.log('   3. Generate beat-synced Kling video backgrounds');
  console.log('   4. Apply visual effects and transitions');
  console.log('   5. Assemble final video with FFmpeg\n');

  console.log('📺 Monitor progress:');
  console.log('   • Dashboard: http://localhost:8080');
  console.log('   • API: curl http://localhost:8080/api/jobs\n');

  console.log('🎬 Videos will be saved to:');
  console.log('   data/videos/renders/\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  console.error(error.stack);
  process.exit(1);
});
