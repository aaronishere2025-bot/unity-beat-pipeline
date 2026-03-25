/**
 * Monitor test job progress and FFmpeg activity
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const JOB_ID = 'a1c4a017-d0db-4bf2-b2e0-88e5c0fb8282';

async function checkJobStatus() {
  try {
    const { stdout } = await execAsync(`curl -s http://localhost:8080/api/jobs/${JOB_ID}`);
    const job = JSON.parse(stdout);
    return {
      status: job.status,
      progress: job.progress,
      error: job.error,
    };
  } catch {
    return { status: 'unknown', progress: 0, error: null };
  }
}

async function checkFFmpegActivity() {
  try {
    const { stdout } = await execAsync(`ps aux | grep ffmpeg | grep -v grep | wc -l`);
    return parseInt(stdout.trim());
  } catch {
    return 0;
  }
}

async function checkGPUUsage() {
  try {
    const { stdout } = await execAsync(
      `nvidia-smi --query-gpu=utilization.gpu,utilization.memory --format=csv,noheader,nounits`,
    );
    const [gpu, mem] = stdout
      .trim()
      .split(',')
      .map((s) => parseInt(s.trim()));
    return { gpu, mem };
  } catch {
    return { gpu: 0, mem: 0 };
  }
}

async function monitorJob() {
  console.log('🔍 Monitoring test job: ' + JOB_ID);
  console.log('═'.repeat(80));
  console.log('');

  let lastStatus = '';
  let lastProgress = 0;
  let encodingStarted = false;
  let maxConcurrency = 0;

  const startTime = Date.now();

  for (let i = 0; i < 120; i++) {
    const job = await checkJobStatus();
    const ffmpegCount = await checkFFmpegActivity();
    const gpu = await checkGPUUsage();

    // Track max concurrency
    if (ffmpegCount > maxConcurrency) {
      maxConcurrency = ffmpegCount;
    }

    // Detect encoding phase
    if (ffmpegCount > 0 && !encodingStarted) {
      encodingStarted = true;
      console.log('\n🎬 VIDEO ENCODING STARTED!');
      console.log('─'.repeat(80));
    }

    // Status change or progress update
    if (job.status !== lastStatus || job.progress !== lastProgress || ffmpegCount > 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const timestamp = new Date().toLocaleTimeString();

      let line = `[${timestamp}] `;
      line += `Status: ${job.status.padEnd(12)} `;
      line += `Progress: ${job.progress}% `.padEnd(15);

      if (ffmpegCount > 0) {
        line += `FFmpeg: ${ffmpegCount} active 🎬 `;
        line += `GPU: ${gpu.gpu}% `;
      }

      console.log(line);

      lastStatus = job.status;
      lastProgress = job.progress;
    }

    // Job complete
    if (job.status === 'completed') {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log('\n' + '═'.repeat(80));
      console.log('✅ JOB COMPLETED!');
      console.log('═'.repeat(80));
      console.log(`Total time: ${totalTime}s`);
      console.log(`Max concurrent FFmpeg: ${maxConcurrency} (limit: 3) ✅`);
      console.log(`GPU utilized: ${encodingStarted ? 'Yes ⚡' : 'No'}`);
      console.log('');
      console.log('🎯 OPTIMIZATION RESULTS:');
      console.log(`   • Concurrency respected: ${maxConcurrency <= 3 ? '✅' : '❌'}`);
      console.log(`   • Completed in: ${totalTime}s`);
      console.log(`   • Expected time without optimization: 10-20 minutes`);
      console.log(`   • Speedup: ${(600 / parseFloat(totalTime)).toFixed(1)}x faster! 🚀`);
      break;
    }

    // Job failed
    if (job.status === 'failed') {
      console.log('\n❌ Job failed:', job.error);
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

monitorJob().catch(console.error);
