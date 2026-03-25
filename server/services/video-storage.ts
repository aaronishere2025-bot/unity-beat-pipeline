import { join, basename } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, renameSync } from 'fs';

/**
 * Centralized Video Storage System
 *
 * Directory Structure:
 *   /data/videos/
 *     /clips/      - Individual VEO/Luma clips (intermediate)
 *     /renders/    - Final rendered videos (concatenated)
 *     /uploads/    - User uploaded files (audio, images)
 *
 * File Naming Convention:
 *   clips:   {type}_{timestamp}_{randomId}.mp4
 *   renders: {packageId}_final_{timestamp}.mp4
 */

const DATA_ROOT = join(process.cwd(), 'data', 'videos');
const CLIPS_DIR = join(DATA_ROOT, 'clips');
const RENDERS_DIR = join(DATA_ROOT, 'renders');
const UPLOADS_DIR = join(DATA_ROOT, 'uploads');

// Legacy directories to check for backwards compatibility
const LEGACY_DIRS = [
  join(process.cwd(), 'data', 'temp', 'processing'),
  '/tmp/unity-scratch',
  join(process.cwd(), 'public', 'videos'),
  join(process.cwd(), 'outputs'),
];

export interface VideoStorageOptions {
  type: 'veo3' | 'veo3i2v' | 'veo2' | 'luma' | 'kling' | 'render' | 'upload';
  packageId?: string;
  jobId?: string;
  clipIndex?: number;
  suffix?: string;
}

class VideoStorage {
  constructor() {
    this.ensureDirectories();
  }

  private ensureDirectories() {
    [DATA_ROOT, CLIPS_DIR, RENDERS_DIR, UPLOADS_DIR].forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
        console.log(`📁 Created video storage directory: ${dir}`);
      }
    });
  }

  /**
   * Generate a unique filename for a video clip
   */
  generateClipFilename(options: VideoStorageOptions): string {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const prefix = options.type;
    const suffix = options.suffix || '';

    if (options.clipIndex !== undefined) {
      return `${prefix}_clip${options.clipIndex}${suffix}_${timestamp}_${randomId}.mp4`;
    }
    return `${prefix}_${timestamp}${suffix}_${randomId}.mp4`;
  }

  /**
   * Generate a unique filename for a final render
   */
  generateRenderFilename(packageId: string): string {
    const timestamp = Date.now();
    return `${packageId}_final_${timestamp}.mp4`;
  }

  /**
   * Get the full path for a new clip file
   */
  getClipPath(filename: string): string {
    return join(CLIPS_DIR, filename);
  }

  /**
   * Get the full path for a render file
   */
  getRenderPath(filename: string): string {
    return join(RENDERS_DIR, filename);
  }

  /**
   * Get the full path for an upload file
   */
  getUploadPath(filename: string): string {
    return join(UPLOADS_DIR, filename);
  }

  /**
   * Convert a local file path to a web-accessible URL
   */
  toVideoUrl(localPath: string): string {
    const filename = basename(localPath);
    return `/api/videos/${filename}`;
  }

  /**
   * Find a video file by filename, checking all possible locations
   */
  findVideoFile(filename: string): string | null {
    // Check new location first
    const newPath = join(CLIPS_DIR, filename);
    if (existsSync(newPath)) return newPath;

    const renderPath = join(RENDERS_DIR, filename);
    if (existsSync(renderPath)) return renderPath;

    // Check legacy locations
    for (const legacyDir of LEGACY_DIRS) {
      const legacyPath = join(legacyDir, filename);
      if (existsSync(legacyPath)) return legacyPath;
    }

    return null;
  }

  /**
   * Move a file from legacy location to new storage
   */
  migrateFile(oldPath: string, type: 'clip' | 'render' = 'clip'): string {
    if (!existsSync(oldPath)) {
      throw new Error(`File not found: ${oldPath}`);
    }

    const filename = basename(oldPath);
    const newPath = type === 'clip' ? join(CLIPS_DIR, filename) : join(RENDERS_DIR, filename);

    if (oldPath !== newPath) {
      renameSync(oldPath, newPath);
      console.log(`📦 Migrated video: ${oldPath} -> ${newPath}`);
    }

    return newPath;
  }

  /**
   * Get storage statistics
   */
  getStats(): { clips: number; renders: number; uploads: number; totalSizeMB: number } {
    const countFiles = (dir: string): { count: number; size: number } => {
      if (!existsSync(dir)) return { count: 0, size: 0 };
      const files = readdirSync(dir).filter((f) => f.endsWith('.mp4'));
      const totalSize = files.reduce((sum, f) => {
        try {
          return sum + statSync(join(dir, f)).size;
        } catch {
          return sum;
        }
      }, 0);
      return { count: files.length, size: totalSize };
    };

    const clips = countFiles(CLIPS_DIR);
    const renders = countFiles(RENDERS_DIR);
    const uploads = countFiles(UPLOADS_DIR);

    return {
      clips: clips.count,
      renders: renders.count,
      uploads: uploads.count,
      totalSizeMB: Math.round((clips.size + renders.size + uploads.size) / (1024 * 1024)),
    };
  }

  /**
   * Clean up orphaned files older than specified days
   */
  async cleanupOldFiles(maxAgeDays: number = 7): Promise<{ deleted: number; freedMB: number }> {
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let deleted = 0;
    let freedBytes = 0;

    const cleanDir = (dir: string) => {
      if (!existsSync(dir)) return;

      const files = readdirSync(dir).filter((f) => f.endsWith('.mp4'));
      for (const file of files) {
        const filePath = join(dir, file);
        try {
          const stat = statSync(filePath);
          const age = now - stat.mtime.getTime();

          if (age > maxAgeMs) {
            const sizeMB = stat.size;
            unlinkSync(filePath);
            deleted++;
            freedBytes += sizeMB;
            console.log(`🗑️  Deleted old file: ${file} (${Math.round(age / (24 * 60 * 60 * 1000))} days old)`);
          }
        } catch (err) {
          console.warn(`Failed to check/delete file: ${filePath}`);
        }
      }
    };

    // Clean all directories including legacy
    [CLIPS_DIR, RENDERS_DIR, ...LEGACY_DIRS].forEach(cleanDir);

    return {
      deleted,
      freedMB: Math.round(freedBytes / (1024 * 1024)),
    };
  }

  /**
   * List all video files with metadata
   */
  listAllVideos(): Array<{ filename: string; path: string; sizeMB: number; ageHours: number; location: string }> {
    const videos: Array<{ filename: string; path: string; sizeMB: number; ageHours: number; location: string }> = [];
    const now = Date.now();

    const scanDir = (dir: string, location: string) => {
      if (!existsSync(dir)) return;

      const files = readdirSync(dir).filter((f) => f.endsWith('.mp4'));
      for (const file of files) {
        const filePath = join(dir, file);
        try {
          const stat = statSync(filePath);
          videos.push({
            filename: file,
            path: filePath,
            sizeMB: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
            ageHours: Math.round((now - stat.mtime.getTime()) / (60 * 60 * 1000)),
            location,
          });
        } catch {
          // Skip files we can't read
        }
      }
    };

    scanDir(CLIPS_DIR, 'clips');
    scanDir(RENDERS_DIR, 'renders');
    scanDir(UPLOADS_DIR, 'uploads');
    LEGACY_DIRS.forEach((dir, i) => scanDir(dir, `legacy-${i}`));

    return videos.sort((a, b) => a.ageHours - b.ageHours);
  }
}

export const videoStorage = new VideoStorage();
export { CLIPS_DIR, RENDERS_DIR, UPLOADS_DIR, DATA_ROOT };
