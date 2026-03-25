import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { nanoid } from 'nanoid';

console.log('🎵 Testing FIXED Suno prompting with FILLER LYRICS for duration control...\n');

const job = await db
  .insert(jobs)
  .values({
    id: nanoid(),
    userId: 'test-user',
    mode: 'music',
    scriptName: '5-Min Test (Filler Lyrics)',
    scriptContent: 'lofi hip-hop, chill study beats, 80 BPM, jazzy chords, vinyl crackle',
    lyrics: null, // Instrumental - will use filler lyrics with structure tags
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
console.log('');
console.log('🔧 FIX APPLIED:');
console.log('   • Filler lyrics now ~4,200 characters (not 101!)');
console.log('   • Uses "(Ooh, ooh, ooh)" and similar musical filler');
console.log('   • Follows structure: [Intro], [Verse], [Chorus], etc.');
console.log('   • Expected: Suno should generate ~5 minute track');
console.log('');
console.log('📊 Monitor: http://localhost:8080/jobs');
console.log(`🔗 Direct: http://localhost:8080/jobs/${job[0].id}`);

process.exit(0);
