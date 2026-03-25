// Test Narrative Awareness System and Level 5 Capabilities
import { narrativeTnaService } from './server/services/narrative-tna-service';
import { narrativeDtgService } from './server/services/narrative-dtg-service';
import { narrativeMetricsService } from './server/services/narrative-metrics-service';
import { selfReflectionAgent } from './server/services/self-reflection-agent';
import { worldModelSimulator } from './server/services/world-model-simulator';
import { autonomousGoalAgent } from './server/services/autonomous-goal-agent';
import { contextContractsService } from './server/services/context-contracts-service';
import { dynamicModelRouter } from './server/services/dynamic-model-router';

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║      TESTING ALL SYSTEMS - NARRATIVE + LEVEL 5            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;

  // === NARRATIVE AWARENESS SYSTEM ===
  console.log('━━━ NARRATIVE AWARENESS SYSTEM ━━━\n');

  // Test 1: TNA Service
  console.log('1. TNA (Temporal Narrative Atoms) Service...');
  try {
    const testLyrics = 'Caesar stands in Senate. Brutus approaches with dagger. The assassination unfolds.';
    const result = await narrativeTnaService.breakdownToTNAs(testLyrics, 5);
    console.log(`   ✓ TNA: Generated ${result.tnas.length} atoms, confidence: ${result.overallConfidence}`);
    passed++;
  } catch (e: any) {
    console.log(`   ✗ TNA Error: ${e.message}`);
    failed++;
  }

  // Test 2: DTG Service
  console.log('\n2. DTG (Dynamic Temporal Graph) Service...');
  try {
    const mockTnas = [
      {
        clipIndex: 0,
        description: 'Caesar in Senate',
        timestamp: 0,
        entities: [],
        emotion: 'tense' as const,
        action: 'standing',
        setting: 'Senate',
        importance: 'critical' as const,
      },
    ];
    const mockClips = [{ prompt: 'Caesar in Roman Senate', success: true }];
    const graph = narrativeDtgService.buildGraph(mockTnas, mockClips);
    console.log(`   ✓ DTG: Built graph with ${graph.entities.size} entities`);
    passed++;
  } catch (e: any) {
    console.log(`   ✗ DTG Error: ${e.message}`);
    failed++;
  }

  // Test 3: Metrics Service
  console.log('\n3. Narrative Metrics Service...');
  try {
    const hasNCScore = typeof narrativeMetricsService.calculateNCScore === 'function';
    const hasSFScore = typeof narrativeMetricsService.calculateSFScore === 'function';
    console.log(`   ✓ Metrics: NCScore=${hasNCScore}, SFScore=${hasSFScore}`);
    passed++;
  } catch (e: any) {
    console.log(`   ✗ Metrics Error: ${e.message}`);
    failed++;
  }

  // === LEVEL 5 AUTONOMOUS CAPABILITIES ===
  console.log('\n━━━ LEVEL 5 AUTONOMOUS CAPABILITIES ━━━\n');

  // Test 4: Self-Reflection Agent
  console.log('4. Self-Reflection Agent...');
  try {
    const stats = await selfReflectionAgent.getAdjustmentStats();
    console.log(`   ✓ Self-Reflection: ${stats.totalAdjustments} adjustments, ${stats.activeAdjustments} active`);
    passed++;
  } catch (e: any) {
    console.log(`   ✗ Self-Reflection Error: ${e.message}`);
    failed++;
  }

  // Test 5: World Model Simulator
  console.log('\n5. World Model Simulator...');
  try {
    const result = await worldModelSimulator.quickCheck(
      'Julius Caesar stands in Roman Senate wearing white toga with purple trim',
      'Ancient Rome',
    );
    console.log(`   ✓ World Model: likely_pass=${result.likely_pass}, issues=${result.quick_issues.length}`);
    passed++;
  } catch (e: any) {
    console.log(`   ✗ World Model Error: ${e.message}`);
    failed++;
  }

  // Test 6: Autonomous Goal Agent
  console.log('\n6. Autonomous Goal Agent...');
  try {
    const hasDecompose = typeof autonomousGoalAgent.decomposeGoal === 'function';
    const hasCreate = typeof autonomousGoalAgent.createPackageFromGoal === 'function';
    console.log(`   ✓ Goal Agent: decomposeGoal=${hasDecompose}, createPackageFromGoal=${hasCreate}`);
    passed++;
  } catch (e: any) {
    console.log(`   ✗ Goal Agent Error: ${e.message}`);
    failed++;
  }

  // Test 7: Context Contracts
  console.log('\n7. Context Contracts Service...');
  try {
    const contractId = contextContractsService.createContract('test-pkg-2', 'test-job-2', 0);
    contextContractsService.recordDecision(contractId, {
      stage: 'prompt_generation',
      timestamp: new Date(),
      model: 'gpt-4o',
      modelVersion: '2024-08-06',
      input: 'Test input',
      output: 'Test output',
      rationale: 'Testing contract system',
      confidence: 95,
    });
    const contract = contextContractsService.getContract(contractId);
    if (contract) {
      console.log(`   ✓ Context Contracts: ${contractId}, decisions=${contract.decisions.length}`);
      passed++;
    } else {
      throw new Error('Contract not found');
    }
  } catch (e: any) {
    console.log(`   ✗ Context Contracts Error: ${e.message}`);
    failed++;
  }

  // Test 8: Dynamic Model Router
  console.log('\n8. Dynamic Model Router...');
  try {
    const decision = await dynamicModelRouter.routeTask({
      type: 'prompt_generation',
      complexity: 'high',
      context: { contentType: 'historical_rap', requiresCreativity: true },
    });
    console.log(`   ✓ Model Router: ${decision.selectedModel} (${Math.round(decision.confidence * 100)}% confidence)`);
    passed++;
  } catch (e: any) {
    console.log(`   ✗ Model Router Error: ${e.message}`);
    failed++;
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log(`║  TEST RESULTS: ${passed} passed, ${failed} failed                        ║`);
  console.log('╚════════════════════════════════════════════════════════════╝');

  return { passed, failed };
}

runAllTests().catch(console.error);
