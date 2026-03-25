import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { config } from 'dotenv';

config();
await initializeSecretsFromGCP();

const { youtubeUploadService } = await import('./server/services/youtube-upload-service.js');

const videoIds = [
  'sxTBOL8ByE8', // Louis Pasteur
  'R0X6RUJro8U', // Catherine the Great
  'cDJv0kbeyTU', // George Washington
  'ehO0ke8zt24', // Jack Johnson
  'nUU7Rh1rTxg', // Theodore Roosevelt
  'MN993V_lkbU', // Hannibal
];

console.log('🔍 Checking thumbnail status for all 6 videos...\n');

for (const videoId of videoIds) {
  const stats = await youtubeUploadService.getVideoStatsById(videoId);

  if (stats) {
    console.log(`📹 ${stats.title}`);
    console.log(`   Video ID: ${videoId}`);
    console.log(`   Thumbnail URL: ${stats.thumbnailUrl || 'NO THUMBNAIL'}`);

    // Check if it's a custom thumbnail or default
    if (stats.thumbnailUrl) {
      const isDefault =
        stats.thumbnailUrl.includes('default') ||
        stats.thumbnailUrl.includes('hqdefault') ||
        stats.thumbnailUrl.includes('mqdefault');
      console.log(`   Status: ${isDefault ? '❌ DEFAULT (no custom thumbnail)' : '✅ CUSTOM THUMBNAIL'}`);
    } else {
      console.log(`   Status: ❌ NO THUMBNAIL`);
    }
    console.log('');
  }
}
