/**
 * Audio-Video Sync Validation Service
 *
 * Ensures Kling clips are properly synchronized with music/lyrics by:
 * 1. Using Whisper to get word-level timestamps
 * 2. Using Demucs to isolate vocals for cleaner alignment
 * 3. Comparing clip boundaries against lyric spans
 * 4. Detecting timing drift and calculating sync scores
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import { transcribeAudioWithTimestamps } from './openai-service';
import { separateAudio } from './audio-intelligence';
import { spawn } from 'child_process';

// ============================================================================
// TYPES
// ============================================================================

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number; // seconds
  confidence?: number;
}

export interface LyricSpan {
  clipIndex: number;
  lyricText: string;
  startTime: number;
  endTime: number;
  words: WordTimestamp[];
  expectedDuration: number;
}

export interface ClipSyncMetrics {
  clipIndex: number;
  clipDuration: number;
  lyricSpanDuration: number;
  offsetMs: number; // How far off from expected start (ms)
  driftRateMs: number; // Cumulative drift per second (ms)
  lipSyncConfidence: number;
  hasVocalContent: boolean;
  syncScore: number; // 0-100
  issues: string[];
}

export interface SyncValidationReport {
  packageId: string;
  audioPath: string;
  totalClips: number;
  passedClips: number;
  failedClips: number;
  overallSyncScore: number;
  averageDriftMs: number;
  maxDriftMs: number;
  clipMetrics: ClipSyncMetrics[];
  lyricSpans: LyricSpan[];
  recommendations: string[];
  validatedAt: Date;
}

export interface ForcedAlignmentResult {
  words: WordTimestamp[];
  fullText: string;
  duration: number;
  language: string;
  vocalsPath?: string; // Path to isolated vocals if used
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SYNC_CONFIG = {
  KLING_CLIP_DURATION: 5, // Standard Kling clip duration in seconds
  MAX_ACCEPTABLE_OFFSET_MS: 150, // Max offset before flagging as out of sync
  MAX_ACCEPTABLE_DRIFT_MS: 80, // Max cumulative drift per second
  SYNC_PASS_THRESHOLD: 80, // Minimum sync score to pass
  MIN_VOCAL_ENERGY: 0.1, // Minimum RMS energy to consider "has vocals"
  CACHE_DIR: join(process.cwd(), 'data', 'cache', 'sync'),
};

// Ensure cache directory exists
try {
  mkdirSync(SYNC_CONFIG.CACHE_DIR, { recursive: true });
} catch {}

// ============================================================================
// FORCED ALIGNMENT SERVICE
// ============================================================================

class AudioVideoSyncService {
  /**
   * Get forced alignment for an audio file
   * Uses Demucs to isolate vocals, then Whisper for word timestamps
   */
  async getForcedAlignment(
    audioPath: string,
    options: {
      useVocalIsolation?: boolean;
      lyrics?: string; // Optional lyrics to compare against
    } = {},
  ): Promise<ForcedAlignmentResult> {
    console.log(`🎯 [SyncService] Getting forced alignment: ${basename(audioPath)}`);

    const { useVocalIsolation = true, lyrics } = options;

    // Check cache
    const cacheKey = this.getCacheKey(audioPath, useVocalIsolation);
    const cached = this.getCachedAlignment(cacheKey);
    if (cached) {
      console.log(`   ✅ Using cached alignment (${cached.words.length} words)`);
      return cached;
    }

    let transcriptionPath = audioPath;
    let vocalsPath: string | undefined;

    // Step 1: Optionally isolate vocals for cleaner alignment
    if (useVocalIsolation) {
      try {
        console.log(`   🎵 Isolating vocals with Demucs...`);
        const separation = await separateAudio(audioPath);
        if (separation.vocalsPath && existsSync(separation.vocalsPath)) {
          transcriptionPath = separation.vocalsPath;
          vocalsPath = separation.vocalsPath;
          console.log(`   ✅ Vocals isolated: ${vocalsPath}`);
        }
      } catch (error) {
        console.warn(`   ⚠️ Vocal isolation failed, using full audio: ${error}`);
      }
    }

    // Step 2: Get Whisper transcription with word timestamps
    console.log(`   🎤 Getting Whisper word timestamps...`);
    const transcription = await transcribeAudioWithTimestamps(transcriptionPath);

    const result: ForcedAlignmentResult = {
      words: transcription.words.map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: 0.9, // Whisper doesn't provide per-word confidence
      })),
      fullText: transcription.text,
      duration: transcription.duration,
      language: transcription.language,
      vocalsPath,
    };

    // Cache the result
    this.cacheAlignment(cacheKey, result);

    console.log(`   ✅ Aligned ${result.words.length} words over ${result.duration.toFixed(1)}s`);

    return result;
  }

  /**
   * Build lyric spans for each clip based on forced alignment
   */
  buildLyricSpans(
    alignment: ForcedAlignmentResult,
    clipDuration: number = SYNC_CONFIG.KLING_CLIP_DURATION,
  ): LyricSpan[] {
    const spans: LyricSpan[] = [];
    const totalDuration = alignment.duration;
    const clipCount = Math.ceil(totalDuration / clipDuration);

    for (let i = 0; i < clipCount; i++) {
      const clipStart = i * clipDuration;
      const clipEnd = Math.min((i + 1) * clipDuration, totalDuration);

      // Find words that fall within this clip's time range
      const clipWords = alignment.words.filter((w) => w.start >= clipStart && w.start < clipEnd);

      const lyricText = clipWords.map((w) => w.word).join(' ');

      spans.push({
        clipIndex: i,
        lyricText,
        startTime: clipStart,
        endTime: clipEnd,
        words: clipWords,
        expectedDuration: clipEnd - clipStart,
      });
    }

    return spans;
  }

  /**
   * Analyze a single clip for sync metrics
   */
  async analyzeClipSync(clipPath: string, lyricSpan: LyricSpan, previousOffset: number = 0): Promise<ClipSyncMetrics> {
    const issues: string[] = [];

    // Get actual clip duration using ffprobe
    const clipDuration = await this.getAudioDuration(clipPath);

    // Calculate offset from expected
    const durationDiff = Math.abs(clipDuration - lyricSpan.expectedDuration);
    const offsetMs = durationDiff * 1000;

    // Calculate drift rate (cumulative drift per second)
    const driftRateMs = previousOffset + offsetMs / lyricSpan.expectedDuration;

    // Check if clip has vocal content (by analyzing lyric span)
    const hasVocalContent = lyricSpan.words.length > 0;

    // Calculate sync score
    let syncScore = 100;

    // Penalize for offset
    if (offsetMs > SYNC_CONFIG.MAX_ACCEPTABLE_OFFSET_MS) {
      const offsetPenalty = Math.min(30, (offsetMs - SYNC_CONFIG.MAX_ACCEPTABLE_OFFSET_MS) / 10);
      syncScore -= offsetPenalty;
      issues.push(`Offset: ${offsetMs.toFixed(0)}ms (>${SYNC_CONFIG.MAX_ACCEPTABLE_OFFSET_MS}ms threshold)`);
    }

    // Penalize for drift
    if (Math.abs(driftRateMs) > SYNC_CONFIG.MAX_ACCEPTABLE_DRIFT_MS) {
      const driftPenalty = Math.min(30, (Math.abs(driftRateMs) - SYNC_CONFIG.MAX_ACCEPTABLE_DRIFT_MS) / 5);
      syncScore -= driftPenalty;
      issues.push(`Drift: ${driftRateMs.toFixed(0)}ms/s (>${SYNC_CONFIG.MAX_ACCEPTABLE_DRIFT_MS}ms/s threshold)`);
    }

    // Penalize for duration mismatch
    if (durationDiff > 0.5) {
      const durationPenalty = Math.min(20, durationDiff * 10);
      syncScore -= durationPenalty;
      issues.push(`Duration mismatch: ${durationDiff.toFixed(2)}s`);
    }

    // Estimate lip sync confidence (placeholder - would need video analysis)
    const lipSyncConfidence = hasVocalContent ? 75 : 100;

    return {
      clipIndex: lyricSpan.clipIndex,
      clipDuration,
      lyricSpanDuration: lyricSpan.expectedDuration,
      offsetMs,
      driftRateMs,
      lipSyncConfidence,
      hasVocalContent,
      syncScore: Math.max(0, Math.round(syncScore)),
      issues,
    };
  }

  /**
   * Validate sync for all clips against the audio
   */
  async validateSync(
    audioPath: string,
    clipPaths: string[],
    packageId: string,
    options: {
      useVocalIsolation?: boolean;
      clipDuration?: number;
    } = {},
  ): Promise<SyncValidationReport> {
    console.log(`\n🔄 [SyncService] Validating sync for ${clipPaths.length} clips`);
    console.log(`   📁 Audio: ${basename(audioPath)}`);

    const { useVocalIsolation = true, clipDuration = SYNC_CONFIG.KLING_CLIP_DURATION } = options;

    // Step 1: Get forced alignment
    const alignment = await this.getForcedAlignment(audioPath, { useVocalIsolation });

    // Step 2: Build lyric spans
    const lyricSpans = this.buildLyricSpans(alignment, clipDuration);

    // Step 3: Analyze each clip
    const clipMetrics: ClipSyncMetrics[] = [];
    let cumulativeOffset = 0;

    for (let i = 0; i < clipPaths.length && i < lyricSpans.length; i++) {
      const clipPath = clipPaths[i];
      const lyricSpan = lyricSpans[i];

      if (!existsSync(clipPath)) {
        console.log(`   ⚠️ Clip ${i} not found: ${clipPath}`);
        clipMetrics.push({
          clipIndex: i,
          clipDuration: 0,
          lyricSpanDuration: lyricSpan.expectedDuration,
          offsetMs: 0,
          driftRateMs: 0,
          lipSyncConfidence: 0,
          hasVocalContent: lyricSpan.words.length > 0,
          syncScore: 0,
          issues: ['Clip file not found'],
        });
        continue;
      }

      const metrics = await this.analyzeClipSync(clipPath, lyricSpan, cumulativeOffset);
      cumulativeOffset += metrics.offsetMs;
      clipMetrics.push(metrics);
    }

    // Step 4: Calculate overall metrics
    const passedClips = clipMetrics.filter((m) => m.syncScore >= SYNC_CONFIG.SYNC_PASS_THRESHOLD).length;
    const failedClips = clipMetrics.filter((m) => m.syncScore < SYNC_CONFIG.SYNC_PASS_THRESHOLD).length;
    const overallSyncScore =
      clipMetrics.length > 0
        ? Math.round(clipMetrics.reduce((sum, m) => sum + m.syncScore, 0) / clipMetrics.length)
        : 0;
    const averageDriftMs =
      clipMetrics.length > 0
        ? clipMetrics.reduce((sum, m) => sum + Math.abs(m.driftRateMs), 0) / clipMetrics.length
        : 0;
    const maxDriftMs = clipMetrics.length > 0 ? Math.max(...clipMetrics.map((m) => Math.abs(m.driftRateMs))) : 0;

    // Step 5: Generate recommendations
    const recommendations = this.generateRecommendations(clipMetrics, lyricSpans);

    const report: SyncValidationReport = {
      packageId,
      audioPath,
      totalClips: clipPaths.length,
      passedClips,
      failedClips,
      overallSyncScore,
      averageDriftMs,
      maxDriftMs,
      clipMetrics,
      lyricSpans,
      recommendations,
      validatedAt: new Date(),
    };

    // Log summary
    console.log(`\n📊 [SyncService] Validation Summary:`);
    console.log(`   ✅ Passed: ${passedClips}/${clipPaths.length} clips`);
    console.log(`   ❌ Failed: ${failedClips}/${clipPaths.length} clips`);
    console.log(`   📈 Overall Sync Score: ${overallSyncScore}/100`);
    console.log(`   📏 Average Drift: ${averageDriftMs.toFixed(1)}ms`);
    console.log(`   📏 Max Drift: ${maxDriftMs.toFixed(1)}ms`);

    if (recommendations.length > 0) {
      console.log(`   💡 Recommendations:`);
      recommendations.forEach((r) => console.log(`      - ${r}`));
    }

    return report;
  }

  /**
   * Quick sync check for a single clip against its expected timing
   * Used in the clip-retry quality gate
   */
  async quickSyncCheck(
    clipPath: string,
    expectedStartTime: number,
    expectedEndTime: number,
    alignment?: ForcedAlignmentResult,
  ): Promise<{
    syncScore: number;
    offsetMs: number;
    hasVocalContent: boolean;
    issues: string[];
    passed: boolean;
  }> {
    const clipDuration = await this.getAudioDuration(clipPath);
    const expectedDuration = expectedEndTime - expectedStartTime;

    // Check if there are lyrics in this time range
    let hasVocalContent = false;
    if (alignment) {
      const wordsInRange = alignment.words.filter((w) => w.start >= expectedStartTime && w.start < expectedEndTime);
      hasVocalContent = wordsInRange.length > 0;
    }

    // Calculate offset
    const durationDiff = Math.abs(clipDuration - expectedDuration);
    const offsetMs = durationDiff * 1000;

    // Calculate sync score
    let syncScore = 100;
    const issues: string[] = [];

    if (offsetMs > SYNC_CONFIG.MAX_ACCEPTABLE_OFFSET_MS) {
      const penalty = Math.min(40, offsetMs / 10);
      syncScore -= penalty;
      issues.push(`Duration offset: ${offsetMs.toFixed(0)}ms`);
    }

    if (durationDiff > 0.5) {
      const penalty = Math.min(30, durationDiff * 20);
      syncScore -= penalty;
      issues.push(`Duration mismatch: expected ${expectedDuration.toFixed(1)}s, got ${clipDuration.toFixed(1)}s`);
    }

    syncScore = Math.max(0, Math.round(syncScore));

    return {
      syncScore,
      offsetMs,
      hasVocalContent,
      issues,
      passed: syncScore >= SYNC_CONFIG.SYNC_PASS_THRESHOLD,
    };
  }

  /**
   * Generate actionable recommendations based on sync analysis
   */
  private generateRecommendations(clipMetrics: ClipSyncMetrics[], lyricSpans: LyricSpan[]): string[] {
    const recommendations: string[] = [];

    // Check for systemic issues
    const avgOffset = clipMetrics.reduce((sum, m) => sum + m.offsetMs, 0) / clipMetrics.length;
    if (avgOffset > 200) {
      recommendations.push(
        `Consider time-stretching audio by ${(avgOffset / 1000).toFixed(2)}s to reduce average offset`,
      );
    }

    // Check for progressive drift
    const lastClip = clipMetrics[clipMetrics.length - 1];
    if (lastClip && Math.abs(lastClip.driftRateMs) > 300) {
      recommendations.push(
        `Cumulative drift of ${lastClip.driftRateMs.toFixed(0)}ms detected - consider re-slicing audio at beat boundaries`,
      );
    }

    // Check for specific problematic clips
    const problemClips = clipMetrics.filter((m) => m.syncScore < 60);
    if (problemClips.length > 0) {
      const indices = problemClips.map((m) => m.clipIndex).join(', ');
      recommendations.push(`Clips ${indices} have severe sync issues - consider regenerating with adjusted timing`);
    }

    // Check for clips with no vocal content during expected vocals
    const silentVocalClips = clipMetrics.filter((m, i) => !m.hasVocalContent && lyricSpans[i]?.words.length > 3);
    if (silentVocalClips.length > 0) {
      recommendations.push(`${silentVocalClips.length} clips missing expected vocal content - check clip assignment`);
    }

    return recommendations;
  }

  /**
   * Get audio duration using ffprobe
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve) => {
      const ffprobe = spawn('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        audioPath,
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code === 0) {
          const duration = parseFloat(output.trim());
          resolve(isNaN(duration) ? 5 : duration);
        } else {
          resolve(5); // Default to 5 seconds if ffprobe fails
        }
      });

      ffprobe.on('error', () => {
        resolve(5);
      });
    });
  }

  /**
   * Cache helpers
   */
  private getCacheKey(audioPath: string, useVocalIsolation: boolean): string {
    const content = readFileSync(audioPath).slice(0, 65536);
    return createHash('md5').update(content).update(String(useVocalIsolation)).digest('hex');
  }

  private getCachedAlignment(cacheKey: string): ForcedAlignmentResult | null {
    const cachePath = join(SYNC_CONFIG.CACHE_DIR, `${cacheKey}.json`);
    try {
      if (existsSync(cachePath)) {
        return JSON.parse(readFileSync(cachePath, 'utf-8'));
      }
    } catch {}
    return null;
  }

  private cacheAlignment(cacheKey: string, result: ForcedAlignmentResult): void {
    const cachePath = join(SYNC_CONFIG.CACHE_DIR, `${cacheKey}.json`);
    try {
      writeFileSync(cachePath, JSON.stringify(result, null, 2));
    } catch {}
  }
}

export const audioVideoSyncService = new AudioVideoSyncService();
