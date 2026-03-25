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

const videos = [
  { id: 'sxTBOL8ByE8', title: 'Louis Pasteur' },
  { id: 'nUU7Rh1rTxg', title: 'Catherine the Great' },
  { id: 'cDJv0kbeyTU', title: 'George Washington' },
  { id: 'ehO0ke8zt24', title: 'Jack Johnson' },
  { id: 'R0X6RUJro8U', title: 'Theodore Roosevelt' },
  { id: 'MN993V', title: 'Hannibal' },
];

console.log('\n🔍 Checking current thumbnail status on YouTube...\n');

for (const video of videos) {
  try {
    const response = await youtube.videos.list({
      part: ['snippet'],
      id: [video.id],
    });

    const item = response.data.items?.[0];
    const thumbnails = item?.snippet?.thumbnails;

    console.log(`📹 ${video.title} (${video.id})`);

    if (thumbnails) {
      if (thumbnails.maxres) {
        console.log(`   ✅ Maxres: ${thumbnails.maxres.url}`);
      }
      if (thumbnails.standard) {
        console.log(`   📺 Standard: ${thumbnails.standard.url}`);
      }
      if (thumbnails.high) {
        console.log(`   📺 High: ${thumbnails.high.url}`);
      }
      if (thumbnails.medium) {
        console.log(`   📺 Medium: ${thumbnails.medium.url}`);
      }
    } else {
      console.log('   ⚠️  No thumbnails found');
    }

    console.log('');
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }
}

console.log('💡 YouTube Studio thumbnails may take 1-2 minutes to update after upload.');
console.log('   Try refreshing the page or clearing your browser cache.\n');
