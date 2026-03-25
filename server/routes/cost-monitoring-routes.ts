/**
 * Cost Monitoring & Optimization Routes
 *
 * API endpoints for cost tracking, batch API management, and savings reports.
 */

import { Router } from 'express';
import { costMonitoringService } from '../services/cost-monitoring-service';
import { batchCheckerService } from '../services/batch-checker-service';
import { scheduleDailyBatchSummary, checkForCompletedBatches } from '../services/batch-strategic-summary';

const router = Router();

/**
 * GET /api/costs/summary
 * Get current cost summary (today, this week, this month)
 */
router.get('/summary', async (req, res) => {
  try {
    const summary = await costMonitoringService.getCostSummary();
    res.json(summary);
  } catch (err: any) {
    console.error('Error getting cost summary:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/costs/savings
 * Get savings report showing optimizations and potential savings
 */
router.get('/savings', async (req, res) => {
  try {
    const report = await costMonitoringService.getSavingsReport();
    res.json(report);
  } catch (err: any) {
    console.error('Error getting savings report:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/costs/alerts
 * Check for spending alerts (approaching limits)
 */
router.get('/alerts', async (req, res) => {
  try {
    const alerts = await costMonitoringService.checkSpendingAlerts();
    res.json(alerts);
  } catch (err: any) {
    console.error('Error checking alerts:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/costs/trend
 * Get daily cost trend for the last 7 days
 */
router.get('/trend', async (req, res) => {
  try {
    const trend = await costMonitoringService.getDailyTrend();
    res.json(trend);
  } catch (err: any) {
    console.error('Error getting cost trend:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/batch/strategic-summary
 * Submit strategic summary as batch job (50% cost savings)
 */
router.post('/strategic-summary', async (req, res) => {
  try {
    const { rawData } = req.body;

    if (!rawData) {
      return res.status(400).json({ error: 'rawData is required' });
    }

    const batchId = await scheduleDailyBatchSummary(rawData);

    res.json({
      success: true,
      batchId,
      message: 'Batch job submitted. Check back in 4-12 hours for results.',
      estimatedCost: 1.5,
      savings: '50% vs synchronous',
    });
  } catch (err: any) {
    console.error('Error submitting batch:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/batch/status/:batchId
 * Batch status check (legacy - batch processing now uses parallel Gemini calls)
 */
router.get('/status/:batchId', async (_req, res) => {
  res.json({ message: 'Batch API deprecated - summaries now process synchronously via Gemini' });
});

/**
 * GET /api/batch/results/:batchId
 * Batch results (legacy - batch processing now uses parallel Gemini calls)
 */
router.get('/results/:batchId', async (_req, res) => {
  res.json({ message: 'Batch API deprecated - summaries now process synchronously via Gemini' });
});

/**
 * POST /api/batch/check-all
 * Manually trigger check for all completed batches
 */
router.post('/check-all', async (req, res) => {
  try {
    await checkForCompletedBatches();
    res.json({ success: true, message: 'Checked for completed batches' });
  } catch (err: any) {
    console.error('Error checking completed batches:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/batch/checker/status
 * Get status of the batch checker service
 */
router.get('/checker/status', (req, res) => {
  const status = batchCheckerService.getStatus();
  res.json(status);
});

/**
 * POST /api/batch/checker/start
 * Start the batch checker service (runs hourly)
 */
router.post('/checker/start', (req, res) => {
  batchCheckerService.start();
  res.json({ success: true, message: 'Batch checker started' });
});

/**
 * POST /api/batch/checker/stop
 * Stop the batch checker service
 */
router.post('/checker/stop', (req, res) => {
  batchCheckerService.stop();
  res.json({ success: true, message: 'Batch checker stopped' });
});

/**
 * POST /api/batch/checker/check-now
 * Trigger immediate check for completed batches
 */
router.post('/checker/check-now', async (req, res) => {
  try {
    await batchCheckerService.checkNow();
    res.json({ success: true, message: 'Check completed' });
  } catch (err: any) {
    console.error('Error triggering immediate check:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
