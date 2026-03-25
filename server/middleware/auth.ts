/**
 * Authentication Middleware
 * JWT-based authentication for protecting routes
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { googleOAuthService } from '../services/google-oauth-service.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        displayName: string;
        googleId: string;
        freeBeatCreditsRemaining: number;
        stripeCustomerId: string | null;
        isActive: boolean;
        isBanned: boolean;
      };
    }
  }
}

interface JWTPayload {
  userId: string;
  email: string;
  iat: number;
  exp: number;
}

/**
 * Verify JWT token and attach user to request
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    console.log('🔑 [authMiddleware] Request path:', req.path);
    console.log('🔑 [authMiddleware] Cookies received:', Object.keys(req.cookies || {}));
    console.log('🔑 [authMiddleware] Raw cookies:', req.cookies);

    // Get token from Authorization header or cookie
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
      console.log('🔑 [authMiddleware] Token from Authorization header:', token.substring(0, 20) + '...');
    } else if (req.cookies?.token) {
      token = req.cookies.token;
      console.log('🔑 [authMiddleware] Token from cookie:', token!.substring(0, 20) + '...');
    }

    if (!token) {
      console.error('🔑 [authMiddleware] ERROR: No token found in cookies or headers');
      console.error('🔑 [authMiddleware] Available cookies:', Object.keys(req.cookies || {}));
      res.status(401).json({ error: 'No authentication token provided' });
      return;
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('🔑 [authMiddleware] FATAL: JWT_SECRET not configured');
      throw new Error('JWT_SECRET not configured');
    }

    console.log('🔑 [authMiddleware] Verifying token...');
    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;
    console.log('🔑 [authMiddleware] Token verified. User ID:', decoded.userId);

    // Get user from database
    console.log('🔑 [authMiddleware] Fetching user from database...');
    const user = await googleOAuthService.getUserById(decoded.userId);
    if (!user) {
      console.error('🔑 [authMiddleware] ERROR: User not found in database:', decoded.userId);
      res.status(401).json({ error: 'User not found' });
      return;
    }

    console.log('🔑 [authMiddleware] User found:', user.email);

    // Check if user is banned
    if (user.isBanned) {
      console.error('🔑 [authMiddleware] ERROR: User is banned:', user.email);
      res.status(403).json({ error: 'Account has been banned' });
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      console.error('🔑 [authMiddleware] ERROR: User is inactive:', user.email);
      res.status(403).json({ error: 'Account is inactive' });
      return;
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      displayName: user.displayName || '',
      googleId: user.googleId,
      freeBeatCreditsRemaining: user.freeBeatCreditsRemaining,
      stripeCustomerId: user.stripeCustomerId,
      isActive: user.isActive,
      isBanned: user.isBanned,
    };

    console.log('🔑 [authMiddleware] SUCCESS: User attached to request');
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      console.error('🔑 [authMiddleware] ERROR: Invalid token:', error.message);
      res.status(401).json({ error: 'Invalid token' });
    } else if (error instanceof jwt.TokenExpiredError) {
      console.error('🔑 [authMiddleware] ERROR: Token expired:', error.message);
      res.status(401).json({ error: 'Token expired' });
    } else {
      console.error('🔑 [authMiddleware] FATAL ERROR:', error);
      res.status(500).json({ error: 'Authentication failed' });
    }
  }
}

/**
 * Optional auth middleware - doesn't fail if no token
 * Useful for routes that work for both authenticated and anonymous users
 */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get token from Authorization header or cookie
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      // No token - continue without user
      next();
      return;
    }

    // Verify token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      next();
      return;
    }

    const decoded = jwt.verify(token, jwtSecret) as JWTPayload;

    // Get user from database
    const user = await googleOAuthService.getUserById(decoded.userId);
    if (user && !user.isBanned && user.isActive) {
      // Attach user to request
      req.user = {
        id: user.id,
        email: user.email,
        displayName: user.displayName || '',
        googleId: user.googleId,
        freeBeatCreditsRemaining: user.freeBeatCreditsRemaining,
        stripeCustomerId: user.stripeCustomerId,
        isActive: user.isActive,
        isBanned: user.isBanned,
      };
    }

    next();
  } catch (error) {
    // Don't fail - just continue without user
    next();
  }
}

/**
 * Generate JWT token for user
 */
export function generateToken(userId: string, email: string): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.sign(
    { userId, email },
    jwtSecret,
    { expiresIn: '30d' }, // 30 day expiration
  );
}

/**
 * Middleware to check if user has admin role (future feature)
 */
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // TODO: Add admin check when user roles are implemented
  // For now, just check if user exists
  next();
}
