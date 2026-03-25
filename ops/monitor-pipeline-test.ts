/**
 * Monitor pipeline test jobs with GPU stats
 */
import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { inArray } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const JOB_IDS = [
  '4b7aaa96-3027-4e6d-b74f-a126de81bc8a', // Lofi
  '6efd6c4f-54cc-4472-ba5c-4816282cf522', // Beat 1
  'fb308455-f8e7-4eea-afe0-86bf5cb62786', // Beat 2
  'e4eccd5d-4776-46b4-bc00-3219c3eea2c8', // Beat 3
  '9f679fe4-2664-4740-b16e-29533a7e266c', // Beat 4
  '827c593a-d257-46f5-abb8-0cdde77b75d1', // Beat 5
];

async function monitorJobs() {
  console.log('🔍 Monitoring Pipeline Test Jobs\n');
  console.log('Press Ctrl+C to stop\n');
  console.log('═'.repeat(80));
  console.log('');

  let checkCount = 0;
  const startTime = Date.now();

  while (true) {
    checkCount++;
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    console.log(`\n⏱️  Check #${checkCount} (${elapsed}s elapsed)`);
    console.log('─'.repeat(80));

    // Get job statuses
    const jobStatuses = await db.select().from(jobs).where(inArray(jobs.id, JOB_IDS));

    // Count by status
    const queued = jobStatuses.filter((j) => j.status === 'queued').length;
    const processing = jobStatuses.filter((j) => j.status === 'processing').length;
    const completed = jobStatuses.filter((j) => j.status === 'completed').length;
    const failed = jobStatuses.filter((j) => j.status === 'failed').length;

    console.log(`\n📊 Status: ${queued} queued | ${processing} processing | ${completed} completed | ${failed} failed`);

    // Show individual jobs
    console.log('\n📝 Jobs:');
    jobStatuses.forEach((job, i) => {
      const name = i === 0 ? 'Lofi Mix' : `Beat ${i}`;
      const statusIcon =
        job.status === 'completed' ? '✅' : job.status === 'processing' ? '🔄' : job.status === 'failed' ? '❌' : '⏳';

      console.log(`   ${statusIcon} ${name}: ${job.status} (${job.progress || 0}%)`);
    });

    // GPU stats
    try {
      const gpuResult = await execAsync(
        'nvidia-smi --query-gpu=utilization.gpu,utilization.memory,memory.used,temperature.gpu --format=csv,noheader',
      );
      const [gpuUtil, memUtil, memUsed, temp] = gpuResult.stdout.trim().split(', ');

      console.log(`\n🖥️  GPU: ${gpuUtil} util | ${memUtil} mem | ${memUsed} VRAM | ${temp}°C`);
    } catch (error) {
      console.log('\n🖥️  GPU: Unable to query');
    }

    // FFmpeg processes
    try {
      const psResult = await execAsync('ps aux | grep ffmpeg | grep -v grep | wc -l');
      const ffmpegCount = parseInt(psResult.stdout.trim());

      if (ffmpegCount > 0) {
        // Check for GPU encoding
        try {
          const nvencResult = await execAsync('ps aux | grep ffmpeg | grep -v grep | grep -c "h264_nvenc" || echo 0');
          const nvencCount = parseInt(nvencResult.stdout.trim());

          if (nvencCount > 0) {
            console.log(`🎬 FFmpeg: ${ffmpegCount} processes (${nvencCount} using GPU encoding ✅)`);
          } else {
            console.log(`🎬 FFmpeg: ${ffmpegCount} processes (using CPU encoding)`);
          }
        } catch {
          console.log(`🎬 FFmpeg: ${ffmpegCount} processes`);
        }
      }
    } catch (error) {
      // No FFmpeg processes
    }

    // Check if all done
    if (completed === JOB_IDS.length) {
      const totalTime = Math.round((Date.now() - startTime) / 60000);
      console.log('\n');
      console.log('═'.repeat(80));
      console.log('✅ ALL JOBS COMPLETED!');
      console.log(`⏱️  Total time: ${totalTime} minutes`);
      console.log('═'.repeat(80));
      break;
    }

    if (failed === JOB_IDS.length) {
      console.log('\n❌ All jobs failed. Check logs.');
      break;
    }

    // Wait before next check
    await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds
  }
}

monitorJobs().catch(console.error);
