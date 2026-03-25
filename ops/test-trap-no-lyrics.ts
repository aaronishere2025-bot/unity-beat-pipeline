import { storage } from './server/storage';

async function testTrapNoLyrics() {
  console.log('🎬 TEST: Trap beat with NO LYRICS');
  console.log('✅ Expected: [Suno] Instrumental: true');
  console.log('✅ Expected: Final video (instrumental) - NO KARAOKE');
  console.log('');

  const job = await storage.createJob({
    userId: '9650f12e-cc0b-485f-981d-5bf39041e664',
    mode: 'music',
    scriptName: 'TEST: Trap No Lyrics',
    scriptContent: 'hard trap beat, aggressive 808s, dark synths, rapid hi-hats, 140 BPM',
    lyrics: undefined, // NO LYRICS = instrumental
    bpm: 140,
    duration: 180, // 3 minutes
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
      isInstrumental: true,
      singleClip: true,
    },
    unityMetadata: {
      packageId: 'test-trap-instrumental',
      promptCount: 1,
      estimatedCost: 0.1,
      topic: 'beat',
      viralScore: 85,
      videoEngine: 'kling',
      preparingMusic: true,
      targetBPM: 140,
      customVisualPrompt: 'Pepe the Frog in Supreme hoodie, counting stacks, meme aesthetic animation, trap vibes',
      musicStyle: 'trap',
    },
  });

  console.log(`✅ Created trap beat test: ${job.id}`);
  console.log(`🎨 Visual: "Pepe in Supreme counting stacks"`);
  console.log(`🎵 Style: Trap (140 BPM, 3 minutes)`);
  console.log(`❌ NO LYRICS (instrumental only)`);
  console.log(`\n📺 Monitor: http://localhost:8080/beat-hub?tab=history`);
}

testTrapNoLyrics().catch(console.error);
