/**
 * RESILIENT RETRY SERVICE
 *
 * Wraps operations in retry logic that triggers auto-fix on failure.
 * KEY PRINCIPLE: Never cancel the generation - fix and continue.
 *
 * Flow:
 * 1. Try operation
 * 2. If fails → Capture error → Trigger auto-fix
 * 3. Retry operation (up to 3 times)
 * 4. If still failing → Use fallback OR continue degraded
 * 5. NEVER throw errors that cancel the job
 */

import { errorMonitor, type ErrorContext } from './error-monitor';
import { autoFixAgent } from './auto-fix-agent';

// ============================================================================
// TYPES
// ============================================================================

interface RetryOptions {
  maxRetries: number;
  retryDelay: number; // ms
  fallback?: () => Promise<any>; // Fallback function if all retries fail
  continueOnFailure?: boolean; // If true, returns null instead of throwing
  errorContext: Partial<ErrorContext>;
}

interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  retriesUsed: number;
  fixApplied: boolean;
  usedFallback: boolean;
}

// ============================================================================
// RESILIENT RETRY SERVICE
// ============================================================================

class ResilientRetryService {
  /**
   * Execute operation with auto-fix retry logic
   */
  async executeWithRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<RetryResult<T>> {
    let retriesUsed = 0;
    let fixApplied = false;
    let lastError: Error | undefined;

    while (retriesUsed <= options.maxRetries) {
      try {
        console.log(
          `[Resilient Retry] Attempt ${retriesUsed + 1}/${options.maxRetries + 1}: ${options.errorContext.operation}`,
        );

        // Try the operation
        const result = await operation();

        // Success!
        if (retriesUsed > 0) {
          console.log(
            `✅ [Resilient Retry] Operation succeeded after ${retriesUsed} retries (fix applied: ${fixApplied})`,
          );
        }

        return {
          success: true,
          result,
          retriesUsed,
          fixApplied,
          usedFallback: false,
        };
      } catch (error: any) {
        lastError = error;
        retriesUsed++;

        console.error(`❌ [Resilient Retry] Attempt ${retriesUsed}/${options.maxRetries + 1} failed: ${error.message}`);

        // Capture error to error monitor (triggers auto-fix for high/critical)
        const errorReport = await errorMonitor.captureError(error, options.errorContext);

        // If this is the first failure, trigger auto-fix
        if (retriesUsed === 1) {
          console.log(`🔧 [Resilient Retry] Triggering auto-fix for error: ${errorReport.id}`);

          try {
            // Attempt to fix (this runs in background but we'll give it a moment)
            const fixPromise = autoFixAgent.attemptFix(errorReport);

            // Give auto-fix 2 seconds to work, then continue with retry
            await Promise.race([fixPromise, new Promise((resolve) => setTimeout(resolve, 2000))]);

            fixApplied = true;
            console.log(`✅ [Resilient Retry] Auto-fix attempted, retrying operation...`);
          } catch (fixError: any) {
            console.warn(`⚠️ [Resilient Retry] Auto-fix failed: ${fixError.message}`);
          }
        }

        // If we have more retries, wait and try again
        if (retriesUsed <= options.maxRetries) {
          console.log(`⏳ [Resilient Retry] Waiting ${options.retryDelay}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, options.retryDelay));
        }
      }
    }

    // All retries exhausted
    console.error(
      `❌ [Resilient Retry] All ${options.maxRetries + 1} attempts failed for: ${options.errorContext.operation}`,
    );

    // Try fallback if provided
    if (options.fallback) {
      console.log(`🔄 [Resilient Retry] Attempting fallback strategy...`);
      try {
        const fallbackResult = await options.fallback();
        console.log(`✅ [Resilient Retry] Fallback succeeded`);
        return {
          success: true,
          result: fallbackResult,
          retriesUsed,
          fixApplied,
          usedFallback: true,
        };
      } catch (fallbackError: any) {
        console.error(`❌ [Resilient Retry] Fallback failed: ${fallbackError.message}`);
      }
    }

    // If continueOnFailure is true, return graceful failure instead of throwing
    if (options.continueOnFailure) {
      console.warn(
        `⚠️ [Resilient Retry] Continuing with degraded functionality (${options.errorContext.operation} failed)`,
      );
      return {
        success: false,
        error: lastError,
        retriesUsed,
        fixApplied,
        usedFallback: false,
      };
    }

    // Last resort: throw the error
    throw lastError || new Error('Operation failed after all retries');
  }

  /**
   * Execute operation with simple retry (no auto-fix)
   */
  async executeWithSimpleRetry<T>(operation: () => Promise<T>, maxRetries: number, retryDelay: number): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError || new Error('Operation failed after all retries');
  }

  /**
   * Execute operation that should NEVER fail the job
   * Always returns a result (even if null/undefined)
   */
  async executeSafely<T>(
    operation: () => Promise<T>,
    errorContext: Partial<ErrorContext>,
    defaultValue?: T,
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error: any) {
      console.error(`❌ [Resilient Retry] Non-critical operation failed: ${error.message}`);

      // Capture for monitoring but don't retry
      await errorMonitor.captureError(error, errorContext);

      return defaultValue;
    }
  }
}

// Export singleton
export const resilientRetry = new ResilientRetryService();
