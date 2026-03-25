/**
 * SUNO TASK SERVICE
 *
 * Handles persistent Suno music generation with:
 * - Task creation and tracking in database
 * - Polling for completion with heartbeat updates
 * - Audio download and analysis on completion
 * - Resume pending tasks on server restart
 */

import { db } from '../db';
import { sunoTasks, SunoTask, InsertSunoTask } from '@shared/schema';
import { sunoApi } from './suno-api';
import { audioAnalysisService } from './audio-analysis-service';
import { acousticFingerprintService } from './acoustic-fingerprint-service';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import axios from 'axios';
import { eq, inArray, and, or, lt } from 'drizzle-orm';

const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_POLL_DURATION_MS = 5 * 60 * 1000; // 5 minutes

class SunoTaskService {
  private activePollers: Map<string, boolean> = new Map();

  /**
   * Create a new SunoTask record in database when Suno generation starts
   */
  async createTask(params: {
    packageId: string;
    jobId?: string;
    taskId: string;
    figure?: string;
    lyrics?: string;
    styleTags?: string;
  }): Promise<SunoTask> {
    console.log(`🎵 [SunoTaskService] Creating task: ${params.taskId} for package ${params.packageId}`);

    const insertData: InsertSunoTask = {
      packageId: params.packageId,
      jobId: params.jobId || null,
      taskId: params.taskId,
      status: 'pending',
      figure: params.figure || null,
      lyrics: params.lyrics || null,
      styleTags: params.styleTags || null,
      retryCount: 0,
    };

    const [task] = await db.insert(sunoTasks).values(insertData).returning();
    console.log(`   ✅ Task created with id: ${task.id}`);

    return task;
  }

  /**
   * Poll a Suno task until completion or failure
   * Updates lastHeartbeat in database each poll
   * On complete: download audio, run analysis, update record
   * On failure: update status='failed' with error message
   */
  async pollTask(taskId: string): Promise<SunoTask | null> {
    console.log(`🎵 [SunoTaskService] Starting poll for task: ${taskId}`);

    // Prevent duplicate pollers for same task (in-memory check)
    if (this.activePollers.get(taskId)) {
      console.log(`   ⚠️ Already polling task ${taskId}, skipping duplicate`);
      const existing = await this.getTaskByTaskId(taskId);
      return existing;
    }

    // Atomically acquire lock by updating status to 'polling'
    // This prevents race conditions after server restart
    // Also reclaim stale 'polling' tasks (no heartbeat for 2+ minutes)
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

    const [lockedTask] = await db
      .update(sunoTasks)
      .set({ status: 'polling', lastHeartbeat: new Date() })
      .where(
        and(
          eq(sunoTasks.taskId, taskId),
          or(
            inArray(sunoTasks.status, ['pending', 'downloading']),
            and(eq(sunoTasks.status, 'polling'), lt(sunoTasks.lastHeartbeat, staleThreshold)),
          ),
        ),
      )
      .returning();

    if (!lockedTask) {
      console.log(`   ⚠️ Task ${taskId} already being polled or completed, skipping`);
      return this.getTaskByTaskId(taskId);
    }

    this.activePollers.set(taskId, true);
    const startTime = Date.now();

    try {
      while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
        // Update heartbeat
        await db.update(sunoTasks).set({ lastHeartbeat: new Date() }).where(eq(sunoTasks.taskId, taskId));

        // Check Suno API status
        const status = await sunoApi.getTaskStatus(taskId);
        console.log(`   🎵 Suno status for ${taskId}: ${status.status}`);

        if (status.status === 'complete' && status.tracks.length > 0) {
          const track = status.tracks[0];

          // Update status to downloading
          await db
            .update(sunoTasks)
            .set({ status: 'downloading', lastHeartbeat: new Date() })
            .where(eq(sunoTasks.taskId, taskId));

          // Download audio file
          const audioDir = join(process.cwd(), 'attached_assets', 'suno_audio');
          if (!existsSync(audioDir)) {
            mkdirSync(audioDir, { recursive: true });
          }

          const filename = `suno_${Date.now()}_${Math.random().toString(36).substr(2, 6)}.mp3`;
          const localPath = join(audioDir, filename);

          const audioUrl = track.audioUrl || track.sourceAudioUrl;
          if (audioUrl) {
            const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
            writeFileSync(localPath, Buffer.from(response.data));

            console.log(`   ✅ Suno audio saved: ${filename} (${track.duration}s)`);

            const audioFilePath = `/attached_assets/suno_audio/${filename}`;
            const duration = track.duration || 60;

            // Run audio analysis
            let audioAnalysis = null;
            const [taskRecord] = await db.select().from(sunoTasks).where(eq(sunoTasks.taskId, taskId)).limit(1);
            const lyrics = taskRecord?.lyrics;

            if (lyrics && lyrics.trim().length > 0) {
              try {
                console.log(`   🎵 Running Librosa analysis with Demucs vocal isolation...`);
                const analysisResult = await audioAnalysisService.analyzeAudio(localPath, lyrics);
                if (analysisResult.success && analysisResult.analysis) {
                  audioAnalysis = {
                    bpm: analysisResult.analysis.bpm,
                    beats: analysisResult.analysis.beats,
                    duration: analysisResult.analysis.duration,
                    energySamples: analysisResult.analysis.energySamples,
                    forcedAlignment: analysisResult.analysis.forcedAlignment,
                  };
                  console.log(
                    `   ✅ Librosa analysis complete: BPM=${audioAnalysis.bpm}, ${audioAnalysis.beats?.length || 0} beats`,
                  );
                  if (audioAnalysis.forcedAlignment?.length) {
                    console.log(
                      `   🎯 Forced alignment: ${audioAnalysis.forcedAlignment.length} words aligned for subtitles`,
                    );
                  }
                }
              } catch (analysisError: any) {
                console.warn(`   ⚠️ Librosa analysis failed (non-blocking): ${analysisError.message}`);
              }
            } else {
              console.log(`   ℹ️ Skipping Librosa analysis - no lyrics provided`);
            }

            // Extract acoustic fingerprint
            let acousticFingerprint = null;
            try {
              console.log(`   🧬 Extracting acoustic fingerprint...`);
              const fingerprint = await acousticFingerprintService.extractFingerprint(localPath);
              if (fingerprint) {
                acousticFingerprint = {
                  bpm: fingerprint.bpm,
                  predicted_hook_survival: fingerprint.predicted_hook_survival,
                  dna_scores: fingerprint.dna_scores,
                };
                console.log(
                  `   ✅ Fingerprint: BPM=${fingerprint.bpm}, Hook Survival=${(fingerprint.predicted_hook_survival * 100).toFixed(0)}%`,
                );
              }
            } catch (fpError: any) {
              console.warn(`   ⚠️ Fingerprint extraction failed (non-blocking): ${fpError.message}`);
            }

            // Update database with completed data
            const [completedTask] = await db
              .update(sunoTasks)
              .set({
                status: 'completed',
                audioFilePath,
                duration,
                audioAnalysis,
                acousticFingerprint,
                completedAt: new Date(),
                lastHeartbeat: new Date(),
              })
              .where(eq(sunoTasks.taskId, taskId))
              .returning();

            console.log(`   ✅ Task ${taskId} completed successfully`);
            this.activePollers.delete(taskId);
            return completedTask;
          }
        } else if (status.status === 'failed') {
          console.error(`   ❌ Suno generation failed for task ${taskId}`);

          const [failedTask] = await db
            .update(sunoTasks)
            .set({
              status: 'failed',
              errorMessage: 'Suno generation failed',
              lastHeartbeat: new Date(),
            })
            .where(eq(sunoTasks.taskId, taskId))
            .returning();

          this.activePollers.delete(taskId);
          return failedTask;
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // Timeout reached - mark as pending for later retry instead of failed
      console.warn(`   ⚠️ Suno generation timed out for task ${taskId}, will retry later`);

      const currentTask = await this.getTaskByTaskId(taskId);
      const retryCount = (currentTask?.retryCount || 0) + 1;

      if (retryCount >= 5) {
        // Too many retries, mark as failed
        const [failedTask] = await db
          .update(sunoTasks)
          .set({
            status: 'failed',
            errorMessage: 'Max retries exceeded after polling timeouts',
            retryCount,
            lastHeartbeat: new Date(),
          })
          .where(eq(sunoTasks.taskId, taskId))
          .returning();

        this.activePollers.delete(taskId);
        return failedTask;
      } else {
        // Mark as pending for later retry
        await db
          .update(sunoTasks)
          .set({
            status: 'pending',
            retryCount,
            lastHeartbeat: new Date(),
          })
          .where(eq(sunoTasks.taskId, taskId));

        this.activePollers.delete(taskId);

        // Immediately re-queue polling to avoid gaps
        console.log(`   🔄 Re-queueing task ${taskId} for continued polling...`);
        setImmediate(() => {
          this.pollTask(taskId).catch((err) => {
            console.warn(`   ⚠️ Re-queued poll failed: ${err.message}`);
          });
        });

        return null;
      }
    } catch (error: any) {
      console.error(`   ❌ Error polling task ${taskId}: ${error.message}`);

      // Update retry count and potentially fail
      const [currentTask] = await db.select().from(sunoTasks).where(eq(sunoTasks.taskId, taskId)).limit(1);
      const retryCount = (currentTask?.retryCount || 0) + 1;

      if (retryCount >= 3) {
        const [failedTask] = await db
          .update(sunoTasks)
          .set({
            status: 'failed',
            errorMessage: error.message,
            retryCount,
            lastHeartbeat: new Date(),
          })
          .where(eq(sunoTasks.taskId, taskId))
          .returning();

        this.activePollers.delete(taskId);
        return failedTask;
      } else {
        await db.update(sunoTasks).set({ retryCount, lastHeartbeat: new Date() }).where(eq(sunoTasks.taskId, taskId));

        this.activePollers.delete(taskId);
        return null;
      }
    }
  }

  /**
   * Resume pending tasks on server startup
   * Resume 'pending', 'downloading', and stale 'polling' tasks
   * (stale = no heartbeat for 2+ minutes, indicating crashed poller)
   * Resume polling in background (don't block startup)
   */
  async resumePendingTasks(): Promise<void> {
    console.log(`🎵 [SunoTaskService] Checking for pending tasks to resume...`);

    try {
      // Resume 'pending', 'downloading', and stale 'polling' tasks
      const staleThreshold = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

      const pendingTasks = await db
        .select()
        .from(sunoTasks)
        .where(
          or(
            inArray(sunoTasks.status, ['pending', 'downloading']),
            and(eq(sunoTasks.status, 'polling'), lt(sunoTasks.lastHeartbeat, staleThreshold)),
          ),
        );

      if (pendingTasks.length === 0) {
        console.log(`   ℹ️ No pending Suno tasks to resume`);
        return;
      }

      console.log(`   🔄 Found ${pendingTasks.length} pending Suno task(s) to resume:`);

      for (const task of pendingTasks) {
        console.log(`      - Task ${task.taskId} (package: ${task.packageId}, status: ${task.status})`);

        // Resume polling in background (don't await)
        this.pollTask(task.taskId)
          .then((result) => {
            if (result) {
              console.log(`   ✅ Resumed task ${task.taskId} completed with status: ${result.status}`);
            } else {
              console.log(`   ⚠️ Resumed task ${task.taskId} returned null`);
            }
          })
          .catch((err) => {
            console.error(`   ❌ Error resuming task ${task.taskId}: ${err.message}`);
          });
      }

      console.log(`   🚀 ${pendingTasks.length} task(s) resumed in background`);
    } catch (error: any) {
      console.error(`   ❌ Error resuming pending tasks: ${error.message}`);
    }
  }

  /**
   * Get the Suno task for a package
   */
  async getTaskByPackageId(packageId: string): Promise<SunoTask | null> {
    const [task] = await db.select().from(sunoTasks).where(eq(sunoTasks.packageId, packageId)).limit(1);

    return task || null;
  }

  /**
   * Get the Suno task for a job
   */
  async getTaskByJobId(jobId: string): Promise<SunoTask | null> {
    const [task] = await db.select().from(sunoTasks).where(eq(sunoTasks.jobId, jobId)).limit(1);

    return task || null;
  }

  /**
   * Wait for a Suno task to complete without triggering polling
   * Use this when you want to wait for completion handled by another process
   * This prevents duplicate polls by just checking DB status
   */
  async awaitTaskCompletion(packageId: string, timeoutMs: number = 30 * 60 * 1000): Promise<SunoTask | null> {
    // 30 minute timeout to accommodate up to 5 retries × 5 minutes each plus buffer
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    console.log(
      `🎵 [SunoTaskService] Awaiting task completion for package: ${packageId} (max ${timeoutMs / 60000} min)`,
    );

    while (Date.now() - startTime < timeoutMs) {
      const task = await this.getTaskByPackageId(packageId);

      if (!task) {
        console.log(`   ℹ️ No Suno task found for package ${packageId}`);
        return null;
      }

      if (task.status === 'completed') {
        console.log(`   ✅ Task completed for package ${packageId}`);
        return task;
      }

      if (task.status === 'failed') {
        console.warn(`   ⚠️ Suno task failed: ${task.errorMessage}`);
        return task;
      }

      // If task is stuck in 'pending' for 30+ seconds, trigger re-poll
      if (task.status === 'pending') {
        const staleThreshold = new Date(Date.now() - 30 * 1000); // 30 seconds
        if (task.lastHeartbeat && task.lastHeartbeat < staleThreshold) {
          console.log(`   🔄 Task ${task.taskId} stuck in pending, triggering re-poll...`);
          // Trigger polling in background (don't await to avoid blocking)
          this.pollTask(task.taskId).catch((err) => {
            console.warn(`   ⚠️ Re-poll failed: ${err.message}`);
          });
        }
      }

      // Task still pending/polling/downloading - wait and check again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    console.warn(`   ⚠️ Timeout waiting for Suno task completion for package ${packageId}`);
    return null;
  }

  /**
   * Get task by Suno task ID
   */
  private async getTaskByTaskId(taskId: string): Promise<SunoTask | null> {
    const [task] = await db.select().from(sunoTasks).where(eq(sunoTasks.taskId, taskId)).limit(1);

    return task || null;
  }
}

export const sunoTaskService = new SunoTaskService();
