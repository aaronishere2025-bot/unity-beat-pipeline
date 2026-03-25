import { storage } from './server/storage';

async function generateTestBeat() {
  console.log('🎬 Generating test beat with NEW animated character system...');

  const job = await storage.createJob({
    userId: '9650f12e-cc0b-485f-981d-5bf39041e664', // Your admin user ID from logs
    mode: 'music',
    scriptName: 'TEST: Animated Trap Character',
    scriptContent: 'trap beats, hard hitting 808s, aggressive drums, 140 BPM',
    bpm: 140,
    duration: 180,
    status: 'queued',
    progress: 0,
    cost: 0,
    aspectRatio: '16:9',
    clipDuration: 6,
    clipCount: 1, // Single clip for beat
    autoUpload: false,
    metadata: {
      musicStyle: 'trap',
      targetDuration: 180,
      isInstrumental: true,
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
      // This will use the NEW animated character system!
      customVisualPrompt:
        'gorilla wearing designer sunglasses and gold chain, vibing in neon city, 3D animation, swagger walk, purple and pink lighting',
      musicStyle: 'trap',
    },
  });

  console.log(`✅ Created test beat job: ${job.id}`);
  console.log(`📊 Visual prompt: "gorilla with gold chain vibing in neon city"`);
  console.log(`🎵 Style: Trap (140 BPM)`);
  console.log(`⏱️  Duration: 3 minutes`);
  console.log(`\n🔍 Check status: http://localhost:8080/beat-hub?tab=history`);
  console.log(`\n⏳ Wait ~3-5 minutes for completion...`);
}

generateTestBeat().catch(console.error);
