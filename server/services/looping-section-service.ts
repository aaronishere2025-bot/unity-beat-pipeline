/**
 * Looping Section Service
 * One Kling clip per musical section, looped to fill duration
 * More efficient and musically coherent than many arbitrary clips
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

// FFmpeg encoder detection and configuration
interface EncoderConfig {
  encoder: string;
  preset: string;
  hardwareAccelerated: boolean;
}

let cachedEncoderConfig: EncoderConfig | null = null;

/**
 * Detect best available encoder (GPU > CPU)
 */
async function detectBestEncoder(): Promise<EncoderConfig> {
  if (cachedEncoderConfig) {
    return cachedEncoderConfig;
  }

  try {
    // Test NVIDIA GPU encoding with an actual encode (encoder listed != CUDA available)
    await execAsync('ffmpeg -hide_banner -f lavfi -i nullsrc=s=64x64:d=0.1 -c:v h264_nvenc -f null - 2>&1');
    console.log('🎮 GPU encoding available: NVIDIA h264_nvenc (p5 - balanced quality/speed)');
    cachedEncoderConfig = {
      encoder: 'h264_nvenc',
      preset: 'p5', // Balanced quality/speed preset for NVENC
      hardwareAccelerated: true,
    };
    return cachedEncoderConfig;
  } catch {}

  try {
    // Check for Intel Quick Sync (h264_qsv)
    await execAsync('ffmpeg -hide_banner -f lavfi -i nullsrc=s=64x64:d=0.1 -c:v h264_qsv -f null - 2>&1');
    console.log('🎮 GPU encoding available: Intel Quick Sync h264_qsv');
    cachedEncoderConfig = {
      encoder: 'h264_qsv',
      preset: 'fast',
      hardwareAccelerated: true,
    };
    return cachedEncoderConfig;
  } catch {}

  // Fallback to CPU encoding
  console.log('💻 Using CPU encoding: libx264');
  cachedEncoderConfig = {
    encoder: 'libx264',
    preset: 'ultrafast', // Fast CPU preset
    hardwareAccelerated: false,
  };
  return cachedEncoderConfig;
}

/**
 * Concurrency limiter for FFmpeg processes
 * Limits number of parallel video encodes to prevent CPU saturation
 */
class ConcurrencyLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const fn = this.queue.shift();
    if (fn) {
      await fn();
      this.running--;
      this.process();
    }
  }
}

interface LoopStrategy {
  type: 'trim' | 'loop';
  loop_point?: number;
  loops_needed?: number;
  output_duration: number;
  crossfade_ms?: number;
}

interface SectionClipPlan {
  id: string;
  section_index: number;
  section_type: string;
  mood: string;
  energy: number;
  gen_start: number;
  gen_duration: number;
  section_start: number;
  section_end: number;
  section_duration: number;
  loop_strategy: LoopStrategy;
}

interface CostSummary {
  total_clips: number;
  kling_cost_estimate: string;
  average_section_duration: number;
  sections: string[];
}

class LoopingSectionService {
  /**
   * Plan one Kling generation per semantic section
   */
  async planSectionClips(
    semanticAnalysis: any,
    librosaAnalysis: any,
  ): Promise<{ plan: SectionClipPlan[]; summary: CostSummary }> {
    try {
      console.log(`🎬 Planning section-based clips...`);

      const pythonScript = path.join(process.cwd(), 'scripts', 'looping_section_planner.py');

      // Write temp files for Python script
      const semanticFile = path.join('/tmp', `semantic_${Date.now()}.json`);
      const librosaFile = path.join('/tmp', `librosa_${Date.now()}.json`);

      fs.writeFileSync(semanticFile, JSON.stringify(semanticAnalysis));
      fs.writeFileSync(librosaFile, JSON.stringify(librosaAnalysis));

      try {
        const { stdout } = await execAsync(`python3 "${pythonScript}" "${semanticFile}" "${librosaFile}"`, {
          timeout: 60000,
        });

        const result = JSON.parse(stdout);

        console.log(`   ✅ Planned ${result.summary.total_clips} clips`);
        console.log(`   💰 Estimated cost: ${result.summary.kling_cost_estimate}`);

        return {
          plan: result.plan,
          summary: result.summary,
        };
      } finally {
        // Always cleanup temp files, even on error
        try {
          if (fs.existsSync(semanticFile)) fs.unlinkSync(semanticFile);
        } catch {}
        try {
          if (fs.existsSync(librosaFile)) fs.unlinkSync(librosaFile);
        } catch {}
      }
    } catch (error: any) {
      console.error(`   ❌ Section planning failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create looped version of a clip to fill section duration
   * Now uses hardware encoding when available
   */
  async loopClip(clipPath: string, loopStrategy: LoopStrategy, outputPath: string): Promise<void> {
    try {
      if (loopStrategy.type === 'trim') {
        // Just trim the clip
        await execAsync(
          `ffmpeg -y -i "${clipPath}" -t ${loopStrategy.output_duration} -c copy "${outputPath}"`,
          { timeout: 120000 }, // 2 minutes for simple trim
        );
      } else {
        // Loop the clip with best available encoder
        const loops = loopStrategy.loops_needed || 1;
        const duration = loopStrategy.output_duration;

        const encoderConfig = await detectBestEncoder();
        const encoderFlag = encoderConfig.hardwareAccelerated
          ? `-c:v ${encoderConfig.encoder} -preset ${encoderConfig.preset}`
          : `-c:v ${encoderConfig.encoder} -preset fast -crf 18`;

        // Timeout scales with output duration: 5x duration (min 5 min, max 30 min)
        const loopTimeout = Math.min(30 * 60 * 1000, Math.max(5 * 60 * 1000, duration * 5 * 1000));
        await execAsync(
          `ffmpeg -y -stream_loop ${loops} -i "${clipPath}" -t ${duration} ${encoderFlag} "${outputPath}"`,
          { timeout: loopTimeout },
        );
      }

      console.log(`   ✅ Looped clip: ${path.basename(outputPath)}`);
    } catch (error: any) {
      console.error(`   ❌ Loop failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Loop clip using PARALLEL SEGMENTS with concurrency limiting
   * Creates multiple 4-min segments with limited parallelism, then concatenates
   * OPTIMIZATIONS:
   * - Limits concurrent FFmpeg processes to 3 (prevents CPU saturation)
   * - Auto-detects GPU encoding (10x faster than CPU)
   * - Uses ultrafast preset for CPU, hardware presets for GPU
   */
  async loopClipParallel(clipPath: string, totalDuration: number, outputPath: string): Promise<void> {
    try {
      const SEGMENT_DURATION = 240; // 4 minutes per segment
      const segmentCount = Math.ceil(totalDuration / SEGMENT_DURATION);

      // Detect best encoder
      const encoderConfig = await detectBestEncoder();
      const encoderFlag = encoderConfig.hardwareAccelerated
        ? `-c:v ${encoderConfig.encoder} -preset ${encoderConfig.preset}`
        : `-c:v ${encoderConfig.encoder} -preset ${encoderConfig.preset} -crf 18`;

      console.log(
        `   🚀 Parallel looping: ${segmentCount} × 4-min segments (${encoderConfig.encoder} ${encoderConfig.preset})`,
      );
      console.log(`   ⚡ Concurrency limit: 6 parallel encodes (maximum speed!)`);

      // Get clip duration
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${clipPath}"`,
        { timeout: 30000 }, // 30 seconds for probe
      );
      const clipDuration = parseFloat(stdout.trim());
      const loopsPerSegment = Math.ceil(SEGMENT_DURATION / clipDuration);

      // Create concurrency limiter (max 6 parallel FFmpeg processes for maximum speed)
      const limiter = new ConcurrencyLimiter(6);

      // Create segments with limited parallelism
      const segmentPaths: string[] = [];
      const promises: Promise<void>[] = [];

      for (let i = 0; i < segmentCount; i++) {
        const segmentPath = outputPath.replace('.mp4', `_segment_${i}.mp4`);
        segmentPaths.push(segmentPath);

        const segmentDur =
          i === segmentCount - 1
            ? totalDuration - i * SEGMENT_DURATION // Last segment (partial)
            : SEGMENT_DURATION;

        // Add to concurrency-limited queue
        const promise = limiter.add(async () => {
          const startTime = Date.now();
          // Timeout: 5x segment duration (min 5 min, max 20 min per segment)
          const segmentTimeout = Math.floor(Math.min(20 * 60 * 1000, Math.max(5 * 60 * 1000, segmentDur * 5 * 1000)));
          await execAsync(
            `ffmpeg -y -stream_loop ${loopsPerSegment - 1} -i "${clipPath}" ` +
              `-t ${segmentDur} ${encoderFlag} -pix_fmt yuv420p "${segmentPath}"`,
            { timeout: segmentTimeout },
          );
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`     ✅ Segment ${i + 1}/${segmentCount} done (${elapsed}s)`);
        });

        promises.push(promise);
      }

      // Wait for all segments (respecting concurrency limit)
      await Promise.all(promises);

      // Concatenate segments (fast, no re-encoding)
      const concatListPath = outputPath.replace('.mp4', '_concat.txt');
      const concatList = segmentPaths.map((p) => `file '${p}'`).join('\n');
      fs.writeFileSync(concatListPath, concatList);

      try {
        console.log(`   🔗 Concatenating ${segmentCount} segments...`);
        await execAsync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${outputPath}"`, {
          timeout: 300000,
        });
        console.log(`   ✅ Parallel loop complete: ${path.basename(outputPath)}`);
      } finally {
        // Always cleanup segments and concat list, even on error
        segmentPaths.forEach((p) => {
          try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
          } catch {}
        });
        try {
          if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath);
        } catch {}
      }
    } catch (error: any) {
      console.error(`   ❌ Parallel loop failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Concatenate looped section clips and add audio
   */
  async assembleFinalVideo(loopedClips: string[], audioPath: string, outputPath: string): Promise<void> {
    try {
      console.log(`\n🔧 Assembling final video from ${loopedClips.length} looped sections...`);

      // Create concat file
      const concatFile = path.join('/tmp', `concat_${Date.now()}.txt`);
      const concatContent = loopedClips.map((clip) => `file '${clip}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      // Concatenate clips
      const tempVideo = path.join('/tmp', `temp_concat_${Date.now()}.mp4`);
      try {
        await execAsync(
          `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c:v libx264 -preset fast -crf 18 "${tempVideo}"`,
          { timeout: 600000 },
        );

        // Add audio
        await execAsync(
          `ffmpeg -y -i "${tempVideo}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -map 0:v:0 -map 1:a:0 -shortest "${outputPath}"`,
          { timeout: 600000 },
        );

        console.log(`   ✅ Final video assembled: ${path.basename(outputPath)}`);
      } finally {
        // Always cleanup temp files
        try {
          if (fs.existsSync(concatFile)) fs.unlinkSync(concatFile);
        } catch {}
        try {
          if (fs.existsSync(tempVideo)) fs.unlinkSync(tempVideo);
        } catch {}
      }
    } catch (error: any) {
      console.error(`   ❌ Assembly failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get optimal clip duration for a section
   */
  getOptimalClipDuration(sectionDuration: number): number {
    // Sweet spot: 5-8 seconds for looping
    return Math.min(8.0, Math.max(5.0, sectionDuration / 2));
  }

  /**
   * Calculate total cost for section-based generation
   */
  calculateCost(numSections: number): { clips: number; kling: number; total: number } {
    const klingCost = numSections * 1.5; // $1.50 per 15s clip (300 credits @ $0.005/credit)

    return {
      clips: numSections,
      kling: klingCost,
      total: klingCost,
    };
  }

  /**
   * Compare costs: section-based vs time-based
   */
  compareCosts(
    trackDuration: number,
    numSections: number,
    timeBasedClipDuration: number = 8,
  ): {
    section_based: { clips: number; cost: number };
    time_based: { clips: number; cost: number };
    savings: number;
  } {
    const sectionBased = this.calculateCost(numSections);
    const timeBasedClips = Math.ceil(trackDuration / timeBasedClipDuration);
    const timeBasedCost = timeBasedClips * 0.1;

    return {
      section_based: {
        clips: sectionBased.clips,
        cost: sectionBased.total,
      },
      time_based: {
        clips: timeBasedClips,
        cost: timeBasedCost,
      },
      savings: timeBasedCost - sectionBased.total,
    };
  }
}

export const loopingSectionService = new LoopingSectionService();
export type { SectionClipPlan, LoopStrategy, CostSummary };
