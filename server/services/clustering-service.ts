/**
 * Content Clustering Service - DBSCAN with Auto-Tuning
 *
 * Discovers performance archetypes in video content through unsupervised learning.
 * DORMANT until activation thresholds are met (200 chill + 200 trap).
 *
 * Features:
 * - DBSCAN clustering (automatic cluster discovery + outlier detection)
 * - Auto-tuning of epsilon via silhouette score optimization
 * - Feature normalization for multi-scale inputs
 * - Cluster labeling and description generation
 * - Incremental updates as new videos come in
 */

// Types
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

interface ClusterResult {
  labels: number[]; // -1 = noise
  clustersFound: number;
  noiseCount: number;
  silhouetteScore: number;
}

interface Cluster {
  index: number;
  centroid: number[];
  members: FeatureVector[];
  avgPerformance: {
    views: number;
    likes: number;
    ctr: number;
    avgRetention: number;
  };
  description: string;
}

interface ClusteringConfig {
  epsilon: number;
  minSamples: number;
}

interface NormalizationStats {
  means: number[];
  stds: number[];
}

interface EpsilonTuningResult {
  epsilon: number;
  clusters: number;
  noise: number;
  silhouette: number;
}

// ============================================================================
// ACTIVATION THRESHOLDS
// ============================================================================

const ACTIVATION_THRESHOLDS = {
  chill: 200,
  trap: 200,
};

// ============================================================================
// FEATURE WEIGHTS - Which features matter most for clustering
// ============================================================================

const FEATURE_WEIGHTS = {
  // Audio features (high weight - core identity)
  bpm: 1.5,
  energy: 1.2,
  spectralCentroid: 1.0,

  // Temporal features (medium weight - posting patterns)
  postingHour: 0.8,
  postingDayOfWeek: 0.6,

  // Retention curve (high weight - performance pattern)
  retention10pct: 1.3,
  retention50pct: 1.5,
  retention90pct: 1.3,

  // Thumbnail (lower weight - supplementary)
  thumbnailBrightness: 0.5,
  thumbnailSaturation: 0.5,
};

// ============================================================================
// DBSCAN IMPLEMENTATION
// ============================================================================

export class DBSCAN {
  private epsilon: number;
  private minSamples: number;
  private labels: number[] = [];
  private visited: Set<number> = new Set();

  constructor(epsilon: number, minSamples: number) {
    this.epsilon = epsilon;
    this.minSamples = minSamples;
  }

  /**
   * Run DBSCAN clustering
   */
  fit(data: number[][]): number[] {
    const n = data.length;
    this.labels = new Array(n).fill(-1); // -1 = noise/unassigned
    this.visited = new Set();

    let clusterIndex = 0;

    for (let i = 0; i < n; i++) {
      if (this.visited.has(i)) continue;
      this.visited.add(i);

      const neighbors = this.regionQuery(data, i);

      if (neighbors.length < this.minSamples) {
        // Mark as noise (might be reassigned later)
        this.labels[i] = -1;
      } else {
        // Start new cluster
        this.expandCluster(data, i, neighbors, clusterIndex);
        clusterIndex++;
      }
    }

    return this.labels;
  }

  /**
   * Find all points within epsilon distance
   */
  private regionQuery(data: number[][], pointIndex: number): number[] {
    const neighbors: number[] = [];
    const point = data[pointIndex];

    for (let i = 0; i < data.length; i++) {
      if (this.euclideanDistance(point, data[i]) <= this.epsilon) {
        neighbors.push(i);
      }
    }

    return neighbors;
  }

  /**
   * Expand cluster from seed point
   */
  private expandCluster(data: number[][], pointIndex: number, neighbors: number[], clusterIndex: number): void {
    this.labels[pointIndex] = clusterIndex;

    const queue = [...neighbors];

    while (queue.length > 0) {
      const currentPoint = queue.shift()!;

      if (!this.visited.has(currentPoint)) {
        this.visited.add(currentPoint);
        const currentNeighbors = this.regionQuery(data, currentPoint);

        if (currentNeighbors.length >= this.minSamples) {
          // Add new neighbors to queue
          for (const neighbor of currentNeighbors) {
            if (!queue.includes(neighbor)) {
              queue.push(neighbor);
            }
          }
        }
      }

      // Assign to cluster if not already assigned
      if (this.labels[currentPoint] === -1) {
        this.labels[currentPoint] = clusterIndex;
      }
    }
  }

  /**
   * Euclidean distance between two points
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }
}

// ============================================================================
// SILHOUETTE SCORE - Cluster quality metric
// ============================================================================

export function calculateSilhouetteScore(data: number[][], labels: number[]): number {
  const n = data.length;
  const uniqueLabels = [...new Set(labels)].filter((l) => l !== -1);

  // Need at least 2 clusters
  if (uniqueLabels.length < 2) return 0;

  let totalScore = 0;
  let validPoints = 0;

  for (let i = 0; i < n; i++) {
    if (labels[i] === -1) continue; // Skip noise

    const a = avgIntraClusterDistance(data, labels, i);
    const b = minInterClusterDistance(data, labels, i, uniqueLabels);

    if (Math.max(a, b) === 0) continue;

    const silhouette = (b - a) / Math.max(a, b);
    totalScore += silhouette;
    validPoints++;
  }

  return validPoints > 0 ? totalScore / validPoints : 0;
}

function avgIntraClusterDistance(data: number[][], labels: number[], pointIndex: number): number {
  const cluster = labels[pointIndex];
  let sum = 0;
  let count = 0;

  for (let i = 0; i < data.length; i++) {
    if (i !== pointIndex && labels[i] === cluster) {
      sum += euclidean(data[pointIndex], data[i]);
      count++;
    }
  }

  return count > 0 ? sum / count : 0;
}

function minInterClusterDistance(
  data: number[][],
  labels: number[],
  pointIndex: number,
  uniqueLabels: number[],
): number {
  const currentCluster = labels[pointIndex];
  let minAvgDist = Infinity;

  for (const cluster of uniqueLabels) {
    if (cluster === currentCluster) continue;

    let sum = 0;
    let count = 0;

    for (let i = 0; i < data.length; i++) {
      if (labels[i] === cluster) {
        sum += euclidean(data[pointIndex], data[i]);
        count++;
      }
    }

    if (count > 0) {
      minAvgDist = Math.min(minAvgDist, sum / count);
    }
  }

  return minAvgDist === Infinity ? 0 : minAvgDist;
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  return Math.sqrt(sum);
}

// ============================================================================
// MAIN CLUSTERING SERVICE
// ============================================================================

class ContentClusteringService {
  private state: {
    isActive: boolean;
    chillCount: number;
    trapCount: number;
    currentEpsilon: number;
    currentMinSamples: number;
  };

  constructor() {
    this.state = {
      isActive: false,
      chillCount: 0,
      trapCount: 0,
      currentEpsilon: 0.5,
      currentMinSamples: 5,
    };
  }

  // ==========================================================================
  // ACTIVATION CHECK
  // ==========================================================================

  async checkActivation(): Promise<{
    isActive: boolean;
    chillProgress: number;
    trapProgress: number;
    message: string;
  }> {
    // In production, query actual counts from database
    const counts = await this.getContentTypeCounts();

    this.state.chillCount = counts.chill;
    this.state.trapCount = counts.trap;

    const chillProgress = Math.min(counts.chill / ACTIVATION_THRESHOLDS.chill, 1);
    const trapProgress = Math.min(counts.trap / ACTIVATION_THRESHOLDS.trap, 1);

    const shouldActivate = counts.chill >= ACTIVATION_THRESHOLDS.chill && counts.trap >= ACTIVATION_THRESHOLDS.trap;

    if (shouldActivate && !this.state.isActive) {
      this.state.isActive = true;
      console.log('🎯 CLUSTERING SYSTEM ACTIVATED');
      return {
        isActive: true,
        chillProgress,
        trapProgress,
        message: '🎯 Clustering system activated! Running initial analysis...',
      };
    }

    if (!shouldActivate) {
      const chillNeeded = ACTIVATION_THRESHOLDS.chill - counts.chill;
      const trapNeeded = ACTIVATION_THRESHOLDS.trap - counts.trap;
      return {
        isActive: false,
        chillProgress,
        trapProgress,
        message: `📊 Clustering dormant - need ${Math.max(0, chillNeeded)} more chill, ${Math.max(0, trapNeeded)} more trap`,
      };
    }

    return {
      isActive: this.state.isActive,
      chillProgress,
      trapProgress,
      message: '✅ Clustering system active',
    };
  }

  /**
   * Get content type counts from database
   */
  private async getContentTypeCounts(): Promise<{ chill: number; trap: number }> {
    try {
      const { db } = await import('../db');
      const { jobs } = await import('@shared/schema');
      const { eq, sql } = await import('drizzle-orm');

      const result = await db
        .select({
          contentType: sql<string>`
            CASE
              WHEN script_content LIKE '%lofi%' OR script_content LIKE '%chill%' OR script_content LIKE '%jazz%' THEN 'chill'
              WHEN script_content LIKE '%trap%' OR script_content LIKE '%drill%' OR script_content LIKE '%phonk%' THEN 'trap'
              ELSE 'other'
            END
          `,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(jobs)
        .where(eq(jobs.mode, 'music'))
        .groupBy(sql`content_type`);

      let chill = 0;
      let trap = 0;

      for (const row of result) {
        if (row.contentType === 'chill') chill = row.count;
        if (row.contentType === 'trap') trap = row.count;
      }

      return { chill, trap };
    } catch (error) {
      console.error('Failed to get content type counts:', error);
      return { chill: 0, trap: 0 };
    }
  }

  // ==========================================================================
  // FEATURE EXTRACTION
  // ==========================================================================

  extractFeatureVector(video: {
    bpm?: number;
    energy?: number;
    spectralCentroid?: number;
    postingHour?: number;
    postingDayOfWeek?: number;
    retention10pct?: number;
    retention50pct?: number;
    retention90pct?: number;
    thumbnailBrightness?: number;
    thumbnailSaturation?: number;
  }): number[] {
    // Extract and weight features
    return [
      (video.bpm ?? 120) * FEATURE_WEIGHTS.bpm,
      (video.energy ?? 0.5) * FEATURE_WEIGHTS.energy,
      (video.spectralCentroid ?? 2000) * FEATURE_WEIGHTS.spectralCentroid,
      (video.postingHour ?? 12) * FEATURE_WEIGHTS.postingHour,
      (video.postingDayOfWeek ?? 3) * FEATURE_WEIGHTS.postingDayOfWeek,
      (video.retention10pct ?? 0.8) * FEATURE_WEIGHTS.retention10pct,
      (video.retention50pct ?? 0.5) * FEATURE_WEIGHTS.retention50pct,
      (video.retention90pct ?? 0.3) * FEATURE_WEIGHTS.retention90pct,
      (video.thumbnailBrightness ?? 0.5) * FEATURE_WEIGHTS.thumbnailBrightness,
      (video.thumbnailSaturation ?? 0.5) * FEATURE_WEIGHTS.thumbnailSaturation,
    ];
  }

  // ==========================================================================
  // NORMALIZATION
  // ==========================================================================

  normalizeFeatures(vectors: number[][]): { normalized: number[][]; stats: NormalizationStats } {
    if (vectors.length === 0) return { normalized: [], stats: { means: [], stds: [] } };

    const numFeatures = vectors[0].length;
    const means: number[] = new Array(numFeatures).fill(0);
    const stds: number[] = new Array(numFeatures).fill(0);

    // Calculate means
    for (const vec of vectors) {
      for (let i = 0; i < numFeatures; i++) {
        means[i] += vec[i];
      }
    }
    for (let i = 0; i < numFeatures; i++) {
      means[i] /= vectors.length;
    }

    // Calculate standard deviations
    for (const vec of vectors) {
      for (let i = 0; i < numFeatures; i++) {
        stds[i] += Math.pow(vec[i] - means[i], 2);
      }
    }
    for (let i = 0; i < numFeatures; i++) {
      stds[i] = Math.sqrt(stds[i] / vectors.length) || 1; // Avoid division by zero
    }

    // Normalize (z-score)
    const normalized = vectors.map((vec) => vec.map((val, i) => (val - means[i]) / stds[i]));

    return { normalized, stats: { means, stds } };
  }

  // ==========================================================================
  // AUTO-TUNING EPSILON
  // ==========================================================================

  autoTuneEpsilon(
    data: number[][],
    minSamples: number,
    epsilonRange: number[] = [0.1, 0.3, 0.5, 0.7, 1.0, 1.5, 2.0],
  ): { bestEpsilon: number; bestScore: number; results: EpsilonTuningResult[] } {
    const results: EpsilonTuningResult[] = [];
    let bestEpsilon = epsilonRange[0];
    let bestScore = -1;

    console.log('🔧 Auto-tuning epsilon...');

    for (const epsilon of epsilonRange) {
      const dbscan = new DBSCAN(epsilon, minSamples);
      const labels = dbscan.fit(data);

      const uniqueClusters = [...new Set(labels)].filter((l) => l !== -1);
      const noiseCount = labels.filter((l) => l === -1).length;
      const clusterCount = uniqueClusters.length;

      // Skip if no clusters found or all noise
      if (clusterCount < 2) {
        results.push({
          epsilon,
          clusters: clusterCount,
          noise: noiseCount,
          silhouette: 0,
        });
        continue;
      }

      const silhouette = calculateSilhouetteScore(data, labels);

      results.push({
        epsilon,
        clusters: clusterCount,
        noise: noiseCount,
        silhouette,
      });

      console.log(
        `  ε=${epsilon.toFixed(2)}: ${clusterCount} clusters, ${noiseCount} noise, silhouette=${silhouette.toFixed(3)}`,
      );

      if (silhouette > bestScore) {
        bestScore = silhouette;
        bestEpsilon = epsilon;
      }
    }

    console.log(`✅ Best epsilon: ${bestEpsilon} (silhouette: ${bestScore.toFixed(3)})`);

    return { bestEpsilon, bestScore, results };
  }

  // ==========================================================================
  // RUN CLUSTERING
  // ==========================================================================

  async runClustering(
    contentType: 'chill' | 'trap',
    vectors: FeatureVector[],
    autoTune: boolean = true,
  ): Promise<{
    clusters: Cluster[];
    noisePoints: FeatureVector[];
    config: ClusteringConfig;
    silhouetteScore: number;
  }> {
    console.log(`\n🔬 Running DBSCAN clustering for ${contentType} (${vectors.length} videos)`);

    // Extract raw feature vectors
    const rawData = vectors.map((v) => v.features);

    // Normalize
    const { normalized, stats } = this.normalizeFeatures(rawData);

    // Auto-tune if requested
    const config: ClusteringConfig = {
      epsilon: this.state.currentEpsilon,
      minSamples: this.state.currentMinSamples,
    };

    if (autoTune) {
      const tuning = this.autoTuneEpsilon(normalized, config.minSamples);
      config.epsilon = tuning.bestEpsilon;
      this.state.currentEpsilon = tuning.bestEpsilon;
    }

    // Run DBSCAN
    const dbscan = new DBSCAN(config.epsilon, config.minSamples);
    const labels = dbscan.fit(normalized);

    // Calculate final silhouette
    const silhouetteScore = calculateSilhouetteScore(normalized, labels);

    // Group results
    const clusterMap = new Map<number, FeatureVector[]>();
    const noisePoints: FeatureVector[] = [];

    for (let i = 0; i < vectors.length; i++) {
      const label = labels[i];
      if (label === -1) {
        noisePoints.push(vectors[i]);
      } else {
        if (!clusterMap.has(label)) {
          clusterMap.set(label, []);
        }
        clusterMap.get(label)!.push(vectors[i]);
      }
    }

    // Build cluster objects
    const clusters: Cluster[] = [];
    for (const [index, members] of clusterMap) {
      const centroid = this.calculateCentroid(members.map((m) => m.features));
      const avgPerformance = this.calculateAvgPerformance(members);
      const description = this.generateClusterDescription(members, contentType, avgPerformance);

      clusters.push({
        index,
        centroid,
        members,
        avgPerformance,
        description,
      });
    }

    // Sort by average retention (best performing first)
    clusters.sort((a, b) => b.avgPerformance.avgRetention - a.avgPerformance.avgRetention);

    console.log(`\n📊 Clustering Results:`);
    console.log(`   Clusters found: ${clusters.length}`);
    console.log(`   Noise points: ${noisePoints.length}`);
    console.log(`   Silhouette score: ${silhouetteScore.toFixed(3)}`);
    console.log(`\n🏆 Top Performing Clusters:`);

    for (const cluster of clusters.slice(0, 3)) {
      console.log(
        `   Cluster ${cluster.index}: ${cluster.members.length} videos, ${(cluster.avgPerformance.avgRetention * 100).toFixed(1)}% retention`,
      );
      console.log(`   └─ ${cluster.description}`);
    }

    return {
      clusters,
      noisePoints,
      config,
      silhouetteScore,
    };
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  private calculateCentroid(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];

    const numFeatures = vectors[0].length;
    const centroid = new Array(numFeatures).fill(0);

    for (const vec of vectors) {
      for (let i = 0; i < numFeatures; i++) {
        centroid[i] += vec[i];
      }
    }

    return centroid.map((v) => v / vectors.length);
  }

  private calculateAvgPerformance(members: FeatureVector[]): {
    views: number;
    likes: number;
    ctr: number;
    avgRetention: number;
  } {
    const sum = members.reduce(
      (acc, m) => ({
        views: acc.views + m.performance.views,
        likes: acc.likes + m.performance.likes,
        ctr: acc.ctr + m.performance.ctr,
        avgRetention: acc.avgRetention + m.performance.avgRetention,
      }),
      { views: 0, likes: 0, ctr: 0, avgRetention: 0 },
    );

    return {
      views: sum.views / members.length,
      likes: sum.likes / members.length,
      ctr: sum.ctr / members.length,
      avgRetention: sum.avgRetention / members.length,
    };
  }

  private generateClusterDescription(
    members: FeatureVector[],
    contentType: string,
    avgPerf: { views: number; ctr: number; avgRetention: number },
  ): string {
    // Analyze common patterns in cluster
    const avgBpm = members.reduce((sum, m) => sum + m.features[0] / FEATURE_WEIGHTS.bpm, 0) / members.length;
    const avgEnergy = members.reduce((sum, m) => sum + m.features[1] / FEATURE_WEIGHTS.energy, 0) / members.length;
    const avgHour = members.reduce((sum, m) => sum + m.features[3] / FEATURE_WEIGHTS.postingHour, 0) / members.length;

    const bpmDesc = avgBpm < 90 ? 'slow' : avgBpm < 120 ? 'mid-tempo' : avgBpm < 140 ? 'upbeat' : 'high-energy';
    const energyDesc = avgEnergy < 0.3 ? 'mellow' : avgEnergy < 0.6 ? 'balanced' : 'intense';
    const timeDesc = avgHour < 6 ? 'late-night' : avgHour < 12 ? 'morning' : avgHour < 18 ? 'afternoon' : 'evening';
    const perfDesc =
      avgPerf.avgRetention > 0.6
        ? '🔥 high performer'
        : avgPerf.avgRetention > 0.4
          ? 'solid performer'
          : 'needs optimization';

    return `${bpmDesc} ${energyDesc} ${contentType}, ${timeDesc} posts, ${perfDesc}`;
  }

  // ==========================================================================
  // PREDICT CLUSTER FOR NEW VIDEO
  // ==========================================================================

  predictCluster(
    newVideo: FeatureVector,
    clusters: Cluster[],
    normStats: NormalizationStats,
  ): { cluster: Cluster | null; isNoise: boolean; confidence: number } {
    if (clusters.length === 0) {
      return { cluster: null, isNoise: true, confidence: 0 };
    }

    // Normalize new video features
    const normalized = newVideo.features.map((val, i) => (val - normStats.means[i]) / normStats.stds[i]);

    // Find nearest cluster
    let nearestCluster: Cluster | null = null;
    let minDistance = Infinity;

    for (const cluster of clusters) {
      // Normalize centroid
      const normalizedCentroid = cluster.centroid.map((val, i) => (val - normStats.means[i]) / normStats.stds[i]);

      const distance = euclidean(normalized, normalizedCentroid);
      if (distance < minDistance) {
        minDistance = distance;
        nearestCluster = cluster;
      }
    }

    // Check if within epsilon (not noise)
    const isNoise = minDistance > this.state.currentEpsilon * 1.5; // 1.5x for some tolerance
    const confidence = isNoise ? 0 : Math.max(0, 1 - minDistance / (this.state.currentEpsilon * 2));

    return {
      cluster: isNoise ? null : nearestCluster,
      isNoise,
      confidence,
    };
  }

  // ==========================================================================
  // GET RECOMMENDATIONS
  // ==========================================================================

  getClusterRecommendations(cluster: Cluster): {
    optimalPostingTime: number;
    targetBpm: number;
    targetEnergy: number;
    description: string;
  } {
    const avgHour = cluster.centroid[3] / FEATURE_WEIGHTS.postingHour;
    const avgBpm = cluster.centroid[0] / FEATURE_WEIGHTS.bpm;
    const avgEnergy = cluster.centroid[1] / FEATURE_WEIGHTS.energy;

    return {
      optimalPostingTime: Math.round(avgHour),
      targetBpm: Math.round(avgBpm),
      targetEnergy: avgEnergy,
      description: cluster.description,
    };
  }
}

// Export singleton
export const contentClusteringService = new ContentClusteringService();
