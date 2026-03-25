import { join } from 'path';
/**
 * Simple test: Generate ONE looping section to demonstrate GPU encoding
 */
import { loopingSectionService } from './server/services/looping-section-service.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

async function testGPUEncoding() {
  console.log('🎬 GPU Encoding Test\n');
  console.log('This test generates ONE seamless loop and extends it to 30 minutes.');
  console.log('Watch GPU usage with: watch -n 1 nvidia-smi\n');

  try {
    // Create a simple test video if needed
    const testVideoPath = join(process.cwd(), 'data', 'temp', 'processing', 'test-loop-source.mp4');

    if (!fs.existsSync(testVideoPath)) {
      console.log('📹 Creating test source video (5 seconds, solid color)...');
      await execAsync(`
        ffmpeg -y -f lavfi -i color=c=blue:s=1920x1080:d=5 \
          -vf "drawtext=text='GPU Encoding Test':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2" \
          -c:v libx264 -preset ultrafast -pix_fmt yuv420p \
          "${testVideoPath}"
      `);
      console.log('✅ Test video created\n');
    }

    console.log('🚀 Generating 30-minute seamless loop with GPU encoding...');
    console.log('⏱️  Start time:', new Date().toLocaleTimeString());
    console.log();

    const startTime = Date.now();

    const result = await loopingSectionService.generateSeamlessLoop({
      videoPath: testVideoPath,
      targetDurationSec: 30 * 60, // 30 minutes
      outputPath: join(process.cwd(), 'data', 'temp', 'processing', 'gpu-test-output.mp4'),
    });

    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log('\n✅ Success!');
    console.log(`📹 Output: ${result.outputPath}`);
    console.log(`⏱️  Time: ${elapsed} seconds`);
    console.log(`📊 Loops: ${result.metadata?.loopCount || 'N/A'}`);
    console.log(`🎯 Expected: ~60-90 seconds with GPU, ~600-900 seconds with CPU`);

    if (elapsed < 120) {
      console.log('\n🚀 GPU ENCODING CONFIRMED! (very fast)');
    } else if (elapsed < 300) {
      console.log('\n⚡ Likely using GPU (reasonably fast)');
    } else {
      console.log('\n🐌 Slow - might be using CPU fallback');
    }

    // Check file size
    const stats = fs.statSync(result.outputPath);
    const sizeMB = Math.round(stats.size / (1024 * 1024));
    console.log(`📦 File size: ${sizeMB} MB`);
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

testGPUEncoding().catch(console.error);
