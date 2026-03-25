/**
 * Analytics Polling Scheduler
 *
 * Runs once daily BEFORE video generation to:
 * 1. Fetch latest YouTube analytics for all uploaded videos
 * 2. Run Thompson Sampling + Demucs correlation analysis
 * 3. Update bandits with learnings
 * 4. Apply insights to upcoming generation
 */

import { CronJob } from 'cron';
import { db } from '../db';
import { jobs } from '@shared/schema';
import { isNotNull, sql } from 'drizzle-orm';
import { systemHealthMonitor } from './system-health-monitor';

class AnalyticsPollingScheduler {
  private isRunning = false;
  private cronJob: CronJob | null = null;
  private lastSuccessfulRun: Date | null = null;

  /**
   * Start the scheduler
   * Runs daily at 2:00 AM (1 hour before daily generation at 3:00 AM)
   */
  start() {
    if (this.cronJob) {
      console.log('⚠️ Analytics Polling Scheduler already running');
      return;
    }

    // Run at 2:00 AM and 7:00 PM every day
    this.cronJob = new CronJob('0 2,19 * * *', async () => {
      try {
        await this.runAnalyticsPipeline();
      } catch (error: any) {
        console.error('[AnalyticsPollingScheduler] CronJob error:', error.message);
      }
    });
    this.cronJob.start();

    console.log('✅ Analytics Polling Scheduler started');
    console.log('   📅 Runs daily at 2:00 AM & 7:00 PM (before generation)');
  }

  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('🛑 Analytics Polling Scheduler stopped');
    }
  }

  /**
   * Main analytics pipeline
   */
  private async runAnalyticsPipeline() {
    if (this.isRunning) {
      console.log('⏭️ Analytics pipeline already running, skipping...');
      return;
    }

    this.isRunning = true;

    // Record heartbeat for health monitoring
    systemHealthMonitor.recordHeartbeat('analytics-polling');

    console.log('\n🚀 STARTING DAILY ANALYTICS PIPELINE');
    console.log('=====================================\n');

    try {
      // Step 1: Fetch YouTube analytics for all uploaded videos (free YouTube API)
      await this.fetchYouTubeAnalytics();

      // Check if there are new uploads since last successful run
      // If not, skip the expensive AI-powered analysis steps (Steps 2-5)
      let hasNewUploads = true;
      if (this.lastSuccessfulRun) {
        try {
          const newUploadsResult = await db
            .select({ count: sql<number>`count(*)` })
            .from(jobs)
            .where(sql`${jobs.uploadedAt} > ${this.lastSuccessfulRun} AND ${jobs.youtubeVideoId} IS NOT NULL`);
          const newCount = Number(newUploadsResult[0]?.count || 0);
          if (newCount === 0) {
            hasNewUploads = false;
            console.log('\n⏭️  No new uploads since last run — skipping expensive analysis steps (2-5)');
          } else {
            console.log(`\n📊 ${newCount} new upload(s) since last run — running full pipeline`);
          }
        } catch (err: any) {
          console.warn(`   ⚠️ Could not check for new uploads: ${err.message} — running full pipeline`);
        }
      }

      if (hasNewUploads) {
        // Step 2: Run Thompson Sampling + Demucs correlation analysis
        await this.runRetentionCorrelation();

        // Step 3: Update channel bandit with video performance
        await this.updateChannelBandit();

        // Step 4: Record theme performance for feedback loop
        await this.recordThemePerformance();

        // Step 5: Generate insights for next generation
        await this.generateInsights();
      }

      this.lastSuccessfulRun = new Date();
      console.log('\n✅ Daily analytics pipeline complete!\n');
    } catch (error: any) {
      console.error('❌ Analytics pipeline error:', error.message);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Step 1: Fetch YouTube analytics for all uploaded videos
   */
  private async fetchYouTubeAnalytics() {
    console.log('📊 STEP 1: Fetching YouTube Analytics');
    console.log('--------------------------------------\n');

    try {
      // Get all videos with YouTube IDs that need analytics
      const videosWithIds = await db
        .select({
          jobId: jobs.id,
          videoId: jobs.youtubeVideoId,
          scriptName: jobs.scriptName,
          uploadedAt: jobs.uploadedAt,
        })
        .from(jobs)
        .where(isNotNull(jobs.youtubeVideoId));

      console.log(`   Found ${videosWithIds.length} uploaded videos\n`);

      let fetched = 0;
      let errors = 0;

      for (const video of videosWithIds) {
        if (!video.videoId) continue;

        try {
          // Import dynamically to avoid circular dependencies
          const { youtubeAnalyticsService } = await import('./youtube-analytics-service');

          console.log(`   📥 Fetching: ${video.scriptName} (${video.videoId})`);

          // Fetch both basic analytics and retention curve
          await (youtubeAnalyticsService as any).fetchAndStoreAnalytics(video.videoId);

          fetched++;
        } catch (error: any) {
          console.error(`   ❌ Error fetching ${video.videoId}: ${error.message}`);
          errors++;
        }

        // Rate limiting: wait 500ms between requests
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      console.log(`\n   ✅ Fetched: ${fetched}, Errors: ${errors}\n`);
    } catch (error: any) {
      console.error(`   ❌ YouTube analytics fetch error: ${error.message}`);
    }
  }

  /**
   * Step 2: Run Thompson Sampling + Demucs correlation analysis
   */
  private async runRetentionCorrelation() {
    console.log('🎯 STEP 2: Running Retention Correlation Analysis');
    console.log('--------------------------------------------------\n');

    try {
      const { retentionClipCorrelator } = await import('./retention-clip-correlator');

      // Get jobs with both YouTube video IDs and generation metadata
      const jobsWithData = await db.select().from(jobs).where(isNotNull(jobs.youtubeVideoId));

      console.log(`   Found ${jobsWithData.length} jobs with uploads\n`);

      let analyzed = 0;
      let skipped = 0;
      let totalToxicCombos = 0;

      for (const job of jobsWithData) {
        if (!job.youtubeVideoId || !job.completedClips || job.completedClips.length === 0) {
          skipped++;
          continue;
        }

        try {
          // Check if video has retention curve
          const metricsResult = await db.execute(sql`
            SELECT video_id, retention_curve
            FROM detailed_video_metrics
            WHERE video_id = ${job.youtubeVideoId}
          `);

          if (metricsResult.rows.length === 0 || !metricsResult.rows[0].retention_curve) {
            skipped++;
            continue;
          }

          const metrics = metricsResult.rows[0] as any;
          const retentionData = metrics.retention_curve;

          console.log(`   🔍 Analyzing: ${job.scriptName}`);

          // Build metadata
          const metadata = {
            videoId: job.youtubeVideoId,
            title: job.scriptName || '',
            clips: (job.completedClips as any[]).map((clip: any, idx: number) => ({
              clipIndex: idx,
              startTime: clip.startTime || 0,
              endTime: clip.endTime || 0,
              styleCategory: clip.styleCategory || clip.style || 'unknown',
              audioStyle: (job as any).musicStyle || 'unknown',
              prompt: clip.prompt || '',
            })),
            audioStyle: (job as any).musicStyle || 'unknown',
            totalDuration: retentionData[retentionData.length - 1]?.second || 0,
          };

          // Run correlation analysis (includes Thompson Sampling updates)
          const toxicCombos = await retentionClipCorrelator.analyzeDropOffsWithReactionLag(
            job.youtubeVideoId,
            retentionData,
            metadata as any,
          );

          console.log(`      ✅ Detected ${toxicCombos.length} toxic combos`);
          totalToxicCombos += toxicCombos.length;
          analyzed++;
        } catch (error: any) {
          console.error(`      ❌ Error analyzing ${job.scriptName}: ${error.message}`);
        }
      }

      console.log(`\n   📊 Analyzed: ${analyzed}, Skipped: ${skipped}, Toxic Combos: ${totalToxicCombos}\n`);
    } catch (error: any) {
      console.error(`   ❌ Correlation analysis error: ${error.message}`);
    }
  }

  /**
   * Step 3: Update channel bandit with video performance
   */
  private async updateChannelBandit() {
    console.log('🎰 STEP 3: Updating Channel Bandit with Performance Data');
    console.log('-----------------------------------------------------------\n');

    try {
      const { youtubeChannelBandit } = await import('./youtube-channel-bandit');
      const { detailedVideoMetrics } = await import('@shared/schema');

      // Get all jobs with YouTube uploads that have channel tracking
      const jobsWithChannels = await db.select().from(jobs).where(isNotNull(jobs.youtubeVideoId));

      console.log(`   Found ${jobsWithChannels.length} jobs with YouTube uploads\n`);

      let updated = 0;
      let skipped = 0;

      for (const job of jobsWithChannels) {
        if (!job.youtubeChannelConnectionId || !job.youtubeVideoId) {
          skipped++;
          continue;
        }

        try {
          // Get analytics for this video from database
          const metricsResult = await db
            .select()
            .from(detailedVideoMetrics)
            .where(sql`${detailedVideoMetrics.videoId} = ${job.youtubeVideoId}`)
            .limit(1);

          if (metricsResult.length === 0) {
            skipped++;
            continue;
          }

          const metrics = metricsResult[0];

          // Determine content type from job metadata
          let contentType: 'lofi' | 'trap' | 'history' | 'other' = 'other';
          const musicStyle = (job.musicDescription || '').toLowerCase();
          if (musicStyle.includes('lofi') || musicStyle.includes('lo-fi')) {
            contentType = 'lofi';
          } else if (musicStyle.includes('trap')) {
            contentType = 'trap';
          } else if (
            job.scriptName?.toLowerCase().includes('history') ||
            job.scriptContent?.toLowerCase().includes('history')
          ) {
            contentType = 'history';
          }

          // Extract performance metrics
          const rewardMetrics = {
            views: metrics.viewCount || 0,
            ctr: metrics.clickThroughRate ? parseFloat(metrics.clickThroughRate.toString()) : undefined,
            retention: metrics.averageViewPercentage ? parseFloat(metrics.averageViewPercentage.toString()) : undefined,
            likes: metrics.likeCount || 0,
            contentType,
          };

          // Update bandit
          await youtubeChannelBandit.updateReward(job.youtubeChannelConnectionId, rewardMetrics);

          console.log(
            `   ✅ Updated bandit for ${job.scriptName || job.youtubeVideoId} (${rewardMetrics.views} views)`,
          );
          updated++;
        } catch (error: any) {
          console.error(`   ❌ Error updating bandit for ${job.youtubeVideoId}: ${error.message}`);
        }
      }

      console.log(`\n   📊 Updated: ${updated}, Skipped: ${skipped}\n`);
    } catch (error: any) {
      console.error(`   ❌ Channel bandit update error: ${error.message}`);
    }
  }

  /**
   * Step 4: Record theme performance — closes the theme → video → analytics feedback loop
   *
   * Only processes jobs that haven't been recorded yet (themePerformanceRecorded flag).
   * This ensures no double-counting across server restarts or daily pipeline re-runs.
   */
  private async recordThemePerformance() {
    console.log('🎭 STEP 4: Recording Theme Performance');
    console.log('----------------------------------------\n');

    try {
      const { patternIntelligenceService } = await import('./pattern-intelligence-service');
      const { detailedVideoMetrics } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');

      // Ensure theme data is loaded from DB before we try to match IDs
      await patternIntelligenceService.init();

      // Get all uploaded jobs that have appliedThemeIds but haven't been recorded yet
      const uploadedJobs = await db
        .select({
          jobId: jobs.id,
          youtubeVideoId: jobs.youtubeVideoId,
          scriptName: jobs.scriptName,
          unityMetadata: jobs.unityMetadata,
        })
        .from(jobs)
        .where(isNotNull(jobs.youtubeVideoId));

      const unrecordedJobs = uploadedJobs.filter(
        (j) =>
          j.unityMetadata &&
          (j.unityMetadata as any).appliedThemeIds?.length > 0 &&
          !(j.unityMetadata as any).themePerformanceRecorded,
      );

      if (unrecordedJobs.length === 0) {
        console.log('   ⚠️ No new themed jobs to record\n');
        return;
      }

      console.log(`   Found ${unrecordedJobs.length} unrecorded themed jobs\n`);

      // Compute median views across ALL themed jobs (including already-recorded) for a stable threshold
      const allThemedJobs = uploadedJobs.filter(
        (j) => j.unityMetadata && (j.unityMetadata as any).appliedThemeIds?.length > 0,
      );
      const allViewCounts: number[] = [];
      for (const job of allThemedJobs) {
        if (!job.youtubeVideoId) continue;
        const metricsResult = await db
          .select({ viewCount: detailedVideoMetrics.viewCount })
          .from(detailedVideoMetrics)
          .where(eq(detailedVideoMetrics.videoId, job.youtubeVideoId))
          .limit(1);
        if (metricsResult.length > 0) {
          allViewCounts.push(metricsResult[0].viewCount || 0);
        }
      }

      if (allViewCounts.length === 0) {
        console.log('   ⚠️ No analytics data available for themed jobs yet\n');
        return;
      }

      const sorted = [...allViewCounts].sort((a, b) => a - b);
      const medianViews = sorted[Math.floor(sorted.length / 2)];
      console.log(`   📊 Median views: ${medianViews} (across ${allViewCounts.length} themed videos)\n`);

      let recorded = 0;
      let skipped = 0;

      for (const job of unrecordedJobs) {
        if (!job.youtubeVideoId) continue;

        const metricsResult = await db
          .select()
          .from(detailedVideoMetrics)
          .where(eq(detailedVideoMetrics.videoId, job.youtubeVideoId))
          .limit(1);

        if (metricsResult.length === 0) {
          skipped++;
          continue;
        }

        const m = metricsResult[0];
        const views = m.viewCount || 0;
        const engagement = m.likeCount ? (m.likeCount / Math.max(views, 1)) * 100 : 0;
        const title = m.title || job.scriptName || '';
        const themeIds: string[] = (job.unityMetadata as any).appliedThemeIds;
        const isSuccess = views >= medianViews;

        for (const themeId of themeIds) {
          patternIntelligenceService.recordThemePerformance(
            themeId,
            job.youtubeVideoId,
            title,
            views,
            engagement,
            isSuccess,
          );
        }

        // Stamp the job so it's never reprocessed
        await db
          .update(jobs)
          .set({
            unityMetadata: {
              ...(job.unityMetadata as any),
              themePerformanceRecorded: true,
            },
          })
          .where(eq(jobs.id, job.jobId));

        recorded++;
      }

      console.log(
        `   ✅ Recorded themes for ${recorded} videos (${recorded > 0 ? unrecordedJobs[0].scriptName + (recorded > 1 ? ` + ${recorded - 1} more` : '') : ''}), skipped ${skipped}\n`,
      );
    } catch (error: any) {
      console.error(`   ❌ Theme performance recording error: ${error.message}`);
    }
  }

  /**
   * Step 5: Generate insights for next generation
   */
  private async generateInsights() {
    console.log('💡 STEP 5: Generating Insights for Next Generation');
    console.log('---------------------------------------------------\n');

    try {
      // Get current bandit states
      const { styleBanditService } = await import('./style-bandit-service');
      const topStyles = await (styleBanditService as any).getTopPerformingStyles(10);

      console.log('   🎨 Top Performing Styles:');
      for (const style of topStyles.slice(0, 5)) {
        console.log(`      ${style.styleCategory}: ${(style.avgRetention * 100).toFixed(1)}% retention`);
      }

      // Get posting time recommendations
      const { postingTimeBandit } = await import('./posting-time-bandit');
      const weekdaySlot = postingTimeBandit.selectTimeSlot('shorts', 'weekday');
      const weekendSlot = postingTimeBandit.selectTimeSlot('shorts', 'weekend');

      console.log('\n   ⏰ Optimal Posting Times:');
      console.log(
        `      Weekday: ${(await weekdaySlot).timeSlot} (${((await weekdaySlot).confidence * 100).toFixed(0)}% confidence)`,
      );
      console.log(
        `      Weekend: ${(await weekendSlot).timeSlot} (${((await weekendSlot).confidence * 100).toFixed(0)}% confidence)`,
      );

      // Get toxic combos to avoid
      const toxicResult = await db.execute(sql`
        SELECT combo_name, severity, avg_drop_percentage, occurrence_count
        FROM toxic_combos
        WHERE is_active = true
        ORDER BY avg_drop_percentage DESC
        LIMIT 5
      `);

      if (toxicResult.rows.length > 0) {
        console.log('\n   ☠️ Toxic Combos to Avoid:');
        for (const combo of toxicResult.rows) {
          console.log(`      ${combo.combo_name}: -${combo.avg_drop_percentage}% (${combo.occurrence_count}x)`);
        }
      }

      console.log('\n   ✅ Insights ready for next generation\n');
    } catch (error: any) {
      console.error(`   ❌ Insights generation error: ${error.message}`);
    }
  }

  /**
   * Manually trigger analytics pipeline (for testing)
   */
  async runNow() {
    console.log('🔧 Manually triggering analytics pipeline...\n');
    await this.runAnalyticsPipeline();
  }
}

export const analyticsPollingScheduler = new AnalyticsPollingScheduler();
