import { musicModeGenerator } from './server/services/music-mode-generator';
import { sunoApi } from './server/services/suno-api';
import { db } from './server/db';
import { jobs } from '@shared/schema';
import path from 'path';
import { join } from 'path';
import fs from 'fs';

async function testBeatGeneration() {
  console.log('🧪 COMPREHENSIVE BEAT GENERATION TEST\n');
  console.log('Testing the fix for "optimizedVisual is not defined" error\n');

  const testJobId = `test-${Date.now()}`;
  const testTitle = 'Test Beat - Lofi Study';

  try {
    // ============================================
    // PHASE 1: Generate Music with Suno
    // ============================================
    console.log('🎵 PHASE 1: Generating music with Suno via kie.ai...\n');

    const sunoResult = await sunoApi.generateSong({
      title: testTitle,
      style: 'lofi, chill beats, study music, relaxing, 75 BPM',
      instrumental: true,
    });

    console.log(`✅ Suno track generated:`);
    console.log(`   Task ID: ${sunoResult.taskId}`);
    console.log(`   Tracks: ${sunoResult.tracks.length}`);
    console.log(`   Duration: ${sunoResult.tracks[0].duration}s`);
    console.log(`   Audio URL: ${sunoResult.tracks[0].audioUrl}`);

    // Download audio file
    const audioPath = `${join(process.cwd(), 'data', 'temp', 'processing')}/test-beat-${Date.now()}.mp3`;
    const axios = (await import('axios')).default;
    const response = await axios.get(sunoResult.tracks[0].audioUrl, {
      responseType: 'arraybuffer',
    });
    fs.writeFileSync(audioPath, response.data);
    console.log(`✅ Audio downloaded: ${audioPath}\n`);

    // ============================================
    // PHASE 2: Generate Video with Music Mode
    // ============================================
    console.log('🎬 PHASE 2: Generating video with music mode...\n');

    const result = await musicModeGenerator.generateMusicVideo({
      packageId: testJobId,
      audioFilePath: audioPath,
      audioDuration: sunoResult.tracks[0].duration,
      aspectRatio: '16:9',
      instrumental: true,
      onProgress: (progress, message) => {
        console.log(`   ${progress}% - ${message}`);
      },
    });

    console.log('\n✅ VIDEO GENERATION SUCCESSFUL!');
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Thumbnail: ${result.thumbnailPath}`);
    console.log(`   Theme: ${result.theme}`);
    console.log(`   BPM: ${result.beatAnalysis.bpm}`);
    console.log(`   Loop count: ${result.metadata.loopCount}`);
    console.log(`   Processing time: ${(result.metadata.processingTimeMs / 1000).toFixed(1)}s`);

    // ============================================
    // PHASE 3: Verify optimizedVisual is defined
    // ============================================
    console.log('\n🔍 PHASE 3: Verifying optimizedVisual data...\n');

    if (!result.optimizedVisual) {
      throw new Error('❌ FAILED: optimizedVisual is undefined!');
    }

    console.log('✅ optimizedVisual is defined:');
    console.log(`   Style: ${result.optimizedVisual.style}`);
    console.log(`   Expected CTR: ${result.optimizedVisual.expectedCTR}%`);
    console.log(`   Based on samples: ${result.optimizedVisual.basedOnSamples}`);
    console.log(`   Reasoning: ${result.optimizedVisual.reasoning}`);

    // ============================================
    // PHASE 4: Verify files exist
    // ============================================
    console.log('\n📁 PHASE 4: Verifying generated files...\n');

    if (!fs.existsSync(result.videoPath)) {
      throw new Error(`❌ Video file not found: ${result.videoPath}`);
    }
    console.log(`✅ Video file exists (${(fs.statSync(result.videoPath).size / 1024 / 1024).toFixed(1)}MB)`);

    if (!fs.existsSync(result.thumbnailPath)) {
      throw new Error(`❌ Thumbnail not found: ${result.thumbnailPath}`);
    }
    console.log(`✅ Thumbnail exists (${(fs.statSync(result.thumbnailPath).size / 1024).toFixed(1)}KB)`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(70));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(70));
    console.log('\n✅ The "optimizedVisual is not defined" bug is FIXED');
    console.log('✅ Suno API integration via kie.ai works correctly');
    console.log('✅ Music mode video generation completes successfully');
    console.log('✅ All return values are properly defined');
    console.log('✅ Files are generated correctly\n');

    console.log('🧹 Cleaning up test files...');
    fs.unlinkSync(audioPath);
    console.log('✅ Test complete!\n');
  } catch (error: any) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(70));
    console.error(`\nError: ${error.message}`);
    if (error.stack) {
      console.error(`\nStack trace:\n${error.stack}`);
    }
    process.exit(1);
  }
}

testBeatGeneration();
