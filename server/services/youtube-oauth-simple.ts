/**
 * Simple YouTube OAuth - Just connect channels
 * System auto-detects content type from channel name/description
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { existsSync, readFileSync, writeFileSync, mkdirSync, createReadStream } from 'fs';
import { join } from 'path';
import { youtubeChannelBandit } from './youtube-channel-bandit';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
];

interface ConnectedChannel {
  id: string; // our internal ID
  channelId: string; // YouTube channel ID
  title: string; // Channel title
  description?: string;
  thumbnailUrl?: string;
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  connectedAt: number;
  lastUsed?: number;
  status: 'active' | 'needs_reauth' | 'disabled'; // Account health status
  failureCount?: number; // Track consecutive failures for circuit breaker
  lastError?: string; // Last error message for debugging
  userId?: string; // User who connected this channel
}

class YouTubeOAuthSimple {
  private channels: Map<string, ConnectedChannel> = new Map();
  private channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
  private oauth2Client: OAuth2Client | null = null;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret || !redirectUri) {
      console.log('⚠️ YouTube OAuth not configured');
      return;
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    this.loadChannels();
    console.log(`✅ YouTube OAuth initialized (${this.channels.size} channels connected)`);
  }

  private loadChannels(): void {
    try {
      if (existsSync(this.channelsFile)) {
        const data = readFileSync(this.channelsFile, 'utf-8');
        const channelsArray: ConnectedChannel[] = JSON.parse(data);

        for (const channel of channelsArray) {
          this.channels.set(channel.id, channel);
        }
      }
    } catch (error) {
      console.error('Failed to load channels:', error);
    }
  }

  private saveChannels(): void {
    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const channelsArray = Array.from(this.channels.values());
      writeFileSync(this.channelsFile, JSON.stringify(channelsArray, null, 2));
    } catch (error) {
      console.error('Failed to save channels:', error);
    }
  }

  isEnabled(): boolean {
    return this.oauth2Client !== null;
  }

  getAuthUrl(): string {
    if (!this.oauth2Client) {
      throw new Error('OAuth not configured');
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Always ask for consent to get refresh token
    });
  }

  async handleCallback(code: string, userId?: string): Promise<ConnectedChannel> {
    if (!this.oauth2Client) {
      throw new Error('OAuth not configured');
    }

    // Exchange code for tokens
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    // Get channel info
    const youtube = google.youtube({ version: 'v3', auth: this.oauth2Client });
    const response = await youtube.channels.list({
      part: ['snippet', 'contentDetails'],
      mine: true,
    });

    const channelData = response.data.items?.[0];
    if (!channelData) {
      throw new Error('No channel found for this account');
    }

    const channelId = channelData.id!;
    const title = channelData.snippet?.title || 'Unknown Channel';
    const description = channelData.snippet?.description;
    const thumbnailUrl = channelData.snippet?.thumbnails?.default?.url;

    // Check if already connected
    const existing = Array.from(this.channels.values()).find((ch) => ch.channelId === channelId);

    if (existing) {
      // Update tokens and reset status
      existing.accessToken = tokens.access_token || '';
      existing.refreshToken = tokens.refresh_token || existing.refreshToken;
      existing.expiryDate = tokens.expiry_date || 0;
      existing.lastUsed = Date.now();
      existing.status = 'active';
      existing.failureCount = 0;
      existing.lastError = undefined;
      if (userId) existing.userId = userId; // Update userId if provided
      this.saveChannels();

      console.log(`✅ Updated existing channel: ${title}`);
      return existing;
    }

    // Add new channel
    const newChannel: ConnectedChannel = {
      id: `yt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      channelId,
      title,
      description: description ?? undefined,
      thumbnailUrl: thumbnailUrl ?? undefined,
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || '',
      expiryDate: tokens.expiry_date || 0,
      connectedAt: Date.now(),
      status: 'active',
      failureCount: 0,
      userId, // Store userId
    };

    this.channels.set(newChannel.id, newChannel);
    this.saveChannels();

    // Register with Thompson Sampling bandit
    await youtubeChannelBandit.registerChannel(newChannel.id, title, channelId);

    console.log(`✅ Connected new channel: ${title} (${channelId}) for user: ${userId || 'unknown'}`);
    return newChannel;
  }

  getAllChannels(): ConnectedChannel[] {
    return Array.from(this.channels.values());
  }

  getChannel(id: string): ConnectedChannel | undefined {
    return this.channels.get(id);
  }

  getChannelByYouTubeId(channelId: string): ConnectedChannel | undefined {
    return Array.from(this.channels.values()).find((ch) => ch.channelId === channelId);
  }

  async disconnect(id: string): Promise<void> {
    const channel = this.channels.get(id);
    if (!channel) {
      throw new Error('Channel not found');
    }

    this.channels.delete(id);
    this.saveChannels();

    console.log(`✅ Disconnected: ${channel.title}`);
  }

  /**
   * Refresh access token for a channel
   */
  private async refreshAccessToken(channel: ConnectedChannel): Promise<boolean> {
    try {
      if (!this.oauth2Client) {
        throw new Error('OAuth not configured');
      }

      const clientId = process.env.YOUTUBE_CLIENT_ID!;
      const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
      const redirectUri = process.env.YOUTUBE_REDIRECT_URI!;

      const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      client.setCredentials({
        refresh_token: channel.refreshToken,
      });

      // Refresh the token
      const { credentials } = await client.refreshAccessToken();

      // Update channel with new token
      channel.accessToken = credentials.access_token || '';
      channel.expiryDate = credentials.expiry_date || 0;
      channel.status = 'active';
      channel.failureCount = 0;
      channel.lastError = undefined;
      this.saveChannels();

      console.log(`✅ Refreshed token for ${channel.title}`);
      return true;
    } catch (error: any) {
      console.error(`❌ Token refresh failed for ${channel.title}:`, error.message);

      // Mark as needing re-auth
      channel.status = 'needs_reauth';
      channel.failureCount = (channel.failureCount || 0) + 1;
      channel.lastError = error.message;
      this.saveChannels();

      return false;
    }
  }

  /**
   * Mark channel as needing re-auth after failed upload
   */
  private markChannelNeedsReauth(channel: ConnectedChannel, error: string): void {
    channel.status = 'needs_reauth';
    channel.failureCount = (channel.failureCount || 0) + 1;
    channel.lastError = error;
    this.saveChannels();

    console.log(`⚠️ Channel ${channel.title} marked as needs_reauth (${channel.failureCount} failures)`);
  }

  /**
   * Smart channel selection based on content
   */
  selectChannelForContent(contentHints: {
    title?: string;
    description?: string;
    tags?: string[];
  }): ConnectedChannel | null {
    // Only consider active channels (filter out needs_reauth and disabled)
    const channels = this.getAllChannels().filter((ch) => ch.status === 'active');

    if (channels.length === 0) {
      console.log('⚠️ No active channels available for upload');
      return null;
    }

    if (channels.length === 1) {
      return channels[0];
    }

    // Extract keywords from content
    const contentText = [contentHints.title || '', contentHints.description || '', ...(contentHints.tags || [])]
      .join(' ')
      .toLowerCase();

    // Score each channel based on name similarity
    const scores = channels.map((channel) => {
      let score = 0;

      const channelName = channel.title.toLowerCase();
      const channelDesc = (channel.description || '').toLowerCase();

      // Check for keyword matches
      const keywords = {
        lofi: ['lofi', 'lo-fi', 'chill', 'study', 'beats'],
        trap: ['trap', 'drill', 'hard', 'rap', 'beats'],
        history: ['history', 'documentary', 'ancient', 'battle'],
        gaming: ['gaming', 'game', 'gameplay', "let's play"],
      };

      for (const [type, words] of Object.entries(keywords)) {
        // Check if channel name suggests this type
        const channelMatches = words.some((w) => channelName.includes(w) || channelDesc.includes(w));
        // Check if content matches this type
        const contentMatches = words.some((w) => contentText.includes(w));

        if (channelMatches && contentMatches) {
          score += 10;
        }
      }

      // Boost recently used channels
      if (channel.lastUsed && Date.now() - channel.lastUsed < 24 * 60 * 60 * 1000) {
        score += 1;
      }

      return { channel, score };
    });

    scores.sort((a, b) => b.score - a.score);

    console.log(`🎯 Channel selection:`);
    console.log(`   Content: ${contentHints.title || 'untitled'}`);
    scores.forEach((s) => {
      console.log(`     - ${s.channel.title}: ${s.score}`);
    });

    // Return highest scoring, or first if all tied
    return scores[0].score > 0 ? scores[0].channel : channels[0];
  }

  /**
   * Select channel using Thompson Sampling bandit
   * This learns which channels perform better over time
   */
  async selectChannelWithBandit(contentHints: {
    title?: string;
    description?: string;
    tags?: string[];
  }): Promise<ConnectedChannel | null> {
    // Detect content type from hints
    const contentText = [contentHints.title || '', contentHints.description || '', ...(contentHints.tags || [])]
      .join(' ')
      .toLowerCase();

    let contentType: 'lofi' | 'trap' | 'history' | undefined;

    if (contentText.match(/lofi|lo-fi|chill|study|beats/i)) {
      contentType = 'lofi';
    } else if (contentText.match(/trap|drill|hard|rap/i)) {
      contentType = 'trap';
    } else if (contentText.match(/history|documentary|ancient|battle/i)) {
      contentType = 'history';
    }

    // Ask bandit for recommendation
    const selected = await youtubeChannelBandit.selectChannel(contentType);

    if (!selected) {
      // Fallback to keyword-based selection
      console.log('⚠️ Bandit selection failed, falling back to keyword matching');
      return this.selectChannelForContent(contentHints);
    }

    // Get the actual channel object
    const channel = this.getChannel(selected.channelId);

    if (!channel || channel.status !== 'active') {
      // Fallback if bandit recommended an inactive channel
      console.log('⚠️ Bandit recommended inactive channel, falling back to keyword matching');
      return this.selectChannelForContent(contentHints);
    }

    console.log(`🎰 Bandit selected: ${channel.title} (confidence: ${selected.sampledValue.toFixed(3)})`);
    return channel;
  }

  async uploadVideo(
    channelIdOrAuto: string | 'auto',
    videoPath: string,
    thumbnailPath: string | null,
    metadata: {
      title: string;
      description: string;
      tags?: string[];
      privacyStatus?: 'private' | 'unlisted' | 'public';
    },
  ): Promise<{ success: boolean; videoId?: string; videoUrl?: string; channelName?: string; error?: string }> {
    let channel: ConnectedChannel | null = null;

    try {
      if (channelIdOrAuto === 'auto') {
        channel = this.selectChannelForContent(metadata);
      } else {
        channel = this.getChannel(channelIdOrAuto) ?? null;
      }

      if (!channel) {
        throw new Error('No suitable channel found');
      }

      // Check channel status
      if (channel.status !== 'active') {
        throw new Error(`Channel ${channel.title} is ${channel.status}. Please re-authenticate.`);
      }

      // Attempt upload with automatic token refresh on 401
      let retryCount = 0;
      const maxRetries = 1;

      while (retryCount <= maxRetries) {
        try {
          // Create OAuth client for this channel
          const clientId = process.env.YOUTUBE_CLIENT_ID!;
          const clientSecret = process.env.YOUTUBE_CLIENT_SECRET!;
          const redirectUri = process.env.YOUTUBE_REDIRECT_URI!;

          const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
          client.setCredentials({
            access_token: channel.accessToken,
            refresh_token: channel.refreshToken,
            expiry_date: channel.expiryDate,
          });

          const youtube = google.youtube({ version: 'v3', auth: client });

          console.log(`📤 Uploading to ${channel.title}${retryCount > 0 ? ' (retry after token refresh)' : ''}...`);

          // Upload video
          const response = await youtube.videos.insert({
            part: ['snippet', 'status'],
            requestBody: {
              snippet: {
                title: metadata.title,
                description: metadata.description,
                tags: metadata.tags || [],
                categoryId: '10', // Music
              },
              status: {
                privacyStatus: metadata.privacyStatus || 'public',
                selfDeclaredMadeForKids: false,
              },
            },
            media: {
              body: createReadStream(videoPath),
            },
          });

          const videoId = response.data.id!;
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

          // Upload thumbnail if provided
          if (thumbnailPath && existsSync(thumbnailPath)) {
            console.log('📸 Uploading thumbnail...');
            await youtube.thumbnails.set({
              videoId,
              media: {
                body: createReadStream(thumbnailPath),
              },
            });
          }

          // Update last used and reset failure count on success
          channel.lastUsed = Date.now();
          channel.failureCount = 0;
          channel.lastError = undefined;
          this.saveChannels();

          console.log(`✅ Uploaded to ${channel.title}: ${videoUrl}`);

          return {
            success: true,
            videoId,
            videoUrl,
            channelName: channel.title,
          };
        } catch (error: any) {
          // Check for 401 Unauthorized - token expired
          if (error.code === 401 && retryCount === 0) {
            console.log(`🔄 Token expired for ${channel.title}, attempting refresh...`);
            const refreshed = await this.refreshAccessToken(channel);

            if (refreshed) {
              retryCount++;
              continue; // Retry with fresh token
            } else {
              // Refresh failed, mark as needing re-auth
              this.markChannelNeedsReauth(channel, 'Token refresh failed: ' + error.message);
              throw new Error(`Token refresh failed for ${channel.title}. Please re-authenticate.`);
            }
          }

          // Other errors or refresh failed
          throw error;
        }
      }

      // Should never reach here
      throw new Error('Upload failed after retries');
    } catch (error: any) {
      console.error(`❌ Upload failed:`, error.message);

      // Mark channel as needing re-auth if not already done
      if (channel && channel.status === 'active') {
        this.markChannelNeedsReauth(channel, error.message);
      }

      return {
        success: false,
        error: error.message,
      };
    }
  }
}

export const youtubeOAuthSimple = new YouTubeOAuthSimple();
