#!/usr/bin/env tsx
/**
 * Final Beat Upload with All Features:
 * - A/B tested titles with artist tags
 * - Multiple thumbnail variations (auto-swap at 24h)
 * - BeatStars links in description
 * - Scheduled publishing over 24 hours
 * - SEO-optimized metadata
 */

import { storage } from './server/storage';
import { google } from 'googleapis';
import { existsSync, createReadStream, readFileSync } from 'fs';
import { join } from 'path';
import { beatTitleGenerator } from './server/services/beat-title-generator';
import { thumbnailABTester } from './server/services/thumbnail-ab-tester';
import { artistVisualMapper } from './server/services/artist-visual-mapper';

interface ConnectedChannel {
  id: string;
  channelId: string;
  title: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

async function main() {
  console.log('🚀 FINAL BEAT UPLOAD WITH ALL OPTIMIZATIONS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const channelsPath = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  const channels: ConnectedChannel[] = JSON.parse(readFileSync(channelsPath, 'utf-8'));

  const lofiChannel = channels.find((ch) => /chill|lofi/i.test(ch.title));
  const trapChannel = channels.find((ch) => /trap/i.test(ch.title));

  console.log('📺 Connected Channels:');
  console.log(`   Lofi: ${lofiChannel?.title || 'Not found'}`);
  console.log(`   Trap: ${trapChannel?.title || 'Not found'}\n`);

  const jobs = await storage.listJobs();
  const beats = jobs
    .filter((j) => j.status === 'completed' && j.mode === 'music' && !j.youtubeVideoId && j.videoUrl)
    .slice(0, 5); // Limit to 5 for testing

  console.log(`📊 Found ${beats.length} beats ready for upload\n`);

  if (beats.length === 0) {
    console.log('✅ No beats to upload');
    return;
  }

  const now = new Date();
  const scheduleIntervalMinutes = Math.floor((12 * 60) / beats.length); // Spread over 12 hours

  let uploadCount = 0;

  for (let i = 0; i < beats.length; i++) {
    const job = beats[i];

    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📺 ${job.scriptName}`);

      const videoPath = join(process.cwd(), 'data', 'videos', 'renders', job.videoUrl!.replace('/api/videos/', ''));

      if (!existsSync(videoPath)) {
        console.log('  ❌ Video not found');
        continue;
      }

      // Determine genre and channel
      const isLofi = /lofi|chillhop/i.test(job.scriptContent || '');
      const isTrap = /trap|drill/i.test(job.scriptContent || '');
      const genre = isLofi ? 'lofi' : isTrap ? 'trap' : 'trap';
      const channel = isLofi ? lofiChannel : trapChannel;

      if (!channel) {
        console.log('  ❌ No channel found for genre');
        continue;
      }

      // Extract BPM
      const bpmMatch = job.scriptName?.match(/(\d+)\s*BPM/i);
      const bpm = bpmMatch ? parseInt(bpmMatch[1]) : genre === 'lofi' ? 85 : 145;

      // Extract beat name
      const beatName =
        job.scriptName
          ?.replace(/\[.*?\]/g, '')
          .replace(/\d+\s*BPM/gi, '')
          .trim() || 'Untitled';

      console.log(`  🎯 Channel: ${channel.title}`);
      console.log(`  🎵 Genre: ${genre} | BPM: ${bpm}`);

      // === STEP 1: A/B TITLE GENERATION ===
      const variations = beatTitleGenerator.generateTitleVariations(beatName, bpm, genre);
      const selectedVariation = beatTitleGenerator.selectBestTitle(variations);

      console.log(`\n  📝 A/B TEST - Selected: ${selectedVariation.style}`);
      console.log(`     Title: ${selectedVariation.title.substring(0, 60)}...`);
      if (selectedVariation.artistTags.length > 0) {
        console.log(`     Artists: ${selectedVariation.artistTags.join(', ')}`);
      }

      // === STEP 2: GENERATE MULTIPLE THUMBNAIL VARIATIONS ===
      console.log(`\n  🖼️  Generating thumbnail variations...`);
      const thumbnailVariations = await thumbnailABTester.generateThumbnailVariations(
        videoPath,
        beatName,
        bpm,
        genre,
        selectedVariation.artistTags,
        job.id,
      );

      const primaryThumbnail = thumbnailVariations[0]; // Start with first variation

      // === STEP 3: GENERATE OPTIMIZED DESCRIPTION ===
      const description = beatTitleGenerator.generateDescription(
        beatName,
        bpm,
        genre,
        selectedVariation.artistTags,
        'https://www.beatstars.com/your-store', // TODO: Replace with actual link
      );

      // === STEP 4: GENERATE SEO TAGS ===
      const tags = beatTitleGenerator.generateTags(beatName, genre, selectedVariation.artistTags);

      // === STEP 5: SCHEDULE UPLOAD ===
      const scheduledTime = new Date(now.getTime() + i * scheduleIntervalMinutes * 60 * 1000);
      const isScheduled = scheduledTime > new Date(now.getTime() + 2 * 60 * 1000);

      console.log(isScheduled ? `\n  📅 Scheduled: ${scheduledTime.toLocaleString()}` : `\n  📤 Publishing now`);

      // === STEP 6: UPLOAD TO YOUTUBE ===
      const oauth = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI,
      );

      oauth.setCredentials({
        access_token: channel.accessToken,
        refresh_token: channel.refreshToken,
        expiry_date: channel.expiryDate,
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth });

      const res = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: selectedVariation.title,
            description,
            tags,
            categoryId: '10', // Music
          },
          status: {
            privacyStatus: isScheduled ? 'private' : 'public',
            selfDeclaredMadeForKids: false,
            publishAt: isScheduled ? scheduledTime.toISOString() : undefined,
          },
        },
        media: { body: createReadStream(videoPath) },
      });

      const videoId = res.data.id!;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // === STEP 7: UPLOAD PRIMARY THUMBNAIL ===
      if (existsSync(primaryThumbnail)) {
        console.log(`  📸 Uploading thumbnail (${thumbnailVariations.length} variations generated)`);
        await youtube.thumbnails.set({
          videoId,
          media: { body: createReadStream(primaryThumbnail) },
        });
      }

      console.log(`  ✅ ${videoUrl}`);
      console.log(isScheduled ? `  🕐 Publishes: ${scheduledTime.toLocaleTimeString()}` : `  ✅ Published`);

      // === STEP 8: SCHEDULE THUMBNAIL A/B TEST ===
      await thumbnailABTester.scheduleSwap(job.id, videoId, channel.channelId, thumbnailVariations);
      console.log(`  🔄 Thumbnail A/B test scheduled (swaps in 24h)`);

      // === STEP 9: UPDATE JOB METADATA ===
      await storage.updateJob(job.id, {
        youtubeVideoId: videoId,
        youtubeUrl: videoUrl,
        uploadedAt: new Date(),
        thumbnailUrl: `/api/thumbnails/${primaryThumbnail.split('/').pop()}`,
        unityMetadata: {
          ...job.unityMetadata,
          youtubeChannel: channel.title,
          scheduledPublishTime: isScheduled ? scheduledTime.toISOString() : null,
          abTest: {
            titleVariation: selectedVariation.style,
            artistTags: selectedVariation.artistTags,
            thumbnailVariations: thumbnailVariations.length,
          },
          currentThumbnailVariation: 0,
        } as any,
      });

      uploadCount++;
      await new Promise((r) => setTimeout(r, 4000)); // 4 second delay between uploads
    } catch (err: any) {
      console.error(`  ❌ ${err.message}`);
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ UPLOAD COMPLETE!`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\n📊 STATS:`);
  console.log(`   Uploaded: ${uploadCount}/${beats.length}`);
  console.log(`   Publishing schedule: ${Math.ceil((uploadCount * scheduleIntervalMinutes) / 60)}h`);
  console.log(`\n🎯 FEATURES ENABLED:`);
  console.log(`   ✅ A/B tested titles with artist tags`);
  console.log(`   ✅ Multiple thumbnail variations`);
  console.log(`   ✅ Auto thumbnail swap at 24 hours`);
  console.log(`   ✅ BeatStars links in description`);
  console.log(`   ✅ SEO-optimized tags`);
  console.log(`   ✅ Scheduled publishing`);
  console.log(`\n📅 NEXT STEPS:`);
  console.log(`   1. Run thumbnail-swap-cron.ts every hour`);
  console.log(`   2. Monitor analytics after 48 hours`);
  console.log(`   3. Thompson Sampling learns best titles/thumbnails`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

main().catch(console.error);
