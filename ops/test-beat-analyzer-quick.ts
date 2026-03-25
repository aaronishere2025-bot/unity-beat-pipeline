#!/usr/bin/env tsx
import { join } from 'path';
/**
 * Quick test of beat analyzer integration
 */

import { musicModeGenerator } from './server/services/music-mode-generator';

async function testBeatAnalyzer() {
  const testFile = join(process.cwd(), 'data', 'temp', 'processing', 'test_beat_1768600901264.mp3');

  console.log('🧪 Testing beat analyzer integration...\n');
  console.log(`File: ${testFile}\n`);

  try {
    // @ts-ignore - accessing private method for testing
    const result = await musicModeGenerator['runBeatAnalyzer'](testFile);

    console.log('\n✅ Beat analyzer SUCCESS!');
    console.log(`   BPM: ${result.bpm}`);
    console.log(`   Key: ${result.key || 'unknown'}`);
    console.log(`   Duration: ${result.duration}s`);
    console.log(`   Segments: ${result.segments.length}`);
    console.log(`   Beats: ${result.beats.length}`);
    console.log(`   Drop points: ${result.dropPoints.length}`);
  } catch (error: any) {
    console.error('\n❌ Beat analyzer FAILED');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
  }
}

testBeatAnalyzer().catch(console.error);
