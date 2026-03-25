/**
 * Thumbnail A/B Testing Service
 *
 * Orchestrates automated thumbnail testing for every video:
 * 1. Generate 2 different thumbnails per video
 * 2. Upload video with Thumbnail A
 * 3. Store Thumbnail B as backup
 * 4. After 24 hours, check CTR via YouTube Analytics
 * 5. If CTR < baseline, swap to Thumbnail B
 * 6. Track winners for future learning
 */

import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';
import { join } from 'path';

interface ThumbnailTest {
  videoId: string;
  videoTitle: string;
  figure: string;
  thumbnailA: string;
  thumbnailB: string;
  activeThumbnail: 'A' | 'B';
  uploadedAt: Date;
  checkAfter: Date;
  status: 'pending' | 'checked' | 'swapped' | 'kept';
  ctrAtCheck?: number;
  baselineCTR: number;
  winner?: 'A' | 'B';
  styleA: ThumbnailStyle;
  styleB: ThumbnailStyle;
}

interface ThumbnailStyle {
  id: string;
  name: string;
  promptModifier: string;
  wins: number;
  losses: number;
  avgCTR: number;
}

const THUMBNAIL_STYLES: ThumbnailStyle[] = [
  {
    id: 'vs_battle',
    name: 'VS Battle',
    promptModifier: 'epic battle scene, VS text in center, lightning effects, intense rivalry, split composition',
    wins: 0,
    losses: 0,
    avgCTR: 0,
  },
  {
    id: 'dramatic_portrait',
    name: 'Dramatic Portrait',
    promptModifier: 'dramatic close-up portrait, Rembrandt lighting, intense eyes, dark moody background',
    wins: 0,
    losses: 0,
    avgCTR: 0,
  },
  {
    id: 'action_scene',
    name: 'Action Scene',
    promptModifier: 'dynamic action pose, motion blur, dramatic angle, cinematic composition',
    wins: 0,
    losses: 0,
    avgCTR: 0,
  },
  {
    id: 'text_heavy',
    name: 'Text Heavy',
    promptModifier: 'bold text overlay space, high contrast background, clean composition for text',
    wins: 0,
    losses: 0,
    avgCTR: 0,
  },
  {
    id: 'minimal_clean',
    name: 'Minimal Clean',
    promptModifier: 'minimalist design, single subject, clean background, strong silhouette',
    wins: 0,
    losses: 0,
    avgCTR: 0,
  },
  {
    id: 'neon_glow',
    name: 'Neon Glow',
    promptModifier: 'neon lighting, cyberpunk aesthetic, glowing edges, vibrant colors on dark',
    wins: 0,
    losses: 0,
    avgCTR: 0,
  },
  {
    id: 'oil_painting',
    name: 'Oil Painting',
    promptModifier: 'classical oil painting style, museum quality, rich textures, golden frame aesthetic',
    wins: 0,
    losses: 0,
    avgCTR: 0,
  },
  {
    id: 'comic_book',
    name: 'Comic Book',
    promptModifier: 'comic book style, bold outlines, halftone dots, dynamic panels, POW effects',
    wins: 0,
    losses: 0,
    avgCTR: 0,
  },
];

class ThumbnailABService {
  private pendingTests: Map<string, ThumbnailTest> = new Map();
  private completedTests: ThumbnailTest[] = [];
  private styles: ThumbnailStyle[] = [...THUMBNAIL_STYLES];
  private baselineCTR: number = 3.0; // Default 3% CTR baseline
  private swapThreshold: number = 0.7; // Swap if CTR < 70% of baseline
  private backupDir: string = join(process.cwd(), 'data', 'thumbnail_backups');

  constructor() {
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true });
    }
    console.log('📸 Thumbnail A/B Testing Service initialized');
  }

  /**
   * Select two different styles for A/B testing
   * Uses weighted selection based on past performance
   */
  selectTwoStyles(): [ThumbnailStyle, ThumbnailStyle] {
    const weights = this.styles.map((s) => {
      const total = s.wins + s.losses;
      if (total === 0) return 1.0; // New styles get fair chance
      const winRate = s.wins / total;
      // Blend win rate with exploration bonus for less-tested styles
      const explorationBonus = 1 / (1 + Math.sqrt(total));
      return 0.7 * winRate + 0.3 * explorationBonus + 0.1; // Min weight 0.1
    });

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const normalized = weights.map((w) => w / totalWeight);

    // Select first style
    let rand = Math.random();
    let styleAIndex = 0;
    for (let i = 0; i < normalized.length; i++) {
      rand -= normalized[i];
      if (rand <= 0) {
        styleAIndex = i;
        break;
      }
    }

    // Select second style (different from first)
    let styleBIndex = styleAIndex;
    while (styleBIndex === styleAIndex) {
      rand = Math.random();
      for (let i = 0; i < normalized.length; i++) {
        rand -= normalized[i];
        if (rand <= 0) {
          styleBIndex = i;
          break;
        }
      }
    }

    return [this.styles[styleAIndex], this.styles[styleBIndex]];
  }

  /**
   * Generate thumbnail prompt for a given style
   */
  generatePrompt(figure: string, style: ThumbnailStyle, context?: string): string {
    const basePrompt = `Historical YouTube thumbnail featuring ${figure}`;
    const contextPart = context ? `, ${context}` : '';
    return `${basePrompt}${contextPart}, ${style.promptModifier}, ultra high quality, 4K, professional YouTube thumbnail, 16:9 aspect ratio, vibrant colors, high contrast, eye-catching`;
  }

  /**
   * Register a new A/B test for a video
   */
  async registerTest(
    videoId: string,
    videoTitle: string,
    figure: string,
    thumbnailAPath: string,
    thumbnailBPath: string,
    styleA: ThumbnailStyle,
    styleB: ThumbnailStyle,
  ): Promise<ThumbnailTest> {
    // Backup thumbnail B
    const backupPath = join(this.backupDir, `${videoId}_B.jpg`);
    if (existsSync(thumbnailBPath)) {
      copyFileSync(thumbnailBPath, backupPath);
    }

    const test: ThumbnailTest = {
      videoId,
      videoTitle,
      figure,
      thumbnailA: thumbnailAPath,
      thumbnailB: backupPath,
      activeThumbnail: 'A',
      uploadedAt: new Date(),
      checkAfter: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours later
      status: 'pending',
      baselineCTR: this.baselineCTR,
      styleA,
      styleB,
    };

    this.pendingTests.set(videoId, test);
    console.log(`📸 Registered A/B test for ${videoTitle}`);
    console.log(`   Style A: ${styleA.name} | Style B: ${styleB.name}`);
    console.log(`   Will check CTR at: ${test.checkAfter.toISOString()}`);

    return test;
  }

  /**
   * Check all pending tests and swap thumbnails if needed
   * This should be called by a scheduler every hour
   */
  async checkAndSwap(): Promise<{
    checked: number;
    swapped: number;
    kept: number;
    results: Array<{ videoId: string; action: string; ctr: number }>;
  }> {
    const now = new Date();
    const results: Array<{ videoId: string; action: string; ctr: number }> = [];
    let checked = 0;
    let swapped = 0;
    let kept = 0;

    // Import YouTube services dynamically
    const { youtubeAnalyticsService } = await import('./youtube-analytics-service');
    const { youtubeUploadService } = await import('./youtube-upload-service');

    for (const [videoId, test] of this.pendingTests) {
      if (test.status !== 'pending' || now < test.checkAfter) {
        continue;
      }

      checked++;

      try {
        // Get CTR from YouTube Analytics
        const analytics = await youtubeAnalyticsService.getAdvancedAnalytics(videoId);
        const ctr = analytics?.clickThroughRate || 0;
        test.ctrAtCheck = ctr;

        console.log(`📊 Checking ${test.videoTitle}: CTR = ${ctr.toFixed(2)}% (baseline: ${this.baselineCTR}%)`);

        // Decision: Swap if CTR is below threshold
        const threshold = this.baselineCTR * this.swapThreshold;

        if (ctr < threshold && existsSync(test.thumbnailB)) {
          // Swap to Thumbnail B
          const swapResult = await youtubeUploadService.setThumbnail(videoId, test.thumbnailB);

          if (swapResult.success) {
            test.activeThumbnail = 'B';
            test.status = 'swapped';
            test.winner = 'B'; // B wins by default since A failed
            swapped++;

            // Update style stats
            this.recordOutcome(test.styleA.id, false);
            this.recordOutcome(test.styleB.id, true); // Assumed winner

            console.log(`🔄 SWAPPED: ${test.videoTitle} - CTR ${ctr.toFixed(2)}% was below ${threshold.toFixed(2)}%`);
            results.push({ videoId, action: 'swapped', ctr });
          }
        } else {
          // Keep Thumbnail A
          test.status = 'kept';
          test.winner = 'A';
          kept++;

          // Update style stats
          this.recordOutcome(test.styleA.id, true);

          console.log(`✅ KEPT: ${test.videoTitle} - CTR ${ctr.toFixed(2)}% is good`);
          results.push({ videoId, action: 'kept', ctr });
        }

        // Move to completed
        this.completedTests.push(test);
        this.pendingTests.delete(videoId);
      } catch (error: any) {
        console.error(`❌ Error checking ${videoId}:`, error.message);
        results.push({ videoId, action: 'error', ctr: 0 });
      }
    }

    // Update baseline CTR based on recent performance
    this.updateBaseline();

    return { checked, swapped, kept, results };
  }

  /**
   * Record outcome for a style
   */
  private recordOutcome(styleId: string, won: boolean): void {
    const style = this.styles.find((s) => s.id === styleId);
    if (style) {
      if (won) {
        style.wins++;
      } else {
        style.losses++;
      }
    }
  }

  /**
   * Update baseline CTR based on recent tests
   */
  private updateBaseline(): void {
    const recentTests = this.completedTests.slice(-20);
    if (recentTests.length >= 5) {
      const avgCTR =
        recentTests.filter((t) => t.ctrAtCheck !== undefined).reduce((sum, t) => sum + (t.ctrAtCheck || 0), 0) /
        recentTests.length;

      if (avgCTR > 0) {
        this.baselineCTR = avgCTR;
        console.log(`📈 Updated baseline CTR to ${this.baselineCTR.toFixed(2)}%`);
      }
    }
  }

  /**
   * Get status of all tests
   */
  getStatus(): {
    pending: number;
    completed: number;
    swapRate: number;
    baselineCTR: number;
    styles: Array<{ name: string; wins: number; losses: number; winRate: string }>;
    pendingTests: Array<{ videoId: string; title: string; checkAfter: string }>;
  } {
    const swapped = this.completedTests.filter((t) => t.status === 'swapped').length;
    const total = this.completedTests.length;

    return {
      pending: this.pendingTests.size,
      completed: total,
      swapRate: total > 0 ? (swapped / total) * 100 : 0,
      baselineCTR: this.baselineCTR,
      styles: this.styles.map((s) => ({
        name: s.name,
        wins: s.wins,
        losses: s.losses,
        winRate: s.wins + s.losses > 0 ? ((s.wins / (s.wins + s.losses)) * 100).toFixed(1) + '%' : 'No data',
      })),
      pendingTests: Array.from(this.pendingTests.values()).map((t) => ({
        videoId: t.videoId,
        title: t.videoTitle,
        checkAfter: t.checkAfter.toISOString(),
      })),
    };
  }

  /**
   * Get the best performing styles
   */
  getBestStyles(topN: number = 3): ThumbnailStyle[] {
    return [...this.styles]
      .filter((s) => s.wins + s.losses >= 3) // At least 3 tests
      .sort((a, b) => {
        const aRate = a.wins / (a.wins + a.losses);
        const bRate = b.wins / (b.wins + b.losses);
        return bRate - aRate;
      })
      .slice(0, topN);
  }

  /**
   * Force a manual swap for a video
   */
  async forceSwap(videoId: string): Promise<{ success: boolean; message: string }> {
    const test = this.pendingTests.get(videoId) || this.completedTests.find((t) => t.videoId === videoId);

    if (!test) {
      return { success: false, message: 'Test not found' };
    }

    if (!existsSync(test.thumbnailB)) {
      return { success: false, message: 'Backup thumbnail not found' };
    }

    try {
      const { youtubeUploadService } = await import('./youtube-upload-service');
      const result = await youtubeUploadService.setThumbnail(videoId, test.thumbnailB);

      if (result.success) {
        test.activeThumbnail = 'B';
        test.status = 'swapped';
        return { success: true, message: `Swapped to Thumbnail B for ${test.videoTitle}` };
      } else {
        return { success: false, message: result.error || 'Swap failed' };
      }
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Set baseline CTR manually
   */
  setBaseline(ctr: number): void {
    this.baselineCTR = ctr;
    console.log(`📈 Baseline CTR set to ${ctr}%`);
  }

  /**
   * Get all available styles
   */
  getStyles(): ThumbnailStyle[] {
    return this.styles;
  }
}

export const thumbnailABService = new ThumbnailABService();
