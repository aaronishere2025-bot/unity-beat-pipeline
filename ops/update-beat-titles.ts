import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

const updates = [
  {
    videoId: 'kVn7a9gUnLg',
    title: '30 Minutes Chill Lofi Beats to Study/Relax 📚 Lofi Hip Hop Mix 2026',
    channel: 'ChillBeats4Me',
  },
  {
    videoId: 'rgicHbh3fdQ',
    title: '🔥 Lil Durk Type Beat - "Dreams" | Melodic Trap Instrumental 2026',
    channel: 'Trap Beats INC',
  },
  {
    videoId: 'HXLMgybL30Y',
    title: '🔥 Rod Wave Type Beat - "Soulful" | Emotional Trap Instrumental 2026',
    channel: 'Trap Beats INC',
  },
  {
    videoId: 'HgQwXgpRiVY',
    title: '🔥 Travis Scott Type Beat - "Astro" | Chill Trap Instrumental 2026',
    channel: 'Trap Beats INC',
  },
  {
    videoId: 'dpFMKIFZEKA',
    title: '🔥 Playboi Carti Type Beat - "Ethereal" | Ambient Trap Instrumental 2026',
    channel: 'Trap Beats INC',
  },
  {
    videoId: '-RqDq8AA7Lg',
    title: '🔥 Future Type Beat - "Vibrant" | Bouncy Trap Instrumental 2026',
    channel: 'Trap Beats INC',
  },
];

async function updateTitles() {
  // Load channel credentials
  const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));

  for (const update of updates) {
    const channel = channels.find((c: any) => c.title === update.channel);

    if (!channel) {
      console.error(`Channel ${update.channel} not found`);
      continue;
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      access_token: channel.accessToken,
      refresh_token: channel.refreshToken,
      expiry_date: channel.expiryDate,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
    try {
      // Get current video details
      const getResponse = await youtube.videos.list({
        part: ['snippet'],
        id: [update.videoId],
      });

      const video = getResponse.data.items?.[0];
      if (!video) {
        console.error(`Video ${update.videoId} not found`);
        continue;
      }

      // Update title, keep description
      await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: update.videoId,
          snippet: {
            ...video.snippet,
            title: update.title,
            categoryId: '10', // Music
          },
        },
      });

      console.log(`✅ Updated: ${update.title}`);
    } catch (error: any) {
      console.error(`❌ Failed to update ${update.videoId}:`, error.message);
    }
  }

  console.log('\n✅ All titles updated!');
}

updateTitles().catch(console.error);
