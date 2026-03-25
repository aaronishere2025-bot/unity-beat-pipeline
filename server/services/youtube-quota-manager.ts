import { db } from '../db';

const UPLOAD_COST = 1600;
const ANALYTICS_COST = 1;
const DEFAULT_DAILY_LIMIT = 10000;

interface APIKeyConfig {
  projectId: string;
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  dailyLimit: number;
  usedToday: number;
  lastResetDate: string;
  isActive: boolean;
}

interface ETagCache {
  [resourceId: string]: {
    etag: string;
    data: any;
    cachedAt: number;
  };
}

class YouTubeQuotaManager {
  private apiKeys: APIKeyConfig[] = [];
  private currentKeyIndex: number = 0;
  private etagCache: ETagCache = {};
  private backoffMultiplier: number = 1;
  private maxBackoffMs: number = 32000;
  private baseBackoffMs: number = 1000;

  constructor() {
    this.loadKeysFromEnv();
  }

  private loadKeysFromEnv(): void {
    const primaryKey: APIKeyConfig = {
      projectId: 'primary',
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
      dailyLimit: DEFAULT_DAILY_LIMIT,
      usedToday: 0,
      lastResetDate: this.getTodayDate(),
      isActive: true,
    };

    this.apiKeys = [primaryKey];

    for (let i = 2; i <= 10; i++) {
      const clientId = process.env[`GOOGLE_CLIENT_ID_${i}`];
      const clientSecret = process.env[`GOOGLE_CLIENT_SECRET_${i}`];

      if (clientId && clientSecret) {
        this.apiKeys.push({
          projectId: `project_${i}`,
          clientId,
          clientSecret,
          refreshToken: process.env[`GOOGLE_REFRESH_TOKEN_${i}`],
          dailyLimit: DEFAULT_DAILY_LIMIT,
          usedToday: 0,
          lastResetDate: this.getTodayDate(),
          isActive: true,
        });
        console.log(`🔑 Loaded YouTube API key ${i}`);
      }
    }

    console.log(`📊 YouTube Quota Manager: ${this.apiKeys.length} API key(s) loaded`);
    console.log(`   Total daily capacity: ${this.apiKeys.length * DEFAULT_DAILY_LIMIT} units`);
    console.log(`   Max uploads per day: ${Math.floor((this.apiKeys.length * DEFAULT_DAILY_LIMIT) / UPLOAD_COST)}`);
  }

  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  private resetDailyQuotaIfNeeded(): void {
    const today = this.getTodayDate();
    for (const key of this.apiKeys) {
      if (key.lastResetDate !== today) {
        key.usedToday = 0;
        key.lastResetDate = today;
        key.isActive = true;
      }
    }
  }

  getCurrentKey(): APIKeyConfig | null {
    this.resetDailyQuotaIfNeeded();

    for (let i = 0; i < this.apiKeys.length; i++) {
      const index = (this.currentKeyIndex + i) % this.apiKeys.length;
      const key = this.apiKeys[index];

      if (key.isActive && key.usedToday < key.dailyLimit) {
        this.currentKeyIndex = index;
        return key;
      }
    }

    return null;
  }

  canUpload(): { canUpload: boolean; remainingUploads: number; reason?: string } {
    this.resetDailyQuotaIfNeeded();

    let totalRemaining = 0;
    for (const key of this.apiKeys) {
      if (key.isActive) {
        totalRemaining += key.dailyLimit - key.usedToday;
      }
    }

    const remainingUploads = Math.floor(totalRemaining / UPLOAD_COST);

    if (remainingUploads <= 0) {
      return {
        canUpload: false,
        remainingUploads: 0,
        reason: `All API keys exhausted. Quota resets at midnight Pacific Time.`,
      };
    }

    return { canUpload: true, remainingUploads };
  }

  recordUsage(units: number): void {
    const key = this.apiKeys[this.currentKeyIndex];
    if (key) {
      key.usedToday += units;
      console.log(
        `📊 Quota used: ${units} units (Key ${this.currentKeyIndex + 1}: ${key.usedToday}/${key.dailyLimit})`,
      );

      if (key.usedToday >= key.dailyLimit) {
        console.log(`⚠️  Key ${this.currentKeyIndex + 1} exhausted, rotating...`);
        this.rotateToNextKey();
      }
    }
  }

  recordUpload(): void {
    this.recordUsage(UPLOAD_COST);
  }

  recordAnalyticsCall(): void {
    this.recordUsage(ANALYTICS_COST);
  }

  private rotateToNextKey(): boolean {
    const startIndex = this.currentKeyIndex;

    do {
      this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
      const key = this.apiKeys[this.currentKeyIndex];

      if (key.isActive && key.usedToday < key.dailyLimit) {
        console.log(`🔄 Rotated to API key ${this.currentKeyIndex + 1}`);
        return true;
      }
    } while (this.currentKeyIndex !== startIndex);

    console.log(`❌ All API keys exhausted for today`);
    return false;
  }

  handleQuotaExceeded(): boolean {
    const key = this.apiKeys[this.currentKeyIndex];
    if (key) {
      key.isActive = false;
      console.log(`🚫 Key ${this.currentKeyIndex + 1} marked as quota exceeded`);
    }

    return this.rotateToNextKey();
  }

  getETag(resourceId: string): string | null {
    const cached = this.etagCache[resourceId];
    if (cached) {
      return cached.etag;
    }
    return null;
  }

  getCachedData(resourceId: string): any | null {
    const cached = this.etagCache[resourceId];
    if (cached) {
      const ageMs = Date.now() - cached.cachedAt;
      const maxAgeMs = 5 * 60 * 1000;

      if (ageMs < maxAgeMs) {
        return cached.data;
      }
    }
    return null;
  }

  cacheResponse(resourceId: string, etag: string, data: any): void {
    this.etagCache[resourceId] = {
      etag,
      data,
      cachedAt: Date.now(),
    };
  }

  async withExponentialBackoff<T>(operation: () => Promise<T>, maxRetries: number = 5): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await operation();
        this.backoffMultiplier = 1;
        return result;
      } catch (error: any) {
        lastError = error;

        if (error.code === 403 && error.message?.includes('quotaExceeded')) {
          console.log(`⚠️  Quota exceeded on attempt ${attempt + 1}`);
          const rotated = this.handleQuotaExceeded();
          if (!rotated) {
            throw new Error('All YouTube API quotas exhausted for today');
          }
          continue;
        }

        if (error.code === 429 || error.code === 503) {
          const backoffMs = Math.min(
            this.baseBackoffMs * Math.pow(2, attempt) * this.backoffMultiplier,
            this.maxBackoffMs,
          );

          console.log(`⏳ Rate limited. Backing off for ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(backoffMs);
          this.backoffMultiplier = Math.min(this.backoffMultiplier * 1.5, 4);
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getQuotaStatus(): {
    totalKeys: number;
    activeKeys: number;
    totalCapacity: number;
    usedToday: number;
    remainingToday: number;
    remainingUploads: number;
    keyBreakdown: Array<{ projectId: string; used: number; limit: number; active: boolean }>;
  } {
    this.resetDailyQuotaIfNeeded();

    let usedToday = 0;
    let totalCapacity = 0;
    let activeKeys = 0;

    const keyBreakdown = this.apiKeys.map((key) => {
      if (key.isActive) {
        activeKeys++;
        totalCapacity += key.dailyLimit;
      }
      usedToday += key.usedToday;

      return {
        projectId: key.projectId,
        used: key.usedToday,
        limit: key.dailyLimit,
        active: key.isActive,
      };
    });

    const remainingToday = totalCapacity - usedToday;

    return {
      totalKeys: this.apiKeys.length,
      activeKeys,
      totalCapacity,
      usedToday,
      remainingToday,
      remainingUploads: Math.floor(remainingToday / UPLOAD_COST),
      keyBreakdown,
    };
  }

  addKey(config: Omit<APIKeyConfig, 'usedToday' | 'lastResetDate'>): void {
    this.apiKeys.push({
      ...config,
      usedToday: 0,
      lastResetDate: this.getTodayDate(),
    });
    console.log(`🔑 Added new API key: ${config.projectId}`);
    console.log(`   New total capacity: ${this.apiKeys.length * DEFAULT_DAILY_LIMIT} units`);
  }
}

export const youtubeQuotaManager = new YouTubeQuotaManager();

export const QUOTA_COSTS = {
  UPLOAD: UPLOAD_COST,
  ANALYTICS: ANALYTICS_COST,
  UPDATE_METADATA: 50,
  SET_THUMBNAIL: 50,
  LIST_VIDEOS: 1,
  DELETE_VIDEO: 50,
};
