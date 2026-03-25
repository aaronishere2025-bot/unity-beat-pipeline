#!/usr/bin/env tsx
/**
 * Upload Beats to YouTube (Using Connected Channels)
 * Uses youtube_connected_channels.json for authentication
 */

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
  status: string;
}

async function uploadBeatsToYoutube() {
  console.log('📤 Uploading completed beats to YouTube...\n');

  // Load connected channels
  const channelsPath = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  if (!existsSync(channelsPath)) {
    console.error('❌ No connected channels found. Connect channels first.');
    return;
  }

  const connectedChannels: ConnectedChannel[] = JSON.parse(readFileSync(channelsPath, 'utf-8'));

  if (connectedChannels.length === 0) {
    console.error('❌ No channels connected');
    return;
  }

  console.log(\`Found \${connectedChannels.length} connected channels:\`);
  connectedChannels.forEach(ch => console.log(\`   - \${ch.title} (\${ch.channelId})\`));
  console.log('');

  const lofiChannel = connectedChannels.find(ch => /chill|lofi/i.test(ch.title));
  const trapChannel = connectedChannels.find(ch => /trap/i.test(ch.title));

  if (!lofiChannel || !trapChannel) {
    console.error('❌ Could not identify lofi and trap channels');
    return;
  }

  // Get completed beats without YouTube upload
  const jobs = await storage.getAllJobs();
  const completedBeats = jobs.filter(job =>
    job.status === 'completed' &&
    job.mode === 'music' &&
    !job.youtubeVideoId &&
    job.videoUrl
  );

  if (completedBeats.length === 0) {
    console.log('✅ No completed beats found without YouTube upload');
    return;
  }

  console.log(\`Found \${completedBeats.length} completed beats to upload\n\`);

  let successCount = 0;
  let failCount = 0;

  for (const job of completedBeats.slice(0, 5)) { // Limit to 5 for testing
    try {
      console.log(\`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\`);
      console.log(\`📺 \${job.scriptName}\`);

      // Construct file paths
      const videoFileName = job.videoUrl?.replace('/api/videos/', '');
      const thumbnailFileName = job.thumbnailUrl?.replace('/api/thumbnails/', '');

      if (!videoFileName) {
        console.log('   ⏭️  Skipping: No video file');
        continue;
      }

      const videoPath = join(process.cwd(), 'data', 'videos', 'renders', videoFileName);
      const thumbnailPath = thumbnailFileName
        ? join(process.cwd(), 'data', 'thumbnails', thumbnailFileName)
        : null;

      if (!existsSync(videoPath)) {
        console.log(\`   ❌ Video file not found: \${videoPath}\`);
        failCount++;
        continue;
      }

      // Determine channel based on content
      const scriptContent = job.scriptContent || '';
      const isLofi = /lofi|chillhop|jazz hop|lo-fi|study/i.test(scriptContent);
      const selectedChannel = isLofi ? lofiChannel : trapChannel;

      console.log(\`   🎯 Routing to: \${selectedChannel.title}\`);
      console.log(\`   Genre: \${isLofi ? 'lofi' : 'trap'}\`);

      // Create OAuth client
      const clientId = process.env.YOUTUBE_CLIENT_ID;
      const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
      const redirectUri = process.env.YOUTUBE_REDIRECT_URI;

      if (!clientId || !clientSecret || !redirectUri) {
        console.error('   ❌ YouTube OAuth not configured');
        failCount++;
        continue;
      }

      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      oauth2Client.setCredentials({
        access_token: selectedChannel.accessToken,
        refresh_token: selectedChannel.refreshToken,
        expiry_date: selectedChannel.expiryDate,
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      // Generate description
      const description = \`\${job.scriptName}

\${scriptContent}

🎵 Free to use (with credit)
💰 Purchase license: [Your BeatStars link]

#beats #instrumental \${isLofi ? '#lofi #chillhop #studymusic' : '#trap #typebeat #hiphop'}

⚠️ This beat was generated using AI technology.\`;

      // Upload video
      console.log(\`   📤 Uploading...\`);
      const videoSize = statSync(videoPath).size;

      const response = await youtube.videos.insert(
        {
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: job.scriptName || 'Untitled Beat',
              description,
              tags: scriptContent.split(/[,\s]+/).filter(t => t.length > 2).slice(0, 10),
              categoryId: '10', // Music
            },
            status: {
              privacyStatus: 'public',
              selfDeclaredMadeForKids: false,
            },
          },
          media: {
            body: createReadStream(videoPath),
          },
        },
        {
          onUploadProgress: (evt: any) => {
            const percent = Math.round((evt.bytesRead / videoSize) * 100);
            if (percent % 25 === 0) {
              console.log(\`   📊 Upload: \${percent}%\`);
            }
          },
        }
      );

      const videoId = response.data.id;
      const videoUrl = \`https://www.youtube.com/watch?v=\${videoId}\`;

      // Upload thumbnail if available
      if (thumbnailPath && existsSync(thumbnailPath)) {
        console.log(\`   📸 Uploading thumbnail...\`);
        await youtube.thumbnails.set({
          videoId: videoId!,
          media: {
            body: createReadStream(thumbnailPath),
          },
        });
      }

      console.log(\`   ✅ Uploaded successfully!\`);
      console.log(\`   🔗 \${videoUrl}\`);
      console.log(\`   📺 Channel: \${selectedChannel.title}\`);

      // Update job with YouTube info
      await storage.updateJob(job.id, {
        youtubeVideoId: videoId,
        youtubeUrl: videoUrl,
        uploadedAt: new Date(),
        unityMetadata: {
          ...job.unityMetadata,
          youtubeChannel: selectedChannel.title,
          youtubeChannelId: selectedChannel.channelId,
        } as any,
      });

      successCount++;

      // Small delay between uploads
      await new Promise(resolve => setTimeout(resolve, 3000));

    } catch (error: any) {
      console.error(\`   ❌ Error: \${error.message}\`);
      if (error.response?.data) {
        console.error(\`   Details: \${JSON.stringify(error.response.data)}\`);
      }
      failCount++;
    }
  }

  console.log(\`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\`);
  console.log(\`✅ Upload Complete!\`);
  console.log(\`   Success: \${successCount}/\${Math.min(completedBeats.length, 5)}\`);
  console.log(\`   Failed: \${failCount}/\${Math.min(completedBeats.length, 5)}\`);
  console.log(\`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\`);
}

uploadBeatsToYoutube().catch(console.error);
