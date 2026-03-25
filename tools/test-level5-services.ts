// Test Level 5 Autonomous Capabilities
import { selfReflectionAgent } from './server/services/self-reflection-agent';
import { worldModelSimulator } from './server/services/world-model-simulator';
import { autonomousGoalAgent } from './server/services/autonomous-goal-agent';
import { contextContractsService } from './server/services/context-contracts-service';
import { dynamicModelRouter } from './server/services/dynamic-model-router';

async function testLevel5Services() {
  console.log('=== Testing Level 5 Autonomous Capabilities ===\n');

  // Test 1: Self-Reflection Agent
  console.log('1. Testing Self-Reflection Agent...');
  try {
    const stats = await selfReflectionAgent.getAdjustmentStats();
    console.log(`   ✓ Self-Reflection: ${stats.totalAdjustments} adjustments, ${stats.activeAdjustments} active`);
  } catch (e: any) {
    console.log(`   X Self-Reflection Error: ${e.message}`);
  }

  // Test 2: World Model Simulator (quick check only)
  console.log('\n2. Testing World Model Simulator...');
  try {
    // AI-FIXED: Added await to async quickCheck call
    const quickResult = await worldModelSimulator.quickCheck(
      'Julius Caesar stands in Roman Senate wearing toga',
      'Ancient Rome',
    );
    console.log(
      `   ✓ World Model Quick Check: likely_pass=${quickResult.likely_pass}, issues=${quickResult.quick_issues.length}`,
    );
  } catch (e: any) {
    console.log(`   X World Model Error: ${e.message}`);
  }

  // Test 3: Autonomous Goal Agent (structure only, no API call)
  console.log('\n3. Testing Autonomous Goal Agent...');
  try {
    const hasDecomposeGoal = typeof autonomousGoalAgent.decomposeGoal === 'function';
    const hasCreatePackage = typeof autonomousGoalAgent.createPackageFromGoal === 'function';
    console.log(`   ✓ Goal Agent: decomposeGoal=${hasDecomposeGoal}, createPackageFromGoal=${hasCreatePackage}`);
  } catch (e: any) {
    console.log(`   X Goal Agent Error: ${e.message}`);
  }

  // Test 4: Context Contracts Service
  console.log('\n4. Testing Context Contracts Service...');
  try {
    // AI-FIXED: Added await to async createContract call (GPT-5.2 + Claude consensus)
    const contractId = await contextContractsService.createContract('test-pkg-fixed', 'test-job-fixed', 0);
    contextContractsService.recordDecision(contractId, {
      stage: 'prompt_generation',
      timestamp: new Date(),
      model: 'gpt-5.2',
      modelVersion: '2025-12-11',
      input: 'Test input',
      output: 'Test output',
      rationale: 'Testing contract system',
      confidence: 95,
    });
    const contract = await contextContractsService.getContract(contractId);
    console.log(`   ✓ Context Contracts: ${contractId.substring(0, 40)}..., decisions=${contract?.decisions.length}`);
  } catch (e: any) {
    console.log(`   X Context Contracts Error: ${e.message}`);
  }

  // Test 5: Dynamic Model Router
  console.log('\n5. Testing Dynamic Model Router...');
  try {
    const decision = await dynamicModelRouter.routeTask({
      type: 'prompt_generation',
      complexity: 'high',
      context: { contentType: 'historical_rap', requiresCreativity: true },
    });
    console.log(`   ✓ Model Router: Selected ${decision.selectedModel} with ${decision.confidence}% confidence`);
    console.log(`   Reasoning: ${decision.reasoning.substring(0, 80)}...`);
  } catch (e: any) {
    console.log(`   X Model Router Error: ${e.message}`);
  }

  console.log('\n=== Level 5 Tests Complete ===');
}

testLevel5Services().catch(console.error);
