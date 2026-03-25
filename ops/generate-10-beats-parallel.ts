#!/usr/bin/env tsx
/**
 * Generate 10 diverse beats IN PARALLEL with varied styles and BPMs
 * 5 beats for Trap Channel, 5 beats for Lofi Channel
 * All 10 process simultaneously for maximum speed
 */

import { storage } from './server/storage';
import { sunoApi } from './server/services/suno-api';
import { klingVideoGenerator } from './server/services/kling-video-generator';
import { beatMetadataGenerator, ChannelConfig } from './server/services/beat-metadata-generator';
import { audioAnalysisService } from './server/services/audio-analysis-service';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { join } from 'path';

// Configure channel types
const TRAP_CHANNEL: ChannelConfig = {
  type: 'trap_channel',
  name: 'Trap Beats Channel',
  description: 'Hard trap for rappers',
  primaryGenres: ['Trap', 'Dark Trap', 'Drill'],
  targetAudience: ['rappers', 'producers', 'gym goers'],
};

const LOFI_CHANNEL: ChannelConfig = {
  type: 'lofi_channel',
  name: 'Lofi Beats Channel',
  description: 'Study and chill beats',
  primaryGenres: ['Lofi Hip Hop', 'Chillhop', 'Jazz Hop'],
  targetAudience: ['students', 'workers', 'readers'],
};

// TRAP CHANNEL BEATS (5 beats)
const TRAP_BEATS = [
  {
    name: 'Dark Trap Energy',
    style: 'dark trap, hard 808s, aggressive hi-hats, 140 BPM, minor key, menacing synth',
    sunoStyle: 'dark trap, hard 808s, aggressive hi-hats, 140 BPM, minor key, menacing synth',
    videoPrompt:
      'abstract dark purple neon lights, geometric patterns, urban street art at night, vibrant graffiti glowing',
    channel: TRAP_CHANNEL,
  },
  {
    name: 'Hard Trap Banger',
    style: 'hard trap, thunderous 808s, 145 BPM, aggressive, distorted bass, trap snare rolls',
    sunoStyle: 'hard trap, thunderous 808s, 145 BPM, aggressive, distorted bass',
    videoPrompt: 'gold chains, diamond jewelry close-up, luxury cars, flash photography, high contrast',
    channel: TRAP_CHANNEL,
  },
  {
    name: 'UK Drill',
    style: 'UK drill, sliding 808s, 135 BPM, dark piano, aggressive hi-hat patterns, drill snares',
    sunoStyle: 'UK drill, sliding 808s, 135 BPM, dark piano, aggressive hi-hat patterns',
    videoPrompt: 'london streets at night, red double-decker bus, urban architecture, moody lighting',
    channel: TRAP_CHANNEL,
  },
  {
    name: 'Melodic Trap',
    style: 'melodic trap, emotional piano, 138 BPM, soft 808s, guitar melodies, atmospheric',
    sunoStyle: 'melodic trap, emotional piano, 138 BPM, soft 808s, guitar melodies',
    videoPrompt: 'sunset cityscapes, silhouettes, emotional color grading, purple and orange sky',
    channel: TRAP_CHANNEL,
  },
  {
    name: 'Phonk Drift',
    style: 'phonk, cowbell, drift vibes, 160 BPM, memphis rap, hard bass, distorted 808',
    sunoStyle: 'phonk, cowbell, drift vibes, 160 BPM, memphis rap, hard bass',
    videoPrompt: 'neon city streets at night, japanese characters glowing, cyberpunk aesthetic, fast motion blur',
    channel: TRAP_CHANNEL,
  },
];

// LOFI CHANNEL BEATS (5 beats)
const LOFI_BEATS = [
  {
    name: 'Lofi Study Session',
    style: 'lofi hip hop, jazzy chords, 85 BPM, vinyl crackle, mellow bass, chill vibes',
    sunoStyle: 'lofi hip hop, jazzy chords, 85 BPM, vinyl crackle, mellow bass, chill vibes',
    videoPrompt: 'cozy coffee shop, warm ambient lighting, books and plants, aesthetic study space, soft bokeh',
    channel: LOFI_CHANNEL,
  },
  {
    name: 'Jazz Hop Vibes',
    style: 'jazz hop, smooth piano, 90 BPM, upright bass, brush drums, sophisticated, relaxed',
    sunoStyle: 'jazz hop, smooth piano, 90 BPM, upright bass, brush drums, relaxed',
    videoPrompt: 'jazz club atmosphere, smooth saxophone, dim amber lighting, classy bar setting',
    channel: LOFI_CHANNEL,
  },
  {
    name: 'Ambient Meditation',
    style: 'ambient, atmospheric pads, 70 BPM, ethereal, meditation, peaceful, dreamy synth',
    sunoStyle: 'ambient, atmospheric pads, 70 BPM, ethereal, peaceful, dreamy',
    videoPrompt: 'flowing water, soft nature scenes, sunrise over mountains, calm ocean waves, serene',
    channel: LOFI_CHANNEL,
  },
  {
    name: 'Boom Bap Classic',
    style: 'boom bap, 95 BPM, dusty drums, jazz sample, SP-404, golden era hip hop',
    sunoStyle: 'boom bap, 95 BPM, dusty drums, jazz sample, golden era hip hop',
    videoPrompt: 'vintage vinyl records spinning, turntables, retro 90s aesthetic, warm film grain',
    channel: LOFI_CHANNEL,
  },
  {
    name: 'Chillhop Evening',
    style: 'chillhop, electric piano, 80 BPM, warm bass, lo-fi drums, nostalgic, cozy',
    sunoStyle: 'chillhop, electric piano, 80 BPM, warm bass, lo-fi drums, nostalgic',
    videoPrompt: 'rainy window view, bokeh city lights, warm lamp glow, peaceful evening atmosphere',
    channel: LOFI_CHANNEL,
  },
];

const ALL_BEATS = [...TRAP_BEATS, ...LOFI_BEATS];

// Generate a single beat (to be run in parallel)
async function generateBeat(
  beatStyle: (typeof ALL_BEATS)[0],
  index: number,
): Promise<{
  name: string;
  style: string;
  audioPath: string;
  videoPath: string;
  thumbnail: string;
  jobId: string;
  channel: string;
} | null> {
  console.log(`\n[${index + 1}/10] Starting: ${beatStyle.name} [${beatStyle.channel.type}]`);

  // Create job FIRST so it's visible in dashboard
  const job = await storage.createJob({
    scriptName: `${beatStyle.name} [${beatStyle.channel.type}]`,
    scriptContent: beatStyle.style,
    mode: 'music',
    aspectRatio: '9:16',
    clipDuration: 6,
    status: 'processing',
    progress: 0,
    metadata: {
      beatStyle: beatStyle.style,
      phase: 'Initializing',
      channelType: beatStyle.channel.type,
      channelName: beatStyle.channel.name,
    },
  });

  console.log(`   📝 Job: ${job.id}`);

  let totalCost = 0; // Track cost throughout generation

  try {
    // Step 1: Generate music with Suno
    await storage.updateJob(job.id, {
      progress: 5,
      metadata: { ...job.metadata, phase: 'Generating music with Suno' },
    });

    const result = await sunoApi.generateSong({
      lyrics: '',
      style: beatStyle.sunoStyle,
      title: beatStyle.name,
      instrumental: true,
      model: 'V5',
    });

    await storage.updateJob(job.id, {
      progress: 15,
      metadata: { ...job.metadata, phase: 'Waiting for Suno' },
    });

    const tracks = await sunoApi.waitForCompletion(result.taskId);
    const audioResult = tracks[0];

    if (!audioResult || !audioResult.audioUrl) {
      throw new Error('No audio URL from Suno');
    }

    const duration = audioResult.duration || 120; // Default if undefined
    const sunoCost = 0.1; // Suno V5 cost per generation
    totalCost += sunoCost;
    console.log(`   ✅ Audio: ${duration.toFixed(1)}s ($${sunoCost.toFixed(2)})`);

    await storage.updateJob(job.id, {
      progress: 25,
      metadata: { ...job.metadata, phase: 'Downloading audio' },
    });

    // Download audio to permanent storage
    const audioFilename = `beat_${index + 1}_${beatStyle.name.replace(/\s+/g, '_')}_${Date.now()}.mp3`;
    const audioPath = path.join(process.cwd(), 'data/audio', audioFilename);
    const audioResponse = await fetch(audioResult.audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    fs.writeFileSync(audioPath, Buffer.from(audioBuffer));

    // Step 2: Extract BPM from style and use Suno duration
    await storage.updateJob(job.id, {
      progress: 30,
      metadata: { ...job.metadata, phase: 'Preparing video' },
    });

    // Extract BPM from style string
    const bpmMatch = beatStyle.sunoStyle.match(/(\d+)\s*BPM/i);
    const bpm = bpmMatch ? parseInt(bpmMatch[1]) : 120;

    // Estimate energy from BPM
    const energy = bpm > 130 ? 0.8 : bpm < 90 ? 0.3 : 0.5;

    console.log(`   🎵 BPM: ${bpm}, Duration: ${duration.toFixed(1)}s, Energy: ${energy.toFixed(2)}`);

    await storage.updateJob(job.id, {
      progress: 35,
      metadata: {
        ...job.metadata,
        bpm: Math.round(bpm),
        energy: energy,
        duration: duration,
      },
    });

    // Step 3: Generate video clips
    const numClips = 2 + Math.floor(Math.random() * 2);
    console.log(`   🎬 Generating ${numClips} clips...`);

    const clipPaths: string[] = [];
    for (let c = 0; c < numClips; c++) {
      const clipProgress = 40 + (c / numClips) * 30;
      await storage.updateJob(job.id, {
        progress: Math.round(clipProgress),
        metadata: { ...job.metadata, phase: `Kling clip ${c + 1}/${numClips}` },
      });

      const clipResult = await klingVideoGenerator.generateSingleClip(beatStyle.videoPrompt, {
        duration: 6,
        aspectRatio: '9:16',
        mode: 'std',
      });

      if (clipResult.videoUrl) {
        const klingCost = 0.1; // Kling standard mode cost per clip
        totalCost += klingCost;

        // Extract filename from videoUrl (e.g., '/api/videos/kling_xxx.mp4' -> 'kling_xxx.mp4')
        const filename = path.basename(clipResult.videoUrl);
        const sourceClipPath = path.join(process.cwd(), 'data/videos/clips', filename);
        const clipPath = path.join(
          process.cwd(),
          'data',
          'temp',
          'processing',
          `beat_${index + 1}_clip_${c}_${Date.now()}.mp4`,
        );

        // Copy from clips directory (already saved by Kling service)
        if (fs.existsSync(sourceClipPath)) {
          fs.copyFileSync(sourceClipPath, clipPath);
          clipPaths.push(clipPath);
        } else {
          console.error(`   ⚠️ Clip file not found: ${sourceClipPath}`);
        }
      }

      if (c < numClips - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log(`   ✅ ${clipPaths.length} clips downloaded`);

    // Step 4: Loop clips
    await storage.updateJob(job.id, {
      progress: 75,
      metadata: { ...job.metadata, phase: 'Looping clips' },
    });

    const videoDuration = duration;
    const concatFile = path.join(process.cwd(), 'data', 'temp', 'processing', `concat_${index + 1}_${Date.now()}.txt`);
    const loopedVideoPath = path.join(
      process.cwd(),
      'data',
      'temp',
      'processing',
      `beat_${index + 1}_looped_${Date.now()}.mp4`,
    );

    const totalClipDuration = clipPaths.length * 6;
    const loopCount = Math.ceil(videoDuration / totalClipDuration);

    let concatContent = '';
    for (let loop = 0; loop < loopCount; loop++) {
      for (const clipPath of clipPaths) {
        concatContent += `file '${clipPath}'\n`;
      }
    }
    fs.writeFileSync(concatFile, concatContent);

    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -t ${videoDuration} -c copy "${loopedVideoPath}"`);

    // Step 5: Merge video with audio
    await storage.updateJob(job.id, {
      progress: 85,
      metadata: { ...job.metadata, phase: 'Merging audio' },
    });

    const finalVideoPath = path.join(
      process.cwd(),
      'data/videos/renders',
      `beat_${index + 1}_${beatStyle.name.replace(/\s+/g, '_')}_${Date.now()}.mp4`,
    );

    execSync(
      `ffmpeg -y -i "${loopedVideoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${finalVideoPath}"`,
    );

    // Step 6: Generate thumbnail
    await storage.updateJob(job.id, {
      progress: 95,
      metadata: { ...job.metadata, phase: 'Creating thumbnail' },
    });

    const thumbnailPath = path.join(process.cwd(), 'data/thumbnails', `beat_${index + 1}_${job.id}_thumbnail.jpg`);

    execSync(
      `ffmpeg -y -i "${finalVideoPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" "${thumbnailPath}"`,
    );

    // Complete
    const videoFilename = path.basename(finalVideoPath);
    const finalVideoStats = fs.statSync(finalVideoPath);
    await storage.updateJob(job.id, {
      status: 'completed',
      progress: 100,
      videoUrl: `/api/videos/${videoFilename}`,
      cost: totalCost.toString(),
      duration: Math.round(duration),
      fileSize: finalVideoStats.size,
      metadata: {
        ...job.metadata,
        phase: 'Complete',
        finalVideoPath,
        thumbnailPath,
        totalCost,
        clipCount: clipPaths.length,
      },
    });

    console.log(`   ✅ Complete: ${beatStyle.name} | ${duration.toFixed(1)}s | $${totalCost.toFixed(2)}`);

    // Cleanup temp files
    fs.unlinkSync(concatFile);
    fs.unlinkSync(loopedVideoPath);
    clipPaths.forEach((clip) => fs.unlinkSync(clip));

    return {
      name: beatStyle.name,
      style: beatStyle.style,
      audioPath,
      videoPath: finalVideoPath,
      thumbnail: thumbnailPath,
      jobId: job.id,
      channel: beatStyle.channel.type,
    };
  } catch (error: any) {
    console.error(`   ❌ Failed: ${beatStyle.name} - ${error.message}`);
    await storage.updateJob(job.id, {
      status: 'failed',
      error: error.message,
      metadata: {
        ...job.metadata,
        phase: 'Failed',
        errorMessage: error.message,
      },
    });
    return null;
  }
}

async function generate10BeatsParallel() {
  console.log('🎵 PARALLEL BEAT GENERATION - 10 BEATS AT ONCE\n');
  console.log('='.repeat(70));
  console.log(`\n📺 Trap Channel: 5 beats`);
  console.log(`📺 Lofi Channel: 5 beats`);
  console.log(`\n⚡ All 10 beats will process simultaneously!\n`);
  console.log('='.repeat(70));

  const startTime = Date.now();

  // Generate all 10 beats in parallel
  console.log('\n🚀 Starting all 10 beat generations...\n');
  const promises = ALL_BEATS.map((beat, index) => generateBeat(beat, index));
  const results = await Promise.all(promises);

  const successful = results.filter((r) => r !== null);
  const failed = results.filter((r) => r === null).length;

  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  // Summary
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('✅ PARALLEL GENERATION COMPLETE');
  console.log(`${'='.repeat(70)}`);

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Successful: ${successful.length}/10`);
  console.log(`   ❌ Failed: ${failed}/10`);
  console.log(`   ⏱️  Total time: ${duration} minutes`);

  console.log(`\n📺 By Channel:`);
  const trapBeats = successful.filter((b) => b!.channel === 'trap_channel');
  const lofiBeats = successful.filter((b) => b!.channel === 'lofi_channel');
  console.log(`   🔥 Trap Channel: ${trapBeats.length}/5 beats`);
  console.log(`   🎹 Lofi Channel: ${lofiBeats.length}/5 beats`);

  console.log(`\n💡 Next Steps:`);
  console.log(`   1. Check dashboard - all jobs visible with progress`);
  console.log(`   2. Upload with channel-specific metadata`);
  console.log(`   3. Each beat tagged for its target channel`);
  console.log(`${'='.repeat(70)}\n`);

  // Show individual results
  if (successful.length > 0) {
    console.log('\n🎵 Generated Beats:\n');
    for (const beat of successful) {
      if (!beat) continue;
      const beatMeta = await beatMetadataGenerator.extractBeatMetadata(beat.audioPath, beat.style);
      const channelConfig = beat.channel === 'trap_channel' ? TRAP_CHANNEL : LOFI_CHANNEL;
      const metadata = beatMetadataGenerator.generateMetadata(beatMeta, channelConfig, beat.videoPath);

      console.log(`   ${beat.name} [${beat.channel}]`);
      console.log(`      Title: ${metadata.title}`);
      console.log(`      BPM: ${Math.round(beatMeta.bpm)} | Genre: ${beatMeta.genre}`);
      console.log(`      Tags: ${metadata.tags.slice(0, 3).join(', ')}...`);
      console.log(`      Job: ${beat.jobId}`);
      console.log('');
    }
  }
}

generate10BeatsParallel();
