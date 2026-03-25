#!/usr/bin/env tsx
/**
 * Get YouTube OAuth URLs for all channels
 * Run this to get the URLs needed to authenticate each channel
 */

async function getAuthUrls() {
  console.log('🔐 Fetching YouTube authentication URLs...\n');

  try {
    // Get all channels
    const response = await fetch('http://localhost:8080/api/youtube/channels');
    const result = await response.json();

    if (!result.success) {
      console.error('❌ Failed to fetch channels:', result.error);
      return;
    }

    const channels = result.data.channels;

    if (channels.length === 0) {
      console.log('⚠️  No channels found. Run setup-youtube-channels.ts first.');
      return;
    }

    console.log(`Found ${channels.length} channel(s):\n`);

    for (const channel of channels) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📺 ${channel.name}`);
      console.log(`   ID: ${channel.id}`);
      console.log(`   Content: ${channel.contentTypes.join(', ')}`);
      console.log(`   Status: ${channel.isAuthenticated ? '✅ Authenticated' : '⏳ Not authenticated'}`);

      if (channel.isAuthenticated) {
        console.log(`   YouTube Channel: ${channel.youtubeChannelTitle} (${channel.youtubeChannelId})`);
      } else {
        // Get auth URL
        try {
          const authResponse = await fetch(`http://localhost:8080/api/youtube/channels/${channel.id}/auth-url`);
          const authResult = await authResponse.json();

          if (authResult.success) {
            console.log(`\n   🔗 AUTH URL:`);
            console.log(`   ${authResult.data.authUrl}`);
            console.log(`\n   👉 Copy this URL and open in your browser to authenticate`);
          }
        } catch (error: any) {
          console.error(`   ❌ Failed to get auth URL: ${error.message}`);
        }
      }
      console.log('');
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log('📋 Instructions:');
    console.log('1. Copy the AUTH URL for each channel');
    console.log('2. Open the URL in your browser');
    console.log('3. Sign in with the YouTube account for that channel');
    console.log('4. Grant permissions');
    console.log('5. You will be redirected back and see success message');
    console.log('\n💡 Tip: You can authenticate from any device with internet access');
    console.log('');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  }
}

getAuthUrls().catch(console.error);
