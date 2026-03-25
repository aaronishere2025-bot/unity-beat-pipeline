#!/usr/bin/env tsx
/**
 * Check Unlimited Explorer Pool Status
 *
 * Quick utility to view current pool status and breakdown
 */

import { initializeSecretsFromGCP } from '../server/secret-manager-loader.js';
import { unlimitedTopicExplorer } from '../server/services/unlimited-topic-explorer.js';
import { db } from '../server/db.js';
import { exploredTopics } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function checkPoolStatus() {
  console.log('🔍 Checking Unlimited Explorer Pool Status...\n');

  try {
    await initializeSecretsFromGCP();

    // Get overall status
    const status = await unlimitedTopicExplorer.getPoolStatus();

    console.log('📊 Pool Status:');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`  Total Topics:      ${status.total}`);
    console.log(`  ├─ Discovered:     ${status.discovered} (ready to use)`);
    console.log(`  ├─ Queued:         ${status.queued} (selected for production)`);
    console.log(`  ├─ Used:           ${status.used} (already generated)`);
    console.log(`  └─ Rejected:       ${status.rejected} (quality issues)\n`);

    // Get breakdown
    const breakdown = await unlimitedTopicExplorer.getPoolBreakdown();

    console.log('📈 Pool Breakdown:');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('  By Era:');
    Object.entries(breakdown.byEra).forEach(([era, count]) => {
      const percentage = ((count / status.discovered) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(count / 2));
      console.log(`    ${era.padEnd(10)}: ${count.toString().padStart(3)} (${percentage.padStart(5)}%) ${bar}`);
    });

    console.log('\n  By Type:');
    Object.entries(breakdown.byType).forEach(([type, count]) => {
      const percentage = ((count / status.discovered) * 100).toFixed(1);
      console.log(`    ${type.padEnd(10)}: ${count.toString().padStart(3)} (${percentage.padStart(5)}%)`);
    });

    console.log(`\n  Average Viral Potential: ${breakdown.avgViralPotential.toFixed(1)}/100\n`);

    // Show sample topics with source info
    console.log('🔍 Sample Topics (Top 5):');
    console.log('═══════════════════════════════════════════════════════\n');

    const sampleTopics = await db
      .select()
      .from(exploredTopics)
      .where(eq(exploredTopics.status, 'discovered'))
      .orderBy(exploredTopics.viralPotential)
      .limit(5)
      .execute();

    sampleTopics.forEach((topic, i) => {
      const typeIcon = topic.topicType === 'person' ? '👤' : topic.topicType === 'place' ? '📍' : '🔧';
      const era = topic.fiveW1H?.when?.era || 'unknown';
      const source = topic.sourceMetadata ? '🔥 Trending' : '🤖 AI';

      console.log(`  ${i + 1}. ${typeIcon} ${topic.primaryName} (${source})`);
      console.log(`     Era: ${era}, Viral: ${topic.viralPotential}`);
      console.log(`     ${topic.discoveryAngle.substring(0, 70)}...`);
      console.log('');
    });

    // Count topics by source
    const allTopics = await db.select().from(exploredTopics).where(eq(exploredTopics.status, 'discovered')).execute();

    const sourceBreakdown = {
      trending: allTopics.filter((t) => t.sourceMetadata !== null).length,
      ai: allTopics.filter((t) => t.sourceMetadata === null).length,
    };

    console.log('📊 Source Breakdown:');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`  🔥 YouTube Trends: ${sourceBreakdown.trending}`);
    console.log(`  🤖 AI Discovery:   ${sourceBreakdown.ai}`);
    console.log('');

    // Health check
    const MIN_POOL = 20;
    const TARGET_POOL = 50;

    console.log('🏥 Pool Health:');
    console.log('═══════════════════════════════════════════════════════\n');

    if (status.discovered >= TARGET_POOL) {
      console.log('  ✅ HEALTHY - Pool is at target capacity');
    } else if (status.discovered >= MIN_POOL) {
      console.log(`  ⚠️  LOW - Pool has ${status.discovered}/${TARGET_POOL} topics`);
      console.log(`      Consider refilling to reach target`);
    } else {
      console.log(`  ❌ CRITICAL - Pool has only ${status.discovered}/${MIN_POOL} topics`);
      console.log(`      Auto-refill will trigger on next selection`);
    }

    console.log('\n═══════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

checkPoolStatus();
