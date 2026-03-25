import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { config } from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
import { createReadStream } from 'fs';

config();
await initializeSecretsFromGCP();

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'https://dontcomeherecrazydomain.com/api/youtube/callback',
);

const creds = JSON.parse(fs.readFileSync('/home/aaronishere2025/data/youtube_credentials.json', 'utf-8'));
oauth2Client.setCredentials({
  access_token: creds.accessToken,
  refresh_token: creds.refreshToken,
  expiry_date: creds.expiryDate,
});

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

console.log('\n🔄 Retrying Hannibal thumbnail upload...');

const fixedPath = '/home/aaronishere2025/data/thumbnails/MN993V_fixed.jpg';

try {
  const response = await youtube.thumbnails.set({
    videoId: 'MN993V',
    media: {
      mimeType: 'image/jpeg',
      body: createReadStream(fixedPath),
    },
  });

  console.log('✅ Upload response:', response.status);

  const verify = await youtube.videos.list({
    part: ['snippet'],
    id: ['MN993V'],
  });

  const thumbnail = verify.data.items?.[0]?.snippet?.thumbnails?.maxres?.url;
  console.log('📺 Thumbnail URL:', thumbnail || 'Not available yet');
  console.log('\n✅ Success!\n');
} catch (error: any) {
  console.error('❌ Error:', error.message);
}
