#!/usr/bin/env tsx
/**
 * Generate 20-minute beat video with vibrant stock footage (2-3 clips only)
 * Extended lofi/chill beat with minimal but colorful visuals
 */

import { sunoApi } from './server/services/suno-api';
import { klingVideoGenerator } from './server/services/kling-video-generator';
import { storage } from './server/storage';
import { join } from 'path';
import { execSync } from 'child_process';
import axios from 'axios';
import fs from 'fs';

// Vibrant visual themes (we'll use 2-3 of these)
const VIBRANT_THEMES = [
  {
    name: 'Neon City Nights',
    prompt:
      'Cinematic aerial view of vibrant neon-lit cityscape at night, colorful lights reflecting on wet streets, dynamic camera movement gliding over bustling downtown, electric purple and cyan tones, urban energy, 4K quality',
  },
  {
    name: 'Abstract Color Flow',
    prompt:
      'Mesmerizing abstract liquid colors flowing and swirling, vibrant gradient transitions from magenta to cyan to golden yellow, smooth fluid motion, paint mixing in water, ethereal dreamy aesthetic, 4K quality',
  },
  {
    name: 'Tropical Sunset Paradise',
    prompt:
      'Stunning tropical beach at golden hour sunset, vibrant orange and pink sky, palm trees swaying gently, crystal clear turquoise water, peaceful paradise vibes, cinematic wide angle, 4K quality',
  },
  {
    name: 'Northern Lights Magic',
    prompt:
      'Breathtaking aurora borealis dancing across night sky, vivid green and purple northern lights, snow-covered landscape below, stars twinkling, magical natural phenomenon, time-lapse smooth motion, 4K quality',
  },
  {
    name: 'Colorful Urban Art',
    prompt:
      'Vibrant street art mural with bold colors, graffiti style, dynamic geometric patterns, neon spray paint effects, urban culture aesthetic, camera slowly panning across colorful wall, 4K quality',
  },
];

async function generate20MinVibrantBeat() {
  console.log('🎨 GENERATING 20-MINUTE VIBRANT BEAT VIDEO\n');
  console.log('📝 Configuration:');
  console.log('   Duration: 20 minutes (1200 seconds)');
  console.log('   Visual clips: 2-3 vibrant backgrounds');
  console.log('   Style: Extended lofi/chill beat');
  console.log('   Aspect ratio: 9:16 (vertical)\n');
  console.log('='.repeat(70));

  try {
    // PHASE 1: Generate extended 20-minute beat
    console.log('\n🎵 PHASE 1: GENERATING 20-MINUTE BEAT\n');
    console.log('   Generating 10 tracks (~2 min each) for seamless 20-minute mix...');

    const beatStyle =
      'lofi hip-hop, chill study beats, 85-90 BPM smooth groove, jazzy chords, vinyl crackle, ambient synth pad, mellow bass, dreamy atmospheric peaceful';
    const beatTitle = '20 Minute Lofi Study Session - Deep Focus';

    console.log(`   Style: ${beatStyle}\n`);

    const allTracks: any[] = [];

    // Generate 10 tracks (each ~2 minutes)
    for (let i = 0; i < 10; i++) {
      console.log(`   [${i + 1}/10] Generating track ${i + 1}...`);

      const sunoResult = await sunoApi.generateSong({
        lyrics: '',
        style: beatStyle,
        title: `${beatTitle} - Part ${i + 1}`,
        instrumental: true,
        model: 'V5',
      });

      console.log(`   Task ID: ${sunoResult.taskId}`);

      const tracks = await sunoApi.waitForCompletion(sunoResult.taskId, 600000);

      if (!tracks || tracks.length === 0) {
        console.error(`   ⚠️  Track ${i + 1} failed, continuing...`);
        continue;
      }

      const track = tracks.reduce((longest, t) => (t.duration > longest.duration ? t : longest));

      allTracks.push(track);
      console.log(`   ✅ Track ${i + 1}: ${track.duration.toFixed(1)}s`);
    }

    if (allTracks.length === 0) {
      throw new Error('No tracks generated successfully');
    }

    console.log(`\n✅ Generated ${allTracks.length} tracks`);
    const totalDuration = allTracks.reduce((sum, t) => sum + t.duration, 0);
    console.log(`   Total duration: ${(totalDuration / 60).toFixed(1)} minutes\n`);

    // Download all tracks
    console.log('💾 Downloading all tracks...');
    const audioPaths: string[] = [];

    for (let i = 0; i < allTracks.length; i++) {
      const track = allTracks[i];
      const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `beat_part_${i + 1}_${Date.now()}.mp3`);

      const response = await axios.get(track.audioUrl, { responseType: 'arraybuffer' });
      fs.writeFileSync(audioPath, response.data);
      audioPaths.push(audioPath);

      console.log(
        `   [${i + 1}/${allTracks.length}] Downloaded: ${(fs.statSync(audioPath).size / 1024 / 1024).toFixed(1)} MB`,
      );
    }

    // Concatenate all tracks into one 20-minute audio file
    console.log('\n🔗 Concatenating tracks into 20-minute mix...');
    const concatListPath = join(process.cwd(), 'data', 'temp', 'processing', `audio_concat_${Date.now()}.txt`);
    const concatContent = audioPaths.map((p) => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent);

    const audioPath = join(process.cwd(), 'data', 'temp', 'processing', `vibrant_20min_beat_${Date.now()}.mp3`);
    execSync(`ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${audioPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ 20-minute mix: ${audioPath}`);
    console.log(`   File size: ${(fs.statSync(audioPath).size / 1024 / 1024).toFixed(1)} MB`);

    const track = { duration: totalDuration, audioUrl: audioPath };

    // PHASE 2: Generate 2-3 vibrant video clips
    console.log('\n🎬 PHASE 2: GENERATING VIBRANT VISUALS\n');

    // Randomly select 2-3 themes
    const numClips = Math.random() > 0.5 ? 3 : 2;
    const selectedThemes = VIBRANT_THEMES.sort(() => Math.random() - 0.5).slice(0, numClips);

    console.log(`   Selected ${numClips} vibrant themes:`);
    selectedThemes.forEach((theme, i) => {
      console.log(`   ${i + 1}. ${theme.name}`);
    });
    console.log('');

    const videoClips: string[] = [];

    for (let i = 0; i < selectedThemes.length; i++) {
      const theme = selectedThemes[i];
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`🎨 Clip ${i + 1}/${numClips}: ${theme.name}`);
      console.log(`${'─'.repeat(70)}`);
      console.log(`   Prompt: ${theme.prompt.slice(0, 80)}...`);
      console.log(`   Generating 5-second base clip with Kling AI...`);

      try {
        const result = await klingVideoGenerator.generateSingleClip(theme.prompt, {
          aspectRatio: '9:16',
          duration: 5,
          negativePrompt: 'blurry, low quality, static, boring, dull colors, dark, ugly',
          refImage: undefined,
        });

        console.log(`   ✅ Video generated!`);

        if (!result?.localPath) {
          console.error(`   ❌ Failed to generate clip ${i + 1}, skipping...`);
          continue;
        }

        videoClips.push(result.localPath);
        console.log(`   ✅ Saved: ${result.localPath}`);
      } catch (error: any) {
        console.error(`   ❌ Error generating clip ${i + 1}: ${error.message}`);
      }
    }

    if (videoClips.length === 0) {
      throw new Error('No video clips generated successfully');
    }

    console.log(`\n✅ Generated ${videoClips.length} vibrant clips`);

    // PHASE 3: Loop videos to match 20-minute audio
    console.log('\n🔄 PHASE 3: EXTENDING VIDEOS TO 20 MINUTES\n');
    console.log(`   Target duration: ${(track.duration / 60).toFixed(1)} minutes (${track.duration.toFixed(0)}s)`);
    console.log(`   Clips to loop: ${videoClips.length}`);

    // Calculate how many times to loop each clip
    const segmentDuration = track.duration / videoClips.length;
    const loopsPerClip = Math.ceil(segmentDuration / 5); // Each clip is 5s

    console.log(`   Each clip segment: ${segmentDuration.toFixed(1)}s`);
    console.log(`   Loops per clip: ${loopsPerClip}x`);

    const extendedClips: string[] = [];

    for (let i = 0; i < videoClips.length; i++) {
      const clipPath = videoClips[i];
      const extendedPath = join(process.cwd(), 'data', 'temp', 'processing', `extended_${i + 1}_${Date.now()}.mp4`);

      console.log(`\n   [${i + 1}/${videoClips.length}] Looping ${selectedThemes[i].name}...`);

      // Create concat list for FFmpeg
      const concatFile = join(process.cwd(), 'data', 'temp', 'processing', `concat_${i}_${Date.now()}.txt`);
      const loopConcatContent = Array(loopsPerClip).fill(`file '${clipPath}'`).join('\n');
      fs.writeFileSync(concatFile, loopConcatContent);

      // Loop video with FFmpeg
      execSync(
        `ffmpeg -f concat -safe 0 -i "${concatFile}" -t ${segmentDuration} -c copy "${extendedPath}" -y -loglevel error`,
        { stdio: 'inherit' },
      );

      extendedClips.push(extendedPath);
      console.log(`   ✅ Extended clip ${i + 1}: ${segmentDuration.toFixed(1)}s`);
    }

    // PHASE 4: Concatenate all extended clips
    console.log('\n🎞️  PHASE 4: ASSEMBLING FINAL VIDEO\n');
    console.log(`   Combining ${extendedClips.length} extended clips...`);

    const videoOnlyPath = join(process.cwd(), 'data', 'temp', 'processing', `assembled_video_${Date.now()}.mp4`);
    const finalConcatFile = join(process.cwd(), 'data', 'temp', 'processing', `final_concat_${Date.now()}.txt`);
    const finalConcatContent = extendedClips.map((f) => `file '${f}'`).join('\n');
    fs.writeFileSync(finalConcatFile, finalConcatContent);

    execSync(`ffmpeg -f concat -safe 0 -i "${finalConcatFile}" -c copy "${videoOnlyPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ Video assembled: ${videoOnlyPath}`);

    // PHASE 5: Merge audio + video
    console.log('\n🎵 PHASE 5: MERGING AUDIO + VIDEO\n');

    const finalPath = join(process.cwd(), 'data/videos/renders', `vibrant_20min_${Date.now()}.mp4`);

    // Ensure renders directory exists
    execSync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

    console.log(`   Merging ${(track.duration / 60).toFixed(1)} min audio with video...`);
    execSync(
      `ffmpeg -i "${videoOnlyPath}" -i "${audioPath}" -c:v copy -c:a aac -b:a 192k -shortest "${finalPath}" -y -loglevel error`,
      { stdio: 'inherit' },
    );
    console.log(`   ✅ Final video: ${finalPath}`);

    // Generate thumbnail
    console.log('\n🖼️  Generating thumbnail...');
    const thumbnailPath = join(process.cwd(), 'data/thumbnails', `vibrant_20min_${Date.now()}.jpg`);
    execSync(`mkdir -p ${join(process.cwd(), 'data/thumbnails')}`);
    execSync(`ffmpeg -i "${finalPath}" -ss 00:00:03 -vframes 1 -q:v 2 "${thumbnailPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ Thumbnail: ${thumbnailPath}`);

    // RESULTS
    const fileSizeMB = (fs.statSync(finalPath).size / 1024 / 1024).toFixed(1);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`✅ 20-MINUTE VIBRANT BEAT VIDEO COMPLETE!`);
    console.log(`${'='.repeat(70)}`);
    console.log(`\n🎵 Audio:`);
    console.log(`   Title: ${beatTitle}`);
    console.log(`   Duration: ${(track.duration / 60).toFixed(1)} minutes`);
    console.log(`   BPM: 85-90 (lofi chill)`);
    console.log(`\n🎨 Visuals:`);
    selectedThemes.forEach((theme, i) => {
      console.log(`   ${i + 1}. ${theme.name}`);
    });
    console.log(`\n📊 Stats:`);
    console.log(`   Video clips: ${videoClips.length}`);
    console.log(`   Loops per clip: ${loopsPerClip}x`);
    console.log(`   Total duration: ${(track.duration / 60).toFixed(1)} minutes`);
    console.log(`   File size: ${fileSizeMB} MB`);
    console.log(`   Resolution: 720x1280 (9:16)`);
    console.log(`\n📁 Output Files:`);
    console.log(`   Video: ${finalPath}`);
    console.log(`   Thumbnail: ${thumbnailPath}`);
    console.log(`\n💰 Cost Estimate:`);
    console.log(`   Suno: $0.10 (1 track)`);
    console.log(`   Kling: ${(0.1 * videoClips.length).toFixed(2)} (${videoClips.length} clips)`);
    console.log(`   Total: ${(0.1 + 0.1 * videoClips.length).toFixed(2)}`);
    console.log(`\n✨ Perfect for:`);
    console.log(`   📚 Extended study sessions`);
    console.log(`   💻 Deep work & coding`);
    console.log(`   🧘 Meditation & focus`);
    console.log(`   🎨 Creative flow states`);
    console.log(`${'='.repeat(70)}\n`);
  } catch (error: any) {
    console.error(`\n❌ Error generating 20-minute beat: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the generator
generate20MinVibrantBeat();
