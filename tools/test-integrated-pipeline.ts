// Integrated Pipeline Test - Tests all systems working together
import { autonomousGoalAgent } from './server/services/autonomous-goal-agent';
import { dynamicModelRouter } from './server/services/dynamic-model-router';
import { worldModelSimulator } from './server/services/world-model-simulator';
import { selfReflectionAgent } from './server/services/self-reflection-agent';
import { contextContractsService } from './server/services/context-contracts-service';

async function testIntegratedPipeline() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      INTEGRATED PIPELINE TEST - ALL SYSTEMS IN SYNC       ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  // Step 1: Autonomous Goal Decomposition
  console.log('━━━ STEP 1: Autonomous Goal Decomposition ━━━');
  try {
    const plan = await autonomousGoalAgent.decomposeGoal({
      figure: 'Cleopatra',
      intent: 'viral',
    });
    console.log(`✓ Goal decomposed for: ${plan.figure}`);
    console.log(`  Angles discovered: ${plan.discoveredAngles.length}`);
    console.log(`  Top angle: ${plan.discoveredAngles[0]?.angle || 'N/A'}`);
    console.log(`  Viral potential: ${plan.discoveredAngles[0]?.viralPotential || 'N/A'}/100`);
    console.log(`  Posting times: ${plan.optimalPostingTimes.length}`);
    console.log(`  Thumbnail strategies: ${plan.thumbnailStrategies.length}`);
  } catch (e: any) {
    console.log(`✗ Goal decomposition error: ${e.message}`);
  }

  // Step 2: Dynamic Model Routing
  console.log('\n━━━ STEP 2: Dynamic Model Routing ━━━');
  try {
    const tasks = ['prompt_generation', 'validation', 'analysis', 'narrative'];
    for (const taskType of tasks) {
      const decision = await dynamicModelRouter.routeTask({
        type: taskType as any,
        complexity: 'high',
        context: { contentType: 'historical', requiresCreativity: true },
      });
      console.log(`✓ ${taskType}: ${decision.selectedModel} (${Math.round(decision.confidence * 100)}%)`);
    }
  } catch (e: any) {
    console.log(`✗ Model routing error: ${e.message}`);
  }

  // Step 3: World Model Simulation
  console.log('\n━━━ STEP 3: World Model Simulation ━━━');
  try {
    const testPrompts = [
      'Cleopatra sits on golden throne in Egyptian palace, hieroglyphics on walls',
      'Roman senators approach Cleopatra, tension fills the air',
      'Cleopatra uses an iPhone to call Caesar', // Should detect anachronism
    ];

    for (let i = 0; i < testPrompts.length; i++) {
      const result = await worldModelSimulator.quickCheck(testPrompts[i], 'Ancient Egypt');
      const status = result.likely_pass ? '✓ PASS' : '✗ ISSUE';
      console.log(`${status}: Prompt ${i + 1} - ${result.quick_issues.length} issues`);
      if (result.quick_issues.length > 0) {
        console.log(`  Issues: ${result.quick_issues.join(', ')}`);
      }
    }
  } catch (e: any) {
    console.log(`✗ World model error: ${e.message}`);
  }

  // Step 4: Self-Reflection Agent Stats
  console.log('\n━━━ STEP 4: Self-Reflection Agent ━━━');
  try {
    const stats = await selfReflectionAgent.getAdjustmentStats();
    console.log(`✓ Self-Reflection active`);
    console.log(`  Total adjustments: ${stats.totalAdjustments}`);
    console.log(`  Active adjustments: ${stats.activeAdjustments}`);
    console.log(`  Average success rate: ${(stats.avgSuccessRate * 100).toFixed(1)}%`);
  } catch (e: any) {
    console.log(`✗ Self-reflection error: ${e.message}`);
  }

  // Step 5: Context Contracts
  console.log('\n━━━ STEP 5: Context Contracts ━━━');
  try {
    const contractId = await contextContractsService.createContract('integrated-test', 'job-001', 0);

    // Record multiple decisions
    contextContractsService.recordDecision(contractId, {
      stage: 'prompt_generation',
      timestamp: new Date(),
      model: 'gpt-4o',
      modelVersion: '2024-08-06',
      input: 'Generate cinematic prompt for Cleopatra',
      output: 'Cleopatra sits on golden throne...',
      rationale: 'Selected GPT-4o for creative prompt generation',
      confidence: 92,
    });

    contextContractsService.recordDecision(contractId, {
      stage: 'validation',
      timestamp: new Date(),
      model: 'claude-sonnet-4',
      modelVersion: '2024-12',
      input: 'Validate historical accuracy',
      output: 'Approved with minor suggestions',
      rationale: 'Claude selected for accuracy validation',
      confidence: 88,
    });

    const inProgress = contextContractsService.getInProgressContracts();
    console.log(`✓ Context contract created: ${contractId.substring(0, 35)}...`);
    console.log(`  In-progress contracts: ${inProgress.length}`);
  } catch (e: any) {
    console.log(`✗ Context contracts error: ${e.message}`);
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║      INTEGRATED PIPELINE TEST COMPLETE                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
}

testIntegratedPipeline().catch(console.error);
