#!/usr/bin/env tsx
/**
 * Generate 10 diverse beats with varied styles and BPMs
 * Each beat gets 2-3 vibrant video clips and proper metadata
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
    videoPrompt: 'abstract dark purple neon lights, geometric patterns, urban street art at night, vibrant graffiti glowing',
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
  beatStyle: typeof ALL_BEATS[0],
  index: number
): Promise<{
  name: string;
  style: string;
  audioPath: string;
  videoPath: string;
  thumbnail: string;
  jobId: string;
  channel: string;
} | null> {
  console.log(`\n\n${'#'.repeat(70)}`);
  console.log(`# Beat ${index + 1}/10: ${beatStyle.name} [${beatStyle.channel.type}]`);
  console.log(`${'#'.repeat(70)}`);
  console.log(`\n📊 Style: ${beatStyle.style}`);
  console.log(`🎥 Video: ${beatStyle.videoPrompt.substring(0, 60)}...`);
  console.log(`📺 Channel: ${beatStyle.channel.name}\n`);

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

  console.log(`   📝 Job created: ${job.id} (visible in dashboard)`);

  try {
    // Step 1: Generate music with Suno
    await storage.updateJob(job.id, {
      progress: 5,
      metadata: { ...job.metadata, phase: 'Generating music with Suno' },
    });

      console.log('🎵 Phase 1: Generating music...');
      const result = await sunoApi.generateSong({
        lyrics: '',  // Empty for instrumental
        style: beatStyle.sunoStyle,
        title: beatStyle.name,
        instrumental: true,
        model: 'V5',
      });

      await storage.updateJob(job.id, {
        progress: 15,
        metadata: { ...job.metadata, phase: 'Waiting for Suno to process' },
      });

      const tracks = await sunoApi.waitForCompletion(result.taskId);
      const audioResult = tracks[0];

      if (!audioResult.audioUrl) {
        console.error('   ❌ No audio URL returned from Suno');
        await storage.updateJob(job.id, {
          status: 'failed',
          error: 'No audio URL from Suno',
        });
        continue;
      }

      console.log(`   ✅ Audio generated: ${audioResult.id}`);
      console.log(`   ⏱️  Duration: ${audioResult.duration}s`);

      await storage.updateJob(job.id, {
        progress: 25,
        metadata: { ...job.metadata, phase: 'Downloading audio' },
      });

      // Download audio
      const audioPath = path.join(process.cwd(), 'data', 'temp', 'processing', `beat_${i + 1}_${Date.now()}.mp3`);
      const audioResponse = await fetch(audioResult.audioUrl);
      const audioBuffer = await audioResponse.arrayBuffer();
      fs.writeFileSync(audioPath, Buffer.from(audioBuffer));
      console.log(`   📥 Downloaded: ${audioPath}`);

      // Step 2: Analyze audio
      await storage.updateJob(job.id, {
        progress: 30,
        metadata: { ...job.metadata, phase: 'Analyzing audio (BPM, energy)' },
      });

      console.log('\n🔍 Phase 2: Analyzing audio...');
      const audioAnalysis = await audioAnalysisService.analyzeAudio(audioPath);
      console.log(`   BPM: ${Math.round(audioAnalysis.bpm)}`);
      console.log(`   Energy: ${audioAnalysis.energy.toFixed(2)}`);
      console.log(`   Duration: ${audioAnalysis.duration.toFixed(1)}s`);

      await storage.updateJob(job.id, {
        progress: 35,
        metadata: {
          ...job.metadata,
          phase: 'Preparing video generation',
          bpm: Math.round(audioAnalysis.bpm),
          energy: audioAnalysis.energy,
          duration: audioAnalysis.duration,
        },
      });

      // Step 3: Generate video
      console.log('\n🎥 Phase 3: Generating video clips...');

      // Generate 2-3 video clips
      const numClips = 2 + Math.floor(Math.random() * 2); // 2 or 3 clips
      console.log(`   🎬 Generating ${numClips} video clips...`);

      const clipPaths: string[] = [];
      for (let c = 0; c < numClips; c++) {
        const clipProgress = 40 + (c / numClips) * 30; // 40-70%
        await storage.updateJob(job.id, {
          progress: Math.round(clipProgress),
          metadata: {
            ...job.metadata,
            phase: `Generating clip ${c + 1}/${numClips} with Kling`,
          },
        });

        console.log(`      Clip ${c + 1}/${numClips}...`);

        const clipResult = await klingVideoGenerator.generateVideo({
          prompt: beatStyle.videoPrompt,
          duration: 6,
          aspectRatio: '9:16',
          mode: 'std',
        });

        if (clipResult.videoUrl) {
          const clipPath = path.join(process.cwd(), 'data', 'temp', 'processing', `beat_${i + 1}_clip_${c}_${Date.now()}.mp4`);
          const clipResponse = await fetch(clipResult.videoUrl);
          const clipBuffer = await clipResponse.arrayBuffer();
          fs.writeFileSync(clipPath, Buffer.from(clipBuffer));
          clipPaths.push(clipPath);
          console.log(`      ✅ Clip ${c + 1} downloaded`);
        }

        // Wait between clips
        if (c < numClips - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }

      // Step 4: Loop clips to match audio duration
      await storage.updateJob(job.id, {
        progress: 75,
        metadata: { ...job.metadata, phase: 'Looping clips to match audio' },
      });

      console.log('\n🔄 Phase 4: Creating final video...');
      const videoDuration = audioAnalysis.duration;

      // Create looped video from clips
      const concatFile = path.join(process.cwd(), 'data', 'temp', 'processing', `concat_${i + 1}_${Date.now()}.txt`);
      const loopedVideoPath = path.join(process.cwd(), 'data', 'temp', 'processing', `beat_${i + 1}_looped_${Date.now()}.mp4`);

      // Calculate how many times to loop each clip
      const totalClipDuration = clipPaths.length * 6;
      const loopCount = Math.ceil(videoDuration / totalClipDuration);

      let concatContent = '';
      for (let loop = 0; loop < loopCount; loop++) {
        for (const clipPath of clipPaths) {
          concatContent += `file '${clipPath}'\n`;
        }
      }
      fs.writeFileSync(concatFile, concatContent);

      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -t ${videoDuration} -c copy "${loopedVideoPath}"`
      );

      console.log(`   ✅ Video looped: ${loopedVideoPath}`);

      // Step 5: Merge video with audio
      await storage.updateJob(job.id, {
        progress: 85,
        metadata: { ...job.metadata, phase: 'Merging video with audio' },
      });

      const finalVideoPath = path.join(
        process.cwd(),
        'data/videos/renders',
        `beat_${i + 1}_${beatStyle.name.replace(/\s+/g, '_')}_${Date.now()}.mp4`
      );

      execSync(
        `ffmpeg -y -i "${loopedVideoPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${finalVideoPath}"`
      );

      console.log(`   ✅ Final video: ${finalVideoPath}`);

      // Step 6: Generate thumbnail
      await storage.updateJob(job.id, {
        progress: 95,
        metadata: { ...job.metadata, phase: 'Generating thumbnail' },
      });

      const thumbnailPath = path.join(
        process.cwd(),
        'data/thumbnails',
        `beat_${i + 1}_${job.id}_thumbnail.jpg`
      );

      execSync(
        `ffmpeg -y -i "${finalVideoPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720" "${thumbnailPath}"`
      );

      console.log(`   ✅ Thumbnail: ${thumbnailPath}`);

      // Update job with video
      await storage.updateJob(job.id, {
        status: 'completed',
        progress: 100,
        videoUrl: finalVideoPath,
        metadata: {
          ...job.metadata,
          phase: 'Complete',
          finalVideoPath,
          thumbnailPath,
        },
      });

      generatedBeats.push({
        name: beatStyle.name,
        style: beatStyle.style,
        audioPath,
        videoPath: finalVideoPath,
        thumbnail: thumbnailPath,
        jobId: job.id,
      });

      console.log(`\n   ✅ Beat ${i + 1} complete!`);

      // Cleanup temp files
      fs.unlinkSync(concatFile);
      fs.unlinkSync(loopedVideoPath);
      clipPaths.forEach(clip => fs.unlinkSync(clip));

    } catch (error: any) {
      console.error(`\n   ❌ Error generating beat ${i + 1}: ${error.message}`);
      await storage.updateJob(job.id, {
        status: 'failed',
        error: error.message,
        metadata: {
          ...job.metadata,
          phase: 'Failed',
          errorMessage: error.message,
        },
      });
      continue;
    }

    // Wait between beats
    if (i < BEAT_STYLES.length - 1) {
      console.log('\n   ⏳ Waiting 5 seconds before next beat...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Final summary with metadata
  console.log(`\n\n${'='.repeat(70)}`);
  console.log('✅ GENERATION COMPLETE');
  console.log(`${'='.repeat(70)}`);

  console.log(`\n📊 Generated ${generatedBeats.length}/${BEAT_STYLES.length} beats:`);

  for (const beat of generatedBeats) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🎹 ${beat.name}`);
    console.log(`${'─'.repeat(70)}`);

    // Extract metadata
    const beatMeta = await beatMetadataGenerator.extractBeatMetadata(beat.audioPath, beat.style);
    const metadata = beatMetadataGenerator.generateMetadata(beatMeta, CHANNEL_CONFIG, beat.videoPath);

    console.log(`   Title: ${metadata.title}`);
    console.log(`   BPM: ${Math.round(beatMeta.bpm)}`);
    console.log(`   Genre: ${beatMeta.genre}${beatMeta.subgenre ? ` / ${beatMeta.subgenre}` : ''}`);
    console.log(`   Mood: ${beatMeta.mood.join(', ')}`);
    console.log(`   Energy: ${beatMeta.energy.toUpperCase()}`);
    console.log(`   Tags: ${metadata.tags.slice(0, 5).join(', ')}...`);
    console.log(`   Video: ${beat.videoPath}`);
    console.log(`   Job ID: ${beat.jobId}`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('💡 Next Steps:');
  console.log('   1. Review beats in dashboard');
  console.log('   2. Upload to YouTube with: npx tsx upload-beats-dynamic.ts');
  console.log('   3. Monitor performance in analytics');
  console.log(`${'='.repeat(70)}\n`);
}

generate10Beats();
