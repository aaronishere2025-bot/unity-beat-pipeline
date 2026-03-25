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

console.log('\n🔍 Checking YouTube channel features...\n');

try {
  const response = await youtube.channels.list({
    part: ['status', 'contentDetails', 'snippet'],
    mine: true,
  });

  const channel = response.data.items?.[0];

  if (channel) {
    console.log(`📺 Channel: ${channel.snippet?.title}`);
    console.log(`   ID: ${channel.id}`);
    console.log(`   Status: ${channel.status?.privacyStatus}`);
    console.log(`   Is Linked: ${channel.status?.isLinked}`);
    console.log(`   Long Uploads Enabled: ${channel.status?.longUploadsStatus}\n`);

    console.log('⚠️  IMPORTANT: Custom thumbnails require:');
    console.log('   1. Phone verification');
    console.log('   2. No Community Guidelines strikes');
    console.log('   3. Account age > 24 hours\n');

    console.log('🔗 Check your status here:');
    console.log('   https://www.youtube.com/verify\n');
  }
} catch (error: any) {
  console.error('❌ Error:', error.message);
}
