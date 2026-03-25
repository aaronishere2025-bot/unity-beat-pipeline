/**
 * Music Routes
 *
 * Suno API, music prompt generator, audio intelligence, audio cache management,
 * karaoke subtitles, suno style bandit, sonic identity reward, audio-video sync,
 * acoustic fingerprinting.
 */

import { Router } from 'express';
import { existsSync, createReadStream, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { uploadMusic, musicDir } from './shared/multer-configs';
import { storage } from '../storage';
import { db } from '../db';
import { ffmpegProcessor } from '../services/ffmpeg-processor';
import { openaiService } from '../services/openai-service';
import { audioIntelligence } from '../services/audio-intelligence';
import { audioAnalysisService } from '../services/audio-analysis-service';
import { TempPaths } from '../utils/temp-file-manager';
import { promisify } from 'util';
import { exec } from 'child_process';


const router = Router();


const execAsync = promisify(exec);




  // ==================== SUNO API ROUTES ====================

  // Check Suno credits
  router.get('/suno/credits', async (req, res) => {
    try {
      const { sunoApi } = await import('../services/suno-api');

      if (!sunoApi.isConfigured()) {
        return res.status(400).json({
          success: false,
          error: 'Suno API key not configured',
        });
      }

      const credits = await sunoApi.checkCredits();
      res.json({ success: true, data: credits });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to check Suno credits',
      });
    }
  });


  // Generate song from Unity package lyrics
  router.post('/suno/generate', async (req, res) => {
    try {
      const { sunoApi } = await import('../services/suno-api');

      if (!sunoApi.isConfigured()) {
        return res.status(400).json({
          success: false,
          error: 'Suno API key not configured',
        });
      }

      const { packageId, lyrics, style, title, instrumental, model, targetDuration } = req.body;

      if (!style || !title) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: style, title',
        });
      }

      // For instrumentals with a target duration, use structure-based generation
      // This prevents the endpoint from bypassing the duration fix
      let finalLyrics = lyrics || '';
      let finalInstrumental = instrumental || false;
      if ((instrumental || !lyrics || !lyrics.trim()) && targetDuration) {
        const { generateInstrumentalStructure } = await import('../services/suno-api');
        finalLyrics = generateInstrumentalStructure(targetDuration, style);
        finalInstrumental = false; // Must be false for structure tags to work
        console.log(`[Route] /api/suno/generate: Applied structure generation for ${targetDuration}s instrumental`);
      } else if (!lyrics) {
        return res.status(400).json({
          success: false,
          error: 'Missing required field: lyrics (or set instrumental=true with targetDuration)',
        });
      }

      // Suno API has 80-character title limit - truncate if needed
      const truncatedTitle = title.length > 80 ? title.substring(0, 77) + '...' : title;

      const result = await sunoApi.generateSong({
        lyrics: finalLyrics,
        style,
        title: truncatedTitle,
        instrumental: finalInstrumental,
        model: model || 'V5', // Use Suno V5 (latest)
        targetDuration: targetDuration || 60, // Default to 60s shorts format
      });

      // If packageId provided, update the package with the task ID
      if (packageId) {
        await storage.updateUnityContentPackage(packageId, {
          sunoTaskId: result.taskId,
          sunoStatus: 'generating',
        } as any);
      }

      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate song',
      });
    }
  });


  // Check Suno task status
  router.get('/suno/status/:taskId', async (req, res) => {
    try {
      const { sunoApi } = await import('../services/suno-api');

      if (!sunoApi.isConfigured()) {
        return res.status(400).json({
          success: false,
          error: 'Suno API key not configured',
        });
      }

      const { taskId } = req.params;
      const status = await sunoApi.getTaskStatus(taskId);

      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to check song status',
      });
    }
  });


  // Download completed Suno audio and attach to package
  router.post('/suno/download', async (req, res) => {
    try {
      const { sunoApi } = await import('../services/suno-api');
      const { existsSync, mkdirSync } = await import('fs');
      const { join } = await import('path');

      if (!sunoApi.isConfigured()) {
        return res.status(400).json({
          success: false,
          error: 'Suno API key not configured',
        });
      }

      const { packageId, audioUrl, trackIndex } = req.body;

      if (!audioUrl) {
        return res.status(400).json({
          success: false,
          error: 'Missing audioUrl',
        });
      }

      // Create downloads directory
      const downloadsDir = join(process.cwd(), 'attached_assets', 'suno_audio');
      if (!existsSync(downloadsDir)) {
        mkdirSync(downloadsDir, { recursive: true });
      }

      const timestamp = Date.now();
      const filename = `suno_${packageId || 'audio'}_${trackIndex || 0}_${timestamp}.mp3`;
      const outputPath = join(downloadsDir, filename);

      await sunoApi.downloadAudio(audioUrl, outputPath);

      const relativePath = `/attached_assets/suno_audio/${filename}`;

      // If packageId provided, update package with audio path
      if (packageId) {
        await storage.updateUnityContentPackage(packageId, {
          audioPath: relativePath,
          sunoStatus: 'complete',
        } as any);
      }

      res.json({
        success: true,
        data: {
          path: relativePath,
          filename,
        },
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to download audio',
      });
    }
  });


  // Check if Suno is configured
  router.get('/suno/status', async (req, res) => {
    try {
      const { sunoApi } = await import('../services/suno-api');
      const isConfigured = sunoApi.isConfigured();
      let credits: number | undefined;

      if (isConfigured) {
        try {
          const creditData = await sunoApi.checkCredits();
          credits = creditData.credits;
        } catch (e) {
          console.warn('[Suno] Could not fetch credits:', e);
        }
      }

      res.json({
        success: true,
        data: {
          configured: isConfigured,
          credits,
        },
      });
    } catch (error: any) {
      res.json({
        success: true,
        data: {
          configured: false,
        },
      });
    }
  });


  // Music upload endpoint
  router.post('/upload-music', uploadMusic.single('music'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
      }

      // Get absolute file path for ffprobe (security: using join to prevent path traversal)
      const filePath = join(musicDir, req.file.filename);

      // Validate file exists
      if (!existsSync(filePath)) {
        return res.status(500).json({
          success: false,
          error: 'Uploaded file not found',
        });
      }

      let duration: number | undefined;

      try {
        // Get audio duration with ffprobe
        // Security: Using join() ensures filePath is absolute and sanitized
        // The filename was already validated by multer's filename function
        const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
        const { stdout } = await execAsync(ffprobeCmd);
        const rawDuration = parseFloat(stdout.trim());

        // Validate duration is a positive number
        if (isNaN(rawDuration) || rawDuration <= 0) {
          console.warn(`Invalid audio duration detected: ${rawDuration}`);
        } else {
          duration = rawDuration;
        }
      } catch (error: any) {
        // ffprobe failed - log error but don't fail the upload
        console.error('ffprobe failed to get audio duration:', error.message);
        // Duration will remain undefined
      }

      // Construct absolute URL
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const absoluteUrl = `${protocol}://${host}/api/music/${req.file.filename}`;

      res.json({
        success: true,
        data: {
          url: absoluteUrl,
          filename: req.file.filename,
          duration: duration, // in seconds (e.g., 183.47), undefined if ffprobe failed
          size: req.file.size,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to upload music',
      });
    }
  });


  // Serve music files
  router.get('/music/:filename', async (req, res) => {
    try {
      const { filename } = req.params;

      // Security: Prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      // Security: Only serve allowed audio types
      const allowedExtensions = ['mp3', 'wav', 'm4a', 'ogg'];
      const ext = filename.split('.').pop()?.toLowerCase();
      if (!ext || !allowedExtensions.includes(ext)) {
        return res.status(400).json({ error: 'Invalid file type' });
      }

      const musicPath = join(musicDir, filename);

      // Check if file exists
      if (!existsSync(musicPath)) {
        return res.status(404).json({ error: 'Music file not found' });
      }

      const stat = statSync(musicPath);

      // Set appropriate content type for audio files
      const contentTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        wav: 'audio/wav',
        m4a: 'audio/x-m4a',
        ogg: 'audio/ogg',
      };

      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      });

      createReadStream(musicPath).pipe(res);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to serve music',
      });
    }
  });


  // ============ AUDIO INTELLIGENCE ENDPOINTS ============

  // Analyze audio file
  router.post('/audio/analyze', uploadMusic.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'Audio file is required' });
      }

      const { separateAudio, transcribeLyrics, userDescription } = req.body;

      console.log('🎵 Analyzing audio file...');
      const analysis = await audioIntelligence.analyzeFullAudio(req.file.path, {
        separateAudio: separateAudio === 'true',
        transcribeLyrics: transcribeLyrics === 'true',
        userDescription,
      });

      res.json({
        success: true,
        data: analysis,
        musicUrl: `/api/music/${req.file.filename}`,
      });
    } catch (error: any) {
      console.error('Audio analysis error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to analyze audio',
      });
    }
  });


  // Detect beat drop / hook in audio (for auto-trim to hook)
  router.post('/audio/detect-hook', uploadMusic.single('audio'), async (req, res) => {
    try {
      let audioPath: string;
      const pathModule = await import('path');

      // Accept either file upload or existing file path
      if (req.file) {
        audioPath = req.file.path;
      } else if (req.body.audioPath) {
        // Only allow paths within music directories (sanitized in service)
        const safePath = req.body.audioPath.replace('/music/', 'attached_assets/music/').replace(/\.\./g, ''); // Remove path traversal
        audioPath = pathModule.join(process.cwd(), safePath);
      } else {
        return res.status(400).json({ success: false, error: 'Audio file or path is required' });
      }

      console.log('🎯 Detecting beat drop / hook in audio...');
      console.log(`   Audio: ${audioPath}`);

      const { audioHookDetection } = await import('../services/audio-hook-detection');
      const report = await audioHookDetection.getHookAnalysisReport(audioPath);

      res.json({
        success: true,
        data: {
          detection: report.detection,
          trimDecision: report.trimDecision,
          recommendations: report.recommendations,
          ffmpegCommands: report.ffmpegCommands,
        },
      });
    } catch (error: any) {
      console.error('Hook detection error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to detect hook',
      });
    }
  });


  // NEW: Separate audio into stems and analyze each (vocals, drums, bass, other)
  router.post('/analyze-stems/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;

      console.log(`🎼 Analyzing stems for job ${jobId}...`);

      // Get job details
      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      // Check if job has audio
      if (!job.musicUrl) {
        return res.status(400).json({ success: false, error: 'Job has no music' });
      }

      // Get audio path
      const pathModule = await import('path');
      const audioPath = job.musicUrl.startsWith('http')
        ? job.musicUrl
        : pathModule.join(process.cwd(), job.musicUrl.replace(/^\//, ''));

      console.log(`   Audio: ${audioPath}`);

      // Run stem separation and analysis
      const { demucsSeparationService } = await import('../services/demucs-separation-service');
      const result = await demucsSeparationService.separateAndAnalyze(audioPath);

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      // Store stem analysis in job
      await storage.updateJob(jobId, {
        stemAnalysis: {
          stems: result.stems,
          analysis: result.analysis,
        },
      } as any);

      console.log(`   ✅ Stem analysis stored for job ${jobId}`);

      // Return analysis results
      res.json({
        success: true,
        data: {
          stems: result.stems,
          analysis: result.analysis,
          sample_rate: result.sample_rate,
          duration: result.duration,
        },
      });
    } catch (error: any) {
      console.error('Stem analysis error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to analyze stems',
      });
    }
  });


  // Quick check if audio needs intro trim
  router.post('/audio/should-trim', uploadMusic.single('audio'), async (req, res) => {
    try {
      let audioPath: string;
      const pathModule = await import('path');

      if (req.file) {
        audioPath = req.file.path;
      } else if (req.body.audioPath) {
        // Only allow paths within music directories (sanitized in service)
        const safePath = req.body.audioPath.replace('/music/', 'attached_assets/music/').replace(/\.\./g, ''); // Remove path traversal
        audioPath = pathModule.join(process.cwd(), safePath);
      } else {
        return res.status(400).json({ success: false, error: 'Audio file or path is required' });
      }

      console.log('🎵 Checking if audio needs intro trim...');

      const { audioHookDetection } = await import('../services/audio-hook-detection');
      const trimDecision = await audioHookDetection.shouldTrimIntro(audioPath);

      res.json({
        success: true,
        data: trimDecision,
      });
    } catch (error: any) {
      console.error('Trim check error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to check trim requirement',
      });
    }
  });


  // ============ AUDIO CACHE MANAGEMENT ENDPOINTS ============

  // Get cache statistics
  router.get('/cache/audio-analysis/stats', async (req, res) => {
    try {
      const stats = audioAnalysisService.getCacheStats();

      res.json({
        success: true,
        data: {
          entryCount: stats.entryCount,
          totalSizeBytes: stats.totalSizeBytes,
          totalSizeMB: stats.totalSizeMB,
          oldestEntryAge: stats.oldestEntry,
          newestEntryAge: stats.newestEntry,
          lastCleanup: new Date(stats.lastCleanup).toISOString(),
          maxSizeMB: 1024, // 1GB limit
          maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
        },
      });
    } catch (error: any) {
      console.error('Cache stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get cache stats',
      });
    }
  });


  // Clear entire cache
  router.post('/cache/audio-analysis/clear', async (req, res) => {
    try {
      console.log('🗑️ Manual cache clear requested');
      const result = audioAnalysisService.clearCache();

      res.json({
        success: true,
        message: `Cache cleared: removed ${result.removedCount} entries, freed ${(result.freedBytes / 1024 / 1024).toFixed(1)}MB`,
        data: {
          removedCount: result.removedCount,
          freedBytes: result.freedBytes,
          freedMB: Math.round((result.freedBytes / 1024 / 1024) * 100) / 100,
        },
      });
    } catch (error: any) {
      console.error('Cache clear error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to clear cache',
      });
    }
  });


  // Delete specific cache entry by hash
  router.delete('/cache/audio-analysis/:hash', async (req, res) => {
    try {
      const { hash } = req.params;

      if (!hash || hash.length < 8) {
        return res.status(400).json({
          success: false,
          error: 'Invalid cache hash',
        });
      }

      console.log(`🗑️ Deleting cache entry: ${hash}`);
      const result = audioAnalysisService.deleteCacheEntry(hash);

      if (!result.success) {
        return res.status(404).json({
          success: false,
          error: 'Cache entry not found',
        });
      }

      res.json({
        success: true,
        message: `Cache entry deleted: freed ${(result.freed / 1024).toFixed(1)}KB`,
        data: {
          hash,
          freedBytes: result.freed,
          freedKB: Math.round((result.freed / 1024) * 100) / 100,
        },
      });
    } catch (error: any) {
      console.error('Cache delete error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete cache entry',
      });
    }
  });


  // Force cleanup (manual trigger)
  router.post('/cache/audio-analysis/cleanup', async (req, res) => {
    try {
      console.log('🧹 Manual cleanup requested');
      audioAnalysisService.forceCleanup();

      const stats = audioAnalysisService.getCacheStats();

      res.json({
        success: true,
        message: 'Cleanup complete',
        data: {
          entryCount: stats.entryCount,
          totalSizeMB: stats.totalSizeMB,
        },
      });
    } catch (error: any) {
      console.error('Cleanup error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to run cleanup',
      });
    }
  });


  // ============ KARAOKE SUBTITLE ENDPOINTS ============

  // Get available karaoke styles
  router.get('/karaoke/styles', (req, res) => {
    const styles = {
      bounce: { name: 'Bounce', description: 'Yellow highlight with bounce effect' },
      glow: { name: 'Glow', description: 'Green glow with pulsing effect' },
      fire: { name: 'Fire', description: 'Orange/red flame style' },
      neon: { name: 'Neon', description: 'Cyan/magenta cyberpunk glow' },
      minimal: { name: 'Minimal', description: 'Clean white highlight' },
    };
    res.json({ success: true, data: styles });
  });


  // Transcribe audio with Whisper for word-level timestamps
  router.post('/karaoke/transcribe', uploadMusic.single('audio'), async (req, res) => {
    try {
      let audioPath: string;

      // Accept either file upload or existing file path
      if (req.file) {
        audioPath = req.file.path;
      } else if (req.body.audioPath) {
        const pathModule = await import('path');
        audioPath = pathModule.join(process.cwd(), req.body.audioPath.replace('/music/', 'attached_assets/music/'));
      } else {
        return res.status(400).json({ success: false, error: 'Audio file or path is required' });
      }

      console.log('🎤 Transcribing audio with Whisper for karaoke...');
      console.log(`   Audio: ${audioPath}`);

      const transcription = await openaiService.transcribeAudioWithTimestamps(audioPath);

      res.json({
        success: true,
        data: {
          text: transcription.text,
          words: transcription.words,
          wordCount: transcription.words.length,
          duration: transcription.duration,
          language: transcription.language,
        },
      });
    } catch (error: any) {
      console.error('Whisper transcription error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to transcribe audio',
      });
    }
  });


  // Align known lyrics with Whisper transcription
  router.post('/karaoke/align-lyrics', async (req, res) => {
    try {
      const { lyrics, transcription } = req.body;

      if (!lyrics || !transcription) {
        return res.status(400).json({ success: false, error: 'lyrics and transcription are required' });
      }

      console.log('🔗 Aligning lyrics with transcription...');

      const alignedWords = openaiService.alignLyricsWithTranscription(lyrics, transcription);

      res.json({
        success: true,
        data: {
          alignedWords,
          wordCount: alignedWords.length,
        },
      });
    } catch (error: any) {
      console.error('Lyrics alignment error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to align lyrics',
      });
    }
  });


  // Generate karaoke subtitles from word timestamps
  router.post('/karaoke/generate-subtitles', async (req, res) => {
    try {
      const {
        words,
        style = 'bounce',
        videoWidth = 1080,
        videoHeight = 1920,
        beats, // Optional: librosa beat timestamps for pulse effects
      } = req.body;

      if (!words || !Array.isArray(words)) {
        return res.status(400).json({ success: false, error: 'words array is required' });
      }

      console.log(`🎤 Generating karaoke subtitles (${style}) for ${words.length} words...`);
      if (beats && beats.length > 0) {
        console.log(`   🥁 Beat sync: ${beats.length} beats for pulse effects`);
      }

      const pathModule = await import('path');
      const timestamp = Date.now();
      const outputPath = pathModule.join(TempPaths.processing(), `karaoke_${timestamp}.ass`);

      await ffmpegProcessor.generateKaraokeSubtitles(
        words,
        outputPath,
        style as 'bounce' | 'glow' | 'fire' | 'neon' | 'minimal',
        videoWidth,
        videoHeight,
        2, // linesPerScreen
        beats, // Pass beat timestamps for sync effects
      );

      res.json({
        success: true,
        data: {
          subtitlePath: outputPath,
          style,
          wordCount: words.length,
          beatSyncEnabled: beats && beats.length > 0,
        },
      });
    } catch (error: any) {
      console.error('Karaoke subtitle generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate karaoke subtitles',
      });
    }
  });


  // RESYNC subtitles for a Unity package - forces fresh forced alignment
  router.post('/karaoke/resync/:packageId', async (req, res) => {
    try {
      const { packageId } = req.params;
      const { style = 'bounce' } = req.body;

      console.log(`\n🔄 RESYNC SUBTITLES for package: ${packageId}`);

      // Get the Unity package
      const pkg = await storage.getUnityContentPackage(packageId);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Package not found' });
      }

      const packageData = pkg.packageData as any;
      let audioPath = packageData.musicPath || packageData.audioPath;
      const lyrics = packageData.lyrics?.raw || packageData.lyrics;

      // If no audio path, try to extract from final video
      if (!audioPath && packageData.finalVideoUrl) {
        console.log(`   ⚠️ No audio path - extracting from final video...`);
        // Video URL format: /api/videos/unity_karaoke_xxx.mp4 -> data/videos/renders/unity_karaoke_xxx.mp4
        const videoFilename = packageData.finalVideoUrl.split('/').pop();
        const videoPath = join(process.cwd(), 'data/videos/renders', videoFilename);
        console.log(`   📹 Video path: ${videoPath}`);

        if (existsSync(videoPath)) {
          // Extract audio from video using FFmpeg
          const extractedAudioPath = join(TempPaths.processing(), `extracted_audio_${packageId}_${Date.now()}.mp3`);
          try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);

            await execAsync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 2 "${extractedAudioPath}" -y`);
            audioPath = extractedAudioPath;
            console.log(`   ✅ Extracted audio: ${extractedAudioPath}`);
          } catch (ffmpegError: any) {
            console.error(`   ❌ FFmpeg extraction failed:`, ffmpegError.message);
            return res.status(500).json({ success: false, error: `Failed to extract audio: ${ffmpegError.message}` });
          }
        }
      }

      if (!audioPath) {
        return res.status(400).json({ success: false, error: 'No audio path and could not extract from video' });
      }

      console.log(`   🎵 Audio: ${audioPath}`);
      console.log(`   📝 Lyrics: ${lyrics?.substring(0, 50)}...`);

      // Step 1: Force fresh audio analysis with forced alignment
      console.log(`   🔄 Running FRESH forced alignment (clearing cache)...`);

      // Clear any cached analysis by passing forceRefresh flag
      const analysisResult = await audioAnalysisService.analyzeAudio(audioPath, lyrics, true);

      if (!analysisResult.success || !analysisResult.analysis) {
        throw new Error(`Audio analysis failed: ${analysisResult.error}`);
      }

      const forcedAlignment = analysisResult.analysis.forcedAlignment || [];
      const vocalStartOffset = (analysisResult.analysis as any).vocalStartOffset || 0;
      const beats = analysisResult.analysis.beats || [];
      const audioDuration = analysisResult.analysis.duration;

      console.log(`   🎯 Forced alignment: ${forcedAlignment.length} words`);
      console.log(`   🎼 Vocal offset: ${vocalStartOffset.toFixed(2)}s`);
      console.log(`   🥁 Beats: ${beats.length}`);

      if (forcedAlignment.length === 0) {
        console.log(`   ⚠️ WARNING: No forced alignment returned - falling back to heuristics`);
      }

      // Apply vocal offset to forced alignment
      const forcedAlignmentWithOffset = forcedAlignment.map((w: any) => ({
        word: w.word,
        start: w.start + vocalStartOffset,
        end: w.end + vocalStartOffset,
      }));

      // Step 2: Get Whisper transcription for fallback
      const transcription = await openaiService.transcribeAudioWithTimestamps(audioPath);
      let words = transcription.words;
      if (lyrics) {
        words = openaiService.alignLyricsWithTranscription(lyrics, transcription);
      }
      console.log(`   📊 Whisper: ${words.length} words transcribed`);

      // Step 3: Generate new subtitle file
      const timestamp = Date.now();
      const subtitlePath = join(TempPaths.processing(), `karaoke_resync_${packageId}_${timestamp}.ass`);

      await ffmpegProcessor.generateKaraokeSubtitles(
        words,
        subtitlePath,
        style as 'bounce' | 'glow' | 'fire' | 'neon' | 'minimal',
        1080, // videoWidth (9:16)
        1920, // videoHeight
        2,
        beats,
        lyrics,
        audioDuration,
        (analysisResult.analysis as any).vocalOnsets || (analysisResult.analysis as any).strongOnsets || [],
        forcedAlignmentWithOffset,
      );

      console.log(`   ✅ Generated resynced subtitles: ${subtitlePath}`);

      // Step 4: Re-render video with new subtitles
      const { rerender = true } = req.body;
      let newVideoPath: string | undefined;
      let newVideoUrl: string | undefined;

      if (rerender && packageData.finalVideoUrl) {
        console.log(`   🎬 Re-rendering video with new subtitles...`);

        // Get the original video path
        const videoFilename = packageData.finalVideoUrl.split('/').pop();
        const originalVideoPath = join(process.cwd(), 'data/videos/renders', videoFilename);

        if (existsSync(originalVideoPath)) {
          const { exec } = await import('child_process');
          const { promisify } = await import('util');
          const execAsync = promisify(exec);

          // Create new video filename with timestamp
          const newTimestamp = Date.now();
          const newFilename = `unity_karaoke_resynced_${packageId.substring(0, 8)}_${newTimestamp}.mp4`;
          newVideoPath = join(process.cwd(), 'data/videos/renders', newFilename);

          // Burn subtitles into video using FFmpeg
          // First check video dimensions
          const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${originalVideoPath}"`;
          const { stdout: dimensions } = await execAsync(probeCmd);
          const [width, height] = dimensions.trim().split(',').map(Number);
          console.log(`   📐 Original video: ${width}x${height}`);

          // Use ass filter with fontsdir for proper rendering
          const ffmpegCmd = `ffmpeg -i "${originalVideoPath}" -vf "ass=${subtitlePath}" -c:a copy -y "${newVideoPath}"`;
          console.log(`   🔧 FFmpeg command: ffmpeg -i [input] -vf "ass=[subtitles]" -c:a copy -y [output]`);

          try {
            await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
            newVideoUrl = `/api/videos/${newFilename}`;
            console.log(`   ✅ Re-rendered video: ${newVideoPath}`);
          } catch (ffmpegError: any) {
            console.error(`   ❌ FFmpeg re-render failed:`, ffmpegError.message);
            // Continue without re-render - at least we have the subtitle file
          }
        }
      }

      // Update package with new subtitle path and optionally new video
      const updatedPackageData = {
        ...packageData,
        audioAnalysis: analysisResult.analysis,
        karaokeSubtitles: {
          path: subtitlePath,
          style,
          wordCount: words.length,
          resyncedAt: new Date().toISOString(),
          forcedAlignmentWordCount: forcedAlignmentWithOffset.length,
        },
        ...(newVideoUrl && {
          finalVideoUrl: newVideoUrl,
          resyncedVideoUrl: newVideoUrl,
        }),
      };

      await storage.updateUnityContentPackage(packageId, {
        packageData: updatedPackageData,
      });

      res.json({
        success: true,
        data: {
          subtitlePath,
          style,
          wordCount: words.length,
          forcedAlignmentWordCount: forcedAlignmentWithOffset.length,
          vocalOffset: vocalStartOffset,
          beatCount: beats.length,
          ...(newVideoUrl && {
            newVideoUrl,
            newVideoPath,
          }),
        },
      });
    } catch (error: any) {
      console.error('Subtitle resync error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // BATCH RESYNC - resync subtitles for ALL videos with forced alignment
  router.post('/karaoke/resync-all', async (req, res) => {
    try {
      const { style = 'bounce', rerender = true } = req.body;

      console.log(`\n🔄 BATCH RESYNC ALL VIDEOS`);
      console.log(`   Style: ${style}, Rerender: ${rerender}`);

      // Get all Unity packages with videos
      const allPackages = await storage.listUnityContentPackages();
      const packagesWithVideos = allPackages.filter((pkg: any) => {
        const data = pkg.packageData as any;
        return data?.finalVideoUrl && data?.lyrics;
      });

      console.log(`   📦 Found ${packagesWithVideos.length} packages with videos`);

      // Return immediately with job info - processing happens in background
      res.json({
        success: true,
        message: `Starting batch resync of ${packagesWithVideos.length} videos`,
        packageIds: packagesWithVideos.map((p: any) => p.id),
      });

      // Process each package sequentially (to avoid memory overload from Demucs)
      for (const pkg of packagesWithVideos) {
        const packageId = pkg.id;
        const packageData = pkg.packageData as any;

        console.log(`\n📦 Processing: ${pkg.topic || packageId}`);

        try {
          let audioPath = packageData.musicPath || packageData.audioPath;
          const lyrics = packageData.lyrics?.raw || packageData.lyrics;

          // Extract audio from video if needed
          if (!audioPath && packageData.finalVideoUrl) {
            console.log(`   ⚠️ Extracting audio from video...`);
            const videoFilename = packageData.finalVideoUrl.split('/').pop();
            const videoPath = join(process.cwd(), 'data/videos/renders', videoFilename);

            if (existsSync(videoPath)) {
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execAsync = promisify(exec);

              const extractedAudioPath = join(TempPaths.processing(), `extracted_audio_${packageId}_${Date.now()}.mp3`);
              await execAsync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -q:a 2 "${extractedAudioPath}" -y`);
              audioPath = extractedAudioPath;
              console.log(`   ✅ Extracted audio`);
            }
          }

          if (!audioPath || !lyrics) {
            console.log(`   ⏭️  Skipping - missing audio or lyrics`);
            continue;
          }

          // Run forced alignment
          console.log(`   🎯 Running forced alignment...`);
          const analysisResult = await audioAnalysisService.analyzeAudio(audioPath, lyrics, true);

          if (!analysisResult.success || !analysisResult.analysis) {
            console.log(`   ❌ Analysis failed: ${analysisResult.error}`);
            continue;
          }

          const forcedAlignment = analysisResult.analysis.forcedAlignment || [];
          const vocalStartOffset = (analysisResult.analysis as any).vocalStartOffset || 0;
          const beats = analysisResult.analysis.beats || [];
          const audioDuration = analysisResult.analysis.duration;

          console.log(`   🎯 FA: ${forcedAlignment.length} words, offset: ${vocalStartOffset.toFixed(2)}s`);

          // Apply offset
          const forcedAlignmentWithOffset = forcedAlignment.map((w: any) => ({
            word: w.word,
            start: w.start + vocalStartOffset,
            end: w.end + vocalStartOffset,
          }));

          // Get Whisper transcription
          const transcription = await openaiService.transcribeAudioWithTimestamps(audioPath);
          let words = transcription.words;
          if (lyrics) {
            words = openaiService.alignLyricsWithTranscription(lyrics, transcription);
          }

          // Generate subtitle file
          const timestamp = Date.now();
          const subtitlePath = join(TempPaths.processing(), `karaoke_resync_${packageId}_${timestamp}.ass`);

          await ffmpegProcessor.generateKaraokeSubtitles(
            words,
            subtitlePath,
            style as 'bounce' | 'glow' | 'fire' | 'neon' | 'minimal',
            1080,
            1920,
            2,
            beats,
            lyrics,
            audioDuration,
            (analysisResult.analysis as any).vocalOnsets || [],
            forcedAlignmentWithOffset,
          );

          console.log(`   ✅ Generated subtitles: ${subtitlePath}`);

          // Re-render video if requested
          let newVideoUrl: string | undefined;
          if (rerender && packageData.finalVideoUrl) {
            const videoFilename = packageData.finalVideoUrl.split('/').pop();
            const originalVideoPath = join(process.cwd(), 'data/videos/renders', videoFilename);

            if (existsSync(originalVideoPath)) {
              const { exec } = await import('child_process');
              const { promisify } = await import('util');
              const execAsync = promisify(exec);

              const newFilename = `unity_karaoke_resynced_${packageId.substring(0, 8)}_${timestamp}.mp4`;
              const newVideoPath = join(process.cwd(), 'data/videos/renders', newFilename);

              const ffmpegCmd = `ffmpeg -i "${originalVideoPath}" -vf "ass=${subtitlePath}" -c:a copy -y "${newVideoPath}"`;

              try {
                await execAsync(ffmpegCmd, { maxBuffer: 50 * 1024 * 1024 });
                newVideoUrl = `/api/videos/${newFilename}`;
                console.log(`   ✅ Re-rendered video: ${newFilename}`);
              } catch (ffmpegError: any) {
                console.error(`   ❌ Re-render failed: ${ffmpegError.message}`);
              }
            }
          }

          // Update package
          const updatedPackageData = {
            ...packageData,
            audioAnalysis: analysisResult.analysis,
            karaokeSubtitles: {
              path: subtitlePath,
              style,
              wordCount: words.length,
              resyncedAt: new Date().toISOString(),
              forcedAlignmentWordCount: forcedAlignmentWithOffset.length,
            },
            ...(newVideoUrl && { finalVideoUrl: newVideoUrl, resyncedVideoUrl: newVideoUrl }),
          };

          await storage.updateUnityContentPackage(packageId, { packageData: updatedPackageData });
          console.log(`   ✅ Package updated`);
        } catch (pkgError: any) {
          console.error(`   ❌ Failed: ${pkgError.message}`);
        }
      }

      console.log(`\n✅ BATCH RESYNC COMPLETE`);
    } catch (error: any) {
      console.error('Batch resync error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Full karaoke pipeline: transcribe + generate subtitles with optional beat sync
  router.post('/karaoke/full-pipeline', uploadMusic.single('audio'), async (req, res) => {
    try {
      let audioPath: string;

      // Accept either file upload or existing file path
      if (req.file) {
        audioPath = req.file.path;
      } else if (req.body.audioPath) {
        const pathModule = await import('path');
        audioPath = pathModule.join(process.cwd(), req.body.audioPath.replace('/music/', 'attached_assets/music/'));
      } else {
        return res.status(400).json({ success: false, error: 'Audio file or path is required' });
      }

      const {
        lyrics,
        style = 'bounce',
        videoWidth = 1080,
        videoHeight = 1920,
        enableBeatSync = true, // Enable librosa beat sync by default
      } = req.body;

      console.log('🎤 Running full karaoke pipeline...');
      console.log(`   Audio: ${audioPath}`);
      console.log(`   Style: ${style}`);
      console.log(`   Beat sync: ${enableBeatSync}`);

      // Step 1: Transcribe with Whisper for word-level timestamps
      const transcription = await openaiService.transcribeAudioWithTimestamps(audioPath);
      console.log(`   ✅ Transcribed ${transcription.words.length} words`);

      // Step 2: Run librosa analysis for beat timestamps + forced alignment (if lyrics provided)
      let beats: number[] = [];
      let forcedAlignment: Array<{ word: string; start: number; end: number }> = [];
      let onsets: number[] = [];
      let audioDuration: number | undefined;

      try {
        // Pass lyrics to get FORCED ALIGNMENT (exact word timing from Wav2Vec2)
        const analysisResult = await audioAnalysisService.analyzeAudio(audioPath, lyrics);
        if (analysisResult.success && analysisResult.analysis) {
          if (enableBeatSync && analysisResult.analysis.beats) {
            beats = analysisResult.analysis.beats;
            console.log(`   ✅ Librosa: ${beats.length} beats detected at ${analysisResult.analysis.bpm} BPM`);
          }

          // Get forced alignment (PRIORITY for karaoke sync)
          if (analysisResult.analysis.forcedAlignment) {
            forcedAlignment = analysisResult.analysis.forcedAlignment;
            console.log(`   🎯 Forced alignment: ${forcedAlignment.length} words with EXACT timing`);
          }

          // Fallback: get onsets for snap-to-onset timing
          const vocalOnsets = (analysisResult.analysis as any).vocalOnsets || [];
          const strongOnsets = (analysisResult.analysis as any).strongOnsets || [];
          onsets = vocalOnsets.length > 0 ? vocalOnsets : strongOnsets;
          if (onsets.length > 0) {
            console.log(`   📊 Onsets: ${onsets.length} detected (${vocalOnsets.length > 0 ? 'vocal' : 'full-mix'})`);
          }

          audioDuration = analysisResult.analysis.duration;
        }
      } catch (analysisError) {
        console.warn('   ⚠️ Audio analysis failed, continuing without beat sync:', analysisError);
      }

      // Step 3: Align with lyrics if provided, otherwise use raw transcription
      let words = transcription.words;
      if (lyrics) {
        words = openaiService.alignLyricsWithTranscription(lyrics, transcription);
        console.log(`   ✅ Aligned ${words.length} words with lyrics`);
      }

      // Step 4: Generate karaoke subtitles with FORCED ALIGNMENT (priority) + beat sync
      const pathModule = await import('path');
      const timestamp = Date.now();
      const subtitlePath = pathModule.join(TempPaths.processing(), `karaoke_${timestamp}.ass`);

      await ffmpegProcessor.generateKaraokeSubtitles(
        words,
        subtitlePath,
        style as 'bounce' | 'glow' | 'fire' | 'neon' | 'minimal',
        videoWidth,
        videoHeight,
        2, // linesPerScreen
        beats,
        lyrics, // Original lyrics
        audioDuration, // Audio duration
        onsets, // Onset timing (fallback)
        forcedAlignment, // PRIORITY: Exact timing from Wav2Vec2
      );
      console.log(`   ✅ Generated karaoke subtitles with ${beats.length > 0 ? 'beat sync' : 'no beat sync'}`);

      res.json({
        success: true,
        data: {
          transcription: {
            text: transcription.text,
            wordCount: transcription.words.length,
            duration: transcription.duration,
          },
          alignedWords: words,
          subtitlePath,
          style,
          beatSyncEnabled: beats.length > 0,
          beatCount: beats.length,
        },
      });
    } catch (error: any) {
      console.error('Karaoke pipeline error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to run karaoke pipeline',
      });
    }
  });


  // ============================================================================
  // SUNO STYLE BANDIT ENDPOINTS
  // Thompson Sampling for music style experimentation
  // ============================================================================

  // Get Suno style bandit status (all arms, success rates, etc.)
  router.get('/suno-bandit/status', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const status = sunoStyleBandit.getStatus();
      res.json({ success: true, data: status });
    } catch (error: any) {
      console.error('Suno bandit status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Select a Suno style using Thompson Sampling
  router.get('/suno-bandit/select', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const selection = sunoStyleBandit.selectStyle();
      res.json({ success: true, data: selection });
    } catch (error: any) {
      console.error('Suno bandit selection error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Record outcome for a Suno style (called when video performance is known)
  router.post('/suno-bandit/record-outcome', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const { styleId, videoId, views, ctr, avgViewDuration } = req.body;

      if (!styleId || !videoId) {
        return res.status(400).json({ success: false, error: 'styleId and videoId required' });
      }

      sunoStyleBandit.recordOutcome(styleId, videoId, {
        views: views || 0,
        ctr: ctr || 0,
        avgViewDuration: avgViewDuration || 0,
      });

      res.json({ success: true, message: 'Outcome recorded' });
    } catch (error: any) {
      console.error('Suno bandit outcome error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Add a new experimental style arm
  router.post('/suno-bandit/add-style', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const { id, name, description, genre, bpm, vocals, instruments, mood, fullStylePrompt } = req.body;

      if (!id || !name || !fullStylePrompt) {
        return res.status(400).json({ success: false, error: 'id, name, and fullStylePrompt required' });
      }

      sunoStyleBandit.addStyleArm({
        id,
        name,
        description: description || '',
        genre: genre || '',
        bpm: bpm || '',
        vocals: vocals || '',
        instruments: instruments || '',
        mood: mood || '',
        fullStylePrompt,
      });

      res.json({ success: true, message: `Style "${name}" added to bandit` });
    } catch (error: any) {
      console.error('Suno bandit add style error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // SONIC IDENTITY REWARD SYSTEM
  // Process music-related comments to boost audio styles
  // ============================================================================

  // Process sonic engagement from YouTube comments
  router.post('/suno-bandit/sonic-engagement', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const { styleId, comments } = req.body;

      if (!styleId || !comments || !Array.isArray(comments)) {
        return res.status(400).json({
          success: false,
          error: 'styleId and comments array required',
        });
      }

      const result = sunoStyleBandit.processSonicEngagement(styleId, comments);

      res.json({
        success: true,
        data: result,
        message:
          result.boostApplied > 0
            ? `Sonic boost applied: +${result.boostApplied.toFixed(1)} alpha`
            : 'No sonic keywords detected',
      });
    } catch (error: any) {
      console.error('Sonic engagement error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get content sprint lock status
  router.get('/suno-bandit/content-sprint', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const lock = sunoStyleBandit.getContentSprintLock();

      res.json({
        success: true,
        active: !!lock,
        data: lock,
      });
    } catch (error: any) {
      console.error('Content sprint status error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Start a content sprint manually
  router.post('/suno-bandit/content-sprint/start', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const { styleId, videoCount } = req.body;

      if (!styleId) {
        return res.status(400).json({ success: false, error: 'styleId required' });
      }

      const success = sunoStyleBandit.startContentSprint(styleId, videoCount || 5);

      if (success) {
        const lock = sunoStyleBandit.getContentSprintLock();
        res.json({ success: true, data: lock });
      } else {
        res.status(400).json({ success: false, error: 'Unknown style ID' });
      }
    } catch (error: any) {
      console.error('Content sprint start error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Cancel content sprint
  router.post('/suno-bandit/content-sprint/cancel', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const cancelled = sunoStyleBandit.cancelContentSprint();

      res.json({
        success: true,
        cancelled,
        message: cancelled ? 'Content sprint cancelled' : 'No active sprint to cancel',
      });
    } catch (error: any) {
      console.error('Content sprint cancel error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Select style with sprint awareness
  router.get('/suno-bandit/select-with-sprint', async (req, res) => {
    try {
      const { sunoStyleBandit } = await import('../services/suno-style-bandit');
      const selection = sunoStyleBandit.selectStyleWithSprint();

      res.json({ success: true, data: selection });
    } catch (error: any) {
      console.error('Select with sprint error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // VISUAL QUALITY REWARD SYSTEM
  // Feed clip validation scores into style bandit for quality-driven learning
  // ============================================================================

  // Record visual quality feedback for a single clip
  router.post('/style-bandit/visual-quality', async (req, res) => {
    try {
      const { styleBanditService } = await import('../services/style-bandit-service');
      const { styleName, scores, overallScore, passed } = req.body;

      if (!styleName || !scores || overallScore === undefined) {
        return res.status(400).json({
          success: false,
          error: 'styleName, scores, and overallScore required',
        });
      }

      const result = await styleBanditService.recordVisualQuality(styleName, scores, overallScore, passed ?? false);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Visual quality feedback error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Record batch visual quality for entire job
  router.post('/style-bandit/job-visual-quality', async (req, res) => {
    try {
      const { styleBanditService } = await import('../services/style-bandit-service');
      const { styleName, clipResults } = req.body;

      if (!styleName || !clipResults || !Array.isArray(clipResults)) {
        return res.status(400).json({
          success: false,
          error: 'styleName and clipResults array required',
        });
      }

      const result = await styleBanditService.recordJobVisualQuality(styleName, clipResults);

      res.json({
        success: true,
        data: result,
        message: `Processed ${clipResults.length} clips for style "${styleName}"`,
      });
    } catch (error: any) {
      console.error('Job visual quality error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // AUDIO-VIDEO SYNC VALIDATION ENDPOINTS
  // Validates Kling clips are properly synchronized with music/lyrics
  // ============================================================================

  // Get forced alignment for an audio file
  router.post('/sync/forced-alignment', async (req, res) => {
    try {
      const { audioVideoSyncService } = await import('../services/audio-video-sync-service');
      const { audioPath, useVocalIsolation, lyrics } = req.body;

      if (!audioPath) {
        return res.status(400).json({ success: false, error: 'audioPath required' });
      }

      const result = await audioVideoSyncService.getForcedAlignment(audioPath, {
        useVocalIsolation: useVocalIsolation !== false,
        lyrics,
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Forced alignment error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Build lyric spans for clips from alignment
  router.post('/sync/lyric-spans', async (req, res) => {
    try {
      const { audioVideoSyncService } = await import('../services/audio-video-sync-service');
      const { alignment, clipDuration } = req.body;

      if (!alignment) {
        return res.status(400).json({ success: false, error: 'alignment required' });
      }

      const spans = audioVideoSyncService.buildLyricSpans(alignment, clipDuration || 5);
      res.json({ success: true, data: { spans, count: spans.length } });
    } catch (error: any) {
      console.error('Lyric spans error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Quick sync check for a single clip
  router.post('/sync/quick-check', async (req, res) => {
    try {
      const { audioVideoSyncService } = await import('../services/audio-video-sync-service');
      const { clipPath, expectedStartTime, expectedEndTime, alignment } = req.body;

      if (!clipPath || expectedStartTime === undefined || expectedEndTime === undefined) {
        return res.status(400).json({
          success: false,
          error: 'clipPath, expectedStartTime, and expectedEndTime required',
        });
      }

      const result = await audioVideoSyncService.quickSyncCheck(
        clipPath,
        expectedStartTime,
        expectedEndTime,
        alignment,
      );

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Quick sync check error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Full sync validation for all clips
  router.post('/sync/validate', async (req, res) => {
    try {
      const { audioVideoSyncService } = await import('../services/audio-video-sync-service');
      const { audioPath, clipPaths, packageId, useVocalIsolation, clipDuration } = req.body;

      if (!audioPath || !clipPaths || !packageId) {
        return res.status(400).json({
          success: false,
          error: 'audioPath, clipPaths, and packageId required',
        });
      }

      const report = await audioVideoSyncService.validateSync(audioPath, clipPaths, packageId, {
        useVocalIsolation: useVocalIsolation !== false,
        clipDuration,
      });

      res.json({ success: true, data: report });
    } catch (error: any) {
      console.error('Sync validation error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Librosa audio analysis endpoint
  router.post('/audio/analyze-librosa', async (req, res) => {
    try {
      const { audioPath, duration } = req.body;
      if (!audioPath) {
        return res.status(400).json({ success: false, error: 'audioPath required' });
      }

      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const durationArg = duration ? `, duration=${duration}` : '';
      const script = `
import json
import numpy as np
import librosa

y, sr = librosa.load("${audioPath}", sr=22050${durationArg})
tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
bpm = float(tempo) if np.isscalar(tempo) else float(tempo[0])
rms = librosa.feature.rms(y=y)[0]
avg_energy = float(np.mean(rms))
spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
spectral_brightness = float(np.mean(spectral_centroids))
duration = librosa.get_duration(y=y, sr=sr)

print(json.dumps({
    "bpm": round(bpm, 1),
    "avgEnergy": round(avg_energy, 4),
    "spectralBrightness": round(spectral_brightness, 1),
    "duration": round(duration, 2)
}))
`;

      const { stdout } = await execAsync(`python3 -c '${script.replace(/'/g, "'\"'\"'")}'`, { timeout: 60000 });
      const result = JSON.parse(stdout.trim());
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Librosa analysis error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // =====================================================
  // STYLE BANDIT ROUTES
  // Visual style Thompson Sampling for anti-bot variation
  // =====================================================

  router.get('/style-bandit/stats', async (req, res) => {
    try {
      const { styleBanditService } = await import('../services/style-bandit-service');
      const stats = await styleBanditService.getStyleStats();

      res.json({
        success: true,
        data: stats,
        meta: { count: stats.length },
      });
    } catch (error: any) {
      console.error('Get style stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/style-bandit/select', async (req, res) => {
    try {
      const { styleBanditService } = await import('../services/style-bandit-service');
      const selected = await styleBanditService.selectStyle();

      res.json({
        success: true,
        data: selected,
      });
    } catch (error: any) {
      console.error('Select style error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/style-bandit/outcome', async (req, res) => {
    try {
      const { styleBanditService } = await import('../services/style-bandit-service');
      const { styleName, success, metrics } = req.body;

      if (!styleName || success === undefined) {
        return res.status(400).json({ success: false, error: 'styleName and success are required' });
      }

      await styleBanditService.recordOutcome(styleName, success, metrics);

      res.json({
        success: true,
        message: `Recorded ${success ? 'success' : 'failure'} for style "${styleName}"`,
      });
    } catch (error: any) {
      console.error('Record outcome error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // ACOUSTIC FINGERPRINTING API
  // Deep audio DNA analysis for retention correlation
  // ============================================================================

  router.get('/audio-dna/package/:packageId', async (req, res) => {
    try {
      const { acousticFingerprintService } = await import('../services/acoustic-fingerprint-service');
      const fingerprint = await acousticFingerprintService.getFingerprintByPackage(req.params.packageId);

      if (!fingerprint) {
        return res.status(404).json({ success: false, error: 'Fingerprint not found' });
      }

      const insight = acousticFingerprintService.generateStrategicInsight(fingerprint);
      const comparison = acousticFingerprintService.compareToWinnerPatterns(fingerprint);

      res.json({
        success: true,
        data: {
          fingerprint,
          insight,
          comparison,
        },
      });
    } catch (error: any) {
      console.error('Get fingerprint error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/audio-dna/analyze', async (req, res) => {
    try {
      const { audioPath, packageId } = req.body;

      if (!audioPath) {
        return res.status(400).json({ success: false, error: 'audioPath is required' });
      }

      const { acousticFingerprintService } = await import('../services/acoustic-fingerprint-service');
      const fingerprint = await acousticFingerprintService.extractFingerprint(audioPath);

      if (!fingerprint) {
        return res.status(500).json({ success: false, error: 'Fingerprint extraction failed' });
      }

      // Store in database if packageId provided
      let dbId = null;
      if (packageId) {
        dbId = await acousticFingerprintService.storeFingerprint(packageId, fingerprint);
      }

      const insight = acousticFingerprintService.generateStrategicInsight(fingerprint);
      const comparison = acousticFingerprintService.compareToWinnerPatterns(fingerprint);

      res.json({
        success: true,
        data: {
          fingerprint,
          insight,
          comparison,
          storedId: dbId,
        },
      });
    } catch (error: any) {
      console.error('Analyze audio error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/audio-dna/stats', async (req, res) => {
    try {
      const { db } = await import('../db');
      const { audioDna } = await import('@shared/schema');
      const { sql, avg, count } = await import('drizzle-orm');

      // Get aggregate stats across all fingerprints
      const results = await db
        .select({
          totalFingerprints: count(audioDna.id),
          avgBpm: avg(audioDna.bpm),
          avgHookSurvival: avg(audioDna.predictedHookSurvival),
          avgPercussiveness: avg(audioDna.percussivenessScore),
          avgBrightness: avg(audioDna.brightnessScore),
        })
        .from(audioDna);

      // Get energy curve distribution
      const curveDist = await db
        .select({
          energyCurve: audioDna.energyCurve,
          count: count(),
        })
        .from(audioDna)
        .groupBy(audioDna.energyCurve);

      res.json({
        success: true,
        data: {
          summary: results[0],
          energyCurveDistribution: curveDist,
        },
      });
    } catch (error: any) {
      console.error('Get audio DNA stats error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
