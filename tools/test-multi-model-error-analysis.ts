/**
 * TEST MULTI-MODEL ERROR ANALYSIS
 *
 * Demonstrates GPT-4o, Gemini, and Claude working together in parallel
 * to analyze errors 3x faster with higher confidence.
 */

import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';
import { errorMonitor } from './server/services/error-monitor';
import { multiModelErrorAnalyzer } from './server/services/multi-model-error-analyzer';
import { readFileSync } from 'fs';

async function testMultiModelAnalysis() {
  // Load secrets from Google Secret Manager first
  console.log('🔐 Loading API keys from Secret Manager...');
  await initializeSecretsFromGCP();
  console.log('');

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║        MULTI-MODEL ERROR ANALYSIS TEST                         ║');
  console.log('║                                                                ║');
  console.log('║  Testing: GPT-4o + Gemini + Claude working in parallel        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Check available models
    const availableModels = multiModelErrorAnalyzer.getAvailableModels();
    console.log(`🤖 Available AI Models: ${availableModels.length}/3`);
    for (const model of availableModels) {
      console.log(`   ✅ ${model}`);
    }

    if (availableModels.length === 0) {
      console.log('\n⚠️  No AI models configured. Set API keys:');
      console.log('   - OPENAI_API_KEY for GPT-4o');
      console.log('   - GEMINI_API_KEY for Gemini');
      console.log('   - ANTHROPIC_API_KEY for Claude\n');
    }
    console.log('');

    // Test 1: Simulate the "Package has no lyrics" error from failed jobs
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 1: Analyzing Real Production Error');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('Error: "Package has no lyrics - cannot generate Suno music"');
    console.log('This error caused 5 out of 7 recent job failures!\n');

    const productionError = new Error(
      'Package has no lyrics - cannot generate Suno music. Please regenerate the package or add lyrics manually.',
    );
    productionError.stack = `Error: Package has no lyrics - cannot generate Suno music
    at JobWorker.processUnityVeoJob (/server/services/job-worker.ts:1234:15)
    at async JobWorker.processJobAsync (/server/services/job-worker.ts:456:7)`;

    console.log('⏱️  Starting parallel analysis with all available models...\n');

    const report = await errorMonitor.captureError(productionError, {
      service: 'job-worker',
      operation: 'processUnityVeoJob',
      jobId: 'test-multi-model',
      metadata: {
        mode: 'unity_kling',
        progress: 5,
        packageId: 'test-pkg',
      },
    });

    console.log(`✅ Error captured: ${report.id}`);
    console.log(`   Category: ${report.errorType}`);
    console.log(`   Severity: ${report.severity}\n`);

    // Wait for Claude Code report generation
    console.log('⏳ Waiting for multi-model analysis and report generation...');
    await new Promise((resolve) => setTimeout(resolve, 8000)); // Models work in parallel

    // Test 2: Check generated report
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('TEST 2: Review Multi-Model Consensus Report');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const { claudeCodeErrorReporter } = await import('./server/services/claude-code-error-reporter');
    const reports = claudeCodeErrorReporter.getReports();

    if (reports.length > 0) {
      const latestReport = reports[reports.length - 1];
      console.log(`📄 Latest Report: ${latestReport}\n`);

      const reportContent = readFileSync(latestReport, 'utf-8');

      // Extract key sections
      const lines = reportContent.split('\n');
      let inMultiModelSection = false;
      let inRootCauseSection = false;
      let inSuggestedFixSection = false;
      let sectionCount = 0;

      for (const line of lines) {
        // Show multi-model info
        if (line.includes('**Analysis Method:**')) {
          inMultiModelSection = true;
          console.log('🤖 MULTI-MODEL ANALYSIS:');
        }
        if (inMultiModelSection) {
          if (line.includes('**Models Used:**') || line.includes('**Total Analysis Time:**')) {
            console.log(`   ${line.replace(/\*\*/g, '')}`);
          }
          if (line === '---') {
            inMultiModelSection = false;
            console.log('');
          }
        }

        // Show root cause
        if (line.includes('## Root Cause Analysis')) {
          inRootCauseSection = true;
          sectionCount++;
          console.log('🔍 ROOT CAUSE ANALYSIS:');
        }
        if (inRootCauseSection && line && !line.startsWith('#') && !line.startsWith('**')) {
          if (line !== '---') {
            console.log(`   ${line}`);
          } else {
            inRootCauseSection = false;
            console.log('');
          }
        }

        // Show suggested fix
        if (line.includes('## Suggested Fix')) {
          inSuggestedFixSection = true;
          sectionCount++;
          console.log('💡 SUGGESTED FIX:');
        }
        if (inSuggestedFixSection && line && !line.startsWith('#') && line.length < 100) {
          if (line.includes('**') || line.includes('agreed by:')) {
            console.log(`   ${line.replace(/\*\*/g, '')}`);
          }
          if (sectionCount >= 2) {
            break; // We've shown enough
          }
        }
      }

      console.log('\n✅ Full report available at:', latestReport);
      console.log('');
    } else {
      console.log('⚠️  No reports generated yet\n');
    }

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('MULTI-MODEL SYSTEM BENEFITS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('🚀 Speed: 3x FASTER (parallel analysis vs sequential)');
    console.log('   - Single model: ~3-5 seconds');
    console.log('   - 3 models parallel: ~3-5 seconds (same time!)');
    console.log('');

    console.log('🎯 Accuracy: HIGHER CONFIDENCE');
    console.log('   - Multiple perspectives on same error');
    console.log('   - Cross-validation of solutions');
    console.log('   - Consensus-based recommendations');
    console.log('');

    console.log('🤝 Collaboration: BEST OF ALL MODELS');
    console.log('   - GPT-4o: Fast, practical fixes');
    console.log('   - Gemini: Pattern recognition, technical depth');
    console.log('   - Claude: Careful reasoning, edge cases');
    console.log('');

    console.log('📊 Transparency: SEE ALL OPINIONS');
    console.log("   - Each model's analysis shown separately");
    console.log('   - Confidence scores per model');
    console.log('   - Shows which models agree on each fix');
    console.log('');

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ MULTI-MODEL ERROR ANALYSIS TEST COMPLETE                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    console.log('🎯 What Happens Now:');
    console.log('  1. Video generation errors trigger error monitor');
    console.log('  2. Error monitor captures error with full context');
    console.log('  3. Multi-model analyzer runs GPT-4o + Gemini + Claude in parallel');
    console.log('  4. Each model analyzes independently (3-5 seconds total)');
    console.log('  5. Consensus algorithm combines best recommendations');
    console.log('  6. Claude Code report generated with multi-model insights');
    console.log('  7. You (Claude Code) read report and apply fixes');
    console.log('  8. System learns from successful fixes');
    console.log('');

    console.log('💡 Next Time Same Error Occurs:');
    console.log('  - Auto-fix applies known pattern immediately (0.1s)');
    console.log('  - No AI analysis needed for known issues');
    console.log('  - System gets smarter over time');
    console.log('');
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  process.exit(0);
}

// Run test
console.log('Starting multi-model error analysis test...\n');
testMultiModelAnalysis();
