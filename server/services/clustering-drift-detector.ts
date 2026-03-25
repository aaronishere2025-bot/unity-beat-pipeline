/**
 * CLUSTERING DRIFT DETECTOR
 *
 * Tracks Kullback-Leibler (KL) Divergence between channels to detect if
 * clustering results are channel-dependent. High KL divergence indicates
 * that different channels have fundamentally different "winning strategies."
 *
 * KL Divergence: D_KL(P || Q) = Σ P(i) * log(P(i) / Q(i))
 *
 * @example
 * ```typescript
 * const detector = new ClusteringDriftDetector();
 *
 * // Record cluster assignments per channel
 * await detector.recordChannelCluster('channel_a', 'lofi', 2); // Video assigned to cluster 2
 * await detector.recordChannelCluster('channel_b', 'lofi', 5); // Video assigned to cluster 5
 *
 * // Calculate drift
 * const drift = await detector.calculateDrift('channel_a', 'channel_b', 'lofi');
 * console.log(drift.klDivergence); // 0.42 (moderate drift)
 * ```
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

// ============================================================================
// INTERFACES
// ============================================================================

export interface ClusterDistribution {
  channelId: string;
  contentType: 'lofi' | 'trap' | 'chill' | 'history';
  clusterAssignments: Map<number, number>; // cluster_id -> count
  totalVideos: number;
  lastUpdated: Date;
}

export interface DriftMetrics {
  channelA: string;
  channelB: string;
  contentType: string;
  klDivergenceAtoB: number; // D_KL(A || B)
  klDivergenceBtoA: number; // D_KL(B || A)
  symmetricKL: number; // Average of both directions
  severity: 'low' | 'moderate' | 'high' | 'critical';
  isDrifting: boolean;
  timestamp: Date;
}

export interface DriftAlert {
  channels: string[];
  contentType: string;
  symmetricKL: number;
  reason: string;
  recommendation: string;
}

// ============================================================================
// DRIFT THRESHOLDS
// ============================================================================
const DRIFT_THRESHOLDS = {
  low: 0.1, // < 0.1: Channels are very similar
  moderate: 0.3, // 0.1-0.3: Some divergence, acceptable
  high: 0.5, // 0.3-0.5: Significant drift, investigate
  critical: 0.8, // > 0.8: Completely different strategies
};

const MIN_VIDEOS_PER_CHANNEL = 20; // Minimum videos needed for reliable distribution

/**
 * Clustering Drift Detector Service
 */
class ClusteringDriftDetectorService {
  private distributions = new Map<string, ClusterDistribution>();

  // ==========================================================================
  // RECORDING CLUSTER ASSIGNMENTS
  // ==========================================================================

  /**
   * Record a video's cluster assignment for a channel
   */
  async recordChannelCluster(
    channelId: string,
    contentType: 'lofi' | 'trap' | 'chill' | 'history',
    clusterId: number,
  ): Promise<void> {
    const key = `${channelId}_${contentType}`;
    let dist = this.distributions.get(key);

    if (!dist) {
      dist = {
        channelId,
        contentType,
        clusterAssignments: new Map(),
        totalVideos: 0,
        lastUpdated: new Date(),
      };
      this.distributions.set(key, dist);
    }

    const count = dist.clusterAssignments.get(clusterId) || 0;
    dist.clusterAssignments.set(clusterId, count + 1);
    dist.totalVideos++;
    dist.lastUpdated = new Date();
  }

  /**
   * Bulk load cluster assignments from database
   */
  async loadDistributionsFromDB(contentType: string): Promise<void> {
    console.log(`📊 Loading cluster distributions for ${contentType}...`);

    // Query: Get all videos with cluster assignments grouped by channel
    const result = await db.execute(sql`
      SELECT
        y.channel_id,
        v.cluster_id,
        COUNT(*) as video_count
      FROM video_feature_vectors v
      JOIN jobs j ON v.video_id = j.id
      LEFT JOIN youtube_analytics y ON j.youtube_video_id = y.video_id
      WHERE v.content_type = ${contentType}
        AND v.cluster_id IS NOT NULL
        AND y.channel_id IS NOT NULL
      GROUP BY y.channel_id, v.cluster_id
      ORDER BY y.channel_id, v.cluster_id
    `);

    const rows = result.rows as Array<{
      channel_id: string;
      cluster_id: number;
      video_count: number;
    }>;

    // Aggregate into distributions
    const channelMap = new Map<string, ClusterDistribution>();

    for (const row of rows) {
      const key = `${row.channel_id}_${contentType}`;
      let dist = channelMap.get(key);

      if (!dist) {
        dist = {
          channelId: row.channel_id,
          contentType: contentType as any,
          clusterAssignments: new Map(),
          totalVideos: 0,
          lastUpdated: new Date(),
        };
        channelMap.set(key, dist);
      }

      dist!.clusterAssignments.set(row.cluster_id, parseInt(row.video_count as any));
      dist!.totalVideos += parseInt(row.video_count as any);
    }

    // Store in memory
    for (const [key, dist] of channelMap) {
      this.distributions.set(key, dist);
    }

    console.log(`   ✅ Loaded ${channelMap.size} channel distributions`);
  }

  // ==========================================================================
  // KL DIVERGENCE CALCULATION
  // ==========================================================================

  /**
   * Calculate KL divergence between two probability distributions
   * D_KL(P || Q) = Σ P(i) * log(P(i) / Q(i))
   */
  private calculateKLDivergence(
    distP: Map<number, number>,
    distQ: Map<number, number>,
    totalP: number,
    totalQ: number,
  ): number {
    // Get all unique cluster IDs from both distributions
    const allClusters = new Set([...distP.keys(), ...distQ.keys()]);

    let klDiv = 0;
    const epsilon = 1e-10; // Small value to avoid log(0)

    for (const clusterId of allClusters) {
      const countP = distP.get(clusterId) || 0;
      const countQ = distQ.get(clusterId) || 0;

      // Convert to probabilities with Laplace smoothing
      const probP = (countP + epsilon) / (totalP + epsilon * allClusters.size);
      const probQ = (countQ + epsilon) / (totalQ + epsilon * allClusters.size);

      klDiv += probP * Math.log(probP / probQ);
    }

    return klDiv;
  }

  /**
   * Calculate drift metrics between two channels for a content type
   */
  async calculateDrift(channelA: string, channelB: string, contentType: string): Promise<DriftMetrics | null> {
    const keyA = `${channelA}_${contentType}`;
    const keyB = `${channelB}_${contentType}`;

    const distA = this.distributions.get(keyA);
    const distB = this.distributions.get(keyB);

    if (!distA || !distB) {
      console.warn(`⚠️  Missing distribution data for ${channelA} or ${channelB}`);
      return null;
    }

    // Check minimum videos threshold
    if (distA.totalVideos < MIN_VIDEOS_PER_CHANNEL || distB.totalVideos < MIN_VIDEOS_PER_CHANNEL) {
      console.warn(`⚠️  Insufficient videos for drift calculation (need ${MIN_VIDEOS_PER_CHANNEL} per channel)`);
      return null;
    }

    // Calculate KL divergence in both directions
    const klAtoB = this.calculateKLDivergence(
      distA.clusterAssignments,
      distB.clusterAssignments,
      distA.totalVideos,
      distB.totalVideos,
    );

    const klBtoA = this.calculateKLDivergence(
      distB.clusterAssignments,
      distA.clusterAssignments,
      distB.totalVideos,
      distA.totalVideos,
    );

    // Symmetric KL divergence (average of both directions)
    const symmetricKL = (klAtoB + klBtoA) / 2;

    // Determine severity
    let severity: 'low' | 'moderate' | 'high' | 'critical';
    if (symmetricKL < DRIFT_THRESHOLDS.low) {
      severity = 'low';
    } else if (symmetricKL < DRIFT_THRESHOLDS.moderate) {
      severity = 'moderate';
    } else if (symmetricKL < DRIFT_THRESHOLDS.high) {
      severity = 'high';
    } else {
      severity = 'critical';
    }

    const isDrifting = symmetricKL >= DRIFT_THRESHOLDS.moderate;

    return {
      channelA,
      channelB,
      contentType,
      klDivergenceAtoB: klAtoB,
      klDivergenceBtoA: klBtoA,
      symmetricKL,
      severity,
      isDrifting,
      timestamp: new Date(),
    };
  }

  /**
   * Check drift for all channel pairs for a content type
   */
  async checkAllDrift(contentType: string): Promise<DriftMetrics[]> {
    await this.loadDistributionsFromDB(contentType);

    const channels = new Set<string>();
    for (const key of this.distributions.keys()) {
      if (key.endsWith(`_${contentType}`)) {
        const channelId = key.split('_')[0];
        channels.add(channelId);
      }
    }

    const channelList = Array.from(channels);
    const driftMetrics: DriftMetrics[] = [];

    console.log(`\n🔍 Checking drift between ${channelList.length} channels for ${contentType}...`);

    // Compare all pairs
    for (let i = 0; i < channelList.length; i++) {
      for (let j = i + 1; j < channelList.length; j++) {
        const drift = await this.calculateDrift(channelList[i], channelList[j], contentType);
        if (drift) {
          driftMetrics.push(drift);

          const emoji = drift.isDrifting ? '⚠️' : '✅';
          console.log(
            `   ${emoji} ${drift.channelA} ↔ ${drift.channelB}: KL=${drift.symmetricKL.toFixed(3)} (${drift.severity})`,
          );
        }
      }
    }

    return driftMetrics;
  }

  /**
   * Generate drift alerts for critical cases
   */
  async generateAlerts(driftMetrics: DriftMetrics[]): Promise<DriftAlert[]> {
    const alerts: DriftAlert[] = [];

    for (const drift of driftMetrics) {
      if (drift.severity === 'high' || drift.severity === 'critical') {
        let reason: string;
        let recommendation: string;

        if (drift.severity === 'critical') {
          reason = `Channels ${drift.channelA} and ${drift.channelB} have completely different winning strategies (KL=${drift.symmetricKL.toFixed(3)})`;
          recommendation = `Clusters are channel-dependent. Consider separate clustering for each channel, or investigate why audiences differ so drastically.`;
        } else {
          reason = `Significant drift detected between ${drift.channelA} and ${drift.channelB} (KL=${drift.symmetricKL.toFixed(3)})`;
          recommendation = `Monitor these channels closely. Different audience preferences may require different content strategies.`;
        }

        alerts.push({
          channels: [drift.channelA, drift.channelB],
          contentType: drift.contentType,
          symmetricKL: drift.symmetricKL,
          reason,
          recommendation,
        });
      }
    }

    return alerts;
  }

  /**
   * Get distribution for a specific channel
   */
  getDistribution(channelId: string, contentType: string): ClusterDistribution | null {
    const key = `${channelId}_${contentType}`;
    return this.distributions.get(key) || null;
  }

  /**
   * Print distribution summary
   */
  printDistribution(channelId: string, contentType: string): void {
    const dist = this.getDistribution(channelId, contentType);
    if (!dist) {
      console.log(`No distribution found for ${channelId} (${contentType})`);
      return;
    }

    console.log(`\n📊 Cluster Distribution: ${channelId} (${contentType})`);
    console.log(`   Total Videos: ${dist.totalVideos}`);
    console.log(`   Clusters:`);

    const sorted = Array.from(dist.clusterAssignments.entries()).sort((a, b) => b[1] - a[1]);

    for (const [clusterId, count] of sorted) {
      const percentage = ((count / dist.totalVideos) * 100).toFixed(1);
      console.log(`      Cluster ${clusterId}: ${count} videos (${percentage}%)`);
    }
  }
}

export const clusteringDriftDetector = new ClusteringDriftDetectorService();
