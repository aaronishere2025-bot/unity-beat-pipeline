/**
 * Job Routes
 *
 * Job creation, estimation, scheduling, retry, cancel, progress tracking, beat generation.
 */

import { Router } from 'express';
import { eq, and, isNull } from 'drizzle-orm';
import { musicDir } from './shared/multer-configs';
import { existsSync, readFileSync, createReadStream, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.js';
import { storage } from '../storage';
import { db } from '../db';
import { analyzeMusicFile } from '../services/music-analyzer';
import { costEstimator } from '../services/cost-estimator';
import { videoStorage } from '../services/video-storage';
import { ffmpegProcessor } from '../services/ffmpeg-processor';
import { insertJobSchema, updateJobSchema, jobs } from '@shared/schema';
import { VEO3_CONFIG, CONSISTENT_CHARACTER_CONFIG } from '../config/video-constants';
import { audioAnalysisService } from '../services/audio-analysis-service';


const router = Router();

// Helper function: Get random animated character theme for beat visual
function getRandomAnimatedBeatTheme(style: string): string {
  const animatedBeatThemes: Record<string, string[]> = {
    trap: [
      // Animals with swagger
      'gorilla wearing designer sunglasses and gold chain, vibing in neon city, 3D animation, swagger walk, purple and pink lighting',
      'cool cat with backwards cap and chains, smoking cigar in studio, animated hip-hop style, money falling around',
      'bear in streetwear hoodie, counting cash, animated character, dark urban background, moody lighting',
      'wolf DJ with headphones, spinning records, 3D animation, club lights flashing, smoke effects',
      'lion wearing crown on throne, animated gangster style, gold jewelry, dramatic lighting',
      'tiger in leather jacket, riding motorcycle through neon streets, 3D animation, cyberpunk vibes',
      'shark in designer outfit, underwater penthouse, money floating, animated luxury aesthetic',
      'eagle in gold chains, perched on skyscraper, city lights below, majestic animation',
      'snake with diamond grill, coiled around money pile, animated trap style, green lighting',
      'rhino in varsity jacket, breakdancing on rooftop, urban skyline, energetic animation',
      // Meme characters
      'Pepe the Frog in Supreme hoodie, counting stacks, meme aesthetic animation, trap vibes',
      'Wojak with designer shades, driving Lambo, sad boy trap animation, neon colors',
      'Doge in gold chain, throne room, much money wow, animated meme style',
      'Patrick Star wearing iced-out chain, counting money underwater, trap animation',
      'Squidward in streetwear, DJ booth, clarinet beats, animated trap aesthetic',
      // Robots/Cyborgs
      'cyberpunk robot with LED face, producing beats, futuristic studio, animated tech aesthetic',
      'android with holographic screen, scrolling through beats, neon rain, blade runner vibes',
      'mech suit DJ, giant speakers, laser show, intense animation, trap energy',
    ],
    lofi: [
      // Cozy characters
      'SpongeBob with fry cook hat backwards, chilling on couch, lofi animation style, cozy room vibes',
      'cute panda wearing oversized hoodie, studying with coffee, soft animation, warm lighting',
      'koala with headphones, reading book by window, gentle rain, animated cozy aesthetic',
      'sleepy sloth in beanie, playing lo-fi beats on laptop, soft colors, peaceful vibe',
      'raccoon barista making coffee, cozy cafe setting, warm tones, relaxing animation',
      'fox in pajamas, writing in journal, fairy lights, chill lofi animation',
      'cat curled up on windowsill, rain outside, vinyl playing, peaceful animation',
      'bunny in sweater, drinking tea, fireplace glowing, soft lofi aesthetic',
      'otter floating on back, stargazing, calm water, dreamy animation',
      'hedgehog reading manga, under blanket fort, fairy lights, cozy vibes',
      // Study buddies
      'owl with glasses, surrounded by books, lamplight, wise study animation',
      'turtle with laptop, coding peacefully, plants around, chill workspace animation',
      'penguin in scarf, journaling at desk, snow falling outside, warm interior',
      'squirrel organizing notes, colorful stationery, desk lamp, productive lofi vibe',
      // Meme lofi
      'Garfield with coffee, Monday blues, cozy armchair, animated lofi style',
      'Shiba Inu studying, doge aesthetic, much focus wow, soft colors',
      'Kirby with headphones, floating in clouds, dreamy pastel animation',
    ],
    boom_bap: [
      'breakdancing robot with boom box, graffiti wall background, 90s hip-hop animation, retro colors',
      'dog in Kangol hat and Adidas, spinning vinyl records, old school vibe, animated',
      'monkey in baggy jeans and Timbs, beatboxing, urban playground, golden age hip-hop aesthetic',
      'cat in tracksuit, breaking on cardboard, street corner, 80s/90s animation',
      'parrot with microphone, freestyling, boom box nearby, classic hip-hop vibe',
      'gorilla in bucket hat, digging through crates, record shop, nostalgic animation',
    ],
    drill: [
      'masked gorilla in black hoodie, dark alley, intense stare, gritty animation, red and black palette',
      'pit bull in tactical vest, aggressive stance, industrial background, dramatic shadows',
      'skeleton in ski mask, smoking, warehouse setting, dark drill animation aesthetic',
      'wolf pack in all black, warehouse, menacing energy, intense drill animation',
      'bear in balaclava, abandoned building, drill energy, red LED lights',
      'panther prowling rooftop, city night, aggressive animation, drill vibes',
    ],
    ambient: [
      'glowing jellyfish floating in cosmic space, ethereal animation, soft pastels, dreamy atmosphere',
      'spirit deer walking through misty forest, magical glow, serene animation, calming vibes',
      'floating whale swimming through clouds, peaceful animation, meditative aesthetic',
      'phoenix with aurora wings, celestial realm, ethereal colors, graceful animation',
      'koi fish in zen garden pond, ripples and lotus, tranquil animation',
      'butterfly landing on glowing flower, magical forest, soft ambient animation',
    ],
    custom: [
      'abstract creature morphing colors, psychedelic animation, flowing movements, trippy visuals',
      'geometric animal shifting shapes, kaleidoscope effect, mesmerizing animation',
    ],
  };

  const themes = animatedBeatThemes[style] || animatedBeatThemes.custom;
  return themes[Math.floor(Math.random() * themes.length)];
}




  // Test endpoint for GPT Cinematic Director prompt generation
  router.post('/test-prompts', async (req, res) => {
    try {
      const { generateAllPrompts } = await import('../services/gpt-cinematic-director');
      const { figureName, era, archetype, lyrics, clipCount } = req.body;
      console.log(`🧪 TEST: Generating ${clipCount || 4} grounded prompts for ${figureName || 'Genghis Khan'}`);

      const prompts = await generateAllPrompts(
        figureName || 'Genghis Khan',
        era || '13th century Mongolia',
        archetype || 'conqueror',
        lyrics || 'Genghis Khan unites the Mongol tribes. The Great Khan surveys his empire.',
        clipCount || 4,
      );

      console.log(`✅ TEST SUCCESS: Generated ${prompts.length} prompts`);
      prompts.forEach((p, i) => {
        console.log(`   [${i}] ${p.prompt.slice(0, 120)}...`);
      });

      res.json({ success: true, prompts });
    } catch (error: any) {
      console.error(`❌ TEST FAILED:`, error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Jobs endpoints
  // Cost estimation endpoint (NEW - Dec 2025)
  router.post('/jobs/estimate', async (req, res) => {
    try {
      console.log('💰 Cost estimation request:', JSON.stringify(req.body, null, 2));

      const {
        clipCount,
        mode = 'unity_kling',
        includeMusic = true,
        includeBestOfN = false,
        highVarianceClipCount = 0,
        includeQualityValidation = true,
        estimatedDuration,
        customPromptGeneration = true,
      } = req.body;

      // Validate required fields
      if (!clipCount || clipCount < 1) {
        return res.status(400).json({
          success: false,
          error: 'clipCount is required and must be at least 1',
        });
      }

      // Generate estimate
      const estimate = await costEstimator.estimateCost({
        clipCount: parseInt(clipCount),
        mode: mode as 'kling' | 'consistent' | 'unity_kling',
        includeMusic,
        includeBestOfN,
        highVarianceClipCount: parseInt(highVarianceClipCount) || 0,
        includeQualityValidation,
        estimatedDuration: estimatedDuration ? parseFloat(estimatedDuration) : undefined,
        customPromptGeneration,
      });

      console.log('✅ Cost estimate generated:', estimate.breakdown.total.toFixed(2));

      res.json({
        success: true,
        estimate,
        breakdown: estimate.breakdown,
        summary: costEstimator.formatBreakdown(estimate),
      });
    } catch (error: any) {
      console.error('❌ Cost estimation failed:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to estimate cost',
      });
    }
  });


  router.post('/jobs', authMiddleware, async (req, res) => {
    try {
      console.log('📝 Job submission - Request body:', JSON.stringify(req.body, null, 2));

      // Parse post-processing options BEFORE validation
      let postProcessingOptions: any = undefined;
      if (req.body.postProcessing) {
        try {
          postProcessingOptions =
            typeof req.body.postProcessing === 'string' ? JSON.parse(req.body.postProcessing) : req.body.postProcessing;
          console.log('🎬 Post-processing options:', postProcessingOptions);
        } catch (e) {
          console.warn('Could not parse postProcessing options:', e);
        }
      }

      // Map frontend field names to schema field names and include postProcessing in musicAnalysis
      const requestBody: any = {
        ...req.body,
        // Map selectedCharacterIds to characterProfileIds (frontend uses different name)
        characterProfileIds: req.body.selectedCharacterIds || req.body.characterProfileIds,
      };

      // Add postProcessing to musicAnalysis before validation so schema accepts it
      if (postProcessingOptions) {
        requestBody.musicAnalysis = {
          ...(requestBody.musicAnalysis || {}),
          postProcessing: postProcessingOptions,
        };
      }

      const validatedData = insertJobSchema.parse(requestBody);

      // MUSIC MODE FIX: Force 16:9 aspect ratio for music mode (lofi/beats should be horizontal for YouTube)
      if (validatedData.mode === 'music' && !requestBody.aspectRatio) {
        validatedData.aspectRatio = '16:9';
        console.log('🎵 Music mode detected - defaulting to 16:9 aspect ratio (YouTube horizontal)');
      }

      // Run music analysis if music is provided
      let musicAnalysis: any = validatedData.musicAnalysis || undefined;

      if (validatedData.musicUrl && validatedData.audioDuration) {
        try {
          // Extract filename from music URL
          const musicFilename = validatedData.musicUrl.split('/').pop();
          const musicFilePath = join(musicDir, musicFilename || '');

          // Validate file exists
          if (existsSync(musicFilePath)) {
            // Convert audioDuration from string to number
            const duration =
              typeof validatedData.audioDuration === 'string'
                ? parseFloat(validatedData.audioDuration)
                : validatedData.audioDuration;

            // Run music analysis
            const analysisResult = await analyzeMusicFile(musicFilePath, duration, validatedData.musicDescription);

            // Deep merge: analyzer results take precedence, but preserve postProcessing from request
            musicAnalysis = {
              ...(validatedData.musicAnalysis ?? {}), // Start with request data (includes postProcessing)
              ...analysisResult, // Analyzer results overwrite shared fields
              postProcessing: validatedData.musicAnalysis?.postProcessing, // Explicitly preserve postProcessing
            };

            console.log('✅ Music analysis complete:', musicAnalysis);
          } else {
            console.warn('Music file not found for analysis:', musicFilePath);
          }
        } catch (error: any) {
          console.error('Music analysis failed:', error);
          // Continue without analysis - keep any existing musicAnalysis (including postProcessing)
        }
      }

      // Create job with analysis (includes postProcessing)
      const job = await storage.createJob({
        ...validatedData,
        userId: req.user!.id,
        musicAnalysis: musicAnalysis,
      });

      res.json({ success: true, data: job });
    } catch (error: any) {
      console.error('❌ Job creation failed:', error);
      if (error.errors) {
        // Zod validation error
        console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
      }
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to create job',
      });
    }
  });


  // API Pricing endpoint - returns all current costs
  router.get('/pricing', async (req, res) => {
    try {
      const pricing = {
        kling: {
          name: 'Kling AI Video',
          provider: 'Kling (via kie.ai)',
          costPerClip: 1.5, // $1.50 per 15s clip (300 credits @ $0.005/credit)
          clipDuration: '5-10s',
          model: 'kling-v1',
          note: 'Primary video generation engine',
        },
        suno: {
          name: 'Suno AI Music',
          provider: 'Suno',
          costPerSong: 0.1, // $0.10 per song
          songDuration: '2-4 minutes',
          note: 'Music generation for videos',
        },
        gemini: {
          name: 'Gemini 3.0',
          provider: 'Google AI',
          costPerInputToken: 0.00000015, // $0.15 per 1M tokens
          costPerOutputToken: 0.0000006, // $0.60 per 1M tokens
          typicalCost: 0.001, // ~$0.001 per analysis
          note: 'Analysis and validation',
        },
        claude: {
          name: 'Claude Opus 4.5',
          provider: 'Anthropic',
          costPerInputToken: 0.000015, // $15 per 1M tokens
          costPerOutputToken: 0.000075, // $75 per 1M tokens
          typicalCost: 0.15, // ~$0.15 per narrative
          note: 'Narrative generation',
        },
        ipAdapter: {
          name: 'IP-Adapter FaceID',
          provider: 'Replicate',
          costPerImage: CONSISTENT_CHARACTER_CONFIG.COSTS.IP_ADAPTER_PER_IMAGE,
          model: CONSISTENT_CHARACTER_CONFIG.IP_ADAPTER.MODEL_VERSION,
        },
        lumaRay: {
          name: 'Luma Ray I2V',
          provider: 'Replicate',
          costPerVideo: CONSISTENT_CHARACTER_CONFIG.COSTS.LUMA_RAY_REPLICATE_PER_VIDEO,
          duration: CONSISTENT_CHARACTER_CONFIG.LUMA.DURATION,
        },
        lumaDirect: {
          name: 'Luma Dream Machine',
          provider: 'Luma Labs Direct',
          costPerVideo: CONSISTENT_CHARACTER_CONFIG.COSTS.LUMA_DIRECT_PER_VIDEO,
          duration: CONSISTENT_CHARACTER_CONFIG.LUMA.DURATION,
        },
        consistentCharacterCombo: {
          name: 'Consistent Character Mode',
          description: 'IP-Adapter + Luma animation',
          costPerClipMin:
            CONSISTENT_CHARACTER_CONFIG.COSTS.IP_ADAPTER_PER_IMAGE +
            CONSISTENT_CHARACTER_CONFIG.COSTS.LUMA_DIRECT_PER_VIDEO,
          costPerClipMax:
            CONSISTENT_CHARACTER_CONFIG.COSTS.IP_ADAPTER_PER_IMAGE +
            CONSISTENT_CHARACTER_CONFIG.COSTS.LUMA_RAY_REPLICATE_PER_VIDEO,
        },
        dailyLimit: VEO3_CONFIG.DAILY_COST_LIMIT,
      };

      res.json(pricing);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch pricing',
      });
    }
  });


  // API Usage Stats endpoint - returns real usage data
  router.get('/usage', async (req, res) => {
    try {
      const period = (req.query.period as 'today' | 'month' | 'all') || 'month';
      const stats = await storage.getApiUsageStats(period);
      res.json({ success: true, data: stats });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch usage stats',
      });
    }
  });


  router.get('/jobs', optionalAuthMiddleware, async (req, res) => {
    try {
      const jobs = await storage.listJobs();

      // If authenticated, show user's jobs + unowned automation jobs (userId=null)
      // Otherwise show all jobs (dev mode / unauthenticated)
      let filteredJobs = jobs;
      if (req.user) {
        filteredJobs = jobs.filter((job: any) => job.userId === req.user!.id || !job.userId);
        console.log(`[DEBUG] Authenticated user ${req.user.id}: ${filteredJobs.length} jobs (incl. automation)`);
      } else {
        console.log(`[DEBUG] Unauthenticated request: showing all ${jobs.length} jobs`);
      }

      res.json({ success: true, data: filteredJobs });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch jobs',
      });
    }
  });


  router.get('/jobs/:id', optionalAuthMiddleware, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      // Check if user owns this job
      if (job.userId && job.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to view this job',
        });
      }

      res.json({ success: true, data: job });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch job',
      });
    }
  });


  // Auto-schedule bulk videos to channels
  router.post('/jobs/auto-schedule', optionalAuthMiddleware, async (req, res) => {
    try {
      console.log('[AUTO-SCHEDULE] Starting auto-schedule...');

      const channelsFile = join(process.cwd(), 'data', 'youtube_connected_channels.json');

      if (!existsSync(channelsFile)) {
        console.log('[AUTO-SCHEDULE] Channels file not found');
        return res.status(404).json({ success: false, error: 'Channels file not found' });
      }

      const rawData = readFileSync(channelsFile, 'utf-8');
      const allChannels = JSON.parse(rawData);

      // Find lofi and trap channels
      const lofiChannel = allChannels.find(
        (c: any) => c.title.toLowerCase().includes('chill') || c.title.toLowerCase().includes('lofi'),
      );
      const trapChannel = allChannels.find((c: any) => c.title.toLowerCase().includes('trap'));

      if (!lofiChannel || !trapChannel) {
        console.log('[AUTO-SCHEDULE] Required channels not found');
        return res.status(404).json({
          success: false,
          error: 'Required channels not found. Need a channel with "chill" or "lofi" and one with "trap"',
        });
      }

      console.log('[AUTO-SCHEDULE] Found channels:', { lofi: lofiChannel.title, trap: trapChannel.title });

      // Get all completed jobs without YouTube video IDs from database
      const allJobsFromDb = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.status, 'completed'), isNull(jobs.youtubeVideoId), isNull(jobs.scheduledTime)));

      console.log('[AUTO-SCHEDULE] Query returned', allJobsFromDb.length, 'completed jobs');

      // Filter for jobs with video URL that haven't been scheduled before
      const unscheduledJobs = allJobsFromDb.filter((job: any) => {
        const hasVideo = job.videoUrl || job.video_url;
        const metadata = job.unityMetadata
          ? typeof job.unityMetadata === 'string'
            ? JSON.parse(job.unityMetadata)
            : job.unityMetadata
          : {};
        const hasBeenScheduled = metadata.hasBeenScheduled === true;

        if (!hasVideo) {
          console.log(`[AUTO-SCHEDULE] Job ${job.id} has no video`);
        }
        if (hasBeenScheduled) {
          console.log(`[AUTO-SCHEDULE] Job ${job.id} already scheduled`);
        }

        return hasVideo && !hasBeenScheduled;
      });

      console.log('[AUTO-SCHEDULE] Found', unscheduledJobs.length, 'unscheduled videos after filtering');

      // Classify videos
      const lofiVideos: any[] = [];
      const trapVideos: any[] = [];

      for (const job of unscheduledJobs) {
        const name = (job.scriptName || '').toLowerCase();
        const content = (job.scriptContent || '').toLowerCase();
        const combined = name + ' ' + content;

        // Detect trap beats
        if (
          combined.includes('trap') ||
          combined.includes('808') ||
          combined.includes('140 bpm') ||
          combined.includes('heavy bass')
        ) {
          trapVideos.push(job);
        }
        // Detect lofi/chill beats
        else if (
          combined.includes('lofi') ||
          combined.includes('chill') ||
          combined.includes('study') ||
          combined.includes('80 bpm') ||
          combined.includes('jazzy') ||
          combined.includes('ambient') ||
          job.mode === 'music'
        ) {
          lofiVideos.push(job);
        }
        // Default: route historical/unity content to lofi channel
        else {
          lofiVideos.push(job);
        }
      }

      console.log('[AUTO-SCHEDULE] Classified:', { lofi: lofiVideos.length, trap: trapVideos.length });

      // Schedule with smart spacing (2 videos per day per channel, staggered)
      const now = new Date();
      const scheduledJobs: any[] = [];

      // Schedule lofi videos (12pm and 8pm daily)
      const lofiTimes = [12, 20]; // 12pm, 8pm
      let lofiDayOffset = 0;
      let lofiTimeIndex = 0;

      for (const job of lofiVideos) {
        const scheduleDate = new Date(now);
        scheduleDate.setDate(scheduleDate.getDate() + lofiDayOffset);
        scheduleDate.setHours(lofiTimes[lofiTimeIndex], 0, 0, 0);

        // Parse existing metadata if it's a string
        let existingMetadata = {};
        if (job.unityMetadata) {
          existingMetadata = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;
        }

        const updatedMetadata = {
          ...existingMetadata,
          channelConnectionId: lofiChannel.id,
          hasBeenScheduled: true, // Prevent rescheduling
        };

        await db
          .update(jobs)
          .set({
            scheduledTime: scheduleDate,
            unityMetadata: JSON.stringify(updatedMetadata) as any,
          })
          .where(eq(jobs.id, job.id));

        scheduledJobs.push({ jobId: job.id, channel: lofiChannel.title, time: scheduleDate });

        // Move to next time slot
        lofiTimeIndex++;
        if (lofiTimeIndex >= lofiTimes.length) {
          lofiTimeIndex = 0;
          lofiDayOffset++;
        }
      }

      // Schedule trap videos (2pm and 6pm daily)
      const trapTimes = [14, 18]; // 2pm, 6pm
      let trapDayOffset = 0;
      let trapTimeIndex = 0;

      for (const job of trapVideos) {
        const scheduleDate = new Date(now);
        scheduleDate.setDate(scheduleDate.getDate() + trapDayOffset);
        scheduleDate.setHours(trapTimes[trapTimeIndex], 0, 0, 0);

        // Parse existing metadata if it's a string
        let existingMetadata = {};
        if (job.unityMetadata) {
          existingMetadata = typeof job.unityMetadata === 'string' ? JSON.parse(job.unityMetadata) : job.unityMetadata;
        }

        const updatedMetadata = {
          ...existingMetadata,
          channelConnectionId: trapChannel.id,
          hasBeenScheduled: true, // Prevent rescheduling
        };

        await db
          .update(jobs)
          .set({
            scheduledTime: scheduleDate,
            unityMetadata: JSON.stringify(updatedMetadata) as any,
          })
          .where(eq(jobs.id, job.id));

        scheduledJobs.push({ jobId: job.id, channel: trapChannel.title, time: scheduleDate });

        // Move to next time slot
        trapTimeIndex++;
        if (trapTimeIndex >= trapTimes.length) {
          trapTimeIndex = 0;
          trapDayOffset++;
        }
      }

      console.log('[AUTO-SCHEDULE] Scheduled', scheduledJobs.length, 'videos');

      res.json({
        success: true,
        message: `Auto-scheduled ${scheduledJobs.length} videos`,
        data: {
          lofiScheduled: lofiVideos.length,
          trapScheduled: trapVideos.length,
          totalScheduled: scheduledJobs.length,
          schedule: scheduledJobs.slice(0, 10), // Return first 10 as preview
        },
      });
    } catch (error: any) {
      console.error('[AUTO-SCHEDULE] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to auto-schedule',
      });
    }
  });


  // Update job schedule
  router.patch('/jobs/:id/schedule', optionalAuthMiddleware, async (req, res) => {
    try {
      const { id } = req.params;
      const { scheduledTime, channelConnectionId } = req.body;

      if (!scheduledTime) {
        return res.status(400).json({
          success: false,
          error: 'scheduledTime is required',
        });
      }

      // Get the job
      const job = await storage.getJob(id);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }

      // Check if user owns this job (skip in dev mode if not authenticated)
      if (req.user && job.userId && job.userId !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to modify this job',
        });
      }

      // Update the job with scheduled time and channel
      await db
        .update(jobs)
        .set({
          scheduledTime: new Date(scheduledTime),
          ...(channelConnectionId && {
            unityMetadata: {
              ...(job.unityMetadata || {}),
              channelConnectionId,
            },
          }),
        })
        .where(eq(jobs.id, id));

      // Fetch updated job
      const updatedJob = await storage.getJob(id);

      console.log(`[SCHEDULE] Updated job ${id} - scheduled for ${scheduledTime}`);
      res.json({ success: true, data: updatedJob });
    } catch (error: any) {
      console.error('[SCHEDULE] Error updating job schedule:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update schedule',
      });
    }
  });


  router.patch('/jobs/:id', authMiddleware, async (req, res) => {
    try {
      // Check ownership first
      const existingJob = await storage.getJob(req.params.id);
      if (!existingJob) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }
      if (existingJob.userId && existingJob.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
      }
      const validatedData = updateJobSchema.parse(req.body);
      const job = await storage.updateJob(req.params.id, validatedData);
      res.json({ success: true, data: job });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to update job',
      });
    }
  });


  router.post('/jobs/:id/retry', authMiddleware, async (req, res) => {
    try {
      const existingJob = await storage.getJob(req.params.id);
      if (!existingJob) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }
      if (existingJob.userId && existingJob.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      if (existingJob.status !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Only failed jobs can be retried',
        });
      }

      const job = await storage.updateJob(req.params.id, {
        status: 'queued',
        progress: 0,
        errorMessage: undefined,
        retryCount: (existingJob.retryCount || 0) + 1,
      });

      console.log(`🔄 Job ${req.params.id} queued for retry`);
      res.json({ success: true, data: job });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retry job',
      });
    }
  });


  // Resume a failed job from post-processing step (when clips are already generated)
  router.post('/jobs/:id/resume-postprocess', authMiddleware, async (req, res) => {
    try {
      const existingJob = await storage.getJob(req.params.id);
      if (!existingJob) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }
      if (existingJob.userId && existingJob.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      if (existingJob.status !== 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Only failed jobs can be resumed',
        });
      }

      // Check if clips are already generated (progress was at 90%+)
      const completedClips = (existingJob.completedClips as any[]) || [];
      if (completedClips.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No clips generated yet - use regular retry instead',
        });
      }

      // For Unity Kling jobs, refresh the audio analysis with forced alignment
      if (existingJob.mode === 'unity_kling' && existingJob.unityMetadata?.packageId) {
        try {
          const pkg = await storage.getUnityContentPackage(existingJob.unityMetadata.packageId);
          if (pkg && pkg.audioFilePath) {
            const { audioAnalysisService } = await import('../services/audio-analysis-service');
            const packageData = (pkg.packageData as any) || {};
            const lyrics = packageData.lyrics?.raw || '';

            if (lyrics && lyrics.trim()) {
              console.log(`🔄 Refreshing forced alignment for package ${pkg.id}...`);
              const analysis = await audioAnalysisService.analyzeAudio(process.cwd() + pkg.audioFilePath, lyrics);

              if (
                analysis.success &&
                analysis.analysis?.forcedAlignment &&
                analysis.analysis.forcedAlignment.length > 0
              ) {
                // Update package with fresh forced alignment
                // Also set lastVideoEngine to 'kling' to prevent engine mismatch on resume
                const updatedPackageData = {
                  ...packageData,
                  lastVideoEngine: 'kling', // Fix engine mismatch on resume
                  audioAnalysis: {
                    ...packageData.audioAnalysis,
                    ...analysis.analysis,
                  },
                };
                await storage.updateUnityContentPackage(pkg.id, {
                  packageData: updatedPackageData,
                });
                console.log(`✅ Updated package with ${analysis.analysis.forcedAlignment.length} word timings`);
              }
            }
          }
        } catch (refreshErr: any) {
          console.error(`⚠️ Failed to refresh forced alignment: ${refreshErr.message}`);
        }
      }

      // Resume from post-processing step (94% = just before final assembly)
      const job = await storage.updateJob(req.params.id, {
        status: 'queued',
        progress: 94,
        errorMessage: undefined,
        retryCount: (existingJob.retryCount || 0) + 1,
      });

      console.log(`🔄 Job ${req.params.id} queued for post-processing resume (${completedClips.length} clips ready)`);
      res.json({ success: true, data: job, message: `Resuming with ${completedClips.length} clips` });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to resume job',
      });
    }
  });


  router.get('/jobs/:id/progress-logs', authMiddleware, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }
      if (job.userId && job.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
      }
      const logs = await storage.getProgressLogs(req.params.id);
      res.json({ success: true, data: logs });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch progress logs',
      });
    }
  });


  router.post('/jobs/:id/cancel', authMiddleware, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }
      if (job.userId && job.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      // Only allow cancelling queued or processing jobs
      if (job.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Cannot cancel completed jobs',
        });
      }

      if (job.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: 'Job is already cancelled',
        });
      }

      if (job.status === 'failed') {
        return res.status(400).json({
          success: false,
          error: 'Cannot cancel failed jobs',
        });
      }

      // Cancel the job - set status to 'cancelled' and clear error message
      const updatedJob = await storage.updateJob(req.params.id, {
        status: 'cancelled',
        errorMessage: undefined,
      });

      res.json({ success: true, data: updatedJob });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to cancel job',
      });
    }
  });


  router.post('/jobs/:id/stop', authMiddleware, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }
      if (job.userId && job.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      if (job.status !== 'processing') {
        return res.status(400).json({
          success: false,
          error: 'Only processing jobs can be stopped',
        });
      }

      const updatedJob = await storage.updateJob(req.params.id, {
        status: 'cancelled',
        errorMessage: 'Stopped by user - clips generated so far are saved',
      });

      // If this is a Unity VEO job, reset the package status
      if (job.mode === 'unity_kling' && job.unityMetadata?.packageId) {
        try {
          await storage.updateUnityContentPackage(job.unityMetadata.packageId, {
            status: 'draft',
          });
        } catch (pkgError) {
          console.warn('Failed to reset package status:', pkgError);
        }
      }

      res.json({ success: true, data: updatedJob });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to stop job',
      });
    }
  });


  // Download job video in 9:16 vertical format (for TikTok/Reels/Shorts)
  router.get('/jobs/:id/download-vertical', authMiddleware, async (req, res) => {
    try {
      const job = await storage.getJob(req.params.id);
      if (!job) {
        return res.status(404).json({
          success: false,
          error: 'Job not found',
        });
      }
      if (job.userId && job.userId !== req.user!.id) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      if (job.status !== 'completed' || !job.videoUrl) {
        return res.status(400).json({
          success: false,
          error: 'Video not available for download',
        });
      }

      // Get the input video path from the videoUrl using centralized storage
      let videoPath: string | null = null;
      if (job.videoUrl.startsWith('/videos/')) {
        const filename = job.videoUrl.replace('/videos/', '');
        videoPath = videoStorage.findVideoFile(filename);
      } else if (job.videoUrl.startsWith('/')) {
        const possiblePath = join(process.cwd(), job.videoUrl.slice(1));
        if (existsSync(possiblePath)) videoPath = possiblePath;
      } else {
        const possiblePath = join(process.cwd(), job.videoUrl);
        if (existsSync(possiblePath)) videoPath = possiblePath;
      }

      if (!videoPath) {
        console.log(`❌ Video file not found for URL: ${job.videoUrl}`);
        return res.status(404).json({
          success: false,
          error: 'Video file not found',
        });
      }

      // Convert to 9:16 vertical format (with caching)
      const outputDir = join(process.cwd(), 'attached_assets', 'vertical_videos');
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }
      const downloadFilename = `${(job.scriptName || 'video').replace(/[^a-zA-Z0-9]/g, '_')}_vertical.mp4`;
      const outputPath = join(outputDir, `${job.id}_vertical.mp4`);

      let verticalPath: string;

      // Check if already converted
      if (existsSync(outputPath)) {
        console.log(`📱 Using cached vertical video for job ${job.id}`);
        verticalPath = outputPath;
      } else {
        console.log(`📱 Converting video to 9:16 vertical format for job ${job.id}`);
        verticalPath = await ffmpegProcessor.convertToVertical(videoPath, outputPath);
      }

      // Stream the vertical video as download
      const stat = statSync(verticalPath);

      res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Length', stat.size);

      const stream = createReadStream(verticalPath);
      stream.pipe(res);
    } catch (error: any) {
      console.error('❌ Vertical download failed:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to convert video to vertical format',
      });
    }
  });


  // Beat Generations endpoints
  router.get('/beats/list', authMiddleware, async (req, res) => {
    try {
      // Fetch jobs that are beat-driven (jobs with "Beat Video" in the name)
      const allJobs = await storage.listJobs();
      const beatVideos = allJobs
        .filter((job) => job.scriptName?.startsWith('Beat Video') && (!job.userId || job.userId === req.user!.id))
        .slice(0, 20) // Limit to 20 most recent
        .map((job) => ({
          id: job.id,
          title: job.scriptName || 'Untitled Beat Video',
          status: job.status,
          createdAt: job.createdAt,
          bpm: job.musicAnalysis?.bpm,
          key: (job.musicAnalysis as any)?.key,
        }));

      res.json({ success: true, data: beatVideos });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to fetch beat videos',
      });
    }
  });


  // Generate single beat with custom parameters (from improved UI)
  router.post('/beats/generate', authMiddleware, async (req, res) => {
    try {
      const {
        beatName,
        style,
        beatDescription,
        lyrics,
        bpm,
        duration,
        aspectRatio,
        includeVisuals,
        autoListForSale,
        price,
        tags,
      } = req.body;

      if (!style) {
        return res.status(400).json({ error: 'Style is required' });
      }

      // Process beat description into enhanced tags/style
      let enhancedStyle = `${style} beat, ${bpm} BPM`;

      if (beatDescription && beatDescription.trim()) {
        // Extract key descriptive words from the description for Suno tags
        const description = beatDescription.toLowerCase();

        // Mood descriptors
        const moods = [
          'dark',
          'moody',
          'uplifting',
          'energetic',
          'chill',
          'aggressive',
          'smooth',
          'dreamy',
          'atmospheric',
          'melancholic',
          'happy',
          'sad',
          'angry',
          'peaceful',
          'intense',
          'mellow',
          'vibrant',
        ];
        const foundMoods = moods.filter((mood) => description.includes(mood));

        // Instrument keywords
        const instruments = [
          '808',
          'bass',
          'synth',
          'piano',
          'guitar',
          'drums',
          'strings',
          'pad',
          'lead',
          'vocal',
          'sample',
          'brass',
          'horn',
        ];
        const foundInstruments = instruments.filter((inst) => description.includes(inst));

        // Time/vibe keywords
        const vibes = [
          'late night',
          'morning',
          'sunset',
          'midnight',
          'summer',
          'winter',
          'rain',
          'storm',
          'city',
          'club',
          'street',
          'underground',
        ];
        const foundVibes = vibes.filter((vibe) => description.includes(vibe));

        // Add extracted tags to style
        if (foundMoods.length > 0) {
          enhancedStyle += `, ${foundMoods.join(', ')}`;
        }
        if (foundInstruments.length > 0) {
          enhancedStyle += `, ${foundInstruments.join(', ')}`;
        }
        if (foundVibes.length > 0) {
          enhancedStyle += `, ${foundVibes.join(' ')} vibes`;
        }

        console.log(
          `🏷️  Extracted tags from description: moods [${foundMoods.join(', ')}], instruments [${foundInstruments.join(', ')}], vibes [${foundVibes.join(', ')}]`,
        );
      }

      // Determine if this is instrumental or has vocals
      const hasLyrics = lyrics && lyrics.trim().length > 0;
      const isInstrumental = !hasLyrics;

      if (hasLyrics) {
        console.log(`🎤 Full song mode: ${lyrics.length} characters of lyrics provided`);
      } else {
        console.log(`🎵 Instrumental mode: No lyrics, pure beat`);
      }

      // Check if user has free credits remaining
      // If user has free credits, only generate audio (no video visuals)
      const willUseCredit = req.user!.freeBeatCreditsRemaining > 0;
      const finalIncludeVisuals = willUseCredit ? false : includeVisuals; // Free credits = audio only

      if (willUseCredit && includeVisuals) {
        console.log(`🎁 User requested visuals but has free credits - generating audio-only beat instead`);
      }

      // For beats: Use single clip mode (1 themed clip looped to match duration)
      // This saves 99.7% cost: $0.10 vs $3.00+ for 30-min video
      const clipCount = finalIncludeVisuals ? 1 : 0; // Always 1 clip for beats with visuals
      const singleClipMode = finalIncludeVisuals; // Enable loop mode for beats

      // Get random animated character theme for this beat
      const visualPrompt = getRandomAnimatedBeatTheme(style);

      // Create job
      const job = await storage.createJob({
        userId: req.user!.id,
        mode: finalIncludeVisuals ? 'music' : 'music', // Always use music mode for beats
        scriptName: beatName || `${style} Beat`,
        scriptContent: enhancedStyle, // Use enhanced style with extracted tags
        lyrics: hasLyrics ? lyrics : undefined, // Store lyrics if provided
        aspectRatio: aspectRatio || '16:9', // Default to 16:9 for beats
        duration: duration, // Store duration at top level for UI display
        clipDuration: 6,
        clipCount,
        autoUpload: false,
        status: 'queued',
        progress: 0,
        musicDescription: enhancedStyle, // Enhanced description for music generation
        metadata: {
          musicStyle: style,
          targetDuration: duration, // Store user's target duration for Suno (in seconds)
          clipDuration: 6,
          isInstrumental: isInstrumental,
          beatDescription: beatDescription || undefined,
          singleClip: singleClipMode, // Enable single clip loop mode
        },
        unityMetadata: {
          packageId: 'beat-generator',
          promptCount: clipCount,
          estimatedCost: finalIncludeVisuals ? clipCount * 0.1 : 0.1,
          topic: 'beat',
          viralScore: 75,
          videoEngine: finalIncludeVisuals ? 'kling' : undefined,
          preparingMusic: true,
          targetBPM: bpm, // Store BPM for reference
          usedFreeCredit: willUseCredit, // Track if this used a free credit
          customVisualPrompt: singleClipMode ? visualPrompt : undefined, // Themed visual for single clip
        },
      } as any);

      // If auto-list is enabled, create marketplace listing
      if (autoListForSale && price) {
        // TODO: Implement auto-listing after job completes
        // This would be handled by job-worker.ts on completion
        console.log(`Will auto-list beat for $${price} after generation`);
      }

      console.log(`✅ Created beat generation job: ${job.id}`);

      const response: any = {
        success: true,
        jobId: job.id,
        data: job,
      };

      // Inform user if free credit was used and visuals were removed
      if (willUseCredit && includeVisuals) {
        response.message = '🎁 Free credit used! Generating audio-only beat. Upgrade to add visuals.';
      }

      res.json(response);
    } catch (error: any) {
      console.error('❌ Beat generation failed:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to generate beat',
      });
    }
  });


  router.post('/beats/generate-batch', authMiddleware, async (req, res) => {
    try {
      const { count, style, bpm, title, duration, aspectRatio, includeVisuals, beatConfigs } = req.body;

      if (!count || count < 1 || count > 50) {
        return res.status(400).json({ success: false, error: 'Count must be between 1 and 50' });
      }

      const finalAspectRatio = aspectRatio || '16:9';
      const finalIncludeVisuals = includeVisuals !== undefined ? includeVisuals : true;

      // Create multiple beat generation jobs
      const jobs = [];

      // If beatConfigs provided (randomized mode), use individual configs
      if (beatConfigs && Array.isArray(beatConfigs) && beatConfigs.length === count) {
        console.log(`🎲 Creating ${count} beats with RANDOMIZED configs`);

        for (let i = 0; i < count; i++) {
          const config = beatConfigs[i];
          const beatDuration = config.duration || 180;
          const is30MinLofi = beatDuration >= 1800;

          // Extract style name from Suno style string (e.g., "trap beats..." -> "trap")
          const styleForVisual = config.style?.toLowerCase().includes('trap')
            ? 'trap'
            : config.style?.toLowerCase().includes('lofi') || config.style?.toLowerCase().includes('lo-fi')
              ? 'lofi'
              : config.style?.toLowerCase().includes('drill')
                ? 'drill'
                : config.style?.toLowerCase().includes('boom')
                  ? 'boom_bap'
                  : config.style?.toLowerCase().includes('ambient')
                    ? 'ambient'
                    : 'custom';

          // Get random animated character theme
          const visualPrompt = getRandomAnimatedBeatTheme(styleForVisual);

          const job = await storage.createJob({
            userId: req.user!.id,
            mode: 'music',
            scriptName: config.beatName || `Beat ${Date.now()}_${i + 1}`,
            scriptContent: config.style || 'lofi hip-hop, chill beats, 80 BPM relaxed groove',
            bpm: config.bpm || null,
            duration: beatDuration,
            status: 'queued',
            progress: 0,
            cost: 0,
            aspectRatio: finalAspectRatio,
            clipDuration: 6,
            clipCount: finalIncludeVisuals ? (is30MinLofi ? 1 : 10) : 0,
            autoUpload: false,
            metadata: is30MinLofi
              ? {
                  targetDuration: beatDuration,
                  singleClip: true,
                }
              : undefined,
            unityMetadata: {
              packageId: 'beat-generator',
              promptCount: finalIncludeVisuals ? (is30MinLofi ? 1 : 10) : 0,
              estimatedCost: finalIncludeVisuals ? (is30MinLofi ? 0.1 : 1.0) : 0.1,
              customVisualPrompt: finalIncludeVisuals ? visualPrompt : undefined,
              musicStyle: styleForVisual,
            } as any,
          } as any);

          jobs.push(job);
        }

        console.log(`✅ Created ${jobs.length} randomized beat jobs (variety mode)`);
      } else {
        // Standard mode: all beats with same settings
        const finalDuration = duration || 180;
        const is30MinLofi = finalDuration >= 1800;

        // Get random animated character theme (different for each beat!)
        for (let i = 0; i < count; i++) {
          const visualPrompt = getRandomAnimatedBeatTheme(style);

          const job = await storage.createJob({
            userId: req.user!.id,
            mode: 'music',
            scriptName: title ? `${title} #${i + 1}` : `Beat ${Date.now()}_${i + 1}`,
            scriptContent: style || 'lofi hip-hop, chill beats, 80 BPM relaxed groove',
            bpm: bpm || null,
            duration: finalDuration,
            status: 'queued',
            progress: 0,
            cost: 0,
            aspectRatio: finalAspectRatio,
            clipDuration: 6,
            clipCount: finalIncludeVisuals ? (is30MinLofi ? 1 : 10) : 0,
            autoUpload: false,
            metadata: is30MinLofi
              ? {
                  targetDuration: finalDuration,
                  singleClip: true,
                }
              : undefined,
            unityMetadata: {
              packageId: 'beat-generator',
              promptCount: finalIncludeVisuals ? (is30MinLofi ? 1 : 10) : 0,
              estimatedCost: finalIncludeVisuals ? (is30MinLofi ? 0.1 : 1.0) : 0.1,
              customVisualPrompt: finalIncludeVisuals ? visualPrompt : undefined,
              musicStyle: style,
            } as any,
          } as any);

          jobs.push(job);
        }

        console.log(`✅ Created ${jobs.length} beat jobs (${finalDuration}s each, visuals: ${finalIncludeVisuals})`);
      }

      res.json({
        success: true,
        message: `Created ${count} beat generation jobs`,
        count: jobs.length,
        data: jobs,
      });
    } catch (error: any) {
      console.error('❌ Batch beat generation failed:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create batch jobs',
      });
    }
  });


  // Generate Daily Beats (5 trap + 1 lofi 30min)
  router.post('/beats/generate-daily', authMiddleware, async (req, res) => {
    try {
      console.log('🎵 Starting Daily Beats generation for user:', req.user?.email);

      const userId = req.user!.id;
      const jobs = [];

      // Trap styles for variety
      const trapStyles = [
        'Dark trap, 140 BPM, heavy 808 bass, crispy hi-hats, menacing synths, atmospheric pads, hard-hitting drums',
        'Chill trap, 145 BPM, atmospheric synths, smooth 808s, crispy hi-hats, dreamy pads, lo-fi aesthetic',
        'Aggressive trap, 150 BPM, distorted 808s, rapid hi-hats, dark synths, intense energy, club banger',
        'Melodic trap, 138 BPM, emotional piano, smooth 808s, atmospheric pads, dreamy vibes, modern trap',
        'Vibrant trap, 142 BPM, colorful synths, bouncy 808s, energetic hi-hats, uplifting pads, party vibes',
      ];

      // Create 5 trap beat jobs
      for (let i = 0; i < 5; i++) {
        const job = await storage.createJob({
          userId,
          scriptName: `Trap Beat ${Date.now()}_${i + 1}`,
          scriptContent: trapStyles[i],
          mode: 'music',
          duration: 240, // 4 minutes
          aspectRatio: '16:9',
          clipDuration: 6,
          clipCount: 10,
          autoUpload: false,
          status: 'queued',
          progress: 0,
        } as any);
        jobs.push(job);
      }

      // Create 1 lofi mix job (30 minutes)
      const lofiStyle =
        'lofi hip-hop, chill study beats, 80 BPM relaxed groove, jazzy chords, vinyl crackle, soft piano, mellow bass, ambient pads, rain sounds, tape hiss, dreamy atmospheric peaceful meditative';
      const lofiJob = await storage.createJob({
        userId,
        scriptName: `Lofi Mix ${Date.now()}`,
        scriptContent: lofiStyle,
        mode: 'music',
        duration: 1800, // 30 minutes
        aspectRatio: '16:9',
        clipDuration: 6,
        clipCount: 1, // Use looping section service
        autoUpload: false,
        status: 'queued',
        progress: 0,
        metadata: {
          targetDuration: 1800, // CRITICAL: Tells job-worker to generate 15 songs × 2min
          singleClip: true, // Use single background clip (saves credits)
        },
      } as any);
      jobs.push(lofiJob);

      console.log(`✅ Created ${jobs.length} daily beat jobs (5 trap + 1 lofi)`);

      res.json({
        success: true,
        message: 'Daily beats generation started',
        count: jobs.length,
        jobs: jobs.map((j) => ({ id: j.id, name: j.scriptName })),
        details: {
          trap: '5 beats (4 minutes each)',
          lofi: '1 mix (30 minutes)',
          totalCost: '$1.20',
          estimatedTime: '30-60 minutes',
        },
      });
    } catch (error: any) {
      console.error('❌ Daily beats generation failed:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to start daily beats generation',
      });
    }
  });


  // Cost calculator endpoint
  router.post('/calculate-cost', async (req, res) => {
    try {
      const { mode, videoCount } = req.body;

      const costPerVideo = mode === 'veo' ? 9.05 : 0.75; // Average for consistent mode
      const totalCost = videoCount * costPerVideo;
      const monthlyProjection = videoCount * 30 * costPerVideo;

      res.json({
        success: true,
        data: {
          mode,
          videoCount,
          costPerVideo,
          totalCost,
          monthlyProjection,
        },
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message || 'Failed to calculate cost',
      });
    }
  });


export default router;
