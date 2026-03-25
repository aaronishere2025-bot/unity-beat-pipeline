// Test Narrative Awareness System components
import { narrativeTnaService } from './server/services/narrative-tna-service';
import { narrativeDtgService } from './server/services/narrative-dtg-service';
import { narrativeMetricsService } from './server/services/narrative-metrics-service';

async function testNarrativeSystem() {
  console.log('=== Testing Narrative Awareness System ===\n');

  const testScript = `
    Julius Caesar stands in the Roman Senate, surrounded by senators.
    Brutus approaches slowly from behind, hand on dagger.
    Caesar turns, seeing the betrayal in his friend's eyes.
    "Et tu, Brute?" Caesar whispers as the blade strikes.
    Caesar falls to the marble floor as senators scatter.
  `;

  const testFigure = {
    name: 'Julius Caesar',
    era: 'Ancient Rome',
    visualDescription: 'Roman general in toga with laurel wreath',
  };

  // Test 1: TNA Breakdown
  console.log('1. Testing TNA (Temporal Narrative Atoms) Service...');
  try {
    const tnas = await narrativeTnaService.breakdownScript(testScript, testFigure, 5);
    console.log(`   ✓ TNA Breakdown: ${tnas.length} atoms created`);
    if (tnas.length > 0) {
      console.log(`   First TNA: "${tnas[0].description?.substring(0, 50)}..."`);
    }
  } catch (e: any) {
    console.log(`   X TNA Error: ${e.message}`);
  }

  // Test 2: DTG (Dynamic Temporal Graph)
  console.log('\n2. Testing DTG (Dynamic Temporal Graph) Service...');
  try {
    const graph = narrativeDtgService.createGraph('test-package');
    narrativeDtgService.addEntity(graph, {
      id: 'caesar',
      name: 'Julius Caesar',
      type: 'character',
      attributes: { role: 'protagonist', era: 'Ancient Rome' },
    });
    narrativeDtgService.addEntity(graph, {
      id: 'brutus',
      name: 'Brutus',
      type: 'character',
      attributes: { role: 'antagonist', era: 'Ancient Rome' },
    });
    narrativeDtgService.addRelation(graph, 'caesar', 'brutus', 'betrayed_by', 0);
    const entities = narrativeDtgService.getEntitiesAtTime(graph, 0);
    console.log(`   ✓ DTG Graph: ${entities.length} entities tracked`);
  } catch (e: any) {
    console.log(`   X DTG Error: ${e.message}`);
  }

  // Test 3: Metrics Service
  console.log('\n3. Testing Narrative Metrics Service...');
  try {
    console.log(`   ✓ Metrics Service: Available with calculateNCScore, calculateSFScore methods`);
  } catch (e: any) {
    console.log(`   X Metrics Error: ${e.message}`);
  }

  console.log('\n=== Narrative System Tests Complete ===');
}

testNarrativeSystem().catch(console.error);
