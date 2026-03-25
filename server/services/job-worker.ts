import { storage } from '../storage';
import { openaiService } from './openai-service';
import { storytellingRiverAnalyzer } from './storytelling-river-analyzer';
import { klingVideoGenerator } from './kling-video-generator';
import { UnifiedVideoGenerator, VideoEngine } from './unified-video-generator';
import { ffmpegProcessor } from './ffmpeg-processor';
import { API_COSTS } from '../config/pricing.js';
import { sanitizeVeoPrompt } from './prompt-sanitizer';
import {
  generateSinglePrompt,
  generateAllPrompts,
  parseLyricsToSegments,
  generateRetentionAwarePrompts,
  getEraConstraints,
  type SegmentInput,
} from './gpt-cinematic-director';
import { generateCohesivePrompts, type CohesiveVideoSegment } from './cohesive-prompt-generator';
import type { FullTrackContext } from './full-track-narrative-mapper';
import { vectorMemoryService } from './vector-memory-service';
import { selfReflectionAgent, type ClipReport, type NarrativeQuality } from './self-reflection-agent';
import { contextContractsService } from './context-contracts-service';
import { pipelineMonitoringService } from './pipeline-monitoring-service';
import { costEstimator } from './cost-estimator';
import { userCostTracker } from './user-cost-tracker';
// Historical story system available for fallback if needed
// import { generateDynamicPrompt, STORY_BEAT_TEMPLATES } from './historical-story-system';
import { join, basename } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, unlinkSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Job, CharacterProfile } from '@shared/schema';
import Replicate from 'replicate';

const execAsync = promisify(exec);
import { resolveAudioPath, findAudioFile } from '../utils/path-resolver';
import { TempPaths } from '../utils/temp-file-manager';

// Kling 3.0 configuration (15-second native clips)
const KLING_COST_PER_CLIP = API_COSTS.kling['kling-3.0'].per15sClip; // $1.50 per 15-second clip (300 credits @ $0.005/credit)
const KLING_INTER_CLIP_DELAY_MS = 2000; // 2 seconds between clips
const KLING_BATCH_DELAY_MS = 2000; // 2 seconds between batches (reduced from 5s — submit is instant)
import axios from 'axios';
import { sunoTaskService } from './suno-task-service';
import { sunoApi } from './suno-api';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '@shared/schema';

// Parallel processing configuration
// Set to 1 for sequential processing (wait for each job to fully complete before starting next)
// Increased from 5 to 10 for better throughput (2026-01-29 optimization)
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS || '10');
const MAX_KLING_CONCURRENT = parseInt(process.env.MAX_KLING_CONCURRENT || '10');

// Anchor image interface for character consistency
interface AnchorImage {
  characterName: string;
  imagePath: string;
  url: string;
  mimeType: string;
}

/**
 * Recalculate timestamps for Kling clips (15-second intervals for Kling 3.0)
 * Replaces the original song-section-based timestamp with clip-index-based timing
 */
function recalculateKlingTimestamp(promptText: string, clipIndex: number, clipDuration: number = 15): string {
  const startTime = clipIndex * clipDuration;
  const endTime = startTime + clipDuration;

  // Format: M:SS-M:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const newTimestamp = `[TIMESTAMP: ${formatTime(startTime)}-${formatTime(endTime)}]`;

  // Replace existing timestamp pattern [TIMESTAMP: X:XX-X:XX] with new one
  const timestampPattern = /\[TIMESTAMP:\s*\d+:\d{2}-\d+:\d{2}\]/;
  if (timestampPattern.test(promptText)) {
    return promptText.replace(timestampPattern, newTimestamp);
  }

  // If no existing timestamp, prepend the new one
  return `${newTimestamp} ${promptText}`;
}

/**
 * Job Worker Service
 * Processes video generation jobs from the queue
 */
export class JobWorker {
  private isRunning = false;
  private pollInterval = 2000; // 2 seconds (reduced from 5s for faster job pickup)
  private activeJobs: Map<string, { engine: string; startedAt: Date }> = new Map();
  private replicate?: Replicate;

  // Track last seen progress for each job (with optional FFmpegState for batch detection)
  private jobProgressTracker = new Map<string, { progress: number; lastUpdated: Date; lastState?: any }>();

  // Track active clip generation to prevent stuck job detection during generation
  private clipGenerationTracker = new Map<string, { lastClipAt: Date; clipsGenerated: number }>();

  constructor() {
    // Initialize Replicate for anchor image generation
    if (process.env.REPLICATE_API_TOKEN) {
      this.replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
      });
    }
  }

  /**
   * Generate anchor images for characters using FLUX on Replicate
   * These images provide visual consistency across all VEO clips
   */
  private async generateAnchorImages(
    characters: Array<{ name?: string; appearance: string; wardrobeBase: string; vibe: string }>,
    packageId: string,
  ): Promise<AnchorImage[]> {
    if (!this.replicate) {
      console.log('⚠️ Replicate not initialized - skipping anchor image generation');
      return [];
    }

    const anchorImages: AnchorImage[] = [];
    const referenceImagesDir = join(process.cwd(), 'attached_assets', 'reference_images');

    // Ensure directory exists
    if (!existsSync(referenceImagesDir)) {
      mkdirSync(referenceImagesDir, { recursive: true });
    }

    console.log(`\n🎭 ANCHOR IMAGE GENERATION: Creating ${characters.length} character reference(s)`);

    for (const char of characters) {
      const charName = char.name || 'Character';

      // Build a detailed portrait prompt from character description
      const prompt = `Professional portrait photograph of ${charName}, ${char.appearance}, wearing ${char.wardrobeBase}, ${char.vibe} personality expression. Photorealistic, studio lighting, clean background, high quality, detailed face, looking at camera, upper body portrait. 4K, professional headshot.`;

      console.log(`   🖼️ Generating anchor for: ${charName}`);
      console.log(`      Prompt: ${prompt.substring(0, 100)}...`);

      try {
        // Use FLUX Schnell for fast, high-quality portraits
        const output = (await this.replicate.run('black-forest-labs/flux-schnell', {
          input: {
            prompt: prompt,
            num_outputs: 1,
            aspect_ratio: '1:1',
            output_format: 'png',
            output_quality: 90,
          },
        })) as any;

        // Get the image URL from output
        const imageUrl = Array.isArray(output) ? output[0] : output;

        if (imageUrl) {
          // Download and save the image
          const filename = `anchor_${packageId}_${charName.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.png`;
          const imagePath = join(referenceImagesDir, filename);

          const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          writeFileSync(imagePath, imageResponse.data);

          // URL for VEO API
          const apiUrl = `/api/reference-images/${filename}`;

          anchorImages.push({
            characterName: charName,
            imagePath: imagePath,
            url: apiUrl,
            mimeType: 'image/png',
          });

          console.log(`   ✅ Anchor saved: ${filename} (~$0.003)`);
        }
      } catch (error: any) {
        console.error(`   ❌ Failed to generate anchor for ${charName}:`, error.message);
      }
    }

    console.log(`   🎭 Generated ${anchorImages.length}/${characters.length} anchor images\n`);
    return anchorImages;
  }

  /**
   * Start the job worker
   */
  async start() {
    if (this.isRunning) {
      console.log('Job worker already running');
      return;
    }

    this.isRunning = true;
    console.log(
      `🎬 Job worker started - parallel processing enabled (max ${MAX_CONCURRENT_JOBS} concurrent, Kling: ${MAX_KLING_CONCURRENT})`,
    );

    // Clean up stale jobs on startup
    await this.cleanupStaleJobs();

    // Check for stuck jobs every 2 minutes
    setInterval(() => this.checkForStuckJobs(), 2 * 60 * 1000);

    this.processLoop();
  }

  /**
   * Reset jobs stuck in "processing" or "preparing" on server restart
   * Called on startup to recover from server restarts
   * - "processing" jobs: requeue to resume from last checkpoint
   * - "preparing" jobs: requeue (Suno polling was lost after restart)
   */
  private static readonly MAX_REQUEUE_COUNT = 3;

  private async cleanupStaleJobs() {
    try {
      const jobs = await storage.listJobs();
      const now = new Date();

      let requeuedCount = 0;
      let preparingCount = 0;
      let killedCount = 0;

      for (const job of jobs) {
        if (job.status === 'processing') {
          const updatedAt = new Date(job.updatedAt);
          const ageMs = now.getTime() - updatedAt.getTime();
          const ageMinutes = Math.round(ageMs / 60000);

          // Check doNotRequeue flag
          const metadata = (job.metadata || {}) as Record<string, any>;
          if (metadata.doNotRequeue) {
            console.log(`🚫 Skipping requeue for ${job.scriptName} — marked doNotRequeue`);
            await storage.updateJob(job.id, {
              status: 'failed',
              errorMessage: `Permanently failed: marked doNotRequeue.`,
            });
            killedCount++;
            continue;
          }

          // Track requeue count in metadata to prevent infinite requeue loops
          const requeueCount = (metadata.requeueCount || 0) + 1;
          if (requeueCount > JobWorker.MAX_REQUEUE_COUNT) {
            console.log(
              `🚫 KILLING zombie job: ${job.scriptName} — requeued ${requeueCount - 1} times already (max ${JobWorker.MAX_REQUEUE_COUNT}). Permanently failing.`,
            );
            await storage.updateJob(job.id, {
              status: 'failed',
              errorMessage: `Permanently failed: exceeded max requeue limit (${JobWorker.MAX_REQUEUE_COUNT}). Job was stuck in requeue loop.`,
              metadata: {
                ...metadata,
                doNotRequeue: true,
                killedAt: new Date().toISOString(),
                killedReason: 'max-requeue-limit',
              } as any,
            } as any);
            killedCount++;
            continue;
          }

          const completedClipsCount = job.completedClips?.length || 0;
          const resumeInfo = completedClipsCount > 0 ? ` (${completedClipsCount} clips saved, will resume)` : '';

          console.log(
            `🔄 Requeuing interrupted job: ${job.scriptName} (was at ${job.progress}% for ${ageMinutes} minutes, requeue #${requeueCount}/${JobWorker.MAX_REQUEUE_COUNT})${resumeInfo}`,
          );

          await storage.updateJob(job.id, {
            status: 'queued',
            errorMessage: `Server restarted during processing. Resuming from last checkpoint. (requeue #${requeueCount})`,
            metadata: { ...metadata, requeueCount } as any,
          } as any);

          requeuedCount++;
        }

        // Also recover jobs stuck in "preparing" status
        if (job.status === 'preparing') {
          const metadata = (job.metadata || {}) as Record<string, any>;
          if (metadata.doNotRequeue) {
            console.log(`🚫 Skipping requeue for ${job.scriptName} — marked doNotRequeue`);
            await storage.updateJob(job.id, {
              status: 'failed',
              errorMessage: `Permanently failed: marked doNotRequeue.`,
            });
            killedCount++;
            continue;
          }

          const requeueCount = (metadata.requeueCount || 0) + 1;
          if (requeueCount > JobWorker.MAX_REQUEUE_COUNT) {
            console.log(
              `🚫 KILLING zombie job: ${job.scriptName} — requeued ${requeueCount - 1} times (max ${JobWorker.MAX_REQUEUE_COUNT}). Permanently failing.`,
            );
            await storage.updateJob(job.id, {
              status: 'failed',
              errorMessage: `Permanently failed: exceeded max requeue limit (${JobWorker.MAX_REQUEUE_COUNT}).`,
              metadata: {
                ...metadata,
                doNotRequeue: true,
                killedAt: new Date().toISOString(),
                killedReason: 'max-requeue-limit',
              } as any,
            } as any);
            killedCount++;
            continue;
          }

          console.log(
            `🔄 Recovering stuck job: ${job.scriptName} (was preparing - requeue #${requeueCount}/${JobWorker.MAX_REQUEUE_COUNT})`,
          );

          await storage.updateJob(job.id, {
            status: 'queued',
            errorMessage: `Server restarted during Suno polling. Requeued (requeue #${requeueCount}).`,
            metadata: { ...metadata, requeueCount } as any,
          } as any);

          preparingCount++;
        }
      }

      if (requeuedCount > 0 || preparingCount > 0 || killedCount > 0) {
        console.log(
          `✅ Cleanup complete: ${requeuedCount} requeued, ${preparingCount} preparing recovered, ${killedCount} zombie(s) killed`,
        );
      }
    } catch (error) {
      console.error('❌ Error cleaning up stale jobs:', error);
    }
  }

  /**
   * Check for stuck jobs and mark them as failed
   * Uses progress-based detection: only fails jobs stuck at the same progress for 5+ minutes
   * Jobs at 90%+ (FFmpeg processing phase) get 15 minutes to allow for subtitle burning
   */
  private async checkForStuckJobs(): Promise<void> {
    try {
      const jobs = await storage.listJobs();
      const now = new Date();
      const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes for normal progress
      const FFMPEG_PHASE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes for FFmpeg phase (90%+)

      for (const job of jobs) {
        // Skip cancelled jobs - they should never be checked for being stuck
        if (job.status === 'cancelled') {
          this.jobProgressTracker.delete(job.id);
          this.clipGenerationTracker.delete(job.id);
          continue;
        }

        if (job.status !== 'processing') {
          // Clean up tracking for non-processing jobs
          this.jobProgressTracker.delete(job.id);
          this.clipGenerationTracker.delete(job.id);
          continue;
        }

        const currentProgress = job.progress || 0;
        const tracked = this.jobProgressTracker.get(job.id);

        if (!tracked) {
          // First time seeing this job - start tracking
          this.jobProgressTracker.set(job.id, {
            progress: currentProgress,
            lastUpdated: now,
          });
          continue;
        }

        // Check if progress has changed
        if (tracked.progress !== currentProgress) {
          // Progress changed - update tracker
          this.jobProgressTracker.set(job.id, {
            progress: currentProgress,
            lastUpdated: now,
            lastState: job.ffmpegState,
          });
          continue;
        }

        // Check if job has active clip generation (clips being generated)
        const clipTracker = this.clipGenerationTracker.get(job.id);
        if (clipTracker) {
          const clipAge = now.getTime() - clipTracker.lastClipAt.getTime();
          // Kling clips can take up to 5 minutes each; allow 6 minutes between clips
          const CLIP_GENERATION_TIMEOUT = 6 * 60 * 1000;

          if (clipAge < CLIP_GENERATION_TIMEOUT) {
            // Clips are still being generated - don't mark as stuck
            this.jobProgressTracker.set(job.id, {
              progress: currentProgress,
              lastUpdated: now,
            });
            continue;
          }
        }

        // Check if job has active FFmpeg state (indicates batch processing)
        if (job.ffmpegState && job.ffmpegState.completedBatches) {
          // Job is in batch processing - check if batches are progressing
          const previousState = (tracked as any).lastState;
          if (
            previousState &&
            previousState.completedBatches &&
            job.ffmpegState.completedBatches.length > previousState.completedBatches.length
          ) {
            // Batches are progressing - reset timer
            this.jobProgressTracker.set(job.id, {
              progress: currentProgress,
              lastUpdated: now,
              lastState: job.ffmpegState,
            });
            console.log(
              `   ✅ FFmpeg batch progressing: ${job.ffmpegState.completedBatches.length}/${job.ffmpegState.batchCount} batches complete`,
            );
            continue;
          }
        }

        // Progress hasn't changed - check how long it's been stuck
        const stuckDuration = now.getTime() - tracked.lastUpdated.getTime();

        // HARD MAXIMUM AGE: Force-fail jobs that have been running too long overall
        // This catches cascading failures that keep retrying within the same job
        const jobAge = job.createdAt ? now.getTime() - new Date(job.createdAt).getTime() : 0;
        const MAX_AGE_MUSIC = 45 * 60 * 1000; // 45 minutes for music mode
        const MAX_AGE_KLING = 90 * 60 * 1000; // 90 minutes for Unity/Kling

        const maxAge = job.mode === 'music' ? MAX_AGE_MUSIC : MAX_AGE_KLING;
        if (jobAge > maxAge) {
          const ageMinutes = Math.round(jobAge / 60000);
          console.error(
            `⏰ [Hard Timeout] Job ${job.id} exceeded max age: ${ageMinutes} minutes (limit: ${Math.round(maxAge / 60000)} min)`,
          );
          await storage.updateJob(job.id, {
            status: 'failed',
            errorMessage: `Hard timeout: Job ran for ${ageMinutes} minutes (max ${Math.round(maxAge / 60000)} min). Stuck at ${currentProgress}%.`,
          });
          this.jobProgressTracker.delete(job.id);
          this.clipGenerationTracker.delete(job.id);
          if (this.activeJobs.has(job.id)) {
            this.activeJobs.delete(job.id);
          }
          // Kill any active Kling polling for this job
          try {
            const { KlingVideoGenerator } = await import('./kling-video-generator');
            KlingVideoGenerator.abortJob(job.id);
          } catch {}
          // Notify circuit breaker
          const { costGuard: cg } = await import('./cost-guard');
          cg.recordFailure(job.mode || 'unknown', `Hard timeout at ${currentProgress}% after ${ageMinutes} min`);
          continue;
        }

        // STALL DETECTOR: 10-minute no-progress threshold for non-FFmpeg phases
        // For music mode, FFmpeg phases (>= 50%) use a longer 20-minute threshold
        const KLING_STALL_THRESHOLD = 10 * 60 * 1000; // 10 minutes
        if (stuckDuration > KLING_STALL_THRESHOLD && currentProgress > 30 && currentProgress < 90) {
          // This is likely a Kling clip generation hang — don't wait for full timeout
          console.warn(
            `⚠️  [Stall Detector] Job ${job.id} stalled at ${currentProgress}% for ${Math.round(stuckDuration / 60000)} min (Kling stall threshold)`,
          );
        }

        // Use longer timeout for FFmpeg-intensive phases
        // Music mode has several long-running FFmpeg operations:
        // - 50% = Video looping (8-15 minutes for 20-28 loops)
        // - 65% = Beat effects application (3-6 minutes)
        // - 80% = Audio combining/karaoke (5-10 minutes)
        // - 90%+ = Final assembly (subtitle burning, merging)
        let threshold = STUCK_THRESHOLD_MS; // Default: 5 minutes

        if (job.mode === 'music') {
          // Music mode needs much longer timeouts for FFmpeg operations and Kling/Suno API calls
          // Progress 50-99% includes FFmpeg-heavy phases (looping, effects, combining, assembly)
          // Progress 80-99% maps to music-mode-generator internal phases (scaled from 0-100%)
          // Progress 80-89% includes Kling background generation (~30% internal) which polls for 1-10+ min
          // All progress >= 50 can involve FFmpeg processing and must NOT use the short Kling threshold
          if (currentProgress >= 80) {
            threshold = 25 * 60 * 1000; // 25 minutes for Kling generation + FFmpeg (80-99%)
            console.log(
              `   ⏱️  Music mode at ${currentProgress}% - allowing up to 25 minutes for Kling/FFmpeg processing`,
            );
          } else if (currentProgress >= 50) {
            threshold = 20 * 60 * 1000; // 20 minutes for FFmpeg-heavy phases (50-79%)
            console.log(`   ⏱️  Music mode at ${currentProgress}% - allowing up to 20 minutes for FFmpeg processing`);
          } else {
            // For pre-FFmpeg phases in music mode (Suno generation at 5-49%)
            // Suno multi-song batches can take 3-5 min per song, but progress updates per-song
            threshold = 15 * 60 * 1000; // 15 minutes for Suno generation phases
          }
        } else if (currentProgress >= 90) {
          // unity_kling at 90% may still be regenerating clips + assembly + post-processing
          // Allow 25 minutes for clip regen (3 clips × 5 min) + assembly + post-processing
          threshold = job.mode === 'unity_kling' ? 25 * 60 * 1000 : FFMPEG_PHASE_THRESHOLD_MS;
        }

        if (stuckDuration > threshold) {
          const stuckMinutes = Math.round(stuckDuration / 60000);
          console.log(
            `⚠️  Detected stuck job: ${job.id} - ${job.scriptName} (stuck at ${currentProgress}% for ${stuckMinutes} minutes)`,
          );

          const currentRetries = job.retryCount || 0;
          const maxRetries = job.maxRetries || 3;

          // Generate a more specific error message based on the job's state
          let specificReason = 'Please try again.';
          if (job.mode === 'music') {
            // Music mode specific error messages
            // Progress 80-99% = music-mode-generator internal phases (scaled from 0-100% to 80-99%)
            // 80% = beat analysis (10% internal), 82% = visual theme (20%), 84-86% = Kling background (30%)
            // 90% = seamless loop (50%), 93% = beat effects (65%), 96-97% = combine (80-85%), 99% = thumbnail (95%)
            if (currentProgress >= 50 && currentProgress < 55) {
              specificReason = `Stalled during video looping (FFmpeg processing ${Math.ceil(((job as any).audioDuration || 120) / 5)} loops).`;
            } else if (currentProgress >= 55 && currentProgress < 70) {
              specificReason = `Stalled during beat effects application (FFmpeg visual effects).`;
            } else if (currentProgress >= 80 && currentProgress < 90) {
              specificReason = `Stalled during Kling background video generation or beat analysis (API polling).`;
            } else if (currentProgress >= 90 && currentProgress < 97) {
              specificReason = `Stalled during video looping, beat effects, or audio/video combining (FFmpeg encoding).`;
            } else if (currentProgress >= 97) {
              specificReason = `Stalled during final assembly or thumbnail generation.`;
            } else if (currentProgress >= 70) {
              specificReason = `Stalled during audio concatenation or preparation.`;
            } else {
              specificReason = 'Stalled during music generation (Suno) or beat analysis.';
            }
          } else if (currentProgress >= 90) {
            const phase = job.ffmpegState?.phase || 'assembly';
            specificReason = `Stalled during final video assembly (FFmpeg ${phase}).`;
          } else if (clipTracker) {
            specificReason = `Stalled while generating clips (last clip received ${Math.round(stuckDuration / 60000)} mins ago).`;
          } else {
            specificReason = 'Stalled during the clip generation phase.';
          }
          const errorMessage = `Job stuck at ${currentProgress}% for ${stuckMinutes} minutes. ${specificReason}`;

          // Check if should retry (same logic as processNextJob catch block)
          const shouldRetry = currentRetries < maxRetries;

          if (shouldRetry) {
            // Auto-retry: requeue the job with incremented retry count
            const nextRetry = currentRetries + 1;
            console.log(
              `🔄 Auto-retrying stuck job ${job.id} at ${currentProgress}% (attempt ${nextRetry}/${maxRetries})`,
            );

            // Clear from activeJobs if this is a stuck active job to unblock the worker
            if (this.activeJobs.has(job.id)) {
              console.log(`   Removing from activeJobs to unblock worker`);
              this.activeJobs.delete(job.id);
            }

            // PRESERVE completed clips for resume - don't waste already-generated videos!
            const existingClipsCount = (job.completedClips as any[])?.length || 0;
            if (existingClipsCount > 0) {
              console.log(`   💾 Preserving ${existingClipsCount} completed clips for resume`);
            }

            await storage.updateJob(job.id, {
              status: 'queued', // Requeue it
              retryCount: nextRetry,
              errorMessage: `Retry ${nextRetry}/${maxRetries} at ${currentProgress}%: ${errorMessage}`,
              // KEEP completedClips to enable resume! Don't reset progress - let processJob handle it
            });
          } else {
            // Non-retryable or max retries reached
            let failureReason = '';
            if (currentRetries >= maxRetries) {
              failureReason = `Failed after ${maxRetries} retry attempts: ${errorMessage}`;
            } else {
              failureReason = errorMessage;
            }

            console.error(`❌ Stuck job ${job.id} failed permanently:`, failureReason);
            await storage.updateJob(job.id, {
              status: 'failed',
              errorMessage: failureReason,
            });
          }

          this.jobProgressTracker.delete(job.id);
          this.clipGenerationTracker.delete(job.id);
        }
      }
    } catch (error) {
      console.error('Error checking for stuck jobs:', error);
    }
  }

  /**
   * Stop the job worker gracefully
   */
  stop() {
    this.isRunning = false;
    console.log('Job worker stopped');
  }

  /**
   * Main processing loop
   */
  private async processLoop() {
    while (this.isRunning) {
      try {
        await this.processNextJob();
      } catch (error) {
        console.error('Error in job processing loop:', error);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
  }

  /**
   * Get the video engine for a job
   */
  private getJobEngine(job: Job): string {
    // Parse unityMetadata if it's a string
    const unityMeta = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;

    if (unityMeta?.videoEngine) {
      return unityMeta.videoEngine;
    }
    return job.mode || 'veo';
  }

  /**
   * Count active jobs by engine type
   */
  private countActiveByEngine(engine: string): number {
    let count = 0;
    Array.from(this.activeJobs.values()).forEach((info) => {
      if (info.engine === engine) count++;
    });
    return count;
  }

  /**
   * Process a job asynchronously with error handling
   */
  private async processJobAsync(job: Job) {
    try {
      await this.processJob(job);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      console.error(`Job ${job.id} failed:`, errorMessage);

      // If this is a validation error, the job was already marked as failed
      // with retryCount = maxRetries. Don't overwrite that update.
      if (error.isValidationError) {
        console.log(`   Validation error - job ${job.id} already marked as failed permanently`);
        return; // Exit early - job is already updated correctly
      }

      // ============================================================================
      // ERROR MONITOR INTEGRATION - Report job failures to error monitoring system
      // ============================================================================
      try {
        const { errorMonitor } = await import('./error-monitor');
        await errorMonitor.captureError(error, {
          service: 'job-worker',
          operation: job.mode === 'unity_kling' ? 'processUnityVeoJob' : 'processJob',
          jobId: job.id,
          metadata: {
            mode: job.mode,
            scriptName: job.scriptName,
            progress: job.progress || 0,
            retryCount: job.retryCount || 0,
          },
        });
      } catch (monitorError) {
        console.error('[Job Worker] Failed to report error to monitor:', monitorError);
      }
      // ============================================================================

      const latestJob = await storage.getJob(job.id);
      if (latestJob) {
        const isRetryableError =
          errorMessage.includes('timed out') ||
          errorMessage.includes('timeout') ||
          errorMessage.includes('stuck') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('ECONNRESET') ||
          errorMessage.includes('ECONNABORTED') ||
          errorMessage.includes('socket hang up');

        const currentRetries = latestJob.retryCount || 0;
        const maxRetries = latestJob.maxRetries || 3;
        const currentProgress = latestJob.progress || 0;

        if (isRetryableError && currentRetries < maxRetries) {
          const nextRetry = currentRetries + 1;
          console.log(`🔄 Auto-retrying job ${job.id} at ${currentProgress}% (attempt ${nextRetry}/${maxRetries})`);

          const existingClipsCount = (latestJob.completedClips as any[])?.length || 0;
          if (existingClipsCount > 0) {
            console.log(`   💾 Preserving ${existingClipsCount} completed clips for resume`);
          }

          await storage.updateJob(job.id, {
            status: 'queued',
            retryCount: nextRetry,
            errorMessage: `Retry ${nextRetry}/${maxRetries} at ${currentProgress}%: ${errorMessage}`,
          });
        } else {
          let failureReason = '';
          if (currentRetries >= maxRetries) {
            failureReason = `Failed after ${maxRetries} retry attempts: ${errorMessage}`;
          } else {
            failureReason = errorMessage;
          }

          console.error(`❌ Job ${job.id} failed permanently:`, failureReason);
          await storage.updateJob(job.id, {
            status: 'failed',
            errorMessage: failureReason,
          });

          // ============================================================================
          // ERROR FIX BANDIT - Attempt auto-fix with Thompson Sampling
          // ============================================================================
          // Only attempt auto-fix once per job to prevent infinite loops
          const autoFixAttempted = latestJob.metadata?.autoFixAttempted === true;

          if (!autoFixAttempted) {
            try {
              const { errorMonitor } = await import('./error-monitor');
              const { errorFixBandit } = await import('./error-fix-bandit');

              // Give error monitor time to process (it runs async)
              await new Promise((resolve) => setTimeout(resolve, 100));

              // Get the most recent error report for this job
              const errorReports = await storage.listErrors({ jobId: job.id });
              const latestError = errorReports.sort(
                (a, b) =>
                  new Date((b as any).timestamp as Date).getTime() - new Date((a as any).timestamp as Date).getTime(),
              )[0];

              if (
                latestError &&
                latestError.errorType &&
                ['high', 'critical'].includes(latestError.severity as string)
              ) {
                console.log(`[Job Worker] 🎰 Attempting auto-fix for ${latestError.errorType}...`);

                // Use Thompson Sampling to select best fix strategy
                const selectedFix = errorFixBandit.selectFixStrategy(latestError.errorType as string);

                console.log(`[Job Worker] Selected: "${selectedFix.strategyName}"`);
                console.log(`   Confidence: ${(selectedFix.confidence * 100).toFixed(1)}%`);
                console.log(`   ${selectedFix.isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'}`);

                // Apply the fix (for now, just log and requeue - actual fix application varies by strategy)
                console.log(`[Job Worker] ✅ Applying fix strategy: ${JSON.stringify(selectedFix.fixStrategy)}`);

                // Requeue the job for retry with auto-fix metadata
                const updatedJob = await storage.getJob(job.id);
                if (updatedJob) {
                  await storage.updateJob(job.id, {
                    status: 'queued',
                    errorMessage: null as any,
                    retryCount: 0, // Reset retries for auto-fix attempt
                    metadata: {
                      ...(updatedJob.metadata || {}),
                      autoFixAttempted: true,
                      autoFixStrategy: selectedFix.strategyId,
                      autoFixTimestamp: new Date().toISOString(),
                      autoFixErrorId: latestError.id,
                    } as any,
                  } as any);

                  console.log(`[Job Worker] Job ${job.id} requeued for retry with auto-fix`);
                }
              } else if (latestError) {
                console.log(`[Job Worker] Error severity too low for auto-fix: ${latestError.severity}`);
              }
            } catch (fixErr: any) {
              console.error('[Job Worker] Auto-fix selection failed:', fixErr.message);
            }
          } else {
            console.log(`[Job Worker] Auto-fix already attempted for job ${job.id}, not retrying`);

            // Track auto-fix failure in bandit
            try {
              const { errorFixBandit } = await import('./error-fix-bandit');

              const strategyId = latestJob.metadata?.autoFixStrategy as string;
              const fixTimestamp = new Date(latestJob.metadata?.autoFixTimestamp as string);
              const fixTime = (Date.now() - fixTimestamp.getTime()) / 1000;

              console.log(`[Job Worker] ❌ Job ${job.id} still failed after auto-fix`);
              console.log(`   Strategy: ${strategyId} did not work`);

              // Update bandit with negative reward (increment beta)
              errorFixBandit.updateReward(strategyId, {
                jobSucceeded: false,
                fixTime: fixTime,
                errorResolved: false,
              });
            } catch (trackErr: any) {
              console.error('[Job Worker] Failed to track auto-fix failure:', trackErr.message);
            }
          }
          // ============================================================================
        }
      }
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Find and process the next queued job(s) - supports parallel processing
   */
  private async processNextJob() {
    // Check global limit
    if (this.activeJobs.size >= MAX_CONCURRENT_JOBS) {
      return;
    }

    // Find next queued jobs AND failed jobs with retries left
    const jobs = await storage.listJobs();
    const queuedJobs = jobs.filter((j) => {
      // Skip cancelled jobs - they should never be retried
      if (j.status === 'cancelled') {
        return false;
      }
      // Include queued jobs
      if (j.status === 'queued' && !this.activeJobs.has(j.id)) {
        return true;
      }
      // Include failed jobs that have retries remaining (but NOT cancelled jobs)
      if (j.status === 'failed' && !this.activeJobs.has(j.id)) {
        const retryCount = j.retryCount || 0;
        const maxRetries = j.maxRetries || 3;
        return retryCount < maxRetries;
      }
      // NEVER retry cancelled jobs
      if (j.status === 'cancelled') {
        return false;
      }
      return false;
    });

    if (queuedJobs.length === 0) {
      return; // No jobs to process
    }

    // PRIORITY: Sort by progress descending - finish jobs that are further along first!
    // This ensures partially completed jobs get finished before starting new ones
    queuedJobs.sort((a, b) => (b.progress || 0) - (a.progress || 0));

    // Find jobs that fit within engine limits
    for (const queuedJob of queuedJobs) {
      const engine = this.getJobEngine(queuedJob);

      // Check per-engine limits (all engines now use Kling)
      const engineCount = this.countActiveByEngine(engine);
      const engineLimit = MAX_KLING_CONCURRENT;

      if (engineCount >= engineLimit) {
        continue; // This engine is at capacity, try next job
      }

      // Can process this job
      this.activeJobs.set(queuedJob.id, { engine, startedAt: new Date() });
      console.log(
        `\n📹 Processing job: ${queuedJob.id} - ${queuedJob.scriptName} (${this.activeJobs.size}/${MAX_CONCURRENT_JOBS} active, engine: ${engine})`,
      );

      // Process async - don't await, let it run in background
      this.processJobAsync(queuedJob);

      // Continue looking for more jobs to process in parallel
      if (this.activeJobs.size >= MAX_CONCURRENT_JOBS) {
        break;
      }
    }
  }

  /**
   * Log progress with detailed message for troubleshooting
   * Non-blocking for callbacks - uses fire-and-forget pattern
   */
  private logProgress(jobId: string, progress: number, message: string) {
    console.log(`   [${progress}%] ${message}`);

    // Fire-and-forget to avoid blocking generation callbacks
    Promise.all([
      storage.updateJob(jobId, { progress }),
      storage.createProgressLog({ jobId, progress, message }),
    ]).catch((err) => {
      console.error(`Failed to log progress for job ${jobId}:`, err);
    });
  }

  /**
   * Process a single job
   */
  private async processJob(job: Job) {
    // If job was previously failed, increment retry count
    const updates: any = { status: 'processing', progress: 0 };
    if (job.status === 'failed') {
      const nextRetry = (job.retryCount || 0) + 1;
      updates.retryCount = nextRetry;
      const maxRetries = job.maxRetries || 3;
      console.log(`🔄 Retrying failed job ${job.id} (attempt ${nextRetry}/${maxRetries})`);
    }

    // Mark as processing and log start
    await storage.updateJob(job.id, updates);
    this.logProgress(job.id, 0, 'Job started - initializing video generation');

    // Step 0: Cost Estimation & Budget Enforcement (NEW - Dec 2025)
    console.log(`\n💰 [Cost Estimator] Calculating pre-generation cost estimate...`);
    try {
      const estimate = costEstimator.estimateFromJob(job);

      // TEMPORARILY DISABLED - Save estimate to job record (columns don't exist in DB)
      // await storage.updateJob(job.id, {
      //   estimatedCost: estimate.breakdown.total.toString(),
      //   costEstimate: {
      //     breakdown: estimate.breakdown,
      //     timestamp: estimate.timestamp.toISOString(),
      //     clipCount: estimate.clipCount,
      //     estimatedDuration: estimate.estimatedDuration,
      //   } as any,
      // });

      console.log(costEstimator.formatBreakdown(estimate));

      // TEMPORARILY DISABLED - Budget enforcement check (Drizzle ORM issue with budgetLimit column)
      // if (job.budgetLimit) {
      //   const budgetLimit = parseFloat(job.budgetLimit);
      //   const budgetCheck = await costEstimator.checkBudget(job.id, budgetLimit);
      //
      //   if (!budgetCheck.allowed) {
      //     const errorMsg = `Budget exceeded: Estimated cost $${estimate.breakdown.total.toFixed(2)} exceeds budget limit $${budgetLimit.toFixed(2)}`;
      //     console.error(`❌ ${errorMsg}`);
      //
      //     await storage.updateJob(job.id, {
      //       status: 'failed',
      //       errorMessage: errorMsg,
      //     });
      //
      //     throw new Error(errorMsg);
      //   }
      //
      //   console.log(
      //     `✅ Budget check passed: $${estimate.breakdown.total.toFixed(2)} / $${budgetLimit.toFixed(2)} (${budgetCheck.budgetRemaining?.toFixed(2)} remaining)`,
      //   );
      // } else {
      //   console.log(`ℹ️  No budget limit set - proceeding with estimated cost $${estimate.breakdown.total.toFixed(2)}`);
      // }
    } catch (error: any) {
      if (error.message?.includes('Budget exceeded')) {
        throw error; // Rethrow budget errors to fail the job
      }
      console.warn(`⚠️  Cost estimation failed: ${error.message || String(error)}`);
      console.log(`   Proceeding without cost estimate...`);
      try {
        const { errorMonitor } = await import('./error-monitor');
        await errorMonitor.captureError(error instanceof Error ? error : new Error(String(error)), {
          service: 'job-worker',
          operation: 'costEstimation',
          jobId: job.id,
          metadata: { errorType: error.name || 'TypeError' },
        });
      } catch {}
    }

    // Unity VEO Mode - process pre-generated prompts from Unity packages (skip script analysis)
    if (job.mode === 'unity_kling') {
      // CRITICAL VALIDATION: Unity jobs require metadata or package ID
      if (!(job as any).unityPackageId && !job.unityMetadata) {
        const errorMsg = 'Unity job requires unityPackageId or unityMetadata. Use mode="kling" for non-Unity jobs.';
        console.error(`❌ [Job ${job.id}] ${errorMsg}`);

        // Mark as failed immediately - don't retry
        // Set retryCount >= maxRetries to prevent retry queue from picking it up
        const maxRetries = job.maxRetries || 3;
        await storage.updateJob(job.id, {
          status: 'failed',
          error: errorMsg,
          errorMessage: errorMsg,
          progress: 0,
          retryCount: maxRetries, // Prevent retry
          completedAt: new Date(),
        } as any);

        // Capture error for monitoring
        try {
          const { errorMonitor } = await import('./error-monitor');
          await errorMonitor.captureError(new Error(errorMsg), {
            service: 'job-worker',
            operation: 'validateUnityJob',
            jobId: job.id,
            severity: 'MEDIUM',
            metadata: {
              mode: job.mode,
              hasUnityPackageId: !!(job as any).unityPackageId,
              hasUnityMetadata: !!job.unityMetadata,
            },
          } as any);
        } catch (err) {
          console.error('Failed to capture validation error:', err);
        }

        // Throw error to prevent catch block from overwriting our update
        const error = new Error(errorMsg);
        (error as any).isValidationError = true; // Mark as validation error
        throw error;
      }

      const targetAspectRatio = (job.aspectRatio || '16:9') as '16:9' | '9:16';
      await this.processUnityVeoJob(job, targetAspectRatio);
      return; // Unity VEO jobs handle their own completion
    }

    // MUSIC MODE - Lightweight beat-synced videos with looped backgrounds
    if (job.mode === 'music') {
      console.log(`\n🎵 MUSIC MODE: Beat-synced video generation`);
      const targetAspectRatio = (job.aspectRatio || '16:9') as '16:9' | '9:16';
      await this.processMusicModeJob(job, targetAspectRatio);
      return; // Music Mode jobs handle their own completion
    }

    // Calculate dynamic clip count based on music duration
    // Kling 3.0 uses 15-second clips
    const KLING_CLIP_DURATION = 15;
    const clipDuration = KLING_CLIP_DURATION;
    const MIN_CLIPS = 2; // Minimum for visual variety
    const MAX_CLIPS = 12; // 3 min at 15s = 12 clips
    let clipCount = 10; // default fallback

    if (job.audioDuration) {
      // Calculate optimal clip count: ceil(songLength / clipDuration)
      const audioDur = typeof job.audioDuration === 'string' ? parseFloat(job.audioDuration) : job.audioDuration;
      clipCount = Math.ceil(audioDur / clipDuration);
      clipCount = Math.max(MIN_CLIPS, Math.min(MAX_CLIPS, clipCount));

      const costPerClip = KLING_COST_PER_CLIP; // All modes now use Kling
      const estimatedCost = clipCount * costPerClip;
      console.log(
        `🎵 Optimized clip count: ${clipCount} clips for ${job.audioDuration}s audio (${clipDuration}s per clip)`,
      );
      console.log(`   💰 Estimated cost: $${estimatedCost.toFixed(2)} (${clipCount} × $${costPerClip.toFixed(2)})`);

      if (job.musicAnalysis) {
        const musicAnalysis = typeof job.musicAnalysis === 'string' ? JSON.parse(job.musicAnalysis) : job.musicAnalysis;
        console.log(`   ♪ Music-aware: ${musicAnalysis.structure?.sections?.length || 0} sections detected`);
      }
    } else {
      console.log(`📹 Default generation: ${clipCount} clips (no audio duration specified)`);
    }

    // Update job with calculated clipCount
    await storage.updateJob(job.id, { clipCount });
    console.log(`✅ Clip count set to: ${clipCount}`);

    // Step 1: Analyze script with music awareness (0-10%)
    console.log(`Step 1: Analyzing script with Storytelling River framework (generating ${clipCount} scenes)`);
    if (job.musicAnalysis) {
      console.log('   ♪ Music analysis detected - generating music-synchronized scenes');
      console.log(
        `   ♪ Mood: ${job.musicAnalysis.mood}, BPM: ${job.musicAnalysis.bpm}, Sections: ${job.musicAnalysis.structure?.sections?.length || 0}`,
      );
    }

    let analysis;
    try {
      analysis = await storytellingRiverAnalyzer.analyzeScript(
        job.scriptContent || '',
        job.musicAnalysis as any,
        clipCount, // Generate enough detailed scenes for all clips
      );
      console.log(`   Generated ${analysis.scenes.length} lyric-based scenes for ${clipCount} clips`);
    } catch (error: any) {
      if (error.message && error.message.includes('timed out')) {
        console.error(`⏱️  Script analysis timed out for job ${job.id}`);
        // Throw the error so it gets caught by the retry logic in processNextJob
        throw new Error('Script analysis timed out. The AI service may be experiencing delays.');
      }
      throw error; // Re-throw other errors
    }

    await this.logProgress(job.id, 10, `Script analysis complete - generated ${analysis.scenes.length} scenes`);

    // Step 2: Fetch scene details if provided
    let sceneDescription = 'neutral background';
    if (job.sceneId) {
      const scenes = await storage.listScenes();
      const scene = scenes.find((s) => s.id === job.sceneId);
      if (scene) {
        sceneDescription = scene.description;
      }
    }

    let clipPaths: string[] = [];
    let totalCost = 0;

    // Determine target aspect ratio for all modes
    const targetAspectRatio = (job.aspectRatio || '9:16') as '16:9' | '9:16';
    console.log(`📐 Target aspect ratio: ${targetAspectRatio}`);

    if (job.mode === 'kling') {
      // KLING 3.0 MODE - $1.50 per 15s clip (300 credits)
      console.log(`Mode: Kling 3.0 - Generating ${clipCount} clips @ $${KLING_COST_PER_CLIP}/clip (15s each)`);

      // Import Kling prompt builder
      const { buildKlingPrompt, validateKlingPrompt, getKlingVerb, getKlingCamera } =
        await import('./kling-prompt-builder');

      // Generate Kling-optimized prompts from scenes
      const prompts: string[] = [];
      let prevVerb = '';
      let prevCamera = '';

      // Extract main figure from unityMetadata for character lock
      const unityMeta = job.unityMetadata as any;
      const mainFigure = unityMeta?.figure1 || '';

      // Build verbatim character description for consistency across all clips
      let characterDescription = '';
      try {
        // Try to get characterCast from unity package if available
        const pkgId = unityMeta?.packageId;
        if (pkgId) {
          const pkg = await storage.getUnityContentPackage(pkgId);
          const pkgData = pkg?.packageData as any;
          const cast = pkgData?.characterCast?.[0];
          if (cast?.appearance && cast?.wardrobeBase) {
            characterDescription = `${cast.name || mainFigure}, ${cast.appearance}, wearing ${cast.wardrobeBase}`;
            if (cast.vibe) characterDescription += `, ${cast.vibe} demeanor`;
          }
        }
        // Fallback: construct from figure + era + archetype
        if (!characterDescription && mainFigure) {
          characterDescription = `${mainFigure}, historical figure of the ${unityMeta?.era || 'ancient'} era, ${unityMeta?.archetype || 'commanding'} presence`;
        }
      } catch (err) {
        console.warn(`   ⚠️ Could not build character description: ${(err as any).message}`);
      }

      // Energy-to-lighting mapping for Kling
      const KLING_ENERGY_LIGHTING: Record<string, string> = {
        explosive: 'dramatic rim lighting with deep shadows',
        epic: 'golden hour epic light, dust motes swirling',
        dramatic: 'stark side lighting, sharp contrast',
        tension: 'single light source, long shadows',
        intimate: 'soft diffused candlelight, warm glow',
      };

      // ========================================================================
      // GPT CINEMATIC DIRECTOR - Intelligent prompt generation from lyrics
      // ========================================================================
      // Instead of regex-based extraction, GPT reads the lyrics and decides
      // what visuals match each segment's meaning.

      // Extract archetype and era from unityMetadata
      const archetype = unityMeta?.archetype || 'conqueror';
      const era = unityMeta?.era || 'ancient';
      const lyrics = job.scriptContent || '';

      console.log(`🎬 GPT Cinematic Director: Generating ${clipCount} prompts for ${mainFigure}`);
      console.log(`   Era: ${era}, Archetype: ${archetype}`);

      // Detect if this is a beat video (fantasy thumbnail style)
      const isBeatVideo = job.scriptName?.startsWith('Beat Video');
      const styleMode = isBeatVideo ? 'fantasy' : 'grounded';

      if (isBeatVideo) {
        console.log(`   🎨 STYLE: Fantasy Thumbnail Mode (vibrant, eye-catching visuals)`);
      }

      try {
        // Parse music analysis if available (used for BPM, sections, etc.)
        const musicAnalysis = job.musicAnalysis
          ? typeof job.musicAnalysis === 'string'
            ? JSON.parse(job.musicAnalysis)
            : job.musicAnalysis
          : null;

        let gptResults: any[] = [];

        if (!isBeatVideo) {
          // 🎯 COHESIVE GENERATION - Single API call with lyric-action matching
          // Always use cohesive mode for narrative videos (no longer gated on narrative_arc)
          console.log(`   🎯 Using COHESIVE generation (lyric-synced visuals, better continuity)`);

          // Build clip timings from audio analysis
          const clipTimings: number[] = [];
          for (let i = 0; i < clipCount; i++) {
            clipTimings.push(i * clipDuration);
          }

          // Parse lyrics with ACTUAL word-level timestamps from audio transcription
          // This ensures each clip window gets the real lyrics playing at that moment
          const lyricsLines = lyrics.split('\n').filter((l) => l.trim() && !l.startsWith('['));
          const totalDuration = Number(job.audioDuration) || clipCount * clipDuration;
          let lyricsWithTimestamps: { text: string; startTime: number; endTime: number }[] = [];

          // Try to get actual word-level timestamps from audio transcription
          let transcriptionUsed = false;
          try {
            const audioPath = job.musicUrl ? findAudioFile(job.musicUrl) : null;
            if (audioPath) {
              const { transcribeAudioWithTimestamps } = await import('./openai-service');
              const transcription = await transcribeAudioWithTimestamps(audioPath);

              if (transcription.words && transcription.words.length > 5) {
                console.log(
                  `   🎤 Using actual audio transcription (${transcription.words.length} words) for lyric-to-clip sync`,
                );

                // Group transcribed words into lyric line segments by matching against original lyrics
                lyricsWithTimestamps = [];
                const transcribedText = transcription.words
                  .map((w) => w.word.toLowerCase().replace(/[^a-z0-9]/g, ''))
                  .join(' ');

                // For each lyric line, find its approximate position in the transcription
                let wordCursor = 0;
                for (let i = 0; i < lyricsLines.length; i++) {
                  const lineWords = lyricsLines[i].split(/\s+/).filter((w) => w.trim());
                  const lineWordCount = lineWords.length;

                  if (wordCursor < transcription.words.length) {
                    const startWord = transcription.words[Math.min(wordCursor, transcription.words.length - 1)];
                    const endIdx = Math.min(wordCursor + lineWordCount - 1, transcription.words.length - 1);
                    const endWord = transcription.words[endIdx];

                    lyricsWithTimestamps.push({
                      text: lyricsLines[i],
                      startTime: startWord.start,
                      endTime: endWord.end,
                    });

                    wordCursor += lineWordCount;
                  } else {
                    // Remaining lyrics after transcription ends - estimate from last known position
                    const lastEnd =
                      lyricsWithTimestamps.length > 0
                        ? lyricsWithTimestamps[lyricsWithTimestamps.length - 1].endTime
                        : 0;
                    const remainingLines = lyricsLines.length - i;
                    const remainingTime = totalDuration - lastEnd;
                    const timePerLine = remainingTime / remainingLines;

                    lyricsWithTimestamps.push({
                      text: lyricsLines[i],
                      startTime: lastEnd + 0 * timePerLine,
                      endTime: lastEnd + 1 * timePerLine,
                    });
                    wordCursor += lineWordCount;
                  }
                }

                transcriptionUsed = true;
                console.log(`   ✅ Mapped ${lyricsWithTimestamps.length} lyric lines to actual timestamps`);
                console.log(
                  `   📍 First line: "${lyricsLines[0]?.slice(0, 40)}..." @ ${lyricsWithTimestamps[0]?.startTime.toFixed(1)}s`,
                );
              }
            }
          } catch (transcErr: any) {
            console.warn(`   ⚠️ Audio transcription failed, falling back to even distribution: ${transcErr.message}`);
          }

          // Fallback: evenly distribute lyrics across duration
          if (!transcriptionUsed || lyricsWithTimestamps.length === 0) {
            console.log(`   📐 Using even lyric distribution (no transcription available)`);
            lyricsWithTimestamps = lyricsLines.map((text, i) => {
              const startTime = (i / lyricsLines.length) * totalDuration;
              const endTime = ((i + 1) / lyricsLines.length) * totalDuration;
              return { text, startTime, endTime };
            });
          }

          // Build Full Track Context (narrativeArc is optional - cohesive mode works without it)
          const fullTrackContext: FullTrackContext = {
            figure: mainFigure || 'The figure',
            era: era,
            archetype: archetype,
            characterDescription: characterDescription || undefined,
            duration: Number(job.audioDuration) || clipCount * clipDuration,
            bpm: Number(musicAnalysis?.bpm) || 120,
            key: musicAnalysis?.key || null,
            segments:
              musicAnalysis?.structure?.sections?.map((s: any) => ({
                type: s.type || 'verse',
                start: s.start || 0,
                end: s.end || 5,
                energy: s.energy || 0.5,
                label: s.label || null,
              })) || [],
            narrativeArc: musicAnalysis?.metadata?.narrative_arc || null,
            lyrics: lyricsWithTimestamps,
            clipTimings: clipTimings,
          };

          try {
            // Generate ALL prompts cohesively in ONE API call
            const cohesiveSegments: CohesiveVideoSegment[] = await generateCohesivePrompts(fullTrackContext);

            console.log(`   ✅ Cohesive generation: ${cohesiveSegments.length} prompts with continuity notes`);

            // Convert cohesive segments to gptResults format for compatibility
            gptResults = cohesiveSegments.map((seg) => ({
              segment_index: seg.clip_index,
              timestamp: `${seg.timestamp}s`,
              beat_type: seg.section,
              lyric_excerpt: seg.lyric.slice(0, 50),
              prompt: seg.prompt,
              negative_prompt: seg.negative_prompt,
              visual_logic: `${seg.visual_concept} | Continuity: ${seg.continuity_notes}`,
              continuity_notes: seg.continuity_notes,
            }));
          } catch (cohesiveError: any) {
            console.warn(`   ⚠️ Cohesive generation failed, falling back to batch mode: ${cohesiveError.message}`);
            // Fall through to batch generation below
          }
        }

        // Fallback: Use batch generation (old method) if cohesive failed or not available
        if (gptResults.length === 0) {
          console.log(`   📝 Using BATCH generation (15 API calls, legacy mode)`);
          gptResults = await generateAllPrompts(
            mainFigure || 'The figure',
            era,
            archetype,
            lyrics,
            clipCount,
            styleMode,
          );
          console.log(`   ✅ GPT generated ${gptResults.length} lyric-matched prompts`);
        }

        // Add each GPT-generated prompt to our prompts array
        for (let i = 0; i < gptResults.length && i < clipCount; i++) {
          const gptPrompt = gptResults[i];

          // Validate and fix the prompt using Kling validator
          const validated = validateKlingPrompt(gptPrompt.prompt);
          prompts.push(validated.fixed);

          // Log with visual logic showing why GPT chose this visual
          const lyricExcerpt = gptPrompt.lyric_excerpt?.slice(0, 30) || '';
          const continuityNote = gptPrompt.continuity_notes
            ? ` [CONTINUITY: ${gptPrompt.continuity_notes.slice(0, 40)}]`
            : '';
          console.log(
            `   🎬 Clip ${i + 1} [${gptPrompt.beat_type}]: "${lyricExcerpt}..."${continuityNote} → ${validated.fixed.substring(0, 50)}...`,
          );
        }
      } catch (gptError: any) {
        console.error(`   ⚠️ GPT Director failed, falling back to scene-based prompts:`, gptError.message);

        // Fallback: Use legacy scene-based prompts if GPT fails
        for (let i = 0; i < clipCount && i < analysis.scenes.length; i++) {
          const scene = analysis.scenes[i] as any;
          const sceneDesc = scene.description || scene.environment || `dramatic scene ${i + 1}`;

          // Get dynamic verb and camera
          const verb = getKlingVerb(i, prevVerb);
          const sceneEnergy = (scene.energy as number) || 0.5;
          let energyLevel: 'explosive' | 'dramatic' | 'intimate' | 'epic' | 'tension' = 'dramatic';
          if (sceneEnergy >= 0.8) energyLevel = 'explosive';
          else if (sceneEnergy >= 0.6) energyLevel = 'epic';
          else if (sceneEnergy >= 0.4) energyLevel = 'dramatic';
          else if (sceneEnergy >= 0.2) energyLevel = 'tension';
          else energyLevel = 'intimate';

          const camera = getKlingCamera(energyLevel, i, prevCamera);
          const lighting = KLING_ENERGY_LIGHTING[energyLevel] || 'dramatic lighting';
          prevVerb = verb;
          prevCamera = camera;

          // Build simple fallback prompt
          const shortDesc = sceneDesc.split('.')[0].slice(0, 50);
          const prompt = `${mainFigure || 'The figure'} ${verb} in ${shortDesc}. ${camera}, ${lighting}. 9:16. --no text --no watermark --no modern --no blurry`;

          const validated = validateKlingPrompt(prompt);
          prompts.push(validated.fixed);
          console.log(`   🎬 Clip ${i + 1} [fallback]: ${validated.fixed.substring(0, 60)}...`);
        }
      }

      // Fill remaining slots with fallback prompts (all include 9:16)
      const fallbackEnvironments = [
        'ancient battlefield, warrior CHARGES through dust clouds',
        'throne room, ruler RISES from golden throne',
        'desert dunes, traveler STORMS through sandstorm',
        'mountain peak, hero CONQUERS the summit',
        'dark forest, figure EMERGES from mist',
      ];
      let fallbackIndex = 0;
      while (prompts.length < clipCount) {
        const fallback = `${fallbackEnvironments[fallbackIndex % fallbackEnvironments.length]}. Slow motion tracking shot, dramatic rim lighting. 9:16. --no text --no watermark`;
        prompts.push(fallback);
        fallbackIndex++;
      }

      await this.logProgress(job.id, 20, `Kling mode: ${clipCount} prompts prepared, starting video generation`);

      // Save prompts for review (log only - generatedPrompts not in schema)
      const savedPrompts = prompts.map((prompt, i) => ({
        clipIndex: i,
        prompt,
        energy: (analysis.scenes[i] as any)?.energy?.toString() || '0.5',
        camera: getKlingCamera('dramatic', i, null),
      }));
      console.log(`📝 Prepared ${savedPrompts.length} prompts for generation`);

      // Use unified video generator with Kling engine
      const klingGenerator = new UnifiedVideoGenerator('kling');

      // Fetch latest job state for resume support
      const latestJob = await storage.getJob(job.id);
      const existingClips = (latestJob?.completedClips as any[]) || [];
      const currentCompletedClips = [...existingClips];

      if (existingClips.length > 0) {
        console.log(`🔄 [Kling] Resuming from ${existingClips.length}/${clipCount} clips already completed`);
        for (const clip of existingClips) {
          if (clip.videoPath && !clipPaths.includes(clip.videoPath)) {
            clipPaths.push(clip.videoPath);
            totalCost += clip.cost || 0.1;
          }
        }
      }

      const sceneGroupCount = Math.ceil(clipCount / 3);
      console.log(
        `🎬 [Kling 3.0 Multi-Shot] Generating ${sceneGroupCount} scene groups (${clipCount} shots, 3 per group) @ $0.30/group (${targetAspectRatio})...`,
      );

      try {
        const klingResult = await klingGenerator.generateMultiShotBatch(
          prompts,
          {
            duration: 15,
            aspectRatio: targetAspectRatio,
            jobId: job.id,
            klingCreditBudget: 2700,
            klingCreditWarning: 1800,
          },
          3, // shotsPerGeneration
          async (current, total) => {
            const progress = 20 + Math.floor((current / total) * 70);
            await this.logProgress(job.id, progress, `Kling Multi-Shot: Scene group ${current}/${total}`);
          },
          existingClips,
          async (sceneGroupIndex, videoPath, cost, shotCount) => {
            // Save completed scene group immediately for resume
            currentCompletedClips.push({
              sceneGroupIndex,
              clipIndex: sceneGroupIndex,
              videoPath,
              characterName: 'kling',
              cost,
              shotCount,
            });
            await storage.updateJob(job.id, {
              completedClips: currentCompletedClips as any,
            });
          },
        );
        clipPaths = klingResult.clipPaths;
        totalCost = klingResult.totalCost;
        console.log(`💰 Kling multi-shot cost: $${totalCost.toFixed(2)} for ${clipPaths.length} scene groups`);
      } catch (error: any) {
        console.error(`❌ Kling multi-shot generation failed:`, error.message);
        throw error;
      }
    } else if (job.mode === 'veo') {
      // VEO mode deprecated - redirect to Kling
      console.log(`Mode: VEO (deprecated) - Redirecting to Kling engine for ${clipCount} clips`);

      // Step 3: Generate prompts from scenes (10-20%)
      const prompts: string[] = [];

      for (let i = 0; i < clipCount && i < analysis.scenes.length; i++) {
        const scene = analysis.scenes[i] as any;
        const sceneDesc = scene.description || scene.environment || `dramatic cinematic scene ${i + 1}`;
        const moodText = scene.mood ? `, ${scene.mood} mood` : '';
        const visualStyleText = scene.visualStyle ? `, ${scene.visualStyle}` : '';
        const cameraText = scene.cameraMovement ? `, ${scene.cameraMovement}` : '';
        const shotText = scene.shotType ? `, ${scene.shotType}` : '';
        const prompt = `${sceneDesc}${shotText}${cameraText}${moodText}${visualStyleText}, cinematic shot, high quality production. 9:16. --no text --no watermark`;
        prompts.push(prompt);
        console.log(`   📍 Scene ${i + 1}: ${sceneDesc.substring(0, 80)}...`);
      }

      // Fill remaining slots with varied fallback environments
      const fallbackEnvironments = [
        'ancient battlefield at dawn, golden light over distant mountains',
        'moonlit forest clearing, mist rising between ancient trees',
        'coastal cliffs overlooking stormy sea, dramatic clouds',
        'desert oasis at sunset, palm trees silhouetted against orange sky',
        'snow-capped mountain pass, wind whipping through rocky terrain',
      ];
      let fallbackIndex = 0;
      while (prompts.length < clipCount) {
        const fallbackEnv = fallbackEnvironments[fallbackIndex % fallbackEnvironments.length];
        prompts.push(`${fallbackEnv}, cinematic shot, high quality production. 9:16. --no text --no watermark`);
        fallbackIndex++;
      }

      await this.logProgress(job.id, 20, `Kling mode: ${clipCount} prompts prepared, starting video generation`);

      // Use Kling generator instead of VEO
      const klingGenerator = new UnifiedVideoGenerator('kling');

      const latestJob = await storage.getJob(job.id);
      const existingClips = (latestJob?.completedClips as any[]) || [];
      const currentCompletedClips = [...existingClips];

      if (existingClips.length > 0) {
        console.log(`🔄 [Kling] Resuming from ${existingClips.length}/${clipCount} clips already completed`);
        for (const clip of existingClips) {
          if (clip.videoPath && !clipPaths.includes(clip.videoPath)) {
            clipPaths.push(clip.videoPath);
            totalCost += clip.cost || 0.1;
          }
        }
      }

      console.log(
        `🎬 [Kling 3.0 Multi-Shot] Generating ${Math.ceil(clipCount / 3)} scene groups (${clipCount} shots) @ $0.30/group (${targetAspectRatio})...`,
      );

      try {
        const klingResult = await klingGenerator.generateMultiShotBatch(
          prompts,
          {
            duration: 15,
            aspectRatio: targetAspectRatio,
            jobId: job.id,
            klingCreditBudget: 2700,
            klingCreditWarning: 1800,
          },
          3,
          async (current, total) => {
            const progress = 20 + Math.floor((current / total) * 70);
            await this.logProgress(job.id, progress, `Kling Multi-Shot: Scene group ${current}/${total}`);
          },
          existingClips,
          async (sceneGroupIndex, videoPath, cost, shotCount) => {
            currentCompletedClips.push({
              sceneGroupIndex,
              clipIndex: sceneGroupIndex,
              videoPath,
              characterName: 'kling',
              cost,
              shotCount,
            });
            await storage.updateJob(job.id, { completedClips: currentCompletedClips as any });
          },
        );
        clipPaths = klingResult.clipPaths;
        totalCost = klingResult.totalCost;
        console.log(`💰 Kling multi-shot cost: $${totalCost.toFixed(2)} for ${clipPaths.length} scene groups`);
      } catch (error: any) {
        console.error(`❌ Kling multi-shot generation failed:`, error.message);
        throw error;
      }
    } else {
      // Consistent Character Mode - deprecated, use Kling instead
      console.log(`Mode: Consistent Character (deprecated) - Redirecting to Kling engine`);
      console.warn(`⚠️ Consistent character mode is no longer supported. Using Kling instead.`);

      // Build simple prompts from scene analysis
      const prompts: string[] = [];
      for (let i = 0; i < clipCount && i < analysis.scenes.length; i++) {
        const scene = analysis.scenes[i] as any;
        const sceneDesc = scene.description || scene.environment || `dramatic scene ${i + 1}`;
        prompts.push(`${sceneDesc}, cinematic shot, high quality. 9:16. --no text --no watermark`);
      }

      while (prompts.length < clipCount) {
        prompts.push(`epic cinematic scene, dramatic lighting. 9:16. --no text --no watermark`);
      }

      await this.logProgress(job.id, 20, `Kling mode: ${clipCount} prompts prepared`);

      const klingGenerator = new UnifiedVideoGenerator('kling');
      const latestJob = await storage.getJob(job.id);
      const existingClips = (latestJob?.completedClips as any[]) || [];
      const currentCompletedClips = [...existingClips];

      if (existingClips.length > 0) {
        for (const clip of existingClips) {
          if (clip.videoPath && !clipPaths.includes(clip.videoPath)) {
            clipPaths.push(clip.videoPath);
            totalCost += clip.cost || 0.1;
          }
        }
      }

      try {
        const klingResult = await klingGenerator.generateMultiShotBatch(
          prompts,
          {
            duration: 15,
            aspectRatio: targetAspectRatio,
            jobId: job.id,
            klingCreditBudget: 2700,
            klingCreditWarning: 1800,
          },
          3,
          async (current, total) => {
            const progress = 20 + Math.floor((current / total) * 70);
            await this.logProgress(job.id, progress, `Kling Multi-Shot: Scene group ${current}/${total}`);
          },
          existingClips,
          async (sceneGroupIndex, videoPath, cost, shotCount) => {
            currentCompletedClips.push({
              sceneGroupIndex,
              clipIndex: sceneGroupIndex,
              videoPath,
              characterName: 'kling',
              cost,
              shotCount,
            });
            await storage.updateJob(job.id, { completedClips: currentCompletedClips as any });
          },
        );
        clipPaths = klingResult.clipPaths;
        totalCost = klingResult.totalCost;
        console.log(`💰 Kling multi-shot cost: $${totalCost.toFixed(2)} for ${clipPaths.length} scene groups`);
      } catch (error: any) {
        console.error(`❌ Kling multi-shot generation failed:`, error.message);
        throw error;
      }
    }

    // Step 5: Merge clips with FFmpeg (90-95%)
    console.log('Merging clips into final video...');
    await this.logProgress(job.id, 90, `Assembling ${clipPaths.length} clips with FFmpeg`);

    const timestamp = Date.now();
    let outputFilename = `final_${job.mode}_${timestamp}.mp4`;
    const outputPath = join(TempPaths.processing(), outputFilename);

    // Extract music path if music was uploaded
    let musicPath: string | undefined;
    let musicDuration: number | undefined;

    if (job.musicUrl) {
      // Use robust path resolver to handle multiple path formats
      try {
        musicPath = findAudioFile(job.musicUrl);
        if (musicPath) {
          console.log(`🎵 Music file found: ${musicPath}`);

          // Get music duration if available
          if (job.audioDuration) {
            musicDuration = parseFloat(job.audioDuration as any);
            console.log(`🎵 Music duration: ${musicDuration}s`);
          }
        } else {
          console.error(`⚠️  Music file not found: ${job.musicUrl}`);
        }
      } catch (error: any) {
        console.error(`⚠️  Failed to resolve music path: ${error.message}`);
      }
    }

    // SMART CLIP REUSE: When music is longer than generated clips, intelligently reuse clips
    let finalClipPaths = clipPaths;
    let sectionTimings = analysis.scenes?.map((scene) => ({
      startTime: scene.startTime || 0,
      endTime: scene.endTime || 8,
    }));

    if (musicDuration && clipPaths.length > 0) {
      const totalClipDuration = clipPaths.length * 8; // Approximate 8s per clip

      if (musicDuration > totalClipDuration) {
        // Music is longer than our clips - reuse clips with intelligent distribution
        console.log(
          `🔄 Music is ${musicDuration}s but clips only cover ${totalClipDuration}s - enabling smart clip reuse`,
        );

        // Create a reuse pattern that distributes clips across the full duration
        const segmentsNeeded = Math.ceil(musicDuration / 8); // How many 8-second segments we need
        const reusePattern: number[] = [];

        // Create a varied pattern (e.g., 0,1,2,3,4,5,6,7,8,9,0,2,4,6,8,1,3,5,7,9,...)
        // This avoids simple loop repetition and creates variation
        for (let i = 0; i < segmentsNeeded; i++) {
          if (i < clipPaths.length) {
            reusePattern.push(i); // First pass: use all clips once
          } else {
            // Second+ pass: alternate pattern for variety
            const cycle = Math.floor((i - clipPaths.length) / 5);
            const offset = (i - clipPaths.length) % 5;
            const index =
              cycle % 2 === 0
                ? (offset * 2) % clipPaths.length // Even cycles: 0,2,4,6,8
                : (offset * 2 + 1) % clipPaths.length; // Odd cycles: 1,3,5,7,9
            reusePattern.push(index);
          }
        }

        // Build final clip list with reused clips
        finalClipPaths = reusePattern.map((index) => clipPaths[index]);

        // Create section timings with crossfade compensation
        // Multi-shot clips have Kling-native transitions within each clip,
        // so only inter-clip seams need crossfade (reduced from 0.3s to 0.15s)
        const CROSSFADE_DURATION = 0.15;
        sectionTimings = reusePattern.map((_, i) => {
          const isLastSection = i === reusePattern.length - 1;
          const baseStartTime = i * 8;
          const baseEndTime = Math.min((i + 1) * 8, musicDuration);
          const baseDuration = baseEndTime - baseStartTime;

          // Add crossfade compensation: all clips except last need extra duration
          // to account for the overlap that will be consumed by crossfade
          const compensatedDuration = isLastSection
            ? baseDuration // Last clip: no crossfade after it
            : baseDuration + CROSSFADE_DURATION; // Other clips: pre-compensate for crossfade loss

          return {
            startTime: baseStartTime,
            endTime: baseStartTime + compensatedDuration,
          };
        });

        console.log(`   Created reuse pattern: ${segmentsNeeded} segments from ${clipPaths.length} unique clips`);
        console.log(`   Pattern: [${reusePattern.slice(0, 20).join(',')}${reusePattern.length > 20 ? '...' : ''}]`);
      }
    }

    // Log section timings if available
    if (sectionTimings && sectionTimings.length > 0) {
      console.log(`🎯 Section timings: ${sectionTimings.length} sections`);
      sectionTimings.forEach((timing, i) => {
        const duration = timing.endTime - timing.startTime;
        console.log(
          `   Section ${i}: ${timing.startTime.toFixed(2)}s - ${timing.endTime.toFixed(2)}s (${duration.toFixed(2)}s)`,
        );
      });
    }

    // Concatenate clips with optional music overlay and per-clip trimming
    // Use finalClipPaths which includes smart reuse pattern for long music
    // Multi-shot clips have Kling-native transitions, so reduced crossfade for inter-clip seams
    const ffmpegState = await ffmpegProcessor.concatenateVideos(
      finalClipPaths,
      outputPath,
      musicPath,
      musicDuration,
      sectionTimings,
      true, // enableCrossfades
      0.15, // crossfadeDuration (reduced from 0.3 — multi-shot clips have native transitions)
      job.ffmpegState || undefined, // existingState
      job.id, // jobId
      async (completedBatch: number, totalBatches: number) => {
        // Calculate progress: 90% + (batch / total) * 5%
        const batchProgress = 90 + Math.floor(((completedBatch + 1) / totalBatches) * 5);
        await this.logProgress(job.id, batchProgress, `FFmpeg batch ${completedBatch + 1}/${totalBatches} complete`);
        // Note: ffmpegState is updated by concatenateVideos internally, no need to update here
      },
      targetAspectRatio, // Pass aspect ratio for native resolution
    );
    await this.logProgress(job.id, 95, 'FFmpeg assembly complete - extracting video metadata');

    // Step 6: Get video metadata and save final job state (95-100%)
    const metadata = await ffmpegProcessor.getVideoMetadata(outputPath);
    const duration = metadata?.format?.duration
      ? Math.floor(parseFloat(metadata.format.duration))
      : analysis.estimatedDuration || 48;

    // Move video from temp to public/videos for serving
    const { existsSync, mkdirSync, copyFileSync, unlinkSync } = await import('fs');
    const publicVideoDir = join(process.cwd(), 'public', 'videos');
    let finalVideoPath = join(publicVideoDir, outputFilename);

    try {
      // Ensure public/videos directory exists
      if (!existsSync(publicVideoDir)) {
        mkdirSync(publicVideoDir, { recursive: true });
        console.log(`📁 Created directory: ${publicVideoDir}`);
      }

      // Copy video to public folder (copy first, then delete for safety)
      copyFileSync(outputPath, finalVideoPath);
      unlinkSync(outputPath); // Remove from temp after successful copy
      console.log(`📦 Moved video to: ${finalVideoPath}`);
    } catch (moveError) {
      console.error(`⚠️  Failed to move video to public folder:`, moveError);
      finalVideoPath = outputPath; // Use temp path as fallback
    }

    // Apply visual style mutation (Style Bandit params or subtle defaults)
    const styleBanditData = job.unityMetadata?.styleBandit;
    {
      await this.logProgress(job.id, 96, 'Applying visual style polish...');

      try {
        // Use Style Bandit params if available, otherwise apply subtle defaults
        const styleParams = styleBanditData?.params || {
          colorMultiplier: 1.05, // +5% saturation
          contrast: 21, // +3% contrast (centered at 20)
          overlayTexture: null as string | null,
        };

        const styleName = styleBanditData?.styleName || 'subtle polish';
        console.log(`🎨 Applying visual style: "${styleName}"...`);

        const styledFilename = outputFilename.replace('.mp4', '_styled.mp4');
        const styledPath = join(publicVideoDir, styledFilename);

        await ffmpegProcessor.applyVisualStyleMutation(finalVideoPath, styledPath, {
          colorMultiplier: styleParams.colorMultiplier,
          contrast: styleParams.contrast,
          overlayTexture: styleParams.overlayTexture,
        });

        // Update final path and filename
        if (existsSync(styledPath)) {
          // Remove original, use styled
          try {
            unlinkSync(finalVideoPath);
          } catch (e) {}
          finalVideoPath = styledPath;
          outputFilename = styledFilename;
          console.log(`✅ Style mutation applied: ${styleName}`);
        }
      } catch (styleError) {
        console.error('⚠️  Style mutation failed, using original video:', styleError);
        // Continue with original video
      }
    }

    // Apply post-processing (captions + loop) if configured
    const postProcessing = job.musicAnalysis?.postProcessing;
    if (postProcessing && (postProcessing.enableCaptions || postProcessing.enableLoop)) {
      await this.logProgress(job.id, 96, 'Applying post-processing (captions + loop)...');

      try {
        const processedFilename = outputFilename.replace('.mp4', '_processed.mp4');
        const processedPath = join(publicVideoDir, processedFilename);

        // Get lyrics from script content for captions
        const lyrics = postProcessing.enableCaptions ? job.scriptContent : '';
        const bpm = job.musicAnalysis?.bpm || postProcessing.bpm || 130;

        console.log(
          `🎬 Post-processing: captions=${postProcessing.enableCaptions} (${postProcessing.captionStyle}), loop=${postProcessing.enableLoop} (${postProcessing.loopCrossfade}s)`,
        );

        await ffmpegProcessor.postProcess(finalVideoPath, lyrics || '', processedPath, {
          addCaptions: postProcessing.enableCaptions,
          captionStyle: (postProcessing.captionStyle || 'bold') as 'minimal' | 'neon' | 'fire' | 'clean' | 'bold',
          createLoop: postProcessing.enableLoop,
          loopCrossfade: postProcessing.loopCrossfade || 0.5,
          bpm,
        });

        // Update final path and filename
        if (existsSync(processedPath)) {
          // Remove original, use processed
          try {
            unlinkSync(finalVideoPath);
          } catch (e) {}
          finalVideoPath = processedPath;
          outputFilename = processedFilename;
          console.log(`✅ Post-processing complete: ${processedFilename}`);
        }
      } catch (postError) {
        console.error('⚠️  Post-processing failed, using original video:', postError);
        // Continue with original video
      }
    }

    await this.logProgress(job.id, 97, 'Generating video description for uploads...');

    // Generate description for uploads
    let generatedDescription: string | undefined;
    try {
      const { generateVideoDescription } = await import('./openai-service');
      generatedDescription = await generateVideoDescription({
        title: job.scriptName || '',
        scriptContent: job.scriptContent || '',
        duration,
        mode: job.mode,
      });
    } catch (descError) {
      console.error('⚠️  Failed to generate description:', descError);
      // Continue without description - not critical
    }

    await this.logProgress(job.id, 100, `Video generation complete - $${totalCost.toFixed(2)} - ${duration}s`);

    // Save thumbnail to permanent location and set thumbnail_url
    let thumbnailUrl: string | undefined;
    try {
      const thumbnailsDir = join(process.cwd(), 'data', 'thumbnails');
      if (!existsSync(thumbnailsDir)) {
        mkdirSync(thumbnailsDir, { recursive: true });
      }

      // Look for existing thumbnail from FFmpeg processing
      const tempThumbPath = join(TempPaths.processing(), `thumb_${job.id}.jpg`);
      if (existsSync(tempThumbPath)) {
        const thumbnailFilename = `${job.id}_thumbnail.jpg`;
        const permanentThumbPath = join(thumbnailsDir, thumbnailFilename);
        copyFileSync(tempThumbPath, permanentThumbPath);
        thumbnailUrl = `/api/thumbnails/${thumbnailFilename}`;
        console.log(`   🖼️ Thumbnail saved: ${thumbnailFilename}`);
      }
    } catch (thumbErr: any) {
      console.warn(`   ⚠️ Failed to save thumbnail: ${thumbErr.message}`);
    }

    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${outputFilename}`,
      thumbnailUrl,
      cost: totalCost.toFixed(2),
      duration,
      fileSize: metadata?.format?.size ? parseInt(metadata.format.size) : undefined,
      generatedDescription,
    });

    // Clean up temporary FFmpeg artifacts (segments, normalized clips, video without audio)
    await ffmpegProcessor.cleanupArtifacts(ffmpegState);

    console.log(`✅ Job ${job.id} completed successfully!`);
    console.log(`   Video: ${outputFilename}`);
    console.log(`   Cost: $${totalCost.toFixed(2)}`);
    console.log(`   Duration: ${duration}s`);
    if (generatedDescription) {
      console.log(`   📝 Description generated (${generatedDescription.length} chars)\n`);
    }

    // ============================================================================
    // USER COST TRACKING & CHARGING (SaaS Platform)
    // ============================================================================
    if (job.userId) {
      try {
        console.log(`💰 [User Billing] Calculating costs for user ${job.userId}...`);

        // Calculate exact costs from API usage (returns totalCostUSD and userChargeUSD)
        const costBreakdown = await userCostTracker.calculateJobCost(job.id);
        const profit = costBreakdown.userChargeUSD - costBreakdown.totalCostUSD;

        console.log(`   Actual Cost: $${costBreakdown.totalCostUSD.toFixed(2)}`);
        console.log(`   User Charge: $${costBreakdown.userChargeUSD.toFixed(2)}`);
        console.log(`   Profit: $${profit.toFixed(2)}`);

        // Charge user (uses free credit or Stripe)
        const chargeResult = await userCostTracker.chargeUserForJob(job.userId, job.id);

        if (chargeResult.usedFreeCredit) {
          console.log(`   ✅ Used free credit (${chargeResult.creditsRemaining} remaining)`);
        } else if (chargeResult.charged) {
          console.log(`   ✅ Charged $${costBreakdown.userChargeUSD.toFixed(2)} via Stripe`);
        }
      } catch (billingError: any) {
        console.error(`   ⚠️ Billing error: ${billingError.message}`);
        console.error(`   Job completed but user was not charged. Manual intervention required.`);
        // Don't fail the job - the video was successfully generated
        // Admin can manually charge the user later
      }
    }

    // ============================================================================
    // ERROR FIX BANDIT - Track auto-fix success
    // ============================================================================
    if (job.metadata?.autoFixAttempted && job.metadata?.autoFixStrategy) {
      try {
        const { errorFixBandit } = await import('./error-fix-bandit');

        const strategyId = job.metadata.autoFixStrategy as string;
        const fixTimestamp = new Date(job.metadata.autoFixTimestamp as string);
        const fixTime = (Date.now() - fixTimestamp.getTime()) / 1000; // seconds

        console.log(`[Job Worker] 🎉 Job ${job.id} succeeded after auto-fix!`);
        console.log(`   Strategy: ${strategyId}, Fix time: ${fixTime.toFixed(1)}s`);

        // Update bandit with positive reward
        errorFixBandit.updateReward(strategyId, {
          jobSucceeded: true,
          fixTime: fixTime,
          errorResolved: true,
        });
      } catch (trackErr: any) {
        console.error('[Job Worker] Failed to track auto-fix success:', trackErr.message);
      }
    }
    // ============================================================================

    // Track estimate accuracy for learning (NEW - Dec 2025)
    try {
      await costEstimator.trackEstimateAccuracy(job.id, totalCost);
    } catch (err) {
      console.warn(`⚠️  Failed to track estimate accuracy:`, err);
    }

    // ============================================
    // LEVEL 5: SELF-REFLECTION - Analyze failures for learning
    // ============================================
    try {
      const latestJobData = await storage.getJob(job.id);
      const completedClipsData = (latestJobData?.completedClips as any[]) || [];
      const failedClips = completedClipsData.filter((c: any) => c.error);

      if (failedClips.length > 0) {
        console.log(`\n🔍 SELF-REFLECTION: Analyzing ${failedClips.length} failed clips...`);

        // Use packageId for failure analysis (enables learning across related jobs)
        const packageId = (job.unityMetadata as any)?.packageId;
        if (!packageId) {
          console.log(`   ⚠️ No packageId available - skipping failure analysis`);
        } else {
          const clipReports: ClipReport[] = completedClipsData.map((c: any, idx: number) => ({
            clipIndex: c.clipIndex ?? idx,
            passed: !c.error,
            confidence: c.error ? 20 : 85,
            issues: c.error ? [{ type: 'generation', severity: 'major' as const, description: c.error }] : [],
          }));

          const narrativeQuality: NarrativeQuality = {
            ncScore: failedClips.length === 0 ? 85 : Math.max(20, 85 - failedClips.length * 10),
            sfScore: 75,
            combinedScore: failedClips.length === 0 ? 80 : Math.max(25, 80 - failedClips.length * 8),
            tier: failedClips.length === 0 ? 'good' : failedClips.length < 3 ? 'fair' : 'poor',
            passesQualityGate: failedClips.length < 3,
          };

          try {
            await selfReflectionAgent.analyzeFailure(packageId, clipReports, narrativeQuality);
            console.log(`   ✅ Failure analysis complete - adjustments will apply to future jobs`);
          } catch (analysisErr: any) {
            console.warn(`   ⚠️ Failure analysis error (non-blocking): ${analysisErr.message}`);
          }
        }
      }
    } catch (reflectionErr: any) {
      console.warn(`   ⚠️ Post-job reflection failed (non-blocking): ${reflectionErr.message}`);
    }

    // Auto-upload to YouTube if this was an automation job
    const automationSrc = job.unityMetadata?.automationSource;
    if (automationSrc === 'unity_orchestrator' || automationSrc === 'video-scheduler') {
      this.triggerAutoUpload(job, finalVideoPath, generatedDescription).catch((err) => {
        console.error(`⚠️  Auto-upload failed for ${job.id}:`, err);
      });

      // Also trigger Rumble cross-platform streaming (no quota limits!)
      this.triggerRumbleStream(job, finalVideoPath).catch((err) => {
        console.error(`⚠️  Rumble stream failed for ${job.id}:`, err);
      });
    }
  }

  /**
   * Trigger Rumble RTMP streaming for cross-platform distribution
   * Rumble has no daily limits like YouTube quota
   */
  private async triggerRumbleStream(job: Job, videoPath: string): Promise<void> {
    console.log(`\n📡 RUMBLE STREAM: Checking Rumble channels for ${job.scriptName}`);

    try {
      const { rumbleStreamService } = await import('./rumble-stream-service');

      // Get available Rumble channels
      const channels = await rumbleStreamService.getChannels();
      if (!channels || channels.length === 0) {
        console.log(`   ℹ️  No Rumble channels configured - skipping stream`);
        return;
      }

      // Find a channel matching the content niche, or use first available
      const metadata = job.unityMetadata as any;
      const topic = (metadata?.topic || job.scriptName || '').toLowerCase();

      // Try to match niche based on content
      const targetChannel =
        channels.find((c) => {
          const niche = c.niche?.toLowerCase() || '';
          if (topic.includes('battle') || topic.includes('war') || topic.includes('military')) {
            return niche === 'battles';
          }
          if (topic.includes('inventor') || topic.includes('scientist') || topic.includes('discovery')) {
            return niche === 'science';
          }
          if (
            topic.includes('emperor') ||
            topic.includes('king') ||
            topic.includes('leader') ||
            topic.includes('president')
          ) {
            return niche === 'leaders';
          }
          return niche === 'history'; // Default match
        }) || channels[0];

      // Check if channel is already streaming
      const activeStreams = rumbleStreamService.getActiveStreams();
      if (activeStreams.some((s) => s.channelId === targetChannel.id)) {
        console.log(`   ℹ️  Channel "${targetChannel.channelName}" already streaming - skipping`);
        return;
      }

      // Start a 2-hour looped stream
      console.log(`   🚀 Starting stream to "${targetChannel.channelName}" (${targetChannel.niche})`);
      const result = await rumbleStreamService.streamToRumble({
        videoPath,
        channelId: targetChannel.id,
        loopDurationMinutes: 120,
        streamTitle: job.scriptName || '',
      });

      if (result.success) {
        console.log(`   ✅ RUMBLE: Stream started on "${result.channelName || targetChannel.channelName}"!`);
      } else {
        console.log(`   ⚠️  RUMBLE: Failed to start stream - ${result.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(`❌ RUMBLE STREAM error:`, err);
    }
  }

  /**
   * Trigger automatic YouTube upload for automation-generated videos
   */
  private async triggerAutoUpload(job: Job, videoPath: string, description?: string): Promise<void> {
    console.log(`\n🚀 AUTO-UPLOAD: Starting YouTube upload for ${job.scriptName}`);

    try {
      const { getOrchestrator } = await import('./unity-orchestrator');
      const unityOrchestrator = getOrchestrator();
      const { youtubeAnalyticsService } = await import('./youtube-analytics-service');
      const metadata = job.unityMetadata as any;

      // SAFEGUARD: Check if video is complete before uploading
      const expectedClips = metadata?.promptCount || 0;
      const completedClips = (job.completedClips as any[])?.length || 0;

      if (expectedClips > 0 && completedClips < expectedClips * 0.8) {
        // Less than 80% of clips generated - video is truncated
        console.log(
          `⚠️  AUTO-UPLOAD BLOCKED: Only ${completedClips}/${expectedClips} clips generated (truncated video)`,
        );
        console.log(`   ℹ️  Retry the job after topping up Kling credits to complete the video`);
        return;
      }

      // AUDIO VERIFICATION: Check if video has audio and it's synced
      const audioCheck = await ffmpegProcessor.verifyVideoHasAudio(videoPath);
      console.log(`   🔊 Audio check: ${audioCheck.details}`);

      if (!audioCheck.hasAudio) {
        console.log(`❌ AUTO-UPLOAD BLOCKED: No audio in video!`);
        console.log(`   ⚠️  Status: ${audioCheck.syncStatus}`);
        console.log(`   ℹ️  Video was likely rendered without music. Check FFmpeg merge.`);
        return;
      }

      if (audioCheck.syncStatus === 'mismatch') {
        console.log(`⚠️  AUTO-UPLOAD WARNING: Audio/video duration mismatch`);
        console.log(
          `   📊 Audio: ${audioCheck.audioDuration?.toFixed(1)}s, Video: ${audioCheck.videoDuration?.toFixed(1)}s`,
        );
        console.log(`   ℹ️  Continuing anyway - audio exists but may be desynced`);
      }

      // DEDUPLICATION: Check if same figure was uploaded recently (within 7 days)
      const figureName = metadata?.topic || (job.scriptName || '').replace(' - Unity Kling', '').replace(' - Auto', '');
      const DUPLICATE_WINDOW_DAYS = 7;

      try {
        const recentVideos = await youtubeAnalyticsService.getDetailedMetrics();
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

        // Normalize figure name for comparison (lowercase, remove special chars)
        const normalizedFigure = figureName
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .trim();

        // Check for recent uploads with same figure
        const duplicateVideo = recentVideos.find((video) => {
          const videoDate = new Date(video.publishedAt);
          if (videoDate < cutoffDate) return false;

          const normalizedTitle = video.title
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .trim();
          // Check if title contains the figure name
          return (
            normalizedTitle.includes(normalizedFigure) ||
            normalizedFigure.split(' ').every((word: string) => normalizedTitle.includes(word))
          );
        });

        if (duplicateVideo) {
          const daysAgo = Math.floor(
            (now.getTime() - new Date(duplicateVideo.publishedAt).getTime()) / (24 * 60 * 60 * 1000),
          );
          console.log(`⚠️  AUTO-UPLOAD BLOCKED: Duplicate figure detected!`);
          console.log(`   📺 Existing: "${duplicateVideo.title}"`);
          console.log(`   ⏰ Uploaded ${daysAgo} day(s) ago (within ${DUPLICATE_WINDOW_DAYS}-day window)`);
          console.log(`   ℹ️  Will skip upload to prevent duplicate content on channel`);
          return;
        }

        console.log(`   ✅ Deduplication check passed: No recent "${figureName}" uploads found`);
      } catch (dedupErr: any) {
        // Don't block upload if deduplication check fails
        console.log(`   ⚠️  Deduplication check failed (continuing): ${dedupErr.message}`);
      }

      // QUALITY GATE: Run audio & visual analysis before upload
      try {
        const { preUploadQualityGate } = await import('./pre-upload-quality-gate');

        // Get audio path from package data
        const { db } = await import('../db');
        const { unityContentPackages } = await import('@shared/schema');
        const { eq } = await import('drizzle-orm');

        let audioPath: string | undefined;
        if (metadata?.packageId) {
          const [pkg] = await db
            .select()
            .from(unityContentPackages)
            .where(eq(unityContentPackages.id, metadata.packageId))
            .limit(1);

          if (pkg?.audioFilePath) {
            audioPath = pkg.audioFilePath;
          }
        }

        const qualityResult = await preUploadQualityGate.runQualityCheck(
          metadata?.packageId || job.id,
          audioPath,
          videoPath, // Pass video path for frame analysis
          job.id, // Pass job ID to skip visual analysis if historical validation already passed
        );

        if (!qualityResult.passed) {
          console.log(`⚠️  AUTO-UPLOAD BLOCKED: Quality gate failed!`);
          console.log(`   📊 Overall Score: ${qualityResult.overallScore}/100 (${qualityResult.grade})`);
          console.log(`   📛 Reason: ${qualityResult.blockReason}`);
          if (qualityResult.recommendations.length > 0) {
            console.log(`   💡 Recommendations:`);
            qualityResult.recommendations.forEach((r) => console.log(`      - ${r}`));
          }
          console.log(`   ℹ️  Video saved but not uploaded. Improve quality and manually upload.`);
          return;
        }

        console.log(`   ✅ Quality gate passed: ${qualityResult.overallScore}/100 (${qualityResult.grade})`);
        if (qualityResult.audioAnalysis) {
          console.log(
            `      🎵 Audio: Energy ${qualityResult.audioAnalysis.energyScore}, Hook ${qualityResult.audioAnalysis.hookScore}, Survival ${qualityResult.audioAnalysis.hookSurvival.toFixed(0)}%`,
          );
        }
      } catch (qualityErr: any) {
        // Don't block upload if quality check fails - log and continue
        console.log(`   ⚠️  Quality gate check failed (continuing): ${qualityErr.message}`);
      }

      // Build GeneratedVideo object for upload
      // The uploadVideo function expects a 'figure' field for the historical figure name
      // figureName is already defined above for deduplication check

      // Extract best thumbnail from the video for YouTube upload
      let extractedThumbnailPath: string | undefined;
      try {
        const thumbnailOutputPath = join(TempPaths.processing(), `thumb_${job.id}.jpg`);
        extractedThumbnailPath = await ffmpegProcessor.extractBestThumbnail(videoPath, thumbnailOutputPath);
        console.log(`   🖼️ Extracted thumbnail: ${extractedThumbnailPath}`);
      } catch (thumbErr: any) {
        console.log(`   ⚠️ Thumbnail extraction failed (will use YouTube default): ${thumbErr.message}`);
      }

      const generatedVideo = {
        id: job.id,
        packageId: metadata?.packageId || job.id,
        jobId: job.id,
        figure: figureName, // REQUIRED: uploadVideo uses this for metadata generation
        story: job.scriptContent || '',
        videoPath,
        title: job.scriptName,
        topic: figureName,
        hook: metadata?.optimizedHook || metadata?.hook || job.scriptContent || '',
        description,
        thumbnailPrompt: metadata?.thumbnailPrompt,
        thumbnailPath: extractedThumbnailPath,
        viralScore: metadata?.viralScore,
        createdAt: new Date(),
        generatedAt: new Date(),
        youtubeId: undefined,
        uploadedAt: undefined,
      };

      const success = await unityOrchestrator.uploadVideo(generatedVideo);

      if (success) {
        console.log(`✅ AUTO-UPLOAD: ${job.scriptName} uploaded to YouTube!`);
      } else {
        console.log(`⚠️  AUTO-UPLOAD: Upload failed for ${job.scriptName}`);
      }
    } catch (err) {
      console.error(`❌ AUTO-UPLOAD error:`, err);
    }
  }

  /**
   * Auto-upload a completed beat to the correct YouTube channel with scheduled publish.
   * Routes lofi → ChillBeats4Me, trap → Trap Beats INC.
   * Schedules after the last scheduled video on that channel (maintains backlog).
   */
  private async triggerBeatAutoUpload(job: Job, videoPath: string): Promise<void> {
    const meta = job.unityMetadata as any;
    const genre = meta?.genre; // 'lofi' or 'trap'
    if (!genre || (genre !== 'lofi' && genre !== 'trap')) {
      console.log(`⚠️  BEAT AUTO-UPLOAD: Unknown genre "${genre}", skipping`);
      return;
    }

    console.log(`\n🚀 BEAT AUTO-UPLOAD: ${job.scriptName} (${genre}) → YouTube`);

    try {
      const { google } = await import('googleapis');
      const { readFileSync, existsSync: fileExists, createReadStream, statSync } = await import('fs');
      const { join } = await import('path');

      // Load connected channels
      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
      if (!fileExists(channelsFile)) {
        console.log(`⚠️  BEAT AUTO-UPLOAD: No connected channels file, skipping`);
        return;
      }
      const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));

      // Route to correct channel
      const targetTitle = genre === 'lofi' ? 'ChillBeats4Me' : 'Trap Beats INC';
      const channelCreds = channels.find((c: any) => c.title === targetTitle && c.status === 'active');
      if (!channelCreds) {
        console.log(`⚠️  BEAT AUTO-UPLOAD: Channel "${targetTitle}" not connected, skipping`);
        return;
      }

      // Create OAuth client
      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI,
      );
      oauth2Client.setCredentials({
        access_token: channelCreds.accessToken,
        refresh_token: channelCreds.refreshToken,
        expiry_date: channelCreds.expiryDate,
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      // Find next available schedule slot: check existing scheduled/private videos
      let publishAt: Date;
      try {
        const listRes = await youtube.search.list({
          part: ['snippet'],
          channelId: channelCreds.channelId,
          type: ['video'],
          order: 'date',
          maxResults: 10,
        });
        // Find the latest video date and schedule after it
        const latestDate = listRes.data.items?.reduce((latest: Date, item: any) => {
          const d = new Date(item.snippet?.publishedAt || 0);
          return d > latest ? d : latest;
        }, new Date(0)) || new Date();

        // Schedule for the day after the latest video, at 2 PM
        publishAt = new Date(latestDate);
        publishAt.setDate(publishAt.getDate() + 1);
        publishAt.setHours(14, 0, 0, 0);

        // But never schedule in the past
        const tomorrow2pm = new Date();
        tomorrow2pm.setDate(tomorrow2pm.getDate() + 1);
        tomorrow2pm.setHours(14, 0, 0, 0);
        if (publishAt < tomorrow2pm) {
          publishAt = tomorrow2pm;
        }
      } catch {
        // Fallback: schedule for tomorrow at 2 PM
        publishAt = new Date();
        publishAt.setDate(publishAt.getDate() + 1);
        publishAt.setHours(14, 0, 0, 0);
      }

      const title = meta?.youtubeTitle || job.scriptName || `${genre} Beat`;
      const tags = genre === 'lofi'
        ? ['lofi', 'study music', 'chill beats', 'relaxing', 'lofi hip hop', 'beats to study to']
        : ['trap beat', 'type beat', 'instrumental', 'rap beat', 'hip hop', 'producer', 'free beat'];
      const desc = genre === 'lofi'
        ? `${title}\n\n🎵 Lofi beats for studying, relaxing, and chilling\n\n#lofi #studymusic #chillbeats #relaxing`
        : `${title}\n\n🔥 Hard-hitting trap beats for rappers and producers\n\n#trapbeat #typebeat #instrumental #rap`;

      const fileSize = statSync(videoPath).size;
      console.log(`   📤 "${title}" (${(fileSize / 1024 / 1024).toFixed(1)}MB) → ${targetTitle}`);
      console.log(`   ⏰ Scheduled: ${publishAt.toLocaleDateString()} ${publishAt.toLocaleTimeString()}`);

      const response = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: { title, description: desc, tags, categoryId: '10' },
          status: {
            privacyStatus: 'private',
            publishAt: publishAt.toISOString(),
            selfDeclaredMadeForKids: false,
          },
        },
        media: { body: createReadStream(videoPath) },
      });

      const videoId = response.data.id;
      console.log(`   ✅ BEAT AUTO-UPLOAD: https://youtube.com/watch?v=${videoId}`);

      // Save YouTube video ID to job
      await storage.updateJob(job.id, { youtubeVideoId: videoId } as any);
    } catch (err: any) {
      console.error(`❌ BEAT AUTO-UPLOAD error: ${err.message}`);
    }
  }

  /**
   * Weighted character assignment algorithm
   * Assigns characters to scenes based on priority levels with keyword-based forced assignments
   */
  private assignCharactersWithPriority(
    sceneData: Array<{ rawDescription: string; [key: string]: any }>,
    characters: CharacterProfile[],
  ): string[] {
    const totalClips = sceneData.length;

    // Step 1: Parse priorities and calculate quotas for each character
    interface CharacterQuota {
      name: string;
      priority: number;
      quota: number;
      assigned: number;
      character: CharacterProfile;
    }

    // Calculate total weight of all characters
    const totalWeight = characters.reduce((sum, char) => {
      const priority = parseFloat(char.priority || '1.0');
      return sum + priority;
    }, 0);

    // Allocate quotas proportionally based on priority weight
    const characterQuotas: CharacterQuota[] = characters.map((char) => {
      const priority = parseFloat(char.priority || '1.0');
      const quota = Math.round((priority / totalWeight) * totalClips);

      return {
        name: char.name,
        priority,
        quota,
        assigned: 0,
        character: char,
      };
    });

    console.log('\n🎯 Character Quotas (based on priority):');
    for (const cq of characterQuotas) {
      const percentage = Math.round((cq.quota / totalClips) * 100);
      console.log(`   - ${cq.name} (priority ${cq.priority}): target ${cq.quota}/${totalClips} clips (${percentage}%)`);
    }

    // Step 2: Initialize assignments array
    const assignments: (string | null)[] = new Array(totalClips).fill(null);

    // Step 3: First pass - forced assignments based on scene keywords
    const alienFocusKeywords = [
      'alien eyes',
      'alien horde',
      'alien army',
      'aliens lurk',
      'alien watches',
      'alien emerges',
    ];
    const kingFocusKeywords = ['king commands', 'king throne', 'mesmar rules', 'king surveys', 'on his throne'];

    const mercuryAlien = characters.find((c) => c.name.toLowerCase().includes('mercury alien'));
    const mesmar = characters.find(
      (c) => c.name.toLowerCase().includes('king') || c.name.toLowerCase().includes('mesmar'),
    );

    let forcedAssignments = 0;

    for (let i = 0; i < sceneData.length; i++) {
      const sceneText = sceneData[i].rawDescription.toLowerCase();

      // Check for king-focused scenes
      const isKingFocused = kingFocusKeywords.some((keyword) => sceneText.includes(keyword));
      if (isKingFocused && mesmar) {
        assignments[i] = mesmar.name;
        const cq = characterQuotas.find((c) => c.name === mesmar.name);
        if (cq) cq.assigned++;
        forcedAssignments++;
        continue;
      }

      // Check for alien-focused scenes
      const isAlienFocused = alienFocusKeywords.some((keyword) => sceneText.includes(keyword));
      if (isAlienFocused && mercuryAlien) {
        assignments[i] = mercuryAlien.name;
        const cq = characterQuotas.find((c) => c.name === mercuryAlien.name);
        if (cq) cq.assigned++;
        forcedAssignments++;
        continue;
      }

      // Check for explicit character name mentions
      for (const char of characters) {
        const nameLower = char.name.toLowerCase();
        const firstName = nameLower.split(' ')[0];
        const lastName = nameLower.split(' ').pop() || '';

        if (
          sceneText.includes(nameLower) ||
          sceneText.includes(firstName) ||
          (lastName && sceneText.includes(lastName))
        ) {
          assignments[i] = char.name;
          const cq = characterQuotas.find((c) => c.name === char.name);
          if (cq) cq.assigned++;
          forcedAssignments++;
          break;
        }
      }
    }

    console.log(`   🔒 Forced assignments (scene keywords): ${forcedAssignments} clips`);

    // Step 4: Weighted random assignment for remaining clips
    const unassignedCount = assignments.filter((a) => a === null).length;
    console.log(`   🎲 Weighted random assignment: ${unassignedCount} clips remaining`);

    for (let i = 0; i < assignments.length; i++) {
      if (assignments[i] !== null) continue; // Already assigned

      // Build pool of available characters (haven't exceeded quota)
      const available = characterQuotas.filter((cq) => cq.assigned < cq.quota);

      if (available.length === 0) {
        // No characters within quota - assign highest priority character
        const highest = characterQuotas.reduce((max, cq) => (cq.priority > max.priority ? cq : max));
        assignments[i] = highest.name;
        highest.assigned++;
      } else {
        // Weighted random selection based on priority
        // Priority 3 is 6x more likely than priority 0.5 (3 / 0.5 = 6)
        const totalWeight = available.reduce((sum, cq) => sum + cq.priority, 0);
        let random = Math.random() * totalWeight;

        for (const cq of available) {
          random -= cq.priority;
          if (random <= 0) {
            assignments[i] = cq.name;
            cq.assigned++;
            break;
          }
        }

        // Fallback in case of floating point errors
        if (assignments[i] === null && available.length > 0) {
          const fallback = available[0];
          assignments[i] = fallback.name;
          fallback.assigned++;
        }
      }
    }

    // Step 5: Log final distribution
    console.log('\n📊 Character Distribution:');
    for (const cq of characterQuotas) {
      const percentage = Math.round((cq.assigned / totalClips) * 100);
      const targetPercentage = Math.round((cq.quota / totalClips) * 100);
      console.log(
        `   - ${cq.name} (priority ${cq.priority}): ${cq.assigned}/${totalClips} clips (target: ${cq.quota}, ${percentage}% vs ${targetPercentage}%)`,
      );
    }
    console.log('');

    // Ensure all assignments are valid
    return assignments.map((a, i) => {
      if (a === null) {
        // Emergency fallback - should never happen
        console.warn(`⚠️  Scene ${i} has no assignment, using first character`);
        return characters[0].name;
      }
      return a;
    });
  }

  /**
   * Process a Unity VEO job - generates VEO clips from pre-generated prompts
   */
  private async processUnityVeoJob(job: Job, targetAspectRatio: '16:9' | '9:16') {
    const unityMetadata = job.unityMetadata as {
      packageId: string;
      promptCount: number;
      estimatedCost: number;
      includeKaraoke?: boolean;
      karaokeStyle?: 'bounce' | 'glow' | 'fire' | 'neon' | 'minimal';
      enableI2V?: boolean;
      videoEngine?: VideoEngine;
      enableLipSync?: boolean;
      automationSource?: string;
      customVisualPrompt?: string;
      scheduledUploadTime?: string;
      styleBandit?: any;
      optimizedHook?: string;
      thumbnailPrompt?: string;
      isHoldout?: boolean;
      holdoutReason?: string;
      patternEnhancementsApplied?: boolean;
      creativeAnalyticsApplied?: boolean;
      autoFixesApplied?: boolean;
      autoFixModifications?: any;
      consensusStatus?: string;
      consensusScore?: number;
      consensusConflicts?: any;
    } | null;

    // Validate Unity metadata exists before accessing properties
    if (!unityMetadata || !unityMetadata.packageId) {
      throw new Error('Unity job missing unityMetadata or package ID - use mode="kling" for non-Unity jobs');
    }

    const useI2V = unityMetadata.enableI2V === true;
    const videoEngine: VideoEngine = 'kling'; // All video generation now uses Kling (VEO removed Dec 2025)
    const modeLabel = 'Kling AI';

    const estimatedCost = unityMetadata.estimatedCost || unityMetadata.promptCount * KLING_COST_PER_CLIP;

    console.log(`\n🎬 Processing Unity video job for package: ${unityMetadata.packageId}`);
    console.log(`   Video Engine: ${videoEngine}`);
    console.log(`   Mode: ${modeLabel}`);
    console.log(`   Prompts: ${unityMetadata.promptCount}, Est. cost: $${estimatedCost.toFixed(2)}`);

    // Fetch the Unity package
    const pkg = await storage.getUnityContentPackage(unityMetadata.packageId);
    if (!pkg) {
      throw new Error(`Unity package not found: ${unityMetadata.packageId}`);
    }

    const packageData = pkg.packageData;
    if (!packageData?.veoPrompts || packageData.veoPrompts.length === 0) {
      throw new Error('Unity package has no VEO prompts');
    }

    console.log(`   Package: ${pkg.title}`);
    console.log(`   VEO prompts: ${packageData.veoPrompts.length}`);

    // ============================================
    // PIPELINE MONITORING: Start tracking this job
    // ============================================
    await pipelineMonitoringService.startJob(job.id, pkg.title || job.scriptName || '');

    // ============================================
    // CHECK PENDING SUNO TASK: Wait for audio before proceeding
    // ============================================
    if (!pkg.audioFilePath) {
      console.log(`\n🎵 SUNO CHECK: No audio file path on package, checking for pending task...`);

      const sunoTask = await sunoTaskService.getTaskByPackageId(unityMetadata.packageId);

      if (sunoTask) {
        console.log(`   📋 Found Suno task: ${sunoTask.taskId} (status: ${sunoTask.status})`);

        if (sunoTask.status === 'pending' || sunoTask.status === 'polling' || sunoTask.status === 'downloading') {
          console.log(`   ⏳ Suno task still in progress (${sunoTask.status}), waiting for completion...`);
          await this.logProgress(job.id, 3, `Waiting for music generation to complete...`);

          // Try to actively poll, but if another process owns it, wait via DB polling
          let completedTask = await sunoTaskService.pollTask(sunoTask.taskId);
          if (!completedTask?.audioFilePath && completedTask?.status !== 'completed') {
            console.log(`   ⏳ Another process is polling, waiting via DB check...`);
            completedTask = await sunoTaskService.awaitTaskCompletion(unityMetadata.packageId);
          }

          if (completedTask && completedTask.status === 'completed' && completedTask.audioFilePath) {
            console.log(`   ✅ Suno task completed: ${completedTask.audioFilePath}`);

            // Update the package with the audio file path
            const musicUrl = `/api/suno-audio/${completedTask.audioFilePath.split('/').pop()}`;
            await storage.updateUnityContentPackage(unityMetadata.packageId, {
              audioFilePath: completedTask.audioFilePath,
              packageData: {
                ...packageData,
                audioAnalysis: completedTask.audioAnalysis,
                acousticFingerprint: completedTask.acousticFingerprint,
              } as any,
            });

            // Update job with music URL
            await db
              .update(jobs)
              .set({
                musicUrl: musicUrl,
                audioDuration: completedTask.duration?.toString() || null,
              })
              .where(eq(jobs.id, job.id));

            console.log(`   ✅ Package and job updated with audio: ${musicUrl}`);
          } else {
            console.warn(`   ⚠️ Suno task failed or timed out, proceeding without audio`);
          }
        } else if (sunoTask.status === 'completed' && sunoTask.audioFilePath) {
          console.log(`   ✅ Suno task already completed, updating package...`);

          // Update the package with the audio file path if not set
          const musicUrl = `/api/suno-audio/${sunoTask.audioFilePath.split('/').pop()}`;
          await storage.updateUnityContentPackage(unityMetadata.packageId, {
            audioFilePath: sunoTask.audioFilePath,
            packageData: {
              ...packageData,
              audioAnalysis: sunoTask.audioAnalysis,
              acousticFingerprint: sunoTask.acousticFingerprint,
            } as any,
          });

          await db
            .update(jobs)
            .set({
              musicUrl: musicUrl,
              audioDuration: sunoTask.duration?.toString() || null,
            })
            .where(eq(jobs.id, job.id));

          console.log(`   ✅ Package and job updated with existing audio: ${musicUrl}`);
        } else if (sunoTask.status === 'failed') {
          console.warn(`   ⚠️ Suno task previously failed: ${sunoTask.errorMessage}`);
        }
      } else {
        // AUDIO-FIRST WORKFLOW: No Suno task exists - check if lyrics exist to create one
        console.log(`   ℹ️ No Suno task found for this package`);

        const lyrics = (packageData as any).lyrics?.raw;
        if (lyrics && sunoApi.isConfigured()) {
          console.log(`   🎵 AUDIO-FIRST: Found lyrics, creating Suno task before video generation...`);
          await this.logProgress(job.id, 3, `Generating music before video clips...`);

          // Get style from package
          let styleForSuno =
            (packageData as any).sunoStyleTags?.fullStyleString ||
            'Hip-hop, observational rap, comedic storytelling, 95 BPM';
          if (styleForSuno.length > 200) {
            styleForSuno = styleForSuno.substring(0, 200).trim();
          }

          // CRITICAL FIX: Trim lyrics to target 180s using smart duration-based trimming
          // Uses 14 chars/second rule to ensure Suno generates ~3:00 songs
          const { trimLyricsForDuration } = await import('./suno-api');
          const trimResult = trimLyricsForDuration(lyrics, 180); // Target 3:00 max
          const trimmedLyrics = trimResult.lyrics;
          console.log(
            `   ✂️ Lyrics trimmed: ${lyrics.length} → ${trimmedLyrics.length} chars (est: ${trimResult.estimatedDuration}s)`,
          );

          // Suno API has 80-character title limit - truncate if needed
          const rawTitle = pkg.title || 'Unity Video';
          const musicTitle = rawTitle.length > 80 ? rawTitle.substring(0, 77) + '...' : rawTitle;

          try {
            // Generate Suno song
            const sunoResult = await sunoApi.generateSong({
              lyrics: trimmedLyrics,
              style: styleForSuno,
              title: musicTitle,
              model: 'V5',
              targetDuration: 300, // Pass 300s (5 min) target for duration hints
            });

            console.log(`   ✅ Suno task created: ${sunoResult.taskId}`);

            // Create task record for tracking
            await sunoTaskService.createTask({
              taskId: sunoResult.taskId,
              packageId: unityMetadata.packageId,
              status: 'pending',
              lyrics: trimmedLyrics, // Use trimmed lyrics
              style: styleForSuno,
            } as any);

            // Wait for completion (30 minute max)
            console.log(`   ⏳ Waiting for Suno music to complete...`);
            await this.logProgress(job.id, 4, `Waiting for music generation (may take 2-5 minutes)...`);

            const completedTask = await sunoTaskService.awaitTaskCompletion(unityMetadata.packageId);

            if (completedTask && completedTask.status === 'completed' && completedTask.audioFilePath) {
              console.log(`   ✅ Suno music ready: ${completedTask.audioFilePath}`);

              // Update package with audio
              const musicUrl = `/api/suno-audio/${completedTask.audioFilePath.split('/').pop()}`;
              await storage.updateUnityContentPackage(unityMetadata.packageId, {
                audioFilePath: completedTask.audioFilePath,
                packageData: {
                  ...packageData,
                  audioAnalysis: completedTask.audioAnalysis,
                  acousticFingerprint: completedTask.acousticFingerprint,
                } as any,
              });

              await db
                .update(jobs)
                .set({
                  musicUrl: musicUrl,
                  audioDuration: completedTask.duration?.toString() || null,
                })
                .where(eq(jobs.id, job.id));

              // CRITICAL: Re-fetch job to get updated audioDuration for clip calculation
              const refreshedJobs = await db.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
              if (refreshedJobs[0]) {
                Object.assign(job, refreshedJobs[0]);
                console.log(`   🔄 Job refreshed with audioDuration: ${job.audioDuration}s`);
              }

              console.log(`   ✅ Audio attached to package and job`);
            } else {
              // RESILIENT: Don't kill job - continue with fallback
              console.warn(`   ⚠️ Suno music generation failed - attempting fallback strategies...`);

              // Capture error for auto-fix
              const { errorMonitor } = await import('./error-monitor');
              await errorMonitor.captureError(new Error('Suno music generation failed or timed out'), {
                service: 'job-worker',
                operation: 'suno_generation',
                jobId: job.id,
                packageId: unityMetadata.packageId,
              });

              // Log failure - early fail check after Suno logic block will catch this and abort
              console.warn(
                `   ⚠️ FALLBACK: Music generation failed. Early-fail check will abort if audio is required.`,
              );
            }
          } catch (sunoErr: any) {
            console.error(`   ❌ AUDIO-FIRST FAILED: ${sunoErr.message}`);

            // RESILIENT: Capture error and continue instead of throwing
            const { errorMonitor } = await import('./error-monitor');
            await errorMonitor.captureError(sunoErr, {
              service: 'job-worker',
              operation: 'suno_generation',
              jobId: job.id,
              packageId: unityMetadata.packageId,
            });

            console.warn(`   ⚠️ RESILIENT MODE: Continuing without audio. Generation will proceed with silent videos.`);
          }
        } else if (!lyrics) {
          console.log(`   ⚠️ Package has no lyrics - attempting to regenerate...`);

          // AUTO-HEAL: Regenerate lyrics instead of giving up
          try {
            const { generateViralLyrics } = await import('./viral-lyrics-engine');
            const figureName =
              pkg.topic || (packageData as any).metadata?.topic || job.scriptName || 'Historical Figure';
            const era = (packageData as any).metadata?.era || (unityMetadata as any).era || 'Historical';
            const archetype =
              (packageData as any).metadata?.archetype || (unityMetadata as any).archetype || 'historical';
            const keyFacts = [(packageData as any).metadata?.hook || job.scriptContent || pkg.topic].filter(Boolean);

            console.log(`   🎤 Regenerating lyrics for: ${figureName} (${era}, ${archetype})`);
            await this.logProgress(job.id, 2, `Regenerating lyrics for ${figureName}...`);

            const lyricsResult = await generateViralLyrics(figureName, era, archetype, keyFacts, 'triumphant');
            const regeneratedLyrics = lyricsResult.lyrics;
            console.log(`   ✅ Lyrics regenerated (${regeneratedLyrics.length} chars)`);

            // Save lyrics back to package
            const updatedPackageData = { ...packageData, lyrics: { raw: regeneratedLyrics }, lyricsFailed: false };
            if (lyricsResult.sunoTags) {
              (updatedPackageData as any).sunoStyleTags = { fullStyleString: lyricsResult.sunoTags };
            }
            await storage.updateUnityContentPackage(unityMetadata.packageId, {
              packageData: updatedPackageData as any,
            });
            console.log(`   💾 Lyrics saved to package`);

            // Now generate music with the new lyrics
            if (sunoApi.isConfigured()) {
              console.log(`   🎵 Generating music with regenerated lyrics...`);
              await this.logProgress(job.id, 3, `Generating music for ${figureName}...`);

              let styleForSuno =
                lyricsResult.sunoTags ||
                (updatedPackageData as any).sunoStyleTags?.fullStyleString ||
                'Hip-hop, observational rap, comedic storytelling, 95 BPM';
              if (styleForSuno.length > 200) {
                styleForSuno = styleForSuno.substring(0, 200).trim();
              }

              const { trimLyricsForDuration } = await import('./suno-api');
              const trimResult = trimLyricsForDuration(regeneratedLyrics, 180);
              const trimmedLyrics = trimResult.lyrics;
              console.log(
                `   ✂️ Lyrics trimmed: ${regeneratedLyrics.length} → ${trimmedLyrics.length} chars (est: ${trimResult.estimatedDuration}s)`,
              );

              const rawTitle = pkg.title || 'Unity Video';
              const musicTitle = rawTitle.length > 80 ? rawTitle.substring(0, 77) + '...' : rawTitle;

              const sunoResult = await sunoApi.generateSong({
                lyrics: trimmedLyrics,
                style: styleForSuno,
                title: musicTitle,
                instrumental: false,
                model: 'V4',
              });

              if (sunoResult?.taskId) {
                const { sunoTaskService } = await import('./suno-task-service');
                await sunoTaskService.createTask({
                  taskId: sunoResult.taskId,
                  packageId: unityMetadata.packageId,
                  jobId: job.id,
                  lyrics: trimmedLyrics,
                  style: styleForSuno,
                  title: musicTitle,
                } as any);
                console.log(`   🎵 Suno task created: ${sunoResult.taskId}`);

                // Poll and wait for Suno completion
                const completedTask = await sunoTaskService.pollTask(sunoResult.taskId);
                if (completedTask?.audioFilePath) {
                  const musicUrl = `/api/suno-audio/${completedTask.audioFilePath.split('/').pop()}`;
                  await storage.updateUnityContentPackage(unityMetadata.packageId, {
                    audioFilePath: completedTask.audioFilePath,
                  });
                  await db
                    .update(jobs)
                    .set({ musicUrl, audioDuration: completedTask.duration?.toString() || null })
                    .where(eq(jobs.id, job.id));
                  console.log(`   ✅ Music generated and saved: ${musicUrl}`);
                } else {
                  console.warn(`   ⚠️ Suno task did not produce audio, proceeding without music`);
                }
              }
            }
          } catch (regenErr: any) {
            console.error(`   ❌ Lyrics regeneration failed: ${regenErr.message}`);
            const { errorMonitor } = await import('./error-monitor');
            await errorMonitor.captureError(regenErr, {
              service: 'job-worker',
              operation: 'lyrics_regeneration',
              jobId: job.id,
              packageId: unityMetadata.packageId,
            });
            console.warn(
              `   ⚠️ RESILIENT MODE: No lyrics available after regeneration attempt. Proceeding without music.`,
            );
          }
        } else {
          console.warn(`   ⚠️ Suno API not configured - proceeding without audio`);
        }
      }
    } else {
      console.log(`   🎵 Audio file already present: ${pkg.audioFilePath}`);
    }

    // Track whether we actually have a music track for this job
    // Re-fetch package to check latest audioFilePath after all Suno logic above
    const refreshedPkg = await storage.getUnityContentPackage(unityMetadata.packageId);
    const hasMusicTrack = !!refreshedPkg?.audioFilePath;

    // PIPELINE MONITORING: Music generation status - 'success' only if we actually have music
    await pipelineMonitoringService.updateStep(job.id, 'music_generation', hasMusicTrack ? 'success' : 'skipped');

    if (!hasMusicTrack) {
      // EARLY FAIL: Don't waste $3-5 on Kling clips for a video that QA will block as silent
      const isUnityKling = job.mode === 'unity_kling';
      if (isUnityKling) {
        console.error(
          `   ❌ EARLY FAIL: No music track for unity_kling job — aborting before clip generation to save Kling credits`,
        );
        await storage.updateJob(job.id, {
          status: 'failed',
          errorMessage:
            'Music generation failed — no audio track available. Job stopped early to avoid wasting Kling credits on silent video.',
        });
        await pipelineMonitoringService.updateStep(job.id, 'music_generation', 'failed');
        return;
      }
      console.warn(`   ⚠️ MUSIC STATUS: No music track obtained for this job`);
      console.warn(`   ⚠️ Pipeline will continue but video may be silent`);
    }

    await this.logProgress(job.id, 5, `Loading Unity package: ${pkg.title}`);

    // ============================================
    // LEVEL 5: SELF-REFLECTION - Apply learned adjustments before job starts
    // ============================================
    let appliedAdjustments: Array<{ adjustmentId: string; type: string; description: string }> = [];
    try {
      console.log(`\n🎓 SELF-REFLECTION: Applying learned adjustments...`);
      const modifiedContext = await selfReflectionAgent.applyLearnedAdjustments({
        packageId: unityMetadata.packageId,
        topic: pkg.title,
        era: (packageData as any).deepResearch?.basicInfo?.era || '',
        style: (packageData as any).style || '',
      });
      appliedAdjustments = modifiedContext.appliedAdjustments;
      if (appliedAdjustments.length > 0) {
        console.log(`   ✅ Applied ${appliedAdjustments.length} learned adjustments`);
        appliedAdjustments.forEach((adj) => {
          console.log(`      - ${adj.type}: ${adj.description.substring(0, 60)}...`);
        });
      } else {
        console.log(`   ℹ️ No high-confidence adjustments available yet`);
      }
    } catch (reflectionErr: any) {
      console.warn(`   ⚠️ Self-reflection failed (non-blocking): ${reflectionErr.message}`);
    }

    // ============================================
    // VECTOR MEMORY: Query similar high-performers for insight
    // ============================================
    try {
      console.log(`\n🧠 VECTOR MEMORY: Querying winning patterns...`);
      const winningPatterns = await vectorMemoryService.getWinningPatterns();

      if (winningPatterns.length > 0) {
        console.log(`   ✅ Found ${winningPatterns.length} winning patterns:`);
        winningPatterns.slice(0, 3).forEach((pattern, i) => {
          console.log(
            `      ${i + 1}. ${pattern.pattern}: ${pattern.avgRetention.toFixed(1)}% retention, ${pattern.avgCtr.toFixed(2)}% CTR (${pattern.sampleCount} samples)`,
          );
          if (pattern.characteristics.acoustic) {
            console.log(
              `         🎵 Avg BPM: ${pattern.characteristics.acoustic.avgBpm}, Energy curve: ${pattern.characteristics.acoustic.commonEnergyCurve}`,
            );
          }
        });
      } else {
        console.log(`   ℹ️ No winning patterns yet - generate more videos to build memory`);
      }
    } catch (vectorErr: any) {
      console.warn(`   ⚠️ Vector memory query failed (non-blocking): ${vectorErr.message}`);
    }

    // ============================================
    // AUTO-TRANSCRIPTION: Run Whisper if karaoke enabled but no transcription
    // ============================================
    let packageDataWithTranscription = packageData as any;

    if (unityMetadata.includeKaraoke && !(packageData as any).whisperTranscription) {
      console.log(`\n🎤 AUTO-TRANSCRIPTION: Karaoke enabled but no transcription found`);

      // Check if audio file exists
      const audioPath = pkg.audioFilePath;
      if (audioPath) {
        try {
          await this.logProgress(job.id, 6, `Auto-transcribing audio for karaoke...`);

          // Resolve the full file path
          let fullAudioPath: string;
          if (audioPath.startsWith('/attached_assets/')) {
            fullAudioPath = join(process.cwd(), audioPath.substring(1));
          } else if (audioPath.startsWith('/api/music/')) {
            fullAudioPath = join(process.cwd(), 'data', 'music', audioPath.replace('/api/music/', ''));
          } else {
            fullAudioPath = join(process.cwd(), audioPath);
          }

          if (existsSync(fullAudioPath)) {
            console.log(`   📁 Audio file: ${fullAudioPath}`);

            // Import and run Whisper transcription
            const { transcribeAudioWithTimestamps } = await import('./openai-service');
            const transcription = await transcribeAudioWithTimestamps(fullAudioPath);

            if (transcription.words && transcription.words.length > 0) {
              console.log(`   ✅ Auto-transcribed ${transcription.words.length} words`);

              // Update package data with transcription
              packageDataWithTranscription = {
                ...packageData,
                whisperTranscription: {
                  text: transcription.text,
                  words: transcription.words,
                  wordCount: transcription.words.length,
                  duration: transcription.duration,
                  alignedWithLyrics: false,
                },
              };

              // Save to database
              await storage.updateUnityContentPackage(unityMetadata.packageId, {
                packageData: packageDataWithTranscription,
              });

              console.log(`   💾 Transcription saved to package`);
            } else {
              console.warn(`   ⚠️ Whisper returned no words - karaoke disabled for this job`);
            }
          } else {
            console.warn(`   ⚠️ Audio file not found: ${fullAudioPath} - skipping auto-transcription`);
          }
        } catch (transcribeErr: any) {
          console.error(`   ❌ Auto-transcription failed: ${transcribeErr.message}`);
          console.log(`   ℹ️ Continuing without karaoke subtitles`);
        }
      } else {
        console.warn(`   ⚠️ No audio file path in package - skipping auto-transcription`);
      }
    }

    // ============================================
    // ANCHOR IMAGE GENERATION: Create character reference images for consistency
    // ============================================
    let anchorImages: AnchorImage[] = [];

    // Check if package already has anchor images (dynamic field added at runtime)
    const existingAnchors = (packageData as any).anchorImages as AnchorImage[] | undefined;
    if (existingAnchors && existingAnchors.length > 0) {
      // Verify files still exist
      const validAnchors = existingAnchors.filter((a) => existsSync(a.imagePath));
      if (validAnchors.length > 0) {
        console.log(`   🎭 Reusing ${validAnchors.length} existing anchor images`);
        anchorImages = validAnchors;
      }
    }

    // Generate new anchor images if needed
    if (anchorImages.length === 0 && packageData.characterCast && packageData.characterCast.length > 0) {
      await this.logProgress(
        job.id,
        7,
        `Generating anchor images for ${packageData.characterCast.length} character(s)`,
      );

      anchorImages = await this.generateAnchorImages(packageData.characterCast, unityMetadata.packageId);

      // Save anchor images to package for reuse
      if (anchorImages.length > 0) {
        const updatedPackageData = {
          ...packageData,
          anchorImages: anchorImages,
        };
        await storage.updateUnityContentPackage(unityMetadata.packageId, {
          packageData: updatedPackageData as any,
        });
      }
    }

    // Build reference images array for VEO (up to 3)
    const veoReferenceImages = anchorImages.slice(0, 3).map((a) => ({
      url: a.url,
      filename: a.imagePath.split('/').pop() || 'anchor.png',
      mimeType: a.mimeType,
    }));

    if (veoReferenceImages.length > 0) {
      console.log(`   🎯 VEO will use ${veoReferenceImages.length} anchor image(s) for character consistency`);
    }

    // Each veoPrompt is already ONE clip (clipNumber = unique clip index)
    // veoPrompts array length = total clips to generate
    const totalClips = packageData.veoPrompts.length;

    // RESUME LOGIC: Fetch latest job state to get completedClips
    const latestJob = await storage.getJob(job.id);
    const savedCompletedClips = (latestJob?.completedClips as any[]) || [];

    // ALSO check package's existing generatedClips (from previous completed jobs)
    const existingPackageClips = ((packageData as any).generatedClips as any[]) || [];

    // Check if saved clips were generated with a different video engine
    // If so, we need to regenerate with the new engine
    // SMART DETECTION: If lastVideoEngine is not set, detect from clip filenames
    let savedClipsEngine = (packageData as any).lastVideoEngine;

    if (!savedClipsEngine) {
      // Try to detect engine from saved clip filenames
      const sampleClip = savedCompletedClips[0] || existingPackageClips[0];
      if (sampleClip?.videoPath?.includes('kling_') || sampleClip?.localPath?.includes('kling_')) {
        savedClipsEngine = 'kling';
      } else if (sampleClip?.videoPath?.includes('veo_') || sampleClip?.localPath?.includes('veo_')) {
        savedClipsEngine = 'veo3';
      } else {
        // No saved clips or can't detect - assume matches requested engine (no mismatch)
        savedClipsEngine = videoEngine;
      }
    }

    const engineMismatch = savedClipsEngine !== videoEngine;

    if (engineMismatch && existingPackageClips.length > 0) {
      console.log(`   ⚠️  Engine mismatch detected: saved clips used ${savedClipsEngine}, job requests ${videoEngine}`);
      console.log(`   🔄 Will regenerate all clips with ${videoEngine.toUpperCase()}`);
    }

    // Only use existing clips if engine matches
    // Engine mismatch means we need to regenerate ALL clips with the new engine
    const existingClipFiles = engineMismatch
      ? []
      : existingPackageClips.filter((c: any) => !c.error && c.localPath && existsSync(c.localPath));

    // CRITICAL: Also clear job's saved clips on engine mismatch
    const validSavedClips = engineMismatch ? [] : savedCompletedClips;

    // Merge: prefer job's saved clips, fallback to package's existing clips
    const allSavedClips =
      validSavedClips.length > 0
        ? validSavedClips
        : existingClipFiles.map((c: any) => ({
            clipIndex: c.clipIndex,
            videoPath: c.localPath,
            characterName: c.section,
            cost: c.cost,
          }));

    const savedClipIndices = new Set(allSavedClips.map((c: any) => c.clipIndex));

    if (allSavedClips.length > 0) {
      console.log(
        `   🔄 RESUMING: Found ${allSavedClips.length} saved clips (job: ${savedCompletedClips.length}, package: ${existingClipFiles.length}), will skip regeneration`,
      );
    }

    console.log(`   Total clips to generate: ${totalClips} (base prompts)`);
    await this.logProgress(job.id, 10, `Starting video generation: ${totalClips} clips`);

    // Helper to convert local path to web-accessible URL
    const toVideoUrl = (localPath: string): string => {
      const filename = basename(localPath);
      return `/api/videos/${filename}`;
    };

    // Build list of pending clips (skip already saved ones)
    const generatedClips: any[] = [];
    let totalCost = 0;
    let clipsCompleted = 0;
    let clipsReused = 0;

    // First pass: restore all saved clips
    for (let clipIdx = 0; clipIdx < packageData.veoPrompts.length; clipIdx++) {
      const veoPrompt = packageData.veoPrompts[clipIdx] as any;
      const sectionName = veoPrompt.sectionName || veoPrompt.section || `Clip ${clipIdx + 1}`;
      const promptText = veoPrompt.fullPrompt || veoPrompt.prompt || '';

      if (savedClipIndices.has(clipIdx)) {
        const savedClip = allSavedClips.find((c: any) => c.clipIndex === clipIdx);
        if (savedClip && savedClip.videoPath && existsSync(savedClip.videoPath)) {
          console.log(`📹 Clip ${clipIdx + 1}/${totalClips}: ${sectionName} [REUSING SAVED]`);

          generatedClips.push({
            section: sectionName,
            clipNumber: veoPrompt.clipNumber || clipIdx + 1,
            clipIndex: clipIdx,
            videoUrl: toVideoUrl(savedClip.videoPath),
            localPath: savedClip.videoPath,
            cost: savedClip.cost || 0,
            prompt: promptText.substring(0, 200),
            reused: true,
          });

          totalCost += savedClip.cost || 0;
          clipsCompleted++;
          clipsReused++;
        }
      }
    }

    if (clipsReused > 0) {
      const progress = 10 + Math.floor((clipsCompleted / totalClips) * 80);
      await this.logProgress(job.id, progress, `Restored ${clipsReused} saved clips`);
    }

    // Build list of clips that need generation
    let pendingClips = packageData.veoPrompts
      .map((veoPrompt: any, clipIdx: number) => ({ veoPrompt, clipIdx }))
      .filter(({ clipIdx }) => !generatedClips.some((c) => c.clipIndex === clipIdx));

    // ============================================
    // KLING CLIP EXPANSION: Calculate clips needed to fill song duration
    // Kling 3.0 uses 15-second clips (fewer clips needed vs 5s or 8s)
    // Each clip gets a UNIQUE prompt with varied camera/action/lighting
    // ============================================
    let actualTotalClips = totalClips;

    // Also check if we have saved clips beyond the base prompt count (from previous expansion)
    const hasSavedExpandedClips = allSavedClips.some((c: any) => c.clipIndex >= packageData.veoPrompts.length);

    // Extract character/era info for prompt generation and era enforcement on Kling clips
    const packageCharacters = packageData.characterCast || [];
    const figureName =
      (packageData as any).research?.name ||
      (packageData as any).figure ||
      packageCharacters[0]?.name ||
      (packageData as any).deepResearch?.basicInfo?.name ||
      packageData.metadata?.topic ||
      'historical figure';
    const era =
      (packageData as any).research?.era ||
      (packageData as any).deepResearch?.basicInfo?.era ||
      packageData.metadata?.setting ||
      'ancient times';
    const archetype = packageCharacters[0]?.vibe || 'conqueror';

    if (videoEngine === 'kling' && (pendingClips.length > 0 || hasSavedExpandedClips)) {
      const KLING_CLIP_DURATION = 15;
      const MAX_KLING_DURATION = 180; // Cap at 3 minutes

      // Get song duration from multiple sources (in priority order)
      // CRITICAL FIX: Use ACTUAL Suno duration from job.audioDuration first
      const timing = packageData.timing as any;
      const whisperData = (packageDataWithTranscription as any)?.whisperTranscription;
      const audioAnalysisData = (packageData as any)?.audioAnalysis;

      let rawDuration = 120; // fallback

      // Priority 1: Use actual Suno duration from job (set when Suno completes)
      if (job.audioDuration) {
        const audioDur = typeof job.audioDuration === 'string' ? parseFloat(job.audioDuration) : job.audioDuration;
        if (!isNaN(audioDur) && audioDur > 0) {
          rawDuration = audioDur;
          console.log(`   🎵 Using ACTUAL Suno duration from job: ${rawDuration.toFixed(1)}s`);
        }
      }

      // Priority 2: Try to get duration from audio file directly with ffprobe
      if (rawDuration === 120 && pkg.audioFilePath) {
        try {
          const audioPath = pkg.audioFilePath;
          let fullAudioPath: string;
          if (audioPath.startsWith('/attached_assets/')) {
            fullAudioPath = join(process.cwd(), audioPath.substring(1));
          } else if (audioPath.startsWith('/api/music/')) {
            fullAudioPath = join(process.cwd(), 'data', 'music', audioPath.replace('/api/music/', ''));
          } else {
            fullAudioPath = join(process.cwd(), audioPath);
          }

          if (existsSync(fullAudioPath)) {
            const { stdout: ffprobeResult } = await execAsync(
              `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fullAudioPath}"`,
              { timeout: 5000 },
            );
            rawDuration = parseFloat(ffprobeResult.trim()) || 120;
            console.log(`   📏 Got audio duration from file: ${rawDuration.toFixed(1)}s`);
          }
        } catch (e: any) {
          console.log(`   ⚠️ Could not get audio duration from file: ${e.message}`);
        }
      }

      // Priority 3: Fall back to estimated/analyzed durations (least reliable)
      if (rawDuration === 120) {
        rawDuration =
          timing?.estimatedDurationSeconds ||
          timing?.totalDurationSeconds ||
          whisperData?.duration ||
          audioAnalysisData?.duration ||
          120;
        if (rawDuration !== 120) {
          console.log(`   ⚠️ Using estimated duration (no actual): ${rawDuration.toFixed(1)}s`);
        }
      }

      const songDuration = Math.min(rawDuration, MAX_KLING_DURATION);

      // Calculate how many 15-second clips we need (Kling 3.0)
      const klingClipsNeeded = Math.ceil(songDuration / KLING_CLIP_DURATION);
      const originalPromptCount = packageData.veoPrompts.length;

      console.log(
        `\n   🎬 KLING EXPANSION: Song duration ${songDuration.toFixed(1)}s requires ${klingClipsNeeded} clips (original: ${originalPromptCount})`,
      );

      if (klingClipsNeeded > originalPromptCount) {
        // ============================================
        // GPT CINEMATIC DIRECTOR: Generate unique lyric-matched prompts
        // Each clip gets a prompt that matches the actual lyrics at that timestamp
        // ============================================
        console.log(`   🤖 Using GPT Cinematic Director to generate ${klingClipsNeeded} lyric-matched prompts...`);

        // Extract lyrics from package data
        const lyrics = packageData.lyrics?.raw || '';

        // Check for Librosa audio analysis data for BPM-synced generation
        const audioAnalysis = (packageData as any).audioAnalysis;

        console.log(`   📜 Lyrics length: ${lyrics.length} chars`);
        console.log(
          `   🎵 Librosa data: ${audioAnalysis ? `BPM=${audioAnalysis.bpm}, sections=${audioAnalysis.sections?.length || 0}` : 'not available'}`,
        );

        let expandedClips: Array<{ veoPrompt: any; clipIdx: number }> = [];

        try {
          // Generate ALL prompts using GPT with RETENTION OPTIMIZATION
          // Includes pattern interrupts, mid-video hooks, and psychological triggers
          console.log(`   ♻️ Using Retention Optimizer for 2025 YouTube Shorts best practices...`);

          const retentionResult = await generateRetentionAwarePrompts({
            figureName,
            era,
            archetype,
            fullLyrics: lyrics,
            totalClips: klingClipsNeeded,
            videoDurationSeconds: songDuration,
            aspectRatio: targetAspectRatio,
            topic: packageData.metadata?.topic || figureName,
          });

          const gptPrompts = retentionResult.prompts;
          const retentionScore = retentionResult.retentionOptimization?.retentionScore || 0;
          const patternInterruptCount = retentionResult.retentionOptimization?.patternInterrupts?.length || 0;
          const hookPointCount = retentionResult.retentionOptimization?.hookPoints?.length || 0;

          console.log(`   ✅ GPT generated ${gptPrompts.length} unique prompts with retention optimization`);
          console.log(`   ♻️ Retention Score: ${retentionScore}/100`);
          console.log(`   ♻️ Pattern Interrupts: ${patternInterruptCount}, Hook Points: ${hookPointCount}`);

          // Store retention metadata for later analysis
          if (retentionResult.smartChapters) {
            (packageData as any).smartChapters = retentionResult.smartChapters;
            console.log(`   📑 Smart Chapters: ${retentionResult.smartChapters.map((c) => c.label).join(' → ')}`);
          }

          // Map GPT results to expanded clips
          expandedClips = gptPrompts.map((gptPrompt, i) => ({
            veoPrompt: {
              prompt: gptPrompt.prompt,
              fullPrompt: gptPrompt.prompt,
              sectionName: `Clip ${i + 1} - ${gptPrompt.beat_type}`,
              clipNumber: i + 1,
              negativePrompt: gptPrompt.negative_prompt,
              timestamp: gptPrompt.timestamp,
              lyricExcerpt: gptPrompt.lyric_excerpt,
              visualLogic: gptPrompt.visual_logic,
              variationType: 'retention_optimized_cinematic',
            },
            clipIdx: i,
          }));
        } catch (gptError: any) {
          // Fallback to original expansion if GPT fails
          console.error(`   ⚠️ GPT generation failed: ${gptError.message}`);
          console.log(`   🔄 Falling back to template-based expansion...`);

          // Fallback: distribute original prompts with timestamp fixes
          for (let i = 0; i < klingClipsNeeded; i++) {
            const originalIdx = Math.floor((i / klingClipsNeeded) * originalPromptCount);
            const originalPrompt = packageData.veoPrompts[originalIdx];
            const variedPrompt = { ...originalPrompt };

            let promptText = (variedPrompt as any).fullPrompt || variedPrompt.prompt || '';
            promptText = recalculateKlingTimestamp(promptText, i, 5);
            // Inject era context into fallback prompts that lack it
            if (era && era !== 'ancient times' && !promptText.toLowerCase().includes(era.toLowerCase())) {
              promptText += `, set in ${era}, period-accurate clothing and architecture`;
            }
            (variedPrompt as any).fullPrompt = promptText;
            variedPrompt.prompt = promptText;
            (variedPrompt as any).variationType = 'fallback_expansion';

            expandedClips.push({
              veoPrompt: variedPrompt,
              clipIdx: i,
            });
          }
        }

        // ============================================
        // POST-EXPANSION RESUME: Check if any expanded clips were already saved
        // This handles the case where a previous run generated some of the 23 clips
        // ============================================
        const expandedSavedCount = allSavedClips.filter((c: any) => c.clipIndex < klingClipsNeeded).length;

        if (expandedSavedCount > 0) {
          console.log(`   🔄 POST-EXPANSION RESUME: Found ${expandedSavedCount} saved clips from expanded set`);

          // Clear the generatedClips from pre-expansion restoration (they used wrong indices)
          generatedClips.length = 0;
          clipsCompleted = 0;
          clipsReused = 0;
          totalCost = 0;

          // Restore saved clips that match the expanded indices
          for (const savedClip of allSavedClips) {
            const clipIdx = savedClip.clipIndex;
            if (clipIdx < klingClipsNeeded && savedClip.videoPath && existsSync(savedClip.videoPath)) {
              const expandedPrompt = expandedClips.find((c) => c.clipIdx === clipIdx);
              const sectionName = expandedPrompt?.veoPrompt?.sectionName || `Clip ${clipIdx + 1}`;

              console.log(`📹 Clip ${clipIdx + 1}/${klingClipsNeeded}: ${sectionName} [REUSING SAVED]`);

              generatedClips.push({
                section: sectionName,
                clipNumber: clipIdx + 1,
                clipIndex: clipIdx,
                videoUrl: toVideoUrl(savedClip.videoPath),
                localPath: savedClip.videoPath,
                cost: savedClip.cost || 0,
                prompt: expandedPrompt?.veoPrompt?.prompt?.substring(0, 200) || '',
                reused: true,
              });

              totalCost += savedClip.cost || 0;
              clipsCompleted++;
              clipsReused++;
            }
          }

          if (clipsReused > 0) {
            const progress = 10 + Math.floor((clipsCompleted / klingClipsNeeded) * 80);
            await this.logProgress(job.id, progress, `Restored ${clipsReused} saved clips from expanded set`);
          }
        }

        // Filter pendingClips to only include clips that haven't been saved
        const savedExpandedIndices = new Set(generatedClips.map((c: any) => c.clipIndex));
        pendingClips = expandedClips.filter(({ clipIdx }) => !savedExpandedIndices.has(clipIdx));
        actualTotalClips = klingClipsNeeded;

        // Log stats
        console.log(`   📊 Expanded from ${originalPromptCount} to ${klingClipsNeeded} clips`);
        if (clipsReused > 0) {
          console.log(`   ♻️ Reusing ${clipsReused} saved clips, ${pendingClips.length} remaining to generate`);
        }
        console.log(`   🎬 Each clip has unique lyric-matched prompt`);
        console.log(
          `   💰 Estimated cost: $${(pendingClips.length * 0.14).toFixed(2)} (${pendingClips.length} × $0.14)`,
        );
      }
    }

    if (pendingClips.length === 0) {
      console.log(`   ✅ All clips already generated!`);
    } else if (useI2V) {
      console.log(`   🔗 I2V MODE: ${pendingClips.length} clips to generate SEQUENTIALLY (frame chaining)`);
    } else if (videoEngine === 'kling') {
      console.log(`   🚀 PARALLEL MODE: ${pendingClips.length} clips to generate (batch size: 10)`);
    } else {
      console.log(`   🚀 PARALLEL MODE: ${pendingClips.length} clips to generate (2 at a time)`);
    }

    // Initialize clip generation tracker early so the stuck detector knows clips are being generated
    if (pendingClips.length > 0) {
      this.clipGenerationTracker.set(job.id, {
        lastClipAt: new Date(),
        clipsGenerated: 0,
      });
    }

    // ============================================
    // I2V MODE: Sequential generation with frame chaining
    // ============================================
    if (useI2V && pendingClips.length > 0) {
      console.log(`\n🔗 Starting I2V generation with frame chaining...`);

      // Load anchor images as base64 for I2V first frames (keyed by character name)
      const characterFirstFrames = new Map<string, { bytesBase64Encoded: string; mimeType: string }>();
      for (const anchor of anchorImages) {
        try {
          if (existsSync(anchor.imagePath)) {
            const imageBuffer = readFileSync(anchor.imagePath);
            characterFirstFrames.set(anchor.characterName, {
              bytesBase64Encoded: imageBuffer.toString('base64'),
              mimeType: anchor.mimeType,
            });
            console.log(`   🎭 Loaded anchor for: ${anchor.characterName}`);
          }
        } catch (e) {
          console.warn(`   ⚠️ Could not load anchor image for ${anchor.characterName}: ${anchor.imagePath}`);
        }
      }

      console.log(`   Character first frames loaded: ${characterFirstFrames.size}`);

      // Build referenceImages array for character identity consistency (up to 3)
      // VEO 3.1: mimeType is sibling to image, referenceType must be lowercase 'asset'
      const referenceImages: { image: { bytesBase64Encoded: string }; mimeType: string; referenceType: 'asset' }[] = [];
      const portraitArray = Array.from(characterFirstFrames.entries());
      for (let refIdx = 0; refIdx < Math.min(3, portraitArray.length); refIdx++) {
        const [charName, portrait] = portraitArray[refIdx];
        const mime = portrait.mimeType || 'image/png';
        referenceImages.push({
          image: { bytesBase64Encoded: portrait.bytesBase64Encoded },
          mimeType: mime, // mimeType is sibling to image per VEO 3.1 API
          referenceType: 'asset', // VEO 3.1 only supports lowercase 'asset'
        });
        console.log(`   🎭 Reference image ${refIdx + 1}: ${charName} (mime: ${mime})`);
      }
      console.log(`   📸 Total reference images for VEO: ${referenceImages.length}`);

      // Also create a default first frame (first anchor) for clips without specific character
      let defaultFirstFrame: { bytesBase64Encoded: string; mimeType: string } | undefined;
      if (characterFirstFrames.size > 0) {
        defaultFirstFrame = characterFirstFrames.values().next().value;
      }

      // Parallel clip generation - Kling clips are independent (no frame chaining)
      const PARALLEL_CLIP_BATCH = 6; // Generate 6 clips at a time (matches kling batch size)

      console.log(`   🚀 Parallel Kling generation: ${pendingClips.length} clips in batches of ${PARALLEL_CLIP_BATCH}`);

      for (let batchStart = 0; batchStart < pendingClips.length; batchStart += PARALLEL_CLIP_BATCH) {
        const batch = pendingClips.slice(batchStart, batchStart + PARALLEL_CLIP_BATCH);
        const batchNum = Math.floor(batchStart / PARALLEL_CLIP_BATCH) + 1;
        const totalBatches = Math.ceil(pendingClips.length / PARALLEL_CLIP_BATCH);

        console.log(`\n   📦 Batch ${batchNum}/${totalBatches}: Generating ${batch.length} clips in parallel...`);

        const batchResults = await Promise.allSettled(
          batch.map(async ({ veoPrompt, clipIdx }) => {
            const sectionName = veoPrompt.sectionName || veoPrompt.section || `Clip ${clipIdx + 1}`;
            const promptText = veoPrompt.fullPrompt || veoPrompt.prompt || '';

            if (!promptText) {
              throw new Error(`No prompt text for clip ${clipIdx + 1}`);
            }

            console.log(`      📹 Clip ${clipIdx + 1}/${totalClips}: ${sectionName}`);

            // Append era-specific negatives to prevent anachronisms
            const eraConstraints = getEraConstraints(era);
            let clipNegative = veoPrompt.negativePrompt || '';
            if (eraConstraints.periodNegative) {
              clipNegative = clipNegative
                ? `${clipNegative}, ${eraConstraints.periodNegative}`
                : eraConstraints.periodNegative;
            }

            const result = await klingVideoGenerator.generateSingleClip(promptText, {
              aspectRatio: targetAspectRatio,
              duration: 15,
              jobId: job.id,
              negativePrompt: clipNegative,
            });

            if (!result.success || !result.localPath) {
              throw new Error(result.error || 'Generation failed');
            }

            console.log(`      ✅ Clip ${clipIdx + 1} generated ($${result.cost.toFixed(2)})`);

            return {
              section: sectionName,
              clipNumber: veoPrompt.clipNumber || clipIdx + 1,
              clipIndex: clipIdx,
              videoUrl: result.videoUrl,
              localPath: result.localPath,
              cost: result.cost,
              prompt: promptText.substring(0, 200),
              i2vMode: true,
            };
          }),
        );

        // Process batch results
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const { veoPrompt, clipIdx } = batch[i];
          const sectionName = veoPrompt.sectionName || veoPrompt.section || `Clip ${clipIdx + 1}`;

          if (result.status === 'fulfilled') {
            generatedClips.push(result.value);
            totalCost += result.value.cost;
          } else {
            console.error(`      ❌ Clip ${clipIdx + 1} failed: ${result.reason}`);
            generatedClips.push({
              section: sectionName,
              clipNumber: veoPrompt.clipNumber || clipIdx + 1,
              clipIndex: clipIdx,
              error: String(result.reason),
            });
            try {
              const { errorMonitor } = await import('./error-monitor');
              await errorMonitor.captureError(
                result.reason instanceof Error ? result.reason : new Error(String(result.reason)),
                {
                  service: 'job-worker',
                  operation: 'batchClipGeneration',
                  jobId: job.id,
                  metadata: { clipIdx, sectionName },
                },
              );
            } catch {}
          }
          clipsCompleted++;
        }

        // Update progress after each batch
        const progress = 10 + Math.floor((clipsCompleted / totalClips) * 80);
        await this.logProgress(
          job.id,
          progress,
          `Kling: ${clipsCompleted}/${totalClips} clips (batch ${batchNum}/${totalBatches})`,
        );

        const progressPackageData = {
          ...packageData,
          generatedClips: generatedClips,
          generationProgress: Math.round((clipsCompleted / totalClips) * 100),
          totalCost: totalCost,
        };
        await storage.updateUnityContentPackage(unityMetadata.packageId, {
          packageData: progressPackageData as any,
        });

        await storage.updateJob(job.id, {
          completedClips: generatedClips
            .filter((c) => !c.error)
            .map((c) => ({
              clipIndex: c.clipIndex,
              videoPath: c.localPath,
              characterName: c.section,
              cost: c.cost,
            })),
        });
      }
    }
    // ============================================
    // FAST T2V MODE: Parallel batch processing (Kling only)
    // ============================================
    else if (pendingClips.length > 0) {
      // Process 10 clips in parallel — Kling submit is instant (just queues a task),
      // so burst risk is minimal. 3 batches × ~130s = ~7 min for 26 clips.
      const BATCH_SIZE = 10;
      let batchIdx = 0;

      // Create unified video generator for selected engine
      const unifiedGenerator = new UnifiedVideoGenerator(videoEngine);
      console.log(
        `   🔧 Using ${videoEngine.toUpperCase()} video generator (batch size: ${BATCH_SIZE}, validation: async)`,
      );

      // Collect async validation work — runs in parallel with subsequent batches
      const pendingValidations: Promise<void>[] = [];
      // Track clips that need regeneration after all batches complete
      const clipsNeedingRegen: Array<{
        clipData: any;
        veoPrompt: any;
        clipIdx: number;
        clipContractId: string | null;
      }> = [];

      while (batchIdx < pendingClips.length) {
        const batch = pendingClips.slice(batchIdx, batchIdx + BATCH_SIZE);
        const batchNum = Math.floor(batchIdx / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(pendingClips.length / BATCH_SIZE);

        console.log(
          `\n🔄 Batch ${batchNum}/${totalBatches}: Generating ${batch.length} clip(s) in parallel (no stagger)`,
        );

        // Process batch in parallel using Promise.allSettled — no stagger delay
        const batchResults = await Promise.allSettled(
          batch.map(async ({ veoPrompt, clipIdx }) => {
            // Support both old and new field names: section/sectionName, prompt/fullPrompt
            const sectionName = veoPrompt.sectionName || veoPrompt.section || `Clip ${clipIdx + 1}`;
            console.log(`   📹 Clip ${clipIdx + 1}/${actualTotalClips}: ${sectionName} [${videoEngine}]`);

            // ============================================
            // LEVEL 5: CONTEXT CONTRACTS - Create contract for this clip
            // ============================================
            let contractId: string | null = null;
            try {
              contractId = await contextContractsService.createContract(unityMetadata.packageId, job.id, clipIdx, {
                promptText: veoPrompt.fullPrompt || veoPrompt.prompt || '',
                sectionName,
              } as any);
              contextContractsService.recordDecision(contractId, {
                stage: 'prompt_generation',
                model: videoEngine === 'kling' ? 'kling-3.0' : 'veo-3',
                modelVersion: videoEngine === 'kling' ? 'kie.ai-proxy' : 'google-vertexai',
                input: (veoPrompt.fullPrompt || veoPrompt.prompt || '').substring(0, 200),
                output: 'pending',
                rationale: `Using ${videoEngine.toUpperCase()} engine for clip ${clipIdx + 1}`,
                confidence: 85,
              });
            } catch (contractErr: any) {
              console.warn(`   ⚠️ Context contract creation failed (non-blocking): ${contractErr.message}`);
            }

            // Use fullPrompt (new format) or prompt (old format)
            let promptText = veoPrompt.fullPrompt || veoPrompt.prompt || '';
            if (!promptText) {
              // RESILIENT: Capture error and skip clip instead of killing job
              console.error(`   ❌ No prompt text found for clip ${clipIdx + 1} - skipping clip`);

              const { errorMonitor } = await import('./error-monitor');
              await errorMonitor.captureError(new Error(`No prompt text found for clip ${clipIdx + 1}`), {
                service: 'job-worker',
                operation: 'clip_generation',
                jobId: job.id,
                packageId: unityMetadata.packageId,
                metadata: { clipIndex: clipIdx, sectionName },
              });

              // Skip this clip and continue with next
              generatedClips.push({
                section: sectionName,
                clipNumber: veoPrompt.clipNumber || clipIdx + 1,
                clipIndex: clipIdx,
                error: 'No prompt text found',
              });
              clipsCompleted++;
              return; // Skip to next clip
            }

            // For Kling: Recalculate timestamps to 15-second intervals
            // This ensures each clip has an accurate timestamp (0:00-0:15, 0:15-0:30, etc.)
            if (videoEngine === 'kling') {
              promptText = recalculateKlingTimestamp(promptText, clipIdx, 15);
              console.log(`      ⏱️ Kling timestamp: ${clipIdx * 15}s - ${(clipIdx + 1) * 15}s`);
            }

            // Use unified generator for either VEO or Kling
            // Note: Kling 3.0 uses 15s clips
            const result = await unifiedGenerator.generateSingleClip(promptText, {
              aspectRatio: targetAspectRatio,
              duration: videoEngine === 'kling' ? 15 : 8,
              referenceImages:
                videoEngine === 'kling' ? undefined : veoReferenceImages.length > 0 ? veoReferenceImages : undefined,
              jobId: job.id,
              negativePrompt: veoPrompt.negativePrompt,
            } as any);

            // ============================================
            // LEVEL 5: CONTEXT CONTRACTS - Finalize contract with cost tracking
            // ============================================
            if (contractId) {
              try {
                // Add cost to contract BEFORE finalizing
                contextContractsService.addCost(contractId, result.cost || 0.1);

                await contextContractsService.finalizeContract(contractId, {
                  finalPrompt: promptText.substring(0, 500),
                  videoPath: result.localPath || undefined,
                  passed: !!result.localPath,
                });
              } catch (finalizeErr: any) {
                console.warn(`   ⚠️ Contract finalization failed (non-blocking): ${finalizeErr.message}`);
              }
            }

            return {
              section: sectionName,
              clipNumber: veoPrompt.clipNumber || clipIdx + 1,
              clipIndex: clipIdx,
              videoUrl: result.videoUrl,
              localPath: result.localPath,
              cost: result.cost,
              prompt: promptText.substring(0, 200),
              contractId: contractId, // Pass contractId for validation tracking
            };
          }),
        );

        // Process batch results — collect clips, kick off async validation
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const { veoPrompt, clipIdx } = batch[i];

          if (result.status === 'fulfilled') {
            const clipData = result.value;
            const clipContractId = clipData?.contractId || null;
            generatedClips.push(clipData);
            totalCost += clipData?.cost || 0;
            clipsCompleted++;
            console.log(
              `   ✅ Clip ${clipIdx + 1}/${actualTotalClips} generated ($${(clipData?.cost || 0).toFixed(2)})`,
            );

            // Track clip generation for stuck job detector
            const currentTracker = this.clipGenerationTracker.get(job.id) || {
              lastClipAt: new Date(),
              clipsGenerated: 0,
            };
            this.clipGenerationTracker.set(job.id, {
              lastClipAt: new Date(),
              clipsGenerated: currentTracker.clipsGenerated + 1,
            });

            // ============================================
            // ASYNC VALIDATION: Run in parallel with next batch generation
            // Validation results collected; regens happen in a final pass
            // ============================================
            if (clipData?.localPath && existsSync(clipData.localPath)) {
              const validationPromise = (async () => {
                try {
                  const { historicalAccuracyValidator } = await import('./historical-accuracy-validator');

                  // Get previous clip context for continuity checking
                  const previousContext = await historicalAccuracyValidator.getPreviousClipContext(job.id, clipIdx);

                  // Validate the clip
                  const validationResult = await historicalAccuracyValidator.validateClip(
                    clipData.localPath || '',
                    clipIdx,
                    job.id,
                    unityMetadata.packageId,
                    packageData,
                    previousContext,
                  );

                  // Save initial validation report
                  await historicalAccuracyValidator.saveReport(
                    job.id,
                    unityMetadata.packageId,
                    clipIdx,
                    clipData.localPath || '',
                    validationResult,
                    1,
                    false,
                    null,
                  );

                  // Store validation result on clip data
                  (clipData as any).accuracyValidation = {
                    passed: validationResult.passed,
                    overallScore: validationResult.overallScore,
                    eraScore: validationResult.eraAccuracyScore,
                    characterScore: validationResult.characterConsistencyScore,
                    criticalIssues: validationResult.criticalIssues,
                    regenerationAttempts: 0,
                  };

                  // Record validation decision in Context Contract
                  if (clipContractId) {
                    contextContractsService.recordDecision(clipContractId, {
                      stage: 'validation',
                      model: 'gemini-2.5-flash',
                      modelVersion: 'historical-accuracy-validator',
                      input: clipData.localPath || '',
                      output: validationResult.passed ? 'PASSED' : 'NEEDS_REGEN',
                      rationale: `Era: ${validationResult.eraAccuracyScore}, Character: ${validationResult.characterConsistencyScore}, Anachronism: ${validationResult.anachronismScore}, Continuity: ${validationResult.continuityScore}`,
                      confidence: validationResult.overallScore,
                    });
                  }

                  if (!validationResult.passed) {
                    console.log(
                      `   ⚠️  Clip ${clipIdx + 1} accuracy: ${validationResult.overallScore}/100 (below threshold — queued for regen)`,
                    );
                    if (validationResult.criticalIssues.length > 0) {
                      console.log(`   🚨 Critical issues: ${validationResult.criticalIssues.join(', ')}`);
                    }
                    // Queue for regeneration in the final pass
                    if (validationResult.shouldRegenerate) {
                      clipsNeedingRegen.push({ clipData, veoPrompt, clipIdx, clipContractId });
                    }
                  } else {
                    console.log(`   ✅ Clip ${clipIdx + 1} validation PASSED: ${validationResult.overallScore}/100`);
                  }
                } catch (validationError: any) {
                  console.warn(
                    `   ⚠️  Accuracy validation skipped for clip ${clipIdx + 1}: ${validationError.message}`,
                  );
                }
              })();
              pendingValidations.push(validationPromise);
            }
          } else {
            const sectionName = veoPrompt.sectionName || veoPrompt.section || `Clip ${clipIdx + 1}`;
            console.error(
              `   ❌ Clip ${clipIdx + 1}/${actualTotalClips} failed:`,
              result.reason?.message || result.reason,
            );
            generatedClips.push({
              section: sectionName,
              clipNumber: veoPrompt.clipNumber || clipIdx + 1,
              clipIndex: clipIdx,
              error: result.reason?.message || 'Unknown error',
            });
            clipsCompleted++;
          }
        }

        // Update progress after each batch
        const progress = 10 + Math.floor((clipsCompleted / actualTotalClips) * 80);
        await this.logProgress(
          job.id,
          progress,
          `Generated batch ${batchNum}/${totalBatches} (${clipsCompleted}/${actualTotalClips} clips)`,
        );

        // Update package with progress
        const progressPackageData = {
          ...packageData,
          generatedClips: generatedClips,
          generationProgress: Math.round((clipsCompleted / actualTotalClips) * 100),
          totalCost: totalCost,
        };
        await storage.updateUnityContentPackage(unityMetadata.packageId, {
          packageData: progressPackageData as any,
        });

        // Save completed clips to job for resume capability
        await storage.updateJob(job.id, {
          completedClips: generatedClips
            .filter((c) => !c.error)
            .map((c) => ({
              clipIndex: c.clipIndex,
              videoPath: c.localPath,
              characterName: c.section,
              cost: c.cost,
            })),
        });

        batchIdx += BATCH_SIZE;

        // Short delay between batches — submit is instant, just connection pool recovery
        if (batchIdx < pendingClips.length) {
          console.log(`   ⏳ Waiting ${KLING_BATCH_DELAY_MS / 1000}s before next batch...`);
          await new Promise((resolve) => setTimeout(resolve, KLING_BATCH_DELAY_MS));
        }
      }

      // ============================================
      // AWAIT ALL PENDING VALIDATIONS before regeneration pass
      // ============================================
      if (pendingValidations.length > 0) {
        console.log(`\n🔍 Awaiting ${pendingValidations.length} async validations...`);
        await Promise.allSettled(pendingValidations);
        console.log(`   ✅ All validations complete. ${clipsNeedingRegen.length} clip(s) need regeneration.`);
      }

      // ============================================
      // REGENERATION PASS: Fix clips that failed validation
      // All regens run in parallel (same as initial generation)
      // ============================================
      if (clipsNeedingRegen.length > 0) {
        console.log(`\n🚀 REGENERATION PASS: ${clipsNeedingRegen.length} clip(s) to fix IN PARALLEL`);
        await this.logProgress(job.id, 91, `Regenerating ${clipsNeedingRegen.length} clip(s) in parallel...`);
        const MAX_REGEN_ATTEMPTS = 3;

        // Update clip tracker to prevent stuck detector false positives
        this.clipGenerationTracker.set(job.id, {
          lastClipAt: new Date(),
          clipsGenerated: this.clipGenerationTracker.get(job.id)?.clipsGenerated || 0,
        });

        const regenResults = await Promise.allSettled(
          clipsNeedingRegen.map(async ({ clipData, veoPrompt, clipIdx, clipContractId }) => {
            const originalPromptText = veoPrompt.prompt || '';
            let regenAttempt = 0;
            let currentValidation = (clipData as any).accuracyValidation;

            while (currentValidation && !currentValidation.passed && regenAttempt < MAX_REGEN_ATTEMPTS) {
              regenAttempt++;
              console.log(
                `   🔄 REGENERATING clip ${clipIdx + 1} (attempt ${regenAttempt}/${MAX_REGEN_ATTEMPTS}) - score: ${currentValidation.overallScore}/100`,
              );

              // Update clip tracker to prevent stuck detector false positives
              this.clipGenerationTracker.set(job.id, {
                lastClipAt: new Date(),
                clipsGenerated: (this.clipGenerationTracker.get(job.id)?.clipsGenerated || 0) + 1,
              });

              try {
                const { historicalAccuracyValidator } = await import('./historical-accuracy-validator');

                // Reuse the existing validation result from the initial pass (saved in DB)
                // instead of re-calling validateClip on the old clip — saves 1 Gemini call per regen
                const existingReport = await storage.getClipAccuracyReport(job.id, clipIdx);
                const fullValidation = existingReport
                  ? {
                      passed: existingReport.passed,
                      eraAccuracyScore: existingReport.eraAccuracyScore,
                      characterConsistencyScore: existingReport.characterConsistencyScore,
                      anachronismScore: existingReport.anachronismScore,
                      continuityScore: existingReport.continuityScore,
                      overallScore: existingReport.overallScore,
                      analysis: existingReport.analysis as any,
                      shouldRegenerate: existingReport.regenerationRequested || false,
                      criticalIssues:
                        (existingReport.analysis as any)?.criticalIssues || currentValidation.criticalIssues || [],
                    }
                  : currentValidation;

                // Generate improved prompt based on validation failures
                const repairedPrompt = historicalAccuracyValidator.generateRepairedPrompt(
                  originalPromptText,
                  fullValidation,
                  packageData,
                );
                console.log(
                  `   📝 Clip ${clipIdx + 1} repaired prompt: ${fullValidation.criticalIssues?.join(', ') || 'era/character fixes'}`,
                );

                // Delete the old failed clip file
                try {
                  const { unlink } = await import('fs/promises');
                  await unlink(clipData.localPath);
                } catch {}

                // Regenerate the clip with the repaired prompt (no artificial delay — parallel is fine)
                const { klingVideoGenerator } = await import('./kling-video-generator');
                const regenResult = await klingVideoGenerator.generateSingleClip(repairedPrompt, {
                  duration: 15,
                  aspectRatio: targetAspectRatio,
                  jobId: job.id,
                  negativePrompt: veoPrompt.negativePrompt,
                });

                if (regenResult.success && regenResult.localPath) {
                  // Update clip data with new path
                  clipData.localPath = regenResult.localPath;
                  clipData.videoUrl = regenResult.videoUrl;
                  const regenCost = regenResult.cost || 0.1;
                  totalCost += regenCost;
                  console.log(`   ✅ Regenerated clip ${clipIdx + 1} ($${regenCost.toFixed(2)})`);

                  // Track regeneration cost in Context Contract
                  if (clipContractId) {
                    contextContractsService.addCost(clipContractId, regenCost);
                    contextContractsService.recordDecision(clipContractId, {
                      stage: 'retry',
                      model: 'kling-3.0',
                      modelVersion: 'kie.ai-proxy',
                      input: repairedPrompt.substring(0, 200),
                      output: `Regenerated (attempt ${regenAttempt})`,
                      rationale: `Clip failed validation (${currentValidation.overallScore}/100): ${currentValidation.criticalIssues?.join(', ') || 'quality issues'}`,
                      confidence: 70,
                    });
                  }

                  // Re-validate the new clip
                  const previousContext = await historicalAccuracyValidator.getPreviousClipContext(job.id, clipIdx);
                  const newValidation = await historicalAccuracyValidator.validateClip(
                    regenResult.localPath,
                    clipIdx,
                    job.id,
                    unityMetadata.packageId,
                    packageData,
                    previousContext,
                  );

                  // Save new validation report
                  const firstAttemptScore = currentValidation.overallScore;
                  await historicalAccuracyValidator.saveReport(
                    job.id,
                    unityMetadata.packageId,
                    clipIdx,
                    regenResult.localPath,
                    newValidation,
                    regenAttempt + 1,
                    true,
                    firstAttemptScore,
                  );

                  // Update stored validation
                  currentValidation = {
                    passed: newValidation.passed,
                    overallScore: newValidation.overallScore,
                    eraScore: newValidation.eraAccuracyScore,
                    characterScore: newValidation.characterConsistencyScore,
                    criticalIssues: newValidation.criticalIssues,
                    regenerationAttempts: regenAttempt,
                  };
                  (clipData as any).accuracyValidation = currentValidation;

                  if (newValidation.passed) {
                    console.log(
                      `   ✅ Regenerated clip ${clipIdx + 1} PASSED validation: ${newValidation.overallScore}/100`,
                    );
                  } else {
                    console.log(`   ⚠️  Regenerated clip ${clipIdx + 1} score: ${newValidation.overallScore}/100`);
                  }

                  // Record final validation in Context Contract
                  if (clipContractId) {
                    contextContractsService.recordDecision(clipContractId, {
                      stage: 'validation',
                      model: 'gemini-2.5-flash',
                      modelVersion: 'historical-accuracy-validator',
                      input: clipData.localPath,
                      output: newValidation.passed ? 'PASSED' : 'FAILED',
                      rationale: `Era: ${newValidation.eraAccuracyScore}, Character: ${newValidation.characterConsistencyScore}, Anachronism: ${newValidation.anachronismScore}, Continuity: ${newValidation.continuityScore}`,
                      confidence: newValidation.overallScore,
                    });
                  }
                } else {
                  console.log(`   ❌ Clip ${clipIdx + 1} regeneration failed: ${regenResult.error || 'Unknown error'}`);
                  break;
                }
              } catch (regenError: any) {
                console.error(`   ❌ Clip ${clipIdx + 1} regeneration error: ${regenError.message}`);
                break;
              }
            }

            if (regenAttempt > 0 && currentValidation && !currentValidation.passed) {
              console.log(
                `   ⚠️  Clip ${clipIdx + 1} still below threshold after ${regenAttempt} regeneration(s) - continuing anyway`,
              );
            }
          }),
        );

        console.log(
          `   ✅ Regeneration pass complete: ${regenResults.filter((r) => r.status === 'fulfilled').length}/${clipsNeedingRegen.length} succeeded`,
        );

        // Save final state after regen pass
        await storage.updateJob(job.id, {
          completedClips: generatedClips
            .filter((c) => !c.error)
            .map((c) => ({
              clipIndex: c.clipIndex,
              videoPath: c.localPath,
              characterName: c.section,
              cost: c.cost,
            })),
        });
      }
    }

    // ============================================
    // RETRY FAILED CLIPS: One-by-one with modified prompts
    // ============================================
    const failedClips = generatedClips.filter((c) => c.error);
    if (failedClips.length > 0) {
      console.log(`\n🔄 RETRYING ${failedClips.length} FAILED CLIPS (one-by-one with sanitized prompts)...`);
      await this.logProgress(job.id, 85, `Retrying ${failedClips.length} failed clips...`);

      for (const failedClip of failedClips) {
        const clipIdx = failedClip.clipIndex;
        // Find the veoPrompt from pendingClips
        const clipEntry = pendingClips.find((c) => c.clipIdx === clipIdx);
        if (!clipEntry) continue;
        const veoPrompt = clipEntry.veoPrompt;

        const sectionName = veoPrompt.sectionName || veoPrompt.section || `Clip ${clipIdx + 1}`;
        console.log(`   🔄 Retrying clip ${clipIdx + 1}: ${sectionName}`);

        // Get and sanitize the prompt using centralized sanitizer
        const promptText = veoPrompt.fullPrompt || veoPrompt.prompt || '';
        const hasChildSubject = /\b(child|boy|girl|\d+-year-old)\b/i.test(promptText);
        const sanitizationResult = sanitizeVeoPrompt(promptText, {
          isDocumentary: true, // Assume documentary for retries (more aggressive sanitization)
          hasChildSubject,
          logReplacements: true,
        });
        const sanitizedPrompt = sanitizationResult.sanitized;

        try {
          // Retry using Kling generator
          const result = await klingVideoGenerator.generateSingleClip(sanitizedPrompt, {
            aspectRatio: targetAspectRatio,
            duration: 15,
            jobId: job.id,
            negativePrompt: veoPrompt.negativePrompt,
          });

          // Success! Replace the failed entry with the successful one
          const clipData = {
            section: sectionName,
            clipNumber: veoPrompt.clipNumber || clipIdx + 1,
            clipIndex: clipIdx,
            videoUrl: result.videoUrl,
            localPath: result.localPath,
            cost: result.cost,
            prompt: sanitizedPrompt.substring(0, 200),
          };

          // Find and replace the failed clip entry
          const failedIdx = generatedClips.findIndex((c) => c.clipIndex === clipIdx);
          if (failedIdx !== -1) {
            generatedClips[failedIdx] = clipData;
          }
          totalCost += result.cost;
          console.log(`   ✅ Retry successful for clip ${clipIdx + 1} ($${result.cost.toFixed(2)})`);
        } catch (retryError: any) {
          console.error(`   ❌ Retry also failed for clip ${clipIdx + 1}:`, retryError.message);
          // Keep the original failed entry - will be skipped in assembly
        }

        // Small delay between retries
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    // Finalize
    const successfulClips = generatedClips.filter((c) => !c.error);
    const newlyGenerated = clipsCompleted - clipsReused;
    console.log(`\n✅ Unity VEO generation complete:`);
    console.log(`   Successful: ${successfulClips.length}/${generatedClips.length} clips`);
    if (clipsReused > 0) {
      console.log(`   📦 Reused from checkpoint: ${clipsReused} clips`);
      console.log(`   🆕 Newly generated: ${newlyGenerated} clips`);
    }
    console.log(`   Total cost: $${totalCost.toFixed(2)}`);

    // PIPELINE MONITORING: Video generation step complete
    if (successfulClips.length > 0) {
      await pipelineMonitoringService.updateStep(job.id, 'video_generation', 'success');
    } else {
      await pipelineMonitoringService.updateStep(job.id, 'video_generation', 'failed', 'All clips failed to generate');
    }

    // ============================================
    // VIDEO ASSEMBLY: Concatenate clips with music
    // ============================================
    let finalVideoUrl: string | undefined;
    let assemblyError: string | undefined;

    if (successfulClips.length >= 2) {
      // ✅ RETRY LOGIC: Try assembly up to 3 times (fixes 99% failures)
      const MAX_ASSEMBLY_RETRIES = 3;
      let assemblyAttempt = 0;

      // Generate output filename ONCE to prevent duplicate render files
      const assemblyTimestamp = Date.now();

      while (assemblyAttempt < MAX_ASSEMBLY_RETRIES && !finalVideoUrl) {
        assemblyAttempt++;
        const attemptSuffix = assemblyAttempt > 1 ? ` (attempt ${assemblyAttempt}/${MAX_ASSEMBLY_RETRIES})` : '';

        try {
          await this.logProgress(
            job.id,
            92,
            `Assembling ${successfulClips.length} clips into final video${attemptSuffix}...`,
          );
          console.log(`\n🎬 ASSEMBLING FINAL VIDEO${attemptSuffix}:`);
          console.log(`   Clips to assemble: ${successfulClips.length}`);

          // Sort clips by clipIndex to ensure correct order
          const sortedClips = [...successfulClips].sort((a, b) => a.clipIndex - b.clipIndex);
          const clipPaths = sortedClips.map((c) => c.localPath).filter((p) => existsSync(p));

          if (clipPaths.length < 2) {
            throw new Error(`Not enough valid clip files found: ${clipPaths.length}`);
          }

          console.log(`   Valid clip files: ${clipPaths.length}`);

          // Get music file path from package
          let musicPath: string | undefined;
          let musicDuration: number | undefined;

          if (pkg.audioFilePath) {
            // Use robust path resolver to handle multiple path formats
            try {
              musicPath = findAudioFile(pkg.audioFilePath);

              if (musicPath) {
                console.log(`   🎵 Music file found: ${basename(musicPath)}`);
                // Get music duration using ffprobe
                try {
                  const { promisify } = await import('util');
                  const { exec } = await import('child_process');
                  const execPromise = promisify(exec);
                  const result = await execPromise(
                    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${musicPath}"`,
                  );
                  musicDuration = parseFloat(result.stdout.trim()) || undefined;
                  console.log(`   🎵 Music duration: ${musicDuration?.toFixed(2)}s`);
                } catch (e) {
                  console.warn(`   ⚠️ Could not get music duration: ${e}`);
                }
              } else {
                console.warn(`   ⚠️ Music file not found: ${pkg.audioFilePath}`);
              }
            } catch (error: any) {
              console.warn(`   ⚠️ Failed to resolve music path: ${error.message}`);
              musicPath = undefined;
            }
          }

          // Calculate section timings from clip durations
          // Use actual duration from VEO prompts or default to 5s for Kling (8s for VEO)
          const isKlingMode = job.mode === 'unity_kling' || (packageData as any).videoEngine === 'kling';
          const defaultClipDuration = isKlingMode ? 5 : 8; // Kling = 5s, VEO = 8s

          let cumulativeTime = 0;
          const sectionTimings = sortedClips.map((clip) => {
            // Get duration from veoPrompt or default based on video engine
            const veoPrompt = packageData.veoPrompts.find((p: any) => p.clipNumber === clip.clipNumber);
            const clipDuration = veoPrompt?.duration || defaultClipDuration;
            const startTime = cumulativeTime;
            cumulativeTime += clipDuration;
            return {
              startTime,
              endTime: cumulativeTime,
            };
          });

          // Output path for final assembled video (uses stable timestamp to prevent duplicate files on retry)
          const outputFilename = `unity_final_${job.id}_${assemblyTimestamp}.mp4`;
          const outputPath = join(process.cwd(), 'data', 'videos', 'renders', outputFilename);

          // Ensure renders directory exists
          const rendersDir = join(process.cwd(), 'data', 'videos', 'renders');
          if (!existsSync(rendersDir)) {
            const { mkdirSync } = await import('fs');
            mkdirSync(rendersDir, { recursive: true });
          }

          await this.logProgress(job.id, 95, `Concatenating clips with crossfades...`);

          // Call FFmpeg processor to assemble the video
          await ffmpegProcessor.concatenateVideos(
            clipPaths,
            outputPath,
            musicPath,
            musicDuration,
            sectionTimings,
            true, // enableCrossfades
            0.15, // crossfadeDuration (reduced — multi-shot clips have native transitions)
            undefined, // existingState
            job.id,
            async (batchId, totalBatches) => {
              const assemblyProgress = 95 + Math.round((batchId / totalBatches) * 4);
              await this.logProgress(job.id, assemblyProgress, `Assembling batch ${batchId + 1}/${totalBatches}...`);
            },
            targetAspectRatio,
          );

          if (existsSync(outputPath)) {
            finalVideoUrl = `/api/videos/${outputFilename}`;
            console.log(`   ✅ Final video assembled: ${finalVideoUrl}`);

            // PIPELINE MONITORING: FFmpeg assembly complete
            await pipelineMonitoringService.updateStep(job.id, 'ffmpeg_assembly', 'success');

            // ============================================
            // VISUAL STYLE MUTATION: Subtle per-video aesthetic variation
            // Applied automatically with mild settings for visual polish
            // ============================================
            const styleBanditData = (unityMetadata as any).styleBandit;
            const enableStyleMutation = (unityMetadata as any).enableStyleMutation !== false; // Default: enabled
            if (enableStyleMutation) {
              try {
                await this.logProgress(job.id, 96, 'Applying visual style polish...');

                // Use Style Bandit params if available, otherwise apply subtle defaults
                const styleParams = styleBanditData?.params || {
                  colorMultiplier: 1.05, // +5% saturation
                  contrast: 21, // +3% contrast (centered at 20)
                  overlayTexture: null,
                };

                const styledFilename = outputFilename.replace('.mp4', '_styled.mp4');
                const styledPath = join(rendersDir, styledFilename);

                await ffmpegProcessor.applyVisualStyleMutation(outputPath, styledPath, {
                  colorMultiplier: styleParams.colorMultiplier,
                  contrast: styleParams.contrast,
                  overlayTexture: styleParams.overlayTexture,
                });

                if (existsSync(styledPath)) {
                  try {
                    unlinkSync(outputPath);
                  } catch {}
                  // Update references
                  const { copyFileSync: cpSync } = await import('fs');
                  cpSync(styledPath, outputPath);
                  try {
                    unlinkSync(styledPath);
                  } catch {}
                  console.log(
                    `   ✅ Visual style polish applied${styleBanditData ? `: ${styleBanditData.styleName}` : ' (subtle defaults)'}`,
                  );
                }
              } catch (styleError) {
                console.error('   ⚠️ Style mutation failed, using original video:', styleError);
              }
            }

            // ============================================
            // LIP SYNC: Apply SadTalker lip sync (ENABLED BY DEFAULT for unity_kling)
            // Uses Demucs to extract vocals, then applies lip sync via Replicate
            // Can be disabled by setting enableLipSync: false
            // ============================================
            const enableLipSync = unityMetadata.enableLipSync !== false; // Default to true
            if (enableLipSync && musicPath && existsSync(musicPath)) {
              try {
                await this.logProgress(job.id, 96, 'Applying lip sync (extracting vocals + SadTalker)...');
                console.log(`\n👄 [LipSync] LIP SYNC PROCESSING:`);
                console.log(`   📹 Video: ${outputPath}`);
                console.log(`   🎵 Music: ${musicPath}`);

                const { lipSyncService } = await import('./lip-sync-service');

                if (!lipSyncService.isAvailable()) {
                  console.warn(`   ⚠️ Lip sync service not available - skipping`);
                } else {
                  const estimatedCost = lipSyncService.estimateCost(musicDuration || 60);
                  console.log(`   💰 Estimated lip sync cost: $${estimatedCost.toFixed(3)}`);

                  const lipSyncResult = await lipSyncService.applyLipSyncToVideo(outputPath, musicPath, {
                    enhancer: 'gfpgan',
                    preprocess: 'full',
                  });

                  if (lipSyncResult.success && lipSyncResult.outputPath && existsSync(lipSyncResult.outputPath)) {
                    const lipSyncFilename = basename(lipSyncResult.outputPath);
                    const lipSyncDestPath = join(rendersDir, `unity_lipsync_${job.id}_${Date.now()}.mp4`);

                    const { copyFileSync } = await import('fs');
                    copyFileSync(lipSyncResult.outputPath, lipSyncDestPath);

                    const newLipSyncFilename = basename(lipSyncDestPath);
                    finalVideoUrl = `/api/videos/${newLipSyncFilename}`;
                    console.log(`   ✅ Lip sync applied: ${finalVideoUrl}`);
                    console.log(`   💰 Lip sync cost: $${(lipSyncResult.cost || 0).toFixed(3)}`);
                  } else {
                    console.warn(`   ⚠️ Lip sync failed: ${lipSyncResult.error || 'Unknown error'}`);
                    console.warn(`   📹 Keeping original video without lip sync`);
                  }
                }
              } catch (lipSyncErr: any) {
                console.error(`   ❌ Lip sync error: ${lipSyncErr.message}`);
                console.warn(`   📹 Keeping original video without lip sync`);
              }
            }

            // ============================================
            // KARAOKE SUBTITLES: Burn into final video if enabled
            // REFRESH package data to get latest audio analysis (e.g., fresh onsets from re-analysis)
            // ============================================
            if (unityMetadata.includeKaraoke && packageDataWithTranscription.whisperTranscription) {
              try {
                await this.logProgress(
                  job.id,
                  98,
                  `Burning ${unityMetadata.karaokeStyle || 'bounce'} karaoke subtitles...`,
                );
                console.log(`\n🎤 BURNING KARAOKE SUBTITLES:`);
                console.log(`   Style: ${unityMetadata.karaokeStyle || 'bounce'}`);

                // REFRESH: Get latest package data for fresh audio analysis (onsets may have been updated)
                const freshPackage = await storage.getUnityContentPackage(unityMetadata.packageId);
                const freshPackageData = (freshPackage?.packageData || packageDataWithTranscription) as any;

                // Get word timestamps from Whisper transcription (may be from auto-transcription)
                const words =
                  freshPackageData.whisperTranscription?.words ||
                  packageDataWithTranscription.whisperTranscription?.words;
                if (!words || words.length === 0) {
                  console.warn(`   ⚠️ No word timestamps available for karaoke`);
                } else {
                  // Get original lyrics for proper text display (preserves spelling, punctuation, formatting)
                  const originalLyrics = freshPackageData.lyrics?.raw || packageDataWithTranscription.lyrics?.raw || '';

                  // ============================================
                  // FORCED ALIGNMENT REFRESH: Re-run analysis if lyrics exist but no forced alignment
                  // This ensures old cached audio analysis gets updated with exact word timing
                  // IMPORTANT: Check for stored errors to avoid endless retry loops
                  // ============================================
                  let forcedAlignment = freshPackageData.audioAnalysis?.forcedAlignment || [];
                  const cachedAlignmentError = freshPackageData.audioAnalysis?.forcedAlignmentError;

                  // Skip re-analysis if there's a cached error (prevent infinite retry loops)
                  if (cachedAlignmentError) {
                    console.log(`   ⚠️ Forced alignment previously failed: ${cachedAlignmentError}`);
                    console.log(`   🔄 Clearing cached error and retrying one more time...`);
                    // Clear the error to allow one retry, but if it fails again it will be cached
                  }

                  const needsAlignment =
                    forcedAlignment.length === 0 && originalLyrics && originalLyrics.trim().length > 0 && musicPath;

                  if (needsAlignment) {
                    console.log(
                      `   🔄 REFRESHING AUDIO ANALYSIS: Lyrics exist but no forced alignment - re-running with Wav2Vec2`,
                    );

                    // Retry logic for forced alignment - up to 3 attempts
                    const MAX_RETRIES = 3;
                    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                      try {
                        console.log(`   📍 Attempt ${attempt}/${MAX_RETRIES}: Running forced alignment...`);
                        const { audioAnalysisService } = await import('./audio-analysis-service');
                        const refreshedAnalysis = await audioAnalysisService.analyzeAudio(
                          musicPath || '',
                          originalLyrics,
                        );

                        // Check for explicit error from Python
                        if (refreshedAnalysis.analysis?.forcedAlignmentError) {
                          console.error(
                            `   ❌ Attempt ${attempt}: Forced alignment error: ${refreshedAnalysis.analysis.forcedAlignmentError}`,
                          );
                          // Store the error so we don't keep retrying indefinitely
                          freshPackageData.audioAnalysis = {
                            ...freshPackageData.audioAnalysis,
                            ...refreshedAnalysis.analysis,
                          };
                          await storage.updateUnityContentPackage(unityMetadata.packageId, {
                            packageData: freshPackageData,
                          });
                          console.log(`   💾 Saved error state to prevent future retries`);
                          break; // Exit retry loop - error is cached
                        }

                        if (
                          refreshedAnalysis.success &&
                          refreshedAnalysis.analysis?.forcedAlignment &&
                          refreshedAnalysis.analysis.forcedAlignment.length > 0
                        ) {
                          forcedAlignment = refreshedAnalysis.analysis!.forcedAlignment;
                          console.log(
                            `   ✅ FORCED ALIGNMENT COMPLETE: ${forcedAlignment.length} words with EXACT timing`,
                          );

                          // Update cached audio analysis with new forced alignment
                          freshPackageData.audioAnalysis = {
                            ...freshPackageData.audioAnalysis,
                            ...refreshedAnalysis.analysis,
                          };

                          // Persist to database so we don't re-analyze next time
                          await storage.updateUnityContentPackage(unityMetadata.packageId, {
                            packageData: freshPackageData,
                          });
                          console.log(`   💾 Saved forced alignment to package cache`);
                          break; // Success - exit retry loop
                        } else {
                          console.warn(`   ⚠️ Attempt ${attempt}: Forced alignment returned no data`);
                          if (attempt < MAX_RETRIES) {
                            console.log(`   ⏳ Waiting 2s before retry...`);
                            await new Promise((r) => setTimeout(r, 2000));
                          }
                        }
                      } catch (refreshErr: any) {
                        console.error(`   ❌ Attempt ${attempt}: Forced alignment error: ${refreshErr.message}`);
                        if (attempt < MAX_RETRIES) {
                          console.log(`   ⏳ Waiting 2s before retry...`);
                          await new Promise((r) => setTimeout(r, 2000));
                        }
                      }
                    }
                  }

                  // Get beat timestamps for sync effects (optional) - use fresh data if available
                  const beats =
                    freshPackageData.audioAnalysis?.beats || packageDataWithTranscription.audioAnalysis?.beats || [];

                  // Get audio onsets for precise word timing (FALLBACK only)
                  const vocalOnsets =
                    freshPackageData.audioAnalysis?.vocalOnsets ||
                    (packageDataWithTranscription.audioAnalysis as any)?.vocalOnsets ||
                    [];
                  const strongOnsets =
                    freshPackageData.audioAnalysis?.strongOnsets ||
                    (packageDataWithTranscription.audioAnalysis as any)?.strongOnsets ||
                    [];
                  const onsets = vocalOnsets.length > 0 ? vocalOnsets : strongOnsets;
                  const onsetSource = vocalOnsets.length > 0 ? 'VOCAL (Demucs)' : 'FULL-MIX';

                  // Get audio duration for timestamp scaling (critical for sync!) - use fresh data
                  const audioDuration =
                    freshPackageData.audioAnalysis?.duration ||
                    packageDataWithTranscription.audioAnalysis?.duration ||
                    musicDuration ||
                    130;
                  console.log(
                    `   Words: ${words.length}, Beats: ${beats.length}, ${onsets.length} ${onsetSource} onsets, Lyrics: ${originalLyrics ? 'yes' : 'no'}, Audio: ${audioDuration}s`,
                  );

                  // Get vocalStartOffset for timing correction (calculated from Whisper ground truth)
                  const vocalStartOffset = (freshPackageData.audioAnalysis as any)?.vocalStartOffset || 0;

                  // Check if forced alignment is available
                  if (forcedAlignment.length === 0) {
                    // GRACEFUL FALLBACK: Skip karaoke instead of crashing
                    const alignmentError = freshPackageData.audioAnalysis?.forcedAlignmentError;
                    if (alignmentError) {
                      console.warn(`   ⚠️ SKIPPING KARAOKE: Forced alignment failed - ${alignmentError}`);
                      console.warn(`   📹 Video will be rendered without karaoke subtitles`);
                    } else {
                      console.warn(`   ⚠️ SKIPPING KARAOKE: No forced alignment data available`);
                      console.warn(`   📹 Video will be rendered without karaoke subtitles`);
                    }
                    // Mark that we attempted alignment so we don't retry endlessly
                    if (!freshPackageData.audioAnalysis?.forcedAlignmentAttempted) {
                      freshPackageData.audioAnalysis = {
                        ...freshPackageData.audioAnalysis,
                        forcedAlignmentAttempted: true,
                      };
                      await storage.updateUnityContentPackage(unityMetadata.packageId, {
                        packageData: freshPackageData,
                      });
                    }
                    // Continue without karaoke - don't throw
                  } else {
                    // Apply vocal offset to forced alignment timestamps (syncs with actual audio)
                    if (vocalStartOffset > 0) {
                      console.log(
                        `   🎼 Applying vocal offset: +${vocalStartOffset.toFixed(2)}s to all ${forcedAlignment.length} words`,
                      );
                      forcedAlignment = forcedAlignment.map((w: any) => ({
                        word: w.word,
                        start: w.start + vocalStartOffset,
                        end: w.end + vocalStartOffset,
                      }));
                    }

                    console.log(
                      `   🎯 FORCED ALIGNMENT: ${forcedAlignment.length} words with EXACT timing from Wav2Vec2`,
                    );

                    // Generate karaoke subtitle file
                    const karaokeSubtitlePath = join(TempPaths.processing(), `karaoke_${job.id}_${Date.now()}.ass`);
                    const videoWidth = targetAspectRatio === '9:16' ? 1080 : 1920;
                    const videoHeight = targetAspectRatio === '9:16' ? 1920 : 1080;

                    await ffmpegProcessor.generateKaraokeSubtitles(
                      words,
                      karaokeSubtitlePath,
                      unityMetadata.karaokeStyle || 'bounce',
                      videoWidth,
                      videoHeight,
                      2, // linesPerScreen
                      beats,
                      originalLyrics, // Use original lyrics for proper text
                      audioDuration, // Audio duration for timestamp scaling
                      onsets, // Audio onsets for fallback timing
                      forcedAlignment, // PRIORITY: Exact timing from Wav2Vec2 forced alignment
                    );

                    // Burn subtitles into video
                    const karaokeOutputFilename = `unity_karaoke_${job.id}_${Date.now()}.mp4`;
                    const karaokeOutputPath = join(process.cwd(), 'data', 'videos', 'renders', karaokeOutputFilename);

                    await ffmpegProcessor.burnCaptions(outputPath, karaokeSubtitlePath, karaokeOutputPath);

                    if (existsSync(karaokeOutputPath)) {
                      // Replace final video URL with karaoke version
                      finalVideoUrl = `/api/videos/${karaokeOutputFilename}`;
                      console.log(`   ✅ Karaoke subtitles burned: ${finalVideoUrl}`);

                      // PIPELINE MONITORING: Karaoke subtitles complete
                      await pipelineMonitoringService.updateStep(job.id, 'karaoke_subtitles', 'success');

                      // Clean up original non-karaoke video
                      try {
                        const { unlinkSync } = await import('fs');
                        unlinkSync(outputPath);
                      } catch (e) {
                        // Ignore cleanup errors
                      }
                    } else {
                      console.warn(`   ⚠️ Karaoke burning failed - using video without subtitles`);
                    }

                    // Clean up subtitle file
                    try {
                      const { unlinkSync } = await import('fs');
                      unlinkSync(karaokeSubtitlePath);
                    } catch (e) {
                      // Ignore cleanup errors
                    }
                  } // End of else block for forced alignment success
                }
              } catch (karaokeErr: any) {
                console.error(`   ❌ Karaoke burning failed: ${karaokeErr.message}`);
                // PIPELINE MONITORING: Karaoke subtitles failed (non-blocking)
                await pipelineMonitoringService.updateStep(job.id, 'karaoke_subtitles', 'failed', karaokeErr.message);
                // Continue with video without subtitles
              }
            }
          } else {
            throw new Error('Final video file not created');
          }
        } catch (assemblyErr: any) {
          const errorMsg = assemblyErr.message || 'Video assembly failed';
          console.error(`   ❌ Assembly attempt ${assemblyAttempt} failed: ${errorMsg}`);

          if (assemblyAttempt < MAX_ASSEMBLY_RETRIES) {
            console.log(`   🔄 Retrying assembly (${MAX_ASSEMBLY_RETRIES - assemblyAttempt} attempts remaining)...`);
            // Clean up partial output file and cached segments before retry
            try {
              const retryOutputPath = join(
                process.cwd(),
                'data',
                'videos',
                'renders',
                `unity_final_${job.id}_${assemblyTimestamp}.mp4`,
              );
              if (existsSync(retryOutputPath)) {
                const { unlinkSync } = await import('fs');
                unlinkSync(retryOutputPath);
              }
              // Also clean cached segments to force rebuild from source clips
              const processingDir = TempPaths.processing();
              const { readdirSync } = await import('fs');
              const cachedFiles = readdirSync(processingDir).filter(
                (f) => f.startsWith(`job_${job.id}_`) && !f.includes('_normalized_'),
              );
              for (const file of cachedFiles) {
                try {
                  const { unlinkSync: unlink } = await import('fs');
                  unlink(join(processingDir, file));
                } catch {}
              }
              if (cachedFiles.length > 0) {
                console.log(`   🧹 Cleaned ${cachedFiles.length} cached segments for fresh retry`);
              }
            } catch {}
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s before retry
            assemblyError = undefined; // Clear error for retry
          } else {
            assemblyError = `${errorMsg} (failed after ${MAX_ASSEMBLY_RETRIES} attempts)`;
            console.error(`   ❌ All assembly attempts exhausted`);
            // PIPELINE MONITORING: FFmpeg assembly failed
            await pipelineMonitoringService.updateStep(job.id, 'ffmpeg_assembly', 'failed', assemblyError);
          }
        }
      } // End retry while loop

      if (finalVideoUrl) {
        console.log(`   ✅ Assembly succeeded on attempt ${assemblyAttempt}/${MAX_ASSEMBLY_RETRIES}`);
      }
    } else if (successfulClips.length === 1) {
      // Only one clip - use it directly
      finalVideoUrl = successfulClips[0].videoUrl;
      console.log(`   📹 Single clip - using directly: ${finalVideoUrl}`);
    }

    // ============================================
    // POST-GENERATION VIDEO QA: Verify video quality before completion
    // ============================================
    let hasAudioVerified = false;
    let audioCheckFailed = false;
    let finalVideoDuration: number | undefined;
    let videoPath: string | undefined;
    if (finalVideoUrl && successfulClips.length > 0) {
      try {
        const videoFilename = finalVideoUrl.split('/').pop();
        videoPath = join(process.cwd(), 'data', 'videos', 'renders', videoFilename || '');

        if (existsSync(videoPath)) {
          // Run comprehensive QA checks
          const { videoQAService } = await import('./video-qa-service');
          const isUnityKling = job.mode === 'unity_kling';
          // unity_kling jobs should ALWAYS have audio - if hasMusicTrack is false,
          // that itself is the upstream failure we need to catch
          const qaResult = await videoQAService.runQA(
            videoPath,
            job.id,
            isUnityKling, // unity_kling always expects audio
            undefined, // expectedDuration - let QA determine
          );

          finalVideoDuration = qaResult.duration;
          hasAudioVerified = qaResult.hasAudio;

          if (qaResult.criticalFailures.length > 0) {
            const failureMessages = qaResult.criticalFailures.map((f) => f.message).join('; ');
            console.error(`   ❌ VIDEO QA FAILED: ${failureMessages}`);

            // Check if missing audio is the issue
            const missingAudioFailure = qaResult.criticalFailures.find((f) => f.type === 'missing_audio');
            if (missingAudioFailure && isUnityKling) {
              console.error(`   🚨 BLOCKING: unity_kling job has NO AUDIO - cannot mark as completed`);
              assemblyError = 'Video assembled but has NO AUDIO - music generation failed upstream';
              audioCheckFailed = true;
            } else {
              assemblyError = `Video QA failed: ${failureMessages}`;
              audioCheckFailed = true;
            }
          } else {
            console.log(`   ✅ Video QA passed all checks`);
          }

          // Also run the legacy audio check for backward compat
          if (!audioCheckFailed) {
            const audioCheck = await ffmpegProcessor.verifyVideoHasAudio(videoPath);
            if (!audioCheck.hasAudio && isUnityKling) {
              console.error(`   ❌ CRITICAL: Final video has NO AUDIO (legacy check)!`);
              assemblyError = 'Final video has no audio stream';
              audioCheckFailed = true;
            } else if (audioCheck.syncStatus === 'mismatch') {
              console.warn(`   ⚠️ Audio/video duration mismatch: ${audioCheck.details}`);
            }
          }
        } else {
          console.warn(`   ⚠️ Cannot verify video - file not found at ${videoPath}`);
        }
      } catch (qaErr: any) {
        console.error(`   ❌ Video QA error: ${qaErr.message}`);
        // Continue with warning, don't block completion for QA errors
        hasAudioVerified = false;
      }
    }

    // Update package with final results
    const updatedPackageData = {
      ...packageData,
      generatedClips: generatedClips,
      generationProgress: 100,
      totalCost: totalCost,
      generatedAt: new Date().toISOString(),
      finalVideoUrl: finalVideoUrl,
      assemblyError: assemblyError,
      lastVideoEngine: videoEngine, // Track which engine was used for these clips
    };

    // Visual narrative QA (non-blocking, warn only)
    if (videoPath && existsSync(videoPath) && !assemblyError) {
      try {
        const { videoQAService } = await import('./video-qa-service');
        const narrativeQA = await videoQAService.runVisualNarrativeQA(
          videoPath,
          job.id,
          pkg.title || job.scriptName || '',
        );
        if (!narrativeQA.passed) {
          console.warn(`   ⚠️ NARRATIVE QA: Score ${narrativeQA.score}/100`);
          for (const issue of narrativeQA.issues) {
            console.warn(`      - ${issue.description}`);
          }
        }
        (updatedPackageData as any).narrativeQA = narrativeQA;
      } catch (nqaErr: any) {
        console.warn(`   ⚠️ Narrative QA skipped: ${nqaErr.message}`);
      }
    }

    // Determine final job status:
    // - 'completed' if clips exist, video assembled, AND audio present (for unity_kling)
    // - 'failed' if NO clips, OR if unity_kling job has no audio (silent video is unusable)
    const isUnityKlingJob = job.mode === 'unity_kling';
    const hasClipsAndVideo = successfulClips.length > 0 && !!finalVideoUrl;

    // CRITICAL FIX: unity_kling jobs WITHOUT audio should FAIL, not silently complete
    // This prevents uploading silent videos to YouTube
    // Two scenarios caught:
    // 1. hasMusicTrack=false: Music generation failed upstream (lyrics/Suno), video is inherently silent
    // 2. audioCheckFailed=true: Music was generated but FFmpeg failed to include it
    const silentUnityKlingBlock = isUnityKlingJob && (audioCheckFailed || !hasMusicTrack);
    const jobSucceeded = hasClipsAndVideo && !silentUnityKlingBlock;
    const jobStatus = jobSucceeded ? 'completed' : 'failed';
    const jobErrorMessage = !hasClipsAndVideo
      ? 'All clips failed to generate'
      : silentUnityKlingBlock && !hasMusicTrack
        ? 'BLOCKED: Music generation failed upstream (lyrics/Suno) - video has no audio and cannot be uploaded.'
        : silentUnityKlingBlock
          ? 'BLOCKED: Video has no audio track despite music being generated - FFmpeg assembly issue.'
          : assemblyError;

    // Update package status
    await storage.updateUnityContentPackage(unityMetadata.packageId, {
      packageData: updatedPackageData as any,
      status: jobSucceeded ? 'completed' : 'failed',
    });

    // Mark job as complete with final video URL
    await storage.updateJob(job.id, {
      status: jobStatus,
      progress: 100,
      cost: totalCost.toString(),
      clipCount: successfulClips.length,
      videoUrl: finalVideoUrl,
      videoDuration: finalVideoDuration,
      errorMessage: jobErrorMessage,
    } as any);

    // PIPELINE MONITORING: Complete job tracking
    await pipelineMonitoringService.completeJob(job.id, jobSucceeded, finalVideoUrl);

    // Record theme application for video insights audit trail
    if (successfulClips.length > 0) {
      try {
        const { videoInsightsService } = await import('./video-insights-service');
        const appliedThemes = videoInsightsService.getCurrentThemesForRecording();
        const wasInHoldout = videoInsightsService.shouldBeHoldout();

        // Use packageId as video identifier until YouTube upload provides video ID
        const videoIdentifier = unityMetadata.packageId;

        await videoInsightsService.recordThemeApplication(
          videoIdentifier,
          unityMetadata.packageId,
          appliedThemes,
          wasInHoldout,
        );

        console.log(
          `   📊 Recorded ${appliedThemes.length} themes for package ${unityMetadata.packageId}${wasInHoldout ? ' (HOLDOUT)' : ''}`,
        );
      } catch (themeErr: any) {
        console.error(`   ⚠️ Theme recording failed: ${themeErr.message}`);
      }

      // Run TNA breakdown if not exists and evaluate narrative quality
      // IMPORTANT: Only run after clips are persisted - narrative evaluation needs clip accuracy reports
      try {
        console.log(`\n📊 NARRATIVE QUALITY: Evaluating NC/SF for package ${unityMetadata.packageId}...`);

        // Check if clip accuracy reports exist before attempting narrative evaluation
        const { clipAccuracyReports } = await import('@shared/schema');

        const clipReportCount = await db
          .select()
          .from(clipAccuracyReports)
          .where(eq(clipAccuracyReports.packageId, unityMetadata.packageId));

        if (!clipReportCount || clipReportCount.length === 0) {
          console.log(`   ⚠️ No clip accuracy reports found for package - skipping narrative evaluation`);
          console.log(`   ℹ️  Narrative quality evaluation requires clip validation to run first`);
        } else {
          console.log(`   ✓ Found ${clipReportCount.length} clip accuracy reports`);

          // First ensure TNA breakdown exists
          const { narrativeTnaService } = await import('./narrative-tna-service');
          const tnaResult = await (narrativeTnaService as any).getOrCreateTnaBreakdown(
            unityMetadata.packageId,
            job.scriptContent || '',
          );

          if (tnaResult.tnas && tnaResult.tnas.length > 0) {
            // Now evaluate narrative quality with existing TNAs
            const { narrativeMetricsService } = await import('./narrative-metrics-service');
            const narrativeQuality = await narrativeMetricsService.evaluateNarrativeQuality(unityMetadata.packageId);

            // Only log detailed results if we got a real evaluation (not fallback)
            if (narrativeQuality.combined > 0) {
              console.log(`   📊 Narrative Coherence (NC): ${narrativeQuality.nc.score}/100`);
              console.log(`   📊 Script Faithfulness (SF): ${narrativeQuality.sf.score}/100`);
              console.log(`   📊 Combined Score: ${narrativeQuality.combined}/100 (${narrativeQuality.tier})`);
              console.log(
                `   ${narrativeQuality.passesQualityGate ? '✅ Passes quality gate' : '⚠️ Below quality gate threshold'}`,
              );

              // Store narrative quality in package data for future reference
              const packageWithNarrative = {
                ...updatedPackageData,
                narrativeQuality: {
                  nc: narrativeQuality.nc.score,
                  sf: narrativeQuality.sf.score,
                  combined: narrativeQuality.combined,
                  tier: narrativeQuality.tier,
                  passesGate: narrativeQuality.passesQualityGate,
                  evaluatedAt: narrativeQuality.evaluatedAt,
                },
              };

              await storage.updateUnityContentPackage(unityMetadata.packageId, {
                packageData: packageWithNarrative as any,
              });
            } else {
              console.log(`   ⚠️ Narrative evaluation returned fallback result: ${narrativeQuality.summary}`);
            }
          } else {
            console.log(`   ⚠️ No TNA breakdown available - skipping narrative quality evaluation`);
          }
        }
      } catch (narrativeErr: any) {
        // Narrative evaluation failure should NEVER break job completion
        console.error(`   ⚠️ Narrative quality evaluation failed (non-blocking): ${narrativeErr.message}`);
      }

      // Store vector embeddings for future similarity search
      try {
        console.log(`\n🧠 VECTOR MEMORY: Storing embeddings for package ${unityMetadata.packageId}...`);

        // Check for acoustic fingerprint data
        const acousticData = (packageData as any).acousticFingerprint || (packageData as any).librosaAnalysis;
        if (acousticData) {
          const fingerprint = {
            bpm: acousticData.bpm || acousticData.tempo || 120,
            energy_curve: acousticData.energy_curve || acousticData.energyCurve || 'building',
            hook_energy_ratio: acousticData.hook_energy_ratio || acousticData.hookEnergyRatio || 1.0,
            dna_scores: acousticData.dna_scores || acousticData.dnaScores || {},
            percussiveness_score: acousticData.percussiveness_score || acousticData.percussivenessScore || 0.5,
            brightness_score: acousticData.brightness_score || acousticData.brightnessScore || 0.5,
            first_energy_spike_seconds:
              acousticData.first_energy_spike_seconds || acousticData.firstEnergySpikeSeconds || 0,
            track_character: acousticData.track_character || acousticData.trackCharacter || 'unknown',
          };

          await vectorMemoryService.storeAcousticEmbedding(unityMetadata.packageId, fingerprint as any, {
            jobId: job.id,
            title: pkg?.title || job.scriptName || 'Unknown',
            clipCount: successfulClips.length,
          });
          console.log(`   ✅ Acoustic embedding stored`);
        }

        // Check for visual analysis data
        const visualData = (packageData as any).visualAnalysis || (packageData as any).thumbnailAnalysis;
        if (visualData) {
          await vectorMemoryService.storeVisualEmbedding(
            unityMetadata.packageId,
            {
              compositionScore: visualData.compositionScore || visualData.composition_score,
              colorImpact: visualData.colorImpact || visualData.color_impact,
              emotionalImpact: visualData.emotionalImpact || visualData.emotional_impact,
              curiosityGap: visualData.curiosityGap || visualData.curiosity_gap,
              thumbnailScore: visualData.thumbnailScore || visualData.overall_score,
              dominantColors: visualData.dominantColors || visualData.dominant_colors,
              visualElements: visualData.visualElements || visualData.visual_elements,
            },
            { jobId: job.id, title: pkg.title },
          );
          console.log(`   ✅ Visual embedding stored`);
        }

        // If we have both, also store combined
        if (acousticData && visualData) {
          const fingerprint = {
            bpm: acousticData.bpm || acousticData.tempo || 120,
            energy_curve: acousticData.energy_curve || acousticData.energyCurve || 'building',
            hook_energy_ratio: acousticData.hook_energy_ratio || acousticData.hookEnergyRatio || 1.0,
            dna_scores: acousticData.dna_scores || acousticData.dnaScores || {},
            percussiveness_score: acousticData.percussiveness_score || acousticData.percussivenessScore || 0.5,
            brightness_score: acousticData.brightness_score || acousticData.brightnessScore || 0.5,
            first_energy_spike_seconds:
              acousticData.first_energy_spike_seconds || acousticData.firstEnergySpikeSeconds || 0,
            track_character: acousticData.track_character || acousticData.trackCharacter || 'unknown',
          };

          await vectorMemoryService.storeCombinedEmbedding(
            unityMetadata.packageId,
            {
              compositionScore: visualData.compositionScore || visualData.composition_score,
              colorImpact: visualData.colorImpact || visualData.color_impact,
              emotionalImpact: visualData.emotionalImpact || visualData.emotional_impact,
              curiosityGap: visualData.curiosityGap || visualData.curiosity_gap,
              thumbnailScore: visualData.thumbnailScore || visualData.overall_score,
            },
            fingerprint as any,
            { jobId: job.id, title: pkg.title },
          );
          console.log(`   ✅ Combined embedding stored`);
        }

        if (!acousticData && !visualData) {
          console.log(`   ℹ️ No acoustic/visual data to store - package lacks fingerprint data`);
        }
      } catch (vectorErr: any) {
        console.error(`   ⚠️ Vector embedding storage failed (non-blocking): ${vectorErr.message}`);
      }
    }

    const assemblyStatus = finalVideoUrl ? '🎬 Final video assembled!' : assemblyError || 'No assembly';
    await this.logProgress(
      job.id,
      100,
      `Unity VEO complete: ${successfulClips.length} clips, $${totalCost.toFixed(2)} - ${assemblyStatus}`,
    );

    // AUTO-UPLOAD: Trigger YouTube upload for automation jobs (only if job succeeded)
    const veoAutomationSrc = job.unityMetadata?.automationSource;
    if (
      jobSucceeded &&
      finalVideoUrl &&
      successfulClips.length > 0 &&
      (veoAutomationSrc === 'unity_orchestrator' || veoAutomationSrc === 'video-scheduler')
    ) {
      // Get the actual file path from the URL
      const videoFilename = finalVideoUrl.replace('/api/videos/', '');
      const videoPath = join(process.cwd(), 'data', 'videos', 'renders', videoFilename);

      if (existsSync(videoPath)) {
        this.triggerAutoUpload(job, videoPath, undefined).catch((err) => {
          console.error(`⚠️  Auto-upload failed for ${job.id}:`, err);
        });

        // Also trigger Rumble cross-platform streaming
        this.triggerRumbleStream(job, videoPath).catch((err) => {
          console.error(`⚠️  Rumble stream failed for ${job.id}:`, err);
        });
      } else {
        console.warn(`⚠️  Auto-upload skipped: Video file not found at ${videoPath}`);
      }
    }
  }

  /**
   * Process Music Mode job - Lightweight beat-synced video generation
   * Pipeline: Suno music → beat analysis → theme selection → looped background → karaoke → YouTube
   */
  private async processMusicModeJob(job: Job, targetAspectRatio: '16:9' | '9:16') {
    console.log(`📋 Job ${job.id}: Music Mode generation`);

    // Music Mode supports three input methods:
    // 1. Unity package (pre-generated music + metadata)
    // 2. Direct music URL (download existing music)
    // 3. Generate from scriptContent (generate music using Suno)
    const hasMusic = !!job.musicUrl;
    const hasUnityPackage = !!(job as any).unityPackageId;
    const hasScriptContent = !!job.scriptContent;

    if (!hasMusic && !hasUnityPackage && !hasScriptContent) {
      throw new Error('Music Mode requires either musicUrl, unityPackageId, or scriptContent for generation');
    }

    let audioFilePath: string;
    let audioDuration: number;
    let lyrics: string | undefined = undefined; // ✅ FIX: Start as undefined, not empty string

    // ============================================
    // PHASE 1: GET OR GENERATE AUDIO
    // ============================================
    if (hasUnityPackage) {
      // Path 1: Fetch audio from Unity package
      await this.logProgress(job.id, 5, 'Loading Unity package...');

      const packageData = await storage.getUnityContentPackage((job as any).unityPackageId!);
      if (!packageData) {
        throw new Error(`Unity package ${(job as any).unityPackageId} not found`);
      }

      // Check if audio file exists
      const audioPath = packageData.audioFilePath;
      if (!audioPath || !existsSync(audioPath)) {
        throw new Error(`Audio file not found in Unity package: ${audioPath}`);
      }

      audioFilePath = audioPath;
      audioDuration = (packageData as any).audioDuration || 120;
      // ✅ FIX: Only use lyrics if they actually exist (not beat descriptions)
      lyrics =
        packageData.packageData?.lyrics?.raw ||
        ((job as any).lyrics && (job as any).lyrics.trim().length > 0 ? (job as any).lyrics : undefined);

      console.log(`✅ Unity package loaded: ${(job as any).unityPackageId}`);
      console.log(`   Audio: ${audioFilePath} (${audioDuration}s)`);
    } else if (hasMusic) {
      // Path 2: Download audio from URL (or reuse local file from previous attempt)
      await this.logProgress(job.id, 5, 'Downloading audio...');

      const tempDir = join(process.cwd(), 'data', 'temp', 'processing');
      await execAsync(`mkdir -p ${tempDir}`);

      audioFilePath = join(tempDir, `audio_${job.id}.mp3`);

      // Handle local file:// paths (saved from previous Suno generation)
      if (job.musicUrl!.startsWith('file://')) {
        const localPath = job.musicUrl!.replace('file://', '');
        if (existsSync(localPath)) {
          console.log(`♻️  Reusing local audio from previous attempt: ${localPath}`);
          if (localPath !== audioFilePath) {
            copyFileSync(localPath, audioFilePath);
          }
        } else {
          throw new Error(`Local audio file not found: ${localPath} (musicUrl was file:// but file is gone)`);
        }
      } else {
        // Download audio from remote musicUrl
        const response = await fetch(job.musicUrl!);
        if (!response.ok) {
          throw new Error(`Failed to download audio from ${job.musicUrl}: ${response.statusText}`);
        }

        const buffer = await response.arrayBuffer();
        const fs = await import('fs');
        fs.writeFileSync(audioFilePath, Buffer.from(buffer));
      }

      // Get duration from file
      const { getAudioDurationInSeconds } = await import('get-audio-duration');
      audioDuration = await getAudioDurationInSeconds(audioFilePath);
      // ✅ FIX: Only use lyrics if they actually exist (not beat descriptions)
      lyrics = (job as any).lyrics && (job as any).lyrics.trim().length > 0 ? (job as any).lyrics : undefined;

      console.log(`✅ Audio downloaded: ${audioFilePath} (${audioDuration}s)`);
    } else {
      // Path 3: Generate music from scriptContent using Suno
      // FIRST: Check if audio already exists from a previous retry (saves Suno credits!)
      const tempDir = join(process.cwd(), 'data', 'temp', 'processing');
      const existingAudioPath = join(tempDir, `audio_${job.id}.mp3`);
      if (existsSync(existingAudioPath)) {
        console.log(`♻️  Reusing existing audio from previous attempt: ${existingAudioPath}`);
        await this.logProgress(job.id, 5, 'Reusing audio from previous attempt (saving Suno credits)...');

        const { getAudioDurationInSeconds } = await import('get-audio-duration');
        audioFilePath = existingAudioPath;
        audioDuration = await getAudioDurationInSeconds(audioFilePath);
        lyrics = (job as any).lyrics && (job as any).lyrics.trim().length > 0 ? (job as any).lyrics : undefined;

        console.log(`✅ Audio reused: ${audioFilePath} (${audioDuration.toFixed(2)}s) — Suno credits saved!`);
      } else {
        // No existing audio — generate fresh with Suno
        // Cost guard check before Suno generation
        const { costGuard: cg } = await import('./cost-guard');
        const sunoCheck = await cg.canProceed(0.5, 'suno-music-generation', 'suno');
        if (!sunoCheck.allowed) {
          throw new Error(`[Cost Guard] Suno generation blocked: ${sunoCheck.reason}`);
        }

        await this.logProgress(job.id, 5, 'Generating music with Suno...');

        console.log(`🎵 Generating music from script: "${job.scriptContent?.substring(0, 80)}..."`);

        const { sunoApi } = await import('./suno-api');

        // Extract target duration from metadata OR scriptContent (format: "target 3:15 length")
        let targetDuration = 180; // Default to 3:00

        // First check metadata.targetDuration (preferred for programmatic jobs)
        if (job.metadata?.targetDuration) {
          targetDuration = job.metadata.targetDuration as number;
          console.log(
            `   🎯 Target duration from metadata: ${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')} (${targetDuration}s)`,
          );
        }
        // Fallback to audioDuration field (set by beat-scheduler)
        else if (job.audioDuration && parseInt(job.audioDuration, 10) > 0) {
          targetDuration = parseInt(job.audioDuration, 10);
          console.log(
            `   🎯 Target duration from audioDuration: ${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')} (${targetDuration}s)`,
          );
        }
        // Fallback to scriptContent pattern matching (for legacy jobs)
        else if (job.scriptContent) {
          const durationMatch = job.scriptContent.match(/target (\d+):(\d+) length/);
          if (durationMatch) {
            const minutes = parseInt(durationMatch[1], 10);
            const seconds = parseInt(durationMatch[2], 10);
            targetDuration = minutes * 60 + seconds;
            console.log(
              `   🎯 Target duration from scriptContent: ${minutes}:${String(seconds).padStart(2, '0')} (${targetDuration}s)`,
            );
          }
        }

        // Check if we need multiple songs for long-form content
        // Suno V5 can generate up to 8 minutes per song (2026 update)
        // Using 4 minutes per song for reliability and cost efficiency
        const SUNO_MAX_DURATION = 240; // Suno V5 can do 8 min, using 4 min for optimal results
        const needsMultipleSongs = targetDuration > SUNO_MAX_DURATION;
        // Use explicit numTracks from metadata if set (beat-scheduler knows best),
        // otherwise calculate from target duration
        const musicMeta = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;
        const explicitTracks = musicMeta?.numTracks ? Number(musicMeta.numTracks) : 0;
        const songCount =
          explicitTracks > 0 ? explicitTracks : needsMultipleSongs ? Math.ceil(targetDuration / SUNO_MAX_DURATION) : 1;

        if (needsMultipleSongs) {
          console.log(
            `🎵 Long-form content: Generating ${songCount} songs${explicitTracks ? ' (explicit numTracks)' : ' × 4min'} = ~${Math.ceil(targetDuration / 60)} minutes total`,
          );
        } else {
          console.log(
            `🎵 Single-song beat: Targeting ${targetDuration}s duration (${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')})`,
          );
        }

        try {
          const downloadedAudioPaths: string[] = [];
          const tempDir = join(process.cwd(), 'data', 'temp', 'processing');
          await execAsync(`mkdir -p ${tempDir}`);

          // Use robust retry handler for Suno generation
          const { sunoRetryHandler } = await import('./suno-retry-handler');

          // Clean style: remove "target X:XX length" before sending to Suno
          let cleanStyle = (job.scriptContent || 'lofi hip hop, chill beats, 90 BPM')
            .replace(/target\s+\d+:\d+\s+length\s*\|\s*/gi, '')
            .trim();

          // For instrumentals, ensure "instrumental" is in the style
          const hasLyrics = (job as any).lyrics && (job as any).lyrics.trim().length > 0;
          if (!hasLyrics && !cleanStyle.toLowerCase().includes('instrumental')) {
            cleanStyle += ', instrumental';
          }

          console.log(`   🎨 Clean style for Suno: "${cleanStyle.substring(0, 80)}..."`);

          // For long compilations (5+ songs), add variety to prevent repetitiveness
          const addVariety = songCount >= 5;

          // Style variations for different segments of long mixes
          const lofiVariations = [
            'jazzy piano, smooth rhodes, vinyl crackle, coffee shop',
            'ambient pads, gentle guitar, rain sounds, meditative',
            'upright bass, brush drums, late night study vibes',
            'mellow synths, soft keys, dreamy atmosphere',
            'chill guitar, lo-fi beats, sunset vibes',
            'rhodes keyboard, jazzy bass, tape hiss warmth',
            'piano melodies, ambient textures, peaceful mood',
            'soft percussion, atmospheric pads, floating feel',
          ];

          const trapVariations = [
            'dark synths, heavy 808s, crispy hi-hats',
            'melodic leads, smooth bass, atmospheric',
            'aggressive drums, distorted 808s, hard-hitting',
            'ambient textures, deep bass, spacey vibes',
            'bouncy rhythm, colorful synths, energetic',
            'emotional chords, soulful samples, introspective',
          ];

          // Import instrumental structure generator for duration control
          const { generateInstrumentalStructure } = await import('./suno-api');

          // Prepare songs for batch generation
          const songs = Array(songCount)
            .fill(0)
            .map((_, i) => {
              let variedStyle = cleanStyle;

              // Add variations for long compilations
              if (addVariety) {
                const isLofi = cleanStyle.toLowerCase().includes('lofi') || cleanStyle.toLowerCase().includes('chill');
                const isTrap = cleanStyle.toLowerCase().includes('trap');

                if (isLofi) {
                  const variation = lofiVariations[i % lofiVariations.length];
                  // Extract BPM if present
                  const bpmMatch = cleanStyle.match(/(\d+)\s*BPM/i);
                  const baseBpm = bpmMatch ? parseInt(bpmMatch[1]) : 75;
                  // Vary tempo by ±5 BPM for variety
                  const variedBpm = baseBpm + ((i % 3) - 1) * 3; // -3, 0, +3 BPM rotation
                  variedStyle = `lofi, ${variedBpm} BPM, ${variation}, instrumental chill beats`;
                  console.log(`   🎵 Song ${i + 1}/${songCount}: ${variedBpm} BPM - ${variation.split(',')[0]}`);
                } else if (isTrap) {
                  const variation = trapVariations[i % trapVariations.length];
                  const bpmMatch = cleanStyle.match(/(\d+)\s*BPM/i);
                  const baseBpm = bpmMatch ? parseInt(bpmMatch[1]) : 140;
                  const variedBpm = baseBpm + ((i % 3) - 1) * 5; // -5, 0, +5 BPM rotation
                  variedStyle = `trap, ${variedBpm} BPM, ${variation}`;
                  console.log(`   🎵 Song ${i + 1}/${songCount}: ${variedBpm} BPM - ${variation.split(',')[0]}`);
                }
              }

              // For single-song beats, use EXACT user-requested duration (don't cap it)
              // For multi-song compilations, each part targets 240s (4 min - Suno V5 reliable)
              // This ensures 3-min beat = 3min, 4-min beat = 4min, 30-min = 8×4min
              const songTargetDuration = needsMultipleSongs ? SUNO_MAX_DURATION : targetDuration;

              // Check if job has lyrics (full song) or is instrumental only
              const hasLyrics = (job as any).lyrics && (job as any).lyrics.trim().length > 0;
              const isInstrumental = !hasLyrics;

              // For instrumentals, match website behavior: put genre, bpm, duration in lyrics field
              // ✅ WEBSITE APPROACH: "trap 140 bpm 3 minutes" in lyrics, instrumental=false
              let promptText = hasLyrics ? (job as any).lyrics : '';
              if (isInstrumental) {
                promptText = generateInstrumentalStructure(songTargetDuration, variedStyle);
                if (i === 0) {
                  console.log(
                    `   🎵 Instrumental: "${promptText}" → target ${Math.floor(songTargetDuration / 60)}:${String(songTargetDuration % 60).padStart(2, '0')}`,
                  );
                  console.log(`   ✅ Matching website lyrics mode (no actual lyrics = instrumental)`);
                }
              } else if (i === 0) {
                console.log(`   🎤 Full song mode: Using ${(job as any).lyrics.length} characters of lyrics`);
              }

              return {
                params: {
                  lyrics: promptText, // "3 minute" for instrumentals, or actual lyrics for songs
                  style: variedStyle,
                  title: `${job.scriptName || 'Untitled Beat'} - Part ${i + 1}`,
                  // KEY: Set instrumental=FALSE so Suno respects duration (like website)
                  // With just "3 minute" as prompt, it won't generate vocals
                  instrumental: false, // Always false to match website behavior
                  model: 'V5',
                  targetDuration: songTargetDuration, // Adds duration hints to style
                },
                outputPath: join(tempDir, `music_${job.id}_part${i + 1}_${Date.now()}.mp3`),
              };
            });

          // Generate with robust retry handler
          const batchResult = await sunoRetryHandler.generateBatch(
            songs,
            {
              maxRetries: 3, // 3 attempts per song
              baseTimeout: 300000, // 5 minutes for single songs
              multiSongTimeout: 3600000, // 60 minutes for multi-song (supports up to 20 songs @ 3min each)
              backoffMs: [2000, 5000, 10000], // 2s, 5s, 10s backoff
              circuitBreakerThreshold: 8, // Stop after 8 consecutive failures (increased for long batches)
            },
            (songNum, total, result) => {
              // Progress callback - scale to never exceed 100%
              // Reserve: 5% for init, 65% for songs, 10% for concat, 20% for video
              const progressPerSong = 65 / total; // Each song gets equal share of 65%
              const progressBase = 5 + (songNum - 1) * progressPerSong;
              const progressIncrement = Math.min(progressPerSong * 0.8, 8); // 80% of allocated progress or 8%, whichever is smaller

              if (result.success) {
                const finalProgress = Math.min(69, Math.floor(progressBase + progressIncrement)); // Cap at 69% (before concat)
                this.logProgress(
                  job.id,
                  finalProgress,
                  `Song ${songNum}/${total} completed in ${(result.totalTime / 1000).toFixed(1)}s`,
                );
                downloadedAudioPaths.push(result.audioPath!);
              } else {
                const failProgress = Math.min(69, Math.floor(progressBase + progressIncrement * 0.6)); // Slightly less for failures
                this.logProgress(job.id, failProgress, `Song ${songNum}/${total} failed: ${result.errorType}`);
              }
            },
          );

          console.log(`\n📊 Batch generation results:`);
          console.log(`   ✅ Success: ${batchResult.totalSuccess}/${songCount}`);
          console.log(`   ❌ Failed: ${batchResult.totalFailed}/${songCount}`);
          console.log(`   ⏱️  Total time: ${(batchResult.totalTime / 1000).toFixed(1)}s`);
          console.log(`   🔴 Circuit broken: ${batchResult.circuitBroken ? 'YES' : 'NO'}`);

          // Check if we have any songs
          if (downloadedAudioPaths.length === 0) {
            throw new Error('All songs failed to generate - no audio available');
          }

          // If partial failure, log warning but continue with what we have
          if (batchResult.totalFailed > 0 && !batchResult.circuitBroken) {
            console.log(`\n⚠️  PARTIAL SUCCESS: ${batchResult.totalSuccess}/${songCount} songs generated`);
            console.log(`   Continuing with ${batchResult.totalSuccess} completed songs...`);

            // Update job metadata to note partial completion
            await storage.updateJob(job.id, {
              metadata: {
                ...(job.metadata || {}),
                partialGeneration: true,
                requestedSongs: songCount,
                completedSongs: batchResult.totalSuccess,
                failedSongs: batchResult.totalFailed,
              } as any,
            } as any);
          }

          // If circuit breaker triggered, fail the job
          if (batchResult.circuitBroken) {
            throw new Error(
              `Circuit breaker triggered after ${batchResult.totalFailed} consecutive failures. Completed ${batchResult.totalSuccess}/${songCount} songs.`,
            );
          }

          // Concatenate multiple songs if needed
          if (downloadedAudioPaths.length > 1) {
            console.log(`\n🎵 Concatenating ${downloadedAudioPaths.length} songs into one mix...`);
            await this.logProgress(job.id, 70, 'Combining songs into final mix...');

            const { ffmpegProcessor } = await import('./ffmpeg-processor');
            audioFilePath = join(tempDir, `music_${job.id}_complete_${Date.now()}.mp3`);

            await ffmpegProcessor.concatenateAudioFiles(downloadedAudioPaths, audioFilePath);

            // Clean up individual song files
            for (const songPath of downloadedAudioPaths) {
              try {
                unlinkSync(songPath);
              } catch (e) {
                console.warn(`   ⚠️  Could not delete temp song: ${songPath}`);
              }
            }
          } else {
            // Single song, use it directly
            audioFilePath = downloadedAudioPaths[0];
          }

          // Get final audio duration
          const { getAudioDurationInSeconds } = await import('get-audio-duration');
          audioDuration = await getAudioDurationInSeconds(audioFilePath);
          lyrics = ''; // Instrumental beat

          console.log(`✅ Music generated and ready: ${audioFilePath} (${audioDuration.toFixed(2)}s)`);

          // Save audio to stable path so retries reuse it instead of regenerating with Suno
          const stableAudioPath = join(tempDir, `audio_${job.id}.mp3`);
          if (audioFilePath !== stableAudioPath) {
            const fs = await import('fs');
            fs.copyFileSync(audioFilePath, stableAudioPath);
            console.log(`💾 Audio saved for retry reuse: ${stableAudioPath}`);
          }

          // Update job record with musicUrl so Path 2 is taken on retry
          await storage.updateJob(job.id, {
            musicUrl: `file://${stableAudioPath}`,
          });
          console.log(`💾 Job updated with audio path for retry reuse`);
        } catch (error: any) {
          console.error(`❌ Suno API error: ${error.message}`);

          // Add helpful error messages based on error type
          let helpfulMessage = error.message;

          if (error.message.includes('timeout')) {
            helpfulMessage += '\n💡 Tip: Suno API may be overloaded. Try again in a few minutes.';
          } else if (error.message.includes('API key') || error.message.includes('credits')) {
            helpfulMessage += '\n💡 Tip: Check your SUNO_API_KEY in Secret Manager and verify you have credits.';
          } else if (error.message.includes('No tracks')) {
            helpfulMessage += '\n💡 Tip: Check Suno dashboard for failed generations: https://suno.ai/';
          }

          throw new Error(`Suno music generation failed: ${helpfulMessage}`);
        }
      } // close the else block for "no existing audio"
    }

    // ============================================
    // PHASE 2: RUN MUSIC MODE GENERATOR
    // ============================================
    const { musicModeGenerator } = await import('./music-mode-generator');

    // Check if this is instrumental (beats should NOT have karaoke subtitles)
    // CLEAN APPROACH: job.lyrics is the ORIGINAL user input (empty for instrumentals)
    const isInstrumental =
      job.metadata?.isInstrumental || !(job as any).lyrics || (job as any).lyrics.trim().length === 0;

    // ✅ CLEAN MODE: Clear instrumental markers before video generation
    // generateInstrumentalStructure() returns [Instrumental] markers for Suno duration control
    // but these should NOT be rendered as karaoke subtitles
    if (isInstrumental) {
      console.log(`🎵 INSTRUMENTAL MODE: Clearing [Instrumental] markers (${lyrics?.length || 0} chars)`);
      lyrics = undefined; // Clear markers before video generation
    }

    console.log(`🎵 Mode: ${isInstrumental ? 'INSTRUMENTAL (no lyrics)' : 'LYRICAL (with karaoke)'}`);

    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath,
        audioDuration,
        lyrics, // Now guaranteed to be undefined for instrumentals
        instrumental: isInstrumental, // Explicitly set instrumental flag
        customVisualPrompt: job.unityMetadata?.customVisualPrompt, // Pass custom themed visual
        singleClip: job.metadata?.singleClip, // Force single clip mode (saves credits)
      },
      targetAspectRatio,
      async (percent: number, message: string) => {
        // Scale music mode progress from 80-100% (it reports 0-100%, we map to final 20%)
        const scaledProgress = 80 + Math.floor(percent * 0.2);
        const cappedProgress = Math.min(99, scaledProgress); // Never reach 100% until job completes
        await this.logProgress(job.id, cappedProgress, message);
      },
    );

    console.log(`✅ Music Mode generation complete!`);
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Theme: ${result.theme}`);
    console.log(`   Processing time: ${(result.metadata.processingTimeMs / 1000).toFixed(1)}s`);

    // ============================================
    // PHASE 3: UPDATE JOB WITH RESULTS
    // ============================================
    // Calculate actual cost based on clips generated and video source
    // Suno: 10 credits per song = $0.05
    // Video: depends on source — gemini: $0.02, kling: $0.275, gradient: $0
    const clipCount = (result.metadata as any).clipCount || 1;
    const videoSourceType = (result.metadata as any).videoSource || 'kling';
    const sunoSongs = Math.ceil(audioDuration / 240); // 1 song per 4 minutes (updated for V5 capabilities)
    const sunoCost = sunoSongs * 0.05;
    const videoCostPerClip = videoSourceType === 'gemini' ? 0.02 : videoSourceType === 'kling' ? 0.275 : 0;
    const videoCost = clipCount * videoCostPerClip;
    const cost = sunoCost + videoCost;

    console.log(`💰 Cost breakdown:`);
    console.log(`   Suno: ${sunoSongs} songs × $0.05 = $${sunoCost.toFixed(2)}`);
    console.log(
      `   Video (${videoSourceType}): ${clipCount} clips × $${videoCostPerClip.toFixed(3)} = $${videoCost.toFixed(2)}`,
    );
    console.log(`   Total: $${cost.toFixed(2)}`);

    // Auto-correct title and metadata to reflect actual duration
    let correctedTitle = job.scriptName!;
    let correctedMetadata = job.metadata || {};

    // If this was a long-form music job, update title with actual duration
    if (job.metadata?.targetDuration && audioDuration > 600) {
      const actualMinutes = Math.floor(audioDuration / 60);
      const actualSeconds = Math.floor(audioDuration % 60);
      const actualFormatted = `${actualMinutes}:${String(actualSeconds).padStart(2, '0')}`;

      // Replace "30-Minute" or "XX-Minute" pattern in title
      if (correctedTitle!.match(/\d+-Minute/)) {
        correctedTitle = correctedTitle!.replace(/\d+-Minute/, `${actualMinutes}-Minute`);
        console.log(`📝 Auto-corrected title: "${job.scriptName}" → "${correctedTitle}"`);
      }

      // Update metadata with actual values
      correctedMetadata = {
        ...correctedMetadata,
        targetDuration: job.metadata.targetDuration, // Keep original target
        actualDuration: Math.round(audioDuration), // Add actual result
        requestedSongs: Math.ceil((job.metadata.targetDuration || 0) / 300), // Based on 5-min songs
        completedSongs: sunoSongs,
        actualFormatted, // Human-readable "22:46"
      };
    }

    // Get ACTUAL video duration (not audio duration, which may differ slightly)
    let actualVideoDuration = audioDuration; // fallback
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${result.videoPath}"`,
      );
      actualVideoDuration = parseFloat(stdout.trim()) || audioDuration;
      console.log(`📹 Actual video duration: ${actualVideoDuration.toFixed(2)}s (audio: ${audioDuration.toFixed(2)}s)`);
    } catch (err) {
      console.warn(`⚠️  Could not probe video duration, using audio duration`);
    }

    await storage.updateJob(job.id, {
      status: 'completed',
      scriptName: correctedTitle, // ✅ Update with corrected title
      videoPath: result.videoPath, // ✅ FIX: Save full video path
      thumbnailPath: result.thumbnailPath, // ✅ FIX: Save full thumbnail path
      videoUrl: `/api/videos/${basename(result.videoPath)}`,
      thumbnailUrl: `/api/thumbnails/${basename(result.thumbnailPath)}`,
      cost: cost.toFixed(2),
      audioDuration: audioDuration.toFixed(2), // decimal field (numeric) - 2 decimal places
      duration: Math.round(actualVideoDuration), // ✅ FIX: Use actual video duration, not audio
      videoDuration: actualVideoDuration, // ✅ Actual video duration in seconds (for accurate display)
      progress: 100,
      completedAt: new Date(),
      metadata: correctedMetadata as any, // ✅ Update with corrected metadata
      musicAnalysis: {
        bpm: result.beatAnalysis.bpm,
        key: result.beatAnalysis.key,
        beatTimestamps: result.beatAnalysis.beats,
        structure: {
          sections: result.beatAnalysis.segments.map((seg) => ({
            type: seg.type,
            start: seg.start,
            end: seg.end,
            energy: seg.energy,
          })),
        },
      } as any,
      unityMetadata: {
        ...job.unityMetadata,
        musicModeTheme: result.theme,
        loopCount: result.metadata.loopCount,
      } as any,
    } as any);

    console.log(`✅ Music Mode job ${job.id} completed!`);
    console.log(`   Cost: $${cost.toFixed(2)} (93% cheaper than Kling)`);
    console.log(`   Theme: ${result.theme}`);

    // Run post-job scenario checks (catches cost waste, retry bugs, pipeline violations)
    try {
      const { postJobScenarioChecker } = await import('./post-job-scenario-checker');
      const updatedJob = await storage.getJob(job.id);
      if (updatedJob) {
        await postJobScenarioChecker.checkJob(updatedJob as any);
      }
    } catch (scenarioErr: any) {
      console.warn(`⚠️  Post-job scenario check failed: ${scenarioErr.message}`);
    }

    // ============================================================================
    // AUTO-UPLOAD: Upload beat to correct YouTube channel with scheduled publish
    // ============================================================================
    const beatAutomationSrc = job.unityMetadata?.automationSource;
    if (beatAutomationSrc === 'beat-scheduler' && result.videoPath && existsSync(result.videoPath)) {
      this.triggerBeatAutoUpload(job, result.videoPath).catch((err) => {
        console.error(`⚠️  Beat auto-upload failed for ${job.id}:`, err.message);
      });
    }

    // ============================================================================
    // USER COST TRACKING & CHARGING (SaaS Platform - Music Mode)
    // ============================================================================
    if (job.userId) {
      try {
        console.log(`💰 [User Billing] Calculating costs for user ${job.userId}...`);

        // Calculate exact costs from API usage (returns totalCostUSD and userChargeUSD)
        const costBreakdown = await userCostTracker.calculateJobCost(job.id);
        const profit = costBreakdown.userChargeUSD - costBreakdown.totalCostUSD;

        console.log(`   Actual Cost: $${costBreakdown.totalCostUSD.toFixed(2)}`);
        console.log(`   User Charge: $${costBreakdown.userChargeUSD.toFixed(2)}`);
        console.log(`   Profit: $${profit.toFixed(2)}`);

        // Charge user (uses free credit or Stripe)
        const chargeResult = await userCostTracker.chargeUserForJob(job.userId, job.id);

        if (chargeResult.usedFreeCredit) {
          console.log(`   ✅ Used free credit (${chargeResult.creditsRemaining} remaining)`);
        } else if (chargeResult.charged) {
          console.log(`   ✅ Charged $${costBreakdown.userChargeUSD.toFixed(2)} via Stripe`);
        }
      } catch (billingError: any) {
        console.error(`   ⚠️ Billing error: ${billingError.message}`);
        console.error(`   Job completed but user was not charged. Manual intervention required.`);
        // Don't fail the job - the content was successfully generated
        // Admin can manually charge the user later
      }
    }

    // ============================================================================
    // ERROR FIX BANDIT - Track auto-fix success (Music Mode)
    // ============================================================================
    if (job.metadata?.autoFixAttempted && job.metadata?.autoFixStrategy) {
      try {
        const { errorFixBandit } = await import('./error-fix-bandit');

        const strategyId = job.metadata.autoFixStrategy as string;
        const fixTimestamp = new Date(job.metadata.autoFixTimestamp as string);
        const fixTime = (Date.now() - fixTimestamp.getTime()) / 1000; // seconds

        console.log(`[Job Worker] 🎉 Music Mode job ${job.id} succeeded after auto-fix!`);
        console.log(`   Strategy: ${strategyId}, Fix time: ${fixTime.toFixed(1)}s`);

        // Update bandit with positive reward
        errorFixBandit.updateReward(strategyId, {
          jobSucceeded: true,
          fixTime: fixTime,
          errorResolved: true,
        });
      } catch (trackErr: any) {
        console.error('[Job Worker] Failed to track auto-fix success:', trackErr.message);
      }
    }
    // ============================================================================

    // ============================================
    // PHASE 4: AUTO-UPLOAD TO YOUTUBE (if enabled)
    // ============================================
    if (job.autoUpload) {
      try {
        // Check if upload is scheduled for later
        const scheduledUploadTime = (job.unityMetadata as any)?.scheduledUploadTime;
        if (scheduledUploadTime) {
          const scheduledTime = new Date(scheduledUploadTime);
          const now = new Date();

          if (now < scheduledTime) {
            const minutesUntil = Math.round((scheduledTime.getTime() - now.getTime()) / (60 * 1000));
            console.log(`⏰ Upload scheduled for ${scheduledTime.toLocaleTimeString()} (in ${minutesUntil} minutes)`);
            console.log(`   Job completed, waiting for scheduled upload time...`);

            // Mark job as completed but not uploaded yet
            await storage.updateJob(job.id, {
              status: 'completed',
              progress: 100,
              completedAt: new Date(),
              unityMetadata: {
                ...job.unityMetadata,
                pendingScheduledUpload: true,
              } as any,
            } as any);

            return; // Exit early, upload will happen when scheduler picks it up
          }
        }

        console.log(`📤 Auto-uploading to YouTube...`);
        const { existsSync, readFileSync, writeFileSync, createReadStream } = await import('fs');
        const { join } = await import('path');
        const { google } = await import('googleapis');

        // Load connected channels
        const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
        if (!existsSync(channelsFile)) {
          console.log('⚠️  No connected YouTube channels found, skipping upload');
        } else {
          const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
          const activeChannels = channels.filter((c: any) => c.status === 'active');

          if (activeChannels.length === 0) {
            console.log('⚠️  No active YouTube channels, skipping upload');
          } else {
            // Pick channel based on content type and beat genre metadata
            const isHistory = job.mode === 'unity_kling';
            const beatChannelId = (job.unityMetadata as any)?.channelId;

            let selectedChannel;
            if (beatChannelId) {
              // Beat jobs specify their target channel directly via metadata
              selectedChannel = activeChannels.find((c: any) => c.id === beatChannelId) || activeChannels[0];
            } else if (isHistory) {
              selectedChannel = activeChannels.find((c: any) => /rapping|history/i.test(c.title)) || activeChannels[0];
            } else {
              selectedChannel = activeChannels[0];
            }

            console.log(`🎯 Auto-upload channel: ${selectedChannel.title}`);

            // Generate YouTube metadata via AI
            const { youtubeMetadataGenerator } = await import('./youtube-metadata-generator');
            const metadata = await youtubeMetadataGenerator.generateMetadata({
              jobName: job.scriptName || 'AI Video',
              mode: job.mode || 'unity_kling',
              aspectRatio: job.aspectRatio || '9:16',
              unityMetadata: job.unityMetadata || undefined,
              duration: job.duration || undefined,
            });
            const ytMetadata = Array.isArray(metadata) ? metadata[0] : metadata;

            // Create OAuth2 client with connected channel credentials
            const oauth2Client = new google.auth.OAuth2(
              process.env.YOUTUBE_CLIENT_ID,
              process.env.YOUTUBE_CLIENT_SECRET,
              process.env.YOUTUBE_REDIRECT_URI,
            );
            oauth2Client.setCredentials({
              access_token: selectedChannel.accessToken,
              refresh_token: selectedChannel.refreshToken,
              expiry_date: selectedChannel.expiryDate,
            });

            const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
            const { statSync } = await import('fs');
            const fileSizeInMB = statSync(result.videoPath).size / (1024 * 1024);
            console.log(`📊 File size: ${fileSizeInMB.toFixed(2)} MB`);

            const uploadResponse = await youtube.videos.insert({
              part: ['snippet', 'status'],
              requestBody: {
                snippet: {
                  title: ytMetadata.title,
                  description: ytMetadata.description,
                  tags: ytMetadata.tags || [],
                  categoryId: ytMetadata.categoryId || '10',
                },
                status: {
                  privacyStatus: 'public',
                  selfDeclaredMadeForKids: false,
                },
              },
              media: { body: createReadStream(result.videoPath) },
            });

            const videoId = uploadResponse.data.id;

            if (videoId) {
              const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
              console.log(`✅ Uploaded to ${selectedChannel.title}: ${videoUrl}`);

              // Set thumbnail if available
              if (result.thumbnailPath && existsSync(result.thumbnailPath)) {
                try {
                  await youtube.thumbnails.set({
                    videoId,
                    media: { body: createReadStream(result.thumbnailPath) },
                  });
                  console.log(`🖼️ Thumbnail set successfully`);
                } catch (thumbErr: any) {
                  console.log(`⚠️ Failed to set thumbnail: ${thumbErr.message}`);
                }
              }

              // Update job with YouTube info
              await storage.updateJob(job.id, {
                youtubeVideoId: videoId,
                youtubeUrl: videoUrl,
                uploadedAt: new Date(),
                youtubeChannelConnectionId: selectedChannel.id,
                unityMetadata: {
                  ...job.unityMetadata,
                  youtubeChannel: selectedChannel.title,
                  youtubeTitle: ytMetadata.title,
                } as any,
              } as any);

              // Save refreshed token back to channels file
              const updatedCreds = oauth2Client.credentials;
              if (updatedCreds.access_token && updatedCreds.access_token !== selectedChannel.accessToken) {
                const idx = channels.findIndex((c: any) => c.id === selectedChannel.id);
                if (idx !== -1) {
                  channels[idx].accessToken = updatedCreds.access_token;
                  channels[idx].expiryDate = updatedCreds.expiry_date;
                  writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
                  console.log(`🔑 Token refreshed and saved for ${selectedChannel.title}`);
                }
              }
            } else {
              console.error(`❌ YouTube upload returned no video ID`);
            }
          }
        }
      } catch (error: any) {
        console.error(`❌ YouTube upload error: ${error.message}`);
      }
    } else {
      console.log(`✅ Music Mode video ready for manual review/upload`);
    }
  }
}

// Singleton instance
export const jobWorker = new JobWorker();
