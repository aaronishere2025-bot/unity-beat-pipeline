/**
 * SCHEDULED UPLOAD SERVICE
 *
 * Handles scheduled YouTube uploads to prevent conflicts.
 * Wakes up exactly when the next upload is due (no polling).
 */

import { db } from '../db';
import { jobs, Job } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { storage } from '../storage';

class ScheduledUploadService {
  private timeoutId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the scheduled upload service (wakes up for next scheduled upload)
   */
  start() {
    if (this.timeoutId) {
      console.log('⚠️  Scheduled upload service already running');
      return;
    }

    console.log('🕐 Scheduled Upload Service started - wakes up for next scheduled upload');

    // Schedule next upload check
    this.scheduleNextCheck();
  }

  /**
   * Stop the scheduled upload checker
   */
  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
      console.log('🛑 Scheduled Upload Service stopped');
    }
  }

  /**
   * Schedule a check for the next pending upload
   */
  private async scheduleNextCheck() {
    try {
      // Find the next scheduled upload time
      const allJobs = await db.select().from(jobs).where(eq(jobs.status, 'completed'));

      const pendingUploads = allJobs
        .filter(
          (j) => (j.unityMetadata as any)?.pendingScheduledUpload && (j.unityMetadata as any)?.scheduledUploadTime,
        )
        .map((j) => ({
          job: j,
          scheduledTime: new Date((j.unityMetadata as any).scheduledUploadTime),
        }))
        .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());

      if (pendingUploads.length === 0) {
        // No pending uploads, check again in 5 minutes in case new jobs complete
        this.timeoutId = setTimeout(() => this.scheduleNextCheck(), 5 * 60 * 1000);
        return;
      }

      const nextUpload = pendingUploads[0];
      const now = new Date();
      const msUntilUpload = nextUpload.scheduledTime.getTime() - now.getTime();

      if (msUntilUpload <= 0) {
        // Upload is overdue, do it immediately
        console.log(`⚡ Upload overdue, processing now: ${nextUpload.job.scriptName}`);
        await this.checkScheduledUploads();
        // Then schedule next check
        this.scheduleNextCheck();
      } else {
        // Schedule wake-up for exact upload time
        const minutes = Math.round(msUntilUpload / 60000);
        console.log(
          `⏰ Next upload: ${nextUpload.job.scriptName} in ${minutes} min (${nextUpload.scheduledTime.toLocaleTimeString()})`,
        );

        this.timeoutId = setTimeout(async () => {
          await this.checkScheduledUploads();
          // After uploading, schedule next check
          this.scheduleNextCheck();
        }, msUntilUpload);
      }
    } catch (error: any) {
      console.error('❌ Error scheduling next check:', error);
      // Retry in 1 minute
      this.timeoutId = setTimeout(() => this.scheduleNextCheck(), 60 * 1000);
    }
  }

  /**
   * Check for pending scheduled uploads and upload if time has come
   */
  private async checkScheduledUploads() {
    if (this.isRunning) {
      console.log('⏭️  Upload check already running, skipping...');
      return;
    }

    this.isRunning = true;

    try {
      // Find jobs that are completed but pending scheduled upload
      const allJobs = await db.select().from(jobs).where(eq(jobs.status, 'completed'));

      const pendingUploads = allJobs.filter(
        (j) => (j.unityMetadata as any)?.pendingScheduledUpload && (j.unityMetadata as any)?.scheduledUploadTime,
      );

      if (pendingUploads.length === 0) {
        return; // Nothing to upload
      }

      const now = new Date();
      let uploadedCount = 0;

      console.log(`\n🕐 [${now.toLocaleTimeString()}] Checking ${pendingUploads.length} pending uploads...`);

      for (const job of pendingUploads) {
        const scheduledTime = new Date((job.unityMetadata as any).scheduledUploadTime);

        if (now >= scheduledTime) {
          console.log(`   📤 Uploading: ${job.scriptName} (scheduled: ${scheduledTime.toLocaleTimeString()})`);

          try {
            await this.uploadJob(job);
            uploadedCount++;
          } catch (error: any) {
            console.error(`   ❌ Upload failed: ${error.message}`);

            // Mark as failed upload
            await storage.updateJob(job.id, {
              unityMetadata: {
                ...job.unityMetadata,
                pendingScheduledUpload: false,
                uploadError: error.message,
              } as any,
            } as any);
          }

          // Wait 2 seconds between uploads to avoid rate limits
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      if (uploadedCount > 0) {
        console.log(`   ✅ Uploaded ${uploadedCount} videos\n`);
      }
    } catch (error: any) {
      console.error('❌ Error in scheduled upload check:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Upload a completed job to YouTube
   */
  private async uploadJob(job: Job) {
    // Check if there's custom metadata and channel from the scheduled upload
    const metadata = job.unityMetadata as any;
    const customMetadata = metadata?.customMetadata;
    const channelConnectionId = metadata?.channelConnectionId;

    // If custom metadata exists, use the manual upload route
    if (customMetadata && channelConnectionId) {
      console.log(`📤 Using custom metadata for scheduled upload`);

      // Import necessary modules
      const { createReadStream, existsSync, readFileSync } = await import('fs');
      const { join } = await import('path');
      const { google } = await import('googleapis');

      // Get video path
      let videoPath = job.videoUrl || '';
      if (!videoPath) {
        throw new Error('No video path found');
      }

      // Convert relative URL to absolute path
      if (videoPath.startsWith('/api/videos/')) {
        const filename = videoPath.replace('/api/videos/', '');
        videoPath = join(process.cwd(), 'data', 'videos', 'renders', filename);

        if (!existsSync(videoPath)) {
          videoPath = join(process.cwd(), 'attached_assets', 'veo_videos', filename);
        }
      }

      if (!existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      // Load the selected channel credentials
      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
      if (!existsSync(channelsFile)) {
        throw new Error('YouTube channels file not found');
      }

      const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
      const selectedChannel = channels.find((c: any) => c.id === channelConnectionId);

      if (!selectedChannel) {
        throw new Error(`Channel ${channelConnectionId} not found`);
      }

      console.log(`🎯 Uploading to: ${selectedChannel.title}`);

      // Create OAuth client with channel credentials
      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        process.env.YOUTUBE_REDIRECT_URI,
      );

      oauth2Client.setCredentials({
        access_token: selectedChannel.accessToken,
        refresh_token: selectedChannel.refreshToken,
        expiry_date: selectedChannel.expiryDate,
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      // Upload with custom metadata
      const videoMetadata = {
        snippet: {
          title: customMetadata.title,
          description: customMetadata.description,
          tags: customMetadata.tags || [],
          categoryId: customMetadata.categoryId || '10',
        },
        status: {
          privacyStatus: customMetadata.privacyStatus || 'private',
        },
      };

      const uploadResponse = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: videoMetadata,
        media: {
          body: createReadStream(videoPath),
        },
      });

      const videoId = uploadResponse.data.id;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      console.log(`✅ Uploaded to ${selectedChannel.title}: ${videoUrl}`);

      // Update job
      await storage.updateJob(job.id, {
        youtubeVideoId: videoId,
        youtubeUrl: videoUrl,
        uploadedAt: new Date(),
        unityMetadata: {
          ...metadata,
          pendingScheduledUpload: false,
          youtubeChannel: selectedChannel.title,
        } as any,
      } as any);

      return;
    }

    // Fallback to old auto-routing logic
    const { youtubeChannelManager } = await import('./youtube-channel-manager');

    if (!youtubeChannelManager.isEnabled()) {
      throw new Error('YouTube not configured');
    }

    // Get video path
    const videoPath = job.videoUrl || '';
    if (!videoPath) {
      throw new Error('No video path found');
    }

    // Get thumbnail path
    const thumbnailPath = job.thumbnailUrl || undefined;

    // Extract genre from scriptContent for routing
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

    // Generate description
    const description = `${job.scriptName}

${scriptContent}

🎵 Free to use (with credit)
💰 Purchase license: [Your BeatStars link]

#beats #instrumental ${isLofi ? '#lofi #chillhop #studymusic' : '#trap #typebeat #hiphop'}

⚠️ This beat was generated using AI technology.`;

    // Upload with auto-routing
    const uploadResult = await youtubeChannelManager.uploadVideo(
      'auto', // Let system pick best channel
      videoPath,
      thumbnailPath ?? (null as any),
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
      console.log(`      ✅ Uploaded to ${uploadResult.channelName}: ${uploadResult.videoUrl}`);

      // Update job with YouTube info
      await storage.updateJob(job.id, {
        youtubeVideoId: uploadResult.videoId,
        youtubeUrl: uploadResult.videoUrl,
        uploadedAt: new Date(),
        unityMetadata: {
          ...job.unityMetadata,
          pendingScheduledUpload: false,
          youtubeChannel: uploadResult.channelName,
        } as any,
      } as any);
    } else {
      throw new Error(uploadResult.error || 'Upload failed');
    }
  }

  /**
   * Force upload a specific job (bypasses schedule check)
   */
  async forceUpload(jobId: string): Promise<void> {
    const job = await storage.getJob(jobId);
    if (!job) {
      throw new Error('Job not found');
    }

    if (job.status !== 'completed') {
      throw new Error('Job must be completed before uploading');
    }

    console.log(`🚀 Force uploading: ${job.scriptName}`);
    await this.uploadJob(job);
  }
}

export const scheduledUploadService = new ScheduledUploadService();
