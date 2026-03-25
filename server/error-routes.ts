/**
 * ERROR MANAGEMENT API ROUTES
 * Endpoints for error reporting, analysis, and resolution
 */

import type { Express } from 'express';
import { db } from './db';
import { sql } from 'drizzle-orm';

export function registerErrorRoutes(app: Express) {
  // ============================================================================
  // GET /api/errors - List all errors with optional filters
  // ============================================================================
  app.get('/api/errors', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const severity = req.query.severity as string;
      const resolved = req.query.resolved === 'true' ? true : req.query.resolved === 'false' ? false : undefined;
      const errorType = req.query.errorType as string;

      // Build query dynamically
      const conditions: string[] = ['1=1'];
      const params: any[] = [];

      if (severity) {
        conditions.push(`severity = '${severity}'`);
      }

      if (resolved !== undefined) {
        conditions.push(`resolved = ${resolved}`);
      }

      if (errorType) {
        conditions.push(`error_type = '${errorType}'`);
      }

      const query = `
        SELECT *
        FROM error_reports
        WHERE ${conditions.join(' AND ')}
        ORDER BY last_seen DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `;

      const result = await db.execute(sql.raw(query));

      res.json({
        success: true,
        data: result.rows,
        total: result.rows.length,
        limit,
        offset,
      });
    } catch (error: any) {
      console.error('[API /errors] Failed to fetch errors:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // GET /api/errors/repeating - Errors sorted by occurrence count
  // MUST be registered BEFORE /api/errors/:id to avoid Express matching "repeating" as :id
  // ============================================================================
  app.get('/api/errors/repeating', async (req, res) => {
    try {
      const hours = parseInt(req.query.hours as string) || 0; // 0 = all time

      const timeFilter = hours > 0 ? `AND last_seen >= NOW() - INTERVAL '${hours} hours'` : '';

      const query = `
        SELECT *,
          context->>'service' AS service,
          context->>'operation' AS operation
        FROM error_reports
        WHERE resolved = false ${timeFilter}
        ORDER BY occurrence_count DESC, last_seen DESC
        LIMIT 100
      `;

      const result = await db.execute(sql.raw(query));

      // Compute summary stats
      const rows = result.rows as any[];
      const summary = {
        total: rows.length,
        critical: rows.filter((r) => r.severity === 'critical').length,
        high: rows.filter((r) => r.severity === 'high').length,
        medium: rows.filter((r) => r.severity === 'medium').length,
        low: rows.filter((r) => r.severity === 'low' || !r.severity).length,
      };

      res.json({
        success: true,
        data: rows,
        summary,
      });
    } catch (error: any) {
      console.error('[API /errors/repeating] Failed to fetch repeating errors:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // GET /api/errors/:id - Get specific error by ID
  // ============================================================================
  app.get('/api/errors/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await db.execute(sql`
        SELECT *
        FROM error_reports
        WHERE id = ${id}
      `);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Error not found',
        });
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error: any) {
      console.error('[API /errors/:id] Failed to fetch error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // POST /api/errors/:id/resolve - Mark error as resolved
  // ============================================================================
  app.post('/api/errors/:id/resolve', async (req, res) => {
    try {
      const { id } = req.params;
      const { resolvedBy, resolvedNotes } = req.body;

      const result = await db.execute(sql`
        UPDATE error_reports
        SET
          resolved = true,
          resolved_at = NOW(),
          resolved_by = ${resolvedBy || 'manual'},
          resolved_notes = ${resolvedNotes || null},
          status = 'fixed'
        WHERE id = ${id}
        RETURNING *
      `);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Error not found',
        });
      }

      res.json({
        success: true,
        message: 'Error marked as resolved',
        data: result.rows[0],
      });
    } catch (error: any) {
      console.error('[API /errors/:id/resolve] Failed to resolve error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // DELETE /api/errors/:id - Delete specific error
  // ============================================================================
  app.delete('/api/errors/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const result = await db.execute(sql`
        DELETE FROM error_reports
        WHERE id = ${id}
        RETURNING id
      `);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Error not found',
        });
      }

      res.json({
        success: true,
        message: 'Error deleted successfully',
        data: { id: result.rows[0].id },
      });
    } catch (error: any) {
      console.error('[API /errors/:id] Failed to delete error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // POST /api/errors/cleanup - Clean up old resolved errors
  // ============================================================================
  app.post('/api/errors/cleanup', async (req, res) => {
    try {
      const { claudeCodeErrorReporter } = await import('./services/claude-code-error-reporter');
      const olderThanDays = parseInt(req.body.olderThanDays as string) || 30;

      const deletedCount = await claudeCodeErrorReporter.clearOldReports(olderThanDays);

      res.json({
        success: true,
        message: `Cleaned up ${deletedCount} old resolved errors`,
        deletedCount,
      });
    } catch (error: any) {
      console.error('[API /errors/cleanup] Failed to cleanup errors:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  console.log('[API] ✓ Error management routes registered');
}
