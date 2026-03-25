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

const videos = [
  { id: 'sxTBOL8ByE8', title: 'Louis Pasteur' },
  { id: 'nUU7Rh1rTxg', title: 'Catherine the Great' },
  { id: 'cDJv0kbeyTU', title: 'George Washington' },
  { id: 'ehO0ke8zt24', title: 'Jack Johnson' },
  { id: 'R0X6RUJro8U', title: 'Theodore Roosevelt' },
  { id: 'MN993V', title: 'Hannibal' },
];

const thumbnailDir = '/home/aaronishere2025/data/thumbnails';

console.log('\n🔄 Uploading fixed thumbnails to YouTube...\n');

for (const video of videos) {
  const fixedPath = `${thumbnailDir}/${video.id}_fixed.jpg`;

  if (!fs.existsSync(fixedPath)) {
    console.log(`⚠️  ${video.title}: Fixed thumbnail not found at ${fixedPath}`);
    continue;
  }

  console.log(`📤 Uploading ${video.title} (${video.id})...`);

  try {
    const response = await youtube.thumbnails.set({
      videoId: video.id,
      media: {
        mimeType: 'image/jpeg',
        body: createReadStream(fixedPath),
      },
    });

    // Verify the upload
    const verify = await youtube.videos.list({
      part: ['snippet'],
      id: [video.id],
    });

    const uploadedThumbnail = verify.data.items?.[0]?.snippet?.thumbnails?.maxres?.url;

    if (uploadedThumbnail) {
      console.log(`   ✅ Success! Thumbnail URL: ${uploadedThumbnail}\n`);
    } else {
      console.log(`   ⚠️  Upload returned ${response.status} but verification failed\n`);
    }
  } catch (error: any) {
    console.error(`   ❌ Error: ${error.message}\n`);
  }
}

console.log('✅ All fixed thumbnails uploaded!');
console.log('\n📺 Check your videos in YouTube Studio:');
console.log('   https://studio.youtube.com/channel/UC/videos\n');
