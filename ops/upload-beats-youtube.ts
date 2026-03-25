#!/usr/bin/env tsx
import { storage } from './server/storage';
import { google } from 'googleapis';
import { existsSync, createReadStream, statSync, readFileSync } from 'fs';
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
  console.log('📤 Uploading beats to YouTube...\n');

  const channelsPath = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channels: ConnectedChannel[] = JSON.parse(readFileSync(channelsPath, 'utf-8'));

  const lofiChannel = channels.find((ch) => /chill|lofi/i.test(ch.title));
  const trapChannel = channels.find((ch) => /trap/i.test(ch.title));

  console.log('Connected channels:');
  console.log(`  Lofi: ${lofiChannel?.title}`);
  console.log(`  Trap: ${trapChannel?.title}\n`);

  const jobs = await storage.listJobs();
  const beats = jobs.filter((j) => j.status === 'completed' && j.mode === 'music' && !j.youtubeVideoId && j.videoUrl);

  console.log(`Found ${beats.length} beats to upload\n`);

  for (const job of beats.slice(0, 5)) {
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

      console.log(`  🎯 ${channel?.title} (${isLofi ? 'lofi' : 'trap'})`);

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

      console.log('  📤 Uploading...');

      // Check if scheduled upload time is set
      const scheduledTime = job.unityMetadata?.scheduledUploadTime;
      const publishAt = scheduledTime ? new Date(scheduledTime) : null;
      const isScheduled = publishAt && publishAt > new Date();

      console.log(isScheduled ? `  📅 Scheduled for: ${publishAt.toLocaleString()}` : '  📤 Publishing now');

      const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: job.scriptName || 'Beat',
            description: `${job.scriptName}\n\n${job.scriptContent}\n\n🎵 Free to use with credit\n💰 License: [Your link]\n\n#Shorts #beats #instrumental\n\n⚠️ AI generated`,
            tags: (job.scriptContent || '')
              .split(/[,\s]+/)
              .filter((t) => t.length > 2)
              .slice(0, 10),
            categoryId: '10',
          },
          status: {
            privacyStatus: isScheduled ? 'private' : 'public',
            selfDeclaredMadeForKids: false,
            publishAt: isScheduled ? publishAt.toISOString() : undefined,
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
      console.log(`  ✅ ${videoUrl}\n`);

      await storage.updateJob(job.id, {
        youtubeVideoId: res.data.id,
        youtubeUrl: videoUrl,
        uploadedAt: new Date(),
        unityMetadata: { ...job.unityMetadata, youtubeChannel: channel!.title } as any,
      });

      await new Promise((r) => setTimeout(r, 3000));
    } catch (err: any) {
      console.error(`  ❌ ${err.message}\n`);
    }
  }

  console.log('✅ Done!');
}

main().catch(console.error);
