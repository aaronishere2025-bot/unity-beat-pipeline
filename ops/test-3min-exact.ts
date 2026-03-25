import { db } from './server/db.js';
import { jobs } from '@shared/schema';
import { nanoid } from 'nanoid';

console.log('🎵 Testing EXACT 3-minute duration with forced lyrics approach...\n');

const job = await db
  .insert(jobs)
  .values({
    id: nanoid(),
    userId: 'test-user',
    mode: 'music',
    scriptName: '3-Min Test (Exact)',
    scriptContent: 'lofi hip-hop, chill study beats, 80 BPM, jazzy chords, vinyl crackle',
    lyrics: null, // Instrumental - will use substantial filler lyrics
    aspectRatio: '16:9',
    duration: 180, // EXACTLY 3 minutes
    clipDuration: 6,
    clipCount: 1,
    autoUpload: false,
    status: 'queued',
    progress: 0,
    metadata: {
      musicStyle: 'lofi',
      targetDuration: 180,
      isInstrumental: true,
      singleClip: true,
    },
    unityMetadata: {
      packageId: 'beat-generator',
      videoEngine: 'kling',
      customVisualPrompt: 'Cozy animated study room',
    },
  })
  .returning();

console.log('✅ Job created!');
console.log('📋 Job ID:', job[0].id);
console.log('🎯 Target: EXACTLY 180s (3:00)');
console.log('');
console.log('🔧 NEW APPROACH:');
console.log('   • Filler lyrics: ~2,520 chars (more substantial)');
console.log('   • instrumental=false (forces Suno to respect char count)');
console.log('   • style="...instrumental" (makes it instrumental anyway)');
console.log('   • Single song (not split into multiple)');
console.log('');
console.log('📊 Monitor: http://localhost:8080/jobs');
console.log(`🔗 Direct: http://localhost:8080/jobs/${job[0].id}`);

process.exit(0);
