import { db } from './server/db.js';
import { jobs } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const jobsToFix = [
  {
    id: '13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce',
    videoFile: 'unity_final_13f8da7f-be93-4b2f-8ca4-a3da8d2a02ce_1767338989054.mp4',
    name: 'Pope Formosus',
  },
  {
    id: '1efa0a2b-778d-405d-a54d-82abfd96d8d3',
    videoFile: 'unity_final_1efa0a2b-778d-405d-a54d-82abfd96d8d3_1767339742385.mp4',
    name: 'Tomoe Gozen',
  },
];

async function fixJob(jobId: string, videoFile: string, name: string) {
  console.log(`\n🔧 Fixing job: ${name} (${jobId})`);

  const videoPath = path.join(process.cwd(), 'data/videos/renders', videoFile);

  // Check if video exists
  if (!fs.existsSync(videoPath)) {
    console.error(`❌ Video file not found: ${videoPath}`);
    return;
  }

  console.log(`✅ Found video: ${videoFile}`);

  // Generate thumbnail
  const thumbnailFile = `${jobId}_thumb.jpg`;
  const thumbnailPath = path.join(process.cwd(), 'data/thumbnails', thumbnailFile);

  try {
    console.log(`📸 Generating thumbnail...`);
    execSync(`ffmpeg -i "${videoPath}" -ss 00:00:01 -vframes 1 -vf "scale=1280:-1" "${thumbnailPath}" -y`, {
      stdio: 'pipe',
    });
    console.log(`✅ Thumbnail generated: ${thumbnailFile}`);
  } catch (error: any) {
    console.error(`❌ Thumbnail generation failed: ${error.message}`);
  }

  // Get video duration and file size
  let duration: number | null = null;
  let fileSize: number | null = null;

  try {
    const stats = fs.statSync(videoPath);
    fileSize = stats.size;

    // Get duration using ffprobe
    const durationOutput = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf-8', stdio: 'pipe' },
    );
    duration = Math.round(parseFloat(durationOutput.trim()));
  } catch (error: any) {
    console.warn(`⚠️ Could not get video metadata: ${error.message}`);
  }

  // Update database
  const videoUrl = `/api/videos/${videoFile}`;
  const thumbnailUrl = fs.existsSync(thumbnailPath) ? `/api/thumbnails/${thumbnailFile}` : null;

  await db
    .update(jobs)
    .set({
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      duration: duration,
      file_size: fileSize ? fileSize.toString() : null,
    })
    .where(eq(jobs.id, jobId));

  console.log(`✅ Database updated:`);
  console.log(`   - videoUrl: ${videoUrl}`);
  console.log(`   - thumbnailUrl: ${thumbnailUrl}`);
  console.log(`   - duration: ${duration}s`);
  console.log(`   - fileSize: ${fileSize ? (fileSize / 1024 / 1024).toFixed(2) : '?'} MB`);
}

async function main() {
  console.log('🔧 Fixing missing video URLs in database...\n');

  for (const job of jobsToFix) {
    await fixJob(job.id, job.videoFile, job.name);
  }

  console.log('\n✅ All jobs fixed!');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
