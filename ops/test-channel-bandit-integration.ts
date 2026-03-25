/**
 * Test YouTube Channel Bandit Integration
 */

import { youtubeOAuthSimple } from './server/services/youtube-oauth-simple';
import { youtubeChannelBandit } from './server/services/youtube-channel-bandit';

async function main() {
  console.log('\n🎰 Testing YouTube Channel Bandit Integration\n');

  // Get all connected channels
  const channels = youtubeOAuthSimple.getAllChannels();
  console.log(`📺 Connected channels: ${channels.length}\n`);

  // Register each channel with bandit
  for (const channel of channels) {
    await youtubeChannelBandit.registerChannel(channel.id, channel.title, channel.channelId);
  }

  console.log('\n✅ All channels registered with bandit\n');

  // Get bandit stats
  const banditChannels = await youtubeChannelBandit.getAllChannels();
  console.log('📊 Bandit Stats:\n');
  for (const arm of banditChannels) {
    console.log(`  ${arm.channelName}:`);
    console.log(`    - Alpha: ${arm.alpha}, Beta: ${arm.beta}`);
    console.log(`    - Trials: ${arm.trials}, Successes: ${arm.successes}`);
    console.log(`    - Total uploads: ${arm.totalUploads}`);
    console.log(`    - Consecutive uses: ${arm.consecutiveUses}`);
    console.log(``);
  }

  // Test selection for different content types
  console.log('🎯 Testing channel selection:\n');

  const testCases = [
    {
      title: 'Lofi Hip Hop Beats to Study To',
      description: 'Chill lofi beats for studying',
      tags: ['lofi', 'chill', 'study'],
    },
    {
      title: 'Hard Trap Beat 2025',
      description: 'Dark trap instrumental with heavy 808s',
      tags: ['trap', 'beats', 'hard'],
    },
    {
      title: 'Julius Caesar Crossing the Rubicon',
      description: 'Historical documentary about ancient Rome',
      tags: ['history', 'documentary', 'ancient'],
    },
  ];

  for (const testCase of testCases) {
    console.log(`\n📝 Test: "${testCase.title}"`);

    // Test keyword-based selection
    const keywordChannel = youtubeOAuthSimple.selectChannelForContent(testCase);
    console.log(`  Keyword-based: ${keywordChannel?.title || 'none'}`);

    // Test bandit-based selection
    const banditChannel = await youtubeOAuthSimple.selectChannelWithBandit(testCase);
    console.log(`  Bandit-based: ${banditChannel?.title || 'none'}`);
  }

  console.log('\n✅ Integration test complete!\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});
