/**
 * AGENT SCHEDULER
 *
 * Coordinates automated execution of agents with FAST LEARNING:
 * - Feedback Loop Orchestrator: Runs every 15 minutes (configurable)
 * - Content Strategy Agent: Runs 3x per day at 9am, 3pm, 9pm CST (configurable)
 *
 * This creates the fully autonomous closed-loop system with rapid adaptation.
 */

import { CronJob } from 'cron';
import { db } from '../db';
import { systemConfiguration } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { systemHealthMonitor } from './system-health-monitor';

class AgentScheduler {
  private orchestratorInterval: NodeJS.Timeout | null = null;
  private contentStrategyJobs: CronJob[] = [];
  private isRunning = false;

  // Balanced defaults: 60-min interval saves ~75% API costs vs 15-min
  private orchestratorIntervalMs = 60 * 60 * 1000; // 60 minutes
  private contentStrategySchedules = [
    '0 9 * * *', // 9:00 AM CST
    '0 15 * * *', // 3:00 PM CST
    '0 21 * * *', // 9:00 PM CST
  ];

  /**
   * Start all automated agent cycles
   */
  async start() {
    if (this.isRunning) {
      console.log('[Agent Scheduler] Already running');
      return;
    }

    console.log('[Agent Scheduler] Starting automated agent cycles (FAST LEARNING MODE)...');

    // Load configuration from database
    await this.loadConfiguration();

    // Start Feedback Loop Orchestrator (runs every 15 min by default)
    this.startOrchestrator();

    // Start Content Strategy Agent (runs 3x per day by default)
    this.startContentStrategy();

    this.isRunning = true;
    console.log('[Agent Scheduler] All agents scheduled and running');
    console.log(`  - Orchestrator: Every ${this.orchestratorIntervalMs / 60000} minutes`);
    console.log(`  - Content Strategy: ${this.contentStrategySchedules.length}x per day`);
  }

  /**
   * Load configuration from database
   */
  private async loadConfiguration() {
    try {
      // Load orchestrator interval
      const orchestratorConfig = await db
        .select()
        .from(systemConfiguration)
        .where(eq(systemConfiguration.key, 'orchestrator.intervalMinutes'))
        .limit(1);

      if (orchestratorConfig[0]?.value) {
        const minutes = orchestratorConfig[0].value.intervalMinutes || 15;
        this.orchestratorIntervalMs = minutes * 60 * 1000;
      }

      // Load content strategy schedules
      const contentStrategyConfig = await db
        .select()
        .from(systemConfiguration)
        .where(eq(systemConfiguration.key, 'contentStrategy.schedules'))
        .limit(1);

      if (contentStrategyConfig[0]?.value) {
        this.contentStrategySchedules = contentStrategyConfig[0].value.schedules || this.contentStrategySchedules;
      }
    } catch (error: any) {
      console.warn('[Agent Scheduler] Could not load config, using defaults:', error.message);
    }
  }

  /**
   * Stop all automated cycles
   */
  stop() {
    console.log('[Agent Scheduler] Stopping all automated agent cycles...');

    if (this.orchestratorInterval) {
      clearInterval(this.orchestratorInterval);
      this.orchestratorInterval = null;
    }

    for (const job of this.contentStrategyJobs) {
      job.stop();
    }
    this.contentStrategyJobs = [];

    this.isRunning = false;
    console.log('[Agent Scheduler] All agents stopped');
  }

  /**
   * Start Feedback Loop Orchestrator (every 15 min by default)
   */
  private startOrchestrator() {
    // Run immediately on startup
    this.runOrchestratorCycle();

    // Then run at configured interval
    this.orchestratorInterval = setInterval(() => {
      this.runOrchestratorCycle();
    }, this.orchestratorIntervalMs);

    console.log(
      `[Agent Scheduler] Feedback Loop Orchestrator scheduled (every ${this.orchestratorIntervalMs / 60000} min)`,
    );
  }

  /**
   * Execute one orchestrator cycle
   */
  private async runOrchestratorCycle() {
    // Record heartbeat for health monitoring
    systemHealthMonitor.recordHeartbeat('agent-scheduler');

    try {
      const { feedbackLoopOrchestrator } = await import('./feedback-loop-orchestrator-agent');

      // Check if enabled
      const status = await feedbackLoopOrchestrator.getStatus();
      if (!status.enabled) {
        console.log('[Agent Scheduler] Orchestrator disabled, skipping cycle');
        return;
      }

      console.log('[Agent Scheduler] Running Feedback Loop Orchestrator cycle...');
      const result = await feedbackLoopOrchestrator.runOrchestrationCycle();

      console.log('[Agent Scheduler] Orchestrator cycle complete:', result.summary);
    } catch (error: any) {
      console.error('[Agent Scheduler] Orchestrator cycle failed:', error.message);
    }
  }

  /**
   * Start Content Strategy Agent (3x per day by default: 9am, 3pm, 9pm CST)
   */
  private startContentStrategy() {
    // Create a cron job for each schedule
    for (const schedule of this.contentStrategySchedules) {
      const job = new CronJob(
        schedule,
        async () => {
          try {
            await this.runContentStrategyCycle();
          } catch (error: any) {
            console.error('[AgentScheduler] Content strategy CronJob error:', error.message);
          }
        },
        null,
        true,
        'America/Chicago', // CST timezone
      );

      this.contentStrategyJobs.push(job);
    }

    console.log(
      `[Agent Scheduler] Content Strategy Agent scheduled (${this.contentStrategySchedules.length}x per day)`,
    );
  }

  /**
   * Execute one content strategy cycle
   */
  private async runContentStrategyCycle() {
    try {
      const { contentStrategyAgent } = await import('./content-strategy-agent');

      console.log('[Agent Scheduler] Running Content Strategy Agent...');

      // Generate plan for tomorrow
      const plan = await contentStrategyAgent.generateDailyPlan();

      console.log(
        `[Agent Scheduler] Content plan generated: ${plan.videos.length} videos, ` +
          `$${plan.totalCost.toFixed(2)} estimated cost`,
      );

      // Optionally auto-execute the plan (disabled by default for safety)
      // Uncomment to enable automatic execution:
      // await contentStrategyAgent.executeDailyPlan(plan.id!);
    } catch (error: any) {
      console.error('[Agent Scheduler] Content strategy cycle failed:', error.message);
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      orchestrator: {
        active: this.orchestratorInterval !== null,
        intervalMinutes: this.orchestratorIntervalMs / 60000,
        intervalMs: this.orchestratorIntervalMs,
      },
      contentStrategy: {
        active: this.contentStrategyJobs.length > 0,
        jobCount: this.contentStrategyJobs.length,
        schedules: this.contentStrategySchedules,
        description: `${this.contentStrategySchedules.length}x per day (9am, 3pm, 9pm CST)`,
      },
    };
  }

  /**
   * Update orchestrator interval dynamically
   */
  async setOrchestratorInterval(minutes: number) {
    console.log(`[Agent Scheduler] Updating orchestrator interval to ${minutes} minutes`);

    this.orchestratorIntervalMs = minutes * 60 * 1000;

    // Restart orchestrator with new interval
    if (this.orchestratorInterval) {
      clearInterval(this.orchestratorInterval);
      this.startOrchestrator();
    }

    // Save to database
    await db
      .insert(systemConfiguration)
      .values({
        key: 'orchestrator.intervalMinutes',
        value: { intervalMinutes: minutes },
        description: 'Feedback Loop Orchestrator run interval in minutes',
        updatedBy: 'agent-scheduler',
      })
      .onConflictDoUpdate({
        target: systemConfiguration.key,
        set: {
          value: { intervalMinutes: minutes },
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Update content strategy schedules dynamically
   */
  async setContentStrategySchedules(schedules: string[]) {
    console.log(`[Agent Scheduler] Updating content strategy to ${schedules.length} schedules per day`);

    this.contentStrategySchedules = schedules;

    // Restart content strategy jobs
    for (const job of this.contentStrategyJobs) {
      job.stop();
    }
    this.contentStrategyJobs = [];

    if (this.isRunning) {
      this.startContentStrategy();
    }

    // Save to database
    await db
      .insert(systemConfiguration)
      .values({
        key: 'contentStrategy.schedules',
        value: { schedules },
        description: 'Content Strategy Agent cron schedules (CST timezone)',
        updatedBy: 'agent-scheduler',
      })
      .onConflictDoUpdate({
        target: systemConfiguration.key,
        set: {
          value: { schedules },
          updatedAt: new Date(),
        },
      });
  }
}

// Export singleton instance
export const agentScheduler = new AgentScheduler();
