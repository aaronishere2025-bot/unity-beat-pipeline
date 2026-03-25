#!/usr/bin/env tsx
/**
 * Daily Beat Generator
 * 5 Lofi + 5 Trap = $2/day
 *
 * Strategy: Consistent daily uploads for 30 days
 * - Trains YouTube algorithm
 * - Tests styles incrementally
 * - Builds audience gradually
 * - Total: 300 beats over 30 days = $60
 */

import { storage } from './server/storage';

// Rotating themes (will cycle through)
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
  { name: 'Foggy Morning', bpm: 77, vibe: 'misty dawn, purple haze, ethereal calm' },
  { name: 'Pixel Dreams', bpm: 84, vibe: '8-bit aesthetic, purple pixels, nostalgic gaming' },
  { name: 'Rooftop Views', bpm: 81, vibe: 'city skyline at dusk, purple sky, contemplative' },
  { name: 'Rainy Commute', bpm: 87, vibe: 'train window, rain drops, urban solitude' },
  { name: 'Moonlit Walk', bpm: 76, vibe: 'night path, purple moonlight, peaceful stroll' },
  { name: 'Ambient Thoughts', bpm: 89, vibe: 'floating feelings, purple aura, introspective' },
  { name: 'Lazy Sunday', bpm: 74, vibe: 'slow morning, purple light through curtains, relaxed' },
  { name: 'Night Shift', bpm: 92, vibe: 'late work, city lights below, focused grind' },
  { name: 'Urban Solitude', bpm: 78, vibe: 'alone in crowd, purple neon reflections, isolated' },
  { name: 'Distant Memories', bpm: 82, vibe: 'faded photos, purple filter, bittersweet nostalgia' },
];

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
  { name: 'Midnight Heist', bpm: 144, vibe: 'stealth trap, calculated moves, high stakes' },
  { name: 'Neon Demon', bpm: 151, vibe: 'evil trap, sinister vibes, dark possession' },
  { name: 'Thunder Strike', bpm: 146, vibe: 'powerful trap, booming 808s, storm energy' },
  { name: 'Crystal Meth', bpm: 153, vibe: 'chemical trap, intense rush, dangerous addiction' },
  { name: 'Blood Moon', bpm: 141, vibe: 'ritual trap, dark ceremony, occult power' },
  { name: 'Chrome Hearts', bpm: 156, vibe: 'metallic trap, cold steel, mechanical precision' },
  { name: 'Toxic Waste', bpm: 148, vibe: 'radioactive trap, hazardous vibes, nuclear energy' },
  { name: 'Night Stalker', bpm: 154, vibe: 'predator trap, hunting mode, relentless pursuit' },
  { name: 'Purple Haze', bpm: 147, vibe: 'psychedelic trap, mind-bending, altered state' },
  { name: 'Black Ice', bpm: 149, vibe: 'cold trap, slippery beats, dangerous elegance' },
];

async function generateDailyBatch() {
  console.log('📅 DAILY BATCH: Generating 10 beats (5 lofi + 5 trap)');
  console.log('💰 Cost: $2.00');
  console.log('⏱️  Time: ~40 minutes\n');

  const jobs: string[] = [];
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Get day number to rotate through themes
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const lofiStartIndex = (dayOfYear * 5) % lofiThemes.length;
  const trapStartIndex = (dayOfYear * 5) % trapThemes.length;

  // Generate 5 Lofi Beats
  console.log('🎵 Generating 5 Lofi Beats for ChillBeats4Me...');
  const lofiArtists = [
    'Mac Miller',
    'J Dilla',
    'Nujabes',
    'Kendrick Lamar',
    'Tyler The Creator',
    'Frank Ocean',
    'MF DOOM',
  ];

  for (let i = 0; i < 5; i++) {
    const theme = lofiThemes[(lofiStartIndex + i) % lofiThemes.length];
    const bpmVariation = theme.bpm + Math.floor(Math.random() * 6 - 3); // ±3 BPM

    // Add artist reference for A/B testing
    const artist = lofiArtists[i % lofiArtists.length];
    const scriptName = `${theme.name} [${bpmVariation} BPM lofi] ${date}`;
    const scriptContent = `lofi beat, ${bpmVariation} BPM, ${theme.vibe}, chill hip hop, study music, ${artist} type beat style, relaxing beats`;

    try {
      // Random duration between 2:30 and 4:00 (150-240 seconds)
      const targetDuration = 150 + Math.floor(Math.random() * 91); // 150-240

      const job = await storage.createJob({
        mode: 'music',
        scriptName,
        scriptContent: `${scriptContent}, target ${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')} length`,
        aspectRatio: '9:16',
        autoUpload: true, // Auto-upload to YouTube when completed
      });
      jobs.push(job.id);
      console.log(
        `   ✅ ${i + 1}/5: ${scriptName} (${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n🔥 Generating 5 Trap Beats for Trap Beats INC...');
  const trapArtists = ['Travis Scott', 'Future', 'Metro Boomin', 'Drake', 'Playboi Carti', '21 Savage', 'Lil Uzi Vert'];

  for (let i = 0; i < 5; i++) {
    const theme = trapThemes[(trapStartIndex + i) % trapThemes.length];
    const bpmVariation = theme.bpm + Math.floor(Math.random() * 6 - 3); // ±3 BPM

    // Add artist reference for A/B testing
    const artist = trapArtists[i % trapArtists.length];
    const scriptName = `${theme.name} [${bpmVariation} BPM trap] ${date}`;
    const scriptContent = `trap beat, ${bpmVariation} BPM, ${theme.vibe}, hard 808s, aggressive trap, ${artist} type beat style, type beat`;

    try {
      // Random duration between 2:30 and 4:00 (150-240 seconds)
      const targetDuration = 150 + Math.floor(Math.random() * 91); // 150-240

      const job = await storage.createJob({
        mode: 'music',
        scriptName,
        scriptContent: `${scriptContent}, target ${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')} length`,
        aspectRatio: '9:16',
        autoUpload: true, // Auto-upload to YouTube when completed
      });
      jobs.push(job.id);
      console.log(
        `   ✅ ${i + 1}/5: ${scriptName} (${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ DAILY BATCH COMPLETE!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 Beats queued: ${jobs.length}/10`);
  console.log(`💰 Cost today: $${(jobs.length * 0.2).toFixed(2)}`);
  console.log(`⏱️  ETA: ~${jobs.length * 4} minutes`);
  console.log('');
  console.log('📈 30-Day Projection:');
  console.log('   Total beats: 300 (150 lofi + 150 trap)');
  console.log('   Total cost: $60');
  console.log('   2 active channels with daily uploads');
  console.log('');
  console.log('💡 Pro Tip:');
  console.log('   Run this script daily at the same time');
  console.log('   YouTube algorithm rewards consistency!');
  console.log('═══════════════════════════════════════════════════════\n');
}

generateDailyBatch().catch(console.error);
