import { storage } from './server/storage';

async function generateFinalTest() {
  console.log('🎬 FINAL TEST: Instrumental beat with NO LYRICS WHATSOEVER!');
  console.log('🔧 Applied 2-layer fix:');
  console.log('   1. job-worker.ts: Clears filler lyrics before video gen');
  console.log('   2. music-mode-generator.ts: Detects and rejects filler lyrics');
  console.log('');

  const job = await storage.createJob({
    userId: '9650f12e-cc0b-485f-981d-5bf39041e664',
    mode: 'music',
    scriptName: 'FINAL: Pure Instrumental',
    scriptContent: 'trap beats, hard hitting 808s, aggressive drums, 140 BPM',
    lyrics: undefined, // NO LYRICS AT ALL
    bpm: 140,
    duration: 180,
    status: 'queued',
    progress: 0,
    cost: 0,
    aspectRatio: '16:9',
    clipDuration: 6,
    clipCount: 1,
    autoUpload: false,
    metadata: {
      musicStyle: 'trap',
      targetDuration: 180,
      isInstrumental: true, // ✅ Explicitly marked
      singleClip: true,
    },
    unityMetadata: {
      packageId: 'beat-generator',
      promptCount: 1,
      estimatedCost: 0.1,
      topic: 'beat',
      viralScore: 75,
      videoEngine: 'kling',
      preparingMusic: true,
      targetBPM: 140,
      // Animated character visual
      customVisualPrompt: 'Pepe the Frog in Supreme hoodie, counting stacks, meme aesthetic animation, trap vibes',
      musicStyle: 'trap',
    },
  });

  console.log(`✅ Created FINAL test beat: ${job.id}`);
  console.log(`📊 Visual: "Pepe in Supreme counting stacks"`);
  console.log(`🎵 Style: Trap (140 BPM)`);
  console.log(`⏱️  Duration: 3 minutes`);
  console.log(`❌ NO KARAOKE (fixed!)`);
  console.log(`\n🔍 Check: http://localhost:8080/beat-hub?tab=history`);
}

generateFinalTest().catch(console.error);
