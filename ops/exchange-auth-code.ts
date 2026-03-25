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

// The authorization code from the user
const authCode = process.argv[2];

if (!authCode) {
  console.error('❌ Please provide the authorization code as an argument');
  process.exit(1);
}

console.log('\n🔄 Exchanging authorization code for tokens...\n');
console.log(`Code: ${authCode.substring(0, 20)}...`);

try {
  const { tokens } = await oauth2Client.getToken(authCode);

  console.log('\n✅ SUCCESS! Tokens received:\n');
  console.log(`   Access Token: ${tokens.access_token?.substring(0, 20)}...`);
  console.log(`   Refresh Token: ${tokens.refresh_token?.substring(0, 20)}...`);
  console.log(`   Expiry: ${new Date(tokens.expiry_date || 0).toLocaleString()}\n`);

  // Save in camelCase format
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
} catch (error: any) {
  console.error('\n❌ ERROR:', error.message);

  if (error.message.includes('invalid_grant') || error.message.includes('Code was already redeemed')) {
    console.error('\n⚠️  The code was already used or is invalid.');
    console.error('   Please go back and get a fresh authorization code.');
  } else if (error.message.includes('invalid_code')) {
    console.error('\n⚠️  The code appears to be incomplete or invalid.');
    console.error('   Please copy the COMPLETE code from the URL.');
  }

  process.exit(1);
}
