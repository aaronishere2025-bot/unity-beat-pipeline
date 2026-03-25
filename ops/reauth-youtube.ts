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
  process.env.YOUTUBE_REDIRECT_URI,
);

console.log('\n🔐 YOUTUBE RE-AUTHENTICATION\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Force re-consent to get fresh tokens
});

console.log('✅ Authorization URL generated!\n');
console.log('📋 CLICK THIS URL TO RE-AUTHORIZE:\n');
console.log(authUrl);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('📝 INSTRUCTIONS:');
console.log('1. Click the URL above');
console.log('2. Sign in with your YouTube account');
console.log('3. Grant all permissions');
console.log('4. Copy the authorization code from the redirect URL');
console.log('5. Paste it when prompted\n');
