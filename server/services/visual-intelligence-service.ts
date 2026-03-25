/**
 * Visual Intelligence Service
 *
 * Analyzes thumbnails and video frames using AI vision to provide
 * actionable insights about visual quality, composition, and effectiveness.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { visualAnalysis, detailedVideoMetrics } from '@shared/schema';
import { eq, desc, isNull } from 'drizzle-orm';
import { youtubeUploadService } from './youtube-upload-service';
import { google } from 'googleapis';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);
let _gemini: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

interface ThumbnailAnalysisResult {
  overallScore: number;
  composition: number;
  colorImpact: number;
  textReadability: number;
  emotionalImpact: number;
  curiosityGap: number;
  analysis: {
    dominantColors: string[];
    hasText: boolean;
    textContent?: string;
    facesDetected: number;
    emotionsDetected: string[];
    visualElements: string[];
    composition: string;
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
  };
}

interface FrameAnalysisResult {
  visualQualityScore: number;
  cinematographyScore: number;
  colorGradingScore: number;
  motionQualityScore: number;
  sceneVarietyScore: number;
  analysis: {
    keyFrames: Array<{
      timestamp: number;
      description: string;
      quality: number;
      composition: string;
    }>;
    sceneTransitions: number;
    visualConsistency: number;
    dominantVisualStyle: string;
    colorPalette: string[];
    pacing: 'slow' | 'medium' | 'fast' | 'dynamic';
    cinematicTechniques: string[];
    strengths: string[];
    weaknesses: string[];
  };
}

class VisualIntelligenceService {
  private readonly THUMBNAIL_PROMPT = `You are an expert YouTube thumbnail analyst. Analyze this thumbnail image and provide detailed feedback.

Rate each aspect from 0-100:
1. COMPOSITION (rule of thirds, focal point, visual hierarchy)
2. COLOR IMPACT (contrast, saturation, color psychology)
3. TEXT READABILITY (if text present - size, contrast, clarity)
4. EMOTIONAL IMPACT (expressions, tension, drama)
5. CURIOSITY GAP (how much it makes viewers want to click)

Also identify:
- Dominant colors (list 3-5 hex codes or color names)
- Whether text is present and what it says
- Number of faces detected
- Emotions detected (e.g., "surprise", "anger", "joy")
- Key visual elements (e.g., "fire", "battle", "historical figure")
- Composition style (e.g., "centered", "rule of thirds", "diagonal")
- 3 specific strengths
- 3 specific weaknesses
- 3 actionable improvement suggestions

Respond in JSON format:
{
  "composition": 85,
  "colorImpact": 78,
  "textReadability": 90,
  "emotionalImpact": 72,
  "curiosityGap": 80,
  "dominantColors": ["#FF4500", "#1E1E1E", "#FFD700"],
  "hasText": true,
  "textContent": "VS BATTLE",
  "facesDetected": 2,
  "emotionsDetected": ["determination", "anger"],
  "visualElements": ["historical figures", "fire effects", "sword"],
  "composition": "diagonal tension",
  "strengths": ["High contrast grabs attention", "Clear focal point", "Emotional faces"],
  "weaknesses": ["Text slightly small", "Background too busy", "Missing branding"],
  "improvementSuggestions": ["Increase text size 20%", "Add subtle vignette", "Include channel logo"]
}`;

  private readonly FRAME_ANALYSIS_PROMPT = `You are an expert cinematographer and video quality analyst. Analyze these video frames from a short-form video.

For each frame, evaluate:
1. Visual quality (sharpness, artifacts, resolution)
2. Composition (framing, rule of thirds, leading lines)
3. Color grading (consistency, mood, palette)
4. Motion quality (blur appropriateness, smoothness indicators)

Then provide overall analysis:
- Identify the dominant visual style
- Note any scene transitions visible
- Evaluate visual consistency across frames
- Identify cinematographic techniques used
- List strengths and weaknesses

Rate overall scores 0-100:
- visualQualityScore
- cinematographyScore
- colorGradingScore
- motionQualityScore
- sceneVarietyScore

Respond in JSON format with keyFrames array and overall analysis.`;

  /**
   * Analyze a YouTube video's thumbnail
   */
  async analyzeThumbnail(videoId: string): Promise<ThumbnailAnalysisResult | null> {
    try {
      console.log(`🎨 [Visual Intelligence] Analyzing thumbnail for ${videoId}...`);

      // Get high-quality thumbnail URL
      const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      const fallbackUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      // Try maxres first, fallback to hq
      let imageUrl = thumbnailUrl;
      try {
        const response = await fetch(thumbnailUrl, { method: 'HEAD' });
        if (!response.ok) {
          imageUrl = fallbackUrl;
        }
      } catch {
        imageUrl = fallbackUrl;
      }

      // Fetch image and convert to base64 for Gemini multimodal
      const imageResponse = await fetch(imageUrl);
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const base64Image = imageBuffer.toString('base64');

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500, responseMimeType: 'application/json' },
      });

      const result = await model.generateContent([
        { text: this.THUMBNAIL_PROMPT },
        { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
      ]);

      const content = result.response.text();

      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`⚠️ [Visual Intelligence] Could not parse thumbnail analysis JSON`);
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Calculate overall score
      const overallScore = Math.round(
        (parsed.composition +
          parsed.colorImpact +
          parsed.textReadability +
          parsed.emotionalImpact +
          parsed.curiosityGap) /
          5,
      );

      console.log(`   ✅ Thumbnail score: ${overallScore}/100`);

      return {
        overallScore,
        composition: parsed.composition,
        colorImpact: parsed.colorImpact,
        textReadability: parsed.textReadability || 50,
        emotionalImpact: parsed.emotionalImpact,
        curiosityGap: parsed.curiosityGap,
        analysis: {
          dominantColors: parsed.dominantColors || [],
          hasText: parsed.hasText || false,
          textContent: parsed.textContent,
          facesDetected: parsed.facesDetected || 0,
          emotionsDetected: parsed.emotionsDetected || [],
          visualElements: parsed.visualElements || [],
          composition: parsed.composition || 'unknown',
          strengths: parsed.strengths || [],
          weaknesses: parsed.weaknesses || [],
          improvementSuggestions: parsed.improvementSuggestions || [],
        },
      };
    } catch (error: any) {
      console.error(`❌ [Visual Intelligence] Thumbnail analysis failed:`, error.message);
      return null;
    }
  }

  /**
   * Extract frames from a video file for analysis
   */
  async extractFrames(videoPath: string, numFrames: number = 6): Promise<string[]> {
    const framesDir = path.join('/tmp', 'visual_analysis_frames', Date.now().toString());
    await fs.promises.mkdir(framesDir, { recursive: true });

    try {
      // Get video duration
      const { stdout: durationOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      );
      const duration = parseFloat(durationOutput.trim());

      // Calculate frame timestamps (evenly distributed)
      const framePaths: string[] = [];
      for (let i = 0; i < numFrames; i++) {
        const timestamp = (duration / (numFrames + 1)) * (i + 1);
        const framePath = path.join(framesDir, `frame_${i}.jpg`);

        await execAsync(`ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -q:v 2 "${framePath}" -y 2>/dev/null`);

        if (fs.existsSync(framePath)) {
          framePaths.push(framePath);
        }
      }

      return framePaths;
    } catch (error: any) {
      console.error(`❌ [Visual Intelligence] Frame extraction failed:`, error.message);
      return [];
    }
  }

  /**
   * Analyze video frames for cinematography and visual quality
   */
  async analyzeVideoFrames(videoPath: string): Promise<FrameAnalysisResult | null> {
    try {
      console.log(`🎬 [Visual Intelligence] Analyzing video frames...`);

      // Extract frames
      const framePaths = await this.extractFrames(videoPath, 6);
      if (framePaths.length === 0) {
        console.warn(`⚠️ [Visual Intelligence] No frames extracted`);
        return null;
      }

      // Convert frames to base64 for Gemini multimodal
      const frameContents = await Promise.all(
        framePaths.map(async (fp) => {
          const data = await fs.promises.readFile(fp);
          return { inlineData: { data: data.toString('base64'), mimeType: 'image/jpeg' as const } };
        }),
      );

      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 2000, responseMimeType: 'application/json' },
      });

      const result = await model.generateContent([{ text: this.FRAME_ANALYSIS_PROMPT }, ...frameContents]);

      const content = result.response.text();

      // Parse JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`⚠️ [Visual Intelligence] Could not parse frame analysis JSON`);
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Cleanup temp frames
      for (const fp of framePaths) {
        try {
          await fs.promises.unlink(fp);
        } catch {}
      }

      console.log(`   ✅ Visual quality score: ${parsed.visualQualityScore || 0}/100`);

      return {
        visualQualityScore: parsed.visualQualityScore || 70,
        cinematographyScore: parsed.cinematographyScore || 70,
        colorGradingScore: parsed.colorGradingScore || 70,
        motionQualityScore: parsed.motionQualityScore || 70,
        sceneVarietyScore: parsed.sceneVarietyScore || 70,
        analysis: {
          keyFrames: parsed.keyFrames || [],
          sceneTransitions: parsed.sceneTransitions || 0,
          visualConsistency: parsed.visualConsistency || 70,
          dominantVisualStyle: parsed.dominantVisualStyle || 'unknown',
          colorPalette: parsed.colorPalette || [],
          pacing: parsed.pacing || 'medium',
          cinematicTechniques: parsed.cinematicTechniques || [],
          strengths: parsed.strengths || [],
          weaknesses: parsed.weaknesses || [],
        },
      };
    } catch (error: any) {
      console.error(`❌ [Visual Intelligence] Frame analysis failed:`, error.message);
      return null;
    }
  }

  /**
   * Run full visual analysis for a video
   */
  async analyzeVideo(videoId: string, videoPath?: string): Promise<void> {
    console.log(`🔍 [Visual Intelligence] Starting full analysis for ${videoId}...`);

    // Get video metadata
    const [existingAnalysis] = await db
      .select()
      .from(visualAnalysis)
      .where(eq(visualAnalysis.videoId, videoId))
      .limit(1);

    const [videoMetrics] = await db
      .select()
      .from(detailedVideoMetrics)
      .where(eq(detailedVideoMetrics.videoId, videoId))
      .limit(1);

    // Analyze thumbnail
    const thumbnailResult = await this.analyzeThumbnail(videoId);

    // Analyze video frames if path provided
    let frameResult: FrameAnalysisResult | null = null;
    if (videoPath && fs.existsSync(videoPath)) {
      frameResult = await this.analyzeVideoFrames(videoPath);
    }

    // Calculate overall visual score
    let overallScore = 0;
    let scoreCount = 0;

    if (thumbnailResult) {
      overallScore += thumbnailResult.overallScore;
      scoreCount++;
    }
    if (frameResult) {
      overallScore += (frameResult.visualQualityScore + frameResult.cinematographyScore) / 2;
      scoreCount++;
    }

    overallScore = scoreCount > 0 ? Math.round(overallScore / scoreCount) : 0;

    // Determine visual tier
    let visualTier = 'low';
    if (overallScore >= 85) visualTier = 'excellent';
    else if (overallScore >= 70) visualTier = 'good';
    else if (overallScore >= 50) visualTier = 'average';

    // Upsert to database
    if (existingAnalysis) {
      await db
        .update(visualAnalysis)
        .set({
          title: videoMetrics?.title,
          thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
          thumbnailScore: thumbnailResult?.overallScore,
          thumbnailComposition: thumbnailResult?.composition,
          thumbnailColorImpact: thumbnailResult?.colorImpact,
          thumbnailTextReadability: thumbnailResult?.textReadability,
          thumbnailEmotionalImpact: thumbnailResult?.emotionalImpact,
          thumbnailCuriosityGap: thumbnailResult?.curiosityGap,
          thumbnailAnalysis: thumbnailResult?.analysis,
          frameAnalysisComplete: !!frameResult,
          framesAnalyzed: frameResult ? 6 : 0,
          visualQualityScore: frameResult?.visualQualityScore,
          cinematographyScore: frameResult?.cinematographyScore,
          colorGradingScore: frameResult?.colorGradingScore,
          motionQualityScore: frameResult?.motionQualityScore,
          sceneVarietyScore: frameResult?.sceneVarietyScore,
          frameAnalysis: frameResult?.analysis,
          overallVisualScore: overallScore,
          visualTier,
          analyzedAt: new Date(),
        })
        .where(eq(visualAnalysis.videoId, videoId));
    } else {
      await db.insert(visualAnalysis).values({
        videoId,
        title: videoMetrics?.title,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        thumbnailScore: thumbnailResult?.overallScore,
        thumbnailComposition: thumbnailResult?.composition,
        thumbnailColorImpact: thumbnailResult?.colorImpact,
        thumbnailTextReadability: thumbnailResult?.textReadability,
        thumbnailEmotionalImpact: thumbnailResult?.emotionalImpact,
        thumbnailCuriosityGap: thumbnailResult?.curiosityGap,
        thumbnailAnalysis: thumbnailResult?.analysis,
        frameAnalysisComplete: !!frameResult,
        framesAnalyzed: frameResult ? 6 : 0,
        visualQualityScore: frameResult?.visualQualityScore,
        cinematographyScore: frameResult?.cinematographyScore,
        colorGradingScore: frameResult?.colorGradingScore,
        motionQualityScore: frameResult?.motionQualityScore,
        sceneVarietyScore: frameResult?.sceneVarietyScore,
        frameAnalysis: frameResult?.analysis,
        overallVisualScore: overallScore,
        visualTier,
      });
    }

    console.log(`   ✅ Analysis complete - Overall score: ${overallScore}/100 (${visualTier})`);
  }

  /**
   * Download a YouTube video temporarily using yt-dlp
   * Returns the path to the downloaded video, or null on failure
   */
  async downloadYouTubeVideo(videoId: string): Promise<string | null> {
    const downloadDir = path.join('/tmp', 'visual_analysis_videos');
    await fs.promises.mkdir(downloadDir, { recursive: true });

    const outputPath = path.join(downloadDir, `${videoId}.mp4`);

    try {
      console.log(`📥 [Visual Intelligence] Downloading video ${videoId}...`);

      // Use the latest yt-dlp binary from /tmp/bin (downloaded directly from GitHub)
      // This ensures we have the latest fixes for YouTube's anti-bot measures
      const ytdlpPath = '/tmp/bin/yt-dlp';

      // Check if latest binary exists, if not download it
      if (!fs.existsSync(ytdlpPath)) {
        console.log(`   📥 Downloading latest yt-dlp binary...`);
        await execAsync(
          `mkdir -p /tmp/bin && curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ${ytdlpPath} && chmod +x ${ytdlpPath}`,
          { timeout: 60000 },
        );
      }

      // Download with latest yt-dlp using best available format
      const { stdout, stderr } = await execAsync(
        `${ytdlpPath} ` +
          `-f "worst" ` + // Use lowest quality to save bandwidth and time
          `--retries 3 ` +
          `--fragment-retries 3 ` +
          `-o "${outputPath}" ` +
          `--no-playlist ` +
          `--no-warnings ` +
          `"https://www.youtube.com/watch?v=${videoId}"`,
        { timeout: 180000 }, // 3 minute timeout
      );

      if (fs.existsSync(outputPath)) {
        const stats = await fs.promises.stat(outputPath);
        console.log(`   ✅ Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
        return outputPath;
      } else {
        console.warn(`⚠️ [Visual Intelligence] Download completed but file not found`);
        return null;
      }
    } catch (error: any) {
      console.error(`❌ [Visual Intelligence] Download failed:`, error.message);
      // Cleanup any partial download
      try {
        await fs.promises.unlink(outputPath);
      } catch {}
      return null;
    }
  }

  /**
   * Delete a temporary video file after analysis
   */
  async deleteVideoFile(videoPath: string): Promise<void> {
    try {
      if (fs.existsSync(videoPath)) {
        await fs.promises.unlink(videoPath);
        console.log(`🗑️ [Visual Intelligence] Deleted temporary video file`);
      }
    } catch (error: any) {
      console.warn(`⚠️ [Visual Intelligence] Could not delete video file:`, error.message);
    }
  }

  /**
   * Download, analyze, and auto-delete a YouTube video
   * This enables full frame analysis while keeping disk space clean
   */
  async downloadAnalyzeAndDelete(videoId: string): Promise<{
    success: boolean;
    thumbnailScore?: number;
    visualScore?: number;
    overallScore?: number;
    message: string;
  }> {
    let videoPath: string | null = null;

    try {
      console.log(`🔬 [Visual Intelligence] Deep analysis for ${videoId} (download → analyze → delete)`);

      // Step 1: Download video
      videoPath = await this.downloadYouTubeVideo(videoId);

      // Step 2: Analyze (thumbnail + frames if download succeeded)
      await this.analyzeVideo(videoId, videoPath || undefined);

      // Step 3: Get the saved analysis
      const [analysis] = await db.select().from(visualAnalysis).where(eq(visualAnalysis.videoId, videoId)).limit(1);

      const wasDeepAnalyzed = videoPath !== null && analysis?.frameAnalysisComplete;

      return {
        success: true,
        thumbnailScore: analysis?.thumbnailScore || undefined,
        visualScore: analysis?.visualQualityScore || undefined,
        overallScore: analysis?.overallVisualScore || undefined,
        message: wasDeepAnalyzed
          ? `Deep analysis complete: thumbnail + ${analysis?.framesAnalyzed || 6} frames analyzed`
          : `Thumbnail analysis complete (video download failed, frame analysis skipped)`,
      };
    } catch (error: any) {
      console.error(`❌ [Visual Intelligence] Deep analysis failed:`, error.message);
      return {
        success: false,
        message: `Analysis failed: ${error.message}`,
      };
    } finally {
      // Step 4: Always cleanup video file
      if (videoPath) {
        await this.deleteVideoFile(videoPath);
      }
    }
  }

  /**
   * Batch deep analysis with download → analyze → delete for each video
   */
  async deepAnalyzeAll(limit: number = 5): Promise<{ analyzed: number; errors: number; skipped: number }> {
    console.log(`🔬 [Visual Intelligence] Batch deep analysis starting (max ${limit})...`);

    // Get videos that need frame analysis
    const allAnalysis = await db
      .select()
      .from(visualAnalysis)
      .where(eq(visualAnalysis.frameAnalysisComplete, false))
      .orderBy(desc(visualAnalysis.thumbnailScore))
      .limit(limit);

    // Also get unanalyzed videos from metrics
    const metrics = await db
      .select()
      .from(detailedVideoMetrics)
      .orderBy(desc(detailedVideoMetrics.viewCount))
      .limit(50);

    const analyzedIds = new Set(allAnalysis.map((a) => a.videoId));
    const existingAnalysisIds = new Set(
      (await db.select({ videoId: visualAnalysis.videoId }).from(visualAnalysis)).map((a) => a.videoId),
    );

    // Combine: videos needing frame analysis + unanalyzed videos
    const toAnalyze: string[] = [
      ...allAnalysis.map((a) => a.videoId),
      ...metrics.filter((m) => !existingAnalysisIds.has(m.videoId)).map((m) => m.videoId),
    ].slice(0, limit);

    let successCount = 0;
    let errorCount = 0;
    const skippedCount = 0;

    for (const videoId of toAnalyze) {
      try {
        const result = await this.downloadAnalyzeAndDelete(videoId);

        if (result.success) {
          successCount++;
        } else {
          errorCount++;
        }

        // Rate limit - 3 seconds between downloads to be nice to YouTube
        await new Promise((r) => setTimeout(r, 3000));
      } catch (error: any) {
        console.error(`❌ Failed to deep analyze ${videoId}:`, error.message);
        errorCount++;
      }
    }

    console.log(
      `📊 [Visual Intelligence] Deep batch complete: ${successCount} analyzed, ${errorCount} errors, ${skippedCount} skipped`,
    );
    return { analyzed: successCount, errors: errorCount, skipped: skippedCount };
  }

  /**
   * Analyze all videos that haven't been analyzed yet
   */
  async analyzeAllThumbnails(limit: number = 10): Promise<{ analyzed: number; errors: number }> {
    console.log(`🎨 [Visual Intelligence] Batch thumbnail analysis starting...`);

    // Get videos from YouTube that haven't been analyzed
    const metrics = await db
      .select()
      .from(detailedVideoMetrics)
      .orderBy(desc(detailedVideoMetrics.viewCount))
      .limit(100);

    // Get already analyzed videos
    const analyzed = await db.select({ videoId: visualAnalysis.videoId }).from(visualAnalysis);

    const analyzedIds = new Set(analyzed.map((a) => a.videoId));

    // Filter to unanalyzed
    const toAnalyze = metrics.filter((m) => !analyzedIds.has(m.videoId)).slice(0, limit);

    let successCount = 0;
    let errorCount = 0;

    for (const video of toAnalyze) {
      try {
        await this.analyzeVideo(video.videoId);
        successCount++;

        // Rate limit - 1 second between analyses
        await new Promise((r) => setTimeout(r, 1000));
      } catch (error: any) {
        console.error(`❌ Failed to analyze ${video.videoId}:`, error.message);
        errorCount++;
      }
    }

    console.log(`📊 [Visual Intelligence] Batch complete: ${successCount} analyzed, ${errorCount} errors`);
    return { analyzed: successCount, errors: errorCount };
  }

  /**
   * Get visual analysis summary for Analytics Chat
   */
  async getVisualSummary(): Promise<{
    totalAnalyzed: number;
    averageScores: {
      thumbnail: number;
      visual: number;
      overall: number;
    };
    topPerformers: Array<{
      videoId: string;
      title: string;
      thumbnailScore: number;
      visualScore: number;
      strengths: string[];
    }>;
    commonWeaknesses: string[];
    recommendations: string[];
  }> {
    const allAnalysis = await db
      .select()
      .from(visualAnalysis)
      .orderBy(desc(visualAnalysis.overallVisualScore))
      .limit(50);

    if (allAnalysis.length === 0) {
      return {
        totalAnalyzed: 0,
        averageScores: { thumbnail: 0, visual: 0, overall: 0 },
        topPerformers: [],
        commonWeaknesses: [],
        recommendations: ['No videos analyzed yet. Run thumbnail analysis to get visual insights.'],
      };
    }

    // Calculate averages
    const avgThumbnail = allAnalysis.reduce((sum, a) => sum + (a.thumbnailScore || 0), 0) / allAnalysis.length;
    const avgVisual =
      allAnalysis.reduce((sum, a) => sum + (a.visualQualityScore || 0), 0) /
        allAnalysis.filter((a) => a.visualQualityScore).length || 0;
    const avgOverall = allAnalysis.reduce((sum, a) => sum + (a.overallVisualScore || 0), 0) / allAnalysis.length;

    // Get top performers
    const topPerformers = allAnalysis
      .filter((a) => a.thumbnailScore && a.thumbnailScore >= 70)
      .slice(0, 5)
      .map((a) => ({
        videoId: a.videoId,
        title: a.title || 'Untitled',
        thumbnailScore: a.thumbnailScore || 0,
        visualScore: a.visualQualityScore || 0,
        strengths: (a.thumbnailAnalysis as any)?.strengths || [],
      }));

    // Collect common weaknesses
    const weaknessCount: Record<string, number> = {};
    for (const a of allAnalysis) {
      const weaknesses = (a.thumbnailAnalysis as any)?.weaknesses || [];
      for (const w of weaknesses) {
        weaknessCount[w] = (weaknessCount[w] || 0) + 1;
      }
    }
    const commonWeaknesses = Object.entries(weaknessCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);

    // Generate recommendations
    const recommendations: string[] = [];
    if (avgThumbnail < 60) {
      recommendations.push('Thumbnail scores are below average. Focus on improving composition and color contrast.');
    }
    if (avgThumbnail >= 75) {
      recommendations.push(
        `Strong thumbnail performance (${avgThumbnail.toFixed(0)}/100). Keep using similar visual strategies.`,
      );
    }
    if (commonWeaknesses.length > 0) {
      recommendations.push(`Most common issue: "${commonWeaknesses[0]}". Address this across all thumbnails.`);
    }

    return {
      totalAnalyzed: allAnalysis.length,
      averageScores: {
        thumbnail: Math.round(avgThumbnail),
        visual: Math.round(avgVisual),
        overall: Math.round(avgOverall),
      },
      topPerformers,
      commonWeaknesses,
      recommendations,
    };
  }
}

export const visualIntelligenceService = new VisualIntelligenceService();
