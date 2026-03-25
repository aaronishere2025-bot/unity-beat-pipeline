#!/usr/bin/env tsx
import { sunoApi } from './server/services/suno-api';
import { audioAnalysisService } from './server/services/audio-analysis-service';
import fs from 'fs';
import path from 'path';
import { join } from 'path';

async function testSingleBeat() {
  console.log('🧪 Testing single beat generation to find error\n');

  // Generate audio
  console.log('1. Generating audio with Suno...');
  const result = await sunoApi.generateSong({
    lyrics: '',
    style: 'dark trap, hard 808s, 140 BPM',
    title: 'Test Beat',
    instrumental: true,
    model: 'V5',
  });

  console.log('2. Waiting for Suno completion...');
  const tracks = await sunoApi.waitForCompletion(result.taskId);
  const audioResult = tracks[0];

  console.log(`3. Audio result: ${JSON.stringify(audioResult, null, 2)}`);

  if (!audioResult || !audioResult.audioUrl) {
    throw new Error('No audio URL');
  }

  const duration = audioResult.duration || 120;
  console.log(`4. Duration: ${duration} (type: ${typeof duration})`);
  console.log(`5. Attempting toFixed: ${duration.toFixed(1)}`);

  // Download
  const audioPath = path.join(process.cwd(), 'data', 'temp', 'processing', `test_${Date.now()}.mp3`);
  const audioResponse = await fetch(audioResult.audioUrl);
  const audioBuffer = await audioResponse.arrayBuffer();
  fs.writeFileSync(audioPath, Buffer.from(audioBuffer));
  console.log(`6. Downloaded: ${audioPath}`);

  // Analyze
  console.log('7. Analyzing audio...');
  const audioAnalysis = await audioAnalysisService.analyzeAudio(audioPath);

  console.log(
    `8. Analysis result: ${JSON.stringify(
      {
        bpm: audioAnalysis.bpm,
        energy: audioAnalysis.energy,
        duration: audioAnalysis.duration,
      },
      null,
      2,
    )}`,
  );

  const bpm = audioAnalysis.bpm || 120;
  const energy = audioAnalysis.energy || 0.5;
  const analyzedDuration = audioAnalysis.duration || 120;

  console.log(`9. BPM: ${bpm} (type: ${typeof bpm})`);
  console.log(`10. Energy: ${energy} (type: ${typeof energy})`);
  console.log(`11. Duration: ${analyzedDuration} (type: ${typeof analyzedDuration})`);

  console.log(`12. Attempting toFixed on energy: ${energy.toFixed(2)}`);

  console.log('\n✅ Test complete - no errors!');
}

testSingleBeat().catch((error) => {
  console.error('\n❌ ERROR:', error.message);
  console.error('Stack:', error.stack);
});
