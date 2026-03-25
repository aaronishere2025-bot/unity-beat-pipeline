import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

console.log('🔄 Migrating YouTube channel authentication...\n');

// Read the connected channels (with OAuth tokens)
const connectedFile = 'data/youtube_connected_channels.json';
const connectedChannels = JSON.parse(readFileSync(connectedFile, 'utf-8'));

// Define content types for each channel
const channelConfig = {
  ChillBeats4Me: {
    description: 'Lofi beats for studying, relaxing, and chilling',
    contentTypes: ['lofi', 'chillhop', 'jazz hop', 'lo-fi', 'study beats'],
    keywords: ['lofi', 'chill', 'study', 'relax', 'beats', 'hip hop', 'chillhop', 'lo-fi'],
  },
  'Trap Beats INC': {
    description: 'Hard trap beats, type beats, and aggressive instrumentals',
    contentTypes: ['trap', 'hard trap', 'drill', 'type beat', 'hip hop'],
    keywords: ['trap', 'type beat', 'hard', '808', 'drill', 'beats', 'instrumental'],
  },
};

// Create credentials directory if needed
const credentialsDir = 'data/youtube_credentials';

// Migrate each channel
const migratedChannels = connectedChannels
  .map((channel: any) => {
    const config = channelConfig[channel.title as keyof typeof channelConfig];

    if (!config) {
      console.warn(`⚠️ No config found for channel: ${channel.title}`);
      return null;
    }

    // Create credentials file
    const credFile = join(credentialsDir, `${channel.id}.json`);
    const credentials = {
      accessToken: channel.accessToken,
      refreshToken: channel.refreshToken,
      expiryDate: channel.expiryDate,
      youtubeChannelId: channel.channelId,
      youtubeChannelTitle: channel.title,
    };

    writeFileSync(credFile, JSON.stringify(credentials, null, 2));
    console.log(`✅ Created credentials file: ${credFile}`);

    // Create channel entry with proper structure
    return {
      id: channel.id,
      name: channel.title,
      description: config.description,
      youtubeChannelId: channel.channelId,
      youtubeChannelTitle: channel.title,
      contentTypes: config.contentTypes,
      keywords: config.keywords,
      isAuthenticated: true,
      createdAt: channel.connectedAt || Date.now(),
      lastUsed: channel.lastUsed || Date.now(),
    };
  })
  .filter(Boolean);

// Write to youtube_channels.json (the file YouTubeChannelManager expects)
const channelsFile = 'data/youtube_channels.json';
writeFileSync(channelsFile, JSON.stringify(migratedChannels, null, 2));
console.log(`\n✅ Updated ${channelsFile} with ${migratedChannels.length} channels`);

console.log('\n🎉 Migration complete! YouTube channels are now properly configured.');
console.log('   Restart the server to pick up the changes.');
