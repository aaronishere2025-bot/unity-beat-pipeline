/**
 * TOMORROW VIDEOS - NOW USES DYNAMIC TOPIC SELECTION
 *
 * FIXED: No longer hardcoded topics. Uses AI-powered discovery
 * from 268+ keyword database with 90-day deduplication.
 */

import { autonomousGoalAgent } from './server/services/autonomous-goal-agent';
import { dynamicTopicSelector } from './server/services/dynamic-topic-selector';

async function generateTomorrowVideos() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  GENERATING 5 VIDEOS FOR TOMORROW (4 shorts + 1 long)      ║');
  console.log('║  NOW USING DYNAMIC AI-POWERED TOPIC SELECTION              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Discover fresh, diverse topics
  console.log('🔍 Discovering fresh topics from database...\n');
  const topics = await dynamicTopicSelector.selectTopicsForToday(5);

  if (topics.length === 0) {
    console.error('❌ No fresh topics found!');
    return [];
  }

  const results: any[] = [];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const isLong = i === 4; // Last one is long-form
    const type = isLong ? 'LONG' : 'SHORT';

    console.log(`\n━━━ [${i + 1}/5] ${topic.figure} (${type}) ━━━`);
    console.log(`    Viral: ${topic.viralPotential}/100, Intent: ${topic.intent}`);

    try {
      const result = await autonomousGoalAgent.createPackageFromGoal({
        figure: topic.figure,
        intent: topic.intent as 'viral' | 'educational' | 'controversial' | 'inspirational' | 'dramatic',
        suggestedAngle: topic.angle,
        constraints: {
          maxDuration: isLong ? 180 : 60,
          aspectRatio: isLong ? '16:9' : '9:16',
        },
      });

      console.log(`    ✅ Package: ${result.packageId}`);
      console.log(`    📝 Angle: ${result.plan.recommendedApproach.angle.substring(0, 50)}...`);

      results.push({ figure: topic.figure, packageId: result.packageId, success: true });
    } catch (error: any) {
      console.log(`    ❌ Error: ${error.message.substring(0, 80)}`);
      results.push({ figure: topic.figure, error: error.message, success: false });
    }

    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const success = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log(`\n✅ Created: ${success.length}/5`);
  success.forEach((r) => console.log(`   - ${r.figure}: ${r.packageId}`));

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}/5`);
    failed.forEach((r) => console.log(`   - ${r.figure}: ${r.error?.substring(0, 60)}`));
  }

  return results;
}

generateTomorrowVideos()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
