import fs from 'fs';
import path from 'path';

interface CleanupResult {
  deletedFiles: string[];
  freedBytes: number;
  errors: string[];
}

interface FileInfo {
  path: string;
  size: number;
  createdAt: Date;
  packageId?: string;
}

export class FileManager {
  private readonly clipDir = path.join(process.cwd(), 'data/videos/clips');
  private readonly finalDir = path.join(process.cwd(), 'data/videos/final');
  private readonly rendersDir = path.join(process.cwd(), 'data/videos/renders');
  private readonly uploadsDir = path.join(process.cwd(), 'data/videos/uploads');
  private readonly musicDir = path.join(process.cwd(), 'attached_assets/music');

  private readonly MAX_CLIPS_AGE_HOURS = 24;
  private readonly MAX_FINAL_VIDEOS_AGE_HOURS = 48;
  private readonly MAX_MUSIC_AGE_HOURS = 72;
  private readonly MAX_TOTAL_SIZE_MB = 500;

  async cleanupAfterUpload(packageId: string, finalVideoPath?: string): Promise<CleanupResult> {
    console.log(`🧹 Cleaning up files for package: ${packageId}`);

    const result: CleanupResult = {
      deletedFiles: [],
      freedBytes: 0,
      errors: [],
    };

    try {
      const clipPattern = new RegExp(`kling_.*\\.mp4$`);
      const musicPattern = new RegExp(`suno_${packageId}.*\\.(mp3|wav)$`);

      const clipsDeleted = await this.deleteMatchingFiles(this.clipDir, clipPattern, packageId);
      result.deletedFiles.push(...clipsDeleted.files);
      result.freedBytes += clipsDeleted.bytes;

      const musicDeleted = await this.deleteMatchingFiles(this.musicDir, musicPattern);
      result.deletedFiles.push(...musicDeleted.files);
      result.freedBytes += musicDeleted.bytes;

      if (finalVideoPath && fs.existsSync(finalVideoPath)) {
        const stats = fs.statSync(finalVideoPath);
        fs.unlinkSync(finalVideoPath);
        result.deletedFiles.push(finalVideoPath);
        result.freedBytes += stats.size;
        console.log(`   🗑️ Deleted final video: ${path.basename(finalVideoPath)}`);
      }

      console.log(
        `✅ Cleanup complete: ${result.deletedFiles.length} files, ${(result.freedBytes / 1024 / 1024).toFixed(1)}MB freed`,
      );
    } catch (error: any) {
      result.errors.push(error.message);
      console.error(`❌ Cleanup error:`, error.message);
    }

    return result;
  }

  async cleanupOldFiles(): Promise<CleanupResult> {
    console.log(`🧹 Running scheduled cleanup of old files...`);

    const result: CleanupResult = {
      deletedFiles: [],
      freedBytes: 0,
      errors: [],
    };

    try {
      const clipsCleaned = await this.deleteOldFiles(this.clipDir, this.MAX_CLIPS_AGE_HOURS);
      result.deletedFiles.push(...clipsCleaned.files);
      result.freedBytes += clipsCleaned.bytes;

      const finalCleaned = await this.deleteOldFiles(this.finalDir, this.MAX_FINAL_VIDEOS_AGE_HOURS);
      result.deletedFiles.push(...finalCleaned.files);
      result.freedBytes += finalCleaned.bytes;

      const rendersCleaned = await this.deleteOldFiles(this.rendersDir, this.MAX_FINAL_VIDEOS_AGE_HOURS);
      result.deletedFiles.push(...rendersCleaned.files);
      result.freedBytes += rendersCleaned.bytes;

      const musicCleaned = await this.deleteOldFiles(this.musicDir, this.MAX_MUSIC_AGE_HOURS);
      result.deletedFiles.push(...musicCleaned.files);
      result.freedBytes += musicCleaned.bytes;

      console.log(
        `✅ Scheduled cleanup: ${result.deletedFiles.length} old files, ${(result.freedBytes / 1024 / 1024).toFixed(1)}MB freed`,
      );
    } catch (error: any) {
      result.errors.push(error.message);
      console.error(`❌ Scheduled cleanup error:`, error.message);
    }

    return result;
  }

  async enforceSizeLimit(): Promise<CleanupResult> {
    const result: CleanupResult = {
      deletedFiles: [],
      freedBytes: 0,
      errors: [],
    };

    try {
      const totalSize = await this.getTotalMediaSize();
      const maxBytes = this.MAX_TOTAL_SIZE_MB * 1024 * 1024;

      if (totalSize > maxBytes) {
        console.log(
          `⚠️ Media size ${(totalSize / 1024 / 1024).toFixed(0)}MB exceeds limit ${this.MAX_TOTAL_SIZE_MB}MB`,
        );

        const allFiles = await this.getAllMediaFiles();
        allFiles.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

        let currentSize = totalSize;
        for (const file of allFiles) {
          if (currentSize <= maxBytes * 0.8) break;

          try {
            fs.unlinkSync(file.path);
            result.deletedFiles.push(file.path);
            result.freedBytes += file.size;
            currentSize -= file.size;
            console.log(`   🗑️ Deleted (size limit): ${path.basename(file.path)}`);
          } catch (err: any) {
            result.errors.push(`Failed to delete ${file.path}: ${err.message}`);
          }
        }

        console.log(`✅ Size enforcement: freed ${(result.freedBytes / 1024 / 1024).toFixed(1)}MB`);
      }
    } catch (error: any) {
      result.errors.push(error.message);
    }

    return result;
  }

  async getStorageStats(): Promise<{
    clips: { count: number; sizeBytes: number };
    final: { count: number; sizeBytes: number };
    music: { count: number; sizeBytes: number };
    total: { count: number; sizeBytes: number };
  }> {
    const clipStats = await this.getDirStats(this.clipDir);
    const finalStats = await this.getDirStats(this.finalDir);
    const musicStats = await this.getDirStats(this.musicDir);

    return {
      clips: clipStats,
      final: finalStats,
      music: musicStats,
      total: {
        count: clipStats.count + finalStats.count + musicStats.count,
        sizeBytes: clipStats.sizeBytes + finalStats.sizeBytes + musicStats.sizeBytes,
      },
    };
  }

  private async deleteMatchingFiles(
    dir: string,
    pattern: RegExp,
    packageId?: string,
  ): Promise<{ files: string[]; bytes: number }> {
    const result = { files: [] as string[], bytes: 0 };

    if (!fs.existsSync(dir)) return result;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (pattern.test(file)) {
        const filePath = path.join(dir, file);
        try {
          const stats = fs.statSync(filePath);
          fs.unlinkSync(filePath);
          result.files.push(filePath);
          result.bytes += stats.size;
          console.log(`   🗑️ Deleted: ${file}`);
        } catch (err) {}
      }
    }

    return result;
  }

  private async deleteOldFiles(dir: string, maxAgeHours: number): Promise<{ files: string[]; bytes: number }> {
    const result = { files: [] as string[], bytes: 0 };

    if (!fs.existsSync(dir)) return result;

    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (file === '.gitkeep') continue;

      const filePath = path.join(dir, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          result.files.push(filePath);
          result.bytes += stats.size;
          console.log(`   🗑️ Deleted old file (${maxAgeHours}h+): ${file}`);
        }
      } catch (err) {}
    }

    return result;
  }

  private async getTotalMediaSize(): Promise<number> {
    let total = 0;
    const dirs = [this.clipDir, this.finalDir, this.rendersDir, this.musicDir];

    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          try {
            const stats = fs.statSync(path.join(dir, file));
            total += stats.size;
          } catch (err) {}
        }
      }
    }

    return total;
  }

  private async getAllMediaFiles(): Promise<FileInfo[]> {
    const files: FileInfo[] = [];
    const dirs = [this.clipDir, this.finalDir, this.rendersDir, this.musicDir];

    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        const dirFiles = fs.readdirSync(dir);
        for (const file of dirFiles) {
          if (file === '.gitkeep') continue;

          try {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            files.push({
              path: filePath,
              size: stats.size,
              createdAt: stats.birthtime,
            });
          } catch (err) {}
        }
      }
    }

    return files;
  }

  private async getDirStats(dir: string): Promise<{ count: number; sizeBytes: number }> {
    const result = { count: 0, sizeBytes: 0 };

    if (!fs.existsSync(dir)) return result;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === '.gitkeep') continue;

      try {
        const stats = fs.statSync(path.join(dir, file));
        result.count++;
        result.sizeBytes += stats.size;
      } catch (err) {}
    }

    return result;
  }
}

export const fileManager = new FileManager();
