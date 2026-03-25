/**
 * Infrastructure Routes
 *
 * System health monitoring, cost tracking validation, auto-fix, error monitoring,
 * alert system, pipeline monitoring, and audit endpoints.
 */

import { Router } from 'express';
import { healthChecker } from '../services/health-checker';
import { systemHealthMonitor } from '../services/system-health-monitor';
import { costTrackingValidator } from '../services/cost-tracking-validator';

const router = Router();

// =============================================================================
// HEALTH CHECK
// =============================================================================

router.get('/health', async (req, res) => {
  const report = await healthChecker.check();
  if (report.overallStatus === 'error') {
    res.status(503).json(report);
  } else {
    res.json(report);
  }
});

// =============================================================================
// SYSTEM HEALTH MONITORING
// =============================================================================

router.get('/health/comprehensive', async (req, res) => {
  try {
    const health = await systemHealthMonitor.getComprehensiveHealth();

    if (health.overallStatus === 'unhealthy') {
      res.status(503).json(health);
    } else if (health.overallStatus === 'degraded') {
      res.status(200).json(health);
    } else {
      res.status(200).json(health);
    }
  } catch (error: any) {
    console.error('[Health] Comprehensive check failed:', error);
    res.status(500).json({
      error: 'Health check failed',
      message: error.message,
    });
  }
});

router.get('/health/summary', async (req, res) => {
  try {
    const health = await systemHealthMonitor.getHealthSummary();
    res.json({
      overallStatus: health.overallStatus,
      summary: health.summary,
      criticalIssues: health.criticalIssues,
      warnings: health.warnings,
      timestamp: health.timestamp,
    });
  } catch (error: any) {
    console.error('[Health] Summary check failed:', error);
    res.status(500).json({
      error: 'Health summary failed',
      message: error.message,
    });
  }
});

router.post('/health/heartbeat/:loopName', (req, res) => {
  try {
    const { loopName } = req.params;
    systemHealthMonitor.recordHeartbeat(loopName);
    res.json({ success: true, loopName, timestamp: new Date() });
  } catch (error: any) {
    console.error('[Health] Heartbeat recording failed:', error);
    res.status(500).json({
      error: 'Heartbeat recording failed',
      message: error.message,
    });
  }
});

// =============================================================================
// COST TRACKING VALIDATION
// =============================================================================

router.get('/costs/validate/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const report = await costTrackingValidator.validateJob(jobId);
    res.json(report);
  } catch (error: any) {
    console.error('[Cost Validator] Job validation failed:', error);
    res.status(500).json({
      error: 'Cost validation failed',
      message: error.message,
    });
  }
});

router.get('/costs/validate-all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const report = await costTrackingValidator.validateAllJobs(limit);
    res.json(report);
  } catch (error: any) {
    console.error('[Cost Validator] System validation failed:', error);
    res.status(500).json({
      error: 'System cost validation failed',
      message: error.message,
    });
  }
});

router.get('/costs/stats', async (req, res) => {
  try {
    const stats = await costTrackingValidator.getSystemStats();
    res.json(stats);
  } catch (error: any) {
    console.error('[Cost Validator] Stats failed:', error);
    res.status(500).json({
      error: 'Cost stats failed',
      message: error.message,
    });
  }
});

// =============================================================================
// AUTO-FIX API ROUTES
// =============================================================================

router.get('/auto-fix/status', async (req, res) => {
  try {
    const { autoFixService } = await import('../services/auto-fix-service');
    const status = autoFixService.getStatus();
    res.json({ success: true, data: status });
  } catch (error: any) {
    console.error('Auto-fix status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/auto-fix/analyze', async (req, res) => {
  try {
    const { autoFixService } = await import('../services/auto-fix-service');
    const result = await autoFixService.analyzeRecentVideos();
    res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Auto-fix analyze error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/auto-fix/modifications', async (req, res) => {
  try {
    const { autoFixService } = await import('../services/auto-fix-service');
    const promptMods = autoFixService.getPromptModifications();
    const visualMods = autoFixService.getVisualModifications();
    res.json({
      success: true,
      data: {
        promptModifications: promptMods,
        visualModifications: visualMods,
        totalActive: promptMods.length,
      },
    });
  } catch (error: any) {
    console.error('Auto-fix modifications error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// PIPELINE HEALTH MONITORING
// =============================================================================

router.get('/monitoring/health', async (req, res) => {
  try {
    const { pipelineMonitoringService } = await import('../services/pipeline-monitoring-service');
    const summary = await pipelineMonitoringService.getHealthSummary();
    res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('Health summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/monitoring/costs', async (req, res) => {
  try {
    const { pipelineMonitoringService } = await import('../services/pipeline-monitoring-service');
    const costs = await pipelineMonitoringService.getAllTimeCosts();
    res.json({ success: true, data: costs });
  } catch (error: any) {
    console.error('Costs summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/monitoring/digest', async (req, res) => {
  try {
    const { pipelineMonitoringService } = await import('../services/pipeline-monitoring-service');
    const dateStr = req.query.date as string | undefined;
    const date = dateStr ? new Date(dateStr) : new Date();
    const digest = await pipelineMonitoringService.generateDailyDigest(date);
    res.json({ success: true, data: { digest, date: date.toDateString() } });
  } catch (error: any) {
    console.error('Daily digest error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/monitoring/costs/period', async (req, res) => {
  try {
    const { pipelineMonitoringService } = await import('../services/pipeline-monitoring-service');
    const days = parseInt(req.query.days as string) || 7;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    const costs = await pipelineMonitoringService.getCostSummary(startDate, endDate);
    res.json({
      success: true,
      data: {
        ...costs,
        period: `${days} days`,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Period costs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// ERROR MONITORING & AUTO-FIX ENDPOINTS
// =============================================================================

router.get('/errors/stats', async (req, res) => {
  try {
    const { errorMonitor } = await import('../services/error-monitor');
    const { autoFixAgent } = await import('../services/auto-fix-agent');

    const errorStats = await errorMonitor.getStats();
    const fixStats = autoFixAgent.getStats();

    res.json({
      success: true,
      data: {
        errors: errorStats,
        fixes: fixStats,
      },
    });
  } catch (error: any) {
    console.error('[Errors] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/errors/recent', async (req, res) => {
  try {
    const { errorMonitor } = await import('../services/error-monitor');
    const limit = parseInt(req.query.limit as string) || 20;

    const errors = errorMonitor.getRecentErrors(limit);

    res.json({
      success: true,
      data: errors,
    });
  } catch (error: any) {
    console.error('[Errors] Recent errors:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/errors/fix/:errorId', async (req, res) => {
  try {
    const { errorId } = req.params;
    const { autoFixAgent } = await import('../services/auto-fix-agent');
    const { errorMonitor } = await import('../services/error-monitor');

    // Find the error
    const errors = errorMonitor.getRecentErrors(100);
    const error = errors.find((e) => e.id === errorId);

    if (!error) {
      return res.status(404).json({
        success: false,
        error: 'Error not found',
      });
    }

    // Trigger fix
    const result = await autoFixAgent.attemptFix(error);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[Errors] Manual fix error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// ALERT SYSTEM ENDPOINTS
// =============================================================================

router.get('/alerts', async (req, res) => {
  try {
    const { alertService } = await import('../services/alert-service');
    const { limit, resolved, severity, type } = req.query;

    const options: any = {};
    if (limit) options.limit = parseInt(limit as string);
    if (resolved !== undefined) options.resolved = resolved === 'true';
    if (severity) options.severity = severity as string;
    if (type) options.type = type as string;

    const alerts = await alertService.getRecentAlerts(options);

    res.json({
      success: true,
      data: alerts,
    });
  } catch (error: any) {
    console.error('[Alerts] Get alerts error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    const { resolvedBy, notes } = req.body;

    if (!resolvedBy) {
      return res.status(400).json({
        success: false,
        error: 'resolvedBy is required',
      });
    }

    const { alertService } = await import('../services/alert-service');
    const result = await alertService.resolveAlert(id, resolvedBy, notes);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    res.json({
      success: true,
      message: 'Alert resolved successfully',
    });
  } catch (error: any) {
    console.error('[Alerts] Resolve alert error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/alerts/stats', async (req, res) => {
  try {
    const { alertService } = await import('../services/alert-service');
    const stats = await alertService.getAlertStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[Alerts] Get stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/alerts/check-conditions', async (req, res) => {
  try {
    const { alertService } = await import('../services/alert-service');

    // Manually trigger condition checks
    await alertService.checkFailureRate();
    await alertService.checkCostOverrun();

    res.json({
      success: true,
      message: 'Alert conditions checked successfully',
    });
  } catch (error: any) {
    console.error('[Alerts] Check conditions error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/alerts/auto-resolve', async (req, res) => {
  try {
    const { alertService } = await import('../services/alert-service');
    await alertService.autoResolveAlerts();

    res.json({
      success: true,
      message: 'Auto-resolution completed',
    });
  } catch (error: any) {
    console.error('[Alerts] Auto-resolve error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================================
// AUDIT ENDPOINTS (Context Contracts)
// =============================================================================

router.get('/audit/contract/:contractId', async (req, res) => {
  try {
    const { contextContractsService } = await import('../services/context-contracts-service');
    const { contractId } = req.params;

    const contract = await contextContractsService.getContract(contractId);

    if (!contract) {
      return res.status(404).json({
        success: false,
        error: `Contract not found: ${contractId}`,
      });
    }

    res.json({
      success: true,
      data: contract,
    });
  } catch (error: any) {
    console.error('📋 [Audit] Get contract error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/audit/package/:packageId', async (req, res) => {
  try {
    const { contextContractsService } = await import('../services/context-contracts-service');
    const { packageId } = req.params;
    const { clipIndex, passed, minQualityScore, model } = req.query;

    const filters: any = { packageId };
    if (clipIndex !== undefined) filters.clipIndex = parseInt(clipIndex as string);
    if (passed !== undefined) filters.passed = passed === 'true';
    if (minQualityScore !== undefined) filters.minQualityScore = parseInt(minQualityScore as string);
    if (model) filters.model = model as string;

    const contracts = await contextContractsService.queryContracts(filters);

    res.json({
      success: true,
      data: {
        packageId,
        totalContracts: contracts.length,
        contracts,
      },
    });
  } catch (error: any) {
    console.error('📋 [Audit] Get package contracts error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/audit/report/:packageId', async (req, res) => {
  try {
    const { contextContractsService } = await import('../services/context-contracts-service');
    const { packageId } = req.params;

    const report = await contextContractsService.generateAuditReport(packageId);

    res.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    console.error('📋 [Audit] Generate report error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/audit/job/:jobId', async (req, res) => {
  try {
    const { contextContractsService } = await import('../services/context-contracts-service');
    const { jobId } = req.params;

    const contracts = await contextContractsService.getContractsForJob(jobId);

    res.json({
      success: true,
      data: {
        jobId,
        totalContracts: contracts.length,
        contracts,
      },
    });
  } catch (error: any) {
    console.error('📋 [Audit] Get job contracts error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/audit/in-progress', async (req, res) => {
  try {
    const { contextContractsService } = await import('../services/context-contracts-service');

    const inProgress = contextContractsService.getInProgressContracts();

    res.json({
      success: true,
      data: {
        count: inProgress.length,
        contracts: inProgress.map((c) => ({
          id: c.id,
          packageId: c.packageId,
          jobId: c.jobId,
          clipIndex: c.clipIndex,
          decisionsCount: c.decisions.length,
          adjustmentsCount: c.appliedAdjustments.length,
          createdAt: c.provenance.createdAt,
          apiCost: c.provenance.apiCost,
          retryCount: c.provenance.retryCount,
        })),
      },
    });
  } catch (error: any) {
    console.error('📋 [Audit] Get in-progress error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
