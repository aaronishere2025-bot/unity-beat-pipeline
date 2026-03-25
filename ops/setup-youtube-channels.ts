#!/usr/bin/env tsx
/**
 * Setup YouTube Channels
 * Creates ChillBeats4Me (lofi) and Trap Beats INC (trap) channels
 */

async function setupChannels() {
  console.log('🎵 Setting up YouTube channels for beat business...\n');

  const channels = [
    {
      name: 'ChillBeats4Me',
      description: 'Lofi beats for studying, relaxing, and chilling',
      contentTypes: ['lofi', 'chillhop', 'jazz hop', 'lo-fi', 'study beats'],
      keywords: ['lofi', 'chill', 'study', 'relax', 'beats', 'hip hop', 'chillhop', 'lo-fi'],
    },
    {
      name: 'Trap Beats INC',
      description: 'Hard trap beats, type beats, and aggressive instrumentals',
      contentTypes: ['trap', 'hard trap', 'drill', 'type beat', 'hip hop'],
      keywords: ['trap', 'type beat', 'hard', '808', 'drill', 'beats', 'instrumental'],
    },
  ];

  for (const channel of channels) {
    try {
      const response = await fetch('http://localhost:8080/api/youtube/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(channel),
      });

      const result = await response.json();

      if (result.success) {
        const createdChannel = result.data.channel;
        console.log(`✅ Created: ${createdChannel.name}`);
        console.log(`   ID: ${createdChannel.id}`);
        console.log(`   Content Types: ${createdChannel.contentTypes.join(', ')}`);
        console.log(`   Auth URL: http://localhost:8080/api/youtube/channels/${createdChannel.id}/auth-url\n`);
      } else {
        console.error(`❌ Failed to create ${channel.name}:`, result.error);
      }
    } catch (error: any) {
      console.error(`❌ Error creating ${channel.name}:`, error.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('✅ CHANNELS CREATED!');
  console.log('═══════════════════════════════════════════════════════');
  console.log('\n📋 Next Steps:');
  console.log('1. Get list of channels: curl http://localhost:8080/api/youtube/channels');
  console.log('2. Get auth URL for each channel');
  console.log('3. Visit auth URL in browser to connect YouTube account');
  console.log('4. Complete OAuth flow to authenticate each channel');
  console.log('\n🔗 Quick Auth Links:');
  console.log('   Visit the dashboard to see auth URLs for each channel');
  console.log('   Or use: GET /api/youtube/channels/:channelId/auth-url\n');
}

setupChannels().catch(console.error);
