import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const thumbnailDir = '/home/aaronishere2025/data/thumbnails';
const files = fs.readdirSync(thumbnailDir);

// Find all original PNG thumbnails (not compressed)
const originalPngs = files.filter((f) => f.includes('thumbnail.png') && !f.includes('compressed'));

console.log('🔧 Fixing thumbnail color space for YouTube compatibility...\n');

for (const pngFile of originalPngs) {
  const pngPath = `${thumbnailDir}/${pngFile}`;
  const videoId = pngFile.split('_')[0];
  const fixedPath = `${thumbnailDir}/${videoId}_fixed.jpg`;

  console.log(`📷 Processing ${videoId}...`);

  try {
    // Re-encode with proper color space for YouTube
    await execAsync(
      `ffmpeg -y -i "${pngPath}" -pix_fmt yuvj420p -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black" -q:v 3 "${fixedPath}"`,
    );

    const stats = fs.statSync(fixedPath);
    const sizeMB = (stats.size / 1024).toFixed(1);
    console.log(`   ✅ Fixed (${sizeMB} KB)\n`);
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }
}

console.log('✅ All thumbnails re-encoded with YouTube-compatible color space!');
