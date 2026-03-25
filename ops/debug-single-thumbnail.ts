import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { config } from 'dotenv';
import { google } from 'googleapis';
import { createReadStream } from 'fs';

config();
await initializeSecretsFromGCP();

// Manually set up YouTube client
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI,
);

// Load credentials
const fs = await import('fs');
const credsPath = '/home/aaronishere2025/data/youtube_credentials.json';
const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));

// Convert camelCase to snake_case for Google SDK
const googleCreds = {
  access_token: creds.accessToken,
  refresh_token: creds.refreshToken,
  expiry_date: creds.expiryDate,
};

oauth2Client.setCredentials(googleCreds);

// Refresh access token if needed
if (oauth2Client.credentials.expiry_date && oauth2Client.credentials.expiry_date < Date.now()) {
  console.log('🔄 Refreshing access token...');
  const { credentials } = await oauth2Client.refreshAccessToken();
  oauth2Client.setCredentials(credentials);
  // Save updated credentials
  fs.writeFileSync(credsPath, JSON.stringify(credentials, null, 2));
  console.log('✅ Token refreshed\n');
}

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

console.log('🔍 Testing single thumbnail upload with raw API response...\n');

const videoId = 'sxTBOL8ByE8'; // Louis Pasteur
const thumbnailPath = '/home/aaronishere2025/data/thumbnails/sxTBOL8ByE8_1767224176817_thumbnail_compressed.jpg';

try {
  console.log(`📤 Uploading thumbnail for video ${videoId}...`);
  console.log(`   File: ${thumbnailPath}`);
  console.log(`   Size: ${(fs.statSync(thumbnailPath).size / 1024).toFixed(1)} KB\n`);

  const response = await youtube.thumbnails.set({
    videoId: videoId,
    media: {
      mimeType: 'image/jpeg',
      body: createReadStream(thumbnailPath),
    },
  });

  console.log('📦 FULL API RESPONSE:');
  console.log(JSON.stringify(response.data, null, 2));

  console.log(`\n✅ HTTP Status: ${response.status}`);
  console.log(`✅ Status Text: ${response.statusText}`);
} catch (error: any) {
  console.error('\n❌ ERROR:');
  console.error(`   Message: ${error.message}`);
  console.error(`   Code: ${error.code}`);
  if (error.response) {
    console.error(`   Status: ${error.response.status}`);
    console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
  }
}
