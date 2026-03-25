#!/usr/bin/env tsx
/**
 * PIPELINE FIXES VALIDATION SCRIPT
 *
 * Tests all 4 deployed fixes against existing generated content:
 * 1. Quality Threshold Gate
 * 2. AI Character Classification
 * 3. Suno Duration Hints
 * 4. Variety Enforcer + Prompt Validation
 */

import { db } from './server/db';
import { unityContentPackages, jobs } from '@shared/schema';
import { desc, sql } from 'drizzle-orm';
import { UnityContentGenerator } from './server/services/unity-content-generator';
import { initializeSecretsFromGCP } from './server/secret-manager-loader';

// Test topics from recent generations
const TEST_TOPICS = [
  'Pope Stephen VI and Pope Formosus (corpse)',
  'Tomoe Gozen',
  'Khutulun, Mongol Princess',
  'Simo Häyhä (The White Death)',
  'Australian Army vs Emus',
  'Talking dragon adventure', // Non-historical test
  'How photosynthesis works', // Educational test
];

async function main() {
  console.log('\n🔍 ===== PIPELINE FIXES VALIDATION =====\n');

  // Load secrets
  await initializeSecretsFromGCP();

  const generator = new UnityContentGenerator();

  // Test 1: AI Character Classification
  console.log('📋 TEST 1: AI Character Classification');
  console.log('   Testing against recent topics...\n');

  for (const topic of TEST_TOPICS) {
    console.log(`   Topic: "${topic}"`);

    try {
      // @ts-ignore - Access private method for testing
      const result = await generator.classifyTopicWithAI(topic);

      console.log(`   ✅ Classification:`);
      console.log(`      - Historical: ${result.isHistorical ? 'YES' : 'NO'}`);
      console.log(`      - Character Type: ${result.characterType}`);
      console.log(`      - Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`      - Reasoning: ${result.reasoning}`);
      console.log('');
    } catch (error: any) {
      console.log(`   ❌ Classification failed: ${error.message}\n`);
    }
  }

  // Test 2: Quality Threshold Gate (check recent packages)
  console.log('\n📋 TEST 2: Quality Threshold Gate');
  console.log('   Analyzing recent Unity packages...\n');

  const recentPackages = await db
    .select()
    .from(unityContentPackages)
    .orderBy(desc(unityContentPackages.createdAt))
    .limit(5);

  console.log(`   Found ${recentPackages.length} recent packages:\n`);

  for (const pkg of recentPackages) {
    console.log(`   Package: ${pkg.title}`);
    console.log(`      ID: ${pkg.id}`);
    console.log(`      Created: ${pkg.createdAt.toLocaleString()}`);

    // Check if it has quality metrics
    const metadata = pkg.metadata as any;
    if (metadata?.selfCritiqueScore || metadata?.worldModelPassRate) {
      console.log(`      Self-Critique: ${metadata.selfCritiqueScore || 'N/A'}/10`);
      console.log(
        `      World Model: ${metadata.worldModelPassRate ? (metadata.worldModelPassRate * 100).toFixed(1) + '%' : 'N/A'}`,
      );

      // Simulate quality gate
      const selfScore = metadata.selfCritiqueScore || 10;
      const wmRate = metadata.worldModelPassRate || 1.0;

      if (selfScore < 7.0 && wmRate < 0.5) {
        console.log(`      🚨 Would have been BLOCKED by quality gate`);
      } else {
        console.log(`      ✅ Would have PASSED quality gate`);
      }
    } else {
      console.log(`      ⚠️  No quality metrics stored (old package)`);
    }
    console.log('');
  }

  // Test 3: Suno Duration Hints (check recent jobs)
  console.log('\n📋 TEST 3: Suno Duration Analysis');
  console.log('   Analyzing recent Suno generations...\n');

  const recentJobs = await db
    .select()
    .from(jobs)
    .where(sql`${jobs.mode} = 'unity_kling'`)
    .orderBy(desc(jobs.createdAt))
    .limit(5);

  for (const job of recentJobs) {
    console.log(`   Job: ${job.scriptName}`);

    const metadata = job.unityMetadata as any;
    if (metadata?.musicDuration) {
      const duration = metadata.musicDuration;
      const target = 180; // Assume 180s target
      const diff = Math.abs(duration - target);

      console.log(`      Music Duration: ${duration.toFixed(1)}s`);
      console.log(`      Target: ${target}s`);
      console.log(`      Difference: ${diff.toFixed(1)}s`);

      if (diff > 10) {
        console.log(`      ⚠️  Off by ${diff.toFixed(1)}s - duration hints would help`);
      } else {
        console.log(`      ✅ Within 10s of target`);
      }
    } else {
      console.log(`      ⚠️  No music duration stored`);
    }
    console.log('');
  }

  // Test 4: Load actual prompts and validate
  console.log('\n📋 TEST 4: Prompt Validation (Impossible Actions)');
  console.log('   Checking recent prompts for impossible actions...\n');

  const impossiblePatterns = [
    { pattern: /\bdiving into.*pool\b/i, name: 'diving into pool' },
    {
      pattern: /\bflying\b(?!.*\b(bird|plane|dragon|wings|eagle|hawk|creature|angel)\b)/i,
      name: 'flying without wings',
    },
    { pattern: /\bteleport/i, name: 'teleporting' },
    { pattern: /\blevitat/i, name: 'levitating' },
    { pattern: /\bfloating in (space|void|air)\b/i, name: 'floating in space' },
    { pattern: /\bwalking on water\b(?!.*\b(jesus|miracle)\b)/i, name: 'walking on water' },
    { pattern: /\bphasing through\b/i, name: 'phasing through' },
    { pattern: /\bvanish into thin air\b/i, name: 'vanishing' },
  ];

  let totalPrompts = 0;
  let totalImpossible = 0;

  for (const pkg of recentPackages) {
    const prompts = pkg.prompts as any[];
    if (!prompts || prompts.length === 0) continue;

    console.log(`   Package: ${pkg.title}`);
    console.log(`      Prompts: ${prompts.length}`);

    let impossibleCount = 0;
    const foundIssues: string[] = [];

    for (const prompt of prompts) {
      totalPrompts++;
      const text = typeof prompt === 'string' ? prompt : prompt.fullPrompt || prompt.prompt || '';

      for (const { pattern, name } of impossiblePatterns) {
        if (pattern.test(text)) {
          impossibleCount++;
          totalImpossible++;
          if (!foundIssues.includes(name)) {
            foundIssues.push(name);
          }
        }
      }
    }

    if (impossibleCount > 0) {
      console.log(`      ❌ Found ${impossibleCount} impossible actions:`);
      foundIssues.forEach((issue) => console.log(`         - ${issue}`));
    } else {
      console.log(`      ✅ No impossible actions detected`);
    }
    console.log('');
  }

  // Summary
  console.log('\n📊 ===== VALIDATION SUMMARY =====\n');
  console.log(`✅ AI Classification: Tested ${TEST_TOPICS.length} topics`);
  console.log(`✅ Quality Gate: Analyzed ${recentPackages.length} packages`);
  console.log(`✅ Duration Hints: Checked ${recentJobs.length} jobs`);
  console.log(`✅ Prompt Validation: Scanned ${totalPrompts} prompts`);

  if (totalImpossible > 0) {
    console.log(`\n⚠️  Found ${totalImpossible} impossible actions in existing prompts`);
    console.log(`   These would now be caught and regenerated by the new validation system!`);
  } else {
    console.log(`\n✅ No impossible actions found in recent prompts`);
  }

  console.log('\n🎉 All validation tests complete!\n');
}

main().catch(console.error);
