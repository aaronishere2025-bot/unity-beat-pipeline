import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { config } from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';
import readline from 'readline';

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
  'urn:ietf:wg:oauth:2.0:oob', // Use OOB (out-of-band) flow for manual code entry
);

console.log('\n🔐 MANUAL YOUTUBE AUTHENTICATION\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',
});

console.log('STEP 1: Click this URL to authorize:\n');
console.log(authUrl);
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log('STEP 2: After authorizing, Google will show you a CODE');
console.log('STEP 3: Paste that code below:\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter authorization code: ', async (code) => {
  rl.close();

  try {
    console.log('\n🔄 Exchanging code for tokens...');

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log('✅ Tokens received!\n');

    // Save tokens in the format the app expects (camelCase)
    const credsToSave = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    };

    const credsPath = '/home/aaronishere2025/data/youtube_credentials.json';
    fs.writeFileSync(credsPath, JSON.stringify(credsToSave, null, 2));

    console.log('✅ Credentials saved to:', credsPath);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ AUTHENTICATION COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('You can now upload thumbnails!');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
  }
});
