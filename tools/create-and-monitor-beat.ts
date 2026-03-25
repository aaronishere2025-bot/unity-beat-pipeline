/**
 * Creates a beat job in the database and monitors it
 * The running dev server's job worker will pick it up and process it
 */

async function main() {
  const { initializeSecretsWithFallback } = await import('/home/aaronishere2025/server/secret-manager-loader.js');
  await initializeSecretsWithFallback();

  const { storage } = await import('/home/aaronishere2025/server/storage');

  // First, reset the stuck job from the failed direct-execution test
  try {
    const jobs = await storage.listJobs();
    const stuck = jobs.find(
      (j: any) => j.scriptName === 'Duration Fix E2E Test - 2min Lofi' && j.status === 'processing',
    );
    if (stuck) {
      await storage.updateJob(stuck.id, { status: 'failed', errorMessage: 'Reset: direct execution failed' });
      console.log(`Reset stuck job: ${stuck.id}`);
    }
  } catch (e) {}

  console.log('=== CREATING FULL PIPELINE BEAT JOB ===\n');

  const job = await storage.createJob({
    mode: 'music',
    aspectRatio: '16:9',
    scriptName: 'Duration Fix Full Pipeline Test',
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
      packageId: 'duration-fix-pipeline-test',
      promptCount: 1,
      estimatedCost: 0.2,
    },
  });

  console.log(`Job created: ${job.id}`);
  console.log(`Status: ${job.status}`);
  console.log(`The dev server job worker will pick this up automatically.\n`);

  // Monitor job progress
  console.log('Monitoring progress...\n');
  const startTime = Date.now();
  let lastStatus = '';
  let lastProgress = -1;

  while (true) {
    const current = await storage.getJob(job.id);
    if (!current) {
      console.log('Job not found!');
      break;
    }

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const status = current.status || 'unknown';
    const progress = current.progress || 0;

    // Only log when something changes
    if (status !== lastStatus || progress !== lastProgress) {
      const mins = Math.floor(elapsed / 60);
      const secs = elapsed % 60;
      console.log(
        `[${mins}:${String(secs).padStart(2, '0')}] ${status} ${progress}% ${current.errorMessage ? '- ' + current.errorMessage : ''}`,
      );
      lastStatus = status;
      lastProgress = progress;
    }

    if (status === 'completed') {
      console.log(`\n=== JOB COMPLETED ===`);
      console.log(`Duration: ${current.audioDuration || current.duration || 'unknown'}s`);
      console.log(`Video: ${current.videoPath || current.videoUrl || 'N/A'}`);
      console.log(`Cost: $${current.cost || current.actualCostUsd || 'unknown'}`);
      console.log(`Time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
      console.log(`\n✅ FULL PIPELINE TEST PASSED!`);
      break;
    }

    if (status === 'failed') {
      console.log(`\n=== JOB FAILED ===`);
      console.log(`Error: ${current.errorMessage || 'Unknown'}`);
      console.log(`Progress reached: ${progress}%`);
      console.log(`Time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);
      break;
    }

    // Timeout after 15 minutes
    if (elapsed > 900) {
      console.log('\nTimeout: Job has been running for 15 minutes');
      break;
    }

    await new Promise((r) => setTimeout(r, 5000)); // Poll every 5s
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
