import { db } from '../db';
import { videoRotationConfigs, jobs } from '@shared/schema';
import { eq, lt, and, ne, inArray } from 'drizzle-orm';
import { existsSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import { TempPaths } from '../utils/temp-file-manager';

const CLEANUP_AGE_HOURS = 24;

class CleanupService {
  private intervalId: NodeJS.Timeout | null = null;

  async cleanupOldTempFiles(): Promise<{ filesDeleted: number; errors: number }> {
    let filesDeleted = 0;
    let errors = 0;
    const cutoffTime = Date.now() - CLEANUP_AGE_HOURS * 60 * 60 * 1000;

    // Use centralized temp paths - now in data/temp/ directory
    const dirsToClean = [
      TempPaths.processing(),
      TempPaths.thumbnails(),
      TempPaths.clips(),
      TempPaths.errorReports(), // Also clean error reports after 24h
    ];

    for (const dir of dirsToClean) {
      if (!existsSync(dir)) continue;

      try {
        const files = readdirSync(dir);
        for (const file of files) {
          const filePath = join(dir, file);
          try {
            const stats = statSync(filePath);
            if (stats.mtimeMs < cutoffTime) {
              if (stats.isDirectory()) {
                const subFiles = readdirSync(filePath);
                for (const subFile of subFiles) {
                  try {
                    unlinkSync(join(filePath, subFile));
                    filesDeleted++;
                  } catch (e) {
                    errors++;
                  }
                }
                try {
                  rmdirSync(filePath);
                } catch {}
              } else {
                unlinkSync(filePath);
                filesDeleted++;
              }
            }
          } catch (e) {
            errors++;
          }
        }
      } catch (e) {
        console.error(`   ⚠️ Error cleaning ${dir}:`, e);
      }
    }

    return { filesDeleted, errors };
  }

  async archiveCompletedRotations(): Promise<{ archived: number }> {
    const cutoffTime = new Date(Date.now() - CLEANUP_AGE_HOURS * 60 * 60 * 1000);

    const completedRotations = await db
      .select()
      .from(videoRotationConfigs)
      .where(and(eq(videoRotationConfigs.status, 'completed'), lt(videoRotationConfigs.createdAt, cutoffTime)));

    let archived = 0;
    for (const rotation of completedRotations) {
      try {
        if (rotation.thumbnailA && existsSync(rotation.thumbnailA)) {
          try {
            unlinkSync(rotation.thumbnailA);
          } catch {}
        }
        if (rotation.thumbnailB && existsSync(rotation.thumbnailB)) {
          try {
            unlinkSync(rotation.thumbnailB);
          } catch {}
        }

        await db
          .update(videoRotationConfigs)
          .set({
            status: 'archived',
            thumbnailA: null,
            thumbnailB: null,
          })
          .where(eq(videoRotationConfigs.id, rotation.id));

        archived++;
      } catch (e) {
        console.error(`   ⚠️ Error archiving rotation ${rotation.id}:`, e);
      }
    }

    return { archived };
  }

  async cleanupOldJobArtifacts(): Promise<{ jobsCleaned: number }> {
    const cutoffTime = new Date(Date.now() - CLEANUP_AGE_HOURS * 60 * 60 * 1000);

    const oldCompletedJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'completed'), lt(jobs.updatedAt, cutoffTime)));

    let jobsCleaned = 0;
    for (const job of oldCompletedJobs) {
      if ((job as any).savedClips && Array.isArray((job as any).savedClips)) {
        for (const clip of (job as any).savedClips as any[]) {
          if (clip?.path && existsSync(clip.path)) {
            const stats = statSync(clip.path);
            if (stats.mtimeMs < cutoffTime.getTime()) {
              try {
                unlinkSync(clip.path);
                jobsCleaned++;
              } catch {}
            }
          }
        }
      }
    }

    return { jobsCleaned };
  }

  async cleanupOldRenders(): Promise<{ filesDeleted: number; errors: number }> {
    let filesDeleted = 0;
    let errors = 0;
    const cutoffTime = Date.now() - 72 * 60 * 60 * 1000; // 72 hours

    const rendersDir = join(process.cwd(), 'data', 'videos', 'renders');
    if (!existsSync(rendersDir)) return { filesDeleted, errors };

    try {
      const files = readdirSync(rendersDir);
      for (const file of files) {
        const filePath = join(rendersDir, file);
        try {
          const stats = statSync(filePath);
          if (stats.mtimeMs < cutoffTime) {
            if (stats.isDirectory()) {
              const subFiles = readdirSync(filePath);
              for (const subFile of subFiles) {
                try {
                  unlinkSync(join(filePath, subFile));
                  filesDeleted++;
                } catch (e) {
                  errors++;
                }
              }
              try {
                rmdirSync(filePath);
              } catch {}
            } else {
              unlinkSync(filePath);
              filesDeleted++;
            }
          }
        } catch (e) {
          errors++;
        }
      }
    } catch (e) {
      console.error(`   ⚠️ Error cleaning renders dir:`, e);
    }

    return { filesDeleted, errors };
  }

  async cleanupLegacyTmpDirs(): Promise<{ filesDeleted: number; errors: number }> {
    let filesDeleted = 0;
    let errors = 0;
    const cutoffTime = Date.now() - CLEANUP_AGE_HOURS * 60 * 60 * 1000; // 24 hours

    const legacyDirs = ['/tmp/unity-scratch', '/tmp/audio-analysis-cache'];

    for (const dir of legacyDirs) {
      if (!existsSync(dir)) continue;

      try {
        const files = readdirSync(dir);
        for (const file of files) {
          const filePath = join(dir, file);
          try {
            const stats = statSync(filePath);
            if (stats.mtimeMs < cutoffTime) {
              if (stats.isDirectory()) {
                const subFiles = readdirSync(filePath);
                for (const subFile of subFiles) {
                  try {
                    unlinkSync(join(filePath, subFile));
                    filesDeleted++;
                  } catch (e) {
                    errors++;
                  }
                }
                try {
                  rmdirSync(filePath);
                } catch {}
              } else {
                unlinkSync(filePath);
                filesDeleted++;
              }
            }
          } catch (e) {
            errors++;
          }
        }
      } catch (e) {
        console.error(`   ⚠️ Error cleaning ${dir}:`, e);
      }
    }

    return { filesDeleted, errors };
  }

  async runCleanup(): Promise<void> {
    console.log(`\n🧹 [Cleanup] Running 24-hour cleanup...`);

    const tempResult = await this.cleanupOldTempFiles();
    console.log(`   📁 Temp files: ${tempResult.filesDeleted} deleted, ${tempResult.errors} errors`);

    const rendersResult = await this.cleanupOldRenders();
    console.log(`   🎬 Renders (>72h): ${rendersResult.filesDeleted} deleted, ${rendersResult.errors} errors`);

    const legacyResult = await this.cleanupLegacyTmpDirs();
    console.log(`   📂 Legacy tmp dirs: ${legacyResult.filesDeleted} deleted, ${legacyResult.errors} errors`);

    const rotationResult = await this.archiveCompletedRotations();
    console.log(`   📋 A/B rotations: ${rotationResult.archived} archived`);

    const jobResult = await this.cleanupOldJobArtifacts();
    console.log(`   🎬 Job clips: ${jobResult.jobsCleaned} cleaned`);

    console.log(`✅ [Cleanup] Complete`);
  }

  startScheduler(intervalHours: number = 1): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    console.log(`🧹 [Cleanup] Scheduler started (runs every ${intervalHours} hour(s))`);

    this.intervalId = setInterval(() => this.runCleanup(), intervalHours * 60 * 60 * 1000);

    setTimeout(() => this.runCleanup(), 5 * 60 * 1000);
  }

  stopScheduler(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log(`🧹 [Cleanup] Scheduler stopped`);
    }
  }
}

export const cleanupService = new CleanupService();
