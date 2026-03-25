#!/usr/bin/env tsx
/**
 * Upload Completed Beats to YouTube
 * Retroactively uploads completed music mode jobs
 */

import { storage } from './server/storage';
import { youtubeChannelManager } from './server/services/youtube-channel-manager';
import { existsSync } from 'fs';
import { join } from 'path';

async function uploadCompletedBeats() {
  console.log('📤 Uploading completed beats to YouTube...\n');

  if (!youtubeChannelManager.isEnabled()) {
    console.error('❌ YouTube not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI');
    return;
  }

  // Get completed music mode jobs without YouTube upload
  const jobs = await storage.getAllJobs();
  const completedBeats = jobs.filter(
    (job) => job.status === 'completed' && job.mode === 'music' && !job.youtubeVideoId && job.videoUrl,
  );

  if (completedBeats.length === 0) {
    console.log('✅ No completed beats found without YouTube upload');
    return;
  }

  console.log(`Found ${completedBeats.length} completed beats to upload\n`);

  let successCount = 0;
  let failCount = 0;

  for (const job of completedBeats) {
    try {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📺 ${job.scriptName}`);

      // Construct file paths
      const videoFileName = job.videoUrl?.replace('/api/videos/', '');
      const thumbnailFileName = job.thumbnailUrl?.replace('/api/thumbnails/', '');

      if (!videoFileName) {
        console.log('   ⏭️  Skipping: No video file');
        continue;
      }

      const videoPath = join(process.cwd(), 'data', 'videos', 'renders', videoFileName);
      const thumbnailPath = thumbnailFileName ? join(process.cwd(), 'data', 'thumbnails', thumbnailFileName) : null;

      if (!existsSync(videoPath)) {
        console.log(`   ❌ Video file not found: ${videoPath}`);
        failCount++;
        continue;
      }

      // Extract genre from scriptContent
      const scriptContent = job.scriptContent || '';
      const isLofi = /lofi|chillhop|jazz hop|lo-fi|study/i.test(scriptContent);
      const isTrap = /trap|drill|808|type beat/i.test(scriptContent);

      // Prepare content analysis for routing
      const contentAnalysis = {
        genre: isLofi ? 'lofi' : isTrap ? 'trap' : 'beats',
        style: job.scriptName || '',
        tags: scriptContent.split(/[,\s]+/).filter((t) => t.length > 2),
        keywords: [
          ...(isLofi ? ['lofi', 'chill', 'study', 'relax'] : []),
          ...(isTrap ? ['trap', 'type beat', 'hard', '808'] : []),
          'beats',
          'instrumental',
          'music',
        ],
      };

      console.log(`   Genre: ${contentAnalysis.genre}`);

      // Generate description
      const description = `${job.scriptName}

${scriptContent}

🎵 Free to use (with credit)
💰 Purchase license: [Your BeatStars link]

#beats #instrumental ${isLofi ? '#lofi #chillhop #studymusic' : '#trap #typebeat #hiphop'}

⚠️ This beat was generated using AI technology.`;

      // Upload with auto-routing
      console.log(`   📤 Uploading...`);
      const uploadResult = await youtubeChannelManager.uploadVideo(
        'auto', // Let system pick best channel
        videoPath,
        thumbnailPath,
        {
          title: job.scriptName || 'Untitled Beat',
          description,
          tags: contentAnalysis.tags.slice(0, 10), // YouTube max 10 tags
          categoryId: '10', // Music category
          privacyStatus: 'public',
        },
        contentAnalysis,
      );

      if (uploadResult.success) {
        console.log(`   ✅ Uploaded to ${uploadResult.channelName}`);
        console.log(`   🔗 ${uploadResult.videoUrl}`);

        // Update job with YouTube info
        await storage.updateJob(job.id, {
          youtubeVideoId: uploadResult.videoId,
          youtubeUrl: uploadResult.videoUrl,
          uploadedAt: new Date(),
          unityMetadata: {
            ...job.unityMetadata,
            youtubeChannel: uploadResult.channelName,
          } as any,
        });

        successCount++;
      } else {
        console.log(`   ❌ Upload failed: ${uploadResult.error}`);
        failCount++;
      }

      // Small delay between uploads
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error(`   ❌ Error: ${error.message}`);
      failCount++;
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Upload Complete!`);
  console.log(`   Success: ${successCount}/${completedBeats.length}`);
  console.log(`   Failed: ${failCount}/${completedBeats.length}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

uploadCompletedBeats().catch(console.error);
