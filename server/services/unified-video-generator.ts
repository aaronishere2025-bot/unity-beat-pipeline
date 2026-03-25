import { klingVideoGenerator, BEST_OF_N_CONFIG, type ShotDescription } from './kling-video-generator';

export type VideoEngine = 'kling';

interface VideoGenerationOptions {
  prompt: string;
  duration?: number;
  aspectRatio?: '9:16' | '16:9';
  referenceImages?: Array<{
    url: string;
    filename: string;
    mimeType: string;
  }>;
  clipIndex?: number;
  totalClips?: number;
  enableBestOfN?: boolean;
  jobId?: string;
}

interface VideoGenerationResult {
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

export { BEST_OF_N_CONFIG };

export class UnifiedVideoGenerator {
  private engine: VideoEngine;

  constructor(engine: VideoEngine = 'kling') {
    this.engine = engine;
  }

  getEngine(): VideoEngine {
    return this.engine;
  }

  setEngine(engine: VideoEngine): void {
    this.engine = engine;
    console.log(`🔄 Video engine switched to: ${engine.toUpperCase()}`);
  }

  isEnabled(): boolean {
    return klingVideoGenerator.isEnabled();
  }

  getCostPerClip(durationSeconds?: number): number {
    return klingVideoGenerator.getCostPerClip(durationSeconds);
  }

  async generateSingleClip(prompt: string, options: VideoGenerationOptions): Promise<VideoGenerationResult> {
    console.log(`🎬 [${this.engine.toUpperCase()}] Generating clip...`);
    return klingVideoGenerator.generateSingleClip(prompt, options);
  }

  async generateClips(
    prompts: string[],
    options: Omit<VideoGenerationOptions, 'prompt'>,
    onProgress?: (current: number, total: number) => void,
    existingClips?: Array<{ clipIndex: number; videoPath: string; cost?: number }>,
    onClipComplete?: (clipIndex: number, videoPath: string, cost: number) => Promise<void>,
  ): Promise<{ clipPaths: string[]; totalCost: number }> {
    console.log(`🎬 [${this.engine.toUpperCase()}] Generating ${prompts.length} clips...`);
    return klingVideoGenerator.generateClips(prompts, options, onProgress, existingClips, onClipComplete);
  }

  async generateMultiShotBatch(
    prompts: string[],
    options: Omit<VideoGenerationOptions, 'prompt'> & { klingCreditBudget?: number; klingCreditWarning?: number },
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
    console.log(
      `🎬 [${this.engine.toUpperCase()}] Multi-shot batch: ${prompts.length} prompts -> ${Math.ceil(prompts.length / shotsPerGeneration)} scene groups`,
    );
    return klingVideoGenerator.generateMultiShotBatch(
      prompts,
      options,
      shotsPerGeneration,
      onProgress,
      existingClips,
      onSceneGroupComplete,
    );
  }

  getEngineInfo(): {
    name: string;
    costPerSecond: number;
    defaultDuration: number;
    resolution: string;
    features: string[];
  } {
    return {
      name: 'Kling 1.6',
      costPerSecond: 0.028,
      defaultDuration: 5,
      resolution: '1080p',
      features: [
        'Official Kling API',
        '1080p resolution',
        'Fast generation',
        'Image-to-video support',
        'Best-of-N with GPT-4o Vision scoring',
      ],
    };
  }
}

export function getAvailableEngines(): Array<{
  engine: VideoEngine;
  name: string;
  enabled: boolean;
  costPer10Sec: number;
}> {
  return [
    {
      engine: 'kling',
      name: 'Kling 1.6 (Official)',
      enabled: klingVideoGenerator.isEnabled(),
      costPer10Sec: 0.28,
    },
  ];
}

export const unifiedVideoGenerator = new UnifiedVideoGenerator('kling');
