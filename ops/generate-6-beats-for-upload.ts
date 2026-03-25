#!/usr/bin/env tsx
/**
 * Generate 6 diverse beats (3 lofi + 3 trap) for YouTube upload
 * Uses fixed Music Mode pipeline (Path 3: generates from scriptContent)
 */

import { storage } from './server/storage';

// LOFI BEATS (3)
const LOFI_BEATS = [
  {
    name: 'Late Night Study Session',
    style: 'lofi hip hop, mellow piano, 82 BPM, vinyl crackle, warm bass, jazzy chords, nostalgic',
    tags: ['lofi', 'study music', 'chill beats', 'homework', 'focus'],
  },
  {
    name: 'Rainy Day Coffee',
    style: 'chillhop, soft keys, 78 BPM, rain sounds, acoustic guitar, cozy vibes, ambient',
    tags: ['lofi', 'coffee shop', 'rainy day', 'chill', 'relaxing'],
  },
  {
    name: 'Midnight City Lights',
    style: 'lofi beats, electric piano, 85 BPM, city ambience, smooth bass, dreamy pads',
    tags: ['lofi', 'night vibes', 'city pop', 'chill', 'aesthetic'],
  },
];

// TRAP BEATS (3)
const TRAP_BEATS = [
  {
    name: 'Savage Mode',
    style: 'dark trap, hard 808s, 140 BPM, menacing synth, aggressive hi-hats, minor key',
    tags: ['trap', 'rap beat', 'hard', '808', 'type beat'],
  },
  {
    name: 'Flex on Em',
    style: 'trap banger, thunderous bass, 145 BPM, bell melody, trap rolls, energetic',
    tags: ['trap', 'hard trap', 'rap', 'freestyle', 'banger'],
  },
  {
    name: 'Street Dreams',
    style: 'melodic trap, emotional piano, 138 BPM, soft 808s, guitar melody, atmospheric',
    tags: ['trap', 'melodic', 'emotional', 'rap beat', 'type beat'],
  },
];

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   GENERATING 6 BEATS FOR UPLOAD (3 Lofi + 3 Trap)         ║');
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
      // Create Music Mode job with scriptContent (uses Path 3 - Suno generation)
      const job = await storage.createJob({
        scriptName: `${beat.name} [${beat.contentType}_channel]`,
        scriptContent: beat.style,
        mode: 'music',
        aspectRatio: '9:16',
        clipDuration: 6,
        status: 'queued',
        progress: 0,
        metadata: {
          beatStyle: beat.style,
          contentType: beat.contentType,
          tags: beat.tags,
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

  console.log(`\n⏳ Jobs are now queued and will be processed automatically`);
  console.log('   The job worker will pick them up and:');
  console.log('   1. Generate music with Suno (Path 3 - NEW)');
  console.log('   2. Analyze audio with Librosa');
  console.log('   3. Generate beat-synced video');
  console.log('   4. Create final assembly\n');

  console.log('📺 Monitor progress:');
  console.log('   • Dashboard: http://localhost:8080');
  console.log('   • API: curl http://localhost:8080/api/jobs\n');

  console.log('🎬 Upload after completion:');
  console.log('   The videos will be in data/videos/renders/');
  console.log('   Use the Thompson Sampling bandit for channel selection\n');

  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  console.error(error.stack);
  process.exit(1);
});
