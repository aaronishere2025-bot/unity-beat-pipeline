/**
 * Full pipeline test: Creates a single 2-min lofi beat job and monitors it
 * Tests the entire pipeline: Suno → Audio Analysis → Kling Video → FFmpeg Assembly
 * Expected cost: ~$0.20 ($0.10 Suno + $0.10 Kling single clip)
 */

async function main() {
  const { initializeSecretsWithFallback } = await import('/home/aaronishere2025/server/secret-manager-loader.js');
  await initializeSecretsWithFallback();

  const { storage } = await import('/home/aaronishere2025/server/storage');

  console.log('=== FULL BEAT GENERATION PIPELINE TEST ===\n');

  // Create the job
  const job = await storage.createJob({
    mode: 'music',
    aspectRatio: '16:9',
    scriptName: 'Duration Fix E2E Test - 2min Lofi',
    scriptContent:
      'target 2:00 length | lofi chill beats | 85 BPM | warm vinyl crackle, mellow piano, nostalgic atmosphere',
    audioDuration: '120',
    status: 'queued',
    autoUpload: false,
    metadata: {
      isInstrumental: true,
      singleClip: true,
      targetDuration: 120,
    },
    unityMetadata: {
      customVisualPrompt:
        'Cozy rainy window scene, soft warm light, coffee cup steam rising, lo-fi aesthetic, peaceful night atmosphere',
      packageId: 'duration-fix-e2e-test',
      promptCount: 1,
      estimatedCost: 0.2,
    },
  });

  console.log(`Job created: ${job.id}`);
  console.log(`Status: ${job.status}`);
  console.log(`Mode: music | Duration target: 120s | Single clip: yes\n`);

  // Now process the job directly through the job worker
  const { jobWorker } = await import('/home/aaronishere2025/server/services/job-worker');

  console.log('Starting job worker processing...\n');
  console.log('─'.repeat(60));

  const startTime = Date.now();

  try {
    await jobWorker.processJob(job.id);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

    // Check final status
    const finalJob = await storage.getJob(job.id);

    console.log('\n' + '─'.repeat(60));
    console.log('\n=== RESULTS ===\n');
    console.log(`Status: ${finalJob?.status}`);
    console.log(`Duration: ${finalJob?.duration || finalJob?.audioDuration || 'unknown'}s`);
    console.log(`Video: ${finalJob?.videoPath || finalJob?.videoUrl || 'N/A'}`);
    console.log(`Thumbnail: ${finalJob?.thumbnailPath || finalJob?.thumbnailUrl || 'N/A'}`);
    console.log(`Cost: $${finalJob?.cost || finalJob?.actualCostUsd || 'unknown'}`);
    console.log(`Time: ${elapsed}s`);
    console.log(`Error: ${finalJob?.errorMessage || 'None'}`);

    if (finalJob?.status === 'completed') {
      console.log('\n✅ FULL PIPELINE TEST PASSED!');
    } else {
      console.log(`\n❌ Job ended with status: ${finalJob?.status}`);
      if (finalJob?.errorMessage) {
        console.log(`Error: ${finalJob.errorMessage}`);
      }
    }
  } catch (err: any) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log('\n' + '─'.repeat(60));
    console.log(`\n❌ Pipeline failed after ${elapsed}s: ${err.message}`);

    // Check job status for more details
    const finalJob = await storage.getJob(job.id);
    if (finalJob?.errorMessage) {
      console.log(`Job error: ${finalJob.errorMessage}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
