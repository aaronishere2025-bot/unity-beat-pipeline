import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { nanoid } from 'nanoid';

console.log('🎵 Creating 30-minute lofi with CORRECTED Suno structure prompting...\n');

const job = await db
  .insert(jobs)
  .values({
    id: nanoid(),
    userId: 'test-user',
    mode: 'music',
    scriptName: '30-Min Lofi Mix - FINAL TEST',
    scriptContent: 'lofi hip-hop, chill study beats, 80 BPM, jazzy chords, vinyl crackle, smooth rhodes, ambient pads',
    lyrics: null, // Instrumental - will use structure tags
    aspectRatio: '16:9',
    duration: 1800, // 30 minutes
    clipDuration: 6,
    clipCount: 1, // Single cozy study room clip, looped
    autoUpload: false,
    status: 'queued',
    progress: 0,
    metadata: {
      musicStyle: 'lofi',
      targetDuration: 1800, // 30 minutes = 1800 seconds
      isInstrumental: true,
      singleClip: true,
    },
    unityMetadata: {
      packageId: 'beat-generator',
      videoEngine: 'kling',
      customVisualPrompt:
        'Cozy animated study room, warm lamp lighting, rain on window, vinyl record player spinning, plants on desk, books stacked, coffee steam rising, peaceful atmosphere, soft colors, nostalgic vibes',
    },
  })
  .returning();

console.log('✅ Job created with CORRECT Suno prompting!');
console.log('📋 Job ID:', job[0].id);
console.log('⏱️  Target: 1800s (30 minutes)');
console.log('🎵 Strategy:');
console.log('   • 6 songs × 5 min each = 30 minutes');
console.log('   • Each song uses structure tags: [Intro][Verse 1][Chorus]...[Outro]');
console.log('   • Style hints: "5:00 long, 300 seconds total"');
console.log('🎬 Visual:');
console.log('   • 1 cozy study room Kling clip');
console.log('   • Looped 360× to match 30-min duration');
console.log('💰 Expected: ~$0.40 (6 songs @ $0.05 + 1 clip @ $0.10)');
console.log('📐 Format: 16:9 (YouTube/widescreen)');
console.log('\n📊 Monitor: http://localhost:8080/jobs');
console.log(`🔗 Direct: http://localhost:8080/jobs/${job[0].id}`);

process.exit(0);
