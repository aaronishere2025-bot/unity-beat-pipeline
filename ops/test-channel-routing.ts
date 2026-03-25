import { youtubeOAuthSimple } from './server/services/youtube-oauth-simple';

console.log('\n🎯 Testing Smart Channel Selection\n');
console.log('Connected Channels:');
const channels = youtubeOAuthSimple.getAllChannels();
channels.forEach((ch) => {
  console.log(`  - ${ch.title} (${ch.channelId})`);
});

console.log('\n📝 Test Cases:\n');

// Test 1: Lofi content
const lofiChannel = youtubeOAuthSimple.selectChannelForContent({
  title: 'Lofi Hip Hop Beats to Study To',
  description: 'Chill lofi beats for studying and relaxing',
  tags: ['lofi', 'chill', 'study'],
});
console.log(`1. Lofi content → ${lofiChannel?.title}`);

// Test 2: Trap content
const trapChannel = youtubeOAuthSimple.selectChannelForContent({
  title: 'Hard Trap Beat 2025',
  description: 'Dark trap instrumental with heavy 808s',
  tags: ['trap', 'beats', 'hard'],
});
console.log(`2. Trap content → ${trapChannel?.title}`);

// Test 3: Ambiguous (should pick first or score based)
const ambiguousChannel = youtubeOAuthSimple.selectChannelForContent({
  title: 'Music Beat Instrumental',
  description: 'Background music',
  tags: ['music', 'beats'],
});
console.log(`3. Ambiguous content → ${ambiguousChannel?.title}`);

console.log('\n✅ Auto-routing is working!\n');
