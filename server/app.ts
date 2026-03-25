import { type Server } from 'node:http';

import express, { type Express, type Request, Response, NextFunction } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';

import { registerRoutes } from './routes';
import { sunoTaskService } from './services/suno-task-service';
import { pool } from './db';

// Extend session types
declare module 'express-session' {
  interface SessionData {
    authenticated?: boolean;
  }
}

// PostgreSQL session store
const PgSession = connectPgSimple(session);
const sessionPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 10000,
});

export function log(message: string, source = 'express') {
  const formattedTime = new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown;
  }
}
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: false }));

// Session middleware for password protection with PostgreSQL persistence
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const isHttps = frontendUrl.startsWith('https://');
app.use(
  session({
    store: new PgSession({
      pool: sessionPool,
      tableName: 'session', // Default table name
      createTableIfMissing: true, // Auto-create session table
    }),
    secret: process.env.SESSION_SECRET || 'rapping-history-secret-key-change-in-prod',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isHttps || process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days (extended from 7)
      httpOnly: true, // Prevent XSS attacks
      sameSite: 'none', // Changed from 'lax' for OAuth flow
      path: '/', // Explicit path
    },
  }),
);

// Dashboard password protection
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD;

// Auth check middleware
app.use((req, res, next) => {
  // Skip auth for login endpoint, static assets, and internal automation
  if (
    req.path === '/api/auth/login' ||
    req.path === '/api/auth/check' ||
    req.path.startsWith('/api/auth/google/') || // Google OAuth endpoints
    req.path.startsWith('/api/auth/') || // ALL auth endpoints (including /me)
    req.path.startsWith('/api/stripe/') || // Stripe webhooks (must be public for webhook delivery)
    req.path.startsWith('/api/beats/') || // Beat generation endpoints
    req.path.startsWith('/api/beat-store/') || // Beat marketplace endpoints
    req.path.startsWith('/api/beat-marketplace/') || // Public beat marketplace
    req.path.startsWith('/assets/') ||
    req.path.startsWith('/api/automation/') ||
    req.path.startsWith('/api/jobs') ||
    req.path.startsWith('/api/strategic-summary') ||
    req.path.startsWith('/api/youtube/') ||
    req.path.startsWith('/api/visual-intelligence') ||
    req.path.startsWith('/api/autopilot') ||
    req.path.startsWith('/api/feedback/') ||
    req.path.startsWith('/api/retention/') ||
    req.path.startsWith('/api/unity/') ||
    req.path.startsWith('/api/costs') ||
    req.path.startsWith('/api/pricing') || // API pricing info
    req.path.startsWith('/api/usage') || // API usage stats
    req.path.startsWith('/api/batch') ||
    req.path.startsWith('/api/videos/') ||
    req.path.startsWith('/api/thumbnails/') ||
    req.path.startsWith('/api/health') || // Health checks (used by proactive remediation agent)
    req.path.startsWith('/api/errors') || // Error monitor dashboard
    !DASHBOARD_PASSWORD
  ) {
    return next();
  }

  // Check if authenticated
  if (req.session?.authenticated) {
    return next();
  }

  // For API routes, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // For page routes, let frontend handle redirect
  next();
});

// Auth endpoints
app.post('/api/auth/login', (req, res) => {
  const { password } = req.body;

  if (!DASHBOARD_PASSWORD) {
    return res.json({ success: true, message: 'No password configured' });
  }

  if (password === DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }

  return res.status(401).json({ success: false, error: 'Invalid password' });
});

app.get('/api/auth/check', (req, res) => {
  const needsAuth = !!DASHBOARD_PASSWORD;
  const isAuthenticated = !needsAuth || req.session?.authenticated === true;
  res.json({ needsAuth, isAuthenticated });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on('finish', () => {
    const duration = Date.now() - start;
    if (path.startsWith('/api')) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 500) {
        logLine = logLine.slice(0, 499) + '…';
      }

      log(logLine);
    }
  });

  next();
});

export default async function runApp(setup: (app: Express, server: Server) => Promise<void>) {
  const server = await registerRoutes(app);

  // Resume any pending Suno tasks that were interrupted by server restart
  try {
    await sunoTaskService.resumePendingTasks();
  } catch (err: any) {
    console.error(`⚠️ Failed to resume pending Suno tasks: ${err.message}`);
  }

  // Start Scheduled Upload Service for staggered YouTube uploads
  try {
    const { scheduledUploadService } = await import('./services/scheduled-upload-service');
    scheduledUploadService.start();
  } catch (err: any) {
    console.error(`⚠️ Failed to start scheduled upload service: ${err.message}`);
  }

  // Start Agent Scheduler for closed-loop automation
  try {
    const { agentScheduler } = await import('./services/agent-scheduler');
    await agentScheduler.start();
    console.log('✅ Agent Scheduler started - closed-loop system active');
  } catch (err: any) {
    console.error(`⚠️ Failed to start Agent Scheduler: ${err.message}`);
  }

  // Start Video Scheduler for automated daily generation/uploads
  try {
    const { videoScheduler } = await import('./services/video-scheduler');
    videoScheduler.start();
    console.log('✅ Video Scheduler started - automated generation/uploads active');
  } catch (err: any) {
    console.error(`⚠️ Failed to start Video Scheduler: ${err.message}`);
  }

  // Start Beat Scheduler for automated daily beat generation
  try {
    const { beatScheduler } = await import('./services/beat-scheduler');
    beatScheduler.start();
    console.log('✅ Beat Scheduler started - 1 lofi + 1 trap daily');
  } catch (err: any) {
    console.error(`⚠️ Failed to start Beat Scheduler: ${err.message}`);
  }

  // Start Error Cleanup Scheduler for database maintenance
  try {
    const { errorCleanupScheduler } = await import('./services/error-cleanup-scheduler');
    await errorCleanupScheduler.start();
    console.log('✅ Error Cleanup Scheduler started - daily database cleanup active');
  } catch (err: any) {
    console.error(`⚠️ Failed to start Error Cleanup Scheduler: ${err.message}`);
  }

  // Start Analytics Polling Scheduler - runs before daily generation
  try {
    const { analyticsPollingScheduler } = await import('./services/analytics-polling-scheduler');
    analyticsPollingScheduler.start();
    console.log('✅ Analytics Polling Scheduler started - daily analytics at 2:00 AM');
  } catch (err: any) {
    console.error(`⚠️ Failed to start Analytics Polling Scheduler: ${err.message}`);
  }

  // Start Health Check Scheduler for system monitoring
  try {
    const { healthCheckScheduler } = await import('./services/health-check-scheduler');
    await healthCheckScheduler.start();
    console.log('✅ Health Check Scheduler started - monitoring all system components');
  } catch (err: any) {
    console.error(`⚠️ Failed to start Health Check Scheduler: ${err.message}`);
  }

  // Discord bot moved to standalone watchdog process (server-watchdog.ts)
  // This prevents the bot from dying when the server restarts and allows
  // remote server start/stop control via Discord.
  // Start watchdog: nohup npx tsx server-watchdog.ts > /tmp/unity-scratch/watchdog.log 2>&1 &
  console.log('ℹ️  Discord bot runs as standalone watchdog (server-watchdog.ts)');

  // Start Pipeline Orchestrator for comprehensive pipeline coordination
  try {
    const { pipelineOrchestrator } = await import('./services/pipeline-orchestrator');
    await pipelineOrchestrator.start();
    console.log('✅ Pipeline Orchestrator started - master pipeline coordinator active');
  } catch (err: any) {
    console.error(`⚠️ Failed to start Pipeline Orchestrator: ${err.message}`);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({ message });
    throw err;
  });

  // importantly run the final setup after setting up all the other routes so
  // the catch-all route doesn't interfere with the other routes
  await setup(app, server);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);

  // Graceful shutdown handling to prevent port conflicts
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);

    // Stop all schedulers before closing DB pools
    try {
      const { analyticsPollingScheduler } = await import('./services/analytics-polling-scheduler');
      analyticsPollingScheduler.stop();
    } catch {}
    try {
      const { agentScheduler } = await import('./services/agent-scheduler');
      agentScheduler.stop();
    } catch {}
    try {
      const { videoScheduler } = await import('./services/video-scheduler');
      videoScheduler.stop();
    } catch {}
    try {
      const { beatScheduler } = await import('./services/beat-scheduler');
      beatScheduler.stop();
    } catch {}
    try {
      const { healthCheckScheduler } = await import('./services/health-check-scheduler');
      healthCheckScheduler.stop();
    } catch {}
    try {
      const { pipelineOrchestrator } = await import('./services/pipeline-orchestrator');
      await pipelineOrchestrator.stop();
    } catch {}
    try {
      const { cleanupService } = await import('./services/cleanup-service');
      cleanupService.stopScheduler();
    } catch {}
    try {
      const { scheduledUploadService } = await import('./services/scheduled-upload-service');
      scheduledUploadService.stop();
    } catch {}
    console.log('✅ All schedulers stopped');

    server.close(async () => {
      // Close database pools
      try {
        await sessionPool.end();
        await pool.end();
        console.log('✅ Database pools closed');
      } catch {}
      console.log('✅ Server closed successfully');
      process.exit(0);
    });
    // Force exit after 10 seconds if server doesn't close
    setTimeout(() => {
      console.log('⚠️ Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

  server.listen(
    {
      port,
      host: '0.0.0.0',
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
}
