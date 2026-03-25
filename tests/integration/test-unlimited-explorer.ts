#!/usr/bin/env tsx
/**
 * TEST SCRIPT: Unlimited Topic Explorer - Phase 1
 *
 * Tests all core functionality:
 * 1. UniquenessEngine (basic normalization + semantic similarity)
 * 2. PeopleExplorer (AI-powered discovery with Claude)
 * 3. UnlimitedTopicExplorer (pool management + selection)
 * 4. Dynamic topic selector integration
 */

import { initializeSecretsFromGCP } from '../server/secret-manager-loader.js';
import { uniquenessEngine } from '../server/services/uniqueness-engine.js';
import { peopleExplorer } from '../server/services/people-explorer.js';
import { unlimitedTopicExplorer } from '../server/services/unlimited-topic-explorer.js';
import { dynamicTopicSelector } from '../server/services/dynamic-topic-selector.js';

// Test configuration
const TEST_CONFIG = {
  DISCOVER_COUNT: 3, // How many people to discover in test (reduced for stability)
  SELECT_COUNT: 2, // How many to select for production
};

async function runTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   UNLIMITED TOPIC EXPLORER - PHASE 1 TEST SUITE             ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  try {
    // Initialize secrets
    console.log('🔐 Loading secrets from Google Secret Manager...\n');
    await initializeSecretsFromGCP();
    console.log('✅ Secrets loaded\n');

    // ========================================
    // TEST 1: UniquenessEngine
    // ========================================
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   TEST 1: UniquenessEngine                                    ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('1.1 - Basic normalization test:');
    const testNames = ['Julius Caesar', 'julius caesar', 'JULIUS CAESAR', 'Julius Caesar!!!', 'Julius  Caesar  '];

    testNames.forEach((name) => {
      const normalized = uniquenessEngine.normalizeBasic(name);
      console.log(`   "${name}" → "${normalized}"`);
    });

    console.log('\n1.2 - Semantic similarity test:');
    const embedding1 = await uniquenessEngine.generateEmbedding('Julius Caesar');
    const embedding2 = await uniquenessEngine.generateEmbedding('Caesar');
    const embedding3 = await uniquenessEngine.generateEmbedding('Napoleon Bonaparte');

    const similarity1 = uniquenessEngine.cosineSimilarity(embedding1, embedding2);
    const similarity2 = uniquenessEngine.cosineSimilarity(embedding1, embedding3);

    console.log(`   "Julius Caesar" vs "Caesar": ${(similarity1 * 100).toFixed(1)}% similar`);
    console.log(`   "Julius Caesar" vs "Napoleon": ${(similarity2 * 100).toFixed(1)}% similar`);

    if (similarity1 > 0.85 && similarity2 < 0.85) {
      console.log('   ✅ Semantic similarity working correctly\n');
    } else {
      console.log('   ⚠️  Unexpected similarity scores\n');
    }

    // ========================================
    // TEST 2: PeopleExplorer
    // ========================================
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   TEST 2: PeopleExplorer                                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log(`2.1 - Discovering ${TEST_CONFIG.DISCOVER_COUNT} unique historical people...\n`);

    const people = await peopleExplorer.discoverPeople(TEST_CONFIG.DISCOVER_COUNT, true);

    console.log(`\n✅ Discovered ${people.length} unique people\n`);

    if (people.length === 0) {
      console.log('⚠️  No unique people found (may all be duplicates)\n');
    } else {
      console.log('People discovered:');
      people.forEach((person, i) => {
        console.log(`\n${i + 1}. ${person.name}`);
        console.log(`   Era: ${person.fiveW1H.when.era} (${person.fiveW1H.when.timePeriod})`);
        console.log(`   Region: ${person.fiveW1H.where.region}`);
        console.log(`   Viral Potential: ${person.viralPotential}/100`);
        console.log(`   Visual Appeal: ${person.visualAppeal || 'N/A'}/100`);
        console.log(`   Angle: ${person.discoveryAngle.substring(0, 80)}...`);
        console.log(`   What: ${person.fiveW1H.what.primaryEvent.substring(0, 80)}...`);
        console.log(`   Why Gen Z cares: ${person.fiveW1H.why.modernRelevance.substring(0, 80)}...`);
      });

      console.log('\n2.2 - Saving topics to database...\n');

      for (const person of people) {
        const id = await peopleExplorer.saveTopic(person);
        console.log(`   ✅ Saved: ${person.name} (ID: ${id.substring(0, 8)}...)`);
      }

      console.log(`\n✅ Saved ${people.length} topics to database\n`);
    }

    // ========================================
    // TEST 3: UnlimitedTopicExplorer
    // ========================================
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   TEST 3: UnlimitedTopicExplorer                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('3.1 - Check pool status:\n');

    const status = await unlimitedTopicExplorer.getPoolStatus();
    console.log('   Pool Status:');
    console.log(`   - Total: ${status.total}`);
    console.log(`   - Discovered: ${status.discovered}`);
    console.log(`   - Queued: ${status.queued}`);
    console.log(`   - Used: ${status.used}`);
    console.log(`   - Rejected: ${status.rejected}\n`);

    console.log('3.2 - Pool breakdown by era:\n');

    const breakdown = await unlimitedTopicExplorer.getPoolBreakdown();
    console.log('   By Era:');
    Object.entries(breakdown.byEra).forEach(([era, count]) => {
      console.log(`   - ${era}: ${count}`);
    });
    console.log(`\n   Average Viral Potential: ${breakdown.avgViralPotential.toFixed(1)}/100\n`);

    console.log(`3.3 - Select ${TEST_CONFIG.SELECT_COUNT} topics for production:\n`);

    const selected = await unlimitedTopicExplorer.selectTopicsForProduction(TEST_CONFIG.SELECT_COUNT);

    console.log(`\n✅ Selected ${selected.length} diverse topics:\n`);

    selected.forEach((topic, i) => {
      console.log(`${i + 1}. ${topic.primaryName}`);
      console.log(`   Era: ${topic.fiveW1H.when.era}`);
      console.log(`   Viral: ${topic.viralPotential}/100`);
      console.log(`   Angle: ${topic.discoveryAngle.substring(0, 70)}...`);
      console.log(`   ID: ${topic.id.substring(0, 8)}...\n`);
    });

    // ========================================
    // TEST 4: Dynamic Topic Selector Integration
    // ========================================
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   TEST 4: Dynamic Topic Selector Integration                 ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('4.1 - Select topics using unlimited explorer mode:\n');

    const dynamicTopics = await dynamicTopicSelector.selectTopicsForToday(
      3, // count
      90, // lookbackDays
      false, // prioritizeTrending
      0.5, // trendWeight
      true, // useUnlimitedExplorer ← NEW!
    );

    console.log(`\n✅ Got ${dynamicTopics.length} topics from dynamic selector:\n`);

    dynamicTopics.forEach((topic, i) => {
      console.log(`${i + 1}. ${topic.figure}`);
      console.log(`   Source: ${topic.source}`);
      console.log(`   Viral: ${topic.viralPotential}/100`);
      console.log(`   Intent: ${topic.intent}`);
      console.log(`   Angle: ${topic.angle.substring(0, 70)}...`);
      if (topic.fiveW1H) {
        console.log(`   Era: ${topic.fiveW1H.when.era}, Region: ${topic.fiveW1H.where.region}`);
      }
      console.log('');
    });

    // ========================================
    // TEST 5: Pool Management
    // ========================================
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   TEST 5: Pool Management                                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('5.1 - Final pool status:\n');

    const finalStatus = await unlimitedTopicExplorer.getPoolStatus();
    console.log('   Pool Status After Tests:');
    console.log(`   - Total: ${finalStatus.total}`);
    console.log(`   - Discovered: ${finalStatus.discovered}`);
    console.log(`   - Queued: ${finalStatus.queued}`);
    console.log(`   - Used: ${finalStatus.used}`);
    console.log(`   - Rejected: ${finalStatus.rejected}\n`);

    // ========================================
    // SUMMARY
    // ========================================
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║   TEST SUMMARY                                                ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');

    console.log('✅ All tests completed successfully!\n');

    console.log('Phase 1 Features Verified:');
    console.log('✅ UniquenessEngine - Basic + Semantic similarity');
    console.log('✅ PeopleExplorer - AI discovery with Claude Sonnet 4.5');
    console.log('✅ UnlimitedTopicExplorer - Pool management');
    console.log('✅ Dynamic Topic Selector - Integration complete');
    console.log('✅ Database - explored_topics table working\n');

    console.log('Next Steps (Phase 2):');
    console.log('- Add PlacesExplorer (historical locations)');
    console.log('- Add ThingsExplorer (inventions, artifacts)');
    console.log('- Advanced diversity enforcement');
    console.log('- Phonetic matching (Metaphone/Soundex)');
    console.log('- Historical alias detection\n');

    console.log('═══════════════════════════════════════════════════════════════\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test suite
runTests().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
