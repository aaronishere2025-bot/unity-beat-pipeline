#!/usr/bin/env tsx
import { storage } from './server/storage';
import { google } from 'googleapis';
import { existsSync, createReadStream, readFileSync } from 'fs';
import { join } from 'path';
import { beatTitleGenerator } from './server/services/beat-title-generator';

interface ConnectedChannel {
  id: string;
  channelId: string;
  title: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

async function main() {
  console.log('🎯 Uploading beats with A/B tested titles...\n');

  const channelsPath = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channels: ConnectedChannel[] = JSON.parse(readFileSync(channelsPath, 'utf-8'));

  const lofiChannel = channels.find((ch) => /chill|lofi/i.test(ch.title));
  const trapChannel = channels.find((ch) => /trap/i.test(ch.title));

  const jobs = await storage.listJobs();
  const beats = jobs.filter((j) => j.status === 'completed' && j.mode === 'music' && !j.youtubeVideoId && j.videoUrl);

  console.log(`Found ${beats.length} beats for A/B title testing\n`);

  const now = new Date();
  const scheduleIntervalMinutes = Math.floor((24 * 60) / Math.min(beats.length, 20));

  let uploadCount = 0;

  for (let i = 0; i < Math.min(beats.length, 10); i++) {
    const job = beats[i];

    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📺 ${job.scriptName}`);

      const videoPath = join(process.cwd(), 'data', 'videos', 'renders', job.videoUrl!.replace('/api/videos/', ''));
      const thumbnailPath = job.thumbnailUrl
        ? join(process.cwd(), 'data', 'thumbnails', job.thumbnailUrl.replace('/api/thumbnails/', ''))
        : null;

      if (!existsSync(videoPath)) {
        console.log('  ❌ Video not found');
        continue;
      }

      const isLofi = /lofi|chillhop/i.test(job.scriptContent || '');
      const isTrap = /trap|drill/i.test(job.scriptContent || '');
      const genre = isLofi ? 'lofi' : isTrap ? 'trap' : 'trap';
      const channel = isLofi ? lofiChannel : trapChannel;

      // Extract BPM from script name
      const bpmMatch = job.scriptName?.match(/(\d+)\s*BPM/i);
      const bpm = bpmMatch ? parseInt(bpmMatch[1]) : genre === 'lofi' ? 85 : 145;

      // Extract beat name (remove BPM and date)
      const beatName =
        job.scriptName
          ?.replace(/\[.*?\]/g, '')
          .replace(/\d+\s*BPM/gi, '')
          .trim() || 'Untitled';

      console.log(`  🎯 Channel: ${channel?.title} (${genre})`);
      console.log(`  🎵 BPM: ${bpm}`);

      // Generate A/B title variations
      const variations = beatTitleGenerator.generateTitleVariations(beatName, bpm, genre);

      // Select best variation (Thompson Sampling)
      const selectedVariation = beatTitleGenerator.selectBestTitle(variations);

      console.log(`\n  🎲 A/B TEST: Selected title variation (${selectedVariation.style})`);
      console.log(`  📝 Title: ${selectedVariation.title}`);
      if (selectedVariation.artistTags.length > 0) {
        console.log(`  👤 Artists: ${selectedVariation.artistTags.join(', ')}`);
      }

      // Generate optimized description
      const description = beatTitleGenerator.generateDescription(
        beatName,
        bpm,
        genre,
        selectedVariation.artistTags,
        'https://www.beatstars.com/your-store', // Replace with actual BeatStars link
      );

      // Generate SEO tags
      const tags = beatTitleGenerator.generateTags(beatName, genre, selectedVariation.artistTags);

      // Schedule upload
      const scheduledTime = new Date(now.getTime() + i * scheduleIntervalMinutes * 60 * 1000);
      const isScheduled = scheduledTime > new Date(now.getTime() + 2 * 60 * 1000);

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
            title: selectedVariation.title,
            description,
            tags,
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
        console.log('  📸 Uploading thumbnail...');
        await youtube.thumbnails.set({
          videoId: res.data.id!,
          media: { body: createReadStream(thumbnailPath) },
        });
      }

      const videoUrl = `https://www.youtube.com/watch?v=${res.data.id}`;
      console.log(`  ✅ ${videoUrl}`);
      console.log(`  ${isScheduled ? '🕐 Will publish: ' + scheduledTime.toLocaleTimeString() : '✅ Published'}`);

      // Store A/B test metadata
      await storage.updateJob(job.id, {
        youtubeVideoId: res.data.id,
        youtubeUrl: videoUrl,
        uploadedAt: new Date(),
        unityMetadata: {
          ...job.unityMetadata,
          youtubeChannel: channel!.title,
          scheduledPublishTime: isScheduled ? scheduledTime.toISOString() : null,
          abTest: {
            titleVariation: selectedVariation.style,
            artistTags: selectedVariation.artistTags,
            allVariations: variations.map((v) => ({ title: v.title, style: v.style })),
          },
        } as any,
      });

      uploadCount++;
      await new Promise((r) => setTimeout(r, 3000));
    } catch (err: any) {
      console.error(`  ❌ ${err.message}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Uploaded ${uploadCount} beats with A/B tested titles!`);
  console.log(`📅 Videos will publish over the next ${Math.ceil((uploadCount * scheduleIntervalMinutes) / 60)} hours`);
  console.log(`\n🎯 A/B TEST INFO:`);
  console.log(`   Title variations tested per beat`);
  console.log(`   Thompson Sampling selects best performer`);
  console.log(`   Analytics will track which titles drive views`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(console.error);
