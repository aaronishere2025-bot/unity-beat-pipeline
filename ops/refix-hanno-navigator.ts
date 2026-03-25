/**
 * RE-FIX: Hanno the Navigator Video (Job 935875dc, Package d22ad4eb)
 *
 * This script:
 * 1. Generates lyrics for the existing package using generateViralLyrics (with model fallback)
 * 2. Stores lyrics in package data
 * 3. Generates music via Suno
 * 4. Re-assembles the 26 existing clips with the new audio track
 * 5. Runs QA on the result
 *
 * The 26 Kling clips are already generated and on disk - no need to regenerate ($2.60 saved).
 */

import { db } from './server/db';
import { jobs, unityContentPackages } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from './server/storage';
import { generateViralLyrics } from './server/services/viral-lyrics-engine';
import { sunoApi, trimLyricsForDuration } from './server/services/suno-api';
import { sunoTaskService } from './server/services/suno-task-service';
import { ffmpegProcessor } from './server/services/ffmpeg-processor';
import { videoQAService } from './server/services/video-qa-service';
import { existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const JOB_ID = '935875dc';
const PACKAGE_ID = 'd22ad4eb';

async function main() {
  console.log('='.repeat(60));
  console.log('RE-FIX: Hanno the Navigator Silent Video');
  console.log('='.repeat(60));

  // Load secrets
  try {
    const { initializeSecretsWithFallback } = await import('./server/secret-manager-loader.js');
    await initializeSecretsWithFallback();
    console.log('Secrets loaded');
  } catch {
    console.log('Using .env fallback for secrets');
    const dotenv = await import('dotenv');
    dotenv.config();
  }

  // Step 1: Load existing package and job
  console.log('\n--- Step 1: Loading existing package ---');

  const [job] = await db.select().from(jobs).where(eq(jobs.id, JOB_ID)).limit(1);
  if (!job) {
    console.error(`Job ${JOB_ID} not found!`);
    // Try to find partial match
    const allJobs = await db.select().from(jobs).limit(100);
    const match = allJobs.find((j) => j.id.startsWith(JOB_ID));
    if (match) {
      console.log(`Found partial match: ${match.id} - ${match.scriptName}`);
    }
    process.exit(1);
  }

  const pkg = await storage.getUnityContentPackage(PACKAGE_ID);
  if (!pkg) {
    console.error(`Package ${PACKAGE_ID} not found!`);
    // Try partial match
    const allPkgs = await db.select().from(unityContentPackages).limit(100);
    const match = allPkgs.find((p) => p.id.startsWith(PACKAGE_ID));
    if (match) {
      console.log(`Found partial match: ${match.id} - ${match.title}`);
    }
    process.exit(1);
  }

  const packageData = pkg.packageData as any;
  console.log(`Job: ${job.id} - ${job.scriptName}`);
  console.log(`Package: ${pkg.id} - ${pkg.title}`);
  console.log(`Status: ${job.status}`);
  console.log(`Lyrics: ${packageData.lyrics?.raw ? 'YES' : 'NO'}`);
  console.log(`Audio: ${pkg.audioFilePath || 'NONE'}`);
  console.log(`VEO prompts: ${packageData.veoPrompts?.length || 0}`);

  // Find existing clips
  const generatedClips = packageData.generatedClips || [];
  const successfulClips = generatedClips.filter((c: any) => c.status === 'completed' && c.videoUrl);
  console.log(`Existing clips: ${successfulClips.length} completed`);

  if (successfulClips.length === 0) {
    console.error('No existing clips found - cannot re-assemble');
    process.exit(1);
  }

  // Step 2: Generate lyrics (with fallback)
  console.log('\n--- Step 2: Generating lyrics ---');
  let lyrics = packageData.lyrics?.raw;

  if (!lyrics) {
    console.log('No lyrics in package, generating...');

    const figure = pkg.title?.replace(/ - .*$/, '') || 'Hanno the Navigator';
    const era = 'Ancient Carthage (~500 BC)';

    try {
      const lyricsResult = await generateViralLyrics(
        figure,
        era,
        'explorer',
        [
          'Carthaginian explorer who sailed west coast of Africa',
          'Founded colonies along the African coast',
          'Encountered gorillas which he described as "savage people"',
          'His voyage account (Periplus) survives in Greek translation',
        ],
        'triumphant',
      );
      lyrics = lyricsResult.lyrics;
      console.log(`Lyrics generated via Gemini (${lyrics.length} chars)`);
    } catch (geminiErr: any) {
      console.warn(`Gemini failed: ${geminiErr.message}`);

      // Fallback to OpenAI
      try {
        const OpenAI = (await import('openai')).default;
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: `Write viral rap lyrics about Hanno the Navigator, the Carthaginian explorer (~500 BC).
Facts: Sailed west coast of Africa, founded colonies, encountered gorillas, Periplus survives in Greek.
Style: First person, short bars (6-10 words), ~120-140 words, triumphant tone.
Output JSON: { "lyrics": "...", "sunoTags": "..." }`,
            },
          ],
          response_format: { type: 'json_object' },
        });
        const result = JSON.parse(response.choices[0].message.content || '{}');
        lyrics = result.lyrics;
        console.log(`Lyrics generated via OpenAI fallback (${lyrics?.length} chars)`);
      } catch (openaiErr: any) {
        console.error(`OpenAI fallback also failed: ${openaiErr.message}`);
        process.exit(1);
      }
    }

    if (!lyrics) {
      console.error('Failed to generate lyrics from any model');
      process.exit(1);
    }

    // Store lyrics in package
    packageData.lyrics = { raw: lyrics };
    await storage.updateUnityContentPackage(pkg.id, {
      packageData: packageData,
    });
    console.log('Lyrics stored in package');
  } else {
    console.log(`Lyrics already present (${lyrics.length} chars)`);
  }

  // Step 3: Generate music via Suno
  console.log('\n--- Step 3: Generating music via Suno ---');

  if (pkg.audioFilePath && existsSync(pkg.audioFilePath)) {
    console.log(`Audio already exists: ${pkg.audioFilePath}`);
  } else {
    console.log('No audio file, generating via Suno...');

    if (!sunoApi.isConfigured()) {
      console.error('Suno API not configured - check SUNO_API_KEY');
      process.exit(1);
    }

    const trimResult = trimLyricsForDuration(lyrics, 180);
    const trimmedLyrics = trimResult.lyrics;
    console.log(
      `Lyrics trimmed: ${lyrics.length} -> ${trimmedLyrics.length} chars (est: ${trimResult.estimatedDuration}s)`,
    );

    const title = (pkg.title || 'Hanno the Navigator').substring(0, 77);
    const styleTags = 'epic trap, aggressive male rap vocals, orchestral, cinematic';

    try {
      const sunoResult = await sunoApi.generateSong({
        lyrics: trimmedLyrics,
        style: styleTags,
        title: title,
        model: 'V5',
        targetDuration: 120,
      });

      console.log(`Suno task created: ${sunoResult.taskId}`);

      // Create tracking record
      await sunoTaskService.createTask({
        taskId: sunoResult.taskId,
        packageId: pkg.id,
        lyrics: trimmedLyrics,
        style: styleTags,
      });

      // Wait for completion
      console.log('Waiting for Suno music generation...');
      const completedTask = await sunoTaskService.pollTask(sunoResult.taskId);

      if (completedTask?.status === 'completed' && completedTask.audioFilePath) {
        console.log(`Music generated: ${completedTask.audioFilePath} (${completedTask.duration}s)`);

        // Update package
        await storage.updateUnityContentPackage(pkg.id, {
          audioFilePath: completedTask.audioFilePath,
          packageData: {
            ...packageData,
            audioAnalysis: completedTask.audioAnalysis,
            acousticFingerprint: completedTask.acousticFingerprint,
          },
        });

        // Update job
        const musicUrl = `/api/suno-audio/${basename(completedTask.audioFilePath)}`;
        await db
          .update(jobs)
          .set({
            musicUrl: musicUrl,
            audioDuration: completedTask.duration?.toString() || null,
          })
          .where(eq(jobs.id, job.id));

        console.log('Package and job updated with audio');
      } else {
        console.error('Suno generation failed or timed out');
        console.error('Status:', completedTask?.status, 'Error:', completedTask?.errorMessage);
        process.exit(1);
      }
    } catch (sunoErr: any) {
      console.error(`Suno error: ${sunoErr.message}`);
      process.exit(1);
    }
  }

  // Step 4: Re-assemble clips with audio
  console.log('\n--- Step 4: Re-assembling clips with audio ---');

  // Re-fetch package to get latest audio path
  const freshPkg = await storage.getUnityContentPackage(pkg.id);
  if (!freshPkg?.audioFilePath) {
    console.error('No audio file path after Suno generation!');
    process.exit(1);
  }

  const freshPackageData = freshPkg.packageData as any;

  // Resolve clip paths
  const rendersDir = join(process.cwd(), 'data', 'videos', 'renders');
  const clipPaths: string[] = [];

  const sortedClips = [...successfulClips].sort((a: any, b: any) => (a.clipNumber || 0) - (b.clipNumber || 0));

  for (const clip of sortedClips) {
    let clipPath = '';
    if (clip.videoUrl?.startsWith('/api/videos/')) {
      const filename = clip.videoUrl.split('/').pop();
      clipPath = join(rendersDir, filename || '');
    } else if (clip.localPath) {
      clipPath = clip.localPath;
    }

    if (clipPath && existsSync(clipPath)) {
      clipPaths.push(clipPath);
    } else {
      console.warn(`Clip ${clip.clipNumber} not found at ${clipPath}`);
    }
  }

  console.log(`Found ${clipPaths.length}/${sortedClips.length} clips on disk`);

  if (clipPaths.length < 2) {
    console.error('Not enough clips to assemble');
    process.exit(1);
  }

  // Resolve music path
  const { findAudioFile } = await import('./server/utils/path-resolver');
  const musicPath = findAudioFile(freshPkg.audioFilePath);
  if (!musicPath) {
    console.error(`Music file not found: ${freshPkg.audioFilePath}`);
    process.exit(1);
  }

  // Get music duration
  let musicDuration: number | undefined;
  try {
    const result = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${musicPath}"`,
    );
    musicDuration = parseFloat(result.stdout.trim()) || undefined;
    console.log(`Music duration: ${musicDuration}s`);
  } catch {
    console.warn('Could not get music duration');
  }

  // Calculate section timings
  const defaultClipDuration = 5; // Kling clips = 5s
  let cumulativeTime = 0;
  const sectionTimings = sortedClips.map((clip: any) => {
    const veoPrompt = freshPackageData.veoPrompts?.find((p: any) => p.clipNumber === clip.clipNumber);
    const clipDuration = veoPrompt?.duration || defaultClipDuration;
    const startTime = cumulativeTime;
    cumulativeTime += clipDuration;
    return { startTime, endTime: cumulativeTime };
  });

  const outputFilename = `unity_refix_${job.id}_${Date.now()}.mp4`;
  const outputPath = join(rendersDir, outputFilename);

  console.log(`Output: ${outputFilename}`);
  console.log(`Music: ${basename(musicPath)}`);
  console.log(`Clips: ${clipPaths.length}`);

  // Assemble
  await ffmpegProcessor.concatenateVideos(
    clipPaths,
    outputPath,
    musicPath,
    musicDuration,
    sectionTimings,
    true, // enableCrossfades
    0.3, // crossfadeDuration
    undefined, // existingState
    job.id,
    async (batchId, totalBatches) => {
      console.log(`   Assembly batch ${batchId + 1}/${totalBatches}...`);
    },
    '9:16', // Default aspect ratio for shorts
  );

  if (!existsSync(outputPath)) {
    console.error('Output file not created!');
    process.exit(1);
  }

  console.log(`Video assembled: ${outputPath}`);

  // Step 5: Run QA
  console.log('\n--- Step 5: Running video QA ---');

  const qaResult = await videoQAService.runQA(outputPath, job.id, true);

  if (!qaResult.passed) {
    console.error('VIDEO QA FAILED:');
    for (const failure of qaResult.criticalFailures) {
      console.error(`  ${failure.name}: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log('Video QA PASSED');

  // Verify with ffprobe
  console.log('\n--- Verification ---');
  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "${outputPath}"`);
    console.log(`Streams: ${stdout.trim().split('\n').join(', ')}`);
  } catch (e: any) {
    console.warn(`ffprobe verification failed: ${e.message}`);
  }

  // Update job with new video
  const finalVideoUrl = `/api/videos/${outputFilename}`;
  await storage.updateJob(job.id, {
    status: 'completed',
    videoUrl: finalVideoUrl,
    videoDuration: qaResult.duration,
    errorMessage: null,
  });

  console.log('\n' + '='.repeat(60));
  console.log('RE-FIX COMPLETE');
  console.log(`Video: ${finalVideoUrl}`);
  console.log(`Duration: ${qaResult.duration?.toFixed(1)}s`);
  console.log(`Audio: ${qaResult.hasAudio ? 'YES' : 'NO'}`);
  console.log(`File size: ${qaResult.fileSizeMB?.toFixed(1)}MB`);
  console.log('='.repeat(60));

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
