/**
 * Cost Guard Service - Prevent API Cost Overruns
 *
 * Provides safeguards to prevent unexpected API cost explosions:
 * 1. Daily/monthly spending limits (lowered: $25/day, $5/day per service)
 * 2. Per-operation cost caps
 * 3. Circuit breaker: 3 consecutive failures → pause service for 30 minutes
 * 4. Discord webhook notifications on blocks/alerts
 * 5. Emergency killswitch for runaway costs
 */

import { db } from '../db';
import { apiUsage } from '@shared/schema';
import { sql } from 'drizzle-orm';

const DISCORD_COST_WEBHOOK =
  'https://discord.com/api/webhooks/1475687414109573180/Wst2y3m0fxqIOJJMT-H1-e1Iz1aS6x-tNLFp1CpjYm4SVl3bQCrxqEQvb6FUfVHxJFm7';

interface CostLimit {
  daily: number;
  monthly: number;
  perOperation: number;
  dailyPerService: {
    openai: number;
    gemini: number;
    claude: number;
    kling: number;
    suno: number;
  };
}

interface CostStatus {
  current: number;
  limit: number;
  percentage: number;
  status: 'SAFE' | 'WARNING' | 'DANGER' | 'EXCEEDED';
}

interface CircuitBreakerState {
  consecutiveFailures: number;
  pausedUntil: Date | null;
  lastFailure: Date | null;
  lastFailureReason: string;
}

type ServiceName = 'openai' | 'gemini' | 'claude' | 'kling' | 'suno';

export class CostGuard {
  private limits: CostLimit = {
    daily: 150.0, // $150/day total
    monthly: 2000.0, // $2000/month total
    perOperation: 15.0,
    dailyPerService: {
      openai: 40.0, // $40/day
      gemini: 40.0, // $40/day
      claude: 40.0, // $40/day
      kling: 20.0, // $20/day
      suno: 20.0, // $20/day
    },
  };

  private emergencyKillswitch = false;

  // Circuit breaker: track consecutive failures per service
  private circuitBreakers: Map<string, CircuitBreakerState> = new Map();
  private static readonly CIRCUIT_BREAKER_THRESHOLD = 3; // failures before pause
  private static readonly CIRCUIT_BREAKER_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

  constructor(customLimits?: Partial<CostLimit>) {
    if (customLimits) {
      this.limits = {
        ...this.limits,
        ...customLimits,
        dailyPerService: {
          ...this.limits.dailyPerService,
          ...(customLimits.dailyPerService || {}),
        },
      };
    }
  }

  /**
   * Record a service failure for circuit breaker tracking
   */
  recordFailure(service: string, reason: string): void {
    const state = this.circuitBreakers.get(service) || {
      consecutiveFailures: 0,
      pausedUntil: null,
      lastFailure: null,
      lastFailureReason: '',
    };

    state.consecutiveFailures++;
    state.lastFailure = new Date();
    state.lastFailureReason = reason;

    if (state.consecutiveFailures >= CostGuard.CIRCUIT_BREAKER_THRESHOLD) {
      state.pausedUntil = new Date(Date.now() + CostGuard.CIRCUIT_BREAKER_COOLDOWN_MS);
      console.error(
        `🔴 [Circuit Breaker] ${service} paused for 30 minutes after ${state.consecutiveFailures} consecutive failures`,
      );
      this.sendDiscordAlert(
        `Circuit Breaker Triggered: ${service.toUpperCase()}`,
        `${state.consecutiveFailures} consecutive failures. Service paused until ${state.pausedUntil.toLocaleTimeString()}.\n\nLast error: ${reason}`,
        0xff0000, // red
      );
    }

    this.circuitBreakers.set(service, state);
  }

  /**
   * Record a service success — resets circuit breaker
   */
  recordSuccess(service: string): void {
    const state = this.circuitBreakers.get(service);
    if (state && state.consecutiveFailures > 0) {
      console.log(`🟢 [Circuit Breaker] ${service} recovered after ${state.consecutiveFailures} failures`);
      this.circuitBreakers.delete(service);
    }
  }

  /**
   * Check if a service is paused by circuit breaker
   */
  isServicePaused(service: string): { paused: boolean; resumesAt?: Date; reason?: string } {
    const state = this.circuitBreakers.get(service);
    if (!state?.pausedUntil) return { paused: false };

    if (new Date() >= state.pausedUntil) {
      // Cooldown expired — reset circuit breaker
      console.log(`🟡 [Circuit Breaker] ${service} cooldown expired, resuming`);
      state.pausedUntil = null;
      state.consecutiveFailures = 0;
      return { paused: false };
    }

    return {
      paused: true,
      resumesAt: state.pausedUntil,
      reason: `Circuit breaker: ${state.consecutiveFailures} consecutive failures. Last: ${state.lastFailureReason}`,
    };
  }

  /**
   * Manually reset a service's circuit breaker (for Discord /start command)
   */
  resetCircuitBreaker(service?: string): void {
    if (service) {
      this.circuitBreakers.delete(service);
      console.log(`🔄 [Circuit Breaker] ${service} manually reset`);
    } else {
      this.circuitBreakers.clear();
      console.log(`🔄 [Circuit Breaker] All circuit breakers manually reset`);
    }
  }

  /**
   * Get circuit breaker status for all services
   */
  getCircuitBreakerStatus(): Record<string, CircuitBreakerState> {
    const status: Record<string, CircuitBreakerState> = {};
    for (const [service, state] of this.circuitBreakers) {
      status[service] = { ...state };
    }
    return status;
  }

  /**
   * Send alert to Discord cost webhook
   */
  private async sendDiscordAlert(title: string, description: string, color: number = 0xffaa00): Promise<void> {
    try {
      await fetch(DISCORD_COST_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title,
              description,
              color,
              timestamp: new Date().toISOString(),
              footer: { text: 'Unity Cost Guard' },
            },
          ],
        }),
      });
    } catch (error) {
      console.error(`[Cost Guard] Failed to send Discord alert: ${error}`);
    }
  }

  /**
   * Check if an operation is allowed based on current spending + circuit breaker
   */
  async canProceed(
    estimatedCost: number,
    operation: string,
    service?: ServiceName,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    currentSpending: {
      daily: CostStatus;
      monthly: CostStatus;
      dailyPerService?: Record<string, CostStatus>;
    };
  }> {
    if (this.emergencyKillswitch) {
      return {
        allowed: false,
        reason: '🚨 EMERGENCY KILLSWITCH ACTIVE - All AI operations halted',
        currentSpending: await this.getCurrentSpending(),
      };
    }

    // Check circuit breaker for the service
    if (service) {
      const cbStatus = this.isServicePaused(service);
      if (cbStatus.paused) {
        return {
          allowed: false,
          reason: `🔴 ${service.toUpperCase()} circuit breaker active — resumes at ${cbStatus.resumesAt?.toLocaleTimeString()}. ${cbStatus.reason}`,
          currentSpending: await this.getCurrentSpending(),
        };
      }
    }

    const currentSpending = await this.getCurrentSpending();

    // Check per-operation limit
    if (estimatedCost > this.limits.perOperation) {
      const reason = `⚠️ Operation cost ($${estimatedCost.toFixed(2)}) exceeds per-operation limit ($${this.limits.perOperation})`;
      this.sendDiscordAlert('Cost Guard: Operation Blocked', `${operation}\n${reason}`, 0xff6600);
      return { allowed: false, reason, currentSpending };
    }

    // Check per-service daily limit
    if (service && currentSpending.dailyPerService) {
      const serviceSpending = currentSpending.dailyPerService[service];
      if (serviceSpending && serviceSpending.status === 'EXCEEDED') {
        const reason = `🚫 ${service.toUpperCase()} daily limit exceeded ($${serviceSpending.current.toFixed(2)} / $${serviceSpending.limit})`;
        this.sendDiscordAlert('Cost Guard: Service Limit Hit', `${operation}\n${reason}`, 0xff0000);
        return { allowed: false, reason, currentSpending };
      }

      if (serviceSpending && serviceSpending.current + estimatedCost > serviceSpending.limit) {
        const reason = `⚠️ This operation would exceed ${service.toUpperCase()} daily limit (Current: $${serviceSpending.current.toFixed(2)}, Est. after: $${(serviceSpending.current + estimatedCost).toFixed(2)}, Limit: $${serviceSpending.limit})`;
        this.sendDiscordAlert('Cost Guard: Service Limit Hit', `${operation}\n${reason}`, 0xff6600);
        return { allowed: false, reason, currentSpending };
      }

      if (serviceSpending && (serviceSpending.status === 'DANGER' || serviceSpending.status === 'WARNING')) {
        console.warn(
          `⚠️ [Cost Guard] ${service.toUpperCase()} spending at ${serviceSpending.percentage.toFixed(1)}% of daily limit`,
        );
      }
    }

    // Check daily limit
    if (currentSpending.daily.status === 'EXCEEDED') {
      const reason = `🚫 Daily limit exceeded ($${currentSpending.daily.current.toFixed(2)} / $${this.limits.daily})`;
      this.sendDiscordAlert('Cost Guard: Daily Limit Hit', reason, 0xff0000);
      return { allowed: false, reason, currentSpending };
    }

    // Check monthly limit
    if (currentSpending.monthly.status === 'EXCEEDED') {
      const reason = `🚫 Monthly limit exceeded ($${currentSpending.monthly.current.toFixed(2)} / $${this.limits.monthly})`;
      this.sendDiscordAlert('Cost Guard: Monthly Limit Hit', reason, 0xff0000);
      return { allowed: false, reason, currentSpending };
    }

    // Check if this operation would push over daily limit
    if (currentSpending.daily.current + estimatedCost > this.limits.daily) {
      const reason = `⚠️ This operation would exceed daily limit (Current: $${currentSpending.daily.current.toFixed(2)}, Est. after: $${(currentSpending.daily.current + estimatedCost).toFixed(2)})`;
      this.sendDiscordAlert('Cost Guard: Daily Limit Hit', `${operation}\n${reason}`, 0xff6600);
      return { allowed: false, reason, currentSpending };
    }

    if (currentSpending.monthly.current + estimatedCost > this.limits.monthly) {
      const reason = `⚠️ This operation would exceed monthly limit (Current: $${currentSpending.monthly.current.toFixed(2)}, Est. after: $${(currentSpending.monthly.current + estimatedCost).toFixed(2)})`;
      this.sendDiscordAlert('Cost Guard: Monthly Limit Hit', `${operation}\n${reason}`, 0xff6600);
      return { allowed: false, reason, currentSpending };
    }

    // Warn if approaching limits
    if (currentSpending.daily.status === 'DANGER' || currentSpending.monthly.status === 'DANGER') {
      console.warn(
        `⚠️ [Cost Guard] Approaching limits - Daily: ${currentSpending.daily.percentage.toFixed(1)}%, Monthly: ${currentSpending.monthly.percentage.toFixed(1)}%`,
      );
    }

    return { allowed: true, currentSpending };
  }

  /**
   * Get current spending status
   */
  async getCurrentSpending(): Promise<{
    daily: CostStatus;
    monthly: CostStatus;
    dailyPerService: Record<string, CostStatus>;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const dailyResult = await db.execute(sql`
      SELECT SUM(CAST(cost AS DECIMAL)) as total
      FROM ${apiUsage}
      WHERE created_at >= ${todayStart.toISOString()}
    `);
    const dailyCost = parseFloat(dailyResult.rows[0]?.total as string) || 0;

    const monthlyResult = await db.execute(sql`
      SELECT SUM(CAST(cost AS DECIMAL)) as total
      FROM ${apiUsage}
      WHERE created_at >= ${monthStart.toISOString()}
    `);
    const monthlyCost = parseFloat(monthlyResult.rows[0]?.total as string) || 0;

    const perServiceResult = await db.execute(sql`
      SELECT
        service,
        SUM(CAST(cost AS DECIMAL)) as total
      FROM ${apiUsage}
      WHERE created_at >= ${todayStart.toISOString()}
      GROUP BY service
    `);

    const dailyPerService: Record<string, CostStatus> = {};
    const services = ['openai', 'gemini', 'claude', 'kling', 'suno'] as const;

    for (const service of services) {
      const row = perServiceResult.rows.find((r: any) => r.service === service);
      const serviceCost = row ? parseFloat(row.total as string) : 0;
      dailyPerService[service] = this.calculateStatus(serviceCost, this.limits.dailyPerService[service]);
    }

    return {
      daily: this.calculateStatus(dailyCost, this.limits.daily),
      monthly: this.calculateStatus(monthlyCost, this.limits.monthly),
      dailyPerService,
    };
  }

  private calculateStatus(current: number, limit: number): CostStatus {
    const percentage = (current / limit) * 100;
    let status: CostStatus['status'];
    if (current >= limit) {
      status = 'EXCEEDED';
    } else if (percentage >= 90) {
      status = 'DANGER';
    } else if (percentage >= 70) {
      status = 'WARNING';
    } else {
      status = 'SAFE';
    }
    return { current, limit, percentage, status };
  }

  activateEmergencyKillswitch(reason: string) {
    this.emergencyKillswitch = true;
    console.error(`🚨🚨🚨 EMERGENCY KILLSWITCH ACTIVATED: ${reason}`);
    this.sendDiscordAlert('EMERGENCY KILLSWITCH ACTIVATED', reason, 0xff0000);
  }

  deactivateEmergencyKillswitch() {
    this.emergencyKillswitch = false;
    console.log(`✅ Emergency killswitch deactivated. AI operations resumed.`);
    this.sendDiscordAlert('Killswitch Deactivated', 'AI operations resumed.', 0x00ff00);
  }

  isKillswitchActive(): boolean {
    return this.emergencyKillswitch;
  }

  updateLimits(newLimits: Partial<CostLimit>) {
    if (newLimits.dailyPerService) {
      this.limits.dailyPerService = { ...this.limits.dailyPerService, ...newLimits.dailyPerService };
    }
    this.limits = { ...this.limits, ...newLimits, dailyPerService: this.limits.dailyPerService };
    console.log(`📊 [Cost Guard] Limits updated:`, this.limits);
  }

  getLimits(): CostLimit {
    return { ...this.limits };
  }

  async getDetailedReport(): Promise<{
    spending: {
      daily: CostStatus;
      monthly: CostStatus;
      dailyPerService: Record<string, CostStatus>;
    };
    topCostDrivers: {
      service: string;
      operation: string;
      cost: number;
      calls: number;
    }[];
    projectedMonthlySpend: number;
    circuitBreakers: Record<string, CircuitBreakerState>;
  }> {
    const spending = await this.getCurrentSpending();

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const topDrivers = await db.execute(sql`
      SELECT
        service,
        operation,
        SUM(CAST(cost AS DECIMAL)) as total_cost,
        COUNT(*) as call_count
      FROM ${apiUsage}
      WHERE created_at >= ${monthStart.toISOString()}
      GROUP BY service, operation
      ORDER BY total_cost DESC
      LIMIT 10
    `);

    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const dayOfMonth = new Date().getDate();
    const avgDailySpend = spending.monthly.current / Math.max(dayOfMonth, 1);
    const projectedMonthlySpend = avgDailySpend * daysInMonth;

    return {
      spending,
      topCostDrivers: topDrivers.rows.map((row: any) => ({
        service: row.service,
        operation: row.operation,
        cost: parseFloat(row.total_cost),
        calls: parseInt(row.call_count),
      })),
      projectedMonthlySpend,
      circuitBreakers: this.getCircuitBreakerStatus(),
    };
  }
}

// Singleton with limits (raised to accommodate multi-job daily runs)
export const costGuard = new CostGuard({
  daily: 150.0, // $150/day total
  monthly: 2000.0, // $2000/month
  perOperation: 15.0,
  dailyPerService: {
    openai: 40.0, // $40/day
    gemini: 40.0, // $40/day
    claude: 40.0, // $40/day
    kling: 20.0, // $20/day
    suno: 20.0, // $20/day
  },
});

// Helper to wrap expensive operations with cost guard
export async function withCostGuard<T>(
  operation: string,
  estimatedCost: number,
  service?: ServiceName | (() => Promise<T>),
  fn?: () => Promise<T>,
): Promise<T> {
  // Handle overload: if service is actually a function, shift parameters
  if (typeof service === 'function') {
    fn = service;
    service = undefined;
  }

  if (!fn) {
    throw new Error('[Cost Guard] No function provided to withCostGuard');
  }

  const check = await costGuard.canProceed(estimatedCost, operation, service as ServiceName | undefined);

  if (!check.allowed) {
    throw new Error(`[Cost Guard] ${check.reason}`);
  }

  if (check.currentSpending.daily.status === 'WARNING' || check.currentSpending.daily.status === 'DANGER') {
    console.warn(`⚠️ [Cost Guard] Daily spending at ${check.currentSpending.daily.percentage.toFixed(1)}%`);
  }

  if (service && typeof service === 'string' && check.currentSpending.dailyPerService) {
    const serviceStatus = check.currentSpending.dailyPerService[service];
    if (serviceStatus && (serviceStatus.status === 'WARNING' || serviceStatus.status === 'DANGER')) {
      console.warn(`⚠️ [Cost Guard] ${service.toUpperCase()} spending at ${serviceStatus.percentage.toFixed(1)}%`);
    }
  }

  return fn();
}
