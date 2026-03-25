#!/usr/bin/env tsx
/**
 * Test 30-Minute Lofi Generation via API
 * Uses the correct format that the system expects
 */

async function test30MinLofi() {
  const apiUrl = 'http://localhost:8080';

  console.log('🎵 Testing 30-Minute Lofi Generation\n');
  console.log('Strategy:');
  console.log('  - scriptContent includes "target 30:00 length"');
  console.log('  - System auto-generates 10 Suno songs (~3 min each)');
  console.log('  - Concatenates them seamlessly');
  console.log('  - Generates 1 purple-shifted lofi Kling clip');
  console.log('  - Loops video 360× to match audio');
  console.log('  ⏱️  Expected: 40-60 minutes total processing\n');
  console.log('================================================================\n');

  try {
    const response = await fetch(`${apiUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'music',
        scriptName: '30-Minute Purple Lofi Study Mix 🎧',
        scriptContent:
          'target 30:00 length | Purple aesthetic lofi hip hop beats for studying | 80-85 BPM | lofi hip hop, chill beats, purple vibes, rain sounds, peaceful study music',
        aspectRatio: '16:9',
        autoUpload: false,
      }),
    });

    const result = await response.json();

    if (result.success) {
      console.log('✅ Job Created Successfully!\n');
      console.log(`   Job ID: ${result.data.id}`);
      console.log(`   Status: ${result.data.status}`);
      console.log(`   Name: ${result.data.scriptName}\n`);
      console.log('📊 What happens next:');
      console.log('   1. Generate 10 Suno songs (3 min each)  ⏱️  10-15 min');
      console.log('   2. Concatenate into 30-min mix          ⏱️  30 sec');
      console.log('   3. Analyze beats with Librosa           ⏱️  10 sec');
      console.log('   4. Generate 1 purple lofi Kling clip   ⏱️  2-5 min');
      console.log('   5. Loop video 360× (30 minutes)        ⏱️  10-20 min');
      console.log('   6. Apply purple hue shifts & effects   ⏱️  10-15 min');
      console.log('   7. Final assembly                       ⏱️  2-3 min\n');
      console.log('🎨 New purple aesthetic features:');
      console.log('   - Purple color-graded visuals (40-60° hue shift)');
      console.log('   - Minimalist calm scenes (rain, windows, simple rooms)');
      console.log('   - Soft purple ambient lighting throughout');
      console.log('   - Less visual noise/complexity\n');
      console.log('📺 Monitor at: http://localhost:8080/jobs\n');
      console.log(`🔗 Direct link: http://localhost:8080/jobs/${result.data.id}\n`);
    } else {
      console.error('❌ Failed:', result.error);
    }
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

test30MinLofi();
