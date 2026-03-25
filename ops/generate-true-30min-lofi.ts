#!/usr/bin/env tsx
/**
 * Generate TRUE 30-Minute Lofi Mix
 * - Keeps generating Suno tracks until we reach 30+ minutes
 * - No track limits, just time-based
 * - 1 Kling clip looped for entire duration
 */
import { sunoApi } from './server/services/suno-api';
import { klingVideoGenerator } from './server/services/kling-video-generator';
import { musicModeGenerator } from './server/services/music-mode-generator';
import { db } from './server/db';
import { jobs } from './shared/schema';
import { eq } from 'drizzle-orm';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { join } from 'path';

const execAsync = promisify(exec);

const TARGET_DURATION = 30 * 60; // 30 minutes in seconds
const STYLE =
  'lofi hip-hop, chill study beats, 80-85 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative';

console.log('🎧 GENERATING TRUE 30-MINUTE LOFI MIX (TIME-BASED)\n');
console.log('Strategy:');
console.log('  🎵 Generate Suno tracks until we reach 30+ minutes');
console.log('  🔗 Concatenate into seamless mix');
console.log('  🎬 Generate 1 Kling clip, loop for entire duration');
console.log('======================================================================\n');

// Phase 1: Generate tracks until we reach 30 minutes
console.log('🎵 [PHASE 1] Generating Suno tracks until 30+ minutes...');
console.log(`   Style: ${STYLE}`);
console.log('   ⏳ No track limit - generating until target duration reached\n');

const tracks: Array<{ path: string; duration: number; title: string }> = [];
let totalDuration = 0;
let trackCount = 0;

const trackTitles = [
  'Rainy Window - Lofi Study Session',
  'Coffee Shop Dreams - Chill Beats',
  'Midnight Study - Peaceful Vibes',
  'Moonlight Piano - Lofi Jazz',
  'Cozy Corner - Study Beats',
  'Late Night Focus - Chill Hop',
  'Warm Blanket - Lofi Vibes',
  'Book Pages - Study Music',
  'Gentle Rain - Chill Beats',
  'Quiet Hours - Lofi Study',
  'Ambient Thoughts - Study Mix',
  'Velvet Skies - Lofi Vibes',
  'City Lights - Chill Beats',
  'Notebook Dreams - Study Music',
  'Soft Focus - Lofi Jazz',
  'Evening Glow - Chill Hop',
  'Peaceful Mind - Study Beats',
  'Quiet Storm - Lofi Vibes',
  'Mellow Mood - Chill Beats',
  'Starlit Pages - Study Music',
];

while (totalDuration < TARGET_DURATION) {
  trackCount++;
  const title = trackTitles[Math.min(trackCount - 1, trackTitles.length - 1)];

  console.log(`\n   [${trackCount}] Generating: ${title}`);

  try {
    const result = await sunoApi.generateSong({
      title,
      style: STYLE,
      instrumental: true,
    });

    if (!result.success || !result.audioUrl) {
      console.log(`   ❌ Failed to generate track ${trackCount}`);
      continue;
    }

    // Download track
    const timestamp = Date.now();
    const trackPath = `${join(process.cwd(), 'data', 'temp', 'processing')}/lofi_track_${trackCount}_${timestamp}.mp3`;

    const downloadCmd = `curl -s -o "${trackPath}" "${result.audioUrl}"`;
    await execAsync(downloadCmd);

    // Get duration
    const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${trackPath}"`;
    const durationResult = await execAsync(durationCmd);
    const duration = parseFloat(durationResult.stdout.trim());

    const fileSizeMB = (fs.statSync(trackPath).size / 1024 / 1024).toFixed(1);
    console.log(`      ✅ Saved: ${fileSizeMB}MB → ${trackPath}`);
    console.log(`      ✅ Generated: ${(duration / 60).toFixed(1)} minutes (${duration.toFixed(1)}s)`);

    tracks.push({ path: trackPath, duration, title });
    totalDuration += duration;

    console.log(`      📊 Progress: ${(totalDuration / 60).toFixed(1)} / 30.0 minutes`);

    if (totalDuration >= TARGET_DURATION) {
      console.log(
        `\n   ✅ Target reached! Generated ${trackCount} tracks, total: ${(totalDuration / 60).toFixed(1)} minutes`,
      );
      break;
    }
  } catch (error) {
    console.log(`   ❌ Error generating track ${trackCount}:`, error);
    continue;
  }
}

// Phase 2: Concatenate
console.log(`\n🔗 [PHASE 2] Concatenating ${trackCount} tracks into seamless mix...`);

const timestamp = Date.now();
const concatListPath = `${join(process.cwd(), 'data', 'temp', 'processing')}/concat_list_${timestamp}.txt`;
const finalMixPath = `${join(process.cwd(), 'data', 'temp', 'processing')}/lofi_30min_mix_${timestamp}.mp3`;

// Create concat list
const concatList = tracks.map((t) => `file '${t.path}'`).join('\n');
fs.writeFileSync(concatListPath, concatList);
console.log(`   📄 Concat list: ${concatListPath}`);

// Concatenate
console.log('   🎵 Concatenating tracks (gapless)...');
const concatCmd = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${finalMixPath}" -y`;
await execAsync(concatCmd);

const finalSizeMB = (fs.statSync(finalMixPath).size / 1024 / 1024).toFixed(1);
console.log(`   ✅ Final mix: ${finalSizeMB}MB → ${finalMixPath}`);
console.log(`   ⏱️  Duration: ${(totalDuration / 60).toFixed(1)} minutes`);

// Phase 3: Create job and generate video
console.log(`\n🎬 [PHASE 3] Generating 1 looping Kling clip for entire mix...`);

// Create job
const jobId = crypto.randomUUID();
await db.insert(jobs).values({
  id: jobId,
  script_name: `Lofi Study Mix - ${(totalDuration / 60).toFixed(1)} Minutes`,
  script_content: `Seamless ${(totalDuration / 60).toFixed(1)}-minute lofi hip-hop mix for studying, working, and relaxing. Compiled from ${trackCount} tracks with consistent chill vibes.`,
  mode: 'music',
  aspect_ratio: '16:9',
  status: 'processing',
  progress: 10,
  music_url: '/audio/lofi_30min_mix.mp3',
  audio_duration: totalDuration.toFixed(2),
  auto_upload: false,
  created_at: new Date(),
  updated_at: new Date(),
});

console.log(`   ✅ Job created: ${jobId}\n`);

// Generate video with music mode
console.log('   This will:');
console.log('   - Analyze beats and energy with librosa');
console.log('   - Select lofi-themed visual (anime study room, rainy window, etc.)');
console.log('   - Generate 5s Kling AI background');
console.log(`   - Loop seamlessly to match ${(totalDuration / 60).toFixed(1)} minutes of audio`);
console.log(`   - Render final ${(totalDuration / 60).toFixed(1)}-minute video`);
console.log('   ⏳ Generating...\n');

try {
  const result = await musicModeGenerator.generateBackgroundVideo(
    jobId,
    finalMixPath,
    totalDuration,
    'hiphop', // Theme selector
  );

  console.log('\n[100%] Complete!\n');
  console.log('✅ TRUE 30-MINUTE LOFI STUDY MIX COMPLETE!');
  console.log('======================================================================');
  console.log(`   🎵 Title: Lofi Study Mix - ${(totalDuration / 60).toFixed(1)} Minutes`);
  console.log(`   📊 Tracks: ${trackCount} seamlessly mixed`);
  console.log(`   ⏱️  Duration: ${(totalDuration / 60).toFixed(1)} minutes`);
  console.log(`   📁 Video: ${result.videoPath}`);
  console.log(`   🖼️  Thumbnail: ${result.thumbnailPath}`);
  console.log('======================================================================');
  console.log('📺 View your lofi mix at: http://localhost:8080\n');

  console.log('Track List:');
  tracks.forEach((track, i) => {
    console.log(`   ${i + 1}. ${track.title} (${(track.duration / 60).toFixed(1)} min)`);
  });

  console.log('\nPerfect for:');
  console.log(`  🎓 Extended study sessions (${(totalDuration / 60).toFixed(1)} minutes uninterrupted)`);
  console.log('  👨‍💻 Long coding marathons');
  console.log('  📝 Deep work and creative projects');
  console.log('  🧘 Background music for sustained focus');
  console.log('\n🎉 Enjoy your extended chill vibes!\n');
} catch (error) {
  console.error('❌ Error generating video:', error);
  await db
    .update(jobs)
    .set({
      status: 'failed',
      error_message: String(error),
    })
    .where(eq(jobs.id, jobId));
}

// Cleanup individual tracks
console.log('\n🧹 Cleaning up individual track files...');
for (const track of tracks) {
  try {
    fs.unlinkSync(track.path);
    console.log(`   🗑️  Removed: ${track.path}`);
  } catch (e) {
    // Ignore cleanup errors
  }
}
console.log('   ✅ Cleanup complete!\n');

process.exit(0);
