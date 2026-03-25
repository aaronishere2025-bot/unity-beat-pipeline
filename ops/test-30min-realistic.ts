import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { nanoid } from 'nanoid';

console.log('🎵 Creating 30-minute lofi with REALISTIC Suno V5 durations...\n');

const job = await db
  .insert(jobs)
  .values({
    id: nanoid(),
    userId: 'test-user',
    mode: 'music',
    scriptName: '30-Min Lofi (REALISTIC)',
    scriptContent: 'lofi hip-hop, chill study beats, 80 BPM, jazzy chords, vinyl crackle, smooth rhodes, ambient pads',
    lyrics: null, // Instrumental with filler lyrics
    aspectRatio: '16:9',
    duration: 1800, // 30 minutes
    clipDuration: 6,
    clipCount: 1, // Single cozy lofi clip, looped
    autoUpload: false,
    status: 'queued',
    progress: 0,
    metadata: {
      musicStyle: 'lofi',
      targetDuration: 1800, // 30 minutes
      isInstrumental: true,
      singleClip: true,
    },
    unityMetadata: {
      packageId: 'beat-generator',
      videoEngine: 'kling',
      customVisualPrompt:
        'Cozy animated study room, warm lamp lighting, rain on window, vinyl record player spinning, plants on desk, books stacked, coffee steam rising, peaceful atmosphere',
    },
  })
  .returning();

console.log('✅ Job created with REALISTIC strategy!');
console.log('📋 Job ID:', job[0].id);
console.log('⏱️  Target: 1800s (30 minutes)');
console.log('');
console.log('🔧 FIXES APPLIED:');
console.log('   1. Filler lyrics: ~1,680 chars per song (not 101!)');
console.log('   2. Song count: 15 songs × 2min = 30min (not 6 × 5min)');
console.log('   3. Realistic Suno V5 limits: 120s max per track');
console.log('');
console.log('💰 Expected cost: ~$1.50 (15 songs @ $0.10 + 1 clip @ $0.10)');
console.log('📐 Format: 16:9 widescreen');
console.log('');
console.log('📊 Monitor: http://localhost:8080/jobs');
console.log(`🔗 Direct: http://localhost:8080/jobs/${job[0].id}`);

process.exit(0);
