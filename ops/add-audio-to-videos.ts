import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const videoMusicPairs = [
  {
    jobId: '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce',
    name: 'Pope Formosus',
    videoFile: 'unity_final_13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce_1767397113818.mp4',
    musicFile: 'attached_assets/suno_audio/suno_1767327648999_gmih48.mp3',
  },
  {
    jobId: '1efa0a2b-778d-405d-a54d-82abfd96d8d3',
    name: 'Tomoe Gozen',
    videoFile: 'unity_final_1efa0a2b-778d-405d-a54d-82abfd96d8d3_1767397229331.mp4',
    musicFile: 'attached_assets/suno_audio/suno_1767323472821_5dnodl.mp3',
  },
];

async function addAudioToVideo(jobId: string, name: string, videoFilename: string, musicPath: string) {
  console.log(`\n🎵 Adding audio to: ${name}`);

  const videoPath = path.join(process.cwd(), 'data', 'videos', 'renders', videoFilename);
  const musicFullPath = path.join(process.cwd(), musicPath);

  // Check files exist
  if (!fs.existsSync(videoPath)) {
    console.error(`   ❌ Video not found: ${videoPath}`);
    return;
  }

  if (!fs.existsSync(musicFullPath)) {
    console.error(`   ❌ Music not found: ${musicFullPath}`);
    return;
  }

  console.log(`   📹 Video: ${path.basename(videoPath)}`);
  console.log(`   🎵 Music: ${path.basename(musicFullPath)}`);

  // Get video duration
  const videoDurationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
  const videoDuration = parseFloat(execSync(videoDurationCmd, { encoding: 'utf-8' }).trim());

  // Get music duration
  const musicDurationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${musicFullPath}"`;
  const musicDuration = parseFloat(execSync(musicDurationCmd, { encoding: 'utf-8' }).trim());

  console.log(`   📹 Video duration: ${videoDuration.toFixed(2)}s`);
  console.log(`   🎵 Music duration: ${musicDuration.toFixed(2)}s`);

  // Output filename
  const outputFilename = `unity_final_audio_${jobId}_${Date.now()}.mp4`;
  const outputPath = path.join(process.cwd(), 'data', 'videos', 'renders', outputFilename);

  try {
    // Add audio to video, trimming music if needed
    const ffmpegCmd = [
      'ffmpeg',
      `-i "${videoPath}"`,
      `-i "${musicFullPath}"`,
      '-c:v copy', // Copy video stream (no re-encoding)
      '-c:a aac', // Encode audio as AAC
      '-b:a 192k', // Audio bitrate
      '-shortest', // Stop when shortest stream ends
      '-y',
      `"${outputPath}"`,
    ].join(' ');

    console.log(`   🎬 Adding audio track...`);
    execSync(ffmpegCmd, { stdio: 'pipe' });

    if (!fs.existsSync(outputPath)) {
      throw new Error('FFmpeg did not create output file');
    }

    const stats = fs.statSync(outputPath);
    console.log(`   ✅ Video with audio created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Verify audio was added
    const audioCheckCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
    try {
      const audioCheck = execSync(audioCheckCmd, { encoding: 'utf-8' }).trim();
      if (audioCheck === 'audio') {
        console.log(`   ✅ Audio verified in final video`);
      } else {
        console.warn(`   ⚠️ Audio verification failed`);
      }
    } catch (e) {
      console.warn(`   ⚠️ Could not verify audio`);
    }

    // Update database with new video URL
    const videoUrl = `/api/videos/${outputFilename}`;

    await db
      .update(jobs)
      .set({
        video_url: videoUrl,
      })
      .where(eq(jobs.id, jobId));

    console.log(`   ✅ Database updated with new video URL: ${videoUrl}`);

    // Optional: Delete the old silent video
    try {
      fs.unlinkSync(videoPath);
      console.log(`   🗑️  Removed old silent video`);
    } catch (e) {
      // Ignore cleanup errors
    }
  } catch (error: any) {
    console.error(`   ❌ Failed to add audio: ${error.message}`);
    if (error.stderr) {
      console.error(`   FFmpeg error: ${error.stderr.toString().substring(0, 500)}`);
    }
  }
}

async function main() {
  console.log('🎵 Adding audio tracks to silent videos...\n');

  for (const pair of videoMusicPairs) {
    await addAudioToVideo(pair.jobId, pair.name, pair.videoFile, pair.musicFile);
  }

  console.log('\n✅ All videos processed!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
