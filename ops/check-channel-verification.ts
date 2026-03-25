#!/usr/bin/env tsx
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

async function checkVerification() {
  const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));

  // Check both channels
  for (const channel of channels) {
    if (channel.status !== 'active') continue;

    console.log(`\n🔍 Checking: ${channel.title}`);
    console.log(`   Channel ID: ${channel.channelId}`);

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: channel.accessToken,
      refresh_token: channel.refreshToken,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    try {
      const response = await youtube.channels.list({
        part: ['status'],
        mine: true,
      });

      const channelData = response.data.items?.[0];
      if (channelData) {
        console.log(`   ✅ Verified/Linked: ${channelData.status?.isLinked}`);
        console.log(`   📹 Long uploads: ${channelData.status?.longUploadsStatus}`);
        console.log(`   👶 Made for kids: ${channelData.status?.madeForKids}`);
        console.log(`   🔒 Privacy status: ${channelData.status?.privacyStatus}`);

        if (channelData.status?.longUploadsStatus !== 'allowed') {
          console.log(`   ⚠️ PROBLEM: Long uploads are NOT enabled!`);
          console.log(`   📝 To enable: Go to https://www.youtube.com/verify`);
        }
      }
    } catch (error: any) {
      console.log(`   ❌ Error: ${error.message}`);
      if (error.errors) {
        console.log(`   Details:`, JSON.stringify(error.errors, null, 2));
      }
    }
  }
}

checkVerification().catch(console.error);
