#!/usr/bin/env tsx
/**
 * Generate 30-Minute Cohesive Lofi Mix
 * Creates 6-7 similar vibe lofi tracks (4-5 min each) and blends them into a seamless 30-minute montage
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';
import { execSync } from 'child_process';

// Cohesive vibe themes - all tracks in a mix follow the same theme
const LOFI_VIBE_THEMES = {
  rainyNight: {
    name: 'Rainy Night Study Session',
    baseStyle:
      'lofi hip-hop, rain sounds, night vibes, melancholic, peaceful, vinyl crackle, soft piano, mellow bass, gentle drums',
    tracks: [
      { variation: 'intro, gentle rain, 75 BPM, soft piano melody, ambient pads', duration: 300 },
      { variation: 'build, steady rain, 78 BPM, jazzy chords, warm bass', duration: 300 },
      { variation: 'flow, heavy rain, 80 BPM, rhodes piano, deep groove', duration: 300 },
      { variation: 'calm, light rain, 76 BPM, ethereal synths, meditative', duration: 300 },
      { variation: 'focus, distant thunder, 82 BPM, crisp drums, motivated', duration: 300 },
      { variation: 'wind down, soft rain, 74 BPM, dreamy keys, peaceful', duration: 300 },
    ],
  },

  coffeeShop: {
    name: 'Coffee Shop Afternoon',
    baseStyle:
      'lofi hip-hop, coffee shop ambience, warm vibes, cozy, vinyl crackle, jazzy piano, upright bass, brush drums',
    tracks: [
      { variation: 'morning arrival, cafe sounds, 78 BPM, bright piano, welcoming', duration: 300 },
      { variation: 'settling in, espresso machine, 80 BPM, jazzy chords, comfortable', duration: 300 },
      { variation: 'deep focus, quiet chatter, 82 BPM, smooth bass, concentrated', duration: 300 },
      { variation: 'afternoon peak, busy ambience, 84 BPM, upbeat groove, energetic', duration: 300 },
      { variation: 'golden hour, soft conversations, 80 BPM, warm tones, nostalgic', duration: 300 },
      { variation: 'winding down, peaceful cafe, 76 BPM, gentle melodies, relaxed', duration: 300 },
    ],
  },

  midnightStudy: {
    name: 'Midnight Study Marathon',
    baseStyle:
      'lofi hip-hop, late night vibes, moon aesthetic, focused, vinyl warmth, soft synths, deep bass, minimal drums',
    tracks: [
      { variation: '11pm start, moonlight, 76 BPM, soft intro, settling in', duration: 300 },
      { variation: 'midnight focus, stars out, 80 BPM, steady groove, determined', duration: 300 },
      { variation: '1am deep work, quiet night, 82 BPM, flowing rhythm, immersed', duration: 300 },
      { variation: '2am zone, city sleeping, 84 BPM, hypnotic loop, locked in', duration: 300 },
      { variation: '3am push, dawn approaching, 82 BPM, energized, persistent', duration: 300 },
      { variation: '4am final stretch, first light, 78 BPM, motivated, almost done', duration: 300 },
    ],
  },

  sunsetChill: {
    name: 'Sunset Chill Vibes',
    baseStyle:
      'lofi hip-hop, sunset aesthetic, golden hour, nostalgic, warm analog, bird sounds, soft piano, dreamy pads',
    tracks: [
      { variation: 'late afternoon, warm light, 76 BPM, bright tones, optimistic', duration: 300 },
      { variation: 'sun lowering, orange sky, 78 BPM, mellow groove, reflective', duration: 300 },
      { variation: 'golden hour, glowing, 80 BPM, warm bass, content', duration: 300 },
      { variation: 'dusk approaching, pink clouds, 78 BPM, dreamy keys, peaceful', duration: 300 },
      { variation: 'twilight, stars appearing, 76 BPM, soft synths, serene', duration: 300 },
      { variation: 'blue hour, calm evening, 74 BPM, ambient tones, tranquil', duration: 300 },
    ],
  },
};

async function generate30MinCohesiveLofi() {
  console.log('🎧 GENERATING 30-MINUTE COHESIVE LOFI MIX\n');

  // Select a random vibe theme
  const themeKeys = Object.keys(LOFI_VIBE_THEMES);
  const selectedThemeKey = themeKeys[Math.floor(Math.random() * themeKeys.length)];
  const theme = LOFI_VIBE_THEMES[selectedThemeKey as keyof typeof LOFI_VIBE_THEMES];

  console.log(`🎨 Selected Vibe: ${theme.name}`);
  console.log(`📊 Tracks: ${theme.tracks.length} cohesive tracks`);
  console.log(`⏱️  Total: ~${theme.tracks.reduce((sum, t) => sum + t.duration, 0) / 60} minutes\n`);
  console.log('='.repeat(70));

  const audioFiles: string[] = [];
  const trackDetails: any[] = [];
  let job: any;

  try {
    // Check Suno API
    if (!sunoApi.isConfigured()) {
      throw new Error('Suno API not configured - set SUNO_API_KEY');
    }

    // ============================================
    // PHASE 0: Create job in database for dashboard visibility
    // ============================================
    console.log(`\n📊 PHASE 0: CREATING JOB IN DATABASE\n`);

    job = await storage.createJob({
      mode: 'music',
      aspectRatio: '16:9',
      scriptName: theme.name,
      scriptContent: `30-minute cohesive lofi mix: ${theme.baseStyle}`,
      audioDuration: '1800', // 30 minutes target
      status: 'queued',
      progress: 0,
    });

    console.log(`   ✅ Job created: ${job.id}`);
    console.log(`   🔗 View in dashboard: http://localhost:5000\n`);

    // ============================================
    // PHASE 1: Generate all tracks with cohesive theme
    // ============================================
    console.log(`\n🎵 PHASE 1: GENERATING ${theme.tracks.length} COHESIVE LOFI TRACKS\n`);

    await storage.updateJob(job.id, {
      status: 'processing',
      progress: 5,
    });

    for (let i = 0; i < theme.tracks.length; i++) {
      const track = theme.tracks[i];
      const fullStyle = `${theme.baseStyle}, ${track.variation}`;

      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎵 Track ${i + 1}/${theme.tracks.length}`);
      console.log(`${'─'.repeat(70)}`);
      console.log(`   Variation: ${track.variation}`);
      console.log(`   Target: ${(track.duration / 60).toFixed(1)} minutes\n`);

      try {
        // Generate with Suno
        console.log(`   [${i + 1}.1] Generating music...`);
        const sunoResult = await sunoApi.generateSong({
          lyrics: '',
          style: fullStyle,
          title: `${theme.name} - Part ${i + 1}`,
          instrumental: true,
          model: 'V5',
          targetDuration: track.duration,
        });

        console.log(`   Task: ${sunoResult.taskId}`);
        console.log(`   ⏳ Waiting for Suno...`);

        const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000); // 10 min timeout

        if (!tracks || tracks.length === 0) {
          console.error(`   ❌ Failed, skipping track ${i + 1}\n`);
          continue;
        }

        const sunoTrack = tracks[0];
        console.log(`   ✅ Generated: ${(sunoTrack.duration / 60).toFixed(1)} min (${sunoTrack.duration.toFixed(1)}s)`);

        // Download audio
        console.log(`   [${i + 1}.2] Downloading...`);
        const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `lofi_cohesive_${i + 1}_${Date.now()}.mp3`);
        const axios = (await import('axios')).default;
        const fs = await import('fs');

        const response = await axios.get(sunoTrack.audioUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(audioPath, response.data);
        const fileSizeMB = (response.data.length / 1024 / 1024).toFixed(1);
        console.log(`   ✅ Downloaded: ${fileSizeMB}MB → ${audioPath}`);

        audioFiles.push(audioPath);
        trackDetails.push({
          title: `Part ${i + 1}`,
          duration: sunoTrack.duration,
          path: audioPath,
        });

        // Update job progress (5% + track progress out of 60%)
        const trackProgress = Math.floor(5 + ((i + 1) / theme.tracks.length) * 60);
        await storage.updateJob(job.id, {
          progress: trackProgress,
        });
      } catch (error: any) {
        console.error(`   ❌ Error on track ${i + 1}: ${error.message}`);
      }
    }

    if (audioFiles.length === 0) {
      console.error('\n❌ No tracks generated successfully');
      return;
    }

    console.log(`\n✅ Successfully generated ${audioFiles.length}/${theme.tracks.length} tracks`);
    const totalDuration = trackDetails.reduce((sum, t) => sum + t.duration, 0);
    console.log(`   Total duration: ${(totalDuration / 60).toFixed(1)} minutes\n`);

    // ============================================
    // PHASE 2: Concatenate with crossfades
    // ============================================
    console.log(`\n🎵 PHASE 2: BLENDING TRACKS INTO SEAMLESS MIX\n`);
    console.log(`   Merging ${audioFiles.length} tracks with 2-second crossfades...`);

    const mixedAudioPath = join(process.cwd(), 'data', 'temp', 'processing', `lofi_mix_30min_${Date.now()}.mp3`);

    // Create FFmpeg filter with crossfades between tracks
    const fs = await import('fs');

    if (audioFiles.length === 1) {
      // Just copy if only one track
      fs.copyFileSync(audioFiles[0], mixedAudioPath);
    } else {
      // Build crossfade filter complex
      let filterComplex = '';
      const inputs = audioFiles.map((f) => `-i "${f}"`).join(' ');

      // For simplicity, use concat with crossfades
      // Each track crossfades into the next with 2 second overlap
      for (let i = 0; i < audioFiles.length - 1; i++) {
        if (i === 0) {
          filterComplex += `[0:a][1:a]acrossfade=d=2:c1=tri:c2=tri[a01];`;
        } else {
          filterComplex += `[a${i - 1}${i}][${i + 1}:a]acrossfade=d=2:c1=tri:c2=tri[a${i}${i + 1}];`;
        }
      }

      const lastLabel = audioFiles.length > 2 ? `[a${audioFiles.length - 2}${audioFiles.length - 1}]` : '[a01]';

      console.log(`   Running FFmpeg with crossfades...`);
      execSync(
        `ffmpeg ${inputs} -filter_complex "${filterComplex}${lastLabel}aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo" -y "${mixedAudioPath}"`,
        { stdio: 'inherit' },
      );
    }

    console.log(`   ✅ Mixed audio: ${mixedAudioPath}\n`);

    // Update job with mixed audio
    await storage.updateJob(job.id, {
      progress: 65,
      musicUrl: mixedAudioPath,
      audioDuration: Math.floor(totalDuration).toString(),
    });

    // ============================================
    // PHASE 3: Generate video with cohesive visual
    // ============================================
    console.log(`\n🎬 PHASE 3: GENERATING VIDEO\n`);
    console.log(`   Creating cohesive lofi-themed visual background...`);

    const startTime = Date.now();
    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: mixedAudioPath,
        audioDuration: totalDuration,
        instrumental: true,
      },
      '16:9',
      async (percent, message) => {
        if (percent % 20 === 0) {
          console.log(`   [${percent}%] ${message}`);
          // Map video generation progress from 65% to 95%
          const overallProgress = Math.floor(65 + (percent / 100) * 30);
          await storage.updateJob(job.id, {
            progress: overallProgress,
          });
        }
      },
    );

    const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    // Final results
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ 30-MINUTE COHESIVE LOFI MIX COMPLETE!`);
    console.log(`${'='.repeat(70)}`);
    console.log(`\n🎨 Vibe: ${theme.name}`);
    console.log(`\n🎵 Tracklist:`);
    trackDetails.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.title} - ${(t.duration / 60).toFixed(1)} min`);
    });
    console.log(`\n📊 Mix Stats:`);
    console.log(`   Total Duration: ${(totalDuration / 60).toFixed(1)} minutes`);
    console.log(`   Number of Tracks: ${audioFiles.length}`);
    console.log(`   Visual Theme: ${result.theme}`);
    console.log(`   Processing Time: ${elapsedMinutes} minutes`);
    console.log(
      `   Cost: $${(0.1 * audioFiles.length + 0.1).toFixed(2)} (Suno $${(0.1 * audioFiles.length).toFixed(2)} + Kling $0.10)`,
    );
    console.log(`\n📁 Files:`);
    console.log(`   Video: ${result.videoPath}`);
    console.log(`   Thumbnail: ${result.thumbnailPath}`);
    console.log(`${'='.repeat(70)}`);

    // Update job
    await storage.updateJob(job.id, {
      status: 'completed',
      videoUrl: `/api/videos/${result.videoPath.split('/').pop()}`,
      thumbnailUrl: `/api/thumbnails/${result.thumbnailPath.split('/').pop()}`,
      cost: (0.1 * audioFiles.length + 0.1).toFixed(2),
      duration: Math.floor(totalDuration),
      progress: 100,
      completedAt: new Date(),
      musicAnalysis: {
        bpm: result.beatAnalysis?.bpm,
        key: result.beatAnalysis?.key,
        theme: theme.name,
        trackCount: audioFiles.length,
      } as any,
    });

    console.log(`\n📺 View your 30-minute lofi mix at: http://localhost:5000`);
    console.log(`\n🎉 Perfect for:`);
    console.log(`  📚 Extended study sessions`);
    console.log(`  💻 Deep work marathons`);
    console.log(`  🧘 Meditation and relaxation`);
    console.log(`  ☕ Background ambiance\n`);
  } catch (error: any) {
    console.error(`\n❌ Error generating 30-minute lofi mix: ${error.message}`);
    console.error(error.stack);

    // Mark job as failed if it exists
    if (job) {
      await storage.updateJob(job.id, {
        status: 'failed',
        error: error.message,
      });
    }
  }
}

generate30MinCohesiveLofi().catch(console.error);
