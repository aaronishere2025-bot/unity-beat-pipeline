import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { config } from 'dotenv';
import { google } from 'googleapis';

config();
await initializeSecretsFromGCP();

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
];

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  'https://dontcomeherecrazydomain.com/api/youtube/callback', // Use registered redirect
);

console.log('\n🔐 YOUTUBE RE-AUTHENTICATION\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('📋 STEP 1: Click this URL:\n');
console.log(authUrl);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log("📋 STEP 2: After authorizing, you'll be redirected to:");
console.log('   https://dontcomeherecrazydomain.com/api/youtube/callback?code=XXXXX');
console.log('\n📋 STEP 3: Even if the page shows an error, COPY the full URL from your browser');
console.log('   Or just copy the "code=" part after "?code="');
console.log("\n📋 STEP 4: Paste that code here and I'll complete the authentication!");
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
