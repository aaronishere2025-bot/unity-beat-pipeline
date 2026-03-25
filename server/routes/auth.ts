/**
 * Authentication Routes
 *
 * Google OAuth + JWT authentication endpoints.
 */

import { Router } from 'express';
import { googleOAuthService } from '../services/google-oauth-service.js';
import { authMiddleware, generateToken } from '../middleware/auth.js';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = Router();

// Get Google OAuth authorization URL
router.get('/google/url', (req, res) => {
  try {
    const authUrl = googleOAuthService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    console.error('Failed to generate Google auth URL:', error);
    res.status(500).json({ error: 'Failed to generate authorization URL' });
  }
});

// Google OAuth callback - exchange code for tokens and create/login user
router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    console.log('🔐 [OAuth Callback] Starting OAuth callback process');
    console.log('🔐 [OAuth Callback] Code received:', code ? 'YES' : 'NO');

    if (!code || typeof code !== 'string') {
      console.error('🔐 [OAuth Callback] ERROR: No authorization code');
      return res.status(400).json({ error: 'Authorization code required' });
    }

    // Exchange code for Google profile
    console.log('🔐 [OAuth Callback] Exchanging code for profile...');
    const googleProfile = await googleOAuthService.exchangeCodeForProfile(code);
    console.log('🔐 [OAuth Callback] Profile received:', googleProfile.email);

    // Get or create user
    console.log('🔐 [OAuth Callback] Getting/creating user...');
    const user = await googleOAuthService.getOrCreateUser(googleProfile);
    console.log('🔐 [OAuth Callback] User ID:', user.id);

    // Generate JWT token
    const token = generateToken(user.id, user.email);
    console.log('🔐 [OAuth Callback] JWT token generated:', token.substring(0, 20) + '...');

    // Set token as HTTP-only cookie
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const isHttps = frontendUrl.startsWith('https://');
    console.log('🔐 [OAuth Callback] Setting cookie with secure:', isHttps || process.env.NODE_ENV === 'production');
    console.log('🔐 [OAuth Callback] Frontend URL:', frontendUrl);
    console.log('🔐 [OAuth Callback] Is HTTPS:', isHttps);

    res.cookie('token', token, {
      httpOnly: true,
      secure: isHttps || process.env.NODE_ENV === 'production',
      sameSite: 'none', // Changed from 'lax' to 'none' for OAuth redirect flow
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/', // Explicit path
    });

    console.log('🔐 [OAuth Callback] Cookie set successfully');

    // CRITICAL FIX: Don't redirect immediately - return HTML that redirects client-side
    // This ensures cookies persist before navigation
    const redirectUrl = `${frontendUrl}/auth/callback?success=true&token=${encodeURIComponent(token)}`;
    console.log('🔐 [OAuth Callback] Sending intermediate page to:', redirectUrl);

    // Return HTML that waits for cookie to persist, then redirects
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Completing Sign In...</title>
        <meta charset="utf-8">
      </head>
      <body style="font-family: system-ui; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5;">
        <div style="text-align: center;">
          <h2>✅ Authentication Successful</h2>
          <p>Completing sign in...</p>
          <script>
            // Wait 100ms for cookie to persist, then redirect
            setTimeout(function() {
              window.location.href = "${redirectUrl}";
            }, 100);
          </script>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('🔐 [OAuth Callback] FATAL ERROR:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/auth/callback?error=auth_failed`);
  }
});

// Verify ID token (for client-side OAuth flow)
router.post('/google/verify', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token required' });
    }

    // Verify ID token
    const googleProfile = await googleOAuthService.verifyIdToken(idToken);

    // Get or create user
    const user = await googleOAuthService.getOrCreateUser(googleProfile);

    // Generate JWT token
    const token = generateToken(user.id, user.email);

    // Set token as HTTP-only cookie
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const isHttps = frontendUrl.startsWith('https://');
    res.cookie('token', token, {
      httpOnly: true,
      secure: isHttps || process.env.NODE_ENV === 'production',
      sameSite: 'none', // Changed from 'lax' to 'none' for OAuth flow
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/', // Explicit path
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        freeBeatCreditsRemaining: user.freeBeatCreditsRemaining,
      },
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({ error: 'Invalid ID token' });
  }
});

// Get current user (protected route)
router.get('/me', authMiddleware, async (req, res) => {
  try {
    console.log('👤 [/api/auth/me] Request received');
    console.log('👤 [/api/auth/me] Cookies:', req.cookies);
    console.log('👤 [/api/auth/me] req.user:', req.user ? 'PRESENT' : 'MISSING');

    if (!req.user) {
      console.error('👤 [/api/auth/me] ERROR: req.user is missing (authMiddleware failed)');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    console.log('👤 [/api/auth/me] User ID from token:', req.user!.id);

    // Get fresh user data
    const user = await googleOAuthService.getUserById(req.user!.id);
    if (!user) {
      console.error('👤 [/api/auth/me] ERROR: User not found in database:', req.user!.id);
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('👤 [/api/auth/me] SUCCESS: Returning user data for', user.email);

    res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      freeBeatCreditsRemaining: user.freeBeatCreditsRemaining,
      stripeCustomerId: user.stripeCustomerId,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    });
  } catch (error) {
    console.error('👤 [/api/auth/me] FATAL ERROR:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

// Get user balance and spending stats
router.get('/balance', authMiddleware, async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get user data
    const user = await googleOAuthService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate monthly spend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const monthlySpendResult = await db.execute(sql`
      SELECT COALESCE(SUM(user_charge_usd), 0) as monthly_spend
      FROM jobs
      WHERE user_id = ${userId}
      AND charged_at >= ${thirtyDaysAgo.toISOString()}
      AND user_charge_usd IS NOT NULL
    `);

    const monthlySpend = parseFloat((monthlySpendResult.rows[0] as any)?.monthly_spend || '0');

    res.json({
      balance: parseFloat((user as any).balance || '0'),
      totalSpent: parseFloat((user as any).totalSpent || '0'),
      monthlySpend,
      subscriptionTier: (user as any).subscriptionTier,
    });
  } catch (error) {
    console.error('❌ Failed to get balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

// Logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

export default router;
