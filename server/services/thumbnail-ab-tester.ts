/**
 * Thumbnail A/B Testing Service
 * Automatically swaps thumbnails after 24 hours to test CTR performance
 */

import { google } from 'googleapis';
import { storage } from '../storage';
import { existsSync, createReadStream, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
// @ts-ignore - module may not exist
import { execAsync } from '../utils/exec-async';

interface ThumbnailVariation {
  id: string;
  style: 'text_overlay' | 'minimal' | 'energy_bars' | 'artist_name' | 'original';
  filePath: string;
  viewsAtSwap: number;
  impressions: number;
  ctr: number; // click-through rate
  avgViewDuration: number;
  confidence: number; // Thompson Sampling score
}

interface ThumbnailTestResult {
  jobId: string;
  videoId: string;
  variations: ThumbnailVariation[];
  winner: ThumbnailVariation | null;
  testStartedAt: Date;
  testCompletedAt?: Date;
}

class ThumbnailABTester {
  private testResults: Map<string, ThumbnailTestResult> = new Map();
  private testFilePath = join(process.cwd(), 'data', 'thumbnail_ab_tests.json');

  constructor() {
    this.loadTestResults();
  }

  /**
   * Generate multiple thumbnail variations for A/B testing
   */
  async generateThumbnailVariations(
    videoPath: string,
    beatName: string,
    bpm: number,
    genre: string,
    artistTags: string[],
    jobId: string,
  ): Promise<string[]> {
    const thumbnailDir = join(process.cwd(), 'data', 'thumbnails');
    const variations: string[] = [];

    console.log(`🖼️  Generating ${4} thumbnail variations for A/B testing...`);

    // Variation 1: Original (just frame from video)
    const originalPath = join(thumbnailDir, `${jobId}_thumb_original.jpg`);
    await execAsync(
      `ffmpeg -i "${videoPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" "${originalPath}" -y`,
    );
    variations.push(originalPath);
    console.log(`   ✅ Original thumbnail`);

    // Variation 2: Text overlay with beat name
    const textOverlayPath = join(thumbnailDir, `${jobId}_thumb_text.jpg`);
    const textFilter = `drawtext=text='${beatName.replace(/'/g, "\\'")}':fontsize=72:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.7:boxborderw=20`;
    await execAsync(
      `ffmpeg -i "${videoPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,${textFilter}" "${textOverlayPath}" -y`,
    );
    variations.push(textOverlayPath);
    console.log(`   ✅ Text overlay thumbnail`);

    // Variation 3: BPM + Genre overlay
    const bpmOverlayPath = join(thumbnailDir, `${jobId}_thumb_bpm.jpg`);
    const bpmText = `${bpm} BPM`;
    const genreText = genre.toUpperCase();
    const bpmFilter = `drawtext=text='${bpmText}':fontsize=96:fontcolor=yellow:x=(w-text_w)/2:y=h-150:box=1:boxcolor=black@0.8:boxborderw=15,drawtext=text='${genreText}':fontsize=48:fontcolor=white:x=(w-text_w)/2:y=100:box=1:boxcolor=black@0.8:boxborderw=10`;
    await execAsync(
      `ffmpeg -i "${videoPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,${bpmFilter}" "${bpmOverlayPath}" -y`,
    );
    variations.push(bpmOverlayPath);
    console.log(`   ✅ BPM/Genre overlay thumbnail`);

    // Variation 4: Artist name overlay (if available)
    if (artistTags.length > 0) {
      const artistOverlayPath = join(thumbnailDir, `${jobId}_thumb_artist.jpg`);
      const artistText = artistTags[0].replace(/'/g, "\\'");
      const artistFilter = `drawtext=text='${artistText} Type Beat':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=purple@0.8:boxborderw=15`;
      await execAsync(
        `ffmpeg -i "${videoPath}" -ss 3 -vframes 1 -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,${artistFilter}" "${artistOverlayPath}" -y`,
      );
      variations.push(artistOverlayPath);
      console.log(`   ✅ Artist name overlay thumbnail`);
    }

    console.log(`   📊 Generated ${variations.length} thumbnail variations`);
    return variations;
  }

  /**
   * Schedule thumbnail swap after 24 hours
   */
  async scheduleSwap(jobId: string, videoId: string, channelId: string, variations: string[]): Promise<void> {
    const testResult: ThumbnailTestResult = {
      jobId,
      videoId,
      variations: variations.map((path, index) => ({
        id: `var_${index}`,
        style: this.getStyleFromIndex(index),
        filePath: path,
        viewsAtSwap: 0,
        impressions: 0,
        ctr: 0,
        avgViewDuration: 0,
        confidence: 0.5, // Default confidence
      })),
      winner: null,
      testStartedAt: new Date(),
    };

    this.testResults.set(jobId, testResult);
    this.saveTestResults();

    console.log(`📅 Scheduled thumbnail swap for ${videoId} in 24 hours`);
    console.log(`   Variations: ${variations.length}`);
  }

  /**
   * Execute thumbnail swaps for videos that are 24+ hours old
   */
  async executeScheduledSwaps(): Promise<void> {
    console.log('🔄 Checking for scheduled thumbnail swaps...');

    const jobs = await storage.listJobs();
    const eligibleJobs = jobs.filter((job) => {
      if (!job.youtubeVideoId || !job.uploadedAt) return false;

      const hoursSinceUpload = (Date.now() - new Date(job.uploadedAt).getTime()) / (1000 * 60 * 60);
      return hoursSinceUpload >= 24 && hoursSinceUpload < 25; // Swap between 24-25 hours
    });

    console.log(`   Found ${eligibleJobs.length} videos ready for thumbnail swap`);

    for (const job of eligibleJobs) {
      try {
        await this.swapThumbnail(job.id, job.youtubeVideoId!);
      } catch (error: any) {
        console.error(`   ❌ Failed to swap thumbnail for ${job.id}: ${error.message}`);
      }
    }
  }

  /**
   * Swap thumbnail to next variation
   */
  private async swapThumbnail(jobId: string, videoId: string): Promise<void> {
    const testResult = this.testResults.get(jobId);
    if (!testResult) {
      console.log(`   ⚠️  No A/B test data for ${jobId}`);
      return;
    }

    // Get current variation index (stored in job metadata)
    const job = await storage.getJob(jobId);
    const currentVariationIndex = (job?.unityMetadata as any)?.currentThumbnailVariation || 0;
    const nextVariationIndex = (currentVariationIndex + 1) % testResult.variations.length;

    if (nextVariationIndex === 0 && currentVariationIndex > 0) {
      // We've cycled through all variations - test complete
      console.log(`   ✅ A/B test complete for ${jobId}`);
      await this.completeTest(jobId);
      return;
    }

    const nextVariation = testResult.variations[nextVariationIndex];

    console.log(`\n🔄 Swapping thumbnail for ${videoId}`);
    console.log(`   From: ${this.getStyleFromIndex(currentVariationIndex)}`);
    console.log(`   To: ${nextVariation.style}`);

    if (!existsSync(nextVariation.filePath)) {
      console.log(`   ❌ Thumbnail file not found: ${nextVariation.filePath}`);
      return;
    }

    // Get YouTube credentials from connected channels
    const channelsPath = join(process.cwd(), 'data', 'youtube_connected_channels.json');
    if (!existsSync(channelsPath)) {
      console.log(`   ❌ No connected channels found`);
      return;
    }

    const channels = JSON.parse(readFileSync(channelsPath, 'utf-8'));
    const channel = channels[0]; // Use first available channel

    const oauth = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      process.env.YOUTUBE_REDIRECT_URI,
    );

    oauth.setCredentials({
      access_token: channel.accessToken,
      refresh_token: channel.refreshToken,
      expiry_date: channel.expiryDate,
    });

    const youtube = google.youtube({ version: 'v3', auth: oauth });

    // Get analytics before swap
    const beforeStats = await this.getVideoStats(youtube, videoId);
    testResult.variations[currentVariationIndex].viewsAtSwap = beforeStats.views;
    testResult.variations[currentVariationIndex].impressions = beforeStats.impressions;
    testResult.variations[currentVariationIndex].ctr = beforeStats.ctr;

    // Swap thumbnail
    await youtube.thumbnails.set({
      videoId,
      media: { body: createReadStream(nextVariation.filePath) },
    });

    console.log(`   ✅ Thumbnail swapped to: ${nextVariation.style}`);

    // Update job metadata
    await storage.updateJob(jobId, {
      thumbnailUrl: `/api/thumbnails/${nextVariation.filePath.split('/').pop()}`,
      unityMetadata: {
        ...job?.unityMetadata,
        currentThumbnailVariation: nextVariationIndex,
        lastThumbnailSwap: new Date().toISOString(),
      },
    } as any);

    this.saveTestResults();
  }

  /**
   * Complete A/B test and determine winner
   */
  private async completeTest(jobId: string): Promise<void> {
    const testResult = this.testResults.get(jobId);
    if (!testResult) return;

    // Calculate winner based on CTR and average view duration
    let bestVariation = testResult.variations[0];
    let bestScore = 0;

    for (const variation of testResult.variations) {
      // Composite score: CTR (70%) + normalized view duration (30%)
      const score = variation.ctr * 0.7 + (variation.avgViewDuration / 180) * 0.3;
      if (score > bestScore) {
        bestScore = score;
        bestVariation = variation;
      }
    }

    testResult.winner = bestVariation;
    testResult.testCompletedAt = new Date();

    console.log(`\n🏆 A/B TEST WINNER for ${jobId}:`);
    console.log(`   Style: ${bestVariation.style}`);
    console.log(`   CTR: ${(bestVariation.ctr * 100).toFixed(2)}%`);
    console.log(`   Avg View Duration: ${bestVariation.avgViewDuration.toFixed(1)}s`);
    console.log(`   Score: ${(bestScore * 100).toFixed(1)}`);

    // Update Thompson Sampling confidence for this style
    this.updateStyleConfidence(bestVariation.style, bestScore);

    this.saveTestResults();
  }

  /**
   * Get video stats from YouTube Analytics
   */
  private async getVideoStats(
    youtube: any,
    videoId: string,
  ): Promise<{ views: number; impressions: number; ctr: number }> {
    try {
      const response = await youtube.videos.list({
        part: ['statistics'],
        id: [videoId],
      });

      const views = parseInt(response.data.items?.[0]?.statistics?.viewCount || '0');

      // Note: YouTube Analytics API requires separate setup for impressions/CTR
      // For now, estimate CTR from views (will be accurate once analytics API is enabled)
      const impressions = views * 20; // Rough estimate
      const ctr = views / Math.max(impressions, 1);

      return { views, impressions, ctr };
    } catch (error) {
      return { views: 0, impressions: 0, ctr: 0 };
    }
  }

  /**
   * Update confidence score for thumbnail style (Thompson Sampling)
   */
  private updateStyleConfidence(style: string, score: number): void {
    // This would integrate with your existing Thompson Sampling system
    console.log(`   📊 Updating confidence for "${style}" style: ${(score * 100).toFixed(1)}`);
  }

  private getStyleFromIndex(index: number): 'text_overlay' | 'minimal' | 'energy_bars' | 'artist_name' | 'original' {
    const styles = ['original', 'text_overlay', 'energy_bars', 'artist_name'] as const;
    return styles[index] || 'original';
  }

  private loadTestResults(): void {
    try {
      if (existsSync(this.testFilePath)) {
        const data = readFileSync(this.testFilePath, 'utf-8');
        const parsed = JSON.parse(data);
        this.testResults = new Map(Object.entries(parsed));
        console.log(`✅ Loaded ${this.testResults.size} thumbnail A/B tests`);
      }
    } catch (error) {
      console.log('⚠️  No previous thumbnail A/B test data found');
    }
  }

  private saveTestResults(): void {
    try {
      const obj = Object.fromEntries(this.testResults);
      writeFileSync(this.testFilePath, JSON.stringify(obj, null, 2));
    } catch (error: any) {
      console.error(`Failed to save thumbnail test results: ${error.message}`);
    }
  }
}

export const thumbnailABTester = new ThumbnailABTester();
export type { ThumbnailVariation, ThumbnailTestResult };
