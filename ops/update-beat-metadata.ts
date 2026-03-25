import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

const updates = [
  {
    videoId: 'kVn7a9gUnLg',
    channel: 'ChillBeats4Me',
    title: '30 Minutes Chill Lofi Beats to Study/Relax 📚 Lofi Hip Hop Mix 2026',
    description: `30 minutes of chill lofi hip hop beats perfect for studying, working, or relaxing.

🎧 Continuous lofi mix with smooth rhodes piano, jazzy bass, and dusty drums
📚 Perfect background music for focus and concentration
☕ Late night study vibes

Perfect for:
✓ Studying
✓ Working from home
✓ Reading
✓ Relaxing
✓ Creative work
✓ Meditation

🎵 Music: AI Generated (Suno V5)
🎬 Visuals: Kling AI
🤖 100% AI Created

#lofi #lofihiphop #studymusic #chillbeats #lofibeats #studybeats #chillmusic #relaxingmusic #focusmusic #lofimusic #studywithme #ambientmusic #jazzhiphop #chillhop #lofi2026

---
Subscribe for daily lofi beats! 🔔
Like if this helps you focus! 👍`,
    tags: [
      'lofi',
      'lofi hip hop',
      'study music',
      'chill beats',
      'relaxing music',
      'focus music',
      'study beats',
      'lofi 2026',
      'chill music',
      'work music',
    ],
  },
  {
    videoId: 'rgicHbh3fdQ',
    channel: 'Trap Beats INC',
    title: '🔥 Lil Durk Type Beat - "Dreams" | Melodic Trap Instrumental 2026',
    description: `🔥 Lil Durk Type Beat - "Dreams"

138 BPM | Key: Unknown | Melodic Trap

A melodic trap instrumental with emotional piano melodies, smooth 808s, and atmospheric pads. Perfect for artists looking for that modern Lil Durk / Durk sound.

🎹 Emotional piano melodies
🔊 Smooth 808 bass
🎧 Atmospheric pads
✨ Dreamy vibes

💰 BUY THIS BEAT (Untagged):
[Your BeatStars/Airbit link]

📧 Contact: [Your email]

🎵 Music: AI Generated (Suno V5)
🎬 Video: Kling AI

#typebeat #lildurktypebeat #melodictrap #trapbeat #instrumental #beatsforsale #typebeat2026 #rapbeat #trapinstrumental #freebeat #protools #flstudio #lildurk #durk #chicago

---
Free for non-profit use with credit
Purchase for commercial use

© 2026 Trap Beats INC. All rights reserved.`,
    tags: [
      'type beat',
      'lil durk type beat',
      'melodic trap',
      'trap beat',
      'instrumental',
      'rap beat',
      'beats for sale',
      'free beat',
      'type beat 2026',
    ],
  },
  {
    videoId: 'HXLMgybL30Y',
    channel: 'Trap Beats INC',
    title: '🔥 Rod Wave Type Beat - "Soulful" | Emotional Trap Instrumental 2026',
    description: `🔥 Rod Wave Type Beat - "Soulful"

140 BPM | Key: Unknown | Trap Soul

A soulful trap beat with emotional chords, smooth 808s, and introspective vibes. Perfect for melodic rap and singing.

🎹 Soulful samples
🔊 Smooth 808s
💎 Emotional chords
🌊 Rod Wave vibes

💰 BUY THIS BEAT (Untagged):
[Your BeatStars/Airbit link]

📧 Contact: [Your email]

🎵 Music: AI Generated (Suno V5)
🎬 Video: Kling AI

#typebeat #rodwavetypebeat #trapsoul #emotionalbeat #trapbeat #melodicrap #instrumental #beatsforsale #typebeat2026 #rapbeat #rodwave #soulfulbeat #emorap

---
Free for non-profit use with credit
Purchase for commercial use

© 2026 Trap Beats INC. All rights reserved.`,
    tags: [
      'type beat',
      'rod wave type beat',
      'trap soul',
      'emotional beat',
      'trap beat',
      'melodic rap',
      'instrumental',
      'beats for sale',
      'type beat 2026',
    ],
  },
  {
    videoId: 'HgQwXgpRiVY',
    channel: 'Trap Beats INC',
    title: '🔥 Travis Scott Type Beat - "Astro" | Chill Trap Instrumental 2026',
    description: `🔥 Travis Scott Type Beat - "Astro"

145 BPM | Key: Unknown | Chill Trap

A chill atmospheric trap beat with spacey synths, smooth 808s, and crispy hi-hats. Perfect for that Travis Scott / La Flame vibe.

🌌 Atmospheric synths
🔊 Smooth 808s
🎧 Crispy hi-hats
✨ Dreamy pads
🚀 Travis Scott vibes

💰 BUY THIS BEAT (Untagged):
[Your BeatStars/Airbit link]

📧 Contact: [Your email]

🎵 Music: AI Generated (Suno V5)
🎬 Video: Kling AI

#typebeat #traviscotttypebeat #chilltrap #trapbeat #atmospheric #instrumental #beatsforsale #typebeat2026 #rapbeat #travisscott #laflame #cactusjack #astroworld

---
Free for non-profit use with credit
Purchase for commercial use

© 2026 Trap Beats INC. All rights reserved.`,
    tags: [
      'type beat',
      'travis scott type beat',
      'chill trap',
      'trap beat',
      'atmospheric beat',
      'instrumental',
      'beats for sale',
      'type beat 2026',
      'la flame',
    ],
  },
  {
    videoId: 'dpFMKIFZEKA',
    channel: 'Trap Beats INC',
    title: '🔥 Playboi Carti Type Beat - "Ethereal" | Ambient Trap Instrumental 2026',
    description: `🔥 Playboi Carti Type Beat - "Ethereal"

135 BPM | Key: Unknown | Ambient Trap

An ethereal ambient trap beat with spacey pads, deep 808s, and atmospheric vibes. Perfect for that Playboi Carti / rage sound.

🌌 Ethereal pads
🔊 Deep 808s
🎧 Spacey synths
✨ Reverb-heavy
🦋 Carti vibes

💰 BUY THIS BEAT (Untagged):
[Your BeatStars/Airbit link]

📧 Contact: [Your email]

🎵 Music: AI Generated (Suno V5)
🎬 Video: Kling AI

#typebeat #playboicartitypebeat #ambienttrap #trapbeat #ragebeat #instrumental #beatsforsale #typebeat2026 #rapbeat #playboycarti #carti #wlr #vamp #opium

---
Free for non-profit use with credit
Purchase for commercial use

© 2026 Trap Beats INC. All rights reserved.`,
    tags: [
      'type beat',
      'playboi carti type beat',
      'ambient trap',
      'rage beat',
      'trap beat',
      'instrumental',
      'beats for sale',
      'type beat 2026',
      'carti',
    ],
  },
  {
    videoId: '-RqDq8AA7Lg',
    channel: 'Trap Beats INC',
    title: '🔥 Future Type Beat - "Vibrant" | Bouncy Trap Instrumental 2026',
    description: `🔥 Future Type Beat - "Vibrant"

142 BPM | Key: Unknown | Vibrant Trap

A vibrant bouncy trap beat with colorful synths, energetic hi-hats, and party vibes. Perfect for that Future / Freebandz sound.

🎹 Colorful synths
🔊 Bouncy 808s
🎧 Energetic hi-hats
✨ Uplifting pads
🎉 Party vibes

💰 BUY THIS BEAT (Untagged):
[Your BeatStars/Airbit link]

📧 Contact: [Your email]

🎵 Music: AI Generated (Suno V5)
🎬 Video: Kling AI

#typebeat #futuretypebeat #vibranttrap #trapbeat #bouncybeat #instrumental #beatsforsale #typebeat2026 #rapbeat #future #freebandz #plutogang #hndrxx

---
Free for non-profit use with credit
Purchase for commercial use

© 2026 Trap Beats INC. All rights reserved.`,
    tags: [
      'type beat',
      'future type beat',
      'vibrant trap',
      'bouncy beat',
      'trap beat',
      'instrumental',
      'beats for sale',
      'type beat 2026',
      'future',
    ],
  },
];

async function updateMetadata() {
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
        part: ['snippet', 'status'],
        id: [update.videoId],
      });

      const video = getResponse.data.items?.[0];
      if (!video) {
        console.error(`Video ${update.videoId} not found`);
        continue;
      }

      // Update with new metadata
      await youtube.videos.update({
        part: ['snippet', 'status'],
        requestBody: {
          id: update.videoId,
          snippet: {
            title: update.title,
            description: update.description,
            tags: update.tags,
            categoryId: '10', // Music
            defaultLanguage: 'en',
            defaultAudioLanguage: 'en',
          },
          status: video.status, // Keep existing status (scheduled time, privacy)
        },
      });

      console.log(`✅ Updated: ${update.title.substring(0, 50)}...`);
    } catch (error: any) {
      console.error(`❌ Failed to update ${update.videoId}:`, error.message);
    }
  }

  console.log('\n🎉 All metadata updated!');
}

updateMetadata().catch(console.error);
