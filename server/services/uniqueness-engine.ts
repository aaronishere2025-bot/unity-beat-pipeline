/**
 * UNIQUENESS ENGINE - Phase 1
 *
 * Multi-level deduplication for unlimited topic explorer
 * Ensures we never repeat topics across different exploration sessions
 *
 * Phase 1 Features:
 * - Level 1: Basic normalization (lowercase, punctuation removal)
 * - Level 2: Semantic similarity via OpenAI embeddings
 *
 * Future Phases:
 * - Level 3: Phonetic matching (Metaphone/Soundex)
 * - Level 4: Historical alias detection (e.g., "Constantine" = "Constantine the Great")
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}
import { db } from '../db.js';
import { exploredTopics } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

interface UniquenessCheck {
  isUnique: boolean;
  reason: string;
  similarTopics: string[];
  similarityScore?: number;
}

export class UniquenessEngine {
  private embeddingCache: Map<string, number[]> = new Map();

  // Cache for existing topics query (avoid repeated DB hits)
  private existingTopicsCache: { data: any[]; timestamp: number; topicType: string; lookbackDays: number } | null =
    null;
  private readonly CACHE_TTL_MS = 30_000; // 30 seconds - fresh enough for batch operations

  // Similarity threshold (0-1 scale, where 1 = identical)
  // 0.92 means 92% similar or higher = considered duplicate
  private readonly SIMILARITY_THRESHOLD = 0.92;

  /**
   * Level 1: Basic normalization
   * Converts to lowercase, removes punctuation, normalizes whitespace
   */
  normalizeBasic(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove all punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Level 2: Semantic similarity via OpenAI embeddings
   * Generates vector representation of text for semantic comparison
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    if (this.embeddingCache.has(text)) {
      return this.embeddingCache.get(text)!;
    }

    try {
      const model = getGemini().getGenerativeModel({ model: 'text-embedding-004' });
      const result = await model.embedContent({
        content: { parts: [{ text }], role: 'user' },
        taskType: 'RETRIEVAL_DOCUMENT' as any,
      });

      const embedding = result.embedding.values;

      // Cache for future use
      this.embeddingCache.set(text, embedding);

      return embedding;
    } catch (error) {
      console.error('❌ Failed to generate embedding:', error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch generate embeddings - single API call for multiple texts
   * Much faster than generating one at a time
   */
  async generateEmbeddingsBatch(texts: string[]): Promise<Map<string, number[]>> {
    const results = new Map<string, number[]>();
    const uncached: string[] = [];

    // Separate cached from uncached
    for (const text of texts) {
      if (this.embeddingCache.has(text)) {
        results.set(text, this.embeddingCache.get(text)!);
      } else {
        uncached.push(text);
      }
    }

    if (uncached.length === 0) return results;

    try {
      // Gemini doesn't have a batch embedding API, so process in parallel
      const model = getGemini().getGenerativeModel({ model: 'text-embedding-004' });
      const embedPromises = uncached.map(async (text) => {
        const result = await model.embedContent({
          content: { parts: [{ text }], role: 'user' },
          taskType: 'RETRIEVAL_DOCUMENT' as any,
        });
        return result.embedding.values;
      });
      const embeddings = await Promise.all(embedPromises);

      for (let i = 0; i < uncached.length; i++) {
        this.embeddingCache.set(uncached[i], embeddings[i]);
        results.set(uncached[i], embeddings[i]);
      }

      console.log(`  🧠 Batch embedded ${uncached.length} texts (${texts.length - uncached.length} cached)`);
    } catch (error) {
      console.error('❌ Batch embedding failed, falling back to sequential:', error);
      for (const text of uncached) {
        try {
          const embedding = await this.generateEmbedding(text);
          results.set(text, embedding);
        } catch {
          console.error(`  ⚠️ Skipping embedding for: ${text}`);
        }
      }
    }

    return results;
  }

  /**
   * Get existing topics with caching (avoids repeated DB queries during batch operations)
   */
  private async getExistingTopicsCached(topicType: string, lookbackDays: number): Promise<any[]> {
    const now = Date.now();

    if (
      this.existingTopicsCache &&
      this.existingTopicsCache.topicType === topicType &&
      this.existingTopicsCache.lookbackDays === lookbackDays &&
      now - this.existingTopicsCache.timestamp < this.CACHE_TTL_MS
    ) {
      return this.existingTopicsCache.data;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    const existingTopics = await db
      .select()
      .from(exploredTopics)
      .where(sql`${exploredTopics.createdAt} > ${cutoffDate} AND ${exploredTopics.topicType} = ${topicType}`)
      .execute();

    this.existingTopicsCache = { data: existingTopics, timestamp: now, topicType, lookbackDays };
    return existingTopics;
  }

  /** Invalidate the existing topics cache (call after saving new topics) */
  invalidateCache(): void {
    this.existingTopicsCache = null;
  }

  /**
   * Calculate cosine similarity between two vectors
   * Returns value between -1 and 1 (higher = more similar)
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
    }

    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

    if (magA === 0 || magB === 0) {
      return 0;
    }

    return dotProduct / (magA * magB);
  }

  /**
   * Check if a topic is unique within the specified lookback period
   *
   * @param name - Topic name to check
   * @param topicType - Type of topic ('person', 'place', 'thing')
   * @param lookbackDays - How many days to look back (default: 365)
   * @returns UniquenessCheck result
   */
  async isTopicUnique(
    name: string,
    topicType: string = 'person',
    lookbackDays: number = 365,
  ): Promise<UniquenessCheck> {
    console.log(`🔍 Checking uniqueness: "${name}" (${topicType}, ${lookbackDays}d lookback)`);

    // Level 1: Basic normalization check
    const normalized = this.normalizeBasic(name);

    // Use cached DB query (avoids N+1 queries during batch operations)
    const existingTopics = await this.getExistingTopicsCached(topicType, lookbackDays);

    console.log(`  📊 Found ${existingTopics.length} existing ${topicType} topics in last ${lookbackDays} days`);

    // Level 1: Check for exact normalized match
    const exactMatch = existingTopics.find((t) => this.normalizeBasic(t.primaryName) === normalized);

    if (exactMatch) {
      console.log(`  ❌ DUPLICATE (exact): "${name}" = "${exactMatch.primaryName}"`);
      return {
        isUnique: false,
        reason: `Exact match: "${name}" = "${exactMatch.primaryName}"`,
        similarTopics: [exactMatch.id],
      };
    }

    // Level 2: Semantic similarity check
    // Pre-embed all existing topic names + the new name in one batch call
    const allNames = [name, ...existingTopics.map((t) => t.primaryName)];
    const embeddings = await this.generateEmbeddingsBatch(allNames);

    const newEmbedding = embeddings.get(name);
    if (!newEmbedding) {
      console.error(`  ⚠️ Could not embed "${name}", skipping semantic check`);
      return { isUnique: true, reason: 'Embedding failed - passed by default', similarTopics: [] };
    }

    let maxSimilarity = 0;
    let mostSimilarTopic: (typeof existingTopics)[0] | null = null;

    for (const topic of existingTopics) {
      const existingEmbedding = embeddings.get(topic.primaryName);
      if (!existingEmbedding) continue;

      const similarity = this.cosineSimilarity(newEmbedding, existingEmbedding);

      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarTopic = topic;
      }

      if (similarity > this.SIMILARITY_THRESHOLD) {
        console.log(
          `  ❌ DUPLICATE (semantic): "${name}" ≈ "${topic.primaryName}" (${(similarity * 100).toFixed(1)}%)`,
        );
        return {
          isUnique: false,
          reason: `Too similar (${(similarity * 100).toFixed(1)}%) to "${topic.primaryName}"`,
          similarTopics: [topic.id],
          similarityScore: similarity,
        };
      }
    }

    // Passed all checks
    if (mostSimilarTopic) {
      console.log(`  ✅ UNIQUE (closest: "${mostSimilarTopic.primaryName}" at ${(maxSimilarity * 100).toFixed(1)}%)`);
    } else {
      console.log('  ✅ UNIQUE (no similar topics found)');
    }

    return {
      isUnique: true,
      reason: 'No conflicts found',
      similarTopics: [],
      similarityScore: maxSimilarity,
    };
  }

  /**
   * Batch check multiple topics for uniqueness
   * More efficient than checking one-by-one
   */
  async batchCheckUnique(
    names: string[],
    topicType: string = 'person',
    lookbackDays: number = 365,
  ): Promise<Map<string, UniquenessCheck>> {
    console.log(`\n🔍 Batch checking ${names.length} topics for uniqueness...\n`);

    // Pre-warm: fetch existing topics and pre-embed everything in one batch
    const existingTopics = await this.getExistingTopicsCached(topicType, lookbackDays);
    const allNames = [...names, ...existingTopics.map((t) => t.primaryName)];
    await this.generateEmbeddingsBatch(allNames);

    // Now run all checks in parallel (DB + embeddings are all cached)
    const entries = await Promise.all(
      names.map(async (name) => {
        const check = await this.isTopicUnique(name, topicType, lookbackDays);
        return [name, check] as const;
      }),
    );

    const results = new Map<string, UniquenessCheck>(entries);

    const uniqueCount = Array.from(results.values()).filter((r) => r.isUnique).length;
    console.log(`\n✅ Batch check complete: ${uniqueCount}/${names.length} unique topics\n`);

    return results;
  }

  /**
   * Clear the embedding cache (useful for testing or memory management)
   */
  clearCache(): void {
    this.embeddingCache.clear();
    console.log('🗑️  Embedding cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; topics: string[] } {
    return {
      size: this.embeddingCache.size,
      topics: Array.from(this.embeddingCache.keys()),
    };
  }
}

// Export singleton instance
export const uniquenessEngine = new UniquenessEngine();
