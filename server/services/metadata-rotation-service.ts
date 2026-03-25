/**
 * Metadata Rotation Service
 *
 * Automatically rotates YouTube video titles and thumbnails at scheduled intervals:
 * - 12h mark: Rotate title A→B
 * - 24h mark: Rotate thumbnail A→B
 * - 48h mark: Mark rotation as completed
 *
 * This turns videos into "living projects" for the first 48 hours,
 * optimizing metadata based on time-triggered A/B testing.
 */

import { db } from '../db';
import { videoRotationConfigs, VideoRotationConfig } from '@shared/schema';
import { eq, and, lt, isNull, ne, or } from 'drizzle-orm';
import { youtubeUploadService } from './youtube-upload-service';
import { youtubeMetadataGenerator } from './youtube-metadata-generator';
import { youtubeAnalyticsService } from './youtube-analytics-service';
import axios from 'axios';
import { createWriteStream, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';

// Rotation timing (in hours)
const TITLE_ROTATION_HOURS = 12;
const THUMBNAIL_ROTATION_HOURS = 24;
const COMPLETION_HOURS = 48;

class MetadataRotationService {
  /**
   * Create a new rotation config for a video
   */
  async createRotationConfig(config: {
    youtubeVideoId: string;
    packageId?: string;
    publishTime: Date;
    titleA: string;
    titleB?: string;
    thumbnailA?: string;
    thumbnailB?: string;
  }): Promise<VideoRotationConfig> {
    const [inserted] = await db
      .insert(videoRotationConfigs)
      .values({
        youtubeVideoId: config.youtubeVideoId,
        packageId: config.packageId || null,
        publishTime: config.publishTime,
        titleA: config.titleA,
        titleB: config.titleB || null,
        thumbnailA: config.thumbnailA || null,
        thumbnailB: config.thumbnailB || null,
        currentTitle: 'A',
        currentThumbnail: 'A',
        status: 'active',
        rotationLog: [],
      })
      .returning();

    console.log(`📋 Created rotation config for video ${config.youtubeVideoId}`);
    return inserted;
  }

  /**
   * Get all in-progress rotation configs (not yet completed)
   * Returns rotations with status: active, title_rotated, or thumbnail_rotated
   */
  async getActiveRotations(): Promise<VideoRotationConfig[]> {
    return await db.select().from(videoRotationConfigs).where(ne(videoRotationConfigs.status, 'completed'));
  }

  /**
   * Get rotation config for a specific video
   */
  async getRotationStatus(youtubeVideoId: string): Promise<VideoRotationConfig | null> {
    const [config] = await db
      .select()
      .from(videoRotationConfigs)
      .where(eq(videoRotationConfigs.youtubeVideoId, youtubeVideoId))
      .limit(1);
    return config || null;
  }

  /**
   * Rotate video title on YouTube
   */
  async rotateTitle(youtubeVideoId: string, newTitle: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔄 Rotating title for video ${youtubeVideoId}...`);

      const result = await youtubeUploadService.updateVideoMetadata(youtubeVideoId, {
        title: newTitle,
      });

      if (result.success) {
        console.log(`✅ Title rotated to: "${newTitle}"`);
      }

      return result;
    } catch (error: any) {
      console.error(`❌ Title rotation failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Rotate video thumbnail on YouTube
   */
  async rotateThumbnail(
    youtubeVideoId: string,
    thumbnailSource: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🖼️ Rotating thumbnail for video ${youtubeVideoId}...`);

      // If it's a URL, download it first
      let thumbnailPath = thumbnailSource;
      let needsCleanup = false;

      if (thumbnailSource.startsWith('http://') || thumbnailSource.startsWith('https://')) {
        const downloadResult = await this.downloadThumbnail(thumbnailSource);
        if (!downloadResult.success || !downloadResult.path) {
          return { success: false, error: downloadResult.error || 'Failed to download thumbnail' };
        }
        thumbnailPath = downloadResult.path;
        needsCleanup = true;
      }

      // Upload to YouTube
      const result = await youtubeUploadService.setThumbnail(youtubeVideoId, thumbnailPath);

      // Cleanup downloaded file
      if (needsCleanup && existsSync(thumbnailPath)) {
        try {
          unlinkSync(thumbnailPath);
        } catch {}
      }

      if (result.success) {
        console.log(`✅ Thumbnail rotated successfully`);
      }

      return result;
    } catch (error: any) {
      console.error(`❌ Thumbnail rotation failed:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Download thumbnail from URL to local file
   */
  private async downloadThumbnail(url: string): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
      const tempDir = '/tmp/temp_thumbnails';
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }

      const filename = `thumb_${Date.now()}.jpg`;
      const filepath = join(tempDir, filename);

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
      });

      const writer = createWriteStream(filepath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });

      return { success: true, path: filepath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check all active rotations and execute any that are due
   */
  async checkAndExecuteRotations(): Promise<{
    checked: number;
    titleRotations: number;
    thumbnailRotations: number;
    completed: number;
    errors: string[];
  }> {
    const results = {
      checked: 0,
      titleRotations: 0,
      thumbnailRotations: 0,
      completed: 0,
      errors: [] as string[],
    };

    try {
      const activeRotations = await this.getActiveRotations();
      results.checked = activeRotations.length;

      console.log(`🔄 Checking ${activeRotations.length} active rotation configs...`);

      const now = new Date();

      for (const config of activeRotations) {
        const publishTime = new Date(config.publishTime);
        const hoursSincePublish = (now.getTime() - publishTime.getTime()) / (1000 * 60 * 60);

        try {
          // First check if video still exists on YouTube
          const videoExists = await youtubeUploadService.checkVideoExists(config.youtubeVideoId);
          if (!videoExists) {
            console.log(`   ⚠️ Video ${config.youtubeVideoId} not found on YouTube - archiving rotation config`);
            await this.archiveVideoNotFound(config);
            results.completed++; // Count as completed since we can't rotate
            continue;
          }

          // Check for completion (48h)
          if (hoursSincePublish >= COMPLETION_HOURS) {
            await this.markCompleted(config);
            results.completed++;
            continue;
          }

          // Check for title rotation (12h)
          if (hoursSincePublish >= TITLE_ROTATION_HOURS && config.currentTitle === 'A' && !config.titleRotatedAt) {
            // Auto-generate Title B if missing (but only try once)
            let titleBToUse = config.titleB;
            if (!titleBToUse && !config.titleBGeneratedAt) {
              console.log(`   🔄 Auto-generating Title B for ${config.youtubeVideoId}...`);
              const genResult = await this.generateAndStoreTitleB(config.youtubeVideoId, config.packageId || undefined);
              if (genResult.success && genResult.titleB) {
                titleBToUse = genResult.titleB;
                console.log(`   ✅ Generated Title B: "${titleBToUse}"`);
              } else {
                console.log(`   ⚠️ Failed to generate Title B: ${genResult.error}`);
                // Mark as attempted to prevent retry spam
                await db
                  .update(videoRotationConfigs)
                  .set({ titleBGeneratedAt: new Date() })
                  .where(eq(videoRotationConfigs.id, config.id));
              }
            }

            if (titleBToUse) {
              // Capture Title A final views before rotating
              await this.captureTitleAFinalViews(config.youtubeVideoId);

              const titleResult = await this.rotateTitle(config.youtubeVideoId, titleBToUse);
              if (titleResult.success) {
                await this.logRotation(config, 'title_rotated', 'A', 'B', hoursSincePublish);
                results.titleRotations++;
              } else {
                results.errors.push(`Title rotation failed for ${config.youtubeVideoId}: ${titleResult.error}`);
              }
            }
          }

          // Check for thumbnail rotation (24h)
          if (
            hoursSincePublish >= THUMBNAIL_ROTATION_HOURS &&
            config.currentThumbnail === 'A' &&
            !config.thumbnailRotatedAt
          ) {
            // Skip thumbnail generation entirely - thumbnails should be created at upload time only
            const thumbnailBToUse = config.thumbnailB;
            if (!thumbnailBToUse) {
              console.log(`   ⚠️ Thumbnail B not available for ${config.youtubeVideoId}, skipping rotation`);
              // Mark thumbnail rotation as attempted to stop checking
              await db
                .update(videoRotationConfigs)
                .set({ thumbnailRotatedAt: new Date() })
                .where(eq(videoRotationConfigs.id, config.id));
              continue;
            }

            if (thumbnailBToUse) {
              const thumbResult = await this.rotateThumbnail(config.youtubeVideoId, thumbnailBToUse);
              if (thumbResult.success) {
                await this.logRotation(config, 'thumbnail_rotated', 'A', 'B', hoursSincePublish);
                results.thumbnailRotations++;
              } else {
                results.errors.push(`Thumbnail rotation failed for ${config.youtubeVideoId}: ${thumbResult.error}`);
              }
            }
          }
        } catch (error: any) {
          results.errors.push(`Error processing ${config.youtubeVideoId}: ${error.message}`);
        }
      }

      console.log(
        `✅ Rotation check complete: ${results.titleRotations} titles, ${results.thumbnailRotations} thumbnails, ${results.completed} completed`,
      );
    } catch (error: any) {
      console.error('Rotation check failed:', error.message);
      results.errors.push(error.message);
    }

    return results;
  }

  /**
   * Log a rotation event and update the config
   */
  private async logRotation(
    config: VideoRotationConfig,
    action: string,
    from: string,
    to: string,
    hoursSincePublish: number,
  ): Promise<void> {
    const rotationLog = (config.rotationLog || []) as Array<any>;

    rotationLog.push({
      action,
      from,
      to,
      timestamp: new Date().toISOString(),
      hoursSincePublish: Math.round(hoursSincePublish * 10) / 10,
    });

    const updates: any = { rotationLog };

    if (action === 'title_rotated') {
      updates.currentTitle = to;
      updates.titleRotatedAt = new Date();
    } else if (action === 'thumbnail_rotated') {
      updates.currentThumbnail = to;
      updates.thumbnailRotatedAt = new Date();
    }

    await db.update(videoRotationConfigs).set(updates).where(eq(videoRotationConfigs.id, config.id));
  }

  /**
   * Mark a rotation config as completed
   */
  private async markCompleted(config: VideoRotationConfig): Promise<void> {
    const rotationLog = (config.rotationLog || []) as Array<any>;

    rotationLog.push({
      action: 'completed',
      from: 'active',
      to: 'completed',
      timestamp: new Date().toISOString(),
      hoursSincePublish: 48,
    });

    await db
      .update(videoRotationConfigs)
      .set({
        status: 'completed',
        rotationLog,
      })
      .where(eq(videoRotationConfigs.id, config.id));

    console.log(`✅ Rotation completed for video ${config.youtubeVideoId}`);
  }

  /**
   * Archive a rotation config when video is not found on YouTube
   * (video was deleted or made private by owner)
   */
  private async archiveVideoNotFound(config: VideoRotationConfig): Promise<void> {
    const rotationLog = (config.rotationLog || []) as Array<any>;

    rotationLog.push({
      action: 'archived_video_not_found',
      from: config.status,
      to: 'completed',
      timestamp: new Date().toISOString(),
      reason: 'Video no longer exists on YouTube',
    });

    await db
      .update(videoRotationConfigs)
      .set({
        status: 'completed',
        rotationLog,
      })
      .where(eq(videoRotationConfigs.id, config.id));

    console.log(`📦 Archived rotation config for missing video ${config.youtubeVideoId}`);
  }

  /**
   * Force rotate title for a specific video (manual trigger)
   */
  async forceRotateTitle(youtubeVideoId: string): Promise<{ success: boolean; error?: string }> {
    const config = await this.getRotationStatus(youtubeVideoId);

    if (!config) {
      return { success: false, error: 'No rotation config found for this video' };
    }

    const targetTitle = config.currentTitle === 'A' ? config.titleB : config.titleA;
    if (!targetTitle) {
      return { success: false, error: 'No alternate title available' };
    }

    const result = await this.rotateTitle(youtubeVideoId, targetTitle);

    if (result.success) {
      const now = new Date();
      const publishTime = new Date(config.publishTime);
      const hoursSincePublish = (now.getTime() - publishTime.getTime()) / (1000 * 60 * 60);

      await this.logRotation(
        config,
        'title_rotated',
        config.currentTitle,
        config.currentTitle === 'A' ? 'B' : 'A',
        hoursSincePublish,
      );
    }

    return result;
  }

  /**
   * Force rotate thumbnail for a specific video (manual trigger)
   */
  async forceRotateThumbnail(youtubeVideoId: string): Promise<{ success: boolean; error?: string }> {
    const config = await this.getRotationStatus(youtubeVideoId);

    if (!config) {
      return { success: false, error: 'No rotation config found for this video' };
    }

    const targetThumbnail = config.currentThumbnail === 'A' ? config.thumbnailB : config.thumbnailA;
    if (!targetThumbnail) {
      return { success: false, error: 'No alternate thumbnail available' };
    }

    const result = await this.rotateThumbnail(youtubeVideoId, targetThumbnail);

    if (result.success) {
      const now = new Date();
      const publishTime = new Date(config.publishTime);
      const hoursSincePublish = (now.getTime() - publishTime.getTime()) / (1000 * 60 * 60);

      await this.logRotation(
        config,
        'thumbnail_rotated',
        config.currentThumbnail,
        config.currentThumbnail === 'A' ? 'B' : 'A',
        hoursSincePublish,
      );
    }

    return result;
  }

  /**
   * Generate Title B (High-Curiosity version) from Title A (High-Search version)
   *
   * Title A targets: Subscribers, search intent, factual keywords
   * Title B targets: Browse/Home Page audience, curiosity-driven, emotional hooks
   *
   * Examples:
   * - "Washington Crossing the Delaware" → "The Midnight Miracle of 1776"
   * - "Caesar's Assassination" → "The 23 Stab Wounds That Changed History"
   * - "Xuanzang's Sacred Odyssey" → "The Monk Who Walked 10,000 Miles for Buddha"
   */
  async generateTitleB(
    titleA: string,
    topic: string,
  ): Promise<{
    titleB: string | null;
    prompt: string;
    error?: string;
  }> {
    const prompt = `You are a YouTube title A/B testing expert specializing in historical content.

TITLE A (Search Intent - 0-12h):
"${titleA}"

Topic: ${topic}

YOUR TASK: Generate TITLE B (Curiosity Intent - 12-24h)

TITLE A vs TITLE B STRATEGY:
- Title A catches: Subscribers, people searching for "${topic}"
- Title B catches: Browse/Home Page audience who didn't click the first time

TITLE B MUST:
1. Use a DIFFERENT psychological hook than Title A
2. Be emotionally provocative (mystery, shock, awe, danger)
3. Avoid the person's name if possible - use descriptive phrases
4. Focus on the STORY, not the subject
5. Include numbers or specific details that create curiosity
6. Be under 60 characters

PSYCHOLOGICAL HOOKS FOR TITLE B:
- The [Number] [Thing] That [Dramatic Result]
- The [Time Period] [Event] No One Talks About
- What [Person] Did at [Specific Moment]
- The [Adjective] Secret of [Era/Place]
- [Number] [Time Unit] That Changed [Thing]

EXAMPLES:
- "Washington Crossing the Delaware" → "The Midnight Miracle of 1776"
- "Caesar's Rise to Power" → "The 23 Stab Wounds That Changed History"
- "Xuanzang's Journey to India" → "The Monk Who Walked 10,000 Miles for Buddha"
- "Napoleon's Russian Campaign" → "600,000 Soldiers. 27,000 Returned."
- "Einstein's Theory of Relativity" → "The 3 Pages That Broke Physics Forever"

RESPOND WITH ONLY THE NEW TITLE - NO QUOTES, NO EXPLANATION.`;

    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
      if (!apiKey) throw new Error('No GEMINI_API_KEY found');
      const gemini = new GoogleGenerativeAI(apiKey);

      const model = gemini.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.8, maxOutputTokens: 80 },
      });
      const result = await model.generateContent(prompt);
      const titleB = result.response.text()?.trim() || null;

      // Remove quotes if model adds them
      const cleanTitle = titleB?.replace(/^["']|["']$/g, '') || null;

      console.log(`🎯 Generated Title B: "${cleanTitle}" from Title A: "${titleA}"`);

      return { titleB: cleanTitle, prompt };
    } catch (error: any) {
      console.error('Failed to generate Title B:', error.message);
      return { titleB: null, prompt, error: error.message };
    }
  }

  /**
   * Generate and store Title B for a rotation config
   * Called automatically after video upload or manually via API
   */
  async generateAndStoreTitleB(
    youtubeVideoId: string,
    topic?: string,
  ): Promise<{
    success: boolean;
    titleB?: string;
    error?: string;
  }> {
    const config = await this.getRotationStatus(youtubeVideoId);

    if (!config) {
      return { success: false, error: 'No rotation config found for this video' };
    }

    if (config.titleB) {
      return { success: true, titleB: config.titleB, error: 'Title B already exists' };
    }

    const topicToUse = topic || config.packageId || 'historical figure';
    const result = await this.generateTitleB(config.titleA, topicToUse);

    if (!result.titleB) {
      return { success: false, error: result.error || 'Failed to generate Title B' };
    }

    // Store Title B and generation metadata
    await db
      .update(videoRotationConfigs)
      .set({
        titleB: result.titleB,
        titleBGeneratedBy: 'gemini',
        titleBPrompt: result.prompt,
        titleBGeneratedAt: new Date(),
      })
      .where(eq(videoRotationConfigs.id, config.id));

    console.log(`✅ Stored Title B for video ${youtubeVideoId}`);

    return { success: true, titleB: result.titleB };
  }

  /**
   * Generate and store Thumbnail B for a rotation config
   * Uses youtubeMetadataGenerator.generateHistoricalThumbnail() to create an alternate thumbnail
   * and downloads it to a local path for later YouTube upload
   *
   * @param youtubeVideoId - The YouTube video ID
   * @param topic - The topic/historical figure for thumbnail generation
   * @returns Object with success status, thumbnailB path, and any error
   */
  async generateAndStoreThumbnailB(
    youtubeVideoId: string,
    topic?: string,
  ): Promise<{
    success: boolean;
    thumbnailB?: string;
    error?: string;
  }> {
    const config = await this.getRotationStatus(youtubeVideoId);

    if (!config) {
      return { success: false, error: 'No rotation config found for this video' };
    }

    if (config.thumbnailB) {
      return { success: true, thumbnailB: config.thumbnailB, error: 'Thumbnail B already exists' };
    }

    const topicToUse = topic || config.packageId || 'historical figure';

    try {
      console.log(`🖼️ Generating Thumbnail B for video ${youtubeVideoId}, topic: "${topicToUse}"...`);

      // Generate the thumbnail using youtubeMetadataGenerator
      const thumbnailUrl = await youtubeMetadataGenerator.generateHistoricalThumbnail(
        topicToUse,
        topicToUse, // Use topic as character name since it typically contains the figure name
      );

      if (!thumbnailUrl) {
        return { success: false, error: 'Failed to generate thumbnail image' };
      }

      // Download the image to a local path
      const thumbnailsDir = join(process.cwd(), 'outputs', 'thumbnails');
      if (!existsSync(thumbnailsDir)) {
        mkdirSync(thumbnailsDir, { recursive: true });
      }

      const thumbnailPath = join(thumbnailsDir, `${youtubeVideoId}_B.webp`);

      // Download the image
      const response = await axios({
        method: 'GET',
        url: thumbnailUrl,
        responseType: 'arraybuffer',
      });

      writeFileSync(thumbnailPath, Buffer.from(response.data));
      console.log(`✅ Downloaded Thumbnail B to: ${thumbnailPath}`);

      // Store Thumbnail B path in the rotation config
      await db
        .update(videoRotationConfigs)
        .set({
          thumbnailB: thumbnailPath,
        })
        .where(eq(videoRotationConfigs.id, config.id));

      console.log(`✅ Stored Thumbnail B for video ${youtubeVideoId}`);

      return { success: true, thumbnailB: thumbnailPath };
    } catch (error: any) {
      console.error(`❌ Failed to generate Thumbnail B:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync analytics for A/B performance tracking
   * Updates viewsDuringTitleA/B based on which title period we're in
   */
  async syncAnalytics(
    youtubeVideoId: string,
    viewCount?: number,
  ): Promise<{
    success: boolean;
    viewsDuringTitleA?: number;
    viewsDuringTitleB?: number;
    viewsPerHourA?: number;
    viewsPerHourB?: number;
    performanceDeltaPct?: number;
    error?: string;
  }> {
    try {
      const config = await this.getRotationStatus(youtubeVideoId);
      if (!config) {
        return { success: false, error: 'Rotation config not found' };
      }

      // Get current view count if not provided
      let currentViews = viewCount;
      if (currentViews === undefined) {
        try {
          const metrics = await youtubeAnalyticsService.getDetailedMetrics();
          const videoMetric = metrics.find((m) => m.videoId === youtubeVideoId);
          currentViews = (videoMetric as any)?.views || (videoMetric as any)?.viewCount || 0;
        } catch (err: any) {
          console.log(`⚠️ Could not fetch analytics: ${err.message}`);
          return { success: false, error: 'Failed to fetch analytics' };
        }
      }

      const now = new Date();
      const publishTime = new Date(config.publishTime);
      const hoursSincePublish = (now.getTime() - publishTime.getTime()) / (1000 * 60 * 60);

      // Determine which period we're in and calculate metrics
      let viewsDuringTitleA = config.viewsDuringTitleA || 0;
      let viewsDuringTitleB = config.viewsDuringTitleB || 0;
      let viewsPerHourA = config.viewsPerHourA || 0;
      let viewsPerHourB = config.viewsPerHourB || 0;

      if (config.currentTitle === 'A' && hoursSincePublish < TITLE_ROTATION_HOURS) {
        // Still in Title A period (0-12h)
        viewsDuringTitleA = currentViews || 0;
        viewsPerHourA = hoursSincePublish > 0 ? viewsDuringTitleA / hoursSincePublish : 0;
      } else if (config.currentTitle === 'B' || hoursSincePublish >= TITLE_ROTATION_HOURS) {
        // In Title B period (12h+)
        // If we just rotated, viewsDuringTitleA should already be captured
        if (!config.viewsDuringTitleA && config.titleRotatedAt) {
          // Title A period ended - use views at rotation time (already captured)
        }

        // Calculate views during Title B period
        const viewsBeforeB = config.viewsDuringTitleA || 0;
        viewsDuringTitleB = Math.max(0, (currentViews || 0) - viewsBeforeB);

        // Calculate hours in each period
        const hoursInTitleA = config.titleRotatedAt
          ? (new Date(config.titleRotatedAt).getTime() - publishTime.getTime()) / (1000 * 60 * 60)
          : TITLE_ROTATION_HOURS;
        const hoursInTitleB = hoursSincePublish - hoursInTitleA;

        viewsPerHourA = hoursInTitleA > 0 ? (config.viewsDuringTitleA || 0) / hoursInTitleA : 0;
        viewsPerHourB = hoursInTitleB > 0 ? viewsDuringTitleB / hoursInTitleB : 0;
      }

      // Calculate performance delta
      const performanceDeltaPct = viewsPerHourA > 0 ? ((viewsPerHourB - viewsPerHourA) / viewsPerHourA) * 100 : 0;

      // Update the database
      await db
        .update(videoRotationConfigs)
        .set({
          viewsDuringTitleA,
          viewsDuringTitleB,
          viewsPerHourA,
          viewsPerHourB,
          performanceDeltaPct,
          lastAnalyticsSync: now,
        })
        .where(eq(videoRotationConfigs.id, config.id));

      console.log(
        `📊 Synced analytics for ${youtubeVideoId}: A=${viewsPerHourA.toFixed(1)}/h, B=${viewsPerHourB.toFixed(1)}/h, Δ=${performanceDeltaPct.toFixed(1)}%`,
      );

      return {
        success: true,
        viewsDuringTitleA,
        viewsDuringTitleB,
        viewsPerHourA,
        viewsPerHourB,
        performanceDeltaPct,
      };
    } catch (error: any) {
      console.error(`❌ Failed to sync analytics:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Capture Title A final views just before rotation
   * Called automatically when title is about to rotate from A to B
   */
  async captureTitleAFinalViews(youtubeVideoId: string): Promise<void> {
    try {
      const metrics = await youtubeAnalyticsService.getDetailedMetrics();
      const videoMetric = metrics.find((m) => m.videoId === youtubeVideoId);
      if (videoMetric) {
        await this.syncAnalytics(youtubeVideoId, (videoMetric as any).views || (videoMetric as any).viewCount);
        console.log(`📸 Captured Title A final views: ${(videoMetric as any).views || (videoMetric as any).viewCount}`);
      }
    } catch (error: any) {
      console.log(`⚠️ Could not capture Title A views: ${error.message}`);
    }
  }
}

export const metadataRotationService = new MetadataRotationService();
