import axios from 'axios';

async function testLofiPathsFix() {
  console.log('🧪 TESTING LOFI GENERATION WITH PATHS FIX\n');

  // Create a 3-minute lofi beat job
  const jobData = {
    mode: 'music',
    scriptName: 'Test Lofi Paths Fix - Jan 22',
    scriptContent: 'lofi jazz, 75 BPM, piano, upright bass, vinyl warmth, target 3:00 length',
    aspectRatio: '16:9',
    clipDuration: 6,
    autoUpload: false, // Don't upload yet, just verify paths
  };

  console.log('📤 Creating job...');
  const createResponse = await axios.post('http://localhost:8080/api/jobs', jobData);
  const jobId = createResponse.data.id;

  console.log('✅ Job created:', jobId);
  console.log('   Waiting for completion...\n');

  // Poll for completion (max 5 minutes)
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes (5s intervals)

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s

    const statusResponse = await axios.get(`http://localhost:8080/api/jobs/${jobId}`);
    const job = statusResponse.data;

    console.log(
      `[${attempts + 1}/${maxAttempts}] Status: ${job.status} | Progress: ${job.progress}% | ${job.progressMessage || ''}`,
    );

    if (job.status === 'completed') {
      console.log('\n✅ JOB COMPLETED!\n');
      console.log('Results:');
      console.log('  Video Path:', job.videoPath || '❌ MISSING');
      console.log('  Video URL:', job.videoUrl || '❌ MISSING');
      console.log('  Thumbnail Path:', job.thumbnailPath || '❌ MISSING');
      console.log('  Thumbnail URL:', job.thumbnailUrl || '❌ MISSING');
      console.log('  Duration:', job.duration + 's');
      console.log('  Cost: $' + job.cost);

      // Verify files exist
      const fs = await import('fs');
      if (job.videoPath) {
        const videoExists = fs.existsSync(job.videoPath);
        console.log('\n  Video File Exists:', videoExists ? '✅' : '❌');
        if (videoExists) {
          const stats = fs.statSync(job.videoPath);
          console.log('  Video Size:', (stats.size / 1024 / 1024).toFixed(2) + ' MB');
        }
      }

      if (job.thumbnailPath) {
        const thumbExists = fs.existsSync(job.thumbnailPath);
        console.log('  Thumbnail File Exists:', thumbExists ? '✅' : '❌');
      }

      // Final verdict
      if (job.videoPath && job.thumbnailPath) {
        console.log('\n🎉 SUCCESS! Paths are now being saved correctly!\n');
        process.exit(0);
      } else {
        console.log('\n❌ FAILED! Paths still not being saved.\n');
        process.exit(1);
      }
    } else if (job.status === 'failed') {
      console.log('\n❌ JOB FAILED!\n');
      console.log('Error:', job.error);
      process.exit(1);
    }

    attempts++;
  }

  console.log('\n⏱️  Timeout waiting for job completion');
  process.exit(1);
}

testLofiPathsFix();
