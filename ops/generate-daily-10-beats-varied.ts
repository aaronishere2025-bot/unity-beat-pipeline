#!/usr/bin/env tsx
/**
 * Daily Beat Generator with Varied Visuals
 * 5 Lofi + 5 Trap = $2/day
 *
 * NEW: Each beat gets 3-5 different Kling clips for variation
 * Cost: ~$0.30-0.50/beat instead of $0.20 (more engaging)
 */

import { storage } from './server/storage';

const lofiThemes = [
  { name: 'Midnight Rain', bpm: 82, vibe: 'rainy night window, purple neon bokeh, melancholic' },
  { name: 'Purple Dreams', bpm: 78, vibe: 'dark bedroom, LED strips, cozy solitude' },
  { name: 'Neon Tokyo', bpm: 85, vibe: 'japanese city at night, neon signs, cyberpunk chill' },
  { name: 'Lost in Thought', bpm: 88, vibe: 'dark cafe, rain outside, introspective mood' },
  { name: 'Late Night Drive', bpm: 75, vibe: 'highway at night, city lights blur, peaceful' },
];

const trapThemes = [
  { name: 'Purple Rage', bpm: 145, vibe: 'dark trap, heavy 808s, aggressive purple aesthetic' },
  { name: 'Neon Warfare', bpm: 150, vibe: 'hard trap, distorted bass, cyberpunk battle' },
  { name: 'Shadow King', bpm: 148, vibe: 'menacing trap, sub bass, dark royalty vibes' },
  { name: 'Electric Storm', bpm: 152, vibe: 'brutal trap, lightning strikes, chaotic energy' },
  { name: 'Dark Matter', bpm: 142, vibe: 'cosmic trap, deep space, mysterious power' },
];

async function generateDailyBatchVaried() {
  console.log('📅 DAILY BATCH (VARIED VISUALS): Generating 10 beats');
  console.log('🎨 NEW: 3-5 different clips per beat for engagement');
  console.log('💰 Cost: $3-5 (higher quality, more variety)');
  console.log('⏱️  Time: ~60 minutes\n');

  const jobs: string[] = [];
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const lofiStartIndex = (dayOfYear * 5) % lofiThemes.length;
  const trapStartIndex = (dayOfYear * 5) % trapThemes.length;

  // Calculate staggered upload times (spread over 12 hours)
  const now = new Date();
  const uploadTimes: Date[] = [];
  for (let i = 0; i < 10; i++) {
    const hoursDelay = Math.floor((i * 12) / 10); // Spread over 12 hours
    const minutesDelay = (i * 72) % 60; // Additional minute variation
    const uploadTime = new Date(now.getTime() + hoursDelay * 60 * 60 * 1000 + minutesDelay * 60 * 1000);
    uploadTimes.push(uploadTime);
  }

  console.log('🎵 Generating 5 Lofi Beats (VARIED VISUALS)...');
  for (let i = 0; i < 5; i++) {
    const theme = lofiThemes[(lofiStartIndex + i) % lofiThemes.length];
    const bpmVariation = theme.bpm + Math.floor(Math.random() * 6 - 3);
    const targetDuration = 150 + Math.floor(Math.random() * 91); // 2:30-4:00

    const scriptName = `${theme.name} [${bpmVariation} BPM lofi] ${date}`;
    const scriptContent = `lofi beat, ${bpmVariation} BPM, ${theme.vibe}, chill hip hop, study music, relaxing beats, target ${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')} length`;

    try {
      const job = await storage.createJob({
        mode: 'music_varied', // NEW MODE: generates multiple clips
        scriptName,
        scriptContent,
        aspectRatio: '9:16',
        autoUpload: true,
        unityMetadata: {
          scheduledUploadTime: uploadTimes[i].toISOString(),
          variedClips: true,
          clipCount: 3 + Math.floor(Math.random() * 3), // 3-5 clips
        } as any,
      });
      jobs.push(job.id);
      const uploadTime = uploadTimes[i].toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      console.log(
        `   ✅ ${i + 1}/5: ${scriptName} (${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')}) - Upload: ${uploadTime}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n🔥 Generating 5 Trap Beats (VARIED VISUALS)...');
  for (let i = 0; i < 5; i++) {
    const theme = trapThemes[(trapStartIndex + i) % trapThemes.length];
    const bpmVariation = theme.bpm + Math.floor(Math.random() * 6 - 3);
    const targetDuration = 150 + Math.floor(Math.random() * 91); // 2:30-4:00

    const scriptName = `${theme.name} [${bpmVariation} BPM trap] ${date}`;
    const scriptContent = `trap beat, ${bpmVariation} BPM, ${theme.vibe}, hard 808s, aggressive trap, type beat, target ${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')} length`;

    try {
      const job = await storage.createJob({
        mode: 'music_varied', // NEW MODE: generates multiple clips
        scriptName,
        scriptContent,
        aspectRatio: '9:16',
        autoUpload: true,
        unityMetadata: {
          scheduledUploadTime: uploadTimes[i + 5].toISOString(),
          variedClips: true,
          clipCount: 3 + Math.floor(Math.random() * 3), // 3-5 clips
        } as any,
      });
      jobs.push(job.id);
      const uploadTime = uploadTimes[i + 5].toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      console.log(
        `   ✅ ${i + 1}/5: ${scriptName} (${Math.floor(targetDuration / 60)}:${String(targetDuration % 60).padStart(2, '0')}) - Upload: ${uploadTime}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error: any) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ DAILY BATCH COMPLETE (VARIED VISUALS)!');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`📊 Beats queued: ${jobs.length}/10`);
  console.log(`💰 Cost estimate: $${(jobs.length * 0.4).toFixed(2)} (3-5 clips/beat)`);
  console.log(`⏱️  ETA: ~60 minutes`);
  console.log(`📅 Uploads staggered over 12 hours for better reach`);
  console.log('');
  console.log('🎨 NEW: Each beat has 3-5 different visual scenes');
  console.log('📈 Higher engagement from varied visuals');
  console.log('🕐 Scheduled uploads maximize audience reach');
  console.log('═══════════════════════════════════════════════════════\n');
}

generateDailyBatchVaried().catch(console.error);
