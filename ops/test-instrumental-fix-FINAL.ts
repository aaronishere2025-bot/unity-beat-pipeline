import { storage } from './server/storage';

async function testInstrumentalFix() {
  console.log('🧪 TEST: Verify instrumental=true is sent to Suno API');
  console.log('📋 This test checks the Suno API parameters before sending');
  console.log('✅ Expected: [Suno] Instrumental: true');
  console.log('❌ Bug would show: [Suno] Instrumental: false');
  console.log('');

  const job = await storage.createJob({
    userId: '9650f12e-cc0b-485f-981d-5bf39041e664',
    mode: 'music',
    scriptName: 'TEST: Instrumental Flag Fix',
    scriptContent: 'chill lofi beats, smooth rhodes piano, vinyl crackle, 85 BPM',
    lyrics: undefined, // NO LYRICS = instrumental
    bpm: 85,
    duration: 180, // 3 minutes
    status: 'queued',
    progress: 0,
    cost: 0,
    aspectRatio: '16:9',
    clipDuration: 6,
    clipCount: 1,
    autoUpload: false,
    metadata: {
      musicStyle: 'lofi',
      targetDuration: 180,
      isInstrumental: true,
      singleClip: true,
    },
    unityMetadata: {
      packageId: 'test-instrumental-flag',
      promptCount: 1,
      estimatedCost: 0.1,
      topic: 'beat',
      viralScore: 75,
      videoEngine: 'kling',
      preparingMusic: true,
      targetBPM: 85,
      customVisualPrompt: 'cute panda wearing oversized hoodie, studying with coffee, soft animation, warm lighting',
      musicStyle: 'lofi',
    },
  });

  console.log(`✅ Created test job: ${job.id}`);
  console.log(`\n🔍 Watch the logs for this line:`);
  console.log(`   [Suno] Instrumental: true  ← This should show TRUE`);
  console.log(`\n📺 Monitor: http://localhost:8080/beat-hub?tab=history`);
  console.log(`⏳ Wait for music generation to start (~10 seconds)...`);
}

testInstrumentalFix().catch(console.error);
