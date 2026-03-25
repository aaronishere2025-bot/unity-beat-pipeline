/**
 * Batch Checker Service
 *
 * Periodically checks for completed batch jobs and retrieves results.
 * Run this every hour to process completed strategic summaries.
 */

import { checkForCompletedBatches } from './batch-strategic-summary';

class BatchCheckerService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the batch checker (runs every hour)
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ [BatchChecker] Already running');
      return;
    }

    this.isRunning = true;
    console.log('✅ [BatchChecker] Started - checking for completed batches every hour');

    // Check immediately on start
    this.checkNow();

    // Then check every hour
    this.intervalId = setInterval(
      () => {
        this.checkNow();
      },
      60 * 60 * 1000,
    ); // 1 hour
  }

  /**
   * Stop the batch checker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('⏹️ [BatchChecker] Stopped');
    }
  }

  /**
   * Check for completed batches right now
   */
  async checkNow() {
    if (!process.env.GEMINI_API_KEY && !process.env.AI_INTEGRATIONS_GEMINI_API_KEY) {
      console.warn('⚠️ [BatchChecker] GEMINI_API_KEY not set, skipping check');
      return;
    }

    console.log('🔍 [BatchChecker] Checking for completed batches...');

    try {
      await checkForCompletedBatches();
      console.log('✅ [BatchChecker] Check complete');
    } catch (err: any) {
      console.error('❌ [BatchChecker] Error:', err.message);
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.isRunning,
      nextCheck: this.intervalId ? 'Within 1 hour' : 'Not scheduled',
    };
  }
}

export const batchCheckerService = new BatchCheckerService();
