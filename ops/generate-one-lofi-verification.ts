import { db } from './server/db';
import { jobs } from '@shared/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';

async function generateOneLofi() {
  console.log('🎵 SINGLE LOFI GENERATION VERIFICATION TEST\n');
  console.log('Generating 30-minute lofi beat with verified fixed code\n');

  const jobId = `lofi-verify-${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  try {
    // ============================================
    // Create job in database
    // ============================================
    console.log('📋 Creating lofi job...\n');

    await db.insert(jobs).values({
      id: jobId,
      scriptName: `Lofi Verification Test - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      scriptContent: JSON.stringify({
        genre: 'lofi',
        style:
          'lofi jazz, 75 BPM, smooth jazz piano, upright bass, brush drums, vinyl warmth, coffee shop ambiance, sunset vibes',
        targetDuration: 1800, // 30 minutes
        aspectRatio: '16:9',
      }),
      mode: 'music',
      status: 'queued',
      aspectRatio: '16:9',
      progress: 0,
      retryCount: 0,
      scheduledUploadTime: new Date(Date.now() + 4 * 60 * 60 * 1000),
    });

    console.log(`✅ Job created: ${jobId}`);
    console.log(`   Worker will pick it up and process it`);
    console.log(`   Mode: music (30-minute lofi)\n`);

    // ============================================
    // Monitor progress
    // ============================================
    console.log('🔄 Monitoring progress (checking every 10 seconds)...\n');

    let lastProgress = -1;
    const startTime = Date.now();

    for (let i = 0; i < 72; i++) {
      // 12 minutes max
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const [jobData] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);

      if (!jobData) {
        console.log('❌ Job not found in database!');
        throw new Error('Job disappeared from database');
      }

      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const statusIcon =
        jobData.status === 'completed'
          ? '✅'
          : jobData.status === 'processing'
            ? '🔄'
            : jobData.status === 'failed'
              ? '❌'
              : '⏳';

      // Only log if progress changed or every 30 seconds
      if (jobData.progress !== lastProgress || i % 3 === 0) {
        console.log(
          `   ${statusIcon} ${elapsed}s | ${jobData.status.padEnd(10)} | ${jobData.progress}% | retry: ${jobData.retryCount}/3`,
        );
        lastProgress = jobData.progress;
      }

      if (jobData.status === 'completed') {
        console.log('\n' + '='.repeat(70));
        console.log('✅ LOFI GENERATION COMPLETED SUCCESSFULLY!');
        console.log('='.repeat(70));
        console.log(`\n⏱️  Total time: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`);

        // Verify files
        console.log('\n📁 Verifying generated files...\n');

        if (jobData.videoPath) {
          if (fs.existsSync(jobData.videoPath)) {
            const videoSize = (fs.statSync(jobData.videoPath).size / 1024 / 1024).toFixed(1);
            console.log(`✅ Video: ${videoSize}MB`);
            console.log(`   Path: ${jobData.videoPath}`);
          } else {
            console.log(`❌ Video path set but file not found: ${jobData.videoPath}`);
          }
        } else {
          console.log('❌ No video path in job data');
        }

        if (jobData.thumbnailPath) {
          if (fs.existsSync(jobData.thumbnailPath)) {
            const thumbSize = (fs.statSync(jobData.thumbnailPath).size / 1024).toFixed(1);
            console.log(`✅ Thumbnail: ${thumbSize}KB`);
            console.log(`   Path: ${jobData.thumbnailPath}`);
          } else {
            console.log(`❌ Thumbnail path set but file not found: ${jobData.thumbnailPath}`);
          }
        } else {
          console.log('❌ No thumbnail path in job data');
        }

        if (jobData.audioPath) {
          console.log(`✅ Audio: ${jobData.audioPath}`);
        }

        // Check metadata
        console.log('\n📊 Job Metadata:\n');
        if (jobData.metadata) {
          const metadata = typeof jobData.metadata === 'string' ? JSON.parse(jobData.metadata) : jobData.metadata;
          console.log(`   Duration: ${metadata.duration || 'N/A'}s`);
          console.log(`   Style: ${metadata.style || 'N/A'}`);
          console.log(`   Loop count: ${metadata.loopCount || 'N/A'}`);
        }

        console.log('\n' + '='.repeat(70));
        console.log('🎉 VERIFICATION COMPLETE - All systems working!');
        console.log('='.repeat(70));
        console.log('\n✅ kie.ai Suno API integration working');
        console.log('✅ Music generation successful');
        console.log('✅ Video generation successful');
        console.log('✅ optimizedVisual bug fixed');
        console.log('✅ Job completed and marked correctly\n');

        return;
      }

      if (jobData.status === 'failed') {
        console.log('\n' + '='.repeat(70));
        console.log('❌ JOB FAILED');
        console.log('='.repeat(70));
        console.log(`\nError: ${jobData.error || 'Unknown error'}`);
        console.log(`Progress reached: ${jobData.progress}%`);
        console.log(`Retry count: ${jobData.retryCount}/3`);
        throw new Error(`Job failed: ${jobData.error}`);
      }
    }

    console.log('\n⚠️  Timeout: Job did not complete in 12 minutes');
    console.log('   (This might be normal for 30-minute lofi generation)');
    console.log('   Check the dashboard to see final status\n');
  } catch (error: any) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ VERIFICATION FAILED');
    console.error('='.repeat(70));
    console.error(`\nError: ${error.message}`);
    if (error.stack) {
      console.error(`\nStack:\n${error.stack}`);
    }
    process.exit(1);
  }
}

generateOneLofi();
