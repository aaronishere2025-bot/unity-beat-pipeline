/**
 * Path Resolution Utilities
 *
 * Centralized path resolution logic for audio, video, and asset files.
 * Handles multiple input formats robustly and prevents directory traversal attacks.
 */

import { join, basename, normalize, isAbsolute, relative } from 'path';
import { existsSync } from 'fs';

/**
 * Resolve audio file path to absolute local path
 *
 * Handles multiple input formats:
 * - `/attached_assets/suno_audio/file.mp3` (relative with leading slash)
 * - `/api/music/file.mp3` (API path)
 * - `attached_assets/suno_audio/file.mp3` (relative without leading slash)
 * - `/home/user/attached_assets/suno_audio/file.mp3` (full absolute)
 * - `suno_audio/file.mp3` (partial relative)
 *
 * @param audioFilePath - Input path in any supported format
 * @returns Absolute path to the audio file on local filesystem
 * @throws Error if path format is unrecognized or validation fails
 */
export function resolveAudioPath(audioFilePath: string): string {
  if (!audioFilePath) {
    throw new Error('Audio file path is required');
  }

  const projectRoot = process.cwd();
  const filename = basename(audioFilePath);

  // Case 1: Already an absolute path within our project
  if (isAbsolute(audioFilePath) && audioFilePath.startsWith(projectRoot)) {
    const validated = validateProjectPath(audioFilePath);
    if (!validated) {
      throw new Error(`Path validation failed: ${audioFilePath}`);
    }
    return audioFilePath;
  }

  // Case 2: Determine target directory based on path pattern
  let targetDir: string;

  if (audioFilePath.includes('/suno_audio/') || audioFilePath.includes('suno_audio')) {
    // Suno-generated audio
    targetDir = join(projectRoot, 'attached_assets', 'suno_audio');
  } else if (audioFilePath.includes('/api/music/') || audioFilePath.includes('/music/')) {
    // Standard music library
    targetDir = join(projectRoot, 'attached_assets', 'music');
  } else if (audioFilePath.includes('/generated_audio/')) {
    // Other generated audio
    targetDir = join(projectRoot, 'attached_assets', 'generated_audio');
  } else if (audioFilePath.includes('/unity_audio/')) {
    // Unity-specific audio
    targetDir = join(projectRoot, 'attached_assets', 'unity_audio');
  } else {
    throw new Error(`Unable to determine audio directory for path: ${audioFilePath}`);
  }

  const resolvedPath = join(targetDir, filename);

  // Validate the resolved path is within project
  const validated = validateProjectPath(resolvedPath);
  if (!validated) {
    throw new Error(`Path validation failed: ${resolvedPath}`);
  }

  return resolvedPath;
}

/**
 * Resolve video file path to absolute local path
 *
 * Handles video storage locations:
 * - `data/videos/renders/`
 * - `data/videos/clips/`
 * - `data/videos/final/`
 *
 * @param videoFilePath - Input path in any supported format
 * @returns Absolute path to the video file on local filesystem
 */
export function resolveVideoPath(videoFilePath: string): string {
  if (!videoFilePath) {
    throw new Error('Video file path is required');
  }

  const projectRoot = process.cwd();

  // Already absolute path within project
  if (isAbsolute(videoFilePath) && videoFilePath.startsWith(projectRoot)) {
    const validated = validateProjectPath(videoFilePath);
    if (!validated) {
      throw new Error(`Path validation failed: ${videoFilePath}`);
    }
    return videoFilePath;
  }

  // Strip leading slashes and normalize
  const relativePath = videoFilePath.replace(/^\/+/, '');
  const resolvedPath = join(projectRoot, relativePath);

  // Validate
  const validated = validateProjectPath(resolvedPath);
  if (!validated) {
    throw new Error(`Path validation failed: ${resolvedPath}`);
  }

  return resolvedPath;
}

/**
 * Validate that a resolved path is within the project directory
 * Prevents directory traversal attacks (e.g., ../../etc/passwd)
 *
 * @param resolvedPath - Absolute path to validate
 * @returns true if path is safe, false otherwise
 */
export function validateProjectPath(resolvedPath: string): boolean {
  const projectRoot = process.cwd();
  const normalizedPath = normalize(resolvedPath);
  const normalizedRoot = normalize(projectRoot);

  // Path must start with project root
  if (!normalizedPath.startsWith(normalizedRoot)) {
    console.warn(`⚠️ Path validation failed: ${normalizedPath} is outside project ${normalizedRoot}`);
    return false;
  }

  // Additional check: no parent directory traversal
  if (normalizedPath.includes('..')) {
    console.warn(`⚠️ Path validation failed: ${normalizedPath} contains parent directory references`);
    return false;
  }

  return true;
}

/**
 * Convert absolute path to project-relative path for database storage
 *
 * Example:
 * - Input: `/home/user/attached_assets/suno_audio/file.mp3`
 * - Output: `attached_assets/suno_audio/file.mp3`
 *
 * @param absolutePath - Absolute filesystem path or project-relative path
 * @returns Project-relative path suitable for database storage
 */
export function toRelativePath(absolutePath: string): string {
  const projectRoot = process.cwd();

  // Remove leading slashes for consistency
  const cleanPath = absolutePath.replace(/^\/+/, '');

  // If path starts with project root, it's a full absolute path
  if (absolutePath.startsWith(projectRoot)) {
    // Convert to relative
    const relativePath = relative(projectRoot, absolutePath);

    // Ensure it's actually within the project
    if (relativePath.startsWith('..')) {
      throw new Error(`Path is outside project: ${absolutePath}`);
    }

    return relativePath;
  }

  // Otherwise, treat as project-relative and return cleaned version
  return cleanPath;
}

/**
 * Find audio file by checking multiple possible locations
 *
 * Useful when path format is ambiguous or file might be in different locations.
 *
 * @param audioFilePath - Input path (any format)
 * @returns Absolute path if file found, undefined otherwise
 */
export function findAudioFile(audioFilePath: string): string | undefined {
  const projectRoot = process.cwd();
  const filename = basename(audioFilePath);

  // Build list of possible locations to check
  const possiblePaths: string[] = [];

  // Try exact path first (if absolute)
  if (isAbsolute(audioFilePath)) {
    possiblePaths.push(audioFilePath);
  }

  // Try resolving as-is
  try {
    const resolved = resolveAudioPath(audioFilePath);
    possiblePaths.push(resolved);
  } catch {
    // Resolution failed, continue with other options
  }

  // Try common locations with just filename
  possiblePaths.push(
    join(projectRoot, 'attached_assets', 'suno_audio', filename),
    join(projectRoot, 'attached_assets', 'music', filename),
    join(projectRoot, 'attached_assets', 'generated_audio', filename),
    join(projectRoot, 'attached_assets', 'unity_audio', filename),
  );

  // Return first existing path
  for (const testPath of possiblePaths) {
    if (existsSync(testPath) && validateProjectPath(testPath)) {
      return testPath;
    }
  }

  return undefined;
}

/**
 * Format path for API response
 *
 * Converts internal path to API-friendly format.
 * Example: `attached_assets/suno_audio/file.mp3` → `/attached_assets/suno_audio/file.mp3`
 *
 * @param internalPath - Internal project-relative path
 * @returns API path format
 */
export function toApiPath(internalPath: string): string {
  // Ensure single leading slash
  const normalized = internalPath.replace(/^\/+/, '');
  return `/${normalized}`;
}

/**
 * Get storage directory for a file type
 *
 * @param fileType - Type of file ('suno_audio', 'music', 'video_render', etc.)
 * @returns Absolute path to storage directory
 */
export function getStorageDir(fileType: string): string {
  const projectRoot = process.cwd();

  const dirMap: Record<string, string> = {
    suno_audio: join(projectRoot, 'attached_assets', 'suno_audio'),
    music: join(projectRoot, 'attached_assets', 'music'),
    generated_audio: join(projectRoot, 'attached_assets', 'generated_audio'),
    unity_audio: join(projectRoot, 'attached_assets', 'unity_audio'),
    video_render: join(projectRoot, 'data', 'videos', 'renders'),
    video_clip: join(projectRoot, 'data', 'videos', 'clips'),
    video_final: join(projectRoot, 'data', 'videos', 'final'),
    thumbnail: join(projectRoot, 'data', 'thumbnails'),
    character_image: join(projectRoot, 'attached_assets', 'character_images'),
    reference_image: join(projectRoot, 'attached_assets', 'reference_images'),
  };

  const dir = dirMap[fileType];
  if (!dir) {
    throw new Error(`Unknown file type: ${fileType}`);
  }

  return dir;
}
