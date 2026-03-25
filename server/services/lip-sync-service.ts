import Replicate from 'replicate';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import axios from 'axios';

export interface LipSyncOptions {
  enhancer?: 'gfpgan' | 'none';
  preprocess?: 'crop' | 'full' | 'resize';
  stillMode?: boolean;
  expressionScale?: number;
}

export interface LipSyncStatus {
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  progress?: number;
  error?: string;
  outputUrl?: string;
}

export interface LipSyncResult {
  success: boolean;
  outputPath?: string;
  outputUrl?: string;
  error?: string;
  cost?: number;
  durationSeconds?: number;
}

const SADTALKER_COST_PER_SECOND = 0.0055;

class LipSyncService {
  private replicate: Replicate | null = null;
  private outputDir: string;
  private taskStatus: Map<string, LipSyncStatus> = new Map();

  constructor() {
    if (process.env.REPLICATE_API_TOKEN) {
      this.replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
      });
      console.log('👄 [LipSync] Service initialized with Replicate API');
    } else {
      console.warn('👄 [LipSync] Warning: REPLICATE_API_TOKEN not found - lip sync disabled');
    }

    this.outputDir = join(process.cwd(), 'data', 'videos', 'lip-sync');
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  estimateCost(videoDurationSeconds: number): number {
    return Math.ceil(videoDurationSeconds) * SADTALKER_COST_PER_SECOND;
  }

  async applyLipSync(videoPath: string, audioPath: string, options: LipSyncOptions = {}): Promise<LipSyncResult> {
    if (!this.replicate) {
      console.error('👄 [LipSync] Replicate not initialized - skipping lip sync');
      return { success: false, error: 'Replicate API not configured' };
    }

    const taskId = `lipsync_${Date.now()}`;
    console.log(`\n👄 [LipSync] Starting lip sync task: ${taskId}`);
    console.log(`   📹 Video: ${basename(videoPath)}`);
    console.log(`   🎤 Audio: ${basename(audioPath)}`);

    try {
      if (!existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }
      if (!existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      const videoBuffer = readFileSync(videoPath);
      const audioBuffer = readFileSync(audioPath);

      const videoMimeType = videoPath.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
      const audioMimeType = audioPath.endsWith('.mp3')
        ? 'audio/mpeg'
        : audioPath.endsWith('.wav')
          ? 'audio/wav'
          : 'audio/mpeg';

      const videoDataUri = `data:${videoMimeType};base64,${videoBuffer.toString('base64')}`;
      const audioDataUri = `data:${audioMimeType};base64,${audioBuffer.toString('base64')}`;

      console.log(`   📤 Video size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);
      console.log(`   📤 Audio size: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

      this.taskStatus.set(taskId, { status: 'processing' });

      const enhancer = options.enhancer || 'gfpgan';
      const preprocess = options.preprocess || 'full';
      const stillMode = options.stillMode ?? false;
      const expressionScale = options.expressionScale ?? 1.0;

      console.log(`   ⚙️ Options: enhancer=${enhancer}, preprocess=${preprocess}, still=${stillMode}`);
      console.log(`   💰 Estimated cost: $${this.estimateCost(60).toFixed(3)} per minute`);

      console.log('   🎬 Calling SadTalker model on Replicate...');

      const output = (await this.replicate.run(
        'cjwbw/sadtalker:3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376',
        {
          input: {
            source_image: videoDataUri,
            driven_audio: audioDataUri,
            enhancer: enhancer,
            preprocess: preprocess,
            still: stillMode,
            expression_scale: expressionScale,
          },
        },
      )) as string | { output?: string };

      let outputUrl: string;
      if (typeof output === 'string') {
        outputUrl = output;
      } else if (output && typeof output === 'object' && 'output' in output) {
        outputUrl = (output as any).output || '';
      } else if (Array.isArray(output) && output.length > 0) {
        outputUrl = output[0];
      } else {
        throw new Error(`Unexpected output format from SadTalker: ${JSON.stringify(output)}`);
      }

      console.log(`   ✅ SadTalker complete: ${outputUrl.substring(0, 80)}...`);

      const outputFilename = `lipsync_${Date.now()}.mp4`;
      const outputPath = join(this.outputDir, outputFilename);

      console.log('   📥 Downloading lip-synced video...');
      const response = await axios.get(outputUrl, { responseType: 'arraybuffer' });
      writeFileSync(outputPath, response.data);

      console.log(`   ✅ Saved to: ${outputPath}`);
      console.log(`   📦 Output size: ${(response.data.length / 1024 / 1024).toFixed(2)} MB`);

      this.taskStatus.set(taskId, {
        status: 'succeeded',
        outputUrl: `/api/videos/lip-sync/${outputFilename}`,
      });

      return {
        success: true,
        outputPath,
        outputUrl: `/api/videos/lip-sync/${outputFilename}`,
        cost: this.estimateCost(60),
      };
    } catch (error: any) {
      console.error(`   ❌ [LipSync] Error: ${error.message}`);
      this.taskStatus.set(taskId, {
        status: 'failed',
        error: error.message,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  async applyLipSyncToVideo(
    videoPath: string,
    musicPath: string,
    options: LipSyncOptions = {},
  ): Promise<LipSyncResult> {
    console.log('\n👄 [LipSync] Full pipeline: Extract vocals → Apply lip sync');

    try {
      const { separateAudio } = await import('./audio-intelligence');

      console.log('   🎵 Step 1: Extracting vocals using Demucs...');
      const separation = await separateAudio(musicPath);

      if (!separation.vocalsPath || !existsSync(separation.vocalsPath)) {
        throw new Error('Vocal extraction failed - no vocals file produced');
      }

      console.log(`   ✅ Vocals extracted: ${separation.vocalsPath}`);

      console.log('   🎬 Step 2: Applying lip sync with isolated vocals...');
      const result = await this.applyLipSync(videoPath, separation.vocalsPath, options);

      try {
        if (separation.vocalsPath && existsSync(separation.vocalsPath)) {
          unlinkSync(separation.vocalsPath);
        }
        if (separation.instrumentalPath && existsSync(separation.instrumentalPath)) {
          unlinkSync(separation.instrumentalPath);
        }
      } catch (e) {
        console.warn('   ⚠️ Could not clean up temp vocals files');
      }

      return result;
    } catch (error: any) {
      console.error(`   ❌ [LipSync] Pipeline error: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  getLipSyncStatus(taskId: string): LipSyncStatus {
    return this.taskStatus.get(taskId) || { status: 'failed', error: 'Task not found' };
  }

  isAvailable(): boolean {
    return this.replicate !== null;
  }
}

export const lipSyncService = new LipSyncService();
