#!/usr/bin/env tsx
import { join } from 'path';
/**
 * Extend existing 19.4-minute mix to 30+ minutes
 * - Generate 6 more Suno tracks
 * - Concatenate with existing mix
 * - Generate new video
 */
import { sunoApi } from './server/services/suno-api';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { db } from './server/db';
import { jobs } from './shared/schema';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

const EXISTING_MIX = join(process.cwd(), 'data', 'temp', 'processing', 'lofi_30min_mix_1768882442385.mp3');
const EXISTING_DURATION = 1165.2; // 19.4 minutes
const TARGET_DURATION = 30 * 60; // 30 minutes
const NEEDED_DURATION = TARGET_DURATION - EXISTING_DURATION; // ~10.6 minutes
const STYLE =
  'lofi hip-hop, chill study beats, 80-85 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative';

console.log('🎧 EXTENDING 19.4-MINUTE MIX TO 30+ MINUTES\n');
console.log(`📊 Existing: 19.4 minutes (${EXISTING_DURATION.toFixed(0)}s)`);
console.log(`📊 Need: ${(NEEDED_DURATION / 60).toFixed(1)} more minutes`);
console.log(`📊 Target: 6 additional tracks\n`);

const newTracks: Array<{ path: string; duration: number; title: string }> = [];
let totalAdded = 0;

const trackTitles = [
  'Twilight Hours - Lofi Study',
  'Peaceful Afternoon - Chill Beats',
  'Soft Clouds - Study Music',
  'Cozy Reading - Lofi Jazz',
  'Morning Brew - Chill Hop',
  'Calm Waters - Study Beats',
];

for (let i = 0; i < trackTitles.length && totalAdded < NEEDED_DURATION; i++) {
  const title = trackTitles[i];
  console.log(`\n   [${i + 1}/6] Generating: ${title}`);

  try {
    const result = await sunoApi.generateSong({
      title,
      style: STYLE,
      instrumental: true,
    });

    if (!result.success || !result.audioUrl) {
      console.log(`   ❌ Failed, skipping`);
      continue;
    }

    const timestamp = Date.now();
    const trackPath = `${join(process.cwd(), 'data', 'temp', 'processing')}/lofi_extend_${i + 1}_${timestamp}.mp3`;

    await execAsync(`curl -s -o "${trackPath}" "${result.audioUrl}"`);

    const durationResult = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${trackPath}"`,
    );
    const duration = parseFloat(durationResult.stdout.trim());

    const fileSizeMB = (fs.statSync(trackPath).size / 1024 / 1024).toFixed(1);
    console.log(`      ✅ Saved: ${fileSizeMB}MB (${duration.toFixed(1)}s)`);

    newTracks.push({ path: trackPath, duration, title });
    totalAdded += duration;

    console.log(`      📊 Progress: ${totalAdded.toFixed(0)}s / ${NEEDED_DURATION.toFixed(0)}s added`);

    // Delay to avoid rate limiting
    if (i < trackTitles.length - 1) {
      console.log(`      ⏳ Waiting 5s before next track...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  } catch (error) {
    console.log(`   ❌ Error:`, error);
    continue;
  }
}

const finalDuration = EXISTING_DURATION + totalAdded;
console.log(`\n✅ Generated ${newTracks.length} tracks, total added: ${(totalAdded / 60).toFixed(1)} minutes`);
console.log(`📊 Final duration: ${(finalDuration / 60).toFixed(1)} minutes\n`);

// Concatenate
console.log('🔗 Concatenating with existing mix...');

const timestamp = Date.now();
const concatListPath = `${join(process.cwd(), 'data', 'temp', 'processing')}/concat_extend_${timestamp}.txt`;
const finalMixPath = `${join(process.cwd(), 'data', 'temp', 'processing')}/lofi_full_30min_${timestamp}.mp3`;

const concatList = [`file '${EXISTING_MIX}'`, ...newTracks.map((t) => `file '${t.path}'`)].join('\n');

fs.writeFileSync(concatListPath, concatList);

await execAsync(`ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${finalMixPath}" -y`);

const finalSizeMB = (fs.statSync(finalMixPath).size / 1024 / 1024).toFixed(1);
console.log(`   ✅ Final mix: ${finalSizeMB}MB → ${finalMixPath}\n`);

// Create job and generate video
console.log('🎬 Generating video...\n');

const jobId = crypto.randomUUID();
await db.insert(jobs).values({
  id: jobId,
  script_name: `Lofi Study Mix - ${(finalDuration / 60).toFixed(1)} Minutes`,
  script_content: `Seamless ${(finalDuration / 60).toFixed(1)}-minute lofi hip-hop mix for studying. Extended from 10 base tracks + ${newTracks.length} additional tracks.`,
  mode: 'music',
  aspect_ratio: '16:9',
  status: 'processing',
  progress: 10,
  music_url: '/audio/lofi_full_30min.mp3',
  audio_duration: finalDuration.toFixed(2),
  auto_upload: false,
  created_at: new Date(),
  updated_at: new Date(),
});

console.log(`   ✅ Job created: ${jobId}\n`);

const result = await musicModeGenerator.generateBackgroundVideo(jobId, finalMixPath, finalDuration, 'hiphop');

console.log('\n✅ TRUE 30-MINUTE LOFI MIX COMPLETE!');
console.log('======================================================================');
console.log(`   🎵 Duration: ${(finalDuration / 60).toFixed(1)} minutes`);
console.log(`   📁 Video: ${result.videoPath}`);
console.log(`   🖼️  Thumbnail: ${result.thumbnailPath}`);
console.log('======================================================================');
console.log('📺 View at: http://localhost:8080\n');

// Cleanup
console.log('🧹 Cleaning up...');
for (const track of newTracks) {
  try {
    fs.unlinkSync(track.path);
    console.log(`   🗑️  Removed: ${track.path}`);
  } catch (e) {}
}
console.log('   ✅ Done!\n');

process.exit(0);
