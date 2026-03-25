/**
 * Rumble Routes
 *
 * Rumble API, cross-platform streaming.
 */

import { Router } from 'express';


const router = Router();





  // ============================================================================
  // RUMBLE API - Video Streaming as Livestream
  // ============================================================================

  // Get Rumble connection status
  router.get('/rumble/status', async (req, res) => {
    try {
      const { rumbleUploadService } = await import('../services/rumble-upload-service');
      const config = rumbleUploadService.getConfig();
      const isConfigured = rumbleUploadService.isConfigured();

      let stats = null;
      if (config.hasApiKey) {
        stats = await rumbleUploadService.getStats();
      }

      res.json({
        success: true,
        data: {
          configured: isConfigured,
          hasApiKey: config.hasApiKey,
          channelId: config.channelId || null,
          username: stats?.username || null,
          followers: stats?.followers?.num_followers_total || 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Upload video to Rumble as livestream
  router.post('/rumble/upload', async (req, res) => {
    try {
      const { rumbleUploadService } = await import('../services/rumble-upload-service');
      const { videoPath, figure, era, hook } = req.body;

      if (!videoPath) {
        return res.status(400).json({ success: false, error: 'videoPath is required' });
      }

      const result = await rumbleUploadService.uploadVideo(
        videoPath,
        figure || 'Historical Figure',
        era || 'Unknown Era',
        hook || 'The untold story',
      );

      res.json({ success: result.success, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get Rumble channel stats
  router.get('/rumble/stats', async (req, res) => {
    try {
      const { rumbleUploadService } = await import('../services/rumble-upload-service');
      const stats = await rumbleUploadService.getStats();
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // RUMBLE CROSS-PLATFORM STREAMING API
  // ============================================================================

  // Get all Rumble channels
  router.get('/rumble/channels', async (req, res) => {
    try {
      const { rumbleStreamService } = await import('../services/rumble-stream-service');
      const channels = await rumbleStreamService.getChannels();
      res.json({ success: true, data: channels });
    } catch (error: any) {
      console.error('Get Rumble channels error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Add a new Rumble channel
  router.post('/rumble/channels', async (req, res) => {
    try {
      const { rumbleStreamService } = await import('../services/rumble-stream-service');
      const { channelName, streamKey, niche } = req.body;
      if (!channelName || !streamKey || !niche) {
        return res.status(400).json({ success: false, error: 'channelName, streamKey, and niche required' });
      }
      const channel = await rumbleStreamService.addChannel(channelName, streamKey, niche);
      res.json({ success: true, data: channel });
    } catch (error: any) {
      console.error('Add Rumble channel error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Start streaming to Rumble
  router.post('/rumble/stream', async (req, res) => {
    try {
      const { rumbleStreamService } = await import('../services/rumble-stream-service');
      const { videoPath, channelId, loopDurationMinutes, streamTitle } = req.body;
      if (!videoPath || !channelId) {
        return res.status(400).json({ success: false, error: 'videoPath and channelId required' });
      }
      const result = await rumbleStreamService.streamToRumble({
        videoPath,
        channelId,
        loopDurationMinutes: loopDurationMinutes || 120,
        streamTitle,
      });
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Rumble stream error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Stop a Rumble stream
  router.post('/rumble/stream/stop', async (req, res) => {
    try {
      const { rumbleStreamService } = await import('../services/rumble-stream-service');
      const { channelId } = req.body;
      if (!channelId) {
        return res.status(400).json({ success: false, error: 'channelId required' });
      }
      const result = await rumbleStreamService.stopStream(channelId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Stop Rumble stream error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get active Rumble streams
  router.get('/rumble/streams/active', async (req, res) => {
    try {
      const { rumbleStreamService } = await import('../services/rumble-stream-service');
      const streams = rumbleStreamService.getActiveStreams();
      res.json({ success: true, data: streams });
    } catch (error: any) {
      console.error('Get active streams error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
