import { storage } from './server/storage';

async function generateInstrumentalBeat() {
  console.log('🎬 Generating INSTRUMENTAL beat (NO LYRICS!)...');
  console.log('🎨 With NEW animated character visuals!');
  console.log('');

  const job = await storage.createJob({
    userId: '9650f12e-cc0b-485f-981d-5bf39041e664',
    mode: 'music',
    scriptName: 'TEST: Fixed Instrumental',
    scriptContent: 'trap beats, hard hitting 808s, aggressive drums, 140 BPM', // Beat description (NOT lyrics)
    lyrics: undefined, // ✅ NO LYRICS - pure instrumental
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
      isInstrumental: true, // ✅ Explicitly mark as instrumental
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
      // NEW animated character visual (randomly selected)
      customVisualPrompt:
        'cool cat with backwards cap and chains, smoking cigar in studio, animated hip-hop style, money falling around',
      musicStyle: 'trap',
    },
  });

  console.log(`✅ Created FIXED instrumental beat: ${job.id}`);
  console.log(`📊 Visual: "cool cat with backwards cap and chains"`);
  console.log(`🎵 Style: Trap (140 BPM)`);
  console.log(`⏱️  Duration: 3 minutes`);
  console.log(`❌ NO LYRICS (pure instrumental!)`);
  console.log(`\n🔍 Check: http://localhost:8080/beat-hub?tab=history`);
  console.log(`\n⏳ Wait ~3-5 minutes for completion...`);
}

generateInstrumentalBeat().catch(console.error);
