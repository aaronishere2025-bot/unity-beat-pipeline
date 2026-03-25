import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

const client = new SecretManagerServiceClient();
const projectId = 'unity-ai-1766877776';

interface SecretCache {
  [key: string]: {
    value: string;
    timestamp: number;
  };
}

const secretCache: SecretCache = {};
let cacheEnabled = true;

// Secret cache TTL: 1 hour (security best practice - allows rotation without restart)
// Set to 0 to disable TTL (cache until process restart)
const SECRET_CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Enable or disable secret caching
 * Caching is enabled by default for performance
 */
export function setCacheEnabled(enabled: boolean) {
  cacheEnabled = enabled;
  if (!enabled) {
    console.log('🔓 Secret caching disabled - will fetch fresh values on each request');
  } else {
    console.log('🔒 Secret caching enabled - using cached values for performance');
  }
}

/**
 * Clear the secret cache (useful for testing or after secret rotation)
 */
export function clearSecretCache() {
  const count = Object.keys(secretCache).length;
  Object.keys(secretCache).forEach((key) => delete secretCache[key]);
  console.log(`🗑️  Cleared ${count} cached secrets`);
}

/**
 * Get cache statistics for monitoring
 */
export function getSecretCacheStats(): {
  totalSecrets: number;
  secretAges: { secretId: string; ageMinutes: number }[];
  oldestSecretMinutes: number;
  ttlMinutes: number;
} {
  const now = Date.now();
  const secretAges = Object.entries(secretCache).map(([secretId, { timestamp }]) => ({
    secretId,
    ageMinutes: Math.round((now - timestamp) / 1000 / 60),
  }));

  const oldestSecretMinutes = secretAges.length > 0 ? Math.max(...secretAges.map((s) => s.ageMinutes)) : 0;

  return {
    totalSecrets: secretAges.length,
    secretAges: secretAges.sort((a, b) => b.ageMinutes - a.ageMinutes),
    oldestSecretMinutes,
    ttlMinutes: SECRET_CACHE_TTL / 1000 / 60,
  };
}

/**
 * Load a secret from Google Secret Manager
 * @param secretName The name of the secret (will be converted to lowercase-with-dashes format)
 * @param useCache Whether to use cached value (default: true, respects global cache setting)
 */
export async function loadSecret(secretName: string, useCache: boolean = true): Promise<string> {
  const secretId = secretName.toLowerCase().replace(/_/g, '-');

  // Check if cache is enabled and we have a cached value
  if (useCache && cacheEnabled && secretCache[secretId]) {
    const cached = secretCache[secretId];
    const age = Date.now() - cached.timestamp;

    // Return cached value if TTL is disabled (0) or not yet expired
    if (SECRET_CACHE_TTL === 0 || age < SECRET_CACHE_TTL) {
      return cached.value;
    } else {
      // Cache expired, will fetch fresh value
      console.log(
        `🔄 Secret cache expired for ${secretName} (${Math.round(age / 1000 / 60)} minutes old), refreshing...`,
      );
      delete secretCache[secretId];
    }
  }

  try {
    const secretPath = `projects/${projectId}/secrets/${secretId}/versions/latest`;
    const [version] = await client.accessSecretVersion({ name: secretPath });

    const payload = version.payload?.data?.toString();
    if (!payload) {
      throw new Error(`Secret ${secretName} has no payload`);
    }

    // Cache the secret with timestamp
    secretCache[secretId] = {
      value: payload,
      timestamp: Date.now(),
    };
    return payload;
  } catch (error: any) {
    console.error(`Failed to load secret ${secretName}:`, error.message);
    throw error;
  }
}

/**
 * Load multiple secrets at once
 * @param secretNames Array of secret names
 */
export async function loadSecrets(secretNames: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  await Promise.all(
    secretNames.map(async (name) => {
      try {
        results[name] = await loadSecret(name);
      } catch (error: any) {
        console.error(`Failed to load ${name}:`, error.message);
        // Don't fail the whole batch
      }
    }),
  );

  return results;
}

/**
 * Load all secrets and populate process.env
 * Call this at application startup
 */
export async function initializeSecretsFromGCP() {
  console.log('🔐 Loading secrets from Google Secret Manager...');

  const secretNames = [
    'SESSION_SECRET',
    'DATABASE_URL',
    'PGDATABASE',
    'PGHOST',
    'PGPORT',
    'PGUSER',
    'PGPASSWORD',
    // Direct API keys for multi-model AI system
    'OPENAI_API_KEY', // GPT-4o for creative strategy
    'GEMINI_API_KEY', // Gemini 2.0 Flash for analysis
    'ANTHROPIC_API_KEY', // Claude Sonnet 4.5 for narrative
    // Replit AI Integrations (fallback/alternative)
    'AI_INTEGRATIONS_OPENAI_BASE_URL',
    'AI_INTEGRATIONS_OPENAI_API_KEY',
    'AI_INTEGRATIONS_GEMINI_BASE_URL',
    'AI_INTEGRATIONS_GEMINI_API_KEY',
    'AI_INTEGRATIONS_ANTHROPIC_BASE_URL',
    'AI_INTEGRATIONS_ANTHROPIC_API_KEY',
    // Video generation APIs (kie.ai proxy for Kling)
    'KLING_ACCESS_KEY', // Required for kie.ai authentication
    'KLING_SECRET_KEY', // Optional second key (not used by kie.ai)
    'KIE_API_KEY', // Unified kie.ai API key for Suno + Kling
    // Music generation
    'SUNO_API_KEY', // Legacy Suno API key (fallback)
    // E-commerce platforms
    'GUMROAD_ACCESS_TOKEN', // Gumroad OAuth access token
    'LEMONSQUEEZY_API_KEY', // Lemon Squeezy digital product sales
    'SENDOWL_API_KEY', // SendOwl API key for authentication
    'SENDOWL_API_SECRET', // SendOwl API secret for authentication
    // YouTube integration
    'YOUTUBEAPIKEY',
    'YOUTUBE_CLIENT_ID',
    'YOUTUBE_CLIENT_SECRET',
    'YOUTUBE_REDIRECT_URI',
    'YOUTUBE_REFRESH_TOKEN',
    // Vertex AI (Google Cloud)
    'VERTEXAPIKEY',
    'VERTEX_GENERATION_KEY',
    // Rumble streaming
    'RUMBLE_API_KEY',
    'RUMBLE_RTMP_URL',
    'RUMBLE_STREAM_KEY',
    // Application secrets
    'DASHBOARD_PASSWORD',
  ];

  const secrets = await loadSecrets(secretNames);

  // Populate process.env
  let loadedCount = 0;
  for (const [name, value] of Object.entries(secrets)) {
    if (value) {
      process.env[name] = value;
      loadedCount++;
    }
  }

  console.log(`✅ Loaded ${loadedCount}/${secretNames.length} secrets from Secret Manager`);

  return secrets;
}

/**
 * For development: Load from .env if GCP not available
 * Falls back gracefully if Secret Manager is not accessible
 */
export async function initializeSecretsWithFallback() {
  try {
    // Try loading from Secret Manager first
    await initializeSecretsFromGCP();
  } catch (error: any) {
    console.warn('⚠️  Failed to load secrets from GCP, falling back to .env file');
    console.warn('   Error:', error.message);

    // Load from .env as fallback
    const dotenv = await import('dotenv');
    dotenv.config();
    console.log('✅ Loaded secrets from .env file (fallback mode)');
  }
}
