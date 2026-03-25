/**
 * YouTube Multi-Channel Service
 *
 * Manages OAuth authentication and uploads for multiple YouTube channels:
 * - ChillBeats4Me (lofi beats)
 * - Trap Beats INC (trap beats)
 *
 * Each channel has separate OAuth credentials stored in:
 * - data/youtube_credentials_chillbeats.json
 * - data/youtube_credentials_trapbeats.json
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/youtube.readonly',
];

export type ChannelType = 'chillbeats' | 'trapbeats';

interface ChannelConfig {
  id: ChannelType;
  name: string;
  description: string;
  credentialsFile: string;
}

interface YouTubeCredentials {
  accessToken: string;
  refreshToken: string;
  expiryDate: number;
  channelId?: string; // YouTube channel ID
}

interface UploadResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  title?: string;
  error?: string;
}

interface VideoMetadata {
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'private' | 'unlisted' | 'public';
}

class YouTubeMultiChannelService {
  private oauth2Clients: Map<ChannelType, OAuth2Client> = new Map();
  private isConfigured = false;

  private channels: Map<ChannelType, ChannelConfig> = new Map([
    [
      'chillbeats',
      {
        id: 'chillbeats',
        name: 'ChillBeats4Me',
        description: 'Lofi beats for study and chill',
        credentialsFile: join(process.cwd(), 'data', 'youtube_credentials_chillbeats.json'),
      },
    ],
    [
      'trapbeats',
      {
        id: 'trapbeats',
        name: 'Trap Beats INC',
        description: 'Hard trap beats for rappers',
        credentialsFile: join(process.cwd(), 'data', 'youtube_credentials_trapbeats.json'),
      },
    ],
  ]);

  constructor() {
    this.initializeClients();
  }

  private initializeClients(): void {
    const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
    const baseRedirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();

    if (!clientId || !clientSecret || !baseRedirectUri) {
      console.log('⚠️ YouTube OAuth not configured - missing credentials');
      return;
    }

    // Create OAuth client for each channel using the single registered redirect URI
    // Channel type is passed via the 'state' parameter instead of separate redirect URIs
    for (const [channelType, config] of this.channels) {
      const client = new google.auth.OAuth2(clientId, clientSecret, baseRedirectUri);
      this.oauth2Clients.set(channelType, client);
      this.loadStoredCredentials(channelType);
    }

    this.isConfigured = true;
    console.log('✅ YouTube multi-channel OAuth initialized');
    console.log(
      `   Channels: ${Array.from(this.channels.values())
        .map((c) => c.name)
        .join(', ')}`,
    );
  }

  private loadStoredCredentials(channelType: ChannelType): void {
    const config = this.channels.get(channelType);
    const client = this.oauth2Clients.get(channelType);

    if (!config || !client) return;

    try {
      if (existsSync(config.credentialsFile)) {
        const data = readFileSync(config.credentialsFile, 'utf-8');
        const credentials: YouTubeCredentials = JSON.parse(data);

        if (credentials.refreshToken) {
          client.setCredentials({
            access_token: credentials.accessToken,
            refresh_token: credentials.refreshToken,
            expiry_date: credentials.expiryDate,
          });
          console.log(`✅ YouTube credentials loaded for ${config.name}`);
        }
      }
    } catch (error) {
      console.log(`No stored credentials found for ${config.name}`);
    }
  }

  private saveCredentials(channelType: ChannelType, credentials: YouTubeCredentials): void {
    const config = this.channels.get(channelType);
    if (!config) return;

    try {
      const dir = join(process.cwd(), 'data');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(config.credentialsFile, JSON.stringify(credentials, null, 2));
      console.log(`✅ YouTube credentials saved for ${config.name}`);
    } catch (error) {
      console.error(`Failed to save credentials for ${config.name}:`, error);
    }
  }

  isEnabled(): boolean {
    return this.isConfigured;
  }

  getChannels(): ChannelConfig[] {
    return Array.from(this.channels.values());
  }

  async isAuthenticated(channelType: ChannelType): Promise<boolean> {
    const client = this.oauth2Clients.get(channelType);
    if (!client) return false;

    const credentials = client.credentials;
    return !!credentials.refresh_token;
  }

  getAuthUrl(channelType: ChannelType): string {
    const client = this.oauth2Clients.get(channelType);
    if (!client) throw new Error('OAuth client not initialized');

    // Include channel type in state parameter to identify which channel is authenticating
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent', // Force consent to get refresh token
      state: channelType, // Pass channel type in state
    });
  }

  async handleCallback(code: string, channelType: ChannelType): Promise<void> {
    const client = this.oauth2Clients.get(channelType);
    if (!client) throw new Error('OAuth client not initialized');

    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get channel info to verify
    const youtube = google.youtube({ version: 'v3', auth: client });
    const channelResponse = await youtube.channels.list({
      part: ['snippet'],
      mine: true,
    });

    const channelId = channelResponse.data.items?.[0]?.id;
    const channelTitle = channelResponse.data.items?.[0]?.snippet?.title;

    console.log(`✅ Authenticated: ${channelTitle} (${channelId})`);

    // Save credentials
    this.saveCredentials(channelType, {
      accessToken: tokens.access_token || '',
      refreshToken: tokens.refresh_token || '',
      expiryDate: tokens.expiry_date || 0,
      channelId: channelId ?? undefined,
    });
  }

  async uploadVideo(
    channelType: ChannelType,
    videoPath: string,
    thumbnailPath: string | null,
    metadata: VideoMetadata,
    onProgress?: (progress: number) => void,
  ): Promise<UploadResult> {
    try {
      const client = this.oauth2Clients.get(channelType);
      if (!client) {
        throw new Error(`OAuth client not found for ${channelType}`);
      }

      if (!client.credentials.refresh_token) {
        throw new Error(`Channel ${channelType} not authenticated`);
      }

      const youtube = google.youtube({ version: 'v3', auth: client });

      // Upload video
      console.log(`📤 Uploading to ${this.channels.get(channelType)?.name}...`);

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
            status: {
              privacyStatus: metadata.privacyStatus || 'public',
              selfDeclaredMadeForKids: false,
            },
          },
          media: {
            body: require('fs').createReadStream(videoPath),
          },
        },
        {
          onUploadProgress: (evt) => {
            const progress = (evt.bytesRead / require('fs').statSync(videoPath).size) * 100;
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
            body: require('fs').createReadStream(thumbnailPath),
          },
        });
      }

      console.log(`✅ Video uploaded: ${videoUrl}`);

      return {
        success: true,
        videoId,
        videoUrl,
        title: metadata.title,
      };
    } catch (error: any) {
      console.error(`❌ Upload failed for ${channelType}:`, error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getChannelInfo(channelType: ChannelType): Promise<any> {
    const client = this.oauth2Clients.get(channelType);
    if (!client || !client.credentials.refresh_token) {
      throw new Error(`Channel ${channelType} not authenticated`);
    }

    const youtube = google.youtube({ version: 'v3', auth: client });
    const response = await youtube.channels.list({
      part: ['snippet', 'statistics'],
      mine: true,
    });

    return response.data.items?.[0];
  }

  async disconnect(channelType: ChannelType): Promise<void> {
    const config = this.channels.get(channelType);
    const client = this.oauth2Clients.get(channelType);

    if (!config || !client) {
      throw new Error(`Channel ${channelType} not found`);
    }

    // Clear credentials from client
    client.setCredentials({});

    // Delete credentials file
    if (existsSync(config.credentialsFile)) {
      require('fs').unlinkSync(config.credentialsFile);
      console.log(`✅ Disconnected ${config.name}`);
    }
  }
}

export const youtubeMultiChannelService = new YouTubeMultiChannelService();
