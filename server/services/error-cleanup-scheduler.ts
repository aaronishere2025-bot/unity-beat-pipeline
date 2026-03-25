/**
 * ERROR CLEANUP SCHEDULER
 *
 * Automatically cleans up old resolved error reports from the database
 * Runs daily at 3:00 AM to clean errors resolved > 30 days ago
 */

import { CronJob } from 'cron';

class ErrorCleanupScheduler {
  private cleanupJob: CronJob | null = null;
  private isRunning = false;

  /**
   * Start automated cleanup
   */
  async start() {
    if (this.isRunning) {
      console.log('[Error Cleanup Scheduler] Already running');
      return;
    }

    console.log('[Error Cleanup Scheduler] Starting automated cleanup...');

    // Run daily at 3:00 AM
    this.cleanupJob = new CronJob(
      '0 3 * * *', // 3:00 AM every day
      async () => {
        await this.runCleanup();
      },
      null,
      true,
      'America/Chicago',
    );

    this.isRunning = true;
    console.log('[Error Cleanup Scheduler] Scheduled daily cleanup at 3:00 AM CST');
  }

  /**
   * Stop automated cleanup
   */
  stop() {
    if (this.cleanupJob) {
      this.cleanupJob.stop();
      this.cleanupJob = null;
    }
    this.isRunning = false;
    console.log('[Error Cleanup Scheduler] Stopped');
  }

  /**
   * Run cleanup manually
   */
  async runCleanup() {
    try {
      console.log('[Error Cleanup Scheduler] Running cleanup...');

      const { claudeCodeErrorReporter } = await import('./claude-code-error-reporter');

      // Delete resolved errors older than 30 days
      const deletedCount = await claudeCodeErrorReporter.clearOldReports(30);

      console.log(`[Error Cleanup Scheduler] ✓ Deleted ${deletedCount} old resolved errors`);

      return {
        success: true,
        deletedCount,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error('[Error Cleanup Scheduler] Cleanup failed:', error.message);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      nextRun: this.cleanupJob ? this.cleanupJob.nextDate().toISO() : null,
    };
  }
}

// Export singleton
export const errorCleanupScheduler = new ErrorCleanupScheduler();
