import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { google } from 'googleapis';
import fs from 'fs';
import { config } from 'dotenv';

config();
await initializeSecretsFromGCP();

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI,
);

oauth2Client.setCredentials({
  refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
});

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const videoId = 'MN993V';
const thumbnailPath = '/home/aaronishere2025/data/thumbnails/MN993V_fixed.jpg';

console.log('📤 Uploading Hannibal thumbnail...\n');
console.log(`   Video ID: ${videoId}`);
console.log(`   File: ${thumbnailPath}`);
console.log(`   Size: ${(fs.statSync(thumbnailPath).size / 1024).toFixed(1)} KB\n`);

try {
  const response = await youtube.thumbnails.set({
    videoId: videoId,
    media: {
      body: fs.createReadStream(thumbnailPath),
    },
  });

  console.log('✅ SUCCESS! HTTP', response.status);
  console.log('   View at: https://www.youtube.com/watch?v=' + videoId);
  console.log('   Wait 1-2 minutes for YouTube to process');
} catch (error: any) {
  console.error('❌ Error:', error.message);
  if (error.response) {
    console.error('   Status:', error.response.status);
    console.error('   Data:', JSON.stringify(error.response.data, null, 2));
  }
}
