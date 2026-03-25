import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, existsSync, copyFileSync, statSync, mkdirSync, readFileSync } from 'fs';
import { join, basename, dirname, extname } from 'path';
import { VIDEO_FORMATS, FFMPEG_CONFIG, getDimensionsForAspectRatio } from '../config/video-constants';
import { ffmpegOutputValidator } from './ffmpeg-output-validator';
import { TempPaths } from '../utils/temp-file-manager';

// Temp directory is now managed by TempPaths (data/temp/processing/)

const execAsync = promisify(exec);

// FFmpeg encoder detection (ported from looping-section-service.ts)
interface EncoderConfig {
  encoder: string;
  preset: string;
  hardwareAccelerated: boolean;
}

let cachedEncoderConfig: EncoderConfig | null = null;

/**
 * Detect best available H.264 encoder (GPU > CPU)
 * Caches result after first detection.
 */
async function detectBestEncoder(): Promise<EncoderConfig> {
  if (cachedEncoderConfig) return cachedEncoderConfig;

  try {
    await execAsync('ffmpeg -hide_banner -f lavfi -i nullsrc=s=64x64:d=0.1 -c:v h264_nvenc -f null - 2>&1');
    console.log('🎮 GPU encoding available: NVIDIA h264_nvenc (p5 - balanced quality/speed)');
    cachedEncoderConfig = { encoder: 'h264_nvenc', preset: 'p5', hardwareAccelerated: true };
    return cachedEncoderConfig;
  } catch {}

  try {
    await execAsync('ffmpeg -hide_banner -f lavfi -i nullsrc=s=64x64:d=0.1 -c:v h264_qsv -f null - 2>&1');
    console.log('🎮 GPU encoding available: Intel Quick Sync h264_qsv');
    cachedEncoderConfig = { encoder: 'h264_qsv', preset: 'fast', hardwareAccelerated: true };
    return cachedEncoderConfig;
  } catch {}

  console.log('💻 Using CPU encoding: libx264');
  cachedEncoderConfig = { encoder: 'libx264', preset: 'fast', hardwareAccelerated: false };
  return cachedEncoderConfig;
}

/**
 * Build encoder flags string using detected hardware.
 * GPU encoders don't use CRF the same way, so only set -crf for CPU.
 */
async function getEncoderFlags(): Promise<string> {
  const config = await detectBestEncoder();
  if (config.hardwareAccelerated) {
    return `-c:v ${config.encoder} -preset ${config.preset} -pix_fmt yuv420p`;
  }
  return `-c:v ${config.encoder} -preset ${config.preset} -crf 18 -pix_fmt yuv420p`;
}

/**
 * Build encoder flags optimized for intermediate/temp files.
 * These files get re-encoded again in Phase 2, so quality doesn't matter —
 * use the fastest possible settings: GPU p1 or CPU ultrafast.
 */
async function getIntermediateEncoderFlags(): Promise<string> {
  const config = await detectBestEncoder();
  if (config.hardwareAccelerated) {
    const fastPreset = config.encoder === 'h264_nvenc' ? 'p1' : 'veryfast';
    return `-c:v ${config.encoder} -preset ${fastPreset} -pix_fmt yuv420p`;
  }
  return `-c:v ${config.encoder} -preset ultrafast -crf 23 -pix_fmt yuv420p`;
}

/**
 * Sanitize a file path for safe use in shell commands.
 * Rejects paths containing shell metacharacters that could enable command injection.
 */
function sanitizePath(filePath: string): string {
  // Reject paths with dangerous shell characters
  const dangerous = /[`$;|&><\r\n\\]/;
  if (dangerous.test(filePath)) {
    throw new Error(`Unsafe path detected (contains shell metacharacters): ${filePath}`);
  }
  return filePath;
}

/** Default timeout for FFmpeg operations (10 minutes) */
const FFMPEG_TIMEOUT = 600000;

interface CombineVideosOptions {
  videoPaths: string[];
  outputPath: string;
  audioPath?: string;
  audioVolume?: number;
}

export interface FFmpegState {
  phase: 'preprocess' | 'segments' | 'finalize' | null;
  segmentSize: number;
  batchCount: number;
  completedBatches: number[];
  segmentArtifacts: Array<{
    batchId: number;
    path: string;
    startClip: number;
    endClip: number;
    duration: number;
  }>;
  normalizedClipPaths: string[];
  videoNoAudioPath?: string;
  finalVideoPath?: string;
}

export interface SegmentPlan {
  batches: Array<{
    batchId: number;
    startIdx: number;
    endIdx: number;
    clipPaths: string[];
  }>;
  totalBatches: number;
}

/**
 * FFmpeg Video Processor
 * Handles video concatenation and audio mixing
 */
export class FFmpegProcessor {
  /**
   * Check if FFmpeg is installed
   */
  async checkFFmpeg(): Promise<boolean> {
    try {
      await execAsync('ffmpeg -version');
      return true;
    } catch (error) {
      console.error('FFmpeg not found. Video processing will be limited.');
      return false;
    }
  }

  /**
   * Concatenate multiple audio files into one
   * @param audioPaths - Array of audio file paths to concatenate
   * @param outputPath - Output path for the concatenated audio
   * @returns Path to the concatenated audio file
   */
  async concatenateAudioFiles(audioPaths: string[], outputPath: string): Promise<string> {
    if (audioPaths.length === 0) {
      throw new Error('No audio paths provided for concatenation');
    }

    if (audioPaths.length === 1) {
      // Just copy the file if there's only one
      copyFileSync(audioPaths[0], outputPath);
      return outputPath;
    }

    const tempDir = TempPaths.processing();
    const timestamp = Date.now();
    const concatListFile = join(tempDir, `audio_concat_${timestamp}.txt`);

    try {
      // Create concat file for FFmpeg (escape single quotes in paths for safety)
      const concatList = audioPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
      writeFileSync(concatListFile, concatList);

      console.log(`🎵 Concatenating ${audioPaths.length} audio files...`);

      // Concatenate using FFmpeg concat demuxer (fast, no re-encoding)
      await execAsync(`ffmpeg -f concat -safe 0 -i "${concatListFile}" -c copy "${outputPath}" -y -loglevel error`, {
        maxBuffer: 50 * 1024 * 1024,
      });

      // Verify output exists
      if (!existsSync(outputPath)) {
        throw new Error('Audio concatenation failed - output file not created');
      }

      const stats = statSync(outputPath);
      console.log(`✅ Audio concatenated: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);

      // Cleanup
      if (existsSync(concatListFile)) {
        unlinkSync(concatListFile);
      }

      return outputPath;
    } catch (error: any) {
      console.error('❌ Audio concatenation failed:', error.message);
      try {
        const { errorMonitor } = await import('./error-monitor');
        await errorMonitor.captureError(error instanceof Error ? error : new Error(String(error)), {
          service: 'ffmpeg-processor',
          operation: 'concatenateAudioFiles',
          metadata: { fileCount: audioPaths.length },
        });
      } catch {}
      throw error;
    }
  }

  /**
   * Validate that a video file is not corrupted
   * Checks for missing moov atom and other common corruption issues
   * @param filePath - Path to video file to validate
   * @returns true if file is valid, false if corrupted
   */
  async validateVideoFile(filePath: string): Promise<boolean> {
    try {
      if (!existsSync(filePath)) {
        return false;
      }

      // Use ffprobe to validate the file - this will fail if moov atom is missing
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}" 2>&1`,
        { timeout: 15000 },
      );

      // If we get a valid duration, file is okay
      const duration = parseFloat(stdout.trim());
      if (isNaN(duration) || duration <= 0) {
        return false;
      }

      // Decode first second to catch files with valid headers but corrupted frames
      await execAsync(`ffmpeg -v error -i "${filePath}" -t 1 -f null -`, { timeout: 15000 });

      return true;
    } catch (error) {
      // FFprobe or decode failed = file is corrupted
      return false;
    }
  }

  /**
   * Apply visual style mutations using FFmpeg filters
   * This varies the video aesthetics for anti-bot protection
   *
   * @param inputPath - Path to input video file
   * @param outputPath - Path to output video file
   * @param styleParams - Style parameters from Style Bandit
   * @returns Path to the styled video
   */
  async applyVisualStyleMutation(
    inputPath: string,
    outputPath: string,
    styleParams: {
      colorMultiplier: number;
      contrast: number;
      overlayTexture?: string | null;
    },
  ): Promise<string> {
    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      console.log('⚠️ FFmpeg not available, skipping style mutation');
      copyFileSync(inputPath, outputPath);
      return outputPath;
    }

    try {
      console.log(`🎨 Applying visual style mutation...`);

      // Build FFmpeg filter chain
      const filters: string[] = [];

      // 1. Color/Saturation mutation (colorx equivalent)
      // colorMultiplier < 1.0 = desaturated, > 1.0 = saturated
      const saturation = styleParams.colorMultiplier;
      filters.push(`eq=saturation=${saturation.toFixed(2)}`);

      // 2. Contrast adjustment (lum_contrast equivalent)
      // contrast: 0-100 range, FFmpeg contrast uses -1000 to 1000
      // Map our 0-50 range to FFmpeg's -50 to 50 range
      const contrastValue = (styleParams.contrast - 20) / 20; // Center at 20, range +-1.5
      filters.push(`eq=contrast=${(1 + contrastValue * 0.3).toFixed(2)}`);

      // 3. Color temperature shift based on colorMultiplier
      // Warm colors (yellow/orange) for high multipliers, cool (blue) for low
      if (styleParams.colorMultiplier > 1.0) {
        // Warm tint - increase red/yellow
        filters.push('colorbalance=rs=0.1:gs=0.05:bs=-0.1');
      } else if (styleParams.colorMultiplier < 0.85) {
        // Cool tint - increase blue
        filters.push('colorbalance=rs=-0.1:gs=0:bs=0.1');
      }

      // Build the filter complex string
      const filterComplex = filters.join(',');

      // Use GPU-aware encoder flags
      const encoderFlags = await getEncoderFlags();

      // 4. Handle overlay texture if specified
      if (styleParams.overlayTexture) {
        const overlayPath = join(process.cwd(), 'assets', 'overlays', styleParams.overlayTexture);
        if (existsSync(overlayPath)) {
          // Apply overlay with low opacity blend
          const cmd = `ffmpeg -y -i "${inputPath}" -i "${overlayPath}" -filter_complex "[0:v]${filterComplex}[styled];[1:v]scale=iw:ih,format=rgba[overlay];[styled][overlay]blend=all_mode=overlay:all_opacity=0.2[v]" -map "[v]" -map 0:a? ${encoderFlags} -c:a copy "${outputPath}"`;

          await execAsync(cmd, { timeout: 300000 });
          console.log(`   ✅ Applied style mutation with overlay: ${styleParams.overlayTexture}`);
          return outputPath;
        } else {
          console.log(`   ⚠️ Overlay not found: ${overlayPath}, applying color mutation only`);
        }
      }

      // Apply filters without overlay
      const cmd = `ffmpeg -y -i "${inputPath}" -vf "${filterComplex}" ${encoderFlags} -c:a copy "${outputPath}"`;

      await execAsync(cmd, { timeout: 300000 });
      console.log(
        `   ✅ Applied style mutation (saturation=${saturation.toFixed(2)}, contrast=${contrastValue.toFixed(2)})`,
      );

      return outputPath;
    } catch (error: any) {
      console.error(`   ❌ Style mutation failed: ${error.message}`);
      // Fallback: copy original
      copyFileSync(inputPath, outputPath);
      return outputPath;
    }
  }

  /**
   * Post-process a single video clip with quality enhancement filters.
   * Applied before assembly to clean up Kling AI artifacts.
   *
   * Filters (light — enhancement, not heavy grading):
   * - hqdn3d: Light denoise to clean up generation artifacts
   * - unsharp: Subtle sharpening for crisper detail
   * - colorbalance: Normalize color consistency across clips
   *
   * @param inputPath - Path to raw Kling clip
   * @param outputPath - Path for enhanced clip
   * @param clipIndex - Position in sequence (for logging)
   * @param energy - Clip energy level 0-1 (optional, for color grading)
   * @returns Path to enhanced clip
   */
  async postProcessClip(
    inputPath: string,
    outputPath: string,
    clipIndex: number = 0,
    energy: number = 0.5,
  ): Promise<string> {
    try {
      // Build filter chain: denoise → sharpen → color normalization
      const filters = [
        'hqdn3d=3:2:3:2', // Light spatial + temporal denoise
        'unsharp=3:3:0.5:3:3:0.0', // Subtle luma sharpening only
      ];

      // Subtle color temperature shift based on energy
      // High energy clips: slightly warmer, low energy: slightly cooler
      if (energy > 0.7) {
        filters.push('colorbalance=rs=0.03:gs=0.01:bs=-0.02');
      } else if (energy < 0.3) {
        filters.push('colorbalance=rs=-0.02:gs=0.0:bs=0.03');
      }

      const vfChain = filters.join(',');
      const encoderFlags = await getEncoderFlags();

      await execAsync(
        `ffmpeg -y -i "${sanitizePath(inputPath)}" -vf "${vfChain}" ${encoderFlags} -c:a copy "${sanitizePath(outputPath)}"`,
        { timeout: 120000 },
      );

      if (existsSync(outputPath)) {
        return outputPath;
      }

      // Fallback: use original if post-processing fails
      copyFileSync(inputPath, outputPath);
      return outputPath;
    } catch (error: any) {
      console.error(`   ⚠️ Post-process clip ${clipIndex} failed: ${error.message}`);
      // Non-fatal: copy original on failure (if input exists)
      try {
        if (existsSync(inputPath)) {
          copyFileSync(inputPath, outputPath);
          return outputPath;
        }
      } catch {}
      // Input file missing — return input path and let downstream handle it
      return inputPath;
    }
  }

  /**
   * Auto-detect hook point in audio and trim for hook-first playback
   * Uses librosa beat detection to find the first significant energy spike
   *
   * @param audioPath - Path to input audio file
   * @param jobId - Job identifier for naming temp files
   * @param forceDetect - Always run detection even if intro seems fine
   * @returns Object with processed audio path and trim info
   */
  async processAudioForHookFirst(
    audioPath: string,
    jobId: string = Date.now().toString(),
    forceDetect: boolean = false,
  ): Promise<{
    processedAudioPath: string;
    wasTrimed: boolean;
    trimOffset: number;
    dropTimestamp: number;
    confidence: number;
    bpm: number;
  }> {
    try {
      const { audioHookDetection } = await import('./audio-hook-detection');

      console.log('🎯 Analyzing audio for hook detection...');
      const trimDecision = await audioHookDetection.shouldTrimIntro(audioPath);

      if (trimDecision.shouldTrim && trimDecision.detection) {
        console.log(`✂️  ${trimDecision.reason}`);
        console.log(`   Trimming audio to start at ${trimDecision.trimTo.toFixed(2)}s`);

        const tempDir = TempPaths.processing();
        const ext = audioPath.split('.').pop() || 'mp3';
        const trimmedPath = join(tempDir, `job_${jobId}_audio_trimmed.${ext}`);

        // Use stream copy for speed (no re-encoding)
        const cmd = `ffmpeg -y -ss ${trimDecision.trimTo.toFixed(3)} -i "${audioPath}" -c copy "${trimmedPath}"`;

        try {
          await execAsync(cmd, { timeout: 30000 });
          console.log(`   ✅ Audio trimmed successfully`);

          return {
            processedAudioPath: trimmedPath,
            wasTrimed: true,
            trimOffset: trimDecision.trimTo,
            dropTimestamp: trimDecision.detection.dropTimestamp,
            confidence: trimDecision.detection.confidence,
            bpm: trimDecision.detection.bpm,
          };
        } catch (ffmpegError) {
          console.error('FFmpeg trim failed, using original audio:', ffmpegError);
          // Fall through to return original
        }
      } else {
        console.log(`✅ ${trimDecision.reason}`);
      }

      // Return original audio if no trim needed or failed
      return {
        processedAudioPath: audioPath,
        wasTrimed: false,
        trimOffset: 0,
        dropTimestamp: trimDecision.detection?.dropTimestamp ?? 0,
        confidence: trimDecision.detection?.confidence ?? 0,
        bpm: trimDecision.detection?.bpm ?? 0,
      };
    } catch (error) {
      console.error('Hook detection failed, using original audio:', error);
      return {
        processedAudioPath: audioPath,
        wasTrimed: false,
        trimOffset: 0,
        dropTimestamp: 0,
        confidence: 0,
        bpm: 0,
      };
    }
  }

  /**
   * Build a plan for batch-merging clips
   * @param clipPaths - Array of clip paths to batch
   * @param batchSize - Number of clips per batch (default: 5)
   * @returns Segment plan with batch boundaries
   */
  async buildSegmentPlan(clipPaths: string[], batchSize: number = FFMPEG_CONFIG.BATCH_SIZE): Promise<SegmentPlan> {
    const batches: SegmentPlan['batches'] = [];

    for (let i = 0; i < clipPaths.length; i += batchSize) {
      const endIdx = Math.min(i + batchSize, clipPaths.length);
      batches.push({
        batchId: batches.length,
        startIdx: i,
        endIdx: endIdx,
        clipPaths: clipPaths.slice(i, endIdx),
      });
    }

    console.log(`📋 Segment plan created: ${batches.length} batches of ~${batchSize} clips each`);

    return {
      batches,
      totalBatches: batches.length,
    };
  }

  /**
   * Merge one batch of clips with crossfades → produces segment file
   * IDEMPOTENT: Check if segment already exists before regenerating
   * @param batchId - Batch identifier
   * @param clipPaths - Clips to merge in this batch
   * @param sectionTimings - Timing data for each clip
   * @param jobId - Job identifier for temp file naming
   * @param crossfadeDuration - Duration of crossfades in seconds
   * @param targetWidth - Target video width (1920 for 16:9, 1080 for 9:16)
   * @param targetHeight - Target video height (1080 for 16:9, 1920 for 9:16)
   * @returns Segment metadata with path and duration
   */
  async mergeSegmentBatch(
    batchId: number,
    clipPaths: string[],
    sectionTimings: Array<{ startTime: number; endTime: number }>,
    jobId: string,
    crossfadeDuration: number = FFMPEG_CONFIG.CROSSFADE_DURATION_SECONDS,
    targetWidth: number = VIDEO_FORMATS.LANDSCAPE_16_9.width,
    targetHeight: number = VIDEO_FORMATS.LANDSCAPE_16_9.height,
    totalClipCount: number = 0, // Include total clips to prevent cache collisions
  ): Promise<{ segmentPath: string; duration: number }> {
    const tempDir = TempPaths.processing();
    // Include totalClipCount in filename to prevent reuse when clip count changes
    const segmentPath = join(tempDir, `job_${jobId}_clips${totalClipCount}_segment_${batchId}.mp4`);

    // IDEMPOTENT: Check if segment already exists AND is valid
    if (existsSync(segmentPath)) {
      const isValid = await this.validateVideoFile(segmentPath);
      if (isValid) {
        console.log(`   ✅ Segment ${batchId} already exists, skipping regeneration`);
        const metadata = await this.getVideoMetadata(segmentPath);
        const duration = parseFloat(metadata?.format?.duration || '0');
        return { segmentPath, duration };
      } else {
        // Segment file is corrupted (e.g., from interrupted encoding)
        console.log(`   ⚠️  Segment ${batchId} corrupted, regenerating...`);
        try {
          unlinkSync(segmentPath);
        } catch (e) {
          // Ignore deletion errors
        }
      }
    }

    console.log(`   🔨 Building segment ${batchId} from ${clipPaths.length} clips`);

    if (clipPaths.length === 0) {
      throw new Error(`Batch ${batchId} has no clips`);
    }

    // Single clip batch - just copy it
    if (clipPaths.length === 1) {
      const { copyFileSync } = await import('fs');
      copyFileSync(clipPaths[0], segmentPath);
      const metadata = await this.getVideoMetadata(segmentPath);
      const duration = parseFloat(metadata?.format?.duration || '0');
      console.log(`   ✅ Single-clip segment ${batchId} created (${duration.toFixed(2)}s)`);
      return { segmentPath, duration };
    }

    // Multi-clip batch - merge with crossfades
    // Build filter complex string with xfade between clips
    const inputs = clipPaths.map((_, i) => `-i "${clipPaths[i]}"`).join(' ');

    // Step 1: Scale all inputs to target resolution (normalize resolution)
    let filterComplex = '';
    for (let i = 0; i < clipPaths.length; i++) {
      filterComplex += `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}scaled];`;
    }

    // Step 2: Build xfade chain
    let cumulativeOffset = 0;
    for (let i = 0; i < clipPaths.length - 1; i++) {
      const clipIdx = i; // Index within this batch
      const duration = sectionTimings[clipIdx]
        ? sectionTimings[clipIdx].endTime - sectionTimings[clipIdx].startTime
        : 9;

      if (i === 0) {
        // First transition in batch
        cumulativeOffset = duration - crossfadeDuration;
        filterComplex += `[v${i}scaled][v${i + 1}scaled]xfade=transition=fade:duration=${crossfadeDuration}:offset=${cumulativeOffset.toFixed(2)}[v${i}${i + 1}];`;
      } else {
        // Subsequent transitions
        cumulativeOffset += duration - crossfadeDuration;
        const prevLabel = `v${i - 1}${i}`;
        const nextIdx = i + 1;
        filterComplex += `[${prevLabel}][v${nextIdx}scaled]xfade=transition=fade:duration=${crossfadeDuration}:offset=${cumulativeOffset.toFixed(2)}[v${i}${nextIdx}];`;
      }
    }

    // Remove trailing semicolon
    filterComplex = filterComplex.replace(/;$/, '');

    // Final output label
    const finalLabel = `v${clipPaths.length - 2}${clipPaths.length - 1}`;

    // Execute ffmpeg command (yuv420p required for YouTube compatibility)
    // Uses GPU-aware encoder for faster processing
    // TIMEOUT: Max 3 minutes for segment merging with crossfades
    const segmentEncoderFlags = await getEncoderFlags();
    await execAsync(
      `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[${finalLabel}]" ${segmentEncoderFlags} "${segmentPath}" -y`,
      { timeout: 180000 },
    );

    const metadata = await this.getVideoMetadata(segmentPath);
    const duration = parseFloat(metadata?.format?.duration || '0');

    console.log(`   ✅ Segment ${batchId} created (${duration.toFixed(2)}s)`);

    return { segmentPath, duration };
  }

  /**
   * Merge all segment files into final video (no audio)
   * IDEMPOTENT: Check if final video exists before regenerating
   * @param segmentArtifacts - Array of segment metadata
   * @param outputPath - Output video path
   * @param crossfadeDuration - Duration of crossfades between segments
   * @param targetWidth - Target video width (1920 for 16:9, 1080 for 9:16)
   * @param targetHeight - Target video height (1080 for 16:9, 1920 for 9:16)
   */
  async mergeAllSegments(
    segmentArtifacts: Array<{ batchId: number; path: string; duration: number }>,
    outputPath: string,
    crossfadeDuration: number = FFMPEG_CONFIG.CROSSFADE_DURATION_SECONDS,
    targetWidth: number = VIDEO_FORMATS.LANDSCAPE_16_9.width,
    targetHeight: number = VIDEO_FORMATS.LANDSCAPE_16_9.height,
  ): Promise<void> {
    // IDEMPOTENT: Check if output already exists AND is valid
    if (existsSync(outputPath)) {
      const isValid = await this.validateVideoFile(outputPath);
      if (isValid) {
        console.log(`   ✅ Final video already exists, skipping segment merge`);
        return;
      } else {
        console.log(`   ⚠️  Final video is corrupted, regenerating...`);
        try {
          unlinkSync(outputPath);
        } catch (e) {
          // File might be locked, continue anyway
        }
      }
    }

    console.log(`   🔗 Merging ${segmentArtifacts.length} segments into final video`);

    if (segmentArtifacts.length === 0) {
      throw new Error('No segments to merge');
    }

    // Single segment - just copy it
    if (segmentArtifacts.length === 1) {
      const { copyFileSync } = await import('fs');
      copyFileSync(segmentArtifacts[0].path, outputPath);
      console.log(`   ✅ Single segment copied to final video`);
      return;
    }

    // Sort segments by batchId to ensure correct order
    const sortedSegments = [...segmentArtifacts].sort((a, b) => a.batchId - b.batchId);

    // Multi-segment - merge with crossfades between segments
    const inputs = sortedSegments.map((_, i) => `-i "${sortedSegments[i].path}"`).join(' ');

    // Build filter complex with segment normalization BEFORE xfade
    let filterComplex = '';

    // Step 1: Normalize all segments to target resolution
    for (let i = 0; i < sortedSegments.length; i++) {
      filterComplex += `[${i}:v]scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:black[v${i}scaled];`;
    }

    // Step 2: Build xfade chain using normalized streams
    let cumulativeOffset = 0;

    for (let i = 0; i < sortedSegments.length - 1; i++) {
      const segmentDuration = sortedSegments[i].duration;

      if (i === 0) {
        // First transition between segments
        cumulativeOffset = segmentDuration - crossfadeDuration;
        filterComplex += `[v${i}scaled][v${i + 1}scaled]xfade=transition=fade:duration=${crossfadeDuration}:offset=${cumulativeOffset.toFixed(2)}[v${i}${i + 1}];`;
      } else {
        // Subsequent transitions
        cumulativeOffset += segmentDuration - crossfadeDuration;
        const prevLabel = `v${i - 1}${i}`;
        const nextIdx = i + 1;
        filterComplex += `[${prevLabel}][v${nextIdx}scaled]xfade=transition=fade:duration=${crossfadeDuration}:offset=${cumulativeOffset.toFixed(2)}[v${i}${nextIdx}];`;
      }
    }

    // Remove trailing semicolon
    filterComplex = filterComplex.replace(/;$/, '');

    // Final output label
    const finalLabel = `v${sortedSegments.length - 2}${sortedSegments.length - 1}`;

    // Execute ffmpeg command (yuv420p required for YouTube compatibility)
    // Uses GPU-aware encoder for faster processing
    // TIMEOUT: Max 5 minutes for final merge of all segments
    const mergeEncoderFlags = await getEncoderFlags();
    await execAsync(
      `ffmpeg ${inputs} -filter_complex "${filterComplex}" -map "[${finalLabel}]" ${mergeEncoderFlags} "${outputPath}" -y`,
      { timeout: 300000 },
    );

    console.log(`   ✅ All segments merged into final video`);
  }

  /**
   * Overlay music on final video
   * IDEMPOTENT: Check if music mix already exists
   * @param videoPath - Input video path (no audio)
   * @param musicPath - Music file path
   * @param outputPath - Output video path with music
   * @param musicDuration - Expected music duration for validation
   */
  async overlayMusic(videoPath: string, musicPath: string, outputPath: string, musicDuration: number): Promise<void> {
    // IDEMPOTENT: Check if output already exists AND has audio
    // Previous bug: file could exist without audio (from a failed/partial assembly), causing skip
    if (existsSync(outputPath)) {
      try {
        const checkResult = await execAsync(
          `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${outputPath}"`,
          { timeout: 10000 },
        );
        if (checkResult.stdout.trim().includes('audio')) {
          console.log(`   ✅ Music video already exists with audio, skipping overlay`);
          return;
        }
        console.log(`   ⚠️ Output file exists but has NO audio - re-running overlay`);
        // Delete the audio-less file so we can re-create it with audio
        unlinkSync(outputPath);
      } catch {
        // Can't verify - delete and re-create
        console.log(`   ⚠️ Cannot verify existing output - re-running overlay`);
        try {
          unlinkSync(outputPath);
        } catch {}
      }
    }

    console.log(`   🎵 Overlaying music track`);

    // Fail-fast if music is expected but file is missing
    if (!existsSync(musicPath)) {
      throw new Error(`Music file not found: ${musicPath}. Cannot proceed with music video generation.`);
    }

    // Overlay music using ffmpeg - normalize audio volume, then trim to music duration
    // loudnorm ensures consistent volume across all videos (EBU R128: -16 LUFS, -1.5 dBTP)
    // TIMEOUT: Max 3 minutes for music overlay (loudnorm requires re-encoding)
    await execAsync(
      `ffmpeg -i "${videoPath}" -i "${musicPath}" ` +
        `-map 0:v:0 -map 1:a:0 ` +
        `-c:v copy -c:a aac -b:a 192k ` +
        `-af "loudnorm=I=-16:TP=-1.5:LRA=11" ` +
        `-t ${musicDuration.toFixed(2)} ` +
        `-shortest ` +
        `"${outputPath}" -y`,
      { timeout: 180000 },
    );

    console.log('   ✅ Music overlaid successfully');

    // Validate output with music
    console.log(`   🔍 Validating music video output...`);
    const validation = await ffmpegOutputValidator.validateOutput(outputPath, {
      expectedDuration: musicDuration,
      durationTolerance: FFMPEG_CONFIG.DURATION_TOLERANCE_SECONDS,
      requireAudio: true,
      requireVideo: true,
    });

    if (!validation.valid) {
      // Check if the only error is duration mismatch - if so, just warn and continue
      const hasCriticalErrors = validation.errors.some((err) => !err.includes('Duration mismatch'));

      if (hasCriticalErrors) {
        // Critical errors (missing audio, corrupted file, etc.) - fail the job
        console.error(`   ❌ Music video validation FAILED (critical errors):`);
        validation.errors.forEach((err) => console.error(`      • ${err}`));
        throw new Error(`Music overlay validation failed: ${validation.errors.join(', ')}`);
      } else {
        // Only duration mismatch - log warning but continue
        console.warn(`   ⚠️  Music video validation warnings (non-critical):`);
        validation.errors.forEach((err) => console.warn(`      • ${err}`));
        console.log(`   ✅ Video generated despite duration mismatch (will be trimmed by -shortest flag)`);
      }
    } else {
      console.log(`   ✅ Duration validated: ${validation.duration.toFixed(2)}s (music: ${musicDuration}s)`);
    }

    if (validation.warnings.length > 0) {
      validation.warnings.forEach((warn) => console.log(`      ⚠️  ${warn}`));
    }
  }

  /**
   * Concatenate multiple video clips into one with optional music overlay and crossfades
   * REFACTORED: Now uses staged pipeline with batch-based checkpointing for resumability
   * @param videoPaths - Array of video file paths to concatenate
   * @param outputPath - Output file path
   * @param musicPath - Optional path to music file to overlay
   * @param musicDuration - Optional music duration for validation
   * @param sectionTimings - Optional array of section timings for per-clip trimming
   * @param enableCrossfades - Enable fade transitions between clips (default: true)
   * @param crossfadeDuration - Duration of fade transitions in seconds (default: 0.3s)
   * @param existingState - Optional existing FFmpegState to resume from
   * @param jobId - Job identifier for temp file naming (defaults to timestamp)
   * @param onBatchComplete - Optional callback after each batch completes
   * @param aspectRatio - Target aspect ratio for normalization ('16:9' or '9:16')
   * @returns Updated FFmpegState for persistence
   */
  async concatenateVideos(
    videoPaths: string[],
    outputPath: string,
    musicPath?: string,
    musicDuration?: number,
    sectionTimings?: Array<{ startTime: number; endTime: number }>,
    enableCrossfades: boolean = true,
    crossfadeDuration: number = 0.3,
    existingState?: FFmpegState,
    jobId: string = Date.now().toString(),
    onBatchComplete?: (batchId: number, totalBatches: number) => Promise<void>,
    aspectRatio: '16:9' | '9:16' = '16:9',
  ): Promise<FFmpegState> {
    if (videoPaths.length === 0) {
      throw new Error('No video paths provided for concatenation');
    }

    const hasFFmpeg = await this.checkFFmpeg();

    if (!hasFFmpeg) {
      // Fallback: just copy the first video
      console.log('FFmpeg not available, using first clip only');
      const { copyFileSync } = await import('fs');
      copyFileSync(videoPaths[0], outputPath);

      // Return minimal state
      return {
        phase: null,
        segmentSize: 1,
        batchCount: 1,
        completedBatches: [0],
        segmentArtifacts: [],
        normalizedClipPaths: [outputPath],
        finalVideoPath: outputPath,
      };
    }

    const tempDir = TempPaths.processing();
    const BATCH_SIZE = FFMPEG_CONFIG.BATCH_SIZE;

    // Initialize or resume state
    const state: FFmpegState = existingState || {
      phase: null,
      segmentSize: BATCH_SIZE,
      batchCount: 0,
      completedBatches: [],
      segmentArtifacts: [],
      normalizedClipPaths: [],
    };

    // Determine target resolution based on aspect ratio
    const targetWidth = aspectRatio === '9:16' ? 1080 : 1920;
    const targetHeight = aspectRatio === '9:16' ? 1920 : 1080;
    console.log(`🎬 Starting FFmpeg pipeline (Job: ${jobId}) @ ${targetWidth}x${targetHeight} (${aspectRatio})`);
    if (existingState) {
      console.log(
        `   📍 Resuming from phase: ${existingState.phase}, completed batches: ${existingState.completedBatches.length}`,
      );
    }

    // ========================================
    // PHASE 1: PREPROCESS - Normalize clips
    // ========================================
    if (!state.phase || state.phase === 'preprocess') {
      console.log(`📦 PHASE 1: Preprocessing clips`);
      state.phase = 'preprocess';

      const trimmedClipPaths: string[] = [];

      if (sectionTimings && sectionTimings.length > 0) {
        console.log('   ✂️  Normalizing clips to match music sections');

        // Use fast intermediate encoder flags — these files get re-encoded in Phase 2
        const intermediateFlags = await getIntermediateEncoderFlags();
        console.log(`   🔧 Phase 1A encoder: ${intermediateFlags}`);

        for (let i = 0; i < videoPaths.length; i++) {
          const clipPath = videoPaths[i];
          const timing = sectionTimings[i];

          if (timing) {
            const sectionDuration = timing.endTime - timing.startTime;
            const trimmedPath = join(tempDir, `job_${jobId}_normalized_${i}.mp4`);

            // Skip if already normalized AND valid (not corrupted)
            if (existsSync(trimmedPath)) {
              const isValid = await this.validateVideoFile(trimmedPath);
              if (isValid) {
                trimmedClipPaths.push(trimmedPath);
                console.log(`   ✅ Clip ${i}: Already normalized`);
                continue;
              } else {
                // File exists but is corrupted (e.g., missing moov atom from interrupted encoding)
                console.log(`   ⚠️  Clip ${i}: Normalized file corrupted, regenerating...`);
                try {
                  unlinkSync(trimmedPath);
                } catch (e) {
                  // Ignore deletion errors
                }
              }
            }

            // Get clip metadata to determine actual duration
            const metadata = await this.getVideoMetadata(clipPath);
            const clipDuration = parseFloat(metadata?.format?.duration || '8');

            if (clipDuration < sectionDuration) {
              // EXTEND: Loop the clip to fill the section duration
              // Looping requires re-encode (can't stream-copy a loop)
              const loopCount = Math.ceil(sectionDuration / clipDuration);

              await execAsync(
                `ffmpeg -stream_loop ${loopCount} -i "${clipPath}" -t ${sectionDuration} ${intermediateFlags} -c:a aac -b:a 192k "${trimmedPath}" -y -loglevel error`,
                { timeout: FFMPEG_TIMEOUT },
              );

              trimmedClipPaths.push(trimmedPath);
              console.log(
                `   🔄 Clip ${i}: Looped ${loopCount} times (${clipDuration.toFixed(2)}s → ${sectionDuration.toFixed(2)}s)`,
              );
            } else if (clipDuration > sectionDuration) {
              // TRIM: Clip is longer than section
              const trimAmount = clipDuration - sectionDuration;

              if (trimAmount < 3) {
                // Small trim: use stream copy (near-instant, not frame-accurate but Phase 2 re-encodes anyway)
                await execAsync(
                  `ffmpeg -i "${clipPath}" -ss 0 -t ${sectionDuration} -c copy "${trimmedPath}" -y -loglevel error`,
                  { timeout: FFMPEG_TIMEOUT },
                );
                console.log(
                  `   ✂️  Clip ${i}: Stream-copy trim (${clipDuration.toFixed(2)}s → ${sectionDuration.toFixed(2)}s, -${trimAmount.toFixed(1)}s)`,
                );
              } else {
                // Larger trim: re-encode with fast intermediate settings
                await execAsync(
                  `ffmpeg -i "${clipPath}" -ss 0 -t ${sectionDuration} ${intermediateFlags} "${trimmedPath}" -y -loglevel error`,
                  { timeout: FFMPEG_TIMEOUT },
                );
                console.log(
                  `   ✂️  Clip ${i}: Trimmed from ${clipDuration.toFixed(2)}s to ${sectionDuration.toFixed(2)}s`,
                );
              }

              trimmedClipPaths.push(trimmedPath);
            } else {
              // EXACT MATCH: Use as-is (no processing needed)
              trimmedClipPaths.push(clipPath);
              console.log(`   ✅ Clip ${i}: Exact match (${sectionDuration.toFixed(2)}s) - using original`);
            }
          } else {
            // No timing data for this clip, use as-is
            trimmedClipPaths.push(clipPath);
            console.log(`   📹 Clip ${i}: Using original (no timing data)`);
          }
        }
      } else {
        // No section timings provided, use all clips as-is
        trimmedClipPaths.push(...videoPaths);
        console.log('   📹 No section timings, using clips as-is');
      }

      if (FFMPEG_CONFIG.POST_PROCESSING_ENABLED) {
        // POST-PROCESS: Apply denoise + sharpen + color normalization to each clip
        // Process in batches of 4 for parallelism without overwhelming CPU
        console.log(`   🎨 Post-processing ${trimmedClipPaths.length} clips (denoise + sharpen)...`);
        const enhancedClipPaths: string[] = [];
        const PP_BATCH_SIZE = 4;

        for (let batchStart = 0; batchStart < trimmedClipPaths.length; batchStart += PP_BATCH_SIZE) {
          const batchEnd = Math.min(batchStart + PP_BATCH_SIZE, trimmedClipPaths.length);
          const batchPromises: Promise<string>[] = [];

          for (let i = batchStart; i < batchEnd; i++) {
            const clipPath = trimmedClipPaths[i];
            const enhancedPath = join(tempDir, `job_${jobId}_enhanced_${i}.mp4`);

            batchPromises.push(
              (async () => {
                // Skip if already enhanced AND valid
                if (existsSync(enhancedPath)) {
                  const isValid = await this.validateVideoFile(enhancedPath);
                  if (isValid) return enhancedPath;
                  try {
                    unlinkSync(enhancedPath);
                  } catch {}
                }

                const positionRatio = trimmedClipPaths.length > 1 ? i / (trimmedClipPaths.length - 1) : 0.5;
                const energy = 0.3 + 0.4 * Math.sin(positionRatio * Math.PI);

                await this.postProcessClip(clipPath, enhancedPath, i, energy);
                return existsSync(enhancedPath) ? enhancedPath : clipPath;
              })(),
            );
          }

          const batchResults = await Promise.all(batchPromises);
          enhancedClipPaths.push(...batchResults);
        }

        console.log(`   ✅ Post-processing complete: ${enhancedClipPaths.length} clips enhanced`);
        state.normalizedClipPaths = enhancedClipPaths;
      } else {
        // Post-processing disabled — Kling AI clips are already clean
        console.log(`   ⏭️  Post-processing disabled — skipping denoise/sharpen for ${trimmedClipPaths.length} clips`);
        state.normalizedClipPaths = trimmedClipPaths;
      }
    }

    // ========================================
    // PHASE 2: SEGMENTS - Merge batches
    // ========================================
    if (state.phase === 'preprocess' || state.phase === 'segments') {
      console.log(`📦 PHASE 2: Building segment batches`);
      state.phase = 'segments';

      // Build segment plan if not already built
      if (state.batchCount === 0) {
        const plan = await this.buildSegmentPlan(state.normalizedClipPaths, BATCH_SIZE);
        state.batchCount = plan.totalBatches;
        console.log(`   📋 Plan: ${plan.totalBatches} batches to process`);
      }

      // Process each batch
      for (let batchId = 0; batchId < state.batchCount; batchId++) {
        // Skip already completed batches
        if (state.completedBatches.includes(batchId)) {
          console.log(`   ⏭️  Batch ${batchId}: Already completed, skipping`);
          continue;
        }

        const startIdx = batchId * BATCH_SIZE;
        const endIdx = Math.min(startIdx + BATCH_SIZE, state.normalizedClipPaths.length);
        const batchClips = state.normalizedClipPaths.slice(startIdx, endIdx);
        const batchTimings = sectionTimings ? sectionTimings.slice(startIdx, endIdx) : [];

        console.log(`   🔨 Processing batch ${batchId} (clips ${startIdx}-${endIdx - 1})`);

        // Merge this batch with crossfades
        // Pass total clip count to ensure unique segment filenames when clip count changes
        const result = await this.mergeSegmentBatch(
          batchId,
          batchClips,
          batchTimings,
          jobId,
          crossfadeDuration,
          targetWidth,
          targetHeight,
          state.normalizedClipPaths.length, // Total clips for cache key
        );

        // Save segment metadata
        state.segmentArtifacts.push({
          batchId,
          path: result.segmentPath,
          startClip: startIdx,
          endClip: endIdx - 1,
          duration: result.duration,
        });

        // Mark batch as completed
        state.completedBatches.push(batchId);

        console.log(`   ✅ Batch ${batchId} complete (${state.completedBatches.length}/${state.batchCount})`);

        // Call onBatchComplete callback for progress updates
        if (onBatchComplete) {
          await onBatchComplete(batchId, state.batchCount);
        }

        // CHECKPOINT: Return state after each batch for persistence
        // In production, job-worker will persist this state to database
      }

      console.log(`   ✅ All ${state.batchCount} batches processed`);
    }

    // ========================================
    // PHASE 3: FINALIZE - Merge segments + music
    // ========================================
    if (state.phase === 'segments' || state.phase === 'finalize') {
      console.log(`📦 PHASE 3: Finalizing video`);
      state.phase = 'finalize';

      // Include clip count in filename to prevent cache collisions when clip count changes
      const totalClips = state.normalizedClipPaths.length;
      const videoNoAudioPath = join(tempDir, `job_${jobId}_clips${totalClips}_video_no_audio.mp4`);
      state.videoNoAudioPath = videoNoAudioPath;

      // Merge all segments into final video (no audio)
      await this.mergeAllSegments(
        state.segmentArtifacts,
        videoNoAudioPath,
        crossfadeDuration,
        targetWidth,
        targetHeight,
      );

      console.log(`   ✅ All segments merged`);

      // Overlay music if provided
      if (musicPath && musicDuration) {
        await this.overlayMusic(videoNoAudioPath, musicPath, outputPath, musicDuration);

        state.finalVideoPath = outputPath;
        console.log(`   ✅ Music overlay complete`);
      } else {
        // No music - just copy the video
        const { copyFileSync } = await import('fs');
        if (!existsSync(outputPath)) {
          copyFileSync(videoNoAudioPath, outputPath);
        }
        state.finalVideoPath = outputPath;
        console.log(`   ✅ Final video ready (no music)`);
      }

      // Validate final output
      console.log(`   🔍 Validating final video output...`);

      // DEFENSE-IN-DEPTH: Loud warning if a unity_kling job has no music
      if (!musicPath) {
        console.error(`   🚨🚨🚨 WARNING: Video assembled WITHOUT audio track!`);
        console.error(`   🚨 This video will be SILENT. If this is a unity_kling job, something went wrong upstream.`);
        console.error(`   🚨 Check: lyrics generation, Suno API, and music file resolution.`);
      }

      const validation = await ffmpegOutputValidator.validateOutput(outputPath, {
        requireAudio: !!musicPath,
        requireVideo: true,
        expectedWidth: targetWidth,
        expectedHeight: targetHeight,
        resolutionTolerance: 10,
      });

      if (!validation.valid) {
        console.error(`   ❌ Final video validation FAILED:`);
        validation.errors.forEach((err) => console.error(`      • ${err}`));
        throw new Error(`Final video validation failed: ${validation.errors.join(', ')}`);
      }

      console.log(`   ✅ Final video validated successfully`);
      console.log(`      Duration: ${validation.duration.toFixed(2)}s`);
      console.log(`      Resolution: ${validation.videoStream?.width}x${validation.videoStream?.height}`);
      console.log(`      File size: ${validation.fileSizeMB} MB`);
      if (validation.warnings.length > 0) {
        console.log(`      Warnings: ${validation.warnings.length}`);
        validation.warnings.forEach((warn) => console.log(`        ⚠️  ${warn}`));
      }

      // Mark as complete
      state.phase = null;
      console.log(`✅ FFmpeg pipeline complete!`);
    }

    return state;
  }

  /**
   * Combine video with audio (background music)
   */
  async combineAudioVideo(options: CombineVideosOptions): Promise<string> {
    const { videoPaths, outputPath, audioPath, audioVolume = 0.3 } = options;

    // First concatenate videos
    const tempVideoPath = join(process.cwd(), 'temp', `temp_merged_${Date.now()}.mp4`);

    await this.concatenateVideos(videoPaths, tempVideoPath);

    // If no audio, we're done
    if (!audioPath) {
      const { renameSync } = await import('fs');
      renameSync(tempVideoPath, outputPath);
      return outputPath;
    }

    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      const { renameSync } = await import('fs');
      renameSync(tempVideoPath, outputPath);
      return outputPath;
    }

    try {
      // Combine with audio (loudnorm for consistent volume)
      const command =
        `ffmpeg -i "${tempVideoPath}" -i "${audioPath}" ` +
        `-filter_complex "[1:a]volume=${audioVolume}[bg];[0:a][bg]amix=inputs=2:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]" ` +
        `-map 0:v -map "[aout]" -c:v copy -c:a aac -b:a 192k "${outputPath}" -y`;

      // CRITICAL: Add timeout to prevent hanging (max 3 minutes)
      await execAsync(command, { timeout: 180000 });

      console.log(`Combined video with audio at ${audioVolume * 100}% volume`);
    } finally {
      // Clean up temp video
      if (existsSync(tempVideoPath)) {
        unlinkSync(tempVideoPath);
      }
    }

    return outputPath;
  }

  /**
   * Get video metadata (duration, resolution, etc.)
   */
  async getVideoMetadata(videoPath: string): Promise<any> {
    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      console.warn(`⚠️ FFmpeg not available — returning placeholder metadata for ${videoPath}`);
      return {
        _placeholder: true,
        duration: 16,
        width: 1920,
        height: 1080,
      };
    }

    try {
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
      const { stdout } = await execAsync(command, { timeout: 30000 });
      return JSON.parse(stdout);
    } catch (error) {
      console.error('Error getting video metadata:', error);
      return null;
    }
  }

  /**
   * Verify video has audio track before upload
   * Returns detailed info about audio presence and sync
   */
  async verifyVideoHasAudio(videoPath: string): Promise<{
    hasAudio: boolean;
    audioCodec?: string;
    audioDuration?: number;
    videoDuration?: number;
    syncStatus: 'synced' | 'mismatch' | 'no_audio' | 'error';
    details: string;
  }> {
    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      return {
        hasAudio: false,
        syncStatus: 'error',
        details: 'FFprobe not available - cannot verify audio',
      };
    }

    if (!existsSync(videoPath)) {
      return {
        hasAudio: false,
        syncStatus: 'error',
        details: `Video file not found: ${videoPath}`,
      };
    }

    try {
      const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
      const { stdout } = await execAsync(command);
      const metadata = JSON.parse(stdout);

      const streams = metadata.streams || [];
      const audioStream = streams.find((s: any) => s.codec_type === 'audio');
      const videoStream = streams.find((s: any) => s.codec_type === 'video');

      if (!audioStream) {
        return {
          hasAudio: false,
          videoDuration: videoStream?.duration ? parseFloat(videoStream.duration) : undefined,
          syncStatus: 'no_audio',
          details: 'No audio stream found in video file',
        };
      }

      const audioDuration = audioStream.duration
        ? parseFloat(audioStream.duration)
        : metadata.format?.duration
          ? parseFloat(metadata.format.duration)
          : 0;
      const videoDuration = videoStream?.duration
        ? parseFloat(videoStream.duration)
        : metadata.format?.duration
          ? parseFloat(metadata.format.duration)
          : 0;

      // Check if audio and video durations are within 5% of each other
      const durationDiff = Math.abs(audioDuration - videoDuration);
      const maxDuration = Math.max(audioDuration, videoDuration);
      const syncThreshold = 0.05; // 5% tolerance

      const isSynced = maxDuration > 0 && durationDiff / maxDuration <= syncThreshold;

      return {
        hasAudio: true,
        audioCodec: audioStream.codec_name,
        audioDuration,
        videoDuration,
        syncStatus: isSynced ? 'synced' : 'mismatch',
        details: isSynced
          ? `Audio verified: ${audioStream.codec_name}, ${audioDuration.toFixed(1)}s (synced with video)`
          : `Audio present but duration mismatch: audio=${audioDuration.toFixed(1)}s, video=${videoDuration.toFixed(1)}s`,
      };
    } catch (error: any) {
      return {
        hasAudio: false,
        syncStatus: 'error',
        details: `Error verifying audio: ${error.message}`,
      };
    }
  }

  /**
   * Clean up temporary FFmpeg artifacts
   * Deletes segment files, normalized clips, and video without audio
   * Keeps only the final video with music
   * @param state - FFmpegState containing paths to temporary files
   */
  async cleanupArtifacts(state: FFmpegState): Promise<void> {
    console.log('🧹 Cleaning up FFmpeg temporary artifacts...');

    let deletedCount = 0;
    const { existsSync, unlinkSync } = await import('fs');

    // Delete segment files
    if (state.segmentArtifacts && state.segmentArtifacts.length > 0) {
      for (const segment of state.segmentArtifacts) {
        if (segment.path && existsSync(segment.path)) {
          try {
            unlinkSync(segment.path);
            deletedCount++;
            console.log(`   🗑️  Deleted segment: ${segment.path}`);
          } catch (error) {
            console.error(`   ⚠️  Failed to delete segment ${segment.path}:`, error);
          }
        }
      }
    }

    // Delete normalized clips
    if (state.normalizedClipPaths && state.normalizedClipPaths.length > 0) {
      for (const clipPath of state.normalizedClipPaths) {
        // Only delete normalized clips (those in temp folder with job_*_normalized_* pattern)
        if (clipPath && clipPath.includes('_normalized_') && existsSync(clipPath)) {
          try {
            unlinkSync(clipPath);
            deletedCount++;
            console.log(`   🗑️  Deleted normalized clip: ${clipPath}`);
          } catch (error) {
            console.error(`   ⚠️  Failed to delete normalized clip ${clipPath}:`, error);
          }
        }
      }
    }

    // Delete video without audio (intermediate file)
    if (state.videoNoAudioPath && existsSync(state.videoNoAudioPath)) {
      try {
        unlinkSync(state.videoNoAudioPath);
        deletedCount++;
        console.log(`   🗑️  Deleted video without audio: ${state.videoNoAudioPath}`);
      } catch (error) {
        console.error(`   ⚠️  Failed to delete video without audio ${state.videoNoAudioPath}:`, error);
      }
    }

    if (deletedCount > 0) {
      console.log(`✅ Cleanup complete: ${deletedCount} temporary file(s) deleted`);
    } else {
      console.log('   ℹ️  No temporary files to clean up');
    }
  }

  /**
   * Convert video to 9:16 vertical format for shorts platforms
   * Crops/pads the video to fit vertical aspect ratio
   */
  async convertToVertical(inputPath: string, outputPath: string): Promise<string> {
    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg not available for vertical conversion');
    }

    console.log(`📱 Converting to 9:16 vertical format...`);
    console.log(`   Input: ${inputPath}`);
    console.log(`   Output: ${outputPath}`);

    try {
      // Get input video dimensions
      const metadata = await this.getVideoMetadata(inputPath);
      const streams = metadata?.streams || [];
      const videoStream = streams.find((s: any) => s.codec_type === 'video');

      const inputWidth = videoStream?.width || 1920;
      const inputHeight = videoStream?.height || 1080;

      console.log(`   📐 Input: ${inputWidth}x${inputHeight}`);

      // Target: 1080x1920 (9:16 vertical)
      const targetWidth = 1080;
      const targetHeight = 1920;

      // Calculate crop to center the interesting part of the video
      // For 16:9 -> 9:16: crop center portion and scale up
      // Scale up first to fill height, then crop width
      const scaleHeight = targetHeight;
      const scaleWidth = Math.round((inputWidth / inputHeight) * scaleHeight);

      // Crop from center
      const cropX = Math.round((scaleWidth - targetWidth) / 2);

      // FFmpeg filter: scale to fill height, then crop to 9:16
      const filter = `scale=${scaleWidth}:${scaleHeight},crop=${targetWidth}:${targetHeight}:${cropX}:0`;

      const command = `ffmpeg -i "${inputPath}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 18 -c:a aac -b:a 192k "${outputPath}" -y`;

      console.log(`   🔄 Running vertical conversion...`);
      // TIMEOUT: Max 2 minutes for vertical conversion
      await execAsync(command, { timeout: 120000 });

      // Verify output
      const { existsSync } = await import('fs');
      if (!existsSync(outputPath)) {
        throw new Error('Vertical conversion failed - output file not created');
      }

      const outputMeta = await this.getVideoMetadata(outputPath);
      const outStream = outputMeta?.streams?.find((s: any) => s.codec_type === 'video');
      console.log(`   ✅ Vertical video created: ${outStream?.width}x${outStream?.height}`);

      return outputPath;
    } catch (error) {
      console.error('❌ Vertical conversion failed:', error);
      throw error;
    }
  }
  /**
   * Caption style presets for lyric overlays
   */
  private captionStyles = {
    minimal: {
      fontName: 'Arial',
      fontSize: 48,
      primaryColor: '&H00FFFFFF', // White
      outlineColor: '&H00000000', // Black
      outlineWidth: 2,
      shadow: 0,
      alignment: 2, // Bottom center
      marginV: 60,
    },
    neon: {
      fontName: 'Impact',
      fontSize: 56,
      primaryColor: '&H0000FFFF', // Cyan
      outlineColor: '&H00FF00FF', // Magenta
      outlineWidth: 3,
      shadow: 2,
      alignment: 2,
      marginV: 80,
    },
    fire: {
      fontName: 'Impact',
      fontSize: 52,
      primaryColor: '&H0000BFFF', // Orange/Gold
      outlineColor: '&H000000FF', // Red
      outlineWidth: 3,
      shadow: 2,
      alignment: 2,
      marginV: 70,
    },
    clean: {
      fontName: 'Helvetica',
      fontSize: 44,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H80000000', // Semi-transparent black
      outlineWidth: 4,
      shadow: 0,
      alignment: 2,
      marginV: 50,
    },
    bold: {
      fontName: 'Arial Black',
      fontSize: 58,
      primaryColor: '&H00FFFFFF',
      outlineColor: '&H00000000',
      outlineWidth: 4,
      shadow: 3,
      alignment: 2,
      marginV: 80,
    },
  };

  /**
   * Generate ASS subtitle file from lyrics with timing
   * @param lyrics - Array of lyric lines with timing
   * @param outputPath - Path to save the .ass file
   * @param style - Caption style preset name
   * @param videoWidth - Video width for positioning
   * @param videoHeight - Video height for positioning
   */
  async generateSubtitles(
    lyrics: Array<{ text: string; startTime: number; endTime: number }>,
    outputPath: string,
    style: keyof typeof this.captionStyles = 'bold',
    videoWidth: number = 1080,
    videoHeight: number = 1920,
  ): Promise<string> {
    const styleConfig = this.captionStyles[style] || this.captionStyles.bold;

    console.log(`📝 Generating ${style} captions for ${lyrics.length} lines...`);

    // ASS header
    const assHeader = `[Script Info]
Title: Lyric Captions
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Lyrics,${styleConfig.fontName},${styleConfig.fontSize},${styleConfig.primaryColor},&H000000FF,${styleConfig.outlineColor},&H00000000,-1,0,0,0,100,100,0,0,1,${styleConfig.outlineWidth},${styleConfig.shadow},${styleConfig.alignment},10,10,${styleConfig.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    // Convert lyrics to ASS dialogue events
    const events = lyrics.map((lyric, index) => {
      const startTime = this.formatAssTime(lyric.startTime);
      const endTime = this.formatAssTime(lyric.endTime);

      // Add fade in/out effect for each line
      const fadeEffect = `{\\fad(200,200)}`;

      // Clean the text - remove special characters that might break ASS
      const cleanText = lyric.text.replace(/\\/g, '').replace(/\{/g, '').replace(/\}/g, '').trim();

      return `Dialogue: 0,${startTime},${endTime},Lyrics,,0,0,0,,${fadeEffect}${cleanText}`;
    });

    const assContent = assHeader + events.join('\n');

    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, assContent, 'utf-8');

    console.log(`   ✅ Created subtitle file: ${outputPath}`);
    return outputPath;
  }

  /**
   * Format time for ASS subtitle format (H:MM:SS.CC)
   */
  private formatAssTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const centiseconds = Math.floor((seconds % 1) * 100);

    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
  }

  /**
   * Generate lyric timing from lyrics and audio duration
   * Estimates timing based on line count and duration
   * @param lyrics - Raw lyrics string (newline separated)
   * @param duration - Total audio duration in seconds
   * @param bpm - Beats per minute for timing calculation
   */
  generateLyricTiming(
    lyrics: string,
    duration: number,
    bpm: number = 130,
  ): Array<{ text: string; startTime: number; endTime: number }> {
    // Split lyrics into lines, removing empty lines and section markers
    const lines = lyrics
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => {
        if (!line) return false;
        // Keep section markers but mark them
        if (line.startsWith('[') && line.endsWith(']')) return true;
        // Skip metadata lines
        if (line.startsWith('SCENE:') || line.startsWith('SUNO') || line.startsWith('---')) return false;
        return true;
      });

    if (lines.length === 0) {
      return [];
    }

    // Calculate timing based on BPM
    const beatsPerSecond = bpm / 60;
    const beatsPerLine = 4; // Assume 4 beats per line (one bar)
    const secondsPerLine = beatsPerLine / beatsPerSecond;

    // Add intro padding and leave some outro
    const introPadding = 2; // 2 seconds intro
    const outroPadding = 3; // 3 seconds outro
    const contentDuration = duration - introPadding - outroPadding;

    // Adjust timing if we have more content than time
    const totalContentTime = lines.length * secondsPerLine;
    const timingMultiplier = totalContentTime > contentDuration ? contentDuration / totalContentTime : 1;

    const adjustedSecondsPerLine = secondsPerLine * timingMultiplier;
    const gapBetweenLines = 0.15; // Small gap between lines

    const timedLyrics: Array<{ text: string; startTime: number; endTime: number }> = [];
    let currentTime = introPadding;
    let previousEndTime = 0;

    for (const line of lines) {
      // Section markers get shorter display time
      const isSection = line.startsWith('[') && line.endsWith(']');
      const displayDuration = isSection
        ? Math.min(1.5, adjustedSecondsPerLine)
        : adjustedSecondsPerLine - gapBetweenLines;

      // Clamp start time to ensure it's >= previous end time (prevent overlap)
      const startTime = Math.max(currentTime, previousEndTime);

      // Calculate end time and clamp to track duration
      const maxEndTime = duration - outroPadding;
      const endTime = Math.min(startTime + displayDuration, maxEndTime);

      // Skip if we've exceeded the available duration
      if (startTime >= maxEndTime) break;

      timedLyrics.push({
        text: line,
        startTime,
        endTime,
      });

      previousEndTime = endTime + gapBetweenLines;
      currentTime = startTime + adjustedSecondsPerLine;

      // Don't exceed duration
      if (currentTime > maxEndTime) break;
    }

    console.log(`⏱️  Generated timing for ${timedLyrics.length} lines @ ${bpm} BPM`);
    console.log(`   Duration: ${duration}s, ~${adjustedSecondsPerLine.toFixed(2)}s per line`);

    return timedLyrics;
  }

  /**
   * Karaoke-style subtitle presets with word animation
   */
  private karaokeStyles = {
    bounce: {
      name: 'Bounce',
      fontName: 'Arial Black',
      fontSize: 52,
      inactiveColor: '&H80FFFFFF', // Semi-transparent white
      activeColor: '&H0000FFFF', // Bright yellow
      outlineColor: '&H00000000', // Black
      outlineWidth: 3,
      shadow: 2,
      alignment: 2, // Bottom center
      marginV: 100,
      scaleEffect: 1.3, // Scale up active word
      bounceHeight: 20, // Pixels to bounce up
    },
    glow: {
      name: 'Glow',
      fontName: 'Impact',
      fontSize: 56,
      inactiveColor: '&H60FFFFFF', // Faded white
      activeColor: '&H0000FF00', // Bright green
      outlineColor: '&H00008800', // Dark green glow
      outlineWidth: 4,
      shadow: 3,
      alignment: 2,
      marginV: 90,
      scaleEffect: 1.2,
      bounceHeight: 0,
    },
    fire: {
      name: 'Fire',
      fontName: 'Impact',
      fontSize: 54,
      inactiveColor: '&H60FFFFFF',
      activeColor: '&H000080FF', // Orange
      outlineColor: '&H000000FF', // Red outline
      outlineWidth: 3,
      shadow: 2,
      alignment: 2,
      marginV: 85,
      scaleEffect: 1.25,
      bounceHeight: 15,
    },
    neon: {
      name: 'Neon',
      fontName: 'Arial Black',
      fontSize: 50,
      inactiveColor: '&H50FFFFFF',
      activeColor: '&H00FFFF00', // Cyan
      outlineColor: '&H00FF00FF', // Magenta
      outlineWidth: 3,
      shadow: 4,
      alignment: 2,
      marginV: 95,
      scaleEffect: 1.15,
      bounceHeight: 10,
    },
    minimal: {
      name: 'Minimal',
      fontName: 'Helvetica',
      fontSize: 44,
      inactiveColor: '&H80FFFFFF',
      activeColor: '&H00FFFFFF', // Pure white
      outlineColor: '&H80000000', // Semi-transparent black
      outlineWidth: 2,
      shadow: 0,
      alignment: 2,
      marginV: 60,
      scaleEffect: 1.1,
      bounceHeight: 0,
    },
  };

  /**
   * Align original lyrics with Whisper word timestamps
   * Uses the original lyrics text but with timing from Whisper transcription
   * @param whisperWords - Words with timestamps from Whisper
   * @param originalLyrics - Original lyrics text (may include section markers like [VERSE])
   * @returns Words array with original text and aligned timestamps
   */
  alignLyricsWithTimestamps(
    whisperWords: Array<{ word: string; start: number; end: number }>,
    originalLyrics: string,
  ): Array<{ word: string; start: number; end: number }> {
    // Clean lyrics: remove section markers and normalize
    const cleanLyrics = originalLyrics
      .replace(/\[.*?\]/g, '') // Remove [VERSE 1], [HOOK], etc.
      .replace(/\n+/g, ' ') // Join lines
      .replace(/[—–]/g, '-') // Normalize dashes
      .trim();

    // Split into words, preserving punctuation attached to words
    const lyricWords = cleanLyrics.split(/\s+/).filter((w) => w.length > 0);

    // Normalize for matching (lowercase, remove punctuation for comparison)
    const normalizeForMatch = (w: string) => w.toLowerCase().replace(/[^\w]/g, '');

    const alignedWords: Array<{ word: string; start: number; end: number }> = [];

    let whisperIdx = 0;
    let matchCount = 0;

    for (const lyricWord of lyricWords) {
      const normalizedLyric = normalizeForMatch(lyricWord);
      if (!normalizedLyric) continue; // Skip empty after normalization

      // Find best matching Whisper word (search ahead up to 5 positions)
      let bestMatch = -1;
      let bestScore = 0;

      for (let i = whisperIdx; i < Math.min(whisperIdx + 5, whisperWords.length); i++) {
        const normalizedWhisper = normalizeForMatch(whisperWords[i].word);

        // Exact match gets highest score
        if (normalizedLyric === normalizedWhisper) {
          bestMatch = i;
          bestScore = 3;
          break;
        }

        // Prefix match (lyric starts with whisper or vice versa)
        if (normalizedLyric.startsWith(normalizedWhisper) || normalizedWhisper.startsWith(normalizedLyric)) {
          if (bestScore < 2) {
            bestMatch = i;
            bestScore = 2;
          }
        }

        // Contains match
        if (normalizedLyric.includes(normalizedWhisper) || normalizedWhisper.includes(normalizedLyric)) {
          if (bestScore < 1) {
            bestMatch = i;
            bestScore = 1;
          }
        }
      }

      if (bestMatch >= 0) {
        // Use original lyric word text with Whisper timing
        alignedWords.push({
          word: lyricWord,
          start: whisperWords[bestMatch].start,
          end: whisperWords[bestMatch].end,
        });
        whisperIdx = bestMatch + 1;
        matchCount++;
      } else if (whisperIdx < whisperWords.length) {
        // No match found - interpolate timing from current position
        const prevEnd =
          alignedWords.length > 0 ? alignedWords[alignedWords.length - 1].end : whisperWords[whisperIdx]?.start || 0;
        const nextStart = whisperWords[whisperIdx]?.start || prevEnd + 0.3;

        alignedWords.push({
          word: lyricWord,
          start: prevEnd,
          end: Math.min(prevEnd + 0.3, nextStart),
        });
      }
    }

    console.log(
      `   📝 Lyrics alignment: ${matchCount}/${lyricWords.length} words matched (${Math.round((matchCount / lyricWords.length) * 100)}%)`,
    );

    return alignedWords;
  }

  /**
   * Generate karaoke-style ASS subtitle file with word-by-word animation
   * Shows all lyrics with current word bouncing/scaling/color changing
   * Optionally syncs pulse effects to librosa beat timestamps
   * @param words - Array of words with start/end timestamps (from Whisper)
   * @param outputPath - Path to save the .ass file
   * @param style - Karaoke style preset name
   * @param videoWidth - Video width for positioning
   * @param videoHeight - Video height for positioning
   * @param linesPerScreen - Number of lyric lines to show at once (default 2)
   * @param beats - Optional array of beat timestamps from librosa for pulse effects
   * @param originalLyrics - Optional original lyrics to align with timestamps
   * @param audioDuration - Optional actual audio duration for timestamp scaling
   * @param onsets - Optional audio onsets for snap-to-onset timing
   * @param forcedAlignment - Optional EXACT word timing from Wav2Vec2 forced alignment (PREFERRED)
   */
  async generateKaraokeSubtitles(
    words: Array<{ word: string; start: number; end: number }>,
    outputPath: string,
    style: keyof typeof this.karaokeStyles = 'bounce',
    videoWidth: number = 1080,
    videoHeight: number = 1920,
    linesPerScreen: number = 2,
    beats?: number[],
    originalLyrics?: string,
    audioDuration?: number,
    onsets?: number[],
    forcedAlignment?: Array<{ word: string; start: number; end: number }>, // EXACT timing from Wav2Vec2
  ): Promise<string> {
    let displayWords: Array<{ word: string; start: number; end: number }> = [];

    // Extract clean lyrics words for reference
    let lyricWords: string[] = [];
    if (originalLyrics && originalLyrics.trim().length > 0) {
      lyricWords = originalLyrics
        .replace(/\[.*?\]/g, ' ') // Remove section markers [VERSE], [HOOK], etc. with space
        .replace(/\d{1,2}:\d{2}(?:-\d{1,2}:\d{2})?/g, ' ') // Remove timestamps like "0:00" or "0:00-0:08"
        .replace(/\n+/g, ' ')
        .replace(/—/g, ' ') // em-dash → space (so "ransom—I" becomes "ransom I")
        .replace(/–/g, ' ') // en-dash → space
        .replace(/-/g, ' ') // hyphen → space (for compound words)
        .replace(/\//g, ' ') // slash → space
        .replace(/\.{2,}/g, ' ') // ellipsis → space
        .replace(/…/g, ' ') // unicode ellipsis → space
        .replace(/[',".!?;:()'"]/g, '') // Remove punctuation that doesn't split words
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
    } else {
      lyricWords = words.map((w) => w.word);
    }

    console.log(`   📜 Processing ${lyricWords.length} lyrics words`);

    // ========================================
    // PRIORITY 1: FORCED ALIGNMENT (EXACT timing from Wav2Vec2 + CTC)
    // Use FA timing, but MAP to original lyrics text (FA outputs garbled words)
    // Two-pass algorithm: 1) Match with confidence scoring, 2) Interpolate unmatched words
    // ========================================
    if (forcedAlignment && forcedAlignment.length > 0 && lyricWords.length > 0) {
      console.log(`   🎯 FORCED ALIGNMENT MODE: ${forcedAlignment.length} FA words, ${lyricWords.length} lyric words`);

      // PASS 1: Build a sparse mapping of lyric words to FA words using proportional positioning
      // Key insight: Word N in lyrics should roughly map to word (N/total_lyrics * total_FA) in FA
      interface WordMapping {
        lyricIdx: number;
        lyricWord: string;
        faIdx: number | null;
        start: number | null;
        end: number | null;
        matchType: 'exact' | 'partial' | 'interpolated';
      }

      const mappings: WordMapping[] = [];
      const SEARCH_WINDOW = 7; // Search +/- 7 FA words around expected position
      let directMatchCount = 0;

      for (let lyricIdx = 0; lyricIdx < lyricWords.length; lyricIdx++) {
        const lyricWord = lyricWords[lyricIdx];
        const lyricWordClean = lyricWord.toUpperCase().replace(/[^A-Z0-9]/g, '');

        if (lyricWordClean.length === 0) {
          mappings.push({ lyricIdx, lyricWord, faIdx: null, start: null, end: null, matchType: 'interpolated' });
          continue;
        }

        // Calculate expected FA position based on proportional mapping
        const expectedFaIdx = Math.round((lyricIdx / lyricWords.length) * forcedAlignment.length);
        const searchStart = Math.max(0, expectedFaIdx - SEARCH_WINDOW);
        const searchEnd = Math.min(forcedAlignment.length - 1, expectedFaIdx + SEARCH_WINDOW);

        // Search for best match within window
        let bestFaIdx = -1;
        let bestScore = 0; // 0=none, 1=partial, 2=contains, 3=exact

        for (let faIdx = searchStart; faIdx <= searchEnd; faIdx++) {
          const faWord = forcedAlignment[faIdx];
          const faWordClean = faWord.word.toUpperCase().replace(/[^A-Z0-9]/g, '');

          // Exact match (strongest)
          if (faWordClean === lyricWordClean) {
            bestFaIdx = faIdx;
            bestScore = 3;
            break; // Stop on exact match
          }
          // FA contains lyric word (e.g., FA="RANSOMI", lyric="RANSOM")
          else if (faWordClean.includes(lyricWordClean) && lyricWordClean.length >= 2 && bestScore < 2) {
            bestFaIdx = faIdx;
            bestScore = 2;
          }
          // Lyric contains FA word (e.g., FA="RAN", lyric="RANSOM")
          else if (lyricWordClean.includes(faWordClean) && faWordClean.length >= 3 && bestScore < 1) {
            bestFaIdx = faIdx;
            bestScore = 1;
          }
        }

        if (bestFaIdx >= 0) {
          const faWord = forcedAlignment[bestFaIdx];
          mappings.push({
            lyricIdx,
            lyricWord,
            faIdx: bestFaIdx,
            start: faWord.start,
            end: faWord.end,
            matchType: bestScore === 3 ? 'exact' : 'partial',
          });
          directMatchCount++;
        } else {
          // No match found - will be interpolated
          mappings.push({ lyricIdx, lyricWord, faIdx: null, start: null, end: null, matchType: 'interpolated' });
        }
      }

      console.log(`   📊 Pass 1: ${directMatchCount}/${lyricWords.length} direct matches`);

      // PASS 2: Interpolate timing for unmatched words
      // Find anchor points (matched words) and interpolate between them
      let interpolatedCount = 0;

      for (let i = 0; i < mappings.length; i++) {
        if (mappings[i].start !== null) continue; // Already matched

        // Find previous and next anchor points
        let prevAnchor: WordMapping | null = null;
        let nextAnchor: WordMapping | null = null;

        for (let j = i - 1; j >= 0; j--) {
          if (mappings[j].start !== null) {
            prevAnchor = mappings[j];
            break;
          }
        }

        for (let j = i + 1; j < mappings.length; j++) {
          if (mappings[j].start !== null) {
            nextAnchor = mappings[j];
            break;
          }
        }

        // Interpolate based on available anchors
        if (prevAnchor && nextAnchor) {
          // Between two anchors - proportional interpolation
          const prevIdx = prevAnchor.lyricIdx;
          const nextIdx = nextAnchor.lyricIdx;
          const currentIdx = mappings[i].lyricIdx;
          const ratio = (currentIdx - prevIdx) / (nextIdx - prevIdx);

          const timeSpan = nextAnchor.start! - prevAnchor.end!;
          const estimatedStart = prevAnchor.end! + timeSpan * ratio;
          const estimatedDuration = timeSpan / (nextIdx - prevIdx);

          mappings[i].start = Math.max(prevAnchor.end!, estimatedStart - estimatedDuration * 0.1);
          mappings[i].end = Math.min(nextAnchor.start!, estimatedStart + estimatedDuration * 0.9);
          interpolatedCount++;
        } else if (prevAnchor) {
          // After last anchor - extend from previous
          const avgWordDuration = prevAnchor.end! - prevAnchor.start!;
          const gap = i - prevAnchor.lyricIdx;
          mappings[i].start = prevAnchor.end! + (gap - 1) * avgWordDuration;
          mappings[i].end = mappings[i].start! + avgWordDuration;
          interpolatedCount++;
        } else if (nextAnchor) {
          // Before first anchor - estimate backwards
          const avgWordDuration = nextAnchor.end! - nextAnchor.start!;
          const gap = nextAnchor.lyricIdx - i;
          mappings[i].end = nextAnchor.start! - (gap - 1) * avgWordDuration;
          mappings[i].start = mappings[i].end! - avgWordDuration;
          if (mappings[i].start! < 0) mappings[i].start = 0;
          interpolatedCount++;
        } else {
          // No anchors at all - shouldn't happen if FA worked
          const totalDuration = audioDuration || 120;
          const wordDuration = totalDuration / lyricWords.length;
          mappings[i].start = i * wordDuration;
          mappings[i].end = (i + 1) * wordDuration;
          interpolatedCount++;
        }
      }

      console.log(`   📊 Pass 2: ${interpolatedCount} words interpolated`);

      // Build displayWords from mappings - PRESERVE original lyric order, don't sort by time
      // (sorting by time can mess up order if interpolation creates slight overlaps)
      displayWords = mappings
        .filter((m) => m.start !== null && m.end !== null)
        .sort((a, b) => a.lyricIdx - b.lyricIdx) // Maintain lyrics order
        .map((m) => ({
          word: m.lyricWord,
          start: m.start!,
          end: m.end!,
        }));

      // Fix any timing overlaps - ensure each word starts after the previous ends
      for (let i = 1; i < displayWords.length; i++) {
        if (displayWords[i].start < displayWords[i - 1].end) {
          // Overlap detected - adjust start time
          displayWords[i].start = displayWords[i - 1].end + 0.01;
          // If this made end before start, fix that too
          if (displayWords[i].end <= displayWords[i].start) {
            displayWords[i].end = displayWords[i].start + 0.2;
          }
        }
      }

      console.log(`   ✅ Total: ${displayWords.length}/${lyricWords.length} words with timing`);
      if (displayWords.length > 0) {
        console.log(`   🕐 First word "${displayWords[0].word}" at ${displayWords[0].start.toFixed(2)}s`);
        console.log(
          `   🕐 Last word "${displayWords[displayWords.length - 1].word}" at ${displayWords[displayWords.length - 1].end.toFixed(2)}s`,
        );
      }

      // Only fall back if we got very few words
      if (displayWords.length < lyricWords.length * 0.3) {
        console.log(`   ⚠️ Very poor mapping (${displayWords.length}/${lyricWords.length}), trying fallback...`);
        displayWords = []; // Reset to trigger fallback
      }
    }

    // ========================================
    // PRIORITY 2: SNAP-TO-ONSET (fallback if no forced alignment)
    // Use Whisper timestamps as GUIDE, snap to nearest vocal onset
    // ========================================
    if (displayWords.length === 0 && onsets && onsets.length > 0 && words.length > 0) {
      // Sort onsets for binary search
      const sortedOnsets = [...onsets].sort((a, b) => a - b);

      console.log(
        `   🎯 SNAP-TO-ONSET MODE: Aligning ${words.length} Whisper words to ${sortedOnsets.length} vocal onsets`,
      );

      // Helper: find nearest onset to a given time
      const findNearestOnset = (time: number, maxDistance: number = 0.5): number => {
        let bestOnset = time;
        let bestDist = Infinity;

        for (const onset of sortedOnsets) {
          const dist = Math.abs(onset - time);
          if (dist < bestDist && dist <= maxDistance) {
            bestDist = dist;
            bestOnset = onset;
          }
          // Early exit if we've passed the search window
          if (onset > time + maxDistance) break;
        }
        return bestOnset;
      };

      let snappedCount = 0;
      const usedOnsets = new Set<number>();

      // Snap each Whisper word to its nearest onset
      for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const whisperTime = word.start;

        // Find nearest unused onset within 500ms window
        let nearestOnset = whisperTime;
        let nearestDist = Infinity;

        for (const onset of sortedOnsets) {
          const dist = Math.abs(onset - whisperTime);
          // Prefer onsets slightly AFTER Whisper time (words appear as they're sung)
          const adjustedDist = onset < whisperTime ? dist * 1.2 : dist;

          if (adjustedDist < nearestDist && !usedOnsets.has(onset)) {
            nearestDist = adjustedDist;
            nearestOnset = onset;
          }
          if (onset > whisperTime + 0.8) break; // Search window
        }

        // Only snap if onset is within reasonable distance (800ms)
        const snapped = nearestDist < 0.8;
        if (snapped) {
          usedOnsets.add(nearestOnset);
          snappedCount++;
        }

        const startTime = snapped ? nearestOnset : whisperTime;
        const endTime = Math.min(startTime + 0.4, word.end);

        displayWords.push({
          word: lyricWords[i] || word.word, // Prefer lyrics word if available
          start: startTime,
          end: endTime,
        });
      }

      const snapPercent = Math.round((snappedCount / words.length) * 100);
      console.log(`   ✅ Snapped ${snappedCount}/${words.length} words to vocal onsets (${snapPercent}%)`);
      console.log(
        `   🕐 First word at ${displayWords[0]?.start?.toFixed(2)}s, last at ${displayWords[displayWords.length - 1]?.start?.toFixed(2)}s`,
      );
    }

    // Fallback if onset-first didn't work
    if (displayWords.length === 0 && beats && beats.length > 0 && lyricWords.length > 0) {
      // Fallback to beat-driven distribution
      console.log(`   🥁 BEAT-DRIVEN MODE: Distributing ${lyricWords.length} words across ${beats.length} beats`);

      const beatsPerWord = beats.length / lyricWords.length;
      console.log(`   📊 Ratio: ${beatsPerWord.toFixed(2)} beats per word`);

      for (let i = 0; i < lyricWords.length; i++) {
        const beatIndex = Math.min(Math.floor(i * beatsPerWord), beats.length - 1);
        const nextBeatIndex = Math.min(Math.floor((i + 1) * beatsPerWord), beats.length - 1);

        const startTime = beats[beatIndex];
        const endTime = nextBeatIndex > beatIndex ? beats[nextBeatIndex] : startTime + 0.4;

        displayWords.push({
          word: lyricWords[i],
          start: startTime,
          end: endTime,
        });
      }

      console.log(`   ✅ All ${displayWords.length} words placed on beats (100% beat alignment)`);
    } else if (displayWords.length === 0 && audioDuration && lyricWords.length > 0) {
      // Fallback: distribute evenly across audio duration
      console.log(`   ⚠️ No onsets/beats available, distributing evenly across ${audioDuration}s`);
      const wordDuration = audioDuration / lyricWords.length;

      for (let i = 0; i < lyricWords.length; i++) {
        displayWords.push({
          word: lyricWords[i],
          start: i * wordDuration,
          end: (i + 1) * wordDuration,
        });
      }
    } else if (displayWords.length === 0) {
      // Last resort: use Whisper timestamps with scaling
      console.log(`   ⚠️ Fallback to Whisper timestamps`);
      let scaledWords = words;
      if (audioDuration && words.length > 0) {
        const lastWordEnd = words[words.length - 1].end;
        if (lastWordEnd > 0 && lastWordEnd < audioDuration * 0.7) {
          const scaleFactor = (audioDuration / lastWordEnd) * 0.95;
          scaledWords = words.map((w) => ({
            word: w.word,
            start: w.start * scaleFactor,
            end: w.end * scaleFactor,
          }));
        }
      }
      displayWords = scaledWords;
    }

    const styleConfig = this.karaokeStyles[style] || this.karaokeStyles.bounce;

    console.log(`🎤 Generating karaoke subtitles (${style}) for ${displayWords.length} words...`);
    if (beats && beats.length > 0) {
      console.log(`   🥁 Beat sync enabled: ${beats.length} beats for pulse effects`);
    }

    // GAP FILLING: Ensure continuous subtitle coverage by extending words to fill gaps
    // This prevents "missing subtitle" periods when words are far apart
    const MAX_GAP_SECONDS = 0.5; // Max gap allowed between words before extending
    if (displayWords.length > 1) {
      let gapsFilled = 0;
      for (let i = 0; i < displayWords.length - 1; i++) {
        const currentEnd = displayWords[i].end;
        const nextStart = displayWords[i + 1].start;
        const gap = nextStart - currentEnd;

        if (gap > MAX_GAP_SECONDS) {
          // Extend current word to fill gap (leave small buffer before next word)
          displayWords[i].end = nextStart - 0.05;
          gapsFilled++;
        }
      }
      if (gapsFilled > 0) {
        console.log(`   🔗 Filled ${gapsFilled} subtitle gaps (continuous coverage)`);
      }
    }

    // Beat sync tolerance: 150ms window centered on beat
    const BEAT_TOLERANCE_MS = 0.15; // 150ms tolerance

    // Helper to check if a time is near a beat (within tolerance window)
    let beatHitCount = 0;
    const isOnBeat = (time: number): boolean => {
      if (!beats || beats.length === 0) return false;

      // Binary search or linear scan for nearby beat
      for (const beat of beats) {
        if (Math.abs(time - beat) <= BEAT_TOLERANCE_MS) {
          beatHitCount++;
          return true;
        }
        // Early exit if we've passed the time window
        if (beat > time + BEAT_TOLERANCE_MS) break;
      }
      return false;
    };

    // Group words into lines (roughly 6-8 words per line)
    const lines: Array<{
      words: typeof displayWords;
      startTime: number;
      endTime: number;
      text: string;
    }> = [];

    let currentLine: typeof displayWords = [];
    const wordsPerLine = 7;

    for (const word of displayWords) {
      currentLine.push(word);

      if (currentLine.length >= wordsPerLine || (currentLine.length > 0 && word.word.endsWith('.'))) {
        lines.push({
          words: currentLine,
          startTime: currentLine[0].start,
          endTime: currentLine[currentLine.length - 1].end,
          text: currentLine.map((w) => w.word).join(' '),
        });
        currentLine = [];
      }
    }

    // Push remaining words
    if (currentLine.length > 0) {
      lines.push({
        words: currentLine,
        startTime: currentLine[0].start,
        endTime: currentLine[currentLine.length - 1].end,
        text: currentLine.map((w) => w.word).join(' '),
      });
    }

    console.log(`   📝 Organized into ${lines.length} lines`);

    // DEBUG: Log first and last word timestamps to verify scaling
    if (displayWords.length > 0) {
      const firstWord = displayWords[0];
      const lastWord = displayWords[displayWords.length - 1];
      console.log(`   ⏱️  First word "${firstWord.word}" at ${firstWord.start.toFixed(2)}s`);
      console.log(`   ⏱️  Last word "${lastWord.word}" at ${lastWord.end.toFixed(2)}s`);
    }

    // ASS header with two styles: inactive and active
    const assHeader = `[Script Info]
Title: Karaoke Lyrics
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Inactive,${styleConfig.fontName},${styleConfig.fontSize},${styleConfig.inactiveColor},&H000000FF,${styleConfig.outlineColor},&H00000000,-1,0,0,0,100,100,0,0,1,${styleConfig.outlineWidth},${styleConfig.shadow},${styleConfig.alignment},10,10,${styleConfig.marginV},1
Style: Active,${styleConfig.fontName},${Math.round(styleConfig.fontSize * styleConfig.scaleEffect)},${styleConfig.activeColor},&H000000FF,${styleConfig.outlineColor},&H00000000,-1,0,0,0,100,100,0,0,1,${Math.round(styleConfig.outlineWidth * 1.2)},${styleConfig.shadow + 1},${styleConfig.alignment},10,10,${styleConfig.marginV - styleConfig.bounceHeight},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events: string[] = [];

    // MINIMUM WORD DISPLAY DURATION - keeps words readable while syncing to when they're sung
    // Forced alignment gives exact spoken timing (0.1-0.4s), but humans need longer to read
    const MIN_WORD_DISPLAY_SECONDS = 0.5; // Minimum time each word stays highlighted

    // Process each line
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const lineStart = this.formatAssTime(line.startTime);
      const lineEnd = this.formatAssTime(line.endTime + 0.5); // Small buffer after line ends

      // SINGLE-WORD MODE: Show ONLY the current word, then it disappears
      // Each word stays visible until the NEXT word starts (continuous coverage)
      for (let wordIdx = 0; wordIdx < line.words.length; wordIdx++) {
        const currentWord = line.words[wordIdx];

        // Find the next word (could be in same line or next line)
        let nextWordStart: number | null = null;
        if (wordIdx + 1 < line.words.length) {
          nextWordStart = line.words[wordIdx + 1].start;
        } else if (lineIdx + 1 < lines.length && lines[lineIdx + 1].words.length > 0) {
          nextWordStart = lines[lineIdx + 1].words[0].start;
        }

        // Calculate word end time for CONTINUOUS COVERAGE:
        // 1. Each word stays visible until the next word starts (no gaps)
        // 2. If there's a gap > 0.5s between words, extend to fill it
        // 3. Last word gets extra buffer
        // Priority: CONTINUOUS COVERAGE > minimum duration
        // (can't have both 0.5s minimum AND no overlap when words are <0.5s apart)
        let extendedEnd: number;

        if (nextWordStart !== null) {
          // Calculate gap between this word's natural end and next word's start
          const gapToNextWord = nextWordStart - currentWord.end;

          if (gapToNextWord > 0) {
            // There's a gap - extend to fill it (continuous coverage)
            extendedEnd = nextWordStart - 0.02; // End 20ms before next word
          } else {
            // Words overlap or touch - use minimum display time but don't exceed next word
            extendedEnd = Math.max(
              currentWord.end,
              Math.min(currentWord.start + MIN_WORD_DISPLAY_SECONDS, nextWordStart - 0.02),
            );
          }
        } else {
          // Last word - extend with minimum duration plus buffer
          extendedEnd = Math.max(currentWord.end, currentWord.start + MIN_WORD_DISPLAY_SECONDS) + 0.5;
        }

        const wordStart = this.formatAssTime(currentWord.start);
        const wordEnd = this.formatAssTime(extendedEnd);

        // Show ONLY this single word - no other words visible
        const cleanWord = currentWord.word.replace(/\\/g, '').replace(/\{/g, '').replace(/\}/g, '');

        // Check if word lands on a beat for extra pulse effect
        const onBeat = isOnBeat(currentWord.start);
        const beatBonus = onBeat ? 1.15 : 1.0;
        const scalePercent = Math.round(styleConfig.scaleEffect * beatBonus * 100);
        const borderWidth = onBeat
          ? Math.round(styleConfig.outlineWidth * 2)
          : Math.round(styleConfig.outlineWidth * 1.5);
        const beatGlow = onBeat ? `\\blur2` : '';

        // Single word with active styling
        const styledText = `{\\c${styleConfig.activeColor}\\fscx${scalePercent}\\fscy${scalePercent}\\bord${borderWidth}${beatGlow}}${cleanWord}`;

        events.push(`Dialogue: 0,${wordStart},${wordEnd},Inactive,,0,0,0,,${styledText}`);
      }
    }

    const assContent = assHeader + events.join('\n');

    const { writeFileSync } = await import('fs');
    writeFileSync(outputPath, assContent, 'utf-8');

    console.log(`   ✅ Created karaoke subtitle file: ${outputPath}`);
    console.log(`   📊 ${events.length} animation events for ${displayWords.length} words`);
    if (beats && beats.length > 0) {
      console.log(
        `   🥁 Beat hits: ${beatHitCount}/${displayWords.length} words landed on beats (${Math.round((beatHitCount / displayWords.length) * 100)}%)`,
      );
    }

    return outputPath;
  }

  /**
   * Get available karaoke style names
   */
  getKaraokeStyles(): string[] {
    return Object.keys(this.karaokeStyles);
  }

  /**
   * Burn captions into video using ASS subtitles
   * @param inputVideo - Path to input video
   * @param subtitlePath - Path to .ass subtitle file
   * @param outputPath - Path for output video
   */
  async burnCaptions(inputVideo: string, subtitlePath: string, outputPath: string): Promise<string> {
    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg not available for caption burning');
    }

    console.log(`🔥 Burning captions into video...`);
    console.log(`   Input: ${inputVideo}`);
    console.log(`   Subtitles: ${subtitlePath}`);

    try {
      // Validate ASS file before attempting to burn
      if (!existsSync(subtitlePath)) {
        throw new Error(`Subtitle file not found: ${subtitlePath}`);
      }

      let assContent = readFileSync(subtitlePath, 'utf-8');

      // Strip UTF-8 BOM if present (causes libass parser failures)
      if (assContent.charCodeAt(0) === 0xfeff) {
        assContent = assContent.slice(1);
        writeFileSync(subtitlePath, assContent, 'utf-8');
        console.log(`   ⚠️ Stripped UTF-8 BOM from subtitle file`);
      }

      // Check for null bytes (binary corruption)
      if (assContent.includes('\0')) {
        throw new Error('Subtitle file contains null bytes (corrupted)');
      }

      // Validate required ASS sections
      if (!assContent.includes('[Script Info]') || !assContent.includes('[Events]')) {
        throw new Error('Subtitle file missing required [Script Info] or [Events] sections');
      }

      // Ensure at least one Dialogue event exists
      if (!/^Dialogue:/m.test(assContent)) {
        throw new Error('Subtitle file has no Dialogue events');
      }

      // Use subtitles filter to burn ASS captions
      // Escape special characters for FFmpeg filter expressions
      const escapedSubPath = subtitlePath
        .replace(/\\/g, '\\\\')
        .replace(/:/g, '\\:')
        .replace(/'/g, "\\'")
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/;/g, '\\;');

      const command = `ffmpeg -loglevel error -i "${inputVideo}" -vf "ass='${escapedSubPath}'" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 18 -c:a copy "${outputPath}" -y`;

      await execAsync(command, { maxBuffer: 50 * 1024 * 1024, timeout: 180000 });

      if (!existsSync(outputPath)) {
        throw new Error('Caption burning failed - output file not created');
      }

      // Validate output after subtitle burning
      console.log(`   🔍 Validating captioned video...`);
      const validation = await ffmpegOutputValidator.validateOutput(outputPath, {
        requireAudio: true,
        requireVideo: true,
      });

      if (!validation.valid) {
        console.error(`   ❌ Captioned video validation FAILED:`);
        validation.errors.forEach((err) => console.error(`      • ${err}`));
        throw new Error(`Caption burning validation failed: ${validation.errors.join(', ')}`);
      }

      console.log(`   ✅ Captions burned successfully: ${outputPath}`);
      console.log(`      Duration: ${validation.duration.toFixed(2)}s, Size: ${validation.fileSizeMB} MB`);
      return outputPath;
    } catch (error) {
      console.error('❌ Caption burning failed:', error);
      throw error;
    }
  }

  /**
   * Create a seamless loop by crossfading the end into the beginning
   * @param inputVideo - Path to input video
   * @param outputPath - Path for output video
   * @param crossfadeDuration - Duration of crossfade in seconds (default 0.5)
   */
  async createLoop(inputVideo: string, outputPath: string, crossfadeDuration: number = 0.5): Promise<string> {
    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg not available for loop creation');
    }

    console.log(`🔄 Creating seamless loop with ${crossfadeDuration}s crossfade...`);

    try {
      // Get video metadata
      const metadata = await this.getVideoMetadata(inputVideo);
      const duration = parseFloat(metadata?.format?.duration || '10');
      const streams = metadata?.streams || [];
      const videoStream = streams.find((s: any) => s.codec_type === 'video');
      const width = videoStream?.width || 1080;
      const height = videoStream?.height || 1920;
      const fpsStr = videoStream?.r_frame_rate || '30';
      const fpsParts = fpsStr.split('/');
      const fps = fpsParts.length === 2 ? Number(fpsParts[0]) / Number(fpsParts[1]) : Number(fpsStr) || 30;

      console.log(`   📊 Video: ${duration}s, ${width}x${height}, ${fps}fps`);

      // Strategy:
      // 1. Extract first N seconds as "intro" clip
      // 2. Extract last N seconds as "outro" clip
      // 3. Create crossfade blend between outro and intro
      // 4. Replace the original ending with the crossfade

      const tempDir = TempPaths.processing();
      const timestamp = Date.now();

      // Ensure temp directory exists
      if (!existsSync(tempDir)) {
        const { mkdirSync } = await import('fs');
        mkdirSync(tempDir, { recursive: true });
      }

      const introClip = join(tempDir, `loop_intro_${timestamp}.mp4`);
      const outroClip = join(tempDir, `loop_outro_${timestamp}.mp4`);
      const mainClip = join(tempDir, `loop_main_${timestamp}.mp4`);
      const transitionClip = join(tempDir, `loop_transition_${timestamp}.mp4`);

      // Extract intro (first crossfadeDuration seconds)
      await execAsync(`ffmpeg -i "${inputVideo}" -t ${crossfadeDuration} -c copy "${introClip}" -y`);

      // Extract outro (last crossfadeDuration seconds)
      const outroStart = Math.max(0, duration - crossfadeDuration);
      await execAsync(`ffmpeg -i "${inputVideo}" -ss ${outroStart} -c copy "${outroClip}" -y`);

      // Extract main portion (everything except the last crossfadeDuration seconds)
      await execAsync(`ffmpeg -i "${inputVideo}" -t ${outroStart} -c copy "${mainClip}" -y`);

      // Create crossfade transition from outro to intro
      // This creates a blend where the video seamlessly loops
      const xfadeFilter = `[0:v][1:v]xfade=transition=fade:duration=${crossfadeDuration}:offset=0[v];[0:a][1:a]acrossfade=d=${crossfadeDuration}[a]`;

      await execAsync(
        `ffmpeg -i "${outroClip}" -i "${introClip}" -filter_complex "${xfadeFilter}" -map "[v]" -map "[a]" -c:v libx264 -pix_fmt yuv420p -preset fast -crf 18 -c:a aac -b:a 192k "${transitionClip}" -y`,
      );

      // Now concatenate: main + transition
      // Create concat file
      const concatFile = join(tempDir, `loop_concat_${timestamp}.txt`);
      const { writeFileSync } = await import('fs');
      writeFileSync(concatFile, `file '${mainClip}'\nfile '${transitionClip}'`);

      await execAsync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}" -y`);

      // Cleanup temp files
      const tempFiles = [introClip, outroClip, mainClip, transitionClip, concatFile];
      for (const file of tempFiles) {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      }

      if (!existsSync(outputPath)) {
        throw new Error('Loop creation failed - output file not created');
      }

      console.log(`   ✅ Seamless loop created: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('❌ Loop creation failed:', error);
      throw error;
    }
  }

  /**
   * Full post-processing pipeline: captions + loop
   * @param inputVideo - Path to input video
   * @param lyrics - Raw lyrics string
   * @param outputPath - Path for final output
   * @param options - Post-processing options
   */
  async postProcess(
    inputVideo: string,
    lyrics: string,
    outputPath: string,
    options: {
      addCaptions?: boolean;
      captionStyle?: 'minimal' | 'neon' | 'fire' | 'clean' | 'bold';
      createLoop?: boolean;
      loopCrossfade?: number;
      bpm?: number;
    } = {},
  ): Promise<string> {
    const { addCaptions = true, captionStyle = 'bold', createLoop = true, loopCrossfade = 0.5, bpm = 130 } = options;

    console.log(`🎬 Starting video post-processing...`);
    console.log(`   Captions: ${addCaptions ? String(captionStyle) : 'disabled'}`);
    console.log(`   Loop: ${createLoop ? `${loopCrossfade}s crossfade` : 'disabled'}`);

    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      console.log('   ⚠️ FFmpeg not available, skipping post-processing');
      const { copyFileSync } = await import('fs');
      copyFileSync(inputVideo, outputPath);
      return outputPath;
    }

    let currentVideo = inputVideo;
    const tempDir = TempPaths.processing();
    const timestamp = Date.now();
    const tempFiles: string[] = [];

    try {
      // Get video metadata for timing
      const metadata = await this.getVideoMetadata(inputVideo);
      const duration = parseFloat(metadata?.format?.duration || '60');
      const streams = metadata?.streams || [];
      const videoStream = streams.find((s: any) => s.codec_type === 'video');
      const width = videoStream?.width || 1080;
      const height = videoStream?.height || 1920;

      // Step 1: Add captions if enabled
      if (addCaptions && lyrics) {
        const subtitlePath = join(tempDir, `captions_${timestamp}.ass`);
        const captionedVideo = join(tempDir, `captioned_${timestamp}.mp4`);
        tempFiles.push(subtitlePath, captionedVideo);

        // Generate timed lyrics
        const timedLyrics = this.generateLyricTiming(lyrics, duration, bpm);

        if (timedLyrics.length > 0) {
          // Generate ASS subtitle file
          await this.generateSubtitles(timedLyrics, subtitlePath, captionStyle, width, height);

          // Burn captions into video
          await this.burnCaptions(currentVideo, subtitlePath, captionedVideo);
          currentVideo = captionedVideo;
        } else {
          console.log('   ⚠️ No lyrics to caption, skipping');
        }
      }

      // Step 2: Create loop if enabled
      if (createLoop) {
        const loopedVideo = join(tempDir, `looped_${timestamp}.mp4`);
        tempFiles.push(loopedVideo);

        await this.createLoop(currentVideo, loopedVideo, loopCrossfade);
        currentVideo = loopedVideo;
      }

      // Copy final result to output path
      if (currentVideo !== outputPath) {
        const { copyFileSync } = await import('fs');
        copyFileSync(currentVideo, outputPath);
      }

      // Cleanup temp files
      for (const file of tempFiles) {
        if (existsSync(file)) {
          try {
            unlinkSync(file);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }

      console.log(`✅ Post-processing complete: ${outputPath}`);
      return outputPath;
    } catch (error) {
      // Cleanup on error
      for (const file of tempFiles) {
        if (existsSync(file)) {
          try {
            unlinkSync(file);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      }
      throw error;
    }
  }

  /**
   * Crop video from 16:9 to 4:3 (center crop) for TikTok/Shorts/Reels
   * This takes the center portion of a landscape video to create a better mobile format
   * @param inputPath - Path to input 16:9 video
   * @param outputPath - Path for output 4:3 video
   * @param options - Cropping options
   */
  async cropTo4x3(
    inputPath: string,
    outputPath: string,
    options: {
      targetWidth?: number;
      targetHeight?: number;
      position?: 'center' | 'left' | 'right';
      orientation?: 'landscape' | 'portrait';
    } = {},
  ): Promise<string> {
    const { orientation = 'landscape', position = 'center' } = options;

    // 4:3 landscape = 1440x1080 (width > height, ratio 1.333)
    // 4:3 portrait (3:4) = 1080x1440 (height > width, ratio 0.75)
    const targetWidth = options.targetWidth || (orientation === 'landscape' ? 1440 : 1080);
    const targetHeight = options.targetHeight || (orientation === 'landscape' ? 1080 : 1440);

    console.log(`🎬 Cropping video to 4:3 format...`);
    console.log(`   Input: ${inputPath}`);
    console.log(`   Output: ${targetWidth}x${targetHeight}`);

    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg not available for video cropping');
    }

    try {
      // Get input video dimensions
      const metadata = await this.getVideoMetadata(inputPath);
      const streams = metadata?.streams || [];
      const videoStream = streams.find((s: any) => s.codec_type === 'video');

      if (!videoStream) {
        throw new Error('No video stream found in input file');
      }

      const inputWidth = videoStream.width || 1920;
      const inputHeight = videoStream.height || 1080;
      const inputAspect = inputWidth / inputHeight;
      const targetAspect = targetWidth / targetHeight;

      console.log(`   Input dimensions: ${inputWidth}x${inputHeight} (${inputAspect.toFixed(2)})`);
      console.log(`   Target aspect: ${targetAspect.toFixed(2)}`);

      let cropWidth: number;
      let cropHeight: number;
      let cropX: number;
      let cropY: number;

      if (inputAspect > targetAspect) {
        // Input is wider - crop from sides
        cropHeight = inputHeight;
        cropWidth = Math.round(inputHeight * targetAspect);
        cropY = 0;

        if (position === 'left') {
          cropX = 0;
        } else if (position === 'right') {
          cropX = inputWidth - cropWidth;
        } else {
          cropX = Math.round((inputWidth - cropWidth) / 2);
        }
      } else {
        // Input is taller - crop from top/bottom
        cropWidth = inputWidth;
        cropHeight = Math.round(inputWidth / targetAspect);
        cropX = 0;
        cropY = Math.round((inputHeight - cropHeight) / 2);
      }

      console.log(`   Crop area: ${cropWidth}x${cropHeight} at (${cropX}, ${cropY})`);

      // Build FFmpeg command
      const filterComplex = `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},scale=${targetWidth}:${targetHeight}:flags=lanczos`;

      const cmd = [
        `ffmpeg -y -i "${inputPath}"`,
        `-vf "${filterComplex}"`,
        `-c:v libx264 -pix_fmt yuv420p -preset medium -crf 18`,
        `-c:a copy`,
        `-movflags +faststart`,
        `"${outputPath}"`,
      ].join(' ');

      console.log(`   Executing crop...`);
      await execAsync(cmd, { timeout: FFMPEG_TIMEOUT });

      if (!existsSync(outputPath)) {
        throw new Error('Crop failed - output file not created');
      }

      console.log(`   ✅ Video cropped to 4:3: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('❌ Video cropping failed:', error);
      throw error;
    }
  }

  /**
   * Crop video to 9:16 vertical format for TikTok/Shorts/Reels
   * Takes a 16:9 video and creates a 9:16 vertical version
   * @param inputPath - Path to input video
   * @param outputPath - Path for output 9:16 video
   * @param options - Cropping options
   */
  async cropTo9x16(
    inputPath: string,
    outputPath: string,
    options: {
      targetWidth?: number;
      targetHeight?: number;
      position?: 'center' | 'left' | 'right';
    } = {},
  ): Promise<string> {
    const {
      targetWidth = 1080,
      targetHeight = 1920, // 9:16 aspect ratio
      position = 'center',
    } = options;

    console.log(`🎬 Cropping video to 9:16 vertical format...`);
    console.log(`   Input: ${inputPath}`);
    console.log(`   Output: ${targetWidth}x${targetHeight}`);

    const hasFFmpeg = await this.checkFFmpeg();
    if (!hasFFmpeg) {
      throw new Error('FFmpeg not available for video cropping');
    }

    try {
      // Get input video dimensions
      const metadata = await this.getVideoMetadata(inputPath);
      const streams = metadata?.streams || [];
      const videoStream = streams.find((s: any) => s.codec_type === 'video');

      if (!videoStream) {
        throw new Error('No video stream found in input file');
      }

      const inputWidth = videoStream.width || 1920;
      const inputHeight = videoStream.height || 1080;

      console.log(`   Input dimensions: ${inputWidth}x${inputHeight}`);

      // Calculate crop dimensions to get 9:16 from center
      const targetAspect = targetWidth / targetHeight; // 0.5625 for 9:16

      let cropWidth: number;
      let cropHeight: number;
      let cropX: number;
      let cropY: number;

      // Typically going from 16:9 to 9:16, we need to crop a tall slice from the center
      cropHeight = inputHeight;
      cropWidth = Math.round(inputHeight * targetAspect);

      // Ensure crop width doesn't exceed input width
      if (cropWidth > inputWidth) {
        cropWidth = inputWidth;
        cropHeight = Math.round(inputWidth / targetAspect);
        cropY = Math.round((inputHeight - cropHeight) / 2);
        cropX = 0;
      } else {
        cropY = 0;
        if (position === 'left') {
          cropX = 0;
        } else if (position === 'right') {
          cropX = inputWidth - cropWidth;
        } else {
          cropX = Math.round((inputWidth - cropWidth) / 2);
        }
      }

      console.log(`   Crop area: ${cropWidth}x${cropHeight} at (${cropX}, ${cropY})`);

      // Build FFmpeg command with high quality settings
      const filterComplex = `crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},scale=${targetWidth}:${targetHeight}:flags=lanczos`;

      const cmd = [
        `ffmpeg -y -i "${inputPath}"`,
        `-vf "${filterComplex}"`,
        `-c:v libx264 -pix_fmt yuv420p -preset medium -crf 18`,
        `-c:a copy`,
        `-movflags +faststart`,
        `"${outputPath}"`,
      ].join(' ');

      console.log(`   Executing vertical crop...`);
      await execAsync(cmd, { timeout: FFMPEG_TIMEOUT });

      if (!existsSync(outputPath)) {
        throw new Error('Vertical crop failed - output file not created');
      }

      console.log(`   ✅ Video cropped to 9:16: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('❌ Vertical cropping failed:', error);
      throw error;
    }
  }

  /**
   * Create multiple format exports from a single source video
   * Generates 16:9 (original), 4:3 (tablet), and 9:16 (TikTok) versions
   * @param inputPath - Path to source video (usually 16:9)
   * @param outputDir - Directory for output files
   * @param baseName - Base name for output files
   */
  async exportMultiFormat(
    inputPath: string,
    outputDir: string,
    baseName: string,
  ): Promise<{
    landscape: string;
    tablet: string;
    vertical: string;
  }> {
    console.log(`🎬 Creating multi-format exports...`);

    const landscapePath = join(outputDir, `${baseName}_16x9.mp4`);
    const tabletPath = join(outputDir, `${baseName}_4x3.mp4`);
    const verticalPath = join(outputDir, `${baseName}_9x16.mp4`);

    // Copy original as landscape version
    const { copyFileSync } = await import('fs');
    copyFileSync(inputPath, landscapePath);
    console.log(`   ✅ Landscape (16:9): ${landscapePath}`);

    // Create tablet version (4:3)
    await this.cropTo4x3(inputPath, tabletPath);

    // Create vertical version (9:16)
    await this.cropTo9x16(inputPath, verticalPath);

    console.log(`✅ Multi-format export complete!`);
    console.log(`   - Landscape: ${landscapePath}`);
    console.log(`   - Tablet: ${tabletPath}`);
    console.log(`   - Vertical: ${verticalPath}`);

    return {
      landscape: landscapePath,
      tablet: tabletPath,
      vertical: verticalPath,
    };
  }
  /**
   * Extract a thumbnail frame from a video at the most visually interesting point
   * Uses scene detection to find a frame with high visual activity
   * @param videoPath - Path to video file
   * @param outputPath - Path for output thumbnail (jpg/png)
   * @param timestamp - Optional specific timestamp (default: auto-detect best frame)
   */
  async extractThumbnail(videoPath: string, outputPath: string, timestamp?: number): Promise<string> {
    console.log(`🖼️  Extracting thumbnail from video...`);

    if (!existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    try {
      // Get video duration
      const probeResult = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      );
      const duration = parseFloat(probeResult.stdout.trim()) || 30;

      // If no timestamp specified, extract at 25% mark (usually after intro, good action)
      const extractTime = timestamp ?? Math.min(duration * 0.25, 10);

      console.log(`   📍 Extracting frame at ${extractTime.toFixed(2)}s`);

      // Extract high-quality frame
      const cmd = [
        `ffmpeg -y -ss ${extractTime}`,
        `-i "${videoPath}"`,
        `-vframes 1`,
        `-q:v 2`, // High quality
        `-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2"`,
        `"${outputPath}"`,
      ].join(' ');

      await execAsync(cmd);

      if (!existsSync(outputPath)) {
        throw new Error('Thumbnail extraction failed');
      }

      console.log(`   ✅ Thumbnail extracted: ${outputPath}`);
      return outputPath;
    } catch (error: any) {
      console.error('❌ Thumbnail extraction failed:', error.message);
      throw error;
    }
  }

  /**
   * Extract multiple candidate thumbnails from different points in the video
   * Returns paths to 3 thumbnails at different timestamps
   */
  async extractThumbnailCandidates(videoPath: string, outputDir: string, baseName: string): Promise<string[]> {
    console.log(`🖼️  Extracting thumbnail candidates...`);

    if (!existsSync(outputDir)) {
      const { mkdirSync } = await import('fs');
      mkdirSync(outputDir, { recursive: true });
    }

    try {
      // Get video duration
      const probeResult = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      );
      const duration = parseFloat(probeResult.stdout.trim()) || 60;

      // Extract at 20%, 40%, 60% of video (skip intro and outro)
      const timestamps = [0.2, 0.4, 0.6].map((pct) => duration * pct);
      const thumbnails: string[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        const outputPath = join(outputDir, `${baseName}_thumb_${i + 1}.jpg`);
        try {
          await this.extractThumbnail(videoPath, outputPath, timestamps[i]);
          thumbnails.push(outputPath);
        } catch (e) {
          console.log(`   ⚠️ Failed to extract thumbnail at ${timestamps[i].toFixed(1)}s`);
        }
      }

      console.log(`   ✅ Extracted ${thumbnails.length} thumbnail candidates`);
      return thumbnails;
    } catch (error: any) {
      console.error('❌ Thumbnail candidate extraction failed:', error.message);
      return [];
    }
  }

  /**
   * Extract an enhanced thumbnail from the video using scene change detection
   * Finds the most visually interesting frame by detecting scene changes
   * and selecting a frame with high contrast/visual activity
   */
  async extractBestThumbnail(videoPath: string, outputPath: string): Promise<string> {
    console.log(`🎯 Extracting best thumbnail using scene analysis...`);

    if (!existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    try {
      // Get video duration
      const probeResult = await execAsync(
        `ffprobe -v error -select_streams v:0 -show_entries format=duration -of csv=p=0 "${videoPath}"`,
      );
      const duration = parseFloat(probeResult.stdout.trim()) || 30;

      // Use scene detection to find visually interesting frames
      // Extract multiple frames and select the best one based on visual metrics
      const tempDir = dirname(outputPath);
      const baseName = basename(outputPath, extname(outputPath));
      const candidatePaths: string[] = [];

      // Strategy: Extract 5 frames at key moments where content is likely interesting
      // For historical content: opening pose, mid-verse, climax, reaction shot
      const keyMoments = [
        Math.min(3, duration * 0.1), // Early dramatic shot
        duration * 0.25, // First quarter action
        duration * 0.4, // Building tension
        duration * 0.55, // Climax area
        duration * 0.75, // Late action
      ];

      for (let i = 0; i < keyMoments.length; i++) {
        const candidatePath = join(tempDir, `${baseName}_candidate_${i}.jpg`);
        try {
          await execAsync(
            `ffmpeg -y -ss ${keyMoments[i]} -i "${videoPath}" -vframes 1 -q:v 1 "${candidatePath}" 2>/dev/null`,
          );
          if (existsSync(candidatePath)) {
            candidatePaths.push(candidatePath);
          }
        } catch (e) {
          // Continue with other candidates
        }
      }

      if (candidatePaths.length === 0) {
        // Fallback to simple extraction
        return this.extractThumbnail(videoPath, outputPath);
      }

      // Select the best candidate based on file size (larger = more detail/contrast)
      // This is a simple heuristic: frames with more visual detail compress less
      let bestPath = candidatePaths[0];
      let largestSize = 0;

      for (const path of candidatePaths) {
        const stats = statSync(path);
        if (stats.size > largestSize) {
          largestSize = stats.size;
          bestPath = path;
        }
      }

      // Move the best candidate to the final output path
      copyFileSync(bestPath, outputPath);

      // Clean up candidates
      for (const path of candidatePaths) {
        try {
          unlinkSync(path);
        } catch (e) {
          // Ignore cleanup errors
        }
      }

      // Scale and enhance the thumbnail for YouTube
      const enhancedPath = outputPath.replace(/\.(jpg|png)$/, '_enhanced.$1');
      try {
        await execAsync(
          `ffmpeg -y -i "${outputPath}" -vf "eq=contrast=1.1:brightness=0.03:saturation=1.2,unsharp=5:5:0.5:5:5:0.5,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" -q:v 1 "${enhancedPath}" 2>/dev/null`,
        );
        if (existsSync(enhancedPath)) {
          copyFileSync(enhancedPath, outputPath);
          unlinkSync(enhancedPath);
        }
      } catch (e) {
        // Keep original if enhancement fails
      }

      console.log(`   ✅ Best thumbnail extracted: ${outputPath}`);
      return outputPath;
    } catch (error: any) {
      console.error('❌ Best thumbnail extraction failed:', error.message);
      // Fallback to simple extraction
      return this.extractThumbnail(videoPath, outputPath);
    }
  }
}

export const ffmpegProcessor = new FFmpegProcessor();
