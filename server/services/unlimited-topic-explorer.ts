/**
 * UNLIMITED TOPIC EXPLORER - Phase 1
 *
 * Main orchestrator for discovering truly unique historical topics
 * Manages topic pool, ensures diversity, and provides topics for daily generation
 *
 * Phase 1 Features:
 * - People-only discovery (no places/things yet)
 * - Pool-based architecture (pre-generate topics in batches)
 * - Simple diversity enforcement (era-based)
 * - Integration with dynamic-topic-selector
 *
 * Future Phases:
 * - Places explorer (historical locations, lost cities)
 * - Things explorer (inventions, artifacts, concepts)
 * - Advanced diversity enforcement (culture, story type, themes)
 * - Scheduled pool maintenance (cron job)
 */

import { peopleExplorer } from './people-explorer.js';
import { trendDiscoveryBot } from './trend-discovery-bot.js';
import { trendEnricher } from './trend-enricher.js';
import { db } from '../db.js';
import { exploredTopics } from '@shared/schema';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';

interface PoolStatus {
  total: number;
  discovered: number;
  queued: number;
  used: number;
  rejected: number;
}

interface TopicSelection {
  id: string;
  primaryName: string;
  fiveW1H: any;
  viralPotential: number;
  discoveryAngle: string;
  topicType: string;
}

export class UnlimitedTopicExplorer {
  // Pool configuration
  private readonly MIN_POOL_SIZE = 20; // Refill when below this
  private readonly TARGET_POOL_SIZE = 50; // Aim for this many ready topics
  private readonly REFILL_BATCH_SIZE = 10; // Generate this many per refill
  private readonly AI_BATCH_SIZE = 15; // People per Claude call (was 5)
  private readonly MAX_PARALLEL_AI = 3; // Max parallel Claude calls

  /**
   * Get current pool status
   * Shows how many topics are in each state
   */
  async getPoolStatus(): Promise<PoolStatus> {
    const counts = await db
      .select({
        status: exploredTopics.status,
        count: sql<number>`count(*)::int`,
      })
      .from(exploredTopics)
      .groupBy(exploredTopics.status)
      .execute();

    const statusMap = Object.fromEntries(counts.map((c) => [c.status, c.count]));

    const status: PoolStatus = {
      total: counts.reduce((sum, c) => sum + c.count, 0),
      discovered: statusMap.discovered || 0,
      queued: statusMap.queued || 0,
      used: statusMap.used || 0,
      rejected: statusMap.rejected || 0,
    };

    return status;
  }

  /**
   * Select topics from the pool for production use
   * Automatically refills pool if running low
   *
   * @param count - Number of topics to select
   * @returns Array of selected topics with full 5W1H context
   */
  async selectTopicsForProduction(count: number = 5): Promise<TopicSelection[]> {
    console.log(`\n📦 Selecting ${count} topics from explored pool...\n`);

    // Check pool status first
    const status = await this.getPoolStatus();
    console.log(`📊 Pool status before selection:`);
    console.log(`   Discovered: ${status.discovered}`);
    console.log(`   Queued: ${status.queued}`);
    console.log(`   Used: ${status.used}`);
    console.log(`   Total: ${status.total}\n`);

    // Refill if needed
    if (status.discovered < this.MIN_POOL_SIZE) {
      console.log(`⚠️  Pool low (${status.discovered} < ${this.MIN_POOL_SIZE}), refilling...\n`);
      await this.refillPool();
    }

    // Get discovered topics with highest viral potential
    // Get 2x what we need for diversity selection
    const candidates = await db
      .select()
      .from(exploredTopics)
      .where(eq(exploredTopics.status, 'discovered'))
      .orderBy(desc(exploredTopics.viralPotential))
      .limit(count * 2)
      .execute();

    if (candidates.length < count) {
      console.log(`⚠️  Not enough topics in pool (${candidates.length} < ${count})`);
      console.log(`   Generating ${count - candidates.length} more topics...\n`);
      await this.refillPool(count - candidates.length);

      // Retry selection
      return this.selectTopicsForProduction(count);
    }

    // Apply simple diversity selection (spread across eras)
    const diverse = this.selectDiverseSubset(candidates, count);

    console.log(`\n✅ Selected ${diverse.length} diverse topics:\n`);
    diverse.forEach((topic, i) => {
      const era = topic.fiveW1H?.when?.era || 'unknown';
      console.log(`  ${i + 1}. ${topic.primaryName} (${era}, viral: ${topic.viralPotential})`);
      console.log(`     ${topic.discoveryAngle.substring(0, 80)}...`);
    });

    // Mark selected topics as 'queued'
    const selectedIds = diverse.map((t) => t.id);
    if (selectedIds.length > 0) {
      await db
        .update(exploredTopics)
        .set({ status: 'queued', updatedAt: new Date() })
        .where(inArray(exploredTopics.id, selectedIds))
        .execute();
    }

    console.log(`\n📊 Topics marked as 'queued'\n`);

    return diverse.map((t) => ({
      id: t.id,
      primaryName: t.primaryName,
      fiveW1H: t.fiveW1H,
      viralPotential: t.viralPotential,
      discoveryAngle: t.discoveryAngle,
      topicType: t.topicType,
    }));
  }

  /**
   * Refill the pool with new topics
   * Discovers and saves new topics to reach target pool size
   *
   * @param minCount - Minimum number of topics to generate (default: REFILL_BATCH_SIZE)
   * @param includeTrends - Whether to include YouTube trends (default: true)
   */
  async refillPool(minCount?: number, includeTrends: boolean = true): Promise<void> {
    const targetCount = minCount || this.REFILL_BATCH_SIZE;
    const startTime = Date.now();
    console.log(`\n🔄 Refilling topic pool (generating ${targetCount} new topics)...\n`);

    try {
      if (includeTrends) {
        // Hybrid approach - 50% from trends, 50% from AI
        const trendCount = Math.ceil(targetCount * 0.5);
        const aiCount = targetCount - trendCount;

        console.log(`   📊 Mix: ${trendCount} from YouTube trends + ${aiCount} from AI discovery\n`);

        // Run trends and AI discovery IN PARALLEL
        const [trendResult, aiResult] = await Promise.allSettled([
          this.discoverFromTrendsParallel(trendCount),
          this.discoverFromAIParallel(aiCount),
        ]);

        let totalSaved = 0;

        if (trendResult.status === 'fulfilled') {
          totalSaved += trendResult.value;
          console.log(`   ✅ Trends: ${trendResult.value} topics saved`);
        } else {
          console.error(`   ⚠️ Trends failed: ${trendResult.reason}`);
        }

        if (aiResult.status === 'fulfilled') {
          totalSaved += aiResult.value;
          console.log(`   ✅ AI: ${aiResult.value} topics saved`);
        } else {
          console.error(`   ⚠️ AI discovery failed: ${aiResult.reason}`);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Pool refilled: Added ${totalSaved} new topics (trends + AI) in ${elapsed}s\n`);
      } else {
        // Pure AI discovery
        const totalSaved = await this.discoverFromAIParallel(targetCount);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ Pool refilled: Added ${totalSaved} new topics in ${elapsed}s\n`);
      }

      // Show updated pool status
      const status = await this.getPoolStatus();
      console.log(`📊 Pool status after refill:`);
      console.log(`   Discovered: ${status.discovered}`);
      console.log(`   Total: ${status.total}\n`);
    } catch (error) {
      console.error('❌ Pool refill failed:', error);
      throw error;
    }
  }

  /**
   * Parallel AI discovery - splits work into parallel Claude calls
   * Each call discovers AI_BATCH_SIZE people, up to MAX_PARALLEL_AI concurrent
   */
  private async discoverFromAIParallel(targetCount: number): Promise<number> {
    const batchSize = this.AI_BATCH_SIZE;
    const batches: number[] = [];
    let remaining = targetCount;

    // Split into batches of AI_BATCH_SIZE
    while (remaining > 0) {
      const thisBatch = Math.min(batchSize, remaining);
      batches.push(thisBatch);
      remaining -= thisBatch;
    }

    console.log(
      `   🤖 AI discovery: ${batches.length} batch(es) of up to ${batchSize} people (max ${this.MAX_PARALLEL_AI} parallel)...\n`,
    );

    let totalSaved = 0;

    // Process batches with limited parallelism
    for (let i = 0; i < batches.length; i += this.MAX_PARALLEL_AI) {
      const chunk = batches.slice(i, i + this.MAX_PARALLEL_AI);
      const chunkNum = Math.floor(i / this.MAX_PARALLEL_AI) + 1;
      console.log(`   Parallel chunk ${chunkNum}: ${chunk.length} batch(es) of [${chunk.join(', ')}] people...`);

      const results = await Promise.allSettled(chunk.map((count) => peopleExplorer.discoverAndSave(count)));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalSaved += result.value.length;
        } else {
          console.error(`   ⚠️ Batch failed: ${result.reason}`);
          // Retry once with smaller batch
          try {
            const retryIds = await peopleExplorer.discoverAndSave(3);
            totalSaved += retryIds.length;
          } catch {
            console.error('   ❌ Retry also failed, skipping');
          }
        }
      }

      console.log(`   ✅ Chunk ${chunkNum} done: ${totalSaved} total saved so far`);
    }

    return totalSaved;
  }

  /**
   * Parallel trend discovery - fetches trends then enriches in parallel
   */
  private async discoverFromTrendsParallel(trendCount: number): Promise<number> {
    const trends = await trendDiscoveryBot.getActiveTrends(trendCount * 2);

    if (trends.length === 0) {
      console.warn('   ⚠️ No active trends available');
      return 0;
    }

    console.log(`   🔥 Found ${trends.length} active trending topics\n`);

    // Enrich trends in parallel (enrichBatch now parallelized)
    const enrichedTrends = await trendEnricher.enrichBatch(trends.slice(0, trendCount));

    // Save enriched trends in parallel
    const saveResults = await Promise.allSettled(enrichedTrends.map((enriched) => this.saveEnrichedTrend(enriched)));

    let saved = 0;
    for (const result of saveResults) {
      if (result.status === 'fulfilled') {
        saved++;
      } else {
        console.error(`   ⚠️ Failed to save enriched trend`);
      }
    }

    console.log(`   ✅ Added ${saved} enriched trending topics\n`);
    return saved;
  }

  /**
   * Save enriched trending topic to exploredTopics
   */
  private async saveEnrichedTrend(enriched: any): Promise<string> {
    const result = await db
      .insert(exploredTopics)
      .values({
        topicType: enriched.topicType,
        primaryName: enriched.name,
        normalizedName: this.normalizeTopic(enriched.name),
        fiveW1H: enriched.fiveW1H,
        viralPotential: enriched.viralPotential,
        discoveryAngle: enriched.discoveryAngle,
        visualAppeal: enriched.visualAppeal || null,
        status: 'discovered',
        // Store trend metadata in exploredTopics for tracking
        sourceMetadata: enriched.trendData,
      })
      .returning({ id: exploredTopics.id });

    console.log(
      `   💾 Saved trending topic: ${enriched.name} (${enriched.topicType}, viral: ${enriched.viralPotential})`,
    );
    return result[0].id;
  }

  /**
   * Normalize topic name for comparison
   */
  private normalizeTopic(topic: string): string {
    return topic
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Discover topics from YouTube trends (convenience method)
   */
  async discoverFromTrends(count: number = 5): Promise<any[]> {
    console.log(`🔥 Discovering ${count} topics from YouTube trends...\n`);

    // Get trending topics
    const trends = await trendDiscoveryBot.getActiveTrends(count * 2);

    if (trends.length === 0) {
      console.warn('⚠️ No trending topics available');
      return [];
    }

    console.log(`   Found ${trends.length} active trending topics\n`);

    // Enrich with 5W1H
    const enriched = await trendEnricher.enrichBatch(trends.slice(0, count));

    // Save to database
    for (const topic of enriched) {
      try {
        await this.saveEnrichedTrend(topic);
      } catch (error) {
        console.error(`   Failed to save: ${topic.name}`);
      }
    }

    console.log(`✅ Discovered and saved ${enriched.length} trending topics\n`);
    return enriched;
  }

  /**
   * Simple diversity selection - spread topics across eras
   * Phase 1: Just ensures we don't pick all ancient or all modern
   *
   * @param topics - Candidate topics
   * @param count - Number to select
   * @returns Diverse subset of topics
   */
  private selectDiverseSubset(topics: any[], count: number): any[] {
    const eras = ['ancient', 'medieval', 'modern'];
    const selected: any[] = [];

    // Try to get at least one from each era
    for (const era of eras) {
      const match = topics.find((t) => t.fiveW1H?.when?.era === era && !selected.find((s) => s.id === t.id));
      if (match) {
        selected.push(match);
      }
      if (selected.length >= count) {
        break;
      }
    }

    // Fill remaining slots with highest viral potential (that aren't already selected)
    while (selected.length < count && topics.length > selected.length) {
      const next = topics.find((t) => !selected.find((s) => s.id === t.id));
      if (next) {
        selected.push(next);
      } else {
        break;
      }
    }

    return selected.slice(0, count);
  }

  /**
   * Mark a topic as used (after generating video)
   *
   * @param topicId - ID of the topic
   * @param packageId - Unity package ID that used this topic
   */
  async markTopicAsUsed(topicId: string, packageId: string): Promise<void> {
    await db
      .update(exploredTopics)
      .set({
        status: 'used',
        usedInPackageId: packageId,
        usedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(exploredTopics.id, topicId))
      .execute();

    console.log(`✅ Topic ${topicId} marked as used (package: ${packageId})`);
  }

  /**
   * Reject a topic (if it fails quality checks)
   *
   * @param topicId - ID of the topic
   * @param reason - Why it was rejected
   */
  async rejectTopic(topicId: string, reason: string): Promise<void> {
    await db
      .update(exploredTopics)
      .set({
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(exploredTopics.id, topicId))
      .execute();

    console.log(`❌ Topic ${topicId} rejected: ${reason}`);
  }

  /**
   * Get detailed pool breakdown by era and type
   * Useful for monitoring diversity
   */
  async getPoolBreakdown(): Promise<{
    byEra: Record<string, number>;
    byType: Record<string, number>;
    avgViralPotential: number;
  }> {
    const topics = await db.select().from(exploredTopics).where(eq(exploredTopics.status, 'discovered')).execute();

    const byEra: Record<string, number> = {};
    const byType: Record<string, number> = {};
    let totalViral = 0;

    for (const topic of topics) {
      const era = topic.fiveW1H?.when?.era || 'unknown';
      byEra[era] = (byEra[era] || 0) + 1;
      byType[topic.topicType] = (byType[topic.topicType] || 0) + 1;
      totalViral += topic.viralPotential;
    }

    return {
      byEra,
      byType,
      avgViralPotential: topics.length > 0 ? totalViral / topics.length : 0,
    };
  }

  /**
   * Force pool refresh - clear all 'discovered' topics and generate fresh batch
   * Useful for testing or if pool quality is poor
   */
  async forceRefresh(): Promise<void> {
    console.log('\n🔄 FORCE REFRESH: Clearing discovered pool and generating fresh topics...\n');

    // Mark all discovered topics as rejected (with reason)
    await db
      .update(exploredTopics)
      .set({
        status: 'rejected',
        rejectionReason: 'Force refresh - pool cleared',
        updatedAt: new Date(),
      })
      .where(eq(exploredTopics.status, 'discovered'))
      .execute();

    console.log('✅ Cleared old pool\n');

    // Refill with fresh topics
    await this.refillPool(this.TARGET_POOL_SIZE);
  }
}

// Export singleton instance
export const unlimitedTopicExplorer = new UnlimitedTopicExplorer();
