#!/usr/bin/env tsx
import { storage } from './server/storage';
import { google } from 'googleapis';
import { existsSync, createReadStream, readFileSync } from 'fs';
import { join } from 'path';

interface ConnectedChannel {
  id: string;
  channelId: string;
  title: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

async function main() {
  console.log('📅 Uploading beats with scheduled publishing...\n');

  const channelsPath = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channels: ConnectedChannel[] = JSON.parse(readFileSync(channelsPath, 'utf-8'));

  const lofiChannel = channels.find((ch) => /chill|lofi/i.test(ch.title));
  const trapChannel = channels.find((ch) => /trap/i.test(ch.title));

  const jobs = await storage.listJobs();
  const beats = jobs.filter((j) => j.status === 'completed' && j.mode === 'music' && !j.youtubeVideoId && j.videoUrl);

  console.log(`Found ${beats.length} beats to upload with scheduling\n`);

  // Calculate staggered upload times over 24 hours
  const now = new Date();
  const scheduleIntervalMinutes = Math.floor((24 * 60) / Math.min(beats.length, 20)); // Max 20 beats spread over 24h

  let uploadCount = 0;

  for (let i = 0; i < Math.min(beats.length, 10); i++) {
    const job = beats[i];

    try {
      console.log(`📺 ${job.scriptName}`);

      const videoPath = join(process.cwd(), 'data', 'videos', 'renders', job.videoUrl!.replace('/api/videos/', ''));
      const thumbnailPath = job.thumbnailUrl
        ? join(process.cwd(), 'data', 'thumbnails', job.thumbnailUrl.replace('/api/thumbnails/', ''))
        : null;

      if (!existsSync(videoPath)) {
        console.log('  ❌ Video not found\n');
        continue;
      }

      const isLofi = /lofi|chillhop/i.test(job.scriptContent || '');
      const channel = isLofi ? lofiChannel : trapChannel;

      // Calculate scheduled time (spread over 24 hours)
      const scheduledTime = new Date(now.getTime() + i * scheduleIntervalMinutes * 60 * 1000);
      const isScheduled = scheduledTime > new Date(now.getTime() + 2 * 60 * 1000); // Schedule if > 2 min from now

      console.log(`  🎯 ${channel?.title} (${isLofi ? 'lofi' : 'trap'})`);
      console.log(isScheduled ? `  📅 Scheduled: ${scheduledTime.toLocaleString()}` : `  📤 Publishing now`);

      const oauth = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI,
      );

      oauth.setCredentials({
        access_token: channel!.accessToken,
        refresh_token: channel!.refreshToken,
        expiry_date: channel!.expiryDate,
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth });

      const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: job.scriptName || 'Beat',
            description: `${job.scriptName}

${job.scriptContent}

🎵 Free to use with credit
💰 Purchase license: [Your BeatStars link]

#Shorts #beats #instrumental ${isLofi ? '#lofi #chillhop #studymusic' : '#trap #typebeat #hiphop'}

⚠️ This beat was generated using AI technology.`,
            tags: (job.scriptContent || '')
              .split(/[,\s]+/)
              .filter((t) => t.length > 2)
              .slice(0, 10),
            categoryId: '10',
          },
          status: {
            privacyStatus: isScheduled ? 'private' : 'public',
            selfDeclaredMadeForKids: false,
            publishAt: isScheduled ? scheduledTime.toISOString() : undefined,
          },
        },
        media: { body: createReadStream(videoPath) },
      });

      if (thumbnailPath && existsSync(thumbnailPath)) {
        await youtube.thumbnails.set({
          videoId: res.data.id!,
          media: { body: createReadStream(thumbnailPath) },
        });
      }

      const videoUrl = `https://www.youtube.com/watch?v=${res.data.id}`;
      console.log(`  ✅ ${videoUrl}`);
      console.log(`  ${isScheduled ? '🕐 Will publish: ' + scheduledTime.toLocaleTimeString() : '✅ Published'}\n`);

      await storage.updateJob(job.id, {
        youtubeVideoId: res.data.id,
        youtubeUrl: videoUrl,
        uploadedAt: new Date(),
        unityMetadata: {
          ...job.unityMetadata,
          youtubeChannel: channel!.title,
          scheduledPublishTime: isScheduled ? scheduledTime.toISOString() : null,
        } as any,
      });

      uploadCount++;
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err: any) {
      console.error(`  ❌ ${err.message}\n`);
    }
  }

  console.log(`✅ Uploaded ${uploadCount} beats with staggered scheduling!`);
  console.log(`📅 Videos will publish over the next ${Math.ceil((uploadCount * scheduleIntervalMinutes) / 60)} hours`);
}

main().catch(console.error);
