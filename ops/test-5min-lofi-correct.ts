import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { nanoid } from 'nanoid';

console.log('🎵 Testing CORRECT Suno prompting for 5-minute lofi beat...\n');

const job = await db
  .insert(jobs)
  .values({
    id: nanoid(),
    userId: 'test-user',
    mode: 'music',
    scriptName: '5-Min Lofi Test (Structure Tags)',
    scriptContent: 'lofi hip-hop, chill study beats, 80 BPM, jazzy chords, vinyl crackle',
    lyrics: null, // Instrumental - will use structure tags
    aspectRatio: '16:9',
    duration: 300, // 5 minutes
    clipDuration: 6,
    clipCount: 1,
    autoUpload: false,
    status: 'queued',
    progress: 0,
    metadata: {
      musicStyle: 'lofi',
      targetDuration: 300, // 5 minutes
      isInstrumental: true,
      singleClip: true,
    },
    unityMetadata: {
      packageId: 'beat-generator',
      videoEngine: 'kling',
      customVisualPrompt: 'Cozy animated study room, warm lamp lighting, rain on window, vinyl record player spinning',
    },
  })
  .returning();

console.log('✅ Job created!');
console.log('📋 Job ID:', job[0].id);
console.log('🎯 Target: 300s (5 minutes)');
console.log('🎵 Method: Structure tags ([Intro][Verse][Chorus][Outro])');
console.log('💡 This is the CORRECT way to prompt Suno for longer instrumentals');
console.log('\n📊 Monitor: http://localhost:8080/jobs');

process.exit(0);
