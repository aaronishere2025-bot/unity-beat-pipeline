#!/usr/bin/env tsx
/**
 * Generate one lofi beat video + one historical narrative video
 * Historical topic is auto-discovered (unique, deduped, trending-aware)
 * Both will be picked up by job-worker automatically
 */

import 'dotenv/config';
import { initializeSecretsWithFallback } from './server/secret-manager-loader.js';
import { storage } from './server/storage';
import { getOrchestrator } from './server/services/unity-orchestrator';

async function main() {
  await initializeSecretsWithFallback();

  console.log('='.repeat(70));
  console.log('🎬 GENERATING TWO VIDEOS: Lofi Beat + Historical (Discovery)');
  console.log('='.repeat(70));

  // ============================================
  // 1. LOFI BEAT VIDEO (music mode)
  // ============================================
  console.log('\n📻 CREATING LOFI BEAT JOB...\n');

  // Randomize lofi style for variety
  const LOFI_STYLES = [
    'lofi hip-hop, chill study beats, 80 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative',
    'lofi jazz, 75 BPM, smooth jazz piano, upright bass, brush drums, vinyl warmth, coffee shop ambiance, sunset vibes',
    'lofi ambient, 70 BPM, ethereal pads, gentle piano, field recordings, nature sounds, meditation music, zen atmosphere',
    'lofi chillhop, 85 BPM, rhodes piano, jazzy bass, dusty drums, record crackle, late night study vibes',
  ];
  const lofiStyle = LOFI_STYLES[Math.floor(Math.random() * LOFI_STYLES.length)];
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const lofiJob = await storage.createJob({
    mode: 'music',
    aspectRatio: '16:9',
    scriptName: `Nano Banana Lofi - ${dateLabel}`,
    scriptContent: lofiStyle,
    audioDuration: '1800', // 30 minutes
    status: 'queued',
    progress: 0,
  });

  console.log(`   ✅ Lofi job created: ${lofiJob.id}`);
  console.log(`      Title: ${lofiJob.scriptName}`);
  console.log(`      Mode: music | Duration: 30 min | Aspect: 16:9`);
  console.log(`      Status: queued (job-worker will pick up automatically)`);

  // ============================================
  // 2. HISTORICAL VIDEO (discovery → orchestrator)
  // ============================================
  console.log('\n⚔️  DISCOVERING UNIQUE HISTORICAL TOPIC...\n');

  try {
    const orchestrator = getOrchestrator();

    // Use the discovery system to find a unique, trending, non-duplicate topic
    const topics = await orchestrator.runDiscovery();

    if (topics.length === 0) {
      console.error('   ❌ Discovery returned no topics — all figures used in last 90 days?');
      return;
    }

    // Sort by viral score, try each until one passes 90-day dedup
    const sorted = topics.sort((a, b) => b.viralScore - a.viralScore);

    console.log(`   📋 Discovered ${sorted.length} topics:`);
    for (const t of sorted) {
      console.log(`      ${t.viralScore.toFixed(1)} | ${t.figure} (${t.source})`);
    }

    for (const topic of sorted) {
      console.log(`\n   🎯 Trying: ${topic.figure}`);
      console.log(`      Event: ${topic.event}`);
      console.log(`      Hook: ${topic.hook}`);

      try {
        const result = await orchestrator.generateVideoForTopic(topic);

        if (result) {
          console.log(`\n   ✅ Historical job created: ${result.jobId}`);
          console.log(`      Figure: ${result.figure}`);
          console.log(`      Package ID: ${result.packageId || 'N/A'}`);
          console.log(`      Status: preparing → queued (after lyrics + music generated)`);
          break; // Success
        }
      } catch (err: any) {
        if (err.message.includes('90 days')) {
          console.log(`      ⏭️  Skipping (used in last 90 days)`);
          continue;
        }
        console.error(`      ❌ Failed: ${err.message}`);
        continue;
      }
    }
  } catch (err: any) {
    console.error(`   ❌ Historical video creation failed: ${err.message}`);
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(70));
  console.log('📋 SUMMARY');
  console.log('='.repeat(70));
  console.log(`\n   1. Lofi Beat:    ${lofiJob.id} (queued — processing now)`);
  console.log(`   2. Historical:   Check server logs for job ID`);
  console.log(`\n   Monitor progress:`);
  console.log(`     curl http://localhost:8080/api/jobs | jq '.data[] | {id,scriptName,status,progress}'`);
  console.log(`\n   Or check server log:`);
  console.log(`     tail -f /tmp/unity-scratch/server.log`);
  console.log('');
}

main().catch(console.error);
