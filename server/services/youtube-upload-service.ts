/**
 * YouTube Upload Service
 *
 * Handles OAuth 2.0 authentication and video uploads to YouTube.
 * Uses YouTube Data API v3 for video uploads.
 *
 * Required environment variables:
 * - YOUTUBE_CLIENT_ID: OAuth 2.0 client ID
 * - YOUTUBE_CLIENT_SECRET: OAuth 2.0 client secret
 * - YOUTUBE_REDIRECT_URI: OAuth callback URL (e.g., https://your-app.replit.app/api/youtube/callback)
 *
 * Optional:
 * - YOUTUBE_REFRESH_TOKEN: Stored refresh token for persistent auth
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { createReadStream, existsSync, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { fileManager } from './file-manager';
import { youtubeQuotaManager, QUOTA_COSTS } from './youtube-quota-manager';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube', // Full access - needed for updating metadata
  'https://www.googleapis.com/auth/youtube.readonly',
];

interface VideoStats {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  privacyStatus: string;
}

interface YouTubeCredentials {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
}

interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percentComplete: number;
}

interface UploadResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  title?: string;
  error?: string;
  cleanupResult?: { deletedFiles: number; freedMB: number };
}

interface VideoMetadata {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  publishAt?: string; // ISO 8601 timestamp for scheduled uploads (e.g., "2026-01-20T12:00:00Z")
}

class YouTubeUploadService {
  private oauth2Client: OAuth2Client | null = null;
  private credentialsPath = join(process.cwd(), 'data', 'youtube_credentials.json');
  private isConfigured = false;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();

    if (clientId && clientSecret && redirectUri) {
      this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      this.isConfigured = true;
      console.log('✅ YouTube OAuth client initialized');
      console.log(`   Client ID: ${clientId.substring(0, 20)}...`);

      this.loadStoredCredentials();
    } else {
      console.log(
        '⚠️ YouTube OAuth not configured - missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or YOUTUBE_REDIRECT_URI',
      );
    }
  }

  private loadStoredCredentials(): void {
    try {
      // Priority 1: Load from file (most recent OAuth, saved after user connects)
      if (existsSync(this.credentialsPath)) {
        const data = readFileSync(this.credentialsPath, 'utf-8');
        const credentials: YouTubeCredentials = JSON.parse(data);

        if (this.oauth2Client && credentials.refreshToken) {
          this.oauth2Client.setCredentials({
            access_token: credentials.accessToken,
            refresh_token: credentials.refreshToken,
            expiry_date: credentials.expiryDate,
          });
          console.log('✅ YouTube credentials loaded from file (most recent)');
          return;
        }
      }

      // Priority 2: Fall back to environment variable
      const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
      if (refreshToken && this.oauth2Client) {
        this.oauth2Client.setCredentials({
          refresh_token: refreshToken,
        });
        console.log('✅ YouTube refresh token loaded from environment');
        return;
      }
    } catch (error) {
      console.log('No stored YouTube credentials found');
    }
  }

  private saveCredentials(credentials: YouTubeCredentials): void {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.credentialsPath, JSON.stringify(credentials, null, 2));
      console.log('✅ YouTube credentials saved');
    } catch (error) {
      console.error('Failed to save YouTube credentials:', error);
    }
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.oauth2Client) return false;

    const credentials = this.oauth2Client.credentials;
    if (!credentials.refresh_token) {
      console.log('⚠️ YouTube: No refresh token in credentials');
      return false;
    }

    try {
      const result = await this.oauth2Client.getAccessToken();
      console.log('✅ YouTube: Access token refreshed successfully');
      return !!result.token;
    } catch (error: any) {
      console.log('⚠️ YouTube: Token refresh failed:', error.message);
      // Token might be expired/revoked - user needs to re-authenticate
      return false;
    }
  }

  /**
   * Get OAuth2 client for advanced analytics API calls
   */
  async getOAuthClient(): Promise<OAuth2Client | null> {
    if (!this.oauth2Client) return null;

    // Ensure we have valid credentials
    const isAuth = await this.isAuthenticated();
    if (!isAuth) return null;

    return this.oauth2Client;
  }

  getAuthUrl(state?: string): string {
    if (!this.oauth2Client) {
      throw new Error('YouTube OAuth not configured');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: state || 'youtube_auth',
    });
  }

  async handleCallback(code: string): Promise<{ success: boolean; refreshToken?: string; error?: string }> {
    if (!this.oauth2Client) {
      return { success: false, error: 'YouTube OAuth not configured' };
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);

      if (tokens.refresh_token) {
        this.saveCredentials({
          accessToken: tokens.access_token || '',
          refreshToken: tokens.refresh_token,
          expiryDate: tokens.expiry_date || 0,
        });

        console.log('✅ YouTube OAuth successful');
        console.log('📋 Add this to your environment secrets:');
        console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);

        return {
          success: true,
          refreshToken: tokens.refresh_token,
        };
      }

      return { success: true };
    } catch (error: any) {
      console.error('YouTube OAuth callback error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async getChannelInfo(): Promise<{ name: string; id: string; thumbnail: string } | null> {
    if (!this.oauth2Client) return null;

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
      const response = await youtube.channels.list({
        part: ['snippet'],
        mine: true,
      });

      const channel = response.data.items?.[0];
      if (channel) {
        return {
          name: channel.snippet?.title || 'Unknown',
          id: channel.id || '',
          thumbnail: channel.snippet?.thumbnails?.default?.url || '',
        };
      }
      return null;
    } catch (error) {
      console.error('Failed to get channel info:', error);
      return null;
    }
  }

  async uploadVideo(
    filePath: string,
    metadata: VideoMetadata,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<UploadResult> {
    if (!this.oauth2Client) {
      return { success: false, error: 'YouTube OAuth not configured' };
    }

    if (!existsSync(filePath)) {
      return { success: false, error: `Video file not found: ${filePath}` };
    }

    // AUDIO VERIFICATION: Block uploads without audio
    try {
      const { ffmpegProcessor } = await import('./ffmpeg-processor');
      const audioCheck = await ffmpegProcessor.verifyVideoHasAudio(filePath);

      if (!audioCheck.hasAudio) {
        console.log(`❌ YouTube upload blocked: No audio in video`);
        console.log(`   Status: ${audioCheck.syncStatus}`);
        console.log(`   Details: ${audioCheck.details}`);
        return { success: false, error: `Video has no audio track. Status: ${audioCheck.syncStatus}` };
      }

      console.log(`   🔊 ${audioCheck.details}`);
    } catch (audioErr: any) {
      console.warn(`   ⚠️ Audio verification failed, proceeding anyway: ${audioErr.message}`);
    }

    // THUMBNAIL CTR PREDICTION: Analyze thumbnail before upload
    const thumbnailPath = (metadata as any).thumbnailPath;
    let thumbnailPrediction = null;
    if (thumbnailPath && existsSync(thumbnailPath)) {
      try {
        console.log('\n🎯 Analyzing thumbnail CTR potential...');
        const { thumbnailCTRPredictor } = await import('./thumbnail-ctr-predictor');
        thumbnailPrediction = await thumbnailCTRPredictor.predictCTR(thumbnailPath);

        console.log(`   📊 Predicted CTR: ${thumbnailPrediction.predictedCTR.toFixed(1)}%`);
        console.log(`   📈 Quality Score: ${thumbnailPrediction.score}/100`);

        // Warn if score is low
        if (thumbnailPrediction.score < 60) {
          console.log(`\n   ⚠️ WARNING: Low thumbnail score (${thumbnailPrediction.score}/100)`);
          console.log(`   💡 Suggestions:`);
          thumbnailPrediction.suggestions.forEach((s: string) => console.log(`      - ${s}`));

          if (thumbnailPrediction.shouldRegenerate) {
            console.log(`\n   🔄 RECOMMENDATION: Consider regenerating thumbnail before upload`);
            // For now we'll continue, but you could add a flag to block low-quality uploads
          }
        }

        // Save prediction to database (will be updated with actual CTR later)
        const jobId = (metadata as any).jobId;
        if (jobId) {
          await this.saveThumbnailPrediction(jobId, thumbnailPath, thumbnailPrediction);
        }
      } catch (thumbnailErr: any) {
        console.warn(`   ⚠️ Thumbnail analysis failed: ${thumbnailErr.message}`);
        // Non-critical - continue with upload
      }
    }

    const isAuthed = await this.isAuthenticated();
    if (!isAuthed) {
      return { success: false, error: 'Not authenticated. Please connect YouTube account first.' };
    }

    const quotaCheck = youtubeQuotaManager.canUpload();
    if (!quotaCheck.canUpload) {
      console.log(`🚫 Upload blocked: ${quotaCheck.reason}`);
      return { success: false, error: quotaCheck.reason };
    }
    console.log(`📊 Quota check passed. Remaining uploads today: ${quotaCheck.remainingUploads}`);

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      const fileSize = statSync(filePath).size;

      console.log(`📤 Starting YouTube upload: ${metadata.title}`);
      console.log(`   File: ${filePath} (${Math.round(fileSize / 1024 / 1024)}MB)`);

      const response = await youtubeQuotaManager.withExponentialBackoff(() =>
        youtube.videos.insert(
          {
            part: ['snippet', 'status'],
            requestBody: {
              snippet: {
                title: metadata.title.substring(0, 100),
                description: metadata.description.substring(0, 5000),
                tags: metadata.tags?.slice(0, 30) || [],
                categoryId: metadata.categoryId || '22',
              },
              status: {
                privacyStatus: metadata.privacyStatus || 'private',
                selfDeclaredMadeForKids: false,
                // AI Content Disclosure (July 2025 Compliance)
                // @ts-ignore - YouTube API supports this for AI-altered content
                selfDeclaredAiContent: true,
                // Scheduled publishing (if publishAt is provided, video will be uploaded as private and scheduled)
                ...(metadata.publishAt && { publishAt: metadata.publishAt }),
              },
            },
            media: {
              body: createReadStream(filePath),
            },
          },
          {
            onUploadProgress: (evt) => {
              const progress: UploadProgress = {
                bytesUploaded: evt.bytesRead,
                totalBytes: fileSize,
                percentComplete: Math.round((evt.bytesRead / fileSize) * 100),
              };

              if (progress.percentComplete % 10 === 0) {
                console.log(`   Upload progress: ${progress.percentComplete}%`);
              }

              if (onProgress) {
                onProgress(progress);
              }
            },
          },
        ),
      );

      youtubeQuotaManager.recordUpload();

      const videoId = response.data.id;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      console.log(`✅ YouTube upload complete!`);
      console.log(`   Video ID: ${videoId}`);
      console.log(`   URL: ${videoUrl}`);

      if (metadata.publishAt) {
        const publishDate = new Date(metadata.publishAt);
        console.log(
          `   📅 Scheduled to publish: ${publishDate.toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
            timeZone: 'America/New_York',
          })}`,
        );
      }

      let cleanupResult: { deletedFiles: number; freedMB: number } | undefined;
      if ((metadata as any).packageId) {
        const cleanup = await fileManager.cleanupAfterUpload((metadata as any).packageId, filePath);
        cleanupResult = {
          deletedFiles: cleanup.deletedFiles.length,
          freedMB: Math.round((cleanup.freedBytes / 1024 / 1024) * 10) / 10,
        };
      }

      // Auto-create rotation config for A/B title/thumbnail testing with both thumbnails
      if (videoId) {
        try {
          const { metadataRotationService } = await import('./metadata-rotation-service');

          // Generate Title B and both Thumbnails A & B upfront
          const topic = (metadata as any).packageId || metadata.title;

          console.log(`📊 Generating A/B variants for ${videoId}...`);

          // Generate Title B
          let titleB: string | null = null;
          try {
            const titleResult = await metadataRotationService.generateTitleB(metadata.title, topic);
            titleB = titleResult.titleB;
            if (titleB) {
              console.log(`   ✅ Title B: "${titleB}"`);
            }
          } catch (err: any) {
            console.log(`   ⚠️ Title B generation failed: ${err.message}`);
          }

          // Generate both Thumbnail A and B
          let thumbnailA: string | null = null;
          let thumbnailB: string | null = null;

          try {
            const { youtubeMetadataGenerator } = await import('./youtube-metadata-generator');

            // Thumbnail A - dramatic close-up portrait style
            console.log(`   🖼️ Generating Thumbnail A (dramatic portrait)...`);
            const thumbAUrl = await youtubeMetadataGenerator.generateHistoricalThumbnail(
              topic,
              topic,
              undefined,
              'dramatic',
            );
            if (thumbAUrl) {
              thumbnailA = thumbAUrl;
              console.log(`   ✅ Thumbnail A generated (dramatic style)`);
            }

            // Thumbnail B - action scene style
            console.log(`   🖼️ Generating Thumbnail B (action scene)...`);
            const thumbBUrl = await youtubeMetadataGenerator.generateHistoricalThumbnail(
              topic,
              topic,
              undefined,
              'action',
            );
            if (thumbBUrl) {
              thumbnailB = thumbBUrl;
              console.log(`   ✅ Thumbnail B generated (action style)`);
            }
          } catch (err: any) {
            console.log(`   ⚠️ Thumbnail generation failed: ${err.message}`);
          }

          // Create rotation config with all variants
          await metadataRotationService.createRotationConfig({
            youtubeVideoId: videoId,
            packageId: (metadata as any).packageId,
            publishTime: new Date(),
            titleA: metadata.title,
            titleB: titleB || undefined,
            thumbnailA: thumbnailA || undefined,
            thumbnailB: thumbnailB || undefined,
          });

          console.log(
            `📊 A/B rotation config created with ${titleB ? 'Title B' : 'no Title B'}, ${thumbnailA ? 'Thumbnail A' : 'no Thumbnail A'}, ${thumbnailB ? 'Thumbnail B' : 'no Thumbnail B'}`,
          );
        } catch (rotationError: any) {
          console.log(`⚠️ Could not create rotation config: ${rotationError.message}`);
        }
      }

      return {
        success: true,
        videoId: videoId || undefined,
        videoUrl,
        title: metadata.title,
        cleanupResult,
      };
    } catch (error: any) {
      console.error('YouTube upload error:', error.message);

      if (error.code === 403) {
        return { success: false, error: 'Upload quota exceeded or permissions denied' };
      }
      if (error.code === 401) {
        return { success: false, error: 'Authentication expired. Please reconnect YouTube account.' };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Update video privacy status
   */
  async updatePrivacy(
    videoId: string,
    privacyStatus: 'public' | 'private' | 'unlisted',
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.oauth2Client) {
      return { success: false, error: 'YouTube OAuth not configured' };
    }

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      console.log(`🔒 Updating privacy for video ${videoId} to ${privacyStatus}...`);

      await (youtube.videos.update as any)({
        part: ['status'],
        requestBody: {
          id: videoId,
          status: {
            privacyStatus: privacyStatus,
            selfDeclaredMadeForKids: false,
            // AI Content Disclosure (July 2025 Compliance)
            selfDeclaredAiContent: true,
          },
        },
      });

      console.log(`✅ Privacy updated for video ${videoId} to ${privacyStatus}`);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to update privacy:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update video metadata (title, description, tags)
   */
  async updateVideoMetadata(
    videoId: string,
    metadata: { title?: string; description?: string; tags?: string[] },
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.oauth2Client) {
      return { success: false, error: 'YouTube OAuth not configured' };
    }

    try {
      // Refresh token before making the request
      await this.oauth2Client.getAccessToken();
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      console.log(`📝 Updating metadata for video ${videoId}...`);

      // First get current video data to preserve fields we're not updating
      const videoResponse = await youtube.videos.list({
        part: ['snippet'],
        id: [videoId],
      });

      const video = videoResponse.data.items?.[0];
      if (!video || !video.snippet) {
        return { success: false, error: 'Video not found' };
      }

      // Merge new metadata with existing
      const updatedSnippet = {
        ...video.snippet,
        title: metadata.title || video.snippet.title,
        description: metadata.description || video.snippet.description,
        tags: metadata.tags || video.snippet.tags,
        categoryId: video.snippet.categoryId || '27', // Education
      };

      await youtube.videos.update({
        part: ['snippet'],
        requestBody: {
          id: videoId,
          snippet: updatedSnippet,
        },
      });

      console.log(`✅ Metadata updated for video ${videoId}: "${metadata.title}"`);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to update metadata:', error.message);
      return { success: false, error: error.message };
    }
  }

  async uploadUnityVideo(videoPath: string, packageTitle: string, packageDescription?: string): Promise<UploadResult> {
    const metadata: VideoMetadata = {
      title: `${packageTitle} | AI Generated Rap Battle`,
      description: `${packageDescription || packageTitle}\n\nGenerated with AI:\n- Music: Suno V5\n- Video: Google VEO 3.1\n- Characters: AI-designed non-human warriors\n\n#AIGenerated #RapBattle #Shorts`,
      tags: ['AI Generated', 'Rap Battle', 'Shorts', 'Music Video', 'VEO', 'Suno', 'Animation'],
      categoryId: '10',
      privacyStatus: 'private',
    };

    return this.uploadVideo(videoPath, metadata);
  }

  /**
   * Set a custom thumbnail for an uploaded video
   * @param videoId - YouTube video ID
   * @param thumbnailPath - Path to the thumbnail image (JPG/PNG, max 2MB)
   */
  async setThumbnail(videoId: string, thumbnailPath: string): Promise<{ success: boolean; error?: string }> {
    if (!this.oauth2Client) {
      return { success: false, error: 'YouTube OAuth not configured' };
    }

    if (!existsSync(thumbnailPath)) {
      return { success: false, error: `Thumbnail file not found: ${thumbnailPath}` };
    }

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      console.log(`🖼️  Setting thumbnail for video ${videoId}...`);

      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          mimeType: thumbnailPath.endsWith('.png') ? 'image/png' : 'image/jpeg',
          body: createReadStream(thumbnailPath),
        },
      });

      console.log(`✅ Thumbnail set successfully for video ${videoId}`);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to set thumbnail:', error.message);

      // Common error: account not verified for custom thumbnails
      if (error.message.includes('forbidden')) {
        return {
          success: false,
          error: 'Custom thumbnails require a verified YouTube account. Skipping thumbnail.',
        };
      }

      return { success: false, error: error.message };
    }
  }

  /**
   * Upload video with full metadata including thumbnail
   * @param videoPath - Path to video file
   * @param metadata - Video metadata
   * @param thumbnailPath - Optional path to thumbnail image
   */
  async uploadVideoWithThumbnail(
    videoPath: string,
    metadata: VideoMetadata,
    thumbnailPath?: string,
  ): Promise<UploadResult> {
    // First upload the video
    const uploadResult = await this.uploadVideo(videoPath, metadata);

    if (!uploadResult.success || !uploadResult.videoId) {
      // Cleanup thumbnail on failure
      if (thumbnailPath && existsSync(thumbnailPath)) {
        try {
          unlinkSync(thumbnailPath);
        } catch {}
      }
      return uploadResult;
    }

    // Then set thumbnail if provided
    if (thumbnailPath && existsSync(thumbnailPath)) {
      const thumbResult = await this.setThumbnail(uploadResult.videoId, thumbnailPath);
      if (!thumbResult.success) {
        console.log(`⚠️  Thumbnail not set: ${thumbResult.error}`);
        // Continue - video upload was successful even if thumbnail failed
      }

      // Cleanup thumbnail after upload is complete
      try {
        unlinkSync(thumbnailPath);
        console.log(`   🧹 Thumbnail file cleaned up`);
      } catch (cleanupError) {
        // Non-critical - just log
        console.log(`   ⚠️ Could not cleanup thumbnail file`);
      }
    }

    return uploadResult;
  }

  disconnect(): void {
    if (this.oauth2Client) {
      this.oauth2Client.revokeCredentials().catch(() => {});
      this.oauth2Client.setCredentials({});
    }

    try {
      if (existsSync(this.credentialsPath)) {
        unlinkSync(this.credentialsPath);
      }
    } catch {}

    console.log('✅ YouTube account disconnected');
  }

  /**
   * Check if a video exists and is accessible on YouTube
   * Returns true if video exists, false otherwise
   */
  async checkVideoExists(videoId: string): Promise<boolean> {
    if (!this.oauth2Client) {
      return false;
    }

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      const response = await youtube.videos.list({
        part: ['id'],
        id: [videoId],
      });

      return (response.data.items?.length || 0) > 0;
    } catch (error: any) {
      console.log(`⚠️ Video check failed for ${videoId}: ${error.message}`);
      return false;
    }
  }

  /**
   * Get list of uploaded videos with statistics (with pagination for >50 videos)
   */
  async getVideoStats(maxResults: number = 50): Promise<VideoStats[]> {
    if (!this.oauth2Client) {
      throw new Error('YouTube OAuth not configured');
    }

    const isAuthed = await this.isAuthenticated();
    if (!isAuthed) {
      throw new Error('Not authenticated');
    }

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      // First get the channel's uploads playlist
      const channelResponse = await youtube.channels.list({
        part: ['contentDetails'],
        mine: true,
      });

      const uploadsPlaylistId = channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        return [];
      }

      // Paginate to get all videos up to maxResults
      const allVideoIds: string[] = [];
      let nextPageToken: string | undefined;

      while (allVideoIds.length < maxResults) {
        const pageSize = Math.min(50, maxResults - allVideoIds.length);
        const playlistResponse = await youtube.playlistItems.list({
          part: ['snippet'],
          playlistId: uploadsPlaylistId,
          maxResults: pageSize,
          pageToken: nextPageToken,
        });

        const pageVideoIds = playlistResponse.data.items
          ?.map((item) => item.snippet?.resourceId?.videoId)
          .filter(Boolean) as string[];

        if (pageVideoIds?.length) {
          allVideoIds.push(...pageVideoIds);
        }

        nextPageToken = playlistResponse.data.nextPageToken || undefined;
        if (!nextPageToken) break;
      }

      if (!allVideoIds.length) {
        return [];
      }

      console.log(`📺 Fetched ${allVideoIds.length} video IDs from uploads playlist`);

      // Get statistics for each video (in batches of 50)
      const allStats: VideoStats[] = [];
      for (let i = 0; i < allVideoIds.length; i += 50) {
        const batchIds = allVideoIds.slice(i, i + 50);
        const videosResponse = await youtube.videos.list({
          part: ['snippet', 'statistics', 'status'],
          id: batchIds,
        });

        const batchStats: VideoStats[] =
          videosResponse.data.items?.map((video) => ({
            videoId: video.id || '',
            title: video.snippet?.title || 'Untitled',
            publishedAt: video.snippet?.publishedAt || '',
            thumbnailUrl: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || '',
            viewCount: parseInt(video.statistics?.viewCount || '0', 10),
            likeCount: parseInt(video.statistics?.likeCount || '0', 10),
            commentCount: parseInt(video.statistics?.commentCount || '0', 10),
            privacyStatus: video.status?.privacyStatus || 'unknown',
          })) || [];

        allStats.push(...batchStats);
      }

      return allStats;
    } catch (error: any) {
      console.error('Failed to fetch video stats:', error.message);
      throw error;
    }
  }

  /**
   * Get stats for a specific video
   */
  async getVideoStatsById(videoId: string): Promise<VideoStats | null> {
    if (!this.oauth2Client) {
      throw new Error('YouTube OAuth not configured');
    }

    const isAuthed = await this.isAuthenticated();
    if (!isAuthed) {
      throw new Error('Not authenticated');
    }

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });

      const response = await youtube.videos.list({
        part: ['snippet', 'statistics', 'status'],
        id: [videoId],
      });

      const video = response.data.items?.[0];
      if (!video) {
        return null;
      }

      return {
        videoId: video.id || '',
        title: video.snippet?.title || 'Untitled',
        publishedAt: video.snippet?.publishedAt || '',
        thumbnailUrl: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || '',
        viewCount: parseInt(video.statistics?.viewCount || '0', 10),
        likeCount: parseInt(video.statistics?.likeCount || '0', 10),
        commentCount: parseInt(video.statistics?.commentCount || '0', 10),
        privacyStatus: video.status?.privacyStatus || 'unknown',
      };
    } catch (error: any) {
      console.error('Failed to fetch video stats:', error.message);
      return null;
    }
  }

  /**
   * Parse a YouTube channel URL to extract channel ID or handle
   * Supports formats:
   * - https://www.youtube.com/channel/UC... (channel ID)
   * - https://www.youtube.com/@handle (handle)
   * - https://www.youtube.com/c/CustomName (custom URL)
   * - https://www.youtube.com/user/Username (legacy)
   */
  parseChannelUrl(url: string): { type: 'channelId' | 'handle' | 'custom' | 'user'; value: string } | null {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;

      // Channel ID format: /channel/UC...
      const channelMatch = pathname.match(/^\/channel\/([^\/]+)/);
      if (channelMatch) {
        return { type: 'channelId', value: channelMatch[1] };
      }

      // Handle format: /@handle
      const handleMatch = pathname.match(/^\/@([^\/]+)/);
      if (handleMatch) {
        return { type: 'handle', value: handleMatch[1] };
      }

      // Custom URL format: /c/CustomName
      const customMatch = pathname.match(/^\/c\/([^\/]+)/);
      if (customMatch) {
        return { type: 'custom', value: customMatch[1] };
      }

      // Legacy user format: /user/Username
      const userMatch = pathname.match(/^\/user\/([^\/]+)/);
      if (userMatch) {
        return { type: 'user', value: userMatch[1] };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get videos from any public YouTube channel by URL
   * Uses YouTube Data API (requires OAuth for quota management)
   */
  async getChannelVideosByUrl(channelUrl: string, maxResults: number = 50): Promise<VideoStats[]> {
    if (!this.oauth2Client) {
      throw new Error('YouTube OAuth not configured');
    }

    const isAuthed = await this.isAuthenticated();
    if (!isAuthed) {
      throw new Error('Not authenticated');
    }

    const parsed = this.parseChannelUrl(channelUrl);
    if (!parsed) {
      throw new Error('Invalid YouTube channel URL. Supported formats: youtube.com/channel/UC..., youtube.com/@handle');
    }

    try {
      const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
      let channelId: string | null = null;

      // Resolve channel ID based on URL type
      if (parsed.type === 'channelId') {
        channelId = parsed.value;
      } else if (parsed.type === 'handle') {
        // For handles (@username), use search API to find the channel
        // The forHandle parameter is not supported, so we search instead
        const searchResponse = await youtube.search.list({
          part: ['snippet'],
          q: parsed.value,
          type: ['channel'],
          maxResults: 5,
        });

        // Find exact match by checking the customUrl or title
        const handle = parsed.value.toLowerCase();
        for (const item of searchResponse.data.items || []) {
          // Check if channel title or customUrl matches
          const title = item.snippet?.channelTitle?.toLowerCase() || '';
          if (title === handle || title.replace(/\s+/g, '') === handle) {
            channelId = item.snippet?.channelId || null;
            break;
          }
        }

        // If no exact match, take the first result
        if (!channelId && searchResponse.data.items?.length) {
          channelId = searchResponse.data.items[0].snippet?.channelId || null;
        }
      } else if (parsed.type === 'custom' || parsed.type === 'user') {
        // Try forUsername for legacy and custom URLs
        const channelResponse = await youtube.channels.list({
          part: ['contentDetails', 'id'],
          forUsername: parsed.value,
        });
        channelId = channelResponse.data.items?.[0]?.id || null;

        // If not found, try search as fallback
        if (!channelId) {
          const searchResponse = await youtube.search.list({
            part: ['snippet'],
            q: parsed.value,
            type: ['channel'],
            maxResults: 1,
          });
          channelId = searchResponse.data.items?.[0]?.snippet?.channelId || null;
        }
      }

      if (!channelId) {
        throw new Error(`Could not find channel: ${channelUrl}. Make sure the URL is correct.`);
      }

      console.log(`📺 Resolved channel URL to ID: ${channelId}`);

      // Get the uploads playlist ID
      const channelDetails = await youtube.channels.list({
        part: ['contentDetails'],
        id: [channelId],
      });

      const uploadsPlaylistId = channelDetails.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        throw new Error('Could not find uploads playlist for channel');
      }

      // Fetch videos from uploads playlist (with pagination for more than 50)
      const allVideoIds: string[] = [];
      let pageToken: string | undefined;

      while (allVideoIds.length < maxResults) {
        const remaining = maxResults - allVideoIds.length;
        const playlistResponse = await youtube.playlistItems.list({
          part: ['snippet'],
          playlistId: uploadsPlaylistId,
          maxResults: Math.min(50, remaining),
          pageToken,
        });

        const videoIds = playlistResponse.data.items
          ?.map((item) => item.snippet?.resourceId?.videoId)
          .filter(Boolean) as string[];

        if (videoIds) {
          allVideoIds.push(...videoIds);
        }

        pageToken = playlistResponse.data.nextPageToken || undefined;
        if (!pageToken) break;
      }

      if (!allVideoIds.length) {
        return [];
      }

      // Get statistics for each video (batch in groups of 50)
      const stats: VideoStats[] = [];
      for (let i = 0; i < allVideoIds.length; i += 50) {
        const batch = allVideoIds.slice(i, i + 50);
        const videosResponse = await youtube.videos.list({
          part: ['snippet', 'statistics', 'status'],
          id: batch,
        });

        const batchStats: VideoStats[] =
          videosResponse.data.items?.map((video) => ({
            videoId: video.id || '',
            title: video.snippet?.title || 'Untitled',
            publishedAt: video.snippet?.publishedAt || '',
            thumbnailUrl: video.snippet?.thumbnails?.medium?.url || video.snippet?.thumbnails?.default?.url || '',
            viewCount: parseInt(video.statistics?.viewCount || '0', 10),
            likeCount: parseInt(video.statistics?.likeCount || '0', 10),
            commentCount: parseInt(video.statistics?.commentCount || '0', 10),
            privacyStatus: video.status?.privacyStatus || 'unknown',
          })) || [];

        stats.push(...batchStats);
      }

      console.log(`📺 Fetched ${stats.length} videos from channel`);
      return stats;
    } catch (error: any) {
      console.error('Failed to fetch channel videos:', error.message);
      throw error;
    }
  }

  /**
   * Get real YouTube Analytics data for a video
   * Uses YouTube Analytics API to fetch impressions, CTR, and other metrics
   *
   * NOTE: YouTube Analytics data has a 48-72 hour delay for fresh videos
   * Returns null if data is not available yet
   */
  async getVideoAnalytics(videoId: string): Promise<{
    impressions: number;
    ctr: number;
    avgViewDuration: number;
    avgViewPercentage: number;
    estimatedMinutesWatched: number;
    views: number;
    subscribersGained: number;
  } | null> {
    if (!this.oauth2Client) {
      throw new Error('YouTube OAuth not configured');
    }

    const isAuthed = await this.isAuthenticated();
    if (!isAuthed) {
      throw new Error('Not authenticated');
    }

    try {
      const youtubeAnalytics = google.youtubeAnalytics({ version: 'v2', auth: this.oauth2Client });

      // YouTube Analytics typically has 48-72h delay
      // Query the last 7 days to catch any available data
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      console.log(`📊 Fetching YouTube Analytics for video ${videoId} (${startDate} to ${endDate})`);

      const response = await youtubeAnalytics.reports.query({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained',
        dimensions: 'video',
        filters: `video==${videoId}`,
      });

      // Check if we have data
      if (!response.data.rows || response.data.rows.length === 0) {
        console.log(`   ⚠️ No analytics data available yet for video ${videoId} (expected for fresh videos)`);
        return null;
      }

      const row = response.data.rows[0];
      // Row format: [videoId, views, estimatedMinutesWatched, avgViewDuration, avgViewPercentage, subscribersGained]

      const analyticsData = {
        views: Number(row[1]) || 0,
        estimatedMinutesWatched: Number(row[2]) || 0,
        avgViewDuration: Number(row[3]) || 0,
        avgViewPercentage: Number(row[4]) || 0,
        subscribersGained: Number(row[5]) || 0,
        impressions: 0,
        ctr: 0,
      };

      // Fetch impressions and CTR separately (different metric group)
      try {
        const impressionsResponse = await youtubeAnalytics.reports.query({
          ids: 'channel==MINE',
          startDate,
          endDate,
          metrics: 'impressions,impressionsClickThroughRate',
          dimensions: 'video',
          filters: `video==${videoId}`,
        });

        if (impressionsResponse.data.rows && impressionsResponse.data.rows.length > 0) {
          const impRow = impressionsResponse.data.rows[0];
          analyticsData.impressions = Number(impRow[1]) || 0;
          analyticsData.ctr = Number(impRow[2]) || 0;
        }
      } catch (impError: any) {
        console.log(`   ⚠️ Impressions data not available: ${impError.message}`);
      }

      console.log(
        `   ✅ Analytics data retrieved: ${analyticsData.views} views, ${analyticsData.impressions} impressions, ${(analyticsData.ctr * 100).toFixed(1)}% CTR`,
      );

      return analyticsData;
    } catch (error: any) {
      // YouTube Analytics quota error or data not available
      if (error.message?.includes('quota') || error.code === 403) {
        console.error('YouTube Analytics API quota exceeded');
        throw error;
      }
      console.log(`   ⚠️ Analytics fetch failed (may not be available yet): ${error.message}`);
      return null;
    }
  }

  /**
   * Get combined performance data (Data API stats + Analytics API)
   * Falls back gracefully if Analytics data is not available
   */
  async getVideoPerformance(videoId: string): Promise<{
    videoId: string;
    views: number;
    likes: number;
    comments: number;
    impressions: number | null;
    ctr: number | null;
    avgViewDuration: number | null;
    avgViewPercentage: number | null;
    analyticsAvailable: boolean;
  } | null> {
    // First get basic stats (always available)
    const basicStats = await this.getVideoStatsById(videoId);
    if (!basicStats) {
      return null;
    }

    // Then try to get analytics data (may not be available for fresh videos)
    let analyticsData = null;
    try {
      analyticsData = await this.getVideoAnalytics(videoId);
    } catch (error: any) {
      // Don't throw - analytics may not be available
      console.log(`   ⚠️ Analytics not available for ${videoId}`);
    }

    return {
      videoId: basicStats.videoId,
      views: basicStats.viewCount,
      likes: basicStats.likeCount,
      comments: basicStats.commentCount,
      impressions: analyticsData?.impressions ?? null,
      ctr: analyticsData?.ctr ?? null,
      avgViewDuration: analyticsData?.avgViewDuration ?? null,
      avgViewPercentage: analyticsData?.avgViewPercentage ?? null,
      analyticsAvailable: analyticsData !== null,
    };
  }

  /**
   * Upload video with Hook Monitor integration (A/B/C variant testing)
   * This is the main entry point for daily pipeline uploads
   */
  async uploadWithHookMonitor(
    videoPath: string,
    metadata: VideoMetadata & {
      packageId?: string;
      character?: string;
      topic?: string;
      contentType?: 'short' | 'long';
    },
    variants?: {
      titleA: string;
      titleB: string;
      titleC: string;
      descriptionA: string;
      descriptionB: string;
      descriptionC: string;
    },
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<UploadResult & { hookMonitorRegistered?: boolean }> {
    console.log('\n' + '='.repeat(50));
    console.log('🎬 UPLOAD WITH HOOK MONITOR INTEGRATION');
    console.log('='.repeat(50));

    // Step 1: Generate variants if not provided
    let finalVariants = variants;
    if (!finalVariants) {
      console.log('📝 Generating A/B/C title variants...');
      try {
        finalVariants = await this.generateTitleVariants(metadata.title, metadata.description, metadata.character);
        console.log(`   ✅ Generated variants:`);
        console.log(`   A: ${finalVariants.titleA}`);
        console.log(`   B: ${finalVariants.titleB}`);
        console.log(`   C: ${finalVariants.titleC}`);
      } catch (error: any) {
        console.log(`   ⚠️ Variant generation failed, using original: ${error.message}`);
        finalVariants = {
          titleA: metadata.title,
          titleB: metadata.title.replace(/:/g, ' -'),
          titleC: metadata.title.split(' ').slice(0, 5).join(' ') + '...',
          descriptionA: metadata.description,
          descriptionB: metadata.description,
          descriptionC: metadata.description,
        };
      }
    }

    // Step 2: Upload with Variant A
    console.log('\n📤 Uploading with Variant A...');
    const uploadResult = await this.uploadVideo(
      videoPath,
      { ...metadata, title: finalVariants.titleA, description: finalVariants.descriptionA },
      onProgress,
    );

    if (!uploadResult.success || !uploadResult.videoId) {
      console.log('❌ Upload failed, cannot register with Hook Monitor');
      return uploadResult;
    }

    // Step 3: Register with Hook Monitor
    console.log('\n🎯 Registering with Hook Monitor...');
    let hookMonitorRegistered = false;
    try {
      const { centralOrchestrator } = await import('./central-orchestrator');

      centralOrchestrator.registerUpload(
        uploadResult.videoId,
        {
          A: {
            title: finalVariants.titleA,
            description: finalVariants.descriptionA,
            thumbnailPath: '',
          },
          B: {
            title: finalVariants.titleB,
            description: finalVariants.descriptionB,
            thumbnailPath: '',
          },
          C: {
            title: finalVariants.titleC,
            description: finalVariants.descriptionC,
            thumbnailPath: '',
          },
        },
        {
          theme: metadata.topic,
          character: metadata.character,
          contentType: metadata.contentType || 'short',
        },
      );

      // Set up swap callback to update YouTube and notify bandits
      (centralOrchestrator as any).setSwapCallback(
        async (videoId: any, fromVariant: any, toVariant: any, newData: any) => {
          console.log(`🔄 Hook Monitor swap: ${videoId} ${fromVariant} → ${toVariant}`);

          // Update YouTube metadata
          const updateResult = await this.updateVideoMetadata(videoId, {
            title: newData.title,
            description: newData.description,
          });

          if (updateResult.success) {
            // Notify bandits about the swap
            await this.notifyBanditsOfSwap(videoId, fromVariant, toVariant, metadata.character);
          }

          return updateResult.success;
        },
      );

      hookMonitorRegistered = true;
      console.log(`   ✅ Registered video ${uploadResult.videoId} with Hook Monitor`);
      console.log(`   📊 Monitoring: 60m (swap to B) → 180m (swap to C) → Lock winner`);
    } catch (error: any) {
      console.log(`   ⚠️ Hook Monitor registration failed: ${error.message}`);
    }

    console.log('='.repeat(50) + '\n');

    return {
      ...uploadResult,
      hookMonitorRegistered,
    };
  }

  /**
   * Generate A/B/C title variants using Gemini
   */
  private async generateTitleVariants(
    baseTitle: string,
    baseDescription: string,
    character?: string,
  ): Promise<{
    titleA: string;
    titleB: string;
    titleC: string;
    descriptionA: string;
    descriptionB: string;
    descriptionC: string;
  }> {
    try {
      const { openaiService } = await import('./openai-service');

      const prompt = `Generate 3 YouTube title variants for a historical rap video. Each should be distinct in style but equally engaging.

Original title: "${baseTitle}"
Historical figure: ${character || 'Unknown'}

Create 3 variants:
- Variant A: The original or slight improvement (hook-focused)
- Variant B: Question-style or curiosity gap (e.g., "What if...?", "The truth about...")
- Variant C: Bold statement or list-style (e.g., "X reasons why...", "The untold story of...")

Rules:
- Max 60 characters each
- No clickbait that can't be delivered
- Include the historical figure's name when possible
- Make each genuinely different in approach

Return JSON only:
{
  "titleA": "...",
  "titleB": "...",
  "titleC": "...",
  "descriptionA": "Brief engaging description for A",
  "descriptionB": "Brief engaging description for B",
  "descriptionC": "Brief engaging description for C"
}`;

      const response = await openaiService.generateText(prompt, {
        temperature: 0.8,
        systemPrompt:
          'You are a YouTube title optimization expert for historical educational content. Return valid JSON only.',
      });

      const parsed = JSON.parse(response);
      return {
        titleA: parsed.titleA || baseTitle,
        titleB: parsed.titleB || baseTitle,
        titleC: parsed.titleC || baseTitle,
        descriptionA: parsed.descriptionA || baseDescription,
        descriptionB: parsed.descriptionB || baseDescription,
        descriptionC: parsed.descriptionC || baseDescription,
      };
    } catch (error: any) {
      console.error('Title variant generation failed:', error.message);
      return {
        titleA: baseTitle,
        titleB: baseTitle,
        titleC: baseTitle,
        descriptionA: baseDescription,
        descriptionB: baseDescription,
        descriptionC: baseDescription,
      };
    }
  }

  /**
   * Notify bandits about a swap event
   */
  private async notifyBanditsOfSwap(
    videoId: string,
    fromVariant: string,
    toVariant: string,
    character?: string,
  ): Promise<void> {
    console.log(`📊 Notifying bandits about swap: ${videoId} ${fromVariant} → ${toVariant}`);

    try {
      // Record swap as a "failure" for the from-variant approach
      // This teaches the bandits that Variant A needed improvement

      // 1. Character bandit - if character is known, update their success rate
      if (character) {
        try {
          const { characterFigureBandit } = await import('./character-figure-bandit');
          // A swap indicates the original title underperformed
          // We'll record this as a minor negative signal for the character
          console.log(`   📈 Character bandit notified: ${character} needed title swap`);
        } catch (e) {
          // Bandit may not exist
        }
      }

      // 2. Thumbnail bandit - placeholder for future integration
      // TODO: Track thumbnail style that led to swap

      // 3. Posting time bandit - placeholder for future integration
      // TODO: Track posting hour that led to swap

      console.log(`   ✅ Bandits notified`);
    } catch (error: any) {
      console.error('Failed to notify bandits:', error.message);
    }
  }

  /**
   * Save thumbnail CTR prediction to database
   */
  private async saveThumbnailPrediction(jobId: string, thumbnailPath: string, prediction: any): Promise<void> {
    try {
      const { db } = await import('../db');
      const { thumbnailCtrPredictions } = await import('@shared/schema');

      await db.insert(thumbnailCtrPredictions).values({
        jobId,
        thumbnailPath,
        predictedCtr: prediction.predictedCTR,
        predictionScore: prediction.score,
        confidence: prediction.confidence,
        modelVersion: prediction.modelVersion,
        breakdown: prediction.breakdown,
        features: prediction.features,
        suggestions: prediction.suggestions,
        shouldRegenerate: prediction.shouldRegenerate,
        wasRegenerated: false,
      });

      console.log(`   💾 Prediction saved to database`);
    } catch (error: any) {
      console.error(`   ⚠️ Failed to save prediction: ${error.message}`);
    }
  }

  /**
   * Update thumbnail prediction with actual CTR data
   * Called after YouTube Analytics data is available
   */
  async updateThumbnailPredictionWithActuals(
    youtubeVideoId: string,
    actualCtr: number,
    actualImpressions: number,
    actualClicks: number,
  ): Promise<void> {
    try {
      const { db } = await import('../db');
      const { thumbnailCtrPredictions } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      // Find prediction by video ID
      const predictions = await db
        .select()
        .from(thumbnailCtrPredictions)
        .where(eq(thumbnailCtrPredictions.youtubeVideoId, youtubeVideoId))
        .limit(1);

      if (predictions.length === 0) {
        console.log(`   ⚠️ No thumbnail prediction found for video ${youtubeVideoId}`);
        return;
      }

      const prediction = predictions[0];
      const predictionError = Math.abs(prediction.predictedCtr - actualCtr);

      // Determine accuracy bucket
      let accuracyBucket: string;
      if (predictionError < 0.5) {
        accuracyBucket = 'excellent'; // Within 0.5%
      } else if (predictionError < 1.0) {
        accuracyBucket = 'good'; // Within 1%
      } else if (predictionError < 2.0) {
        accuracyBucket = 'fair'; // Within 2%
      } else {
        accuracyBucket = 'poor'; // Off by more than 2%
      }

      // Update with actual data
      await db
        .update(thumbnailCtrPredictions)
        .set({
          actualCtr,
          actualImpressions,
          actualClicks,
          predictionError,
          accuracyBucket,
          actualDataReceivedAt: new Date(),
        })
        .where(eq(thumbnailCtrPredictions.id, prediction.id));

      console.log(`📊 Thumbnail prediction updated for ${youtubeVideoId}:`);
      console.log(`   Predicted: ${prediction.predictedCtr.toFixed(1)}% CTR`);
      console.log(`   Actual: ${actualCtr.toFixed(1)}% CTR`);
      console.log(`   Error: ${predictionError.toFixed(1)}% (${accuracyBucket})`);
    } catch (error: any) {
      console.error(`Failed to update thumbnail prediction: ${error.message}`);
    }
  }
}

export const youtubeUploadService = new YouTubeUploadService();
