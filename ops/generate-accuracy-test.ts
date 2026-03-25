import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Generate a test video with STRICT historical accuracy validation
 * This will test the 90%+ thresholds for era accuracy, character consistency, and anachronisms
 */

async function generateAccuracyTestVideo() {
  console.log('\n🎬 Generating Test Video with STRICT Accuracy Validation\n');
  console.log('📋 Configuration:');
  console.log('   - Era Accuracy: 90% minimum');
  console.log('   - Character Consistency: 90% minimum');
  console.log('   - Anachronism Score: 95% minimum');
  console.log('   - Max Regeneration Attempts: 3 per clip');
  console.log('   - Reaction Lag: 0.2 seconds\n');

  // Create a challenging historical topic to test validation
  const testScript = `Julius Caesar crosses the Rubicon River with his legion in 49 BC
The Roman general knows this act of war will change history forever
His soldiers march in formation wearing red cloaks and bronze armor
Caesar raises his sword high as they approach the river bank
The die is cast and Rome will never be the same
Legionaries carry their standards with pride into battle`;

  const testPrompts = [
    'Wide cinematic shot of Roman legion marching toward a river at dawn, soldiers in red cloaks and bronze armor, 49 BC',
    'Close-up of Julius Caesar, aged 51, weathered face, Roman military commander, raising gladius sword, determined expression',
    'Medium shot of Roman legionaries in formation, carrying legion standards, bronze helmets, red tunics, leather sandals',
    'Dramatic shot of Caesar at river bank, looking across water, wearing red general cloak, bronze chest plate, 49 BC',
    'Epic wide shot of legion crossing river, splashing through water, standards held high, morning light',
    "Close-up of Caesar's face as decision is made, intense eyes, no modern elements, authentic ancient Rome",
  ];

  try {
    // Create job
    const [newJob] = await db
      .insert(jobs)
      .values({
        mode: 'kling',
        scriptName: 'Caesar Crosses Rubicon - Accuracy Test',
        scriptContent: testScript,
        prompts: testPrompts,
        aspectRatio: '9:16',
        clipDuration: 5,
        autoUpload: false,
        status: 'queued',
      })
      .returning();

    console.log(`✅ Created job: ${newJob.id}`);
    console.log(`\n📊 Job Details:`);
    console.log(`   ID: ${newJob.id}`);
    console.log(`   Mode: ${newJob.mode}`);
    console.log(`   Clips: ${testPrompts.length}`);
    console.log(`   Duration: ${testPrompts.length * 5}s`);
    console.log(`\n🎯 Testing Historical Accuracy Validation:`);
    console.log(`   - Ancient Rome (49 BC)`);
    console.log(`   - Should detect any modern elements`);
    console.log(`   - Will regenerate clips that fail 90%+ thresholds`);
    console.log(`   - Max 3 attempts per clip\n`);

    console.log(`\n📺 Monitor progress:`);
    console.log(`   Watch dashboard at http://localhost:8080/`);
    console.log(`   Or check job status: curl http://localhost:8080/api/jobs/${newJob.id}`);

    console.log(`\n⏳ Job queued. Worker will process automatically...\n`);

    // Monitor job progress
    console.log('🔍 Monitoring job progress (will update every 10 seconds)...\n');

    let lastStatus = '';
    let lastProgress = -1;
    const startTime = Date.now();

    const checkInterval = setInterval(async () => {
      try {
        const [currentJob] = await db.select().from(jobs).where(eq(jobs.id, newJob.id)).limit(1);

        if (!currentJob) {
          console.log('❌ Job not found');
          clearInterval(checkInterval);
          return;
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const statusChanged = currentJob.status !== lastStatus;
        const progressChanged = (currentJob.progress || 0) !== lastProgress;

        if (statusChanged || progressChanged) {
          const progressBar =
            '█'.repeat(Math.floor((currentJob.progress || 0) / 5)) +
            '░'.repeat(20 - Math.floor((currentJob.progress || 0) / 5));

          console.log(`[${elapsed}s] ${progressBar} ${currentJob.progress || 0}% - ${currentJob.status}`);

          if (currentJob.statusMessage) {
            console.log(`       ${currentJob.statusMessage}`);
          }

          // Log validation results if available
          if (currentJob.clipAccuracyData) {
            const accuracyData = currentJob.clipAccuracyData as any;
            if (Array.isArray(accuracyData) && accuracyData.length > 0) {
              const latest = accuracyData[accuracyData.length - 1];
              if (latest.validationResult) {
                console.log(
                  `       🎯 Clip ${latest.clipIndex}: Overall=${latest.validationResult.overallScore}/100, ` +
                    `Era=${latest.validationResult.eraAccuracyScore}/100, ` +
                    `Char=${latest.validationResult.characterConsistencyScore}/100, ` +
                    `Anachronism=${latest.validationResult.anachronismScore}/100`,
                );
                if (!latest.validationResult.passed) {
                  console.log(
                    `       ⚠️ FAILED - Will regenerate (attempt ${latest.validationResult.regenAttempt || 1}/3)`,
                  );
                }
              }
            }
          }

          lastStatus = currentJob.status;
          lastProgress = currentJob.progress || 0;
        }

        if (currentJob.status === 'completed') {
          console.log(`\n✅ Job completed successfully!`);
          console.log(`   Video: ${currentJob.videoUrl || 'N/A'}`);
          console.log(`   Cost: $${currentJob.cost || 'N/A'}`);
          console.log(`   Duration: ${currentJob.duration || 0}s`);

          if (currentJob.clipAccuracyData) {
            console.log(`\n📊 Accuracy Validation Results:`);
            const accuracyData = currentJob.clipAccuracyData as any;
            if (Array.isArray(accuracyData)) {
              accuracyData.forEach((clip: any) => {
                if (clip.validationResult) {
                  const v = clip.validationResult;
                  const passed = v.passed ? '✅' : '❌';
                  console.log(
                    `   ${passed} Clip ${clip.clipIndex}: Overall=${v.overallScore}/100, Era=${v.eraAccuracyScore}/100, Char=${v.characterConsistencyScore}/100, Anachronism=${v.anachronismScore}/100`,
                  );
                  if (v.regenAttempts > 0) {
                    console.log(`      (Regenerated ${v.regenAttempts} times)`);
                  }
                }
              });
            }
          }

          clearInterval(checkInterval);
          process.exit(0);
        }

        if (currentJob.status === 'failed') {
          console.log(`\n❌ Job failed: ${currentJob.errorMessage || 'Unknown error'}`);
          clearInterval(checkInterval);
          process.exit(1);
        }
      } catch (error) {
        console.error('Error checking job:', error);
      }
    }, 10000); // Check every 10 seconds

    // Keep script running
    setTimeout(() => {
      console.log('\n⏱️ Monitoring timeout (10 minutes). Check dashboard for final status.');
      clearInterval(checkInterval);
      process.exit(0);
    }, 600000); // 10 minute timeout
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

generateAccuracyTestVideo();
