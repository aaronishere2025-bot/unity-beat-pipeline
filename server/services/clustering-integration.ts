/**
 * Clustering Integration Layer
 *
 * Connects the DBSCAN clustering system to Unity's existing pipeline:
 * - Feature extraction from videos (audio, thumbnail, metadata)
 * - Integration with retention correlation loop
 * - Automatic cluster assignment for new uploads
 * - Recommendations based on cluster performance
 */

import { contentClusteringService, DBSCAN, calculateSilhouetteScore } from './clustering-service';
import { db } from '../db';
import { jobs, contentClusters, videoFeatureVectors, clusteringSystemState, clusteringRuns } from '@shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

// ============================================================================
// TYPES
// ============================================================================

interface VideoData {
  id: string;
  youtubeVideoId?: string;
  contentType: 'chill' | 'trap';

  // Audio analysis (from librosa)
  audioAnalysis?: {
    bpm: number;
    energy: number;
    spectralCentroid: number;
    spectralRolloff: number;
    zeroCrossingRate: number;
    mfcc: number[];
    chroma: number[];
  };

  // Metadata
  title: string;
  postingTime: Date;
  duration: number;
  sunoStyle?: string;
  tags?: string[];

  // Thumbnail analysis
  thumbnail?: {
    dominantHue: number;
    brightness: number;
    saturation: number;
  };

  // Performance (from YouTube Analytics)
  performance?: {
    views: number;
    likes: number;
    comments: number;
    ctr: number;
    impressions: number;
    avgRetention: number;
    retentionCurve?: number[]; // Second-by-second retention
  };
}

interface FeatureVector {
  id: string;
  videoId: string;
  contentType: string;
  features: number[];
  performance: {
    views: number;
    likes: number;
    ctr: number;
    avgRetention: number;
  };
}

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

/**
 * Extract feature vector from video data
 */
export function extractVideoFeatures(video: VideoData): FeatureVector {
  const audio = video.audioAnalysis;
  const thumbnail = video.thumbnail;
  const perf = video.performance;
  const postingDate = video.postingTime;

  // Calculate retention curve points if available
  const retentionPoints = calculateRetentionPoints(perf?.retentionCurve);

  // Build feature vector
  const features = contentClusteringService.extractFeatureVector({
    bpm: audio?.bpm ?? 120,
    energy: audio?.energy ?? 0.5,
    spectralCentroid: audio?.spectralCentroid ?? 2000,
    postingHour: postingDate.getHours(),
    postingDayOfWeek: postingDate.getDay(),
    retention10pct: retentionPoints.r10,
    retention50pct: retentionPoints.r50,
    retention90pct: retentionPoints.r90,
    thumbnailBrightness: thumbnail?.brightness ?? 0.5,
    thumbnailSaturation: thumbnail?.saturation ?? 0.5,
  });

  return {
    id: `feature_${video.id}`,
    videoId: video.id,
    contentType: video.contentType,
    features,
    performance: {
      views: perf?.views ?? 0,
      likes: perf?.likes ?? 0,
      ctr: perf?.ctr ?? 0,
      avgRetention: perf?.avgRetention ?? 0,
    },
  };
}

/**
 * Calculate retention at key percentage points from curve
 */
function calculateRetentionPoints(curve?: number[]): {
  r10: number;
  r25: number;
  r50: number;
  r75: number;
  r90: number;
} {
  if (!curve || curve.length === 0) {
    return { r10: 0.8, r25: 0.6, r50: 0.5, r75: 0.4, r90: 0.3 };
  }

  const len = curve.length;
  return {
    r10: curve[Math.floor(len * 0.1)] ?? 0.8,
    r25: curve[Math.floor(len * 0.25)] ?? 0.6,
    r50: curve[Math.floor(len * 0.5)] ?? 0.5,
    r75: curve[Math.floor(len * 0.75)] ?? 0.4,
    r90: curve[Math.floor(len * 0.9)] ?? 0.3,
  };
}

// ============================================================================
// CLUSTERING PIPELINE
// ============================================================================

class ClusteringPipeline {
  private clusterCache: Map<
    string,
    {
      clusters: any[];
      normStats: { means: number[]; stds: number[] };
      updatedAt: Date;
    }
  > = new Map();

  private readonly CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

  /**
   * Main entry point - check activation and run if ready
   */
  async runIfReady(): Promise<{
    ran: boolean;
    status: string;
    results?: any;
  }> {
    const activation = await contentClusteringService.checkActivation();

    if (!activation.isActive) {
      return {
        ran: false,
        status: activation.message,
      };
    }

    // Run for both content types
    const chillResults = await this.runForContentType('chill');
    const trapResults = await this.runForContentType('trap');

    return {
      ran: true,
      status: '✅ Clustering complete',
      results: { chill: chillResults, trap: trapResults },
    };
  }

  /**
   * Run clustering for a specific content type
   */
  async runForContentType(contentType: 'chill' | 'trap'): Promise<{
    clustersFound: number;
    noisePoints: number;
    silhouetteScore: number;
    topCluster: string;
  }> {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🔬 Clustering ${contentType.toUpperCase()} content`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Fetch videos from database
    const videos = await this.fetchVideosForClustering(contentType);

    if (videos.length < 50) {
      console.log(`⚠️ Only ${videos.length} videos - need at least 50 for meaningful clustering`);
      return {
        clustersFound: 0,
        noisePoints: 0,
        silhouetteScore: 0,
        topCluster: 'Insufficient data',
      };
    }

    // Extract features
    const featureVectors = videos.map((v) => extractVideoFeatures(v));

    // Run DBSCAN
    const results = await contentClusteringService.runClustering(
      contentType,
      featureVectors,
      true, // auto-tune epsilon
    );

    // Cache results for prediction
    const rawData = featureVectors.map((v) => v.features);
    const { stats } = contentClusteringService.normalizeFeatures(rawData);

    this.clusterCache.set(contentType, {
      clusters: results.clusters,
      normStats: stats,
      updatedAt: new Date(),
    });

    // Save clusters to database
    await this.saveClusters(contentType, results.clusters);

    // Update video assignments
    await this.updateVideoAssignments(featureVectors, results);

    return {
      clustersFound: results.clusters.length,
      noisePoints: results.noisePoints.length,
      silhouetteScore: results.silhouetteScore,
      topCluster: results.clusters[0]?.description ?? 'None',
    };
  }

  /**
   * Predict cluster for a new video (before upload)
   */
  async predictForNewVideo(video: VideoData): Promise<{
    predictedCluster: string | null;
    confidence: number;
    recommendations: {
      optimalPostingTime: number;
      targetBpm: number;
      similarPerformance: { avgViews: number; avgRetention: number };
    } | null;
  }> {
    const cache = this.clusterCache.get(video.contentType);

    if (!cache || Date.now() - cache.updatedAt.getTime() > this.CACHE_TTL_MS) {
      // Refresh cache
      await this.runForContentType(video.contentType);
    }

    const updatedCache = this.clusterCache.get(video.contentType);
    if (!updatedCache || updatedCache.clusters.length === 0) {
      return {
        predictedCluster: null,
        confidence: 0,
        recommendations: null,
      };
    }

    const featureVector = extractVideoFeatures(video);
    const prediction = contentClusteringService.predictCluster(
      featureVector,
      updatedCache.clusters,
      updatedCache.normStats,
    );

    if (prediction.isNoise || !prediction.cluster) {
      return {
        predictedCluster: 'Outlier (unique content)',
        confidence: prediction.confidence,
        recommendations: null,
      };
    }

    const recommendations = contentClusteringService.getClusterRecommendations(prediction.cluster);

    return {
      predictedCluster: prediction.cluster.description,
      confidence: prediction.confidence,
      recommendations: {
        optimalPostingTime: recommendations.optimalPostingTime,
        targetBpm: recommendations.targetBpm,
        similarPerformance: {
          avgViews: prediction.cluster.avgPerformance.views,
          avgRetention: prediction.cluster.avgPerformance.avgRetention,
        },
      },
    };
  }

  /**
   * Get actionable insights from clusters
   */
  async getInsights(contentType: 'chill' | 'trap'): Promise<{
    bestPerformingCluster: { description: string; avgRetention: number; videoCount: number };
    worstPerformingCluster: { description: string; avgRetention: number; videoCount: number };
    optimalPostingWindows: { hour: number; avgRetention: number }[];
    recommendations: string[];
  }> {
    const cache = this.clusterCache.get(contentType);

    if (!cache || cache.clusters.length === 0) {
      return {
        bestPerformingCluster: { description: 'No data', avgRetention: 0, videoCount: 0 },
        worstPerformingCluster: { description: 'No data', avgRetention: 0, videoCount: 0 },
        optimalPostingWindows: [],
        recommendations: ['Need more data - clustering not yet active'],
      };
    }

    const sorted = [...cache.clusters].sort((a, b) => b.avgPerformance.avgRetention - a.avgPerformance.avgRetention);

    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Find optimal posting windows
    const hourPerformance = new Map<number, { total: number; count: number }>();
    for (const cluster of cache.clusters) {
      const hour = Math.round(cluster.centroid[3] / 0.8); // Undo weight
      const existing = hourPerformance.get(hour) ?? { total: 0, count: 0 };
      hourPerformance.set(hour, {
        total: existing.total + cluster.avgPerformance.avgRetention * cluster.members.length,
        count: existing.count + cluster.members.length,
      });
    }

    const optimalWindows = [...hourPerformance.entries()]
      .map(([hour, data]) => ({ hour, avgRetention: data.total / data.count }))
      .sort((a, b) => b.avgRetention - a.avgRetention)
      .slice(0, 3);

    // Generate recommendations
    const recommendations: string[] = [];

    if (best.avgPerformance.avgRetention > 0.5) {
      const recs = contentClusteringService.getClusterRecommendations(best);
      recommendations.push(
        `🔥 Top cluster averages ${(best.avgPerformance.avgRetention * 100).toFixed(0)}% retention`,
        `📍 Optimal BPM range: ${recs.targetBpm - 10} - ${recs.targetBpm + 10}`,
        `🕐 Best posting time: ${formatHour(recs.optimalPostingTime)}`,
      );
    }

    if (worst.avgPerformance.avgRetention < 0.3 && worst.members.length > 10) {
      recommendations.push(
        `⚠️ Avoid: ${worst.description} (${(worst.avgPerformance.avgRetention * 100).toFixed(0)}% avg retention)`,
      );
    }

    return {
      bestPerformingCluster: {
        description: best.description,
        avgRetention: best.avgPerformance.avgRetention,
        videoCount: best.members.length,
      },
      worstPerformingCluster: {
        description: worst.description,
        avgRetention: worst.avgPerformance.avgRetention,
        videoCount: worst.members.length,
      },
      optimalPostingWindows: optimalWindows,
      recommendations,
    };
  }

  // ==========================================================================
  // DATABASE OPERATIONS
  // ==========================================================================

  private async fetchVideosForClustering(contentType: string): Promise<VideoData[]> {
    try {
      // Query jobs with music mode that match content type
      const musicJobs = await db
        .select()
        .from(jobs)
        .where(and(eq(jobs.mode, 'music'), eq(jobs.status, 'completed')))
        .orderBy(desc(jobs.createdAt))
        .limit(500);

      // Filter by content type based on scriptContent keywords
      const filtered = musicJobs.filter((job) => {
        const content = (job.scriptContent || '').toLowerCase();
        if (contentType === 'chill') {
          return (
            content.includes('lofi') ||
            content.includes('chill') ||
            content.includes('jazz') ||
            content.includes('ambient')
          );
        } else {
          return (
            content.includes('trap') ||
            content.includes('drill') ||
            content.includes('phonk') ||
            content.includes('hard')
          );
        }
      });

      // Convert to VideoData format
      const videos: VideoData[] = filtered.map((job) => ({
        id: job.id,
        youtubeVideoId: job.youtubeVideoId || undefined,
        contentType: contentType as 'chill' | 'trap',
        title: job.scriptName || 'Untitled',
        postingTime: job.createdAt,
        duration: job.duration || 120,
        sunoStyle: job.scriptContent || undefined,
        audioAnalysis: job.musicAnalysis
          ? {
              bpm: (job.musicAnalysis as any).bpm || 120,
              energy: (job.musicAnalysis as any).energy || 0.5,
              spectralCentroid: 2000,
              spectralRolloff: 4000,
              zeroCrossingRate: 0.1,
              mfcc: [],
              chroma: [],
            }
          : undefined,
        performance: {
          views: 0, // TODO: Get from YouTube Analytics when available
          likes: 0,
          comments: 0,
          ctr: 0,
          impressions: 0,
          avgRetention: 0.5, // Default until we have real data
        },
      }));

      console.log(`📥 Fetched ${videos.length} ${contentType} videos from database`);
      return videos;
    } catch (error) {
      console.error('Failed to fetch videos:', error);
      return [];
    }
  }

  private async saveClusters(contentType: string, clusters: any[]): Promise<void> {
    try {
      // Delete existing clusters for this content type
      await db.delete(contentClusters).where(eq(contentClusters.contentType, contentType));

      // Insert new clusters
      for (const cluster of clusters) {
        await db.insert(contentClusters).values({
          contentType,
          clusterIndex: cluster.index,
          centroid: cluster.centroid,
          avgRetention: cluster.avgPerformance.avgRetention,
          avgViews: cluster.avgPerformance.views,
          avgCtr: cluster.avgPerformance.ctr,
          avgLikes: cluster.avgPerformance.likes,
          memberCount: cluster.members.length,
          description: cluster.description,
        });
      }

      console.log(`💾 Saved ${clusters.length} clusters for ${contentType}`);
    } catch (error) {
      console.error('Failed to save clusters:', error);
    }
  }

  private async updateVideoAssignments(
    vectors: FeatureVector[],
    results: { clusters: any[]; noisePoints: FeatureVector[] },
  ): Promise<void> {
    console.log(`📝 Updating cluster assignments for ${vectors.length} videos`);
    // TODO: Update video_feature_vectors table when we have YouTube video IDs
  }
}

// Helper
function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

// Export singleton
export const clusteringPipeline = new ClusteringPipeline();

// ============================================================================
// INTEGRATION HOOKS - Add to your existing pipeline
// ============================================================================

/**
 * Hook into video upload pipeline
 * Call this before uploading to get cluster prediction
 */
export async function preUploadClusterAnalysis(video: VideoData) {
  const prediction = await clusteringPipeline.predictForNewVideo(video);

  console.log(`\n🎯 Cluster Prediction for "${video.title}"`);
  console.log(`   Cluster: ${prediction.predictedCluster}`);
  console.log(`   Confidence: ${(prediction.confidence * 100).toFixed(0)}%`);

  if (prediction.recommendations) {
    console.log(
      `   Expected performance: ~${prediction.recommendations.similarPerformance.avgViews.toFixed(0)} views, ${(prediction.recommendations.similarPerformance.avgRetention * 100).toFixed(0)}% retention`,
    );
  }

  return prediction;
}

/**
 * Hook into analytics update loop
 * Call this after fetching new YouTube analytics
 */
export async function postAnalyticsClusterUpdate() {
  const result = await clusteringPipeline.runIfReady();

  if (result.ran) {
    console.log(`\n📊 Cluster Update Complete`);
    console.log(
      `   Chill: ${result.results.chill.clustersFound} clusters, ${result.results.chill.silhouetteScore.toFixed(2)} quality`,
    );
    console.log(
      `   Trap: ${result.results.trap.clustersFound} clusters, ${result.results.trap.silhouetteScore.toFixed(2)} quality`,
    );
  } else {
    console.log(`\n⏳ ${result.status}`);
  }

  return result;
}

/**
 * Get dashboard insights
 */
export async function getClusteringDashboard() {
  const chillInsights = await clusteringPipeline.getInsights('chill');
  const trapInsights = await clusteringPipeline.getInsights('trap');
  const activation = await contentClusteringService.checkActivation();

  return {
    status: {
      isActive: activation.isActive,
      chillProgress: `${(activation.chillProgress * 100).toFixed(0)}%`,
      trapProgress: `${(activation.trapProgress * 100).toFixed(0)}%`,
    },
    chill: chillInsights,
    trap: trapInsights,
  };
}
