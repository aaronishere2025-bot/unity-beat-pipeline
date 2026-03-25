/**
 * Google OAuth Service
 * Handles Google OAuth 2.0 authentication flow and user management
 */

import { OAuth2Client } from 'google-auth-library';
import { db } from '../db.js';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

interface GoogleProfile {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl: string;
}

interface User {
  id: string;
  googleId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  freeBeatCreditsRemaining: number;
  stripeCustomerId: string | null;
  isActive: boolean;
  isBanned: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  updatedAt: Date;
}

class GoogleOAuthService {
  private static instance: GoogleOAuthService;
  private client: OAuth2Client;

  private constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    // Allow test mode with placeholder credentials
    const isTestMode = clientId?.includes('YOUR_GOOGLE_CLIENT_ID');

    if (!clientId || !clientSecret || !redirectUri) {
      console.log('⚠️  Google OAuth not configured — login disabled');
    }

    if (isTestMode) {
      console.log('⚠️  Google OAuth in TEST MODE - using placeholder credentials');
    }

    this.client = new OAuth2Client({
      clientId: clientId || 'dummy',
      clientSecret,
      redirectUri,
    });
  }

  static getInstance(): GoogleOAuthService {
    if (!GoogleOAuthService.instance) {
      GoogleOAuthService.instance = new GoogleOAuthService();
    }
    return GoogleOAuthService.instance;
  }

  /**
   * Generate Google OAuth URL for authorization
   */
  getAuthUrl(): string {
    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent screen to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens and get user profile
   */
  async exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
    const { tokens } = await this.client.getToken(code);
    this.client.setCredentials(tokens);

    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid ID token payload');
    }

    return {
      googleId: payload.sub,
      email: payload.email!,
      displayName: payload.name || payload.email!,
      avatarUrl: payload.picture || '',
    };
  }

  /**
   * Verify ID token (for client-side OAuth flow)
   */
  async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid ID token payload');
    }

    return {
      googleId: payload.sub,
      email: payload.email!,
      displayName: payload.name || payload.email!,
      avatarUrl: payload.picture || '',
    };
  }

  /**
   * Get or create user from Google profile
   * Handles first-time signups (5 free credits) and returning users
   */
  async getOrCreateUser(googleProfile: GoogleProfile): Promise<User> {
    // Check if user exists
    const existingUsers = await db.select().from(users).where(eq(users.googleId, googleProfile.googleId)).limit(1);

    if (existingUsers.length > 0) {
      // Update last login
      const [updatedUser] = await db
        .update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, existingUsers[0].id))
        .returning();

      return updatedUser;
    }

    // Create new user with 5 free beat credits
    const [newUser] = await db
      .insert(users)
      .values({
        googleId: googleProfile.googleId,
        email: googleProfile.email,
        displayName: googleProfile.displayName,
        avatarUrl: googleProfile.avatarUrl,
        freeBeatCreditsRemaining: 5, // 5 free beats on signup
        isActive: true,
        isBanned: false,
        createdAt: new Date(),
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    console.log(`✅ New user created: ${newUser.email} (5 free beat credits)`);

    return newUser;
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get user by Google ID
   */
  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);

    return result.length > 0 ? result[0] : null;
  }

  /**
   * Update user's last login timestamp
   */
  async updateLastLogin(userId: string): Promise<void> {
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, userId));
  }

  /**
   * Ban/unban user
   */
  async banUser(userId: string, banned: boolean): Promise<void> {
    await db.update(users).set({ isBanned: banned, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  /**
   * Update user's Stripe customer ID
   */
  async updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void> {
    await db.update(users).set({ stripeCustomerId, updatedAt: new Date() }).where(eq(users.id, userId));
  }
}

// Export singleton instance
export const googleOAuthService = GoogleOAuthService.getInstance();
