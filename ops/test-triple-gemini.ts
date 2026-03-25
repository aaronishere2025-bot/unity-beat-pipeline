#!/usr/bin/env tsx
/**
 * Test Triple Gemini Error Analyzer
 *
 * Tests the new 3-critic Gemini system for error analysis
 */

import { tripleGeminiErrorAnalyzer } from './server/services/triple-gemini-error-analyzer';
import type { ErrorReport } from './server/services/error-monitor';

async function testTripleGemini() {
  console.log('🧪 Testing Triple Gemini Error Analyzer\n');

  // Check if Gemini is configured
  const isReady = await tripleGeminiErrorAnalyzer.isReady();
  console.log(`📡 Gemini API Status: ${isReady ? '✅ Ready' : '❌ Not configured'}\n`);

  if (!isReady) {
    console.error('❌ GEMINI_API_KEY not configured');
    console.log('\nSet your Gemini API key:');
    console.log('  export GEMINI_API_KEY="your-key-here"');
    process.exit(1);
  }

  // Get available critics
  const critics = tripleGeminiErrorAnalyzer.getAvailableCritics();
  console.log(`🎭 Available Critics: ${critics.join(', ')}\n`);

  // Create a sample error report
  const sampleError: ErrorReport = {
    id: 'test-error-001',
    timestamp: new Date().toISOString(),
    error: 'TypeError',
    message: 'Cannot read properties of undefined (reading "length")',
    stack: `TypeError: Cannot read properties of undefined (reading 'length')
    at processVideos (/home/aaronishere2025/server/services/youtube-upload-service.ts:145:32)
    at async uploadVideo (/home/aaronishere2025/server/services/youtube-upload-service.ts:89:15)`,
    severity: 'high',
    errorType: 'TypeError',
    errorMessage: 'Cannot read properties of undefined (reading "length")',
    context: {
      service: 'youtube-upload-service',
      operation: 'processVideos',
      file: '/home/aaronishere2025/server/services/youtube-upload-service.ts',
      function: 'processVideos',
      line: 145,
      stackTrace: `TypeError: Cannot read properties of undefined (reading 'length')
    at processVideos (/home/aaronishere2025/server/services/youtube-upload-service.ts:145:32)
    at async uploadVideo (/home/aaronishere2025/server/services/youtube-upload-service.ts:89:15)`,
      metadata: {
        jobId: 'test-job-123',
        videoPath: '/data/videos/test.mp4',
      },
      relatedCode: `// Line 143-147
const videos = getUploadQueue();
if (videos.length > 0) {  // Line 145 - ERROR HERE
  await uploadNext(videos[0]);
}`,
    },
    recentLogs: [
      '[YouTube] Starting upload process...',
      '[YouTube] Fetching upload queue...',
      '[YouTube] Queue result: undefined',
      '[YouTube] ERROR: Cannot read properties of undefined',
    ],
  };

  console.log('📋 Sample Error Report:');
  console.log('  Error:', sampleError.error);
  console.log('  Message:', sampleError.message);
  console.log('  Service:', sampleError.context.service);
  console.log('  Function:', sampleError.context.function);
  console.log('  Line:', sampleError.context.line);
  console.log();

  try {
    console.log('🚀 Starting Triple Gemini analysis...\n');
    const startTime = Date.now();

    const consensus = await tripleGeminiErrorAnalyzer.analyzeError(sampleError);

    const totalTime = Date.now() - startTime;

    console.log('✅ Analysis Complete!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 CONSENSUS RESULTS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🔍 Root Cause:');
    console.log(`   ${consensus.agreedRootCause}\n`);

    console.log('💡 Suggested Fix:');
    console.log(`   ${consensus.bestFix.description}\n`);

    console.log('📝 Code Changes:');
    consensus.bestFix.codeChanges.forEach((change, idx) => {
      console.log(`   ${idx + 1}. File: ${change.file}`);
      console.log(`      OLD: ${change.oldCode.substring(0, 60)}...`);
      console.log(`      NEW: ${change.newCode.substring(0, 60)}...`);
      console.log(`      Why: ${change.reasoning}`);
      console.log(`      Agreed by: ${change.agreeingCritics.join(', ')}`);
      console.log();
    });

    console.log('🧪 Test Plan:');
    consensus.bestFix.testPlan.forEach((step, idx) => {
      console.log(`   ${idx + 1}. ${step}`);
    });
    console.log();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🎭 INDIVIDUAL CRITICS');
    console.log('═══════════════════════════════════════════════════════════\n');

    consensus.criticAnalyses.forEach((analysis) => {
      const icon = analysis.critic === 'conservative' ? '🛡️' : analysis.critic === 'balanced' ? '⚖️' : '🚀';
      console.log(`${icon} ${analysis.critic.toUpperCase()} (temp=${analysis.temperature})`);
      console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
      console.log(`   Time: ${analysis.analysisTime}ms`);
      console.log(`   Cached: ${analysis.cached ? '💾 Yes' : '🔄 No'}`);
      console.log(`   Root Cause: ${analysis.rootCause.substring(0, 100)}...`);
      console.log();
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('💰 PERFORMANCE & COST');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`⏱️  Total Time: ${totalTime}ms`);
    console.log(`📊 Consensus Confidence: ${(consensus.consensusConfidence * 100).toFixed(1)}%`);
    console.log(`💾 Cache Hits: ${consensus.cacheHits}/3`);
    console.log(`💵 Estimated Cost: $${consensus.estimatedCost.toFixed(6)}`);
    console.log();

    // Cost comparison
    const oldMultiModelCost = 0.015; // Approximate cost of GPT+Gemini+Claude
    const savings = ((oldMultiModelCost - consensus.estimatedCost) / oldMultiModelCost) * 100;

    console.log('📉 Cost Comparison:');
    console.log(`   Old Multi-Model: ~$${oldMultiModelCost.toFixed(6)}`);
    console.log(`   New Triple Gemini: $${consensus.estimatedCost.toFixed(6)}`);
    console.log(`   Savings: ${savings.toFixed(1)}% cheaper! 🎉\n`);

    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('✅ Test completed successfully!');
    console.log('\n💡 To use in production:');
    console.log('   - The system automatically uses Triple Gemini for error analysis');
    console.log('   - Caching reduces costs by 75% on repeated error patterns');
    console.log('   - Each critic provides a different perspective (conservative/balanced/creative)');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testTripleGemini().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
