#!/usr/bin/env tsx
import fetch from 'node-fetch';

const API_URL = 'http://localhost:8080';

async function testStructureTags() {
  console.log('🧪 Testing structure tag approach for 3-minute beat...\n');

  // Create job with structure tags
  const response = await fetch(`${API_URL}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scriptName: 'STRUCTURE TAG TEST - 3min Trap',
      scriptContent: 'target 3:00 length | trap hip hop | 140 BPM | hard 808s, dark melody',
      mode: 'music',
      metadata: {
        withVideo: false,
        isInstrumental: true,
        targetDuration: 180,
      },
    }),
  });

  const job = await response.json();
  console.log(`✅ Job created: ${job.id}`);
  console.log(`   Target: 180s (3:00)`);
  console.log(`   Mode: music (instrumental)`);
  console.log(`   Style: trap hip hop | 140 BPM\n`);

  // Poll for completion
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max

  while (attempts < maxAttempts) {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 5s poll interval
    attempts++;

    const statusRes = await fetch(`${API_URL}/api/jobs/${job.id}`);
    const status = await statusRes.json();

    if (status.status === 'completed') {
      const duration = parseFloat(status.audioDuration || '0');
      const targetDuration = 180;
      const diff = Math.abs(duration - targetDuration);
      const percentOff = ((diff / targetDuration) * 100).toFixed(1);

      console.log('\n✅ JOB COMPLETED!\n');
      console.log('📊 RESULTS:');
      console.log('='.repeat(60));
      console.log(`   Target: ${targetDuration}s (3:00)`);
      console.log(
        `   Actual: ${duration}s (${Math.floor(duration / 60)}:${String(Math.floor(duration % 60)).padStart(2, '0')})`,
      );
      console.log(`   Difference: ${diff.toFixed(1)}s (${percentOff}% off)`);
      console.log('='.repeat(60));

      if (diff < 10) {
        console.log(`   ✅ EXCELLENT - Within 10 seconds!`);
      } else if (diff < 30) {
        console.log(`   ✅ GOOD - Within 30 seconds`);
      } else if (diff < 90) {
        console.log(`   ✅ ACCEPTABLE - Within user tolerance (90s)`);
      } else {
        console.log(`   ❌ FAILED - Outside 90s tolerance`);
        console.log(`   ⚠️  Structure tags may need adjustment`);
      }

      return;
    } else if (status.status === 'failed') {
      console.log(`\n❌ Job failed: ${status.errorMessage || 'Unknown error'}`);
      return;
    }

    process.stdout.write(`\r   Waiting... (${status.progress}% complete, ${attempts * 5}s elapsed)`);
  }

  console.log('\n⏱️  Timeout waiting for job completion');
}

testStructureTags().catch(console.error);
