/**
 * DAILY VIDEO GENERATION - NOW USES DYNAMIC TOPIC SELECTION
 *
 * This script now uses the dynamic-topic-selector to avoid repeating topics.
 * It will:
 * 1. Query the 268+ keyword database
 * 2. Use AI to discover fresh angles
 * 3. Check 90-day deduplication to avoid repeats
 * 4. Select 5 diverse topics based on viral potential
 *
 * OLD BEHAVIOR: Hardcoded list (always same 5 figures)
 * NEW BEHAVIOR: AI-powered discovery from full database
 */

import { autonomousGoalAgent } from '../server/services/autonomous-goal-agent.js';
import { dynamicTopicSelector } from '../server/services/dynamic-topic-selector.js';
import { db } from '../server/db.js';
import { sql } from 'drizzle-orm';

async function generateDailyVideos() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      GENERATING 5 VIDEOS FOR TOMORROW (4+1 DAILY MIX)     ║');
  console.log('║      NOW USING DYNAMIC TOPIC SELECTION (AI-POWERED)        ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // STEP 1: Discover fresh topics using AI + 90-day deduplication
  console.log('🔍 Discovering fresh topics from 268+ keyword database...\n');

  const topics = await dynamicTopicSelector.selectTopicsForToday(5);

  if (topics.length === 0) {
    console.error('❌ No fresh topics found!');
    return [];
  }

  console.log(`✅ Selected ${topics.length} diverse topics\n`);

  const results: Array<{ figure: string; packageId?: string; error?: string }> = [];

  // STEP 2: Create packages for discovered topics
  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const isShort = i < 4; // First 4 are shorts, last is long-form
    const type = isShort ? 'short' : 'long';

    console.log(`\n━━━ [${i + 1}/5] ${topic.figure} (${type}) ━━━`);
    console.log(`    Viral Score: ${topic.viralPotential}/100, Intent: ${topic.intent}`);
    console.log(`    Angle: ${topic.angle.substring(0, 70)}...`);

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

      console.log(`    ✓ Created package ${result.packageId}`);
      results.push({ figure: topic.figure, packageId: result.packageId });
    } catch (error: any) {
      console.log(`    ✗ Error: ${error.message}`);
      results.push({ figure: topic.figure, error: error.message });
    }

    // Small delay between generations to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      GENERATION SUMMARY                                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const successful = results.filter((r) => r.packageId);
  const failed = results.filter((r) => r.error);

  console.log(`✓ Successful: ${successful.length}/5`);
  for (const r of successful) {
    console.log(`  - ${r.figure}: ${r.packageId}`);
  }

  if (failed.length > 0) {
    console.log(`\n✗ Failed: ${failed.length}/5`);
    for (const r of failed) {
      console.log(`  - ${r.figure}: ${r.error}`);
    }
  }

  // Check database
  console.log('\n📦 All packages in database:');
  const packages = await db.execute(sql`
    SELECT id, title, status, "createdAt" 
    FROM unity_content_packages 
    ORDER BY "createdAt" DESC 
    LIMIT 10
  `);

  for (const pkg of packages.rows) {
    console.log(`  - ${pkg.id}: ${pkg.title} (${pkg.status})`);
  }

  return results;
}

generateDailyVideos().catch(console.error);
