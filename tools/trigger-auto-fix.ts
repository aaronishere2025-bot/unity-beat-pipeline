import { errorMonitor } from './server/services/error-monitor.js';
import { multiModelErrorAnalyzer } from './server/services/multi-model-error-analyzer.js';
import { claudeCodeErrorReporter } from './server/services/claude-code-error-reporter.js';
import { initializeSecretsFromGCP } from './server/secret-manager-loader.js';

async function triggerAutoFix() {
  // Load secrets first
  console.log('🔐 Loading secrets...');
  await initializeSecretsFromGCP();

  console.log('\n🤖 AUTONOMOUS ERROR DETECTION & FIX SYSTEM');
  console.log('==========================================\n');

  // Error 1: World Model Simulator
  console.log('📍 Error 1: World Model Simulator');
  const error1 = await errorMonitor.captureError(
    new Error("Cannot read properties of undefined (reading 'length')"),
    'WORLD_MODEL_ERROR',
    'high',
    {
      service: 'world-model-simulator',
      operation: 'preflight',
      file: 'server/services/world-model-simulator.ts',
      line: 407,
      code: `const characterInfo: CharacterInfo[] = packageContext.characters.length > 0`,
      context: 'Accessing packageContext.characters.length when characters is undefined',
      stackTrace: `TypeError: Cannot read properties of undefined (reading 'length')
    at WorldModelSimulator.preflight (server/services/world-model-simulator.ts:407:65)`,
    },
  );

  console.log(`✅ Error captured: ${error1.id}\n`);

  // Trigger multi-model analysis for Error 1
  console.log('🧠 Running multi-model AI analysis (GPT-5.2 + Gemini 3 + Claude)...\n');

  const analysis1 = await multiModelErrorAnalyzer.analyzeError(error1);
  console.log(`✅ Analysis complete: ${(analysis1.consensusConfidence * 100).toFixed(1)}% confidence`);
  console.log(`   Models used: ${analysis1.modelAnalyses.map((m) => m.model).join(', ')}`);
  console.log(`   Root cause: ${analysis1.agreedRootCause.substring(0, 100)}...`);
  console.log(`   Fixes suggested: ${analysis1.bestFix.codeChanges.length}\n`);

  // Generate Claude Code report
  const report1 = await claudeCodeErrorReporter.generateReport(error1.id);
  console.log(`📄 Report generated: ${report1}\n`);

  console.log('🎯 NEXT STEP: I (Claude Code) will now read and apply the fixes');

  return { error1, analysis1, report1 };
}

triggerAutoFix().catch(console.error);
