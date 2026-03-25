/**
 * Thumbnail CTR Predictor Service
 *
 * Uses Gemini Vision to extract visual features from thumbnails
 * and predicts click-through rate based on historical performance data.
 *
 * Features extracted:
 * - Face presence and emotion (0-1)
 * - Text overlay presence (0-1)
 * - Contrast level (0-1)
 * - Color vibrancy (0-1)
 * - Curiosity gap elements (0-1)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { db } from '../db';
import { detailedVideoMetrics } from '@shared/schema';
import { desc, isNotNull, sql } from 'drizzle-orm';
import { apiCostTracker } from './api-cost-tracker';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

export interface ThumbnailFeatures {
  facePresence: number; // 0-1: presence and emotion intensity of faces
  textOverlay: number; // 0-1: how prominent text is in the image
  contrastLevel: number; // 0-1: visual contrast/pop
  colorVibrancy: number; // 0-1: color saturation and energy
  curiosityGap: number; // 0-1: elements that create "what happens next" curiosity
  overallScore: number; // 0-1: composite score
}

export interface CTRPrediction {
  predictedCTR: number; // Predicted CTR as percentage (0-15%)
  score: number; // 0-100 overall quality score
  features: ThumbnailFeatures;
  confidence: number; // Model confidence (0-1)
  modelVersion: string;
  breakdown: {
    textReadability: number; // 0-20 points
    visualAppeal: number; // 0-20 points
    emotionTriggers: number; // 0-20 points
    clickabilityFactors: number; // 0-20 points
    brandConsistency: number; // 0-20 points
  };
  suggestions: string[];
  shouldRegenerate: boolean;
}

export interface RankedThumbnail {
  path: string;
  prediction: CTRPrediction;
  rank: number;
}

interface TrainingDataPoint {
  videoId: string;
  thumbnailUrl: string;
  features: ThumbnailFeatures;
  actualCTR: number;
}

interface LinearModel {
  weights: {
    facePresence: number;
    textOverlay: number;
    contrastLevel: number;
    colorVibrancy: number;
    curiosityGap: number;
    bias: number;
  };
  trainedAt: string;
  sampleCount: number;
  meanCTR: number;
  r2Score: number;
}

const CACHE_DIR = join(process.cwd(), 'data', 'cache', 'thumbnail-features');
const MODEL_PATH = join(process.cwd(), 'data', 'ctr-predictor-model.json');

// Default weights based on industry research (used before training)
const DEFAULT_MODEL: LinearModel = {
  weights: {
    facePresence: 1.8, // Faces increase CTR significantly
    textOverlay: 0.8, // Bold text helps
    contrastLevel: 1.2, // High contrast pops in feed
    colorVibrancy: 1.0, // Vibrant colors catch eye
    curiosityGap: 2.0, // Curiosity is the strongest driver
    bias: 2.5, // Base CTR around 2.5%
  },
  trainedAt: 'default',
  sampleCount: 0,
  meanCTR: 4.0,
  r2Score: 0,
};

class ThumbnailCTRPredictor {
  private model: LinearModel = DEFAULT_MODEL;
  private isInitialized: boolean = false;
  private trainingData: TrainingDataPoint[] = [];

  constructor() {
    if (!existsSync(CACHE_DIR)) {
      mkdirSync(CACHE_DIR, { recursive: true });
    }
    console.log('🎯 Thumbnail CTR Predictor Service initialized');
  }

  /**
   * Initialize the predictor by loading/training the model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Try to load existing model
      if (existsSync(MODEL_PATH)) {
        const savedModel = JSON.parse(readFileSync(MODEL_PATH, 'utf-8'));
        this.model = savedModel;
        console.log(
          `🎯 Loaded CTR prediction model (trained on ${this.model.sampleCount} samples, R²=${this.model.r2Score.toFixed(3)})`,
        );
      } else {
        console.log('🎯 Using default CTR prediction weights (no trained model found)');
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Failed to initialize CTR predictor:', error);
      this.model = DEFAULT_MODEL;
      this.isInitialized = true;
    }
  }

  /**
   * Comprehensive CTR analysis using GPT-4o Vision
   * Analyzes all aspects of thumbnail clickability
   */
  async analyzeThumbnail(imagePath: string): Promise<CTRPrediction> {
    console.log(`\n🎯 [CTR Predictor] Analyzing thumbnail: ${imagePath}`);

    if (!existsSync(imagePath)) {
      throw new Error(`Thumbnail file not found: ${imagePath}`);
    }

    const buffer = readFileSync(imagePath);
    const base64Image = buffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const analysisPrompt = `You are a YouTube thumbnail optimization expert with deep knowledge of viewer psychology and click behavior.

Analyze this thumbnail across 5 critical dimensions (0-20 points each):

1. TEXT READABILITY (0-20 points)
   - Font size and legibility on mobile (70% of views)
   - Contrast between text and background
   - Text length (3-5 words is optimal)
   - Bold/dramatic typography
   Score: 20 = Perfect mobile readability, 0 = No text or illegible

2. VISUAL APPEAL & COMPOSITION (0-20 points)
   - Color contrast and vibrancy
   - Rule of thirds composition
   - Eye-catching focal point
   - Professional polish vs amateur
   Score: 20 = Magazine-quality composition, 0 = Cluttered/amateur

3. EMOTION TRIGGERS & FACES (0-20 points)
   - Emotional expression intensity (shock, joy, surprise)
   - Face presence and size (larger = better)
   - Direct eye contact with viewer
   - Authentic emotion vs fake
   Score: 20 = Highly expressive face with strong emotion, 0 = No faces

4. CLICKABILITY FACTORS (0-20 points)
   - Curiosity gap (creates "I need to know" feeling)
   - Mystery or intrigue elements
   - Promise of value/entertainment
   - Pattern interruption (stands out in feed)
   Score: 20 = Irresistible curiosity, 0 = Boring/generic

5. BRAND CONSISTENCY (0-20 points)
   - Recognizable style/template
   - Color palette consistency
   - Logo/branding presence (subtle is better)
   - Professional standards
   Score: 20 = Strong brand identity, 0 = No consistency

Return this EXACT JSON format:
{
  "textReadability": <0-20>,
  "visualAppeal": <0-20>,
  "emotionTriggers": <0-20>,
  "clickabilityFactors": <0-20>,
  "brandConsistency": <0-20>,
  "predictedCTR": <0-15>,
  "features": {
    "facePresence": <0-1>,
    "textOverlay": <0-1>,
    "contrastLevel": <0-1>,
    "colorVibrancy": <0-1>,
    "curiosityGap": <0-1>
  },
  "criticalIssues": ["<specific issues found>"],
  "suggestions": ["<actionable improvements>"],
  "shouldRegenerate": <true|false>
}`;

    try {
      const model = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 800, responseMimeType: 'application/json' },
        systemInstruction:
          'You are a YouTube thumbnail expert. Analyze thoroughly and provide scores based on proven CTR optimization principles.',
      });
      const result = await model.generateContent([
        { text: analysisPrompt },
        { inlineData: { data: base64Image, mimeType } },
      ]);

      // Track API cost
      const usage = result.response.usageMetadata;
      if (usage) {
        const cost = await apiCostTracker.trackGemini({
          model: 'gemini-2.5-flash',
          operation: 'thumbnail_ctr_prediction',
          inputTokens: usage.promptTokenCount || 0,
          outputTokens: usage.candidatesTokenCount || 0,
        });
        console.log(`   💰 Cost: $${cost.toFixed(4)}`);
      }

      const content = result.response.text() || '{}';
      const parsed = JSON.parse(content);

      // Calculate overall score (0-100)
      const score =
        parsed.textReadability +
        parsed.visualAppeal +
        parsed.emotionTriggers +
        parsed.clickabilityFactors +
        parsed.brandConsistency;

      // Extract features
      const features: ThumbnailFeatures = {
        facePresence: this.clamp(parsed.features?.facePresence || 0),
        textOverlay: this.clamp(parsed.features?.textOverlay || 0),
        contrastLevel: this.clamp(parsed.features?.contrastLevel || 0),
        colorVibrancy: this.clamp(parsed.features?.colorVibrancy || 0),
        curiosityGap: this.clamp(parsed.features?.curiosityGap || 0),
        overallScore: score / 100,
      };

      const prediction: CTRPrediction = {
        predictedCTR: Math.max(0, Math.min(15, parsed.predictedCTR || score / 10)),
        score,
        features,
        confidence: 0.85, // High confidence with GPT-4o Vision
        modelVersion: 'gpt4o-vision-v2',
        breakdown: {
          textReadability: parsed.textReadability || 0,
          visualAppeal: parsed.visualAppeal || 0,
          emotionTriggers: parsed.emotionTriggers || 0,
          clickabilityFactors: parsed.clickabilityFactors || 0,
          brandConsistency: parsed.brandConsistency || 0,
        },
        suggestions: parsed.suggestions || [],
        shouldRegenerate: parsed.shouldRegenerate || score < 60,
      };

      console.log(`   📊 Score: ${score}/100 (${prediction.predictedCTR.toFixed(1)}% predicted CTR)`);
      console.log(`   📈 Breakdown:`);
      console.log(`      Text: ${prediction.breakdown.textReadability}/20`);
      console.log(`      Visual: ${prediction.breakdown.visualAppeal}/20`);
      console.log(`      Emotion: ${prediction.breakdown.emotionTriggers}/20`);
      console.log(`      Clickability: ${prediction.breakdown.clickabilityFactors}/20`);
      console.log(`      Brand: ${prediction.breakdown.brandConsistency}/20`);

      if (prediction.suggestions.length > 0) {
        console.log(`   💡 Suggestions:`);
        prediction.suggestions.forEach((s) => console.log(`      - ${s}`));
      }

      return prediction;
    } catch (error: any) {
      console.error('❌ Thumbnail analysis failed:', error.message);
      throw error;
    }
  }

  /**
   * Extract visual features from a thumbnail using GPT-4o Vision
   * Legacy method - kept for backward compatibility
   */
  async extractFeatures(imagePath: string): Promise<ThumbnailFeatures> {
    // Check cache first
    const cacheKey = this.getCacheKey(imagePath);
    const cached = this.getCachedFeatures(cacheKey);
    if (cached) {
      console.log(`   💾 Using cached features for thumbnail`);
      return cached;
    }

    console.log(`🔍 Extracting thumbnail features via GPT-4o Vision...`);

    let base64Data: string;
    let mediaMimeType: string = 'image/jpeg';

    // Handle both local files and URLs
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      // For URLs, download and encode as base64
      const response = await fetch(imagePath);
      const arrayBuffer = await response.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString('base64');
      if (imagePath.endsWith('.png')) mediaMimeType = 'image/png';
    } else {
      // For local files, read and encode as base64
      if (!existsSync(imagePath)) {
        throw new Error(`Thumbnail not found: ${imagePath}`);
      }
      const buffer = readFileSync(imagePath);
      base64Data = buffer.toString('base64');

      if (imagePath.endsWith('.png')) {
        mediaMimeType = 'image/png';
      }
    }

    try {
      const featureSysPrompt = `You are a YouTube thumbnail analysis expert. Analyze the given thumbnail image and score the following features on a scale of 0.0 to 1.0:

1. facePresence: Are there faces visible? How emotionally expressive are they? (0 = no faces, 1 = dramatic emotional faces)
2. textOverlay: How prominent is text in the image? (0 = no text, 1 = bold, eye-catching text)
3. contrastLevel: How much visual contrast and "pop" does the image have? (0 = flat/low contrast, 1 = high contrast, stands out)
4. colorVibrancy: How saturated and energetic are the colors? (0 = muted/gray, 1 = vibrant/saturated)
5. curiosityGap: Does it create mystery or "I need to click to find out"? (0 = no curiosity, 1 = extremely compelling mystery)

Return ONLY a JSON object with these exact fields:
{
  "facePresence": 0.0-1.0,
  "textOverlay": 0.0-1.0,
  "contrastLevel": 0.0-1.0,
  "colorVibrancy": 0.0-1.0,
  "curiosityGap": 0.0-1.0
}`;

      const featureModel = getGemini().getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { temperature: 0.3, maxOutputTokens: 200, responseMimeType: 'application/json' },
        systemInstruction: featureSysPrompt,
      });
      const featureResult = await featureModel.generateContent([
        { text: 'Analyze this YouTube thumbnail and provide feature scores as JSON.' },
        { inlineData: { data: base64Data, mimeType: mediaMimeType } },
      ]);

      // Track API cost
      const usage = featureResult.response.usageMetadata;
      if (usage) {
        apiCostTracker.trackGemini({
          model: 'gemini-2.5-flash',
          operation: 'thumbnail_feature_extraction',
          inputTokens: usage.promptTokenCount || 0,
          outputTokens: usage.candidatesTokenCount || 0,
        });
      }

      const content = featureResult.response.text() || '{}';
      const parsed = JSON.parse(content);

      const features: ThumbnailFeatures = {
        facePresence: this.clamp(parsed.facePresence || 0),
        textOverlay: this.clamp(parsed.textOverlay || 0),
        contrastLevel: this.clamp(parsed.contrastLevel || 0),
        colorVibrancy: this.clamp(parsed.colorVibrancy || 0),
        curiosityGap: this.clamp(parsed.curiosityGap || 0),
        overallScore: 0, // Will be calculated
      };

      // Calculate overall score as weighted average
      features.overallScore = this.clamp(
        features.facePresence * 0.2 +
          features.textOverlay * 0.15 +
          features.contrastLevel * 0.2 +
          features.colorVibrancy * 0.15 +
          features.curiosityGap * 0.3, // Curiosity gap weighted highest
      );

      // Cache the features
      this.cacheFeatures(cacheKey, features);

      console.log(
        `   ✅ Features extracted: face=${features.facePresence.toFixed(2)}, text=${features.textOverlay.toFixed(2)}, contrast=${features.contrastLevel.toFixed(2)}, vibrancy=${features.colorVibrancy.toFixed(2)}, curiosity=${features.curiosityGap.toFixed(2)}`,
      );

      return features;
    } catch (error: any) {
      console.error('❌ Failed to extract thumbnail features:', error.message);

      // Return neutral features on error
      return {
        facePresence: 0.5,
        textOverlay: 0.5,
        contrastLevel: 0.5,
        colorVibrancy: 0.5,
        curiosityGap: 0.5,
        overallScore: 0.5,
      };
    }
  }

  /**
   * Predict CTR for a thumbnail (comprehensive analysis)
   */
  async predictCTR(thumbnailPath: string): Promise<CTRPrediction> {
    // Use comprehensive GPT-4o Vision analysis
    return await this.analyzeThumbnail(thumbnailPath);
  }

  /**
   * Rank multiple thumbnail candidates by predicted CTR
   */
  async rankThumbnails(thumbnailPaths: string[]): Promise<RankedThumbnail[]> {
    console.log(`🎯 CTR Predictor: Ranking ${thumbnailPaths.length} thumbnails...`);

    const predictions = await Promise.all(
      thumbnailPaths.map(async (path) => ({
        path,
        prediction: await this.predictCTR(path),
      })),
    );

    // Sort by predicted CTR descending
    predictions.sort((a, b) => b.prediction.predictedCTR - a.prediction.predictedCTR);

    // Assign ranks
    const ranked = predictions.map((p, index) => ({
      ...p,
      rank: index + 1,
    }));

    // Log the ranking
    const rankingStr = ranked
      .map((r, i) => `${String.fromCharCode(65 + i)} (${r.prediction.predictedCTR.toFixed(1)}% predicted)`)
      .join(' > ');
    console.log(`🎯 CTR Predictor: Thumbnail ${rankingStr}`);

    return ranked;
  }

  /**
   * Pull historical data from the database for training
   */
  async collectTrainingData(): Promise<TrainingDataPoint[]> {
    console.log('📊 Collecting historical CTR data for training...');

    try {
      // Get videos with known CTR and thumbnail URLs
      const videos = await db
        .select({
          videoId: detailedVideoMetrics.videoId,
          title: detailedVideoMetrics.title,
          thumbnailUrl: (detailedVideoMetrics as any).thumbnailUrl,
          clickThroughRate: detailedVideoMetrics.clickThroughRate,
          impressions: detailedVideoMetrics.impressions,
        })
        .from(detailedVideoMetrics)
        .where(isNotNull(detailedVideoMetrics.clickThroughRate))
        .orderBy(desc(detailedVideoMetrics.impressions))
        .limit(100); // Limit to most-viewed for quality training data

      console.log(`   Found ${videos.length} videos with CTR data`);

      const trainingData: TrainingDataPoint[] = [];

      for (const video of videos) {
        if (!video.thumbnailUrl || !video.clickThroughRate) continue;

        try {
          // Extract features from thumbnail
          const features = await this.extractFeatures(video.thumbnailUrl);

          trainingData.push({
            videoId: video.videoId,
            thumbnailUrl: video.thumbnailUrl,
            features,
            actualCTR: parseFloat(String(video.clickThroughRate)),
          });
        } catch (error) {
          console.warn(`   ⚠️ Skipped video ${video.videoId}: feature extraction failed`);
        }
      }

      console.log(`   ✅ Collected ${trainingData.length} training samples`);
      this.trainingData = trainingData;
      return trainingData;
    } catch (error) {
      console.error('❌ Failed to collect training data:', error);
      return [];
    }
  }

  /**
   * Train the linear regression model on historical data
   * Uses simple gradient descent to learn weights
   */
  async trainModel(): Promise<LinearModel> {
    const data = this.trainingData.length > 0 ? this.trainingData : await this.collectTrainingData();

    if (data.length < 5) {
      console.log('⚠️ Insufficient training data (need at least 5 samples). Using default model.');
      return this.model;
    }

    console.log(`🧠 Training CTR prediction model on ${data.length} samples...`);

    // Initialize weights
    const weights = { ...DEFAULT_MODEL.weights };
    const learningRate = 0.01;
    const epochs = 1000;

    // Calculate mean CTR for R² calculation
    const meanCTR = data.reduce((sum, d) => sum + d.actualCTR, 0) / data.length;

    // Gradient descent
    for (let epoch = 0; epoch < epochs; epoch++) {
      const totalGradient = {
        facePresence: 0,
        textOverlay: 0,
        contrastLevel: 0,
        colorVibrancy: 0,
        curiosityGap: 0,
        bias: 0,
      };

      for (const sample of data) {
        const f = sample.features;
        const prediction =
          weights.facePresence * f.facePresence +
          weights.textOverlay * f.textOverlay +
          weights.contrastLevel * f.contrastLevel +
          weights.colorVibrancy * f.colorVibrancy +
          weights.curiosityGap * f.curiosityGap +
          weights.bias;

        const error = prediction - sample.actualCTR;

        // Accumulate gradients
        totalGradient.facePresence += error * f.facePresence;
        totalGradient.textOverlay += error * f.textOverlay;
        totalGradient.contrastLevel += error * f.contrastLevel;
        totalGradient.colorVibrancy += error * f.colorVibrancy;
        totalGradient.curiosityGap += error * f.curiosityGap;
        totalGradient.bias += error;
      }

      // Update weights
      const n = data.length;
      weights.facePresence -= (learningRate * totalGradient.facePresence) / n;
      weights.textOverlay -= (learningRate * totalGradient.textOverlay) / n;
      weights.contrastLevel -= (learningRate * totalGradient.contrastLevel) / n;
      weights.colorVibrancy -= (learningRate * totalGradient.colorVibrancy) / n;
      weights.curiosityGap -= (learningRate * totalGradient.curiosityGap) / n;
      weights.bias -= (learningRate * totalGradient.bias) / n;
    }

    // Calculate R² score
    let ssRes = 0;
    let ssTot = 0;
    for (const sample of data) {
      const f = sample.features;
      const prediction =
        weights.facePresence * f.facePresence +
        weights.textOverlay * f.textOverlay +
        weights.contrastLevel * f.contrastLevel +
        weights.colorVibrancy * f.colorVibrancy +
        weights.curiosityGap * f.curiosityGap +
        weights.bias;

      ssRes += Math.pow(sample.actualCTR - prediction, 2);
      ssTot += Math.pow(sample.actualCTR - meanCTR, 2);
    }
    const r2Score = ssTot > 0 ? 1 - ssRes / ssTot : 0;

    // Create new model
    this.model = {
      weights,
      trainedAt: new Date().toISOString(),
      sampleCount: data.length,
      meanCTR,
      r2Score: Math.max(0, r2Score), // Clamp to non-negative
    };

    // Save model
    try {
      writeFileSync(MODEL_PATH, JSON.stringify(this.model, null, 2));
      console.log(`   ✅ Model trained and saved (R²=${r2Score.toFixed(3)})`);
      console.log(
        `   📊 Learned weights: face=${weights.facePresence.toFixed(2)}, text=${weights.textOverlay.toFixed(2)}, contrast=${weights.contrastLevel.toFixed(2)}, vibrancy=${weights.colorVibrancy.toFixed(2)}, curiosity=${weights.curiosityGap.toFixed(2)}, bias=${weights.bias.toFixed(2)}`,
      );
    } catch (error) {
      console.warn('   ⚠️ Failed to save model to disk');
    }

    return this.model;
  }

  /**
   * Get model statistics
   */
  getModelStats(): { model: LinearModel; isDefault: boolean } {
    return {
      model: this.model,
      isDefault: this.model.trainedAt === 'default',
    };
  }

  // Helper methods
  private clamp(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private getCacheKey(imagePath: string): string {
    // Use path hash as cache key
    const crypto = require('crypto');
    return crypto.createHash('md5').update(imagePath).digest('hex');
  }

  private getCachedFeatures(cacheKey: string): ThumbnailFeatures | null {
    const cachePath = join(CACHE_DIR, `${cacheKey}.json`);
    try {
      if (existsSync(cachePath)) {
        return JSON.parse(readFileSync(cachePath, 'utf-8'));
      }
    } catch {
      // Cache miss
    }
    return null;
  }

  private cacheFeatures(cacheKey: string, features: ThumbnailFeatures): void {
    const cachePath = join(CACHE_DIR, `${cacheKey}.json`);
    try {
      writeFileSync(cachePath, JSON.stringify(features, null, 2));
    } catch {
      // Ignore cache write failures
    }
  }
}

// Export singleton instance
export const thumbnailCTRPredictor = new ThumbnailCTRPredictor();
