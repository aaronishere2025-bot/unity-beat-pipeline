/**
 * Video Routes
 *
 * Video storage, post-processing, long-form, lip-sync, visual intelligence,
 * format conversion, thumbnail CTR prediction, clip validation.
 */

import { Router } from 'express';
import { existsSync, createReadStream, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { storage } from '../storage';
import { db } from '../db';
import { videoStorage } from '../services/video-storage';
import { ffmpegProcessor } from '../services/ffmpeg-processor';
import { klingVideoGenerator } from '../services/kling-video-generator';
import { thumbnailCTRPredictor } from '../services/thumbnail-ctr-predictor';
import { jobs } from '@shared/schema';
import { eq, desc, and } from 'drizzle-orm';
import { PATH_CONFIG } from '../config/video-constants';
import { getAvailableEngines } from '../services/unified-video-generator';


const router = Router();

// AI Endpoint Rate Limiting
const aiRateLimiters = new Map<string, { lastCall: Date; callCount: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_CALLS_PER_WINDOW = 10;

function checkRateLimit(endpoint: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const limiter = aiRateLimiters.get(endpoint) || { lastCall: new Date(0), callCount: 0 };
  const timeSinceLastWindow = now - limiter.lastCall.getTime();
  if (timeSinceLastWindow < RATE_LIMIT_WINDOW_MS) {
    if (limiter.callCount >= MAX_CALLS_PER_WINDOW) {
      const secondsRemaining = Math.ceil((RATE_LIMIT_WINDOW_MS - timeSinceLastWindow) / 1000);
      return { allowed: false, error: `Rate limit exceeded: Max ${MAX_CALLS_PER_WINDOW} calls per minute. Try again in ${secondsRemaining}s` };
    }
    limiter.callCount++;
  } else {
    limiter.lastCall = new Date();
    limiter.callCount = 1;
  }
  aiRateLimiters.set(endpoint, limiter);
  return { allowed: true };
}


import multer from 'multer';

// Configure multer for thumbnail uploads
const thumbnailUploadDir = join(process.cwd(), 'data', 'thumbnails');
if (!existsSync(thumbnailUploadDir)) {
  mkdirSync(thumbnailUploadDir, { recursive: true });
}

const thumbnailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, thumbnailUploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    cb(null, `thumbnail_${timestamp}_${randomId}.${ext}`);
  },
});

const uploadThumbnail = multer({
  storage: thumbnailStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, JPEG, PNG, and WEBP are allowed.'));
    }
  },
});





  // Video serving endpoint with security and range support
  router.get('/videos/:filename', async (req, res) => {
    try {
      const { filename } = req.params;

      // Security: Prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      // Security: Only serve .mp4 files
      if (!filename.endsWith('.mp4')) {
        return res.status(400).json({ error: 'Invalid file type' });
      }

      // Use centralized storage to find video file
      const videoPath = videoStorage.findVideoFile(filename);

      if (!videoPath) {
        console.log(`Video not found in any location: ${filename}`);
        return res.status(404).json({ error: 'Video not found' });
      }

      // Security: Verify file belongs to a job OR a Unity package (prevent arbitrary file access)
      const jobs = await storage.listJobs();
      const videoUrl = `/api/videos/${filename}`;
      const jobExists = jobs.some((job) => job.videoUrl === videoUrl);

      // Also check Unity packages for generated clips AND final assembled videos
      let unityVideoExists = false;
      if (!jobExists) {
        const packages = await storage.listUnityContentPackages();
        for (const pkg of packages) {
          const pkgData = pkg.packageData as any;
          const clips = pkgData?.generatedClips || [];

          // Check if this is a generated clip
          if (clips.some((clip: any) => clip.videoUrl === videoUrl || clip.localPath?.includes(filename))) {
            unityVideoExists = true;
            break;
          }

          // Check if this is the final assembled video
          if (pkgData?.finalVideoUrl === videoUrl) {
            unityVideoExists = true;
            break;
          }
        }
      }

      if (!jobExists && !unityVideoExists) {
        console.log(`Attempted to access video not associated with any job or package: ${filename}`);
        return res.status(403).json({ error: 'Video access denied' });
      }

      const stat = statSync(videoPath);
      const fileSize = stat.size;
      const range = req.headers.range;

      // Support HTTP range requests for video seeking
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=31536000',
        });

        createReadStream(videoPath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': 'video/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000',
        });
        createReadStream(videoPath).pipe(res);
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to serve video',
      });
    }
  });


  // Thumbnail serving endpoint
  router.get('/thumbnails/:filename', async (req, res) => {
    try {
      const { filename } = req.params;

      // Security: Prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      // Security: Only serve image files
      const validExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
      if (!validExtensions.some((ext) => filename.toLowerCase().endsWith(ext))) {
        return res.status(400).json({ error: 'Invalid file type' });
      }

      // Look for thumbnail in data/thumbnails directory
      const thumbnailDir = join(process.cwd(), 'data', 'thumbnails');
      const thumbnailPath = join(thumbnailDir, filename);

      if (!existsSync(thumbnailPath)) {
        console.log(`Thumbnail not found: ${filename}`);
        return res.status(404).json({ error: 'Thumbnail not found' });
      }

      // Determine content type based on extension
      let contentType = 'image/jpeg';
      if (filename.toLowerCase().endsWith('.png')) {
        contentType = 'image/png';
      } else if (filename.toLowerCase().endsWith('.webp')) {
        contentType = 'image/webp';
      }

      const stat = statSync(thumbnailPath);
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      });
      createReadStream(thumbnailPath).pipe(res);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to serve thumbnail',
      });
    }
  });


  // Video DOWNLOAD endpoint (forces download on iOS/mobile)
  router.get('/videos/:filename/download', async (req, res) => {
    try {
      const { filename } = req.params;

      // Security: Prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      // Security: Only serve .mp4 files
      if (!filename.endsWith('.mp4')) {
        return res.status(400).json({ error: 'Invalid file type' });
      }

      // Use centralized storage to find video file
      const videoPath = videoStorage.findVideoFile(filename);

      if (!videoPath) {
        console.log(`Video not found for download: ${filename}`);
        return res.status(404).json({ error: 'Video not found' });
      }

      // Security: Verify file belongs to a job OR a Unity package
      const jobs = await storage.listJobs();
      const videoUrl = `/api/videos/${filename}`;
      const jobExists = jobs.some((job) => job.videoUrl === videoUrl);

      let unityVideoExists = false;
      if (!jobExists) {
        const packages = await storage.listUnityContentPackages();
        for (const pkg of packages) {
          const pkgData = pkg.packageData as any;
          const clips = pkgData?.generatedClips || [];

          if (clips.some((clip: any) => clip.videoUrl === videoUrl || clip.localPath?.includes(filename))) {
            unityVideoExists = true;
            break;
          }

          if (pkgData?.finalVideoUrl === videoUrl) {
            unityVideoExists = true;
            break;
          }
        }
      }

      if (!jobExists && !unityVideoExists) {
        return res.status(403).json({ error: 'Video access denied' });
      }

      const stat = statSync(videoPath);
      const fileSize = stat.size;

      // Extract a nice filename
      const downloadName = filename.replace(/^unity_final_[a-f0-9-]+_\d+/, 'unity_rap_final');

      // Force download with Content-Disposition header
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Cache-Control', 'no-cache');

      createReadStream(videoPath).pipe(res);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to download video',
      });
    }
  });


  // Predict CTR for an uploaded thumbnail
  router.post('/predict-thumbnail-ctr', uploadThumbnail.single('thumbnail'), async (req, res) => {
    try {
      // Rate limiting + cost guard (GPT-4o Vision is expensive!)
      const rateCheck = checkRateLimit('predict-thumbnail-ctr');
      if (!rateCheck.allowed) return res.status(429).json({ success: false, error: rateCheck.error });

      const { costGuard } = await import('../services/cost-guard');
      const costCheck = await costGuard.canProceed(0.03, 'predict_thumbnail_ctr');
      if (!costCheck.allowed)
        return res.status(429).json({ success: false, error: 'Cost limit reached', reason: costCheck.reason });

      let thumbnailPath: string;

      // Handle file upload or URL/path from body
      if (req.file) {
        thumbnailPath = req.file.path;
      } else if (req.body.thumbnailUrl) {
        thumbnailPath = req.body.thumbnailUrl;
      } else if (req.body.thumbnailPath) {
        thumbnailPath = req.body.thumbnailPath;
      } else {
        return res.status(400).json({
          success: false,
          error: 'No thumbnail provided. Upload a file or provide thumbnailUrl/thumbnailPath in body.',
        });
      }

      console.log(`🎯 Predicting CTR for thumbnail: ${thumbnailPath}`);

      const prediction = await thumbnailCTRPredictor.predictCTR(thumbnailPath);

      console.log(
        `   ✅ Predicted CTR: ${prediction.predictedCTR.toFixed(1)}% (confidence: ${(prediction.confidence * 100).toFixed(0)}%)`,
      );

      res.json({
        success: true,
        data: {
          predictedCTR: prediction.predictedCTR,
          confidence: prediction.confidence,
          modelVersion: prediction.modelVersion,
          features: prediction.features,
        },
      });
    } catch (error: any) {
      console.error('❌ CTR prediction error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to predict CTR',
      });
    }
  });


  // Rank multiple thumbnail candidates
  router.post('/rank-thumbnails', uploadThumbnail.array('thumbnails', 10), async (req, res) => {
    try {
      // Rate limiting + cost guard (can process 10 images = $0.30!)
      const rateCheck = checkRateLimit('rank-thumbnails');
      if (!rateCheck.allowed) return res.status(429).json({ success: false, error: rateCheck.error });

      const { costGuard } = await import('../services/cost-guard');
      const costCheck = await costGuard.canProceed(0.3, 'rank_thumbnails'); // Higher cost for batch
      if (!costCheck.allowed)
        return res.status(429).json({ success: false, error: 'Cost limit reached', reason: costCheck.reason });

      let thumbnailPaths: string[] = [];

      // Handle file uploads
      if (req.files && Array.isArray(req.files)) {
        thumbnailPaths = (req.files as Express.Multer.File[]).map((f) => f.path);
      }

      // Also accept URLs/paths from body
      if (req.body.thumbnailUrls) {
        const urls = Array.isArray(req.body.thumbnailUrls)
          ? req.body.thumbnailUrls
          : JSON.parse(req.body.thumbnailUrls);
        thumbnailPaths.push(...urls);
      }

      if (thumbnailPaths.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No thumbnails provided. Upload files or provide thumbnailUrls in body.',
        });
      }

      if (thumbnailPaths.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Need at least 2 thumbnails to rank.',
        });
      }

      console.log(`🎯 Ranking ${thumbnailPaths.length} thumbnails...`);

      const ranked = await thumbnailCTRPredictor.rankThumbnails(thumbnailPaths);

      res.json({
        success: true,
        data: {
          rankings: ranked.map((r) => ({
            path: r.path,
            rank: r.rank,
            predictedCTR: r.prediction.predictedCTR,
            confidence: r.prediction.confidence,
            features: r.prediction.features,
          })),
          winner: ranked[0],
        },
      });
    } catch (error: any) {
      console.error('❌ Thumbnail ranking error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to rank thumbnails',
      });
    }
  });


  // Train/retrain the CTR prediction model from historical data
  router.post('/thumbnail-ctr/train', async (req, res) => {
    try {
      console.log('🧠 Training CTR prediction model from historical data...');

      const model = await thumbnailCTRPredictor.trainModel();

      res.json({
        success: true,
        data: {
          trainedAt: model.trainedAt,
          sampleCount: model.sampleCount,
          r2Score: model.r2Score,
          meanCTR: model.meanCTR,
          weights: model.weights,
        },
      });
    } catch (error: any) {
      console.error('❌ Model training error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to train model',
      });
    }
  });


  // Get model statistics
  router.get('/thumbnail-ctr/model-stats', async (req, res) => {
    try {
      await thumbnailCTRPredictor.initialize();
      const stats = thumbnailCTRPredictor.getModelStats();

      res.json({
        success: true,
        data: {
          isDefault: stats.isDefault,
          trainedAt: stats.model.trainedAt,
          sampleCount: stats.model.sampleCount,
          r2Score: stats.model.r2Score,
          meanCTR: stats.model.meanCTR,
          weights: stats.model.weights,
        },
      });
    } catch (error: any) {
      console.error('❌ Error getting model stats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get model stats',
      });
    }
  });


  // ============ VIDEO POST-PROCESSING ENDPOINTS ============

  // Get available caption styles
  router.get('/video/caption-styles', (req, res) => {
    const styles = {
      minimal: { name: 'Minimal', description: 'Clean white text with subtle outline' },
      neon: { name: 'Neon', description: 'Cyan/magenta glow effect' },
      fire: { name: 'Fire', description: 'Orange/gold with red outline' },
      clean: { name: 'Clean', description: 'Helvetica with soft shadow' },
      bold: { name: 'Bold', description: 'Large impact text with strong shadow' },
    };
    res.json({ success: true, data: styles });
  });


  // Post-process a video with captions and/or loop
  router.post('/video/post-process', async (req, res) => {
    try {
      const {
        videoPath,
        lyrics,
        outputPath,
        addCaptions = true,
        captionStyle = 'bold',
        createLoop = true,
        loopCrossfade = 0.5,
        bpm = 130,
      } = req.body;

      if (!videoPath) {
        return res.status(400).json({ success: false, error: 'Video path is required' });
      }

      if (!lyrics && addCaptions) {
        return res.status(400).json({ success: false, error: 'Lyrics are required for captions' });
      }

      // Resolve paths
      const fs = await import('fs');
      const path = await import('path');

      const inputPath = path.join(process.cwd(), videoPath);
      if (!fs.existsSync(inputPath)) {
        return res.status(404).json({ success: false, error: 'Video file not found' });
      }

      const timestamp = Date.now();
      const output = outputPath || path.join(process.cwd(), 'output', `processed_${timestamp}.mp4`);

      // Ensure output directory exists
      const outputDir = path.dirname(output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      console.log(`🎬 Starting post-processing: ${videoPath}`);
      console.log(`   Captions: ${addCaptions ? captionStyle : 'disabled'}`);
      console.log(`   Loop: ${createLoop ? `${loopCrossfade}s crossfade` : 'disabled'}`);

      const result = await ffmpegProcessor.postProcess(inputPath, lyrics || '', output, {
        addCaptions,
        captionStyle,
        createLoop,
        loopCrossfade,
        bpm,
      });

      // Get output info
      const metadata = await ffmpegProcessor.getVideoMetadata(result);
      const duration = parseFloat(metadata?.format?.duration || '0');

      res.json({
        success: true,
        data: {
          outputPath: result.replace(process.cwd(), ''),
          duration,
          options: { addCaptions, captionStyle, createLoop, loopCrossfade, bpm },
        },
        message: `Video processed successfully (${duration.toFixed(1)}s)`,
      });
    } catch (error: any) {
      console.error('Video post-processing error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to post-process video',
      });
    }
  });


  // Preview lyric timing (for UI preview without burning)
  router.post('/video/preview-captions', async (req, res) => {
    try {
      const { lyrics, duration = 60, bpm = 130 } = req.body;

      if (!lyrics) {
        return res.status(400).json({ success: false, error: 'Lyrics are required' });
      }

      const timedLyrics = ffmpegProcessor.generateLyricTiming(lyrics, duration, bpm);

      res.json({
        success: true,
        data: {
          timedLyrics,
          totalLines: timedLyrics.length,
          estimatedDuration: timedLyrics.length > 0 ? timedLyrics[timedLyrics.length - 1].endTime : 0,
        },
      });
    } catch (error: any) {
      console.error('Caption preview error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate caption preview',
      });
    }
  });


  // ============================================
  // VIDEO FORMAT CONVERSION ENDPOINTS
  // ============================================

  // Crop video to 4:3 format (landscape or portrait)
  router.post('/video/crop-4x3', async (req, res) => {
    try {
      const { inputPath, position = 'center', orientation = 'landscape' } = req.body;

      if (!inputPath) {
        return res.status(400).json({
          success: false,
          error: 'Input path is required',
        });
      }

      const fullInputPath = join(process.cwd(), inputPath);
      if (!existsSync(fullInputPath)) {
        return res.status(404).json({
          success: false,
          error: 'Input video not found',
        });
      }

      const timestamp = Date.now();
      const outputPath = join(PATH_CONFIG.TEMP_DIR, `cropped_4x3_${timestamp}.mp4`);

      const result = await ffmpegProcessor.cropTo4x3(fullInputPath, outputPath, { position, orientation });

      // 4:3 landscape = 1440x1080, 4:3 portrait (3:4) = 1080x1440
      const dimensions = orientation === 'landscape' ? '1440x1080' : '1080x1440';

      res.json({
        success: true,
        data: {
          outputPath: result.replace(process.cwd(), ''),
          format: orientation === 'landscape' ? '4:3' : '3:4',
          dimensions,
          orientation,
        },
      });
    } catch (error: any) {
      console.error('Error cropping to 4:3:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Crop video to 9:16 vertical format
  router.post('/video/crop-9x16', async (req, res) => {
    try {
      const { inputPath, position = 'center' } = req.body;

      if (!inputPath) {
        return res.status(400).json({
          success: false,
          error: 'Input path is required',
        });
      }

      const fullInputPath = join(process.cwd(), inputPath);
      if (!existsSync(fullInputPath)) {
        return res.status(404).json({
          success: false,
          error: 'Input video not found',
        });
      }

      const timestamp = Date.now();
      const outputPath = join(PATH_CONFIG.TEMP_DIR, `cropped_9x16_${timestamp}.mp4`);

      const result = await ffmpegProcessor.cropTo9x16(fullInputPath, outputPath, { position });

      res.json({
        success: true,
        data: {
          outputPath: result.replace(process.cwd(), ''),
          format: '9:16',
          dimensions: '1080x1920',
        },
      });
    } catch (error: any) {
      console.error('Error cropping to 9:16:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Export video in multiple formats
  router.post('/video/export-multi-format', async (req, res) => {
    try {
      const { inputPath, baseName } = req.body;

      if (!inputPath) {
        return res.status(400).json({
          success: false,
          error: 'Input path is required',
        });
      }

      const fullInputPath = join(process.cwd(), inputPath);
      if (!existsSync(fullInputPath)) {
        return res.status(404).json({
          success: false,
          error: 'Input video not found',
        });
      }

      const outputDir = PATH_CONFIG.TEMP_DIR;
      const timestamp = Date.now();
      const finalBaseName = baseName || `export_${timestamp}`;

      const result = await ffmpegProcessor.exportMultiFormat(fullInputPath, outputDir, finalBaseName);

      res.json({
        success: true,
        data: {
          landscape: result.landscape.replace(process.cwd(), ''),
          tablet: result.tablet.replace(process.cwd(), ''),
          vertical: result.vertical.replace(process.cwd(), ''),
          formats: ['16:9', '4:3', '9:16'],
        },
      });
    } catch (error: any) {
      console.error('Error exporting multi-format:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get available video engines and their pricing
  router.get('/video-engines', async (req, res) => {
    try {
      const engines = getAvailableEngines();
      const engineInfo = engines
        .map((engineData) => {
          const { engine, name, enabled, costPer10Sec } = engineData;

          if (engine === 'kling') {
            return {
              id: 'kling',
              name: 'Kling AI',
              provider: 'Kuaishou',
              costPerClip: klingVideoGenerator.getCostPerClip(),
              clipDuration: 5,
              description: 'Fast and cost-effective AI video generation',
              enabled,
              costPer10Sec,
            };
          }
          return null;
        })
        .filter(Boolean);

      // Filter to only enabled engines for the default response
      const enabledEngines = engineInfo.filter((e) => e && e.enabled);

      res.json({
        success: true,
        data: {
          engines: engineInfo,
          enabledEngines: enabledEngines.map((e) => e!.id),
          defaultEngine: enabledEngines.length > 0 ? enabledEngines[0]!.id : 'kling',
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============ VIDEO STORAGE MANAGEMENT ============

  // Get storage statistics
  router.get('/storage/stats', async (req, res) => {
    try {
      const stats = videoStorage.getStats();
      const videos = videoStorage.listAllVideos();

      res.json({
        success: true,
        data: {
          ...stats,
          recentVideos: videos.slice(0, 10),
          oldVideos: videos.filter((v) => v.ageHours > 24 * 7).length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // List all video files
  router.get('/storage/videos', async (req, res) => {
    try {
      const videos = videoStorage.listAllVideos();
      res.json({ success: true, data: videos });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Cleanup old video files
  router.post('/storage/cleanup', async (req, res) => {
    try {
      const { fileManager } = await import('../services/file-manager');
      const { maxAgeDays = 7 } = req.body;

      const legacyResult = await videoStorage.cleanupOldFiles(maxAgeDays);
      const fileResult = await fileManager.cleanupOldFiles();
      const sizeResult = await fileManager.enforceSizeLimit();

      res.json({
        success: true,
        data: {
          message: `Cleaned up files`,
          legacy: legacyResult,
          fileManager: {
            oldFilesDeleted: fileResult.deletedFiles.length,
            sizeLimitDeleted: sizeResult.deletedFiles.length,
            totalFreedMB: Math.round(((fileResult.freedBytes + sizeResult.freedBytes) / 1024 / 1024) * 10) / 10,
          },
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get comprehensive file storage stats
  router.get('/storage/file-stats', async (req, res) => {
    try {
      const { fileManager } = await import('../services/file-manager');
      const stats = await fileManager.getStorageStats();

      res.json({
        success: true,
        data: {
          clips: { count: stats.clips.count, sizeMB: Math.round((stats.clips.sizeBytes / 1024 / 1024) * 10) / 10 },
          final: { count: stats.final.count, sizeMB: Math.round((stats.final.sizeBytes / 1024 / 1024) * 10) / 10 },
          music: { count: stats.music.count, sizeMB: Math.round((stats.music.sizeBytes / 1024 / 1024) * 10) / 10 },
          total: { count: stats.total.count, sizeMB: Math.round((stats.total.sizeBytes / 1024 / 1024) * 10) / 10 },
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // VIDEO INSIGHTS API ROUTES
  // ============================================================================

  // Get full insights for a video including theme audit trail
  router.get('/videos/:videoId/insights', async (req, res) => {
    try {
      const { videoInsightsService } = await import('../services/video-insights-service');
      const insights = await videoInsightsService.getVideoInsights(req.params.videoId);

      if (!insights) {
        return res.status(404).json({
          success: false,
          error: 'No insights available for this video',
          data: {
            videoId: req.params.videoId,
            title: '',
            publishedAt: '',
            metrics: { views: 0, likes: 0, comments: 0, engagementRate: 0 },
            performanceTier: 'new',
            appliedThemes: [],
            contributedThemes: [],
            wasInHoldout: false,
            generatedAt: '',
          },
        });
      }

      res.json({ success: true, data: insights });
    } catch (error: any) {
      console.error('Video insights error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // CLIP QUALITY VALIDATOR (ANTI-GLITCH) API ROUTES
  // ============================================================================

  // Validate a single clip
  router.post('/clip-quality/validate', async (req, res) => {
    try {
      const { videoPath, clipId, historicalContext } = req.body;
      if (!videoPath || !clipId) {
        return res.status(400).json({ error: 'videoPath and clipId are required' });
      }
      const { clipQualityValidator } = await import('../services/clip-quality-validator');
      const result = await clipQualityValidator.validateClip(videoPath, clipId, historicalContext);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Enable/disable clip quality validation
  router.post('/clip-quality/toggle', async (req, res) => {
    try {
      const { enabled } = req.body;
      const { clipQualityValidator } = await import('../services/clip-quality-validator');
      clipQualityValidator.setEnabled(enabled);
      res.json({ success: true, enabled });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // =========================================================================
  // THUMBNAIL A/B TESTING (AUTOMATED 24-HOUR CHECK & SWAP)
  // =========================================================================

  // Get A/B testing status and style performance
  router.get('/thumbnail-ab/status', async (req, res) => {
    try {
      const { thumbnailABService } = await import('../services/thumbnail-ab-service');
      const status = thumbnailABService.getStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Run the 24-hour check & swap for all pending tests
  router.post('/thumbnail-ab/check-and-swap', async (req, res) => {
    try {
      const { thumbnailABService } = await import('../services/thumbnail-ab-service');
      const results = await thumbnailABService.checkAndSwap();
      res.json({ success: true, data: results });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Force swap a specific video's thumbnail
  router.post('/thumbnail-ab/force-swap', async (req, res) => {
    try {
      const { videoId } = req.body;
      if (!videoId) {
        return res.status(400).json({ error: 'videoId is required' });
      }
      const { thumbnailABService } = await import('../services/thumbnail-ab-service');
      const result = await thumbnailABService.forceSwap(videoId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Set baseline CTR manually
  router.post('/thumbnail-ab/baseline', async (req, res) => {
    try {
      const { ctr } = req.body;
      if (typeof ctr !== 'number') {
        return res.status(400).json({ error: 'ctr must be a number' });
      }
      const { thumbnailABService } = await import('../services/thumbnail-ab-service');
      thumbnailABService.setBaseline(ctr);
      res.json({ success: true, message: `Baseline CTR set to ${ctr}%` });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get best performing thumbnail styles
  router.get('/thumbnail-ab/best-styles', async (req, res) => {
    try {
      const { thumbnailABService } = await import('../services/thumbnail-ab-service');
      const topN = parseInt(req.query.top as string) || 3;
      const bestStyles = thumbnailABService.getBestStyles(topN);
      res.json({ success: true, data: bestStyles });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all available styles
  router.get('/thumbnail-ab/styles', async (req, res) => {
    try {
      const { thumbnailABService } = await import('../services/thumbnail-ab-service');
      const styles = thumbnailABService.getStyles();
      res.json({ success: true, data: styles });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // LONG-FORM CONTENT GENERATOR API (10-Minute Epic Videos)
  // ============================================================================

  // Initialize a new long-form package
  router.post('/long-form/initialize', async (req, res) => {
    try {
      const { longFormOrchestratorService } = await import('../services/long-form-orchestrator-service');
      const { topic, stylePreset, contentType } = req.body;
      if (!topic) {
        return res.status(400).json({ success: false, error: 'topic is required' });
      }
      const result = await longFormOrchestratorService.initializeLongFormPackage(
        topic,
        stylePreset || 'documentary',
        contentType || 'historical_epic',
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Long-form initialize error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all long-form packages
  router.get('/long-form/packages', async (req, res) => {
    try {
      const { longFormOrchestratorService } = await import('../services/long-form-orchestrator-service');
      const packages = await longFormOrchestratorService.getAllPackages();
      res.json({ success: true, data: packages });
    } catch (error: any) {
      console.error('Get long-form packages error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get a specific long-form package with chapters and stems
  router.get('/long-form/packages/:id', async (req, res) => {
    try {
      const { longFormOrchestratorService } = await import('../services/long-form-orchestrator-service');
      const pkg = await longFormOrchestratorService.getPackageStatus(req.params.id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Package not found' });
      }
      res.json({ success: true, data: pkg });
    } catch (error: any) {
      console.error('Get long-form package error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate daily content mix (4 shorts + 1 long-form)
  router.post('/long-form/daily-mix', async (req, res) => {
    try {
      const { longFormOrchestratorService } = await import('../services/long-form-orchestrator-service');
      const { topic, stylePreset, shortCount, generateLongForm, autoRedirect } = req.body;
      if (!topic) {
        return res.status(400).json({ success: false, error: 'topic is required' });
      }
      const result = await longFormOrchestratorService.generateDailyMix({
        topic,
        stylePreset: stylePreset || 'documentary',
        shortCount: shortCount ?? 4,
        generateLongForm: generateLongForm ?? true,
        autoRedirect: autoRedirect ?? true,
      });
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Daily mix error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get cost estimate for long-form video
  router.get('/long-form/cost-estimate', async (req, res) => {
    try {
      const { sunoStemBuilderService } = await import('../services/suno-stem-builder-service');
      const estimate = sunoStemBuilderService.estimateTotalCost();
      res.json({ success: true, data: estimate });
    } catch (error: any) {
      console.error('Cost estimate error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get chapters for a package
  router.get('/long-form/packages/:id/chapters', async (req, res) => {
    try {
      const { chapterPlannerService } = await import('../services/chapter-planner-service');
      const chapters = await chapterPlannerService.getChaptersForPackage(req.params.id);
      res.json({ success: true, data: chapters });
    } catch (error: any) {
      console.error('Get chapters error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get audio stems for a package
  router.get('/long-form/packages/:id/stems', async (req, res) => {
    try {
      const { sunoStemBuilderService } = await import('../services/suno-stem-builder-service');
      const stems = await sunoStemBuilderService.getStemsForPackage(req.params.id);
      res.json({ success: true, data: stems });
    } catch (error: any) {
      console.error('Get stems error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate auto-redirect metadata for YouTube
  router.post('/long-form/auto-redirect-metadata', async (req, res) => {
    try {
      const { longFormOrchestratorService } = await import('../services/long-form-orchestrator-service');
      const { longFormVideoId, shortVideoIds } = req.body;
      if (!longFormVideoId || !shortVideoIds) {
        return res.status(400).json({ success: false, error: 'longFormVideoId and shortVideoIds required' });
      }
      const metadata = longFormOrchestratorService.generateAutoRedirectMetadata(longFormVideoId, shortVideoIds);
      res.json({ success: true, data: metadata });
    } catch (error: any) {
      console.error('Auto-redirect metadata error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // CLIP QUALITY VALIDATOR API ENDPOINTS
  // ============================================================

  // Get/set validator status
  router.get('/clip-validator/status', async (req, res) => {
    try {
      const { clipQualityValidator } = await import('../services/clip-quality-validator');
      res.json({ success: true, enabled: true, message: 'Clip quality validator is active' });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/clip-validator/toggle', async (req, res) => {
    try {
      const { enabled } = req.body;
      const { clipQualityValidator } = await import('../services/clip-quality-validator');
      clipQualityValidator.setEnabled(enabled !== false);
      res.json({ success: true, enabled: enabled !== false });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================
  // VISUAL INTELLIGENCE API ENDPOINTS
  // ============================================================

  // Analyze a single video's thumbnail
  router.post('/visual-intelligence/analyze/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      const { videoPath } = req.body;

      console.log(`🎨 [API] Visual analysis requested for ${videoId}`);

      const { visualIntelligenceService } = await import('../services/visual-intelligence-service');
      await visualIntelligenceService.analyzeVideo(videoId, videoPath);

      // Get the analysis result
      const { db } = await import('../db');
      const { visualAnalysis } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      const [analysis] = await db.select().from(visualAnalysis).where(eq(visualAnalysis.videoId, videoId)).limit(1);

      res.json({
        success: true,
        data: analysis,
        message: `Visual analysis complete for ${videoId}`,
      });
    } catch (error: any) {
      console.error('Visual analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Batch analyze all unanalyzed thumbnails
  router.post('/visual-intelligence/analyze-batch', async (req, res) => {
    try {
      const { limit = 10 } = req.body;

      console.log(`🎨 [API] Batch visual analysis requested (limit: ${limit})`);

      const { visualIntelligenceService } = await import('../services/visual-intelligence-service');
      const result = await visualIntelligenceService.analyzeAllThumbnails(limit);

      res.json({
        success: true,
        data: result,
        message: `Analyzed ${result.analyzed} thumbnails (${result.errors} errors)`,
      });
    } catch (error: any) {
      console.error('Batch visual analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Deep analyze a single video (download, analyze frames, delete video, keep analysis)
  router.post('/visual-intelligence/deep-analyze/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;

      console.log(`🔬 [API] Deep visual analysis requested for ${videoId}`);

      const { visualIntelligenceService } = await import('../services/visual-intelligence-service');
      const result = await visualIntelligenceService.downloadAnalyzeAndDelete(videoId);

      res.json({
        success: result.success,
        data: result,
        message: result.message,
      });
    } catch (error: any) {
      console.error('Deep visual analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Batch deep analyze (download, analyze frames, delete for each video)
  router.post('/visual-intelligence/deep-analyze-batch', async (req, res) => {
    try {
      const { limit = 5 } = req.body;

      console.log(`🔬 [API] Batch deep analysis requested (limit: ${limit})`);

      const { visualIntelligenceService } = await import('../services/visual-intelligence-service');
      const result = await visualIntelligenceService.deepAnalyzeAll(limit);

      res.json({
        success: true,
        data: result,
        message: `Deep analyzed ${result.analyzed} videos (${result.errors} errors, ${result.skipped} skipped)`,
      });
    } catch (error: any) {
      console.error('Batch deep analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get visual intelligence summary for analytics (must be before :videoId route)
  router.get('/visual-intelligence/summary', async (req, res) => {
    try {
      const { visualIntelligenceService } = await import('../services/visual-intelligence-service');
      const summary = await visualIntelligenceService.getVisualSummary();

      res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('Visual summary error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Compare thumbnail scores vs CTR performance (must be before :videoId route)
  router.get('/visual-intelligence/correlation', async (req, res) => {
    try {
      const { db } = await import('../db');
      const { visualAnalysis, detailedVideoMetrics } = await import('@shared/schema');
      const { eq, isNotNull, and, desc } = await import('drizzle-orm');

      // Join visual analysis with metrics
      const data = await db
        .select({
          videoId: visualAnalysis.videoId,
          title: visualAnalysis.title,
          thumbnailScore: visualAnalysis.thumbnailScore,
          compositionScore: visualAnalysis.thumbnailComposition,
          colorImpactScore: visualAnalysis.thumbnailColorImpact,
          emotionalScore: visualAnalysis.thumbnailEmotionalImpact,
          curiosityScore: visualAnalysis.thumbnailCuriosityGap,
          overallVisualScore: visualAnalysis.overallVisualScore,
          ctr: detailedVideoMetrics.clickThroughRate,
          views: detailedVideoMetrics.viewCount,
          impressions: detailedVideoMetrics.impressions,
        })
        .from(visualAnalysis)
        .innerJoin(detailedVideoMetrics, eq(visualAnalysis.videoId, detailedVideoMetrics.videoId))
        .where(and(isNotNull(visualAnalysis.thumbnailScore), isNotNull(detailedVideoMetrics.clickThroughRate)))
        .orderBy(desc(detailedVideoMetrics.viewCount))
        .limit(50);

      // Calculate correlations
      const validData = data.filter((d) => d.thumbnailScore && d.ctr);

      let correlation = null;
      if (validData.length >= 5) {
        // Simple Pearson correlation calculation
        const n = validData.length;
        const sumX = validData.reduce((s, d) => s + (d.thumbnailScore || 0), 0);
        const sumY = validData.reduce((s, d) => s + parseFloat((d.ctr as any) || '0'), 0);
        const sumXY = validData.reduce((s, d) => s + (d.thumbnailScore || 0) * parseFloat((d.ctr as any) || '0'), 0);
        const sumX2 = validData.reduce((s, d) => s + Math.pow(d.thumbnailScore || 0, 2), 0);
        const sumY2 = validData.reduce((s, d) => s + Math.pow(parseFloat((d.ctr as any) || '0'), 2), 0);

        const numerator = n * sumXY - sumX * sumY;
        const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

        if (denominator > 0) {
          correlation = numerator / denominator;
        }
      }

      res.json({
        success: true,
        data: {
          videos: data,
          correlation: correlation
            ? {
                thumbnailVsCtr: correlation.toFixed(3),
                interpretation:
                  correlation > 0.5
                    ? 'Strong positive'
                    : correlation > 0.2
                      ? 'Moderate positive'
                      : correlation > -0.2
                        ? 'Weak/No correlation'
                        : correlation > -0.5
                          ? 'Moderate negative'
                          : 'Strong negative',
              }
            : null,
          sampleSize: validData.length,
        },
      });
    } catch (error: any) {
      console.error('Correlation analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get all visual analyses with optional filtering
  router.get('/visual-intelligence', async (req, res) => {
    try {
      const { tier, minScore, limit = 50 } = req.query;

      const { db } = await import('../db');
      const { visualAnalysis } = await import('@shared/schema');
      const { desc, gte, eq, and } = await import('drizzle-orm');

      let query = db.select().from(visualAnalysis);

      // Apply filters
      const conditions = [];
      if (tier) {
        conditions.push(eq(visualAnalysis.visualTier, tier as string));
      }
      if (minScore) {
        conditions.push(gte(visualAnalysis.overallVisualScore, parseFloat(minScore as string)));
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as any;
      }

      const results = await query.orderBy(desc(visualAnalysis.overallVisualScore)).limit(parseInt(limit as string, 10));

      res.json({
        success: true,
        data: results,
        count: results.length,
      });
    } catch (error: any) {
      console.error('List visual analyses error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get visual analysis for a specific video (must be LAST as it has :videoId wildcard)
  router.get('/visual-intelligence/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;

      const { db } = await import('../db');
      const { visualAnalysis } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      const [analysis] = await db.select().from(visualAnalysis).where(eq(visualAnalysis.videoId, videoId)).limit(1);

      if (!analysis) {
        return res.status(404).json({
          success: false,
          error: 'No visual analysis found for this video',
        });
      }

      res.json({ success: true, data: analysis });
    } catch (error: any) {
      console.error('Get visual analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // LIP SYNC ROUTES (SadTalker via Replicate)
  // ============================================================================

  router.post('/lip-sync/apply', async (req, res) => {
    try {
      const { videoPath, audioPath, options } = req.body;

      if (!videoPath || !audioPath) {
        return res.status(400).json({
          success: false,
          error: 'videoPath and audioPath are required',
        });
      }

      console.log(`👄 [LipSync API] Apply request: video=${videoPath}, audio=${audioPath}`);

      const { lipSyncService } = await import('../services/lip-sync-service');

      if (!lipSyncService.isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Lip sync service not available - REPLICATE_API_TOKEN not configured',
        });
      }

      const result = await lipSyncService.applyLipSync(
        join(process.cwd(), videoPath),
        join(process.cwd(), audioPath),
        options || {},
      );

      if (result.success) {
        res.json({
          success: true,
          data: {
            outputPath: result.outputPath,
            outputUrl: result.outputUrl,
            cost: result.cost,
          },
        });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error('👄 [LipSync API] Error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/lip-sync/status/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params;
      console.log(`👄 [LipSync API] Status check: ${taskId}`);

      const { lipSyncService } = await import('../services/lip-sync-service');
      const status = lipSyncService.getLipSyncStatus(taskId);

      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error('👄 [LipSync API] Status error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/lip-sync/apply-with-vocals', async (req, res) => {
    try {
      const { videoPath, musicPath, options } = req.body;

      if (!videoPath || !musicPath) {
        return res.status(400).json({
          success: false,
          error: 'videoPath and musicPath are required',
        });
      }

      console.log(`👄 [LipSync API] Full pipeline request: video=${videoPath}, music=${musicPath}`);

      const { lipSyncService } = await import('../services/lip-sync-service');

      if (!lipSyncService.isAvailable()) {
        return res.status(503).json({
          success: false,
          error: 'Lip sync service not available - REPLICATE_API_TOKEN not configured',
        });
      }

      const result = await lipSyncService.applyLipSyncToVideo(
        join(process.cwd(), videoPath),
        join(process.cwd(), musicPath),
        options || {},
      );

      if (result.success) {
        res.json({
          success: true,
          data: {
            outputPath: result.outputPath,
            outputUrl: result.outputUrl,
            cost: result.cost,
          },
        });
      } else {
        res.status(500).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      console.error('👄 [LipSync API] Pipeline error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/lip-sync/estimate-cost', async (req, res) => {
    try {
      const durationSeconds = parseInt(req.query.duration as string) || 60;

      const { lipSyncService } = await import('../services/lip-sync-service');
      const cost = lipSyncService.estimateCost(durationSeconds);

      res.json({
        success: true,
        data: {
          durationSeconds,
          estimatedCost: cost,
          costPerSecond: 0.0055,
        },
      });
    } catch (error: any) {
      console.error('👄 [LipSync API] Cost estimate error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
