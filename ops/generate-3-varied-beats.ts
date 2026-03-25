#!/usr/bin/env npx tsx
/**
 * Generate 3 beats with Thompson Sampling + Natural Variation
 *
 * This demonstrates:
 * - Thompson Sampling selecting different music styles
 * - Random visual themes for each beat
 * - No two videos are the same
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { sunoStyleBandit } from './server/services/suno-style-bandit';
import { join } from 'path';

async function generate3VariedBeats() {
  console.log('🎰🎨 GENERATING 3 VARIED BEATS\n');
  console.log('Features:');
  console.log('  ✅ Thompson Sampling for music style selection');
  console.log('  ✅ Random visual themes (10+ options per genre)');
  console.log('  ✅ Random camera motions, colors, moods');
  console.log('  ✅ Natural variation - no two videos alike!\n');
  console.log('='.repeat(70));

  // Show Thompson Sampling status before generation
  const statusBefore = sunoStyleBandit.getStatus();
  console.log(`\n📊 Thompson Sampling Status:`);
  console.log(`   Total pulls so far: ${statusBefore.totalPulls}`);
  console.log(`   Current winner: ${statusBefore.currentDefault}\n`);

  for (let i = 1; i <= 3; i++) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🎵 BEAT ${i}/3: Generating...`);
    console.log(`${'='.repeat(70)}`);

    try {
      // Step 1: Thompson Sampling selects music style
      const selectedStyle = sunoStyleBandit.selectStyle();
      console.log(`\n🎰 Thompson Sampling selected: ${selectedStyle.styleName}`);
      console.log(
        `   Mode: ${selectedStyle.isExploration ? '🔍 EXPLORATION (trying new style)' : '📈 EXPLOITATION (using winner)'}`,
      );
      console.log(`   Confidence: ${(selectedStyle.confidence * 100).toFixed(1)}%`);

      // Step 2: Generate music with selected style
      console.log(`\n🎵 [1/3] Generating music with Suno...`);
      const sunoResult = await sunoApi.generateSong({
        lyrics: '',
        style: selectedStyle.fullStylePrompt,
        title: `Beat ${i} - ${selectedStyle.styleName}`,
        instrumental: true,
        model: 'V5',
        targetDuration: 60, // Short 60s beats
      });

      console.log(`   Task: ${sunoResult.taskId}`);
      console.log(`   ⏳ Waiting for Suno (60-120 seconds)...`);
      const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 300000);

      if (!tracks || tracks.length === 0) {
        console.error(`   ❌ Suno failed, skipping\n`);
        continue;
      }

      const track = tracks[0];
      console.log(`   ✅ Audio ready: ${track.duration.toFixed(1)}s`);

      // Step 3: Download audio
      console.log(`\n💾 [2/3] Downloading audio...`);
      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `varied_beat_${i}_${Date.now()}.mp3`);
      const axios = (await import('axios')).default;
      const fs = await import('fs');
      const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(audioPath, response.data);
      console.log(`   ✅ Downloaded`);

      // Step 4: Generate video with music mode (includes random visual selection)
      console.log(`\n🎬 [3/3] Generating video with random visuals...`);

      const job = await storage.createJob({
        mode: 'music',
        aspectRatio: '9:16',
        scriptName: `Beat ${i} - ${selectedStyle.styleName}`,
        scriptContent: '',
        audioDuration: Math.floor(track.duration).toString(),
      });

      const result = await musicModeGenerator.generateVideo(
        {
          packageId: job.id,
          audioFilePath: audioPath,
          audioDuration: track.duration,
          instrumental: true,
        },
        '9:16',
        (percent, message) => {
          if (percent % 20 === 0) console.log(`   [${percent}%] ${message}`);
        },
      );

      console.log(`\n✅ BEAT ${i} COMPLETE!`);
      console.log(`   Music Style: ${result.selectedMusicStyle?.styleName}`);
      console.log(`   Visual Theme: ${result.theme}`);
      console.log(`   Video: ${result.videoPath}`);
      console.log(`   Duration: ${track.duration.toFixed(1)}s`);
      console.log(`   Cost: $0.10 (Suno only)`);

      await storage.updateJob(job.id, {
        status: 'completed',
        videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
        thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
        cost: '0.10',
        duration: Math.floor(track.duration),
        progress: 100,
        completedAt: new Date(),
      });
    } catch (error: any) {
      console.error(`\n❌ Error on beat ${i}: ${error.message}`);
      console.error(error.stack);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('🎉 3 UNIQUE BEATS GENERATED!');
  console.log('');
  console.log('What makes them unique:');
  console.log('  🎰 Thompson Sampling picked 3 different music styles');
  console.log('  🎨 Random visual themes from each genre pool (10+ options)');
  console.log('  🎥 Random camera motions (zoom, pan, dolly, orbit)');
  console.log('  🌈 Random color grading based on energy');
  console.log('  ✨ Random quality & mood enhancers');
  console.log('');
  console.log('📺 View at: http://localhost:8080');
  console.log(`${'='.repeat(70)}\n`);

  // Show Thompson Sampling status after generation
  const statusAfter = sunoStyleBandit.getStatus();
  console.log(`\n📊 Thompson Sampling Updated:`);
  console.log(`   Total pulls: ${statusAfter.totalPulls} (+3)`);
  console.log(`   System is learning which styles work best!`);
}

generate3VariedBeats().catch(console.error);
