import axios from 'axios';
import { db } from '../db';
import { apiUsage } from '@shared/schema';
import { API_COSTS } from '../config/pricing.js';

// Use sunoapi.org when SUNO_API_KEY is set, otherwise fall back to kie.ai
const SUNO_API_BASE = process.env.SUNO_API_KEY ? 'https://api.sunoapi.org' : 'https://api.kie.ai';

// Suno cost tracking: ~10 credits per song, ~$0.01 per credit = ~$0.10 per song
const SUNO_COST_PER_SONG = API_COSTS.suno.v5.perSong;

// Suno duration control constants
// Based on empirical data: ~14 chars per second of generated audio
const CHARS_PER_SECOND = 14;
const DEFAULT_TARGET_DURATION = 240; // 4:00 REALISTIC target (Suno V5 can generate up to 8 minutes)
const MIN_BEAT_DURATION = 60; // 1:00 minimum
const MAX_BEAT_DURATION = 240; // 4:00 maximum (Suno V5 can do 8 min, use 4 min for reliability)
const MAX_DURATION = 240; // 4:00 absolute max (conservative - Suno V5 supports up to 8 min)

/**
 * Trim lyrics to achieve a target song duration
 * Suno generates roughly 14 characters per second of audio
 */
export function trimLyricsForDuration(
  lyrics: string,
  targetDurationSeconds: number = DEFAULT_TARGET_DURATION,
): { lyrics: string; estimatedDuration: number; wasTrimmed: boolean } {
  const targetChars = Math.floor(targetDurationSeconds * CHARS_PER_SECOND);

  if (lyrics.length <= targetChars) {
    return {
      lyrics,
      estimatedDuration: Math.ceil(lyrics.length / CHARS_PER_SECOND),
      wasTrimmed: false,
    };
  }

  console.log(
    `[Suno] Trimming lyrics from ${lyrics.length} chars to ~${targetChars} chars for ${targetDurationSeconds}s target`,
  );

  // Try to trim at a section boundary (e.g., [Verse], [Chorus], etc.)
  const sectionPattern = /\n\s*\[/g;
  let lastGoodSection = 0;
  let match;

  while ((match = sectionPattern.exec(lyrics)) !== null) {
    if (match.index <= targetChars) {
      lastGoodSection = match.index;
    } else {
      break;
    }
  }

  // If we found a section boundary, use it; otherwise truncate at char limit
  let trimmedLyrics: string;
  if (lastGoodSection > targetChars * 0.6) {
    // Good section boundary found - use it
    trimmedLyrics = lyrics.substring(0, lastGoodSection).trim();
    // Add an outro if there isn't one
    if (!trimmedLyrics.toLowerCase().includes('[outro]')) {
      trimmedLyrics += '\n\n[Outro]\nYeah... (fades out)';
    }
  } else {
    // No good section boundary - truncate and add outro
    const truncated = lyrics.substring(0, targetChars);
    const lastNewline = truncated.lastIndexOf('\n');
    trimmedLyrics = (lastNewline > targetChars * 0.7 ? truncated.substring(0, lastNewline) : truncated).trim();
    trimmedLyrics += '\n\n[Outro]\nYeah... (fades out)';
  }

  const estimatedDuration = Math.ceil(trimmedLyrics.length / CHARS_PER_SECOND);
  console.log(`[Suno] Trimmed to ${trimmedLyrics.length} chars, estimated duration: ${estimatedDuration}s`);

  return {
    lyrics: trimmedLyrics,
    estimatedDuration,
    wasTrimmed: true,
  };
}

/**
 * STRUCTURE TAGS APPROACH: Use metatags to create song structure (from Suno God Mode video)
 * Key insight: Suno needs structure tags to generate proper length songs
 */
export function generateInstrumentalStructure(targetDurationSeconds: number, style?: string): string {
  const minutes = Math.floor(targetDurationSeconds / 60);

  // Extract BPM from style if available
  let bpm = '';
  if (style) {
    const bpmMatch = style.match(/(\d+)\s*BPM/i);
    if (bpmMatch) {
      bpm = ` ${bpmMatch[1]} bpm`;
    }
  }

  // Extract genre (first part before |)
  let genre = '';
  if (style) {
    const genreMatch = style.split('|')[0].trim();
    genre = genreMatch.split(',')[0].trim(); // Just first genre
  }

  // Build structure based on target duration
  // KEY INSIGHT: Each section needs content (not just empty tags)
  // Use instrumental markers so Suno knows to build full sections
  let structure = '';

  if (targetDurationSeconds <= 90) {
    // 1-1.5 minutes: Simple structure with instrumental markers
    structure = `[Intro]
(instrumental)

[Verse]
(instrumental)

[Chorus]
(instrumental)

[Outro]
(instrumental)`;
  } else if (targetDurationSeconds <= 120) {
    // 1.5-2 minutes: 10 sections with key doubles for ~100-130s songs
    // FIX v2: 8 sections produced 70-90s (too short). Bumped to 10 with doubles.
    // FIX v1: Previously 120s targets got 16 sections (180-200s songs)
    structure = `[Intro]
(instrumental)

[Verse]
(instrumental)
(instrumental)

[Build]
(instrumental)

[Chorus]
(instrumental)
(instrumental)

[Verse]
(instrumental)

[Bridge]
(instrumental)

[Chorus]
(instrumental)
(instrumental)

[Breakdown]
(instrumental)

[Chorus]
(instrumental)

[Outro]
(instrumental)`;
  } else if (targetDurationSeconds <= 180) {
    // 2-3 minutes: Dense structure (reduced from 16 to 12 sections)
    // Each section ~12-15s = 144-180s total
    structure = `[Intro]
(instrumental)

[Verse]
(instrumental)

[Build]
(instrumental)

[Chorus]
(instrumental)

[Verse]
(instrumental)

[Build]
(instrumental)

[Chorus]
(instrumental)

[Bridge]
(instrumental)

[Chorus]
(instrumental)

[Verse]
(instrumental)

[Chorus]
(instrumental)

[Outro]
(instrumental)`;
  } else if (targetDurationSeconds <= 300) {
    // 4-5 minutes: Extended structure
    structure = `[Intro]
(instrumental)

[Verse]
(instrumental)

[Build]
(instrumental)

[Chorus]
(instrumental)

[Verse]
(instrumental)

[Build]
(instrumental)

[Chorus]
(instrumental)

[Bridge]
(instrumental)

[Breakdown]
(instrumental)

[Chorus]
(instrumental)

[Outro]
(instrumental)`;
  } else {
    // 5+ minutes: Full structure with repeats
    structure = `[Intro]
(instrumental)

[Verse]
(instrumental)

[Build]
(instrumental)

[Chorus]
(instrumental)

[Verse]
(instrumental)

[Build]
(instrumental)

[Chorus]
(instrumental)

[Bridge]
(instrumental)

[Breakdown]
(instrumental)

[Chorus]
(instrumental)

[Verse]
(instrumental)

[Chorus]
(instrumental)

[Outro]
(instrumental)`;
  }

  // Combine genre/bpm info with structure
  const prompt = `${genre}${bpm} ${minutes} minutes\n\n${structure}`;

  console.log(
    `[Suno] Structure-based prompt: "${genre}${bpm} ${minutes} minutes" + ${structure.split('\n').filter((s) => s.startsWith('[')).length} sections`,
  );

  return prompt;
}

interface SunoGenerateRequest {
  prompt: string;
  style: string;
  title: string;
  customMode: boolean;
  instrumental: boolean;
  model: 'V3_5' | 'V4' | 'V5';
  callBackUrl?: string;
}

interface SunoGenerateResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
  };
}

interface SunoTrack {
  id: string;
  audioUrl: string;
  sourceAudioUrl: string;
  streamAudioUrl: string;
  imageUrl: string;
  prompt: string;
  modelName: string;
  title: string;
  tags: string;
  createTime: string;
  duration: number;
}

interface SunoTaskStatus {
  code: number;
  msg: string;
  data: {
    callbackType: 'text' | 'first' | 'complete';
    task_id: string;
    data: SunoTrack[];
  };
}

interface SunoCreditResponse {
  code: number;
  msg: string;
  data:
    | {
        credits?: number;
        credit?: number;
        balance?: number;
      }
    | number;
}

class SunoApiService {
  private apiKey: string | undefined;
  private activePollers: Map<string, Promise<SunoTrack[]>> = new Map(); // Phase 5: Deduplication

  constructor() {
    // Prefer SUNO_API_KEY (sunoapi.org) for music generation, fall back to KIE_API_KEY (kie.ai)
    this.apiKey = process.env.SUNO_API_KEY || process.env.KIE_API_KEY || process.env.KLING_ACCESS_KEY;
  }

  private getHeaders() {
    if (!this.apiKey) {
      throw new Error('KIE_API_KEY or KLING_ACCESS_KEY not configured - needed for Suno music generation via kie.ai');
    }
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Get duration-specific style hints to guide Suno generation
   * Helps reduce retry waste by giving Suno clear length expectations
   */
  private getDurationHints(targetDuration: number): string {
    const minutes = Math.floor(targetDuration / 60);
    const seconds = targetDuration % 60;
    const timeFormat = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // SIMPLIFIED: Just state the duration clearly at beginning of style
    return `${timeFormat} long ${minutes} minute beat`;
  }

  async checkCredits(): Promise<{ credits: number }> {
    try {
      const response = await axios.get<SunoCreditResponse>(`${SUNO_API_BASE}/api/v1/generate/credit`, {
        headers: this.getHeaders(),
      });

      console.log('[Suno] Credit response:', JSON.stringify(response.data));

      if (response.data.code !== 200) {
        throw new Error(response.data.msg || 'Failed to check credits');
      }

      // Handle different response formats
      const data = response.data.data;
      let credits = 0;

      if (typeof data === 'number') {
        credits = data;
      } else if (data && typeof data === 'object') {
        credits = data.credits ?? data.credit ?? data.balance ?? 0;
      }

      return { credits };
    } catch (error: any) {
      console.error('[Suno] Credit check error:', error.message);
      throw error;
    }
  }

  async generateSong(params: {
    lyrics: string;
    style: string;
    title: string;
    instrumental?: boolean;
    model?: 'V3_5' | 'V4' | 'V5';
    callBackUrl?: string;
    targetDuration?: number; // NEW: Target duration in seconds for style hints
  }): Promise<{ taskId: string }> {
    console.log('[Suno] Generating song:', params.title);
    console.log('[Suno] Using model:', params.model || 'V5');

    // Apply directives from Feature Correlation Analyzer
    let enhancedStyle = params.style;
    try {
      const { systemConfiguration } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      const config = await db
        .select()
        .from(systemConfiguration)
        .where(eq(systemConfiguration.key, 'sunoDirectives'))
        .limit(1);

      if (config[0]?.value) {
        const directives = config[0].value as any;
        const sunoDirectives = directives.sunoDirectives || {};

        // Apply BPM directive if correlation is strong (>0.5)
        if (sunoDirectives.targetBPM && sunoDirectives.bpmCorrelation > 0.5) {
          enhancedStyle += `, ${sunoDirectives.targetBPM} BPM`;
          console.log(
            `[Suno] Applied BPM directive: ${sunoDirectives.targetBPM} BPM (correlation: ${sunoDirectives.bpmCorrelation.toFixed(2)})`,
          );
        }

        // Apply energy directive if correlation is strong (>0.5)
        if (sunoDirectives.targetEnergy && sunoDirectives.energyCorrelation > 0.5) {
          if (sunoDirectives.targetEnergy > 0.7) {
            enhancedStyle += ', high energy, powerful, intense';
            console.log(
              `[Suno] Applied high energy directive (correlation: ${sunoDirectives.energyCorrelation.toFixed(2)})`,
            );
          } else if (sunoDirectives.targetEnergy < 0.4) {
            enhancedStyle += ', calm, atmospheric, subdued';
            console.log(
              `[Suno] Applied low energy directive (correlation: ${sunoDirectives.energyCorrelation.toFixed(2)})`,
            );
          }
        }
      }
    } catch (error) {
      console.warn('[Suno] Could not load directives, using original style:', error);
    }

    // Apply duration hints FIRST (at beginning) for better Suno recognition
    if (params.targetDuration) {
      const durationHints = this.getDurationHints(params.targetDuration);
      if (durationHints) {
        // PREPEND duration to style (not append) so Suno sees it first
        enhancedStyle = durationHints.trim() + ', ' + enhancedStyle;
        console.log(`[Suno] 🎵 Prepended duration hints: ${durationHints}`);
      }
    }

    console.log('[Suno] Final style:', enhancedStyle);
    console.log('[Suno] Prompt/Structure:', params.lyrics?.substring(0, 200) || '(empty)');
    console.log('[Suno] Instrumental:', params.instrumental || false);

    // Truncate title to 80 characters max (Suno API limit)
    const truncatedTitle = params.title.length > 80 ? params.title.substring(0, 77) + '...' : params.title;

    if (params.title !== truncatedTitle) {
      console.log(`[Suno] ⚠️  Title truncated from ${params.title.length} to 80 chars`);
    }

    // Use a dummy callback URL - we poll for status instead
    // The API requires a callback URL to be present
    const callbackUrl = params.callBackUrl || 'https://httpbin.org/post';

    const request: SunoGenerateRequest = {
      prompt: params.lyrics,
      style: enhancedStyle,
      title: truncatedTitle,
      customMode: true,
      instrumental: params.instrumental || false,
      model: params.model || 'V5', // Default to Suno V5 (latest)
      callBackUrl: callbackUrl,
    };

    try {
      const response = await axios.post<SunoGenerateResponse>(`${SUNO_API_BASE}/api/v1/generate`, request, {
        headers: this.getHeaders(),
      });

      if (response.data.code !== 200) {
        throw new Error(response.data.msg || 'Failed to generate song');
      }

      console.log('[Suno] Task created:', response.data.data.taskId);
      return { taskId: response.data.data.taskId };
    } catch (error: any) {
      console.error('[Suno] Generation error:', error.response?.data || error.message);
      try {
        const { errorMonitor } = await import('./error-monitor');
        await errorMonitor.captureError(error instanceof Error ? error : new Error(String(error)), {
          service: 'suno-api',
          operation: 'generateSong',
          metadata: { title: params.title, httpStatus: error.response?.status },
        });
      } catch {}
      throw error;
    }
  }

  async getTaskStatus(taskId: string): Promise<{
    status: 'pending' | 'processing' | 'complete' | 'failed';
    tracks: SunoTrack[];
  }> {
    try {
      const response = await axios.get<any>(`${SUNO_API_BASE}/api/v1/generate/record-info`, {
        headers: this.getHeaders(),
        params: { taskId },
      });

      if (response.data.code !== 200) {
        if (response.data.code === 404) {
          return { status: 'pending', tracks: [] };
        }
        throw new Error(response.data.msg || 'Failed to get task status');
      }

      const data = response.data.data;
      const taskStatus = data?.status; // The API returns "SUCCESS", "PENDING", "FAILED", etc.
      const callbackType = data?.callbackType;
      // Track data can be in data.sunoData OR data.response.sunoData depending on status
      const rawSunoData = data?.sunoData || data?.response?.sunoData;

      let status: 'pending' | 'processing' | 'complete' | 'failed' = 'pending';
      let tracks: SunoTrack[] = [];

      // IMPORTANT: Suno has multiple stages:
      // 1. text/TEXT_SUCCESS - Lyrics generated
      // 2. first/FIRST_SUCCESS - SHORT PREVIEW (~20-25 seconds) - DO NOT USE THIS!
      // 3. complete/SUCCESS - FULL SONG (60-120+ seconds)

      // Check for SUCCESS status (the main indicator of FULL song ready)
      if (taskStatus === 'SUCCESS') {
        status = 'complete';
        // Extract tracks from sunoData - use camelCase to match consumer expectations
        if (rawSunoData && Array.isArray(rawSunoData)) {
          tracks = rawSunoData.map((track: any) => ({
            id: track.id,
            audioUrl: track.audioUrl || track.audio_url, // Prefer camelCase, fallback to snake_case
            sourceAudioUrl: track.sourceAudioUrl || track.source_audio_url,
            streamAudioUrl: track.streamAudioUrl || track.stream_audio_url,
            imageUrl: track.imageUrl || track.image_url,
            prompt: track.prompt,
            modelName: track.modelName || track.model_name,
            title: track.title,
            tags: track.tags,
            createTime: track.createTime,
            duration: track.duration,
          }));
          // Log track durations for debugging
          tracks.forEach((t, i) => {
            console.log(`[Suno] Track ${i}: duration=${t.duration}s, id=${t.id}`);
          });
        }
      } else if (taskStatus === 'GENERATE_AUDIO_FAILED' || taskStatus === 'FAILED' || data?.errorMessage) {
        status = 'failed';
        console.error('[Suno] Task failed:', data?.errorMessage);
      } else if (callbackType === 'complete' && taskStatus !== 'FIRST_SUCCESS') {
        // Only treat as complete if NOT first_success (which is just the preview)
        status = 'complete';
        // Parse tracks from data.data if available
        const rawTracks = data?.data || [];
        if (Array.isArray(rawTracks) && rawTracks.length > 0) {
          tracks = rawTracks.map((track: any) => ({
            id: track.id,
            audioUrl: track.audioUrl || track.audio_url,
            sourceAudioUrl: track.sourceAudioUrl || track.source_audio_url,
            streamAudioUrl: track.streamAudioUrl || track.stream_audio_url,
            imageUrl: track.imageUrl || track.image_url,
            prompt: track.prompt,
            modelName: track.modelName || track.model_name,
            title: track.title,
            tags: track.tags,
            createTime: track.createTime,
            duration: track.duration,
          }));
          tracks.forEach((t, i) => {
            console.log(`[Suno] Track ${i}: duration=${t.duration}s`);
          });
        }
      } else if (
        callbackType === 'first' ||
        callbackType === 'text' ||
        taskStatus === 'PROCESSING' ||
        taskStatus === 'TEXT_SUCCESS' ||
        taskStatus === 'FIRST_SUCCESS'
      ) {
        // FIRST_SUCCESS is just the preview - keep waiting for full song!
        status = 'processing';
        if (taskStatus === 'FIRST_SUCCESS') {
          console.log('[Suno] ⚠️ Got FIRST_SUCCESS (preview only) - waiting for full song...');
        }
      }

      console.log(
        `[Suno] Poll status: ${taskStatus}, callbackType: ${callbackType}, tracks: ${tracks.length}, durations: ${tracks.map((t) => t.duration).join(', ')}`,
      );

      return {
        status,
        tracks,
      };
    } catch (error: any) {
      console.error('[Suno] Status check error:', error.message);
      throw error;
    }
  }

  async waitForCompletion(taskId: string, maxWaitMs: number = 300000): Promise<SunoTrack[]> {
    // Phase 5: Deduplication - check if already polling this task
    const existingPoll = this.activePollers.get(taskId);
    if (existingPoll) {
      console.log(`[Suno] Task ${taskId} already being polled - reusing existing poll operation`);
      return existingPoll;
    }

    // Start new poll operation
    const pollPromise = this._waitForCompletionInternal(taskId, maxWaitMs);
    this.activePollers.set(taskId, pollPromise);

    try {
      const result = await pollPromise;
      return result;
    } finally {
      // Clean up on completion (success or failure)
      this.activePollers.delete(taskId);
    }
  }

  private async _waitForCompletionInternal(taskId: string, maxWaitMs: number): Promise<SunoTrack[]> {
    const startTime = Date.now();
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 5; // Reduced from 10 - fail faster instead of wasting 5+ minutes
    const maxBackoffDelay = 30000; // Cap exponential backoff at 30 seconds

    while (Date.now() - startTime < maxWaitMs) {
      const elapsedMs = Date.now() - startTime;

      // Adaptive polling interval based on elapsed time (Phase 3)
      let basePollInterval: number;
      if (elapsedMs < 30000) {
        basePollInterval = 2000; // 0-30s: Poll every 2s (generation starting)
      } else if (elapsedMs < 60000) {
        basePollInterval = 5000; // 30-60s: Poll every 5s (normal generation)
      } else if (elapsedMs < 120000) {
        basePollInterval = 10000; // 60-120s: Poll every 10s (slower generation)
      } else {
        basePollInterval = 15000; // >120s: Poll every 15s (very slow)
      }

      // Add ±20% jitter to prevent thundering herd (Phase 3)
      const jitter = basePollInterval * 0.2 * (Math.random() - 0.5);
      const pollInterval = Math.round(basePollInterval + jitter);

      try {
        const { status, tracks } = await this.getTaskStatus(taskId);
        consecutiveErrors = 0; // Reset error count on success

        if (status === 'complete' && tracks.length > 0) {
          console.log('[Suno] Song generation complete:', tracks.length, 'tracks');

          // Log duration summary for all tracks
          const durations = tracks.map((t) => t.duration).filter(Boolean);
          if (durations.length > 0) {
            const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
            const min = Math.min(...durations);
            const max = Math.max(...durations);
            console.log(
              `[Suno] Duration summary: avg=${avg.toFixed(1)}s, range=${min.toFixed(1)}s-${max.toFixed(1)}s (${tracks.length} tracks)`,
            );
          }

          // Log cost for this song generation (only actual generations, not polls)
          try {
            const duration = tracks[0]?.duration || 60;
            await db.insert(apiUsage).values({
              service: 'suno',
              operation: 'generate_song',
              cost: SUNO_COST_PER_SONG.toFixed(4),
              durationSeconds: duration.toString(),
              metadata: {
                taskId,
                trackCount: tracks.length,
                durations: tracks.map((t) => t.duration),
              },
            });
            console.log(`[Suno] 💰 Cost logged: $${SUNO_COST_PER_SONG.toFixed(2)}`);
          } catch (costErr) {
            console.warn('[Suno] Failed to log cost:', costErr);
          }

          return tracks;
        }

        if (status === 'failed') {
          throw new Error('Song generation failed');
        }

        console.log(
          '[Suno] Waiting for completion... status:',
          status,
          `(next poll in ${(pollInterval / 1000).toFixed(1)}s)`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error: any) {
        consecutiveErrors++;

        // Detect error type (Phase 2: rate limit detection)
        const httpStatus = error.response?.status;
        const is524Error = httpStatus === 524 || error.message?.includes('524') || error.message?.includes('timeout');
        const isRateLimitError = httpStatus === 429;
        const retryAfterHeader = error.response?.headers?.['retry-after'];

        // Log poll failure for monitoring with $0 cost (Phase 4: fix cost logging)
        try {
          await db.insert(apiUsage).values({
            service: 'suno',
            operation: 'poll_status_check', // Changed from 'song_generation_poll'
            model: 'polling',
            cost: '0.0000', // ← Fixed: Polls are FREE, not $0.10
            success: false,
            errorMessage: error.message || 'Unknown polling error',
            metadata: {
              consecutiveErrors,
              isRetrying: true,
              errorType: isRateLimitError ? '429_rate_limit' : is524Error ? '524_timeout' : 'other',
              httpStatus,
              retryAfter: retryAfterHeader,
            } as any,
          });
        } catch (logError) {
          console.warn('[Suno] Failed to log poll failure:', logError);
        }

        // Circuit breaker: Stop after 5 consecutive failures (Phase 1)
        if (consecutiveErrors >= maxConsecutiveErrors) {
          console.error(`[Suno] Circuit breaker triggered after ${maxConsecutiveErrors} consecutive errors`);
          throw new Error(
            `Suno API failed after ${maxConsecutiveErrors} consecutive errors - circuit breaker activated`,
          );
        }

        // Phase 2: Handle rate limits (429) with Retry-After respect
        if (isRateLimitError) {
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 60;
          const rateLimitDelay = Math.min(retryAfterSeconds * 1000, 90000); // Cap at 90s
          console.log(
            `[Suno] Rate limit hit (429): Waiting ${rateLimitDelay / 1000}s before retry (Retry-After: ${retryAfterSeconds}s)...`,
          );
          await new Promise((resolve) => setTimeout(resolve, rateLimitDelay));
          continue;
        }

        // Phase 1: Capped exponential backoff for 524 timeouts
        if (is524Error) {
          // Exponential backoff: 5s, 10s, 15s, 20s, 25s, capped at 30s
          const backoffDelay = Math.min(5000 * consecutiveErrors, maxBackoffDelay);
          console.log(
            `[Suno] 524 timeout: Attempt ${consecutiveErrors}/${maxConsecutiveErrors} - Waiting ${backoffDelay / 1000}s before retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }

        // For other errors, use adaptive polling interval with small backoff
        console.error(
          '[Suno] Status check error:',
          error.message,
          `- Retrying in ${(pollInterval / 1000).toFixed(1)}s`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error(`Song generation timed out after ${maxWaitMs / 1000}s`);
  }

  /**
   * Generate a song and validate duration, retrying once if outside ±20s tolerance.
   * Wraps generateSong + waitForCompletion with smart retry logic.
   */
  async generateSongWithDurationValidation(params: {
    lyrics: string;
    style: string;
    title: string;
    instrumental?: boolean;
    model?: 'V3_5' | 'V4' | 'V5';
    targetDuration: number;
  }): Promise<{ tracks: SunoTrack[]; retried: boolean }> {
    const DURATION_TOLERANCE = 20; // ±20 seconds

    // First attempt
    const { taskId } = await this.generateSong({
      ...params,
      targetDuration: params.targetDuration,
    });
    const tracks = await this.waitForCompletion(taskId);

    if (!tracks || tracks.length === 0) {
      return { tracks: tracks || [], retried: false };
    }

    const actualDuration = tracks[0].duration;
    const delta = actualDuration - params.targetDuration;

    console.log(
      `[Suno] Duration check: target=${params.targetDuration}s, actual=${actualDuration}s, delta=${delta > 0 ? '+' : ''}${delta.toFixed(1)}s`,
    );

    // If within tolerance, accept
    if (Math.abs(delta) <= DURATION_TOLERANCE) {
      console.log(`[Suno] ✅ Duration within ±${DURATION_TOLERANCE}s tolerance`);
      return { tracks, retried: false };
    }

    // Outside tolerance — retry once with adjusted structure
    console.log(`[Suno] ⚠️ Duration miss (${delta > 0 ? 'too long' : 'too short'}) — retrying with adjusted structure`);

    // Adjust target: if song was too short, add sections; if too long, remove sections
    const adjustedTarget = params.targetDuration + (delta < 0 ? 30 : -30);
    const adjustedLyrics = params.lyrics.includes('[')
      ? generateInstrumentalStructure(adjustedTarget, params.style)
      : params.lyrics;

    try {
      const { taskId: retryTaskId } = await this.generateSong({
        ...params,
        lyrics: adjustedLyrics,
        targetDuration: adjustedTarget,
      });
      const retryTracks = await this.waitForCompletion(retryTaskId);

      if (retryTracks && retryTracks.length > 0) {
        const retryDuration = retryTracks[0].duration;
        const retryDelta = Math.abs(retryDuration - params.targetDuration);
        const origDelta = Math.abs(actualDuration - params.targetDuration);

        console.log(
          `[Suno] Retry duration: ${retryDuration}s (delta=${retryDelta.toFixed(1)}s vs original ${origDelta.toFixed(1)}s)`,
        );

        // Use whichever is closer to target
        if (retryDelta < origDelta) {
          console.log(`[Suno] ✅ Retry improved duration accuracy — using retry`);
          return { tracks: retryTracks, retried: true };
        } else {
          console.log(`[Suno] ℹ️ Retry didn't improve — keeping original`);
          return { tracks, retried: true };
        }
      }
    } catch (retryErr: any) {
      console.warn(`[Suno] Retry failed: ${retryErr.message} — keeping original`);
    }

    return { tracks, retried: true };
  }

  async downloadAudio(audioUrl: string, outputPath: string): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');

    const response = await axios.get(audioUrl, {
      responseType: 'arraybuffer',
    });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log('[Suno] Downloaded audio to:', outputPath);
    return outputPath;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }
}

export const sunoApi = new SunoApiService();
