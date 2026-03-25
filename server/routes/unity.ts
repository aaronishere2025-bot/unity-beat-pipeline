/**
 * Unity Content Routes
 *
 * Unity content system, narrative quality, character profiles, scenes,
 * content packages, audio analysis, visual scene extraction.
 */

import { Router } from 'express';
import fs from 'fs';
import { existsSync, writeFileSync, createReadStream, statSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join, basename } from 'path';
import { uploadCharacterImage, uploadReferenceImage, uploadMusic, musicDir, referenceImagesDir, characterImagesDir } from './shared/multer-configs';
import { storage } from '../storage';
import { db } from '../db';
import { ffmpegProcessor } from '../services/ffmpeg-processor';
import { openaiService } from '../services/openai-service';
import { klingVideoGenerator } from '../services/kling-video-generator';
import { sunoApi, trimLyricsForDuration } from '../services/suno-api';
import { ENERGY_LEVELS, MOOD_ARCS, SETTING_APPROACHES, VIBE_PRESETS, VIDEO_STYLE_TEMPLATES, VISUAL_STYLES, VOICE_STYLES, unityContentGenerator } from '../services/unity-content-generator';
import { unityTimingAnalyzer } from '../services/unity-timing-analyzer';
import { PLATFORM_LIMITS, TrimPlatform, audioAnalysisService, smartAudioTrimmerService, veoAudioSyncService } from '../services/audio-analysis-service';
import { insertCharacterProfileSchema } from '@shared/schema';
import axios from 'axios';
import { TempPaths } from '../utils/temp-file-manager';
import { promisify } from 'util';
import { exec } from 'child_process';
import { getAvailableEngines, VideoEngine } from '../services/unified-video-generator';
import { generateViralLyrics } from '../services/viral-lyrics-engine';


const router = Router();

// AI Endpoint Rate Limiting
const aiRateLimiters = new Map<string, { lastCall: Date; callCount: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_CALLS_PER_WINDOW = 10; // Max 10 calls per minute per endpoint

function checkRateLimit(endpoint: string): { allowed: boolean; error?: string } {
  const now = Date.now();
  const limiter = aiRateLimiters.get(endpoint) || { lastCall: new Date(0), callCount: 0 };

  const timeSinceLastWindow = now - limiter.lastCall.getTime();
  if (timeSinceLastWindow < RATE_LIMIT_WINDOW_MS) {
    if (limiter.callCount >= MAX_CALLS_PER_WINDOW) {
      const secondsRemaining = Math.ceil((RATE_LIMIT_WINDOW_MS - timeSinceLastWindow) / 1000);
      return {
        allowed: false,
        error: `Rate limit exceeded: Max ${MAX_CALLS_PER_WINDOW} calls per minute. Try again in ${secondsRemaining}s`,
      };
    }
    limiter.callCount++;
  } else {
    limiter.lastCall = new Date();
    limiter.callCount = 1;
  }
  aiRateLimiters.set(endpoint, limiter);
  return { allowed: true };
}

// Unity Content System services (loaded dynamically)
let unityLyricsGenerator: any;
let sunoStyleGenerator: any;
let UNITY_STYLE_PRESETS: any;
let THEME_MODIFIERS: any;
let rhymeStackEngine: any;
let RHYME_FAMILIES: any;
let UNITY_FORMULAS: any;
let newsAggregator: any;

const initUnityServices = async () => {
  const lyricsMod = await import('../services/unity-lyrics-generator');
  unityLyricsGenerator = lyricsMod.unityLyricsGenerator;
  const styleMod = await import('../services/suno-style-presets');
  sunoStyleGenerator = styleMod.sunoStyleGenerator;
  UNITY_STYLE_PRESETS = styleMod.UNITY_STYLE_PRESETS;
  THEME_MODIFIERS = styleMod.THEME_MODIFIERS;
  const rhymeMod = await import('../services/rhyme-stack-engine');
  rhymeStackEngine = rhymeMod.rhymeStackEngine;
  RHYME_FAMILIES = rhymeMod.RHYME_FAMILIES;
  UNITY_FORMULAS = rhymeMod.UNITY_FORMULAS;
  const newsMod = await import('../services/news-aggregator');
  newsAggregator = newsMod.newsAggregator;
};
initUnityServices();



const execAsync = promisify(exec);




  // Character Profiles endpoints
  router.post('/character-profiles', async (req, res) => {
    try {
      const validatedData = insertCharacterProfileSchema.parse(req.body);
      const profile = await storage.createCharacterProfile(validatedData);
      res.json({ success: true, data: profile });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to create character profile',
      });
    }
  });


  router.get('/character-profiles', async (req, res) => {
    try {
      const profiles = await storage.listCharacterProfiles();
      res.json({ success: true, data: profiles });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch character profiles',
      });
    }
  });


  router.get('/character-profiles/:id', async (req, res) => {
    try {
      const profile = await storage.getCharacterProfile(req.params.id);
      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Character profile not found',
        });
      }
      res.json({ success: true, data: profile });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch character profile',
      });
    }
  });


  router.patch('/character-profiles/:id', async (req, res) => {
    try {
      const profile = await storage.updateCharacterProfile(req.params.id, req.body);
      if (!profile) {
        return res.status(404).json({
          success: false,
          error: 'Character profile not found',
        });
      }
      res.json({ success: true, data: profile });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update character profile',
      });
    }
  });


  router.delete('/character-profiles/:id', async (req, res) => {
    try {
      await storage.deleteCharacterProfile(req.params.id);
      res.json({ success: true, message: 'Character profile deleted' });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete character profile',
      });
    }
  });


  // Character image upload endpoint
  router.post('/upload-character-image', uploadCharacterImage.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
      }

      // Construct absolute URL for Replicate IP-Adapter
      const protocol = req.headers['x-forwarded-proto'] || 'http';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const absoluteUrl = `${protocol}://${host}/api/character-images/${req.file.filename}`;

      res.json({
        success: true,
        data: {
          url: absoluteUrl,
          filename: req.file.filename,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to upload image',
      });
    }
  });


  // Serve character images
  router.get('/character-images/:filename', async (req, res) => {
    try {
      const { filename } = req.params;

      // Security: Prevent directory traversal
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Invalid filename' });
      }

      // Security: Only serve allowed image types
      const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      const ext = filename.split('.').pop()?.toLowerCase();
      if (!ext || !allowedExtensions.includes(ext)) {
        return res.status(400).json({ error: 'Invalid file type' });
      }

      const imagePath = join(characterImagesDir, filename);

      // Check if file exists
      if (!existsSync(imagePath)) {
        return res.status(404).json({ error: 'Image not found' });
      }

      const stat = statSync(imagePath);

      // Set appropriate content type
      const contentTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };

      res.writeHead(200, {
        'Content-Length': stat.size,
        'Content-Type': contentTypes[ext] || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      });

      createReadStream(imagePath).pipe(res);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to serve image',
      });
    }
  });


  // VEO 3.1 Reference Image upload endpoint (for 100% character consistency)
  // Supports up to 3 images that VEO uses as visual anchors across all clips
  router.post('/upload-reference-image', uploadReferenceImage.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No image uploaded',
        });
      }

      const filePath = join(referenceImagesDir, req.file.filename);

      // Validate file exists
      if (!existsSync(filePath)) {
        return res.status(500).json({
          success: false,
          error: 'Uploaded file not found',
        });
      }

      // Get image dimensions for validation
      let width = 0,
        height = 0;
      try {
        // Use ffprobe to get image dimensions
        const ffprobeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${filePath}"`;
        const { stdout } = await execAsync(ffprobeCmd);
        const [w, h] = stdout.trim().split(',').map(Number);
        width = w || 0;
        height = h || 0;
      } catch (error) {
        console.warn('Could not get image dimensions:', error);
      }

      // Construct URL path for the image
      const imageUrl = `/api/reference-images/${req.file.filename}`;

      console.log(`✅ Reference image uploaded: ${req.file.filename} (${width}x${height})`);

      res.json({
        success: true,
        data: {
          url: imageUrl,
          filename: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          dimensions: { width, height },
        },
      });
    } catch (error: any) {
      console.error('Reference image upload error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to upload reference image',
      });
    }
  });


  // Serve reference images
  router.get('/reference-images/:filename', (req, res) => {
    try {
      const { filename } = req.params;
      const safeFilename = basename(filename);
      const filePath = join(referenceImagesDir, safeFilename);

      if (!existsSync(filePath)) {
        return res.status(404).json({ error: 'Reference image not found' });
      }

      res.sendFile(filePath);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Scenes endpoints
  router.get('/scenes', async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const scenesList = await storage.listScenes(category);
      res.json({ success: true, data: scenesList });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch scenes',
      });
    }
  });


  // Get all Suno style presets
  router.get('/unity/suno-presets', async (req, res) => {
    try {
      const presets = sunoStyleGenerator.getAllPresets();
      const themeModifiers = THEME_MODIFIERS;

      res.json({
        success: true,
        data: {
          presets,
          themeModifiers,
          presetNames: Object.keys(presets),
        },
      });
    } catch (error: any) {
      console.error('Error getting Suno presets:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate Suno music prompt for unity content
  router.post('/unity/generate-music-prompt', async (req, res) => {
    try {
      const { topic, style = 'battleUnity', theme = 'political', targetBpm, includeRapBattle = true } = req.body;

      if (!topic) {
        return res.status(400).json({
          success: false,
          error: 'Topic is required',
        });
      }

      const result = sunoStyleGenerator.generateUnityTrackPrompt(topic, {
        style,
        theme,
        targetBpm,
        includeRapBattle,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Error generating music prompt:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get rhyme families and formulas
  router.get('/unity/rhyme-data', async (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          families: RHYME_FAMILIES,
          formulas: UNITY_FORMULAS,
          familyNames: Object.keys(RHYME_FAMILIES),
        },
      });
    } catch (error: any) {
      console.error('Error getting rhyme data:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Find rhymes for a word
  router.get('/unity/rhymes/:word', async (req, res) => {
    try {
      const { word } = req.params;
      const { count = 10 } = req.query;

      const rhymes = rhymeStackEngine.generateRhymeStack(word, Number(count));
      const internal = rhymeStackEngine.findInternalRhymes(word);
      const emphasized = rhymeStackEngine.addEmphasis(word);

      res.json({
        success: true,
        data: {
          word,
          emphasized,
          rhymes,
          internalRhymes: internal,
        },
      });
    } catch (error: any) {
      console.error('Error finding rhymes:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ===================================================================

  // Generate template-based unity lyrics
  router.post('/unity/generate-lyrics', async (req, res) => {
    try {
      // Rate limiting
      const rateCheck = checkRateLimit('generate-lyrics');
      if (!rateCheck.allowed) {
        return res.status(429).json({ success: false, error: rateCheck.error });
      }

      // Cost guard
      const { costGuard } = await import('../services/cost-guard');
      const costCheck = await costGuard.canProceed(0.03, 'generate_lyrics');
      if (!costCheck.allowed) {
        return res.status(429).json({ success: false, error: 'Cost limit reached', reason: costCheck.reason });
      }

      const { topic, bpm = 125, customBars = [], commonGround } = req.body;

      if (!topic) {
        return res.status(400).json({
          success: false,
          error: 'Topic is required',
        });
      }

      const lyrics = await unityLyricsGenerator.generateUnityLyrics({
        topic,
        bpm,
        customBars,
        commonGround,
      });

      res.json({
        success: true,
        data: lyrics,
      });
    } catch (error: any) {
      console.error('Error generating lyrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate AI-enhanced unity lyrics
  router.post('/unity/generate-ai-lyrics', async (req, res) => {
    try {
      // Rate limiting + cost guard
      const rateCheck = checkRateLimit('generate-ai-lyrics');
      if (!rateCheck.allowed) return res.status(429).json({ success: false, error: rateCheck.error });

      const { costGuard } = await import('../services/cost-guard');
      const costCheck = await costGuard.canProceed(0.03, 'generate_ai_lyrics');
      if (!costCheck.allowed)
        return res.status(429).json({ success: false, error: 'Cost limit reached', reason: costCheck.reason });

      const { topic, bpm = 125, customBars = [], commonGround } = req.body;

      if (!topic) {
        return res.status(400).json({
          success: false,
          error: 'Topic is required',
        });
      }

      const lyrics = await unityLyricsGenerator.generateAIUnityLyrics({
        topic,
        bpm,
        customBars,
        commonGround,
      });

      res.json({
        success: true,
        data: lyrics,
      });
    } catch (error: any) {
      console.error('Error generating AI lyrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate lyrics from a creative prompt
  router.post('/unity/generate-from-prompt', async (req, res) => {
    try {
      // Rate limiting + cost guard
      const rateCheck = checkRateLimit('generate-from-prompt');
      if (!rateCheck.allowed) return res.status(429).json({ success: false, error: rateCheck.error });

      const { costGuard } = await import('../services/cost-guard');
      const costCheck = await costGuard.canProceed(0.03, 'generate_from_prompt');
      if (!costCheck.allowed)
        return res.status(429).json({ success: false, error: 'Cost limit reached', reason: costCheck.reason });

      const { prompt, bpm = 125, structure = 'standard' } = req.body;

      if (!prompt || prompt.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: 'Please provide a creative prompt (at least 10 characters)',
        });
      }

      const lyrics = await unityLyricsGenerator.generateFromPrompt({
        prompt,
        bpm,
        structure,
      });

      res.json({
        success: true,
        data: lyrics,
      });
    } catch (error: any) {
      console.error('Error generating lyrics from prompt:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate VIRAL historical rap lyrics using Viral Lyrics Engine v2.0
  router.post('/unity/generate-viral-lyrics', async (req, res) => {
    try {
      // Rate limiting + cost guard
      const rateCheck = checkRateLimit('generate-viral-lyrics');
      if (!rateCheck.allowed) return res.status(429).json({ success: false, error: rateCheck.error });

      const { costGuard } = await import('../services/cost-guard');
      const costCheck = await costGuard.canProceed(0.03, 'generate_viral_lyrics');
      if (!costCheck.allowed)
        return res.status(429).json({ success: false, error: 'Cost limit reached', reason: costCheck.reason });

      const { figureName, era, archetype = 'conqueror', keyFacts = [], tone = 'triumphant' } = req.body;

      if (!figureName) {
        return res.status(400).json({
          success: false,
          error: 'figureName is required',
        });
      }

      console.log(`🎤 Generating viral lyrics for: ${figureName}`);

      const result = await generateViralLyrics(figureName, era || 'ancient', archetype, keyFacts, tone);

      res.json({
        success: true,
        data: result,
      });
    } catch (error: any) {
      console.error('Error generating viral lyrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get balanced news summary
  router.get('/unity/news', async (req, res) => {
    try {
      const { topic } = req.query;

      if (!topic) {
        return res.status(400).json({
          success: false,
          error: 'Topic query parameter is required',
        });
      }

      const news = newsAggregator.gatherBalancedNews(String(topic));

      res.json({
        success: true,
        data: news,
      });
    } catch (error: any) {
      console.error('Error fetching news:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Find common ground on a political topic
  router.post('/unity/find-common-ground', async (req, res) => {
    try {
      const { topic } = req.body;

      if (!topic) {
        return res.status(400).json({
          success: false,
          error: 'Topic is required',
        });
      }

      const commonGround = await newsAggregator.findCommonGround(String(topic));

      res.json({
        success: true,
        data: commonGround,
      });
    } catch (error: any) {
      console.error('Error finding common ground:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Recommend best Suno style preset
  router.post('/unity/recommend-preset', async (req, res) => {
    try {
      const { isRapBattle = true, energy = 'high', targetAudience = 'general', platform } = req.body;

      const recommendation = sunoStyleGenerator.recommendPreset({
        isRapBattle,
        energy,
        targetAudience,
        platform,
      });

      const preset = sunoStyleGenerator.getPreset(recommendation);

      res.json({
        success: true,
        data: {
          recommendedPreset: recommendation,
          presetDetails: preset,
        },
      });
    } catch (error: any) {
      console.error('Error recommending preset:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================
  // UNITY CONTENT GENERATOR ENDPOINTS
  // ============================================

  // Analyze lyrics timing before generation
  router.post('/unity/analyze-timing', async (req, res) => {
    try {
      const { lyrics, bpm = 125, targetDurationSeconds } = req.body;

      if (!lyrics) {
        return res.status(400).json({
          success: false,
          error: 'Lyrics are required for timing analysis',
        });
      }

      const timing = await unityTimingAnalyzer.analyzeLyricsTiming(lyrics, {
        bpm,
        targetDurationSeconds,
      });

      res.json({
        success: true,
        data: timing,
      });
    } catch (error: any) {
      console.error('Error analyzing timing:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Estimate duration from structure (pre-generation planning)
  router.post('/unity/estimate-duration', async (req, res) => {
    try {
      const { structure, bpm = 125 } = req.body;

      const estimate = unityTimingAnalyzer.estimateDurationFromStructure(structure, bpm);

      res.json({
        success: true,
        data: estimate,
      });
    } catch (error: any) {
      console.error('Error estimating duration:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Suggest structure for target duration
  router.post('/unity/suggest-structure', async (req, res) => {
    try {
      const { targetDurationSeconds, bpm = 125 } = req.body;

      if (!targetDurationSeconds) {
        return res.status(400).json({
          success: false,
          error: 'Target duration is required',
        });
      }

      const structure = unityTimingAnalyzer.suggestStructureForDuration(targetDurationSeconds, bpm);

      res.json({
        success: true,
        data: structure,
      });
    } catch (error: any) {
      console.error('Error suggesting structure:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================
  // ARTICLE-ENHANCED: NLP Visual Extraction
  // Extract visual elements from lyrics using OpenAI
  // ============================================
  router.post('/unity/extract-visual-scene', async (req, res) => {
    try {
      const { lyricLine } = req.body;

      if (!lyricLine) {
        return res.status(400).json({
          success: false,
          error: 'Lyric line is required for visual extraction',
        });
      }

      const nlpScene = await unityContentGenerator.extractVisualScene(lyricLine);

      res.json({
        success: true,
        data: nlpScene,
      });
    } catch (error: any) {
      console.error('Error extracting visual scene:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get pacing guidance for a section type
  router.post('/unity/pacing-guidance', async (req, res) => {
    try {
      const { sectionType, bpm = 120 } = req.body;

      if (!sectionType) {
        return res.status(400).json({
          success: false,
          error: 'Section type is required',
        });
      }

      const pacing = unityContentGenerator.getPacingGuidance(sectionType, bpm);

      res.json({
        success: true,
        data: pacing,
      });
    } catch (error: any) {
      console.error('Error getting pacing guidance:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Build comedy-enhanced prompt
  router.post('/unity/comedy-enhance', async (req, res) => {
    try {
      const { basePrompt, sectionType, comedyLevel = 'medium' } = req.body;

      if (!basePrompt || !sectionType) {
        return res.status(400).json({
          success: false,
          error: 'Base prompt and section type are required',
        });
      }

      const enhancedPrompt = unityContentGenerator.buildComedyEnhancedPrompt(basePrompt, sectionType, comedyLevel);

      res.json({
        success: true,
        data: { enhancedPrompt },
      });
    } catch (error: any) {
      console.error('Error enhancing prompt with comedy:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate complete content package (lyrics + style + characters + VEO prompts)
  // Set enableSunoGeneration=true to auto-generate music via Suno API
  router.post('/unity/generate-package', async (req, res) => {
    try {
      const {
        topic,
        message,
        voice = 'observational',
        energy = 'building',
        mood = 'ironic_to_warm',
        visualStyle = 'cinematic',
        visualStyleV2 = 'cinematic', // v2.0 visual tone
        setting = 'everyday', // v2.0 setting approach
        stylePreset = 'comedy_meme', // Style preset for VEO aesthetics
        battleMode = false, // VS BATTLE MODE: Epic warriors in themed armor
        bpm = 125,
        targetDurationSeconds = 150,
        vertical = true,
        customBars = [],
        avoidTerms = [],
        characterCount = 3, // How many named characters to include
        enableSunoGeneration = false, // Auto-generate music via Suno API
      } = req.body;

      if (!topic || !message) {
        return res.status(400).json({
          success: false,
          error: 'Topic and message are required',
        });
      }

      const contentPackage = await unityContentGenerator.generateCompletePackage({
        topic,
        message,
        voice,
        energy,
        mood,
        visualStyle,
        visualStyleV2, // v2.0 visual tone
        setting, // v2.0 setting approach
        stylePreset, // Style preset for VEO aesthetics
        battleMode, // VS BATTLE MODE
        bpm,
        targetDurationSeconds,
        vertical,
        customBars,
        avoidTerms,
        characterCount, // How many named characters to include
      });

      // Save package to database
      const savedPackage = await storage.createUnityContentPackage({
        title: topic,
        topic,
        status: enableSunoGeneration ? 'generating_audio' : 'draft',
        packageData: contentPackage as any,
      });
      console.log(`✅ Package saved to database: ${savedPackage.id}`);

      // Auto-generate Suno music if enabled
      let sunoTaskId: string | null = null;
      if (enableSunoGeneration) {
        if (!sunoApi.isConfigured()) {
          console.log('⚠️ Suno API not configured - skipping audio generation');
        } else {
          console.log('🎵 Starting Suno music generation...');

          // Cap lyrics to target ~180s (3 min) song duration
          const {
            lyrics: lyricsForSuno,
            estimatedDuration,
            wasTrimmed,
          } = trimLyricsForDuration(
            contentPackage.lyrics.raw,
            180, // 3 minute max
          );
          if (wasTrimmed) {
            console.log(`   ⚠️ Lyrics trimmed for 180s target (estimated: ${estimatedDuration}s)`);
          }

          // Truncate style tags to max 200 chars for Suno API
          let styleForSuno = contentPackage.sunoStyleTags.fullStyleString;
          if (styleForSuno.length > 200) {
            const truncatedStyle = styleForSuno.substring(0, 200);
            const lastComma = truncatedStyle.lastIndexOf(',');
            styleForSuno = lastComma > 50 ? truncatedStyle.substring(0, lastComma).trim() : truncatedStyle.trim();
          }

          try {
            // Truncate title to 80 chars max (Suno API limit)
            const truncatedTitle = topic.length > 80 ? topic.substring(0, 77) + '...' : topic;

            const sunoResult = await sunoApi.generateSong({
              lyrics: lyricsForSuno,
              style: styleForSuno,
              title: truncatedTitle,
              model: 'V5',
              targetDuration: 180, // 3 minute target
            });

            sunoTaskId = sunoResult.taskId;
            console.log(`   ✅ Suno task started: ${sunoTaskId}`);

            // Update package with Suno task ID
            await storage.updateUnityContentPackage(savedPackage.id, {
              sunoTaskId: sunoResult.taskId,
              sunoStatus: 'generating',
            } as any);

            // Start async Suno polling and processing
            // Pass documentary parameters (battleMode, isHistoricalContent, deepResearch) for music-aware VEO regeneration
            processSunoAsync(
              savedPackage.id,
              sunoResult.taskId,
              contentPackage,
              visualStyle,
              visualStyleV2,
              setting,
              vertical,
              battleMode,
              contentPackage.isHistoricalContent || false,
              contentPackage.deepResearch || null,
            );
          } catch (sunoError: any) {
            console.error('❌ Suno generation failed:', sunoError.message);
            await storage.updateUnityContentPackage(savedPackage.id, {
              status: 'draft',
              sunoStatus: 'failed',
            } as any);
          }
        }
      }

      res.json({
        success: true,
        data: {
          ...contentPackage,
          id: savedPackage.id,
          sunoTaskId,
          sunoStatus: sunoTaskId ? 'generating' : null,
        },
      });
    } catch (error: any) {
      console.error('Error generating content package:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // FULL AUTOMATED PIPELINE: Generate package → Suno → Librosa → Enhanced VEO prompts
  // Set skipSuno=true to generate package only (add your own music later)
  router.post('/unity/generate-full-pipeline', async (req, res) => {
    try {
      const {
        topic,
        message,
        voice = 'observational',
        energy = 'building',
        mood = 'ironic_to_warm',
        visualStyle = 'cinematic',
        visualStyleV2 = 'cinematic',
        setting = 'everyday',
        stylePreset = 'comedy_meme', // Style preset for VEO aesthetics
        battleMode = false, // VS BATTLE MODE: Epic warriors in themed armor
        bpm = 125,
        targetDurationSeconds = 150,
        vertical = true,
        customBars = [],
        avoidTerms = [],
        characterCount = 3,
        autoGenerateVeo = false, // Optional: auto-start VEO generation
        skipSuno = false, // NEW: Skip Suno generation - add your own music later
      } = req.body;

      if (!topic || !message) {
        return res.status(400).json({
          success: false,
          error: 'Topic and message are required',
        });
      }

      console.log('🚀 FULL PIPELINE STARTED');
      console.log(`   🎨 Style Preset: ${stylePreset}`);
      if (battleMode) console.log('   ⚔️ BATTLE MODE: ENABLED');
      console.log('   Step 1: Generating content package...');

      // STEP 1: Generate content package (lyrics, characters, timing, initial VEO prompts)
      const contentPackage = await unityContentGenerator.generateCompletePackage({
        topic,
        message,
        voice,
        energy,
        mood,
        visualStyle,
        visualStyleV2,
        setting,
        stylePreset, // Style preset for VEO aesthetics
        battleMode, // VS BATTLE MODE
        bpm,
        targetDurationSeconds,
        vertical,
        customBars,
        avoidTerms,
        characterCount,
      });

      console.log('   ✅ Package generated:', contentPackage.timing.formattedDuration);

      // STEP 2: Save package first (required for audio attachment)
      console.log('   Step 2: Saving package...');
      const savedPackage = await storage.createUnityContentPackage({
        title: topic, // Use topic as title
        topic,
        status: 'generating',
        packageData: contentPackage as any,
      });
      console.log('   ✅ Package saved:', savedPackage.id);

      // STEP 3: Send to Suno API
      console.log('   Step 3: Sending to Suno API...');

      if (!sunoApi.isConfigured()) {
        // Return early with package if Suno not configured
        console.log('   ⚠️ Suno API not configured - returning package without audio');
        return res.json({
          success: true,
          data: {
            package: savedPackage,
            pipelineStatus: {
              packageGenerated: true,
              sunoGenerated: false,
              sunoError: 'SUNO_API_KEY not configured',
              librosaAnalyzed: false,
              veoPromptsEnhanced: false,
            },
          },
        });
      }

      // Cap lyrics to target ~180s (3 min) song duration
      const {
        lyrics: lyricsForSuno,
        estimatedDuration,
        wasTrimmed,
      } = trimLyricsForDuration(
        contentPackage.lyrics.raw,
        180, // 3 minute max
      );
      if (wasTrimmed) {
        console.log(`   ⚠️ Lyrics trimmed for 180s target (estimated: ${estimatedDuration}s)`);
      }

      // Truncate style tags to max 200 chars for Suno API (they reject "Tags too long")
      let styleForSuno = contentPackage.sunoStyleTags.fullStyleString;
      if (styleForSuno.length > 200) {
        console.log(`   ⚠️ Style tags too long (${styleForSuno.length} chars), truncating to 200`);
        // Take first 200 chars ending at last comma
        const truncatedStyle = styleForSuno.substring(0, 200);
        const lastComma = truncatedStyle.lastIndexOf(',');
        styleForSuno = lastComma > 50 ? truncatedStyle.substring(0, lastComma).trim() : truncatedStyle.trim();
        console.log(`   🎵 Truncated style: ${styleForSuno}`);
      }

      // Truncate title to 80 chars max (Suno API limit)
      const truncatedTitle = topic.length > 80 ? topic.substring(0, 77) + '...' : topic;

      const sunoResult = await sunoApi.generateSong({
        lyrics: lyricsForSuno,
        style: styleForSuno,
        title: truncatedTitle,
        model: 'V5', // Use Suno V5 (latest)
        targetDuration: 180, // 3 minute target
      });

      console.log('   ✅ Suno task started:', sunoResult.taskId);

      // Update package with Suno task ID
      await storage.updateUnityContentPackage(savedPackage.id, {
        sunoTaskId: sunoResult.taskId,
        sunoStatus: 'generating',
      } as any);

      // STEP 4: Poll Suno until complete (max 5 minutes)
      console.log('   Step 4: Polling Suno for completion...');
      const MAX_POLLS = 60;
      const POLL_INTERVAL = 5000;
      let sunoComplete = false;
      let sunoTracks: any[] = [];

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

        const status = await sunoApi.getTaskStatus(sunoResult.taskId);
        console.log(`      Poll ${i + 1}/${MAX_POLLS}: ${status.status}`);

        if (status.status === 'complete') {
          sunoComplete = true;
          sunoTracks = status.tracks;
          break;
        } else if (status.status === 'failed') {
          throw new Error('Suno generation failed');
        }
      }

      if (!sunoComplete) {
        throw new Error('Suno generation timed out after 5 minutes');
      }

      console.log('   ✅ Suno complete:', sunoTracks.length, 'tracks');

      // Log all track durations for debugging
      sunoTracks.forEach((track: any, i: number) => {
        console.log(`      Track ${i}: ${track.duration || 'unknown'}s`);
      });

      // STEP 5: Download LONGEST track (Suno often returns multiple tracks with different lengths)
      console.log('   Step 5: Downloading longest Suno track...');
      // Select the track with the longest duration
      const bestTrack = sunoTracks.reduce((longest: any, track: any) => {
        const trackDuration = track.duration || 0;
        const longestDuration = longest?.duration || 0;
        return trackDuration > longestDuration ? track : longest;
      }, sunoTracks[0]);

      console.log(`   🎵 Selected track with duration: ${bestTrack?.duration || 'unknown'}s`);

      if (!bestTrack?.audioUrl) {
        throw new Error('No audio URL in Suno response');
      }

      const audioResponse = await axios.get(bestTrack.audioUrl, { responseType: 'arraybuffer' });
      const audioFilename = `suno_${savedPackage.id}_${Date.now()}.mp3`;
      const audioPath = join(musicDir, audioFilename);
      fs.writeFileSync(audioPath, audioResponse.data);
      console.log('   ✅ Audio downloaded:', audioFilename);

      // STEP 6: Run Librosa analysis with VEO 8-second sync
      console.log('   Step 6: Running Librosa analysis with VEO sync...');
      let audioAnalysis: any = null;
      let audioTextSummary: string | undefined;
      let audioDuration: number | undefined;

      try {
        const analysisResult = await audioAnalysisService.analyzeAudio(audioPath);
        if (analysisResult.success && analysisResult.analysis) {
          audioAnalysis = analysisResult.analysis;
          audioTextSummary = analysisResult.textSummary;
          audioDuration = analysisResult.analysis.duration;
          console.log(
            `   ✅ Librosa: BPM=${audioAnalysis.bpm}, ${audioAnalysis.sections.length} sections, ${audioAnalysis.beatCount} beats`,
          );

          // Run VEO Audio Sync for 8-second aligned sections
          const veoSyncResult = await veoAudioSyncService.analyzeForVeoSync(audioPath, 180);
          if (veoSyncResult.success && veoSyncResult.sections) {
            console.log(`   ✓ VEO Sync: ${veoSyncResult.sections.length} 8-second aligned sections`);

            // Inject VEO sync sections into audio analysis for prompt generation
            audioAnalysis.veoSyncSections = veoSyncResult.sections;
            audioAnalysis.bpmAlignment = veoSyncResult.bpmAlignment;

            if (veoSyncResult.bpmAlignment?.isAligned) {
              console.log(
                `   ✓ BPM ${audioAnalysis.bpm} is VEO-aligned (${veoSyncResult.bpmAlignment.barsIn8Seconds} bars per 8s)`,
              );
            } else {
              console.log(`   ⚠️ BPM ${audioAnalysis.bpm} NOT aligned - using forced 8s snapping`);
            }
          }
        }
      } catch (error) {
        console.warn('   ⚠️ Librosa analysis failed:', error);
      }

      // STEP 7: Recalculate timing and VEO prompts based on actual audio
      console.log('   Step 7: Recalculating timing for audio...');
      let updatedPackageData = contentPackage as any;

      if (audioDuration) {
        const recalculatedTiming = unityTimingAnalyzer.recalculateTimingForAudioDuration(
          contentPackage.timing,
          audioDuration,
        );

        updatedPackageData = {
          ...contentPackage,
          originalTiming: contentPackage.timing,
          timing: recalculatedTiming,
          audioAnalysis,
          audioTextSummary,
          audioFilePath: `/api/music/${audioFilename}`,
          audioDuration,
        };

        console.log(
          `   ✅ Timing recalculated: ${recalculatedTiming.formattedDuration}, ${recalculatedTiming.totalVeoClips} clips`,
        );
      }

      // STEP 8: Generate enhanced VEO prompts with music-awareness (if librosa succeeded)
      if (audioAnalysis && audioTextSummary) {
        console.log('   Step 8: Generating music-aware VEO prompts...');
        try {
          const enhancedPrompts = await unityContentGenerator.generateMusicAwareVeoPrompts({
            audioAnalysis,
            audioTextSummary,
            lyrics: contentPackage.lyrics as any,
            characterCast: contentPackage.characterCast,
            visualStyle,
            visualStyleV2,
            setting,
            vertical,
            battleMode,
            battleTheme: contentPackage.battleTheme || null,
            isHistoricalContent: contentPackage.isHistoricalContent || false,
            deepResearch: contentPackage.deepResearch || null,
          } as any);

          if (enhancedPrompts && enhancedPrompts.length > 0) {
            updatedPackageData.veoPrompts = enhancedPrompts;
            updatedPackageData.veoPromptsEnhanced = true;
            console.log(`   ✅ Enhanced VEO prompts: ${enhancedPrompts.length} prompts`);
          }
        } catch (error) {
          console.warn('   ⚠️ Enhanced VEO prompt generation failed:', error);
        }
      }

      // Save final updated package
      let finalPackage = await storage.updateUnityContentPackage(savedPackage.id, {
        status: 'audio_ready',
        audioFilePath: `/api/music/${audioFilename}`,
        packageData: updatedPackageData,
      } as any);

      console.log('🎉 FULL PIPELINE COMPLETE!');
      console.log(`   Package ID: ${savedPackage.id}`);
      console.log(`   Duration: ${updatedPackageData.timing?.formattedDuration}`);
      console.log(`   VEO Clips: ${updatedPackageData.timing?.totalVeoClips}`);

      // STEP 9: Auto-generate VEO videos if enabled
      let veoJobId: string | null = null;
      let veoJobStatus: string | null = null;

      if (autoGenerateVeo) {
        console.log('   Step 9: Starting video generation...');

        if (!klingVideoGenerator.isEnabled()) {
          console.log('   ⚠️ Kling video generation disabled - skipping video creation');
          veoJobStatus = 'disabled';
        } else {
          try {
            // Calculate total clips from VEO prompts (5-second Kling clips)
            const veoPrompts = updatedPackageData.veoPrompts || [];
            let totalClips = 0;
            for (const veoPrompt of veoPrompts) {
              const clipsNeeded = veoPrompt.clipCount || Math.ceil((veoPrompt.durationSeconds || 5) / 5);
              totalClips += clipsNeeded;
            }

            const aspectRatio = vertical ? '9:16' : '16:9';
            const costPerClip = klingVideoGenerator.getCostPerClip();
            const estimatedCost = totalClips * costPerClip;

            console.log(`   🎬 Creating VEO job: ${totalClips} clips, ${aspectRatio}, ~$${estimatedCost.toFixed(2)}`);

            // Create background job for VEO generation
            const veoJob = await storage.createJob({
              scriptName: `${topic} - Unity VEO`,
              scriptContent: `Unity content package VEO generation for: ${topic}`,
              mode: 'unity_kling',
              aspectRatio: aspectRatio,
              clipCount: totalClips as any,
              unityMetadata: {
                packageId: savedPackage.id,
                promptCount: veoPrompts.length,
                estimatedCost: estimatedCost,
              },
            } as any);

            veoJobId = veoJob.id;
            veoJobStatus = 'queued';

            // Update package with job reference
            finalPackage = await storage.updateUnityContentPackage(savedPackage.id, {
              status: 'generating',
              packageData: {
                ...updatedPackageData,
                jobId: veoJob.id,
                generationProgress: 0,
                aspectRatio: aspectRatio,
              },
            } as any);

            console.log(`   ✅ VEO job created: ${veoJob.id}`);
          } catch (error: any) {
            console.error('   ❌ VEO job creation failed:', error.message);
            veoJobStatus = 'failed';
          }
        }
      }

      res.json({
        success: true,
        data: {
          package: finalPackage,
          pipelineStatus: {
            packageGenerated: true,
            sunoGenerated: true,
            sunoTrackCount: sunoTracks.length,
            librosaAnalyzed: !!audioAnalysis,
            librosaData: audioAnalysis
              ? {
                  bpm: audioAnalysis.bpm,
                  duration: audioAnalysis.duration,
                  sections: audioAnalysis.sections.length,
                  beats: audioAnalysis.beatCount,
                }
              : null,
            veoPromptsEnhanced: updatedPackageData.veoPromptsEnhanced || false,
            veoClipCount: updatedPackageData.timing?.totalVeoClips,
            veoGeneration: autoGenerateVeo
              ? {
                  jobId: veoJobId,
                  status: veoJobStatus,
                }
              : null,
          },
        },
      });
    } catch (error: any) {
      console.error('❌ Full pipeline error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get video style templates
  router.get('/unity/video-styles', async (req, res) => {
    try {
      const styles = Object.entries(VIDEO_STYLE_TEMPLATES).map(([key, value]) => ({
        id: key,
        ...value,
      }));

      res.json({
        success: true,
        data: {
          styles,
          styleIds: Object.keys(VIDEO_STYLE_TEMPLATES),
        },
      });
    } catch (error: any) {
      console.error('Error getting video styles:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get voice/energy/mood options - v2.0 with visual styles, settings, and vibe presets
  router.get('/unity/content-options', async (req, res) => {
    try {
      res.json({
        success: true,
        data: {
          voices: Object.entries(VOICE_STYLES).map(([key, value]) => ({
            id: key,
            description: value,
          })),
          energies: Object.entries(ENERGY_LEVELS).map(([key, value]) => ({
            id: key,
            description: value,
          })),
          moods: Object.entries(MOOD_ARCS).map(([key, value]) => ({
            id: key,
            description: value,
          })),
          visualStyles: Object.entries(VISUAL_STYLES).map(([key, value]) => ({
            id: key,
            description: value,
          })),
          settings: Object.entries(SETTING_APPROACHES).map(([key, value]) => ({
            id: key,
            description: value,
          })),
          vibePresets: Object.entries(VIBE_PRESETS).map(([key, value]) => ({
            id: key,
            ...value,
          })),
        },
      });
    } catch (error: any) {
      console.error('Error getting content options:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============ AUDIO ANALYSIS ENDPOINTS ============

  // Analyze audio file for music-video sync
  router.post('/unity/analyze-audio', async (req, res) => {
    try {
      const { audioPath } = req.body;

      if (!audioPath) {
        return res.status(400).json({
          success: false,
          error: 'audioPath is required',
        });
      }

      // Security: Only allow files in whitelisted directories
      const allowedPaths = ['attached_assets/music/', 'data/music/', './attached_assets/music/', './data/music/'];
      const isAllowed = allowedPaths.some((allowed) => audioPath.startsWith(allowed));
      if (!isAllowed || audioPath.includes('..')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid audio path - must be in music directory',
        });
      }

      console.log('🎵 Audio analysis request:', audioPath);

      const result = await audioAnalysisService.analyzeAudio(audioPath);

      res.json(result);
    } catch (error: any) {
      console.error('Audio analysis error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Audio analysis failed',
      });
    }
  });


  // Generate music-aware VEO prompts from audio analysis + lyrics
  router.post('/unity/generate-music-aware-prompts', async (req, res) => {
    try {
      const { audioAnalysis, textSummary, lyrics, characterDescriptions, visualStyle } = req.body;

      if (!audioAnalysis || !lyrics) {
        return res.status(400).json({
          success: false,
          error: 'audioAnalysis and lyrics are required',
        });
      }

      console.log('🎬 Generating music-aware VEO prompts...');

      const result = await audioAnalysisService.generateMusicAwarePrompts(
        audioAnalysis,
        textSummary || '',
        lyrics,
        characterDescriptions || '',
        visualStyle || 'cinematic',
      );

      res.json(result);
    } catch (error: any) {
      console.error('Music-aware prompt generation error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Prompt generation failed',
      });
    }
  });


  // Detect beat drop in audio for hook optimization
  router.post('/unity/detect-beat-drop', async (req, res) => {
    try {
      const { audioPath } = req.body;

      if (!audioPath) {
        return res.status(400).json({
          success: false,
          error: 'audioPath is required',
        });
      }

      // Security: Only allow files in whitelisted directories
      const allowedPaths = ['attached_assets/music/', 'data/music/', './attached_assets/music/', './data/music/'];
      const isAllowed = allowedPaths.some((allowed) => audioPath.startsWith(allowed));
      if (!isAllowed || audioPath.includes('..')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid audio path - must be in music directory',
        });
      }

      console.log('🎯 Beat drop detection request:', audioPath);

      const result = await audioAnalysisService.detectBeatDrop(audioPath);

      res.json(result);
    } catch (error: any) {
      console.error('Beat drop detection error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Beat drop detection failed',
      });
    }
  });


  // Trim audio to beat drop for hook optimization
  router.post('/unity/trim-to-hook', async (req, res) => {
    try {
      const { audioPath, outputPath } = req.body;

      if (!audioPath) {
        return res.status(400).json({
          success: false,
          error: 'audioPath is required',
        });
      }

      // Security: Only allow files in whitelisted directories
      const allowedPaths = ['attached_assets/music/', 'data/music/', './attached_assets/music/', './data/music/'];
      const isAllowed = allowedPaths.some((allowed) => audioPath.startsWith(allowed));
      if (!isAllowed || audioPath.includes('..')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid audio path - must be in music directory',
        });
      }

      console.log('✂️ Trim to hook request:', audioPath);

      const result = await audioAnalysisService.trimToBeatDrop(audioPath, outputPath);

      res.json(result);
    } catch (error: any) {
      console.error('Trim to hook error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Trim to hook failed',
      });
    }
  });


  // Smart trim: analyze audio for optimal intro/outro cuts
  router.post('/unity/smart-trim-analyze', async (req, res) => {
    try {
      const { audioPath, platform = 'youtube_shorts' } = req.body;

      if (!audioPath) {
        return res.status(400).json({
          success: false,
          error: 'audioPath is required',
        });
      }

      // Validate platform
      if (!(platform in PLATFORM_LIMITS)) {
        return res.status(400).json({
          success: false,
          error: `Invalid platform. Must be one of: ${Object.keys(PLATFORM_LIMITS).join(', ')}`,
        });
      }

      // Security: Only allow files in whitelisted directories
      const allowedPaths = ['attached_assets/music/', 'data/music/', './attached_assets/music/', './data/music/'];
      const isAllowed = allowedPaths.some((allowed) => audioPath.startsWith(allowed));
      if (!isAllowed || audioPath.includes('..')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid audio path - must be in music directory',
        });
      }

      console.log(`✂️ Smart trim analyze: ${audioPath} (${platform})`);

      const result = await smartAudioTrimmerService.calculateSmartTrim(audioPath, platform as TrimPlatform);

      res.json(result);
    } catch (error: any) {
      console.error('Smart trim analyze error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Smart trim analysis failed',
      });
    }
  });


  // Smart trim: execute audio trimming with fade-in/fade-out
  router.post('/unity/smart-trim-execute', async (req, res) => {
    try {
      const { audioPath, platform = 'youtube_shorts' } = req.body;

      if (!audioPath) {
        return res.status(400).json({
          success: false,
          error: 'audioPath is required',
        });
      }

      // Validate platform
      if (!(platform in PLATFORM_LIMITS)) {
        return res.status(400).json({
          success: false,
          error: `Invalid platform. Must be one of: ${Object.keys(PLATFORM_LIMITS).join(', ')}`,
        });
      }

      // Security: Only allow files in whitelisted directories
      const allowedPaths = ['attached_assets/music/', 'data/music/', './attached_assets/music/', './data/music/'];
      const isAllowed = allowedPaths.some((allowed) => audioPath.startsWith(allowed));
      if (!isAllowed || audioPath.includes('..')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid audio path - must be in music directory',
        });
      }

      console.log(`✂️ Smart trim execute: ${audioPath} (${platform})`);

      const result = await smartAudioTrimmerService.executeSmartTrim(audioPath, platform as TrimPlatform);

      res.json(result);
    } catch (error: any) {
      console.error('Smart trim execute error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Smart trim execution failed',
      });
    }
  });


  // Get available platforms for smart trimming
  router.get('/unity/smart-trim-platforms', async (_req, res) => {
    res.json({
      success: true,
      platforms: Object.entries(PLATFORM_LIMITS).map(([key, limit]) => ({
        id: key,
        maxDuration: limit,
        label: key.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      })),
    });
  });


  // Full pipeline: analyze audio and generate prompts in one call
  router.post('/unity/analyze-and-generate', async (req, res) => {
    try {
      const { audioPath, lyrics, characterDescriptions, visualStyle } = req.body;

      if (!audioPath || !lyrics) {
        return res.status(400).json({
          success: false,
          error: 'audioPath and lyrics are required',
        });
      }

      // Security: Only allow files in whitelisted directories
      const allowedPaths = ['attached_assets/music/', 'data/music/', './attached_assets/music/', './data/music/'];
      const isAllowed = allowedPaths.some((allowed) => audioPath.startsWith(allowed));
      if (!isAllowed || audioPath.includes('..')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid audio path - must be in music directory',
        });
      }

      console.log('🎵🎬 Full audio analysis + prompt generation pipeline...');

      const result = await audioAnalysisService.analyzeAndGeneratePrompts(
        audioPath,
        lyrics,
        characterDescriptions || '',
        visualStyle || 'cinematic',
      );

      res.json(result);
    } catch (error: any) {
      console.error('Full pipeline error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Pipeline failed',
      });
    }
  });


  // ============ UNITY CONTENT PACKAGES (Saved Packages) ENDPOINTS ============

  // List all saved content packages
  router.get('/unity/packages', async (req, res) => {
    try {
      const packages = await storage.listUnityContentPackages();
      res.json({ success: true, data: packages });
    } catch (error: any) {
      console.error('Error listing content packages:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get single content package
  router.get('/unity/packages/:id', async (req, res) => {
    try {
      const pkg = await storage.getUnityContentPackage(req.params.id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }
      res.json({ success: true, data: pkg });
    } catch (error: any) {
      console.error('Error getting content package:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Save a new content package
  router.post('/unity/packages', async (req, res) => {
    try {
      const { title, topic, packageData, audioFileName, audioFileSize, status } = req.body;

      if (!title || !topic || !packageData) {
        return res.status(400).json({
          success: false,
          error: 'Title, topic, and packageData are required',
        });
      }

      const pkg = await storage.createUnityContentPackage({
        title,
        topic,
        packageData,
        audioFileName: audioFileName || null,
        audioFileSize: audioFileSize || null,
        status: status || 'draft',
      });

      console.log(`✅ Unity content package saved: ${title}`);
      res.json({ success: true, data: pkg });
    } catch (error: any) {
      console.error('Error saving content package:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Update content package
  router.patch('/unity/packages/:id', async (req, res) => {
    try {
      const pkg = await storage.updateUnityContentPackage(req.params.id, req.body);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }
      res.json({ success: true, data: pkg });
    } catch (error: any) {
      console.error('Error updating content package:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Delete content package
  router.delete('/unity/packages/:id', async (req, res) => {
    try {
      await storage.deleteUnityContentPackage(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting content package:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Upload audio for a unity content package
  router.post('/unity/packages/:id/audio', uploadMusic.single('audio'), async (req, res) => {
    try {
      const { id } = req.params;

      // Check if package exists
      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No audio file uploaded' });
      }

      const audioFilePath = `/api/music/${req.file.filename}`;
      const fullFilePath = join(musicDir, req.file.filename);

      // Detect audio duration with ffprobe
      let audioDuration: number | undefined;
      try {
        const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fullFilePath}"`;
        const { stdout } = await execAsync(ffprobeCmd);
        audioDuration = parseFloat(stdout.trim());
        if (isNaN(audioDuration) || audioDuration <= 0) {
          audioDuration = undefined;
        }
        console.log(`🎵 Detected audio duration: ${audioDuration?.toFixed(1)}s`);
      } catch (error) {
        console.warn('Could not detect audio duration:', error);
      }

      // Run librosa audio analysis for rich music data
      // Pass lyrics if available for FORCED ALIGNMENT (exact word timing for karaoke)
      let audioAnalysis: any = null;
      let audioTextSummary: string | undefined;
      const packageLyrics = (pkg.packageData as any)?.lyrics?.raw || '';
      try {
        console.log(`🎵 Running librosa analysis on ${fullFilePath}...`);
        if (packageLyrics) {
          console.log(`   📝 Lyrics available for forced alignment (${packageLyrics.length} chars)`);
        }
        const analysisResult = await audioAnalysisService.analyzeAudio(fullFilePath, packageLyrics || undefined);
        if (analysisResult.success && analysisResult.analysis) {
          audioAnalysis = analysisResult.analysis;
          audioTextSummary = analysisResult.textSummary;
          // Use librosa's duration if ffprobe failed
          if (!audioDuration && analysisResult.analysis.duration) {
            audioDuration = analysisResult.analysis.duration;
          }
          console.log(
            `✅ Librosa analysis complete: BPM=${audioAnalysis.bpm}, ${audioAnalysis.sections.length} sections, ${audioAnalysis.beatCount} beats`,
          );

          // Log forced alignment status for karaoke
          if (audioAnalysis.forcedAlignment?.length > 0) {
            console.log(`   🎯 FORCED ALIGNMENT: ${audioAnalysis.forcedAlignment.length} words with EXACT timing`);
          }
        }
      } catch (error) {
        console.warn('Librosa analysis failed (continuing without it):', error);
      }

      // Recalculate timing and VEO prompts based on actual audio duration
      let updatedPackageData = pkg.packageData;
      if (audioDuration && pkg.packageData?.timing) {
        try {
          // Recalculate timing to match actual audio
          // Use originalTiming if available, otherwise use current timing
          const baselineTiming = pkg.packageData.originalTiming || pkg.packageData.timing;
          const recalculatedTiming = unityTimingAnalyzer.recalculateTimingForAudioDuration(
            baselineTiming,
            audioDuration,
          );

          // Update VEO prompts with new section durations
          // Match by section name since VEO prompts have multiple clips per section
          const sections = recalculatedTiming.sections || recalculatedTiming.sectionsBreakdown || [];
          const sectionMap = new Map<string, any>();
          let runningTime = 0;
          for (const section of sections) {
            const sectionName = section.section || section.name || '';
            sectionMap.set(sectionName, {
              ...section,
              startTime: runningTime,
              endTime: runningTime + (section.estimatedDurationSeconds || section.durationSeconds || 10),
            });
            runningTime += section.estimatedDurationSeconds || section.durationSeconds || 10;
          }

          // Group existing prompts by section
          const promptsBySection = new Map<string, any[]>();
          for (const prompt of pkg.packageData.veoPrompts || []) {
            const sectionPrompts = promptsBySection.get(prompt.section) || [];
            sectionPrompts.push(prompt);
            promptsBySection.set(prompt.section, sectionPrompts);
          }

          // Build updated prompts with extra clips where needed
          const updatedVeoPrompts: any[] = [];
          let globalClipNumber = 1;

          for (const section of sections) {
            const sectionName = section.section || section.name || '';
            const existingPrompts = promptsBySection.get(sectionName) || [];
            const neededClips = section.clipCount || section.veoClipsNeeded || 1;
            const sectionDuration = section.estimatedDurationSeconds || section.durationSeconds || 10;
            const sectionInfo = sectionMap.get(sectionName);

            for (let i = 0; i < neededClips; i++) {
              // Use existing prompt if available, otherwise duplicate the last one
              const basePrompt = existingPrompts[i] || existingPrompts[existingPrompts.length - 1];
              if (basePrompt) {
                updatedVeoPrompts.push({
                  ...basePrompt,
                  clipNumber: globalClipNumber,
                  duration: 8,
                  sectionDuration: sectionDuration,
                  timing: {
                    sectionStartTime: sectionInfo?.startTime || 0,
                    sectionEndTime: sectionInfo?.endTime || sectionDuration,
                    sectionClipCount: neededClips,
                    clipIndex: i,
                  },
                });
                globalClipNumber++;
              }
            }
          }

          console.log(`   VEO prompts: ${pkg.packageData.veoPrompts?.length || 0} → ${updatedVeoPrompts.length}`);

          // Store originalTiming if this is the first recalculation
          const originalTimingToStore = pkg.packageData?.originalTiming || pkg.packageData?.timing;

          updatedPackageData = {
            ...pkg.packageData,
            originalTiming: originalTimingToStore, // Preserve original lyrics-based timing
            timing: recalculatedTiming,
            veoPrompts: updatedVeoPrompts,
            audioInfo: {
              fileName: req.file.originalname,
              durationSeconds: audioDuration,
              formattedDuration: unityTimingAnalyzer.formatDuration(audioDuration),
            },
            // Store librosa analysis for music-aware features
            audioAnalysis: audioAnalysis
              ? {
                  bpm: audioAnalysis.bpm,
                  beatCount: audioAnalysis.beatCount,
                  beats: audioAnalysis.beats, // Full beat timestamps for karaoke sync
                  sections: audioAnalysis.sections,
                  peaks: audioAnalysis.peaks?.slice(0, 10), // Top 10 energy peaks
                  dips: audioAnalysis.dips?.slice(0, 5), // Top 5 energy dips
                  averageEnergy: audioAnalysis.averageEnergy,
                  energyRange: audioAnalysis.energyRange,
                }
              : undefined,
            audioTextSummary: audioTextSummary,
          };

          console.log(`✅ Timing recalculated for ${audioDuration.toFixed(1)}s audio:`);
          console.log(
            `   Original: ${baselineTiming.formattedDuration} → Actual: ${recalculatedTiming.formattedDuration}`,
          );
          console.log(
            `   VEO clips: ${recalculatedTiming.totalVeoClips}, Est. cost: $${recalculatedTiming.estimatedVeoCost}`,
          );
        } catch (error) {
          console.error('Error recalculating timing:', error);
          // Continue without recalculation
        }
      }

      // Update the package with audio info and recalculated data
      const updatedPkg = await storage.updateUnityContentPackage(id, {
        audioFileName: req.file.originalname,
        audioFileSize: req.file.size,
        audioFilePath: audioFilePath,
        packageData: updatedPackageData,
        status: 'audio_ready',
      });

      console.log(`✅ Audio uploaded for package ${id}: ${req.file.originalname}`);
      res.json({
        success: true,
        data: {
          audioFileName: req.file.originalname,
          audioFileSize: req.file.size,
          audioFilePath: audioFilePath,
          audioDuration: audioDuration,
          timing: updatedPackageData?.timing,
          audioAnalysis: updatedPackageData?.audioAnalysis,
          audioTextSummary: updatedPackageData?.audioTextSummary,
        },
      });
    } catch (error: any) {
      console.error('Error uploading audio for package:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Transcribe Unity package audio with Whisper for word-level timestamps (for karaoke)
  router.post('/unity/packages/:id/transcribe', async (req, res) => {
    try {
      const { id } = req.params;
      const { alignWithLyrics = true } = req.body;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      if (!pkg.audioFilePath) {
        return res.status(400).json({ success: false, error: 'No audio file uploaded yet' });
      }

      // Get the actual file path from the API path (handles both music and suno audio)
      const audioApiPath = pkg.audioFilePath;
      let fullFilePath: string;

      if (audioApiPath.startsWith('/attached_assets/')) {
        // Suno audio stored in attached_assets folder
        fullFilePath = join(process.cwd(), audioApiPath.substring(1)); // Remove leading /
      } else if (audioApiPath.startsWith('/music/')) {
        // Music uploaded via music endpoint
        const filename = audioApiPath.replace('/music/', '');
        fullFilePath = join(musicDir, filename);
      } else {
        // Fallback: treat as relative path from cwd
        fullFilePath = join(process.cwd(), audioApiPath);
      }

      console.log(`🎤 Transcribing Unity package ${id} audio with Whisper...`);

      // Step 1: Transcribe with Whisper for word-level timestamps
      const transcription = await openaiService.transcribeAudioWithTimestamps(fullFilePath);
      console.log(`   ✅ Transcribed ${transcription.words.length} words`);

      // Step 2: Align with lyrics if requested and lyrics are available
      let words = transcription.words;
      const lyricsData = pkg.packageData?.lyrics;
      // Handle lyrics as object (with .raw property) or string
      const lyricsText = typeof lyricsData === 'string' ? lyricsData : lyricsData?.raw || lyricsData?.formatted || '';

      if (alignWithLyrics && lyricsText && transcription.words.length > 0) {
        words = openaiService.alignLyricsWithTranscription(lyricsText, transcription);
        console.log(`   ✅ Aligned ${words.length} words with package lyrics`);
      }

      // Store word timestamps in package data
      const updatedPackageData = {
        ...pkg.packageData,
        whisperTranscription: {
          text: transcription.text,
          words: words,
          wordCount: words.length,
          duration: transcription.duration,
          alignedWithLyrics: alignWithLyrics && !!lyricsText,
        },
      };

      // Update the package
      await storage.updateUnityContentPackage(id, {
        packageData: updatedPackageData,
      });

      console.log(`✅ Whisper transcription stored for package ${id}`);

      res.json({
        success: true,
        data: {
          text: transcription.text,
          wordCount: words.length,
          duration: transcription.duration,
          alignedWithLyrics: alignWithLyrics && !!lyricsText,
          sampleWords: words.slice(0, 10), // First 10 words as preview
        },
      });
    } catch (error: any) {
      console.error('Error transcribing Unity package audio:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Re-analyze audio (force fresh Librosa analysis with ALL onsets for karaoke sync)
  router.post('/unity/packages/:id/reanalyze-audio', async (req, res) => {
    try {
      const { id } = req.params;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      // Validate audio is uploaded
      if (!pkg.audioFilePath) {
        return res.status(400).json({
          success: false,
          error: 'No audio file uploaded. Upload audio first.',
        });
      }

      // Build full audio path - handle various path formats
      let fullFilePath = pkg.audioFilePath;

      // Remove leading slash if present
      if (fullFilePath.startsWith('/')) {
        fullFilePath = fullFilePath.substring(1);
      }

      // Try multiple path locations
      const possiblePaths = [
        join(process.cwd(), fullFilePath), // Direct path from workspace
        join(process.cwd(), 'data', fullFilePath), // In data directory
        join(process.cwd(), fullFilePath.replace('attached_assets/', 'data/')), // Legacy path
      ];

      let resolvedPath = '';
      for (const path of possiblePaths) {
        if (existsSync(path)) {
          resolvedPath = path;
          break;
        }
      }

      if (!resolvedPath) {
        return res.status(404).json({
          success: false,
          error: `Audio file not found: ${pkg.audioFilePath}. Tried: ${possiblePaths.join(', ')}`,
        });
      }

      fullFilePath = resolvedPath;

      console.log(`🔄 Re-analyzing audio for package ${id}...`);
      console.log(`   Audio file: ${pkg.audioFilePath}`);

      // Clear audio analysis cache for this file
      const cacheDir = TempPaths.audioCache();
      try {
        const cacheFiles = readdirSync(cacheDir).filter((f) => f.endsWith('.json'));
        console.log(`   🗑️ Clearing ${cacheFiles.length} cached analysis files...`);
        for (const file of cacheFiles) {
          unlinkSync(join(cacheDir, file));
        }
      } catch (e) {
        console.log(`   ℹ️ Cache already empty or not accessible`);
      }

      // Get lyrics from package for forced alignment + Whisper offset calculation
      const packageLyrics = pkg.packageData?.lyrics?.raw || '';
      console.log(`   📝 Lyrics available: ${packageLyrics ? 'Yes' : 'No'} (${packageLyrics.length} chars)`);

      // Run fresh Librosa analysis with lyrics for forced alignment
      const analysisResult = await audioAnalysisService.analyzeAudio(fullFilePath, packageLyrics || undefined);

      if (!analysisResult.success || !analysisResult.analysis) {
        return res.status(500).json({
          success: false,
          error: analysisResult.error || 'Audio analysis failed',
        });
      }

      const analysis = analysisResult.analysis;
      const onsetsCount = (analysis as any).strongOnsets?.length || 0;

      console.log(`   ✅ Fresh analysis complete:`);
      console.log(`      BPM: ${analysis.bpm}`);
      console.log(`      Duration: ${analysis.duration?.toFixed(2)}s`);
      console.log(`      Beats: ${analysis.beats?.length || 0}`);
      console.log(`      Onsets: ${onsetsCount} (for karaoke word sync)`);
      console.log(`      Sections: ${analysis.sections?.length || 0}`);

      // Update package with fresh audio analysis
      const updatedPackageData = {
        ...pkg.packageData,
        audioAnalysis: analysis,
        librosaAnalysis: analysis,
      };

      await storage.updateUnityContentPackage(id, {
        packageData: updatedPackageData,
      });

      console.log(`✅ Package ${id} updated with fresh audio analysis`);

      res.json({
        success: true,
        data: {
          bpm: analysis.bpm,
          duration: analysis.duration,
          beats: analysis.beats?.length || 0,
          onsets: onsetsCount,
          sections: analysis.sections?.length || 0,
          message: `Fresh audio analysis complete. ${onsetsCount} onsets available for karaoke word sync.`,
        },
      });
    } catch (error: any) {
      console.error('Error re-analyzing audio:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate karaoke subtitles for Unity package
  router.post('/unity/packages/:id/generate-karaoke', async (req, res) => {
    try {
      const { id } = req.params;
      const { style = 'bounce', videoWidth = 1080, videoHeight = 1920 } = req.body;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      // Validate audio is uploaded
      if (!pkg.audioFilePath) {
        return res.status(400).json({
          success: false,
          error: 'No audio file uploaded. Upload audio first before generating karaoke.',
        });
      }

      // Validate Whisper transcription exists
      if (!pkg.packageData?.whisperTranscription?.words) {
        return res.status(400).json({
          success: false,
          error: 'No Whisper transcription found. Run /transcribe first to get word timestamps.',
        });
      }

      const words = pkg.packageData.whisperTranscription.words;

      // Validate words have proper timestamps
      const validWords = words.filter(
        (w: any) => typeof w.start === 'number' && typeof w.end === 'number' && typeof w.word === 'string',
      );

      if (validWords.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Word timestamps are invalid. Re-run transcription to get proper timestamps.',
        });
      }

      if (validWords.length < words.length) {
        console.warn(`   ⚠️ ${words.length - validWords.length} words had invalid timestamps and were filtered`);
      }

      // Get beats (optional, will log if missing)
      const beats = pkg.packageData.audioAnalysis?.beats || [];
      if (beats.length === 0) {
        console.log(`   ℹ️ No beat timestamps available - karaoke will not have beat-sync pulse effects`);
      }

      // Get onsets for onset-driven mode (audio event timing)
      // PREFER vocalOnsets from Demucs (isolated vocals) if available
      const vocalOnsets = (pkg.packageData.audioAnalysis as any)?.vocalOnsets || [];
      const strongOnsets = (pkg.packageData.audioAnalysis as any)?.strongOnsets || [];

      // Use vocal onsets if available, otherwise fall back to strong onsets
      const onsets = vocalOnsets.length > 0 ? vocalOnsets : strongOnsets;
      const onsetSource = vocalOnsets.length > 0 ? 'VOCAL (Demucs)' : 'FULL-MIX';

      // Get lyrics and audio duration for proper word mapping
      const originalLyrics = pkg.packageData.lyrics?.raw || '';
      const audioDuration = pkg.packageData.audioAnalysis?.duration || 130;

      // Get forced alignment data (PRIORITY for exact word timing)
      // The forced alignment timestamps need the vocal start offset applied
      let forcedAlignmentWithOffset: Array<{ word: string; start: number; end: number }> | undefined;
      const rawForcedAlignment = (pkg.packageData.audioAnalysis as any)?.forcedAlignment;
      const vocalStartOffset = (pkg.packageData.audioAnalysis as any)?.vocalStartOffset || 0;

      if (rawForcedAlignment && Array.isArray(rawForcedAlignment) && rawForcedAlignment.length > 0) {
        // Apply the vocal start offset to all forced alignment timestamps
        // This shifts the timestamps from relative-to-vocals to absolute song time
        forcedAlignmentWithOffset = rawForcedAlignment.map((w: any) => ({
          word: w.word,
          start: w.start + vocalStartOffset,
          end: w.end + vocalStartOffset,
        }));
        console.log(
          `   🎯 Forced alignment: ${forcedAlignmentWithOffset.length} words with ${vocalStartOffset.toFixed(2)}s offset applied`,
        );
        if (forcedAlignmentWithOffset.length > 0) {
          console.log(
            `   🕐 First word "${forcedAlignmentWithOffset[0].word}" now at ${forcedAlignmentWithOffset[0].start.toFixed(2)}s`,
          );
        }
      } else {
        console.log(`   ⚠️ No forced alignment available - using Whisper/onset fallback`);
      }

      console.log(`🎤 Generating karaoke subtitles for package ${id}...`);
      console.log(
        `   ${validWords.length} valid words, ${beats.length} beats, ${onsets.length} ${onsetSource} onsets, style: ${style}`,
      );

      // Generate subtitle file
      const timestamp = Date.now();
      const subtitlePath = join(TempPaths.processing(), `karaoke_${id}_${timestamp}.ass`);

      await ffmpegProcessor.generateKaraokeSubtitles(
        validWords,
        subtitlePath,
        style as 'bounce' | 'glow' | 'fire' | 'neon' | 'minimal',
        videoWidth,
        videoHeight,
        2,
        beats,
        originalLyrics, // Pass lyrics for proper text matching
        audioDuration, // Pass audio duration for timestamp scaling
        onsets, // Pass onsets for onset-driven mode
        forcedAlignmentWithOffset, // Pass forced alignment with vocal offset applied!
      );

      // Store subtitle path in package
      const updatedPackageData = {
        ...pkg.packageData,
        karaokeSubtitles: {
          path: subtitlePath,
          style,
          wordCount: validWords.length,
          beatSyncEnabled: beats.length > 0,
        },
      };

      await storage.updateUnityContentPackage(id, {
        packageData: updatedPackageData,
      });

      console.log(`✅ Karaoke subtitles generated for package ${id}`);

      res.json({
        success: true,
        data: {
          subtitlePath,
          style,
          wordCount: validWords.length,
          beatSyncEnabled: beats.length > 0,
          beatCount: beats.length,
        },
      });
    } catch (error: any) {
      console.error('Error generating karaoke for Unity package:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // REGENERATE SUNO: Re-trigger Suno generation for an existing package
  router.post('/unity/packages/:id/regenerate-suno', async (req, res) => {
    try {
      const { id } = req.params;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      if (!sunoApi.isConfigured()) {
        return res.status(400).json({ success: false, error: 'SUNO_API_KEY not configured' });
      }

      const packageData = pkg.packageData as any;
      if (!packageData?.lyrics?.raw) {
        return res.status(400).json({ success: false, error: 'Package has no lyrics' });
      }

      console.log(`🎵 Regenerating Suno for package: ${id}`);
      console.log(`   Title: ${pkg.title}`);

      // Cap lyrics to target ~180s (3 min) song duration
      const {
        lyrics: lyricsForSuno,
        estimatedDuration,
        wasTrimmed,
      } = trimLyricsForDuration(
        packageData.lyrics.raw,
        180, // 3 minute max
      );
      if (wasTrimmed) {
        console.log(`   ⚠️ Lyrics trimmed for 180s target (estimated: ${estimatedDuration}s)`);
      }

      // Get style from package or use epic battle rap preset
      let styleForSuno =
        packageData.sunoStyleTags?.fullStyleString || 'Hip-hop, observational rap, comedic storytelling, 95 BPM';
      if (styleForSuno.length > 200) {
        const truncatedStyle = styleForSuno.substring(0, 200);
        const lastComma = truncatedStyle.lastIndexOf(',');
        styleForSuno = lastComma > 50 ? truncatedStyle.substring(0, lastComma).trim() : truncatedStyle.trim();
      }

      // Generate new Suno song
      // Truncate title to 80 chars max (Suno API limit)
      const rawTitle = pkg.title || pkg.topic || 'Unity Battle';
      const truncatedTitle = rawTitle.length > 80 ? rawTitle.substring(0, 77) + '...' : rawTitle;

      const sunoResult = await sunoApi.generateSong({
        lyrics: lyricsForSuno,
        style: styleForSuno,
        title: truncatedTitle,
        model: 'V5',
        targetDuration: 180, // 3 minute target
      });

      console.log(`   ✅ Suno task started: ${sunoResult.taskId}`);

      // Update package with new Suno task ID
      await storage.updateUnityContentPackage(id, {
        sunoTaskId: sunoResult.taskId,
        sunoStatus: 'generating',
      } as any);

      res.json({
        success: true,
        data: {
          taskId: sunoResult.taskId,
          message: 'Suno generation started. Poll /api/suno/status?taskId=... then download when complete.',
        },
      });
    } catch (error: any) {
      console.error('Error regenerating Suno:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // GENERATE SUNO: Alias for regenerate-suno (same functionality)
  router.post('/unity/packages/:id/generate-suno', async (req, res) => {
    try {
      const { id } = req.params;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      if (!sunoApi.isConfigured()) {
        return res.status(400).json({ success: false, error: 'SUNO_API_KEY not configured' });
      }

      const packageData = pkg.packageData as any;
      if (!packageData?.lyrics?.raw) {
        return res.status(400).json({ success: false, error: 'Package has no lyrics' });
      }

      console.log(`🎵 Generating Suno for package: ${id}`);
      console.log(`   Title: ${pkg.title}`);

      // Cap lyrics to target ~180s (3 min) song duration
      const {
        lyrics: lyricsForSuno,
        estimatedDuration,
        wasTrimmed,
      } = trimLyricsForDuration(
        packageData.lyrics.raw,
        180, // 3 minute max
      );
      if (wasTrimmed) {
        console.log(`   ⚠️ Lyrics trimmed for 180s target (estimated: ${estimatedDuration}s)`);
      }

      // Get style from package or use epic battle rap preset
      let styleForSuno =
        packageData.sunoStyleTags?.fullStyleString || 'Hip-hop, observational rap, comedic storytelling, 95 BPM';
      if (styleForSuno.length > 200) {
        const truncatedStyle = styleForSuno.substring(0, 200);
        const lastComma = truncatedStyle.lastIndexOf(',');
        styleForSuno = lastComma > 50 ? truncatedStyle.substring(0, lastComma).trim() : truncatedStyle.trim();
      }

      // Generate new Suno song
      // Truncate title to 80 chars max (Suno API limit)
      const rawTitle = pkg.title || pkg.topic || 'Unity Battle';
      const truncatedTitle = rawTitle.length > 80 ? rawTitle.substring(0, 77) + '...' : rawTitle;

      const sunoResult = await sunoApi.generateSong({
        lyrics: lyricsForSuno,
        style: styleForSuno,
        title: truncatedTitle,
        model: 'V5',
        targetDuration: 180, // 3 minute target
      });

      console.log(`   ✅ Suno task started: ${sunoResult.taskId}`);

      // Update package with new Suno task ID
      await storage.updateUnityContentPackage(id, {
        sunoTaskId: sunoResult.taskId,
        sunoStatus: 'generating',
      } as any);

      res.json({
        success: true,
        data: {
          taskId: sunoResult.taskId,
          message: 'Suno generation started. Poll /api/unity/packages/:id/suno-status for completion.',
        },
      });
    } catch (error: any) {
      console.error('Error generating Suno:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // SUNO STATUS: Check Suno generation status for a package
  router.get('/unity/packages/:id/suno-status', async (req, res) => {
    try {
      const { id } = req.params;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      // If already has audio, return complete
      if (pkg.audioFilePath) {
        return res.json({
          success: true,
          data: {
            status: 'complete',
            audioFilePath: pkg.audioFilePath,
            audioFileName: pkg.audioFileName,
          },
        });
      }

      const sunoTaskId = (pkg as any).sunoTaskId;
      if (!sunoTaskId) {
        return res.json({
          success: true,
          data: {
            status: 'not_started',
            message: 'No Suno generation in progress',
          },
        });
      }

      // Check status with Suno API
      const statusResult = await sunoApi.getTaskStatus(sunoTaskId);

      if (statusResult.status === 'complete' && statusResult.tracks.length > 0) {
        // Get the first track's audio URL
        const track = statusResult.tracks[0];
        const audioUrl = track.audioUrl || track.sourceAudioUrl || track.streamAudioUrl;

        if (audioUrl) {
          // Download and save the audio
          console.log(`🎵 Suno complete for package ${id}, downloading audio...`);

          const fileName = `suno_${id}_${Date.now()}.mp3`;
          const outputPath = join(musicDir, fileName);

          await sunoApi.downloadAudio(audioUrl, outputPath);

          // Update package with audio file
          await storage.updateUnityContentPackage(id, {
            audioFilePath: `/api/music/${fileName}`,
            audioFileName: fileName,
            sunoStatus: 'complete',
            status: 'audio_ready',
          } as any);

          // Trigger Librosa analysis
          try {
            const analysisResult = await audioAnalysisService.analyzeAudio(outputPath);

            if (analysisResult.success && analysisResult.analysis) {
              const packageData = pkg.packageData as any;
              await storage.updateUnityContentPackage(id, {
                packageData: {
                  ...packageData,
                  audioAnalysis: analysisResult.analysis,
                  audioTextSummary: analysisResult.textSummary,
                },
              });
              console.log(`   ✅ Librosa analysis complete for Suno audio`);
            }
          } catch (analysisError) {
            console.error('Librosa analysis failed:', analysisError);
          }

          return res.json({
            success: true,
            data: {
              status: 'complete',
              audioFilePath: `/api/music/${fileName}`,
              audioFileName: fileName,
            },
          });
        }
      } else if (statusResult.status === 'failed') {
        await storage.updateUnityContentPackage(id, {
          sunoStatus: 'failed',
        } as any);

        return res.json({
          success: true,
          data: {
            status: 'failed',
            error: 'Suno generation failed',
          },
        });
      }

      // Still processing
      res.json({
        success: true,
        data: {
          status: 'processing',
          taskId: sunoTaskId,
          message: 'Suno is still generating...',
        },
      });
    } catch (error: any) {
      console.error('Error checking Suno status:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Recalculate timing for existing audio
  router.post('/unity/packages/:id/recalculate', async (req, res) => {
    try {
      const { id } = req.params;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      if (!pkg.audioFilePath) {
        return res.status(400).json({ success: false, error: 'No audio file uploaded yet' });
      }

      // Get the actual file path from the API path (handles both music and suno audio)
      const audioApiPath = pkg.audioFilePath;
      let fullFilePath: string;

      if (audioApiPath.startsWith('/attached_assets/')) {
        // Suno audio stored in attached_assets folder
        fullFilePath = join(process.cwd(), audioApiPath.substring(1)); // Remove leading /
      } else if (audioApiPath.startsWith('/music/')) {
        // Music uploaded via music endpoint
        const filename = audioApiPath.replace('/music/', '');
        fullFilePath = join(musicDir, filename);
      } else {
        // Fallback: treat as relative path from cwd
        fullFilePath = join(process.cwd(), audioApiPath);
      }

      // Run Librosa analysis (required for VEO generation)
      let audioDuration: number | undefined;
      let librosaAnalysis: any = null;
      let audioTextSummary: string = '';

      try {
        console.log(`🎵 Running Librosa analysis on ${fullFilePath}...`);
        const analysisResult = await audioAnalysisService.analyzeAudio(fullFilePath);

        if (analysisResult.success && analysisResult.analysis) {
          librosaAnalysis = analysisResult.analysis;
          audioTextSummary = analysisResult.textSummary || '';
          audioDuration = analysisResult.analysis.duration;
          console.log(
            `   ✅ Librosa: BPM=${librosaAnalysis.bpm}, ${librosaAnalysis.sections?.length || 0} sections, ${librosaAnalysis.beatCount || 0} beats`,
          );
        } else {
          // Fallback to ffprobe for duration only
          const ffprobeCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${fullFilePath}"`;
          const { stdout } = await execAsync(ffprobeCmd);
          audioDuration = parseFloat(stdout.trim());
          console.log(`   ⚠️ Librosa failed, using ffprobe duration: ${audioDuration?.toFixed(1)}s`);
        }

        if (!audioDuration || isNaN(audioDuration) || audioDuration <= 0) {
          return res.status(400).json({ success: false, error: 'Could not detect audio duration' });
        }
        console.log(`🎵 Detected audio duration: ${audioDuration?.toFixed(1)}s`);
      } catch (error) {
        console.error('Could not analyze audio:', error);
        return res.status(400).json({ success: false, error: 'Could not analyze audio file' });
      }

      // Recalculate timing - ALWAYS use originalTiming (lyrics-based estimate) if available
      // This ensures recalculation is always from the baseline, not from previous recalculations
      let baselineTiming = pkg.packageData?.originalTiming || pkg.packageData?.timing;
      if (!baselineTiming) {
        return res.status(400).json({ success: false, error: 'No timing data in package' });
      }

      // EDGE CASE: If no originalTiming exists and current timing already matches audio duration,
      // we need to reverse-engineer the original timing from the current recalculated timing
      if (
        !pkg.packageData?.originalTiming &&
        Math.abs((baselineTiming.totalDurationSeconds || 0) - audioDuration) < 1
      ) {
        console.log(`⚠️ No originalTiming found and current timing matches audio - attempting to restore original...`);
        // Estimate original duration (assume typical 80% of actual for 125 BPM hip-hop)
        // Or calculate from VEO prompts original count
        const originalVeoPrompts = pkg.packageData?.veoPrompts || [];
        // Count unique prompts per section to estimate original clips
        const sectionCounts = new Map<string, number>();
        for (const prompt of originalVeoPrompts) {
          sectionCounts.set(prompt.section, (sectionCounts.get(prompt.section) || 0) + 1);
        }
        // Calculate original total clips from prompts
        const estimatedOriginalClips = Math.max(
          24,
          sectionCounts.size > 0 ? Array.from(sectionCounts.values()).reduce((a, b) => a + b, 0) : 24,
        );
        // Estimate original duration: 8 seconds per clip
        const estimatedOriginalDuration = estimatedOriginalClips * 8 * 0.75; // ~75% of full clip time
        console.log(
          `   Estimating original duration: ${estimatedOriginalDuration.toFixed(1)}s (${estimatedOriginalClips} clips)`,
        );

        // Scale factor to reverse the timing
        const reverseScale = estimatedOriginalDuration / audioDuration;

        // Create a reconstructed original timing
        const originalSections = (baselineTiming.sections || baselineTiming.sectionsBreakdown || []).map((s: any) => {
          const origDuration = (s.estimatedDurationSeconds || s.durationSeconds || 10) * reverseScale;
          const origClips = Math.ceil(origDuration / 8);
          return {
            ...s,
            estimatedDurationSeconds: origDuration,
            durationSeconds: origDuration,
            veoClipsNeeded: origClips,
            clipCount: origClips,
          };
        });

        baselineTiming = {
          ...baselineTiming,
          totalDurationSeconds: estimatedOriginalDuration,
          sections: originalSections,
          sectionsBreakdown: originalSections,
          formattedDuration: unityTimingAnalyzer.formatDuration(estimatedOriginalDuration),
        };
        console.log(`   Restored baseline: ${baselineTiming.formattedDuration}`);
      }

      const recalculatedTiming = unityTimingAnalyzer.recalculateTimingForAudioDuration(baselineTiming, audioDuration);

      // Update VEO prompts with new section durations
      const sections = recalculatedTiming.sections || recalculatedTiming.sectionsBreakdown || [];
      const sectionMap = new Map<string, any>();
      let runningTime = 0;
      for (const section of sections) {
        const sectionName = section.section || section.name || '';
        sectionMap.set(sectionName, {
          ...section,
          startTime: runningTime,
          endTime: runningTime + (section.estimatedDurationSeconds || section.durationSeconds || 10),
        });
        runningTime += section.estimatedDurationSeconds || section.durationSeconds || 10;
      }

      // Group existing prompts by section
      // VEO prompts use 'sectionName' field, not 'section'
      const promptsBySection = new Map<string, any[]>();
      for (const prompt of pkg.packageData.veoPrompts || []) {
        // Support both 'sectionName' (correct) and 'section' (legacy) field names
        const promptSection = prompt.sectionName || prompt.section || '';
        const sectionPrompts = promptsBySection.get(promptSection) || [];
        sectionPrompts.push(prompt);
        promptsBySection.set(promptSection, sectionPrompts);
      }

      console.log(
        `   Existing prompts by section: ${Array.from(promptsBySection.entries())
          .map(([k, v]) => `${k}:${v.length}`)
          .join(', ')}`,
      );

      // Build updated prompts with extra clips where needed
      const updatedVeoPrompts: any[] = [];
      let globalClipNumber = 1;

      for (const section of sections) {
        const sectionName = section.section || section.name || '';
        const existingPrompts = promptsBySection.get(sectionName) || [];
        const neededClips = section.clipCount || section.veoClipsNeeded || 1;
        const sectionDuration = section.estimatedDurationSeconds || section.durationSeconds || 10;
        const sectionInfo = sectionMap.get(sectionName);

        for (let i = 0; i < neededClips; i++) {
          const basePrompt = existingPrompts[i] || existingPrompts[existingPrompts.length - 1];
          if (basePrompt) {
            updatedVeoPrompts.push({
              ...basePrompt,
              clipNumber: globalClipNumber,
              duration: 8,
              sectionDuration: sectionDuration,
              timing: {
                sectionStartTime: sectionInfo?.startTime || 0,
                sectionEndTime: sectionInfo?.endTime || sectionDuration,
                sectionClipCount: neededClips,
                clipIndex: i,
              },
            });
            globalClipNumber++;
          }
        }
      }

      console.log(`   VEO prompts: ${pkg.packageData.veoPrompts?.length || 0} → ${updatedVeoPrompts.length}`);

      // Store originalTiming if this is the first recalculation
      // This preserves the lyrics-based estimate for future recalculations
      const originalTimingToStore = pkg.packageData?.originalTiming || pkg.packageData?.timing;

      const updatedPackageData = {
        ...pkg.packageData,
        originalTiming: originalTimingToStore, // Always preserve the original lyrics-based timing
        timing: recalculatedTiming,
        veoPrompts: updatedVeoPrompts,
        audioInfo: {
          fileName: pkg.audioFileName,
          durationSeconds: audioDuration,
          formattedDuration: unityTimingAnalyzer.formatDuration(audioDuration),
        },
        // Store Librosa analysis for VEO generation (CRITICAL for audio-video sync)
        librosaAnalysis: librosaAnalysis,
        audioAnalysis: librosaAnalysis, // Also store as audioAnalysis for compatibility
        audioTextSummary: audioTextSummary,
      };

      // Update the package
      const updatedPkg = await storage.updateUnityContentPackage(id, {
        packageData: updatedPackageData,
      });

      console.log(`✅ Timing recalculated for ${audioDuration.toFixed(1)}s audio:`);
      console.log(`   Original: ${baselineTiming.formattedDuration} → Actual: ${recalculatedTiming.formattedDuration}`);
      console.log(
        `   VEO clips: ${recalculatedTiming.totalVeoClips}, Est. cost: $${recalculatedTiming.estimatedVeoCost}`,
      );

      res.json({
        success: true,
        data: {
          audioDuration,
          formattedDuration: recalculatedTiming.formattedDuration,
          totalVeoClips: recalculatedTiming.totalVeoClips,
          estimatedVeoCost: recalculatedTiming.estimatedVeoCost,
          timing: recalculatedTiming,
        },
      });
    } catch (error: any) {
      console.error('Error recalculating timing:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Regenerate lyrics for an existing package (for packages missing lyrics)
  router.post('/unity/packages/:id/regenerate-lyrics', async (req, res) => {
    try {
      const { id } = req.params;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      const packageData = pkg.packageData as any;
      if (!packageData) {
        return res.status(400).json({ success: false, error: 'Package has no data' });
      }

      console.log(`🎤 Regenerating lyrics for package: ${pkg.title}`);
      console.log(`   Topic: ${pkg.topic || packageData.topic}`);

      // Generate a complete new package using the existing topic
      const topic = pkg.topic || packageData.topic || packageData.figure || 'Unknown Topic';

      // Generate the complete package with lyrics
      const newPackage = await unityContentGenerator.generateCompletePackage({
        topic,
        message: packageData.story || packageData.hook || `The story of ${topic}`,
        voice: 'storyteller' as any,
        energy: 'medium' as any,
        mood: 'epic' as any,
        visualStyle: packageData.metadata?.visualStyle || 'cinematic',
        visualStyleV2: packageData.metadata?.visualStyleV2,
        setting: packageData.metadata?.setting,
        customBars: [],
        avoidTerms: [],
        characterCount: 1,
        targetDurationSeconds: 60,
        aspectRatio: '9:16' as any,
        vibePreset: 'default',
        stylePreset: packageData.metadata?.stylePreset || 'epic_history',
      } as any);

      // Merge the new lyrics into the existing package data
      const updatedPackageData = {
        ...packageData,
        lyrics: newPackage.lyrics,
        sunoStyleTags: newPackage.sunoStyleTags,
        characterCast: newPackage.characterCast,
      };

      // Update the package
      await storage.updateUnityContentPackage(id, {
        packageData: updatedPackageData,
      });

      console.log(`✅ Lyrics regenerated for package: ${pkg.title}`);
      console.log(`   Lyrics length: ${newPackage.lyrics?.raw?.length || 0} chars`);

      res.json({
        success: true,
        data: {
          message: 'Lyrics regenerated successfully',
          lyricsPreview: newPackage.lyrics?.raw?.substring(0, 200) + '...',
          sunoStyle: newPackage.sunoStyleTags?.fullStyleString?.substring(0, 100),
        },
      });
    } catch (error: any) {
      console.error('Error regenerating lyrics:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Regenerate VEO prompts for a Unity content package using audio analysis
  router.post('/unity/packages/:id/regenerate-prompts', async (req, res) => {
    try {
      const { id } = req.params;

      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      const packageData = pkg.packageData;
      if (!packageData) {
        return res.status(400).json({ success: false, error: 'Package has no data' });
      }

      // Need audio analysis to generate music-aware prompts
      if (!packageData.audioAnalysis || !packageData.audioTextSummary) {
        return res.status(400).json({
          success: false,
          error: 'Package needs audio analysis. Upload audio first.',
        });
      }

      if (!packageData.lyrics || !packageData.characterCast) {
        return res.status(400).json({
          success: false,
          error: 'Package missing lyrics or character cast',
        });
      }

      console.log(`🔄 Regenerating VEO prompts for package: ${pkg.title}`);

      // Log documentary mode status for debugging
      const isDocMode =
        packageData.isHistoricalContent && !!packageData.deepResearch && !packageData.metadata?.battleMode;
      if (isDocMode) {
        console.log(
          `   🏛️ DOCUMENTARY MODE PRESERVED: ${packageData.deepResearch?.basicInfo?.fullName || 'Historical Figure'}`,
        );
      } else if (packageData.metadata?.battleMode) {
        console.log(`   ⚔️ BATTLE MODE PRESERVED`);
      }

      // 🔧 FIX GENDER: Re-infer gender for historical figures to fix any previous misdetections
      const fixedCharacterCast = packageData.characterCast.map((char: any) => {
        if (!char.name) return char;

        const text = `${char.name} ${char.appearance || ''}`.toLowerCase();

        // EXPLICIT FEMALE NAMES - These ALWAYS return female regardless of other content
        const explicitFemaleNames = [
          'cleopatra',
          'nefertiti',
          'hatshepsut',
          'boudicca',
          'zenobia',
          'theodora',
          'catherine',
          'elizabeth',
          'victoria',
          'marie',
          'joan',
          'helen',
          'wu zetian',
          'tomyris',
          'artemisia',
          'hypatia',
          'sappho',
          'empress',
          'queen',
        ];
        const isFemale = explicitFemaleNames.some((n) => text.includes(n));

        if (isFemale && char.gender !== 'female') {
          console.log(`   🔧 GENDER FIX: ${char.name} was "${char.gender}", corrected to "female"`);
          return { ...char, gender: 'female', age: 30 };
        }

        return char;
      });

      // Generate new music-aware VEO prompts
      // Pass documentary parameters to preserve historical content styling during regeneration
      // Use Kling engine (5-second clips) to generate the correct number of prompts
      const newVeoPrompts = await unityContentGenerator.generateMusicAwareVeoPrompts({
        audioAnalysis: packageData.audioAnalysis,
        audioTextSummary: packageData.audioTextSummary,
        lyrics: packageData.lyrics as any,
        characterCast: fixedCharacterCast,
        visualStyle: (packageData as any).visualStyle || 'cinematic',
        visualStyleV2: (packageData as any).visualStyleV2 || 'cinematic',
        setting: (packageData as any).setting || 'everyday',
        vertical: (packageData as any).vertical !== false,
        videoEngine: 'kling', // Generate prompts for Kling (5-second clips)
        isHistoricalContent: packageData.isHistoricalContent || false,
        deepResearch: packageData.deepResearch || null,
      });

      console.log(`   ✅ Generated ${newVeoPrompts.length} VEO prompts`);

      // Update package with new prompts and fixed character cast
      const updatedPackageData = {
        ...packageData,
        characterCast: fixedCharacterCast,
        veoPrompts: newVeoPrompts,
        promptsRegenerated: new Date().toISOString(),
      };

      const updatedPkg = await storage.updateUnityContentPackage(id, {
        packageData: updatedPackageData as any,
      });

      res.json({
        success: true,
        data: {
          promptCount: newVeoPrompts.length,
          prompts: newVeoPrompts.map((p) => ({
            sectionName: p.sectionName,
            durationSeconds: p.durationSeconds,
            fullPrompt: p.fullPrompt?.substring(0, 150) + '...',
          })),
        },
      });
    } catch (error: any) {
      console.error('Error regenerating VEO prompts:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Generate video clips for a Unity content package (background job)
  // Supports both VEO and Kling video engines
  router.post('/unity/packages/:id/generate-veo', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        aspectRatio = '9:16',
        includeKaraoke = true, // Enable karaoke subtitles by default (one word at a time)
        karaokeStyle = 'bounce',
        enableI2V = false, // Image-to-Video mode for character consistency
        skipLibrosaCheck = false, // Allow bypassing Librosa check for testing
        videoEngine = 'veo3' as VideoEngine, // Video engine: 'veo3' or 'kling'
      } = req.body;

      // Check if package exists
      const pkg = await storage.getUnityContentPackage(id);
      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      const packageData = pkg.packageData;
      if (!packageData?.veoPrompts || packageData.veoPrompts.length === 0) {
        return res.status(400).json({ success: false, error: 'No VEO prompts found in package' });
      }

      // CRITICAL: Require audio + Librosa analysis before VEO generation
      // This ensures camera/lighting/pacing is driven by actual music data
      if (!skipLibrosaCheck) {
        // Check for audio path (saved at package root level, not in packageData)
        if (!pkg.audioFilePath && !packageData.audioFilePath) {
          return res.status(400).json({
            success: false,
            error: 'Audio required before VEO generation. Upload audio first, then run Librosa analysis.',
            code: 'AUDIO_REQUIRED',
          });
        }

        // Check for Librosa analysis (saved as audioAnalysis in packageData)
        const librosaData = packageData.librosaAnalysis || packageData.audioAnalysis;
        if (!librosaData) {
          return res.status(400).json({
            success: false,
            error:
              'Librosa analysis required before VEO generation. The audio must be analyzed so camera movement, lighting, and pacing can sync with the music.',
            code: 'LIBROSA_REQUIRED',
            hint: 'Call /api/unity/packages/:id/recalculate after uploading audio to run Librosa analysis',
          });
        }

        console.log(`✅ Librosa analysis verified: BPM=${librosaData.bpm}, ${librosaData.beatCount || 'N/A'} beats`);
      } else {
        console.log(`⚠️ Librosa check skipped (testing mode)`);
      }

      // Check if selected video engine is enabled
      const allEngines = getAvailableEngines();
      const engineInfo = allEngines.find((e) => e.engine === videoEngine);
      const enabledEngines = allEngines.filter((e) => e.enabled).map((e) => e.engine);

      if (!engineInfo || !engineInfo.enabled) {
        const engineName = videoEngine === 'kling' ? 'Kling AI' : 'VEO 3.1';
        return res.status(400).json({
          success: false,
          error: `${engineName} is not available. Available engines: ${enabledEngines.join(', ') || 'none'}`,
          availableEngines: enabledEngines,
        });
      }

      // For Kling: Expand prompts to 5-second intervals based on song duration
      let workingPrompts = packageData.veoPrompts;
      let totalClips = 0;

      if (videoEngine === 'kling') {
        // Get song duration - prefer estimatedDurationSeconds as it's the original song length
        // Librosa duration can get corrupted if package was re-analyzed
        const librosaData = packageData.librosaAnalysis || packageData.audioAnalysis;
        const estimatedDuration = packageData.timing?.estimatedDurationSeconds;
        const librosaDuration = librosaData?.duration;

        // Use estimated duration if available, otherwise use Librosa (if Librosa is > 2x estimated, it's corrupted)
        let songDuration = estimatedDuration || librosaDuration || 120;
        if (estimatedDuration && librosaDuration && librosaDuration > estimatedDuration * 1.5) {
          console.log(
            `   ⚠️ Librosa duration ${librosaDuration.toFixed(1)}s seems corrupted, using estimated ${estimatedDuration.toFixed(1)}s`,
          );
          songDuration = estimatedDuration;
        }

        // Use original VEO prompts if this package was already Kling-expanded
        const sourcePrompts = (packageData as any).originalVeoPrompts || packageData.veoPrompts;

        // Calculate clips needed for 5-second Kling clips
        const klingClipCount = Math.ceil(songDuration / 5);
        const originalPromptCount = sourcePrompts.length;

        console.log(`   🎬 KLING EXPANSION: Song ${songDuration.toFixed(1)}s → ${klingClipCount} clips (5s each)`);
        console.log(
          `   📝 Using ${originalPromptCount} source prompts (originalVeoPrompts: ${!!(packageData as any).originalVeoPrompts})`,
        );

        // Expand prompts to fill all 5-second slots with UNIQUE variations
        const expandedPrompts: any[] = [];

        // Track how many times each source prompt has been used (for variation)
        const promptUsageCount: Record<number, number> = {};

        // Action variations to add when prompts repeat
        const actionVariations = [
          { camera: 'close-up on face', action: 'expression shift, subtle emotion reveal' },
          { camera: 'medium shot', action: 'gesture and body language emphasis' },
          { camera: 'wide establishing', action: 'surveying the environment' },
          { camera: 'tracking follow', action: 'movement through the scene' },
          { camera: 'low angle power shot', action: 'commanding presence' },
          { camera: 'high angle overview', action: 'contemplating from above' },
          { camera: 'over-shoulder', action: 'intimate moment of focus' },
          { camera: 'dolly in slowly', action: 'building dramatic tension' },
          { camera: 'orbit around subject', action: 'dynamic reveal' },
          { camera: 'profile silhouette', action: 'dramatic side view moment' },
        ];

        for (let i = 0; i < klingClipCount; i++) {
          // Distribute original prompts evenly across expanded clips
          const sourceIndex = Math.floor((i * originalPromptCount) / klingClipCount);
          const sourcePrompt = sourcePrompts[sourceIndex];

          // Track usage for variation
          promptUsageCount[sourceIndex] = (promptUsageCount[sourceIndex] || 0) + 1;
          const usageNumber = promptUsageCount[sourceIndex];

          // Calculate 5-second timestamp
          const startSec = i * 5;
          const endSec = Math.min((i + 1) * 5, songDuration);
          const startMin = Math.floor(startSec / 60);
          const startSecRemainder = startSec % 60;
          const endMin = Math.floor(endSec / 60);
          const endSecRemainder = Math.round(endSec % 60);
          const timestamp = `${startMin}:${startSecRemainder.toString().padStart(2, '0')}-${endMin}:${endSecRemainder.toString().padStart(2, '0')}`;

          // Create new prompt with updated timestamp
          let updatedPromptText = sourcePrompt.prompt || '';
          // Replace existing timestamp with new one
          updatedPromptText = updatedPromptText.replace(/\[TIMESTAMP: [^\]]+\]/, `[TIMESTAMP: ${timestamp}]`);
          // If no timestamp existed, add one at the beginning
          if (!updatedPromptText.includes('[TIMESTAMP:')) {
            updatedPromptText = `[TIMESTAMP: ${timestamp}] ${updatedPromptText}`;
          }

          // Add VARIATION when source prompt is reused (usage > 1)
          if (usageNumber > 1) {
            const variation = actionVariations[(usageNumber - 2) % actionVariations.length];
            // Replace camera movement if exists, otherwise add variation note
            if (updatedPromptText.includes('Camera:')) {
              updatedPromptText = updatedPromptText.replace(/Camera: [^,\n]+/, `Camera: ${variation.camera}`);
            }
            // Add variation marker to make prompt unique
            updatedPromptText = updatedPromptText.replace(
              /VISUAL COMPOSITION:/,
              `CLIP VARIATION: ${variation.camera}, ${variation.action}\n\nVISUAL COMPOSITION:`,
            );
          }

          expandedPrompts.push({
            ...sourcePrompt,
            id: i + 1,
            prompt: updatedPromptText,
            durationSeconds: 5,
            clipCount: 1,
            timestampStart: startSec,
            timestampEnd: endSec,
            timestampFormatted: timestamp,
            klingExpanded: true,
            sourcePromptIndex: sourceIndex,
            variationNumber: usageNumber,
          });
        }

        workingPrompts = expandedPrompts;
        totalClips = klingClipCount;

        console.log(`   ✅ Prepared ${klingClipCount} Kling prompts with 5-second timestamps`);
      } else {
        // For VEO: Calculate clips normally (8-second clips)
        for (const veoPrompt of packageData.veoPrompts) {
          const clipsNeeded = veoPrompt.clipCount || Math.ceil((veoPrompt.durationSeconds || 8) / 8);
          totalClips += clipsNeeded;
        }
      }

      // Calculate cost based on video engine (Kling only)
      const costPerClip = klingVideoGenerator.getCostPerClip();
      const modeLabel = 'Kling AI';
      const estimatedCost = totalClips * costPerClip;
      const engineLabel = 'Kling';

      console.log(`🎬 Creating background job for Unity video generation: ${pkg.title}`);
      console.log(`   Package ID: ${id}`);
      console.log(`   Total clips: ${totalClips}`);
      console.log(`   Aspect ratio: ${aspectRatio}`);
      console.log(`   Video Engine: ${engineLabel}`);
      console.log(`   Mode: ${modeLabel}`);
      console.log(`   Karaoke: ${includeKaraoke ? `${karaokeStyle} style` : 'disabled'}`);
      console.log(`   Estimated cost: $${estimatedCost.toFixed(2)}`);

      // Create a background job for video generation
      const job = await storage.createJob({
        scriptName: `${pkg.title} - Unity ${engineLabel}${enableI2V ? ' I2V' : ''}`,
        scriptContent: `Unity content package video generation for: ${pkg.title} (${modeLabel})`,
        mode: 'unity_kling',
        aspectRatio: aspectRatio,
        clipCount: totalClips,
        unityMetadata: {
          packageId: id,
          promptCount: workingPrompts.length, // Use expanded prompt count for Kling
          estimatedCost: estimatedCost,
          includeKaraoke: includeKaraoke,
          karaokeStyle: karaokeStyle,
          enableI2V: enableI2V,
          videoEngine: videoEngine, // Pass video engine to job worker
        } as any,
      } as any);

      // Update package status to generating and link to job
      // For Kling, packageData was already updated with expanded prompts above
      const finalPackageData =
        videoEngine === 'kling'
          ? {
              ...packageData,
              veoPrompts: workingPrompts,
              klingExpanded: true,
              originalVeoPrompts: (packageData as any).originalVeoPrompts || packageData.veoPrompts,
              timing: { ...packageData.timing, totalVeoClips: totalClips },
              jobId: job.id,
              generationProgress: 0,
              aspectRatio: aspectRatio,
            }
          : {
              ...packageData,
              jobId: job.id,
              generationProgress: 0,
              aspectRatio: aspectRatio,
            };

      await storage.updateUnityContentPackage(id, {
        status: 'generating',
        packageData: finalPackageData,
      });

      console.log(`✅ Unity ${engineLabel} job created: ${job.id}`);
      console.log(`   Job will be processed by background worker`);

      // Return immediately - job worker will process in background
      res.json({
        success: true,
        data: {
          jobId: job.id,
          packageId: id,
          status: 'queued',
          totalClips: totalClips,
          estimatedCost: estimatedCost,
          videoEngine: videoEngine,
          message: `${engineLabel} video generation started in background. Check Jobs tab for progress.`,
        },
      });
    } catch (error: any) {
      console.error('Error creating Unity VEO job:', error);

      // Update package status to failed
      try {
        await storage.updateUnityContentPackage(req.params.id, {
          status: 'failed',
        });
      } catch (updateError) {
        console.error('Failed to update package status:', updateError);
      }

      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get VEO generation progress for a package
  router.get('/unity/packages/:id/veo-progress', async (req, res) => {
    try {
      const { id } = req.params;
      const pkg = await storage.getUnityContentPackage(id);

      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      res.json({
        success: true,
        data: {
          status: pkg.status,
          progress: (pkg.packageData as any)?.generationProgress || 0,
          generatedClips: (pkg.packageData as any)?.generatedClips || [],
          totalCost: (pkg.packageData as any)?.totalCost || 0,
        },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Manually assemble clips into final video for a completed Unity package
  router.post('/unity/packages/:id/assemble', async (req, res) => {
    try {
      const { id } = req.params;
      const pkg = await storage.getUnityContentPackage(id);

      if (!pkg) {
        return res.status(404).json({ success: false, error: 'Content package not found' });
      }

      const generatedClips = (pkg.packageData as any)?.generatedClips || [];
      const successfulClips = generatedClips.filter((c: any) => !c.error && c.localPath);

      if (successfulClips.length < 2) {
        return res.status(400).json({
          success: false,
          error: `Not enough clips to assemble. Need at least 2, found ${successfulClips.length}`,
        });
      }

      // Check if clips still exist on disk
      const sortedClips = [...successfulClips].sort((a: any, b: any) => a.clipIndex - b.clipIndex);
      const validClips = sortedClips.filter((c: any) => existsSync(c.localPath));

      if (validClips.length < 2) {
        return res.status(400).json({
          success: false,
          error: `Not enough valid clip files found. Need at least 2, found ${validClips.length}`,
        });
      }

      console.log(`\n🎬 MANUAL VIDEO ASSEMBLY for: ${pkg.title}`);
      console.log(`   Clips to assemble: ${validClips.length}`);

      const clipPaths = validClips.map((c: any) => c.localPath);

      // Get music file path
      let musicPath: string | undefined;
      let musicDuration: number | undefined;

      if (pkg.audioFilePath) {
        const musicFilename = pkg.audioFilePath.replace('/music/', '');
        musicPath = join(musicDir, musicFilename);

        if (existsSync(musicPath)) {
          console.log(`   🎵 Music file: ${musicFilename}`);
          try {
            const result = await execAsync(
              `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${musicPath}"`,
            );
            musicDuration = parseFloat(result.stdout.trim()) || undefined;
            console.log(`   🎵 Music duration: ${musicDuration?.toFixed(2)}s`);
          } catch (e) {
            console.warn(`   ⚠️ Could not get music duration`);
          }
        } else {
          console.warn(`   ⚠️ Music file not found: ${musicPath}`);
          musicPath = undefined;
        }
      }

      // Calculate section timings
      const sectionTimings = validClips.map((_: any, i: number) => ({
        startTime: i * 8,
        endTime: (i + 1) * 8,
      }));

      // Output path for final assembled video
      const outputFilename = `unity_final_${id}_${Date.now()}.mp4`;
      const rendersDir = join(process.cwd(), 'data', 'videos', 'renders');

      // Ensure renders directory exists
      if (!existsSync(rendersDir)) {
        mkdirSync(rendersDir, { recursive: true });
      }

      const outputPath = join(rendersDir, outputFilename);

      // Get aspect ratio from package
      const aspectRatio = (pkg.packageData as any)?.aspectRatio || '9:16';

      console.log(`   Assembling ${validClips.length} clips with ${aspectRatio} aspect ratio...`);

      // Call FFmpeg processor to assemble the video
      await ffmpegProcessor.concatenateVideos(
        clipPaths,
        outputPath,
        musicPath,
        musicDuration,
        sectionTimings,
        true, // enableCrossfades
        0.3, // crossfadeDuration
        undefined, // existingState
        id,
        async (batchId, totalBatches) => {
          console.log(`   Batch ${batchId + 1}/${totalBatches} complete`);
        },
        aspectRatio as '16:9' | '9:16',
      );

      if (!existsSync(outputPath)) {
        throw new Error('Final video file not created');
      }

      const finalVideoUrl = `/api/videos/${outputFilename}`;
      console.log(`   ✅ Final video assembled: ${finalVideoUrl}`);

      // Update package with final video
      const updatedPackageData = {
        ...pkg.packageData,
        finalVideoUrl: finalVideoUrl,
        assemblyError: undefined,
        jobId: (pkg.packageData as any)?.jobId,
      };

      await storage.updateUnityContentPackage(id, {
        packageData: updatedPackageData as any,
      });

      // Also update any associated job
      if ((pkg.packageData as any)?.jobId) {
        try {
          await storage.updateJob((pkg.packageData as any).jobId, {
            videoUrl: finalVideoUrl,
          });
        } catch (e) {
          console.warn('Could not update job with final video URL');
        }
      }

      res.json({
        success: true,
        data: {
          finalVideoUrl,
          clipsAssembled: validClips.length,
          hasMusic: !!musicPath,
          musicDuration,
        },
      });
    } catch (error: any) {
      console.error('Error assembling video:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // NARRATIVE QUALITY API ENDPOINTS
  // NC (Narrative Coherence) and SF (Script Faithfulness) scoring
  // ============================================================================

  router.get('/narrative/quality/:packageId', async (req, res) => {
    try {
      const { packageId } = req.params;

      // Validate packageId
      if (!packageId || typeof packageId !== 'string' || packageId.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing packageId parameter',
        });
      }

      console.log(`📊 [Narrative API] Getting quality scores for package: ${packageId}`);

      const { narrativeMetricsService } = await import('../services/narrative-metrics-service');

      // Try to get stored results first
      const storedResults = await narrativeMetricsService.getStoredResults(packageId);

      if (storedResults) {
        res.json({
          success: true,
          data: {
            nc: storedResults.nc,
            sf: storedResults.sf,
            combined: storedResults.combined,
            tier: storedResults.tier,
            passesQualityGate: storedResults.passesQualityGate,
            evaluatedAt: storedResults.evaluatedAt,
            summary: storedResults.summary,
          },
        });
      } else {
        res.status(404).json({
          success: false,
          error:
            'No narrative quality results found for this package. Run POST /api/narrative/evaluate/:packageId first.',
        });
      }
    } catch (error: any) {
      console.error('📊 [Narrative API] Error getting quality:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/narrative/evaluate/:packageId', async (req, res) => {
    try {
      const { packageId } = req.params;

      // Validate packageId
      if (!packageId || typeof packageId !== 'string' || packageId.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing packageId parameter',
        });
      }

      console.log(`📊 [Narrative API] Triggering quality evaluation for package: ${packageId}`);

      const { narrativeMetricsService } = await import('../services/narrative-metrics-service');

      // Run full narrative quality evaluation
      const result = await narrativeMetricsService.evaluateNarrativeQuality(packageId);

      // Check if we got a fallback result (combined score 0 indicates data unavailable)
      if (result.combined === 0 && result.summary.startsWith('Evaluation incomplete:')) {
        return res.status(422).json({
          success: false,
          error: result.summary,
          data: result,
        });
      }

      res.json({
        success: true,
        data: {
          nc: result.nc,
          sf: result.sf,
          combined: result.combined,
          tier: result.tier,
          passesQualityGate: result.passesQualityGate,
          evaluatedAt: result.evaluatedAt,
          summary: result.summary,
        },
      });
    } catch (error: any) {
      console.error('📊 [Narrative API] Evaluation error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.get('/narrative/quality-gate/:packageId', async (req, res) => {
    try {
      const { packageId } = req.params;

      // Validate packageId
      if (!packageId || typeof packageId !== 'string' || packageId.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing packageId parameter',
        });
      }

      console.log(`📊 [Narrative API] Quality gate check for package: ${packageId}`);

      const { narrativeMetricsService } = await import('../services/narrative-metrics-service');

      const gateResult = await narrativeMetricsService.checkQualityGate(packageId);

      res.json({
        success: true,
        data: gateResult,
      });
    } catch (error: any) {
      console.error('📊 [Narrative API] Quality gate error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  router.post('/narrative/retry-priorities/:packageId', async (req, res) => {
    try {
      const { packageId } = req.params;

      // Validate packageId
      if (!packageId || typeof packageId !== 'string' || packageId.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Invalid or missing packageId parameter',
        });
      }

      const { clipReports, librosaData } = req.body;

      console.log(`📊 [Narrative API] Calculating retry priorities for package: ${packageId}`);

      const { clipRetryService } = await import('../services/clip-retry-service');
      const { db } = await import('../db');
      const { narrativeTnaBreakdowns } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      // Load TNAs from database
      let tnaResult;
      try {
        tnaResult = await db
          .select()
          .from(narrativeTnaBreakdowns)
          .where(eq(narrativeTnaBreakdowns.packageId, packageId))
          .limit(1);
      } catch (dbError: any) {
        console.warn(`📊 [Narrative API] Database error loading TNAs: ${dbError.message}`);
        // Return default priorities if database fails
        const defaultPriorities: Record<number, number> = {};
        const clipCount = clipReports?.length || 10;
        for (let i = 0; i < clipCount; i++) {
          defaultPriorities[i] = 5;
        }
        return res.json({
          success: true,
          data: {
            packageId,
            priorities: defaultPriorities,
            highPriority: 0,
            mediumPriority: clipCount,
            lowPriority: 0,
            warning: 'Database unavailable - using default priorities',
          },
        });
      }

      // If no TNA data, return default priorities instead of 404
      let tnaData: any[] = [];
      if (tnaResult && tnaResult[0]) {
        const tnas = tnaResult[0].tnas as any[];
        tnaData = (tnas || []).map((tna: any, idx: number) => ({
          clipIndex: tna?.index ?? idx,
          type: tna?.type || 'beat',
          emotionalArc: tna?.emotionalArc || 'stable',
          text: tna?.text || '',
        }));
      }

      // Calculate surprise-based priorities (will use defaults if data unavailable)
      const priorities = clipRetryService.calculateSurpriseBasedPriorities(
        tnaData.length > 0 ? tnaData : null,
        clipReports || null,
        librosaData || null,
      );

      // Convert Map to object for JSON
      const prioritiesObj: Record<number, number> = {};
      priorities.forEach((value, key) => {
        prioritiesObj[key] = value;
      });

      res.json({
        success: true,
        data: {
          packageId,
          priorities: prioritiesObj,
          highPriority: Object.entries(prioritiesObj).filter(([_, p]) => p >= 8).length,
          mediumPriority: Object.entries(prioritiesObj).filter(([_, p]) => p >= 5 && p < 8).length,
          lowPriority: Object.entries(prioritiesObj).filter(([_, p]) => p < 5).length,
          ...(tnaData.length === 0 ? { warning: 'No TNA breakdown found - using default priorities' } : {}),
        },
      });
    } catch (error: any) {
      console.error('📊 [Narrative API] Retry priorities error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });



async function processSunoAsync(
  packageId: string,
  taskId: string,
  contentPackage: any,
  visualStyle: string,
  visualStyleV2: string,
  setting: string,
  vertical: boolean,
  battleMode: boolean = false,
  isHistoricalContent: boolean = false,
  deepResearch: any = null,
) {
  try {
    console.log(`🎵 [Async] Polling Suno for package ${packageId}...`);

    // Poll Suno until complete (max 5 minutes)
    const MAX_POLLS = 60;
    const POLL_INTERVAL = 5000;
    let sunoTracks: any[] = [];

    for (let i = 0; i < MAX_POLLS; i++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

      const status = await sunoApi.getTaskStatus(taskId);
      console.log(`   [Async] Poll ${i + 1}/${MAX_POLLS}: ${status.status}`);

      if (status.status === 'complete') {
        sunoTracks = status.tracks;
        break;
      } else if (status.status === 'failed') {
        throw new Error('Suno generation failed');
      }
    }

    if (sunoTracks.length === 0) {
      throw new Error('Suno generation timed out');
    }

    // Select longest track
    const bestTrack = sunoTracks.reduce((longest: any, track: any) => {
      return (track.duration || 0) > (longest?.duration || 0) ? track : longest;
    }, sunoTracks[0]);

    console.log(`   [Async] Selected track: ${bestTrack.duration}s`);

    if (!bestTrack?.audioUrl) {
      throw new Error('No audio URL in Suno response');
    }

    // Download audio
    const audioResponse = await axios.get(bestTrack.audioUrl, { responseType: 'arraybuffer' });
    const audioFilename = `suno_${packageId}_${Date.now()}.mp3`;
    const audioPath = join(musicDir, audioFilename);
    fs.writeFileSync(audioPath, audioResponse.data);
    console.log(`   [Async] Audio downloaded: ${audioFilename}`);

    // Run Librosa analysis with VEO 8-second sync
    let audioAnalysis: any = null;
    let audioTextSummary: string | undefined;
    let audioDuration: number | undefined;
    let veoSyncSections: any[] | undefined;

    try {
      const analysisResult = await audioAnalysisService.analyzeAudio(audioPath);
      if (analysisResult.success && analysisResult.analysis) {
        audioAnalysis = analysisResult.analysis;
        audioTextSummary = analysisResult.textSummary;
        audioDuration = analysisResult.analysis.duration;
        console.log(`   [Async] Librosa: BPM=${audioAnalysis.bpm}, ${audioAnalysis.sections.length} sections`);

        // Run VEO Audio Sync for 8-second aligned sections
        const veoSyncResult = await veoAudioSyncService.analyzeForVeoSync(audioPath, 180);
        if (veoSyncResult.success && veoSyncResult.sections) {
          veoSyncSections = veoSyncResult.sections;
          console.log(`   [Async] ✓ VEO Sync: ${veoSyncSections.length} 8-second aligned sections`);

          // Inject VEO sync sections into audio analysis for prompt generation
          audioAnalysis.veoSyncSections = veoSyncSections;
          audioAnalysis.bpmAlignment = veoSyncResult.bpmAlignment;

          if (veoSyncResult.bpmAlignment?.isAligned) {
            console.log(
              `   [Async] ✓ BPM ${audioAnalysis.bpm} is VEO-aligned (${veoSyncResult.bpmAlignment.barsIn8Seconds} bars per 8s)`,
            );
          } else {
            console.log(`   [Async] ⚠️ BPM ${audioAnalysis.bpm} NOT aligned - using forced 8s snapping`);
          }
        }
      }
    } catch (error) {
      console.warn('   [Async] Librosa analysis failed:', error);
    }

    // Recalculate timing and regenerate VEO prompts
    let updatedPackageData = contentPackage;

    if (audioDuration) {
      const recalculatedTiming = unityTimingAnalyzer.recalculateTimingForAudioDuration(
        contentPackage.timing,
        audioDuration,
      );

      updatedPackageData = {
        ...contentPackage,
        originalTiming: contentPackage.timing,
        timing: recalculatedTiming,
        audioAnalysis,
        audioTextSummary,
        audioFilePath: `/api/music/${audioFilename}`,
        audioDuration,
      };

      console.log(`   [Async] Timing recalculated: ${recalculatedTiming.formattedDuration}`);

      // Generate enhanced VEO prompts with music-awareness
      if (audioAnalysis && audioTextSummary) {
        try {
          const enhancedPrompts = await unityContentGenerator.generateMusicAwareVeoPrompts({
            audioAnalysis,
            audioTextSummary,
            lyrics: contentPackage.lyrics,
            characterCast: contentPackage.characterCast,
            visualStyle: visualStyle as any,
            visualStyleV2: visualStyleV2 as any,
            setting: setting as any,
            vertical,
            battleMode,
            battleTheme: contentPackage.battleTheme || null,
            isHistoricalContent,
            deepResearch,
          } as any);

          if (enhancedPrompts && enhancedPrompts.length > 0) {
            updatedPackageData.veoPrompts = enhancedPrompts;
            updatedPackageData.veoPromptsEnhanced = true;
            console.log(`   [Async] Enhanced VEO prompts: ${enhancedPrompts.length}`);
          }
        } catch (error) {
          console.warn('   [Async] VEO prompt enhancement failed:', error);
        }
      }
    }

    // Save final package
    await storage.updateUnityContentPackage(packageId, {
      status: 'audio_ready',
      audioFilePath: `/api/music/${audioFilename}`,
      sunoStatus: 'complete',
      sunoTracks: [bestTrack] as any,
      packageData: updatedPackageData,
    } as any);

    console.log(`🎉 [Async] Package ${packageId} ready with audio!`);
  } catch (error: any) {
    console.error(`❌ [Async] Suno processing failed for ${packageId}:`, error.message);
    await storage.updateUnityContentPackage(packageId, {
      status: 'draft',
      sunoStatus: 'failed',
    } as any);
  }
}


export default router;
