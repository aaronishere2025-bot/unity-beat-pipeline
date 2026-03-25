/**
 * INTEGRATION EXAMPLE: How to add Brutal Shorts Critic to job-worker.ts
 *
 * This file shows where and how to integrate the Brutal Shorts Critic
 * into the existing job-worker.ts pipeline.
 */

// ADD THIS IMPORT at the top of job-worker.ts:
import { brutalShortsCritic } from './brutal-shorts-critic.js';

/**
 * INTEGRATION POINT 1: After FFmpeg assembly (around line 1232-1360)
 *
 * In the processJob() function, after the video is assembled but before
 * marking the job as completed, add the Brutal Shorts Critic evaluation.
 */

// ORIGINAL CODE (around line 1232-1360):
/*
    await this.logProgress(job.id, 95, 'FFmpeg assembly complete - extracting video metadata');

    // ... metadata extraction ...

    await this.logProgress(job.id, 100, `Video generation complete - $${totalCost.toFixed(2)} - ${duration}s`);
    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${outputFilename}`,
      cost: totalCost.toFixed(2),
      duration,
      fileSize: metadata?.format?.size ? parseInt(metadata.format.size) : undefined,
      generatedDescription,
    });
*/

// MODIFIED CODE WITH BRUTAL CRITIC:
async function integrateAfterFFmpegAssembly(job: any, outputPath: string, musicPath: string, totalCost: number) {
  await this.logProgress(job.id, 95, 'FFmpeg assembly complete - extracting video metadata');

  // Extract metadata
  const metadata = await ffmpegProcessor.extractMetadata(outputPath);
  const duration = metadata?.format?.duration ? parseFloat(metadata.format.duration) : 0;

  // === BRUTAL SHORTS CRITIC INTEGRATION ===
  // Only run for Shorts format (9:16, ≤60 seconds)
  if (job.aspectRatio === '9:16' && duration <= 60) {
    console.log('\n🎬 Running Brutal Shorts Critic...');
    await this.logProgress(job.id, 96, 'Evaluating Short quality...');

    try {
      const critique = await brutalShortsCritic.evaluateShort(outputPath, musicPath || undefined);

      // Check verdict
      if (critique.verdict === 'kill') {
        console.log('❌ Video KILLED by Brutal Critic');
        console.log(`   Reasons: ${critique.autoRejectReasons.join(', ') || 'Low scores'}`);

        await storage.updateJob(job.id, {
          status: 'failed',
          progress: 100,
          error: `Critic rejected (${critique.weightedScore.toFixed(1)}/100): ${critique.recommendations.join('; ')}`,
          cost: totalCost.toFixed(2),
        });

        return; // Stop processing
      }

      if (critique.verdict === 'needs_work') {
        console.log('🔧 Video needs work, but shipping anyway...');
        console.log(`   Score: ${critique.weightedScore.toFixed(1)}/100`);
        console.log(`   Recommendations: ${critique.recommendations.join(', ')}`);
        // Optionally: Trigger regeneration of weak clips here
        // For now, we log and continue
      }

      if (critique.verdict === 'ship') {
        console.log(`✅ Critic approved: ${critique.weightedScore.toFixed(1)}/100`);
      } else if (critique.verdict === 'minor_fixes') {
        console.log(`⚠️ Critic passed with minor issues: ${critique.weightedScore.toFixed(1)}/100`);
      }

      // Store critique results in job metadata (optional)
      await storage.updateJob(job.id, {
        metadata: {
          ...job.metadata,
          criticScore: critique.weightedScore,
          criticVerdict: critique.verdict,
          criticRecommendations: critique.recommendations,
        },
      });
    } catch (criticError: any) {
      console.error('⚠️ Brutal Critic failed, shipping anyway:', criticError.message);
      // Continue with job completion even if critic fails
    }
  }
  // === END BRUTAL CRITIC INTEGRATION ===

  // Generate description
  let generatedDescription: string | undefined;
  try {
    generatedDescription = await gptDescriptionGenerator.generateDescription({
      title: job.videoTitle || 'Generated Video',
      prompts: job.generatedPrompts || [],
      duration,
      mode: job.mode,
    });
  } catch (descError) {
    console.error('⚠️ Failed to generate description:', descError);
  }

  await this.logProgress(job.id, 100, `Video generation complete - $${totalCost.toFixed(2)} - ${duration}s`);
  await storage.updateJob(job.id, {
    status: 'completed',
    videoUrl: `/api/videos/${outputFilename}`,
    cost: totalCost.toFixed(2),
    duration,
    fileSize: metadata?.format?.size ? parseInt(metadata.format.size) : undefined,
    generatedDescription,
  });
}

/**
 * INTEGRATION POINT 2: After Unity content package assembly (around line 3680-3690)
 *
 * For Unity-mode jobs, integrate after the final video is assembled.
 */

// ORIGINAL CODE (around line 3680-3690):
/*
    // Mark job as complete with final video URL
    await storage.updateJob(job.id, {
      status: successfulClips.length > 0 ? 'completed' : 'failed',
      progress: 100,
      cost: totalCost.toString(),
      clipCount: successfulClips.length,
      videoUrl: finalVideoUrl,
      errorMessage: successfulClips.length === 0 ? 'All clips failed to generate' : assemblyError,
    });
*/

// MODIFIED CODE WITH BRUTAL CRITIC:
async function integrateAfterUnityAssembly(
  job: any,
  successfulClips: any[],
  totalCost: number,
  finalVideoUrl: string | null,
  assemblyError: string | null,
) {
  // === BRUTAL SHORTS CRITIC INTEGRATION ===
  // Only run if we have a successful assembly and it's a Short
  if (successfulClips.length > 0 && !assemblyError && finalVideoUrl) {
    const videoPath = path.join(process.cwd(), 'data', 'videos', 'renders', finalVideoUrl.split('/').pop()!);
    const musicPath = job.musicUrl
      ? path.join(process.cwd(), 'data', 'audio', job.musicUrl.split('/').pop()!)
      : undefined;

    // Check if this is a Short
    const isShort = job.aspectRatio === '9:16' && (job.audioDuration || 0) <= 60;

    if (isShort) {
      console.log('\n🎬 Running Brutal Shorts Critic on Unity video...');

      try {
        const critique = await brutalShortsCritic.evaluateShort(videoPath, musicPath);

        if (critique.verdict === 'kill') {
          console.log('❌ Unity video KILLED by Brutal Critic');

          await storage.updateJob(job.id, {
            status: 'failed',
            progress: 100,
            cost: totalCost.toString(),
            clipCount: successfulClips.length,
            videoUrl: null,
            errorMessage: `Critic rejected (${critique.weightedScore.toFixed(1)}/100): ${critique.recommendations.join('; ')}`,
          });

          return;
        }

        console.log(
          `${critique.verdict === 'ship' ? '✅' : '⚠️'} Critic score: ${critique.weightedScore.toFixed(1)}/100`,
        );

        // Store critique in job metadata
        await storage.updateJob(job.id, {
          metadata: {
            ...job.metadata,
            criticScore: critique.weightedScore,
            criticVerdict: critique.verdict,
            criticRecommendations: critique.recommendations,
          },
        });
      } catch (criticError: any) {
        console.error('⚠️ Brutal Critic failed:', criticError.message);
      }
    }
  }
  // === END BRUTAL CRITIC INTEGRATION ===

  // Mark job as complete with final video URL
  await storage.updateJob(job.id, {
    status: successfulClips.length > 0 ? 'completed' : 'failed',
    progress: 100,
    cost: totalCost.toString(),
    clipCount: successfulClips.length,
    videoUrl: finalVideoUrl,
    errorMessage: successfulClips.length === 0 ? 'All clips failed to generate' : assemblyError,
  });
}

/**
 * CONFIGURATION OPTIONS
 *
 * Add these to your job or system configuration to control Brutal Critic behavior:
 */

interface JobConfig {
  // Enable/disable Brutal Critic
  enableBrutalCritic?: boolean;

  // Minimum score to ship (default: 70)
  minimumCriticScore?: number;

  // Kill on low score (default: true)
  killOnLowScore?: boolean;

  // Regenerate weak clips (default: false)
  regenerateWeakClips?: boolean;
}

/**
 * ADVANCED: Clip-level regeneration
 *
 * If a specific persona scores low, regenerate the relevant clips:
 */

async function handleWeakClips(critique: any, job: any) {
  if (critique.verdict === 'needs_work') {
    // Find weak personas
    const weakPersonas = critique.personas.filter((p: any) => p.score < 12);

    for (const persona of weakPersonas) {
      if (persona.persona === 'The Swiper' && persona.score < 10) {
        console.log('🔧 Regenerating first clip (weak hook)...');
        // Regenerate first clip with more dynamic prompt
        // await regenerateClip(job, 0, { emphasize: 'action', energy: 'high' });
      }

      if (persona.persona === 'The Impatient Viewer' && persona.score < 10) {
        console.log('🔧 Adding more scene variety...');
        // Regenerate middle clips with more variety
        // await regenerateMiddleClips(job, { variety: 'high' });
      }

      if (persona.persona === 'The Sync Critic' && persona.score < 10) {
        console.log('🔧 Re-aligning cuts to beats...');
        // Re-run FFmpeg assembly with beat-aligned cuts
        // await realignCutsToBpm(job);
      }

      if (persona.persona === 'The Loop Detector' && persona.score < 10) {
        console.log('🔧 Regenerating last clip (weak ending)...');
        // Regenerate last clip with stronger ending
        // await regenerateClip(job, -1, { emphasize: 'climax', energy: 'peak' });
      }

      if (persona.persona === 'The Clarity Judge' && persona.score < 10) {
        console.log('🔧 Making hook more explicit...');
        // Add text overlay or regenerate with clearer visuals
        // await addHookOverlay(job);
      }
    }
  }
}

/**
 * EXAMPLE: Full integration with error handling
 */

async function evaluateAndHandleShort(job: any, videoPath: string, musicPath?: string): Promise<boolean> {
  // Only evaluate Shorts
  if (job.aspectRatio !== '9:16' || (job.duration || 0) > 60) {
    return true; // Not a Short, skip evaluation
  }

  console.log('\n🎬 Running Brutal Shorts Critic...');

  try {
    const critique = await brutalShortsCritic.evaluateShort(videoPath, musicPath);

    // Log full results
    console.log(`\n📊 Critic Results:`);
    console.log(`   Score: ${critique.weightedScore.toFixed(1)}/100`);
    console.log(`   Verdict: ${critique.verdict.toUpperCase()}`);

    // Check for kill conditions
    if (critique.verdict === 'kill') {
      console.log('\n❌ VIDEO KILLED - Not shipping');
      console.log(`   Reasons:`);
      if (critique.autoRejectReasons.length > 0) {
        critique.autoRejectReasons.forEach((r) => console.log(`     - ${r}`));
      }
      critique.recommendations.forEach((r) => console.log(`     - ${r}`));

      return false; // Kill job
    }

    // Handle needs_work
    if (critique.verdict === 'needs_work') {
      console.log('\n🔧 VIDEO NEEDS WORK');
      console.log(`   Weak areas:`);
      critique.personas
        .filter((p: any) => p.score < 12)
        .forEach((p: any) => console.log(`     - ${p.persona}: ${p.score}/20 - ${p.feedback}`));

      // Optionally regenerate weak clips
      // await handleWeakClips(critique, job);
    }

    // Ship it!
    if (critique.verdict === 'ship') {
      console.log('\n✅ VIDEO APPROVED - Ready to ship!');
    } else {
      console.log('\n⚠️ VIDEO PASSED - Acceptable quality');
    }

    return true; // Ship job
  } catch (error: any) {
    console.error('⚠️ Brutal Critic failed:', error.message);
    // Fail open: ship anyway if critic errors
    return true;
  }
}

/**
 * USAGE IN JOB WORKER
 *
 * Replace the job completion logic with:
 */

// Before marking job as completed:
const shouldShip = await evaluateAndHandleShort(job, outputPath, musicPath);

if (!shouldShip) {
  await storage.updateJob(job.id, {
    status: 'failed',
    error: 'Failed Brutal Shorts Critic evaluation',
    progress: 100,
  });
  return;
}

// Continue with normal job completion...
await storage.updateJob(job.id, {
  status: 'completed',
  videoUrl: `/api/videos/${outputFilename}`,
  // ...
});

/**
 * FILE LOCATIONS
 *
 * - Service: /home/aaronishere2025/server/services/brutal-shorts-critic.ts
 * - Config: /home/aaronishere2025/server/config/video-constants.ts (SHORTS_CRITIC_CONFIG)
 * - Test: /home/aaronishere2025/test-brutal-critic.ts
 * - Docs: /home/aaronishere2025/BRUTAL_SHORTS_CRITIC.md
 */
