/**
 * DYNAMIC DAILY VIDEO GENERATION
 *
 * Uses the dynamic-topic-selector to ensure unique, diverse topics
 * from the 268+ keyword database + trending topics from trend-discovery-bot.
 *
 * This script:
 * 1. Uses AI + trend discovery to find hot topics (50% trending + 50% AI)
 * 2. Checks 90-day deduplication to avoid repeats
 * 3. Selects 5 diverse topics based on viral potential
 * 4. Creates Unity packages for each topic
 * 5. Marks trending topics as "used" after package creation
 */

import { dynamicTopicSelector } from '../server/services/dynamic-topic-selector.js';
import { autonomousGoalAgent } from '../server/services/autonomous-goal-agent.js';
import { trendDiscoveryBot } from '../server/services/trend-discovery-bot.js';
import { db } from '../server/db.js';
import { unityContentPackages } from '../shared/schema.js';
import { desc } from 'drizzle-orm';

async function generateDynamicDailyVideos() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   DYNAMIC DAILY VIDEO GENERATION (AI + TRENDING Topics)   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Step 1: Discover fresh, diverse topics (50% trending + 50% AI-powered)
  console.log('🔍 Step 1: Discovering topics (50% trending + 50% AI)...\n');

  const topics = await dynamicTopicSelector.selectTopicsForToday(
    5, // 5 topics total
    90, // 90-day deduplication
    true, // Enable trending topics
    0.5, // 50% trending, 50% AI
  );

  if (topics.length === 0) {
    console.error('❌ No fresh topics found! This should not happen.');
    console.log('💡 Tip: Try clearing cache or expanding the keyword database');
    process.exit(1);
  }

  console.log(`\n✅ Selected ${topics.length} diverse topics:\n`);

  const trendingCount = topics.filter((t) => t.source === 'trending').length;
  const aiCount = topics.filter((t) => t.source === 'ai').length;

  console.log(`   🔥 ${trendingCount} from trending sources`);
  console.log(`   🤖 ${aiCount} from AI discovery\n`);

  topics.forEach((t, i) => {
    const sourceIcon = t.source === 'trending' ? '🔥 TRENDING' : '🤖 AI';
    console.log(`  ${i + 1}. ${sourceIcon} ${t.figure}`);
    console.log(`     Angle: ${t.angle}`);
    console.log(`     Viral Score: ${t.viralPotential}/100, Intent: ${t.intent}`);
    console.log('');
  });

  // Step 2: Create Unity packages for each topic (IN PARALLEL)
  console.log('\n🎬 Step 2: Creating Unity packages in parallel...\n');
  console.log('⚡ Generating all 5 packages simultaneously for maximum speed!\n');

  const results = await Promise.all(
    topics.map(async (topic, i) => {
      const isShort = i < 4; // First 4 are shorts, last one is long-form

      console.log(`\n━━━ [${i + 1}/5] ${topic.figure} (${isShort ? 'SHORT' : 'LONG'}) ━━━`);
      console.log(`    Intent: ${topic.intent}, Viral Score: ${topic.viralPotential}`);

      try {
        const result = await autonomousGoalAgent.createPackageFromGoal({
          figure: topic.figure,
          intent: topic.intent as 'viral' | 'educational' | 'controversial' | 'inspirational' | 'dramatic',
          suggestedAngle: topic.angle, // Pass the discovered angle
          constraints: {
            maxDuration: isShort ? 60 : 180,
            aspectRatio: isShort ? '9:16' : '16:9',
          },
        });

        console.log(`    ✅ Created package ${result.packageId}`);
        console.log(`    📝 Angle: ${result.plan.recommendedApproach.angle.substring(0, 70)}...`);

        // Mark trending topics as used
        if (topic.source === 'trending' && topic.trendData?.id) {
          await trendDiscoveryBot.markTrendAsUsed(topic.trendData.id, result.packageId);
          console.log(`    🔥 Marked trending topic as used`);
        }

        return {
          figure: topic.figure,
          packageId: result.packageId,
          angle: topic.angle,
        };
      } catch (error: any) {
        console.log(`    ❌ Error: ${error.message}`);
        return { figure: topic.figure, error: error.message };
      }
    }),
  );

  // Step 3: Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   GENERATION SUMMARY                                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const successful = results.filter((r) => r.packageId);
  const failed = results.filter((r) => r.error);

  console.log(`✅ Successful: ${successful.length}/5`);
  for (const r of successful) {
    console.log(`   - ${r.figure}: ${r.packageId}`);
    console.log(`     Angle: ${r.angle?.substring(0, 60)}...`);
  }

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}/5`);
    for (const r of failed) {
      console.log(`   - ${r.figure}: ${r.error}`);
    }
  }

  // Step 4: Show recent diversity
  console.log('\n📊 Topic Diversity Check:');
  const recentPackages = await db
    .select({ topic: unityContentPackages.topic, title: unityContentPackages.title })
    .from(unityContentPackages)
    .orderBy(desc(unityContentPackages.createdAt))
    .limit(20);

  const recentTopics = new Set<string>();
  for (const pkg of recentPackages) {
    const topic = pkg.topic || pkg.title.split(':')[0].trim();
    recentTopics.add(topic);
  }

  console.log(`   Last 20 videos covered ${recentTopics.size} unique topics`);
  console.log(`   Topics: ${Array.from(recentTopics).slice(0, 10).join(', ')}...`);

  // Step 5: Next steps
  console.log('\n📝 Next Steps:');
  console.log('   1. Review packages in dashboard');
  console.log('   2. Execute packages to generate videos');
  console.log('   3. Monitor video performance');
  console.log('   4. System will auto-learn from successful topics\n');

  return results;
}

generateDynamicDailyVideos()
  .then(() => {
    console.log('✅ Dynamic daily generation complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
