import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { config } from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';

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

const videoId = 'sxTBOL8ByE8'; // Louis Pasteur

console.log('\n🔍 Checking detailed thumbnail info for one video...\n');

try {
  // Check video details including thumbnails
  const response = await youtube.videos.list({
    part: ['snippet', 'status'],
    id: [videoId],
  });

  const video = response.data.items?.[0];

  if (video) {
    console.log(`📹 Video: ${video.snippet?.title}`);
    console.log(`   Privacy: ${video.status?.privacyStatus}`);
    console.log(`   Upload Status: ${video.status?.uploadStatus}\n`);

    console.log('🖼️  Thumbnails available:');
    if (video.snippet?.thumbnails) {
      Object.entries(video.snippet.thumbnails).forEach(([key, thumb]: [string, any]) => {
        console.log(`   ${key}: ${thumb.url}`);
      });
    }

    console.log('\n📌 Check YouTube Studio manually:');
    console.log(`   https://studio.youtube.com/video/${videoId}/edit`);
    console.log('   Look at the thumbnail section - are there multiple options?');
  }
} catch (error: any) {
  console.error('❌ Error:', error.message);
}
