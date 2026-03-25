import { join } from 'path';
import { db } from './server/db';
import { jobs } from '@shared/schema';
import { sunoApi } from './server/services/suno-api';
import axios from 'axios';

async function generateSingleLofi() {
  console.log('🎵 GENERATING SINGLE LOFI BEAT TEST\n');
  console.log('Testing 30-minute lofi generation with fixed code\n');

  const today = new Date().toISOString().split('T')[0];
  const jobId = `test-lofi-${Date.now()}`;

  try {
    // ============================================
    // PHASE 1: Create Job in Database
    // ============================================
    console.log('📋 PHASE 1: Creating job in database...\n');

    await db.insert(jobs).values({
      id: jobId,
      scriptName: `Test Lofi - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      scriptContent: '',
      mode: 'music',
      status: 'queued',
      aspectRatio: '16:9',
      progress: 0,
      retryCount: 0,
      scheduledUploadTime: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 AM tomorrow
    });

    console.log(`✅ Job created: ${jobId}\n`);

    // ============================================
    // PHASE 2: Generate Music with Suno
    // ============================================
    console.log('🎵 PHASE 2: Generating 30-minute lofi music via kie.ai...\n');

    const lofiStyles = [
      'lofi jazz, 75 BPM, smooth jazz piano, upright bass, brush drums, vinyl warmth, coffee shop ambiance, sunset vibes',
      'lofi hip hop, 80 BPM, dusty piano, warm Rhodes, lo-fi drums, vinyl crackle, rainy day vibes, study atmosphere',
      'lofi chill, 70 BPM, gentle guitar, soft piano, mellow bass, tape hiss, cozy bedroom vibes, relaxation',
    ];

    const selectedStyle = lofiStyles[Math.floor(Math.random() * lofiStyles.length)];

    console.log(`   Style: ${selectedStyle.substring(0, 80)}...`);

    const sunoResult = await sunoApi.generateSong({
      title: `Test Lofi - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      style: selectedStyle,
      instrumental: true,
    });

    console.log(`\n✅ Music generated:`);
    console.log(`   Task ID: ${sunoResult.taskId}`);
    console.log(`   Tracks: ${sunoResult.tracks.length}`);
    console.log(
      `   Track 1 duration: ${sunoResult.tracks[0].duration}s (${(sunoResult.tracks[0].duration / 60).toFixed(1)} min)`,
    );
    console.log(
      `   Track 2 duration: ${sunoResult.tracks[1].duration}s (${(sunoResult.tracks[1].duration / 60).toFixed(1)} min)`,
    );
    console.log(`   Audio URL: ${sunoResult.tracks[0].audioUrl}\n`);

    // Download audio
    const audioPath = `${join(process.cwd(), 'data', 'temp', 'processing')}/test-lofi-${Date.now()}.mp3`;
    const response = await axios.get(sunoResult.tracks[0].audioUrl, {
      responseType: 'arraybuffer',
    });
    const fs = await import('fs');
    fs.writeFileSync(audioPath, response.data);
    console.log(`✅ Audio downloaded: ${audioPath}\n`);

    // ============================================
    // PHASE 3: Update Job with Audio Info
    // ============================================
    console.log('📝 PHASE 3: Updating job with audio info...\n');

    await db
      .update(jobs)
      .set({
        status: 'processing',
        progress: 10,
        audioPath: audioPath,
        metadata: {
          sunoTaskId: sunoResult.taskId,
          duration: sunoResult.tracks[0].duration,
          style: selectedStyle,
        },
      })
      .where(eq(jobs.id, jobId));

    console.log('✅ Job updated, worker will pick it up for video generation\n');

    // ============================================
    // PHASE 4: Monitor Progress
    // ============================================
    console.log('🔄 PHASE 4: Monitoring job progress...\n');

    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds

      const [jobData] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

      const statusIcon =
        jobData.status === 'completed'
          ? '✅'
          : jobData.status === 'processing'
            ? '🔄'
            : jobData.status === 'failed'
              ? '❌'
              : '⏳';

      console.log(`   ${statusIcon} Check ${i + 1}/60: ${jobData.status} (${jobData.progress}%)`);

      if (jobData.status === 'completed') {
        console.log('\n' + '='.repeat(70));
        console.log('✅ JOB COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(70));
        console.log(`\n📹 Video: ${jobData.videoPath}`);
        console.log(`🖼️  Thumbnail: ${jobData.thumbnailPath}`);

        // Verify files exist
        if (jobData.videoPath && fs.existsSync(jobData.videoPath)) {
          const videoSize = (fs.statSync(jobData.videoPath).size / 1024 / 1024).toFixed(1);
          console.log(`✅ Video file exists: ${videoSize}MB`);
        } else {
          console.log('❌ Video file not found!');
        }

        if (jobData.thumbnailPath && fs.existsSync(jobData.thumbnailPath)) {
          const thumbSize = (fs.statSync(jobData.thumbnailPath).size / 1024).toFixed(1);
          console.log(`✅ Thumbnail exists: ${thumbSize}KB`);
        } else {
          console.log('❌ Thumbnail not found!');
        }

        console.log('\n🎉 TEST PASSED - All systems working correctly!\n');
        return;
      }

      if (jobData.status === 'failed') {
        console.log('\n' + '='.repeat(70));
        console.log('❌ JOB FAILED');
        console.log('='.repeat(70));
        console.log(`\nError: ${jobData.error}`);
        throw new Error(`Job failed: ${jobData.error}`);
      }
    }

    console.log('\n⚠️  Timeout: Job did not complete in 5 minutes');
  } catch (error: any) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(70));
    console.error(`\nError: ${error.message}`);
    if (error.stack) {
      console.error(`\nStack:\n${error.stack}`);
    }
    process.exit(1);
  }
}

// Need to import eq
import { eq } from 'drizzle-orm';

generateSingleLofi();
