import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { config } from 'dotenv';
import { google } from 'googleapis';
import { createReadStream } from 'fs';
import fs from 'fs';

config();
await initializeSecretsFromGCP();

// Manually set up YouTube client
const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI,
);

// Load credentials and convert to snake_case
const credsPath = '/home/aaronishere2025/data/youtube_credentials.json';
const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));

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
  console.log('✅ Token refreshed\n');
}

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

const videos = [
  { id: 'sxTBOL8ByE8', title: 'Louis Pasteur' },
  { id: 'R0X6RUJro8U', title: 'Catherine the Great' },
  { id: 'cDJv0kbeyTU', title: 'George Washington' },
  { id: 'ehO0ke8zt24', title: 'Jack Johnson' },
  { id: 'nUU7Rh1rTxg', title: 'Theodore Roosevelt' },
  { id: 'MN993V_lkbU', title: 'Hannibal' },
];

console.log('🎨 Uploading all 6 custom thumbnails to YouTube...\n');

const thumbnailDir = '/home/aaronishere2025/data/thumbnails';
const files = fs.readdirSync(thumbnailDir);

for (const video of videos) {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📹 ${video.title}`);

  const thumbnailFile = files.find((f) => f.includes(video.id) && f.includes('compressed'));

  if (!thumbnailFile) {
    console.log(`   ❌ No thumbnail found\n`);
    continue;
  }

  const thumbnailPath = `${thumbnailDir}/${thumbnailFile}`;

  try {
    console.log(`   📤 Uploading...`);

    const response = await youtube.thumbnails.set({
      videoId: video.id,
      media: {
        mimeType: 'image/jpeg',
        body: createReadStream(thumbnailPath),
      },
    });

    if (response.status === 200) {
      console.log(`   ✅ SUCCESS! (HTTP ${response.status})`);
    } else {
      console.log(`   ⚠️ Unexpected status: ${response.status}`);
    }

    // Wait 2 seconds between uploads
    await new Promise((resolve) => setTimeout(resolve, 2000));
  } catch (error: any) {
    console.log(`   ❌ FAILED: ${error.message}`);
  }

  console.log('');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ All uploads complete!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('⏳ Note: YouTube may take 1-2 minutes to process thumbnails.');
console.log('   Refresh your YouTube Studio page to see them.');
