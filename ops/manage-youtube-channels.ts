#!/usr/bin/env tsx
/**
 * YouTube Channel Management CLI
 *
 * Quick tool to add/list/auth YouTube channels
 */

import { youtubeChannelManager } from './server/services/youtube-channel-manager';

const command = process.argv[2];

async function main() {
  if (!command) {
    console.log(`
📺 YouTube Channel Manager

Commands:
  list                           - List all channels
  add <name>                     - Add a new channel
  auth <channelId>              - Get OAuth URL
  delete <channelId>            - Delete channel

Examples:
  tsx manage-youtube-channels.ts add "ChillBeats4Me"
  tsx manage-youtube-channels.ts list
  tsx manage-youtube-channels.ts auth yt_123456789
`);
    return;
  }

  switch (command) {
    case 'list': {
      const channels = youtubeChannelManager.getAllChannels();

      if (channels.length === 0) {
        console.log('\n📋 No channels configured\n');
        return;
      }

      console.log(`\n📺 YouTube Channels (${channels.length}):\n`);

      for (const channel of channels) {
        const status = channel.isAuthenticated ? '✅ Connected' : '❌ Not Connected';
        console.log(`${status} ${channel.name}`);
        console.log(`   ID: ${channel.id}`);
        console.log(`   Description: ${channel.description}`);
        console.log(`   Content Types: ${channel.contentTypes.join(', ') || 'none'}`);
        console.log(`   Keywords: ${channel.keywords.join(', ') || 'none'}`);

        if (channel.youtubeChannelTitle) {
          console.log(`   YouTube: ${channel.youtubeChannelTitle}`);
        }

        console.log('');
      }
      break;
    }

    case 'add': {
      const name = process.argv[3];

      if (!name) {
        console.log('❌ Error: Channel name required');
        console.log('Usage: tsx manage-youtube-channels.ts add "ChillBeats4Me"');
        return;
      }

      // Prompt for details
      console.log(`\n➕ Adding channel: ${name}\n`);
      console.log('Enter description:');

      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('Description: ', (description: string) => {
        rl.question('Content types (comma separated, e.g., trap,drill,lofi): ', (typesStr: string) => {
          rl.question('Keywords (comma separated, e.g., beats,rap,instrumental): ', (keywordsStr: string) => {
            const contentTypes = typesStr
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const keywords = keywordsStr
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);

            const channel = youtubeChannelManager.addChannel({
              name,
              description,
              contentTypes,
              keywords,
            });

            console.log(`\n✅ Channel added: ${channel.name} (${channel.id})`);
            console.log(`\n🔗 To authenticate, run:`);
            console.log(`   tsx manage-youtube-channels.ts auth ${channel.id}\n`);

            rl.close();
          });
        });
      });
      break;
    }

    case 'auth': {
      const channelId = process.argv[3];

      if (!channelId) {
        console.log('❌ Error: Channel ID required');
        console.log('Usage: tsx manage-youtube-channels.ts auth yt_123456789');
        return;
      }

      const channel = youtubeChannelManager.getChannel(channelId);

      if (!channel) {
        console.log(`❌ Error: Channel ${channelId} not found`);
        return;
      }

      const authUrl = youtubeChannelManager.getAuthUrl(channelId);

      console.log(`\n🔗 Authentication URL for ${channel.name}:\n`);
      console.log(authUrl);
      console.log(`\n👉 Open this URL in your browser and sign in`);
      console.log(`   Select the correct YouTube channel when prompted\n`);
      break;
    }

    case 'delete': {
      const channelId = process.argv[3];

      if (!channelId) {
        console.log('❌ Error: Channel ID required');
        console.log('Usage: tsx manage-youtube-channels.ts delete yt_123456789');
        return;
      }

      const channel = youtubeChannelManager.getChannel(channelId);

      if (!channel) {
        console.log(`❌ Error: Channel ${channelId} not found`);
        return;
      }

      console.log(`\n⚠️  Delete channel: ${channel.name}?`);
      console.log('This will remove OAuth credentials and channel configuration.');

      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question('\nType "yes" to confirm: ', (answer: string) => {
        if (answer.toLowerCase() === 'yes') {
          youtubeChannelManager.deleteChannel(channelId);
          console.log(`\n✅ Channel deleted: ${channel.name}\n`);
        } else {
          console.log('\n❌ Cancelled\n');
        }
        rl.close();
      });
      break;
    }

    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Run without arguments to see available commands');
  }
}

main().catch(console.error);
