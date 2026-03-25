/**
 * FFmpeg Output Validator Service
 *
 * Validates video processing results using ffprobe to ensure:
 * - File exists and is readable
 * - Duration matches expected (within tolerance)
 * - Has valid audio stream (codec, sample rate, channels)
 * - Has valid video stream (codec, resolution, framerate)
 * - File size is reasonable (not 0 bytes, not corrupted)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, statSync } from 'fs';

const execAsync = promisify(exec);

export interface VideoStreamInfo {
  codec: string;
  width: number;
  height: number;
  frameRate: number;
  pixelFormat?: string;
  bitRate?: number;
}

export interface AudioStreamInfo {
  codec: string;
  sampleRate: number;
  channels: number;
  bitRate?: number;
  channelLayout?: string;
}

export interface ValidationResult {
  valid: boolean;
  fileExists: boolean;
  fileSize: number;
  fileSizeMB: number;
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
  videoStream?: VideoStreamInfo;
  audioStream?: AudioStreamInfo;
  errors: string[];
  warnings: string[];
}

export interface ValidationOptions {
  expectedDuration?: number;
  durationTolerance?: number; // seconds
  requireAudio?: boolean;
  requireVideo?: boolean;
  minFileSize?: number; // bytes
  maxFileSize?: number; // bytes
  expectedWidth?: number;
  expectedHeight?: number;
  resolutionTolerance?: number; // pixels
}

class FFmpegOutputValidator {
  /**
   * Parse ffprobe JSON output into structured data
   */
  private parseFFprobeOutput(stdout: string): any {
    try {
      const parsed = JSON.parse(stdout);
      return parsed;
    } catch (error: any) {
      throw new Error(`Failed to parse ffprobe output: ${error.message}`);
    }
  }

  /**
   * Extract video stream information from ffprobe data
   */
  private extractVideoStream(streams: any[]): VideoStreamInfo | undefined {
    const videoStream = streams.find((s) => s.codec_type === 'video');
    if (!videoStream) return undefined;

    // Parse frame rate (can be "30/1" or "29.97")
    let frameRate = 30;
    if (videoStream.r_frame_rate) {
      const parts = videoStream.r_frame_rate.split('/');
      if (parts.length === 2) {
        frameRate = parseInt(parts[0]) / parseInt(parts[1]);
      } else {
        frameRate = parseFloat(videoStream.r_frame_rate);
      }
    } else if (videoStream.avg_frame_rate) {
      const parts = videoStream.avg_frame_rate.split('/');
      if (parts.length === 2) {
        frameRate = parseInt(parts[0]) / parseInt(parts[1]);
      } else {
        frameRate = parseFloat(videoStream.avg_frame_rate);
      }
    }

    return {
      codec: videoStream.codec_name || 'unknown',
      width: parseInt(videoStream.width) || 0,
      height: parseInt(videoStream.height) || 0,
      frameRate: Math.round(frameRate * 100) / 100,
      pixelFormat: videoStream.pix_fmt,
      bitRate: videoStream.bit_rate ? parseInt(videoStream.bit_rate) : undefined,
    };
  }

  /**
   * Extract audio stream information from ffprobe data
   */
  private extractAudioStream(streams: any[]): AudioStreamInfo | undefined {
    const audioStream = streams.find((s) => s.codec_type === 'audio');
    if (!audioStream) return undefined;

    return {
      codec: audioStream.codec_name || 'unknown',
      sampleRate: parseInt(audioStream.sample_rate) || 0,
      channels: parseInt(audioStream.channels) || 0,
      bitRate: audioStream.bit_rate ? parseInt(audioStream.bit_rate) : undefined,
      channelLayout: audioStream.channel_layout,
    };
  }

  /**
   * Validate video output file using ffprobe
   *
   * @param filePath - Path to video file to validate
   * @param options - Validation options (expected duration, resolution, etc.)
   * @returns Validation result with detailed diagnostics
   */
  async validateOutput(filePath: string, options: ValidationOptions = {}): Promise<ValidationResult> {
    const {
      expectedDuration,
      durationTolerance = 0.5,
      requireAudio = true,
      requireVideo = true,
      minFileSize = 1024, // 1 KB minimum
      maxFileSize,
      expectedWidth,
      expectedHeight,
      resolutionTolerance = 10,
    } = options;

    const result: ValidationResult = {
      valid: true,
      fileExists: false,
      fileSize: 0,
      fileSizeMB: 0,
      duration: 0,
      hasVideo: false,
      hasAudio: false,
      errors: [],
      warnings: [],
    };

    // Check if file exists
    if (!existsSync(filePath)) {
      result.valid = false;
      result.errors.push(`File does not exist: ${filePath}`);
      return result;
    }
    result.fileExists = true;

    // Check file size
    try {
      const stats = statSync(filePath);
      result.fileSize = stats.size;
      result.fileSizeMB = Math.round((stats.size / 1024 / 1024) * 100) / 100;

      if (stats.size === 0) {
        result.valid = false;
        result.errors.push('File is empty (0 bytes)');
        return result;
      }

      if (stats.size < minFileSize) {
        result.valid = false;
        result.errors.push(`File too small: ${stats.size} bytes (minimum: ${minFileSize} bytes)`);
      }

      if (maxFileSize && stats.size > maxFileSize) {
        result.valid = false;
        result.errors.push(`File too large: ${stats.size} bytes (maximum: ${maxFileSize} bytes)`);
      }
    } catch (error: any) {
      result.valid = false;
      result.errors.push(`Failed to stat file: ${error.message}`);
      return result;
    }

    // Run ffprobe to analyze file
    try {
      const { stdout, stderr } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
        {
          timeout: 30000, // 30 second timeout
          maxBuffer: 5 * 1024 * 1024, // 5MB buffer
        },
      );

      // Check for ffprobe errors in stderr
      if (stderr && stderr.includes('moov atom not found')) {
        result.valid = false;
        result.errors.push('Video file corrupted: moov atom not found (incomplete encoding)');
        return result;
      }

      if (stderr && stderr.includes('Invalid data found')) {
        result.valid = false;
        result.errors.push('Video file corrupted: invalid data found');
        return result;
      }

      // Parse ffprobe output
      const probeData = this.parseFFprobeOutput(stdout);

      // Extract format information
      if (probeData.format) {
        const duration = parseFloat(probeData.format.duration);
        if (!isNaN(duration)) {
          result.duration = Math.round(duration * 100) / 100;

          // Validate duration if expected
          if (expectedDuration !== undefined) {
            const durationDiff = Math.abs(duration - expectedDuration);
            if (durationDiff > durationTolerance) {
              result.valid = false;
              result.errors.push(
                `Duration mismatch: expected ${expectedDuration.toFixed(2)}s, got ${duration.toFixed(2)}s (diff: ${durationDiff.toFixed(2)}s, tolerance: ${durationTolerance}s)`,
              );
            }
          }

          // Warn if duration is suspiciously short
          if (duration < 1.0) {
            result.warnings.push(`Duration is very short: ${duration.toFixed(2)}s`);
          }
        } else {
          result.valid = false;
          result.errors.push('Could not determine video duration');
        }
      } else {
        result.valid = false;
        result.errors.push('No format information found in ffprobe output');
      }

      // Extract stream information
      if (probeData.streams && Array.isArray(probeData.streams)) {
        const videoStream = this.extractVideoStream(probeData.streams);
        const audioStream = this.extractAudioStream(probeData.streams);

        // Validate video stream
        if (videoStream) {
          result.hasVideo = true;
          result.videoStream = videoStream;

          // Validate video codec
          if (!videoStream.codec || videoStream.codec === 'unknown') {
            result.valid = false;
            result.errors.push('Video stream has unknown codec');
          }

          // Validate resolution
          if (videoStream.width === 0 || videoStream.height === 0) {
            result.valid = false;
            result.errors.push('Video stream has invalid resolution (0x0)');
          }

          // Check expected resolution if provided
          if (expectedWidth !== undefined && expectedHeight !== undefined) {
            const widthDiff = Math.abs(videoStream.width - expectedWidth);
            const heightDiff = Math.abs(videoStream.height - expectedHeight);

            if (widthDiff > resolutionTolerance || heightDiff > resolutionTolerance) {
              result.warnings.push(
                `Resolution differs from expected: expected ${expectedWidth}x${expectedHeight}, got ${videoStream.width}x${videoStream.height}`,
              );
            }
          }

          // Validate frame rate
          if (videoStream.frameRate === 0) {
            result.warnings.push('Video frame rate could not be determined');
          } else if (videoStream.frameRate < 15) {
            result.warnings.push(`Video frame rate is unusually low: ${videoStream.frameRate} fps`);
          }

          // Check pixel format (yuv420p is standard for YouTube compatibility)
          if (videoStream.pixelFormat && videoStream.pixelFormat !== 'yuv420p') {
            result.warnings.push(`Video pixel format is ${videoStream.pixelFormat} (yuv420p recommended for YouTube)`);
          }
        } else if (requireVideo) {
          result.valid = false;
          result.errors.push('No video stream found (video stream required)');
        }

        // Validate audio stream
        if (audioStream) {
          result.hasAudio = true;
          result.audioStream = audioStream;

          // Validate audio codec
          if (!audioStream.codec || audioStream.codec === 'unknown') {
            result.valid = false;
            result.errors.push('Audio stream has unknown codec');
          }

          // Validate sample rate
          if (audioStream.sampleRate === 0) {
            result.valid = false;
            result.errors.push('Audio stream has invalid sample rate (0 Hz)');
          } else if (audioStream.sampleRate < 8000) {
            result.warnings.push(`Audio sample rate is unusually low: ${audioStream.sampleRate} Hz`);
          }

          // Validate channels
          if (audioStream.channels === 0) {
            result.valid = false;
            result.errors.push('Audio stream has invalid channel count (0)');
          }
        } else if (requireAudio) {
          result.valid = false;
          result.errors.push('No audio stream found (audio stream required)');
        }
      } else {
        result.valid = false;
        result.errors.push('No stream information found in ffprobe output');
      }
    } catch (error: any) {
      result.valid = false;
      if (error.killed) {
        result.errors.push('ffprobe timeout - file may be corrupted or too large');
      } else if (error.stderr) {
        result.errors.push(`ffprobe error: ${error.stderr}`);
      } else {
        result.errors.push(`ffprobe failed: ${error.message}`);
      }
    }

    return result;
  }

  /**
   * Format validation result as human-readable string
   */
  formatValidationResult(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push('=== FFmpeg Output Validation ===');
    lines.push(`Status: ${result.valid ? '✅ VALID' : '❌ INVALID'}`);
    lines.push(`File Exists: ${result.fileExists ? 'Yes' : 'No'}`);
    lines.push(`File Size: ${result.fileSizeMB} MB (${result.fileSize} bytes)`);
    lines.push(`Duration: ${result.duration.toFixed(2)}s`);
    lines.push('');

    if (result.videoStream) {
      lines.push('Video Stream:');
      lines.push(`  Codec: ${result.videoStream.codec}`);
      lines.push(`  Resolution: ${result.videoStream.width}x${result.videoStream.height}`);
      lines.push(`  Frame Rate: ${result.videoStream.frameRate} fps`);
      lines.push(`  Pixel Format: ${result.videoStream.pixelFormat || 'unknown'}`);
      if (result.videoStream.bitRate) {
        lines.push(`  Bit Rate: ${Math.round(result.videoStream.bitRate / 1000)} kbps`);
      }
      lines.push('');
    } else {
      lines.push('Video Stream: Not found');
      lines.push('');
    }

    if (result.audioStream) {
      lines.push('Audio Stream:');
      lines.push(`  Codec: ${result.audioStream.codec}`);
      lines.push(`  Sample Rate: ${result.audioStream.sampleRate} Hz`);
      lines.push(`  Channels: ${result.audioStream.channels}`);
      lines.push(`  Channel Layout: ${result.audioStream.channelLayout || 'unknown'}`);
      if (result.audioStream.bitRate) {
        lines.push(`  Bit Rate: ${Math.round(result.audioStream.bitRate / 1000)} kbps`);
      }
      lines.push('');
    } else {
      lines.push('Audio Stream: Not found');
      lines.push('');
    }

    if (result.errors.length > 0) {
      lines.push('Errors:');
      result.errors.forEach((err) => lines.push(`  ❌ ${err}`));
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      result.warnings.forEach((warn) => lines.push(`  ⚠️  ${warn}`));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Quick validation - just check if file exists and has valid duration
   * Faster than full validation, useful for checking if file needs regeneration
   */
  async quickValidate(filePath: string): Promise<boolean> {
    try {
      if (!existsSync(filePath)) return false;

      const stats = statSync(filePath);
      if (stats.size === 0) return false;

      const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`, {
        timeout: 10000,
      });

      const duration = parseFloat(stdout.trim());
      return !isNaN(duration) && duration > 0;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const ffmpegOutputValidator = new FFmpegOutputValidator();
