/**
 * GENERATE VIDEOS NOW - FIXED TO USE DYNAMIC TOPIC SELECTION
 *
 * BEFORE: Hardcoded list of 6 topics
 * AFTER: AI-powered discovery from 268+ keyword database
 */

import { autonomousGoalAgent } from './server/services/autonomous-goal-agent';
import { dynamicTopicSelector } from './server/services/dynamic-topic-selector';
import { storage } from './server/storage';

async function generateVideos() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  GENERATING 6 VIDEOS WITH LEVEL 5 AUTONOMOUS FEATURES      ║');
  console.log('║  NOW USING DYNAMIC AI-POWERED TOPIC SELECTION              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Discover 6 fresh topics
  console.log('🔍 Discovering 6 fresh topics from database...\n');
  const topics = await dynamicTopicSelector.selectTopicsForToday(6);

  if (topics.length === 0) {
    console.error('❌ No fresh topics found!');
    return [];
  }

  const results: any[] = [];

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const label = i === 0 ? 'NOW' : 'TOMORROW';
    const isShort = i !== 5; // Last one is long-form
    const type = isShort ? 'short' : 'long';

    console.log(`\n━━━ [${label}] ${topic.figure} (${type}) ━━━`);
    console.log(`    Viral: ${topic.viralPotential}/100, Intent: ${topic.intent}`);

    try {
      const result = await autonomousGoalAgent.createPackageFromGoal({
        figure: topic.figure,
        intent: topic.intent as 'viral' | 'educational' | 'controversial' | 'inspirational' | 'dramatic',
        suggestedAngle: topic.angle,
        constraints: {
          maxDuration: isShort ? 60 : 180,
          aspectRatio: isShort ? '9:16' : '16:9',
        },
      });

      console.log(`    ✅ Package created: ${result.packageId}`);
      console.log(`    📝 Angle: ${result.plan.recommendedApproach.angle.substring(0, 60)}...`);

      results.push({
        figure: topic.figure,
        packageId: result.packageId,
        label: label,
        angle: result.plan.recommendedApproach.angle,
      });

      // Start video generation job for NOW video
      if (label === 'NOW') {
        console.log(`\n    🎬 TRIGGERING VIDEO GENERATION for ${topic.figure}...`);

        const pkg = await storage.getUnityContentPackage(result.packageId);
        if (pkg?.packageData?.veoPrompts) {
          const job = await storage.createJob({
            scriptName: `${topic.figure} - Unity Kling`,
            scriptContent: `Unity video generation for: ${topic.figure}`,
            mode: 'unity_kling',
            aspectRatio: isShort ? '9:16' : '16:9',
            unityMetadata: {
              packageId: result.packageId,
              promptCount: pkg.packageData.veoPrompts.length,
              estimatedCost: pkg.packageData.veoPrompts.length * 0.1,
              automationSource: 'level5_dynamic',
            },
          });
          console.log(`       🚀 Job created: ${job.id}`);
          console.log(
            `       📹 Prompts: ${pkg.packageData.veoPrompts.length}, Est: $${(pkg.packageData.veoPrompts.length * 0.1).toFixed(2)}`,
          );
        }
      }
    } catch (error: any) {
      console.log(`    ❌ Error: ${error.message}`);
      results.push({ figure: topic.figure, error: error.message, label: label });
    }

    // Small delay between generations
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  GENERATION SUMMARY                                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const successful = results.filter((r) => r.packageId);
  const nowVideos = successful.filter((r) => r.label === 'NOW');
  const tomorrowVideos = successful.filter((r) => r.label === 'TOMORROW');

  console.log(`NOW (generating): ${nowVideos.length}`);
  nowVideos.forEach((r) => console.log(`  ✅ ${r.figure}: ${r.packageId}`));

  console.log(`\nTOMORROW (queued): ${tomorrowVideos.length}`);
  tomorrowVideos.forEach((r) => console.log(`  ✅ ${r.figure}: ${r.packageId}`));

  const failed = results.filter((r) => r.error);
  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}`);
    failed.forEach((r) => console.log(`  - ${r.figure}: ${r.error}`));
  }

  return results;
}

generateVideos().catch(console.error);
