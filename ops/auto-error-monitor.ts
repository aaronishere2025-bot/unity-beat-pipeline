#!/usr/bin/env tsx
/**
 * Automatic Error Monitor
 * Continuously watches for job failures and triggers auto-analysis + fixes
 */

import { db } from './server/db.js';
import { jobs, errorReports } from '@shared/schema';
import { eq, and, gt, lt } from 'drizzle-orm';
import { autoFixAgent } from './server/services/auto-fix-agent.js';
import { multiModelErrorAnalyzer } from './server/services/multi-model-error-analyzer.js';
import { errorMonitor } from './server/services/error-monitor.js';

const CHECK_INTERVAL = 30000; // 30 seconds
const MONITORED_JOBS = new Set<string>(); // Track which jobs we've already analyzed

async function checkForErrors() {
  try {
    // Find recently failed jobs that haven't been analyzed yet
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const failedJobs = await db
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.status, 'failed'),
          gt(jobs.updated_at, fiveMinutesAgo), // Only recent failures
        ),
      )
      .limit(10);

    for (const job of failedJobs) {
      if (MONITORED_JOBS.has(job.id)) {
        continue; // Already analyzed this job
      }

      console.log('\n🚨 ERROR DETECTED!');
      console.log(`Job ID: ${job.id}`);
      console.log(`Mode: ${job.mode}`);
      console.log(`Error: ${job.error?.substring(0, 200) || 'Unknown error'}`);
      console.log('\n⚙️ Starting automatic troubleshooting...\n');

      MONITORED_JOBS.add(job.id);

      try {
        // 1. Capture error context
        await errorMonitor.captureError({
          type: 'job_failure',
          message: job.error || 'Job failed without error message',
          context: {
            jobId: job.id,
            mode: job.mode,
            stage: job.currentStep || 'unknown',
            scriptName: job.scriptName,
            prompts: job.prompts,
          },
          severity: 'high',
        });

        // 2. Run multi-model error analysis
        console.log('🤖 Analyzing error with GPT-4o, Gemini, and Claude...');
        const analysis = await multiModelErrorAnalyzer.analyzeError(job.error || 'Job failed', {
          jobId: job.id,
          mode: job.mode,
          currentStep: job.currentStep,
          recentLogs: job.error,
        });

        console.log(`\n✅ Analysis complete!`);
        console.log(`Consensus: ${analysis.consensusFix || analysis.fixes[0]?.fix || 'No fix found'}`);
        console.log(`Confidence: ${analysis.confidence}%`);

        // 3. Attempt auto-fix if confidence is high
        if (analysis.confidence >= 70) {
          console.log('\n🔧 Attempting automatic fix...');
          const fixResult = await autoFixAgent.attemptFix(job.id);

          if (fixResult.applied) {
            console.log(`✅ AUTO-FIX APPLIED: ${fixResult.pattern?.name}`);
            console.log(`   Solution: ${fixResult.pattern?.fixStrategy}`);

            // Retry the job
            await db
              .update(jobs)
              .set({
                status: 'queued',
                error: null,
                currentStep: 'Retrying after auto-fix',
                retryCount: (job.retryCount || 0) + 1,
              })
              .where(eq(jobs.id, job.id));

            console.log('🔄 Job requeued for retry\n');
          } else {
            console.log('⚠️ No automatic fix available - manual intervention needed');
            console.log(`   Check error report at: /tmp/claude-code-error-reports/error-${job.id}.json\n`);
          }
        } else {
          console.log(`⚠️ Confidence too low (${analysis.confidence}%) - skipping auto-fix`);
          console.log('   Error logged for manual review\n');
        }
      } catch (analyzerError) {
        console.error('❌ Error during analysis:', analyzerError);
      }
    }

    // Check for stuck jobs (processing for >30 minutes)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const stuckJobs = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.status, 'processing'), lt(jobs.updated_at, thirtyMinutesAgo)))
      .limit(5);

    for (const job of stuckJobs) {
      if (MONITORED_JOBS.has(job.id)) {
        continue;
      }

      console.log('\n⏱️ STUCK JOB DETECTED!');
      console.log(`Job ID: ${job.id}`);
      console.log(`Current Step: ${job.currentStep || 'unknown'}`);
      console.log(`Last Update: ${job.updated_at}`);
      console.log('   Marking as failed for analysis...\n');

      MONITORED_JOBS.add(job.id);

      await db
        .update(jobs)
        .set({
          status: 'failed',
          error: `Job stuck at step: ${job.currentStep}. No progress for >30 minutes.`,
        })
        .where(eq(jobs.id, job.id));
    }
  } catch (error) {
    console.error('❌ Monitor error:', error);
  }
}

async function main() {
  console.log('🔍 AUTO ERROR MONITOR STARTED');
  console.log('   Checking for failures every 30 seconds...');
  console.log('   Will auto-analyze and fix errors as they occur');
  console.log('   Press Ctrl+C to stop\n');

  // Initial check
  await checkForErrors();

  // Continuous monitoring
  setInterval(async () => {
    await checkForErrors();
  }, CHECK_INTERVAL);
}

main().catch(console.error);
