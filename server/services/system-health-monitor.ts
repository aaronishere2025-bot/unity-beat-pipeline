import { db } from '../db';
import { jobs, errorReports, apiUsage } from '@shared/schema';
import { eq, and, sql, desc, gte } from 'drizzle-orm';
import axios from 'axios';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * System Health Monitor
 *
 * Monitors 6 categories:
 * 1. Core APIs (OpenAI, Gemini, Claude, Kling, Suno)
 * 2. Background Loops (6 loops with heartbeat tracking)
 * 3. System Resources (disk, memory, CPU)
 * 4. Database Health (connection, recent jobs, long queries)
 * 5. Job Queue Health (queued, processing, stuck jobs, failure rate)
 * 6. Error Monitoring (active errors, critical severity, fix success rate)
 *
 * Usage:
 *   const health = await systemHealthMonitor.getComprehensiveHealth();
 *   console.log(`Overall: ${health.overallStatus}`);
 *   systemHealthMonitor.recordHeartbeat('analytics-polling');
 */

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface APIHealthStatus {
  service: string;
  status: HealthStatus;
  lastSuccessfulCall?: Date;
  recentSuccessRate: number;
  recentCallCount: number;
  averageLatency?: number;
  errorMessage?: string;
}

export interface LoopHealthStatus {
  loopName: string;
  status: HealthStatus;
  lastHeartbeat?: Date;
  timeSinceHeartbeat?: number;
  isRunning: boolean;
  errorMessage?: string;
}

export interface ResourceHealthStatus {
  disk: {
    status: HealthStatus;
    usedPercent: number;
    availableGB: number;
    totalGB: number;
  };
  memory: {
    status: HealthStatus;
    usedPercent: number;
    availableGB: number;
    totalGB: number;
  };
  cpu: {
    status: HealthStatus;
    loadAverage: number[];
    coreCount: number;
  };
}

export interface DatabaseHealthStatus {
  status: HealthStatus;
  connectionOk: boolean;
  recentJobsCount: number;
  oldestPendingJobAge?: number;
  slowQueriesDetected: boolean;
  errorMessage?: string;
}

export interface JobQueueHealthStatus {
  status: HealthStatus;
  queuedJobs: number;
  processingJobs: number;
  stuckJobs: number;
  recentFailureRate: number;
  averageProcessingTime?: number;
  errorMessage?: string;
}

export interface ErrorHealthStatus {
  status: HealthStatus;
  activeErrors: number;
  criticalErrors: number;
  highSeverityErrors: number;
  fixSuccessRate: number;
  errorMessage?: string;
}

export interface ComprehensiveHealthReport {
  timestamp: Date;
  overallStatus: HealthStatus;

  coreAPIs: APIHealthStatus[];
  backgroundLoops: LoopHealthStatus[];
  systemResources: ResourceHealthStatus;
  database: DatabaseHealthStatus;
  jobQueue: JobQueueHealthStatus;
  errorMonitoring: ErrorHealthStatus;

  criticalIssues: string[];
  warnings: string[];

  // Quick stats
  summary: {
    healthyComponents: number;
    degradedComponents: number;
    unhealthyComponents: number;
    totalComponents: number;
  };
}

class SystemHealthMonitor {
  private static instance: SystemHealthMonitor;

  // Heartbeat tracking for background loops
  private loopHeartbeats = new Map<string, number>();

  // Expected background loops (must match actual heartbeat names)
  private readonly EXPECTED_LOOPS = [
    'analytics-polling',
    'agent-scheduler',
    'video-scheduler',
    'beat-scheduler',
    'central-orchestrator',
  ];

  // Health thresholds
  private readonly HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  private readonly DISK_WARNING_PERCENT = 80;
  private readonly DISK_CRITICAL_PERCENT = 90;
  private readonly MEMORY_WARNING_PERCENT = 85;
  private readonly MEMORY_CRITICAL_PERCENT = 95;
  private readonly CPU_WARNING_LOAD = 8.0;
  private readonly CPU_CRITICAL_LOAD = 12.0;
  private readonly JOB_STUCK_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
  private readonly FAILURE_RATE_WARNING = 0.2; // 20%
  private readonly FAILURE_RATE_CRITICAL = 0.5; // 50%

  static getInstance(): SystemHealthMonitor {
    if (!SystemHealthMonitor.instance) {
      SystemHealthMonitor.instance = new SystemHealthMonitor();
    }
    return SystemHealthMonitor.instance;
  }

  /**
   * Record heartbeat from a background loop
   */
  recordHeartbeat(loopName: string): void {
    this.loopHeartbeats.set(loopName, Date.now());
    // console.log(`[Health] Heartbeat recorded: ${loopName}`);
  }

  /**
   * Check health of core API services
   */
  async checkCoreAPIs(): Promise<APIHealthStatus[]> {
    const services = ['openai', 'gemini', 'claude', 'kling', 'suno'];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const results: APIHealthStatus[] = [];

    for (const service of services) {
      try {
        // Get recent API calls (last hour)
        const recentCalls = await db
          .select()
          .from(apiUsage)
          .where(and(eq(apiUsage.service, service), gte(apiUsage.createdAt, oneHourAgo)))
          .orderBy(desc(apiUsage.createdAt))
          .limit(100);

        const totalCalls = recentCalls.length;
        const successfulCalls = recentCalls.filter((r) => r.success).length;
        const successRate = totalCalls > 0 ? successfulCalls / totalCalls : 0;

        const lastSuccessful = recentCalls.find((r) => r.success);
        const lastSuccessfulCall = lastSuccessful?.createdAt;

        let status: HealthStatus = 'healthy';
        let errorMessage: string | undefined;

        if (totalCalls === 0) {
          status = 'degraded';
          errorMessage = 'No API calls in last hour';
        } else if (successRate < 0.5) {
          status = 'unhealthy';
          errorMessage = `Success rate: ${(successRate * 100).toFixed(1)}%`;
        } else if (successRate < 0.8) {
          status = 'degraded';
          errorMessage = `Success rate: ${(successRate * 100).toFixed(1)}%`;
        }

        results.push({
          service,
          status,
          lastSuccessfulCall,
          recentSuccessRate: successRate * 100,
          recentCallCount: totalCalls,
          errorMessage,
        });
      } catch (error: any) {
        results.push({
          service,
          status: 'unhealthy',
          recentSuccessRate: 0,
          recentCallCount: 0,
          errorMessage: `Health check failed: ${error.message}`,
        });
      }
    }

    return results;
  }

  /**
   * Check health of background loops via heartbeat tracking
   */
  async checkBackgroundLoops(): Promise<LoopHealthStatus[]> {
    const now = Date.now();
    const results: LoopHealthStatus[] = [];

    for (const loopName of this.EXPECTED_LOOPS) {
      const lastHeartbeat = this.loopHeartbeats.get(loopName);
      const timeSinceHeartbeat = lastHeartbeat ? now - lastHeartbeat : undefined;

      let status: HealthStatus = 'healthy';
      let isRunning = true;
      let errorMessage: string | undefined;

      if (!lastHeartbeat) {
        status = 'degraded';
        isRunning = false;
        errorMessage = 'No heartbeat recorded yet';
      } else if (timeSinceHeartbeat! > this.HEARTBEAT_TIMEOUT_MS) {
        status = 'unhealthy';
        isRunning = false;
        errorMessage = `No heartbeat for ${Math.floor(timeSinceHeartbeat! / 60000)} minutes`;
      }

      results.push({
        loopName,
        status,
        lastHeartbeat: lastHeartbeat ? new Date(lastHeartbeat) : undefined,
        timeSinceHeartbeat,
        isRunning,
        errorMessage,
      });
    }

    return results;
  }

  /**
   * Check system resources (disk, memory, CPU)
   */
  async checkSystemResources(): Promise<ResourceHealthStatus> {
    let diskStatus: ResourceHealthStatus['disk'] = {
      status: 'healthy',
      usedPercent: 0,
      availableGB: 0,
      totalGB: 0,
    };

    let memoryStatus: ResourceHealthStatus['memory'] = {
      status: 'healthy',
      usedPercent: 0,
      availableGB: 0,
      totalGB: 0,
    };

    let cpuStatus: ResourceHealthStatus['cpu'] = {
      status: 'healthy',
      loadAverage: [0, 0, 0],
      coreCount: 1,
    };

    try {
      // Check disk space
      const dfResult = await execAsync('df -BG /home | tail -n 1');
      const dfParts = dfResult.stdout.trim().split(/\s+/);
      const totalGB = parseInt(dfParts[1].replace('G', ''));
      const usedGB = parseInt(dfParts[2].replace('G', ''));
      const availableGB = parseInt(dfParts[3].replace('G', ''));
      const usedPercent = (usedGB / totalGB) * 100;

      diskStatus = {
        status:
          usedPercent >= this.DISK_CRITICAL_PERCENT
            ? 'unhealthy'
            : usedPercent >= this.DISK_WARNING_PERCENT
              ? 'degraded'
              : 'healthy',
        usedPercent,
        availableGB,
        totalGB,
      };
    } catch (error) {
      console.error('[Health] Failed to check disk space:', error);
    }

    try {
      // Check memory
      const freeResult = await execAsync('free -g | grep Mem');
      const memParts = freeResult.stdout.trim().split(/\s+/);
      const totalGB = parseInt(memParts[1]);
      const usedGB = parseInt(memParts[2]);
      const availableGB = parseInt(memParts[6]); // available column
      const usedPercent = (usedGB / totalGB) * 100;

      memoryStatus = {
        status:
          usedPercent >= this.MEMORY_CRITICAL_PERCENT
            ? 'unhealthy'
            : usedPercent >= this.MEMORY_WARNING_PERCENT
              ? 'degraded'
              : 'healthy',
        usedPercent,
        availableGB,
        totalGB,
      };
    } catch (error) {
      console.error('[Health] Failed to check memory:', error);
    }

    try {
      // Check CPU load
      const uptimeResult = await execAsync('uptime');
      const loadMatch = uptimeResult.stdout.match(/load average: ([\d.]+), ([\d.]+), ([\d.]+)/);
      const loadAverage = loadMatch
        ? [parseFloat(loadMatch[1]), parseFloat(loadMatch[2]), parseFloat(loadMatch[3])]
        : [0, 0, 0];

      const cpuInfoResult = await execAsync('nproc');
      const coreCount = parseInt(cpuInfoResult.stdout.trim());

      const load1min = loadAverage[0];

      cpuStatus = {
        status:
          load1min >= this.CPU_CRITICAL_LOAD ? 'unhealthy' : load1min >= this.CPU_WARNING_LOAD ? 'degraded' : 'healthy',
        loadAverage,
        coreCount,
      };
    } catch (error) {
      console.error('[Health] Failed to check CPU load:', error);
    }

    return {
      disk: diskStatus,
      memory: memoryStatus,
      cpu: cpuStatus,
    };
  }

  /**
   * Check database health
   */
  async checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
    try {
      // Test connection
      await db.execute(sql`SELECT 1`);

      // Count recent jobs (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentJobs = await db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(gte(jobs.createdAt, oneDayAgo));

      const recentJobsCount = Number(recentJobs[0]?.count || 0);

      // Check for old pending jobs
      const oldPendingJobs = await db
        .select()
        .from(jobs)
        .where(eq(jobs.status, 'queued'))
        .orderBy(jobs.createdAt)
        .limit(1);

      const oldestPendingJobAge =
        oldPendingJobs.length > 0 ? Date.now() - oldPendingJobs[0].createdAt.getTime() : undefined;

      let status: HealthStatus = 'healthy';
      let errorMessage: string | undefined;

      if (oldestPendingJobAge && oldestPendingJobAge > 60 * 60 * 1000) {
        status = 'degraded';
        errorMessage = `Oldest queued job: ${Math.floor(oldestPendingJobAge / 60000)} minutes old`;
      }

      return {
        status,
        connectionOk: true,
        recentJobsCount,
        oldestPendingJobAge,
        slowQueriesDetected: false,
        errorMessage,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        connectionOk: false,
        recentJobsCount: 0,
        slowQueriesDetected: false,
        errorMessage: `Database connection failed: ${error.message}`,
      };
    }
  }

  /**
   * Check job queue health
   */
  async checkJobQueueHealth(): Promise<JobQueueHealthStatus> {
    try {
      // Count jobs by status
      const queuedJobs = await db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(eq(jobs.status, 'queued'));

      const processingJobs = await db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(eq(jobs.status, 'processing'));

      const queuedCount = Number(queuedJobs[0]?.count || 0);
      const processingCount = Number(processingJobs[0]?.count || 0);

      // Check for stuck jobs (processing for > 1 hour)
      const oneHourAgo = new Date(Date.now() - this.JOB_STUCK_THRESHOLD_MS);
      const stuckJobsResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(jobs)
        .where(and(eq(jobs.status, 'processing'), sql`${jobs.createdAt} < ${oneHourAgo}`));

      const stuckCount = Number(stuckJobsResult[0]?.count || 0);

      // Calculate recent failure rate (last 100 jobs)
      const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(100);

      const completedOrFailed = recentJobs.filter((j) => j.status === 'completed' || j.status === 'failed');
      const failed = completedOrFailed.filter((j) => j.status === 'failed');
      const failureRate = completedOrFailed.length > 0 ? failed.length / completedOrFailed.length : 0;

      let status: HealthStatus = 'healthy';
      let errorMessage: string | undefined;

      if (stuckCount > 0) {
        status = 'unhealthy';
        errorMessage = `${stuckCount} stuck jobs detected`;
      } else if (failureRate >= this.FAILURE_RATE_CRITICAL) {
        status = 'unhealthy';
        errorMessage = `High failure rate: ${(failureRate * 100).toFixed(1)}%`;
      } else if (failureRate >= this.FAILURE_RATE_WARNING) {
        status = 'degraded';
        errorMessage = `Elevated failure rate: ${(failureRate * 100).toFixed(1)}%`;
      } else if (queuedCount > 50) {
        status = 'degraded';
        errorMessage = `Large queue: ${queuedCount} jobs`;
      }

      return {
        status,
        queuedJobs: queuedCount,
        processingJobs: processingCount,
        stuckJobs: stuckCount,
        recentFailureRate: failureRate * 100,
        errorMessage,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        queuedJobs: 0,
        processingJobs: 0,
        stuckJobs: 0,
        recentFailureRate: 0,
        errorMessage: `Job queue check failed: ${error.message}`,
      };
    }
  }

  /**
   * Check error monitoring health
   */
  async checkErrorMonitoring(): Promise<ErrorHealthStatus> {
    try {
      // Count active errors (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const activeErrors = await db.select().from(errorReports).where(gte(errorReports.firstSeen, oneDayAgo));

      const totalErrors = activeErrors.length;
      const criticalErrors = activeErrors.filter((e) => e.severity === 'critical').length;
      const highErrors = activeErrors.filter((e) => e.severity === 'high').length;

      // Calculate fix success rate (errors marked as resolved)
      const resolvedErrors = activeErrors.filter((e) => e.status === 'resolved').length;
      const fixSuccessRate = totalErrors > 0 ? (resolvedErrors / totalErrors) * 100 : 0;

      let status: HealthStatus = 'healthy';
      let errorMessage: string | undefined;

      if (criticalErrors > 5) {
        status = 'unhealthy';
        errorMessage = `${criticalErrors} critical errors active`;
      } else if (criticalErrors > 0 || highErrors > 10) {
        status = 'degraded';
        errorMessage = `${criticalErrors} critical, ${highErrors} high severity errors`;
      } else if (totalErrors > 50) {
        status = 'degraded';
        errorMessage = `${totalErrors} active errors`;
      }

      return {
        status,
        activeErrors: totalErrors,
        criticalErrors,
        highSeverityErrors: highErrors,
        fixSuccessRate,
        errorMessage,
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        activeErrors: 0,
        criticalErrors: 0,
        highSeverityErrors: 0,
        fixSuccessRate: 0,
        errorMessage: `Error monitoring check failed: ${error.message}`,
      };
    }
  }

  /**
   * Get comprehensive health report for entire system
   */
  async getComprehensiveHealth(): Promise<ComprehensiveHealthReport> {
    const timestamp = new Date();

    // Run all health checks in parallel
    const [coreAPIs, backgroundLoops, systemResources, database, jobQueue, errorMonitoring] = await Promise.all([
      this.checkCoreAPIs(),
      this.checkBackgroundLoops(),
      this.checkSystemResources(),
      this.checkDatabaseHealth(),
      this.checkJobQueueHealth(),
      this.checkErrorMonitoring(),
    ]);

    // Collect critical issues and warnings
    const criticalIssues: string[] = [];
    const warnings: string[] = [];

    // Check core APIs
    for (const api of coreAPIs) {
      if (api.status === 'unhealthy') {
        criticalIssues.push(`API ${api.service}: ${api.errorMessage || 'unhealthy'}`);
      } else if (api.status === 'degraded') {
        warnings.push(`API ${api.service}: ${api.errorMessage || 'degraded'}`);
      }
    }

    // Check background loops
    for (const loop of backgroundLoops) {
      if (loop.status === 'unhealthy') {
        criticalIssues.push(`Loop ${loop.loopName}: ${loop.errorMessage || 'not running'}`);
      } else if (loop.status === 'degraded') {
        warnings.push(`Loop ${loop.loopName}: ${loop.errorMessage || 'degraded'}`);
      }
    }

    // Check system resources
    if (systemResources.disk.status === 'unhealthy') {
      criticalIssues.push(`Disk space critical: ${systemResources.disk.usedPercent.toFixed(1)}% used`);
    } else if (systemResources.disk.status === 'degraded') {
      warnings.push(`Disk space high: ${systemResources.disk.usedPercent.toFixed(1)}% used`);
    }

    if (systemResources.memory.status === 'unhealthy') {
      criticalIssues.push(`Memory critical: ${systemResources.memory.usedPercent.toFixed(1)}% used`);
    } else if (systemResources.memory.status === 'degraded') {
      warnings.push(`Memory high: ${systemResources.memory.usedPercent.toFixed(1)}% used`);
    }

    if (systemResources.cpu.status === 'unhealthy') {
      criticalIssues.push(`CPU load critical: ${systemResources.cpu.loadAverage[0].toFixed(2)}`);
    } else if (systemResources.cpu.status === 'degraded') {
      warnings.push(`CPU load high: ${systemResources.cpu.loadAverage[0].toFixed(2)}`);
    }

    // Check database
    if (database.status === 'unhealthy') {
      criticalIssues.push(`Database: ${database.errorMessage || 'unhealthy'}`);
    } else if (database.status === 'degraded') {
      warnings.push(`Database: ${database.errorMessage || 'degraded'}`);
    }

    // Check job queue
    if (jobQueue.status === 'unhealthy') {
      criticalIssues.push(`Job queue: ${jobQueue.errorMessage || 'unhealthy'}`);
    } else if (jobQueue.status === 'degraded') {
      warnings.push(`Job queue: ${jobQueue.errorMessage || 'degraded'}`);
    }

    // Check error monitoring
    if (errorMonitoring.status === 'unhealthy') {
      criticalIssues.push(`Errors: ${errorMonitoring.errorMessage || 'unhealthy'}`);
    } else if (errorMonitoring.status === 'degraded') {
      warnings.push(`Errors: ${errorMonitoring.errorMessage || 'degraded'}`);
    }

    // Calculate overall status
    const allStatuses = [
      ...coreAPIs.map((a) => a.status),
      ...backgroundLoops.map((l) => l.status),
      systemResources.disk.status,
      systemResources.memory.status,
      systemResources.cpu.status,
      database.status,
      jobQueue.status,
      errorMonitoring.status,
    ];

    const healthyCount = allStatuses.filter((s) => s === 'healthy').length;
    const degradedCount = allStatuses.filter((s) => s === 'degraded').length;
    const unhealthyCount = allStatuses.filter((s) => s === 'unhealthy').length;

    let overallStatus: HealthStatus = 'healthy';
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    return {
      timestamp,
      overallStatus,
      coreAPIs,
      backgroundLoops,
      systemResources,
      database,
      jobQueue,
      errorMonitoring,
      criticalIssues,
      warnings,
      summary: {
        healthyComponents: healthyCount,
        degradedComponents: degradedCount,
        unhealthyComponents: unhealthyCount,
        totalComponents: allStatuses.length,
      },
    };
  }

  /**
   * Record successful API call (for tracking)
   */
  recordAPISuccess(apiName: string): void {
    // This is tracked automatically via api-cost-tracker
    // This method exists for explicit heartbeat-style tracking if needed
    console.log(`[Health] API success: ${apiName}`);
  }

  /**
   * Record API error (for tracking)
   */
  recordAPIError(apiName: string, errorMessage: string): void {
    // This is tracked automatically via api-cost-tracker and error-monitor
    // This method exists for explicit error tracking if needed
    console.warn(`[Health] API error (${apiName}): ${errorMessage}`);
  }

  /**
   * Get quick summary without full health check (for fast API responses)
   */
  async getQuickSummary(): Promise<{ status: string; criticalCount: number }> {
    // Use cached health report if available
    const now = Date.now();
    if (this.cachedHealthReport && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return {
        status: this.cachedHealthReport.overallStatus,
        criticalCount: this.cachedHealthReport.criticalIssues.length,
      };
    }

    // Otherwise, run quick checks (just database and loops)
    try {
      const [database, loops] = await Promise.all([this.checkDatabaseHealth(), this.checkBackgroundLoops()]);

      const criticalCount =
        (database.status === 'unhealthy' ? 1 : 0) + loops.filter((l) => l.status === 'unhealthy').length;

      const status = criticalCount > 0 ? 'unhealthy' : 'healthy';

      return { status, criticalCount };
    } catch (error: any) {
      return { status: 'unhealthy', criticalCount: 1 };
    }
  }

  /**
   * Get quick health summary (cached version, faster)
   */
  private cachedHealthReport: ComprehensiveHealthReport | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 30 * 1000; // 30 seconds

  async getHealthSummary(): Promise<ComprehensiveHealthReport> {
    const now = Date.now();
    if (this.cachedHealthReport && now - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cachedHealthReport;
    }

    const report = await this.getComprehensiveHealth();
    this.cachedHealthReport = report;
    this.cacheTimestamp = now;
    return report;
  }
}

export const systemHealthMonitor = SystemHealthMonitor.getInstance();
