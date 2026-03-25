import 'dotenv/config';
import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));

  const videoIds = [
    { id: 'xXAGnAHNq54', channel: 'Trap Beats INC' },
    { id: 'kZzkGAfXrfI', channel: 'ChillBeats4Me' },
  ];

  for (const video of videoIds) {
    const ch = channels.find((c: any) => c.title === video.channel);
    if (!ch) {
      console.log(`Channel ${video.channel} not found`);
      continue;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI,
    );
    oauth2Client.setCredentials({
      access_token: ch.accessToken,
      refresh_token: ch.refreshToken,
      expiry_date: ch.expiryDate,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

    console.log(`Setting ${video.id} (${video.channel}) to public...`);
    await youtube.videos.update({
      part: ['status'],
      requestBody: {
        id: video.id,
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      },
    });
    console.log(`✅ ${video.channel} → public`);
  }

  process.exit(0);
}
main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
