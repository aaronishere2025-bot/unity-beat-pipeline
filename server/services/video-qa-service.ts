/**
 * VIDEO QA SERVICE
 *
 * Post-generation quality assurance that runs after every video assembly.
 * Prevents silent/broken videos from being marked as completed.
 *
 * Checks: audio present, duration, resolution, black frames, file size
 */

import { existsSync, statSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';

const execAsync = promisify(exec);

// Lazy singletons for Gemini
let geminiClient: GoogleGenerativeAI | null = null;
let fileManager: GoogleAIFileManager | null = null;

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!apiKey) throw new Error('No GEMINI_API_KEY found');
  return apiKey;
}

function getGemini(): GoogleGenerativeAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(getGeminiApiKey());
  }
  return geminiClient;
}

function getFileManager(): GoogleAIFileManager {
  if (!fileManager) {
    fileManager = new GoogleAIFileManager(getGeminiApiKey());
  }
  return fileManager;
}

export interface QACheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  type?: 'missing_audio' | 'duration_mismatch' | 'resolution_mismatch' | 'black_frames' | 'tiny_file';
}

export interface QAResult {
  passed: boolean;
  checks: QACheck[];
  criticalFailures: QACheck[];
  warnings: QACheck[];
  duration?: number;
  hasAudio: boolean;
  resolution?: { width: number; height: number };
  fileSizeMB?: number;
}

export interface SceneDescription {
  index: number;
  description: string;
  durationEstimate?: string;
}

export interface NarrativeIssue {
  severity: 'minor' | 'major' | 'critical';
  type: 'discontinuity' | 'off_topic' | 'ai_artifact' | 'era_mismatch' | 'incoherent';
  description: string;
  timestamp?: string;
}

export interface VisualNarrativeQAResult {
  score: number;
  passed: boolean;
  scenes: SceneDescription[];
  issues: NarrativeIssue[];
  summary: string;
}

class VideoQAService {
  private static instance: VideoQAService;

  static getInstance(): VideoQAService {
    if (!VideoQAService.instance) {
      VideoQAService.instance = new VideoQAService();
    }
    return VideoQAService.instance;
  }

  /**
   * Run full QA suite on an assembled video
   * @param videoPath Absolute path to the video file
   * @param jobId Job ID for logging and temp files
   * @param expectAudio Whether this job should have audio (e.g., unity_kling = true)
   * @param expectedDuration Optional expected duration in seconds
   * @param expectedResolution Optional expected resolution {width, height}
   */
  async runQA(
    videoPath: string,
    jobId: string,
    expectAudio: boolean,
    expectedDuration?: number,
    expectedResolution?: { width: number; height: number },
  ): Promise<QAResult> {
    console.log(`\n🔍 VIDEO QA: Running post-generation checks for job ${jobId}`);
    console.log(`   📁 File: ${videoPath}`);
    console.log(`   🔊 Expect audio: ${expectAudio}`);

    const checks: QACheck[] = [];
    let duration: number | undefined;
    let hasAudio = false;
    let resolution: { width: number; height: number } | undefined;
    let fileSizeMB: number | undefined;

    // Check 1: File exists and has reasonable size
    const sizeCheck = this.checkFileSize(videoPath, expectedDuration);
    checks.push(sizeCheck);
    fileSizeMB = sizeCheck.type === 'tiny_file' ? undefined : this.getFileSizeMB(videoPath);

    if (sizeCheck.status === 'fail') {
      // Can't run further checks on missing/empty file
      return this.buildResult(checks, hasAudio, duration, resolution, fileSizeMB);
    }

    // Check 2: Probe video for streams (audio + video)
    try {
      const probeResult = await this.probeVideo(videoPath);

      // Audio check
      if (probeResult.hasAudio) {
        hasAudio = true;
        checks.push({
          name: 'Audio stream',
          status: 'pass',
          message: `Audio present (${probeResult.audioCodec}, ${probeResult.audioDuration?.toFixed(1)}s)`,
        });
      } else if (expectAudio) {
        checks.push({
          name: 'Audio stream',
          status: 'fail',
          message: 'CRITICAL: No audio stream found but audio was expected for this job type',
          type: 'missing_audio',
        });
      } else {
        checks.push({
          name: 'Audio stream',
          status: 'pass',
          message: 'No audio (not expected for this job type)',
        });
      }

      // Duration check
      duration = probeResult.videoDuration;
      if (duration && expectedDuration) {
        const durationDiff = Math.abs(duration - expectedDuration) / expectedDuration;
        if (durationDiff > 0.2) {
          checks.push({
            name: 'Duration',
            status: 'warn',
            message: `Duration ${duration.toFixed(1)}s differs from expected ${expectedDuration}s by ${(durationDiff * 100).toFixed(0)}%`,
            type: 'duration_mismatch',
          });
        } else {
          checks.push({
            name: 'Duration',
            status: 'pass',
            message: `Duration ${duration.toFixed(1)}s (expected ~${expectedDuration}s)`,
          });
        }
      } else if (duration) {
        checks.push({
          name: 'Duration',
          status: 'pass',
          message: `Duration: ${duration.toFixed(1)}s`,
        });
      }

      // Resolution check
      if (probeResult.width && probeResult.height) {
        resolution = { width: probeResult.width, height: probeResult.height };
        if (expectedResolution) {
          const wDiff = Math.abs(probeResult.width - expectedResolution.width);
          const hDiff = Math.abs(probeResult.height - expectedResolution.height);
          if (wDiff > 10 || hDiff > 10) {
            checks.push({
              name: 'Resolution',
              status: 'warn',
              message: `Resolution ${probeResult.width}x${probeResult.height} differs from expected ${expectedResolution.width}x${expectedResolution.height}`,
              type: 'resolution_mismatch',
            });
          } else {
            checks.push({
              name: 'Resolution',
              status: 'pass',
              message: `Resolution: ${probeResult.width}x${probeResult.height}`,
            });
          }
        } else {
          checks.push({
            name: 'Resolution',
            status: 'pass',
            message: `Resolution: ${probeResult.width}x${probeResult.height}`,
          });
        }
      }
    } catch (probeErr: any) {
      checks.push({
        name: 'Video probe',
        status: 'fail',
        message: `Failed to probe video: ${probeErr.message}`,
      });
    }

    // Check 3: Black frame detection (only for videos > 10s)
    if (duration && duration > 10) {
      try {
        const blackFrameCheck = await this.checkBlackFrames(videoPath, jobId, duration);
        checks.push(blackFrameCheck);
      } catch (bfErr: any) {
        checks.push({
          name: 'Black frames',
          status: 'skip',
          message: `Black frame check skipped: ${bfErr.message}`,
        });
      }
    }

    const result = this.buildResult(checks, hasAudio, duration, resolution, fileSizeMB);

    // Log results
    console.log(`   📋 QA Results: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
    for (const check of checks) {
      const icon =
        check.status === 'pass' ? '✅' : check.status === 'fail' ? '❌' : check.status === 'warn' ? '⚠️' : '⏭️';
      console.log(`      ${icon} ${check.name}: ${check.message}`);
    }

    if (result.criticalFailures.length > 0) {
      console.error(`   🚨 CRITICAL FAILURES: ${result.criticalFailures.length}`);
      for (const failure of result.criticalFailures) {
        console.error(`      ❌ ${failure.name}: ${failure.message}`);
      }
    }

    return result;
  }

  private checkFileSize(videoPath: string, expectedDuration?: number): QACheck {
    if (!existsSync(videoPath)) {
      return {
        name: 'File exists',
        status: 'fail',
        message: `Video file not found: ${videoPath}`,
        type: 'tiny_file',
      };
    }

    const stats = statSync(videoPath);
    const sizeMB = stats.size / (1024 * 1024);

    // For videos > 1 minute, file should be > 1MB
    const minSizeMB = expectedDuration && expectedDuration > 60 ? 1.0 : 0.1;

    if (sizeMB < minSizeMB) {
      return {
        name: 'File size',
        status: 'fail',
        message: `File too small: ${sizeMB.toFixed(2)}MB (minimum ${minSizeMB}MB for ${expectedDuration || 'unknown'}s video)`,
        type: 'tiny_file',
      };
    }

    return {
      name: 'File size',
      status: 'pass',
      message: `${sizeMB.toFixed(1)}MB`,
    };
  }

  private getFileSizeMB(videoPath: string): number | undefined {
    try {
      const stats = statSync(videoPath);
      return stats.size / (1024 * 1024);
    } catch {
      return undefined;
    }
  }

  private async probeVideo(videoPath: string): Promise<{
    hasAudio: boolean;
    audioCodec?: string;
    audioDuration?: number;
    videoDuration?: number;
    width?: number;
    height?: number;
  }> {
    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    const { stdout } = await execAsync(command, { timeout: 30000 });
    const metadata = JSON.parse(stdout);

    const streams = metadata.streams || [];
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');
    const videoStream = streams.find((s: any) => s.codec_type === 'video');

    return {
      hasAudio: !!audioStream,
      audioCodec: audioStream?.codec_name,
      audioDuration: audioStream?.duration
        ? parseFloat(audioStream.duration)
        : metadata.format?.duration
          ? parseFloat(metadata.format.duration)
          : undefined,
      videoDuration: videoStream?.duration
        ? parseFloat(videoStream.duration)
        : metadata.format?.duration
          ? parseFloat(metadata.format.duration)
          : undefined,
      width: videoStream ? parseInt(videoStream.width) : undefined,
      height: videoStream ? parseInt(videoStream.height) : undefined,
    };
  }

  private async checkBlackFrames(videoPath: string, jobId: string, duration: number): Promise<QACheck> {
    // Sample 10 evenly-spaced frames and check for all-black
    const qaDir = `/tmp/unity-scratch/qa_${jobId}`;
    if (!existsSync(qaDir)) {
      mkdirSync(qaDir, { recursive: true });
    }

    try {
      // Use blackdetect filter to find black segments (threshold 0.98 = nearly black, min duration 0.5s)
      const command = `ffmpeg -i "${videoPath}" -vf "blackdetect=d=0.5:pic_th=0.98:pix_th=0.10" -an -f null - 2>&1 | grep -c "black_start" || echo "0"`;
      const { stdout } = await execAsync(command, { timeout: 60000 });
      const blackSegments = parseInt(stdout.trim()) || 0;

      // Calculate what percentage of the video is black
      // Each detected segment is at least 0.5s
      const estimatedBlackDuration = blackSegments * 0.5;
      const blackPercentage = (estimatedBlackDuration / duration) * 100;

      // Clean up
      this.cleanupQADir(qaDir);

      if (blackPercentage > 30) {
        return {
          name: 'Black frames',
          status: 'warn',
          message: `~${blackSegments} black segments detected (~${blackPercentage.toFixed(0)}% of video)`,
          type: 'black_frames',
        };
      }

      return {
        name: 'Black frames',
        status: 'pass',
        message:
          blackSegments === 0
            ? 'No black segments detected'
            : `${blackSegments} minor black segments (${blackPercentage.toFixed(0)}%)`,
      };
    } catch (err: any) {
      this.cleanupQADir(qaDir);
      throw err;
    }
  }

  private cleanupQADir(qaDir: string): void {
    try {
      if (existsSync(qaDir)) {
        const files = readdirSync(qaDir);
        for (const file of files) {
          unlinkSync(join(qaDir, file));
        }
        // Remove directory itself
        const { rmdirSync } = require('fs');
        rmdirSync(qaDir);
      }
    } catch {
      // Best-effort cleanup
    }
  }

  /**
   * Run visual narrative QA by uploading the video to Gemini's File API.
   * Evaluates narrative coherence, visual continuity, and AI artifact detection.
   * Non-blocking by default — warns but doesn't fail the pipeline.
   */
  async runVisualNarrativeQA(
    videoPath: string,
    jobId: string,
    title: string,
    failThreshold = 20,
    warnThreshold = 40,
  ): Promise<VisualNarrativeQAResult> {
    console.log(`\n🎬 NARRATIVE QA: Analyzing visual coherence for job ${jobId}`);
    console.log(`   📁 File: ${videoPath}`);
    console.log(`   📝 Title: ${title}`);

    if (!existsSync(videoPath)) {
      throw new Error(`Video file not found: ${videoPath}`);
    }

    const fm = getFileManager();
    let uploadedFileName: string | undefined;

    try {
      // Step 1: Upload video to Gemini File API
      console.log(`   ⬆️  Uploading video to Gemini File API...`);
      const uploadResult = await fm.uploadFile(videoPath, {
        mimeType: 'video/mp4',
        displayName: `qa-${jobId}`,
      });
      uploadedFileName = uploadResult.file.name;
      console.log(`   ✅ Upload complete: ${uploadedFileName}`);

      // Step 2: Poll until processing is done
      console.log(`   ⏳ Waiting for video processing...`);
      let file = uploadResult.file;
      const maxWaitMs = 120_000;
      const pollIntervalMs = 3_000;
      const startTime = Date.now();

      while (file.state === FileState.PROCESSING) {
        if (Date.now() - startTime > maxWaitMs) {
          throw new Error(`Video processing timed out after ${maxWaitMs / 1000}s`);
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        file = await fm.getFile(uploadedFileName);
      }

      if (file.state === FileState.FAILED) {
        throw new Error(`Gemini file processing failed: ${file.error?.message || 'unknown error'}`);
      }

      console.log(`   ✅ Video processed (state: ${file.state})`);

      // Step 3: Send to Gemini with narrative QA prompt
      const gemini = getGemini();
      const model = gemini.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      });

      const prompt = `You are a video quality analyst for a YouTube content platform that creates historical educational videos.

Analyze this video and evaluate its VISUAL NARRATIVE COHERENCE. The video's intended subject is: "${title}"

Evaluate the following:
1. Do consecutive scenes tell a coherent visual story? Or do they jump randomly between unrelated imagery?
2. Are there jarring visual discontinuities between clips (sudden style changes, unrelated settings)?
3. Do the visuals match the described historical era/setting for "${title}"?
4. Are there obvious AI generation artifacts (morphing faces, melting limbs, text glitches, impossible geometry)?
5. Overall: does this video look like a coherent piece of content a viewer would watch?

Respond with this exact JSON structure:
{
  "score": <number 0-100, where 100 = perfectly coherent narrative>,
  "scenes": [
    {"index": 1, "description": "<brief description of scene>", "durationEstimate": "<e.g. 0:00-0:05>"}
  ],
  "issues": [
    {"severity": "<minor|major|critical>", "type": "<discontinuity|off_topic|ai_artifact|era_mismatch|incoherent>", "description": "<specific issue>", "timestamp": "<approximate time>"}
  ],
  "summary": "<one sentence overall assessment>"
}

Be honest but fair — AI-generated videos will never be perfect. Score 60+ for watchable content with minor issues. Score 40-59 for content with noticeable but not deal-breaking problems. Below 40 means serious narrative/visual problems.

IMPORTANT: Keep scene descriptions under 15 words each. List at most 10 scenes (group similar consecutive scenes). Keep the entire response concise.`;

      const result = await model.generateContent([
        {
          fileData: {
            mimeType: 'video/mp4',
            fileUri: file.uri,
          },
        },
        { text: prompt },
      ]);

      const response = result.response;
      const text = response.text();

      // Track cost
      const usage = response.usageMetadata;
      if (usage) {
        try {
          const { apiCostTracker } = await import('./api-cost-tracker');
          await apiCostTracker.trackGemini({
            model: 'gemini-2.5-flash',
            operation: 'visual_narrative_qa',
            inputTokens: usage.promptTokenCount || 0,
            outputTokens: usage.candidatesTokenCount || 0,
            jobId,
            success: true,
            metadata: { title, videoPath },
          });
        } catch (costErr) {
          // Non-critical — don't fail QA over cost tracking
        }
      }

      // Step 4: Parse response (with resilient handling for truncated JSON)
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Try to extract score from truncated JSON
        const scoreMatch = text.match(/"score"\s*:\s*(\d+)/);
        const summaryMatch = text.match(/"summary"\s*:\s*"([^"]+)"/);
        parsed = {
          score: scoreMatch ? parseInt(scoreMatch[1]) : 50,
          scenes: [],
          issues: [],
          summary: summaryMatch ? summaryMatch[1] : 'Analysis completed but response was truncated',
        };
      }
      const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
      const passed = score >= failThreshold;

      const qaResult: VisualNarrativeQAResult = {
        score,
        passed,
        scenes: (parsed.scenes || []).map((s: any, i: number) => ({
          index: s.index ?? i + 1,
          description: String(s.description || ''),
          durationEstimate: s.durationEstimate,
        })),
        issues: (parsed.issues || []).map((issue: any) => {
          // Handle both string issues and object issues
          if (typeof issue === 'string') {
            return {
              severity: 'minor' as const,
              type: 'incoherent' as const,
              description: issue,
              timestamp: undefined,
            };
          }
          return {
            severity: (['minor', 'major', 'critical'].includes(issue.severity) ? issue.severity : 'minor') as
              | 'minor'
              | 'major'
              | 'critical',
            type: (['discontinuity', 'off_topic', 'ai_artifact', 'era_mismatch', 'incoherent'].includes(issue.type)
              ? issue.type
              : 'incoherent') as NarrativeIssue['type'],
            description: String(issue.description || ''),
            timestamp: issue.timestamp,
          };
        }),
        summary: String(parsed.summary || ''),
      };

      // Log results
      const icon = score >= warnThreshold ? '✅' : score >= failThreshold ? '⚠️' : '❌';
      console.log(`   ${icon} Narrative QA: ${score}/100 — ${qaResult.summary}`);
      if (qaResult.issues.length > 0) {
        for (const issue of qaResult.issues) {
          console.log(`      - [${issue.severity}] ${issue.type}: ${issue.description}`);
        }
      }

      return qaResult;
    } finally {
      // Step 5: Always clean up uploaded file
      if (uploadedFileName) {
        try {
          await fm.deleteFile(uploadedFileName);
          console.log(`   🗑️  Cleaned up Gemini file: ${uploadedFileName}`);
        } catch (cleanupErr) {
          console.warn(`   ⚠️ Failed to delete Gemini file ${uploadedFileName}: ${(cleanupErr as Error).message}`);
        }
      }
    }
  }

  private buildResult(
    checks: QACheck[],
    hasAudio: boolean,
    duration?: number,
    resolution?: { width: number; height: number },
    fileSizeMB?: number,
  ): QAResult {
    const criticalFailures = checks.filter((c) => c.status === 'fail');
    const warnings = checks.filter((c) => c.status === 'warn');

    return {
      passed: criticalFailures.length === 0,
      checks,
      criticalFailures,
      warnings,
      duration,
      hasAudio,
      resolution,
      fileSizeMB,
    };
  }
}

export const videoQAService = VideoQAService.getInstance();
