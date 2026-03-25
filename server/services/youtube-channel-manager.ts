/**
 * YouTube Channel Manager
 *
 * Manages multiple YouTube channels with automatic content routing.
 * Analyzes video content and picks the best channel to upload to.
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, createReadStream, statSync } from 'fs';
import { join } from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
];

export interface YouTubeChannel {
  id: string; // unique identifier (generated)
  name: string; // channel display name
  description: string; // what this channel is for
  youtubeChannelId?: string; // actual YouTube channel ID (after auth)
  youtubeChannelTitle?: string; // actual YouTube channel title
  contentTypes: string[]; // e.g., ['trap', 'drill', 'hip-hop']
  keywords: string[]; // matching keywords for routing
  isAuthenticated: boolean;
  createdAt: number;
  lastUsed?: number;
}

interface YouTubeCredentials {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  youtubeChannelId?: string;
  youtubeChannelTitle?: string;
}

interface UploadResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  channelId?: string;
  channelName?: string;
  error?: string;
}

interface VideoMetadata {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
  publishAt?: string; // ISO 8601 timestamp for scheduled publish
}

interface ContentAnalysis {
  genre?: string;
  style?: string;
  tags: string[];
  keywords: string[];
}

class YouTubeChannelManager {
  private channels: Map<string, YouTubeChannel> = new Map();
  private oauth2Clients: Map<string, OAuth2Client> = new Map();
  private channelsFile = join(process.cwd(), 'data', 'youtube_channels.json');
  private credentialsDir = join(process.cwd(), 'data', 'youtube_credentials');
  private isConfigured = false;

  constructor() {
    this.initializeManager();
  }

  private initializeManager(): void {
    const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
      console.log('⚠️ YouTube OAuth not configured - missing credentials');
      return;
    }

    // Ensure credentials directory exists
    if (!existsSync(this.credentialsDir)) {
      mkdirSync(this.credentialsDir, { recursive: true });
    }

    // Load saved channels
    this.loadChannels();

    // Initialize OAuth clients for authenticated channels
    for (const [channelId, channel] of this.channels) {
      const client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUri, // Use base redirect URI, channel ID passed via state parameter
      );
      this.oauth2Clients.set(channelId, client);
      this.loadCredentials(channelId);
    }

    this.isConfigured = true;
    console.log(`✅ YouTube Channel Manager initialized (${this.channels.size} channels)`);
  }

  private loadChannels(): void {
    try {
      if (existsSync(this.channelsFile)) {
        const data = readFileSync(this.channelsFile, 'utf-8');
        const channelsArray: YouTubeChannel[] = JSON.parse(data);

        for (const channel of channelsArray) {
          this.channels.set(channel.id, channel);
        }

        console.log(`   Loaded ${channelsArray.length} YouTube channels`);
      }
    } catch (error) {
      console.error('Failed to load channels:', error);
    }
  }

  private saveChannels(): void {
    try {
      const channelsArray = Array.from(this.channels.values());
      writeFileSync(this.channelsFile, JSON.stringify(channelsArray, null, 2));
    } catch (error) {
      console.error('Failed to save channels:', error);
    }
  }

  private loadCredentials(channelId: string): void {
    const credFile = join(this.credentialsDir, `${channelId}.json`);
    const client = this.oauth2Clients.get(channelId);
    const channel = this.channels.get(channelId);

    if (!client || !channel) return;

    try {
      if (existsSync(credFile)) {
        const data = readFileSync(credFile, 'utf-8');
        const credentials: YouTubeCredentials = JSON.parse(data);

        client.setCredentials({
          access_token: credentials.accessToken,
          refresh_token: credentials.refreshToken,
          expiry_date: credentials.expiryDate,
        });

        channel.isAuthenticated = true;
        channel.youtubeChannelId = credentials.youtubeChannelId;
        channel.youtubeChannelTitle = credentials.youtubeChannelTitle;

        console.log(`   ✅ ${channel.name} authenticated`);
      }
    } catch (error) {
      console.error(`Failed to load credentials for ${channelId}:`, error);
    }
  }

  private saveCredentials(channelId: string, credentials: YouTubeCredentials): void {
    const credFile = join(this.credentialsDir, `${channelId}.json`);

    try {
      writeFileSync(credFile, JSON.stringify(credentials, null, 2));
      console.log(`✅ Credentials saved for ${channelId}`);
    } catch (error) {
      console.error(`Failed to save credentials for ${channelId}:`, error);
    }
  }

  // Public API

  isEnabled(): boolean {
    return this.isConfigured;
  }

  getAllChannels(): YouTubeChannel[] {
    return Array.from(this.channels.values());
  }

  getChannel(channelId: string): YouTubeChannel | undefined {
    return this.channels.get(channelId);
  }

  addChannel(channel: Omit<YouTubeChannel, 'id' | 'isAuthenticated' | 'createdAt'>): YouTubeChannel {
    const id = `yt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newChannel: YouTubeChannel = {
      ...channel,
      id,
      isAuthenticated: false,
      createdAt: Date.now(),
    };

    this.channels.set(id, newChannel);
    this.saveChannels();

    // Initialize OAuth client for this channel
    const clientId = process.env.YOUTUBE_CLIENT_ID!;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI!;

    const client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri, // Use base redirect URI, channel ID passed via state parameter
    );
    this.oauth2Clients.set(id, client);

    console.log(`✅ Added channel: ${newChannel.name} (${id})`);
    return newChannel;
  }

  updateChannel(channelId: string, updates: Partial<YouTubeChannel>): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    Object.assign(channel, updates);
    this.saveChannels();

    return true;
  }

  deleteChannel(channelId: string): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    // Delete credentials file
    const credFile = join(this.credentialsDir, `${channelId}.json`);
    if (existsSync(credFile)) {
      unlinkSync(credFile);
    }

    this.channels.delete(channelId);
    this.oauth2Clients.delete(channelId);
    this.saveChannels();

    console.log(`✅ Deleted channel: ${channel.name}`);
    return true;
  }

  getAuthUrl(channelId: string): string {
    const client = this.oauth2Clients.get(channelId);
    if (!client) throw new Error(`Channel ${channelId} not found`);

    return client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: channelId, // Pass channel ID in state
    });
  }

  async handleCallback(code: string, channelId: string): Promise<void> {
    const client = this.oauth2Clients.get(channelId);
    const channel = this.channels.get(channelId);

    if (!client || !channel) {
      throw new Error(`Channel ${channelId} not found`);
    }

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get YouTube channel info
    const youtube = google.youtube({ version: 'v3', auth: client });
    const response = await youtube.channels.list({
      part: ['snippet'],
      mine: true,
    });

    const youtubeChannelId = response.data.items?.[0]?.id;
    const youtubeChannelTitle = response.data.items?.[0]?.snippet?.title;

    console.log(`✅ Authenticated: ${youtubeChannelTitle} (${youtubeChannelId})`);

    // Save credentials
    this.saveCredentials(channelId, {
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || '',
      expiryDate: tokens.expiry_date || 0,
      youtubeChannelId: youtubeChannelId ?? undefined,
      youtubeChannelTitle: youtubeChannelTitle ?? undefined,
    });

    // Update channel
    channel.isAuthenticated = true;
    channel.youtubeChannelId = youtubeChannelId ?? undefined;
    channel.youtubeChannelTitle = youtubeChannelTitle ?? undefined;
    channel.lastUsed = Date.now();
    this.saveChannels();
  }

  async disconnect(channelId: string): Promise<void> {
    const channel = this.channels.get(channelId);
    const client = this.oauth2Clients.get(channelId);

    if (!channel || !client) {
      throw new Error(`Channel ${channelId} not found`);
    }

    // Clear credentials
    client.setCredentials({});

    // Delete credentials file
    const credFile = join(this.credentialsDir, `${channelId}.json`);
    if (existsSync(credFile)) {
      unlinkSync(credFile);
    }

    // Update channel
    channel.isAuthenticated = false;
    delete channel.youtubeChannelId;
    delete channel.youtubeChannelTitle;
    this.saveChannels();

    console.log(`✅ Disconnected: ${channel.name}`);
  }

  /**
   * Smart content routing: analyze video and pick best channel
   */
  selectChannelForContent(analysis: ContentAnalysis): YouTubeChannel | null {
    const authenticatedChannels = Array.from(this.channels.values()).filter((ch) => ch.isAuthenticated);

    if (authenticatedChannels.length === 0) {
      console.log('⚠️ No authenticated channels available');
      return null;
    }

    if (authenticatedChannels.length === 1) {
      return authenticatedChannels[0];
    }

    // Score each channel based on content match
    const scores = authenticatedChannels.map((channel) => {
      let score = 0;

      // Match content types (genre, style)
      for (const contentType of channel.contentTypes) {
        if (analysis.genre?.toLowerCase().includes(contentType.toLowerCase())) {
          score += 10;
        }
        if (analysis.style?.toLowerCase().includes(contentType.toLowerCase())) {
          score += 10;
        }
        for (const tag of analysis.tags) {
          if (tag.toLowerCase().includes(contentType.toLowerCase())) {
            score += 5;
          }
        }
      }

      // Match keywords
      for (const keyword of channel.keywords) {
        const lowerKeyword = keyword.toLowerCase();

        for (const contentKeyword of analysis.keywords) {
          if (contentKeyword.toLowerCase().includes(lowerKeyword)) {
            score += 8;
          }
        }

        for (const tag of analysis.tags) {
          if (tag.toLowerCase().includes(lowerKeyword)) {
            score += 5;
          }
        }
      }

      // Boost recently used channels slightly (sticky routing)
      if (channel.lastUsed && Date.now() - channel.lastUsed < 24 * 60 * 60 * 1000) {
        score += 2;
      }

      return { channel, score };
    });

    // Sort by score
    scores.sort((a, b) => b.score - a.score);

    const best = scores[0];

    console.log(`🎯 Channel routing:`);
    console.log(`   Content: ${analysis.genre || 'unknown'} / ${analysis.style || 'unknown'}`);
    console.log(`   Selected: ${best.channel.name} (score: ${best.score})`);
    scores.forEach((s) => {
      console.log(`     - ${s.channel.name}: ${s.score}`);
    });

    return best.score > 0 ? best.channel : authenticatedChannels[0];
  }

  async uploadVideo(
    channelIdOrAuto: string | 'auto',
    videoPath: string,
    thumbnailPath: string | null,
    metadata: VideoMetadata,
    contentAnalysis?: ContentAnalysis,
    onProgress?: (progress: number) => void,
  ): Promise<UploadResult> {
    try {
      let channel: YouTubeChannel | null = null;

      if (channelIdOrAuto === 'auto') {
        if (!contentAnalysis) {
          throw new Error('Content analysis required for auto-routing');
        }
        channel = this.selectChannelForContent(contentAnalysis);
      } else {
        channel = this.channels.get(channelIdOrAuto) ?? null;
      }

      if (!channel) {
        throw new Error('No suitable channel found');
      }

      if (!channel.isAuthenticated) {
        throw new Error(`Channel ${channel.name} not authenticated`);
      }

      const client = this.oauth2Clients.get(channel.id);
      if (!client) {
        throw new Error(`OAuth client not found for ${channel.id}`);
      }

      const youtube = google.youtube({ version: 'v3', auth: client });

      console.log(`📤 Uploading to ${channel.name}...`);

      // Upload video
      const statusConfig: any = {
        privacyStatus: metadata.publishAt ? 'private' : metadata.privacyStatus || 'public',
        selfDeclaredMadeForKids: false,
      };

      // Add scheduled publish time if provided
      if (metadata.publishAt) {
        statusConfig.publishAt = metadata.publishAt;
        console.log(`⏰ Scheduling publish for: ${metadata.publishAt}`);
      }

      const response = await youtube.videos.insert(
        {
          part: ['snippet', 'status'],
          requestBody: {
            snippet: {
              title: metadata.title,
              description: metadata.description,
              tags: metadata.tags || [],
              categoryId: metadata.categoryId || '10', // Music
            },
            status: statusConfig,
          },
          media: {
            body: createReadStream(videoPath),
          },
        },
        {
          onUploadProgress: (evt) => {
            const progress = (evt.bytesRead / statSync(videoPath).size) * 100;
            if (onProgress) onProgress(Math.round(progress));
          },
        },
      );

      const videoId = response.data.id!;
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Upload thumbnail if provided
      if (thumbnailPath && existsSync(thumbnailPath)) {
        console.log('📸 Uploading thumbnail...');
        await youtube.thumbnails.set({
          videoId: videoId,
          media: {
            body: createReadStream(thumbnailPath),
          },
        });
      }

      // Update last used
      channel.lastUsed = Date.now();
      this.saveChannels();

      console.log(`✅ Uploaded to ${channel.name}: ${videoUrl}`);

      return {
        success: true,
        videoId,
        videoUrl,
        channelId: channel.id,
        channelName: channel.name,
      };
    } catch (error: any) {
      console.error(`❌ Upload failed:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Find which channel a video was uploaded to
   */
  async getChannelForVideo(videoId: string): Promise<string | null> {
    for (const channel of this.channels) {
      try {
        const auth = (this as any).getAuthClient((channel as any).id);
        const youtube = google.youtube({ version: 'v3', auth });

        const response = await youtube.videos.list({
          part: ['snippet'],
          id: [videoId],
        });

        if (response.data.items && response.data.items.length > 0) {
          return (channel as any).id;
        }
      } catch (error) {
        // Video not found on this channel, continue checking
        continue;
      }
    }
    return null;
  }

  /**
   * Update video metadata (title, description, tags)
   */
  async updateVideoMetadata(
    channelId: string,
    videoId: string,
    updates: {
      title?: string;
      description?: string;
      tags?: string[];
      categoryId?: string;
    },
  ): Promise<void> {
    const auth = (this as any).getAuthClient(channelId);
    const youtube = google.youtube({ version: 'v3', auth });

    // First, get current video data
    const currentVideo = await youtube.videos.list({
      part: ['snippet'],
      id: [videoId],
    });

    if (!currentVideo.data.items || currentVideo.data.items.length === 0) {
      throw new Error(`Video ${videoId} not found`);
    }

    const currentSnippet = currentVideo.data.items[0].snippet!;

    // Update with new values (keeping existing if not provided)
    await youtube.videos.update({
      part: ['snippet'],
      requestBody: {
        id: videoId,
        snippet: {
          title: updates.title || currentSnippet.title,
          description: updates.description || currentSnippet.description,
          tags: updates.tags || currentSnippet.tags,
          categoryId: updates.categoryId || currentSnippet.categoryId,
        },
      },
    });
  }
}

export const youtubeChannelManager = new YouTubeChannelManager();
export type { ContentAnalysis, UploadResult, VideoMetadata };
