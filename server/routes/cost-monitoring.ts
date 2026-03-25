/**
 * Cost Monitoring Routes
 *
 * API endpoints for monitoring and controlling AI API costs
 */

import { Router } from 'express';
import { costGuard } from '../services/cost-guard';
import { apiCostTracker } from '../services/api-cost-tracker';

const router = Router();

/**
 * GET /api/costs/status
 * Get current cost status and limits
 */
router.get('/status', async (req, res) => {
  try {
    const report = await costGuard.getDetailedReport();

    res.json({
      success: true,
      data: {
        spending: report.spending,
        projectedMonthly: report.projectedMonthlySpend,
        topDrivers: report.topCostDrivers,
        limits: {
          daily: 10.0,
          monthly: 200.0,
          perOperation: 2.0,
        },
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/costs/daily
 * Get daily costs breakdown
 */
router.get('/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const dailyCosts = await apiCostTracker.getDailyCosts(days);

    res.json({
      success: true,
      data: dailyCosts,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * GET /api/costs/summary
 * Get cost summary for a period
 */
router.get('/summary', async (req, res) => {
  try {
    const period = (req.query.period as 'today' | 'month' | 'all') || 'month';
    const summary = await apiCostTracker.getCostSummary(period);

    res.json({
      success: true,
      data: summary,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/costs/limits
 * Update cost limits
 */
router.post('/limits', async (req, res) => {
  try {
    const { daily, monthly, perOperation } = req.body;

    costGuard.updateLimits({
      daily: daily ? parseFloat(daily) : undefined,
      monthly: monthly ? parseFloat(monthly) : undefined,
      perOperation: perOperation ? parseFloat(perOperation) : undefined,
    });

    res.json({
      success: true,
      message: 'Cost limits updated successfully',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

/**
 * POST /api/costs/killswitch
 * Activate/deactivate emergency killswitch
 */
router.post('/killswitch', async (req, res) => {
  try {
    const { activate, reason } = req.body;

    if (activate) {
      costGuard.activateEmergencyKillswitch(reason || 'Manual activation');
      res.json({
        success: true,
        message: '🚨 Emergency killswitch activated',
      });
    } else {
      costGuard.deactivateEmergencyKillswitch();
      res.json({
        success: true,
        message: '✅ Emergency killswitch deactivated',
      });
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

export default router;
