#!/usr/bin/env tsx
/**
 * Generate 30-minute Lofi Study Mix - Multiple Beats Collage
 * 5-6 different lofi tracks blended together for variety
 */

import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { storage } from './server/storage';
import { join } from 'path';
import { execSync } from 'child_process';

const LOFI_BEATS = [
  {
    title: 'Morning Coffee',
    style:
      'lofi hip-hop, coffee shop vibes, 75 BPM mellow, jazzy piano, vinyl crackle, soft drums, warm bass, sunrise calm',
    duration: 300, // 5 minutes
  },
  {
    title: 'Focus Flow',
    style:
      'lofi chill, study beats, 80 BPM steady, rhodes piano, subtle rain, tape hiss, concentration groove, minimal drums',
    duration: 360, // 6 minutes
  },
  {
    title: 'Rainy Day Thoughts',
    style:
      'lofi ambient, rainy mood, 70 BPM slow, rain sounds, distant thunder, soft keys, melancholic peaceful dreamy',
    duration: 300, // 5 minutes
  },
  {
    title: 'Night Study',
    style:
      'lofi nocturne, late night vibes, 78 BPM relaxed, moon aesthetic, soft synth pad, vinyl noise, introspective calm',
    duration: 360, // 6 minutes
  },
  {
    title: 'Deep Work',
    style:
      'lofi productivity, work mode, 82 BPM motivated, typing sounds, coffee machine ambience, energetic but chill',
    duration: 300, // 5 minutes
  },
  {
    title: 'Sunset Chill',
    style: 'lofi sunset, golden hour, 76 BPM dreamy, warm analog synths, bird chirps, nostalgic peaceful end of day',
    duration: 300, // 5 minutes
  },
];

async function generate30MinLofiMix() {
  console.log('🎧 GENERATING 30-MINUTE LOFI STUDY MIX\n');
  console.log('📀 Mix Details:');
  console.log(`   ${LOFI_BEATS.length} unique lofi tracks`);
  console.log(`   ~${LOFI_BEATS.reduce((sum, b) => sum + b.duration, 0) / 60} minutes total`);
  console.log(`   Seamless transitions between songs\n`);
  console.log('='.repeat(70));

  const audioFiles: string[] = [];
  const trackDetails: any[] = [];

  try {
    // Step 1: Generate all lofi beats
    console.log(`\n🎵 PHASE 1: GENERATING ${LOFI_BEATS.length} LOFI TRACKS\n`);

    for (let i = 0; i < LOFI_BEATS.length; i++) {
      const beat = LOFI_BEATS[i];
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎵 Track ${i + 1}/${LOFI_BEATS.length}: ${beat.title}`);
      console.log(`${'─'.repeat(70)}`);
      console.log(`   Style: ${beat.style}`);
      console.log(`   Target: ${beat.duration / 60} minutes\n`);

      try {
        // Generate with Suno
        console.log(`   [${i + 1}.1] Generating music...`);
        const sunoResult = await sunoApi.generateSong({
          lyrics: '',
          style: beat.style,
          title: `Lofi Mix ${i + 1} - ${beat.title}`,
          instrumental: true,
          model: 'V5',
          targetDuration: beat.duration,
        });

        console.log(`   Task: ${sunoResult.taskId}`);
        console.log(`   ⏳ Waiting for Suno...`);
        const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000);

        if (!tracks || tracks.length === 0) {
          console.error(`   ❌ Failed, skipping track ${i + 1}\n`);
          continue;
        }

        const track = tracks[0];
        console.log(`   ✅ Generated: ${(track.duration / 60).toFixed(1)} min`);

        // Download audio
        console.log(`   [${i + 1}.2] Downloading...`);
        const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `lofi_mix_${i + 1}_${Date.now()}.mp3`);
        const axios = (await import('axios')).default;
        const fs = await import('fs');
        const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(audioPath, response.data);
        console.log(`   ✅ Saved: ${audioPath}`);

        audioFiles.push(audioPath);
        trackDetails.push({
          title: beat.title,
          duration: track.duration,
          path: audioPath,
        });
      } catch (error: any) {
        console.error(`   ❌ Error on track ${i + 1}: ${error.message}`);
      }
    }

    if (audioFiles.length === 0) {
      console.error('\n❌ No tracks generated successfully');
      return;
    }

    console.log(`\n✅ Successfully generated ${audioFiles.length}/${LOFI_BEATS.length} tracks`);
    const totalDuration = trackDetails.reduce((sum, t) => sum + t.duration, 0);
    console.log(`   Total duration: ${(totalDuration / 60).toFixed(1)} minutes\n`);

    // Step 2: Concatenate all audio files
    console.log(`\n🎵 PHASE 2: COMBINING TRACKS INTO MIX\n`);
    console.log(`   Merging ${audioFiles.length} tracks with crossfades...`);

    const mixedAudioPath = join(process.cwd(), 'data', 'temp', 'processing', `lofi_mix_30min_${Date.now()}.mp3`);

    // Create FFmpeg concat file
    const concatFile = join(process.cwd(), 'data', 'temp', 'processing', `concat_list_${Date.now()}.txt`);
    const fs = await import('fs');
    const concatContent = audioFiles.map((f) => `file '${f}'`).join('\n');
    fs.writeFileSync(concatFile, concatContent);

    // Concatenate with FFmpeg
    console.log(`   Running FFmpeg concat...`);
    execSync(`ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${mixedAudioPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ Mixed audio: ${mixedAudioPath}\n`);

    // Step 3: Generate video with lofi visuals
    console.log(`\n🎬 PHASE 3: GENERATING VIDEO\n`);
    console.log(`   Creating lofi-themed visual background...`);

    const job = await storage.createJob({
      mode: 'music',
      aspectRatio: '16:9',
      scriptName: 'Lofi Study Mix - 30 Minutes of Chill Beats',
      scriptContent: `${audioFiles.length}-track lofi mix:\n${trackDetails.map((t, i) => `${i + 1}. ${t.title} (${(t.duration / 60).toFixed(1)} min)`).join('\n')}`,
      audioDuration: Math.floor(totalDuration).toString(),
      musicUrl: mixedAudioPath, // Add the music file path
    });

    console.log(`   Job ID: ${job.id}`);
    console.log(`   Generating with Kling AI backgrounds...\n`);

    const startTime = Date.now();
    const result = await musicModeGenerator.generateVideo(
      {
        packageId: job.id,
        audioFilePath: mixedAudioPath,
        audioDuration: totalDuration,
        instrumental: true,
      },
      '16:9',
      (percent, message) => {
        if (percent % 10 === 0) {
          console.log(`   [${percent}%] ${message}`);
        }
      },
    );

    const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    // Final results
    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ 30-MINUTE LOFI STUDY MIX COMPLETE!`);
    console.log(`${'='.repeat(70)}`);
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
    });

    console.log(`\n📺 View your 30-minute lofi mix at: http://localhost:5000`);
    console.log(`\n🎧 Perfect for:`);
    console.log(`   📚 Long study sessions`);
    console.log(`   💻 Deep work/coding`);
    console.log(`   ✍️  Creative writing`);
    console.log(`   🧘 Meditation & focus`);
    console.log(`\n✨ Variety keeps you engaged without being distracting!\n`);
  } catch (error: any) {
    console.error(`\n❌ Error generating lofi mix: ${error.message}`);
    console.error(error.stack);
  }
}

generate30MinLofiMix().catch(console.error);
