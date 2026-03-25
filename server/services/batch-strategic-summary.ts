/**
 * Batch Strategic Summary
 *
 * Uses parallel Gemini calls for strategic summaries.
 * Perfect for daily 9pm summaries that don't need real-time results.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '../db';
import { strategicSummaries } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';

let _gemini: GoogleGenerativeAI | null = null;
function getGemini(): GoogleGenerativeAI {
  if (!_gemini) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
    if (!apiKey) throw new Error('No GEMINI_API_KEY found');
    _gemini = new GoogleGenerativeAI(apiKey);
  }
  return _gemini;
}

/**
 * Run all strategic summary calls in parallel using Gemini
 */
export async function createStrategicSummaryBatch(rawData: any): Promise<{
  gptAnalysis: string | null;
  patternAnalysis: string | null;
  consensus: string | null;
}> {
  console.log(`📝 Running parallel Gemini strategic summary calls...`);

  const creativeModel = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 2000 },
    systemInstruction: 'You are an expert in viral psychology and YouTube growth hooks.',
  });

  const patternModel = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.3, maxOutputTokens: 2000 },
    systemInstruction: 'You are a pattern analyst specializing in technical SEO and retention.',
  });

  const [creativeResult, patternResult] = await Promise.all([
    creativeModel.generateContent(generateStrategicPrompt(rawData, 'creative')),
    patternModel.generateContent(generateStrategicPrompt(rawData, 'pattern')),
  ]);

  const creativeText = creativeResult.response.text();
  const patternText = patternResult.response.text();

  // Now run consensus with the results from the first two
  const consensusModel = getGemini().getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
    systemInstruction: 'You are a strategic synthesizer that finds consensus between analyses.',
  });

  const consensusResult = await consensusModel.generateContent(
    `Synthesize the following analyses into consensus recommendations:\n\nCreative Analysis:\n${creativeText}\n\nPattern Analysis:\n${patternText}`,
  );

  const consensusText = consensusResult.response.text();

  console.log(`✅ All 3 strategic summary calls completed`);

  return {
    gptAnalysis: creativeText,
    patternAnalysis: patternText,
    consensus: consensusText,
  };
}

/**
 * Full workflow: Run parallel Gemini calls and store results
 */
export async function scheduleDailyBatchSummary(rawData: any) {
  console.log('🌙 Starting daily strategic summary (Parallel Gemini)');

  const summaryId = `batch-${Date.now()}`;

  // Store placeholder in database
  await db.insert(strategicSummaries).values({
    id: summaryId,
    generatedAt: new Date(),
    executiveSummary: 'Processing via Gemini...',
    winnersLosers: { winners: [], losers: [] },
    patternInsights: {
      themes: 'Processing...',
      lyrics: 'Processing...',
      audio: 'Processing...',
      thumbnails: 'Processing...',
      postingTimes: 'Processing...',
    },
    recommendations: ['Processing in progress'],
    warnings: [],
    costsBreakdown: { total: 0, byService: [] },
    consensus: {
      status: 'SINGLE_MODEL',
      gptConfidence: 'pending',
      geminiConfidence: 'pending',
      agreementScore: 0,
      divergences: [],
    },
    rawData: { summaryId, status: 'pending' },
  } as any);

  try {
    const results = await createStrategicSummaryBatch(rawData);

    // Update database with results
    await db
      .update(strategicSummaries)
      .set({
        executiveSummary: results.consensus || 'Completed',
        rawData: { summaryId, status: 'completed', results },
      })
      .where(eq(strategicSummaries.id, summaryId));

    console.log('✅ Strategic summary completed and saved.');
    console.log(`   Summary ID: ${summaryId}`);

    return summaryId;
  } catch (error: any) {
    console.error('❌ Strategic summary failed:', error.message);

    await db
      .update(strategicSummaries)
      .set({
        executiveSummary: `Failed: ${error.message}`,
        rawData: { summaryId, status: 'failed', error: error.message },
      })
      .where(eq(strategicSummaries.id, summaryId));

    return summaryId;
  }
}

/**
 * Check for completed summaries (simplified - no longer uses batch polling)
 */
export async function checkForCompletedBatches() {
  const pendingBatches = await db
    .select()
    .from(strategicSummaries)
    .where(sql`raw_data->>'status' = 'pending'`);

  if (pendingBatches.length > 0) {
    console.log(`⚠️ Found ${pendingBatches.length} pending summaries - these may need manual retry`);
  }
}

// Helper function to generate prompts
function generateStrategicPrompt(rawData: any, type: 'creative' | 'pattern'): string {
  if (type === 'creative') {
    return `Analyze the following YouTube performance data and provide creative strategy insights:\n\n${JSON.stringify(rawData, null, 2)}`;
  } else {
    return `Analyze the following data for patterns in retention, SEO, and technical performance:\n\n${JSON.stringify(rawData, null, 2)}`;
  }
}
