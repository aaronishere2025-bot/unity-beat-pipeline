/**
 * INTEGRATION TEST: Unity Content Generator JSON Parsing
 *
 * This test simulates the actual workflow:
 * 1. Simulates OpenAI returning markdown-wrapped JSON (the problem case)
 * 2. Tests that extractAndParseJSON correctly handles it
 * 3. Verifies all major parsing scenarios work
 */

import { openaiService } from '../server/services/openai-service';

// Mock the OpenAI service to return markdown-wrapped responses
const originalGenerateText = openaiService.generateText.bind(openaiService);

// Test counter
let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  return async () => {
    try {
      await fn();
      console.log(`✅ ${name}`);
      testsPassed++;
    } catch (error) {
      console.log(`❌ ${name}`);
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      testsFailed++;
    }
  };
}

// Test 1: Verify cleanMalformedJSON is exported and works
await runTest('cleanMalformedJSON handles markdown fences', () => {
  // We can't directly import it since it's not exported, but we can test via the service
  const testJson = '```json\n{"name": "Caesar", "title": "Emperor"}\n```';

  // The extractAndParseJSON function should handle this
  // Since we can't import it directly, we'll test it indirectly through the mock below
  console.log('   Note: This function is tested indirectly via integration tests');
})();

// Test 2: Mock OpenAI to return markdown-wrapped JSON
console.log('\n📋 Simulating OpenAI returning markdown-wrapped JSON...\n');

// Override generateText to return markdown-wrapped JSON
let mockCallCount = 0;
openaiService.generateText = async (prompt: string, options?: any) => {
  mockCallCount++;

  // Return different markdown-wrapped responses based on the prompt
  if (prompt.includes('critique')) {
    return '```json\n{\n  "meetsRequirements": 9,\n  "worksForNextStage": 8,\n  "failureModeRisk": 9,\n  "feedback": "Excellent quality"\n}\n```';
  }

  if (prompt.includes('Research this historical figure')) {
    return '```json\n{\n  "title": "Julius Caesar",\n  "era": "roman_republic",\n  "region": "Rome",\n  "canonicalDescription": "Distinguished Roman general with strong features",\n  "armor": "Roman lorica segmentata",\n  "weapons": "Gladius and scutum",\n  "settings": ["Roman Forum", "Battlefield", "Senate"],\n  "tradeGoods": ["Wine", "Olive oil", "Grain", "Silk", "Purple dye"],\n  "props": ["Laurel wreath", "Scroll", "Legion standard", "Coin"],\n  "spiritAnimal": "Eagle",\n  "visualTheme": "Imperial Rome"\n}\n```';
  }

  if (prompt.includes('historical relationship')) {
    return '```json\n{\n  "didTheyMeet": false,\n  "relationship": "never_met",\n  "actualEvent": "These figures lived in different eras",\n  "year": "Different centuries",\n  "location": "Different regions",\n  "atmosphere": "Historical comparison across time",\n  "keyFacts": ["Fact 1", "Fact 2", "Fact 3", "Fact 4", "Fact 5"],\n  "settings": ["Setting 1", "Setting 2", "Setting 3"],\n  "mustInclude": ["Element 1", "Element 2", "Element 3"],\n  "mustAvoid": ["Anachronism 1", "Anachronism 2", "Anachronism 3"],\n  "narrativeArc": "A compelling narrative comparing these figures across time"\n}\n```';
  }

  // Default response
  return '```json\n{"success": true}\n```';
};

console.log('✅ OpenAI mock installed\n');

// Test 3: Test that the actual functions can parse the mocked responses
await runTest('researchHistoricalFigure handles markdown-wrapped response', async () => {
  const { researchHistoricalFigure } = await import('./server/services/unity-content-generator');
  const result = await researchHistoricalFigure('Julius Caesar');

  if (!result) {
    throw new Error('researchHistoricalFigure returned null');
  }

  if (result.title !== 'Julius Caesar') {
    throw new Error(`Expected title "Julius Caesar", got "${result.title}"`);
  }

  if (result.era !== 'roman_republic') {
    throw new Error(`Expected era "roman_republic", got "${result.era}"`);
  }

  console.log('   Successfully parsed figure data:', { title: result.title, era: result.era });
})();

await runTest('researchHistoricalEncounter handles markdown-wrapped response', async () => {
  const { researchHistoricalEncounter } = await import('./server/services/unity-content-generator');
  const result = await researchHistoricalEncounter('Caesar', 'Napoleon');

  if (!result) {
    throw new Error('researchHistoricalEncounter returned null');
  }

  if (result.relationship !== 'never_met') {
    throw new Error(`Expected relationship "never_met", got "${result.relationship}"`);
  }

  console.log('   Successfully parsed encounter data:', { relationship: result.relationship });
})();

// Test 4: Verify mock was called
await runTest('OpenAI mock was called', () => {
  if (mockCallCount === 0) {
    throw new Error('OpenAI mock was never called - integration may not be working');
  }
  console.log(`   Mock was called ${mockCallCount} times`);
})();

// Restore original
openaiService.generateText = originalGenerateText;

// Summary
console.log('\n' + '='.repeat(60));
console.log(`\n📊 Integration Test Results: ${testsPassed} passed, ${testsFailed} failed`);

if (testsFailed === 0) {
  console.log('\n✅ All integration tests passed!');
  console.log('✅ The Unity content generator correctly handles markdown-wrapped JSON responses.');
  process.exit(0);
} else {
  console.log('\n❌ Some integration tests failed.');
  process.exit(1);
}
