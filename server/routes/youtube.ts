/**
 * YouTube Routes
 *
 * YouTube upload, OAuth, channel management, multi-channel, trends discovery,
 * quota management, analytics, metadata generation, and video management.
 */

import { Router } from 'express';
import { join } from 'path';
import { existsSync, readFileSync, statSync, createReadStream } from 'fs';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { storage } from '../storage';
import { db } from '../db';

const router = Router();

// HTML routes need separate export (mounted without /api prefix)
export const youtubeHtmlRouter = Router();

  // ============ YOUTUBE TRENDS DISCOVERY ============

  // Discover trending topics and map to historical figures
  router.post('/trends/discover', async (req, res) => {
    try {
      const { youtubeTrendsService } = await import('../services/youtube-trends-service');

      if (!youtubeTrendsService.isConfigured()) {
        return res.status(400).json({
          success: false,
          error: 'YouTube API not configured. YouTube credentials are required for trends discovery.',
        });
      }

      console.log('🔍 Manual trends discovery triggered...');
      const result = await youtubeTrendsService.discoverTrendingHistoricalTopics();

      res.json({
        success: true,
        data: {
          trendingVideosAnalyzed: result.trendingVideos.length,
          themesExtracted: result.extractedThemes,
          historicalMappings: result.historicalMappings,
          discoveryTimestamp: result.discoveryTimestamp,
        },
      });
    } catch (error: any) {
      console.error('Trends discovery error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get last trends discovery result (cached)
  router.get('/trends', async (req, res) => {
    try {
      const { youtubeTrendsService } = await import('../services/youtube-trends-service');

      const lastDiscovery = youtubeTrendsService.getLastDiscovery();

      if (!lastDiscovery) {
        return res.json({
          success: true,
          data: null,
          message: 'No trends discovery has been run yet. Trigger /api/youtube/trends/discover to start.',
        });
      }

      res.json({
        success: true,
        data: {
          trendingVideosAnalyzed: lastDiscovery.trendingVideos.length,
          themesExtracted: lastDiscovery.extractedThemes,
          historicalMappings: lastDiscovery.historicalMappings,
          discoveryTimestamp: lastDiscovery.discoveryTimestamp,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get topics ready for video generation from trends
  router.get('/trends/topics', async (req, res) => {
    try {
      const { youtubeTrendsService } = await import('../services/youtube-trends-service');
      const count = parseInt(req.query.count as string) || 5;

      const topics = await youtubeTrendsService.getTrendingTopicsForGeneration(count);

      res.json({
        success: true,
        data: topics,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============ YOUTUBE UPLOAD ============

  // Check YouTube connection status
  router.get('/status', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');

      const isEnabled = youtubeUploadService.isEnabled();
      const isAuthenticated = await youtubeUploadService.isAuthenticated();
      let channelInfo = null;

      if (isAuthenticated) {
        channelInfo = await youtubeUploadService.getChannelInfo();
      }

      res.json({
        success: true,
        data: {
          configured: isEnabled,
          authenticated: isAuthenticated,
          channel: channelInfo,
          requiredEnvVars: {
            YOUTUBE_CLIENT_ID: !!process.env.YOUTUBE_CLIENT_ID,
            YOUTUBE_CLIENT_SECRET: !!process.env.YOUTUBE_CLIENT_SECRET,
            YOUTUBE_REDIRECT_URI: !!process.env.YOUTUBE_REDIRECT_URI,
            YOUTUBE_REFRESH_TOKEN: !!process.env.YOUTUBE_REFRESH_TOKEN,
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get YouTube OAuth URL
  router.get('/auth-url', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');

      if (!youtubeUploadService.isEnabled()) {
        return res.status(400).json({
          success: false,
          error:
            'YouTube OAuth not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI.',
        });
      }

      const authUrl = youtubeUploadService.getAuthUrl();
      res.json({ success: true, data: { authUrl } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // YouTube OAuth callback - now uses multi-channel system
  router.get('/callback', optionalAuthMiddleware, async (req, res) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code) {
        return res.status(400).send('Missing authorization code');
      }

      // If state is a multi-channel identifier, route to multi-channel service
      if (state === 'chillbeats' || state === 'trapbeats') {
        const { youtubeMultiChannelService } = await import('../services/youtube-multi-channel-service');
        await youtubeMultiChannelService.handleCallback(code, state);
        const channelName = state === 'chillbeats' ? 'ChillBeats4Me' : 'Trap Beats INC';
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>YouTube Connected - ${channelName}</title>
            <style>
              body { font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff; text-align: center; }
              .success { color: #4ade80; font-size: 32px; margin-bottom: 20px; }
              .channel { color: #60a5fa; font-size: 24px; margin: 20px 0; }
              button { background: #4ade80; color: #000; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 10px; }
            </style>
          </head>
          <body>
            <div class="success">✅ YouTube Connected!</div>
            <div class="channel">${channelName}</div>
            <button onclick="window.close()">Close Window</button>
            <button onclick="window.location.href='/'">Go to Dashboard</button>
          </body>
          </html>
        `);
      }

      // Default: handle with simple OAuth system
      const { youtubeOAuthSimple } = await import('../services/youtube-oauth-simple');
      const userId = req.user?.id;
      const channel = await youtubeOAuthSimple.handleCallback(code, userId);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>YouTube Connected</title>
          <style>
            body { font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff; text-align: center; }
            .success { color: #4ade80; font-size: 32px; margin-bottom: 20px; }
            .channel { color: #60a5fa; font-size: 24px; margin: 20px 0; }
            button { background: #4ade80; color: #000; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 10px; }
          </style>
        </head>
        <body>
          <div class="success">✅ YouTube Connected!</div>
          <div class="channel">${channel.title}</div>
          <p style="color: #9ca3af;">Channel ID: ${channel.channelId}</p>
          <button onclick="window.close()">Close Window</button>
        </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send(`Error: ${error.message}`);
    }
  });

  // Simple YouTube OAuth (Just Connect Channels)
  // =============================================

  // Serve simple connect page
  youtubeHtmlRouter.get('/connect-youtube.html', (req, res) => {
    res.sendFile(join(process.cwd(), 'connect-youtube.html'));
  });

  // Legacy redirect
  router.get('/auth', (req, res) => {
    res.redirect('/connect-youtube.html');
  });

  // Start OAuth flow
  router.get('/oauth/connect', async (req, res) => {
    try {
      const { youtubeOAuthSimple } = await import('../services/youtube-oauth-simple');

      if (!youtubeOAuthSimple.isEnabled()) {
        return res.status(400).json({ success: false, error: 'YouTube OAuth not configured' });
      }

      const authUrl = youtubeOAuthSimple.getAuthUrl();
      res.json({ success: true, data: { authUrl } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // List connected channels
  router.get('/oauth/channels', authMiddleware, async (req, res) => {
    try {
      const { youtubeOAuthSimple } = await import('../services/youtube-oauth-simple');
      const allChannels = youtubeOAuthSimple.getAllChannels();

      // Filter by authenticated user only
      const channels = allChannels.filter((ch) => ch.userId === req.user!.id);

      res.json({
        success: true,
        data: {
          channels: channels.map((ch) => ({
            id: ch.id,
            channelId: ch.channelId,
            title: ch.title,
            thumbnailUrl: ch.thumbnailUrl,
            connectedAt: ch.connectedAt,
            lastUsed: ch.lastUsed,
          })),
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Disconnect channel
  router.post('/oauth/disconnect/:channelId', authMiddleware, async (req, res) => {
    try {
      const { youtubeOAuthSimple } = await import('../services/youtube-oauth-simple');
      const { channelId } = req.params;

      // Verify channel ownership
      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
      if (existsSync(channelsFile)) {
        const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
        const channel = channels.find((ch: any) => ch.channelId === channelId);
        if (channel && channel.userId && channel.userId !== req.user!.id) {
          return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
      }

      await youtubeOAuthSimple.disconnect(channelId);

      res.json({ success: true, message: 'Channel disconnected' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // YouTube Channel Manager Routes (Advanced)
  // ================================

  // Serve channel management page
  youtubeHtmlRouter.get('/youtube-channels.html', (req, res) => {
    res.sendFile(join(process.cwd(), 'youtube-channels.html'));
  });

  // Get all managed channels
  router.get('/channels', async (req, res) => {
    try {
      const { youtubeChannelManager } = await import('../services/youtube-channel-manager');

      if (!youtubeChannelManager.isEnabled()) {
        return res.status(400).json({ success: false, error: 'YouTube not configured' });
      }

      const channels = youtubeChannelManager.getAllChannels();
      res.json({ success: true, data: { channels } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Add new channel
  router.post('/channels', async (req, res) => {
    try {
      const { youtubeChannelManager } = await import('../services/youtube-channel-manager');
      const { name, description, contentTypes, keywords } = req.body;

      if (!name || !description) {
        return res.status(400).json({ success: false, error: 'name and description required' });
      }

      const channel = youtubeChannelManager.addChannel({
        name,
        description,
        contentTypes: contentTypes || [],
        keywords: keywords || [],
      });

      res.json({ success: true, data: { channel } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update channel
  router.put('/channels/:channelId', async (req, res) => {
    try {
      const { youtubeChannelManager } = await import('../services/youtube-channel-manager');
      const { channelId } = req.params;
      const updates = req.body;

      const success = youtubeChannelManager.updateChannel(channelId, updates);

      if (success) {
        const channel = youtubeChannelManager.getChannel(channelId);
        res.json({ success: true, data: { channel } });
      } else {
        res.status(404).json({ success: false, error: 'Channel not found' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Delete channel
  router.delete('/channels/:channelId', async (req, res) => {
    try {
      const { youtubeChannelManager } = await import('../services/youtube-channel-manager');
      const { channelId } = req.params;

      const success = youtubeChannelManager.deleteChannel(channelId);

      if (success) {
        res.json({ success: true, message: 'Channel deleted' });
      } else {
        res.status(404).json({ success: false, error: 'Channel not found' });
      }
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get auth URL for channel
  router.get('/channels/:channelId/auth-url', async (req, res) => {
    try {
      const { youtubeChannelManager } = await import('../services/youtube-channel-manager');
      const { channelId } = req.params;

      const channel = youtubeChannelManager.getChannel(channelId);
      if (!channel) {
        return res.status(404).json({ success: false, error: 'Channel not found' });
      }

      const authUrl = youtubeChannelManager.getAuthUrl(channelId);
      res.json({ success: true, data: { authUrl, channel } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Handle OAuth callback
  router.get('/channels/:channelId/callback', async (req, res) => {
    try {
      const { youtubeChannelManager } = await import('../services/youtube-channel-manager');
      const { channelId } = req.params;
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code) {
        return res.status(400).send('Missing authorization code');
      }

      const actualChannelId = state || channelId;
      const channel = youtubeChannelManager.getChannel(actualChannelId);

      if (!channel) {
        return res.status(404).send('Channel not found');
      }

      await youtubeChannelManager.handleCallback(code, actualChannelId);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>YouTube Connected - ${channel.name}</title>
          <style>
            body { font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff; text-align: center; }
            .success { color: #4ade80; font-size: 32px; margin-bottom: 20px; }
            .channel { color: #60a5fa; font-size: 24px; margin: 20px 0; }
            button { background: #4ade80; color: #000; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 10px; }
          </style>
        </head>
        <body>
          <div class="success">✅ YouTube Connected!</div>
          <div class="channel">${channel.name}</div>
          <p style="color: #9ca3af;">Channel authenticated and ready for uploads</p>
          <button onclick="window.close()">Close Window</button>
          <button onclick="window.location.href='/'">Go to Dashboard</button>
        </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Error</title></head>
        <body style="font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff; text-align: center;">
          <div style="color: #ef4444; font-size: 24px;">❌ Authentication Failed</div>
          <p style="color: #9ca3af;">${error.message}</p>
          <button onclick="window.close()" style="background: #333; color: #fff; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer;">Close</button>
        </body>
        </html>
      `);
    }
  });

  // Disconnect channel
  router.post('/channels/:channelId/disconnect', async (req, res) => {
    try {
      const { youtubeChannelManager } = await import('../services/youtube-channel-manager');
      const { channelId } = req.params;

      await youtubeChannelManager.disconnect(channelId);

      res.json({ success: true, message: 'Channel disconnected' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Multi-Channel YouTube Routes (Legacy)
  // ============================

  // Serve YouTube auth page
  youtubeHtmlRouter.get('/youtube-auth.html', (req, res) => {
    res.sendFile(join(process.cwd(), 'youtube-auth.html'));
  });

  // Get list of available channels
  router.get('/multi/channels', async (req, res) => {
    try {
      const { youtubeMultiChannelService } = await import('../services/youtube-multi-channel-service');

      if (!youtubeMultiChannelService.isEnabled()) {
        return res.status(400).json({ success: false, error: 'YouTube multi-channel not configured' });
      }

      const channels = youtubeMultiChannelService.getChannels();

      // Check authentication status for each channel
      const channelsWithStatus = await Promise.all(
        channels.map(async (channel) => ({
          ...channel,
          isAuthenticated: await youtubeMultiChannelService.isAuthenticated(channel.id as any),
        })),
      );

      res.json({ success: true, data: { channels: channelsWithStatus } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get auth URL for specific channel
  router.get('/multi/auth-url/:channel', async (req, res) => {
    try {
      const { youtubeMultiChannelService } = await import('../services/youtube-multi-channel-service');
      const channel = req.params.channel as 'chillbeats' | 'trapbeats';

      if (!['chillbeats', 'trapbeats'].includes(channel)) {
        return res.status(400).json({ success: false, error: 'Invalid channel. Must be "chillbeats" or "trapbeats"' });
      }

      if (!youtubeMultiChannelService.isEnabled()) {
        return res.status(400).json({ success: false, error: 'YouTube multi-channel not configured' });
      }

      const authUrl = youtubeMultiChannelService.getAuthUrl(channel);
      res.json({ success: true, data: { authUrl, channel } });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Handle OAuth callback for specific channel
  router.get('/multi/callback/:channel', async (req, res) => {
    try {
      const { youtubeMultiChannelService } = await import('../services/youtube-multi-channel-service');
      const channel = req.params.channel as 'chillbeats' | 'trapbeats';
      const code = req.query.code as string;
      const state = req.query.state as string;

      if (!code) {
        return res.status(400).send('Missing authorization code');
      }

      // Use state parameter if available (fallback to URL param)
      const channelType = (state || channel) as 'chillbeats' | 'trapbeats';

      if (!['chillbeats', 'trapbeats'].includes(channelType)) {
        return res.status(400).send('Invalid channel');
      }

      await youtubeMultiChannelService.handleCallback(code, channelType);

      const channelName = channelType === 'chillbeats' ? 'ChillBeats4Me' : 'Trap Beats INC';

      // Show success page
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>YouTube Connected - ${channelName}</title>
          <style>
            body { font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff; text-align: center; }
            .success { color: #4ade80; font-size: 32px; margin-bottom: 20px; }
            .channel { color: #60a5fa; font-size: 24px; margin: 20px 0; }
            .instructions { color: #9ca3af; margin: 20px 0; max-width: 600px; margin-left: auto; margin-right: auto; }
            button { background: #4ade80; color: #000; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px; margin: 10px; }
          </style>
        </head>
        <body>
          <div class="success">✅ YouTube Connected Successfully!</div>
          <div class="channel">${channelName}</div>
          <div class="instructions">
            Your channel is now connected and ready to receive uploads. You can close this window and return to the dashboard.
          </div>
          <button onclick="window.close()">Close Window</button>
          <button onclick="window.location.href='/'">Go to Dashboard</button>
        </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head><title>YouTube Error</title></head>
        <body style="font-family: system-ui; padding: 40px; background: #1a1a1a; color: #fff; text-align: center;">
          <div style="color: #ef4444; font-size: 24px;">❌ Authentication Failed</div>
          <p style="color: #9ca3af;">${error.message}</p>
          <button onclick="window.close()" style="background: #333; color: #fff; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer;">Close</button>
        </body>
        </html>
      `);
    }
  });

  // Check authentication status for specific channel
  router.get('/multi/status/:channel', async (req, res) => {
    try {
      const { youtubeMultiChannelService } = await import('../services/youtube-multi-channel-service');
      const channel = req.params.channel as 'chillbeats' | 'trapbeats';

      if (!['chillbeats', 'trapbeats'].includes(channel)) {
        return res.status(400).json({ success: false, error: 'Invalid channel' });
      }

      const isAuthenticated = await youtubeMultiChannelService.isAuthenticated(channel);

      res.json({
        success: true,
        data: {
          channel,
          isAuthenticated,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get channel info (requires authentication)
  router.get('/multi/info/:channel', async (req, res) => {
    try {
      const { youtubeMultiChannelService } = await import('../services/youtube-multi-channel-service');
      const channel = req.params.channel as 'chillbeats' | 'trapbeats';

      if (!['chillbeats', 'trapbeats'].includes(channel)) {
        return res.status(400).json({ success: false, error: 'Invalid channel' });
      }

      const channelInfo = await youtubeMultiChannelService.getChannelInfo(channel);

      res.json({
        success: true,
        data: {
          channel,
          info: channelInfo,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Disconnect channel (delete stored credentials)
  router.post('/multi/disconnect/:channel', async (req, res) => {
    try {
      const { youtubeMultiChannelService } = await import('../services/youtube-multi-channel-service');
      const channel = req.params.channel as 'chillbeats' | 'trapbeats';

      if (!['chillbeats', 'trapbeats'].includes(channel)) {
        return res.status(400).json({ success: false, error: 'Invalid channel' });
      }

      await youtubeMultiChannelService.disconnect(channel);

      res.json({
        success: true,
        data: {
          channel,
          message: 'Channel disconnected successfully',
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Upload video to YouTube
  router.post('/upload', authMiddleware, async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const { videoPath, title, description, tags, privacyStatus, jobId } = req.body;

      if (!videoPath) {
        return res.status(400).json({ success: false, error: 'videoPath is required' });
      }

      // If jobId is provided, verify ownership
      if (jobId) {
        const job = await storage.getJob(jobId);
        if (job && job.userId && job.userId !== req.user!.id) {
          return res.status(403).json({ success: false, error: 'Unauthorized' });
        }
      }

      // Resolve video path
      let fullPath = videoPath;
      if (videoPath.startsWith('/api/videos/')) {
        const filename = videoPath.replace('/api/videos/', '');
        fullPath = join(process.cwd(), 'data', 'videos', 'renders', filename);
        if (!existsSync(fullPath)) {
          fullPath = join(process.cwd(), 'attached_assets', 'veo_videos', filename);
        }
      }

      if (!existsSync(fullPath)) {
        return res.status(404).json({ success: false, error: 'Video file not found' });
      }

      const result = await youtubeUploadService.uploadVideo(fullPath, {
        title: title || 'AI Generated Video',
        description: description || 'Created with VEO AI',
        tags: tags || ['AI', 'Generated'],
        privacyStatus: privacyStatus || 'private', // Default to private for review
      });

      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Debug endpoint for file path
  router.get('/debug-channels-path', async (req, res) => {
    const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
    res.json({
      cwd: process.cwd(),
      channelsFile,
      exists: existsSync(channelsFile),
      nodeVersion: process.version,
    });
  });

  // Get connected YouTube channels
  router.get('/connected-channels', optionalAuthMiddleware, async (req, res) => {
    try {
      console.log('[CHANNELS API] Request from user:', req.user?.id, req.user?.email);

      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');

      if (!existsSync(channelsFile)) {
        console.log('[CHANNELS API] File not found:', channelsFile);
        return res.json({ data: [] });
      }

      const rawData = readFileSync(channelsFile, 'utf-8');
      const channels = JSON.parse(rawData);

      if (!Array.isArray(channels)) {
        console.error('[CHANNELS API] Data is not an array:', typeof channels);
        return res.json({ data: [] });
      }

      console.log('[CHANNELS API] Total channels in file:', channels.length);
      console.log(
        '[CHANNELS API] Channel userIds:',
        channels.map((c: any) => ({ id: c.id, userId: c.userId, status: c.status })),
      );

      // Filter by authenticated user, or show all active channels if not authenticated (dev mode)
      let filteredChannels;
      if (req.user) {
        filteredChannels = channels.filter((c: any) => c.userId === req.user!.id && c.status === 'active');
        console.log(`[CHANNELS API] Found ${filteredChannels.length} active channels for user ${req.user.id}`);
      } else {
        // No user - show all active channels (dev mode)
        filteredChannels = channels.filter((c: any) => c.status === 'active');
        console.log(
          `[CHANNELS API] No authenticated user - showing all ${filteredChannels.length} active channels (dev mode)`,
        );
      }

      console.log(
        '[CHANNELS API] Filtered channels:',
        filteredChannels.map((c: any) => ({ id: c.id, title: c.title })),
      );

      // Always return consistent format: { data: Channel[] }
      res.json({ data: filteredChannels });
    } catch (error: any) {
      console.error('[CHANNELS API] Error:', error);
      res.json({ data: [], error: error.message });
    }
  });

  // Update video privacy status
  router.post('/update-privacy', authMiddleware, async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const { videoId, privacyStatus, channelConnectionId } = req.body;

      if (!videoId || !privacyStatus) {
        return res.status(400).json({ success: false, error: 'videoId and privacyStatus are required' });
      }

      if (!['public', 'private', 'unlisted'].includes(privacyStatus)) {
        return res.status(400).json({ success: false, error: 'privacyStatus must be public, private, or unlisted' });
      }

      console.log(
        `📺 [PRIVACY] Updating ${videoId} to ${privacyStatus}${channelConnectionId ? ` (channel: ${channelConnectionId})` : ''}`,
      );

      // If channelConnectionId provided, verify ownership and use that channel's credentials
      if (channelConnectionId) {
        // Load channel credentials from file
        const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
        if (!existsSync(channelsFile)) {
          return res.status(404).json({ success: false, error: 'YouTube channels file not found' });
        }

        const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
        const selectedChannel = channels.find((c: any) => c.id === channelConnectionId);

        if (!selectedChannel) {
          return res.status(404).json({ success: false, error: 'Channel not found' });
        }

        if (selectedChannel.userId && selectedChannel.userId !== req.user!.id) {
          return res.status(403).json({ success: false, error: 'Unauthorized' });
        }

        const channelData = selectedChannel;

        if (!channelData) {
          return res.status(404).json({ success: false, error: 'Selected channel not found' });
        }

        console.log(`✅ [PRIVACY] Using channel: ${selectedChannel.title}`);

        // Use googleapis directly with channel credentials
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

        await youtube.videos.update({
          part: ['status'],
          requestBody: {
            id: videoId,
            status: {
              privacyStatus: privacyStatus,
            },
          },
        });

        console.log(`✅ [PRIVACY] Updated ${videoId} to ${privacyStatus}`);
        return res.json({ success: true, videoId, privacyStatus });
      }

      // Fallback to default channel
      const result = await youtubeUploadService.updatePrivacy(videoId, privacyStatus);
      res.json(result);
    } catch (error: any) {
      console.error('❌ [PRIVACY] Error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Generate YouTube metadata for a job
  router.post('/generate-metadata', async (req, res) => {
    try {
      const { youtubeMetadataGenerator } = await import('../services/youtube-metadata-generator');
      const { jobId } = req.body;

      console.log(`\n🎬 [METADATA] ============ Generating for job: ${jobId} ============`);

      if (!jobId) {
        return res.status(400).json({ success: false, error: 'jobId is required' });
      }

      // Get job details
      const job = await storage.getJob(jobId);
      if (!job) {
        console.log(`❌ [METADATA] Job not found`);
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      console.log(`✅ [METADATA] Job found - mode: ${job.mode}`);
      console.log(`🔍 [METADATA] unityMetadata type: ${typeof job.unityMetadata}`);
      console.log(`🔍 [METADATA] unityMetadata exists: ${!!job.unityMetadata}`);

      // Check if job has custom YouTube metadata (e.g., for music/lofi videos)
      const jobMeta = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;

      console.log(`🔍 [METADATA] Parsed metadata:`, JSON.stringify(jobMeta, null, 2).substring(0, 300));
      console.log(`🔍 [METADATA] Has youtubeTitle: ${!!jobMeta?.youtubeTitle}`);
      console.log(`🔍 [METADATA] Has youtubeDescription: ${!!jobMeta?.youtubeDescription}`);
      console.log(`🔍 [METADATA] Has youtubeTags: ${!!jobMeta?.youtubeTags}`);

      if (jobMeta?.youtubeTitle && jobMeta?.youtubeDescription && jobMeta?.youtubeTags) {
        // Use pre-defined YouTube metadata for music videos
        console.log('✅✅✅ [METADATA] Using custom YouTube metadata for music video!');
        const metadata = {
          title: jobMeta.youtubeTitle,
          description: jobMeta.youtubeDescription,
          tags: jobMeta.youtubeTags,
          thumbnailPrompt:
            'Lofi hip hop aesthetic: anime study room, rainy window, warm lighting, cozy vibes, vintage cassette tapes, lo-fi aesthetic, chill atmosphere, 16:9 YouTube thumbnail',
          categoryId: '10', // Music
          privacyStatus: 'private' as const,
        };
        return res.json({ success: true, data: metadata });
      }

      console.log('⚠️ [METADATA] Custom metadata check failed, falling through to default generator');

      // Generate music-specific metadata for music mode jobs
      if (job.mode === 'music') {
        console.log('🎵 [METADATA] Generating music-specific metadata');
        const scriptContent = job.scriptContent || '';
        const isLofi = /lofi|chillhop|jazz hop|lo-fi|study/i.test(scriptContent);
        const isTrap = /trap|drill|808|type beat/i.test(scriptContent);
        const genre = isLofi ? 'lofi' : isTrap ? 'trap' : 'beats';

        // Calculate actual duration and update title
        const durationSeconds = (job as any).duration || job.audioDuration || 0;
        const minutes = Math.floor(durationSeconds / 60);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;

        let durationText = '';
        if (hours > 0) {
          durationText = remainingMinutes > 0 ? `${hours}-Hour ${remainingMinutes}-Minute` : `${hours}-Hour`;
        } else if (minutes > 0) {
          durationText = `${minutes}-Minute`;
        }

        // Update title with actual duration
        let title = job.scriptName || 'Untitled Beat';
        if (durationText) {
          // Replace any existing duration pattern (e.g., "30-Minute" or "1-Hour 30-Minute")
          title = title.replace(/\d+-(?:Hour|Minute)(?:\s+\d+-Minute)?/gi, durationText);

          // If no duration pattern was found, prepend it
          if (!title.includes(durationText)) {
            title = `${durationText} ${title}`;
          }
        }

        console.log(`   Duration: ${minutes} minutes (${durationSeconds}s)`);
        console.log(`   Title: ${title}`);

        // Extract just the vibe/style info, removing target duration
        const cleanContent = scriptContent.replace(/target\s+\d+:\d+\s+length\s*\|\s*/gi, '').trim();

        const description = `${title}

${cleanContent}

💰 Purchase license: [Your BeatStars link]

#beats #instrumental ${isLofi ? '#lofi #chillhop #studymusic' : '#trap #typebeat #hiphop'}`;

        const metadata = {
          title,
          description,
          tags: [
            'beats',
            'instrumental',
            genre,
            `${job.scriptName}`.toLowerCase().includes('bpm') ? 'type beat' : 'beat',
            'AI generated',
            'music',
            ...(isLofi ? ['lofi', 'chillhop', 'study music', 'chill beats'] : []),
            ...(isTrap ? ['trap', 'type beat', 'hard', '808'] : []),
          ],
          thumbnailPrompt: isLofi
            ? 'Lofi hip hop aesthetic: anime study room, rainy window, warm lighting, cozy vibes, vintage cassette tapes, lo-fi aesthetic, chill atmosphere, 16:9 YouTube thumbnail'
            : 'Dark trap aesthetic: urban cityscape at night, neon lights, moody atmosphere, luxury car, dramatic lighting, bold typography, 16:9 YouTube thumbnail',
          categoryId: '10', // Music
          privacyStatus: 'private' as const,
        };
        return res.json({ success: true, data: metadata });
      }

      // Get Unity package if applicable
      let unityMetadata: any = undefined;
      if (job.mode === 'unity_kling' && job.unityMetadata) {
        const metadata = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;

        // Try to get more details from the Unity package
        const packages = await storage.listUnityContentPackages();
        const matchingPackage = packages.find(
          (pkg: any) => pkg.title === job.scriptName?.replace(' - Unity VEO', '') || pkg.packageData?.jobId === job.id,
        );

        if (matchingPackage) {
          const pkgData =
            typeof matchingPackage.packageData === 'string'
              ? JSON.parse(matchingPackage.packageData)
              : matchingPackage.packageData;

          unityMetadata = {
            topic: matchingPackage.title,
            vibe: pkgData?.vibe || pkgData?.config?.vibe,
            character1: pkgData?.character1 || pkgData?.config?.character1,
            character2: pkgData?.character2 || pkgData?.config?.character2,
            style: pkgData?.style || pkgData?.config?.style,
            battleType: pkgData?.battleType || pkgData?.config?.battleType,
            lyrics: pkgData?.lyrics,
          };
        }
      }

      // Generate metadata
      const metadata = await youtubeMetadataGenerator.generateMetadata({
        jobName: job.scriptName || 'AI Video',
        mode: job.mode || 'veo',
        aspectRatio: job.aspectRatio || '9:16',
        unityMetadata,
        duration: job.duration || undefined,
        generatedClipsCount: job.unityMetadata?.promptCount,
      });

      res.json({ success: true, data: metadata });
    } catch (error: any) {
      console.error('Generate metadata error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Generate thumbnail for YouTube
  router.post('/generate-thumbnail', async (req, res) => {
    try {
      const { youtubeMetadataGenerator } = await import('../services/youtube-metadata-generator');
      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt is required' });
      }

      const thumbnailUrl = await youtubeMetadataGenerator.generateThumbnail(prompt);

      if (thumbnailUrl) {
        res.json({ success: true, data: { thumbnailUrl } });
      } else {
        res.status(500).json({ success: false, error: 'Failed to generate thumbnail' });
      }
    } catch (error: any) {
      console.error('Generate thumbnail error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update thumbnail for existing YouTube video
  router.post('/set-thumbnail/:videoId', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const { videoId } = req.params;
      const { thumbnailPath } = req.body;

      if (!thumbnailPath) {
        return res.status(400).json({ success: false, error: 'thumbnailPath is required' });
      }

      const isAuth = await youtubeUploadService.isAuthenticated();
      if (!isAuth) {
        return res.status(401).json({ success: false, error: 'YouTube not authenticated' });
      }

      const result = await youtubeUploadService.setThumbnail(videoId, thumbnailPath);

      if (result.success) {
        res.json({ success: true, data: { videoId } });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error('Set thumbnail error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Upload job video to YouTube with auto-generated metadata
  router.post('/upload-job', authMiddleware, async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const { youtubeMetadataGenerator } = await import('../services/youtube-metadata-generator');
      const { jobId, customMetadata, channelConnectionId, scheduledUploadTime } = req.body;

      console.log(
        `\n📤 [UPLOAD] Upload request - jobId: ${jobId}, channelConnectionId: ${channelConnectionId || 'default'}, scheduled: ${scheduledUploadTime || 'now'}`,
      );

      if (!jobId) {
        return res.status(400).json({ success: false, error: 'jobId is required' });
      }

      // Verify job ownership
      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }
      if (job.userId && job.userId !== req.user!.id) {
        return res.status(403).json({ success: false, error: 'Unauthorized' });
      }

      // Handle scheduled uploads - convert to publishAt for YouTube's native scheduler
      let publishAt: string | undefined;
      if (scheduledUploadTime) {
        const scheduledDate = new Date(scheduledUploadTime);
        const now = new Date();

        if (scheduledDate <= now) {
          return res.status(400).json({
            success: false,
            error: 'Scheduled time must be in the future',
          });
        }

        publishAt = scheduledDate.toISOString();
        console.log(`⏰ [UPLOAD] Will use YouTube's scheduler - publishAt: ${publishAt}`);
      }

      // Load and use the selected connected channel
      let selectedChannelData = null;
      if (channelConnectionId) {
        const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
        if (existsSync(channelsFile)) {
          const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
          selectedChannelData = channels.find((c: any) => c.id === channelConnectionId);

          if (!selectedChannelData) {
            console.log(`❌ [UPLOAD] Channel connection not found: ${channelConnectionId}`);
            return res.status(404).json({ success: false, error: 'Selected channel not found' });
          }

          if (selectedChannelData.status !== 'active') {
            console.log(`❌ [UPLOAD] Channel not active: ${selectedChannelData.title}`);
            return res
              .status(401)
              .json({ success: false, error: `Channel '${selectedChannelData.title}' is not active` });
          }

          console.log(
            `✅ [UPLOAD] Using connected channel: ${selectedChannelData.title} (${selectedChannelData.channelId})`,
          );
        }
      }

      if (!channelConnectionId || !selectedChannelData) {
        // Fallback to default authentication
        const isAuth = await youtubeUploadService.isAuthenticated();
        if (!isAuth) {
          console.log(`❌ [UPLOAD] No channel selected and default not authenticated`);
          return res.status(401).json({ success: false, error: 'Please select a YouTube channel' });
        }
        console.log(`✅ [UPLOAD] Using default channel (fallback)`);
      }

      // Job already verified and loaded earlier (line 10237)
      if (job.status !== 'completed') {
        return res.status(400).json({ success: false, error: 'Job is not completed' });
      }

      // Check if already uploaded to YouTube (prevent duplicates)
      const jobData = job as any;
      if (jobData.youtubeVideoId) {
        return res.status(400).json({
          success: false,
          error: `Already uploaded to YouTube: https://www.youtube.com/watch?v=${jobData.youtubeVideoId}`,
          existingVideoId: jobData.youtubeVideoId,
        });
      }

      // Find the video file
      let videoPath: string | null = null;

      // For music mode jobs, use video_url directly
      if (job.mode === 'music' && job.videoUrl) {
        const filename = job.videoUrl.replace('/api/videos/', '');
        videoPath = join(process.cwd(), 'data', 'videos', 'renders', filename);

        if (!existsSync(videoPath)) {
          videoPath = join(process.cwd(), 'attached_assets', 'veo_videos', filename);
        }

        console.log(`📹 Music mode job - video path: ${videoPath}`);
      }
      // For Unity Kling jobs, look for the final assembled video
      else if (job.mode === 'unity_kling') {
        const packages = await storage.listUnityContentPackages();
        // Try matching by various name formats
        const jobBaseName = job.scriptName
          ?.replace(' - Unity Kling', '')
          ?.replace(' - Unity VEO', '')
          ?.replace(' - Auto', '');
        const matchingPackage = packages.find((pkg: any) => {
          const pkgData = typeof pkg.packageData === 'string' ? JSON.parse(pkg.packageData) : pkg.packageData;
          return (
            pkg.title === jobBaseName ||
            pkg.title === job.scriptName ||
            pkgData?.jobId === job.id ||
            pkgData?.topic === jobBaseName
          );
        });

        if (matchingPackage) {
          const pkgData =
            typeof matchingPackage.packageData === 'string'
              ? JSON.parse(matchingPackage.packageData)
              : matchingPackage.packageData;

          if (pkgData?.finalVideoUrl) {
            // Convert URL to file path
            const filename = pkgData.finalVideoUrl.replace('/api/videos/', '');
            videoPath = join(process.cwd(), 'data', 'videos', 'renders', filename);

            if (!existsSync(videoPath)) {
              videoPath = join(process.cwd(), 'attached_assets', 'veo_videos', filename);
            }
          }
        }
      }

      if (!videoPath || !existsSync(videoPath)) {
        console.error(
          `❌ Video file not found. Job mode: ${job.mode}, videoUrl: ${job.videoUrl}, attempted path: ${videoPath}`,
        );
        return res.status(404).json({ success: false, error: 'Video file not found for this job' });
      }

      console.log(`✅ Found video file: ${videoPath}`);

      // Use custom metadata or generate new
      let metadata = customMetadata;
      if (!metadata || !metadata.title) {
        // Get Unity package data for metadata generation
        let unityMetadata: any = undefined;
        if (job.mode === 'unity_kling') {
          const packages = await storage.listUnityContentPackages();
          const jobBaseName2 = job.scriptName
            ?.replace(' - Unity Kling', '')
            ?.replace(' - Unity VEO', '')
            ?.replace(' - Auto', '');
          const matchingPackage = packages.find((pkg: any) => {
            const pkgData = typeof pkg.packageData === 'string' ? JSON.parse(pkg.packageData) : pkg.packageData;
            return (
              pkg.title === jobBaseName2 ||
              pkg.title === job.scriptName ||
              pkgData?.jobId === job.id ||
              pkgData?.topic === jobBaseName2
            );
          });

          if (matchingPackage) {
            const pkgData =
              typeof matchingPackage.packageData === 'string'
                ? JSON.parse(matchingPackage.packageData)
                : matchingPackage.packageData;

            // Extract the actual topic/figure name from package data
            const topicName =
              pkgData?.topic || pkgData?.figure || matchingPackage.title?.replace(' - Auto', '') || 'Historical Figure';

            unityMetadata = {
              topic: topicName,
              vibe: pkgData?.vibe || pkgData?.config?.vibe || 'Energetic',
              character1: pkgData?.character1 || pkgData?.config?.character1 || { name: topicName },
              character2: pkgData?.character2 || pkgData?.config?.character2,
              style: pkgData?.style || pkgData?.config?.style || 'Cinematic',
              battleType: pkgData?.battleType || pkgData?.config?.battleType || 'Solo Historical Rap',
              lyrics: pkgData?.lyrics,
              hook: pkgData?.hook || pkgData?.optimizedHook,
              story: pkgData?.story,
            };

            console.log(`📝 Extracted metadata for upload: topic="${topicName}", has lyrics: ${!!pkgData?.lyrics}`);
          }
        }

        metadata = await youtubeMetadataGenerator.generateMetadata({
          jobName: job.scriptName || 'AI Video',
          mode: job.mode || 'veo',
          aspectRatio: job.aspectRatio || '9:16',
          unityMetadata,
          duration: job.duration || undefined,
        });
      }

      // Parse unityMetadata if it's a string (declared outside try block for later use)
      let parsedUnityMetadata: any = null;
      if (job.unityMetadata) {
        try {
          parsedUnityMetadata =
            typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;
        } catch (parseErr) {
          console.log('⚠️ Could not parse unityMetadata, using fallback values');
        }
      }

      // Generate AI historical thumbnail
      let thumbnailPath: string | null = null;
      try {
        // Extract character names and topic from Unity metadata
        const topic =
          metadata.title?.replace(/[🔥💥⚔️🎵🎬]/g, '').trim() ||
          job.scriptName?.replace(' - Unity Kling', '')?.replace(' - Unity VEO', '') ||
          'Historical Figure';
        const character1Name = parsedUnityMetadata?.character1?.name || parsedUnityMetadata?.character1?.type;
        const character2Name = parsedUnityMetadata?.character2?.name || parsedUnityMetadata?.character2?.type;

        console.log(`🎨 Generating AI historical thumbnail for "${topic}"...`);

        // Generate the AI thumbnail with historical figure and era background
        const thumbnailUrl = await youtubeMetadataGenerator.generateHistoricalThumbnail(
          topic,
          character1Name,
          character2Name,
        );

        if (thumbnailUrl) {
          // Download thumbnail to local file
          thumbnailPath = join(process.cwd(), 'data', 'thumbnails', `${jobId}_thumbnail.png`);
          const downloaded = await youtubeMetadataGenerator.downloadThumbnail(thumbnailUrl, thumbnailPath);

          if (!downloaded) {
            console.log('⚠️ Failed to download AI thumbnail, will proceed without custom thumbnail');
            thumbnailPath = null;
          } else {
            console.log(`✅ AI historical thumbnail ready: ${thumbnailPath}`);
          }
        }
      } catch (thumbError: any) {
        console.log(`⚠️ AI thumbnail generation failed: ${thumbError.message}, proceeding without custom thumbnail`);
        thumbnailPath = null;
      }

      // Upload to YouTube with thumbnail using selected channel credentials
      console.log(`📤 Uploading job ${jobId} to YouTube: ${metadata.title}`);
      let result;

      if (selectedChannelData) {
        // Create a temporary OAuth client with this channel's credentials
        const { google } = await import('googleapis');
        const oauth2Client = new google.auth.OAuth2(
          process.env.YOUTUBE_CLIENT_ID,
          process.env.YOUTUBE_CLIENT_SECRET,
          process.env.YOUTUBE_REDIRECT_URI,
        );

        oauth2Client.setCredentials({
          access_token: selectedChannelData.accessToken,
          refresh_token: selectedChannelData.refreshToken,
          expiry_date: selectedChannelData.expiryDate,
        });

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        // Upload video
        console.log(`🎯 [UPLOAD] Uploading to: ${selectedChannelData.title}`);
        const videoMetadata: any = {
          snippet: {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags || [],
            categoryId: metadata.categoryId || '10',
          },
          status: {
            privacyStatus: publishAt ? 'private' : metadata.privacyStatus || 'private',
            selfDeclaredMadeForKids: false,
          },
        };

        // Add scheduled publish time if provided (YouTube's native scheduler)
        if (publishAt) {
          videoMetadata.status.publishAt = publishAt;
          console.log(`⏰ Scheduling YouTube publish for: ${publishAt}`);
        }

        // Use resumable upload for large files (>100MB)
        const fileStats = statSync(videoPath);
        const fileSizeInBytes = fileStats.size;
        const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

        console.log(`📊 [UPLOAD] File size: ${fileSizeInMB.toFixed(2)} MB`);

        const uploadResponse = await youtube.videos.insert(
          {
            part: ['snippet', 'status'],
            requestBody: videoMetadata,
            media: {
              body: createReadStream(videoPath),
            },
          },
          {
            // Enable resumable uploads for large files
            onUploadProgress: (evt) => {
              const progress = (evt.bytesRead / fileSizeInBytes) * 100;
              if (evt.bytesRead % (10 * 1024 * 1024) === 0 || progress === 100) {
                console.log(
                  `   📤 Upload progress: ${progress.toFixed(1)}% (${(evt.bytesRead / (1024 * 1024)).toFixed(1)}MB)`,
                );
              }
            },
          },
        );

        const videoId = uploadResponse.data.id;
        result = {
          success: true,
          videoId,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
          title: metadata.title,
        };

        // Set thumbnail if available
        if (thumbnailPath && videoId) {
          try {
            await youtube.thumbnails.set({
              videoId,
              media: {
                body: createReadStream(thumbnailPath),
              },
            });
            console.log(`🖼️ [UPLOAD] Thumbnail set successfully`);
          } catch (thumbErr) {
            console.log(`⚠️ [UPLOAD] Failed to set thumbnail: ${thumbErr}`);
          }
        }
      } else {
        // Upload to default channel
        console.log(`🎯 [UPLOAD] Uploading to default channel (fallback)`);
        result = await youtubeUploadService.uploadVideoWithThumbnail(
          videoPath,
          {
            title: metadata.title,
            description: metadata.description,
            tags: metadata.tags || [],
            categoryId: metadata.categoryId || '10',
            privacyStatus: metadata.privacyStatus || 'private',
          },
          thumbnailPath || undefined,
        );
      }

      if (result.success) {
        console.log(`✅ YouTube upload complete: ${result.videoUrl}`);

        // Save YouTube video ID and channel connection ID to job
        try {
          const updateData: any = { youtubeVideoId: result.videoId };
          if (channelConnectionId) {
            updateData.youtubeChannelConnectionId = channelConnectionId;
          } else if (selectedChannelData?.id) {
            updateData.youtubeChannelConnectionId = selectedChannelData.id;
          }
          await storage.updateJob(jobId, updateData);
          console.log(`💾 Saved YouTube video ID ${result.videoId} and channel ID to job ${jobId}`);
        } catch (saveErr: any) {
          console.warn(`⚠️ Could not save YouTube video ID to job: ${saveErr.message}`);
        }

        // Link theme tracking: update video_theme_applications with YouTube video ID
        if (parsedUnityMetadata?.packageId && result.videoId) {
          try {
            const { videoInsightsService } = await import('../services/video-insights-service');
            const linkSuccess = await videoInsightsService.updateVideoId(parsedUnityMetadata.packageId, result.videoId);
            if (linkSuccess) {
              console.log(`📊 Theme tracking: linked package ${parsedUnityMetadata.packageId} → ${result.videoId}`);
            }
          } catch (insightError: any) {
            console.warn(`⚠️ Theme tracking link failed: ${insightError.message}`);
          }
        }
      }

      res.json({ success: result.success, data: result });
    } catch (error: any) {
      console.error('YouTube upload job error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Bulk schedule multiple videos across days
  router.post('/bulk-schedule', authMiddleware, async (req, res) => {
    try {
      const { jobIds, startDate, daysToSpread, uploadsPerDay, channelConnectionId } = req.body;

      if (!jobIds || !Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({ success: false, error: 'jobIds array is required' });
      }

      // Load available channels
      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');
      let availableChannels: any[] = [];
      let selectedChannel = null;

      if (existsSync(channelsFile)) {
        const channels = JSON.parse(readFileSync(channelsFile, 'utf-8'));
        availableChannels = channels.filter((c: any) => c.status === 'active');

        // Use provided channel or pick first active channel
        if (channelConnectionId) {
          selectedChannel = availableChannels.find((c: any) => c.id === channelConnectionId);
        } else if (availableChannels.length > 0) {
          selectedChannel = availableChannels[0]; // Use first channel as default
        }
      }

      if (!selectedChannel) {
        return res.status(400).json({
          success: false,
          error: 'No active YouTube channels found. Please connect a channel first.',
        });
      }

      console.log(`\n📅 [BULK SCHEDULE] Scheduling ${jobIds.length} videos to ${selectedChannel.title}`);

      // Defaults
      const start = startDate ? new Date(startDate) : new Date();
      const days = daysToSpread || Math.ceil(jobIds.length / (uploadsPerDay || 2));
      const perDay = uploadsPerDay || Math.ceil(jobIds.length / days);

      console.log(`📊 Distribution: ${days} days, ${perDay} per day`);

      // Verify all jobs exist and belong to user
      const jobs = await Promise.all(
        jobIds.map(async (jobId: string) => {
          const job = await storage.getJob(jobId);
          if (!job) {
            throw new Error(`Job not found: ${jobId}`);
          }
          if (job.userId && job.userId !== req.user!.id) {
            throw new Error(`Unauthorized access to job: ${jobId}`);
          }
          if (job.status !== 'completed') {
            throw new Error(`Job not completed: ${jobId}`);
          }
          return job;
        }),
      );

      // Calculate schedule distribution
      const schedule: Array<{
        jobId: string;
        scriptName: string;
        scheduledTime: Date;
        channelId: string;
        channelName: string;
      }> = [];

      // Optimal posting times (based on Thompson Sampling best practices)
      // Spread across peak hours: 12pm, 2pm, 4pm, 6pm, 8pm
      const optimalHours = [12, 14, 16, 18, 20];

      let currentDay = 0;
      let videosScheduledToday = 0;

      for (let i = 0; i < jobIds.length; i++) {
        // Calculate which day and time slot
        const dayOffset = currentDay;
        const hourIndex = videosScheduledToday % optimalHours.length;
        const hour = optimalHours[hourIndex];

        // Create scheduled time
        const scheduledTime = new Date(start);
        scheduledTime.setDate(start.getDate() + dayOffset);
        scheduledTime.setHours(hour, 0, 0, 0);

        schedule.push({
          jobId: jobIds[i],
          scriptName: jobs[i].scriptName || `Job ${jobIds[i].slice(0, 8)}`,
          scheduledTime,
          channelId: selectedChannel.id,
          channelName: selectedChannel.title,
        });

        videosScheduledToday++;

        // Move to next day if we've hit the per-day limit
        if (videosScheduledToday >= perDay) {
          currentDay++;
          videosScheduledToday = 0;
        }
      }

      // Update jobs with scheduled times AND channel in database
      const { eq } = await import('drizzle-orm');
      const { jobs: jobsTable } = await import('@shared/schema');

      for (const item of schedule) {
        // Get existing metadata
        const job = jobs.find((j) => j.id === item.jobId);
        const existingMetadata = job?.unityMetadata
          ? typeof job.unityMetadata === 'string'
            ? JSON.parse(job.unityMetadata)
            : job.unityMetadata
          : {};

        // Update with channel info
        const updatedMetadata = {
          ...existingMetadata,
          channelConnectionId: selectedChannel.id,
          scheduledChannel: selectedChannel.title,
        };

        await db
          .update(jobsTable)
          .set({
            scheduledTime: item.scheduledTime,
            youtubeChannelConnectionId: selectedChannel.id,
            unityMetadata: updatedMetadata,
          })
          .where(eq(jobsTable.id, item.jobId));

        console.log(`⏰ ${item.scriptName} → ${selectedChannel.title} @ ${item.scheduledTime.toLocaleString()}`);
      }

      console.log(`✅ [BULK SCHEDULE] Successfully scheduled ${schedule.length} videos`);

      res.json({
        success: true,
        data: {
          scheduled: schedule.length,
          channelName: selectedChannel.title,
          schedule: schedule.map((s) => ({
            jobId: s.jobId,
            scriptName: s.scriptName,
            scheduledTime: s.scheduledTime.toISOString(),
            formattedTime: s.scheduledTime.toLocaleString(),
            channelName: s.channelName,
          })),
          summary: {
            totalVideos: jobIds.length,
            daysUsed: currentDay + 1,
            videosPerDay: perDay,
            startDate: start.toLocaleDateString(),
            endDate: schedule[schedule.length - 1].scheduledTime.toLocaleDateString(),
            channel: selectedChannel.title,
          },
        },
      });
    } catch (error: any) {
      console.error('Bulk schedule error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Debug endpoint - get scheduled jobs
  router.get('/debug/scheduled-jobs', async (req, res) => {
    try {
      const { isNotNull } = await import('drizzle-orm');
      const { jobs: jobsTable } = await import('@shared/schema');

      const scheduledJobs = await db.select().from(jobsTable).where(isNotNull(jobsTable.scheduledTime)).limit(3);

      res.json({
        success: true,
        data: scheduledJobs.map((j) => ({
          id: j.id,
          scriptName: j.scriptName,
          scheduledTime: j.scheduledTime,
          youtubeChannelConnectionId: j.youtubeChannelConnectionId,
          unityMetadata: j.unityMetadata,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Force upload a scheduled job immediately
  router.post('/force-upload-now', async (req, res) => {
    try {
      const { scheduledUploadService } = await import('../services/scheduled-upload-service');
      const { jobId } = req.body;

      if (!jobId) {
        return res.status(400).json({ success: false, error: 'jobId is required' });
      }

      console.log(`🚀 [FORCE UPLOAD] Forcing immediate upload for job: ${jobId}`);

      await scheduledUploadService.forceUpload(jobId);

      res.json({
        success: true,
        message: 'Upload started immediately',
      });
    } catch (error: any) {
      console.error('Force upload error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Batch upload all completed jobs to YouTube
  router.post('/upload-all-completed', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const { youtubeMetadataGenerator } = await import('../services/youtube-metadata-generator');

      const isAuth = await youtubeUploadService.isAuthenticated();
      if (!isAuth) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated. Please connect YouTube account first.',
        });
      }

      // Get all completed jobs that haven't been uploaded yet
      const allJobs = await storage.listJobs();
      const completedJobs = allJobs.filter(
        (j: any) =>
          j.status === 'completed' &&
          j.videoUrl &&
          !j.youtubeVideoId &&
          (j.unityMetadata?.automationSource === 'unity_orchestrator' ||
            j.unityMetadata?.automationSource === 'video-scheduler'),
      );

      if (completedJobs.length === 0) {
        return res.json({
          success: true,
          message: 'No pending uploads found',
          data: { uploaded: 0, total: 0 },
        });
      }

      console.log(`\n📤 BATCH UPLOAD: ${completedJobs.length} videos pending YouTube upload`);

      const results: any[] = [];
      for (const job of completedJobs) {
        try {
          const videoFilename = (job.videoUrl || '').replace('/api/videos/', '');
          const videoPath = join(process.cwd(), 'data', 'videos', 'renders', videoFilename);

          if (!existsSync(videoPath)) {
            console.log(`   ⚠️ Skipping ${job.scriptName}: Video file not found`);
            results.push({ jobId: job.id, success: false, error: 'File not found' });
            continue;
          }

          const metadata = job.unityMetadata as any;

          // Generate YouTube metadata with proper VideoContentInfo structure
          console.log(`   📹 Generating metadata for: ${job.scriptName || 'Untitled'}`);
          const ytMetadata = await youtubeMetadataGenerator.generateMetadata({
            jobName: job.scriptName || 'Untitled',
            mode: job.mode || 'unity_kling',
            aspectRatio: job.aspectRatio || '9:16',
            unityMetadata: {
              topic: metadata?.topic || (job.scriptName || 'Untitled').replace(' - Unity Kling', ''),
              hook: metadata?.optimizedHook || metadata?.hook || job.scriptContent || '',
              story: metadata?.story || job.scriptContent,
              vibe: metadata?.vibe || 'epic',
              style: metadata?.style || 'cinematic',
            } as any,
          });

          console.log(`   📤 Uploading to YouTube: ${ytMetadata.title}`);
          const result = await youtubeUploadService.uploadVideo(videoPath, {
            title: ytMetadata.title,
            description: ytMetadata.description,
            tags: ytMetadata.tags,
            privacyStatus: 'private', // Start private, user can make public
          });

          if (result.success && result.videoId) {
            console.log(`   ✅ Uploaded: ${job.scriptName} → ${result.videoUrl}`);

            // Save YouTube video ID to job
            await storage.updateJob(job.id, { youtubeVideoId: result.videoId } as any);
            results.push({
              jobId: job.id,
              title: job.scriptName,
              success: true,
              videoId: result.videoId,
              videoUrl: result.videoUrl,
            });
          } else {
            console.log(`   ❌ Failed: ${job.scriptName} - ${result.error}`);
            results.push({ jobId: job.id, title: job.scriptName, success: false, error: result.error });
          }

          // Delay between uploads to avoid rate limits
          await new Promise((r) => setTimeout(r, 3000));
        } catch (uploadErr: any) {
          console.error(`   ❌ Failed: ${job.scriptName} - ${uploadErr.message}`);
          results.push({ jobId: job.id, title: job.scriptName, success: false, error: uploadErr.message });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      console.log(`\n✅ BATCH UPLOAD COMPLETE: ${successCount}/${completedJobs.length} uploaded`);

      res.json({
        success: true,
        data: {
          uploaded: successCount,
          total: completedJobs.length,
          results,
        },
      });
    } catch (error: any) {
      console.error('Batch upload error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update a single YouTube video's metadata
  router.post('/update-video/:videoId', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const { youtubeMetadataGenerator } = await import('../services/youtube-metadata-generator');

      const isAuth = await youtubeUploadService.isAuthenticated();
      if (!isAuth) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const { videoId } = req.params;
      const { topic, story } = req.body;

      if (!topic) {
        return res.status(400).json({ success: false, error: 'topic is required in body' });
      }

      console.log(`📝 Updating video ${videoId} with topic: ${topic}`);

      // Generate proper history-focused metadata
      const ytMetadata = await youtubeMetadataGenerator.generateMetadata({
        jobName: topic,
        mode: 'unity_kling',
        aspectRatio: '9:16',
        unityMetadata: {
          topic: topic,
          story: story || topic,
          vibe: 'epic',
          style: 'cinematic',
        } as any,
      });

      // Update the video on YouTube
      const result = await youtubeUploadService.updateVideoMetadata(videoId, {
        title: ytMetadata.title,
        description: ytMetadata.description,
        tags: ytMetadata.tags,
      });

      if (result.success) {
        console.log(`✅ Updated: ${topic} → "${ytMetadata.title}"`);
        res.json({ success: true, data: { videoId, newTitle: ytMetadata.title } });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error('Update video error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Update a YouTube video's title by searching for it (find by current title)
  router.post('/update-title-by-search', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');

      const isAuth = await youtubeUploadService.isAuthenticated();
      if (!isAuth) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      const { searchTerm, newTitle } = req.body;

      if (!searchTerm || !newTitle) {
        return res.status(400).json({ success: false, error: 'searchTerm and newTitle are required' });
      }

      console.log(`🔍 Searching for video containing: "${searchTerm}"`);

      // Get recent videos from the channel
      const videos = await youtubeUploadService.getVideoStats(50);

      // Find video matching the search term
      const matchedVideo = videos.find((v: any) => v.title.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchedVideo) {
        return res.status(404).json({
          success: false,
          error: `No video found containing "${searchTerm}"`,
          availableVideos: videos.map((v: any) => v.title).slice(0, 10),
        });
      }

      console.log(`📝 Found video: "${matchedVideo.title}" (${matchedVideo.videoId})`);
      console.log(`📝 Updating to: "${newTitle}"`);

      // Update the video's title directly (without regenerating metadata)
      const result = await youtubeUploadService.updateVideoMetadata(matchedVideo.videoId, {
        title: newTitle,
      });

      if (result.success) {
        console.log(`✅ Updated: "${matchedVideo.title}" → "${newTitle}"`);
        res.json({
          success: true,
          data: {
            videoId: matchedVideo.videoId,
            oldTitle: matchedVideo.title,
            newTitle,
          },
        });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error('Update title error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Fix titles of already-uploaded videos with proper history-focused titles
  router.post('/fix-titles', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const { youtubeMetadataGenerator } = await import('../services/youtube-metadata-generator');

      const isAuth = await youtubeUploadService.isAuthenticated();
      if (!isAuth) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated. Please connect YouTube account first.',
        });
      }

      // Get all jobs that have been uploaded to YouTube
      const allJobs = await storage.listJobs();
      const uploadedJobs = allJobs.filter((j: any) => j.status === 'completed' && j.youtubeVideoId);

      if (uploadedJobs.length === 0) {
        return res.json({
          success: true,
          message: 'No uploaded videos found',
          data: { fixed: 0, total: 0 },
        });
      }

      console.log(`\n📝 FIXING TITLES: ${uploadedJobs.length} videos to update`);

      const results: any[] = [];
      for (const job of uploadedJobs) {
        try {
          const metadata = job.unityMetadata as any;
          const topic =
            metadata?.topic || (job.scriptName || 'Untitled')?.replace(' - Unity Kling', '') || 'Historical Figure';

          console.log(`   📝 Regenerating title for: ${topic}`);

          // Generate proper history-focused metadata
          const ytMetadata = await youtubeMetadataGenerator.generateMetadata({
            jobName: job.scriptName || 'Untitled',
            mode: job.mode || 'unity_kling',
            aspectRatio: job.aspectRatio || '9:16',
            unityMetadata: {
              topic: topic,
              hook: metadata?.optimizedHook || metadata?.hook || job.scriptContent || '',
              story: metadata?.story || job.scriptContent,
              vibe: metadata?.vibe || 'epic',
              style: metadata?.style || 'cinematic',
            } as any,
          });

          // Update the video on YouTube
          const updateResult = await youtubeUploadService.updateVideoMetadata(job.youtubeVideoId || '', {
            title: ytMetadata.title,
            description: ytMetadata.description,
            tags: ytMetadata.tags,
          });

          if (updateResult.success) {
            console.log(`   ✅ Fixed: ${topic} → "${ytMetadata.title}"`);
            results.push({
              jobId: job.id,
              topic,
              videoId: job.youtubeVideoId,
              newTitle: ytMetadata.title,
              success: true,
            });
          } else {
            console.log(`   ❌ Failed: ${topic} - ${updateResult.error}`);
            results.push({ jobId: job.id, topic, success: false, error: updateResult.error });
          }

          // Delay between API calls
          await new Promise((r) => setTimeout(r, 1000));
        } catch (err: any) {
          console.error(`   ❌ Error: ${job.scriptName} - ${err.message}`);
          results.push({ jobId: job.id, success: false, error: err.message });
        }
      }

      const successCount = results.filter((r) => r.success).length;
      console.log(`\n✅ TITLE FIX COMPLETE: ${successCount}/${uploadedJobs.length} fixed`);

      res.json({
        success: true,
        data: {
          fixed: successCount,
          total: uploadedJobs.length,
          results,
        },
      });
    } catch (error: any) {
      console.error('Fix titles error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Disconnect YouTube
  router.post('/disconnect', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      youtubeUploadService.disconnect();
      res.json({ success: true, message: 'YouTube disconnected' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get YouTube Analytics - video statistics
  router.get('/analytics', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');

      const isAuth = await youtubeUploadService.isAuthenticated();
      if (!isAuth) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated. Please connect YouTube account first.',
        });
      }

      const maxResults = parseInt(req.query.maxResults as string) || 50;
      const stats = await youtubeUploadService.getVideoStats(maxResults);

      // Calculate totals
      const totals = stats.reduce(
        (acc, video) => ({
          totalViews: acc.totalViews + video.viewCount,
          totalLikes: acc.totalLikes + video.likeCount,
          totalComments: acc.totalComments + video.commentCount,
        }),
        { totalViews: 0, totalLikes: 0, totalComments: 0 },
      );

      res.json({
        success: true,
        data: {
          videos: stats,
          totals,
          videoCount: stats.length,
        },
      });
    } catch (error: any) {
      console.error('YouTube analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get analytics for ALL videos across ALL connected channels
  router.get('/analytics/all', optionalAuthMiddleware, async (req, res) => {
    try {
      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');

      if (!existsSync(channelsFile)) {
        return res.json({ data: [] });
      }

      const rawData = readFileSync(channelsFile, 'utf-8');
      const allChannels = JSON.parse(rawData);

      if (!Array.isArray(allChannels)) {
        return res.json({ data: [] });
      }

      // Filter channels for this user, or show all if not authenticated (dev mode)
      let userChannels;
      if (req.user) {
        userChannels = allChannels.filter((c: any) => c.userId === req.user!.id && c.status === 'active');
      } else {
        // No user - show all active channels (dev mode)
        userChannels = allChannels.filter((c: any) => c.status === 'active');
      }

      if (userChannels.length === 0) {
        return res.json({ data: [] });
      }

      // Fetch videos from YouTube API for each channel
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const allVideos: any[] = [];

      for (const channel of userChannels) {
        try {
          console.log(`[ANALYTICS ALL] Fetching videos for channel: ${channel.title}`);

          // Get videos from YouTube API using channel credentials
          const { google } = await import('googleapis');
          const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);

          oauth2Client.setCredentials({
            access_token: channel.accessToken,
            refresh_token: channel.refreshToken,
          });

          const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

          // Get recent uploads
          const response = await youtube.search.list({
            part: ['id'],
            channelId: channel.channelId,
            maxResults: 50,
            order: 'date',
            type: ['video'],
          });

          if (!response.data.items || response.data.items.length === 0) {
            console.log(`[ANALYTICS ALL] No videos found for ${channel.title}`);
            continue;
          }

          const videoIds = (response.data.items || []).map((item: any) => item.id?.videoId).filter(Boolean);

          if (videoIds.length === 0) continue;

          // Get video statistics
          const statsResponse = await youtube.videos.list({
            part: ['snippet', 'statistics', 'contentDetails'],
            id: videoIds,
          });

          const videos = (statsResponse.data.items || []).map((video: any) => {
            const stats = video.statistics || {};
            const snippet = video.snippet || {};

            return {
              id: video.id,
              videoId: video.id,
              title: snippet.title || 'Untitled',
              views: parseInt(stats.viewCount || '0'),
              likes: parseInt(stats.likeCount || '0'),
              comments: parseInt(stats.commentCount || '0'),
              watchTime: 0, // Not available from basic API
              ctr: 0, // Not available from basic API
              avgViewDuration: 0, // Not available from basic API
              publishedAt: snippet.publishedAt,
              channelId: channel.channelId,
              channelTitle: channel.title,
              thumbnailUrl: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
            };
          });

          allVideos.push(...videos);
        } catch (error: any) {
          console.error(`[ANALYTICS ALL] Error fetching videos for ${channel.title}:`, error.message);
        }
      }

      // Sort by publishedAt desc
      allVideos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

      console.log(`[ANALYTICS ALL] Returning ${allVideos.length} videos from ${userChannels.length} channels`);
      res.json({ data: allVideos });
    } catch (error: any) {
      console.error('[ANALYTICS ALL] Error:', error);
      res.json({ data: [], error: error.message });
    }
  });

  // Get channel statistics and recent uploads for a specific channel
  router.get('/channel/:channelId/stats', optionalAuthMiddleware, async (req, res) => {
    try {
      const { channelId } = req.params;
      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');

      if (!existsSync(channelsFile)) {
        return res.status(404).json({ error: 'Channels file not found' });
      }

      const rawData = readFileSync(channelsFile, 'utf-8');
      const allChannels = JSON.parse(rawData);
      const channel = allChannels.find((c: any) => c.channelId === channelId && c.status === 'active');

      if (!channel) {
        return res.status(404).json({ error: 'Channel not found' });
      }

      // Use channel's OAuth credentials
      const { google } = await import('googleapis');
      const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);

      oauth2Client.setCredentials({
        access_token: channel.accessToken,
        refresh_token: channel.refreshToken,
      });

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      // Get channel statistics
      const channelResponse = await youtube.channels.list({
        part: ['statistics', 'snippet'],
        id: [channelId],
      });

      const channelData = channelResponse.data.items?.[0];
      const stats = channelData?.statistics || {};

      res.json({
        success: true,
        data: {
          subscriberCount: parseInt(stats.subscriberCount || '0'),
          viewCount: parseInt(stats.viewCount || '0'),
          videoCount: parseInt(stats.videoCount || '0'),
        },
      });
    } catch (error: any) {
      console.error('[CHANNEL STATS] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get stats for a specific video
  router.get('/analytics/:videoId', async (req, res) => {
    try {
      const { youtubeUploadService } = await import('../services/youtube-upload-service');

      const isAuth = await youtubeUploadService.isAuthenticated();
      if (!isAuth) {
        return res.status(401).json({
          success: false,
          error: 'Not authenticated. Please connect YouTube account first.',
        });
      }

      const stats = await youtubeUploadService.getVideoStatsById(req.params.videoId);
      if (!stats) {
        return res.status(404).json({ success: false, error: 'Video not found' });
      }

      res.json({ success: true, data: stats });
    } catch (error: any) {
      console.error('YouTube analytics error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get comprehensive CTR report for all videos
  router.get('/ctr-report', async (req, res) => {
    try {
      const { youtubeAnalyticsService } = await import('../services/youtube-analytics-service');
      const report = await youtubeAnalyticsService.getCTRReport();
      res.json({ success: true, data: report });
    } catch (error: any) {
      console.error('CTR report error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Get AI-generated video improvement suggestions
  router.get('/video-suggestions/:videoId', authMiddleware, async (req, res) => {
    try {
      const { videoId } = req.params;
      const { youtubeUploadService } = await import('../services/youtube-upload-service');

      // Get video stats from YouTube
      const stats = await youtubeUploadService.getVideoStatsById(videoId);

      if (!stats) {
        return res.status(404).json({ success: false, error: 'Video not found or stats not available' });
      }

      // Use Gemini to analyze performance and generate suggestions
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      if (!apiKey) throw new Error('No GEMINI_API_KEY found');
      const gemini = new GoogleGenerativeAI(apiKey);

      const model = gemini.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.7 },
        systemInstruction:
          'You are a YouTube optimization expert. Analyze video performance metrics and provide 3-5 actionable suggestions to improve views, CTR, and watch time. Be specific and data-driven.',
      });

      const result = await model.generateContent(
        `Analyze this video performance:\n\nTitle: ${stats.title}\nViews: ${stats.viewCount}\nLikes: ${stats.likeCount}\nComments: ${stats.commentCount}\nPublished: ${stats.publishedAt}\n\nProvide specific suggestions to improve performance.`,
      );

      const suggestions = result.response.text();

      // Track API cost
      const { apiCostTracker } = await import('../services/api-cost-tracker');
      const usage = result.response.usageMetadata;
      await apiCostTracker.trackGemini({
        model: 'gemini-2.5-flash',
        operation: 'video_suggestions',
        inputTokens: usage?.promptTokenCount || 0,
        outputTokens: usage?.candidatesTokenCount || 0,
        success: true,
      });

      res.json({ success: true, suggestions });
    } catch (error: any) {
      console.error('Error generating video suggestions:', error);
      res.status(500).json({ success: false, error: error.message || 'Failed to generate suggestions' });
    }
  });

  router.post('/fix-metadata', async (req, res) => {
    try {
      const { videoId, topic } = req.body;

      if (!videoId || !topic) {
        return res.status(400).json({ success: false, error: 'videoId and topic required' });
      }

      console.log(`\n🔧 FIXING METADATA for ${videoId} - Topic: ${topic}`);

      // Step 1: Discover unknown facts for viral hook
      const { factReconciliationService } = await import('../services/fact-reconciliation-service');
      const unknownFacts = await factReconciliationService.discoverUnknownFacts(topic);
      console.log(`   🔮 Unknown Fact: ${unknownFacts.unknownFact?.substring(0, 80)}...`);

      // Step 2: Generate new metadata using the metadata generator
      const { youtubeMetadataGenerator } = await import('../services/youtube-metadata-generator');
      const videoInfo = {
        jobName: topic,
        mode: 'kling' as const,
        aspectRatio: '9:16',
        unityMetadata: {
          topic: topic,
          style: 'Documentary',
          vibe: 'Epic',
          unknownFact: unknownFacts.unknownFact,
          hookAngle: unknownFacts.hookAngle,
        },
      };

      const newMetadata = await youtubeMetadataGenerator.generateMetadata(videoInfo);
      console.log(`   📝 New Title: ${newMetadata.title}`);

      // Step 3: Update video on YouTube
      const { youtubeUploadService } = await import('../services/youtube-upload-service');
      const updateResult = await youtubeUploadService.updateVideoMetadata(videoId, {
        title: newMetadata.title,
        description: newMetadata.description,
        tags: newMetadata.tags,
      });

      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to update YouTube');
      }

      console.log(`   ✅ Video ${videoId} metadata updated!`);

      res.json({
        success: true,
        videoId,
        topic,
        unknownFact: unknownFacts.unknownFact,
        newTitle: newMetadata.title,
        newDescription: newMetadata.description?.substring(0, 200) + '...',
      });
    } catch (error: any) {
      console.error('Fix metadata error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Batch fix multiple videos
  router.post('/fix-metadata-batch', async (req, res) => {
    try {
      const { videos } = req.body; // Array of { videoId, topic }

      if (!videos || !Array.isArray(videos) || videos.length === 0) {
        return res.status(400).json({ success: false, error: 'videos array required' });
      }

      console.log(`\n🔧 BATCH FIXING ${videos.length} VIDEOS`);

      const results: any[] = [];
      const { factReconciliationService } = await import('../services/fact-reconciliation-service');
      const { youtubeMetadataGenerator } = await import('../services/youtube-metadata-generator');
      const { youtubeUploadService } = await import('../services/youtube-upload-service');

      for (const { videoId, topic } of videos) {
        try {
          console.log(`\n   📺 Processing: ${topic} (${videoId})`);

          // Discover unknown facts
          const unknownFacts = await factReconciliationService.discoverUnknownFacts(topic);

          // Generate new metadata
          const videoInfo = {
            jobName: topic,
            mode: 'kling' as const,
            aspectRatio: '9:16',
            unityMetadata: {
              topic: topic,
              style: 'Documentary',
              vibe: 'Epic',
              unknownFact: unknownFacts.unknownFact,
              hookAngle: unknownFacts.hookAngle,
            },
          };

          const newMetadata = await youtubeMetadataGenerator.generateMetadata(videoInfo);

          // Update on YouTube
          const updateResult = await youtubeUploadService.updateVideoMetadata(videoId, {
            title: newMetadata.title,
            description: newMetadata.description,
            tags: newMetadata.tags,
          });

          results.push({
            videoId,
            topic,
            success: updateResult.success,
            newTitle: newMetadata.title,
            unknownFact: unknownFacts.unknownFact?.substring(0, 100),
            error: updateResult.error,
          });

          console.log(`      ✅ ${updateResult.success ? 'Updated' : 'Failed'}: ${newMetadata.title}`);

          // Small delay to avoid rate limits
          await new Promise((r) => setTimeout(r, 1000));
        } catch (err: any) {
          results.push({
            videoId,
            topic,
            success: false,
            error: err.message,
          });
          console.log(`      ❌ Error: ${err.message}`);
        }
      }

      const successCount = results.filter((r) => r.success).length;
      console.log(`\n🎬 BATCH COMPLETE: ${successCount}/${videos.length} videos updated`);

      res.json({
        success: true,
        totalProcessed: videos.length,
        successCount,
        results,
      });
    } catch (error: any) {
      console.error('Batch fix error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ============================================================================
  // YOUTUBE QUOTA MANAGEMENT API
  // ============================================================================

  // Get YouTube quota status
  router.get('/quota', async (req, res) => {
    try {
      const { youtubeQuotaManager } = await import('../services/youtube-quota-manager');
      const status = youtubeQuotaManager.getQuotaStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error('Get quota status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Check if upload is possible
  router.get('/quota/can-upload', async (req, res) => {
    try {
      const { youtubeQuotaManager } = await import('../services/youtube-quota-manager');
      const result = youtubeQuotaManager.canUpload();
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Check upload capacity error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

export default router;
