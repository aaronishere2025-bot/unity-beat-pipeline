#!/usr/bin/env tsx
/**
 * Test 30-Minute Generation with FIXED Suno Timeout
 *
 * Previous job failed at 97% due to 5-minute timeout
 * New timeout: 10 minutes for multi-song generation
 */

async function test30MinFixed() {
  const apiUrl = 'http://localhost:8080';

  console.log('🎵 Testing 30-Minute Generation with FIXED Timeout\n');
  console.log('Previous issue: Job failed at 97% - "Suno timeout after 5 minutes"');
  console.log('Fix applied: 10-minute timeout for multi-song (songCount > 1)\n');

  const jobPayload = {
    scriptName: '30-Minute Purple Lofi Study Mix 🎧 [FIXED]',
    scriptContent:
      'target 30:00 length | Purple aesthetic lofi hip hop beats for studying | 80-85 BPM | lofi hip hop, chill beats, purple vibes, rain sounds, peaceful study music',
    mode: 'music',
    aspectRatio: '16:9',
  };

  console.log('📋 Creating job with:');
  console.log('  Name:', jobPayload.scriptName);
  console.log('  Target: 30 minutes (10 songs @ 3 min each)');
  console.log('  Mode: music');
  console.log('  Aspect Ratio: 16:9 (horizontal)');
  console.log('  Timeout per song: 10 minutes (was 5 minutes)\n');

  try {
    const response = await fetch(`${apiUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jobPayload),
    });

    const result = await response.json();

    if (!result.success) {
      console.error('❌ Failed to create job:', result.error);
      process.exit(1);
    }

    const job = result.data;

    console.log('✅ Job created successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 JOB DETAILS');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('  ID:', job.id);
    console.log('  Name:', job.scriptName);
    console.log('  Status:', job.status);
    console.log('  Progress:', job.progress + '%');
    console.log('  Mode:', job.mode);
    console.log('  Aspect Ratio:', job.aspectRatio);
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎯 EXPECTED BEHAVIOR');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('  ⏱️  Each song: 10-minute timeout (was 5 minutes)');
    console.log('  🎵 Total songs: 10 (for 30 minutes)');
    console.log('  ✅ Should complete: Even if songs take 6-9 minutes');
    console.log('  📊 Progress: 0% → 97% → 100% (no failure at 97%)');
    console.log();
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📺 MONITORING');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('  Dashboard:', `${apiUrl}/jobs`);
    console.log('  API Status:', `${apiUrl}/api/jobs/${job.id}`);
    console.log();
    console.log('  Watch logs:');
    console.log('    tail -f /tmp/server-lofi-purple.log | grep "' + job.id.substring(0, 8) + '\\|Timeout"');
    console.log();
    console.log('  Expected log messages:');
    console.log('    ⏱️  Timeout: 10 minutes (song X/10)');
    console.log('    ✅ Audio generated: [...] (180s)');
    console.log('    ✅ Song X downloaded: X.XXMB');
    console.log();
    console.log('═══════════════════════════════════════════════════════════\n');

    // Poll for completion
    console.log('🔄 Monitoring job progress (updates every 10 seconds)...\n');

    let completed = false;
    let lastProgress = 0;

    while (!completed) {
      await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds

      const statusResponse = await fetch(`${apiUrl}/api/jobs/${job.id}`);
      const statusResult = await statusResponse.json();

      if (!statusResult.success) {
        console.error('❌ Failed to check status');
        break;
      }

      const currentJob = statusResult.data;
      const progress = currentJob.progress || 0;

      if (progress !== lastProgress) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`  [${timestamp}] Progress: ${progress}% | Status: ${currentJob.status}`);
        lastProgress = progress;
      }

      if (currentJob.status === 'completed') {
        console.log('\n✅ SUCCESS! Job completed successfully!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('  Video URL:', currentJob.videoUrl || 'Processing...');
        console.log('  Duration:', currentJob.duration || 'Unknown');
        console.log('  Cost:', currentJob.cost ? `$${currentJob.cost}` : 'Calculating...');
        console.log('═══════════════════════════════════════════════════════════\n');
        console.log('🎉 Fix verified! 30-minute generation works with 10-minute timeout!\n');
        completed = true;
      } else if (currentJob.status === 'failed') {
        console.log('\n❌ FAILED! Job failed with error:');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(currentJob.error || 'No error message');
        console.log('═══════════════════════════════════════════════════════════\n');

        if (currentJob.error?.includes('timeout')) {
          console.log('⚠️  Still timing out! Possible issues:');
          console.log('  - Suno API experiencing delays > 10 minutes');
          console.log('  - Consider increasing timeout further (15 minutes)');
          console.log('  - Check Suno API status');
        }

        process.exit(1);
      }
    }
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
test30MinFixed().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
