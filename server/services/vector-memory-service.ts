import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { multimodalVectors } from '@shared/schema';
import { sql, eq, and, gte, desc } from 'drizzle-orm';
import type { AcousticFingerprint } from './acoustic-fingerprint-service';

let _gemini: GoogleGenerativeAI | null = null;

function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface VisualData {
  compositionScore?: number;
  colorImpact?: number;
  emotionalImpact?: number;
  curiosityGap?: number;
  thumbnailScore?: number;
  visualQualityScore?: number;
  cinematographyScore?: number;
  dominantColors?: string[];
  visualElements?: string[];
}

export interface VectorSearchResult {
  id: string;
  packageId: string;
  youtubeVideoId: string | null;
  vectorType: string;
  similarity: number;
  retentionRate: number | null;
  ctr: number | null;
  viewCount: number | null;
  metadata: Record<string, unknown>;
}

export interface WinningPattern {
  pattern: string;
  avgRetention: number;
  avgCtr: number;
  sampleCount: number;
  characteristics: {
    acoustic?: {
      avgBpm: number;
      commonEnergyCurve: string;
      avgHookEnergyRatio: number;
      avgPercussiveness: number;
    };
    visual?: {
      avgComposition: number;
      avgColorImpact: number;
      avgEmotionalImpact: number;
      commonElements: string[];
    };
  };
}

class VectorMemoryService {
  private readonly EMBEDDING_MODEL = 'text-embedding-004';
  private readonly EMBEDDING_DIMENSIONS = 512;

  async storeVisualEmbedding(
    packageId: string,
    visualData: VisualData,
    metadata?: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      console.log(`🎨 [VectorMemory] Storing visual embedding for package: ${packageId}`);

      const textRepresentation = this.visualDataToText(visualData);
      const embedding = await this.generateEmbedding(textRepresentation);

      if (!embedding || embedding.length !== this.EMBEDDING_DIMENSIONS) {
        console.error(`   ❌ Failed to generate ${this.EMBEDDING_DIMENSIONS}-dim embedding`);
        return null;
      }

      const fullMetadata = {
        ...metadata,
        ...visualData,
        sourceType: 'visual_analysis' as const,
        analyzedAt: new Date().toISOString(),
      };

      const [result] = await db
        .insert(multimodalVectors)
        .values({
          packageId,
          vectorType: 'visual',
          embedding,
          metadata: fullMetadata,
        })
        .returning({ id: multimodalVectors.id });

      console.log(`   ✅ Visual embedding stored: ${result.id}`);
      return result.id;
    } catch (e) {
      console.error(`   ❌ Failed to store visual embedding: ${e}`);
      return null;
    }
  }

  async storeAcousticEmbedding(
    packageId: string,
    fingerprint: AcousticFingerprint,
    metadata?: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      console.log(`🎵 [VectorMemory] Storing acoustic embedding for package: ${packageId}`);

      const textRepresentation = this.acousticDataToText(fingerprint);
      const embedding = await this.generateEmbedding(textRepresentation);

      if (!embedding || embedding.length !== this.EMBEDDING_DIMENSIONS) {
        console.error(`   ❌ Failed to generate ${this.EMBEDDING_DIMENSIONS}-dim embedding`);
        return null;
      }

      const fullMetadata = {
        ...metadata,
        bpm: fingerprint.bpm,
        energyCurve: fingerprint.energy_curve,
        hookEnergyRatio: fingerprint.hook_energy_ratio,
        dnaScores: fingerprint.dna_scores,
        percussivenessScore: fingerprint.percussiveness_score,
        brightnessScore: fingerprint.brightness_score,
        firstEnergySpikeSeconds: fingerprint.first_energy_spike_seconds,
        trackCharacter: fingerprint.track_character,
        sourceType: 'acoustic_fingerprint' as const,
        analyzedAt: new Date().toISOString(),
      };

      const [result] = await db
        .insert(multimodalVectors)
        .values({
          packageId,
          vectorType: 'acoustic',
          embedding,
          metadata: fullMetadata,
        })
        .returning({ id: multimodalVectors.id });

      console.log(`   ✅ Acoustic embedding stored: ${result.id}`);
      return result.id;
    } catch (e) {
      console.error(`   ❌ Failed to store acoustic embedding: ${e}`);
      return null;
    }
  }

  async storeCombinedEmbedding(
    packageId: string,
    visualData: VisualData,
    fingerprint: AcousticFingerprint,
    metadata?: Record<string, unknown>,
  ): Promise<string | null> {
    try {
      console.log(`🎬 [VectorMemory] Storing combined embedding for package: ${packageId}`);

      const textRepresentation = this.combinedDataToText(visualData, fingerprint);
      const embedding = await this.generateEmbedding(textRepresentation);

      if (!embedding || embedding.length !== this.EMBEDDING_DIMENSIONS) {
        console.error(`   ❌ Failed to generate ${this.EMBEDDING_DIMENSIONS}-dim embedding`);
        return null;
      }

      const fullMetadata = {
        ...metadata,
        ...visualData,
        bpm: fingerprint.bpm,
        energyCurve: fingerprint.energy_curve,
        hookEnergyRatio: fingerprint.hook_energy_ratio,
        dnaScores: fingerprint.dna_scores,
        percussivenessScore: fingerprint.percussiveness_score,
        brightnessScore: fingerprint.brightness_score,
        firstEnergySpikeSeconds: fingerprint.first_energy_spike_seconds,
        trackCharacter: fingerprint.track_character,
        sourceType: 'combined' as const,
        analyzedAt: new Date().toISOString(),
      };

      const [result] = await db
        .insert(multimodalVectors)
        .values({
          packageId,
          vectorType: 'combined',
          embedding,
          metadata: fullMetadata,
        })
        .returning({ id: multimodalVectors.id });

      console.log(`   ✅ Combined embedding stored: ${result.id}`);
      return result.id;
    } catch (e) {
      console.error(`   ❌ Failed to store combined embedding: ${e}`);
      return null;
    }
  }

  async updatePerformanceMetrics(
    packageId: string,
    youtubeVideoId: string,
    retention: number,
    ctr: number,
    views: number,
  ): Promise<boolean> {
    try {
      console.log(`📊 [VectorMemory] Updating metrics for package: ${packageId}, video: ${youtubeVideoId}`);

      const result = await db
        .update(multimodalVectors)
        .set({
          youtubeVideoId,
          retentionRate: retention,
          ctr,
          viewCount: views,
        })
        .where(eq(multimodalVectors.packageId, packageId));

      console.log(`   ✅ Performance metrics updated`);
      return true;
    } catch (e) {
      console.error(`   ❌ Failed to update metrics: ${e}`);
      return false;
    }
  }

  async querySimilarHighPerformers(
    queryVector: number[],
    minRetention: number = 70,
    limit: number = 5,
  ): Promise<VectorSearchResult[]> {
    try {
      console.log(`🔍 [VectorMemory] Searching for similar high performers (retention >= ${minRetention}%)`);

      const vectorStr = `[${queryVector.join(',')}]`;

      const results = await db.execute(sql`
        SELECT 
          id,
          package_id,
          youtube_video_id,
          vector_type,
          1 - (embedding <=> ${vectorStr}::vector) as similarity,
          retention_rate,
          ctr,
          view_count,
          metadata
        FROM multimodal_vectors
        WHERE retention_rate >= ${minRetention}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `);

      const searchResults: VectorSearchResult[] = (results.rows as any[]).map((row) => ({
        id: row.id,
        packageId: row.package_id,
        youtubeVideoId: row.youtube_video_id,
        vectorType: row.vector_type,
        similarity: parseFloat(row.similarity),
        retentionRate: row.retention_rate ? parseFloat(row.retention_rate) : null,
        ctr: row.ctr ? parseFloat(row.ctr) : null,
        viewCount: row.view_count,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      }));

      console.log(`   ✅ Found ${searchResults.length} similar high performers`);
      return searchResults;
    } catch (e) {
      console.error(`   ❌ Similarity search failed: ${e}`);
      return [];
    }
  }

  async querySimilarByType(
    queryVector: number[],
    vectorType: 'visual' | 'acoustic' | 'combined',
    limit: number = 10,
  ): Promise<VectorSearchResult[]> {
    try {
      console.log(`🔍 [VectorMemory] Searching similar ${vectorType} vectors`);

      const vectorStr = `[${queryVector.join(',')}]`;

      const results = await db.execute(sql`
        SELECT 
          id,
          package_id,
          youtube_video_id,
          vector_type,
          1 - (embedding <=> ${vectorStr}::vector) as similarity,
          retention_rate,
          ctr,
          view_count,
          metadata
        FROM multimodal_vectors
        WHERE vector_type = ${vectorType}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${limit}
      `);

      return (results.rows as any[]).map((row) => ({
        id: row.id,
        packageId: row.package_id,
        youtubeVideoId: row.youtube_video_id,
        vectorType: row.vector_type,
        similarity: parseFloat(row.similarity),
        retentionRate: row.retention_rate ? parseFloat(row.retention_rate) : null,
        ctr: row.ctr ? parseFloat(row.ctr) : null,
        viewCount: row.view_count,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      }));
    } catch (e) {
      console.error(`   ❌ Type-specific search failed: ${e}`);
      return [];
    }
  }

  async getWinningPatterns(): Promise<WinningPattern[]> {
    try {
      console.log(`🏆 [VectorMemory] Analyzing winning patterns from top performers`);

      const topPerformers = await db
        .select()
        .from(multimodalVectors)
        .where(gte(multimodalVectors.retentionRate, 70))
        .orderBy(desc(multimodalVectors.retentionRate))
        .limit(100);

      if (topPerformers.length === 0) {
        console.log(`   ⚠️ No high performers found yet`);
        return [];
      }

      const acousticVectors = topPerformers.filter((v) => v.vectorType === 'acoustic');
      const visualVectors = topPerformers.filter((v) => v.vectorType === 'visual');
      const combinedVectors = topPerformers.filter((v) => v.vectorType === 'combined');

      const patterns: WinningPattern[] = [];

      if (acousticVectors.length >= 3) {
        const acousticPattern = this.analyzeAcousticPatterns(acousticVectors);
        if (acousticPattern) patterns.push(acousticPattern);
      }

      if (visualVectors.length >= 3) {
        const visualPattern = this.analyzeVisualPatterns(visualVectors);
        if (visualPattern) patterns.push(visualPattern);
      }

      if (combinedVectors.length >= 3) {
        const combinedPattern = this.analyzeCombinedPatterns(combinedVectors);
        if (combinedPattern) patterns.push(combinedPattern);
      }

      console.log(`   ✅ Identified ${patterns.length} winning patterns`);
      return patterns;
    } catch (e) {
      console.error(`   ❌ Pattern analysis failed: ${e}`);
      return [];
    }
  }

  async generateEmbeddingForQuery(text: string): Promise<number[] | null> {
    return this.generateEmbedding(text);
  }

  private async generateEmbedding(text: string): Promise<number[] | null> {
    try {
      const model = getGemini().getGenerativeModel({ model: this.EMBEDDING_MODEL });
      const result = await model.embedContent({
        content: { parts: [{ text }], role: 'user' },
        taskType: 'RETRIEVAL_DOCUMENT' as any,
      });

      const embedding = result.embedding.values;
      // Truncate to target dimensions if needed
      return embedding.slice(0, this.EMBEDDING_DIMENSIONS);
    } catch (e) {
      console.error(`   ❌ Embedding generation failed: ${e}`);
      return null;
    }
  }

  private visualDataToText(data: VisualData): string {
    const parts: string[] = [];

    if (data.compositionScore !== undefined) {
      const level = data.compositionScore >= 80 ? 'excellent' : data.compositionScore >= 60 ? 'good' : 'basic';
      parts.push(`composition quality ${level} ${data.compositionScore}`);
    }

    if (data.colorImpact !== undefined) {
      const impact = data.colorImpact >= 80 ? 'high' : data.colorImpact >= 60 ? 'moderate' : 'low';
      parts.push(`color impact ${impact} ${data.colorImpact}`);
    }

    if (data.emotionalImpact !== undefined) {
      const intensity = data.emotionalImpact >= 80 ? 'intense' : data.emotionalImpact >= 60 ? 'moderate' : 'mild';
      parts.push(`emotional intensity ${intensity} ${data.emotionalImpact}`);
    }

    if (data.curiosityGap !== undefined) {
      const hook = data.curiosityGap >= 80 ? 'strong' : data.curiosityGap >= 60 ? 'moderate' : 'weak';
      parts.push(`curiosity hook ${hook} ${data.curiosityGap}`);
    }

    if (data.thumbnailScore !== undefined) {
      parts.push(`thumbnail score ${data.thumbnailScore}`);
    }

    if (data.visualQualityScore !== undefined) {
      parts.push(`visual quality ${data.visualQualityScore}`);
    }

    if (data.cinematographyScore !== undefined) {
      parts.push(`cinematography ${data.cinematographyScore}`);
    }

    if (data.dominantColors && data.dominantColors.length > 0) {
      parts.push(`colors ${data.dominantColors.join(' ')}`);
    }

    if (data.visualElements && data.visualElements.length > 0) {
      parts.push(`elements ${data.visualElements.join(' ')}`);
    }

    return `visual analysis: ${parts.join(', ')}`;
  }

  private acousticDataToText(fingerprint: AcousticFingerprint): string {
    const parts: string[] = [];

    parts.push(`bpm ${fingerprint.bpm}`);

    if (fingerprint.energy_curve) {
      parts.push(`energy curve ${fingerprint.energy_curve}`);
    }

    if (fingerprint.hook_energy_ratio !== undefined) {
      const hook =
        fingerprint.hook_energy_ratio > 1.2
          ? 'front-loaded'
          : fingerprint.hook_energy_ratio > 0.8
            ? 'balanced'
            : 'building';
      parts.push(`hook ${hook} ratio ${fingerprint.hook_energy_ratio.toFixed(2)}`);
    }

    if (fingerprint.dna_scores) {
      const scores = fingerprint.dna_scores;
      parts.push(`energy score ${scores.energy_score}`);
      parts.push(`rhythm score ${scores.rhythm_score}`);
      parts.push(`clarity score ${scores.clarity_score}`);
      parts.push(`hook score ${scores.hook_score}`);
    }

    if (fingerprint.percussiveness_score !== undefined) {
      const punch =
        fingerprint.percussiveness_score >= 0.6
          ? 'punchy'
          : fingerprint.percussiveness_score >= 0.4
            ? 'moderate'
            : 'soft';
      parts.push(`percussiveness ${punch} ${(fingerprint.percussiveness_score * 100).toFixed(0)}`);
    }

    if (fingerprint.brightness_score !== undefined) {
      const bright =
        fingerprint.brightness_score >= 0.6 ? 'bright' : fingerprint.brightness_score >= 0.4 ? 'balanced' : 'dark';
      parts.push(`brightness ${bright} ${(fingerprint.brightness_score * 100).toFixed(0)}`);
    }

    if (fingerprint.first_energy_spike_seconds !== undefined) {
      const timing =
        fingerprint.first_energy_spike_seconds <= 3
          ? 'fast'
          : fingerprint.first_energy_spike_seconds <= 6
            ? 'moderate'
            : 'slow';
      parts.push(`first drop ${timing} ${fingerprint.first_energy_spike_seconds.toFixed(1)}s`);
    }

    if (fingerprint.track_character) {
      parts.push(`character ${fingerprint.track_character}`);
    }

    return `acoustic fingerprint: ${parts.join(', ')}`;
  }

  private combinedDataToText(visualData: VisualData, fingerprint: AcousticFingerprint): string {
    const visualPart = this.visualDataToText(visualData);
    const acousticPart = this.acousticDataToText(fingerprint);
    return `multimodal content: ${visualPart}. ${acousticPart}`;
  }

  private analyzeAcousticPatterns(vectors: any[]): WinningPattern | null {
    const validVectors = vectors.filter((v) => v.metadata);
    if (validVectors.length === 0) return null;

    const bpms = validVectors.map((v) => (v.metadata as any).bpm).filter((b) => b);
    const energyCurves = validVectors.map((v) => (v.metadata as any).energyCurve).filter((e) => e);
    const hookRatios = validVectors.map((v) => (v.metadata as any).hookEnergyRatio).filter((h) => h);
    const percussiveness = validVectors.map((v) => (v.metadata as any).percussivenessScore).filter((p) => p);

    const avgRetention = validVectors.reduce((sum, v) => sum + (v.retentionRate || 0), 0) / validVectors.length;
    const avgCtr = validVectors.reduce((sum, v) => sum + (v.ctr || 0), 0) / validVectors.length;

    const curveCounts: Record<string, number> = {};
    energyCurves.forEach((c) => {
      curveCounts[c] = (curveCounts[c] || 0) + 1;
    });
    const commonCurve = Object.entries(curveCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    return {
      pattern: 'High-Retention Acoustic Profile',
      avgRetention,
      avgCtr,
      sampleCount: validVectors.length,
      characteristics: {
        acoustic: {
          avgBpm: bpms.length > 0 ? bpms.reduce((a, b) => a + b, 0) / bpms.length : 0,
          commonEnergyCurve: commonCurve,
          avgHookEnergyRatio: hookRatios.length > 0 ? hookRatios.reduce((a, b) => a + b, 0) / hookRatios.length : 0,
          avgPercussiveness:
            percussiveness.length > 0 ? percussiveness.reduce((a, b) => a + b, 0) / percussiveness.length : 0,
        },
      },
    };
  }

  private analyzeVisualPatterns(vectors: any[]): WinningPattern | null {
    const validVectors = vectors.filter((v) => v.metadata);
    if (validVectors.length === 0) return null;

    const compositions = validVectors.map((v) => (v.metadata as any).compositionScore).filter((c) => c);
    const colorImpacts = validVectors.map((v) => (v.metadata as any).colorImpact).filter((c) => c);
    const emotionalImpacts = validVectors.map((v) => (v.metadata as any).emotionalImpact).filter((e) => e);

    const allElements: string[] = [];
    validVectors.forEach((v) => {
      const elements = (v.metadata as any).visualElements;
      if (Array.isArray(elements)) allElements.push(...elements);
    });

    const elementCounts: Record<string, number> = {};
    allElements.forEach((e) => {
      elementCounts[e] = (elementCounts[e] || 0) + 1;
    });
    const commonElements = Object.entries(elementCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([e]) => e);

    const avgRetention = validVectors.reduce((sum, v) => sum + (v.retentionRate || 0), 0) / validVectors.length;
    const avgCtr = validVectors.reduce((sum, v) => sum + (v.ctr || 0), 0) / validVectors.length;

    return {
      pattern: 'High-Retention Visual Profile',
      avgRetention,
      avgCtr,
      sampleCount: validVectors.length,
      characteristics: {
        visual: {
          avgComposition: compositions.length > 0 ? compositions.reduce((a, b) => a + b, 0) / compositions.length : 0,
          avgColorImpact: colorImpacts.length > 0 ? colorImpacts.reduce((a, b) => a + b, 0) / colorImpacts.length : 0,
          avgEmotionalImpact:
            emotionalImpacts.length > 0 ? emotionalImpacts.reduce((a, b) => a + b, 0) / emotionalImpacts.length : 0,
          commonElements,
        },
      },
    };
  }

  private analyzeCombinedPatterns(vectors: any[]): WinningPattern | null {
    const acousticPattern = this.analyzeAcousticPatterns(vectors);
    const visualPattern = this.analyzeVisualPatterns(vectors);

    if (!acousticPattern && !visualPattern) return null;

    const avgRetention = vectors.reduce((sum, v) => sum + (v.retentionRate || 0), 0) / vectors.length;
    const avgCtr = vectors.reduce((sum, v) => sum + (v.ctr || 0), 0) / vectors.length;

    return {
      pattern: 'High-Retention Multimodal Profile',
      avgRetention,
      avgCtr,
      sampleCount: vectors.length,
      characteristics: {
        acoustic: acousticPattern?.characteristics.acoustic,
        visual: visualPattern?.characteristics.visual,
      },
    };
  }

  async getStats(): Promise<{
    totalVectors: number;
    byType: Record<string, number>;
    withMetrics: number;
    avgRetention: number;
    avgCtr: number;
  }> {
    try {
      const allVectors = await db.select().from(multimodalVectors);

      const byType: Record<string, number> = {};
      let withMetrics = 0;
      let totalRetention = 0;
      let totalCtr = 0;
      let metricsCount = 0;

      allVectors.forEach((v) => {
        byType[v.vectorType] = (byType[v.vectorType] || 0) + 1;
        if (v.retentionRate !== null || v.ctr !== null || v.viewCount !== null) {
          withMetrics++;
        }
        if (v.retentionRate !== null) {
          totalRetention += v.retentionRate;
          metricsCount++;
        }
        if (v.ctr !== null) {
          totalCtr += v.ctr;
        }
      });

      return {
        totalVectors: allVectors.length,
        byType,
        withMetrics,
        avgRetention: metricsCount > 0 ? totalRetention / metricsCount : 0,
        avgCtr: metricsCount > 0 ? totalCtr / metricsCount : 0,
      };
    } catch (e) {
      console.error(`   ❌ Failed to get stats: ${e}`);
      return {
        totalVectors: 0,
        byType: {},
        withMetrics: 0,
        avgRetention: 0,
        avgCtr: 0,
      };
    }
  }
}

export const vectorMemoryService = new VectorMemoryService();
