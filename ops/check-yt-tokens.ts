import 'dotenv/config';
import { db } from './server/db';
import { youtubeChannels } from './shared/schema';

async function main() {
  const channels = await db
    .select({
      id: youtubeChannels.id,
      channelName: youtubeChannels.channelName,
      channelId: youtubeChannels.channelId,
      hasRefreshToken: youtubeChannels.refreshToken,
      isActive: youtubeChannels.isActive,
      lastUploadAt: youtubeChannels.lastUploadAt,
    })
    .from(youtubeChannels);

  for (const ch of channels) {
    console.log(`\n📺 ${ch.channelName} (${ch.channelId})`);
    console.log(`   ID: ${ch.id}`);
    console.log(`   Active: ${ch.isActive}`);
    console.log(
      `   Has refresh token: ${ch.hasRefreshToken ? 'YES (' + (ch.hasRefreshToken as string).slice(0, 15) + '...)' : 'NO'}`,
    );
    console.log(`   Last upload: ${ch.lastUploadAt || 'never'}`);
  }
  process.exit(0);
}
main();
