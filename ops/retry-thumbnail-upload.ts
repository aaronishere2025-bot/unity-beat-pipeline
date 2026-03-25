import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { config } from 'dotenv';
import fs from 'fs';

config();
await initializeSecretsFromGCP();

const { youtubeUploadService } = await import('./server/services/youtube-upload-service.js');

const videos = [
  { id: 'sxTBOL8ByE8', title: 'Louis Pasteur' },
  { id: 'R0X6RUJro8U', title: 'Catherine the Great' },
  { id: 'cDJv0kbeyTU', title: 'George Washington' },
  { id: 'ehO0ke8zt24', title: 'Jack Johnson' },
  { id: 'nUU7Rh1rTxg', title: 'Theodore Roosevelt' },
  { id: 'MN993V_lkbU', title: 'Hannibal' },
];

console.log('🔄 Retrying thumbnail uploads with detailed logging...\n');

// Find the compressed thumbnails we created
const thumbnailDir = '/home/aaronishere2025/data/thumbnails';
const files = fs.readdirSync(thumbnailDir);

for (const video of videos) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📹 ${video.title} (${video.id})`);

  // Find the compressed thumbnail for this video
  const thumbnailFile = files.find((f) => f.includes(video.id) && f.includes('compressed'));

  if (!thumbnailFile) {
    console.log(`   ❌ No compressed thumbnail found`);
    continue;
  }

  const thumbnailPath = `${thumbnailDir}/${thumbnailFile}`;
  const stats = fs.statSync(thumbnailPath);
  console.log(`   📁 Found: ${thumbnailFile}`);
  console.log(`   📊 Size: ${(stats.size / 1024).toFixed(1)} KB`);

  try {
    console.log(`   📤 Uploading...`);
    const result = await youtubeUploadService.setThumbnail(video.id, thumbnailPath);

    if (result.success) {
      console.log(`   ✅ SUCCESS!`);
    } else {
      console.log(`   ❌ FAILED: ${result.error}`);
    }

    // Wait between uploads
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error: any) {
    console.log(`   ❌ ERROR: ${error.message}`);
    console.log(`   Stack: ${error.stack?.substring(0, 200)}`);
  }
}

console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ Retry complete');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
