/**
 * Mock API Services for Suno and Kling
 *
 * Enable with MOCK_APIS=true environment variable.
 * Returns fake responses so pipeline logic can be tested without burning credits.
 *
 * Usage:
 *   MOCK_APIS=true npm run dev
 *
 * Mock Suno: Returns a pre-generated silent audio file
 * Mock Kling: Returns a pre-generated gradient video clip
 */

import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

const MOCK_DIR = join(process.cwd(), 'data', 'temp', 'mock-assets');

export function isMockMode(): boolean {
  return process.env.MOCK_APIS === 'true';
}

/**
 * Ensure mock assets directory exists and has test files
 */
async function ensureMockAssets(): Promise<void> {
  if (!existsSync(MOCK_DIR)) {
    mkdirSync(MOCK_DIR, { recursive: true });
  }

  const mockAudio = join(MOCK_DIR, 'mock-audio.mp3');
  const mockVideo = join(MOCK_DIR, 'mock-video.mp4');

  // Generate a 30-second silent audio file if it doesn't exist
  if (!existsSync(mockAudio)) {
    try {
      await execAsync(
        `ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 30 -c:a libmp3lame -q:a 9 "${mockAudio}" -loglevel error`,
      );
      console.log(`[Mock] Created mock audio: ${mockAudio}`);
    } catch (e) {
      // Fallback: create an empty file
      writeFileSync(mockAudio, Buffer.alloc(1024));
      console.log(`[Mock] Created empty mock audio (ffmpeg unavailable)`);
    }
  }

  // Generate a 5-second gradient video if it doesn't exist
  if (!existsSync(mockVideo)) {
    try {
      await execAsync(
        `ffmpeg -y -f lavfi -i "color=c=0x1a0a2e:s=1920x1080:d=5,format=yuv420p" -c:v libx264 -preset ultrafast -crf 28 "${mockVideo}" -loglevel error`,
      );
      console.log(`[Mock] Created mock video: ${mockVideo}`);
    } catch (e) {
      writeFileSync(mockVideo, Buffer.alloc(1024));
      console.log(`[Mock] Created empty mock video (ffmpeg unavailable)`);
    }
  }
}

/**
 * Mock Suno API - returns fake audio generation results
 */
export class MockSunoApi {
  private initialized = false;

  async generateSong(params: {
    lyrics?: string;
    style?: string;
    title?: string;
    instrumental?: boolean;
    model?: string;
    targetDuration?: number;
  }): Promise<{ taskId: string }> {
    if (!this.initialized) {
      await ensureMockAssets();
      this.initialized = true;
    }

    const taskId = `mock-suno-${Date.now()}`;
    console.log(`[Mock Suno] Generated task ${taskId} (style: ${params.style?.slice(0, 40)}...)`);

    return { taskId };
  }

  async waitForCompletion(taskId: string): Promise<
    Array<{
      id: string;
      audioUrl: string;
      duration: number;
      title: string;
      status: string;
    }>
  > {
    // Simulate 2-second generation time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const mockAudio = join(MOCK_DIR, 'mock-audio.mp3');
    console.log(`[Mock Suno] Task ${taskId} completed — returning mock audio`);

    return [
      {
        id: taskId,
        audioUrl: `file://${mockAudio}`,
        duration: 30,
        title: 'Mock Generated Beat',
        status: 'complete',
      },
    ];
  }

  async getTaskStatus(taskId: string): Promise<{ status: string; tracks: any[] }> {
    return {
      status: 'complete',
      tracks: [
        {
          id: taskId,
          audioUrl: `file://${join(MOCK_DIR, 'mock-audio.mp3')}`,
          duration: 30,
          title: 'Mock Beat',
          status: 'complete',
        },
      ],
    };
  }
}

/**
 * Mock Kling API - returns fake video generation results
 */
export class MockKlingApi {
  private initialized = false;

  async generateSingleClip(
    prompt: string,
    options?: { prompt?: string; duration?: number; aspectRatio?: string },
  ): Promise<{ success: boolean; localPath: string; taskId: string }> {
    if (!this.initialized) {
      await ensureMockAssets();
      this.initialized = true;
    }

    const mockVideo = join(MOCK_DIR, 'mock-video.mp4');
    console.log(`[Mock Kling] Generated clip (prompt: ${prompt.slice(0, 50)}...)`);

    // Simulate 3-second generation time
    await new Promise((resolve) => setTimeout(resolve, 3000));

    return {
      success: true,
      localPath: mockVideo,
      taskId: `mock-kling-${Date.now()}`,
    };
  }

  async generateClip(prompt: string, options?: any): Promise<{ success: boolean; localPath: string; taskId: string }> {
    return this.generateSingleClip(prompt, options);
  }
}

/**
 * Get the appropriate API instance (mock or real)
 */
export async function getSunoApi(): Promise<any> {
  if (isMockMode()) {
    console.log(`[Mock] Using Mock Suno API`);
    return new MockSunoApi();
  }
  const { sunoApi } = await import('./suno-api');
  return sunoApi;
}

export async function getKlingApi(): Promise<any> {
  if (isMockMode()) {
    console.log(`[Mock] Using Mock Kling API`);
    return new MockKlingApi();
  }
  const { klingVideoGenerator } = await import('./kling-video-generator');
  return klingVideoGenerator;
}

// Singleton instances for mock mode
export const mockSunoApi = new MockSunoApi();
export const mockKlingApi = new MockKlingApi();
