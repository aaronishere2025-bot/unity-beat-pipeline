/**
 * Kling Routes
 *
 * Kling prompt optimizer, visual quality reward, hill-climbing optimization.
 */

import { Router } from 'express';
import { storage } from '../storage';
import { db } from '../db';
import { klingVideoGenerator } from '../services/kling-video-generator';
import { generateStoryPrompts } from '../services/historical-story-system';


const router = Router();




  // Test Kling video generation with a prompt
  router.post('/test-kling', async (req, res) => {
    try {
      const { prompt, aspectRatio = '16:9' } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, error: 'Prompt is required' });
      }

      // Check if Kling is enabled
      if (!klingVideoGenerator.isEnabled()) {
        return res.status(400).json({
          success: false,
          error: 'Kling AI is not enabled. Check KLING_ACCESS_KEY and KLING_SECRET_KEY secrets.',
        });
      }

      console.log(`🎬 Testing Kling video generation with prompt: "${prompt.substring(0, 50)}..."`);

      // Generate a single test clip
      const result = await klingVideoGenerator.generateSingleClip(prompt, {
        aspectRatio: aspectRatio as '16:9' | '9:16',
        duration: 5,
      });

      res.json({
        success: true,
        data: {
          videoUrl: result.videoUrl,
          localPath: result.localPath,
          cost: result.cost,
          duration: 5,
          engine: 'kling',
          prompt: prompt.substring(0, 100),
        },
      });
    } catch (error: any) {
      console.error('Kling test error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Kling AI topic-based automated generation
  router.post('/kling/generate', async (req, res) => {
    try {
      const { figure, topicId, topicName, era, format = 'tiktok_9_16' } = req.body;

      if (!figure) {
        return res.status(400).json({ success: false, error: 'Historical figure is required' });
      }

      // Check if Kling is enabled
      if (!klingVideoGenerator.isEnabled()) {
        return res.status(400).json({
          success: false,
          error: 'Kling AI is not enabled. Check KLING_ACCESS_KEY and KLING_SECRET_KEY secrets.',
        });
      }

      console.log(`\n🎬 KLING TOPIC GENERATION: ${figure}`);
      console.log(`   Topic: ${topicName} (${era})`);
      console.log(`   Format: ${format}`);

      // Determine aspect ratio from format
      let aspectRatio: '9:16' | '16:9' | '1:1' = '9:16';
      if (format === 'youtube_16_9') aspectRatio = '16:9';
      else if (format === 'instagram_1_1') aspectRatio = '1:1';

      // 180 second hard cap = 36 clips at 5s each
      const maxDuration = 180;
      const clipDuration = 5;
      const totalClips = Math.floor(maxDuration / clipDuration);

      // Generate story prompts using historical story system
      const { prompts, stats } = generateStoryPrompts(figure, totalClips, clipDuration);

      console.log(`   Generated ${prompts.length} prompts`);
      console.log(`   Estimated cost: $${(prompts.length * klingVideoGenerator.getCostPerClip()).toFixed(2)}`);

      // Create content package for tracking
      const packageData = {
        topic: figure,
        topicId,
        topicName,
        era,
        format,
        timing: {
          totalDurationSeconds: prompts.length * clipDuration,
          formattedDuration: `${Math.floor((prompts.length * clipDuration) / 60)}:${((prompts.length * clipDuration) % 60).toString().padStart(2, '0')}`,
          totalVeoClips: prompts.length,
        },
        veoPrompts: prompts.map((p, idx) => ({
          section: p.action,
          prompt: p.prompt,
          durationSeconds: clipDuration,
          clipCount: 1,
          timestampFormatted: p.timestamp,
        })),
        characterStats: stats,
      };

      // Save as Unity content package
      const savedPackage = await storage.createUnityContentPackage({
        topic: `${figure} - Kling Auto`,
        script: `Automated Kling generation for ${figure} (${topicName}, ${era})`,
        status: 'generating',
        packageData: packageData as any,
      } as any);

      // Create background job for Kling generation
      const job = await storage.createJob({
        scriptName: `${figure} - Kling Topic`,
        scriptContent: `Automated Kling generation: ${figure} (${topicName})`,
        mode: 'unity_kling',
        aspectRatio: aspectRatio as '16:9' | '9:16',
        clipCount: prompts.length,
        unityMetadata: {
          packageId: savedPackage.id,
          promptCount: prompts.length,
          estimatedCost: prompts.length * klingVideoGenerator.getCostPerClip(),
          videoEngine: 'kling',
          topicId,
          topicName,
          era,
        } as any,
      } as any);

      // Update package with job reference
      await storage.updateUnityContentPackage(savedPackage.id, {
        packageData: {
          ...packageData,
          jobId: job.id,
        },
      } as any);

      console.log(`   ✅ Job created: ${job.id}`);
      console.log(`   ✅ Package created: ${savedPackage.id}`);

      res.json({
        success: true,
        data: {
          jobId: job.id,
          packageId: savedPackage.id,
          figure,
          topic: topicName,
          era,
          clipCount: prompts.length,
          estimatedCost: prompts.length * klingVideoGenerator.getCostPerClip(),
          estimatedDuration: prompts.length * clipDuration,
          aspectRatio,
        },
      });
    } catch (error: any) {
      console.error('Kling generate error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // KLING 2.5 PROMPT OPTIMIZER ENDPOINTS
  // Optimized prompting for Kling's DiT architecture
  // ============================================================================

  // Build an optimized Kling 2.5 prompt with 6-element template
  router.post('/kling25/build-prompt', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { subject, action, era, setting, options } = req.body;

      if (!subject || !action || !era || !setting) {
        return res.status(400).json({
          success: false,
          error: 'subject, action, era, and setting required',
        });
      }

      const prompt = kling25PromptOptimizer.buildBasePrompt(subject, action, era, setting, options || {});

      const analysis = kling25PromptOptimizer.analyzePromptStructure(prompt);

      res.json({
        success: true,
        data: { prompt, analysis },
      });
    } catch (error: any) {
      console.error('Kling 2.5 build prompt error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Apply feedback corrections to a prompt (retry optimization)
  router.post('/kling25/apply-corrections', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { originalPrompt, feedback, attemptNumber } = req.body;

      if (!originalPrompt || !feedback) {
        return res.status(400).json({
          success: false,
          error: 'originalPrompt and feedback required',
        });
      }

      const result = kling25PromptOptimizer.assembleRetryPrompt(originalPrompt, feedback, attemptNumber || 2);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Kling 2.5 corrections error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Analyze a prompt's structure for Kling 2.5 optimization
  router.post('/kling25/analyze-prompt', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt required' });
      }

      const analysis = kling25PromptOptimizer.analyzePromptStructure(prompt);

      res.json({ success: true, data: analysis });
    } catch (error: any) {
      console.error('Kling 2.5 analyze error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get Kling 2.5 configuration and vocabulary
  router.get('/kling25/config', async (req, res) => {
    try {
      const { KLING_25_CONFIG, KLING_25_NEGATIVE_PROMPTS, KLING_25_SCORING_WEIGHTS } =
        await import('../config/kling-prompting');

      res.json({
        success: true,
        data: {
          cameraMovements: Object.keys(KLING_25_CONFIG.CAMERA_MOVEMENTS),
          shotTypes: Object.keys(KLING_25_CONFIG.SHOT_TYPES),
          lightingStyles: Object.keys(KLING_25_CONFIG.LIGHTING_STYLES),
          physicsKeywords: Object.keys(KLING_25_CONFIG.PHYSICS_KEYWORDS),
          microExpressions: KLING_25_CONFIG.MICRO_EXPRESSION_KEYWORDS,
          negativePrompts: KLING_25_NEGATIVE_PROMPTS,
          scoringWeights: KLING_25_SCORING_WEIGHTS,
        },
      });
    } catch (error: any) {
      console.error('Kling 2.5 config error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Calculate effort-based reward for Thompson Sampling
  router.post('/kling25/calculate-reward', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { passed, attemptNumber } = req.body;

      if (passed === undefined || !attemptNumber) {
        return res.status(400).json({
          success: false,
          error: 'passed and attemptNumber required',
        });
      }

      const reward = kling25PromptOptimizer.calculateEffortReward(passed, attemptNumber);

      res.json({ success: true, data: reward });
    } catch (error: any) {
      console.error('Kling 2.5 reward calculation error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // LITTLE NUGGET VISUAL ANCHOR ENDPOINTS
  // High-motion visual hooks for the first 1.5 seconds of first clip
  // ============================================================================

  // Inject a Little Nugget into a prompt (for first clip only)
  router.post('/kling25/inject-nugget', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { basePrompt, clipIndex, nuggetType } = req.body;

      if (!basePrompt || clipIndex === undefined) {
        return res.status(400).json({
          success: false,
          error: 'basePrompt and clipIndex required',
        });
      }

      const result = kling25PromptOptimizer.injectNugget(basePrompt, clipIndex, nuggetType);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Nugget injection error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get available nugget types
  router.get('/kling25/nugget-types', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');

      // Get all three nugget types
      const types = ['in_media_res', 'abstract_mystery', 'reaction_reveal'].map((type) => {
        const nugget = kling25PromptOptimizer.selectNuggetType(type as any);
        return {
          id: type,
          ...nugget,
        };
      });

      res.json({
        success: true,
        data: {
          types,
          usage: 'Apply to clipIndex=0 only. Nugget creates high-motion 0-1.5s visual anchor.',
        },
      });
    } catch (error: any) {
      console.error('Nugget types error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Calculate nugget quality score for first clip validation
  router.post('/kling25/nugget-score', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { motionDelta, colorSaturation, contextGap } = req.body;

      const result = kling25PromptOptimizer.calculateNuggetScore({
        motionDelta,
        colorSaturation,
        contextGap,
      });

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Nugget score error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Calculate nugget reward based on swipe rate
  router.post('/kling25/nugget-reward', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { swipeRate } = req.body;

      if (swipeRate === undefined) {
        return res.status(400).json({ success: false, error: 'swipeRate required (0-1)' });
      }

      const reward = kling25PromptOptimizer.calculateNuggetReward(swipeRate);

      res.json({ success: true, data: reward });
    } catch (error: any) {
      console.error('Nugget reward error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Enhance prompt based on previous validation scores (score-based reprompting)
  router.post('/kling25/enhance-from-scores', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { prompt, motionDelta, colorSaturation, contextGap, attemptNumber } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt required' });
      }

      const result = kling25PromptOptimizer.repromptWithFeedback(
        prompt,
        { motionDelta, colorSaturation, contextGap },
        attemptNumber || 1,
      );

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Enhance from scores error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Parse GPT-4o Vision audit feedback into technical fixes
  router.post('/kling25/parse-audit', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { auditFeedback } = req.body;

      if (!auditFeedback) {
        return res.status(400).json({ success: false, error: 'auditFeedback required' });
      }

      const result = kling25PromptOptimizer.parseAuditFeedback(auditFeedback);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Parse audit error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Recursive prompt optimization using GPT-4o Vision audit feedback
  router.post('/kling25/recursive-optimize', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { prompt, score, auditFeedback, attemptNumber } = req.body;

      if (!prompt || score === undefined || !auditFeedback) {
        return res.status(400).json({
          success: false,
          error: 'prompt, score, and auditFeedback required',
        });
      }

      const result = kling25PromptOptimizer.recursivePromptOptimize(prompt, score, auditFeedback, attemptNumber || 1);

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Recursive optimize error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Full recursive optimization (combines scores + audit feedback)
  router.post('/kling25/full-optimize', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { prompt, score, auditFeedback, motionDelta, colorSaturation, contextGap, attemptNumber } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt required' });
      }

      const result = kling25PromptOptimizer.fullRecursiveOptimize(
        prompt,
        { score: score || 50, auditFeedback, motionDelta, colorSaturation, contextGap },
        attemptNumber || 1,
      );

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Full optimize error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // ============================================================================
  // HILL-CLIMBING PROMPT OPTIMIZATION ENDPOINTS
  // Evolutionary optimization instead of brute-force retries
  // ============================================================================

  // Check if a score should trigger early fail-out
  router.post('/kling25/should-fail-out', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { score } = req.body;

      if (score === undefined) {
        return res.status(400).json({ success: false, error: 'score required' });
      }

      const result = kling25PromptOptimizer.shouldFailOut(score);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Should fail out error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Detect exponential win (score > 85 + improvement > 15)
  router.post('/kling25/detect-win', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { currentScore, previousScore } = req.body;

      if (currentScore === undefined) {
        return res.status(400).json({ success: false, error: 'currentScore required' });
      }

      const result = kling25PromptOptimizer.detectExponentialWin(currentScore, previousScore || 0);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Detect win error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Extract winning keywords from a high-scoring prompt
  router.post('/kling25/extract-keywords', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({ success: false, error: 'prompt required' });
      }

      const keywords = kling25PromptOptimizer.extractWinningKeywords(prompt);
      res.json({ success: true, data: { keywords, count: keywords.length } });
    } catch (error: any) {
      console.error('Extract keywords error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Lock winning keywords as Master Template for a category
  router.post('/kling25/lock-keywords', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { category, winningPrompt } = req.body;

      if (!category || !winningPrompt) {
        return res.status(400).json({ success: false, error: 'category and winningPrompt required' });
      }

      const result = kling25PromptOptimizer.lockWinningKeywords(category, winningPrompt);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Lock keywords error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Get Master Template for a category
  router.get('/kling25/master-template/:category', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { category } = req.params;

      const template = kling25PromptOptimizer.getMasterTemplate(category);
      res.json({
        success: true,
        data: {
          category,
          template,
          hasTemplate: !!template,
        },
      });
    } catch (error: any) {
      console.error('Get master template error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Inject Master Template into a new prompt
  router.post('/kling25/inject-template', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { prompt, category } = req.body;

      if (!prompt || !category) {
        return res.status(400).json({ success: false, error: 'prompt and category required' });
      }

      const result = kling25PromptOptimizer.injectMasterTemplate(prompt, category);
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Inject template error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


  // Full hill-climbing evaluation
  router.post('/kling25/evaluate-hill-climb', async (req, res) => {
    try {
      const { kling25PromptOptimizer } = await import('../services/kling25-prompt-optimizer');
      const { currentScore, previousScore, currentPrompt, category } = req.body;

      if (currentScore === undefined || !currentPrompt || !category) {
        return res.status(400).json({
          success: false,
          error: 'currentScore, currentPrompt, and category required',
        });
      }

      const result = kling25PromptOptimizer.evaluateHillClimb(
        currentScore,
        previousScore || 0,
        currentPrompt,
        category,
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error('Evaluate hill climb error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });


export default router;
