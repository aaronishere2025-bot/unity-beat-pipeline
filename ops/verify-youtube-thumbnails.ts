import { initializeSecretsFromGCP } from './server/secret-manager-loader';

const videoIds = ['sxTBOL8ByE8', 'ehO0ke8zt24', 'nUU7Rh1rTxg', 'cDJv0kbeyTU', 'R0X6RUJro8U', 'MN993V_lkbU'];

async function verifyThumbnails() {
  console.log('🔐 Loading secrets...');
  await initializeSecretsFromGCP();
  console.log('✅ Secrets loaded\n');

  const { youtubeUploadService } = await import('./server/services/youtube-upload-service');

  console.log('🔍 Checking YouTube for actual thumbnail status...\n');

  for (const videoId of videoIds) {
    console.log(`📺 Video: ${videoId}`);

    try {
      const details = await youtubeUploadService.getVideoDetails(videoId);

      if (!details) {
        console.log(`   ❌ Video not found\n`);
        continue;
      }

      console.log(`   Title: ${details.title}`);
      console.log(`   Thumbnails available:`);

      if (details.thumbnails) {
        console.log(`      Default: ${details.thumbnails.default ? '✅' : '❌'}`);
        console.log(`      Medium: ${details.thumbnails.medium ? '✅' : '❌'}`);
        console.log(`      High: ${details.thumbnails.high ? '✅' : '❌'}`);
        console.log(`      Standard: ${details.thumbnails.standard ? '✅' : '❌'}`);
        console.log(`      Maxres: ${details.thumbnails.maxres ? '✅' : '❌'}`);

        if (details.thumbnails.default) {
          console.log(`   📎 Thumbnail URL: ${details.thumbnails.default.url}`);
        }
      } else {
        console.log(`   ❌ No thumbnail data`);
      }

      console.log();
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}\n`);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('✅ Verification complete');
  process.exit(0);
}

verifyThumbnails().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
