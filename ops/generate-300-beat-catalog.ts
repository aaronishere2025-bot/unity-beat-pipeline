#!/usr/bin/env tsx
/**
 * Generate 300-Beat Catalog
 * 150 Lofi + 150 Trap = $60 investment
 *
 * Strategy:
 * - Lofi: Dark, purple, rainy vibes (70-95 BPM)
 * - Trap: Aggressive, neon, hypnotic (140-160 BPM)
 * - Auto-upload to correct YouTube channel
 * - Thompson Sampling learns best styles
 */

import { storage } from './server/storage';

// Lofi beat themes (150 variations)
const lofiThemes = [
  { name: 'Midnight Rain', bpm: 82, vibe: 'rainy night window, purple neon bokeh, melancholic' },
  { name: 'Purple Dreams', bpm: 78, vibe: 'dark bedroom, LED strips, cozy solitude' },
  { name: 'Neon Tokyo', bpm: 85, vibe: 'japanese city at night, neon signs, cyberpunk chill' },
  { name: 'Lost in Thought', bpm: 88, vibe: 'dark cafe, rain outside, introspective mood' },
  { name: 'Late Night Drive', bpm: 75, vibe: 'highway at night, city lights blur, peaceful' },
  { name: 'Study Session', bpm: 90, vibe: 'dim library, rain sounds, focused energy' },
  { name: 'Velvet Skies', bpm: 80, vibe: 'purple sunset, slow motion clouds, dreamy' },
  { name: 'Empty Streets', bpm: 83, vibe: 'abandoned city night, streetlights, lonely vibe' },
  { name: 'Coffee & Rain', bpm: 86, vibe: 'window view, coffee steam, rainy day comfort' },
  { name: 'Digital Memories', bpm: 79, vibe: 'retro computer aesthetic, purple monitors, nostalgic' },
];

// Trap beat themes (150 variations)
const trapThemes = [
  { name: 'Purple Rage', bpm: 145, vibe: 'dark trap, heavy 808s, aggressive purple aesthetic' },
  { name: 'Neon Warfare', bpm: 150, vibe: 'hard trap, distorted bass, cyberpunk battle' },
  { name: 'Shadow King', bpm: 148, vibe: 'menacing trap, sub bass, dark royalty vibes' },
  { name: 'Electric Storm', bpm: 152, vibe: 'brutal trap, lightning strikes, chaotic energy' },
  { name: 'Dark Matter', bpm: 142, vibe: 'cosmic trap, deep space, mysterious power' },
  { name: 'Venom Flow', bpm: 155, vibe: 'toxic trap, acid green, dangerous vibes' },
  { name: 'Ghost Protocol', bpm: 147, vibe: 'haunting trap, ethereal sounds, spectral energy' },
  { name: 'Blade Runner', bpm: 143, vibe: 'futuristic trap, neon rain, dystopian mood' },
  { name: 'Obsidian', bpm: 149, vibe: 'black trap, sharp edges, cold precision' },
  { name: 'Pyromaniac', bpm: 158, vibe: 'fire trap, explosive drops, intense heat' },
];

async function generateBeatCatalog() {
  console.log('🏭 BEAT FACTORY: Generating 300-beat catalog');
  console.log('💰 Total investment: $60 (300 × $0.20)');
  console.log('📊 Split: 150 lofi + 150 trap\n');

  const jobs: string[] = [];

  // Generate 150 Lofi Beats
  console.log('🎵 PHASE 1: Creating 150 Lofi Beats...\n');
  for (let i = 0; i < 150; i++) {
    const theme = lofiThemes[i % lofiThemes.length];
    const variation = Math.floor(i / lofiThemes.length) + 1;
    const bpmVariation = theme.bpm + Math.floor(Math.random() * 10 - 5); // ±5 BPM variation

    const scriptName = `${theme.name} ${variation > 1 ? `V${variation}` : ''} [${bpmVariation} BPM lofi]`.trim();
    const scriptContent = `lofi beat, ${bpmVariation} BPM, ${theme.vibe}, chill hip hop, study music, relaxing beats`;

    try {
      const job = await storage.createJob({
        mode: 'music',
        scriptName,
        scriptContent,
        aspectRatio: '9:16',
      });
      jobs.push(job.id);

      if ((i + 1) % 10 === 0) {
        console.log(`   ✅ Created ${i + 1}/150 lofi beats`);
      }

      // Small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error: any) {
      console.error(`   ❌ Failed to create beat ${i + 1}:`, error.message);
    }
  }

  console.log('\n🔥 PHASE 2: Creating 150 Trap Beats...\n');
  for (let i = 0; i < 150; i++) {
    const theme = trapThemes[i % trapThemes.length];
    const variation = Math.floor(i / trapThemes.length) + 1;
    const bpmVariation = theme.bpm + Math.floor(Math.random() * 8 - 4); // ±4 BPM variation

    const scriptName = `${theme.name} ${variation > 1 ? `V${variation}` : ''} [${bpmVariation} BPM trap]`.trim();
    const scriptContent = `trap beat, ${bpmVariation} BPM, ${theme.vibe}, hard 808s, aggressive trap, type beat`;

    try {
      const job = await storage.createJob({
        mode: 'music',
        scriptName,
        scriptContent,
        aspectRatio: '9:16',
      });
      jobs.push(job.id);

      if ((i + 1) % 10 === 0) {
        console.log(`   ✅ Created ${i + 1}/150 trap beats`);
      }

      // Small delay to avoid overwhelming the system
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error: any) {
      console.error(`   ❌ Failed to create beat ${i + 1}:`, error.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ BEAT CATALOG GENERATION COMPLETE!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 Total beats queued: ${jobs.length}/300`);
  console.log(`💰 Total cost: $${(jobs.length * 0.2).toFixed(2)}`);
  console.log(`⏱️  Estimated completion: ${Math.ceil((jobs.length * 4) / 60)} hours`);
  console.log('');
  console.log('🎯 Next Steps:');
  console.log('   1. Monitor dashboard for completion');
  console.log('   2. Videos auto-upload to YouTube channels');
  console.log('   3. Set up BeatStars store');
  console.log('   4. Link YouTube videos to BeatStars');
  console.log('   5. Post snippets to TikTok/IG');
  console.log('');
  console.log('💎 Potential Revenue:');
  console.log(
    `   If 5% sell at $50 avg  = ${Math.floor(jobs.length * 0.05)} × $50 = $${(jobs.length * 0.05 * 50).toFixed(0)}`,
  );
  console.log(
    `   If 10% sell at $50 avg = ${Math.floor(jobs.length * 0.1)} × $50 = $${(jobs.length * 0.1 * 50).toFixed(0)}`,
  );
  console.log(`   Investment: $${(jobs.length * 0.2).toFixed(2)}`);
  console.log(`   ROI at 5% sales: ${Math.floor(((jobs.length * 0.05 * 50) / (jobs.length * 0.2)) * 100)}%`);
  console.log('═══════════════════════════════════════════════════════\n');
}

generateBeatCatalog().catch(console.error);
