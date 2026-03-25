#!/usr/bin/env tsx
/**
 * Generate one historical video using the discovery system
 * Finds unique, trending, non-duplicate topics automatically
 * Tries each discovered topic until one succeeds (skips 90-day dupes)
 */

import 'dotenv/config';
import { initializeSecretsWithFallback } from './server/secret-manager-loader.js';
import { getOrchestrator } from './server/services/unity-orchestrator';

async function main() {
  await initializeSecretsWithFallback();

  const orchestrator = getOrchestrator();

  console.log('🔍 Running content discovery...');
  const topics = await orchestrator.runDiscovery();

  if (topics.length === 0) {
    console.error('No topics found');
    process.exit(1);
  }

  // Sort by viral score (highest first)
  const sorted = topics.sort((a, b) => b.viralScore - a.viralScore);

  console.log(`\n📋 Discovered ${sorted.length} topics:`);
  for (const t of sorted) {
    console.log(`   ${t.viralScore.toFixed(1)} | ${t.figure} (${t.source})`);
  }

  // Try each topic until one succeeds (90-day check may block some)
  for (const topic of sorted) {
    console.log(`\n🎯 Trying: ${topic.figure}`);
    console.log(`   Event: ${topic.event}`);
    console.log(`   Hook: ${topic.hook}`);

    try {
      const result = await orchestrator.generateVideoForTopic(topic);

      if (result) {
        console.log(`\n✅ Historical job created: ${result.jobId}`);
        console.log(`   Figure: ${result.figure}`);
        console.log(`   Package: ${result.packageId}`);
        return; // Success — done
      }
    } catch (err: any) {
      if (err.message.includes('90 days')) {
        console.log(`   ⏭️  Skipping (used in last 90 days)`);
        continue;
      }
      // Other errors — log and try next
      console.error(`   ❌ Failed: ${err.message}`);
      continue;
    }
  }

  console.error('\n❌ All topics failed — no video created');
}

main().catch(console.error);
