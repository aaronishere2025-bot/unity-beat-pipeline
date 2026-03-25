import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { nanoid } from 'nanoid';

console.log('🎵 Creating 30-minute lofi beat generation job...\n');

const job = await db
  .insert(jobs)
  .values({
    id: nanoid(),
    userId: 'test-user',
    mode: 'music',
    scriptName: 'Lofi Mix Test 30min',
    scriptContent: 'lofi hip-hop, chill study beats, 80 BPM, relaxed groove, jazzy chords, vinyl crackle',
    lyrics: null,
    aspectRatio: '16:9',
    duration: 1800, // 30 minutes
    clipDuration: 6,
    clipCount: 1, // Single clip mode
    autoUpload: false,
    status: 'queued',
    progress: 0,
    musicDescription: 'lofi hip-hop, chill study beats, 80 BPM',
    metadata: {
      musicStyle: 'lofi',
      targetDuration: 1800, // 30 minutes = 1800 seconds
      clipDuration: 6,
      isInstrumental: true,
      singleClip: true, // Enable single clip loop mode
    },
    unityMetadata: {
      packageId: 'beat-generator',
      promptCount: 1,
      estimatedCost: 0.4, // 6 songs @ $0.05 + 1 clip @ $0.10
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

console.log('✅ Job created successfully!');
console.log('📋 Job ID:', job[0].id);
console.log('🎬 Mode:', job[0].mode);
console.log('⏱️  Target Duration:', job[0].duration, 'seconds (30 minutes)');
console.log('🎞️  Clips:', job[0].clipCount, '(single themed clip, looped)');
console.log('💰 Estimated Cost: $0.40');
console.log('🎨 Visual Theme: Cozy lofi study room');
console.log('\n📊 Check progress at: http://localhost:8080/jobs');
console.log(`🔍 Job URL: http://localhost:8080/jobs/${job[0].id}`);

process.exit(0);
