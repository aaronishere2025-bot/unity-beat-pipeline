/**
 * ROBUST SUNO RETRY HANDLER
 *
 * Provides resilient error handling for Suno API with:
 * - Per-song retry logic (3 attempts per song)
 * - Exponential backoff (2s → 5s → 10s)
 * - Circuit breaker (stop after 5 consecutive failures)
 * - Partial save (keep completed songs even if one fails)
 * - Error classification (timeout vs API error vs generation failure)
 * - Health monitoring
 */

import { sunoApi, generateInstrumentalStructure } from './suno-api';
// @ts-ignore - SunoTrack is declared locally in suno-api
type SunoTrack = any;

export interface SunoRetryConfig {
  maxRetries: number; // Max retries per song (default: 3)
  baseTimeout: number; // Base timeout in ms (default: 300000 = 5min)
  multiSongTimeout: number; // Timeout for multi-song in ms (default: 600000 = 10min)
  backoffMs: number[]; // Backoff delays (default: [2000, 5000, 10000])
  circuitBreakerThreshold: number; // Consecutive failures before stopping (default: 5)
}

export interface SongGenerationResult {
  success: boolean;
  track?: SunoTrack;
  audioPath?: string;
  taskId?: string; // NEW: Store taskId for recycling on retry
  error?: string;
  errorType?: 'timeout' | 'api_error' | 'generation_failed' | 'download_failed' | 'credits_insufficient';
  attempts: number;
  totalTime: number;
  creditsSaved?: number; // NEW: Track credits saved by recycling
}

export interface BatchGenerationResult {
  completedSongs: SongGenerationResult[];
  failedSongs: SongGenerationResult[];
  totalSuccess: number;
  totalFailed: number;
  circuitBroken: boolean;
  totalTime: number;
  creditsSpent?: number; // NEW: Total credits used in this batch
  creditsWasted?: number; // NEW: Credits wasted on failed retries
}

const DEFAULT_CONFIG: SunoRetryConfig = {
  maxRetries: 3,
  baseTimeout: 300000, // 5 minutes
  multiSongTimeout: 600000, // 10 minutes
  backoffMs: [2000, 5000, 10000], // 2s, 5s, 10s
  circuitBreakerThreshold: 5,
};

class SunoRetryHandler {
  private consecutiveFailures = 0;
  private lastFailureTime: Date | null = null;

  /**
   * Generate a single song with retry logic
   */
  async generateSongWithRetry(
    params: {
      lyrics?: string;
      style: string;
      title: string;
      instrumental?: boolean;
      model?: string;
      targetDuration?: number;
      previousTaskId?: string; // NEW: Reuse existing task if available
    },
    songNumber: number,
    totalSongs: number,
    outputPath: string,
    config: Partial<SunoRetryConfig> = {},
  ): Promise<SongGenerationResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    // Determine timeout based on song count
    const timeoutMs = totalSongs > 1 ? cfg.multiSongTimeout : cfg.baseTimeout;
    const timeoutLabel = totalSongs > 1 ? '10 minutes' : '5 minutes';

    console.log(`\n🎵 Generating song ${songNumber}/${totalSongs} (timeout: ${timeoutLabel})...`);

    // NEW: Track task ID across retry attempts to avoid wasting credits
    let taskId = params.previousTaskId;

    for (let attempt = 1; attempt <= cfg.maxRetries; attempt++) {
      try {
        console.log(`   📋 Attempt ${attempt}/${cfg.maxRetries}`);

        // Step 1: Check if we have an existing task from previous retry
        if (taskId && attempt > 1) {
          console.log(`   ♻️  RECYCLING existing task: ${taskId} (CREDIT SAVING!)`);
          console.log(`   ℹ️  Checking if generation already completed...`);

          try {
            // Try to fetch existing generation result
            const existingResult = await sunoApi.getTaskStatus(taskId);
            if (existingResult.status === 'complete' && existingResult.tracks.length > 0) {
              console.log(`   ✅ Found completed generation! Skipping new generation (saved 10 credits)`);
              const tracks = existingResult.tracks;

              // Duration-aware track selection for recycled tasks too
              let audioResult = tracks[0];
              if (tracks.length > 1 && params.targetDuration) {
                const target = params.targetDuration;
                let bestError = Math.abs((audioResult.duration || 0) - target);
                for (let t = 1; t < tracks.length; t++) {
                  const error = Math.abs((tracks[t].duration || 0) - target);
                  if (error < bestError) {
                    bestError = error;
                    audioResult = tracks[t];
                  }
                }
              }
              if (audioResult.audioUrl) {
                console.log(`   ✅ Audio already generated: ${audioResult.id} (${audioResult.duration}s)`);
                const downloadResult = await this.downloadWithRetry(audioResult.audioUrl, outputPath, 3);

                if (downloadResult.success) {
                  const totalTime = Date.now() - startTime;
                  this.consecutiveFailures = 0;
                  return {
                    success: true,
                    track: audioResult,
                    audioPath: outputPath,
                    attempts: attempt,
                    totalTime,
                  };
                } else {
                  throw new Error(`Download failed for recycled generation: ${downloadResult.error}`);
                }
              }
            }
          } catch (recycleError: any) {
            console.log(`   ⚠️  Could not recycle task: ${recycleError.message}`);
            console.log(`   🔄 Creating new generation...`);
            taskId = undefined; // Clear taskId to create new generation
          }
        }

        // Step 1b: Submit NEW generation request (only if no recycled task)
        if (!taskId || attempt === 1) {
          console.log(`   🆕 Creating new Suno generation (10 credits)...`);
          const result = await Promise.race([
            sunoApi.generateSong(params as any),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Suno submission timeout after 30s')), 30000),
            ),
          ]);

          if (!result || !result.taskId) {
            throw new Error('No task ID returned from Suno API - check API key and credits');
          }

          taskId = result.taskId;
          console.log(`   📋 Task created: ${taskId}`);
        }

        // Step 2: Wait for completion (uses taskId whether recycled or new)
        // Note: waitForCompletion already has built-in timeout (maxWaitMs parameter)
        // No need for Promise.race wrapper - just use the method directly
        const tracks = await sunoApi.waitForCompletion(taskId!, timeoutMs);

        if (!tracks || tracks.length === 0) {
          throw new Error('No tracks returned from Suno - generation may have failed');
        }

        // Duration-aware track selection: pick the track closest to targetDuration
        let audioResult = tracks[0];
        if (tracks.length > 1 && params.targetDuration) {
          const target = params.targetDuration;
          let bestError = Math.abs((audioResult.duration || 0) - target);
          for (let t = 1; t < tracks.length; t++) {
            const error = Math.abs((tracks[t].duration || 0) - target);
            if (error < bestError) {
              bestError = error;
              audioResult = tracks[t];
              console.log(
                `   🎯 Selected track ${t} (${tracks[t].duration}s) - closer to ${target}s target than track 0 (${tracks[0].duration}s)`,
              );
            }
          }
          // Log duration accuracy
          const errorPct = target > 0 ? ((bestError / target) * 100).toFixed(1) : '?';
          const status = bestError <= 20 ? '✅' : '⚠️';
          console.log(
            `   ${status} Duration accuracy: ${audioResult.duration}s / ${target}s target (${errorPct}% error)`,
          );

          // Smart retry: if outside ±20s tolerance and this is the first attempt, retry once
          if (bestError > 20 && attempt === 1) {
            const delta = (audioResult.duration || 0) - target;
            console.log(
              `   ⚠️ Duration miss (${delta > 0 ? 'too long' : 'too short'} by ${Math.abs(delta).toFixed(0)}s) — retrying with adjusted structure`,
            );
            const adjustedTarget = target + (delta < 0 ? 30 : -30);
            try {
              const adjustedLyrics = params.lyrics?.includes('[')
                ? generateInstrumentalStructure(adjustedTarget, params.style)
                : params.lyrics;
              const retryResult = await sunoApi.generateSong({
                ...params,
                lyrics: adjustedLyrics,
                targetDuration: adjustedTarget,
              } as any);
              const retryTracks = await sunoApi.waitForCompletion(retryResult.taskId, timeoutMs);
              if (retryTracks && retryTracks.length > 0) {
                const retryBest = retryTracks.reduce((best, t) =>
                  Math.abs((t.duration || 0) - target) < Math.abs((best.duration || 0) - target) ? t : best,
                );
                const retryError = Math.abs((retryBest.duration || 0) - target);
                console.log(
                  `   🔄 Retry duration: ${retryBest.duration}s (error=${retryError.toFixed(0)}s vs original ${bestError.toFixed(0)}s)`,
                );
                if (retryError < bestError) {
                  audioResult = retryBest;
                  console.log(`   ✅ Retry improved duration — using retry track`);
                } else {
                  console.log(`   ℹ️ Retry didn't improve — keeping original`);
                }
              }
            } catch (retryErr: any) {
              console.warn(`   ⚠️ Duration retry failed: ${retryErr.message} — keeping original`);
            }
          }
        }

        if (!audioResult.audioUrl) {
          throw new Error(`No audio URL in result (status: ${(audioResult as any).status || 'unknown'})`);
        }

        console.log(`   ✅ Audio generated: ${audioResult.id} (${audioResult.duration}s)`);

        // Step 3: Download audio
        const downloadResult = await this.downloadWithRetry(audioResult.audioUrl, outputPath, 3);

        if (!downloadResult.success) {
          throw new Error(`Download failed: ${downloadResult.error}`);
        }

        // SUCCESS!
        const totalTime = Date.now() - startTime;
        this.consecutiveFailures = 0; // Reset circuit breaker

        return {
          success: true,
          track: audioResult,
          audioPath: outputPath,
          attempts: attempt,
          totalTime,
          taskId, // NEW: Return taskId so it can be stored and reused
        };
      } catch (error: any) {
        const errorMessage = error.message || 'Unknown error';
        const isLastAttempt = attempt === cfg.maxRetries;

        // Classify error type
        let errorType: 'timeout' | 'api_error' | 'generation_failed' | 'download_failed' | 'credits_insufficient' =
          'api_error';
        if (errorMessage.includes('timeout')) {
          errorType = 'timeout';
        } else if (errorMessage.includes('download')) {
          errorType = 'download_failed';
        } else if (errorMessage.includes('generation') || errorMessage.includes('tracks')) {
          errorType = 'generation_failed';
        } else if (
          errorMessage.toLowerCase().includes('credit') ||
          errorMessage.toLowerCase().includes('insufficient') ||
          errorMessage.toLowerCase().includes('balance')
        ) {
          errorType = 'credits_insufficient';
        }

        // Enhanced error logging
        console.log(`   ❌ Attempt ${attempt} failed: ${errorType} - ${errorMessage}`);

        // Log full error details for debugging
        if (error.response?.data) {
          console.log(`   📄 API Response:`, JSON.stringify(error.response.data, null, 2));
        }

        // Credit waste warning
        if (!isLastAttempt && errorType !== 'download_failed' && !taskId) {
          console.log(`   ⚠️  WARNING: Failed generation consumed credits. Will retry with NEW generation.`);
          console.log(
            `   💡 TIP: If error persists, this could waste ${(cfg.maxRetries - attempt) * 10} more credits!`,
          );
        } else if (!isLastAttempt && taskId) {
          console.log(`   ✅ Task ID saved: ${taskId} - will recycle on next retry (no credit waste)`);
        }

        if (isLastAttempt) {
          // All retries exhausted
          this.consecutiveFailures++;
          this.lastFailureTime = new Date();

          // Calculate wasted credits
          const wastedCredits = (attempt - (taskId ? 0 : 1)) * 10;
          if (wastedCredits > 0) {
            console.log(`   💸 CREDIT WASTE: ${wastedCredits} credits spent on failed retries`);
          }

          return {
            success: false,
            error: errorMessage,
            errorType,
            attempts: attempt,
            totalTime: Date.now() - startTime,
            taskId, // Return taskId even on failure so it can be recycled later
          };
        }

        // Exponential backoff before retry
        const backoffDelay = cfg.backoffMs[attempt - 1] || cfg.backoffMs[cfg.backoffMs.length - 1];
        console.log(`   ⏳ Waiting ${backoffDelay / 1000}s before retry...`);
        await new Promise((resolve) => setTimeout(resolve, backoffDelay));
      }
    }

    // Should never reach here, but TypeScript needs it
    return {
      success: false,
      error: 'Max retries exceeded',
      errorType: 'api_error',
      attempts: cfg.maxRetries,
      totalTime: Date.now() - startTime,
    };
  }

  /**
   * Download audio with retry
   */
  private async downloadWithRetry(
    audioUrl: string,
    outputPath: string,
    maxRetries: number,
  ): Promise<{ success: boolean; error?: string }> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const { existsSync, statSync } = await import('fs');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await execAsync(`curl -L --max-time 120 --retry 3 --retry-delay 5 -o "${outputPath}" "${audioUrl}"`, {
          maxBuffer: 50 * 1024 * 1024,
        });

        if (existsSync(outputPath)) {
          const { size } = statSync(outputPath);
          if (size > 1000) {
            console.log(`   ✅ Downloaded: ${(size / 1024 / 1024).toFixed(2)}MB`);
            return { success: true };
          }
        }
      } catch (error: any) {
        if (attempt === maxRetries) {
          return { success: false, error: error.message };
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    return { success: false, error: 'Download failed after retries' };
  }

  /**
   * Generate multiple songs with circuit breaker
   */
  async generateBatch(
    songs: Array<{
      params: any;
      outputPath: string;
    }>,
    config: Partial<SunoRetryConfig> = {},
    onProgress?: (songNum: number, total: number, result: SongGenerationResult) => void,
  ): Promise<BatchGenerationResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const startTime = Date.now();

    const completed: SongGenerationResult[] = [];
    const failed: SongGenerationResult[] = [];

    console.log(`\n🎼 Batch generation: ${songs.length} songs`);
    console.log(`   Circuit breaker: ${cfg.circuitBreakerThreshold} consecutive failures`);

    // STAGGERED PARALLEL GENERATION: Submit songs with 5s delay to avoid Suno rate limits
    const STAGGER_MS = 5000;
    console.log(`\n🚀 Staggered parallel generation: ${songs.length} songs with ${STAGGER_MS / 1000}s stagger...`);

    const promises = songs.map((song, i) => {
      const songNum = i + 1;
      // Stagger each submission by 5 seconds
      return new Promise<{ result: SongGenerationResult; songNum: number }>((resolve) => {
        setTimeout(async () => {
          const result = await this.generateSongWithRetry(song.params, songNum, songs.length, song.outputPath, cfg);
          if (onProgress) {
            onProgress(songNum, songs.length, result);
          }
          resolve({ result, songNum });
        }, i * STAGGER_MS);
      });
    });

    // Wait for all songs to complete (or fail)
    const results = await Promise.all(promises);

    // Separate completed and failed songs
    for (const { result, songNum } of results) {
      if (result.success) {
        completed.push(result);
      } else {
        failed.push(result);
      }
    }

    // Check if circuit breaker should trigger (after all attempts)
    const circuitBroken = failed.length >= cfg.circuitBreakerThreshold;
    if (circuitBroken) {
      console.log(
        `\n🔴 CIRCUIT BREAKER: ${failed.length}/${songs.length} songs failed (threshold: ${cfg.circuitBreakerThreshold})`,
      );
    }

    // Calculate credit usage
    const allResults = [...completed, ...failed];
    const creditsSpent = allResults.reduce((sum, r) => sum + r.attempts * 10, 0);
    const creditsWasted = allResults.reduce((sum, r) => sum + (r.success ? 0 : r.attempts - 1) * 10, 0);

    // Log credit summary
    console.log(`\n💰 Credit Usage Summary:`);
    console.log(`   Total credits spent: ${creditsSpent}`);
    if (creditsWasted > 0) {
      console.log(`   ⚠️  Credits wasted on failed retries: ${creditsWasted}`);
    }
    console.log(`   Cost: $${(creditsSpent * 0.005).toFixed(2)}`);

    return {
      completedSongs: completed,
      failedSongs: failed,
      totalSuccess: completed.length,
      totalFailed: failed.length,
      circuitBroken,
      totalTime: Date.now() - startTime,
      creditsSpent,
      creditsWasted,
    };
  }

  /**
   * Check if circuit breaker is active
   */
  isCircuitBroken(threshold: number = DEFAULT_CONFIG.circuitBreakerThreshold): boolean {
    return this.consecutiveFailures >= threshold;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    console.log('🔄 Resetting circuit breaker');
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    healthy: boolean;
    consecutiveFailures: number;
    lastFailureTime: Date | null;
    circuitBroken: boolean;
  } {
    return {
      healthy: this.consecutiveFailures === 0,
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime,
      circuitBroken: this.isCircuitBroken(),
    };
  }
}

export const sunoRetryHandler = new SunoRetryHandler();
// Types already exported above
