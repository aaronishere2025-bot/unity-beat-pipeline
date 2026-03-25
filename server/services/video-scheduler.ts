/**
 * VIDEO SCHEDULER SERVICE
 *
 * Generates historical rap video content. Uploads happen immediately on
 * completion via job-worker (no delayed upload slots).
 *
 * Schedule (called by pipeline-orchestrator):
 * - 4:00 PM PT → generate 1 historical rap video (~45 min → uploads ~5 PM PT)
 *
 * Daily count: 1 historical rap video (configurable via DAILY_VIDEO_COUNT)
 */

import { autonomousGoalAgent } from './autonomous-goal-agent';
import { topicDiscoveryAgent } from './topic-discovery-agent';
import { db } from '../db';
import { jobs, unityContentPackages } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { systemHealthMonitor } from './system-health-monitor';
import { existsSync, readFileSync, writeFileSync, createReadStream, statSync } from 'fs';
import { join } from 'path';
import { storage } from '../storage';
import { sendDiscordEmbed } from './alert-service';

/**
 * Upload a completed job to YouTube using connected channels.
 * Returns { success, videoId, error }
 */
export async function uploadJobToYouTube(
  job: any,
  options?: { publishAt?: string },
): Promise<{ success: boolean; videoId?: string; error?: string }> {
  try {
    const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
    if (!existsSync(channelsFile)) {
      return { success: false, error: 'No connected YouTube channels found' };
    }

    const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
    const activeChannels = channels.filter((c: any) => c.status === 'active');
    if (activeChannels.length === 0) {
      return { success: false, error: 'No active YouTube channels' };
    }

    // Pick channel: beat jobs have channelId in metadata, history matched by title
    const beatChannelId = (job.unityMetadata as any)?.channelId;
    const isHistory = job.mode === 'unity_kling';
    let selectedChannel;
    if (beatChannelId) {
      selectedChannel = activeChannels.find((c: any) => c.id === beatChannelId) || activeChannels[0];
    } else if (isHistory) {
      selectedChannel = activeChannels.find((c: any) => /rapping|history/i.test(c.title)) || activeChannels[0];
    } else {
      selectedChannel = activeChannels[0];
    }

    // Find video file
    let videoPath: string | null = null;
    if (job.videoUrl) {
      const filename = job.videoUrl.replace('/api/videos/', '');
      videoPath = join(process.cwd(), 'data', 'videos', 'renders', filename);
    }
    if (!videoPath || !existsSync(videoPath)) {
      return { success: false, error: `Video file not found: ${videoPath}` };
    }

    // Generate metadata
    const { youtubeMetadataGenerator } = await import('./youtube-metadata-generator');
    const metadata = await youtubeMetadataGenerator.generateMetadata({
      jobName: job.scriptName || 'AI Video',
      mode: job.mode || 'unity_kling',
      aspectRatio: job.aspectRatio || '9:16',
      unityMetadata: job.unityMetadata || undefined,
      duration: job.duration || undefined,
    });
    const ytMetadata = Array.isArray(metadata) ? metadata[0] : metadata;

    // Create OAuth2 client
    const { google } = await import('googleapis');
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
    const fileSizeInMB = statSync(videoPath).size / (1024 * 1024);
    console.log(`   📊 File: ${fileSizeInMB.toFixed(1)}MB -> ${selectedChannel.title}`);

    const uploadResponse = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: ytMetadata.title,
          description: ytMetadata.description,
          tags: ytMetadata.tags || [],
          categoryId: ytMetadata.categoryId || '10',
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
          ...(options?.publishAt && { publishAt: options.publishAt }),
        },
      },
      media: { body: createReadStream(videoPath) },
    });

    const videoId = uploadResponse.data.id;
    if (!videoId) {
      return { success: false, error: 'YouTube returned no video ID' };
    }

    // Update job with YouTube info
    await storage.updateJob(job.id, {
      youtubeVideoId: videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      uploadedAt: new Date(),
      youtubeChannelConnectionId: selectedChannel.id,
    } as any);

    // Save refreshed token
    const updatedCreds = oauth2Client.credentials;
    if (updatedCreds.access_token && updatedCreds.access_token !== selectedChannel.accessToken) {
      const idx = channels.findIndex((c: any) => c.id === selectedChannel.id);
      if (idx !== -1) {
        channels[idx].accessToken = updatedCreds.access_token;
        channels[idx].expiryDate = updatedCreds.expiry_date;
        writeFileSync(channelsFile, JSON.stringify(channels, null, 2));
      }
    }

    return { success: true, videoId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// NO FALLBACK POOL - Topics are discovered dynamically based on 90-day video history
// The topicDiscoveryAgent analyzes past performance and generates fresh, related topics

// Configurable daily video count (default 12, set DAILY_VIDEO_COUNT env var to override)
const DAILY_VIDEO_COUNT = parseInt(process.env.DAILY_VIDEO_COUNT || '1', 10);

interface GenerationResult {
  figure: string;
  packageId?: string;
  jobId?: string;
  error?: string;
  duration: number;
}

class VideoScheduler {
  private isGenerating: boolean = false;
  private lastGenerationTime: Date | null = null;

  /**
   * Start the video scheduler.
   * Generation is triggered by pipeline-orchestrator at 4 PM PT.
   * Uploads happen immediately on job completion (no upload crons).
   */
  start(): void {
    console.log('\n🤖 ===== VIDEO SCHEDULER READY =====');
    console.log('📅 Generation: triggered by pipeline-orchestrator at 4:00 PM PT');
    console.log('📤 Uploads happen immediately on completion (no upload slots)');
    console.log('=====================================\n');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    console.log('🛑 Video scheduler stopped');
  }

  /**
   * Generate 1 history video daily (16:9 landscape, 2-3 min)
   * Public so external cron runners can call it directly.
   */
  async runDailyGeneration(): Promise<void> {
    if (this.isGenerating) {
      console.log('⚠️  Generation already in progress, skipping...');
      return;
    }

    this.isGenerating = true;

    // Record heartbeat for health monitoring
    systemHealthMonitor.recordHeartbeat('video-scheduler');

    const startTime = Date.now();

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║      🤖 AUTOMATED DAILY VIDEO GENERATION                  ║');
    console.log(`║      ${new Date().toLocaleString().padEnd(53)} ║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    try {
      // Use AI agent to discover fresh topics (with 90-day deduplication)
      const discoveryResult = await topicDiscoveryAgent.discoverTopics(DAILY_VIDEO_COUNT, 90);
      const todaysTopics = discoveryResult.topics;
      const results: GenerationResult[] = [];

      // Generate 5 shorts (all 9:16)
      for (let i = 0; i < todaysTopics.length; i++) {
        const topic = todaysTopics[i];

        console.log(`\n━━━ [${i + 1}/${todaysTopics.length}] ${topic.figure} (16:9 History) ━━━`);
        console.log(`    Hook: ${topic.hook}`);

        const genStart = Date.now();

        try {
          // Create Unity package with AI-discovered topic
          const result = await autonomousGoalAgent.createPackageFromGoal({
            figure: topic.figure,
            intent: topic.intent,
            constraints: {
              maxDuration: 180, // 2-3 min medium format
              aspectRatio: '16:9', // Landscape for YouTube
            },
            suggestedAngle: topic.angle,
            suggestedHook: topic.hook,
          });

          console.log(`✓ Package created: ${result.packageId}`);
          console.log(`  Angle: ${result.plan.recommendedApproach.angle.substring(0, 60)}...`);

          // Create job to generate video
          const [job] = await db
            .insert(jobs)
            .values({
              scriptName: topic.figure, // Use figure name as script name
              scriptContent: topic.hook, // Use hook as script content
              mode: 'unity_kling',
              status: 'queued',
              aspectRatio: '16:9', // Landscape for YouTube
              autoUpload: true,
              unityMetadata: {
                packageId: result.packageId,
                promptCount: 0, // Will be determined when package is loaded
                estimatedCost: 0,
                automationSource: 'video-scheduler',
                topic: topic.figure, // Use the actual figure name, not the angle
                hook: topic.hook,
                videoEngine: 'kling',
                includeKaraoke: true,
                karaokeStyle: 'bounce',
                enableI2V: false, // Not using image-to-video mode
                enableLipSync: true,
                autoUpload: true, // Mark for auto-upload after generation
              },
            } as any)
            .returning();

          console.log(`✓ Job queued: ${job.id}`);

          results.push({
            figure: topic.figure,
            packageId: result.packageId,
            jobId: job.id,
            duration: Date.now() - genStart,
          });
        } catch (error: any) {
          console.error(`✗ Error: ${error.message}`);
          results.push({
            figure: topic.figure,
            error: error.message,
            duration: Date.now() - genStart,
          });
        }

        // Rate limit protection
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      // Summary
      const totalDuration = Date.now() - startTime;
      const successful = results.filter((r) => r.jobId);
      const failed = results.filter((r) => r.error);

      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║      GENERATION SUMMARY                                    ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');

      console.log(`✓ Successful: ${successful.length}/${todaysTopics.length}`);
      for (const r of successful) {
        console.log(`  - ${r.figure}: Job ${r.jobId} (${(r.duration / 1000).toFixed(1)}s)`);
      }

      if (failed.length > 0) {
        console.log(`\n✗ Failed: ${failed.length}/${todaysTopics.length}`);
        for (const r of failed) {
          console.log(`  - ${r.figure}: ${r.error}`);
        }
      }

      console.log(`\n⏱️  Total time: ${(totalDuration / 1000 / 60).toFixed(1)} minutes`);
      console.log(`📊 Jobs will be processed by job-worker.ts`);
      console.log(`📤 Videos will upload immediately on completion`);

      sendDiscordEmbed({
        title: '🎬 History Video Generation Complete',
        description: `${successful.length}/${todaysTopics.length} jobs created in ${(totalDuration / 1000 / 60).toFixed(1)} min`,
        color: failed.length === 0 ? 0x00ff00 : 0xffd700,
        fields: [
          ...successful.map((r) => ({ name: r.figure, value: `Job ${r.jobId}`, inline: true })),
          ...(failed.length > 0
            ? [{ name: 'Failed', value: failed.map((r) => r.figure).join(', '), inline: false }]
            : []),
          { name: 'Upload', value: 'Immediate → RappingThroughHistory', inline: false },
        ],
        footer: { text: 'Video Scheduler' },
      }).catch(() => {});

      this.lastGenerationTime = new Date();
    } catch (error: any) {
      console.error('❌ Daily generation failed:', error.message);

      sendDiscordEmbed({
        title: '❌ History Video Generation Failed',
        description: error.message?.slice(0, 256) || 'Unknown error',
        color: 0xff0000,
        footer: { text: 'Video Scheduler' },
      }).catch(() => {});
    } finally {
      this.isGenerating = false;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    isGenerating: boolean;
    lastGeneration: Date | null;
  } {
    return {
      isGenerating: this.isGenerating,
      lastGeneration: this.lastGenerationTime,
    };
  }

  /**
   * Manually trigger generation (for testing)
   */
  async triggerGenerationNow(): Promise<void> {
    console.log('🔧 Manual generation triggered');
    await this.runDailyGeneration();
  }
}

export const videoScheduler = new VideoScheduler();
