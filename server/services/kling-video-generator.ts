import { mkdirSync, promises as fs, existsSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PATH_CONFIG } from '../config/video-constants';
import { storage } from '../storage';
import { videoStorage } from './video-storage';
import { API_COSTS, calculateVisionCost } from '../config/pricing.js';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

const execAsync = promisify(exec);

interface ReferenceImage {
  url: string;
  filename: string;
  mimeType: string;
}

interface KlingGenerationOptions {
  prompt?: string;
  duration?: number;
  aspectRatio?: '9:16' | '16:9';
  referenceImages?: ReferenceImage[];
  clipIndex?: number;
  totalClips?: number;
  enableBestOfN?: boolean;
  jobId?: string;
  negativePrompt?: string;
  klingCreditBudget?: number; // max kie.ai credits for this job (default: 1500)
  klingCreditWarning?: number; // warn threshold (default: 1000)
}

export interface ShotDescription {
  prompt: string;
  durationHint?: number; // approximate seconds for this shot within the multi-shot clip
}

export interface MultiShotGenerationResult {
  success: boolean;
  videoUrl?: string;
  localPath?: string;
  error?: string;
  cost: number;
  sceneGroupIndex: number;
  shotCount: number;
}

interface KlingGenerationResult {
  success: boolean;
  videoUrl?: string;
  localPath?: string;
  error?: string;
  cost: number;
  bestOfNMetadata?: {
    candidatesGenerated: number;
    selectedCandidate: number;
    selectedScore: number;
    allScores: number[];
  };
}

interface VisionScoreResult {
  promptMatch: number;
  visualQuality: number;
  motionQuality: number;
  averageScore: number;
  reasoning: string;
}

const KLING_CONFIG = {
  API: {
    BASE_URL: 'https://api.kie.ai',
    ENDPOINT: '/api/v1/jobs/createTask',
    TASK_ENDPOINT: '/api/v1/jobs/recordInfo',
    // Legacy endpoints (deprecated, credits exhausted on old pool)
    LEGACY_ENDPOINT: '/api/v1/runway/generate',
    LEGACY_TASK_ENDPOINT: '/api/v1/runway/record-detail',
  },
  COST_5_SECONDS: API_COSTS.kling['kling-3.0'].per5sClip, // $0.50
  COST_10_SECONDS: API_COSTS.kling['kling-3.0'].per10sClip, // $1.00
  COST_15_SECONDS: API_COSTS.kling['kling-3.0'].per15sClip, // $1.50
  DEFAULT_DURATION_SECONDS: 15,
  MAX_RETRY_ATTEMPTS: 3,
  POLL_INTERVAL_MS: 5000,
  MAX_POLL_ATTEMPTS: 120,
  DAILY_COST_LIMIT: 50,
};

const BEST_OF_N_CONFIG = {
  HIGH_VARIANCE_N: 2,
  STABLE_N: 1,
  VISION_SCORE_COST: 0.001, // Actual Gemini Flash vision cost per call
  isHighVarianceClip: (clipIndex: number, _totalClips: number): boolean => {
    // Only first clip is high-variance — last clip and transition points
    // don't benefit enough from best-of-N to justify the extra Kling cost
    return clipIndex === 0;
  },
  getN: (clipIndex: number, totalClips: number, enabled: boolean): number => {
    if (!enabled) return 1;
    return BEST_OF_N_CONFIG.isHighVarianceClip(clipIndex, totalClips)
      ? BEST_OF_N_CONFIG.HIGH_VARIANCE_N
      : BEST_OF_N_CONFIG.STABLE_N;
  },
};

export { BEST_OF_N_CONFIG };

/**
 * Thrown when kie.ai returns code 402 (credits insufficient).
 * Caught by batch generators to immediately abort all remaining clips.
 */
export class KlingCreditsExhaustedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'KlingCreditsExhaustedError';
  }
}

export class KlingVideoGenerator {
  private enabled: boolean;
  private accessKey?: string;
  private secretKey?: string;
  private baseUrl: string;
  private defaultDuration = KLING_CONFIG.DEFAULT_DURATION_SECONDS;

  // Global circuit breaker: once credits are exhausted, block ALL further calls
  // until explicitly reset (prevents burning retries on empty balance)
  private static creditsExhausted = false;

  static resetCreditCircuitBreaker() {
    KlingVideoGenerator.creditsExhausted = false;
    console.log('🔓 [Kling] Credit circuit breaker reset');
  }

  // Abort controllers per job — allows emergency stop to kill active polling
  private static jobAbortControllers: Map<string, AbortController> = new Map();

  static abortJob(jobId: string) {
    const controller = KlingVideoGenerator.jobAbortControllers.get(jobId);
    if (controller) {
      console.log(`🛑 [Kling] Aborting all polling for job ${jobId.slice(0, 8)}`);
      controller.abort();
      KlingVideoGenerator.jobAbortControllers.delete(jobId);
    }
  }

  static abortAllJobs() {
    console.log(`🛑 [Kling] Aborting ALL active polling (${KlingVideoGenerator.jobAbortControllers.size} jobs)`);
    for (const [jobId, controller] of KlingVideoGenerator.jobAbortControllers) {
      controller.abort();
    }
    KlingVideoGenerator.jobAbortControllers.clear();
  }

  private getOrCreateAbortController(jobId?: string): AbortController {
    if (!jobId) return new AbortController();
    let controller = KlingVideoGenerator.jobAbortControllers.get(jobId);
    if (!controller) {
      controller = new AbortController();
      KlingVideoGenerator.jobAbortControllers.set(jobId, controller);
    }
    return controller;
  }

  constructor() {
    this.accessKey = process.env.KLING_ACCESS_KEY;
    this.secretKey = process.env.KLING_SECRET_KEY;
    this.baseUrl = KLING_CONFIG.API.BASE_URL;

    this.enabled = !!this.accessKey;

    if (this.enabled) {
      console.log('✅ Kling AI initialized via kie.ai proxy (pay-as-you-go)');
    } else {
      if (!this.accessKey) console.warn('⚠️ KLING_ACCESS_KEY not set');
    }

    try {
      mkdirSync(PATH_CONFIG.TEMP_DIR, { recursive: true });
    } catch (error) {}
  }

  private getAuthHeaders(): Record<string, string> {
    if (!this.accessKey) {
      throw new Error('Kling API key not configured');
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.accessKey}`,
    };
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Returns whether the circuit breaker has been tripped.
   */
  isCreditsExhausted(): boolean {
    return KlingVideoGenerator.creditsExhausted;
  }

  /**
   * Live credit check — probes kie.ai to verify credits are available BEFORE starting generation.
   * Submits a real 5s request. If kie.ai returns 402, we know credits are empty.
   * If it returns 200, we cancel/ignore the task (it costs 100 credits but prevents
   * wasting 2400+ credits on a doomed job).
   *
   * Call this before any job that will generate multiple clips.
   */
  async probeCreditsLive(): Promise<{ sufficient: boolean; error?: string }> {
    if (KlingVideoGenerator.creditsExhausted) {
      return { sufficient: false, error: 'Circuit breaker already active — credits exhausted' };
    }

    console.log('🔍 [Kling] Probing credit balance with live API check...');

    try {
      const response = await axios.post(
        `${this.baseUrl}${KLING_CONFIG.API.ENDPOINT}`,
        {
          model: 'kling-3.0/video',
          input: {
            prompt: 'A single still frame of a white wall, minimal, static',
            aspect_ratio: '9:16',
            duration: '5',
            sound: false,
            mode: 'std',
            multi_shots: false,
            image_urls: [],
          },
        },
        {
          headers: this.getAuthHeaders(),
          timeout: 15000,
        },
      );

      if (response.data.code === 402) {
        KlingVideoGenerator.creditsExhausted = true;
        console.error('🚨 [Kling] Live probe: CREDITS EXHAUSTED — circuit breaker tripped');
        return { sufficient: false, error: response.data.msg };
      }

      if (response.data.code === 200) {
        // Task was accepted — credits are available. This costs 100 credits for the probe.
        const taskId = response.data.data?.taskId;
        console.log(`✅ [Kling] Live probe: Credits available (probe task: ${taskId}, cost: 100 credits)`);
        // Don't await completion — the probe clip is throwaway
        return { sufficient: true };
      }

      // Other codes (429 rate limit, etc) — assume credits are fine
      console.log(`⚠️ [Kling] Live probe got code ${response.data.code}: ${response.data.msg}`);
      return { sufficient: true };
    } catch (error: any) {
      console.warn(`⚠️ [Kling] Live probe failed: ${error.message} — assuming credits available`);
      return { sufficient: true };
    }
  }

  getCostPerClip(durationSeconds: number = KLING_CONFIG.DEFAULT_DURATION_SECONDS): number {
    if (durationSeconds <= 5) {
      return KLING_CONFIG.COST_5_SECONDS;
    }
    if (durationSeconds <= 10) {
      return KLING_CONFIG.COST_10_SECONDS;
    }
    return KLING_CONFIG.COST_15_SECONDS;
  }

  async extractVideoFrames(videoPath: string): Promise<string[]> {
    if (!existsSync(videoPath)) {
      throw new Error(`Video not found: ${videoPath}`);
    }

    const framesDir = join('/tmp', 'vision_frames', Date.now().toString());
    await fs.mkdir(framesDir, { recursive: true });

    try {
      const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      );
      const duration = parseFloat(durationOutput.trim()) || 5;

      const timestamps = [0.5, duration / 2, Math.max(duration - 0.5, duration / 2 + 0.5)];
      const frameBase64s: string[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const framePath = join(framesDir, `frame_${i}.jpg`);
        await execAsync(
          `ffmpeg -ss ${timestamps[i]} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}" -y 2>/dev/null`,
        );

        if (existsSync(framePath)) {
          const frameData = await fs.readFile(framePath);
          frameBase64s.push(frameData.toString('base64'));
          await fs.unlink(framePath);
        }
      }

      try {
        await fs.rmdir(framesDir);
      } catch {}

      return frameBase64s;
    } catch (error: any) {
      console.error(`❌ Frame extraction failed: ${error.message}`);
      try {
        await fs.rm(framesDir, { recursive: true, force: true });
      } catch {}
      return [];
    }
  }

  async scoreClipWithVision(localPath: string, prompt: string): Promise<VisionScoreResult> {
    try {
      const frames = await this.extractVideoFrames(localPath);

      if (frames.length === 0) {
        console.warn('⚠️ No frames extracted, returning default score');
        return {
          promptMatch: 5,
          visualQuality: 5,
          motionQuality: 5,
          averageScore: 5,
          reasoning: 'Frame extraction failed - default score applied',
        };
      }

      const imageDataParts = frames.map((base64) => ({
        inlineData: { data: base64, mimeType: 'image/jpeg' },
      }));

      const systemPrompt = `You are a video quality scorer. Analyze 3 frames (start, middle, end) from an AI-generated video clip.

Score each criterion from 1-10:
1. PROMPT_MATCH: Does the visual content match the generation prompt? (10=perfect match, 1=completely wrong)
2. VISUAL_QUALITY: Image clarity, coherence, no artifacts, good composition? (10=professional, 1=broken/corrupted)
3. MOTION_QUALITY: Based on frame differences - is there appropriate motion? (10=natural movement, 5=static, 1=chaotic/jittery)

Respond ONLY with valid JSON:
{"promptMatch": N, "visualQuality": N, "motionQuality": N, "reasoning": "brief explanation"}`;

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.1, maxOutputTokens: 200, responseMimeType: 'application/json' },
      });
      const result = await model.generateContent([
        { text: `${systemPrompt}\n\nPROMPT: "${prompt}"\n\nScore these 3 frames (start, middle, end of the video):` },
        ...imageDataParts,
      ]);
      const content = result.response.text();

      let parsed: any;
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
      } catch {
        console.warn('⚠️ Failed to parse Vision response, using defaults');
        parsed = { promptMatch: 5, visualQuality: 5, motionQuality: 5, reasoning: 'Parse failed' };
      }

      const promptMatch = Math.max(1, Math.min(10, parsed.promptMatch || 5));
      const visualQuality = Math.max(1, Math.min(10, parsed.visualQuality || 5));
      const motionQuality = Math.max(1, Math.min(10, parsed.motionQuality || 5));
      const averageScore = (promptMatch + visualQuality + motionQuality) / 3;

      const estimatedCost = 0.001; // Gemini Flash is very low cost

      try {
        await storage.logApiUsage({
          service: 'gemini',
          operation: 'vision_score',
          cost: estimatedCost.toFixed(4),
          metadata: {
            model: 'gemini-2.5-flash',
            framesAnalyzed: frames.length,
            promptLength: prompt.length,
          } as any,
        });
      } catch {}

      return {
        promptMatch,
        visualQuality,
        motionQuality,
        averageScore,
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error: any) {
      console.error(`❌ Vision scoring failed: ${error.message}`);
      return {
        promptMatch: 5,
        visualQuality: 5,
        motionQuality: 5,
        averageScore: 5,
        reasoning: `Scoring error: ${error.message}`,
      };
    }
  }

  private async generateSingleCandidate(
    prompt: string,
    options: KlingGenerationOptions,
    candidateIndex: number,
  ): Promise<{ success: boolean; localPath?: string; cost: number; error?: string }> {
    const actualDuration = options.duration || this.defaultDuration;
    const clipCost = this.getCostPerClip(actualDuration);
    let taskCreated = false;

    try {
      console.log(`   🎬 Candidate ${candidateIndex + 1}: Generating...`);

      const taskId = await this.initiateKlingGeneration(prompt, options);
      taskCreated = true; // kie.ai accepted the task and charged us
      const abortController = this.getOrCreateAbortController(options.jobId);
      const videoUrl = await this.pollForCompletion(taskId, abortController.signal);

      const filename = videoStorage.generateClipFilename({ type: 'kling', suffix: `_c${candidateIndex}` });
      const localPath = videoStorage.getClipPath(filename);

      await this.downloadVideo(videoUrl, localPath);

      console.log(`   ✅ Candidate ${candidateIndex + 1}: Generated successfully`);

      return { success: true, localPath, cost: clipCost };
    } catch (error: any) {
      console.error(`   ❌ Candidate ${candidateIndex + 1}: Failed - ${error.message}`);
      // Only charge cost if task was actually created on kie.ai (not for 429/submission failures)
      return { success: false, cost: taskCreated ? clipCost : 0, error: error.message };
    }
  }

  async generateClipWithBestOfN(prompt: string, options: KlingGenerationOptions): Promise<KlingGenerationResult> {
    const clipIndex = options.clipIndex ?? 0;
    const totalClips = options.totalClips ?? 1;
    const enableBestOfN = options.enableBestOfN ?? false;

    const n = BEST_OF_N_CONFIG.getN(clipIndex, totalClips, enableBestOfN);

    if (n === 1) {
      return this.generateSingleClip(prompt, options);
    }

    console.log(`\n🎯 [Best-of-${n}] Clip ${clipIndex + 1}/${totalClips} (high-variance position)`);

    const candidatePromises = Array.from({ length: n }, (_, i) => this.generateSingleCandidate(prompt, options, i));

    const candidateResults = await Promise.allSettled(candidatePromises);

    const successfulCandidates: Array<{ index: number; localPath: string; cost: number }> = [];
    let totalCost = 0;

    for (let i = 0; i < candidateResults.length; i++) {
      const result = candidateResults[i];
      if (result.status === 'fulfilled' && result.value.success && result.value.localPath) {
        successfulCandidates.push({
          index: i,
          localPath: result.value.localPath,
          cost: result.value.cost,
        });
        totalCost += result.value.cost;
      } else if (result.status === 'fulfilled') {
        totalCost += result.value.cost;
      }
    }

    if (successfulCandidates.length === 0) {
      return {
        success: false,
        error: 'All Best-of-N candidates failed to generate',
        cost: totalCost,
      };
    }

    if (successfulCandidates.length === 1) {
      const winner = successfulCandidates[0];
      console.log(`🏆 Best-of-${n}: Only 1 candidate succeeded (index ${winner.index + 1})`);

      return {
        success: true,
        localPath: winner.localPath,
        videoUrl: videoStorage.toVideoUrl(winner.localPath),
        cost: totalCost,
        bestOfNMetadata: {
          candidatesGenerated: n,
          selectedCandidate: winner.index + 1,
          selectedScore: 0,
          allScores: [],
        },
      };
    }

    console.log(`   📊 Scoring ${successfulCandidates.length} candidates with Gemini Vision...`);

    const scorePromises = successfulCandidates.map(async (candidate) => {
      const score = await this.scoreClipWithVision(candidate.localPath, prompt);
      totalCost += BEST_OF_N_CONFIG.VISION_SCORE_COST;
      return { ...candidate, score };
    });

    const scoredCandidates = await Promise.all(scorePromises);

    scoredCandidates.sort((a, b) => b.score.averageScore - a.score.averageScore);

    const winner = scoredCandidates[0];
    const allScores = scoredCandidates.map((c) => Math.round(c.score.averageScore * 10) / 10);
    const otherScores = allScores.slice(1);

    console.log(
      `🏆 Best-of-${n}: Selected candidate ${winner.index + 1} (score: ${winner.score.averageScore.toFixed(1)}, vs ${otherScores.join(', ')})`,
    );
    console.log(`   📝 Reason: ${winner.score.reasoning}`);

    for (const candidate of scoredCandidates.slice(1)) {
      try {
        if (existsSync(candidate.localPath)) {
          await fs.unlink(candidate.localPath);
          console.log(`   🗑️ Deleted losing candidate ${candidate.index + 1}`);
        }
      } catch (e) {}
    }

    try {
      await storage.logApiUsage({
        service: 'kling',
        operation: 'generate_video_bestofn',
        cost: totalCost.toString(),
        jobId: options.jobId || undefined,
        metadata: {
          n,
          candidatesGenerated: successfulCandidates.length,
          selectedCandidate: winner.index + 1,
          selectedScore: winner.score.averageScore,
          allScores,
          clipIndex,
          isHighVariance: true,
        } as any,
      });
    } catch {}

    return {
      success: true,
      localPath: winner.localPath,
      videoUrl: videoStorage.toVideoUrl(winner.localPath),
      cost: totalCost,
      bestOfNMetadata: {
        candidatesGenerated: n,
        selectedCandidate: winner.index + 1,
        selectedScore: winner.score.averageScore,
        allScores,
      },
    };
  }

  async generateSingleClip(prompt: string, options: KlingGenerationOptions): Promise<KlingGenerationResult> {
    if (!this.enabled) {
      throw new Error('Kling generation is disabled. Set KLING_ACCESS_KEY and KLING_SECRET_KEY.');
    }

    const MAX_ATTEMPTS = KLING_CONFIG.MAX_RETRY_ATTEMPTS;
    let lastError: Error | null = null;
    const actualDuration = options.duration || this.defaultDuration;
    const clipCost = this.getCostPerClip(actualDuration);
    const originalPrompt = prompt;
    // Track existing taskId to re-poll instead of creating duplicate generations
    let existingTaskId: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let taskId: string | null = null;
      let isNewSubmission = false;

      try {
        // ADAPTIVE PROMPTING: Simplify prompt on retries
        let adaptedPrompt = prompt;
        let promptStrategy = 'original';

        if (attempt === 2) {
          // Attempt 2: Simplified (remove adjectives, keep core action)
          adaptedPrompt = this.simplifyPrompt(prompt);
          promptStrategy = 'simplified';
          console.log(`🔄 [Kling] Retry with SIMPLIFIED prompt`);
        } else if (attempt === 3) {
          // Attempt 3: Generic/safe (remove risky words, make grounded)
          adaptedPrompt = this.makePromptGeneric(prompt);
          promptStrategy = 'generic';
          console.log(`🔄 [Kling] Retry with GENERIC/SAFE prompt`);
        }

        // DEDUP FIX: If previous attempt created a task but polling failed (timeout/network),
        // re-poll the same task instead of creating a new $0.10 generation
        if (existingTaskId) {
          taskId = existingTaskId;
          isNewSubmission = false;
          console.log(
            `♻️ [Kling] [Attempt ${attempt}/${MAX_ATTEMPTS}] Re-polling existing task ${taskId} (no new generation, saves $${clipCost.toFixed(2)})`,
          );
        } else {
          console.log(
            `🎬 [Kling] [Attempt ${attempt}/${MAX_ATTEMPTS}] [${promptStrategy.toUpperCase()}] Generating: ${adaptedPrompt.substring(0, 80)}...`,
          );
          taskId = await this.initiateKlingGeneration(adaptedPrompt, options);
          isNewSubmission = true;
        }

        const abortController = this.getOrCreateAbortController(options.jobId);
        const videoUrl = await this.pollForCompletion(taskId, abortController.signal);
        existingTaskId = null; // Clear on success

        const filename = videoStorage.generateClipFilename({ type: 'kling' });
        const localPath = videoStorage.getClipPath(filename);

        await this.downloadVideo(videoUrl, localPath);

        console.log(
          `✅ Kling clip generated on attempt ${attempt}${!isNewSubmission ? ' (re-polled existing task)' : ''} using ${promptStrategy.toUpperCase()} prompt: ${filename} (cost: $${clipCost.toFixed(2)})`,
        );

        // Log adaptive retry data
        if (attempt > 1) {
          console.log(`📊 [Adaptive Retry Success] Original prompt failed, ${promptStrategy} prompt succeeded`);
          console.log(`   Original: ${originalPrompt.substring(0, 100)}...`);
          console.log(`   Adapted:  ${adaptedPrompt.substring(0, 100)}...`);
        }

        try {
          await storage.logApiUsage({
            service: 'kling',
            operation: 'generate_video',
            cost: clipCost.toString(),
            durationSeconds: actualDuration.toString(),
            jobId: options.jobId || undefined,
            metadata: {
              aspectRatio: options.aspectRatio || '9:16',
              promptLength: adaptedPrompt.length,
              requestedDuration: options.duration,
              retryAttempt: attempt,
              promptStrategy: promptStrategy,
              originalPrompt: originalPrompt,
              adaptedPrompt: adaptedPrompt,
              adaptiveRetryUsed: attempt > 1,
              reusedTaskId: !isNewSubmission,
            } as any,
          });
        } catch (logError) {
          console.warn('Failed to log API usage:', logError);
        }

        return {
          success: true,
          videoUrl: videoStorage.toVideoUrl(localPath),
          localPath,
          cost: clipCost,
        };
      } catch (error: any) {
        // CIRCUIT BREAKER: Credits exhausted — do NOT retry, bubble up immediately
        if (error instanceof KlingCreditsExhaustedError || error.name === 'KlingCreditsExhaustedError') {
          console.error(`🚨 [Kling] Credits exhausted — aborting ALL retries for this clip and job`);
          throw error; // Bubble up to batch generator which will abort all remaining clips
        }

        lastError = error;
        console.error(`❌ [Kling] [Attempt ${attempt}/${MAX_ATTEMPTS}] Failed: ${error.message}`);

        // Determine if kie.ai genuinely rejected the task vs transient poll failure
        const isTaskRejected = error.message?.includes('generation failed:');
        const isSubmissionError = !taskId; // initiateKlingGeneration threw before returning

        if (isTaskRejected || isSubmissionError) {
          // Task genuinely failed or was never created — need a new submission next attempt
          existingTaskId = null;

          // Only log cost if we actually submitted a new task (kie.ai charged us)
          if (isNewSubmission && taskId) {
            try {
              await storage.logApiUsage({
                service: 'kling',
                operation: 'generate_video',
                model: 'kling-3.0',
                cost: clipCost.toFixed(4),
                success: false,
                errorMessage: error.message,
                jobId: options.jobId || undefined,
                metadata: {
                  attemptNumber: attempt,
                  maxAttempts: MAX_ATTEMPTS,
                  promptLength: prompt.length,
                  duration: actualDuration,
                } as any,
              });
            } catch (logError) {
              console.warn('Failed to log failed attempt cost:', logError);
            }
          }
        } else {
          // Polling timeout or network error — task may still be processing on kie.ai
          // Save taskId so next attempt re-polls instead of creating a duplicate generation
          existingTaskId = taskId;
          console.log(
            `♻️ [Kling] Task ${taskId} may still be processing — will re-poll next attempt (saves $${clipCost.toFixed(2)})`,
          );
        }

        if (attempt < MAX_ATTEMPTS && this.isRetryableError(error)) {
          console.log(`🔄 Retrying in 10 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 10000));
        } else if (!this.isRetryableError(error)) {
          break;
        }
      }
    }

    throw new Error(
      `Kling generation failed after ${MAX_ATTEMPTS} attempts. Error: ${lastError?.message || 'Unknown'}`,
    );
  }

  private async initiateKlingGeneration(prompt: string, options: KlingGenerationOptions): Promise<string> {
    // Circuit breaker: if credits were already exhausted, fail immediately
    if (KlingVideoGenerator.creditsExhausted) {
      throw new KlingCreditsExhaustedError(
        'Kling credits exhausted (circuit breaker active). Top up credits and call KlingVideoGenerator.resetCreditCircuitBreaker() to resume.',
      );
    }

    const duration = options.duration || this.defaultDuration;
    const aspectRatio = options.aspectRatio || '9:16';

    const apiDuration = duration;

    // Truncate prompt if too long — Kling 3.0 handles longer prompts but cap at 600
    const MAX_PROMPT_LENGTH = 600;
    const STYLE_ANCHOR = 'cinematic composition, natural lighting, photorealistic detail';
    let truncatedPrompt = prompt;
    if (prompt.length > MAX_PROMPT_LENGTH) {
      // Cut at comma boundary (clause-level) to preserve more structure than sentence boundary
      const budgetForContent = MAX_PROMPT_LENGTH - STYLE_ANCHOR.length - 2;
      const cutPoint = prompt.lastIndexOf(',', budgetForContent);
      if (cutPoint > budgetForContent / 2) {
        truncatedPrompt = prompt.substring(0, cutPoint).trim();
      } else {
        // Fallback: cut at sentence boundary
        const sentenceCut = prompt.lastIndexOf('.', budgetForContent);
        truncatedPrompt =
          sentenceCut > budgetForContent / 2
            ? prompt.substring(0, sentenceCut + 1)
            : prompt.substring(0, budgetForContent).trim();
      }
      // Re-append style anchor if lost during truncation
      if (!truncatedPrompt.toLowerCase().includes('cinematic')) {
        if (!truncatedPrompt.endsWith(',')) truncatedPrompt += ',';
        truncatedPrompt += ` ${STYLE_ANCHOR}`;
      }
      console.log(`⚠️  Truncated prompt from ${prompt.length} to ${truncatedPrompt.length} chars`);
    }

    const DEFAULT_NEGATIVE =
      'blurry, low quality, distorted faces, watermark, text, static pose, t-pose, looking at camera';

    // Kling 3.0 via kie.ai API — unified model for both text-to-video and image-to-video
    const model = 'kling-3.0/video';
    const isImageToVideo =
      options.referenceImages &&
      options.referenceImages.length > 0 &&
      options.referenceImages[0].url.startsWith('http');

    // Prepend negative prompt terms to the main prompt (Kling 3.0 doesn't have a separate negative_prompt field)
    const negativeTerms = options.negativePrompt || DEFAULT_NEGATIVE;
    const promptWithNegative = `${truncatedPrompt}. Avoid: ${negativeTerms}`;

    const payload: any = {
      model,
      input: {
        prompt: promptWithNegative,
        aspect_ratio: aspectRatio,
        duration: String(apiDuration),
        sound: false,
        mode: 'std',
        multi_shots: false,
        image_urls: [] as string[],
      },
    };

    if (isImageToVideo) {
      const refImage = options.referenceImages![0];
      payload.input.image_urls = [refImage.url];
      console.log(`📷 Using reference image: ${refImage.filename}`);
    }

    console.log(`📤 Sending kie.ai request (${model}, ${apiDuration}s, ${aspectRatio})...`);
    console.log(`   Prompt (first 150 chars): ${prompt.substring(0, 150)}...`);

    try {
      const response = await axios.post(`${this.baseUrl}${KLING_CONFIG.API.ENDPOINT}`, payload, {
        headers: this.getAuthHeaders(),
        timeout: 60000,
      });

      console.log(`📥 kie.ai response:`, JSON.stringify(response.data).substring(0, 300));

      if (response.data.code === 402) {
        // Credits exhausted — trip the circuit breaker to prevent ALL further calls
        KlingVideoGenerator.creditsExhausted = true;
        console.error('🚨 [Kling] CREDITS EXHAUSTED — circuit breaker tripped. No further Kling calls will be made.');
        console.error('🚨 [Kling] Top up credits at kie.ai, then call KlingVideoGenerator.resetCreditCircuitBreaker()');
        const creditError = new KlingCreditsExhaustedError(
          `kie.ai credits insufficient: ${response.data.msg}. Circuit breaker activated — all remaining clips aborted.`,
        );
        try {
          const { errorMonitor } = await import('./error-monitor');
          await errorMonitor.captureError(creditError, {
            service: 'kling-video-generator',
            operation: 'initiateKlingGeneration_402',
            metadata: { responseCode: 402, msg: response.data.msg },
          });
        } catch {}
        throw creditError;
      }

      if (response.data.code !== 200) {
        throw new Error(`kie.ai error: ${response.data.msg || JSON.stringify(response.data)}`);
      }

      const taskId = response.data.data?.taskId;

      if (!taskId) {
        throw new Error(`No taskId in kie.ai response: ${JSON.stringify(response.data)}`);
      }

      console.log(`🎯 kie.ai generation started (${model}): ${taskId}`);
      return taskId;
    } catch (axiosError: any) {
      if (axiosError.response) {
        console.error(`❌ kie.ai API error: ${axiosError.response.status}`);
        console.error(`   Response: ${JSON.stringify(axiosError.response.data).substring(0, 500)}`);
        try {
          const { errorMonitor } = await import('./error-monitor');
          await errorMonitor.captureError(axiosError instanceof Error ? axiosError : new Error(String(axiosError)), {
            service: 'kling-video-generator',
            operation: 'initiateKlingGeneration_apiError',
            metadata: { httpStatus: axiosError.response.status },
          });
        } catch {}

        if (axiosError.response.status === 401) {
          throw new Error('kie.ai API key invalid.');
        }
        if (axiosError.response.status === 429) {
          throw new Error('kie.ai rate limit exceeded.');
        }
      }
      throw axiosError;
    }
  }

  private async pollForCompletion(taskId: string, abortSignal?: AbortSignal): Promise<string> {
    let pollCount = 0;

    console.log(`🔄 Polling kie.ai for completion...`);

    while (pollCount < KLING_CONFIG.MAX_POLL_ATTEMPTS) {
      // Check abort signal before each poll — allows emergency stop
      if (abortSignal?.aborted) {
        throw new Error('Job aborted — polling stopped to conserve credits');
      }

      // Adaptive polling: 3s for first 10, then 5s, then 10s after 30
      const interval = pollCount < 10 ? 3000 : pollCount < 30 ? 5000 : 10000;
      await new Promise((resolve) => setTimeout(resolve, interval));

      try {
        const response = await axios.get(`${this.baseUrl}${KLING_CONFIG.API.TASK_ENDPOINT}?taskId=${taskId}`, {
          headers: this.getAuthHeaders(),
          timeout: 30000,
        });

        const result = response.data;
        if (result.code !== 200) {
          console.warn(`   Poll error: ${result.msg}`);
          pollCount++;
          continue;
        }

        const data = result.data;
        const status = (data.state || 'processing').toLowerCase();

        if (pollCount % 3 === 0) {
          console.log(`   Poll ${pollCount + 1}: status=${status}`);
        }

        if (status === 'success') {
          // New API: video URL is in resultJson string
          let videoUrl: string | undefined;

          // Try new format first (resultJson)
          if (data.resultJson) {
            try {
              const resultData = typeof data.resultJson === 'string' ? JSON.parse(data.resultJson) : data.resultJson;
              if (resultData.resultUrls && resultData.resultUrls.length > 0) {
                videoUrl = resultData.resultUrls[0];
              }
            } catch (parseErr) {
              console.warn(`   Failed to parse resultJson: ${String(parseErr)}`);
            }
          }

          // Fallback to legacy format (videoInfo.videoUrl)
          if (!videoUrl && data.videoInfo?.videoUrl) {
            videoUrl = data.videoInfo.videoUrl;
          }

          if (videoUrl) {
            console.log(`✅ kie.ai generation completed`);
            return videoUrl;
          } else {
            throw new Error('kie.ai completed but no video URL in response');
          }
        }

        if (status === 'fail' || status === 'failed' || status === 'error') {
          const errorMsg = data.failMsg || 'Unknown error';
          throw new Error(`kie.ai generation failed: ${errorMsg}`);
        }

        pollCount++;
      } catch (error: any) {
        if (error.message?.includes('generation failed') || error.message?.includes('no video URL')) {
          throw error;
        }
        console.warn(`   Poll error (will retry): ${error.message}`);
        pollCount++;
      }
    }

    throw new Error('Timeout polling for Kling completion (10 minutes)');
  }

  private async downloadVideo(videoUrl: string, localPath: string): Promise<void> {
    console.log(`📥 Downloading Kling video...`);

    try {
      const response = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 120000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (response.data.length < 10000) {
        throw new Error(`Video data too small (${response.data.length} bytes)`);
      }

      await fs.writeFile(localPath, response.data);
      console.log(`✅ Kling video saved (${Math.round(response.data.length / 1024)}KB): ${localPath}`);
    } catch (error: any) {
      throw new Error(`Failed to download Kling video: ${error.message}`);
    }
  }

  private isRetryableError(error: any): boolean {
    const msg = error.message?.toLowerCase() || '';
    // Non-retryable: financial/auth errors — retrying just wastes credits
    if (msg.includes('credits insufficient') || msg.includes('insufficient')) return false;
    if (msg.includes('balance')) return false;
    if (msg.includes('401')) return false;
    if (msg.includes('403')) return false;
    // Retryable: transient errors
    if (msg.includes('timeout')) return true;
    if (msg.includes('network') || msg.includes('econnreset')) return true;
    if (msg.includes('429')) return true;
    if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
    return true;
  }

  async generateClips(
    prompts: string[],
    options: Omit<KlingGenerationOptions, 'prompt'>,
    onProgress?: (current: number, total: number) => void,
    existingClips?: Array<{ clipIndex: number; videoPath: string; cost?: number }>,
    onClipComplete?: (clipIndex: number, videoPath: string, cost: number) => Promise<void>,
  ): Promise<{ clipPaths: string[]; totalCost: number }> {
    // Pre-flight: live credit check before spending ANY credits on this job
    if (KlingVideoGenerator.creditsExhausted) {
      throw new KlingCreditsExhaustedError(
        'Kling credits exhausted (circuit breaker active). Cannot start clip generation. Top up credits first.',
      );
    }
    // Live probe: verify credits are actually available with a real API call
    const probeResult = await this.probeCreditsLive();
    if (!probeResult.sufficient) {
      throw new KlingCreditsExhaustedError(
        `Kling credits exhausted (live probe confirmed): ${probeResult.error}. Job aborted before spending credits.`,
      );
    }

    const clipPaths: string[] = new Array(prompts.length).fill(null);
    let totalCost = 0;
    const duration = options.duration || this.defaultDuration;
    const clipCost = this.getCostPerClip(duration);
    const enableBestOfN = options.enableBestOfN ?? false;

    if (enableBestOfN) {
      console.log(
        `🎯 Best-of-N enabled: High-variance clips will generate ${BEST_OF_N_CONFIG.HIGH_VARIANCE_N} candidates`,
      );
    }

    const completedIndices = new Set<number>();
    if (existingClips && existingClips.length > 0) {
      for (const clip of existingClips) {
        if (clip.videoPath && clip.clipIndex >= 0 && clip.clipIndex < prompts.length) {
          completedIndices.add(clip.clipIndex);
          clipPaths[clip.clipIndex] = clip.videoPath;
          totalCost += clip.cost || clipCost;
        }
      }
      console.log(`🔄 Resume: ${completedIndices.size} clips already completed`);
    }

    // Kling Credit Guard: per-job credit budget enforcement
    const creditsPerClip = duration <= 5 ? 100 : duration <= 10 ? 200 : 300;
    const creditBudget = options.klingCreditBudget ?? 1500;
    const creditWarning = options.klingCreditWarning ?? 1000;
    let creditWarningLogged = false;

    const remainingIndices: number[] = [];
    for (let i = 0; i < prompts.length; i++) {
      if (!completedIndices.has(i)) {
        remainingIndices.push(i);
      }
    }

    if (remainingIndices.length === 0) {
      console.log(`✅ All ${prompts.length} clips already completed`);
      return { clipPaths: clipPaths as string[], totalCost };
    }

    // Credit Guard: cap remaining clips to stay within budget
    const alreadySpentCredits = completedIndices.size * creditsPerClip;
    const remainingBudgetClips = Math.floor((creditBudget - alreadySpentCredits) / creditsPerClip);

    if (remainingIndices.length > remainingBudgetClips) {
      console.warn(
        `🔒 [Kling Credit Guard] Capping from ${remainingIndices.length} to ${remainingBudgetClips} clips (budget: ${creditBudget} credits, ${creditsPerClip} credits/clip)`,
      );
      remainingIndices.length = Math.max(0, remainingBudgetClips); // truncate
      if (options.jobId) {
        storage
          .updateJob(options.jobId, {
            errorMessage: `Credit guard: capped at ${remainingBudgetClips + completedIndices.size} clips (${creditBudget} credit budget)`,
          })
          .catch(() => {}); // fire-and-forget
      }
    }

    if (remainingIndices.length === 0) {
      console.warn(
        `🔒 [Kling Credit Guard] No clips allowed within budget (${alreadySpentCredits}/${creditBudget} credits already spent)`,
      );
      return { clipPaths: clipPaths as string[], totalCost };
    }

    let batchSize = 6; // ⚡ Increased from 4 to 6 for faster generation
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 2;

    console.log(
      `🚀 [Kling Batch] Starting with batch size ${batchSize} for ${remainingIndices.length} remaining clips`,
    );

    let currentIndex = 0;
    while (currentIndex < remainingIndices.length) {
      // Check if job was aborted/paused before starting next batch
      if (options.jobId) {
        const abortController = KlingVideoGenerator.jobAbortControllers.get(options.jobId);
        if (abortController?.signal.aborted) {
          console.log(`🛑 [Kling Batch] Job ${options.jobId.slice(0, 8)} was aborted — stopping clip generation`);
          break;
        }
        // Check DB for job status (catches emergency pauses)
        try {
          const { db } = await import('../db.js');
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql`SELECT status FROM jobs WHERE id = ${options.jobId} LIMIT 1`);
          const jobStatus = (result.rows[0] as any)?.status;
          if (jobStatus === 'failed' || jobStatus === 'cancelled') {
            console.log(`🛑 [Kling Batch] Job ${options.jobId.slice(0, 8)} status is "${jobStatus}" in DB — aborting`);
            KlingVideoGenerator.abortJob(options.jobId);
            break;
          }
        } catch {}
      }

      const batchIndices = remainingIndices.slice(currentIndex, currentIndex + batchSize);
      console.log(
        `\n📦 [Kling Batch] Generating batch of ${batchIndices.length} clips (indices: ${batchIndices.map((i) => i + 1).join(', ')}) with batch size ${batchSize}`,
      );

      const batchPromises = batchIndices.map(async (clipIndex) => {
        try {
          // Check circuit breaker before each clip in the batch
          if (KlingVideoGenerator.creditsExhausted) {
            return {
              clipIndex,
              result: null,
              success: false,
              error: 'Credits exhausted (circuit breaker)',
              creditsExhausted: true,
            };
          }

          console.log(`[Kling Batch] Starting clip ${clipIndex + 1}/${prompts.length}`);

          const n = BEST_OF_N_CONFIG.getN(clipIndex, prompts.length, enableBestOfN);

          let result: KlingGenerationResult;
          if (n > 1) {
            result = await this.generateClipWithBestOfN(prompts[clipIndex], {
              ...options,
              prompt: prompts[clipIndex],
              clipIndex,
              totalClips: prompts.length,
              enableBestOfN: true,
            });
          } else {
            result = await this.generateSingleClip(prompts[clipIndex], { ...options, prompt: prompts[clipIndex] });
          }

          return { clipIndex, result, success: result.success };
        } catch (error: any) {
          // Propagate credit exhaustion flag so the batch loop can abort
          if (error instanceof KlingCreditsExhaustedError || error.name === 'KlingCreditsExhaustedError') {
            return { clipIndex, result: null, success: false, error: error.message, creditsExhausted: true };
          }
          console.error(`❌ [Kling Batch] Clip ${clipIndex + 1} failed: ${error.message}`);
          return { clipIndex, result: null, success: false, error: error.message };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      let batchSuccesses = 0;
      let batchFailures = 0;
      let creditsExhaustedInBatch = false;

      for (const settledResult of batchResults) {
        if (settledResult.status === 'fulfilled') {
          const { clipIndex, result, success } = settledResult.value;

          // Check if any clip in the batch hit credit exhaustion
          if ((settledResult.value as any).creditsExhausted) {
            creditsExhaustedInBatch = true;
          }

          if (success && result?.localPath) {
            clipPaths[clipIndex] = result.localPath;
            totalCost += result.cost || clipCost;
            batchSuccesses++;

            const bestOfInfo = result.bestOfNMetadata
              ? ` [Best-of-${result.bestOfNMetadata.candidatesGenerated}: #${result.bestOfNMetadata.selectedCandidate} score ${result.bestOfNMetadata.selectedScore.toFixed(1)}]`
              : '';
            console.log(
              `✅ [Kling Batch] Clip ${clipIndex + 1} complete - $${(result.cost || clipCost).toFixed(2)}${bestOfInfo}`,
            );

            if (onClipComplete) {
              await onClipComplete(clipIndex, result.localPath, result.cost || clipCost);
            }

            // Credit Guard: warn when crossing threshold
            const cumulativeCredits = clipPaths.filter((p) => p !== null).length * creditsPerClip;
            if (!creditWarningLogged && cumulativeCredits >= creditWarning) {
              console.warn(
                `⚠️ [Kling Credit Guard] Job has used ${cumulativeCredits} credits (warning threshold: ${creditWarning})`,
              );
              creditWarningLogged = true;
            }
          } else {
            batchFailures++;
            console.error(`❌ [Kling Batch] Clip ${clipIndex + 1} failed in batch`);
          }
        } else {
          batchFailures++;
          console.error(`❌ [Kling Batch] Promise rejected: ${settledResult.reason}`);
        }
      }

      const totalCompleted = clipPaths.filter((p) => p !== null).length;
      if (onProgress) onProgress(totalCompleted, prompts.length);

      console.log(
        `📊 [Kling Batch] Batch result: ${batchSuccesses}/${batchIndices.length} succeeded (total: ${totalCompleted}/${prompts.length})`,
      );

      // CIRCUIT BREAKER: If credits exhausted, abort ALL remaining clips immediately
      if (creditsExhaustedInBatch || KlingVideoGenerator.creditsExhausted) {
        const remaining = remainingIndices.length - currentIndex - batchIndices.length;
        console.error(
          `🚨 [Kling Batch] CREDITS EXHAUSTED — aborting ${remaining} remaining clips. ${totalCompleted}/${prompts.length} completed.`,
        );
        if (options.jobId) {
          KlingVideoGenerator.abortJob(options.jobId);
        }
        break;
      }

      if (batchFailures > 0) {
        consecutiveFailures++;

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && batchSize > 2) {
          const oldBatchSize = batchSize;
          // Adaptive scaling: 6 → 4 → 3 → 2
          if (batchSize === 6) batchSize = 4;
          else if (batchSize === 4) batchSize = 3;
          else batchSize = 2;
          consecutiveFailures = 0;
          console.log(
            `⚠️ [Kling Batch] Reducing batch size: ${oldBatchSize} → ${batchSize} after ${MAX_CONSECUTIVE_FAILURES} failures`,
          );
        }

        if (batchSize === 2 && batchFailures === batchIndices.length && !KlingVideoGenerator.creditsExhausted) {
          console.log(`🔄 [Kling Batch] All clips in batch failed, retrying individually...`);
          for (const clipIndex of batchIndices) {
            if (KlingVideoGenerator.creditsExhausted) {
              console.error(`🚨 [Kling Retry] Credits exhausted — skipping remaining retries`);
              break;
            }
            if (clipPaths[clipIndex] === null) {
              try {
                console.log(`🔄 [Kling Retry] Retrying clip ${clipIndex + 1} individually...`);
                const result = await this.generateSingleClip(prompts[clipIndex], {
                  ...options,
                  prompt: prompts[clipIndex],
                });
                if (result.success && result.localPath) {
                  clipPaths[clipIndex] = result.localPath;
                  totalCost += result.cost || clipCost;
                  if (onClipComplete) {
                    await onClipComplete(clipIndex, result.localPath, result.cost || clipCost);
                  }
                  console.log(`✅ [Kling Retry] Clip ${clipIndex + 1} succeeded on retry`);
                }
              } catch (retryError: any) {
                if (retryError instanceof KlingCreditsExhaustedError) break;
                console.error(`❌ [Kling Retry] Clip ${clipIndex + 1} failed on retry: ${retryError.message}`);
              }
            }
          }
        }
      } else {
        consecutiveFailures = 0;
      }

      currentIndex += batchIndices.length;

      if (currentIndex < remainingIndices.length) {
        console.log('⏳ [Kling Batch] Waiting 5 seconds before next batch...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    const validClipPaths = clipPaths.filter((p) => p !== null) as string[];

    if (validClipPaths.length !== prompts.length) {
      throw new Error(`Kling incomplete: Only ${validClipPaths.length}/${prompts.length} clips`);
    }

    console.log(`💰 [Kling Batch] Complete - Total: $${totalCost.toFixed(2)} for ${validClipPaths.length} clips`);
    return { clipPaths: validClipPaths, totalCost };
  }

  // ═══════════════════════════════════════════════════════════════════
  // MULTI-SHOT GENERATION (Kling 3.0 multi_shots mode)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Initiate a multi-shot generation — single API call produces a clip with
   * Kling-native scene transitions between 2-6 shots.
   */
  private async initiateMultiShotGeneration(combinedPrompt: string, options: KlingGenerationOptions): Promise<string> {
    const duration = options.duration || 15;
    const aspectRatio = options.aspectRatio || '9:16';

    const MAX_PROMPT_LENGTH = 600;
    const STYLE_ANCHOR = 'cinematic composition, natural lighting, photorealistic detail';
    let truncatedPrompt = combinedPrompt;
    if (combinedPrompt.length > MAX_PROMPT_LENGTH) {
      const budgetForContent = MAX_PROMPT_LENGTH - STYLE_ANCHOR.length - 2;
      const cutPoint = combinedPrompt.lastIndexOf(',', budgetForContent);
      if (cutPoint > budgetForContent / 2) {
        truncatedPrompt = combinedPrompt.substring(0, cutPoint).trim();
      } else {
        const sentenceCut = combinedPrompt.lastIndexOf('.', budgetForContent);
        truncatedPrompt =
          sentenceCut > budgetForContent / 2
            ? combinedPrompt.substring(0, sentenceCut + 1)
            : combinedPrompt.substring(0, budgetForContent).trim();
      }
      if (!truncatedPrompt.toLowerCase().includes('cinematic')) {
        if (!truncatedPrompt.endsWith(',')) truncatedPrompt += ',';
        truncatedPrompt += ` ${STYLE_ANCHOR}`;
      }
      console.log(`⚠️  Truncated multi-shot prompt from ${combinedPrompt.length} to ${truncatedPrompt.length} chars`);
    }

    const DEFAULT_NEGATIVE =
      'blurry, low quality, distorted faces, watermark, text, static pose, t-pose, looking at camera';
    const negativeTerms = options.negativePrompt || DEFAULT_NEGATIVE;
    const promptWithNegative = `${truncatedPrompt}. Avoid: ${negativeTerms}`;

    const model = 'kling-3.0/video';

    const payload: any = {
      model,
      input: {
        prompt: promptWithNegative,
        aspect_ratio: aspectRatio,
        duration: String(duration),
        sound: true, // Required for multi_shots mode (kie.ai rejects sound:false)
        mode: 'std',
        multi_shots: true,
        image_urls: [],
      },
    };

    console.log(`📤 Sending kie.ai MULTI-SHOT request (${model}, ${duration}s, ${aspectRatio}, multi_shots=true)...`);
    console.log(`   Prompt (first 200 chars): ${combinedPrompt.substring(0, 200)}...`);

    try {
      const response = await axios.post(`${this.baseUrl}${KLING_CONFIG.API.ENDPOINT}`, payload, {
        headers: this.getAuthHeaders(),
        timeout: 60000,
      });

      console.log(`📥 kie.ai multi-shot response:`, JSON.stringify(response.data).substring(0, 300));

      if (response.data.code !== 200) {
        throw new Error(`kie.ai multi-shot error: ${response.data.msg || JSON.stringify(response.data)}`);
      }

      const taskId = response.data.data?.taskId;
      if (!taskId) {
        throw new Error(`No taskId in kie.ai multi-shot response: ${JSON.stringify(response.data)}`);
      }

      console.log(`🎯 kie.ai multi-shot generation started: ${taskId}`);
      return taskId;
    } catch (axiosError: any) {
      if (axiosError.response) {
        console.error(`❌ kie.ai multi-shot API error: ${axiosError.response.status}`);
        console.error(`   Response: ${JSON.stringify(axiosError.response.data).substring(0, 500)}`);
        try {
          const { errorMonitor } = await import('./error-monitor');
          await errorMonitor.captureError(axiosError instanceof Error ? axiosError : new Error(String(axiosError)), {
            service: 'kling-video-generator',
            operation: 'initiateMultiShotGeneration_apiError',
            metadata: { httpStatus: axiosError.response.status },
          });
        } catch {}
        if (axiosError.response.status === 401) throw new Error('kie.ai API key invalid.');
        if (axiosError.response.status === 429) throw new Error('kie.ai rate limit exceeded.');
      }
      throw axiosError;
    }
  }

  /**
   * Generate a single multi-shot clip (2-6 shots with Kling-native transitions).
   * Falls back to single-clip generation if multi-shot fails.
   */
  async generateMultiShotClip(
    shots: ShotDescription[],
    options: KlingGenerationOptions,
    sceneGroupIndex: number,
  ): Promise<MultiShotGenerationResult> {
    if (!this.enabled) {
      throw new Error('Kling generation is disabled. Set KLING_ACCESS_KEY.');
    }

    const duration = options.duration || 15;
    const clipCost = this.getCostPerClip(duration);

    // Build combined prompt with [Shot N] markers
    const combinedPrompt = shots.map((shot, i) => `[Shot ${i + 1}] ${shot.prompt}`).join('. ');

    console.log(`\n🎬 [Multi-Shot] Scene group ${sceneGroupIndex + 1} (${shots.length} shots, ${duration}s)`);

    try {
      const taskId = await this.initiateMultiShotGeneration(combinedPrompt, options);
      const abortController = this.getOrCreateAbortController(options.jobId);
      const videoUrl = await this.pollForCompletion(taskId, abortController.signal);

      const filename = videoStorage.generateClipFilename({ type: 'kling', suffix: `_ms${sceneGroupIndex}` });
      const localPath = videoStorage.getClipPath(filename);

      await this.downloadVideo(videoUrl, localPath);

      console.log(
        `✅ [Multi-Shot] Scene group ${sceneGroupIndex + 1} complete: ${filename} (cost: $${clipCost.toFixed(2)})`,
      );

      try {
        await storage.logApiUsage({
          service: 'kling',
          operation: 'generate_video_multishot',
          cost: clipCost.toString(),
          durationSeconds: duration.toString(),
          jobId: options.jobId || undefined,
          metadata: {
            sceneGroupIndex,
            shotCount: shots.length,
            multiShot: true,
            aspectRatio: options.aspectRatio || '9:16',
            promptLength: combinedPrompt.length,
          } as any,
        });
      } catch {}

      return {
        success: true,
        videoUrl: videoStorage.toVideoUrl(localPath),
        localPath,
        cost: clipCost,
        sceneGroupIndex,
        shotCount: shots.length,
      };
    } catch (error: any) {
      console.warn(`⚠️ [Multi-Shot] Scene group ${sceneGroupIndex + 1} failed: ${error.message}`);
      console.log(`🔄 [Multi-Shot] Falling back to single-clip generation with combined prompt`);

      // Fallback: generate as a single clip with the combined prompt
      try {
        const fallbackResult = await this.generateSingleClip(combinedPrompt, options);
        return {
          ...fallbackResult,
          sceneGroupIndex,
          shotCount: shots.length,
        };
      } catch (fallbackError: any) {
        console.error(`❌ [Multi-Shot] Fallback also failed: ${fallbackError.message}`);
        return {
          success: false,
          error: `Multi-shot failed: ${error.message}; Fallback failed: ${fallbackError.message}`,
          cost: clipCost, // charged for the multi-shot attempt
          sceneGroupIndex,
          shotCount: shots.length,
        };
      }
    }
  }

  /**
   * High-level orchestrator: groups N individual prompts into scene groups,
   * generates each as a multi-shot clip with Kling-native transitions.
   *
   * Replaces generateClips() for multi-shot jobs — same interface pattern
   * but produces fewer, longer clips.
   */
  async generateMultiShotBatch(
    prompts: string[],
    options: Omit<KlingGenerationOptions, 'prompt'>,
    shotsPerGeneration: number = 3,
    onProgress?: (current: number, total: number) => void,
    existingClips?: Array<{ clipIndex?: number; sceneGroupIndex?: number; videoPath: string; cost?: number }>,
    onSceneGroupComplete?: (
      sceneGroupIndex: number,
      videoPath: string,
      cost: number,
      shotCount: number,
    ) => Promise<void>,
  ): Promise<{ clipPaths: string[]; totalCost: number }> {
    // Pre-flight: live credit check before spending ANY credits on this job
    if (KlingVideoGenerator.creditsExhausted) {
      throw new KlingCreditsExhaustedError(
        'Kling credits exhausted (circuit breaker active). Cannot start multi-shot generation. Top up credits first.',
      );
    }
    const probeResult = await this.probeCreditsLive();
    if (!probeResult.sufficient) {
      throw new KlingCreditsExhaustedError(
        `Kling credits exhausted (live probe confirmed): ${probeResult.error}. Job aborted before spending credits.`,
      );
    }

    // Group individual prompts into scene groups
    const sceneGroups: ShotDescription[][] = [];
    for (let i = 0; i < prompts.length; i += shotsPerGeneration) {
      const group = prompts.slice(i, i + shotsPerGeneration).map((prompt) => ({ prompt }));
      sceneGroups.push(group);
    }

    console.log(
      `\n🎬 [Multi-Shot Batch] ${prompts.length} prompts -> ${sceneGroups.length} scene groups (${shotsPerGeneration} shots each)`,
    );

    const duration = options.duration || 15;
    const clipCost = this.getCostPerClip(duration);
    const clipPaths: (string | null)[] = new Array(sceneGroups.length).fill(null);
    let totalCost = 0;

    // Credit guard — multi-shot requires sound=true (40 credits/sec instead of 20)
    const creditsPerGen = duration <= 5 ? 200 : duration <= 10 ? 400 : 600;
    const creditBudget = options.klingCreditBudget ?? 3600; // ~6 scene groups max
    const creditWarning = options.klingCreditWarning ?? 2400;
    let creditWarningLogged = false;

    // Resume support
    const completedIndices = new Set<number>();
    if (existingClips && existingClips.length > 0) {
      for (const clip of existingClips) {
        const idx = clip.sceneGroupIndex ?? clip.clipIndex;
        if (clip.videoPath && idx !== undefined && idx >= 0 && idx < sceneGroups.length) {
          completedIndices.add(idx);
          clipPaths[idx] = clip.videoPath;
          totalCost += clip.cost || clipCost;
        }
      }
      if (completedIndices.size > 0) {
        console.log(`🔄 [Multi-Shot] Resume: ${completedIndices.size} scene groups already completed`);
      }
    }

    const remainingIndices: number[] = [];
    for (let i = 0; i < sceneGroups.length; i++) {
      if (!completedIndices.has(i)) remainingIndices.push(i);
    }

    if (remainingIndices.length === 0) {
      console.log(`✅ All ${sceneGroups.length} scene groups already completed`);
      return { clipPaths: clipPaths as string[], totalCost };
    }

    // Credit guard: cap remaining groups to stay within budget
    const alreadySpentCredits = completedIndices.size * creditsPerGen;
    const remainingBudgetGens = Math.floor((creditBudget - alreadySpentCredits) / creditsPerGen);

    if (remainingIndices.length > remainingBudgetGens) {
      console.warn(
        `🔒 [Kling Credit Guard] Capping from ${remainingIndices.length} to ${remainingBudgetGens} scene groups (budget: ${creditBudget} credits, ${creditsPerGen} credits/gen)`,
      );
      remainingIndices.length = Math.max(0, remainingBudgetGens);
    }

    if (remainingIndices.length === 0) {
      console.warn(`🔒 [Kling Credit Guard] No scene groups allowed within budget`);
      return { clipPaths: clipPaths as string[], totalCost };
    }

    // Process in parallel batches of 4
    const batchSize = 4;
    let currentIndex = 0;

    while (currentIndex < remainingIndices.length) {
      // Check abort
      if (options.jobId) {
        const abortController = KlingVideoGenerator.jobAbortControllers.get(options.jobId);
        if (abortController?.signal.aborted) {
          console.log(`🛑 [Multi-Shot Batch] Job aborted — stopping`);
          break;
        }
        try {
          const { db } = await import('../db.js');
          const { sql } = await import('drizzle-orm');
          const result = await db.execute(sql`SELECT status FROM jobs WHERE id = ${options.jobId} LIMIT 1`);
          const jobStatus = (result.rows[0] as any)?.status;
          if (jobStatus === 'failed' || jobStatus === 'cancelled') {
            console.log(`🛑 [Multi-Shot Batch] Job status "${jobStatus}" — aborting`);
            KlingVideoGenerator.abortJob(options.jobId);
            break;
          }
        } catch {}
      }

      const batchIndices = remainingIndices.slice(currentIndex, currentIndex + batchSize);
      console.log(
        `\n📦 [Multi-Shot Batch] Generating batch of ${batchIndices.length} scene groups (indices: ${batchIndices.map((i) => i + 1).join(', ')})`,
      );

      const batchPromises = batchIndices.map(async (groupIndex) => {
        try {
          // Check circuit breaker before each scene group
          if (KlingVideoGenerator.creditsExhausted) {
            return {
              groupIndex,
              result: {
                success: false,
                error: 'Credits exhausted (circuit breaker)',
                cost: 0,
                sceneGroupIndex: groupIndex,
                shotCount: sceneGroups[groupIndex].length,
              } as MultiShotGenerationResult,
              creditsExhausted: true,
            };
          }
          const result = await this.generateMultiShotClip(
            sceneGroups[groupIndex],
            { ...options, duration },
            groupIndex,
          );
          return { groupIndex, result };
        } catch (error: any) {
          const isCreditsError =
            error instanceof KlingCreditsExhaustedError || error.name === 'KlingCreditsExhaustedError';
          if (isCreditsError) {
            return {
              groupIndex,
              result: {
                success: false,
                error: error.message,
                cost: 0,
                sceneGroupIndex: groupIndex,
                shotCount: sceneGroups[groupIndex].length,
              } as MultiShotGenerationResult,
              creditsExhausted: true,
            };
          }
          console.error(`❌ [Multi-Shot Batch] Scene group ${groupIndex + 1} failed: ${error.message}`);
          return {
            groupIndex,
            result: {
              success: false,
              error: error.message,
              cost: 0,
              sceneGroupIndex: groupIndex,
              shotCount: sceneGroups[groupIndex].length,
            } as MultiShotGenerationResult,
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          const { groupIndex, result } = settled.value;
          if (result.success && result.localPath) {
            clipPaths[groupIndex] = result.localPath;
            totalCost += result.cost || clipCost;

            console.log(
              `✅ [Multi-Shot Batch] Scene group ${groupIndex + 1} complete - $${(result.cost || clipCost).toFixed(2)} (${result.shotCount} shots)`,
            );

            if (onSceneGroupComplete) {
              await onSceneGroupComplete(groupIndex, result.localPath, result.cost || clipCost, result.shotCount);
            }

            // Credit warning check
            const cumulativeCredits = clipPaths.filter((p) => p !== null).length * creditsPerGen;
            if (!creditWarningLogged && cumulativeCredits >= creditWarning) {
              console.warn(
                `⚠️ [Kling Credit Guard] Job has used ${cumulativeCredits} credits (warning threshold: ${creditWarning})`,
              );
              creditWarningLogged = true;
            }
          } else {
            console.error(`❌ [Multi-Shot Batch] Scene group ${groupIndex + 1} failed in batch`);
          }
        }
      }

      const totalCompleted = clipPaths.filter((p) => p !== null).length;
      if (onProgress) onProgress(totalCompleted, sceneGroups.length);

      console.log(`📊 [Multi-Shot Batch] Progress: ${totalCompleted}/${sceneGroups.length} scene groups complete`);

      // CIRCUIT BREAKER: If any scene group hit credit exhaustion, abort everything
      const anyCreditsExhausted = batchResults.some(
        (r) => r.status === 'fulfilled' && (r.value as any).creditsExhausted,
      );
      if (anyCreditsExhausted || KlingVideoGenerator.creditsExhausted) {
        const remaining = remainingIndices.length - currentIndex - batchIndices.length;
        console.error(
          `🚨 [Multi-Shot Batch] CREDITS EXHAUSTED — aborting ${remaining} remaining scene groups. ${totalCompleted}/${sceneGroups.length} completed.`,
        );
        if (options.jobId) KlingVideoGenerator.abortJob(options.jobId);
        break;
      }

      currentIndex += batchIndices.length;

      if (currentIndex < remainingIndices.length) {
        console.log('⏳ [Multi-Shot Batch] Waiting 5 seconds before next batch...');
        await new Promise((r) => setTimeout(r, 5000));
      }
    }

    const validPaths = clipPaths.filter((p) => p !== null) as string[];

    if (validPaths.length !== sceneGroups.length) {
      const isCreditsIssue = KlingVideoGenerator.creditsExhausted;
      throw new Error(
        `Multi-shot incomplete: Only ${validPaths.length}/${sceneGroups.length} scene groups${isCreditsIssue ? ' (credits exhausted)' : ''}`,
      );
    }

    console.log(
      `💰 [Multi-Shot Batch] Complete - Total: $${totalCost.toFixed(2)} for ${validPaths.length} scene groups (${prompts.length} shots)`,
    );
    return { clipPaths: validPaths, totalCost };
  }

  /**
   * Simplify prompt for retry attempt 2
   * Removes adjectives, keeps core action
   */
  private simplifyPrompt(prompt: string): string {
    // Remove common descriptive words
    const wordsToRemove = [
      'dramatically',
      'dramatically',
      'cinematic',
      'epic',
      'stunning',
      'beautiful',
      'gorgeous',
      'magnificent',
      'breathtaking',
      'majestic',
      'spectacular',
      'incredible',
      'amazing',
      'brilliant',
      'vibrant',
      'vivid',
      'detailed',
      'intricate',
      'elaborate',
      '4K',
      '8K',
      'ultra',
      'high-resolution',
      'photorealistic',
      'hyper-realistic',
      'atmospheric',
      'moody',
      'dramatic lighting',
      'golden hour',
      'dawn lighting',
      'dusk lighting',
      'volumetric',
      'rays of light',
    ];

    let simplified = prompt;

    // Remove quality/style descriptors
    for (const word of wordsToRemove) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      simplified = simplified.replace(regex, '');
    }

    // Remove multiple commas/spaces
    simplified = simplified.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();

    // Remove trailing/leading commas
    simplified = simplified.replace(/^,+|,+$/g, '').trim();

    // If we removed too much, keep the original
    if (simplified.length < 20) {
      return prompt;
    }

    return simplified;
  }

  /**
   * Make prompt generic/safe for retry attempt 3
   * Removes risky words, makes action more grounded
   */
  private makePromptGeneric(prompt: string): string {
    // Extract the subject (usually first part before comma)
    const parts = prompt.split(',');
    const subject = parts[0] || prompt;

    // Risky action words to replace
    const riskyActions: Record<string, string> = {
      flying: 'standing',
      levitating: 'standing',
      floating: 'standing',
      teleporting: 'moving',
      vanishing: 'departing',
      'diving into': 'near',
      'jumping from': 'standing near',
      'falling from': 'standing near',
      riding: 'standing near',
      soaring: 'standing',
      erupting: 'active',
    };

    let generic = subject;

    // Replace risky actions
    for (const [risky, safe] of Object.entries(riskyActions)) {
      const regex = new RegExp(`\\b${risky}\\b`, 'gi');
      generic = generic.replace(regex, safe);
    }

    // Add safe, grounded context
    if (!generic.includes('historical')) {
      generic = `${generic}, historical scene`;
    }

    // Add cinematic framing (Kling likes this)
    generic = `${generic}, cinematic composition`;

    // Remove anything that might be problematic
    generic = generic.replace(/\b(impossible|magic|supernatural|miraculous)\b/gi, '');

    // Clean up
    generic = generic.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
    generic = generic.replace(/^,+|,+$/g, '').trim();

    return generic;
  }
}

export const klingVideoGenerator = new KlingVideoGenerator();
