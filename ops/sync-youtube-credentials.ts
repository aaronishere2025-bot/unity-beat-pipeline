#!/usr/bin/env tsx
/**
 * Sync credentials from youtube_connected_channels.json to youtube_credentials/ directory
 * This bridges the gap between the two YouTube auth systems
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

function syncCredentials() {
  const connectedChannelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channelsFile = join(process.cwd(), 'data', 'youtube_channels.json');
  const credentialsDir = join(process.cwd(), 'data', 'youtube_credentials');

  // Ensure directories exist
  if (!existsSync(credentialsDir)) {
    mkdirSync(credentialsDir, { recursive: true });
  }

  // Load connected channels (has embedded credentials)
  if (!existsSync(connectedChannelsFile)) {
    console.error('❌ youtube_connected_channels.json not found');
    return;
  }

  const connectedChannels = JSON.parse(readFileSync(connectedChannelsFile, 'utf-8'));

  // Load or create channels config
  let channels: any[] = [];
  if (existsSync(channelsFile)) {
    channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
  }

  console.log('🔄 Syncing YouTube credentials...\n');

  for (const connected of connectedChannels) {
    console.log(`   📺 ${connected.title}`);
    console.log(`      ID: ${connected.id}`);
    console.log(`      Channel ID: ${connected.channelId}`);

    // Find or create channel config
    let channel = channels.find((c: any) => c.id === connected.id);
    if (!channel) {
      channel = {
        id: connected.id,
        name: connected.title,
        description: connected.description || `Auto-synced ${connected.title}`,
        youtubeChannelId: connected.channelId,
        youtubeChannelTitle: connected.title,
        contentTypes: connected.title.includes('Trap') ? ['trap', 'beats'] : ['lofi', 'chill'],
        keywords: connected.title.includes('Trap') ? ['trap', 'beat', 'type beat'] : ['lofi', 'study', 'chill'],
        isAuthenticated: true,
        createdAt: connected.connectedAt || Date.now(),
      };
      channels.push(channel);
      console.log(`      ✨ Created new channel config`);
    } else {
      channel.isAuthenticated = true;
      channel.youtubeChannelId = connected.channelId;
      channel.youtubeChannelTitle = connected.title;
      console.log(`      ✅ Updated existing channel config`);
    }

    // Write credentials file
    const credFile = join(credentialsDir, `${connected.id}.json`);
    const credentials = {
      accessToken: connected.accessToken,
      refreshToken: connected.refreshToken,
      expiryDate: connected.expiryDate,
      youtubeChannelId: connected.channelId,
      youtubeChannelTitle: connected.title,
    };

    writeFileSync(credFile, JSON.stringify(credentials, null, 2));
    console.log(`      💾 Saved credentials to ${connected.id}.json`);
    console.log();
  }

  // Save updated channels config
  writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
  console.log(`✅ Synced ${connectedChannels.length} channels`);
  console.log(`   Credentials: data/youtube_credentials/`);
  console.log(`   Config: data/youtube_channels.json`);
}

syncCredentials();
