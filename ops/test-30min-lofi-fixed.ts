import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { nanoid } from 'nanoid';

console.log('🎵 Creating 30-minute lofi beat with PLACEHOLDER LYRICS FIX...\n');

const job = await db
  .insert(jobs)
  .values({
    id: nanoid(),
    userId: 'test-user',
    mode: 'music',
    scriptName: '30-Min Lofi Mix (Fixed)',
    scriptContent: 'lofi hip-hop, chill study beats, 80 BPM, jazzy chords, vinyl crackle',
    lyrics: null, // Instrumental - will use placeholder lyrics
    aspectRatio: '16:9',
    duration: 1800, // 30 minutes
    clipDuration: 6,
    clipCount: 1, // Single themed clip
    autoUpload: false,
    status: 'queued',
    progress: 0,
    musicDescription: 'lofi hip-hop, chill study beats, 80 BPM',
    metadata: {
      musicStyle: 'lofi',
      targetDuration: 1800, // 30 minutes = 1800 seconds
      clipDuration: 6,
      isInstrumental: true,
      singleClip: true,
    },
    unityMetadata: {
      packageId: 'beat-generator',
      promptCount: 1,
      estimatedCost: 0.4,
      topic: 'beat',
      viralScore: 75,
      videoEngine: 'kling',
      preparingMusic: true,
      targetBPM: 80,
      customVisualPrompt:
        'Cozy animated study room, warm lamp lighting, rain on window, vinyl record player spinning, plants on desk, books stacked, coffee steam rising, peaceful atmosphere, soft colors, nostalgic vibes',
    },
  })
  .returning();

console.log('✅ Job created with placeholder lyrics fix!');
console.log('📋 Job ID:', job[0].id);
console.log('🎵 Mode:', job[0].mode);
console.log('⏱️  Target: 1800s (30 minutes)');
console.log('🎤 Strategy: 6 songs × 5 min with placeholder lyrics');
console.log('💰 Expected Cost: ~$0.40 (6 songs @ $0.05 + 1 clip @ $0.10)');
console.log('\n📊 Monitor at: http://localhost:8080/jobs');
console.log(`🔍 Direct: http://localhost:8080/jobs/${job[0].id}`);

process.exit(0);
