import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { storage } from './server/storage.js';

const jobsToReassemble = [
  '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce', // Pope Formosus
  '1efa0a2b-778d-405d-a54d-82abfd96d8d3', // Tomoe Gozen
];

async function reassembleJob(jobId: string) {
  console.log(`\n🔧 Reassembling job: ${jobId}`);

  // Get job details
  const job = await storage.getJob(jobId);
  if (!job) {
    console.error(`❌ Job not found: ${jobId}`);
    return;
  }

  console.log(`   Job: ${job.scriptName}`);
  console.log(`   Clips: ${job.completedClips?.length || 0}`);

  const completedClips = (job.completedClips as any[]) || [];
  if (completedClips.length < 2) {
    console.error(`❌ Not enough clips to assemble: ${completedClips.length}`);
    return;
  }

  // Sort clips by clipIndex
  const sortedClips = [...completedClips].sort((a, b) => a.clipIndex - b.clipIndex);

  // Get clip file paths
  const clipPaths: string[] = [];
  for (const clip of sortedClips) {
    const localPath = clip.videoPath || clip.localPath;
    if (localPath && fs.existsSync(localPath)) {
      clipPaths.push(localPath);
    } else {
      console.warn(`   ⚠️ Clip file missing: ${localPath}`);
    }
  }

  console.log(`   Valid clips: ${clipPaths.length}/${sortedClips.length}`);

  if (clipPaths.length < 2) {
    console.error(`❌ Not enough valid clip files`);
    return;
  }

  // Get music file
  const musicUrl = job.musicUrl;
  let musicPath: string | undefined;

  if (musicUrl) {
    const musicFilename = musicUrl.split('/').pop();
    const possiblePaths = [
      path.join(process.cwd(), 'data', 'suno-audio', musicFilename || ''),
      path.join('/tmp', 'unity-scratch', musicFilename || ''),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        musicPath = p;
        console.log(`   🎵 Music: ${path.basename(musicPath)}`);
        break;
      }
    }

    if (!musicPath) {
      console.warn(`   ⚠️ Music file not found, assembling without audio`);
    }
  }

  // Calculate total video duration (5 seconds per Kling clip)
  const videoDuration = clipPaths.length * 5;
  console.log(`   📹 Video duration: ${videoDuration}s (${clipPaths.length} × 5s clips)`);

  // Create concat file for FFmpeg
  const concatFile = path.join('/tmp', `concat_${jobId}.txt`);
  const concatContent = clipPaths.map((p) => `file '${p}'`).join('\n');
  fs.writeFileSync(concatFile, concatContent);

  // Output path
  const outputFilename = `unity_final_${jobId}_${Date.now()}.mp4`;
  const outputPath = path.join(process.cwd(), 'data', 'videos', 'renders', outputFilename);

  console.log(`\n🎬 Starting FFmpeg assembly...`);

  try {
    if (musicPath) {
      // Get music duration
      const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${musicPath}"`;
      const musicDurationStr = execSync(durationCmd, { encoding: 'utf-8' }).trim();
      const musicDuration = parseFloat(musicDurationStr);
      console.log(`   🎵 Music duration: ${musicDuration.toFixed(2)}s`);

      // Strategy: Trim music to match video duration if music is longer
      if (musicDuration > videoDuration + 0.5) {
        console.log(`   ✂️  Music is longer than video, will trim to ${videoDuration}s`);

        // Assemble with music trimmed to video duration
        const ffmpegCmd = [
          'ffmpeg',
          '-f concat',
          '-safe 0',
          `-i "${concatFile}"`,
          `-i "${musicPath}"`,
          '-filter_complex',
          `"[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[v];[1:a]atrim=0:${videoDuration},asetpts=PTS-STARTPTS[a]"`,
          '-map "[v]"',
          '-map "[a]"',
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          `-t ${videoDuration}`,
          '-y',
          `"${outputPath}"`,
        ].join(' ');

        console.log(`   Running: ${ffmpegCmd.substring(0, 100)}...`);
        execSync(ffmpegCmd, { stdio: 'pipe' });
      } else {
        // Music is shorter or equal, assemble normally
        const ffmpegCmd = [
          'ffmpeg',
          '-f concat',
          '-safe 0',
          `-i "${concatFile}"`,
          `-i "${musicPath}"`,
          '-filter_complex "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[v]"',
          '-map "[v]"',
          '-map "1:a"',
          '-c:v libx264',
          '-preset medium',
          '-crf 23',
          '-c:a aac',
          '-b:a 192k',
          '-shortest',
          '-y',
          `"${outputPath}"`,
        ].join(' ');

        console.log(`   Running FFmpeg...`);
        execSync(ffmpegCmd, { stdio: 'pipe' });
      }
    } else {
      // No music, just concat videos
      const ffmpegCmd = [
        'ffmpeg',
        '-f concat',
        '-safe 0',
        `-i "${concatFile}"`,
        '-filter_complex "[0:v]fps=30,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[v]"',
        '-map "[v]"',
        '-c:v libx264',
        '-preset medium',
        '-crf 23',
        '-y',
        `"${outputPath}"`,
      ].join(' ');

      console.log(`   Running FFmpeg (no audio)...`);
      execSync(ffmpegCmd, { stdio: 'pipe' });
    }

    // Check if output exists
    if (!fs.existsSync(outputPath)) {
      throw new Error('FFmpeg did not create output file');
    }

    const stats = fs.statSync(outputPath);
    console.log(`   ✅ Video assembled: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Generate thumbnail
    const thumbnailFile = `${jobId}_thumb.jpg`;
    const thumbnailPath = path.join(process.cwd(), 'data', 'thumbnails', thumbnailFile);

    console.log(`   📸 Generating thumbnail...`);
    execSync(`ffmpeg -i "${outputPath}" -ss 00:00:01 -vframes 1 -vf "scale=1280:-1" "${thumbnailPath}" -y`, {
      stdio: 'pipe',
    });

    // Get video duration
    const finalDurationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
    const finalDuration = parseFloat(execSync(finalDurationCmd, { encoding: 'utf-8' }).trim());

    // Update database
    const videoUrl = `/api/videos/${outputFilename}`;
    const thumbnailUrl = `/api/thumbnails/${thumbnailFile}`;

    await db
      .update(jobs)
      .set({
        status: 'completed',
        video_url: videoUrl,
        thumbnail_url: thumbnailUrl,
        duration: Math.round(finalDuration),
        file_size: stats.size.toString(),
        error_message: null, // Clear the error
      })
      .where(eq(jobs.id, jobId));

    console.log(`   ✅ Database updated:`);
    console.log(`      - videoUrl: ${videoUrl}`);
    console.log(`      - thumbnailUrl: ${thumbnailUrl}`);
    console.log(`      - duration: ${Math.round(finalDuration)}s`);
    console.log(`      - status: completed`);

    // Clean up concat file
    try {
      fs.unlinkSync(concatFile);
    } catch (e) {
      // Ignore
    }
  } catch (error: any) {
    console.error(`   ❌ Assembly failed: ${error.message}`);
    if (error.stderr) {
      console.error(`   FFmpeg error: ${error.stderr.toString().substring(0, 500)}`);
    }
  }
}

async function main() {
  console.log('🔧 Reassembling failed jobs with lenient music validation...\n');

  for (const jobId of jobsToReassemble) {
    await reassembleJob(jobId);
  }

  console.log('\n✅ All jobs processed!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
