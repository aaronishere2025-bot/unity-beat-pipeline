/**
 * Test script to validate NO LYRICS approach for instrumental beats
 */

import axios from 'axios';

const API_URL = 'http://localhost:8080';

async function testNoLyrics() {
  console.log('🧪 Testing NO LYRICS approach for instrumental beats\n');

  try {
    // Generate a 3-minute instrumental beat
    console.log('📋 Creating 3-minute test beat...');
    const response = await axios.post(`${API_URL}/api/beats/generate`, {
      style: 'lofi hip hop, chill beats, relaxed tempo, jazz chords',
      targetDuration: 180, // 3 minutes
      bpm: 85,
      scriptName: 'NO LYRICS TEST - 3min Lofi Beat',
      withVideo: false, // Audio only for faster test
    });

    const jobId = response.data.id;
    console.log(`✅ Job created: ${jobId}\n`);

    // Poll for completion
    console.log('⏳ Waiting for completion...\n');
    let status = 'queued';
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max

    while (status !== 'completed' && status !== 'failed' && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5s between polls

      const statusRes = await axios.get(`${API_URL}/api/jobs/${jobId}`);
      const job = statusRes.data;
      status = job.status;

      console.log(`[${attempts + 1}] Status: ${status} | Progress: ${job.progress || 0}%`);

      if (job.errorMessage) {
        console.log(`   ⚠️  Error: ${job.errorMessage}`);
      }

      attempts++;
    }

    // Final result
    console.log('\n' + '='.repeat(60));
    const finalRes = await axios.get(`${API_URL}/api/jobs/${jobId}`);
    const finalJob = finalRes.data;

    if (finalJob.status === 'completed') {
      console.log('✅ TEST PASSED: Job completed successfully\n');
      console.log(`📊 Results:`);
      console.log(`   Duration: ${finalJob.audioDuration || 'N/A'}s`);
      console.log(`   Audio: ${finalJob.audioUrl || 'N/A'}`);
      console.log(`   Video: ${finalJob.videoUrl || 'N/A'}`);

      // Check if it used NO LYRICS approach
      console.log('\n🔍 Validation:');
      console.log(`   Expected: Empty lyrics prompt`);
      console.log(`   Check server logs for: "[Suno] NO LYRICS MODE: Returning empty prompt"`);
      console.log(`   Check server logs for: "Duration control via style hints only"`);
    } else {
      console.log('❌ TEST FAILED: Job did not complete\n');
      console.log(`   Status: ${finalJob.status}`);
      console.log(`   Error: ${finalJob.errorMessage || 'N/A'}`);
    }

    console.log('='.repeat(60));
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testNoLyrics();
