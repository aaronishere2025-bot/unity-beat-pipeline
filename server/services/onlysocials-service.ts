/**
 * OnlySocials Service - Cross-posting to all social media platforms
 *
 * API Documentation: https://api.onlysocial.io/
 * Supports: Instagram, TikTok, Facebook, Twitter/X, LinkedIn, YouTube, Pinterest, Reddit, Mastodon
 */

import FormData from 'form-data';
import { createReadStream, statSync } from 'fs';
import { basename } from 'path';

export interface OnlySocialsConfig {
  workspaceUuid: string;
  accessToken: string;
  baseUrl?: string;
}

export interface MediaUploadResult {
  id: number;
  uuid: string;
  name: string;
  mime_type: string;
  type: 'image' | 'video';
  url: string;
  thumb_url: string;
  is_video: boolean;
  created_at: string;
}

export interface PostAccount {
  accountId: string;
  platformType?:
    | 'instagram'
    | 'tiktok'
    | 'facebook'
    | 'twitter'
    | 'linkedin'
    | 'youtube'
    | 'pinterest'
    | 'reddit'
    | 'mastodon';
}

export interface PostOptions {
  caption: string;
  mediaUuids: string[];
  accounts: PostAccount[];

  // Scheduling
  scheduleTime?: Date;

  // Instagram-specific
  instagramType?: 'post' | 'reel' | 'story';
  instagramCollaborators?: string[];

  // TikTok-specific
  tiktokPrivacy?: 'public' | 'friends' | 'private';
  tiktokAllowComments?: boolean;
  tiktokAllowDuet?: boolean;
  tiktokAllowStitch?: boolean;

  // YouTube-specific
  youtubeTitle?: string;
  youtubeVisibility?: 'public' | 'unlisted' | 'private';

  // Tags
  tags?: string[];

  // Short link provider
  shortLinkProvider?: string;
}

export interface PostResult {
  id: number;
  uuid: string;
  name: string;
  hex_color: string;
}

class OnlySocialsService {
  private config: OnlySocialsConfig | null = null;

  /**
   * Initialize with workspace UUID and access token
   */
  initialize(config: OnlySocialsConfig): void {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || 'https://app.onlysocial.io/os/api',
    };
    console.log(`✅ OnlySocials initialized for workspace: ${config.workspaceUuid}`);
  }

  /**
   * Check if service is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Get current config
   */
  getConfig(): OnlySocialsConfig | null {
    return this.config;
  }

  /**
   * Upload a media file (video or image)
   */
  async uploadMedia(filePath: string, altText?: string): Promise<MediaUploadResult> {
    if (!this.config) {
      throw new Error('OnlySocials not configured. Call initialize() first.');
    }

    const url = `${this.config.baseUrl}/${this.config.workspaceUuid}/media`;

    // Check file exists and get size
    const stats = statSync(filePath);
    const fileSize = stats.size;
    const fileName = basename(filePath);

    console.log(`📤 Uploading to OnlySocials: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    // Create form data
    const formData = new FormData();
    formData.append('file', createReadStream(filePath), fileName);
    if (altText) {
      formData.append('alt_text', altText);
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          ...formData.getHeaders(),
        },
        body: formData as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OnlySocials upload failed (${response.status}): ${errorText}`);
      }

      const result: MediaUploadResult = await response.json();
      console.log(`✅ Media uploaded: ${result.uuid} (${result.is_video ? 'video' : 'image'})`);
      return result;
    } catch (error: any) {
      console.error('OnlySocials upload error:', error.message);
      throw error;
    }
  }

  /**
   * Create a post (publish immediately or schedule)
   */
  async createPost(options: PostOptions): Promise<PostResult> {
    if (!this.config) {
      throw new Error('OnlySocials not configured. Call initialize() first.');
    }

    const url = `${this.config.baseUrl}/${this.config.workspaceUuid}/posts`;

    // Build versions array (one per account)
    const versions = options.accounts.map((account) => {
      const version: any = {
        account_id: account.accountId,
        is_original: true,
        content: {
          body: options.caption,
          media: options.mediaUuids,
          url: '',
        },
      };

      // Platform-specific settings
      if (account.platformType === 'instagram') {
        if (options.instagramType === 'reel') {
          version.type = 'reel';
        }
        if (options.instagramCollaborators) {
          version.collaborators = options.instagramCollaborators;
        }
      }

      if (account.platformType === 'tiktok') {
        version.tiktok = {
          privacy_level: options.tiktokPrivacy || 'public',
          allow_comments: options.tiktokAllowComments !== false,
          allow_duet: options.tiktokAllowDuet !== false,
          allow_stitch: options.tiktokAllowStitch !== false,
        };
      }

      if (account.platformType === 'youtube') {
        version.youtube = {
          title: options.youtubeTitle || options.caption.substring(0, 100),
          visibility: options.youtubeVisibility || 'public',
        };
      }

      return version;
    });

    // Build request body
    const body: any = {
      accounts: options.accounts.map((a) => a.accountId),
      versions,
      tags: options.tags || [],
    };

    // Scheduling
    if (options.scheduleTime) {
      const scheduleDate = new Date(options.scheduleTime);
      body.date = scheduleDate.toISOString().split('T')[0]; // YYYY-MM-DD
      body.time = scheduleDate.toTimeString().split(' ')[0]; // HH:MM:SS
    } else {
      // Post now
      body.date = null;
      body.time = 'now';
    }

    console.log(`📤 Creating post to ${options.accounts.length} accounts...`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OnlySocials post creation failed (${response.status}): ${errorText}`);
      }

      const result: PostResult = await response.json();
      console.log(`✅ Post created: ${result.uuid}`);
      return result;
    } catch (error: any) {
      console.error('OnlySocials post creation error:', error.message);
      throw error;
    }
  }

  /**
   * Get list of connected accounts
   */
  async getAccounts(): Promise<any[]> {
    if (!this.config) {
      throw new Error('OnlySocials not configured. Call initialize() first.');
    }

    const url = `${this.config.baseUrl}/${this.config.workspaceUuid}/accounts`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch accounts (${response.status}): ${errorText}`);
      }

      const accounts = await response.json();
      console.log(`✅ Found ${accounts.length} connected accounts`);
      return accounts;
    } catch (error: any) {
      console.error('OnlySocials accounts fetch error:', error.message);
      throw error;
    }
  }

  /**
   * Cross-post a video to all configured platforms
   * Convenience method that uploads media and creates post in one call
   */
  async crossPostVideo(
    videoPath: string,
    caption: string,
    accounts: PostAccount[],
    options?: {
      scheduleTime?: Date;
      tags?: string[];
      instagramAsReel?: boolean;
      youtubeTitle?: string;
    },
  ): Promise<{ mediaResult: MediaUploadResult; postResult: PostResult }> {
    console.log(`\n🌐 [OnlySocials] Cross-posting video to ${accounts.length} platforms...`);

    // Step 1: Upload media
    const mediaResult = await this.uploadMedia(videoPath, caption.substring(0, 200));

    // Step 2: Create post
    const postOptions: PostOptions = {
      caption,
      mediaUuids: [mediaResult.uuid],
      accounts,
      scheduleTime: options?.scheduleTime,
      tags: options?.tags,
      instagramType: options?.instagramAsReel ? 'reel' : 'post',
      youtubeTitle: options?.youtubeTitle,
    };

    const postResult = await this.createPost(postOptions);

    console.log(`✅ [OnlySocials] Cross-post complete!`);
    console.log(`   Media UUID: ${mediaResult.uuid}`);
    console.log(`   Post UUID: ${postResult.uuid}`);
    console.log(`   Platforms: ${accounts.map((a) => a.platformType).join(', ')}\n`);

    return { mediaResult, postResult };
  }
}

export const onlySocialsService = new OnlySocialsService();
