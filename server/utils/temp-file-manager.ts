/**
 * Centralized Temp File Manager
 *
 * Provides consistent paths for temporary files and caches.
 * All temp files are stored in data/ directory to prevent tsx watcher restarts.
 *
 * Usage:
 *   import { TempPaths } from './utils/temp-file-manager';
 *   const processingDir = TempPaths.processing();
 *   const audioCache = TempPaths.audioCache();
 */

import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const BASE_TEMP_DIR = join(process.cwd(), 'data', 'temp');
const BASE_CACHE_DIR = join(process.cwd(), 'data', 'cache');

/**
 * Centralized paths for all temp files and caches
 */
export const TempPaths = {
  /**
   * Main processing directory for video generation workspace
   * Replaces: /tmp/unity-scratch/
   */
  processing: () => ensureDir(join(BASE_TEMP_DIR, 'processing')),

  /**
   * Temporary thumbnail generation
   * Replaces: /tmp/temp_thumbnails/
   */
  thumbnails: () => ensureDir(join(BASE_TEMP_DIR, 'thumbnails')),

  /**
   * Temporary video clips
   * Replaces: /tmp/temp_clips/
   */
  clips: () => ensureDir(join(BASE_TEMP_DIR, 'clips')),

  /**
   * Error analysis reports
   * Replaces: /tmp/claude-code-error-reports/
   */
  errorReports: () => ensureDir(join(BASE_TEMP_DIR, 'error-reports')),

  /**
   * Audio analysis cache (Librosa results)
   * Replaces: /tmp/audio-analysis-cache/
   */
  audioCache: () => ensureDir(join(BASE_CACHE_DIR, 'audio')),

  /**
   * Thumbnail feature cache
   */
  thumbnailFeatures: () => ensureDir(join(BASE_CACHE_DIR, 'thumbnail-features')),

  /**
   * Get base temp directory (for custom subdirectories)
   */
  base: () => ensureDir(BASE_TEMP_DIR),

  /**
   * Get base cache directory (for custom subdirectories)
   */
  cacheBase: () => ensureDir(BASE_CACHE_DIR),
};

/**
 * Ensures directory exists, creates it if needed
 */
function ensureDir(path: string): string {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
  return path;
}

/**
 * Legacy path mapping for gradual migration
 * Maps old /tmp/ paths to new data/ paths
 */
export const LegacyPaths = {
  '/tmp/unity-scratch': TempPaths.processing,
  '/tmp/temp_thumbnails': TempPaths.thumbnails,
  '/tmp/temp_clips': TempPaths.clips,
  '/tmp/audio-analysis-cache': TempPaths.audioCache,
  '/tmp/claude-code-error-reports': TempPaths.errorReports,
};

/**
 * Get new path for a legacy /tmp/ path
 * @param legacyPath - Old /tmp/ path
 * @returns New data/ path
 */
export function migratePath(legacyPath: string): string {
  for (const [oldPath, newPathFn] of Object.entries(LegacyPaths)) {
    if (legacyPath.startsWith(oldPath)) {
      const newBase = newPathFn();
      return legacyPath.replace(oldPath, newBase);
    }
  }
  // If no mapping found, return as-is
  return legacyPath;
}
