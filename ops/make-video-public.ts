#!/usr/bin/env tsx
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

async function makePublic() {
  const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
  const chillbeats = channels.find((c: any) => c.title === 'ChillBeats4Me');

  console.log('🔑 Using ChillBeats4Me credentials...');
  console.log('   Access token:', chillbeats.accessToken.substring(0, 20) + '...');

  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    process.env.YOUTUBE_REDIRECT_URI,
  );

  oauth2Client.setCredentials({
    access_token: chillbeats.accessToken,
    refresh_token: chillbeats.refreshToken,
    expiry_date: chillbeats.expiryDate,
  });

  // Check if token is expired
  const now = Date.now();
  if (chillbeats.expiryDate && now > chillbeats.expiryDate) {
    console.log('⏰ Access token expired, refreshing...');
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    console.log('✅ Token refreshed!');

    // Update the file with new token
    const updatedChannels = channels.map((c: any) =>
      c.id === chillbeats.id ? { ...c, accessToken: credentials.access_token, expiryDate: credentials.expiry_date } : c,
    );
    const fs = await import('fs');
    fs.writeFileSync(channelsFile, JSON.stringify(updatedChannels, null, 2));
    console.log('💾 Saved new access token');
  }

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  try {
    console.log('📺 Updating video h_-tZammTHM to public...');

    const response = await youtube.videos.update({
      part: ['status'],
      requestBody: {
        id: 'h_-tZammTHM',
        status: {
          privacyStatus: 'public',
        },
      },
    });

    console.log('✅ Video is now PUBLIC!');
    console.log('🔗 https://www.youtube.com/watch?v=h_-tZammTHM');
    console.log('Response:', response.data.status);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.errors) {
      console.error('Details:', JSON.stringify(error.errors, null, 2));
    }
    if (error.code) {
      console.error('Code:', error.code);
    }
  }
}

makePublic().catch(console.error);
