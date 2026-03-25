#!/usr/bin/env tsx
/**
 * Finish 20-minute beat video using existing audio
 * (Audio generation already completed - just need video now)
 */

import { klingVideoGenerator } from './server/services/kling-video-generator';
import { join } from 'path';
import { execSync } from 'child_process';
import fs from 'fs';

// Use the existing 20-minute audio file
const EXISTING_AUDIO = join(process.cwd(), 'data', 'temp', 'processing', 'vibrant_20min_beat_1768605334734.mp3');

// Vibrant visual themes
const VIBRANT_THEMES = [
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
];

async function finish20MinVibrantBeat() {
  console.log('🎨 FINISHING 20-MINUTE VIBRANT BEAT VIDEO\n');
  console.log('✅ Using existing 20-minute audio mix');
  console.log(`   Audio file: ${EXISTING_AUDIO}`);
  console.log(`   File size: ${(fs.statSync(EXISTING_AUDIO).size / 1024 / 1024).toFixed(1)} MB\n`);

  // Get audio duration
  const durationCmd = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${EXISTING_AUDIO}"`,
  );
  const audioDuration = parseFloat(durationCmd.toString().trim());
  console.log(`   Duration: ${(audioDuration / 60).toFixed(1)} minutes (${audioDuration.toFixed(0)}s)\n`);
  console.log('='.repeat(70));

  try {
    // Check if videos already exist
    const existingVideos = [
      '/home/aaronishere2025/data/videos/clips/kling_1768605417461_gxm3cz.mp4',
      '/home/aaronishere2025/data/videos/clips/kling_1768605458602_gdatz5.mp4',
    ];

    const videoClips = existingVideos.filter((p) => fs.existsSync(p));

    if (videoClips.length > 0) {
      console.log(`\n✅ Found ${videoClips.length} existing video clips!`);
      videoClips.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p}`);
      });
    } else {
      // Generate 2 new clips
      console.log('\n🎬 GENERATING 2 VIBRANT VIDEO CLIPS\n');

      for (let i = 0; i < VIBRANT_THEMES.length; i++) {
        const theme = VIBRANT_THEMES[i];
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`🎨 Clip ${i + 1}/${VIBRANT_THEMES.length}: ${theme.name}`);
        console.log(`${'─'.repeat(70)}`);

        try {
          const result = await klingVideoGenerator.generateSingleClip(theme.prompt, {
            aspectRatio: '9:16',
            duration: 5,
            negativePrompt: 'blurry, low quality, static, boring, dull colors, dark, ugly',
            refImage: undefined,
          });

          if (result?.localPath && fs.existsSync(result.localPath)) {
            videoClips.push(result.localPath);
            console.log(`   ✅ Saved: ${result.localPath}`);
          }
        } catch (error: any) {
          console.error(`   ❌ Error: ${error.message}`);
        }
      }
    }

    if (videoClips.length === 0) {
      throw new Error('No video clips available');
    }

    console.log(`\n✅ Using ${videoClips.length} video clips`);

    // PHASE 3: Loop videos to match 20-minute audio
    console.log('\n🔄 EXTENDING VIDEOS TO 20 MINUTES\n');
    console.log(`   Target duration: ${(audioDuration / 60).toFixed(1)} minutes (${audioDuration.toFixed(0)}s)`);

    const segmentDuration = audioDuration / videoClips.length;
    const loopsPerClip = Math.ceil(segmentDuration / 5);

    console.log(`   Each clip segment: ${segmentDuration.toFixed(1)}s`);
    console.log(`   Loops per clip: ${loopsPerClip}x`);

    const extendedClips: string[] = [];

    for (let i = 0; i < videoClips.length; i++) {
      const clipPath = videoClips[i];
      const extendedPath = join(process.cwd(), 'data', 'temp', 'processing', `extended_${i + 1}_${Date.now()}.mp4`);

      console.log(`\n   [${i + 1}/${videoClips.length}] Looping clip ${i + 1}...`);

      const concatFile = join(process.cwd(), 'data', 'temp', 'processing', `concat_${i}_${Date.now()}.txt`);
      const concatContent = Array(loopsPerClip).fill(`file '${clipPath}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      execSync(
        `ffmpeg -f concat -safe 0 -i "${concatFile}" -t ${segmentDuration} -c copy "${extendedPath}" -y -loglevel error`,
        { stdio: 'inherit' },
      );

      extendedClips.push(extendedPath);
      console.log(`   ✅ Extended: ${segmentDuration.toFixed(1)}s`);
    }

    // PHASE 4: Concatenate all extended clips
    console.log('\n🎞️  ASSEMBLING FINAL VIDEO\n');

    const videoOnlyPath = join(process.cwd(), 'data', 'temp', 'processing', `assembled_video_${Date.now()}.mp4`);
    const finalConcatFile = join(process.cwd(), 'data', 'temp', 'processing', `final_concat_${Date.now()}.txt`);
    const finalConcatContent = extendedClips.map((f) => `file '${f}'`).join('\n');
    fs.writeFileSync(finalConcatFile, finalConcatContent);

    execSync(`ffmpeg -f concat -safe 0 -i "${finalConcatFile}" -c copy "${videoOnlyPath}" -y -loglevel error`, {
      stdio: 'inherit',
    });
    console.log(`   ✅ Video assembled`);

    // PHASE 5: Merge audio + video
    console.log('\n🎵 MERGING AUDIO + VIDEO\n');

    const finalPath = join(process.cwd(), 'data/videos/renders', `vibrant_20min_${Date.now()}.mp4`);

    execSync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

    execSync(
      `ffmpeg -i "${videoOnlyPath}" -i "${EXISTING_AUDIO}" -c:v copy -c:a aac -b:a 192k -shortest "${finalPath}" -y -loglevel error`,
      { stdio: 'inherit' },
    );
    console.log(`   ✅ Final video: ${finalPath}`);

    // Generate thumbnail
    console.log('\n🖼️  GENERATING THUMBNAIL\n');
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
    console.log(`\n🎵 Audio: 20 Minute Lofi Study Session`);
    console.log(`   Duration: ${(audioDuration / 60).toFixed(1)} minutes`);
    console.log(`\n🎨 Visuals: ${videoClips.length} vibrant themes looped seamlessly`);
    console.log(`\n📊 Stats:`);
    console.log(`   Video clips: ${videoClips.length}`);
    console.log(`   Loops per clip: ${loopsPerClip}x`);
    console.log(`   File size: ${fileSizeMB} MB`);
    console.log(`\n📁 Output:`);
    console.log(`   Video: ${finalPath}`);
    console.log(`   Thumbnail: ${thumbnailPath}`);
    console.log(`${'='.repeat(70)}\n`);
  } catch (error: any) {
    console.error(`\n❌ Error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

finish20MinVibrantBeat();
