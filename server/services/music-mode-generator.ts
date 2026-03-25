/**
 * Music Mode Generator - Lightweight video generation for beat-synced content
 *
 * Pipeline:
 * 1. Accept UnityContentPackage with Suno audio
 * 2. Run beat analyzer on audio file
 * 3. Select genre-appropriate visual theme
 * 4. Generate ONE 5-10 second background clip
 * 5. Loop clip to match audio duration
 * 6. Apply beat-reactive FFmpeg effects
 * 7. Overlay karaoke subtitles
 * 8. Return final video path
 *
 * Cost: ~$0.02 (Gemini image) or $0.10 (Kling fallback) vs $1.50 (full Kling mode)
 * Speed: ~7-12s (Gemini+Ken Burns) or 60-180s (Kling fallback)
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join, basename } from 'path';
import { genreThemeMapper } from './genre-theme-mapper';
import { beatEffectsProcessor } from './beat-effects-processor';
import { sunoStyleBandit } from './suno-style-bandit';
import { beatVisualOptimizer } from './beat-visual-optimizer';
import { loopingSectionService } from './looping-section-service';

const execAsync = promisify(exec);

interface UnityPackageInput {
  packageId: string;
  audioFilePath: string;
  audioDuration: number;
  lyrics?: string; // Optional - not needed for instrumental beats
  instrumental?: boolean; // If true, skip karaoke
  sunoStyleTags?: any;
  customVisualPrompt?: string; // Optional - custom themed visual prompt
  singleClip?: boolean; // If true, use only 1 clip looped (saves credits for long videos)
}

interface BeatAnalysisResult {
  filename: string;
  duration: number;
  bpm: number;
  key: string | null;
  segments: Array<{
    type: 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'drop' | 'break';
    start: number;
    end: number;
    energy: number;
    label: string | null;
  }>;
  beats: number[];
  energyCurve: Array<[number, number]>;
  dropPoints: Array<{
    timestamp: number;
    intensity: number;
  }>;
  transitionCandidates: number[];
  metadata: {
    spectralCentroidMean?: number;
    spectralCentroidStd?: number;
    onsetCount?: number;
    energyTrend?: 'building' | 'stable' | 'declining';
    sampleRate?: number;
  };
}

interface MusicModeResult {
  videoPath: string;
  thumbnailPath: string;
  theme: string;
  beatAnalysis: BeatAnalysisResult;
  selectedMusicStyle?: {
    styleId: string;
    styleName: string;
    isExploration: boolean;
    confidence: number;
  };
  optimizedVisual?: {
    style: string;
    expectedCTR: number;
    basedOnSamples: number;
    reasoning: string;
  };
  metadata: {
    loopCount: number;
    videoSource: 'gemini' | 'kling' | 'gradient';
    processingTimeMs: number;
  };
}

export class MusicModeGenerator {
  private tempDir = join(process.cwd(), 'data', 'temp', 'processing');

  /**
   * Execute FFmpeg command with retry logic
   * @param command - FFmpeg command to execute
   * @param timeout - Timeout in milliseconds
   * @param maxRetries - Maximum number of retry attempts
   * @param description - Human-readable description for logging
   */
  private async execFFmpegWithRetry(
    command: string,
    timeout: number,
    maxRetries: number = 3,
    description: string = 'FFmpeg operation',
  ): Promise<{ stdout: string; stderr: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   ${attempt > 1 ? `🔄 Retry ${attempt}/${maxRetries}: ` : ''}${description}`);
        const result = await execAsync(command, { timeout: Math.round(timeout) });
        return result;
      } catch (error: any) {
        lastError = error;
        const isTimeout = error.killed && error.signal === 'SIGTERM';
        const errorMsg = isTimeout ? `Timeout after ${(timeout / 1000).toFixed(0)}s` : error.message?.substring(0, 100);

        console.error(`   ❌ Attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);

        if (attempt < maxRetries) {
          const backoffMs = attempt * 2000; // 2s, 4s, 6s...
          console.log(`   ⏳ Waiting ${backoffMs / 1000}s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }
    }

    // All retries exhausted
    throw new Error(`${description} failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }

  /**
   * Generate Music Mode video from Unity package
   */
  async generateVideo(
    input: UnityPackageInput,
    aspectRatio: '16:9' | '9:16' = '16:9',
    onProgress?: (percent: number, message: string) => void,
  ): Promise<MusicModeResult> {
    const startTime = Date.now();

    console.log(`\n🎵 MUSIC MODE: Starting generation for ${input.packageId}`);
    console.log(`   Audio: ${input.audioFilePath} (${input.audioDuration}s)`);

    // Ensure temp directory exists
    if (!existsSync(this.tempDir)) {
      await execAsync(`mkdir -p ${this.tempDir}`);
    }

    // ============================================
    // THOMPSON SAMPLING: Select music style
    // ============================================
    const selectedStyle = sunoStyleBandit.selectStyle();
    console.log(`\n🎰 THOMPSON SAMPLING: ${selectedStyle.styleName}`);
    console.log(
      `   ${selectedStyle.isExploration ? '🔍 EXPLORATION' : '📈 EXPLOITATION'} | Confidence: ${(selectedStyle.confidence * 100).toFixed(1)}%`,
    );
    console.log(`   Style: ${selectedStyle.fullStylePrompt.substring(0, 80)}...`);

    // ============================================
    // PHASE 1: BEAT ANALYSIS (2-5 seconds)
    // ============================================
    onProgress?.(10, 'Analyzing beats and energy...');
    const beatAnalysis = await this.runBeatAnalyzer(input.audioFilePath);

    console.log(`✅ Beat analysis: ${beatAnalysis.bpm} BPM, ${beatAnalysis.key || 'unknown key'}`);
    console.log(
      `   📊 ${beatAnalysis.segments.length} segments, ${beatAnalysis.beats.length} beats, ${beatAnalysis.dropPoints?.length || 0} drops`,
    );

    // ============================================
    // PHASE 2: VISUAL PROMPT (< 1 second)
    // ============================================
    onProgress?.(20, 'Preparing visual theme...');

    // Determine beat style from Suno style or default to lofi
    const beatStyle = this.extractBeatStyle(selectedStyle.styleName);

    let visualPrompt: string;
    let visualStyle: string;

    // Use custom visual prompt if provided (for themed daily lofi)
    let optimizedVisual: any = null;

    if (input.customVisualPrompt) {
      visualPrompt = input.customVisualPrompt;
      visualStyle = 'custom-themed';
      console.log(`\n🎨 CUSTOM THEMED VISUAL:`);
      console.log(`   Using provided theme prompt`);
      console.log(`   Prompt: ${visualPrompt.substring(0, 100)}...`);

      // Set default values for return statement
      optimizedVisual = {
        style: 'custom-themed',
        expectedCTR: 3.5,
        basedOnSamples: 0,
        reasoning: 'Using custom visual prompt',
      };
    } else {
      // Get AI-optimized visual prompt based on learned performance data
      optimizedVisual = await beatVisualOptimizer.generateOptimizedPrompt(beatStyle, beatAnalysis.bpm);
      visualPrompt = optimizedVisual.prompt;
      visualStyle = optimizedVisual.style;

      console.log(`\n🎨 AI-OPTIMIZED VISUAL:`);
      console.log(`   Style: ${visualStyle}`);
      console.log(`   Expected CTR: ${optimizedVisual.expectedCTR.toFixed(1)}%`);
      console.log(`   ${optimizedVisual.reasoning}`);
      console.log(`   Prompt: ${visualPrompt.substring(0, 100)}...`);
    }

    // Fallback to genre mapper if needed (but prefer optimized)
    const fallbackTheme = genreThemeMapper.selectTheme({
      bpm: beatAnalysis.bpm,
      key: beatAnalysis.key,
      segments: beatAnalysis.segments,
      energyCurve: beatAnalysis.energyCurve,
      dropPoints: beatAnalysis.dropPoints,
      metadata: beatAnalysis.metadata,
    });

    // ============================================
    // PHASE 3: BACKGROUND VIDEO GENERATION (5-30 seconds)
    // ============================================
    // For long videos (>10 min), generate multiple clips for variety
    // UNLESS singleClip flag is set (saves credits: 1 clip vs 7+ clips for 30-min video)
    // Long video = >10 min audio. Uses multiple Gemini background images for visual variety.
    // Short beats (<10 min) use single-clip loop mode (cheaper, faster).
    const isLongVideo = input.audioDuration > 600;
    let loopedVideoPath: string;
    let loopCount: number;
    let clipCount: number = 1; // Track number of clips generated (default: 1)
    let usedPrompt: string = 'gradient fallback'; // Initialize with default to prevent undefined errors
    let videoSource: 'gemini' | 'kling' | 'gradient' = 'gradient'; // Track which source generated the video

    if (isLongVideo) {
      onProgress?.(30, `Generating varied backgrounds (${Math.ceil(input.audioDuration / 270)} clips)...`);

      const multiClipResult = await this.generateMultipleBackgroundVideos(
        visualPrompt,
        aspectRatio,
        input.packageId,
        beatStyle,
        input.audioDuration,
      );

      loopedVideoPath = multiClipResult.videoPath;
      loopCount = multiClipResult.totalLoops;
      clipCount = multiClipResult.clipCount; // Track multi-clip count
      usedPrompt = visualPrompt; // Track the prompt used for multi-clip
      console.log(`✅ Multi-clip video: ${multiClipResult.clipCount} different clips, ${loopCount} total loops`);
    } else {
      // Cost guard check before Kling clip generation
      const { costGuard: cg } = await import('./cost-guard');
      const bgCheck = await cg.canProceed(0.02, 'gemini-background-image', 'gemini');
      if (!bgCheck.allowed) {
        throw new Error(`[Cost Guard] Background generation blocked: ${bgCheck.reason}`);
      }

      onProgress?.(30, `Generating ${visualStyle} background...`);

      // Heartbeat: send periodic progress updates during Kling generation to prevent stall detection
      // Kling polling can take 1-10+ minutes with no updates, triggering the stuck job detector
      let heartbeatCount = 0;
      const heartbeatInterval = setInterval(() => {
        heartbeatCount++;
        onProgress?.(
          30 + Math.min(heartbeatCount, 15),
          `Generating background video (${heartbeatCount * 30}s elapsed)...`,
        );
      }, 30_000); // Every 30 seconds, nudge progress from 30→45%

      let result: { sourceVideoPath: string; usedPrompt: string; source: 'gemini' | 'kling' | 'gradient' };
      try {
        result = await this.generateBackgroundVideo(visualPrompt, aspectRatio, input.packageId, beatStyle);
      } finally {
        clearInterval(heartbeatInterval);
      }

      usedPrompt = result.usedPrompt;
      videoSource = result.source;
      console.log(`✅ Background video: ${result.sourceVideoPath} (source: ${videoSource})`);

      // ============================================
      // PHASE 4: VIDEO LOOPING (10-30 seconds)
      // ============================================
      onProgress?.(50, 'Creating seamless loop...');
      const loopResult = await this.createSeamlessLoop(result.sourceVideoPath, input.audioDuration, input.packageId);

      loopedVideoPath = loopResult.loopedVideoPath;
      loopCount = loopResult.loopCount;
      console.log(`✅ Looped video: ${loopedVideoPath} (${loopCount} loops)`);
    }

    // ============================================
    // PHASE 5: BEAT-REACTIVE EFFECTS (5-15 seconds)
    // ============================================
    onProgress?.(65, 'Applying beat effects...');
    const effectsVideoPath = await this.applyBeatEffects(loopedVideoPath, beatAnalysis, input.packageId);

    console.log(`✅ Beat effects applied: ${effectsVideoPath}`);

    // ============================================
    // PHASE 6: KARAOKE SUBTITLES (15-45 seconds) - Skip if instrumental
    // ============================================
    let finalVideoPath: string;

    // ✅ HYBRID MODE: Check for instrumental markers (should not render as karaoke)
    // Detect: old filler phrases, [Instrumental] tags, and new musical notation markers
    const isFillerLyrics =
      input.lyrics &&
      (input.lyrics.includes('[Instrumental]') || // Clean instrumental tags
        input.lyrics.includes('♪') || // NEW: Musical notation markers
        input.lyrics.includes('♫') ||
        (input.lyrics.includes('...') && input.lyrics.includes('~~~')) || // Combined markers
        input.lyrics.includes('Flowing with the rhythm') || // OLD: Verbose filler phrases
        input.lyrics.includes('Lost in the melody now') ||
        input.lyrics.includes('Drifting through the sound'));

    if (isFillerLyrics) {
      console.log(`⚠️  Detected instrumental markers (${input.lyrics?.length || 0} chars) - treating as instrumental`);
    }

    if (input.instrumental || !input.lyrics || isFillerLyrics) {
      // INSTRUMENTAL MODE: Skip karaoke, just combine video + audio
      onProgress?.(80, 'Combining video with audio...');
      // Report 85% just before the long FFmpeg combine to keep stall detector happy
      onProgress?.(85, `Encoding final video (${Math.round(input.audioDuration)}s audio)...`);
      finalVideoPath = await this.combineVideoAudio(
        effectsVideoPath,
        input.audioFilePath,
        input.packageId,
        input.audioDuration,
      );
      console.log(`✅ Final video (instrumental): ${finalVideoPath}`);
    } else {
      // LYRICAL MODE: Add karaoke
      onProgress?.(80, 'Generating beat-synced karaoke...');
      finalVideoPath = await this.addKaraokeSubtitles(
        effectsVideoPath,
        input.audioFilePath,
        input.lyrics,
        beatAnalysis,
        input.packageId,
        input.audioDuration,
        onProgress,
      );
      console.log(`✅ Final video (with karaoke): ${finalVideoPath}`);
    }

    // ============================================
    // PHASE 7: THUMBNAIL GENERATION (2-5 seconds)
    // ============================================
    onProgress?.(95, 'Generating thumbnail...');
    const thumbnailPath = await this.generateThumbnail(finalVideoPath, input.packageId);

    console.log(`✅ Thumbnail: ${thumbnailPath}`);

    const processingTimeMs = Date.now() - startTime;
    console.log(`\n🎉 Music Mode complete! Total time: ${(processingTimeMs / 1000).toFixed(1)}s`);

    onProgress?.(100, 'Complete!');

    return {
      videoPath: finalVideoPath,
      thumbnailPath,
      theme: optimizedVisual.style,
      beatAnalysis,
      selectedMusicStyle: {
        styleId: selectedStyle.styleId,
        styleName: selectedStyle.styleName,
        isExploration: selectedStyle.isExploration,
        confidence: selectedStyle.confidence,
      },
      optimizedVisual: {
        style: optimizedVisual.style,
        expectedCTR: optimizedVisual.expectedCTR,
        basedOnSamples: optimizedVisual.basedOnSamples,
        reasoning: optimizedVisual.reasoning,
      },
      metadata: {
        loopCount,
        clipCount,
        videoSource,
        processingTimeMs,
      } as any,
    };
  }

  /**
   * Extract beat style from Suno style name
   */
  private extractBeatStyle(styleName: string): string {
    const lowerStyle = styleName.toLowerCase();

    if (lowerStyle.includes('lofi') || lowerStyle.includes('lo-fi') || lowerStyle.includes('chill')) {
      return 'lofi';
    }
    if (lowerStyle.includes('trap') || lowerStyle.includes('hip hop') || lowerStyle.includes('rap')) {
      return 'trap';
    }
    if (lowerStyle.includes('chillhop') || lowerStyle.includes('study')) {
      return 'chillhop';
    }

    // Default to lofi if unknown
    return 'lofi';
  }

  /**
   * Run Python beat_analyzer module on audio file
   */
  private async runBeatAnalyzer(audioPath: string): Promise<BeatAnalysisResult> {
    if (!existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const scriptDir = join(process.cwd(), 'scripts');
    const pythonPath = process.env.PYTHON_PATH || join(process.cwd(), 'venv', 'bin', 'python');

    try {
      console.log(`   Running: ${pythonPath} -m beat_analyzer.cli "${audioPath}" --quiet`);

      const { stdout, stderr } = await execAsync(
        `cd ${scriptDir} && ${pythonPath} -m beat_analyzer.cli "${audioPath}" --quiet`,
        {
          timeout: 120000, // 2 minutes max (librosa is slow on first load)
          maxBuffer: 10 * 1024 * 1024, // 10MB
        },
      );

      if (stderr && !stderr.includes('UserWarning')) {
        console.warn(`   ⚠️ Beat analyzer warnings: ${stderr}`);
      }

      const result: BeatAnalysisResult = JSON.parse(stdout);
      return result;
    } catch (error: any) {
      console.error(`❌ Beat analysis failed: ${error.message}`);
      if (error.stderr) {
        console.error(`   stderr: ${error.stderr}`);
      }
      if (error.stdout) {
        console.error(`   stdout: ${error.stdout}`);
      }

      // FALLBACK: Return basic beat analysis
      console.warn(`   ⚠️ Falling back to basic beat estimation`);
      return {
        filename: audioPath,
        duration: 120,
        bpm: 95,
        key: null,
        segments: [{ type: 'verse', start: 0, end: 60, energy: 0.5, label: null }],
        beats: Array.from({ length: 190 }, (_, i) => i * 0.63), // ~95 BPM
        energyCurve: [],
        dropPoints: [],
        transitionCandidates: [],
        metadata: { energyTrend: 'stable' },
      };
    }
  }

  /**
   * Generate a background image using Gemini native image generation
   * Returns path to saved PNG file
   */
  private async generateBackgroundImage(prompt: string, jobId: string): Promise<string> {
    const outputPath = `/tmp/unity-scratch/bg_img_${jobId}.png`;

    console.log(`   🎨 Generating background image with Gemini...`);

    const { GoogleGenAI } = await import('@google/genai');
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found for image generation');

    const genai = new GoogleGenAI({ apiKey });

    const imagePrompt = `${prompt}. High quality, no text, no watermarks, no logos, cinematic composition, 8K resolution.`;

    const response = await Promise.race([
      genai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: imagePrompt,
        config: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini image generation timed out after 30s')), 30000),
      ),
    ]);

    // Extract base64 image from response
    let imageBase64 = '';
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          imageBase64 = part.inlineData.data;
          break;
        }
      }
    }

    if (!imageBase64) {
      throw new Error('No image data returned from Gemini image generation');
    }

    // Save to file
    const fs = await import('fs');
    await execAsync('mkdir -p /tmp/unity-scratch');
    fs.writeFileSync(outputPath, Buffer.from(imageBase64, 'base64'));

    // Track cost
    const { apiCostTracker } = await import('./api-cost-tracker');
    await apiCostTracker.trackGemini({
      model: 'gemini-2.5-flash-image',
      operation: 'generateBackgroundImage',
      inputTokens: Math.ceil(imagePrompt.length / 4),
      outputTokens: 0,
      success: true,
      metadata: { jobId, promptLength: imagePrompt.length },
    });

    console.log(`   ✅ Gemini image saved: ${outputPath}`);
    return outputPath;
  }

  /**
   * Convert a static image to a 5-second video with Ken Burns zoom/pan effect
   */
  private async imageToVideoWithKenBurns(
    imagePath: string,
    aspectRatio: '16:9' | '9:16',
    jobId: string,
  ): Promise<string> {
    const outputPath = join(this.tempDir, `bg_${jobId}.mp4`);
    const dimensions = aspectRatio === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };

    const durationFrames = 5 * 25; // 5 seconds at 25fps = 125 frames
    const fps = 25;

    // Randomly select a Ken Burns effect
    const effects = [
      // Zoom in (1.0x → 1.15x)
      `zoompan=z='1+0.0012*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationFrames}:s=${dimensions.width}x${dimensions.height}:fps=${fps}`,
      // Zoom out (1.15x → 1.0x)
      `zoompan=z='1.15-0.0012*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${durationFrames}:s=${dimensions.width}x${dimensions.height}:fps=${fps}`,
      // Pan left to right
      `zoompan=z='1.1':x='(iw/zoom-ow)/2+((iw/zoom-ow)/2)*sin(in/${durationFrames}*PI)':y='ih/2-(ih/zoom/2)':d=${durationFrames}:s=${dimensions.width}x${dimensions.height}:fps=${fps}`,
      // Pan right to left
      `zoompan=z='1.1':x='(iw/zoom-ow)/2-((iw/zoom-ow)/2)*sin(in/${durationFrames}*PI)':y='ih/2-(ih/zoom/2)':d=${durationFrames}:s=${dimensions.width}x${dimensions.height}:fps=${fps}`,
      // Diagonal drift (top-left to bottom-right)
      `zoompan=z='1.08':x='(iw/zoom-ow)*in/${durationFrames}':y='(ih/zoom-oh)*in/${durationFrames}':d=${durationFrames}:s=${dimensions.width}x${dimensions.height}:fps=${fps}`,
      // Zoom in + pan right
      `zoompan=z='1+0.001*in':x='(iw/zoom-ow)/2+((iw/zoom-ow)/4)*in/${durationFrames}':y='ih/2-(ih/zoom/2)':d=${durationFrames}:s=${dimensions.width}x${dimensions.height}:fps=${fps}`,
    ];

    const selectedEffect = effects[Math.floor(Math.random() * effects.length)];
    const effectNames = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'diagonal-drift', 'zoom+pan'];
    const effectIndex = effects.indexOf(selectedEffect);
    console.log(`   🎬 Ken Burns effect: ${effectNames[effectIndex]}`);

    const command =
      `ffmpeg -loop 1 -i "${imagePath}" ` +
      `-vf "${selectedEffect},format=yuv420p" ` +
      `-c:v libx264 -preset fast -crf 18 -pix_fmt yuv420p ` +
      `-t 5 "${outputPath}" -y`;

    await this.execFFmpegWithRetry(command, 60000, 3, 'Converting image to Ken Burns video');

    console.log(`   ✅ Ken Burns video: ${outputPath} (5s, ${dimensions.width}x${dimensions.height})`);
    return outputPath;
  }

  /**
   * Generate background video with fallback chain:
   * 1. Gemini image + Ken Burns (primary, ~$0.02, ~7s)
   * 2. Kling video (fallback, $0.10, 60-180s)
   * 3. Gradient FFmpeg (final fallback, free, 1s)
   */
  private async generateBackgroundVideo(
    prompt: string,
    aspectRatio: '16:9' | '9:16',
    jobId: string,
    beatStyle: string,
  ): Promise<{ sourceVideoPath: string; usedPrompt: string; source: 'gemini' | 'kling' | 'gradient' }> {
    const outputPath = join(this.tempDir, `bg_${jobId}.mp4`);

    console.log(`   🎨 Generating ${beatStyle} background...`);
    console.log(`   📝 Prompt: ${prompt}`);

    // === PRIMARY: Gemini Image + Ken Burns ===
    try {
      console.log(`   🚀 Attempting Gemini Image + Ken Burns (fast path)...`);
      const imagePath = await this.generateBackgroundImage(prompt, jobId);
      const videoPath = await this.imageToVideoWithKenBurns(imagePath, aspectRatio, jobId);
      console.log(`   ✅ Gemini + Ken Burns complete (~$0.02, fast)`);
      return { sourceVideoPath: videoPath, usedPrompt: prompt, source: 'gemini' };
    } catch (geminiError: any) {
      console.error(`   ❌ Gemini image generation failed: ${geminiError.message}`);
      console.log(`   ⚠️ Falling back to Kling video generation...`);
    }

    // === FALLBACK 1: Kling Video ===
    try {
      const { klingVideoGenerator } = await import('./kling-video-generator');

      const klingResult = await klingVideoGenerator.generateSingleClip(prompt, {
        prompt: prompt,
        duration: 15,
        aspectRatio: aspectRatio,
      });

      if (!klingResult || !klingResult.success || !klingResult.localPath) {
        throw new Error('Kling generation failed - no local path returned');
      }

      const fs = await import('fs');
      fs.copyFileSync(klingResult.localPath, outputPath);

      console.log(`   ✅ Kling fallback video generated (5s, ${aspectRatio})`);
      return { sourceVideoPath: outputPath, usedPrompt: prompt, source: 'kling' };
    } catch (klingError: any) {
      console.error(`   ❌ Kling generation also failed: ${klingError.message}`);
      console.log(`   ⚠️ Falling back to gradient video...`);
    }

    // === FALLBACK 2: Gradient FFmpeg ===
    const dimensions = aspectRatio === '9:16' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };

    const color1 = this.getRandomHexColor();
    const color2 = this.getRandomHexColor();

    const gradientFilter = [
      `color=c=${color1}:s=${dimensions.width}x${dimensions.height}:d=5`,
      `format=yuv420p`,
      `geq=lum='p(X,Y)':cr='128+((X/${dimensions.width})*127)':cb='128+((Y/${dimensions.height})*127)'`,
    ].join(',');

    await this.execFFmpegWithRetry(
      `ffmpeg -f lavfi -i "${gradientFilter}" ` +
        `-t 5 -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p ` +
        `"${outputPath}" -y`,
      60000,
      3,
      'Generating gradient fallback video',
    );

    console.log(`   ✅ Gradient fallback generated (5s, ${dimensions.width}x${dimensions.height})`);
    return { sourceVideoPath: outputPath, usedPrompt: 'gradient fallback', source: 'gradient' };
  }

  /**
   * Generate multiple different background videos for long compilations
   * to prevent visual repetition (45-min videos shouldn't loop the same 5s clip)
   * NOW WITH MASSIVE VISUAL VARIETY!
   */
  private async generateMultipleBackgroundVideos(
    basePrompt: string,
    aspectRatio: '16:9' | '9:16',
    jobId: string,
    beatStyle: string,
    targetDuration: number,
  ): Promise<{ videoPath: string; clipCount: number; totalLoops: number }> {
    // Calculate how many different clips to generate
    // One unique clip per 180-270 seconds (3-4.5 minutes)
    const secondsPerClip = 270; // Each clip covers 4.5 minutes
    const clipCount = Math.ceil(targetDuration / secondsPerClip);

    console.log(`\n🎬 MULTI-CLIP GENERATION FOR LONG VIDEO`);
    console.log(`   Target duration: ${targetDuration}s (${(targetDuration / 60).toFixed(1)} min)`);
    console.log(`   Generating ${clipCount} different clips for MASSIVE VARIETY\n`);

    // Use visual variety engine to generate UNIQUE prompts for each clip
    const { visualVarietyEngine } = await import('./visual-variety-engine.js');

    const visualPrompts = visualVarietyEngine.generateBatchPrompts(clipCount, {
      beatStyle,
      bpm: 90, // Default BPM for multi-clip
      energy: 0.5,
    });

    // Generate multiple clips with UNIQUE prompts
    const clipPaths: string[] = [];

    for (let i = 0; i < clipCount; i++) {
      const visualPrompt = visualPrompts[i];

      console.log(`   🎨 Clip ${i + 1}/${clipCount}:`);
      console.log(`      Theme: ${visualPrompt.theme}`);
      console.log(`      Colors: ${visualPrompt.colorPalette}`);
      console.log(`      Lighting: ${visualPrompt.lighting}`);

      try {
        const { sourceVideoPath } = await this.generateBackgroundVideo(
          visualPrompt.prompt,
          aspectRatio,
          `${jobId}_clip${i}`,
          beatStyle,
        );
        clipPaths.push(sourceVideoPath);
      } catch (error: any) {
        console.error(`   ❌ Failed to generate clip ${i + 1}: ${error.message}`);
        // Continue with other clips even if one fails
      }
    }

    if (clipPaths.length === 0) {
      throw new Error('Failed to generate any background clips');
    }

    console.log(`\n   ✅ Generated ${clipPaths.length} unique clips`);

    // Now loop each clip and concatenate them
    const segmentDuration = targetDuration / clipPaths.length;
    const loopedSegments: string[] = [];
    let totalLoops = 0;

    for (let i = 0; i < clipPaths.length; i++) {
      const segmentPath = join(this.tempDir, `segment_${jobId}_${i}.mp4`);

      // Get clip duration
      const { stdout: probeOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${clipPaths[i]}"`,
      );
      const clipDuration = parseFloat(probeOutput.trim()) || 5;
      const loopsNeeded = Math.ceil(segmentDuration / clipDuration);
      totalLoops += loopsNeeded;

      console.log(`   🔄 Segment ${i + 1}: Looping ${loopsNeeded}x to ${segmentDuration.toFixed(0)}s`);

      // Loop this clip for its segment duration
      if (loopsNeeded === 1) {
        await this.execFFmpegWithRetry(
          `ffmpeg -i "${clipPaths[i]}" -t ${segmentDuration} -c copy "${segmentPath}" -y`,
          60000,
          3,
          `Creating segment ${i + 1}`,
        );
      } else {
        await this.execFFmpegWithRetry(
          `ffmpeg -stream_loop ${loopsNeeded - 1} -i "${clipPaths[i]}" ` +
            `-t ${segmentDuration} -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p ` +
            `"${segmentPath}" -y`,
          600000, // 10 min timeout per segment
          3,
          `Looping segment ${i + 1}`,
        );
      }

      loopedSegments.push(segmentPath);
    }

    // Concatenate all segments into final video
    console.log(`\n   🎬 Concatenating ${loopedSegments.length} segments...`);

    const concatListPath = join(this.tempDir, `concat_${jobId}.txt`);
    const fs = await import('fs');
    const concatList = loopedSegments.map((p) => `file '${p}'`).join('\n');
    fs.writeFileSync(concatListPath, concatList);

    const finalVideoPath = join(this.tempDir, `multiclip_${jobId}.mp4`);

    // Timeout: 6 minutes per minute of target duration
    const concatTimeout = Math.floor((targetDuration / 60) * 360000 + 240000);

    await this.execFFmpegWithRetry(
      `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${finalVideoPath}" -y`,
      concatTimeout,
      3,
      'Concatenating multi-clip video',
    );

    console.log(`   ✅ Multi-clip video complete: ${clipPaths.length} clips, ${totalLoops} total loops\n`);

    return {
      videoPath: finalVideoPath,
      clipCount: clipPaths.length,
      totalLoops: totalLoops,
    };
  }

  /**
   * Create seamless loop of source video to match audio duration
   */
  private async createSeamlessLoop(
    sourceVideoPath: string,
    targetDuration: number,
    jobId: string,
  ): Promise<{ loopedVideoPath: string; loopCount: number }> {
    // Get source video duration
    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${sourceVideoPath}"`,
      { timeout: 30000 }, // 30 seconds for probe
    );

    const sourceDuration = parseFloat(probeOutput.trim()) || 5;
    const loopCount = Math.ceil(targetDuration / sourceDuration);

    console.log(`   🔄 Looping ${sourceDuration}s video × ${loopCount} = ${(sourceDuration * loopCount).toFixed(1)}s`);

    const loopedVideoPath = join(this.tempDir, `looped_${jobId}.mp4`);

    if (loopCount === 1) {
      // No loop needed - just trim to target duration
      await this.execFFmpegWithRetry(
        `ffmpeg -i "${sourceVideoPath}" -t ${targetDuration} -c copy "${loopedVideoPath}" -y`,
        60000, // 1 minute timeout
        3,
        'Trimming video to target duration',
      );
    } else {
      // Use parallel segment looping for 10-20x speed boost
      console.log(`   🚀 Using parallel segment looping (${loopCount} loops total)`);
      await loopingSectionService.loopClipParallel(sourceVideoPath, targetDuration, loopedVideoPath);
    }

    return { loopedVideoPath, loopCount };
  }

  /**
   * Apply beat-reactive visual effects to looped video
   */
  private async applyBeatEffects(videoPath: string, beatAnalysis: BeatAnalysisResult, jobId: string): Promise<string> {
    const effectsVideoPath = join(this.tempDir, `effects_${jobId}.mp4`);

    // Generate FFmpeg filtergraph
    const effectsFilter = beatEffectsProcessor.generateEffectsFilter(
      {
        bpm: beatAnalysis.bpm,
        beats: beatAnalysis.beats,
        segments: beatAnalysis.segments,
        energyCurve: beatAnalysis.energyCurve,
        dropPoints: beatAnalysis.dropPoints,
      },
      beatAnalysis.duration,
    );

    if (!effectsFilter) {
      // No effects to apply - just copy
      console.log(`   ⚠️ No beat effects generated, copying video`);
      await execAsync(`cp "${videoPath}" "${effectsVideoPath}"`);
      return effectsVideoPath;
    }

    console.log(`   🎬 Applying effects: flash, zoom, shake, glow, color shift`);

    // Apply filtergraph
    await this.execFFmpegWithRetry(
      `ffmpeg -i "${videoPath}" -vf "${effectsFilter}" ` +
        `-c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p ` +
        `"${effectsVideoPath}" -y`,
      360000, // 6 min max (doubled from 3 min)
      3,
      'Applying beat-reactive visual effects',
    );

    return effectsVideoPath;
  }

  /**
   * Combine video with audio (no subtitles) - for instrumental beats
   */
  private async combineVideoAudio(
    videoPath: string,
    audioPath: string,
    jobId: string,
    audioDuration: number,
  ): Promise<string> {
    const finalVideoPath = join(process.cwd(), 'data/videos/renders', `music_${jobId}_${Date.now()}.mp4`);

    // Ensure output directory exists
    await execAsync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

    console.log(`   🎵 Combining video + audio (instrumental mode, no subtitles)`);

    // Simple combine: video + audio
    // Dynamic timeout: 3x video duration (minimum 10 min, max 2 hours)
    const combineTimeout = Math.floor(Math.max(600000, Math.min(audioDuration * 3 * 1000, 7200000)));
    console.log(`   ⏱️  FFmpeg timeout: ${(combineTimeout / 1000).toFixed(0)}s for ${audioDuration.toFixed(0)}s video`);

    await this.execFFmpegWithRetry(
      `ffmpeg -i "${videoPath}" -i "${audioPath}" ` +
        `-map 0:v:0 -map 1:a:0 ` +
        `-c:v copy ` + // Copy video stream (no re-encode, instant!)
        `-c:a aac -b:a 192k ` +
        `-movflags +faststart ` +
        `-t ${audioDuration} -shortest ` +
        `"${finalVideoPath}" -y`,
      combineTimeout, // Dynamic: 3x video duration (min 10 min, max 2 hours)
      3,
      'Combining video with audio (instrumental)',
    );

    return finalVideoPath;
  }

  /**
   * Add karaoke subtitles with beat-sync to video
   */
  private async addKaraokeSubtitles(
    videoPath: string,
    audioPath: string,
    lyrics: string,
    beatAnalysis: BeatAnalysisResult,
    jobId: string,
    audioDuration: number,
    onProgress?: (percent: number, message: string) => void,
  ): Promise<string> {
    const finalVideoPath = join(process.cwd(), 'data/videos/renders', `music_${jobId}_${Date.now()}.mp4`);

    // Ensure output directory exists
    await execAsync(`mkdir -p ${join(process.cwd(), 'data/videos/renders')}`);

    // Use existing FFmpeg processor for karaoke (reuse existing logic)
    const { ffmpegProcessor } = await import('./ffmpeg-processor');

    // Parse lyrics into words with beat timing
    const words = this.distributeWordsOnBeats(lyrics, beatAnalysis.beats);

    // Generate ASS subtitle file
    const subtitlePath = join(this.tempDir, `karaoke_${jobId}.ass`);
    await ffmpegProcessor.generateKaraokeSubtitles(
      words as any, // word-level timing array
      subtitlePath,
      'glow', // Style: bounce, glow, fire, neon, minimal
      1080, // videoWidth
      1920, // videoHeight
      2, // linesPerScreen
      beatAnalysis.beats,
      lyrics, // originalLyrics
      audioDuration,
    );

    console.log(`   📝 Karaoke subtitles: ${words.length} words on ${beatAnalysis.beats.length} beats`);

    // Report progress before the long FFmpeg encode to keep stall detector happy
    onProgress?.(85, `Encoding video with karaoke subtitles (${Math.round(audioDuration)}s)...`);

    // Combine video + audio + subtitles
    // Dynamic timeout: 3x video duration (minimum 10 min, max 2 hours)
    const combineTimeout = Math.floor(Math.max(600000, Math.min(audioDuration * 3 * 1000, 7200000)));
    console.log(`   ⏱️  FFmpeg timeout: ${(combineTimeout / 1000).toFixed(0)}s for ${audioDuration.toFixed(0)}s video`);

    await this.execFFmpegWithRetry(
      `ffmpeg -i "${videoPath}" -i "${audioPath}" -vf "ass='${subtitlePath}'" ` +
        `-map 0:v:0 -map 1:a:0 ` +
        `-c:v h264_nvenc -preset p7 -pix_fmt yuv420p ` + // GPU encoding with p7 (fast!)
        `-c:a aac -b:a 192k ` +
        `-movflags +faststart ` +
        `-t ${audioDuration} -shortest ` +
        `"${finalVideoPath}" -y`,
      combineTimeout, // Dynamic: 3x video duration (min 10 min, max 2 hours)
      3,
      'Combining video with audio and karaoke subtitles',
    );

    return finalVideoPath;
  }

  /**
   * Distribute lyric words evenly across beat timestamps
   */
  private distributeWordsOnBeats(lyrics: string, beats: number[]): Array<{ word: string; start: number; end: number }> {
    // Remove section markers and split into words
    const words = lyrics
      .replace(/\[.*?\]/g, '')
      .replace(/\n+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0 || beats.length === 0) {
      return [];
    }

    // Distribute words across beats
    const result: Array<{ word: string; start: number; end: number }> = [];
    const beatsPerWord = beats.length / words.length;

    for (let i = 0; i < words.length; i++) {
      const beatIndex = Math.min(Math.floor(i * beatsPerWord), beats.length - 1);
      const nextBeatIndex = Math.min(Math.floor((i + 1) * beatsPerWord), beats.length - 1);

      const start = beats[beatIndex];
      const end = nextBeatIndex > beatIndex ? beats[nextBeatIndex] : start + 0.4;

      result.push({ word: words[i], start, end });
    }

    return result;
  }

  /**
   * Generate thumbnail from video
   */
  private async generateThumbnail(videoPath: string, jobId: string): Promise<string> {
    const thumbnailPath = join(process.cwd(), 'data/thumbnails', `${jobId}_thumbnail.jpg`);

    // Ensure output directory exists
    await execAsync(`mkdir -p ${join(process.cwd(), 'data/thumbnails')}`);

    // Extract frame at 25% through video
    await execAsync(
      `ffmpeg -i "${videoPath}" -ss 00:00:05 -vframes 1 ` +
        `-vf "scale=1920:1080:force_original_aspect_ratio=decrease" ` +
        `"${thumbnailPath}" -y`,
      { timeout: 30000 },
    );

    return thumbnailPath;
  }

  /**
   * Generate random hex color for gradient (purple-shifted for lofi aesthetic)
   */
  private getRandomHexColor(): string {
    const colors = [
      '0x533483', // Purple
      '0x6a4c93', // Medium purple
      '0x4a4069', // Dark purple
      '0x5e4b8b', // Purple-blue
      '0x6b5b95', // Lavender purple
      '0x4b3869', // Deep purple
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

// Singleton export
export const musicModeGenerator = new MusicModeGenerator();
