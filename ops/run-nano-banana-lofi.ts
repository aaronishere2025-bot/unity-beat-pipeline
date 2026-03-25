#!/usr/bin/env tsx
/**
 * Generate a 30-minute Nano Banana Lofi video
 * Job-worker handles multi-track Suno generation + looping visuals
 */

import 'dotenv/config';
import { initializeSecretsWithFallback } from './server/secret-manager-loader.js';
import { storage } from './server/storage';

const LOFI_STYLES = [
  'lofi hip-hop, chill study beats, 80 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative',
  'lofi jazz, 75 BPM, smooth jazz piano, upright bass, brush drums, vinyl warmth, coffee shop ambiance, sunset vibes',
  'lofi ambient, 70 BPM, ethereal pads, gentle piano, field recordings, nature sounds, meditation music, zen atmosphere',
  'lofi chillhop, 85 BPM, rhodes piano, jazzy bass, dusty drums, record crackle, late night study vibes',
];

async function main() {
  await initializeSecretsWithFallback();

  const lofiStyle = LOFI_STYLES[Math.floor(Math.random() * LOFI_STYLES.length)];
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  console.log('🍌 NANO BANANA LOFI - 30 MINUTE MIX\n');
  console.log(`   Style: ${lofiStyle.substring(0, 60)}...`);
  console.log(`   Duration: ~19 minutes (1125s)`);
  console.log(`   Suno will generate ~8 tracks × ~2.5min each\n`);

  const job = await storage.createJob({
    mode: 'music',
    aspectRatio: '16:9',
    scriptName: `Nano Banana Lofi - ${dateLabel}`,
    scriptContent: lofiStyle,
    audioDuration: '1125',
    status: 'queued',
    progress: 0,
  });

  console.log(`✅ Job created: ${job.id}`);
  console.log(`   Title: ${job.scriptName}`);
  console.log(`   Status: queued (job-worker picks up automatically)`);
  console.log(
    `\n   Monitor: curl -s http://localhost:8080/api/jobs/${job.id} | python3 -c "import json,sys; j=json.load(sys.stdin)['data']; print(f'{j[\"status\"]} {j[\"progress\"]}%')"`,
  );
}

main().catch(console.error);
