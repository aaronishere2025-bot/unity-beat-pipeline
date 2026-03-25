#!/usr/bin/env tsx
/**
 * Test the smart scheduling system - shows how it finds next available slots
 */

import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join } from 'path';

async function getScheduledVideos(): Promise<Map<string, any>> {
  const scheduledVideos = new Map<string, any>();

  try {
    const channelIds = [
      { id: 'yt_1768620532767_kv4drxdea', name: 'ChillBeats4Me' },
      { id: 'yt_1768620554675_usovd1wx3', name: 'Trap Beats INC' },
    ];

    for (const channel of channelIds) {
      try {
        const credFile = join(process.cwd(), 'data', 'youtube_credentials', `${channel.id}.json`);
        const credentials = JSON.parse(readFileSync(credFile, 'utf-8'));

        const oauth2Client = new google.auth.OAuth2(
          process.env.YOUTUBE_CLIENT_ID,
          process.env.YOUTUBE_CLIENT_SECRET,
          process.env.YOUTUBE_REDIRECT_URI,
        );

        oauth2Client.setCredentials({
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          expiry_date: credentials.expiryDate,
        });

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        // Get recent videos
        const response = await youtube.search.list({
          part: ['id'],
          forMine: true,
          type: ['video'],
          maxResults: 50,
          order: 'date',
        });

        const videoIds = response.data.items?.map((item: any) => item.id.videoId).filter(Boolean) || [];

        if (videoIds.length > 0) {
          const detailsResponse = await youtube.videos.list({
            part: ['snippet', 'status'],
            id: videoIds,
          });

          for (const video of detailsResponse.data.items || []) {
            if (video.status?.publishAt && video.status.privacyStatus === 'private') {
              const publishDate = new Date(video.status.publishAt);
              const slotKey = `${publishDate.toISOString().split('T')[0]} ${publishDate.getHours()}:00`;

              scheduledVideos.set(slotKey, {
                title: video.snippet?.title,
                channel: channel.name,
                publishAt: publishDate,
              });
            }
          }
        }
      } catch (err: any) {
        console.warn(`⚠️ Could not check ${channel.name}: ${err.message}`);
      }
    }

    return scheduledVideos;
  } catch (error) {
    console.error('Error checking scheduled videos:', error);
    return scheduledVideos;
  }
}

async function findNextAvailableSlots(count: number = 6): Promise<Date[]> {
  const scheduledVideos = await getScheduledVideos();
  const uploadHours = [4, 7, 10, 13, 16, 19, 22]; // 4am, 7am, 10am, 1pm, 4pm, 7pm, 10pm

  const availableSlots: Date[] = [];
  const currentDate = new Date();
  currentDate.setMinutes(0, 0, 0);

  // Start from next available hour
  if (currentDate.getHours() >= 22) {
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(4, 0, 0, 0);
  }

  let daysChecked = 0;

  while (availableSlots.length < count && daysChecked < 14) {
    for (const hour of uploadHours) {
      const slot = new Date(currentDate);
      slot.setHours(hour, 0, 0, 0);

      // Skip if in the past
      if (slot <= new Date()) {
        continue;
      }

      // Check if slot is taken
      const slotKey = `${slot.toISOString().split('T')[0]} ${hour}:00`;
      if (!scheduledVideos.has(slotKey)) {
        availableSlots.push(slot);

        if (availableSlots.length >= count) break;
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(4, 0, 0, 0);
    daysChecked++;
  }

  return availableSlots;
}

async function showSchedule() {
  console.log('📅 SMART SCHEDULING SYSTEM TEST\n');
  console.log('Current time:', new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }), 'EST\n');

  console.log('🔍 Checking existing scheduled videos...\n');
  const scheduled = await getScheduledVideos();

  if (scheduled.size > 0) {
    console.log(`✅ Found ${scheduled.size} already scheduled videos:\n`);

    const sortedScheduled = Array.from(scheduled.entries()).sort(
      (a, b) => new Date(a[1].publishAt).getTime() - new Date(b[1].publishAt).getTime(),
    );

    for (const [slot, video] of sortedScheduled) {
      const date = new Date(video.publishAt);
      console.log(
        `   ⏰ ${date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: 'America/New_York',
        })} - ${video.title.substring(0, 50)}... (${video.channel})`,
      );
    }
    console.log();
  } else {
    console.log('✅ No scheduled videos found\n');
  }

  console.log('🎯 Finding next 6 available time slots...\n');
  const availableSlots = await findNextAvailableSlots(6);

  console.log('📋 NEXT AVAILABLE UPLOAD SCHEDULE:\n');
  const pattern = ['Lofi 30min', 'Trap Beat', 'Trap Beat', 'Trap Beat', 'Trap Beat', 'Trap Beat'];

  for (let i = 0; i < availableSlots.length; i++) {
    const slot = availableSlots[i];
    const channel = pattern[i].includes('Lofi') ? 'ChillBeats4Me' : 'Trap Beats INC';

    console.log(
      `   ${i + 1}. ${slot.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      })} EST - ${pattern[i]} → ${channel}`,
    );
  }

  console.log('\n✨ System will automatically schedule new videos in these open slots!');
}

showSchedule().catch(console.error);
