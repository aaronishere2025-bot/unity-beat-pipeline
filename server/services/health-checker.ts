import { db } from '../db';
import { sql } from 'drizzle-orm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sunoApi } from './suno-api';

interface HealthStatus {
  status: 'ok' | 'error';
  details: string;
}

interface HealthReport {
  overallStatus: 'ok' | 'error';
  timestamp: string;
  checks: {
    database: HealthStatus;
    gemini: HealthStatus;
    suno: HealthStatus;
  };
}

class HealthChecker {
  public async check(): Promise<HealthReport> {
    const [dbStatus, geminiStatus, sunoStatus] = await Promise.all([
      this.checkDatabase(),
      this.checkGemini(),
      this.checkSuno(),
    ]);

    const checks = {
      database: dbStatus,
      gemini: geminiStatus,
      suno: sunoStatus,
    };

    const overallStatus = Object.values(checks).every((c) => c.status === 'ok') ? 'ok' : 'error';

    return {
      overallStatus,
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  private async checkDatabase(): Promise<HealthStatus> {
    try {
      // Perform a simple query to check the connection
      await db.execute(sql`SELECT 1`);
      return { status: 'ok', details: 'Database connection successful.' };
    } catch (error: any) {
      return { status: 'error', details: `Database connection failed: ${error.message}` };
    }
  }

  private async checkSuno(): Promise<HealthStatus> {
    if (!sunoApi.isConfigured()) {
      return { status: 'ok', details: 'Suno API not configured, skipping check.' };
    }
    try {
      await sunoApi.checkCredits();
      return { status: 'ok', details: 'Suno API connection successful.' };
    } catch (error: any) {
      return { status: 'error', details: `Suno API connection failed: ${error.message}` };
    }
  }

  private async checkGemini(): Promise<HealthStatus> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) {
      return { status: 'ok', details: 'Gemini API key not set, skipping check.' };
    }
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      // This is a lightweight way to validate the key without consuming generation quota
      await genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      return { status: 'ok', details: 'Gemini API connection successful.' };
    } catch (error: any) {
      return { status: 'error', details: `Gemini API connection failed: ${error.message}` };
    }
  }
}

export const healthChecker = new HealthChecker();
